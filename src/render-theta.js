/* Theta renderer: concentric rings, drawn as an ellipse.
 *
 * WHY AN ELLIPSE. A circular maze has a square bounding box, and a square fills
 * only about 70% of an A4 sheet -- well under the 95% floor every other style
 * here is held to, so it would print noticeably smaller than the rest for no
 * reason but its shape. Stretching the whole drawing vertically fixes that, and
 * the stretch is DERIVED rather than chosen: given the ring count and the
 * margins there is exactly one factor that makes the box A4-shaped, and fit()
 * below solves for it. The topology is untouched; the rings simply become
 * ovals.
 *
 * THE STRETCH IS BAKED INTO THE COORDINATES, not applied as a transform. An SVG
 * `scale(1, k)` would scale stroke width with the geometry, so the walls would
 * come out thicker top and bottom than at the sides -- oval ink around an oval
 * maze. Instead every point is placed at its stretched position and every arc
 * is emitted as a genuine elliptical arc, `A rx ry` with ry = rx*k, which keeps
 * one stroke width over the whole drawing.
 *
 * WALLS ARE MERGED BEFORE STROKING, for the same reason the straight-walled
 * styles chain theirs into polylines: a round cap at every cell boundary would
 * bead the drawing. Arcs merge along a ring and spokes merge across rings, so
 * caps land only where a wall genuinely ends.
 *
 * There is no fillet machinery here. Rounding the join between an arc and a
 * spoke is a different construction from rounding the join between two straight
 * lines, and at these weights a round cap reads perfectly well on its own.
 */
