// The round miner: after a round, read every Galley session it kept and report what went wrong in the harness,
// so that bugs show up after the first round instead of whenever someone reads transcripts. It groups tool errors,
// malformed tool calls, commands the sandbox lacks and harness failures; replays the trouble signals; splits cost
// by phase; and flags what is new since the previous round. Read-only: nothing is run, no model is called.
//
//   bun bench/mine.ts <round-dir> [--previous <round-dir>]
//
// Writes mine.md (for people) and mine.json (for the next round's comparison) into the round folder.
// Without --previous it compares with the most recent other round beside it that has a mine.json.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { replayRuns, signalTable } from "./signals.ts";
import { costByRun, firstAttempt, isCanary, modelsByRun, segments, pct, runKey, taskRuns, type SessionRecord, type TaskRun } from "./sessions.ts";

export interface Cluster {
  key: string;
  count: number;
  /** Times, by agent variant: a round often runs an old and a new version side by side. */
  byAgent: Record<string, number>;
  runs: number;
  failedRuns: number;
  example: string;
}

export interface Mined {
  round: string;
  agents: Record<string, { runs: number; passed: number; timedOut: number; agentFailed: number; memoryKills: number; costUsd: number; medianMinutes: number }>;
  toolErrors: Cluster[];
  malformed: Cluster[];
  missingCommands: Cluster[];
  harnessErrors: Cluster[];
  phases: { main: number; otherModels: number; helpers: number; runs: number };
  steps: { medianPass: number; medianFail: number; atLimit: number };
  recordedSignals: Record<string, number>;
  /** What the round ran, so that it is compared only with a round that ran the same. */
  conditions?: { models: string[]; attempts: number; tasks: string[] };
  checks: { runs: number; failed: number; passedAfterFailing: number };
}

/** A tool result reduced to its kind: the first line, with paths, numbers and quoted text taken out. */
export const normalize = (s: string) =>
  s
    .split("\n")[0]!
    .replace(/(?:\.{0,2}\/)?(?:[\w.@-]+\/)+[\w.@-]*/g, "<path>")
    .replace(/\d+/g, "N")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "…")
    .slice(0, 110);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

type Tally = Map<string, { count: number; byAgent: Record<string, number>; runs: Set<string>; failed: Set<string>; example: string }>;

function tally(map: Tally, key: string, run: TaskRun) {
  const e = map.get(key) ?? { count: 0, byAgent: {}, runs: new Set<string>(), failed: new Set<string>(), example: run.task };
  e.count++;
  e.byAgent[run.agent] = (e.byAgent[run.agent] ?? 0) + 1;
  e.runs.add(runKey(run));
  if (!run.pass) e.failed.add(runKey(run));
  map.set(key, e);
}

const clusters = (map: Tally): Cluster[] =>
  [...map].map(([key, e]) => ({ key, count: e.count, byAgent: e.byAgent, runs: e.runs.size, failedRuns: e.failed.size, example: e.example })).sort((a, b) => b.count - a.count);

