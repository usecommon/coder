import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confine, PathError } from "../src/safety/paths.ts";
import { evaluate, PermissionGate, splitCommand } from "../src/safety/permission.ts";
import { detectSandbox, exec, privilegeArgs, scrubEnv } from "../src/safety/sandbox.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { tempDir } from "./helpers.ts";

describe("path confinement", () => {
  const ws = tempDir();
  mkdirSync(join(ws, "src"));
  mkdirSync(join(ws, ".git"));
  const outside = tempDir();

  test("allows paths inside the workspace, including new files", () => {
    expect(confine(ws, "src/a.ts")).toBe(join(ws, "src/a.ts"));
    expect(confine(ws, "new/dir/file.txt", { write: true })).toBe(join(ws, "new/dir/file.txt"));
  });
  test("rejects .. and absolute escapes", () => {
    expect(() => confine(ws, "../x")).toThrow(PathError);
    expect(() => confine(ws, "/etc/passwd")).toThrow(PathError);
  });
  test("rejects symlinks that point outside", () => {
    symlinkSync(outside, join(ws, "link"));
    expect(() => confine(ws, "link/secret.txt")).toThrow(PathError);
  });
  test("blocks writes into .git but allows reads", () => {
    expect(confine(ws, ".git/config")).toBe(join(ws, ".git/config"));
    expect(() => confine(ws, ".git/hooks/pre-commit", { write: true })).toThrow("inside .git");
  });
});

describe("permission rules", () => {
  const rules = DEFAULT_CONFIG.permission;
  test("judges compound commands by their strictest segment", () => {
    expect(splitCommand("npm test && git push origin main | cat")).toEqual(["npm test", "git push origin main", "cat"]);
    expect(evaluate({ tool: "bash", subject: "npm test" }, rules, "build")).toBe("allow");
    expect(evaluate({ tool: "bash", subject: "npm test && git push origin main" }, rules, "build")).toBe("ask");
    expect(evaluate({ tool: "bash", subject: "ls; sudo rm -rf /" }, rules, "build")).toBe("deny");
  });
  test("plan mode denies tools that change things", () => {
    expect(evaluate({ tool: "edit", subject: "a.ts" }, rules, "plan")).toBe("deny");
    expect(evaluate({ tool: "read", subject: "a.ts" }, rules, "plan")).toBe("allow");
    expect(evaluate({ tool: "mcp_github_create_issue", subject: "{}" }, rules, "plan")).toBe("deny");
  });
  test("wildcard tool rules and unknown tools", () => {
    expect(evaluate({ tool: "mcp_db_query", subject: "{}" }, rules, "build")).toBe("ask");
    expect(evaluate({ tool: "mystery", subject: "" }, rules, "build")).toBe("ask");
  });
  test("gate asks once per 'always' answer and enforces the floor", async () => {
    let asked = 0;
    const gate = new PermissionGate(rules, async () => (asked++, "always"));
    const req = { tool: "bash", subject: "git push", reason: "x" };
    expect((await gate.check(req)).ok).toBe(true);
    expect((await gate.check(req)).ok).toBe(true);
    expect(asked).toBe(1);
    const strict = new PermissionGate(rules, undefined);
    expect(await strict.check({ tool: "bash", subject: "ls" }, "ask")).toEqual({ ok: false, why: expect.stringContaining("needs approval") });
  });
});

describe("environment scrubbing", () => {
  test("removes secrets but keeps the rest", () => {
    const env = scrubEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "s", GITHUB_TOKEN: "t", HOME: "/h" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h" });
  });
});

