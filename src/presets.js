/* Difficulty presets, shared by the app and by test/verify.js so the two can
 * never drift apart.
 *
 * The three renderers need different parameters, so each preset carries a block
 * per style. `braid` is the fraction of dead ends opened into loops: at 0 the
 * maze is perfect and a wall-follower solves it mechanically, so anything above
 * Easy braids a little to take that shortcut away.
 *
 * EVERY NUMBER BELOW IS SOLVED AGAINST A4, NOT CHOSEN BY EYE. src/paper.js
 * explains the target; the short version is that the printed size of a maze is
 * decided entirely by the aspect ratio of its viewBox, so each style has a
 * closed form for that ratio and the second dimension is whatever makes it land
 * just under 272/190. test/verify.js reads the ratio back out of the rendered
 * SVG and fails if any preset drifts off the sheet.
 *
 * What that means in practice: the FIRST dimension of each pair sets how big a
 * cell prints -- the sheet is always 190mm wide, so a wider maze is a finer one
 * -- and the second is then fixed for you. Difficulty is the first number.
 *
 *   escher: w/h in maze cells on a flat grid.
 *           vbW = 1.62w + 2.62,  vbH = 1.62h + 7.02
 *   iso:    halfWidth is the frame's half width in screen columns and depth its
 *           height in screen rows; terraces and maxRise shape the plateaus and
 *           totalRise fixes how far the landscape climbs overall.
 *           vbW = 1.732(halfWidth + 1) + 4,  vbH = depth/2 + totalRise + 9.6
 *   hex:    cols/rows of pointy-top hexes, odd rows shifted right.
 *           vbW = 1.732(cols + 0.5) + 2.4,  vbH = 1.5*rows + 8.5
 *   engrave: w/h in cells, expanded to a (2w+1) x (2h+1) grid of solid and
 *           open units, corridor 1 and wall 0.55. The width runs 15/22/29/36 --
 *           an even step of 7, which very nearly doubles the cell count at the
 *           bottom and eases off at the top, because what floors this style is
 *           not the corridor but the HATCHING: a wall has to stay wide enough
 *           for four legible lines. Easy comes out at exactly the Escher grid's
 *           cell count, and it tracks it to within 2% at Hard.
 *           vbW = 1.55w + 2.55,  vbH = 1.55h + 6.95
 *   theta:  rings of an elliptical maze, hub outward. The ONLY style with no
 *           second dimension to solve: a circle's box is square and would fill
 *           about 70% of the sheet, so src/render-theta.js stretches the
 *           drawing vertically by exactly the factor that makes the box
 *           A4-shaped. The fit is solved in the renderer, not here.
 *   hexround: cols/rows of the same honeycomb as `hex`, drawn with thick
 *           rounded walls. One lattice pitch is one hex EDGE, so the margins
 *           come out the same as the square version even though a hex is
 *           sqrt(3) edges across.
 *           vbW = 1.732(cols + 0.5) + 2.38,  vbH = 1.5*rows + 7.28
 *
 * `carver` is NOT in this table, and deliberately. It is a control the reader
 * picks (see src/graph.js), it changes texture rather than size, and no viewBox
 * here depends on it -- so a preset that fits A4 fits it under every carver.
 *
 * totalRise is FIXED rather than drawn per terrace, and that is a printing
 * decision. The top of the isometric picture sits at the height of the far
 * corner, so letting the rises fall where they may made the drawing anywhere
 * from 32 to 47 units tall on the same preset -- the same maze printed at
 * anything from 158mm to 190mm wide depending on the seed. Fixing the total and
 * randomising only how it is divided up keeps the terraces varied and the sheet
 * constant. src/terrain.js does the dividing.
 */
(function (global) {
  'use strict';

  var PRESETS = {
    easy: {
      label: 'Easy',
      escher: { w: 15, h: 19, braid: 0.00 },
      iso: { halfWidth: 11, depth: 34, terraces: 4, maxRise: 3, totalRise: 8, braid: 0.00 },
      hex: { cols: 13, rows: 18, braid: 0.00 },
      hexround: { cols: 13, rows: 19, braid: 0.00 },
      engrave: { w: 15, h: 19, braid: 0.00 },
      theta: { rings: 10, braid: 0.00 }
    },
    medium: {
      label: 'Medium',
      escher: { w: 25, h: 33, braid: 0.10 },
      iso: { halfWidth: 15, depth: 46, terraces: 5, maxRise: 4, totalRise: 12, braid: 0.10 },
      hex: { cols: 19, rows: 28, braid: 0.10 },
      hexround: { cols: 17, rows: 26, braid: 0.10 },
      engrave: { w: 22, h: 29, braid: 0.10 },
      theta: { rings: 14, braid: 0.10 }
    },
    hard: {
      label: 'Hard',
      escher: { w: 35, h: 48, braid: 0.20 },
      iso: { halfWidth: 19, depth: 60, terraces: 6, maxRise: 4, totalRise: 15, braid: 0.20 },
      hex: { cols: 25, rows: 38, braid: 0.20 },
      hexround: { cols: 21, rows: 32, braid: 0.20 },
      engrave: { w: 29, h: 39, braid: 0.20 },
      theta: { rings: 18, braid: 0.20 }
    },
    /* Fills A4 like the rest, but at 2.5mm per Escher cell it is right at the
     * limit of what a pencil can be got into. Legible on screen; fine on paper.
     * Two styles floor out well above that, and for reasons of drawing rather
     * than of taste: the rounded honeycomb's walls are solid shapes rather than
     * lines, and the engraved style's walls have to stay wide enough to hold
     * four hatch lines. Both keep a corridor around 3mm here, which is why
     * neither can be pushed to the cell count the Escher grid reaches. */
    insane: {
      label: 'Insane',
      escher: { w: 45, h: 62, braid: 0.25 },
      iso: { halfWidth: 24, depth: 82, terraces: 7, maxRise: 4, totalRise: 17, braid: 0.25 },
      hex: { cols: 33, rows: 51, braid: 0.25 },
      hexround: { cols: 27, rows: 42, braid: 0.25 },
      engrave: { w: 36, h: 49, braid: 0.25 },
      theta: { rings: 24, braid: 0.25 }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS;
  else (global.MM = global.MM || {}).presets = PRESETS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
