/**
 * @fileoverview Externs for the CommonJS half of every module's UMD tail.
 *
 * Each file in src/ ends with
 *
 *     if (typeof module !== 'undefined' && module.exports) module.exports = api;
 *     else (global.MM = global.MM || {}).name = api;
 *
 * so that test/verify.js can require() the same source the browser loads. The
 * compiler only ever emits the browser half -- nothing here is called in a
 * bundle -- but it has to know the names exist, and `module` alone is already
 * in Closure's own externs.
 *
 * @externs
 */

/**
 * @param {string} path
 * @return {?}
 */
function require(path) {}
