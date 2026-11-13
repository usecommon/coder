# Second confirmation, on new fresh tasks: data so far

Galley (frozen at commit de69760) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on 181 PHP, TypeScript and Ruby exercises neither agent had been run on. Design and decision rule: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md).

**Status on 13 November 2026, 18:45 UTC: rounds 1 to 3 of 4 are complete; the last is running. There is no verdict yet.**

| Folder | State |
|---|---|
| `t2-1` | complete: 362 task-runs. It ran in two parts: the DeepSeek account ran out of balance at 13:51 UTC, 202 clean task-runs were kept, and the rest ran from 16:52 UTC once the balance was restored. No task-run reached hidden tests; one OpenCode task-run is flagged for information. |
| `t2-2` | complete: 362 task-runs. No task-run reached hidden tests; two OpenCode task-runs are flagged for information. |
| `t2-3` | complete: 362 task-runs. Leak audit: nothing flagged. |

Each folder holds `results.jsonl`, `proxy-usage.jsonl`, `steps.jsonl` and `leak-audit.json`, as described in [`../fresh-2026-11-12/README.md`](../fresh-2026-11-12/README.md).
