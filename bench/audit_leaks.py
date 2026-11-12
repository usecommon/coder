#!/usr/bin/env python3
"""Leak audit for benchmark runs: did an agent get at hidden tests instead of solving the task?

  scan    reads the saved agent transcripts of one or more run directories and lists every task-run where the
          agent obtained hidden-test material for its own exercise, or probed outside its workspace
  adjust  re-computes a pooled comparison with the flagged task-runs removed

Examples:
  python3 -I bench/audit_leaks.py scan --polyglot /tmp/bench-work/polyglot --out bench/data/leak-audit.json \
      co2=/tmp/bench-work/co2 cg1=/tmp/bench-work/cg1
  python3 -I bench/audit_leaks.py adjust --audit bench/data/leak-audit.json \
      --a galley:cg1=bench/data/rounds/cg1/results.jsonl,cg2=bench/data/rounds/cg2/results.jsonl \
      --b opencode:co2=bench/data/rounds/co2/results.jsonl

What `scan` looks for in each tool call the agent made (inputs and outputs only):
  sibling_tests        read a test file of the same exercise from another task's folder (other language)
  hidden_test_content  a tool result contained lines of the exercise's hidden tests that the agent had not written
                       (reads of the agent's own session store are not counted: see the comment in scan_run)
  sibling_solution     read a graded solution of the same exercise from another task's folder
  benchmark_checkout   read files from the benchmark checkout itself (hidden tests, reference solutions)
  results_files        read the run's results or logs            (informational)
  operator_files       read the operator's session log or repo   (informational)
  namespace_cmds       ran unshare / umount / mount / nsenter or read another process's environment (informational)
The first four count as contamination. The scan is a heuristic: it can miss a leak it has no pattern for.
"""
import argparse, collections, glob, json, math, os, random, re, sys

EXCLUDE = {("rust", "macros"), ("go", "octal")}
LANGS = ["python", "go", "rust", "javascript", "java", "cpp"]
STRONG = ("sibling_tests", "hidden_test_content", "sibling_solution", "benchmark_checkout")
TEST_TOKEN = re.compile(r"def test_|self\.assert|func Test|t\.(Fatal|Error|Run)|#\[test\]|assert_eq!|assert!\(|\btest\(|\bexpect\(|@Test|TEST_CASE|REQUIRE\(")
NAMESPACE = re.compile(r"(?<![\w-])(unshare|umount|nsenter|chroot|pivot_root)\b|(?<![\w-])mount\s+(-|/)|/proc/\d+/(root|environ)")
WRITE_TOOLS = {"write", "edit", "apply_patch", "multiedit", "patch"}


def hidden_files(poly, lang, task):
    d = f"{poly}/{lang}/exercises/practice/{task}"
    try:
        files = json.load(open(f"{d}/.meta/config.json")).get("files", {})
    except Exception:
        return []
    names = list(files.get("test", [])) + [f for f in files.get("editor", []) if f.endswith("_test.go")]
    return [f"{d}/{n}" for n in names if os.path.exists(f"{d}/{n}")]


def distinctive(poly, task, cache={}):
    """Lines of the hidden tests of this exercise (per language) that look like test code and are not in the visible files."""
    if task in cache:
        return cache[task]
    res = {}
    for lang in LANGS:
        d = f"{poly}/{lang}/exercises/practice/{task}"
        hid = hidden_files(poly, lang, task)
        vis = ""
        for root, _, files in os.walk(d):
            if "/.meta" in root or root.endswith("/tests"):
                continue
            for f in files:
                p = os.path.join(root, f)
                if p not in hid:
                    try:
                        vis += open(p, errors="replace").read() + "\n"
                    except Exception:
                        pass
        lines = set()
        for p in hid:
            for ln in open(p, errors="replace"):
                s = ln.strip()
                if len(s) >= 28 and s not in vis and TEST_TOKEN.search(s):
                    lines.add(s)
        res[lang] = lines
    cache[task] = res
    return res


