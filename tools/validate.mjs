// Headless proof that every level is beatable, overlap-free, and snack-ringed.
// Run: node tools/validate.mjs [levelIndex]
// Uses the exact same citygen + sim code as the game.

import { LEVELS } from '../js/levels.js';
import { generateCity } from '../js/citygen.js';
import { Sim } from '../js/sim.js';
import { isEdible } from '../js/tiers.js';
import {
  VoxelSandboxSim, COMBO_THRESHOLDS, COMBO_STEP, COMBO_MAX_LEVEL, COMBO_LEVEL_NAMES,
  MILESTONES, MILESTONE_TIERS, RANKED_TICK_COUNT, SCENE_GOALS, comboLevel, comboMult,
  CHALLENGE_COIN_MULTIPLIER, RANKED_TUNE, RANKED_SIM_VERSION,
  loadScene,
} from '../js/voxelsim.js';
import { POWERUP_TYPES, POWERUP_SPECS, activatePowerUp, createPowerUp } from '../js/powerups.js';
import { PLAYER_MAX_RADIUS } from '../js/tiers.js';
import {
  LEVEL_CLOCK_SECONDS, LEVEL_CLOCK_TICKS,
  CHALLENGE_CLOCK_SECONDS, CHALLENGE_CLOCK_TICKS,
  SECRET_CHALLENGE_CLOCK_SECONDS, SECRET_CHALLENGE_CLOCK_TICKS,
} from '../js/levelclock.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import {
  BROOKLYN_CROSSINGS, BROOKLYN_OPEN_GROUND, BROOKLYN_ROAD_SPANS, BROOKLYN_STREETS,
  BROOKLYN_VEHICLES, vehicleBBox, XW_LEN,
} from '../js/voxelscene-brooklyn.js';
import {
  UPPER_MANHATTAN_CROSSINGS, UPPER_MANHATTAN_OPEN_GROUND, UPPER_MANHATTAN_ROAD_SPANS,
  UPPER_MANHATTAN_STREETS, UPPER_MANHATTAN_VEHICLES, XW_LEN as UM_XW_LEN,
} from '../js/voxelscene-upper-manhattan.js';
import {
  BOSTON_CROSSINGS, BOSTON_OPEN_GROUND, BOSTON_ROAD_SPANS, BOSTON_STREETS,
  BOSTON_VEHICLES, XW_LEN as BOS_XW_LEN,
} from '../js/voxelscene-boston.js';
import {
  CAMBRIDGE_CROSSINGS, CAMBRIDGE_DISTRICTS, CAMBRIDGE_HEROES, CAMBRIDGE_OPEN_GROUND,
  CAMBRIDGE_ROAD_SPANS, CAMBRIDGE_ROUTE, CAMBRIDGE_STREETS, CAMBRIDGE_VEHICLES,
  CAM_XW_LEN,
} from '../js/voxelscene-cambridge.js';
import {
  CHICAGO_CROSSINGS, CHICAGO_DISTRICTS, CHICAGO_HEROES, CHICAGO_OPEN_GROUND,
  CHICAGO_ROAD_SPANS, CHICAGO_ROUTE, CHICAGO_STREETS, CHICAGO_VEHICLES,
  CHICAGO_XW_LEN,
} from '../js/voxelscene-chicago.js';
import {
  SYDNEY_CROSSINGS, SYDNEY_OPEN_GROUND, SYDNEY_ROAD_SPANS, SYDNEY_STREETS,
  SYDNEY_VEHICLES,
} from '../js/voxelscene-sydney.js';
import {
  CURRENT_VERSION, __freshSave, __MIGRATIONS, recordLevelResult,
  isCityChallengeCompleted, getCompletedChallengeCount, isSecret90sChallengeUnlocked, recordChallengeResult,
} from '../js/save.js';
import { UPGRADES, UPGRADE_COST_TABLE, upgradeCost, upgradeMultiplier, defaultUpgrades, SHOP_CATEGORIES, getShopItemsByCategory } from '../js/upgrades.js';
import { fwCbrt, fwCos, fwHypot2, fwHypot3, fwSin } from '../js/fwmath.js';
import { driveRoute, MAX_IDLE_FRAC } from './route-driver.mjs';
import { runBoardSelftest } from './board-selftest.mjs';
import { runHelpSelftest } from './help.test.mjs';
import { runTutorialSelftest } from './tutorial.test.mjs';
import { runMobileCameraSelftest } from './mobile-camera.test.mjs';
import { runMobileUiSelftest } from './mobile-ui.test.mjs';
import { runDeviceDetectionSelftest } from './device-detection.test.mjs';
import { runMobileZoomControlsSelftest } from './mobile-zoom-controls.test.mjs';
import { runCampaignSelftest } from './validate-campaign.mjs';
import { runCampaignUiSelftest } from './campaign-ui.test.mjs';
import { runCameraSmoothingSelftest } from './camera-smoothing.test.mjs';
import { readdirSync, readFileSync } from 'node:fs';

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Authored city modules load on demand in the game (js/voxelsim.js registry), so
// the validator has to ask for them before it constructs any of the six. It is
// deliberately ALL of them, once, up here rather than beside each scene's block:
// dynamic import inside the worker process was re-evaluating each module on
// demand and paying disk I/O on every scene.
//
// Skipped in orchestrator mode (no FW_VALIDATE_SECTIONS and no FW_VALIDATE_SEQ,
// see the execution-modes block at the bottom): the parent spawns one child per
// section group and never constructs a sim itself, so paying scene loads in
// the parent would be pure overhead. Every CHILD sets FW_VALIDATE_SECTIONS and
// therefore lands here with the guard true.
if (process.env.FW_VALIDATE_SECTIONS || process.env.FW_VALIDATE_SEQ) {
  await Promise.all(['sydney', 'manhattan', 'upper-manhattan', 'brooklyn', 'boston', 'cambridge', 'chicago', 'tokyo'].map(loadScene));
}

const DT = 1 / 60;
let failures = 0;
const fail = (msg) => { failures++; console.error(`  FAIL: ${msg}`); };

function checkOverlap(city, levelIndex) {
  const objs = city.objects;
  let checked = 0;
  for (const o of objs) {
    city.hash.query(o.x, o.z, o.radius + 3, (p) => {
      if (p.id <= o.id) return;
      const dx = p.x - o.x, dz = p.z - o.z;
      const rr = p.radius + o.radius + 0.05;
      if (dx * dx + dz * dz < rr * rr) {
        fail(`L${levelIndex}: overlap between #${o.id}(${o.kind}) and #${p.id}(${p.kind})`);
      }
      checked++;
    });
  }
  return checked;
}

function checkSnackRing(city, levelIndex) {
  const s = city.spawn;
  let near = 0;
  for (const o of city.objects) {
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d <= 6 && o.tier <= 2) near++;
  }
  if (near < 10) fail(`L${levelIndex}: only ${near} snack objects within 6m of spawn (need >=10)`);
}

// Greedy bot: steer toward nearest currently-edible object; re-plan continuously.
function runBot(level) {
  const sim = new Sim(level);
  let firstEatTime = null;
  let prevCount = 0;
  while (!sim.over && sim.time < level.clock + 1) {
    const p = sim.player;
    // nearest edible object (player radius gate only)
    let best = null, bestD = Infinity;
    sim.city.hash.query(p.x, p.z, 60, (o) => {
      if (o.eaten || o.shielded) return;
      if (!isEdible(p.radius, o.tier)) return;
      const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = o; }
    });
    // if nothing edible nearby, scan whole map (bounds-aware)
    if (!best) {
      for (const o of sim.city.objects) {
        if (o.eaten || o.shielded || !isEdible(p.radius, o.tier)) continue;
        const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    let move = { x: 0, z: 0 };
    if (best) move = { x: best.x - p.x, z: best.z - p.z };
    sim.step(DT, move);
    if (firstEatTime === null && sim.player.eatenCount > prevCount) firstEatTime = sim.time;
    prevCount = sim.player.eatenCount;
  }
  return { sim, firstEatTime };
}

const onlyIndex = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const levelsToCheck = onlyIndex ? LEVELS.filter((l) => l.index === onlyIndex) : LEVELS;

// --- voxel sandbox checks ----------------------------------------------------
// The sandbox is a pure sim too: it must be deterministic, collapse only in
// reaction to the hole, and never NaN out.

// Scripted hole tour: hold south of the tower (locality probe), then drive
// through every district and object type in the gallery.
const VOXEL_PATH = [
  // `hold` opts this leg out of arrival advance (see driveRoute): the 3 s idle
  // is the point of it — `nonStatic3`/`eaten3` below assert that a hole sitting
  // still collapses and consumes NOTHING — so reaching the spot early must not
  // end it early.
  { until: 3, x: 0, z: 16, hold: true },   // hold (stability probe)
  { until: 6, x: -6, z: 13 },     // street furniture, west half
  { until: 8, x: 8, z: 13 },      // street furniture, east half
  { until: 12, x: 0, z: 6 },      // tower south edge
  { until: 16, x: 0, z: 0 },      // tower center
  { until: 20, x: 10.5, z: 0.5 }, // car
  { until: 22, x: 17.5, z: 0.5 }, // taxi
  { until: 24, x: 11, z: 4.2 },   // bus
  { until: 26, x: 17.5, z: 4.5 }, // police
  { until: 28, x: 11, z: -3.5 },  // garbage + fire trucks
  { until: 31, x: 12, z: -12 },   // crane
  { until: 33, x: 17, z: -10.5 }, // containers
  { until: 36, x: -14, z: -11 },  // fountain + statue
  { until: 38, x: -18, z: -12 },  // water tower
  { until: 40, x: -17, z: -6.5 }, // apartment
  { until: 42, x: -20, z: 0.5 },  // church
  { until: 44, x: -14.5, z: 5.5 },// brownstone
  { until: 46, x: -18.5, z: 10.5 },// parking garage
  { until: 48, x: -9, z: 9.5 },   // crate pile
  { until: 50, x: 12, z: 11 },    // warehouse
  { until: 53, x: 21, z: 11.5 },  // gas station
  { until: 56, x: 0, z: 22 },     // elevated track
];

// Every scripted excursion below is driven by `driveRoute` from
// ./route-driver.mjs — a single module rather than a copy per scene, because
// the copies are how RCA-2026-08-17 shipped: the driver advanced its waypoints
// on the CLOCK, so any hole fast enough to arrive early stood still for the
// rest of the window and the probe measured idle time instead of the scene.
// That module's header carries the full argument and the A/B numbers; the
// arrival-driven, looping replacement is what makes the excursions insensitive
// to hole speed. `run.__route` is where it stashes laps/idle/distance.

// The per-scene half of the speed-invariance pin, run on every excursion this
// file drives at zero extra cost — the numbers come off the run that already
// happened. `validateSpeedInvariance` below proves the ratio clause on one
// scene at two speeds; this proves the absolute clause on ALL of them, which is
// what stops the next scene degrading unwatched the way section 5 of the RCA
// found brooklyn and cambridge already were.
// MAX_IDLE_FRAC (2%) is a ceiling with margin, not a measurement: every shipped
// excursion currently reports 0.0% parked, and the broken driver reported 71.4%
// and 85.6% on the two pin arms. Anywhere in between is a route that has started
// waiting on its own clock again. Pinning it at the measured 0% would fail on the
// first legitimate route that has to pause for a lap boundary, and a pin that
// cries wolf gets deleted rather than investigated.
function probeRouteSpent(name, run, what = 'excursion') {
  const r = run.__route;
  if (!r) { fail(`${name}: ${what} was not driven through driveRoute — no route stats to check`); return; }
  if (r.idleFrac > MAX_IDLE_FRAC) {
    const overBy = (r.idleFrac - MAX_IDLE_FRAC) * r.steps;
    fail(`${name}: the ${what} left the hole standing still for ${(r.idleFrac * 100).toFixed(1)}% of its ${r.steps} ticks (max ${(MAX_IDLE_FRAC * 100).toFixed(0)}%, over by ${overBy.toFixed(0)} ticks / ${(overBy / 60).toFixed(1)}s) — a parked hole measures the clock, not the scene`);
  }
  // Printed on every run, pass or fail. The absence of exactly this line is what
  // let the 2026-08-17 regression ship: nothing reported how the excursion spent
  // its time, so a hole that idled 85% of the run looked like a scene that had
  // got harder. Route stats are free — they come off the run that already happened.
  console.log(`    ${name} ${what}: laps=${r.laps} idle=${(r.idleFrac * 100).toFixed(1)}% dist=${r.dist.toFixed(0)}m over ${r.seconds}s`);
}

function runVoxelSandbox() {
  const snap = {};
  let maxUnstable = 0;
  const sim = driveRoute(new VoxelSandboxSim({ seed: 'validator' }), VOXEL_PATH, 56, (i, run) => {
    maxUnstable = Math.max(maxUnstable, run.blocks.filter((b) => b.state === 'unstable').length);
    if (i === 2.5 * 60) { // sample while the hole is definitely still idling (VOXEL_PATH[0] holds to t=3)
      snap.eaten3 = run.hole.eatenCount;
      snap.nonStatic3 = run.blocks.filter((b) => b.state !== 'static').length;
    }
    if (i === 10 * 60) snap.eaten10 = run.hole.eatenCount;
    if (i === 20 * 60) snap.eaten20 = run.hole.eatenCount;
  });
  return { sim, snap, maxUnstable };
}

function validateVoxelSandbox() {
  console.log('Validating voxel sandbox...');

  // 2026-08-17 feel retune: the sandbox hole-speed default moved 1.4 -> 1.8.
  // The ranked contract (RANKED_TUNE) reads the SAME constant, so the retune
  // is also a ranked-physics change: a replay under 1.8 does not reproduce the
  // 1.4 score trajectory. RANKED_SIM_VERSION must therefore be off 1 — the
  // verifier marks cross-version rows unverifiable rather than cheating, and
  // an unbumped version would let a 1.4 replay be judged against 1.8 physics.
  if (RANKED_TUNE.speed !== 1.8) {
    fail(`ranked tune speed is ${RANKED_TUNE.speed}, expected the 1.8 retune`);
  }
  if (RANKED_SIM_VERSION < 2) {
    fail(`RANKED_SIM_VERSION is ${RANKED_SIM_VERSION} — the 1.8 speed retune changed ranked physics and must bump it`);
  }

  // Invariant guard: pure sim files must never use Math.random (rng.js only).
  //
  // The scene list is GLOBBED rather than enumerated. It used to be a hardcoded
  // array, which meant every new scene file was unguarded from the moment it was
  // written until someone remembered to add it — and the whole point of the
  // guard is that a scene is deterministic, so the newest file is the one most
  // likely to break it and the least likely to be on the list. Boston shipped
  // and escaped the guard entirely; that is the class of bug being closed, not
  // the instance. Anything matching js/voxelscene-*.js is now covered on sight.
  //
  // The glob deliberately does NOT widen to all of js/. Renderer and input code
  // are allowed randomness and use it: js/camera.js calls Math.random() three
  // times for screen shake, js/voxelworld.js thirty-one times for facade and
  // debris variation. Those are per-frame presentation, they never feed sim
  // state, and sweeping them in would replace a real invariant with noise.
  // The regex requires the open paren so that a header comment discussing
  // Math.random does not trip it.
  const SIM_PURE_NAMED = ['rng', 'tiers', 'citygen', 'levels', 'sim', 'voxelsim', 'voxelkit', 'voxelforms', 'fwmath', 'levelclock', 'powerups'];
  const sceneFiles = readdirSync(new URL('../js/', import.meta.url))
    .filter((f) => /^voxelscene-.+\.js$/.test(f))
    .map((f) => f.replace(/\.js$/, ''))
    .sort();
  if (sceneFiles.length === 0) fail('Math.random guard found no js/voxelscene-*.js — the glob is broken');
  for (const f of [...SIM_PURE_NAMED, ...sceneFiles]) {
    const src = readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8');
    if (/Math\.random\(/.test(src)) fail(`js/${f}.js uses Math.random() — pure sim files must use rng.js`);
  }

  const a = runVoxelSandbox();
  const b = runVoxelSandbox();

  // determinism: identical seed + inputs → identical outcome
  if (a.sim.hole.eatenCount !== b.sim.hole.eatenCount ||
      a.sim.hole.mass.toFixed(6) !== b.sim.hole.mass.toFixed(6)) {
    fail(`voxel sandbox not deterministic (eaten ${a.sim.hole.eatenCount} vs ${b.sim.hole.eatenCount}, mass ${a.sim.hole.mass.toFixed(3)} vs ${b.sim.hole.mass.toFixed(3)})`);
  }

  // locality: while the hole idles far away for 3s, nothing may collapse or
  // be consumed — the structure only reacts to actual support loss
  if (a.snap.nonStatic3 !== 0) fail(`voxel sandbox: ${a.snap.nonStatic3} blocks non-static at t=3s with the hole far away (spontaneous collapse)`);
  if (a.snap.eaten3 !== 0) fail(`voxel sandbox: ${a.snap.eaten3} blocks consumed at t=3s before the hole reached anything`);
  if (a.maxUnstable !== 0) fail(`voxel sandbox: ${a.maxUnstable} blocks remained in the unstable delay state (collapse should be immediate)`);

  // progressive collapse: consumption keeps growing as the hole excavates
  if (!(a.snap.eaten10 < a.snap.eaten20)) {
    fail(`voxel sandbox: collapse not progressive (eaten t=10s: ${a.snap.eaten10}, t=20s: ${a.snap.eaten20})`);
  }
  probeRouteSpent('voxel sandbox', a.sim, 'gallery tour');
  if (a.sim.hole.eatenCount < 20) fail(`voxel sandbox: only ${a.sim.hole.eatenCount} blocks consumed in 30s tour (expected >=20)`);
  // progression attainable: the scripted tour must reach at least SIZE 8
  if (a.sim.hole.size < 8) fail(`voxel sandbox: tour reached only SIZE ${a.sim.hole.size} (expected >=8 — progression too steep?)`);

  // sanity: no NaN/Infinity anywhere; consumption bounded by the block count
  let bad = 0;
  for (const bl of a.sim.blocks) {
    if (!Number.isFinite(bl.x) || !Number.isFinite(bl.y) || !Number.isFinite(bl.z)) bad++;
  }
  for (const c of a.sim.chunks) {
    if (!Number.isFinite(c.cx) || !Number.isFinite(c.cy) || !Number.isFinite(c.cz)) bad++;
  }
  if (bad > 0) fail(`voxel sandbox: ${bad} non-finite block/chunk positions after 30s`);
  if (a.sim.hole.eatenCount > a.sim.totalBlocks) fail(`voxel sandbox: consumed ${a.sim.hole.eatenCount} > total ${a.sim.totalBlocks}`);

  // The ADR-0013 vocabulary contract. These are AUTHORING probes, so they need
  // the scene as authored: `a.sim` has driven the full 56 s tour and its blocks
  // have fallen, rotated and been consumed, which turns every one of them into
  // noise. Every other scene runs its probes on a fresh sim; this one has to
  // build a second one to get the same thing.
  const fresh = new VoxelSandboxSim({ seed: 'validator' });
  probeGradeDiagonal(fresh, 'voxel sandbox');
  probePlacementStep(fresh, 'voxel sandbox');
  probeDistrictDensity(fresh, 'voxel sandbox', [], VOXEL_PATH);   // no districts declared — vacuous
  probeHeroIdentity(fresh, 'voxel sandbox', []);                  // no hero pair declared — vacuous

  console.log(`  voxel sandbox: eaten=${a.sim.hole.eatenCount}/${a.sim.totalBlocks} raw=${a.sim.hole.rawMass.toFixed(1)} score=${a.sim.hole.mass.toFixed(0)} peakChain=${a.sim.hole.bestCombo} size=${a.sim.hole.size} radius=${a.sim.hole.radius.toFixed(2)} (t=10s: ${a.snap.eaten10}, t=20s: ${a.snap.eaten20})`);

  // Recent Lab overhaul (architecture, scoring, 4s powerup overhead sequence,
  // smooth steering) added its own behaviour surface — HUD sandbox progress
  // bar width/95% indicator, level completion, spawn stability, and road
  // markings — that the checks above don't touch. Standalone suite, same
  // pattern as progress-api.test.mjs above.
  runSuite('tools/progress-and-lab.test.mjs');
}

// The helpers replace the only implementation-approximated math in replayed
// voxel physics. These are structural checks, not a claim that the host libm
// agrees with us: the shipped verifier and browser both evaluate this source.
function validateFwMath() {
  console.log('Validating deterministic ranked math...');
  const eps = 1e-11;
  if (Math.abs(fwHypot2(3, 4) - 5) > eps || Math.abs(fwHypot3(2, 3, 6) - 7) > eps) {
    fail('fwmath: fixed hypot vectors are wrong');
  }
  for (const x of [-0.7, -0.35, -0.1, 0, 0.25, 0.7]) {
    const sin = fwSin(x), cos = fwCos(x);
    if (!Number.isFinite(sin) || !Number.isFinite(cos) || Math.abs(sin * sin + cos * cos - 1) > eps) {
      fail(`fwmath: trig polynomial is unstable at ${x}`);
    }
  }
  for (const cube of [1 / 64, 1 / 8, 1, 8, 125]) {
    const root = fwCbrt(cube);
    if (Math.abs(root * root * root - cube) > eps) fail(`fwmath: cbrt iteration is inaccurate at ${cube}`);
  }
  const src = readFileSync(new URL('../js/voxelsim.js', import.meta.url), 'utf8');
  if (/Math\.(?:hypot|sin|cos|cbrt)\(/.test(src)) fail('fwmath: voxelsim still calls implementation-approximated ranked math');
}

function overlaps(a, b) {
  return Math.abs(a.x - b.x) < (a.sx + b.sx) / 2 &&
    Math.abs(a.y - b.y) < (a.sy + b.sy) / 2 &&
    Math.abs(a.z - b.z) < (a.sz + b.sz) / 2;
}

// `s` is a metre extent: a scalar for a cube, or [x, y, z] for a box (ADR-0013).
function collisionBody(id, x, y, z, s = 1) {
  const a = Array.isArray(s);
  const sx = a ? s[0] : s, sy = a ? s[1] : s, sz = a ? s[2] : s;
  return {
    id, state: 'falling', parentChunk: null, asleep: false, x, y, z, sx, sy, sz,
    vx: 0, vy: 0, vz: 0, vRotX: 0, vRotZ: 0, _inContact: false,
  };
}

function validateVoxelCollisions() {
  console.log('Validating voxel collision separation...');
  const sim = new VoxelSandboxSim({ seed: 'collision-validator' });
  const solid = sim.blocks.find((b) => b.state === 'static' && b.sx === 1 && b.sy === 1 && b.sz === 1);
  const mover = collisionBody(-1, solid.x, solid.y, solid.z);
  if (!sim._resolveStaticContacts(mover) || overlaps(mover, solid)) {
    fail('voxel collision: solid AABB separation left the mover embedded');
  }
  const a = collisionBody(-2, 0, 0, 0);
  const b = collisionBody(-3, 0.5, 0, 0);
  sim._separate(a, b, true);
  if (overlaps(a, b)) fail('voxel collision: loose-body separation left a pair overlapping');
  console.log('  voxel collision separation: solid and loose-body overlap probes clear');
}

// --- shared voxel-scene contract probes --------------------------------------
// Brooklyn and Upper Manhattan are authored against the same contracts, so every
// probe below lives here ONCE and each scene calls it. Two divergent copies of a
// contract check is exactly how a contract silently stops being enforced in one
// place, and this file has already paid for that lesson: the roadway probe spent
// three passes as a weakened fork in Upper Manhattan (foliage, or blocks a metre
// wide standing three metres up) while Brooklyn tested every physical block, and
// forty-six kerb rims stood in asphalt the entire time without a red line.
//
// Whatever is genuinely per-scene is a PARAMETER here — the scene's own exported
// tables, the ambient kinds it ships, the name in the message. It is never a
// second implementation, and a probe is never narrowed to make a scene pass.

const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
const blockRect = (bl) => ({ x: bl.x - bl.sx / 2, z: bl.z - bl.sz / 2, w: bl.sx, d: bl.sz });
// How a block's extent reads in a failure message: `1` for a cube, `2x0.5x2`
// for a box, so a report names the actual piece rather than one of its axes.
const sizeLabel = (bl) => (bl.sx === bl.sy && bl.sy === bl.sz ? bl.sx : `${bl.sx}x${bl.sy}x${bl.sz}`);

// Highest block top (m) per 1 m footprint cell. The camera-blocker probe and the
// bare-ground probe both key off it, so it is derived once per scene.
function footprintTops(sim) {
  const tops = new Map();
  for (const b of sim.blocks) {
    const top = (b.gy + b.fsy) * 0.25;
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fsx) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fsz) * 0.25); cz++) {
        const k = `${cx},${cz}`;
        if (!(tops.get(k) >= top)) tops.set(k, top);
      }
    }
  }
  return tops;
}

