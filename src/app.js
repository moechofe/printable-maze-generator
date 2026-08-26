/* Wiring: state, URL hash, controls, and the four rendering styles.
 *
 * RNG CONSUMPTION ORDER is load-bearing in every pipeline. Reordering these
 * calls, or slipping a new random draw between them, silently changes every
 * maze anyone has ever shared a seed for. test/verify.js mirrors all four
 * orders exactly.
 *
 *   escher: carve+braid  ->  Escher regions
 *   iso:    terrain      ->  carve  ->  braid
 *   hex:    carve        ->  braid            (the honeycomb itself is fixed)
 *   theta:  carve        ->  braid            (so are the rings)
 *
 * THE SEED NO LONGER DETERMINES THE MAZE ON ITS OWN. The carver does too, and
 * so does its bias where it has one, so all of them together are the answer key
 * -- which is why every renderer prints the carver in its caption alongside the
 * seed, and why the hash carries them. `auto` is not a carver; it resolves
 * through STYLES below before anything random happens.
 *
 * The hand-drawn wobble in the isometric style runs off a SEPARATE stream,
 * seeded from the same seed with a suffix, so retuning a pen stroke cannot
 * shift the maze stream underneath it.
 *
 * Light direction and the solution toggle deliberately consume no randomness,
 * so you can relight a maze or reveal its route without it becoming a
 * different maze.
 */
