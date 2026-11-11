#!/bin/bash
# Run one benchmark round with a fresh logging proxy, then print the report.
# Usage: bench/round.sh <name> [split=all|dev|holdout] [agents=galley,opencode]
# Env: WORK (from setup.sh), MODEL (default deepseek/deepseek-flash), PRICES (report price table),
#      GALLEY_ARGS (extra Galley flags), and the API key for the model's provider:
#      DEEPSEEK_API_KEY, or BENCH_ANTHROPIC_API_KEY for anthropic/* models.
set -u
NAME=$1; SPLIT=${2:-all}; AGENTS=${3:-galley,opencode}
WORK=${WORK:-/tmp/bench-work}
MODEL=${MODEL:-deepseek/deepseek-flash}
PRICES=${PRICES:-deepseek-flash}
case "$MODEL" in anthropic/*) DEFAULT_UPSTREAM=https://api.anthropic.com ;; *) DEFAULT_UPSTREAM=https://api.deepseek.com ;; esac
UPSTREAM=${UPSTREAM:-$DEFAULT_UPSTREAM}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$WORK/rounds/$NAME; mkdir -p "$OUT"
SOCK=$OUT/p-$$.sock   # unique per launch: a stale socket from a killed proxy would block a new one

cd "$HERE"
PORT=8799 UPSTREAM=$UPSTREAM SOCK=$SOCK LOG=$OUT/proxy.jsonl bun proxy.ts > "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null' EXIT
sleep 1
POLYGLOT=$WORK/polyglot OPENCODE_BIN=$WORK/oc/node_modules/opencode-ai/bin/opencode.exe OC_CACHE_SEED=$WORK/oc/xdg/cache PROXY_SOCK=$SOCK \
  bun run.ts --model "$MODEL" --agents "$AGENTS" --split "$SPLIT" --concurrency "${CONCURRENCY:-10}" ${LIMIT:+--limit $LIMIT} ${LANGS:+--langs $LANGS} --out "$OUT" 2>&1 | tee "$OUT/run.log" | grep -E "infrastructure error|^done|runs \("
bun report.ts "$OUT/results.jsonl" "$OUT/proxy.jsonl" --split="$SPLIT" --prices="$PRICES" > "$OUT/report.md"
cat "$OUT/report.md"
