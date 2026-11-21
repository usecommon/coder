// Configuration: built-in defaults < ~/.config/galley/config.json < ./galley.json < environment.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dataDir } from "./session/store.ts";
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
  /** Most consultations in one turn, whoever asks (default 3; 8 when `every` is set). */
  maxUses?: number;
  /** Have it look in on the work every this many steps of a turn. After a look that found nothing the next one comes
   *  later (two steps more each time, up to four times this number); after one that found something, this soon again. */
  every?: number;
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
  /** What the model that takes over reads. "edits" (default): the request and the files as they now stand, not the
   *  other model's attempt. "transcript": the whole session. Measured on SWE-bench Verified, the first recovered 64 to
   *  84% of the stronger model's advantage and the second 36 to 47%, at a higher price (research/reports, area 1). */
  escalateContext?: "edits" | "transcript";
  /** Hand the turn to `escalateModel` once the project's check has failed this many times in it (default 2; 0 never).
   *  A failing check is a real sign the turn is going wrong; the trouble signals were measured to be no better than
   *  chance at telling a failing run from a passing one. */
  escalateOnCheck?: number;
  /** A command that checks the work, e.g. "npm test" or "pytest -q", or "auto" for the project's own test command
   *  (a Makefile test target, a package.json test script, cargo, go, mix or pytest). When a turn that changed files ends, it is run
   *  in the sandbox (without one, only after asking); if it fails, its output goes back to the model, up to
   *  `checkRounds` times a turn. */
  check?: string;
  /** How many failed checks a turn feeds back before it ends anyway (default 3). */
  checkRounds?: number;
  /** Seconds a check may run before it is stopped (default 300). */
  checkTimeout?: number;
  /** Keep one-line lessons per project when a failing check comes to pass, and read the most related one back at
   *  the start of a session (default false; see src/agent/lessons.ts). Needs `check`. */
  lessons?: boolean;
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
    // "__proto__" and its kin are dropped at every level: merged in, they would set the prototype of the config, and
    // with it any setting, past the check on what an untrusted file may set.
    return JSON.parse(readFileSync(path, "utf8"), (k, v) => (k === "__proto__" || k === "constructor" || k === "prototype" ? undefined : v));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

/** Keys of a workspace's galley.json that start programs on the host, send API keys elsewhere, loosen the sandbox or
 *  the rules, or run commands. The model can write that file (the workspace is writable from the sandbox), so these are
 *  used only from a file the user has trusted, as it is now. */
export const TRUSTED_ONLY = ["mcp", "providers", "sandbox", "network", "permission", "check", "checkTimeout", "lessons", "escalateContext"] as const;

const trustFile = () => join(dataDir(), "trusted.json");
const digestOf = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Trust the workspace's galley.json as it is now (`galley trust`). A later change, by anyone, needs trusting again. */
/** Where trust for a workspace's galley.json is kept: under the workspace's own path, so that a link from one
 *  workspace to another's trusted file is not the trusted file. */
const trustKey = (cwd: string) => join(realpathSync(cwd), "galley.json");
/** Only a regular file in the workspace can be trusted; a link (to another project's trusted file, say) cannot. */
const ownFile = (file: string) => lstatSync(file, { throwIfNoEntry: false })?.isFile() === true;

export function trustProjectConfig(cwd: string): string | undefined {
  const file = join(cwd, "galley.json");
  if (!ownFile(file)) return undefined;
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(readFileSync(trustFile(), "utf8"));
  } catch {}
  all[trustKey(cwd)] = digestOf(file);
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(trustFile(), JSON.stringify(all, null, 1) + "\n");
  return file;
}

function trusted(cwd: string, file: string): boolean {
  if (!ownFile(file)) return false;
  try {
    return JSON.parse(readFileSync(trustFile(), "utf8"))[trustKey(cwd)] === digestOf(file);
  } catch {
    return false;
  }
}

/** The configuration: defaults, the user's config, the workspace's galley.json, GALLEY_MODEL, then `overrides`.
 *  Keys of galley.json that only a trusted file may set are left out, and their names put in `ignored`. */
export function loadConfig(cwd: string, overrides: Partial<Config> = {}, ignored: string[] = []): Config {
  const user = readJson(join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "galley", "config.json"));
  const projectFile = join(cwd, "galley.json");
  const project = readJson(projectFile);
  if (existsSync(projectFile) && !trusted(cwd, projectFile))
    for (const k of TRUSTED_ONLY)
      if (k in project) {
        delete (project as Record<string, unknown>)[k];
        ignored.push(k);
      }
  const env: Partial<Config> = process.env.GALLEY_MODEL ? { model: process.env.GALLEY_MODEL } : {};
  const layers = [user, project, env, overrides];
  const cfg: Config = structuredClone(DEFAULT_CONFIG);
  for (const l of layers) {
    for (const [k, v] of Object.entries(l)) {
      if (v === undefined || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const key = k as keyof Config;
      if (["providers", "permission", "mcp", "pricing", "models"].includes(k)) Object.assign(cfg[key] as object, v);
      else (cfg as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return cfg;
}
