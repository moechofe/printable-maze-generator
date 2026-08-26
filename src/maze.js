/* Flat rectangular grid: the wall bitmask, and the bridge to src/graph.js.
 *
 * THE MAZE IS CARVED BY src/graph.js, NOT HERE. This module used to carry its
 * own depth-first carver and its own braid over the bitmask, which meant the
 * flat grid was the one grid in the app that could not use the shared carvers
 * -- so the carver control could not reach the Escher style. grid() below
 * exposes the grid as the same {to, key} adjacency the hex and isometric
 * surfaces hand over, generate() runs the shared carve and braid across it, and
 * only then is the result folded back into the bitmask.
 *
 * The bitmask stays because it is what the drawing needs: src/render.js and
 * toSolidGrid() below both want "which of my four walls are up" per cell, which
 * a set of open edge keys answers slowly and awkwardly.
 *
 * Finishability is structural, not lucky: every carver in src/graph.js produces
 * a spanning tree over every cell, so a path from any cell to any other always
 * exists. Braiding only ever REMOVES walls, which can add routes but can never
 * disconnect the tree, so the guarantee survives it.
 *
 * solve() is still run on every generation as an assertion (see app.js).
 */
(function (global) {
  'use strict';

  var N = 1, E = 2, S = 4, W = 8;

  // Index matches the bit order above; `opp` is the same wall seen from the
  // neighbouring cell, which must be cleared in lock-step.
  var DIRS = [
    { bit: N, dx: 0, dy: -1, opp: S },
    { bit: E, dx: 1, dy: 0, opp: W },
    { bit: S, dx: 0, dy: 1, opp: N },
    { bit: W, dx: -1, dy: 0, opp: E }
  ];

  /* The grid as a graph, in the shape src/graph.js carves.
   *
   * A wall is named by the pair of cells it separates, smaller index first, so
   * both cells produce the same key -- the same trick src/hex.js and
   * src/surface.js use with shared edges. Only forward neighbours (E and S) are
   * walked, with both directions registered at once, so each wall is created
   * exactly once and the adjacency lists come out in a fixed order.
   *
   * Order is load-bearing: the carvers pick from these lists, so reordering
   * them changes every maze. */
  function edgeKeyFor(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function grid(w, h) {
    var n = w * h, adj = [], i;
    for (i = 0; i < n; i++) adj.push([]);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        i = y * w + x;
        if (x + 1 < w) {
          var e = i + 1, ke = edgeKeyFor(i, e);
          adj[i].push({ to: e, key: ke });
          adj[e].push({ to: i, key: ke });
        }
        if (y + 1 < h) {
          var sIdx = i + w, ks = edgeKeyFor(i, sIdx);
          adj[i].push({ to: sIdx, key: ks });
          adj[sIdx].push({ to: i, key: ks });
        }
      }
    }
    return { width: w, height: h, adj: adj, edgeKey: edgeKeyFor };
  }

  /* Fold a set of open edge keys back into the per-cell wall bitmask.
   *
   * Every wall is cleared from BOTH sides in lock-step -- a cell whose east
   * wall is down facing a neighbour that still believes its west wall is up
   * would draw one wall and solve through it. */
  function wallsFromOpen(w, h, open) {
    var walls = new Uint8Array(w * h);
    walls.fill(N | E | S | W);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (x + 1 < w && open[edgeKeyFor(i, i + 1)]) {
          walls[i] &= ~E;
          walls[i + 1] &= ~W;
        }
        if (y + 1 < h && open[edgeKeyFor(i, i + w)]) {
          walls[i] &= ~S;
          walls[i + w] &= ~N;
        }
      }
    }
    return walls;
  }

  /* Resolved on first use, not at load time: under <script> tags graph.js is
   * loaded first so MM.graph is already there, but resolving lazily means a
   * reordered index.html fails loudly at generation rather than silently
   * capturing undefined at parse time. */
  var graphApi = null;
  function GRAPH() {
    if (!graphApi) {
      graphApi = (typeof module !== 'undefined' && module.exports)
        ? require('./graph.js') : global.MM.graph;
    }
    return graphApi;
  }

  function generate(opts) {
    var w = opts.width, h = opts.height, rng = opts.rng;
    var g = grid(w, h);
    var carved = GRAPH().carveBy(opts.carver, g.adj, rng, 0, opts.carverOpts);
    if (opts.braid > 0) GRAPH().braid(g.adj, carved.open, rng, opts.braid);

    return {
      width: w,
      height: h,
      walls: wallsFromOpen(w, h, carved.open),
      adj: g.adj,
      open: carved.open,
      reached: carved.reached,
      start: 0,            // top-left cell
      end: w * h - 1       // bottom-right cell
    };
  }

  // Breadth-first search, so the returned route is also the shortest one.
  function solve(maze) {
    var w = maze.width, h = maze.height, walls = maze.walls;
    var prev = new Int32Array(w * h).fill(-1);
    var seen = new Uint8Array(w * h);
    var queue = [maze.start], head = 0;
    seen[maze.start] = 1;

    while (head < queue.length) {
      var cur = queue[head++];
      if (cur === maze.end) break;
      var cx = cur % w, cy = (cur / w) | 0;
      for (var d = 0; d < 4; d++) {
        if (walls[cur] & DIRS[d].bit) continue;
        var nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        queue.push(ni);
      }
    }

    if (!seen[maze.end]) return null;

    var path = [], c = maze.end;
    while (c !== -1) { path.push(c); c = prev[c]; }
    return path.reverse();
  }

  // How many cells the start can reach; used by the test to prove braiding
  // never strands a region.
  function reachableCount(maze) {
    var w = maze.width, h = maze.height, walls = maze.walls;
    var seen = new Uint8Array(w * h);
    var queue = [maze.start], head = 0, count = 0;
    seen[maze.start] = 1;
    while (head < queue.length) {
      var cur = queue[head++];
      count++;
      var cx = cur % w, cy = (cur / w) | 0;
      for (var d = 0; d < 4; d++) {
        if (walls[cur] & DIRS[d].bit) continue;
        var nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    return count;
  }

  /* Expand the cell grid into a (2w+1) x (2h+1) grid of solid/open units, so
   * walls become drawable squares rather than zero-width lines. Even indices
   * are wall or pillar units, odd indices are cell units. */
  function toSolidGrid(maze) {
    var w = maze.width, h = maze.height;
    var gw = 2 * w + 1, gh = 2 * h + 1;
    var solid = new Uint8Array(gw * gh);
    solid.fill(1);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var m = maze.walls[y * w + x];
        solid[(2 * y + 1) * gw + (2 * x + 1)] = 0;
        if (!(m & N)) solid[(2 * y) * gw + (2 * x + 1)] = 0;
        if (!(m & S)) solid[(2 * y + 2) * gw + (2 * x + 1)] = 0;
        if (!(m & W)) solid[(2 * y + 1) * gw + (2 * x)] = 0;
        if (!(m & E)) solid[(2 * y + 1) * gw + (2 * x + 2)] = 0;
      }
    }

    // Entry notch above the start cell, exit notch below the end cell.
    solid[1] = 0;
    solid[(gh - 1) * gw + (gw - 2)] = 0;

    return { gw: gw, gh: gh, solid: solid };
  }

  function serialize(maze) {
    return maze.width + 'x' + maze.height + ':' +
      Array.prototype.join.call(maze.walls, '');
  }

  var api = {
    N: N, E: E, S: S, W: W,
    DIRS: DIRS,
    grid: grid,
    wallsFromOpen: wallsFromOpen,
    edgeKey: edgeKeyFor,
    generate: generate,
    solve: solve,
    reachableCount: reachableCount,
    toSolidGrid: toSolidGrid,
    serialize: serialize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).maze = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
