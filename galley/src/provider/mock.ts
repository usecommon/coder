// Scripted provider for tests and offline demos. Each call consumes the next scripted reply.
import { emptyUsage } from "../core/types.ts";
import type { ChatCallbacks, ChatRequest, ChatResponse, Provider } from "./types.ts";

export interface MockReply {
  text?: string;
  toolCalls?: { name: string; input: Record<string, unknown> }[];
}

export class MockProvider implements Provider {
  readonly id = "mock";
  readonly requests: ChatRequest[] = [];
  private n = 0;
  constructor(private script: MockReply[] | ((req: ChatRequest, n: number) => MockReply)) {}

  async chat(req: ChatRequest, cb: ChatCallbacks = {}): Promise<ChatResponse> {
    this.requests.push(structuredClone({ ...req, signal: undefined }));
    const i = this.n++;
    const reply = typeof this.script === "function" ? this.script(req, i) : (this.script[i] ?? { text: "Done." });
    if (reply.text) cb.onText?.(reply.text);
    const toolCalls = (reply.toolCalls ?? []).map((c, j) => ({ id: `mock_${i}_${j}`, name: c.name, input: c.input, rawInput: JSON.stringify(c.input) }));
    return {
      text: reply.text ?? "",
      toolCalls,
      usage: { ...emptyUsage(), inputTokens: 100, outputTokens: 20 },
      stopReason: toolCalls.length ? "tool_use" : "end_turn",
    };
  }
}