// Cell ownership: a block placed into an occupied fine cell overwrites the first,
// and the ghost is invisible to the support BFS — it falls at spawn.
function probeCellOwnership(sim, name) {
  let ghosts = 0;
  for (const b of sim.blocks) {
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iy = 0; iy < b.fsy; iy++) {
        for (let iz = 0; iz < b.fsz; iz++) {
          if (sim.grid.get(`${b.gx + ix},${b.gy + iy},${b.gz + iz}`) !== b) ghosts++;
        }
      }
    }
  }
  if (ghosts > 0) fail(`${name}: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);
}

// Camera-blocker coverage, derived per footprint cell rather than trusted. The
// chase cam's LOWEST framing is ~8.6 m high (SIZE 1), so anything under 6 m is
// already cleared with margin — above that, an unlisted roof occludes the hole.
// Scoped to the named scenes: the gallery ships zero blockers by design
// (camera.js falls back to a flat pull).
function probeCameraBlockers(sim, name, tops) {
  let uncovered = 0, worstH = 0, worstCell = '';
  for (const [k, top] of tops) {
    if (top < 6) continue;
    const [cx, cz] = k.split(',').map(Number);
    const covered = sim.cameraBlockers.some((b) =>
      cx + 1 > b.minX && cx < b.maxX && cz + 1 > b.minZ && cz < b.maxZ && b.h + 0.01 >= top);
    if (!covered) {
      uncovered++;
      if (top > worstH) { worstH = top; worstCell = k; }
    }
  }
  if (uncovered > 0) {
    fail(`${name}: ${uncovered} footprint cell(s) >=6 m tall have no cameraBlocker covering their height (tallest ${worstH} m at cell ${worstCell})`);
  }
}

// boundsRect must hug the content: a rect wider than the geometry lets the hole
// drive into blank ground, and a narrower one clips the map.
function probeBoundsRect(sim, name, slack = 12) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of sim.blocks) {
    minX = Math.min(minX, b.x - b.sx / 2); maxX = Math.max(maxX, b.x + b.sx / 2);
    minZ = Math.min(minZ, b.z - b.sz / 2); maxZ = Math.max(maxZ, b.z + b.sz / 2);
  }
  const R = sim.boundsRect;
  if (!R) { fail(`${name}: no boundsRect`); return; }
  if (minX < R.minX || maxX > R.maxX || minZ < R.minZ || maxZ > R.maxZ) {
    fail(`${name}: geometry x[${minX},${maxX}] z[${minZ},${maxZ}] escapes boundsRect x[${R.minX},${R.maxX}] z[${R.minZ},${R.maxZ}]`);
  } else if (R.maxX - maxX > slack || minX - R.minX > slack || R.maxZ - maxZ > slack || minZ - R.minZ > slack) {
    fail(`${name}: boundsRect leaves >${slack} m of blank ground around the content (x[${R.minX},${R.maxX}] vs [${minX},${maxX}], z[${R.minZ},${R.maxZ}] vs [${minZ},${maxZ}])`);
  }
}

// ALL physical blocks vs the roadway rects — not a height or material subset,
// which is how a 0.25 m bollard and a stoop each slipped into a roadway before.
// The only two exemptions are POSITIONAL lists the scene itself exports: the
// vehicles, and the overhead spans (a bridge arch, a viaduct deck). Neither can
// wave a block through on account of being small, or tall, or made of leaves.
function probeRoadConflicts(sim, name, vehicles, spans) {
  const allow = vehicles.map(vehicleBBox);
  let roadConflicts = 0, roadWorst = '';
  for (const bl of sim.blocks) {
    const r = blockRect(bl);
    if (!sim.sceneDecor.roads.some((rd) => rectsOverlap(r, rd))) continue;
    const inVehicle = allow.some((v) =>
      r.x >= v.minX - 0.75 && r.x + r.w <= v.maxX + 0.75 && r.z >= v.minZ - 0.75 && r.z + r.d <= v.maxZ + 0.75);
    if (inVehicle) continue;
    const inSpan = spans.some((s) =>
      r.x >= s.minX && r.x + r.w <= s.maxX && r.z >= s.minZ && r.z + r.d <= s.maxZ && bl.y - bl.sy / 2 >= s.minY);
    if (inSpan) continue;
    roadConflicts++;
    if (!roadWorst) roadWorst = `${bl.matType}/${sizeLabel(bl)}m at (${r.x},${bl.y},${r.z})`;
  }
  if (roadConflicts > 0) fail(`${name}: ${roadConflicts} physical block(s) inside a roadway rect, first ${roadWorst}`);
}

// Water draws near the top of the decor stack, so anything it covers is gone:
// roads, plazas, cobbles, sidewalks and crossings must never sit under it.
function probeWaterOverSurfaces(sim, name) {
  const D = sim.sceneDecor;
  for (const key of ['roads', 'plaza', 'cobbles', 'sidewalks', 'crosswalks']) {
    for (const w of D.water) {
      const hit = (D[key] || []).find((r) => rectsOverlap(r, w));
      if (hit) fail(`${name}: ${key} rect (${hit.x},${hit.z} ${hit.w}x${hit.d}) is under water rect (${w.x},${w.z} ${w.w}x${w.d}) — water paints over it`);
    }
  }
}

// Decor draw order at its sharpest: water renders at y .008 OVER parks at y .006,
// so a park rect fully inside a water rect never appears (Castle Clinton's park
// was exactly this bug when the harbor was one big rect).
function probeParkUnderWater(sim, name) {
  const D = sim.sceneDecor;
  for (const p of D.parks) {
    const buried = D.water.find((w) =>
      p.x >= w.x && p.x + p.w <= w.x + w.w && p.z >= w.z && p.z + p.d <= w.z + w.d);
    if (buried) fail(`${name}: park rect (${p.x},${p.z} ${p.w}x${p.d}) is fully inside water rect (${buried.x},${buried.z} ${buried.w}x${buried.d}) — it never renders`);
  }
}

// Enclosed water must match its physical rim exactly: every 1 m cell of the ring
// just outside the rect is either carrying a ground-level block or is itself
// water. A single dry gap and the water plane visibly runs out past its bank.
//
// The "or is itself water" clause is the one place this probe differs from the
// single-lobe form Brooklyn shipped with, and it is a correction, not a
// loosening. Upper Manhattan's bodies are multi-lobed — the Lake is four rects,
// the Meer three — so a ring cell of one lobe is routinely INSIDE a neighbouring
// lobe: legitimately wet, and demanding a kerb block there would be demanding a
// wall down the middle of the pond. A cell that is neither rimmed nor wet still
// fails, which is the whole contract. Brooklyn's bodies are single rects with
// dry rings, so this reads identically for them.
function probeRimmedWater(sim, name) {
  const D = sim.sceneDecor, R = sim.boundsRect;
  const groundCells = new Set();
  for (const b of sim.blocks) {
    if (b.y - b.sy / 2 > 0.01) continue;
    for (let cx = Math.floor(b.x - b.sx / 2); cx < Math.ceil(b.x + b.sx / 2); cx++) {
      for (let cz = Math.floor(b.z - b.sz / 2); cz < Math.ceil(b.z + b.sz / 2); cz++) groundCells.add(`${cx},${cz}`);
    }
  }
  const wet = (x, z) => D.water.some((w) => x >= w.x && x < w.x + w.w && z >= w.z && z < w.z + w.d);
  for (const w of D.water) {
    const open = w.x <= R.minX || w.x + w.w >= R.maxX || w.z <= R.minZ || w.z + w.d >= R.maxZ;
    if (open) continue;                        // river/ocean run off the map edge by design
    let gaps = 0, firstGap = '';
    const ring = [];
    for (let x = w.x - 1; x < w.x + w.w + 1; x++) ring.push([x, w.z - 1], [x, w.z + w.d]);
    for (let z = w.z; z < w.z + w.d; z++) ring.push([w.x - 1, z], [w.x + w.w, z]);
    for (const [x, z] of ring) {
      if (groundCells.has(`${x},${z}`) || wet(x, z)) continue;
      gaps++;
      if (!firstGap) firstGap = `(${x},${z})`;
    }
    if (gaps > 0) fail(`${name}: water rect (${w.x},${w.z} ${w.w}x${w.d}) has ${gaps} unrimmed ring cell(s), first ${firstGap}`);
  }
}

// No bare ground, at ANY height. Every footprint cell in the scene must sit on
// some decor layer — not just buildings. Stated this way it also enforces "curb
// furniture lands on the sidewalk it claims": a bin or lamp post nudged half a
// metre off the kerb ends up over the void-coloured ground plane and fails here,
// which a >=4 m building filter would have waved through.
function probeBareGround(sim, name, tops) {
  const layers = Object.values(sim.sceneDecor).flat();
  let bare = 0, bareWorst = '';
  for (const [k, top] of tops) {
    const [cx, cz] = k.split(',').map(Number);
    const cell = { x: cx, z: cz, w: 1, d: 1 };
    if (layers.some((r) => rectsOverlap(cell, r))) continue;
    bare++;
    if (!bareWorst) bareWorst = `(${cx},${cz}) top ${top} m`;
  }
  if (bare > 0) fail(`${name}: ${bare} footprint cell(s) stand on bare ground, first ${bareWorst}`);
}

// Declared-empty ground. A dead-space exclusion is only worth anything if
// something holds it to its claim, so each declared span must be genuinely
// block-free and must touch a boundsRect edge. Those two together are what stop
// it widening by accident: build inside a span and it fails, so the span has to
// shrink; and an interior void cannot be declared away at all, because "the edge
// of the map trails off" is the only accepted rationale. Without this the
// declaration is a comment, and a comment cannot be violated.
function probeOpenGround(sim, name, spans) {
  const R = sim.boundsRect;
  let openBad = 0, openWorst = '';
  for (const s of spans) {
    const rect = { x: s.minX, z: s.minZ, w: s.maxX - s.minX, d: s.maxZ - s.minZ };
    const occupied = sim.blocks.filter((bl) => rectsOverlap(blockRect(bl), rect));
    if (occupied.length) {
      openBad++;
      if (!openWorst) {
        const b0 = occupied[0];
        openWorst = `"${s.why}" holds ${occupied.length} block(s), first ${b0.matType}/${sizeLabel(b0)}m at (${b0.x},${b0.z})`;
      }
    }
    if (s.minX < R.minX || s.maxX > R.maxX || s.minZ < R.minZ || s.maxZ > R.maxZ) {
      fail(`${name}: open-ground span "${s.why}" escapes boundsRect`);
    }
    const onEdge = s.minX <= R.minX || s.maxX >= R.maxX || s.minZ <= R.minZ || s.maxZ >= R.maxZ;
    if (!onEdge) fail(`${name}: open-ground span "${s.why}" is interior — declare only level-edge emptiness, build the rest`);
  }
  if (openBad > 0) fail(`${name}: ${openBad} open-ground span(s) are not actually empty — ${openWorst}`);
}

// Dead-space census, REPORTED not gated. Same sweep the team used to find the
// spawn void: sample the playable rect every 4 m, flag any point with no block
// within 8 m, and discount the layers that are empty by design plus the declared
// spans above. It is not a gate because the residual is a known, deferred
// decision in Brooklyn (the ~110 x 12 m band at z[-16,-4] wants buildings, and
// that spend is on hold pending the build-time work). Printing it every run is
// the point: the number stays in front of whoever reads the validator instead of
// living in one person's scratchpad, so nobody can mistake a declared exclusion
// for having fixed it.
function reportDeadGround(sim, name, spans) {
  const D = sim.sceneDecor, R = sim.boundsRect;
  const BY_DESIGN = ['water', 'sand', 'parks', 'boardwalk'];
  const STEP = 4, REACH = 8;
  const occ = new Set();
  for (const bl of sim.blocks) occ.add(`${Math.round(bl.x / STEP)},${Math.round(bl.z / STEP)}`);
  const rr = Math.ceil(REACH / STEP);
  let deadTotal = 0, deadDeclared = 0, deadResidual = 0;
  for (let x = R.minX; x < R.maxX; x += STEP) {
    for (let z = R.minZ; z < R.maxZ; z += STEP) {
      const cx = Math.round(x / STEP), cz = Math.round(z / STEP);
      let near = false;
      for (let i = -rr; i <= rr && !near; i++) for (let j = -rr; j <= rr && !near; j++) if (occ.has(`${cx + i},${cz + j}`)) near = true;
      if (near) continue;
      // Closed bounds deliberately: rectsOverlap is open, so a degenerate point
      // rect would silently drop every sample sitting on a layer's own edge.
      const inRect = (r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d;
      if (BY_DESIGN.some((k) => (D[k] || []).some(inRect))) continue;
      deadTotal++;
      if (spans.some((s) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ)) deadDeclared++;
      else deadResidual++;
    }
  }
  console.log(`  ${name} dead ground: ${deadTotal} pt(s) on built/bare ground — ${deadDeclared} declared open, ${deadResidual} undeclared (not gated)`);
}

// Crosswalk stripes: every bar inside asphalt, and no bar overlapping another —
// the axis-aware zebra helper exists because the naive version stepped along the
// wrong axis and stacked every stripe on the same cells.
function probeCrosswalkStripes(sim, name) {
  const D = sim.sceneDecor;
  let strayStripes = 0, stackedStripes = 0;
  for (let i = 0; i < D.crosswalks.length; i++) {
    const s = D.crosswalks[i];
    const inside = D.roads.some((r) => s.x >= r.x && s.x + s.w <= r.x + r.w && s.z >= r.z && s.z + s.d <= r.z + r.d);
    if (!inside) strayStripes++;
    for (let j = i + 1; j < D.crosswalks.length; j++) if (rectsOverlap(s, D.crosswalks[j])) stackedStripes++;
  }
  if (strayStripes > 0) fail(`${name}: ${strayStripes} crosswalk stripe(s) not fully inside a roadway rect`);
  if (stackedStripes > 0) fail(`${name}: ${stackedStripes} overlapping crosswalk stripe pair(s) — zebra stepped along the wrong axis`);
}

// Each crossing must lie within the street it was DECLARED against, not merely
// within some road. The set-membership test above cannot see the difference, and
// that gap is not theoretical: Old Fulton St and Kent Ave are collinear segments
// of one east-west line, so a crossing that overshot Old Fulton by 22 m landed on
// Kent's asphalt and rendered as a perfectly ordinary crossing on the wrong
// street — inside a legal road rect, silent to the stripe probe, and only visible
// on an orthographic plan. Both checks stay: this one catches a crossing on the
// wrong street, the stripe probe catches one that has drifted off asphalt.
function probeCrossingsOnDeclaredStreet(name, crossings, streets, xwLen) {
  let wrongStreet = 0, wrongWorst = '';
  for (const [si, at] of crossings) {
    const s = streets[si];
    if (!s) { wrongStreet++; wrongWorst = wrongWorst || `street index ${si} does not exist`; continue; }
    const lo = s.axis === 'x' ? s.x : s.z;
    const hi = lo + (s.axis === 'x' ? s.w : s.d);
    if (at >= lo && at + xwLen <= hi) continue;
    wrongStreet++;
    if (!wrongWorst) wrongWorst = `[${si}, ${at}] needs ${at}..${at + xwLen} inside ${lo}..${hi}`;
  }
  if (wrongStreet > 0) fail(`${name}: ${wrongStreet} crossing(s) declared outside their own street's span, first ${wrongWorst}`);
}

// Decor draw order: the renderer paints the registry in key order, so the scene
// must hand it the keys the contract names, in that order. An empty layer keeps
// its key rather than being dropped.
const DECOR_ORDER = ['parks', 'sand', 'plaza', 'cobbles', 'sidewalks', 'roads', 'rail',
  'bikePaths', 'laneMarkers', 'crosswalks', 'water', 'boardwalk'];
function probeDecorKeyOrder(sim, name) {
  const got = Object.keys(sim.sceneDecor);
  if (got.join(',') !== DECOR_ORDER.join(',')) fail(`${name}: sceneDecor keys ${got.join(',')} do not match the draw order ${DECOR_ORDER.join(',')}`);
}

// Ambient life is render-only: VoxelWorld3D owns every entry and the physics grid
// never sees one. The scene declares which kinds it ships (a park has no ferries
// and no surf), and every declared kind must actually be there — an ambient key
// that quietly went missing is a scene that lost its birds with no other symptom.
function probeAmbient(sim, name, kinds) {
  const A = sim.sceneAmbient;
  if (!A || kinds.some((k) => !A[k])) {
    fail(`${name}: sceneAmbient is missing one of ${kinds.join('/')}`);
  }
}

// Idle stability at spawn: 3 s parked, nothing collapses, nothing is eaten. The
// sim is stepped in place, so callers that reuse it get a 3 s-old world.
function probeIdleStability(sim, name) {
  for (let i = 0; i < 3 * 60; i++) sim.step(DT, { x: 0, z: 0 });
  const nonStatic = sim.blocks.filter((b) => b.state !== 'static').length;
  if (nonStatic !== 0) fail(`${name}: ${nonStatic} blocks non-static after 3s idle at spawn`);
  if (sim.hole.eatenCount !== 0) fail(`${name}: ${sim.hole.eatenCount} blocks eaten during 3s idle at spawn`);
}

function probeFinitePositions(blocks, name, when) {
  let bad = 0;
  for (const bl of blocks) {
    if (!Number.isFinite(bl.x) || !Number.isFinite(bl.y) || !Number.isFinite(bl.z)) bad++;
  }
  if (bad > 0) fail(`${name}: ${bad} non-finite block positions ${when}`);
}

// --- the anisotropic-vocabulary contract (ADR-0013) --------------------------
// Four probes that only became necessary once a block stopped being a cube.
// They are SHARED, not Cambridge's: the first two bind every scene from the
// moment they exist, and the last two are table-parameterised so a scene that
// declares no districts and no hero pair passes them vacuously rather than
// being exempt from them. A probe that lives in a scene file is not a contract.

// Grade clause, engine-derived and hard. A ground-anchored block is removed by
// the rim test, which samples its four base corners inset 0.05 m from the edge
// against the removal disc; losing anchor status needs 3 of 4 corners inside,
// so the smallest hole that can take it has radius
// sqrt((sx-0.1)^2 + (sz-0.1)^2) / 1.9. The hole's MAX_RADIUS is 7.1 m, which
// puts the cliff at a 9.7 m plan diagonal: past that the piece is PERMANENTLY
// uneatable, and the damage is silent rather than visible — it still counts
// toward `totalMass`, so it makes the 50%-of-mass goal harder while reading as
// ordinary scenery. 8 m is the working limit, roughly two SIZE levels inside
// the cliff. Only `gy === 0` is at risk; an elevated piece is removed by losing
// its supports, not by this test, at any size.
function probeGradeDiagonal(sim, name, max = 8) {
  let over = 0, worst = 0, worstAt = '';
  for (const b of sim.blocks) {
    if (b.gy !== 0) continue;
    const diag = Math.hypot(b.sx - 0.1, b.sz - 0.1);
    if (diag <= max) continue;
    over++;
    if (diag > worst) { worst = diag; worstAt = `${b.matType}/${sizeLabel(b)}m at (${b.x},${b.z})`; }
  }
  if (over > 0) {
    fail(`${name}: ${over} grade block(s) exceed the ${max} m plan diagonal — worst ${worstAt} at ${worst.toFixed(2)} m (uneatable past 9.7 m, and it still counts toward totalMass)`);
  }
}

// `.wiki/modules/voxel.md` rule 10 — the placement step must equal the piece
// extent — generalised to three axes, which is the only form that survives
// anisotropic pieces: one call now carries three extents and a hand-rolled loop
// can step by the wrong one. Physics never complains (every piece is still
// grounded), so without a probe only the eye catches it, and only sometimes.
//
// What it looks for is the SLIVER: two collinear pieces of identical extent,
// material and colour, separated by a gap that is neither zero nor a whole
// piece. That is the failure ADR-0013 made likely rather than rare — a bay
// computed as `w / bays` lands on 1.333, quantises to 1.25, and the run walks
// off its own extent a fine cell at a time.
//
// THE GATE IS ANISOTROPIC PIECES; THE CUBE CASE IS A CENSUS. That split was
// measured, not assumed, and it is worth stating exactly because "narrow the
// guard until it goes green" is how bad probes ship. Run universally, the
// sliver rule flags 157 places across the five shipped scenes, and every one of
// them was inspected: the gallery's four jersey barriers on a 1.5 m pitch, and
// pairs of Upper Manhattan buildings standing 0.5 m apart down a shared column
// line. Both are deliberate, and both are legible AS deliberate for one reason —
// on the cube ladder a 0.5 m gap is itself a legal brick width, so it reads as a
// one-brick alley. There is no such reading for a 0.5 m gap between two 4 m
// slabs; that is a step that missed. So the cube population is counted and
// printed every run rather than dropped, and the anisotropic population, where
// the sliver has no innocent meaning, fails the build.
//
// Also deliberately NOT gated: the uniform case rule 10 names, a 0.5 m piece
// walked on a 1 m step. Every gap there is exactly one extent, which is
// geometrically identical to a column grid at 2 m pitch or a fence-post run.
// A probe that cannot tell those apart is noise, not a contract.
function probePlacementStep(sim, name) {
  const AXES = [
    { g: 'gx', fs: 'fsx', a: 'gy', b: 'gz', label: 'x' },
    { g: 'gy', fs: 'fsy', a: 'gx', b: 'gz', label: 'y' },
    { g: 'gz', fs: 'fsz', a: 'gx', b: 'gy', label: 'z' },
  ];
  let gated = 0, census = 0, worst = '';
  for (const A of AXES) {
    // Grouped in fine-cell integers, never metres: a gap test against a float
    // extent would invent its own slivers.
    const runs = new Map();
    for (const bl of sim.blocks) {
      const k = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl[A.a]},${bl[A.b]}`;
      const list = runs.get(k);
      if (list) list.push(bl); else runs.set(k, [bl]);
    }
    for (const list of runs.values()) {
      if (list.length < 2) continue;
      list.sort((p, r) => p[A.g] - r[A.g]);
      for (let i = 1; i < list.length; i++) {
        const cur = list[i - 1], nxt = list[i];
        const gap = nxt[A.g] - (cur[A.g] + cur[A.fs]);
        if (gap <= 0 || gap >= cur[A.fs]) continue;
        if (cur.fsx === cur.fsy && cur.fsy === cur.fsz) { census++; continue; }
        gated++;
        if (!worst) {
          worst = `${cur.matType}/${sizeLabel(cur)}m at (${cur.x},${cur.y},${cur.z}) leaves ${(gap * 0.25).toFixed(2)} m on ${A.label} before (${nxt.x},${nxt.y},${nxt.z}), against a ${(cur[A.fs] * 0.25).toFixed(2)} m extent`;
        }
      }
    }
  }
  if (gated > 0) fail(`${name}: ${gated} sub-extent gap(s) between collinear identical BOXES — the placement step does not match the piece extent. First: ${worst}`);
  if (census > 0) console.log(`  ${name} placement step: ${census} sub-extent gap(s) between cubes (reported, not gated — see the probe's note)`);
}

// Arc-length parameterisation of a scripted route, so "the gap between
// consecutive eatable pieces along the driving line" is a number rather than a
// figure of speech. Segments are the waypoint polyline; a piece's position on
// the route is its nearest point on that polyline.
function routeArc(route) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const p = route[i - 1], n = route[i];
    const dx = n.x - p.x, dz = n.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len <= 0) continue;
    segs.push({ x: p.x, z: p.z, ux: dx / len, uz: dz / len, len, s0: total });
    total += len;
  }
  return { segs, total };
}

function pointOnRoute(arc, s) {
  let g = arc.segs[arc.segs.length - 1];
  for (const c of arc.segs) { if (s <= c.s0 + c.len) { g = c; break; } }
  const t = Math.max(0, Math.min(g.len, s - g.s0));
  return { x: g.x + g.ux * t, z: g.z + g.uz * t };
}

