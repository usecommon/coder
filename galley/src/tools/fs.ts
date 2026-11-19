// File tools: read, list, glob, grep, write, edit. Paths are confined to the workspace, plus the sandbox's /tmp.
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { confine, displayPath, OutsideError, PathError } from "../safety/paths.ts";
import { gitFiles } from "../agent/workspace-state.ts";
import { scratchDir } from "./bash.ts";
import { ToolError, type Tool, type ToolContext } from "./types.ts";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "target", "__pycache__", ".venv", ".galley"]);

async function permit(ctx: ToolContext, tool: string, subject: string): Promise<void> {
  const r = await ctx.gate.check({ tool, subject });
  if (!r.ok) throw new ToolError(`${tool} ${subject}: ${r.why}`);
}

/** Where a path under /tmp really lives, or undefined when the file tools may not go there.
 *  Sandboxed commands see a scratch folder at /tmp. The file tools reach the same folder under the same name, so a
 *  script saved with write is the file bash runs, and edit can change it. Without a sandbox, /tmp is the machine's
 *  own folder and stays off limits like everything else outside the workspace. */
function scratchRoot(ctx: ToolContext): string | undefined {
  if (ctx.sandbox === "none" || ctx.cfg.sandbox === "off") return undefined;
  if (ctx.sandbox === "seatbelt") return realpathSync("/tmp"); // Seatbelt leaves /tmp where it is and lets commands write there
  const dir = scratchDir(ctx.workspace); // bubblewrap mounts this folder at /tmp
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

/** The part of an absolute path after /tmp ("" for /tmp itself), or undefined if it is not under /tmp. */
function underTmp(p: string): string | undefined {
  const n = isAbsolute(p) ? normalize(p) : "";
  return n === "/tmp" ? "" : n.startsWith("/tmp/") ? n.slice(5) : undefined;
}

interface Target {
  /** The real file. */
  abs: string;
  /** The path as the model knows it: relative to the workspace, or /tmp/... for a scratch file. */
  shown: string;
  scratch: boolean;
}

function resolveTarget(ctx: ToolContext, p: unknown, write = false): Target {
  const given = String(p ?? ".");
  try {
    const abs = confine(ctx.workspace, given, { write });
    return { abs, shown: displayPath(ctx.workspace, abs), scratch: false };
  } catch (err) {
    if (!(err instanceof PathError)) throw err;
    // Not in the workspace. (The workspace is tried first: it may itself live under /tmp.)
    const rest = err instanceof OutsideError ? underTmp(given) : undefined;
    const root = rest === undefined ? undefined : scratchRoot(ctx);
    if (!root) throw new ToolError(err.message);
    try {
      const abs = confine(root, rest || ".");
      return { abs, shown: join("/tmp", relative(root, abs)), scratch: true };
    } catch {
      throw new ToolError(`${given} leads outside /tmp`); // a link planted in the scratch folder
    }
  }
}

/** How to show a file found under `base` (a workspace or scratch folder) to the model. */
const shownUnder = (ctx: ToolContext, base: Target, abs: string) =>
  base.scratch ? join(base.shown, relative(base.abs, abs)) : relative(ctx.workspace, abs);

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export const readTool: Tool = {
  readOnly: true,
  spec: {
    name: "read",
    description: "Read a text file. Returns numbered lines. Use offset/limit (1-based lines) for large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, relative to the workspace (or under /tmp)" },
        offset: { type: "integer", description: "First line to read (1-based)" },
        limit: { type: "integer", description: "Max lines (default 2000)" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const { abs, shown } = resolveTarget(ctx, input.path);
    await permit(ctx, "read", shown);
    if (!existsSync(abs)) throw new ToolError(`${input.path} does not exist`);
    if (statSync(abs).isDirectory()) throw new ToolError(`${input.path} is a directory; use list`);
    const buf = readFileSync(abs);
    if (isBinary(buf)) throw new ToolError(`${input.path} looks like a binary file`);
    const lines = buf.toString("utf8").split("\n");
    const start = Math.max(1, Number(input.offset ?? 1));
    const limit = Math.max(1, Number(input.limit ?? 2000));
    const slice = lines.slice(start - 1, start - 1 + limit);
    const body = slice.map((l, i) => `${String(start + i).padStart(6)}\t${l.length > 2000 ? l.slice(0, 2000) + "…" : l}`).join("\n");
    const more = start - 1 + limit < lines.length ? `\n(${lines.length - (start - 1 + limit)} more lines; continue with offset=${start + limit})` : "";
    return body + more;
  },
};

export const listTool: Tool = {
  readOnly: true,
  spec: {
    name: "list",
    description: "List a directory's entries (directories end with /).",
    parameters: { type: "object", properties: { path: { type: "string", description: "Directory (default: workspace root)" } }, additionalProperties: false },
  },
  async run(input, ctx) {
    const { abs, shown } = resolveTarget(ctx, input.path ?? ".");
    await permit(ctx, "list", shown);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new ToolError(`${input.path ?? "."} is not a directory`);
    const entries = readdirSync(abs, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    return entries.slice(0, 500).join("\n") + (entries.length > 500 ? `\n(${entries.length - 500} more)` : "") || "(empty)";
  },
};

export const globTool: Tool = {
  readOnly: true,
  spec: {
    name: "glob",
    description: 'Find files by glob pattern (e.g. "src/**/*.ts"). Newest first. Skips .git and node_modules.',
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" }, path: { type: "string", description: "Directory to search (default: workspace)" } },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const target = resolveTarget(ctx, input.path ?? ".");
    const base = target.abs;
    await permit(ctx, "glob", String(input.pattern));
    const glob = new Bun.Glob(String(input.pattern));
    const hits: { p: string; m: number }[] = [];
    for await (const f of glob.scan({ cwd: base, onlyFiles: true, dot: false })) {
      if (f.split("/").some((s) => IGNORED_DIRS.has(s))) continue;
      const abs = join(base, f);
      hits.push({ p: shownUnder(ctx, target, abs), m: statSync(abs).mtimeMs });
      if (hits.length >= 5000) break;
    }
    hits.sort((a, b) => b.m - a.m);
    if (!hits.length) return "No files found.";
    return hits.slice(0, 200).map((h) => h.p).join("\n") + (hits.length > 200 ? `\n(${hits.length - 200} more; narrow the pattern)` : "");
  },
};

export const grepTool: Tool = {
  readOnly: true,
  spec: {
    name: "grep",
    description: "Search file contents with a regular expression. Returns path:line:text matches.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression" },
        path: { type: "string", description: "File or directory (default: workspace)" },
        include: { type: "string", description: 'File glob filter, e.g. "*.ts"' },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const target = resolveTarget(ctx, input.path ?? ".");
    const base = target.abs;
    await permit(ctx, "grep", String(input.pattern));
    const args = ["--line-number", "--no-heading", "--color", "never", "--max-columns", "300", "-e", String(input.pattern)];
    if (input.include) args.push("-g", String(input.include));
    args.push(base);
    const r = spawnSync("rg", args, { encoding: "utf8", maxBuffer: 20_000_000, timeout: 30_000 });
    let out: string;
    if (r.error) out = jsGrep(base, String(input.pattern), input.include ? String(input.include) : undefined);
    else if (r.status === 1) return "No matches.";
    else if (r.status !== 0) throw new ToolError(r.stderr.trim() || "grep failed");
    else out = r.stdout;
    const own = target.scratch ? base : ctx.workspace; // matches come back with absolute paths
    const lines = out.split("\n").filter(Boolean).map((l) => (l.startsWith(own) ? shownUnder(ctx, target, l.slice(0, l.indexOf(":"))) + l.slice(l.indexOf(":")) : l));
    if (!lines.length) return "No matches.";
    return lines.slice(0, 200).join("\n") + (lines.length > 200 ? `\n(${lines.length - 200} more matches; narrow the search)` : "");
  },
};

function jsGrep(base: string, pattern: string, include?: string): string {
  const re = new RegExp(pattern);
  const inc = include ? new Bun.Glob(include) : undefined;
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (out.length > 1000) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) walk(p);
      } else if (!inc || inc.match(e.name)) {
        const buf = readFileSync(p);
        if (isBinary(buf)) continue;
        buf.toString("utf8").split("\n").forEach((l, i) => re.test(l) && out.push(`${p}:${i + 1}:${l.slice(0, 300)}`));
      }
    }
  };
  statSync(base).isDirectory() ? walk(base) : readFileSync(base, "utf8").split("\n").forEach((l, i) => re.test(l) && out.push(`${base}:${i + 1}:${l}`));
  return out.join("\n");
}

