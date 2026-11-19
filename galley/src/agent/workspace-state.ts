// What state the workspace's files are in, for two decisions: whether a turn changed anything (so the check command
// is worth running), and what a model taking over should be told has changed. Edits made through the shell are not
// in the undo log, so both look at the files themselves.
//
// Git runs here on the host, outside the sandbox, in a folder the model can write to. So the repository is recorded
// once, when the agent is made and before any model turn (`recordGit`), and every call names it explicitly: a `.git`
// the model creates later is never found. Hooks, the file-system monitor, text conversion and external diff are
// switched off on the command line, and a repository whose own config defines filter or diff drivers, which git
// would run, is not used at all.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface GitContext {
  gitDir: string;
  top: string;
}

const recorded = new Map<string, GitContext | null>();
const HARDEN = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "diff.external=", "-c", "core.untrackedCache=false"];
/** Local config keys that make git run a program: such a repository is not trusted. */
const RUNS_PROGRAMS = /^(filter\.|diff\.[^.]+\.(textconv|command)|merge\.[^.]+\.driver|core\.(fsmonitor|hookspath|pager|sshcommand|askpass|editor)|include(if)?\.)/i;

/** Record the workspace's repository, if it has one. Call once per workspace, before the model can write to it. */
export function recordGit(ws: string): void {
  if (recorded.has(ws)) return;
  const r = spawnSync("git", ["-C", ws, ...HARDEN, "rev-parse", "--absolute-git-dir", "--show-toplevel"], { encoding: "utf8", timeout: 20_000 });
  const [gitDir, top] = r.status === 0 ? r.stdout.trim().split("\n") : [];
  if (!gitDir || !top) return void recorded.set(ws, null);
  const local = spawnSync("git", [...HARDEN, `--git-dir=${gitDir}`, "config", "--local", "--name-only", "--list"], { encoding: "utf8", timeout: 20_000 });
  const keys = local.status === 0 ? local.stdout.split("\n").filter(Boolean) : [""];
  recorded.set(ws, keys.some((k) => RUNS_PROGRAMS.test(k)) ? null : { gitDir, top });
}

/** Run git on the recorded repository. Undefined when there is none, or the workspace was never recorded. */
export function git(ws: string, args: string[]) {
  const ctx = recorded.get(ws);
  if (!ctx) return undefined;
  const r = spawnSync("git", ["-C", ws, ...HARDEN, `--git-dir=${ctx.gitDir}`, `--work-tree=${ctx.top}`, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
  return r.status === 0 ? { stdout: r.stdout, top: ctx.top } : undefined;
}

export const isGitRepo = (ws: string): boolean => !!recorded.get(ws);

/** git diff of the workspace against HEAD (or the index, before the first commit), without running any program. */
const diff = (ws: string, extra: string[] = []) => git(ws, ["diff", "HEAD", "--no-ext-diff", "--no-textconv", ...extra, "--", "."]) ?? git(ws, ["diff", "--no-ext-diff", "--no-textconv", ...extra, "--", "."]);

const SKIP = new Set([".git", "node_modules", "dist", "build", "target", ".venv", "venv", "__pycache__", ".gradle", "vendor", ".next", "coverage", ".cache"]);
const MAX_FILES = 5000;

/** A fingerprint of the workspace's files: it changes when a file is added, removed or changed. Undefined when it
 *  cannot be taken cheaply, which callers treat as "may have changed". */
export function fingerprint(ws: string): string | undefined {
  const h = createHash("sha256");
  if (isGitRepo(ws)) {
    const status = git(ws, ["status", "--porcelain=v1", "-uall", "-z", "--", "."]);
    const d = diff(ws, ["--binary"]);
    if (!status || !d) return undefined;
    h.update(status.stdout).update(d.stdout);
    // Untracked files are not in the diff: their size and time stand in. Status gives paths from the repository's
    // top, which may be above the workspace.
    for (const entry of status.stdout.split("\0"))
      if (entry.startsWith("?? "))
        try {
          const s = statSync(join(status.top, entry.slice(3)));
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
          const s = lstatSync(p);
          h.update(`${p}:${s.size}:${s.mtimeMs}\n`);
        } catch {}
      }
    }
    return true;
  };
  return walk(ws) ? h.digest("hex") : undefined;
}

/** What git says has changed in the workspace, clipped: for a model that takes over and cannot see the attempt.
 *  Empty when the workspace is not a recorded repository. */
export function gitChanges(ws: string, maxChars = 20_000): string {
  const status = git(ws, ["status", "--porcelain=v1", "-uall", "--", "."])?.stdout.trim();
  if (!status) return "";
  const text = `$ git status --porcelain\n${status}\n\n$ git diff HEAD\n${diff(ws)?.stdout.trim() ?? ""}`;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[… ${text.length - maxChars} more characters]` : text;
}

/** The workspace's files as git sees them: tracked and untracked ones that are not ignored, and separately the
 *  ignored ones (folders as one entry). Undefined when the workspace is not a recorded repository. */
export function gitFiles(ws: string): { listed: string[]; ignored: string[] } | undefined {
  const listed = git(ws, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const ignored = git(ws, ["ls-files", "-oi", "--exclude-standard", "--directory", "-z"]);
  if (!listed || !ignored) return undefined;
  const split = (s: string) => s.split("\0").filter(Boolean);
  return { listed: split(listed.stdout), ignored: split(ignored.stdout) };
}