function projectOnRoute(arc, px, pz) {
  let bestD2 = Infinity, bestS = 0;
  for (const g of arc.segs) {
    const t = Math.max(0, Math.min(g.len, (px - g.x) * g.ux + (pz - g.z) * g.uz));
    const cx = g.x + g.ux * t, cz = g.z + g.uz * t;
    const d2 = (px - cx) ** 2 + (pz - cz) ** 2;
    if (d2 < bestD2) { bestD2 = d2; bestS = g.s0 + t; }
  }
  return { d2: bestD2, s: bestS };
}

// The probe that enforces hand 2 of the two-hand rule, and the single most
// important one on this list. Two clauses, both from `01` §7.5 gate 6:
//
//   1. Mean gap between consecutive eatable pieces along the scene's own
//      scripted route stays under 15 m, per district. 15 is not arbitrary: the
//      combo window is 1.5 s and SIZE 1 speed was 9.96 m/s when this floor was
//      set (12.81 m/s after the 2026-08-17 1.8 retune — the faster hole only
//      makes the 15 m budget easier to spend, so the floor still binds), so
//      14.9 m of travel
//      is exactly one chain's worth of patience. A district may declare itself
//      TIGHTER via `gapFloor` and the probe holds it to that; it can never
//      declare itself looser, because a contract a scene can widen is not one.
//   2. No district falls below half the scene's median eatable-pieces per m² of
//      built footprint. The median is DERIVED from the scene, not declared, for
//      the same reason.
//
// Clause 1 is the doc's stated metric, and on its own it CANNOT SEE A HOLE.
// A mean is a total over a count, so a district with six pieces at 50, 52, 54,
// 94, 96 and 98 m reads 9.6 m — comfortably inside 15 — while carrying a 40 m
// dead stretch through its middle. That fixture is in the RED tests because the
// first version of this probe passed it. The mean is a proxy; §8.1's actual
// derivation ("it cares whether the next bite arrives within 1.5 s") is
// per-gap, so clause 1 is joined by a third:
//
//   3. No SINGLE gap along the route inside a district exceeds 25 m — `01`
//      §3.5's own loose reading of the same rule, the mid-ladder speed at which
//      1.5 s of patience buys ~25 m. A gap over that breaks the chain at every
//      speed on the ladder, so it needs no assumption about the player's SIZE
//      on arrival; gaps between the district's mean ceiling and this one are
//      speed-dependent and are deliberately left alone rather than guessed at.
//      A district that declares a tighter mean gets a proportionally tighter
//      hole ceiling — fine grain does not stop being fine grain for one bay.
//
// Clause 3 measures the route's presence inside the rect as contiguous PASSES,
// not just the span between the first and last piece, so the lead-in and
// run-out count as gaps too. Without that, a district whose pieces all huddle
// in one corner while the route drives 80 m of nothing scores a perfect mean, a
// perfect worst gap and a high density — the empty diorama passing every clause
// written to catch it. `03` §8.2 anticipates the temptation to answer a failure
// here by loosening the probe: "the answer is more ground furniture, never a
// wider probe."
//
// Together they are the combo dead zone and the empty diorama made into a
// failing test. Consolidation attacks this locally even when the scene total is
// fine, because the two-hand rule redistributes: a consolidated building goes
// sparse and its savings are spent somewhere else on the map. The chain does not
// care about the map total.
//
// COINS ARE NOT EATABLE PIECES, and this is the load-bearing exclusion
// (`04` §4.2's gate note). Counting them would let an author paper over a combo
// dead zone with CURRENCY instead of content — precisely the failure this probe
// exists to catch — and it is a live temptation, because a coin refreshes
// `chainTimer` and therefore genuinely does bridge a gap in play. Under today's
// engine a coin is not a block at all: `sim.coins` is its own array and nothing
// in it ever reaches `sim.blocks`. The exclusion is therefore structural rather
// than a filter, and the guard below is what keeps it that way — if a later
// change ever routes coins through the block list, or a caller hands this probe
// a padded piece list, every coin-shaped entry fails here instead of quietly
// raising the density.
//
// `corridor` is the half-width of the swathe a driving hole clears. It defaults
// to 2.60 m, which is not a taste number: it is the hole's radius at SIZE 4
// (`1.1 + (size - 1) * 0.5`), and SIZE 4 is the progression floor every scene's
// excursion is already asserted against below.
function probeDistrictDensity(sim, name, districts, route, opts = {}) {
  if (!districts || districts.length === 0) return;   // scene declares none — vacuous, not exempt
  const { corridor = 2.6, maxGap = 15, maxHole = 25 } = opts;
  const arc = routeArc(route || []);
  if (arc.segs.length === 0) { fail(`${name}: ${districts.length} district(s) declared but the scripted route is empty — the mean-gap clause cannot be measured`); return; }

  const coins = new Set(sim.coins || []);
  let notAPiece = 0;
  const pieces = sim.blocks.filter((b) => {
    if (coins.has(b) || b.matType === undefined || !(b.fsx > 0)) { notAPiece++; return false; }
    return true;
  });
  if (notAPiece > 0) fail(`${name}: ${notAPiece} non-block entr(ies) reached the eatable-piece count — coins and other currency must never be counted as content`);

  const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  const rows = [];
  for (const d of districts) {
    const r = d.rect;
    const mine = pieces.filter((b) => inRect(r, b.x, b.z));
    const cells = new Set();
    for (const b of mine) {
      for (let cx = Math.floor(b.x - b.sx / 2); cx < Math.ceil(b.x + b.sx / 2); cx++) {
        for (let cz = Math.floor(b.z - b.sz / 2); cz < Math.ceil(b.z + b.sz / 2); cz++) {
          if (inRect(r, cx + 0.5, cz + 0.5)) cells.add(`${cx},${cz}`);
        }
      }
    }
    const density = cells.size > 0 ? mine.length / cells.size : 0;
    // Pieces the route actually meets, ordered along it.
    const met = mine
      .map((b) => projectOnRoute(arc, b.x, b.z))
      .filter((p) => p.d2 <= corridor * corridor)
      .map((p) => p.s)
      .sort((p, n) => p - n);
    let meanGap = null;
    if (met.length >= 2) meanGap = (met[met.length - 1] - met[0]) / (met.length - 1);

    // The route's own presence inside the rect, as contiguous passes: a gap is
    // only real where the player is actually driving through the district, so a
    // route that leaves and re-enters must not have the outside stretch scored
    // against it. Sampled rather than clipped because the rect test is the same
    // one `mine` uses, and one predicate beats two that must agree.
    const passes = [];
    let open = null;
    for (let s = 0; s <= arc.total + 1; s += 1) {
      const at = Math.min(s, arc.total);
      const p = pointOnRoute(arc, at);
      if (s <= arc.total && inRect(r, p.x, p.z)) {
        if (open) open.s1 = at; else open = { s0: at, s1: at };
      } else if (open) { passes.push(open); open = null; }
    }
    let worstGap = 0, worstAt = null;
    for (const p of passes) {
      const here = met.filter((s) => s >= p.s0 && s <= p.s1);
      const marks = [p.s0, ...here, p.s1];
      for (let i = 1; i < marks.length; i++) {
        const g = marks[i] - marks[i - 1];
        if (g > worstGap) { worstGap = g; worstAt = pointOnRoute(arc, (marks[i] + marks[i - 1]) / 2); }
      }
    }
    rows.push({ d, mine: mine.length, cells: cells.size, density, met: met.length, meanGap, worstGap, worstAt, passes: passes.length });
  }

  const sorted = rows.map((r) => r.density).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const floor = median / 2;

  for (const r of rows) {
    const ceil = Math.min(maxGap, r.d.gapFloor ?? maxGap);
    const holeCeil = ceil * (maxHole / maxGap);
    if (r.passes === 0) {
      // Reported, not gated: WHICH districts the route visits is the excursion's
      // decision, not this probe's. Once it does drive through, every metre of
      // that pass is this probe's business — which is why an unmeasurable mean
      // below is no longer a way out.
      console.log(`  ${name} district ${r.d.id} "${r.d.name}": the scripted route never enters it — no gap measurable (density ${r.density.toFixed(2)}/m²)`);
    } else {
      if (r.meanGap !== null && r.meanGap > ceil) {
        fail(`${name}: district ${r.d.id} "${r.d.name}" mean inter-piece gap ${r.meanGap.toFixed(1)} m along the scripted route exceeds ${ceil} m over ${r.met} pieces — combo dead zone`);
      }
      if (r.worstGap > holeCeil) {
        const w = r.worstAt;
        fail(`${name}: district ${r.d.id} "${r.d.name}" has a ${r.worstGap.toFixed(1)} m hole in the route (ceiling ${holeCeil.toFixed(1)} m) centred near (${w.x.toFixed(0)}, ${w.z.toFixed(0)}) — the chain breaks crossing it at any size, and a mean of ${r.meanGap === null ? 'n/a' : `${r.meanGap.toFixed(1)} m`} does not see it`);
      }
    }
    if (r.density < floor) {
      fail(`${name}: district ${r.d.id} "${r.d.name}" holds ${r.density.toFixed(2)} eatable piece(s)/m² of built footprint, below half the scene median (${floor.toFixed(2)}, median ${median.toFixed(2)}) — next to the rest of the scene this district reads as empty ground`);
    }
  }
  console.log(`  ${name} district density: ${rows.length} district(s), median ${median.toFixed(2)} piece(s)/m² (floor ${floor.toFixed(2)}), coins excluded`);
}

// "Do not put the mark on the wrong building." Table-parameterised from the
// start even though one scene needs it: the mistake is scene-specific but the
// SHAPE of it is not, and a second implementation for the next scene with two
// near-identical neighbours is how a contract stops being one.
//
// Each row is `{ id, colorKey, hero, notHero }`. Signage is identified by its
// colour key rather than by which builder emitted it, because that is the thing
// an author can get wrong: a block is signage if it is painted the mark's
// colour, whoever drew it. Two clauses, stated separately because they fail for
// different reasons — a mark that drifted off the hero, and a mark that appeared
// on its neighbour. A deliberately faded companion mark is authored with its own
// distinct colour constant, so it never trips this and never has to be excused.
function probeHeroIdentity(sim, name, table) {
  if (!table || table.length === 0) return;   // scene declares none — vacuous, not exempt
  const within = (b, a) =>
    b.x - b.sx / 2 >= (a.minX ?? -Infinity) && b.x + b.sx / 2 <= (a.maxX ?? Infinity) &&
    b.y - b.sy / 2 >= (a.minY ?? -Infinity) && b.y + b.sy / 2 <= (a.maxY ?? Infinity) &&
    b.z - b.sz / 2 >= (a.minZ ?? -Infinity) && b.z + b.sz / 2 <= (a.maxZ ?? Infinity);
  const touches = (b, a) =>
    b.x + b.sx / 2 > (a.minX ?? -Infinity) && b.x - b.sx / 2 < (a.maxX ?? Infinity) &&
    b.y + b.sy / 2 > (a.minY ?? -Infinity) && b.y - b.sy / 2 < (a.maxY ?? Infinity) &&
    b.z + b.sz / 2 > (a.minZ ?? -Infinity) && b.z - b.sz / 2 < (a.maxZ ?? Infinity);

  for (const row of table) {
    const label = row.id ?? row.name ?? 'hero';
    let marked = 0, strayed = 0, strayAt = '', onNeighbour = 0, neighbourAt = '';
    for (const b of sim.blocks) {
      if (b.color !== row.colorKey) continue;
      marked++;
      if (row.hero && !within(b, row.hero)) {
        strayed++;
        if (!strayAt) strayAt = `${b.matType}/${sizeLabel(b)}m at (${b.x},${b.y},${b.z})`;
      }
      if (row.notHero && touches(b, row.notHero)) {
        onNeighbour++;
        if (!neighbourAt) neighbourAt = `${b.matType}/${sizeLabel(b)}m at (${b.x},${b.y},${b.z})`;
      }
    }
    if (strayed > 0) fail(`${name}: ${label} — ${strayed} of ${marked} signage block(s) fall outside the hero AABB, first ${strayAt}`);
    if (onNeighbour > 0) fail(`${name}: ${label} — ${onNeighbour} block(s) in the not-hero AABB carry the signage colour key, first ${neighbourAt} (the mark is on the wrong building)`);
    if (marked === 0 && row.hero) fail(`${name}: ${label} — no block carries the signage colour key 0x${(row.colorKey >>> 0).toString(16)}; the hero AABB is unguarded because the mark is not there`);
  }
}

