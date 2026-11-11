import type { Message, StopReason, ToolCall, ToolSpec, Usage } from "../core/types.ts";

export interface ChatRequest {
  model: string;
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  maxTokens?: number;
  /** Reasoning effort hint; providers that don't support it ignore it. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  signal?: AbortSignal;
}

export interface ChatCallbacks {
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
}

export interface ChatResponse {
  text: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stopReason: StopReason;
  /** Provider-native assistant content to replay on the next request. */
  raw?: { provider: string; content: unknown };
  /** Extra detail, e.g. a refusal category. */
  detail?: string;
}

export interface Provider {
  /** Provider id, e.g. "anthropic", "deepseek". */
  id: string;
  chat(req: ChatRequest, cb?: ChatCallbacks): Promise<ChatResponse>;
}

/** Parse tool-call JSON leniently: empty string means `{}`, invalid JSON means `undefined`. */
export function parseToolInput(raw: string): Record<string, unknown> | undefined {
  if (raw.trim() === "") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
