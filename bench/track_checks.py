#!/usr/bin/env python3
"""Checks on a campaign's raw run folders that the scores alone do not show (C, C#, Elixir task sets):
  1. Did each agent's own shell commands get to run the language's build tool? (Was the benchmark even-handed?)
  2. Why did failed gradings fail: wrong answers, code that does not compile against the tests, or files the agent
     left behind (a second main, a failing test of its own)?
  3. Did the agent change a build file (makefile, .csproj, mix.exs, the test helper)?
usage: track_checks.py <rounds-dir> <round>[,<round>...] <tasks-dir> <armA> <armB> [--json <out.json>]
Needs the rounds' raw folders (runs/<agent>/<lang>/<name>/ with the transcript, grade.log and final workspace),
which are not stored in the repo; --json saves the counts. The classification is by pattern and is approximate."""
import collections, glob, json, os, re, sys

args = [a for a in sys.argv[1:] if not a.startswith("--json")]
out_json = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
if out_json:
    args.remove(out_json)
base, rounds, tasks_dir, arms = args[0], args[1].split(","), args[2], args[3:]

# A command "tries" the build tool when it names it; the tool "ran" when the command ended with status 0 or its
# output carries the tool's own words (a compiler diagnostic, a test summary) rather than a shell error.
TOOL = {
    "c": re.compile(r"(?<![\w/.-])(gcc|cc|clang|make)\b"),
    "csharp": re.compile(r"\bdotnet\s+(build|test|run|restore|msbuild)\b"),
    "elixir": re.compile(r"(?<![\w/.-])(mix|elixir|iex)\b"),
}
RAN = {
    "c": re.compile(r"\berror:|\bwarning:|\d+ Tests \d+ Failures|undefined reference|In function"),
    "csharp": re.compile(r"Build succeeded|Build FAILED|(error|warning) (CS|MSB|NETSDK|NU)\d+|Passed!|Failed!|Test run for|Determining projects to restore|Time Elapsed"),
    "elixir": re.compile(r"Compiling \d+ files?|Generated \w+ app|\d+ tests?, \d+ failures?|\*\* \(|\bwarning:|Finished in"),
}
# The track's own test command, run to the point of a test summary.
TESTS_RAN = {
    "c": re.compile(r"\d+ Tests \d+ Failures \d+ Ignored"),
    "csharp": re.compile(r"(Passed|Failed)!\s+- Failed:\s+\d+, Passed:\s+\d+"),
    "elixir": re.compile(r"\d+ tests?, \d+ failures?"),
}
# Words in a command's output that point at the environment rather than at the code.
TROUBLE = {
    "command not found": re.compile(r"command not found"),
    "read-only file system": re.compile(r"Read-only file system"),
    "packages not found (NuGet)": re.compile(r"\bNU1(101|102|301|403)\b|Unable to load the service index"),
    "restore skipped, assets missing (NETSDK1004)": re.compile(r"NETSDK1004"),
    ".NET home not writable": re.compile(r"NuGet-Migrations"),
    "network refused": re.compile(r"Could not resolve host|Network is unreachable|Temporary failure in name resolution|nxdomain"),
    "killed or out of memory": re.compile(r"\bKilled\b|[Cc]annot allocate memory|OutOfMemory"),
}
BUILD_FILES = {"c": ["makefile", "test-framework/*"], "csharp": ["*.csproj", "packages.lock.json"], "elixir": ["mix.exs", "test/test_helper.exs"]}
BUILD_OUTPUT = re.compile(r"(^|/)(bin|obj|_build|deps|\.elixir_ls|\.vs|\.docs|\.git)(/|$)|\.(o|out|dSYM)$|(^|/)(erl_crash\.dump|\.DS_Store)$")
SOURCE_EXT = {"c": (".c", ".h"), "csharp": (".cs", ".csx"), "elixir": (".ex", ".exs")}


