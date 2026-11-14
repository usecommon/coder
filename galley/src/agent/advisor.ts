// A second model that reads the session and advises the one doing the work. It runs nothing and its answer is
// short, so the main model keeps its context and its cached prompt: the advisor is consulted, the session is not
// handed over (research/model-switching.md, section 4).
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import type { Message } from "../core/types.ts";

export const ADVISOR_SYSTEM = [
  "You are advising another AI coding agent. Below is its session: the task it was given, what it said, the tools it called and what came back.",
  "You cannot run anything or see more than this, and the agent will act on what you write.",
  "- Say what to do next, specifically: the file, the function, the command, the value.",
  "- If the agent is on the wrong track, say so and point to the evidence in the session.",
  "- If it has missed a requirement of the task, quote the requirement.",
  "- If you are guessing, say that it is a guess.",
  "Be brief: a few sentences or a short list. No preamble.",
].join("\n");

export const stuckQuestion = (detail: string) => `The harness asked for your advice because ${detail}. What is going wrong, and what should the agent do next?`;

export const REVIEW_QUESTION =
  "The agent says it has finished. Check its change against the task: every stated requirement, names and signatures, " +
  "output formats, edge cases and error behaviour. If you find nothing that needs changing, reply with exactly: OK\n" +
  "Otherwise list each problem as: what the task requires, what the code does.";

/** True when a review found nothing to change. */
export const reviewPassed = (reply: string) => /^\s*ok[.!]?\s*$/i.test(reply);

export const adviceMessage = (advisor: string, why: string, advice: string) =>
  `A second model (${advisor}) read this session because ${why}. It cannot run anything and can be wrong, so weigh this against what you have seen yourself:\n\n${advice}`;

export const reviewMessage = (advisor: string, report: string) =>
  `A second model (${advisor}) reviewed your change against the request and reported:\n\n${report}\n\n` +
  "Check each point yourself: it has not run the code and can be wrong. Fix what is really wrong, re-run your checks, and give a brief final summary.";

export const handoverMessage = (from: string, why: string) =>
  `You are taking over this session from another model (${from}) because ${why}. Do not assume its approach was right: ` +
  "re-read the request and the latest results, decide for yourself what is wrong, and continue from the files as they are now.";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} [… ${s.length - n} more characters]` : s);

/** One message of the session as the advisor reads it. Code the agent wrote is kept longer than what it read. */
function line(m: Message): string[] {
  if (m.role === "user") return [`USER: ${m.content}`];
  if (m.role === "assistant") {
    const out = m.content ? [`AGENT: ${m.content}`] : [];
    for (const c of m.toolCalls) out.push(`CALL ${c.name}: ${clip(c.rawInput, c.name === "write" || c.name === "edit" ? 6000 : 1000)}`);
    return out;
  }
  return m.results.map((r) => `RESULT ${r.name}${r.isError ? " (refused)" : ""}: ${clip(r.content, 3000)}`);
}

/** The session for the advisor: the opening request in full, then as many of the latest steps as fit. */
export function digest(messages: Message[], maxChars = 80_000): string {
  if (!messages.length) return "(empty session)";
  const first = line(messages[0]!).join("\n");
  const rest = messages.slice(1).map((m) => line(m).join("\n"));
  const kept: string[] = [];
  let used = first.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (used + rest[i]!.length > maxChars) {
      kept.unshift(`[… ${i + 1} earlier message${i ? "s" : ""} left out …]`);
      break;
    }
    kept.unshift(rest[i]!);
    used += rest[i]!.length + 1;
  }
  return [first, ...kept].join("\n");
}

/** The files a turn changed, as they are now, for a review at the end of the turn. */
export function changedFiles(workspace: string, paths: string[], maxChars = 40_000): string {
  const out: string[] = [];
  let used = 0;
  for (const p of paths) {
    const name = relative(workspace, p) || p;
    if (!existsSync(p)) {
      out.push(`--- ${name} (deleted)`);
      continue;
    }
    const text = readFileSync(p, "utf8");
    if (used + text.length > maxChars) {
      out.push(`--- ${name} (${text.length} characters, not shown: over the size limit for a review)`);
      continue;
    }
    used += text.length;
    out.push(`--- ${name}\n${text}`);
  }
  return out.join("\n");
}

export function advisorRequest(messages: Message[], question: string, files?: string): string {
  return `<session>\n${digest(messages)}\n</session>\n${files ? `\n<files_changed>\n${files}\n</files_changed>\n` : ""}\n${question}`;
}