const hasSandbox = detectSandbox() === "bwrap";
describe.skipIf(!hasSandbox)("bubblewrap sandbox", () => {
  const ws = tempDir();
  mkdirSync(join(ws, ".git"));
  writeFileSync(join(ws, ".git", "HEAD"), "ref: main\n");
  const outside = tempDir();
  const run = (cmd: string, o: Partial<Parameters<typeof exec>[1]> = {}) =>
    exec(cmd, { cwd: ws, workspace: ws, readOnly: false, network: false, timeoutMs: 10_000, kind: "bwrap", ...o });

  test("can write inside the workspace", async () => {
    const r = await run("echo hi > made.txt && cat made.txt");
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(ws, "made.txt"), "utf8")).toBe("hi\n");
  });
  test("cannot write outside the workspace", async () => {
    const r = await run(`echo x > ${outside}/escape.txt`);
    expect(r.exitCode).not.toBe(0);
    expect(existsSync(join(outside, "escape.txt"))).toBe(false);
  });
  test(".git is read-only", async () => {
    const r = await run("echo evil > .git/hooks-pre-commit");
    expect(r.exitCode).not.toBe(0);
  });
  test("plan mode makes the workspace read-only", async () => {
    const r = await run("touch plan.txt", { readOnly: true });
    expect(r.exitCode).not.toBe(0);
    expect(existsSync(join(ws, "plan.txt"))).toBe(false);
  });
  test("network is off by default", async () => {
    const r = await run("cat /proc/net/dev; timeout 3 bash -c 'echo > /dev/tcp/1.1.1.1/53' && echo CONNECTED || echo BLOCKED");
    const ifaces = r.output.split("\n").filter((l) => /^\s*[\w.-]+:\s+\d/.test(l)).map((l) => l.split(":")[0]!.trim());
    expect(ifaces).toEqual(["lo"]);
    expect(r.output).toContain("BLOCKED");
  });
  test("network can be granted", async () => {
    const r = await run("cat /proc/net/dev", { network: true });
    expect(r.output.split("\n").filter((l) => /^\s*[\w.-]+:\s+\d/.test(l)).length).toBeGreaterThan(1);
  });
  test("secrets are not visible", async () => {
    process.env.FAKE_API_KEY = "sekret";
    const r = await run("env");
    expect(r.output).not.toContain("sekret");
    delete process.env.FAKE_API_KEY;
  });
  test("build caches go to a writable cache dir (home stays read-only)", async () => {
    const cacheDir = tempDir("galley-cache-");
    writeFileSync(join(ws, "go.mod"), "module m\n\ngo 1.21\n");
    writeFileSync(join(ws, "m.go"), "package main\nfunc main() { println(\"built\") }\n");
    const r = await run("go run . 2>&1; touch ~/.galley-probe 2>&1 || echo HOME_RO", { cacheDir, timeoutMs: 60_000 });
    expect(r.output).toContain("built");
    expect(r.output).toContain("HOME_RO");
    expect(existsSync(join(cacheDir, "go-build"))).toBe(true);
  });
  test("/tmp persists between commands but is private to the sandbox", async () => {
    const tmpDir = tempDir("galley-tmp-");
    expect((await run("echo scratch > /tmp/t.py", { tmpDir })).exitCode).toBe(0);
    const r = await run("cat /tmp/t.py", { tmpDir });
    expect(r.output).toBe("scratch\n");
    expect(readFileSync(join(tmpDir, "t.py"), "utf8")).toBe("scratch\n");
    expect(existsSync("/tmp/t.py")).toBe(false);
  });
  test("timeouts kill the command", async () => {
    const r = await run("sleep 5", { timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
  });

  // Regression: a process left behind by a command kept the output pipes open, and the agent waited on it.
  test("a command that times out returns at once, even if it started other processes", async () => {
    const t = Date.now();
    const r = await run("sleep 34 & timeout 34 sleep 34 & sleep 34", { timeoutMs: 1000 });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t).toBeLessThan(4000);
    await new Promise((res) => setTimeout(res, 300));
    expect(spawnSync("pgrep", ["-f", "^(timeout 34 )?sleep 34$"]).status === 0).toBe(false);
  });
  // Is a process with this command line still running? (Looked up from outside the sandbox.)
  const running = (pattern: string) => spawnSync("pgrep", ["-f", pattern]).status === 0;
  test("a command that leaves a background process behind returns at once, and the process is stopped", async () => {
    const t = Date.now();
    const r = await run("sleep 31 & echo started");
    expect(r.output).toContain("started");
    expect(Date.now() - t).toBeLessThan(4000);
    await new Promise((res) => setTimeout(res, 300));
    expect(running("^sleep 31$")).toBe(false);
  });
  test("the same holds when the sandbox shares the surrounding process list", () => {
    // That mode is chosen at start-up, so check it in a separate process.
    const script = `
      const { spawnSync } = await import("node:child_process");
      const { exec, detectSandbox, sandboxProcMode } = await import(${JSON.stringify(join(import.meta.dir, "../src/safety/sandbox.ts"))});
      const kind = detectSandbox();
      const ws = ${JSON.stringify(ws)};
      const o = { cwd: ws, workspace: ws, readOnly: false, network: false, kind };
      let t = Date.now();
      const a = await exec("sleep 32 & timeout 32 sleep 32 & sleep 32", { ...o, timeoutMs: 1000 });
      const timeoutMs = Date.now() - t;
      t = Date.now();
      const b = await exec("sleep 33 & echo started", { ...o, timeoutMs: 20000 });
      const leftoverMs = Date.now() - t;
      await new Promise((res) => setTimeout(res, 300));
      const left = spawnSync("pgrep", ["-f", "^(timeout 32 )?sleep 3[23]$"]).status === 0;
      console.log(JSON.stringify({ mode: sandboxProcMode(), timedOut: a.timedOut, timeoutMs, leftoverMs, left }));
    `;
    const r = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, GALLEY_SANDBOX_PROC: "shared" }, encoding: "utf8", timeout: 60_000 });
    const out = JSON.parse(r.stdout.trim().split("\n").pop()!);
    expect(out.mode).toBe("shared");
    expect(out.timedOut).toBe(true);
    expect(out.timeoutMs).toBeLessThan(4000);
    expect(out.leftoverMs).toBeLessThan(4000);
    expect(out.left).toBe(false);
  });

  // Regression: when Galley ran as root, the command kept root's capabilities and could undo the sandbox.
  test("a command cannot remount the filesystem read-write to write outside the workspace", async () => {
    // /var/tmp is visible (read-only) inside the sandbox; the other temp dirs live under /tmp, which is hidden.
    const visible = realpathSync(mkdtempSync("/var/tmp/galley-test-"));
    const r = await run(`mount -o remount,rw,bind / 2>&1; echo x > ${visible}/escape.txt; echo "write=$?"`);
    expect(r.output).not.toContain("write=0");
    expect(existsSync(join(visible, "escape.txt"))).toBe(false);
    rmSync(visible, { recursive: true, force: true });
  });
  test("a command cannot unmount the private /tmp to see the host's /tmp", async () => {
    const marker = join(tmpdir(), `galley-host-marker-${process.pid}`);
    writeFileSync(marker, "HOST-TMP-CONTENT");
    const r = await run(`unshare -m sh -c 'umount -l /tmp; cat ${marker}' 2>&1; umount -l /tmp 2>&1; cat ${marker} 2>&1; true`);
    expect(r.output).not.toContain("HOST-TMP-CONTENT");
    rmSync(marker, { force: true });
  });
  test("a command cannot create device nodes", async () => {
    const r = await run("mknod node c 1 3");
    expect(r.exitCode).not.toBe(0);
    expect(existsSync(join(ws, "node"))).toBe(false);
  });
  test("ordinary file handling still works for root (archives that carry other owners)", async () => {
    const r = await run("echo hi > a && tar --owner=1234 --group=1234 -cf t.tar a && mkdir out && tar -xf t.tar -C out && cat out/a");
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("hi");
  });
});

describe("sandbox privilege drop", () => {
  test("root keeps only file-handling capabilities; other users need no extra flags", () => {
    const root = privilegeArgs(0);
    expect(root.slice(0, 2)).toEqual(["--cap-drop", "ALL"]);
    expect(root).toContain("CAP_CHOWN");
    for (const dangerous of ["CAP_SYS_ADMIN", "CAP_MKNOD", "CAP_DAC_READ_SEARCH", "CAP_SYS_PTRACE", "CAP_NET_ADMIN"]) expect(root).not.toContain(dangerous);
    expect(privilegeArgs(1000)).toEqual([]);
  });
});