def galley_commands(run):
    for p in sorted(glob.glob(f"{run}/galley-data/projects/*/sessions/*.jsonl")):
        calls = []
        for line in open(p, errors="replace"):
            try:
                o = json.loads(line)
            except Exception:
                continue
            if o.get("type") != "message":
                continue
            m = o["message"]
            if m.get("role") == "assistant":
                calls = m.get("toolCalls") or []
            elif m.get("role") == "tool":
                for call, res in zip(calls, m.get("results") or []):
                    if call.get("name") != "bash":
                        continue
                    text = str(res.get("content"))
                    code = re.search(r"\[exit code (\d+|none)\]\s*$", text)
                    yield str((call.get("input") or {}).get("command", "")), text, (int(code.group(1)) if code and code.group(1) != "none" else None)


def opencode_commands(run):
    f = f"{run}/agent.log"
    if not os.path.exists(f):
        return
    for line in open(f, errors="replace"):
        try:
            o = json.loads(line)
        except Exception:
            continue
        part = o.get("part") or {}
        if part.get("type") == "tool" and part.get("tool") == "bash":
            st = part.get("state") or {}
            if st.get("status") not in ("completed", "error"):
                continue
            yield str((st.get("input") or {}).get("command", "")), str(st.get("output", "")), (st.get("metadata") or {}).get("exit")


def task_files(lang, name):
    d = f"{tasks_dir}/{lang}/exercises/practice/{name}"
    cfg = json.load(open(f"{d}/.meta/config.json"))["files"]
    return d, cfg["solution"], cfg["test"]


def walk(root):
    for dp, _, fn in os.walk(root):
        for f in fn:
            yield os.path.relpath(os.path.join(dp, f), root)


def grade_cause(lang, log, timed_out, tests, extra_sources):
    """Why a failed grading failed."""
    if timed_out:
        return "grading ran out of time"
    own = lambda path: any(os.path.basename(path) == os.path.basename(e) for e in extra_sources)
    if lang == "c":
        if re.search(r"multiple definition of [`']main'", log):
            return "leftover file (a second main)"
        errs = re.findall(r"^(?:\./)?([^\s:]+\.[ch]):\d+:\d+: (?:fatal )?error:", log, re.M)
        if errs:
            return "leftover file does not compile" if all(own(e) for e in errs) else "does not compile against the tests"
        if re.search(r"\berror:|undefined reference|ld returned", log):
            return "does not compile against the tests"
        m = re.search(r"(\d+) Tests (\d+) Failures", log)
        if m and int(m.group(2)) > 0:
            return "tests fail"
        if re.search(r"Aborted|Segmentation fault|AddressSanitizer|core dumped|free\(\)|stack smashing|Floating point exception|Bus error", log):
            return "crashes"
        return "other"
    if lang == "csharp":
        errs = re.findall(r"^\s*(\S+\.cs)\(\d+,\d+\): error (CS\d+)", log, re.M)
        if re.search(r"error CS0017", log) or (errs and all(own(f) for f, _ in errs)):
            return "leftover file (a second entry point, or one that does not compile)"
        if errs or re.search(r"error (CS|MSB|NU|NETSDK)\d+|Build FAILED", log):
            return "does not compile against the tests"
        if re.search(r"Failed!\s+- Failed:\s+[1-9]", log) or re.search(r"\[FAIL\]", log):
            return "tests fail"
        if re.search(r"Stack overflow|aborted|Test host process crashed|The active test run was aborted", log, re.I):
            return "crashes"
        return "other"
    if lang == "elixir":
        m = re.search(r"(\d+) tests?, (\d+) failures?", log)
        if m and int(m.group(2)) > 0:
            where = set(re.findall(r"^\s+(test/\S+\.exs):\d+", log, re.M))
            if where and not (where & set(tests)):
                return "leftover file (only the agent's own tests fail)"
            return "tests fail"
        if re.search(r"== Compilation error|\*\* \((CompileError|SyntaxError|TokenMissingError|MismatchedDelimiterError)\)|undefined function|cannot compile", log):
            return "does not compile against the tests"
        if re.search(r"\*\* \(", log):
            return "crashes"
        return "other"
    return "other"


