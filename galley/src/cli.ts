#!/usr/bin/env bun
// galley: a safety-first, model-agnostic coding agent.
import { detectCheck } from "./agent/check-detect.ts";
import { addWorktree } from "./agent/workspace-state.ts";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { Agent } from "./agent/loop.ts";
import { runSteps } from "./agent/steps.ts";
import { INIT_PROMPT } from "./agent/prompt.ts";
import { loadConfig, trustProjectConfig, type Config, type Effort } from "./config.ts";
import type { AgentEvent } from "./core/types.ts";
import { McpClient } from "./mcp/client.ts";
import type { Approver } from "./safety/permission.ts";
import { detectSandbox, sandboxProcMode } from "./safety/sandbox.ts";
import { parseArgs, type Args } from "./args.ts";
import { getProvider, splitModel } from "./provider/index.ts";
import { profiles, weakerWarning } from "./provider/models.ts";
import { projectDir, Session } from "./session/store.ts";
import { serve } from "./server/http.ts";
import type { Tool } from "./tools/types.ts";
import { modelsReport } from "./ui/models.ts";
import { c, describeCall, fmtTok, fmtUsd, makeRenderer } from "./ui/render.ts";
import { repl } from "./ui/repl.ts";

const USAGE = `galley — a safety-first coding agent

Usage:
  galley [options]                 interactive session
  galley run "task" [options]      run one task headlessly (CI-friendly)
  galley serve [--port 4096]       HTTP + SSE server
  galley sessions                  list sessions (id, cost, status, title)
  galley show <id>                 replay a session's transcript
  galley init                      write AGENTS.md for this repository
  galley doctor                    check sandbox, config and API keys
  galley trust                     use this workspace's galley.json in full, as it is now
  galley models                    what is known about each model, and which roles suit the ones you can reach

Options:
  -m, --model <provider/model>     e.g. anthropic/claude-opus-5-5, deepseek/deepseek-flash, ollama/qwen3-coder
  --advisor <provider/model>       a second, stronger model to consult when a turn goes badly
  --reviewer <provider/model>      the same, and it also checks each finished piece of work before the run moves on
  --steps                          plan first, then work in small steps (each one checked when there is a reviewer)
  --observe <n>                    the advisor or reviewer also looks in on the work every n steps
  --escalate <provider/model>      a stronger model that takes over a turn that stays in trouble
  --check <command>                run this check (e.g. "npm test") when a turn that changed files ends;
                                   a failure goes back to the model, up to 3 times a turn
  --effort <level>                 reasoning effort: low, medium, high, xhigh or max
  --plan                           start in read-only plan mode
  -s, --session <id>               resume a session      --fork   continue it as a new session
  -y, --yes                        auto-approve actions that would ask (rules marked deny still apply)
  --detach                         (run) run in the background; follow with "galley show <id>"
  --worktree                       (run) work in a new git worktree on branch galley/<session>
  --json                           (run) print events as JSON lines
  --verify                         after changes, have a fresh read-only helper test them against the request (2-3x cost)
  --reasoning                      show the model's reasoning summaries
  --cwd <dir>                      workspace (default: current directory)
  --no-sandbox                     run commands without the OS sandbox (every command then asks)`;


const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

async function loadMcp(cfg: Config, workspace: string): Promise<{ tools: Tool[]; clients: McpClient[] }> {
  const tools: Tool[] = [];
  const clients: McpClient[] = [];
  for (const [name, sc] of Object.entries(cfg.mcp)) {
    const client = new McpClient(name, sc, workspace);
    try {
      tools.push(...(await client.start()));
      clients.push(client);
    } catch (err) {
      console.error(c.yellow(`MCP server "${name}" failed to start: ${(err as Error).message}`));
      client.close();
    }
  }
  return { tools, clients };
}

function openSession(workspace: string, cfg: Config, flags: Args["flags"]): Session {
  if (typeof flags.session === "string" && flags.session) {
    const s = Session.load(workspace, flags.session);
    return flags.fork ? s.fork() : s;
  }
  return Session.create(workspace, cfg.model);
}

function makeWorktree(workspace: string, sessionHint: string): string {
  const dir = join(projectDir(workspace), "worktrees", sessionHint);
  mkdirSync(join(projectDir(workspace), "worktrees"), { recursive: true });
  const err = addWorktree(workspace, `galley/${sessionHint}`, dir);
  if (err) throw new Error(err);
  return dir;
}

