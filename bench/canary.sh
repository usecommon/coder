#!/bin/bash
# Run the regression canary: the 30 tasks in canary.json, Galley only, on the canary's model, then judge the round
# against the tasks' history (canary.ts check). About $0.20 on DeepSeek V4.1 Flash at off-peak price.
# Usage: bench/canary.sh [name]   Env as for round.sh (WORK, UPSTREAM_KEY, CONCURRENCY …).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=${1:-canary-$(date -u +%Y%m%d-%H%M)}
ONLY=$(python3 -I -c 'import json,sys; c=json.load(open(sys.argv[1])); print(",".join([*c["stable"], *c["hard"]]))' "$HERE/canary.json")
MODEL_NAME=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["model"])' "$HERE/canary.json")
case "$MODEL_NAME" in claude-*) MODEL=anthropic/$MODEL_NAME ;; *) MODEL=deepseek/$MODEL_NAME ;; esac
WORK=${WORK:-/tmp/bench-work}
CANARY=1 ONLY=$ONLY MODEL=$MODEL CONCURRENCY=${CONCURRENCY:-6} bash "$HERE/round.sh" "$NAME" all galley
cd "$HERE" && bun canary.ts check "$WORK/rounds/$NAME"
