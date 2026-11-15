// More than one model in a session: what is known about models, the signals that a turn is going badly,
// the advisor, the handover and the fallback.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { advisorRequest, changes, digest, reviewPassed } from "../src/agent/advisor.ts";
import { Agent } from "../src/agent/loop.ts";
import { LIMITS, Watch } from "../src/agent/signals.ts";
import { parsePlan, runSteps } from "../src/agent/steps.ts";
import { parseArgs } from "../src/args.ts";
import type { Config } from "../src/config.ts";
import type { AgentEvent, Message, ToolCall, ToolResult } from "../src/core/types.ts";
import { registerProvider } from "../src/provider/index.ts";
import { MockProvider, type MockReply } from "../src/provider/mock.ts";
import { gap, profiles, rereadCost, suggestRoles, weakerWarning } from "../src/provider/models.ts";
import { DEFAULT_PRICES } from "../src/provider/pricing.ts";
import type { ChatRequest, ChatResponse, Provider } from "../src/provider/types.ts";
import { Session } from "../src/session/store.ts";
import { modelsReport, reachable, switchNotes } from "../src/ui/models.ts";
import { tempDir, testConfig } from "./helpers.ts";

const FLASH = "deepseek/deepseek-flash";
const PRO = "deepseek/deepseek-v4-pro";
const OPUS = "anthropic/claude-opus-5-5";

describe("model profiles", () => {
  test("the dearer DeepSeek model is the weaker one, and the profiles say so", () => {
    const g = gap(FLASH, PRO);
    expect(g.known && g.points < 0 && g.clear).toBe(true);
    expect(weakerWarning(FLASH, PRO)).toContain("weaker model");
    expect(weakerWarning(FLASH, OPUS)).toBeUndefined();
  });

  test("two models the board cannot tell apart are not called stronger or weaker", () => {
    const g = gap("anthropic/claude-sonnet-5-5", OPUS);
    expect(g.known && g.points > 0 && !g.clear).toBe(true);
    expect(weakerWarning(OPUS, "anthropic/claude-sonnet-5-5")).toContain("not known to be stronger");
  });

  test("nothing is claimed about a model that is not profiled", () => {
    expect(gap(FLASH, "ollama/qwen3-coder")).toEqual({ known: false });
    expect(weakerWarning(FLASH, "ollama/qwen3-coder")).toBeUndefined();
  });

  test("a switch is priced at the new model's uncached input price", () => {
    expect(rereadCost(OPUS, 30_000, DEFAULT_PRICES)).toBeCloseTo(0.12, 6);
    expect(rereadCost(FLASH, 30_000, DEFAULT_PRICES)).toBeCloseTo(0.0045, 6);
    expect(rereadCost("ollama/qwen3-coder", 30_000, DEFAULT_PRICES)).toBeUndefined();
  });

  test("with DeepSeek alone there is no advisor to suggest, and the other model is to be avoided", () => {
    const s = suggestRoles([FLASH, PRO]);
    expect(s.main).toBe(FLASH);
    expect(s.advisor).toBeUndefined();
    expect(s.lines.join("\n")).toContain(`avoid        ${PRO}`);
  });

  test("with a second provider the cheap model works and the strong one advises", () => {
    const s = suggestRoles([FLASH, PRO, OPUS, "anthropic/claude-fable-5-2", "anthropic/claude-sonnet-5-5", "anthropic/claude-haiku-5-5"]);
    expect(s.main).toBe(FLASH);
    // Fable 5.2 scores the same as Opus 5.5 and costs 3.5 times as much per run.
    expect(s.advisor).toBe(OPUS);
  });

  test("the user's own entries are laid over the built-in ones", () => {
    const all = profiles({ "ollama/mine": { name: "Mine", agentic: { score: 50, ci: 3, harness: "galley", effort: "high", date: "2026-11-14" } } });
    expect(gap(FLASH, "ollama/mine", all)).toMatchObject({ known: true, clear: true });
    expect(all[FLASH]!.name).toBe("DeepSeek V4.1 Flash");
  });

  test("the report lists what is measured and suggests roles for the keys that are set", () => {
    const cfg = testConfig();
    expect(reachable(cfg, { DEEPSEEK_API_KEY: "x" })).toEqual([FLASH, "deepseek/deepseek-v4-flash", PRO]);
    const report = modelsReport(cfg, { DEEPSEEK_API_KEY: "x" });
    expect(report).toContain("38.5% ± 3.8");
    expect(report).toContain(`main model   ${FLASH}`);
    expect(report).toContain("advisor      none");
    const both = modelsReport(cfg, { DEEPSEEK_API_KEY: "x", ANTHROPIC_API_KEY: "y" });
    expect(both).toContain(`advisor      ${OPUS}`);
  });

  test("before a switch the user sees the price of it and whether the new model is weaker", () => {
    const notes = switchNotes(testConfig(), FLASH, PRO, 30_000).join("\n");
    expect(notes).toContain("about $0.02");
    expect(notes).toContain("weaker model");
    expect(switchNotes(testConfig(), FLASH, OPUS, 0).join("\n")).not.toContain("afresh");
  });
});

