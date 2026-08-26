/* Honeycomb renderer.
 *
 * Black ink on white, like the isometric style and unlike the Escher one: no
 * greys, no shading, nothing that a laser printer can decide is decorative and
 * drop. What carries the picture instead is the honeycomb itself -- six-way
 * junctions have no axis to sight along, so the eye has to actually follow a
 * corridor rather than scan a row.
 *
 * WALLS ARE DRAWN FROM EDGES, NOT FROM CELLS. Every edge of the honeycomb is
 * stroked unless the maze opened it, which gets three cases right at once:
 *   - an edge shared by two cells, carved   -> no stroke, a passage
 *   - an edge shared by two cells, uncarved -> stroked, a wall
 *   - an edge held by one cell              -> stroked, so the outer border of
 *     the honeycomb draws itself, ragged left and right edges included
 * The two perimeter edges named by src/hex.js as entry and exit are then
 * dropped, which cuts a real gap in that border instead of drawing an arrow at
 * a solid wall.
 *
 * Perimeter edges are stroked heavier than interior ones. That is not
 * decoration: it tells you at a glance where the sheet ends, on a shape whose
 * left and right sides are a zigzag rather than a straight line.
 *
 * THE VIEWBOX IS FIXED BY THE GRID, NOT BY THE CAPTION. The caption is scaled
 * to fit whatever width the margins leave. The isometric renderer originally
 * did the reverse and widened its own margins for a long seed, which made the
 * printed size depend on how many characters you typed into the seed box.
 */
