// Model profiles from Galley's own runs. Public boards measure models on hard terminal tasks; this measures them
// on the tasks Galley's benchmark has run, with Galley as the harness, from the rounds kept on disk.
//
//   bun bench/profiles.ts <rounds-dir> [<rounds-dir> …] [--write]
//
// Only task-runs of Galley at its defaults count: a variant whose config changes anything but the model, the
// effort or the step limit is left out, and so are rounds whose names say they were dry runs, smoke tests or
// invalid. The result is the first attempt. Cost is the first attempt's, at list price. With --write the figures
// go to galley/src/provider/measured.json, which `galley models` reads. No model is called.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { costByRun, modelsByRun, roundDirs, runKey, taskRuns, wilson } from "./sessions.ts";

const SKIP_ROUNDS = /invalid|aborted|smoke|dry|dump|selftest|probe|try/i;
const NEUTRAL_KEYS = new Set(["effort", "providers", "model", "smallModel", "maxSteps"]);

export interface Measured {
  /** Reasoning effort, or "default" when the run left it to Galley's default of the time. */
  effort: string;
  tasks: number;
  solved: number;
  /** 95% interval for the share solved, in percent. */
  ci: [number, number];
  costPerTask: number;
  byLanguage: Record<string, [solved: number, tasks: number]>;
  rounds: number;
  from: string;
  to: string;
}

const refOf = (model: string) => (model.startsWith("claude-") ? `anthropic/${model}` : `deepseek/${model}`);

export function measure(dirs: string[]): Record<string, Measured[]> {
  type Acc = { solved: number; tasks: number; cost: number; langs: Record<string, [number, number]>; rounds: Set<string>; from: number; to: number };
  const acc = new Map<string, Acc>();
  for (const round of dirs) {
    if (SKIP_ROUNDS.test(round.split("/").pop()!)) continue;
    const models = modelsByRun(round);
    const cost = costByRun(round, { firstOnly: true });
    for (const r of taskRuns(round)) {
      if (!r.agent.startsWith("galley") || !r.config) continue;
      if (Object.keys(r.config).some((k) => !NEUTRAL_KEYS.has(k))) continue;
      const model = models.get(runKey(r));
      if (!model) continue;
      const effort = typeof r.config.effort === "string" ? r.config.effort : "default";
      const key = `${refOf(model)}|${effort}`;
      const a = acc.get(key) ?? { solved: 0, tasks: 0, cost: 0, langs: {}, rounds: new Set(), from: Infinity, to: 0 };
      a.tasks++;
      if (r.pass) a.solved++;
      a.cost += cost.get(runKey(r)) ?? 0;
      const l = (a.langs[r.lang] ??= [0, 0]);
      l[1]++;
      if (r.pass) l[0]++;
      a.rounds.add(round);
      if (r.startedAt) {
        a.from = Math.min(a.from, r.startedAt);
        a.to = Math.max(a.to, r.startedAt);
      }
      acc.set(key, a);
    }
  }
  const out: Record<string, Measured[]> = {};
  const day = (t: number) => (Number.isFinite(t) && t ? new Date(t).toISOString().slice(0, 10) : "unknown");
  for (const [key, a] of [...acc].sort()) {
    const [ref, effort] = key.split("|") as [string, string];
    const [lo, hi] = wilson(a.solved, a.tasks);
    (out[ref] ??= []).push({ effort, tasks: a.tasks, solved: a.solved, ci: [+(lo * 100).toFixed(1), +(hi * 100).toFixed(1)], costPerTask: +(a.cost / a.tasks).toFixed(5), byLanguage: a.langs, rounds: a.rounds.size, from: day(a.from), to: day(a.to) });
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const dirs = roundDirs(args.filter((a) => a !== "--write"));
  if (!dirs.length) {
    console.error("usage: bun bench/profiles.ts <rounds-dir> [<rounds-dir> …] [--write]");
    process.exit(2);
  }
  const m = measure(dirs);
  for (const [ref, rows] of Object.entries(m))
    for (const r of rows) console.log(`${ref.padEnd(32)} effort ${r.effort.padEnd(8)} ${((100 * r.solved) / r.tasks).toFixed(1).padStart(5)}% of ${String(r.tasks).padStart(5)} tasks (${r.ci[0]} to ${r.ci[1]}), $${r.costPerTask.toFixed(4)} a task, ${r.rounds} rounds, ${r.from} to ${r.to}`);
  if (write) {
    const file = join(import.meta.dir, "..", "galley", "src", "provider", "measured.json");
    const doc = {
      about: "Written by bench/profiles.ts from Galley's own benchmark rounds: Galley at its defaults (apart from model and effort), first attempts, small Exercism-style tasks with hidden tests, cost at list price. Not comparable with the hard-task board figures in models.ts.",
      generated: new Date().toISOString().slice(0, 10),
      models: m,
    };
    writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
    console.log(`\nWritten to ${file}`);
  }
}
