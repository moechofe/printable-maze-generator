/**
 * @fileoverview The shapes that cross a module boundary in src/, declared once.
 *
 * THIS FILE IS NEVER LOADED AT RUNTIME. index.html still lists the eighteen
 * src/ scripts and needs no build step; these declarations exist only so the
 * compiler can type what one module hands to another.
 *
 * IT IS AN EXTERNS FILE FOR A SECOND REASON, and that reason is load-bearing.
 * A property name declared in externs is exempt from ADVANCED renaming, so
 * every map in the app that is written with plain keys and read with a computed
 * one -- PRESETS[size], STYLES[style], CARVERS[name], els[id] -- keeps working
 * in a compiled bundle without a single source line being reshaped. Declaring
 * those key names below is what buys that. Nothing else in src/ needs to
 * change, which also keeps the text src/app.js is scraped for by
 * test/verify.js exactly as it was.
 *
 * @externs
 */

/* -------------------------------------------------------------- primitives */

/**
 * A set of open connections, keyed by the edge key the grid made up for a wall.
 * Present means carved; absent means the wall still stands.
 * @typedef {!Object<string, number>}
 */
var MMOpen;

/**
 * Adjacency, indexed by node. Symmetric in every grid the app builds.
 * @typedef {!Array<!Array<!MMEdge>>}
 */
var MMAdj;

/**
 * A screen or lattice point, [x, y].
 * @typedef {!Array<number>}
 */
var MMPoint;

/**
 * One connection out of a node.
 * @record
 */
function MMEdge() {}
/** @type {number} */ MMEdge.prototype.to;
/** @type {string} */ MMEdge.prototype.key;

/** @record */
function MMRng() {}
/** @type {function(): number} */ MMRng.prototype.next;
/** @type {function(number): number} */ MMRng.prototype.int;
/** @type {function(!Array<?>): ?} */ MMRng.prototype.pick;
/** @type {function(number): boolean} */ MMRng.prototype.chance;
/** @type {function(number, number): number} */ MMRng.prototype.range;
/** @type {function(!Array<?>): !Array<?>} */ MMRng.prototype.shuffle;

/* ------------------------------------------------------------------ carving */

/**
 * What every carver in src/graph.js returns.
 * @record
 */
function MMCarveResult() {}
/** @type {!MMOpen} */ MMCarveResult.prototype.open;
/** @type {!Uint8Array} */ MMCarveResult.prototype.visited;
/** @type {number} */ MMCarveResult.prototype.reached;

/**
 * Per-carver parameters; only the growing tree reads any.
 * @record
 */
function MMCarveOpts() {}
/** @type {(number|undefined)} */ MMCarveOpts.prototype.bias;

/**
 * One undirected edge, as src/graph.js edgeList() hands it out.
 * @record
 */
function MMGraphEdge() {}
/** @type {number} */ MMGraphEdge.prototype.a;
/** @type {number} */ MMGraphEdge.prototype.b;
/** @type {string} */ MMGraphEdge.prototype.key;

/* ---------------------------------------------------------------- flat grid */

/**
 * The square grid as a graph, before anything is carved.
 * @record
 */
function MMGridGraph() {}
/** @type {number} */ MMGridGraph.prototype.width;
/** @type {number} */ MMGridGraph.prototype.height;
/** @type {!MMAdj} */ MMGridGraph.prototype.adj;
/** @type {function(number, number): string} */ MMGridGraph.prototype.edgeKey;

/** @record */
function MMGenerateOpts() {}
/** @type {number} */ MMGenerateOpts.prototype.width;
/** @type {number} */ MMGenerateOpts.prototype.height;
/** @type {!MMRng} */ MMGenerateOpts.prototype.rng;
/** @type {number} */ MMGenerateOpts.prototype.braid;
/** @type {string} */ MMGenerateOpts.prototype.carver;
/** @type {?MMCarveOpts} */ MMGenerateOpts.prototype.carverOpts;

/**
 * A carved rectangular maze, walls as a per-cell bitmask.
 * @record
 */
