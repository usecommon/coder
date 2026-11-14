# Second confirmation, on new fresh tasks: data

Galley (frozen at commit de69760) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on 181 PHP, TypeScript and Ruby exercises neither agent had been run on. Design and decision rule: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md).

All four rounds are complete (13 and 14 November 2026). Results and what they mean: [`../../RESULTS-fresh2.md`](../../RESULTS-fresh2.md).

| Folder | State |
|---|---|
| `t2-1` | complete: 362 task-runs. It ran in two parts: the DeepSeek account ran out of balance at 13:51 UTC, 202 clean task-runs were kept, and the rest ran from 16:52 UTC once the balance was restored. No task-run reached hidden tests; one OpenCode task-run is flagged for information. |
| `t2-2` | complete: 362 task-runs. No task-run reached hidden tests; two OpenCode task-runs are flagged for information. |
| `t2-3` | complete: 362 task-runs. Leak audit: nothing flagged. |
| `t2-4` | complete: 362 task-runs. It ran in two parts: paused at the user's request after 95 task-runs on 13 November, finished on 14 November. No task-run reached hidden tests; three OpenCode task-runs are flagged for information. |

Each folder holds `results.jsonl`, `proxy-usage.jsonl`, `steps.jsonl` and `leak-audit.json`, as described in [`../fresh-2026-11-12/README.md`](../fresh-2026-11-12/README.md).

```bash
export BENCH_EXCLUDE=typescript/crypto-square,typescript/pythagorean-triplet
D=bench/data/tracks2-2026-11-13; R=t2-1,t2-2,t2-3,t2-4
python3 -I bench/analyze_rounds.py deepseek $D $R opencode galley
python3 -I bench/breakdown.py      deepseek $D $R opencode galley
python3 -I bench/trace_stats.py    report   $D $R opencode galley
```
