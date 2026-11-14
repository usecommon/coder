# Third confirmation on fresh tasks: Galley vs OpenCode

*Run on 14 November 2026. Galley is the version frozen at commit `de69760`, the same as in the second confirmation, compared with OpenCode 1.19.5 on DeepSeek-V4.1-Flash. Tasks: 201 exercises from Exercism's C, C# and Elixir tracks, which neither agent had been run on. Three rounds; in each, both agents ran every task side by side. The design, the task list and the rule were written down before the first run ([IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)). This is the first confirmation on the benchmark with the flaw of the earlier two fixed ([RESULTS-fresh2.md](RESULTS-fresh2.md)).*

## Verdict

**By the rule fixed in advance, Galley does not beat OpenCode. The two pass the same share of tasks within the noise, and Galley costs 11% less.**

| Condition | Measured | Met |
|---|---|---|
| Pass rate higher by 5 points or more | +1.0 points (95% interval −1.8 to +4.0) | **No** |
| Sign test over tasks, p < 0.05 | Better on 28 tasks, worse on 23; p = 0.58 | **No** |
| Lower cost per round at list price | $0.98 against $1.10: 11% lower (95% interval 19% to 2% lower) | Yes |

## Results

| | OpenCode 1.19.5 | Galley |
|---|---|---|
| Passes per round (of 201) | 140, 148, 149 | 150, 147, 146 |
| **Pass rate** | 72.5% | **73.5%** |
| Cost per round, at the list price | $1.13, $1.04, $1.13 | $1.03, $1.00, $0.92 |
| **Mean cost per round** | $1.10 | **$0.98** |
| Cost per solved task | $0.0076 | $0.0067 |
| Median time per task | 23 s | 30 s |
| Task-runs stopped at the 10-minute limit (of 603) | 0 | 1 |
| Task-runs that reached hidden tests (leak audit) | 0 | 0 |

By language, pooled over the three rounds:

| | C (43 tasks) | C# (82) | Elixir (76) |
|---|---|---|---|
| OpenCode | 76.7% | 76.0% | 66.2% |
| Galley | 74.4% | 80.5% | 65.4% |
| Difference | −2.3 points (p = 0.39) | +4.5 (p = 0.09) | −0.9 (p = 1.0) |
| Galley's cost against OpenCode's | 25% lower | 9% lower | 4% lower |

What this shows, and what it does not:
- **On pass rate the two agents are level here.** Galley was ahead in round 1 and behind in rounds 2 and 3. The interval for the lead runs from 1.8 points behind to 4.0 ahead.
- **Galley is the cheaper agent, for the second campaign in a row.** The interval for the cost difference does not include zero. Galley's requests cost less than half of OpenCode's; the model writes more for Galley, which eats part of that saving.
- **A lead of 5 points is not supported by the three confirmations together** (last section).

## One task was run again: an agent had asked a stronger model

During round 2 I found that the proxy which adds the API key forwarded any request an agent sent it.

- **What happened.** In round 1, on C `all-your-base`, OpenCode's agent failed to download the exercise's tests, found the proxy from inside its sandbox, listed the account's models and asked a stronger model, `deepseek-v4-pro`, to recall the official test file. It then passed the task. Galley failed it on a function name that only the hidden tests hold.
- **Why it matters.** The design says both agents use the same model.
- **Fix.** From the second part of round 2 the proxy forwards only the chat endpoint and only the benchmark's model. The self-test checks this from inside the sandbox, and the audit now flags any answer from another model.
- **Rule, written down before I looked at rounds 2 and 3:** such a task is run again for both agents, and the new results count. Both agents failed the re-run.

| | OpenCode | Galley | Lead |
|---|---|---|---|
| With the task run again (the verdict above) | 72.5% | 73.5% | +1.0 points |
| As first measured | 72.6% | 73.5% | +0.8 points |

The verdict is the same either way. The same thing had happened in one task-run of each earlier confirmation; both failed anyway, and both documents now say so. Galley's agent never did it.

