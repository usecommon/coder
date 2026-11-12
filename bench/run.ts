// Head-to-head runner for the Aider Polyglot benchmark (Exercism exercises).
//
// Protocol (same for every agent):
//  - Workspace = the exercise with its tests and .meta (reference solution) removed.
//  - Prompt = Aider's benchmark prompt + the exercise instructions. One attempt, no test feedback from us.
//  - Each agent runs headless, auto-approving, inside a sandbox that contains only the operating system, the
//    language toolchains, the agent's own program and its workspace. The rest of the machine does not exist
//    inside it: not the operator's home directory, not this repository, not other tasks or runs.
//    The agent runs as an unprivileged user with no network; its only way out is the model proxy.
//  - Agents never hold a real API key. They send a placeholder; the key is added outside the sandbox.
//  - Grading restores the official tests and runs them in the same kind of sandbox.
//  - All model traffic goes through proxy.ts, so tokens come from the provider's own usage reports.
//
// Usage: bun run.ts --agents galley,opencode --langs python,go,rust [--limit N] [--concurrency 6] [--oracle]
//        bun run.ts --selftest        checks that the sandbox hides what it must (run before every round)
import { spawn } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statfsSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

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
const PROVIDER = MODEL.split("/")[0]!;
/** Reasoning effort for both agents (Anthropic models): Galley's `effort`, OpenCode's `--variant`. */
const EFFORT = args.effort ?? "high";
/** Agents get this instead of a real key. The real one is added to their requests outside the sandbox:
 *  by proxy.ts (UPSTREAM_KEY) or by the machine's own network layer. */
const PLACEHOLDER_KEY = "sk-bench-placeholder-not-a-real-key";
const keyEnv = (): Record<string, string> => ({ [`${PROVIDER.toUpperCase()}_API_KEY`]: PLACEHOLDER_KEY });
const GALLEY = args.galley ?? join(import.meta.dir, "..", "galley", "src", "cli.ts");
const OPENCODE = args.opencode ?? process.env.OPENCODE_BIN!;
const OC_CACHE_SEED = args["oc-cache"] ?? process.env.OC_CACHE_SEED;
const ORACLE = args.oracle === "true";
const SELFTEST = args.selftest === "true";
/** Extra flags for Galley, e.g. "--verify". */
const GALLEY_ARGS = (args["galley-args"] ?? process.env.GALLEY_ARGS ?? "").split(" ").filter(Boolean);
/** Unix socket of the logging proxy. When set, agents run with no network at all except this socket. */
const SOCK = args.sock ?? process.env.PROXY_SOCK;
/** The proxy's log. When set, a result is recorded only if the agent got at least one answer from the model. */
const PROXY_LOG = args["proxy-log"] ?? process.env.PROXY_LOG;

/** Variants of an agent, to compare configurations side by side in one run. A variant is named
 *  "<agent>-<label>", e.g. --agents opencode,galley,galley-sr with
 *  BENCH_VARIANTS='{"galley-sr":{"providerOpts":{"sendReasoning":true}},"galley-medium":{"effort":"medium"}}'. */
interface Variant {
  effort?: string;
  /** extra command-line flags */
  args?: string[];
  /** Galley only: extra options for the model provider */
  providerOpts?: Record<string, unknown>;
}
const VARIANTS: Record<string, Variant> = JSON.parse(args.variants ?? process.env.BENCH_VARIANTS ?? "{}");
const baseOf = (agent: string) => agent.split("-")[0]!;

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

// ---------------------------------------------------------------------------------------------------------
// The sandbox
// ---------------------------------------------------------------------------------------------------------

const HOME = process.env.HOME ?? "/root";
/** Agents run as this unprivileged user (the machine's root, seen through a user namespace). */
const BOX_UID = 1000;
const boxUser = (() => {
  const line = existsSync("/etc/passwd") ? readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.split(":")[2] === String(BOX_UID)) : undefined;
  return { name: line?.split(":")[0] ?? "bench", home: line?.split(":")[5] };
})();

