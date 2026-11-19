// How well do Galley's trouble signals tell a failing run from a passing one? Replays the signal watcher
// (galley/src/agent/signals.ts) over the session files that benchmark rounds keep, and compares when it would have
// fired with each run's graded result. Nothing is run and no model is called.
//
//   bun bench/signals.ts <rounds-dir> [<rounds-dir> …]
//
// Each argument is either one round (a folder with results.jsonl and runs/) or a folder of rounds. Only the first
// attempt of each task-run is replayed, and only the main agent's session (not its helpers'). The result to compare
// with is `pass`, which is the first attempt's in every round.
import { LIMITS, Watch } from "../galley/src/agent/signals.ts";
import type { ToolCall, ToolResult } from "../galley/src/core/types.ts";
import { conditionKey, firstAttempt, pct, roundDirs, taskRuns, type SessionRecord, type TaskRun } from "./sessions.ts";

export interface Replayed {
  steps: number;
  /** Signal kind → the step at which it first fired. */
  fired: Map<string, number>;
}

/** Replay the first attempt through the watcher. It is never re-armed: in these rounds nothing acted on a signal,
 *  so each kind fires at most once, as it would have. */
export function replay(recs: SessionRecord[] | undefined, maxSteps: number): Replayed {
  const watch = new Watch(maxSteps);
  const fired = new Map<string, number>();
  const ms = firstAttempt(recs);
  let step = 0;
  // The live loop counts a step for every model call, also one that only answered (a check failure or a review
  // then sent it back): so does the replay, or the long-run signal would fire later than it did.
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]!;
    if (m.role !== "assistant") continue;
    const next = ms[i + 1];
    // Live, the watcher is not consulted on the last step allowed.
    if (m.toolCalls.length && next?.role === "tool" && step < maxSteps - 1) {
      const sig = watch.step(step, m.toolCalls as ToolCall[], next.results as ToolResult[]);
      if (sig && !fired.has(sig.kind)) fired.set(sig.kind, step);
    }
    step++;
  }
  return { steps: step, fired };
}

export const maxStepsOf = (r: TaskRun) => (typeof r.config?.maxSteps === "number" ? (r.config.maxSteps as number) : 60);

export const KINDS = ["same-check", "same-call", "tool-errors", "long-run", "any"];

/** Markdown table: how often each signal fires on failing and passing runs, and how well it separates them within
 *  one task. Pooled figures reward a signal for spotting hard tasks, which a harness cannot change. */
export function signalTable(runs: (TaskRun & Replayed)[]): string[] {
  const failing = runs.filter((r) => !r.pass);
  const passing = runs.filter((r) => r.pass);
  const byTask = new Map<string, (TaskRun & Replayed)[]>();
  for (const r of runs) byTask.set(conditionKey(r), [...(byTask.get(conditionKey(r)) ?? []), r]);
  const has = (r: Replayed, k: string) => (k === "any" ? r.fired.size > 0 : r.fired.has(k));
  const out = ["| Signal | Fires on failing runs | Fires on passing runs | Of the runs it fires on, share that failed | Within one task: AUC (0.5 = chance) | Pairs |", "|---|---|---|---|---|---|"];
  for (const k of KINDS) {
    const f = failing.filter((r) => has(r, k)).length;
    const p = passing.filter((r) => has(r, k)).length;
    let score = 0;
    let pairs = 0;
    for (const group of byTask.values())
      for (const a of group.filter((r) => !r.pass))
        for (const b of group.filter((r) => r.pass)) {
          pairs++;
          score += has(a, k) === has(b, k) ? 0.5 : has(a, k) ? 1 : 0;
        }
    out.push(`| ${k} | ${f} of ${failing.length} (${pct(f, failing.length)}) | ${p} of ${passing.length} (${pct(p, passing.length)}) | ${pct(f, f + p)} | ${pairs ? (score / pairs).toFixed(3) : "n/a"} | ${pairs} |`);
  }
  return out;
}

export function replayRuns(runs: TaskRun[]): (TaskRun & Replayed)[] {
  return runs.filter((r) => r.agent.startsWith("galley") && r.main).map((r) => ({ ...r, ...replay(r.main, maxStepsOf(r)) }));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("usage: bun bench/signals.ts <rounds-dir> [<rounds-dir> …]");
    process.exit(2);
  }
  const dirs = roundDirs(args);
  const runs = replayRuns(dirs.flatMap((d) => taskRuns(d, { sessions: true })));
  const failing = runs.filter((r) => !r.pass).length;
  console.log(`${runs.length} task-runs replayed (${failing} failed, ${runs.length - failing} passed) from ${new Set(runs.map((r) => r.round)).size} rounds.`);
  console.log(`Limits: same check ${LIMITS.sameCheck}, same call ${LIMITS.sameCall}, tool errors ${LIMITS.toolErrors}, long run at ${LIMITS.longRun.toFixed(2)} of the step limit.\n`);
  console.log(signalTable(runs).join("\n"));
  const byTask = new Map<string, boolean[]>();
  for (const r of runs) byTask.set(conditionKey(r), [...(byTask.get(conditionKey(r)) ?? []), r.pass]);
  const both = [...byTask.values()].filter((g) => g.includes(true) && g.includes(false)).length;
  console.log(`\n${both} task conditions (task, agent, model, effort, step limit) have both a failing and a passing run; each pair compares one of each within one condition.`);
}
