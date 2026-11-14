// What Galley knows about models, so that it can price a switch and refuse a pointless one.
//
// The only strength figure kept here is one that is measured the same way for every model: the share of
// Terminal-Bench 4.1 tasks solved, as published on the benchmark's own board. Nothing finer ("good at debugging",
// "good at front-end work") is recorded, because no public source measures it reliably
// (research/model-switching.md, section 3). Add or correct entries under `models` in galley.json.
import type { Price } from "./pricing.ts";

export interface AgenticScore {
  /** Percent of tasks solved. */
  score: number;
  /** Half-width of the board's 95% interval, in points. */
  ci: number;
  /** The harness and effort the run used: scores are comparable only loosely across harnesses. */
  harness: string;
  effort: string;
  /** US dollars per run on that board. Per-token prices do not predict it. */
  costPerRun?: number;
  /** Date of the entry on the board. */
  date: string;
}

export interface ModelProfile {
  name: string;
  agentic?: AgenticScore;
  /** Reasoning-effort levels the API accepts, lowest first. */
  efforts?: string[];
  note?: string;
}

export const BOARD = { name: "Terminal-Bench 4.1", url: "https://www.tbench.ai/", read: "2026-11-14" };

const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const DEEPSEEK_EFFORTS = ["low", "high", "max"];
const cc = (score: number, ci: number, costPerRun: number, date: string): AgenticScore => ({ score, ci, harness: "Claude Code", effort: "max", costPerRun, date });
const codex = (score: number, ci: number, costPerRun: number, date: string): AgenticScore => ({ score, ci, harness: "Codex", effort: "max", costPerRun, date });

const FLASH: ModelProfile = {
  name: "DeepSeek V4.1 Flash",
  agentic: cc(38.48, 3.76, 0.56, "2026-10-17"),
  efforts: DEEPSEEK_EFFORTS,
  note: "The cheapest capable model on the board. Ahead of the older deepseek-v4-pro on every agentic benchmark both report.",
};

export const PROFILES: Record<string, ModelProfile> = {
  "anthropic/claude-opus-5-5": { name: "Claude Opus 5.5", agentic: cc(65.76, 3.11, 14.3, "2026-09-22"), efforts: CLAUDE_EFFORTS, note: "Top of the board, at under a third of Fable 5.2's cost per run." },
  "anthropic/claude-fable-5-2": { name: "Claude Fable 5.2", agentic: cc(65.76, 2.8, 49.98, "2026-11-09"), efforts: CLAUDE_EFFORTS, note: "Level with Opus 5.5 on this board at 3.5 times its cost per run." },
  "anthropic/claude-sonnet-5-5": { name: "Claude Sonnet 5.5", agentic: cc(63.94, 3.0, 22.22, "2026-09-28"), efforts: CLAUDE_EFFORTS, note: "Half Opus 5.5's price per token, but it wrote twice as much here and cost more per run." },
  "anthropic/claude-haiku-5-5": { name: "Claude Haiku 5.5", agentic: cc(40.0, 3.61, 2.89, "2026-10-07"), efforts: CLAUDE_EFFORTS, note: "Level with deepseek-flash here at five times its cost per run." },
  "deepseek/deepseek-flash": FLASH,
  // A retired name that DeepSeek now serves with the same model.
  "deepseek/deepseek-v4-flash": FLASH,
  "deepseek/deepseek-v4-pro": {
    name: "DeepSeek V4 Pro",
    agentic: cc(6.67, 2.52, 2.2, "2026-08-13"),
    efforts: DEEPSEEK_EFFORTS,
    note: "An older generation. Weaker than deepseek-flash at agentic coding and 3 to 7 times its price per token: not an upgrade.",
  },
  "openai/gpt-6.1-sol": { name: "GPT-6.1 Sol", agentic: codex(60.91, 2.97, 1.92, "2026-09-29"), note: "Close to the top models at a fraction of their cost per run." },
  "openai/gpt-6-astra": { name: "GPT-6 Astra", agentic: codex(60.3, 2.82, 9.9, "2026-09-03"), note: "The same score at high effort for 30% less; 9 points lower at low effort." },
  "openai/gpt-6.1-terra": { name: "GPT-6.1 Terra", agentic: codex(53.33, 3.09, 2.65, "2026-10-26") },
  "openai/gpt-6-luna": { name: "GPT-6 Luna", agentic: codex(15.15, 2.66, 0.22, "2026-09-22"), note: "For small, well-defined jobs, not for long agentic work." },
  "zai/glm-5.3": { name: "GLM-5.3", agentic: cc(41.21, 3.28, 8.27, "2026-08-14") },
};

export type Profiles = Record<string, ModelProfile>;

/** The built-in profiles with the user's additions and corrections laid over them. */
export function profiles(extra: Record<string, Partial<ModelProfile>> = {}): Profiles {
  const out: Profiles = { ...PROFILES };
  for (const [ref, p] of Object.entries(extra)) out[ref] = { ...(out[ref] ?? { name: ref }), ...p };
  return out;
}

