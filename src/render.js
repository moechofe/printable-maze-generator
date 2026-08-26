/* SVG renderer.
 *
 * THE TOPOLOGY GUARD -- the rule every decision here answers to:
 *   - Corridors are always the lightest tone on the page, and every block face
 *     carries a solid black outline at full opacity. You can always TRACE the
 *     maze.
 *   - Only the depth reading lies. You cannot resolve the page into a coherent
 *     3D surface, and the false surface pulls your eye down wrong corridors.
 * Break this and the maze becomes unfair on screen and mud on a laser printer.
 *
 * SVG rather than canvas: it prints crisp at any DPI, restyles under
 * @media print, and the solution is one <path> to add or drop.
 */
(function (global) {
  'use strict';

  /** @const {number} */
  var Uc = 1;      // corridor width, in abstract units
  /** @const {number} */
  var Uw = 0.62;   // wall thickness -- deliberately thinner than a corridor so
                   // that block overhang never crowds a passage shut

  /* Greyscale ramp, widened so the depth flip actually reads. Values are
   * spaced to survive laser dot gain, and strictly ordered so that no wall
   * face can ever be mistaken for floor:
   *   floor 255 / 250  >  top 232  >  shadow 205  >  lit 168  >  mid 125  >  dark 74
   * The near-white pair is the deliberately subtle floor variation; every
   * other step is >= 18 levels apart. */
  /** @const */
  var C = {
    floor:  '#ffffff',
    floorB: '#fafafa',
    top:    '#e8e8e8',
    shadow: '#cdcdcd',
    lit:    '#a8a8a8',
    mid:    '#7d7d7d',
    dark:   '#4a4a4a',
    ink:    '#000000'
  };

  /** @const {number} */
  var STROKE = 0.045;

  // Even grid index = wall/pillar unit, odd = cell unit.
  /**
   * @param {number} i
   * @return {number} where that grid line falls, in drawing units
   */
  function pos(i) { return Math.ceil(i / 2) * Uw + Math.floor(i / 2) * Uc; }
  /**
   * @param {number} i
   * @return {number} how wide that unit is
   */
  function span(i) { return (i % 2 === 0) ? Uw : Uc; }

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
   * @param {!Array<!MMPoint>} points
   * @return {string} a closed SVG path
   */
  function pathD(points) {
    var out = 'M';
    for (var i = 0; i < points.length; i++) {
      if (i) out += 'L';
      out += fmt(points[i][0]) + ' ' + fmt(points[i][1]);
    }
    return out + 'Z';
  }

  // Monotone chain hull -- used for cast shadows, which are the silhouette of
  // a square swept along the shadow offset.
  /**
   * @param {!Array<!MMPoint>} pts
   * @return {!Array<!MMPoint>} the convex hull, counter-clockwise
   */
  function hull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    /**
     * @param {!MMPoint} o
     * @param {!MMPoint} a
     * @param {!MMPoint} b
     * @return {number}
     */
    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
    var lower = [], upper = [], i;
    for (i = 0; i < p.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
      lower.push(p[i]);
    }
    for (i = p.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
      upper.push(p[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  /**
   * @param {!Array<!MMPoint>} points
   * @param {string} fill
   * @return {string} one outlined block face
   */
  function face(points, fill) {
    return '<path d="' + pathD(points) + '" fill="' + fill +
      '" stroke="' + C.ink + '" stroke-width="' + STROKE + '" stroke-linejoin="round"/>';
  }

  /**
   * @param {number} dot how squarely this face meets the light
   * @return {string} a tone from the ramp, never light enough to read as floor
   */
  function shadeFor(dot) {
    if (dot > 0.25) return C.lit;
    if (dot < -0.25) return C.dark;
    return C.mid;
  }

  /**
   * @param {?} s
   * @return {string} safe to drop into markup
   */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * @param {!MMEscherOpts} o
   * @return {string} the whole drawing, as one SVG element
   */
  function toSvg(o) {
    var grid = o.grid, regions = o.regions;
    var gw = grid.gw, gh = grid.gh, solid = grid.solid;
    var totalW = pos(gw - 1) + span(gw - 1);
    var totalH = pos(gh - 1) + span(gh - 1);

    /* Room top and bottom for the START / FINISH labels and the seed caption.
     * mT has to clear the cap height of the START text, which sits at -1.5 in
     * a 0.72 font: at the old 2.2 the tops of the letters landed exactly on the
     * edge of the viewBox and the browser clipped them off. */
    var mL = 1.0, mR = 1.0, mT = 2.6, mB = 3.8;
    var vbW = totalW + mL + mR, vbH = totalH + mT + mB;

    /* Light direction, as a vector pointing FROM the scene TOWARD the light.
     * The UI angle is compass-style: 0 = from the top, 90 = from the right.
     *
     * Contrast peaks when the light runs PERPENDICULAR to the extrusion axis.
     * Blocks lean up-left, so 45 and 225 light one visible face and shade the
     * other; 135 and 315 hit both faces equally and the maze goes flat. That
     * is why the default is 45 and not a cosier top-left. */
    var theta = (o.light == null ? 45 : o.light) * Math.PI / 180;
    var L = { x: Math.sin(theta), y: -Math.cos(theta) };

    var floorParts = [], shadowParts = [], blocks = [];

    for (var gy = 0; gy < gh; gy++) {
      for (var gx = 0; gx < gw; gx++) {
        var idx = gy * gw + gx;
        var t = regions.traits[regions.region[idx]];
        var x = pos(gx), y = pos(gy), w = span(gx), h = span(gy);

        if (!solid[idx]) {
          if (t.floorAlt) {
            floorParts.push('<rect x="' + fmt(x) + '" y="' + fmt(y) +
              '" width="' + fmt(w) + '" height="' + fmt(h) + '" fill="' + C.floorB + '"/>');
          }
          continue;
        }

        var pol = t.polarity;
        // Polarity flips the extrusion AND the light together, so each patch
        // is self-consistent while contradicting its neighbours.
        var offx = t.dirx * t.depth * Uw * pol;
        var offy = t.diry * t.depth * Uw * pol;
        var Lx = L.x * pol, Ly = L.y * pol;

        var B = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        var T = [
          [B[0][0] + offx, B[0][1] + offy], [B[1][0] + offx, B[1][1] + offy],
          [B[2][0] + offx, B[2][1] + offy], [B[3][0] + offx, B[3][1] + offy]
        ];

        // Cast shadow falls away from the light this patch believes in.
        var slen = t.depth * Uw * 1.75;
        var sx = -Lx * slen, sy = -Ly * slen;
        shadowParts.push('<path d="' + pathD(hull([
          B[0], B[1], B[2], B[3],
          [B[0][0] + sx, B[0][1] + sy], [B[1][0] + sx, B[1][1] + sy],
          [B[2][0] + sx, B[2][1] + sy], [B[3][0] + sx, B[3][1] + sy]
        ])) + '" fill="' + C.shadow + '"/>');

        // Only the two faces the extrusion turns toward the viewer are visible.
        var sides = [];
        if (offx < 0) sides.push({ p: [T[1], T[2], B[2], B[1]], d: Lx });        // right face,  normal (1,0)
        else if (offx > 0) sides.push({ p: [T[0], T[3], B[3], B[0]], d: -Lx });  // left face,   normal (-1,0)
        if (offy < 0) sides.push({ p: [T[3], T[2], B[2], B[3]], d: Ly });        // bottom face, normal (0,1)
        else if (offy > 0) sides.push({ p: [T[0], T[1], B[1], B[0]], d: -Ly });  // top face,    normal (0,-1)

        // Darker face first, so the brighter one wins the shared corner wedge.
        sides.sort(function (a, b) { return a.d - b.d; });

        var svg = '';
        for (var s = 0; s < sides.length; s++) svg += face(sides[s].p, shadeFor(sides[s].d));
        svg += face(T, C.top);

        /* Painter order, per block, taken from its own offset: whichever corner
         * the top face leans away from is the near one and must be drawn last.
         * Patches that lean opposite ways therefore occlude each other
         * impossibly along their borders -- which is on-theme, not a bug. */
        blocks.push({
          ky: (offy < 0) ? gy : -gy,
          kx: (offx < 0) ? gx : -gx,
          svg: svg
        });
      }
    }

    blocks.sort(function (a, b) { return (a.ky - b.ky) || (a.kx - b.kx); });
    var blockSvg = '';
    for (var b = 0; b < blocks.length; b++) blockSvg += blocks[b].svg;

    // --- solution, markers, labels -----------------------------------------
    var entryX = pos(1) + Uc / 2;
    var exitX = pos(gw - 2) + Uc / 2;

    var solutionSvg = '';
    if (o.showSolution && o.path) {
      var mw = o.maze.width;
      var pts = [[entryX, 0]];
      for (var i = 0; i < o.path.length; i++) {
        var cell = o.path[i];
        pts.push([
          pos(2 * (cell % mw) + 1) + Uc / 2,
          pos(2 * ((cell / mw) | 0) + 1) + Uc / 2
        ]);
      }
      pts.push([exitX, totalH]);

      var d = 'M';
      for (var q = 0; q < pts.length; q++) {
        if (q) d += 'L';
        d += fmt(pts[q][0]) + ' ' + fmt(pts[q][1]);
      }
      // White halo underneath keeps the route readable over any wall tone.
      solutionSvg =
        '<g class="solution" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + d + '" stroke="#ffffff" stroke-width="0.42" opacity="0.9"/>' +
        '<path d="' + d + '" stroke="#111111" stroke-width="0.17" stroke-dasharray="0.34 0.26"/>' +
        '</g>';
    }

    var LABEL_FONT = 'font-family="Helvetica,Arial,sans-serif"';
    var markers =
      '<path d="M' + fmt(entryX - 0.42) + ' -1.15L' + fmt(entryX + 0.42) +
        ' -1.15L' + fmt(entryX) + ' -0.3Z" fill="' + C.ink + '"/>' +
      '<text x="' + fmt(entryX) + '" y="-1.5" text-anchor="middle" font-size="0.72" ' +
        LABEL_FONT + ' letter-spacing="0.12" fill="' + C.ink + '">START</text>' +
      '<path d="M' + fmt(exitX - 0.42) + ' ' + fmt(totalH + 0.3) + 'L' + fmt(exitX + 0.42) +
        ' ' + fmt(totalH + 0.3) + 'L' + fmt(exitX) + ' ' + fmt(totalH + 1.15) + 'Z" fill="' + C.ink + '"/>' +
      '<text x="' + fmt(exitX) + '" y="' + fmt(totalH + 2.0) + '" text-anchor="middle" font-size="0.72" ' +
        LABEL_FONT + ' letter-spacing="0.12" fill="' + C.ink + '">FINISH</text>';

    // Numeric character refs (middle dot, multiply sign, degree) keep this
    // source file pure ASCII while the rendered caption still reads properly.
    var SEP = ' &#160;&#183;&#160; ';
    var light = Math.round(o.light);
    var carver = String(o.carver || 'dfs').toUpperCase();
    var caption = 'SEED ' + esc(o.seed) + SEP + o.maze.width + '&#215;' + o.maze.height +
      SEP + esc(o.label) + SEP + 'LIGHT ' + light + '&#176;' +
      SEP + esc(carver) + SEP + SITE;
    /* Fitted to the drawing, never the reverse -- the margins above are already
     * settled, and widening them for a long caption would make the printed
     * scale depend on the seed text. 0.68 em per glyph, as in the other five.
     * The site is what made the fitting necessary here: at a fixed 0.62 the
     * caption ran off an Easy sheet as soon as the URL was added to it. */
    var plain = 'SEED ' + o.seed + '  .  ' + o.maze.width + 'x' + o.maze.height +
      '  .  ' + o.label + '  .  LIGHT ' + light + 'd  .  ' + carver + '  .  ' + SITE;
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
    var capFont = Math.min(0.62, totalW / (plain.length * 0.78));
    var footer =
      '<text x="' + fmt(totalW / 2) + '" y="' + fmt(totalH + 3.0) + '" text-anchor="middle" ' +
      'font-size="' + fmt(capFont) + '" ' + LABEL_FONT +
      ' letter-spacing="' + fmt(TRACK * capFont) + '" fill="#444444">' +
      caption + '</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" class="maze-svg" role="img" ' +
      'aria-label="Maze, seed ' + esc(o.seed) + '" ' +
      'viewBox="' + fmt(-mL) + ' ' + fmt(-mT) + ' ' + fmt(vbW) + ' ' + fmt(vbH) + '" ' +
      'preserveAspectRatio="xMidYMid meet">' +
      '<rect x="' + fmt(-mL) + '" y="' + fmt(-mT) + '" width="' + fmt(vbW) + '" height="' + fmt(vbH) + '" fill="#ffffff"/>' +
      '<g class="floor">' + floorParts.join('') + '</g>' +
      '<g class="shadows">' + shadowParts.join('') + '</g>' +
      '<g class="blocks">' + blockSvg + '</g>' +
      solutionSvg +
      '<g class="marks">' + markers + '</g>' +
      footer +
      '</svg>';
  }

  var api = { toSvg: toSvg, COLORS: C, Uc: Uc, Uw: Uw, pos: pos, span: span };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).render = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
