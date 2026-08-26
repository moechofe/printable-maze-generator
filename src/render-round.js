/* Rounded-wall renderer.
 *
 * Thick black ink on white. Walls a third of a cell wide, corners as arc
 * fillets, ends rounded, and a closed outer border with a notch cut at each of
 * the two ends -- so the only ways in or out of the drawing are the START and
 * FINISH gaps.
 *
 * THE BORDER IS THE PART THAT CHANGED. This style used to leave the perimeter
 * out entirely and let the edge of the sheet stand in for it, which drew
 * beautifully -- every wall a free-standing shape hanging inside the box -- and
 * read as cheatable. A printed maze has white paper all round it, so a route
 * that simply went round the outside was always available, and the drawing gave
 * no reason to believe it was not allowed. Nothing about the geometry stopped
 * it; the rule lived only in the reader's head. So the perimeter is stroked.
 *
 * WHY THE WALLS ARE STILL A FOREST. In a perfect maze the cells form a spanning
 * tree, which makes the walls -- border included -- a spanning tree of the dual
 * lattice with the whole outside contracted to one point. Pull that point apart
 * again and the border closes into a single cycle: exactly one, which is why
 * cutting the two notches out of it is enough to leave a forest. Braiding only
 * opens further walls, which deletes more dual edges, so it stays one. There
 * are never closed loops of wall, every loose end is a genuine dead end of the
 * wall structure -- the "lollipop" stubs that give the style its look -- and
 * the border reads as one long stroke rather than as a rectangle laid on top.
 *
 * THIS RENDERER KNOWS NOTHING ABOUT SQUARES. It takes a wall lattice -- see
 * src/lattice.js -- and the grid that produced it decides the geometry.
 * src/maze.js hands over a square one and src/hex.js a honeycomb; the chaining
 * into polylines, the corner fillets and the corridor all work out the same way
 * either way. That is the entire reason the lattice abstraction exists.
 *
 * CLEARANCE. With walls of thickness t on a lattice of pitch 1, the narrowest
 * the corridor ever gets is 1 - t, everywhere: two walls a pitch apart each
 * give up t/2 across the corridor, and a stub's end cap projects the same t/2
 * along it. Filleting cannot make it worse -- it OPENS the inside of a turn
 * rather than pinching it, and does so at any turn angle, so this holds at a
 * honeycomb's 120-degree vertices as well as at a square's right angles.
 * test/verify.js measures the emitted geometry rather than trusting the
 * algebra, precisely because the angles now vary.
 *
 * EVERYTHING IS IN LATTICE PITCHES, including the labels and the margins. That
 * works across grids because "one pitch" means the same thing on all of them:
 * the gap between two adjacent cells, and so the width a corridor and a wall
 * have to share. A hexagon is wider than that gap and a square is exactly as
 * wide, but the drawings still come out a comparable number of units across, so
 * one label size suits both. A grid whose cells are far larger than its pitch
 * can override with `sheet.textScale`; neither of the current two needs to.
 */