export const writeTool: Tool = {
  readOnly: false,
  spec: {
    name: "write",
    description: "Create or overwrite a file with the given content. Prefer edit for changing existing files.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path, relative to the workspace (or under /tmp)" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const { abs, shown, scratch } = resolveTarget(ctx, input.path, true);
    await permit(ctx, "write", shown);
    if (!scratch) ctx.undo.record(abs); // undo is for the project's files
    mkdirSync(dirname(abs), { recursive: true });
    const content = String(input.content);
    writeFileSync(abs, content);
    return `Wrote ${content.split("\n").length} lines to ${shown}`;
  },
};

/** Find `needle` in `hay`. If there is no exact match, retry ignoring trailing whitespace on each line
 *  (weaker models often drop it); the first and last needle lines may be partial lines. */
export function locate(hay: string, needle: string): { index: number; length: number; count: number } | undefined {
  const exact = hay.split(needle).length - 1;
  if (exact > 0) return { index: hay.indexOf(needle), length: needle.length, count: exact };
  const raw = hay.split("\n");
  const H = raw.map((l) => l.trimEnd());
  const N = needle.split("\n").map((l) => l.trimEnd());
  const lineStart: number[] = [];
  raw.reduce((pos, l, i) => ((lineStart[i] = pos), pos + l.length + 1), 0);
  const hits: { index: number; length: number }[] = [];
  for (let i = 0; i + N.length <= H.length; i++) {
    if (N.length === 1) {
      const k = H[i]!.indexOf(N[0]!);
      if (N[0] && k >= 0) hits.push({ index: lineStart[i]! + k, length: N[0]!.length });
      continue;
    }
    const last = N.length - 1;
    const ok = N.every((n, j) => (j === 0 ? H[i]!.endsWith(n) : j === last ? H[i + j]!.startsWith(n) : H[i + j] === n));
    if (!ok) continue;
    const start = lineStart[i]! + H[i]!.length - N[0]!.length;
    const end = lineStart[i + last]! + N[last]!.length;
    hits.push({ index: start, length: end - start });
  }
  return hits.length ? { ...hits[0]!, count: hits.length } : undefined;
}

