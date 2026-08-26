/* Wall lattices: turning a set of standing walls into strokable polylines.
 *
 * A LATTICE is the vocabulary every wall-stroking renderer shares:
 *
 *   verts     [x, y] screen positions
 *   segs      [vertexA, vertexB] -- one standing wall each
 *   incident  per vertex, the list of segment ids touching it
 *
 * Grid modules build these (src/maze.js, src/hex.js); renderers consume them.
 * Nothing in here knows what a cell is, how many neighbours it has, or whether
 * the grid is square -- which is the point. The square grid, the honeycomb and
 * anything added later all decompose by the same code.
 *
 * WALLS ARE DRAWN AS LONG POLYLINES, NOT AS SEGMENTS. Stroking one segment per
 * wall would be far simpler and would look wrong: a round cap at every lattice
 * vertex, and no corner geometry to round off. So segments are first chained
 * into maximal polylines, and only then stroked.
 *
 * The chaining is a greedy walk that prefers to CONTINUE STRAIGHT, seeded from
 * the loose ends first. Full Hierholzer splicing is not needed, and the reason
 * is what makes the cheap version correct:
 *
 *   - A walk only stops when every segment at the current vertex is used. So a
 *     walk arriving at a vertex with one wall still free ALWAYS continues.
 *   - Therefore at a degree-2 vertex -- every corner -- whichever walk gets
 *     there first consumes both segments. A corner can never be split across
 *     two strokes, so no fillet is ever lost.
 *   - At a junction a stroke may end where another passes through. That is
 *     invisible: a round cap centred on the vertex covers the same disc the
 *     passing stroke already draws.
 *
 * Starting from the loose ends matters for the same reason: start in the middle
 * of a run and you get two strokes meeting end to end, which is seamless on a
 * straight but loses the fillet on a corner.
 *
 * "STRAIGHT ON" IS THE LARGEST DOT PRODUCT, not an equal direction index. On a
 * square grid that picks the exactly-collinear continuation, reproducing what
 * this code did when it only knew about squares. At a 120-degree honeycomb
 * vertex nothing is collinear -- the two candidates sit at plus and minus 60
 * degrees and tie -- so the tie is broken by lowest segment id, which keeps the
 * drawing reproducible without pretending one of them is straighter.
 */
