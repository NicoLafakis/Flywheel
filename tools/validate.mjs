// Headless proof that every level is beatable, overlap-free, and snack-ringed.
// Run: node tools/validate.mjs [levelIndex]
// Uses the exact same citygen + sim code as the game.

import { LEVELS } from '../js/levels.js';
import { generateCity } from '../js/citygen.js';
import { Sim } from '../js/sim.js';
import { isEdible } from '../js/tiers.js';
import { VoxelSandboxSim } from '../js/voxelsim.js';
import { readFileSync } from 'node:fs';

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
  for (const f of ['rng', 'tiers', 'citygen', 'levels', 'sim', 'voxelsim', 'voxelscene-manhattan', 'voxelscene-upper-manhattan', 'voxelkit']) {
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

// --- manhattan sandbox checks -------------------------------------------------
// The second voxel scene (Lower Manhattan): same engine, so we check the
// scene-specific risks — overlapping placement (ghost blocks), spontaneous
// collapse at spawn, and that a scripted excursion actually excavates.
function validateManhattan() {
  console.log('Validating manhattan sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'manhattan' });

  // overlap guard: every fine cell must point back at its owner — a second
  // block placed into an occupied cell overwrites it (ghost block)
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
  if (ghosts > 0) fail(`manhattan: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);

  // camera-blocker coverage: the blocker list is hand-written per structure, so
  // it drifts every time content lands. The chase cam's LOWEST framing is
  // ~8.6 m high (SIZE 1), so anything under 6 m is already cleared with margin
  // — above that, an unlisted roof occludes the hole. Scoped to manhattan: the
  // gallery ships zero blockers by design (camera.js falls back to a flat pull).
  const tops = new Map(); // "cx,cz" 1 m footprint cell -> highest block top (m)
  for (const b of sim.blocks) {
    const top = (b.gy + b.fs) * 0.25;
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fs) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fs) * 0.25); cz++) {
        const k = `${cx},${cz}`;
        if (!(tops.get(k) >= top)) tops.set(k, top);
      }
    }
  }
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
    fail(`manhattan: ${uncovered} footprint cell(s) >=6 m tall have no cameraBlocker covering their height (tallest ${worstH} m at cell ${worstCell})`);
  }

  // decor draw order: water renders at y .008 OVER parks at y .006, so a park
  // rect fully inside a water rect never appears (Castle Clinton's park was
  // exactly this bug when the harbor was one big rect).
  for (const p of sim.sceneDecor.parks) {
    const buried = sim.sceneDecor.water.find((w) =>
      p.x >= w.x && p.x + p.w <= w.x + w.w && p.z >= w.z && p.z + p.d <= w.z + w.d);
    if (buried) fail(`manhattan: park rect (${p.x},${p.z} ${p.w}x${p.d}) is fully inside water rect (${buried.x},${buried.z} ${buried.w}x${buried.d}) — it never renders`);
  }

  // idle stability: 3 s parked at spawn — nothing may collapse or be eaten
  for (let i = 0; i < 3 * 60; i++) sim.step(DT, { x: 0, z: 0 });
  const nonStatic = sim.blocks.filter((b) => b.state !== 'static').length;
  if (nonStatic !== 0) fail(`manhattan: ${nonStatic} blocks non-static after 3s idle at spawn`);
  if (sim.hole.eatenCount !== 0) fail(`manhattan: ${sim.hole.eatenCount} blocks eaten during 3s idle at spawn`);

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
  let bad = 0;
  for (const bl of sim.blocks) {
    if (!Number.isFinite(bl.x) || !Number.isFinite(bl.y) || !Number.isFinite(bl.z)) bad++;
  }
  if (bad > 0) fail(`manhattan: ${bad} non-finite block positions after excursion`);
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
// The third voxel scene: a park-first Upper Manhattan district with a much
// lower skyline than Lower Manhattan. Keep the same hand-authored scene
// contracts — ownership, camera coverage, decor draw order, and readable
// excavation from the spawn promenade.
function validateUpperManhattan() {
  console.log('Validating upper manhattan sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'upper-manhattan' });

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
  if (ghosts > 0) fail(`upper manhattan: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);

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
    fail(`upper manhattan: ${uncovered} footprint cell(s) >=6 m tall have no cameraBlocker covering their height (tallest ${worstH} m at cell ${worstCell})`);
  }

  for (const p of sim.sceneDecor.parks) {
    const buried = sim.sceneDecor.water.find((w) =>
      p.x >= w.x && p.x + p.w <= w.x + w.w && p.z >= w.z && p.z + p.d <= w.z + w.d);
    if (buried) fail(`upper manhattan: park rect (${p.x},${p.z} ${p.w}x${p.d}) is fully inside water rect (${buried.x},${buried.z} ${buried.w}x${buried.d})`);
  }

  // Roadway bands are a shared placement contract: physical trees, benches,
  // curb props, and building footprints must stay out of the render-only
  // asphalt rectangles. This catches the exact class of visual drift that is
  // otherwise easy to miss when a landmark or prop coordinate changes.
  let roadConflicts = 0;
  for (const bl of sim.blocks) {
    const isFoliageOrBench = bl.matType === 'leaf' || bl.matType === 'wood';
    const isTallStructure = bl.s >= 1 && bl.y + bl.s / 2 >= 3;
    if (!isFoliageOrBench && !isTallStructure) continue;
    const minX = bl.x - bl.s / 2, maxX = bl.x + bl.s / 2;
    const minZ = bl.z - bl.s / 2, maxZ = bl.z + bl.s / 2;
    if (sim.sceneDecor.roads.some((r) =>
      minX < r.x + r.w && maxX > r.x && minZ < r.z + r.d && maxZ > r.z)) roadConflicts++;
  }
  if (roadConflicts > 0) fail(`upper manhattan: ${roadConflicts} physical block(s) overlap roadway templates`);

  for (let i = 0; i < 3 * 60; i++) sim.step(DT, { x: 0, z: 0 });
  const nonStatic = sim.blocks.filter((b) => b.state !== 'static').length;
  if (nonStatic !== 0) fail(`upper manhattan: ${nonStatic} blocks non-static after 3s idle at spawn`);
  if (sim.hole.eatenCount !== 0) fail(`upper manhattan: ${sim.hole.eatenCount} blocks eaten during 3s idle at spawn`);

  const WP = [
    { until: 8, x: -6, z: 16 },   // spawn promenade benches + trees
    { until: 16, x: 0, z: 28 },    // The Lake / Bethesda
    { until: 24, x: -5, z: 0 },    // Reservoir rim
    { until: 34, x: -9, z: 16 },   // Belvedere Castle
    { until: 44, x: 32, z: 8 },    // Met / Museum Mile
    { until: 56, x: -38, z: 28 },  // Dakota / Upper West Side
  ];
  const runExcursion = () => {
    const run = new VoxelSandboxSim({ seed: 'validator', scene: 'upper-manhattan' });
    for (let i = 0; i < 56 * 60; i++) {
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
  if (a.hole.eatenCount < 100) fail(`upper manhattan: only ${a.hole.eatenCount} blocks eaten on the park-to-perimeter excursion (expected >=100)`);
  if (a.hole.size < 4) fail(`upper manhattan: excursion reached only SIZE ${a.hole.size} (expected >=4)`);

  let bad = 0;
  for (const bl of a.blocks) {
    if (!Number.isFinite(bl.x) || !Number.isFinite(bl.y) || !Number.isFinite(bl.z)) bad++;
  }
  if (bad > 0) fail(`upper manhattan: ${bad} non-finite block positions after excursion`);
  console.log(`  upper manhattan sandbox: blocks=${a.totalBlocks} mass=${a.totalMass.toFixed(0)} eaten=${a.hole.eatenCount} size=${a.hole.size}`);
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

console.log('---');
if (failures === 0) {
  console.log(`ALL PASS. Worst time margin: ${(minMargin * 100).toFixed(1)}% (L${minMarginLevel}). Slowest first eat: ${maxTimeToFirstEat.toFixed(2)}s.`);
} else {
  console.error(`${failures} failure(s). Worst margin ${(minMargin * 100).toFixed(1)}% at L${minMarginLevel}.`);
  process.exit(1);
}
