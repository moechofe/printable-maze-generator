/* Machine-checkable proof of what the app promises, for all three renderers.
 *
 *   FINISHABLE   every maze, every preset, every seed, has a start-to-end path
 *                whose every step is a real open connection.
 *   REPRODUCIBLE a seed yields byte-identical geometry every time.
 *   HONEST       the isometric surface is fully connected and nothing on it is
 *                hidden from the viewer.
 *   PRINTABLE    every style at every difficulty fills an A4 sheet without
 *                running off it -- checked against the viewBox of the actual
 *                rendered SVG, not against the preset numbers, so it catches a
 *                renderer changing its margins as well as a bad preset.
 *   COMPLETE     the rounded honeycomb draws every wall exactly once, closes its
 *                own border except at the two notches, and leaves a corridor of
 *                at least pitch minus wall thickness everywhere.
 *   WIRED        every style the app offers is dispatched to a builder that
 *                exists, and has presets to build from.
 *
 * Run:  node test/verify.js  [iterationsPerPreset]
 */
'use strict';

var RNG = require('../src/rng.js');
var MAZE = require('../src/maze.js');
var ESCHER = require('../src/escher.js');
var RENDER = require('../src/render.js');
var TERRAIN = require('../src/terrain.js');
var SURFACE = require('../src/surface.js');
var GRAPH = require('../src/graph.js');
var RENDER_ISO = require('../src/render-iso.js');
var HEX = require('../src/hex.js');
var RENDER_HEX = require('../src/render-hex.js');
var RENDER_ROUND = require('../src/render-round.js');
var LATTICE = require('../src/lattice.js');
var RENDER_ENGRAVED = require('../src/render-engraved.js');
var THETA = require('../src/theta.js');
var RENDER_THETA = require('../src/render-theta.js');
var PAPER = require('../src/paper.js');

// Texture only; none of these changes any drawing's size. Every style is run
// against every one of them.
var CARVERS = ['dfs', 'kruskal', 'wilson', 'grow'];

var PRESETS = require('../src/presets.js');

var ITER = parseInt(process.argv[2], 10) || 250;
var failures = [];
var checks = 0;

function fail(msg) { failures.push(msg); }
function check(cond, msg) { checks++; if (!cond) fail(msg); }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

/* Both builders mirror the RNG consumption order in src/app.js exactly. If they
 * drift, the test validates a different maze than the browser draws. */
function buildEscher(seed, preset, carver) {
  var cfg = preset.escher;
  var rng = RNG.makeRng(seed);
  var maze = MAZE.generate({
    width: cfg.w, height: cfg.h, rng: rng, braid: cfg.braid,
    carver: carver, carverOpts: { bias: 0.7 }
  });
  var grid = MAZE.toSolidGrid(maze);
  var regions = ESCHER.buildRegions(grid, rng, {});
  return { maze: maze, grid: grid, regions: regions };
}

function buildTheta(seed, preset, carver) {
  var cfg = preset.theta;
  var rng = RNG.makeRng(seed);
  var grid = THETA.build(cfg.rings);
  var carved = GRAPH.carveBy(carver, grid.adj, rng, grid.start, { bias: 0.7 });
  GRAPH.braid(grid.adj, carved.open, rng, cfg.braid);
  return { grid: grid, open: carved.open, reached: carved.reached, cfg: cfg };
}

function buildEngraved(seed, preset, carver) {
  var cfg = preset.engrave;
  var maze = MAZE.generate({
    width: cfg.w, height: cfg.h, rng: RNG.makeRng(seed), braid: cfg.braid,
    carver: carver, carverOpts: { bias: 0.7 }
  });
  return { maze: maze, grid: MAZE.toSolidGrid(maze), cfg: cfg };
}

function buildHexRound(seed, preset, carver) {
  var cfg = preset.hexround;
  var rng = RNG.makeRng(seed);
  var grid = HEX.grid(cfg.cols, cfg.rows);
  var carved = GRAPH.carveBy(carver, grid.adj, rng, grid.start, { bias: 0.7 });
  GRAPH.braid(grid.adj, carved.open, rng, cfg.braid);
  return { grid: grid, open: carved.open, reached: carved.reached, cfg: cfg };
}

function buildHex(seed, preset, carver) {
  var cfg = preset.hex;
  var rng = RNG.makeRng(seed);
  var grid = HEX.grid(cfg.cols, cfg.rows);
  var carved = GRAPH.carveBy(carver, grid.adj, rng, grid.start, { bias: 0.7 });
  GRAPH.braid(grid.adj, carved.open, rng, cfg.braid);
  return { grid: grid, open: carved.open, reached: carved.reached };
}

function buildIso(seed, preset, carver) {
  var cfg = preset.iso;
  var rng = RNG.makeRng(seed);
  var frame = TERRAIN.frame(cfg.halfWidth, cfg.depth);
  var H = TERRAIN.build({
    frame: frame, terraces: cfg.terraces, maxRise: cfg.maxRise,
    totalRise: cfg.totalRise, rng: rng
  });
  var surface = SURFACE.build(H, frame);
  var start = SURFACE.startFace(surface);
  var end = SURFACE.endFace(surface);
  var carved = GRAPH.carveBy(carver, surface.adj, rng, start, { bias: 0.7 });
  GRAPH.braid(surface.adj, carved.open, rng, cfg.braid);
  return {
    frame: frame, H: H, surface: surface,
    open: carved.open, reached: carved.reached, start: start, end: end
  };
}

console.log('\n  ESCHER BLOCKS');

Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key], cfg = preset.escher;
  var cells = cfg.w * cfg.h;
  var shortest = Infinity, longest = 0;

  for (var i = 0; i < ITER; i++) {
    var seed = RNG.randomSeed();
    var built = buildEscher(seed, preset);
    var path = MAZE.solve(built.maze);

    check(path !== null, key + ' seed ' + seed + ': no start-to-end path');
    if (!path) continue;

    check(path[0] === built.maze.start,
      key + ' seed ' + seed + ': path does not begin at the top-left cell');
    check(path[path.length - 1] === built.maze.end,
      key + ' seed ' + seed + ': path does not end at the bottom-right cell');
    check(MAZE.reachableCount(built.maze) === cells,
      key + ' seed ' + seed + ': braiding stranded part of the grid');

    for (var s = 1; s < path.length; s++) {
      var a = path[s - 1], b = path[s];
      var ax = a % cfg.w, ay = (a / cfg.w) | 0;
      var bx = b % cfg.w, by = (b / cfg.w) | 0;
      if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) {
        fail(key + ' seed ' + seed + ': path step ' + s + ' teleports');
        break;
      }
    }

    shortest = Math.min(shortest, path.length);
    longest = Math.max(longest, path.length);
  }

  console.log('  ' + pad(key, 8) + pad(cfg.w + 'x' + cfg.h, 9) +
    ITER + ' seeds solvable   path ' + shortest + '-' + longest + ' cells');
});