function MMFlatMaze() {}
/** @type {number} */ MMFlatMaze.prototype.width;
/** @type {number} */ MMFlatMaze.prototype.height;
/** @type {!Uint8Array} */ MMFlatMaze.prototype.walls;
/** @type {!MMAdj} */ MMFlatMaze.prototype.adj;
/** @type {!MMOpen} */ MMFlatMaze.prototype.open;
/** @type {number} */ MMFlatMaze.prototype.reached;
/** @type {number} */ MMFlatMaze.prototype.start;
/** @type {number} */ MMFlatMaze.prototype.end;

/**
 * The (2w+1) x (2h+1) expansion: 1 is solid, 0 is open.
 * @record
 */
function MMSolidGrid() {}
/** @type {number} */ MMSolidGrid.prototype.gw;
/** @type {number} */ MMSolidGrid.prototype.gh;
/** @type {!Uint8Array} */ MMSolidGrid.prototype.solid;

/**
 * One of the four compass directions, with its wall bit.
 * @record
 */
function MMDir() {}
/** @type {number} */ MMDir.prototype.bit;
/** @type {number} */ MMDir.prototype.dx;
/** @type {number} */ MMDir.prototype.dy;
/** @type {number} */ MMDir.prototype.opp;

/* ------------------------------------------------------------------- escher */

/**
 * How one Escher patch reads: which way it leans and how it is lit.
 * @record
 */
function MMRegionTrait() {}
/** @type {number} */ MMRegionTrait.prototype.polarity;
/** @type {number} */ MMRegionTrait.prototype.depth;
/** @type {number} */ MMRegionTrait.prototype.dirx;
/** @type {number} */ MMRegionTrait.prototype.diry;
/** @type {boolean} */ MMRegionTrait.prototype.floorAlt;

/** @record */
function MMRegions() {}
/** @type {!Int32Array} */ MMRegions.prototype.region;
/** @type {!Array<!MMRegionTrait>} */ MMRegions.prototype.traits;
/** @type {number} */ MMRegions.prototype.count;

/** @record */
function MMRegionOpts() {}
/** @type {(number|undefined)} */ MMRegionOpts.prototype.regionSize;

/* ------------------------------------------------------- terrain + surface */

/**
 * The rectangular window onto the landscape.
 * @record
 */
function MMFrame() {}
/** @type {number} */ MMFrame.prototype.n;
/** @type {!Uint8Array} */ MMFrame.prototype.mask;
/** @type {number} */ MMFrame.prototype.halfWidth;
/** @type {number} */ MMFrame.prototype.depth;
/** @type {number} */ MMFrame.prototype.v0;

/** @record */
function MMTerrainOpts() {}
/** @type {!MMFrame} */ MMTerrainOpts.prototype.frame;
/** @type {(number|undefined)} */ MMTerrainOpts.prototype.terraces;
/** @type {(number|undefined)} */ MMTerrainOpts.prototype.maxRise;
/** @type {(number|undefined)} */ MMTerrainOpts.prototype.totalRise;
/** @type {!MMRng} */ MMTerrainOpts.prototype.rng;

/**
 * Where the height rises toward the camera, or a hidden top face.
 * @record
 */
function MMTerrainFault() {}
/** @type {number} */ MMTerrainFault.prototype.x;
/** @type {number} */ MMTerrainFault.prototype.y;
/** @type {(string|undefined)} */ MMTerrainFault.prototype.dir;
/** @type {(number|undefined)} */ MMTerrainFault.prototype.here;
/** @type {(number|undefined)} */ MMTerrainFault.prototype.next;
/** @type {(number|undefined)} */ MMTerrainFault.prototype.ahead;

/**
 * One terrace: a 1-Lipschitz boundary and how far it climbs.
 * @record
 */
function MMTerrace() {}
/** @type {!Int32Array} */ MMTerrace.prototype.b;
/** @type {number} */ MMTerrace.prototype.rise;

/**
 * One visible unit face of the landscape: one maze cell.
 * @record
 */
function MMFace() {}
/** @type {number} */ MMFace.prototype.type;
/** @type {number} */ MMFace.prototype.x;
/** @type {number} */ MMFace.prototype.y;
/** @type {number} */ MMFace.prototype.z;
/** @type {!Array<!Array<number>>} */ MMFace.prototype.quad;

