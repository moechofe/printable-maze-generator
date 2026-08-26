/* Engraved renderer: walls as hatched blocks, corridors as bare paper.
 *
 * The other renderers draw walls as LINES. This one draws them as REGIONS, and
 * that is the whole difference: a wall here has an area, an outline and a
 * texture inside it, the way a woodcut or a banknote engraving does.
 *
 * WHY toSolidGrid AND NOT A WALL LATTICE. src/lattice.js models a wall as a
 * zero-width segment on a line between two cells, which is exactly right for a
 * stroked wall and useless for a filled one -- it has no notion of the inside
 * of anything. src/maze.js already expands a maze into a (2w+1) x (2h+1) grid
 * of solid and open units for the Escher renderer, and that IS the region: a
 * wall unit is solid, a corridor unit is not, and a pillar unit between four
 * walls is solid too, which is what stops the hatching falling apart at
 * junctions.
 *
 * ONE PATH DOES BOTH JOBS. The outline of the solid region -- every unit edge
 * with solid on one side and open on the other -- comes out of the same
 * decomposition the stroked renderers use, and because a region boundary has
 * even degree at every vertex those come back as CLOSED LOOPS rather than open
 * runs. That single path is then used twice: stroked, as the engraved outline,
 * and as a clipPath with fill-rule evenodd, inside which the hatching is drawn.
 * Evenodd is what makes holes work -- a point inside a corridor surrounded by
 * wall is inside two loops, so it counts as outside and stays white.
 *
 * PRINTING. Everything here is a stroke; there is not one large filled area on
 * the page. That is deliberate. A printer driver deciding a grey fill is
 * decorative background prints a maze with no walls, which is the failure the
 * Escher style needs print-color-adjust to avoid. Hatching cannot fail that
 * way -- the "tone" is real ink lines all the way down.
 */
