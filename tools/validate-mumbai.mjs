// Mumbai Gateway of India & Victoria Terminus — standalone scene validator.
//
// The fast iteration loop: builds Mumbai in ~1-2 s with full invariant assertions.
import { VoxelSandboxSim, loadScene, SCENE_GOALS } from '../js/voxelsim.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import {
  MUMBAI_CROSSINGS, MUMBAI_OPEN_GROUND, MUMBAI_ROAD_SPANS,
  MUMBAI_STREETS, MUMBAI_VEHICLES,
} from '../js/voxelscene-mumbai.js';
import { readFileSync } from 'node:fs';

await loadScene('mumbai');
const newSim = () => new VoxelSandboxSim({ seed: 'validator', scene: 'mumbai' });

const DECLARED = CITY_CATALOG.find((c) => c.scene === 'mumbai')?.blocks || 34500;

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
    fail(`mumbai: built ${built} blocks, catalog declares ${DECLARED} (delta ${built - DECLARED > 0 ? '+' : ''}${built - DECLARED})`);
  } else {
    pass(`block count: built=${built} catalog=${DECLARED} (exact 34,500)`);
  }
}

function probeCameraBlockers(sim, tops) {
  if (!sim.cameraBlockers || sim.cameraBlockers.length === 0) {
    fail('mumbai: cameraBlockers is empty — did the builder discard generateBlockers\' return value?');
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
    fail(`mumbai: cameraBlockers missed ${uncovered} cell(s) >=6 m (worst: ${worstCell} at ${worstH.toFixed(1)} m)`);
  } else {
    pass(`cameraBlockers: ${sim.cameraBlockers.length} rects, 0 uncovered cell(s) >=6 m`);
  }
}

function probeCellOwnership(sim) {
  const cellOwner = new Map();
  const overlaps = [];
  for (const b of sim.blocks) {
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iy = 0; iy < b.fsy; iy++) {
        for (let iz = 0; iz < b.fsz; iz++) {
          const k = `${b.gx + ix},${b.gy + iy},${b.gz + iz}`;
          const prev = cellOwner.get(k);
          if (prev !== undefined && prev !== b) {
            overlaps.push({ k, b, prev });
          } else {
            cellOwner.set(k, b);
          }
        }
      }
    }
  }
  if (overlaps.length > 0) {
    const bySource = new Map();
    for (const { b, prev } of overlaps) {
      const pairKey = `${b.matType}@(${b.x},${b.y},${b.z}) overlaps ${prev.matType}@(${prev.x},${prev.y},${prev.z})`;
      bySource.set(pairKey, (bySource.get(pairKey) || 0) + 1);
    }
    const lines = [...bySource.entries()].slice(0, 12).map(([pair, count]) => `    ${pair}: ${count} cells`);
    const more = bySource.size > 12 ? `\n  ... and ${bySource.size - 12} more overlap source(s)` : '';
    fail(`mumbai: ${overlaps.length} fine cells owned by the wrong block (overlapping placement)\n${lines.join('\n')}${more}`);
  } else {
    pass('cell ownership: zero overlapping placements');
  }
}

function probeCollinearGaps(sim) {
  const byRow = new Map();
  for (const b of sim.blocks) {
    const k = `${b.gy},${b.gz},${b.fsy},${b.fsz},${b.matType},${b.color}`;
    let list = byRow.get(k);
    if (!list) { list = []; byRow.set(k, list); }
    list.push(b);
  }
  let gapCount = 0;
  for (const list of byRow.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.gx - b.gx);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      const gap = b.gx - (a.gx + a.fsx);
      if (gap > 0 && gap < Math.min(a.fsx, b.fsx)) gapCount++;
    }
  }
  if (gapCount > 0) {
    fail(`mumbai: ${gapCount} collinear gap(s) smaller than block size (sub-extent gaps)`);
  } else {
    pass('placement step: no sub-extent gaps between collinear identical boxes');
  }
}

function probeBoundsRect(sim) {
  const rect = sim.boundsRect;
  if (!rect) {
    fail('mumbai: sim.boundsRect is undefined');
    return;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of sim.blocks) {
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    if (x0 < minX) minX = x0; if (x1 > maxX) maxX = x1;
    if (z0 < minZ) minZ = z0; if (z1 > maxZ) maxZ = z1;
  }
  const slack = 12;
  const bad = (
    rect.minX < minX - slack || rect.maxX > maxX + slack ||
    rect.minZ < minZ - slack || rect.maxZ > maxZ + slack
  );
  if (bad) {
    fail(`mumbai: boundsRect [${rect.minX},${rect.maxX}] × [${rect.minZ},${rect.maxZ}] does not hug content [${minX.toFixed(0)},${maxX.toFixed(0)}] × [${minZ.toFixed(0)},${maxZ.toFixed(0)}] within ${slack} m`);
  } else {
    pass('boundsRect hugs content within 12 m');
  }
}

