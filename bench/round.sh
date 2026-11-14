#!/bin/bash
# Run one benchmark round with a fresh logging proxy, then print the report and the leak audit.
# Usage: bench/round.sh <name> [split=all|dev|holdout] [agents=galley,opencode]
# Env: WORK (from setup.sh), MODEL (default deepseek/deepseek-flash), PRICES (report price table),
#      GALLEY_ARGS (extra Galley flags), BENCH_VARIANTS (named agent variants, see run.ts), CONCURRENCY, LIMIT, LANGS, ONLY,
#      BENCH_SKIP (tasks to leave out, lang/name,...), EXCLUDE (tasks the report leaves out of scoring),
#      BENCH_TASKS (the task checkout, default $WORK/polyglot; $WORK/tracks2 for the exercises from setup_tracks.sh).
#      ALLOW_MODELS (models the proxy forwards, comma-separated; default: the round's model, plus the small model
#      OpenCode uses beside an Anthropic one). The proxy refuses every other model and every other endpoint.
#      API key: agents never get it. The proxy adds UPSTREAM_KEY to their requests; it defaults to
#      BENCH_ANTHROPIC_API_KEY for anthropic/* models and DEEPSEEK_API_KEY otherwise. Set UPSTREAM_KEY= (empty)
#      when the machine's network layer adds the key by itself.
set -u
NAME=$1; SPLIT=${2:-all}; AGENTS=${3:-galley,opencode}
WORK=${WORK:-/tmp/bench-work}
MODEL=${MODEL:-deepseek/deepseek-flash}
PRICES=${PRICES:-deepseek-flash}
case "$MODEL" in
  anthropic/*) DEFAULT_UPSTREAM=https://api.anthropic.com; DEFAULT_KEY=${BENCH_ANTHROPIC_API_KEY:-} ;;
  *) DEFAULT_UPSTREAM=https://api.deepseek.com; DEFAULT_KEY=${DEEPSEEK_API_KEY:-} ;;
esac
UPSTREAM=${UPSTREAM:-$DEFAULT_UPSTREAM}
case "$MODEL" in
  anthropic/*) DEFAULT_ALLOW=${MODEL#*/},claude-haiku-5-5 ;;
  *) DEFAULT_ALLOW=${MODEL#*/} ;;
esac
KEY=${UPSTREAM_KEY-$DEFAULT_KEY}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$WORK/rounds/$NAME; mkdir -p "$OUT"
# The socket gets a folder of its own: it is the one host folder mounted in the agents' sandboxes.
SOCKDIR=$(mktemp -d "$WORK/sock.XXXXXX"); SOCK=$SOCKDIR/p.sock

cd "$HERE"
UPSTREAM=$UPSTREAM UPSTREAM_KEY=$KEY SOCK=$SOCK LOG=$OUT/proxy.jsonl ALLOW_MODELS=${ALLOW_MODELS:-$DEFAULT_ALLOW} bun proxy.ts >> "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null; rm -f "$SOCK"; rmdir "$SOCKDIR" 2>/dev/null' EXIT
for i in $(seq 50); do [ -S "$SOCK" ] && break; sleep 0.1; done
[ -S "$SOCK" ] || { echo "proxy did not start; see $OUT/proxy.log"; exit 1; }

export POLYGLOT=${BENCH_TASKS:-$WORK/polyglot} OPENCODE_BIN=$WORK/oc/node_modules/opencode-ai/bin/opencode.exe OC_CACHE_SEED=$WORK/oc/xdg/cache PROXY_SOCK=$SOCK PROXY_LOG=$OUT/proxy.jsonl
# Check that the sandbox hides what it must before spending anything.
bun run.ts --selftest --model "$MODEL" --agents "$AGENTS" ${LANGS:+--langs $LANGS} --out "$OUT" 2>&1 | tee "$OUT/selftest.log"
[ "${PIPESTATUS[0]}" = 0 ] || { echo "sandbox self-test failed; not running"; exit 1; }
bun run.ts --model "$MODEL" --agents "$AGENTS" --split "$SPLIT" --concurrency "${CONCURRENCY:-10}" ${LIMIT:+--limit $LIMIT} ${LANGS:+--langs $LANGS} ${ONLY:+--only $ONLY} --out "$OUT" 2>&1 | tee -a "$OUT/run.log" | grep -E "infrastructure error|^done|runs \\("
# A self-test-only run (LIMIT=0) has no results to report on.
if [ -s "$OUT/results.jsonl" ]; then
  bun report.ts "$OUT/results.jsonl" "$OUT/proxy.jsonl" --split="$SPLIT" --prices="$PRICES" ${EXCLUDE:+--exclude=$EXCLUDE} > "$OUT/report.md"
  cat "$OUT/report.md"
fi
# Did any agent get at hidden tests anyway? Expect no flagged task-runs.
python3 -I audit_leaks.py scan --polyglot "$POLYGLOT" --out "$OUT/leak-audit.json" "$NAME=$OUT" | tee "$OUT/leak-audit.txt"
