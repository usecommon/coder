#!/usr/bin/env bun
// galley: a safety-first, model-agnostic coding agent.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { Agent } from "./agent/loop.ts";
import { INIT_PROMPT } from "./agent/prompt.ts";
import { loadConfig, type Config } from "./config.ts";
import type { AgentEvent } from "./core/types.ts";
import { McpClient } from "./mcp/client.ts";
import type { Approver } from "./safety/permission.ts";
import { detectSandbox } from "./safety/sandbox.ts";
import { projectDir, Session } from "./session/store.ts";
import { serve } from "./server/http.ts";
import type { Tool } from "./tools/types.ts";
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

Options:
  -m, --model <provider/model>     e.g. anthropic/claude-opus-5-5, deepseek/deepseek-v4-flash, ollama/qwen3-coder
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

interface Args {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const short: Record<string, string> = { m: "model", s: "session", y: "yes", h: "help" };
  const valued = new Set(["model", "session", "session-id", "cwd", "port", "hostname"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--") || (a.startsWith("-") && a.length === 2)) {
      let key = a.startsWith("--") ? a.slice(2) : (short[a.slice(1)] ?? a.slice(1));
      let val: string | boolean = true;
      if (key.includes("=")) [key, val] = [key.slice(0, key.indexOf("=")), key.slice(key.indexOf("=") + 1)];
      else if (valued.has(key)) val = argv[++i] ?? "";
      flags[key] = val;
    } else positional.push(a);
  }
  const commands = new Set(["run", "serve", "sessions", "show", "init", "doctor", "help"]);
  const cmd = positional[0] && commands.has(positional[0]) ? positional.shift()! : "chat";
  return { cmd, positional, flags };
}

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
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: workspace, encoding: "utf8" });
  if (top.status !== 0) throw new Error("--worktree needs a git repository");
  const dir = join(projectDir(workspace), "worktrees", sessionHint);
  mkdirSync(join(projectDir(workspace), "worktrees"), { recursive: true });
  const r = spawnSync("git", ["worktree", "add", "-b", `galley/${sessionHint}`, dir], { cwd: workspace, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git worktree add failed: ${r.stderr.trim()}`);
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
  const cfg = loadConfig(workspace, overrides);

  if (cmd === "doctor") return doctor(cfg, workspace);
  if (cmd === "sessions") {
    const list = Session.list(workspace);
    if (!list.length) return console.log("No sessions yet.");
    for (const s of list) console.log(`${s.id}  ${fmtUsd(s.costUsd).padStart(8)}  ${(s.status ?? "").padEnd(7)}  ${s.model.padEnd(32)}  ${s.title ?? ""}`);
    return;
  }
  if (cmd === "show") return show(workspace, positional[0]);

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
    session.setStatus("running");
    const ctrl = new AbortController();
    process.on("SIGINT", () => ctrl.abort());
    const r = await agent.send(task, ctrl.signal);
    session.setStatus(r.stopReason === "error" ? "error" : "done", r.stopReason);
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
  await repl({ agent }, { set: (a) => (approve = flags.yes ? approve : a) });
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
  for (const f of ["model"]) if (typeof flags[f] === "string") args.push(`--${f}`, String(flags[f]));
  for (const f of ["yes", "plan", "worktree", "no-sandbox", "verify"]) if (flags[f]) args.push(`--${f}`);
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
  console.log(`sandbox     ${sb === "none" ? c.yellow("none — install bubblewrap (Linux) for sandboxed commands") : c.green(sb)}`);
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
