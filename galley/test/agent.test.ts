import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "../src/agent/loop.ts";
import { compactionCut } from "../src/agent/compact.ts";
import type { AgentEvent, Message } from "../src/core/types.ts";
import { registerProvider } from "../src/provider/index.ts";
import { MockProvider } from "../src/provider/mock.ts";
import type { ChatCallbacks, ChatRequest, ChatResponse, Provider } from "../src/provider/types.ts";
import { Session } from "../src/session/store.ts";
import { tempDir, testConfig } from "./helpers.ts";

function setup(script: ConstructorParameters<typeof MockProvider>[0], over = {}) {
  const ws = tempDir();
  const mock = new MockProvider(script);
  registerProvider(mock);
  const events: AgentEvent[] = [];
  const cfg = testConfig(over);
  const agent = new Agent({ cfg, workspace: ws, session: Session.create(ws, cfg.model), onEvent: (e) => events.push(e), approver: async () => "once" });
  return { ws, mock, events, agent };
}

describe("agent loop", () => {
  test("runs tools until the model stops, and persists the session", async () => {
    const { ws, mock, agent, events } = setup(
      [
      { text: "Creating it.", toolCalls: [{ name: "write", input: { path: "hello.txt", content: "hi" } }] },
      { toolCalls: [{ name: "read", input: { path: "hello.txt" } }] },
      { text: "Done: wrote hello.txt." },
      ],
      { review: true },
    );
    const r = await agent.send("make hello.txt");
    // Files changed, so the agent asked the model to review once before finishing.
    expect(mock.requests).toHaveLength(4);
    expect((mock.requests[3]!.messages.at(-1) as Extract<Message, { role: "user" }>).content).toContain("check your work");
    expect(r.text).toBe("Done.");
    expect(readFileSync(join(ws, "hello.txt"), "utf8")).toBe("hi");
    const last = mock.requests[2]!.messages;
    expect(last.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant", "tool"]);
    expect((last[4] as Extract<Message, { role: "tool" }>).results[0]!.content).toContain("1\thi");
    expect(events.filter((e) => e.type === "tool_start")).toHaveLength(2);
    expect(events.at(-1)!.type).toBe("turn_end");

    const reloaded = Session.load(ws, agent.session.id);
    expect(reloaded.messages).toHaveLength(8);
    expect(reloaded.title).toBe("make hello.txt");
    expect(reloaded.usage.inputTokens).toBe(400);
  });

  test("undo reverts the last turn's file changes", async () => {
    const { ws, agent } = setup([{ toolCalls: [{ name: "write", input: { path: "f.txt", content: "new" } }] }, { text: "ok" }]);
    writeFileSync(join(ws, "f.txt"), "old");
    await agent.send("change f");
    expect(readFileSync(join(ws, "f.txt"), "utf8")).toBe("new");
    agent.undo.undo();
    expect(readFileSync(join(ws, "f.txt"), "utf8")).toBe("old");
  });

  test("plan mode refuses edits and tells the model why", async () => {
    const { ws, mock, agent } = setup([{ toolCalls: [{ name: "write", input: { path: "x.txt", content: "x" } }] }, { text: "Here is the plan." }]);
    agent.mode = "plan";
    await agent.send("plan it");
    expect(existsSync(join(ws, "x.txt"))).toBe(false);
    const tool = mock.requests[1]!.messages[2] as Extract<Message, { role: "tool" }>;
    expect(tool.results[0]!.isError).toBe(true);
    expect(mock.requests[1]!.system).toContain("PLAN mode");
  });

  test("sub-agents run in parallel, read-only, in their own sessions", async () => {
    let active = 0;
    let peak = 0;
    const slow: Provider = {
      id: "slow",
      async chat(req: ChatRequest, _cb?: ChatCallbacks): Promise<ChatResponse> {
        const isHelper = req.messages[0]?.role === "user" && (req.messages[0] as any).content.startsWith("look");
        if (isHelper) {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 50));
          active--;
          // Helpers only get read-only tools plus bash.
          expect(req.tools.map((t) => t.name).sort()).toEqual(["bash", "glob", "grep", "list", "read"]);
          return { text: `found in ${(req.messages[0] as any).content}`, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" };
        }
        const done = req.messages.some((m) => m.role === "tool");
        return done
          ? { text: "Both helpers reported.", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" }
          : {
              text: "",
              toolCalls: ["a", "b"].map((x, i) => ({ id: `t${i}`, name: "task", input: { description: `find ${x}`, prompt: `look ${x}` }, rawInput: "{}" })),
              usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
              stopReason: "tool_use",
            };
      },
    };
    registerProvider(slow);
    const ws = tempDir();
    const agent = new Agent({ cfg: testConfig({ model: "slow/x" }), workspace: ws, session: Session.create(ws, "slow/x") });
    const r = await agent.send("investigate");
    expect(r.text).toBe("Both helpers reported.");
    expect(peak).toBe(2);
    const sessions = Session.list(ws);
    expect(sessions.filter((s) => s.title?.startsWith("task:"))).toHaveLength(2);
    expect(agent.session.usage.inputTokens).toBe(40); // 2 parent calls + 2 helpers rolled up
  });

  test("tool calls cut off by max_tokens are not executed", async () => {
    const cut: Provider = {
      id: "cut",
      async chat(req) {
        const first = !req.messages.some((m) => m.role === "tool");
        return first
          ? { text: "", toolCalls: [{ id: "1", name: "write", input: { path: "half.txt", content: "trunc" }, rawInput: "" }], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "max_tokens" }
          : { text: "retrying smaller", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" };
      },
    };
    registerProvider(cut);
    const ws = tempDir();
    const agent = new Agent({ cfg: testConfig({ model: "cut/x" }), workspace: ws, session: Session.create(ws, "cut/x") });
    await agent.send("write");
    expect(existsSync(join(ws, "half.txt"))).toBe(false);
  });

  test("compacts long conversations into a summary", async () => {
    let n = 0;
    const big: Provider = {
      id: "big",
      async chat(req) {
        if (req.system.startsWith("You compress")) return { text: "SUMMARY: did stuff", toolCalls: [], usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" };
        n++;
        return { text: `answer ${n}`, toolCalls: [], usage: { inputTokens: 500, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" };
      },
    };
    registerProvider(big);
    const ws = tempDir();
    const events: AgentEvent[] = [];
    const agent = new Agent({ cfg: testConfig({ model: "big/x", compactAt: 400 }), workspace: ws, session: Session.create(ws, "big/x"), onEvent: (e) => events.push(e) });
    for (let i = 0; i < 5; i++) await agent.send(`question ${i}`);
    expect(events.some((e) => e.type === "compacted")).toBe(true);
    const first = agent.session.messages[0] as Extract<Message, { role: "user" }>;
    expect(first.content).toContain("SUMMARY: did stuff");
    // Reloading replays the compaction record to the same state.
    expect(Session.load(ws, agent.session.id).messages).toEqual(agent.session.messages);
  });

  test("an independent verifier can send the agent back to fix problems", async () => {
    const seen: string[] = [];
    const v: Provider = {
      id: "verif",
      async chat(req) {
        const first = (req.messages[0] as any).content as string;
        const u = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
        if (first.startsWith("You are independently verifying")) {
          seen.push("verifier");
          expect(req.tools.map((t) => t.name)).not.toContain("write");
          return { text: "add(2,3) returned -1, expected 5.\nVERDICT: FAIL", toolCalls: [], usage: u, stopReason: "end_turn" };
        }
        const last = req.messages.at(-1)!;
        if (last.role === "user" && (last as any).content.includes("independent reviewer")) {
          seen.push("fix");
          return { text: "", toolCalls: [{ id: "f", name: "write", input: { path: "m.js", content: "a+b" }, rawInput: "{}" }], usage: u, stopReason: "tool_use" };
        }
        if (last.role === "tool") return { text: "Done.", toolCalls: [], usage: u, stopReason: "end_turn" };
        seen.push("implement");
        return { text: "", toolCalls: [{ id: "w", name: "write", input: { path: "m.js", content: "a-b" }, rawInput: "{}" }], usage: u, stopReason: "tool_use" };
      },
    };
    registerProvider(v);
    const ws = tempDir();
    const agent = new Agent({ cfg: testConfig({ model: "verif/x", verify: true }), workspace: ws, session: Session.create(ws, "verif/x") });
    await agent.send("implement add");
    expect(seen).toEqual(["implement", "verifier", "fix"]);
    expect(readFileSync(join(ws, "m.js"), "utf8")).toBe("a+b");
  });

  test("a passing verification ends the turn", async () => {
    let verifierCalls = 0;
    registerProvider({
      id: "vpass",
      async chat(req) {
        const u = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
        if ((req.messages[0] as any).content.startsWith("You are independently verifying")) {
          verifierCalls++;
          return { text: "All good.\nVERDICT: PASS", toolCalls: [], usage: u, stopReason: "end_turn" };
        }
        if (req.messages.at(-1)!.role === "tool") return { text: "Done.", toolCalls: [], usage: u, stopReason: "end_turn" };
        return { text: "", toolCalls: [{ id: "w", name: "write", input: { path: "a.txt", content: "x" }, rawInput: "{}" }], usage: u, stopReason: "tool_use" };
      },
    });
    const ws = tempDir();
    const agent = new Agent({ cfg: testConfig({ model: "vpass/x", verify: true }), workspace: ws, session: Session.create(ws, "vpass/x") });
    const r = await agent.send("write a");
    expect(verifierCalls).toBe(1);
    expect(r.text).toBe("Done.");
  });

  test("transient provider errors are retried", async () => {
    let calls = 0;
    registerProvider({
      id: "flaky",
      chat: async () => {
        if (calls++ === 0) throw Object.assign(new Error("socket closed"), { status: undefined });
        return { text: "recovered", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" };
      },
    });
    const ws = tempDir();
    const agent = new Agent({ cfg: testConfig({ model: "flaky/x" }), workspace: ws, session: Session.create(ws, "flaky/x") });
    const r = await agent.send("hi");
    expect(r.text).toBe("recovered");
    expect(calls).toBe(2);
  });

  test("no review when nothing changed, and review can be turned off", async () => {
    const { mock, agent } = setup([{ text: "Just answering." }], { review: true });
    await agent.send("what is this?");
    expect(mock.requests).toHaveLength(1);
    const off = setup([{ toolCalls: [{ name: "write", input: { path: "a.txt", content: "x" } }] }, { text: "done" }], { review: false });
    await off.agent.send("write");
    expect(off.mock.requests).toHaveLength(2);
  });

  test("provider errors end the turn with a notice", async () => {
    registerProvider({ id: "boom", chat: async () => Promise.reject(Object.assign(new Error("HTTP 401 invalid key"), { status: 401 })) });
    const ws = tempDir();
    const events: AgentEvent[] = [];
    const agent = new Agent({ cfg: testConfig({ model: "boom/x" }), workspace: ws, session: Session.create(ws, "boom/x"), onEvent: (e) => events.push(e) });
    const r = await agent.send("hi");
    expect(r.stopReason).toBe("error");
    expect(events.find((e) => e.type === "notice")).toMatchObject({ level: "error", text: "HTTP 401 invalid key" });
  });
});

test("compaction never splits a tool call from its result", () => {
  const msgs: Message[] = [
    { role: "user", content: "a" },
    { role: "assistant", content: "", toolCalls: [{ id: "1", name: "read", input: {}, rawInput: "{}" }] },
    { role: "tool", results: [{ callId: "1", name: "read", content: "x" }] },
    { role: "assistant", content: "", toolCalls: [{ id: "2", name: "read", input: {}, rawInput: "{}" }] },
    { role: "tool", results: [{ callId: "2", name: "read", content: "x" }] },
    { role: "assistant", content: "done", toolCalls: [] },
    { role: "user", content: "b" },
    { role: "assistant", content: "ok", toolCalls: [] },
  ];
  const cut = compactionCut(msgs, 4);
  expect(msgs[cut]!.role).not.toBe("tool");
  expect(compactionCut(msgs.slice(0, 3), 6)).toBe(-1);
});

test("forked sessions copy history and link to the parent", () => {
  const ws = tempDir();
  const s = Session.create(ws, "mock/x");
  s.addMessage({ role: "user", content: "one" });
  s.addMessage({ role: "assistant", content: "two", toolCalls: [] });
  const f = s.fork(1);
  expect(f.messages).toEqual([{ role: "user", content: "one" }]);
  expect(Session.load(ws, f.id).meta.parentId).toBe(s.id);
});
