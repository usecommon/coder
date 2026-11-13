// Keep model-supplied paths inside the workspace, and keep writes out of .git.
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class PathError extends Error {}
/** The path resolves to somewhere outside the root it was confined to. */
export class OutsideError extends PathError {}

/** Resolve symlinks for the longest existing prefix of `p`. */
function realish(p: string): string {
  let cur = p;
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return p;
    tail.unshift(cur.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    cur = parent;
  }
  return resolve(realpathSync(cur), ...tail);
}

const inside = (root: string, p: string) => {
  const rel = relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** Resolve `p` against `root` and throw unless the real path stays inside the workspace. */
export function confine(root: string, p: string, opts: { write?: boolean } = {}): string {
  if (typeof p !== "string" || !p) throw new PathError("path is required");
  const realRoot = realpathSync(root);
  const abs = resolve(realRoot, p);
  const real = realish(abs);
  if (!inside(realRoot, real)) throw new OutsideError(`${p} is outside the workspace (${realRoot})`);
  if (opts.write) {
    const rel = relative(realRoot, real).split(sep);
    if (rel[0] === ".git") throw new PathError("writing inside .git is not allowed");
  }
  return real;
}

export const displayPath = (root: string, p: string) => relative(realpathSync(root), p) || ".";
