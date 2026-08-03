// Progressive voxel excavation sandbox.
//
// The hole removes floor support; a deterministic load-path graph decides how
// the block-built world collapses. Blocks come in four sizes (0.25 / 0.5 / 1 /
// 2 m) on a shared 0.25 m fine grid — small bricks for detailed objects, big
// slabs for large structures. Three simulation layers:
//   1. STATIC blocks in a support graph — 0-1 BFS up from floor anchors, with
//      per-material bond strengths and cantilever (maxSpan) limits in meters.
//      Destruction is rim-driven: the crack front sweeps inward from the
//      hole's circumference (WAVE_K seconds per cell of crack distance).
//   2. CHUNKS — freshly detached connected regions become single rigid bodies
//      (volume-weighted center of mass, mass-scaled gravity, rim torque,
//      ground-impact splitting along weak bonds).
//   3. DEBRIS — small groups and loose blocks get cheap individual physics:
//      bounce, slide, tip over the rim, funnel inward, sleep when far away.
// Pure sim: no three.js, no Math.random — all randomness flows through rng.js.
//
// Scenes: 'gallery' (default, built by _buildScene below) and 'manhattan'
// (js/voxelscene-manhattan.js — Lower Manhattan: WTC, Wall St, the El).

import { RNG } from './rng.js';
import { playerSpeedForRadius } from './tiers.js';
import { buildManhattan } from './voxelscene-manhattan.js';
import { sedan, bus, boxVan, bigTruck, motorcycle, tree, lampPost } from './voxelkit.js';

// --- tuning ------------------------------------------------------------------
const FINE = 0.25;          // fine grid resolution (m); blocks are fs fine cells per side (0.25/0.5/1/2 m)
// 2.5× real-feel gravity: blocks SLAM (playtest: 26 read as floating).
// Harder impacts also split/bounce/scatter more — spill is the intent.
// Heavier material falls faster (game feel, not physics class): glass ~0.6×,
// steel ~1.5× — driven by DENSITY so block size doesn't change fall speed.
// All of gravity/wave/creak/speed/attract is live-tunable via sim.tune
// (dev sliders in SETTINGS); these constants are just the defaults.
const GRAVITY = 65;
const BOND_CARRY = 0.5;      // min outgoing bond for a block to pass support along an edge
const GROUP_BOND = 0.45;     // min connection strength for two blocks to share a chunk
const CHUNK_MIN = 3;         // smaller detached groups become individual debris
const CHUNK_CAP = 64;        // max blocks per rigid chunk
const FRESH_WINDOW = 0.6;    // seconds after detaching during which blocks may chunk up
const REMOVAL_FRAC = 0.95;   // support-removal zone = hole radius × this (≈ visible opening)
const FLOOR_CANTILEVER = 1;  // ground-floor cells over the void hold at most this many meters
const HANG_CAP = 1.8;        // max seconds a cantilever over the void creaks before letting go
const WAVE_K = 0.4;          // seconds per meter the crack front takes to travel from the rim
const FAIL_CAP = 2.5;        // max seconds any unsupported block can hold on
const INSTAB_ZONE = 1.0;     // rim band beyond the opening that gets support-% checks
const ATTRACT_ZONE = 3.0;    // detached bodies feel an inward pull within radius + this
const ATTRACT_ACC = 8;
const SINK_Y = 0.15;         // a block is eaten once its TOP sinks below this (inside the opening)
const START_RADIUS = 1.1;
// Cumulative combo-mass required for each SIZE level (1-indexed via size-1).
// Escalating steps: early sizes are a snack, then each level costs clearly
// more than the last — pushing players from small props onto big targets,
// and making SIZE 12 a prize for sustained high combos (scene supplies
// ~4.2k raw mass, ~12.7k at the ×3 combo cap).
const SIZE_MASS = [0, 25, 75, 180, 400, 750, 1350, 2300, 3800, 5800, 7800, 10000];
const MAX_SIZE = SIZE_MASS.length;
const MAX_RADIUS = START_RADIUS + (MAX_SIZE - 1) * 0.5; // 6.6 m at SIZE 12
const SPEED_MULT = 1.4;      // sandbox hole runs at 1.4× the campaign speed curve
// Mirrors sim.js combo rules, duplicated so the sandbox stays free of the
// sim.js → citygen.js import chain.
const COMBO_WINDOW = 1.5;
const comboMult = (chain) => Math.min(3, 1 + 0.1 * Math.max(0, chain - 1));

// Bond semantics: a block's vert/horizBond is how well IT passes support to
// the neighbor above/beside it (compression/shear). Rubber carries weight from
// above (a wheel holds the car) but shears off sideways; loose blocks stack
// but never hold each other sideways. `mass` is per cubic meter (density).
const MATERIALS = {
  concrete: { mass: 2.0, vertBond: 0.95, horizBond: 0.80, maxSpan: 3, delay: 0.25, color: 0x9098a0 },
  // steel: strong but not magical — span 3 keeps lone pillars from hovering
  // over the void long after the building around them is gone
  steel:    { mass: 3.5, vertBond: 0.99, horizBond: 0.95, maxSpan: 3, delay: 0.35, color: 0x3a4f66 },
  glass:    { mass: 0.8, vertBond: 0.40, horizBond: 0.30, maxSpan: 1, delay: 0.05, color: 0x88ccff },
  wood:     { mass: 1.2, vertBond: 0.70, horizBond: 0.65, maxSpan: 2, delay: 0.15, color: 0x8f5c38 },
  panel:    { mass: 1.0, vertBond: 0.75, horizBond: 0.70, maxSpan: 3, delay: 0.12, color: 0xc23b2e },
  rubber:   { mass: 1.5, vertBond: 0.90, horizBond: 0.20, maxSpan: 1, delay: 0.05, color: 0x24262b },
  loose:    { mass: 1.0, vertBond: 0.90, horizBond: 0.00, maxSpan: 0, delay: 0.00, color: 0xb08968 },
  leaf:     { mass: 0.3, vertBond: 0.55, horizBond: 0.50, maxSpan: 1, delay: 0.02, color: 0x4e9a3d },
  brick:    { mass: 1.8, vertBond: 0.85, horizBond: 0.75, maxSpan: 2, delay: 0.20, color: 0x9a4a3a },
};