// --- manhattan sandbox checks -------------------------------------------------
// The second voxel scene (Lower Manhattan): same engine, so we check the
// scene-specific risks — overlapping placement (ghost blocks), spontaneous
// collapse at spawn, and that a scripted excursion actually excavates.
function validateManhattan() {
  console.log('Validating manhattan sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'manhattan' });

  // Lower Manhattan predates the shared contract set and still runs a subset of
  // it: ownership, camera coverage, the park-under-water draw-order trap, and
  // idle stability. The rest of the set is not skipped on principle — this scene
  // has never been re-authored against it — and adopting it here is its own pass.
  // scripted excursion: cross town to the WTC base, then excavate for 30 s
  const WP = [{ until: 9, x: -24, z: -20 }, { until: 39, x: -24, z: -26 }];

  probeCellOwnership(sim, 'manhattan');
  probeCameraBlockers(sim, 'manhattan', footprintTops(sim));
  probeParkUnderWater(sim, 'manhattan');
  probeGradeDiagonal(sim, 'manhattan');
  probePlacementStep(sim, 'manhattan');
  probeDistrictDensity(sim, 'manhattan', [], WP);   // no districts declared — vacuous
  probeHeroIdentity(sim, 'manhattan', []);          // no hero pair declared — vacuous
  probeIdleStability(sim, 'manhattan');

  driveRoute(sim, WP, 39);
  probeRouteSpent('manhattan', sim, 'WTC excursion');
  if (sim.hole.eatenCount < 100) fail(`manhattan: only ${sim.hole.eatenCount} blocks eaten on the WTC excursion (expected >=100)`);
  // progression floor: the SIZE ladder is scaled by round(totalMass / 4200) —
  // ×10 for this scene's ~43.5k mass — so ANY content change silently re-paces
  // every level, and nothing else here asserts pacing. The floor is the SIZE
  // this excursion reached under the OLD combo-mass ladder, measured against
  // the HEAD tree before the points-only rebase (ADR-0015): moving the ladder
  // onto rawMass must not cost any scene a level.
  if (sim.hole.size < 7) fail(`manhattan: WTC excursion reached only SIZE ${sim.hole.size} (expected >=7 — SIZE ladder too steep for this scene?)`);
  probeFinitePositions(sim.blocks, 'manhattan', 'after excursion');
  console.log(`  manhattan sandbox: blocks=${sim.totalBlocks} mass=${sim.totalMass.toFixed(0)} eaten=${sim.hole.eatenCount} size=${sim.hole.size} peakChain=${sim.hole.bestCombo} score=${sim.hole.mass.toFixed(0)}`);

  // second excursion: a moving sweep through the expansion district — Fed
  // Reserve, then 7 WTC. Single-spot excavation stalls once the local cavity
  // stabilizes; a moving path keeps fresh structure overhead (as the WTC
  // excursion above and the gallery tour already rely on).
  const sim2 = new VoxelSandboxSim({ seed: 'validator', scene: 'manhattan' });
  const WP2 = [
    { until: 8, x: -24, z: 6 },
    { until: 20, x: -38, z: -2 },   // Fed Reserve interior
    { until: 30, x: -30, z: -14 },  // 7 WTC east face
    { until: 44, x: -34.5, z: -16 },// 7 WTC interior
  ];
  driveRoute(sim2, WP2, 44);
  probeRouteSpent('manhattan', sim2, 'expansion-district excursion');
  if (sim2.hole.eatenCount < 100) fail(`manhattan: only ${sim2.hole.eatenCount} blocks eaten on the expansion-district excursion (expected >=100)`);
  // Same rebase floor as the WTC excursion above, measured on HEAD.
  //
  // Re-baselined 2026-08-17 with the arrival-driven driver (RCA-2026-08-17):
  // this excursion used to reach SIZE 5 against a floor of 5 — the zero margin
  // the RCA's section 5 flagged — because the hole spent most of the window
  // parked. It now reaches SIZE 8, so the floor moves 5 -> 7. The convention
  // across this file is floor = reached - 1 (see the gallery's 8 against 9,
  // upper manhattan's 5 against 6): a tripwire with one level of slack, not a
  // transcript of today's number.
  if (sim2.hole.size < 7) fail(`manhattan: expansion-district excursion reached only SIZE ${sim2.hole.size} (expected >=7)`);
  console.log(`  manhattan district excursion: eaten=${sim2.hole.eatenCount} size=${sim2.hole.size} peakChain=${sim2.hole.bestCombo} score=${sim2.hole.mass.toFixed(0)}`);
}

// --- upper manhattan park sandbox checks ------------------------------------
// The third voxel scene, and after the four-pass rebuild the largest by block
// count: Central Park entire, with the Upper West Side, Museum Mile, the Upper
// East Side and Harlem wrapped around it. It is held to the SAME contract set as
// Brooklyn — same probe bodies, called from the shared block above with this
// scene's own exported tables. It ran a weaker set for three passes; that is
// over.
function validateUpperManhattan() {
  console.log('Validating upper manhattan sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'upper-manhattan' });

  // The full shared contract set, in the same order Brooklyn runs it. Pass 4
  // brought the last ten of these over: before that this scene ran four probes
  // against Brooklyn's fourteen, and the gap was not academic — nine of the ten
  // would have failed against the pre-rebuild scene (46 kerb rims in asphalt,
  // 12 surfaces drowned under water, 946 bare footprint cells, 300 overlapping
  // crosswalk stripes). They are ported unchanged rather than tuned to fit;
  // narrowing a guard until it goes green is how every one of those shipped.

  // The excursion route, declared before the probe block because the density
  // probe measures inter-piece gaps ALONG it — the route is scene data now, not
  // just the excursion's own business. Why it has this shape is argued below,
  // where it is driven.
  const WP = [
    { until: 6, x: 7, z: 14 },       // east off the spawn lawn, over the erratics
    { until: 14, x: 13, z: 16 },     // in at the museum's south-west corner
    { until: 21, x: 19, z: 16 },     // along the south range
    { until: 29, x: 20, z: 11 },     // up the Fifth Avenue front, under the portico
    { until: 37, x: 20, z: 5 },      // the north-east corner
    { until: 45, x: 14, z: 4 },      // across the north range, under the lantern
    { until: 53, x: 13, z: 9 },      // back down the park side
    { until: 58, x: 17, z: 13 },     // and diagonally through the middle
    { until: 62, x: 19, z: 8 },
  ];

  const umTops = footprintTops(sim);
  probeCellOwnership(sim, 'upper manhattan');
  probeCameraBlockers(sim, 'upper manhattan', umTops);
  probeBoundsRect(sim, 'upper manhattan');
  probeRoadConflicts(sim, 'upper manhattan', UPPER_MANHATTAN_VEHICLES, UPPER_MANHATTAN_ROAD_SPANS);
  probeWaterOverSurfaces(sim, 'upper manhattan');
  probeParkUnderWater(sim, 'upper manhattan');
  probeRimmedWater(sim, 'upper manhattan');
  probeBareGround(sim, 'upper manhattan', umTops);
  probeOpenGround(sim, 'upper manhattan', UPPER_MANHATTAN_OPEN_GROUND);
  reportDeadGround(sim, 'upper manhattan', UPPER_MANHATTAN_OPEN_GROUND);
  probeCrosswalkStripes(sim, 'upper manhattan');
  probeCrossingsOnDeclaredStreet('upper manhattan', UPPER_MANHATTAN_CROSSINGS, UPPER_MANHATTAN_STREETS, UM_XW_LEN);
  probeDecorKeyOrder(sim, 'upper manhattan');
  // No surf and no ferries: every water body in this level is a park pond inside
  // the green, and none of them is big enough to run a boat across.
  probeAmbient(sim, 'upper manhattan', ['gulls', 'steam', 'neon', 'pigeons']);
  probeGradeDiagonal(sim, 'upper manhattan');
  probePlacementStep(sim, 'upper manhattan');
  probeDistrictDensity(sim, 'upper manhattan', [], WP);   // no districts declared — vacuous
  probeHeroIdentity(sim, 'upper manhattan', []);          // no hero pair declared — vacuous
  probeIdleStability(sim, 'upper manhattan');

  // A twelve-metre approach and then a slow perimeter orbit INSIDE the
  // Metropolitan Museum. Three things drive the shape, and all three are
  // measured rather than assumed.
  //
  // First, the SIZE ladder scales every growth threshold by
  // `round(totalMass / 4200)`, clamped at ×10. Pass 3's perimeter took this
  // scene to 86k mass, so the multiplier is pinned at the ceiling and the
  // SIZE 4 gate is 414 raw mass (it was 1,800 combo-mass before the ADR-0015
  // rebase moved the ladder onto rawMass — five times Pass 2's gate). The
  // Belvedere orbit that banked 893 then banks nowhere near enough now, and it
  // is not a route problem: a smaller hole is a slower hole, so under-feeding
  // it early compounds (audit §D.4).
  //
  // Second, the answer is not a longer tour. A tour spends its time crossing
  // open ground. Measured on this scene: touring districts for 80 s banks 1,148;
  // a tight orbit in the middle of the museum for 94 s banks 1,407; the
  // PERIMETER orbit below banks 3,680 in 62 s, because every waypoint drags the
  // opening onto footprint it has not already emptied.
  //
  // Third, the target has to be the densest mass in the level, and Pass 3 built
  // the Met to be exactly that — a 9 x 14 x 7 m limestone block with three full
  // floor slabs, a lantern on the roof and a colonnaded front, twelve metres
  // from spawn. Result on the old ladder: 721 eaten, combo mass 3,680, SIZE 4
  // at 37.8 s of 62 — 24 seconds of margin at 2.04x the gate. On the rebased
  // ladder the same route banks 1,398 raw and reaches SIZE 5, which is the
  // floor asserted below.
  const runExcursion = () => driveRoute(new VoxelSandboxSim({ seed: 'validator', scene: 'upper-manhattan' }), WP, 62);
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`upper manhattan: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  probeRouteSpent('upper manhattan', a);
  // Held at Brooklyn's 300 through Pass 3. The Met orbit eats 721, so the floor
  // is loose against THIS route on purpose: its job is to catch a future pass
  // thinning the scene out, not to encode one route's yield.
  if (a.hole.eatenCount < 300) fail(`upper manhattan: only ${a.hole.eatenCount} blocks eaten on the Met excursion (expected >=300)`);
  // Floor = the SIZE this excursion reached on HEAD's combo-mass ladder; the
  // points-only rebase (ADR-0015) must not cost the scene a level.
  if (a.hole.size < 5) fail(`upper manhattan: excursion reached only SIZE ${a.hole.size} (expected >=5)`);

  probeFinitePositions(a.blocks, 'upper manhattan', 'after excursion');
  // blockers= is in the line for the same reason Brooklyn's is: this scene's
  // camera blockers are GENERATED from the finished geometry, so the count is a
  // running read on how much of the skyline exists, not a hand-kept number.
  console.log(`  upper manhattan sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
}

// --- brooklyn sandbox checks -------------------------------------------------
// The fourth voxel scene. Every probe it calls exists because the matching bug
// shipped at least once during authoring, and each one re-derives its contract
// from the finished scene rather than trusting a hand-maintained list. This was
// the strictest of the four until Pass 4 gave Upper Manhattan the same set.
function validateBrooklyn() {
  console.log('Validating brooklyn sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'brooklyn' });

  // The shared contract set, in the order the bugs were found in. Every probe
  // body now lives above this function and Upper Manhattan calls the same ones —
  // see the note there. What stays here is WHICH contracts this scene signs and
  // WHICH tables it signs them with.
  // The excursion route, declared up here because the density probe measures
  // inter-piece gaps ALONG it — the route is scene data, not just the
  // excursion's own business. Why it has this shape is argued at 12, below.
  const WP = [
    { until: 12, x: 34, z: 18 },    // approach across the museum apron
    { until: 26, x: 37, z: 15 },    // south-east quarter
    { until: 38, x: 32, z: 20 },    // north-west quarter
    { until: 50, x: 39, z: 19 },    // north-east quarter
    { until: 62, x: 33, z: 15 },    // south-west quarter
  ];

  const tops = footprintTops(sim);
  probeCellOwnership(sim, 'brooklyn');                                                  // 1
  probeCameraBlockers(sim, 'brooklyn', tops);                                           // 2
  probeBoundsRect(sim, 'brooklyn');                                                     // 3
  probeRoadConflicts(sim, 'brooklyn', BROOKLYN_VEHICLES, BROOKLYN_ROAD_SPANS);          // 4
  probeWaterOverSurfaces(sim, 'brooklyn');                                              // 5
  probeParkUnderWater(sim, 'brooklyn');
  probeRimmedWater(sim, 'brooklyn');                                                    // 6
  probeBareGround(sim, 'brooklyn', tops);                                               // 7
  probeOpenGround(sim, 'brooklyn', BROOKLYN_OPEN_GROUND);                               // 7b
  reportDeadGround(sim, 'brooklyn', BROOKLYN_OPEN_GROUND);                              // 7c
  probeCrosswalkStripes(sim, 'brooklyn');                                               // 8
  probeCrossingsOnDeclaredStreet('brooklyn', BROOKLYN_CROSSINGS, BROOKLYN_STREETS, XW_LEN); // 8b
  probeDecorKeyOrder(sim, 'brooklyn');                                                  // 9
  probeAmbient(sim, 'brooklyn', ['gulls', 'surf', 'ferries', 'steam', 'neon', 'pigeons']); // 10
  probeGradeDiagonal(sim, 'brooklyn');                                                  // 10b
  probePlacementStep(sim, 'brooklyn');                                                  // 10c
  probeDistrictDensity(sim, 'brooklyn', [], WP);   // 10d — no districts declared, vacuous
  probeHeroIdentity(sim, 'brooklyn', []);          // 10e — no hero pair declared, vacuous
  probeIdleStability(sim, 'brooklyn');                                                  // 11

  // 12. deterministic excursion, run twice. The route is a slow orbit inside
  // the Brooklyn Museum rather than a tour of the boroughs: a straight sweep
  // spends most of its time crossing open plaza with nothing overhead, and a
  // moving path through dense structure is what keeps fresh mass falling in.
  const runExcursion = () => driveRoute(new VoxelSandboxSim({ seed: 'validator', scene: 'brooklyn' }), WP, 62);
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`brooklyn: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  probeRouteSpent('brooklyn', a);
  if (a.hole.eatenCount < 300) fail(`brooklyn: only ${a.hole.eatenCount} blocks eaten on the museum excursion (expected >=300)`);
  // Progression floor. (The comment here used to claim ">=4, the same as
  // manhattan and upper manhattan" while the assertion said 5; the assertion was
  // right and the prose was stale.) The ladder is capped at ×10 in voxelsim.js
  // precisely so the largest scenes are not held to a lower standard than the
  // ones they were built to surpass.
  //
  // Held at 5 through the 2026-08-17 driver fix. Brooklyn is the ONE scene the
  // fix costs consumption: 767 eaten / SIZE 6 before, 558 / SIZE 5 after. That is
  // not a regression in the fix, it is the gravity-time-gated yield of RCA
  // section 6a showing up where it bites hardest — this route is a five-point
  // orbit with ~7 m legs inside the museum, so its old yield was dwell-dominated
  // rather than travel-dominated, and a driver that refuses to park collects less
  // on it. The chain went the other way and is now intact (651 of 767 broken
  // before, 558 of 558 after), i.e. the hole is fed continuously now. Floor stays
  // 5 and it clears with zero margin: if this scene moves again, re-cut the ROUTE
  // to be worth 62 s under a moving hole rather than moving the floor.
  if (a.hole.size < 5) fail(`brooklyn: excursion reached only SIZE ${a.hole.size} (expected >=5 — SIZE ladder too steep?)`);

  probeFinitePositions(a.blocks, 'brooklyn', 'after excursion');
  console.log(`  brooklyn sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
}

function validateBoston() {
  console.log('Validating boston sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'boston' });

  // Same contract set as Brooklyn and Upper Manhattan, same probe bodies, signed
  // with Boston's own tables. Nothing scene-specific is re-implemented here on
  // purpose: a probe that drifts per scene stops being a contract.
  // The excursion route, declared up here because the density probe measures
  // inter-piece gaps ALONG it — the route is scene data, not just the
  // excursion's own business. Why it has this shape is argued at 12, below.
  const WP = [
    { until: 4, x: 24, z: 14 },   // east off the spawn lot, past the jersey barriers
    { until: 10, x: 30, z: 9 },   // in at the west podium's south-west corner
    { until: 16, x: 30, z: 21 },  // north up the inside of the podium
    { until: 22, x: 30, z: 33 },
    { until: 28, x: 30, z: 45 },  // across the service slot into the north arm
    { until: 34, x: 30, z: 57 },
    { until: 40, x: 30, z: 68 },  // out at the podium's north end
    { until: 47, x: 36, z: 78 },  // down into the south podium's pierShed
    { until: 54, x: 48, z: 80 },  // east along its 3 m column grid
    { until: 62, x: 58, z: 78 },
  ];

  const tops = footprintTops(sim);
  probeCellOwnership(sim, 'boston');                                                  // 1
  probeCameraBlockers(sim, 'boston', tops);                                           // 2
  probeBoundsRect(sim, 'boston');                                                     // 3
  probeRoadConflicts(sim, 'boston', BOSTON_VEHICLES, BOSTON_ROAD_SPANS);              // 4
  probeWaterOverSurfaces(sim, 'boston');                                              // 5
  probeParkUnderWater(sim, 'boston');
  probeRimmedWater(sim, 'boston');                                                    // 6
  probeBareGround(sim, 'boston', tops);                                               // 7
  probeOpenGround(sim, 'boston', BOSTON_OPEN_GROUND);                                 // 7b
  reportDeadGround(sim, 'boston', BOSTON_OPEN_GROUND);                                // 7c
  probeCrosswalkStripes(sim, 'boston');                                               // 8
  probeCrossingsOnDeclaredStreet('boston', BOSTON_CROSSINGS, BOSTON_STREETS, BOS_XW_LEN); // 8b
  probeDecorKeyOrder(sim, 'boston');                                                  // 9
  probeAmbient(sim, 'boston', ['gulls', 'surf', 'ferries', 'steam', 'neon', 'pigeons']); // 10
  probeGradeDiagonal(sim, 'boston');                                                  // 10b
  probePlacementStep(sim, 'boston');                                                  // 10c
  probeDistrictDensity(sim, 'boston', [], WP);   // 10d — no districts declared, vacuous
  probeHeroIdentity(sim, 'boston', []);          // 10e — no hero pair declared, vacuous
  probeIdleStability(sim, 'boston');                                                  // 11

  // 12. deterministic excursion, run twice. The route walks the BCEC podium end
  // to end and then east through the south podium's shed. Two things about it
  // are load-bearing and were both measured rather than guessed. It never PARKS:
  // every stalled waypoint in the earlier drafts banked one to three blocks,
  // because the opening was sitting on ground it had already emptied. And the
  // legs run END TO END rather than orbiting a point, so each one drags the
  // opening onto footprint it has not already taken. The spawn lot itself is
  // surface car park by design, so the first leg is transit, not harvest.
  const runExcursion = () => driveRoute(new VoxelSandboxSim({ seed: 'validator', scene: 'boston' }), WP, 62);
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`boston: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  probeRouteSpent('boston', a);
  if (a.hole.eatenCount < 300) fail(`boston: only ${a.hole.eatenCount} blocks eaten on the BCEC excursion (expected >=300)`);
  // Progression floor, held to the same >=5 as every other big sandbox. Boston
  // is the heaviest map on the ladder (141k mass puts the multiplier at its ×10
  // cap, so the SIZE 4 gate is 414 raw mass), which is exactly why it is not
  // granted a lower bar than the scenes it was built to surpass.
  // Floor = the SIZE reached on HEAD's combo-mass ladder (see ADR-0015).
  //
  // Re-baselined 2026-08-17 (RCA-2026-08-17): 5 -> 10. This route is the one
  // the arrival-driven driver helps most — it is ten legs run end to end, so
  // the old time-gated version idled at nine of them. Reached SIZE 7 parked,
  // SIZE 11 driven, eaten 1096 -> 4545. Floor = reached - 1, per the
  // convention noted on manhattan's district excursion.
  if (a.hole.size < 10) fail(`boston: excursion reached only SIZE ${a.hole.size} (expected >=10 — SIZE ladder too steep?)`);

  probeFinitePositions(a.blocks, 'boston', 'after excursion');
  console.log(`  boston sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
}

// Cambridge, on the same probe list as every scene above it and with three
// probes that finally have something to bite on. The other five scenes declare
// no districts and no hero pair, so `probeDistrictDensity` and
// `probeHeroIdentity` pass them vacuously; Cambridge exports
// `CAMBRIDGE_DISTRICTS`, `CAMBRIDGE_ROUTE` and `CAMBRIDGE_HEROES`, so both run
// for real here — this is the first scene either one has ever measured.
//
// The route is NOT declared in this file the way Boston's WP is. Cambridge
// exports it, because `probeDistrictDensity` measures inter-piece gaps along it
// and the scene's own district rects and gap floors were authored against those
// exact legs; a second copy here would drift from the one the districts were
// tuned to. The excursion below therefore drives the scene's own line.
function validateCambridge() {
  console.log('Validating cambridge sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'cambridge' });

  const WP = CAMBRIDGE_ROUTE;

  const tops = footprintTops(sim);
  probeCellOwnership(sim, 'cambridge');                                                 // 1
  probeCameraBlockers(sim, 'cambridge', tops);                                          // 2
  probeBoundsRect(sim, 'cambridge');                                                    // 3
  probeRoadConflicts(sim, 'cambridge', CAMBRIDGE_VEHICLES, CAMBRIDGE_ROAD_SPANS);       // 4
  probeWaterOverSurfaces(sim, 'cambridge');                                             // 5
  probeParkUnderWater(sim, 'cambridge');
  probeRimmedWater(sim, 'cambridge');                                                   // 6
  probeBareGround(sim, 'cambridge', tops);                                              // 7
  probeOpenGround(sim, 'cambridge', CAMBRIDGE_OPEN_GROUND);                             // 7b
  reportDeadGround(sim, 'cambridge', CAMBRIDGE_OPEN_GROUND);                            // 7c
  probeCrosswalkStripes(sim, 'cambridge');                                              // 8
  probeCrossingsOnDeclaredStreet('cambridge', CAMBRIDGE_CROSSINGS, CAMBRIDGE_STREETS, CAM_XW_LEN); // 8b
  probeDecorKeyOrder(sim, 'cambridge');                                                 // 9
  // The four kinds the shell declares. `gulls` joined the list at P6.8, when
  // District 8 authored the Charles and the map first fronted open water; no
  // surf and no ferries, because a dammed river basin has neither. `03` §9.2
  // also lists `ducks`, `geese` and `trains`, and none of the three is a kind
  // `voxelworld.js` can resolve — see the note at `cambridgeShell`'s own
  // `sceneAmbient` for why declaring them would make this probe green on birds
  // that do not exist.
  probeAmbient(sim, 'cambridge', ['gulls', 'steam', 'neon', 'pigeons']);                // 10
  probeGradeDiagonal(sim, 'cambridge');                                                 // 10b
  probePlacementStep(sim, 'cambridge');                                                 // 10c
  probeDistrictDensity(sim, 'cambridge', CAMBRIDGE_DISTRICTS, WP);                      // 10d — real rows
  probeHeroIdentity(sim, 'cambridge', CAMBRIDGE_HEROES);                                // 10e — real pair
  probeIdleStability(sim, 'cambridge');                                                 // 11

  // 12. deterministic excursion, run twice, along the scene's own scripted
  // route rather than a validator-local one. Same two properties Boston's leans
  // on: it never parks, and every leg runs end to end onto ground the opening
  // has not already taken.
  //
  // GATE VS SOAK (T-403). The full route is 780 s, and its back third is where
  // the big collapses — and their cost — live. Measured on this tree
  // (post-T-402): the opening 240 sim-seconds cost ~19 wall-seconds per
  // excursion while the remaining 540 cost ~29 wall-MINUTES (the knee is at
  // simT ~270, where the mill/University Park collapses begin). The default
  // gate therefore runs the opening 240 s, which still proves determinism,
  // progression and an un-stalled sim; the full 780 s double excursion with
  // the SIZE >= 7 ladder floor is the opt-in soak: FW_VALIDATE_SOAK=1.
  const SOAK = !!process.env.FW_VALIDATE_SOAK;
  const DURATION = SOAK ? WP[WP.length - 1].until : 240;
  const runExcursion = () => driveRoute(new VoxelSandboxSim({ seed: 'validator', scene: 'cambridge' }), WP, DURATION);
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`cambridge: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  probeRouteSpent('cambridge', a);
  if (SOAK) {
    if (a.hole.eatenCount < 300) fail(`cambridge: only ${a.hole.eatenCount} blocks eaten on the scripted excursion (expected >=300)`);
    // Floor = the SIZE this excursion reached on HEAD's combo-mass ladder, which
    // is 7 — the longest route in the game, so it earns the highest floor of any
    // scene. Cambridge is not granted a lower bar for being newer (ADR-0015).
    if (a.hole.size < 7) fail(`cambridge: excursion reached only SIZE ${a.hole.size} (expected >=7 — SIZE ladder too steep?)`);
  } else {
    // Gate floors. The figures they were set from — eaten 1724, SIZE 3 at the
    // 240 s cut — were measured under the OLD time-gated driver, i.e. against a
    // hole that spent most of the window parked. They are left here as the
    // provenance of the numbers, NOT as a description of this tree: the arrival
    // driver keeps the hole moving, so both are now underestimates. The floors
    // are deliberately NOT raised to match, because raising a floor to a value
    // nobody has measured is how a gate starts asserting a guess.
    //
    // To re-measure and re-baseline (~30+ min of CPU on its own, see the cost
    // note below): FW_VALIDATE_SECTIONS=cambridge node tools/validate.mjs
    //
    // Cost warning, added 2026-08-17: this 240 s gate is no longer cheap. Under
    // the old driver the hole idled through most of it; now it eats continuously,
    // and debris churn is superlinear (RCA-2026-08-11). A run of this section was
    // observed at 30+ CPU-minutes and still going, so the "~29 wall-MINUTES for
    // the remaining 540 s" figure in the comment above now understates the whole
    // section. If this section becomes the validator's long pole, the fix is to
    // cut DURATION — under an arrival-driven loop the route repeats, so a shorter
    // budget costs laps rather than coverage — and re-baseline these two floors
    // in the same change. Do not cut it without re-measuring them.
    //
    // The ladder-steepness clause stays with the soak, where the full route
    // actually reaches the top of it.
    if (a.hole.eatenCount < 1000) fail(`cambridge: only ${a.hole.eatenCount} blocks eaten on the 240 s gate excursion (expected >=1000)`);
    if (a.hole.size < 3) fail(`cambridge: gate excursion reached only SIZE ${a.hole.size} (expected >=3)`);
  }

  probeFinitePositions(a.blocks, 'cambridge', 'after excursion');
  console.log(`  cambridge sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length} (${SOAK ? 'soak: full 780 s route' : 'gate: opening 240 s of the route — FW_VALIDATE_SOAK=1 runs all 780 s'})`);
}

function validateChicago() {
  console.log('Validating chicago sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'chicago' });

  const WP = CHICAGO_ROUTE;
  const DURATION = WP[WP.length - 1].until;

  const tops = footprintTops(sim);
  probeCellOwnership(sim, 'chicago');
  probeCameraBlockers(sim, 'chicago', tops);
  probeBoundsRect(sim, 'chicago');
  probeRoadConflicts(sim, 'chicago', CHICAGO_VEHICLES, CHICAGO_ROAD_SPANS);
  probeWaterOverSurfaces(sim, 'chicago');
  probeParkUnderWater(sim, 'chicago');
  probeRimmedWater(sim, 'chicago');
  probeBareGround(sim, 'chicago', tops);
  probeOpenGround(sim, 'chicago', CHICAGO_OPEN_GROUND);
  reportDeadGround(sim, 'chicago', CHICAGO_OPEN_GROUND);
  probeCrosswalkStripes(sim, 'chicago');
  probeCrossingsOnDeclaredStreet('chicago', CHICAGO_CROSSINGS, CHICAGO_STREETS, CHICAGO_XW_LEN);
  probeDecorKeyOrder(sim, 'chicago');
  probeAmbient(sim, 'chicago', ['gulls', 'steam', 'neon', 'pigeons']);
  probeGradeDiagonal(sim, 'chicago');
  probePlacementStep(sim, 'chicago');
  probeDistrictDensity(sim, 'chicago', CHICAGO_DISTRICTS, WP);
  probeHeroIdentity(sim, 'chicago', CHICAGO_HEROES);
  probeIdleStability(sim, 'chicago');

  const runExcursion = () => driveRoute(new VoxelSandboxSim({ seed: 'validator', scene: 'chicago' }), WP, DURATION);
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`chicago: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  probeRouteSpent('chicago', a);
  if (a.hole.eatenCount < 300) fail(`chicago: only ${a.hole.eatenCount} blocks eaten on the scripted excursion (expected >=300)`);
  if (a.hole.size < 7) fail(`chicago: excursion reached only SIZE ${a.hole.size} (expected >=7)`);

  probeFinitePositions(a.blocks, 'chicago', 'after excursion');
  console.log(`  chicago sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
}

// --- speed-invariance pin -----------------------------------------------------
// The assertion whose absence let RCA-2026-08-17 ship. It pins the property the
// HARNESS owns: a faster hole must SPEND its speed on ground covered. It does
// not pin consumption, and the reason is measured, not conceded — see below.
//
// The speed knob is `upgrades.speed`, not SPEED_MULT. It is the same
// multiplicative term in the same expression — voxelsim.js's hole speed is
// `playerSpeedForRadius(r) * tune.speed * ramp * speedBoost * h.speedMult` — so
// varying rank 0 -> 20 (x1.00 -> x2.00) is arithmetically identical to varying
// SPEED_MULT 1.8 -> 3.6, and it needs no edit to a shipped module. It is also
// the stronger statement: this is the speed upgrade a player actually buys.
//
// WHY THIS IS NOT "CONSUMPTION MUST NOT FALL". The RCA specified a consumption
// monotonicity check. That target is unwinnable from this file, and the reason
// is in the sim: a block is consumed only when it FALLS below SINK_Y while the
// void is still overhead (js/voxelsim.js:3221, :3397). Fall time is fixed by
// gravity, so yield is time-over-content, not distance-over-content, and
// crossing the same metre twice as fast halves the void's dwell over the debris
// it just undermined. Measured on the identical geometric route, sampled by
// DISTANCE travelled rather than by time, so the driver is out of the
// comparison entirely:
//
//   travelled     50 m    100 m   200 m   400 m   800 m
//   x1.00 eaten     27      27      27     163     351
//   x2.00 eaten      7       7       7      40     111
//
// Both arms are SIZE 1 through the first three marks, so this is not the growth
// feedback loop — it is the per-metre yield itself, and the feedback loop then
// amplifies it (a hole that banks less stays small, and a small hole sweeps a
// narrower void). Every driver inherits it: the arrival-driven loop below
// measures 2533 vs 639 over 90 s, and an arrival+dwell variant 1723 vs 1017.
// A consumption pin could only be met by making the fast arm slower, which is
// undoing the work rather than testing it. The finding is written up in
// .wiki/findings/RCA-2026-08-17-*.md §6a for the owner to retire the target.
//
// What the harness DOES own, and what actually broke, is whether the extra
// speed reaches the ground. Under the old time-gated driver it did not: 360 m
// vs 361 m covered, a ratio of 1.00, with 71.4% and 85.6% of ticks parked.
// Under the driver above: 1467 m vs 2442 m, ratio 1.66, 0.0% parked in both.
//
// Chicago is the arm because chicago is the RCA's proof case — the scene whose
// gate the idling actually took red. 90 s of its 135 s route, one run per arm.
const SPEED_PIN_SECONDS = 90;
// Doubling the speed knob moves the hole 1.66x further, NOT 2.00x, and that is
// correct rather than a bug to chase. Hole speed is
//
//   playerSpeedForRadius(h.radius) * tune.speed * (1 + SANDBOX_SPEED_RAMP * sizeT)
//     * speedBoost * h.speedMult                              js/voxelsim.js:4464
//
// and `upgrades.speed` only multiplies the LAST term. Two of the other four —
// `playerSpeedForRadius(h.radius)` and the `SANDBOX_SPEED_RAMP` (2.72) growth
// ramp — are functions of how much the hole has already eaten. The x2.00 arm
// eats less per metre (yield is gravity-time-gated; see the note above), so it
// stays smaller, so both growth terms stay lower and it hands part of its own
// speed advantage back. Expect this ratio to sit below 2.00 forever. If someone
// "fixes" it up to 2.00, the growth ramp has stopped working, which is a
// different bug.
//
// 1.25 is the floor, not the measurement, and it has margin on BOTH sides: it
// clears the broken driver's 1.00 by 0.25 and sits 0.41 under the fixed 1.66.
// The broken value is 1.00 BY CONSTRUCTION — a time-gated schedule caps how far
// a leg can carry the hole however fast it is — so this separates "the speed
// reached the ground" from "the speed was idled away", which is the whole claim.
// A bare `fast > slow` would not: the broken driver scores 361 m vs 360 m and
// passes it.
const MIN_SPEED_DISTANCE_RATIO = 1.25;
function validateSpeedInvariance() {
  console.log('Validating hole-speed invariance...');
  const arm = (rank) => driveRoute(
    new VoxelSandboxSim({ seed: 'validator', scene: 'chicago', upgrades: { speed: rank } }),
    CHICAGO_ROUTE, SPEED_PIN_SECONDS,
  );
  const slow = arm(0);    // x1.00
  const fast = arm(20);   // x2.00

  // Park-the-value guard: if `upgrades` ever stops reaching the hole, both arms
  // become the same run and the pin passes on a dead instrument. Assert the knob
  // is live BEFORE reading anything off it.
  if (slow.hole.speedMult !== 1.0 || fast.hole.speedMult !== 2.0) {
    fail(`speed invariance: the upgrades.speed knob is not reaching the hole (slow ${slow.hole.speedMult}, fast ${fast.hole.speedMult}) — the pin would be vacuous`);
  }
  if (slow.__route.dist === fast.__route.dist) {
    fail(`speed invariance: both arms covered exactly ${slow.__route.dist.toFixed(1)} m — the two speeds are not producing two different runs, so nothing is being compared`);
  }

  // Clause 1, absolute: neither arm may stand still.
  probeRouteSpent('speed invariance x1.00', slow, 'x1.00 arm');
  probeRouteSpent('speed invariance x2.00', fast, 'x2.00 arm');

  // Clause 2, relative: the extra speed has to reach the ground.
  const ratio = fast.__route.dist / slow.__route.dist;
  if (!(ratio >= MIN_SPEED_DISTANCE_RATIO)) {
    const shortfall = slow.__route.dist * MIN_SPEED_DISTANCE_RATIO - fast.__route.dist;
    fail(`speed invariance: doubling the hole's speed moved it ${fast.__route.dist.toFixed(0)} m vs ${slow.__route.dist.toFixed(0)} m over the same ${SPEED_PIN_SECONDS}s — ratio ${ratio.toFixed(3)}, need >=${MIN_SPEED_DISTANCE_RATIO}, short by ${shortfall.toFixed(0)} m (${((MIN_SPEED_DISTANCE_RATIO - ratio) / MIN_SPEED_DISTANCE_RATIO * 100).toFixed(1)}%). The route is idling the extra speed away rather than spending it. Parked ticks: x1.00 ${(slow.__route.idleFrac * 100).toFixed(1)}%, x2.00 ${(fast.__route.idleFrac * 100).toFixed(1)}% (a time-gated advance drives this ratio to 1.00 by construction)`);
  }
  console.log(`  speed invariance: x1.00 dist=${slow.__route.dist.toFixed(0)}m laps=${slow.__route.laps} idle=${(slow.__route.idleFrac * 100).toFixed(1)}% eaten=${slow.hole.eatenCount} size=${slow.hole.size} | x2.00 dist=${fast.__route.dist.toFixed(0)}m laps=${fast.__route.laps} idle=${(fast.__route.idleFrac * 100).toFixed(1)}% eaten=${fast.hole.eatenCount} size=${fast.hole.size} | distance ratio ${ratio.toFixed(2)} (>=${MIN_SPEED_DISTANCE_RATIO})`);
  console.log(`  speed invariance: consumption is REPORTED, not gated — see the note above (yield is gravity-time-gated in the sim, so it falls with speed under every driver).`);
}

// --- save schema guard --------------------------------------------------------
// freshSave() and the MIGRATIONS chain are two independent descriptions of the
// same object, and only one of them gets exercised while developing: whoever adds
// a key adds it to the migration, tests by reloading their own (older) save, and
// sees it work. A brand-new player never runs any migration — loadSave only walks
// the chain for a save OLDER than CURRENT_VERSION — so they get whatever
// freshSave() alone remembered to build.
//
// `sandbox` drifted exactly that way. Migration 10 created it, freshSave() never
// did, and for three schema versions every save born fresh had no `sandbox`
// object. `recordSandboxResult` reads `save.sandbox[scene]` as the first
// statement of the sandbox results callback, so it threw before any navigation
// ran and BOTH buttons on that screen were inert — a dead-end with no symptom
// but a console TypeError.
//
// The check therefore runs in two directions rather than one:
//   (a) per migration, no key may appear that freshSave() does not carry — this
//       localizes the blame to the migration that introduced the drift, and it
//       holds even for keys an early migration adds and a later one removes;
//   (b) at the end of the full chain, the key sets must be EQUAL, top level and
//       inside `settings`, so a key freshSave() invented and no migration ever
//       delivers is caught too (an upgrading player would be missing it).
// Plus the chain's own integrity: every version below CURRENT_VERSION has a
// migration, and each one hands back exactly the next version. A gap there sends
// loadSave down its quarantine path, which silently discards a real save.
function validateSaveSchema() {
  console.log('Validating save schema (freshSave vs migration chain)...');
  const fresh = __freshSave();
  const freshKeys = new Set(Object.keys(fresh));
  const freshSettingKeys = new Set(Object.keys(fresh.settings));
  const freshPlayerKeys = new Set(Object.keys(fresh.player));

  // The one seed we can build honestly: the v1 legacy shape loadSave() accepts.
  // Historical freshSave() bodies are gone, so v1 is the only true entry point,
  // and check (a) below covers every later version anyway by inspecting each
  // migration's own output rather than trusting one lineage.
  let s = { version: 1, coins: 0, stars: { 1: 3 } };
  for (let v = 1; v < CURRENT_VERSION; v++) {
    const fn = __MIGRATIONS[v];
    if (!fn) { fail(`save schema: no migration from v${v} — loadSave quarantines any save at that version`); return; }
    s = fn(s);
    if (s.version !== v + 1) { fail(`save schema: migration ${v} produced version ${s.version}, expected ${v + 1}`); return; }
    const extra = Object.keys(s).filter((k) => !freshKeys.has(k));
    if (extra.length) fail(`save schema: migration ${v}->${v + 1} adds top-level key(s) [${extra.join(', ')}] that freshSave() does not create — a save born at v${CURRENT_VERSION} will never have them`);
    const extraSet = Object.keys(s.settings || {}).filter((k) => !freshSettingKeys.has(k));
    if (extraSet.length) fail(`save schema: migration ${v}->${v + 1} adds settings key(s) [${extraSet.join(', ')}] that defaultSettings() does not create`);
    const extraPlayer = Object.keys(s.player || {}).filter((k) => !freshPlayerKeys.has(k));
    if (extraPlayer.length) fail(`save schema: migration ${v}->${v + 1} adds player key(s) [${extraPlayer.join(', ')}] that defaultPlayer() does not create`);
  }
  if (s.version !== CURRENT_VERSION) fail(`save schema: chain ended at v${s.version}, expected v${CURRENT_VERSION}`);

  const missing = [...freshKeys].filter((k) => !(k in s));
  if (missing.length) fail(`save schema: migrated save is missing top-level key(s) [${missing.join(', ')}] that freshSave() creates — an upgrading player never gets them`);
  const missingSet = [...freshSettingKeys].filter((k) => !(k in (s.settings || {})));
  if (missingSet.length) fail(`save schema: migrated save.settings is missing key(s) [${missingSet.join(', ')}] that defaultSettings() creates`);
  const missingPlayer = [...freshPlayerKeys].filter((k) => !(k in (s.player || {})));
  if (missingPlayer.length) fail(`save schema: migrated save.player is missing key(s) [${missingPlayer.join(', ')}] that defaultPlayer() creates`);

  const v17 = {
    version: 17, coins: 42, levels: {}, sandbox: {
      chicago: { completions: 3, bestSize: 7, bestTime: 92, bestCombo: 11, bestScore: 8123 },
    }, ownedItems: [], equippedSkin: 'classic', equippedIndicator: 'ind-default', muted: false,
    settings: fresh.settings,
  };

  // v17->v18 splits `completions` (now FULL CLEARS only) from `runs` (finished
  // runs) and adds `bestPercent`. An upgrading player's history must survive
  // intact — those three clears were real goal completions under the rule that
  // ran at the time — and `runs` must be SEEDED from them rather than starting
  // at zero, or a returning player's city chip goes blank.
  const v18 = __MIGRATIONS[17](v17);
  const chi18 = v18.sandbox.chicago;
  if (v18.version !== 18 || chi18.completions !== 3 || chi18.runs !== 3 || chi18.bestPercent !== 0
    || chi18.bestSize !== 7 || chi18.bestTime !== 92 || chi18.bestCombo !== 11 || chi18.bestScore !== 8123) {
    fail(`save schema: v17->v18 mishandled a real sandbox record (${JSON.stringify(chi18)})`);
  }

  // v23 feel retune (2026-08-17): the sandbox hole-speed default moved
  // 1.4 -> 1.8. Pin both ends of it: a save born today carries 1.8, and the
  // v22->v23 migration moves an existing player onto it — feel retunes reset
  // the key for the installed base, the same precedent as v8's creak reset
  // and v9's gravity/wave/attract pass — without touching anything else.
  if (fresh.settings.voxSpeed !== 1.8) {
    fail(`save schema: fresh save voxSpeed is ${fresh.settings.voxSpeed}, expected the 1.8 retune`);
  }
  const v22save = { version: 22, coins: 7, settings: { ...fresh.settings, voxSpeed: 1.4, voxGravity: 42 } };
  const v23save = __MIGRATIONS[22] ? __MIGRATIONS[22](v22save) : null;
  if (!v23save || v23save.version !== 23 || !v23save.settings || v23save.settings.voxSpeed !== 1.8) {
    fail(`save schema: v22->v23 must reset voxSpeed to the 1.8 retune (got ${v23save && v23save.settings && v23save.settings.voxSpeed})`);
  }
  if (v23save && (v23save.coins !== 7 || v23save.settings.voxGravity !== 42)) {
    fail('save schema: v22->v23 must preserve everything except the retuned voxSpeed');
  }

  // v25 (cloud progress sync, task 6): the save carries a `cloud` bookkeeping
  // block with exactly the keys js/cloud/sync.js reads, on both the fresh path
  // and the v24->v25 migration. Neither may drift from the other, and neither
  // may leak into the synced blob (progressBlob guards that half).
  const CLOUD_KEYS = ['lastPushedAt', 'lastPulledAt', 'dirty', 'revision', 'lastLocalChangeAt', 'firstNoteShownAt'];
  if (CURRENT_VERSION < 25) fail(`save schema: CURRENT_VERSION is ${CURRENT_VERSION}, cloud sync needs v25`);
  for (const k of CLOUD_KEYS) {
    if (!fresh.cloud || !(k in fresh.cloud)) fail(`save schema: freshSave().cloud lacks ${k}`);
  }
  const v25 = __MIGRATIONS[24] ? __MIGRATIONS[24]({ version: 24, coins: 3, ownedItems: ['neon'] }) : null;
  if (!v25 || v25.version !== 25) fail('save schema: no v24->v25 migration');
  for (const k of CLOUD_KEYS) if (!v25 || !v25.cloud || !(k in v25.cloud)) fail(`save schema: v24->v25 must add cloud.${k}`);
  if (v25 && (v25.coins !== 3 || !v25.ownedItems || v25.ownedItems[0] !== 'neon')) fail('save schema: v24->v25 must preserve everything else');
  if (v25 && v25.cloud && (v25.cloud.dirty !== false || v25.cloud.revision !== 0)) fail('save schema: a migrated save starts clean at revision 0 (nothing pushed yet)');

  console.log(`  save schema: v1->v${CURRENT_VERSION} chain and freshSave() agree on ${freshKeys.size} top-level key(s), ${freshSettingKeys.size} setting(s), and ${freshPlayerKeys.size} player key(s)`);
}

// --- reward-layer ladders (ADR-0015) -----------------------------------------
// The regression guard for the defect this package closed. `js/ui/hud.js` used
// to print `⚡ COMBO x{floor((chain - 1) / 25) + 1}` — a LEVEL INDEX in
// multiplier notation — beside a sim that awarded `min(3, 1 + 0.1 * ...)`. At a
// chain of 26 the HUD said x2 and the sim paid 1.1; at 101 it said x5 and paid
// 1.4. Nothing could have caught that except an assertion that the two agree,
// because both halves were individually reasonable. So: one ladder, exported,
// and this function holds the equality across the whole reachable range.
function validateRewardLadders() {
  console.log('Validating reward ladders (combo + milestones)...');

  // Shape: DATA, not a formula (FR-012), with the tail rule and the step as
  // single named constants (FR-013).
  if (!Array.isArray(COMBO_THRESHOLDS) || COMBO_THRESHOLDS.length === 0) {
    fail('combo ladder: COMBO_THRESHOLDS is not a non-empty array — the ladder must be a data table');
  }
  if (typeof COMBO_STEP !== 'number' || !(COMBO_STEP > 0)) fail(`combo ladder: COMBO_STEP is not a positive number (${COMBO_STEP})`);
  // One level per threshold, PLUS the x1 floor that every hole starts on. The
  // check used to read `=== COMBO_THRESHOLDS.length`, which is what an inert
  // head entry buys you: a table whose first row pays for nothing still counts,
  // so the arithmetic balanced while one rung of the ladder did not exist
  // (T-501).
  if (COMBO_MAX_LEVEL !== COMBO_THRESHOLDS.length + 1) {
    fail(`combo ladder: COMBO_MAX_LEVEL ${COMBO_MAX_LEVEL} does not match the ${COMBO_THRESHOLDS.length} thresholds + the x1 floor — the tail rule and the table disagree`);
  }
  if (COMBO_LEVEL_NAMES.length !== COMBO_MAX_LEVEL + 1) {
    fail(`combo ladder: ${COMBO_LEVEL_NAMES.length - 1} level name(s) for ${COMBO_MAX_LEVEL} level(s)`);
  }
  for (let i = 1; i < COMBO_THRESHOLDS.length; i++) {
    if (!(COMBO_THRESHOLDS[i] > COMBO_THRESHOLDS[i - 1])) {
      fail(`combo ladder: thresholds not strictly increasing at index ${i} (${COMBO_THRESHOLDS[i - 1]} -> ${COMBO_THRESHOLDS[i]})`);
    }
  }
  // The owner's curve (GWT-301): the x1 floor, then steps at 10, 15, 25, 50,
  // 100, then the rare tail. `2` used to head this list and is gone — see the
  // inert-entry guard immediately below for why its removal moved no score.
  const WANT_HEAD = [50, 150, 500, 1200, 3000];
  for (let i = 0; i < WANT_HEAD.length; i++) {
    if (COMBO_THRESHOLDS[i] !== WANT_HEAD[i]) {
      fail(`combo ladder: front-loaded head should be ${WANT_HEAD.join(', ')} — got ${COMBO_THRESHOLDS.slice(0, WANT_HEAD.length).join(', ')}`);
      break;
    }
  }

  // EVERY ENTRY MUST DO SOMETHING (T-501). The ladder used to open with `2`
  // against a mapping of `level = i + 1`, and level 1 is already the floor — so
  // crossing index 0 awarded exactly what a chain of 0 already had. The game
  // published a step the player could not feel, and the defect was structural:
  // ANY value at index 0 was inert, so re-tuning `2` to `5` would have fixed
  // nothing. This guard asks the LADDER FUNCTION whether the crossing changes
  // the payout, rather than checking the index arithmetic that caused it — the
  // same reason the literal table below exists instead of a restatement of
  // `comboMult`'s body.
  for (let i = 0; i < COMBO_THRESHOLDS.length; i++) {
    const t = COMBO_THRESHOLDS[i];
    const at = comboMult(t), below = comboMult(t - 1);
    if (at === below) {
      fail(`combo ladder: threshold ${t} (index ${i}) is INERT — a chain of ${t} awards x${at}, exactly what a chain of ${t - 1} awards. The table states a step the player cannot feel (T-501)`);
    }
  }

  const LADDER = [
    [0, 1], [1, 1], [2, 1], [49, 1],        // the x1 floor, threshold-free
    [50, 2], [51, 2], [149, 2],
    [150, 3], [151, 3], [499, 3],
    [500, 4], [501, 4], [1199, 4],
    [1200, 5], [1201, 5], [2999, 5],
    [3000, 6], [3001, 6], [5999, 6],
    [6000, 7], [6001, 7], [9999, 7],
    [10000, 8], [10001, 8], [20000, 8], [1e6, 8],       // summit from 10k: ceiling x8 for standard chain
  ];
  for (const [chain, want] of LADDER) {
    const got = comboMult(chain);
    if (got !== want) fail(`combo ladder: chain ${chain} awards x${got}, the ruled ladder says x${want}`);
  }
  // Monotonic and non-skipping across the whole reachable range — the property
  // the literal table cannot express because it only samples.
  let prevMult = comboMult(0);
  for (let c = 1; c <= 15000; c++) {
    const m = comboMult(c);
    if (m < prevMult) { fail(`combo ladder: multiplier decreased at chain ${c} (x${prevMult} -> x${m})`); break; }
    if (m > prevMult + 1) { fail(`combo ladder: multiplier jumped a rung at chain ${c} (x${prevMult} -> x${m})`); break; }
    if (m > 8) { fail(`combo ladder: chain ${c} awards x${m}, past the ruled ceiling of x8`); break; }
    prevMult = m;
  }
  const topAt = LADDER.find(([, m]) => m === 8)[0];

  // T-311: every rung must be legible AS A NUMBER. The top rung used to be the
  // string 'MAX', which meant x8 — the actual ceiling — was the one value the
  // game never printed, so a player counting the steps they had seen concluded
  // the top was x7. Literal expectation, again not derived from the array.
  const WANT_NAMES = ['', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'];
  if (COMBO_LEVEL_NAMES.join('|') !== WANT_NAMES.join('|')) {
    fail(`combo ladder: level names are [${COMBO_LEVEL_NAMES.join(', ')}], must be [${WANT_NAMES.join(', ')}] — every rung states its multiplier as a number`);
  }
  for (let lvl = 1; lvl <= COMBO_MAX_LEVEL; lvl++) {
    if (!/^x\d+(\.\d+)?$/.test(COMBO_LEVEL_NAMES[lvl] || '')) {
      fail(`combo ladder: level ${lvl} is named "${COMBO_LEVEL_NAMES[lvl]}" — a rung labelled instead of numbered hides its own value (T-311)`);
    }
  }

  // Milestones: strictly increasing, inside (0, 1], last exactly on the goal.
  let prevAt = 0;
  for (const row of MILESTONES) {
    if (!(row.at > prevAt)) fail(`milestone ladder: thresholds not strictly increasing at ${row.at} (previous ${prevAt})`);
    if (!(row.at > 0 && row.at <= 1)) fail(`milestone ladder: threshold ${row.at} outside (0, 1]`);
    if (typeof row.text !== 'string' || row.text.trim() === '') fail(`milestone ladder: row at ${row.at} has no copy`);
    if (!MILESTONE_TIERS.includes(row.tier)) fail(`milestone ladder: row at ${row.at} has unknown tier "${row.tier}"`);
    prevAt = row.at;
  }
  if (MILESTONES[MILESTONES.length - 1].at !== 1) {
    fail(`milestone ladder: last threshold is ${MILESTONES[MILESTONES.length - 1].at}, must be exactly 1 so the loudest beat lands on goal completion`);
  }

  // --- source guards ---------------------------------------------------------
  // The ladder must exist ONCE, in the sim, exported — and every surface must
  // READ it rather than mirror it (GWT-202, SYS-209). Extended past hud.js in
  // T-312 to cover the whole B2 readout inventory, because the old guard
  // watched exactly one file while the same defect was live in two others.
  //
  // Comments are stripped first: these files deliberately QUOTE the defects
  // they fixed, and a guard that cannot tell a warning label from live code
  // fails on the documentation of its own bug.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  const stripHtmlComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '');
  const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

  const hudSrc = read('js/ui/hud.js');
  const screensSrc = read('js/ui/screens.js');
  const indexSrc = read('index.html');
  const simSrc = read('js/voxelsim.js');

  if (!/export function comboMult/.test(simSrc)) fail('js/voxelsim.js does not export comboMult');
  // The HUD ring must take its multiplier from the sim's exported ladder. It
  // reads COMBO_LEVEL_NAMES now rather than calling comboMult per frame, so the
  // guard accepts either — what it refuses is a HUD that names neither.
  if (!/import\s*\{[^}]*(comboMult|COMBO_LEVEL_NAMES)[^}]*\}\s*from\s*'\.\.\/voxelsim\.js'/.test(hudSrc)) {
    fail("js/ui/hud.js does not import the ladder (comboMult / COMBO_LEVEL_NAMES) from ../voxelsim.js — a HUD that re-derives the multiplier is the defect this package closed");
  }
  if (/chain\s*-\s*1\s*\)\s*\/\s*25/.test(stripComments(hudSrc))) {
    fail('js/ui/hud.js still contains the old (chain - 1) / 25 level expression');
  }

  // B2 #4, #7 (T-309): no surface may put a literal `x` in front of a CHAIN.
  // `x${chain}` and `x${...bestCombo}` are chain counts wearing multiplier
  // clothing — the exact defect ADR-0015 closed for the sandbox HUD, which was
  // still live on the campaign HUD pill and the campaign results screen.
  // A BARE path only — `x${p.chain}`, `x${sim.player.bestCombo}`. Deliberately
  // no `(`, so `x${comboMult(h.chain)}` and `x${campaignComboMult(p.chain)}`
  // pass: those ARE multipliers, derived from the chain by the sim's own ladder,
  // which is the whole point. The defect is the raw count wearing the notation.
  const CHAIN_WITH_X = /x\$\{\s*[\w.]*\b(chain|bestCombo)\b\s*\}/;
  for (const [name, src] of [['js/ui/hud.js', hudSrc], ['js/ui/screens.js', screensSrc]]) {
    const m = stripComments(src).match(CHAIN_WITH_X);
    if (m) fail(`${name} prints a chain count with an "x" in front of it (\`${m[0]}\`) — that is a multiplier's notation on a block count (T-309)`);
  }

  // B2 #5, #6 (T-310): a chain count must state its unit. Every rendering of
  // `bestCombo` in the results screens has to sit next to the word "chain", so
  // the number a player carries away cannot be read as a multiplier.
  for (const line of stripComments(screensSrc).split('\n')) {
    if (!/\$\{[^}]*bestCombo[^}]*\}/.test(line)) continue;
    if (!/chain/i.test(line)) {
      fail(`js/ui/screens.js renders bestCombo with no unit: ${line.trim().slice(0, 110)} — a bare chain under a "combo" label is the readout the owner read as a multiplier (T-310)`);
    }
  }
  // Layout, not wording — and it is here because a text-only check missed it.
  // `.results-stats b` is `float: right` (css/main.css), so TWO bold values in
  // one row float right in DOM order and render right-to-left, detached from
  // the label that names them. `Best chain <b>530 eats</b> · top multiplier
  // <b>x7</b>` read correctly to innerText and rendered on screen as
  // "Best chain · top multiplier   x7  530 eats". One value per row.
  for (const [i, line] of stripComments(screensSrc).split('\n').entries()) {
    for (const cell of line.split(/<\/div>|<br\s*\/?>/)) {
      const bolds = (cell.match(/<b>/g) || []).length;
      if (bolds > 1) {
        fail(`js/ui/screens.js:${i + 1} puts ${bolds} <b> values in one results row — they are float:right and will render in reverse, detached from their labels: ${cell.trim().slice(0, 110)}`);
      }
    }
  }

  // T-503: the finish bonus is a payout for FINISHING. It was added to the
  // coin total unconditionally and printed unconditionally, so a run that timed
  // out at 3% of the city collected +35 for reaching the goal on a screen whose
  // own heading read "TIME'S UP". Harmless while the only way to end a sandbox
  // run was to reach the goal; a live payout bug from the moment the 180 s clock
  // made timing out the ordinary ending.
  //
  // TWO independent assertions, because the bug has two halves and either can
  // be fixed without the other: the money and the copy. The copy check is
  // per-line rather than a whole-body search — a `Finish bonus` sitting outside
  // any `sim.won` conditional is the ungated form however the rest reads.
  const sandboxResults = stripComments(
    screensSrc.slice(screensSrc.indexOf('showSandboxResults('), screensSrc.indexOf('showRunResults(')),
  );
  if (!sandboxResults.includes('SANDBOX_GOAL_BONUS')) {
    fail('js/ui/screens.js: showSandboxResults no longer mentions SANDBOX_GOAL_BONUS — this guard has stopped watching anything (T-503)');
  } else {
    if (!/sim\.won\s*\?\s*(?:goalBonusVal|sim\.goalBonus|\(?sim\.goalBonus\s*\|\|\s*SANDBOX_GOAL_BONUS\)?|SANDBOX_GOAL_BONUS)\s*:\s*0/.test(sandboxResults)) {
      fail('js/ui/screens.js: showSandboxResults adds SANDBOX_GOAL_BONUS to the coin payout without gating it on sim.won — a run that timed out at 3% is paid for finishing (T-503)');
    }
    for (const line of sandboxResults.split('\n')) {
      if (/Finish bonus/.test(line) && !/sim\.won/.test(line)) {
        fail(`js/ui/screens.js prints the finish bonus unconditionally: ${line.trim().slice(0, 110)} — when it was not earned the line must be ABSENT, not "+0", which reads as a broken game rather than an unearned reward (T-503)`);
      }
      // The same rule one row down. Gating the BONUS alone left `Coins earned
      // +0` on the screen of a run that collected nothing — a different row
      // printing the same zero, and a zero on a results screen reads as a bug in
      // the game rather than as an honest nil return. `Coins found 0/60` two
      // lines above already says why the payout is nothing.
      if (/Coins earned/.test(line) && !/coins\s*>\s*0/.test(line)) {
        fail(`js/ui/screens.js prints the coin payout unconditionally: ${line.trim().slice(0, 110)} — a "+0" payout row must be absent (T-503)`);
      }
    }
  }

  // T-502: the stored stat key must say which quantity it holds. `best_combo`
  // held a CHAIN COUNT, so the first surface to render it would have printed
  // 530 under a word that reads as a multiplier — the same defect T-309/T-311
  // closed on every player-facing readout, one layer down in the schema.
  const verifySrc = stripComments(read('api/_verify.mjs'));
  if (/\bbest_combo\b/.test(verifySrc)) {
    fail('api/_verify.mjs stores `best_combo` — the value is a chain COUNT and the key must say so (`best_chain`, T-502)');
  }
  if (!/\bbest_chain:\s*sim\.hole\.bestCombo\b/.test(verifySrc)) {
    fail('api/_verify.mjs no longer writes best_chain from sim.hole.bestCombo — this guard has stopped watching anything (T-502)');
  }

  // T-504: ONE countdown in the sandbox HUD, and #timer is not it. The ranked
  // run used to write its clock into #timer — the sandbox's coin readout —
  // while #level-clock sat hidden (run90 leaves `sim.timeLeft` null), so the
  // one mode whose length is a decision of record rendered its clock in a pill
  // with no endgame states and lost the coin readout for the duration.
  //
  // The real assertion for this is the browser probe that COUNTS visible
  // countdowns; these two are the cheap source tripwires that keep the shape
  // from coming back, plus the stale markup the same defect left behind.
  const sandboxHud = stripComments(
    hudSrc.slice(hudSrc.indexOf('updateSandbox(sim)'), hudSrc.indexOf('_updateClock(seconds)')),
  );
  if (/this\.timer\.textContent\s*=\s*`\$\{[^`]*seconds/.test(sandboxHud)) {
    fail('js/ui/hud.js writes a countdown into #timer during a sandbox run — that element is the coin readout, and the countdown belongs in #level-clock (T-504)');
  }
  if (/\b90\s*-\s*sim\.rankedTicks/.test(sandboxHud)) {
    fail('js/ui/hud.js derives the ranked countdown from a literal 90 — the ranked length is ADR-0016\'s decision of record and must come from RANKED_TICK_COUNT (T-504)');
  }
  // The same literal was on the RUN results screen ("Clock 90.0 s"), which made
  // three statements of one decision. Found while proving T-504 and closed with
  // it: a length stated in three places is a length that will disagree in one.
  if (/Clock\s*<b>\s*\d/.test(stripComments(screensSrc))) {
    fail('js/ui/screens.js prints the ranked clock as a literal — it must come from RANKED_TICK_COUNT, the one place ADR-0016\'s length is declared (T-504)');
  }
  const staleTimer = stripHtmlComments(indexSrc).match(/<div id="timer">([^<]*)<\/div>/);
  if (!staleTimer) fail('index.html has no #timer element — this guard no longer watches anything (T-504)');
  else if (staleTimer[1].trim() !== '') {
    fail(`index.html ships #timer holding "${staleTimer[1].trim()}" — the start value of the campaign clock ramp R-1.1 retired, and no mode counts down from it any more (T-504)`);
  }

  // B2 #1 (T-310): the ring's big number is the visually dominant readout in
  // the HUD and it is a chain count. It must carry a unit in the markup.
  const readout = stripHtmlComments(indexSrc).match(/<div class="cm-readout">[\s\S]*?<\/div>/);
  if (!readout) fail('index.html has no .cm-readout block — the combo ring markup moved and this guard no longer watches anything');
  else if (!/cm-unit/.test(readout[0]) || !/CHAIN/i.test(readout[0])) {
    fail(`index.html combo ring does not label its big number as a CHAIN: ${readout[0].replace(/\s+/g, ' ')} (T-310)`);
  }

  // Every gameplay announcement goes through the queue (GWT-604): the sandbox
  // event dressing must not reach for the presentation backends directly.
  const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const sandboxBlock = mainSrc.slice(mainSrc.indexOf('if (isVoxelSandbox) {'), mainSrc.indexOf('} else {', mainSrc.indexOf('if (isVoxelSandbox) {')));
  for (const m of ['hud.showToast', 'hud.showBigPop', 'hud.showBand']) {
    if (sandboxBlock.includes(m)) fail(`js/main.js sandbox dressing calls ${m}() directly — every announcement must go through hud.announce()`);
  }

  // "N levels" counts the x1 floor plus one per threshold. It used to print
  // `COMBO_THRESHOLDS.length` beside the raw array, which is how the inert head
  // entry stayed invisible for so long: the line read "8 levels (2, 10, 15, …)"
  // and every number in it was true, while one of those numbers bought nothing.
  console.log(`  combo ladder: ${COMBO_THRESHOLDS.length + 1} levels (x1 floor, then ${COMBO_THRESHOLDS.join(', ')}), x1..x${comboMult(1e6)}, "${COMBO_LEVEL_NAMES[COMBO_MAX_LEVEL]}" from chain ${topAt}`);
  console.log(`  milestone ladder: ${MILESTONES.length} rows, ${(MILESTONES[0].at * 100).toFixed(0)}% -> ${(MILESTONES[MILESTONES.length - 1].at * 100).toFixed(0)}% of the scene goal`);
}

