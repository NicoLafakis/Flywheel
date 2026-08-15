// Progressive voxel excavation sandbox.
//
// The hole removes floor support; a deterministic load-path graph decides how
// the block-built world collapses. A block is an axis-aligned BOX with
// independent per-axis extents (`sx/sy/sz` in metres, `fsx/fsy/fsz` in fine
// cells) on a shared 0.25 m fine grid — a cube is the degenerate case
// `sx === sy === sz`, and the shipped 0.25 / 0.5 / 1 / 2 m ladder is a
// convention rather than an enumeration. Every extent must stay a multiple of
// 0.25 m: ADR-0006's determinism proof rests on every span being an exact sum
// of multiples of 1/8, which is what makes two tying BFS paths produce
// bit-identical floats. See ADR-0013. Three simulation layers:
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
// MULTI-HOLE (ai-players FR-001/FR-002): the sim owns an index-ordered roster
// `holes[]`; `sim.hole` is an accessor for `holes[0]` kept for every shipped
// single-player caller. Each hole accumulates its own mass/rawMass/chain/SIZE
// through the one shared block grid; cross-hole effects (two rims undermining
// one building, block consumption, coins) resolve once per step against the
// UNION of holes, with hole-index order as every tie-break. With one hole the
// arithmetic and its ordering are identical to the single-hole build.
//
// Scenes: 'gallery' (default, built by _buildScene below), 'manhattan'
// (Lower Manhattan), 'upper-manhattan' (Central Park + Upper Manhattan), and
// 'brooklyn' (bridges → DUMBO → Downtown → Prospect Park → Coney Island).

import { RNG } from './rng.js';
import {
  LEVEL_CLOCK_TICKS, LEVEL_CLOCK_URGENT_SECONDS, LEVEL_CLOCK_WARN_SECONDS,
} from './levelclock.js';
import { fwCbrt, fwCos, fwHypot2, fwHypot3, fwSin } from './fwmath.js';
import { playerSpeedForRadius } from './tiers.js';
import {
  bench, bigTruck, bikeRack, bollard, boxVan, brownstone, bus, cafeTable,
  crateStack, hotDogCart, hydrant, lampPost, laneDashes, mailbox, marketStall, motorcycle,
  newsBox, newsstand, planter, sandwichBoard, sedan, shippingContainer, signPost,
  signText, subwayEntrance, tower, trafficLight, trashBags, trashBin, tree,
  waterTower, kenneySUV, kenneySkyscraper,
} from './voxelkit.js';
import {
  POWERUP_TYPES, createPowerUp, pickRandomPowerUpType, activatePowerUp,
  stepActivePowerUps, hasActivePowerUp, stepGroundPowerUps,
  MAX_MAP_POWERUPS, MIN_POWERUP_SEPARATION, findSpacedPowerUpLocation,
} from './powerups.js';

// --- dynamic cataclysm storm system (tornado & hurricane events) -------------
export class StormSystem {
  constructor(sim) {
    this.sim = sim;
    this.rng = new RNG((sim.seed || 'sandbox') + ':storm');
    // 3 scheduled cataclysms during 300s level
    const is90s = sim.mode === 'run90' || sim.clockLimit === 5400;
    const isGallery = sim.scene === 'gallery';
    this.schedule = isGallery ? [] : (is90s ? [
      { triggerT: 28.0, duration: 12.0, done: false },
    ] : [
      { triggerT: 60.0,  duration: 16.0, done: false },
      { triggerT: 180.0, duration: 16.0, done: false },
    ]);
    this.state = 'idle'; // 'idle' | 'warning' | 'active' | 'clearing'
    this.stateTimer = 0;
    this.currentStorm = null;
    this.stormType = 'tornado';
    this.vortexX = 0;
    this.vortexZ = 0;
    this.vortexVx = 0;
    this.vortexVz = 0;
    this.ripTimer = 0;
  }

  _detectStormType() {
    const hasWater = this.sim.sceneDecor && Array.isArray(this.sim.sceneDecor.water) && this.sim.sceneDecor.water.length > 0;
    return hasWater ? 'hurricane' : 'tornado';
  }

  step(dt) {
    const time = this.sim.time;
    if (this.state === 'idle') {
      for (const ev of this.schedule) {
        if (!ev.done && time >= ev.triggerT) {
          ev.done = true;
          this.currentStorm = ev;
          this.stormType = this._detectStormType();
          this.state = 'warning';
          this.stateTimer = 4.0; // 4 seconds warning (sky dims, distant thunder)
          this.sim.events.push({
            type: 'storm_warning',
            stormType: this.stormType,
            duration: 4.0,
          });
          break;
        }
      }
    } else if (this.state === 'warning') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'active';
        this.stateTimer = this.currentStorm ? this.currentStorm.duration : 16.0;
        
        const r = this.sim.boundsRect || { minX: -this.sim.bounds * 0.7, maxX: this.sim.bounds * 0.7, minZ: -this.sim.bounds * 0.7, maxZ: this.sim.bounds * 0.7 };
        this.vortexX = (r.minX + r.maxX) * 0.5 + (this.rng.next() - 0.5) * (r.maxX - r.minX) * 0.5;
        this.vortexZ = (r.minZ + r.maxZ) * 0.5 + (this.rng.next() - 0.5) * (r.maxZ - r.minZ) * 0.5;
        const angle = this.rng.next() * 6.283185;
        const speed = 6.8;
        this.vortexVx = fwCos(angle) * speed;
        this.vortexVz = fwSin(angle) * speed;

        this.sim.events.push({
          type: 'storm_active',
          stormType: this.stormType,
          vortexX: this.vortexX,
          vortexZ: this.vortexZ,
          duration: this.stateTimer,
        });
      }
    } else if (this.state === 'active') {
      this.stateTimer -= dt;
      this.vortexX += this.vortexVx * dt;
      this.vortexZ += this.vortexVz * dt;

      const r = this.sim.boundsRect || { minX: -this.sim.bounds, maxX: this.sim.bounds, minZ: -this.sim.bounds, maxZ: this.sim.bounds };
      if (this.vortexX < r.minX + 10) { this.vortexX = r.minX + 10; this.vortexVx = Math.abs(this.vortexVx); }
      else if (this.vortexX > r.maxX - 10) { this.vortexX = r.maxX - 10; this.vortexVx = -Math.abs(this.vortexVx); }
      if (this.vortexZ < r.minZ + 10) { this.vortexZ = r.minZ + 10; this.vortexVz = Math.abs(this.vortexVz); }
      else if (this.vortexZ > r.maxZ - 10) { this.vortexZ = r.maxZ - 10; this.vortexVz = -Math.abs(this.vortexVz); }

      this.ripTimer += dt;
      if (this.ripTimer >= 0.12) {
        this.ripTimer = 0;
        this._applyStormDestruction();
      }

      if (this.stateTimer <= 0) {
        this.state = 'clearing';
        this.stateTimer = 3.5;
        this.sim.events.push({ type: 'storm_cleared', stormType: this.stormType });
      }
    } else if (this.state === 'clearing') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'idle';
        this.currentStorm = null;
      }
    }
  }

  _applyStormDestruction() {
    const stormRad = this.stormType === 'tornado' ? 16.0 : 22.0;
    const stormRad2 = stormRad * stormRad;
    const minX = this.vortexX - stormRad, maxX = this.vortexX + stormRad;
    const minZ = this.vortexZ - stormRad, maxZ = this.vortexZ + stormRad;
    let count = 0;
    const maxRips = 8;

    for (let i = 0; i < this.sim.blocks.length; i++) {
      const b = this.sim.blocks[i];
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      if (b.x < minX || b.x > maxX || b.z < minZ || b.z > maxZ) continue;
      
      const dx = b.x - this.vortexX;
      const dz = b.z - this.vortexZ;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > stormRad2) continue;

      const isVulnerable = this.stormType === 'tornado' ? (b.y >= 5.0) : (b.matType === 'glass' || b.matType === 'panel' || b.y >= 3.5);
      if (!isVulnerable) continue;

      const dist = fwHypot2(dx, dz) || 1;
      const nx = dx / dist;
      const nz = dz / dist;

      if (this.stormType === 'tornado') {
        const vx = -nz * 12.0 + (this.rng.next() - 0.5) * 4;
        const vz = nx * 12.0 + (this.rng.next() - 0.5) * 4;
        const vy = 6.0 + this.rng.next() * 5.0;
        this.sim._detachBlock(b, vx, vy, vz);
      } else {
        const vx = this.vortexVx * 2.0 - nz * 8.0 + (this.rng.next() - 0.5) * 4;
        const vz = this.vortexVz * 2.0 + nx * 8.0 + (this.rng.next() - 0.5) * 4;
        const vy = 4.0 + this.rng.next() * 3.5;
        this.sim._detachBlock(b, vx, vy, vz);
      }
      count++;
      if (count >= maxRips) break;
    }
    if (count > 0) this.sim._graphDirty = true;
  }
}

// --- authored scenes, loaded on demand ---------------------------------------
// The six cities are 1.19 MB of raw source between them (Cambridge alone is
// 664 KB) and a session plays exactly ONE of them. Statically imported, all six
// were downloaded, parsed and evaluated before the title screen could paint —
// on a throttled phone connection that was the bulk of an 18.6 s cold load, paid
// in full by a player who then picked Brooklyn.
//
// They are pure data-emitting builders — each takes the sim and calls `_block`
// — so nothing else in this module needs them at module-evaluation time. That
// is what makes the split safe: there is no cycle to break and no shared state
// to initialise, only a function that has to exist by the time the constructor
// reaches it.
//
// The constructor stays SYNCHRONOUS on purpose. Roughly fifty call sites build a
// sim — six in the game and the demos, the rest in tools/ and the .test.mjs
// files — and an async constructor is not a thing JavaScript has, so the honest
// shape is an explicit `await loadScene(id)` before `new`. Callers that only
// ever build the gallery (which is authored right here in `_buildScene`) need no
// change at all; `loadScene` is a no-op for them.
const SCENE_IMPORTERS = {
  'manhattan': () => import('./voxelscene-manhattan.js').then((m) => m.buildManhattan),
  'upper-manhattan': () => import('./voxelscene-upper-manhattan.js').then((m) => m.buildUpperManhattan),
  'brooklyn': () => import('./voxelscene-brooklyn.js').then((m) => m.buildBrooklyn),
  'boston': () => import('./voxelscene-boston.js').then((m) => m.buildBoston),
  'cambridge': () => import('./voxelscene-cambridge.js').then((m) => m.buildCambridge),
  'chicago': () => import('./voxelscene-chicago.js').then((m) => m.buildChicago),
  'tokyo': () => import('./voxelscene-tokyo.js').then((m) => m.buildTokyo),
};
const SCENE_BUILDERS = new Map();
// In-flight promises, so two overlapping starts (a fast double-tap on a city
// chip) share one module fetch instead of racing two.
const SCENE_PENDING = new Map();

/** True once `scene` can be constructed synchronously. Always true for the
 *  gallery and for any id that names no authored scene — both fall through to
 *  `_buildScene`, which needs nothing loaded. */
export function sceneReady(scene) {
  return !SCENE_IMPORTERS[scene] || SCENE_BUILDERS.has(scene);
}

/** Fetch and cache an authored scene's builder. Idempotent, and a no-op for the
 *  gallery. MUST be awaited before `new VoxelSandboxSim({ scene })` for any of
 *  the six cities — the constructor throws otherwise rather than silently
 *  building a gallery under a Brooklyn label. */
export async function loadScene(scene) {
  if (!SCENE_IMPORTERS[scene]) return null;
  if (SCENE_BUILDERS.has(scene)) return SCENE_BUILDERS.get(scene);
  let p = SCENE_PENDING.get(scene);
  if (!p) {
    p = SCENE_IMPORTERS[scene]().then((fn) => { SCENE_BUILDERS.set(scene, fn); return fn; });
    SCENE_PENDING.set(scene, p);
  }
  try { return await p; }
  finally { SCENE_PENDING.delete(scene); }
}

// --- tuning ------------------------------------------------------------------
const FINE = 0.25;          // fine grid resolution (m); blocks are fs fine cells per side (0.25/0.5/1/2 m)
const COLLISION_CELL = 1;   // coarse broad-phase cell for moving-body vs solid queries
// 2.5× real-feel gravity: blocks SLAM (playtest: 26 read as floating).
// Harder impacts also split/bounce/scatter more — spill is the intent.
// Gravity is UNIFORM across materials (owner ruling, 2026-08-11): the launch
// bug's RCA measured glass at 44 m/s² beside steel at 101 and the per-density
// spread read as broken slow motion, not weight. Density still drives mass
// accounting, bonds and scoring — just not the fall rate.
// All of gravity/wave/creak/speed/attract is live-tunable via sim.tune
// (dev sliders in SETTINGS); these constants are just the defaults. A zero
// creak setting makes support loss detach on the next sim step.
const GRAVITY = 70;
const BOND_CARRY = 0.5;      // min outgoing bond for a block to pass support along an edge
const GROUP_BOND = 0.45;     // min connection strength for two blocks to share a chunk
const CHUNK_MIN = 3;         // smaller detached groups become individual debris
const CHUNK_CAP = 64;        // max blocks per rigid chunk
const FRESH_WINDOW = 0.6;    // seconds after detaching during which blocks may chunk up
const JAM_STEPS = 30;        // steps a grounded body must hold its position before it may
                             // retire WHILE in contact — see _latchJammed (T-402)
const JAM_EPS = 1e-3;        // per-axis drift (m) allowed across those steps, measured from
                             // the anchor rather than step to step so creep cannot accumulate
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
// Cumulative RAW mass required for each SIZE level (1-indexed via size-1).
// Escalating steps: early sizes are a snack, then each level costs clearly
// more than the last — pushing players from small props onto big targets,
// and making SIZE 12 a prize for a long, sustained excavation.
//
// RAW, not combo-multiplied, as of the points-only ruling (ADR-0015): the
// combo now buys SCORE and nothing else, so the growth ladder reads
// `h.rawMass` and a great chain no longer makes the hole physically bigger.
//
// Rebased per level, NOT by one divisor. The old ladder read `h.mass`, so the
// honest question was "how much RAW mass had actually been eaten at the moment
// each level used to fire". That was measured by re-running every scene's
// scripted excursion against the HEAD tree and recording both currencies at
// each crossing; dividing the raw figure by the scene's own ladder scale
// (`0.3 × min(10, max(1, round(totalMass / 4200)))`) gives the SIZE_MASS entry
// that scene needs in order to keep the level it had.
//
// The raw/mass ratio at a crossing is nowhere near constant — chains lengthen
// as the hole grows, so the multiplier's contribution grows with the level, and
// it varies by scene besides. In the gallery it runs 0.94 at SIZE 2 down to
// 0.49 at SIZE 12; in Manhattan, whose excursion sustains a far longer chain,
// SIZE 8 landed at 0.39. A single divisor cannot span that, which is why there
// is no SIZE_RAW_REBASE constant: each entry is the MINIMUM across scenes of
// what that level costs in raw mass, so no scene loses a level (the floors in
// tools/validate.mjs pin this), and levels 9-12 — where only the gallery
// reaches — are eased geometrically off SIZE 8 rather than jumping 2.4× in one
// step. Re-measure whenever scene mass or the combo ladder changes.
const SIZE_MASS = [
  0, 24, 67, 138, 251, 381, 579, 898, 1374, 2102, 3216, 4919,
  7524, 11508, 17601, 26921, 41176, 62979, 96326, 147331, 225343, 344662, 527161, 806293
];
const MAX_SIZE = SIZE_MASS.length;
const MAX_RADIUS = START_RADIUS + (MAX_SIZE - 1) * 0.5; // 12.6 m at SIZE 24 (13.1 m at sizeFrac 1)
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
export const COMBO_WINDOW = 1.5;

