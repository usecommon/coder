// Reading what benchmark rounds keep: results.jsonl, proxy.jsonl and, for Galley, each task-run's session files.
// Shared by the round miner (mine.ts), the signal replay (signals.ts), the verdicts (verdict.ts), the measured
// model profiles (profiles.ts), the canary (canary.ts) and the calibration report (calibrate.ts). Read-only.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { INTERRUPTED } from "../galley/src/agent/loop.ts";
import type { Message } from "../galley/src/core/types.ts";

export interface Result {
  agent: string;
  lang: string;
  name: string;
  pass: boolean;
  pass2?: boolean;
  attempts?: number;
  agentExit?: number | null;
  agentTimedOut?: boolean;
  agentMs?: number;
  gradeExit?: number | null;
  startedAt?: number;
  /** When the second attempt started, in rounds that give a failed first attempt one more. */
  startedAt2?: number;
  memoryKills?: number;
  /** Galley only, in rounds from 19 November 2026 on: "default" or the cli.ts of another checkout, and extra flags. */
  galley?: string;
  galleyArgs?: string[];
}

/** One record of a Galley session file. Only the fields used here are typed. */
export type SessionRecord =
  | { type: "meta"; id: string; parentId?: string; model: string }
  | { type: "message"; message: Message }
  | { type: "usage"; model: string; costUsd: number; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } }
  | { type: "signal"; kind: string; step: number; acted: string }
  | { type: "check"; exitCode: number | null; round: number; passed: boolean; turn?: number }
  | { type: "run"; at: string }
  | { type: string; [k: string]: unknown };

export interface TaskRun extends Result {
  round: string;
  roundDir: string;
  task: string;
  dir: string;
  /** The main agent's session (Galley only), and its helpers'. */
  main?: SessionRecord[];
  helpers: SessionRecord[][];
  /** The run's Galley config, if any. */
  config?: Record<string, unknown>;
}

const jsonl = (path: string): any[] => {
  if (!existsSync(path)) return [];
  const out: any[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A line cut off when a run was killed.
    }
  }
  return out;
};

/** Round folders among the arguments: a round itself (it has results.jsonl), or a folder of rounds. */
export function roundDirs(args: string[]): string[] {
  const out: string[] = [];
  for (const d of args.map((a) => a.replace(/\/+$/, "") || "/")) {
    if (existsSync(join(d, "results.jsonl"))) out.push(d);
    else for (const sub of statSync(d, { throwIfNoEntry: false })?.isDirectory() ? readdirSync(d) : []) if (existsSync(join(d, sub, "results.jsonl"))) out.push(join(d, sub));
  }
  // A round given twice (or once itself and once through its parent folder, or through a link) is judged once.
  return [...new Map(out.map((d) => [realpathSync(d), d])).values()].sort();
}

export const results = (round: string): Result[] => jsonl(join(round, "results.jsonl")).filter((r) => typeof r.pass === "boolean");
// A kept round holds the proxy log with request headers and bodies stripped, as proxy-usage.jsonl.
export const proxyCalls = (round: string): any[] =>
  jsonl(join(round, existsSync(join(round, "proxy.jsonl")) ? "proxy.jsonl" : "proxy-usage.jsonl"));

function galleyConfig(dir: string): Record<string, unknown> | undefined {
  for (const p of [join(dir, "config", "galley", "config.json"), join(dir, "config", "config.json")]) {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {}
  }
  return undefined;
}

/** Every task-run of a round, with Galley's session files when `sessions` is set. */
export function taskRuns(round: string, o: { sessions?: boolean } = {}): TaskRun[] {
  return results(round).map((r) => {
    const dir = join(round, "runs", r.agent, r.lang, r.name);
    const run: TaskRun = { ...r, round: basename(round), roundDir: round, task: `${r.lang}/${r.name}`, dir, helpers: [], config: galleyConfig(dir) };
    if (o.sessions) {
      const root = join(dir, "galley-data", "projects");
      for (const project of existsSync(root) ? readdirSync(root) : []) {
        const sdir = join(root, project, "sessions");
        for (const f of existsSync(sdir) ? readdirSync(sdir).sort() : []) {
          if (!f.endsWith(".jsonl")) continue;
          const recs = jsonl(join(sdir, f)) as SessionRecord[];
          const meta = recs[0] as { type: string; parentId?: string } | undefined;
          if (meta?.type !== "meta") continue;
          if (meta.parentId) run.helpers.push(recs);
          else run.main ??= recs;
        }
      }
    }
    return run;
  });
}

