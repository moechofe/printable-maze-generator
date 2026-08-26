#!/usr/bin/env bash
#
# Compile src/ into one minified bundle, plus a dist/ page that loads it.
#
# THIS IS NOT A BUILD STEP FOR THE APP. The repo's own index.html still lists
# the eighteen scripts and still works by double-clicking it over file://; what
# lands in dist/ is an extra artifact for anyone who wants one file. dist/
# index.html is GENERATED from the real one so the markup has a single source.
#
# Run: bash build/compile.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/build/sources.sh"

DIST="$ROOT/dist"
mkdir -p "$DIST"

"$CLOSURE" "${COMMON_FLAGS[@]}" "${EXTERNS[@]}" \
  --isolation_mode IIFE \
  --create_source_map "$DIST/script.js.map" \
  --js_output_file "$DIST/script.js" \
  "${SOURCES[@]}"

cp "$ROOT/styles.css" "$DIST/styles.css"

# Replace the run of <script src="src/..."> tags with the one bundle, keeping
# every other byte of the markup as it is.
node - "$ROOT/index.html" "$DIST/index.html" <<'NODE'
var fs = require('fs');
var html = fs.readFileSync(process.argv[2], 'utf8');
var tags = /(?:[ \t]*<script src="src\/[^"]+"><\/script>\n)+/;
if (!tags.test(html)) {
  console.error('compile: no src/ script tags found in index.html');
  process.exit(1);
}
fs.writeFileSync(process.argv[3],
  html.replace(tags, '<script src="script.js"></script>\n'));
NODE

printf 'compile: %s (%s bytes)\n' "dist/script.js" \
  "$(wc -c <"$DIST/script.js" | tr -d ' ')"
