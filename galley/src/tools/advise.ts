import { ToolError, type Tool } from "./types.ts";

/** Offered only when an advisor model is configured. The harness also consults the advisor by itself when a turn
 *  goes badly, so this is for the cases only the model can know about. */
export const adviseTool: Tool = {
  readOnly: true,
  spec: {
    name: "advise",
    description:
      "Ask a second, stronger model for advice. It reads this whole session but cannot run anything, and it answers in a few sentences. " +
      "Worth it before committing to an approach on a hard problem, or when you cannot tell which of two readings of the request is meant. " +
      "It costs far more than an ordinary step: not for routine work, and not for anything a command or a file read would settle.",
    parameters: {
      type: "object",
      properties: { question: { type: "string", description: "What you need decided, with the options you see" } },
      required: ["question"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    if (!ctx.consult) throw new ToolError("no advisor model is configured");
    return ctx.consult(String(input.question));
  },
};