export type Gap =
  | { known: false }
  /** `points` is how far `to` is ahead of `from`; `clear` says the gap is outside the two intervals combined. */
  | { known: true; points: number; clear: boolean; from: AgenticScore; to: AgenticScore };

/** How much stronger `to` is than `from` at agentic coding, when both are profiled. */
export function gap(from: string, to: string, all: Profiles = PROFILES): Gap {
  const a = all[from]?.agentic;
  const b = all[to]?.agentic;
  if (!a || !b) return { known: false };
  const points = b.score - a.score;
  return { known: true, points, clear: Math.abs(points) > Math.hypot(a.ci, b.ci), from: a, to: b };
}

/** What to tell someone who is about to hand work to `to`, when the profiles say it is not the stronger model. */
export function weakerWarning(from: string, to: string, all: Profiles = PROFILES): string | undefined {
  const g = gap(from, to, all);
  if (!g.known || g.points > 0) return undefined;
  const same = !g.clear;
  return same
    ? `${to} is not known to be stronger than ${from}: ${g.to.score.toFixed(1)}% against ${g.from.score.toFixed(1)}% on ${BOARD.name}, inside the board's intervals.`
    : `${to} is the weaker model at agentic coding: ${g.to.score.toFixed(1)}% against ${g.from.score.toFixed(1)}% for ${from} on ${BOARD.name}.`;
}

/** The one-time price of a switch: the new model reads the whole conversation at its uncached input price. */
export function rereadCost(to: string, contextTokens: number, prices: Record<string, Price>): number | undefined {
  const p = prices[to];
  return p ? (contextTokens * p.input) / 1_000_000 : undefined;
}

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n >= 0.01 ? 2 : 4)}`);

/** One line about a model: what is measured, and what is not. */
export function describeModel(ref: string, all: Profiles, prices: Record<string, Price>): string {
  const p = all[ref];
  const price = prices[ref];
  const parts: string[] = [];
  if (p?.agentic) parts.push(`${p.agentic.score.toFixed(1)}% ± ${p.agentic.ci.toFixed(1)} on ${BOARD.name}${p.agentic.costPerRun !== undefined ? `, ${usd(p.agentic.costPerRun)} a run` : ""}`);
  else parts.push("no measured strength on record");
  if (price) parts.push(`$${price.input} in, $${price.output} out per million tokens${price.cacheRead !== undefined ? ` ($${price.cacheRead} cached)` : ""}`);
  if (p?.note) parts.push(p.note);
  return parts.join("; ");
}

export interface Suggestion {
  /** Cheapest per run among the profiled models that can be reached. */
  main?: string;
  /** A reachable model clearly stronger than `main`, if there is one. */
  advisor?: string;
  lines: string[];
}

/** Roles for the models a user can reach, from the profiles alone. */
export function suggestRoles(reachable: string[], all: Profiles = PROFILES): Suggestion {
  // The retired alias would only repeat its model.
  const scored = reachable.filter((r) => all[r]?.agentic && r !== "deepseek/deepseek-v4-flash");
  if (!scored.length) return { lines: ["No profiled model can be reached with the keys that are set."] };
  const score = (r: string) => all[r]!.agentic!.score;
  const cost = (r: string) => all[r]!.agentic!.costPerRun ?? Infinity;
  const cheapest = (rs: string[]) => [...rs].sort((x, y) => cost(x) - cost(y))[0]!;
  const top = Math.max(...scored.map(score));
  const best = scored.find((r) => score(r) === top)!;
  // Models the board cannot tell apart from the best one count as equally strong; among them the cheapest per run.
  const strongest = cheapest(scored.filter((r) => r === best || !(gap(r, best, all) as Extract<Gap, { known: true }>).clear));
  // A rule of thumb, not a measurement: a main model should solve at least half of what the strongest one does.
  const main = cheapest(scored.filter((r) => score(r) >= score(strongest) * 0.5));
  const a = all[main]!.agentic!;
  const lines = [`main model   ${main}  (the cheapest per run that solves at least half of what the strongest does: ${a.score.toFixed(1)}%${a.costPerRun !== undefined ? `, ${usd(a.costPerRun)} a run` : ""})`];
  const g = gap(main, strongest, all);
  let advisor: string | undefined;
  if (strongest !== main && g.known && g.clear && g.points > 0) {
    advisor = strongest;
    lines.push(`advisor      ${strongest}  (${g.points.toFixed(0)} points stronger; consult it on hard decisions rather than handing the session over)`);
  } else lines.push("advisor      none: no model you can reach is clearly stronger than the main one, so a second opinion would cost more and add little");
  for (const r of scored) {
    const d = gap(main, r, all);
    // Weaker and no cheaper: nothing it does better. (A weaker model that is cheaper can still serve for summaries.)
    if (r !== main && d.known && d.clear && d.points < 0 && cost(r) >= cost(main))
      lines.push(`avoid        ${r}  (weaker and dearer: ${d.to.score.toFixed(1)}% against ${d.from.score.toFixed(1)}% for ${main})`);
  }
  if (strongest !== main) lines.push(`for the highest pass rate whatever the cost, use ${strongest} as the main model`);
  return { main, advisor, lines };
}
