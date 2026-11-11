// The agent loop: call the model, run the tools it asks for, feed results back, repeat until it stops.
import { realpathSync } from "node:fs";
import type { Config } from "../config.ts";
import type { AgentEvent, AgentEventInput, Message, StopReason, ToolCall, ToolResult, Usage } from "../core/types.ts";
import { addUsage, emptyUsage } from "../core/types.ts";
import { getProvider, splitModel } from "../provider/index.ts";
import type { Provider } from "../provider/types.ts";
import { costUsd, DEFAULT_PRICES } from "../provider/pricing.ts";
import { PermissionGate, type Approver, type Mode } from "../safety/permission.ts";
import { detectSandbox, type SandboxKind } from "../safety/sandbox.ts";
import { Session } from "../session/store.ts";
import { BUILTIN_TOOLS, runTool } from "../tools/index.ts";
import type { Tool, ToolContext } from "../tools/types.ts";
import { UndoLog } from "../tools/undo.ts";
import { compactionCut, summarize } from "./compact.ts";
import { REVIEW_PROMPT, systemPrompt, verifyPrompt } from "./prompt.ts";

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
}

export interface TurnResult {
  text: string;
  stopReason: StopReason;
  usage: Usage;
  costUsd: number;
}

export class Agent {
  readonly gate: PermissionGate;
  readonly undo = new UndoLog();
  readonly sandbox: SandboxKind;
  readonly workspace: string;
  model: string;
  private lastInputTokens = 0;
  private tools: Tool[];

  constructor(private o: AgentOptions) {
    this.workspace = realpathSync(o.workspace);
    this.model = o.model ?? o.cfg.model;
    this.gate = new PermissionGate(o.cfg.permission, o.approver, o.mode ?? "build");
    this.sandbox = o.cfg.sandbox === "off" ? "none" : detectSandbox();
    const all = [...BUILTIN_TOOLS, ...(o.extraTools ?? [])];
    // Helpers get read-only tools plus bash (which runs read-only in plan mode). The tool list stays fixed
    // across modes so the cached prompt prefix survives a /plan ↔ /build switch.
    this.tools = o.subagent ? all.filter((t) => (t.readOnly && t.spec.name !== "task") || t.spec.name === "bash") : all;
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
    const { provider: pid, model } = splitModel(this.model);
    const provider = getProvider(pid, cfg);
    this.undo.beginTurn();
    this.session.addMessage({ role: "user", content: text });
    if (!this.session.title) this.session.setTitle(text.split("\n")[0]!.slice(0, 80));

    let turnUsage = emptyUsage();
    let turnCost = 0;
    let finalText = "";
    let stopReason: StopReason = "end_turn";
    let reviewed = false;

    passes: for (let pass = 0; pass < 2; pass++) {
    for (let step = 0; step < cfg.maxSteps; step++) {
      if (signal?.aborted) {
        stopReason = "other";
        break;
      }
      await this.maybeCompact(signal);
      const system = systemPrompt({ workspace: this.workspace, mode: this.mode, sandbox: this.sandbox, subagent: this.o.subagent });
      let res;
      try {
        res = await this.chatWithRetry(provider, model, system, signal);
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
      const cost = this.price(this.model, res.usage);
      this.session.addUsage(this.model, res.usage, cost);
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
        break;
      }
      const results =
        res.stopReason === "max_tokens"
          ? res.toolCalls.map<ToolResult>((c) => ({ callId: c.id, name: c.name, isError: true, content: "Your output was cut off at the token limit, so this call was not run. Retry with a smaller change." }))
          : await this.runTools(res.toolCalls, signal);
      this.session.addMessage({ role: "tool", results });
      if (step === cfg.maxSteps - 1) this.emit({ type: "notice", level: "warn", text: `Stopped after ${cfg.maxSteps} steps.` });
    }

      // Independent verification: a fresh read-only helper checks the change against the request.
      if (pass === 0 && cfg.verify && !this.o.subagent && stopReason === "end_turn" && this.undo.changedThisTurn() > 0 && !signal?.aborted) {
        const report = await this.runSubagent("verify the change", verifyPrompt(text), signal);
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

    this.emit({ type: "turn_end", usage: turnUsage, costUsd: turnCost, stopReason });
    return { text: finalText, stopReason, usage: turnUsage, costUsd: turnCost };
  }

  /** Call the model, retrying transient failures (dropped connections, 429, 5xx) twice with backoff. */
  private async chatWithRetry(provider: Provider, model: string, system: string, signal?: AbortSignal) {
    const cfg = this.o.cfg;
    for (let attempt = 0; ; attempt++) {
      try {
        return await provider.chat(
          { model, system, messages: this.session.messages, tools: this.tools.map((t) => t.spec), maxTokens: cfg.maxTokens, effort: cfg.effort, signal },
          {
            onText: (t) => this.emit({ type: "text", text: t }),
            onReasoning: (t) => this.emit({ type: "reasoning", text: t }),
          },
        );
      } catch (err) {
        const status = (err as { status?: number }).status;
        const transient = status === undefined || status === 408 || status === 429 || status >= 500;
        if (signal?.aborted || !transient || attempt >= 2) throw err;
        this.emit({ type: "notice", level: "warn", text: `Model request failed (${(err as Error).message.slice(0, 120)}); retrying.` });
        await new Promise((r) => setTimeout(r, 1500 * 3 ** attempt));
      }
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
      runSubagent: this.o.subagent ? undefined : (d, p) => this.runSubagent(d, p, signal),
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

  private async runSubagent(description: string, prompt: string, signal?: AbortSignal): Promise<string> {
    const model = this.o.cfg.smallModel ?? this.model;
    const child = new Agent({
      ...this.o,
      session: Session.create(this.workspace, model, this.session.id),
      mode: "plan",
      subagent: true,
      name: `task:${description}`,
      model,
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