/** Everything an agent can see of the machine, read-only: the operating system, language toolchains and
 *  developer tools. Nothing else is mounted, so nothing else exists inside the sandbox. */
const VISIBLE: string[] = (() => {
  const dirs = new Set(["/usr", "/etc"]);
  for (const p of (process.env.PATH ?? "").split(":")) {
    for (const q of existsSync(p) ? [p, realpathSync(p)] : []) {
      if (q.startsWith("/opt/")) dirs.add(q.split("/").slice(0, 3).join("/"));
      if (q.startsWith("/nix/")) dirs.add("/nix");
    }
  }
  // Toolchains and tools kept under the home directory: cargo and rustup, bun, uv-installed tools such as pytest.
  for (const d of [".cargo", ".rustup", ".bun", ".local/bin", ".local/lib", ".local/share/uv", "go/pkg/mod"]) dirs.add(join(HOME, d));
  return [...dirs].filter((d) => existsSync(d)).sort();
})();
/** Parts of /etc that could hold credentials. */
const ETC_HIDE_FILES = ["/etc/shadow", "/etc/gshadow", "/etc/sudoers"].filter((f) => existsSync(f));
const ETC_HIDE_DIRS = ["/etc/sudoers.d", "/etc/apt/auth.conf.d", "/etc/docker", "/etc/ssl/private", "/etc/ssh"].filter((f) => existsSync(f));

interface Box {
  cwd: string;
  /** read-write folders */
  writable: string[];
  /** extra read-only files or folders */
  readable?: string[];
  network: boolean;
  env: Record<string, string>;
  timeoutMs: number;
  stdout?: string;
}

function boxArgs(o: Box): string[] {
  // An unprivileged user in its own user namespace, with no capabilities: it cannot remount, unmount or
  // mount anything that would show more of the machine, and there is nothing hidden underneath to show.
  const a = ["--unshare-user", "--uid", String(BOX_UID), "--gid", String(BOX_UID), "--cap-drop", "ALL"];
  for (const d of VISIBLE) a.push("--ro-bind", d, d);
  for (const n of ["bin", "sbin", "lib", "lib32", "lib64", "libx32"]) {
    const p = `/${n}`;
    if (!existsSync(p)) continue;
    if (lstatSync(p).isSymbolicLink()) a.push("--symlink", readlinkSync(p), p);
    else a.push("--ro-bind", p, p);
  }
  for (const f of ETC_HIDE_FILES) a.push("--ro-bind", "/dev/null", f);
  for (const d of ETC_HIDE_DIRS) a.push("--tmpfs", d);
  a.push("--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--tmpfs", "/var/tmp", "--dir", "/run", "--dir", HOME);
  if (boxUser.home) a.push("--dir", boxUser.home);
  for (const r of o.readable ?? []) a.push("--ro-bind", r, r);
  for (const w of o.writable) a.push("--bind", w, w);
  if (!o.network) a.push("--unshare-net");
  // Everything not mounted above lives on an empty in-memory root; make that read-only too.
  a.push("--remount-ro", "/", "--unshare-pid", "--die-with-parent", "--new-session", "--chdir", o.cwd);
  return a;
}

/** Values that must never enter a sandbox: every secret-looking variable of the harness's own environment. */
const SECRETS = Object.entries(process.env).filter(([k, v]) => v && v.length >= 12 && /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)).map(([, v]) => v!);

/** Run a command in the sandbox. */
function box(cmd: string[], o: Box): Promise<{ code: number | null; timedOut: boolean; ms: number }> {
  for (const [k, v] of Object.entries(o.env)) if (SECRETS.some((s) => v.includes(s))) throw new Error(`refusing to start: ${k} would carry a secret into the sandbox`);
  const a = [...boxArgs(o), ...cmd];
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

// With internet access (not the default), pass through the outbound-proxy and CA settings this machine needs.
const netEnv = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && /proxy|^SSL_CERT|^NODE_EXTRA_CA|^REQUESTS_CA|^CURL_CA/i.test(k))) as Record<string, string>;
netEnv.NO_PROXY = netEnv.no_proxy = ["127.0.0.1", "localhost", netEnv.NO_PROXY ?? ""].filter(Boolean).join(",");
const caFiles = [...new Set(Object.entries(netEnv).filter(([k, v]) => !/proxy/i.test(k) && v.startsWith("/") && existsSync(v)).map(([, v]) => v))];

