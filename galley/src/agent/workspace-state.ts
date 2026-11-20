// What state the workspace's files are in, for two decisions: whether a turn changed anything (so the check command
// is worth running), and what a model taking over should be told has changed. Edits made through the shell are not
// in the undo log, so both look at the files themselves.
//
// Git runs here on the host, outside the sandbox, in a folder the model can write to. So the repository is recorded
// once, when the agent is made and before any model turn (`recordGit`), and every call names it explicitly: a `.git`
// the model creates later is never found. Hooks, the file-system monitor, text conversion and external diff are
// switched off on the command line. A repository is not used at all when its git folder is somewhere the sandbox can
// write (other than the workspace's own .git), when it ignores the workspace, or when its own config sets any key
// outside a short list of keys known to run and fetch nothing (SAFE_KEYS).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

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
  ...["core.fsmonitor=false", "core.hooksPath=/dev/null", "diff.external=", "core.untrackedCache=false", "diff.ignoreSubmodules=all", "submodule.recurse=false", "status.submoduleSummary=false", "core.attributesFile=/dev/null", "protocol.allow=never"].flatMap((c) => ["-c", c]),
];
/** System and user-wide config are not read: a filter defined there (git-lfs) would run for an attribute the model
 *  wrote. Only the repository's own config is read, and only after it was checked. */
const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_PROTOCOL_FROM_USER: "0" };
/** The repository config keys that are trusted: ones that run nothing, fetch nothing and name no program. A
 *  repository whose own config sets any other key is not used, and Galley falls back to looking at the files. A list
 *  of keys known to be harmless is kept, not a list of dangerous ones: four reviews in a row found a dangerous key the
 *  list of dangerous ones had missed (filters, per-worktree config, submodules, remote upload commands). */
const SAFE_KEYS = [
  /^core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|eol|safecrlf|quotepath|checkstat|trustctime|longpaths|protecthfs|protectntfs|preloadindex|sharedrepository|abbrev|compression|loosecompression|warnambiguousrefs|sparsecheckout|sparsecheckoutcone|commitgraph|multipackindex|splitindex)$/,
  /^user\.(name|email)$/,
  /^init\.defaultbranch$/,
  /^branch\..+\.(remote|merge|rebase|pushremote|description)$/,
  /^remote\..+\.(url|pushurl|fetch|push|tagopt|mirror|prune)$/,
  /^(pull\.(rebase|ff)|push\.default|fetch\.prune|status\.(showuntrackedfiles|relativepaths)|index\.(version|sparse)|feature\.manyfiles|rerere\.enabled)$/,
  /^extensions\.(objectformat|worktreeconfig)$/,
  /^lfs\.repositoryformatversion$/,
  /^submodule\..+\.(url|active)$/,
  /^color\./,
  /^i18n\.(commitencoding|logoutputencoding)$/,
];

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
      return scope === "command" || SAFE_KEYS.some((re) => re.test(key.toLowerCase()));
    });
}

