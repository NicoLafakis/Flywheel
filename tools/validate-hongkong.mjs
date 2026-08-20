// Hong Kong Victoria Harbour & Victoria Peak — standalone scene validator.
//
// The fast iteration loop: builds Hong Kong in ~1-2 s with full invariant assertions.
import { VoxelSandboxSim, loadScene, SCENE_GOALS } from '../js/voxelsim.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import {
  HONGKONG_CROSSINGS, HONGKONG_OPEN_GROUND, HONGKONG_ROAD_SPANS,
  HONGKONG_STREETS, HONGKONG_VEHICLES, vehicleBBox,
} from '../js/voxelscene-hongkong.js';
import { readFileSync } from 'node:fs';

await loadScene('hongkong');
const newSim = () => new VoxelSandboxSim({ seed: 'validator', scene: 'hongkong' });

const DECLARED = CITY_CATALOG.find((c) => c.scene === 'hongkong')?.blocks || 28500;

let failures = 0;
const fail = (msg) => { failures++; console.error(`  FAIL: ${msg}`); };
const pass = (msg) => console.log(`  PASS: ${msg}`);

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

function probeDeclaredCount(sim) {
  const built = sim.blocks.length;
  if (built !== DECLARED) {
    fail(`hongkong: built ${built} blocks, catalog declares ${DECLARED} (delta ${built - DECLARED > 0 ? '+' : ''}${built - DECLARED})`);
  } else {
    pass(`block count: built=${built} catalog=${DECLARED} (exact ${DECLARED})`);
  }
}

function probeCameraBlockers(sim, tops) {
  if (!sim.cameraBlockers || sim.cameraBlockers.length === 0) {
    fail('hongkong: cameraBlockers is empty — did the builder discard generateBlockers\' return value?');
    return;
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
    fail(`hongkong: ${uncovered} footprint cell(s) >=6 m tall have no cameraBlocker covering their height (tallest ${worstH} m at cell ${worstCell})`);
  } else {
    pass(`cameraBlockers: ${sim.cameraBlockers.length} rects, 0 uncovered cell(s) >=6 m`);
  }
}

function probeCellOwnership(sim) {
  let ghosts = 0;
  const overlapSources = new Map();
  for (const b of sim.blocks) {
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iy = 0; iy < b.fsy; iy++) {
        for (let iz = 0; iz < b.fsz; iz++) {
          const owner = sim.grid.get(`${b.gx + ix},${b.gy + iy},${b.gz + iz}`);
          if (owner && owner !== b) {
            ghosts++;
            const pair = `${owner.matType}@(${owner.x},${owner.y},${owner.z}) overlaps ${b.matType}@(${b.x},${b.y},${b.z})`;
            overlapSources.set(pair, (overlapSources.get(pair) || 0) + 1);
          }
        }
      }
    }
  }
  if (ghosts > 0) {
    fail(`hongkong: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);
    let shown = 0;
    for (const [k, v] of overlapSources.entries()) {
      if (shown++ >= 12) { console.log(`  ... and ${overlapSources.size - 12} more overlap source(s)`); break; }
      console.log(`    ${k}: ${v} cells`);
    }
  } else {
    pass('cell ownership: zero overlapping placements');
  }
}

function probePlacementStep(sim) {
  const byAxis = { x: new Map(), y: new Map(), z: new Map() };
  for (const bl of sim.blocks) {
    const kx = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl.gy},${bl.gz}`;
    const ky = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl.gx},${bl.gz}`;
    const kz = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl.gx},${bl.gy}`;
    (byAxis.x.get(kx) || (byAxis.x.set(kx, []).get(kx))).push(bl);
    (byAxis.y.get(ky) || (byAxis.y.set(ky, []).get(ky))).push(bl);
    (byAxis.z.get(kz) || (byAxis.z.set(kz, []).get(kz))).push(bl);
  }
  let gated = 0;
  for (const [ax, map] of Object.entries(byAxis)) {
    const pos = ax === 'x' ? 'gx' : ax === 'y' ? 'gy' : 'gz';
    const fs = ax === 'x' ? 'fsx' : ax === 'y' ? 'fsy' : 'fsz';
    for (const list of map.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a[pos] - b[pos]);
      for (let i = 0; i < list.length - 1; i++) {
        const cur = list[i], next = list[i + 1];
        const gap = next[pos] - (cur[pos] + cur[fs]);
        if (gap > 0 && gap < cur[fs]) gated++;
      }
    }
  }
  if (gated > 0) fail(`hongkong: ${gated} sub-extent gap(s) between collinear identical BOXES`);
  else pass('placement step: no sub-extent gaps between collinear identical boxes');
}

