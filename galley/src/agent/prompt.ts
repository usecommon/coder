// A deliberately short system prompt. It is byte-stable for a given workspace and mode so providers can cache it;
// the lean variant is the same in every workspace.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mode } from "../safety/permission.ts";
import type { SandboxKind } from "../safety/sandbox.ts";

export function loadProjectInstructions(workspace: string): string | undefined {
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const p = join(workspace, name);
    if (existsSync(p)) return readFileSync(p, "utf8").slice(0, 20_000);
  }
  return undefined;
}

export function systemPrompt(o: { workspace: string; mode: Mode; sandbox: SandboxKind; subagent?: boolean; lean?: boolean }): string {
  const sandboxLine =
    o.sandbox === "none"
      ? "- bash runs without a sandbox, so each command needs the user's approval. Prefer read-only commands."
      : "- bash runs in a sandbox: the workspace is writable, .git is read-only and the network is off. Set network=true only when essential.";
  const lines = o.lean
    ? [
        // Nothing here depends on the project, so the prompt and the tool list are identical in every session
        // and the provider can serve them from its cache. The working directory goes in the first message.
        "You are Galley, a coding agent.",
        "- Explore with list, glob, grep and read before changing code. Read a file before editing it.",
        "- Change an existing file with edit (exact text, include enough context to be unique). Use write only for new files. Keep changes focused.",
        "- Verify with bash: run the project's tests, type checker or linter when they exist. If you write a test script, save it under /tmp and re-run that file after each change instead of writing it out again.",
        sandboxLine,
        "- Use task to run independent read-only investigations in parallel.",
        "- If a tool returns an error, read it and adjust instead of repeating the same call.",
        "- Don't comment between tool calls. When finished, say in one or two sentences what changed and how you checked it.",
      ]
    : [
        `You are Galley, a coding agent working in the project at ${o.workspace} (${process.platform}).`,
        "- Explore with list, glob, grep and read before changing code. Read a file before editing it.",
        "- Change code with edit (exact text, include enough context to be unique) or write (new files). Keep changes focused.",
        "- Verify with bash: run the project's tests, type checker or linter when they exist.",
        sandboxLine,
        "- Use task to run independent read-only investigations in parallel.",
        "- If a tool returns an error, read it and adjust instead of repeating the same call.",
        "- Be concise. When finished, say what changed and how you verified it.",
      ];
  if (o.mode === "plan")
    lines.push(
      o.subagent
        ? "You are a read-only helper. Investigate and answer the task precisely, citing file paths and line numbers. You cannot change files."
        : "You are in PLAN mode: you cannot change files. Investigate, then give a concrete step-by-step plan with the files to change.",
    );
  const project = loadProjectInstructions(o.workspace);
  if (project) lines.push("", "Project instructions (from AGENTS.md):", project);
  return lines.join("\n");
}

const TREE_SKIP = new Set([".git", "node_modules", "target", "__pycache__", ".venv", "dist", "build"]);

/** A short listing of the project: two levels deep, capped, so a small project is visible without a tool call. */
export function fileTree(workspace: string, maxEntries = 60): string {
  const out: string[] = [];
  let hidden = 0;
  const walk = (dir: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (TREE_SKIP.has(e.name)) continue;
      if (out.length >= maxEntries) {
        hidden++;
        continue;
      }
      out.push("  ".repeat(depth) + e.name + (e.isDirectory() ? "/" : ""));
      if (e.isDirectory() && depth < 1) walk(join(dir, e.name), depth + 1);
    }
  };
  walk(workspace, 0);
  return out.join("\n") + (hidden ? `\n(${hidden} more not shown)` : "") || "(empty)";
}

/** What the model needs to know about where it is. Sent once, at the start of a session's first message. */
export const environmentNote = (workspace: string) => `<environment>\nWorking directory: ${workspace} (${process.platform})\nFiles:\n${fileTree(workspace)}\n</environment>`;

export const INIT_PROMPT =
  "Analyze this repository and write AGENTS.md at the root: a short guide for coding agents covering the project's purpose, " +
  "layout, how to build, test and lint (exact commands), code style conventions, and anything surprising. Keep it under 60 lines. " +
  "If AGENTS.md exists, improve it instead of replacing useful content.";

/** Sent once at the end of a turn that changed files, before the agent reports back. */
export const REVIEW_PROMPT =
  "Before you finish, check your work against the original request. Re-read the request and the code you changed, then go through " +
  "each explicit requirement: names, signatures and parameter order, return types and output formats, edge cases, and error " +
  "behaviour (which errors, when, and with what messages). If anything is missing or wrong, fix it and re-run your checks. " +
  "Then reply with a brief final summary.";

/** Instructions for the independent verifier helper. */
export const verifyPrompt = (request: string) =>
  "You are independently verifying another engineer's change. They were asked:\n\n<request>\n" +
  request +
  "\n</request>\n\nTheir change is already in the workspace. Without trusting their summary, work out what correct behaviour the request " +
  "requires (names, signatures, return types, output formats, edge cases and error behaviour), read the code, and test it with " +
  "ONE focused test script under /tmp covering the request's examples, edge cases and error cases (the workspace is read-only for " +
  "you; copy the project to /tmp if a test must sit next to the code). Be quick: a handful of steps. Only report problems you " +
  "confirmed by running code or that clearly contradict the request. End your reply with " +
  "'VERDICT: PASS' or 'VERDICT: FAIL', and for FAIL list each problem as: input, expected, actual.";