const inside = (dir: string, root: string) => {
  const rel = relative(root, dir);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

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
  if (exposed || !configIsSafe(gitDir)) return void recorded.set(ws, null);
  // A workspace the enclosing repository ignores: git would see none of its changes.
  const ignored = spawnGit(["-C", ws, ...HARDEN, `--git-dir=${gitDir}`, `--work-tree=${top}`, "check-ignore", "-q", "."]);
  recorded.set(ws, ignored.status === 0 ? null : { gitDir, commonDir, top });
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

/** Add a worktree of the workspace's repository on a new branch, with git hardened as for every other call: a
 *  repository the model may have made runs no hook, filter or monitor. Returns an error, or undefined. */
export function addWorktree(ws: string, branch: string, dir: string): string | undefined {
  const r = spawnGit(["-C", ws, ...HARDEN, "rev-parse", "--absolute-git-dir"]);
  if (r.status !== 0) return "--worktree needs a git repository";
  const gitDir = r.stdout.trim();
  // Hooks, the monitor, transports and attributes in the tree are off (HARDEN). What is left that could run a program
  // during a checkout: a filter, named by attributes in the git folder itself, or config pulled in from elsewhere.
  const keys = spawnGit([...HARDEN, `--git-dir=${gitDir}`, "config", "--name-only", "--list"]);
  const risky = keys.stdout.split("\n").filter((k) => /^(filter\.|include\.|includeif\.)/i.test(k));
  const attrs = join(gitDir, "info", "attributes");
  if (keys.status !== 0 || risky.length || (existsSync(attrs) && readFileSync(attrs, "utf8").trim()))
    return `--worktree: the repository ${risky.length ? `sets ${risky.join(", ")}` : "has attributes in its git folder"}, which could run a program on checkout, so Galley will not make a worktree of it`;
  const add = spawnGit(["-C", ws, ...HARDEN, `--git-dir=${gitDir}`, "worktree", "add", "-b", branch, dir]);
  return add.status === 0 ? undefined : `git worktree add failed: ${add.stderr.trim()}`;
}

/** git diff of the workspace against HEAD (or the index, before the first commit), without running any program. */
const diff = (ws: string, extra: string[] = []) =>
  git(ws, ["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", ...extra, "--", "."]) ?? git(ws, ["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", ...extra, "--", "."]);

// Folders that hold dependencies, builds and tool caches: a test run rewrites .pytest_cache, which is no change to the
// work. A folder marked with CACHEDIR.TAG (cargo, pytest and others write one) is skipped too.
/** Folders that never hold source: dependencies and caches. */
const DEPS = new Set([".git", "node_modules", "dist-newstyle", ".venv", "venv", "__pycache__", ".gradle", ".next", ".cache", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".hypothesis", ".tox", ".nox", ".nyc_output"]);
/** Those, and folders that usually hold build output but may hold source (internal/build/version.go): skipped where
 *  git ignores them, or where there is no git, but not for a file git reports as untracked and not ignored. */
const SKIP = new Set([...DEPS, "dist", "build", "target", "obj", "_build", "vendor", "coverage"]);
/** Files a test run rewrites every time: its output, not a change to the work. */
const RUN_OUTPUT = /^(\.coverage(\..*)?|\.phpunit\.result\.cache|cover\.out|coverage\.out|lcov\.info)$/;
const runOutput = (path: string) => RUN_OUTPUT.test(path.replace(/\/$/, "").split("/").pop() ?? "");
// Each file costs one stat: a hundred thousand take a fraction of a second, and only at the end of a turn.
const MAX_FILES = 100_000;
/** Pathspecs that keep git from listing the skipped folders at all: a dependency tree of hundreds of thousands of
 *  files would otherwise be listed in full, and overflow, before being left out. */
const NOT_SKIPPED = [...SKIP].map((d) => `:(exclude,glob)**/${d}/**`);
const NOT_DEPS = [...DEPS].map((d) => `:(exclude,glob)**/${d}/**`);

/** A fingerprint of the workspace's files: it changes when a file is added, removed or changed. Undefined when it
 *  cannot be taken cheaply, which callers treat as "may have changed". */
export function fingerprint(ws: string): string | undefined {
  const h = createHash("sha256");
  if (isGitRepo(ws)) {
    const status = git(ws, ["status", "--porcelain=v1", "-uall", "--ignore-submodules=all", "-z", "--", ".", ...NOT_DEPS]);
    const d = diff(ws, ["--binary"]);
    if (!status || !d) return undefined;
    // The commit too: changes committed through the shell leave a clean tree but are changes all the same.
    const head = git(ws, ["rev-parse", "-q", "--verify", "HEAD"]);
    // Untracked output in dependency, build and cache folders is left out, as for ignored files: folders below the
    // workspace only, since a workspace may itself sit in one (<repo>/build/app).
    const real = (p: string) => {
      try {
        return realpathSync(p);
      } catch {
        return p;
      }
    };
    const [wsReal, topReal] = [real(ws), real(status.top)];
    const below = (p: string) => relative(wsReal, join(topReal, p)).split(sep);
    // A folder marked as a cache (CACHEDIR.TAG) is skipped too. Paths are relative to the workspace.
    const tagged = new Map<string, boolean>();
    const inCache = (f: string) => {
      const parts = f.replace(/\/$/, "").split("/");
      for (let i = 1; i <= parts.length; i++) {
        const d = parts.slice(0, i).join("/");
        if (!tagged.has(d)) tagged.set(d, existsSync(join(ws, d, "CACHEDIR.TAG")));
        if (tagged.get(d)) return true;
      }
      return false;
    };
    const skipped = (p: string) => {
      const parts = below(p);
      return parts.some((part) => DEPS.has(part)) || runOutput(p) || (parts[0] !== ".." && inCache(parts.join("/")));
    };
    const entries = status.stdout.split("\0").filter((e) => !(e.startsWith("?? ") && skipped(e.slice(3))));
    h.update(entries.join("\0")).update(d.stdout).update(head?.stdout ?? "no-head");
    // Untracked files are not in the diff: their size and time stand in. Status gives paths from the repository's
    // top, which may be above the workspace.
    for (const entry of entries)
      if (entry.startsWith("?? "))
        try {
          const s = statSync(join(status.top, entry.slice(3)));
          h.update(`${entry}:${s.size}:${s.mtimeMs}`);
        } catch {}
    // Ignored files are in neither: their size and time too, outside dependency and cache folders. Past MAX_FILES of
    // them the fingerprint cannot be taken, which counts as "may have changed".
    const ignored = git(ws, ["ls-files", "-oi", "--exclude-standard", "-z", "--", ".", ...NOT_SKIPPED]);
    if (!ignored) return undefined;
    let n = 0;
    for (const f of ignored.stdout.split("\0")) {
      if (!f || f.split("/").some((part) => SKIP.has(part)) || runOutput(f) || inCache(f)) continue;
      if (++n > MAX_FILES) return undefined;
      try {
        const st = lstatSync(join(ws, f));
        h.update(`!! ${f}:${st.size}:${st.mtimeMs}`);
      } catch {}
    }
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
      } else if (e.isFile() && !runOutput(e.name)) {
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
  // Unique: a file in a merge conflict is listed once per stage.
  const split = (s: string) => [...new Set(s.split("\0").filter(Boolean))];
  return { listed: split(listed.stdout), ignored: split(ignored.stdout) };
}
