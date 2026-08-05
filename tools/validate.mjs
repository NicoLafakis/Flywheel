// Headless proof that every level is beatable, overlap-free, and snack-ringed.
// Run: node tools/validate.mjs [levelIndex]
// Uses the exact same citygen + sim code as the game.

import { LEVELS } from '../js/levels.js';
import { generateCity } from '../js/citygen.js';
import { Sim } from '../js/sim.js';
import { isEdible } from '../js/tiers.js';
import { VoxelSandboxSim } from '../js/voxelsim.js';
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
  const SIM_PURE_NAMED = ['rng', 'tiers', 'citygen', 'levels', 'sim', 'voxelsim', 'voxelkit'];
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

  console.log(`  voxel sandbox: eaten=${a.sim.hole.eatenCount}/${a.sim.totalBlocks} mass=${a.sim.hole.mass.toFixed(1)} radius=${a.sim.hole.radius.toFixed(2)} (t=10s: ${a.snap.eaten10}, t=20s: ${a.snap.eaten20})`);
}

function overlaps(a, b) {
  return Math.abs(a.x - b.x) < (a.s + b.s) / 2 &&
    Math.abs(a.y - b.y) < (a.s + b.s) / 2 &&
    Math.abs(a.z - b.z) < (a.s + b.s) / 2;
}

function collisionBody(id, x, y, z, s = 1) {
  return {
    id, state: 'falling', parentChunk: null, asleep: false, x, y, z, s,
    vx: 0, vy: 0, vz: 0, vRotX: 0, vRotZ: 0, _inContact: false,
  };
}

