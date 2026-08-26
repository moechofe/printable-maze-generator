/* Terraced heightmap for the isometric renderer.
 *
 * THE MONOTONICITY INVARIANT, which everything else here exists to produce:
 *
 *     H(x+1, y) <= H(x, y)   and   H(x, y+1) <= H(x, y)
 *
 * Height never rises as you move toward the camera. Two things follow, and
 * both are load-bearing rather than cosmetic:
 *
 * 1. THE SURFACE IS CONNECTED. Every cliff faces the camera, so every cliff is
 *    drawn. The +X edge of a top face meets either the equally high top face
 *    beside it or the cliff descending from it; the foot of that cliff lands
 *    exactly on the top face of the neighbouring column. So you can always walk
 *    the skin, and src/surface.js can carve one maze across the whole thing.
 *
 *    Without this the surface TEARS: where a nearer column is taller, the face
 *    between them points away from the camera and is never drawn, leaving the
 *    lower top face dead-ending against a wall that is not there. Measured on
 *    unconstrained noise, that stranded the start cell in a 3-cell island about
 *    a quarter of the time.
 *
 * 2. NOTHING IS OCCLUDED. In this projection (1,1,1) is the view axis, so the
 *    top of column (x,y) is hidden iff H(x+t, y+t) > H(x,y) + t for some
 *    t >= 1. Monotonicity gives H(x+t, y+t) <= H(x,y), which is stronger than
 *    what is needed. An occluded face would be maze the solver cannot see.
 *
 * Both are asserted in test/verify.js.
 *
 * TERRACES ARE BUILT IN SCREEN COORDINATES, not in (x,y). Writing them in (x,y)
 * and then viewing through a rotated frame puts every terrace boundary in the
 * wrong place -- the visible window ends up straddling the whole height range,
 * so the top of the picture comes out stepped and the bottom one dead flat
 * plain.
 *
 * So work in u = x - y across the screen and v = x + y down it. Translating the
 * monotonicity invariant into those coordinates, a terrace region has to be
 * closed under (u+1, v-1) and (u-1, v-1) -- moving up-screen either way stays
 * inside it. That is exactly the set {(u,v) : v <= b(u)} for a 1-LIPSCHITZ
 * boundary b, meaning |b(u+1) - b(u)| <= 1. Stack such regions, each below the
 * last, and give each a rise:
 *
 *     H(u,v) = sum of rise_t over every terrace with v <= b_t(u)
 *
 * min of two 1-Lipschitz functions is 1-Lipschitz, so clipping each boundary to
 * the one above keeps every region valid and the stack nested. A run of +1
 * steps in b draws a straight cliff edge at 30 degrees, the natural isometric
 * direction -- so terraces come out with the long angled edges of the
 * reference rather than looking like contour lines.
 */
