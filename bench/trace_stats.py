#!/usr/bin/env python3
"""How the agents spent their output tokens: what each step of each task-run did and what it cost.

  extract  reads a round's saved transcripts and writes one compact line per task-run (steps.jsonl)
  report   prints the tables from those lines; it needs no transcripts, so it runs on the data kept in the repo

usage:
  python3 -I bench/trace_stats.py extract <round-dir> <polyglot-dir> <out.jsonl>
  python3 -I bench/trace_stats.py report <rounds-dir> <round>[,<round>...] <armA> <armB>
    e.g. python3 -I bench/trace_stats.py report bench/data/fresh-2026-11-12 fresh-1,fresh-2,fresh-3,fresh-4 opencode galley

A step is one model response. Its tokens are the output tokens billed for it: reasoning plus visible text and tool
calls. "Solution file" means a file the exercise lists as the one to implement. A "check" is a shell command that
runs code (the language's compiler, test runner or interpreter); it "fails" when its output reports a failure.
The classification is by pattern and is approximate."""
import collections, glob, json, os, re, sys

EXCL = {tuple(x.split("/")) for x in os.environ.get("BENCH_EXCLUDE", "javascript/parallel-letter-frequency").split(",") if x}
RUNS_CODE = re.compile(r"(?<![\w/.-])(node|jest|npm|npx|gradle|\./gradlew|java|javac|jshell|g\+\+|gcc|c\+\+|clang\+\+|cmake|make|python3?|pytest|go|cargo|ruby|rake|php|phpunit|tsc|tsx|yarn|bun|\./[\w.-]+)\b")
INLINE = re.compile(r"<<|(node|python3?|ruby) -e\b|php -r\b|jshell")
FAILED = re.compile(r"\[exit code (?!0\])|FAIL|Error:|error:|Exception|AssertionError|not ok|mismatch|differs", re.I)
WRITERS = {"write", "edit", "multiedit", "patch", "apply_patch"}


def solution_files(poly, lang, task):
    try:
        return {os.path.basename(f) for f in json.load(open(f"{poly}/{lang}/exercises/practice/{task}/.meta/config.json"))["files"]["solution"]}
    except Exception:
        return set()


def classify(name, inp, sol):
    """Kind of a tool call, and whether it changes a solution file."""
    path = str(inp.get("path") or inp.get("filePath") or "")
    if name == "bash":
        cmd = str(inp.get("command") or "")
        writes_sol = any(re.search(r">\s*(\./)?" + re.escape(f) + r"\b", cmd) for f in sol)
        kind = "bash: code written inline" if INLINE.search(cmd) else "bash: runs code" if RUNS_CODE.search(cmd) else "bash: other"
        return kind, writes_sol, bool(RUNS_CODE.search(cmd))
    if name in WRITERS:
        verb = "write" if name == "write" else "edit"
        if os.path.basename(path) in sol:
            return f"{verb}: solution file", True, False
        return f"{verb}: scratch file under /tmp" if path.startswith("/tmp/") and "/ws/" not in path else f"{verb}: other file", False, False
    return name, False, False


def step_record(tok, calls, results, sol):
    """calls: [(name, input dict)], results: [(name, text)] of this step."""
    kinds, sol_change, check = [], False, False
    for name, inp in calls:
        k, s, c = classify(name, inp, sol)
        kinds.append([k, len(json.dumps(inp))])
        sol_change |= s
        check |= c
    texts = [t for n, t in results]
    return {"tok": tok, "calls": kinds, "sol": sol_change, "check": check,
            "failed": check and any(n == "bash" and FAILED.search(t) for n, t in results),
            "refused": sum("outside the workspace" in t for t in texts)}


def galley_run(run, sol):
    steps, subs = [], []
    for p in sorted(glob.glob(f"{run}/galley-data/projects/*/sessions/*.jsonl")):
        recs = []
        for line in open(p, errors="replace"):
            try:
                recs.append(json.loads(line))
            except Exception:
                pass
        is_sub = any(o.get("type") == "meta" and o.get("parentId") for o in recs)
        cur, mine = None, []
        for o in recs:
            if o.get("type") == "message":
                m = o["message"]
                if m.get("role") == "assistant":
                    cur = m
                elif m.get("role") == "tool" and mine:
                    mine[-1][2].extend((x.get("name"), str(x.get("content"))) for x in m.get("results") or [])
            elif o.get("type") == "usage" and cur is not None:   # a usage line with no message before it is a sub-agent's total
                mine.append([o["usage"]["outputTokens"], [(c["name"], c.get("input") or {}) for c in cur.get("toolCalls") or []], []])
                cur = None
        if is_sub:
            subs.append({"tok": sum(s[0] for s in mine), "steps": len(mine)})
        else:
            steps = [step_record(t, c, r, sol) for t, c, r in mine]
    return steps, subs


