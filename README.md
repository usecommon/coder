# Coding Harness Research

Research on AI coding agents and the "harnesses" around them, compiled October 2026.

**Core idea:** an AI coding agent is a *model* (the brain, e.g. Claude, GPT, DeepSeek) plus a *harness* (everything around it: the agent loop, tools, memory, context compaction, permissions, sandbox, UI and integrations). Benchmarks score the pair together, and the harness largely decides safety, cost and reliability.

## Galley: our OpenCode-class agent

[`galley/`](galley/) is a working MVP of a coding agent comparable to OpenCode. It is TypeScript on Bun, provider-agnostic, and **safety-first**: commands run in an OS sandbox with the network off, file tools are confined to the workspace, plan mode is read-only at the OS level, and `/undo` reverts a turn. It is **cheap-model friendly** (short cacheable prompt, cost and cache tracking, compaction) and supports **parallel and background work** (sub-agents, `--detach`, `--worktree`). See [`galley/README.md`](galley/README.md) and the plan in [`galley/PLAN.md`](galley/PLAN.md).

## Research contents

| File | What it covers |
|---|---|
| [`research/coding-harnesses.md`](research/coding-harnesses.md) | Main comparison. DeepSeek-Coder (a model, not a harness), DeepSeek's own **DeepSeek Harness (`dsh`)**, OpenCode, Codex CLI, Claude Code, Aider, Cline, Pi, OpenHands, Goose, Gemini CLI → Antigravity, Qwen Code, Crush, Kimi CLI, mini-swe-agent and others. Feature matrix, design philosophies, benchmarks, model-to-harness pairings, recommendations. |
| [`research/claude-code-leak-derivatives.md`](research/claude-code-leak-derivatives.md) | The March 31, 2026 Claude Code source-map leak: what it exposed, and the tools built from it (claw-code, OpenClaude, Claurst, free-code and others), sorted by provenance. Covers legal, security and malware risks, and clean alternatives. |
| [`research/claude-code-leak-who-leveraged.md`](research/claude-code-leak-who-leveraged.md) | Who used the leak beyond GitHub: academic papers, security research and CVEs, companies, the Chinese ecosystem, education, legal and investor analysis. Each claim is graded Confirmed, Reported, Claimed or Convergent. |
| [`research/harness-field-guide.html`](research/harness-field-guide.html) | Visual ELI5 guide built on a kitchen metaphor ("the model is the chef, the harness is the kitchen"). It has a diagram of the agent loop, a glossary, 13 tool cards with parts maps and scores, a comparison table, and a "which should I pick" guide. |

## Key takeaways

- **Default open-source pick:** OpenCode. MIT license, any model, client/server design. Add Docker and "ask" permissions if you want isolation.
- **Safest autonomous runs:** Codex CLI (operating-system sandbox) or OpenHands (a container per job).
- **Approve every change yourself:** Cline (in the editor) or Aider (git-native).
- **Learn or build your own harness:** start with mini-swe-agent, then Pi.
- **DeepSeek end to end:** DeepSeek Harness, which is MIT-licensed but still in preview. For steady daily use, run OpenCode or Codewhale with `deepseek-v4-*` models.
- **Leak-derived tools:** read them to learn, but don't depend on them (legal, security and takedown risk).
- **The leak's main lasting impact** was on research, security and teaching. No company has publicly admitted building a product from the leaked code.

## Caveats

Facts are as of October 2026, drawn from project repositories, documentation and 2026 press coverage. Star counts and benchmark scores move quickly, and many come from secondary sources; the reports flag unverified figures. Scores in the field guide are judgments for comparison, not measurements. Sources are listed at the end of each report.
