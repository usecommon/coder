// The agent loop: call the model, run the tools it asks for, feed results back, repeat until it stops.
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import type { AdvisorConfig, Config, Effort } from "../config.ts";
import type { AgentEvent, AgentEventInput, Message, StopReason, ToolCall, ToolResult, Usage } from "../core/types.ts";
import { addUsage, emptyUsage } from "../core/types.ts";
import { getProvider, splitModel } from "../provider/index.ts";
import { profiles, rereadCost, weakerWarning } from "../provider/models.ts";
import type { ChatResponse } from "../provider/types.ts";
import { costUsd, DEFAULT_PRICES } from "../provider/pricing.ts";
import { PermissionGate, type Approver, type Mode } from "../safety/permission.ts";
import { detectSandbox, exec, SEATBELT_WRITABLE, type SandboxKind } from "../safety/sandbox.ts";
import { projectDir, Session } from "../session/store.ts";
import { adviseTool } from "../tools/advise.ts";
import { BUILTIN_TOOLS, runTool } from "../tools/index.ts";
import { scratchDir } from "../tools/bash.ts";
import { ToolError, type Tool, type ToolContext } from "../tools/types.ts";
import { UndoLog } from "../tools/undo.ts";
import { ADVISOR_SYSTEM, adviceMessage, advisorRequest, changes, earlierTurns, freshStartMessage, handoverMessage, OBSERVE_QUESTION, REVIEW_QUESTION, reviewMessage, reviewPassed, stuckQuestion } from "./advisor.ts";
import { compactionCut, summarize } from "./compact.ts";
import { fingerprint, gitChanges, recordGit } from "./workspace-state.ts";
import { LESSON_REQUEST, lessonNote, pickLesson, saveLesson } from "./lessons.ts";
import { Watch } from "./signals.ts";
import { environmentNote, REVIEW_PROMPT, systemPrompt, verifyPrompt } from "./prompt.ts";

export interface AgentOptions {
  cfg: Config;
  workspace: string;
  session: Session;
  approver?: Approver;
  onEvent?: (e: AgentEvent) => void;
  mode?: Mode;
  /** Extra tools, e.g. from MCP servers. */
  extraTools?: Tool[];
  /** Label used in events ("build", "plan", "task:…"). */
  name?: string;
  subagent?: boolean;
  model?: string;
  /** Step limit for this agent (defaults to cfg.maxSteps). */
  maxSteps?: number;
  /** Reasoning effort for this agent (defaults to cfg.effort). */
  effort?: Effort;
  /** First wait before a failed model request is tried again; it triples each time (default 1500 ms). */
  retryDelayMs?: number;
}

export interface SendOptions {
  /** How the advisor's review at the end of this turn is put: its question, and whether it reads the whole session
   *  or only this turn (one step of a plan). Used when `advisor.review` is on. */
  review?: { question: string; scope: "turn" | "session" };
  /** Run the configured check command when this turn ends (default true). Off for the steps of a plan but the last. */
  check?: boolean;
}

/** What the model reads when a check fails. Telling it that it may report a wrong test, instead of bending the code
 *  or the test to pass, cut gaming of tests from 54% to 9% in one study (research/reports, area 5). */
export const checkFailedMessage = (command: string, exitCode: number | null, output: string, round: number, rounds: number) =>
  `The check \`${command}\` failed (${exitCode === null ? "no exit code" : `exit code ${exitCode}`}; check ${round} of ${rounds} this turn):\n\n${output}\n\n` +
  "Find the cause and fix it, then give a brief final summary; the check runs again when you stop. " +
  "Do not edit or delete tests, or special-case their inputs, to make them pass. If you are sure a test is wrong or the request cannot be met, stop and say so instead.";

export interface TurnResult {
  text: string;
  stopReason: StopReason;
  usage: Usage;
  costUsd: number;
}

/** A failure that may pass if tried again, or on another provider: a dropped connection, a timeout, a rate limit, a server error. */
const transient = (err: unknown) => {
  const status = (err as { status?: number }).status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
};

const usd = (n: number) => `$${n.toFixed(n >= 0.01 ? 2 : 4)}`;

/** How often the advisor may be asked in one turn. An advisor that looks in on the work needs more room. */
const maxConsults = (adv: AdvisorConfig) => adv.maxUses ?? (adv.every ? 8 : 3);

/** The result recorded for a tool call that a cut-off session left without one. */
export const INTERRUPTED = "This call did not finish: the session was interrupted while it ran. Whether it took effect is not known, so check before relying on it.";

export class Agent {
  readonly gate: PermissionGate;
  readonly undo = new UndoLog();
  readonly sandbox: SandboxKind;
  readonly workspace: string;
  /** The session's main model. A turn can run on another one: see `turnModel`. */
  model: string;
  /** Reasoning effort; undefined means the configured default. */
  effort?: Effort;
  private lastInputTokens = 0;
  private tools: Tool[];
  /** Consultations of the advisor in the current turn, and what they cost. */
  private consults = 0;
  private consultUsage = emptyUsage();
  private consultCost = 0;

