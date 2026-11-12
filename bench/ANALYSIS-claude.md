# Why OpenCode edges out Galley on Claude Sonnet 5.5

*Analysis of the two Sonnet 5.5 runs per agent in [RESULTS-claude.md](RESULTS-claude.md). Pooled pass rates: OpenCode 90.1%, Galley 87.1%. That is a 3-point gap, not statistically significant (p = 0.29).*

> **Corrected 12 November 2026.** The first version of this analysis said OpenCode's system prompt tells the model to write idiomatic code and to verify its work, and credited the gap to that. That was wrong. The lines I quoted come from the prompt OpenCode sends to DeepSeek-type models. I have since captured the prompt it actually sends to Claude (by pointing it at a local fake server), and it contains no guidance on conventions, idioms, edge cases or verification. Sections 2, 4 and 6 are rewritten accordingly. The follow-up research is in [`../research/beating-opencode.md`](../research/beating-opencode.md).

## 1. The gap comes from a handful of tasks

Over 2 runs × 101 tasks, OpenCode has a net 6 more passes.

| Task | Galley | OpenCode | What happened |
|---|---|---|---|
| go/trinary | 0/2 | 2/2 | Broken starter file; the agents repaired it differently (see 2) |
| go/hexadecimal | 0/2 | 1/2 | Same kind of broken starter file |
| python/forth | 0/2 | 2/2 | Galley treated negative numbers (`-1`) as undefined words, in both runs |
| python/pov | 0/2 | 1/2 | Both agents wrote the same two error messages; Galley raised the wrong one on one path |
| python/tree-building | 1/2 | 2/2 | Single-run flip |
| go/forth | 0/2 | 1/2 | Single-run flip |
| go/dominoes | **2/2** | 1/2 | Single-run flip, in Galley's favour |
| rust/scale-generator | **1/2** | 0/2 | Single-run flip, in Galley's favour |

Only `go/trinary` and `python/forth` went 0/2 vs 2/2.

## 2. What we can and cannot say about the cause

**Observed behaviour.** In `go/trinary` and `go/hexadecimal` the starter file has a mangled signature (`ParseTrinary(arg string, want int64, ok bool)`). Both agents noticed and repaired it. Galley chose `(int64, bool)`, following the stub's `ok bool`. OpenCode chose `(int64, error)`, the idiomatic Go form, which the hidden tests expect. On `python/forth`, Galley missed negative-number literals twice.

**Cause: not established.** Two runs per agent cannot separate a real tendency from chance. If a task is a coin flip for both agents, a 0/2 vs 2/2 split in one direction or the other happens about 1 time in 8. With several coin-flip tasks in the set, one or two such splits are expected even when the agents are identical.

**What the model actually sees differently** (captured from real requests):

| | OpenCode (Claude prompt) | Galley |
|---|---|---|
| System prompt | About 9,400 characters: tone, objectivity, heavy emphasis on tracking work with a todo-list tool, tool-use policy, environment details. Nothing about conventions, idioms, edge cases or verification. | About 850 characters: explore first, read before editing, verify with the shell, "keep changes focused", "be concise" |
| Tool descriptions | 10 tools, about 21,000 characters (the shell tool alone is 5,300) | 8 tools, about 3,600 characters |
| Extra in these runs | About 13,000 characters listing 14 unrelated skills picked up from this machine (a benchmark artifact, now fixed) | None |
| Thinking and effort | Adaptive thinking, `high` effort | The same |

Anthropic's guidance for Sonnet 5.5 says the model follows instructions literally, including ones that limit what it does. Galley's "keep changes focused" and "be concise" may make it more conservative when repairing a broken starter file or covering edge cases. That is a hypothesis to test, not a finding.

## 3. What does *not* explain it (checked in the logs)

| Hypothesis | Evidence | Verdict |
|---|---|---|
| OpenCode tests more often | Both ran their code in ~95% of tasks (Galley 97%, OpenCode 95%), about 1.1 code executions per task each | Not the cause |
| OpenCode thinks or writes more | Output tokens per run are similar: 155k vs 171k | Not the cause |
| Different tools in practice | Both did almost everything through the shell: about 2 shell commands per task, few dedicated file-tool calls | Not the cause |
| Infrastructure, timeouts, API errors | 0 infrastructure errors, 0 timeouts, every API call returned 200 | Not the cause |
| Different effort or model | Both at Sonnet 5.5, `high` effort (checked in the request logs) | Not the cause |

## 4. Why it shows on Claude but not on DeepSeek

Unknown, and it may simply be noise: Galley was +1 point on DeepSeek and −3 on Sonnet, and both gaps sit well inside the run-to-run variation. On Sonnet both agents solve a typical task in about three model calls, so the harness has little chance to make a difference either way.

## 5. The trade-off

OpenCode's larger prompt and tool descriptions cost more on Claude. Measured, it cost 2.4× more per run than Galley. About $1.25 per run of that came from the unrelated skills it picked up from this machine; on a clean machine the gap is about 2.0×.

## 6. What this means for improving Galley

The task-level evidence is too thin to justify a specific prompt fix on its own. The research in [`../research/beating-opencode.md`](../research/beating-opencode.md) sets out which methods have real evidence behind them, what each could gain, and how many runs it takes to prove a gain. Note that this analysis read transcripts from **holdout** tasks (forth, trinary, hexadecimal), so those tasks are no longer untouched for any change inspired by it.
