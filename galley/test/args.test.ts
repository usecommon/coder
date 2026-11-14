import { expect, test } from "bun:test";
import { parseArgs } from "../src/args.ts";

test("options, values and the command are told apart", () => {
  const a = parseArgs(["run", "fix the bug", "--yes", "-m", "deepseek/deepseek-flash", "--cwd=/work", "-s", "abc"]);
  expect(a.cmd).toBe("run");
  expect(a.positional).toEqual(["fix the bug"]);
  expect(a.flags).toEqual({ yes: true, model: "deepseek/deepseek-flash", cwd: "/work", session: "abc" });
});

test("a task that begins with dashes is a task, not an option", () => {
  // Test output pasted as the task: busted prints a row of dashes first.
  const task = "--+----\n1 success / 17 failures\nFix the code.";
  const a = parseArgs(["run", task, "--yes"]);
  expect(a.positional).toEqual([task]);
  expect(a.flags).toEqual({ yes: true });
});

test("a bare -- ends the options", () => {
  const a = parseArgs(["run", "--yes", "--", "--help"]);
  expect(a.cmd).toBe("run");
  expect(a.positional).toEqual(["--help"]);
  expect(a.flags).toEqual({ yes: true });
});

test("no command means an interactive session", () => {
  expect(parseArgs(["--plan"]).cmd).toBe("chat");
});