const call = (id: string, name: string, input: Record<string, unknown>): ToolCall => ({ id, name, input, rawInput: JSON.stringify(input) });
const bash = (id: string, command: string, exit: number | "none"): [ToolCall, ToolResult] => [call(id, "bash", { command }), { callId: id, name: "bash", content: `out ${id}\n[exit code ${exit}]` }];

describe("signals that a turn is going badly", () => {
  test("the same command failing three times in a row, with other work in between", () => {
    const w = new Watch(60);
    for (let i = 0; i < 2; i++) {
      const [c, r] = bash(`f${i}`, "npm  test", 1);
      expect(w.step(i * 2, [c], [r])).toBeUndefined();
      expect(w.step(i * 2 + 1, [call(`e${i}`, "edit", { path: "a.ts" })], [{ callId: `e${i}`, name: "edit", content: `edited ${i}` }])).toBeUndefined();
    }
    const [c, r] = bash("f2", "npm test", 1);
    expect(w.step(4, [c], [r])).toMatchObject({ kind: "same-check", detail: "the command `npm test` has failed 3 times in a row" });
  });

  test("a pass in between starts the count again, and a time-out counts as a failure", () => {
    const w = new Watch(60);
    const seq: (number | "none")[] = [1, 1, 0, 1, "none"];
    let fired = 0;
    seq.forEach((exit, i) => {
      const [c, r] = bash(`s${i}`, "make check", exit);
      if (w.step(i, [c], [r])) fired++;
    });
    expect(fired).toBe(0);
    const [c, r] = bash("s5", "make check", 2);
    expect(w.step(5, [c], [r])?.kind).toBe("same-check");
  });

  test("the same call with the same answer three times", () => {
    const w = new Watch(60);
    const c = call("r", "read", { path: "a.ts" });
    const r: ToolResult = { callId: "r", name: "read", content: "1\tconst a = 1" };
    expect(w.step(0, [c], [r])).toBeUndefined();
    expect(w.step(1, [c], [r])).toBeUndefined();
    expect(w.step(2, [c], [r])?.kind).toBe("same-call");
    // A different answer is news, not a loop.
    const w2 = new Watch(60);
    for (let i = 0; i < 5; i++) expect(w2.step(i, [c], [{ ...r, content: `version ${i}` }])).toBeUndefined();
  });

  test("four refused calls in a row, but not commands that ran and failed", () => {
    const w = new Watch(60);
    for (let i = 0; i < LIMITS.toolErrors - 1; i++)
      expect(w.step(i, [call(`x${i}`, "edit", { path: `f${i}` })], [{ callId: `x${i}`, name: "edit", content: `no match in f${i}`, isError: true }])).toBeUndefined();
    expect(w.step(3, [call("x3", "edit", { path: "f3" })], [{ callId: "x3", name: "edit", content: "no match in f3", isError: true }])?.kind).toBe("tool-errors");
    const w2 = new Watch(60);
    for (let i = 0; i < 6; i++) {
      const [c, r] = bash(`b${i}`, `cmd ${i}`, 1);
      expect(w2.step(i, [c], [r])).toBeUndefined();
    }
  });

  test("a long run is reported once, at two thirds of the step limit", () => {
    const w = new Watch(30);
    const fired: number[] = [];
    for (let i = 0; i < 30; i++) if (w.step(i, [call(`l${i}`, "read", { path: `f${i}` })], [{ callId: `l${i}`, name: "read", content: `c${i}` }])) fired.push(i);
    expect(fired).toEqual([19]);
  });

  test("each kind is reported once, until help was given", () => {
    const w = new Watch(60);
    const fail = (i: number) => {
      const [c, r] = bash(`k${i}`, "pytest", 1);
      return w.step(i, [c], [r]);
    };
    expect([0, 1, 2, 3, 4, 5].map(fail).filter(Boolean)).toHaveLength(1);
    w.rearm();
    expect([6, 7].map(fail).filter(Boolean)).toHaveLength(0);
    expect(fail(8)?.kind).toBe("same-check");
  });
});

