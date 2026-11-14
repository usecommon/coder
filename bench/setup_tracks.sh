#!/bin/bash
# More sets of tasks: exercises from Exercism tracks the Polyglot benchmark does not include.
#   tracks2: PHP, TypeScript, Ruby        tracks3: C, C#, Elixir
# Run after setup.sh. Idempotent.
# Creates $WORK/tracks2 and $WORK/tracks3, each <language>/exercises/practice/<name>, laid out like the Polyglot
# checkout, with every exercise that shares its name with a Polyglot exercise and is active in its track; and the
# test tools the sandboxes need: the TypeScript exercises' node_modules, PHPUnit, the C# test packages, and the
# .NET and Elixir toolchains.
# No exercise code is run on this machine: exercises and their tests only ever run inside the benchmark sandbox.
# To use a set: BENCH_TASKS=$WORK/tracks2 LANGS=php,typescript,ruby bench/round.sh ...
#               BENCH_TASKS=$WORK/tracks3 LANGS=c,csharp,elixir bench/round.sh ...
set -euo pipefail
WORK=${WORK:-/tmp/bench-work}
HERE=$(cd "$(dirname "$0")" && pwd)
[ -d "$WORK/polyglot" ] || { echo "run setup.sh first"; exit 1; }
cd "$WORK"
# Shared test tools live outside /tmp (see setup.sh); deps/ in $WORK is a link to them.
DEPS=${BENCH_DEPS:-/opt/bench-deps}
mkdir -p "$DEPS"; [ -e deps ] || ln -s "$DEPS" deps

# The track repositories at the commits the task lists were fixed on (13 and 14 November 2026).
declare -A PIN=(
  [php]=40c7c1bd6ca3a4b9784ea429e30f3cf50998a740
  [typescript]=2de55fcd08eb7f330c4f100a57427b2ed350b50c
  [ruby]=e510a3430ca2daadb26a517965c5c0537cbfa986
  [c]=f33ae8729f165d4e3ede1211e9694eb0b2f13569
  [csharp]=45460528ac123937c07ab76455b7bbca47785c67
  [elixir]=5d044da9a5eb1389e2162ad98b5a0ed1a24d61f0
)
mkdir -p tracks
for t in php typescript ruby c csharp elixir; do
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
for group, tracks in (("tracks2", ("php", "typescript", "ruby")), ("tracks3", ("c", "csharp", "elixir"))):
    for track in tracks:
        root = f"{work}/tracks/{track}"
        status = {e["slug"]: e.get("status", "active") for e in json.load(open(f"{root}/config.json"))["exercises"]["practice"]}
        names = sorted(n for n in os.listdir(f"{root}/exercises/practice") if n in polyglot and status.get(n, "active") not in ("deprecated", "wip"))
        out = f"{work}/{group}/{track}/exercises/practice"
        shutil.rmtree(f"{work}/{group}/{track}", ignore_errors=True)
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

# C: gcc and make; the exercises carry their own test framework.
# C# and Elixir: the toolchains from the system's package source. Elixir's tests need nothing else.
command -v dotnet >/dev/null && command -v mix >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends dotnet-sdk-10.0 elixir >/dev/null 2>&1 || echo "could not install the .NET SDK and Elixir"
# C#: the test packages the exercises reference, restored once from two small projects of our own into a folder
# the sandboxes use as a read-only package source.
if command -v dotnet >/dev/null && [ ! -d deps/nuget/packages/xunit.v3 ]; then
  rm -rf nuget-seed && cp -r "$HERE/deps-seed/csharp" nuget-seed
  for s in a b; do
    (cd "nuget-seed/$s" && DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 dotnet restore Seed.csproj --packages "$DEPS/nuget/packages" >/dev/null) || echo "could not download the C# test packages ($s)"
  done
fi
# One-test projects the self-test builds and runs, inside the benchmark's sandbox and inside Galley's own.
rm -rf deps/checks && cp -r "$HERE/deps-seed/checks" deps/checks
echo "tracks ready in $WORK/tracks2 and $WORK/tracks3"
