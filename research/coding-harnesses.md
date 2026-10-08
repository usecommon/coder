# Coding Harnesses: A Comparative Analysis

_Research compiled 2026-10-08. Star counts marked † were read directly from the GitHub repo page on that date; all others come from secondary sources (May–July 2026) and should be treated as approximate._

---

## 0. Framing: a model is not a harness

The two starting links are different kinds of thing, and that distinction organizes this report.

| Layer | What it is | Example |
|---|---|---|
| **Model** | The LLM weights that predict tokens. Decides *how smart* each step is. | `deepseek-ai/deepseek-coder`, Claude, GPT-5.x, Qwen, Kimi |
| **Harness** (agent / scaffold) | Everything around the model: the agent loop, tool definitions (read/edit/bash/search), context management and compaction, system prompt, permissions/sandbox, UI, session storage, integrations (MCP, LSP, git, CI). Decides *what the model can do and how safely*. | `anomalyco/opencode`, Codex CLI, Claude Code, Aider, Cline |

- **DeepSeek-Coder is a model family.** It ships no agent loop; you plug it *into* a harness.
- **OpenCode is a harness.** It ships no model; you plug any provider *into* it.
- **DeepSeek now ships its own harness too:** **DeepSeek Harness (`dsh`)**, `deepseek-ai/deepseek-harness`, released Aug 13, 2026 — see §1b. Its launch slogan is literally "Model + Harness = Agent".

Why the harness matters: on Terminal-Bench 2.0, the same model (e.g. GPT-5.3-Codex) scores differently under different agents (Droid 77.3% vs "Simple Codex" 75.1% in the March 2026 snapshot), and leaderboards explicitly score "harness + model as one system". Conversely, Amp's Feb 2026 essay "The Coding Agent Is Dead" argues frontier models have made the wrapper less decisive. Both effects are real; the harness matters most for safety, cost (token efficiency), ergonomics, and long-horizon reliability.

---

## 1. DeepSeek-Coder (deepseek-ai/deepseek-coder) — the model

**Type:** Open-weight code LLM family · **Repo license:** MIT (code) + DeepSeek Model License (weights, commercial use permitted) · **Stars:** ~24.3k† · **Paper:** arXiv 2401.14196 (first release Nov 2, 2023)

### Specs
| Item | Detail |
|---|---|
| Sizes | 1.3B, 5.7B, 6.7B, 33B (Base and Instruct) |
| Training | From scratch on **2T tokens**: 87% code, 13% natural language (EN + ZH) |
| Stage 1 | 1.8T tokens, 4K window (87% code / 10% code-related text — GitHub Markdown, StackExchange / 3% Chinese) |
| Stage 2 | +200B tokens at **16K** window → Base models |
| Stage 3 | Instruction tuning on 2B tokens → Instruct models |
| Data pipeline | Parses intra-repo file dependencies and concatenates dependent files; repo-level MinHash dedup; quality filtering |
| Context | 16K |
| Fill-in-the-middle | Yes (FIM training objective with begin/hole/end sentinel tokens) — ideal for editor autocomplete |
| Repo-level completion | Yes — completes a file using classes/functions defined in sibling files |
| Tokenizer | HF byte-level BPE (no direct SentencePiece conversion) |

### Benchmarks (as reported in the repo, pass@1)
- 33B-Base beats CodeLlama-34B by **+7.9%** HumanEval-Python, **+9.3%** HumanEval-Multilingual, **+10.8%** MBPP, **+5.9%** DS-1000.
- 6.7B-Base reaches CodeLlama-34B level.
- 33B-Instruct beats GPT-3.5-Turbo on HumanEval, comparable on MBPP.

### Tooling in the repo (not a harness)
Fine-tuning script (`finetune_deepseekcoder.py`, DeepSpeed ZeRO-3), a Gradio demo app, reproducible evaluation code, vLLM inference examples, GGUF/GPTQ quantization notes, chat template. Note the Instruct-for-completion gotcha: set `eos_token_id=32014` instead of the default 32021.

