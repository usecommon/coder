#!/usr/bin/env python3
"""Pool several campaigns that compared the same two arms on different task sets: one difference per task (its mean
pass rate over that campaign's rounds, arm B minus arm A), then the mean over all tasks, a bootstrap 95% interval over
tasks, and a two-sided sign test. A summary of what the campaigns show together; it is not any campaign's verdict.
usage: pool_sets.py <armA> <armB> <dir>:<round>[,<round>...][:<excluded lang/name>,...] [more sets ...]
  e.g. python3 -I bench/pool_sets.py opencode galley \\
         bench/data/fresh-2026-11-12:fresh-1,fresh-2,fresh-3,fresh-4:javascript/parallel-letter-frequency \\
         bench/data/tracks2-2026-11-13:t2-1,t2-2,t2-3,t2-4:typescript/crypto-square,typescript/pythagorean-triplet"""
import collections, json, math, random, sys

a, b = sys.argv[1], sys.argv[2]
diffs, rows = [], []
for spec in sys.argv[3:]:
    parts = spec.split(":")
    base, rounds = parts[0], parts[1].split(",")
    excl = {tuple(x.split("/")) for x in (parts[2].split(",") if len(parts) > 2 and parts[2] else [])}
    res = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in rounds:
        for line in open(f"{base}/{r}/results.jsonl"):
            try:
                o = json.loads(line)
            except Exception:
                continue
            t = (o["lang"], o["name"])
            if t not in excl and o["agent"] in (a, b):
                res[t][o["agent"]].append(bool(o["pass"]))
    d = [sum(v[b]) / len(v[b]) - sum(v[a]) / len(v[a]) for v in res.values() if v[a] and v[b]]
    rate = lambda x: 100 * sum(sum(v[x]) / len(v[x]) for v in res.values() if v[a] and v[b]) / len(d)
    rows.append((base.rstrip("/").split("/")[-1], len(rounds), len(d), rate(a), rate(b), 100 * sum(d) / len(d), sum(x > 0 for x in d), sum(x < 0 for x in d)))
    diffs += d


def sign_p(pos, neg):
    n, k = pos + neg, max(pos, neg)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k, n + 1)) / 2**n) if n else 1.0


print(f"{'set':28}{'rounds':>7}{'tasks':>7}{a:>10}{b:>10}{'difference':>12}{'better':>8}{'worse':>7}{'sign p':>8}")
for name, n, tasks, ra, rb, diff, pos, neg in rows:
    print(f"{name:28}{n:>7}{tasks:>7}{ra:>9.1f}%{rb:>9.1f}%{diff:>+11.1f} {pos:>7}{neg:>7}{sign_p(pos, neg):>8.3f}")
rnd = random.Random(1)
boots = sorted(100 * sum(diffs[rnd.randrange(len(diffs))] for _ in diffs) / len(diffs) for _ in range(20000))
pos, neg = sum(x > 0 for x in diffs), sum(x < 0 for x in diffs)
print(f"{'pooled over tasks':28}{'':>7}{len(diffs):>7}{'':>10}{'':>10}{100 * sum(diffs) / len(diffs):>+11.1f} {pos:>7}{neg:>7}{sign_p(pos, neg):>8.3f}")
print(f"bootstrap 95% interval for the pooled difference: {boots[500]:+.1f} to {boots[19500]:+.1f} points")