describe("what the advisor reads", () => {
  const msgs: Message[] = [
    { role: "user", content: "Make add() handle negative numbers." },
    { role: "assistant", content: "Looking.", toolCalls: [call("1", "read", { path: "add.ts" })] },
    { role: "tool", results: [{ callId: "1", name: "read", content: "1\texport const add = (a, b) => a + b" }] },
    { role: "assistant", content: "", toolCalls: [call("2", "write", { path: "add.ts", content: "x".repeat(5000) })] },
    { role: "tool", results: [{ callId: "2", name: "write", content: "wrote add.ts", isError: true }] },
  ];

  test("the whole request, the calls and the results; code the agent wrote is kept long", () => {
    const d = digest(msgs);
    expect(d).toStartWith("USER: Make add() handle negative numbers.");
    expect(d).toContain('CALL read: {"path":"add.ts"}');
    expect(d).toContain("RESULT write (refused): wrote add.ts");
    expect(d).toContain("x".repeat(5000));
  });

  test("when the session is too long, the request and the latest steps are kept", () => {
    const d = digest(msgs, 300);
    expect(d).toStartWith("USER: Make add() handle negative numbers.");
    expect(d).toContain("earlier messages left out");
    expect(d).toEndWith("RESULT write (refused): wrote add.ts");
    expect(d).not.toContain("CALL read");
  });

  test("a review gets what changed: a diff of each file that existed, the whole of each new one", () => {
    const ws = tempDir();
    writeFileSync(join(ws, "new.txt"), "alpha\n");
    writeFileSync(join(ws, "old.txt"), "one\ntwo\nthree\n");
    writeFileSync(join(ws, "same.txt"), "kept\n");
    const files = changes(ws, [
      { path: join(ws, "new.txt"), before: null },
      { path: join(ws, "old.txt"), before: "one\n2\nthree\n" },
      { path: join(ws, "gone.txt"), before: "bye\n" },
      { path: join(ws, "same.txt"), before: "kept\n" },
      { path: join(ws, "never.txt"), before: null },
    ]);
    expect(files).toStartWith("--- new.txt (new file)\nalpha\n");
    expect(files).toContain("--- a/old.txt\n+++ b/old.txt\n");
    expect(files).toContain("-2\n+two\n");
    expect(files).toEndWith("--- gone.txt (deleted)");
    // A file changed back, and one created and removed again, are not changes.
    expect(files).not.toContain("same.txt");
    expect(files).not.toContain("never.txt");
    expect(advisorRequest(msgs, "Is it right?", files)).toContain("<files_changed>\n--- new.txt (new file)\nalpha");
  });

  test("a review of one step reads the request and that step, not the steps before it", () => {
    const d = digest(msgs, 80_000, 3);
    expect(d).toStartWith("USER: Make add() handle negative numbers.");
    expect(d).toContain("2 earlier messages left out");
    expect(d).not.toContain("CALL read");
    expect(d).toContain("CALL write");
    expect(advisorRequest(msgs, "Step 2 right?", undefined, 3)).not.toContain("CALL read");
  });

  test("a change too large to show is named, not dropped", () => {
    const ws = tempDir();
    writeFileSync(join(ws, "big.txt"), "x".repeat(500));
    expect(changes(ws, [{ path: join(ws, "big.txt"), before: null }], 100)).toBe("--- big.txt (changed; 523 characters not shown: over the size limit for a review)");
  });

  test("only a bare OK passes a review", () => {
    expect(reviewPassed(" OK.\n")).toBe(true);
    expect(reviewPassed("ok")).toBe(true);
    expect(reviewPassed("OK, but the error message is wrong")).toBe(false);
  });
});

