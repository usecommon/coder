#!/bin/bash
# One-time setup for the benchmark in a fresh session. Idempotent.
# Creates $WORK (default: /tmp/bench-work, which agent sandboxes cannot see) with the Polyglot benchmark, OpenCode, and warmed Rust crates.
set -euo pipefail
WORK=${WORK:-/tmp/bench-work}
mkdir -p "$WORK"
cd "$WORK"

[ -d polyglot ] || git clone -q --depth 1 https://github.com/Aider-AI/polyglot-benchmark.git polyglot
if [ ! -x oc/node_modules/opencode-ai/bin/opencode.exe ]; then
  mkdir -p oc && (cd oc && npm init -y >/dev/null && npm i -s opencode-ai@1.19.5)
fi
# OpenCode needs its model catalog cached once; agents get a copy of this cache.
if [ ! -f oc/xdg/cache/opencode/models.json ]; then
  XDG_CACHE_HOME=$WORK/oc/xdg/cache XDG_CONFIG_HOME=$WORK/oc/xdg/config XDG_DATA_HOME=$WORK/oc/xdg/data XDG_STATE_HOME=$WORK/oc/xdg/state \
    timeout 120 oc/node_modules/opencode-ai/bin/opencode.exe models >/dev/null 2>&1 || true
fi
# Rust exercises with crate dependencies: fetch them once (agents and grading run offline).
for e in gigasecond grep simple-cipher; do
  (cd polyglot/rust/exercises/practice/$e && cargo fetch -q) || true
done
command -v bwrap >/dev/null || { echo "install bubblewrap: apt-get install -y bubblewrap"; exit 1; }
echo "setup done in $WORK"
