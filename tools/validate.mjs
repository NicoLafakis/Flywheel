// Headless proof that every level is beatable, overlap-free, and snack-ringed.
// Run: node tools/validate.mjs [levelIndex]
// Uses the exact same citygen + sim code as the game.

import { LEVELS } from '../js/levels.js';
import { generateCity } from '../js/citygen.js';
import { Sim } from '../js/sim.js';
import { isEdible } from '../js/tiers.js';
import {
  VoxelSandboxSim, COMBO_THRESHOLDS, COMBO_STEP, COMBO_MAX_LEVEL, COMBO_LEVEL_NAMES,
  MILESTONES, MILESTONE_TIERS, comboLevel, comboMult,
} from '../js/voxelsim.js';
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
import { CURRENT_VERSION, __freshSave, __MIGRATIONS } from '../js/save.js';
import { readdirSync, readFileSync } from 'node:fs';

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
  { until: 3, x: 0, z: 16 },      // hold (stability probe)
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
function voxelMoveAt(t, h) {
  let wp = VOXEL_PATH[VOXEL_PATH.length - 1];
  for (const w of VOXEL_PATH) if (t < w.until) { wp = w; break; }
  const dx = wp.x - h.x, dz = wp.z - h.z;
  const d = Math.hypot(dx, dz);
  return d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
}

function runVoxelSandbox() {
  const sim = new VoxelSandboxSim({ seed: 'validator' });
  const snap = {};
  let maxUnstable = 0;
  const steps = 56 * 60;
  for (let i = 0; i < steps; i++) {
    sim.step(DT, voxelMoveAt(i * DT, sim.hole));
    maxUnstable = Math.max(maxUnstable, sim.blocks.filter((b) => b.state === 'unstable').length);
    if (i === 2.5 * 60) { // sample while the hole is definitely still idling (path moves at t=3)
      snap.eaten3 = sim.hole.eatenCount;
      snap.nonStatic3 = sim.blocks.filter((b) => b.state !== 'static').length;
    }
    if (i === 10 * 60) snap.eaten10 = sim.hole.eatenCount;
    if (i === 20 * 60) snap.eaten20 = sim.hole.eatenCount;
  }
  return { sim, snap, maxUnstable };
}