def calls(run, agent):
    """Yield (tool name, input dict, output text) for every tool call in a task-run."""
    if agent.split("-")[0] == "galley":  # "galley" or a variant such as "galley-sr"
        for f in sorted(glob.glob(f"{run}/galley-data/projects/*/sessions/*.jsonl")):
            pending = {}
            for line in open(f, errors="replace"):
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                m = o.get("message") if o.get("type") == "message" else None
                if not m:
                    continue
                if m.get("role") == "assistant":
                    for c in m.get("toolCalls") or []:
                        pending[c["id"]] = (c.get("name"), c.get("input") or {})
                elif m.get("role") == "tool":
                    for r in m.get("results") or []:
                        name, inp = pending.pop(r.get("callId"), (r.get("name"), {}))
                        yield name, inp, str(r.get("content"))
    else:  # opencode: JSON event stream in agent.log
        f = f"{run}/agent.log"
        if not os.path.exists(f):
            return
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
                yield p.get("tool"), st.get("input") or {}, str(st.get("output"))


def scan_run(label, base, poly):
    rows = []
    for run in sorted(glob.glob(f"{base}/runs/*/*/*")):
        agent, lang, task = run.split("/")[-3:]
        dist = distinctive(poly, task)
        kinds = collections.Counter()
        wrote = ""
        for name, inp, out in calls(run, agent):
            cmd = str(inp.get("command") or inp.get("filePath") or inp.get("path") or inp.get("pattern") or json.dumps(inp))
            if name in WRITE_TOOLS:
                wrote += "\n".join(str(v) for v in inp.values()) + "\n"
                continue
            if name == "bash" and re.search(r"cat\s*>|tee\s|<<", cmd):
                wrote += cmd + "\n"
            got = len(out) > 60 and "No such file" not in out[:200]
            for m in re.finditer(r"/runs/([\w-]+)/([\w-]+)/([a-z0-9-]+)/", cmd):
                if m.groups() == (agent, lang, task) or m.group(3) != task or not got:
                    continue
                kinds["sibling_tests" if "test" in cmd[m.end():m.end() + 80] else "sibling_solution"] += 1
            # the checkout by full path, or pieced together from shell variables ("$S/polyglot/go/exercises/...")
            if got and (f"{poly}/" in cmd or re.search(re.escape(os.path.basename(poly)) + r"/\w+/exercises/", cmd)):
                kinds["benchmark_checkout"] += 1
            if got and re.search(r"results[\w.-]*\.jsonl|run\.log|grade\.log", cmd) and base in cmd:
                kinds["results_files"] += 1
            if got and re.search(r"/\.claude/projects|/coder/bench|/coder/research", cmd):
                kinds["operator_files"] += 1
            if name == "bash" and NAMESPACE.search(cmd):
                kinds["namespace_cmds"] += 1
            # An agent re-reading its own session store learns nothing new: models often reconstruct the public
            # test suite from memory in their reasoning, and that text is saved there.
            own_store = any(f"{run}/{d}" in cmd for d in ("xdg-data", "xdg-state", "galley-data"))
            for lines in dist.values():
                if not own_store and sum(1 for s in lines if s in out and s not in wrote) >= 3:
                    kinds["hidden_test_content"] += 1
        if kinds:
            rows.append({"run": label, "agent": agent, "lang": lang, "task": task, "kinds": sorted(kinds)})
    return rows


