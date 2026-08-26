/* Theta mazes: concentric rings, carved from the hub outward.
 *
 * THE SUBDIVISION HAS TO DOUBLE, and that is the one real constraint here. A
 * ring at radius r has circumference 2*pi*r, so if every ring were cut into the
 * same number of cells the outer cells would be enormous and the inner ones
 * slivers. Cutting each ring into "however many fit" instead breaks the grid:
 * a cell would no longer line up with the cells outside it, and there would be
 * no clean answer to which of them it borders.
 *
 * So a ring keeps its parent's count or DOUBLES it. Doubling is the only ratio
 * that keeps every cell aligned with exactly one or exactly two cells outside
 * it, and it is enough to hold the cell width inside a factor of two:
 *
 *     a  <=  2*pi*r / n(r)  <  2a
 *
 * Below a, cells are too cramped to draw a wall in; at 2a they are wide enough
 * to halve, so they are halved. test/verify.js asserts the band directly, which
 * is the whole correctness argument for the layout.
 *
 * WALLS COME IN TWO KINDS, and unlike every other grid here they are not all
 * straight. A RADIAL wall is a line segment across one ring at a fixed angle,
 * separating two cells in the same ring; a CIRCUMFERENTIAL wall is an ARC at a
 * fixed radius, separating a cell from the one outside it. That is why this
 * grid has its own renderer instead of going through src/lattice.js, which
 * chains straight segments and rounds their corners -- neither of which means
 * anything for an arc.
 *
 * The maze itself is carved by src/graph.js like everything else: adjacency is
 * {to, key} over shared walls, so the carvers, the braider and the solver never
 * learn that this grid is round.
 */
(function (global) {
  'use strict';

  /** @const {number} */
  var TAU = Math.PI * 2;

  /* How many cells each ring is cut into. Ring 0 is the hub -- one cell, the
   * disc in the middle -- and every ring after it keeps its parent's count or
   * doubles until a cell is narrower than two units. */
  /**
   * @param {number} rings
   * @return {!Array<number>} how many cells each ring is cut into
   */
  function ringCounts(rings) {
    var n = [1];
    for (var r = 1; r < rings; r++) {
      var count = n[r - 1];
      while (TAU * r / count >= 2) count *= 2;
      n.push(count);
    }
    return n;
  }

  /**
   * @param {number} rings
   * @return {!MMThetaGrid}
   */
  function build(rings) {
    var n = ringCounts(rings);
    /** @type {!Array<!Array<number>>} */
    var index = [];
    /** @type {!Array<!MMThetaCell>} */
    var cells = [];
    var r, i;

    for (r = 0; r < rings; r++) {
      var row = [];
      for (i = 0; i < n[r]; i++) {
        row.push(cells.length);
        cells.push({ ring: r, slot: i, count: n[r] });
      }
      index.push(row);
    }

    /** @type {!MMAdj} */
    var adj = [];
    var walls =
      /** @type {!Object<string, !MMThetaWall>} */ (Object.create(null));
    /** @type {!Array<string>} */
    var edgeOrder = [];
    for (i = 0; i < cells.length; i++) adj.push([]);

    /**
     * @param {string} key
     * @param {!MMThetaWall} geom
     * @return {undefined}
     */
    function wall(key, geom) {
      if (walls[key]) return;
      walls[key] = geom;
      edgeOrder.push(key);
    }
    /**
     * @param {number} a
     * @param {number} b
     * @param {string} key
     * @return {undefined}
     */
    function link(a, b, key) {
      adj[a].push({ to: b, key: key });
      adj[b].push({ to: a, key: key });
    }

    // Within a ring: a radial wall at the boundary between neighbouring slots.
    for (r = 1; r < rings; r++) {
      if (n[r] < 2) continue;
      for (i = 0; i < n[r]; i++) {
        var next = (i + 1) % n[r];
        // Two cells is a special case: they meet twice, so linking both
        // boundaries would put a duplicate edge between the same pair.
        if (n[r] === 2 && i === 1) break;
        var key = 'R:' + r + ':' + next;
        // Cast: a radial wall has an angle and no span. The renderer switches
        // on `type` and then reads only the fields that tag promises.
        wall(key, /** @type {!MMThetaWall} */ (
          { type: 'R', r: r, angle: TAU * next / n[r] }));
        link(index[r][i], index[r][next], key);
      }
    }

    /* Between rings: an arc at radius r+1 over the angular span of the OUTER
     * cell, which is what makes the key unique whether the ring doubled or
     * not. Each outer cell has exactly one parent; each inner cell has one or
     * two children. */
    for (r = 0; r + 1 < rings; r++) {
      var ratio = n[r + 1] / n[r];
      for (i = 0; i < n[r + 1]; i++) {
        var parent = Math.floor(i / ratio);
        var k2 = 'C:' + (r + 1) + ':' + i;
        wall(k2, /** @type {!MMThetaWall} */ ({
          type: 'C', r: r + 1,
          a0: TAU * i / n[r + 1], a1: TAU * (i + 1) / n[r + 1]
        }));
        link(index[r][parent], index[r + 1][i], k2);
      }
    }

    /* The outer rim, which no carve can open -- it is held by one cell, exactly
     * like the perimeter of the honeycomb. Kept in the wall list so the
     * renderer draws it, and out of the adjacency so nothing can carve it. */
    /** @type {!Array<string>} */
    var rim = [];
    for (i = 0; i < n[rings - 1]; i++) {
      var kr = 'C:' + rings + ':' + i;
      wall(kr, /** @type {!MMThetaWall} */ ({
        type: 'C', r: rings,
        a0: TAU * i / n[rings - 1], a1: TAU * (i + 1) / n[rings - 1]
      }));
      rim.push(kr);
    }

    /* Start at the hub and finish on the rim, with the exit cut through the rim
     * arc of the finishing cell. Straight down is the bottom of the sheet
     * whichever way the rings fell, so the two markers always sit apart. */
    var endSlot = Math.floor(n[rings - 1] / 4);          // a quarter turn: due south
    var end = index[rings - 1][endSlot];

    return {
      rings: rings, counts: n, cells: cells, index: index,
      adj: adj, walls: walls, edgeOrder: edgeOrder, rim: rim,
      start: 0, end: end,
      exitWall: 'C:' + rings + ':' + endSlot,
      radius: rings
    };
  }

  // Where a cell's centre sits, before the sheet is stretched into an ellipse.
  /**
   * @param {!MMThetaGrid} g
   * @param {number} idx
   * @return {!MMPoint}
   */
  function centre(g, idx) {
    var c = g.cells[idx];
    if (c.ring === 0) return [0, 0];
    var a = TAU * (c.slot + 0.5) / c.count, rr = c.ring + 0.5;
    return [rr * Math.cos(a), rr * Math.sin(a)];
  }

  /**
   * @param {!MMThetaGrid} g
   * @return {string}
   */
  function signature(g) {
    return g.rings + ':' + g.counts.join(',') + ':' + g.cells.length;
  }

  var api = {
    TAU: TAU, ringCounts: ringCounts, build: build,
    centre: centre, signature: signature
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).theta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
