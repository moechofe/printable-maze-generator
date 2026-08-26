/* Seeded pseudo-random number generator.
 *
 * INVARIANT: every random decision in this app -- maze carving, braiding,
 * Escher region assignment, per-region lighting -- draws from one stream
 * created here. A seed therefore reproduces the exact image, which means
 * CONSUMPTION ORDER MATTERS. Adding a draw in the middle of an existing
 * phase silently changes every previously shared seed.
 *
 * Order of consumption (see app.js): carve -> braid -> regions.
 */
(function (global) {
  'use strict';

  // Ambiguous glyphs (I, O) left out so a seed can be read off paper.
  /** @const {string} */
  var ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  /**
   * @param {string} str
   * @return {function(): number} a 32-bit seed generator over that string
   */
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  /**
   * @param {number} a
   * @return {function(): number} the stream, each draw in [0, 1)
   */
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * @param {?} seedString anything; it is stringified and hashed
   * @return {!MMRng}
   */
  function makeRng(seedString) {
    var next = mulberry32(xmur3(String(seedString))());
    return {
      next: next,
      int: function (n) { return Math.floor(next() * n); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; },
      range: function (lo, hi) { return lo + next() * (hi - lo); },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  }

  /**
   * @param {number=} len
   * @return {string}
   */
  function randomSeed(len) {
    len = len || 6;
    /** @type {(!Uint8Array|!Array<number>)} */
    var bytes;
    var i, out = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
    } else {
      bytes = [];
      for (i = 0; i < len; i++) bytes.push(Math.floor(Math.random() * 256));
    }
    for (i = 0; i < len; i++) out += ALPHABET.charAt(bytes[i] % ALPHABET.length);
    return out;
  }

  // Any text works as a seed (it gets hashed); this only normalises how it
  // is displayed and stored so "abc" and "ABC " are the same maze.
  /**
   * @param {?} text
   * @return {string}
   */
  function normalizeSeed(text) {
    return String(text == null ? '' : text).trim().toUpperCase();
  }

  var api = {
    makeRng: makeRng,
    randomSeed: randomSeed,
    normalizeSeed: normalizeSeed,
    ALPHABET: ALPHABET
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).rng = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