async function main() {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || cmd === "help") return console.log(USAGE);
  let workspace = realpathSync(resolve(typeof flags.cwd === "string" ? flags.cwd : process.cwd()));
  const overrides: Partial<Config> = {};
  if (typeof flags.model === "string") overrides.model = flags.model;
  if (flags["no-sandbox"]) overrides.sandbox = "off";
  if (flags.verify) overrides.verify = true;
  if (cmd === "trust") {
    const file = trustProjectConfig(workspace);
    console.log(file ? `Trusted ${file} as it is now. A later change to it needs trusting again.` : `No galley.json in ${workspace} (a link to one elsewhere is not trusted).`);
    return;
  }
  const ignored: string[] = [];
  const cfg = loadConfig(workspace, overrides, ignored);
  // "auto": the project's own test command. Without a check, a test command the project declares is mentioned.
  const found = detectCheck(workspace);
  if (cfg.check === "auto") {
    cfg.check = found;
    console.error(c.dim(found ? `check: ${found} (found in the project)` : "check auto: no test command found in the project; no check is run"));
  } else if (!cfg.check && found && (cmd === "run" || cmd === "chat"))
    console.error(c.dim(`Tests found: \`${found}\`. \`--check auto\` runs them when a turn that changed files ends, and sends failures back.`));
  if (ignored.length)
    console.error(
      c.yellow(`galley.json sets ${ignored.join(", ")}, which are not used: the file is not trusted (the model can write it, so it may not be yours). Read it, then run \`galley trust\` to use them.`),
    );
  // A flag changes one setting of a role and keeps the rest of what the config files say about it.
  if (typeof flags.advisor === "string") cfg.advisor = { ...cfg.advisor, model: flags.advisor };
  // A reviewer is an advisor that checks every finished unit of work. It decides for itself when to speak, so the
  // worker is not also given a tool to call it, unless the config says so.
  if (typeof flags.reviewer === "string") cfg.advisor = { ...cfg.advisor, model: flags.reviewer, review: true, tool: cfg.advisor?.tool ?? false };
  if (flags.steps) cfg.steps = true;
  if (typeof flags.observe === "string") {
    const n = Number(flags.observe);
    if (!cfg.advisor) throw new Error("--observe needs --reviewer or --advisor: there is no one to look in");
    if (!Number.isInteger(n) || n < 1) throw new Error("--observe takes a number of steps, 1 or more");
    cfg.advisor = { ...cfg.advisor, every: n };
  }
  if (typeof flags.escalate === "string") cfg.escalateModel = flags.escalate;
  if (typeof flags.check === "string") {
    if (!flags.check.trim()) throw new Error("--check takes a command, e.g. --check \"npm test\"");
    cfg.check = flags.check;
  }
  if (typeof flags.effort === "string") {
    if (!EFFORTS.includes(flags.effort as Effort)) throw new Error(`--effort is one of: ${EFFORTS.join(", ")}`);
    cfg.effort = flags.effort as Effort;
  }

  if (cmd === "doctor") return doctor(cfg, workspace);
  if (cmd === "models") return console.log(flags.json ? JSON.stringify(profiles(cfg.models), null, 2) : modelsReport(cfg));
  if (cmd === "sessions") {
    const list = Session.list(workspace);
    if (!list.length) return console.log("No sessions yet.");
    for (const s of list) console.log(`${s.id}  ${fmtUsd(s.costUsd).padStart(8)}  ${(s.status ?? "").padEnd(7)}  ${s.model.padEnd(32)}  ${s.title ?? ""}`);
    return;
  }
  if (cmd === "show") return show(workspace, positional[0]);

  // A mistyped model should stop a run here, not in the middle of a turn that needs it.
  for (const ref of [cfg.model, cfg.smallModel, cfg.planModel, cfg.advisor?.model, cfg.escalateModel, ...(cfg.fallbackModels ?? [])]) if (ref) getProvider(splitModel(ref).provider, cfg);

  // Holder lets the interactive UI install its prompt after the agent exists.
  let approve: Approver | undefined = flags.yes ? async () => "once" : undefined;
  const approver: Approver = (req) => (approve ? approve(req) : Promise.resolve("deny"));

  if (cmd === "serve") {
    const { tools } = await loadMcp(cfg, workspace);
    const port = Number(flags.port ?? 4096);
    const hostname = typeof flags.hostname === "string" ? flags.hostname : "127.0.0.1";
    const server = serve({ cfg, workspace, port, hostname, extraTools: tools, password: process.env.GALLEY_SERVER_PASSWORD });
    console.log(`galley server on http://${server.hostname}:${server.port} (workspace ${workspace}, sandbox ${cfg.sandbox === "off" ? "none" : detectSandbox()})`);
    return;
  }

  if (cmd === "run" || cmd === "init") {
    const task = cmd === "init" ? INIT_PROMPT : positional.join(" ");
    if (!task) throw new Error('Usage: galley run "your task"');
    if (flags.detach) return detach(workspace, cfg, flags, task);
    // Sessions always belong to the original repository, even when the work happens in a worktree.
    const session = typeof flags["session-id"] === "string" ? Session.load(workspace, flags["session-id"]) : openSession(workspace, cfg, flags);
    session.addRun();
    let worktree: string | undefined;
    if (flags.worktree) {
      worktree = makeWorktree(workspace, session.id);
      workspace = realpathSync(worktree);
    }
    const { tools, clients } = await loadMcp(cfg, workspace);
    const json = !!flags.json;
    const render = makeRenderer(process.stderr, { reasoning: !!flags.reasoning });
    let stdoutMid = false;
    const onEvent = (e: AgentEvent) => {
      if (json) return void process.stdout.write(JSON.stringify(e) + "\n");
      if (e.type === "text" && !e.agent.startsWith("task:")) {
        process.stdout.write(e.text);
        stdoutMid = !e.text.endsWith("\n");
        return;
      }
      if (stdoutMid && e.type !== "reasoning" && e.type !== "text") {
        process.stdout.write("\n");
        stdoutMid = false;
      }
      render(e);
    };
    const agent = new Agent({ cfg, workspace, session, approver, onEvent, extraTools: tools, mode: flags.plan ? "plan" : "build", model: modelFor(flags, cfg, session) });
    const ctrl = new AbortController();
    process.on("SIGINT", () => ctrl.abort());
    const r = cfg.steps ? await runSteps(agent, task, ctrl.signal) : await agent.send(task, ctrl.signal);
    if (!json && stdoutMid) process.stdout.write("\n");
    clients.forEach((m) => m.close());
    if (worktree) console.error(c.dim(`changes are in ${worktree} (branch galley/${session.id}); review, commit there, then merge`));
    console.error(c.dim(`session ${session.id}`));
    process.exit(r.stopReason === "error" || r.stopReason === "refusal" ? 1 : 0);
  }

  // Interactive.
  const session = openSession(workspace, cfg, flags);
  const { tools } = await loadMcp(cfg, workspace);
  const agent = new Agent({ cfg, workspace, session, approver, onEvent: makeRenderer(process.stdout, { reasoning: !!flags.reasoning }), extraTools: tools, mode: flags.plan ? "plan" : "build", model: modelFor(flags, cfg, session) });
  await repl({ agent }, { set: (a) => (approve = flags.yes ? approve : a) }, cfg);
  process.exit(0);
}