/* Two facing walls at a patch border both overhang into the same corridor. The
 * worst case must still leave a gap that reads as open. */
var maxOverhang = 0.55 /* trait depth cap */ * RENDER.Uw * Math.cos(Math.PI / 4 - 0.28);
var narrowest = RENDER.Uc - 2 * maxOverhang;
check(narrowest > 0.35,
  'worst-case corridor is ' + narrowest.toFixed(3) + ' units, too narrow to read as open');
console.log('  ' + pad('corridors', 17) + 'worst case ' + narrowest.toFixed(2) +
  ' of ' + RENDER.Uc + ' units stays open');

console.log('\n  ISOMETRIC TERRAIN');

Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key];
  var iter = Math.max(12, Math.round(ITER / 6));   // heavier per iteration
  var shortest = Infinity, longest = 0, faceTotal = 0, sideTotal = 0;

  for (var i = 0; i < iter; i++) {
    var seed = RNG.randomSeed();
    var b = buildIso(seed, preset);
    var n = b.frame.n, mask = b.frame.mask;

    // Height must never rise toward the camera. Everything below depends on it.
    var rise = TERRAIN.findRise(b.H, n, mask);
    check(!rise, key + ' seed ' + seed + ': terrain rises toward the camera at ' +
      JSON.stringify(rise));

    // ...which in turn means nothing on the surface is hidden.
    var occ = TERRAIN.findOcclusion(b.H, n, mask);
    check(!occ, key + ' seed ' + seed + ': face occluded at ' + JSON.stringify(occ));

    // The skin must be one piece, or the maze would be carved over a torn
    // surface with corridors dead-ending into invisible walls.
    check(GRAPH.componentSize(b.surface.adj, b.start) === b.surface.faces.length,
      key + ' seed ' + seed + ': surface graph is not connected');
    check(b.reached === b.surface.faces.length,
      key + ' seed ' + seed + ': carve reached only ' + b.reached +
      ' of ' + b.surface.faces.length + ' faces');

    check(b.start >= 0 && b.end >= 0 && b.start !== b.end,
      key + ' seed ' + seed + ': start/finish faces missing');

    var path = GRAPH.solve(b.surface.adj, b.open, b.start, b.end);
    check(path !== null, key + ' seed ' + seed + ': no route across the surface');
    if (!path) continue;

    check(path[0] === b.start && path[path.length - 1] === b.end,
      key + ' seed ' + seed + ': route does not run start to finish');

    // Every step must be a genuinely open connection between adjacent faces.
    for (var s = 1; s < path.length; s++) {
      var list = b.surface.adj[path[s - 1]], link = null;
      for (var k = 0; k < list.length; k++) {
        if (list[k].to === path[s]) { link = list[k]; break; }
      }
      if (!link || !b.open[link.key]) {
        fail(key + ' seed ' + seed + ': route step ' + s + ' crosses a wall');
        break;
      }
    }

    faceTotal += b.surface.faces.length;
    sideTotal += b.surface.faces.filter(function (f) { return f.type !== 0; }).length;
    shortest = Math.min(shortest, path.length);
    longest = Math.max(longest, path.length);
  }

  console.log('  ' + pad(key, 8) + pad(Math.round(faceTotal / iter) + ' faces', 12) +
    pad(Math.round(100 * sideTotal / faceTotal) + '% cliff', 10) +
    iter + ' seeds solvable   path ' + shortest + '-' + longest);
});

console.log('\n  HEXAGONAL');

Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key], cfg = preset.hex;
  var cells = cfg.cols * cfg.rows;
  var shortest = Infinity, longest = 0, junctions = 0;

  for (var i = 0; i < ITER; i++) {
    var seed = RNG.randomSeed();
    var b = buildHex(seed, preset);

    // The honeycomb is connected by construction, so a short carve means the
    // adjacency table is wrong, not that this seed was unlucky.
    check(GRAPH.componentSize(b.grid.adj, b.grid.start) === cells,
      key + ' seed ' + seed + ': honeycomb graph is not connected');
    check(b.reached === cells,
      key + ' seed ' + seed + ': carve reached only ' + b.reached + ' of ' + cells);

    var path = GRAPH.solve(b.grid.adj, b.open, b.grid.start, b.grid.end);
    check(path !== null, key + ' seed ' + seed + ': no route across the honeycomb');
    if (!path) continue;

    check(path[0] === b.grid.start && path[path.length - 1] === b.grid.end,
      key + ' seed ' + seed + ': route does not run start to finish');

    // Every step must be a genuinely open connection between adjacent hexes.
    for (var st = 1; st < path.length; st++) {
      var list = b.grid.adj[path[st - 1]], link = null;
      for (var k = 0; k < list.length; k++) {
        if (list[k].to === path[st]) { link = list[k]; break; }
      }
      if (!link || !b.open[link.key]) {
        fail(key + ' seed ' + seed + ': route step ' + st + ' crosses a wall');
        break;
      }
    }

    // Both notches are cut in the perimeter, where no carve can reach them.
    check(b.grid.edgeCells[b.grid.entryEdge] === 1 &&
          b.grid.edgeCells[b.grid.exitEdge] === 1,
      key + ' seed ' + seed + ': a notch edge is not on the perimeter');
    check(!b.open[b.grid.entryEdge] && !b.open[b.grid.exitEdge],
      key + ' seed ' + seed + ': the carver opened a notch edge');

    for (var c = 0; c < cells; c++) {
      if (GRAPH.openDegree(b.grid.adj, b.open, c) >= 3) junctions++;
    }

    shortest = Math.min(shortest, path.length);
    longest = Math.max(longest, path.length);
  }

  console.log('  ' + pad(key, 8) + pad(cfg.cols + 'x' + cfg.rows, 9) +
    pad(Math.round(100 * junctions / (cells * ITER)) + '% junctions', 15) +
    ITER + ' seeds solvable   path ' + shortest + '-' + longest + ' hexes');
});

/* Every edge of the honeycomb is either shared by two cells -- and so carvable
 * -- or held by one and permanently a wall. A third case would mean the
 * renderer could not tell a passage from a border. */
Object.keys(PRESETS).forEach(function (key) {
  var g = HEX.grid(PRESETS[key].hex.cols, PRESETS[key].hex.rows);
  var links = 0, perimeter = 0, shared = 0;
  g.adj.forEach(function (l) { links += l.length; });
  g.edgeOrder.forEach(function (ek) {
    if (g.edgeCells[ek] === 1) perimeter++;
    else if (g.edgeCells[ek] === 2) shared++;
    else fail(key + ': edge held by ' + g.edgeCells[ek] + ' hexes');
  });
  check(links / 2 === shared,
    key + ': ' + (links / 2) + ' adjacencies for ' + shared + ' shared edges');
  check(perimeter + shared === g.edgeOrder.length, key + ': edges unaccounted for');
});
console.log('  ' + pad('edges', 17) +
  'every edge is a carvable wall or a permanent border, never both');

