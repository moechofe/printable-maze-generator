/* Maze carving over an arbitrary graph.
 *
 * src/maze.js carves a rectangular grid, where a wall is identified by (cell,
 * direction). The isometric surface has no such regular structure -- a face can
 * border a face on another plane -- so here a connection is identified by the
 * shared EDGE KEY instead, and "open" is a set of those keys.
 *
 * THE FINISHABILITY ARGUMENT is the same for all three carvers here, and holds
 * for any connected graph: each of them opens exactly one edge per node beyond
 * the first, without ever closing a cycle, so what comes out is a SPANNING TREE
 * and every node is reachable from every other. Braiding afterwards only opens
 * further edges, so it can add routes but never remove one.
 *
 * WHICH carver you pick is purely a matter of texture, and the difference is
 * large enough to see across a room:
 *
 *   dfs      Randomised depth-first search. Backtracking makes it follow one
 *            long corridor until it runs out of room, so the maze comes out
 *            with a visible "river" -- few junctions, very long snaking runs,
 *            and dead ends that are themselves long.
 *   grow     Growing Tree, which is not one texture but a continuum. Keep a
 *            list of cells still worth growing from, and each step take either
 *            the NEWEST of them or a RANDOM one. Always newest is exactly
 *            depth-first; always random is exactly the "simplified Prim" blob
 *            that swells outward from the start; the bias between them slides
 *            smoothly from one to the other. One carver, two textures, and
 *            everything in between.
 *   kruskal  Shuffle every edge, keep the ones that join two components. No
 *            traversal at all, so nothing biases it toward long runs: short
 *            dead ends, dense junctions, an even texture over the whole sheet.
 *   wilson   Loop-erased random walks. The only one here that samples UNIFORMLY
 *            from all spanning trees of the graph -- neither of the others is
 *            unbiased, they just fail to be biased in different directions.
 *            Texture sits between the two, and it is the slowest by far.
 *
 * All of them take (adj, rng, startNode, opts) and return
 * {open, visited, reached}, so carveBy() can stand in for any of them. `opts`
 * carries per-carver parameters -- only Growing Tree reads it -- which is why
 * every carver accepts it and most ignore it.
 *
 * `adj` is an array indexed by node, each entry a list of {to, key}. Adjacency
 * is symmetric in every grid the app builds: if adj[a] holds {to: b} then
 * adj[b] holds {to: a} with the same key. carveKruskal relies on that.
 */