/** @record */
function MMSurface() {}
/** @type {number} */ MMSurface.prototype.n;
/** @type {!Int32Array} */ MMSurface.prototype.H;
/** @type {!MMFrame} */ MMSurface.prototype.frame;
/** @type {!Array<!MMFace>} */ MMSurface.prototype.faces;
/** @type {!MMAdj} */ MMSurface.prototype.adj;
/** @type {!Array<string>} */ MMSurface.prototype.edgeOrder;
/** @type {!Object<string, !Array<!Array<number>>>} */ MMSurface.prototype.edgeEnds;
/** @type {!Object<string, !Array<number>>} */ MMSurface.prototype.edgeFaces;
/** @type {!Int32Array} */ MMSurface.prototype.topOf;

/* ---------------------------------------------------------------- honeycomb */

/** @record */
function MMHexCell() {}
/** @type {number} */ MMHexCell.prototype.col;
/** @type {number} */ MMHexCell.prototype.row;
/** @type {number} */ MMHexCell.prototype.cx;
/** @type {number} */ MMHexCell.prototype.cy;
/** @type {!Array<!MMPoint>} */ MMHexCell.prototype.poly;

/**
 * Neighbour by edge index; dc is indexed by row parity.
 * @record
 */
function MMHexStep() {}
/** @type {string} */ MMHexStep.prototype.name;
/** @type {!Array<number>} */ MMHexStep.prototype.dc;
/** @type {number} */ MMHexStep.prototype.dr;

/** @record */
function MMHexGrid() {}
/** @type {number} */ MMHexGrid.prototype.cols;
/** @type {number} */ MMHexGrid.prototype.rows;
/** @type {!Array<!MMHexCell>} */ MMHexGrid.prototype.cells;
/** @type {!MMAdj} */ MMHexGrid.prototype.adj;
/** @type {!Array<string>} */ MMHexGrid.prototype.edgeOrder;
/** @type {!Object<string, !Array<!MMPoint>>} */ MMHexGrid.prototype.edgeEnds;
/** @type {!Object<string, !Array<string>>} */ MMHexGrid.prototype.edgeVerts;
/** @type {!Object<string, !MMPoint>} */ MMHexGrid.prototype.edgeMid;
/** @type {!Object<string, number>} */ MMHexGrid.prototype.edgeCells;
/** @type {!Array<!Array<string>>} */ MMHexGrid.prototype.cellEdges;
/** @type {number} */ MMHexGrid.prototype.start;
/** @type {number} */ MMHexGrid.prototype.end;
/** @type {string} */ MMHexGrid.prototype.entryEdge;
/** @type {string} */ MMHexGrid.prototype.exitEdge;
/** @type {number} */ MMHexGrid.prototype.minX;
/** @type {number} */ MMHexGrid.prototype.maxX;
/** @type {number} */ MMHexGrid.prototype.minY;
/** @type {number} */ MMHexGrid.prototype.maxY;

/* ----------------------------------------------------------- wall lattices */

/**
 * One standing wall, as a pair of keyed lattice points.
 * @record
 */
function MMLatticeEntry() {}
/** @type {(string|number)} */ MMLatticeEntry.prototype.ak;
/** @type {!MMPoint} */ MMLatticeEntry.prototype.a;
/** @type {(string|number)} */ MMLatticeEntry.prototype.bk;
/** @type {!MMPoint} */ MMLatticeEntry.prototype.b;

/**
 * A lattice point a grid pre-registers to fix the sweep order.
 * @record
 */
function MMLatticeVert() {}
/** @type {(string|number)} */ MMLatticeVert.prototype.key;
/** @type {!MMPoint} */ MMLatticeVert.prototype.xy;

/** @record */
function MMLattice() {}
/** @type {!Array<!MMPoint>} */ MMLattice.prototype.verts;
/** @type {!Array<!Array<number>>} */ MMLattice.prototype.segs;
/** @type {!Array<!Array<number>>} */ MMLattice.prototype.incident;
/** @type {number} */ MMLattice.prototype.count;

/**
 * The bounds of a drawing, in its own units.
 * @record
 */
function MMBox() {}
/** @type {number} */ MMBox.prototype.x0;
/** @type {number} */ MMBox.prototype.y0;
/** @type {number} */ MMBox.prototype.x1;
/** @type {number} */ MMBox.prototype.y1;

