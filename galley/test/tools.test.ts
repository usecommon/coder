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

describe.skipIf(detectSandbox() === "none")("scratch files under /tmp", () => {
  const ws = tempDir();
  const name = `galley-scratch-${process.pid}`;

  test("write, edit and read reach the same /tmp that bash sees", async () => {
    const c = ctx(ws);
    c.undo.beginTurn();
    const w = await runTool(BUILTIN_TOOLS, call("write", { path: `/tmp/${name}/check.sh`, content: "echo first\n" }), c);
    expect(w.isError).toBeUndefined();
    expect(w.content).toBe(`Wrote 2 lines to /tmp/${name}/check.sh`);
    expect((await runTool(BUILTIN_TOOLS, call("bash", { command: `bash /tmp/${name}/check.sh` }), c)).content).toContain("first");
    const e = await runTool(BUILTIN_TOOLS, call("edit", { path: `/tmp/${name}/check.sh`, old_string: "first", new_string: "second" }), c);
    expect(e.content).toBe(`Edited /tmp/${name}/check.sh`);
    expect((await runTool(BUILTIN_TOOLS, call("bash", { command: `bash /tmp/${name}/check.sh` }), c)).content).toContain("second");
    // and the other way round: a file a command saved can be read back
    await runTool(BUILTIN_TOOLS, call("bash", { command: `echo from-bash > /tmp/${name}/out.txt` }), c);
    expect((await runTool(BUILTIN_TOOLS, call("read", { path: `/tmp/${name}/out.txt` }), c)).content).toContain("from-bash");
    expect((await runTool(BUILTIN_TOOLS, call("list", { path: `/tmp/${name}` }), c)).content).toBe("check.sh\nout.txt");
    expect((await runTool(BUILTIN_TOOLS, call("glob", { pattern: "*.sh", path: `/tmp/${name}` }), c)).content).toBe(`/tmp/${name}/check.sh`);
    expect((await runTool(BUILTIN_TOOLS, call("grep", { pattern: "from-b", path: `/tmp/${name}` }), c)).content).toBe(`/tmp/${name}/out.txt:1:from-bash`);
    // Scratch files are not part of the project: nothing to undo, nothing in the workspace.
    expect(c.undo.undo()).toEqual([]);
    expect(existsSync(join(ws, "tmp"))).toBe(false);
    // With bubblewrap the folder is private: the machine's own /tmp is untouched.
    if (detectSandbox() === "bwrap") expect(existsSync(`/tmp/${name}`)).toBe(false);
  });

  test("a workspace that itself lives under /tmp is still the workspace", async () => {
    const c = ctx(ws);
    const w = await runTool(BUILTIN_TOOLS, call("write", { path: join(ws, "in-ws.txt"), content: "x" }), c);
    expect(w.content).toBe("Wrote 1 lines to in-ws.txt");
    expect(readFileSync(join(ws, "in-ws.txt"), "utf8")).toBe("x");
  });

  test("a link planted in the scratch folder does not lead out of it", async () => {
    const c = ctx(ws);
    await runTool(BUILTIN_TOOLS, call("bash", { command: `mkdir -p /tmp/${name} && ln -s /etc /tmp/${name}/etc-link` }), c);
    const r = await runTool(BUILTIN_TOOLS, call("read", { path: `/tmp/${name}/etc-link/hostname` }), c);
    expect(r.isError).toBe(true);
    expect(r.content).toContain("leads outside /tmp");
    const w = await runTool(BUILTIN_TOOLS, call("write", { path: `/tmp/${name}/etc-link/galley-test`, content: "x" }), c);
    expect(w.isError).toBe(true);
    expect((await runTool(BUILTIN_TOOLS, call("read", { path: "/tmp/../etc/hostname" }), c)).content).toContain("outside the workspace");
  });

  test("without a sandbox /tmp stays off limits", async () => {
    for (const c of [{ ...ctx(ws), sandbox: "none" as const }, { ...ctx(ws), cfg: testConfig({ sandbox: "off" }) }]) {
      const w = await runTool(BUILTIN_TOOLS, call("write", { path: `/tmp/${name}-nosandbox.txt`, content: "x" }), c);
      expect(w.isError).toBe(true);
      expect(w.content).toContain("outside the workspace");
      expect(existsSync(`/tmp/${name}-nosandbox.txt`)).toBe(false);
    }
  });
});

test("helpers", () => {
  expect(locate("a\nb  \nc", "b\nc")).toEqual({ index: 2, length: 5, count: 1 });
  expect(validateInput({ type: "object", properties: { n: { type: "integer" } } }, { n: 1.5 })).toBe("input.n must be an integer");
  const t = truncate("x".repeat(100), 50);
  expect(t).toContain("50 characters omitted");
});