function validateVoxelSandbox() {
  console.log('Validating voxel sandbox...');

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
  const SIM_PURE_NAMED = ['rng', 'tiers', 'citygen', 'levels', 'sim', 'voxelsim', 'voxelkit', 'voxelforms'];
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

  console.log(`  voxel sandbox: eaten=${a.sim.hole.eatenCount}/${a.sim.totalBlocks} raw=${a.sim.hole.rawMass.toFixed(1)} score=${a.sim.hole.mass.toFixed(0)} peakChain=${a.sim.hole.bestCombo} radius=${a.sim.hole.radius.toFixed(2)} (t=10s: ${a.snap.eaten10}, t=20s: ${a.snap.eaten20})`);
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
//      combo window is 1.5 s and SIZE 1 speed is 9.96 m/s, so 14.9 m of travel
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

  for (let i = 0; i < 39 * 60; i++) {
    const t = i * DT, h = sim.hole;
    const wp = t < WP[0].until ? WP[0] : WP[1];
    const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
    sim.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
  }
  if (sim.hole.eatenCount < 100) fail(`manhattan: only ${sim.hole.eatenCount} blocks eaten on the WTC excursion (expected >=100)`);
  // progression floor: the SIZE ladder is scaled by round(totalMass / 4200) —
  // ×10 for this scene's ~43.5k mass — so ANY content change silently re-paces
  // every level, and nothing else here asserts pacing. The floor is the SIZE
  // this excursion reached under the OLD combo-mass ladder, measured against
  // the HEAD tree before the points-only rebase (ADR-0015): moving the ladder
  // onto rawMass must not cost any scene a level.
  if (sim.hole.size < 8) fail(`manhattan: WTC excursion reached only SIZE ${sim.hole.size} (expected >=8 — SIZE ladder too steep for this scene?)`);
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
  for (let i = 0; i < 44 * 60; i++) {
    const t = i * DT, h = sim2.hole;
    let wp = WP2[WP2.length - 1];
    for (const w of WP2) if (t < w.until) { wp = w; break; }
    const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
    sim2.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
  }
  if (sim2.hole.eatenCount < 100) fail(`manhattan: only ${sim2.hole.eatenCount} blocks eaten on the expansion-district excursion (expected >=100)`);
  // Same rebase floor as the WTC excursion above, measured on HEAD.
  if (sim2.hole.size < 5) fail(`manhattan: expansion-district excursion reached only SIZE ${sim2.hole.size} (expected >=5)`);
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
  const runExcursion = () => {
    const run = new VoxelSandboxSim({ seed: 'validator', scene: 'upper-manhattan' });
    for (let i = 0; i < 62 * 60; i++) {
      const t = i * DT, h = run.hole;
      let wp = WP[WP.length - 1];
      for (const w of WP) if (t < w.until) { wp = w; break; }
      const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
      run.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
    }
    return run;
  };
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`upper manhattan: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
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
  const runExcursion = () => {
    const run = new VoxelSandboxSim({ seed: 'validator', scene: 'brooklyn' });
    for (let i = 0; i < 62 * 60; i++) {
      const t = i * DT, h = run.hole;
      let wp = WP[WP.length - 1];
      for (const w of WP) if (t < w.until) { wp = w; break; }
      const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
      run.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
    }
    return run;
  };
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`brooklyn: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  if (a.hole.eatenCount < 300) fail(`brooklyn: only ${a.hole.eatenCount} blocks eaten on the museum excursion (expected >=300)`);
  // Progression floor, held to the SAME >=4 as manhattan and upper manhattan.
  // The ladder is capped at ×10 in voxelsim.js precisely so the largest scenes
  // are not held to a lower standard than the ones they were built to surpass.
  // Floor = the SIZE reached on HEAD's combo-mass ladder (see ADR-0015).
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
  const runExcursion = () => {
    const run = new VoxelSandboxSim({ seed: 'validator', scene: 'boston' });
    for (let i = 0; i < 62 * 60; i++) {
      const t = i * DT, h = run.hole;
      let wp = WP[WP.length - 1];
      for (const w of WP) if (t < w.until) { wp = w; break; }
      const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
      run.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
    }
    return run;
  };
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`boston: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  if (a.hole.eatenCount < 300) fail(`boston: only ${a.hole.eatenCount} blocks eaten on the BCEC excursion (expected >=300)`);
  // Progression floor, held to the same >=5 as every other big sandbox. Boston
  // is the heaviest map on the ladder (141k mass puts the multiplier at its ×10
  // cap, so the SIZE 4 gate is 414 raw mass), which is exactly why it is not
  // granted a lower bar than the scenes it was built to surpass.
  // Floor = the SIZE reached on HEAD's combo-mass ladder (see ADR-0015).
  if (a.hole.size < 5) fail(`boston: excursion reached only SIZE ${a.hole.size} (expected >=5 — SIZE ladder too steep?)`);

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
  const DURATION = WP[WP.length - 1].until;

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
  const runExcursion = () => {
    const run = new VoxelSandboxSim({ seed: 'validator', scene: 'cambridge' });
    for (let i = 0; i < DURATION * 60; i++) {
      const t = i * DT, h = run.hole;
      let wp = WP[WP.length - 1];
      for (const w of WP) if (t < w.until) { wp = w; break; }
      const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
      run.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
    }
    return run;
  };
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`cambridge: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  if (a.hole.eatenCount < 300) fail(`cambridge: only ${a.hole.eatenCount} blocks eaten on the scripted excursion (expected >=300)`);
  // Floor = the SIZE this excursion reached on HEAD's combo-mass ladder, which
  // is 7 — the longest route in the game, so it earns the highest floor of any
  // scene. Cambridge is not granted a lower bar for being newer (ADR-0015).
  if (a.hole.size < 7) fail(`cambridge: excursion reached only SIZE ${a.hole.size} (expected >=7 — SIZE ladder too steep?)`);

  probeFinitePositions(a.blocks, 'cambridge', 'after excursion');
  console.log(`  cambridge sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
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

  const runExcursion = () => {
    const run = new VoxelSandboxSim({ seed: 'validator', scene: 'chicago' });
    for (let i = 0; i < DURATION * 60; i++) {
      const t = i * DT, h = run.hole;
      let wp = WP[WP.length - 1];
      for (const w of WP) if (t < w.until) { wp = w; break; }
      const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
      run.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
    }
    return run;
  };
  const a = runExcursion();
  const b = runExcursion();
  if (a.hole.eatenCount !== b.hole.eatenCount || a.hole.mass.toFixed(6) !== b.hole.mass.toFixed(6)) {
    fail(`chicago: non-deterministic excursion (eaten ${a.hole.eatenCount} vs ${b.hole.eatenCount}, mass ${a.hole.mass.toFixed(3)} vs ${b.hole.mass.toFixed(3)})`);
  }
  if (a.hole.eatenCount < 300) fail(`chicago: only ${a.hole.eatenCount} blocks eaten on the scripted excursion (expected >=300)`);
  if (a.hole.size < 7) fail(`chicago: excursion reached only SIZE ${a.hole.size} (expected >=7)`);

  probeFinitePositions(a.blocks, 'chicago', 'after excursion');
  console.log(`  chicago sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} peakChain=${a.hole.bestCombo} score=${a.hole.mass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);
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
  }
  if (s.version !== CURRENT_VERSION) fail(`save schema: chain ended at v${s.version}, expected v${CURRENT_VERSION}`);

  const missing = [...freshKeys].filter((k) => !(k in s));
  if (missing.length) fail(`save schema: migrated save is missing top-level key(s) [${missing.join(', ')}] that freshSave() creates — an upgrading player never gets them`);
  const missingSet = [...freshSettingKeys].filter((k) => !(k in (s.settings || {})));
  if (missingSet.length) fail(`save schema: migrated save.settings is missing key(s) [${missingSet.join(', ')}] that defaultSettings() creates`);

  console.log(`  save schema: v1->v${CURRENT_VERSION} chain and freshSave() agree on ${freshKeys.size} top-level key(s) and ${freshSettingKeys.size} setting(s)`);
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
  if (COMBO_MAX_LEVEL !== COMBO_THRESHOLDS.length) {
    fail(`combo ladder: COMBO_MAX_LEVEL ${COMBO_MAX_LEVEL} does not match the ${COMBO_THRESHOLDS.length} thresholds — the tail rule and the table disagree`);
  }
  if (COMBO_LEVEL_NAMES.length !== COMBO_MAX_LEVEL + 1) {
    fail(`combo ladder: ${COMBO_LEVEL_NAMES.length - 1} level name(s) for ${COMBO_MAX_LEVEL} level(s)`);
  }
  for (let i = 1; i < COMBO_THRESHOLDS.length; i++) {
    if (!(COMBO_THRESHOLDS[i] > COMBO_THRESHOLDS[i - 1])) {
      fail(`combo ladder: thresholds not strictly increasing at index ${i} (${COMBO_THRESHOLDS[i - 1]} -> ${COMBO_THRESHOLDS[i]})`);
    }
  }
  // The owner's curve (GWT-301): 2, 10, 15, 25, 50, 100, then the rare tail.
  const WANT_HEAD = [2, 10, 15, 25, 50, 100];
  for (let i = 0; i < WANT_HEAD.length; i++) {
    if (COMBO_THRESHOLDS[i] !== WANT_HEAD[i]) {
      fail(`combo ladder: front-loaded head should be ${WANT_HEAD.join(', ')} — got ${COMBO_THRESHOLDS.slice(0, WANT_HEAD.length).join(', ')}`);
      break;
    }
  }

  // Monotonic, starts at x1, and — the load-bearing line — the multiplier a HUD
  // reading this ladder would display equals the multiplier the sim scores
  // with, for every chain the game can reach. The HUD's value is recomputed
  // here from `comboLevel` + the named constants, which is exactly the path
  // js/ui/hud.js takes; if anyone reintroduces a second expression there, the
  // source guard below catches it and this one catches the arithmetic.
  if (comboMult(1) !== 1) fail(`combo ladder: multiplier at chain 1 is ${comboMult(1)}, must be x1`);
  if (comboMult(0) !== 1) fail(`combo ladder: multiplier with no chain is ${comboMult(0)}, must be x1`);
  let prevMult = comboMult(0), topAt = null;
  for (let c = 1; c <= 1000; c++) {
    const m = comboMult(c);
    const hudWouldShow = 1 + (comboLevel(c) - 1) * COMBO_STEP;
    if (m !== hudWouldShow) {
      fail(`combo ladder: at chain ${c} the sim awards x${m} and the HUD would show x${hudWouldShow}`);
      break;
    }
    if (m < prevMult) { fail(`combo ladder: multiplier decreased at chain ${c} (x${prevMult} -> x${m})`); break; }
    if (comboLevel(c) > COMBO_MAX_LEVEL) { fail(`combo ladder: chain ${c} resolved to level ${comboLevel(c)}, past the named top level ${COMBO_MAX_LEVEL}`); break; }
    if (topAt === null && comboLevel(c) === COMBO_MAX_LEVEL) topAt = c;
    prevMult = m;
  }
  if (comboMult(1e6) !== 1 + (COMBO_MAX_LEVEL - 1) * COMBO_STEP) {
    fail('combo ladder: an absurd chain exceeds the capped top multiplier — the tail rule is not holding');
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

  // Source guards. The ladder must exist ONCE, in the sim, exported — and the
  // HUD must read it rather than mirror it (GWT-202, SYS-209).
  const hudSrc = readFileSync(new URL('../js/ui/hud.js', import.meta.url), 'utf8');
  if (!/import\s*\{[^}]*comboMult[^}]*\}\s*from\s*'\.\.\/voxelsim\.js'/.test(hudSrc)) {
    fail("js/ui/hud.js does not import comboMult from ../voxelsim.js — a HUD that re-derives the multiplier is the defect this package closed");
  }
  // Comments are stripped first: hud.js deliberately QUOTES the old expression
  // where it explains why the pill was removed, and a guard that cannot tell a
  // warning label from live code fails on the documentation of its own bug.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  if (/chain\s*-\s*1\s*\)\s*\/\s*25/.test(stripComments(hudSrc))) {
    fail('js/ui/hud.js still contains the old (chain - 1) / 25 level expression');
  }
  const simSrc = readFileSync(new URL('../js/voxelsim.js', import.meta.url), 'utf8');
  if (!/export function comboMult/.test(simSrc)) fail('js/voxelsim.js does not export comboMult');

  // Every gameplay announcement goes through the queue (GWT-604): the sandbox
  // event dressing must not reach for the presentation backends directly.
  const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const sandboxBlock = mainSrc.slice(mainSrc.indexOf('if (isVoxelSandbox) {'), mainSrc.indexOf('} else {', mainSrc.indexOf('if (isVoxelSandbox) {')));
  for (const m of ['hud.showToast', 'hud.showBigPop', 'hud.showBand']) {
    if (sandboxBlock.includes(m)) fail(`js/main.js sandbox dressing calls ${m}() directly — every announcement must go through hud.announce()`);
  }

  console.log(`  combo ladder: ${COMBO_THRESHOLDS.length} levels (${COMBO_THRESHOLDS.join(', ')}), x1..x${comboMult(1e6)}, "${COMBO_LEVEL_NAMES[COMBO_MAX_LEVEL]}" from chain ${topAt}`);
  console.log(`  milestone ladder: ${MILESTONES.length} rows, ${(MILESTONES[0].at * 100).toFixed(0)}% -> ${(MILESTONES[MILESTONES.length - 1].at * 100).toFixed(0)}% of the scene goal`);
}