/* Shared by both rounded styles. The lattice is the same abstraction for a
 * square grid and a honeycomb, so these are the same checks. */
function latticeOf(sheet) { return LATTICE.build(sheet.entries, sheet.verts); }

function checkLattice(where, lat) {
  /* Every wall segment drawn exactly once. Twice is invisible but doubles the
   * file; not at all is a hole in the maze. */
  var paths = LATTICE.decompose(lat);
  var seen = new Uint8Array(lat.count), drawn = 0, twice = 0, strayed = 0;

  for (var q = 0; q < paths.length; q++) {
    var ids = paths[q];
    for (var r = 1; r < ids.length; r++) {
      // Consecutive points must be joined by a real segment of the lattice.
      var a = ids[r - 1], b = ids[r], found = -1;
      var inc = lat.incident[a];
      for (var k = 0; k < inc.length; k++) {
        if (LATTICE.other(lat, inc[k], a) === b) { found = inc[k]; break; }
      }
      if (found < 0) { strayed++; continue; }
      if (seen[found]) twice++;
      seen[found] = 1;
      drawn++;
    }
  }

  check(strayed === 0, where + ': a polyline step is not a lattice segment');
  check(drawn === lat.count && twice === 0,
    where + ': drew ' + drawn + ' of ' + lat.count + ' wall segments (' +
    twice + ' twice)');

  /* The wall structure must be a FOREST. Walls plus a whole border would close
   * exactly one cycle -- the border itself -- and cutting the two notches out
   * of it is what reopens that, so a cycle here means either a notch was not
   * cut or a wall was drawn that no carve could have left standing. It also
   * says every loose end is a genuine dead end of the wall structure, which is
   * what the style's lollipop stubs are. Vertices touched minus segments equals
   * the component count only when there are no cycles, so compare the two. */
  var touched = 0, comp = 0, mark = new Uint8Array(lat.verts.length);
  for (var v = 0; v < lat.verts.length; v++) if (LATTICE.degree(lat, v)) touched++;
  for (v = 0; v < lat.verts.length; v++) {
    if (!LATTICE.degree(lat, v) || mark[v]) continue;
    comp++;
    var stack = [v];
    mark[v] = 1;
    while (stack.length) {
      var cur = stack.pop(), list = lat.incident[cur];
      for (k = 0; k < list.length; k++) {
        var other = LATTICE.other(lat, list[k], cur);
        if (mark[other]) continue;
        mark[other] = 1;
        stack.push(other);
      }
    }
  }
  check(touched - lat.count === comp,
    where + ': wall structure contains a cycle (' + touched + ' vertices, ' +
    lat.count + ' segments, ' + comp + ' components)');
}

console.log('\n  ROUNDED HONEYCOMB');

Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key], cfg = preset.hexround;
  var cells = cfg.cols * cfg.rows;
  var shortest = Infinity, longest = 0, segTotal = 0, strokeTotal = 0;

  for (var i = 0; i < ITER; i++) {
    var seed = RNG.randomSeed();
    var b = buildHexRound(seed, preset, 'kruskal');

    check(b.reached === cells,
      key + ' seed ' + seed + ': carve reached only ' + b.reached + ' of ' + cells);

    var path = GRAPH.solve(b.grid.adj, b.open, b.grid.start, b.grid.end);
    check(path !== null, key + ' seed ' + seed + ': no route across the honeycomb');
    if (!path) continue;

    for (var st = 1; st < path.length; st++) {
      var list = b.grid.adj[path[st - 1]], link = null;
      for (var k = 0; k < list.length; k++) {
        if (list[k].to === path[st]) { link = list[k]; break; }
      }
      if (!link || !b.open[link.key]) {
        fail(key + ' seed ' + seed + ': route step ' + st + ' crosses a wall');
        break;
      }
    }

    /* THE HONEYCOMB MUST NOT LEAK. The style used to leave its whole perimeter
     * undrawn and let the edge of the sheet stand in for it, which put a route
     * round the outside of the maze there for the taking. So every edge held by
     * a single cell has to be stroked, except the two notches, which have to be
     * perimeter edges themselves or they would be walls the carver could open
     * and the "gap" could land in the middle of the honeycomb. */
    var sheet = HEX.wallLattice(b.grid, b.open);
    var stroked = Object.create(null);
    for (var q = 0; q < sheet.entries.length; q++) {
      var en = sheet.entries[q];
      stroked[en.ak < en.bk ? en.ak + '|' + en.bk : en.bk + '|' + en.ak] = 1;
    }
    var leaks = 0, notches = 0;
    for (var pe = 0; pe < b.grid.edgeOrder.length; pe++) {
      var pk = b.grid.edgeOrder[pe];
      if (b.grid.edgeCells[pk] !== 1) continue;
      var pv = b.grid.edgeVerts[pk];
      var drawn = !!stroked[pv[0] < pv[1] ? pv[0] + '|' + pv[1] : pv[1] + '|' + pv[0]];
      if (pk === b.grid.entryEdge || pk === b.grid.exitEdge) {
        notches++;
        if (drawn) leaks++;
      } else if (!drawn) {
        leaks++;
      }
    }
    check(notches === 2, key + ' seed ' + seed + ': ' + notches +
      ' of the two notches are perimeter edges');
    check(leaks === 0, key + ' seed ' + seed + ': ' + leaks +
      ' border edges wrong -- the honeycomb can be left without solving it');

    // The same lattice checks as the square grid, on 120-degree vertices.
    var lat = latticeOf(sheet);
    checkLattice(key + ' seed ' + seed, lat);

    segTotal += lat.count;
    strokeTotal += LATTICE.decompose(lat).length;
    shortest = Math.min(shortest, path.length);
    longest = Math.max(longest, path.length);
  }

  console.log('  ' + pad(key, 8) + pad(cfg.cols + 'x' + cfg.rows, 9) +
    pad(Math.round(segTotal / strokeTotal * 10) / 10 + ' segs/stroke', 17) +
    ITER + ' seeds solvable   path ' + shortest + '-' + longest + ' hexes');
});

/* CORRIDOR CLEARANCE, MEASURED RATHER THAN ARGUED.
 *
 * The bound is pitch minus wall thickness and does not depend on the maze: two
 * walls a pitch apart each give up half a stroke across the corridor, and a
 * stub's end cap projects the same half stroke along it. Filleting cannot make
 * it worse -- it opens the inside of a turn rather than pinching it.
 *
 * It used to be checked as algebra, back when the only grid this renderer drew
 * was square and every turn was a right angle. That stopped being possible: the
 * honeycomb turns through 60 degrees, and a future grid will turn through
 * something else again. So sample the geometry the renderer actually emits --
 * every point along every stroke's centre line -- and find the closest approach
 * between two strokes that are not the same wall. That is the corridor,
 * whatever the angles.
 *
 * Sampling the CENTRE LINES and subtracting a full wall thickness is the same
 * bound as measuring ink to ink, and avoids having to offset the outlines. */