// --- shop categories & multi-rank incremental upgrades ------------------------
function validateShopAndUpgrades() {
  console.log('Validating shop categories & incremental upgrades...');

  // 1. Upgrade definitions
  if (!Array.isArray(UPGRADES) || UPGRADES.length !== 4) {
    fail(`UPGRADES must have 4 core stats, found ${UPGRADES?.length}`);
    return;
  }
  const expectedUpgradeIds = ['speed', 'vortex', 'growth', 'duration'];
  const actualUpgradeIds = UPGRADES.map((u) => u.id);
  for (const exp of expectedUpgradeIds) {
    if (!actualUpgradeIds.includes(exp)) fail(`UPGRADES missing stat upgrade '${exp}'`);
  }

  for (const u of UPGRADES) {
    if (!u.name || !u.statName || !u.icon || !u.desc || !u.unit) {
      fail(`UPGRADES entry '${u.id}' missing required metadata (name/statName/icon/desc/unit)`);
    }
    if (u.stepPercent !== 5) fail(`UPGRADES '${u.id}' stepPercent must be 5, found ${u.stepPercent}`);
    if (u.maxRank !== 20) fail(`UPGRADES '${u.id}' maxRank must be 20, found ${u.maxRank}`);
  }

  // 2. 20-tier upgrade cost escalation curve
  if (!Array.isArray(UPGRADE_COST_TABLE) || UPGRADE_COST_TABLE.length !== 20) {
    fail(`UPGRADE_COST_TABLE must have 20 ranks, found ${UPGRADE_COST_TABLE?.length}`);
    return;
  }
  if (UPGRADE_COST_TABLE[0] !== 100) fail(`UPGRADE_COST_TABLE[0] must start at 100 coins, found ${UPGRADE_COST_TABLE[0]}`);
  if (UPGRADE_COST_TABLE[19] !== 3400) fail(`UPGRADE_COST_TABLE[19] must end at 3400 coins, found ${UPGRADE_COST_TABLE[19]}`);

  // Monotonic increase
  for (let i = 1; i < UPGRADE_COST_TABLE.length; i++) {
    if (UPGRADE_COST_TABLE[i] <= UPGRADE_COST_TABLE[i - 1]) {
      fail(`UPGRADE_COST_TABLE is not strictly monotonically increasing at rank ${i}`);
    }
  }

  const categorySum = UPGRADE_COST_TABLE.reduce((a, b) => a + b, 0);
  const totalAllSum = categorySum * 4;
  if (categorySum < 25000 || categorySum > 30000) {
    fail(`UPGRADE_COST_TABLE per category sum should be ~27k coins, found ${categorySum}`);
  }
  if (totalAllSum < 100000 || totalAllSum > 115000) {
    fail(`Total across all 4 upgrade tracks should be ~100k-110k coins, found ${totalAllSum}`);
  }

  // 3. upgradeCost(rank) helper
  if (upgradeCost(0) !== 100) fail(`upgradeCost(0) must be 100, got ${upgradeCost(0)}`);
  if (upgradeCost(19) !== 3400) fail(`upgradeCost(19) must be 3400, got ${upgradeCost(19)}`);
  if (upgradeCost(20) !== null) fail(`upgradeCost(20) should return null (maxed), got ${upgradeCost(20)}`);
  if (upgradeCost(-1) !== null) fail(`upgradeCost(-1) should return null (out of bounds), got ${upgradeCost(-1)}`);

  // 4. upgradeMultiplier(rank)
  if (upgradeMultiplier(0) !== 1.0) fail(`upgradeMultiplier(0) must be 1.0 (no boost), got ${upgradeMultiplier(0)}`);
  if (Math.abs(upgradeMultiplier(1) - 1.05) > 1e-6) fail(`upgradeMultiplier(1) must be 1.05 (+5%), got ${upgradeMultiplier(1)}`);
  if (Math.abs(upgradeMultiplier(10) - 1.50) > 1e-6) fail(`upgradeMultiplier(10) must be 1.50 (+50%), got ${upgradeMultiplier(10)}`);
  if (Math.abs(upgradeMultiplier(20) - 2.00) > 1e-6) fail(`upgradeMultiplier(20) must be 2.00 (+100%), got ${upgradeMultiplier(20)}`);
  if (upgradeMultiplier(-5) !== 1.0) fail(`upgradeMultiplier(-5) should clamp to 1.0, got ${upgradeMultiplier(-5)}`);
  if (upgradeMultiplier(25) !== 2.0) fail(`upgradeMultiplier(25) should clamp to 2.0, got ${upgradeMultiplier(25)}`);

  // 5. defaultUpgrades()
  const defUp = defaultUpgrades();
  for (const id of expectedUpgradeIds) {
    if (defUp[id] !== 0) fail(`defaultUpgrades().${id} must be 0, got ${defUp[id]}`);
  }

  // 6. Save migration 19->20
  if (CURRENT_VERSION < 20) {
    fail(`CURRENT_VERSION in js/save.js must be at least 20, got ${CURRENT_VERSION}`);
  }
  const mig19 = __MIGRATIONS[19];
  if (!mig19) {
    fail(`__MIGRATIONS[19] is missing in js/save.js`);
  } else {
    const legacySaveWithGrowth = { version: 19, ownedItems: ['growth5'], coins: 500 };
    const migrated1 = mig19(legacySaveWithGrowth);
    if (migrated1.version !== 20 || migrated1.upgrades?.growth !== 1) {
      fail(`Migration 19->20 should migrate legacy 'growth5' to upgrades.growth = 1, got ${JSON.stringify(migrated1.upgrades)}`);
    }

    const legacySaveClean = { version: 19, ownedItems: [], coins: 100 };
    const migrated2 = mig19(legacySaveClean);
    if (migrated2.version !== 20 || migrated2.upgrades?.growth !== 0 || migrated2.upgrades?.speed !== 0) {
      fail(`Migration 19->20 should initialize default upgrades, got ${JSON.stringify(migrated2.upgrades)}`);
    }
  }

  // 7. Shop Categories and Categorization
  if (!Array.isArray(SHOP_CATEGORIES) || SHOP_CATEGORIES.length !== 5) {
    fail(`SHOP_CATEGORIES must have 5 categories, got ${SHOP_CATEGORIES?.length}`);
    return;
  }
  const expectedCatIds = ['skins', 'creatures', 'partners', 'indicators', 'upgrades'];
  const actualCatIds = SHOP_CATEGORIES.map((c) => c.id);
  for (const exp of expectedCatIds) {
    if (!actualCatIds.includes(exp)) fail(`SHOP_CATEGORIES missing '${exp}'`);
  }

  // Parse skins.js source statically without importing three.js
  const skinsSrc = readFileSync(new URL('../js/skins.js', import.meta.url), 'utf8');
  const skinsBlock = skinsSrc.slice(skinsSrc.indexOf('export const SKINS = ['), skinsSrc.indexOf('export const SKIN_BY_ID'));
  const rawSkinItems = skinsBlock.split(/\{\s*id:\s*['"]/g).slice(1);
  const skinsParsed = rawSkinItems.map((chunk) => {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const familyMatch = chunk.match(/family:\s*['"]([^'"]+)['"]/);
    return {
      id,
      family: familyMatch ? familyMatch[1] : undefined,
      // Partner rows ship only with a recorded approval to feature the agency's
      // logo (isSkinAvailable in js/skinapproval.js). The static parser has to
      // carry the flag or every partner reads as unapproved here, which would
      // fail the shelf count for the wrong reason.
      approved: /\bapproved:\s*true\b/.test(chunk) || undefined,
      price: id === 'classic' ? 0 : 100,
    };
  });

  const indBlock = skinsSrc.slice(skinsSrc.indexOf('export const INDICATOR_SKINS = ['), skinsSrc.indexOf('export const INDICATOR_BY_ID'));
  const rawIndItems = indBlock.split(/\{\s*id:\s*['"]/g).slice(1);
  const indParsed = rawIndItems.map((chunk) => {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const nameMatch = chunk.match(/name:\s*['"]([^'"]+)['"]/);
    return {
      id,
      name: nameMatch ? nameMatch[1] : id,
      price: id === 'ind-default' ? 0 : 150,
    };
  });

  const dummySave = { ...__freshSave(), ownedItems: ['classic', 'ind-default'] };
  const skinsItems = getShopItemsByCategory('skins', { save: dummySave, skins: skinsParsed, indicatorSkins: indParsed });
  const creaturesItems = getShopItemsByCategory('creatures', { save: dummySave, skins: skinsParsed, indicatorSkins: indParsed });
  const partnersItems = getShopItemsByCategory('partners', { save: dummySave, skins: skinsParsed, indicatorSkins: indParsed });
  const indicatorsItems = getShopItemsByCategory('indicators', { save: dummySave, skins: skinsParsed, indicatorSkins: indParsed });
  const upgradesItems = getShopItemsByCategory('upgrades', { save: dummySave, skins: skinsParsed, indicatorSkins: indParsed });

  if (skinsItems.length !== 19) fail(`Category 'skins' should contain 19 standard skins, found ${skinsItems.length}`);
  if (creaturesItems.length !== 5) fail(`Category 'creatures' should contain 5 creature skins, found ${creaturesItems.length}`);
  // ONE, not eight. Seven partner rows are still in the catalog but withdrawn:
  // their marks ship without the agency's approval, so isSkinAvailable() keeps
  // them off the shelf. This number going back up without a matching `approved`
  // flag is a real company's logo being sold again. See
  // tools/partner-approval.test.mjs.
  if (partnersItems.length !== 1) fail(`Category 'partners' should contain 1 approved partner skin, found ${partnersItems.length}`);
  if (indicatorsItems.length !== 6) fail(`Category 'indicators' should contain 6 indicator skins, found ${indicatorsItems.length}`);
  if (upgradesItems.length !== 4) fail(`Category 'upgrades' should contain 4 stat upgrades, found ${upgradesItems.length}`);

  const totalCategorized = skinsItems.length + creaturesItems.length + partnersItems.length + indicatorsItems.length + upgradesItems.length;
  if (totalCategorized !== 35) fail(`Total shop items should be 35 (19+5+1+6+4), got ${totalCategorized}`);

  // 8. Shop Bottom Navigation Layout & Accessibility Assertions
  const screensSrc = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');
  if (!screensSrc.includes('<nav class="shop-tab-bar"') && !screensSrc.includes("nav class='shop-tab-bar'")) {
    fail(`screens.js must render <nav class="shop-tab-bar" for accessible bottom navigation`);
  }
  if (!screensSrc.includes('tab-label')) {
    fail(`screens.js shop tabs must render text labels alongside icons`);
  }

  const cssSrc = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
  if (!cssSrc.includes('.shop-tab-bar') || !cssSrc.includes('position: fixed') || !cssSrc.includes('bottom: 0')) {
    fail(`css/main.css must dock .shop-tab-bar with position: fixed and bottom: 0 for mobile reachability`);
  }

  console.log(`  shop & upgrades: 5 categories, 35 catalog items, 4 stat tracks (0..20 rank / +0%..+100%), ${categorySum} coins/track (${totalAllSum} total), bottom nav validated`);
}

// --- every scene must be winnable ---------------------------------------------
// A full clear of a targetFraction-1.0 scene must set `won`. This is not a
// theoretical guard: `hole.rawMass` is accumulated one add per block as the city
// is eaten, while `totalMass` is a reduce() over the same blocks in ARRAY order.
// Identical summands, different order, so float rounding leaves rawMass a few
// parts in 1e12 short — a scene could consume every block it has and never win.
// The HUD floors the percentage, so it read 99% forever. Found in live play,
// fixed with a relative epsilon in js/voxelsim.js.
//
// This used to be `validateGalleryWinnable`, because the gallery was the only
// 1.0 scene and the 0.5 cities had half a city of slack hiding the shortfall.
// Every scene is 1.0 now (R-2.1), so every scene is exposed to the same float
// hazard and every scene is checked here (T-204). The failure messages name the
// scene — with seven of them, "the win check needs its epsilon" on its own does
// not say which city could not be finished.
//
// The order matters and is the whole reason this check is written the way it is:
// eating in ARRAY order reproduces totalMass bit-for-bit and passes even on the
// broken code. Radial order — nearest first, which is roughly how a real hole
// eats — is one of the orders that actually loses, so that is what runs here.
//
// Cost, measured 2026-08-13 on this machine: 34.0 s for all seven, of which
// 26.4 s is scene BUILD (Boston 6.3 s, Chicago 6.1 s, Cambridge 5.8 s) and the
// rest is the clear. That is the price of the guard covering every scene rather
// than the one cheap one; it is bounded work with no excursion in it.
function validateScenesWinnable() {
  console.log('Validating every scene is winnable (float-order guard on the win check)...');
  // The TABLE first, and separately: it is free, it covers all seven whatever
  // happens below, and it is the assertion R-2.1 actually makes.
  for (const [scene, goal] of Object.entries(SCENE_GOALS)) {
    if (goal.targetFraction !== 1) {
      fail(`scene goal: '${scene}' has targetFraction ${goal.targetFraction}, expected 1 — the goal is the whole city on every scene (R-2.1)`);
    }
  }
  for (const scene of Object.keys(SCENE_GOALS)) {
    const sim = new VoxelSandboxSim({ seed: 'validator', scene });
    if (sim.goal.targetFraction !== 1) {
      fail(`win guard [${scene}]: sim built with targetFraction ${sim.goal.targetFraction} — this guard only means anything at 100%`);
      continue;
    }
    const radial = sim.blocks.slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
    for (const b of radial) if (b.state !== 'consumed') sim._consume(b);
    sim.step(1 / 60, { x: 0, z: 0 });
    const left = sim.blocks.filter((b) => b.state !== 'consumed').length;
    const shortfall = sim.totalMass - sim.hole.rawMass;
    const epsilon = sim.totalMass * 1e-9;
    if (left > 0) fail(`win guard [${scene}]: ${left} block(s) survived a full clear — the harness is not clearing the city`);
    if (!sim.won) {
      fail(`win guard [${scene}]: consumed all ${sim.totalBlocks} blocks and won is still false (shortfall ${shortfall.toExponential(3)} vs epsilon ${epsilon.toExponential(3)}) — the win check needs its epsilon`);
    }
    // The RESIDUAL, printed rather than merely compared. A guard that only says
    // pass cannot show the margin closing: if a scene grows and its accumulated
    // float error creeps toward the epsilon, this line is where it shows up
    // BEFORE the day it crosses.
    console.log(`  ${scene}: ${sim.totalBlocks} blocks consumed, survivors=${left}, shortfall=${shortfall.toExponential(3)}, epsilon=${epsilon.toExponential(3)} (${(Math.abs(shortfall) / epsilon * 100).toFixed(2)}% of it), won=${sim.won}`);
  }
}

// --- the 180 s level clock (R-1) ----------------------------------------------
// Three separate claims, and they fail for different reasons, so each gets its
// own assertion and its own message.
//
//   1. ONE declaration (T-101). The constant is grepped for in js/, because the
//      failure mode this closes is a SECOND copy — a scene, tier or platform
//      quietly holding its own 180 — which no behavioural test can see.
//   2. A city run ends at exactly LEVEL_CLOCK_TICKS (T-102), deterministically,
//      and every tick before that it is still running.
//   3. THE RUN is untouched (T-107): it ends at 5,400 ticks, it never sets
//      `timedOut`, and it carries no level clock at all.
function validateLevelClock() {
  console.log('Validating the level clock...');
  if (LEVEL_CLOCK_SECONDS !== 300) {
    fail(`level clock: LEVEL_CLOCK_SECONDS is ${LEVEL_CLOCK_SECONDS}, expected 300 (R-1.1)`);
  }
  if (LEVEL_CLOCK_TICKS !== LEVEL_CLOCK_SECONDS * 60) {
    fail(`level clock: LEVEL_CLOCK_TICKS (${LEVEL_CLOCK_TICKS}) is not LEVEL_CLOCK_SECONDS * 60 — the two would expire on different ticks`);
  }

  // One declaration, nowhere else (T-101). Two greps, because a second copy can
  // arrive wearing either of two disguises and neither catches the other:
  //   (a) the same NAME re-declared somewhere else, which an import would have
  //       made unnecessary;
  //   (b) a differently-named constant holding the same number.
  //
  // (b) is deliberately name-gated to clock-ish identifiers rather than looking
  // for a bare 300. 300 is degrees, metres and milliseconds as often as it is
  // seconds — and a guard that fires on that is a guard
  // people turn off. What is actually being caught is a SECOND CLOCK.
  const jsFiles = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'levelclock.js');
  const NAME_RE = /LEVEL_CLOCK_(?:SECONDS|TICKS)\s*=/;
  const CLOCKISH_RE = /(?:const|let|var)\s+[A-Za-z_$][\w$]*(?:CLOCK|TIMER|COUNTDOWN|DURATION|TIME_?LIMIT|SECONDS|TICKS)[\w$]*\s*=\s*(?:300|18000)\s*[;,)\n]/i;
  // The greps are checked against known inputs before they are trusted. A text
  // guard that has only ever returned "clean" has not been shown to detect
  // anything; these four lines are the difference between a guard and a comment.
  for (const bad of ['const SANDBOX_CLOCK = 300;\n', 'const matchDurationTicks = 18000;\n', 'export const LEVEL_CLOCK_SECONDS = 300;\n']) {
    if (!(CLOCKISH_RE.test(bad) || NAME_RE.test(bad))) fail(`level clock: the second-copy grep does not detect \`${bad.trim()}\` — the guard is inert`);
  }
  for (const ok of ['const SHADOW_EXTENT_MAX = 300;\n', 'const HUE_SPAN = 300;\n']) {
    if (CLOCKISH_RE.test(ok)) fail(`level clock: the second-copy grep fires on \`${ok.trim()}\`, which is not a clock — it will be turned off`);
  }
  for (const f of jsFiles) {
    const src = readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
    if (NAME_RE.test(src)) {
      fail(`level clock: js/${f} re-declares LEVEL_CLOCK_SECONDS/LEVEL_CLOCK_TICKS — R-1.1 allows exactly one declaration, in js/levelclock.js; import it instead`);
    }
    if (CLOCKISH_RE.test(src)) {
      fail(`level clock: js/${f} declares a clock/duration constant equal to 300 or 18000 — that is a second copy of the level clock; import LEVEL_CLOCK_SECONDS from js/levelclock.js instead`);
    }
  }
  // The campaign reads the same constant rather than ramping its own (T-101).
  const offCampaign = LEVELS.filter((l) => l.clock !== LEVEL_CLOCK_SECONDS);
  if (offCampaign.length) {
    fail(`level clock: ${offCampaign.length} campaign level(s) carry their own clock, first L${offCampaign[0].index} at ${offCampaign[0].clock}s`);
  }

  // (2) A real scene run ends on the tick, and not one tick earlier. The gallery
  // is the cheap scene and the clock is scene-independent BY CONSTRUCTION — it
  // is read from the constant, never from the scene — so this proves the tick
  // without paying seven scene builds for one number. `clockLimit` is then
  // asserted directly on a built city, which is the part that IS per-scene.
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'gallery' });
  if (sim.clockLimit !== LEVEL_CLOCK_TICKS) {
    fail(`level clock: a freeplay sim opened with clockLimit ${sim.clockLimit}, expected ${LEVEL_CLOCK_TICKS}`);
  }
  if (sim.timeLeft !== LEVEL_CLOCK_SECONDS) {
    fail(`level clock: a freeplay sim opened with timeLeft ${sim.timeLeft}, expected ${LEVEL_CLOCK_SECONDS}`);
  }
  let endedAt = null, marks = [];
  for (let i = 1; i <= LEVEL_CLOCK_TICKS + 120; i++) {
    sim.step(DT, { x: 0, z: 0 });
    for (const ev of sim.drainEvents()) if (ev.type === 'clock') marks.push({ at: ev.at, tick: i });
    if (sim.over && endedAt === null) endedAt = i;
  }
  if (endedAt !== LEVEL_CLOCK_TICKS) {
    fail(`level clock: an idle gallery run ended at tick ${endedAt}, expected exactly ${LEVEL_CLOCK_TICKS} (R-1.3)`);
  }
  if (!sim.timedOut || sim.won) {
    fail(`level clock: expiry produced timedOut=${sim.timedOut} won=${sim.won} — a time-out is a normal ending that is not a win`);
  }
  if (sim.timeLeft !== 0) fail(`level clock: timeLeft is ${sim.timeLeft} after expiry, expected exactly 0`);
  // (T-104) Both endgame states, once each, at the right ticks.
  const expectMarks = [
    { at: 30, tick: LEVEL_CLOCK_TICKS - 30 * 60 },
    { at: 10, tick: LEVEL_CLOCK_TICKS - 10 * 60 },
  ];
  if (marks.length !== expectMarks.length
      || marks.some((m, i) => m.at !== expectMarks[i].at || m.tick !== expectMarks[i].tick)) {
    fail(`level clock: endgame states fired ${JSON.stringify(marks)}, expected ${JSON.stringify(expectMarks)} — each must fire exactly once, at its own tick`);
  }

  // Determinism: the clock is a tick counter, so two identical runs must expire
  // on the same tick. Cheap, and it is the property R-1.4 actually promises.
  const twin = new VoxelSandboxSim({ seed: 'validator', scene: 'gallery' });
  let twinEnd = null;
  for (let i = 1; i <= LEVEL_CLOCK_TICKS; i++) { twin.step(DT, { x: 0, z: 0 }); if (twin.over && twinEnd === null) twinEnd = i; }
  if (twinEnd !== endedAt) fail(`level clock: two identical runs expired at different ticks (${endedAt} vs ${twinEnd})`);

  // (3) THE RUN keeps its own bound and never acquires a level clock (T-107).
  const ranked = new VoxelSandboxSim({ seed: 'validator', scene: 'gallery', mode: 'run90' });
  if (ranked.clockLimit !== null) {
    fail(`level clock: a run90 sim carries clockLimit ${ranked.clockLimit} — THE RUN must not inherit the 180 s limit (R-1.7)`);
  }
  if (ranked.timeLeft !== null) {
    fail(`level clock: a run90 sim carries timeLeft ${ranked.timeLeft} — THE RUN has no level clock and must report none`);
  }
  let rankedEnd = null;
  for (let i = 1; i <= RANKED_TICK_COUNT + 60 && rankedEnd === null; i++) {
    ranked.step(DT, { x: 0, z: 0 });
    if (ranked.over) rankedEnd = i;
  }
  if (rankedEnd !== RANKED_TICK_COUNT || !ranked.runComplete || ranked.timedOut) {
    fail(`level clock: THE RUN ended at tick ${rankedEnd} (expected ${RANKED_TICK_COUNT}), runComplete=${ranked.runComplete}, timedOut=${ranked.timedOut}`);
  }
  if (ranked.clockTicks !== 0) {
    fail(`level clock: THE RUN advanced clockTicks to ${ranked.clockTicks} — it must never consult the level clock (T-107)`);
  }

  console.log(`  level clock: ${LEVEL_CLOCK_SECONDS}s = ${LEVEL_CLOCK_TICKS} ticks, one declaration, campaign+sandbox agree; expiry at tick ${endedAt} (timedOut, not won); endgame states at ${marks.map((m) => `${m.at}s@${m.tick}`).join(', ')}; THE RUN still ends at ${rankedEnd} with clockTicks=${ranked.clockTicks}`);
}

// --- offline-boot guard -------------------------------------------------------
// index.html must not reach off-origin for anything the boot needs. This is a
// regression guard with a live incident behind it: the import map used to
// resolve "three" to cdn.jsdelivr.net, so the entire 3D engine arrived over a
// third-party host at runtime. When that fetch failed — observed as
// ERR_CONNECTION_RESET, then succeeding on retry minutes later — no module in
// js/ ever evaluated, js/main.js never reached the line that removes
// #boot-splash, and the game sat on "FLYWHEEL / LOADING…" indefinitely with no
// error anywhere a player could see. The splash was built for a SLOW load; a
// FAILED load had no path at all.
//
// The engine is vendored at js/vendor/three.module.js and the map points there,
// which is why this check exists rather than a comment: the CDN URL is a
// one-line edit away and the symptom of reintroducing it is invisible on a good
// connection. It only shows up on the connection we cannot control — the venue
// wifi at a conference demo — which is the worst possible discovery surface.
//
// Every reference is checked, not just the map: a <script src> or a stylesheet
// on a remote host is the same dependency wearing a different tag. Relative,
// root-relative and same-document paths all pass; anything with a scheme or a
// protocol-relative "//host" prefix fails.
const OFFSITE_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
// Every HTML page this repo ships, and whether it is the one that boots the
// game. `importmap: true` is index.html ALONE and must stay that way: the two
// legal pages are plain documents that import nothing, so requiring a map of
// them would fail correct files. Everything else — the <script src> and
// <link href> sweeps, and what counts as off-origin — is identical for all
// three, which is the whole point of the list.
//
// privacy.html and terms.html joined on 2026-08-13, the day they landed. They
// are pure inline markup with zero external references today, and zero is
// exactly the state a guard exists to hold: a single <link> to a Google font is
// one line away, it would look completely normal in review, and nothing would
// have complained. They are also the pages most likely to be opened by someone
// who has never loaded the game, on a connection we do not control.
const OFFLINE_PAGES = [
  { file: 'index.html', importmap: true },
  { file: 'privacy.html', importmap: false },
  { file: 'terms.html', importmap: false },
];
function validateOfflineBoot() {
  console.log(`Validating offline boot (${OFFLINE_PAGES.length} shipped page(s) have no off-origin dependencies)...`);
  let offsite = 0;
  const scanned = [];

  for (const page of OFFLINE_PAGES) {
    const { file } = page;
    // A page that cannot be read must FAIL, never contribute a quiet zero: a
    // renamed or deleted file would otherwise scan to "0 references, all
    // same-origin" and read exactly like a clean page. The empty check is the
    // same hole one step along — a truncated write also scans to zero.
    let html;
    try {
      html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    } catch (e) {
      fail(`offline boot: cannot read ${file} (${e.code || e.message}) — it is in the shipped-page list, so either the file moved and OFFLINE_PAGES needs updating, or the page is missing from the deploy`);
      scanned.push(`${file} UNREADABLE`);
      continue;
    }
    if (!html.trim()) {
      fail(`offline boot: ${file} is empty — an empty file scans to zero references and reads as a clean page, which is why this is checked rather than assumed`);
      scanned.push(`${file} EMPTY`);
      continue;
    }
    let refs = 0;

    if (page.importmap) {
      const map = /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
      if (!map) {
        fail(`offline boot: ${file} has no importmap — js/*.js import "three" as a bare specifier and nothing resolves it`);
      } else {
        let imports;
        try {
          imports = JSON.parse(map[1]).imports || {};
        } catch (e) {
          fail(`offline boot: the importmap in ${file} is not valid JSON (${e.message}) — the browser drops the whole map and every bare import fails`);
          imports = {};
        }
        for (const [spec, target] of Object.entries(imports)) {
          refs++;
          if (OFFSITE_RE.test(target)) {
            offsite++;
            fail(`offline boot: importmap in ${file} resolves "${spec}" to ${target} — the game cannot boot without that host, so a flaky connection (venue wifi, a CDN blip) leaves the player stuck on the LOADING splash forever. Vendor it under js/vendor/ and point the map at the local path.`);
          }
        }
      }
    }

    for (const [re, what] of [
      [/<script[^>]*\ssrc=["']([^"']+)["']/gi, 'script'],
      [/<link[^>]*\shref=["']([^"']+)["']/gi, 'stylesheet/link'],
    ]) {
      for (const m of html.matchAll(re)) {
        refs++;
        if (OFFSITE_RE.test(m[1])) {
          offsite++;
          fail(`offline boot: ${file} loads a ${what} from ${m[1]} — an off-origin fetch the page cannot boot (or cannot render) without. Vendor it into the repo and reference it by relative path.`);
        }
      }
    }
    if (file === 'index.html') {
      const hasFavicon = /<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html);
      if (!hasFavicon) {
        fail(`offline boot: index.html has no favicon link declared — causes 404 on /favicon.ico`);
      }
    }
    // Bytes as well as reference count, so a zero is legible as "scanned and
    // clean" rather than as "never opened". Naming every page is what makes the
    // line evidence of coverage instead of a claim of it.
    scanned.push(`${file} ${refs} ref/${(html.length / 1024).toFixed(1)}kB`);
  }

  // Static module syntax check across all JS and MJS modules in the project
  const jsDir = new URL('../js/', import.meta.url);
  const allModules = [];
  const scanJs = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = new URL(ent.name + (ent.isDirectory() ? '/' : ''), dir);
      if (ent.isDirectory() && ent.name !== 'node_modules' && ent.name !== '.git' && ent.name !== 'vendor') {
        scanJs(full);
      } else if (ent.isFile() && (ent.name.endsWith('.js') || ent.name.endsWith('.mjs'))) {
        allModules.push(fileURLToPath(full));
      }
    }
  };
  scanJs(jsDir);
  for (const mod of allModules) {
    const src = readFileSync(mod, 'utf8');
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const importedIds = new Set();
    for (const match of stripped.matchAll(/^\s*import\s+(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))\s+from/gm)) {
      const ids = match[1]
        ? match[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)
        : [match[2] || match[3]].filter(Boolean);
      for (const id of ids) {
        if (importedIds.has(id)) {
          fail(`duplicate import identifier '${id}' in ${mod.slice(mod.lastIndexOf('js'))}`);
        }
        importedIds.add(id);
      }
    }
  }

  console.log(`  offline boot: ${OFFLINE_PAGES.length} page(s) scanned [${scanned.join(', ')}], ${offsite === 0 ? 'all same-origin' : `${offsite} OFF-ORIGIN`}`);
}

