# Fourth confirmation, on fresh Bash, Lua and Tcl tasks with a second attempt: data

Galley (frozen at commit de69760) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on 200 Bash, Lua and Tcl exercises neither agent had been run on, with `BENCH_ATTEMPTS=2`. One round, on 14 November 2026: the design stops after round 1 when it costs more than $3.30, and it cost $6.01. Design and rules: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md). Results and what they mean: [`../../RESULTS-fresh4.md`](../../RESULTS-fresh4.md).

`t4-1/` holds:

| File | What it is |
|---|---|
| `results.jsonl` | 400 task-runs: `pass` (first attempt), `attempts`, `pass2` (after both attempts). Two Galley results carry a field `reconstructed`: see `NOTES.txt`. |
| `results-before-correction.jsonl` | The file as the driver left it, before those two corrections. |
| `proxy-usage.jsonl` | Per-request usage of the attempts that produced the results. Requests at or after a result's `startedAt2` belong to its second attempt. |
| `reruns-not-used.jsonl`, `proxy-usage-reruns-not-used.jsonl` | Re-runs that the corrections set aside, and their requests. |
| `dropped.jsonl` | Results set aside because the other arm had not finished in the same session (two machine restarts, one stop by the operator). |
| `leak-audit.json` | The audit: nothing counts as contamination. Two OpenCode task-runs put a question of their own to the benchmark's model, which is allowed. |
| `NOTES.txt` | The two corrections, both against Galley. |

`checks.json` holds the counts printed by `track_checks.py` for the first attempts.

```bash
export BENCH_EXCLUDE=tcl/sgf-parsing
D=bench/data/tracks4-2026-11-14
BENCH_COST=first python3 -I bench/analyze_rounds.py deepseek $D t4-1 opencode galley   # the user's rule: first attempt
BENCH_PASS=pass2 python3 -I bench/analyze_rounds.py deepseek $D t4-1 opencode galley   # after both attempts
```
