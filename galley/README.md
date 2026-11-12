# Galley

A safety-first, model-agnostic coding agent for the terminal, built to compete with [OpenCode](https://github.com/anomalyco/opencode). See [PLAN.md](PLAN.md) for the product plan and roadmap.

```
$ galley run "the test in test.js fails; fix it and confirm" -m deepseek/deepseek-v4-flash
I'll start by looking at the project structure and the test.
▸ list .
▸ read test.js
▸ read math.js
▸ edit math.js
▸ bash $ node test.js; echo "exit=$?"
  ✓ exit 0
Bug: add() used subtraction. Fixed to a + b. Verified: node test.js → tests pass.
— 7.9k in, 5.9k cached, 405 out, $0.0006
```
*(A real run against DeepSeek during development. The dollar figure uses Galley's approximate DeepSeek price table.)*

## Why Galley

| | OpenCode | Galley |
|---|---|---|
| Shell commands | Run directly on your machine | Run in an **OS sandbox** (bubblewrap on Linux, Seatbelt on macOS). The workspace is writable, `.git` is read-only, **the network is off** unless you approve it, and API keys and tokens are stripped from the environment. |
| File tools | All allowed by default | **Confined to the workspace**, with symlink escapes caught; writes into `.git` are blocked |
| Plan mode | Edits denied | Edits denied, **and** the sandbox mounts the workspace read-only |
| Mistakes | `/undo` | `/undo` restores every file changed in the last turn |
| Cost | Any model | Short system prompt, stable cacheable prefix, Anthropic prompt caching, **per-turn and per-session cost and cache-hit reporting**, auto-compaction |
| Parallel work | `@general` sub-agent | Parallel read-only **sub-agents**, **background runs** (`--detach`), **git-worktree isolation** (`--worktree`), forkable append-only session logs |

## Install and run

Requires [Bun](https://bun.sh) 1.1 or later. On Linux, install `bubblewrap` to get the sandbox (`apt install bubblewrap`).

```bash
cd galley && bun install
bun run src/cli.ts doctor                 # check sandbox, keys, ripgrep
bun run src/cli.ts                        # interactive
bun run src/cli.ts run "add a --verbose flag to the CLI"
bun run build && ./dist/galley --help     # single self-contained binary
```

## Models

Use `-m provider/model` or set `"model"` in `galley.json`.

| Provider | Example | Key |
|---|---|---|
| Anthropic (official SDK) | `anthropic/claude-opus-5-5` (default), `anthropic/claude-sonnet-5-5` | `ANTHROPIC_API_KEY` |
| DeepSeek | `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro` | `DEEPSEEK_API_KEY` |
| Qwen (DashScope) | `qwen/qwen3-coder-plus` | `DASHSCOPE_API_KEY` |
| Kimi (Moonshot) | `moonshot/kimi-k2.5` | `MOONSHOT_API_KEY` |
| GLM (Z.ai) | `zai/glm-5.2` | `ZAI_API_KEY` |
| OpenRouter, OpenAI, Groq | `openrouter/<vendor>/<model>` and so on | `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY` |
| Local | `ollama/qwen3-coder`, `vllm/<model>` | none |
| Any OpenAI-compatible API | add it under `providers` | your choice |

The non-Anthropic model names are examples; check your provider's current model list.

For Anthropic models, Galley uses adaptive thinking with an explicit effort level (`"effort"`, default `medium`: on Claude Sonnet 5.5 it scored the same as `high` in our benchmark at 15% lower cost), caches the system prompt and conversation, streams tool inputs eagerly and validates them before running, and turns on the API's server-side refusal fallbacks for the models that support them. Thinking blocks are replayed unchanged. You can turn off fallbacks per provider in code (`AnthropicProvider({ fallbacks: false })`).

For DeepSeek, Galley sends the model's earlier reasoning back between tool calls, as DeepSeek's thinking mode expects. In our benchmark this changed neither pass rate nor cost. Turn it off with `"sendReasoning": false` under `providers.deepseek`; other OpenAI-compatible providers get it only if you set it to `true`.

## Using it

**Interactive commands:** `/plan`, `/build`, `/undo`, `/model <ref>`, `/cost`, `/sessions`, `/init`, `/exit`. Ctrl-C cancels a running turn.

**CLI:**

```bash
galley run "task" [--plan] [--yes] [--json] [--worktree] [--detach]
galley -s <session-id> [--fork]       # resume, or branch off a session
galley sessions                       # id, cost, status, title
galley show <session-id>              # replay a transcript
galley init                           # write AGENTS.md
galley serve --port 4096              # HTTP + SSE server (see below)
```

- **`--worktree`** works on a new branch `galley/<session>` in a separate git worktree, so your checkout stays untouched.
- **`--detach`** runs in the background. Background runs can't ask for approval, so anything that would ask is refused unless you pass `--yes`. Rules marked `deny` always apply.
- **`--json`** prints every event as a JSON line, for CI.

## Configuration: `galley.json`

```jsonc
{
  "model": "deepseek/deepseek-v4-flash",
  "smallModel": "deepseek/deepseek-v4-flash",   // sub-agents and compaction
  "effort": "medium",
  "permission": {
    "edit": "allow",
    "bash": { "*": "allow", "git push*": "ask", "rm -rf *": "ask", "sudo *": "deny" },
    "mcp_*": "ask"
  },
  "network": "ask",          // approval policy for commands that request network access
  "sandbox": "auto",         // "off" runs commands unsandboxed (each one then asks)
  "compactAt": 120000,
  "providers": { "mylab": { "baseURL": "http://gpu-box:8000/v1", "apiKeyEnv": "MYLAB_KEY" } },
  "mcp": { "github": { "command": "github-mcp-server", "args": ["stdio"] } },
  "pricing": { "mylab/coder-32b": { "input": 0, "output": 0 } }
}
```

The user-wide config is `~/.config/galley/config.json`; `GALLEY_MODEL` overrides the model. Compound shell commands (`a && b | c`) are judged by their strictest part. Project instructions come from `AGENTS.md` (or `CLAUDE.md`).

## Server API

`galley serve` serves the same agent core over HTTP on `127.0.0.1:4096`. Set `GALLEY_SERVER_PASSWORD` to require `Authorization: Bearer <password>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET / POST | `/sessions` | List sessions / create one |
| GET | `/sessions/:id` | Messages, usage and cost |
| POST | `/sessions/:id/messages` `{text, mode?}` | Run a turn (waits for it to finish) |
| POST | `/sessions/:id/abort`, `/sessions/:id/undo` | Cancel the turn / revert its file changes |
| GET | `/events` | Server-sent events: text, tool calls, usage, and `approval_request` |
| POST | `/approvals/:id` `{answer: "once" \| "always" \| "deny"}` | Answer an approval request |

## Architecture

```
src/
  cli.ts                 commands, background runs, worktrees
  agent/loop.ts          model ⇄ tools loop, parallel read-only calls, sub-agents, compaction trigger
  agent/prompt.ts        short, cache-stable system prompt + AGENTS.md
  agent/compact.ts       summarize old turns without splitting tool calls from results
  provider/anthropic.ts  official SDK: streaming, adaptive thinking, caching, fallbacks
  provider/openai-compat.ts  one streaming adapter for every OpenAI-compatible API
  safety/permission.ts   allow/ask/deny rules, compound-command splitting, approval queue
  safety/paths.ts        workspace confinement (realpath), .git write protection
  safety/sandbox.ts      bubblewrap / Seatbelt, network off, secret scrubbing, timeouts
  tools/                 read list glob grep edit write bash task + undo log
  mcp/client.ts          MCP stdio client
  session/store.ts       append-only JSONL sessions: resume, fork, replay, cost
  server/http.ts         HTTP + SSE server with remote approvals
  ui/                    terminal rendering and interactive prompt
```

## Development

```bash
bun test          # 61 tests: providers (incl. the Anthropic SDK over a mocked stream), safety, real sandbox, tools, agent loop, server, MCP
bun run typecheck
```

**Status and limitations (v0.1):**
- The macOS Seatbelt profile is written but **has not been tested** (development ran on Linux).
- When Galley runs as root (common in containers and CI), sandboxed commands keep only the capabilities ordinary file handling needs. Before this was added, a command run as root could remount the filesystem read-write and leave the sandbox.
- When Galley itself runs inside a container or another sandbox that forbids mounting a new `/proc`, its sandbox falls back to sharing the surrounding one. Commands are confined in the same way, but they can see Galley's own process; `galley doctor` says when this is the case.
- There is no Windows sandbox; there, commands fall back to asking for approval every time.
- The Anthropic adapter is covered by tests against a mocked stream but has not been run against the live API yet.
- Sandboxed commands can write only to the workspace and a private `/tmp`. Tools that write caches in your home directory (for example `~/.cache`) fail inside the sandbox. Configurable extra writable paths are on the roadmap.
- DeepSeek prices are approximate; set your own under `pricing`.
- The terminal UI is a line-based prompt; a full-screen TUI, LSP, skills, web tools and the IDE and desktop apps are on the [roadmap](PLAN.md#4-roadmap).
