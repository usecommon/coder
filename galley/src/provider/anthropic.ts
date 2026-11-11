// Anthropic provider, built on the official SDK: streaming, adaptive thinking, effort,
// prompt caching, server-side refusal fallbacks, eager tool-input streaming.
import Anthropic from "@anthropic-ai/sdk";
import type { Message, StopReason, ToolCall } from "../core/types.ts";
import { emptyUsage } from "../core/types.ts";
import { ProviderError } from "./openai-compat.ts";
import type { ChatCallbacks, ChatRequest, ChatResponse, Provider } from "./types.ts";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

// Models with adaptive thinking + output_config.effort.
const ADAPTIVE = /^claude-(opus-(4-[678]|5)|sonnet-(4-6|5)|fable|mythos|haiku-5)/;
// Models that accept the server-side `fallbacks` parameter.
const FALLBACKS = /^claude-(opus-5|fable-5-[12]|mythos-5-[12]|sonnet-5-5)/;

export interface AnthropicOptions {
  apiKey?: string;
  baseURL?: string;
  /** Use server-side refusal fallbacks where the model supports them (default true). */
  fallbacks?: boolean;
  client?: Anthropic;
}

export function toAnthropicMessages(messages: Message[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      if (m.raw?.provider === "anthropic") {
        // Replay unchanged: thinking blocks must come back exactly as produced.
        out.push({ role: "assistant", content: m.raw.content as ContentBlockParam[] });
        continue;
      }
      const blocks: ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input ?? {} });
      if (!blocks.length) blocks.push({ type: "text", text: "(no output)" });
      out.push({ role: "assistant", content: blocks });
    } else {
      // All results of one turn go back in a single user message.
      out.push({
        role: "user",
        content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.callId, content: r.content, is_error: r.isError || undefined })),
      });
    }
  }
  return out;
}

export class AnthropicProvider implements Provider {
  readonly id = "anthropic";
  private client: Anthropic;
  constructor(private opts: AnthropicOptions = {}) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  }

  async chat(req: ChatRequest, cb: ChatCallbacks = {}): Promise<ChatResponse> {
    const adaptive = ADAPTIVE.test(req.model);
    const useFallbacks = this.opts.fallbacks !== false && FALLBACKS.test(req.model);
    const params: Anthropic.Beta.MessageCreateParamsStreaming = {
      model: req.model,
      max_tokens: req.maxTokens ?? 64000,
      stream: true,
      // Stable system prompt first, cached; top-level cache_control caches the growing conversation too.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      cache_control: { type: "ephemeral" },
      messages: toAnthropicMessages(req.messages),
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
        eager_input_streaming: true,
      })),
    };
    if (adaptive) {
      params.thinking = { type: "adaptive", display: "summarized" };
      params.output_config = { effort: req.effort ?? "high" };
    }
    if (useFallbacks) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }

    let message: Anthropic.Beta.BetaMessage | undefined;
    for (let attempt = 0; !message; attempt++) {
      const stream = this.client.beta.messages.stream(params, { signal: req.signal });
      try {
        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") cb.onText?.(event.delta.text);
          else if (event.delta.type === "thinking_delta") cb.onReasoning?.(event.delta.thinking);
        }
        message = await stream.finalMessage();
      } catch (err) {
        if (err instanceof Anthropic.APIError) throw new ProviderError(`anthropic: ${err.message}`, err.status);
        if (req.signal?.aborted) throw err;
        // With eager input streaming, unparseable tool JSON rejects the stream: re-issue the turn (max 2).
        if (attempt >= 2) throw new ProviderError(`anthropic: ${(err as Error).message}`);
      }
    }

    let text = "";
    let reasoning = "";
    const toolCalls: ToolCall[] = [];
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "thinking") reasoning += block.thinking;
      else if (block.type === "tool_use") {
        const input = block.input && typeof block.input === "object" ? (block.input as Record<string, unknown>) : undefined;
        toolCalls.push({ id: block.id, name: block.name, input, rawInput: JSON.stringify(block.input ?? {}) });
      }
    }
    const u = message.usage;
    const usage = {
      ...emptyUsage(),
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
    const sr = message.stop_reason;
    const stopReason: StopReason =
      sr === "end_turn" || sr === "tool_use" || sr === "max_tokens" || sr === "refusal" ? sr : sr === "stop_sequence" ? "end_turn" : "other";
    const detail = sr === "refusal" && message.stop_details ? `refusal (${message.stop_details.category ?? "unspecified"})` : undefined;
    return {
      text,
      reasoning: reasoning || undefined,
      toolCalls,
      usage,
      stopReason,
      detail,
      raw: { provider: "anthropic", content: message.content },
    };
  }
}
