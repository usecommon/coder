#!/usr/bin/env python3
"""Print the Harness Leaderboard (ten coding harnesses on the same open models) from its public data.

    curl -sS -o harness.json https://joelniklaus-harness-leaderboard.hf.space/api/index
    python3 -I harness_board.py harness.json                       # every model, efforts pooled
    python3 -I harness_board.py harness.json DeepSeek-V4.1-Flash   # one model, each effort and pooled

One line per harness: share of scored runs that passed, the same per benchmark, cost per run and per solved task,
tokens and model calls per run. Used for ../galley-against-the-field.md."""
import json, sys

data = json.load(open(sys.argv[1]))
want = sys.argv[2] if len(sys.argv) > 2 else None
print(f"Harness Leaderboard {data.get('version')}, data of {data.get('generated_at', '')[:10]}")
rate = lambda r: 100 * r["n_pass"] / max(1, r["n_scored"])
for model, mv in data["leaderboard"].items():
    if want and want not in model:
        continue
    for effort, ev in mv["stages"]["full"]["efforts"].items():
        if not want and effort != "_all":
            continue
        rows = ev["harnesses"]
        benches = sorted({b for r in rows.values() for b in r.get("benchmarks", {})})
        print(f"\n{model}, effort {effort if effort != '_all' else 'pooled'}")
        print(f"  {'harness':17} {'version':13} {'runs':>5} {'solved':>7} " + " ".join(f"{b[:14]:>14}" for b in benches) + f" {'$/run':>7} {'$/solved':>8} {'tokens/run':>10} {'calls':>6}")
        for h, r in sorted(rows.items(), key=lambda kv: -rate(kv[1])):
            per = " ".join(f"{rate(r['benchmarks'][b]):>13.1f}%" if b in r.get("benchmarks", {}) else f"{'':>14}" for b in benches)
            print(f"  {h[:17]:17} {','.join(r.get('versions', []))[:13]:13} {r['n_scored']:>5} {rate(r):>6.1f}% {per} {r.get('cost_per_trial', 0):>7.3f} {r.get('cost_per_pass', 0):>8.3f} {r.get('tokens_per_trial', 0) / 1e6:>9.2f}M {r.get('calls_per_trial', 0):>6.1f}")
        total = lambda k: sum(r[k] for r in rows.values())
        print(f"  all harnesses together: {100 * total('n_pass') / total('n_scored'):.1f}% of {total('n_scored')} runs")
