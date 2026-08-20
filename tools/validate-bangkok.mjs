// Bangkok Grand Palace & Wat Arun — standalone scene validator.
//
// The fast iteration loop: builds Bangkok in ~1-2 s with full invariant assertions.
import { VoxelSandboxSim, loadScene, SCENE_GOALS } from '../js/voxelsim.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import {
  BANGKOK_CROSSINGS, BANGKOK_OPEN_GROUND, BANGKOK_ROAD_SPANS,
  BANGKOK_STREETS, BANGKOK_VEHICLES,
} from '../js/voxelscene-bangkok.js';
import { readFileSync } from 'node:fs';

await loadScene('bangkok');
const newSim = () => new VoxelSandboxSim({ seed: 'validator', scene: 'bangkok' });

const DECLARED = CITY_CATALOG.find((c) => c.scene === 'bangkok')?.blocks || 30000;

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
    fail(`bangkok: built ${built} blocks, catalog declares ${DECLARED} (delta ${built - DECLARED > 0 ? '+' : ''}${built - DECLARED})`);
  } else {
    pass(`block count: built=${built} catalog=${DECLARED} (exact 30,000)`);
  }
}

function probeCameraBlockers(sim, tops) {
  if (!sim.cameraBlockers || sim.cameraBlockers.length === 0) {
    fail('bangkok: cameraBlockers is empty — did the builder discard generateBlockers\' return value?');
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
    fail(`bangkok: ${uncovered} footprint cell(s) >=6 m tall have no cameraBlocker covering their height (tallest ${worstH} m at cell ${worstCell})`);
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
    fail(`bangkok: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);
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
    if (!byAxis.x.has(kx)) byAxis.x.set(kx, []);
    if (!byAxis.y.has(ky)) byAxis.y.set(ky, []);
    if (!byAxis.z.has(kz)) byAxis.z.set(kz, []);
    byAxis.x.get(kx).push(bl);
    byAxis.y.get(ky).push(bl);
    byAxis.z.get(kz).push(bl);
  }
  let gaps = 0;
  for (const [axis, groups] of Object.entries(byAxis)) {
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const gcoord = (b) => (axis === 'x' ? b.gx : axis === 'y' ? b.gy : b.gz);
      const fsize = (b) => (axis === 'x' ? b.fsx : axis === 'y' ? b.fsy : b.fsz);
      list.sort((a, b) => gcoord(a) - gcoord(b));
      for (let i = 0; i < list.length - 1; i++) {
        const delta = gcoord(list[i + 1]) - (gcoord(list[i]) + fsize(list[i]));
        if (delta > 0 && delta < fsize(list[i])) gaps++;
      }
    }
  }
  if (gaps > 0) fail(`placement step: ${gaps} sub-extent gap(s) between collinear identical boxes`);
  else pass('placement step: no sub-extent gaps between collinear identical boxes');
}

function probeBoundsHugging(sim) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of sim.blocks) {
    if (b.x < minX) minX = b.x;
    if (b.x > maxX) maxX = b.x;
    if (b.z < minZ) minZ = b.z;
    if (b.z > maxZ) maxZ = b.z;
  }
  const rect = sim.boundsRect || { minX: -sim.bounds, maxX: sim.bounds, minZ: -sim.bounds, maxZ: sim.bounds };
  const pad = 12;
  const tight = rect.minX <= minX && rect.minX >= minX - pad
             && rect.maxX >= maxX && rect.maxX <= maxX + pad
             && rect.minZ <= minZ && rect.minZ >= minZ - pad
             && rect.maxZ >= maxZ && rect.maxZ <= maxZ + pad;
  if (!tight) {
    fail(`boundsRect (${JSON.stringify(rect)}) loose against content [${minX.toFixed(0)},${maxX.toFixed(0)}]x[${minZ.toFixed(0)},${maxZ.toFixed(0)}]`);
  } else {
    pass(`boundsRect hugs content within ${pad} m`);
  }
}

const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function probePureSimBoundary() {
  const src = codeOnly(readFileSync(new URL('../js/voxelscene-bangkok.js', import.meta.url), 'utf8'));
  const bad = [];
  if (/Math\.random/.test(src)) bad.push('Math.random (use rng.js — seeded)');
  if (/from\s+['"]three/.test(src) || /require\(['"]three/.test(src)) bad.push('three.js import');
  if (/\bdocument\.|\bwindow\.|\bnavigator\./.test(src)) bad.push('DOM access');
  if (bad.length) fail(`bangkok: pure-sim boundary violated — ${bad.join(', ')}`);
  else pass('pure-sim boundary: no Math.random, no three.js, no DOM');
}

function probeDeadImports() {
  const src = codeOnly(readFileSync(new URL('../js/voxelscene-bangkok.js', import.meta.url), 'utf8'));
  const m = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/voxelkit\.js['"]/);
  if (!m) { pass('dead imports: no voxelkit import block'); return; }
  const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
  const body = src.slice(m.index + m[0].length);
  const dead = names.filter((n) => !new RegExp(`\\b${n}\\s*\\(`).test(body));
  if (dead.length) fail(`bangkok: ${dead.length} dead voxelkit import(s) — ${dead.join(', ')}`);
  else pass(`dead imports: all ${names.length} voxelkit imports are called`);
}

function probeIdleStability(sim) {
  for (let step = 0; step < 60; step++) sim.step(1 / 60, { x: 0, z: 0 });
  const fallen = sim.blocks.filter((b) => b.state === 'falling');
  if (fallen.length > 0) {
    fail(`bangkok: ${fallen.length} block(s) fell under gravity during idle (floating / unsupported geometry)`);
    for (const b of fallen.slice(0, 20)) console.log(`    ${b.matType} at (${b.x}, ${b.y}, ${b.z})`);
    if (fallen.length > 20) console.log(`    ... and ${fallen.length - 20} more`);
  } else {
    pass('idle stability: nothing falls in 60 steps (no unsupported geometry)');
  }
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
    fail(`bangkok: two builds differ in block count (${a.blocks.length} vs ${b.blocks.length})`);
    return;
  }
  const fa = fingerprint(a), fb = fingerprint(b);
  if (fa !== fb) fail(`bangkok: two builds differ structurally (fingerprint ${fa} vs ${fb})`);
  else pass(`determinism: two builds identical (${a.blocks.length} blocks, fingerprint ${fa})`);
}

function probeWinnable(sim) {
  const radial = sim.blocks.slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  for (const b of radial) if (b.state !== 'consumed') sim._consume(b);
  sim.step(1 / 60, { x: 0, z: 0 });
  const left = sim.blocks.filter((b) => b.state !== 'consumed').length;
  const shortfall = sim.totalMass - sim.hole.rawMass;
  const epsilon = sim.totalMass * 1e-9;
  if (left > 0) fail(`bangkok: ${left} block(s) survived a full clear — the harness is not clearing the city`);
  else if (!sim.won) {
    fail(`bangkok: consumed all ${sim.blocks.length} blocks and won is still false (shortfall ${shortfall.toExponential(3)} vs epsilon ${epsilon.toExponential(3)})`);
  } else {
    pass(`winnable: ${sim.blocks.length} blocks consumed radially, survivors=0, won=true, shortfall=${shortfall.toExponential(3)} vs epsilon=${epsilon.toExponential(3)}`);
  }
}

console.log('--- Validating Bangkok Grand Palace & Wat Arun ---');
const sim = newSim();
const tops = footprintTops(sim);

probeDeclaredCount(sim);
probeCameraBlockers(sim, tops);
probeCellOwnership(sim);
probePlacementStep(sim);
probeBoundsHugging(sim);
probePureSimBoundary();
probeDeadImports();
probeIdleStability(sim);
probeDeterminism();
probeWinnable(sim);

console.log(`\n  bangkok sandbox: blocks=${sim.blocks.length} mass=${Math.round(sim.blocks.reduce((acc, b) => acc + (b.mass || 1), 0))} blockers=${sim.cameraBlockers.length}`);

if (failures > 0) {
  console.error(`\nFAILED: ${failures} issue(s) detected.\n`);
  process.exit(1);
} else {
  console.log('ALL PASS.\n');
  process.exit(0);
}
