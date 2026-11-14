# Third confirmation, on a third set of fresh tasks: data

Galley (frozen at commit de69760) against OpenCode 1.19.5 on DeepSeek-V4.1-Flash, on 201 C, C# and Elixir exercises neither agent had been run on, with the corrected benchmark. Design and decision rule: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md). Results and what they mean: [`../../RESULTS-fresh3.md`](../../RESULTS-fresh3.md).

All three rounds ran on 14 November 2026.

| Folder | State |
|---|---|
| `t3-1` | complete: 402 task-runs. The machine restarted at 07:08 UTC; two results whose other arm had not finished were set aside and both arms run again. One task (C `all-your-base`) was run again for both agents after round 3, because OpenCode's agent had asked a stronger model through the proxy: `results-as-measured.jsonl` holds the results before that. |
| `t3-2` | complete: 402 task-runs. The machine restarted at 08:39 UTC; two results were set aside and both arms run again. From there on the proxy refused every model but the benchmark's. |
| `t3-3` | complete: 402 task-runs. Four results were set aside by a fault of the operator's script and then restored; the re-runs it caused are in `reruns-not-used.jsonl` and are not used (see `NOTES.txt`). |

Each folder holds `results.jsonl`, `proxy-usage.jsonl`, `steps.jsonl` and `leak-audit.json`, as described in [`../fresh-2026-11-12/README.md`](../fresh-2026-11-12/README.md). The audit is the version of commit `9de5a38`, which also flags answers an agent obtained from another model (`other_model`) or by its own request to the model API (`model_by_hand`). No task-run of the final results is flagged for either, and none reached hidden tests. `dropped.jsonl` lists the results that were set aside and why. `checks.json` holds the counts printed by `track_checks.py`, which needs the raw run folders.

```bash
export BENCH_EXCLUDE=
D=bench/data/tracks3-2026-11-14; R=t3-1,t3-2,t3-3
python3 -I bench/analyze_rounds.py deepseek $D $R opencode galley
python3 -I bench/breakdown.py      deepseek $D $R opencode galley
python3 -I bench/trace_stats.py    report   $D $R opencode galley
```