## What decides these tasks

I read the failed gradings of round 1 for both agents. Most failures are not errors of reasoning. They are details that only the hidden tests define and that the starting files and the instructions do not give:

| Kind of hidden detail | Example | How common |
|---|---|---|
| Exact text of an error message | Elixir `all-your-base` expects `"all digits must be >= 0 and < input base"` | 16 of the 76 Elixir tasks need such text; the agents pass 19% (Galley) and 27% (OpenCode) of those task-runs, against 78% and 76% of all others |
| Name of a function the tests call | C `all-your-base` must define `rebase`; the starting header declares nothing | 14 of the 43 C tasks; both agents pass 60% of those task-runs, against 82% (Galley) and 85% (OpenCode) of the others |
| Type of an error, shape of a result, a trailing newline | C# `forth` expects `DivideByZeroException`; Elixir `food-chain` expects a final newline | most of the remaining failures |

- **The agents get these right only when the model remembers the public exercise.** Its reasoning says so in as many words: "Let me recall the actual canonical Elixir bowling test file". Galley's solutions reproduced 53% of the hidden message texts and OpenCode's 37%, but a task needs all of them, and by that count they are level (14 and 15 task-runs).
- **A harness cannot supply what is not in the task.** Failures a better self-check could have caught, where the instructions did state the rule, are a few task-runs per round for each agent.
- **Three things I tried, outside the rounds, to raise recall.** None helps:

| Idea | Measured on the 16 Elixir tasks with hidden text | Result |
|---|---|---|
| Ask the model to write the test file first | 14% of hidden messages reproduced, against about half in Galley's ordinary runs | Worse |
| Reasoning effort `low`, default, `max` in one request | Every message right in 26%, 30% and 34% of samples; output tokens 5,800, 9,600 and 15,000 | No real difference; `max` costs 56% more output than the default |
| Keep the declarations of the starting file | Dropped or changed in a few task-runs per round by both agents | Too rare to matter |

## Was the benchmark even-handed this time?

The flaw of the earlier confirmations was that Galley could not reach test tools OpenCode could. The self-test now builds and tests a small project in each language from inside both sandboxes. The counts below are from the agents' own commands over the three rounds (603 task-runs each).

| | OpenCode | Galley |
|---|---|---|
| Task-runs in which the build tool was tried, and ran | 602, 602 | 603, 603 |
| Task-runs in which the track's own test framework ran to a summary | 15 | 113 |
| Task-runs with a refused network request | 85 | 18 |
| C# task-runs that skipped package restore and then found the build missing it | 42 | 51 |
| Task-runs that changed a build file | 0 | 0 |
| Failed gradings: tests fail / does not compile against the tests / crashes / other | 141 / 21 / 4 / 0 | 132 / 24 / 3 / 1 |

Both agents could use the tools. Galley writes tests in the track's own framework far more often.

## What went wrong, and departures from the plan