function validateVoxelCollisions() {
  console.log('Validating voxel collision separation...');
  const sim = new VoxelSandboxSim({ seed: 'collision-validator' });
  const solid = sim.blocks.find((b) => b.state === 'static' && b.s === 1);
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
const blockRect = (bl) => ({ x: bl.x - bl.s / 2, z: bl.z - bl.s / 2, w: bl.s, d: bl.s });

// Highest block top (m) per 1 m footprint cell. The camera-blocker probe and the
// bare-ground probe both key off it, so it is derived once per scene.
function footprintTops(sim) {
  const tops = new Map();
  for (const b of sim.blocks) {
    const top = (b.gy + b.fs) * 0.25;
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fs) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fs) * 0.25); cz++) {
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
    for (let ix = 0; ix < b.fs; ix++) {
      for (let iy = 0; iy < b.fs; iy++) {
        for (let iz = 0; iz < b.fs; iz++) {
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
    minX = Math.min(minX, b.x - b.s / 2); maxX = Math.max(maxX, b.x + b.s / 2);
    minZ = Math.min(minZ, b.z - b.s / 2); maxZ = Math.max(maxZ, b.z + b.s / 2);
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
      r.x >= s.minX && r.x + r.w <= s.maxX && r.z >= s.minZ && r.z + r.d <= s.maxZ && bl.y - bl.s / 2 >= s.minY);
    if (inSpan) continue;
    roadConflicts++;
    if (!roadWorst) roadWorst = `${bl.matType}/${bl.s}m at (${r.x},${bl.y},${r.z})`;
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
    if (b.y - b.s / 2 > 0.01) continue;
    for (let cx = Math.floor(b.x - b.s / 2); cx < Math.ceil(b.x + b.s / 2); cx++) {
      for (let cz = Math.floor(b.z - b.s / 2); cz < Math.ceil(b.z + b.s / 2); cz++) groundCells.add(`${cx},${cz}`);
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
        openWorst = `"${s.why}" holds ${occupied.length} block(s), first ${b0.matType}/${b0.s}m at (${b0.x},${b0.z})`;
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
  probeCellOwnership(sim, 'manhattan');
  probeCameraBlockers(sim, 'manhattan', footprintTops(sim));
  probeParkUnderWater(sim, 'manhattan');
  probeIdleStability(sim, 'manhattan');

  // scripted excursion: cross town to the WTC base, then excavate for 30 s
  const WP = [{ until: 9, x: -24, z: -20 }, { until: 39, x: -24, z: -26 }];
  for (let i = 0; i < 39 * 60; i++) {
    const t = i * DT, h = sim.hole;
    const wp = t < WP[0].until ? WP[0] : WP[1];
    const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
    sim.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
  }
  if (sim.hole.eatenCount < 100) fail(`manhattan: only ${sim.hole.eatenCount} blocks eaten on the WTC excursion (expected >=100)`);
  // progression floor: the SIZE ladder is scaled by round(totalMass / 4200) —
  // ×10 for this scene's ~43.5k mass — so ANY content change silently re-paces
  // every level, and nothing else here asserts pacing. The excursion reaches
  // SIZE 5 today; a drop below 4 means the ladder outran the scene.
  if (sim.hole.size < 4) fail(`manhattan: WTC excursion reached only SIZE ${sim.hole.size} (expected >=4 — mass-scaled SIZE ladder too steep?)`);
  probeFinitePositions(sim.blocks, 'manhattan', 'after excursion');
  console.log(`  manhattan sandbox: blocks=${sim.totalBlocks} mass=${sim.totalMass.toFixed(0)} eaten=${sim.hole.eatenCount} size=${sim.hole.size}`);

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
  console.log(`  manhattan district excursion: eaten=${sim2.hole.eatenCount} size=${sim2.hole.size}`);
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
  probeIdleStability(sim, 'upper manhattan');

  // A twelve-metre approach and then a slow perimeter orbit INSIDE the
  // Metropolitan Museum. Three things drive the shape, and all three are
  // measured rather than assumed.
  //
  // First, the SIZE ladder scales every growth threshold by
  // `round(totalMass / 4200)`, clamped at ×10. Pass 3's perimeter took this
  // scene to 86k mass, so the multiplier is pinned at the ceiling and the
  // SIZE 4 gate is 1,800 combo-mass — five times what it was in Pass 2. The
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
  // from spawn. Result: 721 eaten, combo 3,680, SIZE 4 at 37.8 s of 62 —
  // 24 seconds of margin at 2.04x the gate.
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
  if (a.hole.size < 4) fail(`upper manhattan: excursion reached only SIZE ${a.hole.size} (expected >=4)`);

  probeFinitePositions(a.blocks, 'upper manhattan', 'after excursion');
  // blockers= is in the line for the same reason Brooklyn's is: this scene's
  // camera blockers are GENERATED from the finished geometry, so the count is a
  // running read on how much of the skyline exists, not a hand-kept number.
  console.log(`  upper manhattan sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} blockers=${sim.cameraBlockers.length}`);
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
  probeIdleStability(sim, 'brooklyn');                                                  // 11

  // 12. deterministic excursion, run twice. The route is a slow orbit inside
  // the Brooklyn Museum rather than a tour of the boroughs: a straight sweep
  // spends most of its time crossing open plaza with nothing overhead, and a
  // moving path through dense structure is what keeps fresh mass falling in.
  const WP = [
    { until: 12, x: 34, z: 18 },    // approach across the museum apron
    { until: 26, x: 37, z: 15 },    // south-east quarter
    { until: 38, x: 32, z: 20 },    // north-west quarter
    { until: 50, x: 39, z: 19 },    // north-east quarter
    { until: 62, x: 33, z: 15 },    // south-west quarter
  ];
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
  if (a.hole.size < 4) fail(`brooklyn: excursion reached only SIZE ${a.hole.size} (expected >=4 — mass-scaled SIZE ladder too steep?)`);

  probeFinitePositions(a.blocks, 'brooklyn', 'after excursion');
  console.log(`  brooklyn sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} blockers=${sim.cameraBlockers.length}`);
}

function validateBoston() {
  console.log('Validating boston sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'boston' });

  // Same contract set as Brooklyn and Upper Manhattan, same probe bodies, signed
  // with Boston's own tables. Nothing scene-specific is re-implemented here on
  // purpose: a probe that drifts per scene stops being a contract.
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
  probeIdleStability(sim, 'boston');                                                  // 11

  // 12. deterministic excursion, run twice. The route walks the BCEC podium end
  // to end and then east through the south podium's shed. Two things about it
  // are load-bearing and were both measured rather than guessed. It never PARKS:
  // every stalled waypoint in the earlier drafts banked one to three blocks,
  // because the opening was sitting on ground it had already emptied. And the
  // legs run END TO END rather than orbiting a point, so each one drags the
  // opening onto footprint it has not already taken. The spawn lot itself is
  // surface car park by design, so the first leg is transit, not harvest.
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
  // Progression floor, held to the same >=4 as every other sandbox. Boston is
  // the heaviest map on the ladder (141k mass puts the multiplier at its ×10
  // cap, so the SIZE 4 gate is 1,800 combo-mass), which is exactly why it is
  // not granted a lower bar than the scenes it was built to surpass.
  if (a.hole.size < 4) fail(`boston: excursion reached only SIZE ${a.hole.size} (expected >=4 — mass-scaled SIZE ladder too steep?)`);

  probeFinitePositions(a.blocks, 'boston', 'after excursion');
  console.log(`  boston sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size} blockers=${sim.cameraBlockers.length}`);
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

validateVoxelSandbox();
validateVoxelCollisions();
validateManhattan();
validateUpperManhattan();
validateBrooklyn();
validateBoston();

console.log('---');
if (failures === 0) {
  console.log(`ALL PASS. Worst time margin: ${(minMargin * 100).toFixed(1)}% (L${minMarginLevel}). Slowest first eat: ${maxTimeToFirstEat.toFixed(2)}s.`);
} else {
  console.error(`${failures} failure(s). Worst margin ${(minMargin * 100).toFixed(1)}% at L${minMarginLevel}.`);
  process.exit(1);
}
