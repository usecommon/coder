// Automatic verdicts. A change is judged by a rule written down before its rounds run, and the script, not a
// person reading the numbers, says whether the rule was met.
//
//   bun bench/verdict.ts judge <rule.json> <round-dir> [<round-dir> …] [--write]
//
// A rule is a JSON file in bench/rules/, committed to git before the first of its rounds starts:
//
//   {
//     "id": "low-effort-cheaper",
//     "question": "Does low effort cut cost by a quarter without losing more than 2 points?",
//     "baseline": "galley", "candidate": "galley-low",      // agent variant names as in results.jsonl
//     "metric": "pass",                                     // "pass" (first attempt) or "pass2" (after a second)
//     "decide": {
//       "minLeadPoints": -2,        // candidate minus baseline, pooled over the rounds, in points
//       "maxP": 0.05,               // optional: the sign test over task-runs where they differ must be below this
//       "cost": "lower"             // "lower", "lowerSure" (the whole 95% interval below), or { "maxRatio": 0.75 }
//     }
//   }
//
// The verdict says whether each condition was met, and whether the rule was registered in time: committed before
// the earliest task-run of the rounds started and not changed since. With --write it is saved to
// bench/verdicts/<id>.md and a line is added to bench/IMPROVEMENT_LOG.md. Read-only otherwise; no model is called.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { costByRun, pct, roundDirs, runKey, signTest, taskRuns } from "./sessions.ts";

export interface Rule {
  id: string;
  question: string;
  baseline: string;
  candidate: string;
  metric?: "pass" | "pass2";
  decide: { minLeadPoints?: number; maxP?: number; cost?: "lower" | "lowerSure" | { maxRatio: number } };
}

interface Condition {
  what: string;
  met: boolean;
  detail: string;
}

export interface Verdict {
  rule: Rule;
  rounds: string[];
  pairs: number;
  baselinePassed: number;
  candidatePassed: number;
  onlyCandidate: number;
  onlyBaseline: number;
  leadPoints: number;
  p: number;
  baselineCost: number;
  candidateCost: number;
  costRatio: number;
  costInterval: [number, number];
  perRound: { round: string; pairs: number; lead: number; costRatio: number }[];
  registration: { ok: boolean; detail: string };
  conditions: Condition[];
  met: boolean;
}

const git = (args: string[], cwd: string) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

/** Was the rule file committed before the rounds started, and left alone since? */
function registration(file: string, startedAt: number | undefined): { ok: boolean; detail: string } {
  const abs = resolve(file);
  const root = git(["rev-parse", "--show-toplevel"], dirname(abs));
  if (!root) return { ok: false, detail: "the rule file is not in a git repository" };
  const rel = relative(root, abs);
  const times = git(["log", "--format=%ct %h", "--", rel], root).split("\n").filter(Boolean);
  if (!times.length) return { ok: false, detail: "the rule file has never been committed" };
  const dirty = git(["status", "--porcelain", "--", rel], root);
  const [firstT, firstH] = times.at(-1)!.split(" ");
  const [lastT, lastH] = times[0]!.split(" ");
  const first = Number(firstT) * 1000;
  const last = Number(lastT) * 1000;
  const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  if (dirty) return { ok: false, detail: `the rule file has changes that are not committed` };
  if (startedAt === undefined) return { ok: false, detail: "the rounds record no start time" };
  if (first > startedAt) return { ok: false, detail: `committed at ${when(first)} UTC (${firstH}), after the rounds started (${when(startedAt)} UTC)` };
  if (last > startedAt) return { ok: false, detail: `committed before the rounds (${firstH}) but changed at ${when(last)} UTC (${lastH}), after they started` };
  return { ok: true, detail: `committed at ${when(first)} UTC (${firstH}), before the rounds started (${when(startedAt)} UTC)` };
}

