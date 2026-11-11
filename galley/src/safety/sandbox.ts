// Run shell commands inside an OS sandbox: workspace writable (read-only in plan mode), .git read-only,
// network off unless granted, secrets stripped from the environment.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type SandboxKind = "bwrap" | "seatbelt" | "none";

export interface ExecOptions {
  cwd: string;
  workspace: string;
  readOnly: boolean;
  network: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  kind: SandboxKind;
  /** Writable directory for build caches (Go, pip, npm…), kept between commands. */
  cacheDir?: string;
}

export interface ExecResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

let detected: SandboxKind | undefined;

/** Find a working sandbox on this machine (checked once per process). */
export function detectSandbox(): SandboxKind {
  if (detected) return detected;
  detected = "none";
  if (process.platform === "linux") {
    const r = spawnSync("bwrap", ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--unshare-net", "true"], { timeout: 5000 });
    if (r.status === 0) detected = "bwrap";
  } else if (process.platform === "darwin") {
    const r = spawnSync("sandbox-exec", ["-p", "(version 1)(allow default)", "true"], { timeout: 5000 });
    if (r.status === 0) detected = "seatbelt";
  }
  return detected;
}

const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;

export function scrubEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !SECRET_ENV.test(k)) out[k] = v;
  return out;
}

/** Point common tool caches at the writable cache dir (the home directory is read-only in the sandbox). */
export function cacheEnv(cacheDir: string): Record<string, string> {
  return {
    XDG_CACHE_HOME: cacheDir,
    GOCACHE: join(cacheDir, "go-build"),
    PIP_CACHE_DIR: join(cacheDir, "pip"),
    npm_config_cache: join(cacheDir, "npm"),
    PYTHONPYCACHEPREFIX: join(cacheDir, "pycache"),
  };
}

export function bwrapArgs(o: Pick<ExecOptions, "cwd" | "workspace" | "readOnly" | "network" | "cacheDir">, command: string): string[] {
  const ws = realpathSync(o.workspace);
  const args = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp"];
  if (o.cacheDir) args.push("--bind", o.cacheDir, o.cacheDir);
  args.push(o.readOnly ? "--ro-bind" : "--bind", ws, ws);
  if (existsSync(join(ws, ".git"))) args.push("--ro-bind", join(ws, ".git"), join(ws, ".git"));
  if (!o.network) args.push("--unshare-net");
  args.push("--unshare-pid", "--die-with-parent", "--new-session", "--chdir", o.cwd, "bash", "-c", command);
  return args;
}

export function seatbeltProfile(o: Pick<ExecOptions, "workspace" | "readOnly" | "network" | "cacheDir">): string {
  const ws = realpathSync(o.workspace);
  const q = (s: string) => JSON.stringify(s);
  const rules = ["(version 1)", "(allow default)", "(deny file-write*)", '(allow file-write* (literal "/dev/null") (subpath "/private/tmp") (subpath "/private/var/folders"))'];
  if (o.cacheDir) rules.push(`(allow file-write* (subpath ${q(o.cacheDir)}))`);
  if (!o.readOnly) rules.push(`(allow file-write* (subpath ${q(ws)}))`, `(deny file-write* (subpath ${q(join(ws, ".git"))}))`);
  if (!o.network) rules.push("(deny network*)");
  return rules.join("");
}

export function exec(command: string, o: ExecOptions): Promise<ExecResult> {
  let file: string;
  let args: string[];
  if (o.kind === "bwrap") {
    file = "bwrap";
    args = bwrapArgs(o, command);
  } else if (o.kind === "seatbelt") {
    file = "sandbox-exec";
    args = ["-p", seatbeltProfile(o), "bash", "-c", command];
  } else {
    file = "bash";
    args = ["-c", command];
  }
  return new Promise((resolveP) => {
  const sandboxed = o.kind !== "none";
  const env: Record<string, string> = { ...scrubEnv(process.env), ...(o.cacheDir && sandboxed ? cacheEnv(o.cacheDir) : {}) };
  // Without network, tell package managers to use their caches and fail fast instead of retrying.
  if (sandboxed && !o.network) Object.assign(env, { CARGO_NET_OFFLINE: "true", GOPROXY: "off", npm_config_offline: "true" });
    const child = spawn(file, args, { cwd: o.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const onData = (b: Buffer) => {
      if (output.length < 2_000_000) output += b.toString();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const kill = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, o.timeoutMs);
    o.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveP({ output: `failed to start: ${err.message}`, exitCode: null, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ output, exitCode: code, timedOut });
    });
  });
}
