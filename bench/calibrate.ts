// Settings fitted from logs. Galley has thresholds that were set by judgement: when a trouble signal fires, how
// many failed checks a turn feeds back. This report measures them on the kept rounds and proposes a change only
// when the data are enough to support one. It changes nothing itself.
//
//   bun bench/calibrate.ts <rounds-dir> [<rounds-dir> …]
//
// Signals: the watcher is replayed over first attempts at other thresholds, and each setting is scored by how well
// it tells a failing run from a passing run of the same task (AUC; 0.5 is chance). A different setting is proposed
// only if it is better by 0.02 or more and fires on at least 30 failing runs. Checks: from the check records Galley
// writes, how many failed checks came before a turn's first pass; checkRounds is proposed as the number of failures
// that covers 90% of the turns that passed after at least one failure, once there are 30 such turns.
// No model is called.
import { LIMITS } from "../galley/src/agent/signals.ts";
import { conditionKey, roundDirs, taskRuns, type SessionRecord, type TaskRun } from "./sessions.ts";
import { maxStepsOf, replay } from "./signals.ts";

const MIN_FIRES = 30;
const MIN_GAIN = 0.02;

type Kind = "sameCheck" | "sameCall" | "toolErrors" | "longRun";
const KIND_NAME: Record<Kind, string> = { sameCheck: "same-check", sameCall: "same-call", toolErrors: "tool-errors", longRun: "long-run" };
const GRID: Record<Kind, number[]> = { sameCheck: [2, 3, 4, 5], sameCall: [2, 3, 4, 5], toolErrors: [2, 3, 4, 6], longRun: [0.4, 0.5, 2 / 3, 0.8] };

function score(runs: TaskRun[], fires: Map<TaskRun, boolean>) {
  const byTask = new Map<string, TaskRun[]>();
  for (const r of runs) byTask.set(conditionKey(r), [...(byTask.get(conditionKey(r)) ?? []), r]);
  let s = 0;
  let pairs = 0;
  for (const g of byTask.values())
    for (const a of g.filter((r) => !r.pass))
      for (const b of g.filter((r) => r.pass)) {
        pairs++;
        s += fires.get(a) === fires.get(b) ? 0.5 : fires.get(a) ? 1 : 0;
      }
  const failFires = runs.filter((r) => !r.pass && fires.get(r)).length;
  const passFires = runs.filter((r) => r.pass && fires.get(r)).length;
  return { auc: pairs ? s / pairs : 0.5, failFires, passFires, pairs };
}

function signals(runs: TaskRun[]) {
  const failing = runs.filter((r) => !r.pass).length;
  console.log(`## Trouble signals\n\n${runs.length} first attempts (${failing} failed) replayed at each threshold.\n`);
  console.log("| Signal | Threshold | Fires on failing | Fires on passing | Within one task: AUC | Current |");
  console.log("|---|---|---|---|---|---|");
  const original = { ...LIMITS };
  const proposals: string[] = [];
  for (const kind of Object.keys(GRID) as Kind[]) {
    const rows = GRID[kind].map((v) => {
      // Only the kind being swept can fire: the watcher reports one kind per step, so another kind reaching its limit
      // on the same step would otherwise hide this one and make each kind's figures depend on the others' limits.
      for (const k of Object.keys(GRID) as Kind[]) (LIMITS as Record<Kind, number>)[k] = k === kind ? v : Infinity;
      const fires = new Map(runs.map((r) => [r, replay(r.main, maxStepsOf(r)).fired.has(KIND_NAME[kind])]));
      Object.assign(LIMITS, original);
      return { v, ...score(runs, fires) };
    });
    const current = rows.find((r) => Math.abs(r.v - original[kind]) < 1e-9)!;
    if (!current) throw new Error(`the current ${kind} limit (${original[kind]}) is not on the grid`);
    for (const r of rows) console.log(`| ${KIND_NAME[kind]} | ${kind === "longRun" ? r.v.toFixed(2) : r.v} | ${r.failFires} | ${r.passFires} | ${r.auc.toFixed(3)} | ${r === current ? "yes" : ""} |`);
    const best = rows.filter((r) => r.failFires >= MIN_FIRES).sort((a, b) => b.auc - a.auc)[0];
    if (best && best !== current && best.auc - current.auc >= MIN_GAIN) proposals.push(`${KIND_NAME[kind]}: ${best.v} instead of ${original[kind]} (AUC ${best.auc.toFixed(3)} against ${current.auc.toFixed(3)}, fires on ${best.failFires} failing runs)`);
  }
  console.log("");
  if (proposals.length) console.log(`Proposed (check on fresh rounds before adopting):\n${proposals.map((p) => `- ${p}`).join("\n")}`);
  else console.log(`No change proposed: no threshold fires on ${MIN_FIRES} or more failing runs and beats the current one by ${MIN_GAIN} in AUC.`);
}