(function (global) {
  'use strict';

  /** @const {string} */
  var INK = '#111111';

  /* Corridor width and wall thickness, in abstract units. Walls are thinner
   * than corridors so the hatched blocks read as bars between open channels
   * rather than as a texture with holes punched in it. */
  var Uc = 1, Uw = 0.55;

  /** @const {number} */
  var OUTLINE = 0.075;     // the engraved contour
  /** @const {number} */
  var HATCH = 0.055;       // the shading lines inside it
  /* Gap between hatch lines, centre to centre. Four lines cross a wall at every
   * preset -- the ratio to Uw is what fixes that, not the scale -- so what
   * varies with the preset is how far apart they land on paper. At the finest
   * one a wall is about 1.8mm across and the lines sit 0.46mm apart, which
   * still reads as tone rather than as stripes and is still several times what
   * a 600dpi laser resolves. THIS IS WHAT FLOORS THE ENGRAVED CELL SIZE: the
   * corridor could be taken a good deal finer, the hatching could not, so
   * src/presets.js stops the width where the gap would start to grey over.
   *
   * Hatched one way only, not cross-hatched. Two passes doubles the ink and the
   * walls stop being a background the corridors sit in front of; on a maze the
   * walls are the thing you want to look past. */
  /** @const {number} */
  var SPACING = 0.14;

  var mL = 1.0, mR = 1.0, mT = 2.6, mB = 3.8;

  /** @const {string} */
  var FONT = 'font-family="Helvetica,Arial,sans-serif"';

  // Even grid index = wall or pillar unit, odd = cell unit. Same scheme as
  // src/render.js, with this renderer's own weights.
  /**
   * @param {number} i
   * @return {number}
   */
  function pos(i) { return Math.ceil(i / 2) * Uw + Math.floor(i / 2) * Uc; }
  /**
   * @param {number} i
   * @return {number}
   */
  function span(i) { return (i % 2 === 0) ? Uw : Uc; }

  /**
   * @param {number} n
   * @return {number}
   */
  function fmt(n) { return Math.round(n * 1000) / 1000; }

  /**
   * @param {?} s
   * @return {string} safe to drop into markup
   */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Every unit edge with solid on one side and open on the other, as lattice
   * entries. Outside the grid counts as open, so the outer rim of the maze is
   * part of the boundary and the block gets a contour all the way round.
   *
   * Emitted in a fixed order -- verticals down each column, then horizontals
   * along each row -- so the decomposition is reproducible. */
  /**
   * @param {!MMSolidGrid} grid
   * @return {{verts: !Array<!MMLatticeVert>,
   *           entries: !Array<!MMLatticeEntry>}}
   */
  function outlineLattice(grid) {
    var gw = grid.gw, gh = grid.gh, solid = grid.solid;
    var vw = gw + 1;
    /** @type {!Array<!MMLatticeVert>} */
    var verts = [];
    /** @type {!Array<!MMLatticeEntry>} */
    var entries = [];
    var i, j;

    for (j = 0; j <= gh; j++) {
      for (i = 0; i <= gw; i++) verts.push({ key: j * vw + i, xy: [pos(i), pos(j)] });
    }

    /**
     * @param {number} x
     * @param {number} y
     * @return {number} 1 for solid; outside the grid counts as open
     */
    function at(x, y) {
      if (x < 0 || y < 0 || x >= gw || y >= gh) return 0;
      return solid[y * gw + x];
    }
    /**
     * @param {number} ai
     * @param {number} aj
     * @param {number} bi
     * @param {number} bj
     * @return {undefined}
     */
    function edge(ai, aj, bi, bj) {
      entries.push({
        ak: aj * vw + ai, a: [pos(ai), pos(aj)],
        bk: bj * vw + bi, b: [pos(bi), pos(bj)]
      });
    }

    // Vertical edges on lattice line x = i, between units (i-1, j) and (i, j).
    for (i = 0; i <= gw; i++) {
      for (j = 0; j < gh; j++) {
        if (at(i - 1, j) !== at(i, j)) edge(i, j, i, j + 1);
      }
    }
    // Horizontal edges on y = j, between units (i, j-1) and (i, j).
    for (j = 0; j <= gh; j++) {
      for (i = 0; i < gw; i++) {
        if (at(i, j - 1) !== at(i, j)) edge(i, j, i + 1, j);
      }
    }

    return { verts: verts, entries: entries };
  }

  /**
   * @param {!MMEngravedOpts} o
   * @return {string}
   */
  function toSvg(o) {
    var LATTICE = /** @type {!MMLatticeApi} */ (
      (typeof module !== 'undefined' && module.exports)
        ? require('./lattice.js') : global.MM.lattice);

    var grid = o.grid, maze = o.maze;
    var gw = grid.gw, gh = grid.gh;
    var totalW = pos(gw - 1) + span(gw - 1);
    var totalH = pos(gh - 1) + span(gh - 1);
    var i;

    var vbX = -mL, vbY = -mT;
    var vbW = totalW + mL + mR, vbH = totalH + mT + mB;

    // --- the solid region, as closed loops ----------------------------------
    var sheet = outlineLattice(grid);
    var lat = LATTICE.build(sheet.entries, sheet.verts);
    var loops = LATTICE.decompose(lat);

    /* Closed, so the path can be filled as well as stroked. A region boundary
     * has even degree at every vertex, so each walk comes back to where it
     * started and Z adds nothing but the explicit close. */
    var region = '';
    for (i = 0; i < loops.length; i++) {
      var pts = LATTICE.simplify(lat, loops[i]);
      var d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1]);
      for (var k = 1; k < pts.length; k++) {
        d += 'L' + fmt(pts[k][0]) + ' ' + fmt(pts[k][1]);
      }
      region += d + 'Z';
    }

    // --- hatching, clipped to the region ------------------------------------
    /* Lines at 45 degrees, stepped along the perpendicular. The sweep runs from
     * -totalH to +totalW so the diagonals cover the whole sheet whatever its
     * proportions; the clip discards everything outside the walls. */
    var hatch = '';
    var start = -totalH, end = totalW;
    for (var c = start; c <= end; c += SPACING) {
      hatch += 'M' + fmt(c) + ' 0L' + fmt(c + totalH) + ' ' + fmt(totalH);
    }

    var clipId = 'engrave-walls';
    var shading =
      '<defs><clipPath id="' + clipId + '" clip-rule="evenodd">' +
      '<path d="' + region + '" clip-rule="evenodd"/></clipPath></defs>' +
      '<g clip-path="url(#' + clipId + ')">' +
      '<path d="' + hatch + '" fill="none" stroke="' + INK +
        '" stroke-width="' + HATCH + '"/>' +
      '</g>';

    var outline = '<path d="' + region + '" fill="none" stroke="' + INK +
      '" stroke-width="' + OUTLINE + '" stroke-linejoin="round"/>';

    // --- solution, markers, labels ------------------------------------------
    var mw = maze.width;
    var entryX = pos(1) + Uc / 2, exitX = pos(gw - 2) + Uc / 2;

    var solution = '';
    if (o.showSolution && o.path) {
      var d2 = 'M' + fmt(entryX) + ' 0';
      for (i = 0; i < o.path.length; i++) {
        var cell = o.path[i];
        d2 += 'L' + fmt(pos(2 * (cell % mw) + 1) + Uc / 2) + ' ' +
          fmt(pos(2 * ((cell / mw) | 0) + 1) + Uc / 2);
      }
      d2 += 'L' + fmt(exitX) + ' ' + fmt(totalH);
      solution =
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + d2 + '" stroke="#ffffff" stroke-width="0.40" opacity="0.95"/>' +
        '<path d="' + d2 + '" stroke="#111111" stroke-width="0.15" ' +
          'stroke-dasharray="0.3 0.24"/>' +
        '</g>';
    }

    var markers =
      '<path d="M' + fmt(entryX - 0.42) + ' -1.15L' + fmt(entryX + 0.42) +
        ' -1.15L' + fmt(entryX) + ' -0.3Z" fill="' + INK + '"/>' +
      '<text x="' + fmt(entryX) + '" y="-1.5" text-anchor="middle" font-size="0.72" ' +
        FONT + ' letter-spacing="0.12" fill="' + INK + '">START</text>' +
      '<path d="M' + fmt(exitX - 0.42) + ' ' + fmt(totalH + 0.3) + 'L' +
        fmt(exitX + 0.42) + ' ' + fmt(totalH + 0.3) + 'L' + fmt(exitX) + ' ' +
        fmt(totalH + 1.15) + 'Z" fill="' + INK + '"/>' +
      '<text x="' + fmt(exitX) + '" y="' + fmt(totalH + 2.0) + '" text-anchor="middle" ' +
        'font-size="0.72" ' + FONT + ' letter-spacing="0.12" fill="' + INK +
        '">FINISH</text>';

    var SEP = ' &#160;&#183;&#160; ';
    var carver = String(o.carver || 'dfs').toUpperCase();
    var caption = 'SEED ' + esc(o.seed) + SEP + maze.width + '&#215;' + maze.height +
      SEP + esc(o.label) + SEP + 'ENGRAVED' + SEP + esc(carver);
    var plain = 'SEED ' + o.seed + '  .  ' + maze.width + 'x' + maze.height +
      '  .  ' + o.label + '  .  ENGRAVED  .  ' + carver;
    var capFont = Math.max(0.3, Math.min(0.62, totalW / (plain.length * 0.68)));

    var footer =
      '<text x="' + fmt(totalW / 2) + '" y="' + fmt(totalH + 2.9) +
      '" text-anchor="middle" font-size="' + fmt(capFont) + '" ' + FONT +
      ' letter-spacing="0.08" fill="#444444">' + caption + '</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" class="maze-svg" role="img" ' +
      'aria-label="Engraved maze, seed ' + esc(o.seed) + '" ' +
      'viewBox="' + fmt(vbX) + ' ' + fmt(vbY) + ' ' + fmt(vbW) + ' ' + fmt(vbH) + '" ' +
      'preserveAspectRatio="xMidYMid meet">' +
      '<rect x="' + fmt(vbX) + '" y="' + fmt(vbY) + '" width="' + fmt(vbW) +
        '" height="' + fmt(vbH) + '" fill="#ffffff"/>' +
      shading +
      outline +
      solution +
      '<g class="marks">' + markers + '</g>' +
      footer +
      '</svg>';
  }

  // The nominal viewBox for a w x h maze; src/presets.js is solved against it.
  /**
   * @param {number} w
   * @param {number} h
   * @return {!MMViewBox}
   */
  function viewBox(w, h) {
    return { w: (Uc + Uw) * w + Uw + mL + mR, h: (Uc + Uw) * h + Uw + mT + mB };
  }

  var api = {
    toSvg: toSvg, viewBox: viewBox, outlineLattice: outlineLattice,
    Uc: Uc, Uw: Uw, pos: pos, span: span, SPACING: SPACING
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).renderEngraved = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
