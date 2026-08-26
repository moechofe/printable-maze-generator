/* Escher-style ambiguous depth.
 *
 * A block lit from the north-west with its shadow falling south-east reads as
 * RAISED. The identical silhouette lit from the south-east reads as SUNKEN.
 * Flipping that polarity per block is how the depth cue is broken.
 *
 * The important detail is that polarity is assigned in COHERENT PATCHES, not
 * per block. Per-block noise just looks like static. Patches of ~25 units each
 * read as a believable surface on their own and contradict their neighbours,
 * so depth flips as the eye travels across the page -- which is the effect we
 * are after.
 *
 * Each region stays INTERNALLY consistent (its shading and its cast shadow
 * agree with its own light direction). It is the disagreement BETWEEN regions
 * that is impossible. That is what makes it read as an illusion rather than
 * as a rendering bug.
 */
(function (global) {
  'use strict';

  // Extrusion points up-left by default: -135 degrees in screen space, where
  // +y runs down the page.
  /** @const {number} */
  var BASE_ANGLE = -Math.PI * 0.75;

  /**
   * @param {!MMSolidGrid} grid
   * @param {!MMRng} rng
   * @param {?MMRegionOpts=} opts
   * @return {!MMRegions} a patch per unit, and how each patch reads
   */
  function buildRegions(grid, rng, opts) {
    opts = opts || {};
    var gw = grid.gw, gh = grid.gh, n = gw * gh;
    var targetSize = opts.regionSize || 34;
    var count = Math.max(4, Math.round(n / targetSize));

    var region = new Int32Array(n).fill(-1);
    /** @type {!Array<number>} */
    var seeds = [];
    /** @type {!Object<number, number>} */
    var taken = {};
    var i;

    for (i = 0; i < count; i++) {
      var idx = rng.int(n), guard = 0;
      while (taken[idx] && guard++ < 50) idx = rng.int(n);
      if (taken[idx]) continue;
      taken[idx] = 1;
      region[idx] = seeds.length;
      seeds.push(idx);
    }

    // Multi-source BFS => Voronoi-ish patches with organic borders. Consumes
    // no randomness itself, so it stays deterministic given the seed points.
    var queue = seeds.slice(), head = 0;
    /** @const {!Array<!Array<number>>} */
    var STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < queue.length) {
      var cur = queue[head++];
      var cx = cur % gw, cy = (cur / gw) | 0, r = region[cur];
      for (var k = 0; k < 4; k++) {
        var nx = cx + STEPS[k][0], ny = cy + STEPS[k][1];
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        var ni = ny * gw + nx;
        if (region[ni] !== -1) continue;
        region[ni] = r;
        queue.push(ni);
      }
    }

    /** @type {!Array<!MMRegionTrait>} */
    var traits = [];
    for (var s = 0; s < seeds.length; s++) {
      // `skew` tilts this patch's extrusion away from the shared diagonal, so
      // neighbouring patches also disagree about which way "up" points.
      var skew = rng.range(-0.28, 0.28);
      var angle = BASE_ANGLE + skew;
      traits.push({
        polarity: rng.chance(0.5) ? 1 : -1,
        /* Capped at 0.55: the top face overhangs the footprint by up to
         * depth * Uw * 0.875 on an axis (0.875 = the worst skew), and at a
         * patch border two facing walls can both overhang into the SAME
         * corridor. 0.55 keeps that worst case at 0.30 per side, leaving
         * 0.40 of the corridor open. test/verify.js asserts this. */
        depth: rng.range(0.35, 0.55),
        dirx: Math.cos(angle),
        diry: Math.sin(angle),
        // 1 in 3 patches gets a faintly toned floor, so some corridors read as
        // raised platforms instead of trenches.
        floorAlt: rng.int(3) === 0
      });
    }

    return { region: region, traits: traits, count: seeds.length };
  }

  /**
   * @param {!MMRegions} regions
   * @param {number} idx
   * @return {!MMRegionTrait}
   */
  function traitAt(regions, idx) {
    return regions.traits[regions.region[idx]];
  }

  /**
   * @param {!MMRegions} regions
   * @return {string}
   */
  function signature(regions) {
    return regions.count + ':' + Array.prototype.join.call(regions.region, ',');
  }

  var api = {
    BASE_ANGLE: BASE_ANGLE,
    buildRegions: buildRegions,
    traitAt: traitAt,
    signature: signature
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).escher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
