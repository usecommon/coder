# Second confirmation on fresh tasks: Galley vs OpenCode

*Run on 13 and 14 November 2026. Galley was frozen at commit `de69760`, the version with the two fixes that came out of the first confirmation, and is compared with OpenCode 1.19.5 on DeepSeek-V4.1-Flash. Tasks: 181 exercises from Exercism's PHP, TypeScript and Ruby tracks, which neither agent had been run on. Four rounds; in each, both agents ran every task side by side, outside DeepSeek's peak hours. The design, the task list and the rule were written down before the first run ([IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)). The first confirmation is in [RESULTS-fresh.md](RESULTS-fresh.md).*

## Verdict

**By the rule fixed in advance, Galley does not beat OpenCode. This time it meets the cost condition and misses both accuracy conditions.**

| Condition | Measured | Met |
|---|---|---|
| Pass rate higher by 5 points or more | +3.5 points (95% interval −0.3 to +7.3) | **No** |
| Sign test over tasks, p < 0.05 | Better on 50 tasks, worse on 36; p = 0.16 | **No** |
| Lower cost per round at list price | $0.85 against $0.97: 12% lower (95% interval 21% to 2% lower) | Yes |

**Read this result with the next section in mind:** after the runs I found a flaw in the benchmark set-up that worked against Galley in both confirmations.

## A flaw in the benchmark that worked against Galley

Galley runs shell commands in its own sandbox, and that sandbox gives them a private `/tmp`. The benchmark kept the shared test tools under `/tmp`: the `node_modules` folder of the JavaScript and TypeScript exercises (jest, babel), the Java test libraries, and PHPUnit. So those tools existed for OpenCode's commands and not for Galley's.

| Did the exercise's own test tool run for the agent? | OpenCode | Galley |
|---|---|---|
| JavaScript (jest), first confirmation, 192 task-runs each | tried in 55, ran in 48 | tried in 82, ran in **0** |
| TypeScript (jest), this confirmation, 232 task-runs each | tried in 201, ran in 40 | tried in 164, ran in **0** |

- **Which results it touches.** The JavaScript and Java tasks of the first confirmation and round 10, and the TypeScript and PHP tasks of this one. Python, Go, Rust, C++ and Ruby are not affected: their tools are installed elsewhere.
- **Which way it pushes.** Against Galley only. It lost a way to check its work and spent steps finding out. In TypeScript Galley's commands hit a missing file or command about twice per task-run, and it took 17 steps per task where OpenCode took 11.
- **How much it matters is not measured.** These results are reported as they came out. They are not corrected for it.
- **Why it was missed.** The self-test checked the tools from inside the benchmark's sandbox, not from inside Galley's sandbox within it.
- **Fixed for later runs.** The shared tools now live outside `/tmp`, and the self-test runs every tool check again from inside Galley's own sandbox. Run on the old set-up, it fails; on the new one, it passes.

## Results

| | OpenCode 1.19.5 | Galley |
|---|---|---|
| Passes per round (of 181) | 88, 100, 94, 91 | 104, 94, 104, 96 |
| **Pass rate** | **51.5%** | **55.0%** |
| Cost per round, at the list price | $0.89, $1.03, $1.00, $0.94 | $0.89, $0.86, $0.88, $0.78 |
| **Mean cost per round** | $0.97 | **$0.85** |
| Cost per solved task | $0.0104 | $0.0086 |
| Median time per task | 21 s | 22 s |
| Task-runs stopped at the 10-minute limit (of 724) | 1 | 0 |
| Task-runs that reached hidden tests (leak audit) | 0 | 0 |

By language, pooled over the four rounds:

| | PHP (61 tasks) | TypeScript (58) | Ruby (62) |
|---|---|---|---|
| OpenCode | 63.1% | 52.2% | 39.5% |
| Galley | 63.9% | 58.6% | 42.7% |
| Difference | +0.8 points (p = 1.0) | +6.5 (p = 0.09) | +3.2 (p = 0.72) |
| Galley's cost against OpenCode's | 27% lower | 17% higher | 30% lower |

What this shows, and what it does not:
- **Galley is now the cheaper agent.** The 95% interval for the cost difference runs from 21% to 2% lower and does not include zero. The two fixes held on fresh tasks: in 724 task-runs no write was refused and no helper agent was started.
- **A lead of 5 points is not shown here.** Galley passed more tasks in three of the four rounds, but the interval for the lead includes zero.
- **The two confirmations do not contradict each other.** The first measured a lead of 7.6 points (interval +3.7 to +11.8), this one 3.5 (−0.3 to +7.3). The two estimates differ by about one and a half standard errors. A true lead near 5 points fits both.
- **The lead depends on the kind of task.** There is none in PHP, where the starting files give full function signatures and both agents pass 63%. It is largest in TypeScript, as it was in JavaScript. Ruby's starting files name no classes or methods, and both agents fail most of those tasks.

