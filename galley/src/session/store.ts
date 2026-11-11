// Append-only JSONL sessions: every message, usage record and compaction is a line, so sessions can be
// resumed, forked and replayed exactly.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Message, Usage } from "../core/types.ts";
import { addUsage, emptyUsage } from "../core/types.ts";

export type SessionRecord =
  | { type: "meta"; id: string; created: string; workspace: string; model: string; title?: string; parentId?: string }
  | { type: "message"; message: Message }
  | { type: "usage"; model: string; usage: Usage; costUsd: number }
  | { type: "compaction"; summary: string; keep: number }
  | { type: "status"; status: "running" | "done" | "error"; detail?: string; at: string };

export function dataDir(): string {
  return process.env.GALLEY_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "galley");
}

export function projectDir(workspace: string): string {
  const slug = basename(workspace).replace(/[^a-zA-Z0-9_-]/g, "_") + "-" + createHash("sha256").update(workspace).digest("hex").slice(0, 8);
  return join(dataDir(), "projects", slug);
}

const newId = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + randomBytes(3).toString("hex");

export const summaryMessage = (summary: string): Message => ({
  role: "user",
  content: `[Summary of the earlier conversation, written to save context]\n${summary}`,
});

export class Session {
  messages: Message[] = [];
  usage: Usage = emptyUsage();
  costUsd = 0;
  title?: string;
  status?: string;

  private constructor(
    readonly id: string,
    readonly file: string,
    readonly meta: Extract<SessionRecord, { type: "meta" }>,
  ) {}

  static create(workspace: string, model: string, parentId?: string): Session {
    const dir = join(projectDir(workspace), "sessions");
    mkdirSync(dir, { recursive: true });
    const id = newId();
    const meta = { type: "meta" as const, id, created: new Date().toISOString(), workspace, model, parentId };
    const s = new Session(id, join(dir, `${id}.jsonl`), meta);
    s.write(meta);
    return s;
  }

  static load(workspace: string, id: string): Session {
    const dir = join(projectDir(workspace), "sessions");
    const match = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(id) && f.endsWith(".jsonl")) : [];
    if (match.length !== 1) throw new Error(match.length ? `"${id}" matches ${match.length} sessions` : `No session "${id}" in this workspace`);
    const file = join(dir, match[0]!);
    const records = readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SessionRecord);
    const meta = records[0];
    if (!meta || meta.type !== "meta") throw new Error(`Corrupt session file ${file}`);
    const s = new Session(meta.id, file, meta);
    s.replay(records);
    return s;
  }

  static list(workspace: string): { id: string; created: string; title?: string; model: string; messages: number; costUsd: number; status?: string; mtime: number }[] {
    const dir = join(projectDir(workspace), "sessions");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const s = Session.load(workspace, f.replace(/\.jsonl$/, ""));
        return { id: s.id, created: s.meta.created, title: s.title, model: s.meta.model, messages: s.messages.length, costUsd: s.costUsd, status: s.status, mtime: statSync(s.file).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  /** Copy this session's history into a new session (optionally only the first `upTo` messages). */
  fork(upTo?: number): Session {
    const child = Session.create(this.meta.workspace, this.meta.model, this.id);
    for (const m of this.messages.slice(0, upTo ?? this.messages.length)) child.addMessage(m);
    child.setTitle(`fork of ${this.title ?? this.id}`);
    return child;
  }

  private replay(records: SessionRecord[]) {
    for (const r of records) {
      if (r.type === "message") this.messages.push(r.message);
      else if (r.type === "usage") {
        this.usage = addUsage(this.usage, r.usage);
        this.costUsd += r.costUsd;
      } else if (r.type === "compaction") this.messages = [summaryMessage(r.summary), ...this.messages.slice(this.messages.length - r.keep)];
      else if (r.type === "meta" && r.title) this.title = r.title;
      else if (r.type === "status") this.status = r.status;
    }
  }

  private write(r: SessionRecord) {
    appendFileSync(this.file, JSON.stringify(r) + "\n");
  }

  /** Raw records, for replay views. */
  records(): SessionRecord[] {
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SessionRecord);
  }

  addMessage(m: Message) {
    this.messages.push(m);
    this.write({ type: "message", message: m });
  }

  addUsage(model: string, usage: Usage, costUsd: number) {
    this.usage = addUsage(this.usage, usage);
    this.costUsd += costUsd;
    this.write({ type: "usage", model, usage, costUsd });
  }

  compact(summary: string, keep: number) {
    this.messages = [summaryMessage(summary), ...this.messages.slice(this.messages.length - keep)];
    this.write({ type: "compaction", summary, keep });
  }

  setTitle(title: string) {
    this.title = title;
    this.write({ ...this.meta, title });
  }

  setStatus(status: "running" | "done" | "error", detail?: string) {
    this.status = status;
    this.write({ type: "status", status, detail, at: new Date().toISOString() });
  }
}