function validateGameplayEnhancements() {
  console.log('Validating gameplay enhancements (max titan, uncapped frenzy, coin accounting, disaster teleport)...');

  // 1. Coin Accounting & Initialization (No NaN)
  const vsim = new VoxelSandboxSim({ seed: 'coin-test' });
  if (vsim.coinsCollected !== 0 || typeof vsim.coinsCollected !== 'number') {
    fail(`VoxelSandboxSim coinsCollected should initialize to 0, got: ${vsim.coinsCollected}`);
  }
  if (!Array.isArray(vsim.coins)) {
    fail(`VoxelSandboxSim coins should initialize to Array, got: ${typeof vsim.coins}`);
  }

  // 2. Titan Surge (Enlarged Hole) Max Size
  const hole = vsim.hole;
  const initialRadius = hole.radius;
  const titanPu = createPowerUp(999, POWERUP_TYPES.TITAN, 0, 0);
  activatePowerUp(hole.activePowerUps, titanPu, hole, vsim);
  
  vsim.step(1/60);
  if (hole.radius < 12.0) {
    fail(`Titan Surge did not enlarge hole to MAX_RADIUS, radius=${hole.radius} (expected >= 12.0)`);
  }

  // 3. Chain Frenzy Uncapped Multiplier (+1x per 500 blocks eaten during Frenzy)
  const frenzyPu = createPowerUp(998, POWERUP_TYPES.FRENZY, 0, 0);
  activatePowerUp(hole.activePowerUps, frenzyPu, hole, vsim);
  hole.chain = 10000; // max base ladder x8
  hole.chainTimer = 1.0;
  vsim.step(1/60);
  if (hole.chainTimer < 1.0) {
    fail(`Chain Frenzy should freeze/preserve chain timer, got: ${hole.chainTimer}`);
  }
  const frenzyAct = hole.activePowerUps.find((a) => a.type === POWERUP_TYPES.FRENZY || a.id === POWERUP_TYPES.FRENZY);
  if (!frenzyAct) fail('Chain Frenzy powerup not found in activePowerUps');
  frenzyAct.blocksEaten = 1500; // 1500 blocks eaten -> +3x extra mult -> total 8 + 3 = 11x (* 2.0 frenzyBoost = 22x)
  const dummyBlock = { id: 1, x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, rawMass: 10 };
  const prevMass = hole.mass;
  vsim._award(hole, 10, dummyBlock);
  const gained = hole.mass - prevMass;
  // With base 8 + extra 3 (from 1501 blocks) = 11x * 2.0 = 22x -> gained = 10 * 22 = 220
  if (gained < 10 * 22) {
    fail(`Chain Frenzy did not apply uncapped +1x per 500 blocks multiplier, gained=${gained} (expected >= 220)`);
  }

  // 4. Natural Disaster Teleportation Penalty
  hole.x = 10;
  hole.z = 10;
  const fromX = hole.x, fromZ = hole.z;
  if (typeof vsim._teleportHoleFromDisaster !== 'function') {
    fail('VoxelSandboxSim._teleportHoleFromDisaster is not defined');
  } else {
    vsim._teleportHoleFromDisaster(hole, 'meteor');
    if (hole.x === fromX && hole.z === fromZ) {
      fail(`Disaster penalty should teleport player away from disaster location`);
    }
    const teleportEv = vsim.events.find((e) => e.type === 'disaster_teleport');
    if (!teleportEv) {
      fail(`Disaster penalty should emit 'disaster_teleport' event`);
    }
  }

  // 5. Fastest Clear Time Tracking (Campaign & Sandbox Results)
  const mockSave = __freshSave();
  recordLevelResult(mockSave, 1, { stars: 3, mass: 100, bestCombo: 5, won: true, coinsEarned: 10, elapsed: 42.5 });
  if (mockSave.levels[1].fastestClear !== 42.5) {
    fail(`recordLevelResult failed to set initial fastestClear, expected 42.5 got ${mockSave.levels[1]?.fastestClear}`);
  }
  // Faster clear replaces fastestClear
  recordLevelResult(mockSave, 1, { stars: 3, mass: 110, bestCombo: 6, won: true, coinsEarned: 10, elapsed: 35.2 });
  if (mockSave.levels[1].fastestClear !== 35.2) {
    fail(`recordLevelResult failed to update fastestClear with faster time, expected 35.2 got ${mockSave.levels[1]?.fastestClear}`);
  }
  // Slower clear preserves fastestClear
  recordLevelResult(mockSave, 1, { stars: 3, mass: 120, bestCombo: 7, won: true, coinsEarned: 10, elapsed: 50.0 });
  if (mockSave.levels[1].fastestClear !== 35.2) {
    fail(`recordLevelResult overwritten fastestClear with slower time, expected 35.2 got ${mockSave.levels[1]?.fastestClear}`);
  }
  // Failed attempt does not update fastestClear
  recordLevelResult(mockSave, 1, { stars: 0, mass: 50, bestCombo: 2, won: false, coinsEarned: 0, elapsed: 20.0 });
  if (mockSave.levels[1].fastestClear !== 35.2) {
    fail(`recordLevelResult updated fastestClear on loss, expected 35.2 got ${mockSave.levels[1]?.fastestClear}`);
  }

  // 6. Modal / Cinematic 10-Second Auto-Dismiss Durations & Results Navigation Markup
  const screensCode = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');
  if (!screensCode.includes('remainingMs = 10000')) {
    fail('showPowerUpShowcase in screens.js does not use 10000ms (10s) duration');
  }
  if (!screensCode.includes('Math.max(10000, duration * 1000)')) {
    fail('Cinematic autoDismissTimeout in screens.js does not use Math.max(10000, ...)');
  }
  if (!screensCode.includes('results-btn-again') || !screensCode.includes('results-btn-cities') || !screensCode.includes('results-btn-menu')) {
    fail('showSandboxResults in screens.js is missing results action buttons (again, cities, menu)');
  }
  if (!screensCode.includes('results-btn-cont') || !screensCode.includes('results-btn-cities') || !screensCode.includes('results-btn-menu')) {
    fail('showResults in screens.js is missing results action buttons (cont, cities, menu)');
  }
  const hudCode = readFileSync(new URL('../js/ui/hud.js', import.meta.url), 'utf8');
  if (!hudCode.includes('ms = 10000')) {
    fail('hud.js announce/toast does not default to ms = 10000 (10s)');
  }

  // 7. Sim Level Clock Expiration Ending Assertion
  const testSim = new VoxelSandboxSim({ seed: 'timer-test' });
  testSim.clockLimit = 60; // 1 second
  for (let i = 0; i < 60; i++) testSim.step(1/60);
  if (!testSim.over || !testSim.timedOut) {
    fail(`Sim failed to end when clock expired, over=${testSim.over} timedOut=${testSim.timedOut}`);
  }

  // 8. Combo Meter Visual Brightness CSS Assertion
  const cssCode = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
  if (!cssCode.includes('opacity: .88') && !cssCode.includes('opacity: 0.88') && !cssCode.includes('opacity: 0.9')) {
    fail('Combo meter in main.css does not have high base opacity (must be bright)');
  }
}