const baseEnv = (run: string): Record<string, string> => ({
  PATH: process.env.PATH!,
  HOME,
  USER: boxUser.name,
  LOGNAME: boxUser.name,
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

/** What an agent's process needs beyond the toolchains: its own program, and the relay to the model proxy. */
const agentFiles = (agent: string) => [
  ...(baseOf(agent) === "galley" ? [dirname(dirname(GALLEY))] : baseOf(agent) === "opencode" ? [dirname(dirname(OPENCODE))] : []),
  process.execPath,
  join(import.meta.dir, "forward.ts"),
];

/** Run `cmd` as an agent would run: no network except the proxy socket (or with internet when no socket is set). */
function runInAgentBox(cmd: string[], o: { agent: string; ws: string; state: string[]; env: Record<string, string>; timeoutMs: number; stdout?: string }) {
  const readable = agentFiles(o.agent);
  const env = { ...o.env };
  if (!SOCK) return box(cmd, { cwd: o.ws, writable: [o.ws, ...o.state], readable: [...readable, ...caFiles], network: true, env: { ...netEnv, ...env }, timeoutMs: o.timeoutMs, stdout: o.stdout });
  // No internet: a private network namespace whose only way out is the proxy socket, relayed by forward.ts.
  const port = new URL(PROXY).port;
  const wrapped = ["bash", "-c", `PORT=${port} PROXY_SOCK="$1" "$2" "$3" & i=0; until (exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null || [ $i -ge 50 ]; do i=$((i+1)); sleep 0.1; done; shift 3; exec "$@"`, "bash", SOCK, process.execPath, join(import.meta.dir, "forward.ts"), ...cmd];
  return box(wrapped, { cwd: o.ws, writable: [o.ws, ...o.state], readable: [...readable, dirname(SOCK)], network: false, env, timeoutMs: o.timeoutMs, stdout: o.stdout });
}

async function runAgent(agent: string, t: Task, ws: string, run: string) {
  const tag = `${agent}__${t.lang}__${t.name}`;
  const v = VARIANTS[agent] ?? {};
  const effort = v.effort ?? EFFORT;
  // The agent sees its workspace and these state folders. Not the rest of the run folder: the logs written
  // there by the harness stay outside.
  const state = (names: string[]) => names.map((n) => (mkdirSync(join(run, n), { recursive: true }), join(run, n)));
  const env = { ...baseEnv(run), ...keyEnv() };
  let cmd: string[];
  let stateDirs: string[];
  if (baseOf(agent) === "galley") {
    stateDirs = state(["cache", "config", "galley-data"]);
    mkdirSync(join(run, "config", "galley"), { recursive: true });
    // Anthropic's SDK appends /v1/messages itself; OpenAI-compatible clients append /chat/completions.
    // GALLEY_PROVIDER_OPTS (JSON) adds provider options for every Galley arm; a variant can add its own.
    const extra = { ...JSON.parse(process.env.GALLEY_PROVIDER_OPTS ?? "{}"), ...(v.providerOpts ?? {}) };
    writeFileSync(join(run, "config", "galley", "config.json"), JSON.stringify({ effort, providers: { [PROVIDER]: { baseURL: `${PROXY}/${tag}`, ...extra } } }));
    Object.assign(env, { XDG_CONFIG_HOME: join(run, "config"), GALLEY_DATA_DIR: join(run, "galley-data") });
    cmd = [process.execPath, GALLEY, "run", prompt(t), "--yes", "-m", MODEL, "--cwd", ws, ...GALLEY_ARGS, ...(v.args ?? [])];
  } else if (baseOf(agent) === "opencode") {
    stateDirs = state(["cache", "config", "xdg-data", "xdg-state", "xdg-cache"]);
    mkdirSync(join(run, "config", "opencode"), { recursive: true });
    writeFileSync(
      join(run, "config", "opencode", "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", autoupdate: false, share: "disabled", provider: { [PROVIDER]: { options: { baseURL: PROVIDER === "anthropic" ? `${PROXY}/${tag}/v1` : `${PROXY}/${tag}` } } } }),
    );
    if (OC_CACHE_SEED) cpSync(OC_CACHE_SEED, join(run, "xdg-cache"), { recursive: true });
    Object.assign(env, { XDG_CONFIG_HOME: join(run, "config"), XDG_DATA_HOME: join(run, "xdg-data"), XDG_STATE_HOME: join(run, "xdg-state"), XDG_CACHE_HOME: join(run, "xdg-cache") });
    cmd = [OPENCODE, "run", "--model", MODEL, "--auto", "--format", "json", ...(PROVIDER === "anthropic" ? ["--variant", effort] : []), ...(v.args ?? []), prompt(t)];
  } else throw new Error(`unknown agent ${agent}`);
  return runInAgentBox(cmd, { agent, ws, state: stateDirs, env, timeoutMs: AGENT_TIMEOUT, stdout: join(run, "agent.log") });
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
  return box(cmd, { cwd: ws, writable: [ws, join(run, "cache")], network: false, env: baseEnv(run), timeoutMs: 300_000, stdout: join(run, "grade.log") });
}

/** How many answers the model gave this task-run since `since` (from the proxy's log). */
function modelAnswers(tag: string, since: number): number {
  if (!PROXY_LOG || !existsSync(PROXY_LOG)) return -1;
  let n = 0;
  for (const line of readFileSync(PROXY_LOG, "utf8").split("\n")) {
    if (!line.includes(`"tag":"${tag}"`)) continue;
    try {
      const r = JSON.parse(line);
      if (r.status === 200 && (r.t ?? Infinity) >= since) n++;
    } catch {}
  }
  return n;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

// ---------------------------------------------------------------------------------------------------------
// Self-test: plant things an agent must never see, then look for them from inside the sandbox.
// ---------------------------------------------------------------------------------------------------------

async function selftest(): Promise<boolean> {
  const token = (n: string) => `CANARY-${n}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const mine = token("OWN");
  const forbidden = token("FORBIDDEN");
  const root = join(OUT, `selftest-${process.pid}`);
  const run = join(root, "runs", "selftest", "python", "this-task");
  const other = join(root, "runs", "selftest", "go", "this-task");
  const ws = join(run, "ws");
  mkdirSync(ws, { recursive: true });
  mkdirSync(join(other, "ws"), { recursive: true });
  writeFileSync(join(ws, "own.txt"), mine);
  writeFileSync(join(other, "ws", "this_task_test.go"), forbidden); // another task's workspace, with "tests" in it
  writeFileSync(join(root, "results.jsonl"), forbidden); // the run's results
  writeFileSync(join(run, "agent.log"), forbidden); // the harness's own log of this task
  // A real hidden test: its file name and one of its lines must not be findable anywhere.
  const t = tasks()[0]!;
  const hiddenFile = join(t.dir, hidden(t)[0]!);
  const hiddenLine = readFileSync(hiddenFile, "utf8").split("\n").map((l) => l.trim()).filter((l) => l.length >= 30).sort((x, y) => y.length - x.length)[0]!;
  writeFileSync(join(ws, "needle.txt"), hiddenLine + "\n");
  const mustNotExist = [POLYGLOT, hiddenFile, OUT + "/results.jsonl", join(root, "results.jsonl"), join(other, "ws"), join(run, "agent.log"), join(import.meta.dir, "run.ts"), join(import.meta.dir, "data"), join(import.meta.dir, "..", "research"), join(import.meta.dir, "..", ".git"),
    ...[".claude", ".claude.json", ".aws", ".boto", ".ssh", ".config", ".gitconfig", ".npm", ".cache", ".ccr", ".local/share/opencode"].map((d) => join(HOME, d)), "/etc/ssl/private/ssl-cert-snakeoil.key"];
  const script = `
fail() { echo "FAIL: $*"; }
[ "$(id -u)" != 0 ] || fail "running as root"
grep -q 'CapEff:[[:space:]]*0000000000000000' /proc/self/status || fail "has capabilities: $(grep CapEff /proc/self/status)"
for p in ${mustNotExist.map((p) => JSON.stringify(p)).join(" ")}; do [ -e "$p" ] && fail "visible: $p"; done
[ -s /etc/shadow ] && fail "/etc/shadow has content"
# Search everything that is not a toolchain for the planted token and for a line of a real hidden test.
SEARCH="/tmp /var /run /home /root /etc /dev/shm"
hits=$(grep -rslF --exclude-dir=.cargo --exclude-dir=.rustup --exclude-dir=.bun --exclude-dir=.local ${JSON.stringify(forbidden)} $SEARCH 2>/dev/null | head -5); [ -z "$hits" ] || fail "planted token readable at: $hits"
hits=$(grep -rslF --exclude-dir=.cargo --exclude-dir=.rustup --exclude-dir=.bun --exclude-dir=.local -f needle.txt $SEARCH 2>/dev/null | grep -v "/needle.txt$" | head -5); [ -z "$hits" ] || fail "hidden test content readable at: $hits"
hits=$(find / -xdev -name ${JSON.stringify(basename(hiddenFile))} 2>/dev/null | head -5); [ -z "$hits" ] || fail "hidden test file found: $hits"
hits=$(find / -name ${JSON.stringify(basename(hiddenFile))} -not -path '/proc/*' 2>/dev/null | head -5); [ -z "$hits" ] || fail "hidden test file found: $hits"
grep -qF ${JSON.stringify(mine)} own.txt || fail "own workspace not readable"
# Ways out that worked before.
(unshare -m true) 2>/dev/null && fail "can create a privileged mount namespace"
(mount -o remount,rw,bind /usr) 2>/dev/null && fail "can remount /usr read-write"
(umount -l /tmp) 2>/dev/null && fail "can unmount /tmp"
(mknod /tmp/dev-node c 1 3) 2>/dev/null && fail "can create device nodes"
# A nested user namespace is allowed, but must not reveal anything either.
hits=$(unshare -Urm sh -c 'umount -l /tmp 2>/dev/null; umount -l /root 2>/dev/null; grep -rslF ${JSON.stringify(forbidden)} /tmp /root /home /var 2>/dev/null | head -3' 2>/dev/null); [ -z "$hits" ] || fail "nested namespace reveals: $hits"
# Writes: only the workspace and scratch space.
touch ok.txt 2>/dev/null || fail "workspace not writable"
(touch /usr/x) 2>/dev/null && fail "/usr writable"
(touch "$HOME/x") 2>/dev/null && fail "home writable"
(touch /x) 2>/dev/null && fail "/ writable"
# Network: nothing but loopback.
(timeout 3 bash -c 'echo > /dev/tcp/1.1.1.1/53') 2>/dev/null && fail "internet reachable"
# Toolchains still work.
for c in "python3 --version" "pytest --version" "go version" "cargo --version" "rustc --version" "git --version" "rg --version"; do $c >/dev/null 2>&1 || fail "tool broken: $c"; done
env | grep -iE 'key|token|secret|password' | grep -v ${JSON.stringify(PLACEHOLDER_KEY)} | sed 's/=.*//' | while read n; do fail "secret-looking variable in environment: $n"; done
echo "probe finished"
`;
  let ok = true;
  for (const agent of ORACLE ? [] : AGENTS) {
    const state = ["cache", "config", "galley-data"].map((n) => (mkdirSync(join(run, n), { recursive: true }), join(run, n)));
    const log = join(root, `probe-${agent}.log`);
    await runInAgentBox(["bash", "-c", script], { agent, ws, state, env: { ...baseEnv(run), ...keyEnv() }, timeoutMs: 120_000, stdout: log });
    const outText = readFileSync(log, "utf8");
    const fails = outText.split("\n").filter((l) => l.startsWith("FAIL"));
    const finished = outText.includes("probe finished");
    console.log(`selftest ${agent}: ${fails.length === 0 && finished ? "ok" : "FAILED"}`);
    for (const f of fails) console.log("  " + f);
    if (!finished) console.log("  probe did not finish:\n" + outText.split("\n").slice(-5).join("\n"));
    if (fails.length || !finished) ok = false;
    if (baseOf(agent) === "galley") {
      // Galley's own sandbox must still work inside this one.
      const dlog = join(root, "doctor.log");
      await runInAgentBox([process.execPath, GALLEY, "doctor", "--cwd", ws], { agent, ws, state, env: { ...baseEnv(run), ...keyEnv(), XDG_CONFIG_HOME: join(run, "config"), GALLEY_DATA_DIR: join(run, "galley-data") }, timeoutMs: 60_000, stdout: dlog });
      const d = readFileSync(dlog, "utf8");
      const nested = /sandbox\s+bwrap/.test(d);
      console.log(`selftest ${agent}: Galley's own sandbox inside the benchmark sandbox: ${nested ? "ok" : "NOT AVAILABLE"}`);
      if (!nested) {
        console.log(d.split("\n").slice(0, 8).join("\n"));
        ok = false;
      }
    }
  }
  rmSync(root, { recursive: true, force: true });
  return ok;
}

