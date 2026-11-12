// One adapter for every OpenAI-compatible chat-completions API (DeepSeek, Qwen, Kimi, GLM, OpenRouter, Ollama, vLLM, OpenAI).
import type { Message, StopReason, ToolCall } from "../core/types.ts";
import { emptyUsage } from "../core/types.ts";
import { parseToolInput, type ChatCallbacks, type ChatRequest, type ChatResponse, type Provider } from "./types.ts";

export interface OpenAICompatOptions {
  id: string;
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /** Send `stream_options.include_usage` (most providers support it). */
  includeUsage?: boolean;
  /** Replay `reasoning_content` from earlier assistant turns (some thinking-mode APIs require it during tool loops). */
  sendReasoning?: boolean;
  /** Value for the request's `reasoning_effort`, when the API takes one. */
  reasoningEffort?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function toOpenAIMessages(system: string, messages: Message[], sendReasoning = false): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content || null };
      if (m.toolCalls.length)
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.input ? JSON.stringify(c.input) : c.rawInput || "{}" },
        }));
      if (sendReasoning && m.reasoning) msg.reasoning_content = m.reasoning;
      out.push(msg);
    } else {
      for (const r of m.results) out.push({ role: "tool", tool_call_id: r.callId, content: r.content });
    }
  }
  return out;
}

/** Yield the JSON payload of each `data:` line in a server-sent-events body. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trimStart();
    }
  }
  if (buf.startsWith("data:")) yield buf.slice(5).trimStart();
}

const mapFinish = (r: string | null | undefined): StopReason =>
  r === "stop" ? "end_turn" : r === "tool_calls" || r === "function_call" ? "tool_use" : r === "length" ? "max_tokens" : r === "content_filter" ? "refusal" : "other";

export class OpenAICompatProvider implements Provider {
  readonly id: string;
  constructor(private opts: OpenAICompatOptions) {
    this.id = opts.id;
  }

  async chat(req: ChatRequest, cb: ChatCallbacks = {}): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.system, req.messages, this.opts.sendReasoning),
      stream: true,
    };
    if (this.opts.includeUsage !== false) body.stream_options = { include_usage: true };
    if (req.tools.length)
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (this.opts.reasoningEffort) body.reasoning_effort = this.opts.reasoningEffort;

    const res = await this.post(body, req.signal);
    let text = "";
    let reasoning = "";
    let finish: string | null | undefined;
    const usage = emptyUsage();
    const calls = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of sseData(res.body!)) {
      if (data === "[DONE]") break;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new ProviderError(`${this.id}: ${chunk.error.message ?? JSON.stringify(chunk.error)}`);
      if (chunk.usage) {
        const u = chunk.usage;
        const cached = u.prompt_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? 0;
        usage.inputTokens = Math.max(0, (u.prompt_tokens ?? 0) - cached);
        usage.cacheReadTokens = cached;
        usage.outputTokens = u.completion_tokens ?? 0;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const d = choice.delta ?? {};
      const r = d.reasoning_content ?? d.reasoning;
      if (typeof r === "string" && r) {
        reasoning += r;
        cb.onReasoning?.(r);
      }
      if (typeof d.content === "string" && d.content) {
        text += d.content;
        cb.onText?.(d.content);
      }
      for (const tc of d.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = calls.get(idx) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(idx, cur);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }

    const toolCalls: ToolCall[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([idx, c]) => ({ id: c.id || `call_${idx}`, name: c.name, rawInput: c.args, input: parseToolInput(c.args) }));
    let stopReason = mapFinish(finish);
    if (toolCalls.length && stopReason !== "max_tokens") stopReason = "tool_use";
    return { text, reasoning: reasoning || undefined, toolCalls, usage, stopReason };
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    const f = this.opts.fetch ?? fetch;
    const headers: Record<string, string> = { "content-type": "application/json", ...this.opts.headers };
    if (this.opts.apiKey) headers.authorization = `Bearer ${this.opts.apiKey}`;
    const url = this.opts.baseURL.replace(/\/$/, "") + "/chat/completions";
    const maxRetries = this.opts.maxRetries ?? 2;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await f(url, { method: "POST", headers, body: JSON.stringify(body), signal });
      } catch (err) {
        if (signal?.aborted || attempt >= maxRetries) throw new ProviderError(`${this.id}: ${(err as Error).message}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok && res.body) return res;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        await sleep(Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt);
        continue;
      }
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      throw new ProviderError(`${this.id}: HTTP ${res.status} ${detail}`, res.status);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
