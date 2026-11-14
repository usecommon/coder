# Fourth confirmation on fresh tasks, with a second attempt: Galley vs OpenCode

*Run on 14 November 2026. Galley is the version frozen at commit `de69760`, compared with OpenCode 1.19.5 on DeepSeek-V4.1-Flash. Tasks: 200 exercises from Exercism's Bash, Lua and Tcl tracks, which neither agent had been run on. One round. A task whose first attempt failed got the failing test output and one more attempt in the same session. The design, the task list and both comparisons below were written down before the first run ([IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)).*

**One round, not three.** The design said to stop after round 1 if it cost more than $3.30. It cost $6.01 when the driver stopped: these tasks need a second attempt in six task-runs out of ten, and cost about three times as much as the earlier sets. One round leaves wide intervals.

## Verdict by the user's rule (first attempt)

**Not a win. Galley is ahead and clearly cheaper, but the lead is under 5 points and not significant in one round.**

| Condition | Measured | Met |
|---|---|---|
| Pass rate higher by 5 points or more | +4.5 points: 39.5% against 35.0% (95% interval −0.5 to +9.5) | **No** |
| Sign test over tasks, p < 0.05 | Better on 18 tasks, worse on 9; p = 0.12 | **No** |
| Lower cost per round at list price | $1.88 against $2.40: 22% lower (95% interval 33% to 9% lower) | Yes |

## The second question: the same results for less, after both attempts?

This is not the user's rule. Its two thresholds were fixed before the run.

| Condition | Measured | Met |
|---|---|---|
| The interval for the pass-rate difference lies wholly above −3 points | +0.5 points: 84.5% against 84.0% (95% interval −4.5 to +5.5) | **No** |
| The interval for the cost difference lies wholly below zero | 8% lower: $2.88 against $3.14 (95% interval 20% lower to 6% higher) | **No** |

**Not shown.** The measured values are what the question describes, the same pass rate for less money, but one round is too little to exclude a 3-point deficit or a cost tie.

## Results

| | OpenCode 1.19.5 | Galley |
|---|---|---|
| Passed on the first attempt (of 200) | 70 (35.0%) | 79 (39.5%) |
| Second attempts, and how many of them passed | 130, 98 (75%) | 121, 90 (74%) |
| **Passed after both attempts** | 168 (84.0%) | 169 (84.5%) |
| Cost of the first attempts | $2.40 | $1.88 |
| Cost of the round, both attempts | $3.14 | $2.88 |
| Cost per solved task, both attempts | $0.0187 | $0.0170 |
| Task-runs stopped at the 10-minute limit, first and second attempt | 2 and 1 | 2 and 1 |
| Task-runs that reached hidden tests or another model (audit) | 0 | 0 |

By language:

| | Bash (53 tasks) | Lua (67) | Tcl (80) |
|---|---|---|---|
| First attempt, OpenCode and Galley | 32.1% and 39.6% | 29.9% and 35.8% | 41.2% and 42.5% |
| After both attempts, OpenCode and Galley | 75.5% and 81.1% | 82.1% and 83.6% | 91.2% and 87.5% |

What this shows:
- **The first attempt is hard in these languages** (35 to 40%). The tests check exact output and error text that the starting files do not give.
- **The second attempt lifts both agents by 45 to 49 points, to the same level.** It fixes three failures in four for either agent.
- **Galley's saving is in the first attempt.** Its second attempts cost more than OpenCode's ($0.0083 against $0.0057 each), which shrinks the saving over the whole round from 22% to 8%.

## A defect in Galley, found by the second attempt

In two task-runs Galley's first attempt was cut off at the 10-minute limit while a command was still running. Its second attempt then could not start: resuming the session, Galley sent the model a history that ended in tool calls without results, and the API refused it.

- **How it is counted.** Both task-runs count as failed in both attempts. The harness first took "no answer from the model" for an outage, recorded nothing and ran those tasks again, which gave Galley a fresh run it was not entitled to. I corrected that: the two results are reconstructed as failures, OpenCode's results from the same sessions are restored, and the re-runs are set aside. Before the correction the file read 171 against 167 after both attempts; it now reads 169 against 168.
- **The harness now grades such a task-run** instead of skipping it: a request the API refuses as invalid is the agent's doing.
- **Galley is being fixed** to repair such a session when it resumes it. The fix is not part of this confirmation.

