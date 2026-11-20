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

## Round 10: do the two fixes do harm? (design, written before running)

Since the version frozen for the confirmation (`61300b4`) Galley has changed in two ways, both prompted by that campaign's logs:
- The file tools reach the sandbox's `/tmp`, where the prompt tells the model to keep test scripts (`27a7407`).
- The description of the helper-agent tool says what helpers are for, and helpers run at low reasoning effort (`1810aba`).

**Design.** Two arms side by side on the 121 JavaScript, Java and C++ tasks, which are development tasks now: `galley-old` (the frozen copy the confirmation used) and `galley-new` (today's Galley). Two rounds, six task-runs at a time, outside peak hours, about $3.50.

**What two rounds can show.** Not the saving. The helper-agent defect appeared in 2 of 484 task-runs, so two rounds will often contain none, and the cost of a whole round swings by 15% between identical rounds. This round is a check for harm and a check that the two mechanisms behave as intended.

**Rule, fixed in advance.** `galley-new` goes forward to the confirmation below if all four hold:
1. Its writes are refused for being outside the workspace in at most 2% of its task-runs (the old version: 18%).
2. In none of its task-runs do helper agents use more than 20,000 output tokens (the old version: 134,000 and 187,000).
3. Its pass rate, pooled over both rounds, is not more than 4.0 points below `galley-old`'s. Two rounds cannot tell a smaller gap from noise: the standard error of this difference is about 3 points.
4. Its typical cost is not more than 5% above `galley-old`'s. Typical cost is the mean cost per task-run after leaving out each arm's dearest 5% of task-runs, so that one runaway task-run does not decide it.

If any of them fails, nothing goes forward and I report.

### Round 10 results (13 November, two rounds, outside peak hours)

| | `galley-old` (`61300b4`) | `galley-new` (`de69760`) |
|---|---|---|
| Passes per round (of 121) | 54, 55 | 55, 60 |
| Pass rate | 45.0% | 47.5% |
| Cost per round | $0.86, $0.84 (mean $0.85) | $0.67, $0.73 (mean **$0.70**) |
| Typical cost per task-run (without each arm's dearest 5%) | $0.0056 | $0.0049 |
| Task-runs with a write refused for being outside the workspace | 51 of 242 (21%) | 0 |
| Task-runs that used helper agents | 1 (16 helpers, 83,000 output tokens, $0.10, hit the time limit) | 0 |

| Condition | Measured | Met |
|---|---|---|
| 1. Refused writes in at most 2% of task-runs | 0% | Yes |
| 2. No task-run with more than 20,000 helper output tokens | none used helpers | Yes |
| 3. Pass rate not more than 4.0 points lower | 2.5 points higher (95% interval −3.3 to +8.3) | Yes |
| 4. Typical cost not more than 5% higher | 11% lower | Yes |

**Decision by the rule: `galley-new` goes forward to the confirmation.**

- **The saving is larger than the logs suggested.** The whole round cost 17.5% less (95% interval 29% to 5% less), where the arithmetic on the earlier logs had put the two defects at about 8%. Once the model could save a test script under `/tmp` with the file tool, it wrote a third less code inside shell commands (2,700 characters per task-run against 4,300) and made 10% fewer requests.
- **The helper-agent defect appeared again in the old version,** on the same task as in the confirmation (Java `variable-length-quantity`): 16 helpers asked to recall the hidden test file. The new version used no helpers in 242 task-runs.
- **The pass rate did not suffer.** The difference of +2.5 points is well inside the noise of two rounds.
- One task-run of each version hit the 10-minute limit. The new version's was a stress test of its own that the model started with a 10-minute command timeout.
- Leak audit: no task-run reached hidden tests. Spend: $3.15, including a smoke test of the new tasks ($0.02) and the task-runs lost when the machine restarted during round 1.

Data: [`data/round10-2026-11-13/`](data/round10-2026-11-13/).

## Second confirmation, on a new set of fresh tasks (design, written before running)

The JavaScript, Java and C++ tasks are used up: Galley has been changed in the light of their logs. This confirmation needs tasks neither agent has been run on.

- **Tasks.** Exercises from three Exercism tracks this project has not touched: PHP, TypeScript and Ruby, at the commits pinned in `setup_tracks.sh`. An exercise is included if it shares its name with an exercise of the Polyglot benchmark (in any of its six languages), is active in its track, and its reference solution passes in the benchmark sandbox. Of 183 candidates 181 pass: PHP 61, TypeScript 58, Ruby 62. Left out: `typescript/crypto-square` (its reference solution fails one of the track's own tests) and `typescript/pythagorean-triplet` (its reference solution does not finish within the 5-minute grading limit once every test is enabled). The list is in [`data/tracks2-tasks.txt`](data/tracks2-tasks.txt) and was fixed on 13 November, before any agent ran on these tasks.
- **Protocol.** As before: Aider's prompt, hidden tests, one attempt, the same sandbox with no network. Grading uses each track's own test command without the parts that need the network: `ruby` on the test file (minitest), PHPUnit 11.5 on the test file, and `jest` for TypeScript (the track's implementation tests; its separate type check is not run). Tests the tracks mark as skipped are enabled, as before. Any file that looks like a test (a test template, a benchmark test) is hidden along with the listed tests.
- **Ruby is the hard case for both agents.** Its starting files name no classes or methods, so the agent has to infer what the hidden tests will call. The C++ exercises of the Polyglot set are the same.
- **Arms.** OpenCode 1.19.5 and the Galley that comes out of round 10, frozen first. Side by side, six task-runs at a time, outside peak hours.
- **Rounds.** Four. If the first round costs more than $2.30 for both agents together, three, to keep the campaign near $9. That choice depends on cost alone.
- **Before round 1,** a smoke test: one task per language, both agents, to check the harness.
- **Verdict by the win rule, unchanged:** Galley beats OpenCode if its pass rate is higher by 5 points or more, the sign test over tasks gives p < 0.05, and its cost per round at list price is lower. Anything else is reported as it falls.

What I expect: the lead conditions are more likely than not to be met again. The cost condition is close to a coin toss, because with the two defects fixed the estimate from the logs is parity.

### Second confirmation results (13 and 14 November, four rounds)

Full write-up: [RESULTS-fresh2.md](RESULTS-fresh2.md).

| | OpenCode 1.19.5 | Galley (frozen at `de69760`) |
|---|---|---|
| Passes per round (of 181) | 88, 100, 94, 91 | 104, 94, 104, 96 |
| Pass rate | 51.5% | **55.0%** |
| Cost per round | $0.89, $1.03, $1.00, $0.94 (mean $0.97) | $0.89, $0.86, $0.88, $0.78 (mean **$0.85**) |
| Cost per solved task | $0.0104 | $0.0086 |

| Win rule | Measured | Met |
|---|---|---|
| Lead of 5 points or more | +3.5 (95% interval −0.3 to +7.3) | **No** |
| Sign test p < 0.05 | 50 tasks better, 36 worse; p = 0.16 | **No** |
| Lower cost per round | 12% lower (interval 21% to 2% lower) | Yes |

**Verdict by the rule fixed in advance: not a win.** The cost condition, missed in the first confirmation, is met. The lead is positive in three rounds of four but smaller than on the first set of fresh tasks, and the interval includes zero. By language the lead is 0.8 points in PHP, 6.5 in TypeScript and 3.2 in Ruby.

- Leak audit: no task-run reached hidden tests.
- Round 1 was split by the model account running out of balance, round 4 by a pause; the task-runs they touched were run again.
- Spend: $7.40, all outside peak hours.

### A flaw found afterwards: Galley could not reach the shared test tools

Galley's sandbox gives commands a private `/tmp`. The benchmark kept the shared test tools under `/tmp`: the `node_modules` of the JavaScript and TypeScript exercises, the Java test libraries, and PHPUnit. OpenCode's commands could use them; Galley's could not. Over both confirmations jest ran for OpenCode in 88 task-runs and for Galley in none of the 246 where it tried.

- It touches Galley's JavaScript and Java results (first confirmation, round 10) and its TypeScript and PHP results (second confirmation). Python, Go, Rust, C++ and Ruby are not affected.
- It works against Galley only. How much is not measured, and no result above is corrected for it.
- Fixed in the harness: the shared tools now live outside `/tmp` (`/opt/bench-deps` by default), and the self-test repeats every tool check from inside Galley's own sandbox. On the old set-up that check fails.
- For Java one difference remains: inside Galley's sandbox Gradle starts without the warm cache the harness prepares, so its first build is slower.

## Third confirmation, on a third set of fresh tasks and the corrected benchmark (design, written before running)

The second confirmation was run on a benchmark that kept test tools where Galley could not reach them, and its tasks are used up: I read those transcripts to find the flaw. This confirmation repeats it on tasks neither agent has been run on, with the flaw fixed.

- **Tasks.** Exercises from three more Exercism tracks: C, C# and Elixir, at the commits pinned in `setup_tracks.sh`. The selection rule is the same: an exercise is included if it shares its name with an exercise of the Polyglot benchmark, is active in its track, and its reference solution passes in the benchmark sandbox with every test enabled. All 201 candidates pass: C 43, C# 82, Elixir 76. The list is in [`data/tracks3-tasks.txt`](data/tracks3-tasks.txt) and was fixed on 14 November, before any agent ran on these tasks.
- **Arms.** OpenCode 1.19.5 and Galley as frozen at `de69760`, the version of the second confirmation. Nothing under `galley/` has changed since. Same model (`deepseek-flash`), side by side, six task-runs at a time, outside peak hours.
- **Protocol.** As before: Aider's prompt, hidden tests, one attempt, a 10-minute limit, the same sandbox with no network. Grading runs each track's own test command on the agent's final workspace: `make` for C (the exercises carry their test framework), `dotnet test` for C# (.NET 10 and xUnit, packages from an offline folder), `mix test --include pending` for Elixir. Tests the tracks mark as skipped, ignored or pending are enabled. Build files are not restored, as before.
- **What is different in the benchmark.** The shared test tools live outside `/tmp`. The self-test builds and tests a one-test C# project and a one-test Elixir project twice: in the benchmark's sandbox, and from inside Galley's own sandbox, started from the environment a task gets. With the C# fix below removed, it fails in both.
- **Settings for the new languages, the same for both agents and for grading.** C# tasks run with `/tmp` as the home folder, because the .NET tools need a writable one and the real one is read-only in both sandboxes; and with the .NET build and compiler servers turned off, so that no process outlives a command. Elixir's build tool keeps its state under `/tmp` too.
- **Before round 1,** a smoke test: `acronym` in each language, both agents, once. I read those six transcripts for one thing only: whether each agent's own commands could build and run tests in each language. That is the check that was missing before. If it shows a fault in the benchmark, I fix the benchmark and repeat the smoke test. Galley is not changed, whatever it shows.
- **Rounds.** Four. If the first round costs more than $2.15 for both agents together, three. If it costs more than $2.90, I stop after it and ask. That choice depends on cost alone. Planned spend: about $8.
- **Interruptions** (a machine restart, a pause, the model account running dry). An interrupted task-run is run again. If a task's two arms did not both finish in the same session, both are run again. Costs count only the attempt that produced each result.
- **Verdict by the win rule, unchanged:** Galley beats OpenCode if its pass rate is higher by 5 points or more, the sign test over tasks gives p < 0.05, and its cost per round at list price is lower. The verdict rests on these rounds alone, not on a pool with earlier ones. Anything else is reported as it falls.
- **Also reported, outside the rule:** results by language; for each agent, in how many task-runs the track's test tool ran from the agent's own commands; how many failed gradings come from files the agent left behind (a second `main`, a failing test of its own); how many task-runs changed a build file; the leak audit.

What this can show: with about 200 tasks and four rounds the interval on the lead is about 4 points either side. If the true lead is 5 points, the measured lead reaches 5 about half the time. What I expect: Galley cheaper again, the lead positive, and about even odds that it reaches 5 points with p < 0.05.

### Third confirmation: smoke test (14 November, before round 1)

`acronym` in C, C# and Elixir, both agents, once: $0.01. Both agents passed C# and Elixir and failed C, where the hidden tests expect a result the caller can free and a null result for an empty phrase.

- The check it was run for: each agent's own commands compiled and ran code in every language. OpenCode ran `gcc`, `dotnet build` and `mix test`; Galley ran `gcc`, `dotnet run` and `mix run`.
- No fault in the benchmark showed, and nothing was changed in Galley or in the harness code. The frozen copy for the rounds is commit `b581d78`.
- One addition to the self-test afterwards: its one-test C# project now has the exercises' own settings and `packages.lock.json`, so the check restores packages exactly as an exercise does. It passes in both sandboxes. The project lives in the shared tools folder, outside the frozen code.

### Third confirmation: an agent reached a stronger model through the benchmark's proxy (found 14 November, during round 2)

Written at 08:45 UTC on 14 November. Round 1 was complete and its results known; round 2 had 188 of 402 results, which I had not looked at; round 3 had not started.

- **What happened.** The proxy that adds the API key forwarded any request an agent sent it. In round 1 OpenCode's agent, after failing to download the exercise's tests, found the proxy from inside its sandbox, listed the account's models, and asked a stronger model (`deepseek-v4-pro`) to recall the official test file. It did this by hand in one recorded task-run, C `all-your-base`, which it then passed; Galley failed that task on a function name only the hidden tests hold.
- **How often.** In three recorded task-runs over all campaigns, all OpenCode's: one in the first confirmation and one in the second (both failed anyway), and this one. Galley's agent never did it. No earlier verdict changes.
- **Why it matters.** The design says both agents use the same model. An answer from another model breaks that. The costs are also understated a little: those requests were priced as the benchmark's model.
- **Fix, from the rest of round 2 on.** The proxy now forwards only the chat endpoint and only the round's model, and refuses the rest itself. The self-test checks both from inside the sandbox, and the audit flags any answer obtained from another model (`other_model`) or by a hand-made request (`model_by_hand`). The frozen copy keeps everything else; only `proxy.ts` and `round.sh` are replaced, from this commit.
- **Rule for affected tasks, fixed now.** A task in which either agent got an answer from another model is run again for both agents once round 3 is done, and the new results replace the first in the verdict. The first results are kept and reported, and I give the comparison both ways.
- **Still allowed.** An agent may put its own question to the benchmark's model through the proxy. It is the same model, the tokens are counted, and the audit reports how often it happens.
- **Not caught earlier because** the audit read the agents' tool calls for file access and did not look at which model a request named.

### Third confirmation results (14 November, three rounds)

Full write-up: [RESULTS-fresh3.md](RESULTS-fresh3.md).

| | OpenCode 1.19.5 | Galley (frozen at `de69760`) |
|---|---|---|
| Passes per round (of 201) | 140, 148, 149 | 150, 147, 146 |
| Pass rate | 72.5% | **73.5%** |
| Cost per round | $1.13, $1.04, $1.13 (mean $1.10) | $1.03, $1.00, $0.92 (mean **$0.98**) |
| Cost per solved task | $0.0076 | $0.0067 |

| Win rule | Measured | Met |
|---|---|---|
| Lead of 5 points or more | +1.0 (95% interval −1.8 to +4.0) | **No** |
| Sign test p < 0.05 | 28 tasks better, 23 worse; p = 0.58 | **No** |
| Lower cost per round | 11% lower (interval 19% to 2% lower) | Yes |

**Verdict by the rule fixed in advance: not a win.** On the corrected benchmark the two agents pass the same share of tasks within the noise, and Galley is the cheaper one. By language the lead is −2.3 points in C, +4.5 in C# and −0.9 in Elixir.

- The task where OpenCode's agent had asked a stronger model was run again for both agents; both failed it. As first measured the lead is +0.8 points. The verdict is the same.
- Three rounds: round 1 cost $2.21, over the $2.15 set for running four.
- Two machine restarts; four results were set aside under the interruption rule and their pairs run again.
- A fault of mine after round 3: the script applying that rule took the hardened proxy's 403 to an agent's probe for an account outage and set four results aside. They are restored; the re-runs it caused are not used.
- Audit: no task-run of the final results reached hidden tests, got an answer from another model, or put its own request to the model.
- Spend: $7.59, of which $1.08 for the diagnostics below.

### What the third confirmation taught

1. **Most failures are details only the hidden tests define.** Exact error messages, names of functions the tests call, error types, a trailing newline. 16 of the 76 Elixir tasks need message text that appears in no file the agent can see; 14 of the 43 C tasks are called by names the starting header does not declare. Both agents pass a fifth to a quarter of the first group and 60% of the second, against about 80% of everything else.
2. **The agents get those right only from the model's memory of the public exercises.** The model says so in its reasoning, and reproduces canonical error messages word for word. Galley's solutions held 53% of the hidden messages and OpenCode's 37%; task by task, where every message has to be right, they are level.
3. **Nothing I tried raises that recall.** Writing the test file first lowers it (14%). Reasoning effort makes no real difference (every message right in 26%, 30% and 34% of samples at `low`, default and `max`), and `max` costs 56% more output than the default.
4. **So the harness has little to work with on this benchmark.** Failures a better self-check could have caught are a few task-runs per round. That matches round 7's conclusion that the pass rate is bound by the model.
5. **The lead is not one number.** +7.6, +3.5 and +1.0 points on the three fresh sets differ by more than chance alone explains (p about 0.03). Pooled over the 503 tasks it is +3.5 points (95% interval +1.4 to +5.5, p = 0.003).
6. **An agent will use any door left open.** OpenCode's agent went from a blocked download to the proxy's socket, to the account's model list, to a stronger model, in one task-run. The proxy now serves one endpoint and one model.

## A second attempt with the test output: pilot (design, written before running)

With one attempt and hidden tests, most failures are details the agent cannot know (see above), so the comparison says little about the harness. Aider's own benchmark, which these tasks come from, scores two tries: after a failed first try the model is shown the failing test output and tries again. That takes the hidden detail out of the lottery and tests something a harness does control: using feedback.

- **What the harness now does with `BENCH_ATTEMPTS=2`.** A task whose first attempt fails grading gets a second attempt in the same session. The agent is sent the test output (colour codes, timings and this machine's paths removed; at most about 16,000 characters) followed by Aider's wording: "See the testing errors above. The tests are correct, don't try and change them. Fix the code in <files> to resolve the errors." The tests themselves are removed from the workspace again first, so the agent sees their output, not the files. Grading then runs once more. A result records both outcomes: `pass` for the first attempt, as before, and `pass2` after both.
- **Differences from Aider's benchmark.** Aider leaves the test files on disk, which matters little for a tool that only reads files it is given and would matter for an agent with a shell. Aider does not cap the output. Both agents here are shell agents and get the same treatment.
- **The pilot.** All 201 C, C# and Elixir tasks of the third confirmation, which are used up, one round, both agents, the same frozen Galley (`de69760`) and OpenCode 1.19.5, the hardened proxy. About $2.50.
- **What it is for.** It is not a verdict and cannot be one: the tasks are used up and the win rule is defined on one attempt. It tells whether the two agents differ once feedback is available, and by roughly how much.
- **What I will do with it.** If, after two attempts, Galley is ahead by 3 points or more, or cheaper per solved task by 10% or more, I will propose a confirmation on fresh tasks (Bash, Lua and Tcl are prepared) under a rule the user agrees to. Otherwise I report that the two are level under this protocol too.
- **Smoke test done:** four tasks, both agents ($0.13). Failures caused by a hidden message or error type were fixed on the second attempt by whichever agent had failed; the audit treats what the harness showed the agent as known to it.

### Pilot results (14 November, one round, 201 used-up tasks)

| | OpenCode 1.19.5 | Galley (frozen at `de69760`) |
|---|---|---|
| Passed on the first attempt | 144 (71.6%) | 155 (77.1%) |
| Second attempts, and how many of them passed | 57, 51 (89%) | 46, 40 (87%) |
| **Passed after both attempts** | **195 (97.0%)** | **195 (97.0%)** |
| Cost of the round | $1.47 | **$1.25** |
| Cost per solved task | $0.0075 | $0.0064 |

- **After two attempts the two agents are exactly level:** 195 of 201 each (95% interval for the difference ±2.5 points). Each still fails six tasks, two of them the same.
- **The second attempt does what the first cannot.** It fixes nearly nine failures in ten for both agents, because the test output shows the detail that was hidden. With it both agents are near the ceiling, so pass rate no longer separates them.
- **Galley is cheaper here too:** 15% per round (95% interval 30% lower to 3% higher, from one round) and 15% per solved task. A second attempt costs about half a cent for either agent.
- **By language, after both attempts:** C 97.7% against 95.3%, C# 100% against 96.3%, Elixir 93.4% against 98.7%.
- **First attempt in this round:** Galley ahead by 5.5 points (p = 0.07). It is a fourth run of used-up tasks and changes nothing in the third confirmation; it shows again how much one round moves.
- Audit: nothing counts as contamination. One OpenCode task-run put a question of its own to the benchmark's model through the proxy, which is allowed; that task failed both attempts.
- One Galley task-run hit the 10-minute limit in each attempt, and one of OpenCode's in the first.
- Spend: $2.85 with the smoke test.

**What follows from it.** By the criteria set before the pilot, the pass-rate one is not met (no lead after two attempts) and the cost one is (15% cheaper per solved task). So the comparison that the data can support is not "more tasks solved" but "the same tasks solved for less". Whether to confirm that on fresh tasks, and by what rule, is the user's decision.

## Fourth confirmation: fresh tasks, both attempts recorded (design, written before running)

Three confirmations have not met the rule, and the pilot shows why the comparison changes with feedback: after a second attempt both agents solve the same share and Galley costs less. This confirmation measures both things on tasks neither agent has been run on, with the proxy hardened from the start. I asked the user which rule to apply; the question was declined, so the user's rule stays as it is and the second comparison is reported beside it.

- **Tasks.** 200 exercises from Exercism's Bash, Lua and Tcl tracks, at the commits pinned in `setup_tracks.sh`, chosen by the same rule as before. 200 of the 201 candidates have a reference solution that passes in the sandbox; `tcl/sgf-parsing` is left out because its reference solution needs a newer Tcl than the machine's. The list is in [`data/tracks4-tasks.txt`](data/tracks4-tasks.txt), fixed on 14 November before any agent ran on these tasks. Three Bash tests stay skipped by the track's own conditions (two need a terminal, one is optional extra credit).
- **Arms.** OpenCode 1.19.5 and Galley as frozen at `de69760`. Nothing under `galley/` has changed since. Same model, side by side, six task-runs at a time, outside peak hours.
- **Protocol.** As in the third confirmation, plus the second attempt described above (`BENCH_ATTEMPTS=2`). The first attempt is exactly the protocol of the earlier confirmations. Grading: `bats` with the track's skipped tests enabled, `busted`, and `tclsh` on the test file with the track's skipped tests enabled.
- **Rounds.** Three. If round 1 costs more than $3.30 for both agents together, I stop after it and report. Planned spend: about $8.
- **Before round 1,** a smoke test: `acronym` in each language, both agents. I read those transcripts for two things only: whether each agent's own commands can run the language's tools, and whether the second attempt works. Galley is not changed, whatever it shows.
- **Interruptions and protocol breaches** as in the third confirmation: an interrupted task-run is run again; if a task's two arms did not both finish in the same session, both are run again; a task in which an agent got an answer from another model is run again for both (the proxy now refuses that).
- **The user's rule, unchanged, on the first attempt. This is the verdict.** Galley beats OpenCode if its first-attempt pass rate is higher by 5 points or more, the sign test over tasks gives p < 0.05, and its cost per round is lower. Cost here counts the first attempts only, as in the earlier confirmations.
- **A second question, reported beside it. It is not the user's rule.** Does Galley reach the same results for less? I will answer yes if, after both attempts, the 95% interval for the difference in pass rate (Galley minus OpenCode) lies wholly above −3 points, and the 95% interval for Galley's cost relative to OpenCode's, counting both attempts, lies wholly below zero. The two thresholds are fixed here so that they cannot be chosen afterwards. Whether a yes counts as beating OpenCode is for the user to say.
- **Also reported:** results by language, the counts from `track_checks.py` for the first attempts, the audit.

What I expect: the user's rule is not met (about one chance in five). The second question is more likely than not answered yes: after two attempts both agents should be near the ceiling, and Galley has been 11 to 15% cheaper in every campaign since its two fixes.

### Fourth confirmation: smoke test (14 November, before round 1)

`acronym` in Bash, Lua and Tcl, both agents, once: $0.02. Five of the six first attempts passed; OpenCode's Bash attempt failed and passed on its second attempt.

- Each agent's own commands ran the language's tools: Bash scripts, `lua` and `busted`, `tclsh`.
- The second attempt worked as designed. No fault in the benchmark showed, and nothing was changed. The frozen copy for the rounds is commit `c334e2a`.

### Fourth confirmation: a fault in the second-attempt code, found and fixed in round 1 (14 November)

- **What happened.** The second attempt's message is passed to each agent on its command line. Lua's test runner starts its output with a row of dashes, and a message that begins with a dash is taken for an option by both agents' command lines: OpenCode printed its help text, Galley found no prompt. Neither called the model.
- **What it touched.** Four task-runs in round 1, two of each agent (one Bash, three Lua). The harness refuses to record a task-run in which the agent got no answer from the model, so none of them is in the results.
- **Fix.** The message now starts with an empty line. Nothing else in it changes. I stopped the round at 114 results to apply it; the frozen copy's `run.ts` is replaced by the one of this commit. Results recorded before the fix stay, because a second attempt either ran normally or was not recorded.
- **The pilot was not affected:** none of the C, C# or Elixir test outputs begins with a dash, and it recorded no such error.
- **Also on 14 November:** the machine restarted at 16:42 and 16:53 UTC. Five results whose other arm had not finished were set aside and their pairs run again.

### Fourth confirmation results (14 November, one round)

Full write-up: [RESULTS-fresh4.md](RESULTS-fresh4.md). The run stopped after round 1 by the cost rule: it cost $6.01 against the $3.30 set in the design.

| | OpenCode 1.19.5 | Galley (frozen at `de69760`) |
|---|---|---|
| Passed on the first attempt (of 200) | 70 (35.0%) | 79 (39.5%) |
| Passed after both attempts | 168 (84.0%) | 169 (84.5%) |
| Cost of the first attempts | $2.40 | $1.88 |
| Cost of the round, both attempts | $3.14 | $2.88 |

| The user's rule, first attempt | Measured | Met |
|---|---|---|
| Lead of 5 points or more | +4.5 (95% interval −0.5 to +9.5) | **No** |
| Sign test p < 0.05 | 18 tasks better, 9 worse; p = 0.12 | **No** |
| Lower cost per round | 22% lower (interval 33% to 9% lower) | Yes |

| The second question, after both attempts | Measured | Met |
|---|---|---|
| Interval for the pass-rate difference wholly above −3 points | +0.5 (interval −4.5 to +5.5) | **No** |
| Interval for the cost difference wholly below zero | 8% lower (interval 20% lower to 6% higher) | **No** |

**Verdict by the user's rule: not a win.** The second question is not shown either: the measured values are level results at lower cost, but one round cannot exclude a 3-point deficit or a cost tie.

- By language, first attempt: Bash +7.5 points, Lua +6.0, Tcl +1.2. After both attempts: Bash +5.7, Lua +1.5, Tcl −3.8.
- Pooled over the four fresh sets (703 tasks), first attempt: +3.8 points (95% interval +1.8 to +5.8, p = 0.001).
- Audit: nothing counts as contamination. The proxy refused 49 requests from agents for other endpoints and 2 for another model.
- Spend: $6.63.

### What the fourth confirmation taught

1. **Galley cannot resume a session that was cut off in the middle of a step.** Twice its first attempt hit the 10-minute limit while a command was running; the resumed session ended in tool calls without results, the API refused it, and the second attempt never started. Both count as failures. This is a real defect and the first thing the second attempt found that the one-attempt protocol could not.
2. **The harness must not take every unanswered request for an outage.** It had skipped those two task-runs and run them again. It now grades a task-run whose requests the API refused as invalid, and the two results are corrected.
3. **A message passed on a command line must not begin with a dash.** Both agents' command lines took such a message for an option.
4. **Galley's second attempts are dearer than OpenCode's** ($0.0083 against $0.0057 each). Its saving comes from the first attempt.
5. **The first attempt separates the agents more in these languages** (+4.5 points here, +1.0 on C, C# and Elixir), and the second attempt removes the difference in both.

### Changes to Galley after the fourth confirmation (14 November, not yet measured)

Both come from faults seen in that round. They are after the frozen version `de69760` and are not part of any result above.

| Change | What it fixes | Seen in |
|---|---|---|
| **A session cut off while its tools were running can be resumed.** On the next message Galley gives every unanswered tool call a result that says the call did not finish and that its effect is unknown. | Resuming such a session sent the model a history it refuses, so the turn never started. It happens when the process is killed or a time limit hits during a command. | 2 of 200 task-runs; both lost their second attempt |
| **A task that begins with dashes is a task.** The command line treats a word as an option only if it holds no whitespace, and a bare `--` ends the options. | A task starting with `--`, such as pasted test output, was read as an option and the run had no task. | 2 Galley task-runs before the harness was changed to avoid it |

Tests: 76 pass, including one for each change.

## More than one model in a session (14 November, built, not measured)

The user judged the improvements so far insufficient and named what was missing: switching models within a session, with an understanding of what each model is good at and when to switch. Research first ([`research/model-switching.md`](../research/model-switching.md)), then the build.

### What the research found, in five lines

1. Every harness lets the user assign models to roles. Few switch by themselves, and the measured gain over the best single model is small where it exists (+2.7 points for Anthropic's advisor, +1.6 for alternating two equal models).
2. The repeatable effect of routing is lower cost at about the same quality, not a higher pass rate.
3. In public per-task results a second run by the same model fixes about a fifth of failures, and a different model of equal strength no more. Only a stronger model adds to that.
4. On this project's DeepSeek account the other model, `deepseek-v4-pro`, is the weaker one: 6.7% against 38.5% for `deepseek-flash` in the same harness on Terminal-Bench 4.1, at 3 to 7 times the price per token.
5. A switch is not free. The new model reads the whole session uncached, and so does the same model at a new effort level (measured on DeepSeek: 0 of 2,563 prompt tokens came from the cache after a change of effort, 2,429 after none).

### What was built in Galley (general features, nothing specific to a benchmark)

| Feature | What it does |
|---|---|
| Model profiles and `galley models` | Measured strength on agentic tasks, cost per run and prices for 11 models, with source and date; suggests roles for the keys that are set |
| A checked `/model`, and `/effort` | A mistyped model no longer ends the session; the switch shows its price and warns when the new model is the weaker one |
| `advisor` | A second model reads the session and gives short advice; asked when a turn goes badly, by the main model through a tool, and optionally before a turn that changed files ends |
| Signals | The same command failing three times in a row, the same call with the same result three times, four refused calls in a row, two thirds of the step limit used |
| `escalateModel` | A stronger model takes over the rest of a turn that stays in trouble; refused when the profiles say the model is not stronger |
| `fallbackModels`, `planModel` | Another model when a provider keeps failing; another model in plan mode |
| Cost per model | `/cost` and the session file list each model's share |

Tests: 112 pass, 36 of them new.

### Two smoke runs with real models (14 November)

Both ran inside the benchmark sandbox on used-up Lua tasks, as the variant `galley-adv`. They test the mechanics and say nothing about the pass rate.

| Run | Advisor | Tasks | What happened |
|---|---|---|---|
| `smoke-adv1` | `deepseek-flash` itself, with review | `acronym`, `all-your-base`, `bank-account` | The review ran in all three and passed all three; two then failed the hidden tests. In one the model asked the advisor of its own accord, about the API the hidden tests expect |
| `smoke-adv2` | `deepseek-v4-pro`, with review, tool withheld | `acronym`, `all-your-base` | One review answered and cost $0.0094, seven times the rest of that task ($0.0013). The other failed on a dropped connection, which showed the advisor request had no retry; it now has |

Spend: about $0.06 for both runs and the cache measurement in point 5.

### What must change in the harness before a round with two models counts

- **Cost.** The report prices every request as the round's model. `smoke-adv2` is under-priced for that reason.
- **Audit.** It flags any answer from a second model as contamination. `smoke-adv2` is flagged in both task-runs, correctly by the rule for single-model rounds.
- **Proxy.** It serves one provider. A second provider needs a second upstream and key.
- **Rule.** "The same model for both agents" no longer describes the comparison. A new rule has to say which models each agent may use and how cost is compared, before the first run.

### Why this was not run as a campaign

- **With DeepSeek alone there is nothing to measure:** the only other model is weaker and dearer, and a second look by the same model has been measured three times without a gain (self-review, the verifier, the lean verifier, above).
- **With a second provider the cost condition of the win rule cannot be met:** one consult of Claude Sonnet 5.5 costs about $0.03, three times the whole task on `deepseek-flash`, and as much as doing the whole task on Sonnet with Galley ($0.028, measured in [RESULTS-claude.md](RESULTS-claude.md)).
- **What could be shown** is the pass rate of a strong model at well under its cost, or a gain on longer tasks. Both need the changes above, the Anthropic key and a budget of roughly $15 to $25 a round. That is the user's decision.

### What an independent board says about harnesses on this model (read 14 November)

The [Harness Leaderboard](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) ran ten harnesses on DeepSeek V4.1 Flash: 198 hard tasks (Terminal-Bench 2.1 and DeepSWE), three attempts each, at two effort levels.

- **OpenCode 2.2.6 solves 70.0% and is tied for first** with DeepSeek's own harness (70.1%). The best six are within 2.3 points; one of them is a 100-line agent with one tool.
- **So the rule this log has used asks for more than any harness there has over OpenCode.** Our pooled lead of 3.8 points on Exercism first attempts is already larger than any gap among the best six on that board.
- **Reasoning effort did nothing for this model there:** 65.6% of runs solved at low effort, 66.1% at high, for about a quarter more money. On our Exercism tasks low effort cost 44% less and scored about 3 points lower.
- **Galley has not been run on such tasks.** It needs a container runtime and an adapter for the Harbor framework.

The analysis, the feature comparison and the options with their costs are in [`research/galley-against-the-field.md`](../research/galley-against-the-field.md).

### A worker and a reviewer on small steps (15 November, built, not measured)

The user's design: DeepSeek does the work, Claude Sonnet observes and reviews, and the work is cut into small units so that each review is small.

| Piece | What it does |
|---|---|
| `--reviewer <model>` | That model reviews every finished unit of work and is consulted when a turn goes badly. The worker gets no tool to call it |
| `--steps` | The worker plans without changing anything and replies with a numbered list; each step is then a turn of its own |
| Step review | The reviewer reads the task, the plan, that step's work and a diff of what it changed, not the earlier steps. Problems go back to the worker before the next step |
| Fixed tool list | The tools offered to the model no longer change within a session: the newest Claude models reject a history whose tools were edited |

Tests: 121 pass, 45 of them for the multi-model features.

**Smoke run `smoke-steps1`** (three used-up Lua tasks, DeepSeek as both worker and reviewer, in the benchmark sandbox): the model wrote plans of 2, 5 and 5 steps, all parsed; every step ran as its own turn; six step reviews ran and cost $0.0002 to $0.0022 each at DeepSeek's prices; the reviewer found nothing in any of them, and two of the three tasks then failed the hidden tests. Spend: $0.03. It shows the mechanics work and that a reviewer of the worker's own strength adds nothing, as before.

**What it would cost with Sonnet as the reviewer (estimate, not measured).** The same reviews at Sonnet's prices are about $0.003 to $0.035 each, so two or three of them cost $0.03 to $0.05 on a small task: more than Galley doing the whole task on Sonnet ($0.028). On tasks the size of the hard-task boards, where the worker spends $0.10 or more a run and Sonnet alone costs tens of times that, five reviews would add a small share. So the arrangement suits long tasks.

**Not run:** any round with Sonnet as the reviewer. That needs the three harness changes listed above (cost per model, the audit's list of allowed models, a second provider behind the proxy) and the user's go-ahead for the spend.

### What published research says about these methods, and two changes that follow (15 November)

A survey of about 45 studies is in [`research/multi-model-methods.md`](../research/multi-model-methods.md). In short: an observer model raised weak coding agents' results by 5 to 25 points in three 2026 preprints, but only when it was stronger than the worker or trained for the job; a model cannot reliably check its own work by rereading it; one review in a fresh context is better than several rounds; voting works where debate and blending do not; a bad plan is worse than no plan.

Two changes to the worker-and-reviewer mode follow from it:

| Change | Evidence |
|---|---|
| **The reviewer checks the plan** before any step is carried out; the worker revises it once or keeps it | Planning sits with the stronger model in every arrangement that worked; "a subpar plan hurts performance even more than no plan at all" |
| **`--observe <n>`: the reviewer looks in on the work every n steps,** later after a look that found nothing, as soon again after one that found something | Guidance during the run is where the gains were measured, and an adapting interval did best |

Tests: 129 pass. Smoke run `smoke-obs1` (two used-up Lua tasks, DeepSeek in both roles): two plan reviews, one of which found a fault that the worker then fixed in its plan; five looks, none with a finding; five step reviews. Spend: $0.013. Not measured on a benchmark.

## Two changes from the second survey (18 November, built, not measured)

The second survey of multi-model methods ([research/reports/Multi model methods further areas.md](../research/reports/Multi%20model%20methods%20further%20areas.md)) found that what holds up rests on a check that runs code, and that a stronger model taking over a failing run does better without its transcript. Two changes follow. Both are general agent features, nothing specific to this benchmark.

- **`--check <command>` (config `check`, `checkRounds`).** When a turn that used a tool able to change files ends, the command runs in the sandbox with the network off. A failure goes back to the model, up to three times a turn, with an instruction not to edit tests or special-case their inputs, and permission to say a test is wrong. A reviewing advisor reads the output beside the diff. In `--steps` mode only the last step is checked.
- **Takeover from the files.** `escalateModel` now starts the stronger model from one message: the request, why it was brought in, and the changes so far as a diff. It does not see the attempt. `"escalateContext": "transcript"` keeps the old behaviour. The next turn returns to the session's own model and reads the whole session.
- **Tests:** seven new, on the offline model; the suite is 136 pass. One ran the check through the real bubblewrap sandbox.
- **Why neither is measured here:** the Exercism benchmark hides its tests, so a project check has nothing to run, and the takeover signals rarely fire on small tasks. Both need hard tasks with visible tests (Terminal-Bench or DeepSWE), which needs a container runtime and an adapter. No model was called.

## How often Galley's trouble signals fire, replayed over past rounds (18 November)

No published study measures triggers like Galley's four (research/reports, area 2), so I replayed the watcher over the session files kept from earlier rounds: `bun bench/signals.ts <rounds-dir>`. Only the first attempt of each task-run and only the main agent are replayed; the result is the graded first attempt. Nothing was run and no model was called. Galley now also writes a `signal` record into the session file each time one fires, with what was done about it, so later rounds can be measured directly.

| Signal | Fires on failing runs | Fires on passing runs | Of the runs it fires on, share that failed | Within one task (AUC, 0.5 = chance) |
|---|---|---|---|---|
| The same check failing 3 times | 3 of 2,104 (0.1%) | 5 of 3,770 (0.1%) | 37.5% | 0.500 |
| The same call, same result, 3 times | 0 | 0 | | 0.500 |
| 4 refused calls in a row | 0 | 0 | | 0.500 |
| Two thirds of the step limit used | 22 (1.0%) | 12 (0.3%) | 64.7% | 0.501 |
| Any of them | 25 (1.2%) | 17 (0.5%) | 59.5% | 0.501 |

5,874 task-runs from 60 rounds (Exercism-style tasks, several models and settings, early leaky rounds included); 235 tasks had both a failing and a passing run, giving 9,621 pairs.

- **On small tasks the signals are silent.** They fire on about one failing run in eighty. Galley's failures here are runs that end confidently with a wrong answer (a convention the hidden tests expect), which no signal of trouble can see.
- **So the advisor-on-trouble and the takeover do nothing on this benchmark,** as the earlier notes predicted. Whether the signals carry information on long tasks is still unknown; that needs hard tasks.
- **Where they fire, failure is somewhat more likely** (60% against 36% of all runs), but within one task the difference is nil on these numbers.

## An improvement loop that runs partly by itself (18 November)

Until now every lesson reached Galley because someone read results and changed code. The tools below make the measuring automatic; deciding what to keep stays with a person. Details: [bench/README.md](README.md#the-improvement-loops-own-tools-18-november-2026).

- **Round miner (`mine.ts`), run after every round.** Replayed over the kept rounds it shows the bug found by hand on 13 November, the file tools refusing scratch files in `/tmp`: 51 refusals for the old version in the two rounds that ran both, none for the new one. It would have flagged it after the first round. In the fourth confirmation it lists a command denied by the permission rules, a `bash` call with a `path` argument, and a missing `lua5.3`.
- **Automatic verdicts (`verdict.ts`).** Judged against `rules/win-over-opencode.json`, the fourth confirmation comes out as recorded: +4.5 points, p = 0.122, first-attempt cost 22% lower (interval 0.67 to 0.91), rule not met. It also says that this rule file was written after those rounds, so the result is not a pre-registered test of the file.
- **Model profiles from Galley's own runs (`profiles.ts`).** `galley models` now lists, beside the public board: Claude Sonnet 5.5 86.4% of 309 tasks at high effort and 85.4% of 206 at medium; DeepSeek V4.1 Flash 68.4% of 920 (development tasks) and 59.8% of 3,728 (high effort, mostly fresh tasks). The two DeepSeek rows come from different task sets and say nothing about effort.
- **Calibration (`calibrate.ts`).** No threshold of any trouble signal, from 2 to 6 repeats and from 40% to 80% of the step limit, tells a failing run from a passing run of the same task better than chance on these tasks (AUC 0.497 to 0.501). No change proposed. Check records will feed the `checkRounds` part once rounds run with `--check`.
- **Near-miss tool calls are mended** (a `description` or a folder `path` given to `bash`, an `edit` without a path when one file holds the text), and **verified lessons** are kept per project when a failing check comes to pass (`"lessons": true`, off by default). Both covered by tests; neither measured.
- **First canary run** (`canary-1`, 18 November, current Galley on DeepSeek V4.1 Flash, off-peak): 23 of 30 passed for $0.17. Of the 24 stable tasks one failed (`go/tree-building`), where history makes 2.3 failures likely: no regression. None of the 6 hard tasks passed. No task-run flagged by the leak audit; the miner found no new kind of error.

## Council review of the work since the second survey (18 and 19 November)

Asked for a "council review 10 times", I ran ten independent reviewers, each with one lens (the agent loop, tool safety, statistics, data handling, tests, security, edge cases, docs against code, fresh eyes, cost), over the six commits since `3a1ca78`. One round, not ten in a row: in the review studies a second round added a few real findings and many more false ones, while independent single reviews counted together did best (research/multi-model-methods.md). A merging step grouped the 60 findings into 32 defects; for the 14 ranked highest, one more agent tried to refute each from the code and, where it could, by running it. **All 14 were confirmed.** The other 18, mostly low, were not checked by a second agent; I read each against the code and fixed 17.

| Finding | Severity | Raised by | Fix |
|---|---|---|---|
| The miner counted helper cost twice when helpers run on the main model | high | 3 | Taken back out of the bucket the parent session put it in |
| Profiles and canary history counted variants (other effort through provider options, extra flags, another checkout) as Galley at its defaults | high | 3 | One shared test; `run.ts` now records Galley's checkout and flags; older rounds count only the variant named `galley` |
| The check command ran code the model may have written with no sandbox and no approval when no sandbox was available | high | 2 | Without a sandbox it asks first, as `bash` does; a refusal is not fed back as a failure |
| An unpriced model counted as free in verdicts, so "costs less" could be met falsely | high | 2 | Unknown is unknown: such pairs are left out of the ratio, counted, and fail the cost condition. A priced request whose usage never arrived still counts as nothing, as the round reports count it |
| A verdict could be called pre-registered when an old round had no start times | high | 1 | Any run without a start time makes the registration unknown |
| Calibration merged check rounds of different turns | medium | 5 | Check records carry the turn; older ones are split where the round count starts again |
| The model taking over was told "no file has been changed" when commands or earlier turns had changed files | medium | 4 | It is shown git's status and diff too, and the fallback no longer claims nothing changed |
| The first attempt was cut at the first message Galley adds itself (a check failure, review, advice) | medium | 4 | Each `galley run` writes a `run` record; older sessions skip Galley's own messages |
| In `--steps` mode the check was skipped when the last step only read | medium | 3 | Whether anything changed since the last check is kept across turns |
| After a takeover the next turn could send the whole session without compacting | medium | 3 | The session's size is added back when the takeover ends |
| The edit repair could scan a large tree without limit | medium | 3 | Git's file list where there is one; otherwise a walk that gives up past 5,000 files or 50 MB |
| The check ran after any turn that called `bash`, even `ls` | medium | 2 | It runs when the files changed: file tools, or a command that left the workspace different (git status and diff, or a bounded walk) |
| Calibration lost a signal that reached its limit on the same step as another | medium | 1 | While one kind is swept, the others are switched off |
| The edit repair could call a file the only match when a skipped folder or the scratch folder held the text | medium | 1 | The walk skips nothing and gives up instead; a match in the scratch folder makes it uncertain |

The 17 lower ones fixed: canary rounds kept out of the previous-round comparison and, by a marker file, out of the profiles whatever they are named; one lesson per failure, not two; a check that fails on the last step allowed ends the turn with a warning instead of an unanswered message; the stale workspace description no longer quoted to a model taking over; a signal recorded as advised only when advice arrived; `cd -- './dir'` in mended `bash` calls; the repair note shown when a mended call fails; the label of a negative lead threshold; DeepSeek's `deepseek-v4-flash` alias priced; the measured-profiles test checks the rows; lesson text cannot close its own note; check output keeps its end, where test summaries are; the README's account of `checkRounds`; the lesson's cost counted in the turn; the miner reads each session once. Not fixed: a proposed `checkRounds` can only confirm or lower the limit, which the report now says; and two Galley processes writing lessons at once can still lose one (the rewrite is now atomic, the race is not closed).

**What the fixes changed in published figures.** Measured profiles: DeepSeek V4.1 Flash at high effort is 60.9% of 2,728 runs, not 59.8% of 3,728 (1,000 runs of variants were pooled in); the Sonnet 5.5 medium-effort row is gone, because it came from a variant whose flags older rounds did not record. The canary changed 2 of its 24 stable and 2 of its 6 hard tasks; the first canary run used the earlier selection. The signal replay now covers 5,904 first attempts: the signals fire on 1.2% of failing and 0.4% of passing runs, AUC 0.501 within a task, and no threshold does better: unchanged conclusions. The verdict on the fourth confirmation is unchanged: +4.5 points, p = 0.122, cost 22% lower.

Tests: 153 pass (9 new for these fixes). No model was called for the review's fixes; the review itself used 25 agents of this session.

## Second council review, with fresh agents (19 November)

The same ten lenses again, run by agents that had not seen the first review, over the same commits now including its fixes. 39 findings, 31 distinct defects; the 14 ranked highest were each sent to an agent told to refute them, and **all 14 held**. Fewer and narrower than the first round (60 findings), but one was the most serious of either round.

| Finding | Severity | Fix |
|---|---|---|
| **Host-side git could be made to run a program.** Galley's own git calls (whether files changed, what changed, which files hold some text) run outside the sandbox, in a folder the model can write to. A sandboxed command could create a `.git` whose config names a file-system monitor, and git on the host would run it. Reproduced with the real sandbox | high | The repository is recorded when the agent is made, before any model turn, and every call names it; hooks, the monitor, text conversion and external diff are switched off on the command line; a repository whose own config defines filter or diff drivers is not used. Two tests plant such a repository |
| The canary said "no regression" when stable tasks had no result (a Galley that crashes on some tasks records none) | high | Missing stable tasks, or runs at another model or effort, make it INCONCLUSIVE with a failing exit code; `canary.sh` runs at the canary's own effort |
| In `--steps`, a file written through the shell in an early step was not checked when the last step only read | medium | The baseline is taken at the first turn whenever a check is configured |
| Calibration merged the harness's first and second attempt into one turn | medium | A new `galley run` starts a new group |
| In a workspace inside a larger repository, untracked files were looked for at the wrong path | medium | Paths are taken from the repository's top |
| A check interrupted by the user counted as run | medium | Nothing is reset when the check was cut short |
| A model taking over saw only the first and the current request: in `--steps`, an instruction to change nothing and a step of a plan it could not see | medium | It reads every earlier request with the answer that ended it (the plan included), clipped to the latest 8,000 characters |
| Edit repair counted files it had not searched (too large, unreadable, ignored, nested repositories) as not containing the text | medium | Any such file makes the answer uncertain; ignored files are searched within the same limits; trailing spaces are ignored as edit ignores them |
| A rule with an unknown or misspelled condition was judged without it | medium | Rules are checked before judging |
| The miner subtracted helper costs the parent never received (a run killed while a helper worked) | medium | Galley marks the helper's roll-up in the parent session; older sessions subtract at most what the parent recorded |
| `run.ts --galley <other checkout>` was recorded as the default | medium | Compared with the repository's own `cli.ts` |
| `profiles.ts --write` replaced the file with whatever rounds were on disk | medium | Merged row by row; nothing is written when nothing was measured |
| A hanging check held a turn for 600 seconds, the benchmark's whole budget | medium | `checkTimeout`, default 300 seconds |
| After a takeover, compaction was off for the rest of the turn | medium | The taken-over part is compacted on its own; the earlier attempt stays out of it |

Of the 17 lower ones, fixed: a refused edit no longer sets off the check; `checkRounds` counts per turn, as documented; the replay counts a step for every model call, as the live loop does; profiles count only effort, model and provider settings as neutral (not the step limit or helper model); a trailing slash no longer lets a skipped round in; an unknown cost shows as unknown in the miner; check output keeps its end even past 2 MB; lesson writes take a lock; tests now cover stale lessons, the 50-lesson cap and the takeover's earlier turns, and the scratch-folder test is skipped visibly without a sandbox; the duplicate diff in the takeover message is gone; the calibration header says what the code does. Not fixed: with `--worktree`, lessons are kept per worktree and not read back by later runs; the edit-repair test's symlink case in git workspaces is now covered by the "uncertain" rule rather than a dedicated test.

Figures after the fixes: the signal replay shows 23 failing runs with the long-run signal, not 22, from the corrected step count; all conclusions stand. Profiles and the verdict on the fourth confirmation are unchanged. Tests: 162 pass.

## Third council review, fresh agents again (19 November)

The same ten lenses, new agents, over the same commits including both earlier rounds of fixes. 32 findings, 25 distinct defects (after 60 and 39); the 14 ranked highest were each sent to an agent told to refute them, and all 14 held again. As in the second round, the most serious was a way out of the sandbox through git.

| Finding | Severity | Fix |
|---|---|---|
| **Git on the host entered submodules.** A submodule's `.git` lies in the writable workspace, so a sandboxed model could give it a clean filter, and Galley's own `git status` on the host would run it with the user's rights and environment. Reproduced | high | Submodules are not entered (`diff.ignoreSubmodules=all`, `--ignore-submodules=all`, no recursion). The test plants such a submodule; it fails with the fix taken out and passes with it in |
| After compaction within a turn, a takeover quoted a summary of the failed attempt as an "earlier turn" | medium | The turn's start is found by its opening message, not by an index that compaction invalidates; with that message gone, nothing earlier is quoted |
| An earlier takeover's opening message, with its old diff, was quoted as a request | medium | Skipped |
| Outside git, a test runner's cache (`.pytest_cache`) counted as a change, so the check ran again and repeated its failure | medium | Tool caches and folders marked `CACHEDIR.TAG` are skipped |
| The miner's step count missed model calls that made no tool call | medium | Every model call counts, as in the live loop |
| Edit repair read files the permission rules forbid, and its note could say which file held the text even when the edit was refused | medium | A forbidden file makes the answer uncertain; no repair for an edit the rules refuse |
| A lesson naming a file created and deleted in the turn was never read back | medium | Only files that still exist are named |
| Within-task AUC paired runs of different models, efforts and variants | medium | Pairs only within one condition: task, agent, model, effort, step limit and series of rounds |
| A rule's verdict could count as pre-registered on rounds picked after the fact | medium | A rule names its rounds; judged on others, or on some of them, it is not pre-registered |
| Errors from mended calls were grouped under the repair note | medium | The note is taken off before grouping |
| The miner showed $0.00 for runs with no proxy record | medium | Unknown |
| The takeover-compaction test did not check what the summariser was sent | medium | It does |
| The "later .git" test passed even without the record-once protection | medium | A harmless planted repository is now used |
| Edit repair compared lines more strictly than edit (CRLF files) and skipped files with a NUL byte | low | Lines compared as edit compares them; no files skipped |

Also fixed from the unverified ones: a background `&` in a mended `bash` command no longer leaves the folder; the session size is not doubled when a takeover never gets an answer; a run whose requests were all refused costs zero and keeps its model; the benchmark's broken tasks are out of the profiles; trial rounds are never the previous round, and a canary round is not compared with a full one; unparseable tool arguments count as malformed calls; lessons live with the original repository under `--worktree`; a test covers an unpriced measured row; the profiles header says what the code does. Not fixed: on macOS the edit repair's scan of the shared `/tmp` almost always gives up, so the repair rarely applies there (it errs toward doing nothing).

Figures after the fixes: profiles without the broken tasks, Claude Sonnet 5.5 87.5% of 303 and DeepSeek V4.1 Flash 69.0% of 901 (default effort) and 61.0% of 2,718 (high); the signal replay, with pairs only within one condition (658 pairs instead of 9,684), still finds every signal at chance within a task (AUC 0.498 to 0.503); the verdict on the fourth confirmation is unchanged. Tests: 171 pass.

**Three rounds compared.** Findings fell from 60 to 39 to 32, and every defect a skeptic checked held in all three. The first round found errors in the measuring scripts; the second and third each found a way for a model to run code on the host through git, one closed and one opened by the fixes of the round before. Fixes that add host-side commands deserve the most scrutiny.

## Fourth council review (19 November)

Fresh agents again, with the security lens now naming every program Galley starts on the host. 25 findings, 19 distinct defects (after 60, 39 and 32). Of the 14 checked by an agent told to refute them, **12 held and 2 were refuted** for the first time: a test that could miss a regression no code path produces, and a check that is skipped on purpose and already tested. Two reviewers hit the account's usage limit midway; the run was resumed hours later with the eight finished reviews taken from cache.

| Finding | Severity | Fix |
|---|---|---|
| **Git on the host, a third time.** The trust check read only the shared config file, once: a filter in the per-worktree config passed it, and a git folder placed elsewhere in the workspace could be given a filter after the check. Both ran a program on the host. Reproduced | high | Fixed as a class, not an instance: system and user-wide config are not read; worktree attributes are ignored; the repository's own config, shared and per-worktree, is checked for anything that runs a program before every call, not once; a git folder anywhere the sandbox can write, other than the read-only `.git`, is refused. Four tests, each failing with its protection taken out |
| An edit repair could throw out of the tool runner and end the turn (a listed path whose folder became a file) | medium | A repair that fails is no repair; the path is treated as uncertain |
| The condition key never held the model, so runs of different models were still paired | medium | The model comes from the proxy log when the config does not name it |
| The verdict scored the benchmark's broken tasks | medium | Left out, as the reports leave them out |
| A commit made through the shell left the fingerprint unchanged, so the check did not run | medium | The commit is part of the fingerprint |
| In a takeover, a long list of untracked files could crowd the diff out | medium | Untracked folders as one line, the list held to a quarter of the space |
| The verdict dropped task-runs with no counterpart without a word | medium | Counted, reported, and the rule is not met until they are run again |
| An empty canary selection ran a full round and then reported no regression | medium | Refused at selection, in the runner and in the check |
| Under macOS the edit repair scanned the shared system `/tmp` and almost never mended | low | It does not try there |
| A filter defined in system or user config (git-lfs) could run for an attribute the model wrote | low | Covered by the class fix |
| After a declined check, the reviewer read the previous check's output as this change's | low | Cleared |
| The edit repair read the whole tree and then gave up on any link in an ignored folder | low | Ignored folders first; a link to a file inside the workspace is not a reason to give up |

Also fixed from the unverified ones: a mended `bash` call is not turned into a command the rules refuse when the plain one was allowed, and its note no longer says it ran; the miner does not subtract a cut-off helper's cost in sessions of the new format; the replay does not read signals on the last step allowed, as the live loop does not; the stale-turn test checks that compaction happened; the submodule test has room for its many processes. Not fixed: the replay keeps counting steps across the verifier's second pass, where the live loop starts again at zero (it affects only runs with the verifier on).

Figures: unchanged (the verdict on the fourth confirmation, the signals at chance within a condition, the profiles). Tests: 177 pass.

**Four rounds compared.** 60, 39, 32, 25 findings; 14, 14, 14 and 12 confirmed of those checked. Each of the last three rounds found a way to run a program on the host through git, each in code the previous round's fix had added or left narrow. This time the fix closes the mechanism (no program-running config is trusted from any source the model could reach) rather than the path reported.

## Fifth council review (19 November)

Fresh agents, same lenses. 19 findings, 18 distinct defects; all 14 checked by an agent told to refute them held.

| Finding | Severity | Fix |
|---|---|---|
| **Git on the host, a fourth time.** The list of dangerous config keys missed the ones that make git fetch a missing object through a command named in the repository (`remote.<name>.uploadpack` with a partial clone). A `.git` the model made in an earlier session, when there was none to protect, would run it on the host at the next `git diff`. Reproduced | high | The list of dangerous keys is gone: a repository is used only when every key of its own config is on a short list of keys known to run and fetch nothing. Transports are off (`protocol.allow=never`) and lazy fetching is off. The repository in the report is refused; an ordinary one with a remote is still used |
| Signal replay and the miner's step-limit count ran one watcher and one step count over all the turns of a `--steps` plan and both passes of `--verify` | medium | The first attempt is cut where the live loop starts afresh: a new watcher per turn, kept across the verifier's pass; the step count and the step limit per turn and pass. The reviewer's own demonstration now matches the live loop in both cases |
| Under macOS, Seatbelt lets every command write two system folders, which the trust check did not count as writable | medium | Counted |
| The miner compared a round with whatever round came before it, also one of another model or with a second attempt | medium | Only with a round of the same models, attempts and mostly the same tasks; an explicitly named one of another kind is flagged as not like for like |
| A successful call to a tool from an MCP server set off the check, though it may have changed nothing | medium | Measured like `bash`: the check runs when the files changed |
| The fingerprint left out ignored files, and a workspace ignored by the enclosing repository looked unchanged after any shell edit | medium | Ignored files are part of it; a workspace the repository ignores is looked at as files |
| The edit-repair tests depended on the host's sandbox: on macOS one failed and three could not fail | medium | They run with the sandbox off; the scratch-folder test only under bubblewrap |
| A user's own request that began like a message Galley adds was dropped from a takeover's earlier turns | low | The whole shape of each injected message is matched |
| A resumed session took edits left by a cut-off run as its baseline and never checked them | low | A resumed session checks once |
| The same command failing in different folders raised a "same check" signal | low | The folder is part of the key |
| A rule naming a round twice let an unnamed round count as pre-registered | low | Named and judged rounds compared as sets; duplicates refused |
| The 2-second slack before a second attempt dropped late first-attempt requests from its cost | low | Removed (both times come from one clock) |
| In old sessions, a cut-off helper's cost was taken from the main model's spend | low | Only a roll-up record that is really there is taken |
| The ENOTDIR test never checked that the repair gave up | low | It does |

Also fixed from the unverified ones: a stale lesson lock is taken by rename, which only one process can win; a verdict with no priced pair shows its cost as unknown, not $0.00; the edit repair's comment says what it does with links. Not fixed: in a project with a large ignored dependency folder the edit repair reads up to 5,000 files and then gives up (it errs toward doing nothing).

Each protection added this round was taken out in turn and its test run: all six tests failed without their fix and pass with it. Figures unchanged. Tests: 185 pass.

**Five rounds compared.** Findings 60, 39, 32, 25, 19. Confirmed of those checked: 14, 14, 14, 12, 14. Four rounds in a row found a way to run a program on the host through git; this round replaced the list of dangerous settings with a list of safe ones, which is the change the pattern called for.

## Sixth council review (19 November)

Fresh agents, same lenses. 18 findings, 16 distinct defects; all 14 checked by an agent told to refute them held. For the first time in four rounds none came through git.

| Finding | Severity | Fix |
|---|---|---|
| **A link the model plants is read on the host.** What a turn changed is read by Galley itself, outside the sandbox, for a review, a takeover or a lesson. A link the model made to `/proc/self/environ` would put Galley's own environment, with its API keys, into a request to another model. `/undo` also read and wrote through links | high | Only a regular file whose real path is inside the workspace is read; a link is named with its target, never followed. Undo remembers a link as a link, and removes whatever is at a path before putting the old content back, so it never writes through a link planted since |
| The canary gave each stable task its own prior on five runs, 1 in 7, so 6 failures of 24 always-passing tasks read as "no regression" | high | One rate from the pooled history (0 failures in 120 runs gives 1 in 122). Six failures are now far past the 5% line; one failure is not |
| A round given twice (or once through its parent folder) was judged twice and still counted as pre-registered | medium | Rounds are deduplicated by real path; two judged rounds with the same name make the registration unclear |
| `--check="npm test"` written as `--check=npm test` (one argument with a space) was taken as the request | medium | `--option=value` keeps spaces for options that take a value |
| Calibration counted failures before a turn's first pass, but `checkRounds` limits every failure in the turn | medium | Counts every failed check in the turn |
| Untracked files in dependency or build folders inside a repository set off the check | low | Left out of the fingerprint, as they are outside a repository |
| A check command holding a backtick or a newline made its failure message look like the user's request to a model taking over | low | Matched whatever the command holds |
| A file in a merge conflict was listed once per stage, so the edit repair saw it as ambiguous | low | Listed once |
| With `replace_all`, the edit repair matched loosely, but the edit matches exactly | low | Exact |
| The edit repair read up to 50 MB of an ignored dependency folder before giving up | low | The ignored folders are sized by `stat` first; if they cannot fit, it gives up without reading |
| A `checkTimeout` of 0, negative or huge failed every check at once | low | Taken as the default; capped at a day |
| A lesson lock could be removed by a process that did not hold it, and a stale lock waited longer than the wait allowed | low | The lock holds a token and is removed only by its owner; stale after 2 seconds |
| In old sessions, a helper that compacted had its cost counted twice in the miner's split | low | Its roll-up is matched without the compaction |
| No test for a file the rules let the repair read but not edit | low | Added |

Also fixed from the unverified ones: common words ("make", "sure", "should", "file") no longer make a lesson look related; the canary's comment describes its formula.

**Found while checking the figures: the kept rounds' costs were invisible to the bench tools.** Kept rounds hold the proxy log with headers and bodies stripped, as `proxy-usage.jsonl`; `sessions.ts` read only `proxy.jsonl`. Run on the kept fourth confirmation, the verdict showed the cost of all 200 pairs as unknown and the cost condition as not met; the canary could not tell the model of any kept run. Both names are now read. The verdict on `t4-1` is again +4.5 points, p = 0.122, cost 22% lower (interval 9% to 33% lower): not met. Folder arguments that are files are skipped.

Each protection added this round was taken out in turn and its test run: all nine tests failed without their fix and pass with it. Profiles, signal and calibration figures unchanged. Tests: 195 pass.

**Six rounds compared.** Findings 60, 39, 32, 25, 19, 18. Confirmed of those checked: 14, 14, 14, 12, 14, 14. The count has levelled off near 18; the severity has not fallen as fast, because each round looks at host-side reads from a new angle (git, then links).

## Seventh council review (20 November)

Fresh agents, same lenses; the round was cut off by a usage limit and resumed. 18 findings, 18 distinct; all 14 checked by an agent told to refute them held. Two came from the sixth round's own fixes: the canary's new pooled rate, and `/undo`'s new remove-then-write.

| Finding | Severity | Fix |
|---|---|---|
| **`/undo` through a folder link.** The sixth round guarded the file itself, not the folders above it. A model that turned a folder into a link to `$HOME` after an edit had `/undo`, on the host, delete and rewrite a file there (`.bashrc`, say). Reproduced | medium | Each snapshot records the real path of its folder; undo leaves a file alone when the path no longer leads there |
| `/undo` recreated every file, so an executable script came back without its execute bit | medium | A regular file with one name is written in place, and its mode is restored in any case; a folder deleted since is made again |
| **The canary over-alarmed.** Its pooled rate came from the history that chose the tasks for being good, 1 in 122. Left out of the choice one round at a time, such tasks failed 4 of 120 runs. With the old rate any 2 failures in 24 raised REGRESSION, and one held-out round of an unchanged Galley did | medium | `select` now measures the failure rate on rounds left out of the choice and stores it; `check` uses it. Now 4 failures of 24 are needed (an unchanged Galley gets there about 1.6% of the time; 3 failures, at 7%, are not enough). A test round named `fake1` was left out of the history, which changed one stable task |
| Every OpenCode run on Anthropic was taken to be on Claude Haiku 5.5, the model of its title request, which answers first. OpenCode rounds on Sonnet and on Opus looked alike to the miner | medium | A run's model is the one that wrote the most output |
| After a round, `profiles.ts --write` replaced a row from 19 rounds with one from whatever rounds were on disk | medium | A row is replaced only by one resting on as many task-runs, or with `--replace` |
| Rounds were deduplicated by resolved path, not real path; the log said real path. A link to a round counted it twice | medium | Real path |
| Every resumed session ran the check, also after a run that finished | medium | Only after a run that did not finish (or a session with no status) |
| A write to the scratch folder alone set off the check again after a failure | low | File tools set it off only when they changed a workspace file; anything else is measured |
| A session from the commit that first recorded runs (1d81129) had its helper cost counted twice by the miner | low | Marked only by the helper's name on the roll-up |
| Untested: the signal record of a handover; the token count after a takeover; old notes not read back with lessons off; per-language figures in `galley models`; a declined check clearing the result an advisor reads | low | Tests for each |

Also fixed from the unverified ones: a workspace inside a repository's `build/` folder saw no file made through the shell (only folders below the workspace are skipped now); a malformed `edit` that a path would not make valid is no longer searched for; the lesson lock's comment gives its real two seconds.

Each fix was taken out in turn and its test run: ten of eleven tests failed without their fix. The eleventh, writing a file in place, is covered twice: without it the mode is still restored afterwards. Measured profiles: DeepSeek V4.1 Flash at high effort is 61.1% of 2,717 runs, not 61.0% of 2,718 (the test round). Tests: 206 pass.

**Seven rounds compared.** Findings 60, 39, 32, 25, 19, 18, 18. Confirmed of those checked: 14, 14, 14, 12, 14, 14, 14. Two of this round's confirmed findings were caused by the previous round's fixes, and both were found by the next round. That is the case for running the rounds, and for not stopping at a round that only fixed things.

## Eighth council review (20 November)

Fresh agents, same lenses. 19 findings, 15 distinct; all 14 checked by an agent told to refute them held. Four came from the seventh round's own fixes.

| Finding | Severity | Fix |
|---|---|---|
| **The canary's new held-out rate could be empty.** With thin history no task qualifies when a round is left out, and `select` stored 0 of 0. `check` read that as a rate of one half per task, so 14 failures of 24 always-passing tasks were "no regression" | high | A held-out count under 20 runs is not used: `check` falls back to the tasks' own history and says it leans towards false alarms; `select` warns when it writes one |
| A resumed session skipped its check when the run before had stopped on Ctrl-C or the step limit, because `galley run` writes "done" for those too | medium | Only a turn that ended cleanly (`end_turn`) counts as checked |
| Only `galley run` wrote a status, so every resumed REPL or server session ran the check, and a failing one drew the model into fixes nobody asked for | medium | The agent writes how each turn started and ended, whatever the front end |
| After a failed check, a fix to a file already changed in the turn did not run the check again when the file was in a folder the fingerprint skips (`build/`), since only a file's first change was counted | medium | Every write to a workspace file counts |
| A workspace with more than 5,000 files outside known dependency folders could not be fingerprinted, so any command, even `ls`, ran the check again | medium | Past 5,000 files the rest are left out of the fingerprint (a change there is missed). `obj`, `_build` and `dist-newstyle` are skipped as build output, and a folder marked with `CACHEDIR.TAG` is skipped inside a repository too |
| The `bash` path repair took a folder that is a link out of the workspace (`link -> /etc`) as inside it | low | Compared on real paths |
| In old sessions, the miner counted the "interrupted" results that a second attempt adds as the first attempt's last step | low | Left out |
| The miner took the round whose results were written last as the previous one, so a resumed older round came after a newer one | low | Rounds are ordered by when their first task-run started |
| Two processes could both take over a stale lesson lock, the second removing the first's fresh lock | low | After renaming, the lock is removed only if it is the one found stale; otherwise it is put back |
| Three tests could not fail: one for the edit repair's key check, one for the `CACHEDIR.TAG` rule, one for not entering submodules (another protection covered it) | low | Each now tests its own protection |
| The log put the canary's false-alarm chance at 5%; it is 1.6%. The header of `workspace-state.ts` described the old list of dangerous git settings | low | Corrected |

Also fixed from the unverified one: the edit repair gives up before reading when git's list of files is already longer than its budget.

Each fix was taken out in turn and its test run: all ten tests failed without their fix. Signal replay and calibration unchanged (5,904 first attempts). Tests: 213 pass.

**Eight rounds compared.** Findings 60, 39, 32, 25, 19, 18, 18, 19. Confirmed of those checked: 14 in every round but the fourth (12). Four of this round's confirmed findings came from the seventh round's fixes, against two the round before: the count has stopped falling, and more of it is now in code written in response to the review itself. Most of those were in when the check re-runs, which has been changed in four of the last five rounds.

## Ninth council review (20 November)

Fresh agents, same lenses, told this time to look hardest at the fixes of the last three rounds. 15 findings, 11 distinct; 10 held and 1 was refuted (the takeover's message staying in the history is deliberate and tested).

| Finding | Severity | Fix |
|---|---|---|
| **The measured default-effort row pooled experiments.** Before 19 November results did not record Galley's flags, and the development rounds (r1 to r6) and the verifier rounds (fv1, fv2) ran a changed Galley under the plain name. `galley models` showed DeepSeek V4.1 Flash at default effort as 69.0% of 901 at $0.0100 a task, as Galley at its defaults | high | Those rounds are named as experiments and left out. The row is now 68.8% of 202 at $0.0066 a task, from the two confirmation rounds of that time. The high-effort rows are unchanged: their plain arm ran beside named variants |
| **The resume rule, again.** It skipped the check after any turn that ended cleanly, though many such turns run none: no check configured then, plan mode, a declined check | medium | Replaced, not patched. A check record now holds a fingerprint of the files it saw. A resumed session is checked once unless its files are as that check left them, or it never called a tool that can change a file. How the last turn ended no longer counts |
| The eighth round's partial fingerprint missed a shell edit to any file past the first 5,000 | medium | Back to "may have changed" past the limit, with the limit raised to 100,000 files (one stat each, at the end of a turn) |
| The edit repair could pick a compiled `.pyc` as the only file holding the text, and edit wrote it back mangled | medium | The repair skips binary and non-UTF-8 files, and edit refuses them |
| Same-day canary rounds were one series in the calibration's within-task comparison, pairing runs of different versions | medium | Each canary round is its own series |
| The stale-lock takeover told the stale lock by inode alone, which a fresh lock can reuse, and its put-back could replace a lock made meanwhile | low | Told by its token and age; put back by a link, which fails rather than replace |
| Inside a repository, an untracked cache folder (`CACHEDIR.TAG`) still changed the fingerprint | low | Skipped like an ignored one |
| Three tests did less than their titles: the resume test never checked "once", the planted-hook test passed for another reason, and one claimed "nothing is searched" | low | Tests for the new rule from real runs (including checked once over two turns); the hook test asserts the late repository is not used; the title says what is tested |

Each fix was taken out in turn and its test run: eight of nine tests failed without their fix. The ninth, the once-per-session guard, is now redundant: after the first check the files match its record, so a second turn is not checked again anyway. Signal replay and calibration unchanged (5,904 first attempts); canary selection unchanged. Tests: 217 pass.

**Nine rounds compared.** Findings 60, 39, 32, 25, 19, 18, 18, 19, 15; distinct 11, the fewest yet. The resume rule had been patched in rounds 5, 7 and 8 by how the last turn ended, and each patch missed a case; this round it was rebuilt on what the files are, which no front end or stop reason can get wrong.

## Tenth council review (20 November)

Fresh agents, same lenses; cut off by a usage limit and resumed. 22 findings, 20 distinct; all 14 checked held. Both high ones are old security holes in code no earlier round had looked at closely; most of the rest are in `/undo` and the resume rule, changed in the last four rounds.

| Finding | Severity | Fix |
|---|---|---|
| **A `galley.json` in the workspace was trusted.** The model can write it from the sandbox, and the next run took from it MCP servers (started on the host, with Galley's environment and its API keys), provider addresses (where the keys are sent), `sandbox: "off"`, permission rules and the check command. Reproduced: no prompt, key leaked | high | From a workspace's `galley.json` only harmless settings are used until the user runs `galley trust`, which records the file's digest; any later change needs trusting again. Galley names the settings it left out. The user-wide config is unaffected, and so is the benchmark, which configures Galley there |
| **A write through a dangling link landed outside the workspace.** A link to a file that does not yet exist passed the path check, and the host-side write created its target (an autostart entry, say) | high | A path whose missing part is a link is refused |
| The edit repair treated a non-UTF-8 file holding the text as no match, so an edit meant for a Latin-1 file went to the other one (the ninth round's fix) | medium | Such a file makes the answer uncertain: no repair |
| A `write` aimed at a folder left an undo snapshot, and `/undo` then failed and left the turn's changes in place | medium | No snapshot of a folder |
| `/undo` read snapshots as text and wrote a binary file back mangled | medium | Snapshots are bytes |
| `/undo` no longer restored a file the project had hard-linked (the seventh round's guard) | medium | Written in place when it is the same file (device and inode) as before the turn; anything else at the path is replaced |
| On resume, a file-tool write after the last check went unseen in a folder the fingerprint skips | medium | The session records which tools ran since the last check; a file-tool write among them means a check |
| On Windows every changed file was "outside the workspace", so reviews, lessons and takeovers saw no diff | medium | Compared with `relative()`, as the path checks are |
| `--worktree` ran plain git on the host in a workspace where the model may have made a repository with hooks | medium | Hardened like every other git call, and refused when the repository's config is not known to be safe |
| Over several rounds, the verdict's sign test and cost interval counted runs of one task as independent | medium | Both count tasks. One round, as in every verdict so far, gives the same result |
| Round folders reached through a link were judged under the link's name, which every name-based filter then missed (the seventh round's fix) | medium | Judged under the real path |
| A review was asked for on the last step, or after an abort, and never answered | low | Not asked |
| A path git lists twice (a folder and a file in it) counted as two matches in the edit repair | low | Each path looked at once |

Also fixed from the unverified ones: a session file cut off in its last line loads; a test that asserted the old resume rule is renamed for what it now checks; edit's binary refusal is tested on a file that is valid UTF-8 apart from NUL bytes. Not fixed: the profiles' Wilson interval treats repeated runs of a task as independent, so it is too narrow; the edit repair without git reads up to its limit before giving up; listing ignored files lists a large dependency tree in full before skipping it.

Each fix was taken out in turn and its test run: all eleven tests failed without their fix. Verdict on the fourth confirmation unchanged. Tests: 228 pass.

**Ten rounds compared.** Findings 60, 39, 32, 25, 19, 18, 18, 19, 15, 22. The rise this round came from reviewers reaching code the earlier rounds had not: the config loader and the path check, both older than this work, held the two worst holes found since the git ones.
