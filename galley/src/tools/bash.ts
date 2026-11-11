import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../safety/sandbox.ts";
import { projectDir } from "../session/store.ts";
import { ToolError, truncate, type Tool } from "./types.ts";

export const bashTool: Tool = {
  readOnly: false,
  spec: {
    name: "bash",
    description:
      "Run a shell command in the workspace. Runs in a sandbox: the workspace is writable, .git is read-only and the network is off. " +
      "Set network=true only when the command truly needs the internet (it will ask for approval).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout: { type: "integer", description: "Seconds (default 120, max 600)" },
        network: { type: "boolean", description: "Request network access" },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const command = String(input.command);
    const network = input.network === true;
    const plan = ctx.gate.mode === "plan";
    const sandboxed = ctx.sandbox !== "none" && ctx.cfg.sandbox !== "off";
    // Without a sandbox nothing limits the command, so it always needs approval; in plan mode it can't be made read-only.
    if (plan && !sandboxed) throw new ToolError("bash is unavailable in plan mode without an OS sandbox");
    const reason = !sandboxed ? "runs without a sandbox" : network ? "requests network access" : undefined;
    const floor = !sandboxed ? "ask" : network ? ctx.cfg.network : "allow";
    const r = await ctx.gate.check({ tool: "bash", subject: command, reason }, floor);
    if (!r.ok) throw new ToolError(r.why);
    const timeoutMs = Math.min(Number(input.timeout ?? 120), 600) * 1000;
    const cacheDir = join(projectDir(ctx.workspace), "cache");
    const tmpDir = join(projectDir(ctx.workspace), "tmp");
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
    const res = await exec(command, {
      cwd: ctx.cwd,
      workspace: ctx.workspace,
      readOnly: plan,
      network,
      timeoutMs,
      signal: ctx.signal,
      kind: sandboxed ? ctx.sandbox : "none",
      cacheDir,
      tmpDir,
    });
    let out = truncate(res.output.trimEnd(), ctx.cfg.maxToolOutput);
    if (res.timedOut) out += `\n[timed out after ${timeoutMs / 1000}s]`;
    out += `\n[exit code ${res.exitCode ?? "none"}]`;
    return out.trimStart();
  },
};
