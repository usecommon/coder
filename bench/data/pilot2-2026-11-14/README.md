# Pilot of a second attempt with the test output: data

One round on the 201 C, C# and Elixir tasks of the third confirmation, which were already used up: Galley (frozen at commit de69760) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, run on 14 November 2026 with `BENCH_ATTEMPTS=2`. A task whose first attempt failed grading got the failing test output and one more attempt in the same session. Design and results: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md). This is a pilot, not a verdict.

`p2-1/results.jsonl` has, per task-run, `pass` (the first attempt), `attempts` (1 or 2) and `pass2` (the result after both), and for a second attempt its start time, duration and grading exit code. `proxy-usage.jsonl` holds the requests of both attempts under the same tag; those at or after `startedAt2` belong to the second. `leak-audit.json` is the audit of commit `40aa0c4`: nothing counts as contamination; one OpenCode task-run put a question of its own to the benchmark's model, which is allowed.

```bash
export BENCH_EXCLUDE=
D=bench/data/pilot2-2026-11-14
python3 -I bench/analyze_rounds.py deepseek $D p2-1 opencode galley                    # first attempt
BENCH_PASS=pass2 python3 -I bench/analyze_rounds.py deepseek $D p2-1 opencode galley   # after both attempts
BENCH_PASS=pass2 python3 -I bench/breakdown.py deepseek $D p2-1 opencode galley        # by language, cost interval
```