## What went wrong, and departures from the plan

1. **Stopped after one round** by the cost rule, as designed.
2. **A fault in the new second-attempt code.** A message that began with a dash was taken for an option by both agents' command lines (Lua's test runner prints a row of dashes first). Four task-runs were affected, two of each agent; none was recorded. I stopped the round at 114 results, made the message start with an empty line, and resumed.
3. **The machine restarted twice during the round** (16:42 and 16:53 UTC), and I stopped it once for the fix above. Six results whose other arm had not finished were set aside and their pairs run again, as the design says.
4. **The Galley defect above** and the correction of its two results.
5. **A stray process.** While checking the fix for point 2, I started OpenCode once outside the sandbox by mistake. Its own log shows it only started up: no model call, no tool use. I stopped it after two minutes.
6. **The agents still look for the tests.** OpenCode tried the network in 40% of its task-runs and Galley in 14%. The proxy refused 49 of their requests for other endpoints and 2 for another model. Two OpenCode task-runs put a question of their own to the benchmark's model, which is allowed.

## Spend

| | DeepSeek, all outside peak hours |
|---|---|
| Smoke test | $0.01 |
| Round 1, with interrupted attempts | $6.45 |
| The re-runs that were set aside | $0.17 |
| **Total** | **$6.63** |

About $8 was planned for three rounds. Two more rounds would cost about $12.

## Where the comparison stands after four confirmations

| | First attempt: Galley's lead | Galley's cost against OpenCode's |
|---|---|---|
| First (JavaScript, Java, C++; 121 tasks, 4 rounds) | +7.6 points, p = 0.001 | 10% higher |
| Second (PHP, TypeScript, Ruby; 181 tasks, 4 rounds) | +3.5 points, p = 0.16 | 12% lower |
| Third (C, C#, Elixir; 201 tasks, 3 rounds) | +1.0 points, p = 0.58 | 11% lower |
| Fourth (Bash, Lua, Tcl; 200 tasks, 1 round) | +4.5 points, p = 0.12 | 22% lower |
| **Pooled over the 703 tasks** | **+3.8 points** (95% interval +1.8 to +5.8; better on 129 tasks, worse on 79; p = 0.001) | |

- **Galley is ahead on the first attempt in all four, by 3.8 points on average.** That is a real lead and it is below the 5 points the rule asks for.
- **With a second attempt the two are level:** 97.0% each in the pilot on the third set, 84.5% and 84.0% here.
- **Galley has been cheaper in every campaign since its two fixes:** by 12%, 11% and, here, 22% on the first attempt and 8% over both.

## Caveats

- **One round.** Round-to-round swings of 3 to 5 points have been normal in every campaign.
- **One cheap model, one version of each agent, three languages.** `deepseek-flash` is an alias and can change.
- **Three Bash tests stay skipped** by the track's own conditions: two need a terminal, one is optional extra credit.
- **Two results are reconstructed** and four task-runs' transcripts are those of re-runs (see above and `NOTES.txt` in the data folder).
- **The second attempt differs from Aider's in two ways:** the test files are hidden again before it, and the output shown is capped at about 16,000 characters.
- **The tasks are no longer fresh** for any later version of Galley.

## Data and how to reproduce

Results, per-request usage, the audit, the results that were set aside and the file before correction are in [`data/tracks4-2026-11-14/`](data/tracks4-2026-11-14/).

```bash
export BENCH_EXCLUDE=tcl/sgf-parsing
D=bench/data/tracks4-2026-11-14
BENCH_COST=first python3 -I bench/analyze_rounds.py deepseek $D t4-1 opencode galley   # the user's rule: first attempt
BENCH_PASS=pass2 python3 -I bench/analyze_rounds.py deepseek $D t4-1 opencode galley   # after both attempts
BENCH_PASS=pass2 python3 -I bench/breakdown.py      deepseek $D t4-1 opencode galley   # by language, cost interval
```

To run a round again (see [README.md](README.md) for setup), from a checkout of commit `097c03d` or later:

```bash
bench/setup_tracks.sh
CONCURRENCY=6 BENCH_ATTEMPTS=2 LANGS=bash,lua,tcl BENCH_TASKS=/tmp/bench-work/tracks4 \
  BENCH_SKIP=tcl/sgf-parsing EXCLUDE=tcl/sgf-parsing bench/round.sh t4-1 all opencode,galley
```