function validateCityChallenges() {
  console.log('Validating 3-minute city challenges, 2x coin multipliers & secret 90s unlock...');

  // 1. Level Clock Declarations
  if (CHALLENGE_CLOCK_SECONDS !== 180) {
    fail(`CHALLENGE_CLOCK_SECONDS is ${CHALLENGE_CLOCK_SECONDS}, expected 180 (3 minutes)`);
  }
  if (CHALLENGE_CLOCK_TICKS !== 180 * 60) {
    fail(`CHALLENGE_CLOCK_TICKS is ${CHALLENGE_CLOCK_TICKS}, expected 10800`);
  }
  if (SECRET_CHALLENGE_CLOCK_SECONDS !== 90) {
    fail(`SECRET_CHALLENGE_CLOCK_SECONDS is ${SECRET_CHALLENGE_CLOCK_SECONDS}, expected 90`);
  }
  if (SECRET_CHALLENGE_CLOCK_TICKS !== 90 * 60) {
    fail(`SECRET_CHALLENGE_CLOCK_TICKS is ${SECRET_CHALLENGE_CLOCK_TICKS}, expected 5400`);
  }

  // 2. 3-Minute Challenge Simulation & Clock Bounds
  const sim3m = new VoxelSandboxSim({ seed: 'challenge3m-test', scene: 'gallery', mode: 'challenge3m' });
  if (sim3m.clockLimit !== CHALLENGE_CLOCK_TICKS) {
    fail(`challenge3m sim clockLimit is ${sim3m.clockLimit}, expected ${CHALLENGE_CLOCK_TICKS} (10,800 ticks)`);
  }
  if (sim3m.timeLeft !== CHALLENGE_CLOCK_SECONDS) {
    fail(`challenge3m sim timeLeft is ${sim3m.timeLeft}, expected ${CHALLENGE_CLOCK_SECONDS} (180s)`);
  }
  if (!sim3m.isChallenge) {
    fail('challenge3m sim isChallenge flag should be true');
  }

  // 3. Secret 90s Challenge Simulation
  const sim90s = new VoxelSandboxSim({ seed: 'challenge90s-test', scene: 'gallery', mode: 'challenge90s' });
  if (sim90s.clockLimit !== SECRET_CHALLENGE_CLOCK_TICKS) {
    fail(`challenge90s sim clockLimit is ${sim90s.clockLimit}, expected ${SECRET_CHALLENGE_CLOCK_TICKS} (5,400 ticks)`);
  }
  if (sim90s.timeLeft !== SECRET_CHALLENGE_CLOCK_SECONDS) {
    fail(`challenge90s sim timeLeft is ${sim90s.timeLeft}, expected ${SECRET_CHALLENGE_CLOCK_SECONDS} (90s)`);
  }

  // 4. Challenge Coin Multiplier (2x normal coin value)
  if (CHALLENGE_COIN_MULTIPLIER !== 2) {
    fail(`CHALLENGE_COIN_MULTIPLIER is ${CHALLENGE_COIN_MULTIPLIER}, expected 2`);
  }

  // 5. Secret 90s Challenge Unlock Logic Across City Catalog
  const mockSave = __freshSave();
  const playableCities = CITY_CATALOG.filter((c) => c.status === 'PLAYABLE');
  if (isSecret90sChallengeUnlocked(mockSave, CITY_CATALOG)) {
    fail('Secret 90s challenge should be locked initially on a fresh save');
  }
  if (getCompletedChallengeCount(mockSave, CITY_CATALOG) !== 0) {
    fail(`Initial completed challenge count should be 0, got ${getCompletedChallengeCount(mockSave, CITY_CATALOG)}`);
  }

  // Complete all playable cities except the last
  for (let i = 0; i < playableCities.length - 1; i++) {
    const city = playableCities[i];
    recordChallengeResult(mockSave, city.scene, {
      mode: 'challenge3m',
      won: true,
      elapsed: 110.5,
      score: 15000,
      bestCombo: 25,
      coinsEarned: (city.coinCount * city.coinValue + city.goalBonus) * 2,
      percent: 1.0,
    });
    if (!isCityChallengeCompleted(mockSave, city.scene)) {
      fail(`isCityChallengeCompleted should be true for ${city.scene}`);
    }
  }

  if (isSecret90sChallengeUnlocked(mockSave, CITY_CATALOG)) {
    fail(`Secret 90s challenge should still be locked when ${playableCities.length - 1} of ${playableCities.length} cities are completed`);
  }
  if (getCompletedChallengeCount(mockSave, CITY_CATALOG) !== playableCities.length - 1) {
    fail(`Completed challenge count should be ${playableCities.length - 1}, got ${getCompletedChallengeCount(mockSave, CITY_CATALOG)}`);
  }

  // Complete final playable city
  const lastPlayableCity = playableCities[playableCities.length - 1];
  recordChallengeResult(mockSave, lastPlayableCity.scene, {
    mode: 'challenge3m',
    won: true,
    elapsed: 145.0,
    score: 85000,
    bestCombo: 50,
    coinsEarned: (lastPlayableCity.coinCount * lastPlayableCity.coinValue + lastPlayableCity.goalBonus) * 2,
    percent: 1.0,
  });

  if (!isSecret90sChallengeUnlocked(mockSave, CITY_CATALOG)) {
    fail('Secret 90s challenge should be UNLOCKED after all playable city challenges are completed!');
  }
  if (getCompletedChallengeCount(mockSave, CITY_CATALOG) !== playableCities.length) {
    fail(`Completed challenge count should be ${playableCities.length}, got ${getCompletedChallengeCount(mockSave, CITY_CATALOG)}`);
  }

  // 6. Coins Persistence on Challenge Wins (2x reward)
  const initialCoins = mockSave.coins;
  recordChallengeResult(mockSave, 'chicago', {
    mode: 'challenge3m',
    won: true,
    elapsed: 120.0,
    score: 40000,
    bestCombo: 30,
    coinsEarned: 600, // 2x payout
    percent: 1.0,
  });
  if (mockSave.coins !== initialCoins + 600) {
    fail(`recordChallengeResult should award 600 coins to save.coins, expected ${initialCoins + 600}, got ${mockSave.coins}`);
  }
}