// --- the gallery must be winnable ---------------------------------------------
// A full clear of a targetFraction-1.0 scene must set `won`. This is not a
// theoretical guard: `hole.rawMass` is accumulated one add per block as the city
// is eaten, while `totalMass` is a reduce() over the same blocks in ARRAY order.
// Identical summands, different order, so float rounding leaves rawMass a few
// parts in 1e12 short — and the gallery, the only scene that must eat 100% of
// the city, could consume all 3798 blocks and never win. The HUD floors the
// percentage, so it read 99% forever. Found in live play, fixed with a relative
// epsilon in js/voxelsim.js.
//
// The order matters and is the whole reason this check is written the way it is:
// eating in ARRAY order reproduces totalMass bit-for-bit and passes even on the
// broken code. Radial order — nearest first, which is roughly how a real hole
// eats — is one of the orders that actually loses, so that is what runs here.
function validateGalleryWinnable() {
  console.log('Validating the gallery is winnable (float-order guard on the win check)...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'gallery' });
  if (sim.goal.targetFraction !== 1) {
    fail(`gallery win guard: expected targetFraction 1, got ${sim.goal.targetFraction} — this guard only means anything at 100%`);
    return;
  }
  const radial = sim.blocks.slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  for (const b of radial) if (b.state !== 'consumed') sim._consume(b);
  sim.step(1 / 60, { x: 0, z: 0 });
  const left = sim.blocks.filter((b) => b.state !== 'consumed').length;
  if (left > 0) fail(`gallery win guard: ${left} block(s) survived a full clear — the harness is not clearing the city`);
  if (!sim.won) {
    fail(`gallery win guard: consumed all ${sim.totalBlocks} blocks and won is still false (shortfall ${(sim.totalMass - sim.hole.rawMass).toExponential(3)}) — the win check needs its epsilon`);
  }
  console.log(`  gallery winnable: ${sim.totalBlocks} blocks consumed, survivors=${left}, shortfall=${(sim.totalMass - sim.hole.rawMass).toExponential(3)}, won=${sim.won}`);
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
function validateOfflineBoot() {
  console.log('Validating offline boot (index.html has no off-origin dependencies)...');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  let refs = 0, offsite = 0;

  const map = /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!map) {
    fail('offline boot: index.html has no importmap — js/*.js import "three" as a bare specifier and nothing resolves it');
  } else {
    let imports;
    try {
      imports = JSON.parse(map[1]).imports || {};
    } catch (e) {
      fail(`offline boot: the importmap in index.html is not valid JSON (${e.message}) — the browser drops the whole map and every bare import fails`);
      imports = {};
    }
    for (const [spec, target] of Object.entries(imports)) {
      refs++;
      if (OFFSITE_RE.test(target)) {
        offsite++;
        fail(`offline boot: importmap resolves "${spec}" to ${target} — the game cannot boot without that host, so a flaky connection (venue wifi, a CDN blip) leaves the player stuck on the LOADING splash forever. Vendor it under js/vendor/ and point the map at the local path.`);
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
        fail(`offline boot: index.html loads a ${what} from ${m[1]} — an off-origin fetch the page cannot boot (or cannot render) without. Vendor it into the repo and reference it by relative path.`);
      }
    }
  }

  console.log(`  offline boot: ${refs} index.html reference(s), ${offsite === 0 ? 'all same-origin' : `${offsite} OFF-ORIGIN`}`);
}

console.log(`Validating ${levelsToCheck.length} level(s)...`);
let minMargin = Infinity, minMarginLevel = 0;
let maxTimeToFirstEat = 0;

for (const level of levelsToCheck) {
  const city = generateCity(level);
  checkOverlap(city, level.index);
  checkSnackRing(city, level.index);

  const { sim, firstEatTime } = runBot(level);
  const margin = sim.timeLeft / level.clock;
  if (margin < minMargin) { minMargin = margin; minMarginLevel = level.index; }
  if (firstEatTime !== null) maxTimeToFirstEat = Math.max(maxTimeToFirstEat, firstEatTime);

  if (!sim.won) {
    fail(`L${level.index}: greedy bot LOST (mass ${Math.floor(sim.player.mass)}/${level.target})`);
  } else if (margin < 0.15) {
    fail(`L${level.index}: bot won with only ${(margin * 100).toFixed(1)}% time left (need >=15%)`);
  }
  if (firstEatTime === null || firstEatTime >= 1.0) {
    fail(`L${level.index}: first eat at ${firstEatTime === null ? 'never' : firstEatTime.toFixed(2) + 's'} (need <1.0s)`);
  }
  if (level.index % 10 === 0 || level.index === 1) {
    console.log(`  L${level.index}: mass=${Math.floor(sim.player.mass)}/${level.target} timeLeft=${sim.timeLeft.toFixed(1)}s (${(margin * 100).toFixed(0)}%) firstEat=${firstEatTime?.toFixed(2)}s`);
  }
}

validateOfflineBoot();
validateSaveSchema();
validateRewardLadders();
validateGalleryWinnable();
validateVoxelSandbox();
validateVoxelCollisions();
validateManhattan();
validateUpperManhattan();
validateBrooklyn();
validateBoston();
validateCambridge();
validateChicago();

console.log('---');
if (failures === 0) {
  console.log(`ALL PASS. Worst time margin: ${(minMargin * 100).toFixed(1)}% (L${minMarginLevel}). Slowest first eat: ${maxTimeToFirstEat.toFixed(2)}s.`);
} else {
  console.error(`${failures} failure(s). Worst margin ${(minMargin * 100).toFixed(1)}% at L${minMarginLevel}.`);
  process.exit(1);
}
