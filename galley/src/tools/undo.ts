// Per-turn file snapshots so `/undo` can restore what the agent changed.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

interface Snapshot {
  path: string;
  /** File content before the turn, or null if the file did not exist. */
  before: string | null;
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
    this.current!.push({ path, before: existsSync(path) ? readFileSync(path, "utf8") : null });
  }

  /** Restore files changed in the most recent turn that changed anything. Returns the restored paths. */
  undo(): string[] {
    while (this.turns.length) {
      const snaps = this.turns.pop()!;
      if (this.current === snaps) this.current = undefined;
      if (!snaps.length) continue;
      for (const s of [...snaps].reverse()) {
        if (s.before === null) rmSync(s.path, { force: true });
        else writeFileSync(s.path, s.before);
      }
      return snaps.map((s) => s.path);
    }
    return [];
  }
}
