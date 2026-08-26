/* Hexagonal maze grid.
 *
 * Pointy-top hexes in an odd-r offset layout: odd rows shift half a hex to the
 * right. Circumradius is 1, so a hex is sqrt(3) wide and 2 tall, and rows pitch
 * 1.5 apart -- the overlap between rows is what makes the six-way adjacency
 * work out geometrically.
 *
 * Six neighbours instead of four is the whole point. On a square grid every
 * junction offers at most three ways on, two of them a left/right mirror pair,
 * so a wrong turn is cheap to undo. Here a junction can offer five, the
 * diagonal pairs are not mirror images of each other, and there is no row or
 * column to run your eye down -- which is what makes a hex maze read as harder
 * at the same cell count.
 *
 * WALLS ARE IDENTIFIED BY THE SHARED EDGE, like src/surface.js and unlike
 * src/maze.js and its (cell, direction) bitmask. That buys the same thing it
 * buys the isometric style: the renderer strokes every edge the maze did not
 * open, so the perimeter of the honeycomb -- edges held by a single cell, which
 * no carve can ever open -- draws itself.
 *
 * Edge keys come off an INTEGER lattice, not off the float coordinates. In
 * units of sqrt(3)/2 across and 1/2 down, every hex vertex lands on a whole
 * number, so the two cells either side of an edge produce a byte-identical key
 * with no rounding tolerance anywhere.
 *
 * The graph handed out is the shape src/graph.js carves: adj[cell] is a list of
 * {to, key}. Finishability therefore rests on exactly the same spanning-tree
 * argument as the other two styles.
 */
