// What state the workspace's files are in, for two decisions: whether a turn changed anything (so the check command
// is worth running), and what a model taking over should be told has changed. Edits made through the shell are not
// in the undo log, so both look at the files themselves.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const git = (ws: string, args: string[]) => spawnSync("git", ["-C", ws, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });

export function isGitRepo(ws: string): boolean {
  const r = git(ws, ["rev-parse", "--is-inside-work-tree"]);
  return r.status === 0 && r.stdout.trim() === "true";
}

const SKIP = new Set([".git", "node_modules", "dist", "build", "target", ".venv", "venv", "__pycache__", ".gradle", "vendor", ".next", "coverage", ".cache"]);
const MAX_FILES = 5000;

/** A fingerprint of the workspace's files: it changes when a file is added, removed or changed. Undefined when it
 *  cannot be taken cheaply, which callers treat as "may have changed". */
export function fingerprint(ws: string): string | undefined {
  const h = createHash("sha256");
  if (isGitRepo(ws)) {
    const status = git(ws, ["status", "--porcelain=v1", "-uall", "-z"]);
    let diff = git(ws, ["diff", "HEAD", "--no-ext-diff", "--binary"]);
    if (diff.status !== 0) diff = git(ws, ["diff", "--no-ext-diff", "--binary"]); // a repository with no commit yet
    if (status.status !== 0 || diff.status !== 0) return undefined;
    h.update(status.stdout).update(diff.stdout);
    for (const entry of status.stdout.split("\0"))
      if (entry.startsWith("?? "))
        try {
          const s = statSync(join(ws, entry.slice(3)));
          h.update(`${entry}:${s.size}:${s.mtimeMs}`);
        } catch {}
    return h.digest("hex");
  }
  let files = 0;
  const walk = (dir: string): boolean => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !walk(p)) return false;
      } else if (e.isFile()) {
        if (++files > MAX_FILES) return false;
        try {
          const s = statSync(p);
          h.update(`${p}:${s.size}:${s.mtimeMs}\n`);
        } catch {}
      }
    }
    return true;
  };
  return walk(ws) ? h.digest("hex") : undefined;
}

/** What git says has changed in the workspace, clipped: for a model that takes over and cannot see the attempt.
 *  Empty when the workspace is not a repository. */
export function gitChanges(ws: string, maxChars = 20_000): string {
  if (!isGitRepo(ws)) return "";
  const status = git(ws, ["status", "--porcelain=v1", "-uall"]).stdout.trim();
  if (!status) return "";
  let diff = git(ws, ["diff", "HEAD", "--no-ext-diff"]);
  if (diff.status !== 0) diff = git(ws, ["diff", "--no-ext-diff"]);
  const text = `$ git status --porcelain\n${status}\n\n$ git diff HEAD\n${diff.stdout.trim()}`;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[… ${text.length - maxChars} more characters]` : text;
}
