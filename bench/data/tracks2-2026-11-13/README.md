# Second confirmation, on new fresh tasks: data so far

Galley (frozen at commit de69760) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on 181 PHP, TypeScript and Ruby exercises neither agent had been run on. Design and decision rule: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md).

**Status on 13 November 2026, 14:00 UTC: stopped in the first round. The DeepSeek account ran out of balance at 13:51 UTC. There is no verdict.**

| Folder | State |
|---|---|
| `t2-1-partial` | 202 clean task-runs of 362: the 61 PHP tasks and 40 of the 58 TypeScript tasks, both agents. Twenty-one task-runs that the outage touched (a refused request, or still running when it began, or their task's other arm) were removed and will run again. No Ruby task has run yet. Leak audit of what ran: nothing flagged. |

Each folder holds `results.jsonl`, `proxy-usage.jsonl` and `leak-audit.json`, as described in [`../fresh-2026-11-12/README.md`](../fresh-2026-11-12/README.md).
