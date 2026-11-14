#!/usr/bin/env python3
"""Print the Terminal-Bench leaderboard embedded in a saved copy of https://www.tbench.ai/ .

    curl -sS -o tbench.html https://www.tbench.ai/
    python3 -I tbench_board.py tbench.html

One line per entry: harness, model, effort, share of tasks solved with the board's 95% interval, the share solved at
least once in five runs, runs, cost per run and output tokens per run. Used for section 3 of ../model-switching.md."""
import json, re, sys

page = open(sys.argv[1], encoding="utf-8", errors="replace").read()
# The page is a Next.js app: its data arrives as JSON strings pushed by inline scripts.
chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', page, flags=re.S)
text = "".join(json.loads('"' + c + '"') for c in chunks)
decoder = json.JSONDecoder()
rows, seen = [], set()
for m in re.finditer(r'\{"id":"[0-9a-f-]{36}"', text):
    try:
        entry, _ = decoder.raw_decode(text, m.start())
    except ValueError:
        continue
    if isinstance(entry, dict) and "metrics" in entry and "metadata" in entry and entry["id"] not in seen:
        seen.add(entry["id"])
        rows.append(entry)
rows.sort(key=lambda e: -e["metrics"]["accuracy"])
title = re.search(r'"title":"(Terminal-Bench [^"]+)"', text)
print(f"{title.group(1) if title else 'Terminal-Bench'}: {len(rows)} entries")
print(f"{'harness':16} {'model':26} {'effort':6} {'solved':>7} {'±':>5} {'in 5':>6} {'runs':>5} {'$/run':>7} {'out tok/run':>11}  date")
for e in rows:
    md, mt = e["metadata"], e["metrics"]
    n = mt.get("n_trials") or 0
    cost = mt.get("total_cost_usd")
    print(
        f"{md['agent_display']['label'][:16]:16} {md['model_display']['label'][:26]:26} {str(md.get('reasoning_effort'))[:6]:6} "
        f"{mt['accuracy']:>6.1f}% {mt.get('accuracy_ci95_half_width', 0):>5.1f} {100 * mt.get('pass_at_5', 0):>5.1f}% {n:>5} "
        f"{(cost / n if cost and n else 0):>7.2f} {int(mt.get('output_tokens', 0) / n) if n else 0:>11}  {md.get('date', '')}"
    )
