// USD per million tokens. Override or extend with `pricing` in galley.json.
import type { Usage } from "../core/types.ts";

export interface Price {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const DEFAULT_PRICES: Record<string, Price> = {
  // Anthropic first-party rates; cache writes are 1.25x input (5-minute TTL).
  "anthropic/claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "anthropic/claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "anthropic/claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "anthropic/claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
  // DeepSeek list prices as published in the models.dev catalog (Nov 2026); override in config if yours differ.
  "deepseek/deepseek-flash": { input: 0.15, output: 0.6, cacheRead: 0.003 },
  "deepseek/deepseek-v4-flash": { input: 0.15, output: 0.6, cacheRead: 0.003 },
  "deepseek/deepseek-v4-pro": { input: 0.66, output: 1.98, cacheRead: 0.022 },
};

export function costUsd(model: string, u: Usage, prices: Record<string, Price> = DEFAULT_PRICES): number {
  const p = prices[model];
  if (!p) return 0;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * (p.cacheRead ?? p.input) +
      u.cacheWriteTokens * (p.cacheWrite ?? p.input)) /
    1_000_000
  );
}
