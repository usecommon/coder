#!/usr/bin/env python3
"""Where the passes and the cost of each arm come from: by language, by part of the bill, and by size of task-run.
A companion to analyze_rounds.py (which makes the pooled comparison and the significance test).
usage: breakdown.py <prices: deepseek|sonnet> <rounds-dir> <round>[,<round>...] <armA> <armB> [<armC>...]
  e.g. BENCH_EXCLUDE=javascript/parallel-letter-frequency python3 -I bench/breakdown.py deepseek \
         bench/data/fresh-2026-11-12 fresh-1,fresh-2,fresh-3,fresh-4 opencode galley
Each round is a folder with results.jsonl and the proxy's log (proxy.jsonl, or proxy-usage.jsonl as stored in data/).
Costs are at the list price outside peak hours. The paired comparison is between the first two arms.
BENCH_PASS=pass2 scores a round run with two attempts by the result after both (default: the first attempt)."""
import collections, json, math, os, random, statistics, sys

EXCL = {tuple(x.split("/")) for x in os.environ.get("BENCH_EXCLUDE", "rust/macros,go/octal").split(",") if x}
PRICES = {"deepseek": dict(miss=0.15, hit=0.003, write=0.15, out=0.60), "sonnet": dict(miss=2.0, hit=0.10, write=2.5, out=10.0)}
P = PRICES[sys.argv[1]]
base, rounds, arms = sys.argv[2], sys.argv[3].split(","), sys.argv[4:]

res = {}                                          # (round, arm, task) -> result record
use = collections.defaultdict(collections.Counter)   # (arm, lang) -> token counters
run_cost = collections.Counter()                  # (round, arm, task) -> dollars
sizes = collections.defaultdict(list)             # arm -> output tokens of each response
for r in rounds:
    for line in open(f"{base}/{r}/results.jsonl"):
        try:
            o = json.loads(line)
        except Exception:
            continue
        t = (o["lang"], o["name"])
        if t not in EXCL:
            o["pass"] = o.get(os.environ.get("BENCH_PASS", "pass"), o["pass"])
            res[(r, o["agent"], t)] = o
    p = next(q for q in (f"{base}/{r}/proxy.jsonl", f"{base}/{r}/proxy-usage.jsonl") if os.path.exists(q))
    for line in open(p):
        try:
            o = json.loads(line)
        except Exception:
            continue
        parts = o.get("tag", "").split("__")
        if len(parts) != 3:
            continue
        arm, t = parts[0], (parts[1], parts[2])
        rec = res.get((r, arm, t))
        if rec is None or (o.get("t") is not None and o["t"] < rec.get("startedAt", 0) - 2000):
            continue                              # not part of the run, or an interrupted earlier attempt
        u = o.get("usage") or {}
        if "prompt_tokens" in u:                  # OpenAI-style usage
            hit = u.get("prompt_cache_hit_tokens", (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)) or 0
            d = dict(hit=hit, miss=u["prompt_tokens"] - hit, write=0, out=u.get("completion_tokens", 0),
                     reasoning=(u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0) or 0)
        elif "input_tokens" in u:                 # Anthropic-style usage (reasoning is not reported separately)
            d = dict(hit=u.get("cache_read_input_tokens", 0), miss=u.get("input_tokens", 0), write=u.get("cache_creation_input_tokens", 0),
                     out=u.get("output_tokens", 0), reasoning=0)
        else:
            continue
        dollars = sum(d[k] * P[k] for k in ("miss", "hit", "write", "out")) / 1e6
        run_cost[(r, arm, t)] += dollars
        sizes[arm].append(d["out"])
        for lang in (t[0], "all"):
            c = use[(arm, lang)]
            c["requests"] += 1
            for k, v in d.items():
                c[k] += v

langs = sorted({k[2][0] for k in res}) + ["all"]
n = len(rounds)
dollars = lambda c, keys: sum(c[k] * P[k] for k in keys) / 1e6
print(f"{n} rounds: {', '.join(rounds)}. Per round unless marked; costs in dollars at the off-peak list price.\n")
print(f"{'language':12}{'arm':15}{'tasks':>6}{'pass %':>8}  {'passes per round':20}{'cost':>7}{'input':>7}{'output':>8}{'requests':>9}{'reasoning k':>12}{'visible k':>10}{'median s':>9}")
for lang in langs:
    for a in arms:
        recs = {k: v for k, v in res.items() if k[1] == a and (lang == "all" or k[2][0] == lang)}
        if not recs:
            continue
        per = [sum(v["pass"] for k, v in recs.items() if k[0] == r) for r in rounds]
        c = use[(a, lang)]
        secs = [(v.get("agentMs") or 0) / 1000 for v in recs.values()]
        print(f"{lang:12}{a:15}{len({k[2] for k in recs}):>6}{100 * sum(per) / len(recs):>8.1f}  {', '.join(map(str, per)):20}"
              f"{dollars(c, ('miss', 'hit', 'write', 'out')) / n:>7.3f}{dollars(c, ('miss', 'hit', 'write')) / n:>7.3f}{dollars(c, ('out',)) / n:>8.3f}"
              f"{c['requests'] / n:>9.0f}{c['reasoning'] / 1e3 / n:>12.0f}{(c['out'] - c['reasoning']) / 1e3 / n:>10.0f}{statistics.median(secs):>9.0f}")
    print()