export function mine(round: string, runs: TaskRun[] = taskRuns(round, { sessions: true })): Mined {
  const cost = costByRun(round);
  const agents: Mined["agents"] = {};
  for (const r of runs) {
    const a = (agents[r.agent] ??= { runs: 0, passed: 0, timedOut: 0, agentFailed: 0, memoryKills: 0, costUsd: 0, medianMinutes: 0 });
    a.runs++;
    if (r.pass) a.passed++;
    if (r.agentTimedOut) a.timedOut++;
    if (r.agentExit !== 0 && r.agentExit !== undefined) a.agentFailed++;
    a.memoryKills += r.memoryKills ?? 0;
    a.costUsd += cost.get(runKey(r)) ?? NaN;
  }
  for (const [name, a] of Object.entries(agents)) a.medianMinutes = median(runs.filter((r) => r.agent === name).map((r) => (r.agentMs ?? 0) / 60_000));

  const toolErrors: Tally = new Map();
  const malformed: Tally = new Map();
  const missing: Tally = new Map();
  const harness: Tally = new Map();
  const phases = { main: 0, otherModels: 0, helpers: 0, runs: 0 };
  const stepsPass: number[] = [];
  const stepsFail: number[] = [];
  let atLimit = 0;
  const recordedSignals: Record<string, number> = {};
  const checks = { runs: 0, failed: 0, passedAfterFailing: 0 };

  for (const r of runs) {
    if (!r.main) continue;
    phases.runs++;
    const meta = r.main[0] as { model?: string };
    for (const rec of r.main) {
      if (rec.type === "usage") {
        const u = rec as Extract<SessionRecord, { type: "usage" }> & { helper?: string };
        // A helper's cost added to its parent is marked: it is counted from the helper's own file instead.
        if (u.helper) continue;
        if (u.model === meta.model) phases.main += u.costUsd;
        else phases.otherModels += u.costUsd;
      } else if (rec.type === "status" && rec.status === "error") tally(harness, `session ended in error: ${normalize(String(rec.detail ?? ""))}`, r);
      else if (rec.type === "signal") recordedSignals[String(rec.kind)] = (recordedSignals[String(rec.kind)] ?? 0) + 1;
    }
    const checkRecs = r.main.filter((x) => x.type === "check") as Extract<SessionRecord, { type: "check" }>[];
    if (checkRecs.length) {
      checks.runs++;
      if (checkRecs.some((c) => !c.passed)) checks.failed++;
      if (checkRecs.some((c) => !c.passed) && checkRecs.at(-1)!.passed) checks.passedAfterFailing++;
    }
    // Every helper's own usage counts as helpers. Sessions written before the parent's roll-up was marked still
    // hold an unmarked copy of it: take it out of the parent's bucket, but never more than the parent recorded on
    // that model, since a helper cut off mid-run never got its roll-up written.
    // Sessions that record each `galley run` also mark every roll-up: an unmarked helper cost there is one that
    // never reached the parent (the run was cut off while the helper worked), so nothing is subtracted.
    const marked = r.main.some((x) => (x.type === "usage" && (x as { helper?: string }).helper) || x.type === "run");
    // The old roll-up is one usage record on the helper's model whose cost equals the helper's own total.
    const rollups = r.main.filter((x) => x.type === "usage") as { model: string; costUsd: number }[];
    for (const h of r.helpers) {
      const c = h.filter((x) => x.type === "usage").reduce((s, x) => s + (x as Extract<SessionRecord, { type: "usage" }>).costUsd, 0);
      phases.helpers += c;
      if (marked) continue;
      const hm = (h[0] as { model?: string }).model ?? "";
      const i = rollups.findIndex((x) => x.model === hm && Math.abs(x.costUsd - c) <= 1e-9 * Math.max(1, c));
      if (i < 0) continue; // the helper was cut off before its roll-up: nothing of it is in the parent
      rollups.splice(i, 1);
      if (hm === meta.model) phases.main -= c;
      else phases.otherModels -= c;
    }

    const ms = firstAttempt(r.main);
    let steps = 0;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!;
      // Every model call is a step, as the live loop counts them (a reply sent back by a check or a review too).
      if (m.role === "assistant") steps++;
      if (m.role !== "tool") continue;
      const prevMsg = ms[i - 1];
      const calls = prevMsg?.role === "assistant" ? prevMsg.toolCalls : [];
      for (const t of m.results) {
        // A mended call that failed starts with the repair note: the error is what follows it.
        const content = String(t.content).replace(/^\([^\n]*\)\n/, "");
        if (t.isError) {
          if (content.startsWith("Invalid arguments") || content.startsWith("Invalid JSON arguments")) {
            const call = calls.find((c) => c.id === t.callId);
            tally(malformed, `${t.name} called with {${Object.keys(call?.input ?? {}).sort().join(", ")}}: ${normalize(content)}`, r);
          } else tally(toolErrors, `${t.name}: ${normalize(content)}`, r);
        } else if (t.name === "bash") {
          const nf = /(?:^|\n)(?:bash: (?:line \d+: )?)?([\w.+-]+): (?:command )?not found/.exec(content);
          if (nf && /\[exit code 127\]\s*$/.test(content)) tally(missing, nf[1]!, r);
        }
      }
    }
    (r.pass ? stepsPass : stepsFail).push(steps);
    const max = typeof r.config?.maxSteps === "number" ? (r.config.maxSteps as number) : 60;
    // The limit holds for each turn and each pass, not for the whole attempt.
    if (segments(r.main).some((seg) => seg.messages.filter((m) => m.role === "assistant").length >= max)) atLimit++;
  }
  const models = modelsByRun(round);
  const conditions = {
    models: [...new Set(runs.map((r) => models.get(runKey(r)) ?? ""))].filter(Boolean).sort(),
    attempts: Math.max(1, ...runs.map((r) => r.attempts ?? 1)),
    tasks: [...new Set(runs.map((r) => r.task))].sort(),
  };
  return {
    conditions,
    round: basename(round),
    agents,
    toolErrors: clusters(toolErrors),
    malformed: clusters(malformed),
    missingCommands: clusters(missing),
    harnessErrors: clusters(harness),
    phases,
    steps: { medianPass: median(stepsPass), medianFail: median(stepsFail), atLimit },
    recordedSignals,
    checks,
  };
}

