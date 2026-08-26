/* The visible skin of the terrain, as a graph of maze cells.
 *
 * One unit face = one maze cell. Three kinds are visible, because the camera
 * looks down the +X +Y +Z diagonal:
 *   TOP  the flat top of a column, at z = H(x,y)
 *   FX   a +X facing cliff face, on the plane x+1
 *   FY   a +Y facing cliff face, on the plane y+1
 *
 * ADJACENCY IS DERIVED, NOT ENUMERATED. Two faces are neighbours iff they share
 * an edge in 3D, so every face is hashed by its four edges and anything landing
 * in the same bucket is adjacent. That gets the awkward cases right for free:
 * a top face meets the cliff below it, the foot of a cliff meets the top face
 * it lands on, cliffs meet each other around convex and concave corners. Two
 * top faces meet only when their heights are equal, which falls out of the
 * edge coordinates carrying z.
 *
 * THE ONE RESTRICTION: only edges shared by EXACTLY TWO faces become
 * adjacencies. Up to four faces can meet along a vertical corner edge, and
 * those all occupy the same 3D segment -- opening a passage for one pair would
 * erase the wall for the other pairs too, so the drawing would claim passages
 * that the maze does not have. Non-manifold edges therefore stay permanent
 * walls. It costs a few possible routes and buys an unambiguous picture.
 */
(function (global) {
  'use strict';

  var TOP = 0, FX = 1, FY = 2;

  function key3(p) { return p[0] + ',' + p[1] + ',' + p[2]; }

  function edgeKey(a, b) {
    var ka = key3(a), kb = key3(b);
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
  }

  function build(H, frame) {
    var n = frame.n, mask = frame.mask;

    function inside(x, y) {
      return x >= 0 && y >= 0 && x < n && y < n && mask[y * n + x];
    }
    function heightAt(x, y) {
      // Outside the frame the ground is at zero, so the near rim of the slab
      // shows a full cliff rather than stopping in mid air.
      return inside(x, y) ? H[y * n + x] : 0;
    }

    var faces = [];
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!inside(x, y)) continue;
        var h = H[y * n + x], z;

        faces.push({
          type: TOP, x: x, y: y, z: h,
          quad: [[x, y, h], [x + 1, y, h], [x + 1, y + 1, h], [x, y + 1, h]]
        });

        for (z = heightAt(x + 1, y); z < h; z++) {
          faces.push({
            type: FX, x: x, y: y, z: z,
            quad: [[x + 1, y, z], [x + 1, y + 1, z],
                   [x + 1, y + 1, z + 1], [x + 1, y, z + 1]]
          });
        }

        for (z = heightAt(x, y + 1); z < h; z++) {
          faces.push({
            type: FY, x: x, y: y, z: z,
            quad: [[x, y + 1, z], [x + 1, y + 1, z],
                   [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]
          });
        }
      }
    }

    // Bucket every face edge. Insertion order is deterministic, which keeps the
    // adjacency lists -- and so the carved maze -- reproducible.
    var buckets = Object.create(null);
    var edgeEnds = Object.create(null);
    var order = [];

    for (var f = 0; f < faces.length; f++) {
      var q = faces[f].quad;
      for (var k = 0; k < 4; k++) {
        var a = q[k], b = q[(k + 1) % 4];
        var ek = edgeKey(a, b);
        if (!buckets[ek]) {
          buckets[ek] = [];
          edgeEnds[ek] = [a, b];
          order.push(ek);
        }
        buckets[ek].push(f);
      }
    }

    var adj = [];
    for (var i = 0; i < faces.length; i++) adj.push([]);

    for (var e = 0; e < order.length; e++) {
      var kk = order[e], shared = buckets[kk];
      if (shared.length !== 2) continue;          // see the note above
      adj[shared[0]].push({ to: shared[1], key: kk });
      adj[shared[1]].push({ to: shared[0], key: kk });
    }

    // Index of the top face of a column, for choosing start and finish.
    var topOf = new Int32Array(n * n).fill(-1);
    for (i = 0; i < faces.length; i++) {
      if (faces[i].type === TOP) topOf[faces[i].y * n + faces[i].x] = i;
    }

    return {
      n: n, H: H, frame: frame,
      faces: faces,
      adj: adj,
      edgeOrder: order,
      edgeEnds: edgeEnds,
      edgeFaces: buckets,
      topOf: topOf
    };
  }

  /* Start top-left, finish bottom-right -- literally, now that the frame is a
   * rectangle rather than a diamond.
   *
   * Screen position is u = x - y across and v = x + y down, so the top-left
   * corner of the frame is (u,v) = (-U, U), which is column (0, U); the
   * bottom-right is (u,v) = (U, U+V), which is column (U + V/2, V/2). frame()
   * keeps V even so both land on integers. Both are top faces, so both exist
   * whatever the terrain does. */
  function startFace(surface) {
    var f = surface.frame;
    return surface.topOf[f.halfWidth * surface.n + 0];
  }
  function endFace(surface) {
    var f = surface.frame;
    var x = f.halfWidth + f.depth / 2, y = f.depth / 2;
    return surface.topOf[y * surface.n + x];
  }

  function signature(surface) {
    var out = [];
    for (var i = 0; i < surface.faces.length; i++) {
      var f = surface.faces[i];
      out.push(f.type + ':' + f.x + ':' + f.y + ':' + f.z);
    }
    return out.join(';');
  }

  var api = {
    TOP: TOP, FX: FX, FY: FY,
    build: build,
    startFace: startFace,
    endFace: endFace,
    edgeKey: edgeKey,
    signature: signature
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.MM = global.MM || {}).surface = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