(function (global) {
  'use strict';

  /**
   * @param {!MMAdj} adj
   * @param {!MMOpen} open
   * @param {number} node
   * @return {number} how many of this node's walls are down
   */
  function openDegree(adj, open, node) {
    var list = adj[node], c = 0;
    for (var i = 0; i < list.length; i++) if (open[list[i].key]) c++;
    return c;
  }

  /**
   * @param {!MMAdj} adj
   * @param {!MMRng} rng
   * @param {number} startNode
   * @return {!MMCarveResult}
   */
  function carve(adj, rng, startNode) {
    var open = /** @type {!MMOpen} */ (Object.create(null));
    var visited = new Uint8Array(adj.length);
    var stack = [startNode];
    var reached = 1;
    visited[startNode] = 1;

    while (stack.length) {
      var cur = stack[stack.length - 1];
      var list = adj[cur];
      var options = [];
      for (var i = 0; i < list.length; i++) {
        if (!visited[list[i].to]) options.push(list[i]);
      }
      if (!options.length) { stack.pop(); continue; }

      var pick = options[rng.int(options.length)];
      open[pick.key] = 1;
      visited[pick.to] = 1;
      reached++;
      stack.push(pick.to);
    }

    return { open: open, visited: visited, reached: reached };
  }

  /* Each undirected edge exactly once, in a deterministic order.
   *
   * Adjacency is symmetric, so every edge shows up in both endpoints' lists;
   * keeping only the copy where `to` is the larger index takes each one exactly
   * once. Walking nodes in index order and lists in their stored order makes
   * the result depend on nothing but the graph -- which matters, because the
   * shuffle below is what the seed then acts on. */
  /**
   * @param {!MMAdj} adj
   * @return {!Array<!MMGraphEdge>}
   */
  function edgeList(adj) {
    var out = [];
    for (var i = 0; i < adj.length; i++) {
      var list = adj[i];
      for (var k = 0; k < list.length; k++) {
        if (list[k].to > i) out.push({ a: i, b: list[k].to, key: list[k].key });
      }
    }
    return out;
  }

  // Union-find with path compression and union by size.
  /**
   * @param {number} n
   * @return {{find: function(number): number,
   *           union: function(number, number): boolean}}
   */
  function makeSets(n) {
    var parent = new Int32Array(n), size = new Int32Array(n).fill(1);
    for (var i = 0; i < n; i++) parent[i] = i;

    /**
     * @param {number} x
     * @return {number}
     */
    function find(x) {
      var root = x;
      while (parent[root] !== root) root = parent[root];
      while (parent[x] !== root) { var next = parent[x]; parent[x] = root; x = next; }
      return root;
    }
    return {
      find: find,
      union: function (a, b) {
        var ra = find(a), rb = find(b);
        if (ra === rb) return false;
        if (size[ra] < size[rb]) { var t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        size[ra] += size[rb];
        return true;
      }
    };
  }

  /* Randomised Kruskal: shuffle every edge, keep the ones that join two
   * components. There is no traversal, so there is nothing to bias the result
   * toward long corridors the way backtracking does -- dead ends come out short
   * and junctions dense. This is the texture the rounded-wall style wants.
   *
   * `reached` is computed the same way the others report it, so an unconnected
   * graph is caught identically whichever carver ran. */
  /**
   * @param {!MMAdj} adj
   * @param {!MMRng} rng
   * @param {number} startNode
   * @return {!MMCarveResult}
   */
  function carveKruskal(adj, rng, startNode) {
    var open = /** @type {!MMOpen} */ (Object.create(null));
    var edges = edgeList(adj);
    rng.shuffle(edges);

    var sets = makeSets(adj.length);
    for (var i = 0; i < edges.length; i++) {
      if (sets.union(edges[i].a, edges[i].b)) open[edges[i].key] = 1;
    }

    var visited = new Uint8Array(adj.length);
    var root = sets.find(startNode), reached = 0;
    for (var n = 0; n < adj.length; n++) {
      if (sets.find(n) === root) { visited[n] = 1; reached++; }
    }
    return { open: open, visited: visited, reached: reached };
  }

  /* Wilson's algorithm: the tree starts as a single node, and every other node
   * is added by walking at random until the walk hits the tree, erasing any
   * loop the walk makes in the meantime.
   *
   * That loop erasure is the whole trick. It is what makes this the only carver
   * here that samples UNIFORMLY from the spanning trees of the graph -- DFS and
   * Kruskal are both biased, they simply fail to be biased in the same way.
   *
   * The walk is stored as `step[node]`, the edge taken when the walk last left
   * that node. Revisiting a node overwrites its step, which erases the loop for
   * free: retracing from the start afterwards follows only the surviving edges.
   *
   * Guard: a disconnected graph would leave a walk unable to reach the tree and
   * spin forever, so bail out after a generous step budget and let `reached`
   * report the shortfall to the caller, which every pipeline already checks. */
  /**
   * @param {!MMAdj} adj
   * @param {!MMRng} rng
   * @param {number} startNode
   * @return {!MMCarveResult}
   */
  function carveWilson(adj, rng, startNode) {
    var n = adj.length;
    var open = /** @type {!MMOpen} */ (Object.create(null));
    var inTree = new Uint8Array(n);
    /** @type {!Array<!MMEdge>} */
    var step = new Array(n);
    var reached = 1;

    inTree[startNode] = 1;

    // Wilson's is O(cover time); on the graphs here that is comfortably inside
    // this, and a disconnected graph trips it rather than hanging the browser.
    var budget = 400 * n + 100000;

    for (var s = 0; s < n; s++) {
      if (inTree[s]) continue;

      var walk = s;
      while (!inTree[walk]) {
        if (--budget < 0) return { open: open, visited: inTree, reached: reached };
        var list = adj[walk];
        if (!list.length) break;                 // isolated node: nothing to do
        var pick = list[rng.int(list.length)];
        step[walk] = pick;                       // overwrite == erase the loop
        walk = pick.to;
      }

      // Retrace from s along the surviving steps, adding as we go.
      var cur = s;
      while (!inTree[cur]) {
        var taken = step[cur];
        if (!taken) break;
        open[taken.key] = 1;
        inTree[cur] = 1;
        reached++;
        cur = taken.to;
      }
    }

    return { open: open, visited: inTree, reached: reached };
  }

  /* Growing Tree.
   *
   * `active` holds every node reached that might still have an unvisited
   * neighbour. Each step picks one and tries to grow from it; a node with no
   * unvisited neighbours left is dropped. WHICH ONE gets picked is the entire
   * algorithm:
   *
   *   bias 1  always the newest -- the pick is the top of a stack, growth never
   *           leaves the current corridor until it dead-ends, and this is
   *           depth-first search in every respect but the spelling.
   *   bias 0  always a random one -- growth happens everywhere along the
   *           frontier at once, so the tree swells outward from the start as a
   *           blob. This is the "simplified Prim" of the maze literature.
   *   between the two, each step flips a weighted coin, and the maze comes out
   *           part river, part blob.
   *
   * Removal is by swapping the last entry into the hole rather than splicing,
   * which is O(1) and, more importantly, deterministic.
   *
   * NOTE for anyone comparing textures: bias 1 draws the same DISTRIBUTION as
   * `dfs` but not the same maze from the same seed. The coin flip is an extra
   * draw from the stream, so the two run out of step immediately. */
  /**
   * @param {!MMAdj} adj
   * @param {!MMRng} rng
   * @param {number} startNode
   * @param {?MMCarveOpts=} opts carries the growth bias, and only this carver
   *     reads it -- which is why every carver accepts it and most ignore it
   * @return {!MMCarveResult}
   */
  function carveGrowingTree(adj, rng, startNode, opts) {
    var bias = (opts && typeof opts.bias === 'number') ? opts.bias : 0.5;
    var open = /** @type {!MMOpen} */ (Object.create(null));
    var visited = new Uint8Array(adj.length);
    var active = [startNode];
    var reached = 1;
    visited[startNode] = 1;

    while (active.length) {
      var at = (rng.next() < bias)
        ? active.length - 1
        : rng.int(active.length);
      var cur = active[at];

      var list = adj[cur], options = [];
      for (var i = 0; i < list.length; i++) {
        if (!visited[list[i].to]) options.push(list[i]);
      }

      if (!options.length) {
        active[at] = active[active.length - 1];
        active.pop();
        continue;
      }

      var pick = options[rng.int(options.length)];
      open[pick.key] = 1;
      visited[pick.to] = 1;
      reached++;
      active.push(pick.to);
    }

    return { open: open, visited: visited, reached: reached };
  }

  /** @const {!MMCarverFns} */
  var CARVERS = {
    dfs: carve,
    kruskal: carveKruskal,
    wilson: carveWilson,
    grow: carveGrowingTree
  };

  // One entry point for every pipeline, so adding a carver is a one-line change
  // here rather than a hunt through four builders. Unknown names fall back to
  // DFS rather than throwing: a stale URL should still draw a maze.
  /**
   * @param {string} name
   * @param {!MMAdj} adj
   * @param {!MMRng} rng
   * @param {number} startNode
   * @param {?MMCarveOpts=} opts
   * @return {!MMCarveResult}
   */
  function carveBy(name, adj, rng, startNode, opts) {
    return (CARVERS[name] || carve)(adj, rng, startNode, opts);
  }

  /**
   * Open a fraction of the dead ends into loops, which defeats wall-following.
   * @param {!MMAdj} adj
   * @param {!MMOpen} open
   * @param {!MMRng} rng
   * @param {number} p
   * @return {undefined}
   */
  function braid(adj, open, rng, p) {
    if (!(p > 0)) return;
    var deadEnds = [], i;
    for (i = 0; i < adj.length; i++) if (openDegree(adj, open, i) === 1) deadEnds.push(i);
    rng.shuffle(deadEnds);

    var quota = Math.floor(deadEnds.length * p);
    for (var k = 0; k < quota; k++) {
      var node = deadEnds[k];
      if (openDegree(adj, open, node) !== 1) continue;   // already opened up

      var list = adj[node], cands = [];
      for (i = 0; i < list.length; i++) if (!open[list[i].key]) cands.push(list[i]);
      if (!cands.length) continue;

      open[cands[rng.int(cands.length)].key] = 1;
    }
  }

  // BFS, so the route returned is also the shortest.
  /**
   * @param {!MMAdj} adj
   * @param {!MMOpen} open
   * @param {number} start
   * @param {number} end
   * @return {?Array<number>} the shortest route, or null if there is none
   */
  function solve(adj, open, start, end) {
    var prev = new Int32Array(adj.length).fill(-1);
    var seen = new Uint8Array(adj.length);
    var queue = [start], head = 0;
    seen[start] = 1;

    while (head < queue.length) {
      var cur = queue[head++];
      if (cur === end) break;
      var list = adj[cur];
      for (var i = 0; i < list.length; i++) {
        if (!open[list[i].key]) continue;
        var to = list[i].to;
        if (seen[to]) continue;
        seen[to] = 1;
        prev[to] = cur;
        queue.push(to);
      }
    }

    if (!seen[end]) return null;
    var path = [], c = end;
    while (c !== -1) { path.push(c); c = prev[c]; }
    return path.reverse();
  }

  // Size of the component containing `from`, ignoring which edges are open.
  // Used to prove the surface graph is connected before carving it.
  /**
   * @param {!MMAdj} adj
   * @param {number} from
   * @return {number}
   */
  function componentSize(adj, from) {
    var seen = new Uint8Array(adj.length);
    var queue = [from], head = 0, count = 0;
    seen[from] = 1;
    while (head < queue.length) {
      var cur = queue[head++];
      count++;
      var list = adj[cur];
      for (var i = 0; i < list.length; i++) {
        if (seen[list[i].to]) continue;
        seen[list[i].to] = 1;
        queue.push(list[i].to);
      }
    }
    return count;
  }

  var api = {
    carve: carve,
    carveKruskal: carveKruskal,
    carveWilson: carveWilson,
    carveGrowingTree: carveGrowingTree,
    carveBy: carveBy,
    CARVERS: CARVERS,
    edgeList: edgeList,
    braid: braid,
    solve: solve,
    openDegree: openDegree,
    componentSize: componentSize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).graph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
