# Results on the fixed benchmark: Galley vs OpenCode

*Run on 12 November 2026, on the benchmark sandbox fixed that day (see [README.md](README.md)). Two tests: a three-way comparison on DeepSeek-V4.1-Flash, and an effort test for Galley on Claude Sonnet 5.5. Tasks: the 101 scored Aider Polyglot exercises in Python, Go and Rust. The earlier results in [RESULTS.md](RESULTS.md) and [RESULTS-claude.md](RESULTS-claude.md) used the old sandbox.*

## Headline: DeepSeek-V4.1-Flash

Three rounds. In each round every task was run by all three configurations side by side, so they met the same conditions.

| | OpenCode 1.19.5 | Galley | Galley with reasoning hand-off |
|---|---|---|---|
| Passes per round (of 101) | 66, 65, 63 | 71, 73, 69 | 69, 71, 73 |
| **Pass rate** | **64.0%** | **70.3%** | **70.3%** |
| Cost per round | **$0.58** | $0.65 | $0.65 |
| Cost per solved task | $0.0090 | $0.0091 | $0.0092 |
| Median time per task | 49 s | 59 s | 59 s |
| Task-runs stopped at the 10-minute limit (of 303) | 1 | 2 | 2 |
| Task-runs that reached hidden tests (leak audit) | 0 | 0 | 0 |

**Galley minus OpenCode: +6.3 points** (95% interval +2.0 to +10.9). Galley did better on 21 tasks and worse on 7; sign test p = 0.013.

What this shows, and what it does not:
- **Galley's pass rate is higher than OpenCode's, and the difference is statistically significant.** That is a first for this project. The lead appears in all three rounds, in all three languages, and in both halves of the old dev/holdout split (+6.4 and +6.2 points).
- **Galley is not cheaper on DeepSeek.** It costs 11% more per round and the same per solved task. Galley sends fewer input tokens, but the model writes more for it: more reasoning, more test scripts and larger file writes.
- **Under the win rule, this is not yet a win.** The rule asks for a lead of 5 points or more, p < 0.05, and lower cost. The first two are met on these tasks; the third is not. These are also the tasks Galley was developed on, so the rule has to be judged on fresh tasks.

By language, pooled over the three rounds:

| | Python (34 tasks) | Go (38) | Rust (29) |
|---|---|---|---|
| OpenCode | 52.0% | 67.5% | 73.6% |
| Galley | 59.8% | 72.8% | 79.3% |
| Galley with reasoning hand-off | 57.8% | 75.4% | 78.2% |

## Why the picture changed from the earlier runs

| | Old sandbox, as published | Old sandbox, leak-affected runs removed | Fixed sandbox |
|---|---|---|---|
| OpenCode pass rate | 67.8% (4 runs) | 65.5% | **64.0%** (3 runs) |
| Galley pass rate | 68.8% (2 runs) | 68.8% | **70.3%** (3 runs) |
| Difference | +1.0 | +3.3 | **+6.3** |
| OpenCode cost per run | $0.76 | – | **$0.58** |
| Galley cost per run | $0.67 | – | **$0.65** |

- **OpenCode's score fell once it could no longer read hidden tests.** The clean figure (64.0%) is close to what the audit of the old runs had estimated (65.5%).
- **OpenCode's cost fell too.** Its prompt no longer carries the unrelated skills it used to pick up from this machine, and its searches now find nothing to read.
- **The agents still look.** OpenCode searched outside its workspace in 29% of task-runs and probed processes, its environment or the network in 24%. Galley did so in 16% and 2%. The audit after each round found that none of it reached a hidden test: the environment held only a placeholder key, and the one file of this repository in view was the relay script.

## Reasoning hand-off on DeepSeek: no measurable effect

DeepSeek's documentation says a model's earlier reasoning must be sent back while tools are in use. Galley had not been doing that. The third arm turned it on.

| | Galley | Galley with reasoning hand-off |
|---|---|---|
| Pass rate | 70.3% | 70.3% |
| Difference | | 0.0 points (interval −4.0 to +4.3) |
| Cost, three rounds | $1.94 | $1.95 |
| Reasoning tokens, three rounds | 1.66M | 1.69M |

It changed neither the pass rate nor the cost. My guess that it would cut repeated reasoning was wrong.

**Decision.** The rule set in advance was to adopt it if cost per task did not rise and the pass rate was not more than 2 points lower. Cost per task was half a percent higher, far inside the ±10% the same configuration varies between rounds, so I am treating that as no rise. It is now on by default for DeepSeek, because it is the documented protocol and costs nothing. It can be turned off in the provider settings.

## Claude Sonnet 5.5: `medium` effort matches `high` at lower cost

Galley only, `high` and `medium` side by side in one round, then a second `medium` round.

