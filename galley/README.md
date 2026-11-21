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
| Cost | Any model | Short system prompt that is identical in every project (so it and the tool list are served from the provider's cache across sessions), Anthropic prompt caching, **per-turn and per-session cost and cache-hit reporting**, auto-compaction |
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
| DeepSeek | `deepseek/deepseek-flash` (`deepseek/deepseek-v4-pro` is an older, weaker and dearer model) | `DEEPSEEK_API_KEY` |
| Qwen (DashScope) | `qwen/qwen3-coder-plus` | `DASHSCOPE_API_KEY` |
| Kimi (Moonshot) | `moonshot/kimi-k2.5` | `MOONSHOT_API_KEY` |
| GLM (Z.ai) | `zai/glm-5.2` | `ZAI_API_KEY` |
| OpenRouter, OpenAI, Groq | `openrouter/<vendor>/<model>` and so on | `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY` |
| Local | `ollama/qwen3-coder`, `vllm/<model>` | none |
| Any OpenAI-compatible API | add it under `providers` | your choice |

The non-Anthropic model names are examples; check your provider's current model list.

For Anthropic models, Galley uses adaptive thinking with an explicit effort level (`"effort"`, default `medium`: on Claude Sonnet 5.5 it scored the same as `high` in our benchmark at 15% lower cost), caches the system prompt and conversation, streams tool inputs eagerly and validates them before running, and turns on the API's server-side refusal fallbacks for the models that support them. Thinking blocks are replayed unchanged. You can turn off fallbacks per provider in code (`AnthropicProvider({ fallbacks: false })`).

For DeepSeek, Galley sends the model's earlier reasoning back between tool calls, as DeepSeek's thinking mode expects. In our benchmark this changed neither pass rate nor cost. Turn it off with `"sendReasoning": false` under `providers.deepseek`; other OpenAI-compatible providers get it only if you set it to `true`. To trade some accuracy for cost and speed, set `"reasoningEffort": "low"` there (or `"effort": "low"` at the top level): in our benchmark it cut cost by 44% and scored about 3 points lower.

Sub-agents (`task`) are for searching a large codebase. They run at low effort whatever the main agent uses: in the benchmark a cheap model launched helpers to "recall" hidden tests from memory, and they spent 6% of all of Galley's cost thinking about it.

## Using more than one model

One model does the work. Others can help in five ways, all off unless you configure them:

| Setting | What it does | When the other model is used |
|---|---|---|
| `smallModel` | Helpers (`task`) and compaction run on a cheaper model | Always, for those jobs |
| `planModel` | Plan mode uses this model; build mode uses `model` | While in `/plan` |
| `advisor` | A second model reads the session and gives short advice. It runs nothing, and the main model keeps its context and its cached prompt | When Galley sees the turn going badly, when the main model asks through the `advise` tool, and, with `"review": true`, once before a turn that changed files ends |
| `escalateModel` | A stronger model takes over the rest of the turn; the next turn starts on `model` again. It starts from the request and the files as they now stand, not from the other model's attempt (`"escalateContext": "transcript"` hands it the whole session instead) | When the trouble comes back after the advisor's advice, or at the first sign of it if there is no advisor |
| `fallbackModels` | Another model serves the rest of the turn | When the provider keeps failing (dropped connections, time-outs, rate limits, server errors) after three tries |

**How Galley knows a turn is going badly.** It does not ask the model. It reads what the tools returned:

- the same command has failed three times in a row;
- the same call has returned the same result three times;
- four calls in a row were refused (bad arguments, text to replace not found);
- two thirds of the step limit are used and the work is not finished.

These signals are recorded in the session file each time one fires. Replayed over 5,904 earlier benchmark runs on small tasks, they fired on 1.2% of failing runs and 0.4% of passing ones: on small tasks they are almost silent, and within one task no better than chance. Whether they carry information on long tasks is not yet measured ([`bench/signals.ts`](../bench/signals.ts), [improvement log](../bench/IMPROVEMENT_LOG.md)).

**What Galley knows about models.** `galley models` (or `/models`) prints, for each model it has a profile of, the share of hard terminal tasks it solved on the Terminal-Bench 4.1 board, what a run cost there, and its prices. It then suggests roles for the models your keys can reach:

```text
For the keys that are set:
  main model   deepseek/deepseek-flash  (the cheapest per run that solves at least half of what the strongest does: 38.5%, $0.56 a run)
  advisor      anthropic/claude-opus-5-5  (27 points stronger; consult it on hard decisions rather than handing the session over)
  avoid        deepseek/deepseek-v4-pro  (weaker and dearer: 6.7% against 38.5% for deepseek/deepseek-flash)
```

- **What the model that takes over reads:** the current request; the earlier requests of the session with the answer that ended each (for a `--steps` plan, the plan); why it was brought in; and what has changed, from git's status and diff where the workspace is a repository, otherwise from the file tools' record. If its own part of the session grows past `compactAt`, that part alone is compacted.
- **The model that takes over does not read the attempt that went wrong.** In a controlled study on SWE-bench Verified, a stronger model that inherited the transcript recovered 36 to 47% of what it adds on its own, at a higher price; given only the request and the edits, 64 to 84% ([the second survey](../research/reports/Multi%20model%20methods%20further%20areas.md), area 1). Not yet measured in Galley.
- **Galley will not hand a turn to a model its profiles say is not stronger.** A second try by the same model does about as much, for less.
- **Nothing finer is recorded** (which model for debugging, which for front-end work), because no public source measures it. Add or correct profiles under `"models"` in `galley.json`.
- **A switch has a price, and Galley states it.** The new model reads the whole session with nothing cached. `/model` shows the amount before you switch. A change of `/effort` costs the same re-read: each effort level has a cache of its own (measured on DeepSeek).
- **`/cost` lists each model's share** once a session has used more than one.

```jsonc
{
  "model": "deepseek/deepseek-flash",
  "advisor": { "model": "anthropic/claude-opus-5-5", "maxUses": 3, "review": false, "tool": true },
  "escalateModel": "anthropic/claude-opus-5-5",
  "fallbackModels": ["anthropic/claude-haiku-5-5"]
}
```

### A worker and a reviewer, on small steps

One arrangement of the above: a cheap model does the work and a stronger one checks each finished piece before the run moves on.

```bash
galley run "task" -m deepseek/deepseek-flash --reviewer anthropic/claude-sonnet-5-5 --steps --observe 5
```

- **`--reviewer <model>`** makes that model the advisor and has it review every finished unit of work. It is also consulted when a turn goes badly. The worker gets no tool to call it: the reviewer speaks when it has something to say.
- **`--steps`** (or `"steps": true`, or `/steps <task>` in a session) cuts the task into small units. The worker first plans without changing anything and replies with a numbered list. Each step is then a turn of its own, so `/undo` takes back one step at a time. A plan of one step runs as a single unit.
- **The reviewer checks the plan first.** The plan is the weaker model's, and a poor plan costs more than none. The reviewer sees what the worker looked at and its plan, and replies once; the worker revises the plan or keeps it, and only then starts.
- **`--observe <n>`** (or `"every": n` under `advisor`) has the reviewer also look in on the work every `n` steps of a turn. A look that finds nothing puts the next one two steps later, up to four times `n`; a look that finds something brings the next one back to `n`. A look is skipped when a sign of trouble has already brought the reviewer in. Up to eight consultations a turn in this mode.
- **What the reviewer reads for a step:** the task, the plan, that step's work, and a diff of what the step changed. Not the earlier steps. That keeps each review short. If it finds problems, they go back to the worker before the next step starts; if not, the run goes on without a word.
- **Without `--steps`** the unit is the whole task: one review when the worker says it has finished.
- **Cost:** one request to the reviewer for the plan, one for each step that changed files, and one for each look. With a reviewer that costs 13 times as much per token as the worker, three reviews can cost more than the rest of a small task. It suits long tasks, where the worker's many steps dominate the bill.

The choices in this mode follow published research: a reviewer stronger than the worker, a review in a fresh context, one round only, guidance during the run at an interval that adapts, and the stronger model checking the plan. The studies and their limits are in [`research/multi-model-methods.md`](../research/multi-model-methods.md).

**Status: tested, not yet measured.** The mechanics are covered by tests and by a few real runs. Whether they raise the pass rate on real tasks, and at what cost, has not been measured. The evidence from other harnesses says to expect a small gain where the second model is clearly stronger and the signals fire, and a loss of money where it is not: see [`research/model-switching.md`](../research/model-switching.md). On small tasks one consult of a strong model can cost more than the whole task on a cheap one.

## Checking the work: `--check`

```bash
galley run "fix the date parser" --check "npm test"
galley run "fix the date parser" --check auto     # the project's own test command
```

`--check auto` uses the test command the project declares: a Makefile `test` target, a `package.json` test script (run with npm, pnpm, yarn or bun, by the lock file), `cargo test`, `go test ./...`, `mix test`, or pytest where the project configures it or has test files. Galley says which it found. Without `--check`, `galley run` mentions a test command it finds. The command must work offline: the sandbox has no network.

When a turn that changed files ends (through the file tools, or a command that left the workspace different), Galley runs the check command in the sandbox with the network off; without a sandbox it asks first, as `bash` does. If the check fails, its output goes back to the model, which fixes the cause and stops again, and the check runs again. Up to three failures a turn (`checkRounds`) are fed back; if it still fails after that, or no step is left, the turn ends with a warning. A check may run for 300 seconds (`checkTimeout`; 0 or a value that is not a positive number means the default); the end of its output, where test runners print their summary, is what is kept. The steps of a `--steps` plan are checked together after the last one.

- **A check that keeps failing hands the turn to `escalateModel`,** after two failed checks in a turn (`escalateOnCheck`; 0 never). The stronger model is shown the failure, and its own fix is checked like any other. A failing check is a real sign that the turn is going wrong; the trouble signals that also hand over were measured to be no better than chance at telling a failing run from a passing one.
- **The model is told not to edit tests or special-case their inputs, and that it may say a test is wrong instead.** In one study, giving the model that way out cut gaming of tests from 54% to 9%.
- **A reviewer reads the check's output beside the diff,** so its review rests on something that ran.
- **Every check run is recorded in the session file,** so that how many rounds turns need can be measured (`bench/calibrate.ts`).
- **`"lessons": true` keeps what a project teaches,** only when the project's check proves it. When a check that failed comes to pass, Galley asks the helper model for one sentence: what caused the failure and what fixed it, as advice about the project. Notes are kept with the original repository, also when the work runs in a `--worktree`. At the start of a later session Galley reads back at most one such note: the one that shares the most with the request, if any does, and never one about files that are gone. The note is marked as possibly out of date. Off by default and not measured: memory written and read by the same model added 2 to 6 points in published work, one retrieved note did better than several, and notes nothing had checked did harm.
- **Why:** running code is the one feedback that does not rest on a model's opinion. Given human-written tests as the target, one agent solved 94.3% of SWE-bench Verified; writing its own, 68.0%. Feeding back the output of tests the agent could not see raised Galley's own pass rate by 24 to 49 points on a second attempt ([galley-against-the-field.md](../research/galley-against-the-field.md)). With the project's own visible tests the gain is what the model fails to do unprompted, which is not measured.

## Using it

**Interactive commands:** `/plan`, `/build`, `/undo`, `/model <ref>`, `/models`, `/effort <level>`, `/advisor <ref|off>`, `/steps <task>`, `/cost`, `/sessions`, `/init`, `/exit`. Ctrl-C cancels a running turn.

**CLI:**

```bash
galley run "task" [--plan] [--yes] [--json] [--worktree] [--detach]
galley run "task" -m deepseek/deepseek-flash --advisor anthropic/claude-opus-5-5 [--escalate <model>] [--effort high]
galley run "task" -m deepseek/deepseek-flash --reviewer anthropic/claude-sonnet-5-5 --steps   # a worker and a reviewer, step by step
galley run "task" --check "pytest -q"   # run the project's tests when the model stops; failures go back to it
galley models                         # what is known about each model, and roles for the keys you have
galley -s <session-id> [--fork]       # resume, or branch off a session
galley sessions                       # id, cost, status, title
galley show <session-id>              # replay a transcript
galley init                           # write AGENTS.md
galley trust                          # use this workspace's galley.json in full, as it is now
galley serve --port 4096              # HTTP + SSE server (see below)
```

- **`--worktree`** works on a new branch `galley/<session>` in a separate git worktree, so your checkout stays untouched.
- **`--detach`** runs in the background. Background runs can't ask for approval, so anything that would ask is refused unless you pass `--yes`. Rules marked `deny` always apply.
- **`--json`** prints every event as a JSON line, for CI.

## Configuration: `galley.json`

```jsonc
{
  "model": "deepseek/deepseek-flash",
  "smallModel": "deepseek/deepseek-flash",      // sub-agents and compaction
  "planModel": "anthropic/claude-opus-5-5",     // optional: plan mode only
  "effort": "medium",
  "permission": {
    "edit": "allow",
    "bash": { "*": "allow", "git push*": "ask", "rm -rf *": "ask", "sudo *": "deny" },
    "mcp_*": "ask"
  },
  "network": "ask",          // approval policy for commands that request network access
  "sandbox": "auto",         // "off" runs commands unsandboxed (each one then asks)
  "compactAt": 120000,
  "check": "npm test",       // optional: run when a turn that changed files ends; failures go back to the model ("auto": the project's own)
  "escalateOnCheck": 2,      // with escalateModel: hand over after this many failed checks in a turn (0: never)
  "checkRounds": 3,
  "checkTimeout": 300,       // seconds
  "lessons": false,          // keep one-line notes when a failing check comes to pass, and read the most related one back
  "providers": { "mylab": { "baseURL": "http://gpu-box:8000/v1", "apiKeyEnv": "MYLAB_KEY" } },
  "mcp": { "github": { "command": "github-mcp-server", "args": ["stdio"] } },
  "pricing": { "mylab/coder-32b": { "input": 0, "output": 0 } }
}
```

**A workspace's `galley.json` is not trusted by default.** The model can write it (the workspace is writable from the sandbox), so from it Galley takes only settings that cannot start a program, send an API key elsewhere or loosen a rule: not `mcp`, `providers`, `sandbox`, `network`, `permission`, `check`, `checkTimeout`, `lessons` or `escalateContext`. It says which it left out. `galley trust` uses the file in full as it is now; any later change, by anyone, needs trusting again. Only a regular file can be trusted, not a link to one elsewhere. The user-wide config below is always used.

The user-wide config is `~/.config/galley/config.json`; `GALLEY_MODEL` overrides the model. Compound shell commands (`a && b | c`) are judged by their strictest part. Project instructions come from `AGENTS.md` (or `CLAUDE.md`).

**Git on the host.** To tell whether files changed and what changed, Galley runs git outside the sandbox, in a folder the model can write to. So it records the workspace's repository when it starts, before any model turn, and names it in every call: a `.git` the model makes later is never used. A repository is refused when its git folder lies anywhere the sandbox can write (inside the workspace other than `.git` itself, which the sandbox mounts read-only, or in Galley's own folder for the project), or when its own config, shared or per-worktree, sets any key outside a short list of keys known to run and fetch nothing (a list of harmless keys, not of dangerous ones: four reviews in a row each found a dangerous one the other kind of list had missed); that config is checked again before every call. A repository that ignores the workspace is not used either. System-wide and user-wide git config are not read, attributes in the worktree are ignored, submodules are not entered, no transport is allowed and nothing is fetched, and hooks, the file-system monitor, text conversion and external diff are switched off. Where git is not used, Galley looks at the files themselves.

