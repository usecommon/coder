// Lessons a project teaches, kept only when its own check proves them. When a turn's check fails and later passes,
// one short note is written: what caused the failure and what fixed it. A later session reads back at most one, the
// note that shares the most words with its request, and only while the files it was about still exist.
//
// Why this shape (research/reports, area 7): memory written and read by the same model added 2 to 6 points on
// SWE-bench tasks, one retrieved experience did best and more did worse, memory that was not checked did harm, and a
// model's self-written skills lowered results. So: one note, written only after something ran and passed, and read
// back as a hint that may be out of date. Off unless `lessons` is set. Not measured in Galley.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "../session/store.ts";

export interface Lesson {
  text: string;
  check: string;
  /** Files changed in the turn the lesson came from, relative to the workspace. */
  files: string[];
  at: string;
}

const MAX_LESSONS = 50;
const file = (workspace: string) => join(projectDir(workspace), "lessons.jsonl");

export function loadLessons(workspace: string): Lesson[] {
  const f = file(workspace);
  if (!existsSync(f)) return [];
  const out: Lesson[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    try {
      if (line) out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

/** Hold a lock file while `fn` runs, so two Galley processes in one project do not lose each other's lessons.
 *  A lock older than ten seconds is taken to be left over from a process that died. */
function locked<T>(lock: string, fn: () => T): T {
  for (let i = 0; ; i++) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10_000) unlinkSync(lock);
      } catch {}
      if (i > 200) throw new Error(`could not lock ${lock}`);
      Bun.sleepSync(10);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lock);
    } catch {}
  }
}

export function saveLesson(workspace: string, lesson: Lesson): void {
  mkdirSync(projectDir(workspace), { recursive: true });
  locked(`${file(workspace)}.lock`, () => write(workspace, lesson));
}

function write(workspace: string, lesson: Lesson): void {
  const all = [...loadLessons(workspace), lesson];
  if (all.length > MAX_LESSONS) {
    // Rewritten whole through a temporary file, so a crash cannot leave it cut short.
    const tmp = `${file(workspace)}.${process.pid}.tmp`;
    writeFileSync(tmp, all.slice(-MAX_LESSONS).map((l) => JSON.stringify(l)).join("\n") + "\n");
    renameSync(tmp, file(workspace));
  }
  else appendFileSync(file(workspace), JSON.stringify(lesson) + "\n");
}

/** Words of four letters or more, reduced to a rough stem so that "contains" meets "contain". */
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z_][a-z0-9_]{3,}/g) ?? []).map(stem));

/** The one lesson most related to the request: at least two words in common, or a file it was about named in the
 *  request, and none of its files gone. Undefined when none qualifies: no note is better than an unrelated one. */
export function pickLesson(workspace: string, request: string, home = workspace): Lesson | undefined {
  const want = words(request);
  let best: { l: Lesson; score: number } | undefined;
  for (const l of loadLessons(home)) {
    // A lesson about files that are gone is about code that is gone. (Changes made through the shell are not tracked,
    // so a lesson may name no files; it is then judged by its words alone.)
    if (l.files.some((f) => !existsSync(join(workspace, f)))) continue;
    const have = words(`${l.text} ${l.files.join(" ")}`);
    // A file the lesson was about, named in the request, counts as much as two shared words.
    const named = l.files.filter((f) => request.includes(f.split("/").pop()!)).length;
    const score = [...want].filter((w) => have.has(w)).length + 2 * named;
    if (score >= 2 && (!best || score > best.score || (score === best.score && l.at > best.l.at))) best = { l, score };
  }
  return best?.l;
}

/** A lesson is text a model wrote from command output, read back into a later session's first message. Angle
 *  brackets are taken out so it cannot close the note early and pass for the user's own words. */
const plain = (s: string) => s.replace(/[<>]/g, "");

export const lessonNote = (l: Lesson) =>
  `<project_note>\nA note from earlier work in this project, kept because the project's check (\`${l.check}\`) passed after it. It may be out of date: trust the code over it.\n${plain(l.text)}\n</project_note>`;

export const LESSON_REQUEST =
  "The project's check failed earlier in this turn and now passes. In one sentence of at most 200 characters, write what a future agent " +
  "working in this project should know from this: the cause of the failure and what fixed it, stated as general advice about this project " +
  "(a command, a convention, a trap), not about this task. If there is nothing general to learn, reply with exactly: NONE";