// --- the combo ladder (ADR-0015) ---------------------------------------------
// A TABLE, not a formula, and exported so the HUD reads the same object the sim
// scores with. The closed-form expression this replaces
// (`min(3, 1 + 0.1 * floor((chain - 1) / 25))`) could not express a
// front-loaded shape at all, and the HUD's own second expression drifted from
// it — printing "x2" at chain 26 while the sim awarded 1.1. One ladder, one
// reader; `tools/validate.mjs` holds the equality for chains 1..1000.
//
// Front-loaded on purpose: levels 2-4 land inside the first seconds of any
// competent run (measured on Cambridge's full route: every 8-10 s), which is
// the "this is working" signal the game had no way to give. The tail stretches
// until level 7 is a feat (crossed once or twice in a thirteen-minute clear)
// and level 8 is the summit (the longest chain measured across a complete clear
// was 528).
//
// EVERY ENTRY IS A STEP THE PLAYER FEELS (T-501). This list used to open with
// `2`, against a mapping of `level = i + 1` — and level 1 is already the floor,
// so crossing index 0 awarded exactly what a chain of 0 already had. A chain of
// 2 scored what a chain of 0 scored, while the published head said otherwise.
// The defect was structural rather than a bad number: ANY value at index 0 was
// inert, so re-tuning `2` would have fixed nothing. The entry is gone and the
// mapping is `level = i + 2`, which leaves every rung x1..x8 on exactly the
// chain range it already had — this is a representation fix and no score moves,
// so there is NO `RANKED_SIM_VERSION` implication. The proof is that the literal
// chain-to-multiplier table in tools/validate.mjs passes unchanged.
//
// Whether the first real step belongs at 10 is a separate tuning question this
// deliberately does not answer; it now has a clean seam to be answered on.
export const COMBO_THRESHOLDS = [10, 15, 25, 50, 100, 350, 600];
// FR-013's two named constants. STEP is what one level is worth — a WHOLE extra
// helping, the owner's ruling — and MAX_LEVEL is the tail rule: the ladder tops
// out here and hands out nothing past it, so the summit has a name instead of
// being one more number going up. `+ 1` is the x1 floor, which is a level with
// no threshold: every hole is on it before it has eaten anything.
export const COMBO_STEP = 1;
export const COMBO_MAX_LEVEL = COMBO_THRESHOLDS.length + 1;
// Display names, indexed by level. Level 8 used to be 'MAX' rather than a
// number, which made the top of the ladder the one rung whose VALUE the game
// never showed: a player counting the steps they had seen concluded the ceiling
// was x7, while the number visibly climbing next to that label was the chain
// COUNT, not a multiplier. That pairing is the most likely origin of "it maxes
// out at 100x" (audit B3, T-311). Every rung is now numbered; the summit still
// reads as the summit through the ring's `topped` state, which is a state, not
// a label sitting over something that keeps going up.
export const COMBO_LEVEL_NAMES = ['', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'];

// Level 1 is the floor, including a chain of 0 or 1: a hole that has eaten one
// block is not on a combo, but the multiplier it scores at is still x1, so the
// ladder is total and the HUD never has to special-case "no chain".
//
// `i + 2`, not `i + 1`: the floor occupies level 1 without a threshold, so the
// FIRST threshold has to award level 2 or it awards nothing at all (T-501).
export function comboLevel(chain) {
  let level = 1;
  for (let i = 0; i < COMBO_THRESHOLDS.length; i++) {
    if (chain >= COMBO_THRESHOLDS[i]) level = i + 2; else break;
  }
  return level;
}
export function comboMult(chain) {
  return 1 + (comboLevel(chain) - 1) * COMBO_STEP;
}

// --- the consumption milestone ladder (FR-015..FR-018) -----------------------
// Ordered rows of { at, text, tier } where `at` is a fraction of the SCENE
// GOAL. Every scene's goal is now the whole city (R-2.1), so `at` is also a
// fraction of the whole city — the indirection stays because the goal table is
// still the single source of the denominator (R-2.5's seam), not because the
// two numbers currently differ. The last row is exactly 1.0, which is goal
// completion, so a full clear ends on the loudest beat rather than a beat
// before or after it.
//
// Consequence of the 100% goal, and it is the intended one: these phrases now
// stage across the WHOLE map. 'HALFWAY GONE!' fires at half the city, where it
// used to fire at a quarter of it, and 'TOTAL CONSUMPTION!' means what it says.
// On a real city most runs will hear only the first row or two inside 180 s.
//
// This is DATA and it is meant to be edited as data: change a word, add a row,
// reorder the volume, without touching a line of logic. `tier` selects how loud
// the renderer dresses it; the three names are the whole vocabulary.
export const MILESTONE_TIERS = ['nudge', 'hype', 'roar'];
export const MILESTONES = [
  { at: 0.05, text: '5% CLEARED — WARMING UP!',            tier: 'nudge' },
  { at: 0.15, text: '15% CLEARED — DEVOURING THE STREETS!', tier: 'nudge' },
  { at: 0.25, text: '25% CLEARED — ONE QUARTER DOWN!',     tier: 'hype'  },
  { at: 0.40, text: '40% CLEARED — CITYWIDE RAMPAGE!',     tier: 'hype'  },
  { at: 0.50, text: '50% CLEARED — HALFWAY GONE!',         tier: 'roar'  },
  { at: 0.65, text: '65% CLEARED — CRITICAL MASS!',        tier: 'hype'  },
  { at: 0.75, text: '75% CLEARED — THREE QUARTERS DOWN!',  tier: 'roar'  },
  { at: 0.90, text: '90% CLEARED — FINAL STAND!',          tier: 'roar'  },
  { at: 0.98, text: '98% CLEARED — LAST REMNANTS!',        tier: 'roar'  },
  { at: 1.00, text: '100% CLEARED — TOTAL MAP CONSUMPTION!', tier: 'roar'  },
];

// The goal table. `targetFraction` is 1.0 on EVERY scene (R-2.1): the goal is
// the whole city, not half of it, and every consumer measures against the whole
// map — the HUD bar and its percentage, the milestone ladder, the win check, the
// results screen and the saved records.
//
// 100% is a SCORING CEILING, not a pass/fail win condition (R-2.5). The run ends
// on the 180 s clock and the player is scored on the percentage reached; a full
// clear is routine on the gallery, monumental on a city, and still sets `won`.
// Exported so `tools/validate.mjs` can hold the table itself rather than
// re-listing the scenes, and so the guard's failure message can name the scene.
//
// THE SEAM (R-2.5): making 100% a hard win condition again is a one-line change
// here — nothing downstream reads a fraction of its own.
export const SCENE_GOALS = {
  gallery: { name: 'CLEAR THE COLLECTION', targetFraction: 1.0 },
  manhattan: { name: 'OPEN THE FINANCIAL DISTRICT', targetFraction: 1.0 },
  'upper-manhattan': { name: 'RECLAIM CENTRAL PARK', targetFraction: 1.0 },
  brooklyn: { name: 'CONNECT THE BOROUGHS', targetFraction: 1.0 },
  boston: { name: 'SWALLOW THE SEAPORT', targetFraction: 1.0 },
  cambridge: { name: 'SWALLOW THE SPROCKET', targetFraction: 1.0 },
  chicago: { name: 'LOOP THE LOOP', targetFraction: 1.0 },
  tokyo: { name: 'CROSS THE SCRAMBLE', targetFraction: 1.0 },
};
export const SANDBOX_COIN_COUNT = 60;
export const SANDBOX_COIN_VALUE = 2;
export const SANDBOX_GOAL_BONUS = 35;

// Tiered Metropolis Coin Economy:
// Higher-tier cities spawn more ground coins with higher individual value,
// and reward exponentially higher coin bonuses for 100% full clears.
export const CITY_COIN_TIERS = {
  gallery: { coinCount: 200, coinValue: 5, goalBonus: 500 },
  manhattan: { coinCount: 70, coinValue: 2, goalBonus: 50 },
  brooklyn: { coinCount: 80, coinValue: 2, goalBonus: 75 },
  chicago: { coinCount: 100, coinValue: 2, goalBonus: 100 },
  cambridge: { coinCount: 120, coinValue: 3, goalBonus: 150 },
  'upper-manhattan': { coinCount: 140, coinValue: 3, goalBonus: 200 },
  boston: { coinCount: 160, coinValue: 4, goalBonus: 300 },
  tokyo: { coinCount: 200, coinValue: 5, goalBonus: 500 },
};

export function getCityCoinTier(scene) {
  return CITY_COIN_TIERS[scene] || {
    coinCount: SANDBOX_COIN_COUNT,
    coinValue: SANDBOX_COIN_VALUE,
    goalBonus: SANDBOX_GOAL_BONUS,
  };
}

// THE RUN's complete physics contract. This is separate from display quality:
// every ranked client and the server verifier use these values, so a phone can
// draw less without creating a different score trajectory.
export const RANKED_TUNE_ID = 'ranked-v1';
// Increment only when the deterministic RUN's gameplay behaviour changes.
// The verifier keeps old rows as `unverifiable`; it must never label a
// cross-version replay as a cheat merely because a physics bug was fixed.
export const RANKED_SIM_VERSION = 1;
export const RANKED_TICK_COUNT = 90 * 60;
// This table must name EVERY key `step()` reads off `this.tune`, not merely the
// ones something happens to write today. `perfMode` was missing until 2026-08-13
// and that single omission was a release blocker (audit A5.1): the ranked tune
// was applied with `Object.assign`, which cannot delete a key it does not carry,
// so a player with SETTINGS → "Smoother play" ON kept `perfMode: true` into a
// ranked run and scored 2247.9250 against the server's 2231.9625 on the same
// trace. Adding the key is only half the fix — a merge is the wrong operation
// for a total contract, so the constructor now REPLACES the tune object with a
// frozen copy of this one. `validateRankedTuneIsTotal()` in tools/validate.mjs
// greps every `tune.<key>` read in this file and fails if one is unpinned, which
// is what stops the next lever from repeating the same defect.
export const RANKED_TUNE = Object.freeze({
  gravity: GRAVITY, waveK: WAVE_K, creak: 0, speed: SPEED_MULT, attract: ATTRACT_ACC,
  debrisCap: 280, contactBudget: 200, contactRounds: 2, supportEvery: 1,
  perfMode: false,
});

// Shared progression curve for sandbox movement/camera feel. SIZE 1 is 0;
// SIZE 12 (including its final fraction) is 1.
export function sandboxSizeProgress(size, sizeFrac = 0) {
  return Math.max(0, Math.min(1, (size - 1 + Math.max(0, Math.min(1, sizeFrac))) / (MAX_SIZE - 1)));
}

/**
 * The sandbox movement speed for a hole of `radius`, in m/s — the exact
 * expression `step()` applies (playerSpeedForRadius × tune.speed × the
 * SANDBOX_SPEED_RAMP), derived from radius alone. Exact because radius is an
 * affine function of the SIZE ladder (`radius = START_RADIUS + (size - 1 +
 * min(1, sizeFrac)) × 0.5`, see the size recalc in `_growHole`), so
 * `(radius − START_RADIUS) / 0.5` recovers `size − 1 + sizeFrac` bit for bit.
 *
 * Exported for the net layer: 04-netcode-design.md §5.2 has a peer predict its
 * own hole's movement locally, and hard rule 4 (single source) means it must
 * call THIS function rather than carry a copy of the ramp. Nothing here reads
 * or writes sim state.
 */
export function sandboxSpeedForRadius(radius, tuneSpeed = SPEED_MULT) {
  const sizeT = Math.max(0, Math.min(1, ((radius - START_RADIUS) / 0.5) / (MAX_SIZE - 1)));
  return playerSpeedForRadius(radius) * tuneSpeed * (1 + SANDBOX_SPEED_RAMP * sizeT);
}

// --- movers (render-only kinematic props) ------------------------------------
// A mover is a scene prop that travels a CLOSED polyline at constant speed —
// the Chicago Loop train today; a boat or a street car tomorrow. It is not a
// block: it owns no fine cells, feeds no physics, and cannot be eaten. Its pose
// is a PURE FUNCTION of the deterministic sim clock, which is the whole
// multiplayer story: host and peer step the same `sim.time`, call the same two
// functions below, and draw the same train in the same place — no state to
// snapshot, nothing to drift. No Math.random, no Date.now, ever.
//
// `path` is [[x, z], ...] and is implicitly closed (last point joins the
// first). `moverArc` is called once per scene build; `moverPose(arc, s)` maps
// an arc length onto position + unit direction. The renderer wraps
// `s = time * speed + offset` modulo `arc.total` per unit, so a multi-car
// train is one path and N offsets — each car turns the corner on its own.
export function moverArc(path) {
  const segs = [];
  let total = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[i], b = path[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = fwHypot2(dx, dz);
    if (len <= 0) continue;
    segs.push({ x: a[0], z: a[1], ux: dx / len, uz: dz / len, len, s0: total });
    total += len;
  }
  return { segs, total };
}

export function moverPose(arc, s) {
  const segs = arc.segs;
  let g = segs[segs.length - 1];
  let t = s % arc.total;
  if (t < 0) t += arc.total;
  for (const c of segs) { if (t <= c.s0 + c.len) { g = c; break; } }
  const u = Math.max(0, Math.min(g.len, t - g.s0));
  return { x: g.x + g.ux * u, z: g.z + g.uz * u, ux: g.ux, uz: g.uz };
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
  constructor({ seed = 'voxel-sandbox', scene = 'gallery', mode = 'freeplay' } = {}) {
    this.rng = new RNG(seed);
    this.mode = mode;
    this.rankedTicks = 0;
    this.runComplete = false;
    // --- the level clock (R-1) ------------------------------------------------
    // Every non-ranked run is bounded by LEVEL_CLOCK_TICKS. THE RUN is the one
    // exception and it is expressed as `clockLimit === null` rather than as a
    // mode test at the expiry site: run90 keeps its own server-seeded 5,400-tick
    // bound (ADR-0016) and must never consult the 180 s constant (T-107). The
    // early return in step() means the block below is unreachable in run90
    // anyway; the null is the second lock on the same door.
    this.clockLimit = mode === 'run90' ? null : LEVEL_CLOCK_TICKS;
    this.clockTicks = 0;
    // Seconds remaining, derived from the tick count so it is exact rather than
    // accumulated. `null` in run90 — never 0, which a HUD would render as an
    // expired clock. Callers must treat null as "this mode has no level clock".
    this.timeLeft = this.clockLimit === null ? null : this.clockLimit / 60;
    // Set when the clock, rather than the goal, ended the run. `over` alone
    // cannot tell the two apart and the results screen needs to.
    this.timedOut = false;
    this._clockMarks = this.clockLimit === null ? [] : [
      LEVEL_CLOCK_WARN_SECONDS, LEVEL_CLOCK_URGENT_SECONDS,
    ].map((at) => ({ at, tick: this.clockLimit - at * 60 }));
    this._clockMarkIdx = 0;    // next unfired endgame state, monotonic like _massMarkIdx
    // THE ROSTER (ai-players FR-001/FR-002). `holes` is the canonical,
    // index-ordered collection; every per-hole quantity (mass, chain, SIZE,
    // coverage cache) lives ON the hole, never on the sim. `sim.hole` survives
    // as an accessor for `holes[0]` so every shipped single-player read keeps
    // working unchanged — with one hole, every pass below performs the same
    // arithmetic in the same order as the single-hole build it replaced.
    this.holes = [this._newHole(0, 16, 0)];
    this.time = 0;
    this.over = false;
    this.won = false;
    this.events = [];
    this.blocks = [];
    this.grid = new Map(); // every occupied fine cell -> owning block
    this.chunks = [];
    this._blockId = 1;
    this._chunkId = 1;
    // (removal-zone coverage sets live per hole — see _newHole/_coverageChanged)
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
    this._scFloorHit = false;  // set by _pushAxis on a +y resolution — "this contact had floor character"
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
    this._massMarkIdx = 0;                 // next unfired row of MILESTONES (fractions of the GOAL)
    this.MAX_SIZE = MAX_SIZE;
    this.bounds = 24;          // hole movement clamp (m); scenes may widen it
    this.boundsRect = null;    // optional {minX,maxX,minZ,maxZ}; overrides `bounds` for off-center maps
    this.coinAnchors = null;   // optional [{x, z, ...}]; scene-declared coin placement (see _placeCoins)
    this.sceneDecor = null;    // render-only roads/parks/water (VoxelWorld3D)
    this.sceneMovers = null;   // render-only kinematic props on closed paths (see moverArc/moverPose)
    this.cameraBlockers = [];  // tall-building AABBs for the chase cam
    // Live-tunable physics (dev sliders in SETTINGS → main.js pushes values
    // from save.settings; the constants above are the defaults/validator's).
    // `debrisCap`/`contactBudget`/`contactRounds`/`supportEvery` are the
    // DEVICE-TIER levers (js/quality.js). Their defaults are exactly the
    // behaviour that shipped before tiers existed — Infinity / Infinity / 2 / 1 —
    // so a fresh default-tier sim is byte-identical to the pre-tier build and
    // `tools/validate.mjs` never sees a tier at all. Anything that changes
    // physics has to keep that property.
    // A ranked run REPLACES this object rather than merging into it, and freezes
    // the result. Merging was the A5.1 defect: `Object.assign(tune, RANKED_TUNE)`
    // leaves behind any key RANKED_TUNE does not mention, so one settings toggle
    // silently ran different physics than the server. Replacement makes the
    // ranked tune total by construction — a lever that is not in RANKED_TUNE
    // simply does not exist on a ranked sim — and the freeze makes any writer
    // that is added later fail loudly at the write instead of quietly publishing
    // a score the server will not reproduce. `tuneLocked` is the flag callers
    // test so they never have to know the mode string (see js/main.js).
    this.tuneLocked = mode === 'run90';
    if (this.tuneLocked) {
      // Freezing the OBJECT stops `sim.tune.gravity = 100`; it does not stop
      // `sim.tune = {...}`, which would swap the whole contract out and put us
      // straight back in A5.1. The probe for this fix caught that gap, so the
      // property itself is non-writable too. The constructor is the only
      // assignment of `this.tune` anywhere in the repo, so nothing legitimate
      // loses a door here.
      Object.defineProperty(this, 'tune', {
        value: Object.freeze({ ...RANKED_TUNE }),
        writable: false, configurable: false, enumerable: true,
      });
    } else {
      this.tune = {
        gravity: GRAVITY, waveK: WAVE_K, creak: 0, speed: SPEED_MULT, attract: ATTRACT_ACC,
        debrisCap: Infinity, contactBudget: Infinity, contactRounds: 2, supportEvery: 1,
        perfMode: false,
      };
    }
    this._supportSkipped = 0;  // coverage-only recalcs deferred by supportEvery

    // Authored scenes come from the on-demand registry at the top of this file.
    // A missing builder is a programming error at the CALL SITE (a `new` that
    // skipped `await loadScene`), so it throws by name rather than falling
    // through to the gallery — a Brooklyn label over a gallery pile is the kind
    // of wrong that passes a smoke test.
    const authored = SCENE_IMPORTERS[scene] ? SCENE_BUILDERS.get(scene) : null;
    if (SCENE_IMPORTERS[scene] && !authored) {
      throw new Error(`VoxelSandboxSim: scene '${scene}' is not loaded — await loadScene('${scene}') before constructing`);
    }
    if (authored) authored(this);
    else this._buildScene();
    this.scene = scene;
    this.goal = SCENE_GOALS[scene] || SCENE_GOALS.gallery;
    const coinTier = getCityCoinTier(scene);
    this.coinCount = coinTier.coinCount;
    this.coinValue = coinTier.coinValue;
    this.goalBonus = coinTier.goalBonus;
    this.coins = this._placeCoins();
    this.coinsCollected = 0;
    this.powerupRng = new RNG((seed || 'sandbox') + ':powerups');
    this.powerups = this._placePowerups();
    for (const pu of this.powerups) {
      this.events.push({ type: 'powerup_spawn', powerup: pu, reason: 'initial' });
    }
    this.powerupRespawnTimers = [];
    this.disastersTriggered = new Set();
    this.disasterRng = new RNG((seed || 'sandbox') + ':disasters');
    this._nextPowerUpId = this.powerups.length + 1;
    this.nextScorePowerUpThreshold = 100000;
    this.nextMultPowerUpThreshold = 500;
    this._assertCellKeyRange(scene);
    this._buildNeighbors();
    this._buildZones();
    this.stormSystem = new StormSystem(this);
    this.isTimeFrozen = false;
    this._wasTimeFrozen = false;
    this.totalBlocks = this.blocks.length;
    // Static collision broad phase. The fine occupancy grid is ideal for
    // support/consumption, but scanning its full y-range for every falling
    // block is too expensive during a city-wide collapse.
    this._collisionBuckets = new Map();
    for (const b of this.blocks) {
      const minX = Math.floor(b.x - b.sx / 2), maxX = Math.floor(b.x + b.sx / 2);
      const minZ = Math.floor(b.z - b.sz / 2), maxZ = Math.floor(b.z + b.sz / 2);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const k = cellKey(x, z);
        let bucket = this._collisionBuckets.get(k);
        if (!bucket) { bucket = []; this._collisionBuckets.set(k, bucket); }
        bucket.push(b);
      }
    }
    this.totalMass = this.blocks.reduce((s, b) => s + b.mat.mass * (b.sx * b.sy * b.sz), 0);
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
    // Simulated movers (derail / ground-run / eatable — see the mover
    // simulation section). Consumes ids from `_blockId`, so it runs after every
    // block exists and before the id space is published.
    this._initMoverSim();
    // The full object-id space: blocks + mover units. The net layer's keyframe
    // bitset covers this, so a consumed train car heals over the wire exactly
    // like a consumed block (js/net/host.js prefers this over its own scan).
    this.objectIdSpace = this._blockId;
  }

  // --- the hole roster ---------------------------------------------------------

  /**
   * Back-compat alias (ai-players AC-03.5): `sim.hole` IS `sim.holes[0]`.
   * A setter is kept so legacy code that rebound the hole keeps functioning,
   * but nothing in this repo assigns it any more.
   */
  get hole() { return this.holes[0]; }
  set hole(h) { this.holes[0] = h; }

  // Every field the single-hole build kept on `this.hole`, plus:
  //   index        the hole's identity for the life of the match (slot mapping
  //                in js/net/snapshot.js reads it)
  //   isPlayer     true only for holes[0], the local human by convention
  //   _cov/_covSpare  the per-hole removal-zone coverage cache (_coverageChanged)
  _newHole(x, z, index) {
    return {
      x, z, radius: START_RADIUS, mass: 0, rawMass: 0,
      chain: 0, chainTimer: 0, bestCombo: 0, eatenCount: 0, isPlayer: index === 0,
      size: 1, sizeFrac: 0, // SIZE level (1..24) + progress to the next level
      index,
      activePowerUps: [],
      _cov: new Set(), _covSpare: new Set(),
    };
  }

  /**
   * Seat another hole in the shared world. Deterministic: draws nothing from
   * the RNG, so adding N holes leaves every stream exactly where it was.
   * @returns the new hole (also holes[holes.length - 1])
   */
  addHole(x = 0, z = 0) {
    const h = this._newHole(x, z, this.holes.length);
    this.holes.push(h);
    return h;
  }

  // Per-pass derived radii, one row per hole, in hole-index order. Pooled and
  // recomputed at the top of each pass that needs them (support, chunks,
  // debris) because a hole's radius can grow mid-step between passes — exactly
  // as the single-hole code recomputed remR at each pass entry. `_dx/_dz/_d2`
  // are per-block scratch used inside _stepDebris/_stepChunks.
  _holeParams() {
    const H = this.holes;
    const hp = this._hp || (this._hp = []);
    while (hp.length < H.length) hp.push({});
    hp.length = H.length;
    for (let i = 0; i < H.length; i++) {
      const h = H[i], p = hp[i];
      p.h = h;
      const titan = hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.TITAN);
      const effectiveRadius = titan ? MAX_RADIUS : h.radius;
      p.remR = effectiveRadius * REMOVAL_FRAC;
      p.remR2 = p.remR * p.remR;
      p.attractR = effectiveRadius + ATTRACT_ZONE;
      p.attractR2 = p.attractR * p.attractR;
      const rimR = effectiveRadius + INSTAB_ZONE + 0.5;
      p.rimR2 = rimR * rimR;
      p.instabR = effectiveRadius + INSTAB_ZONE + 0.6;
      p.instabR2 = p.instabR * p.instabR;
      p.hangScale = effectiveRadius / MAX_RADIUS;
      p._dx = 0; p._dz = 0; p._d2 = 0;
    }
    return hp;
  }

  // Squared distance to the nearest hole — the multi-hole reading of "distance
  // to the hole" for the device-tier levers (_capDebris, the contact budget).
  // With one hole this is the exact expression the single-hole sort used.
  _nearestHoleD2(x, z) {
    const H = this.holes;
    let best = Infinity;
    for (let i = 0; i < H.length; i++) {
      const dx = x - H[i].x, dz = z - H[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return best;
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
    const count = this.coinCount || SANDBOX_COIN_COUNT;
    for (let i = 0; i < count; i++) {
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
    // Hole-index order, so two holes reaching the same coin on the same step
    // resolve deterministically to the lower index.
    for (let hi = 0; hi < this.holes.length; hi++) {
      const h = this.holes[hi];
      this._collectCoinsFor(h);
    }
  }

  _collectCoinsFor(h) {
    const reach = h.radius + 0.7;
    const coinVal = this.coinValue || SANDBOX_COIN_VALUE;
    for (const coin of this.coins) {
      if (coin.collected || fwHypot2(coin.x - h.x, coin.z - h.z) > reach) continue;
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
      this.events.push({ type: 'coin', coin, value: coinVal, hole: h });
    }
  }

  _placePowerups() {
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const out = [];
    const count = 2;
    for (let i = 0; i < count; i++) {
      const type = pickRandomPowerUpType(this.powerupRng, out, this._lastSpawnedPowerUpType);
      this._lastSpawnedPowerUpType = type;
      const angle = this.powerupRng.next() * 6.283185307179586;
      const pos = findSpacedPowerUpLocation(out, r, this.powerupRng, MIN_POWERUP_SEPARATION);
      out.push(createPowerUp(
        i + 1,
        type,
        pos.x,
        pos.z,
        'map',
        { lifespan: Infinity, speed: 2.4, angle }
      ));
    }
    return out;
  }

  _collectPowerups() {
    for (let hi = 0; hi < this.holes.length; hi++) {
      const h = this.holes[hi];
      this._collectPowerupsFor(h);
    }
  }

  _detachBlock(b, vx = 0, vy = 0, vz = 0) {
    b.state = 'falling';
    b.fallT = this.time;
    b.asleep = false;
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    this._falling.push(b);
    this._sleepObsRemove(b);
    this._topRemove(b);
    this._damageBlocks.delete(b);
    this._graphDirty = true;
  }

  _triggerVoxelQuake(hole) {
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const corners = [
      { x: r.minX, z: r.minZ },
      { x: r.minX, z: r.maxZ },
      { x: r.maxX, z: r.minZ },
      { x: r.maxX, z: r.maxZ }
    ];
    let maxDistSq = -1;
    let target = null;
    for (const c of corners) {
      const cdx = c.x - hole.x;
      const cdz = c.z - hole.z;
      const distSq = cdx * cdx + cdz * cdz;
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        target = c;
      }
    }

    const tdx = target.x - hole.x;
    const tdz = target.z - hole.z;
    const angle = Math.atan2(tdz, tdx);
    const cosA = fwCos(angle);
    const sinA = fwSin(angle);
    const faultLen = Math.sqrt(maxDistSq);

    const x0 = hole.x;
    const z0 = hole.z;
    const x1 = hole.x + cosA * faultLen;
    const z1 = hole.z + sinA * faultLen;

    const crackWidth = 4.0;
    let count = 0;
    const affectedBlocks = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      
      const dx = b.x - hole.x;
      const dz = b.z - hole.z;
      const longDist = dx * cosA + dz * sinA;
      if (longDist < 0 || longDist > faultLen) continue;
      
      const rawPerp = -dx * sinA + dz * cosA;
      const perpDist = Math.abs(rawPerp);
      if (perpDist <= crackWidth) {
        const sign = rawPerp >= 0 ? 1 : -1;
        const perpX = -sinA * sign;
        const perpZ = cosA * sign;
        
        if (b.y <= 3.0) {
          const vx = perpX * 3.5 + (this.powerupRng ? (this.powerupRng.next() - 0.5) * 2 : 0);
          const vz = perpZ * 3.5 + (this.powerupRng ? (this.powerupRng.next() - 0.5) * 2 : 0);
          this._detachBlock(b, vx, 1.2, vz);
        } else {
          b.state = 'unstable';
          b.damage = 1.0;
          b.failRate = 0;
          this._watchDamage(b);
          this._dirtyComps.add(this._compOf[b.bi]);
        }
        count++;
        if (affectedBlocks.length < 120) {
          affectedBlocks.push({ x: b.x, y: b.y, z: b.z, longDist, perpDist: rawPerp });
        }
        if (count >= 160) break;
      }
    }
    if (count > 0) this._graphDirty = true;
    this.events.push({
      type: 'dragonball_aura',
      x: hole.x,
      z: hole.z,
      radius: hole.radius,
    });
    this.events.push({
      type: 'quake',
      subtype: 'fault_line',
      x: hole.x,
      z: hole.z,
      x0, z0, x1, z1,
      angle,
      length: faultLen,
      radius: faultLen,
      hole,
      affectedBlocks,
    });
  }

  _teleportHoleFromDisaster(hole, disasterType = 'disaster') {
    if (!hole) return;
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const pad = Math.max(6, hole.radius + 2);
    const fromX = hole.x;
    const fromZ = hole.z;

    const midX = (r.minX + r.maxX) * 0.5;
    const midZ = (r.minZ + r.maxZ) * 0.5;
    const targetMinX = fromX > midX ? r.minX + pad : midX;
    const targetMaxX = fromX > midX ? midX : r.maxX - pad;
    const targetMinZ = fromZ > midZ ? r.minZ + pad : midZ;
    const targetMaxZ = fromZ > midZ ? midZ : r.maxZ - pad;

    const rx = this.disasterRng ? this.disasterRng.next() : 0.5;
    const rz = this.disasterRng ? this.disasterRng.next() : 0.5;
    const toX = targetMinX + (targetMaxX - targetMinX) * rx;
    const toZ = targetMinZ + (targetMaxZ - targetMinZ) * rz;

    hole.x = toX;
    hole.z = toZ;
    hole.vx = 0;
    hole.vz = 0;

    this.events.push({
      type: 'disaster_teleport',
      hole,
      fromX,
      fromZ,
      toX,
      toZ,
      disaster: disasterType,
      title: '⚡ DISASTER TELEPORT PENALTY! ⚡',
      sub: 'WARPED ACROSS THE METROPOLIS!',
    });
  }

  _triggerNaturalSeismicDisaster() {
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const cx = (r.minX + r.maxX) * 0.5;
    const cz = (r.minZ + r.maxZ) * 0.5;
    const faultLen = Math.max(r.maxX - r.minX, r.maxZ - r.minZ) * 1.1;
    const angle = this.disasterRng ? (this.disasterRng.next() * 3.14159) : 0.785;
    const cosA = fwCos(angle);
    const sinA = fwSin(angle);
    const x0 = cx - cosA * faultLen * 0.5;
    const z0 = cz - sinA * faultLen * 0.5;
    const x1 = cx + cosA * faultLen * 0.5;
    const z1 = cz + sinA * faultLen * 0.5;

    const crackWidth = 5.0;
    let count = 0;
    const affectedBlocks = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      const dx = b.x - cx;
      const dz = b.z - cz;
      const longDist = dx * cosA + dz * sinA;
      if (Math.abs(longDist) > faultLen * 0.5) continue;
      const rawPerp = -dx * sinA + dz * cosA;
      if (Math.abs(rawPerp) <= crackWidth) {
        const sign = rawPerp >= 0 ? 1 : -1;
        const perpX = -sinA * sign;
        const perpZ = cosA * sign;
        if (b.y <= 3.0) {
          const vx = perpX * 3.2 + (this.disasterRng ? (this.disasterRng.next() - 0.5) * 2 : 0);
          const vz = perpZ * 3.2 + (this.disasterRng ? (this.disasterRng.next() - 0.5) * 2 : 0);
          this._detachBlock(b, vx, 1.4, vz);
        } else {
          b.state = 'unstable';
          b.damage = 1.0;
          b.failRate = 0;
          this._watchDamage(b);
          this._dirtyComps.add(this._compOf[b.bi]);
        }
        count++;
        if (affectedBlocks.length < 120) {
          affectedBlocks.push({ x: b.x, y: b.y, z: b.z, longDist, perpDist: rawPerp });
        }
        if (count >= 180) break;
      }
    }
    if (count > 0) this._graphDirty = true;

    // Check if any hole was struck by the seismic fault fissure
    for (let hi = 0; hi < this.holes.length; hi++) {
      const h = this.holes[hi];
      const dx = h.x - cx;
      const dz = h.z - cz;
      const longDist = dx * cosA + dz * sinA;
      if (Math.abs(longDist) <= faultLen * 0.5) {
        const rawPerp = -dx * sinA + dz * cosA;
        if (Math.abs(rawPerp) <= crackWidth + h.radius) {
          this._teleportHoleFromDisaster(h, 'quake');
        }
      }
    }

    this.events.push({
      type: 'disaster',
      subtype: 'quake',
      name: 'SEISMIC CATACLYSM',
      title: '⚠️ NATURAL DISASTER: SEISMIC QUAKE! ⚠️',
      sub: 'FAULT LINE RUPTURE · BUILDINGS COLLAPSING ACROSS THE CITY!',
      x0, z0, x1, z1,
      angle,
      length: faultLen,
      affectedBlocks,
    });
  }

  _triggerNaturalMeteorDisaster() {
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const strikes = [];
    const strikeCount = 8;
    for (let s = 0; s < strikeCount; s++) {
      const rx = this.disasterRng ? this.disasterRng.next() : (s / strikeCount);
      const rz = this.disasterRng ? this.disasterRng.next() : (s / strikeCount);
      const sx = (r.minX + 10) + (r.maxX - r.minX - 20) * rx;
      const sz = (r.minZ + 10) + (r.maxZ - r.minZ - 20) * rz;
      const radius = 6.5;
      strikes.push({ x: sx, z: sz, radius, delay: s * 0.35 });

      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (b.state !== 'static' && b.state !== 'unstable') continue;
        const dx = b.x - sx;
        const dz = b.z - sz;
        const dist2 = dx * dx + dz * dz;
        if (dist2 <= radius * radius) {
          const dist = Math.sqrt(dist2) || 1;
          const nx = dx / dist;
          const nz = dz / dist;
          const power = (1 - dist / radius);
          if (b.y >= 3.0 || power > 0.6) {
            this._detachBlock(b, nx * power * 5.0, 2.5 + power * 3.0, nz * power * 5.0);
          } else {
            b.state = 'unstable';
            b.damage = 1.0;
            this._watchDamage(b);
            this._dirtyComps.add(this._compOf[b.bi]);
          }
        }
      }
    }
    this._graphDirty = true;

    // Check if any hole was hit by any meteor strike
    for (const strike of strikes) {
      for (let hi = 0; hi < this.holes.length; hi++) {
        const h = this.holes[hi];
        const dist = fwHypot2(h.x - strike.x, h.z - strike.z);
        if (dist <= strike.radius + h.radius) {
          this._teleportHoleFromDisaster(h, 'meteor');
          break;
        }
      }
    }

    this.events.push({
      type: 'disaster',
      subtype: 'meteor',
      name: 'METEOR SHOWER',
      title: '⚠️ NATURAL DISASTER: METEOR SHOWER! ⚠️',
      sub: 'STRATOSPHERIC IMPACTS BOMBARDING THE CITY!',
      strikes,
    });
  }

  _spawnIntermittentPowerUp() {
    const activeGround = this.powerups.filter((p) => !p.collected);
    if (activeGround.length >= MAX_MAP_POWERUPS) return null;
    const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
    const pos = findSpacedPowerUpLocation(this.powerups, r, this.powerupRng, MIN_POWERUP_SEPARATION);
    const angle = this.powerupRng.next() * 6.283185307179586;
    const type = pickRandomPowerUpType(this.powerupRng, this.powerups, this._lastSpawnedPowerUpType);
    this._lastSpawnedPowerUpType = type;
    const pu = createPowerUp(this._nextPowerUpId++, type, pos.x, pos.z, 'intermittent', {
      lifespan: Infinity,
      speed: 2.4,
      angle,
    });
    this.powerups.push(pu);
    return pu;
  }

  _collectPowerupsFor(h) {
    const reach = h.radius + 1.2;
    for (const pu of this.powerups) {
      if (pu.collected || fwHypot2(pu.x - h.x, pu.z - h.z) > reach) continue;
      pu.collected = true;
      // Each consumed powerup queues its own independent 30s cooldown timer
      this.powerupRespawnTimers.push(30.0);
      activatePowerUp(h.activePowerUps, pu, h, this);
      if (pu.type === POWERUP_TYPES.QUAKE) {
        this._triggerVoxelQuake(h);
      }
      this.events.push({ type: 'powerup_collect', powerup: pu, hole: h });
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
  // (physics come from the material, paint is per-block).
  //
  // `s` is either one number (a cube, which is every call site that predates
  // ADR-0013) or `[sx, sy, sz]` (a box). Read positionally rather than
  // destructured so the scalar path allocates nothing — this runs once per
  // block, 82,894 times on Boston alone.
  _block(x, y, z, matType, s = 1, color, surface = undefined) {
    const f = 1 / FINE;
    const a = Array.isArray(s);
    const ex = a ? s[0] : s, ey = a ? s[1] : s, ez = a ? s[2] : s;
    return this._addBlock(
      Math.round(x * f), Math.round(y * f), Math.round(z * f), matType,
      Math.round(ex * f), Math.round(ey * f), Math.round(ez * f), color, surface);
  }

  // nx × ny × nz counts of s-sized blocks starting at (x0, y0, z0) meters.
  // The placement step is the piece extent on each axis, which is the rule
  // `.wiki/modules/voxel.md` states for cubes and which anisotropic pieces make
  // far easier to violate by hand.
  _box(x0, y0, z0, nx, ny, nz, matType, s = 1, color, surface = undefined) {
    const a = Array.isArray(s);
    const ex = a ? s[0] : s, ey = a ? s[1] : s, ez = a ? s[2] : s;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          this._block(x0 + i * ex, y0 + j * ey, z0 + k * ez, matType, s, color, surface);
        }
      }
    }
  }

  _addBlock(fx, fy, fz, matType, fsx, fsy, fsz, color, surface = undefined) {
    const sx = fsx * FINE, sy = fsy * FINE, sz = fsz * FINE;
    const b = {
      id: this._blockId++,
      bi: this.blocks.length, // index into this.blocks; ALWAYS id - 1 (array order == id order)
      gx: fx, gy: fy, gz: fz, // fine coord of the min corner
      fsx, fsy, fsz, sx, sy, sz,
      // Characteristic length: the side of the cube of equal volume. Everything
      // that needs ONE number for a box's size uses this (chunk `sizeAvg`, rim
      // torque, creak timing), so those readings stay comparable across shapes.
      // The cube case is taken from `sx` rather than computed, because
      // `Math.cbrt` is implementation-approximated in the spec and every
      // existing scene is cubes — this makes their bit-identity structural
      // instead of a property of whichever cbrt the engine ships.
      sAvg: fsx === fsy && fsy === fsz ? sx : fwCbrt(sx * sy * sz),
      x: (fx + fsx / 2) * FINE, y: (fy + fsy / 2) * FINE, z: (fz + fsz / 2) * FINE,
      vx: 0, vy: 0, vz: 0,
      rotX: 0, rotZ: 0, vRotX: 0, vRotZ: 0,
      matType, mat: MATERIALS[matType],
      color: color ?? MATERIALS[matType].color,
      surface: surface || undefined,
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
    for (let i = 0; i < fsx; i++) {
      for (let j = 0; j < fsy; j++) {
        for (let k = 0; k < fsz; k++) {
          this.grid.set(key(fx + i, fy + j, fz + k), b);
        }
      }
    }
    return b;
  }

  _buildScene() {
    // =========================================================================
    // ZONE 1 (WEST: x: -85..-35) — OUR VOXEL MODELS WITH KENNEY TEXTURES
    // =========================================================================

    // Suburban Row (West): 3 Pastel Cottages with wood siding & scalloped clay tiles
    {
      const ox = -75, oz = -8;
      for (let x = 0; x < 5; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 3;
        const isWin = edge && (x + z) % 2 === 1;
        this._block(ox + x, 0, oz + z, 'concrete', 1, 0xfcf6bd, 'mat_suburban_siding');
        this._block(ox + x, 1, oz + z, isWin ? 'glass' : 'concrete', 1, isWin ? 0x83c5be : 0xfcf6bd, isWin ? 'mat_shop_window' : 'mat_suburban_siding');
        this._block(ox + x, 2, oz + z, 'wood', 1, 0xe07a5f, 'mat_clay_shingles');
      }
      this._box(ox + 1, 3, oz + 1, 3, 1, 2, 'wood', 1, 0xd95d39, 'mat_clay_shingles');
    }
    {
      const ox = -65, oz = -8;
      for (let x = 0; x < 5; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 3;
        const isWin = edge && (x + z) % 2 === 1;
        this._block(ox + x, 0, oz + z, 'concrete', 1, 0xd8f3dc, 'mat_suburban_siding');
        this._block(ox + x, 1, oz + z, isWin ? 'glass' : 'concrete', 1, isWin ? 0x74c69d : 0xd8f3dc, isWin ? 'mat_shop_window' : 'mat_suburban_siding');
        this._block(ox + x, 2, oz + z, 'wood', 1, 0x40916c, 'mat_clay_shingles');
      }
      this._box(ox + 1, 3, oz + 1, 3, 1, 2, 'wood', 1, 0x2d6a4f, 'mat_clay_shingles');
    }
    {
      const ox = -55, oz = -8;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 3;
        const isWin = edge && (x + z) % 2 === 1;
        this._block(ox + x, 0, oz + z, 'concrete', 1, 0xcae9ff, 'mat_suburban_siding');
        this._block(ox + x, 1, oz + z, isWin ? 'glass' : 'concrete', 1, isWin ? 0x5fa8d3 : 0xcae9ff, isWin ? 'mat_shop_window' : 'mat_suburban_siding');
        this._block(ox + x, 2, oz + z, 'wood', 1, 0x1b4965, 'mat_clay_shingles');
      }
      this._box(ox + 1, 3, oz + 1, 2, 1, 2, 'wood', 1, 0x1b4965, 'mat_clay_shingles');
    }

    // Commercial Shopping Boulevard (West): Bakery, Pizzeria, Bookstore with candy striped awnings
    {
      const ox = -75, oz = 4;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
        this._block(ox + x, 0, oz + z, 'concrete', 1, 0xffddd2, 'mat_suburban_siding');
        this._block(ox + x, 1, oz + z, 'concrete', 1, 0xffddd2, 'mat_suburban_siding');
        this._block(ox + x, 2, oz + z, 'wood', 1, 0x0077b6, 'mat_clay_shingles');
      }
      this._box(ox + 1, 3, oz + 1, 2, 1, 1, 'wood', 1, 0x023e8a, 'mat_clay_shingles');
      for (let x = 0; x < 4; x++) this._block(ox + x, 1, oz - 1, 'panel', 1, 0xe63946, 'mat_awning_stripe');
    }
    {
      const ox = -65, oz = 4;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
        this._block(ox + x, 0, oz + z, 'concrete', 1, 0xfefae0, 'mat_suburban_siding');
        this._block(ox + x, 1, oz + z, 'concrete', 1, 0xfefae0, 'mat_suburban_siding');
        this._block(ox + x, 2, oz + z, 'wood', 1, 0x2b9348, 'mat_clay_shingles');
      }
      this._box(ox + 1, 3, oz + 1, 2, 1, 1, 'wood', 1, 0x007f5f, 'mat_clay_shingles');
      for (let x = 0; x < 4; x++) this._block(ox + x, 1, oz - 1, 'panel', 1, 0x55a630, 'mat_awning_stripe');
    }
    {
      const ox = -55, oz = 4;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
        this._block(ox + x, 0, oz + z, 'concrete', 1, 0xffe5d9, 'mat_suburban_siding');
        this._block(ox + x, 1, oz + z, 'concrete', 1, 0xffe5d9, 'mat_suburban_siding');
        this._block(ox + x, 2, oz + z, 'wood', 1, 0xe76f51, 'mat_clay_shingles');
      }
      this._box(ox + 1, 3, oz + 1, 2, 1, 1, 'wood', 1, 0xf4a261, 'mat_clay_shingles');
      for (let x = 0; x < 4; x++) this._block(ox + x, 1, oz - 1, 'panel', 1, 0xf3722c, 'mat_awning_stripe');
    }

    // Twin 2m Warehouses (West)
    {
      const ox = -80, oz = 16, S = 2;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 2;
        const corner = (x === 0 || x === 3) && (z === 0 || z === 2);
        for (let y = 0; y < 3; y++) {
          if (!edge) continue;
          this._block(ox + x * S, y * S, oz + z * S, corner ? 'steel' : 'concrete', S, corner ? 0x588157 : 0xdde5b6, corner ? 'mat_warehouse_roll' : 'mat_suburban_siding');
        }
        this._block(ox + x * S, 3 * S, oz + z * S, 'wood', S, 0x4a5759, 'mat_clay_shingles');
      }
    }
    {
      const ox = -60, oz = 16, S = 2;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 3;
        const corner = (x === 0 || x === 3) && (z === 0 || z === 3);
        for (let y = 0; y < 3; y++) {
          if (!edge) continue;
          this._block(ox + x * S, y * S, oz + z * S, corner ? 'steel' : 'concrete', S, corner ? 0x3d5a80 : 0xe0fbfc, corner ? 'mat_corrugated_rust' : 'mat_suburban_siding');
        }
        this._block(ox + x * S, 3 * S, oz + z * S, 'wood', S, 0x293241, 'mat_clay_shingles');
      }
    }

    // Civic Plaza & Fountain (West)
    {
      const ox = -75, oz = -18;
      this._box(ox, 0, oz, 4, 1, 4, 'concrete', 1, 0xe9ecef, 'mat_suburban_siding');
      this._block(ox + 1, 1, oz + 1, 'steel', 1, 0xced4da);
      this._block(ox + 2, 1, oz + 1, 'steel', 1, 0xced4da);
      this._block(ox + 1, 1, oz + 2, 'steel', 1, 0xced4da);
      this._block(ox + 2, 1, oz + 2, 'steel', 1, 0xced4da);
      this._block(ox + 1, 2, oz + 1, 'steel', 1, 0xced4da);
      this._block(ox + 1, 3, oz + 1, 'glass', 1, 0x3fa7d6, 'mat_shop_window');
    }
    // Water Tower & Apartment (West)
    {
      const ox = -65, oz = -18;
      this._box(ox, 0, oz, 4, 2, 4, 'brick', 1, 0xb56576, 'mat_brick_red');
      this._box(ox, 2, oz, 4, 1, 4, 'concrete', 1, 0xe56b6f, 'mat_suburban_siding');
      for (const [lx, lz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) this._block(ox + lx, 3, oz + lz, 'wood', 1, 0x6d597a);
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 2;
        if (edge) this._block(ox + x, 4, oz + z, 'wood', 1, 0x355070, 'mat_suburban_siding');
        this._block(ox + x, 5, oz + z, 'wood', 1, 0x355070, 'mat_clay_shingles');
      }
    }
    {
      const ox = -55, oz = -18;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 5 || z === 0 || z === 3;
        const isSlab = y % 2 === 0;
        if (!edge && !isSlab) continue;
        const isWin = edge && !isSlab && (x + z + y) % 3 === 0;
        this._block(ox + x, y, oz + z, isWin ? 'glass' : 'brick', 1, isWin ? 0x90e0ef : 0xc8553d, isWin ? 'mat_shop_window' : 'mat_brick_red');
      }
      this._box(ox, 5, oz, 6, 1, 4, 'wood', 1, 0x582f0e, 'mat_clay_shingles');
    }

    // 50s Diner & Gas Station (West)
    {
      const ox = -75, oz = -28;
      for (let x = 0; x < 5; x++) for (let z = 0; z < 4; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 3;
        const corner = (x === 0 || x === 4) && (z === 0 || z === 3);
        if (!edge) continue;
        this._block(ox + x, 0, oz + z, corner ? 'steel' : 'panel', 1, corner ? 0xadb5bd : 0xffafcc, 'mat_suburban_siding');
        const isWin = !corner && (z === 0 || x === 0);
        this._block(ox + x, 1, oz + z, isWin ? 'glass' : (corner ? 'steel' : 'panel'), 1, isWin ? 0xa2d2ff : (corner ? 0xadb5bd : 0xffafcc), isWin ? 'mat_shop_window' : 'mat_suburban_siding');
      }
      this._box(ox, 2, oz, 5, 1, 4, 'panel', 1, 0xffc8dd, 'mat_awning_stripe');
    }
    {
      const ox = -60, oz = -28;
      for (const [px, pz] of [[0, 0], [4, 0], [0, 3], [4, 3]]) {
        this._block(ox + px, 0, oz + pz, 'steel', 1, 0x0077b6);
        this._block(ox + px, 1, oz + pz, 'steel', 1, 0x0077b6);
      }
      this._box(ox, 2, oz, 5, 1, 4, 'panel', 1, 0xf77f00, 'mat_awning_stripe');
      this._box(ox + 1, 0, oz + 1, 2, 1, 2, 'concrete', 1, 0xfcfbf4, 'mat_suburban_siding');
      this._box(ox + 1, 1, oz + 1, 2, 1, 2, 'glass', 1, 0x90e0ef, 'mat_shop_window');
      for (const px of [3.5, 4.0]) {
        this._block(ox + px, 0, oz + 2, 'steel', 0.5, 0x212529);
        this._block(ox + px, 0.5, oz + 2, 'panel', 0.5, 0xd62828, 'mat_warehouse_roll');
      }
    }

    // West Vehicles
    sedan(this, -75, -2, 0xe63946, 0xe63946, 'x', 'mat_awning_stripe', 'mat_shop_window');
    sedan(this, -65, -2, 0x8338ec, 0x8338ec, 'x', undefined, 'mat_shop_window');
    sedan(this, -55, -2, 0x06d6a0, 0x06d6a0, 'x', 'mat_suburban_siding', 'mat_shop_window');
    bus(this, -70, 10, 0x4361ee, 'x', 'mat_awning_stripe', 'mat_shop_window');
    bigTruck(this, -55, 10, 0xc22a1c, true, 'mat_warehouse_roll', 'mat_shop_window');

    // =========================================================================
    // ZONE 2 (CENTER: x: -25..+25) — KENNEY MODELS WITH DYNAMIC BREAK-APART
    // =========================================================================

    // Reference Tower & Central Plaza (Center)
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
            let mat = 'concrete', surf = 'mat_suburban_siding', col = 0xf2ebd9;
            if (isCorner || isColumn) { mat = 'steel'; surf = 'mat_warehouse_roll'; col = 0x606c38; }
            else if (y === layers - 1) { mat = 'wood'; surf = 'mat_clay_shingles'; col = 0xbc6c25; }
            else if (isOuterWall && !isSlab && ((z === 0 || z === rows - 1) ? x % 2 === 1 : z % 2 === 1)) {
              mat = 'glass'; surf = 'mat_shop_window'; col = 0x8ecae6;
            } else if (isOuterWall && !isSlab) {
              mat = 'brick'; surf = 'mat_brick_red'; col = 0xcc5a47;
            }
            this._block(ox + x, y, oz + z, mat, 1, col, surf);
          }
        }
      }
    }

    // 2m Warehouse A & Crate Pyramids (Center)
    {
      const ox = 8, oz = 8, S = 2;
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 2;
        const corner = (x === 0 || x === 3) && (z === 0 || z === 2);
        for (let y = 0; y < 3; y++) {
          if (!edge) continue;
          this._block(ox + x * S, y * S, oz + z * S, corner ? 'steel' : 'concrete', S, corner ? 0x588157 : 0xdde5b6, corner ? 'mat_warehouse_roll' : 'mat_suburban_siding');
        }
        this._block(ox + x * S, 3 * S, oz + z * S, 'wood', S, 0x4a5759, 'mat_clay_shingles');
      }
    }
    {
      const ox = -11, oz = 8;
      this._box(ox, 0, oz, 4, 1, 4, 'loose', 1, 0xd4a373, 'mat_suburban_siding');
      this._box(ox, 1, oz, 3, 1, 3, 'loose', 1, 0xccd5ae, 'mat_suburban_siding');
      this._box(ox, 2, oz, 2, 1, 2, 'loose', 1, 0xfaedcd, 'mat_suburban_siding');
      this._block(ox, 3, oz, 'loose', 1, 0xd4a373, 'mat_suburban_siding');
    }

    // Kenney Suburban Villa (Center-West) with detachable garage & chimney
    {
      const ox = -20, oz = -14;
      this._box(ox, 0, oz, 6, 1, 5, 'concrete', 1, 0xf8f9fa, 'mat_suburban_siding');
      this._box(ox, 1, oz, 6, 1, 5, 'concrete', 1, 0xf8f9fa, 'mat_suburban_siding');
      this._box(ox, 2, oz, 6, 1, 5, 'wood', 1, 0x495057, 'mat_clay_shingles');
      // Detachable Garage
      this._box(ox + 6, 0, oz, 3, 1, 4, 'steel', 1, 0xced4da, 'mat_warehouse_roll');
      this._box(ox + 6, 1, oz, 3, 1, 4, 'steel', 1, 0xced4da, 'mat_warehouse_roll');
      this._box(ox + 6, 2, oz, 3, 1, 4, 'wood', 1, 0x343a40, 'mat_clay_shingles');
      // Detachable Brick Chimney
      for (let y = 0; y <= 4; y++) this._block(ox - 1, y, oz + 2, 'brick', 1, 0xcc5a47, 'mat_brick_red');
    }

    // Brownstone & Parking Garage (Center-West)
    {
      const ox = -15, oz = 6;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 3 || z === 0 || z === 2;
        if (!edge) continue;
        const isWin = y === 1 && (x === 1 || x === 2) && z === 0;
        this._block(ox + x, y, oz + z, isWin ? 'glass' : 'brick', 1, isWin ? 0xade8f4 : 0x9c6644, isWin ? 'mat_shop_window' : 'mat_brick_red');
      }
      this._box(ox, 3, oz, 4, 1, 3, 'wood', 1, 0x7f4f24, 'mat_clay_shingles');
      this._block(ox + 1, 0, oz - 1, 'concrete', 1, 0xddb892, 'mat_suburban_siding');
    }
    {
      const ox = -22, oz = 6;
      const cols = [[0, 0], [2, 0], [4, 0], [0, 2], [4, 2], [0, 4], [2, 4], [4, 4]];
      for (const level of [0, 2, 4]) {
        for (const [cx, cz] of cols) this._block(ox + cx, level, oz + cz, 'steel', 1, 0x6c757d);
        this._box(ox, level + 1, oz, 5, 1, 5, 'concrete', 1, 0xe9ecef, 'mat_suburban_siding');
      }
    }

    // Gas Station (Center-East)
    {
      const ox = 19, oz = 10;
      for (const [px, pz] of [[0, 0], [4, 0], [0, 3], [4, 3]]) {
        this._block(ox + px, 0, oz + pz, 'steel', 1, 0x0077b6);
        this._block(ox + px, 1, oz + pz, 'steel', 1, 0x0077b6);
      }
      this._box(ox, 2, oz, 5, 1, 4, 'panel', 1, 0xf77f00, 'mat_awning_stripe');
      this._box(ox + 1, 0, oz + 1, 2, 1, 2, 'concrete', 1, 0xfcfbf4, 'mat_suburban_siding');
      this._box(ox + 1, 1, oz + 1, 2, 1, 2, 'glass', 1, 0x90e0ef, 'mat_shop_window');
      for (const px of [3.5, 4.0]) {
        this._block(ox + px, 0, oz + 2, 'steel', 0.5, 0x212529);
        this._block(ox + px, 0.5, oz + 2, 'panel', 0.5, 0xd62828, 'mat_warehouse_roll');
      }
    }

    // Construction Crane & Shipping Containers (Center NE)
    this._box(11, 0, -13, 2, 1, 2, 'concrete', 1, 0x8d99ae, 'mat_suburban_siding');
    for (let y = 1; y <= 6; y++) this._block(11, y, -13, 'steel', 1, 0xffb703);
    this._block(12, 6, -13, 'steel', 1, 0xffb703); this._block(13, 6, -13, 'steel', 1, 0xffb703); this._block(14, 6, -13, 'steel', 1, 0xffb703);
    this._block(10, 6, -13, 'steel', 1, 0xffb703); this._block(9, 6, -13, 'concrete', 1, 0x495057);
    const cont = (x, y, z, c) => {
      this._block(x, y, z, 'steel', 1, c, 'mat_warehouse_roll');
      this._block(x + 1, y, z, 'steel', 1, c, 'mat_warehouse_roll');
    };
    cont(22, 0, -11, 0xd96c2c); cont(24, 0, -11, 0x2a5f9a);
    cont(22, 1, -11, 0x2a5f9a); cont(24, 1, -11, 0xd96c2c);

    // Kenney Commercial Plaza (Center-East) with cantilevered marquee
    {
      const ox = 12, oz = -14;
      this._box(ox, 0, oz, 8, 1, 5, 'concrete', 1, 0xfff1e6, 'mat_suburban_siding');
      this._box(ox, 1, oz, 8, 1, 5, 'concrete', 1, 0xfff1e6, 'mat_suburban_siding');
      this._box(ox, 2, oz, 8, 1, 5, 'wood', 1, 0x2b2d42, 'mat_clay_shingles');
      for (let x = 0; x < 8; x++) this._block(ox + x, 1, oz - 1, 'panel', 1, 0x3a86ff, 'mat_awning_stripe');
    }

    // Kenney Break-Apart Vehicle Fleet (Center)
    sedan(this, -18, -2, 0xe8ecf2, 0x2a2f3a, 'x', undefined, 'mat_shop_window'); // Police Cruiser with lightbar
    kenneySUV(this, -10, -2, 0x1d3557, 'x', 'mat_suburban_siding', 'mat_shop_window'); // Luxury SUV
    sedan(this, 2, -2, 0xf7c948, 0x1d3557, 'x', undefined, 'mat_shop_window'); // Yellow Taxi
    kenneySUV(this, 10, -2, 0x9b5de5, 'x', 'mat_awning_stripe', 'mat_shop_window'); // Sport SUV
    boxVan(this, 18, -2, 5, 0xf2f2f2, 0x028090, 'x', 'mat_warehouse_roll', 'mat_shop_window'); // Delivery Van
    sedan(this, 8, 3.5, 0x3a86ff, 0x3a86ff, 'x', 'mat_awning_stripe', 'mat_shop_window'); // Blue Coupe
    bus(this, 16, 3.5, 0x4361ee, 'x', 'mat_awning_stripe', 'mat_shop_window'); // City Bus
    bigTruck(this, 8, -6, 0x2e5d3a, false, 'mat_corrugated_rust', 'mat_shop_window'); // Garbage Truck
    bigTruck(this, 16, -6, 0xc22a1c, true, 'mat_warehouse_roll', 'mat_shop_window'); // Fire Engine

    // Street Furniture & Props (Center)
    const F = (x, y, z, m, c, surf) => this._block(x, y, z, m, 0.25, c, surf);
    const B25 = (x0, y0, z0, nx, ny, nz, m, c, surf) => this._box(x0, y0, z0, nx, ny, nz, m, 0.25, c, surf);
    B25(-11.25, 0, 12.75, 2, 3, 2, 'panel', 0xd90429);
    F(-11.125, 0.75, 12.875, 'panel', 0xd90429);
    F(-11.5, 0.375, 12.875, 'panel', 0xd90429); F(-10.75, 0.375, 12.875, 'panel', 0xd90429);
    F(-5.25, 0, 12.875, 'steel'); F(-4.75, 0, 12.875, 'steel');
    B25(-5.25, 0.25, 12.75, 2, 3, 2, 'panel', 0x2a4f9a);
    B25(-5.25, 1, 12.75, 2, 1, 2, 'panel', 0x2a4f9a);
    B25(-2.25, 0, 12.875, 1, 2, 1, 'steel'); B25(-1.25, 0, 12.875, 1, 2, 1, 'steel');
    B25(-2.5, 0.5, 12.75, 4, 1, 2, 'wood', 0x8b5e34, 'mat_suburban_siding');
    B25(-2.5, 0.75, 12.75, 4, 2, 1, 'wood', 0x8b5e34, 'mat_suburban_siding');
    F(10.75, 0, 14.75, 'rubber'); F(11.75, 0, 14.75, 'rubber');
    B25(10.75, 0.25, 14.75, 4, 2, 2, 'panel', 0xf7c948);
    B25(11.5, 0.75, 14.875, 1, 4, 1, 'steel');
    B25(11, 1.75, 14.5, 3, 1, 3, 'panel', 0xc23b2e, 'mat_awning_stripe');
    B25(-8.5, 0, 12.25, 4, 3, 3, 'panel', 0x2e4d3a);
    B25(-8.75, 0.75, 12, 5, 1, 4, 'panel', 0x2e4d3a, 'mat_awning_stripe');

    // Elevated 3-Car Passenger Train on Viaduct Bridge (Center S)
    {
      const Z0 = 22;
      for (let x = -24; x <= 24; x += 4) {
        for (const cz of [24, 25]) for (let y = 0; y < 3; y++) this._block(x, y, cz, 'steel', 1, 0x2b2d42);
        for (let w = 0; w < 6; w++) this._block(x, 3, Z0 + w, 'steel', 1, 0x8d99ae);
      }
      for (let x = -24; x <= 24; x += 0.5) {
        for (let w = 0; w < 12; w++) this._block(x, 4, Z0 + w * 0.5, 'concrete', 0.5, 0xedf2f4, 'mat_suburban_siding');
      }
      for (let x = -24; x <= 24; x += 2) {
        this._block(x, 4.5, Z0, 'steel', 0.5, 0x2b2d42);
        this._block(x, 4.5, Z0 + 5.5, 'steel', 0.5, 0x2b2d42);
      }
      for (let x = -24; x < 24; x += 0.5) {
        this._block(x, 5, Z0, 'steel', 0.5, 0xd90429);
        this._block(x, 5, Z0 + 5.5, 'steel', 0.5, 0xd90429);
      }
      this._box(-8, 4.5, 23.5, 5, 2, 2, 'panel', 0.5, 0xef233c, 'mat_awning_stripe');
      this._box(-2, 4.5, 23.5, 5, 2, 2, 'panel', 0.5, 0x3a86ff, 'mat_awning_stripe');
      this._box(4, 4.5, 23.5, 5, 2, 2, 'panel', 0.5, 0xffb703, 'mat_awning_stripe');
    }

    // =========================================================================
    // ZONE 3 (EAST: x: +35..+85) — MODIFIED KENNEY MEGA SKYSCRAPERS (18m–32m)
    // =========================================================================

    // Skyscraper Alpha: Kenney Commercial Tower (24m / 24 floors) with 4m Radio Spire
    kenneySkyscraper(this, 36, -14, 8, 8, 24, 0x3d5a80, 0xee6c4d, 'helipad');

    // Skyscraper Beta: Kenney Plaza Monolith (30m / 30 floors) with Rooftop Helipad
    kenneySkyscraper(this, 54, -14, 8, 8, 30, 0x293241, 0xf4a261, 'helipad');

    // Skyscraper Gamma: Kenney Twin Corporate Headquarters (22m / 22 floors) with Cooling Units
    kenneySkyscraper(this, 72, -14, 8, 8, 22, 0x457b9d, 0xe76f51, 'cooling');

    // Skyscraper Delta: Kenney Financial Center (26m / 26 floors)
    kenneySkyscraper(this, 44, 8, 8, 8, 26, 0x1d3557, 0x06d6a0, 'cooling');

    // Skyscraper Epsilon: Kenney Grand Plaza Suites (20m / 20 floors)
    kenneySkyscraper(this, 66, 8, 8, 8, 20, 0x2b2d42, 0xffb703, 'helipad');

    // East Skyscraper District Avenue Fleet
    sedan(this, 40, -2, 0xf7c948, 0x1d3557, 'x', undefined, 'mat_shop_window'); // Taxi
    sedan(this, 52, -2, 0x3a86ff, 0x3a86ff, 'x', 'mat_awning_stripe', 'mat_shop_window'); // Executive Coupe
    kenneySUV(this, 64, -2, 0x111111, 'x', undefined, 'mat_shop_window'); // Black SUV
    bus(this, 48, 20, 0xfb8500, 'x', 'mat_awning_stripe', 'mat_shop_window'); // City Double-Decker Transit
    bigTruck(this, 68, 20, 0x457b9d, false, 'mat_corrugated_rust', 'mat_shop_window'); // Cargo Freight Hauler

    // --- STREET TREES & LAMP POSTS ACROSS ALL 3 ZONES -----------------------
    for (const [tx, tz] of [
      [-80, -12], [-60, -12], [-40, -12], [-28, -6], [0, -10], [24, -6], [38, -6], [60, -6], [80, -6],
      [-80, 12], [-60, 12], [-40, 12], [-28, 16], [0, 20], [24, 16], [40, 24], [60, 24], [80, 24]
    ]) tree(this, tx, tz);

    for (const [lx, lz] of [
      [-80, 4], [-60, 4], [-40, 4], [-20, 4], [0, 4], [20, 4], [40, 4], [60, 4], [80, 4],
      [-80, -4], [-60, -4], [-40, -4], [-20, -4], [0, -4], [20, -4], [40, -4], [60, -4], [80, -4],
      [-70, 22], [-30, 22], [10, 22], [50, 22], [70, 22],
      [-70, -22], [-30, -22], [10, -22], [50, -22], [70, -22]
    ]) lampPost(this, lx, lz);

    // Dynamic Player Movement Bounds for the 3-Tier Showcase (190m × 90m total area)
    this.bounds = 95;
    this.boundsRect = { minX: -95, maxX: 95, minZ: -45, maxZ: 45 };

    // --- FULL GROUND DECOR ROAD & SIDEWALK NETWORK ---------------------------
    const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [];
    const roads = [], rail = [], bikePaths = [], laneMarkers = [], crosswalks = [];
    const water = [], boardwalk = [];

    // Base ground surfaces
    parks.push({ x: -95, z: -45, w: 190, d: 90, color: 0x386641 }); // Lush green base terrain
    plaza.push({ x: -85, z: -35, w: 50, d: 70, color: 0x4a4e69 });  // Zone 1 West Plaza
    plaza.push({ x: -25, z: -35, w: 50, d: 70, color: 0x3d5a80 });  // Zone 2 Center Plaza
    plaza.push({ x: 30, z: -35, w: 60, d: 70, color: 0x293241 });   // Zone 3 East Metropolis Plaza

    // East-West Main Thoroughfares
    roads.push({ x: -95, z: -6, w: 190, d: 8, color: 0x1c2030 });    // Boulevard North
    roads.push({ x: -95, z: 12, w: 190, d: 8, color: 0x1c2030 });    // Boulevard South
    roads.push({ x: -95, z: -24, w: 190, d: 6, color: 0x2b2d42 });   // Service Lane North

    // North-South Cross-Town Avenues
    roads.push({ x: -60, z: -45, w: 6, d: 90, color: 0x1c2030 });
    roads.push({ x: -26, z: -45, w: 6, d: 90, color: 0x1c2030 });
    roads.push({ x: 0, z: -45, w: 6, d: 90, color: 0x1c2030 });
    roads.push({ x: 32, z: -45, w: 6, d: 90, color: 0x1c2030 });
    roads.push({ x: 62, z: -45, w: 6, d: 90, color: 0x1c2030 });

    // Sidewalks flanking avenues
    sidewalks.push({ x: -95, z: -8, w: 190, d: 2, color: 0x6c757d });
    sidewalks.push({ x: -95, z: 2, w: 190, d: 2, color: 0x6c757d });
    sidewalks.push({ x: -95, z: 10, w: 190, d: 2, color: 0x6c757d });
    sidewalks.push({ x: -95, z: 20, w: 190, d: 2, color: 0x6c757d });

    // Yellow Dashed Lane Dividers
    for (let x = -90; x < 90; x += 6) {
      laneMarkers.push({ x: x, z: -2.2, w: 3.5, d: 0.4, color: 0xf7c948 });
      laneMarkers.push({ x: x, z: 15.8, w: 3.5, d: 0.4, color: 0xf7c948 });
    }

    // Zebra Crosswalks at all 5 intersections
    const zebra = (x0, z0, w, d, horiz = true) => {
      if (horiz) for (let z = z0; z < z0 + d; z += 1.2) crosswalks.push({ x: x0, z: z, w: w, d: 0.6, color: 0xffffff });
      else for (let x = x0; x < x0 + w; x += 1.2) crosswalks.push({ x: x, z: z0, w: 0.6, d: d, color: 0xffffff });
    };
    for (const cx of [-60, -26, 0, 32, 62]) {
      zebra(cx - 5, -6, 2, 8, true);
      zebra(cx + 9, -6, 2, 8, true);
      zebra(cx - 5, 12, 2, 8, true);
      zebra(cx + 9, 12, 2, 8, true);
    }

    // Rail Bed under Elevated Viaduct
    rail.push({ x: -95, z: 22, w: 190, d: 6, color: 0x3a3128 });

    this.sceneDecor = {
      parks, sand, plaza, cobbles, sidewalks, roads, rail,
      bikePaths, laneMarkers, crosswalks, water, boardwalk,
    };

    this.sceneSurfaces = {
      brick: 'mat_brick_red',
      glass: 'mat_shop_window',
      concrete: 'mat_suburban_siding',
      steel: 'mat_warehouse_roll',
      panel: 'mat_awning_stripe',
      wood: 'mat_clay_shingles',
    };
  }

  // Neighbors are found by scanning each face's fine cells, so mixed-size
  // blocks connect wherever their faces touch (a 2 m slab borders four 1 m
  _buildNeighbors() {
    for (const b of this.blocks) {
      const g = [b.gx, b.gy, b.gz];
      const e = [b.fsx, b.fsy, b.fsz]; // extents indexed the same way as `g`
      const found = new Set();
      for (const [dx, dy, dz] of DIRS) {
        const a = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
        const sign = dx + dy + dz;
        const fixed = sign > 0 ? g[a] + e[a] : g[a] - 1;
        const i1 = (a + 1) % 3, i2 = (a + 2) % 3;
        for (let u = 0; u < e[i1]; u++) {
          for (let v = 0; v < e[i2]; v++) {
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
        const x0 = Math.floor((b.x - b.sx / 2) / ZONE_CELL), x1 = Math.floor((b.x + b.sx / 2) / ZONE_CELL);
        const z0 = Math.floor((b.z - b.sz / 2) / ZONE_CELL), z1 = Math.floor((b.z + b.sz / 2) / ZONE_CELL);
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

  // Track which meter cells one hole's opening currently covers; support is
  // only recalculated when some hole's coverage or the graph changes — not
  // every frame. The two sets live on the hole and are swapped rather than
  // reallocated: this runs every step for every hole.
  _coverageChanged(h) {
    const remR = h.radius * REMOVAL_FRAC;
    const next = h._covSpare;
    next.clear();
    for (let gx = Math.floor(h.x - remR); gx <= Math.floor(h.x + remR); gx++) {
      for (let gz = Math.floor(h.z - remR); gz <= Math.floor(h.z + remR); gz++) {
        const cx = gx + 0.5 - h.x, cz = gz + 0.5 - h.z;
        if (cx * cx + cz * cz <= remR * remR) next.add(gx + ',' + gz);
      }
    }
    const cov = h._cov;
    if (next.size === cov.size) {
      let same = true;
      for (const c of next) if (!cov.has(c)) { same = false; break; }
      if (same) return false;
    }
    h._covSpare = cov;
    h._cov = next;
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
  // call are re-included so blocks every hole has LEFT get reset (supportRatio
  // back to 1, hanging cleared) exactly as a whole-scene pass would. With more
  // than one hole the influence set is the UNION over holes, gathered in
  // hole-index order so the prox list — and therefore the recalc order — is
  // deterministic.
  _markDirtyZones(hp) {
    const mark = this._compMark;
    const list = this._dirtyList || (this._dirtyList = []);
    list.length = 0;
    for (const c of this._dirtyComps) { if (!mark[c]) { mark[c] = 1; list.push(c); } }
    for (let i = 0; i < this._prevProx.length; i++) {
      const c = this._prevProx[i];
      if (!mark[c]) { mark[c] = 1; list.push(c); }
    }
    const proxMark = this._proxMark;
    const prox = [];
    for (let hi = 0; hi < hp.length; hi++) {
      const p = hp[hi], h = p.h;
      const R = Math.max(p.instabR, p.remR + HANG_REACH * p.hangScale);
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
    }
    for (let i = 0; i < prox.length; i++) proxMark[prox[i]] = 0;
    this._prevProx = prox;
    this._dirtyComps.clear();
    return list;
  }

  _recalcSupport() {
    const blocks = this.blocks;
    // Per-hole derived radii (remR/instabR/hangScale), hole-index order. The
    // reach SCALES with each hole: at SIZE 1 the creak zone hugs the visible
    // rim (~0.5 m past it) instead of pre-failing facades 4-5 m away; at max
    // radius it behaves as before (remR + span + 1.5).
    const hp = this._holeParams();
    const nh = hp.length;
    // Failure timing: the shipped sandbox setting is instant (creak <= 0), so
    // the player sees a block let go on the first step after support loss.
    // A positive dev tuning value restores the readable rim → center delay:
    // hanging rim blocks creak first, unsupported blocks follow the wave.
    const instantCollapse = this.tune.creak <= 0;

    const dirty = this._markDirtyZones(hp);
    const spanVal = this._spanVal, spanHas = this._spanHas, hang = this._hang;
    const frontVal = this._frontVal, frontHas = this._frontHas;
    const dq = this._dq, fq = this._fq;

    for (let ci = 0; ci < dirty.length; ci++) {
      const cbl = this._compBlocks[dirty[ci]], cfl = this._compFloor[dirty[ci]];

      // Rim support percentage: floor blocks near a rim sample their 4 base
      // corners against the openings. <30% supported = no floor anchor anymore.
      //
      // MULTI-HOLE: a corner is unsupported only when it lies outside EVERY
      // hole's removal disc, and a block resets to full support only when it is
      // outside EVERY hole's instability radius. This is the union rule that
      // retires the duel-era artifact where one hole's recalc partially healed
      // the rim the other hole was undermining — undermining is now resolved
      // once per step against all holes at once.
      for (let k = 0; k < cfl.length; k++) {
        const b = blocks[cfl[k]];
        if (b.state === 'consumed' || b.state === 'falling') continue;
        let near = false;
        for (let hi = 0; hi < nh; hi++) {
          const p = hp[hi];
          const dx = b.x - p.h.x, dz = b.z - p.h.z;
          if (dx * dx + dz * dz <= p.instabR2) { near = true; break; }
        }
        if (!near) { this._clearLean(b); b.supportRatio = 1; continue; }
        // Corner inset per axis: it is the block's PLAN rectangle that is
        // sampled, so a long thin kerb is tested at its ends, not at a square
        // derived from one scalar side.
        const ox = b.sx / 2 - 0.05, oz = b.sz / 2 - 0.05;
        let outside = 0;
        for (let ci = 0; ci < 4; ci++) {
          // corner order: (-,-) (+,-) (+,+) (-,+) — a pure count, order-free
          const cx = (ci === 1 || ci === 2) ? b.x + ox : b.x - ox;
          const cz = ci >= 2 ? b.z + oz : b.z - oz;
          let inside = false;
          for (let hi = 0; hi < nh; hi++) {
            const p = hp[hi];
            const px = cx - p.h.x, pz = cz - p.h.z;
            if (px * px + pz * pz <= p.remR2) { inside = true; break; }
          }
          if (!inside) outside++;
        }
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
          if (nb.gy + nb.fsy <= cur.gy) continue; // entirely below — support never flows downward
          let ns;
          if (nb.gy >= cur.gy + cur.fsy) {
            if (cur.mat.vertBond < BOND_CARRY) continue;
            ns = 0;
          } else {
            if (cur.mat.horizBond < BOND_CARRY) continue;
            // SPAN HOP, ADR-0013 P2.4. The cost of a horizontal hop is the
            // centre-to-centre distance ALONG THE AXIS CROSSED — for cubes that
            // is `(cur.s + nb.s) / 2` whichever way you go, which is why this
            // line was direction-independent before boxes existed.
            //
            // `neighbors` is an unordered Set that never recorded direction, so
            // the axis is recovered here from the two fine AABBs. It costs four
            // integer adds and four compares on data already in hand: no
            // allocation, no second pass, no lookup structure — this is the
            // hottest loop in the sim and ADR-0006 exists to protect it.
            //
            // Face-adjacent boxes touch on exactly ONE axis and overlap on the
            // other two (an edge- or corner-only touch shares no face cell, so
            // `_buildNeighbors` never pairs them). y is already known to
            // overlap: `nb.gy + nb.fsy <= cur.gy` was skipped above and
            // `nb.gy >= cur.gy + cur.fsy` took the vertical branch. So the hop
            // axis is x or z, and testing x settles it.
            const xHop = cur.gx + cur.fsx === nb.gx || nb.gx + nb.fsx === cur.gx;
            ns = cs + (xHop ? cur.sx + nb.sx : cur.sz + nb.sz) / 2;
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
        // hanging over ANY hole's opening counts — checked in index order
        for (let hi = 0; hi < nh; hi++) {
          const p = hp[hi];
          const dx = b.x - p.h.x, dz = b.z - p.h.z;
          if (fwHypot2(dx, dz) < p.remR + (sp + 1.5) * p.hangScale) { hang[j] = 1; break; }
        }
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
        // material creak scales with brick size: small bricks pop, big slabs
        // grind. `sAvg` is the characteristic length cbrt(sx·sy·sz), which is
        // exactly `s` for a cube — so no shipped scene re-paces (ADR-0013).
        const failTime = Math.min(FAIL_CAP, b.mat.delay * creak * (1 + 0.15 * b.gy * FINE) * b.sAvg + waveK * dist);
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
        const failTime = Math.min(HANG_CAP, b.mat.delay * creak * (1 + 0.15 * b.gy * FINE) * b.sAvg + 0.15 + 0.25 * spanVal[i]);
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
      const v = b.sx * b.sy * b.sz;
      cx += b.x * v; cy += b.y * v; cz += b.z * v;
      vol += v; massSum += b.mat.mass * v; sizeSum += b.sAvg;
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
          const vertical = nb.gy >= cur.gy + cur.fsy || nb.gy + nb.fsy <= cur.gy;
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
      // footprint + the one-cell broad-phase pad, per axis
      const rx = (b.fsx + 2) * FINE, rz = (b.fsz + 2) * FINE;
      if (b.x - rx < mnX) mnX = b.x - rx;
      if (b.x + rx > mxX) mxX = b.x + rx;
      if (b.z - rz < mnZ) mnZ = b.z - rz;
      if (b.z + rz > mxZ) mxZ = b.z + rz;
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

  // Is (x, z) inside ONE hole's removal disc? `p` is a _holeParams row.
  _overVoid(p, x, z) {
    const dx = x - p.h.x, dz = z - p.h.z;
    return dx * dx + dz * dz <= p.remR2;
  }

  // fall acceleration — UNIFORM for every material (see the gravity note at
  // the top). The density parameter is kept so call sites stay stable; it no
  // longer scales anything.
  _fallG(density) { void density; return this.tune.gravity; }

  // --- solid-surface heightmap (block-vs-block collision) ---------------------

  // current-position fine min-corner (gx/gy/gz are build-time; blocks move)
  _foot(b) {
    return [Math.round(b.x / FINE - b.fsx / 2), Math.round(b.y / FINE - b.fsy / 2), Math.round(b.z / FINE - b.fsz / 2)];
  }

  _topAdd(b) {
    const [fx, fy, fz] = this._foot(b);
    const top = (fy + b.fsy) * FINE;
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iz = 0; iz < b.fsz; iz++) {
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
    const bTop = (fy + b.fsy) * FINE;
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iz = 0; iz < b.fsz; iz++) {
        const k = cellKey(fx + ix, fz + iz);
        if (this._top.get(k) === bTop) {
          let ny = 0;
          for (let cy = fy - 1; cy >= 0; cy--) {
            const o = this.grid.get(key(fx + ix, cy, fz + iz));
            if (o && (o.state === 'static' || o.state === 'unstable')) { ny = (o.gy + o.fsy) * FINE; break; }
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

  // Highest solid surface IN THE COLUMN of a footprint at (x,z), 0 = bare
  // ground. This is an occlusion answer, not a support answer: for a block
  // standing BESIDE or UNDER a tall structure it returns the structure's
  // roof. Any caller asking "what can I land on" must reject a result above
  // the block's own base and fall back to _supportBelow — treating "below the
  // surface" as "landed on the surface" was the skyscraper-launch bug
  // (RCA 2026-08-11).
  _topAt(x, z, fsx, fsz) {
    const gx0 = Math.round(x / FINE - fsx / 2), gz0 = Math.round(z / FINE - fsz / 2);
    const top0 = this._top;
    let top = 0;
    for (let ix = 0; ix < fsx; ix++) {
      for (let iz = 0; iz < fsz; iz++) {
        const t = top0.get(cellKey(gx0 + ix, gz0 + iz));
        if (t > top) top = t;
      }
    }
    return top;
  }

  // The SUPPORT answer _topAt cannot give: the highest solid top under b's
  // footprint that is at or below `yBase` (the block's pre-move base), walking
  // each column downward through the grid the way _topRemove does. A column
  // entered mid-structure (the block is embedded beside a taller solid) skips
  // past that solid and keeps walking down. Deterministic — grid state only.
  _supportBelow(b, yBase) {
    const fx = Math.round(b.x / FINE - b.fsx / 2);
    const fz = Math.round(b.z / FINE - b.fsz / 2);
    const fyTop = Math.max(0, Math.floor(yBase / FINE + 0.2));
    let best = 0;
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iz = 0; iz < b.fsz; iz++) {
        for (let cy = fyTop; cy >= 0;) {
          const o = this.grid.get(key(fx + ix, cy, fz + iz));
          if (!o || (o.state !== 'static' && o.state !== 'unstable')) { cy--; continue; }
          const t = (o.gy + o.fsy) * FINE;
          if (t <= yBase + 0.05) { if (t > best) best = t; break; }
          cy = o.gy - 1; // inside/beside a taller solid: keep walking down
        }
      }
    }
    return best;
  }

  // first SOLID block overlapping b's leading side face or bottom face —
  // falling bodies scrape walls and shatter on structures instead of
  // ghosting through them. (vx,vz) come from the body (chunk or debris).
  _contact(b, vx, vz) {
    // _foot inline: this runs once per airborne body per step and the array it
    // returns was pure garbage
    const fx = Math.round(b.x / FINE - b.fsx / 2);
    const fy = Math.round(b.y / FINE - b.fsy / 2);
    const fz = Math.round(b.z / FINE - b.fsz / 2);
    const xDominant = Math.abs(vx) > Math.abs(vz);
    const sgn = (xDominant ? vx : vz) >= 0 ? 1 : -1;
    // The side probe sweeps (lateral, height); the bottom probe sweeps (x, z).
    // On a box those two rectangles differ in size, so each gets a guard inside
    // ONE fused loop rather than a loop of its own — this returns the FIRST
    // solid hit, so splitting the walk would change which block a cube reports.
    // On a cube lat === fsx and fsy === fsz, every guard is true, and the
    // iteration is exactly the old one.
    const lat = xDominant ? b.fsz : b.fsx;
    const uMax = lat > b.fsx ? lat : b.fsx;
    const vMax = b.fsy > b.fsz ? b.fsy : b.fsz;
    for (let u = 0; u < uMax; u++) {
      for (let v = 0; v < vMax; v++) {
        if (u < lat && v < b.fsy) {
          let cx, cz;
          if (xDominant) { cx = sgn > 0 ? fx + b.fsx : fx - 1; cz = fz + u; }
          else { cz = sgn > 0 ? fz + b.fsz : fz - 1; cx = fx + u; }
          const o = this.grid.get(key(cx, fy + v, cz));
          if (o && o !== b && (o.state === 'static' || o.state === 'unstable')) return o;
        }
        if (u < b.fsx && v < b.fsz) {
          const o = this.grid.get(key(fx + u, fy - 1, fz + v));
          if (o && o !== b && (o.state === 'static' || o.state === 'unstable')) return o;
        }
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
    for (let ix = -1; ix <= b.fsx; ix++) {
      for (let iz = -1; iz <= b.fsz; iz++) {
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
    for (let ix = -1; ix <= b.fsx; ix++) {
      for (let iz = -1; iz <= b.fsz; iz++) {
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

  // A hole is the one thing that reaches retired rubble without any contact
  // event telling us so, so sweep the index each hole covers and revive what it
  // is about to swallow. Revived blocks are handed to the normal `_stepDebris`
  // path, which applies the identical `dist2 <= remR2` test — this pre-pass
  // only decides what gets LOOKED at, never what happens. Holes sweep in index
  // order; `_reviveResting` is idempotent, so overlap between two holes'
  // sweeps is harmless.
  _wakeRestingUnderHoles(hp) {
    for (let hi = 0; hi < hp.length; hi++) {
      if (this._restCount === 0) return;
      const p = hp[hi], h = p.h;
      const remR = p.remR, remR2 = p.remR2;
      const c0 = Math.floor((h.x - remR) / REST_CELL), c1 = Math.floor((h.x + remR) / REST_CELL);
      const d0 = Math.floor((h.z - remR) / REST_CELL), d1 = Math.floor((h.z + remR) / REST_CELL);
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
      if (!found) continue;
      // id order, because _falling is id-ordered and the solver's pair sequence
      // depends on it; a spatial walk visits cells in an arbitrary order
      found.sort((a, b) => a.id - b.id);
      for (let i = 0; i < found.length; i++) this._reviveResting(found[i]);
    }
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
    const hp = this._holeParams();
    const nh = hp.length;

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      // Per-hole deltas, computed ONCE before integration (the single-hole
      // code did the same: its rim-torque below reads the pre-integration
      // distance) and reused for pull, torque and nothing else.
      for (let hi = 0; hi < nh; hi++) {
        const p = hp[hi];
        p._dx = p.h.x - c.cx; p._dz = p.h.z - c.cz;
        p._d2 = fwHypot2(p._dx, p._dz) || 0.001; // a distance here, not d²
      }

      // attraction zone: mild inward pull toward every hole in range keeps
      // debris funneling to the openings (index order — deterministic)
      for (let hi = 0; hi < nh; hi++) {
        const p = hp[hi];
        if (p._d2 < p.attractR) {
          const a = this.tune.attract * (1 - p._d2 / p.attractR);
          c.vx += (p._dx / p._d2) * a * dt;
          c.vz += (p._dz / p._d2) * a * dt;
        }
      }
      c.vy -= this._fallG(c.density) * dt;
      c.cx += c.vx * dt; c.cy += c.vy * dt; c.cz += c.vz * dt;

      // perimeter containment: keep chunks inside playable bounds
      const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
      if (c.cx < r.minX + 1.0) { c.cx = r.minX + 1.0; if (c.vx < 0) c.vx = 0; }
      else if (c.cx > r.maxX - 1.0) { c.cx = r.maxX - 1.0; if (c.vx > 0) c.vx = 0; }
      if (c.cz < r.minZ + 1.0) { c.cz = r.minZ + 1.0; if (c.vz < 0) c.vz = 0; }
      else if (c.cz > r.maxZ - 1.0) { c.cz = r.maxZ - 1.0; if (c.vz > 0) c.vz = 0; }

      // rim torque: a chunk straddling a rim tips toward that opening —
      // big slabs tip slowly, small bricks snap over
      for (let hi = 0; hi < nh; hi++) {
        const p = hp[hi];
        if (p._d2 > 0.1 && p._d2 < p.h.radius + 2.0) {
          const tip = 3.5 / c.sizeAvg;
          c.vRotZ += (p._dx / p._d2) * tip * dt;
          c.vRotX += (-p._dz / p._d2) * tip * dt;
        }
      }
      c.vRotX *= 1 - 2 * dt; c.vRotZ *= 1 - 2 * dt;
      // cap chunk tumble: slabs lean, they don't pirouette — and members born
      // of a wildly rotated chunk start life AABB-interpenetrating
      c.rotX = Math.max(-0.7, Math.min(0.7, c.rotX + c.vRotX * dt));
      c.rotZ = Math.max(-0.7, Math.min(0.7, c.rotZ + c.vRotZ * dt));

      // sync constituent blocks, consume those sunk below the floor, detect impact
      const cosZ = fwCos(c.rotZ), sinZ = fwSin(c.rotZ);
      const cosX = fwCos(c.rotX), sinX = fwSin(c.rotX);
      let live = 0, impact = false;
      for (const cb of c.blocks) {
        if (cb.state === 'consumed') continue;
        let rx = cb.relX * cosZ - cb.relY * sinZ;
        let ry = cb.relX * sinZ + cb.relY * cosZ;
        const rz = cb.relZ * cosX - ry * sinX;
        ry = cb.relZ * sinX + ry * cosX;
        cb.x = c.cx + rx; cb.y = c.cy + ry; cb.z = c.cz + rz;
        // first hole (index order) whose void covers this member — the
        // deterministic tie-break when two rims overlap the same block
        let vh = null;
        for (let hi = 0; hi < nh; hi++) {
          if (this._overVoid(hp[hi], cb.x, cb.z)) { vh = hp[hi]; break; }
        }
        if (vh) {
          if (cb.y + cb.sy / 2 <= SINK_Y) { this._consume(cb, vh.h); continue; }
        } else {
          // impact on ANY solid surface — rooftops, rims, debris piles; and
          // hard contacts smash (damage) whatever the chunk hits. Same
          // pre-move-base guard as the debris landing: a chunk sliding BESIDE
          // a tower must not read the tower's roof as an impact surface.
          let surf = this._topAt(cb.x, cb.z, cb.fsx, cb.fsz);
          const preBase = cb.y - cb.sy / 2 - Math.min(0, c.vy) * dt;
          cb._yPrevBase = preBase; // read by _separate's +y gate
          if (surf > preBase + 0.05) surf = this._supportBelow(cb, preBase);
          const topHit = cb.y <= surf + cb.sy / 2 + 0.05;
          const directionalHit = topHit ? null : this._contact(cb, c.vx, c.vz);
          const solidHit = topHit || directionalHit ? this._resolveStaticContacts(cb) : null;
          if (solidHit || topHit || directionalHit) {
            impact = true;
            if (directionalHit && fwHypot3(c.vx, c.vy, c.vz) > 5) {
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
          const vertical = nb.gy >= cur.gy + cur.fsy || nb.gy + nb.fsy <= cur.gy;
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
    const hp = this._holeParams();
    const nh = hp.length;

    // Retired rubble any hole has reached rejoins the active list first, at its
    // id position, so the walk below meets it exactly where it always did.
    this._wakeRestingUnderHoles(hp);

    // Indexed walk, not for-of: _unsleep -> _topRemove can wake a whole pile
    // mid-loop and each revival splices into this very array. The cursor is
    // adjusted by _reviveResting so an insert below it does not shift the walk
    // backwards onto an entry already processed.
    const f = this._falling;
    for (this._debrisCursor = 0; this._debrisCursor < f.length; this._debrisCursor++) {
      const b = f[this._debrisCursor];
      if (b.state !== 'falling' || b.parentChunk) continue;
      // Per-hole pre-integration deltas, computed once and reused by the void
      // test, the vacuum and the rim tip — exactly as the single-hole code
      // read one dx/dz/dist2 for all three. `vh` is the first hole (index
      // order) whose void covers the block: the deterministic consumer.
      let vh = null;
      for (let hi = 0; hi < nh; hi++) {
        const p = hp[hi];
        p._dx = p.h.x - b.x; p._dz = p.h.z - b.z;
        p._d2 = p._dx * p._dx + p._dz * p._dz;
        if (!vh && p._d2 <= p.remR2) vh = p;
      }
      if (b.asleep) {
        // settled rubble wakes only for a void itself, support loss, or a
        // hard hit — never for the vacuum. If it is not over a hole, it
        // does not move.
        if (!vh) continue;
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
      if (b._budgetHold && !vh) continue;
      if (!b._grounded) {
        for (let hi = 0; hi < nh; hi++) {
          const p = hp[hi];
          if (p._d2 < p.attractR2) {
            const dist = Math.sqrt(p._d2) || 0.001;
            const a = this.tune.attract * (1 - dist / p.attractR);
            b.vx += (p._dx / dist) * a * dt;
            b.vz += (p._dz / dist) * a * dt;
          }
        }
      }
      // Pre-move base: the landing tests below may only accept a surface the
      // block was actually ABOVE before this step's motion. Without that
      // guard, _topAt's column maximum teleported ground-level debris onto
      // the roof of the still-standing tower beside it (RCA 2026-08-11).
      const yPrevBase = b.y - b.sy / 2;
      b._yPrevBase = yPrevBase; // read by _separate's +y gate (see there)
      b.vy -= this._fallG(b.mat.mass) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.rotX += b.vRotX * dt; b.rotZ += b.vRotZ * dt;

      // perimeter containment: keep voxels/debris inside the playable world bounds
      const r = this.boundsRect || { minX: -this.bounds, maxX: this.bounds, minZ: -this.bounds, maxZ: this.bounds };
      const boundMargin = Math.max(b.sx, b.sz) * 0.5;
      if (b.x < r.minX + boundMargin) {
        b.x = r.minX + boundMargin;
        if (b.vx < 0) b.vx = 0;
      } else if (b.x > r.maxX - boundMargin) {
        b.x = r.maxX - boundMargin;
        if (b.vx > 0) b.vx = 0;
      }
      if (b.z < r.minZ + boundMargin) {
        b.z = r.minZ + boundMargin;
        if (b.vz < 0) b.vz = 0;
      } else if (b.z > r.maxZ - boundMargin) {
        b.z = r.maxZ - boundMargin;
        if (b.vz > 0) b.vz = 0;
      }

      if (vh) {
        if (b.y + b.sy / 2 <= SINK_Y) this._consume(b, vh.h);
        continue;
      }
      // wall scrape: falling bodies damp against standing structures and
      // smash them a little — never ghost through a facade
      // The directional/top probes cheaply identify likely contacts. Only
      // then run the full AABB separation against nearby solid buckets; open
      // air never pays for a city-wide overlap scan.
      let surf = this._topAt(b.x, b.z, b.fsx, b.fsz);
      if (surf > yPrevBase + 0.05) surf = this._supportBelow(b, yPrevBase);
      const directionalHit = this._contact(b, b.vx, b.vz);
      const topHit = b.y <= surf + b.sy / 2 + 0.05;
      this._scFloorHit = false;
      const hit = topHit || directionalHit
        ? this._resolveStaticContacts(b) || directionalHit
        : null;
      if (hit) {
        b.vx *= 0.5; b.vz *= 0.5;
        // The vy reflection is a FLOOR response. Applied on any hit it turned
        // a facade scrape into an every-frame gravity cancel — the mid-air
        // hover of RCA 2026-08-11. A block scraping a wall keeps falling.
        if ((topHit || this._scFloorHit) && b.vy < 0) b.vy *= -0.25;
        if (Math.abs(b.vy) > 5) {
          hit.damage = Math.min(0.95, hit.damage + 0.1);
          this._watchDamage(hit);
        }
      }
      // land on the solid SURFACE (roof/pile), not the ground plane. Loose
      // bodies contacted last step count as support too — without that, a
      // block landing on awake rubble sinks to ground level inside it and
      // gets squirted out sideways, and the pile never solidifies.
      let support = surf;
      let looseSup = false;
      const rl = b._restLoose;
      b._restLoose = null; // re-set by this step's contact pass if still touching
      if (rl && rl.state === 'falling' && !rl.asleep) {
        const hSumX = (b.sx + rl.sx) / 2, hSumZ = (b.sz + rl.sz) / 2;
        const top = rl.y + rl.sy / 2;
        // Same pre-move-base rule as every other landing: a loose neighbour
        // only counts as support if the block was above its top last step —
        // a sideways embed in rubble must not hoist the block onto the pile.
        if (Math.abs(b.x - rl.x) < hSumX && Math.abs(b.z - rl.z) < hSumZ &&
            top > support && top <= yPrevBase + 0.05) {
          support = top;
          looseSup = true;
        }
      }
      const rest = support + b.sy / 2;
      b._grounded = false; // vacuum only acts on airborne/sliding bodies
      b._looseSup = false; // re-stamped each grounded step — _capDebris reads it
      if (b.y <= rest) {
        b._grounded = true;
        b._looseSup = looseSup;
        // Proof that this body was integrated and snapped THIS step. `_grounded`
        // alone cannot carry that: a body over a void `continue`s out of the walk
        // above before the flag is re-cleared, so it keeps last step's value.
        // `_latchJammed` needs the stronger claim (T-402).
        b._groundT = this.time;
        b.y = rest;
        if (b.vy < 0) b.vy = b.vy < -2 ? -b.vy * 0.25 : 0;
        b.vx *= Math.max(0, 1 - 5 * dt); b.vz *= Math.max(0, 1 - 5 * dt);
        b.vRotX *= Math.max(0, 1 - 5 * dt); b.vRotZ *= Math.max(0, 1 - 5 * dt);
        // tip over a rim instead of balancing on the edge — only when the
        // hole-facing edge really overhangs that hole's opening. A block on
        // solid ground NEXT to a hole has no business moving, and contact with
        // the pile damps spin instead of letting it pirouette in place. First
        // qualifying hole in index order tips it — deterministic.
        let tp = null, tdist = 1;
        for (let hi = 0; hi < nh; hi++) {
          const p = hp[hi];
          if (p._d2 >= p.rimR2) continue;
          const dist = Math.sqrt(p._d2) || 0.001;
          if (this._overVoid(p, b.x + (p._dx / dist) * b.sx * 0.5, b.z + (p._dz / dist) * b.sz * 0.5)) {
            tp = p; tdist = dist; break;
          }
        }
        if (tp) {
          const tip = 1.5 / b.sAvg;
          b.rotX = Math.max(-0.6, Math.min(0.6, b.rotX + (-tp._dz / tdist) * tip * dt));
          b.rotZ = Math.max(-0.6, Math.min(0.6, b.rotZ + (tp._dx / tdist) * tip * dt));
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
            const t = this._topAt(b.x + nx * b.sx, b.z + nz * b.sz, b.fsx, b.fsz);
            if (t < lowTop) { lowTop = t; lowX = nx; lowZ = nz; }
          }
          // a SLOPE test: drop over a run of one block width along whichever
          // axis the low neighbour sits on (`b.s` both ways, for a cube)
          if (support - lowTop > (lowX !== 0 ? b.sx : b.sz) * 1.25) {
            b.vx += lowX * 4.5 * dt; b.vz += lowZ * 4.5 * dt;
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
    this._latchJammed();
    // commit sleep candidates: grounded, slow, and now provably contact-free —
    // or provably STILL, which is the jam path `_latchJammed` opens.
    // Even inside the attraction zone — constant vacuum pressure on resting
    // blocks is what ground piles into self-clipping churn; the hole wakes
    // sleepers when it reaches them (overVoid), and support loss wakes the rest.
    let retired = 0;
    for (const b of f) {
      if (!b._wantSleep) continue;
      b._wantSleep = false;
      // A jam-latched body is allowed past the contact gate, and only that body:
      // it has held one position for JAM_STEPS consecutive steps, so the overlap
      // holding `_inContact` true is a fixed point the solver is not resolving
      // and never will. Everything else still has to be contact-free.
      const jam = b._jamReady === true;
      b._jamReady = false;
      if (b.state !== 'falling' || b.parentChunk || b.asleep || (b._inContact && !jam)) continue;
      b.asleep = true;
      // Woken bodies must re-prove stillness from scratch rather than resume a
      // stale count against a stale anchor.
      b._jamSteps = 0;
      b.vx = 0; b.vy = 0; b.vz = 0; b.vRotX = 0; b.vRotZ = 0;
      const [fx, , fz] = this._foot(b);
      const colK = cellKey(fx + (b.fsx >> 1), fz + (b.fsz >> 1));
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

  // JAM RETIREMENT (T-402). The one thing that made the awake-debris population
  // grow without bound, and with it the per-step cost of any long session.
  //
  // A body wedged between an immovable partner (a sleeper, or a standing
  // structure block) and another mover converges to a GEOMETRIC FIXED POINT
  // inside a single step, and then reproduces it forever. Traced on Cambridge,
  // the same body, every step, identical values:
  //
  //   sep 13655<-13658 movO=true  pen=0.1588   (awake partner)
  //   sep 13655<-13653 movO=false pen=0.0809   (sleeper)
  //   sep 13655<-13658 movO=true  pen=0.0793
  //   sep 13655<-13653 movO=false pen=0.0388
  //   ...                         net displacement 0.0000
  //
  // Over 60 consecutive steps that first penetration drifted by 8.88e-16 (one
  // ULP) and the body moved under 1 mm. Because 0.1588 is above `_separate`'s
  // 0.05 threshold, `_inContact` is re-stamped every step, and the sleep commit
  // reads that as "mid-overlap" and refuses to retire it. Measured at simT 120 s
  // on the validator's own Cambridge route: 78 of 101 awake bodies were in
  // exactly that state — stationary, grounded on solid support, doing no
  // physical work, and structurally impossible to retire. One accumulates per
  // collapse that leaves a block pinched, and nothing could ever remove one.
  //
  // The contact gate exists because "a block frozen mid-overlap can never
  // separate". For this population that premise is already false: the overlap is
  // not separating whether or not we freeze it. So rather than relax the
  // threshold — which would also free bodies still genuinely mid-collapse — a
  // body may retire while in contact once it has PROVEN it is not moving.
  //
  // Position is read here, after `_resolveDebrisContacts`, so it is the
  // post-solve pose the renderer already draws. Retirement moves nothing.
  _latchJammed() {
    const f = this._falling;
    for (let i = 0; i < f.length; i++) {
      const b = f[i];
      if (b.state !== 'falling' || b.parentChunk || b.asleep) continue;
      // Eligibility is the walk's own sleep rule plus three exclusions:
      //
      //   `_groundT !== this.time` — the body must have been integrated and
      //     snapped onto its support THIS step. A body over a void `continue`s
      //     out of the walk before `_grounded` is re-cleared, so the flag alone
      //     can be a stale claim from last step.
      //   `_budgetHold` — parked bodies are not integrated at all
      //     (`_stepDebris` skips them), so they satisfy "did not move" by
      //     construction. Retiring them would let the device-tier contact budget
      //     decide which bodies leave the sim, which is a physics divergence
      //     between a phone and a desktop — RANKED_TUNE's `contactBudget: 200`
      //     included. The one exclusion this path cannot do without.
      //   `_looseSup` — a sleeper recorded on a LOOSE support has no wake path
      //     (RCA-2026-08-11, skyscraper-launch-and-hanging-debris; guard added
      //     in 57d0652). This is the identical condition `_capDebris` applies,
      //     so this path is strictly MORE conservative than the walk's own sleep
      //     path: same support rule, plus JAM_STEPS of proven stillness.
      if (b._groundT !== this.time || !b._grounded || b._looseSup || b._budgetHold ||
          b.vx * b.vx + b.vz * b.vz >= 0.06) {
        b._jamSteps = 0;
        continue;
      }
      if (b._jamSteps > 0 &&
          Math.abs(b.x - b._jamX) < JAM_EPS &&
          Math.abs(b.y - b._jamY) < JAM_EPS &&
          Math.abs(b.z - b._jamZ) < JAM_EPS) {
        b._jamSteps++;
      } else {
        // moved (or first eligible step): re-anchor and start counting again
        b._jamSteps = 1;
        b._jamX = b.x; b._jamY = b.y; b._jamZ = b.z;
      }
      if (b._jamSteps >= JAM_STEPS) {
        // NOT gated on `!b._wantSleep`. The walk sets `_wantSleep` on this very
        // population every step (grounded, on solid support, slow) and the commit
        // then throws it away on `_inContact` — that pair IS the defect. Gating
        // here on the flag being unset made the latch a no-op: measured, awake
        // held at 100 bodies with 79 of them counting toward a threshold they
        // were never allowed to act on.
        b._wantSleep = true;
        b._jamReady = true;
        // Grounded means `b.y` was snapped to `support + sy/2` this step, so this
        // IS the surface it is resting on — no probe needed and no chance of
        // recording one it is not touching. Same rule `_capDebris` uses.
        b._sleepSupport = b.y - b.sy / 2;
      }
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
  // passes directly underneath (`_wakeRestingUnderHoles` is the only remaining
  // wake). The walk's own sleep path knew this (the `looseSup` branch never
  // sets `_wantSleep`); the cap simply failed to check. Eligible blocks are
  // handed to the same `_wantSleep` path everything else uses — which means
  // the contact pass still has to prove them overlap-free before they are
  // allowed to sleep. A block frozen mid-overlap can never separate, and that
  // invariant is not worth trading for a frame. So the visible cost is:
  // distant rubble stops skittering and comes to rest a second or two early.
  // Nothing vanishes, nothing sinks, nothing hangs.
  //
  // Farthest-from-any-hole first, because that is what no player is looking
  // at; `id` breaks ties so the selection can never depend on iteration order.
  _capDebris(cap) {
    const f = this._falling;
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
      const da = this._nearestHoleD2(a.x, a.z);
      const db = this._nearestHoleD2(b.x, b.z);
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
      b._sleepSupport = b.y - b.sy / 2;
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
      awake.sort((a, b) => {
        const da = this._nearestHoleD2(a.x, a.z);
        const db = this._nearestHoleD2(b.x, b.z);
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
      const fx = Math.round(b.x / FINE - b.fsx / 2), fz = Math.round(b.z / FINE - b.fsz / 2);
      for (let ix = -1; ix <= b.fsx; ix++) {
        for (let iz = -1; iz <= b.fsz; iz++) {
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
        const fx = Math.round(b.x / FINE - b.fsx / 2), fz = Math.round(b.z / FINE - b.fsz / 2);
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
        const bhs = b.sy / 2;
        for (let ix = -1; ix <= b.fsx; ix++) {
          for (let iz = -1; iz <= b.fsz; iz++) {
            const k = keyInt(fx + ix, fz + iz);
            const mo = occMove.get(k);
            if (mo) {
              for (const o of mo) {
                if (o === b || o.id < b.id) continue; // each pair once per round
                const dy = b.y - o.y;
                if (bhs + o.sy / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, true);
              }
            }
            const ob = occObs.get(k), sb = sleepObs.get(k);
            let o = null;
            if (ob && sb) {
              let p = 0, q = 0;
              while (p < ob.length && q < sb.length) {
                o = ob[p].id < sb[q].id ? ob[p++] : sb[q++];
                const dy = b.y - o.y;
                if (bhs + o.sy / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
              while (p < ob.length) {
                o = ob[p++];
                const dy = b.y - o.y;
                if (bhs + o.sy / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
              while (q < sb.length) {
                o = sb[q++];
                const dy = b.y - o.y;
                if (bhs + o.sy / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
            } else if (ob) {
              for (let p = 0; p < ob.length; p++) {
                o = ob[p];
                const dy = b.y - o.y;
                if (bhs + o.sy / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
              }
            } else if (sb) {
              for (let q = 0; q < sb.length; q++) {
                o = sb[q];
                const dy = b.y - o.y;
                if (bhs + o.sy / 2 > (dy < 0 ? -dy : dy)) this._separate(b, o, false);
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
    const minX = Math.floor((b.x - b.sx / 2) / COLLISION_CELL) - 1;
    const maxX = Math.floor((b.x + b.sx / 2) / COLLISION_CELL) + 1;
    const minZ = Math.floor((b.z - b.sz / 2) / COLLISION_CELL) - 1;
    const maxZ = Math.floor((b.z + b.sz / 2) / COLLISION_CELL) + 1;
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const bucket = this._collisionBuckets.get(cellKey(x, z));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const o = bucket[i];
        if (o === b || o._scSeen === stamp) continue;
        if (o.state !== 'static' && o.state !== 'unstable') continue;
        o._scSeen = stamp;
        const py = (b.sy + o.sy) / 2 - Math.abs(b.y - o.y);
        if (py <= 0) continue;
        const px = (b.sx + o.sx) / 2 - Math.abs(b.x - o.x);
        if (px <= 0) continue;
        const pz = (b.sz + o.sz) / 2 - Math.abs(b.z - o.z);
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
    const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z;
    const px = (b.sx + o.sx) / 2 - Math.abs(dx);
    const py = (b.sy + o.sy) / 2 - Math.abs(dy);
    const pz = (b.sz + o.sz) / 2 - Math.abs(dz);
    const pen = Math.min(px, py, pz);
    if (pen <= 0) return;
    // trivially-embedded loaded contacts (a resting block pressed down by
    // gravity each step) stay sleep-eligible — only real overlaps hold blocks
    // awake, or loaded piles would churn and never solidify
    if (pen > 0.05) {
      b._inContact = true; // blocks sleep only when (meaningfully) contact-free
      if (movableO) o._inContact = true;
    }
    // A +y resolution against a STATIC solid is a landing, and a landing is
    // only legitimate on a surface the block was at or above before this
    // step's motion. Without the gate, a block embedded beside a standing
    // tower is ratcheted up its wall column one cell per contact — the whole
    // bucket resolves in one call, so the "climb" is a single-step teleport
    // to the roof (RCA 2026-08-11's launcher, second guise). Deep embeds
    // eject laterally instead, which is also what looks right.
    const upBlocked = !movableO && dy >= 0 &&
      (b._yPrevBase === undefined || b._yPrevBase < o.y + o.sy / 2 - 0.05);
    if (px <= py && px <= pz) this._pushAxis(b, o, 'x', dx >= 0 ? 1 : -1, px, movableO);
    else if (py <= px && py <= pz && !upBlocked) this._pushAxis(b, o, 'y', dy >= 0 ? 1 : -1, py, movableO);
    else if (pz <= px) this._pushAxis(b, o, 'z', dz >= 0 ? 1 : -1, pz, movableO);
    else this._pushAxis(b, o, 'x', dx >= 0 ? 1 : -1, px, movableO);
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
    if (axis === 'y' && sign > 0) {
      this._scFloorHit = true; // read (and reset) by the debris wall-scrape response
      if (o.state === 'falling') b._restLoose = o;
    }
  }

  // --- mover simulation (track integrity / derail / ground-run / eatable) ------
  // The mover seam (see moverArc/moverPose above) started render-only: a pose
  // that is a pure function of the sim clock. A scene may now OPT a mover into
  // the simulation by declaring `sim: {...}` on it — capabilities, not
  // train-specific code, so a future boat or streetcar gets the same physics
  // by flipping the same flags:
  //
  //   sim: {
  //     derail: true,        sample the track under each unit; fall at gaps
  //     groundRun: true,     after landing, keep driving the route at ground level
  //     eatable: true,       a derailed (falling/grounded) unit can be consumed
  //     groundSpeed: 6.5,    m/s once grounded (default 0.75 × ride speed)
  //     unitMass: 75,        raw mass credited to the eater (default 2 × volume)
  //     length/width/height, the unit's box, metres
  //     probes: [-2.75, 2.75],  support sample offsets along the direction of travel
  //     track: { y0, y1, halfW }, the solid band that counts as "track present"
  //   }
  //
  // DETERMINISM (ADR-0003/ADR-0006). The runtime draws NOTHING from the RNG —
  // every stream in every shipped scene stays exactly where it was — and every
  // transition reads only sim state: the fine grid's solidity (which is a pure
  // function of the eaten/collapse history), the hole roster (index order for
  // every tie-break), and `sim.time`. Same seed + same inputs = bit-identical
  // derail ticks, landing heights and unit poses, which is what the replay
  // defense (04 §10.1) needs and what tools/train-derail-selftest.mjs pins.
  //
  // MULTIPLAYER. A riding unit is still the old pure function of the clock. A
  // derailed unit's state derives from the eaten/collapse history, which a peer
  // learns through eat events and the keyframe's eaten bitset — so a peer-side
  // derivation converges once the keyframe heals its consumed set. The
  // transient where a peer has not yet healed an eaten track block means its
  // train derails a beat late (worst case: one keyframe interval, then it
  // reaches the same gap next lap); that divergence is presentation-only and
  // bounded, never permanent — the HOST is the only authority on consumption,
  // and a consumed unit's id rides the same wire events/keyframe as a block id
  // (`objectIdSpace` covers both), so who ate what never diverges at all.
  // ('chicago' is on ARENA_SCENES now; this note is that seam's contract.)
  //
  // ELEVATED CARS ARE NOT EATABLE ON INTACT TRACK — decided for play feel: the
  // fun loop is undermine the posts → the deck crumbles → the train stumbles,
  // falls, runs the streets, and THEN gets hunted. A hole that could vacuum the
  // train off a healthy viaduct would skip the whole spectacle. A unit becomes
  // consumable the moment it is falling or grounded.

  _initMoverSim() {
    this.moverSim = null;
    const list = this.sceneMovers;
    if (!Array.isArray(list)) return;
    const sims = [];
    for (const m of list) {
      const cfg = m && m.sim;
      if (!cfg || !Array.isArray(m.path) || m.path.length < 2) continue;
      const arc = moverArc(m.path);
      if (!(arc.total > 0)) continue;
      const offsets = Array.isArray(m.units) && m.units.length
        ? m.units.map((u) => (u && Number.isFinite(u.off) ? u.off : 0)) : [0];
      const L = cfg.length != null ? cfg.length : 8;
      const W = cfg.width != null ? cfg.width : 2.5;
      const H = cfg.height != null ? cfg.height : 2.5;
      const t = cfg.track || {};
      const rt = {
        src: m, arc,
        speed: Number.isFinite(m.speed) ? m.speed : 0,
        y: Number.isFinite(m.y) ? m.y : 0,
        derail: !!cfg.derail, groundRun: !!cfg.groundRun, eatable: !!cfg.eatable,
        groundSpeed: cfg.groundSpeed != null ? cfg.groundSpeed : (Number.isFinite(m.speed) ? m.speed : 0) * 0.75,
        unitMass: cfg.unitMass != null ? cfg.unitMass : 2 * L * W * H,
        height: H,
        probes: Array.isArray(cfg.probes) && cfg.probes.length ? cfg.probes : [-L * 0.34, L * 0.34],
        track: {
          y0: t.y0 != null ? t.y0 : Math.max(0, (Number.isFinite(m.y) ? m.y : 0) - 1),
          y1: t.y1 != null ? t.y1 : (Number.isFinite(m.y) ? m.y : 0),
          halfW: t.halfW != null ? t.halfW : W / 2,
        },
        units: offsets.map((off) => {
          const p = moverPose(arc, off);
          return {
            id: this._blockId++,   // shares the block id space: one wire format
            off, phase: 'ride',    // ride | fall | ground | rest | consumed
            s: off, x: p.x, z: p.z, ux: p.ux, uz: p.uz,
            y: Number.isFinite(m.y) ? m.y : 0,
            fwd: Number.isFinite(m.speed) ? m.speed : 0,
            vy: 0, tilt: 0,
            sAvg: fwCbrt(L * W * H),  // the "bite size" skins read (biteFromEvent)
          };
        }),
      };
      sims.push(rt);
    }
    if (sims.length) {
      this.moverSim = sims;
      this._mvSup = { top: 0, voided: false, hole: null }; // per-step scratch
    }
  }

  // Is there solid track under (px, pz)? Samples the declared track band —
  // deck + rails — across the lateral half-width, on the fine grid. ANY solid
  // cell counts: a half-eaten deck still carries the train; only a clean
  // full-width gap derails it. Solid means static|unstable, so a deck that has
  // DETACHED (mid-collapse) already reads as missing — the train falls with
  // the structure instead of riding an invisible rail over it.
  _moverTrackSolid(rt, px, pz, ux, uz) {
    const t = rt.track;
    const nx = -uz, nz = ux; // lateral unit vector
    const fy0 = Math.round(t.y0 / FINE), fy1 = Math.round(t.y1 / FINE);
    for (let l = -t.halfW; l <= t.halfW + 1e-9; l += FINE * 2) {
      const gx = Math.floor((px + nx * l) / FINE), gz = Math.floor((pz + nz * l) / FINE);
      for (let fy = fy0; fy < fy1; fy++) {
        const o = this.grid.get(key(gx, fy, gz));
        if (o && (o.state === 'static' || o.state === 'unstable')) return true;
      }
    }
    return false;
  }

  /** Test hook: is the track under mover `mi`'s path solid at arc length `s`? */
  moverTrackOk(mi, s) {
    const rt = this.moverSim[mi];
    const p = moverPose(rt.arc, s);
    for (let k = 0; k < rt.probes.length; k++) {
      const off = rt.probes[k];
      if (!this._moverTrackSolid(rt, p.x + p.ux * off, p.z + p.uz * off, p.ux, p.uz)) return false;
    }
    return true;
  }

  // Highest solid top under a 0.5 m probe column at (px, pz) that is at or
  // below `preBase` — the same pre-move-base landing rule the debris walk uses
  // (RCA 2026-08-11): a car falling BESIDE a tower must not land on its roof,
  // and a column entered beside a taller solid walks down past it. 0 = street.
  _moverGroundAt(px, pz, preBase) {
    const fx = Math.round(px / FINE) - 1, fz = Math.round(pz / FINE) - 1;
    const fyTop = Math.max(0, Math.floor(preBase / FINE + 0.2));
    let best = 0;
    for (let ix = 0; ix < 2; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        for (let cy = fyTop; cy >= 0;) {
          const o = this.grid.get(key(fx + ix, cy, fz + iz));
          if (!o || (o.state !== 'static' && o.state !== 'unstable')) { cy--; continue; }
          const top = (o.gy + o.fsy) * FINE;
          if (top <= preBase + 0.05) { if (top > best) best = top; break; }
          cy = o.gy - 1;
        }
      }
    }
    return best;
  }

  // Support under a derailed unit, or "there is only void". A probe over a
  // hole's opening contributes no support; when EVERY probe is over a void the
  // unit falls in (a car BRIDGES a hole smaller than its own wheelbase, like a
  // slab bridging the rim). Non-eatable movers never see voids — they cannot
  // be consumed, so sinking them would strand them below the world.
  // Attribution: first hole in index order covering the unit's CENTRE, else
  // the first that covered a probe — the standard multi-hole tie-break.
  _moverSupport(rt, u, hp, nh, preBase) {
    const out = this._mvSup;
    let top = 0, allVoid = true, hole = null;
    const probes = rt.probes;
    for (let k = 0; k < probes.length; k++) {
      const px = u.x + u.ux * probes[k], pz = u.z + u.uz * probes[k];
      let voided = false;
      if (rt.eatable) {
        for (let hi = 0; hi < nh; hi++) {
          if (this._overVoid(hp[hi], px, pz)) { voided = true; if (!hole) hole = hp[hi].h; break; }
        }
      }
      if (voided) continue;
      allVoid = false;
      const g = this._moverGroundAt(px, pz, preBase);
      if (g > top) top = g;
    }
    if (allVoid && probes.length) {
      for (let hi = 0; hi < nh; hi++) {
        if (this._overVoid(hp[hi], u.x, u.z)) { hole = hp[hi].h; break; }
      }
      out.top = 0; out.voided = true; out.hole = hole || this.holes[0];
      return out;
    }
    out.top = top; out.voided = false; out.hole = null;
    return out;
  }

  // Which hole gets the credit for a sinking unit: the first (index order)
  // whose void covers the centre, else the first covering a probe, else the
  // nearest — always defined, always deterministic.
  _moverEater(u, hp, nh) {
    for (let hi = 0; hi < nh; hi++) {
      if (this._overVoid(hp[hi], u.x, u.z)) return hp[hi].h;
    }
    let best = null, bestD2 = Infinity;
    for (let hi = 0; hi < nh; hi++) {
      const dx = u.x - hp[hi].h.x, dz = u.z - hp[hi].h.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = hp[hi].h; }
    }
    return best || this.holes[0];
  }

  _stepMovers(dt) {
    const sims = this.moverSim;
    if (!sims) return;
    const hp = this._holeParams();
    const nh = hp.length;
    for (let mi = 0; mi < sims.length; mi++) {
      const rt = sims[mi];
      for (let ui = 0; ui < rt.units.length; ui++) {
        const u = rt.units[ui];
        if (u.phase === 'consumed') continue;

        if (u.phase === 'ride') {
          // Riding is the original pure function of the clock — nothing to
          // snapshot, nothing to drift (the render-only contract, kept).
          u.s = this.time * rt.speed + u.off;
          const p = moverPose(rt.arc, u.s);
          u.x = p.x; u.z = p.z; u.ux = p.ux; u.uz = p.uz; u.y = rt.y;
          if (!rt.derail) continue;
          let solid = true;
          for (let k = 0; k < rt.probes.length; k++) {
            const off = rt.probes[k];
            if (!this._moverTrackSolid(rt, u.x + u.ux * off, u.z + u.uz * off, u.ux, u.uz)) { solid = false; break; }
          }
          if (solid) continue;
          u.phase = 'fall';
          u.fwd = rt.speed;   // momentum carries it off the end of the rails
          u.vy = 0;
          u.tilt = 0;
          this.events.push({ type: 'derail', mover: rt.src.id != null ? rt.src.id : mi, unit: ui, x: u.x, z: u.z });
          continue;
        }

        if (u.phase === 'fall') {
          const preBase = u.y;
          u.s += u.fwd * dt;
          const p = moverPose(rt.arc, u.s);
          u.x = p.x; u.z = p.z; u.ux = p.ux; u.uz = p.uz;
          u.vy -= this._fallG(1) * dt;   // UNIFORM gravity (owner ruling 2026-08-11)
          u.y += u.vy * dt;
          u.tilt = Math.min(0.35, u.tilt + 0.9 * dt);  // nose dips as it plunges
          // Fully sunk into a hole: consumed — the blocks' SINK_Y rule scaled
          // to the car's own height. Checked before any landing so a car that
          // dipped into a void it only PARTLY covers still goes down the hole
          // (once it is below the street it cannot climb back out).
          if (rt.eatable && u.y + rt.height <= SINK_Y) {
            this._consumeMoverUnit(rt, u, this._moverEater(u, hp, nh));
            continue;
          }
          const sup = this._moverSupport(rt, u, hp, nh, preBase);
          if (sup.voided) continue;
          // Landing takes the debris walk's pre-move-base rule: a surface only
          // counts if the car was at or above it BEFORE this step's motion —
          // never a snap up out of a hole, never a tunnel through a floor.
          if (u.y <= sup.top && preBase >= sup.top - 0.05) {
            const hard = u.vy < -8;
            u.y = sup.top;
            u.vy = 0;
            u.phase = rt.groundRun ? 'ground' : 'rest';
            u.fwd = rt.groundRun ? rt.groundSpeed : 0;
            u.tilt = hard ? -0.22 : -0.12;  // the landing slam, settled below
          }
          continue;
        }

        // ground | rest — the runaway (or the wreck), following whatever holds
        // it up, falling again when the ground opens.
        const preBase = u.y;
        if (u.phase === 'ground') {
          u.s += u.fwd * dt;
          const p = moverPose(rt.arc, u.s);
          u.x = p.x; u.z = p.z; u.ux = p.ux; u.uz = p.uz;
        }
        u.tilt *= 1 - 4 * dt;
        const sup = this._moverSupport(rt, u, hp, nh, preBase);
        if (sup.voided || sup.top < u.y - 0.5) {
          u.phase = 'fall';
          u.vy = 0;
          continue;
        }
        u.y = sup.top;
      }
    }
  }

  // A derailed unit swallowed whole: the same attribution, scoring, combo and
  // milestone arithmetic as a block (`_award` IS `_consume`'s scoring half),
  // and the same wire life — the eat event carries `obj.id`, which lives in
  // the block id space, so snapshots and the keyframe's eaten bitset carry it
  // with zero new wire format.
  _consumeMoverUnit(rt, u, h) {
    u.phase = 'consumed';
    const obj = { id: u.id, mover: true, x: u.x, y: u.y, z: u.z, sAvg: u.sAvg };
    this._award(h || this.holes[0], rt.unitMass, obj);
  }

  // --- consumption → score / growth / combo -------------------------------------

  // `h` is the hole doing the eating — attribution is decided by the caller
  // (first hole in index order whose void covers the block), so a block can
  // never be double-counted and mass is never created from nothing. Defaults
  // to holes[0] for external probes (tools/validate.mjs's win guard feeds
  // blocks in directly).
  _consume(b, h = this.holes[0]) {
    b.state = 'consumed';
    // The renderer hides consumed blocks, and `_syncFalling` drops this entry at
    // the top of the NEXT step — which, with the fixed-timestep catch-up in
    // main.js, can happen before the renderer ever runs again. Announce it.
    this._renderDirty(b);
    this._leanSet.delete(b);            // never rendered again; do not leak the entry
    this._fallingRemoved++;             // stale entry in the active mover list
    this._dirtyComps.add(this._compOf[b.bi]); // its zone's support graph shrank
    this._unsleep(b); // sleeping debris: unregister + drop solid contribution
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iy = 0; iy < b.fsy; iy++) {
        for (let iz = 0; iz < b.fsz; iz++) {
          this.grid.delete(key(b.gx + ix, b.gy + iy, b.gz + iz));
        }
      }
    }
    this._graphDirty = true;
    const vol = b.sx * b.sy * b.sz;
    this._award(h, b.mat.mass * vol, b);
  }

  // The scoring half of consumption, shared verbatim between blocks
  // (`_consume`) and mover units (`_consumeMoverUnit`): chain, combo events,
  // score/raw mass, SIZE ladder, growth and milestone events. Extracted, not
  // rewritten — same operations in the same order, so every shipped scene's
  // arithmetic is bit-identical to the pre-extraction build.
  _award(h, raw, obj) {
    const prevLevel = comboLevel(h.chain);
    h.chain += 1;
    h.chainTimer = COMBO_WINDOW;
    h.bestCombo = Math.max(h.bestCombo, h.chain);
    const isFrenzy = hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.FRENZY);
    const frenzyMult = isFrenzy ? 2.0 : 1.0;
    const baseMult = isFrenzy ? Math.max(comboMult(h.chain), h.chain) : comboMult(h.chain);
    const gained = raw * baseMult * frenzyMult;
    h.mass += gained;      // the SCORE: combo-multiplied, and displayed as such
    h.rawMass += raw;      // un-multiplied: the goal bar, the milestones and the SIZE ladder
    h.eatenCount += 1;
    // SIZE progression: escalating RAW-mass thresholds (scaled per scene — see
    // the constructor). Radius interpolates smoothly inside each level
    // (+0.5 m per level), so growth still reads continuously.
    //
    // POINTS-ONLY (ADR-0015): this reads `rawMass`, not `mass`. A combo is
    // worth a bigger number and nothing else, so every scene paces the same way
    // for a sloppy run and a hot one, and the ×8 top of the new ladder cannot
    // turn a city into a ninety-second run.
    const prevSize = h.size;
    let size = 1;
    while (size < MAX_SIZE && h.rawMass >= this._sizeLadder[size]) size++;
    h.size = size;
    const lo = this._sizeLadder[size - 1], hi = size < MAX_SIZE ? this._sizeLadder[size] : Infinity;
    h.sizeFrac = size >= MAX_SIZE ? 1 : Math.min(1, (h.rawMass - lo) / (hi - lo));
    const isTitan = hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.TITAN);
    h.radius = isTitan ? MAX_RADIUS : (START_RADIUS + (h.size - 1 + Math.min(1, h.sizeFrac)) * 0.5);
    this.events.push({ type: 'eat', obj, hole: h, gained, chain: h.chain });
    // milestone events (render-side juice: shakes, bursts, big pops, toasts)
    if (h.size > prevSize) {
      this.events.push({ type: 'growth', size: h.size, hole: h });
    }
    // Combo ladder step. Additive event: the renderer pulses the combo meter
    // from it, and it carries the level and the multiplier the sim is actually
    // applying so no consumer has to re-derive either.
    const level = comboLevel(h.chain);
    if (level > prevLevel || isFrenzy) {
      this.events.push({
        type: 'combo', level, mult: baseMult, chain: h.chain,
        name: isFrenzy ? `x${baseMult}` : COMBO_LEVEL_NAMES[level], top: isFrenzy || level >= COMBO_MAX_LEVEL, hole: h,
      });
    }
    // Consumption milestones, against the scene GOAL rather than the whole city
    // (FR-016) so the last row lands exactly on goal completion in every scene.
    // Monotonic by index, so progress oscillating around a threshold can never
    // fire the same row twice (SYS-407).
    const goalFrac = Math.min(1, h.rawMass / (this.totalMass * this.goal.targetFraction));
    while (this._massMarkIdx < MILESTONES.length && goalFrac >= MILESTONES[this._massMarkIdx].at) {
      const row = MILESTONES[this._massMarkIdx];
      this._massMarkIdx++;
      // `frac` is kept alongside `row` because js/skins.js already reads it.
      this.events.push({ type: 'milestone', frac: row.at, row, text: row.text, tier: row.tier, hole: h });
    }
  }

  // --- main step -----------------------------------------------------------------

  /**
   * Advance the whole world by `dt`.
   *
   * `move` is either ONE steering vector `{x, z}` — today's single-player call,
   * applied to `holes[0]` while every other hole coasts — or an ARRAY of
   * vectors, one per hole in roster order (null/undefined entries coast). The
   * signature deliberately keeps `step.length === 2`: js/net/host.js feature-
   * detects the single-hole calling convention with `sim.step.length >= 2` and
   * both shapes flow through this one method.
   */
  step(dt, move) {
    this.time += dt;
    const holes = this.holes;
    const moves = Array.isArray(move) ? move : null;

    for (let hi = 0; hi < holes.length; hi++) {
      const h = holes[hi];
      const m = moves ? moves[hi] : (hi === 0 ? move : null);

      stepActivePowerUps(h.activePowerUps, dt);

      const isTitan = hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.TITAN);
      h.radius = isTitan ? MAX_RADIUS : (START_RADIUS + (h.size - 1 + Math.min(1, h.sizeFrac)) * 0.5);

      if (hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.FRENZY) ||
          hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.CHRONO)) {
        if (h.chain > 0) h.chainTimer = COMBO_WINDOW;
      } else if (h.chainTimer > 0) {
        h.chainTimer -= dt;
        if (h.chainTimer <= 0) h.chain = 0;
      }

      // Unlike campaign movement, the sandbox gets more capable as a hole
      // grows: bigger holes cover the district faster instead of feeling
      // sluggish at the end of the ladder.
      const sizeT = sandboxSizeProgress(h.size, h.sizeFrac);
      const speedBoost = hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.SPEED) ? 1.7 : 1.0;
      const speed = playerSpeedForRadius(h.radius) * this.tune.speed * (1 + SANDBOX_SPEED_RAMP * sizeT) * speedBoost;
      if (m && (m.x || m.z)) {
        const len = fwHypot2(m.x, m.z) || 1;
        h.x += (m.x / len) * speed * dt;
        h.z += (m.z / len) * speed * dt;
        // `boundsRect` wins when a scene sets it (off-center maps need an
        // asymmetric clamp); otherwise the scalar square around the origin.
        const r = this.boundsRect;
        h.x = Math.min(r ? r.maxX : this.bounds, Math.max(r ? r.minX : -this.bounds, h.x));
        h.z = Math.min(r ? r.maxZ : this.bounds, Math.max(r ? r.minZ : -this.bounds, h.z));
      }

    }
    this._collectCoins();

    // Step wandering ground power-ups, lifespan expiration, and boundary reflections
    const expiredList = stepGroundPowerUps(this.powerups, this.boundsRect, dt, this.powerupRng);
    for (const exp of expiredList) {
      this.events.push({ type: 'powerup_despawn', powerup: exp });
    }
    this.powerups = this.powerups.filter((p) => !p.collected && !p.expired);

    // Intermittent power-up respawns on the board (capped at MAX_MAP_POWERUPS = 2, independent 30s cooldown per eaten slot)
    for (let i = this.powerupRespawnTimers.length - 1; i >= 0; i--) {
      this.powerupRespawnTimers[i] -= dt;
      if (this.powerupRespawnTimers[i] <= 0) {
        this.powerupRespawnTimers.splice(i, 1);
        const activeGround = this.powerups.filter((p) => !p.collected);
        if (activeGround.length < MAX_MAP_POWERUPS) {
          const pu = this._spawnIntermittentPowerUp();
          if (pu) this.events.push({ type: 'powerup_spawn', powerup: pu, reason: 'intermittent' });
        }
      }
    }
    const activeGroundCount = this.powerups.filter((p) => !p.collected).length;
    if (activeGroundCount + this.powerupRespawnTimers.length < MAX_MAP_POWERUPS) {
      this.powerupRespawnTimers.push(30.0);
    }

    this._collectPowerups();

    // Scheduled Natural Disasters (Meteors & Storms):
    const elapsed = this.time;
    const is90s = this.mode === 'run90' || this.clockLimit === 5400;
    const disaster2Time = is90s ? 70.0 : (this.clockLimit ? Math.max(180.0, (this.clockLimit / 60) - 60.0) : 240.0);

    if (this.scene !== 'gallery' && !this.disastersTriggered.has('disaster2') && elapsed >= disaster2Time) {
      this.disastersTriggered.add('disaster2');
      this._triggerNaturalMeteorDisaster();
    }

    // Dynamic cataclysm storm system (Tornado & Hurricane)
    if (this.stormSystem) this.stormSystem.step(dt);

    // Tornado / Hurricane Cyclonic Twister Physics on active loose movers:
    if (this.stormSystem && this.stormSystem.state === 'active') {
      const sx = this.stormSystem.vortexX;
      const sz = this.stormSystem.vortexZ;
      const sRad = 20.0, sRad2 = sRad * sRad;
      const minX = sx - sRad, maxX = sx + sRad;
      const minZ = sz - sRad, maxZ = sz + sRad;

      for (let hi = 0; hi < holes.length; hi++) {
        const h = holes[hi];
        const dist = fwHypot2(h.x - sx, h.z - sz);
        if (dist <= (this.stormSystem.vortexRadius || 12.0) + h.radius) {
          if (!h._disasterTeleportCd || this.time >= h._disasterTeleportCd) {
            h._disasterTeleportCd = this.time + 4.0;
            this._teleportHoleFromDisaster(h, 'storm');
          }
        }
      }
      let swirled = 0;
      for (let i = 0; i < this._falling.length; i++) {
        const b = this._falling[i];
        if (!b || b.consumed) continue;
        if (b.x < minX || b.x > maxX || b.z < minZ || b.z > maxZ) continue;
        const dx = b.x - sx, dz = b.z - sz;
        const d2 = dx * dx + dz * dz;
        if (d2 < sRad2 && d2 > 0.04) {
          const d = fwHypot2(dx, dz) || 1;
          const nx = dx / d, nz = dz / d;
          // Tangential cyclonic swirl around the funnel eye
          const swirlSpeed = 16.0 * (1.0 - d / sRad * 0.4);
          const targetVx = -nz * swirlSpeed - nx * 3.5;
          const targetVz = nx * swirlSpeed - nz * 3.5;
          b.vx += (targetVx - b.vx) * 4.0 * dt;
          b.vz += (targetVz - b.vz) * 4.0 * dt;
          // Updraft lifting voxels up the funnel
          if (b.y < 20.0) {
            b.vy += (18.0 - b.vy) * 3.0 * dt;
          } else {
            // Fling outward at the funnel top
            b.vx += nx * 16.0 * dt;
            b.vz += nz * 16.0 * dt;
            b.vy -= 6.0 * dt;
          }
          swirled++;
          if (swirled >= 48) break;
        }
      }
    }

    // Vortex vacuum pull on active loose movers
    for (let hi = 0; hi < holes.length; hi++) {
      const h = holes[hi];
      if (hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.VORTEX)) {
        const vr = 22.0, vr2 = vr * vr;
        for (const b of this._falling) {
          if (!b || b.consumed) continue;
          const dx = h.x - b.x, dz = h.z - b.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.25 && d2 < vr2) {
            const d = fwHypot2(dx, dz);
            const pull = (1 - d / vr) * 35.0 * dt;
            b.vx += (dx / (d || 1)) * pull;
            b.vz += (dz / (d || 1)) * pull;
          }
        }
      }
    }

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
    // Every hole's coverage must be evaluated every step (the sets swap), so
    // no short-circuit: OR is accumulated across the roster in index order.
    let covChanged = false;
    for (let hi = 0; hi < holes.length; hi++) {
      if (this._coverageChanged(holes[hi])) covChanged = true;
    }
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
    // 4b. simulated movers (no-op unless the scene opted a mover in). After the
    // debris passes so a unit's track/ground sampling sees this step's final
    // solidity, before the win check so a swallowed car can close the goal on
    // the step it sinks.
    this._stepMovers(dt);
    // Relative epsilon, and it is load-bearing rather than defensive. `rawMass`
    // is accumulated one add per block as the city is eaten; `totalMass` is a
    // reduce() over the same blocks in placement order. Same summands, different
    // order, so float rounding leaves rawMass a few parts in 1e12 BELOW
    // totalMass even after every block is gone. A scene whose targetFraction is
    // 1.0 can therefore consume 3798 of 3798 blocks, sit at 100.000%, and never
    // win; the HUD floors the percentage, so the player watches 99% forever.
    // 1e-9 of the total is ~1000x the accumulated error and still far below the
    // mass of the lightest single block, so it cannot win a scene early.
    //
    // This used to be a gallery-only hazard, because the gallery was the only
    // 1.0 scene and the 0.5 cities had half a city of slack hiding it. Every
    // scene is 1.0 now (R-2.1), so every scene depends on this epsilon and the
    // guard in tools/validate.mjs runs against all of them, not just the one.
    if (this.mode === 'run90') {
      this.rankedTicks++;
      if (this.rankedTicks >= RANKED_TICK_COUNT) {
        this.runComplete = true;
        this.over = true;
        this.events.push({ type: 'run-complete', ticks: this.rankedTicks, hole: this.hole });
      }
      return;
    }

    const goalMass = this.totalMass * this.goal.targetFraction - this.totalMass * 1e-9;
    if (!this.won) {
      // first hole in index order to cross the goal takes it — deterministic
      for (let hi = 0; hi < holes.length; hi++) {
        const h = holes[hi];
        if (h.rawMass >= goalMass) {
          this.won = true;
          this.over = true;
          this.events.push({ type: 'goal', goal: this.goal, hole: h });
          break;
        }
      }
    }

    // --- the level clock (R-1.3) ---------------------------------------------
    // LAST in the step, and after the goal check on purpose: a full clear landing
    // on the same tick the clock runs out is a win, not a time-out. Counted in
    // TICKS, so expiry is the same tick on every device (R-1.4) and a slow phone
    // gets the same game rather than a shorter one. Pausing simply stops calling
    // step(), so nothing here has to know about pause or tab visibility (R-1.6).
    //
    // Expiry is a NORMAL ending. It sets the same `over` latch the goal does and
    // lands on the same results screen carrying the percentage reached; `won`
    // stays false and `timedOut` says which of the two happened.
    const chronoActive = holes.some((h) => hasActivePowerUp(h.activePowerUps, POWERUP_TYPES.CHRONO));
    if (this.clockLimit !== null && !chronoActive) {
      this.clockTicks++;
      this.timeLeft = Math.max(0, (this.clockLimit - this.clockTicks) / 60);
      // The 30 s and 10 s endgame states, monotonic by index so a mark can only
      // ever fire once (the same rule the milestone ladder runs on).
      while (this._clockMarkIdx < this._clockMarks.length
             && this.clockTicks >= this._clockMarks[this._clockMarkIdx].tick) {
        const mark = this._clockMarks[this._clockMarkIdx++];
        this.events.push({ type: 'clock', at: mark.at, timeLeft: this.timeLeft, hole: this.hole });
      }
      if (!this.over && this.clockTicks >= this.clockLimit) {
        this.timedOut = true;
        this.over = true;
        this.events.push({ type: 'timeup', ticks: this.clockTicks, hole: this.hole });
      }
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