(function () {
  'use strict';

  var MM = window.MM;
  var PRESETS = MM.presets;
  var els = {};
  var pending = 0;

  /* Every style the app knows about, in one place, so that adding one does not
   * mean hunting for a hard-coded list.
   *
   * `lit`     whether the light control means anything: only the Escher
   *           renderer has a light source at all.
   * `carver`  what "Auto" resolves to for this style. The rounded style wants
   *           Kruskal, whose short dead ends and dense junctions are what give
   *           it the look it is copied from; a depth-first carve draws the same
   *           style as long snaking walls, which is a different picture. The
   *           other three were designed against depth-first and stay there. */
  var STYLES = {
    escher: { lit: true, carver: 'dfs' },
    iso: { lit: false, carver: 'dfs' },
    hex: { lit: false, carver: 'dfs' },
    hexround: { lit: false, carver: 'kruskal' },
    engrave: { lit: false, carver: 'dfs' },
    theta: { lit: false, carver: 'dfs' }
  };

  var CARVERS = { auto: 1, dfs: 1, kruskal: 1, wilson: 1, grow: 1 };

  // 'auto' is a UI convenience, never a value the generators see.
  function activeCarver() {
    return state.carver === 'auto' ? STYLES[state.style].carver : state.carver;
  }

  /* One description of the carve, resolved once per draw and handed to both the
   * generator and the caption. Keeping the label beside the parameters is what
   * stops the printed answer key drifting from what was actually run. */
  function carveSpec() {
    var name = activeCarver();
    if (name !== 'grow') return { name: name, opts: null, label: name };
    return {
      name: name,
      opts: { bias: state.bias / 100 },
      label: 'grow ' + state.bias
    };
  }

  var state = {
    style: 'escher',
    seed: '',
    size: 'medium',
    carver: 'auto',
    bias: 70,
    light: 45,
    solution: false
  };

  // ---------------------------------------------------------------- url hash
  function readHash() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw) return false;
    var haveSeed = false;

    raw.split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq < 0) return;
      var key = pair.slice(0, eq);
      var val = decodeURIComponent(pair.slice(eq + 1));

      if (key === 'seed' && val) {
        state.seed = MM.rng.normalizeSeed(val);
        haveSeed = true;
      } else if (key === 'style' && STYLES[val]) {
        state.style = val;
      } else if (key === 'size' && PRESETS[val]) {
        state.size = val;
      } else if (key === 'carver' && CARVERS[val]) {
        state.carver = val;
      } else if (key === 'bias') {
        var b = parseInt(val, 10);
        if (!isNaN(b)) state.bias = Math.max(0, Math.min(100, b));
      } else if (key === 'light') {
        var n = parseInt(val, 10);
        if (!isNaN(n)) state.light = ((n % 360) + 360) % 360;
      } else if (key === 'solution') {
        state.solution = (val === '1');
      }
    });
    return haveSeed;
  }

  function writeHash() {
    var next = 'style=' + state.style +
      '&seed=' + encodeURIComponent(state.seed) +
      '&size=' + state.size +
      '&carver=' + state.carver +
      '&bias=' + state.bias +
      '&light=' + state.light +
      '&solution=' + (state.solution ? '1' : '0');
    // replaceState, not a hash assignment: dragging the light slider should not
    // bury the back button under a hundred history entries.
    if (location.hash.replace(/^#/, '') !== next) {
      history.replaceState(null, '', '#' + next);
    }
  }

  // --------------------------------------------------------------- pipelines
  /* The Escher and engraved styles are two drawings of the same flat grid, so
   * they generate through here rather than each spelling it out. */
  function flatMaze(cfg, carve) {
    return MM.maze.generate({
      width: cfg.w, height: cfg.h, rng: MM.rng.makeRng(state.seed),
      braid: cfg.braid, carver: carve.name, carverOpts: carve.opts
    });
  }

  function buildEscher(preset, carve) {
    var cfg = preset.escher;
    var rng = MM.rng.makeRng(state.seed);

    var maze = flatMaze(cfg, carve);
    var grid = MM.maze.toSolidGrid(maze);
    var regions = MM.escher.buildRegions(grid, rng, {});
    var path = MM.maze.solve(maze);

    // Guaranteed structurally by the carver; assert rather than trust, and
    // refuse to draw a maze we cannot prove is finishable.
    if (!path) throw new Error('no route from start to finish for seed ' + state.seed);

    return {
      svg: MM.render.toSvg({
        maze: maze, grid: grid, regions: regions, path: path,
        light: state.light, showSolution: state.solution,
        seed: state.seed, label: preset.label, carver: carve.label
      }),
      stats: maze.width + '×' + maze.height + ' cells · shortest route ' +
        path.length + ' steps'
    };
  }

  function buildIso(preset, carve) {
    var cfg = preset.iso;
    var rng = MM.rng.makeRng(state.seed);

    var frame = MM.terrain.frame(cfg.halfWidth, cfg.depth);
    var H = MM.terrain.build({
      frame: frame, terraces: cfg.terraces, maxRise: cfg.maxRise, rng: rng
    });
    var surface = MM.surface.build(H, frame);

    var start = MM.surface.startFace(surface);
    var end = MM.surface.endFace(surface);

    var carved = MM.graph.carveBy(carve.name, surface.adj, rng, start, carve.opts);
    MM.graph.braid(surface.adj, carved.open, rng, cfg.braid);
    var path = MM.graph.solve(surface.adj, carved.open, start, end);

    // The DFS spans whatever it can reach, so an unreachable face would mean a
    // torn surface -- which the monotone terrain is supposed to make impossible.
    if (carved.reached !== surface.faces.length) {
      throw new Error('surface is not connected: reached ' + carved.reached +
        ' of ' + surface.faces.length + ' faces');
    }
    if (!path) throw new Error('no route from start to finish for seed ' + state.seed);

    return {
      svg: MM.renderIso.toSvg({
        surface: surface, open: carved.open, path: path,
        startFace: start, endFace: end,
        showSolution: state.solution,
        inkRng: MM.rng.makeRng(state.seed + '#ink'),
        seed: state.seed, label: preset.label, carver: carve.label,
        faceCount: surface.faces.length
      }),
      stats: surface.faces.length + ' faces · shortest route ' + path.length + ' steps'
    };
  }

  /* The honeycomb is entirely determined by cols/rows -- src/hex.js draws no
   * randomness at all -- so the seed goes straight into the carve. */
  function buildHex(preset, carve) {
    var cfg = preset.hex;
    var rng = MM.rng.makeRng(state.seed);

    var grid = MM.hex.grid(cfg.cols, cfg.rows);
    var carved = MM.graph.carveBy(carve.name, grid.adj, rng, grid.start, carve.opts);
    MM.graph.braid(grid.adj, carved.open, rng, cfg.braid);
    var path = MM.graph.solve(grid.adj, carved.open, grid.start, grid.end);

    // The honeycomb is connected by construction, so a short carve would mean
    // the adjacency table is wrong rather than that this seed was unlucky.
    if (carved.reached !== grid.cells.length) {
      throw new Error('honeycomb is not connected: reached ' + carved.reached +
        ' of ' + grid.cells.length + ' hexes');
    }
    if (!path) throw new Error('no route from start to finish for seed ' + state.seed);

    return {
      svg: MM.renderHex.toSvg({
        grid: grid, open: carved.open, path: path,
        showSolution: state.solution,
        seed: state.seed, label: preset.label, carver: carve.label
      }),
      stats: cfg.cols + '×' + cfg.rows + ' hexes · shortest route ' +
        path.length + ' steps'
    };
  }

  /* The flat grid a third time, drawn as hatched blocks rather than as lines.
   * Reuses toSolidGrid, the same expansion the Escher style needs, because a
   * filled wall has to know its own inside and a wall lattice does not. */
  function buildEngraved(preset, carve) {
    var maze = flatMaze(preset.engrave, carve);
    var path = MM.maze.solve(maze);

    if (!path) throw new Error('no route from start to finish for seed ' + state.seed);

    return {
      svg: MM.renderEngraved.toSvg({
        maze: maze, grid: MM.maze.toSolidGrid(maze), path: path,
        showSolution: state.solution,
        seed: state.seed, label: preset.label, carver: carve.label
      }),
      stats: maze.width + '×' + maze.height + ' cells · shortest route ' +
        path.length + ' steps'
    };
  }

  /* Concentric rings carved from the hub outward. The grid is round and the
   * sheet is not, so src/render-theta.js stretches the drawing into an ellipse
   * by the exact factor that fills A4 -- which is why this preset has a ring
   * count and no second dimension. */
  function buildTheta(preset, carve) {
    var cfg = preset.theta;
    var rng = MM.rng.makeRng(state.seed);

    var grid = MM.theta.build(cfg.rings);
    var carved = MM.graph.carveBy(carve.name, grid.adj, rng, grid.start, carve.opts);
    MM.graph.braid(grid.adj, carved.open, rng, cfg.braid);
    var path = MM.graph.solve(grid.adj, carved.open, grid.start, grid.end);

    if (carved.reached !== grid.cells.length) {
      throw new Error('theta grid is not connected: reached ' + carved.reached +
        ' of ' + grid.cells.length + ' cells');
    }
    if (!path) throw new Error('no route from start to finish for seed ' + state.seed);

    return {
      svg: MM.renderTheta.toSvg({
        grid: grid, open: carved.open, path: path,
        showSolution: state.solution,
        seed: state.seed, label: preset.label, carver: carve.label
      }),
      stats: cfg.rings + ' rings, ' + grid.cells.length + ' cells · ' +
        'shortest route ' + path.length + ' steps'
    };
  }

  /* The honeycomb through the rounded-wall renderer. Nothing here is a second
   * implementation of anything: src/hex.js hands over the same kind of wall
   * lattice src/maze.js does, and the renderer cannot tell them apart. */
  function buildHexRound(preset, carve) {
    var cfg = preset.hexround;
    var rng = MM.rng.makeRng(state.seed);

    var grid = MM.hex.grid(cfg.cols, cfg.rows);
    var carved = MM.graph.carveBy(carve.name, grid.adj, rng, grid.start, carve.opts);
    MM.graph.braid(grid.adj, carved.open, rng, cfg.braid);
    var path = MM.graph.solve(grid.adj, carved.open, grid.start, grid.end);

    if (carved.reached !== grid.cells.length) {
      throw new Error('honeycomb is not connected: reached ' + carved.reached +
        ' of ' + grid.cells.length + ' hexes');
    }
    if (!path) throw new Error('no route from start to finish for seed ' + state.seed);

    /* Run the drawn route out through the two notches, so it starts and ends
     * outside the border where the START and FINISH labels are rather than
     * stopping dead at a cell centre. */
    var route = MM.hex.pathXY(grid, path);
    route.unshift(grid.edgeMid[grid.entryEdge]);
    route.push(grid.edgeMid[grid.exitEdge]);

    return {
      svg: MM.renderRound.toSvg({
        sheet: MM.hex.wallLattice(grid, carved.open),
        pathXY: route,
        showSolution: state.solution, kind: 'ROUNDED HONEYCOMB',
        seed: state.seed, label: preset.label, carver: carve.label
      }),
      stats: cfg.cols + '×' + cfg.rows + ' hexes · shortest route ' +
        path.length + ' steps'
    };
  }

  function draw() {
    var preset = PRESETS[state.size];
    var carve = carveSpec();
    var built;
    try {
      built = (state.style === 'iso') ? buildIso(preset, carve)
        : (state.style === 'hex') ? buildHex(preset, carve)
        : (state.style === 'hexround') ? buildHexRound(preset, carve)
        : (state.style === 'engrave') ? buildEngraved(preset, carve)
        : (state.style === 'theta') ? buildTheta(preset, carve)
        : buildEscher(preset, carve);
    } catch (err) {
      els.stage.innerHTML = '';
      els.error.textContent = 'Generation failed: ' + err.message;
      els.error.hidden = false;
      return;
    }
    els.error.hidden = true;
    els.stage.innerHTML = built.svg;

    if (document.activeElement !== els.seed) els.seed.value = state.seed;
    els.style.value = state.style;
    els.size.value = state.size;
    els.carver.value = state.carver;
    els.carverOut.textContent = (state.carver === 'auto')
      ? 'auto \u2192 ' + STYLES[state.style].carver : '\u00a0';
    els.bias.value = state.bias;
    els.biasOut.textContent = state.bias + '%';
    // The bias only means anything to Growing Tree; the others take no
    // parameters at all, so the slider hides rather than sitting there inert.
    els.biasField.hidden = (activeCarver() !== 'grow');
    els.light.value = state.light;
    els.lightOut.textContent = state.light + '°';
    els.solution.checked = state.solution;
    els.stats.textContent = built.stats;

    // Light direction only means anything to the Escher renderer; the other
    // two are pure line art with no light source at all.
    els.lightField.hidden = !STYLES[state.style].lit;

    writeHash();
  }

  // Coalesce slider bursts into one render per frame; the larger presets are a
  // few thousand cells and do not need redrawing per pixel of drag.
  function scheduleDraw() {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () { pending = 0; draw(); });
  }

  function flash(button, message) {
    var original = button.textContent;
    button.textContent = message;
    button.disabled = true;
    setTimeout(function () {
      button.textContent = original;
      button.disabled = false;
    }, 1200);
  }

  // -------------------------------------------------------------------- init
  function init() {
    [
      'stage', 'style', 'seed', 'size', 'carver', 'carverOut', 'bias',
      'biasField', 'biasOut', 'light',
      'lightField', 'lightOut', 'solution', 'stats', 'error', 'regenerate',
      'seedForm', 'print', 'copy'
    ].forEach(function (id) { els[id] = document.getElementById(id); });

    if (!readHash()) state.seed = MM.rng.randomSeed();

    els.regenerate.addEventListener('click', function () {
      state.seed = MM.rng.randomSeed();
      draw();
    });

    els.style.addEventListener('change', function () {
      state.style = els.style.value;
      draw();
    });

    els.seedForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var typed = MM.rng.normalizeSeed(els.seed.value);
      state.seed = typed || MM.rng.randomSeed();
      els.seed.blur();
      draw();
    });

    els.size.addEventListener('change', function () {
      state.size = els.size.value;
      draw();
    });

    els.carver.addEventListener('change', function () {
      state.carver = els.carver.value;
      draw();
    });

    els.bias.addEventListener('input', function () {
      state.bias = parseInt(els.bias.value, 10);
      if (isNaN(state.bias)) state.bias = 70;
      els.biasOut.textContent = state.bias + '%';
      scheduleDraw();
    });

    els.light.addEventListener('input', function () {
      state.light = parseInt(els.light.value, 10) || 0;
      els.lightOut.textContent = state.light + '°';
      scheduleDraw();
    });

    els.solution.addEventListener('change', function () {
      state.solution = els.solution.checked;
      draw();
    });

    els.print.addEventListener('click', function () { window.print(); });

    els.copy.addEventListener('click', function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { flash(els.copy, 'Copied'); },
          function () { flash(els.copy, 'Copy failed'); }
        );
      } else {
        // file:// in some browsers has no clipboard API; fall back to select.
        els.seed.select();
        flash(els.copy, 'Seed selected');
      }
    });

    // Someone pasting a shared URL into the bar mid-session should get that maze.
    window.addEventListener('hashchange', function () {
      if (readHash()) draw();
    });

    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
