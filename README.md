# WIP Research
# Coding Harness Research

Research on AI coding agents and the "harnesses" around them, compiled October 2026.

**Core idea:** an AI coding agent is a *model* (the brain, e.g. Claude, GPT, DeepSeek) plus a *harness* (everything around it: the agent loop, tools, memory, context compaction, permissions, sandbox, UI and integrations). Benchmarks score the pair together, and the harness largely decides safety, cost and reliability.

## Galley: our OpenCode-class agent

[`galley/`](galley/) is a working MVP of a coding agent comparable to OpenCode. It is TypeScript on Bun, provider-agnostic, and **safety-first**: commands run in an OS sandbox with the network off, file tools are confined to the workspace, plan mode is read-only at the OS level, and `/undo` reverts a turn. It is **cheap-model friendly** (short cacheable prompt, cost and cache tracking, compaction) and supports **parallel and background work** (sub-agents, `--detach`, `--worktree`). See [`galley/README.md`](galley/README.md) and the plan in [`galley/PLAN.md`](galley/PLAN.md).

**Benchmark** (Exercism exercises as used by Aider Polyglot; no internet; both agents run side by side, several rounds; sandbox fixed on 12 November 2026). On DeepSeek-V4.1-Flash:

| | Tasks | Galley | OpenCode | Lead | Galley's cost |
|---|---|---|---|---|---|
| Third confirmation on fresh tasks, benchmark corrected | 201 (C, C#, Elixir), 3 rounds | 73.5% | 72.5% | +1.0 points (p = 0.58) | 11% lower |
| Second confirmation on fresh tasks | 181 (PHP, TypeScript, Ruby), 4 rounds | 55.0% | 51.5% | +3.5 points (p = 0.16) | 12% lower |
| First confirmation on fresh tasks | 121 (JavaScript, Java, C++), 4 rounds | 49.8% | 42.1% | +7.6 points (p = 0.001) | 10% higher |
| Development tasks | 101 (Python, Go, Rust), 3 rounds | 70.3% | 64.0% | +6.3 points (p = 0.013) | 11% higher |

- **Not a win by our own rule,** which asks for a 5-point lead, p < 0.05 and lower cost, all on one set of tasks Galley was not developed on. The first confirmation missed the cost condition; the second and third, run after two fixes to Galley, met it and missed the lead.
- **Where it stands:** pooled over the three fresh sets (503 tasks) Galley leads by 3.5 points (95% interval +1.4 to +5.5), and since the fixes it is about 11% cheaper. On the corrected benchmark alone the two are level on pass rate.
- **Most failures on this benchmark are details only the hidden tests define** (exact error messages, function names). Both agents get them right only when the model remembers the public exercise, so a harness has little to work with there.
- **Between the confirmations two defects in Galley were fixed:** helper agents launched to "recall" hidden tests, and test scripts refused under `/tmp`. Side by side on the same tasks the fixed Galley cost 17.5% less and passed as many.
- **A flaw in the benchmark worked against Galley in the first two confirmations.** Its sandbox hid the shared test tools (jest, the Java test libraries, PHPUnit) that OpenCode could use. It was fixed before the third; the earlier results are not corrected for it.
- **A second flaw, found during the third:** the proxy that adds the API key forwarded anything, and OpenCode's agent used it to ask a stronger model in three task-runs over all campaigns. It now serves one endpoint and one model. No verdict changes.
- **Claude Sonnet 5.5** (development tasks): Galley 87 to 88% (re-measured), OpenCode 90.1% (earlier run): a tie within noise, with Galley at well under half the cost.

Earlier DeepSeek results (68.8% vs 67.8%) came from a sandbox that let agents read hidden tests, which OpenCode did in 22 task-runs. Details: [`bench/RESULTS-fresh3.md`](bench/RESULTS-fresh3.md) (latest), [`bench/RESULTS-fresh2.md`](bench/RESULTS-fresh2.md), [`bench/RESULTS-fresh.md`](bench/RESULTS-fresh.md), [`bench/RESULTS-clean.md`](bench/RESULTS-clean.md), [`bench/RESULTS.md`](bench/RESULTS.md), [`bench/RESULTS-claude.md`](bench/RESULTS-claude.md), [`bench/IMPROVEMENT_LOG.md`](bench/IMPROVEMENT_LOG.md). What to try next, with the evidence behind each option: [`research/beating-opencode.md`](research/beating-opencode.md).

## Research contents

| File | What it covers |
|---|---|
| [`research/coding-harnesses.md`](research/coding-harnesses.md) | Main comparison. DeepSeek-Coder (a model, not a harness), DeepSeek's own **DeepSeek Harness (`dsh`)**, OpenCode, Codex CLI, Claude Code, Aider, Cline, Pi, OpenHands, Goose, Gemini CLI → Antigravity, Qwen Code, Crush, Kimi CLI, mini-swe-agent and others. Feature matrix, design philosophies, benchmarks, model-to-harness pairings, recommendations. |
| [`research/claude-code-leak-derivatives.md`](research/claude-code-leak-derivatives.md) | The March 31, 2026 Claude Code source-map leak: what it exposed, and the tools built from it (claw-code, OpenClaude, Claurst, free-code and others), sorted by provenance. Covers legal, security and malware risks, and clean alternatives. |
| [`research/claude-code-leak-who-leveraged.md`](research/claude-code-leak-who-leveraged.md) | Who used the leak beyond GitHub: academic papers, security research and CVEs, companies, the Chinese ecosystem, education, legal and investor analysis. Each claim is graded Confirmed, Reported, Claimed or Convergent. |
| [`research/beating-opencode.md`](research/beating-opencode.md) | Methods for improving Galley past OpenCode, ranked by strength of evidence from papers, vendor docs and our own benchmark data; includes how many runs it takes to prove a gain and a costed plan. |
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
