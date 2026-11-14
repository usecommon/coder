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
