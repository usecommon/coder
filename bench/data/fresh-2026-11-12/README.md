# Confirmation on fresh tasks: data

Galley (frozen at commit 61300b4) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on the 121 JavaScript, Java and C++ exercises neither agent had been run on before. Four rounds, 12 and 13 November 2026. Results and what they mean: [`../../RESULTS-fresh.md`](../../RESULTS-fresh.md). Design and decision rule: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md).

| Folder | Task-runs | Leak audit |
|---|---|---|
| `fresh-1` | 242 | nothing flagged |
| `fresh-2` | 242 | nothing flagged |
| `fresh-3` | 242 (154 before a pause, 88 after) | nothing flagged |
| `fresh-4` | 242 | no task-run reached hidden tests; 3 flagged for information (they listed other processes or mounts) |

Each folder holds:
- `results.jsonl`: one line per task-run with the grading result.
- `proxy-usage.jsonl`: token usage of every model request (no request or response text).
- `steps.jsonl`: one line per task-run with what each step did and how many output tokens it cost, made by `bench/trace_stats.py extract` from the transcripts. The transcripts themselves are not kept here.
- `leak-audit.json`: the task-runs the audit flagged (an empty list when none).

```bash
export BENCH_EXCLUDE=javascript/parallel-letter-frequency
D=bench/data/fresh-2026-11-12; R=fresh-1,fresh-2,fresh-3,fresh-4
python3 -I bench/analyze_rounds.py deepseek $D $R opencode galley
python3 -I bench/breakdown.py      deepseek $D $R opencode galley
python3 -I bench/trace_stats.py    report   $D $R opencode galley
```
