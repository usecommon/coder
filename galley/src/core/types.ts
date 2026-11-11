// Provider-neutral conversation model shared by the agent loop, providers and session store.

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments. `undefined` when the model's JSON could not be parsed. */
  input: Record<string, unknown> | undefined;
  /** Raw JSON text as streamed by the model (kept for error reporting). */
  rawInput: string;
}

export interface ToolResult {
  callId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls: ToolCall[];
      reasoning?: string;
      /** Provider-native content, replayed verbatim to the same provider (e.g. Anthropic thinking blocks). */
      raw?: { provider: string; content: unknown };
    }
  | { role: "tool"; results: ToolResult[] };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "error" | "other";

/** JSON Schema subset used for tool parameters. */
export interface JSONSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  additionalProperties?: boolean | JSONSchema;
  [key: string]: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/** Events emitted while an agent runs; consumed by the terminal UI, the HTTP server and the session log. */
export type AgentEvent =
  | { type: "text"; sessionId: string; agent: string; text: string }
  | { type: "reasoning"; sessionId: string; agent: string; text: string }
  | { type: "tool_start"; sessionId: string; agent: string; call: ToolCall }
  | { type: "tool_end"; sessionId: string; agent: string; result: ToolResult }
  | { type: "turn_end"; sessionId: string; agent: string; usage: Usage; costUsd: number; stopReason: StopReason }
  | { type: "compacted"; sessionId: string; agent: string; removedMessages: number }
  | { type: "notice"; sessionId: string; agent: string; level: "info" | "warn" | "error"; text: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An event before the agent stamps it with its session id and name. */
export type AgentEventInput = DistributiveOmit<AgentEvent, "sessionId" | "agent">;
