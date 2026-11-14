# Scripts behind the figures in `model-switching.md` and `galley-against-the-field.md`

Each reads a saved copy of a public leaderboard page, so the figures can be checked or refreshed. Nothing is downloaded by the scripts themselves, and the pages are not kept in this repository.

```bash
curl -sS -o /tmp/tbench.html https://www.tbench.ai/
python3 -I research/tools/tbench_board.py /tmp/tbench.html            # the Terminal-Bench board: solved, cost per run, five-run pass rate

curl -sS -o /tmp/swebench.html https://www.swebench.com/
python3 -I research/tools/swebench_tasks.py /tmp/swebench.html models  Verified 2.0.0
python3 -I research/tools/swebench_tasks.py /tmp/swebench.html pairs   Verified 2.0.0
python3 -I research/tools/swebench_tasks.py /tmp/swebench.html reruns  Verified
python3 -I research/tools/swebench_tasks.py /tmp/swebench.html cascade Verified 2.0.0 "MiniMax M2.5" "Claude 4.5 Opus"
python3 -I research/tools/swebench_tasks.py /tmp/swebench.html groups  Multilingual 2.0.0 research/tools/languages.json
```

The third script prints the Harness Leaderboard used in `galley-against-the-field.md`:

```bash
curl -sS -o /tmp/harness.json https://joelniklaus-harness-leaderboard.hf.space/api/index
python3 -I research/tools/harness_board.py /tmp/harness.json                       # every model, efforts pooled
python3 -I research/tools/harness_board.py /tmp/harness.json DeepSeek-V4.1-Flash   # one model, each effort
```

- The figures in the documents were read on 14 November 2026. Both sites change; a later copy will give other numbers.
- `swebench_tasks.py` uses only the runs of the site's own bash-only agent, the only ones published with per-task results.
- `languages.json` assigns each SWE-bench Multilingual repository to a language. The assignment is mine.