/** A second provider, standing for a stronger model. Answers with the scripted replies and records what it was asked. */
function second(id: string, script: MockReply[] | ((req: ChatRequest, n: number) => MockReply)) {
  const p = new MockProvider(script);
  const wrapped: Provider & { requests: ChatRequest[] } = { id, requests: p.requests, chat: (req, cb) => p.chat(req, cb) };
  registerProvider(wrapped);
  return wrapped;
}

function setup(script: MockReply[] | ((req: ChatRequest, n: number) => MockReply), over: Partial<Config> = {}) {
  const ws = tempDir();
  const mock = new MockProvider(script);
  registerProvider(mock);
  const events: AgentEvent[] = [];
  const cfg = testConfig(over);
  const agent = new Agent({ cfg, workspace: ws, session: Session.create(ws, cfg.model), onEvent: (e) => events.push(e), approver: async () => "once", retryDelayMs: 1 });
  const notices = () => events.filter((e) => e.type === "notice").map((e) => (e as Extract<AgentEvent, { type: "notice" }>).text);
  return { ws, mock, events, agent, cfg, notices };
}

const lastUser = (req: ChatRequest) => (req.messages.at(-1) as Extract<Message, { role: "user" }>).content;
/** A model that keeps reading a file that is not there: the same call, the same refusal. */
const stuck: MockReply = { toolCalls: [{ name: "read", input: { path: "missing.txt" } }] };