**Near-miss tool calls are mended, not refused,** where the intent is certain: a `description` argument to `bash` is ignored, a `path` to `bash` that names a folder in the workspace runs the command there, and an `edit` without a path goes to the one file that contains the text to replace, when that is certain: every candidate file was searched (one the permission rules forbid reading counts as not searched), none was too large or unreadable, the scratch folder holds no copy, and the rules allow the edit. Lines are compared as edit compares them, trailing white space and carriage returns aside. The model is told what was assumed. In the kept benchmark runs 39 calls were refused for such slips.

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
  agent/loop.ts          model ⇄ tools loop, parallel read-only calls, sub-agents, compaction trigger, the model in use
  agent/signals.ts       signs that a turn is going badly, read from tool results
  agent/advisor.ts       what a second model is shown and asked
  agent/steps.ts         a task planned first and done in small steps, each a turn of its own
  agent/prompt.ts        short, cache-stable system prompt + AGENTS.md
  agent/compact.ts       summarize old turns without splitting tool calls from results
  provider/anthropic.ts  official SDK: streaming, adaptive thinking, caching, fallbacks
  provider/openai-compat.ts  one streaming adapter for every OpenAI-compatible API
  provider/models.ts     model profiles: measured strength, cost per run, when a switch is pointless
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
bun test          # 71 tests: providers (incl. the Anthropic SDK over a mocked stream), safety, real sandbox, tools, agent loop, server, MCP
bun run typecheck
```

**Status and limitations (v0.1):**
- The macOS Seatbelt profile is written but **has not been tested** (development ran on Linux).
- When Galley runs as root (common in containers and CI), sandboxed commands keep only the capabilities ordinary file handling needs. Before this was added, a command run as root could remount the filesystem read-write and leave the sandbox.
- When Galley itself runs inside a container or another sandbox that forbids mounting a new `/proc`, its sandbox falls back to sharing the surrounding one. Commands are confined in the same way, but they can see Galley's own process; `galley doctor` says when this is the case.
- There is no Windows sandbox; there, commands fall back to asking for approval every time.
- The Anthropic adapter is covered by tests against a mocked stream and has run against the live API only in the benchmark (Claude Sonnet 5.5, see `bench/RESULTS-clean.md`).
- Sandboxed commands can write only to the workspace and a private `/tmp`. The file tools (`read`, `write`, `edit`, `list`, `glob`, `grep`) reach that same `/tmp`, so a script the model saves there is the file its commands run; without a sandbox they stay inside the workspace. Tools that write caches in your home directory (for example `~/.cache`) fail inside the sandbox. Configurable extra writable paths are on the roadmap.
- DeepSeek prices are approximate; set your own under `pricing`.
- The terminal UI is a line-based prompt; a full-screen TUI, LSP, skills, web tools and the IDE and desktop apps are on the [roadmap](PLAN.md#4-roadmap).
