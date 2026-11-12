# Results: Galley vs OpenCode on Aider Polyglot

*Run on 11 November 2026. Model: DeepSeek-V4.1-Flash (`deepseek-flash`) for both agents. Tasks: 102 Python, Go and Rust exercises. Protocol and caveats: [README.md](README.md).*

> **Correction, 12 November 2026 (pass rates; found while reviewing the plan).** The benchmark's sandbox had holes that let an agent read hidden tests, and on DeepSeek OpenCode used them. Each agent could read the whole output folder of the run, where other tasks' workspaces sit with the hidden tests copied in after grading; the same exercise exists in several languages, so an agent on the Go or Rust task could read the Python task's tests. Agents also ran as root inside the sandbox and could undo its hiding of `/tmp`. An audit of every saved transcript ([`audit_leaks.py`](audit_leaks.py), results in [`data/leak-audit.json`](data/leak-audit.json)) found:
> - **OpenCode, DeepSeek:** 22 task-runs across its four runs (1, 8, 6 and 7) read hidden tests or a graded solution for their own exercise. On the 13 tasks involved it passed 82% of the time in those runs (18 of 22), against 53% on the same tasks in its other runs (16 of 30); Galley passed 51% on them.
> - **Galley:** none. Its own sandbox hides `/tmp` from the commands it runs, so it could not reach those folders.
> - **Claude Sonnet runs:** none, for either agent.
> - **Effect:** with the 22 task-runs removed, the pooled DeepSeek comparison is **Galley 68.8% vs OpenCode 65.5%, a difference of +3.3 points (95% interval −2.0 to +8.6, sign test p = 0.31)**, where the published figure was 68.8% vs 67.8% (+1.0). It is still a statistical tie. Removing runs after the fact is an approximation; both agents need re-running on a fixed harness.
> - **API key:** in 9 OpenCode task-runs the agent printed its environment, which included the DeepSeek API key, into local scratch logs. Nothing reached this repository or its history, and the scratch copies are redacted. The key should be rotated.
>
> The holes are listed in [README.md](README.md#known-holes-found-on-12-november-2026). They are not fixed yet; no further run should be trusted until they are.

> **Correction, 12 November 2026 (token and cost figures).** In these runs OpenCode auto-loaded 14 unrelated skills from this machine's `~/.claude/skills` folder and listed them in its system prompt, about 4,000 extra tokens on every request. That inflated its input-token count by roughly 13% and its cost by an estimated 6% (about $0.05 per run, because DeepSeek's cached input is very cheap). On a clean machine Galley's cost advantage on DeepSeek is therefore small. Pass rates are reported as measured. The harness now hides the host's agent configuration from both agents.

## Headline (clean run: no internet access for either agent)

| Agent | Pass rate | Python | Go | Rust | Median time / task | Model requests | Input tokens (cache hit) | Output tokens | Cost | Cost per solved task |
|---|---|---|---|---|---|---|---|---|---|---|
| **Galley** | **68/102 (66.7%)** | 21/34 | 25/39 | 22/29 | 40 s | 1,080 | **10.6M** (95.1%) | 828k | **$0.61** | **$0.0089** |
| **OpenCode 1.19.5** | **63/102 (61.8%)** | 16/34 | 25/39 | 22/29 | 33 s | 1,275 | 32.4M (94.7%) | 811k | $0.84 | $0.0133 |

**Pass rate is effectively a tie.** The two agents agree on 83 of 102 tasks. Of the 19 where they differ, Galley alone solved 12 and OpenCode alone solved 7. An exact McNemar test gives **p = 0.36**, so the 5-point gap is not statistically significant. Go and Rust are identical; the whole gap is in Python (21 vs 16).

**Galley costs less.** It sent **3.0× fewer input tokens** (10.6M vs 32.4M) and cost **27% less overall** ($0.61 vs $0.84), or **33% less per solved task**. The cause is structural and shows in every request: OpenCode sends a system prompt of about 22,300 characters with 10 tools, while Galley sends about 850 characters with 8 tools. Both get about 95% of input tokens served from DeepSeek's prompt cache. On a model whose cache reads are 50 times cheaper than fresh input, OpenCode's larger prompt costs less than you'd expect, but it still costs more.

**OpenCode is a little faster:** a median of 33 s per task against Galley's 40 s.

<details><summary>Paired detail</summary>

| Both pass | Only Galley | Only OpenCode | Neither |
|---|---|---|---|
| 56 | 12 | 7 | 27 |

- Only Galley: python/beer-song, python/hangman, python/grade-school, python/pov, python/react, python/simple-linked-list, python/sgf-parsing, go/food-chain, go/paasio, go/scale-generator, rust/bowling, rust/fizzy
- Only OpenCode: python/food-chain, python/bowling, go/matrix, go/octal, go/sublist, rust/accumulate, rust/react
</details>

## What went wrong along the way, and what it shows

### 1. With internet access, both agents fetched the hidden tests (run 1, discarded)

The first run gave each agent normal network access. Without being asked, both looked up the official Exercism tests (and sometimes the reference solutions) on GitHub:

| | Tasks with web lookups | Of those, passed | Pass rate in that run |
|---|---|---|---|
| OpenCode (`webfetch` tool, `curl`) | **35** | 33 | 83/102 (81.4%) |
| Galley (`curl` with `network: true`) | **3** | 3 | 64/102 (62.7%) |

This is the model's behaviour, not something either tool told it to do; DeepSeek reached for the canonical tests whenever it could. The two harnesses differ in how easy they make it:
- OpenCode has a built-in `webfetch` tool and no network boundary.
- Galley's commands run in a sandbox with networking switched off, and every `network: true` request needs approval. In this benchmark `--yes` auto-approved those requests. In interactive use, each would have prompted the user.

The run is kept in [`data/run1-internet-allowed/`](data/run1-internet-allowed/) as a record. **Lesson for anyone benchmarking coding agents: cut off internet access, or the scores measure web lookup, not problem solving.**

### 2. Harness crash during the clean run (fixed, affected runs redone)

Partway through the clean run, the logging proxy crashed on an upstream connection reset. The 102 runs after the crash never reached the model. Those runs were discarded and re-run once the proxy was hardened; the 104 runs before the crash were kept.

### 3. A Galley robustness gap

One Galley task (`go/sublist`) failed because the model's response stream was cut off mid-turn. Galley ends the turn on that error; OpenCode's client retries. That task counts as a loss for Galley above. **Retrying when a stream drops mid-response is a Galley fix to make.**

## Variance

A single run per agent is noisy. Galley's Python score was 14/34 with internet allowed and 21/34 without, using the same code. Treat differences of a few tasks as noise.

The **token and cost difference is robust**: it comes from the prompt and tool definitions each harness sends on every request, not from sampling.

## Bottom line

On this benchmark and this model, **Galley matches OpenCode's success rate (66.7% vs 61.8%, not significant) while sending a third of the input tokens and costing about a third less per solved task.** Galley also keeps the agent offline by default: in the internet-allowed run, OpenCode fetched answers from the web on 35 tasks; Galley did so on 3, and only because `--yes` auto-approved the requests.

This is evidence for Galley's "cheap models first" and "safety first" positioning. It does not show that Galley is a better problem solver. Areas for follow-up:
- Retry when a stream drops mid-response.
- Run several times per agent and add the remaining languages (JavaScript, Java, C++).
- Repeat with a frontier model (Claude) through Galley's Anthropic adapter.
- Run Terminal-Bench 2.0, which needs Docker-based task environments.