describe("a second model in the session", () => {
  test("the advisor is asked when the turn goes badly, and its advice reaches the main model", async () => {
    const adv = second("adv1", [{ text: "The file is called present.txt, not missing.txt." }]);
    const { mock, agent, notices } = setup([stuck, stuck, stuck, { text: "Thanks, done." }], { advisor: { model: "adv1/strong" } });
    const r = await agent.send("read the file");
    expect(adv.requests).toHaveLength(1);
    const asked = adv.requests[0]!;
    expect(asked.tools).toEqual([]);
    expect(asked.system).toContain("advising another AI coding agent");
    expect(lastUser(asked)).toContain("USER: <environment>");
    expect(lastUser(asked)).toContain("the same read call has returned the same result 3 times");
    // The advice arrives after the tool results, as a message the main model reads next.
    expect(mock.requests).toHaveLength(4);
    expect(lastUser(mock.requests[3]!)).toContain("A second model (adv1/strong) read this session");
    expect(lastUser(mock.requests[3]!)).toContain("present.txt");
    expect(r.text).toBe("Thanks, done.");
    expect(notices().some((n) => n.startsWith("Asked adv1/strong"))).toBe(true);
    // Both models' use is on the session's books, and in the turn's totals.
    expect(Object.keys(agent.session.byModel()).sort()).toEqual(["adv1/strong", "mock/test"]);
    expect(r.usage.inputTokens).toBe(500);
  });

  test("without an advisor nothing is asked and nothing changes", async () => {
    const { mock, agent, notices } = setup([stuck, stuck, stuck, stuck, { text: "Giving up." }]);
    await agent.send("read the file");
    expect(mock.requests).toHaveLength(5);
    expect(mock.requests.every((r) => !r.tools.some((t) => t.name === "advise"))).toBe(true);
    expect(notices()).toEqual([]);
  });

  test("the advisor is asked at most maxUses times in a turn", async () => {
    const adv = second("adv2", () => ({ text: "Try something else." }));
    const { agent } = setup((_req, n) => (n < 20 ? stuck : { text: "Stopping." }), { advisor: { model: "adv2/strong", maxUses: 2 } });
    await agent.send("read the file");
    expect(adv.requests).toHaveLength(2);
  });

  test("a stronger model takes over a turn that goes badly, and the next turn starts on the session's model", async () => {
    const strong = second("up1", [{ text: "Found it: the file is present.txt." }]);
    const { mock, agent, notices } = setup([stuck, stuck, stuck, { text: "Second turn." }], { escalateModel: "up1/strong" });
    const r = await agent.send("read the file");
    expect(mock.requests).toHaveLength(3);
    expect(strong.requests).toHaveLength(1);
    expect(lastUser(strong.requests[0]!)).toContain("You are taking over this session from another model (mock/test)");
    expect(strong.requests[0]!.messages.filter((m) => m.role === "tool")).toHaveLength(3);
    expect(r.text).toBe("Found it: the file is present.txt.");
    expect(notices().some((n) => n.startsWith("Handing the rest of this turn to up1/strong"))).toBe(true);
    const r2 = await agent.send("and now?");
    expect(r2.text).toBe("Second turn.");
    expect(strong.requests).toHaveLength(1);
  });

  test("no handover to a model the profiles say is not stronger", async () => {
    const weak = second("up2", [{ text: "never asked" }]);
    const score = (n: number) => ({ name: "m", agentic: { score: n, ci: 3, harness: "x", effort: "high", date: "2026-11-14" } });
    const { mock, agent, notices } = setup([stuck, stuck, stuck, stuck, { text: "Still me." }], { escalateModel: "up2/weak", models: { "mock/test": score(40), "up2/weak": score(7) } });
    const r = await agent.send("read the file");
    expect(weak.requests).toHaveLength(0);
    expect(mock.requests).toHaveLength(5);
    expect(r.text).toBe("Still me.");
    expect(notices().filter((n) => n.startsWith("Not handing over to up2/weak"))).toHaveLength(1);
  });

  test("advice first; the handover comes only if the trouble returns", async () => {
    const adv = second("adv3", () => ({ text: "Look for present.txt." }));
    const strong = second("up3", [{ text: "Fixed." }]);
    const { mock, agent } = setup(() => stuck, { advisor: { model: "adv3/strong" }, escalateModel: "up3/strong" });
    const r = await agent.send("read the file");
    // Three identical calls bring the advice; three more after it bring the handover.
    expect(adv.requests).toHaveLength(1);
    expect(mock.requests).toHaveLength(6);
    expect(strong.requests).toHaveLength(1);
    expect(r.text).toBe("Fixed.");
  });

  test("the model can ask the advisor itself, within the same limit", async () => {
    const adv = second("adv4", [{ text: "Use the second reading: the tests expect a list." }]);
    const ask: MockReply = { toolCalls: [{ name: "advise", input: { question: "List or tuple?" } }] };
    const { mock, agent } = setup([ask, ask, { text: "Going with a list." }], { advisor: { model: "adv4/strong", maxUses: 1 } });
    await agent.send("implement it");
    expect(mock.requests[0]!.tools.at(-1)!.name).toBe("advise");
    expect(adv.requests).toHaveLength(1);
    expect(lastUser(adv.requests[0]!)).toContain("List or tuple?");
    const results = (i: number) => (mock.requests[i]!.messages.at(-1) as Extract<Message, { role: "tool" }>).results[0]!;
    expect(results(1)).toMatchObject({ name: "advise", content: "Use the second reading: the tests expect a list." });
    expect(results(2).isError).toBe(true);
    expect(results(2).content).toContain("asked 1 times this turn");
  });

  test("a dropped connection to the advisor is tried again", async () => {
    let calls = 0;
    registerProvider({
      id: "adv10",
      chat: async () => {
        if (calls++ === 0) throw new Error("ECONNRESET: The socket connection was closed unexpectedly");
        return { text: "Look for present.txt.", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "end_turn" };
      },
    });
    const { mock, agent } = setup([stuck, stuck, stuck, { text: "Done." }], { advisor: { model: "adv10/strong" } });
    await agent.send("read the file");
    expect(calls).toBe(2);
    expect(lastUser(mock.requests[3]!)).toContain("present.txt");
  });

  test("the tool can be withheld, leaving the decision to ask with the harness", async () => {
    const adv = second("adv9", [{ text: "Look for present.txt." }]);
    const { mock, agent } = setup([stuck, stuck, stuck, { text: "Done." }], { advisor: { model: "adv9/strong", tool: false } });
    await agent.send("read the file");
    expect(mock.requests.every((r) => !r.tools.some((t) => t.name === "advise"))).toBe(true);
    expect(adv.requests).toHaveLength(1);
  });

  test("an advisor that cannot be reached does not stop the turn", async () => {
    registerProvider({ id: "adv5", chat: async () => Promise.reject(Object.assign(new Error("HTTP 401 no key"), { status: 401 })) });
    const { mock, agent, notices } = setup([stuck, stuck, stuck, { text: "On my own, then." }], { advisor: { model: "adv5/strong" } });
    const r = await agent.send("read the file");
    expect(r.text).toBe("On my own, then.");
    expect(mock.requests).toHaveLength(4);
    expect(lastUser(mock.requests[0]!)).toContain("read the file");
    expect(mock.requests[3]!.messages.at(-1)!.role).toBe("tool");
    expect(notices().some((n) => n.startsWith("The advisor adv5/strong could not be reached"))).toBe(true);
  });

  test("with review on, the advisor checks a finished change and sends problems back once", async () => {
    const adv = second("adv6", [{ text: "The task asks for a trailing newline; hello.txt has none." }, { text: "OK" }]);
    const write = (content: string): MockReply => ({ toolCalls: [{ name: "write", input: { path: "hello.txt", content } }] });
    const { mock, agent } = setup([write("hi"), { text: "Done." }, write("hi\n"), { text: "Fixed the newline." }], { advisor: { model: "adv6/strong", review: true } });
    const r = await agent.send("write hello.txt ending in a newline");
    expect(adv.requests).toHaveLength(1);
    expect(lastUser(adv.requests[0]!)).toContain("<files_changed>\n--- hello.txt (new file)\nhi\n</files_changed>");
    expect(lastUser(mock.requests[2]!)).toContain("reviewed your change against the request and reported");
    expect(lastUser(mock.requests[2]!)).toContain("trailing newline");
    expect(r.text).toBe("Fixed the newline.");
  });

  test("a review that finds nothing ends the turn, and a turn that changed nothing is not reviewed", async () => {
    const adv = second("adv7", () => ({ text: "OK" }));
    const a = setup([{ toolCalls: [{ name: "write", input: { path: "a.txt", content: "x" } }] }, { text: "Done." }], { advisor: { model: "adv7/strong", review: true } });
    expect((await a.agent.send("write a.txt")).text).toBe("Done.");
    expect(a.mock.requests).toHaveLength(2);
    expect(adv.requests).toHaveLength(1);
    const b = setup([{ text: "It is a text file." }], { advisor: { model: "adv7/strong", review: true } });
    await b.agent.send("what is a.txt?");
    expect(adv.requests).toHaveLength(1);
  });

  test("helpers get neither the advisor nor its tool", async () => {
    const adv = second("adv8", () => ({ text: "advice" }));
    const helperTools: string[][] = [];
    const { agent } = setup(
      (req, n) => {
        if (req.system.includes("read-only helper")) {
          helperTools.push(req.tools.map((t) => t.name));
          return { text: "found nothing" };
        }
        return n === 0 ? { toolCalls: [{ name: "task", input: { description: "look around", prompt: "look for the file" } }] } : { text: "Done." };
      },
      { advisor: { model: "adv8/strong" } },
    );
    const r = await agent.send("find it");
    expect(r.text).toBe("Done.");
    expect(helperTools).toHaveLength(1);
    expect(helperTools[0]).not.toContain("advise");
    expect(adv.requests).toHaveLength(0);
  });
});

