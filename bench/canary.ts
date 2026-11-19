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
// likely (one-sided, p < 0.05). Tasks Galley was developed on are fine here: the canary looks for breakage, it does
// not count towards a win. No model is called by this script.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isCanary, isDefaultGalley, modelsByRun, roundDirs, runKey, taskRuns } from "./sessions.ts";

const FILE = join(import.meta.dir, "canary.json");
const SKIP_ROUNDS = /invalid|aborted|smoke|dry|dump|selftest|probe|try|canary/i;
/** Tasks the round reports leave out of scoring: broken in the benchmark itself (report.ts). */
const EXCLUDED = new Set(["rust/macros", "go/octal"]);

interface Canary {
  selected: string;
  model: string;
  effort: string;
  /** Task → [passed, runs] in history. */
  stable: Record<string, [number, number]>;
  hard: Record<string, [number, number]>;
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
  const history = new Map<string, [number, number]>();
  for (const round of roundDirs(args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")))) {
    if (SKIP_ROUNDS.test(basename(round)) || isCanary(round)) continue;
    const models = modelsByRun(round);
    for (const r of taskRuns(round)) {
      if (!isDefaultGalley(r) || !langs.has(r.lang) || EXCLUDED.has(r.task)) continue;
      if (r.config!.effort !== effort || models.get(runKey(r)) !== model) continue;
      const h = history.get(r.task) ?? [0, 0];
      h[1]++;
      if (r.pass) h[0]++;
      history.set(r.task, h);
    }
  }
  const byHash = (xs: [string, [number, number]][]) => xs.sort((a, b) => (hash(a[0]) < hash(b[0]) ? -1 : 1));
  const enough = [...history].filter(([, [, n]]) => n >= 4);
  const stable = byHash(enough.filter(([, [k, n]]) => k / n >= 0.9)).slice(0, 24);
  const hard = byHash(enough.filter(([, [k]]) => k === 0)).slice(0, 6);
  if (!stable.length) {
    console.error("No stable task qualifies (check the rounds path, --model, --effort and --langs); canary.json left unchanged.");
    process.exit(1);
  }
  const c: Canary = { selected: new Date().toISOString().slice(0, 10), model, effort, stable: Object.fromEntries(stable), hard: Object.fromEntries(hard) };
  writeFileSync(FILE, JSON.stringify(c, null, 1) + "\n");
  console.log(`${history.size} tasks with history; ${enough.length} with four runs or more. Chose ${stable.length} stable and ${hard.length} hard tasks.`);
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
  // One chance of failing for every stable task, from their pooled history with one failure and one pass added
  // (so that it is never zero). A prior on each task's own five runs would put each at 1 in 7 and hide a large
  // regression; pooled, 0 failures in 120 runs gives 1 in 122.
  const fails = stable.reduce((a, [, [k, n]]) => a + n - k, 0);
  const total = stable.reduce((a, [, [, n]]) => a + n, 0);
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