(function (global) {
  'use strict';

  /** @const {string} */
  var INK = '#111111';
  /** @const {number} */
  var TAU = Math.PI * 2;

  /** @const {number} */
  var WALL = 0.3;          // in ring units, where a ring is 1 unit thick
  /* The bottom margin carries both the FINISH label and the caption, and the
   * exit arrow reaches almost a unit past the rim before either of them starts,
   * so it needs more room than the other styles give it. Widening it is free:
   * fit() re-solves the stretch around whatever the margins are. */
  var mL = 1.0, mR = 1.0, mT = 2.6, mB = 4.8;

  // Leave a sliver of the sheet unused so rounding can never tip the drawing
  // over the edge and cost it a whole page.
  /** @const {number} */
  var FILL_TARGET = 0.985;

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
   * at 0.62 it is the 0.13 em this style was drawn with, but at a third of
   * that size it is most of the line. That is what used to run a fitted caption
   * off the edge of the sheet.
   * @const {number} */
  var TRACK = 0.129;

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

  /* Solve the vertical stretch, and with it the whole viewBox.
   *
   *   vbW = 2R + wall + mL + mR          (unaffected by the stretch)
   *   vbH = 2Rk + wall + mT + mB
   *
   * so k falls straight out of asking for vbH / vbW to be the A4 ratio. */
  /**
   * @param {number} radius
   * @param {number=} wall
   * @return {!MMThetaFit}
   */
  function fit(radius, wall) {
    var PAPER = /** @type {!MMPaperApi} */ (
      (typeof module !== 'undefined' && module.exports)
        ? require('./paper.js') : global.MM.paper);
    wall = (wall == null) ? WALL : wall;

    var w = 2 * radius + wall + mL + mR;
    var h = w * PAPER.RATIO * FILL_TARGET;
    var k = (h - wall - mT - mB) / (2 * radius);

    /* The ellipse spans +/- radius across and +/- radius*k down, plus half a
     * stroke for the caps; the margins sit outside that. */
    return {
      k: k, w: w, h: h,
      x: -radius - wall / 2 - mL,
      y: -radius * k - wall / 2 - mT
    };
  }

  /**
   * @param {!MMThetaOpts} o
   * @return {string}
   */
  function toSvg(o) {
    var g = o.grid, open = o.open;
    var wall = (o.wall == null) ? WALL : o.wall;
    var R = g.radius;
    var box = fit(R, wall);
    var k = box.k;
    var i;

    /**
     * @param {number} r
     * @param {number} a
     * @return {!MMPoint} on the ellipse, the stretch baked in
     */
    function P(r, a) { return [r * Math.cos(a), r * Math.sin(a) * k]; }
    /**
     * @param {!MMPoint} p
     * @return {string}
     */
    function pt(p) { return fmt(p[0]) + ' ' + fmt(p[1]); }

    /* Collect the standing walls, then merge them. Arcs on one ring are keyed
     * by radius and joined where one ends exactly where the next begins;
     * spokes are keyed by angle and joined across consecutive rings. The angle
     * is rounded before it is used as a key, because two rings can arrive at
     * the same spoke by different arithmetic. */
    var arcs = Object.create(null), spokes = Object.create(null);

    for (i = 0; i < g.edgeOrder.length; i++) {
      var key = g.edgeOrder[i];
      if (open[key]) continue;                       // carved: a passage
      if (key === g.exitWall) continue;              // the way out
      var wdef = g.walls[key];

      if (wdef.type === 'C') {
        (arcs[wdef.r] || (arcs[wdef.r] = [])).push({ a0: wdef.a0, a1: wdef.a1 });
      } else {
        var ak = Math.round(wdef.angle * 1e6) / 1e6;
        (spokes[ak] || (spokes[ak] = [])).push({ r: wdef.r, angle: wdef.angle });
      }
    }

    var d = '';

    Object.keys(arcs).forEach(function (rKey) {
      var r = parseFloat(rKey);
      var list = arcs[rKey].sort(function (a, b) { return a.a0 - b.a0; });
      var runs = [];
      for (var j = 0; j < list.length; j++) {
        var last = runs[runs.length - 1];
        if (last && Math.abs(last.a1 - list[j].a0) < 1e-9) last.a1 = list[j].a1;
        else runs.push({ a0: list[j].a0, a1: list[j].a1 });
      }
      /* A ring walled the whole way round joins its own start; merging the last
       * run into the first stops a cap landing at angle zero for no reason. */
      if (runs.length > 1 && Math.abs(runs[runs.length - 1].a1 - TAU) < 1e-9 &&
          Math.abs(runs[0].a0) < 1e-9) {
        runs[0].a0 = runs[runs.length - 1].a0 - TAU;
        runs.pop();
      }

      for (j = 0; j < runs.length; j++) {
        var span = runs[j].a1 - runs[j].a0;
        if (span >= TAU - 1e-9) {
          // A complete ring cannot be one arc command; two halves close it.
          d += 'M' + pt(P(r, 0)) +
            'A' + fmt(r) + ' ' + fmt(r * k) + ' 0 0 1 ' + pt(P(r, Math.PI)) +
            'A' + fmt(r) + ' ' + fmt(r * k) + ' 0 0 1 ' + pt(P(r, TAU));
          continue;
        }
        d += 'M' + pt(P(r, runs[j].a0)) +
          'A' + fmt(r) + ' ' + fmt(r * k) + ' 0 ' + (span > Math.PI ? 1 : 0) +
          ' 1 ' + pt(P(r, runs[j].a1));
      }
    });

    Object.keys(spokes).forEach(function (aKey) {
      var list = spokes[aKey].sort(function (a, b) { return a.r - b.r; });
      var angle = list[0].angle;
      var runs = [];
      for (var j = 0; j < list.length; j++) {
        var last = runs[runs.length - 1];
        if (last && last.r1 === list[j].r) last.r1 = list[j].r + 1;
        else runs.push({ r0: list[j].r, r1: list[j].r + 1 });
      }
      for (j = 0; j < runs.length; j++) {
        d += 'M' + pt(P(runs[j].r0, angle)) + 'L' + pt(P(runs[j].r1, angle));
      }
    });

    var wallsSvg = '<path d="' + d + '" fill="none" stroke="' + INK +
      '" stroke-width="' + fmt(wall) + '" stroke-linecap="round"/>';

    // --- solution -----------------------------------------------------------
    /* Cell centres, plus one step out through the exit so the route leaves the
     * sheet where the arrow is. */
    var THETA = /** @type {!MMThetaApi} */ (
      (typeof module !== 'undefined' && module.exports)
        ? require('./theta.js') : global.MM.theta);

    var exitA = TAU * (g.cells[g.end].slot + 0.5) / g.cells[g.end].count;
    var solution = '';
    if (o.showSolution && o.path && o.path.length) {
      var sd = 'M';
      for (i = 0; i < o.path.length; i++) {
        var c = THETA.centre(g, o.path[i]);
        sd += (i ? 'L' : '') + fmt(c[0]) + ' ' + fmt(c[1] * k);
      }
      sd += 'L' + pt(P(R + 0.5, exitA));
      solution =
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + sd + '" stroke="#ffffff" stroke-width="0.26" opacity="0.92"/>' +
        '<path d="' + sd + '" stroke="#111111" stroke-width="0.1" ' +
          'stroke-dasharray="0.22 0.16"/>' +
        '</g>';
    }

    // --- markers and labels -------------------------------------------------
    /* The hub is a whole cell wide, so the marker can be a proper disc rather
     * than a dot. It has to be: an inline START label does not fit inside a
     * hub of radius 1 -- at any readable size it lands on the first ring and
     * collides with its walls -- so the caption says where the start is and
     * this is left to be unmistakable on its own. */
    var hubDot = (1 - wall / 2) * 0.72;
    var exitOut = P(R + 0.95, exitA), exitTip = P(R + 0.25, exitA);

    var marks =
      '<circle cx="0" cy="0" r="' + fmt(hubDot) + '" fill="' + INK + '"/>' +
      '<path d="M' + pt(exitOut) + 'L' + fmt(exitOut[0] - 0.34) + ' ' +
        fmt(exitOut[1] + 0.1) + 'L' + fmt(exitOut[0] + 0.34) + ' ' +
        fmt(exitOut[1] + 0.1) + 'Z" fill="' + INK + '"/>' +
      '<text x="' + fmt(exitTip[0]) + '" y="' + fmt(exitOut[1] + 1.3) +
        '" text-anchor="middle" font-size="0.72" ' + FONT +
        ' letter-spacing="0.12" fill="' + INK + '">FINISH</text>';

    var SEP = ' &#160;&#183;&#160; ';
    var carver = String(o.carver || 'dfs').toUpperCase();
    var caption = 'SEED ' + esc(o.seed) + SEP + g.rings + ' RINGS' +
      SEP + esc(o.label) + SEP + 'THETA FROM THE CENTRE' + SEP + esc(carver) +
      SEP + SITE;
    var plain = 'SEED ' + o.seed + '  .  ' + g.rings + ' RINGS  .  ' +
      o.label + '  .  THETA FROM THE CENTRE  .  ' + carver + '  .  ' + SITE;
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
    var capFont = Math.min(0.62, (2 * R) / (plain.length * 0.78));

    var bottom = box.y + box.h;
    var footer =
      '<text x="0" y="' + fmt(bottom - 0.9) + '" text-anchor="middle" ' +
      'font-size="' + fmt(capFont) + '" ' + FONT +
      ' letter-spacing="' + fmt(TRACK * capFont) + '" fill="#444444">' +
      caption + '</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" class="maze-svg" role="img" ' +
      'aria-label="Theta maze, seed ' + esc(o.seed) + '" ' +
      'viewBox="' + fmt(box.x) + ' ' + fmt(box.y) + ' ' + fmt(box.w) + ' ' +
      fmt(box.h) + '" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="' + fmt(box.x) + '" y="' + fmt(box.y) + '" width="' + fmt(box.w) +
        '" height="' + fmt(box.h) + '" fill="#ffffff"/>' +
      wallsSvg +
      solution +
      marks +
      footer +
      '</svg>';
  }

  var api = { toSvg: toSvg, fit: fit, WALL: WALL };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).renderTheta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