describe("other ways the model in use changes", () => {
  test("plan mode uses the plan model when one is set", async () => {
    const planner = second("plan1", [{ text: "Step 1: read. Step 2: edit." }]);
    const { mock, agent } = setup([{ text: "Built." }], { planModel: "plan1/thinker" });
    agent.mode = "plan";
    expect(agent.turnModel).toBe("plan1/thinker");
    expect((await agent.send("plan it")).text).toBe("Step 1: read. Step 2: edit.");
    agent.mode = "build";
    expect((await agent.send("build it")).text).toBe("Built.");
    expect(planner.requests).toHaveLength(1);
    expect(mock.requests).toHaveLength(1);
    // The builder reads the plan the other model wrote.
    expect(mock.requests[0]!.messages.some((m) => m.role === "assistant" && m.content.includes("Step 1"))).toBe(true);
  });

  test("when the provider keeps failing, a fallback serves the rest of the turn; the next turn tries the first model again", async () => {
    let calls = 0;
    const down: Provider = { id: "down", chat: async (): Promise<ChatResponse> => Promise.reject(Object.assign(new Error(`HTTP 503 overloaded (${++calls})`), { status: 503 })) };
    registerProvider(down);
    const { mock, agent, notices } = setup([{ toolCalls: [{ name: "list", input: { path: "." } }] }, { text: "Served by the fallback." }, { text: "Again." }], { model: "down/main", fallbackModels: ["mock/test"] });
    const r = await agent.send("hello");
    expect(r.text).toBe("Served by the fallback.");
    // Three tries on the first model, then the fallback for both steps of the turn.
    expect(calls).toBe(3);
    expect(mock.requests).toHaveLength(2);
    expect(notices().filter((n) => n.includes("using mock/test for the rest of this turn"))).toHaveLength(1);
    expect(Object.keys(agent.session.byModel())).toEqual(["mock/test"]);
    await agent.send("once more");
    expect(calls).toBe(6);
  });

  test("a refusal that another try would not change is not a reason to fall back", async () => {
    registerProvider({ id: "denied", chat: async () => Promise.reject(Object.assign(new Error("HTTP 401 invalid key"), { status: 401 })) });
    const { mock, agent } = setup([{ text: "never" }], { model: "denied/main", fallbackModels: ["mock/test"] });
    const r = await agent.send("hello");
    expect(r.stopReason).toBe("error");
    expect(mock.requests).toHaveLength(0);
  });

  test("the effort can be changed between turns", async () => {
    const { mock, agent } = setup([{ text: "a" }, { text: "b" }], { effort: "medium" });
    await agent.send("one");
    agent.effort = "max";
    await agent.send("two");
    expect(mock.requests.map((r) => r.effort)).toEqual(["medium", "max"]);
  });
});