(function () {
  function narrowest(sheet, wall) {
    var lat = latticeOf(sheet);
    var pts = [];
    for (var s = 0; s < lat.count; s++) {
      var a = lat.verts[lat.segs[s][0]], b = lat.verts[lat.segs[s][1]];
      for (var t = 0; t <= 4; t++) {
        pts.push([a[0] + (b[0] - a[0]) * t / 4, a[1] + (b[1] - a[1]) * t / 4, s]);
      }
    }
    // Bucket by unit cell so this stays near-linear rather than quadratic.
    var buckets = Object.create(null);
    function keyOf(x, y) { return Math.floor(x) + ',' + Math.floor(y); }
    for (var i = 0; i < pts.length; i++) {
      var kk = keyOf(pts[i][0], pts[i][1]);
      (buckets[kk] || (buckets[kk] = [])).push(pts[i]);
    }

    var best = Infinity;
    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var list = buckets[keyOf(p[0] + dx, p[1] + dy)];
          if (!list) continue;
          for (var j = 0; j < list.length; j++) {
            var q = list[j];
            if (q[2] === p[2]) continue;               // the same wall
            // Segments that share a vertex meet on purpose; skip the join.
            var sa = lat.segs[p[2]], sb = lat.segs[q[2]];
            if (sa[0] === sb[0] || sa[0] === sb[1] ||
                sa[1] === sb[0] || sa[1] === sb[1]) continue;
            var d = Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) +
                              (p[1] - q[1]) * (p[1] - q[1]));
            if (d < best) best = d;
          }
        }
      }
    }
    return best - wall;
  }

  var g = HEX.grid(17, 26), rng = RNG.makeRng('CLEAR');
  var carved = GRAPH.carveBy('kruskal', g.adj, rng, g.start);
  GRAPH.braid(g.adj, carved.open, rng, 0.1);
  var hx = HEX.wallLattice(g, carved.open);
  var hxClear = narrowest(hx, hx.wall);
  check(hxClear > 1 - hx.wall - 1e-6 && hxClear < 1 - hx.wall + 1e-6,
    'honeycomb corridor measured ' + hxClear.toFixed(4) + ', expected ' +
    (1 - hx.wall).toFixed(4));

  check(hx.fillet <= 0.5,
    'the fillet radius exceeds half a pitch, so corners could overrun');

  console.log('  ' + pad('clearance', 17) + 'measured ' + hxClear.toFixed(2) +
    ' of a pitch on the honeycomb, exactly pitch minus wall');
})();

console.log('\n  ENGRAVED');

Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key], cfg = preset.engrave;
  var cells = cfg.w * cfg.h;
  var shortest = Infinity, longest = 0, loopTotal = 0, segTotal = 0;

  for (var i = 0; i < ITER; i++) {
    var seed = RNG.randomSeed();
    var b = buildEngraved(seed, preset, 'dfs');
    var path = MAZE.solve(b.maze);

    check(path !== null, key + ' seed ' + seed + ': no start-to-end path');
    if (!path) continue;
    check(MAZE.reachableCount(b.maze) === cells,
      key + ' seed ' + seed + ': braiding stranded part of the grid');

    /* THE OUTLINE MUST BE CLOSED LOOPS. It is the boundary of a filled region,
     * so every vertex on it has EVEN degree -- a boundary cannot dead-end in
     * mid air. That in turn is what lets each walk return to where it started,
     * which is what makes the path fillable and so usable as a clip. An odd
     * vertex here would mean an open contour, a broken clip, and hatching
     * spilling across the corridors. */
    var sheet = RENDER_ENGRAVED.outlineLattice(b.grid);
    var lat = LATTICE.build(sheet.entries, sheet.verts);

    var odd = 0;
    for (var v = 0; v < lat.verts.length; v++) {
      if (LATTICE.degree(lat, v) % 2) odd++;
    }
    check(odd === 0,
      key + ' seed ' + seed + ': ' + odd + ' odd vertices on the wall outline');

    var loops = LATTICE.decompose(lat), openLoops = 0, drawn = 0;
    for (var q = 0; q < loops.length; q++) {
      if (loops[q][0] !== loops[q][loops[q].length - 1]) openLoops++;
      drawn += loops[q].length - 1;
    }
    check(openLoops === 0,
      key + ' seed ' + seed + ': ' + openLoops + ' contours did not close');
    check(drawn === lat.count,
      key + ' seed ' + seed + ': traced ' + drawn + ' of ' + lat.count +
      ' outline segments');

    loopTotal += loops.length;
    segTotal += lat.count;
    shortest = Math.min(shortest, path.length);
    longest = Math.max(longest, path.length);
  }

  console.log('  ' + pad(key, 8) + pad(cfg.w + 'x' + cfg.h, 9) +
    pad(Math.round(loopTotal / ITER) + ' contours', 14) +
    ITER + ' seeds solvable   path ' + shortest + '-' + longest + ' cells');
});

console.log('\n  THETA');

Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key], cfg = preset.theta;
  var shortest = Infinity, longest = 0, cells = 0;

  /* THE WIDTH BAND IS THE LAYOUT'S WHOLE CORRECTNESS ARGUMENT. A ring keeps its
   * parent's cell count or doubles it, which is the only ratio that keeps every
   * cell aligned with the ones outside it -- and doubling is enough to hold
   * every cell's arc width inside a factor of two. Below the band cells are too
   * cramped to draw a wall in; at the top of it they should already have been
   * halved. */
  var counts = THETA.ringCounts(cfg.rings);
  for (var r = 1; r < cfg.rings; r++) {
    var width = THETA.TAU * r / counts[r];
    check(width >= 1 && width < 2,
      key + ': ring ' + r + ' has cells ' + width.toFixed(3) +
      ' wide, outside the [1, 2) band');
    /* Ring 1 is exempt: the hub is a single cell, so ring 1 doubles out of it
     * as many times as it takes to get inside the band, and every one of its
     * cells has that same hub as its parent. From ring 2 on, kept-or-doubled
     * is what keeps each cell aligned with the one or two outside it. */
    check(r === 1 || counts[r] === counts[r - 1] || counts[r] === 2 * counts[r - 1],
      key + ': ring ' + r + ' is neither its parent kept nor doubled');
  }

  for (var i = 0; i < ITER; i++) {
    var seed = RNG.randomSeed();
    var b = buildTheta(seed, preset, CARVERS[i % CARVERS.length]);
    cells = b.grid.cells.length;

    check(b.reached === cells,
      key + ' seed ' + seed + ': carve reached ' + b.reached + ' of ' + cells);

    // The rim is held by one cell, so no carve can ever open it.
    for (var q = 0; q < b.grid.rim.length; q++) {
      check(!b.open[b.grid.rim[q]],
        key + ' seed ' + seed + ': the carver opened the outer rim');
    }

    var path = GRAPH.solve(b.grid.adj, b.open, b.grid.start, b.grid.end);
    check(path !== null, key + ' seed ' + seed + ': no route from hub to rim');
    if (!path) continue;
    check(path[0] === 0, key + ' seed ' + seed + ': the route does not start at the hub');

    for (var st = 1; st < path.length; st++) {
      var list = b.grid.adj[path[st - 1]], link = null;
      for (var z = 0; z < list.length; z++) {
        if (list[z].to === path[st]) { link = list[z]; break; }
      }
      if (!link || !b.open[link.key]) {
        fail(key + ' seed ' + seed + ': route step ' + st + ' crosses a wall');
        break;
      }
    }

    shortest = Math.min(shortest, path.length);
    longest = Math.max(longest, path.length);
  }

  var f = RENDER_THETA.fit(cfg.rings);
  console.log('  ' + pad(key, 8) + pad(cfg.rings + ' rings', 10) +
    pad(cells + ' cells', 12) + pad('stretch ' + f.k.toFixed(2), 14) +
    ITER + ' seeds solvable   path ' + shortest + '-' + longest);
});

