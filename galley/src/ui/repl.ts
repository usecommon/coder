// Interactive terminal session.
import { createInterface } from "node:readline";
import type { Agent } from "../agent/loop.ts";
import { INIT_PROMPT } from "../agent/prompt.ts";
import { runSteps } from "../agent/steps.ts";
import type { Config, Effort } from "../config.ts";
import { getProvider, splitModel } from "../provider/index.ts";
import type { Approver } from "../safety/permission.ts";
import { Session } from "../session/store.ts";
import { modelsReport, switchNotes } from "./models.ts";
import { c, fmtTok, fmtUsd } from "./render.ts";

const HELP = `Commands:
  /plan          read-only mode (no edits; commands run with a read-only workspace)
  /build         normal mode
  /undo          revert files changed in the last turn
  /model <ref>   switch model, e.g. /model deepseek/deepseek-flash (says what the switch costs)
  /models        what is known about each model, and which roles suit the ones you can reach
  /effort <lvl>  reasoning effort: low, medium, high, xhigh or max
  /advisor <ref> a second model to consult when a turn goes badly; /advisor off removes it
  /steps <task>  plan the task, then do it in small steps (each one checked when the advisor reviews)
  /cost          tokens and cost for this session, per model
  /sessions      list sessions in this workspace
  /init          create or improve AGENTS.md
  /exit          quit (Ctrl-C cancels a running turn)`;

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Throws, with a message fit to show, unless `ref` names a provider Galley can build. */
function checkModel(ref: string, cfg: Config): void {
  getProvider(splitModel(ref).provider, cfg);
}

export async function repl(agentRef: { agent: Agent }, approverHolder: { set(a: Approver): void }, cfg: Config): Promise<void> {
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
        if (arg) {
          try {
            checkModel(arg, cfg);
          } catch (err) {
            console.log(c.red((err as Error).message));
            continue;
          }
          for (const l of switchNotes(cfg, a().model, arg, a().contextTokens)) console.log(c.dim(`  ${l}`));
          a().model = arg;
        }
        console.log(c.dim(`model: ${a().model}`));
      } else if (cmd === "models") console.log(modelsReport(cfg));
      else if (cmd === "effort") {
        if (arg && !EFFORTS.includes(arg as Effort)) console.log(c.red(`effort is one of: ${EFFORTS.join(", ")}`));
        else {
          if (arg) a().effort = arg as Effort;
          console.log(c.dim(`effort: ${a().effort ?? cfg.effort ?? "the model's default"}`));
          // Each effort level has a cache of its own (measured on DeepSeek), so the price is that of a model switch.
          if (arg && a().contextTokens > 0) console.log(c.dim("  The next request reads the session afresh, with nothing cached."));
        }
      } else if (cmd === "advisor") {
        if (arg === "off") cfg.advisor = undefined;
        else if (arg) {
          try {
            checkModel(arg, cfg);
          } catch (err) {
            console.log(c.red((err as Error).message));
            continue;
          }
          cfg.advisor = { ...cfg.advisor, model: arg };
          // The advisor is worth its price only if it is the stronger model.
          for (const l of switchNotes(cfg, a().model, arg, 0)) console.log(c.dim(`  ${l}`));
        }
        console.log(c.dim(`advisor: ${cfg.advisor?.model ?? "none"}`));
        if (arg) console.log(c.dim("  This applies to Galley's own consultations at once. Whether the model can call the advisor itself is fixed when a session starts."));
      } else if (cmd === "cost") {
        const s = a().session;
        const u = s.usage;
        console.log(c.dim(`${fmtTok(u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens)} in (${fmtTok(u.cacheReadTokens)} cached), ${fmtTok(u.outputTokens)} out — ${fmtUsd(s.costUsd)}`));
        const per = Object.entries(s.byModel());
        if (per.length > 1) for (const [m, v] of per) console.log(c.dim(`  ${m}: ${fmtTok(v.usage.inputTokens + v.usage.cacheReadTokens + v.usage.cacheWriteTokens)} in, ${fmtTok(v.usage.outputTokens)} out — ${fmtUsd(v.costUsd)}`));
      } else if (cmd === "sessions") {
        for (const s of Session.list(a().workspace).slice(0, 20)) console.log(`${s.id}  ${fmtUsd(s.costUsd).padStart(7)}  ${s.title ?? ""}`);
      } else if (cmd === "steps") {
        if (!arg) console.log(c.red("usage: /steps <task>"));
        else await turn(arg, true);
      } else if (cmd === "init") await turn(INIT_PROMPT);
      else console.log(c.red(`unknown command /${cmd}`) + "\n" + HELP);
      continue;
    }
    await turn(input);
  }
  if (!closed) rl.close();

  async function turn(text: string, steps = false) {
    running = new AbortController();
    try {
      if (steps) await runSteps(a(), text, running.signal);
      else await a().send(text, running.signal);
    } catch (err) {
      // A turn that cannot start (a model name no provider knows, say) must not end the session.
      console.log(c.red(`error: ${(err as Error).message}`));
    } finally {
      running = undefined;
    }
    process.stdout.write("\n");
  }
}
