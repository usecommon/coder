import { ToolError, type Tool } from "./types.ts";

export const taskTool: Tool = {
  readOnly: true,
  spec: {
    name: "task",
    description:
      "Delegate a search of the codebase to a read-only helper agent (it can read, list, glob, grep and run read-only commands). " +
      "Worth it when a question takes many reads in a large project; call several in one turn to run them in parallel. " +
      "A helper knows only what it finds in the files: do not use one to recall facts or to think a problem through. Returns the helper's final answer.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "3-6 word label" },
        prompt: { type: "string", description: "Full instructions; the helper sees nothing else" },
      },
      required: ["description", "prompt"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    if (!ctx.runSubagent) throw new ToolError("sub-agents are not available here");
    return ctx.runSubagent(String(input.description), String(input.prompt));
  },
};
