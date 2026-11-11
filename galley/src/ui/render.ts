// Terminal rendering of agent events.
import type { AgentEvent, ToolCall } from "../core/types.ts";

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = { dim: paint("2"), bold: paint("1"), red: paint("31"), green: paint("32"), yellow: paint("33"), cyan: paint("36"), magenta: paint("35") };

export function describeCall(call: ToolCall): string {
  const i = call.input ?? {};
  const s = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : "");
  switch (call.name) {
    case "bash":
      return `$ ${s("command").split("\n")[0]}${i.network ? c.yellow(" [network]") : ""}`;
    case "read":
    case "write":
    case "edit":
    case "list":
      return s("path") || ".";
    case "glob":
    case "grep":
      return `${s("pattern")}${s("path") ? ` in ${s("path")}` : ""}`;
    case "task":
      return s("description");
    default:
      return call.rawInput.slice(0, 80);
  }
}

export const fmtUsd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
export const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export interface Renderer {
  (e: AgentEvent): void;
  /** True if the last thing printed was streamed text without a trailing newline. */
  midLine: () => boolean;
}

/** Print events to a stream. Text from sub-agents is hidden; their tool calls are shown indented. */
export function makeRenderer(out: NodeJS.WriteStream = process.stdout, opts: { reasoning?: boolean } = {}): Renderer {
  let mid = false;
  let inReasoning = false;
  const line = (s: string) => {
    if (mid) out.write("\n");
    mid = false;
    out.write(s + "\n");
  };
  const r = ((e: AgentEvent) => {
    const sub = e.agent.startsWith("task:");
    const pad = sub ? "    " : "";
    switch (e.type) {
      case "text":
        if (sub) return;
        if (inReasoning) {
          out.write("\n");
          inReasoning = false;
        }
        out.write(e.text);
        mid = !e.text.endsWith("\n");
        return;
      case "reasoning":
        if (sub || !opts.reasoning) return;
        if (!inReasoning) {
          if (mid) out.write("\n");
          inReasoning = true;
        }
        out.write(c.dim(e.text));
        mid = true;
        return;
      case "tool_start":
        line(`${pad}${c.cyan("▸ " + e.call.name)} ${describeCall(e.call)}`);
        return;
      case "tool_end": {
        const first = e.result.content.split("\n")[0]!.slice(0, 160);
        if (e.result.isError) line(`${pad}  ${c.red("✗ " + first)}`);
        else if (e.result.name === "task") line(`${pad}  ${c.dim("✓ helper finished")}`);
        else if (e.result.name === "bash") {
          const exit = e.result.content.match(/\[exit code (\S+)\]$/)?.[1];
          line(`${pad}  ${exit === "0" ? c.dim("✓ exit 0") : c.yellow(`exit ${exit}`)}`);
        }
        return;
      }
      case "compacted":
        line(c.magenta(`↺ compacted ${e.removedMessages} earlier messages into a summary`));
        return;
      case "notice":
        line(e.level === "error" ? c.red(`error: ${e.text}`) : e.level === "warn" ? c.yellow(e.text) : c.dim(e.text));
        return;
      case "turn_end":
        if (sub) return;
        const u = e.usage;
        const cache = u.cacheReadTokens ? `, ${fmtTok(u.cacheReadTokens)} cached` : "";
        line(c.dim(`— ${fmtTok(u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens)} in${cache}, ${fmtTok(u.outputTokens)} out, ${fmtUsd(e.costUsd)}`));
        return;
    }
  }) as Renderer;
  r.midLine = () => mid;
  return r;
}
