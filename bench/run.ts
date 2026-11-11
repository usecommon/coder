// Head-to-head runner for the Aider Polyglot benchmark (Exercism exercises).
//
// Protocol (same for every agent):
//  - Workspace = the exercise with its tests and .meta (reference solution) removed.
//  - Prompt = Aider's benchmark prompt + the exercise instructions. One attempt, no test feedback from us.
//  - Each agent runs headless, auto-approving, inside an outer bubblewrap sandbox: only its workspace and its own
//    state directories are writable; package managers are offline (dependencies pre-fetched).
//  - Grading restores the official tests and runs them in a network-less sandbox.
//  - All model traffic goes through proxy.ts, so tokens come from DeepSeek's own usage reports.
//
// Usage: bun run.ts --agents galley,opencode --langs python,go,rust [--limit N] [--concurrency 6] [--oracle]
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1]!.startsWith("--") ? all[i + 1]! : "true"]);
    return acc;
  }, []),
);
const POLYGLOT = args.polyglot ?? process.env.POLYGLOT!;
const OUT = args.out ?? join(import.meta.dir, "results");
const AGENTS = (args.agents ?? "galley,opencode").split(",");
const LANGS = (args.langs ?? "python,go,rust").split(",");
const LIMIT = Number(args.limit ?? 1e9);
const CONC = Number(args.concurrency ?? 6);
const AGENT_TIMEOUT = Number(args.timeout ?? 600) * 1000;
const MODEL = args.model ?? "deepseek/deepseek-flash";
const PROXY = args.proxy ?? "http://127.0.0.1:8799";
const GALLEY = args.galley ?? join(import.meta.dir, "..", "galley", "src", "cli.ts");
const OPENCODE = args.opencode ?? process.env.OPENCODE_BIN!;
const OC_CACHE_SEED = args["oc-cache"] ?? process.env.OC_CACHE_SEED;
const ORACLE = args.oracle === "true";
/** Unix socket of the logging proxy. When set, agents run with no network at all except this socket. */
const SOCK = args.sock ?? process.env.PROXY_SOCK;

interface Task {
  lang: string;
  name: string;
  dir: string;
  files: { solution: string[]; test: string[]; example: string[]; editor?: string[] };
}

/** Deterministic split so improvements are developed on "dev" and confirmed on untouched "holdout" tasks. */
export const splitOf = (key: string) => (BigInt("0x" + new Bun.CryptoHasher("sha256").update(key).digest("hex")) % 2n === 0n ? "dev" : "holdout");
const SPLIT = args.split ?? "all";
const ONLY = args.only ? new Set(args.only.split(",")) : undefined;

function tasks(): Task[] {
  const out: Task[] = [];
  for (const lang of LANGS) {
    const root = join(POLYGLOT, lang, "exercises", "practice");
    for (const name of readdirSync(root).sort().slice(0, LIMIT)) {
      const dir = join(root, name);
      const files = JSON.parse(readFileSync(join(dir, ".meta", "config.json"), "utf8")).files;
      const key = `${lang}/${name}`;
      if (SPLIT !== "all" && splitOf(key) !== SPLIT) continue;
      if (ONLY && !ONLY.has(key)) continue;
      out.push({ lang, name, dir, files });
    }
  }
  return out;
}

function prompt(t: Task): string {
  const docs = join(t.dir, ".docs");
  const parts = ["introduction.md", "instructions.md", "instructions.append.md"].filter((f) => existsSync(join(docs, f))).map((f) => readFileSync(join(docs, f), "utf8"));
  const sol = t.files.solution.filter((f) => !f.endsWith("Cargo.toml"));
  return (
    parts.join("\n\n") +
    `\n\n####\n\nUse the above instructions to modify the supplied files: ${sol.join(" ")}\n` +
    "Don't change the names of existing functions or classes, as they may be referenced from other code like unit tests, etc.\n" +
    "Only use standard libraries, don't suggest installing any packages.\n" +
    "The unit tests are not provided. Work in the current directory."
  );
}

// Hide the tests. Go "editor" files are visible to the solver unless they are test files (e.g. cases_test.go);
// others (interfaces.go, relations.go, ...) are part of the exercise's API.
const hidden = (t: Task) => [...t.files.test, ...(t.files.editor ?? []).filter((f) => f.endsWith("_test.go"))];

