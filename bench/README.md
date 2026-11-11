# Galley vs OpenCode on the Aider Polyglot benchmark

A head-to-head run of the two harnesses on a public benchmark, using the same model, prompts, limits and grading. Results are in [RESULTS.md](RESULTS.md).

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
| Containment | Each agent runs inside an outer bubblewrap sandbox: system read-only, only its workspace and state directories writable, package managers offline (`CARGO_NET_OFFLINE`, `GOPROXY=off`; crates pre-fetched). **There is no internet access.** Each agent gets a private network namespace whose only way out is a Unix socket to the logging proxy (relayed inside the sandbox by `forward.ts`), so only the DeepSeek API is reachable. Galley also applies its own inner sandbox to its commands, as it does in normal use. |
| Grading | Official tests restored, then run in a network-less sandbox: `pytest`, `go test ./...`, `cargo test -- --include-ignored` |
| Accounting | Both agents call DeepSeek through `proxy.ts`, which logs the usage DeepSeek reports (prompt tokens, cache hits, completion tokens). Costs are computed from those counts at DeepSeek list prices: $0.15 per million for cache-miss input, $0.003 per million for cache-hit input, $0.60 per million for output. |
| Harness check | An oracle run graded each exercise's reference solution: 96 of 103 passed. Six Rust references use crates their own `Cargo.toml` doesn't declare; agents are told to use only the standard library, so this doesn't affect them. The seventh is `rust/macros`. |

## Caveats

- **Run 1 allowed internet access and is discarded.** Both agents downloaded the hidden official tests from GitHub: OpenCode on 35 tasks, Galley on 3. The published numbers come from run 2, with no internet access. See [RESULTS.md](RESULTS.md).

- **This is not an official leaderboard number.** It is one model, three of six languages, and one attempt per task with no retries. Aider's leaderboard scores two attempts with test feedback, so its numbers aren't comparable.
- **One run per agent.** Model sampling varies between runs, so treat differences of a few tasks as noise; the report includes a paired significance test.
- **Galley was changed before the run.** While setting up the benchmark I added writable build caches and offline package-manager settings to Galley's sandbox, because `go test` couldn't write its cache. This is a general product fix, not tuning for these tasks, and Galley was not changed during the run.
- Both agents ran with auto-approval. OpenCode ran with its default permissions (everything allowed) inside the outer sandbox; Galley ran with its default rules and its own sandbox.

## Reproduce

```bash
git clone https://github.com/Aider-AI/polyglot-benchmark
npm i opencode-ai@1.19.5                       # OpenCode binary: node_modules/opencode-ai/bin/opencode.exe
PORT=8799 SOCK=/tmp/p.sock LOG=proxy.jsonl bun proxy.ts &   # agents need DEEPSEEK_API_KEY
POLYGLOT=./polyglot-benchmark OPENCODE_BIN=... OC_CACHE_SEED=<opencode cache dir with models.json> PROXY_SOCK=/tmp/p.sock \
  bun run.ts --langs python,go,rust --concurrency 6 --out results
bun report.ts results/results.jsonl proxy.jsonl > RESULTS.md
```

Raw per-task results and per-request usage are in [`data/`](data/).

## Running the Claude Sonnet 5.5 comparison (new session)

The API key must be available as the environment variable `BENCH_ANTHROPIC_API_KEY`: add it in the cloud environment's settings and start a new session. The two agents send the key to the Anthropic API only through `proxy.ts`. Neither ever sees your other credentials.

```bash
apt-get install -y bubblewrap        # if bwrap is missing
bench/setup.sh                       # benchmark, OpenCode 1.19.5, Rust crates -> /tmp/bench-work
export MODEL=anthropic/claude-sonnet-5-5 PRICES=claude-sonnet-5-5
LIMIT=1 LANGS=python bench/round.sh sonnet-smoke     # one task per agent: check cost per task first
bench/round.sh sonnet-1 && bench/round.sh sonnet-2   # 2 full runs, both agents (about $50 estimated)
bun bench/pooled.ts --a galley:/tmp/bench-work/rounds/sonnet-1/results.jsonl,/tmp/bench-work/rounds/sonnet-2/results.jsonl \
                    --b opencode:/tmp/bench-work/rounds/sonnet-1/results.jsonl,/tmp/bench-work/rounds/sonnet-2/results.jsonl
```

Both agents run at the same reasoning effort, `high` by default and set with `--effort`: Galley through its `effort` setting, OpenCode through `--variant`. Each request is priced by the model that served it; OpenCode titles sessions with Claude Haiku 5.5. The runner refuses to start if the benchmark checkout or the output directory sits outside `/tmp`, where agents could read the reference solutions.