console.log('\n  SHARED');

// ----------------------------------------------------------- deterministic
for (var d = 0; d < 32; d++) {
  var seed = RNG.randomSeed();
  var keys = Object.keys(PRESETS);
  var preset = PRESETS[keys[d % keys.length]];

  var carver = CARVERS[d % CARVERS.length];
  var e1 = buildEscher(seed, preset, carver), e2 = buildEscher(seed, preset, carver);
  check(MAZE.serialize(e1.maze) === MAZE.serialize(e2.maze),
    'seed ' + seed + ': escher maze not reproducible');
  check(ESCHER.signature(e1.regions) === ESCHER.signature(e2.regions),
    'seed ' + seed + ': escher region map not reproducible');

  var i1 = buildIso(seed, preset, carver), i2 = buildIso(seed, preset, carver);
  check(TERRAIN.serialize(i1.H) === TERRAIN.serialize(i2.H),
    'seed ' + seed + ': terrain not reproducible');
  check(SURFACE.signature(i1.surface) === SURFACE.signature(i2.surface),
    'seed ' + seed + ': surface not reproducible');
  check(Object.keys(i1.open).sort().join('|') === Object.keys(i2.open).sort().join('|'),
    'seed ' + seed + ': carved passages not reproducible');

  var x1 = buildHex(seed, preset, carver), x2 = buildHex(seed, preset, carver);
  check(HEX.signature(x1.grid) === HEX.signature(x2.grid),
    'seed ' + seed + ': honeycomb graph not reproducible');
  check(Object.keys(x1.open).sort().join('|') === Object.keys(x2.open).sort().join('|'),
    'seed ' + seed + ': hex passages not reproducible');

  check(MAZE.serialize(buildEngraved(seed, preset, carver).maze) ===
        MAZE.serialize(buildEngraved(seed, preset, carver).maze),
    'seed ' + seed + ': engraved maze not reproducible');

  var y1 = buildHexRound(seed, preset, carver), y2 = buildHexRound(seed, preset, carver);
  check(Object.keys(y1.open).sort().join('|') === Object.keys(y2.open).sort().join('|'),
    'seed ' + seed + ': rounded honeycomb not reproducible');

  var t1 = buildTheta(seed, preset, carver), t2 = buildTheta(seed, preset, carver);
  check(THETA.signature(t1.grid) === THETA.signature(t2.grid),
    'seed ' + seed + ': theta grid not reproducible');
  check(Object.keys(t1.open).sort().join('|') === Object.keys(t2.open).sort().join('|'),
    'seed ' + seed + ': theta passages not reproducible');
}
console.log('  ' + pad('determinism', 17) + '32 seeds reproduce identically in all six styles');

/* Every carver must produce a SPANNING TREE on every graph the app builds --
 * that is the whole finishability argument, and it is the only thing a carver
 * is allowed to be trusted with. Reaching every node with exactly n-1 edges
 * open is the tree; anything less is a maze with an unreachable region. */
CARVERS.forEach(function (carver) {
  var line = '  ' + pad(carver, 9);

  /* Easy, because every style braids at 0.00 there. Braiding opens extra edges
   * on purpose, which would drown out the n-1 the tree itself must have. */
  ['escher', 'iso', 'hex', 'hexround', 'engrave', 'theta'
  ].forEach(function (style) {
    var preset = PRESETS.easy, seed = RNG.randomSeed(), n, edges, reached;

    if (style === 'iso') {
      var b = buildIso(seed, preset, carver);
      n = b.surface.faces.length; reached = b.reached;
      edges = Object.keys(b.open).length;
    } else if (style === 'hex' || style === 'hexround') {
      var x = (style === 'hex') ? buildHex(seed, preset, carver)
        : buildHexRound(seed, preset, carver);
      n = x.grid.cells.length; reached = x.reached;
      edges = Object.keys(x.open).length;
    } else {
      var cfg = (style === 'engrave') ? preset.engrave : preset.escher;
      var m = MAZE.generate({
        width: cfg.w, height: cfg.h, rng: RNG.makeRng(seed), braid: 0,
        carver: carver, carverOpts: { bias: 0.5 }
      });
      n = cfg.w * cfg.h; reached = m.reached;
      edges = Object.keys(m.open).length;
    }

    check(reached === n, carver + ' on ' + style + ': reached ' + reached +
      ' of ' + n + ' nodes -- not a spanning tree');
    check(edges === n - 1, carver + ' on ' + style + ': opened ' + edges +
      ' edges for ' + n + ' nodes, expected ' + (n - 1));
    line += pad(style, 10);
  });

  console.log(line + ' spanning trees, unbraided');
});

// ...and must do it the same way twice, or the seed means nothing.
CARVERS.forEach(function (carver) {
  var seed = RNG.randomSeed();
  function once() {
    return MAZE.serialize(MAZE.generate({
      width: 21, height: 26, rng: RNG.makeRng(seed), braid: 0.1,
      carver: carver, carverOpts: { bias: 0.65 }
    }));
  }
  check(once() === once(), carver + ': not reproducible from the same seed');
});

/* Growing Tree's bias has to actually move the texture, or the slider is a lie.
 *
 * Dead-end fraction is the measure: depth-first growth produces long corridors
 * and few of them, random-frontier growth produces many short ones. Averaged,
 * because a single seed is noisy.
 *
 * NOT asserted as monotonic across the whole range, because it is not. The
 * curve climbs steeply from bias 1 down to about 0.5 and then FLATTENS, so
 * below half the slider there is little left to change -- measured at ~11% dead
 * ends at bias 1 against ~33% at bias 0.5 and at 0. The check is the gap
 * between the ends, with room to spare. */
