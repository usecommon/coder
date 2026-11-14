// The agent loop: call the model, run the tools it asks for, feed results back, repeat until it stops.
import { realpathSync } from "node:fs";
import type { Config, Effort } from "../config.ts";
import type { AgentEvent, AgentEventInput, Message, StopReason, ToolCall, ToolResult, Usage } from "../core/types.ts";
import { addUsage, emptyUsage } from "../core/types.ts";
import { getProvider, splitModel } from "../provider/index.ts";
import { profiles, rereadCost, weakerWarning } from "../provider/models.ts";
import type { ChatResponse } from "../provider/types.ts";
import { costUsd, DEFAULT_PRICES } from "../provider/pricing.ts";
import { PermissionGate, type Approver, type Mode } from "../safety/permission.ts";
import { detectSandbox, type SandboxKind } from "../safety/sandbox.ts";
import { Session } from "../session/store.ts";
import { adviseTool } from "../tools/advise.ts";
import { BUILTIN_TOOLS, runTool } from "../tools/index.ts";
import { ToolError, type Tool, type ToolContext } from "../tools/types.ts";
import { UndoLog } from "../tools/undo.ts";
import { ADVISOR_SYSTEM, adviceMessage, advisorRequest, changedFiles, handoverMessage, REVIEW_QUESTION, reviewMessage, reviewPassed, stuckQuestion } from "./advisor.ts";
import { compactionCut, summarize } from "./compact.ts";
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