function probeIdleStability(sim) {
  for (let step = 0; step < 60; step++) sim.step(1 / 60, { x: 0, z: 0 });
  const fallen = sim.blocks.filter((b) => b.state === 'falling');
  if (fallen.length > 0) {
    fail(`hongkong: ${fallen.length} block(s) fell under gravity during idle (floating / unsupported geometry)`);
    for (const b of fallen.slice(0, 20)) console.log(`    ${b.matType} at (${b.x}, ${b.y}, ${b.z})`);
    if (fallen.length > 20) console.log(`    ... and ${fallen.length - 20} more`);
  } else {
    pass('idle stability: nothing falls in 60 steps (no unsupported geometry)');
  }
}

function probeBoundsRect(sim, slack = 12) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of sim.blocks) {
    minX = Math.min(minX, b.x - b.sx / 2); maxX = Math.max(maxX, b.x + b.sx / 2);
    minZ = Math.min(minZ, b.z - b.sz / 2); maxZ = Math.max(maxZ, b.z + b.sz / 2);
  }
  const R = sim.boundsRect;
  if (!R) { fail('hongkong: no boundsRect'); return; }
  if (minX < R.minX || maxX > R.maxX || minZ < R.minZ || maxZ > R.maxZ) {
    fail(`hongkong: geometry x[${minX},${maxX}] z[${minZ},${maxZ}] escapes boundsRect x[${R.minX},${R.maxX}] z[${R.minZ},${R.maxZ}]`);
  } else if (R.maxX - maxX > slack || minX - R.minX > slack || R.maxZ - maxZ > slack || minZ - R.minZ > slack) {
    fail(`hongkong: boundsRect leaves >${slack} m of blank ground (x[${R.minX},${R.maxX}] vs [${minX},${maxX}], z[${R.minZ},${R.maxZ}] vs [${minZ},${maxZ}])`);
  } else {
    pass(`boundsRect hugs content within ${slack} m`);
  }
}

function probeWinnable(sim) {
  const radial = sim.blocks.slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  for (const b of radial) if (b.state !== 'consumed') sim._consume(b);
  sim.step(1 / 60, { x: 0, z: 0 });
  const left = sim.blocks.filter((b) => b.state !== 'consumed').length;
  const shortfall = sim.totalMass - sim.hole.rawMass;
  const epsilon = sim.totalMass * 1e-9;
  if (left > 0) fail(`hongkong: ${left} block(s) survived a full clear — the harness is not clearing the city`);
  else if (!sim.won) {
    fail(`hongkong: consumed all ${sim.blocks.length} blocks and won is still false (shortfall ${shortfall.toExponential(3)} vs epsilon ${epsilon.toExponential(3)})`);
  } else {
    pass(`winnable: ${sim.blocks.length} blocks consumed radially, survivors=0, won=true, shortfall=${shortfall.toExponential(3)} vs epsilon=${epsilon.toExponential(3)}`);
  }
}


// Budget close-out must be SCENE detail, not a carpet: the 2026-08-20 scene
// spent 15,346 of 28,500 blocks on flat 0.5 m harbour stones at y=0 (Nico:
// "indistinguishable from a generic city"). Cap small y=0 stones in the
// harbour/Kowloon water zone (z <= -14) at 10% of the declared budget.
function probeNoBudgetPadding(sim) {
  const pad = sim.blocks.filter((b) => b.gy === 0 && b.z <= -14 && b.fsx <= 2 && b.fsy <= 2 && b.fsz <= 2).length;
  const cap = Math.floor(DECLARED * 0.10);
  if (pad > cap) fail(`hongkong: ${pad} blocks <=0.5 m at y=0 in the water zone (z <= -14) — budget padding over the ${cap} cap`);
  else pass(`no budget padding: ${pad} small y=0 water-zone blocks (cap ${cap})`);
}

// Facade articulation. Every landmark was a 2 m-cube BOX; the real ones read
// by X-bracing, porthole grids, truss chevrons, ribs and bay windows, all of
// which need 1 m / 0.5 m or anisotropic pieces. Above y=4 (clear of podia,
// terraces, piers and pavements), the majority of placed pieces must NOT be
// 2 m cubes. Counted per piece, not per volume, so a few bulky cores cannot
// mask a detail-less skyline and a detailed skin cannot be faked by volume.
function probeFacadeArticulation(sim) {
  const up = sim.blocks.filter((b) => b.y >= 4);
  const cubes2 = up.filter((b) => b.fsx === 8 && b.fsy === 8 && b.fsz === 8).length;
  const frac = up.length ? 1 - cubes2 / up.length : 0;
  if (up.length < 2000) fail(`hongkong: only ${up.length} blocks above y=4 — the skyline is too thin to articulate`);
  else if (frac < 0.5) fail(`hongkong: only ${(frac * 100).toFixed(1)}% of ${up.length} blocks above y=4 are non-2m-cube pieces (need >50%: facades are flat boxes)`);
  else pass(`facade articulation: ${(frac * 100).toFixed(1)}% of ${up.length} blocks above y=4 are 1 m/0.5 m/aniso pieces`);
}

