// What `galley models`, `/models` and `/model` print: what is known about each model, and which roles suit the
// models that can be reached.
import type { Config } from "../config.ts";
import { PRESETS } from "../provider/index.ts";
import { BOARD, describeModel, profiles, rereadCost, suggestRoles, weakerWarning } from "../provider/models.ts";
import { DEFAULT_PRICES, type Price } from "../provider/pricing.ts";
import { fmtUsd } from "./render.ts";

export const allPrices = (cfg: Config): Record<string, Price> => ({ ...DEFAULT_PRICES, ...cfg.pricing });

/** The environment variable that holds a provider's key, if it needs one. */
function keyEnv(provider: string, cfg: Config): string | undefined {
  if (provider === "anthropic") return cfg.providers.anthropic?.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  return cfg.providers[provider]?.apiKeyEnv ?? PRESETS[provider]?.apiKeyEnv;
}

/** Profiled models whose provider has a key set (or needs none). */
export function reachable(cfg: Config, env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(profiles(cfg.models)).filter((ref) => {
    const provider = ref.slice(0, ref.indexOf("/"));
    const known = provider === "anthropic" || provider in PRESETS || provider in cfg.providers;
    const k = keyEnv(provider, cfg);
    return known && (!k || !!env[k]);
  });
}

export function modelsReport(cfg: Config, env: NodeJS.ProcessEnv = process.env): string {
  const all = profiles(cfg.models);
  const prices = allPrices(cfg);
  const refs = Object.keys(all)
    .filter((r) => r !== "deepseek/deepseek-v4-flash")
    .sort((a, b) => (all[b]!.agentic?.score ?? -1) - (all[a]!.agentic?.score ?? -1));
  const w = Math.max(...refs.map((r) => r.length));
  const row = (cells: string[]) => cells.map((cell, i) => cell.padEnd([w, 13, 10, 16][i] ?? 0)).join("  ").trimEnd();
  const out = [row(["model", "hard tasks", "per run", "price in / out", "note"])];
  for (const r of refs) {
    const p = all[r]!;
    const price = prices[r];
    out.push(
      row([
        r,
        p.agentic ? `${p.agentic.score.toFixed(1)}% ± ${p.agentic.ci.toFixed(1)}` : "not measured",
        p.agentic?.costPerRun !== undefined ? fmtUsd(p.agentic.costPerRun) : "",
        price ? `$${price.input} / $${price.output}` : "",
        p.note ?? "",
      ]),
    );
  }
  out.push(
    "",
    `"Hard tasks" is the share of ${BOARD.name} tasks solved and "per run" the cost of one run there, from the benchmark's own board`,
    `(${BOARD.url}, read ${BOARD.read}), mostly inside the model vendor's own harness. Prices are per million tokens. Nothing finer`,
    "is recorded (which model for debugging, which for front-end work): no public source measures it. Correct or add entries",
    'under "models" in galley.json.',
    "",
    "For the keys that are set:",
    ...suggestRoles(reachable(cfg, env), all).lines.map((l) => `  ${l}`),
  );
  return out.join("\n");
}

/** What to show when the session's model is about to change from `from` to `to`. */
export function switchNotes(cfg: Config, from: string, to: string, contextTokens: number): string[] {
  const all = profiles(cfg.models);
  const out = [describeModel(to, all, allPrices(cfg))];
  const reread = contextTokens > 0 ? rereadCost(to, contextTokens, allPrices(cfg)) : undefined;
  if (reread !== undefined && from !== to) out.push(`It reads the session afresh on its next request, with nothing cached: about ${fmtUsd(reread)}.`);
  const weaker = from !== to ? weakerWarning(from, to, all) : undefined;
  if (weaker) out.push(`Note: ${weaker}`);
  return out;
}
