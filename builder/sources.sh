# The source list and the compiler flags, shared by check.sh and compile.sh.
#
# ORDER IS index.html's ORDER and has to stay that way: these are plain scripts
# with no dependency declarations, so --dependency_mode NONE concatenates them
# exactly as listed and each one expects the ones above it to have run.

SRC_DIR="$ROOT/src"

SOURCES=(
  "$SRC_DIR/paper.js"
  "$SRC_DIR/rng.js"
  "$SRC_DIR/presets.js"
  "$SRC_DIR/graph.js"
  "$SRC_DIR/maze.js"
  "$SRC_DIR/escher.js"
  "$SRC_DIR/render.js"
  "$SRC_DIR/terrain.js"
  "$SRC_DIR/surface.js"
  "$SRC_DIR/render-iso.js"
  "$SRC_DIR/hex.js"
  "$SRC_DIR/lattice.js"
  "$SRC_DIR/render-hex.js"
  "$SRC_DIR/render-round.js"
  "$SRC_DIR/render-engraved.js"
  "$SRC_DIR/theta.js"
  "$SRC_DIR/render-theta.js"
  "$SRC_DIR/app.js"
)

EXTERNS=(
  --externs "$ROOT/build/externs/node.js"
  --externs "$ROOT/build/externs/mm-types.js"
)

# ES2020 in, so globalThis and the typed-array methods are known; ES5 out, so a
# compiled bundle loads over file:// in anything.
COMMON_FLAGS=(
  --compilation_level ADVANCED
  --language_in ECMASCRIPT_2020
  --language_out ECMASCRIPT5_STRICT
  --dependency_mode NONE
  --warning_level VERBOSE
  # Always print the summary, so a clean run still reports how much of the
  # source the compiler managed to type.
  --summary_detail_level 3
)

CLOSURE="${CLOSURE:-google-closure-compiler}"