/**
 * Everything src/render-round.js needs, and the only thing it knows: a grid
 * hands one of these over and the renderer cannot tell a square from a hex.
 * @record
 */
function MMSheet() {}
/** @type {!Array<!MMLatticeVert>} */ MMSheet.prototype.verts;
/** @type {!Array<!MMLatticeEntry>} */ MMSheet.prototype.entries;
/** @type {number} */ MMSheet.prototype.pitch;
/** @type {(number|undefined)} */ MMSheet.prototype.inradius;
/** @type {(number|undefined)} */ MMSheet.prototype.wall;
/** @type {(number|undefined)} */ MMSheet.prototype.fillet;
/** @type {(number|undefined)} */ MMSheet.prototype.textScale;
/** @type {!MMBox} */ MMSheet.prototype.box;
/** @type {string} */ MMSheet.prototype.dims;
/** @type {!MMPoint} */ MMSheet.prototype.startXY;
/** @type {!MMPoint} */ MMSheet.prototype.endXY;
/** @type {!MMPoint} */ MMSheet.prototype.entryXY;
/** @type {!MMPoint} */ MMSheet.prototype.exitXY;

/* -------------------------------------------------------------------- theta */

/** @record */
function MMThetaCell() {}
/** @type {number} */ MMThetaCell.prototype.ring;
/** @type {number} */ MMThetaCell.prototype.slot;
/** @type {number} */ MMThetaCell.prototype.count;

/**
 * A radial wall ('R') carries an angle; a circumferential one ('C') an angular
 * span. The renderer switches on `type`, which is why one record serves both.
 * @record
 */
function MMThetaWall() {}
/** @type {string} */ MMThetaWall.prototype.type;
/** @type {number} */ MMThetaWall.prototype.r;
/** @type {number} */ MMThetaWall.prototype.angle;
/** @type {number} */ MMThetaWall.prototype.a0;
/** @type {number} */ MMThetaWall.prototype.a1;

/** @record */
function MMThetaGrid() {}
/** @type {number} */ MMThetaGrid.prototype.rings;
/** @type {!Array<number>} */ MMThetaGrid.prototype.counts;
/** @type {!Array<!MMThetaCell>} */ MMThetaGrid.prototype.cells;
/** @type {!Array<!Array<number>>} */ MMThetaGrid.prototype.index;
/** @type {!MMAdj} */ MMThetaGrid.prototype.adj;
/** @type {!Object<string, !MMThetaWall>} */ MMThetaGrid.prototype.walls;
/** @type {!Array<string>} */ MMThetaGrid.prototype.edgeOrder;
/** @type {!Array<string>} */ MMThetaGrid.prototype.rim;
/** @type {number} */ MMThetaGrid.prototype.start;
/** @type {number} */ MMThetaGrid.prototype.end;
/** @type {string} */ MMThetaGrid.prototype.exitWall;
/** @type {number} */ MMThetaGrid.prototype.radius;

/**
 * What src/render-theta.js fit() solves: the vertical stretch, and the whole
 * viewBox that falls out of it.
 * @record
 */
function MMThetaFit() {}
/** @type {number} */ MMThetaFit.prototype.k;
/** @type {number} */ MMThetaFit.prototype.w;
/** @type {number} */ MMThetaFit.prototype.h;
/** @type {number} */ MMThetaFit.prototype.x;
/** @type {number} */ MMThetaFit.prototype.y;

/**
 * The nominal viewBox a renderer states up front, which src/presets.js is
 * solved against.
 * @record
 */
function MMViewBox() {}
/** @type {number} */ MMViewBox.prototype.w;
/** @type {number} */ MMViewBox.prototype.h;

/* ------------------------------------------------------------------ presets */

/** @record */
function MMEscherPreset() {}
/** @type {number} */ MMEscherPreset.prototype.w;
/** @type {number} */ MMEscherPreset.prototype.h;
/** @type {number} */ MMEscherPreset.prototype.braid;

/** @record */
function MMIsoPreset() {}
/** @type {number} */ MMIsoPreset.prototype.halfWidth;
/** @type {number} */ MMIsoPreset.prototype.depth;
/** @type {number} */ MMIsoPreset.prototype.terraces;
/** @type {number} */ MMIsoPreset.prototype.maxRise;
/** @type {number} */ MMIsoPreset.prototype.totalRise;
/** @type {number} */ MMIsoPreset.prototype.braid;