(function (global) {
  'use strict';

  var INK = '#111111';

  /* Defaults for a square grid. Measured off the reference image: heavy enough
   * to read as a solid shape rather than a line, and still leaving 0.62 of
   * clear corridor. A grid can suggest its own on the sheet -- the honeycomb
   * does, and src/hex.js explains why it has to. */
  var WALL = 0.38;

  /* Corner radius. The cut-back along each leg is r*tan(theta/2), which for a
   * right angle is r and for a honeycomb's 60-degree turn only 0.577r, so a
   * radius safe on the square grid is more than safe on the hex one.
   * src/lattice.js shrinks it further if a leg is too short. */
  var FILLET = 0.42;

  // Margins in lattice pitches: room for the labels and the seed caption.
  var mL = 1.0, mR = 1.0, mT = 2.6, mB = 3.8;

  var FONT = 'font-family="Helvetica,Arial,sans-serif"';

  function fmt(n) { return Math.round(n * 1000) / 1000; }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function lineD(pts) {
    var d = 'M';
    for (var i = 0; i < pts.length; i++) {
      if (i) d += 'L';
      d += fmt(pts[i][0]) + ' ' + fmt(pts[i][1]);
    }
    return d;
  }

  // The nominal viewBox, without rendering anything. src/presets.js is solved
  // against this, so it has to be the one place the box is defined.
  function viewBox(box, span, wall) {
    wall = (wall == null) ? WALL : wall;
    span = span || 1;
    return {
      w: (box.x1 - box.x0) + wall + (mL + mR) * span,
      h: (box.y1 - box.y0) + wall + (mT + mB) * span
    };
  }

  function toSvg(o) {
    var LATTICE = (typeof module !== 'undefined' && module.exports)
      ? require('./lattice.js') : global.MM.lattice;

    var sheet = o.sheet, box = sheet.box;
    // Caller wins, then the grid's own suggestion, then the square default.
    var wall = (o.wall == null) ? (sheet.wall == null ? WALL : sheet.wall) : o.wall;
    var fillet = (o.fillet == null)
      ? (sheet.fillet == null ? FILLET : sheet.fillet) : o.fillet;
    var span = sheet.textScale || 1;
    var i;

    /* The viewBox is NOMINAL, not measured: the grid's own bounds plus half a
     * stroke for the caps, which is exactly far enough out that nothing drawn
     * can leave it. Measuring the ink would come to the same numbers now that
     * the border is always stroked, and would still be the wrong way round --
     * it would let a grid whose border happened not to reach its own bounds
     * print at a different scale. */
    var half = wall / 2;
    var drawnW = box.x1 - box.x0;
    var vb = viewBox(box, span, wall);
    var vbX = box.x0 - half - mL * span, vbY = box.y0 - half - mT * span;

    // --- walls --------------------------------------------------------------
    var lat = LATTICE.build(sheet.entries, sheet.verts);
    var paths = LATTICE.decompose(lat);

    var d = '';
    for (i = 0; i < paths.length; i++) {
      d += LATTICE.filletedPath(LATTICE.simplify(lat, paths[i]), fillet);
    }

    // One path element for every wall: they share a stroke, and round caps make
    // each subpath independent, so there is nothing to gain by splitting them.
    var wallsSvg = '<path d="' + d + '" fill="none" stroke="' + INK +
      '" stroke-width="' + fmt(wall) + '" stroke-linecap="round"/>';

    // --- markers ------------------------------------------------------------
    /* Sized off the cell's inradius less half a wall, which is the largest disc
     * that fits without touching ink, then backed off a little. That is what
     * lets one number serve a square and a hexagon. */
    var dot = ((sheet.inradius || 0.5) - half) * 0.84;
    var ring = Math.min(0.11, dot * 0.42);
    var s = sheet.startXY, e = sheet.endXY;

    var marks =
      '<circle cx="' + fmt(s[0]) + '" cy="' + fmt(s[1]) + '" r="' + fmt(dot) +
        '" fill="' + INK + '"/>' +
      '<circle cx="' + fmt(e[0]) + '" cy="' + fmt(e[1]) + '" r="' + fmt(dot - ring / 2) +
        '" fill="none" stroke="' + INK + '" stroke-width="' + fmt(ring) + '"/>';

    // --- solution -----------------------------------------------------------
    /* Straight from cell centre to cell centre. The corridor is 1 - wall wide
     * in lattice units and centred on the same line, so the route cannot touch
     * a wall -- which is why these widths are absolute and do not scale with
     * the cell. */
    var solution = '';
    if (o.showSolution && o.pathXY && o.pathXY.length) {
      var sd = lineD(o.pathXY);
      solution =
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + sd + '" stroke="#ffffff" stroke-width="0.30" opacity="0.92"/>' +
        '<path d="' + sd + '" stroke="#111111" stroke-width="0.11" ' +
          'stroke-dasharray="0.24 0.18"/>' +
        '</g>';
    }

    // --- labels -------------------------------------------------------------
    var labelFont = 0.72 * span;
    var labels =
      '<text x="' + fmt(s[0]) + '" y="' + fmt(box.y0 - 1.05 * span) +
        '" text-anchor="middle" font-size="' + fmt(labelFont) + '" ' + FONT +
        ' letter-spacing="0.12" fill="' + INK + '">START</text>' +
      '<text x="' + fmt(e[0]) + '" y="' + fmt(box.y1 + 1.55 * span) +
        '" text-anchor="middle" font-size="' + fmt(labelFont) + '" ' + FONT +
        ' letter-spacing="0.12" fill="' + INK + '">FINISH</text>';

    /* Caption fitted to the drawing width, never the reverse -- the box above
     * is already settled, and letting a long seed widen it would make the
     * printed scale depend on the seed text. */
    var SEP = ' &#160;&#183;&#160; ';
    var carver = String(o.carver || 'dfs').toUpperCase();
    var kind = String(o.kind || 'ROUNDED');
    var caption = 'SEED ' + esc(o.seed) + SEP + esc(sheet.dims) +
      SEP + esc(o.label) + SEP + esc(kind) + SEP + esc(carver);
    var plain = 'SEED ' + o.seed + '  .  ' + sheet.dims + '  .  ' +
      o.label + '  .  ' + kind + '  .  ' + carver;
    // 0.68 em per glyph, measured off a render rather than guessed.
    var capFont = Math.max(0.3 * span, Math.min(0.62 * span,
      drawnW / (plain.length * 0.68)));

    var footer =
      '<text x="' + fmt((box.x0 + box.x1) / 2) + '" y="' +
      fmt(box.y1 + 2.85 * span) + '" text-anchor="middle" font-size="' +
      fmt(capFont) + '" ' + FONT + ' letter-spacing="0.08" fill="#444444">' +
      caption + '</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" class="maze-svg" role="img" ' +
      'aria-label="' + esc(kind.toLowerCase()) + ' maze, seed ' + esc(o.seed) + '" ' +
      'viewBox="' + fmt(vbX) + ' ' + fmt(vbY) + ' ' + fmt(vb.w) + ' ' + fmt(vb.h) + '" ' +
      'preserveAspectRatio="xMidYMid meet">' +
      '<rect x="' + fmt(vbX) + '" y="' + fmt(vbY) + '" width="' + fmt(vb.w) +
        '" height="' + fmt(vb.h) + '" fill="#ffffff"/>' +
      wallsSvg +
      solution +
      marks +
      labels +
      footer +
      '</svg>';
  }

  var api = {
    toSvg: toSvg, viewBox: viewBox,
    WALL: WALL, FILLET: FILLET,
    margins: { l: mL, r: mR, t: mT, b: mB }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).renderRound = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