| | `high` (1 round) | `medium` (2 rounds) |
|---|---|---|
| Passes (of 101) | 89 | 86, 90 |
| Pass rate | 88.1% | 87.1% |
| Cost per round | $2.74 | **$2.32** |
| Median time per task | 15 s | 11 s |

Difference: 1.0 point (interval −3.5 to +5.4), sign test p = 0.75. Cost is 15% lower.

**Decision.** The rule was to adopt `medium` if cost fell and the pass rate stayed within 3 points. Both hold, so `medium` is now Galley's default effort. It is also the level Anthropic suggests as the starting point for agentic coding on Sonnet 5.5, and the API's own default on Opus 5.5 and Haiku 5.5.

OpenCode was not re-run on Claude. Its earlier result on the old sandbox was 90.1% at about $5.5 per run once the skills artifact is taken out, and the audit found those runs unaffected by leaks. So on Claude the picture is unchanged: OpenCode 2 to 3 points ahead, not significantly, and Galley now costs well under half as much.

## The win rule, as it stands

| Condition | DeepSeek, these 101 tasks | Claude Sonnet 5.5 |
|---|---|---|
| Lead of 5 points or more | Yes: +6.3 | No: Galley is 2 to 3 points behind |
| p < 0.05 | Yes: 0.013 | No |
| Cheaper | **No: 11% more per round, equal per solved task** | Yes: under half the cost |
| Judged on fresh tasks | Not yet | Not yet |

## What went wrong during the campaign

1. **One round was thrown away.** The first DeepSeek round exposed a fault in a mode I had just added to Galley so that its own sandbox could run inside the benchmark's. A test process left running by a command kept the command open, and six Galley task-runs sat idle until the 10-minute limit. It handicapped only the Galley arms, so the round was discarded and Galley fixed before the three rounds reported here. The discarded round (Galley 66.3% and 69.3%, OpenCode 64.4%) is kept in the data folder, marked invalid.
2. **Two interruptions.** The session stopped twice. The third round was interrupted after 65 of 309 task-runs and resumed two hours later. Finished task-runs were kept; the rest ran again. Costs count only the attempt that produced each result.
3. **Two memory kills.** A test program in one arm grew to 13.8 GB in the discarded round, and another to 12.2 GB in round 2. The machine killed only the runaway process each time. The harness does not cap memory per task; that is a known gap.
4. **Two false alarms from my own tooling.** The harness reported "no answer from the model" for a task where OpenCode's probing had printed the words it looks for; the task is excluded from scoring and the check now reads the proxy's log instead. The leak audit flagged a run where OpenCode read its own session notes, in which it had written the public test suite from memory; reads of an agent's own notes are no longer counted.

## Spend

| | Cost |
|---|---|
| DeepSeek, three valid rounds | $5.79 |
| DeepSeek, discarded round and the round aborted after it | $2.17 |
| Claude Sonnet 5.5, three rounds | $7.48 |
| Smoke tests | $0.13 |
| **Total** | **$15.58** |

Parts are rounded. About $14 was planned. The overrun is the discarded round.

## Caveats

- **These are development tasks.** Galley's earlier improvement rounds used them. A claim that Galley beats OpenCode needs the same result on tasks neither has been tuned on.
- **One cheap model, one version of each agent, three languages.** `deepseek-flash` is an alias and can change.
- **Galley changed during the campaign,** each time for a fault, not to raise the score: as root it now drops capabilities; it can run inside another sandbox; it stops processes a command leaves behind. The three rounds reported here all ran on the final version.
- **In this harness Galley's sandbox runs nested,** sharing the process list with Galley itself. On an ordinary machine it has a process list of its own.
- **Twelve task-runs ran at once on four CPUs.** Slow builds may have pushed a few task-runs over the time limit; the limit hit all arms.

## Data and how to reproduce

Raw results, per-request usage and the leak audit are in [`data/clean-2026-11-12/`](data/clean-2026-11-12/).

```bash
python3 -I bench/analyze_rounds.py deepseek bench/data/clean-2026-11-12 ds-1,ds-2,ds-3 opencode galley galley-sr
python3 -I bench/analyze_rounds.py sonnet   bench/data/clean-2026-11-12 sonnet-effort-1,sonnet-effort-2 galley galley-medium
```

To run a round again (see [README.md](README.md) for setup):

```bash
BENCH_VARIANTS='{"galley-sr":{"providerOpts":{"sendReasoning":true}}}' CONCURRENCY=12 bench/round.sh ds-1 all opencode,galley,galley-sr
```

The Galley arm in these rounds had the reasoning hand-off off and `high` as its default effort (effort is not sent to DeepSeek). Both defaults changed after the campaign, so today's default Galley on DeepSeek corresponds to the third column of the headline table.
