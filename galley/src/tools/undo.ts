// Per-turn file snapshots so `/undo` can restore what the agent changed.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

interface Snapshot {
  path: string;
  /** File content before the turn, or null if the file did not exist (or was a link). */
  before: string | null;
  /** Where the path pointed, when it was a link before the turn: restored as a link, not followed. */
  link?: string;
  /** The real path of the folder that held it: undo acts only while the path still leads there. */
  dir: string | undefined;
  /** Permission bits of the file before the turn. */
  mode?: number;
}

/** Where a path's folder really is: the real path of its nearest existing ancestor, with the rest added. Undefined
 *  when it cannot be told. */
function realDir(path: string): string | undefined {
  let dir = dirname(path);
  const rest: string[] = [];
  for (;;) {
    if (existsSync(dir)) {
      try {
        return join(realpathSync(dir), ...rest.reverse());
      } catch {
        return undefined;
      }
    }
    const up = dirname(dir);
    if (up === dir) return undefined;
    rest.push(basename(dir));
    dir = up;
  }
}

export class UndoLog {
  private turns: Snapshot[][] = [];
  private current: Snapshot[] | undefined;

  beginTurn(): void {
    this.current = [];
    this.turns.push(this.current);
  }

  /** Call before modifying `path`; only the first snapshot per turn is kept. */
  record(path: string): void {
    if (!this.current) this.beginTurn();
    if (this.current!.some((s) => s.path === path)) return;
    // Content is read only from a regular file: a link is remembered as a link, never followed.
    const st = lstatSync(path, { throwIfNoEntry: false });
    const dir = realDir(path);
    if (st?.isSymbolicLink()) this.current!.push({ path, before: null, link: readlinkSync(path), dir });
    else this.current!.push({ path, before: st?.isFile() ? readFileSync(path, "utf8") : null, dir, mode: st?.isFile() ? st.mode & 0o7777 : undefined });
  }

  /** Number of files changed so far in the current turn. */
  changedThisTurn(): number {
    return this.current?.length ?? 0;
  }

  /** The files changed so far in the current turn, each with its content before the turn (null: it did not exist). */
  snapshots(): { path: string; before: string | null }[] {
    return [...(this.current ?? [])];
  }

  /** Restore files changed in the most recent turn that changed anything. Returns the restored paths. */
  undo(): string[] {
    while (this.turns.length) {
      const snaps = this.turns.pop()!;
      if (this.current === snaps) this.current = undefined;
      if (!snaps.length) continue;
      const done: string[] = [];
      for (const s of [...snaps].reverse()) {
        // A folder on the way that the model has since turned into a link would take the restore outside the
        // workspace: such a file is left as it is.
        if (!s.dir || realDir(s.path) !== s.dir) continue;
        const now = lstatSync(s.path, { throwIfNoEntry: false });
        // A regular file with no other name is written in place, which keeps its permissions. Anything else at the
        // path (a link planted since, a second hard link) is removed first, so that nothing is written through it.
        const inPlace = s.before !== null && s.link === undefined && now?.isFile() && now.nlink === 1;
        if (!inPlace) rmSync(s.path, { force: true });
        if (s.link !== undefined || s.before !== null) mkdirSync(dirname(s.path), { recursive: true });
        if (s.link !== undefined) symlinkSync(s.link, s.path);
        else if (s.before !== null) {
          writeFileSync(s.path, s.before);
          if (s.mode !== undefined) chmodSync(s.path, s.mode);
        }
        done.push(s.path);
      }
      return done.reverse();
    }
    return [];
  }
}