def opencode_run(run, sol):
    steps, calls, results = [], [], []
    f = f"{run}/agent.log"
    if not os.path.exists(f):
        return steps, []
    for line in open(f, errors="replace"):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            p = json.loads(line).get("part") or {}
        except Exception:
            continue
        if p.get("type") == "tool":
            st = p.get("state") or {}
            calls.append((p.get("tool"), st.get("input") or {}))
            results.append((p.get("tool"), str(st.get("output"))))
        elif p.get("type") == "step-finish":
            t = p.get("tokens") or {}
            steps.append(step_record(t.get("output", 0) + t.get("reasoning", 0), calls, results, sol))
            calls, results = [], []
    return steps, []


def extract(round_dir, poly, out):
    passed = {}
    for line in open(f"{round_dir}/results.jsonl"):
        try:
            o = json.loads(line)
        except Exception:
            continue
        passed[(o["agent"], o["lang"], o["name"])] = bool(o["pass"])
    n = 0
    with open(out, "w") as fh:
        for (agent, lang, task), ok in sorted(passed.items()):
            run = f"{round_dir}/runs/{agent}/{lang}/{task}"
            sol = solution_files(poly, lang, task)
            steps, subs = (galley_run if agent.split("-")[0] == "galley" else opencode_run)(run, sol)
            fh.write(json.dumps({"agent": agent, "lang": lang, "task": task, "pass": ok, "steps": steps, "subagents": subs}, separators=(",", ":")) + "\n")
            n += 1
    print(f"{os.path.basename(round_dir.rstrip('/'))}: {n} task-runs -> {out}")


