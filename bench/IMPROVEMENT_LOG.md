# Galley improvement rounds vs OpenCode

The goal was to improve Galley until it beats OpenCode on the Polyglot benchmark (same model: DeepSeek-V4.1-Flash, no internet), within at most 20 rounds.

## Method

- **Dev/holdout split.** The 101 scored tasks are split deterministically by a SHA-256 hash of the task name: **dev = 47 tasks**, **holdout = 54 tasks**. Changes were developed and judged on dev only. Holdout transcripts were never read for diagnosis.
- **What counts as "better" (fixed before iterating).** Galley must beat OpenCode on the holdout, and on repeated full runs lead by at least 5 points with a paired sign test p < 0.05, while staying cheaper.
- **Only general agent improvements.** Nothing specific to Exercism or this benchmark.
- **Measuring noise.** After round 1 showed ±4-task swings between identical setups, each change got 2 dev runs.

Raw per-task results and per-request token usage for every round are in [`data/rounds/`](data/rounds/). Total model spend for the rounds was **$6.82** at DeepSeek list prices.

## Rounds

| Round | Change to Galley | Dev runs (of 47) | Mean | Cost per dev run | Decision |
|---|---|---|---|---|---|
| 0 | Baseline, after fixing a harness bug that hid Go reference files | 36 | 36.0 | $0.29 | – |
| 1 | Self-review before finishing; retry on dropped connections | 34 | 34.0 | $0.60 | **Keep retry** (robustness). Self-review made opt-in: 2× cost, no gain. |
| 2 | "Pin down the contract first" guidance in the system prompt | 33, 35 | 34.0 | $0.34 | Reverted: no gain, +20% cost |
| 3 | Confirmation: 2 full runs of each agent (see below) | 33, 36 | 34.5 | $0.66* | – |
| 4 | **Fix:** sandbox `/tmp` was wiped between commands, so scratch scripts vanished | 32, 33 | 32.5 | $0.28 | **Keep** (real bug, seen in transcripts) |
| 5 | Independent verifier: a fresh read-only helper tests the change and sends failures back | 35, 36 | **35.5** | $0.85 | Opt-in (`--verify`): best mean, but 3× cost and not significant |
| 6 | Lean verifier (12-step cap, one test script) | 32, 31 | 31.5 | $0.55 | Reverted |
| – | *OpenCode 1.19.5, reference* | 31, 36 | 33.5 | $0.39 | – |

\* Full-run cost, all 101 tasks.

**Confirmation (round 3), all 101 tasks, 2 runs each:**

| Tasks | n | Galley runs → mean | OpenCode runs → mean | Difference [95% CI] | Sign test |
|---|---|---|---|---|---|
| All | 101 | 68, 71 → 68.8% | 65, 72 → 67.8% | +1.0 pts [−5.9, 6.4] | p = 0.54 |
| Dev | 47 | 33, 36 → 73.4% | 31, 36 → 71.3% | +2.1 pts | p = 0.42 |
| Holdout | 54 | 35, 35 → 64.8% | 34, 36 → 64.8% | 0.0 pts | p = 1.00 |

## What we learned

1. **Pass rate is bound by the model, and the noise is large.** The same Galley build scored anywhere from 31 to 36 of 47 on dev; OpenCode scored 31 and 36. Most remaining failures are under-specified conventions: a list vs a string, a property vs a method, which invalid inputs must raise an error. Whether the model guesses right varies from run to run. No change to the loop or the prompt moved the pass rate beyond that noise.
2. **The only lever that looked positive costs a lot.** The independent verifier gave the best two-run mean (35.5) by catching real mistakes in about 6% of runs, but at 3× the cost and time. It ships as an opt-in `--verify` flag.
3. **The real wins were robustness fixes found by reading transcripts:** a persistent private `/tmp` inside the sandbox, retrying when a stream drops, and harness fixes on the benchmark side.
4. **Cost.** Galley consistently sends about 3× fewer input tokens. Whether that makes it cheaper overall depends on how much output the model generates in a given run; per solved task the two have been between equal and about 30% in Galley's favour.

## Status after 6 of the allowed 20 rounds

By the criteria fixed at the start, **Galley has not been shown to beat OpenCode on pass rate**: the agents are statistically tied. Further loop and prompt tweaks are unlikely to clear the noise on this benchmark with this model, so the remaining rounds were paused pending a decision on direction.