/** @record */
function MMHexPreset() {}
/** @type {number} */ MMHexPreset.prototype.cols;
/** @type {number} */ MMHexPreset.prototype.rows;
/** @type {number} */ MMHexPreset.prototype.braid;

/** @record */
function MMThetaPreset() {}
/** @type {number} */ MMThetaPreset.prototype.rings;
/** @type {number} */ MMThetaPreset.prototype.braid;

/**
 * One difficulty: a label and a block per style.
 * @record
 */
function MMPreset() {}
/** @type {string} */ MMPreset.prototype.label;
/** @type {!MMEscherPreset} */ MMPreset.prototype.escher;
/** @type {!MMIsoPreset} */ MMPreset.prototype.iso;
/** @type {!MMHexPreset} */ MMPreset.prototype.hex;
/** @type {!MMHexPreset} */ MMPreset.prototype.hexround;
/** @type {!MMEscherPreset} */ MMPreset.prototype.engrave;
/** @type {!MMThetaPreset} */ MMPreset.prototype.theta;

/**
 * The difficulty table. These four names are declared so that
 * PRESETS[state.size] keeps finding them in a compiled bundle.
 * @record
 */
function MMPresetTable() {}
/** @type {!MMPreset} */ MMPresetTable.prototype.easy;
/** @type {!MMPreset} */ MMPresetTable.prototype.medium;
/** @type {!MMPreset} */ MMPresetTable.prototype.hard;
/** @type {!MMPreset} */ MMPresetTable.prototype.insane;

/* -------------------------------------------------------- renderer options */

/** @record */
function MMEscherOpts() {}
/** @type {!MMFlatMaze} */ MMEscherOpts.prototype.maze;
/** @type {!MMSolidGrid} */ MMEscherOpts.prototype.grid;
/** @type {!MMRegions} */ MMEscherOpts.prototype.regions;
/** @type {?Array<number>} */ MMEscherOpts.prototype.path;
/** @type {number} */ MMEscherOpts.prototype.light;
/** @type {boolean} */ MMEscherOpts.prototype.showSolution;
/** @type {string} */ MMEscherOpts.prototype.seed;
/** @type {string} */ MMEscherOpts.prototype.label;
/** @type {string} */ MMEscherOpts.prototype.carver;

/** @record */
function MMIsoOpts() {}
/** @type {!MMSurface} */ MMIsoOpts.prototype.surface;
/** @type {!MMOpen} */ MMIsoOpts.prototype.open;
/** @type {?Array<number>} */ MMIsoOpts.prototype.path;
/** @type {number} */ MMIsoOpts.prototype.startFace;
/** @type {number} */ MMIsoOpts.prototype.endFace;
/** @type {boolean} */ MMIsoOpts.prototype.showSolution;
/** @type {!MMRng} */ MMIsoOpts.prototype.inkRng;
/** @type {string} */ MMIsoOpts.prototype.seed;
/** @type {string} */ MMIsoOpts.prototype.label;
/** @type {string} */ MMIsoOpts.prototype.carver;
/** @type {number} */ MMIsoOpts.prototype.faceCount;

/** @record */
function MMHexOpts() {}
/** @type {!MMHexGrid} */ MMHexOpts.prototype.grid;
/** @type {!MMOpen} */ MMHexOpts.prototype.open;
/** @type {?Array<number>} */ MMHexOpts.prototype.path;
/** @type {boolean} */ MMHexOpts.prototype.showSolution;
/** @type {string} */ MMHexOpts.prototype.seed;
/** @type {string} */ MMHexOpts.prototype.label;
/** @type {string} */ MMHexOpts.prototype.carver;

/** @record */
function MMRoundOpts() {}
/** @type {!MMSheet} */ MMRoundOpts.prototype.sheet;
/** @type {!Array<!MMPoint>} */ MMRoundOpts.prototype.pathXY;
/** @type {boolean} */ MMRoundOpts.prototype.showSolution;
/** @type {string} */ MMRoundOpts.prototype.kind;
/** @type {string} */ MMRoundOpts.prototype.seed;
/** @type {string} */ MMRoundOpts.prototype.label;
/** @type {string} */ MMRoundOpts.prototype.carver;
/** @type {(number|undefined)} */ MMRoundOpts.prototype.wall;
/** @type {(number|undefined)} */ MMRoundOpts.prototype.fillet;