export const messagesOf = (recs: SessionRecord[] | undefined): Message[] =>
  (recs ?? []).filter((r): r is Extract<SessionRecord, { type: "message" }> => r.type === "message").map((r) => r.message);

/** Messages Galley adds to a session itself within one task: check failures, reviews, advice, takeovers, the
 *  verifier's report, the steps of a plan. They are not the harness's second attempt. */
const INJECTED = [/^The check `/, /^Before you finish, check your work/, /^A second model \(/, /^You are taking over/, /^<environment>/, /^An independent reviewer/, /^Step \d+ of \d+:/, /^Go ahead: do the task/];

/** The messages of a session's first attempt. Sessions from 19 November 2026 on mark the start of each
 *  `galley run` with a "run" record, and the first attempt ends at the second one. Older sessions have no marks;
 *  there it ends at the first message from the user that Galley did not add itself. */
export function firstAttempt(recs: SessionRecord[] | undefined): Message[] {
  const all = recs ?? [];
  const out: Message[] = [];
  if (all.some((r) => r.type === "run")) {
    let runs = 0;
    for (const r of all) {
      if (r.type === "run" && ++runs > 1) break;
      if (r.type === "message") out.push((r as Extract<SessionRecord, { type: "message" }>).message);
    }
    return out;
  }
  let users = 0;
  for (const m of messagesOf(all)) {
    if (m.role === "user" && !(typeof m.content === "string" && users > 0 && INJECTED.some((re) => re.test(m.content))) && ++users > 1) {
      // The second attempt first closes the tool calls the first left open (all "interrupted"): that is not part of
      // the first attempt.
      const last = out.at(-1);
      if (last?.role === "tool" && last.results.length && last.results.every((t) => t.isError && t.content === INTERRUPTED)) out.pop();
      break;
    }
    out.push(m);
  }
  return out;
}

/** Where the live loop starts afresh within one `galley run`: a new turn (a step of a plan, the whole task after a
 *  plan of one step, a plan's revision) gets a new watcher and a new step count; the verifier's second pass in the
 *  same turn keeps the watcher and starts the step count again. */
const NEW_TURN = [/^Step \d+ of \d+:/, /^Go ahead: do the task/, /^A second model \([^)\n]*\) reviewed your plan/];
const NEW_PASS = /^An independent reviewer checked your change against the request and reported:/;

export interface Segment {
  messages: Message[];
  /** True when this segment starts a new turn; false for the verifier's pass within a turn (and the first). */
  newTurn: boolean;
}

/** The first attempt cut into the turns and passes the live loop counted separately. */
export function segments(recs: SessionRecord[] | undefined): Segment[] {
  const out: Segment[] = [];
  for (const m of firstAttempt(recs)) {
    const text = m.role === "user" && typeof m.content === "string" ? m.content : undefined;
    if (!out.length) out.push({ messages: [], newTurn: true });
    else if (text !== undefined && NEW_TURN.some((re) => re.test(text))) out.push({ messages: [], newTurn: true });
    else if (text !== undefined && NEW_PASS.test(text)) out.push({ messages: [], newTurn: false });
    out.at(-1)!.messages.push(m);
  }
  return out;
}

/** Galley as it ships: the default checkout, no extra flags, and a config that sets only the model, the effort and
 *  where the provider is. Rounds before run.ts recorded checkout and flags count only the variant
 *  named plain "galley". */
const NEUTRAL_KEYS = new Set(["effort", "providers", "model"]);
/** Rounds run before results recorded Galley's checkout and flags in which the arm named "galley" was itself an
 *  experiment: the development rounds r1 to r6 (each tried a change to Galley, some kept, most not) and fv1, fv2
 *  (Galley with --verify). See IMPROVEMENT_LOG.md, rounds 1 to 7. */
const LEGACY_EXPERIMENTS = /^(r\d+[ab]?(-.*)?|fv\d+)$/;

export function isDefaultGalley(r: TaskRun): boolean {
  if (!r.config || !r.agent.startsWith("galley")) return false;
  if (r.galley === undefined && LEGACY_EXPERIMENTS.test(r.round)) return false;
  if (r.galley === undefined ? r.agent !== "galley" : r.galley !== "default" || (r.galleyArgs ?? []).length > 0) return false;
  if (Object.keys(r.config).some((k) => !NEUTRAL_KEYS.has(k))) return false;
  const providers = (r.config.providers ?? {}) as Record<string, Record<string, unknown>>;
  return Object.values(providers).every((p) => Object.keys(p).every((k) => k === "baseURL"));
}

/** Tasks broken in the benchmark itself, which the round reports leave out of scoring (report.ts). */
export const BROKEN_TASKS = new Set(["rust/macros", "go/octal"]);

/** A task under one set of conditions: the same task, agent variant, model, effort, step limit and series of rounds
 *  (rounds "fresh-1" to "fresh-4" are one series, run with one version of the harness). Comparing a
 *  failing with a passing run is fair only within one such group; across them a signal is rewarded for telling a weak
 *  model from a strong one. */
const modelsCache = new Map<string, Map<string, string>>();
/** The model of one task-run: its config's, or the one its requests named in the proxy log. */
export function modelOf(r: TaskRun): string {
  if (typeof r.config?.model === "string") return r.config.model;
  let m = modelsCache.get(r.roundDir);
  if (!m) modelsCache.set(r.roundDir, (m = modelsByRun(r.roundDir)));
  return m.get(runKey(r)) ?? "";
}

export const conditionKey = (r: TaskRun, model?: string) =>
  [r.task, r.agent, model ?? modelOf(r), (r.config?.effort as string | undefined) ?? "", (r.config?.maxSteps as number | undefined) ?? 60, (isCanary(r.roundDir) ? r.round : r.round.replace(/-\d+$/, ""))].join("|");

/** A canary round: picked tasks, not a sample. Marked by canary.sh, or named so. */
export const isCanary = (round: string) => /canary/i.test(basename(round)) || existsSync(join(round, "CANARY"));

/** The model of a run's requests, from the proxy log (tag "<agent>__<lang>__<name>"): the one that wrote the most
 *  output, so that a side request (OpenCode titles each session on a small model, and that answer comes first) does
 *  not stand for the run. */
export function modelsByRun(round: string): Map<string, string> {
  const out = new Map<string, string>();
  const calls = proxyCalls(round);
  const written = new Map<string, Map<string, number>>();
  for (const c of calls) {
    if (c.status !== 200 || !c.tag || !c.req?.model) continue;
    const m = written.get(c.tag) ?? new Map<string, number>();
    // A request with no usage on record still counts, a little more than nothing.
    m.set(c.req.model, (m.get(c.req.model) ?? 0) + 1 + (c.usage?.completion_tokens ?? c.usage?.output_tokens ?? 0));
    written.set(c.tag, m);
  }
  for (const [tag, m] of written) out.set(tag, [...m].sort((a, b) => b[1] - a[1])[0]![0]);
  // A run whose requests were all refused (400, 422) is still a run of that model.
  for (const c of calls) if (c.tag && c.req?.model && !out.has(c.tag) && c.blocked === undefined) out.set(c.tag, c.req.model);
  return out;
}

/** List prices, USD per million tokens, for pricing proxy records: uncached input, cache read, output. */
export const PRICES: Record<string, { miss: number; hit: number; write: number; out: number }> = {
  "deepseek-flash": { miss: 0.15, hit: 0.003, write: 0.15, out: 0.6 },
  "deepseek-v4-flash": { miss: 0.15, hit: 0.003, write: 0.15, out: 0.6 },
  "deepseek-v4-pro": { miss: 0.66, hit: 0.022, write: 0.66, out: 1.98 },
  "claude-sonnet-5-5": { miss: 2, hit: 0.1, write: 2.5, out: 10 },
  "claude-opus-5-5": { miss: 4, hit: 0.2, write: 5, out: 20 },
  "claude-haiku-5-5": { miss: 0.1, hit: 0.01, write: 0.125, out: 0.5 },
};

/** The cost of one proxy record at list price, or undefined when the model has no price here. Priced per model,
 *  so a round that mixes models is priced correctly. */
export function callCost(c: any): number | undefined {
  const p = PRICES[c.req?.model];
  const u = c.usage;
  if (!p) return undefined;
  // A request whose usage never reached the proxy (a stream cut short) is counted as nothing, as the round reports
  // count it: the model is known, only its token counts are missing.
  if (!u) return 0;
  if (u.prompt_tokens !== undefined) {
    const hit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
    const miss = u.prompt_cache_miss_tokens ?? u.prompt_tokens - hit;
    return (miss * p.miss + hit * p.hit + (u.completion_tokens ?? 0) * p.out) / 1e6;
  }
  // Anthropic's usage fields.
  return ((u.input_tokens ?? 0) * p.miss + (u.cache_read_input_tokens ?? 0) * p.hit + (u.cache_creation_input_tokens ?? 0) * p.write + (u.output_tokens ?? 0) * p.out) / 1e6;
}

/** Cost per task-run (key "<agent>__<lang>__<name>") from the proxy log. Requests from an interrupted earlier try
 *  of a task-run (before its recorded start) are left out, as the round reports leave them out. With `firstOnly`,
 *  so are those of a second attempt. A run with a request whose model has no price here is NaN: unknown, not free.
 *  A run with no request at all has no entry. */
export function costByRun(round: string, o: { firstOnly?: boolean } = {}): Map<string, number> {
  const out = new Map<string, number>();
  const runs = new Map(results(round).map((r) => [runKey(r), r]));
  for (const c of proxyCalls(round)) {
    if (!c.tag) continue;
    const r = runs.get(c.tag);
    if (!r) continue;
    // A request the provider refused cost nothing, but the run did make one: it has a cost, of zero so far.
    if (c.status !== 200) {
      if (!out.has(c.tag)) out.set(c.tag, 0);
      continue;
    }
    if (c.t !== undefined && r.startedAt && c.t < r.startedAt - 2000) continue;
    // startedAt2 is taken before the second attempt sends anything, on the proxy's own clock: no slack is needed.
    if (o.firstOnly && c.t !== undefined && r.startedAt2 && c.t >= r.startedAt2) continue;
    const cost = callCost(c);
    out.set(c.tag, (out.get(c.tag) ?? 0) + (cost ?? NaN));
  }
  return out;
}

export const runKey = (r: { agent: string; lang: string; name: string }) => `${r.agent}__${r.lang}__${r.name}`;

/** Exact two-sided binomial test of k successes in n trials at one half (the sign test). */
export function signTest(k: number, n: number): number {
  if (!n) return 1;
  const logC = (a: number, b: number) => lgamma(a + 1) - lgamma(b + 1) - lgamma(a - b + 1);
  const pk = (i: number) => Math.exp(logC(n, i) - n * Math.LN2);
  const m = Math.min(k, n - k);
  let p = 0;
  for (let i = 0; i <= m; i++) p += pk(i);
  return Math.min(1, 2 * p);
}

function lgamma(x: number): number {
  // Lanczos approximation; exact enough for binomial coefficients.
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Wilson 95% interval for k of n, as fractions. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export const pct = (a: number, b: number, digits = 1) => (b ? `${((100 * a) / b).toFixed(digits)}%` : "n/a");
