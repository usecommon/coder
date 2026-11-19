// Per-turn file snapshots so `/undo` can restore what the agent changed.
import { lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

interface Snapshot {
  path: string;
  /** File content before the turn, or null if the file did not exist (or was a link). */
  before: string | null;
  /** Where the path pointed, when it was a link before the turn: restored as a link, not followed. */
  link?: string;
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
    if (st?.isSymbolicLink()) this.current!.push({ path, before: null, link: readlinkSync(path) });
    else this.current!.push({ path, before: st?.isFile() ? readFileSync(path, "utf8") : null });
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
      for (const s of [...snaps].reverse()) {
        // Whatever is at the path now is removed first, so that a link the model planted since is replaced, not
        // written through (writing through it would change a file outside the workspace).
        rmSync(s.path, { force: true });
        if (s.link !== undefined) symlinkSync(s.link, s.path);
        else if (s.before !== null) writeFileSync(s.path, s.before);
      }
      return snaps.map((s) => s.path);
    }
    return [];
  }
}
