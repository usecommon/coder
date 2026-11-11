import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PermissionGate } from "../src/safety/permission.ts";
import { detectSandbox } from "../src/safety/sandbox.ts";
import { BUILTIN_TOOLS, runTool } from "../src/tools/index.ts";
import { locate } from "../src/tools/fs.ts";
import { truncate, validateInput, type ToolContext } from "../src/tools/types.ts";
import { UndoLog } from "../src/tools/undo.ts";
import { tempDir, testConfig } from "./helpers.ts";

function ctx(ws: string, mode: "build" | "plan" = "build"): ToolContext {
  const cfg = testConfig();
  return { workspace: ws, cwd: ws, cfg, gate: new PermissionGate(cfg.permission, async () => "once", mode), sandbox: detectSandbox(), undo: new UndoLog() };
}
const call = (name: string, input: Record<string, unknown>) => ({ id: "1", name, input, rawInput: JSON.stringify(input) });

describe("file tools", () => {
  const ws = tempDir();
  writeFileSync(join(ws, "a.ts"), "export const x = 1;  \nexport const y = 2;\n");

  test("read numbers lines and paginates", async () => {
    const r = await runTool(BUILTIN_TOOLS, call("read", { path: "a.ts", limit: 1 }), ctx(ws));
    expect(r.isError).toBeUndefined();
    expect(r.content).toContain("     1\texport const x = 1;");
    expect(r.content).toContain("continue with offset=2");
  });

  test("edit requires a unique match and tolerates trailing whitespace", async () => {
    const c = ctx(ws);
    const bad = await runTool(BUILTIN_TOOLS, call("edit", { path: "a.ts", old_string: "export const", new_string: "const" }), c);
    expect(bad.isError).toBe(true);
    expect(bad.content).toContain("matches 2 places");
    const ok = await runTool(BUILTIN_TOOLS, call("edit", { path: "a.ts", old_string: "export const x = 1;\nexport const y", new_string: "export const x = 10;\nexport const y" }), c);
    expect(ok.isError).toBeUndefined();
    expect(readFileSync(join(ws, "a.ts"), "utf8")).toBe("export const x = 10;\nexport const y = 2;\n");
    expect(c.undo.undo()).toEqual([join(ws, "a.ts")]);
    expect(readFileSync(join(ws, "a.ts"), "utf8")).toContain("x = 1;  ");
  });

  test("write creates files and undo deletes them", async () => {
    const c = ctx(ws);
    c.undo.beginTurn();
    await runTool(BUILTIN_TOOLS, call("write", { path: "dir/new.txt", content: "hello" }), c);
    expect(readFileSync(join(ws, "dir/new.txt"), "utf8")).toBe("hello");
    c.undo.undo();
    expect(existsSync(join(ws, "dir/new.txt"))).toBe(false);
  });

  test("glob and grep", async () => {
    const g = await runTool(BUILTIN_TOOLS, call("glob", { pattern: "**/*.ts" }), ctx(ws));
    expect(g.content).toBe("a.ts");
    const r = await runTool(BUILTIN_TOOLS, call("grep", { pattern: "const y", include: "*.ts" }), ctx(ws));
    expect(r.content).toBe("a.ts:2:export const y = 2;");
  });

  test("validation and confinement errors come back as tool errors", async () => {
    expect((await runTool(BUILTIN_TOOLS, call("read", {}), ctx(ws))).content).toContain("input.path is required");
    expect((await runTool(BUILTIN_TOOLS, call("read", { path: "../../etc/passwd" }), ctx(ws))).content).toContain("outside the workspace");
    expect((await runTool(BUILTIN_TOOLS, call("nope", {}), ctx(ws))).content).toContain("Unknown tool");
    expect((await runTool(BUILTIN_TOOLS, { id: "1", name: "read", input: undefined, rawInput: "{bad" }, ctx(ws))).content).toContain("Invalid JSON");
  });

  test("plan mode refuses edits", async () => {
    const r = await runTool(BUILTIN_TOOLS, call("write", { path: "p.txt", content: "x" }), ctx(ws, "plan"));
    expect(r.isError).toBe(true);
    expect(r.content).toContain("plan mode");
  });
});

describe.skipIf(detectSandbox() === "none")("bash tool", () => {
  test("runs sandboxed and reports the exit code", async () => {
    const ws = tempDir();
    const r = await runTool(BUILTIN_TOOLS, call("bash", { command: "echo ok; exit 3" }), ctx(ws));
    expect(r.content).toBe("ok\n[exit code 3]");
  });
  test("network requests need approval", async () => {
    const ws = tempDir();
    const c = ctx(ws);
    c.gate = new PermissionGate(c.cfg.permission, async () => "deny");
    const r = await runTool(BUILTIN_TOOLS, call("bash", { command: "true", network: true }), c);
    expect(r.content).toContain("declined");
  });
});

test("helpers", () => {
  expect(locate("a\nb  \nc", "b\nc")).toEqual({ index: 2, length: 5, count: 1 });
  expect(validateInput({ type: "object", properties: { n: { type: "integer" } } }, { n: 1.5 })).toBe("input.n must be an integer");
  const t = truncate("x".repeat(100), 50);
  expect(t).toContain("50 characters omitted");
});