The two confirmations side by side:

| | First: JavaScript, Java, C++ (121 tasks) | Second: PHP, TypeScript, Ruby (181 tasks) |
|---|---|---|
| Galley version | `61300b4` | `de69760` (two fixes) |
| Lead | +7.6 points, p = 0.001 | +3.5 points, p = 0.16 |
| Galley's cost against OpenCode's | 10% higher | 12% lower |
| Verdict by the rule | Not a win: cost | Not a win: lead |

## What went wrong, and departures from the plan

1. **The model account ran out of balance in round 1.** DeepSeek refused requests from 13:51 UTC on 13 November. 202 task-runs that finished cleanly before that were kept. I removed 21 that the outage touched (a refused request, still running when it began, or the other arm of such a task) and ran them again when the balance was restored three hours later.
2. **Round 4 was interrupted by a pause.** It was stopped at the user's request after 95 task-runs and finished ten hours later. 92 results were kept; three whose other arm had not finished ran again with it.
3. **Rounds were quicker than planned**, about 45 minutes each. Round 1 cost $1.78, under the $2.30 set in advance, so four rounds were run as designed.
4. **A smoke test came first.** One exercise (`bowling`) was run once in each language with both agents to check the harness. Nothing in Galley was changed after it.
5. **Unusual task-runs.** One OpenCode task-run hit the 10-minute limit (it still passed). Two Galley test programs hit the 4 GB memory cap (one task passed, one failed). Seven model responses were cut by a connection reset or failed at the provider (four of OpenCode's, three of Galley's); every affected task-run finished normally.
6. **The agents still look for the tests.** OpenCode tried the network in 32% of its task-runs and in 17 sent requests to the model proxy to fetch test files; six of its task-runs listed other processes or mounts. Galley tried the network in 7% and did neither of the other two. Every such request was refused, and no task-run reached hidden tests.
7. **Found on 14 November: one OpenCode task-run asked a stronger model.** In round 2, on PHP `killer-sudoku-helper`, OpenCode's agent found the benchmark's proxy from inside its sandbox and sent it twelve requests of its own that were answered, seven of them by `deepseek-v4-pro`. The task failed anyway (Galley passed it), so no result here changes. The proxy now refuses every model but the benchmark's ([IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)).

## Spend

| | DeepSeek, all outside peak hours |
|---|---|
| Round 10 (the check of the two fixes) and the smoke test | $3.15 |
| This confirmation, four rounds | $7.40 |
| **Total for the two steps** | **$10.55** |

About $3.50 and $7 to $9 were planned.

## Caveats

- **The flaw described above.** It affects Galley's TypeScript and PHP task-runs here.
- **One cheap model, one version of each agent, three languages.** `deepseek-flash` is an alias and can change.
- **These tasks differ from the first set.** They were chosen by name from other Exercism tracks, not by how hard models found them, and they turned out easier: both agents pass more of them.
- **Grading for TypeScript runs the track's tests but not its type check.** A solution with type errors that passes the tests counts as a pass, for both agents.
- **Both agents may remember Exercism's public tests** from the model's training. The model is the same for both.
- **The tasks are no longer fresh.** I have read these transcripts to find the flaw above.
- **In this harness Galley's sandbox runs nested**, sharing the process list with Galley itself.

## Data and how to reproduce

Raw results, per-request usage, per-step summaries and the leak audits are in [`data/tracks2-2026-11-13/`](data/tracks2-2026-11-13/).

```bash
export BENCH_EXCLUDE=typescript/crypto-square,typescript/pythagorean-triplet
D=bench/data/tracks2-2026-11-13; R=t2-1,t2-2,t2-3,t2-4
python3 -I bench/analyze_rounds.py deepseek $D $R opencode galley   # the comparison and the significance test
python3 -I bench/breakdown.py      deepseek $D $R opencode galley   # by language, parts of the bill, cost interval
python3 -I bench/trace_stats.py    report   $D $R opencode galley   # where the output tokens go
```

To run a round again (see [README.md](README.md) for setup), from a checkout of commit `de69760`, which still has the flaw:

```bash
bench/setup_tracks.sh
CONCURRENCY=6 LANGS=php,typescript,ruby BENCH_TASKS=/tmp/bench-work/tracks2 \
  BENCH_SKIP=typescript/crypto-square,typescript/pythagorean-triplet \
  EXCLUDE=typescript/crypto-square,typescript/pythagorean-triplet bench/round.sh t2-1 all opencode,galley
```
