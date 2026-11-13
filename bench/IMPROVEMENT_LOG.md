# Galley improvement rounds vs OpenCode

The goal was to improve Galley until it beats OpenCode on the Polyglot benchmark (same model: DeepSeek-V4.1-Flash, no internet), within at most 20 rounds.

> **Corrections, 12 November 2026 (found while reviewing the plan).**
> 1. **OpenCode's DeepSeek pass rates below are inflated.** The benchmark sandbox let agents read hidden tests from other tasks' folders, and OpenCode did so in 22 task-runs across its four runs; Galley did not in any run. With those task-runs removed the comparison is Galley 68.8% vs OpenCode 65.5% (+3.3 points, 95% interval −2.0 to +8.6, p = 0.31): still a tie, but not the +1.0 shown below. Details in [RESULTS.md](RESULTS.md) and [`data/leak-audit.json`](data/leak-audit.json).
> 2. **Round 7 did not test the verifier from round 5.** The lean changes from round 6 were never taken out of the code (only the default was switched off), so the round 7 scale test ran the **lean** verifier, whose dev mean was 31.5, not the round 5 version that scored 35.5. The round 5 verifier has only ever had two dev runs. The table's "Reverted" for round 6 and the sentence "the verifier's dev gain did not hold up at scale" are both wrong as written.
>
> **Correction, 12 November 2026 (costs).** OpenCode's token and cost figures in this log include about 4,000 tokens per request of unrelated skills that it auto-loaded from this machine's `~/.claude/skills` folder. On DeepSeek that inflates its cost by an estimated 6% (about $0.05 per run), so the "12% cheaper" figure for Galley is closer to 6%. Pass rates are as measured. See [`../research/beating-opencode.md`](../research/beating-opencode.md) for the follow-up research.

## Method

- **Dev/holdout split.** The 101 scored tasks are split deterministically by a SHA-256 hash of the task name: **dev = 47 tasks**, **holdout = 54 tasks**. Changes were developed and judged on dev only. Holdout transcripts were never read for diagnosis.
- **What counts as "better" (fixed before iterating).** Galley must beat OpenCode on the holdout, and on repeated full runs lead by at least 5 points with a paired sign test p < 0.05, while staying cheaper.
- **Only general agent improvements.** Nothing specific to Exercism or this benchmark.
- **Measuring noise.** After round 1 showed ±4-task swings between identical setups, each change got 2 dev runs.

Raw per-task results and per-request token usage for every round are in [`data/rounds/`](data/rounds/). Total model spend for the rounds and the scale test was **$11.01** at DeepSeek's off-peak list price. These rounds ran outside DeepSeek's peak hours (weekdays 01:00 to 04:00 and 06:00 to 10:00 UTC, billed double), so that is also what they cost. The two full benchmark runs before them, on the morning of 11 November, ran largely inside peak hours and cost up to twice the figure computed at list price.

## Rounds

| Round | Change to Galley | Dev runs (of 47) | Mean | Cost per dev run | Decision |
|---|---|---|---|---|---|
| 0 | Baseline, after fixing a harness bug that hid Go reference files | 36 | 36.0 | $0.29 | – |
| 1 | Self-review before finishing; retry on dropped connections | 34 | 34.0 | $0.60 | **Keep retry** (robustness). Self-review made opt-in: 2× cost, no gain. |
| 2 | "Pin down the contract first" guidance in the system prompt | 33, 35 | 34.0 | $0.34 | Reverted: no gain, +20% cost |
| 3 | Confirmation: 2 full runs of each agent (see below) | 33, 36 | 34.5 | $0.66* | – |
| 4 | **Fix:** sandbox `/tmp` was wiped between commands, so scratch scripts vanished | 32, 33 | 32.5 | $0.28 | **Keep** (real bug, seen in transcripts) |
| 5 | Independent verifier: a fresh read-only helper tests the change and sends failures back | 35, 36 | **35.5** | $0.85 | Opt-in (`--verify`): best mean, but 3× cost and not significant |
| 6 | Lean verifier (12-step cap, one test script) | 32, 31 | 31.5 | $0.55 | Not made the default. The lean code stayed in `--verify` (correction 2 above). |
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

## Round 7: the verifier at scale

The verifier had the best dev mean in round 5, so a verifier was tested on all 101 tasks (in fact the lean one from round 6; see correction 2 above): Galley `--verify` twice, and OpenCode twice more, giving 4 OpenCode runs in total. During this run a stale proxy socket broke 42 of the Galley runs; they were discarded and re-run, and the harness now refuses to record a result when the agent couldn't reach the model.

| Tasks | Galley `--verify` (2 runs) | OpenCode (4 runs) | Difference [95% CI] | Sign test |
|---|---|---|---|---|
| All 101 | 69, 64 → 65.8% | 65, 72, 69, 68 → 67.8% | −2.0 pts [−7.9, 3.7] | p = 0.49 |
| Holdout 54 | 36, 33 → 63.9% | 34, 36, 33, 35 → 63.9% | 0.0 pts | p = 1.00 |

