#!/bin/bash
# A second set of tasks: exercises from Exercism tracks the Polyglot benchmark does not include (PHP, TypeScript,
# Ruby). Run after setup.sh. Idempotent.
# Creates $WORK/tracks2/<language>/exercises/practice/<name>, laid out like the Polyglot checkout, with every
# exercise that shares its name with a Polyglot exercise and is active in its track; and the test tools the
# sandboxes need: the TypeScript exercises' node_modules and PHPUnit.
# Nothing downloaded here is run on this machine: exercises, npm packages and PHPUnit only ever run inside the
# benchmark sandbox. To use the set: BENCH_TASKS=$WORK/tracks2 LANGS=php,typescript,ruby bench/round.sh ...
set -euo pipefail
WORK=${WORK:-/tmp/bench-work}
HERE=$(cd "$(dirname "$0")" && pwd)
[ -d "$WORK/polyglot" ] || { echo "run setup.sh first"; exit 1; }
cd "$WORK"

# The track repositories at the commits the task list was fixed on (13 November 2026).
declare -A PIN=(
  [php]=40c7c1bd6ca3a4b9784ea429e30f3cf50998a740
  [typescript]=2de55fcd08eb7f330c4f100a57427b2ed350b50c
  [ruby]=e510a3430ca2daadb26a517965c5c0537cbfa986
)
mkdir -p tracks
for t in php typescript ruby; do
  if [ ! -d "tracks/$t/.git" ]; then
    git init -q "tracks/$t"
    git -C "tracks/$t" remote add origin "https://github.com/exercism/$t"
    GIT_LFS_SKIP_SMUDGE=1 git -C "tracks/$t" fetch -q --depth 1 origin "${PIN[$t]}"
    git -C "tracks/$t" checkout -q FETCH_HEAD
  fi
  [ "$(git -C "tracks/$t" rev-parse HEAD)" = "${PIN[$t]}" ] || echo "warning: tracks/$t is not at the pinned commit ${PIN[$t]}"
done

# Select and copy the exercises (files are only copied, never run).
python3 -I - "$WORK" <<'EOF'
import json, os, shutil, sys
work = sys.argv[1]
polyglot = set()
for lang in os.listdir(f"{work}/polyglot"):
    d = f"{work}/polyglot/{lang}/exercises/practice"
    if os.path.isdir(d):
        polyglot |= set(os.listdir(d))
for track in ("php", "typescript", "ruby"):
    root = f"{work}/tracks/{track}"
    status = {e["slug"]: e.get("status", "active") for e in json.load(open(f"{root}/config.json"))["exercises"]["practice"]}
    names = sorted(n for n in os.listdir(f"{root}/exercises/practice") if n in polyglot and status.get(n, "active") not in ("deprecated", "wip"))
    out = f"{work}/tracks2/{track}/exercises/practice"
    shutil.rmtree(f"{work}/tracks2/{track}", ignore_errors=True)
    for n in names:
        shutil.copytree(f"{root}/exercises/practice/{n}", f"{out}/{n}", symlinks=True)
    print(f"{track}: {len(names)} exercises -> {out}")
EOF

# TypeScript: every exercise declares the same devDependencies (jest, a babel preset, typescript). Install them
# once, without running any package's install scripts.
if [ ! -f deps/ts/node_modules/jest/bin/jest.js ]; then
  mkdir -p deps/ts && cp "$HERE/deps-seed/ts/package.json" deps/ts/
  (cd deps/ts && npm install --no-audit --no-fund --ignore-scripts >/dev/null) || echo "could not install the TypeScript test dependencies"
fi

# PHP: the track's tests need PHPUnit 10.5 or 11.5. Fetch the official archive and give it a `phpunit` command.
PHPUNIT=11.5.57
if [ ! -f deps/php/phpunit.phar ]; then
  mkdir -p deps/php/bin
  curl -fsSL -o deps/php/phpunit.phar "https://phar.phpunit.de/phpunit-$PHPUNIT.phar" || echo "could not download PHPUnit"
  echo "c704fdd37c6c6ab7adb386f31b4e186cd51156801fa9028b5ea8099a2cd7f106  deps/php/phpunit.phar" | sha256sum -c --quiet || { echo "PHPUnit archive does not match the expected checksum"; exit 1; }
  printf '#!/bin/sh\nexec php "$(dirname "$0")/../phpunit.phar" "$@"\n' > deps/php/bin/phpunit
  chmod +x deps/php/bin/phpunit
fi

# Ruby: the tests need only minitest, which ships with Ruby.
command -v ruby >/dev/null || echo "ruby is not installed"
command -v php >/dev/null || echo "php is not installed"
echo "tracks ready in $WORK/tracks2"
