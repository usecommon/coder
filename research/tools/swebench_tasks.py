#!/usr/bin/env python3
"""What the per-task results on https://www.swebench.com/ say about using more than one model.

    curl -sS -o swebench.html https://www.swebench.com/
    python3 -I swebench_tasks.py swebench.html models   Verified 2.0.0     # each model: solved, cost per task
    python3 -I swebench_tasks.py swebench.html pairs    Verified 2.0.0     # two models together against the better one
    python3 -I swebench_tasks.py swebench.html reruns   Verified           # the same model run twice
    python3 -I swebench_tasks.py swebench.html cascade  Verified 2.0.0 "MiniMax M2.5" "Claude 4.5 Opus"
    python3 -I swebench_tasks.py swebench.html groups   Multilingual 2.0.0 languages.json

Only runs of the site's own bash-only agent carry per-task results, so every comparison is between models inside one
agent. The third argument keeps the runs whose agent version starts with it. `languages.json` maps a repository
("preactjs__preact") to a group name; without it the groups are the repositories. Used for sections 2 and 3 of
../model-switching.md."""
import collections, itertools, json, re, sys

page = open(sys.argv[1], encoding="utf-8", errors="replace").read()
boards = json.loads(re.search(r'<script type="application/json" id="leaderboard-data">(.*?)</script>', page, flags=re.S).group(1))
mode, board = sys.argv[2], sys.argv[3]
name = lambda r: r.get("model_display") or r.get("name")
runs = [r for r in next(b for b in boards if b["name"] == board)["results"] if r.get("per_instance_details")]
solved_in = lambda r, tasks: {t for t in tasks if r["per_instance_details"][t].get("resolved")}

if mode == "reruns":
    by = collections.defaultdict(list)
    for r in runs:
        by[name(r)].append(r)
    print("the same model, two runs (often with different versions of the agent): what the second run adds")
    for model, rs in by.items():
        for a, b in itertools.combinations(rs, 2):
            tasks = set(a["per_instance_details"]) & set(b["per_instance_details"])
            sa, sb = solved_in(a, tasks), solved_in(b, tasks)
            fixes = lambda first, second: f"{len(second - first)} of {len(tasks) - len(first)} ({100 * len(second - first) / max(1, len(tasks) - len(first)):.0f}%)"
            print(f"  {model[:20]:20} {len(sa):>4} and {len(sb):>4} of {len(tasks)}; together {len(sa | sb)} (+{len(sa | sb) - max(len(sa), len(sb))}); failures of one run that the other fixes: {fixes(sa, sb)} and {fixes(sb, sa)}")
    sys.exit()

version = sys.argv[4] if len(sys.argv) > 4 else ""
runs = [r for r in runs if str(r.get("mini-swe-agent_version", "")).startswith(version)]
tasks = set.intersection(*[set(r["per_instance_details"]) for r in runs])
n = len(tasks)
solved = {name(r): solved_in(r, tasks) for r in runs}
cost = {name(r): sum(float(r["per_instance_details"][t].get("cost") or 0) for t in tasks) for r in runs}
order = [m for m in sorted(solved, key=lambda m: -len(solved[m])) if solved[m]]
print(f"{board}: {len(order)} models, {n} tasks in common")

if mode == "models":
    for m in order:
        print(f"  {m[:28]:28} {len(solved[m]):>4} solved ({100 * len(solved[m]) / n:.1f}%)  ${cost[m] / n:.3f} a task")
    print(f"  solved by at least one: {len(set.union(*[solved[m] for m in order]))} ({100 * len(set.union(*[solved[m] for m in order])) / n:.1f}%)")

if mode == "pairs":
    out = []
    for a, b in itertools.combinations(order, 2):
        both = solved[a] | solved[b]
        out.append((len(both) - max(len(solved[a]), len(solved[b])), a, b, len(both)))
    for gain, a, b, both in sorted(out, reverse=True):
        print(f"  {a[:24]:24} {len(solved[a]):>4}  {b[:24]:24} {len(solved[b]):>4}  together {both:>4} (+{gain}); only the first {len(solved[a] - solved[b])}, only the second {len(solved[b] - solved[a])}")

if mode == "cascade":
    cheap, strong = sys.argv[5], sys.argv[6]
    failures = tasks - solved[cheap]
    run_cost = lambda m, ts: sum(float(next(r for r in runs if name(r) == m)["per_instance_details"][t].get("cost") or 0) for t in ts)
    both = solved[cheap] | solved[strong]
    total = cost[cheap] + run_cost(strong, failures)
    for label, s, c in ((cheap, solved[cheap], cost[cheap]), (strong, solved[strong], cost[strong]), ("the first, then the second on its failures", both, total)):
        print(f"  {label[:44]:44} {len(s):>4} solved ({100 * len(s) / n:.1f}%)  ${c / n:.3f} a task  ${c / len(s):.3f} a solved task")
    print(f"  assumes a perfect signal that the first run failed. The second model fixes {len(solved[strong] - solved[cheap])} of {len(failures)} failures ({100 * len(solved[strong] - solved[cheap]) / len(failures):.0f}%).")

if mode == "groups":
    groups_of = json.load(open(sys.argv[5])) if len(sys.argv) > 5 else {}
    groups = collections.defaultdict(set)
    for t in tasks:
        repo = re.sub(r"-\d+$", "", t)
        groups[groups_of.get(repo, repo)].add(t)
    top = order[:10]
    print(f"  {'group':24} {'tasks':>5}  " + " ".join(f"{m[:12]:>12}" for m in top))
    for g in sorted(groups, key=lambda g: -len(groups[g])):
        if len(groups[g]) >= 8:
            print(f"  {g[:24]:24} {len(groups[g]):>5}  " + " ".join(f"{100 * len(solved[m] & groups[g]) / len(groups[g]):>11.0f}%" for m in top))
