// Command-line arguments: a command, its positional words and its options.

export interface Args {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

const SHORT: Record<string, string> = { m: "model", s: "session", y: "yes", h: "help" };
const VALUED = new Set(["model", "session", "session-id", "cwd", "port", "hostname", "advisor", "reviewer", "observe", "escalate", "effort", "check"]);
const COMMANDS = new Set(["run", "serve", "sessions", "show", "init", "doctor", "models", "help"]);

/** Options start with a dash and hold no whitespace: a task that begins with dashes (pasted test output, a list)
 *  is a task. A bare `--` ends the options, as usual. */
export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!/\s/.test(a) && (a.startsWith("--") || (a.startsWith("-") && a.length === 2))) {
      let key = a.startsWith("--") ? a.slice(2) : (SHORT[a.slice(1)] ?? a.slice(1));
      let val: string | boolean = true;
      if (key.includes("=")) [key, val] = [key.slice(0, key.indexOf("=")), key.slice(key.indexOf("=") + 1)];
      else if (VALUED.has(key)) val = argv[++i] ?? "";
      flags[key] = val;
    } else positional.push(a);
  }
  const cmd = positional[0] && COMMANDS.has(positional[0]) ? positional.shift()! : "chat";
  return { cmd, positional, flags };
}
