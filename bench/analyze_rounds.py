#!/usr/bin/env python3
"""Compare agents (or variants of one agent) over one or more rounds. Written for the campaign of 12 November
2026, before any of its results were seen.
usage: analyze_rounds.py <prices: deepseek|sonnet> <rounds-dir> <round>[,<round>...] <armA> <armB> [<armC>...]
  e.g. python3 -I bench/analyze_rounds.py deepseek bench/data/clean-2026-11-12 ds-1,ds-2,ds-3 opencode galley galley-sr
Each round is a folder with results.jsonl and the proxy's log (proxy.jsonl, or proxy-usage.jsonl as stored in data/).
An arm may be a group, written name=armA+armB: its runs are pooled (the main effect of a setting several arms share).
Costs are at the list price outside peak hours, so arms and rounds compare like for like. DeepSeek bills double on
weekdays 01:00-04:00 and 06:00-10:00 UTC; the "billed" column applies that to each request's start time.
Prints per-round pass counts and costs per arm, then every pairwise pooled comparison (per-task means over the
rounds each arm ran, difference, bootstrap 95% interval over tasks, two-sided sign test over tasks)."""
import json, sys, math, random, collections, os, datetime
# Tasks left out of scoring. BENCH_EXCLUDE="lang/name,lang/name" replaces the default list.
EXCL = {tuple(x.split("/")) for x in os.environ.get("BENCH_EXCLUDE", "rust/macros,go/octal").split(",") if x}
PRICES = {"deepseek": dict(miss=0.15, hit=0.003, write=0.15, out=0.60), "sonnet": dict(miss=2.0, hit=0.10, write=2.5, out=10.0)}
price_name, base, rounds, arms = sys.argv[1], sys.argv[2], sys.argv[3].split(","), sys.argv[4:]
P = PRICES[price_name]
GROUPS = {a.split("=")[0]: a.split("=")[1].split("+") for a in arms if "=" in a}   # group name -> member arms
arms = [a.split("=")[0] for a in arms]
members = lambda a: GROUPS.get(a, [a])
def peak_factor(t_ms):
    if price_name != "deepseek" or not t_ms: return 1
    d = datetime.datetime.fromtimestamp(t_ms / 1000, datetime.timezone.utc)
    return 2 if d.weekday() < 5 and (1 <= d.hour < 4 or 6 <= d.hour < 10) else 1
res = {}      # (round, arm) -> {task: record}
for r in rounds:
    p = f"{base}/{r}/results.jsonl"
    if not os.path.exists(p): continue
    for line in open(p):
        try: o = json.loads(line)
        except Exception: continue
        t = (o["lang"], o["name"])
        if t in EXCL: continue
        res.setdefault((r, o["agent"]), {})[t] = o
use = collections.defaultdict(lambda: collections.Counter())   # (round, arm) -> counters
for r in rounds:
    p = next((q for q in (f"{base}/{r}/proxy.jsonl", f"{base}/{r}/proxy-usage.jsonl") if os.path.exists(q)), None)
    if p is None: continue
    for line in open(p):
        try: o = json.loads(line)
        except Exception: continue
        parts = o.get("tag", "").split("__")
        if len(parts) != 3 or (parts[1], parts[2]) in EXCL: continue
        arm, t = parts[0], (parts[1], parts[2])
        rec = res.get((r, arm), {}).get(t)
        if rec is None: continue                                  # no recorded result: not part of the run
        if o.get("t") is not None and o["t"] < rec.get("startedAt", 0) - 2000: continue   # an interrupted earlier attempt
        c = use[(r, arm)]; c["requests"] += 1; c["errors"] += o.get("status") != 200
        u = o.get("usage") or {}; before = (c["miss"], c["hit"], c["write"], c["out"])
        if "prompt_tokens" in u:
            hit = u.get("prompt_cache_hit_tokens", (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)) or 0
            c["hit"] += hit; c["miss"] += u["prompt_tokens"] - hit; c["out"] += u.get("completion_tokens", 0)
            c["reasoning"] += (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0) or 0
        elif "input_tokens" in u:
            c["hit"] += u.get("cache_read_input_tokens", 0); c["write"] += u.get("cache_creation_input_tokens", 0); c["miss"] += u.get("input_tokens", 0); c["out"] += u.get("output_tokens", 0)
        d = [c[k] - b for k, b in zip(("miss", "hit", "write", "out"), before)]
        c["billed_micro"] += (d[0] * P["miss"] + d[1] * P["hit"] + d[2] * P["write"] + d[3] * P["out"]) * peak_factor(o.get("t"))