(function (global) {
  'use strict';

  /** @const {string} */
  var INK = '#111111';

  /* Stroke widths in hex circumradius units. A hex is sqrt(3) ~ 1.73 units
   * across, so at the Insane preset -- the smallest cells the app offers -- one
   * unit is about 3.1mm and a wall lands near 0.31mm, comfortably above what a
   * 600dpi laser resolves. */
  /** @const {number} */
  var WALL = 0.10;
  /** @const {number} */
  var BORDER = 0.17;

  // Margins, in the same units. Top clears the START arrow and its label,
  // bottom clears FINISH and the seed caption. See src/presets.js, which solves
  // rows against these numbers to fill A4.
  var mL = 1.2, mR = 1.2, mT = 3.2, mB = 4.8;

  /** @const {string} */
  var FONT = 'font-family="Helvetica,Arial,sans-serif"';

  /* Printed on every sheet. The seed and carver in the caption reproduce the
   * maze exactly, so this is where a reader types them back in to get the
   * solution -- a printed page is otherwise a dead end. Lowercase deliberately:
   * GitHub Pages paths are case-sensitive, so the caps the rest of the caption
   * is set in would 404.
   * @const {string} */
  var SITE = 'moechofe.github.io/printable-maze-generator';

  /* TRACKING SCALES WITH THE CAPTION. SVG letter-spacing is a length in user
   * units, not an em, so a fixed value does not shrink when the caption does:
   * at 0.95 it is the 0.11 em this style was drawn with, but at a third of
   * that size it is most of the line. That is what used to run a fitted caption
   * off the edge of the sheet.
   * @const {number} */
  var TRACK = 0.105;

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

  /**
   * @param {!Array<!MMPoint>} pts
   * @return {string} a closed outline
   */
  function polyD(pts) {
    var d = 'M';
    for (var i = 0; i < pts.length; i++) {
      if (i) d += 'L';
      d += fmt(pts[i][0]) + ' ' + fmt(pts[i][1]);
    }
    return d + 'Z';
  }

  /**
   * @param {!Array<!MMPoint>} pts
   * @return {string} an open run
   */
  function lineD(pts) {
    var d = 'M';
    for (var i = 0; i < pts.length; i++) {
      if (i) d += 'L';
      d += fmt(pts[i][0]) + ' ' + fmt(pts[i][1]);
    }
    return d;
  }

  /**
   * @param {!MMHexOpts} o
   * @return {string}
   */
  function toSvg(o) {
    var g = o.grid, open = o.open;
    var i, k;

    var vbX = g.minX - mL, vbY = g.minY - mT;
    var vbW = (g.maxX - g.minX) + mL + mR;
    var vbH = (g.maxY - g.minY) + mT + mB;

    // --- walls --------------------------------------------------------------
    /** @type {!Array<string>} */
    var inner = [];
    /** @type {!Array<string>} */
    var border = [];
    for (i = 0; i < g.edgeOrder.length; i++) {
      var ek = g.edgeOrder[i];
      if (open[ek]) continue;                       // carved: this is a passage
      if (ek === g.entryEdge || ek === g.exitEdge) continue;   // the two notches
      var ends = g.edgeEnds[ek];
      var d = lineD([ends[0], ends[1]]);
      if (g.edgeCells[ek] === 1) border.push(d); else inner.push(d);
    }

    /**
     * @param {!Array<string>} list
     * @param {number} width
     * @return {string}
     */
    function strokeGroup(list, width) {
      if (!list.length) return '';
      return '<path d="' + list.join('') + '" fill="none" stroke="' + INK +
        '" stroke-width="' + width + '" stroke-linecap="round"/>';
    }

    // --- start and finish, filled solid like the isometric style ------------
    var startC = g.cells[g.start], endC = g.cells[g.end];
    var marks =
      '<path d="' + polyD(startC.poly) + '" fill="' + INK + '"/>' +
      '<path d="' + polyD(endC.poly) + '" fill="' + INK + '"/>';

    // --- solution -----------------------------------------------------------
    var solution = '';
    if (o.showSolution && o.path && o.path.length) {
      // Enter through the notch, leave through the other one, so the drawn
      // route starts and ends outside the honeycomb where the arrows are.
      var pts = [g.edgeMid[g.entryEdge]];

      for (i = 0; i < o.path.length; i++) {
        var cell = g.cells[o.path[i]];
        if (i) {
          /* Bend through the opening rather than cutting corner to corner: on a
           * hex grid two centres can be far enough apart that a straight chord
           * clips the wall between the cells either side of the one it passes
           * through. */
          var list = g.adj[o.path[i - 1]], shared = null;
          for (k = 0; k < list.length; k++) {
            if (list[k].to === o.path[i]) { shared = list[k].key; break; }
          }
          if (shared) pts.push(g.edgeMid[shared]);
        }
        pts.push([cell.cx, cell.cy]);
      }
      pts.push(g.edgeMid[g.exitEdge]);

      var sd = lineD(pts);
      // White halo keeps the route legible where it crosses the filled
      // start and finish cells.
      solution =
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + sd + '" stroke="#ffffff" stroke-width="0.30" opacity="0.92"/>' +
        '<path d="' + sd + '" stroke="#111111" stroke-width="0.12" ' +
          'stroke-dasharray="0.26 0.2"/>' +
        '</g>';
    }

    // --- arrows and labels --------------------------------------------------
    /* The entry notch is the north-west face of the first hex and the exit the
     * south-east face of the last, so the arrows run along that same diagonal
     * -- pointing at the gap rather than at a wall beside it. */
    var ein = g.edgeMid[g.entryEdge], eout = g.edgeMid[g.exitEdge];
    var AX = 0.75, AY = 1.3;      // arrow reach, out along the diagonal

    var labels =
      '<g fill="' + INK + '">' +
      '<path d="M' + fmt(ein[0] - AX) + ' ' + fmt(ein[1] - AY) +
        'L' + fmt(ein[0] - AX + 0.75) + ' ' + fmt(ein[1] - AY + 0.18) +
        'L' + fmt(ein[0] - AX + 0.18) + ' ' + fmt(ein[1] - AY + 0.75) + 'Z"/>' +
      '<path d="M' + fmt(eout[0] + AX) + ' ' + fmt(eout[1] + AY) +
        'L' + fmt(eout[0] + AX - 0.75) + ' ' + fmt(eout[1] + AY - 0.18) +
        'L' + fmt(eout[0] + AX - 0.18) + ' ' + fmt(eout[1] + AY - 0.75) + 'Z"/>' +
      '</g>' +
      '<text x="' + fmt(startC.cx) + '" y="' + fmt(g.minY - 1.7) + '" ' +
        'text-anchor="start" font-size="1.15" ' + FONT +
        ' letter-spacing="0.16" fill="' + INK + '">START</text>' +
      '<text x="' + fmt(endC.cx) + '" y="' + fmt(g.maxY + 2.6) + '" ' +
        'text-anchor="end" font-size="1.15" ' + FONT +
        ' letter-spacing="0.16" fill="' + INK + '">FINISH</text>';

    /* Caption last, and shrunk to the width the margins already fixed -- never
     * the other way round, or the printed scale would depend on the seed. */
    var SEP = ' &#160;&#183;&#160; ';
    var carver = String(o.carver || 'dfs').toUpperCase();
    var caption = 'SEED ' + esc(o.seed) + SEP + g.cols + '&#215;' + g.rows +
      ' HEXES' + SEP + esc(o.label) + SEP + 'HEXAGONAL' + SEP + esc(carver) +
      SEP + SITE;
    var plain = 'SEED ' + o.seed + '  .  ' + g.cols + 'x' + g.rows + ' HEXES  .  ' +
      o.label + '  .  HEXAGONAL  .  ' + carver + '  .  ' + SITE;
    /* Budget the honeycomb's own width rather than the whole viewBox, so a long
     * caption stops at the edges of the maze, not the edges of the paper. */
    /* NO FLOOR UNDER THE SIZE. A floor does not keep a long caption readable,
     * it just decides which end of it gets clipped off by the edge of the
     * viewBox -- and the one thing on the line that must survive is the URL,
     * since that is what makes the printed sheet recoverable. Fitting it
     * against the drawing's own width instead bounds the caption by something
     * strictly narrower than the box, so it always lands inside the sheet.
     * tester/verify.js measures that off the emitted text rather than trusting
     * this arithmetic.
     *
     * 0.78 EM PER GLYPH, TRACKING INCLUDED. Helvetica caps advance about
     * 0.66 em and the tracking above adds the rest; lowercase runs well under
     * that, so this is the all-caps worst case a seed can be typed in. The
     * older 0.68 was measured off a mixed-case caption and did not survive one
     * with the site on the end of it. */
    var capFont = Math.min(0.95, (g.maxX - g.minX) / (plain.length * 0.78));

    var footer =
      '<text x="' + fmt((g.minX + g.maxX) / 2) + '" y="' + fmt(g.maxY + 4.1) + '" ' +
      'text-anchor="middle" font-size="' + fmt(capFont) + '" ' + FONT +
      ' letter-spacing="' + fmt(TRACK * capFont) + '" fill="#444444">' +
      caption + '</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" class="maze-svg" role="img" ' +
      'aria-label="Hexagonal maze, seed ' + esc(o.seed) + '" ' +
      'viewBox="' + fmt(vbX) + ' ' + fmt(vbY) + ' ' + fmt(vbW) + ' ' + fmt(vbH) + '" ' +
      'preserveAspectRatio="xMidYMid meet">' +
      '<rect x="' + fmt(vbX) + '" y="' + fmt(vbY) + '" width="' + fmt(vbW) +
        '" height="' + fmt(vbH) + '" fill="#ffffff"/>' +
      marks +
      '<g class="walls">' +
        strokeGroup(inner, WALL) + strokeGroup(border, BORDER) +
      '</g>' +
      solution +
      labels +
      footer +
      '</svg>';
  }

  var api = { toSvg: toSvg, WALL: WALL, BORDER: BORDER, margins: { l: mL, r: mR, t: mT, b: mB } };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).renderHex = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