**The lean verifier showed no gain at scale**, and it roughly doubles cost ($1.32 vs $0.67 per full run). It stays an opt-in `--verify` flag and is not the default.

## Final standing (Galley defaults vs OpenCode 1.19.5, DeepSeek-V4.1-Flash, no internet)

| | Galley (2 full runs) | OpenCode (4 full runs) |
|---|---|---|
| Pass rate, all 101 tasks | **68.8%** (68, 71) | **67.8%** (65, 72, 69, 68) |
| Holdout (54) | 64.8% | 63.9% |
| Difference | +1.0 pts, 95% CI [−5.7, 5.9], sign test p = 0.63 | |
| Cost per full run | **$0.67** | $0.76 |
| Input tokens per run | about 11–12M | about 32M |

**Verdict after 7 rounds (of 20 allowed):** by the criteria fixed in advance, **Galley is not better than OpenCode on pass rate. They are tied**, within about ±6 points with 95% confidence. Galley achieves that tie with about 12% lower cost per run, about 3× fewer input tokens, and a sandbox that keeps the agent offline by default.

None of the harness changes moved pass rate beyond run-to-run noise: self-review, contract guidance, the verifier, and the lean verifier. With this model and benchmark, pass rate looks bound by the model. Further rounds of the same kind were stopped because the evidence says they won't change the verdict. A different model (for example Claude, where Galley's Anthropic-specific features apply) or a different benchmark would be needed to separate the two.

## Round 8: clean re-run on the fixed sandbox (12 November 2026)

After the leak was found, the benchmark sandbox was rebuilt and both agents were measured again on DeepSeek, three rounds, side by side. Full write-up: [RESULTS-clean.md](RESULTS-clean.md).

| | Galley | Galley with reasoning hand-off | OpenCode |
|---|---|---|---|
| Passes per round (of 101) | 71, 73, 69 → 70.3% | 69, 71, 73 → 70.3% | 66, 65, 63 → 64.0% |
| Cost per round | $0.65 | $0.65 | $0.58 |

- **Galley leads by 6.3 points** (interval +2.0 to +10.9, sign test p = 0.013). It does not cost less: 11% more per round, the same per solved task.
- **Reasoning hand-off:** no effect on pass rate or cost. Adopted for DeepSeek because it is the documented protocol.
- **Claude effort:** `medium` scored 87.1% against 88.1% for `high`, at 15% lower cost. `medium` is now the default.

**Verdict by the rule fixed in advance:** on DeepSeek the lead and the significance conditions are met on these tasks and the cost condition is not. The tasks are also the ones Galley was developed on. Confirmation needs fresh tasks.

None of Galley's earlier improvement rounds explains the lead: the Galley measured here is essentially the default configuration of rounds 3 and 7. What changed is the measurement. OpenCode had been reading hidden tests, and in the first valid comparison it scored about 4 points lower than before.

## Round 9: bringing Galley's DeepSeek cost under OpenCode's (design, written before running)

Round 8 left one condition of the win rule unmet on DeepSeek: Galley cost 11% more per round than OpenCode ($0.65 against $0.58). Two settings might close that gap. Both are off by default until measured.

| Setting | What it does | Why it might help |
|---|---|---|
| `lean` | A system prompt that names no project, so it and the tool list are identical in every session; the working directory and a short file listing go in the first message; guidance to skip commentary between steps, to edit existing files, and to save and re-run test scripts | More of each request is served from the provider's cache; less output |
| low reasoning effort | Sends `reasoning_effort: low` to DeepSeek (its default is `high`) | Reasoning is about half of Galley's cost on DeepSeek |