/** Two rounds can be compared when they ran the same models with the same number of attempts on mostly the same
 *  tasks. A round mined before conditions were recorded is never compared. */
function comparable(a?: Mined["conditions"], b?: Mined["conditions"]): boolean {
  if (!a || !b) return false;
  if (a.models.join() !== b.models.join() || a.attempts !== b.attempts) return false;
  const shared = a.tasks.filter((t) => b.tasks.includes(t)).length;
  return shared >= 0.5 * Math.max(a.tasks.length, b.tasks.length);
}

/** Rounds that are trials, not rounds: never the one to compare with. */
const NOT_A_ROUND = /invalid|aborted|smoke|dry|dump|selftest|probe|try/i;

/** The most recent other round beside this one that has been mined. */
function previousRound(round: string, own?: Mined["conditions"]): string | undefined {
  const parent = dirname(round);
  const mtime = (d: string) => statSync(join(d, "results.jsonl")).mtimeMs;
  const mine = mtime(round);
  return readdirSync(parent)
    .map((d) => join(parent, d))
    .filter((d) => d !== round && !isCanary(d) && !NOT_A_ROUND.test(basename(d)) && existsSync(join(d, "mine.json")) && existsSync(join(d, "results.jsonl")) && mtime(d) < mine)
    .filter((d) => comparable(own, (JSON.parse(readFileSync(join(d, "mine.json"), "utf8")) as Mined).conditions))
    .sort((a, b) => mtime(b) - mtime(a))[0];
}