/** Each line with its trailing white space (carriage returns included) taken off, as edit compares lines. */
const loose = (s: string) => s.split("\n").map((l) => l.trimEnd()).join("\n");

/** The files under `root` that contain `text`: undefined unless the answer is certain and cheap. Any candidate that
 *  is skipped or cannot be read makes it uncertain: a file over 1 MB, a link, a nested repository, an unreadable
 *  file, or more than 5,000 files or 50 MB in all. In a recorded git repository the candidates are git's file list,
 *  and an ignored file or folder must be searchable too; elsewhere a walk of every folder. Matching ignores trailing
 *  spaces, as edit does. */
function filesContaining(root: string, text: string, mayRead: (p: string) => boolean = () => true): string[] | undefined {
  const MAX_FILES = 5000;
  const MAX_BYTES = 50 * 1024 * 1024;
  const want = loose(text);
  let files = 0;
  let bytes = 0;
  const hits: string[] = [];
  const check = (p: string): boolean => {
    if (++files > MAX_FILES) return false;
    try {
      const st = lstatSync(p);
      if (st.isDirectory()) return walk(p, 0);
      if (!st.isFile() || st.size > 1_000_000) return false;
      // A file the model may not read is not searched for it: that makes the answer uncertain.
      if (!mayRead(p)) return false;
      bytes += st.size;
      if (bytes > MAX_BYTES) return false;
      const body = readFileSync(p, "utf8");
      if (body.includes(text) || loose(body).includes(want)) hits.push(p);
      return true;
    } catch {
      return false;
    }
  };
  const walk = (dir: string, depth: number): boolean => {
    if (depth > 12) return false;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!walk(p, depth + 1)) return false;
      } else if (!check(p)) return false;
    }
    return true;
  };
  const listed = gitFiles(root);
  if (listed) {
    // A folder in git's own list is a nested repository or submodule: not searched, so uncertain. Ignored folders
    // are searched, within the same limits.
    for (const f of listed.listed) {
      const p = join(root, f);
      if (lstatSync(p, { throwIfNoEntry: false })?.isDirectory() || !check(p)) return undefined;
    }
    for (const f of listed.ignored) if (!check(join(root, f.replace(/\/$/, "")))) return undefined;
    return hits;
  }
  return walk(root, 0) ? hits : undefined;
}