C = collections.defaultdict(collections.Counter)      # (arm, lang) -> counters
for r in rounds:
    for line in open(f"{base}/{r}/results.jsonl"):
        try:
            res = json.loads(line)
        except Exception:
            continue
        arm, lang, name = res["agent"], res["lang"], res["name"]
        if arm not in arms or lang not in TOOL:
            continue
        run = f"{base}/{r}/runs/{arm}/{lang}/{name}"
        c = C[(arm, lang)]
        c["task-runs"] += 1
        c["passed"] += bool(res["pass"])
        # 1. the agent's own commands
        cmds = list(galley_commands(run) if arm.startswith("galley") else opencode_commands(run))
        tried = [(cmd, out, code) for cmd, out, code in cmds if TOOL[lang].search(cmd)]
        ran = [x for x in tried if x[2] == 0 or RAN[lang].search(x[1])]
        c["build tool: tried"] += bool(tried)
        c["build tool: ran"] += bool(ran)
        c["track's tests ran to a summary"] += any(TESTS_RAN[lang].search(out) for _, out, _ in cmds)
        c["shell commands"] += len(cmds)
        for label, pat in TROUBLE.items():
            c["trouble: " + label] += any(pat.search(out) for _, out, _ in cmds)
        # 2. and 3. the final workspace and the grading
        src, solution, tests = task_files(lang, name)
        ws = f"{run}/ws/{name}"
        original = set(walk(src))
        extra = [f for f in (walk(ws) if os.path.isdir(ws) else []) if f not in original and not BUILD_OUTPUT.search(f)]
        extra_sources = [f for f in extra if f.endswith(SOURCE_EXT[lang])]
        c["left extra source files"] += bool(extra_sources)
        changed = []
        for pat in BUILD_FILES[lang]:
            for f in glob.glob(f"{src}/{pat}"):
                rel = os.path.relpath(f, src)
                now = f"{ws}/{rel}"
                if not os.path.exists(now) or open(now, "rb").read() != open(f, "rb").read():
                    changed.append(rel)
        c["changed a build file"] += bool(changed)
        c["changed a build file and passed"] += bool(changed) and bool(res["pass"])
        if not res["pass"]:
            log = open(f"{run}/grade.log", errors="replace").read() if os.path.exists(f"{run}/grade.log") else ""
            c["failed: " + grade_cause(lang, log, res.get("gradeExit") is None, tests, extra_sources)] += 1

langs = sorted({k[1] for k in C})
keys = ["task-runs", "passed", "shell commands", "build tool: tried", "build tool: ran", "track's tests ran to a summary"]
keys += sorted({k for c in C.values() for k in c if k.startswith("trouble: ") and any(x[k] for x in C.values())})
keys += ["left extra source files", "changed a build file", "changed a build file and passed"]
keys += sorted({k for c in C.values() for k in c if k.startswith("failed: ")})
print(f"{len(rounds)} rounds: {', '.join(rounds)}. Counts of task-runs over all rounds, except 'shell commands'.\n")
head = "".join(f"{a + ' ' + l:>20}" for l in langs + ["all"] for a in arms)
print(f"{'':52}{head}")
total = collections.defaultdict(collections.Counter)
for (arm, lang), c in C.items():
    total[arm].update(c)
for k in keys:
    row = "".join(f"{(C[(a, l)][k] if l != 'all' else total[a][k]):>20}" for l in langs + ["all"] for a in arms)
    print(f"{k:52}{row}")
if out_json:
    json.dump({"rounds": rounds, "counts": {f"{a}/{l}": dict(c) for (a, l), c in sorted(C.items())}}, open(out_json, "w"), indent=1, sort_keys=True)