// The multiplayer suites are standalone top-level ESM scripts: they assert with
// node:assert/strict and throw out of the module body on the first failure. That
// is why they are spawned rather than imported and called like every other
// validate* helper here — an import would execute the suite at import time, and
// its throw would abort the whole validator instead of being counted as one
// failure with the rest of the run continuing.
//
// spawnSync, not spawn, because section() calls fn() synchronously and times it;
// it never awaits. An async section would return a pending promise, log 0.0s,
// and let the run print ALL PASS before a single suite had answered — a gate
// that always passes is worse than no gate.
function validateMultiplayer() {
  console.log('Validating multiplayer suites...');
  // Paths are resolved off import.meta.url rather than cwd so the section behaves
  // the same whether it is run directly or as an orchestrator child.
  const suites = [
    'tools/multiplayer-config.test.mjs',
    'tools/multiplayer-protocol.test.mjs',
    'tools/multiplayer-lobby.test.mjs',
    'tools/multiplayer-sim.test.mjs',
    'tools/multiplayer-session.test.mjs',
    'tools/multiplayer-e2e.test.mjs',
    'tools/multiplayer-livechannel.test.mjs',
    'tools/multiplayer-security.test.mjs',
    'tools/multiplayer-fixes.test.mjs',
    'tools/multiplayer-lifecycle.test.mjs',
    'tools/multiplayer-clock-coins.test.mjs',
    'tools/lobby-start-control.test.mjs',
    // Not multiplayer-specific, but this is the section that already spawns
    // standalone suites, and the only two defects of its class so far were both
    // in the multiplayer game-over handlers of js/main.js.
    'tools/main-undefined-identifiers.test.mjs',
    // Same reasoning, same handlers: the silent-podium defect was a music cue
    // requested there that the registry never defined.
    'tools/music-cue.test.mjs',
    // The director's own behaviour suite, which until now no gate ran at all —
    // it was listed in tools/diagnostics.mjs and nowhere else, so the whole
    // music state machine (cue switching, fades, offset restore, muting, and
    // the pre-gesture arming that stops the first tap costing a download)
    // could regress with ALL PASS still printing.
    'js/audio/music.test.mjs',
    // The pause-menu track picker's catalog: availability gating must match the
    // real isCityUnlocked, and every selectable cue must resolve to a real file
    // — the picker passes cues as variables, so tools/music-cue.test.mjs's
    // lexical scanner cannot see a bad row.
    'js/audio/tracklist.test.mjs',
    // Same blind spot one layer down: this selftest pins disk == manifest ==
    // cue registry (bytes and SHA-256 per MP3) but only ran under
    // tools/diagnostics.mjs, so soundtrack drift never failed a gate.
    'tools/music-assets-selftest.mjs',
    // The effects side of the same seam the three music entries above cover.
    // RCA-2026-08-17: a multiplayer refactor deleted js/main.js's one
    // `audio.handleEvent(ev)` and took the gulps, the combo ladder, every
    // stinger, the derailment and the tornado with it, for a day, with ALL PASS
    // printing throughout. js/audio/game-audio.test.mjs asserts the
    // event-to-sound mapping but calls handleEvents() itself, so it owns both
    // sides of the seam and can never see it break; sfx-event-guard watches the
    // seam (and executes the shipped guard text rather than re-implementing it),
    // and the two suites below watch the behaviour behind it. Both of those were
    // reachable only through tools/diagnostics.mjs until now, which is why a
    // suite already asserting `eq(eng.count('eat-1'), 1)` never failed the build.
    'tools/sfx-event-guard.test.mjs',
    'js/audio/game-audio.test.mjs',
    'js/audio/engine.test.mjs',
    // Same class again, across the network seam this time: api/ handlers cannot
    // be imported headlessly (they want Supabase env and a live database), so a
    // browser posting `token` at a handler reading `player_token` had nothing
    // watching it. This suite cross-checks both sides as text.
    'tools/api-auth.test.mjs',
    // Same reasoning again, one layer down: the coin ladder and the growth
    // upgrade are cross-file agreements (citycatalog <-> voxelsim, main.js ->
    // sim.js) that no single-module section owns, and both drifted silently.
    'tools/economy-consistency.test.mjs',
    // Automatic guest names. The generator lives in js/board/names.js but the
    // rules it must satisfy live in api/ (`normaliseName`, `blocked()`), so no
    // single-module section owns the agreement. The sweep is exhaustive over the
    // whole cross product because a 1-in-2000 bad name is a name a real player
    // receives on their first run, with no retry surface in front of them.
    'tools/names.test.mjs',
    // The other half of the same feature: where names.test.mjs guards the words
    // the generator may produce, this one guards that a player actually RECEIVES
    // one (the save default and its v22 migration), that they can re-roll it,
    // that RECORDS and LEADERBOARDS are two different reads, and that the
    // retired weekly-season countdown never comes back. It spans js/save.js,
    // js/board/read.js, js/ui/boards.js, js/ui/screens.js and js/main.js, so no
    // single-module section owns it.
    'tools/records-and-names.test.mjs',
    // Compliance rather than multiplayer, but the same reasoning as the suites
    // above: partner approval spans js/skinapproval.js, js/skins.js (which no
    // Node process can import — three.js at module scope), js/upgrades.js,
    // js/ui/screens.js, js/main.js and a save migration, so no single-module
    // section owns it, and the cost of a regression is a real company's logo
    // shipping without permission.
    'tools/partner-approval.test.mjs',
    // Repo-wide rather than multiplayer, but the one merge-conflict marker that
    // ever shipped rode in on a multiplayer commit, and this is the section that
    // spawns standalone suites. There is no build step, linter or formatter
    // here, so without this nothing reads a `.md` file before it ships.
    'tools/conflict-markers.test.mjs',
    // Also repo-wide rather than multiplayer. The cinematic arming seam spans
    // js/camera.js, js/main.js and js/ui/screens.js — a presentation's callback
    // contract in one file deciding whether a camera cutscene in another is
    // cancellable — so no single-module section owns it either. See
    // .wiki/findings/RCA-2026-08-17-level-start-camera-transition.md.
    'tools/cinematic-arming-guard.test.mjs',
    'js/multiplayer/multiplayer.test.mjs',
  ];
  let passed = 0;
  for (const suite of suites) {
    const file = fileURLToPath(new URL(`../${suite}`, import.meta.url));
    const res = spawnSync(process.execPath, [file], { stdio: 'pipe' });
    // A suite that could not be spawned at all (missing file, exec error) has a
    // null status, so it must fail loudly rather than slip through the !== 0 test.
    if (res.error || res.status !== 0) {
      const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
      fail(`multiplayer suite ${suite} exited ${res.status}${res.error ? ` (${res.error.message})` : ''}:\n${out}`);
      continue;
    }
    passed++;
    console.log(`  ${suite}: passed.`);
  }
  if (passed === suites.length) console.log(`  multiplayer: passed ${suites.length} suites.`);
}

function validateSyntax() {
  console.log('Validating JS syntax...');
  const scanDir = (dir) => {
    let results = [];
    const list = readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true });
    for (const file of list) {
      if (file.isDirectory()) {
        results = results.concat(scanDir(`${dir}/${file.name}`));
      } else if (file.name.endsWith('.js')) {
        results.push(fileURLToPath(new URL(`../${dir}/${file.name}`, import.meta.url)));
      }
    }
    return results;
  };
  const files = scanDir('js');
  let errCount = 0;
  for (const f of files) {
    const res = spawnSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    if (res.status !== 0) {
      fail(`Syntax error in ${f}:\n${res.stderr.toString().trim()}`);
      errCount++;
    }
  }
  if (errCount === 0) console.log(`  syntax: passed ${files.length} files.`);
}

// --- execution modes -----------------------------------------------------------

// ---------------------------------------------------------------------------
// Cloud progress sync (.wiki/plans/cloud-progress-sync.md, Phase A).
// ---------------------------------------------------------------------------

// Spawn a standalone async suite and fold its exit status into this process's
// failure count. The handler tests under tools/progress*.test.mjs are async
// (fake req/res driving real handlers) and section() calls fn() synchronously,
// so they run as their own process — the same shape validateMultiplayer uses.
function runSuite(rel) {
  const file = fileURLToPath(new URL(`../${rel}`, import.meta.url));
  const res = spawnSync(process.execPath, [file], { stdio: 'pipe' });
  if (res.error || res.status !== 0) {
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
    fail(`suite ${rel} exited ${res.status}${res.error ? ` (${res.error.message})` : ''}:\n${out}`);
    return false;
  }
  console.log(`  ${rel}: passed.`);
  return true;
}

// Task 1: the player_progress migration exists and has the shape 2.1 asks for.
// Read as text because there is no database here; the live read-back happens
// off the PostgREST OpenAPI doc when the file is applied.
function validateProgressSchema() {
  console.log('Validating player_progress migration...');
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /_player_progress\.sql$/.test(f));
  if (files.length !== 1) { fail(`expected exactly one supabase/migrations/*_player_progress.sql, found ${files.length}`); return; }
  const sql = readFileSync(new URL(files[0], dir), 'utf8');
  const stripSql = sql.replace(/--.*$/gm, '');
  const must = [
    [/create table (?:if not exists )?public\.player_progress/, 'create table public.player_progress'],
    [/player_id\s+uuid\s+primary key\s+references public\.players\(id\)\s+on delete cascade/, 'player_id references players(id) on delete cascade'],
    [/schema_version\s+integer\s+not null/, 'schema_version integer not null'],
    [/blob\s+jsonb\s+not null/, 'blob jsonb not null'],
    [/octet_length\(blob::text\)\s*<=\s*65536/, 'blob capped at 64 KB'],
    [/coins_verified\s+bigint\s+not null default 0/, 'coins_verified ledger column'],
    [/coins_ceiling\s+bigint\s+not null default 0/, 'coins_ceiling column'],
    [/revision\s+integer\s+not null default 1/, 'revision column'],
    [/alter table public\.player_progress enable row level security/, 'RLS enabled'],
    [/create policy "raw progress deny browser" on public\.player_progress\s+for all to anon, authenticated using \(false\) with check \(false\)/, 'deny-browser policy'],
    [/grant select, insert, update, delete on table public\.player_progress to service_role/, 'service_role grant (default privileges revoke everything, 20260812204210)'],
    [/submission_log_kind_check[\s\S]*'progress'/, "'progress' in the submission_log kind constraint"],
    [/create or replace function public\.fw_coins_verified\(p_player_id uuid\)/, 'fw_coins_verified RPC'],
    [/coins_collected/, 'fw_coins_verified sums stats->>coins_collected'],
    [/grant execute on function public\.fw_coins_verified\(uuid\)\s+to service_role/, 'fw_coins_verified executable by service_role'],
  ];
  for (const [re, what] of must) if (!re.test(stripSql)) fail(`${files[0]}: missing ${what}`);
  if (!/ROLLBACK/.test(sql)) fail(`${files[0]}: no rollback note`);
}

// Task 3: mergeBlobs is pure and DOM-free; its behaviour suite is standalone.
function validateProgressMerge() {
  console.log('Validating cloud merge (js/cloud/merge.js)...');
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  let src;
  try { src = stripComments(readFileSync(new URL('../js/cloud/merge.js', import.meta.url), 'utf8')); }
  catch { fail('js/cloud/merge.js does not exist'); return; }
  if (/\b(document|window|localStorage|navigator)\b/.test(src)) fail('js/cloud/merge.js touches the DOM — it must stay pure (invariant 9)');
  if (/from\s+['"]three['"]|three\.module/.test(src)) fail('js/cloud/merge.js imports three.js');
  if (/Math\.random/.test(src)) fail('js/cloud/merge.js uses Math.random (invariant 2)');
  runSuite('tools/progress-merge.test.mjs');
}

// Tasks 2, 4, 16: api/_progress.mjs and the two progress routes, driven with
// fake req/res and a stubbed database.
function validateProgressApi() {
  console.log('Validating progress API (api/_progress.mjs, api/progress/*)...');
  for (const rel of ['api/_progress.mjs', 'api/progress/pull.mjs', 'api/progress/push.mjs']) {
    try { readFileSync(new URL(`../${rel}`, import.meta.url)); }
    catch { fail(`${rel} does not exist`); }
  }
  runSuite('tools/progress-api.test.mjs');
}

// Task 7: js/cloud/blob.js is the boundary between what follows the player and
// what stays on the device. Pure, DOM-free; behaviour suite is standalone.
function validateProgressBlob() {
  console.log('Validating cloud blob boundary (js/cloud/blob.js)...');
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  let src;
  try { src = stripComments(readFileSync(new URL('../js/cloud/blob.js', import.meta.url), 'utf8')); }
  catch { fail('js/cloud/blob.js does not exist'); return; }
  if (/\b(document|window|localStorage|navigator|fetch)\b/.test(src)) fail('js/cloud/blob.js touches the DOM/network — it must stay pure');
  if (/from\s+['"]three['"]|three\.module/.test(src)) fail('js/cloud/blob.js imports three.js');
  runSuite('tools/progress-blob.test.mjs');
}

// Tasks 8-11: js/cloud/sync.js plus its triggers. Source guards here (the
// pure-sim modules must not import it, every write path must mark the save
// dirty, the menu-return / reconnect / identity seams must be wired), then the
// behaviour suite under a fake fetch and fake timers.
function validateProgressSync() {
  console.log('Validating cloud sync (js/cloud/sync.js) and its triggers...');
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  const read = (rel) => { try { return stripComments(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')); } catch { fail(`${rel} does not exist`); return ''; } };
  const sync = read('js/cloud/sync.js');
  if (/from\s+['"]three['"]|three\.module/.test(sync)) fail('js/cloud/sync.js imports three.js (invariant 9)');
  if (/\bMath\.random\b/.test(sync)) fail('js/cloud/sync.js uses Math.random (invariant 2)');
  for (const rel of ['js/rng.js', 'js/tiers.js', 'js/citygen.js', 'js/levels.js', 'js/sim.js', 'js/voxelsim.js']) {
    if (/from\s+['"][^'"]*\/cloud\//.test(read(rel))) fail(`${rel} imports js/cloud/** (invariant 3)`);
  }
  // Task 9: every write path marks the save dirty.
  const save = read('js/save.js');
  for (const fn of ['recordLevelResult', 'recordSandboxResult', 'recordChallengeResult', 'buyUpgrade']) {
    const at = save.indexOf(`export function ${fn}(`);
    // `\n}\n`, not `\n}`: two of these have a destructured parameter list that
    // closes with `}) {` on its own line.
    const body = at === -1 ? '' : save.slice(at, save.indexOf('\n}\n', at));
    if (!/\bmarkProgressDirty\s*\(\s*save\s*\)/.test(body)) fail(`js/save.js ${fn} does not call markProgressDirty(save)`);
  }
  const main = read('js/main.js');
  for (const fn of ['buy', 'equip', 'equipIndicator', 'toggleMute']) {
    const at = main.search(new RegExp(`^  ${fn}\\(`, 'm'));
    const body = at === -1 ? '' : main.slice(at, main.indexOf('\n  }', at));
    if (!/\bmarkProgressDirty\s*\(\s*save\s*\)/.test(body)) fail(`js/main.js ${fn} does not call markProgressDirty(save)`);
  }
  // The menu-return sites funnel through one backToTitle() that flushes; the
  // plan's five sites (and a few siblings) must all go through it, and the
  // visibilitychange->hidden branch flushes on its own.
  const backAt = main.indexOf('function backToTitle()');
  const backBody = backAt === -1 ? '' : main.slice(backAt, main.indexOf('\n}\n', backAt));
  if (!/\bflushSync\s*\(\s*save\s*\)/.test(backBody)) fail('js/main.js backToTitle() does not flushSync(save)');
  const backSites = (main.match(/\bbackToTitle\(\)/g) || []).length - 1;
  if (backSites < 5) fail(`js/main.js routes ${backSites} menu-return site(s) through backToTitle(); the plan names five`);
  if (/state = 'menu';\s*screens\.showTitle\(\)/.test(main)) fail("js/main.js still has a bare `state = 'menu'; screens.showTitle()` menu return that skips the flush");
  const visAt = main.indexOf("addEventListener('visibilitychange'");
  const visBody = visAt === -1 ? '' : main.slice(visAt, main.indexOf('\n});', visAt));
  if (!/\bflushSync\s*\(\s*save\s*\)/.test(visBody)) fail('js/main.js visibilitychange handler does not flushSync(save) when the tab hides');
  const drainAt = main.indexOf('function drainSavedBoardOutbox');
  const drainBody = drainAt === -1 ? '' : main.slice(drainAt, main.indexOf('\n}', drainAt));
  if (!/\bflushSync\s*\(/.test(drainBody)) fail('js/main.js drainSavedBoardOutbox does not piggyback flushSync (boot / online / 60 s tick)');
  if (!/\bconfigureSync\s*\(/.test(main)) fail('js/main.js does not hand configureSync the isPlaying gate (invariant 4: applyBlob deferred while playing)');
  const player = read('js/board/player.js');
  const applyAt = player.indexOf('function applyIdentity(');
  const applyBody = applyAt === -1 ? '' : player.slice(applyAt, player.indexOf('\n}', applyAt));
  if (!/\bonIdentityChanged\s*\(\s*save\s*\)/.test(applyBody)) fail('js/board/player.js applyIdentity does not call onIdentityChanged(save)');
  if (!/export async function signOutPlayer\(/.test(player)) fail('js/board/player.js has no signOutPlayer(save)');
  runSuite('tools/progress-sync.test.mjs');
}

// TWO modes, one command:
//
//   node tools/validate.mjs          ORCHESTRATOR. Each section group below runs
//                                    as its own child process with
//                                    FW_VALIDATE_SECTIONS=<group>, concurrently.
//                                    The scenes are CPU-bound single-threaded
//                                    sims, so a serial full pass priced in
//                                    wall-hours once debris churn went
//                                    superlinear (RCA-2026-08-11); parallel
//                                    children make the wall time the SLOWEST
//                                    group instead of the sum. Children are
//                                    processes, not threads, so each keeps this
//                                    file's module-level `failures`/exit
//                                    semantics untouched and no section can
//                                    share state with another.
//   FW_VALIDATE_SEQ=1 node ...       the pre-parallel behaviour: every section,
//                                    in file order, in this process. The debug
//                                    and timing-forensics mode.
//   FW_VALIDATE_SECTIONS=a,b ...     run only the named section(s), here. This
//                                    is how the orchestrator's children run, and
//                                    the way to exercise one guard against a
//                                    deliberately broken tree.
//   FW_VALIDATE_SOAK=1 node ...      opt back into the long deterministic
//                                    excursion(s) the default gate trims —
//                                    Cambridge's full 780 s route with its
//                                    SIZE >= 7 ladder floor (T-403; the gate
//                                    runs the opening 240 s, see
//                                    validateCambridge).
//
// Every mode prints ALL PASS only when nothing failed, and exits non-zero
// otherwise — the AGENTS.md gate is mode-independent.
const wanted = (process.env.FW_VALIDATE_SECTIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
const sectionTimes = [];
const section = (name, fn) => {
  if (!wanted.length || wanted.includes(name)) {
    const t0 = performance.now();
    fn();
    const secs = (performance.now() - t0) / 1000;
    sectionTimes.push([name, secs]);
    console.log(`  [${name}] ${secs.toFixed(1)}s`);
  }
};

if (!wanted.length && !process.env.FW_VALIDATE_SEQ) {
  // ORCHESTRATOR (see the modes comment above). Groups are the parallelism
  // unit: the cheap guards share one child because each is seconds at most and
  // a process per guard would be spawn overhead, not speed. Every heavy scene
  // gets its own child.
  const groups = [
    ['syntax', 'syntaxCheck'],
    // Every registered cheap section belongs here or the orchestrated full run
    // silently skips it: tutorialOnboarding, mobileCameraClarity,
    // mobileUiResponsive, deviceDetection and mobileZoomControls were
    // registered as sections but never added to this list (found 2026-08-19
    // while adding cameraSmoothing), so `node tools/validate.mjs` had not been
    // running them — only a by-name FW_VALIDATE_SECTIONS run did.
    ['core', 'offlineBoot,saveSchema,rewardLadders,shopAndUpgrades,helpAndWalkthrough,globalCampaign,campaignUi,tutorialOnboarding,mobileCameraClarity,mobileUiResponsive,deviceDetection,mobileZoomControls,cameraSmoothing,fwMath,runBoard,progressSchema,progressMerge,progressApi,progressBlob,progressSync,progressUi,voxelSandbox,voxelCollisions,levelClock,gameplayEnhancements,cityChallenges'],
    // Its own child rather than folded into `core`: every suite in it is itself
    // a spawned process, so it is the one group whose cost is process startup
    // instead of CPU, and it finishes long before the scenes either way.
    ['multiplayer', 'multiplayer'],
    ['sydney', 'sydney'],
    ['scenesWinnable', 'scenesWinnable'],
    ['manhattan', 'manhattan'],
    ['upperManhattan', 'upperManhattan'],
    ['brooklyn', 'brooklyn'],
    ['boston', 'boston'],
    ['cambridge', 'cambridge'],
    ['chicago', 'chicago'],
    // Its own child rather than folded into `chicago`: it is two more full
    // chicago excursions, so sharing that child would serialise ~3x the work
    // into the group that is already the wall-clock long pole.
    ['speedInvariance', 'speedInvariance'],
  ];
  const self = fileURLToPath(import.meta.url);
  const t0 = performance.now();
  const jobs = groups.map(([label, sections]) => new Promise((resolve) => {
    const start = performance.now();
    const args = [...process.execArgv, self];
    const child = spawn(process.execPath, args, {
      env: { ...process.env, FW_VALIDATE_SECTIONS: sections },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ label, code: 1, out: `${out}\nspawn failed: ${e.message}\n`, secs: (performance.now() - start) / 1000 }));
    child.on('close', (code) => resolve({ label, code, out, secs: (performance.now() - start) / 1000 }));
  }));
  const results = await Promise.all(jobs);
  for (const r of results) {
    process.stdout.write(`\n--- ${r.label} (${r.secs.toFixed(1)}s) ---\n${r.out.trimEnd()}\n`);
  }
  const failed = results.filter((r) => r.code !== 0);
  const wall = (performance.now() - t0) / 1000;
  console.log('---');
  if (failed.length === 0) {
    console.log(`ALL PASS. ${groups.length} section group(s) in parallel, ${wall.toFixed(1)}s wall.`);
  } else {
    console.error(`${failed.length} section group(s) FAILED: ${failed.map((r) => r.label).join(', ')} (${wall.toFixed(1)}s wall).`);
    process.exit(1);
  }
} else {

let minMargin = Infinity, minMarginLevel = 0;
let maxTimeToFirstEat = 0;

function validateSydney() {
  console.log('Validating sydney sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'sydney' });
  const tops = footprintTops(sim);
  probeCellOwnership(sim, 'sydney');
  probeCameraBlockers(sim, 'sydney', tops);
  probePlacementStep(sim, 'sydney');
  probeIdleStability(sim, 'sydney');
  console.log(`  sydney sandbox: blocks=${sim.blocks.length} mass=${sim.totalMass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
}

// Phase C (cloud progress sync, tasks 12-14): the player-facing surface of the
// sync — indicator states, first-time note, trimmed notice, sign-out. The body
// lives in tools/progress-ui.test.mjs because it has to import the copy module
// (async ESM) and this runner is synchronous; see that file for what it guards.
function validateProgressUi() {
  console.log('Validating cloud progress UI (indicator, notes, sign-out)...');
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./progress-ui.test.mjs', import.meta.url))], { encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) fail(`tools/progress-ui.test.mjs failed:\n${r.stderr || ''}`);
}
section('syntaxCheck', validateSyntax);
section('offlineBoot', validateOfflineBoot);
section('saveSchema', validateSaveSchema);
section('rewardLadders', validateRewardLadders);
section('shopAndUpgrades', validateShopAndUpgrades);
section('helpAndWalkthrough', () => console.log(`Validating Help, Walkthrough & FAQ (${runHelpSelftest()} assertions)...`));
section('globalCampaign', () => console.log(`Validating Global Campaign (${runCampaignSelftest()} assertions)...`));
section('campaignUi', () => console.log(`Validating Campaign UI, Mission Dossiers & Narrative Gates (${runCampaignUiSelftest()} assertions)...`));
section('tutorialOnboarding', () => console.log(`Validating Interactive Onboarding & Tutorial (${runTutorialSelftest()} assertions)...`));
section('mobileCameraClarity', () => console.log(`Validating Adaptive Mobile Camera & Clarity (${runMobileCameraSelftest()} assertions)...`));
section('mobileUiResponsive', () => console.log(`Validating Mobile-First UI & Navigation (${runMobileUiSelftest()} assertions)...`));
section('deviceDetection', () => console.log(`Validating Device Detection & Relative Controls (${runDeviceDetectionSelftest()} assertions)...`));
section('mobileZoomControls', () => console.log(`Validating Mobile Pinch/Expand Zoom & Gestures (${runMobileZoomControlsSelftest()} assertions)...`));
section('cameraSmoothing', () => console.log(`Validating ADR-0022 Camera Bezier Occlusion Smoothing, Lab-scoped (${runCameraSmoothingSelftest()} assertions)...`));
section('fwMath', validateFwMath);




section('runBoard', () => {
  console.log(`Validating THE RUN trace/replay (${runBoardSelftest()} assertions)...`);
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  const verifySrc = stripComments(readFileSync(new URL('../api/_verify.mjs', import.meta.url), 'utf8'));
  if (!/\bcoins_collected:\s*sim\.hole\.coinsCollected\b/.test(verifySrc)) {
    fail('api/_verify.mjs does not write stats.coins_collected from sim.hole.coinsCollected — the verified-coin ledger has nothing to sum');
  }
});
section('progressSchema', validateProgressSchema);
section('progressMerge', validateProgressMerge);
section('progressApi', validateProgressApi);
section('progressBlob', validateProgressBlob);
section('progressSync', validateProgressSync);
section('progressUi', validateProgressUi);
section('levelClock', validateLevelClock);
section('scenesWinnable', validateScenesWinnable);
section('voxelSandbox', validateVoxelSandbox);
section('voxelCollisions', validateVoxelCollisions);
section('gameplayEnhancements', validateGameplayEnhancements);
section('cityChallenges', validateCityChallenges);
section('multiplayer', validateMultiplayer);
section('sydney', validateSydney);
section('manhattan', validateManhattan);
section('upperManhattan', validateUpperManhattan);
section('brooklyn', validateBrooklyn);
section('boston', validateBoston);
section('cambridge', validateCambridge);
section('chicago', validateChicago);
section('speedInvariance', validateSpeedInvariance);

console.log('---');
// The margin summary is only meaningful when the campaign section actually ran.
// Printing "worst margin Infinity% (L0)" after a single-section run would read
// as a result rather than as an absence of one.
const marginNote = Number.isFinite(minMargin)
  ? `Worst time margin: ${(minMargin * 100).toFixed(1)}% (L${minMarginLevel}). Slowest first eat: ${maxTimeToFirstEat.toFixed(2)}s.`
  : `Campaign levels not run (FW_VALIDATE_SECTIONS=${process.env.FW_VALIDATE_SECTIONS}).`;
const totalSecs = sectionTimes.reduce((s, [, t]) => s + t, 0);
if (failures === 0) {
  console.log(`ALL PASS. ${marginNote} Sections: ${totalSecs.toFixed(1)}s.`);
} else {
  console.error(`${failures} failure(s). ${marginNote}`);
  process.exit(1);
}

}