export const editTool: Tool = {
  readOnly: false,
  // A call without a path is mended when exactly one file in the workspace contains the text to replace.
  repair(input, ctx) {
    if (input.path !== undefined || typeof input.old_string !== "string" || input.old_string.length < 8) return undefined;
    const mayRead = (p: string) => ctx.gate.allows({ tool: "read", subject: displayPath(ctx.workspace, p) });
    const hits = filesContaining(ctx.workspace, input.old_string, mayRead);
    if (hits?.length !== 1) return undefined;
    // Not mended into an edit the rules would refuse: the note would tell which file holds the text.
    if (!ctx.gate.allows({ tool: "edit", subject: displayPath(ctx.workspace, hits[0]!) })) return undefined;
    // The scratch folder is a place edit can write to as well: a match there makes the workspace's match uncertain.
    const scratch = scratchRoot(ctx);
    if (scratch && scratch !== ctx.workspace && !scratch.startsWith(`${ctx.workspace}/`) && filesContaining(scratch, input.old_string)?.length !== 0) return undefined;
    const path = relative(ctx.workspace, hits[0]!);
    return { input: { ...input, path }, note: `no path was given; ${path} is the only file containing old_string` };
  },
  spec: {
    name: "edit",
    description: "Replace exact text in a file. old_string must match uniquely (include surrounding lines) unless replace_all is true.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, relative to the workspace (or under /tmp)" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const { abs, shown, scratch } = resolveTarget(ctx, input.path, true);
    await permit(ctx, "edit", shown);
    if (!existsSync(abs)) throw new ToolError(`${input.path} does not exist; use write to create it`);
    const text = readFileSync(abs, "utf8");
    const oldS = String(input.old_string);
    const newS = String(input.new_string);
    if (oldS === newS) throw new ToolError("old_string and new_string are identical");
    if (oldS === "") throw new ToolError("old_string is empty; use write to create files");
    let next: string;
    if (input.replace_all) {
      if (!text.includes(oldS)) throw new ToolError(`old_string not found in ${input.path}`);
      next = text.split(oldS).join(newS);
    } else {
      const hit = locate(text, oldS);
      if (!hit) throw new ToolError(`old_string not found in ${input.path}. Read the file and copy the text exactly.`);
      if (hit.count > 1) throw new ToolError(`old_string matches ${hit.count} places; include more surrounding lines or set replace_all`);
      next = text.slice(0, hit.index) + newS + text.slice(hit.index + hit.length);
    }
    if (!scratch) ctx.undo.record(abs);
    writeFileSync(abs, next);
    return `Edited ${shown}`;
  },
};
