#!/bin/bash
# One-time setup for the benchmark in a fresh session. Idempotent.
# Creates $WORK (default: /tmp/bench-work, which agent sandboxes cannot see) with the Polyglot benchmark, OpenCode, warmed Rust crates,
# and the test dependencies of the JavaScript and Java exercises.
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
# --- JavaScript, Java and C++ exercises (optional: only needed for --langs javascript,java,cpp) ---
HERE=$(cd "$(dirname "$0")" && pwd)
# JavaScript exercises expect node_modules (jest, babel) next to the code: install their devDependencies once.
if command -v npm >/dev/null && [ ! -f deps/js/node_modules/jest/bin/jest.js ]; then
  mkdir -p deps/js && cp "$HERE/deps-seed/js/package.json" deps/js/ && (cd deps/js && npm install --no-audit --no-fund >/dev/null) || echo "could not install the JavaScript test dependencies"
fi
# Java exercises take JUnit and AssertJ (two also RxJava and org.json) from Maven Central. A throwaway project of
# our own makes Gradle download them once; they are then kept as a read-only dependency cache for the sandboxes.
if command -v gradle >/dev/null && [ ! -d deps/gradle-ro/modules-2 ]; then
  rm -rf deps/gradle-seed && cp -r "$HERE/deps-seed/gradle" deps/gradle-seed
  for attempt in 1 2 3 4; do   # Maven Central sometimes answers 429
    (cd deps/gradle-seed && GRADLE_USER_HOME="$WORK/deps/gradle-warm" gradle test --no-daemon -q >/dev/null 2>&1) && break || sleep $((attempt * 20))
  done
  if [ -d deps/gradle-warm/caches/modules-2 ]; then
    mkdir -p deps/gradle-ro && cp -r deps/gradle-warm/caches/modules-2 deps/gradle-ro/ && find deps/gradle-ro \( -name "*.lock" -o -name "gc.properties" \) -delete
  else
    echo "could not download the Java test libraries"
  fi
fi
# Two C++ exercises (gigasecond, meetup) need the Boost date_time headers.
[ -d /usr/include/boost/date_time ] || apt-get install -y --no-install-recommends libboost-date-time-dev >/dev/null 2>&1 || echo "Boost date_time headers missing: cpp/gigasecond and cpp/meetup will be excluded"
# (A warm Gradle home, deps/gradle-home, is made by the first Java task of `run.ts --oracle --langs java`.)

command -v bwrap >/dev/null || { echo "install bubblewrap: apt-get install -y bubblewrap"; exit 1; }
echo "setup done in $WORK"