  constructor(private o: AgentOptions) {
    this.workspace = realpathSync(o.workspace);
    this.model = o.model ?? o.cfg.model;
    this.effort = o.effort;
    this.gate = new PermissionGate(o.cfg.permission, o.approver, o.mode ?? "build");
    this.sandbox = o.cfg.sandbox === "off" ? "none" : detectSandbox();
    // Before any model turn: which git repository the workspace is in, if any (see workspace-state.ts).
    // Galley's folder for the project holds the sandbox's /tmp and caches, and Seatbelt lets every command write two
    // system folders: a git folder in any of them is one the model could change.
    recordGit(this.workspace, [projectDir(this.workspace), ...(this.sandbox === "seatbelt" ? SEATBELT_WRITABLE : [])]);
    const all = [...BUILTIN_TOOLS, ...(o.extraTools ?? [])];
    // Helpers get read-only tools plus bash (which runs read-only in plan mode). The tool list stays fixed
    // across modes so the cached prompt prefix survives a /plan ↔ /build switch.
    const base = o.subagent ? all.filter((t) => (t.readOnly && t.spec.name !== "task") || t.spec.name === "bash") : all;
    // `advise` is offered when the session starts with an advisor that allows it. Like the rest of the list it then
    // stays as it is: a tool list that changes mid-session loses the cached prompt, and the newest Claude models
    // reject a history whose tools were edited.
    const adv = o.cfg.advisor;
    this.tools = adv && adv.tool !== false && !o.subagent ? [...base, adviseTool] : base;
  }

  /** Say something to whoever follows the session, without telling the model. */
  note(text: string, level: "info" | "warn" = "info"): void {
    this.emit({ type: "notice", level, text });
  }

  /** The model a turn starts on: the plan model in plan mode when one is set, otherwise the session's model. */
  /** While a model that took over without the transcript is working: where in the session its view starts. */
  private viewFrom?: number;
  /** The size of the whole session when a model took over and began reading only its own part of it. */
  private baseTokens = 0;
  /** Whether a request was answered since the takeover: until then the last size is still the whole session's. */
  private viewAnswered = false;
  /** For the check command, across turns (the steps of a plan are turns, and only the last one is checked): whether a
   *  file tool changed something since the last check, whether a command ran since, and what the files looked like
   *  then. A command that changed nothing (ls, grep, a test run) is no reason to run the check. */
  private unchecked = false;
  private ranCommands = false;
  private undoBefore = 0;
  private checkedPrint?: string;
  private turns = 0;

  /** Where a project's lessons are kept: with the original repository, also when the work is in a worktree. */
  private get lessonsHome(): string {
    return this.session.meta.workspace || this.workspace;
  }

  get turnModel(): string {
    return this.mode === "plan" && !this.o.subagent && this.o.cfg.planModel ? this.o.cfg.planModel : this.model;
  }

  /** The advisor model, if one is configured. */
  get advisor(): string | undefined {
    return this.o.cfg.advisor?.model;
  }

  /** Tokens the last request sent: what another model would have to read after a switch. */
  get contextTokens(): number {
    return this.lastInputTokens;
  }

  get session(): Session {
    return this.o.session;
  }
  get mode(): Mode {
    return this.gate.mode;
  }
  set mode(m: Mode) {
    this.gate.mode = m;
  }
  private get name() {
    return this.o.name ?? this.mode;
  }

  private emit(e: AgentEventInput) {
    this.o.onEvent?.({ ...e, sessionId: this.session.id, agent: this.name } as AgentEvent);
  }

  private price(model: string, u: Usage) {
    return costUsd(model, u, { ...DEFAULT_PRICES, ...this.o.cfg.pricing });
  }

