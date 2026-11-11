// Summarize older messages when the context grows, keeping the most recent exchange verbatim.
import type { Message, Usage } from "../core/types.ts";
import type { Provider } from "../provider/types.ts";

/** Index where the kept tail starts, or -1 when there is too little history to compact.
 *  The tail never starts with tool results, so tool calls stay paired with their results. */
export function compactionCut(messages: Message[], keepAtLeast = 6): number {
  let i = messages.length - keepAtLeast;
  while (i > 0 && messages[i]!.role === "tool") i++;
  return i >= 2 && i < messages.length ? i : -1;
}

export function transcript(messages: Message[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push(`USER: ${m.content}`);
    else if (m.role === "assistant") {
      if (m.content) out.push(`ASSISTANT: ${m.content}`);
      for (const c of m.toolCalls) out.push(`TOOL CALL ${c.name}: ${c.rawInput.slice(0, 500)}`);
    } else for (const r of m.results) out.push(`TOOL RESULT ${r.name}${r.isError ? " (error)" : ""}: ${r.content.slice(0, 1500)}`);
  }
  return out.join("\n");
}

const SUMMARY_SYSTEM =
  "You compress a coding-agent conversation so the work can continue. Write a dense summary with these headings: " +
  "Goal, Decisions and constraints, Files read or changed (with what changed), Current state (what works, what fails), Next steps. " +
  "Keep exact file paths, commands, error messages and identifiers. No preamble.";

export async function summarize(provider: Provider, model: string, messages: Message[], signal?: AbortSignal): Promise<{ summary: string; usage: Usage }> {
  const res = await provider.chat({
    model,
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user", content: transcript(messages) }],
    tools: [],
    maxTokens: 4000,
    effort: "low",
    signal,
  });
  return { summary: res.text.trim() || "(summary unavailable)", usage: res.usage };
}
