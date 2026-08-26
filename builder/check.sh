#!/usr/bin/env bash
#
# Type-check src/ the way a compiler would, without emitting anything.
#
# This is the gate the JSDoc annotations exist for: ADVANCED analysis at VERBOSE
# warning level, and NOTHING is allowed through. Closure exits 0 on warnings, so
# the count is asserted here rather than trusted to the exit code.
#
# Run: bash builder/check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/builder/sources.sh"

out="$("$CLOSURE" --checks_only "${COMMON_FLAGS[@]}" "${EXTERNS[@]}" \
  "${SOURCES[@]}" 2>&1)"
status=$?

echo "$out"

if [ $status -ne 0 ]; then
  echo "check: the compiler rejected the source" >&2
  exit 1
fi

# A clean run prints NOTHING at all -- the summary line only appears once there
# is something to summarise -- so the assertion is on diagnostics, not on a
# count that may never be printed.
if grep -qE ' (ERROR|WARNING) - ' <<<"$out"; then
  echo "check: expected a clean run -- 0 errors and 0 warnings" >&2
  exit 1
fi

echo "check: clean -- 0 errors, 0 warnings across ${#SOURCES[@]} files"