// ---------------------------------------------------------------------------------------------------------

// The benchmark checkout holds the hidden tests and reference solutions, and the output folder holds other
// tasks' work. Neither is mounted in a sandbox. Refuse locations that a mount would expose anyway.
for (const [what, p] of [["POLYGLOT", POLYGLOT], ["--out", OUT]] as const) {
  const real = existsSync(p) ? realpathSync(p) : p;
  if (!ORACLE && !real.startsWith("/tmp/")) throw new Error(`${what} must be under /tmp, which sandboxes replace with an empty folder (got ${p})`);
  const exposed = VISIBLE.find((d) => real === d || real.startsWith(d + "/"));
  if (exposed) throw new Error(`${what} (${p}) is inside ${exposed}, which agents can read`);
}
if (SOCK) {
  // The socket's folder is mounted in every agent's sandbox, so it must hold the socket and nothing else.
  const dir = realpathSync(dirname(SOCK));
  const others = readdirSync(dir).filter((f) => f !== basename(SOCK));
  if (others.length) throw new Error(`the proxy socket's folder must contain only the socket (found ${others.slice(0, 3).join(", ")} in ${dir})`);
  for (const p of [OUT, POLYGLOT]) if (existsSync(p) && (realpathSync(p) + "/").startsWith(dir + "/")) throw new Error(`${p} is inside the proxy socket's folder, which agents can read`);
}

