# Coding Tools Derived from the Claude Code Source Leak

_Research compiled 2026-10-08. Companion to [coding-harnesses.md](./coding-harnesses.md). Star counts marked † were read from the GitHub repo page on that date; others are from secondary sources and approximate._

> **Scope and caution.** This report describes publicly reported projects and their provenance. It does not reproduce or link to leaked source. Several of these projects contain or derive from Anthropic's copyrighted code; using them carries **legal**, **security** and **account** risk (see §5). Treat this as landscape analysis, not an endorsement.

---

## 1. What happened

| Date (2026) | Event |
|---|---|
| Mar 11 | Bun bug report (oven-sh/bun#28001): source maps served in production builds despite docs saying otherwise |
| **Mar 31, ~04:23 ET** | Researcher Chaofan Shou notices `@anthropic-ai/claude-code@2.1.88` on npm ships a **59.8 MB `cli.js.map`**. Its `sourcesContent` holds the original TypeScript (~512k lines, ~1,900 files), and it references a downloadable archive on Anthropic's Cloudflare R2 bucket. Post passes 21M views. |
| Mar 31 | Anthropic pulls the version within hours: "a release packaging issue caused by human error, not a security breach." No customer data, credentials or model weights involved. Cause: Bun emits source maps by default and `*.map` wasn't excluded (no `.npmignore` rule / `files` whitelist). Reportedly the *second* time — a 2025 version had also shipped source maps. |
| Mar 31 | Unrelated but concurrent: trojanized **axios** npm versions (RAT) published 00:21–03:29 UTC — anyone reinstalling packages that night faced extra supply-chain risk. |
| Mar 31, ~04:00 | Sigrid Jin (`instructkr`) starts **claw-code**, an AI-assisted "clean-room" rewrite; ~50k stars in ~2 hours — the fastest-growing repo in GitHub history. |
| Apr 1–2 | Zscaler ThreatLabz finds SEO-boosted fake "leaked Claude Code" repos delivering **Vidar infostealer + GhostSocks** proxy malware. |
| Early Apr | Anthropic DMCA notice causes GitHub to disable **~8,100 repos** — including legitimate forks of Anthropic's own public `claude-code` repo. Anthropic retracts most notices, narrowing to one repo + 96 forks; access restored. Boris Cherny calls the over-broad takedown unintentional. |
| Apr 4 | Anthropic stops Claude *subscriptions* covering third-party harnesses (API keys and paid usage bundles still work). Follows a Jan 9 server-side block on subscription OAuth in tools like OpenCode and a mid-Feb ToS change. Some commentators link it to the leak having exposed the client-attestation mechanism. |
| Jun 15 | Subscription ban for third-party harnesses reportedly reversed (per one roundup — verify). |

Anthropic has **not** open-sourced Claude Code in response; its GitHub repo still holds only docs, plugins and issues.

---

## 2. What the leak revealed about the harness

Most write-ups agree on the following (community code-reading, not official documentation):

| Area | Reported finding |
|---|---|
| Scale | ~40 tools in a plugin-style tool registry; a ~46k-line "query engine"; React + Ink terminal UI |
| Prompt caching | System prompt split at `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` — stable cached prefix + dynamic suffix; explicitly cache-breaking sections marked `DANGEROUS_uncachedSystemPromptSection` |
| Context management | Multi-stage compaction pipeline (reported as 4 stages / 5 strategies); a code comment reportedly estimated ~250k wasted API calls/day from autocompact failures |
| Subagents | Three execution models — **fork**, **teammate**, **worktree**; forked subagents get byte-identical parent context so they share the prompt cache; multi-agent coordination is done via prompting, not a separate framework |
| Permissions | ~2,500 lines of bash validation; model "critic" side-query ("is this command safe?") rather than pure allowlists |
| Hooks | 25+ lifecycle hook events |
| Memory | Layered: always-loaded index (pointer lines) → on-demand topic files → transcripts searched only via grep; `autoDream` consolidates memory in a forked, read-only subagent while idle |
| MCP | Six transports: stdio, SSE, HTTP, WebSocket, SDK, claude.ai proxy |
| Feature flags | ~44 flags gating 20+ unshipped features: **KAIROS** (always-on background daemon with tick prompts, daily logs, push notifications, PR subscriptions), **ULTRAPLAN** (remote planning session up to 30 min), **Coordinator mode** (one Claude orchestrating workers), voice mode, browser control, **BUDDY** (deterministic terminal pet: 18 species, rarities, stats) |
| Controversial | **Undercover mode** (`undercover.ts`, ~90 lines): for Anthropic employees on external repos, suppresses internal codenames and AI co-author attribution, no force-off; **anti-distillation** (`fake_tools` decoy tool definitions; signed summaries via `CONNECTOR_TEXT`); **client attestation** hash injected below the JS layer by Bun's Zig HTTP stack |

Many of these have since shipped or been publicly documented in some form (e.g. skills, agent teams, background/scheduled sessions, push notifications), so the leak is now mostly of historical/architectural interest.

---

## 3. The derivative projects

Projects fall into three provenance tiers. **This classification is the single most important thing to know about each one.**

| Tier | Meaning | Legal exposure |
|---|---|---|
| **A — Direct derivative** | Built on the leaked TypeScript itself (modified or not) | High: copyright belongs to Anthropic; DMCA-able |
| **B — "Clean-room" / spec-based rewrite** | New code written (often by AI agents) from behaviour specs or architecture study | Contested: no court ruling; AI-assisted "clean room" is untested |
| **C — Inspired by** | Independent design that borrows publicly discussed ideas | Low |

### 3.1 claw-code — Tier B (the famous one)
- **Repo:** `ultraworkers/claw-code` (originally `instructkr/claw-code`) · **License:** MIT · **Stars:** ~195k†, ~108k forks · last commit reported Aug 16, 2026.
- **History:** Started as a Python port written from scratch *using OpenAI Codex driven by the oh-my-codex (OmX) workflow tool* — notable irony: an AI rewrote an AI tool's harness in hours. Hit 100k stars in ~24h. The Rust port has since become the canonical implementation (`rust/` workspace); Python retained with a **parity test harness** and a deterministic mock-service harness.
- **Today:** Self-described as "an agent-managed museum exhibit" developed with no human intervention, and "not the serious production project here". Upstream binary is `agent-code`; the `claw-code` crate on crates.io is a deprecated stub (don't `cargo install claw-code`).
- **Features:** `claw prompt`, interactive sessions, `claw doctor`, `claw status`, config, skills installs, container workflow, ACP alias. Providers: Anthropic API key (no subscription login), OpenAI-compatible endpoints incl. Ollama / llama.cpp / vLLM. Smaller default toolset than Claude Code.
- **Disclaimers:** does not claim ownership of the original material; not affiliated with Anthropic.
- **Verdict:** Best read as a **study artifact and reference architecture**, not a daily driver. Its star count reflects the event, not its maturity.

### 3.2 OpenClaude — Tier A
- **Repo:** `Gitlawb/openclaude` (npm `@gitlawb/openclaude`; many mirrors, e.g. `sumedhkumar/openclaude`, `Twigpine/openclaude`) · **Stars:** ~33.7k†, 9.1k forks, ~1,230 commits · actively maintained, no takedown banner as of Oct 2026.
- **Provenance:** README says it "originated from the Claude Code codebase and has since been substantially modified", and that Claude Code itself "remains Anthropic's" — MIT applies only to contributors' modifications. Effectively the leaked harness with the model layer replaced.
- **Features:** OpenAI-compatible provider shim → GPT, Gemini, DeepSeek, Llama, Mistral, GitHub Models, Codex OAuth, Ollama, Bedrock/Vertex/Foundry, OpenRouter-style gateways, Fireworks, OpenCode, Xiaomi MiMo; `/provider` profiles; Claude Code's toolset (bash, read/write/edit, grep, glob, agents, tasks, MCP, web search/fetch via Exa/Firecrawl/DuckDuckGo, slash commands); repo map; background sessions; headless gRPC server; VS Code extension; `/buddy` companion. Install: npm (Node ≥22), AUR; source builds need Bun ≥1.3.13.
- **Offshoot:** `friuns2/openclaude-android` — on-device Android port (19 tools, MCP, 10+ providers).
- **Verdict:** The most feature-complete "Claude Code with any model" — and precisely because it *is* Claude Code's code, the riskiest to depend on (license ambiguity, possible future takedown, no upstream security fixes from Anthropic).

### 3.3 free-code — Tier A
- By `4nzn`: the leaked build with telemetry and safety guardrails stripped and experimental flags unlocked; distributed via **IPFS** to evade takedowns.
- **Verdict:** Avoid. Unmaintained, unverifiable binaries, guardrails deliberately removed — and the exact profile malware authors imitate (see §5).

### 3.4 Claurst — Tier B → C
- **Repo:** `Kuberwastaken/claurst` · **License:** GPL-3.0 · **Stars:** ~10k (mid-2026) · Rust · beta (v0.1.6–0.1.7).
- **Method:** Two-phase AI clean room — one agent read the leaked source and wrote exhaustive behavioural specs; a separate agent wrote Rust from the specs. Repo states it contains no proprietary TypeScript.
- **Now:** Independent multi-provider terminal agent: plugin system, chat forking, memory consolidation (autoDream-like), no telemetry, companion pet "Rustle".
- **Verdict:** The most credible clean-room process of the bunch, and has evolved into its own product. GPL-3.0 matters if you plan to embed it.

### 3.5 Smaller rewrites and minimal clones — Tier B/C
| Project | Notes |
|---|---|
| `LikiosSedo/open-claudecode` | "Essence of Claude Code in ~3,000 lines": streaming tool execution, multi-provider, hackable — educational |
| `soongenwong/claudecode` | Rust; describes itself as an independent implementation inspired by Claude Code |
| `hqman/claude-code-source-code-deobfuscation` | Pre-leak "cleanroom" of the minified npm bundle |
| Assorted `*-claude-code-fork` mirrors | Tier A raw mirrors; many removed by DMCA; some explicitly state "all original source code is the property of Anthropic" |

### 3.6 Indirect influence — Tier C
- Established harnesses (OpenCode, Cline, Pi, Codex, DeepSeek Harness, etc.) were already converging on Claude Code's conventions (skills/`SKILL.md`, subagents, plan mode, hooks, AGENTS-style memory files). Some commentary claims competitors "now have the architecture"; there's no evidence any major open harness imported leaked code, and they shouldn't be treated as derivatives.
- **DeepSeek Harness** can register the real Claude Code as a subagent provider — the legitimate way to combine them.

---

## 4. Comparison

| | claw-code | OpenClaude | Claurst | free-code | open-claudecode |
|---|---|---|---|---|---|
| Provenance tier | B (AI clean-room) | **A** (leaked code, modified) | B→C (spec-then-implement) | **A** (leaked, stripped) | B/C |
| License as stated | MIT | MIT on modifications only; original "remains Anthropic's" | GPL-3.0 | none credible | open |
| Language | Rust (+ Python parity) | TypeScript (Bun/Node) | Rust | TypeScript | TypeScript |
| Stars (≈) | 195k† | 33.7k† | ~10k | n/a (IPFS) | small |
| Feature parity with Claude Code | Low–medium | **High** | Medium, diverging | High (incl. unshipped flags) | Low (by design) |
| Model support | Anthropic API + OpenAI-compat/local | Very broad (15+ backends) | Multi-provider | Claude | Multi-provider |
| Maintenance | Agent-maintained "exhibit" | Active | Active (beta) | None | Hobby |
| Best use | Studying harness architecture | Claude Code UX with other models (accept risk) | Independent Rust agent | Don't | Learning |

### How they compare with legitimate open harnesses
For almost every practical goal there's a clean alternative with equal or better standing:

| You want… | Leak-derived option | Clean alternative |
|---|---|---|
| Claude Code UX with any model | OpenClaude | **OpenCode** (MIT, 212k†), **Codewhale**, **Pi** |
| Hackable minimal harness to learn from | claw-code, open-claudecode | **mini-swe-agent**, **Pi** (`pi-agent-core`) |
| Rust, fast, sandboxed | claw-code, Claurst | **Codex CLI** (Apache-2.0, OS sandbox), **Goose** |
| Real Claude Code features with other agents | — | Claude Code itself (API key) orchestrated from **DeepSeek Harness** or **OpenHands Agent Canvas** via ACP/subagents |

---

## 5. Risks

1. **Copyright / licensing.** Tier A projects redistribute Anthropic-owned code; an "MIT" badge on top doesn't change that. Anthropic has shown it will file DMCA notices (8,100 repos, later narrowed). Tier B "clean-room" claims are untested in court, especially when an AI read the original and wrote the specs. Don't build commercial products on Tier A; get legal review before relying on Tier B.
2. **Malware.** Fake "leaked Claude Code / unlocked enterprise" repos ranked high in search and shipped **Vidar** (credential/card/browser-data stealer) and **GhostSocks**. Rules: never run binaries from "leak" repos or IPFS; build from source you've read; if you did run one, rotate SSH keys, cloud credentials, API tokens and browser passwords.
3. **Security drift.** Forks of a single leaked snapshot (v2.1.88) don't receive Anthropic's subsequent permission-system and CVE fixes (pre-leak CVEs included CVSS 8.7 code injection via untrusted directories and CVSS 5.3 API-key exfiltration from malicious repos). free-code deliberately removes guardrails.
4. **Account risk.** Using subscription OAuth tokens through unofficial clients has been blocked/ToS-restricted at various points in 2026; use API keys.
5. **Maturity.** claw-code is explicitly not production; Claurst is beta; OpenClaude's stability depends on a community patching a frozen upstream.

---

## 6. Lessons for anyone building a harness

- **Ship hygiene:** whitelist `files` in `package.json`; fail CI if `*.map` or `sourcesContent` appear in the tarball (`npm pack --dry-run`); audit toolchain defaults (Bun emits source maps).
- **Client-side secrets aren't secrets:** prompts, attestation and anti-distillation logic in a client will eventually be read.
- **Architectural ideas worth copying** (all now widely documented): cache-aware system prompt boundaries; forked subagents sharing a byte-identical prefix for cache hits; layered memory (index → topics → grep-only transcripts); model-as-critic permission checks on top of static rules; worktree-isolated parallel agents; staged compaction.
- **The harness is replicable fast.** claw-code's overnight rewrite and Claurst's spec→code pipeline show that harness logic is no longer a moat; differentiation shifts to models, safety engineering, integrations and trust.

---

## Sources
- https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/
- https://read.engineerscodex.com/p/diving-into-claude-codes-source-code
- https://paddo.dev/blog/claude-code-leak-harness-exposed/
- https://infoq.com/news/2026/04/claude-code-source-leak
- https://heise.de/en/news/Claude-Code-Leak-8100-Takedown-Requests-and-the-Birth-of-Claw-Code-11279674.html
- https://ipkitten.blogspot.com/2026/04/the-claude-code-leak-that-spurred-8100.html
- https://www.implicator.ai/anthropics-claude-code-takedown-hit-8-100-github-repos-by-mistake/
- https://decrypt.co/362917/anthropic-accidentally-leaked-claude-code-source-internet-keeping-it-forever
- https://www.theweek.in/news/sci-tech/2026/04/01/always-on-agent-and-ai-pet-buddy-anthropics-claude-source-code-leak-reveals-hidden-features.amp.html
- https://akitaonrails.com/en/2026/03/31/claude-code-source-code-leaked-what-we-found-inside/
- https://github.com/ultraworkers/claw-code (formerly instructkr/claw-code)
- https://andrew.ooo/posts/claw-code-review-open-source-claude-code-alternative/
- https://cybernews.com/tech/claude-code-leak-spawns-fastest-github-repo/
- https://github.com/Gitlawb/openclaude · https://github.com/friuns2/openclaude-android
- https://actionablenotes.substack.com/p/the-claude-code-leak-a-mini-brief
- https://www.sourcepulse.org/projects/27211723 (Kuberwastaken/claurst) · https://www.prismnews.com/hobbies/rust-programming/developers-race-to-build-rust-ports-after-claude-code
- https://github.com/LikiosSedo/open-claudecode · https://github.com/soongenwong/claudecode · https://github.com/hqman/claude-code-source-code-deobfuscation
- https://www.bleepingcomputer.com/news/security/claude-code-leak-used-to-push-infostealer-malware-on-github/
- https://www.theregister.com/2026/04/02/trojanized_claude_code_leak_github/
- https://www.bitdefender.com/en-us/blog/hotforsecurity/claude-code-leak-github-vidar-malware
- https://fusion94.org/blog/2026-04-04-anthropic-kills-claude-subscriptions-for-third-party-tools/
- https://falcao.org/posts/anthropic-claude-access-crackdown-ecosystem-fallout/
- https://codemyspec.com/blog/cli-agents-compared-2026