/** An explicit --model wins; a resumed session keeps its own model. */
function modelFor(flags: Args["flags"], cfg: Config, session: Session): string {
  if (typeof flags.model === "string") return cfg.model;
  return flags.session || flags["session-id"] ? session.meta.model : cfg.model;
}

function detach(workspace: string, cfg: Config, flags: Args["flags"], task: string) {
  const session = flags.worktree ? undefined : openSession(workspace, cfg, flags);
  const logDir = join(projectDir(workspace), "logs");
  mkdirSync(logDir, { recursive: true });
  const id = session?.id ?? new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const log = join(logDir, `${id}.log`);
  const fd = openSync(log, "a");
  // Under `bun src/cli.ts` re-run the script; a compiled binary re-runs itself (its argv[1] is a virtual path).
  const script = process.argv[1] ?? "";
  const self = /\.(ts|js|mjs)$/.test(script) && !script.startsWith("/$bunfs") ? [script] : [];
  const args = [...self, "run", task, "--cwd", workspace];
  if (session) args.push("--session-id", session.id);
  for (const f of ["model", "advisor", "reviewer", "observe", "escalate", "effort", "check"]) if (typeof flags[f] === "string") args.push(`--${f}`, String(flags[f]));
  for (const f of ["yes", "plan", "worktree", "no-sandbox", "verify", "steps"]) if (flags[f]) args.push(`--${f}`);
  const child = spawn(process.execPath, args, { detached: true, stdio: ["ignore", fd, fd], cwd: workspace });
  child.unref();
  console.log(`Started background run ${session ? `in session ${session.id}` : ""} (pid ${child.pid}).`);
  console.log(`Log: ${log}`);
  if (session) console.log(`Follow: galley show ${session.id}`);
  if (!flags.yes) console.log(c.yellow("Note: background runs can't ask for approval, so actions that would ask are refused. Use --yes to allow them."));
}