def report(base, rounds, arms):
    runs = collections.defaultdict(list)
    for r in rounds:
        for line in open(f"{base}/{r}/steps.jsonl"):
            o = json.loads(line)
            if (o["lang"], o["task"]) not in EXCL and o["agent"] in arms:
                runs[o["agent"]].append(o)
    per = lambda total, arm: total / max(1, len(runs[arm]))
    head = "".join(f"{a:>22}" for a in arms)
    print(f"{len(rounds)} rounds: {', '.join(rounds)}; task-runs: " + ", ".join(f"{a} {len(runs[a])}" for a in arms) + "\n")

    print("1. Tool calls per task-run: number of calls, and characters of input the model wrote for them")
    calls, chars = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
    for a in arms:
        for o in runs[a]:
            for s in o["steps"]:
                for k, n in s["calls"]:
                    calls[a][k] += 1
                    chars[a][k] += n
    kinds = sorted({k for a in arms for k in calls[a]}, key=lambda k: -sum(chars[a][k] for a in arms))
    print(f"   {'':34}{head}")
    for k in kinds:
        if sum(calls[a][k] for a in arms) < 0.03 * sum(len(runs[a]) for a in arms):
            continue
        print(f"   {k:34}" + "".join(f"{per(calls[a][k], a):>10.1f}{per(chars[a][k], a):>12.0f}" for a in arms))
    print(f"   {'all calls':34}" + "".join(f"{per(sum(calls[a].values()), a):>10.1f}{per(sum(chars[a].values()), a):>12.0f}" for a in arms))
    print(f"   {'steps (model responses)':34}" + "".join(f"{per(sum(len(o['steps']) for o in runs[a]), a):>10.1f}{'':>12}" for a in arms))
    print(f"   {'output tokens':34}" + "".join(f"{per(sum(s['tok'] for o in runs[a] for s in o['steps']), a):>10.0f}{'':>12}" for a in arms) + "\n")

    print("2. Output tokens per task-run by phase (runs that changed a solution file)")
    rows = collections.defaultdict(collections.Counter)
    for a in arms:
        for o in runs[a]:
            st = o["steps"]
            mods = [i for i, s in enumerate(st) if s["sol"]]
            c = rows[a]
            if not mods:
                c["no solution change"] += 1
                continue
            first, last = mods[0], mods[-1]
            c["n"] += 1
            c["steps: up to the first version"] += first + 1
            c["tokens: up to the first version"] += sum(s["tok"] for s in st[:first + 1])
            c["steps: first version to last change"] += last - first
            c["tokens: first version to last change"] += sum(s["tok"] for s in st[first + 1:last + 1])
            c["steps: after the last change"] += len(st) - last - 1
            c["tokens: after the last change"] += sum(s["tok"] for s in st[last + 1:])
            c["changed again after the first version"] += len(mods) > 1
    print(f"   {'':46}" + "".join(f"{a:>12}" for a in arms))
    for k in ("steps: up to the first version", "tokens: up to the first version", "steps: first version to last change", "tokens: first version to last change",
              "steps: after the last change", "tokens: after the last change"):
        print(f"   {k:46}" + "".join(f"{rows[a][k] / max(1, rows[a]['n']):>12.1f}" for a in arms))
    print(f"   {'share of runs that changed it again':46}" + "".join(f"{100 * rows[a]['changed again after the first version'] / max(1, rows[a]['n']):>11.0f}%" for a in arms))
    print(f"   {'runs with no recognised solution change':46}" + "".join(f"{rows[a]['no solution change']:>12}" for a in arms) + "\n")

    print("3. After the first clean check of a written solution: what the rest of the run did and cost")
    cats = ("never had a clean check", "no further change", "changed again after a failing check", "changed again with no failing check")
    for a in arms:
        c, total = collections.Counter(), sum(s["tok"] for o in runs[a] for s in o["steps"])
        for o in runs[a]:
            st = o["steps"]
            first = next((i for i, s in enumerate(st) if s["sol"]), None)
            if first is None:
                continue
            green = next((i for i in range(first + 1, len(st)) if st[i]["check"] and not st[i]["failed"]), None)
            if green is None:
                cat = cats[0]
                later = []
            else:
                later = st[green + 1:]
                change = next((j for j, s in enumerate(later) if s["sol"]), None)
                cat = cats[1] if change is None else cats[2] if any(s["failed"] for s in later[:change]) else cats[3]
            c[f"runs {cat}"] += 1
            c[f"pass {cat}"] += o["pass"]
            c[f"tok {cat}"] += sum(s["tok"] for s in later)
            c[f"steps {cat}"] += len(later)
        print(f"   {a}")
        for cat in cats:
            n = c[f"runs {cat}"]
            print(f"     {cat:38} {n:>4} runs, pass rate {100 * c[f'pass {cat}'] / max(1, n):>3.0f}%;  afterwards {c[f'steps {cat}'] / max(1, n):>5.1f} steps, {c[f'tok {cat}'] / max(1, n):>6.0f} tokens per run = {100 * c[f'tok {cat}'] / max(1, total):>3.0f}% of the arm's output")
    print()

    print("4. Waste: writes refused for being outside the workspace, and sub-agents")
    for a in arms:
        refused = [o for o in runs[a] if any(s["refused"] for s in o["steps"])]
        wasted = sum(n for o in runs[a] for s in o["steps"] if s["refused"] for k, n in s["calls"] if k.startswith(("write", "edit")))
        subs = [x for o in runs[a] for x in o["subagents"]]
        total = sum(s["tok"] for o in runs[a] for s in o["steps"]) + sum(x["tok"] for x in subs)
        most = max((sum(x["tok"] for x in o["subagents"]) for o in runs[a]), default=0)
        print(f"   {a:12} refused in {len(refused)} task-runs ({100 * len(refused) / max(1, len(runs[a])):.1f}%), about {wasted} characters written for nothing; "
              f"{len(subs)} sub-agents in {sum(1 for o in runs[a] if o['subagents'])} task-runs used {sum(x['tok'] for x in subs)} output tokens ({100 * sum(x['tok'] for x in subs) / max(1, total):.1f}% of the arm's output), at most {most} in one task-run")


if __name__ == "__main__":
    if len(sys.argv) >= 5 and sys.argv[1] == "extract":
        extract(sys.argv[2].rstrip("/"), sys.argv[3].rstrip("/"), sys.argv[4])
    elif len(sys.argv) >= 5 and sys.argv[1] == "report":
        report(sys.argv[2].rstrip("/"), sys.argv[3].split(","), sys.argv[4:])
    else:
        sys.exit(__doc__)