**Design.** Four Galley arms side by side, all 101 tasks, two rounds, outside peak hours: `galley` (today's default), `galley-lean`, `galley-low`, `galley-leanlow`. No OpenCode arm: its cost is known, and the comparison that decides the rule is the confirmation run.

**Rule, fixed in advance.**
- The effect of each setting is measured on the two arms that have it against the two that don't, pooled over both rounds.
- A setting is adopted if it lowers cost per task and its effect on the pass rate is not below −2.0 points.
- The adopted combination must cost at least 12% less per task than `galley` in these rounds. If none does, nothing changes.

Two rounds cannot detect a drop of 2 or 3 points with any confidence. The rule is a screen; the confirmation on fresh tasks is the test.

### Round 9 results (12 November, two rounds, outside peak hours)

| Arm | Passes per round (of 101) | Pass rate | Cost per round | Requests per round |
|---|---|---|---|---|
| `galley` (default) | 66, 64 | 64.4% | $0.71 | 1,103 |
| `galley-lean` | 69, 70 | **68.8%** | **$0.59** | 948 |
| `galley-low` | 66, 61 | 62.9% | $0.38 | 790 |
| `galley-leanlow` | 64, 65 | 63.9% | $0.36 | 767 |

| Setting | Effect on pass rate (arms with it against arms without) | Effect on cost per task | Decision by the rule |
|---|---|---|---|
| `lean` | +2.7 points (95% interval −1.2 to +6.7) | −13% | **Adopted** |
| low reasoning effort | −3.2 points (−7.2 to +0.7) | −44% | **Not adopted** (below the −2.0 limit). Kept as an option. |

- The adopted combination is `lean` alone. Its arm cost 17% less per task than `galley` in these rounds, above the 12% the rule asks for.
- With the lean prompt the first request of a task already hits the provider's cache (about 1,150 of 1,650 tokens), the model makes 14% fewer requests and writes 13% less.
- Low reasoning effort nearly halves the time per task (median 38 s against 67 s) as well as the cost. It is a real option for anyone who values speed and cost over the last few points.
- The default arm scored 64.4% here against 70.3% in round 8, with the same code. That is the run-to-run and day-to-day variation, and the reason every comparison is run side by side.
- Leak audit: no task-run flagged in either round. One runaway test program in each round used over 13 GB and was killed by the machine; the benchmark now caps memory per task.

The lean prompt is now Galley's only prompt.

## Confirmation on fresh tasks (design, written before running)

- **Tasks:** the JavaScript, Java and C++ exercises of the same benchmark, which neither agent has been run on. A task is included if its reference solution passes in the benchmark sandbox; that list is fixed before any agent runs.
- **Arms:** OpenCode 1.19.5 and Galley with whatever round 9 adopts, frozen. Four rounds, side by side, outside peak hours.
- **Verdict by the win rule:** Galley beats OpenCode if its pass rate is higher by 5 points or more, the sign test over tasks gives p < 0.05, and its cost per round at list price is lower. Anything else is reported as it falls.

**Fresh-task list, fixed on 12 November before any agent ran on them.** The reference solutions of all 122 JavaScript, Java and C++ exercises were graded in the benchmark sandbox. 121 pass and are included: JavaScript 48, Java 47, C++ 26. One is left out: `javascript/parallel-letter-frequency`, whose reference solution failed a test that depends on timing (it ran out of the test's 5-second limit on a busy machine).

### Confirmation results (12 and 13 November, four rounds)

Full write-up: [RESULTS-fresh.md](RESULTS-fresh.md).

| | OpenCode 1.19.5 | Galley (frozen at `61300b4`) |
|---|---|---|
| Passes per round (of 121) | 51, 54, 46, 53 | 61, 61, 67, 52 |
| Pass rate | 42.1% | **49.8%** |
| Cost per round | $0.71, $0.72, $0.82, $0.75 (mean **$0.75**) | $0.81, $0.84, $0.71, $0.95 (mean $0.83) |
| Cost per solved task | $0.0148 | $0.0138 |

| Win rule | Measured | Met |
|---|---|---|
| Lead of 5 points or more | +7.6 (95% interval +3.7 to +11.8) | Yes |
| Sign test p < 0.05 | 33 tasks better, 11 worse; p = 0.001 | Yes |
| Lower cost per round | 10% higher (interval 4% lower to 26% higher) | **No** |

**Verdict by the rule fixed in advance: not a win.** The lead is confirmed on tasks Galley was not developed on. The cost condition is missed, though the cost difference is within the noise of four rounds: Galley was the cheaper agent in round 3 and the dearer one in the other three.

- Leak audit: no task-run reached hidden tests in any round.
- Round 3 was interrupted by a pause after 154 of 242 task-runs and finished 4 hours 20 minutes later; finished task-runs were kept.
- Spend: $6.38, all outside peak hours.

What the logs say about the cost gap (observed, not tested):
- All of it is output. Galley's requests cost less than half of OpenCode's ($0.14 against $0.30 per round), but the model writes 52% more for it.
- The extra output comes after the first version of a solution: Galley writes about three times as much test code and changes its solution again in 41% of task-runs (OpenCode 29%). Its checks failed and led to a fix in 63 task-runs against 16, which is the likely source of the lead.
- Two defects account for most of the gap. In 2 of 484 task-runs the model launched helper agents (3 and 13 of them) to "recall" the hidden tests; they cost 6.4% of everything Galley spent. In 18% of task-runs the model saved a test script under `/tmp` as the prompt told it to, the file tool refused, and it wrote the script again; that cost about 1.9%. Without both, the gap would have been about 1% instead of 10%.

Both defects are fixed (commits `27a7407` and `1810aba`). Those changes are not measured, and the JavaScript, Java and C++ tasks are no longer fresh for the changed Galley.