function show(workspace: string, id: string | undefined) {
  if (!id) throw new Error("Usage: galley show <session-id>");
  const s = Session.load(workspace, id);
  console.log(c.bold(s.title ?? s.id) + c.dim(`  ${s.id} · ${s.meta.model} · started ${s.meta.created}${s.meta.parentId ? ` · from ${s.meta.parentId}` : ""}`));
  for (const r of s.records()) {
    if (r.type === "message") {
      const m = r.message;
      if (m.role === "user") console.log("\n" + c.green("› ") + m.content);
      else if (m.role === "assistant") {
        if (m.content) console.log(m.content);
        for (const call of m.toolCalls) console.log(c.cyan(`▸ ${call.name} `) + describeCall(call));
      } else for (const res of m.results) if (res.isError) console.log(c.red(`  ✗ ${res.content.split("\n")[0]}`));
    } else if (r.type === "compaction") console.log(c.magenta(`↺ compacted (kept last ${r.keep} messages)`));
    else if (r.type === "status") console.log(c.dim(`[${r.status}${r.detail ? `: ${r.detail}` : ""} at ${r.at}]`));
  }
  const u = s.usage;
  console.log(c.dim(`\n${fmtTok(u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens)} in (${fmtTok(u.cacheReadTokens)} cached), ${fmtTok(u.outputTokens)} out — ${fmtUsd(s.costUsd)}`));
}

function doctor(cfg: Config, workspace: string) {
  const sb = cfg.sandbox === "off" ? "off (by config)" : detectSandbox();
  const ok = (b: boolean) => (b ? c.green("ok") : c.yellow("missing"));
  console.log(`workspace   ${workspace}`);
  console.log(`model       ${cfg.model}`);
  const all = profiles(cfg.models);
  for (const [role, ref] of [["plan model", cfg.planModel], [cfg.advisor?.review ? "reviewer" : "advisor", cfg.advisor?.model], ["takes over", cfg.escalateModel]] as const) {
    if (!ref) continue;
    // An advisor or a model that takes over earns its price only by being the stronger one.
    const weaker = role === "plan model" ? undefined : weakerWarning(cfg.model, ref, all);
    console.log(`${role.padEnd(11)} ${ref}${weaker ? c.yellow(`  (${weaker})`) : ""}`);
  }
  if (cfg.fallbackModels?.length) console.log(`fallbacks   ${cfg.fallbackModels.join(", ")}`);
  const shared = sb === "bwrap" && sandboxProcMode() === "shared";
  console.log(`sandbox     ${sb === "none" ? c.yellow("none — install bubblewrap (Linux) for sandboxed commands") : c.green(sb)}${shared ? c.yellow(" (inside another sandbox or container: commands can see Galley's own process)") : ""}`);
  const keys: [string, string][] = [
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
    ["deepseek", "DEEPSEEK_API_KEY"],
    ["openrouter", "OPENROUTER_API_KEY"],
    ["qwen", "DASHSCOPE_API_KEY"],
    ["moonshot", "MOONSHOT_API_KEY"],
    ["zai", "ZAI_API_KEY"],
    ["groq", "GROQ_API_KEY"],
  ];
  for (const [p, k] of keys) console.log(`${p.padEnd(11)} ${k.padEnd(20)} ${ok(!!process.env[k])}`);
  console.log(`ripgrep     ${ok(spawnSync("rg", ["--version"]).status === 0)}`);
  console.log(`mcp         ${Object.keys(cfg.mcp).join(", ") || "none configured"}`);
}

main().catch((err) => {
  console.error(c.red(`error: ${(err as Error).message}`));
  process.exit(1);
});
