# Galley vs OpenCode on the Aider Polyglot benchmark

A head-to-head run of the two harnesses on a public benchmark, using the same model, prompts, limits and grading. The latest results, on the sandbox fixed on 12 November 2026, are in [RESULTS-clean.md](RESULTS-clean.md). Earlier runs: [RESULTS.md](RESULTS.md) (DeepSeek) and [RESULTS-claude.md](RESULTS-claude.md).

## Benchmark

[Aider Polyglot](https://github.com/Aider-AI/polyglot-benchmark): 225 of Exercism's hardest exercises in six languages. This run uses the **Python (34), Go (39) and Rust (30)** sets: 103 tasks, 102 scored.
- `rust/macros` is excluded because its compile-failure tests can't run offline.
- JavaScript, Java and C++ were skipped because their per-exercise toolchain setup (npm, Gradle, CMake) adds network and setup dependencies to the sandbox.

## Protocol

| | Setting |
|---|---|
| Model | `deepseek/deepseek-flash` (DeepSeek-V4.1-Flash), default reasoning effort, for both agents |
| Versions | OpenCode 1.19.5 (npm `opencode-ai`); Galley at this commit |
| Workspace | Exercise files with the **tests and `.meta` (reference solution) removed** |
| Prompt | Aider's benchmark prompt plus the exercise's `.docs`, identical for both agents. One attempt, with no test feedback from the harness. |
| Agent mode | Headless and auto-approving: `galley run --yes`, `opencode run --auto` |
| Limits | 10 minutes per task; 6 runs in parallel, with agents interleaved per task |
| Containment (since 12 November 2026) | Each agent runs inside a bubblewrap sandbox that contains only the operating system, the language toolchains, the agent's own program, its workspace and its own state folders. Nothing else on the machine is mounted: not the operator's home directory, not this repository, not other tasks or runs. The agent is an unprivileged user with no capabilities. Package managers are offline (`CARGO_NET_OFFLINE`, `GOPROXY=off`; crates pre-fetched). **There is no internet access.** The only way out is a Unix socket to the logging proxy (relayed inside the sandbox by `forward.ts`), so only the model API is reachable. Galley also applies its own inner sandbox to its commands, as it does in normal use. Runs before this date used a weaker sandbox; see below. |
| API keys | Agents never hold a real key. They send a placeholder; `proxy.ts` (or the machine's network layer) puts the real key on the request outside the sandbox. |
| Self-test | Before every round, `run.ts --selftest` plants files an agent must never see (another task's workspace, the results file, a line of a real hidden test) and searches for them from inside the sandbox, tries the known ways out, and checks the toolchains. The round does not start unless it passes. |
| Leak audit | After every round, `audit_leaks.py` reads each transcript for signs that an agent reached hidden tests anyway. Its count is reported next to the pass rate. |
| Grading | Official tests restored, then run in a network-less sandbox: `pytest`, `go test ./...`, `cargo test -- --include-ignored` |
| Accounting | Both agents call DeepSeek through `proxy.ts`, which logs the usage DeepSeek reports (prompt tokens, cache hits, completion tokens). Costs are computed from those counts at DeepSeek list prices: $0.15 per million for cache-miss input, $0.003 per million for cache-hit input, $0.60 per million for output. These are the off-peak prices. DeepSeek bills double on weekdays 01:00 to 04:00 and 06:00 to 10:00 UTC; reports use the off-peak price throughout so that runs compare like for like, and `analyze_rounds.py` also shows what each round was billed. |
| Harness check | An oracle run graded each exercise's reference solution: 96 of 103 passed. Six Rust references use crates their own `Cargo.toml` doesn't declare; agents are told to use only the standard library, so this doesn't affect them. The seventh is `rust/macros`. |

## Caveats

- **Run 1 allowed internet access and is discarded.** Both agents downloaded the hidden official tests from GitHub: OpenCode on 35 tasks, Galley on 3. The published numbers come from run 2, with no internet access. See [RESULTS.md](RESULTS.md).

- **This is not an official leaderboard number.** It is one model, three of six languages, and one attempt per task with no retries. Aider's leaderboard scores two attempts with test feedback, so its numbers aren't comparable.
- **One run per agent.** Model sampling varies between runs, so treat differences of a few tasks as noise; the report includes a paired significance test.
- **Galley was changed before the run.** While setting up the benchmark I added writable build caches and offline package-manager settings to Galley's sandbox, because `go test` couldn't write its cache. This is a general product fix, not tuning for these tasks, and Galley was not changed during the run.
- Both agents ran with auto-approval. OpenCode ran with its default permissions (everything allowed) inside the outer sandbox; Galley ran with its default rules and its own sandbox.

## Sandbox holes found and fixed on 12 November 2026

An audit of the saved transcripts showed the sandbox used for all runs up to that date was weaker than this page claimed. On DeepSeek, OpenCode used the holes in 22 task-runs; see [RESULTS.md](RESULTS.md).

| Hole | What it allowed | Fix |
|---|---|---|
| The run's whole output folder was mounted (writable) in every agent's sandbox, because the proxy socket lived in it | Reading other tasks' workspaces, which hold the hidden tests after grading. The same exercise exists in several languages, so later tasks could read earlier tasks' tests. Also reading `results.jsonl`. | The socket has a folder of its own, and only that is mounted. Of a task's own run folder the agent sees just its workspace and state folders. |
| Agents ran as root with full capabilities | Undoing the sandbox: `unshare -m` then `umount /tmp` exposed the benchmark checkout, with hidden tests and reference solutions | Agents run as an unprivileged user in a user namespace, with no capabilities |
| The whole host filesystem was mounted read-only | Reading the operator's session log, this repository's notes and results, and anything else in the home directory | The sandbox is built from a short list of folders (system, toolchains, the agent's program); nothing else exists inside it |
| The real API key was in the agent's environment | Agents printed it into their logs | Agents get a placeholder; the key is added outside the sandbox |

How the fix was checked:
- `run.ts --selftest` passes for both agents on the new sandbox, and reports 23 failures when pointed at the old sandbox arguments.
- Grading is unchanged: the reference solutions give the same result on all 103 tasks in the old and new sandbox (96 pass; the same seven Rust exceptions).
- Galley's own sandbox still works inside the new one (its sandbox tests pass there, except the one that needs a network to grant).

`audit_leaks.py` can also be run by hand on any finished run:

```bash
python3 -I audit_leaks.py scan --polyglot $WORK/polyglot --out data/leak-audit.json myrun=$WORK/rounds/myrun
```

Galley's own sandbox had the root problem too (a command could remount the filesystem read-write when Galley ran as root). That is fixed in `galley/src/safety/sandbox.ts`, with tests.

## Reproduce

```bash
apt-get install -y bubblewrap        # if bwrap is missing
bench/setup.sh                       # benchmark checkout, OpenCode 1.19.5, Rust crates -> /tmp/bench-work
export DEEPSEEK_API_KEY=...          # read by the proxy only; agents get a placeholder
bench/round.sh myrun                 # self-test, both agents on all tasks, report, leak audit
```

`round.sh` takes a name, a split (`all`, `dev`, `holdout`) and a list of agents. To compare configurations of one agent side by side, name a variant `<agent>-<label>` and describe it in `BENCH_VARIANTS`:

```bash
BENCH_VARIANTS='{"galley-sr":{"providerOpts":{"sendReasoning":true}}}' bench/round.sh clean-1 all opencode,galley,galley-sr
```

To look around inside the sandbox an agent gets: `bun run.ts --agents opencode --out /tmp/bench-work/rounds/x --box-exec 'ls -la / ~'`.

Raw per-task results and per-request usage are in [`data/`](data/).

## Running the Claude Sonnet 5.5 comparison (new session)

The API key must be available as the environment variable `BENCH_ANTHROPIC_API_KEY`: add it in the cloud environment's settings and start a new session. Only `proxy.ts` uses it: the agents send a placeholder, and the proxy puts the real key on the request. Neither agent ever sees it or your other credentials.

```bash
apt-get install -y bubblewrap        # if bwrap is missing
bench/setup.sh                       # benchmark, OpenCode 1.19.5, Rust crates -> /tmp/bench-work
export MODEL=anthropic/claude-sonnet-5-5 PRICES=claude-sonnet-5-5
LIMIT=1 LANGS=python bench/round.sh sonnet-smoke     # one task per agent: check cost per task first
bench/round.sh sonnet-1 && bench/round.sh sonnet-2   # 2 full runs, both agents (about $50 estimated)
bun bench/pooled.ts --a galley:/tmp/bench-work/rounds/sonnet-1/results.jsonl,/tmp/bench-work/rounds/sonnet-2/results.jsonl \
                    --b opencode:/tmp/bench-work/rounds/sonnet-1/results.jsonl,/tmp/bench-work/rounds/sonnet-2/results.jsonl
```

Both agents run at the same reasoning effort, `high` by default and set with `--effort`: Galley through its `effort` setting, OpenCode through `--variant`. Each request is priced by the model that served it; OpenCode titles sessions with Claude Haiku 5.5. The runner refuses to start if the benchmark checkout or the output folder sits where a sandbox could see it.
