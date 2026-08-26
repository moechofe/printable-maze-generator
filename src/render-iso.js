/* Isometric line-art renderer.
 *
 * Pure black ink on white: walls are strokes, corridors are the white gaps
 * between them. No fills, no greys, no shading -- unlike the Escher renderer,
 * this one carries depth entirely through the isometric projection and the
 * silhouette of the terraces.
 *
 * WALLS ARE DRAWN FROM EDGES, NOT FROM FACES. Every edge of the surface is
 * stroked unless the maze opened it, which gets three cases right at once:
 *   - an edge shared by two faces, carved  -> no stroke, a passage
 *   - an edge shared by two faces, uncarved -> stroked, a wall
 *   - an edge on the silhouette, held by one face -> always stroked, so the
 *     outline of the landscape draws itself
 * It also means a corridor crossing a cube edge is drawn as genuinely
 * continuous, which is the effect the whole isometric idea rests on.
 *
 * The hand-drawn wobble runs off its own RNG stream, seeded from the maze seed
 * with a suffix. Two reasons: the drawing stays reproducible, and adding or
 * retuning a stroke cannot shift the maze stream and change the maze itself.
 */
(function (global) {
  'use strict';

  /** @const {number} */
  var COS30 = Math.sqrt(3) / 2;

  /** @const {string} */
  var INK = '#111111';
  /** @const {number} */
  var STROKE = 0.085;      // base stroke width, in voxel units
  /** @const {number} */
  var STROKE_VARY = 0.022;
  /** @const {number} */
  var BOW = 0.05;          // how far a stroke bows off true
  /** @const {number} */
  var OVERSHOOT = 0.05;    // pen carrying past the corner

  /* Voxel space to screen. A (1,1,1) displacement maps to (0,0), so that
   * diagonal is the view axis -- which is what src/terrain.js reasons about
   * when it proves nothing is occluded. */
  /**
   * @param {!Array<number>} p a voxel-space point, [x, y, z]
   * @return {!MMPoint}
   */
  function project(p) {
    return [
      (p[0] - p[1]) * COS30,
      (p[0] + p[1]) * 0.5 - p[2]
    ];
  }

  /* Printed on every sheet. The seed and carver in the caption reproduce the
   * maze exactly, so this is where a reader types them back in to get the
   * solution -- a printed page is otherwise a dead end. Lowercase deliberately:
   * GitHub Pages paths are case-sensitive, so the caps the rest of the caption
   * is set in would 404.
   * @const {string} */
  var SITE = 'moechofe.github.io/printable-maze-generator';

  /* TRACKING SCALES WITH THE CAPTION. SVG letter-spacing is a length in user
   * units, not an em, so a fixed value does not shrink when the caption does:
   * at 0.95 it is the 0.13 em this style was drawn with, but at a third of
   * that size it is most of the line. That is what used to run a fitted caption
   * off the edge of the sheet.
   * @const {number} */
  var TRACK = 0.126;

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

  /* One pen stroke: jittered ends, a slight bow through the middle, and a
   * little overshoot past each corner. The overshoot is what reads as
   * hand-drawn -- machine strokes stop exactly on the join. */
  /**
   * @param {!MMPoint} a
   * @param {!MMPoint} b
   * @param {!MMRng} rng the ink stream, deliberately not the maze's
   * @return {string}
   */
  function inkStroke(a, b, rng) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;      // along
    var px = -uy, py = ux;                 // across

    var backOff = rng.range(0, OVERSHOOT);
    var foreOff = rng.range(0, OVERSHOOT);

    var x0 = a[0] - ux * backOff + px * rng.range(-BOW, BOW) * 0.5;
    var y0 = a[1] - uy * backOff + py * rng.range(-BOW, BOW) * 0.5;
    var x1 = b[0] + ux * foreOff + px * rng.range(-BOW, BOW) * 0.5;
    var y1 = b[1] + uy * foreOff + py * rng.range(-BOW, BOW) * 0.5;

    var bow = rng.range(-BOW, BOW);
    var cx = (x0 + x1) / 2 + px * bow;
    var cy = (y0 + y1) / 2 + py * bow;

    var w = STROKE + rng.range(-STROKE_VARY, STROKE_VARY);

    return '<path d="M' + fmt(x0) + ' ' + fmt(y0) +
      'Q' + fmt(cx) + ' ' + fmt(cy) + ' ' + fmt(x1) + ' ' + fmt(y1) +
      '" stroke-width="' + fmt(w) + '"/>';
  }

  /**
   * @param {!Array<!MMPoint>} pts
   * @return {!MMPoint}
   */
  function centroid(pts) {
    var x = 0, y = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1]; }
    return [x / pts.length, y / pts.length];
  }

  /**
   * @param {!MMIsoOpts} o
   * @return {string}
   */
  function toSvg(o) {
    var surface = o.surface, open = o.open;
    var faces = surface.faces;
    var rng = o.inkRng;

    // Project every face once.
    var screen = [], i, k;
    for (i = 0; i < faces.length; i++) {
      var q = faces[i].quad, pts = [];
      for (k = 0; k < 4; k++) pts.push(project(q[k]));
      screen.push(pts);
    }

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (i = 0; i < screen.length; i++) {
      for (k = 0; k < 4; k++) {
        var p = screen[i][k];
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }

    // --- start and finish, filled solid like the reference ------------------
    var startIdx = o.startFace, endIdx = o.endFace;
    /**
     * @param {number} idx
     * @return {string}
     */
    function facePoly(idx) {
      var pts = screen[idx], d = 'M';
      for (var j = 0; j < 4; j++) {
        if (j) d += 'L';
        d += fmt(pts[j][0]) + ' ' + fmt(pts[j][1]);
      }
      return d + 'Z';
    }
    var marks =
      '<path d="' + facePoly(startIdx) + '" fill="' + INK + '"/>' +
      '<path d="' + facePoly(endIdx) + '" fill="' + INK + '"/>';

    // --- walls --------------------------------------------------------------
    var strokes = [];
    for (var e = 0; e < surface.edgeOrder.length; e++) {
      var ek = surface.edgeOrder[e];
      if (open[ek]) continue;                      // carved: this is a passage
      var ends = surface.edgeEnds[ek];
      strokes.push(inkStroke(project(ends[0]), project(ends[1]), rng));
    }

    // --- solution -----------------------------------------------------------
    var solution = '';
    if (o.showSolution && o.path && o.path.length) {
      var pathPts = [centroid(screen[o.path[0]])];
      for (i = 1; i < o.path.length; i++) {
        var from = o.path[i - 1], to = o.path[i];
        var list = surface.adj[from], shared = null;
        for (k = 0; k < list.length; k++) {
          if (list[k].to === to) { shared = list[k].key; break; }
        }
        if (shared) {
          // Bend through the shared edge, so the route folds over cube edges
          // instead of cutting the corner through solid rock.
          var se = surface.edgeEnds[shared];
          var a = project(se[0]), b = project(se[1]);
          pathPts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        }
        pathPts.push(centroid(screen[to]));
      }

      var d = 'M';
      for (i = 0; i < pathPts.length; i++) {
        if (i) d += 'L';
        d += fmt(pathPts[i][0]) + ' ' + fmt(pathPts[i][1]);
      }
      solution =
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + d + '" stroke="#ffffff" stroke-width="0.34" opacity="0.92"/>' +
        '<path d="' + d + '" stroke="#111111" stroke-width="0.14" stroke-dasharray="0.3 0.22"/>' +
        '</g>';
    }

    // --- labels -------------------------------------------------------------
    var startC = centroid(screen[startIdx]);
    var endC = centroid(screen[endIdx]);
    var FONT = 'font-family="Helvetica,Arial,sans-serif"';

    var labels =
      '<g stroke="' + INK + '" stroke-width="0.06" fill="none">' +
      '<path d="M' + fmt(startC[0]) + ' ' + fmt(startC[1] - 0.6) +
        'L' + fmt(startC[0]) + ' ' + fmt(startC[1] - 1.7) + '"/>' +
      '<path d="M' + fmt(endC[0]) + ' ' + fmt(endC[1] + 0.6) +
        'L' + fmt(endC[0]) + ' ' + fmt(endC[1] + 1.7) + '"/>' +
      '</g>' +
      '<text x="' + fmt(startC[0]) + '" y="' + fmt(startC[1] - 2.1) + '" text-anchor="middle" ' +
        'font-size="1.15" ' + FONT + ' letter-spacing="0.18" fill="' + INK + '">START</text>' +
      '<text x="' + fmt(endC[0]) + '" y="' + fmt(endC[1] + 3.1) + '" text-anchor="middle" ' +
        'font-size="1.15" ' + FONT + ' letter-spacing="0.18" fill="' + INK + '">FINISH</text>';

    /* MARGINS ARE FIXED; THE CAPTION IS FITTED TO THEM. This used to run the
     * other way -- the caption was set at its natural size and the side margins
     * were widened if it overhung -- which quietly made the viewBox, and so the
     * printed scale, depend on how many characters were in the seed. A long
     * seed shrank the maze. Now the box is decided by the frame alone and the
     * caption shrinks instead, down to a floor where it is still readable. */
    var mL = 2.0, mR = 2.0, mT = 3.4, mB = 5.2;

    var drawnW = maxX - minX;
    var vbX = minX - mL, vbY = minY - mT;
    var vbW = drawnW + mL + mR;
    var vbH = (maxY - minY) + mT + mB;

    var SEP = ' &#160;&#183;&#160; ';
    // Face count, not a grid size -- the surface is not a rectangle of cells.
    var carver = String(o.carver || 'dfs').toUpperCase();
    var caption = 'SEED ' + esc(o.seed) + SEP + o.faceCount + ' FACES' +
      SEP + esc(o.label) + SEP + 'ISOMETRIC' + SEP + esc(carver) + SEP + SITE;
    var plain = 'SEED ' + o.seed + '  .  ' + o.faceCount + ' FACES  .  ' +
      o.label + '  .  ISOMETRIC  .  ' + carver + '  .  ' + SITE;
    /* Budget the drawing's own width rather than the whole viewBox, so a long
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
    var capFont = Math.min(0.95, drawnW / (plain.length * 0.78));

    var footer =
      '<text x="' + fmt((minX + maxX) / 2) + '" y="' + fmt(maxY + 4.2) + '" text-anchor="middle" ' +
      'font-size="' + fmt(capFont) + '" ' + FONT + ' letter-spacing="' +
      fmt(TRACK * capFont) + '" fill="#444444">' + caption + '</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" class="maze-svg" role="img" ' +
      'aria-label="Isometric maze, seed ' + esc(o.seed) + '" ' +
      'viewBox="' + fmt(vbX) + ' ' + fmt(vbY) + ' ' + fmt(vbW) + ' ' + fmt(vbH) + '" ' +
      'preserveAspectRatio="xMidYMid meet">' +
      '<rect x="' + fmt(vbX) + '" y="' + fmt(vbY) + '" width="' + fmt(vbW) +
        '" height="' + fmt(vbH) + '" fill="#ffffff"/>' +
      marks +
      '<g stroke="' + INK + '" fill="none" stroke-linecap="round">' +
        strokes.join('') + '</g>' +
      solution +
      labels +
      footer +
      '</svg>';
  }

  var api = { toSvg: toSvg, project: project };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).renderIso = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