### Lineage (why the 2023 repo is now historical)
| Release | Date | Notes |
|---|---|---|
| DeepSeek-Coder | Nov 2023 | This repo. Dense, 16K, 86 languages |
| DeepSeek-Coder-V2 | ~Jun 2024 | MoE, continued from DeepSeek-V2 on +6T tokens; 236B (21B active) and 16B Lite (2.4B active); **128K** context; **338** languages; ~GPT-4-Turbo on code |
| DeepSeek-V3 | Dec 2024 | 671B / 37B active general model; coding folded into the main line |
| DeepSeek-R1 | Jan 2025 | Reasoning model |
| V3.1 / V3.2 | Aug / Dec 2025 | Hybrid think/non-think; V3.2 adds "thinking during tool use" — i.e. tuned for agent harnesses |
| DeepSeek-V4 (Pro / Flash) preview | Apr 2026 | API IDs `deepseek-v4-pro` / `deepseek-v4-flash`; reported 1M context; Anthropic-compatible endpoint; marketed as working with Claude Code, OpenCode, OpenClaw. Vendor-reported Terminal-Bench 2.0 ~67.9% (V4-Pro Max) — unverified independently |

**Takeaway:** DeepSeek stopped shipping a separate "Coder" line and instead optimizes its general models for *being driven by harnesses* (tool calling, Anthropic-compatible API). Today you'd use DeepSeek as the cheap/open-weight brain inside OpenCode, Pi, Cline, Aider, etc.

**Strengths:** fully open weights, self-hostable, FIM for autocomplete, very cheap API, strong for its size.
**Weaknesses (original repo):** 16K context, no tool calling, no agentic training; superseded by V2/V3/V4.

---

## 1b. DeepSeek Harness (`dsh`) — DeepSeek's official harness

**Repo:** [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) · **License:** MIT · **Stars:** ~245k† (repo page shows 245.5k stars, 29.4k forks, ~20.7k commits — an extraordinary count for a 2-month-old repo; treat as reported) · **Stack:** TypeScript monorepo (pnpm, tsdown, Vitest, oxlint; ~55 packages) + Python SDK · **Status:** developer preview — README warns "THERE WILL BE COMPATIBILITY-BREAKING CHANGES"

### Timeline
| Date | Event |
|---|---|
| May 15–20, 2026 | DeepSeek posts "Harness Product Manager" and "Harness R&D Engineer" jobs (Beijing) for a "DeepSeek Desktop Agent product"; named competitors: Claude Code, Cursor, Codex, Manus, Hermes, OpenClaw. Researcher Deli Chen announces a Harness team building a "Code Harness from the ground up". |
| Aug 13, 2026 | **v0.1 developer preview**, open-sourced under MIT |
| Sep 29–Oct 2, 2026 | **v0.2** (npm `latest` = `0.2.0-rc.2`): official desktop apps for macOS (Apple silicon; some reports also Intel) and Windows x64; Linux via npm/Web. All published versions so far are prereleases. |

### Architecture — "Everything is a Plugin"
- Built on **Cordis**, a plugin meta-framework (design paper with Peking University: *"A Programming Paradigm for Spatiotemporal Composability"*). Each registration is an effect that is unwound when its plugin unloads, so plugins can be hot-swapped mid-session.
- *Everything* is a plugin: model adapters, the agent loop, tools, skills, sessions, storage, sandbox, scheduling/jobs, collaboration, and the UI.
- **Profiles** choose which plugin bundles load at startup (built-ins: Web, headless, SDK, minimal SDK, ACP; custom profiles allowed). **Presets** choose which capabilities the agent sees.
- Entry points: `npx @deepseek-ai/dsh web` (Web UI at `127.0.0.1:3080`), desktop app (can install the `dsh` command), `dsh --profile headless "job"` for one-shot/CI runs, **Python SDK** (`pip install deepseek-harness-sdk`, JSON-RPC over stdio), `--dump-config`. Requires Node.js ≥22.19.

### Agent presets
| Preset | What the agent gets |
|---|---|
| **Standard** (default) | Full coding agent: read/write/edit, shell, grep/search, skills, planning, goals, subagents, workflows |
| **Code / PTC** (programmatic tool calling) | Standard + a Code Mode SDK: the model writes **TypeScript programs** that orchestrate many tool calls in one step (fewer round-trips; more side-effect risk) |
| **Minimal** | Only persistent bash + `str_replace_editor` — for benchmarking models; used for DeepSeek's reported Terminal-Bench score |
| **Creator** | Standard + runtime inspection; the agent can build, install, replace or remove plugins and author new presets *from chat* |