/** The result recorded for a tool call that a cut-off session left without one. */
const INTERRUPTED = "This call did not finish: the session was interrupted while it ran. Whether it took effect is not known, so check before relying on it.";

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
  private baseTools: Tool[];
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
    const all = [...BUILTIN_TOOLS, ...(o.extraTools ?? [])];
    // Helpers get read-only tools plus bash (which runs read-only in plan mode). The tool list stays fixed
    // across modes so the cached prompt prefix survives a /plan ↔ /build switch.
    this.baseTools = o.subagent ? all.filter((t) => (t.readOnly && t.spec.name !== "task") || t.spec.name === "bash") : all;
  }

  /** The tools offered to the model. `advise` is there only while an advisor is configured, and comes last. */
  private get tools(): Tool[] {
    const adv = this.o.cfg.advisor;
    return adv && adv.tool !== false && !this.o.subagent ? [...this.baseTools, adviseTool] : this.baseTools;
  }

  /** The model a turn starts on: the plan model in plan mode when one is set, otherwise the session's model. */
  get turnModel(): string {
    return this.mode === "plan" && !this.o.subagent && this.o.cfg.planModel ? this.o.cfg.planModel : this.model;
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
  async send(text: string, signal?: AbortSignal): Promise<TurnResult> {
    const cfg = this.o.cfg;
    // The model in use. It changes within the turn when a stronger model takes over or a provider keeps failing,
    // and the next turn starts from the session's own model again.
    let ref = this.turnModel;
    splitModel(ref);
    this.undo.beginTurn();
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
    this.session.addMessage({ role: "user", content: first ? `${environmentNote(this.workspace)}\n\n${text}` : text });
    if (!this.session.title) this.session.setTitle(text.split("\n")[0]!.slice(0, 80));

    let turnUsage = emptyUsage();
    let turnCost = 0;
    let finalText = "";
    let stopReason: StopReason = "end_turn";
    let reviewed = false;
    let advisorReviewed = false;
    let stuckConsults = 0;
    let handedOver = false;
    const failed = new Set<string>();
    const maxSteps = this.o.maxSteps ?? cfg.maxSteps;
    const watch = new Watch(maxSteps);

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
      finalText = res.text;
      stopReason = res.stopReason;

      if (res.stopReason === "refusal") {
        this.emit({ type: "notice", level: "warn", text: `The model declined this request${res.detail ? `: ${res.detail}` : ""}.` });
        break;
      }
      if (!res.toolCalls.length) {
        if (res.stopReason === "max_tokens") this.emit({ type: "notice", level: "warn", text: "The reply hit the output token limit." });
        // Self-review: once per turn, if files changed, ask the model to check its work against the request.
        else if (cfg.review && !reviewed && this.undo.changedThisTurn() > 0) {
          reviewed = true;
          this.session.addMessage({ role: "user", content: REVIEW_PROMPT });
          continue;
        }
        // The advisor's review: once per turn, a second model checks the change against the request.
        else if (cfg.advisor?.review && !advisorReviewed && !this.o.subagent && this.undo.changedThisTurn() > 0 && this.consults < (cfg.advisor.maxUses ?? 3) && !signal?.aborted) {
          advisorReviewed = true;
          const report = await this.consult(REVIEW_QUESTION, "to review the finished change", signal, changedFiles(this.workspace, this.undo.changedPaths()));
          if (report && !reviewPassed(report)) {
            this.session.addMessage({ role: "user", content: reviewMessage(cfg.advisor.model, report) });
            continue;
          }
        }
        break;
      }
      const results =
        res.stopReason === "max_tokens"
          ? res.toolCalls.map<ToolResult>((c) => ({ callId: c.id, name: c.name, isError: true, content: "Your output was cut off at the token limit, so this call was not run. Retry with a smaller change." }))
          : await this.runTools(res.toolCalls, signal);
      this.session.addMessage({ role: "tool", results });
      if (step === maxSteps - 1) this.emit({ type: "notice", level: "warn", text: `Stopped after ${maxSteps} steps.` });

      // When the tools show the turn going badly, bring in a second model: advice first, then a handover.
      const sig = this.o.subagent || signal?.aborted || step === maxSteps - 1 ? undefined : watch.step(step, res.toolCalls, results);
      if (sig) {
        const adv = cfg.advisor;
        const up = cfg.escalateModel;
        const canAsk = !!adv && adv.onStuck !== false && this.consults < (adv.maxUses ?? 3);
        const canHandOver = !!up && up !== ref && !handedOver;
        if (canAsk && (stuckConsults === 0 || !canHandOver)) {
          stuckConsults++;
          const advice = await this.consult(stuckQuestion(sig.detail), `because ${sig.detail}`, signal);
          if (advice) {
            this.session.addMessage({ role: "user", content: adviceMessage(adv!.model, sig.detail, advice) });
            watch.rearm();
          }
        } else if (canHandOver) {
          handedOver = true;
          // Knowing when not to switch: a model that is not stronger gains nothing a plain retry would not.
          const weaker = weakerWarning(ref, up!, profiles(cfg.models));
          if (weaker) this.emit({ type: "notice", level: "warn", text: `Not handing over to ${up}: ${weaker}` });
          else {
            const reread = rereadCost(up!, this.lastInputTokens, { ...DEFAULT_PRICES, ...cfg.pricing });
            this.emit({ type: "notice", level: "info", text: `Handing the rest of this turn to ${up} because ${sig.detail}.${reread !== undefined ? ` It reads the session afresh: about ${usd(reread)}.` : ""}` });
            this.session.addMessage({ role: "user", content: handoverMessage(ref, sig.detail) });
            ref = up!;
            watch.rearm();
          }
        }
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

    turnUsage = addUsage(turnUsage, this.consultUsage);
    turnCost += this.consultCost;
    this.emit({ type: "turn_end", usage: turnUsage, costUsd: turnCost, stopReason });
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
          { model, system, messages: this.session.messages, tools: this.tools.map((t) => t.spec), maxTokens: cfg.maxTokens, effort: this.effort ?? cfg.effort, signal },
          {
            onText: (t) => this.emit({ type: "text", text: t }),
            onReasoning: (t) => this.emit({ type: "reasoning", text: t }),
          },
        ),
      signal,
    );
  }

  /** Put a question to the advisor model. It reads the session so far, and for a review the changed files; it
   *  runs nothing. `why` completes "Asked <model> …". Returns its answer, or undefined when there is none (the turn
   *  then goes on without). */
  private async consult(question: string, why: string, signal?: AbortSignal, files?: string): Promise<string | undefined> {
    const adv = this.o.cfg.advisor;
    if (!adv) return undefined;
    this.consults++;
    try {
      const { provider: pid, model } = splitModel(adv.model);
      const provider = getProvider(pid, this.o.cfg);
      const content = advisorRequest(this.session.messages, question, files);
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
              const max = this.o.cfg.advisor!.maxUses ?? 3;
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
    this.session.addUsage(model, r.usage, r.costUsd);
    return r.text || `(the helper finished without an answer; stop reason: ${r.stopReason})`;
  }

  private async maybeCompact(signal?: AbortSignal) {
    if (this.lastInputTokens < this.o.cfg.compactAt) return;
    const msgs = this.session.messages;
    const cut = compactionCut(msgs);
    if (cut < 0) return;
    const model = this.o.cfg.smallModel ?? this.model;
    const { provider: pid, model: m } = splitModel(model);
    try {
      const { summary, usage } = await summarize(getProvider(pid, this.o.cfg), m, msgs.slice(0, cut), signal);
      this.session.addUsage(model, usage, this.price(model, usage));
      this.session.compact(summary, msgs.length - cut);
      this.lastInputTokens = 0;
      this.emit({ type: "compacted", removedMessages: cut });
    } catch (err) {
      this.emit({ type: "notice", level: "warn", text: `Compaction failed: ${(err as Error).message}` });
    }
  }
}
