# Confirmation on fresh tasks: data so far

Galley (frozen at commit 61300b4) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on the 121 JavaScript, Java and C++ exercises neither agent had been run on before. The design and the decision rule are in [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md).

**Status on 12 November 2026, 23:40 UTC: paused at the user's request. Two of the four planned rounds are complete. There is no verdict yet.**

| Folder | State |
|---|---|
| `fresh-1` | complete: 242 task-runs, leak audit clean |
| `fresh-2` | complete: 242 task-runs, leak audit clean |
| `fresh-3-partial` | interrupted after 154 of 242 task-runs, leak audit of those clean; the rest of round 3 and all of round 4 are still to run |

Each folder holds the results (`results.jsonl`), the usage of every model request (`proxy-usage.jsonl`) and the leak audit (`leak-audit.json`, an empty list when nothing was flagged).

To analyse the complete rounds:

```bash
BENCH_EXCLUDE=javascript/parallel-letter-frequency python3 -I bench/analyze_rounds.py deepseek bench/data/fresh-2026-11-12 fresh-1,fresh-2 opencode galley
```