// Ported from tools/validate.mjs: ALL physical blocks vs the roadway rects.
// The only exemption is the positional vehicle list the scene exports. The
// first draft of this scene put IFC, Jardine House and the Bank of China
// Tower inside Connaught Road, Murray Road and Queensway.
function probeRoadConflicts(sim) {
  const allow = HONGKONG_VEHICLES.map(vehicleBBox);
  let n = 0, worst = '';
  for (const b of sim.blocks) {
    const r = { x: b.x - b.sx / 2, z: b.z - b.sz / 2, w: b.sx, d: b.sz };
    const onRoad = sim.sceneDecor.roads.some((rd) => r.x < rd.x + rd.w && r.x + r.w > rd.x && r.z < rd.z + rd.d && r.z + r.d > rd.z);
    if (!onRoad) continue;
    const inVehicle = allow.some((v) => r.x >= v.minX - 0.75 && r.x + r.w <= v.maxX + 0.75 && r.z >= v.minZ - 0.75 && r.z + r.d <= v.maxZ + 0.75);
    if (inVehicle) continue;
    n++;
    if (!worst) worst = `${b.matType} at (${r.x},${b.y},${r.z})`;
  }
  if (n > 0) fail(`hongkong: ${n} physical block(s) inside a roadway rect, first ${worst}`);
  else pass('road conflicts: no block inside a roadway rect outside a vehicle envelope');
}

function fingerprint(sim) {
  let h = 0x811c9dc5;
  for (const b of sim.blocks) {
    const s = `${b.gx},${b.gy},${b.gz},${b.fsx},${b.fsy},${b.fsz},${b.matType},${b.color}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

function probeDeterminism() {
  const a = newSim(), b = newSim();
  if (a.blocks.length !== b.blocks.length) {
    fail(`hongkong: two builds differ in block count (${a.blocks.length} vs ${b.blocks.length})`);
    return;
  }
  const fa = fingerprint(a), fb = fingerprint(b);
  if (fa !== fb) fail(`hongkong: two builds differ structurally (fingerprint ${fa} vs ${fb})`);
  else pass(`determinism: two builds identical (${a.blocks.length} blocks, fingerprint ${fa})`);
}

const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function probePureSimBoundary() {
  const src = codeOnly(readFileSync(new URL('../js/voxelscene-hongkong.js', import.meta.url), 'utf8'));
  const bad = [];
  if (/Math\.random/.test(src)) bad.push('Math.random (use rng.js — seeded)');
  if (/from\s+['"]three/.test(src) || /require\(['"]three/.test(src)) bad.push('three.js import');
  if (/\bdocument\.|\bwindow\.|\bnavigator\./.test(src)) bad.push('DOM access');
  if (bad.length) fail(`hongkong: pure-sim boundary violated — ${bad.join(', ')}`);
  else pass('pure-sim boundary: no Math.random, no three.js, no DOM');
}

function probeNoDeadImports() {
  const src = codeOnly(readFileSync(new URL('../js/voxelscene-hongkong.js', import.meta.url), 'utf8'));
  const m = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/voxelkit\.js['"]/);
  if (!m) { pass('dead imports: no voxelkit import block'); return; }
  const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
  const body = src.slice(m.index + m[0].length);
  const dead = names.filter((n) => !new RegExp(`\\b${n}\\s*\\(`).test(body));
  if (dead.length) fail(`hongkong: ${dead.length} dead voxelkit import(s) — ${dead.join(', ')}`);
  else pass(`dead imports: all ${names.length} voxelkit imports are called`);
}

console.log('--- Validating Hong Kong Victoria Harbour & Victoria Peak ---');
const sim = newSim();
const tops = footprintTops(sim);

probeDeclaredCount(sim);
probeNoBudgetPadding(sim);
probeFacadeArticulation(sim);
probeRoadConflicts(sim);
probeCameraBlockers(sim, tops);
probeCellOwnership(sim);
probePlacementStep(sim);
probeBoundsRect(sim);
probePureSimBoundary();
probeNoDeadImports();
probeIdleStability(sim);
probeDeterminism();
probeWinnable(newSim());

console.log(`\n  hongkong sandbox: blocks=${sim.blocks.length} mass=${sim.totalMass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);

if (failures === 0) {
  console.log('ALL PASS.');
} else {
  console.error(`\nFAILED: ${failures} issue(s) detected.`);
  process.exit(1);
}