cost = lambda c: (c["miss"] * P["miss"] + c["hit"] * P["hit"] + c["write"] * P["write"] + c["out"] * P["out"]) / 1e6
print(f"{'round':17}{'arm':15}{'tasks':>6}{'pass':>6}{'rate':>8}{'timeouts':>9}{'median s':>9}{'requests':>9}{'out tok':>9}{'reasoning':>10}{'cost':>8}{'$/task':>9}{'billed':>8}")
tot = collections.defaultdict(lambda: collections.Counter())
real = list(dict.fromkeys(m for g in arms for m in members(g)))
for r in rounds:
    for a in real:
        d = res.get((r, a))
        if not d: continue
        n = len(d); p = sum(x["pass"] for x in d.values()); to = sum(bool(x.get("agentTimedOut")) for x in d.values())
        ms = sorted(x["agentMs"] for x in d.values()); c = use[(r, a)]
        print(f"{r:17}{a:15}{n:>6}{p:>6}{p/n:>8.1%}{to:>9}{ms[len(ms)//2]/1000:>9.0f}{c['requests']:>9}{c['out']/1e3:>8.0f}k{c['reasoning']/1e3:>9.0f}k{cost(c):>8.2f}{cost(c)/n:>9.4f}{c['billed_micro']/1e6:>8.2f}")
        for g in [x for x in arms if a in members(x)]:
            T = tot[g]; T["n"] += n; T["pass"] += p; T["runs"] += 1; T["timeouts"] += to
            for k, v in c.items(): T[k] += v
print()
for a in arms:
    T = tot[a]
    if not T["n"]: continue
    print(f"{'pooled':17}{a:15}{T['n']:>6}{T['pass']:>6}{T['pass']/T['n']:>8.1%}{T['timeouts']:>9}{'':>9}{T['requests']:>9}{T['out']/1e3:>8.0f}k{T['reasoning']/1e3:>9.0f}k{cost(T):>8.2f}{cost(T)/T['n']:>9.4f}   ({T['runs']} runs; ${cost(T)/T['runs']:.2f} per run; ${cost(T)/max(1,T['pass']):.4f} per solved task)")
def taskmeans(a):
    m = collections.defaultdict(list)
    for r in rounds:
        for member in members(a):
            for t, x in (res.get((r, member)) or {}).items(): m[t].append(1.0 if x["pass"] else 0.0)
    return {t: sum(v) / len(v) for t, v in m.items()}
print("\npairwise, pooled over rounds (per-task means; positive = first arm better):")
for i in range(len(arms)):
    for j in range(i + 1, len(arms)):
        if set(members(arms[i])) & set(members(arms[j])): continue   # overlapping groups are not a comparison
        A, B = taskmeans(arms[i]), taskmeans(arms[j])
        ci, cj = cost(tot[arms[i]]) / max(1, tot[arms[i]]["n"]), cost(tot[arms[j]]) / max(1, tot[arms[j]]["n"])
        ts = sorted(set(A) & set(B))
        if not ts: continue
        d = [A[t] - B[t] for t in ts]
        rnd = random.Random(1); boots = sorted(sum(rnd.choice(d) for _ in d) / len(d) for _ in range(20000))
        pos, neg = sum(v > 0 for v in d), sum(v < 0 for v in d); n, k = pos + neg, max(pos, neg)
        p = min(1.0, 2 * sum(math.comb(n, x) for x in range(k, n + 1)) / 2 ** n) if n else 1.0
        print(f"  {arms[i]:14} vs {arms[j]:14} cost/task {100*(ci/cj-1):+5.1f}%  tasks={len(ts)}  {100*sum(A[t] for t in ts)/len(ts):5.1f}% vs {100*sum(B[t] for t in ts)/len(ts):5.1f}%  diff {100*sum(d)/len(d):+5.1f} pts  95% CI [{100*boots[500]:+.1f}, {100*boots[19500]:+.1f}]  sign test {pos} vs {neg} tasks, p = {p:.3f}")