### Sessions, safety, integrations
- **Append-only, zstd-compressed JSONL session log** recording prompts, reasoning, tool calls/results, subagent work and injected context; **Trajectory view** to inspect, resume, **fork** (change one instruction and compare runs), search and replay.
- Permissions: default **workspace-write** policy plus approval prompts; sandbox plugin (Windows sandbox diagnostics in desktop app); experimental **auto-approval reviewer** plugin. DeepSeek itself says these "reduce risk but do not guarantee isolation"; per-OS sandbox mechanics are not documented in detail.
- **MCP**: `mcp` package and client exist, no MCP server enabled by default. **ACP** profile available.
- **Subagents** include optional profile bundles that register **Claude Code and Codex as external subagent providers** — dsh can orchestrate other vendors' harnesses.
- Experimental: agent teams, scheduled tasks (`schedule_create`), background jobs, voice input. Web UI previews Markdown, code, HTML, PDF, images, Office files, CSV.
- Plugin ecosystem: GitHub topic `dsh-plugin` (~100 community plugins listed; discovery only, no security review).

### Models
Default **DeepSeek V4.1 Flash** (V4 Pro optional); bundled provider catalogs for Anthropic, OpenAI, Moonshot (Kimi) and Z.ai (GLM); any OpenAI-compatible endpoint; model switch applies to the next request without restart. Reported API pricing (off-peak, via a reseller): V4.1 Flash ≈ $0.15/M input, $0.60/M output; V4 Pro ≈ $0.66/$1.98.

