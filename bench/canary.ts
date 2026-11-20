// The regression canary: a small fixed set of tasks that Galley has run many times, run again after a change, to
// catch a change that breaks what used to work before a full round is spent on it.
//
//   bun bench/canary.ts select <rounds-dir> [--model deepseek-flash] [--effort high] [--langs python,go,rust]
//       Picks the canary from history and writes bench/canary.json.
//   bun bench/canary.ts check <round-dir>
//       Judges a canary round against that history.
//   bench/canary.sh
//       Runs the canary round (Galley only) and checks it. About $0.20 on DeepSeek at off-peak price.
//
// The canary is 24 tasks Galley passed in at least 90% of at least four runs, and 6 it failed in all of at least
// four: the first catch breakage, the second show a fix. Chosen by hash among those that qualify, so the choice
// does not lean on the author. A change "regresses" when it fails more of the stable tasks than their history makes
// likely (one-sided, p < 0.05). How likely is measured on rounds the choice did not see: the tasks were picked for
// a good history, so that same history makes them look safer than they are. Tasks Galley was developed on are fine here: the canary looks for breakage, it does
// not count towards a win. No model is called by this script.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isCanary, isDefaultGalley, modelsByRun, roundDirs, runKey, taskRuns } from "./sessions.ts";

const FILE = join(import.meta.dir, "canary.json");
const SKIP_ROUNDS = /invalid|aborted|smoke|dry|dump|selftest|probe|try|fake|canary/i;
/** Tasks the round reports leave out of scoring: broken in the benchmark itself (report.ts). */
const EXCLUDED = new Set(["rust/macros", "go/octal"]);

interface Canary {
  selected: string;
  model: string;
  effort: string;
  /** Task → [passed, runs] in history. */
  stable: Record<string, [number, number]>;
  hard: Record<string, [number, number]>;
  /** [failed, runs] of the stable tasks in rounds left out of their choice, one round at a time. */
  heldOut?: [number, number];
}