  /** Send one user message and run until the model stops asking for tools. */
  async send(text: string, signal?: AbortSignal, o: SendOptions = {}): Promise<TurnResult> {
    const cfg = this.o.cfg;
    // The model in use. It changes within the turn when a stronger model takes over or a provider keeps failing,
    // and the next turn starts from the session's own model again.
    let ref = this.turnModel;
    splitModel(ref);
    this.endView();
    this.undo.beginTurn();
    if (!this.o.subagent) {
      this.turns++;
      // Written by every front end (run, the REPL, the server), so that a resumed session knows how the last turn ended.
      this.session.setStatus("running");
    }
    this.consults = 0;
    this.consultUsage = emptyUsage();
    this.consultCost = 0;
    // A session cut off while its tools were running (the process was killed, a time limit hit) ends in tool calls
    // without results, and no provider accepts that history. Close them first, and say what is not known.
    const last = this.session.messages.at(-1);
    if (last?.role === "assistant" && last.toolCalls.length > 0)
      this.session.addMessage({ role: "tool", results: last.toolCalls.map((c) => ({ callId: c.id, name: c.name, isError: true, content: INTERRUPTED })) });
    // The system prompt names no project, so a session's first message says where the agent is.
    const first = this.session.messages.length === 0;
    const turnStart = this.session.messages.length;
    // Compaction replaces the start of the session, so the turn's start is found again by its opening message.
    let requestMsg: Message | undefined;
    const turnAt = () => (requestMsg ? this.session.messages.indexOf(requestMsg) : -1);
    // A lesson from earlier work in this project, if one is related to the request and its check proved it.
    const lesson = first && cfg.lessons && cfg.check && !this.o.subagent ? pickLesson(this.workspace, text, this.lessonsHome) : undefined;
    if (lesson) this.emit({ type: "notice", level: "info", text: `Read a note from earlier work in this project: ${lesson.text.slice(0, 120)}` });
    requestMsg = { role: "user", content: first ? `${environmentNote(this.workspace)}\n\n${lesson ? `${lessonNote(lesson)}\n\n` : ""}${text}` : text };
    this.session.addMessage(requestMsg);
    if (!this.session.title) this.session.setTitle(text.split("\n")[0]!.slice(0, 80));

    let turnUsage = emptyUsage();
    let turnCost = 0;
    let finalText = "";
    let stopReason: StopReason = "end_turn";
    let reviewed = false;
    let advisorReviewed = false;
    let stuckConsults = 0;
    let handedOver = false;
    // The check command: whether the model changed anything since the last check, how many checks failed, and the
    // last result, which a reviewing advisor reads beside the diff.
    const checking = !!cfg.check && o.check !== false && !this.o.subagent && this.mode !== "plan";
    const checkRounds = Math.max(0, cfg.checkRounds ?? 3);
    if (cfg.check && !this.o.subagent && this.checkedPrint === undefined) {
      const now = fingerprint(this.workspace);
      this.checkedPrint = now ?? "";
      // A resumed session is checked once, unless its files are as this check last left them, or it never called a
      // tool that can change a file. How its last turn ended says nothing either way: a turn may end cleanly without
      // a check (none configured then, plan mode, a declined one), and edits may follow the last check.
      const last = this.session.lastCheck;
      const asChecked = last?.command === cfg.check && last.print !== undefined && now !== undefined && last.print === now;
      // A tool that can change files, among those the session used: a name no tool has is none.
      const writes = (names: Set<string>, files = false) =>
        [...names].some((n) => {
          if (files && (n === "bash" || n.startsWith("mcp_"))) return false;
          const t = this.tools.find((t) => t.spec.name === n);
          return t !== undefined && !t.readOnly;
        });
      // A file tool's write since that check is a change even where the fingerprint does not look (build folders).
      if (turnStart > 0 && writes(this.session.toolsUsed) && (!asChecked || writes(this.session.toolsSinceCheck, true))) this.unchecked = true;
    }
    let checkFails = 0;
    let checkReport: string | undefined;
    let lastFailure: string | undefined;
    /** Hand the rest of the turn to the stronger model, if there is one that has not taken over yet and the profiles
     *  do not say it is weaker. `check` is the failed check's message, shown to it. True if it took over. */
    const handOver = (why: string, record: (acted: "handover" | "none") => void, check?: string): boolean => {
      const up = cfg.escalateModel;
      if (!up || up === ref || handedOver) return false;
      handedOver = true;
      // Knowing when not to switch: a model that is not stronger gains nothing a plain retry would not.
      const weaker = weakerWarning(ref, up, profiles(cfg.models));
      if (weaker) {
        this.emit({ type: "notice", level: "warn", text: `Not handing over to ${up}: ${weaker}` });
        return false;
      }
      record("handover");
      const reread = rereadCost(up, this.lastInputTokens, { ...DEFAULT_PRICES, ...cfg.pricing });
      if (cfg.escalateContext === "transcript") {
        this.emit({ type: "notice", level: "info", text: `Handing the rest of this turn to ${up} because ${why}.${reread !== undefined ? ` It reads the session afresh: about ${usd(reread)}.` : ""}` });
        this.session.addMessage({ role: "user", content: handoverMessage(ref, why) + (check ? `\n\n${check}` : "") });
      } else {
        // The stronger model starts from the request and the files, not from the attempt that went wrong.
        this.emit({ type: "notice", level: "info", text: `Handing the rest of this turn to ${up} because ${why}. It starts from the request and the files as they are now.` });
        // Earlier turns only: if compaction has taken this turn's opening message, a summary would cover this
        // attempt too, so nothing earlier is quoted.
        const at = turnAt();
        const earlier = at > 0 ? earlierTurns(this.session.messages.slice(0, at)) : "";
        // What changed: git's view where there is one (it sees what commands and earlier turns did too), else
        // the file tools' own record.
        const files = gitChanges(this.workspace) || changes(this.workspace, this.undo.snapshots(), 20_000);
        // If it is not shown a failed check, it may stop having changed nothing: the check runs again then, and its
        // failure reaches it.
        if (checking && lastFailure !== undefined) this.unchecked = true;
        this.baseTokens = this.lastInputTokens;
        this.viewFrom = this.session.messages.length;
        this.session.addMessage({
          role: "user",
          content: freshStartMessage({ from: ref, why, request: text, earlier: earlier || undefined, files, environment: environmentNote(this.workspace), check }),
        });
      }
      ref = up;
      watch.rearm();
      return true;
    };
    const failed = new Set<string>();
    const maxSteps = this.o.maxSteps ?? cfg.maxSteps;
    const watch = new Watch(maxSteps);
    // An advisor that looks in on the work: how many steps since its last look, how long until the next, and from
    // where in the session the next look reads.
    let sinceLook = 0;
    let lookAfter = cfg.advisor?.every ?? 0;
    let lookFrom = turnStart;

    passes: for (let pass = 0; pass < 2; pass++) {
    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) {
        stopReason = "other";
        break;
      }
      await this.maybeCompact(signal);
      const system = systemPrompt({ workspace: this.workspace, mode: this.mode, sandbox: this.sandbox, subagent: this.o.subagent });
      let res: ChatResponse;
      try {
        ({ res, ref } = await this.chat(ref, system, signal, failed));
      } catch (err) {
        if (signal?.aborted) {
          stopReason = "other";
          break;
        }
        this.emit({ type: "notice", level: "error", text: (err as Error).message });
        stopReason = "error";
        break;
      }

      const assistant: Message = { role: "assistant", content: res.text, toolCalls: res.toolCalls, reasoning: res.reasoning, raw: res.raw };
      this.session.addMessage(assistant);
      const cost = this.price(ref, res.usage);
      this.session.addUsage(ref, res.usage, cost);
      turnUsage = addUsage(turnUsage, res.usage);
      turnCost += cost;
      this.lastInputTokens = res.usage.inputTokens + res.usage.cacheReadTokens + res.usage.cacheWriteTokens;
      if (this.viewFrom !== undefined) this.viewAnswered = true;
      finalText = res.text;
      stopReason = res.stopReason;

      if (res.stopReason === "refusal") {
        this.emit({ type: "notice", level: "warn", text: `The model declined this request${res.detail ? `: ${res.detail}` : ""}.` });
        break;
      }
      if (!res.toolCalls.length) {
        if (res.stopReason === "max_tokens") this.emit({ type: "notice", level: "warn", text: "The reply hit the output token limit." });
        else {
          // The check: run the project's own test command and feed a failure back. Running code is the one feedback
          // that does not rest on a model's opinion (research/reports, areas 2 and 5).
          if (checking && !signal?.aborted && this.changedSinceCheck()) {
            const r = await this.runCheck(cfg.check!, signal);
            // A check cut short leaves the files as unchecked as they were.
            if (signal?.aborted) {
              stopReason = "other";
              break;
            }
            this.unchecked = false;
            this.ranCommands = false;
            this.checkedPrint = fingerprint(this.workspace) ?? "";
            // A check the user declined to run is no failure to feed back.
            if (r.skipped !== undefined) {
              // The last report is of earlier files: a reviewer must not read it as this change's.
              checkReport = undefined;
              this.emit({ type: "notice", level: "warn", text: `The check was not run: ${r.skipped}` });
            }
            else {
              checkReport = `$ ${cfg.check}\n${r.output}\n[exit code ${r.exitCode ?? "none"}]`;
              const passed = r.exitCode === 0 && !r.timedOut;
              this.session.addCheck({ command: cfg.check!, exitCode: r.exitCode, passed, round: checkFails + 1, turn: this.turns, print: this.checkedPrint || undefined });
              if (passed && checkFails > 0 && cfg.lessons && lastFailure !== undefined) await this.learn(cfg.check!, lastFailure, signal);
              if (signal?.aborted) {
                stopReason = "other";
                break;
              }
              if (passed) {
                this.emit({ type: "notice", level: "info", text: `Check passed: ${cfg.check}` });
                // A failure is learnt from once. The count of failures goes on: checkRounds is per turn.
                lastFailure = undefined;
              } else if (step === maxSteps - 1) {
                // No step is left to fix it in: say so, and do not leave a message the model never answers.
                this.emit({ type: "notice", level: "warn", text: `Check failed and the step limit is reached: ${cfg.check}` });
                stopReason = "other";
                break;
              } else if (checkFails < checkRounds) {
                checkFails++;
                lastFailure = r.output;
                this.emit({ type: "notice", level: "warn", text: `Check failed (${checkFails} of ${checkRounds}): ${cfg.check}` });
                const failed = checkFailedMessage(cfg.check!, r.exitCode, r.output, checkFails, checkRounds);
                // A check that keeps failing: the stronger model takes over, shown the failure.
                const after = cfg.escalateOnCheck ?? 2;
                const why = `the project's check has failed ${checkFails} times in this turn`;
                const record = (acted: "handover" | "none") => this.session.addSignal({ kind: "check-failing", detail: why, step, model: ref, acted });
                if (after > 0 && checkFails >= after && !this.o.subagent && handOver(why, record, failed)) continue;
                this.session.addMessage({ role: "user", content: failed });
                continue;
              } else {
                this.emit({ type: "notice", level: "warn", text: `Check still failing after ${checkRounds} rounds: ${cfg.check}` });
                break;
              }
            }
          }
          // Self-review: once per turn, if files changed, ask the model to check its work against the request.
          // No review when no step is left to act on it, or after an abort: it would be a message nobody answers.
          if (cfg.review && !reviewed && step < maxSteps - 1 && !signal?.aborted && this.undo.changedThisTurn() > 0) {
            reviewed = true;
            this.session.addMessage({ role: "user", content: REVIEW_PROMPT });
            continue;
          }
          // The advisor's review: once per turn, a second model checks the change against the request.
          else if (cfg.advisor?.review && !advisorReviewed && !this.o.subagent && step < maxSteps - 1 && this.undo.changedThisTurn() > 0 && this.consults < maxConsults(cfg.advisor) && !signal?.aborted) {
            advisorReviewed = true;
            const scoped = o.review?.scope === "turn";
            const diff = changes(this.workspace, this.undo.snapshots());
            const files = checkReport ? `${diff}\n\nThe project's check, run after this change:\n${checkReport}` : diff;
            const report = await this.consult(o.review?.question ?? REVIEW_QUESTION, scoped ? "to review this step" : "to review the finished change", signal, files, scoped ? Math.max(1, turnAt()) : undefined);
            if (report && !reviewPassed(report)) {
              this.session.addMessage({ role: "user", content: reviewMessage(cfg.advisor.model, report) });
              continue;
            }
          }
        }
        break;
      }
      this.undoBefore = this.undo.writes;
      const results =
        res.stopReason === "max_tokens"
          ? res.toolCalls.map<ToolResult>((c) => ({ callId: c.id, name: c.name, isError: true, content: "Your output was cut off at the token limit, so this call was not run. Retry with a smaller change." }))
          : await this.runTools(res.toolCalls, signal);
      this.session.addMessage({ role: "tool", results });
      for (const c of res.toolCalls) {
        // A command, or a tool from an MCP server: whether it changed a file is measured, not assumed.
        if (c.name === "bash" || c.name.startsWith("mcp_")) this.ranCommands = true;
        else if (!this.tools.find((t) => t.spec.name === c.name)?.readOnly && results.some((r) => r.callId === c.id && !r.isError)) {
          // A write to a workspace file is known to be a change (the file tools record each one); a write to the
          // scratch folder is not recorded, and is measured instead.
          if (this.undo.writes > this.undoBefore) this.unchecked = true;
          else this.ranCommands = true;
        }
      }
      if (step === maxSteps - 1) this.emit({ type: "notice", level: "warn", text: `Stopped after ${maxSteps} steps.` });

      // When the tools show the turn going badly, bring in a second model: advice first, then a handover.
      const sig = this.o.subagent || signal?.aborted || step === maxSteps - 1 ? undefined : watch.step(step, res.toolCalls, results);
      if (sig) {
        const adv = cfg.advisor;
        const up = cfg.escalateModel;
        const canAsk = !!adv && adv.onStuck !== false && this.consults < maxConsults(adv);
        const canHandOver = !!up && up !== ref && !handedOver;
        const asking = canAsk && (stuckConsults === 0 || !canHandOver);
        const handing = !asking && canHandOver && !weakerWarning(ref, up!, profiles(cfg.models));
        // Recorded with what was actually done: advice that never arrived is no intervention.
        const record = (acted: "advice" | "handover" | "none") => this.session.addSignal({ kind: sig.kind, detail: sig.detail, step, model: ref, acted });
        if (!asking && !handing) record("none");
        if (asking) {
          stuckConsults++;
          const advice = await this.consult(stuckQuestion(sig.detail), `because ${sig.detail}`, signal);
          record(advice ? "advice" : "none");
          if (advice) {
            this.session.addMessage({ role: "user", content: adviceMessage(adv!.model, sig.detail, advice) });
            watch.rearm();
          }
        } else if (canHandOver) handOver(sig.detail, record);
        sinceLook = 0;
        lookFrom = this.session.messages.length;
      } else if (cfg.advisor?.every && !this.o.subagent && !signal?.aborted && step < maxSteps - 1 && ++sinceLook >= lookAfter && this.consults < maxConsults(cfg.advisor)) {
        // A look at work in progress. Guidance during a run is where an observer was measured to help most, and the
        // interval that worked adapts: sooner again after a finding, later after none (research/multi-model-methods.md).
        const adv = cfg.advisor;
        const from = lookFrom;
        sinceLook = 0;
        lookFrom = this.session.messages.length;
        const view = await this.consult(OBSERVE_QUESTION, "to look at the work so far", signal, changes(this.workspace, this.undo.snapshots()), from);
        if (view && !reviewPassed(view)) {
          this.session.addMessage({ role: "user", content: adviceMessage(adv.model, "it looks in on the work every few steps", view) });
          lookAfter = adv.every!;
        } else if (view) lookAfter = Math.min(lookAfter + 2, adv.every! * 4);
      }
    }

