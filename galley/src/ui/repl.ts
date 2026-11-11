// Interactive terminal session.
import { createInterface } from "node:readline";
import type { Agent } from "../agent/loop.ts";
import { INIT_PROMPT } from "../agent/prompt.ts";
import type { Approver } from "../safety/permission.ts";
import { Session } from "../session/store.ts";
import { c, fmtTok, fmtUsd } from "./render.ts";

const HELP = `Commands:
  /plan          read-only mode (no edits; commands run with a read-only workspace)
  /build         normal mode
  /undo          revert files changed in the last turn
  /model <ref>   switch model, e.g. /model deepseek/deepseek-v4-flash
  /cost          tokens and cost for this session
  /sessions      list sessions in this workspace
  /init          create or improve AGENTS.md
  /exit          quit (Ctrl-C cancels a running turn)`;

export async function repl(agentRef: { agent: Agent }, approverHolder: { set(a: Approver): void }): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  // Queue lines so input typed (or piped) while the agent works is not lost.
  const queue: string[] = [];
  let waiter: ((line: string | null) => void) | undefined;
  let closed = false;
  const echo = (l: string) => {
    // Piped input isn't echoed by a terminal; show it so transcripts read naturally.
    if (!process.stdin.isTTY) process.stdout.write(l + "\n");
    return l;
  };
  rl.on("line", (l) => {
    if (waiter) {
      const w = waiter;
      waiter = undefined;
      w(echo(l));
    } else queue.push(l);
  });
  rl.on("close", () => {
    closed = true;
    waiter?.(null);
  });
  const ask = (prompt: string): Promise<string | null> => {
    if (closed) {
      if (!queue.length) return Promise.resolve(null);
      process.stdout.write(prompt);
      return Promise.resolve(echo(queue.shift()!));
    }
    rl.setPrompt(prompt);
    rl.prompt();
    if (queue.length) return Promise.resolve(echo(queue.shift()!));
    return new Promise((r) => (waiter = r));
  };

  approverHolder.set(async (req) => {
    const why = req.reason ? c.yellow(` (${req.reason})`) : "";
    const ans = ((await ask(`${c.yellow("?")} Allow ${c.bold(req.tool)} ${req.subject}${why}  [y]es / [a]lways / [n]o: `)) ?? "n").trim().toLowerCase();
    return ans === "a" || ans === "always" ? "always" : ans === "y" || ans === "yes" || ans === "" ? "once" : "deny";
  });

  let running: AbortController | undefined;
  let lastSigint = 0;
  rl.on("SIGINT", () => {
    if (running) {
      running.abort();
      process.stdout.write(c.yellow("\n(cancelled)\n"));
      return;
    }
    if (Date.now() - lastSigint < 1500) {
      rl.close();
      process.exit(0);
    }
    lastSigint = Date.now();
    process.stdout.write(c.dim("\n(press Ctrl-C again to exit)\n"));
  });

  const a = () => agentRef.agent;
  console.log(c.bold("galley") + c.dim(` · ${a().model} · ${a().mode} mode · sandbox: ${a().sandbox} · session ${a().session.id}`));
  console.log(c.dim("Type /help for commands.\n"));

  while (true) {
    const line = await ask(c.green(a().mode === "plan" ? "plan› " : "› "));
    if (line === null) break;
    const input = line.trim();
    if (!input) continue;
    if (input.startsWith("/")) {
      const [cmd, ...rest] = input.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      if (cmd === "exit" || cmd === "quit") break;
      else if (cmd === "help") console.log(HELP);
      else if (cmd === "plan" || cmd === "build") {
        a().mode = cmd;
        console.log(c.dim(`${cmd} mode`));
      } else if (cmd === "undo") {
        const files = a().undo.undo();
        console.log(files.length ? c.dim(`restored ${files.length} file(s):\n  ${files.join("\n  ")}`) : c.dim("nothing to undo"));
      } else if (cmd === "model") {
        if (arg) a().model = arg;
        console.log(c.dim(`model: ${a().model}`));
      } else if (cmd === "cost") {
        const s = a().session;
        const u = s.usage;
        console.log(c.dim(`${fmtTok(u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens)} in (${fmtTok(u.cacheReadTokens)} cached), ${fmtTok(u.outputTokens)} out — ${fmtUsd(s.costUsd)}`));
      } else if (cmd === "sessions") {
        for (const s of Session.list(a().workspace).slice(0, 20)) console.log(`${s.id}  ${fmtUsd(s.costUsd).padStart(7)}  ${s.title ?? ""}`);
      } else if (cmd === "init") await turn(INIT_PROMPT);
      else console.log(c.red(`unknown command /${cmd}`) + "\n" + HELP);
      continue;
    }
    await turn(input);
  }
  if (!closed) rl.close();

  async function turn(text: string) {
    running = new AbortController();
    try {
      await a().send(text, running.signal);
    } finally {
      running = undefined;
    }
    process.stdout.write("\n");
  }
}
