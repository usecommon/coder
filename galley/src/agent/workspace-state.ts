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
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

interface GitContext {
  gitDir: string;
  commonDir: string;
  top: string;
}

const recorded = new Map<string, GitContext | null>();
// Submodules are not entered: a submodule's .git is inside the workspace, where the model can write its config.
// Attributes are read from the empty tree, so a .gitattributes the model writes names no filter or diff driver.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const HARDEN = [
  `--attr-source=${EMPTY_TREE}`,
  ...["core.fsmonitor=false", "core.hooksPath=/dev/null", "diff.external=", "core.untrackedCache=false", "diff.ignoreSubmodules=all", "submodule.recurse=false", "status.submoduleSummary=false", "core.attributesFile=/dev/null"].flatMap((c) => ["-c", c]),
];
/** System and user-wide config are not read: a filter defined there (git-lfs) would run for an attribute the model
 *  wrote. Only the repository's own config is read, and only after it was checked. */
const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
/** Config keys that make git run a program: a repository that sets one is not trusted. */
const RUNS_PROGRAMS = /^(filter\.|diff\.[^.]+\.(textconv|command)|merge\.[^.]+\.driver|core\.(fsmonitor|hookspath|pager|sshcommand|askpass|editor|gitproxy)|include(if)?\.|credential\.|uploadpack\.|receive\.)/i;

const spawnGit = (args: string[]) => spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30_000, env: ENV });

/** Whether the repository's own config (both the shared and the per-worktree file) sets nothing that runs a program. */
function configIsSafe(gitDir: string): boolean {
  const r = spawnGit([...HARDEN, `--git-dir=${gitDir}`, "config", "--name-only", "--list", "--show-scope"]);
  if (r.status !== 0) return false;
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .every((line) => {
      const [scope, key = ""] = line.split("\t");
      return scope === "command" || !RUNS_PROGRAMS.test(key);
    });
}

const inside = (dir: string, root: string) => dir === root || dir.startsWith(`${root}/`);

/** Record the workspace's repository, if it has one. Call once per workspace, before the model can write to it. The
 *  repository is refused when its git folder is somewhere the sandbox can write (inside the workspace, apart from
 *  <workspace>/.git, which the sandbox mounts read-only, or in Galley's own folder for the project), or when its
 *  config would run a program. */
export function recordGit(ws: string, writable: string[] = []): void {
  if (recorded.has(ws)) return;
  const r = spawnGit(["-C", ws, ...HARDEN, "rev-parse", "--absolute-git-dir", "--git-common-dir", "--show-toplevel"]);
  const [gitDirRaw, commonRaw, top] = r.status === 0 ? r.stdout.trim().split("\n") : [];
  if (!gitDirRaw || !commonRaw || !top) return void recorded.set(ws, null);
  let gitDir: string;
  let commonDir: string;
  try {
    gitDir = realpathSync(gitDirRaw);
    commonDir = realpathSync(isAbsolute(commonRaw) ? commonRaw : join(ws, commonRaw));
  } catch {
    return void recorded.set(ws, null);
  }
  const dotGit = join(ws, ".git");
  const exposed = [gitDir, commonDir].some((d) => (inside(d, ws) && !inside(d, dotGit)) || writable.some((w) => inside(d, w)));
  recorded.set(ws, exposed || !configIsSafe(gitDir) ? null : { gitDir, commonDir, top });
}

/** Run git on the recorded repository. Undefined when there is none, the workspace was never recorded, or its config
 *  has since come to set something that runs a program (checked again before every call). */
export function git(ws: string, args: string[]) {
  const ctx = recorded.get(ws);
  if (!ctx || !configIsSafe(ctx.gitDir)) return undefined;
  const r = spawnGit(["-C", ws, ...HARDEN, `--git-dir=${ctx.gitDir}`, `--work-tree=${ctx.top}`, ...args]);
  return r.status === 0 ? { stdout: r.stdout, top: ctx.top } : undefined;
}

export const isGitRepo = (ws: string): boolean => !!recorded.get(ws);

/** git diff of the workspace against HEAD (or the index, before the first commit), without running any program. */
const diff = (ws: string, extra: string[] = []) =>
  git(ws, ["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", ...extra, "--", "."]) ?? git(ws, ["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", ...extra, "--", "."]);

// Folders that hold dependencies, builds and tool caches: a test run rewrites .pytest_cache, which is no change to the
// work. A folder marked with CACHEDIR.TAG (cargo, pytest and others write one) is skipped too.
const SKIP = new Set([".git", "node_modules", "dist", "build", "target", ".venv", "venv", "__pycache__", ".gradle", "vendor", ".next", "coverage", ".cache", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".hypothesis", ".tox", ".nox"]);
const MAX_FILES = 5000;

/** A fingerprint of the workspace's files: it changes when a file is added, removed or changed. Undefined when it
 *  cannot be taken cheaply, which callers treat as "may have changed". */
export function fingerprint(ws: string): string | undefined {
  const h = createHash("sha256");
  if (isGitRepo(ws)) {
    const status = git(ws, ["status", "--porcelain=v1", "-uall", "--ignore-submodules=all", "-z", "--", "."]);
    const d = diff(ws, ["--binary"]);
    if (!status || !d) return undefined;
    // The commit too: changes committed through the shell leave a clean tree but are changes all the same.
    const head = git(ws, ["rev-parse", "-q", "--verify", "HEAD"]);
    h.update(status.stdout).update(d.stdout).update(head?.stdout ?? "no-head");
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
        if (!SKIP.has(e.name) && !existsSync(join(p, "CACHEDIR.TAG")) && !walk(p)) return false;
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
  // Untracked folders as one line each, and the list held to a quarter of the space, so the diff is not crowded out.
  const status = git(ws, ["status", "--porcelain=v1", "--ignore-submodules=all", "--", "."])?.stdout.trim();
  if (!status) return "";
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}\n[… ${t.length - n} more characters]` : t);
  const list = clip(status, Math.floor(maxChars / 4));
  return `$ git status --porcelain\n${list}\n\n$ git diff HEAD\n${clip(diff(ws)?.stdout.trim() ?? "", maxChars - list.length)}`;
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