      // Independent verification: a fresh read-only helper checks the change against the request.
      if (pass === 0 && cfg.verify && !this.o.subagent && stopReason === "end_turn" && this.undo.changedThisTurn() > 0 && !signal?.aborted) {
        const report = await this.runSubagent("verify the change", verifyPrompt(text), signal, { maxSteps: 12 });
        if (/VERDICT:\s*FAIL/i.test(report)) {
          this.emit({ type: "notice", level: "info", text: "An independent check found problems; fixing them." });
          this.session.addMessage({
            role: "user",
            content: `An independent reviewer checked your change against the request and reported:\n\n${report}\n\nCheck each point yourself (the reviewer can be wrong). Fix the real problems, re-run your checks, and give a brief final summary.`,
          });
          continue passes;
        }
      }
      break;
    }

    this.endView();
    turnUsage = addUsage(turnUsage, this.consultUsage);
    turnCost += this.consultCost;
    this.emit({ type: "turn_end", usage: turnUsage, costUsd: turnCost, stopReason });
    if (!this.o.subagent) this.session.setStatus(stopReason === "error" ? "error" : "done", stopReason);
    return { text: finalText, stopReason, usage: turnUsage, costUsd: turnCost };
  }

  /** One request to the model in use. When its provider keeps failing, the configured fallbacks are tried in order,
   *  and the one that answers serves the rest of the turn. Returns the model that answered. */
  private async chat(ref: string, system: string, signal: AbortSignal | undefined, failed: Set<string>): Promise<{ res: ChatResponse; ref: string }> {
    for (;;) {
      try {
        return { res: await this.chatWithRetry(ref, system, signal), ref };
      } catch (err) {
        failed.add(ref);
        const next = signal?.aborted || !transient(err) ? undefined : (this.o.cfg.fallbackModels ?? []).find((m) => !failed.has(m));
        if (!next) throw err;
        this.emit({ type: "notice", level: "warn", text: `${ref} keeps failing (${(err as Error).message.slice(0, 120)}); using ${next} for the rest of this turn.` });
        ref = next;
      }
    }
  }

  /** Run a model request, trying again twice with a growing wait when the failure may pass (dropped connections, 429, 5xx). */
  private async withRetry<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (err) {
        if (signal?.aborted || !transient(err) || attempt >= 2) throw err;
        this.emit({ type: "notice", level: "warn", text: `Model request failed (${(err as Error).message.slice(0, 120)}); retrying.` });
        await new Promise((r) => setTimeout(r, (this.o.retryDelayMs ?? 1500) * 3 ** attempt));
      }
    }
  }

  private chatWithRetry(ref: string, system: string, signal?: AbortSignal) {
    const cfg = this.o.cfg;
    const { provider: pid, model } = splitModel(ref);
    const provider = getProvider(pid, cfg);
    return this.withRetry(
      () =>
        provider.chat(
          { model, system, messages: this.viewFrom === undefined ? this.session.messages : this.session.messages.slice(this.viewFrom), tools: this.tools.map((t) => t.spec), maxTokens: cfg.maxTokens, effort: this.effort ?? cfg.effort, signal },
          {
            onText: (t) => this.emit({ type: "text", text: t }),
            onReasoning: (t) => this.emit({ type: "reasoning", text: t }),
          },
        ),
      signal,
    );
  }

  /** Ask the advisor between turns, for the review of a plan. `from` is where in the session it starts reading.
   *  Returns its answer and what the question cost, or nothing when there is no reviewing advisor. */
  async review(question: string, why: string, from: number, signal?: AbortSignal): Promise<{ text?: string; usage: Usage; costUsd: number } | undefined> {
    if (!this.o.cfg.advisor?.review || this.o.subagent) return undefined;
    const [usage, cost] = [this.consultUsage, this.consultCost];
    this.consultUsage = emptyUsage();
    this.consultCost = 0;
    const text = await this.consult(question, why, signal, undefined, from);
    const out = { text, usage: this.consultUsage, costUsd: this.consultCost };
    [this.consultUsage, this.consultCost] = [usage, cost];
    return out;
  }

  /** Put a question to the advisor model. It reads the session so far, and for a review the changed files; it
   *  runs nothing. `why` completes "Asked <model> …". Returns its answer, or undefined when there is none (the turn
   *  then goes on without). */
  private async consult(question: string, why: string, signal?: AbortSignal, files?: string, from?: number): Promise<string | undefined> {
    const adv = this.o.cfg.advisor;
    if (!adv) return undefined;
    this.consults++;
    try {
      const { provider: pid, model } = splitModel(adv.model);
      const provider = getProvider(pid, this.o.cfg);
      const content = advisorRequest(this.session.messages, question, files, from);
      const res = await this.withRetry(
        () => provider.chat({ model, system: ADVISOR_SYSTEM, messages: [{ role: "user", content }], tools: [], maxTokens: adv.maxTokens ?? 16_000, effort: adv.effort ?? "high", signal }),
        signal,
      );
      const cost = this.price(adv.model, res.usage);
      this.session.addUsage(adv.model, res.usage, cost);
      this.consultUsage = addUsage(this.consultUsage, res.usage);
      this.consultCost += cost;
      const text = res.text.trim();
      if (text) this.emit({ type: "notice", level: "info", text: `Asked ${adv.model} ${why} (${usd(cost)}).` });
      else this.emit({ type: "notice", level: "warn", text: `${adv.model} was asked ${why} and gave no answer (${usd(cost)}).` });
      return text || undefined;
    } catch (err) {
      if (!signal?.aborted) this.emit({ type: "notice", level: "warn", text: `The advisor ${adv.model} could not be reached: ${(err as Error).message.slice(0, 120)}` });
      return undefined;
    }
  }

  private async runTools(calls: ToolCall[], signal?: AbortSignal): Promise<ToolResult[]> {
    const ctx: ToolContext = {
      workspace: this.workspace,
      cwd: this.workspace,
      cfg: this.o.cfg,
      gate: this.gate,
      sandbox: this.sandbox,
      undo: this.undo,
      signal,
      // Helpers search and report, which takes little reasoning. Left at the main agent's effort, a cheap model has
      // spent tens of thousands of reasoning tokens in one helper (bench/RESULTS-fresh.md).
      runSubagent: this.o.subagent ? undefined : (d, p) => this.runSubagent(d, p, signal, { effort: "low" }),
      consult:
        this.o.cfg.advisor && !this.o.subagent
          ? async (q) => {
              const max = maxConsults(this.o.cfg.advisor!);
              if (this.consults >= max) throw new ToolError(`The advisor has been asked ${max} times this turn, which is the limit. Decide with what you have.`);
              const advice = await this.consult(q, "at the model's request", signal);
              if (!advice) throw new ToolError("The advisor could not be reached. Decide with what you have.");
              return advice;
            }
          : undefined,
    };
    const one = async (c: ToolCall) => {
      this.emit({ type: "tool_start", call: c });
      const r = await runTool(this.tools, c, ctx);
      this.emit({ type: "tool_end", result: r });
      return r;
    };
    // Read-only calls (including sub-agents) run in parallel; anything that changes files runs in order.
    const readOnly = calls.every((c) => this.tools.find((t) => t.spec.name === c.name)?.readOnly);
    if (readOnly) return Promise.all(calls.map(one));
    const out: ToolResult[] = [];
    for (const c of calls) out.push(await one(c));
    return out;
  }

  private async runSubagent(description: string, prompt: string, signal?: AbortSignal, o: { maxSteps?: number; effort?: Effort } = {}): Promise<string> {
    const model = this.o.cfg.smallModel ?? this.model;
    const child = new Agent({
      ...this.o,
      session: Session.create(this.workspace, model, this.session.id),
      mode: "plan",
      subagent: true,
      name: `task:${description}`,
      model,
      maxSteps: o.maxSteps,
      effort: o.effort,
    });
    child.session.setTitle(`task: ${description}`);
    const r = await child.send(prompt, signal);
    // Roll the helper's cost into the parent session's totals.
    this.session.addUsage(model, r.usage, r.costUsd, { helper: child.session.id });
    return r.text || `(the helper finished without an answer; stop reason: ${r.stopReason})`;
  }

  /** Write one lesson after a failing check came to pass: one short request to the helper model. */
  private async learn(check: string, failure: string, signal?: AbortSignal) {
    const model = this.o.cfg.smallModel ?? this.model;
    try {
      const { provider: pid, model: m } = splitModel(model);
      const files = changes(this.workspace, this.undo.snapshots(), 12_000);
      const content = `<check_failure>\n$ ${check}\n${failure.slice(-4000) || "(no output; it exited with an error)"}\n</check_failure>\n\n<files_changed>\n${files}\n</files_changed>\n\n${LESSON_REQUEST}`;
      const res = await this.withRetry(() => getProvider(pid, this.o.cfg).chat({ model: m, system: "You write short, precise notes for coding agents.", messages: [{ role: "user", content }], tools: [], maxTokens: 2000, effort: "low", signal }), signal);
      const cost = this.price(model, res.usage);
      this.session.addUsage(model, res.usage, cost);
      // Counted in the turn's cost, like the advisor's.
      this.consultUsage = addUsage(this.consultUsage, res.usage);
      this.consultCost += cost;
      const text = res.text.trim().replace(/\s+/g, " ");
      if (!text || /^NONE\.?$/i.test(text)) return;
      // Files that still exist: one written and removed again in the turn would make the lesson never picked.
      const changed = this.undo.snapshots().filter((s) => existsSync(s.path)).map((s) => relative(this.workspace, s.path)).filter((p) => p && !p.startsWith(".."));
      saveLesson(this.lessonsHome, { text: text.slice(0, 300), check, files: changed, at: new Date().toISOString() });
      this.emit({ type: "notice", level: "info", text: `Kept a note for this project: ${text.slice(0, 120)}` });
    } catch (err) {
      if (!signal?.aborted) this.emit({ type: "notice", level: "warn", text: `Could not write a note for this project: ${(err as Error).message.slice(0, 120)}` });
    }
  }

  /** Back to the whole session after a takeover. The last request's size covered only the taken-over part, so the
   *  rest is added back: otherwise the next turn sends the whole session without compacting it first. */
  private endView() {
    if (this.viewFrom !== undefined && this.viewAnswered) this.lastInputTokens += this.baseTokens;
    this.baseTokens = 0;
    this.viewAnswered = false;
    this.viewFrom = undefined;
  }

  /** Whether the files may have changed since the check last ran: a file tool wrote, or a command ran and the
   *  workspace no longer looks as it did. When the workspace cannot be fingerprinted, any command counts. */
  private changedSinceCheck(): boolean {
    if (this.unchecked) return true;
    if (!this.ranCommands) return false;
    const now = fingerprint(this.workspace);
    return now === undefined || now !== this.checkedPrint;
  }

  /** Run the check command in the sandbox, as the bash tool would. Without a sandbox it runs code the model may have
   *  written with the user's own rights and network, so then it asks first, as the bash tool does. */
  private async runCheck(command: string, signal?: AbortSignal) {
    const kind = this.o.cfg.sandbox === "off" ? "none" : this.sandbox;
    // Zero, a negative value or one past what a timer can hold would kill every check at once.
    const raw = this.o.cfg.checkTimeout;
    const secs = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.min(raw, 86_400) : 300;
    if (kind === "none") {
      const ok = await this.gate.check({ tool: "bash", subject: command, reason: "the check runs without a sandbox" }, "ask");
      if (!ok.ok) return { output: "", exitCode: null, timedOut: false, skipped: ok.why };
    }
    const cacheDir = join(projectDir(this.workspace), "cache");
    const tmpDir = scratchDir(this.workspace);
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
    const r = await exec(command, {
      cwd: this.workspace,
      workspace: this.workspace,
      readOnly: false,
      network: false,
      timeoutMs: secs * 1000,
      signal,
      kind,
      keepTail: true,
      cacheDir,
      tmpDir,
    });
    // Keep the start and, above all, the end: test runners print their summary last.
    const max = this.o.cfg.maxToolOutput;
    const all = r.output.trimEnd();
    let output = all.length > max ? `${all.slice(0, Math.floor(max / 3))}\n[… ${all.length - max} characters left out …]\n${all.slice(all.length - Math.ceil((2 * max) / 3))}` : all;
    if (r.timedOut) output += `\n[timed out after ${secs}s]`;
    return { output, exitCode: r.exitCode, timedOut: r.timedOut, skipped: undefined as string | undefined };
  }

  private async maybeCompact(signal?: AbortSignal) {
    if (this.lastInputTokens < this.o.cfg.compactAt) return;
    const msgs = this.session.messages;
    // A model that took over reads only its own part of the session, from its opening message on. That part is
    // compacted on its own: the opening message stays, the oldest of the rest becomes a summary, and the earlier
    // attempt is neither summarised into its view nor lost from the session.
    const from = this.viewFrom === undefined ? 0 : this.viewFrom + 1;
    const cut = compactionCut(msgs.slice(from));
    if (cut < 0) return;
    const model = this.o.cfg.smallModel ?? this.model;
    const { provider: pid, model: m } = splitModel(model);
    try {
      const { summary, usage } = await summarize(getProvider(pid, this.o.cfg), m, msgs.slice(from, from + cut), signal);
      this.session.addUsage(model, usage, this.price(model, usage));
      if (from) this.session.compactRange(summary, from, from + cut);
      else this.session.compact(summary, msgs.length - cut);
      this.lastInputTokens = 0;
      this.emit({ type: "compacted", removedMessages: cut });
    } catch (err) {
      this.emit({ type: "notice", level: "warn", text: `Compaction failed: ${(err as Error).message}` });
    }
  }
}
