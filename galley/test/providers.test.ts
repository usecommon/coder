import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "bun:test";
import type { Message } from "../src/core/types.ts";
import { AnthropicProvider, toAnthropicMessages } from "../src/provider/anthropic.ts";
import { OpenAICompatProvider, toOpenAIMessages } from "../src/provider/openai-compat.ts";
import { costUsd } from "../src/provider/pricing.ts";
import { sseFetch } from "./helpers.ts";

const history: Message[] = [
  { role: "user", content: "fix it" },
  { role: "assistant", content: "Looking.", toolCalls: [{ id: "c1", name: "read", input: { path: "a.ts" }, rawInput: '{"path":"a.ts"}' }] },
  { role: "tool", results: [{ callId: "c1", name: "read", content: "1\tx" }] },
];

describe("openai-compatible provider", () => {
  test("streams text, assembles tool calls and reads DeepSeek cache usage", async () => {
    const capture = { bodies: [] as any[] };
    const events = [
      { choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "think" } }] },
      { choices: [{ index: 0, delta: { content: "Let me " } }] },
      { choices: [{ index: 0, delta: { content: "check." } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read", arguments: "" } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"a.ts"}' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: "call_2", function: { name: "grep", arguments: '{"pattern":"x"}' } }] } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
      { choices: [], usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 800 } },
      "data: [DONE]\n\n",
    ];
    const p = new OpenAICompatProvider({ id: "deepseek", baseURL: "https://x", apiKey: "k", fetch: sseFetch(events, capture) });
    let streamed = "";
    let reasoned = "";
    const res = await p.chat(
      { model: "deepseek-v4-flash", system: "sys", messages: history, tools: [{ name: "read", description: "r", parameters: { type: "object" } }] },
      { onText: (t) => (streamed += t), onReasoning: (t) => (reasoned += t) },
    );
    expect(streamed).toBe("Let me check.");
    expect(reasoned).toBe("think");
    expect(res.stopReason).toBe("tool_use");
    expect(res.toolCalls.map((c) => [c.id, c.name, c.input])).toEqual([
      ["call_1", "read", { path: "a.ts" }],
      ["call_2", "grep", { pattern: "x" }],
    ]);
    expect(res.usage).toEqual({ inputTokens: 200, cacheReadTokens: 800, outputTokens: 50, cacheWriteTokens: 0 });
    const body = capture.bodies[0];
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.tools[0].function.name).toBe("read");
    expect(body.messages.map((m: any) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
  });

  test("reports invalid tool JSON as undefined input", async () => {
    const events = [
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "c", function: { name: "edit", arguments: '{"path": "a' } }] } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
      "data: [DONE]\n\n",
    ];
    const p = new OpenAICompatProvider({ id: "x", baseURL: "https://x", fetch: sseFetch(events) });
    const res = await p.chat({ model: "m", system: "", messages: [], tools: [] });
    expect(res.toolCalls[0]!.input).toBeUndefined();
    expect(res.toolCalls[0]!.rawInput).toBe('{"path": "a');
  });

  test("throws a readable error on HTTP failure", async () => {
    const f = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    const p = new OpenAICompatProvider({ id: "x", baseURL: "https://x", fetch: f, maxRetries: 0 });
    await expect(p.chat({ model: "m", system: "", messages: [], tools: [] })).rejects.toThrow("HTTP 401 bad key");
  });

  test("converts tool results to one message per call", () => {
    const out = toOpenAIMessages("s", history) as any[];
    expect(out[2].tool_calls[0]).toEqual({ id: "c1", type: "function", function: { name: "read", arguments: '{"path":"a.ts"}' } });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "1\tx" });
  });
});

describe("anthropic provider", () => {
  test("groups tool results into one user message and replays raw content", () => {
    const raw = [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: "hi" }] as const;
    const msgs: Message[] = [
      ...history,
      { role: "assistant", content: "hi", toolCalls: [], raw: { provider: "anthropic", content: raw } },
    ];
    const out = toAnthropicMessages(msgs);
    expect(out[1]!.content).toEqual([
      { type: "text", text: "Looking." },
      { type: "tool_use", id: "c1", name: "read", input: { path: "a.ts" } },
    ]);
    expect(out[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "1\tx", is_error: undefined }] });
    expect(out[3]!.content as unknown).toBe(raw);
  });

  test("streams through the official SDK and maps usage, tool calls and request options", async () => {
    const capture = { bodies: [] as any[] };
    const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    const stream = [
      ev("message_start", {
        message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 } },
      }),
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Reading the file." } }),
      ev("content_block_stop", { index: 0 }),
      ev("content_block_start", { index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "read", input: {} } }),
      ev("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"path":' } }),
      ev("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '"src/a.ts"}' } }),
      ev("content_block_stop", { index: 1 }),
      ev("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 30 } }),
      ev("message_stop", {}),
    ];
    const client = new Anthropic({ apiKey: "test", fetch: sseFetch(stream, capture), maxRetries: 0 });
    const p = new AnthropicProvider({ client });
    let text = "";
    const res = await p.chat(
      { model: "claude-opus-5-5", system: "sys", messages: [{ role: "user", content: "go" }], tools: [{ name: "read", description: "r", parameters: { type: "object", properties: { path: { type: "string" } } } }], effort: "high" },
      { onText: (t) => (text += t) },
    );
    expect(text).toBe("Reading the file.");
    expect(res.stopReason).toBe("tool_use");
    expect(res.toolCalls).toEqual([{ id: "toolu_1", name: "read", input: { path: "src/a.ts" }, rawInput: '{"path":"src/a.ts"}' }]);
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 30, cacheReadTokens: 900, cacheWriteTokens: 40 });
    expect(res.raw?.provider).toBe("anthropic");
    const body = capture.bodies[0];
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.output_config).toEqual({ effort: "high" });
    expect(body.fallbacks).toBe("default");
    expect(body.cache_control).toEqual({ type: "ephemeral" });
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools[0].eager_input_streaming).toBe(true);
  });
});

test("cost uses cache prices", () => {
  const usd = costUsd("anthropic/claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 });
  expect(usd).toBeCloseTo(4.2);
  expect(costUsd("unknown/model", { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(0);
});