export function render(m: Mined, prev: Mined | undefined, signals: string[]): string {
  const out: string[] = [`# What went wrong in round ${m.round}`, ""];
  out.push("*Written by `bench/mine.ts` from the round's kept session files. Read-only: nothing was run again.*", "");
  out.push("| Agent | Task-runs | Passed | Timed out | Agent failed | Memory kills | Cost (list price) | Median minutes |", "|---|---|---|---|---|---|---|---|");
  const money = (x: number | null | undefined, d = 2) => (typeof x === "number" && Number.isFinite(x) ? `$${x.toFixed(d)}` : "unknown");
  for (const [a, s] of Object.entries(m.agents)) out.push(`| ${a} | ${s.runs} | ${s.passed} (${pct(s.passed, s.runs)}) | ${s.timedOut} | ${s.agentFailed} | ${s.memoryKills} | ${money(s.costUsd)} | ${s.medianMinutes.toFixed(1)} |`);
  const seen = (list: Cluster[] | undefined) => new Set((list ?? []).map((c) => c.key));
  const section = (title: string, list: Cluster[], before: Set<string> | undefined, note: string) => {
    out.push("", `## ${title}`, "", note, "");
    if (!list.length) {
      out.push("None.");
      return;
    }
    out.push("| | Times | Task-runs | Of them failed | Example task |", "|---|---|---|---|---|");
    const agents = Object.keys(m.agents).length;
    for (const c of list.slice(0, 15)) {
      const split = agents > 1 ? ` (${Object.entries(c.byAgent).map(([a, n]) => `${a} ${n}`).join(", ")})` : "";
      out.push(`| ${before && !before.has(c.key) ? "**new** " : ""}\`${c.key.replaceAll("|", "\\|")}\` | ${c.count}${split} | ${c.runs} | ${c.failedRuns} | ${c.example} |`);
    }
    if (list.length > 15) out.push(`| … ${list.length - 15} more kinds | | | | |`);
  };
  section("Tool errors", m.toolErrors, prev && seen(prev.toolErrors), "Calls Galley refused or that failed, grouped by message. A kind that is new since the previous round is marked.");
  section("Malformed tool calls", m.malformed, prev && seen(prev.malformed), "Calls whose arguments did not fit the tool, with the argument names the model used.");
  section("Commands the sandbox lacks", m.missingCommands, prev && seen(prev.missingCommands), "Commands that failed with \"not found\" (exit code 127): tools the model expected to have.");
  section("Harness failures", m.harnessErrors, prev && seen(prev.harnessErrors), "Sessions that ended in an error.");
  out.push("", "## Where Galley's money went", "");
  const total = m.phases.main + m.phases.otherModels + m.phases.helpers;
  out.push(`Over ${m.phases.runs} sessions, by Galley's own pricing: main model ${pct(m.phases.main, total)}, helpers ${pct(m.phases.helpers, total)}, other models (advisor, takeover, fallback) ${pct(m.phases.otherModels, total)}; $${total.toFixed(2)} in all.`);
  out.push("", `Steps per first attempt: median ${m.steps.medianPass} when it passed, ${m.steps.medianFail} when it failed; ${m.steps.atLimit} ran into the step limit.`);
  if (m.checks.runs) out.push("", `The check command ran in ${m.checks.runs} sessions: it failed at least once in ${m.checks.failed}, and passed in the end after failing in ${m.checks.passedAfterFailing}.`);
  out.push("", "## Trouble signals", "", "Replayed over the first attempts (`bench/signals.ts`):", "", ...signals);
  const rec = Object.entries(m.recordedSignals);
  if (rec.length) out.push("", `Recorded in the sessions while running: ${rec.map(([k, n]) => `${k} ${n}`).join(", ")}.`);
  if (prev) {
    out.push("", "## Compared with the previous round", "", `Previous: ${prev.round}.`);
    if (!comparable(m.conditions, prev.conditions)) out.push("", "**The two rounds ran different models, attempts or tasks: the figures below are not like for like.**");
    for (const [a, s] of Object.entries(m.agents)) {
      const p = prev.agents[a];
      if (p) out.push(`- ${a}: ${pct(s.passed, s.runs)} against ${pct(p.passed, p.runs)}; cost per task-run ${money(s.costUsd / s.runs, 4)} against ${money(p.costUsd === null ? null : p.costUsd / p.runs, 4)}.`);
    }
    const fresh = [...m.toolErrors, ...m.malformed, ...m.missingCommands, ...m.harnessErrors].filter((c) => !seen([...prev.toolErrors, ...prev.malformed, ...prev.missingCommands, ...prev.harnessErrors]).has(c.key));
    out.push(`- ${fresh.length} kinds of error are new.${fresh.length ? " Most frequent: " + fresh.slice(0, 3).map((c) => `\`${c.key}\` (${c.count})`).join(", ") + "." : ""}`);
  }
  return out.join("\n") + "\n";
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const round = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--previous");
  if (!round || !existsSync(join(round, "results.jsonl"))) {
    console.error("usage: bun bench/mine.ts <round-dir> [--previous <round-dir>]");
    process.exit(2);
  }
  const i = args.indexOf("--previous");
  // A canary round is a picked set of tasks: comparing it with a full round would show a rise that is not there.
  const runs = taskRuns(round, { sessions: true });
  const m = mine(round, runs);
  const prevDir = i >= 0 ? args[i + 1] : isCanary(round) ? undefined : previousRound(round, m.conditions);
  const prev = prevDir && existsSync(join(prevDir, "mine.json")) ? (JSON.parse(readFileSync(join(prevDir, "mine.json"), "utf8")) as Mined) : undefined;
  const signals = signalTable(replayRuns(runs));
  const md = render(m, prev, signals);
  writeFileSync(join(round, "mine.json"), JSON.stringify(m, null, 1));
  writeFileSync(join(round, "mine.md"), md);
  console.log(md);
}