function probePureSimBoundary() {
  const src = readFileSync(new URL('../js/voxelscene-mumbai.js', import.meta.url), 'utf8');
  const bad = [];
  if (/\bMath\.random\s*\(/.test(src)) bad.push('Math.random()');
  if (/from\s+['"][^'"]*three/i.test(src)) bad.push('three.js import');
  if (/\b(window|document|HTMLElement)\b/.test(src)) bad.push('DOM access');
  if (bad.length > 0) {
    fail(`mumbai: pure-sim boundary violations: ${bad.join(', ')}`);
  } else {
    pass('pure-sim boundary: no Math.random, no three.js, no DOM');
  }
}

function probeDeadImports() {
  const src = readFileSync(new URL('../js/voxelscene-mumbai.js', import.meta.url), 'utf8');
  const m = src.match(/import\s*\{([^}]+)\}\s*from\s*'\.\/voxelkit\.js'/);
  if (!m) return;
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  const dead = [];
  for (const name of names) {
    const afterImport = src.slice(src.indexOf(m[0]) + m[0].length);
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(afterImport)) dead.push(name);
  }
  if (dead.length > 0) {
    fail(`mumbai: dead imports from voxelkit.js: ${dead.join(', ')}`);
  } else {
    pass(`dead imports: all ${names.length} voxelkit imports are called`);
  }
}

function probeIdleStability(sim) {
  const initialY = new Float32Array(sim.blocks.length);
  for (let i = 0; i < sim.blocks.length; i++) initialY[i] = sim.blocks[i].y;
  for (let step = 0; step < 60; step++) {
    sim.step(1 / 60);
  }
  const dropped = [];
  for (let i = 0; i < sim.blocks.length; i++) {
    const dy = initialY[i] - sim.blocks[i].y;
    if (dy > 0.05) {
      const b = sim.blocks[i];
      dropped.push(`${b.matType} at (${b.x}, ${b.y}, ${b.z})`);
    }
  }
  if (dropped.length > 0) {
    const first = dropped.slice(0, 20).join('\n    ');
    const more = dropped.length > 20 ? `\n    ... and ${dropped.length - 20} more` : '';
    fail(`mumbai: ${dropped.length} block(s) fell under gravity during idle (floating / unsupported geometry)\n    ${first}${more}`);
  } else {
    pass('idle stability: nothing falls in 60 steps (no unsupported geometry)');
  }
}

function probeDeterminism() {
  const sim1 = newSim();
  const sim2 = newSim();
  const n1 = sim1.blocks.length, n2 = sim2.blocks.length;
  if (n1 !== n2) {
    fail(`mumbai: non-deterministic block counts: run1=${n1} run2=${n2}`);
    return;
  }
  let hash1 = 0, hash2 = 0;
  for (let i = 0; i < n1; i++) {
    const a = sim1.blocks[i], b = sim2.blocks[i];
    hash1 = (hash1 * 31 + a.gx + a.gy * 101 + a.gz * 1009) | 0;
    hash2 = (hash2 * 31 + b.gx + b.gy * 101 + b.gz * 1009) | 0;
    if (a.gx !== b.gx || a.gy !== b.gy || a.gz !== b.gz || a.matType !== b.matType) {
      fail(`mumbai: non-deterministic block at index ${i}`);
      return;
    }
  }
  pass(`determinism: two builds identical (${n1} blocks, fingerprint ${(hash1 >>> 0)})`);
}

function probeRadialWinnability(sim) {
  const total = sim.blocks.length;
  sim.hole.r = 2.0;
  sim.hole.x = 0;
  sim.hole.z = 0;
  const radii = [4, 8, 14, 22, 32, 45, 60, 80, 100, 120];
  for (const r of radii) {
    sim.hole.r = r;
    for (let i = sim.blocks.length - 1; i >= 0; i--) {
      const b = sim.blocks[i];
      const dx = b.x - sim.hole.x, dz = b.z - sim.hole.z;
      const d = Math.hypot(dx, dz);
      if (d <= sim.hole.r) {
        sim.blocks.splice(i, 1);
      }
    }
  }
  const survivors = sim.blocks.length;
  const won = survivors === 0;
  if (!won) {
    fail(`mumbai: radial winnability test left ${survivors}/${total} unconsumed blocks`);
  } else {
    pass(`winnable: ${total} blocks consumed radially, survivors=${survivors}, won=${won}`);
  }
}

console.log('--- Validating Mumbai Gateway of India & Victoria Terminus ---');
const sim = newSim();
const tops = footprintTops(sim);

probeDeclaredCount(sim);
probeCameraBlockers(sim, tops);
probeCellOwnership(sim);
probeCollinearGaps(sim);
probeBoundsRect(sim);
probePureSimBoundary();
probeDeadImports();
probeIdleStability(sim);
probeDeterminism();
probeRadialWinnability(sim);

console.log(`\n  mumbai sandbox: blocks=${sim.blocks.length} mass=${Math.round(sim.blocks.reduce((acc, b) => acc + (b.mass || 1), 0))} blockers=${sim.cameraBlockers?.length || 0}`);
if (failures === 0) {
  console.log('ALL PASS.');
} else {
  console.error(`\nFAILED: ${failures} issue(s) detected.`);
  process.exit(1);
}
