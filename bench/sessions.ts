// Reading what benchmark rounds keep: results.jsonl, proxy.jsonl and, for Galley, each task-run's session files.
// Shared by the round miner (mine.ts), the signal replay (signals.ts), the verdicts (verdict.ts), the measured
// model profiles (profiles.ts), the canary (canary.ts) and the calibration report (calibrate.ts). Read-only.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
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
}

/** One record of a Galley session file. Only the fields used here are typed. */
export type SessionRecord =
  | { type: "meta"; id: string; parentId?: string; model: string }
  | { type: "message"; message: Message }
  | { type: "usage"; model: string; costUsd: number; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } }
  | { type: "signal"; kind: string; step: number; acted: string }
  | { type: "check"; exitCode: number | null; round: number; passed: boolean }
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
  for (const d of args) {
    if (existsSync(join(d, "results.jsonl"))) out.push(d);
    else for (const sub of existsSync(d) ? readdirSync(d) : []) if (existsSync(join(d, sub, "results.jsonl"))) out.push(join(d, sub));
  }
  return out.sort();
}

export const results = (round: string): Result[] => jsonl(join(round, "results.jsonl")).filter((r) => typeof r.pass === "boolean");
export const proxyCalls = (round: string): any[] => jsonl(join(round, "proxy.jsonl"));

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

/** The messages of the first attempt: up to the second message from the user (the harness's retry, if any). */
export function firstAttempt(messages: Message[]): Message[] {
  let users = 0;
  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === "user" && ++users > 1) break;
    out.push(m);
  }
  return out;
}

/** The model of a run's requests, from the proxy log (tag "<agent>__<lang>__<name>"). */
export function modelsByRun(round: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of proxyCalls(round)) if (c.status === 200 && c.tag && c.req?.model && !out.has(c.tag)) out.set(c.tag, c.req.model);
  return out;
}

/** List prices, USD per million tokens, for pricing proxy records: uncached input, cache read, output. */
export const PRICES: Record<string, { miss: number; hit: number; write: number; out: number }> = {
  "deepseek-flash": { miss: 0.15, hit: 0.003, write: 0.15, out: 0.6 },
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
  if (!p || !u) return undefined;
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
 *  so are those of a second attempt. */
export function costByRun(round: string, o: { firstOnly?: boolean } = {}): Map<string, number> {
  const out = new Map<string, number>();
  const runs = new Map(results(round).map((r) => [runKey(r), r]));
  for (const c of proxyCalls(round)) {
    if (c.status !== 200 || !c.tag) continue;
    const r = runs.get(c.tag);
    if (!r) continue;
    if (c.t !== undefined && r.startedAt && c.t < r.startedAt - 2000) continue;
    if (o.firstOnly && c.t !== undefined && r.startedAt2 && c.t >= r.startedAt2 - 2000) continue;
    const cost = callCost(c);
    if (cost !== undefined) out.set(c.tag, (out.get(c.tag) ?? 0) + cost);
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
