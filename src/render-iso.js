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

  var COS30 = Math.sqrt(3) / 2;

  var INK = '#111111';
  var STROKE = 0.085;      // base stroke width, in voxel units
  var STROKE_VARY = 0.022;
  var BOW = 0.05;          // how far a stroke bows off true
  var OVERSHOOT = 0.05;    // pen carrying past the corner

  /* Voxel space to screen. A (1,1,1) displacement maps to (0,0), so that
   * diagonal is the view axis -- which is what src/terrain.js reasons about
   * when it proves nothing is occluded. */
  function project(p) {
    return [
      (p[0] - p[1]) * COS30,
      (p[0] + p[1]) * 0.5 - p[2]
    ];
  }

  function fmt(n) { return Math.round(n * 1000) / 1000; }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* One pen stroke: jittered ends, a slight bow through the middle, and a
   * little overshoot past each corner. The overshoot is what reads as
   * hand-drawn -- machine strokes stop exactly on the join. */
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

  function centroid(pts) {
    var x = 0, y = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1]; }
    return [x / pts.length, y / pts.length];
  }

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
      SEP + esc(o.label) + SEP + 'ISOMETRIC' + SEP + esc(carver);
    var plain = 'SEED ' + o.seed + '  .  ' + o.faceCount + ' FACES  .  ' +
      o.label + '  .  ISOMETRIC  .  ' + carver;
    /* 0.68 em per glyph, measured off a render rather than guessed: Helvetica
     * caps average a little under 0.6 em and the letter-spacing adds the rest.
     * The earlier 0.62 ran the caption about a tenth wider than budgeted. */
    /* Budget the drawing's own width rather than the whole viewBox, so a long
     * caption stops at the edges of the maze, not the edges of the paper. */
    var capFont = Math.max(0.34, Math.min(0.95, drawnW / (plain.length * 0.68)));

    var footer =
      '<text x="' + fmt((minX + maxX) / 2) + '" y="' + fmt(maxY + 4.2) + '" text-anchor="middle" ' +
      'font-size="' + fmt(capFont) + '" ' + FONT + ' letter-spacing="0.12" fill="#444444">' +
      caption + '</text>';

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
