# Confirmation on fresh tasks: Galley vs OpenCode

*Run on 12 and 13 November 2026. Galley was frozen at commit `61300b4` before the first run and is compared with OpenCode 1.19.5 on DeepSeek-V4.1-Flash. Tasks: the 121 JavaScript, Java and C++ exercises of Aider Polyglot, which neither agent had been run on. Four rounds; in each, both agents ran every task side by side, outside DeepSeek's peak hours. The design and the rule were written down before the first run ([IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)).*

## Verdict

**By the rule fixed in advance, Galley does not beat OpenCode. It meets both accuracy conditions and misses the cost condition.**

| Condition | Measured | Met |
|---|---|---|
| Pass rate higher by 5 points or more | +7.6 points (95% interval +3.7 to +11.8) | Yes |
| Sign test over tasks, p < 0.05 | Better on 33 tasks, worse on 11; p = 0.001 | Yes |
| Lower cost per round at list price | $0.83 against $0.75: 10% higher (95% interval 4% lower to 26% higher) | **No** |

## Results

| | OpenCode 1.19.5 | Galley |
|---|---|---|
| Passes per round (of 121) | 51, 54, 46, 53 | 61, 61, 67, 52 |
| **Pass rate** | **42.1%** | **49.8%** |
| Cost per round, at the list price | $0.71, $0.72, $0.82, $0.75 | $0.81, $0.84, $0.71, $0.95 |
| **Mean cost per round** | **$0.75** | $0.83 |
| Cost per solved task | $0.0148 | $0.0138 |
| Median time per task | 31 s | 41 s |
| Task-runs stopped at the 10-minute limit (of 484) | 0 | 1 |
| Task-runs that reached hidden tests (leak audit) | 0 | 0 |

By language, pooled over the four rounds:

| | JavaScript (48 tasks) | Java (47) | C++ (26) |
|---|---|---|---|
| OpenCode | 40.1% | 33.0% | 62.5% |
| Galley | 47.9% | 42.0% | 67.3% |
| Difference | +7.8 points (p = 0.04) | +9.0 (p = 0.04) | +4.8 (p = 0.51) |
| Galley's cost against OpenCode's | 32% higher | 3% higher | 7% lower |

What this shows, and what it does not:
- **The lead is real, and it carries over to tasks Galley was not developed on.** It is 7.6 points here and was 6.3 on the development tasks ([RESULTS-clean.md](RESULTS-clean.md)); both are statistically significant. It appears in all three languages and in three of the four rounds. In round 4 the two agents tied (53 and 52).
- **The cost difference is not settled either way.** Galley cost more in three rounds and less in one, and the 95% interval runs from 4% cheaper to 26% dearer. A typical task costs the same with both agents (median $0.0040). The difference comes from a few very long task-runs.
- **Per solved task, Galley costs 7% less.** The rule does not count this.
- **Both agents solve fewer of these tasks than of the old ones** (42% and 50%, against 64% and 70%). The JavaScript and C++ starting files say little about what the hidden tests will call: parameter order, return types, class names. Many failures are wrong guesses about that, which is also why pass counts swing between rounds. In C++, about 70% of the failed gradings are solutions the tests do not even compile against.

## Why Galley costs more

All figures are from the four rounds. They come from the logs; none of this was tested by changing something and measuring again.

**1. The extra cost is all in what the model writes.**

| Per round | OpenCode | Galley |
|---|---|---|
| Input (what the agent sends) | $0.30 | $0.14 |
| Output (what the model writes) | $0.46 | $0.69 |
| of which reasoning tokens | 516,000 | 730,000 |
| of which visible tokens (text and tool calls) | 243,000 | 424,000 |

Galley's requests cost less than half of OpenCode's. The model then writes 52% more for Galley, and output is priced four times higher than fresh input.

**2. The extra output comes after the first version of the solution is written.**

| Output tokens per task-run | OpenCode | Galley |
|---|---|---|
| Up to and including the first version | 3,928 | 4,367 |
| Between the first version and the last change | 804 | 2,296 |
| After the last change | 1,237 | 2,202 |

Galley reaches a first version in fewer steps (3.8 against 5.9) and then keeps working on it. It changes the solution again in 41% of task-runs; OpenCode does in 29%.

**3. Part of that extra work is where the lead comes from.** Galley writes about three times as much test code as OpenCode (4,000 characters per task-run inside shell commands, against 1,300). Its own checks failed and led to a fix in 63 task-runs; OpenCode's did in 16. Those task-runs pass more often than average (54% and 56%). This part of the spending should be kept.

**4. Two defects in Galley account for most of the gap.**

