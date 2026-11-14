#!/bin/sh
# Self-test helper: copy a one-test project to a fresh folder and run its tests, as a task's own commands would.
# usage: run.sh csharp|elixir
set -e
here=$(cd "$(dirname "$0")" && pwd)
d=$(mktemp -d)
cp -r "$here/$1/." "$d"
cd "$d"
case "$1" in
  csharp) dotnet test ;;
  elixir) mix test ;;
  *) echo "unknown check: $1"; exit 2 ;;
esac
