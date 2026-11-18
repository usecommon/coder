// A second model that reads the session and advises the one doing the work. It runs nothing and its answer is
// short, so the main model keeps its context and its cached prompt: the advisor is consulted, the session is not
// handed over (research/model-switching.md, section 4).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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

/** The question for the review of one step of a plan. The reviewer sees the task, this step's work and its changes. */
export const stepQuestion = (step: number, steps: string[]) =>
  `The agent is working through this plan one step at a time:\n${steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}\n\n` +
  `It has just finished step ${step}. Check that step only: does the change do what the step says, and does it leave the task's requirements and the earlier steps' work intact? ` +
  "Later steps are not this step's job; do not ask for them. If you find nothing that needs changing, reply with exactly: OK\n" +
  "Otherwise list each problem as: what is required, what the code does.";

/** The question for a look at work in progress. */
export const OBSERVE_QUESTION =
  "You are looking in on the agent while it works; it has not finished. From what you can see, is it on a sound track? " +
  "If it is, reply with exactly: OK\n" +
  "If not, say in a few sentences what is going wrong and what it should do instead. Do not comment on work it has not reached yet.";

/** The question for the review of a plan, before any of it is carried out. */
export const planQuestion = (steps: string[]) =>
  `The agent has looked at the project and proposes this plan:\n${steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}\n\n` +
  "Check the plan against the task before any work is done: does it cover every requirement, do the steps come in an order that works, " +
  "can each be checked on its own, is anything in it unnecessary? If the plan is sound, reply with exactly: OK\n" +
  "Otherwise list what to change.";

export const planRevision = (advisor: string, report: string) =>
  `A second model (${advisor}) reviewed your plan and reported:\n\n${report}\n\n` +
  "It has seen only what you looked at, and can be wrong: check each point. Then reply with the plan to follow, as a numbered list " +
  "with nothing after it: changed where the points are right, as it was where they are not.";

/** True when a review found nothing to change. */
export const reviewPassed = (reply: string) => /^\s*ok[.!]?\s*$/i.test(reply);

export const adviceMessage = (advisor: string, why: string, advice: string) =>
  `A second model (${advisor}) read this session because ${why}. It cannot run anything and can be wrong, so weigh this against what you have seen yourself:\n\n${advice}`;

export const reviewMessage = (advisor: string, report: string) =>
  `A second model (${advisor}) reviewed your change against the request and reported:\n\n${report}\n\n` +
  "Check each point yourself: it has not run the code and can be wrong. Fix what is really wrong, re-run your checks, and give a brief final summary.";

/** What a stronger model reads when it takes over without the transcript: the request, where the work stands
 *  (the files as they are now) and why it was brought in. A model that inherits the whole transcript was measured to
 *  recover less than half of what it adds on its own; given only the edits, 64 to 84% (research/reports, area 1). */
export const freshStartMessage = (o: { from: string; why: string; request: string; earlier?: string; files: string; environment: string }) =>
  `${o.environment}\n\n${o.earlier ? `Earlier in this session the user asked:\n\n${clip(o.earlier, 4000)}\n\nThe current request:\n\n` : ""}${o.request}\n\n` +
  `You are taking over this task from another model (${o.from}) because ${o.why}. You are not shown its attempt, only where the files stand. ` +
  "Work from the request and the files as they are now: keep what is right, change what is not." +
  (o.files
    ? `\n\nWhat has been changed so far:\n\n<files_changed>\n${o.files}\n</files_changed>`
    : "\n\nNo file was changed with the write or edit tools in this turn. Commands or earlier turns may still have changed files: look before you assume the code is as it was.");

/** The first message of a session, without the parts that described the workspace at the time: for quoting it to a
 *  model that takes over later, beside a fresh description. */
export const withoutPreamble = (first: string) =>
  first
    .replace(/<environment>[\s\S]*?<\/environment>\s*/g, "")
    .replace(/<project_note>[\s\S]*?<\/project_note>\s*/g, "")
    .trim();

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

/** The session for the advisor: the opening request in full, then as many of the latest steps as fit.
 *  With `from`, only the messages from that index on follow the opening request: one unit of work, not the whole session. */
export function digest(messages: Message[], maxChars = 80_000, from = 1): string {
  if (!messages.length) return "(empty session)";
  const first = line(messages[0]!).join("\n");
  const start = Math.max(1, from);
  const rest = messages.slice(start).map((m) => line(m).join("\n"));
  const kept: string[] = [];
  let used = first.length;
  let left = start - 1;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (used + rest[i]!.length > maxChars) {
      left += i + 1;
      break;
    }
    kept.unshift(rest[i]!);
    used += rest[i]!.length + 1;
  }
  if (left > 0) kept.unshift(`[… ${left} earlier message${left > 1 ? "s" : ""} left out …]`);
  return [first, ...kept].join("\n");
}

/** A unified diff of a file against what it held before, "" when nothing differs, undefined when `diff` cannot be run. */
function unifiedDiff(name: string, before: string, path: string): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), "galley-diff-"));
  try {
    const old = join(dir, "before");
    writeFileSync(old, before);
    const r = spawnSync("diff", ["-u", "--label", `a/${name}`, "--label", `b/${name}`, old, path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    // diff exits with 0 when the files are the same, 1 when they differ and 2 on trouble.
    return r.status === 0 ? "" : r.status === 1 ? r.stdout.trimEnd() : undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What a turn changed, for a review: a diff for each file that existed before, the whole of each new file. */
export function changes(workspace: string, snapshots: { path: string; before: string | null }[], maxChars = 40_000): string {
  const out: string[] = [];
  let used = 0;
  for (const s of snapshots) {
    const name = relative(workspace, s.path) || s.path;
    let text: string;
    if (!existsSync(s.path)) {
      if (s.before === null) continue; // created and removed again within the turn
      text = `--- ${name} (deleted)`;
    } else if (s.before === null) text = `--- ${name} (new file)\n${readFileSync(s.path, "utf8")}`;
    else {
      const diff = unifiedDiff(name, s.before, s.path);
      if (diff === "") continue; // changed and changed back
      text = diff ?? `--- ${name} (as it is now)\n${readFileSync(s.path, "utf8")}`;
    }
    if (used + text.length > maxChars) {
      out.push(`--- ${name} (changed; ${text.length} characters not shown: over the size limit for a review)`);
      continue;
    }
    used += text.length;
    out.push(text);
  }
  return out.join("\n");
}

export function advisorRequest(messages: Message[], question: string, files?: string, from?: number): string {
  return `<session>\n${digest(messages, 80_000, from)}\n</session>\n${files ? `\n<files_changed>\n${files}\n</files_changed>\n` : ""}\n${question}`;
}