(function () {
  var g = HEX.grid(19, 28), n = g.cells.length, N = 20;

  function deadEndFraction(bias) {
    var total = 0;
    for (var i = 0; i < N; i++) {
      var c = GRAPH.carveBy('grow', g.adj, RNG.makeRng('BIAS' + i), 0, { bias: bias });
      var d = 0;
      for (var k = 0; k < n; k++) if (GRAPH.openDegree(g.adj, c.open, k) === 1) d++;
      total += d / n;
    }
    return total / N;
  }

  var river = deadEndFraction(1), mid = deadEndFraction(0.5), blob = deadEndFraction(0);
  check(river + 0.10 < mid,
    'growth bias barely changes texture: ' + (river * 100).toFixed(1) +
    '% dead ends at bias 1 against ' + (mid * 100).toFixed(1) + '% at 0.5');
  check(river + 0.10 < blob, 'growth bias 0 is no bushier than bias 1');
  console.log('  ' + pad('growth bias', 17) + 'dead ends ' +
    (river * 100).toFixed(0) + '% at bias 1, ' + (mid * 100).toFixed(0) +
    '% at 0.5, ' + (blob * 100).toFixed(0) + '% at 0');
})();

// Different carvers must actually differ, or the control is decoration.
(function () {
  var seed = RNG.randomSeed(), sigs = {}, seenSig = Object.create(null);
  CARVERS.forEach(function (c) {
    sigs[c] = MAZE.serialize(MAZE.generate({
      width: 21, height: 26, rng: RNG.makeRng(seed), braid: 0,
      carver: c, carverOpts: { bias: 0.5 }
    }));
  });
  CARVERS.forEach(function (c) {
    check(!seenSig[sigs[c]], c + ' produced the same maze as another carver');
    seenSig[sigs[c]] = 1;
  });
  console.log('  ' + pad('carver texture', 17) +
    'every carver reproduces, and no two agree, on one seed');
})();

/* The isometric drawing is exactly as tall as the landscape climbs, so a
 * seed-dependent total rise would print one preset at many different scales. */
Object.keys(PRESETS).forEach(function (key) {
  var want = PRESETS[key].iso.totalRise;
  for (var i = 0; i < 24; i++) {
    var climb = TERRAIN.maxHeight(
      buildIso(RNG.randomSeed(), PRESETS[key], 'dfs').H);
    check(climb === want,
      key + ': terrain climbed ' + climb + ', not the fixed ' + want);
  }
});
console.log('  ' + pad('terrain height', 17) +
  'every seed climbs exactly the preset total, so the iso scale is fixed');

// Different seeds must actually differ, or determinism would be vacuous.
check(MAZE.serialize(buildEscher('AAAAAA', PRESETS.medium, 'dfs').maze) !==
      MAZE.serialize(buildEscher('BBBBBB', PRESETS.medium, 'dfs').maze),
  'different seeds produced the same escher maze');
check(TERRAIN.serialize(buildIso('AAAAAA', PRESETS.medium, 'dfs').H) !==
      TERRAIN.serialize(buildIso('BBBBBB', PRESETS.medium, 'dfs').H),
  'different seeds produced the same terrain');
check(Object.keys(buildHex('AAAAAA', PRESETS.medium, 'dfs').open).sort().join('|') !==
      Object.keys(buildHex('BBBBBB', PRESETS.medium, 'dfs').open).sort().join('|'),
  'different seeds produced the same hex maze');

// The ink stream must not disturb the maze stream.
check(TERRAIN.serialize(buildIso('INKTEST', PRESETS.medium, 'dfs').H) ===
      TERRAIN.serialize(buildIso('INKTEST', PRESETS.medium, 'dfs').H),
  'ink seeding perturbed the terrain');

// ------------------------------------------------------------- renderable
Object.keys(PRESETS).forEach(function (key) {
  var preset = PRESETS[key];

  var e = buildEscher('RENDER', preset, 'dfs');
  var svg = RENDER.toSvg({
    maze: e.maze, grid: e.grid, regions: e.regions,
    path: MAZE.solve(e.maze), light: 45, showSolution: true,
    seed: 'RENDER', label: preset.label
  });
  check(svg.indexOf('NaN') === -1 && svg.indexOf('undefined') === -1 &&
        svg.slice(0, 4) === '<svg', key + ': escher SVG malformed');

  var b = buildIso('RENDER', preset, 'dfs');
  var isoSvg = RENDER_ISO.toSvg({
    surface: b.surface, open: b.open,
    path: GRAPH.solve(b.surface.adj, b.open, b.start, b.end),
    startFace: b.start, endFace: b.end, showSolution: true,
    inkRng: RNG.makeRng('RENDER#ink'),
    seed: 'RENDER', label: preset.label, faceCount: b.surface.faces.length
  });
  check(isoSvg.indexOf('NaN') === -1 && isoSvg.indexOf('undefined') === -1 &&
        isoSvg.slice(0, 4) === '<svg', key + ': isometric SVG malformed');

  var x = buildHex('RENDER', preset, 'dfs');
  var hexSvg = RENDER_HEX.toSvg({
    grid: x.grid, open: x.open,
    path: GRAPH.solve(x.grid.adj, x.open, x.grid.start, x.grid.end),
    showSolution: true, seed: 'RENDER', label: preset.label
  });
  check(hexSvg.indexOf('NaN') === -1 && hexSvg.indexOf('undefined') === -1 &&
        hexSvg.slice(0, 4) === '<svg', key + ': hexagonal SVG malformed');

  var y = buildHexRound('RENDER', preset, 'kruskal');
  var hrSvg = RENDER_ROUND.toSvg({
    sheet: HEX.wallLattice(y.grid, y.open),
    pathXY: HEX.pathXY(y.grid, GRAPH.solve(y.grid.adj, y.open, y.grid.start, y.grid.end)),
    showSolution: true, kind: 'ROUNDED HONEYCOMB',
    seed: 'RENDER', label: preset.label, carver: 'kruskal'
  });
  check(hrSvg.indexOf('NaN') === -1 && hrSvg.indexOf('undefined') === -1 &&
        hrSvg.slice(0, 4) === '<svg', key + ': rounded honeycomb SVG malformed');

  var t2 = buildTheta('RENDER', preset, 'dfs');
  var thetaSvg = RENDER_THETA.toSvg({
    grid: t2.grid, open: t2.open,
    path: GRAPH.solve(t2.grid.adj, t2.open, t2.grid.start, t2.grid.end),
    showSolution: true, seed: 'RENDER', label: preset.label, carver: 'dfs'
  });
  check(thetaSvg.indexOf('NaN') === -1 && thetaSvg.indexOf('undefined') === -1 &&
        thetaSvg.slice(0, 4) === '<svg', key + ': theta SVG malformed');

  var g2 = buildEngraved('RENDER', preset, 'dfs');
  var engSvg = RENDER_ENGRAVED.toSvg({
    maze: g2.maze, grid: g2.grid, path: MAZE.solve(g2.maze), showSolution: true,
    seed: 'RENDER', label: preset.label, carver: 'dfs'
  });
  check(engSvg.indexOf('NaN') === -1 && engSvg.indexOf('undefined') === -1 &&
        engSvg.slice(0, 4) === '<svg', key + ': engraved SVG malformed');
});
console.log('  ' + pad('render', 17) + 'all presets emit clean SVG in all six styles');