function checks(runs: TaskRun[]) {
  console.log("\n## Check rounds\n");
  const turns: { fails: number; endedPassing: boolean }[] = [];
  for (const r of runs) {
    // The check records of one turn: by the turn number Galley writes, or, without it, a new turn wherever the
    // round count starts again at 1. In a turn, the failures before its first pass; it ended passing if its last
    // check passed.
    const groups: Extract<SessionRecord, { type: "check" }>[][] = [];
    let prev: Extract<SessionRecord, { type: "check" }> | undefined;
    for (const rec of r.main ?? []) {
      // Each `galley run` (the harness's second attempt is another) starts its turns afresh.
      if (rec.type === "run") {
        prev = undefined;
        continue;
      }
      if (rec.type !== "check") continue;
      const c = rec as Extract<SessionRecord, { type: "check" }>;
      const newTurn = !prev || (c.turn !== undefined ? c.turn !== prev.turn : c.round === 1 && (prev.round > 1 || prev.passed));
      if (newTurn) groups.push([]);
      groups.at(-1)!.push(c);
      prev = c;
    }
    for (const g of groups) {
      const firstPass = g.findIndex((c) => c.passed);
      turns.push({ fails: firstPass < 0 ? g.length : firstPass, endedPassing: g.at(-1)!.passed });
    }
  }
  if (!turns.length) {
    console.log("No check records yet: no kept round ran with `--check`.");
    return;
  }
  const passing = turns.filter((t) => t.endedPassing);
  const retried = passing.filter((t) => t.fails > 0);
  console.log(`${turns.length} turns ran the check: ${passing.length} ended passing, ${retried.length} of them after at least one failure; ${turns.length - passing.length} ended failing.`);
  const maxFails = Math.max(...passing.map((t) => t.fails), 0);
  for (let k = 0; k <= maxFails; k++) console.log(`- passed after ${k} failed check${k === 1 ? "" : "s"}: ${passing.filter((t) => t.fails === k).length}`);
  if (retried.length < MIN_FIRES) {
    console.log(`\nNo change proposed: ${retried.length} turns passed after a failure; ${MIN_FIRES} are needed.`);
    return;
  }
  const sorted = retried.map((t) => t.fails).sort((a, b) => a - b);
  const k90 = sorted[Math.ceil(sorted.length * 0.9) - 1]!;
  console.log(`\nProposed checkRounds: ${k90} (covers 90% of the turns that passed after a failure).`);
  console.log("This can only confirm or lower the current limit: a turn that needed more rounds than allowed ended failing and is not in these counts. Compare the number that ended failing.");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("usage: bun bench/calibrate.ts <rounds-dir> [<rounds-dir> …]");
    process.exit(2);
  }
  const runs = roundDirs(args)
    .flatMap((d) => taskRuns(d, { sessions: true }))
    .filter((r) => r.agent.startsWith("galley") && r.main);
  console.log(`# Calibration from ${runs.length} Galley task-runs\n`);
  signals(runs);
  checks(runs);
}
