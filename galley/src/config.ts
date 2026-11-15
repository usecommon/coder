// Configuration: built-in defaults < ~/.config/galley/config.json < ./galley.json < environment.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelProfile } from "./provider/models.ts";
import type { Price } from "./provider/pricing.ts";

export type Action = "allow" | "ask" | "deny";
/** Either one action for the whole tool, or glob patterns over the tool's subject (command or path). */
export type Rule = Action | Record<string, Action>;

export interface ProviderConfig {
  baseURL?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  sendReasoning?: boolean;
  includeUsage?: boolean;
  /** Sent as `reasoning_effort` to OpenAI-compatible APIs that take it (DeepSeek: none, low, high, max). */
  reasoningEffort?: string;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** A second model that reads the session and advises the main one. It runs nothing. */
export interface AdvisorConfig {
  /** "provider/model". Worth having only if it is clearly stronger than the main model (`galley models`). */
  model: string;
  /** Most consultations in one turn, whoever asks (default 3). */
  maxUses?: number;
  /** Ask it when the harness sees the turn going badly (default true). */
  onStuck?: boolean;
  /** Let the main model ask it too, through the `advise` tool (default true). */
  tool?: boolean;
  /** Have it check a change against the request before the turn ends (default false: it costs a consult every turn). */
  review?: boolean;
  effort?: Effort;
  /** Cap on its answer, thinking included (default 16,000 tokens). */
  maxTokens?: number;
}

export interface Config {
  /** "provider/model", e.g. "anthropic/claude-opus-5-5" or "deepseek/deepseek-flash". */
  model: string;
  /** Cheaper model for sub-agents and compaction. Defaults to `model`. */
  smallModel?: string;
  /** Used instead of `model` while in plan mode. */
  planModel?: string;
  advisor?: AdvisorConfig;
  /** Takes over for the rest of a turn that stays in trouble (after the advisor's advice, when there is an advisor).
   *  Ignored when the model profiles say it is not stronger than the model in use. */
  escalateModel?: string;
  /** Work on a task in small steps: a plan first, then one turn for each step. With `advisor.review` on, each step
   *  is checked by the advisor before the next one starts. */
  steps?: boolean;
  /** Tried in order, for the rest of the turn, when the provider of the model in use keeps failing. */
  fallbackModels?: string[];
  /** Additions and corrections to the built-in model profiles (src/provider/models.ts). */
  models: Record<string, Partial<ModelProfile>>;
  effort?: Effort;
  maxTokens?: number;
  providers: Record<string, ProviderConfig>;
  permission: Record<string, Rule>;
  /** "auto" uses bubblewrap/Seatbelt when available; "off" runs commands unsandboxed (every command then asks). */
  sandbox: "auto" | "off";
  /** Approval policy for commands that request network access. */
  network: Action;
  /** Compact the conversation when the last request's input exceeded this many tokens. */
  compactAt: number;
  /** Max characters of a tool result kept in context. */
  maxToolOutput: number;
  maxSteps: number;
  /** After a turn that changed files, ask the model once to check its work against the request. */
  review: boolean;
  /** After a turn that changed files, have a fresh read-only helper test the change against the request. */
  verify: boolean;
  mcp: Record<string, McpServerConfig>;
  pricing: Record<string, Price>;
}

export const DEFAULT_CONFIG: Config = {
  model: "anthropic/claude-opus-5-5",
  // Measured on Claude Sonnet 5.5: the same pass rate as "high" at 15% lower cost (bench/RESULTS-clean.md).
  // It is also the API's own default for Claude Opus 5.5 and Haiku 5.5.
  effort: "medium",
  providers: {},
  permission: {
    read: "allow",
    list: "allow",
    glob: "allow",
    grep: "allow",
    task: "allow",
    edit: "allow",
    write: "allow",
    bash: {
      "*": "allow",
      "git push*": "ask",
      "git reset --hard*": "ask",
      "rm -rf *": "ask",
      "sudo *": "deny",
      "curl * | sh*": "deny",
    },
    "mcp_*": "ask",
  },
  sandbox: "auto",
  network: "ask",
  compactAt: 120_000,
  maxToolOutput: 30_000,
  maxSteps: 60,
  review: false,
  verify: false,
  mcp: {},
  pricing: {},
  models: {},
};

function readJson(path: string): Partial<Config> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

export function loadConfig(cwd: string, overrides: Partial<Config> = {}): Config {
  const user = readJson(join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "galley", "config.json"));
  const project = readJson(join(cwd, "galley.json"));
  const env: Partial<Config> = process.env.GALLEY_MODEL ? { model: process.env.GALLEY_MODEL } : {};
  const layers = [user, project, env, overrides];
  const cfg: Config = structuredClone(DEFAULT_CONFIG);
  for (const l of layers) {
    for (const [k, v] of Object.entries(l)) {
      if (v === undefined) continue;
      const key = k as keyof Config;
      if (["providers", "permission", "mcp", "pricing", "models"].includes(k)) Object.assign(cfg[key] as object, v);
      else (cfg as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return cfg;
}