1. **Three rounds, not four.** Round 1 cost $2.21 for both agents, over the $2.15 set in advance for running four.
2. **The machine restarted twice,** at 07:08 and 08:39 UTC. Each time the run resumed where it stopped. Four results whose other arm had not finished were set aside and both arms run again, as the design says.
3. **A fault of mine after round 3.** The script that applies that rule took the hardened proxy's own refusal of an agent's probe for an outage of the model account. It set aside four finished results (C `gigasecond` and C# `react`, both agents) and ran them again. I restored the four first results and do not use the re-runs. For those four task-runs the transcript counts above describe the re-runs.
4. **The proxy was changed during the campaign** (see above). Round 1 and the first 186 task-runs of round 2 ran before the change.
5. **I read round 1's transcripts while rounds 2 and 3 ran,** to prepare the next step. Nothing in the running campaign depended on it: the agents were frozen, the driver automatic and the analysis scripts committed.
6. **A smoke test came first:** `acronym` in each language, both agents, once. Nothing in Galley was changed after it.
7. **Unusual task-runs.** One Galley task-run hit the 10-minute limit. One test program of each agent hit the 4 GB memory cap. The agents still look for the tests: OpenCode tried the network in 14% of its task-runs and Galley in 3%; every such request was refused.

## Spend

| | DeepSeek, all outside peak hours |
|---|---|
| Smoke test | $0.01 |
| Three rounds, with interrupted attempts and the task run again | $6.47 |
| The re-runs caused by my fault (not used) | $0.03 |
| Diagnostics outside the rounds (recall and reasoning-effort requests) | $1.08 |
| **Total** | **$7.59** |

About $8 was planned. The 18 requests that `deepseek-v4-pro` answered are priced here as the benchmark's model; they cost somewhat more than that.

## The three confirmations together

| | First: JavaScript, Java, C++ | Second: PHP, TypeScript, Ruby | Third: C, C#, Elixir |
|---|---|---|---|
| Tasks, rounds | 121, four | 181, four | 201, three |
| Galley version | `61300b4` | `de69760` | `de69760` |
| Benchmark | Flaw against Galley | Flaw against Galley | Corrected |
| Lead | +7.6 points, p = 0.001 | +3.5 points, p = 0.16 | +1.0 points, p = 0.58 |
| Galley's cost against OpenCode's | 10% higher | 12% lower | 11% lower |
| Verdict by the rule | Not a win: cost | Not a win: lead | Not a win: lead |

- **Pooled over the 503 tasks, Galley leads by 3.5 points** (95% interval +1.4 to +5.5; better on 111 tasks, worse on 70; p = 0.003). That is a summary, not a verdict: the rule asks for the lead on one set of tasks.
- **The lead differs between the sets by more than chance alone would explain** (p about 0.03). The languages differ, the Galley version differs between the first and the other two, and I cannot separate the two.
- **The fix to the benchmark did not raise Galley's lead.** The largest lead was measured with the flaw, the smallest without it.
- **What holds across all three:** Galley is not behind, and since the two fixes of 13 November it is about 11% cheaper.

## Caveats

- **One cheap model, one version of each agent, three languages.** `deepseek-flash` is an alias and can change.
- **The benchmark rewards recall of public exercises.** That is the same for both agents, but it means much of what is measured is the model's memory, not the harness.
- **C# tasks ran with `/tmp` as the home folder** and with the .NET build servers off, for both agents, because the .NET tools need a writable home.
- **Grading uses each track's own test command on the agent's final workspace.** Build files are not restored; neither agent changed one.
- **The tasks are no longer fresh.** I have read these transcripts.
- **In this harness Galley's sandbox runs nested**, sharing the process list with Galley itself.

## Data and how to reproduce

Raw results, per-request usage, per-step summaries, the audits and the results that were set aside are in [`data/tracks3-2026-11-14/`](data/tracks3-2026-11-14/).

```bash
export BENCH_EXCLUDE=
D=bench/data/tracks3-2026-11-14; R=t3-1,t3-2,t3-3
python3 -I bench/analyze_rounds.py deepseek $D $R opencode galley   # the comparison and the significance test
python3 -I bench/breakdown.py      deepseek $D $R opencode galley   # by language, cost interval
python3 -I bench/trace_stats.py    report   $D $R opencode galley   # where the output tokens go
python3 -I bench/pool_sets.py opencode galley \
  bench/data/fresh-2026-11-12:fresh-1,fresh-2,fresh-3,fresh-4:javascript/parallel-letter-frequency \
  bench/data/tracks2-2026-11-13:t2-1,t2-2,t2-3,t2-4:typescript/crypto-square,typescript/pythagorean-triplet \
  $D:$R                                                              # the three confirmations together
```

To run a round again (see [README.md](README.md) for setup), from a checkout of commit `9de5a38` or later:

```bash
bench/setup_tracks.sh
CONCURRENCY=6 LANGS=c,csharp,elixir BENCH_TASKS=/tmp/bench-work/tracks3 bench/round.sh t3-1 all opencode,galley
```
