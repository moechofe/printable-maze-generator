/* A4 geometry -- the one place the paper size lives.
 *
 * Every style is drawn into an SVG viewBox with `preserveAspectRatio` set to
 * "meet", so what actually decides how big the maze prints is ONE number: the
 * aspect ratio of that viewBox. The print stylesheet gives the SVG the full
 * text column and lets height follow, so:
 *
 *   aspect  = vbH / vbW
 *   printed = 190mm wide by 190mm * aspect tall
 *
 * A4 portrait is 210 x 297mm and @page reserves a 10mm margin, which leaves a
 * 190 x 277mm text column. We design to 272mm rather than 277mm: browsers round
 * the page box a little differently from each other, and 5mm of slack costs
 * about two percent of the drawing while removing every "it printed on two
 * pages" report.
 *
 *   fill = aspect / RATIO
 *
 * fill > 1 means the drawing is taller than the page and gets letterboxed --
 * still one page, but narrower than 190mm and so smaller than it needed to be.
 * fill well under 1 means the bottom of the sheet is left blank. Both are
 * failures of fit, so test/verify.js asserts MIN_FILL <= fill <= 1 for every
 * style at every difficulty, reading the viewBox straight out of the rendered
 * SVG. Preset dimensions are chosen to satisfy it.
 */
(function (global) {
  'use strict';

  var PAGE_W = 210, PAGE_H = 297, MARGIN = 10, SLACK = 5;

  /** @const {number} */
  var USABLE_W = PAGE_W - 2 * MARGIN;              // 190mm
  /** @const {number} */
  var USABLE_H = PAGE_H - 2 * MARGIN - SLACK;      // 272mm
  /** @const {number} */
  var RATIO = USABLE_H / USABLE_W;

  // Below this the sheet reads as half empty. Chosen so every preset clears it
  // with room to spare rather than by being fitted to the current numbers.
  /** @const {number} */
  var MIN_FILL = 0.95;

  /**
   * How much of the sheet a drawing of this aspect ratio covers.
   * @param {number} vbW
   * @param {number} vbH
   * @return {number}
   */
  function fill(vbW, vbH) { return (vbH / vbW) / RATIO; }

  /**
   * @param {number} vbW
   * @param {number} vbH
   * @return {boolean} whether the drawing fills the sheet without overrunning it
   */
  function fits(vbW, vbH) {
    var f = fill(vbW, vbH);
    return f >= MIN_FILL && f <= 1;
  }

  // How large the drawing actually comes out on paper, for the size warnings.
  /**
   * @param {number} vbW
   * @param {number} vbH
   * @return {number} millimetres across, once letterboxing is accounted for
   */
  function printedWidthMm(vbW, vbH) {
    var f = fill(vbW, vbH);
    return f <= 1 ? USABLE_W : USABLE_W / f;
  }

  // One drawing unit, in millimetres, once the sheet is filled.
  /**
   * @param {number} vbW
   * @param {number} vbH
   * @return {number}
   */
  function unitMm(vbW, vbH) { return printedWidthMm(vbW, vbH) / vbW; }

  var api = {
    PAGE_W: PAGE_W, PAGE_H: PAGE_H, MARGIN: MARGIN,
    USABLE_W: USABLE_W, USABLE_H: USABLE_H,
    RATIO: RATIO, MIN_FILL: MIN_FILL,
    fill: fill, fits: fits,
    printedWidthMm: printedWidthMm, unitMm: unitMm
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).paper = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
