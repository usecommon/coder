// Configuration: built-in defaults < ~/.config/galley/config.json < ./galley.json < environment.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Config {
  /** "provider/model", e.g. "anthropic/claude-opus-5-5" or "deepseek/deepseek-v4-flash". */
  model: string;
  /** Cheaper model for sub-agents and compaction. Defaults to `model`. */
  smallModel?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
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
  mcp: Record<string, McpServerConfig>;
  pricing: Record<string, Price>;
}

export const DEFAULT_CONFIG: Config = {
  model: "anthropic/claude-opus-5-5",
  effort: "high",
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
  mcp: {},
  pricing: {},
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
      if (["providers", "permission", "mcp", "pricing"].includes(k)) Object.assign(cfg[key] as object, v);
      else (cfg as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return cfg;
}