if len(arms) >= 2:
    a, b = arms[0], arms[1]
    print(f"paired comparison by language, per-task means over rounds ({b} minus {a})")
    for lang in langs:
        d = []
        for t in sorted({k[2] for k in res if lang == "all" or k[2][0] == lang}):
            m = {x: [res[(r, x, t)]["pass"] for r in rounds if (r, x, t) in res] for x in (a, b)}
            if m[a] and m[b]:
                d.append(sum(m[b]) / len(m[b]) - sum(m[a]) / len(m[a]))
        pos, neg = sum(v > 0 for v in d), sum(v < 0 for v in d)
        k, nn = max(pos, neg), pos + neg
        p = min(1.0, 2 * sum(math.comb(nn, i) for i in range(k, nn + 1)) / 2**nn) if nn else 1.0
        print(f"  {lang:12} tasks {len(d):>4}   difference {100 * sum(d) / len(d):+5.1f} points   better on {pos}, worse on {neg}   sign test p = {p:.3f}")
    print()

if len(arms) >= 2:
    # How sure is the cost comparison? Resample tasks (each with all its rounds) and recompute the ratio of total costs.
    a, b = arms[0], arms[1]
    tasks = sorted({k[2] for k in res if (k[0], a, k[2]) in res and (k[0], b, k[2]) in res})
    per_task = {x: [sum(run_cost[(r, x, t)] for r in rounds) for t in tasks] for x in (a, b)}
    ratio = sum(per_task[b]) / sum(per_task[a])
    rnd = random.Random(1)
    boots = []
    for _ in range(20000):
        idx = [rnd.randrange(len(tasks)) for _ in tasks]
        boots.append(sum(per_task[b][i] for i in idx) / sum(per_task[a][i] for i in idx))
    boots.sort()
    print(f"cost of {b} relative to {a}, all rounds: {100 * (ratio - 1):+.1f}%   95% interval {100 * (boots[500] - 1):+.1f}% to {100 * (boots[19500] - 1):+.1f}% (bootstrap over tasks)")
    print("  per round: " + ", ".join(f"{r} {100 * (sum(run_cost[(r, b, t)] for t in tasks) / sum(run_cost[(r, a, t)] for t in tasks) - 1):+.0f}%" for r in rounds))
    solved = {x: sum(res[(r, x, t)]["pass"] for r in rounds for t in tasks if (r, x, t) in res) for x in (a, b)}
    print(f"  cost per solved task: {a} ${sum(per_task[a]) / max(1, solved[a]):.4f}, {b} ${sum(per_task[b]) / max(1, solved[b]):.4f}\n")

print("how the cost is spread over task-runs, and the size of single model responses")
for a in arms:
    costs = sorted((v for k, v in run_cost.items() if k[1] == a), reverse=True)
    xs = sorted(sizes[a])
    if not costs or not xs:
        continue
    big = [x for x in xs if x > 8000]
    typical = costs[len(costs) // 20:]          # without the arm's dearest 5% of task-runs
    print(f"  {a:15} task-runs {len(costs)}: median ${costs[len(costs) // 2]:.4f}, mean ${sum(costs) / len(costs):.4f}, dearest ${costs[0]:.4f}; "
          f"dearest 10% of task-runs hold {100 * sum(costs[:len(costs) // 10]) / sum(costs):.0f}% of the cost; "
          f"typical cost (mean without the dearest 5%) ${sum(typical) / len(typical):.5f}")
    print(f"  {'':15} responses {len(xs)}: median {xs[len(xs) // 2]} output tokens, 99th percentile {xs[int(len(xs) * .99)]}, largest {xs[-1]}; "
          f"{len(big)} over 8,000 tokens hold {100 * sum(big) / sum(xs):.0f}% of all output")
print()

print("other counts over all rounds")
tasks = {k[2] for k in res}
for a in arms:
    recs = [v for k, v in res.items() if k[1] == a]
    if not recs:
        continue
    solved = lambda t: [res[(r, a, t)]["pass"] for r in rounds if (r, a, t) in res]
    print(f"  {a:15} task-runs {len(recs)}; stopped at the time limit {sum(bool(v.get('agentTimedOut')) for v in recs)}; hit the memory cap {sum((v.get('memoryKills') or 0) > 0 for v in recs)}; "
          f"gradings that ran out of time {sum(v.get('gradeExit') is None for v in recs)}; tasks solved in every round {sum(1 for t in tasks if solved(t) and all(solved(t)))}, in no round {sum(1 for t in tasks if solved(t) and not any(solved(t)))}")