/** @record */
function MMEngravedOpts() {}
/** @type {!MMFlatMaze} */ MMEngravedOpts.prototype.maze;
/** @type {!MMSolidGrid} */ MMEngravedOpts.prototype.grid;
/** @type {?Array<number>} */ MMEngravedOpts.prototype.path;
/** @type {boolean} */ MMEngravedOpts.prototype.showSolution;
/** @type {string} */ MMEngravedOpts.prototype.seed;
/** @type {string} */ MMEngravedOpts.prototype.label;
/** @type {string} */ MMEngravedOpts.prototype.carver;

/** @record */
function MMThetaOpts() {}
/** @type {!MMThetaGrid} */ MMThetaOpts.prototype.grid;
/** @type {!MMOpen} */ MMThetaOpts.prototype.open;
/** @type {?Array<number>} */ MMThetaOpts.prototype.path;
/** @type {boolean} */ MMThetaOpts.prototype.showSolution;
/** @type {string} */ MMThetaOpts.prototype.seed;
/** @type {string} */ MMThetaOpts.prototype.label;
/** @type {string} */ MMThetaOpts.prototype.carver;
/** @type {(number|undefined)} */ MMThetaOpts.prototype.wall;

/* ------------------------------------------------------------ the MM object */

/** @record */
function MMRngApi() {}
/** @type {function(string): !MMRng} */ MMRngApi.prototype.makeRng;
/** @type {function(number=): string} */ MMRngApi.prototype.randomSeed;
/** @type {function(?): string} */ MMRngApi.prototype.normalizeSeed;

/** @record */
function MMMazeApi() {}
/** @type {function(!MMGenerateOpts): !MMFlatMaze} */ MMMazeApi.prototype.generate;
/** @type {function(!MMFlatMaze): !MMSolidGrid} */ MMMazeApi.prototype.toSolidGrid;
/** @type {function(!MMFlatMaze): ?Array<number>} */ MMMazeApi.prototype.solve;

/** @record */
function MMGraphApi() {}
/**
 * @type {function(string, !MMAdj, !MMRng, number, ?MMCarveOpts=):
 *     !MMCarveResult}
 */
MMGraphApi.prototype.carveBy;
/** @type {function(!MMAdj, !MMOpen, !MMRng, number): undefined} */
MMGraphApi.prototype.braid;
/** @type {function(!MMAdj, !MMOpen, number, number): ?Array<number>} */
MMGraphApi.prototype.solve;

/** @record */
function MMEscherApi() {}
/** @type {function(!MMSolidGrid, !MMRng, !MMRegionOpts): !MMRegions} */
MMEscherApi.prototype.buildRegions;

/** @record */
function MMTerrainApi() {}
/** @type {function(number, number): !MMFrame} */ MMTerrainApi.prototype.frame;
/** @type {function(!MMTerrainOpts): !Int32Array} */ MMTerrainApi.prototype.build;

/** @record */
function MMSurfaceApi() {}
/** @type {function(!Int32Array, !MMFrame): !MMSurface} */
MMSurfaceApi.prototype.build;
/** @type {function(!MMSurface): number} */ MMSurfaceApi.prototype.startFace;
/** @type {function(!MMSurface): number} */ MMSurfaceApi.prototype.endFace;

/** @record */
function MMHexApi() {}
/** @type {function(number, number): !MMHexGrid} */ MMHexApi.prototype.grid;
/** @type {function(!MMHexGrid, !MMOpen): !MMSheet} */
MMHexApi.prototype.wallLattice;
/** @type {function(!MMHexGrid, !Array<number>): !Array<!MMPoint>} */
MMHexApi.prototype.pathXY;

/** @record */
function MMThetaApi() {}
/** @type {function(number): !MMThetaGrid} */ MMThetaApi.prototype.build;
/** @type {function(!MMThetaGrid, number): !MMPoint} */
MMThetaApi.prototype.centre;