### Benchmarks
DeepSeek reports **82.7 on Terminal-Bench** for V4 Flash using the **Minimal** preset (secondary sources disagree on whether that's TB 2.0 or 2.1; no primary page found). That would put a DeepSeek model + its own minimal harness level with Codex + GPT-5.5. No SWE-bench results published for dsh. Because results depend on preset, comparisons across presets aren't valid.

### Strengths / weaknesses
- **+** Fully open (MIT) official harness from a frontier lab — unlike Claude Code (closed) and Codex (open core, closed IDE extension); the most radical modularity of any harness (hot-swappable plugins, agent can extend itself); excellent observability (Trajectory, forkable logs); multi-surface (desktop, web, headless, Python SDK); cheapest first-party model pairing.
- **−** Preview with breaking changes; GitHub Issues disabled on the repo (criticized); heavy always-on context (~13.5k input tokens on the first request of a trivial task); sandboxing weaker/less documented than Codex; plugin supply-chain risk is on the user; reported bugs (silent MSYS2 failures on Windows, hot-reload cache staleness, ~200 ms persistence lag); reviewers still rate Claude Code and Codex as more polished.

### Community DeepSeek-focused harnesses (unofficial)
| Project | Notes |
|---|---|
| **Codewhale** (`codewhale-hq/Codewhale`, formerly **DeepSeek-TUI** by Hunter Bown) | Rust, MIT, ~41k stars†. Began as a DeepSeek-V4 terminal agent, now provider-neutral (40+ routes, local via Ollama/vLLM/SGLang). Plan / Work / Operate modes; Ask / Auto-Review / Full Access postures; OS sandbox (Seatbelt, opt-in bubblewrap); subagents and agent teams; MCP, skills, hooks, plugins; `/undo`, `/receipts`, `/preview-request`. Not affiliated with DeepSeek. |
| **Deep Code CLI** (`lessweb/deepcode-cli`, npm `@vegamo/deepcode-cli`) | TypeScript/Node, MIT, ~2.3k stars†. Listed in DeepSeek's API docs as an integration. Thinking-mode and `reasoningEffort` control, KV-cache-aware for cost, skills (`.agents/skills`), MCP, per-scope permissions, `/fork` `/undo`, VS Code extension sharing `~/.deepcode/settings.json`. |
| Hobby CLIs (`holasoymalva/deepseek-cli`, `PierrunoYT/deepseek-cli`, etc.) | Small personal projects; not recommended for serious use. |
| `opendshdesktop.com` | Unofficial community desktop distribution of dsh — don't confuse with DeepSeek's official app. |

---

## 2. OpenCode (anomalyco/opencode) — the flagship open harness

**Type:** Terminal/desktop/IDE coding agent · **Maker:** Anomaly (ex-SST; Jay V, Frank Wang) · **License:** MIT · **Stars:** ~212k† (largest community-built open-source harness; DeepSeek's official dsh repo reports more) · **Stack:** TypeScript on Bun (monorepo `packages/`) · **First release:** Jun 2025

> Naming note: an older Go project called `opencode-ai/opencode` was renamed **Crush** (Charmbracelet). Some roundups conflate the two (e.g. calling OpenCode "Go"); the current OpenCode is TypeScript/Bun.

### Architecture — client/server
- Running `opencode` starts **both a server and a TUI client**; the TUI talks to the server over HTTP.
- `opencode serve` runs a headless server (default `127.0.0.1:4096`, optional `--mdns`, `--cors`, basic-auth via `OPENCODE_SERVER_PASSWORD`).
- Server publishes an **OpenAPI 3.1 spec** at `/doc`; the official SDK is generated from it.
- API surface: sessions (create/fork/abort/share/diff/summarize/revert), messages (sync and `prompt_async`), files, tools, LSP, formatters, MCP, agents, auth, and `/tui` remote-control endpoints (IDE plugins drive the TUI this way).
- **SSE** event stream at `/event` and `/global/event`.
- Consequence: the same agent engine powers the TUI, desktop app (beta: macOS/Win/Linux), IDE extensions, web UI, and remote/Docker-sandboxed sessions.

### Agents
- **build** (default, full access), **plan** (read-only: edits denied, bash asks), **general** subagent (`@general`) for multi-step search. Tab switches primary agents. Custom agents configurable.

### Built-in tools
`bash`, `edit` (exact-string replace), `write`, `read` (line ranges), `grep`, `glob` (mtime-sorted), `apply_patch`, `lsp` (experimental: definition/references/hover/symbols/implementations/call hierarchy), `skill` (loads `SKILL.md`), `todowrite`, `webfetch`, `websearch` (Exa/Parallel), `question` (structured user question). Plus **MCP** servers and **custom tools** defined in config.

### Permissions
All tools default to **allow**; per-tool `allow | ask | deny` in `opencode.json`, wildcards (`"mymcp_*": "ask"`); `edit` governs edit/write/apply_patch together. No OS-level sandbox by default — isolation via Docker if wanted.

### Models
Provider-agnostic, 75+ providers via `/connect` (BYOK, local models). **OpenCode Zen**: curated, tested model set with per-token pricing and zero retention.

### Workflow features
`/init` → generates `AGENTS.md`; `@` fuzzy file refs; image drag-in; `/undo` `/redo`; `/share` session links (opt-in); themes, keybinds, formatters, custom commands, plugins; GitHub integration; ~20 doc translations; installers for every platform (curl, npm/bun/pnpm, brew, scoop, choco, pacman/AUR, mise, nix).

**Strengths:** largest community; true provider freedom; client/server design makes it embeddable and scriptable; polished TUI; LSP awareness.
**Weaknesses:** permissive by default (no sandbox); fast-moving (4.6k open issues); experimental LSP tool behind a flag.

---

## 3. Similar harnesses

### 3.1 OpenAI Codex CLI (openai/codex)
- **License:** Apache-2.0 · **Stars:** ~128k† · **Stack:** Rust core (`codex-rs`) + TS SDK · **Released:** Apr 2025
- **Surfaces:** CLI, IDE extension (VS Code/Cursor/Windsurf — extension itself closed source), desktop app (`codex app`), cloud agent (Codex Web).
- **Sandbox-first** — the strongest local isolation of any harness here:
  - macOS: Seatbelt · Linux/WSL2: bubblewrap (fallback helper using user namespaces) · Windows: native sandbox.
  - Modes: `read-only`, `workspace-write` (default), `danger-full-access`.
  - Approval policies: `on-request`, `never`; `approvals_reviewer = auto_review` routes approvals to a reviewer agent.
- **Models:** OpenAI by default (GPT-5.x-Codex family); Ollama / OpenAI-compatible servers supported. Auth via ChatGPT plan or API key.
- Also: `AGENTS.md`, MCP, non-interactive `exec` mode for CI, strong PR review automation.
- **Benchmarks:** Codex + GPT-5.5 tops Terminal-Bench 2.0 (~82%, Apr 2026 snapshots).
- **Strengths:** security model, token efficiency, speed (Rust), top benchmark. **Weaknesses:** OpenAI-centric; parts (IDE ext.) closed.

### 3.2 Claude Code (Anthropic) — proprietary reference point
- **License:** closed (repo hosts docs/issues only) · Released Feb 2025.
- Subagents, hooks, skills, MCP, plan mode, worktree-isolated agent teams, cloud/scheduled sessions, code review.
- Claude models only (Anthropic, Bedrock, Vertex, Foundry) — though third-party models with Anthropic-compatible endpoints (e.g. DeepSeek V4) can be pointed at it.
- Highest "most loved" rating in developer surveys; criticized for cost/rate limits and a large, not-fully-inspectable system prompt (>10k tokens).
- Included because nearly every open harness is benchmarked against it and many copy its conventions (skills, `SKILL.md`, subagents, plan mode).

### 3.3 Aider (Aider-AI/aider)
- **License:** Apache-2.0 · **Stars:** ~49k† · **Released:** Jun 2023 (the original terminal pair-programmer) · Python.
- **Design:** *git-native* — every AI edit is an auto-commit with a generated message, so `git diff`/`git revert` are the undo system.
- **Repo map** (tree-sitter-derived symbol map of the whole repo) to fit large codebases into context; multiple edit formats (whole / diff / udiff) and **architect mode** (reasoning model plans, cheaper editor model applies).
- Auto lint + test after each change with self-fix loop; voice input; IDE "watch" workflow (write `AI!` comments in your editor).
- 100+ models via LiteLLM incl. local; maintains the **Aider Polyglot benchmark** (225 Exercism tasks, 6 languages), a widely-cited model leaderboard.
- **Caveat:** several 2026 sources report no substantial release since Aug 2025 (dormant). No native MCP.
- **Strengths:** cheapest tokens per task, transparent, git hygiene. **Weaknesses:** pair-programmer, not autonomous; activity stalled.

### 3.4 Cline (cline/cline) — and forks Roo Code / Kilo Code
- **License:** Apache-2.0 · **Stars:** ~70k† · TypeScript.
- **Surfaces:** VS Code extension (origin), CLI (`npm i -g cline`, interactive or headless for CI), JetBrains (not open-sourced), desktop app, `@cline/sdk`.
- **Plan / Act** modes; **human-in-the-loop** approval for every edit and command unless auto-approve; **checkpoints** (workspace snapshots, undoable); browser use; MCP (`cline mcp`).
- Providers: Anthropic, OpenAI, Google, OpenRouter, Bedrock, Vertex, Azure, Groq, Cerebras, Ollama, LM Studio, any OpenAI-compatible.
- Forks **Roo Code** (custom "modes"/personas) and **Kilo Code** (merges Cline + Roo features) target the same IDE-first niche.
- **Strengths:** best IDE-native, visual diff approval, checkpoints. **Weaknesses:** approval friction; token-heavy.

### 3.5 Pi (earendil-works/pi, formerly badlogic/pi-mono)
- **License:** MIT · **Stars:** ~113k† · TypeScript · Author: Mario Zechner · Released Nov 2025.
- **Philosophy:** minimal harness you adapt — **four tools** (read, write, edit, bash), system prompt reported under 1,000 tokens; *no* built-in subagents, plan mode, or permission system (runs as your user; use Docker for isolation).
- Sessions stored as **JSONL trees** allowing branching.
- Composable packages: `pi-ai` (unified multi-provider LLM API, 15+ providers / 300+ models), `pi-agent-core` (agent runtime), `pi-tui` (differential-rendering TUI), `pi-coding-agent` (CLI).
- Extensions, skills, prompt templates and themes distributed as npm/git "Pi packages". Powers **OpenClaw**; fork `oh-my-pi` adds LSP, subagents, browser.
- **Strengths:** tiny context overhead, hackable, great as a library. **Weaknesses:** no safety rails out of the box.

### 3.6 OpenHands (All-Hands-AI / OpenHands)
- **License:** MIT · **Stars:** ~90k† · Python agent server + TS frontend.
- Started as OpenDevin (CodeAct agent, Docker sandbox, GitHub issue resolver); now reorganized around **Agent Canvas** (v1.25), a self-hosted control center that runs *multiple* agents — OpenHands, Claude Code, Codex, Gemini — via the **Agent Client Protocol (ACP)**.
- **Agent Servers** (REST API) with per-conversation Docker containers; optional Automation Server for scheduled/event-driven runs (Slack, GitHub, Linear, Notion).
- SDK: `OpenHands/software-agent-sdk`. BYO model.
- Best open-weight-harness Terminal-Bench 2.0 entry cited: 51.9% with Claude Opus 4.5 (Jan 2026).
- **Strengths:** containerized by design, multi-agent orchestration, CI/automation. **Weaknesses:** heavier to self-host; benchmark trails top closed harnesses.

### 3.7 Goose (block/goose)
- **License:** Apache-2.0 · **Stars:** ~55k† · Rust · Governed by the **Agentic AI Foundation (Linux Foundation)**.
- General-purpose (not only coding) local agent: desktop app, CLI, embeddable API.
- **MCP-native**: 70+ extensions; 15+ providers; ACP to reuse Claude/ChatGPT/Gemini subscriptions; "recipes" (shareable workflows) and custom distributions.
- **Strengths:** neutral governance, extensibility. **Weaknesses:** less coding-specialized.

### 3.8 Gemini CLI → Antigravity CLI (Google)
- Gemini CLI: Apache-2.0, TypeScript, ~103k stars, 1M context, generous free tier at launch (Jun 2025).
- **Status change:** Google announced individual/free access ends **June 18, 2026**; replaced by closed-source, Go-based **Antigravity CLI** (`agy`). The Apache-2.0 repo is still maintained for enterprise/paid API keys.
- Reported less token-efficient (~432K tokens/task vs Claude Code ~261K).
- Its open code lives on in **Qwen Code** (Alibaba fork tuned for Qwen3-Coder; Apache-2.0, ~25k stars, sandbox/permissions, hooks).

### 3.9 Other notable entries
| Harness | License | Lang | Notes |
|---|---|---|---|
| **Crush** (Charmbracelet; ex-`opencode-ai/opencode`) | FSL-1.1-MIT (source-available, converts to MIT later) | Go | Best-looking TUI, mid-session model swap, LSP, permissions |
| **Kimi Code CLI** (Moonshot) | open source | Python | MCP, multi-agent, ACP/IDE (Zed, VS Code, JetBrains); no sandbox/hooks |
| **mini-swe-agent** (SWE-agent team, Princeton/Stanford) | MIT | Python | ~100-line agent, **bash only**, no tool-calling API, linear history; >74% SWE-bench Verified — the canonical "how little harness do you need" baseline. ~8.3k stars† |
| **SWE-agent** | MIT | Python | Predecessor; custom Agent-Computer Interface tools; research platform |
| **Amp** (ex-Sourcegraph) | closed | — | Mode-based model routing (no BYOK), CLI-only since Feb 2026 |
| **Factory Droid** | closed | — | Coordinator + specialist "Droids", cloud machines; strong Terminal-Bench |

---

## 4. Head-to-head comparison

### 4.1 Core matrix
| | OpenCode | Codex CLI | Claude Code | Aider | Cline | Pi | OpenHands | Goose | Gemini CLI | DeepSeek Harness (dsh) |
|---|---|---|---|---|---|---|---|---|---|---|
| Open source | ✅ MIT | ✅ Apache (IDE ext closed) | ❌ | ✅ Apache | ✅ Apache (JetBrains closed) | ✅ MIT | ✅ MIT | ✅ Apache | ✅ Apache (successor closed) | ✅ MIT |
| Language | TS/Bun | Rust | TS | Python | TS | TS | Python+TS | Rust | TS | TS (+Python SDK) |
| Stars (≈) | 212k† | 128k† | ~120k | 49k† | 70k† | 113k† | 90k† | 55k† | ~103k | 245k† (reported) |
| Model freedom | 75+ providers | OpenAI + local | Claude (+compatible endpoints) | 100+ via LiteLLM | ~15 + any OpenAI-compat | 15+ / 300+ models | any | 15+ + ACP | Gemini only | DeepSeek default + Anthropic/OpenAI/Kimi/GLM catalogs + OpenAI-compat |
| Primary UI | TUI + desktop + IDE + web | TUI + IDE + desktop + cloud | TUI + IDE + desktop + web | TUI | IDE (+CLI) | TUI / library | Web canvas | Desktop + CLI | TUI | Desktop + Web UI + headless + Python SDK |
| OS sandbox | ❌ (Docker opt.) | ✅ Seatbelt/bwrap/Win | ✅ (opt-in) | ❌ | ❌ | ❌ | ✅ Docker | ❌ | ✅ (opt.) | ⚠️ sandbox plugin, "no isolation guarantee" |
| Approval model | allow/ask/deny per tool | sandbox mode × approval policy, auto-reviewer | permission modes + hooks | confirm each step | approve each action | none | container boundary | per-extension | permission prompts | workspace-write + prompts, auto-reviewer (exp.) |
| Plan/read-only mode | ✅ plan agent | ✅ read-only | ✅ | ✅ (ask/architect) | ✅ Plan/Act | ❌ (via pkg) | — | — | ✅ | ✅ planning in Standard |
| Subagents | ✅ | ✅ (multi-agent) | ✅ teams | ❌ | limited | ❌ (via pkg) | ✅ multi-agent | ✅ | limited | ✅ (incl. Claude Code/Codex as providers) |
| MCP | ✅ | ✅ | ✅ | ❌ native | ✅ | via ext | via agents | ✅ core | ✅ | ✅ (off by default) |
| LSP | ✅ (exp.) | ❌ | via plugins | repo map instead | IDE-provided | via fork | — | — | — | — |
| Undo | /undo /redo, session revert | git | checkpoints/rewind | git commits | checkpoints | session tree branch | container | — | checkpoints | fork/replay session log |
| Headless / CI | `opencode serve` + SDK | `codex exec` + SDK | `-p` + Agent SDK | scripting | `cline` headless + SDK | library | Agent Server REST | API | non-interactive | `--profile headless` + Python SDK |
| Project memory file | AGENTS.md | AGENTS.md | CLAUDE.md | conventions file | .clinerules | AGENTS/skills | — | .goosehints | GEMINI.md | skills / AGENTS |
| Cost model | BYOK / Zen | ChatGPT plan / API | Claude plan / API | BYOK | BYOK | BYOK / subscription login | BYOK | BYOK / ACP | Paid Gemini (since 2026) | DeepSeek API (very cheap) / BYOK |

### 4.2 Design philosophies
| Philosophy | Harnesses | Trade-off |
|---|---|---|---|
| **Maximal, batteries-included** | Claude Code, OpenCode, Codex | Rich features (subagents, MCP, plan, LSP) at the cost of large system prompts and token usage |
| **Minimal / hackable** | Pi, mini-swe-agent | Tiny prompt, fully inspectable, fewer tokens; you build safety and orchestration yourself |
| **Git-as-state** | Aider | Every step reviewable and revertible; less autonomy |
| **Human-in-the-loop IDE** | Cline, Roo, Kilo | Maximum visibility/control; slower, approval fatigue |
| **Sandbox-first** | Codex, OpenHands | Safe autonomy; setup friction (bwrap, Docker) |
| **Platform / orchestrator** | OpenHands Agent Canvas, Goose, Factory | Run many agents & automations; heavier infra |
| **Plugin-kernel / self-extending** | DeepSeek Harness (Cordis) | Every component hot-swappable, agent can write its own plugins; preview instability and plugin supply-chain risk |

### 4.3 Benchmarks (harness + model as a system)
| Benchmark | Notable results (as reported, 2026) |
|---|---|
| Terminal-Bench 2.0 (89 hard CLI tasks) | DeepSeek V4 Flash + dsh Minimal preset 82.7 (DeepSeek-reported, secondhand; TB version unclear); Codex + GPT-5.5 ~82%; ForgeCode + GPT-5.4 81.8%; Droid + GPT-5.3-Codex 77.3%; DeepSeek V4-Pro (vendor) ~67.9%; OpenHands + Opus 4.5 51.9% |
| SWE-bench Verified | Claude Code ~80.9%, Codex ~80%, Gemini 3.1 Pro ~80.6% — effectively tied; mini-swe-agent (bash-only) >74% |
| Aider Polyglot | GPT-5 (high) 88%, o3-pro 84.9%, Gemini 2.5 Pro 83.1% (leaderboard not refreshed for newest models) |
| DeepSeek-Coder (2023, model-only) | 33B beats CodeLlama-34B by 5.9–10.8 pts across HumanEval/MBPP/DS-1000 |

Caveats: numbers come from different dates, settings and often vendors; a self-reported harness run (LemonHarness) showed a ~9-point spread across five identical Terminal-Bench runs, so single-digit gaps are within noise.

---

## 5. Pairing models with harnesses (DeepSeek ↔ OpenCode)

The two original links are complementary:

| Goal | Recommended pairing |
|---|---|
| First-party DeepSeek experience | **DeepSeek Harness (`dsh`)** + DeepSeek V4.1 Flash / V4 Pro — DeepSeek's own tuned pairing; or Deep Code CLI for a lighter terminal-only option |
| Fully open, self-hosted stack | **OpenCode or Pi** + DeepSeek-Coder-V2-Lite / DeepSeek-V3.x / Qwen3-Coder via vLLM or Ollama |
| Cheapest capable cloud agent | OpenCode / Cline / Aider + `deepseek-v4-flash` |
| Editor autocomplete (FIM) | Original DeepSeek-Coder 1.3B/6.7B (FIM-trained) via Continue/Tabby-style completion plugins — agent harnesses don't need FIM |
| Safest autonomous runs | Codex CLI (OS sandbox) or OpenHands (Docker) |
| Max quality, cost no object | Codex + GPT-5.x or Claude Code + Opus |
| Research / building your own harness | mini-swe-agent (baseline) → Pi packages (`pi-ai`, `pi-agent-core`) → OpenCode server SDK |

Practical notes on running DeepSeek (or any open model) in a harness:
1. **Tool-calling quality** is the main failure point; the original 2023 DeepSeek-Coder has no tool calling — use V3.1+ for agent loops, or a bash-only harness like mini-swe-agent which avoids the tool-call API entirely.
2. **Context**: 16K (Coder v1) is too small for agent loops whose system prompts alone can exceed 10K tokens; V2 (128K) / V4 (1M reported) are viable. Minimal-prompt harnesses (Pi, mini-swe-agent) stretch small contexts furthest.
3. **API shape**: DeepSeek offers OpenAI- and Anthropic-compatible endpoints, so it drops into OpenCode/Cline/Aider (OpenAI-compat) and Claude Code (Anthropic-compat).

---

## 6. Recommendations

- **Default open-source choice:** **OpenCode** — biggest community, provider-agnostic, embeddable server/SDK. Add Docker isolation and set `bash`/`edit` to `ask` for untrusted repos.
- **If security/autonomy is paramount:** **Codex CLI** — best OS-level sandbox; open source core.
- **If you live in an IDE and want to approve every change:** **Cline** (or Roo/Kilo).
- **If you want git-reviewable, low-token pair programming:** **Aider** — but watch its maintenance status.
- **If you're building your own harness:** start from **Pi** (libraries) or **mini-swe-agent** (reference baseline); copy OpenCode's client/server + OpenAPI pattern for multi-client UIs.
- **If you need fleets/automation:** **OpenHands Agent Canvas** or **Goose**.
- **Avoid new investment in Gemini CLI** for individual use; it's being retired in favor of closed Antigravity CLI.
- **If you want DeepSeek end-to-end:** try **DeepSeek Harness (`dsh`)** — the official, MIT-licensed harness — for prototyping and for its Trajectory/fork observability, but run it in a disposable environment and pin versions until it leaves preview. For a stable DeepSeek terminal agent today, OpenCode or Codewhale with `deepseek-v4-*` is the safer bet.
- **Use the original DeepSeek-Coder as a model, not a tool:** pick V3.x/V4 for agents, original Coder only for FIM autocomplete or fine-tuning experiments.

---

## Sources
- https://github.com/deepseek-ai/deepseek-harness · https://www.deepseek.com/en/harness/
- https://www.orcarouter.ai/blog/deepseek-harness-explained
- https://www.scriptbyai.com/deepseek-harness/
- https://gigazine.net/gsc_news/en/20260814-deepseek-harness-v0-1/
- https://www.marktechpost.com/2026/10/03/deepseek-harness-v0-2-brings-official-desktop-apps-to-its-open-source-agent-harness/
- https://cryptobriefing.com/deepseek-harness-v02-desktop-app-release/
- https://tech-ish.com/2026/10/07/deepseeks-ai-agent-now-installs-like-a-normal-app-on-mac-and-windows/
- https://www.verdent.ai/guides/what-is-deepseek-code
- https://github.com/Hmbown/DeepSeek-TUI (now codewhale-hq/Codewhale)
- https://github.com/lessweb/deepcode-cli · https://api-docs.deepseek.com/quick_start/agent_integrations/deepcode/
- https://github.com/deepseek-ai/deepseek-coder
- https://github.com/anomalyco/opencode · https://opencode.ai/docs/ · https://opencode.ai/docs/tools/ · https://opencode.ai/docs/server/
- https://github.com/openai/codex · https://learn.chatgpt.com/codex/sandboxing
- https://github.com/Aider-AI/aider
- https://github.com/cline/cline
- https://github.com/badlogic/pi-mono (earendil-works/pi)
- https://github.com/All-Hands-AI/OpenHands
- https://github.com/block/goose
- https://github.com/SWE-agent/mini-swe-agent
- https://techstackups.com/comparisons/coding-agent-harness-comparison-2026/
- https://codemyspec.com/blog/cli-agents-compared-2026
- https://pinggy.io/blog/best_open_source_cli_coding_agents/
- https://terminaltrove.com/compare/ai-coding-agents/kimi-cli-vs-qwen-code/
- https://terminaltrove.com/compare/ai-coding-agents/charm-cli-vs-kimi-cli/
- https://www.codesota.com/browse/agentic/autonomous-coding/terminal-bench-2
- https://www.morphllm.com/terminal-bench-2
- https://arxiv.org/pdf/2606.24311 (LemonHarness)
- https://www.datacamp.com/blog/deepseek-v4-vs-claude-opus-4-7
- https://framia.converge.ai/page/en-US/news/deepseek-v4-coding
- https://www.scriptbyai.com/deepseek-timeline-release-dates/
- https://gitverse.ru/deepseek-ai/DeepSeek-Coder-V2
- https://letsdatascience.com/news/google-replaces-gemini-cli-with-antigravity-cli-574b2056
- https://fossforce.com/2026/05/gemini-clis-short-life-and-googles-antigravity-bait-and-switch/
- https://amux.io/guides/gemini-cli-to-antigravity-cli/