| Defect | How often | Cost |
|---|---|---|
| **Helper agents asked to "recall" the hidden tests.** The model used the sub-agent tool to ask helpers to remember the official test file. They reasoned at length (up to 35,000 tokens in a single response) and found nothing. | 2 of 484 task-runs (3 helpers in one, 13 in the other); both tasks failed | $0.21, or 6.4% of everything Galley spent |
| **Test scripts refused under `/tmp`.** Galley's prompt tells the model to save test scripts under `/tmp`, and its file-writing tool refused that folder. The model wrote the script, was refused, and wrote it out again in a shell command. | 87 task-runs (18%), about 380,000 characters | About $0.06, or 1.9% |

Without these two, Galley's cost would have been about 1% above OpenCode's instead of 10%. That is arithmetic on the logs, not a measurement: with the defects fixed the model may behave differently in other ways.

Both are now fixed in Galley (commits `27a7407` and `1810aba`). The fixes came after the frozen version and have not been measured.

**5. Smaller avoidable spending.**
- After its checks first pass, Galley goes on for about three more steps without changing anything. That is 8% of its output.
- In 61 task-runs it changed a solution that had passed its own checks, with no failing check in between. That is another 7% of its output. These are mostly second thoughts about what the hidden tests might want, and those task-runs pass slightly less often than average (46%).

## What went wrong, and departures from the plan

1. **Round 3 was interrupted.** The work was paused at the user's request after 154 of 242 task-runs and resumed 4 hours 20 minutes later, after the machine had restarted. Finished task-runs were kept and the six in flight ran again; costs count only the attempt that produced each result. No task had its two arms in different sessions. In the part that ran after the pause, OpenCode passed 18 of 44 tasks where it had averaged 24 on the same tasks in rounds 1 and 2, and Galley passed 29 where it had averaged 25. I looked for a fault in the environment (tool errors, timings) and found none. Round 4 ran entirely after the restart, and OpenCode scored there as it had in rounds 1 and 2.
2. **One Galley task-run hit the 10-minute limit** (round 4, Java `variable-length-quantity`, the one with 13 helper agents). It cost $0.15, the dearest task-run of the campaign. OpenCode's attempt at the same task in that round was its own dearest ($0.08).
3. **One memory cap, one grading out of time.** A Galley test program hit the 4 GB cap in round 1 (the task still passed). One OpenCode solution did not finish grading within 5 minutes in round 1 and counts as a failure.
4. **The agents still look for the tests.** OpenCode tried the network in 40% of its task-runs, and in 9 it sent requests to the model proxy to fetch the exercise's test file from GitHub. Galley tried the network in 11% and never the proxy. Every such request was refused. Three task-runs in round 4 listed other processes or mounts (one Galley, two OpenCode); the audit flags these for information, and none of them reached anything.
5. **Twelve model responses were cut by connection resets** (10 of Galley's 5,600 requests, 2 of OpenCode's 5,400). Galley repeated the request each time, OpenCode's two came after its final message, and every affected task-run finished normally. The cut responses are not in the cost figures.

## Spend

| | DeepSeek, all outside peak hours |
|---|---|
| Smoke test (10 tasks) | $0.04 |
| Four rounds | $6.34 |
| **Total** | **$6.38** |

About $7 was planned. The cost-cutting rounds before this (round 9 in the [improvement log](IMPROVEMENT_LOG.md)) cost $4.16.

## Caveats

- **One cheap model, one version of each agent, three languages.** `deepseek-flash` is an alias and can change.
- **Fresh, but of the same kind.** Galley was not developed on these tasks, but they are Exercism exercises like the development tasks, and many exist in both sets in different languages.
- **Both agents may remember Exercism's public tests** from the model's training. The model is the same for both.
- **The tasks are no longer fresh.** I have now read these transcripts and changed Galley because of them. Any claim about a later version of Galley needs tasks it has not been run on.
- **In this harness Galley's sandbox runs nested**, sharing the process list with Galley itself. On an ordinary machine it has a process list of its own.
- **Six task-runs ran at once on four CPUs.** Slow builds may have cost both agents some time.
- **The classification behind "Why Galley costs more" is by pattern** (which commands run code, which outputs report a failure) and is approximate.

## Data and how to reproduce

Raw results, per-request usage, per-step summaries and the leak audits are in [`data/fresh-2026-11-12/`](data/fresh-2026-11-12/).

```bash
export BENCH_EXCLUDE=javascript/parallel-letter-frequency
D=bench/data/fresh-2026-11-12; R=fresh-1,fresh-2,fresh-3,fresh-4
python3 -I bench/analyze_rounds.py deepseek $D $R opencode galley   # the comparison and the significance test
python3 -I bench/breakdown.py      deepseek $D $R opencode galley   # by language, parts of the bill, cost interval
python3 -I bench/trace_stats.py    report   $D $R opencode galley   # where the output tokens go
```

To run a round again (see [README.md](README.md) for setup), from a checkout of commit `61300b4`:

```bash
CONCURRENCY=6 LANGS=javascript,java,cpp BENCH_SKIP=javascript/parallel-letter-frequency \
  EXCLUDE=javascript/parallel-letter-frequency bench/round.sh fresh-1 all opencode,galley
```
