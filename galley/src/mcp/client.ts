// Minimal MCP client over stdio (newline-delimited JSON-RPC): initialize, tools/list, tools/call.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerConfig } from "../config.ts";
import type { JSONSchema } from "../core/types.ts";
import { ToolError, truncate, type Tool } from "../tools/types.ts";

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JSONSchema;
}

export class McpClient {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private buf = "";

  constructor(
    readonly name: string,
    cfg: McpServerConfig,
    cwd: string,
  ) {
    this.child = spawn(cfg.command, cfg.args ?? [], { cwd, env: { ...process.env, ...cfg.env }, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.on("data", (b: Buffer) => this.onData(b.toString()));
    this.child.on("exit", () => {
      for (const p of this.pending.values()) p.reject(new Error(`MCP server ${name} exited`));
      this.pending.clear();
    });
    this.child.on("error", (err) => {
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
  }

  private onData(s: string) {
    this.buf += s;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const p = typeof msg.id === "number" ? this.pending.get(msg.id) : undefined;
      if (!p) continue;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? "MCP error"));
      else p.resolve(msg.result);
    }
  }

  private request(method: string, params?: unknown, timeoutMs = 60_000): Promise<any> {
    const id = this.nextId++;
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${this.name}: ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(t), resolve(v)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
    });
  }

  async start(): Promise<Tool[]> {
    await this.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "galley", version: "0.1.0" } }, 20_000);
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const { tools } = (await this.request("tools/list", {})) as { tools: McpTool[] };
    return tools.map((t) => this.wrap(t));
  }

  private wrap(t: McpTool): Tool {
    const exposed = `mcp_${this.name}_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    return {
      readOnly: false,
      spec: { name: exposed, description: t.description ?? `${t.name} (MCP server ${this.name})`, parameters: t.inputSchema ?? { type: "object", properties: {} } },
      run: async (input, ctx) => {
        const ok = await ctx.gate.check({ tool: exposed, subject: JSON.stringify(input).slice(0, 200) });
        if (!ok.ok) throw new ToolError(ok.why);
        const res = await this.request("tools/call", { name: t.name, arguments: input });
        const text = (res.content ?? [])
          .map((c: any) => (c.type === "text" ? c.text : `[${c.type} content]`))
          .join("\n");
        if (res.isError) throw new ToolError(text || "MCP tool failed");
        return truncate(text, ctx.cfg.maxToolOutput);
      },
    };
  }

  close(): void {
    this.child.kill();
  }
}