function prepare(t: Task, ws: string) {
  rmSync(ws, { recursive: true, force: true });
  mkdirSync(dirname(ws), { recursive: true });
  cpSync(t.dir, ws, { recursive: true });
  rmSync(join(ws, ".meta"), { recursive: true, force: true });
  for (const f of hidden(t)) rmSync(join(ws, f), { force: true });
  if (t.lang === "rust") rmSync(join(ws, "tests"), { recursive: true, force: true });
}

/** Run a command in bubblewrap: read-only system, listed dirs writable, optional network. */
function bwrap(cmd: string[], o: { cwd: string; writable: string[]; readable?: string[]; network: boolean; env: Record<string, string>; timeoutMs: number; stdout?: string }): Promise<{ code: number | null; timedOut: boolean; ms: number }> {
  const a = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp"];
  // A private /tmp hides the host's /tmp, so re-expose anything needed from there (read-only).
  for (const r of o.readable ?? []) a.push("--ro-bind", r, r);
  for (const w of o.writable) a.push("--bind", w, w);
  if (!o.network) a.push("--unshare-net");
  a.push("--unshare-pid", "--die-with-parent", "--new-session", "--chdir", o.cwd, ...cmd);
  const started = Date.now();
  return new Promise((resolve) => {
    const out = o.stdout ? Bun.file(o.stdout).writer() : undefined;
    const child = spawn("bwrap", a, { env: o.env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (b) => out?.write(b));
    child.stderr.on("data", (b) => out?.write(b));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, o.timeoutMs);
    child.on("close", async (code) => {
      clearTimeout(timer);
      await out?.end();
      resolve({ code, timedOut, ms: Date.now() - started });
    });
  });
}

// Pass through the outbound-proxy and CA settings this machine needs, but keep calls to the local proxy direct.
const netEnv = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && /proxy|^SSL_CERT|^NODE_EXTRA_CA|^REQUESTS_CA|^CURL_CA/i.test(k))) as Record<string, string>;
netEnv.NO_PROXY = netEnv.no_proxy = ["127.0.0.1", "localhost", netEnv.NO_PROXY ?? ""].filter(Boolean).join(",");

const baseEnv = (run: string): Record<string, string> => ({
  ...netEnv,
  PATH: process.env.PATH!,
  HOME: process.env.HOME!,
  LANG: "C.UTF-8",
  TERM: "dumb",
  NO_COLOR: "1",
  // Build caches writable, package managers offline (dependencies were pre-fetched).
  GOCACHE: join(run, "cache", "go-build"),
  GOFLAGS: "-mod=mod",
  GOPROXY: "off",
  CARGO_NET_OFFLINE: "true",
  PYTHONPYCACHEPREFIX: join(run, "cache", "pycache"),
  PYTHONDONTWRITEBYTECODE: "1",
});

async function runAgent(agent: string, t: Task, ws: string, run: string) {
  const tag = `${agent}__${t.lang}__${t.name}`;
  mkdirSync(join(run, "cache"), { recursive: true });
  const env = { ...baseEnv(run), DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY! };
  let cmd: string[];
  if (agent === "galley") {
    const cfgDir = join(run, "config", "galley");
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, "config.json"), JSON.stringify({ providers: { deepseek: { baseURL: `${PROXY}/${tag}` } } }));
    Object.assign(env, { XDG_CONFIG_HOME: join(run, "config"), GALLEY_DATA_DIR: join(run, "galley-data") });
    cmd = [process.execPath, GALLEY, "run", prompt(t), "--yes", "-m", MODEL, "--cwd", ws];
  } else if (agent === "opencode") {
    const cfgDir = join(run, "config", "opencode");
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      join(cfgDir, "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", autoupdate: false, share: "disabled", provider: { deepseek: { options: { baseURL: `${PROXY}/${tag}` } } } }),
    );
    if (OC_CACHE_SEED) cpSync(OC_CACHE_SEED, join(run, "xdg-cache"), { recursive: true });
    Object.assign(env, { XDG_CONFIG_HOME: join(run, "config"), XDG_DATA_HOME: join(run, "xdg-data"), XDG_STATE_HOME: join(run, "xdg-state"), XDG_CACHE_HOME: join(run, "xdg-cache") });
    cmd = [OPENCODE, "run", "--model", MODEL, "--auto", "--format", "json", prompt(t)];
  } else throw new Error(`unknown agent ${agent}`);
  const readable = agent === "opencode" ? [dirname(dirname(OPENCODE))] : [];
  if (!SOCK) return bwrap(cmd, { cwd: ws, writable: [ws, run], readable, network: true, env, timeoutMs: AGENT_TIMEOUT, stdout: join(run, "agent.log") });
  // No internet: a private network namespace whose only way out is the proxy socket, relayed by forward.ts.
  const port = new URL(PROXY).port;
  const wrapped = ["bash", "-c", `PORT=${port} PROXY_SOCK="$1" "$2" "$3" & i=0; until (exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null || [ $i -ge 50 ]; do i=$((i+1)); sleep 0.1; done; shift 3; exec "$@"`, "bash", SOCK, process.execPath, join(import.meta.dir, "forward.ts"), ...cmd];
  for (const k of Object.keys(env)) if (/proxy/i.test(k)) delete env[k];
  return bwrap(wrapped, { cwd: ws, writable: [ws, run, dirname(SOCK)], readable, network: false, env, timeoutMs: AGENT_TIMEOUT, stdout: join(run, "agent.log") });
}