(function (global) {
  'use strict';

  /** @const {number} */
  var SQRT3 = Math.sqrt(3);
  /** @const {number} */
  var UX = SQRT3 / 2;      // lattice step across
  /** @const {number} */
  var UY = 0.5;            // lattice step down

  /* Vertex k of a hex sits at angle 60k - 30 degrees, so k = 0 is east-south-
   * east and they run clockwise with y down the page. Edge k spans vertex k to
   * vertex k+1 and therefore faces outward at exactly 60k degrees:
   *
   *        5   0        edge 0 -> E     edge 3 -> W
   *      4   *   1      edge 1 -> SE    edge 4 -> NW
   *        3   2        edge 2 -> SW    edge 5 -> NE
   *
   * The opposite of edge k is edge (k+3)%6, which is how one wall stays one
   * wall seen from either cell. */
  /** @const {!Array<number>} */
  var VX = [1, 1, 0, -1, -1, 0];    // vertex offsets, in lattice units
  /** @const {!Array<number>} */
  var VY = [-1, 1, 2, 1, -1, -2];

  /* Neighbour by edge index. The column step depends on row parity, because odd
   * rows are the shifted ones; the row step does not. dc is indexed by
   * (row & 1). */
  /** @const {!Array<!MMHexStep>} */
  var STEP = [
    { name: 'E',  dc: [ 1,  1], dr:  0 },
    { name: 'SE', dc: [ 0,  1], dr:  1 },
    { name: 'SW', dc: [-1,  0], dr:  1 },
    { name: 'W',  dc: [-1, -1], dr:  0 },
    { name: 'NW', dc: [-1,  0], dr: -1 },
    { name: 'NE', dc: [ 0,  1], dr: -1 }
  ];

  /** @const {number} */
  var ENTRY_EDGE = 4;   // NW face of the top-left hex
  /** @const {number} */
  var EXIT_EDGE = 1;    // SE face of the bottom-right hex

  /**
   * @param {number} col
   * @param {number} row
   * @param {number} k vertex index, 0 to 5
   * @return {!Array<number>} integer lattice coordinates
   */
  function vertexLattice(col, row, k) {
    return [
      2 * col + (row & 1) + VX[k],
      3 * row + VY[k]
    ];
  }

  /**
   * @param {!Array<number>} lat
   * @return {!MMPoint}
   */
  function toScreen(lat) { return [lat[0] * UX, lat[1] * UY]; }

  /**
   * @param {!Array<number>} a
   * @param {!Array<number>} b
   * @return {string} byte-identical from either cell, integers all the way
   */
  function edgeKey(a, b) {
    var ka = a[0] + ',' + a[1], kb = b[0] + ',' + b[1];
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
  }

  /* Build the honeycomb: cells, the six-way adjacency graph over shared edges,
   * and every edge in the drawing together with how many cells hold it.
   * Consumes no randomness -- the same cols/rows always produce the same graph,
   * so the maze is entirely the carver's doing. */
  /**
   * @param {number} cols
   * @param {number} rows
   * @return {!MMHexGrid}
   */
  function grid(cols, rows) {
    /** @type {!Array<!MMHexCell>} */
    var cells = [];
    var c, r, k, i;

    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        // Cast: `poly` is filled in below, once the geometry is baked out.
        cells.push(/** @type {!MMHexCell} */ ({
          col: c, row: r, cx: (2 * c + (r & 1)) * UX, cy: 3 * r * UY
        }));
      }
    }

    var edgeEnds =
      /** @type {!Object<string, !Array<!MMPoint>>} */ (Object.create(null));
    var edgeVerts =
      /** @type {!Object<string, !Array<string>>} */ (Object.create(null));
    var edgeMid =
      /** @type {!Object<string, !MMPoint>} */ (Object.create(null));
    var edgeCells =
      /** @type {!Object<string, number>} */ (Object.create(null));
    /** @type {!Array<string>} */
    var edgeOrder = [];
    /** @type {!Array<!Array<string>>} */
    var cellEdges = [];           // cellEdges[i][k] is the key of that cell's edge k

    /* Geometry is baked out here rather than exposed as helper functions, so
     * that src/render-hex.js only ever reads plain data -- the same deal the
     * isometric renderer has with src/surface.js. */
    for (i = 0; i < cells.length; i++) {
      var keys = [], poly = [];
      for (k = 0; k < 6; k++) {
        var a = vertexLattice(cells[i].col, cells[i].row, k);
        var b = vertexLattice(cells[i].col, cells[i].row, (k + 1) % 6);
        var pa = toScreen(a), pb = toScreen(b);
        var ek = edgeKey(a, b);
        poly.push(pa);
        keys.push(ek);
        if (edgeCells[ek] === undefined) {
          edgeCells[ek] = 0;
          edgeEnds[ek] = [pa, pb];
          // The lattice keys of the two ends, in the same order as edgeEnds.
          // The edge key itself sorts them, so it cannot be split to recover
          // which end is which.
          edgeVerts[ek] = [a[0] + ',' + a[1], b[0] + ',' + b[1]];
          edgeMid[ek] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
          edgeOrder.push(ek);
        }
        edgeCells[ek]++;
      }
      cells[i].poly = poly;
      cellEdges.push(keys);
    }

    var adj = [];
    for (i = 0; i < cells.length; i++) adj.push([]);

    /* Only walk forward -- E, SE, SW -- and register both directions at once,
     * so each edge is added exactly once and the adjacency lists come out in a
     * fixed order. Order is load-bearing: the carver picks from these lists, so
     * reordering them would change every maze. */
    for (i = 0; i < cells.length; i++) {
      c = cells[i].col; r = cells[i].row;
      for (k = 0; k <= 2; k++) {
        var nc = c + STEP[k].dc[r & 1], nr = r + STEP[k].dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        var j = nr * cols + nc;
        var key = cellEdges[i][k];
        adj[i].push({ to: j, key: key });
        adj[j].push({ to: i, key: key });
      }
    }

    var start = 0;                        // top-left hex
    var end = rows * cols - 1;            // bottom-right hex

    return {
      cols: cols, rows: rows,
      cells: cells, adj: adj,
      edgeOrder: edgeOrder, edgeEnds: edgeEnds, edgeVerts: edgeVerts,
      edgeMid: edgeMid, edgeCells: edgeCells,
      cellEdges: cellEdges,
      start: start, end: end,
      /* Gaps cut in the perimeter, so the maze is visibly entered and left.
       * Both are held by a single cell, so the carver can never have opened
       * them and the renderer can drop them unconditionally. */
      entryEdge: cellEdges[start][ENTRY_EDGE],
      exitEdge: cellEdges[end][EXIT_EDGE],
      /* Corners of the drawing, derived rather than measured: the leftmost
       * point is the west vertex of column 0 on an even row, the rightmost the
       * east vertex of the last column on an odd row -- so a single-row grid,
       * having no shifted row, is half a hex narrower. Stating the box here is
       * what lets the preset table be solved for A4 rather than tuned by eye. */
      minX: -UX, maxX: UX * (2 * cols - 1 + (rows > 1 ? 1 : 0)),
      minY: -1, maxY: 1.5 * (rows - 1) + 1
    };
  }

  /* The standing walls as a lattice for src/lattice.js.
   *
   * Same contract as maze.js's, and the reason both exist: everything about
   * stroking walls -- chaining them into polylines, rounding the corners,
   * measuring the corridor -- is identical between a square grid and a
   * honeycomb. Only the geometry differs, and this is where it lives.
   *
   * THE PERIMETER IS DRAWN, less the two notches. An edge held by a single cell
   * is a wall no carve can ever open, so stroking it closes the honeycomb --
   * ragged zigzag sides and all -- and the entry and exit gaps become the only
   * ways in or out. This style used to leave the whole border out and let the
   * edge of the sheet stand in for it. That drew beautifully and read as
   * cheatable: a printed maze has white paper all round it, so a route round
   * the outside was always on offer. Cutting the two notches out of the border
   * rather than keeping it whole is what leaves the wall structure a forest --
   * see src/render-round.js.
   *
   * Distances are in hex EDGE lengths, which is the honeycomb's equivalent of a
   * cell pitch: it is the width of the gap between two adjacent cells, so a
   * wall of thickness t leaves 1 - t of corridor exactly as on the square grid.
   * A hex is sqrt(3) edges across, so a wall that looks the same weight here
   * covers less of a cell than it does there. */
  /**
   * @param {!MMHexGrid} g
   * @param {!MMOpen} open
   * @return {!MMSheet} the standing walls, in the vocabulary of src/lattice.js
   */
  function wallLattice(g, open) {
    var seen = /** @type {!Object<string, number>} */ (Object.create(null));
    /** @type {!Array<!MMLatticeVert>} */
    var verts = [];
    /** @type {!Array<!MMLatticeEntry>} */
    var entries = [];

    /**
     * @param {string} key
     * @param {!MMPoint} xy
     * @return {undefined}
     */
    function note(key, xy) {
      if (seen[key]) return;
      seen[key] = 1;
      verts.push({ key: key, xy: xy });
    }

    // Pre-register in cell order, so the sweep runs across and down the sheet.
    for (var c = 0; c < g.cells.length; c++) {
      var keys = g.cellEdges[c];
      for (var k = 0; k < 6; k++) {
        var vk = g.edgeVerts[keys[k]], ve = g.edgeEnds[keys[k]];
        note(vk[0], ve[0]);
        note(vk[1], ve[1]);
      }
    }

    for (var e = 0; e < g.edgeOrder.length; e++) {
      var ek = g.edgeOrder[e];
      if (open[ek]) continue;                       // carved: a passage
      if (ek === g.entryEdge || ek === g.exitEdge) continue;   // the two notches
      var kv = g.edgeVerts[ek], ends = g.edgeEnds[ek];
      entries.push({ ak: kv[0], a: ends[0], bk: kv[1], b: ends[1] });
    }

    return {
      verts: verts, entries: entries,
      pitch: 1,                    // one hex edge: the gap between two cells
      inradius: SQRT3 / 2,         // hexagon inradius, for the markers
      /* A HONEYCOMB WANTS THINNER INK THAN A SQUARE GRID, and the reason is
       * geometric rather than a matter of taste. A hexagon has more perimeter
       * per unit of area than a square, and its doorway -- one edge -- is only
       * 1/sqrt(3) of the distance to the next cell rather than all of it. At
       * the square grid's 0.38 the doorways choke and the maze reads as
       * decorative blobs instead of corridors.
       *
       * The fillet has to come down too. Consecutive hex edges alternate by 60
       * degrees, so a radius that leaves a square grid crisp turns a honeycomb
       * into a continuous squiggle: at 0.42 the cut-back eats nearly half of
       * every edge and the hexagonal structure stops reading at all. */
      wall: 0.22,
      fillet: 0.18,
      box: { x0: g.minX, y0: g.minY, x1: g.maxX, y1: g.maxY },
      dims: g.cols + '\u00d7' + g.rows,
      startXY: [g.cells[g.start].cx, g.cells[g.start].cy],
      endXY: [g.cells[g.end].cx, g.cells[g.end].cy],
      /* Where the two notches sit, so a solution overlay can be drawn entering
       * and leaving through them rather than stopping at a cell centre inside
       * a closed border. */
      entryXY: g.edgeMid[g.entryEdge],
      exitXY: g.edgeMid[g.exitEdge]
    };
  }

  /**
   * @param {!MMHexGrid} g
   * @param {!Array<number>} path
   * @return {!Array<!MMPoint>} the route as hex centres
   */
  function pathXY(g, path) {
    var out = [];
    for (var i = 0; i < path.length; i++) {
      out.push([g.cells[path[i]].cx, g.cells[path[i]].cy]);
    }
    return out;
  }

  /**
   * @param {!MMHexGrid} g
   * @return {string}
   */
  function signature(g) {
    return g.cols + 'x' + g.rows + ':' + g.edgeOrder.length + ':' +
      g.adj.map(function (list) {
        return list.map(function (e) { return e.to; }).join(',');
      }).join(';');
  }

  var api = {
    SQRT3: SQRT3, UX: UX, UY: UY,
    STEP: STEP, ENTRY_EDGE: ENTRY_EDGE, EXIT_EDGE: EXIT_EDGE,
    grid: grid, wallLattice: wallLattice, pathXY: pathXY,
    edgeKey: edgeKey, signature: signature
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).hex = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