const key = (gx, gy, gz) => `${gx},${gy},${gz}`;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class VoxelSandboxSim {
  constructor({ seed = 'voxel-sandbox', scene = 'gallery' } = {}) {
    this.rng = new RNG(seed);
    this.hole = {
      x: 0, z: 16, radius: START_RADIUS, mass: 0, rawMass: 0,
      chain: 0, chainTimer: 0, bestCombo: 0, eatenCount: 0, isPlayer: true,
      size: 1, sizeFrac: 0, // SIZE level (1..10) + progress to the next level
    };
    this.time = 0;
    this.over = false;
    this.events = [];
    this.blocks = [];
    this.grid = new Map(); // every occupied fine cell -> owning block
    this.chunks = [];
    this._blockId = 1;
    this._chunkId = 1;
    this._coverage = new Set(); // meter cells currently inside the removal zone
    this._graphDirty = true;    // support graph must be re-evaluated
    this._massMarkIdx = 0;                 // city-consumption milestones: 25/50/75/100%
    this.MAX_SIZE = MAX_SIZE;
    this.bounds = 24;          // hole movement clamp (m); scenes may widen it
    this.sceneDecor = null;    // render-only roads/parks/water (VoxelWorld3D)
    this.cameraBlockers = [];  // tall-building AABBs for the chase cam
    // Live-tunable physics (dev sliders in SETTINGS → main.js pushes values
    // from save.settings; the constants above are the defaults/validator's).
    this.tune = { gravity: GRAVITY, waveK: WAVE_K, creak: 1, speed: SPEED_MULT, attract: ATTRACT_ACC };

    if (scene === 'manhattan') buildManhattan(this);
    else this._buildScene();
    this._buildNeighbors();
    this.totalBlocks = this.blocks.length;
    this.totalMass = this.blocks.reduce((s, b) => s + b.mat.mass * b.s ** 3, 0);
    // SIZE ladder scales with scene mass so progression pacing matches the
    // gallery's (~4.2k raw → exactly ×1); bigger cities demand more per SIZE.
    this._sizeLadder = SIZE_MASS.map((m) => m * Math.max(1, Math.round(this.totalMass / 4200)));
    // Solid-surface heightmap: per fine column, the highest SOLID top
    // (static blocks + sleeping debris). Falling bodies collide with THIS
    // instead of a flat ground plane — blocks land on roofs and stack into
    // piles. Sleepers register in _sleepers so support loss wakes them.
    this._top = new Map();
    for (const b of this.blocks) this._topAdd(b);
    this._sleepers = new Map(); // fine col key -> array of debris sleeping there
  }

  // --- scene construction (hand-authored, deterministic) ---------------------

  // meters, min-corner placement; `color` overrides the material's color
  // (physics come from the material, paint is per-block)
  _block(x, y, z, matType, s = 1, color) {
    const f = 1 / FINE;
    return this._addBlock(Math.round(x * f), Math.round(y * f), Math.round(z * f), matType, Math.round(s * f), color);
  }

  // nx × ny × nz counts of s-sized blocks starting at (x0, y0, z0) meters
  _box(x0, y0, z0, nx, ny, nz, matType, s = 1, color) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          this._block(x0 + i * s, y0 + j * s, z0 + k * s, matType, s, color);
        }
      }
    }
  }

  _addBlock(fx, fy, fz, matType, fs, color) {
    const s = fs * FINE;
    const b = {
      id: this._blockId++,
      gx: fx, gy: fy, gz: fz, // fine coord of the min corner
      fs, s,
      x: (fx + fs / 2) * FINE, y: (fy + fs / 2) * FINE, z: (fz + fs / 2) * FINE,
      vx: 0, vy: 0, vz: 0,
      rotX: 0, rotZ: 0, vRotX: 0, vRotZ: 0,
      matType, mat: MATERIALS[matType],
      color: color ?? MATERIALS[matType].color,
      state: 'static', // static | unstable | falling | consumed
      damage: 0,   // 0..1 accumulated structural damage; >= 1 while unstable = detach.
                   // Persists when support returns (slow heal) — wiggling the
                   // hole no longer resets collapse progress.
      failRate: 0, // damage per second while unstable (set by support recalc)
      supportRatio: 1, // fraction of base footprint still on solid ground
      fallT: -1,       // sim time of detachment (drives chunk grouping window)
      asleep: false,
      parentChunk: null,
      neighbors: [],
    };
    this.blocks.push(b);
    for (let ix = 0; ix < fs; ix++) {
      for (let iy = 0; iy < fs; iy++) {
        for (let iz = 0; iz < fs; iz++) {
          this.grid.set(key(fx + ix, fy + iy, fz + iz), b);
        }
      }
    }
    return b;
  }

  _buildScene() {
    // STANDARD bricks (1 m): the reference tower — 10×12 footprint, 10
    // layers. Steel corner + interior columns, concrete slabs/walls, glass
    // pane strips, wood roof ring.
    {
      const ox = -5, oz = -6, cols = 10, rows = 12, layers = 10;
      for (let y = 0; y < layers; y++) {
        for (let x = 0; x < cols; x++) {
          for (let z = 0; z < rows; z++) {
            const isCorner = (x === 0 || x === cols - 1) && (z === 0 || z === rows - 1);
            const isOuterWall = x === 0 || x === cols - 1 || z === 0 || z === rows - 1;
            const isSlab = y % 4 === 0;
            const isColumn = (x === 3 || x === 6) && (z === 3 || z === 6 || z === 9);
            if (!isOuterWall && !isSlab && !isColumn) continue;
            let mat = 'concrete';
            if (isCorner || isColumn) mat = 'steel';
            else if (y === layers - 1) mat = 'wood';
            // glass panes in vertical strips between full-height concrete
            // columns: glass never carries load, so every pane must hang off
            // a load-bearing neighbor at its own level (span 1)
            else if (isOuterWall && !isSlab && ((z === 0 || z === rows - 1) ? x % 2 === 1 : z % 2 === 1)) mat = 'glass';
            this._block(ox + x, y, oz + z, mat, 1);
          }
        }
      }
    }
    // LARGE bricks (2 m): warehouse — chunky slabs for big structures.
    // 8×6 m footprint (4×3 blocks), 6 m walls, wood roof.
    {
      const ox = 8, oz = 8, S = 2;
      for (let x = 0; x < 4; x++) {
        for (let z = 0; z < 3; z++) {
          const edge = x === 0 || x === 3 || z === 0 || z === 2;
          const corner = (x === 0 || x === 3) && (z === 0 || z === 2);
          for (let y = 0; y < 3; y++) {
            if (!edge) continue;
            this._block(ox + x * S, y * S, oz + z * S, corner ? 'steel' : 'concrete', S);
          }
          this._block(ox + x * S, 3 * S, oz + z * S, 'wood', S); // roof
        }
      }
    }
    // SMALL bricks (0.5 m): the car — reads as a car through its bonds.
    sedan(this, 8, -1);
    // Loose crate pile: no lateral bonds — collapses as individual debris.
    {
      const ox = -11, oz = 8;
      this._box(ox, 0, oz, 4, 1, 4, 'loose', 1);
      this._box(ox, 1, oz, 3, 1, 3, 'loose', 1);
      this._box(ox, 2, oz, 2, 1, 2, 'loose', 1);
      this._block(ox, 3, oz, 'loose', 1);
    }
    // --- city gallery: one of each campaign object kind -----------------------
    // HOUSE (1 m): two-storey concrete home, glass upstairs, stepped wood roof.
    {
      const ox = -13, oz = -6;
      for (let x = 0; x < 5; x++) {
        for (let z = 0; z < 4; z++) {
          const edge = x === 0 || x === 4 || z === 0 || z === 3;
          const corner = (x === 0 || x === 4) && (z === 0 || z === 3);
          if (edge) {
            this._block(ox + x, 0, oz + z, 'concrete', 1);
            this._block(ox + x, 1, oz + z, !corner && (x + z) % 2 === 1 ? 'glass' : 'concrete', 1);
          }
          this._block(ox + x, 2, oz + z, 'wood', 1); // full roof slab
        }
      }
      this._box(ox + 1, 3, oz + 1, 3, 1, 2, 'wood', 1); // roof cap
    }
    // SHOP (1 m): glass storefront with a cantilevered panel awning.
    {
      const ox = -13, oz = 1;
      for (let x = 0; x < 4; x++) {
        for (let z = 0; z < 3; z++) {
          const edge = x === 0 || x === 3 || z === 0 || z === 2;
          if (!edge) continue;
          const front = z === 0 && (x === 1 || x === 2);
          this._block(ox + x, 0, oz + z, front ? 'glass' : 'concrete', 1);
          this._block(ox + x, 1, oz + z, front ? 'glass' : 'concrete', 1);
          this._block(ox + x, 2, oz + z, 'wood', 1);
        }
      }
      this._box(ox + 1, 2, oz + 1, 2, 1, 1, 'wood', 1); // roof interior fill
      for (let x = 0; x < 3; x++) this._block(ox + x, 1, oz - 1, 'panel', 1); // awning
    }
    // BUS (0.5 m): long steel frame on 6 rubber wheels, glass band.
    bus(this, 8, 3.5);
    // TREES (0.5 m): wood trunk, leaf canopy — foliage clumps shear off light.
    for (const [tx, tz] of [[-4, 11], [3, 11], [-1, 8]]) tree(this, tx, tz);
    // LAMP POSTS (0.25 m): pole, steel plate, glass head (glass rests on steel,
    // never on glass).
    for (const [lx, lz] of [[5, 8], [-6, 8]]) lampPost(this, lx, lz);
    // --- VEHICLE FLEET ------------------------------------------------------------
    sedan(this, 15.5, -1, 0xf7c948);                 // yellow taxi
    sedan(this, 15.5, 3.5, 0xe8ecf2, 0x2a2f3a);      // police cruiser
    bigTruck(this, 8, -4.5, 0x2e5d3a);               // garbage truck
    bigTruck(this, 14, -4.5, 0xc22a1c, true);        // fire engine
    boxVan(this, -21.5, 5.5, 5, 0xf2f2f2, 0xf2f2f2); // ambulance
    motorcycle(this, 11, -2.2);
    // --- STREET FURNITURE (0.25 m detail bricks — same footprints, real silhouettes)
    const F = (x, y, z, m, c) => this._block(x, y, z, m, 0.25, c);
    const B25 = (x0, y0, z0, nx, ny, nz, m, c) => this._box(x0, y0, z0, nx, ny, nz, m, 0.25, c);
    // fire hydrant: body, dome, side caps
    B25(-11.25, 0, 12.75, 2, 3, 2, 'panel');
    F(-11.125, 0.75, 12.875, 'panel');
    F(-11.5, 0.375, 12.875, 'panel'); F(-10.75, 0.375, 12.875, 'panel');
    // mailbox (USPS blue): legs, box body, cap
    F(-8.25, 0, 12.875, 'steel'); F(-7.75, 0, 12.875, 'steel');
    B25(-8.25, 0.25, 12.75, 2, 3, 2, 'panel', 0x2a4f9a);
    B25(-8.25, 1, 12.75, 2, 1, 2, 'panel', 0x2a4f9a);
    // parking meter: pole + head
    B25(-5.125, 0, 12.875, 1, 4, 1, 'steel');
    B25(-5.25, 1, 12.75, 2, 1, 2, 'steel');
    // bench: steel legs, wood seat + back slats
    B25(-2.25, 0, 12.875, 1, 2, 1, 'steel'); B25(-1.25, 0, 12.875, 1, 2, 1, 'steel');
    B25(-2.5, 0.5, 12.75, 4, 1, 2, 'wood');
    B25(-2.5, 0.75, 12.75, 4, 2, 1, 'wood');
    // bike rack (inverted U)
    B25(1, 0, 12.875, 1, 3, 1, 'steel'); B25(1.5, 0, 12.875, 1, 3, 1, 'steel');
    B25(1, 0.75, 12.875, 3, 1, 1, 'steel');
    // bollards
    for (const bx of [3.5, 4.5, 5.5]) B25(bx, 0, 12.875, 1, 3, 1, 'steel');
    // NYPD barrier (blue sawhorse)
    B25(6.5, 0, 12.875, 1, 2, 1, 'wood', 0x2a4f9a); B25(7.5, 0, 12.875, 1, 2, 1, 'wood', 0x2a4f9a);
    B25(6.25, 0.5, 12.875, 6, 1, 1, 'wood', 0x2a4f9a);
    // phone booth: corner posts, glass back + sides, roof
    for (const [px, pz] of [[8, 14.75], [8.75, 14.75], [8, 15.25], [8.75, 15.25]]) B25(px, 0, pz, 1, 4, 1, 'steel');
    B25(8.25, 0.25, 15.25, 2, 3, 1, 'glass');
    B25(8, 0.25, 15, 1, 3, 1, 'glass'); B25(8.75, 0.25, 15, 1, 3, 1, 'glass');
    B25(8, 1, 14.75, 4, 1, 3, 'panel');
    // hot dog cart: yellow body on wheels, red umbrella
    F(10.75, 0, 14.75, 'rubber'); F(11.75, 0, 14.75, 'rubber');
    B25(10.75, 0.25, 14.75, 4, 2, 2, 'panel', 0xf7c948);
    B25(11.5, 0.75, 14.875, 1, 4, 1, 'steel');
    B25(11, 1.75, 14.5, 3, 1, 3, 'panel', 0xc23b2e);
    // traffic light: pole, head, R/Y/G lenses
    B25(13.375, 0, 14.875, 1, 6, 1, 'steel');
    B25(13.375, 1.5, 14.875, 1, 3, 1, 'panel', 0x1a1a1e);
    F(13.375, 2, 15.125, 'glass', 0xd93025); F(13.375, 1.75, 15.125, 'glass', 0xf7c948); F(13.375, 1.5, 15.125, 'glass', 0x3ddc84);
    // newsstand: green body, overhanging roof
    B25(-14.5, 0, 12.25, 4, 3, 3, 'panel', 0x2e4d3a);
    B25(-14.75, 0.75, 12, 5, 1, 4, 'panel', 0x2e4d3a);
    // dumpster: body + lid
    B25(-14.5, 0, 10.25, 4, 2, 2, 'panel', 0x2e5d3a);
    B25(-14.5, 0.5, 10.25, 4, 1, 2, 'panel', 0x2e5d3a);
    // bus shelter: 3 posts, glass panes BETWEEN the posts (glass can't carry
    // glass — every pane touches a post at its own level), roof, bench
    B25(-10, 0, 15.25, 1, 4, 1, 'steel'); B25(-9.5, 0, 15.25, 1, 4, 1, 'steel'); B25(-8.75, 0, 15.25, 1, 4, 1, 'steel');
    B25(-9.75, 0.25, 15.25, 1, 3, 1, 'glass'); B25(-9.25, 0.25, 15.25, 2, 3, 1, 'glass');
    B25(-10.25, 1, 15.25, 6, 1, 2, 'panel', 0x3a4f66);
    F(-9.75, 0, 15.5, 'steel'); F(-9, 0, 15.5, 'steel');
    B25(-9.75, 0.25, 15.5, 3, 1, 1, 'wood');
    // traffic cones: base + tip
    for (const [cx, cz] of [[2.5, 15], [3.5, 15.5]]) {
      B25(cx - 0.25, 0, cz - 0.25, 2, 1, 2, 'loose', 0xff7a1a);
      B25(cx - 0.125, 0.25, cz - 0.125, 1, 2, 1, 'loose', 0xff7a1a);
    }
    // flag pole + flag
    B25(15.875, 0, 14.875, 1, 8, 1, 'steel');
    B25(16.125, 1.5, 14.875, 2, 2, 1, 'panel', 0xc23b2e);
    // subway entrance: railing posts + rails, green globe lamp (steel plate
    // under the globe — glass can't rest on glass)
    for (const [sx, sz] of [[-5, 14], [-3.25, 14], [-5, 15], [-3.25, 15]]) B25(sx, 0, sz, 1, 3, 1, 'steel');
    B25(-5, 0.75, 14, 1, 1, 5, 'steel'); B25(-3.25, 0.75, 14, 1, 1, 5, 'steel');
    B25(-5, 0, 13.5, 1, 3, 1, 'steel');
    B25(-5.25, 0.75, 13.25, 2, 1, 2, 'steel');
    B25(-5.25, 1, 13.25, 2, 1, 2, 'glass', 0x3ddc84);
    // --- CONSTRUCTION SITE (NE) ------------------------------------------------------
    this._box(11, 0, -13, 2, 1, 2, 'concrete', 1);                          // crane base
    for (let y = 1; y <= 6; y++) this._block(11, y, -13, 'steel', 1);       // mast
    this._block(12, 6, -13, 'steel', 1); this._block(13, 6, -13, 'steel', 1); this._block(14, 6, -13, 'steel', 1); // jib
    this._block(10, 6, -13, 'steel', 1); this._block(9, 6, -13, 'concrete', 1); // counter-jib + weight
    const cont = (x, y, z, c) => { this._block(x, y, z, 'panel', 1, c); this._block(x + 1, y, z, 'panel', 1, c); };
    cont(16, 0, -11, 0xd96c2c); cont(18, 0, -11, 0x2a5f9a); cont(16, 0, -9.5, 0x2e5d3a);
    cont(16, 1, -11, 0x2a5f9a); cont(18, 1, -11, 0xd96c2c);                 // shipping containers
    for (const px of [9, 10, 11, 12]) this._block(px, 0, -10, 'loose', 1, 0x6a7078);
    this._block(10, 1, -10, 'loose', 1, 0x6a7078); this._block(11, 1, -10, 'loose', 1, 0x6a7078); // pipe pile
    this._block(13.5, 0, -9.5, 'panel', 1, 0x2a4f9a); this._block(13.5, 1, -9.5, 'panel', 1, 0x2a4f9a); // porta-potty
    for (const bx of [8.5, 10, 11.5, 13]) this._block(bx, 0, -8, 'concrete', 1); // jersey barriers
    // --- LANDMARK PLAZA (NW) ---------------------------------------------------------
    {
      const ox = -15, oz = -13; // fountain: ring, water, center jet
      for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 3;
        const center = x === 1 && z === 1;
        this._block(ox + x, 0, oz + z, center || edge ? 'concrete' : 'glass', 1, center || edge ? undefined : 0x3fa7d6);
      }
      this._block(ox + 1, 1, oz + 1, 'steel', 1);
      this._block(ox + 1, 2, oz + 1, 'glass', 1, 0x3fa7d6);
    }
    this._block(-10, 0, -12, 'concrete', 1); this._block(-10, 1, -12, 'steel', 1);
    this._block(-10, 2, -12, 'steel', 0.5, 0x8a8f98);                        // statue
    {
      const ox = -20, oz = -14; // water tower on a brick pump house
      for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 3;
        if (edge) { this._block(ox + x, 0, oz + z, 'brick', 1); this._block(ox + x, 1, oz + z, 'brick', 1); }
        this._block(ox + x, 2, oz + z, 'concrete', 1);
      }
      for (const [lx, lz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) this._block(ox + lx, 3, oz + lz, 'wood', 1);
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 2;
        if (edge) this._block(ox + x, 4, oz + z, 'wood', 1);
        this._block(ox + x, 5, oz + z, 'wood', 1);
      }
    }
    {
      const ox = -20, oz = -8; // apartment block: brick, slabs every 2 floors
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 6; x++) {
          for (let z = 0; z < 4; z++) {
            const edge = x === 0 || x === 5 || z === 0 || z === 3;
            const isSlab = y % 2 === 0;
            if (!edge && !isSlab) continue;
            const mat = edge && !isSlab && (x + z + y) % 3 === 0 ? 'glass' : 'brick';
            this._block(ox + x, y, oz + z, mat, 1);
          }
        }
      }
      this._box(ox, 5, oz, 6, 1, 4, 'wood', 1); // roof
    }
    // --- CIVIC ROW (W) -----------------------------------------------------------------
    {
      const ox = -21, oz = -2; // church: brick nave, wood gable, tower + spire
      for (let x = 0; x < 3; x++) for (let z = 0; z < 5; z++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 4;
        if (!edge) continue;
        this._block(ox + x, 0, oz + z, 'brick', 1);
        this._block(ox + x, 1, oz + z, (x + z) % 2 === 1 ? 'glass' : 'brick', 1);
        this._block(ox + x, 2, oz + z, 'wood', 1);
      }
      for (let z = 0; z < 5; z++) this._block(ox + 1, 3, oz + z, 'wood', 1); // ridge
      for (let y = 0; y < 4; y++) for (const [tx, tz] of [[0, 5], [1, 5], [0, 6], [1, 6]]) this._block(ox + tx, y, oz + tz, 'brick', 1);
      this._box(ox, 4, oz + 5, 2, 1, 2, 'wood', 1);
      this._block(ox, 5, oz + 5, 'wood', 1); // spire tip
    }
    {
      const ox = -16, oz = 4; // brownstone: brick row house + stoop
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 4; x++) {
          for (let z = 0; z < 3; z++) {
            const edge = x === 0 || x === 3 || z === 0 || z === 2;
            if (!edge) continue;
            const mat = y > 0 && (x + z) % 2 === 1 && !((x === 0 || x === 3) && (z === 0 || z === 2)) ? 'glass' : 'brick';
            this._block(ox + x, y, oz + z, mat, 1);
          }
        }
      }
      this._box(ox, 3, oz, 4, 1, 3, 'wood', 1); // roof
      this._block(ox + 1, 0, oz - 1, 'concrete', 1); // stoop
    }
    {
      const ox = -21, oz = 8; // parking garage: columns + open decks (pancakes!)
      const cols = [[0, 0], [2, 0], [4, 0], [0, 2], [4, 2], [0, 4], [2, 4], [4, 4]];
      for (const level of [0, 2, 4]) {
        for (const [cx, cz] of cols) this._block(ox + cx, level, oz + cz, 'steel', 1);
        this._box(ox, level + 1, oz, 5, 1, 5, 'concrete', 1);
      }
    }
    // --- GAS STATION (E) -----------------------------------------------------------------
    {
      const ox = 19, oz = 10;
      for (const [px, pz] of [[0, 0], [4, 0], [0, 3], [4, 3]]) { this._block(ox + px, 0, oz + pz, 'steel', 1); this._block(ox + px, 1, oz + pz, 'steel', 1); }
      this._box(ox, 2, oz, 5, 1, 4, 'panel', 1, 0xe8ecf2); // canopy
      this._box(ox + 1, 0, oz + 1, 2, 1, 2, 'concrete', 1);
      this._box(ox + 1, 1, oz + 1, 2, 1, 2, 'glass', 1);    // kiosk
      for (const px of [3.5, 4.0]) { this._block(ox + px, 0, oz + 2, 'steel', 0.5); this._block(ox + px, 0.5, oz + 2, 'panel', 0.5, 0xc23b2e); } // pumps
    }
    // --- ELEVATED BRIDGE (S edge): 6 m span at 0.5 m density — paired steel
    // bents every 4 m, full-width crossheads, 12-block deck, side rails, train.
    {
      const Z0 = 22; // deck rows: 12 × 0.5 m (z 22..27.5)
      for (let x = -20; x <= 20; x += 4) {
        for (const cz of [24, 25]) for (let y = 0; y < 3; y++) this._block(x, y, cz, 'steel', 1);
        for (let w = 0; w < 6; w++) this._block(x, 3, Z0 + w, 'steel', 1); // crosshead (1 m)
      }
      for (let x = -20; x <= 20; x += 0.5) {
        for (let w = 0; w < 12; w++) this._block(x, 4, Z0 + w * 0.5, 'concrete', 0.5); // deck (0.5 m)
      }
      for (let x = -20; x <= 20; x += 2) {
        this._block(x, 4.5, Z0, 'steel', 0.5);
        this._block(x, 4.5, Z0 + 5.5, 'steel', 0.5);
      }
      for (let x = -20; x < 20; x += 0.5) {
        this._block(x, 5, Z0, 'steel', 0.5);
        this._block(x, 5, Z0 + 5.5, 'steel', 0.5);
      }
      this._box(-4, 4.5, 23.5, 6, 2, 2, 'panel', 0.5, 0xf7c948);
      this._box(-1, 4.5, 23.5, 6, 2, 2, 'panel', 0.5, 0xf7c948); // parked train cars
    }
  }

  // Neighbors are found by scanning each face's fine cells, so mixed-size
  // blocks connect wherever their faces touch (a 2 m slab borders four 1 m
  // bricks or sixteen 0.5 m bricks on the same face).
  _buildNeighbors() {
    for (const b of this.blocks) {
      const g = [b.gx, b.gy, b.gz];
      const found = new Set();
      for (const [dx, dy, dz] of DIRS) {
        const a = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
        const sign = dx + dy + dz;
        const fixed = sign > 0 ? g[a] + b.fs : g[a] - 1;
        const i1 = (a + 1) % 3, i2 = (a + 2) % 3;
        for (let u = 0; u < b.fs; u++) {
          for (let v = 0; v < b.fs; v++) {
            const c = [0, 0, 0];
            c[a] = fixed; c[i1] = g[i1] + u; c[i2] = g[i2] + v;
            const nb = this.grid.get(key(c[0], c[1], c[2]));
            if (nb && nb !== b) found.add(nb);
          }
        }
      }
      b.neighbors = [...found];
    }
  }

  // --- support graph -----------------------------------------------------------

  // Track which meter cells the opening currently covers; support is only
  // recalculated when coverage or the graph changes — not every frame.
  _coverageChanged() {
    const h = this.hole;
    const remR = h.radius * REMOVAL_FRAC;
    const next = new Set();
    for (let gx = Math.floor(h.x - remR); gx <= Math.floor(h.x + remR); gx++) {
      for (let gz = Math.floor(h.z - remR); gz <= Math.floor(h.z + remR); gz++) {
        const cx = gx + 0.5 - h.x, cz = gz + 0.5 - h.z;
        if (cx * cx + cz * cz <= remR * remR) next.add(gx + ',' + gz);
      }
    }
    if (next.size === this._coverage.size) {
      let same = true;
      for (const c of next) if (!this._coverage.has(c)) { same = false; break; }
      if (same) return false;
    }
    this._coverage = next;
    return true;
  }

  _recalcSupport() {
    const h = this.hole;
    const remR = h.radius * REMOVAL_FRAC;
    const remR2 = remR * remR;
    const instabR = h.radius + INSTAB_ZONE + 0.6;

    // Rim support percentage: floor blocks near the rim sample their 4 base
    // corners against the opening. <30% supported = no floor anchor anymore.
    for (const b of this.blocks) {
      if (b.gy !== 0 || b.state === 'consumed' || b.state === 'falling') continue;
      const dx = b.x - h.x, dz = b.z - h.z;
      if (dx * dx + dz * dz > instabR * instabR) { b.supportRatio = 1; continue; }
      const o = b.s / 2 - 0.05;
      let outside = 0;
      for (const [sx, sz] of [[-o, -o], [o, -o], [-o, o], [o, o]]) {
        const px = b.x + sx - h.x, pz = b.z + sz - h.z;
        if (px * px + pz * pz > remR2) outside++;
      }
      b.supportRatio = outside / 4;
    }

    // 0-1 BFS from floor anchors. Vertical moves reset the cantilever span;
    // horizontal moves grow it in METERS and fail past the entered block's
    // maxSpan. A neighbor counts as vertical only when it sits entirely
    // above; overlapping y-ranges are horizontal connections (mixed sizes).
    const span = new Map();
    const dq = [];
    for (const b of this.blocks) {
      if (b.gy !== 0) continue;
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      if (b.supportRatio < 0.3) continue; // base mostly gone — no anchor
      span.set(b, 0);
      dq.push(b);
    }
    let head = 0;
    while (head < dq.length) {
      const cur = dq[head++];
      const cs = span.get(cur);
      for (const nb of cur.neighbors) {
        if (nb.state !== 'static' && nb.state !== 'unstable') continue;
        if (nb.gy + nb.fs <= cur.gy) continue; // entirely below — support never flows downward
        let ns;
        if (nb.gy >= cur.gy + cur.fs) {
          if (cur.mat.vertBond < BOND_CARRY) continue;
          ns = 0;
        } else {
          if (cur.mat.horizBond < BOND_CARRY) continue;
          ns = cs + (cur.s + nb.s) / 2;
          // Floor cells over the void can only cantilever a single meter;
          // upper structures use the material's own span limit.
          const cap = nb.gy === 0 ? Math.min(nb.mat.maxSpan, FLOOR_CANTILEVER) : nb.mat.maxSpan;
          if (ns > cap) continue;
        }
        const prev = span.get(nb);
        if (prev !== undefined && prev <= ns) continue;
        span.set(nb, ns);
        dq.push(nb); // relaxation converges: spans are small bounded numbers
      }
    }

    // Split supported blocks into solid vs hanging (cantilever reaching over
    // the opening). The crack front is seeded from SOLID blocks only — the
    // hanging rim is itself part of the failure zone, so measuring crack
    // distance from it would let the void's center drop first. With solid
    // seeds the rim lets go FIRST and failure sweeps inward from the
    // circumference: destruction is driven by the hole's edge, not its center.
    // The reach SCALES with the hole: at SIZE 1 the creak zone hugs the
    // visible rim (~0.5 m past it) instead of pre-failing facades 4-5 m
    // away; at max radius it behaves as before (remR + span + 1.5).
    const hangScale = h.radius / MAX_RADIUS;
    const hangingSet = new Set();
    for (const [b, sp] of span) {
      if (sp >= 1) {
        const dx = b.x - h.x, dz = b.z - h.z;
        if (Math.hypot(dx, dz) < remR + (sp + 1.5) * hangScale) hangingSet.add(b);
      }
    }
    const front = new Map();
    {
      const fq = [];
      for (const [b] of span) {
        if (hangingSet.has(b)) continue;
        front.set(b, 0);
        fq.push(b);
      }
      let fh = 0;
      while (fh < fq.length) {
        const cur = fq[fh++];
        const cd = front.get(cur);
        for (const nb of cur.neighbors) {
          if (nb.state !== 'static' && nb.state !== 'unstable') continue;
          if (front.has(nb)) continue;
          front.set(nb, cd + 1);
          fq.push(nb);
        }
      }
    }

    // Failure timing: hanging rim blocks creak quickly (the edge tips in
    // first); unsupported blocks fail on the crack-front wave — failTime
    // grows with distance from solid ground, so the collapse propagates
    // rim → center. Damage is PERSISTENT: leaving the hole stops new stress
    // but only heals slowly, so collapse progress is never reset by wiggling.
    for (const b of this.blocks) {
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      const sp = span.get(b);
      if (sp === undefined) {
        b.state = 'unstable';
        const dist = front.get(b) ?? 0; // no path to support at all = let go now
        // material creak scales with brick size: small bricks pop, big slabs grind
        const failTime = Math.min(FAIL_CAP, b.mat.delay * this.tune.creak * (1 + 0.15 * b.gy * FINE) * b.s + this.tune.waveK * dist);
        b.failRate = 1 / Math.max(0.05, failTime);
      } else if (hangingSet.has(b)) {
        b.state = 'unstable';
        const failTime = Math.min(HANG_CAP, b.mat.delay * this.tune.creak * (1 + 0.15 * b.gy * FINE) * b.s + 0.15 + 0.25 * sp);
        b.failRate = 1 / failTime;
      } else if (b.state === 'unstable') {
        b.state = 'static'; // support returned — damage stays, heals over time
        b.failRate = 0;
      }
    }
    this._graphDirty = false;
  }

  // --- chunks & debris ---------------------------------------------------------

  _makeChunk(members, vx = 0, vy = 0, vz = 0) {
    let cx = 0, cy = 0, cz = 0, vol = 0, massSum = 0, sizeSum = 0;
    for (const b of members) {
      const v = b.s ** 3;
      cx += b.x * v; cy += b.y * v; cz += b.z * v;
      vol += v; massSum += b.mat.mass * v; sizeSum += b.s;
    }
    cx /= vol; cy /= vol; cz /= vol;
    const chunk = {
      id: this._chunkId++, blocks: members, cx, cy, cz,
      vx, vy, vz, rotX: 0, rotZ: 0, vRotX: 0, vRotZ: 0,
      density: massSum / vol, // drives fall speed (heavier slams harder)
      sizeAvg: sizeSum / members.length, // drives tip sluggishness (big slabs rotate slowly)
    };
    for (const b of members) {
      b.parentChunk = chunk;
      b.relX = b.x - cx; b.relY = b.y - cy; b.relZ = b.z - cz;
    }
    this.chunks.push(chunk);
    return chunk;
  }

  // Flood-fill connected freshly-fallen blocks into rigid chunks. Weak
  // interfaces (glass, panel seams) are not crossed, so structures break
  // along their material joints. Loose blocks always fall individually.
  _groupChunks() {
    for (const b of this.blocks) {
      if (b.state !== 'falling' || b.parentChunk || b.matType === 'loose') continue;
      if (this.time - b.fallT > FRESH_WINDOW) continue;
      const members = [];
      const stack = [b];
      b._mark = true;
      while (stack.length) {
        const cur = stack.pop();
        members.push(cur);
        if (members.length >= CHUNK_CAP) continue;
        for (const nb of cur.neighbors) {
          if (nb.state !== 'falling' || nb._mark || nb.parentChunk || nb.matType === 'loose') continue;
          if (this.time - nb.fallT > FRESH_WINDOW) continue;
          const vertical = nb.gy >= cur.gy + cur.fs || nb.gy + nb.fs <= cur.gy;
          const bond = vertical
            ? Math.min(cur.mat.vertBond, nb.mat.vertBond)
            : Math.min(cur.mat.horizBond, nb.mat.horizBond);
          if (bond < GROUP_BOND) continue;
          nb._mark = true;
          stack.push(nb);
        }
      }
      for (const m of members) m._mark = false;
      if (members.length >= CHUNK_MIN) this._makeChunk(members);
    }
  }

  _overVoid(x, z, remR2) {
    const dx = x - this.hole.x, dz = z - this.hole.z;
    return dx * dx + dz * dz <= remR2;
  }

  // fall acceleration for a material density — driven by tune.gravity, with
  // the same density spread as the default (glass ~0.6×, steel ~1.5×)
  _fallG(density) { return this.tune.gravity * (0.4 + 0.6 * (density / 2)); }

  // --- solid-surface heightmap (block-vs-block collision) ---------------------

  // current-position fine min-corner (gx/gy/gz are build-time; blocks move)
  _foot(b) {
    return [Math.round(b.x / FINE - b.fs / 2), Math.round(b.y / FINE - b.fs / 2), Math.round(b.z / FINE - b.fs / 2)];
  }

  _topAdd(b) {
    const [fx, fy, fz] = this._foot(b);
    const top = (fy + b.fs) * FINE;
    for (let ix = 0; ix < b.fs; ix++) {
      for (let iz = 0; iz < b.fs; iz++) {
        const k = (fx + ix) + ',' + (fz + iz);
        if ((this._top.get(k) || 0) < top) this._top.set(k, top);
      }
    }
  }

  // A block stopped being solid (detached / woken / consumed): drop its
  // columns to the next solid block below, and wake debris sleeping on it.
  _topRemove(b) {
    const [fx, fy, fz] = this._foot(b);
    const bTop = (fy + b.fs) * FINE;
    for (let ix = 0; ix < b.fs; ix++) {
      for (let iz = 0; iz < b.fs; iz++) {
        const k = (fx + ix) + ',' + (fz + iz);
        if (this._top.get(k) === bTop) {
          let ny = 0;
          for (let cy = fy - 1; cy >= 0; cy--) {
            const o = this.grid.get(key(fx + ix, cy, fz + iz));
            if (o && (o.state === 'static' || o.state === 'unstable')) { ny = (o.gy + o.fs) * FINE; break; }
          }
          if (ny > 0) this._top.set(k, ny); else this._top.delete(k);
        }
        const sl = this._sleepers.get(k);
        if (sl) {
          // iterate a copy: the recursive _topRemove(s) below can splice this
          // same column list again (cluster wakes), invalidating a live loop
          for (const s of sl.slice()) {
            if (!s.asleep || s.restTop < bTop - 1e-6) continue;
            const i = sl.indexOf(s);
            if (i >= 0) sl.splice(i, 1);
            s.asleep = false;
            this._topRemove(s); // its own column contribution re-evaluates
          }
          if (sl.length === 0) this._sleepers.delete(k);
        }
      }
    }
  }

  // highest solid surface under a footprint at (x,z), 0 = bare ground
  _topAt(x, z, fs) {
    const gx0 = Math.round(x / FINE - fs / 2), gz0 = Math.round(z / FINE - fs / 2);
    let top = 0;
    for (let ix = 0; ix < fs; ix++) {
      for (let iz = 0; iz < fs; iz++) {
        const t = this._top.get((gx0 + ix) + ',' + (gz0 + iz));
        if (t > top) top = t;
      }
    }
    return top;
  }

  // first SOLID block overlapping b's leading side face or bottom face —
  // falling bodies scrape walls and shatter on structures instead of
  // ghosting through them. (vx,vz) come from the body (chunk or debris).
  _contact(b, vx, vz) {
    const [fx, fy, fz] = this._foot(b);
    const xDominant = Math.abs(vx) > Math.abs(vz);
    const sgn = (xDominant ? vx : vz) >= 0 ? 1 : -1;
    for (let u = 0; u < b.fs; u++) {
      for (let v = 0; v < b.fs; v++) {
        let cx, cz;
        if (xDominant) { cx = sgn > 0 ? fx + b.fs : fx - 1; cz = fz + u; }
        else { cz = sgn > 0 ? fz + b.fs : fz - 1; cx = fx + u; }
        const cy = fy + v;
        let o = this.grid.get(key(cx, cy, cz));
        if (o && o !== b && (o.state === 'static' || o.state === 'unstable')) return o;
        o = this.grid.get(key(fx + u, fy - 1, fz + v));
        if (o && o !== b && (o.state === 'static' || o.state === 'unstable')) return o;
      }
    }
    return null;
  }

  // wake a sleeping debris block: unregister it and drop its solid
  // contribution (its own support re-evaluates from the pile)
  _unsleep(b) {
    if (!b.asleep) return;
    b.asleep = false;
    const sl = this._sleepers.get(b.restCol);
    if (sl) {
      const i = sl.indexOf(b);
      if (i >= 0) sl.splice(i, 1);
      if (sl.length === 0) this._sleepers.delete(b.restCol);
    }
    this._topRemove(b);
  }

  _stepChunks(dt) {
    const h = this.hole;
    const remR = h.radius * REMOVAL_FRAC;
    const remR2 = remR * remR;
    const attractR = h.radius + ATTRACT_ZONE;

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      const dx = h.x - c.cx, dz = h.z - c.cz;
      const dist = Math.hypot(dx, dz) || 0.001;

      // attraction zone: mild inward pull keeps debris funneling to the opening
      if (dist < attractR) {
        const a = this.tune.attract * (1 - dist / attractR);
        c.vx += (dx / dist) * a * dt;
        c.vz += (dz / dist) * a * dt;
      }
      c.vy -= this._fallG(c.density) * dt;
      c.cx += c.vx * dt; c.cy += c.vy * dt; c.cz += c.vz * dt;

      // rim torque: a chunk straddling the rim tips toward the opening —
      // big slabs tip slowly, small bricks snap over
      if (dist > 0.1 && dist < h.radius + 2.0) {
        const tip = 3.5 / c.sizeAvg;
        c.vRotZ += (dx / dist) * tip * dt;
        c.vRotX += (-dz / dist) * tip * dt;
      }
      c.vRotX *= 1 - 2 * dt; c.vRotZ *= 1 - 2 * dt;
      // cap chunk tumble: slabs lean, they don't pirouette — and members born
      // of a wildly rotated chunk start life AABB-interpenetrating
      c.rotX = Math.max(-0.7, Math.min(0.7, c.rotX + c.vRotX * dt));
      c.rotZ = Math.max(-0.7, Math.min(0.7, c.rotZ + c.vRotZ * dt));

      // sync constituent blocks, consume those sunk below the floor, detect impact
      const cosZ = Math.cos(c.rotZ), sinZ = Math.sin(c.rotZ);
      const cosX = Math.cos(c.rotX), sinX = Math.sin(c.rotX);
      let live = 0, impact = false;
      for (const cb of c.blocks) {
        if (cb.state === 'consumed') continue;
        let rx = cb.relX * cosZ - cb.relY * sinZ;
        let ry = cb.relX * sinZ + cb.relY * cosZ;
        const rz = cb.relZ * cosX - ry * sinX;
        ry = cb.relZ * sinX + ry * cosX;
        cb.x = c.cx + rx; cb.y = c.cy + ry; cb.z = c.cz + rz;
        if (this._overVoid(cb.x, cb.z, remR2)) {
          if (cb.y + cb.s / 2 <= SINK_Y) { this._consume(cb); continue; }
        } else {
          // impact on ANY solid surface — rooftops, rims, debris piles; and
          // hard contacts smash (damage) whatever the chunk hits
          if (cb.y <= this._topAt(cb.x, cb.z, cb.fs) + cb.s / 2 + 0.05) impact = true;
          else {
            const hit = this._contact(cb, c.vx, c.vz);
            if (hit) {
              impact = true;
              if (Math.hypot(c.vx, c.vy, c.vz) > 5) hit.damage = Math.min(0.95, hit.damage + 0.2);
            }
          }
        }
        live++;
      }
      if (live === 0) { this.chunks.splice(i, 1); continue; }
      if (impact) {
        this._splitChunk(c, Math.abs(c.vy));
        this.chunks.splice(i, 1);
      }
    }
  }

  // Ground impact: break along the weakest interfaces. Hard impacts shatter
  // further (higher bond threshold) and scatter singles; gentle set-downs
  // dissolve into resting debris.
  _splitChunk(chunk, impactSpeed) {
    const pool = chunk.blocks.filter((b) => b.state !== 'consumed');
    for (const b of pool) b.parentChunk = null;
    if (pool.length >= 3 && impactSpeed > 4) {
      this.events.push({ type: 'crash', x: chunk.cx, z: chunk.cz, size: pool.length });
    }
    if (impactSpeed < 1.5) {
      for (const b of pool) this._toDebris(b, chunk, 0.3);
      return;
    }
    const threshold = GROUP_BOND + Math.min(0.4, impactSpeed * 0.03);
    const inPool = new Set(pool);
    const seen = new Set();
    for (const start of pool) {
      if (seen.has(start)) continue;
      const members = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const cur = stack.pop();
        members.push(cur);
        for (const nb of cur.neighbors) {
          if (!inPool.has(nb) || seen.has(nb)) continue;
          const vertical = nb.gy >= cur.gy + cur.fs || nb.gy + nb.fs <= cur.gy;
          const bond = vertical
            ? Math.min(cur.mat.vertBond, nb.mat.vertBond)
            : Math.min(cur.mat.horizBond, nb.mat.horizBond);
          if (bond < threshold) continue;
          seen.add(nb);
          stack.push(nb);
        }
      }
      if (members.length >= CHUNK_MIN) {
        this._makeChunk(members, chunk.vx * 0.5, Math.abs(chunk.vy) * 0.15, chunk.vz * 0.5);
      } else {
        for (const b of members) this._toDebris(b, chunk, 1.0);
      }
    }
  }

  _toDebris(b, chunk, scatter) {
    b.state = 'falling';
    b.parentChunk = null;
    b.fallT = -1; // settled debris never re-groups into chunks
    b.asleep = false;
    b.vx = chunk.vx * 0.5 + this.rng.float(-1.5, 1.5) * scatter;
    b.vy = Math.max(0, -chunk.vy * 0.1) + this.rng.float(0, 1.5) * scatter;
    b.vz = chunk.vz * 0.5 + this.rng.float(-1.5, 1.5) * scatter;
    b.vRotX = this.rng.float(-3, 3) * scatter;
    b.vRotZ = this.rng.float(-3, 3) * scatter;
  }

  _stepDebris(dt) {
    const h = this.hole;
    const remR = h.radius * REMOVAL_FRAC;
    const remR2 = remR * remR;
    const attractR = h.radius + ATTRACT_ZONE;
    const attractR2 = attractR * attractR;
    const rimR = h.radius + INSTAB_ZONE + 0.5;

    for (const b of this.blocks) {
      if (b.state !== 'falling' || b.parentChunk) continue;
      const dx = h.x - b.x, dz = h.z - b.z;
      const dist2 = dx * dx + dz * dz;
      const overVoid = dist2 <= remR2;
      if (b.asleep) {
        // settled rubble wakes only for the void itself, support loss, or a
        // hard hit — never for the vacuum. If it is not over the hole, it
        // does not move.
        if (!overVoid) continue;
        this._unsleep(b);
      }
      if (dist2 < attractR2 && !b._grounded) {
        const dist = Math.sqrt(dist2) || 0.001;
        const a = this.tune.attract * (1 - dist / attractR);
        b.vx += (dx / dist) * a * dt;
        b.vz += (dz / dist) * a * dt;
      }
      b.vy -= this._fallG(b.mat.mass) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.rotX += b.vRotX * dt; b.rotZ += b.vRotZ * dt;

      if (overVoid) {
        if (b.y + b.s / 2 <= SINK_Y) this._consume(b);
        continue;
      }
      // wall scrape: falling bodies damp against standing structures and
      // smash them a little — never ghost through a facade
      const hit = this._contact(b, b.vx, b.vz);
      if (hit) {
        b.vx *= 0.5; b.vz *= 0.5;
        if (b.vy < 0) b.vy *= -0.25;
        if (Math.abs(b.vy) > 5) hit.damage = Math.min(0.95, hit.damage + 0.1);
      }
      // land on the solid SURFACE (roof/pile), not the ground plane. Loose
      // bodies contacted last step count as support too — without that, a
      // block landing on awake rubble sinks to ground level inside it and
      // gets squirted out sideways, and the pile never solidifies.
      let support = this._topAt(b.x, b.z, b.fs);
      let looseSup = false;
      const rl = b._restLoose;
      b._restLoose = null; // re-set by this step's contact pass if still touching
      if (rl && rl.state === 'falling' && !rl.asleep) {
        const hSum = (b.s + rl.s) / 2;
        const top = rl.y + rl.s / 2;
        if (Math.abs(b.x - rl.x) < hSum && Math.abs(b.z - rl.z) < hSum && top > support) {
          support = top;
          looseSup = true;
        }
      }
      const rest = support + b.s / 2;
      b._grounded = false; // vacuum only acts on airborne/sliding bodies
      if (b.y <= rest) {
        b._grounded = true;
        b.y = rest;
        if (b.vy < 0) b.vy = b.vy < -2 ? -b.vy * 0.25 : 0;
        b.vx *= 1 - 3 * dt; b.vz *= 1 - 3 * dt;
        b.vRotX *= 1 - 3 * dt; b.vRotZ *= 1 - 3 * dt;
        const dist = Math.sqrt(dist2) || 0.001;
        const nearRim = dist2 < rimR * rimR;
        // tip over the rim instead of balancing on the edge — only when the
        // hole-facing edge really overhangs the opening. A block on solid
        // ground NEXT to the hole has no business moving, and contact with
        // the pile damps spin instead of letting it pirouette in place.
        if (nearRim && this._overVoid(b.x + (dx / dist) * b.s * 0.5, b.z + (dz / dist) * b.s * 0.5, remR2)) {
          const tip = 1.5 / b.s;
          b.rotX = Math.max(-0.6, Math.min(0.6, b.rotX + (-dz / dist) * tip * dt));
          b.rotZ = Math.max(-0.6, Math.min(0.6, b.rotZ + (dx / dist) * tip * dt));
        } else if (looseSup) {
          // resting on loose rubble: quiet down but stay awake — sleep comes
          // once the layer below solidifies into the heightmap
          b.rotX *= 1 - 4 * dt; b.rotZ *= 1 - 4 * dt;
        } else {
          b.rotX *= 1 - 4 * dt; b.rotZ *= 1 - 4 * dt;
          // angle of repose: steep piles shed blocks toward lower columns —
          // this is what makes collapses SPILL outward instead of stacking flat
          let lowTop = support, lowX = 0, lowZ = 0;
          for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const t = this._topAt(b.x + nx * b.s, b.z + nz * b.s, b.fs);
            if (t < lowTop) { lowTop = t; lowX = nx; lowZ = nz; }
          }
          if (support - lowTop > b.s * 1.25) {
            b.vx += lowX * 6 * dt; b.vz += lowZ * 6 * dt;
          } else if (b.vx * b.vx + b.vz * b.vz < 0.06) {
            // sleep CANDIDATE — committed only after this step's contact
            // pass proves the block is contact-free, so nothing ever dozes
            // off mid-overlap (frozen overlaps can never separate)
            b._wantSleep = true;
            b._sleepSupport = support;
          }
        }
      }
    }
    this._resolveDebrisContacts();
    // commit sleep candidates: grounded, slow, and now provably contact-free.
    // Even inside the attraction zone — constant vacuum pressure on resting
    // blocks is what ground piles into self-clipping churn; the hole wakes
    // sleepers when it reaches them (overVoid), and support loss wakes the rest.
    for (const b of this.blocks) {
      if (!b._wantSleep) continue;
      b._wantSleep = false;
      if (b.state !== 'falling' || b.parentChunk || b.asleep || b._inContact) continue;
      b.asleep = true;
      b.vx = 0; b.vy = 0; b.vz = 0; b.vRotX = 0; b.vRotZ = 0;
      const [fx, , fz] = this._foot(b);
      const colK = (fx + (b.fs >> 1)) + ',' + (fz + (b.fs >> 1));
      b.restCol = colK;
      b.restTop = b._sleepSupport;
      let sl = this._sleepers.get(colK);
      if (!sl) { sl = []; this._sleepers.set(colK, sl); }
      sl.push(b);
      this._topAdd(b);
    }
  }

  // Loose-body contact resolution: grounded/slow debris must never interpenetrate
  // each other, sleeping debris, or chunk members — they separate along the
  // least-penetration axis and bounce apart. (_contact/_top only see STATIC
  // structures; this pass covers every loose body those miss.) Deterministic:
  // blocks iterate in array order, pairs dedup by id, no rng.
  _resolveDebrisContacts() {
    const awake = [];
    for (const b of this.blocks) {
      if (b.state !== 'falling' || b.parentChunk || b.asleep) continue;
      // Movers are only the grounded / near-resting blocks — the visible pile.
      // Anything faster than ~1 m/s is rain that separates on its own; it
      // lands, gets grounded, and is resolved from the next step. This keeps
      // the pass cheap when a whole tower is in the air at once.
      if (!b._grounded && b.vx * b.vx + b.vy * b.vy + b.vz * b.vz > 1) continue;
      awake.push(b);
    }
    if (awake.length === 0) return;
    const movable = new Set(awake);
    for (const b of awake) b._inContact = false; // re-set on overlap below
    // buckets are padded by one fine cell all round: rounded footprints could
    // otherwise leave a ≤0.25 m sliver where two blocks overlap without ever
    // sharing a column — a gap exact AABB tests never even see
    const insertInto = (map, b) => {
      const [fx, , fz] = this._foot(b);
      for (let ix = -1; ix <= b.fs; ix++) {
        for (let iz = -1; iz <= b.fs; iz++) {
          const k = (fx + ix) + ',' + (fz + iz);
          let a = map.get(k);
          if (!a) { a = []; map.set(k, a); }
          a.push(b);
        }
      }
    };
    // obstacles (sleepers, chunk members, fast rain) don't move: bucket once
    const occObs = new Map();
    for (const b of this.blocks) {
      if (b.state !== 'falling' || movable.has(b)) continue;
      insertInto(occObs, b);
    }
    // Relaxation: compressed piles re-penetrate between passes, so resolve
    // twice per step, re-bucketing the (moved) movers each round.
    for (let round = 0; round < 2; round++) {
      const occMove = new Map();
      for (const b of awake) insertInto(occMove, b);
      for (const b of awake) {
        const [fx, , fz] = this._foot(b);
        for (let ix = -1; ix <= b.fs; ix++) {
          for (let iz = -1; iz <= b.fs; iz++) {
            const k = (fx + ix) + ',' + (fz + iz);
            const mo = occMove.get(k);
            if (mo) {
              for (const o of mo) {
                if (o === b || o.id < b.id) continue; // each pair once per round
                this._separate(b, o, true);
              }
            }
            const ob = occObs.get(k);
            if (ob) for (const o of ob) this._separate(b, o, false);
          }
        }
      }
    }
  }

  // AABB overlap test between two loose bodies, resolved along the axis of
  // least penetration. Blocks are axis-aligned in the sim (rotation is
  // render-side), so their shapes are respected exactly.
  _separate(b, o, movableO) {
    const hSum = (b.s + o.s) / 2;
    const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z;
    const px = hSum - Math.abs(dx), py = hSum - Math.abs(dy), pz = hSum - Math.abs(dz);
    const pen = Math.min(px, py, pz);
    if (pen <= 0) return;
    // trivially-embedded loaded contacts (a resting block pressed down by
    // gravity each step) stay sleep-eligible — only real overlaps hold blocks
    // awake, or loaded piles would churn and never solidify
    if (pen > 0.05) {
      b._inContact = true; // blocks sleep only when (meaningfully) contact-free
      if (movableO) o._inContact = true;
    }
    if (px <= py && px <= pz) this._pushAxis(b, o, 'x', dx >= 0 ? 1 : -1, px, movableO);
    else if (py <= px && py <= pz) this._pushAxis(b, o, 'y', dy >= 0 ? 1 : -1, py, movableO);
    else this._pushAxis(b, o, 'z', dz >= 0 ? 1 : -1, pz, movableO);
  }

  _pushAxis(b, o, axis, sign, pen, movableO) {
    const REST = 0.25; // restitution, matching the ground bounce
    pen *= 1.02;       // separation skin — visibly touching, never interpenetrating
    b[axis] += sign * pen * (movableO ? 0.5 : 1);
    if (movableO) o[axis] -= sign * pen * 0.5;
    // bounce only when actually closing along the axis; gentle contacts just stop
    const vb = b['v' + axis];
    if (vb * sign < 0) b['v' + axis] = Math.abs(vb) > 1 ? -vb * REST : 0;
    if (movableO) {
      const vo = o['v' + axis];
      if (vo * sign > 0) o['v' + axis] = Math.abs(vo) > 1 ? -vo * REST : 0;
    }
    // contact friction, and spin dies on contact — no pirouettes in a pile
    for (const t of ['x', 'z']) {
      if (t === axis) continue;
      b['v' + t] *= 0.6;
      if (movableO) o['v' + t] *= 0.6;
    }
    b.vRotX *= 0.5; b.vRotZ *= 0.5;
    if (movableO) { o.vRotX *= 0.5; o.vRotZ *= 0.5; }
    // remember what we are standing on: resting on a loose body counts as
    // support next step, so piles can quiet down and solidify bottom-up
    if (axis === 'y' && sign > 0) b._restLoose = o;
  }

  // --- consumption → score / growth / combo -------------------------------------

  _consume(b) {
    b.state = 'consumed';
    this._unsleep(b); // sleeping debris: unregister + drop solid contribution
    for (let ix = 0; ix < b.fs; ix++) {
      for (let iy = 0; iy < b.fs; iy++) {
        for (let iz = 0; iz < b.fs; iz++) {
          this.grid.delete(key(b.gx + ix, b.gy + iy, b.gz + iz));
        }
      }
    }
    const h = this.hole;
    h.chain += 1;
    h.chainTimer = COMBO_WINDOW;
    h.bestCombo = Math.max(h.bestCombo, h.chain);
    const gained = b.mat.mass * b.s ** 3 * comboMult(h.chain);
    h.mass += gained;
    h.rawMass += b.mat.mass * b.s ** 3; // un-multiplied, for the HUD bar (combos inflate mass past the world total)
    h.eatenCount += 1;
    // SIZE progression: escalating mass thresholds (scaled per scene — see
    // the constructor). Radius interpolates smoothly inside each level
    // (+0.5 m per level), so growth still reads continuously.
    const prevSize = h.size;
    let size = 1;
    while (size < MAX_SIZE && h.mass >= this._sizeLadder[size]) size++;
    h.size = size;
    const lo = this._sizeLadder[size - 1], hi = size < MAX_SIZE ? this._sizeLadder[size] : Infinity;
    h.sizeFrac = size >= MAX_SIZE ? 1 : Math.min(1, (h.mass - lo) / (hi - lo));
    h.radius = START_RADIUS + (h.size - 1 + Math.min(1, h.sizeFrac)) * 0.5;
    this._graphDirty = true;
    this.events.push({ type: 'eat', obj: b, hole: h, gained, chain: h.chain });
    // milestone events (render-side juice: shakes, bursts, big pops, toasts)
    if (h.size > prevSize) {
      this.events.push({ type: 'growth', size: h.size, hole: h });
    }
    const frac = h.rawMass / this.totalMass;
    if (this._massMarkIdx < 4 && frac >= (this._massMarkIdx + 1) * 0.25) {
      this._massMarkIdx++;
      this.events.push({ type: 'milestone', frac: this._massMarkIdx * 0.25, hole: h });
    }
  }

  // --- main step -----------------------------------------------------------------

  step(dt, move) {
    this.time += dt;
    const h = this.hole;

    if (h.chainTimer > 0) {
      h.chainTimer -= dt;
      if (h.chainTimer <= 0) h.chain = 0;
    }

    const speed = playerSpeedForRadius(h.radius) * this.tune.speed;
    if (move && (move.x || move.z)) {
      const len = Math.hypot(move.x, move.z) || 1;
      h.x += (move.x / len) * speed * dt;
      h.z += (move.z / len) * speed * dt;
      h.x = Math.min(this.bounds, Math.max(-this.bounds, h.x));
      h.z = Math.min(this.bounds, Math.max(-this.bounds, h.z));
    }

    // 1. support graph (only when coverage/graph actually changed)
    if (this._coverageChanged() || this._graphDirty) this._recalcSupport();

    // 2. damage accumulation → detach; healthy blocks slowly heal
    for (const b of this.blocks) {
      if (b.state === 'unstable') {
        b.damage += b.failRate * dt;
        if (b.damage >= 1) {
          b.state = 'falling';
          b.fallT = this.time;
          b.asleep = false;
          this._topRemove(b); // no longer a solid surface for others
          this._graphDirty = true;
          // shock: a block letting go jolts its neighbors — crumbling
          // propagates outward instead of shearing off cleanly
          for (const nb of b.neighbors) {
            if (nb.state === 'static' || nb.state === 'unstable') {
              nb.damage = Math.min(0.95, nb.damage + 0.15);
            }
          }
        }
      } else if (b.state === 'static' && b.damage > 0) {
        b.damage = Math.max(0, b.damage - 0.08 * dt);
      }
    }

    // 3. group freshly detached regions into rigid chunks
    this._groupChunks();

    // 4. physics: chunks, then individual debris
    this._stepChunks(dt);
    this._stepDebris(dt);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
