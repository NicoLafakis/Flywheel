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
// Scenes: 'gallery' (default, built by _buildScene below), 'manhattan'
// (Lower Manhattan), 'upper-manhattan' (Central Park + Upper Manhattan), and
// 'brooklyn' (bridges → DUMBO → Downtown → Prospect Park → Coney Island).

import { RNG } from './rng.js';
import { playerSpeedForRadius } from './tiers.js';
import { buildManhattan } from './voxelscene-manhattan.js';
import { buildUpperManhattan } from './voxelscene-upper-manhattan.js';
import { buildBrooklyn } from './voxelscene-brooklyn.js';
import { buildBoston } from './voxelscene-boston.js';
import { sedan, bus, boxVan, bigTruck, motorcycle, tree, lampPost } from './voxelkit.js';

// --- tuning ------------------------------------------------------------------
const FINE = 0.25;          // fine grid resolution (m); blocks are fs fine cells per side (0.25/0.5/1/2 m)
const COLLISION_CELL = 1;   // coarse broad-phase cell for moving-body vs solid queries
// 2.5× real-feel gravity: blocks SLAM (playtest: 26 read as floating).
// Harder impacts also split/bounce/scatter more — spill is the intent.
// Heavier material falls faster (game feel, not physics class): glass ~0.6×,
// steel ~1.5× — driven by DENSITY so block size doesn't change fall speed.
// All of gravity/wave/creak/speed/attract is live-tunable via sim.tune
// (dev sliders in SETTINGS); these constants are just the defaults. A zero
// creak setting makes support loss detach on the next sim step.
const GRAVITY = 70;
const BOND_CARRY = 0.5;      // min outgoing bond for a block to pass support along an edge
const GROUP_BOND = 0.45;     // min connection strength for two blocks to share a chunk
const CHUNK_MIN = 3;         // smaller detached groups become individual debris
const CHUNK_CAP = 64;        // max blocks per rigid chunk
const FRESH_WINDOW = 0.6;    // seconds after detaching during which blocks may chunk up
const REMOVAL_FRAC = 0.95;   // support-removal zone = hole radius × this (≈ visible opening)
const FLOOR_CANTILEVER = 1;  // ground-floor cells over the void hold at most this many meters
const HANG_CAP = 1.8;        // max seconds a cantilever over the void creaks before letting go
const WAVE_K = 0.10;         // seconds per meter the crack front takes to travel from the rim
const FAIL_CAP = 2.5;        // max seconds any unsupported block can hold on
const INSTAB_ZONE = 1.0;     // rim band beyond the opening that gets support-% checks
const ATTRACT_ZONE = 3.0;    // detached bodies feel an inward pull within radius + this
const ATTRACT_ACC = 2;
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
// Size ramp on sandbox movement. Was 0.75, and 0.75 was not enough to notice:
// `playerSpeedForRadius` DECREASES with radius (7.12 m/s at r=1.1 down to
// 5.19 at r=6.6), so it spent most of the ramp cancelling itself out and the
// net was 9.96 -> 12.29 m/s, +23%, while the radius grew 6.5x. In body-lengths
// that is 9.06 radii/s collapsing to 1.73 — the player got 5.2x slower relative
// to their own size, which is the "you will never make it across the map"
// complaint, and it costs 21.7 s to cross Brooklyn's 266 m diagonal and 24.2 s
// for Upper Manhattan's 297 m. (All the SIZE 12 numbers here are at the real
// r = 7.1 m the ladder reaches at sizeFrac 1, not the 6.6 m MAX_RADIUS above
// quotes for sizeFrac 0 — measured by stepping the sim, not by hand.)
//
// 2.72 holds SIZE 1 exactly where it was (nobody complained about small) and
// lands SIZE 12 at 26.12 m/s: 10.2 s across Brooklyn's diagonal, 11.4 s across
// Upper Manhattan's. Deliberately NOT constant body-lengths/s, which would
// demand ~50 m/s at max radius and is uncontrollable in a street grid — it also
// outruns what the chase camera can frame. This leaves the decline at
// 9.06 -> 3.68 radii/s, well under half the old slide. Linear in sizeT rather
// than shaped, because the camera's own distance ramp (camera.js, r=2.6 -> 5.6)
// pulls back over the middle of the same range, so apparent screen speed stays
// far flatter than the world speed — measured 0.62 -> 0.53 rad/s of angular
// rate at the camera across the whole ladder.
const SANDBOX_SPEED_RAMP = 2.72;
// Mirrors sim.js combo rules, duplicated so the sandbox stays free of the
// sim.js → citygen.js import chain.
const COMBO_WINDOW = 1.5;
// A combo level is earned for every 25 blocks, not every tiny brick. This keeps
// the counter readable and makes a chain feel like an achievement.
const comboMult = (chain) => Math.min(3, 1 + 0.1 * Math.floor(Math.max(0, chain - 1) / 25));
const GOALS = {
  gallery: { name: 'CLEAR THE COLLECTION', targetFraction: 0.5 },
  manhattan: { name: 'OPEN THE FINANCIAL DISTRICT', targetFraction: 0.5 },
  'upper-manhattan': { name: 'RECLAIM CENTRAL PARK', targetFraction: 0.5 },
  brooklyn: { name: 'CONNECT THE BOROUGHS', targetFraction: 0.5 },
  boston: { name: 'SWALLOW THE SEAPORT', targetFraction: 0.5 },
};
export const SANDBOX_COIN_COUNT = 60;
export const SANDBOX_COIN_VALUE = 2;
export const SANDBOX_GOAL_BONUS = 35;

// Shared progression curve for sandbox movement/camera feel. SIZE 1 is 0;
// SIZE 12 (including its final fraction) is 1.
export function sandboxSizeProgress(size, sizeFrac = 0) {
  return Math.max(0, Math.min(1, (size - 1 + Math.max(0, Math.min(1, sizeFrac))) / (MAX_SIZE - 1)));
}

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

// Structural-zone bookkeeping (see _buildZones / _recalcSupport).
const ZONE_CELL = 4;  // meters per cell of the zone lookup grid
// Coarse cell for the retired-rubble index (_restIdx). Only the hole's removal
// disc ever queries it, so wide cells (few lookups, longer lists) beat narrow
// ones; 8 m keeps a SIZE 12 disc down to ~9 cells.
const REST_CELL = 8;
// A block's cantilever span can never exceed the largest material maxSpan (the
// BFS refuses any edge that would push it past the cap), so the hanging test
// `dist < remR + (span + 1.5) * hangScale` can never reach further than this.
const MAX_MAT_SPAN = Math.max(...Object.values(MATERIALS).map((m) => m.maxSpan));
const HANG_REACH = MAX_MAT_SPAN + 1.5;

