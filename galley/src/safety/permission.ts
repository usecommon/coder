// Decide allow / ask / deny for each tool call, before anything runs.
import type { Action, Rule } from "../config.ts";

export type Mode = "build" | "plan";

export interface PermissionRequest {
  tool: string;
  /** What the call touches: a command for bash, a path for file tools, a summary otherwise. */
  subject: string;
  /** Extra reason shown to the user (e.g. "requests network access"). */
  reason?: string;
}

export type ApprovalAnswer = "once" | "always" | "deny";
export type Approver = (req: PermissionRequest) => Promise<ApprovalAnswer>;

const READ_ONLY_TOOLS = new Set(["read", "list", "glob", "grep", "task"]);
const rank: Record<Action, number> = { allow: 0, ask: 1, deny: 2 };
const strictest = (a: Action, b: Action): Action => (rank[a] >= rank[b] ? a : b);

export function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${esc}$`, "s");
}

/** Split a shell command into segments so `ls && rm -rf x` is judged by its worst part. */
export function splitCommand(cmd: string): string[] {
  return cmd
    .split(/&&|\|\||;|\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ruleFor(tool: string, rules: Record<string, Rule>): Rule | undefined {
  if (rules[tool] !== undefined) return rules[tool];
  let best: { len: number; rule: Rule } | undefined;
  for (const [k, v] of Object.entries(rules)) {
    if (k.includes("*") && globToRegExp(k).test(tool) && (!best || k.length > best.len)) best = { len: k.length, rule: v };
  }
  return best?.rule;
}

function matchPatterns(subject: string, patterns: Record<string, Action>): Action {
  let best: { len: number; action: Action } | undefined;
  for (const [pat, action] of Object.entries(patterns)) {
    if (globToRegExp(pat).test(subject) && (!best || pat.length > best.len)) best = { len: pat.length, action };
  }
  return best?.action ?? "ask";
}

export function evaluate(req: PermissionRequest, rules: Record<string, Rule>, mode: Mode): Action {
  if (mode === "plan" && !READ_ONLY_TOOLS.has(req.tool) && req.tool !== "bash") return "deny";
  const rule = ruleFor(req.tool, rules);
  if (rule === undefined) return "ask";
  if (typeof rule === "string") return rule;
  if (req.tool === "bash") return splitCommand(req.subject).reduce<Action>((acc, seg) => strictest(acc, matchPatterns(seg, rule)), "allow");
  return matchPatterns(req.subject, rule);
}

/** Remembers "always" answers for the rest of the session. */
export class PermissionGate {
  private always = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private rules: Record<string, Rule>,
    private approver: Approver | undefined,
    public mode: Mode = "build",
  ) {}

  async check(req: PermissionRequest, floor: Action = "allow"): Promise<{ ok: true } | { ok: false; why: string }> {
    const action = strictest(evaluate(req, this.rules, this.mode), floor);
    if (action === "allow") return { ok: true };
    if (action === "deny") return { ok: false, why: this.mode === "plan" ? "denied: plan mode is read-only" : "denied by permission rules" };
    const key = `${req.tool}\u0000${req.subject}\u0000${req.reason ?? ""}`;
    if (this.always.has(key)) return { ok: true };
    if (!this.approver) return { ok: false, why: "needs approval, but no one can approve in this mode (use --yes or adjust permission rules)" };
    // One prompt at a time, even when parallel tool calls need approval.
    const ask = this.queue.then(() => (this.always.has(key) ? ("once" as const) : this.approver!(req)));
    this.queue = ask.catch(() => undefined);
    const answer = await ask;
    if (answer === "always") this.always.add(key);
    return answer === "deny" ? { ok: false, why: "the user declined this action" } : { ok: true };
  }
}
