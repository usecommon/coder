import { afterAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpClient } from "../src/mcp/client.ts";
import { registerProvider } from "../src/provider/index.ts";
import { MockProvider } from "../src/provider/mock.ts";
import { PermissionGate } from "../src/safety/permission.ts";
import { serve } from "../src/server/http.ts";
import { UndoLog } from "../src/tools/undo.ts";
import { tempDir, testConfig } from "./helpers.ts";

test("server runs a turn and streams events and approvals over SSE", async () => {
  const ws = tempDir();
  registerProvider(
    new MockProvider([{ text: "Pushing.", toolCalls: [{ name: "bash", input: { command: "echo pushed" } }] }, { text: "Finished." }]),
  );
  const server = serve({ cfg: testConfig({ model: "mock/x", sandbox: "off" }), workspace: ws, port: 0, hostname: "127.0.0.1", password: "pw" });
  const base = `http://127.0.0.1:${server.port}`;
  const auth = { authorization: "Bearer pw", "content-type": "application/json" };
  try {
    expect((await fetch(`${base}/health`)).status).toBe(401);
    const { id } = await (await fetch(`${base}/sessions`, { method: "POST", headers: auth, body: "{}" })).json();

    const events: any[] = [];
    const es = await fetch(`${base}/events`, { headers: auth });
    const reader = es.body!.getReader();
    const pump = (async () => {
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value);
        for (const part of buf.split("\n\n").slice(0, -1)) {
          const e = JSON.parse(part.replace(/^data: /, ""));
          events.push(e);
          // Approve the command when the server asks.
          if (e.type === "approval_request") await fetch(`${base}/approvals/${e.id}`, { method: "POST", headers: auth, body: JSON.stringify({ answer: "once" }) });
        }
        buf = buf.split("\n\n").at(-1)!;
      }
    })().catch(() => {});

    const res = await (await fetch(`${base}/sessions/${id}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ text: "push it" }) })).json();
    expect(res.text).toBe("Finished.");
    for (let i = 0; i < 100 && !events.some((e) => e.type === "turn_end"); i++) await Bun.sleep(10);
    const types = events.map((e) => e.type);
    expect(types).toContain("approval_request");
    expect(types).toContain("tool_end");
    expect(events.find((e) => e.type === "approval_request").request).toMatchObject({ tool: "bash", subject: "echo pushed", reason: "runs without a sandbox" });
    const s = await (await fetch(`${base}/sessions/${id}`, { headers: auth })).json();
    expect(s.messages).toHaveLength(4);
    expect(events.find((e) => e.type === "tool_end").result.content).toContain("pushed");
    await reader.cancel().catch(() => {});
    await pump;
  } finally {
    server.stop(true);
  }
});

const stub = `
const rl = require("readline").createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "stub", version: "1" } } });
  else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }] } });
  else if (m.method === "tools/call") send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "echo: " + m.params.arguments.text }] } });
});`;

const clients: McpClient[] = [];
afterAll(() => clients.forEach((c) => c.close()));

test("MCP stdio tools are listed, namespaced and gated", async () => {
  const dir = tempDir();
  writeFileSync(join(dir, "stub.cjs"), stub);
  const client = new McpClient("demo", { command: process.execPath, args: [join(dir, "stub.cjs")] }, dir);
  clients.push(client);
  const tools = await client.start();
  expect(tools.map((t) => t.spec.name)).toEqual(["mcp_demo_echo"]);
  const cfg = testConfig();
  let asked = 0;
  const ctx = { workspace: dir, cwd: dir, cfg, gate: new PermissionGate(cfg.permission, async () => (asked++, "once" as const)), sandbox: "none" as const, undo: new UndoLog() };
  expect(await tools[0]!.run({ text: "hi" }, ctx)).toBe("echo: hi");
  expect(asked).toBe(1); // "mcp_*": "ask" by default
});
