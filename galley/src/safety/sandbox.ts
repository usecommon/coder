// Run shell commands inside an OS sandbox: workspace writable (read-only in plan mode), .git read-only,
// network off unless granted, secrets stripped from the environment.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
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
  /** Private directory mounted at /tmp, so scratch files persist between commands without touching the host's /tmp. */
  tmpDir?: string;
}

export interface ExecResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

let detected: SandboxKind | undefined;

// Run as root, bubblewrap leaves root's capabilities with the sandboxed command, which could then undo the
// sandbox: remount the read-only filesystem read-write, unmount the private /tmp, or create a device node for
// the host disk. So as root, keep only the capabilities ordinary file handling needs (tar restoring owners,
// writing files owned by other users) and drop everything else, CAP_SYS_ADMIN and CAP_MKNOD included.
// Other users need nothing: bubblewrap already runs their commands without capabilities.
const ROOT_KEEP_CAPS = ["CAP_CHOWN", "CAP_DAC_OVERRIDE", "CAP_FOWNER", "CAP_FSETID", "CAP_KILL", "CAP_SETUID", "CAP_SETGID", "CAP_NET_BIND_SERVICE"];

export function privilegeArgs(uid: number | undefined = process.getuid?.()): string[] {
  return uid === 0 ? ["--cap-drop", "ALL", ...ROOT_KEEP_CAPS.flatMap((c) => ["--cap-add", c])] : [];
}

/** How the sandbox gets its /proc.
 *  "own": a fresh /proc with a private process list (the normal case).
 *  "shared": the surrounding /proc. Used when Galley itself runs inside a container or another sandbox, where
 *  mounting a new /proc is not allowed. Commands are confined as usual, but they can see Galley's own process. */
export type ProcMode = "own" | "shared";
let procMode: ProcMode = "own";
export const sandboxProcMode = (): ProcMode => procMode;
const procArgs = (m: ProcMode) => (m === "own" ? ["--proc", "/proc", "--unshare-pid"] : ["--bind", "/proc", "/proc"]);

/** Find a working sandbox on this machine (checked once per process). */
export function detectSandbox(): SandboxKind {
  if (detected) return detected;
  detected = "none";
  if (process.platform === "linux") {
    // Probe with the same arguments real commands get: if they can't be applied, there is no sandbox.
    const forced = process.env.GALLEY_SANDBOX_PROC as ProcMode | undefined;
    for (const m of forced === "own" || forced === "shared" ? [forced] : (["own", "shared"] as const)) {
      const r = spawnSync("bwrap", ["--ro-bind", "/", "/", "--dev", "/dev", ...procArgs(m), "--unshare-net", ...privilegeArgs(), "true"], { timeout: 5000 });
      if (r.status !== 0) continue;
      detected = "bwrap";
      procMode = m;
      break;
    }
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

export function bwrapArgs(o: Pick<ExecOptions, "cwd" | "workspace" | "readOnly" | "network" | "cacheDir" | "tmpDir">, command: string): string[] {
  const ws = realpathSync(o.workspace);
  const args = ["--ro-bind", "/", "/", "--dev", "/dev", ...procArgs(procMode)];
  args.push(...(o.tmpDir ? ["--bind", o.tmpDir, "/tmp"] : ["--tmpfs", "/tmp"]));
  if (o.cacheDir) args.push("--bind", o.cacheDir, o.cacheDir);
  args.push(o.readOnly ? "--ro-bind" : "--bind", ws, ws);
  if (existsSync(join(ws, ".git"))) args.push("--ro-bind", join(ws, ".git"), join(ws, ".git"));
  if (!o.network) args.push("--unshare-net");
  args.push(...privilegeArgs());
  // With its own process list, everything a command started dies with the sandbox. Without one ("shared"),
  // Galley has to find those processes itself, so the command stays in the session Galley started it in.
  args.push("--die-with-parent", ...(procMode === "own" ? ["--new-session"] : []), "--chdir", o.cwd, "bash", "-c", command);
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

/** Session id of a process, from /proc (Linux). */
function sessionOf(pid: number | "self"): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[3]); // state ppid pgrp session …
  } catch {
    return undefined;
  }
}

/** Kill every process in a session. A process can leave its process group (the `timeout` command does), but
 *  it stays in its session unless it deliberately starts a new one. */
function killSession(sid: number) {
  if (sid === sessionOf("self")) return; // never our own
  let pids: string[] = [];
  try {
    pids = readdirSync("/proc").filter((e) => /^\d+$/.test(e));
  } catch {}
  for (const pid of pids) {
    if (sessionOf(Number(pid)) !== sid) continue;
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {}
  }
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
  // A read-only workspace can't hold build output; send Cargo's target dir to the cache.
  if (sandboxed && o.readOnly && o.cacheDir) env.CARGO_TARGET_DIR = join(o.cacheDir, "cargo-target-ro");
  if (sandboxed && !o.network) Object.assign(env, { CARGO_NET_OFFLINE: "true", GOPROXY: "off", npm_config_offline: "true" });
    const child = spawn(file, args, { cwd: o.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const onData = (b: Buffer) => {
      if (output.length < 2_000_000) output += b.toString();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    // Stop the command and everything it started. A leftover process (a hung test, a server started with &)
    // would otherwise keep the output pipes open, and the agent would wait on it.
    // The command runs in a session of its own (it was started detached). Note that now, while its first
    // process is alive: the session outlives that process for as long as anything it started is still running.
    const ownSession = child.pid !== undefined && sessionOf(child.pid) === child.pid;
    const stopAll = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
      // No private process list to tear down: find what is left in the command's session.
      if (o.kind === "bwrap" && procMode === "shared" && ownSession) killSession(child.pid!);
    };
    let settled = false;
    const finish = (r: ExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveP(r);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stopAll();
    }, o.timeoutMs);
    o.signal?.addEventListener("abort", stopAll, { once: true });
    child.on("error", (err) => finish({ output: `failed to start: ${err.message}`, exitCode: null, timedOut }));
    child.on("exit", (code) => {
      // In a sandbox nothing outlives its command. Either way, don't wait long for pipes a leftover process holds.
      if (sandboxed) stopAll();
      setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish({ output, exitCode: code, timedOut });
      }, 1000).unref();
    });
    child.on("close", (code) => finish({ output, exitCode: code, timedOut }));
  });
}