const key = (gx, gy, gz) => `${gx},${gy},${gz}`;
// Loose-body broad-phase cell key. Fine coordinates never leave ±8192 in any
// shipped scene, so the pack is injective — no aliasing, no phantom pairs.
const cellKey = (x, z) => (((x + 8192) & 0x3FFF) << 14) | ((z + 8192) & 0x3FFF);
// Same trick at 1 m for the camera-blocker index (see _bindCameraBlockers).
// 16x fewer entries than a fine-column index, and no shipped scene reaches
// +/-2048 m, so it is injective for everything that exists.
const mCellKey = (x, z) => (((x + 2048) & 0xFFF) << 12) | ((z + 2048) & 0xFFF);
// Both packs mask rather than range-check, so a scene that outgrows them does
// not fail — it ALIASES, and two far-apart columns quietly share a bucket. That
// surfaces as phantom collisions against nothing, which is a miserable thing to
// debug. `_assertCellKeyRange` (run once per scene build) turns the silent
// failure into a loud one. Limits are half-widths, in metres.
const CELL_KEY_LIMIT_M = 8192 * FINE; // fine-column index: ±2048 m at FINE 0.25
const MCELL_KEY_LIMIT_M = 2048;       // 1 m camera-blocker index
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// angle-of-repose probe offsets, flattened: the literal used to be rebuilt for
// every grounded debris block on every step
const REPOSE_DIRS = [1, 0, -1, 0, 0, 1, 0, -1];

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
    this.won = false;
    this.events = [];
    this.blocks = [];
    this.grid = new Map(); // every occupied fine cell -> owning block
    this.chunks = [];
    this._blockId = 1;
    this._chunkId = 1;
    this._coverage = new Set(); // meter cells currently inside the removal zone
    this._graphDirty = true;    // support graph must be re-evaluated
    // The vast majority of a city is healthy and static. Keep the exception
    // set explicit so idle Brooklyn does not scan all blocks for damage.
    this._damageBlocks = new Set();
    // Same idea, for the movers: a city of 73k blocks contains a few hundred
    // falling ones, so debris/contact/chunk passes iterate this list (kept in
    // block-array order, which IS id order) instead of scanning every block.
    this._falling = [];        // every ACTIVE block in state 'falling' (superset; predicates still checked)
    this._newFalling = [];     // detached this step, merged into _falling before the physics passes
    this._fallingRemoved = 0;  // consumed entries awaiting compaction
    // Settled rubble is retired OUT of `_falling` (see _retireResting). It used
    // to stay there forever — `_syncFalling` only ever dropped CONSUMED entries
    // — so a long session walked an ever-growing list four times per step
    // (debris, awake-build, obstacle-build, sleep-commit) to skip the same
    // sleeping blocks again and again. Measured on a 120 s brooklyn plough:
    // 11,853 entries, 90% of them asleep.
    //
    // Retired blocks are still fully simulated the moment anything disturbs
    // them; they are simply not RESCANNED while nothing does. Two things find
    // them again: `_restIdx`, a coarse spatial index the hole sweeps each step
    // (so the void still swallows resting piles), and every wake path calling
    // `_reviveResting` (support loss, chunk capture, shatter).
    this._restIdx = new Map();  // coarse cell -> retired sleepers, id-ascending
    this._restCount = 0;        // retired-and-indexed total, for diagnostics
    // Retirement is DEFERRED past FRESH_WINDOW. `_groupChunks` seeds its flood
    // fill from `_falling`, and its seed guard is `time - fallT <= FRESH_WINDOW`
    // — so a block pulled out of the list while still fresh is a seed that never
    // fires, which changes which chunks form and in what order. Blocks that fall
    // asleep inside their fresh window wait here instead; once past it, the seed
    // guard would have skipped them anyway and their absence is unobservable.
    this._retirePend = [];
    // Live indices into _falling for the passes that walk it while a revival
    // can splice into it. Any such pass must use an index (never for-of) and
    // register its cursor here, or an insert below the cursor shifts the walk
    // backwards onto an entry it already processed.
    this._debrisCursor = -1;    // _stepDebris
    this._groupCursor = -1;     // _groupChunks (via _makeChunk sweeping a sleeper)
    this._scStamp = 0;         // _resolveStaticContacts dedup generation
    // Support zones: the connectivity graph splits into physically separate
    // structures, and the support BFS never crosses between them (see
    // _buildZones). Only zones the hole can actually perturb are recomputed.
    this._dirtyComps = new Set(); // zones whose graph changed (a block detached / was eaten)
    this._prevProx = [];          // zones inside the hole's influence radius on the previous recalc
    // --- render active set (voxelworld.js) --------------------------------------
    // The renderer used to walk all 82,894 blocks every frame to discover that
    // ~108 of them (0.13%) had moved. Measured on Boston at SIZE 5: 4.31 ms of a
    // 4.40 ms `world.update`, of which 2.1-2.6 ms was the early-out predicate
    // alone. It now reads a union of the sim's OWN active structures instead, so
    // the cost is linear in what actually changed rather than in scene size.
    //
    // Three of the four sources already existed and are maintained by the sim for
    // its own reasons: `_falling` (every mover), `_damageBlocks` (every block
    // whose damage or unstable-wobble can change), and — added here — `_leanSet`.
    // The invariant the renderer depends on: a block's rendered pose or colour
    // can only change while it is in one of those three, because every write to
    // x/y/z/rotX/rotZ happens inside `_stepDebris`/`_stepChunks`/`_pushAxis` on a
    // member of `_falling`, every write to `damage` is followed by
    // `_watchDamage`, and `supportRatio` is only ever written in `_recalcSupport`.
    //
    // `_renderTouch` closes the gap at the EXITS: a block whose pose is stale at
    // the moment it leaves all three (retired mid-fall, eaten, lean cleared,
    // wobble cleared, tint healed to zero) would otherwise never be re-uploaded
    // and would hang in mid-air or keep a stale tint forever. Those five sites
    // push here; the renderer drains it. Nothing else is allowed to assume the
    // renderer will "notice" a change on its own.
    this._leanSet = new Set();     // floor blocks with supportRatio < 0.7 (the rim lean, which tracks the hole)
    this._renderTouch = [];        // blocks leaving the active sets with an unsynced pose
    this._renderTouchOverflow = false; // nobody drained it (headless/validator) — renderer falls back to a full pass
    this._massMarkIdx = 0;                 // city-consumption milestones: 25/50/75/100%
    this.MAX_SIZE = MAX_SIZE;
    this.bounds = 24;          // hole movement clamp (m); scenes may widen it
    this.boundsRect = null;    // optional {minX,maxX,minZ,maxZ}; overrides `bounds` for off-center maps
    this.coinAnchors = null;   // optional [{x, z, ...}]; scene-declared coin placement (see _placeCoins)
    this.sceneDecor = null;    // render-only roads/parks/water (VoxelWorld3D)
    this.cameraBlockers = [];  // tall-building AABBs for the chase cam
    // Live-tunable physics (dev sliders in SETTINGS → main.js pushes values
    // from save.settings; the constants above are the defaults/validator's).
    // `debrisCap`/`contactBudget`/`contactRounds`/`supportEvery` are the
    // DEVICE-TIER levers (js/quality.js). Their defaults are exactly the
    // behaviour that shipped before tiers existed — Infinity / Infinity / 2 / 1 —
    // so a fresh default-tier sim is byte-identical to the pre-tier build and
    // `tools/validate.mjs` never sees a tier at all. Anything that changes
    // physics has to keep that property.
    this.tune = {
      gravity: GRAVITY, waveK: WAVE_K, creak: 0, speed: SPEED_MULT, attract: ATTRACT_ACC,
      debrisCap: Infinity, contactBudget: Infinity, contactRounds: 2, supportEvery: 1,
    };
    this._supportSkipped = 0;  // coverage-only recalcs deferred by supportEvery

    if (scene === 'manhattan') buildManhattan(this);
    else if (scene === 'upper-manhattan') buildUpperManhattan(this);
    else if (scene === 'brooklyn') buildBrooklyn(this);
    else if (scene === 'boston') buildBoston(this);
    else this._buildScene();
    this.scene = scene;
    this.goal = GOALS[scene] || GOALS.gallery;
    this.coins = this._placeCoins();
    this.coinsCollected = 0;
    this._assertCellKeyRange(scene);
    this._buildNeighbors();
    this._buildZones();
    this.totalBlocks = this.blocks.length;
    // Static collision broad phase. The fine occupancy grid is ideal for
    // support/consumption, but scanning its full y-range for every falling
    // block is too expensive during a city-wide collapse.
    this._collisionBuckets = new Map();
    for (const b of this.blocks) {
      const minX = Math.floor(b.x - b.s / 2), maxX = Math.floor(b.x + b.s / 2);
      const minZ = Math.floor(b.z - b.s / 2), maxZ = Math.floor(b.z + b.s / 2);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const k = cellKey(x, z);
        let bucket = this._collisionBuckets.get(k);
        if (!bucket) { bucket = []; this._collisionBuckets.set(k, bucket); }
        bucket.push(b);
      }
    }
    this.totalMass = this.blocks.reduce((s, b) => s + b.mat.mass * b.s ** 3, 0);
    // SIZE ladder scales with scene mass so progression pacing matches the
    // gallery's (~4.2k raw → exactly ×1); bigger cities demand more per SIZE.
    //
    // CAPPED AT ×10, because past that the scaling inverts its own intent. The
    // hole can only eat bricks smaller than itself, so a steeper ladder keeps it
    // small for longer, which shrinks the edible set, which starves it further —
    // a feedback trap. It bites hardest on exactly the scenes the scaling was
    // meant to reward: Brooklyn puts 18.8% of its mass in 2 m bricks, all of it
    // inedible at SIZE 1. Uncapped it ran ×16 and a 62 s excursion reached
    // SIZE 1 with 162 blocks eaten. The cap is deliberately a clamp and not a
    // sublinear curve: Gallery (×1), Upper Manhattan (×3) and Lower Manhattan
    // (×10) all land below it and are byte-identical, so no shipped scene is
    // silently re-paced by this.
    // Combos now advance in memorable 25-block steps. Keep growth lively by
    // lowering the mass gates to match that gentler multiplier; map completion
    // itself is raw-mass based, so this never shortens a city goal.
    this._sizeLadder = SIZE_MASS.map((m) => m * 0.3 * Math.min(10, Math.max(1, Math.round(this.totalMass / 4200))));
    // Solid-surface heightmap: per fine column, the highest SOLID top
    // (static blocks + sleeping debris). Falling bodies collide with THIS
    // instead of a flat ground plane — blocks land on roofs and stack into
    // piles. Sleepers register in _sleepers so support loss wakes them.
    this._top = new Map();
    for (const b of this.blocks) this._topAdd(b);
    this._sleepers = new Map(); // fine col key -> array of debris sleeping there
    this._sleepObs = new Map(); // broad-phase cell -> settled debris (id-ordered)
    // Camera blockers must track demolition. Bound LAST: it reads _top, which
    // only exists as of the two lines above.
    this._bindCameraBlockers();
  }

  _placeCoins() {
    // A scene may declare `coinAnchors` — an array of at least {x, z} — to put
    // coins where its design wants them. A uniform scatter cannot express
    // "bridge this gap" or "mark this thing", and on a kilometre-scale map it
    // puts a coin every ~100,000 m², which is a rumour rather than a
    // collectible. Any other fields an anchor carries ride along onto the coin,
    // so a scene can tag or annotate a placement without another engine change.
    //
    // ADR-0003: this returns BEFORE the scatter's draws, it does not skip or
    // replace them. A scene that declares no anchors therefore takes exactly
    // today's draws in today's order, and the shared sim stream stays where it
    // was for everything downstream that draws from it (_splitChunk's scatter).
    if (this.coinAnchors && this.coinAnchors.length) {
      return this.coinAnchors.map((a, i) => ({ ...a, id: i, collected: false }));
    }
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const out = [];
    // A seeded scatter makes every run fair and replayable while keeping coins
    // out of the very edge where the clamp can make a pickup frustrating.
    for (let i = 0; i < SANDBOX_COIN_COUNT; i++) {
      out.push({
        id: i,
        x: r.minX + (r.maxX - r.minX) * (0.08 + this.rng.next() * 0.84),
        z: r.minZ + (r.maxZ - r.minZ) * (0.08 + this.rng.next() * 0.84),
        collected: false,
      });
    }
    return out;
  }

  _collectCoins() {
    const h = this.hole;
    const reach = h.radius + 0.7;
    for (const coin of this.coins) {
      if (coin.collected || Math.hypot(coin.x - h.x, coin.z - h.z) > reach) continue;
      coin.collected = true;
      this.coinsCollected++;
      // A coin SUSTAINS a chain; it is never a link in one. The asymmetry is
      // the point: refreshing the window buys the player another COMBO_WINDOW
      // to reach the next eatable, which is what makes a coin able to bridge a
      // sparse stretch, while leaving `chain` — and therefore `comboMult`,
      // `bestCombo` and the `longest_chain` metric behind the Unbroken Chain
      // belt — strictly block-denominated. A coin that incremented `chain`
      // would make the biggest, coin-richest map the cheapest place to farm a
      // chain belt, which is a cross-city fairness bug. `_consume` stays the
      // only place `chain` moves.
      //
      // Only while a chain is actually live: with `chain` at 0 there is nothing
      // to sustain (the expiry in `step` would be a no-op), but a timer running
      // down from nothing would still fire the sub-0.5 s "combo about to lapse"
      // flash in the renderer with no combo on screen.
      if (h.chain > 0) h.chainTimer = COMBO_WINDOW;
      this.events.push({ type: 'coin', coin, value: SANDBOX_COIN_VALUE, hole: h });
    }
  }

  // --- camera-blocker liveness -----------------------------------------------
  // `cameraBlockers` is built once from the finished geometry, so before this
  // existed a tower the player had EATEN kept occluding the chase cam forever —
  // the camera hid behind a ghost. Measured on a 90 s route: the sweep placed
  // the camera inside a blocker on 941/5400 frames (Brooklyn) and 1316/5400
  // (Upper Manhattan), and most of that is standing inside a building that is
  // no longer there.
  //
  // The signal already exists and costs nothing to reuse: `_top` is a live
  // per-fine-column solid-surface heightmap, maintained by _topAdd/_topRemove
  // exactly as blocks stop being solid and as debris comes to rest. A blocker's
  // true height is the max of `_top` over its columns. Rescanning that per
  // blocker per frame is far too expensive (a 10x10 m rect is 1600 columns), so
  // it is maintained as a lazy max: count the columns still holding up the
  // CURRENT height tier, decrement as they fall, and only rescan when the count
  // reaches zero. A tower collapses wholesale, so that is a handful of rescans
  // over its whole life, not one per frame.
  //
  // Heights only ever move DOWN toward the geometry, never above the value the
  // scene shipped (`h0`). Hand-authored over-blocking in Lower Manhattan is
  // therefore preserved, and nothing about a fresh sim changes — binding does
  // not touch `b.h`, so the validator's coverage probe sees exactly what it
  // always saw.
  _bindCameraBlockers() {
    this._blockerCell = null;
    this._blockerDirty = null;
    const bl = this.cameraBlockers;
    if (!bl || !bl.length) return;
    const m = new Map();
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      b.h0 = b.h;
      for (let mx = Math.floor(b.minX); mx < Math.ceil(b.maxX); mx++) {
        for (let mz = Math.floor(b.minZ); mz < Math.ceil(b.maxZ); mz++) m.set(mCellKey(mx, mz), i);
      }
    }
    this._blockerCell = m;
    this._blockerDirty = new Set();
    for (const b of bl) this._blockerTier(b);
  }

  // Max solid top over a blocker's fine columns, plus the count of columns
  // holding up its current height band.
  _blockerTier(b) {
    const fx0 = Math.round(b.minX / FINE), fx1 = Math.round(b.maxX / FINE);
    const fz0 = Math.round(b.minZ / FINE), fz1 = Math.round(b.maxZ / FINE);
    const top0 = this._top;
    let gmax = 0;
    for (let fx = fx0; fx < fx1; fx++) {
      for (let fz = fz0; fz < fz1; fz++) {
        const t = top0.get(cellKey(fx, fz));
        if (t > gmax) gmax = t;
      }
    }
    // The band is measured against whichever is LOWER, the declared height or
    // the geometry: an over-blocked rect must not be kept alive by a tier no
    // column ever reached, and an under-blocked one must not die early.
    b._tier = Math.max(0, Math.min(b.h, gmax) - 0.5);
    let n = 0;
    for (let fx = fx0; fx < fx1; fx++) {
      for (let fz = fz0; fz < fz1; fz++) {
        if (top0.get(cellKey(fx, fz)) > b._tier) n++;
      }
    }
    b._nTop = n;
    return gmax;
  }

  // The band emptied: drop the height to what is actually left standing.
  _blockerRescan(b) {
    const gmax = this._blockerTier(b);
    const h = gmax > 0 ? Math.min(b.h0, Math.ceil(gmax * 2) / 2) : 0;
    if (h !== b.h) { b.h = h; this._blockerTier(b); }
  }

  // One fine column's solid top moved. Called only from the two places that
  // actually mutate `_top`, and only when the value changed — the whole point is
  // that the common case (a block removed from under a column that stays tall)
  // costs one Map lookup and one integer decrement.
  _blockerColChanged(fx, fz, oldTop, newTop) {
    const m = this._blockerCell;
    if (!m) return;
    // >> 2 is floor-division by FINE and stays correct for negative coords,
    // which Math.floor(fx / 4) would also give but slower.
    const i = m.get(mCellKey(fx >> 2, fz >> 2));
    if (i === undefined) return;
    const b = this.cameraBlockers[i];
    if (b.h <= 0) return;
    const was = oldTop > b._tier, now = newTop > b._tier;
    if (was && !now) { if (--b._nTop <= 0) this._blockerDirty.add(i); }
    else if (!was && now) b._nTop++;
    if (newTop > b.h + 1e-9) this._blockerDirty.add(i);   // debris piled above it
  }

  // Bounded per step: a rescan is a full column sweep of one rect, and a big
  // collapse can empty several bands in the same frame. Four keeps the worst
  // step cheap; the set persists, so nothing is dropped, it just lands a frame
  // or two later — and a blocker one frame stale is a blocker at its OLD, taller
  // height, which is the safe direction to be wrong in.
  _refreshBlockers(max = 4) {
    let n = 0;
    for (const i of this._blockerDirty) {
      this._blockerRescan(this.cameraBlockers[i]);
      this._blockerDirty.delete(i);
      if (++n >= max) break;
    }
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
      bi: this.blocks.length, // index into this.blocks; ALWAYS id - 1 (array order == id order)
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
      _obsFx: undefined, _obsFz: 0, // broad-phase cells held while asleep (see _sleepObsAdd)
      _scSeen: 0,                   // per-call dedup stamp for _resolveStaticContacts
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

  // STRUCTURAL ZONES. The support BFS only ever walks `neighbors` edges, so it
  // can never cross between two blocks that do not touch: the scene's
  // connectivity graph is already partitioned into physically separate
  // structures (a tower, a car, a tree). Upper Manhattan is 1,114 such zones,
  // the largest 2,517 blocks (3.4% of the scene); Brooklyn is 369, Lower
  // Manhattan 149. Recomputing support therefore never needs to touch more
  // than the zones the hole can actually perturb — every other zone's spans
  // are provably unchanged, because nothing in its inputs moved.
  //
  // Zones are a build-time property: `neighbors` is fixed after
  // _buildNeighbors, and state changes only remove blocks from the walk.
  _buildZones() {
    const blocks = this.blocks;
    const n = blocks.length;
    const comp = new Int32Array(n).fill(-1);
    const compBlocks = [], compFloor = [];
    const stack = [];
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0) continue;
      const c = compBlocks.length;
      const list = [];
      comp[i] = c;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop();
        list.push(j);
        const nbs = blocks[j].neighbors;
        for (let k = 0; k < nbs.length; k++) {
          const m = nbs[k].bi;
          if (comp[m] < 0) { comp[m] = c; stack.push(m); }
        }
      }
      // block-array order inside a zone, so the per-zone passes visit blocks
      // in exactly the order a whole-scene scan would
      list.sort((a, b) => a - b);
      const fl = [];
      for (let k = 0; k < list.length; k++) if (blocks[list[k]].gy === 0) fl.push(list[k]);
      compBlocks.push(Int32Array.from(list));
      compFloor.push(Int32Array.from(fl));
    }
    const nc = compBlocks.length;
    this._compOf = comp;
    this._compBlocks = compBlocks;
    this._compFloor = compFloor;
    this._compMark = new Uint8Array(nc);
    this._proxMark = new Uint8Array(nc);
    // Which zones sit in which patch of ground, so "zones near the hole" is a
    // handful of array lookups rather than a scan.
    const zc = new Map();
    for (let c = 0; c < nc; c++) {
      const list = compBlocks[c];
      const cells = new Set();
      for (let k = 0; k < list.length; k++) {
        const b = blocks[list[k]];
        const x0 = Math.floor((b.x - b.s / 2) / ZONE_CELL), x1 = Math.floor((b.x + b.s / 2) / ZONE_CELL);
        const z0 = Math.floor((b.z - b.s / 2) / ZONE_CELL), z1 = Math.floor((b.z + b.s / 2) / ZONE_CELL);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) cells.add(x + ',' + z);
      }
      for (const k of cells) {
        let arr = zc.get(k);
        if (!arr) { arr = []; zc.set(k, arr); }
        arr.push(c);
      }
    }
    this._zoneCells = zc;
    // Per-block support scratch, replacing the per-call Maps the old whole-scene
    // BFS allocated (which were also the bulk of the sandbox's GC churn).
    this._spanVal = new Float64Array(n);
    this._spanHas = new Uint8Array(n);
    this._hang = new Uint8Array(n);
    this._frontVal = new Float64Array(n);
    this._frontHas = new Uint8Array(n);
    this._dq = [];  // BFS queues, reused across calls (capacity is retained)
    this._fq = [];
    for (let c = 0; c < nc; c++) this._dirtyComps.add(c); // first recalc evaluates everything
  }

  _watchDamage(b) {
    if (b.state === 'unstable' || (b.state === 'static' && b.damage > 0)) this._damageBlocks.add(b);
  }

  // "This block's rendered pose or colour is now out of date AND it is about to
  // stop being in any set the renderer scans." See the render-active-set note in
  // the constructor for why this is the only safe way out of the active sets.
  //
  // Bounded rather than unbounded: nothing drains this in Node (the validator
  // runs the sim headless), so past 8192 entries it flips a flag the renderer
  // reads as "do one full pass and forget it". Costs one frame's full walk in a
  // case that cannot happen while a renderer is attached.
  _renderDirty(b) {
    if (this._renderTouch.length >= 8192) {
      this._renderTouch.length = 0;
      this._renderTouchOverflow = true;
      return;
    }
    this._renderTouch.push(b);
  }

  // Leaving the lean set is an exit, so it goes through _renderDirty: the
  // renderer has a leaning matrix uploaded for this block and nothing else will
  // ever ask it to straighten up.
  _clearLean(b) {
    if (!this._leanSet.delete(b)) return;
    this._renderDirty(b);
  }

  // --- support graph -----------------------------------------------------------

  // Track which meter cells the opening currently covers; support is only
  // recalculated when coverage or the graph changes — not every frame.
  _coverageChanged() {
    const h = this.hole;
    const remR = h.radius * REMOVAL_FRAC;
    // two sets, swapped rather than reallocated: this runs every step
    const next = this._coverageSpare || (this._coverageSpare = new Set());
    next.clear();
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
    this._coverageSpare = this._coverage;
    this._coverage = next;
    return true;
  }

  // ZONE SELECTION. A zone's support result can only differ from last call if
  // one of the BFS's three inputs moved inside it:
  //   (1) its graph changed — a block detached or was eaten (_dirtyComps);
  //   (2) a floor anchor's supportRatio changed — only possible within
  //       instabR of the hole;
  //   (3) the hanging test's outcome changed — only possible within
  //       remR + HANG_REACH * hangScale of the hole.
  // (2) and (3) are the "influence radius". Zones that were inside it last
  // call are re-included so blocks the hole has LEFT get reset (supportRatio
  // back to 1, hanging cleared) exactly as a whole-scene pass would.
  _markDirtyZones(instabR, remR, hangScale) {
    const mark = this._compMark;
    const list = this._dirtyList || (this._dirtyList = []);
    list.length = 0;
    for (const c of this._dirtyComps) { if (!mark[c]) { mark[c] = 1; list.push(c); } }
    for (let i = 0; i < this._prevProx.length; i++) {
      const c = this._prevProx[i];
      if (!mark[c]) { mark[c] = 1; list.push(c); }
    }
    const R = Math.max(instabR, remR + HANG_REACH * hangScale);
    const h = this.hole;
    const proxMark = this._proxMark;
    const prox = [];
    const x0 = Math.floor((h.x - R) / ZONE_CELL), x1 = Math.floor((h.x + R) / ZONE_CELL);
    const z0 = Math.floor((h.z - R) / ZONE_CELL), z1 = Math.floor((h.z + R) / ZONE_CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this._zoneCells.get(x + ',' + z);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (proxMark[c]) continue;
          proxMark[c] = 1;
          prox.push(c);
          if (!mark[c]) { mark[c] = 1; list.push(c); }
        }
      }
    }
    for (let i = 0; i < prox.length; i++) proxMark[prox[i]] = 0;
    this._prevProx = prox;
    this._dirtyComps.clear();
    return list;
  }

  _recalcSupport() {
    const h = this.hole;
    const blocks = this.blocks;
    const remR = h.radius * REMOVAL_FRAC;
    const remR2 = remR * remR;
    const instabR = h.radius + INSTAB_ZONE + 0.6;
    const instabR2 = instabR * instabR;
    // The reach SCALES with the hole: at SIZE 1 the creak zone hugs the
    // visible rim (~0.5 m past it) instead of pre-failing facades 4-5 m
    // away; at max radius it behaves as before (remR + span + 1.5).
    const hangScale = h.radius / MAX_RADIUS;
    // Failure timing: the shipped sandbox setting is instant (creak <= 0), so
    // the player sees a block let go on the first step after support loss.
    // A positive dev tuning value restores the readable rim → center delay:
    // hanging rim blocks creak first, unsupported blocks follow the wave.
    const instantCollapse = this.tune.creak <= 0;

    const dirty = this._markDirtyZones(instabR, remR, hangScale);
    const spanVal = this._spanVal, spanHas = this._spanHas, hang = this._hang;
    const frontVal = this._frontVal, frontHas = this._frontHas;
    const dq = this._dq, fq = this._fq;

    for (let ci = 0; ci < dirty.length; ci++) {
      const cbl = this._compBlocks[dirty[ci]], cfl = this._compFloor[dirty[ci]];

      // Rim support percentage: floor blocks near the rim sample their 4 base
      // corners against the opening. <30% supported = no floor anchor anymore.
      for (let k = 0; k < cfl.length; k++) {
        const b = blocks[cfl[k]];
        if (b.state === 'consumed' || b.state === 'falling') continue;
        const dx = b.x - h.x, dz = b.z - h.z;
        if (dx * dx + dz * dz > instabR2) { this._clearLean(b); b.supportRatio = 1; continue; }
        const o = b.s / 2 - 0.05;
        let outside = 0;
        let px = b.x - o - h.x, pz = b.z - o - h.z;
        if (px * px + pz * pz > remR2) outside++;
        px = b.x + o - h.x;
        if (px * px + pz * pz > remR2) outside++;
        pz = b.z + o - h.z;
        if (px * px + pz * pz > remR2) outside++;
        px = b.x - o - h.x;
        if (px * px + pz * pz > remR2) outside++;
        // The renderer leans a weakened rim block TOWARD the hole, so its matrix
        // is a function of the hole's live position as well as of this ratio —
        // it has to be re-composed every frame while the ratio is under 0.7, and
        // re-composed once more on the frame it recovers. `_leanSet` is that
        // population; `_clearLean` is the "once more" (see _renderDirty).
        const sr = outside / 4;
        if (sr < 0.7) this._leanSet.add(b);
        else this._clearLean(b);
        b.supportRatio = sr;
      }

      for (let k = 0; k < cbl.length; k++) { spanHas[cbl[k]] = 0; hang[cbl[k]] = 0; }

      // 0-1 BFS from floor anchors. Vertical moves reset the cantilever span;
      // horizontal moves grow it in METERS and fail past the entered block's
      // maxSpan. A neighbor counts as vertical only when it sits entirely
      // above; overlapping y-ranges are horizontal connections (mixed sizes).
      dq.length = 0;
      for (let k = 0; k < cfl.length; k++) {
        const j = cfl[k], b = blocks[j];
        if (b.state !== 'static' && b.state !== 'unstable') continue;
        if (b.supportRatio < 0.3) continue; // base mostly gone — no anchor
        spanVal[j] = 0; spanHas[j] = 1;
        dq.push(j);
      }
      let head = 0;
      while (head < dq.length) {
        const cur = blocks[dq[head++]];
        const cs = spanVal[cur.bi];
        const nbs = cur.neighbors;
        for (let q = 0; q < nbs.length; q++) {
          const nb = nbs[q];
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
          const nj = nb.bi;
          if (spanHas[nj] && spanVal[nj] <= ns) continue;
          spanVal[nj] = ns; spanHas[nj] = 1;
          dq.push(nj); // relaxation converges: spans are small bounded numbers
        }
      }

      // Split supported blocks into solid vs hanging (cantilever reaching over
      // the opening). The crack front is seeded from SOLID blocks only — the
      // hanging rim is itself part of the failure zone, so measuring crack
      // distance from it would let the void's center drop first. With solid
      // seeds the rim lets go FIRST and failure sweeps inward from the
      // circumference: destruction is driven by the hole's edge, not its center.
      for (let k = 0; k < cbl.length; k++) {
        const j = cbl[k];
        if (!spanHas[j]) continue;
        const sp = spanVal[j];
        if (sp < 1) continue;
        const b = blocks[j];
        const dx = b.x - h.x, dz = b.z - h.z;
        if (Math.hypot(dx, dz) < remR + (sp + 1.5) * hangScale) hang[j] = 1;
      }

      // Crack-front distance only feeds the delayed-failure timings below, so
      // the shipped instant-collapse setting skips this whole BFS.
      if (!instantCollapse) {
        fq.length = 0;
        for (let k = 0; k < cbl.length; k++) frontHas[cbl[k]] = 0;
        for (let k = 0; k < cbl.length; k++) {
          const j = cbl[k];
          if (!spanHas[j] || hang[j]) continue;
          frontVal[j] = 0; frontHas[j] = 1;
          fq.push(j);
        }
        let fh = 0;
        while (fh < fq.length) {
          const cur = blocks[fq[fh++]];
          const cd = frontVal[cur.bi];
          for (const nb of cur.neighbors) {
            if (nb.state !== 'static' && nb.state !== 'unstable') continue;
            const nj = nb.bi;
            if (frontHas[nj]) continue;
            frontVal[nj] = cd + 1; frontHas[nj] = 1;
            fq.push(nj);
          }
        }
      }
    }

    // State assignment runs as one pass over the block array, filtered to the
    // dirty zones. Blocks outside them provably keep last call's verdict, and
    // going through the array in order keeps _damageBlocks' insertion order
    // (which step 2 snapshots, and which is therefore load-bearing) identical
    // to the old whole-scene loop's.
    //
    // Damage is PERSISTENT: leaving the hole stops new stress but only heals
    // slowly, so collapse progress is never reset by wiggling.
    const mark = this._compMark, compOf = this._compOf;
    const creak = this.tune.creak, waveK = this.tune.waveK;
    for (let i = 0; i < blocks.length; i++) {
      if (!mark[compOf[i]]) continue;
      const b = blocks[i];
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      if (!spanHas[i]) {
        b.state = 'unstable';
        if (instantCollapse) {
          b.damage = 1;
          b.failRate = 0;
          this._watchDamage(b);
          continue;
        }
        const dist = frontHas[i] ? frontVal[i] : 0; // no path to support at all = let go now
        // material creak scales with brick size: small bricks pop, big slabs grind
        const failTime = Math.min(FAIL_CAP, b.mat.delay * creak * (1 + 0.15 * b.gy * FINE) * b.s + waveK * dist);
        b.failRate = 1 / Math.max(0.05, failTime);
        this._watchDamage(b);
      } else if (hang[i]) {
        b.state = 'unstable';
        if (instantCollapse) {
          b.damage = 1;
          b.failRate = 0;
          this._watchDamage(b);
          continue;
        }
        const failTime = Math.min(HANG_CAP, b.mat.delay * creak * (1 + 0.15 * b.gy * FINE) * b.s + 0.15 + 0.25 * spanVal[i]);
        b.failRate = 1 / failTime;
        this._watchDamage(b);
      } else if (b.state === 'unstable') {
        b.state = 'static'; // support returned — damage stays, heals over time
        b.failRate = 0;
        this._watchDamage(b);
        // It was wobbling (render-side creak) and may now be leaving
        // _damageBlocks entirely: one more visit clears the offset.
        this._renderDirty(b);
      }
    }
    for (let i = 0; i < dirty.length; i++) mark[dirty[i]] = 0;
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
      // a settled block swept into a rigid body moves again, so it leaves the
      // resting-rubble index and goes back to being bucketed per step.
      // NB it stays `asleep` here but gains a parentChunk, which makes it a
      // contact OBSTACLE contributed from `_falling` — so it has to be back in
      // that list even though nothing woke it.
      if (b.asleep) { this._sleepObsRemove(b); this._reviveResting(b); }
      b._budgetHold = false; // chunk membership supersedes a contact-budget park
      b.parentChunk = chunk;
      b.relX = b.x - cx; b.relY = b.y - cy; b.relZ = b.z - cz;
    }
    this.chunks.push(chunk);
    return chunk;
  }

  // Fold this step's detachments into the ordered active list and drop the
  // entries the hole ate. `_falling` stays sorted by id, which IS block-array
  // order, so every pass that walks it visits blocks in exactly the order a
  // whole-scene scan would — the pair orders in the contact solver and the
  // chunk seed order depend on it.
  _syncFalling() {
    const f = this._falling;
    if (this._fallingRemoved) {
      let w = 0;
      for (let i = 0; i < f.length; i++) if (f[i].state === 'falling') f[w++] = f[i];
      f.length = w;
      this._fallingRemoved = 0;
    }
    const nf = this._newFalling;
    if (nf.length === 0) return;
    nf.sort((a, b) => a.id - b.id);
    const merged = [];
    let i = 0, j = 0;
    while (i < f.length && j < nf.length) merged.push(f[i].id <= nf[j].id ? f[i++] : nf[j++]);
    while (i < f.length) merged.push(f[i++]);
    while (j < nf.length) merged.push(nf[j++]);
    nf.length = 0;
    this._falling = merged;
  }

  // Flood-fill connected freshly-fallen blocks into rigid chunks. Weak
  // interfaces (glass, panel seams) are not crossed, so structures break
  // along their material joints. Loose blocks always fall individually.
  _groupChunks() {
    // indexed walk: _makeChunk can sweep in a sleeper that fell inside
    // FRESH_WINDOW, and reviving it splices into this same array
    const f = this._falling;
    for (this._groupCursor = 0; this._groupCursor < f.length; this._groupCursor++) {
      const b = f[this._groupCursor];
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
    this._groupCursor = -1;
  }

  // Fail loudly if a scene outgrows either cell-key pack. Both mask instead of
  // range-checking, so past the limit two distant columns silently share a
  // bucket and the solver reports contacts against blocks that are not there.
  // Runs once per scene build, so it costs nothing per frame. Checked against
  // the block EXTENT plus the broad-phase padding (_sleepObsAdd/insertInto pad
  // one fine cell either side of the footprint) and the hole's movement clamp,
  // since debris travels with the hole.
  _assertCellKeyRange(scene) {
    let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
    for (const b of this.blocks) {
      const r = (b.fs + 2) * FINE; // footprint + the one-cell broad-phase pad
      if (b.x - r < mnX) mnX = b.x - r;
      if (b.x + r > mxX) mxX = b.x + r;
      if (b.z - r < mnZ) mnZ = b.z - r;
      if (b.z + r > mxZ) mxZ = b.z + r;
    }
    if (!this.blocks.length) return;
    const rect = this.boundsRect;
    const reach = Math.max(
      Math.abs(mnX), Math.abs(mxX), Math.abs(mnZ), Math.abs(mxZ),
      rect ? Math.max(Math.abs(rect.minX), Math.abs(rect.maxX), Math.abs(rect.minZ), Math.abs(rect.maxZ)) : this.bounds,
    );
    if (reach >= CELL_KEY_LIMIT_M) {
      throw new RangeError(
        `voxelsim: scene '${scene}' reaches ${reach.toFixed(1)} m from origin, but cellKey is ` +
        `injective only to ±${CELL_KEY_LIMIT_M} m (14 bits per axis at FINE ${FINE}). ` +
        'Widen the pack before shipping this scene — past the limit it aliases silently.');
    }
    if (reach >= MCELL_KEY_LIMIT_M) {
      throw new RangeError(
        `voxelsim: scene '${scene}' reaches ${reach.toFixed(1)} m from origin, but mCellKey ` +
        `(camera-blocker index) is injective only to ±${MCELL_KEY_LIMIT_M} m.`);
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
        const k = cellKey(fx + ix, fz + iz);
        const prev = this._top.get(k) || 0;
        if (prev < top) {
          this._top.set(k, top);
          this._blockerColChanged(fx + ix, fz + iz, prev, top);
        }
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
        const k = cellKey(fx + ix, fz + iz);
        if (this._top.get(k) === bTop) {
          let ny = 0;
          for (let cy = fy - 1; cy >= 0; cy--) {
            const o = this.grid.get(key(fx + ix, cy, fz + iz));
            if (o && (o.state === 'static' || o.state === 'unstable')) { ny = (o.gy + o.fs) * FINE; break; }
          }
          if (ny > 0) this._top.set(k, ny); else this._top.delete(k);
          this._blockerColChanged(fx + ix, fz + iz, bTop, ny);
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
            this._reviveResting(s); // support gone: back into the active list
            this._sleepObsRemove(s);
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
    const top0 = this._top;
    let top = 0;
    for (let ix = 0; ix < fs; ix++) {
      for (let iz = 0; iz < fs; iz++) {
        const t = top0.get(cellKey(gx0 + ix, gz0 + iz));
        if (t > top) top = t;
      }
    }
    return top;
  }

  // first SOLID block overlapping b's leading side face or bottom face —
  // falling bodies scrape walls and shatter on structures instead of
  // ghosting through them. (vx,vz) come from the body (chunk or debris).
  _contact(b, vx, vz) {
    // _foot inline: this runs once per airborne body per step and the array it
    // returns was pure garbage
    const fx = Math.round(b.x / FINE - b.fs / 2);
    const fy = Math.round(b.y / FINE - b.fs / 2);
    const fz = Math.round(b.z / FINE - b.fs / 2);
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

  // --- resting-rubble broad phase ---------------------------------------------
  // Settled debris is an OBSTACLE for the loose-body contact solver but never
  // moves while it sleeps, so its broad-phase cells are stable. Bucketing every
  // sleeper afresh each step was ~half the step cost after a few minutes of
  // play (measured: 14.6 -> 5.6 ms p50 at minute 5 of a SIZE 10 plough), and it
  // grows without bound as rubble piles up. Keep the buckets instead and edit
  // them on the rare sleep/wake events.
  //
  // Buckets are held in ascending id order — the exact order a whole-list scan
  // produced — because the solver applies separations in sequence and each one
  // moves the mover, so a reordered bucket is a different simulation.
  _sleepObsAdd(b) {
    const [fx, , fz] = this._foot(b);
    b._obsFx = fx; b._obsFz = fz;
    for (let ix = -1; ix <= b.fs; ix++) {
      for (let iz = -1; iz <= b.fs; iz++) {
        const k = cellKey(fx + ix, fz + iz);
        let arr = this._sleepObs.get(k);
        if (!arr) { arr = []; this._sleepObs.set(k, arr); }
        let lo = 0, hi = arr.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].id < b.id) lo = mid + 1; else hi = mid; }
        arr.splice(lo, 0, b);
      }
    }
  }

  _sleepObsRemove(b) {
    if (b._obsFx === undefined) return;
    const fx = b._obsFx, fz = b._obsFz;
    b._obsFx = undefined;
    for (let ix = -1; ix <= b.fs; ix++) {
      for (let iz = -1; iz <= b.fs; iz++) {
        const k = cellKey(fx + ix, fz + iz);
        const arr = this._sleepObs.get(k);
        if (!arr) continue;
        const i = arr.indexOf(b);
        if (i >= 0) arr.splice(i, 1);
        if (arr.length === 0) this._sleepObs.delete(k);
      }
    }
  }

  // --- retired resting rubble --------------------------------------------------
  // Settled blocks leave `_falling` and live in a coarse spatial index instead.
  // REST_CELL is deliberately much wider than the fine broad-phase cell: this
  // index is only ever swept by the hole's removal disc, so a handful of cells
  // per step beats either 2,809 fine-column lookups or a linear walk of every
  // sleeper in the world.
  //
  // Order discipline is the same as everywhere else in the solver: `_falling`
  // stays id-ascending and a revived block is spliced back at its id position,
  // so every pass still visits blocks in block-array order and a revived block
  // is seen at exactly the point in the sequence it would have occupied had it
  // never left. That is what keeps this bit-identical rather than merely
  // plausible.
  _restKey(b) { return mCellKey(Math.floor(b.x / REST_CELL), Math.floor(b.z / REST_CELL)); }

  _retireResting(b) {
    if (b._retired) return;
    b._retired = true;
    // It leaves `_falling` here, and the fall that put it on the ground may have
    // happened in a sim sub-step the renderer never saw (main.js runs up to six
    // steps per frame). Without this the block renders at its last airborne pose
    // forever — the exact "frozen mid-air" failure the active set has to avoid.
    this._renderDirty(b);
    const k = this._restKey(b);
    b._restIdxKey = k;
    let arr = this._restIdx.get(k);
    if (!arr) { arr = []; this._restIdx.set(k, arr); }
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].id < b.id) lo = mid + 1; else hi = mid; }
    arr.splice(lo, 0, b);
    this._restCount++;
  }

  // Put a retired block back into the active list at its id position. Safe to
  // call mid-`_stepDebris`: the cursor is nudged when the insert lands at or
  // before it, so the walk neither repeats an entry nor skips one — matching
  // the old behaviour where the block was simply already there.
  _reviveResting(b) {
    if (!b._retired) return;
    b._retired = false;
    this._restCount--;
    const arr = this._restIdx.get(b._restIdxKey);
    if (arr) {
      const i = arr.indexOf(b);
      if (i >= 0) arr.splice(i, 1);
      if (arr.length === 0) this._restIdx.delete(b._restIdxKey);
    }
    b._restIdxKey = undefined;
    if (b.state !== 'falling') return; // consumed on its way out; nothing to re-run
    const f = this._falling;
    let lo = 0, hi = f.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (f[mid].id < b.id) lo = mid + 1; else hi = mid; }
    if (f[lo] === b) return;
    f.splice(lo, 0, b);
    if (lo <= this._debrisCursor) this._debrisCursor++;
    if (lo <= this._groupCursor) this._groupCursor++;
  }

  // The hole is the one thing that reaches retired rubble without any contact
  // event telling us so, so sweep the index it covers and revive what it is
  // about to swallow. Revived blocks are handed to the normal `_stepDebris`
  // path, which applies the identical `dist2 <= remR2` test — this pre-pass
  // only decides what gets LOOKED at, never what happens.
  _wakeRestingUnderHole(remR) {
    if (this._restCount === 0) return;
    const h = this.hole;
    const c0 = Math.floor((h.x - remR) / REST_CELL), c1 = Math.floor((h.x + remR) / REST_CELL);
    const d0 = Math.floor((h.z - remR) / REST_CELL), d1 = Math.floor((h.z + remR) / REST_CELL);
    const remR2 = remR * remR;
    let found = null;
    for (let cx = c0; cx <= c1; cx++) {
      for (let cz = d0; cz <= d1; cz++) {
        const arr = this._restIdx.get(mCellKey(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          const dx = h.x - b.x, dz = h.z - b.z;
          if (dx * dx + dz * dz <= remR2) (found || (found = [])).push(b);
        }
      }
    }
    if (!found) return;
    // id order, because _falling is id-ordered and the solver's pair sequence
    // depends on it; a spatial walk visits cells in an arbitrary order
    found.sort((a, b) => a.id - b.id);
    for (let i = 0; i < found.length; i++) this._reviveResting(found[i]);
  }

  // wake a sleeping debris block: unregister it and drop its solid
  // contribution (its own support re-evaluates from the pile)
  _unsleep(b) {
    if (!b.asleep) return;
    b.asleep = false;
    this._reviveResting(b);
    this._sleepObsRemove(b);
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
          const topHit = cb.y <= this._topAt(cb.x, cb.z, cb.fs) + cb.s / 2 + 0.05;
          const directionalHit = topHit ? null : this._contact(cb, c.vx, c.vz);
          const solidHit = topHit || directionalHit ? this._resolveStaticContacts(cb) : null;
          if (solidHit || topHit || directionalHit) {
            impact = true;
            if (directionalHit && Math.hypot(c.vx, c.vy, c.vz) > 5) {
              directionalHit.damage = Math.min(0.95, directionalHit.damage + 0.2);
              this._watchDamage(directionalHit);
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
    // Fresh loose body, re-evaluated from scratch: no stale budget park or
    // support claim may ride along from its chunk life.
    b._budgetHold = false;
    b._looseSup = false;
    this._reviveResting(b);  // shattered out of a chunk: it moves again
    this._sleepObsRemove(b); // no-op unless it somehow still held resting cells
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

    // Retired rubble the hole has reached rejoins the active list first, at its
    // id position, so the walk below meets it exactly where it always did.
    this._wakeRestingUnderHole(remR);

    // Indexed walk, not for-of: _unsleep -> _topRemove can wake a whole pile
    // mid-loop and each revival splices into this very array. The cursor is
    // adjusted by _reviveResting so an insert below it does not shift the walk
    // backwards onto an entry already processed.
    const f = this._falling;
    for (this._debrisCursor = 0; this._debrisCursor < f.length; this._debrisCursor++) {
      const b = f[this._debrisCursor];
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
      // Held out of this tier's contact budget by _resolveDebrisContacts:
      // park it. A budget-excluded block must NOT be integrated — its support
      // probe cannot see the awake pile it rests on (loose bodies are only in
      // `_top` once they sleep, and `_restLoose` is only re-set by the contact
      // pass it was excluded from), so gravity walked it down INTO the pile a
      // little more each step, and the day it re-entered the budget the
      // separation solver found a full block of penetration and launched it.
      // Parking freezes the fringe pile as it was; the hole coming within
      // budget range (or the void opening under it) hands it back to physics.
      if (b._budgetHold && !overVoid) continue;
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
      // The directional/top probes cheaply identify likely contacts. Only
      // then run the full AABB separation against nearby solid buckets; open
      // air never pays for a city-wide overlap scan.
      const directionalHit = this._contact(b, b.vx, b.vz);
      const topHit = b.y <= this._topAt(b.x, b.z, b.fs) + b.s / 2 + 0.05;
      const hit = topHit || directionalHit
        ? this._resolveStaticContacts(b) || directionalHit
        : null;
      if (hit) {
        b.vx *= 0.5; b.vz *= 0.5;
        if (b.vy < 0) b.vy *= -0.25;
        if (Math.abs(b.vy) > 5) {
          hit.damage = Math.min(0.95, hit.damage + 0.1);
          this._watchDamage(hit);
        }
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
      b._looseSup = false; // re-stamped each grounded step — _capDebris reads it
      if (b.y <= rest) {
        b._grounded = true;
        b._looseSup = looseSup;
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
          for (let q = 0; q < 4; q++) {
            const nx = REPOSE_DIRS[q << 1], nz = REPOSE_DIRS[(q << 1) | 1];
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
    this._debrisCursor = -1;
    if (this.tune.debrisCap !== Infinity) this._capDebris(this.tune.debrisCap);
    this._resolveDebrisContacts();
    // commit sleep candidates: grounded, slow, and now provably contact-free.
    // Even inside the attraction zone — constant vacuum pressure on resting
    // blocks is what ground piles into self-clipping churn; the hole wakes
    // sleepers when it reaches them (overVoid), and support loss wakes the rest.
    let retired = 0;
    for (const b of f) {
      if (!b._wantSleep) continue;
      b._wantSleep = false;
      if (b.state !== 'falling' || b.parentChunk || b.asleep || b._inContact) continue;
      b.asleep = true;
      b.vx = 0; b.vy = 0; b.vz = 0; b.vRotX = 0; b.vRotZ = 0;
      const [fx, , fz] = this._foot(b);
      const colK = cellKey(fx + (b.fs >> 1), fz + (b.fs >> 1));
      b.restCol = colK;
      b.restTop = b._sleepSupport;
      let sl = this._sleepers.get(colK);
      if (!sl) { sl = []; this._sleepers.set(colK, sl); }
      sl.push(b);
      this._topAdd(b);
      this._sleepObsAdd(b);
      // it has settled: stop rescanning it every step from here on — but not
      // before its chunk-seed window closes (see _retirePend)
      if (this.time - b.fallT > FRESH_WINDOW) { this._retireResting(b); retired++; }
      else this._retirePend.push(b);
    }
    // Drain the deferred queue: anything now past its fresh window and still
    // undisturbed leaves the list. Anything woken, chunked or eaten in the
    // meantime is simply dropped from the queue — the wake paths already put it
    // back in play. Walked back-to-front so the swap-remove cannot skip an entry.
    const pend = this._retirePend;
    for (let i = pend.length - 1; i >= 0; i--) {
      const b = pend[i];
      const stale = b.state !== 'falling' || b.parentChunk || !b.asleep || b._retired;
      if (!stale && this.time - b.fallT <= FRESH_WINDOW) continue;
      pend[i] = pend[pend.length - 1];
      pend.length--;
      if (!stale) { this._retireResting(b); retired++; }
    }
    // one compaction pass, after the walk — splicing inside it would shift the
    // iteration under itself
    if (retired) {
      let w = 0;
      for (let i = 0; i < f.length; i++) if (!f[i]._retired) f[w++] = f[i];
      f.length = w;
    }
  }

  // DEVICE-TIER LEVER, off at the default tier (`debrisCap === Infinity`, so this
  // is never even called and the shipped sim is byte-identical).
  //
  // Loose debris is 47.7% of CPU on the profile this was built from (7.11 of
  // 14.9 ms/frame, Boston at SIZE 5), and it is the one cost that grows without
  // bound as a session runs: every mover pays `_contact` + `_topAt` +
  // `_resolveStaticContacts` + a pair-relaxation slot, every step, until it
  // settles. A low-end phone cannot afford 500 of them.
  //
  // The cap is a "settle sooner" lever, NOT a teleport and not a freeze. Only
  // blocks that are ALREADY grounded (`_grounded` means the walk above snapped
  // them onto their support this step) ON A STATIC SUPPORT are eligible:
  // a block grounded on awake loose debris (`_looseSup`) must never be slept
  // here — sleeping registers it in `_top`/`_sleepers` with the loose block's
  // top as its recorded support, and when that support is later eaten or rolls
  // away NO wake path fires (awake blocks live in neither index, so
  // `_consume`/`_unsleep`/`_topRemove` all miss it), leaving the sleeper — and
  // whatever piled onto it via `_top` — hanging in the air until the hole
  // passes directly underneath (`_wakeRestingUnderHole` is the only remaining
  // wake). The walk's own sleep path knew this (the `looseSup` branch never
  // sets `_wantSleep`); the cap simply failed to check. Eligible blocks are
  // handed to the same `_wantSleep` path everything else uses — which means
  // the contact pass still has to prove them overlap-free before they are
  // allowed to sleep. A block frozen mid-overlap can never separate, and that
  // invariant is not worth trading for a frame. So the visible cost is:
  // distant rubble stops skittering and comes to rest a second or two early.
  // Nothing vanishes, nothing sinks, nothing hangs.
  //
  // Farthest-from-the-hole first, because that is what the player is not looking
  // at; `id` breaks ties so the selection can never depend on iteration order.
  _capDebris(cap) {
    const f = this._falling, h = this.hole;
    const cand = this._capBuf || (this._capBuf = []);
    cand.length = 0;
    let active = 0;
    for (let i = 0; i < f.length; i++) {
      const b = f[i];
      if (b.state !== 'falling' || b.parentChunk || b.asleep) continue;
      active++;
      if (b._grounded && !b._wantSleep && !b._looseSup) cand.push(b);
    }
    const excess = active - cap;
    if (excess <= 0 || cand.length === 0) return;
    cand.sort((a, b) => {
      const da = (a.x - h.x) * (a.x - h.x) + (a.z - h.z) * (a.z - h.z);
      const db = (b.x - h.x) * (b.x - h.x) + (b.z - h.z) * (b.z - h.z);
      return db - da || a.id - b.id;
    });
    const k = excess < cand.length ? excess : cand.length;
    for (let i = 0; i < k; i++) {
      const b = cand[i];
      b.vx = 0; b.vy = 0; b.vz = 0; b.vRotX = 0; b.vRotZ = 0;
      b._wantSleep = true;
      // Grounded means `b.y` was snapped to `support + s/2` this step, so this is
      // the support it is actually resting on — no probe needed, and no chance of
      // recording a surface it is not touching.
      b._sleepSupport = b.y - b.s / 2;
    }
  }

  // Loose-body contact resolution: grounded/slow debris must never interpenetrate
  // each other, sleeping debris, or chunk members — they separate along the
  // least-penetration axis and bounce apart. (_contact/_top only see STATIC
  // structures; this pass covers every loose body those miss.) Deterministic:
  // blocks iterate in array order, pairs dedup by id, no rng.
  _resolveDebrisContacts() {
    const awake = [];
    for (const b of this._falling) {
      if (b.state !== 'falling' || b.parentChunk || b.asleep) continue;
      // Fast bodies get the full solid-world correction in _stepDebris, but
      // are kept out of this pair relaxation. Including an entire tower's
      // airborne rain here creates an unnecessary O(n²) pile broad phase.
      if (!b._grounded && b.vx * b.vx + b.vy * b.vy + b.vz * b.vz > 1) continue;
      b._budgetHold = false; // re-set below if this step's budget excludes it
      awake.push(b);
    }
    if (awake.length === 0) return;
    // Tier lever: bound the pair-relaxation POPULATION, not just the round count.
    //
    // Why this exists on top of `debrisCap`: measured at 4x CPU throttle on
    // Brooklyn, a sustained session reaches ~800 loose blocks and this pass alone
    // costs 1266 ms/frame, and `debrisCap` barely dents it. The population that
    // piles up here is debris resting on OTHER DEBRIS: slow, so it passes the
    // filter above, but the walk never marks it `_wantSleep` (its support can
    // roll away or be eaten, and a sleeper recorded on a loose support hangs in
    // the sky when that support vanishes — `_capDebris` now skips it for the
    // same reason via `_looseSup`). So the cap cannot retire it; bound the WORK
    // instead of the population.
    //
    // Pairwise separation is restricted to the `budget` blocks nearest the hole
    // — what the player is looking at, and where new overlaps are being created.
    // The excluded tail is PARKED (`_budgetHold`): `_stepDebris` skips its
    // integration entirely. It must not keep falling — its support probe cannot
    // see the awake pile it rests on (loose bodies enter `_top` only when they
    // sleep, and `_restLoose` is only re-set by the contact pass it was excluded
    // from), so gravity walked it down into its neighbours a little more each
    // step, and the step it re-entered the budget the solver found up to a full
    // block of penetration and shoved it straight up (measured symptom: hundreds
    // of blocks fountain metres into the air near the hole). `_inContact` is
    // forced true as before — a stale `false` could sleep one mid-overlap, and a
    // block frozen mid-overlap can never separate. Deterministic: distance with
    // an `id` tiebreak, so the selection cannot depend on array order. Infinity
    // on HIGH keeps this a no-op.
    const budget = this.tune.contactBudget;
    if (budget !== undefined && budget !== Infinity && awake.length > budget) {
      const h = this.hole;
      awake.sort((a, b) => {
        const da = (a.x - h.x) * (a.x - h.x) + (a.z - h.z) * (a.z - h.z);
        const db = (b.x - h.x) * (b.x - h.x) + (b.z - h.z) * (b.z - h.z);
        return da - db || a.id - b.id;
      });
      for (let i = budget; i < awake.length; i++) {
        awake[i]._inContact = true;
        awake[i]._budgetHold = true;
      }
      awake.length = budget;
    }
    const movable = new Set(awake);
    for (const b of awake) b._inContact = false; // re-set on overlap below
    // buckets are padded by one fine cell all round: rounded footprints could
    // otherwise leave a ≤0.25 m sliver where two blocks overlap without ever
    // sharing a column — a gap exact AABB tests never even see
    const keyInt = cellKey;
    const pool = this._bPool = this._bPool || [];
    const getB = () => (pool.length > 0 ? pool.pop() : []);
    const relB = (b) => { b.length = 0; pool.push(b); };

    const insertInto = (map, b) => {
      const fx = Math.round(b.x / FINE - b.fs / 2), fz = Math.round(b.z / FINE - b.fs / 2);
      for (let ix = -1; ix <= b.fs; ix++) {
        for (let iz = -1; iz <= b.fs; iz++) {
          const k = keyInt(fx + ix, fz + iz);
          let a = map.get(k);
          if (!a) { a = getB(); map.set(k, a); }
          a.push(b);
        }
      }
    };
    // obstacles (sleepers, chunk members, fast rain) don't move: bucket once.
    // Free-standing sleepers live in the persistent _sleepObs index instead;
    // the query below walks the two in id order, which is the single order the
    // old one-pass build produced.
    const occObs = this._occObs || (this._occObs = new Map());
    occObs.clear();
    for (const b of this._falling) {
      if (b.state !== 'falling' || movable.has(b)) continue;
      if (b.asleep && !b.parentChunk) continue;
      insertInto(occObs, b);
    }
    const sleepObs = this._sleepObs;
    // Relaxation: compressed piles re-penetrate between passes, so resolve
    // twice per step (1 round in perfMode), re-bucketing the (moved) movers each round.
    // perfMode still forces 1; a device tier can ask for 1 the same way
    // (js/quality.js sets tune.contactRounds). Default is 2, unchanged.
    const rounds = (this.tune && this.tune.perfMode) ? 1 : ((this.tune && this.tune.contactRounds) || 2);
    const occMove = this._occMove || (this._occMove = new Map());
    for (let round = 0; round < rounds; round++) {
      occMove.clear();
      for (const b of awake) insertInto(occMove, b);
      for (const b of awake) {
        const fx = Math.round(b.x / FINE - b.fs / 2), fz = Math.round(b.z / FINE - b.fs / 2);
        // Vertical pre-reject. These buckets are keyed on (x, z) only, so one
        // cell of a settled pile holds every block in that column at every
        // height, and the overwhelming majority of candidates are nowhere near
        // b vertically — measured 73,804 _separate calls per step against ~417
        // awake bodies, of which only 1,791 produced a push (97.6% no-ops).
        // `_separate` already discards these on `pen <= 0`; testing its most
        // selective term here just avoids the call. The condition is a strict
        // subset of that early-out, so the surviving set and the order in which
        // it is processed are both unchanged — this is a pure cost cut.
        // NB b.y is read live on every test, never hoisted: _pushAxis moves b
        // mid-loop, and _separate's own py term sees the updated position.
        const bhs = b.s / 2;
        for (let ix = -1; ix <= b.fs; ix++) {
          for (let iz = -1; iz <= b.fs; iz++) {
            const k = keyInt(fx + ix, fz + iz);
            const mo = occMove.get(k);
            if (mo) {
              for (const o of mo) {
                if (o === b || o.id < b.id) continue; // each pair once per round
                const dy = b.y - o.y;
                if (bhs + o.s / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, true);
              }
            }
            const ob = occObs.get(k), sb = sleepObs.get(k);
            let o = null;
            if (ob && sb) {
              let p = 0, q = 0;
              while (p < ob.length && q < sb.length) {
                o = ob[p].id < sb[q].id ? ob[p++] : sb[q++];
                const dy = b.y - o.y;
                if (bhs + o.s / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
              while (p < ob.length) {
                o = ob[p++];
                const dy = b.y - o.y;
                if (bhs + o.s / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
              while (q < sb.length) {
                o = sb[q++];
                const dy = b.y - o.y;
                if (bhs + o.s / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
            } else if (ob) {
              for (let p = 0; p < ob.length; p++) {
                o = ob[p];
                const dy = b.y - o.y;
                if (bhs + o.s / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
            } else if (sb) {
              for (let q = 0; q < sb.length; q++) {
                o = sb[q];
                const dy = b.y - o.y;
                if (bhs + o.s / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
            }
          }
        }
      }
      for (const arr of occMove.values()) relB(arr);
    }
    for (const arr of occObs.values()) relB(arr);
  }

  // Full AABB separation against the still-solid world. The directional
  // `_contact` probe catches leading-face crossings; this catches bodies that
  // arrive already embedded (including rotated chunk members represented by
  // their current axis-aligned bounds).
  // The buckets are keyed on (x, z) only, so one cell of a tower holds every
  // block in that column — hundreds of them, at every height. The dedup used to
  // be a `new Set()` per call (45k allocations per 400 steps at collapse rates);
  // it is now a per-call stamp on the block, which is the same set semantics
  // (every candidate that passes the identity and state tests is marked,
  // overlapping or not — that matters, because `b` moves inside this loop) with
  // an integer compare instead of a hash insert. The vertical overlap is also
  // tested first: it is by far the most selective term in a tower column, and
  // `py <= 0` already implied `pen <= 0`.
  _resolveStaticContacts(b) {
    const stamp = ++this._scStamp;
    let hit = null;
    const minX = Math.floor((b.x - b.s / 2) / COLLISION_CELL) - 1;
    const maxX = Math.floor((b.x + b.s / 2) / COLLISION_CELL) + 1;
    const minZ = Math.floor((b.z - b.s / 2) / COLLISION_CELL) - 1;
    const maxZ = Math.floor((b.z + b.s / 2) / COLLISION_CELL) + 1;
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const bucket = this._collisionBuckets.get(cellKey(x, z));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const o = bucket[i];
        if (o === b || o._scSeen === stamp) continue;
        if (o.state !== 'static' && o.state !== 'unstable') continue;
        o._scSeen = stamp;
        const hSum = (b.s + o.s) / 2;
        const py = hSum - Math.abs(b.y - o.y);
        if (py <= 0) continue;
        const px = hSum - Math.abs(b.x - o.x);
        if (px <= 0) continue;
        const pz = hSum - Math.abs(b.z - o.z);
        if (pz <= 0) continue;
        const pen = px < py ? (px < pz ? px : pz) : (py < pz ? py : pz);
        if (!hit) hit = o;
        if (pen > 0.05) b._inContact = true;
        this._separate(b, o, false);
      }
    }
    return hit;
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
    // Full-pen correction in ONE step, however deep the overlap: this is the
    // anti-tunnelling contract, and the validator probes it (a mover placed
    // coincident with a solid must be fully ejected by one call). A 0.3 m
    // clamp was tried (2026-08-07) to gentle the compounding shoves that
    // launched piles sky-high; it broke the contract and shifted HIGH-tier
    // eat counts, and the launches turned out to have a single source —
    // budget-excluded debris sinking into itself (fixed by parking, see
    // _resolveDebrisContacts) — not the separator. Deep chunk-birth overlaps
    // resolve here as they always have.
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
    if (axis === 'y' && sign > 0 && o.state === 'falling') b._restLoose = o;
  }

  // --- consumption → score / growth / combo -------------------------------------

  _consume(b) {
    b.state = 'consumed';
    // The renderer hides consumed blocks, and `_syncFalling` drops this entry at
    // the top of the NEXT step — which, with the fixed-timestep catch-up in
    // main.js, can happen before the renderer ever runs again. Announce it.
    this._renderDirty(b);
    this._leanSet.delete(b);            // never rendered again; do not leak the entry
    this._fallingRemoved++;             // stale entry in the active mover list
    this._dirtyComps.add(this._compOf[b.bi]); // its zone's support graph shrank
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

    // Unlike campaign movement, the sandbox gets more capable as the hole
    // grows: bigger holes cover the district faster instead of feeling
    // sluggish at the end of the ladder.
    const sizeT = sandboxSizeProgress(h.size, h.sizeFrac);
    const speed = playerSpeedForRadius(h.radius) * this.tune.speed * (1 + SANDBOX_SPEED_RAMP * sizeT);
    if (move && (move.x || move.z)) {
      const len = Math.hypot(move.x, move.z) || 1;
      h.x += (move.x / len) * speed * dt;
      h.z += (move.z / len) * speed * dt;
      // `boundsRect` wins when a scene sets it (off-center maps need an
      // asymmetric clamp); otherwise the scalar square around the origin.
      const r = this.boundsRect;
      h.x = Math.min(r ? r.maxX : this.bounds, Math.max(r ? r.minX : -this.bounds, h.x));
      h.z = Math.min(r ? r.maxZ : this.bounds, Math.max(r ? r.minZ : -this.bounds, h.z));
    }
    this._collectCoins();

    // 0. camera blockers whose height band emptied since the last step. Done
    // before the graph work so the camera never renders a frame against a
    // blocker the previous step already knew was gone.
    if (this._blockerDirty && this._blockerDirty.size) this._refreshBlockers();

    // 1. support graph (only when coverage/graph actually changed)
    //
    // DEVICE-TIER LEVER: `supportEvery > 1` amortises the COVERAGE-driven half of
    // that trigger over several steps (1.29 ms/frame, 8.6% of CPU, on the Boston
    // profile). A graph change — a block detached or was eaten — always recalcs
    // immediately, because that is the one that decides whether a structure comes
    // down and deferring it would visibly stall a collapse. Deferring the
    // coverage half only delays the moment the rim NOTICES the hole has crept a
    // few centimetres, and the recalc that eventually runs sees the live hole
    // position, not the stale one. `_coverageChanged()` must still be called
    // every step — it swaps the coverage sets. Default `supportEvery` is 1, which
    // makes this expression identical to the single `||` it replaced.
    const covChanged = this._coverageChanged();
    let recalc = covChanged || this._graphDirty;
    if (recalc && !this._graphDirty && this.tune.supportEvery > 1
        && ++this._supportSkipped < this.tune.supportEvery) recalc = false;
    if (recalc) { this._supportSkipped = 0; this._recalcSupport(); }

    // 2. damage accumulation → detach; healthy blocks slowly heal
    // Only blocks already carrying damage or waiting to fail can change here.
    // Snapshotting preserves the old array-order timing for shock damage.
    for (const b of [...this._damageBlocks]) {
      if (b.state === 'unstable') {
        b.damage += b.failRate * dt;
        if (b.damage >= 1) {
          b.state = 'falling';
          b.fallT = this.time;
          b.asleep = false;
          this._newFalling.push(b);                 // joins the active mover list below
          this._leanSet.delete(b);                  // it is a mover now; `_falling` covers it (and the lean is state-gated off)
          this._dirtyComps.add(this._compOf[b.bi]); // its zone's support graph changed
          this._topRemove(b); // no longer a solid surface for others
          this._graphDirty = true;
          this._damageBlocks.delete(b);
          // shock: a block letting go jolts its neighbors — crumbling
          // propagates outward instead of shearing off cleanly
          for (const nb of b.neighbors) {
            if (nb.state === 'static' || nb.state === 'unstable') {
              // Never undo the damage=1 marker that instant collapse uses
              // for a neighbor already queued to detach this step.
              nb.damage = nb.state === 'unstable' && this.tune.creak <= 0
                ? 1
                : Math.min(0.95, nb.damage + 0.15);
              this._watchDamage(nb);
            }
          }
        }
      } else if (b.state === 'static' && b.damage > 0) {
        b.damage = Math.max(0, b.damage - 0.08 * dt);
        // Fully healed: it leaves the watch set this step, and the renderer
        // still has the heat tint uploaded. One more visit clears it.
        if (b.damage === 0) { this._damageBlocks.delete(b); this._renderDirty(b); }
      } else {
        this._damageBlocks.delete(b);
      }
    }

    // 3. group freshly detached regions into rigid chunks
    this._syncFalling();
    this._groupChunks();

    // 4. physics: chunks, then individual debris
    this._stepChunks(dt);
    this._stepDebris(dt);
    if (!this.won && h.rawMass >= this.totalMass * this.goal.targetFraction) {
      this.won = true;
      this.over = true;
      this.events.push({ type: 'goal', goal: this.goal, hole: h });
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
