// Finding a project's own test command, for `check: "auto"`. Only the project's own declarations are read (a test
// target, a test script, a build tool's manifest); nothing is run. The command found is run like any check: in the
// sandbox with the network off, or, without a sandbox, only after asking.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

/** npm's placeholder for a project with no tests. */
const NO_TESTS = /no test specified/i;

/** The project's test command, or undefined when it declares none Galley knows how to run. */
export function detectCheck(ws: string): string | undefined {
  const has = (f: string) => existsSync(join(ws, f));
  // A Makefile's own test target says how the project wants its tests run, whatever the language.
  for (const f of ["GNUmakefile", "makefile", "Makefile"]) if (has(f) && /^test\s*:/m.test(read(join(ws, f)))) return "make test";
  if (has("package.json")) {
    let test: unknown;
    try {
      test = JSON.parse(read(join(ws, "package.json")))?.scripts?.test;
    } catch {}
    if (typeof test === "string" && test.trim() && !NO_TESTS.test(test)) {
      if (has("bun.lockb") || has("bun.lock")) return "bun run test";
      if (has("pnpm-lock.yaml")) return "pnpm test";
      if (has("yarn.lock")) return "yarn test";
      return "npm test";
    }
  }
  if (has("Cargo.toml")) return "cargo test";
  if (has("go.mod")) return "go test ./...";
  if (has("mix.exs")) return "mix test";
  // Python: pytest when the project configures it or has test files where pytest looks for them.
  const pyConfigured = has("pytest.ini") || /\[tool\.pytest/.test(read(join(ws, "pyproject.toml"))) || /\[(tool:)?pytest\]/.test(read(join(ws, "setup.cfg")) + read(join(ws, "tox.ini")));
  const pyTests = (dir: string) => {
    try {
      return readdirSync(join(ws, dir)).some((f) => /^test_.*\.py$|_test\.py$/.test(f));
    } catch {
      return false;
    }
  };
  if (pyConfigured || pyTests(".") || pyTests("tests") || pyTests("test")) return "python3 -m pytest -q";
  return undefined;
}
