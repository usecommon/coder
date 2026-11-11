# Galley: Product & Architecture Plan

*Working name.* A galley is a ship's kitchen, which matches the research's "the model is the chef, the harness is the kitchen" framing. OpenCode asks third-party projects not to use "opencode" in their names, so we don't.

## 1. Positioning

OpenCode is the reference: an MIT-licensed, provider-agnostic agent with a client/server core and a polished terminal UI. Galley aims for **parity on OpenCode's core** and wins on three things OpenCode leaves open:

| Pillar | OpenCode today | Galley |
|---|---|---|
| **Safety-first** | Every tool is allowed by default; no sandbox (use Docker yourself) | OS sandbox on by default (bubblewrap on Linux, Seatbelt on macOS). File tools are confined to the workspace. Network is off unless approved. Plan mode makes the workspace read-only at the OS level. Edits can be undone per turn. |
| **Cheap and open models first** | Any provider; general prompts | Short system prompt and tool specs, a stable cacheable prefix, Anthropic prompt caching, cost and cache-hit tracking per session, truncated tool output, auto-compaction, presets for DeepSeek, Qwen, Kimi, GLM, OpenRouter, Ollama and vLLM |
| **Multi-agent and background work** | `@general` sub-agent | Parallel read-only sub-agents (`task` tool), detached background runs, git-worktree isolation, append-only session logs with fork and replay |
| **Parity** | TUI, server and SDK, plan/build agents, LSP, MCP, sessions, share, AGENTS.md | Phased: see roadmap |

**Target users:** developers who want a Claude Code or OpenCode style agent that is safe to point at untrusted repos, and cheap enough to run on open models all day.

## 2. Architecture

```
          ┌──────────── clients ────────────┐
          │ terminal REPL │ HTTP/SSE │ CLI  │   (later: TUI, IDE, desktop, web)
          └───────┬───────┴────┬─────┴──┬───┘
                  ▼            ▼        ▼
            ┌──────────── Agent core ────────────┐
            │ loop.ts: model ⇄ tools until done  │──► session/store (append-only JSONL)
            │ prompt.ts: lean system + AGENTS.md │──► events bus  ──► server SSE / UI
            │ compact.ts: summarize old turns    │
            └──────┬──────────────────────┬──────┘
                   ▼                      ▼
          ┌── Providers ──┐      ┌──── Tools ────┐
          │ anthropic (SDK)│     │ read write edit│
          │ openai-compat  │     │ list glob grep │
          │  deepseek qwen │     │ bash  task  mcp│
          │  kimi glm ...  │     └──────┬─────────┘
          │ mock (tests)   │            ▼
          └────────────────┘   ┌──── Safety ────────┐
                               │ permission rules   │ allow / ask / deny
                               │ path confinement   │ realpath within workspace
                               │ OS sandbox         │ bwrap / sandbox-exec
                               │ undo snapshots     │ per-turn restore
                               └────────────────────┘
```

**Key design decisions**
- **Provider-neutral message model.** Each assistant message also keeps the provider's raw content, so Anthropic thinking blocks are replayed unchanged, as preserved thinking requires.
- **Anthropic via the official SDK** (`@anthropic-ai/sdk`): streaming, adaptive thinking, an explicit effort setting, automatic prompt caching, server-side refusal fallbacks and eager tool-input streaming, with tool inputs validated before running. **Everything else** goes through a single OpenAI-compatible streaming adapter with per-vendor presets.
- **No runtime dependencies besides the Anthropic SDK.** Bun runs TypeScript directly; `bun build --compile` produces a single binary.
- **Safety lives in layers that don't trust the model.** Permission rules decide whether to act. Path confinement and the OS sandbox limit what an action can reach, even if the rules are wrong.
- **Sessions are append-only logs.** Resume, fork and replay come for free, and the logs feed cost reports and future evals.

## 3. MVP scope (v0.1, built in this repo)

- CLI: interactive REPL; `run` (headless, CI); `run --detach` (background); `run --worktree` (isolated git worktree); `serve` (HTTP and SSE); `sessions`; `show` (replay); `init` (write AGENTS.md); `cost`
- Agents: **build** (default) and **plan** (read-only; sandbox mounts the workspace read-only). Switch with `/plan` and `/build`.
- Tools: `read`, `write`, `edit`, `list`, `glob`, `grep`, `bash` (sandboxed), `task` (parallel read-only sub-agents), and MCP tools over stdio
- Providers: `anthropic/*`, `openai/*`, `deepseek/*`, `openrouter/*`, `qwen/*`, `moonshot/*`, `zai/*`, `groq/*`, `ollama/*`, `custom` OpenAI-compatible, `mock/*`
- Safety: rules with wildcards, an "ask" approval prompt, a dangerous-command list, network approval, `/undo`
- Cost: per-turn and per-session token, cache and dollar accounting; auto-compaction at a token threshold
- Config: `galley.json` in the project, `~/.config/galley/config.json`, environment variables

## 4. Roadmap

| Phase | Goal | Items |
|---|---|---|
| **0.2 Parity I** | Daily-driver UX | Full-screen TUI (diff view, approval panel); OpenAPI spec and generated TS SDK for the server; `/share` export; custom slash commands; skills (`SKILL.md`); web fetch and search tools |
| **0.3 Parity II** | Code intelligence | LSP client (diagnostics after edits, go-to-definition, references); formatters on write; MCP over HTTP/SSE; plugins and hooks |
| **0.4 Safety+** | Unattended runs | Auto-review approvals (a cheap model judges risky calls); network allowlist per host; Docker and remote sandboxes; secret redaction in logs; signed audit receipts |
| **0.5 Multi-agent** | Fleets | Agent teams on separate worktrees with a merge step; a scheduler (cron, GitHub and Slack triggers); a job dashboard; ACP so IDEs can host Galley and Galley can host other agents |
| **0.6 Cost** | Cheapest good result | Model routing (cheap model for exploring, strong model for editing); a cost budget per task; cache-hit diagnostics; a local benchmark harness (Terminal-Bench style) to tune prompts per model |
| **1.0** | Distribution | Desktop app (Tauri), VS Code extension, curated model list, telemetry-free by default, docs site |

## 5. Success metrics
- Terminal-Bench and SWE-bench style pass rate within 5 points of OpenCode on the same model
- At least 30% fewer tokens per solved task than OpenCode on DeepSeek and Qwen (lean prompt plus caching)
- Zero writes outside the workspace in a red-team suite (prompt-injected repos)
- Time from install to first useful edit under 2 minutes

## 6. Risks
- **Model variance:** tool calling is weaker on small local models. Mitigations: an edit tool tolerant of whitespace differences, clear tool errors, per-model prompt tweaks.
- **Sandbox portability:** bubblewrap needs user namespaces, and Windows has no equivalent here yet. Galley falls back to asking for approval of every command and says so.
- **Scope creep against a 200k-star incumbent.** Lead with the safety and cost wedge; reach parity in phases.
- **Provider policy changes** (for example Anthropic's 2026 rules on subscriptions in third-party tools). Galley uses API keys only.
