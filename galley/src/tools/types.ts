import type { Config } from "../config.ts";
import type { JSONSchema, ToolSpec } from "../core/types.ts";
import type { PermissionGate } from "../safety/permission.ts";
import type { SandboxKind } from "../safety/sandbox.ts";
import type { UndoLog } from "./undo.ts";

export interface ToolContext {
  workspace: string;
  cwd: string;
  cfg: Config;
  gate: PermissionGate;
  sandbox: SandboxKind;
  undo: UndoLog;
  signal?: AbortSignal;
  /** Run a read-only sub-agent and return its final answer. */
  runSubagent?: (description: string, prompt: string) => Promise<string>;
}

export interface Tool {
  spec: ToolSpec;
  /** True when the tool never changes anything (safe in plan mode and for sub-agents). */
  readOnly: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

/** An error the model should see and can recover from. */
export class ToolError extends Error {}

/** Minimal JSON-schema check for tool inputs. Returns an error message, or undefined when valid. */
export function validateInput(schema: JSONSchema, input: unknown, path = "input"): string | undefined {
  const t = schema.type;
  if (t === "object") {
    if (!input || typeof input !== "object" || Array.isArray(input)) return `${path} must be an object`;
    const obj = input as Record<string, unknown>;
    for (const r of schema.required ?? []) if (obj[r] === undefined) return `${path}.${r} is required`;
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (!sub) {
        if (schema.additionalProperties === false) return `${path}.${k} is not a known parameter`;
        continue;
      }
      if (v === undefined || v === null) continue;
      const err = validateInput(sub, v, `${path}.${k}`);
      if (err) return err;
    }
    return undefined;
  }
  if (t === "string" && typeof input !== "string") return `${path} must be a string`;
  if ((t === "number" || t === "integer") && typeof input !== "number") return `${path} must be a number`;
  if (t === "integer" && !Number.isInteger(input)) return `${path} must be an integer`;
  if (t === "boolean" && typeof input !== "boolean") return `${path} must be a boolean`;
  if (t === "array") {
    if (!Array.isArray(input)) return `${path} must be an array`;
    if (schema.items) for (let i = 0; i < input.length; i++) {
      const err = validateInput(schema.items, input[i], `${path}[${i}]`);
      if (err) return err;
    }
  }
  if (schema.enum && !schema.enum.includes(input)) return `${path} must be one of ${schema.enum.join(", ")}`;
  return undefined;
}

/** Keep the head and tail of long output so the model sees both the start and the error at the end. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.4);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n[... ${text.length - max} characters omitted ...]\n\n${text.slice(-tail)}`;
}