mkdirSync(OUT, { recursive: true });
if (SELFTEST) {
  const ok = await selftest();
  console.log(ok ? "selftest passed" : "selftest FAILED: do not trust results from this setup");
  process.exit(ok ? 0 : 1);
}

if (args["box-exec"]) {
  // Debugging aid: run one shell command exactly as the first listed agent would be run, and show its output.
  const dir = join(OUT, `box-exec-${process.pid}`);
  const state = ["ws", "cache", "config", "galley-data"].map((n) => (mkdirSync(join(dir, n), { recursive: true }), join(dir, n)));
  const r = await runInAgentBox(["bash", "-c", args["box-exec"]], { agent: AGENTS[0]!, ws: state[0]!, state: state.slice(1), env: { ...baseEnv(dir), ...keyEnv(), XDG_CONFIG_HOME: join(dir, "config"), GALLEY_DATA_DIR: join(dir, "galley-data") }, timeoutMs: AGENT_TIMEOUT, stdout: join(dir, "out.log") });
  process.stdout.write(readFileSync(join(dir, "out.log"), "utf8"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(r.code ?? 1);
}

const all = tasks();
const resultsFile = join(OUT, ORACLE ? "oracle.jsonl" : "results.jsonl");
const done = new Set(existsSync(resultsFile) ? readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.agent}/${r.lang}/${r.name}`; }) : []);
const jobs = (ORACLE ? ["oracle"] : AGENTS).flatMap((agent) => all.map((t) => ({ agent, t }))).filter((j) => !done.has(`${j.agent}/${j.t.lang}/${j.t.name}`));
// Interleave agents so all of them see the same API conditions over time.
jobs.sort((a, b) => all.indexOf(a.t) - all.indexOf(b.t) || a.agent.localeCompare(b.agent));
console.log(`${jobs.length} runs (${all.length} tasks × ${ORACLE ? 1 : AGENTS.length} agents), concurrency ${CONC}`);

/** Delete build outputs and caches after grading (Rust targets alone are ~100 MB per task); keep logs and sessions. */
function pruneArtifacts(dir: string) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (["target", "cache", "xdg-cache", "node_modules", "__pycache__"].includes(e.name)) rmSync(p, { recursive: true, force: true });
    else pruneArtifacts(p);
  }
}

/** Refuse to start a job when the disk is nearly full: a full disk silently turns runs into failures. */
function assertDiskSpace() {
  const st = statfsSync(OUT);
  const freeGb = (st.bavail * st.bsize) / 1e9;
  if (freeGb < 3) throw new Error(`only ${freeGb.toFixed(1)} GB free in ${OUT}; stopping so results aren't corrupted`);
}

let finished = 0;
let infraErrors = 0;
await pool(jobs, CONC, async ({ agent, t }) => {
  assertDiskSpace();
  const run = join(OUT, "runs", agent, t.lang, t.name);
  const ws = join(run, "ws");
  // Start every attempt from an empty folder: nothing from an earlier attempt (logs, graded tests) is left.
  rmSync(run, { recursive: true, force: true });
  mkdirSync(run, { recursive: true });
  prepare(t, ws);
  let a = { code: 0 as number | null, timedOut: false, ms: 0 };
  const started = Date.now();
  if (agent === "oracle") {
    // Sanity check of the harness: the reference solution must pass.
    for (let k = 0; k < t.files.solution.length && k < t.files.example.length; k++) cpSync(join(t.dir, t.files.example[k]!), join(ws, t.files.solution[k]!));
  } else a = await runAgent(agent, t, ws, run);
  // If the agent never got an answer from the model (proxy down, key rejected), the run says nothing about
  // the agent: fail loudly instead of recording a failed task.
  if (agent !== "oracle") {
    const log = existsSync(join(run, "agent.log")) ? readFileSync(join(run, "agent.log"), "utf8") : "";
    const unreachable = SOCK !== undefined && log.includes("Internal Server Error") && log.includes(new URL(PROXY).host);
    if (unreachable || modelAnswers(`${agent}__${t.lang}__${t.name}`, started) === 0) {
      infraErrors++;
      console.error(`infrastructure error: ${agent} ${t.lang}/${t.name} got no answer from the model; not recording a result`);
      return;
    }
  }
  const g = await grade(t, ws, run);
  pruneArtifacts(run);
  const r = { agent, lang: t.lang, name: t.name, pass: g.code === 0 && !g.timedOut, agentExit: a.code, agentTimedOut: a.timedOut, agentMs: a.ms, gradeExit: g.code, startedAt: started };
  appendFileSync(resultsFile, JSON.stringify(r) + "\n");
  finished++;
  console.log(`[${finished}/${jobs.length}] ${agent.padEnd(8)} ${t.lang}/${t.name}: ${r.pass ? "PASS" : "fail"} (${Math.round(a.ms / 1000)}s${a.timedOut ? ", timed out" : ""})`);
});
console.log(infraErrors ? `done, with ${infraErrors} infrastructure errors (run again to retry those tasks)` : "done");