/** @record */
function MMPaperApi() {}
/** @type {number} */ MMPaperApi.prototype.RATIO;
/** @type {number} */ MMPaperApi.prototype.MIN_FILL;
/** @type {function(number, number): number} */ MMPaperApi.prototype.fill;
/** @type {function(number, number): boolean} */ MMPaperApi.prototype.fits;
/** @type {function(number, number): number} */
MMPaperApi.prototype.printedWidthMm;
/** @type {function(number, number): number} */ MMPaperApi.prototype.unitMm;

/** @record */
function MMEscherRendererApi() {}
/** @type {function(!MMEscherOpts): string} */
MMEscherRendererApi.prototype.toSvg;

/** @record */
function MMIsoRendererApi() {}
/** @type {function(!MMIsoOpts): string} */ MMIsoRendererApi.prototype.toSvg;

/** @record */
function MMHexRendererApi() {}
/** @type {function(!MMHexOpts): string} */ MMHexRendererApi.prototype.toSvg;

/** @record */
function MMRoundRendererApi() {}
/** @type {function(!MMRoundOpts): string} */
MMRoundRendererApi.prototype.toSvg;

/** @record */
function MMEngravedRendererApi() {}
/** @type {function(!MMEngravedOpts): string} */
MMEngravedRendererApi.prototype.toSvg;

/** @record */
function MMThetaRendererApi() {}
/** @type {function(!MMThetaOpts): string} */
MMThetaRendererApi.prototype.toSvg;

/** @record */
function MMLatticeApi() {}
/** @type {function(!Array<!MMLatticeEntry>, ?Array<!MMLatticeVert>=): !MMLattice} */
MMLatticeApi.prototype.build;
/** @type {function(!MMLattice): !Array<!Array<number>>} */
MMLatticeApi.prototype.decompose;
/** @type {function(!MMLattice, !Array<number>): !Array<!MMPoint>} */
MMLatticeApi.prototype.simplify;
/** @type {function(!Array<!MMPoint>, number): string} */
MMLatticeApi.prototype.filletedPath;

/**
 * The namespace every module hangs itself off under <script> tags. Typed on the
 * consumer side only -- src/app.js casts window.MM to this -- so that a module
 * exporting more than the app uses is not a mismatch.
 * @record
 */
function MMNamespace() {}
/** @type {!MMPaperApi} */ MMNamespace.prototype.paper;
/** @type {!MMRngApi} */ MMNamespace.prototype.rng;
/** @type {!MMPresetTable} */ MMNamespace.prototype.presets;
/** @type {!MMGraphApi} */ MMNamespace.prototype.graph;
/** @type {!MMMazeApi} */ MMNamespace.prototype.maze;
/** @type {!MMEscherApi} */ MMNamespace.prototype.escher;
/** @type {!MMTerrainApi} */ MMNamespace.prototype.terrain;
/** @type {!MMSurfaceApi} */ MMNamespace.prototype.surface;
/** @type {!MMHexApi} */ MMNamespace.prototype.hex;
/** @type {!MMThetaApi} */ MMNamespace.prototype.theta;
/** @type {!MMLatticeApi} */ MMNamespace.prototype.lattice;
/** @type {!MMEscherRendererApi} */ MMNamespace.prototype.render;
/** @type {!MMIsoRendererApi} */ MMNamespace.prototype.renderIso;
/** @type {!MMHexRendererApi} */ MMNamespace.prototype.renderHex;
/** @type {!MMRoundRendererApi} */ MMNamespace.prototype.renderRound;
/** @type {!MMEngravedRendererApi} */ MMNamespace.prototype.renderEngraved;
/** @type {!MMThetaRendererApi} */ MMNamespace.prototype.renderTheta;

/* ---------------------------------------------------------------- app state */

/**
 * The controls src/app.js looks up by id. Declared here so that the id list in
 * init() -- which writes els[id] from a string -- agrees with every els.name
 * read after ADVANCED renaming.
 * @record
 */