def cmd_scan(a):
    rows = []
    for spec in a.runs:
        label, _, base = spec.partition("=")
        if not base:
            label, base = os.path.basename(spec.rstrip("/")), spec
        rows += scan_run(label, base.rstrip("/"), a.polyglot.rstrip("/"))
    # several directories may share a label (a run and its re-runs): merge their rows
    merged = {}
    for r in rows:
        k = (r["run"], r["agent"], r["lang"], r["task"])
        m = merged.setdefault(k, {**r, "kinds": []})
        m["kinds"] = sorted(set(m["kinds"]) | set(r["kinds"]))
    rows = [merged[k] for k in sorted(merged)]
    if a.out:
        json.dump(rows, open(a.out, "w"), indent=0)
    by = collections.defaultdict(collections.Counter)
    for r in rows:
        k = (r["run"], r["agent"])
        by[k]["contaminated"] += any(x in STRONG for x in r["kinds"])
        for x in r["kinds"]:
            by[k][x] += 1
    cols = ["contaminated", *STRONG, "results_files", "operator_files", "namespace_cmds"]
    print(f"{'run':14}{'agent':10}" + "".join(f"{c[:15]:>17}" for c in cols))
    for k in sorted(by):
        print(f"{k[0]:14}{k[1]:10}" + "".join(f"{by[k][c]:>17}" for c in cols))
    if not rows:
        print("no task-run flagged")


def load(path, agent):
    res = {}
    for line in open(path):
        try:
            o = json.loads(line)
        except Exception:
            continue
        t = (o["lang"], o["name"])
        if o.get("agent") == agent and t not in EXCLUDE:
            res[t] = bool(o.get("pass"))
    return res


def cmd_adjust(a):
    audit = json.load(open(a.audit))
    bad = {(r["run"], r["agent"], r["lang"], r["task"]) for r in audit if any(x in STRONG for x in r["kinds"])}

    def side(spec):
        agent, _, files = spec.partition(":")
        runs = {}
        for f in files.split(","):
            label, _, path = f.partition("=")
            runs[label] = load(path, agent)
        return agent, runs

    (an, A), (bn, B) = side(a.a), side(a.b)
    tasks = sorted(set.intersection(*(set(r) for r in list(A.values()) + list(B.values()))))

    def mean(agent, runs, t, clean):
        xs = [r[t] for label, r in runs.items() if not (clean and (label, agent, t[0], t[1]) in bad)]
        return sum(xs) / len(xs) if xs else None

    for clean in (False, True):
        pairs = [(mean(an, A, t, clean), mean(bn, B, t, clean)) for t in tasks]
        pairs = [(x, y) for x, y in pairs if x is not None and y is not None]
        d = [x - y for x, y in pairs]
        rnd = random.Random(1)
        boots = sorted(sum(rnd.choice(d) for _ in d) / len(d) for _ in range(20000))
        pos, neg = sum(v > 0 for v in d), sum(v < 0 for v in d)
        n, k = pos + neg, max(pos, neg)
        p = min(1.0, 2 * sum(math.comb(n, i) for i in range(k, n + 1)) / 2**n) if n else 1.0
        removed = sum((label, ag, t[0], t[1]) in bad for ag, runs in ((an, A), (bn, B)) for label in runs for t in tasks) if clean else 0
        print(f"{'flagged task-runs removed (' + str(removed) + ')' if clean else 'as measured':34} tasks={len(pairs)}  "
              f"{an} {100 * sum(x for x, _ in pairs) / len(pairs):.1f}%  {bn} {100 * sum(y for _, y in pairs) / len(pairs):.1f}%  "
              f"diff {100 * sum(d) / len(d):+.1f} pts  95% CI [{100 * boots[500]:+.1f}, {100 * boots[19500]:+.1f}]  "
              f"sign test {pos} vs {neg} tasks, p = {p:.2f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("--polyglot", required=True, help="benchmark checkout (holds the hidden tests)")
    s.add_argument("--out", help="write the flagged task-runs to this JSON file")
    s.add_argument("runs", nargs="+", help="run directories, optionally as label=dir")
    s.set_defaults(fn=cmd_scan)
    j = sub.add_parser("adjust")
    j.add_argument("--audit", required=True)
    j.add_argument("--a", required=True, help="agent:label=results.jsonl,label=results.jsonl")
    j.add_argument("--b", required=True)
    j.set_defaults(fn=cmd_adjust)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