async function grade(t: Task, ws: string, run: string) {
  // Restore the official tests (overwriting anything the agent wrote with the same names).
  for (const f of hidden(t)) {
    mkdirSync(dirname(join(ws, f)), { recursive: true });
    cpSync(join(t.dir, f), join(ws, f));
  }
  const cmd =
    t.lang === "python" ? ["pytest", "-q", "-p", "no:cacheprovider"] : t.lang === "go" ? ["go", "test", "./..."] : t.lang === "rust" ? ["cargo", "test", "--", "--include-ignored"] : [];
  mkdirSync(join(run, "cache"), { recursive: true });
  return bwrap(cmd, { cwd: ws, writable: [ws, run], network: false, env: baseEnv(run), timeoutMs: 300_000, stdout: join(run, "grade.log") });
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

const all = tasks();
mkdirSync(OUT, { recursive: true });
const resultsFile = join(OUT, ORACLE ? "oracle.jsonl" : "results.jsonl");
const done = new Set(existsSync(resultsFile) ? readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.agent}/${r.lang}/${r.name}`; }) : []);
const jobs = (ORACLE ? ["oracle"] : AGENTS).flatMap((agent) => all.map((t) => ({ agent, t }))).filter((j) => !done.has(`${j.agent}/${j.t.lang}/${j.t.name}`));
// Interleave agents so both see the same API conditions over time.
jobs.sort((a, b) => all.indexOf(a.t) - all.indexOf(b.t) || a.agent.localeCompare(b.agent));
console.log(`${jobs.length} runs (${all.length} tasks × ${ORACLE ? 1 : AGENTS.length} agents), concurrency ${CONC}`);

let finished = 0;
await pool(jobs, CONC, async ({ agent, t }) => {
  const run = join(OUT, "runs", agent, t.lang, t.name);
  const ws = join(run, "ws");
  rmSync(run, { recursive: true, force: true });
  mkdirSync(run, { recursive: true });
  prepare(t, ws);
  let a = { code: 0 as number | null, timedOut: false, ms: 0 };
  if (agent === "oracle") {
    // Sanity check of the harness: the reference solution must pass.
    for (let k = 0; k < t.files.solution.length && k < t.files.example.length; k++) cpSync(join(t.dir, t.files.example[k]!), join(ws, t.files.solution[k]!));
  } else a = await runAgent(agent, t, ws, run);
  const g = await grade(t, ws, run);
  const r = { agent, lang: t.lang, name: t.name, pass: g.code === 0 && !g.timedOut, agentExit: a.code, agentTimedOut: a.timedOut, agentMs: a.ms, gradeExit: g.code };
  appendFileSync(resultsFile, JSON.stringify(r) + "\n");
  finished++;
  console.log(`[${finished}/${jobs.length}] ${agent.padEnd(8)} ${t.lang}/${t.name}: ${r.pass ? "PASS" : "fail"} (${Math.round(a.ms / 1000)}s${a.timedOut ? ", timed out" : ""})`);
});
console.log("done");