const flag = (args: string[], name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : dflt;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function select(args: string[]) {
  const model = flag(args, "model", "deepseek-flash");
  const effort = flag(args, "effort", "high");
  const langs = new Set(flag(args, "langs", "python,go,rust").split(","));
  // Each round's runs at this setting: task → [passed, runs].
  const perRound: Map<string, [number, number]>[] = [];
  for (const round of roundDirs(args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")))) {
    if (SKIP_ROUNDS.test(basename(round)) || isCanary(round)) continue;
    const models = modelsByRun(round);
    const runs = new Map<string, [number, number]>();
    for (const r of taskRuns(round)) {
      if (!isDefaultGalley(r) || !langs.has(r.lang) || EXCLUDED.has(r.task)) continue;
      if (r.config!.effort !== effort || models.get(runKey(r)) !== model) continue;
      const h = runs.get(r.task) ?? [0, 0];
      h[1]++;
      if (r.pass) h[0]++;
      runs.set(r.task, h);
    }
    if (runs.size) perRound.push(runs);
  }
  const choose = (rounds: Map<string, [number, number]>[]) => {
    const history = new Map<string, [number, number]>();
    for (const runs of rounds)
      for (const [t, [k, n]] of runs) {
        const h = history.get(t) ?? [0, 0];
        history.set(t, [h[0] + k, h[1] + n]);
      }
    const byHash = (xs: [string, [number, number]][]) => xs.sort((a, b) => (hash(a[0]) < hash(b[0]) ? -1 : 1));
    const enough = [...history].filter(([, [, n]]) => n >= 4);
    return { history, enough, stable: byHash(enough.filter(([, [k, n]]) => k / n >= 0.9)).slice(0, 24), hard: byHash(enough.filter(([, [k]]) => k === 0)).slice(0, 6) };
  };
  const { history, enough, stable, hard } = choose(perRound);
  // How often tasks chosen this way fail in a round the choice did not see: each round in turn is left out, the
  // canary chosen again from the others, and its stable tasks' results in the left-out round counted.
  const heldOut: [number, number] = [0, 0];
  perRound.forEach((left, i) => {
    for (const [t] of choose(perRound.filter((_, j) => j !== i)).stable) {
      const r = left.get(t);
      if (r) {
        heldOut[0] += r[1] - r[0];
        heldOut[1] += r[1];
      }
    }
  });
  if (!stable.length) {
    console.error("No stable task qualifies (check the rounds path, --model, --effort and --langs); canary.json left unchanged.");
    process.exit(1);
  }
  const c: Canary = { selected: new Date().toISOString().slice(0, 10), model, effort, stable: Object.fromEntries(stable), hard: Object.fromEntries(hard), heldOut };
  writeFileSync(FILE, JSON.stringify(c, null, 1) + "\n");
  console.log(`${history.size} tasks with history; ${enough.length} with four runs or more. Chose ${stable.length} stable and ${hard.length} hard tasks. In rounds left out of the choice, tasks chosen as stable failed ${heldOut[0]} of ${heldOut[1]} runs.`);
  console.log(`ONLY=${[...stable, ...hard].map(([t]) => t).join(",")}`);
}

/** Probability of at least `k` failures when each task i fails with probability p[i] (Poisson binomial). */
function atLeast(k: number, p: number[]): number {
  let dist = [1];
  for (const q of p) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((v, i) => {
      next[i] += v * (1 - q);
      next[i + 1] += v * q;
    });
    dist = next;
  }
  return dist.slice(k).reduce((a, b) => a + b, 0);
}

function check(round: string) {
  const c = JSON.parse(readFileSync(FILE, "utf8")) as Canary;
  // Only runs at the canary's own model and effort count: history at one setting says nothing about another.
  const models = modelsByRun(round);
  const runs = taskRuns(round).filter((r) => r.agent.startsWith("galley") && r.config?.effort === c.effort && models.get(runKey(r)) === c.model);
  const got = new Map(runs.map((r) => [r.task, r.pass]));
  const stable = Object.entries(c.stable).filter(([t]) => got.has(t));
  const failed = stable.filter(([t]) => !got.get(t));
  // One chance of failing for every stable task, from rounds left out of the choice, with one failure and one pass
  // added so that it is never zero. Their own history would understate it: they were chosen because it was good.
  // A prior on each task's five runs (1 in 7 each) would hide a large regression.
  let [fails, total] = c.heldOut ?? [0, 0];
  if (!c.heldOut) {
    fails = Object.values(c.stable).reduce((a, [k, n]) => a + n - k, 0);
    total = Object.values(c.stable).reduce((a, [, n]) => a + n, 0);
    console.log("canary.json has no held-out failure rate (run select again): the rate is taken from the history that chose the tasks, which makes false alarms more likely.");
  }
  const p = stable.map(() => (fails + 1) / (total + 2));
  const pValue = atLeast(failed.length, p);
  const expected = p.reduce((a, b) => a + b, 0);
  const hard = Object.keys(c.hard).filter((t) => got.has(t));
  const fixed = hard.filter((t) => got.get(t));
  console.log(`Canary round: ${stable.length} of ${Object.keys(c.stable).length} stable tasks and ${hard.length} of ${Object.keys(c.hard).length} hard tasks were run.`);
  console.log(`Stable tasks failed: ${failed.length} (history makes ${expected.toFixed(1)} likely; chance of ${failed.length} or more: ${pValue.toFixed(3)}).${failed.length ? " " + failed.map(([t]) => t).join(", ") : ""}`);
  console.log(`Hard tasks passed: ${fixed.length}${fixed.length ? ": " + fixed.join(", ") : ""}.`);
  const missing = Object.keys({ ...c.stable, ...c.hard }).filter((t) => !got.has(t));
  if (missing.length) console.log(`Not run (or not at ${c.model}, effort ${c.effort}): ${missing.join(", ")}.`);
  const missingStable = Object.keys(c.stable).filter((t) => !got.has(t));
  if (!Object.keys(c.stable).length) {
    console.log("INCONCLUSIVE: canary.json lists no stable task. Run canary.ts select first.");
    process.exitCode = 1;
  } else if (pValue < 0.05) {
    console.log("REGRESSION: more stable tasks failed than history explains. Look before running a full round.");
    process.exitCode = 1;
  } else if (missingStable.length) {
    // A Galley that crashes on some tasks records no result for them: that is no pass.
    console.log(`INCONCLUSIVE: ${missingStable.length} stable tasks have no result (an infrastructure error, a crash, or another setting). Run them again before trusting the canary.`);
    process.exitCode = 1;
  } else console.log("No regression detected.");
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "select" && rest.length) select(rest);
else if (cmd === "check" && rest[0] && existsSync(join(rest[0], "results.jsonl"))) check(rest[0]);
else {
  console.error("usage: bun bench/canary.ts select <rounds-dir> [--model m] [--effort e] [--langs a,b]\n       bun bench/canary.ts check <round-dir>");
  process.exit(2);
}
