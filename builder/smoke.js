/* Run the MINIFIED bundle and make it draw all six styles.
 *
 * WHY THIS EXISTS. build/check.sh proves the annotations are consistent, and
 * test/verify.js proves the SOURCE generates correct mazes -- but neither runs
 * a line of dist/script.js, and ADVANCED compilation is where a maze generator
 * breaks silently: rename a property on one side of a computed lookup and the
 * app throws on the first draw with the type checker perfectly happy. So this
 * loads the compiled file, hands it a DOM barely large enough to be wired up,
 * and asserts that every style still puts a drawing on the page.
 *
 * The bundle is run through vm.runInNewContext rather than require()d, and that
 * is deliberate: a sandbox has no `module`, so each module's UMD tail takes the
 * BROWSER branch and builds the MM namespace -- which is the half of that tail
 * a bundle actually uses.
 *
 * Run: node build/smoke.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var bundle = path.join(root, 'dist', 'script.js');

if (!fs.existsSync(bundle)) {
  console.error('smoke: no dist/script.js -- run build/compile.sh first');
  process.exit(1);
}

var STYLES = ['escher', 'iso', 'hex', 'hexround', 'engrave', 'theta'];
var IDS = [
  'stage', 'style', 'seed', 'size', 'carver', 'carverOut', 'bias', 'biasField',
  'biasOut', 'light', 'lightField', 'lightOut', 'solution', 'stats', 'error',
  'regenerate', 'seedForm', 'print', 'copy'
];

var failures = 0;
function check(ok, what) {
  if (!ok) { failures++; console.log('  FAIL  ' + what); }
}

// --- the smallest DOM the app can be wired into ----------------------------
function makeElement(id) {
  return {
    id: id,
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    listeners: {},
    addEventListener: function (type, fn) { this.listeners[type] = fn; },
    removeEventListener: function () {},
    blur: function () {},
    focus: function () {},
    select: function () {}
  };
}

var els = {};
IDS.forEach(function (id) { els[id] = makeElement(id); });

var sandbox = {
  Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array,
  String: String, Number: Number, Boolean: Boolean, Error: Error,
  RegExp: RegExp, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  Uint8Array: Uint8Array, Int32Array: Int32Array, Float64Array: Float64Array,
  console: console,
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  // Draw straight through rather than waiting for a frame, so a slider change
  // has taken effect by the time the assertion runs.
  requestAnimationFrame: function (fn) { fn(); return 1; },
  cancelAnimationFrame: function () {},
  navigator: { clipboard: null },
  location: {
    hash: '#style=escher&seed=SMOKE&size=easy&carver=auto&bias=70' +
      '&light=45&solution=0',
    href: 'file:///smoke'
  },
  history: {
    replaceState: function (a, b, url) { sandbox.location.hash = url; }
  },
  document: {
    readyState: 'complete',
    activeElement: null,
    getElementById: function (id) { return els[id] || null; },
    addEventListener: function () {}
  },
  print: function () {},
  addEventListener: function () {},
  removeEventListener: function () {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.runInNewContext(fs.readFileSync(bundle, 'utf8'), sandbox,
  { filename: 'dist/script.js' });

// --- the bundle should have wired itself up and drawn once -----------------
/* The namespace is found by shape, not by name: ADVANCED renames `MM` along
 * with everything else in the bundle, and nothing outside it needs the name. */
var ns = Object.keys(sandbox).map(function (k) { return sandbox[k]; })
  .filter(function (v) { return v && typeof v === 'object' && v.presets; })[0];
check(!!ns, 'the bundle built its module namespace');
check(els.error.hidden === true, 'no generation error on load');
check(/^<svg /.test(els.stage.innerHTML), 'a drawing was put on the page');
check(typeof els.style.listeners.change === 'function',
  'the style control was wired up');

// --- every style, through the control the reader actually uses -------------
var A4 = 272 / 190;

function drawStyle(style) {
  els.style.value = style;
  els.style.listeners.change();
  var svg = els.stage.innerHTML;

  check(els.error.hidden === true, style + ': drew without an error');
  check(/^<svg /.test(svg), style + ': produced an svg');

  var vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  check(vb !== null, style + ': the svg carries a viewBox');
  if (vb) {
    var fill = (parseFloat(vb[4]) / parseFloat(vb[3])) / A4;
    check(fill > 0.9 && fill < 1.05,
      style + ': fills the sheet (' + Math.round(fill * 100) + '%)');
  }
  check(/START|FINISH/.test(svg) || style === 'theta',
    style + ': labelled its way in and out');
  check(els.stats.textContent.length > 0, style + ': reported its stats');
  return svg;
}

STYLES.forEach(function (style) {
  var plain = drawStyle(style);

  // The solution overlay is a separate path through every renderer.
  els.solution.checked = true;
  els.solution.listeners.change();
  var solved = els.stage.innerHTML;
  check(solved.length > plain.length, style + ': the solution overlay drew');
  els.solution.checked = false;
  els.solution.listeners.change();
});

// --- the carver control, which is a computed lookup on both sides ----------
['dfs', 'kruskal', 'wilson', 'grow'].forEach(function (name) {
  els.carver.value = name;
  els.carver.listeners.change();
  check(els.error.hidden === true, 'carver ' + name + ': drew without an error');
  check(/^<svg /.test(els.stage.innerHTML), 'carver ' + name + ': produced an svg');
  check(els.stage.innerHTML.indexOf(name.toUpperCase()) !== -1 ||
    name === 'grow', 'carver ' + name + ': named itself in the caption');
});

// The growth-bias slider only exists for the growing tree, and reaching it at
// all means the bias made it into the carve.
els.carver.value = 'grow';
els.carver.listeners.change();
check(els.biasField.hidden === false, 'the bias slider showed for grow');
els.bias.value = '25';
els.bias.listeners.input();
check(/^<svg /.test(els.stage.innerHTML), 'a bias change redrew');

// Every difficulty, since the preset table is looked up by a computed key.
['easy', 'medium', 'hard', 'insane'].forEach(function (size) {
  els.carver.value = 'auto';
  els.carver.listeners.change();
  els.size.value = size;
  els.size.listeners.change();
  check(els.error.hidden === true, size + ': drew without an error');
  check(/^<svg /.test(els.stage.innerHTML), size + ': produced an svg');
});

// A new seed, the way Regenerate does it.
els.regenerate.listeners.click();
check(/^<svg /.test(els.stage.innerHTML), 'regenerate drew a new maze');
check(/seed=[0-9A-Z]+/.test(sandbox.location.hash), 'the hash was written back');

if (failures) {
  console.log('\nsmoke: ' + failures + ' failure(s) in dist/script.js');
  process.exit(1);
}
console.log('smoke: dist/script.js draws all ' + STYLES.length +
  ' styles, every carver and every difficulty');