(function (global) {
  'use strict';

  /** @const {number} */
  var EPS = 1e-9;

  /**
   * @param {!MMPoint} a
   * @param {!MMPoint} b
   * @return {!Array<number>} [ux, uy, length] -- a direction and how far it ran
   */
  function unit(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / len, dy / len, len];
  }

  /* Assemble a lattice from a list of segments given as vertex-key pairs.
   *
   * Keys are whatever the grid module uses to name a lattice point, as long as
   * two segments meeting at a point produce the SAME key -- which is why every
   * grid here works in exact integers rather than in floats. */
  /**
   * @param {!Array<!MMLatticeEntry>} entries
   * @param {?Array<!MMLatticeVert>=} preVerts
   * @return {!MMLattice}
   */
  function build(entries, preVerts) {
    // Untemplatised on purpose: a grid names its lattice points however it
    // likes -- src/hex.js with strings, src/render-engraved.js with integers.
    var index = /** @type {!Object} */ (Object.create(null));
    var verts = [], segs = [], incident = [];

    /**
     * @param {(string|number)} key
     * @param {!MMPoint} xy
     * @return {number}
     */
    function vertexId(key, xy) {
      var id = index[key];
      if (id === undefined) {
        id = verts.length;
        index[key] = id;
        verts.push(xy);
        incident.push([]);
      }
      return id;
    }

    /* Grids may pre-register every lattice point, in their own canonical order,
     * before any segment claims one. Nothing requires it -- points get created
     * on demand otherwise -- but it fixes the order decompose() sweeps in, so
     * strokes come out in a geometrically sensible sequence instead of in the
     * order walls happened to be emitted. Points nobody uses stay at degree 0
     * and are skipped. */
    if (preVerts) {
      for (var v = 0; v < preVerts.length; v++) {
        vertexId(preVerts[v].key, preVerts[v].xy);
      }
    }

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var a = vertexId(e.ak, e.a), b = vertexId(e.bk, e.b);
      if (a === b) continue;                     // degenerate; nothing to draw
      var id = segs.length;
      segs.push([a, b]);
      incident[a].push(id);
      incident[b].push(id);
    }

    return { verts: verts, segs: segs, incident: incident, count: segs.length };
  }

  /**
   * @param {!MMLattice} L
   * @param {number} v
   * @return {number} how many walls stand at this lattice point
   */
  function degree(L, v) { return L.incident[v].length; }

  /**
   * @param {!MMLattice} L
   * @param {number} seg
   * @param {number} v
   * @return {number} the far end of that wall
   */
  function other(L, seg, v) {
    return L.segs[seg][0] === v ? L.segs[seg][1] : L.segs[seg][0];
  }

  /* Greedy maximal-polyline decomposition. Returns arrays of vertex ids.
   * Every segment is consumed exactly once; test/verify.js checks that rather
   * than taking it on trust. */
  /**
   * @param {!MMLattice} L
   * @return {!Array<!Array<number>>} one array of vertex ids per stroke
   */
  function decompose(L) {
    var used = new Uint8Array(L.count);
    var paths = [];

    // Best continuation from `v`, having arrived along direction `dir`.
    /**
     * @param {number} v
     * @param {?Array<number>} dir null on the first step of a stroke
     * @return {number} the segment to take, or -1 if none is left
     */
    function step(v, dir) {
      var list = L.incident[v];
      var best = -1, bestDot = -Infinity;
      for (var i = 0; i < list.length; i++) {
        var seg = list[i];
        if (used[seg]) continue;
        if (!dir) { if (best < 0) best = seg; continue; }
        var u = unit(L.verts[v], L.verts[other(L, seg, v)]);
        var dot = u[0] * dir[0] + u[1] * dir[1];
        // Strict >, so an exact tie keeps the lowest segment id and the
        // drawing stays reproducible.
        if (dot > bestDot + EPS) { bestDot = dot; best = seg; }
      }
      return best;
    }

    /**
     * @param {number} startV
     * @return {undefined}
     */
    function walk(startV) {
      var pts = [startV];
      var cur = startV, dir = null;
      for (;;) {
        var seg = step(cur, dir);
        if (seg < 0) break;
        used[seg] = 1;
        var next = other(L, seg, cur);
        var u = unit(L.verts[cur], L.verts[next]);
        dir = [u[0], u[1]];
        cur = next;
        pts.push(cur);
      }
      if (pts.length > 1) paths.push(pts);
    }

    /**
     * @param {number} wantDegree -1 for any degree at all
     * @return {undefined}
     */
    function sweep(wantDegree) {
      for (var v = 0; v < L.verts.length; v++) {
        if (wantDegree >= 0 && degree(L, v) !== wantDegree) continue;
        while (step(v, null) >= 0) walk(v);
      }
    }

    sweep(1);     // loose ends: every stub is a true endpoint of its stroke
    sweep(3);     // remaining odd vertices
    sweep(-1);    // anything left, which for a wall forest is nothing

    return paths;
  }

  // Drop vertices that are not turns, so every interior point is a real corner.
  /**
   * @param {!MMLattice} L
   * @param {!Array<number>} ids
   * @return {!Array<!MMPoint>}
   */
  function simplify(L, ids) {
    var pts = [];
    for (var i = 0; i < ids.length; i++) pts.push(L.verts[ids[i]]);

    var out = [pts[0]];
    for (i = 1; i < pts.length - 1; i++) {
      var a = unit(pts[i - 1], pts[i]), b = unit(pts[i], pts[i + 1]);
      if (Math.abs(a[0] * b[1] - a[1] * b[0]) > EPS) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /**
   * @param {number} n
   * @return {number}
   */
  function fmt(n) { return Math.round(n * 1000) / 1000; }

  /* One polyline as an SVG subpath, corners replaced by arc fillets.
   *
   * The cut-back along each leg is r * tan(theta/2) for a turn of deviation
   * theta, which is what puts the arc tangent to both legs -- a right angle
   * cuts back exactly r, a 60-degree honeycomb turn only 0.577r. It is capped
   * at half the shorter leg so two corners sharing a leg cannot overrun each
   * other, and the radius is reduced to match rather than the cut-back being
   * clipped, or the arc would stop being tangent and the join would kink. */
  /**
   * @param {!Array<!MMPoint>} pts
   * @param {number} radius
   * @return {string} an SVG subpath, corners replaced by arc fillets
   */
  function filletedPath(pts, radius) {
    var d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1]);

    for (var i = 1; i < pts.length - 1; i++) {
      var prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
      var a = unit(cur, prev);        // pointing back along the incoming leg
      var b = unit(cur, next);        // pointing on along the outgoing leg

      var cosTurn = -(a[0] * b[0] + a[1] * b[1]);
      if (cosTurn > 1) cosTurn = 1; else if (cosTurn < -1) cosTurn = -1;
      var theta = Math.PI - Math.acos(cosTurn);        // deviation from straight
      var tanHalf = Math.tan(theta / 2);

      var r = radius;
      var cut = r * tanHalf;
      var maxCut = Math.min(a[2], b[2]) / 2;
      if (cut > maxCut) { cut = maxCut; r = cut / tanHalf; }

      var sweep = (a[0] * b[1] - a[1] * b[0]) < 0 ? 1 : 0;

      d += 'L' + fmt(cur[0] + a[0] * cut) + ' ' + fmt(cur[1] + a[1] * cut) +
        'A' + fmt(r) + ' ' + fmt(r) + ' 0 0 ' + sweep + ' ' +
        fmt(cur[0] + b[0] * cut) + ' ' + fmt(cur[1] + b[1] * cut);
    }

    var last = pts[pts.length - 1];
    return d + 'L' + fmt(last[0]) + ' ' + fmt(last[1]);
  }

  var api = {
    build: build,
    decompose: decompose,
    simplify: simplify,
    filletedPath: filletedPath,
    degree: degree,
    other: other,
    unit: unit
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).lattice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
