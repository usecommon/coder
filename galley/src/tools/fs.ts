// File tools: read, list, glob, grep, write, edit. All paths are confined to the workspace.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { confine, displayPath, PathError } from "../safety/paths.ts";
import { ToolError, type Tool, type ToolContext } from "./types.ts";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "target", "__pycache__", ".venv", ".galley"]);

async function permit(ctx: ToolContext, tool: string, subject: string): Promise<void> {
  const r = await ctx.gate.check({ tool, subject });
  if (!r.ok) throw new ToolError(`${tool} ${subject}: ${r.why}`);
}

function resolvePath(ctx: ToolContext, p: unknown, write = false): string {
  try {
    return confine(ctx.workspace, String(p ?? "."), { write });
  } catch (err) {
    if (err instanceof PathError) throw new ToolError(err.message);
    throw err;
  }
}

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
        path: { type: "string", description: "File path, relative to the workspace" },
        offset: { type: "integer", description: "First line to read (1-based)" },
        limit: { type: "integer", description: "Max lines (default 2000)" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const abs = resolvePath(ctx, input.path);
    await permit(ctx, "read", displayPath(ctx.workspace, abs));
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
    const abs = resolvePath(ctx, input.path ?? ".");
    await permit(ctx, "list", displayPath(ctx.workspace, abs));
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
    const base = resolvePath(ctx, input.path ?? ".");
    await permit(ctx, "glob", String(input.pattern));
    const glob = new Bun.Glob(String(input.pattern));
    const hits: { p: string; m: number }[] = [];
    for await (const f of glob.scan({ cwd: base, onlyFiles: true, dot: false })) {
      if (f.split("/").some((s) => IGNORED_DIRS.has(s))) continue;
      const abs = join(base, f);
      hits.push({ p: relative(ctx.workspace, abs), m: statSync(abs).mtimeMs });
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
    const base = resolvePath(ctx, input.path ?? ".");
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
    const lines = out.split("\n").filter(Boolean).map((l) => (l.startsWith(ctx.workspace) ? relative(ctx.workspace, l.slice(0, l.indexOf(":"))) + l.slice(l.indexOf(":")) : l));
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
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const abs = resolvePath(ctx, input.path, true);
    await permit(ctx, "write", displayPath(ctx.workspace, abs));
    ctx.undo.record(abs);
    mkdirSync(dirname(abs), { recursive: true });
    const content = String(input.content);
    writeFileSync(abs, content);
    return `Wrote ${content.split("\n").length} lines to ${displayPath(ctx.workspace, abs)}`;
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

export const editTool: Tool = {
  readOnly: false,
  spec: {
    name: "edit",
    description: "Replace exact text in a file. old_string must match uniquely (include surrounding lines) unless replace_all is true.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const abs = resolvePath(ctx, input.path, true);
    await permit(ctx, "edit", displayPath(ctx.workspace, abs));
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
    ctx.undo.record(abs);
    writeFileSync(abs, next);
    return `Edited ${displayPath(ctx.workspace, abs)}`;
  },
};