(function (global) {
  'use strict';

  /* A rectangular window onto the landscape.
   *
   * A diamond in (x,y) is a RECTANGLE on screen, because screen position is u
   * across and v down. Taking the whole square grid instead gives the familiar
   * isometric diamond, which leaves the four corners of the paper empty and puts
   * the peak of the terrain on show. A rectangular window fills the sheet and
   * crops the peak away, so the terraces read as a landscape, not a ziggurat.
   *
   * v starts at U rather than 0 so x and y stay non-negative across the full
   * width; starting at 0 would taper the top rows back into a point. */
  /**
   * @param {number} halfWidth
   * @param {number} depth
   * @return {!MMFrame}
   */
  function frame(halfWidth, depth) {
    // V even so the bottom-right corner column lands on the lattice.
    var U = halfWidth, V = 2 * Math.round(depth / 2);
    var v0 = U;
    var n = U + Math.ceil((v0 + V) / 2) + 1;
    var mask = new Uint8Array(n * n);

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = x - y, v = x + y;
        if (Math.abs(u) <= U && v >= v0 && v <= v0 + V) mask[y * n + x] = 1;
      }
    }
    return { n: n, mask: mask, halfWidth: U, depth: V, v0: v0 };
  }

  /* A 1-Lipschitz boundary, walked with persistence: hold a direction for a run
   * of columns, then pick a new one. The runs turn the boundary into long
   * straight cliff edges instead of noise, and holding at 0 for a while gives
   * the flat plateau tops. */
  /**
   * @param {number} width
   * @param {!MMRng} rng
   * @param {number} start
   * @return {!Int32Array} a 1-Lipschitz boundary, one v per screen column
   */
  function boundary(width, rng, start) {
    var out = new Int32Array(width);
    var cur = start, dir = 0, run = 0;

    for (var i = 0; i < width; i++) {
      out[i] = cur;
      if (run <= 0) {
        dir = rng.pick([-1, -1, 0, 1, 1]);
        // Long runs: a cliff edge should cross a good part of the picture
        // before it turns, which is what reads as one big mass rather than a
        // quilt of small steps.
        run = 4 + rng.int(12);
      }
      cur += dir;
      run--;
    }
    return out;
  }

  /* Divide a FIXED total climb among the terraces.
   *
   * The far corner of the frame is inside every terrace, so it sits at the sum
   * of all the rises -- which makes that sum, and nothing else, the height of
   * the printed picture. Drawing each rise independently therefore made the
   * drawing 32 to 47 units tall on the same preset and printed the same
   * difficulty at wildly different scales. Fixing the total and randomising
   * only the split keeps the landscape varied and the sheet constant.
   *
   * Everything starts at 1 -- a terrace with no rise is not a terrace -- and
   * the remainder is handed out one unit at a time to terraces still under
   * maxRise, which is what stops the whole climb collecting in one cliff. */
  /**
   * @param {number} terraces
   * @param {number} totalRise
   * @param {number} maxRise
   * @param {!MMRng} rng
   * @return {!Array<number>} one rise per terrace, summing to totalRise
   */
  function riseSplit(terraces, totalRise, maxRise, rng) {
    var out = [], i;
    for (i = 0; i < terraces; i++) out.push(1);

    // Clamp rather than trust the caller: below `terraces` is unreachable
    // because of the floor above, and above terraces*maxRise unreachable
    // because of the cap.
    var target = Math.max(terraces, Math.min(terraces * maxRise, totalRise));

    for (var left = target - terraces; left > 0; left--) {
      var cands = [];
      for (i = 0; i < terraces; i++) if (out[i] < maxRise) cands.push(i);
      if (!cands.length) break;
      out[cands[rng.int(cands.length)]]++;
    }
    return out;
  }

  /**
   * @param {!MMTerrainOpts} opts
   * @return {!Int32Array} the heightmap, indexed y * n + x
   */
  function build(opts) {
    var spec = opts.frame, rng = opts.rng;
    var U = spec.halfWidth, V = spec.depth, v0 = spec.v0, n = spec.n;
    var terraces = opts.terraces || 7;
    var maxRise = opts.maxRise || 3;
    var width = 2 * U + 1;

    /* Drawn BEFORE the boundaries, not interleaved with them. Consumption order
     * is what a seed reproduces, so this line's position in the file is part of
     * the format. */
    var rises = riseSplit(terraces, opts.totalRise || terraces * maxRise, maxRise, rng);

    /** @type {?Int32Array} */
    var prev = null;
    /** @type {!Array<!MMTerrace>} */
    var regions = [];
    var i;
    for (var t = 1; t <= terraces; t++) {
      // Spread the boundaries down the visible window so terraces appear all
      // over the frame rather than bunching at one end.
      var startV = Math.round(
        v0 + V * (1 - t / (terraces + 1)) + rng.range(-V * 0.07, V * 0.07)
      );

      var b = boundary(width, rng, startV);
      if (prev) {
        for (i = 0; i < width; i++) if (b[i] > prev[i]) b[i] = prev[i];
      }
      regions.push({ b: b, rise: rises[t - 1] });
      prev = b;
    }

    var H = new Int32Array(n * n);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var iu = (x - y) + U;
        if (iu < 0 || iu >= width) continue;
        var v = x + y, h = 0;
        for (var r = 0; r < regions.length; r++) {
          if (v <= regions[r].b[iu]) h += regions[r].rise;
        }
        H[y * n + x] = h;
      }
    }
    return H;
  }

  // Returns the first cell where height rises toward the camera, or null.
  /**
   * @param {!Int32Array} H
   * @param {number} n
   * @param {?Uint8Array=} mask
   * @return {?MMTerrainFault}
   */
  function findRise(H, n, mask) {
    /**
     * @param {number} x
     * @param {number} y
     * @return {boolean}
     */
    function inside(x, y) { return !mask || !!mask[y * n + x]; }
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!inside(x, y)) continue;
        var h = H[y * n + x];
        if (x + 1 < n && inside(x + 1, y) && H[y * n + x + 1] > h) {
          return { x: x, y: y, dir: '+X', here: h, next: H[y * n + x + 1] };
        }
        if (y + 1 < n && inside(x, y + 1) && H[(y + 1) * n + x] > h) {
          return { x: x, y: y, dir: '+Y', here: h, next: H[(y + 1) * n + x] };
        }
      }
    }
    return null;
  }

  // Returns the first cell whose top face would be hidden, or null.
  /**
   * @param {!Int32Array} H
   * @param {number} n
   * @param {?Uint8Array=} mask
   * @return {?MMTerrainFault}
   */
  function findOcclusion(H, n, mask) {
    /**
     * @param {number} x
     * @param {number} y
     * @return {boolean}
     */
    function inside(x, y) { return !mask || !!mask[y * n + x]; }
    for (var y = 0; y + 1 < n; y++) {
      for (var x = 0; x + 1 < n; x++) {
        if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
        if (H[(y + 1) * n + (x + 1)] > H[y * n + x] + 1) {
          return { x: x, y: y, here: H[y * n + x], ahead: H[(y + 1) * n + (x + 1)] };
        }
      }
    }
    return null;
  }

  /**
   * @param {!Int32Array} H
   * @return {string}
   */
  function serialize(H) { return Array.prototype.join.call(H, ''); }

  // The highest point of the landscape -- and so, since the far corner is the
  // top of the picture, the drawing's height above the bottom row.
  /**
   * @param {!Int32Array} H
   * @return {number}
   */
  function maxHeight(H) {
    var m = 0;
    for (var i = 0; i < H.length; i++) if (H[i] > m) m = H[i];
    return m;
  }

  var api = {
    frame: frame,
    build: build,
    riseSplit: riseSplit,
    maxHeight: maxHeight,
    findRise: findRise,
    findOcclusion: findOcclusion,
    serialize: serialize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).terrain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
