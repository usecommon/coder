import type { ToolCall, ToolResult } from "../core/types.ts";
import { bashTool } from "./bash.ts";
import { editTool, globTool, grepTool, listTool, readTool, writeTool } from "./fs.ts";
import { taskTool } from "./task.ts";
import { ToolError, truncate, validateInput, type Tool, type ToolContext } from "./types.ts";

export const BUILTIN_TOOLS: Tool[] = [readTool, listTool, globTool, grepTool, editTool, writeTool, bashTool, taskTool];

/** Run one tool call. Every failure becomes an error result the model can read. */
export async function runTool(tools: Tool[], call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const tool = tools.find((t) => t.spec.name === call.name);
  const fail = (content: string): ToolResult => ({ callId: call.id, name: call.name, content, isError: true });
  if (!tool) return fail(`Unknown tool "${call.name}". Available: ${tools.map((t) => t.spec.name).join(", ")}`);
  if (!call.input) return fail(`Invalid JSON arguments: ${call.rawInput.slice(0, 500)}`);
  const invalid = validateInput(tool.spec.parameters, call.input);
  if (invalid) return fail(`Invalid arguments: ${invalid}`);
  try {
    const content = await tool.run(call.input, ctx);
    return { callId: call.id, name: call.name, content: truncate(content, ctx.cfg.maxToolOutput) };
  } catch (err) {
    if (err instanceof ToolError) return fail(err.message);
    return fail(`${call.name} failed: ${(err as Error).message}`);
  }
}