console.log('\n  WIRING');

/* THE APP ITSELF IS NOT LOADED BY THIS TEST, and that is a hole worth closing
 * rather than living with. Everything above imports src/ modules directly and
 * builds its own pipelines, so it proves the generators and renderers work
 * while saying nothing about whether src/app.js still calls them. A style can
 * be listed in the dropdown, reach the dispatch, and land on a builder that no
 * longer exists -- and the suite stays green, because the suite has its own
 * builders.
 *
 * That is exactly how the engraved style once shipped broken: it sat between
 * two functions that were being deleted and went with them, and neither the
 * suite nor a print check noticed, since a thrown error still renders as one
 * blank A4 page.
 *
 * app.js runs in a browser and cannot be required here, so read it as TEXT and
 * check the wiring is internally consistent: every option offered is a style
 * the app knows, every style is dispatched, every builder dispatched to is
 * defined, and every style has a preset block to build from. */
(function () {
  var fs = require('fs'), path = require('path');
  var root = path.join(__dirname, '..');
  var app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  function unique(list) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) continue;
      seen[list[i]] = 1;
      out.push(list[i]);
    }
    return out;
  }

  // The style <select>, and only that one -- the panel has several.
  var selectBlock = /<select id="style">([\s\S]*?)<\/select>/.exec(html);
  check(selectBlock !== null, 'wiring: no style select found in index.html');
  var options = [];
  if (selectBlock) {
    var om = selectBlock[1].match(/value="([a-z]+)"/g) || [];
    options = om.map(function (t) { return t.slice(7, -1); });
  }

  var stylesBlock = /var STYLES = \{([\s\S]*?)\n  \};/.exec(app);
  check(stylesBlock !== null, 'wiring: no STYLES table found in src/app.js');
  var styleKeys = [];
  if (stylesBlock) {
    var sm = stylesBlock[1].match(/^\s*([a-z]+):/gm) || [];
    styleKeys = sm.map(function (t) { return t.trim().slice(0, -1); });
  }

  // Dispatch arms, plus the final fallback builder on the same expression.
  var dispatch = Object.create(null);
  var dm = /state\.style === '([a-z]+)'\)\s*\?\s*(build[A-Za-z]+)\(/g, hit;
  while ((hit = dm.exec(app)) !== null) dispatch[hit[1]] = hit[2];

  var fallback = /:\s*(build[A-Za-z]+)\(preset, carve\);/.exec(app);
  check(fallback !== null, 'wiring: no fallback builder on the dispatch chain');

  var defined = Object.create(null);
  var fm = /function (build[A-Za-z]+)\(/g;
  while ((hit = fm.exec(app)) !== null) defined[hit[1]] = 1;

  var i, key;

  // Every option the reader can pick is a style the app knows about.
  for (i = 0; i < options.length; i++) {
    check(styleKeys.indexOf(options[i]) !== -1,
      'wiring: index.html offers style "' + options[i] +
      '" that src/app.js does not list');
  }
  check(unique(options).length === options.length,
    'wiring: the style select repeats an option');
  check(options.length === styleKeys.length,
    'wiring: ' + options.length + ' options for ' + styleKeys.length +
    ' styles -- one of them is unreachable');

  // Every style reaches a builder, and every builder it reaches exists.
  var routed = 0;
  for (i = 0; i < styleKeys.length; i++) {
    key = styleKeys[i];
    var target = dispatch[key];
    if (!target) continue;                 // handled by the fallback arm
    routed++;
    check(!!defined[target],
      'wiring: style "' + key + '" dispatches to ' + target +
      '(), which src/app.js does not define');
  }
  check(routed === styleKeys.length - 1,
    'wiring: ' + routed + ' of ' + styleKeys.length +
    ' styles are dispatched, and exactly one should fall through to ' +
    (fallback ? fallback[1] : '?') + '()');
  if (fallback) {
    check(!!defined[fallback[1]],
      'wiring: the fallback builder ' + fallback[1] + '() is not defined');
  }

  // ...and every style has something to build from.
  for (i = 0; i < styleKeys.length; i++) {
    var missing = [];
    Object.keys(PRESETS).forEach(function (size) {
      if (!PRESETS[size][styleKeys[i]]) missing.push(size);
    });
    check(missing.length === 0,
      'wiring: style "' + styleKeys[i] + '" has no preset for ' +
      missing.join(', '));
  }

  /* And every element app.js reaches for still exists in the markup.
   *
   * init() looks each of these up by id and then wires listeners onto them, so
   * an id that has been removed from index.html is a TypeError before the first
   * maze is drawn -- the whole app dead, not one style. Removing a control is
   * exactly when that happens, which is why it is checked here rather than
   * trusted. */
  var idsBlock = /\[\s*\n([\s\S]*?)\n\s*\]\.forEach\(function \(id\) \{/.exec(app);
  check(idsBlock !== null, 'wiring: no element id list found in src/app.js init');

  if (idsBlock) {
    var wanted = (idsBlock[1].match(/'([a-zA-Z]+)'/g) || [])
      .map(function (t) { return t.slice(1, -1); });
    check(wanted.length > 0, 'wiring: the element id list came back empty');

    var present = Object.create(null);
    var im = /id="([a-zA-Z]+)"/g, got;
    while ((got = im.exec(html)) !== null) present[got[1]] = 1;

    var absent = [];
    for (i = 0; i < wanted.length; i++) {
      if (!present[wanted[i]]) absent.push(wanted[i]);
    }
    check(absent.length === 0,
      'wiring: src/app.js looks up ' + absent.join(', ') +
      ', which index.html no longer contains');

    console.log('  ' + pad('controls', 17) + wanted.length +
      ' elements looked up by src/app.js, all present in index.html');
  }

  console.log('  ' + pad('styles', 17) + styleKeys.length +
    ' offered, dispatched, built and presetted: ' + styleKeys.join(', '));
})();

console.log('\n  A4 FIT');

/* The printed size of a maze is decided by ONE number: the aspect ratio of its
 * viewBox, because the print stylesheet gives the SVG the full 190mm text
 * column and lets height follow. So read that ratio back out of the rendered
 * SVG -- not out of the preset table -- and check it lands in the band
 * src/paper.js defines. Reading the SVG is the point: it catches a renderer
 * quietly changing its own margins just as well as a bad preset.
 *
 * A long seed is included deliberately. The isometric renderer used to widen
 * its margins to fit an overhanging caption, which made the printed scale
 * depend on how many characters were typed into the seed box. */
function viewBox(svg) {
  var m = /viewBox="(-?[0-9.]+) (-?[0-9.]+) ([0-9.]+) ([0-9.]+)"/.exec(svg);
  if (!m) return null;
  return { w: parseFloat(m[3]), h: parseFloat(m[4]) };
}

/* THE SHEET HAS TO SAY WHERE IT CAME FROM. A printed maze carries its seed and
 * its carver, which is enough to redraw it exactly -- but only if the reader
 * knows where to type them, so every style prints the site in its caption too.
 * The renderers each hold their own copy of the string, as they do with INK and
 * the font, so this checks all six actually emit it. */
var SITE = 'moechofe.github.io/printable-maze-generator';

/* The caption is the one piece of the drawing sized from the seed text, so it
 * is the one piece that can overrun the sheet: past the edge of the viewBox a
 * browser simply clips it, and what goes first is whichever end of the line the
 * URL is on. So measure it off the emitted text at the emitted size, rather
 * than trusting the arithmetic the renderer fitted with.
 *
 * Width is glyphs * (advance + tracking) * size, and the tracking is read back
 * out of the markup rather than assumed. That is the part worth checking: SVG
 * letter-spacing is a LENGTH IN USER UNITS, not an em, so a renderer that
 * leaves it fixed while shrinking the font spends more and more of the line on
 * the gaps between letters -- a theta caption came out half again as wide as
 * its own estimate that way. 0.66 em is Helvetica's caps advance, which is the
 * worst case a seed can be typed in. */
function captionWidth(svg) {
  var texts = svg.match(/<text[^>]*>[^<]*<\/text>/g) || [];
  var last = texts[texts.length - 1];
  if (!last) return null;
  var size = /font-size="([0-9.]+)"/.exec(last);
  var track = /letter-spacing="([0-9.]+)"/.exec(last);
  var body = />([^<]*)</.exec(last)[1];
  if (!size || body.indexOf(SITE) === -1) return null;
  // Entities are one glyph each on the page, whatever their length in source.
  var glyphs = body.replace(/&#?[a-z0-9]+;/g, '.').length;
  return glyphs * (0.66 * parseFloat(size[1]) +
    (track ? parseFloat(track[1]) : 0));
}

var SEEDS = ['A', 'RENDER', 'A-VERY-LONG-SEED-INDEED-TYPED-BY-HAND'];

function renderFor(style, seed, preset) {
  var b, e;
  if (style === 'theta') {
    b = buildTheta(seed, preset, 'dfs');
    return RENDER_THETA.toSvg({
      grid: b.grid, open: b.open,
      path: GRAPH.solve(b.grid.adj, b.open, b.grid.start, b.grid.end),
      showSolution: false, seed: seed, label: preset.label, carver: 'dfs'
    });
  }
  if (style === 'engrave') {
    b = buildEngraved(seed, preset, 'dfs');
    return RENDER_ENGRAVED.toSvg({
      maze: b.maze, grid: b.grid, path: MAZE.solve(b.maze), showSolution: false,
      seed: seed, label: preset.label, carver: 'dfs'
    });
  }
  if (style === 'hexround') {
    b = buildHexRound(seed, preset, 'kruskal');
    return RENDER_ROUND.toSvg({
      sheet: HEX.wallLattice(b.grid, b.open),
      pathXY: HEX.pathXY(b.grid, GRAPH.solve(b.grid.adj, b.open, b.grid.start, b.grid.end)),
      showSolution: false, kind: 'ROUNDED HONEYCOMB',
      seed: seed, label: preset.label, carver: 'kruskal'
    });
  }
  if (style === 'escher') {
    e = buildEscher(seed, preset, 'dfs');
    return RENDER.toSvg({
      maze: e.maze, grid: e.grid, regions: e.regions, path: MAZE.solve(e.maze),
      light: 45, showSolution: false, seed: seed, label: preset.label
    });
  }
  if (style === 'iso') {
    b = buildIso(seed, preset, 'dfs');
    return RENDER_ISO.toSvg({
      surface: b.surface, open: b.open,
      path: GRAPH.solve(b.surface.adj, b.open, b.start, b.end),
      startFace: b.start, endFace: b.end, showSolution: false,
      inkRng: RNG.makeRng(seed + '#ink'),
      seed: seed, label: preset.label, faceCount: b.surface.faces.length
    });
  }
  b = buildHex(seed, preset, 'dfs');
  return RENDER_HEX.toSvg({
    grid: b.grid, open: b.open,
    path: GRAPH.solve(b.grid.adj, b.open, b.grid.start, b.grid.end),
    showSolution: false, seed: seed, label: preset.label
  });
}

['escher', 'iso', 'hex', 'hexround', 'engrave',
 'theta'].forEach(function (style) {
  var line = '  ' + pad(style, 9);

  Object.keys(PRESETS).forEach(function (key) {
    var preset = PRESETS[key], worst = null, best = null, box = null;

    SEEDS.forEach(function (seed) {
      var svg = renderFor(style, seed, preset);
      var vb = viewBox(svg);
      check(vb !== null, style + ' ' + key + ': no viewBox in the rendered SVG');
      if (!vb) return;
      var f = PAPER.fill(vb.w, vb.h);
      if (worst === null || f > worst) { worst = f; box = vb; }
      if (best === null || f < best) best = f;

      check(f <= 1, style + ' ' + key + ' seed ' + seed +
        ': runs off the sheet -- ' + Math.round(f * 100) +
        '% of the page height, so it prints letterboxed at ' +
        PAPER.printedWidthMm(vb.w, vb.h).toFixed(0) + 'mm wide');
      check(f >= PAPER.MIN_FILL, style + ' ' + key + ' seed ' + seed +
        ': leaves the sheet ' + Math.round((1 - f) * 100) + '% empty');

      var capW = captionWidth(svg);
      check(capW !== null, style + ' ' + key + ' seed ' + seed +
        ': the caption does not print ' + SITE + ', so the sheet cannot be ' +
        'traced back to the app that drew it');
      if (capW !== null) {
        check(capW <= vb.w, style + ' ' + key + ' seed ' + seed +
          ': the caption is ' + capW.toFixed(1) + ' units wide in a ' +
          vb.w.toFixed(1) + '-unit box, so the browser clips its ends off');
      }
    });

    /* Seed text must not move the box at all. It is the caption that has to
     * shrink to fit the margins, never the margins that grow for the caption. */
    check(worst === best, style + ' ' + key +
      ': the viewBox depends on the seed text (' + best + ' to ' + worst + ')');

    line += pad(key + ' ' + Math.round(worst * 100) + '%', 14);
    if (key === 'insane') {
      line += ' cell ' + PAPER.unitMm(box.w, box.h).toFixed(2) + 'mm/unit';
    }
  });

  console.log(line);
});

console.log('  ' + pad('', 9) + 'percentages are how much of the ' +
  PAPER.USABLE_W + 'x' + PAPER.USABLE_H + 'mm sheet the drawing fills; ' +
  Math.round(PAPER.MIN_FILL * 100) + '-100% required');

console.log('');
if (failures.length) {
  console.error('FAILED ' + failures.length + ' of ' + checks + ' checks:');
  failures.slice(0, 20).forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('OK - ' + checks + ' checks passed\n');