function MMEls() {}
/** @type {!Element} */ MMEls.prototype.stage;
/** @type {!HTMLSelectElement} */ MMEls.prototype.style;
/** @type {!HTMLInputElement} */ MMEls.prototype.seed;
/** @type {!HTMLSelectElement} */ MMEls.prototype.size;
/** @type {!HTMLSelectElement} */ MMEls.prototype.carver;
/** @type {!HTMLElement} */ MMEls.prototype.carverOut;
/** @type {!HTMLInputElement} */ MMEls.prototype.bias;
/** @type {!HTMLElement} */ MMEls.prototype.biasField;
/** @type {!HTMLElement} */ MMEls.prototype.biasOut;
/** @type {!HTMLInputElement} */ MMEls.prototype.light;
/** @type {!HTMLElement} */ MMEls.prototype.lightField;
/** @type {!HTMLElement} */ MMEls.prototype.lightOut;
/** @type {!HTMLInputElement} */ MMEls.prototype.solution;
/** @type {!HTMLElement} */ MMEls.prototype.stats;
/** @type {!HTMLElement} */ MMEls.prototype.error;
/** @type {!HTMLButtonElement} */ MMEls.prototype.regenerate;
/** @type {!HTMLFormElement} */ MMEls.prototype.seedForm;
/** @type {!HTMLButtonElement} */ MMEls.prototype.print;
/** @type {!HTMLButtonElement} */ MMEls.prototype.copy;

/**
 * What the light control means to a style, and what Auto carves it with.
 * @record
 */
function MMStyleInfo() {}
/** @type {boolean} */ MMStyleInfo.prototype.lit;
/** @type {string} */ MMStyleInfo.prototype.carver;

/**
 * The style table. The six names are declared so STYLES[val] survives
 * compilation; they are the same strings index.html offers in the dropdown.
 * @record
 */
function MMStyleTable() {}
/** @type {!MMStyleInfo} */ MMStyleTable.prototype.escher;
/** @type {!MMStyleInfo} */ MMStyleTable.prototype.iso;
/** @type {!MMStyleInfo} */ MMStyleTable.prototype.hex;
/** @type {!MMStyleInfo} */ MMStyleTable.prototype.hexround;
/** @type {!MMStyleInfo} */ MMStyleTable.prototype.engrave;
/** @type {!MMStyleInfo} */ MMStyleTable.prototype.theta;

/**
 * The carver names src/app.js accepts out of a URL hash.
 * @record
 */
function MMCarverTable() {}
/** @type {number} */ MMCarverTable.prototype.auto;
/** @type {number} */ MMCarverTable.prototype.dfs;
/** @type {number} */ MMCarverTable.prototype.kruskal;
/** @type {number} */ MMCarverTable.prototype.wilson;
/** @type {number} */ MMCarverTable.prototype.grow;

/**
 * The carvers themselves, in src/graph.js. Same four names, so carveBy() can
 * look one up by string after renaming.
 * @record
 */
function MMCarverFns() {}
/** @type {function(!MMAdj, !MMRng, number, ?MMCarveOpts=): !MMCarveResult} */
MMCarverFns.prototype.dfs;
/** @type {function(!MMAdj, !MMRng, number, ?MMCarveOpts=): !MMCarveResult} */
MMCarverFns.prototype.kruskal;
/** @type {function(!MMAdj, !MMRng, number, ?MMCarveOpts=): !MMCarveResult} */
MMCarverFns.prototype.wilson;
/** @type {function(!MMAdj, !MMRng, number, ?MMCarveOpts=): !MMCarveResult} */
MMCarverFns.prototype.grow;

/**
 * One resolved carve: what to run, with what, and what to print.
 * @record
 */
function MMCarveSpec() {}
/** @type {string} */ MMCarveSpec.prototype.name;
/** @type {?MMCarveOpts} */ MMCarveSpec.prototype.opts;
/** @type {string} */ MMCarveSpec.prototype.label;

/**
 * What a builder hands back to draw().
 * @record
 */
function MMBuilt() {}
/** @type {string} */ MMBuilt.prototype.svg;
/** @type {string} */ MMBuilt.prototype.stats;

/**
 * The app's live state, mirrored into the URL hash.
 * @record
 */
function MMState() {}
/** @type {string} */ MMState.prototype.style;
/** @type {string} */ MMState.prototype.seed;
/** @type {string} */ MMState.prototype.size;
/** @type {string} */ MMState.prototype.carver;
/** @type {number} */ MMState.prototype.bias;
/** @type {number} */ MMState.prototype.light;
/** @type {boolean} */ MMState.prototype.solution;
