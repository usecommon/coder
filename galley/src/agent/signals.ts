// Signs that a turn is going badly, read from what the tools returned. They decide when a second model is asked or
// takes over. A model is a poor judge of whether it is stuck, so none of this asks it
// (research/model-switching.md, section 4).
import type { ToolCall, ToolResult } from "../core/types.ts";

export type SignalKind = "same-check" | "same-call" | "tool-errors" | "long-run";

export interface Signal {
  kind: SignalKind;
  /** Reads as the end of "… because <detail>". */
  detail: string;
}

/** How often a thing must happen before it counts. */
export const LIMITS = { sameCheck: 3, sameCall: 3, toolErrors: 4, longRun: 2 / 3 };

const exitCode = (r: ToolResult): number | "none" | undefined => {
  const m = /\[exit code (\d+|none)\]\s*$/.exec(r.content);
  return m ? (m[1] === "none" ? "none" : Number(m[1])) : undefined;
};

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

export class Watch {
  /** Command → how many times in a row it has failed. */
  private failing = new Map<string, number>();
  /** Call → its last result and how many times in a row it has returned exactly that. */
  private repeats = new Map<string, { result: string; n: number }>();
  private errorRun = 0;
  private fired = new Set<SignalKind>();

  constructor(private maxSteps: number) {}

  /** Record one step's calls and their results. Returns a signal the first time a limit is reached. */
  step(index: number, calls: ToolCall[], results: ToolResult[]): Signal | undefined {
    const found: Signal[] = [];
    for (const r of results) {
      const call = calls.find((c) => c.id === r.callId);
      const key = `${r.name} ${call?.rawInput ?? ""}`;

      // The same command failing again and again: an edit-and-test loop that is not converging.
      if (r.name === "bash" && typeof call?.input?.command === "string") {
        const where = typeof call.input.path === "string" ? `[in ${call.input.path}] ` : "";
        const cmd = where + call.input.command.trim().replace(/\s+/g, " ");
        const code = exitCode(r);
        if (code === 0) this.failing.delete(cmd);
        else if (code !== undefined) {
          const n = (this.failing.get(cmd) ?? 0) + 1;
          this.failing.set(cmd, n);
          if (n === LIMITS.sameCheck) found.push({ kind: "same-check", detail: `the command \`${short(cmd)}\` has failed ${n} times in a row` });
        }
      }

      // The same call with the same answer: nothing new is being learned.
      const prev = this.repeats.get(key);
      const n = prev && prev.result === r.content ? prev.n + 1 : 1;
      this.repeats.set(key, { result: r.content, n });
      if (n === LIMITS.sameCall) found.push({ kind: "same-call", detail: `the same ${r.name} call has returned the same result ${n} times` });

      // Calls the tools refuse (bad arguments, text to replace not found): trouble with the tools themselves.
      // A command that ran and failed is not one of these.
      this.errorRun = r.isError ? this.errorRun + 1 : 0;
      if (this.errorRun === LIMITS.toolErrors) found.push({ kind: "tool-errors", detail: `${this.errorRun} tool calls in a row were refused` });
    }
    if (index + 1 === Math.floor(this.maxSteps * LIMITS.longRun)) found.push({ kind: "long-run", detail: `${index + 1} of at most ${this.maxSteps} steps are used and the work is not finished` });

    const sig = found.find((s) => !this.fired.has(s.kind));
    if (sig) this.fired.add(sig.kind);
    return sig;
  }

  /** After help was given: forget the counts, so the same trouble counts again from zero and can be reported again. */
  rearm(): void {
    this.failing.clear();
    this.repeats.clear();
    this.errorRun = 0;
    this.fired.delete("same-check");
    this.fired.delete("same-call");
    this.fired.delete("tool-errors");
  }
}