/** A deterministic random number generator, so a verdict comes out the same every time it is computed. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function judge(rule: Rule, ruleFile: string, rounds: string[]): Verdict {
  const metric = rule.metric ?? "pass";
  const passed = (r: { pass: boolean; pass2?: boolean }) => (metric === "pass2" ? (r.pass2 ?? r.pass) : r.pass);
  type Pair = { round: string; base: boolean; cand: boolean; baseCost: number; candCost: number };
  const pairs: Pair[] = [];
  let startedAt: number | undefined;
  for (const round of rounds) {
    const runs = taskRuns(round);
    for (const r of runs) if (r.startedAt && (startedAt === undefined || r.startedAt < startedAt)) startedAt = r.startedAt;
    const cost = costByRun(round, { firstOnly: metric === "pass" });
    const base = new Map(runs.filter((r) => r.agent === rule.baseline).map((r) => [r.task, r]));
    for (const c of runs.filter((r) => r.agent === rule.candidate)) {
      const b = base.get(c.task);
      if (b) pairs.push({ round: basename(round), base: passed(b), cand: passed(c), baseCost: cost.get(runKey(b)) ?? 0, candCost: cost.get(runKey(c)) ?? 0 });
    }
  }
  const n = pairs.length;
  const basePassed = pairs.filter((p) => p.base).length;
  const candPassed = pairs.filter((p) => p.cand).length;
  const onlyCand = pairs.filter((p) => p.cand && !p.base).length;
  const onlyBase = pairs.filter((p) => p.base && !p.cand).length;
  const lead = n ? (100 * (candPassed - basePassed)) / n : 0;
  const p = signTest(onlyCand, onlyCand + onlyBase);
  const sum = (xs: Pair[], k: "baseCost" | "candCost") => xs.reduce((s, x) => s + x[k], 0);
  const baseCost = sum(pairs, "baseCost");
  const candCost = sum(pairs, "candCost");
  const ratio = baseCost ? candCost / baseCost : NaN;
  // A 95% interval for the cost ratio: resample task-runs with replacement, 2,000 times.
  const draws: number[] = [];
  const rand = rng(12345);
  for (let i = 0; i < 2000 && n; i++) {
    let bc = 0;
    let cc = 0;
    for (let j = 0; j < n; j++) {
      const x = pairs[Math.floor(rand() * n)]!;
      bc += x.baseCost;
      cc += x.candCost;
    }
    if (bc) draws.push(cc / bc);
  }
  draws.sort((a, b) => a - b);
  const interval: [number, number] = draws.length ? [draws[Math.floor(draws.length * 0.025)]!, draws[Math.floor(draws.length * 0.975)]!] : [NaN, NaN];
  const perRound = [...new Set(pairs.map((x) => x.round))].map((round) => {
    const xs = pairs.filter((x) => x.round === round);
    const b = sum(xs, "baseCost");
    return { round, pairs: xs.length, lead: (100 * (xs.filter((x) => x.cand).length - xs.filter((x) => x.base).length)) / xs.length, costRatio: b ? sum(xs, "candCost") / b : NaN };
  });

  const conditions: Condition[] = [];
  const d = rule.decide;
  if (d.minLeadPoints !== undefined) conditions.push({ what: `${rule.candidate} at least ${d.minLeadPoints} points ${d.minLeadPoints >= 0 ? "ahead of" : "behind at worst"} ${rule.baseline}`, met: n > 0 && lead >= d.minLeadPoints, detail: `${lead >= 0 ? "+" : ""}${lead.toFixed(1)} points` });
  if (d.maxP !== undefined) conditions.push({ what: `the difference is significant (sign test p < ${d.maxP}) and in the candidate's favour`, met: p < d.maxP && onlyCand > onlyBase, detail: `p = ${p.toFixed(3)}; ${onlyCand} task-runs only the candidate passed, ${onlyBase} only the baseline` });
  if (d.cost === "lower") conditions.push({ what: "it costs less", met: ratio < 1, detail: `${((ratio - 1) * 100).toFixed(0)}% (${pct(candCost, baseCost, 0)} of the baseline's cost)` });
  else if (d.cost === "lowerSure") conditions.push({ what: "it costs less, with the whole 95% interval below", met: interval[1] < 1, detail: `ratio ${ratio.toFixed(2)}, interval ${interval[0].toFixed(2)} to ${interval[1].toFixed(2)}` });
  else if (d.cost && typeof d.cost === "object") conditions.push({ what: `it costs at most ${d.cost.maxRatio} times the baseline`, met: ratio <= d.cost.maxRatio, detail: `ratio ${ratio.toFixed(2)}` });
  const reg = registration(ruleFile, startedAt);
  return {
    rule,
    rounds: rounds.map((r) => basename(r)),
    pairs: n,
    baselinePassed: basePassed,
    candidatePassed: candPassed,
    onlyCandidate: onlyCand,
    onlyBaseline: onlyBase,
    leadPoints: lead,
    p,
    baselineCost: baseCost,
    candidateCost: candCost,
    costRatio: ratio,
    costInterval: interval,
    perRound,
    registration: reg,
    conditions,
    met: n > 0 && conditions.every((c) => c.met),
  };
}

export function render(v: Verdict): string {
  const out = [`# Verdict: ${v.rule.id}`, "", `*Computed by \`bench/verdict.ts\` on ${new Date().toISOString().slice(0, 10)}.*`, "", `**Question.** ${v.rule.question}`, ""];
  out.push(`**Verdict: the rule is ${v.met ? "MET" : "NOT MET"}.**${v.registration.ok ? "" : " **The rule was not registered in time, so this verdict does not count as a pre-registered test.**"}`, "");
  out.push(`Registration: ${v.registration.detail}.`, "");
  out.push("| Condition | Met | Measured |", "|---|---|---|");
  for (const c of v.conditions) out.push(`| ${c.what} | ${c.met ? "yes" : "**no**"} | ${c.detail} |`);
  out.push("", `${v.pairs} paired task-runs from ${v.rounds.length} round${v.rounds.length > 1 ? "s" : ""} (${v.rounds.join(", ")}), judged on \`${v.rule.metric ?? "pass"}\`.`, "");
  out.push("| | Passed | Cost at list price |", "|---|---|---|");
  out.push(`| ${v.rule.baseline} (baseline) | ${v.baselinePassed} (${pct(v.baselinePassed, v.pairs)}) | $${v.baselineCost.toFixed(2)} |`);
  out.push(`| ${v.rule.candidate} (candidate) | ${v.candidatePassed} (${pct(v.candidatePassed, v.pairs)}) | $${v.candidateCost.toFixed(2)} |`);
  out.push("", `Cost ratio ${v.costRatio.toFixed(2)} (95% interval ${v.costInterval[0].toFixed(2)} to ${v.costInterval[1].toFixed(2)}, by resampling task-runs).`, "");
  if (v.perRound.length > 1) {
    out.push("| Round | Pairs | Lead, points | Cost ratio |", "|---|---|---|---|");
    for (const r of v.perRound) out.push(`| ${r.round} | ${r.pairs} | ${r.lead >= 0 ? "+" : ""}${r.lead.toFixed(1)} | ${r.costRatio.toFixed(2)} |`);
  }
  return out.join("\n") + "\n";
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const rest = args.filter((a) => a !== "--write");
  if (rest[0] !== "judge" || rest.length < 3) {
    console.error("usage: bun bench/verdict.ts judge <rule.json> <round-dir> [<round-dir> …] [--write]");
    process.exit(2);
  }
  const file = rest[1]!;
  const rule = JSON.parse(readFileSync(file, "utf8")) as Rule;
  for (const k of ["id", "question", "baseline", "candidate", "decide"] as const) if (!rule[k]) throw new Error(`${file}: "${k}" is missing`);
  const rounds = roundDirs(rest.slice(2));
  if (!rounds.length) throw new Error("no rounds found");
  const v = judge(rule, file, rounds);
  const md = render(v);
  console.log(md);
  if (write) {
    const here = import.meta.dir;
    mkdirSync(join(here, "verdicts"), { recursive: true });
    writeFileSync(join(here, "verdicts", `${rule.id}.md`), md);
    const log = join(here, "IMPROVEMENT_LOG.md");
    if (!readFileSync(log, "utf8").includes("\n## Automatic verdicts\n")) appendFileSync(log, "\n## Automatic verdicts\n\nWritten by `bench/verdict.ts` against rules committed in `bench/rules/` before their rounds ran.\n\n");
    appendFileSync(log, `- ${new Date().toISOString().slice(0, 10)} **${rule.id}**: ${v.met ? "met" : "not met"}${v.registration.ok ? "" : " (not pre-registered)"}. ${v.candidatePassed} against ${v.baselinePassed} of ${v.pairs}, ${v.leadPoints >= 0 ? "+" : ""}${v.leadPoints.toFixed(1)} points, p = ${v.p.toFixed(3)}, cost ratio ${v.costRatio.toFixed(2)}. [Details](verdicts/${rule.id}.md)\n`);
    console.log(`Written to bench/verdicts/${rule.id}.md and bench/IMPROVEMENT_LOG.md`);
  }
}
