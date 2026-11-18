// How well do Galley's trouble signals tell a failing run from a passing one? Replays the signal watcher
// (galley/src/agent/signals.ts) over the session files that benchmark rounds keep, and compares when it would have
// fired with each run's graded result. Nothing is run and no model is called.
//
//   bun bench/signals.ts <rounds-dir> [<rounds-dir> …]
//
// Each argument is either one round (a folder with results.jsonl and runs/) or a folder of rounds. Only the first
// attempt of each task-run is replayed, and only the main agent's session (not its helpers'). The result to compare
// with is `pass`, which is the first attempt's in every round.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { LIMITS, Watch } from "../galley/src/agent/signals.ts";
import type { Message, ToolCall, ToolResult } from "../galley/src/core/types.ts";

interface Run {
  round: string;
  agent: string;
  task: string;
  pass: boolean;
  steps: number;
  fired: Map<string, number>; // kind → step at which it first fired
}

function rounds(dirs: string[]): string[] {
  const out: string[] = [];
  for (const d of dirs) {
    if (existsSync(join(d, "results.jsonl"))) out.push(d);
    else for (const sub of existsSync(d) ? readdirSync(d) : []) if (existsSync(join(d, sub, "results.jsonl"))) out.push(join(d, sub));
  }
  return out.sort();
}

/** The main agent's session file of one task-run: the one with no parent. */
function sessionFile(run: string): string | undefined {
  const root = join(run, "galley-data", "projects");
  for (const project of existsSync(root) ? readdirSync(root) : []) {
    const dir = join(root, project, "sessions");
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      if (!f.endsWith(".jsonl")) continue;
      const first = readFileSync(join(dir, f), "utf8").split("\n")[0];
      try {
        const meta = JSON.parse(first!);
        if (meta.type === "meta" && !meta.parentId) return join(dir, f);
      } catch {}
    }
  }
  return undefined;
}

function maxSteps(run: string): number {
  for (const p of [join(run, "config", "galley", "config.json"), join(run, "config", "config.json")]) {
    try {
      const n = JSON.parse(readFileSync(p, "utf8")).maxSteps;
      if (typeof n === "number") return n;
    } catch {}
  }
  return 60;
}

/** Replay the first attempt of a session through the watcher. The watcher is never re-armed: in these rounds
 *  nothing acted on a signal, so each kind fires at most once, as it would have. */
function replay(file: string, limit: number): { steps: number; fired: Map<string, number> } {
  const messages: Message[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.type === "message") messages.push(r.message);
  }
  const watch = new Watch(limit);
  const fired = new Map<string, number>();
  let step = 0;
  let users = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role === "user" && ++users > 1) break; // the second attempt, or a message from the harness
    if (m.role !== "assistant" || !m.toolCalls.length) continue;
    const next = messages[i + 1];
    if (next?.role !== "tool") continue;
    const sig = watch.step(step, m.toolCalls as ToolCall[], next.results as ToolResult[]);
    if (sig && !fired.has(sig.kind)) fired.set(sig.kind, step);
    step++;
  }
  return { steps: step, fired };
}

function load(round: string): Run[] {
  const out: Run[] = [];
  for (const line of readFileSync(join(round, "results.jsonl"), "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (!String(r.agent).startsWith("galley") || typeof r.pass !== "boolean") continue;
    const run = join(round, "runs", r.agent, r.lang, r.name);
    const file = sessionFile(run);
    if (!file) continue;
    const { steps, fired } = replay(file, maxSteps(run));
    out.push({ round: basename(round), agent: r.agent, task: `${r.lang}/${r.name}`, pass: r.pass, steps, fired });
  }
  return out;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");

function report(runs: Run[]) {
  const failing = runs.filter((r) => !r.pass);
  const passing = runs.filter((r) => r.pass);
  console.log(`${runs.length} task-runs replayed (${failing.length} failed, ${passing.length} passed) from ${new Set(runs.map((r) => r.round)).size} rounds.`);
  console.log(`Limits: same check ${LIMITS.sameCheck}, same call ${LIMITS.sameCall}, tool errors ${LIMITS.toolErrors}, long run at ${LIMITS.longRun.toFixed(2)} of the step limit.\n`);

  // Within one task: pairs of a failing and a passing run of the same task. A signal that tells them apart fires on
  // the failing one and not on the passing one. Pooled figures reward a signal for spotting hard tasks, which a
  // harness cannot change (research/reports, area 2).
  const byTask = new Map<string, Run[]>();
  for (const r of runs) byTask.set(r.task, [...(byTask.get(r.task) ?? []), r]);
  const kinds = ["same-check", "same-call", "tool-errors", "long-run", "any"];
  const has = (r: Run, k: string) => (k === "any" ? r.fired.size > 0 : r.fired.has(k));
  console.log("| Signal | Fires on failing runs | Fires on passing runs | Of the runs it fires on, share that failed | Within one task: AUC (0.5 = chance) | Pairs |");
  console.log("|---|---|---|---|---|---|");
  for (const k of kinds) {
    const f = failing.filter((r) => has(r, k)).length;
    const p = passing.filter((r) => has(r, k)).length;
    let score = 0;
    let pairs = 0;
    for (const group of byTask.values()) {
      const fs = group.filter((r) => !r.pass);
      const ps = group.filter((r) => r.pass);
      for (const a of fs)
        for (const b of ps) {
          pairs++;
          score += has(a, k) === has(b, k) ? 0.5 : has(a, k) ? 1 : 0;
        }
    }
    console.log(`| ${k} | ${f} of ${failing.length} (${pct(f, failing.length)}) | ${p} of ${passing.length} (${pct(p, passing.length)}) | ${pct(f, f + p)} | ${pairs ? (score / pairs).toFixed(3) : "n/a"} | ${pairs} |`);
  }
  const tasks = [...byTask.values()].filter((g) => g.some((r) => r.pass) && g.some((r) => !r.pass)).length;
  console.log(`\n${tasks} tasks have both a failing and a passing run; each pair compares one of each.`);
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: bun bench/signals.ts <rounds-dir> [<rounds-dir> …]");
  process.exit(2);
}
report(rounds(args).flatMap(load));
