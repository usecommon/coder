# Round 10: the frozen Galley against the one with two fixes

`galley-old` is Galley at commit 61300b4 (the version of the first confirmation); `galley-new` is Galley at de69760 (file tools reach the sandbox's `/tmp`; helper agents described and run at low effort). Side by side on the 121 JavaScript, Java and C++ tasks, two rounds, 13 November 2026. Design, rule and results: [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md).

Each folder holds `results.jsonl`, `proxy-usage.jsonl`, `steps.jsonl` and `leak-audit.json`, as described in [`../fresh-2026-11-12/README.md`](../fresh-2026-11-12/README.md). Round 1 was interrupted by a machine restart after 83 task-runs and resumed an hour and a half later.

```bash
export BENCH_EXCLUDE=javascript/parallel-letter-frequency
D=bench/data/round10-2026-11-13
python3 -I bench/analyze_rounds.py deepseek $D fix-1,fix-2 galley-old galley-new
python3 -I bench/breakdown.py      deepseek $D fix-1,fix-2 galley-old galley-new
python3 -I bench/trace_stats.py    report   $D fix-1,fix-2 galley-old galley-new
```