describe("a task done in small steps", () => {
  test("a plan is its numbered lines, whatever stands around them", () => {
    expect(parsePlan("Here is the plan:\n\n1. Add the parser - check with the unit tests\n2) **Wire it into the CLI**\n   - detail that is not a step\n3. Update the README\n\nThat's all.")).toEqual([
      "Add the parser - check with the unit tests",
      "Wire it into the CLI",
      "Update the README",
    ]);
    expect(parsePlan("- **Step 1:** Do it\n- **Step 2:** Check it")).toEqual(["Do it", "Check it"]);
    // A second list replaces a first one; a number out of order is not a step.
    expect(parsePlan("1. draft a\n2. draft b\n\nRevised:\n1. final a\n3. stray\n2. final b")).toEqual(["final a", "final b"]);
    expect(parsePlan("I would just fix the typo in line 3.")).toEqual([]);
    expect(parsePlan(Array.from({ length: 12 }, (_, i) => `${i + 1}. s${i + 1}`).join("\n"))).toHaveLength(9);
  });

  const write = (path: string, content: string): MockReply => ({ toolCalls: [{ name: "write", input: { path, content } }] });

  test("the worker plans without changing anything, then does each step in a turn of its own", async () => {
    const { ws, mock, agent, notices } = setup([
      { toolCalls: [{ name: "write", input: { path: "early.txt", content: "no" } }] },
      { text: "1. Write a.txt\n2. Write b.txt" },
      write("a.txt", "A"),
      { text: "a.txt written." },
      write("b.txt", "B"),
      { text: "b.txt written." },
    ]);
    const r = await runSteps(agent, "write two files");
    expect(r.steps).toEqual(["Write a.txt", "Write b.txt"]);
    expect(r.done).toBe(2);
    expect(r.text).toBe("b.txt written.");
    // Planning is read-only: the write it tried was refused, and the mode is back to what it was.
    expect(existsSync(join(ws, "early.txt"))).toBe(false);
    expect(agent.mode).toBe("build");
    expect(mock.requests[0]!.system).toContain("PLAN mode");
    expect(mock.requests[2]!.system).not.toContain("PLAN mode");
    expect(lastUser(mock.requests[2]!)).toStartWith("Step 1 of 2: Write a.txt");
    expect(lastUser(mock.requests[4]!)).toStartWith("Step 2 of 2: Write b.txt");
    expect(readFileSync(join(ws, "a.txt"), "utf8") + readFileSync(join(ws, "b.txt"), "utf8")).toBe("AB");
    expect(notices()).toContain("Working in 2 steps.");
    // The whole run is on the books: six requests at 100 input tokens each.
    expect(r.usage.inputTokens).toBe(600);
    // Each step is a turn, so undo takes back one step at a time.
    agent.undo.undo();
    expect(existsSync(join(ws, "b.txt"))).toBe(false);
    expect(existsSync(join(ws, "a.txt"))).toBe(true);
  });

  test("the reviewer checks each step on its own, and its findings go back before the next step starts", async () => {
    const reviewer = second("rev1", [{ text: "The step says the file must end in a newline; a.txt does not." }, { text: "OK" }]);
    const { mock, agent } = setup(
      [{ text: "1. Write a.txt ending in a newline\n2. Write b.txt" }, write("a.txt", "A"), { text: "Step 1 done." }, write("a.txt", "A\n"), { text: "Fixed." }, write("b.txt", "B\n"), { text: "Step 2 done." }],
      { advisor: { model: "rev1/strong", review: true, tool: false } },
    );
    const r = await runSteps(agent, "write two files");
    expect(r.done).toBe(2);
    expect(reviewer.requests).toHaveLength(2);
    const [one, two] = reviewer.requests.map(lastUser) as [string, string];
    // Review of step 1: the plan, which step is meant, the task, that step's work and its change.
    expect(one).toContain("1. Write a.txt ending in a newline\n2. Write b.txt");
    expect(one).toContain("It has just finished step 1.");
    expect(one).toContain("write two files");
    expect(one).toContain("--- a.txt (new file)\nA\n</files_changed>");
    // Its finding reaches the worker inside step 1, before step 2 is started.
    expect(lastUser(mock.requests[3]!)).toContain("does not");
    expect(lastUser(mock.requests[5]!)).toStartWith("Step 2 of 2");
    // Review of step 2 reads step 2 only: step 1's work is left out, and so is its file.
    expect(two).toContain("It has just finished step 2.");
    expect(two).toContain("earlier messages left out");
    expect(two).not.toContain('"path":"a.txt"');
    expect(two).toContain("--- b.txt (new file)");
    expect(two).not.toContain("--- a.txt");
    // The worker was not given a tool to call the reviewer itself.
    expect(mock.requests.every((q) => !q.tools.some((t) => t.name === "advise"))).toBe(true);
  });

  test("a task the model does not split runs as one unit and is reviewed as a whole", async () => {
    const reviewer = second("rev2", () => ({ text: "OK" }));
    const { mock, agent, notices } = setup([{ text: "1. Fix the typo in a.txt and re-read it" }, write("a.txt", "fixed"), { text: "Done." }], { advisor: { model: "rev2/strong", review: true } });
    const r = await runSteps(agent, "fix the typo");
    expect(r.steps).toHaveLength(1);
    expect(r.done).toBe(1);
    expect(lastUser(mock.requests[1]!)).toStartWith("Go ahead");
    expect(reviewer.requests).toHaveLength(1);
    expect(lastUser(reviewer.requests[0]!)).toContain("The agent says it has finished.");
    expect(notices().some((n) => n.startsWith("Working in"))).toBe(false);
  });

  test("a step that does not finish stops the run there", async () => {
    registerProvider({
      id: "half",
      chat: (() => {
        let n = 0;
        return async (): Promise<ChatResponse> => {
          const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
          if (n++ === 0) return { text: "1. First\n2. Second\n3. Third", toolCalls: [], usage, stopReason: "end_turn" };
          if (n === 2) return { text: "First done.", toolCalls: [], usage, stopReason: "end_turn" };
          throw Object.assign(new Error("HTTP 400 bad request"), { status: 400 });
        };
      })(),
    });
    const ws = tempDir();
    const events: AgentEvent[] = [];
    const agent = new Agent({ cfg: testConfig({ model: "half/x" }), workspace: ws, session: Session.create(ws, "half/x"), onEvent: (e) => events.push(e), retryDelayMs: 1 });
    const r = await runSteps(agent, "three things");
    expect(r.done).toBe(1);
    expect(r.stopReason).toBe("error");
    expect(events.some((e) => e.type === "notice" && e.text === "Stopped in step 2 of 3: it did not finish.")).toBe(true);
  });

  test("the tool list is fixed when a session starts, whatever is configured later", async () => {
    const { mock, agent, cfg } = setup([{ text: "a" }, { text: "b" }]);
    await agent.send("one");
    cfg.advisor = { model: "rev1/strong" };
    await agent.send("two");
    expect(mock.requests[1]!.tools.map((t) => t.name)).toEqual(mock.requests[0]!.tools.map((t) => t.name));
  });

  test("--reviewer and --steps are read from the command line", () => {
    const { cmd, positional, flags } = parseArgs(["run", "do it", "-m", "deepseek/deepseek-flash", "--reviewer", "anthropic/claude-sonnet-5-5", "--steps"]);
    expect([cmd, positional]).toEqual(["run", ["do it"]]);
    expect(flags).toEqual({ model: "deepseek/deepseek-flash", reviewer: "anthropic/claude-sonnet-5-5", steps: true });
  });
});
