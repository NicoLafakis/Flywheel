// Singapore Marina Bay — standalone scene validator.
//
// The fast iteration loop: builds ONE city in ~1 s instead of nine, and carries
// five probes the shared suite has no equivalent of — exact declared count, dead
// voxelkit imports, pure-sim boundary, build determinism, and the winnable
// residual printed rather than merely compared.
//
// It also re-implements cell ownership, camera blockers, bounds, placement step
// and idle stability, which `section('singapore', ...)` in tools/validate.mjs
// runs too. That duplication is deliberate and follows tools/validate-sydney.mjs
// — a standalone harness that has to be re-pointed at the shared file to answer
// "did I just break the geometry" is not a fast loop. The costs are real and
// worth naming: two copies can drift, and the copies here are the WEAKER ones
// (the shared idle probe parks the hole at spawn for 3 s and also checks nothing
// was EATEN, which is how the spawn-on-the-revetment bug was caught after this
// file had already said PASS). Treat tools/validate.mjs as authoritative and
// this as the loop you iterate in.
//
// PHASE 1 USED A PROTOTYPE PATCH; THIS IS THE PHASE 2 SHAPE. Before the scene
// was registered, `new VoxelSandboxSim({ scene })` could not reach the builder
// at all — SCENE_IMPORTERS is module-private — so this file overrode
// `_buildScene`, which an unknown id falls through to. That is a real seam and
// it is worth recording that it BROKE the moment the registry entry landed: a
// registered-but-unloaded scene throws by name instead of falling through, so
// the patch stopped being reached and the whole file died on its first
// construct. Half of a two-sided seam was retired and the caller kept calling.
// The registered path is now the honest one and needs no patch, only the
// `loadScene` await that every other consumer of an authored scene already does.
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import { CITY_CATALOG } from '../js/citycatalog.js';

await loadScene('singapore');
const newSim = () => new VoxelSandboxSim({ seed: 'validator', scene: 'singapore' });

const DECLARED = CITY_CATALOG.find((c) => c.scene === 'singapore').blocks;

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

// The gate Sydney did not have: built geometry must equal the catalog's
// declared count EXACTLY. The catalog number is authoritative (owner's
// directive) — a mismatch is a scene bug, never a reason to edit the catalog.
function probeDeclaredCount(sim) {
  const built = sim.blocks.length;
  if (built !== DECLARED) {
    fail(`singapore: built ${built} blocks, catalog declares ${DECLARED} (delta ${built - DECLARED > 0 ? '+' : ''}${built - DECLARED})`);
  } else {
    pass(`block count: built=${built} catalog=${DECLARED} (exact)`);
  }
}

function probeCameraBlockers(sim, tops) {
  if (!sim.cameraBlockers || sim.cameraBlockers.length === 0) {
    // The Sydney trap: `generateBlockers(sim)` RETURNS the list, it does not
    // assign it, and a discarded return value looks exactly like this.
    fail('singapore: cameraBlockers is empty — did the builder discard generateBlockers\' return value?');
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
    fail(`singapore: ${uncovered} footprint cell(s) >=6 m tall have no cameraBlocker covering their height (tallest ${worstH} m at cell ${worstCell})`);
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
    fail(`singapore: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);
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
  if (gated > 0) fail(`singapore: ${gated} sub-extent gap(s) between collinear identical BOXES`);
  else pass('placement step: no sub-extent gaps between collinear identical boxes');
}

function probeIdleStability(sim) {
  for (let step = 0; step < 60; step++) sim.step(1 / 60, { x: 0, z: 0 });
  const fallen = sim.blocks.filter((b) => b.state === 'falling');
  if (fallen.length > 0) {
    fail(`singapore: ${fallen.length} block(s) fell under gravity during idle (floating / unsupported geometry)`);
    for (const b of fallen.slice(0, 20)) console.log(`    ${b.matType} at (${b.x}, ${b.y}, ${b.z})`);
    if (fallen.length > 20) console.log(`    ... and ${fallen.length - 20} more`);
  } else {
    pass('idle stability: nothing falls in 60 steps (no unsupported geometry)');
  }
}

// A physical block standing in water is invisible to probeWaterOverSurfaces,
// which compares DECOR rects only. Singapore shipped 1,241 ground-level setts
// inside the bay and stayed green. Ground-anchored blocks WHOLLY inside a water
// rect are legitimate only where a built edge occludes the rect (the Shoppes
// podium's west face, the moored launches) — 136 of them. More than that is a
// course laid in the water.
//
// THE 136 IS EXACT AND MUST STAY EXACT. It is not an allowance with room in it:
// slack here would sit green through a new course of up to that many setts,
// which is the same failure as a floor loose enough to pass the thing it was
// written to catch. If a deliberate change moves the number, re-derive it and
// say which blocks account for the difference — do not widen it to fit.
function probeBlocksInWater(sim) {
  const W = sim.sceneDecor.water;
  const drowned = sim.blocks.filter((b) => b.gy === 0 && W.some((w) =>
    b.x - b.sx / 2 >= w.x && b.x + b.sx / 2 <= w.x + w.w &&
    b.z - b.sz / 2 >= w.z && b.z + b.sz / 2 <= w.z + w.d));
  if (drowned.length !== 136) {
    fail(`singapore: ${drowned.length} ground blocks stand wholly inside a water rect (exactly 136 expected: the Shoppes podium's west face and the two launches) — first at (${drowned[0].x}, ${drowned[0].z})`);
  } else {
    pass('blocks in water: 136 ground blocks inside a water rect, all of them occluded by a built edge');
  }
}

function probeBoundsRect(sim, slack = 12) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of sim.blocks) {
    minX = Math.min(minX, b.x - b.sx / 2); maxX = Math.max(maxX, b.x + b.sx / 2);
    minZ = Math.min(minZ, b.z - b.sz / 2); maxZ = Math.max(maxZ, b.z + b.sz / 2);
  }
  const R = sim.boundsRect;
  if (!R) { fail('singapore: no boundsRect'); return; }
  if (minX < R.minX || maxX > R.maxX || minZ < R.minZ || maxZ > R.maxZ) {
    fail(`singapore: geometry x[${minX},${maxX}] z[${minZ},${maxZ}] escapes boundsRect x[${R.minX},${R.maxX}] z[${R.minZ},${R.maxZ}]`);
  } else if (R.maxX - maxX > slack || minX - R.minX > slack || R.maxZ - maxZ > slack || minZ - R.minZ > slack) {
    fail(`singapore: boundsRect leaves >${slack} m of blank ground (x[${R.minX},${R.maxX}] vs [${minX},${maxX}], z[${R.minZ},${R.maxZ}] vs [${minZ},${maxZ}])`);
  } else {
    pass(`boundsRect hugs content within ${slack} m`);
  }
}

// This is a FLOAT-ORDER guard, not a reachability one, and the ORDER is the
// whole instrument. `hole.rawMass` accumulates one add per block as the city is
// eaten; `totalMass` is a reduce() over the same blocks in ARRAY order. Same
// summands, different order, so eating in array order reproduces totalMass
// bit-for-bit and the residual is exactly 0 — the check passes even on code that
// cannot win. Radial order, which is roughly how a real hole eats, is one of the
// orders that actually loses, so that is the one that runs.
//
// The RESIDUAL is printed rather than merely compared. A guard that only says
// PASS cannot show its margin closing: as the city grows, its accumulated float
// error creeps toward the epsilon, and this line is where that shows up before
// the day it crosses. The `survivors` clause is a self-check on the harness
// (every block is force-consumed, so it can only fire if _consume stopped
// working), not an assertion about the map.
function probeWinnable(sim) {
  const radial = sim.blocks.slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  for (const b of radial) if (b.state !== 'consumed') sim._consume(b);
  sim.step(1 / 60, { x: 0, z: 0 });
  const left = sim.blocks.filter((b) => b.state !== 'consumed').length;
  const shortfall = sim.totalMass - sim.hole.rawMass;
  const epsilon = sim.totalMass * 1e-9;
  if (left > 0) fail(`singapore: ${left} block(s) survived a full clear — the harness is not clearing the city`);
  else if (!sim.won) {
    fail(`singapore: consumed all ${sim.blocks.length} blocks and won is still false (shortfall ${shortfall.toExponential(3)} vs epsilon ${epsilon.toExponential(3)})`);
  } else {
    pass(`winnable: ${sim.blocks.length} blocks consumed radially, survivors=0, won=true, `
      + `shortfall=${shortfall.toExponential(3)} vs epsilon=${epsilon.toExponential(3)} `
      + `(${(Math.abs(shortfall) / epsilon * 100).toFixed(2)}% of it)`);
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
    fail(`singapore: two builds differ in block count (${a.blocks.length} vs ${b.blocks.length})`);
    return;
  }
  const fa = fingerprint(a), fb = fingerprint(b);
  if (fa !== fb) fail(`singapore: two builds differ structurally (fingerprint ${fa} vs ${fb})`);
  else pass(`determinism: two builds identical (${a.blocks.length} blocks, fingerprint ${fa})`);
}

// Comments are prose, not code. Scanning raw source made this probe fire on the
// file's own header line ("no Math.random, no three.js"), which is the classic
// false positive: a symbol inside a comment or string is not a call site.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// The scene file must stay inside the pure-sim boundary.
function probePureSimBoundary() {
  const src = codeOnly(readFileSync(new URL('../js/voxelscene-singapore.js', import.meta.url), 'utf8'));
  const bad = [];
  if (/Math\.random/.test(src)) bad.push('Math.random (use rng.js — seeded)');
  if (/from\s+['"]three/.test(src) || /require\(['"]three/.test(src)) bad.push('three.js import');
  if (/\bdocument\.|\bwindow\.|\bnavigator\./.test(src)) bad.push('DOM access');
  if (bad.length) fail(`singapore: pure-sim boundary violated — ${bad.join(', ')}`);
  else pass('pure-sim boundary: no Math.random, no three.js, no DOM');
}

// Every name imported from voxelkit must actually be called. Sydney accumulated
// eleven dead imports; the fix there was manual, so this is the standing guard.
function probeNoDeadImports() {
  const src = codeOnly(readFileSync(new URL('../js/voxelscene-singapore.js', import.meta.url), 'utf8'));
  const m = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/voxelkit\.js['"]/);
  if (!m) { pass('dead imports: no voxelkit import block'); return; }
  const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
  const body = src.slice(m.index + m[0].length);
  const dead = names.filter((n) => !new RegExp(`\\b${n}\\s*\\(`).test(body));
  if (dead.length) fail(`singapore: ${dead.length} dead voxelkit import(s) — ${dead.join(', ')}`);
  else pass(`dead imports: all ${names.length} voxelkit imports are called`);
}

import { readFileSync } from 'node:fs';
// The lane-offset modulus guard is SHARED with Auckland rather than copied.
// This file exists because Sydney's section was duplicated inline in the
// orchestrator and the two copies drifted; duplicating a probe here would be
// the same mistake one directory over. See tools/probe-lane-modulus.mjs.
import { probeLaneModulus } from './probe-lane-modulus.mjs';

const SINGAPORE_APRON = {
  scene: 'singapore',
  fileUrl: new URL('../js/voxelscene-singapore.js', import.meta.url),
  marker: '12. PROMENADE APRON (BUDGET CLOSE-OUT)',
  greys: [0x6f6a60, 0x5c574f, 0x7d776c],
  readFile: readFileSync,
};

console.log('--- Validating Singapore Marina Bay ---');
const sim = newSim();
const tops = footprintTops(sim);

probeDeclaredCount(sim);
probeCameraBlockers(sim, tops);
probeCellOwnership(sim);
probePlacementStep(sim);
probeBoundsRect(sim);
probeBlocksInWater(sim);
probePureSimBoundary();
probeNoDeadImports();
probeLaneModulus({ ...SINGAPORE_APRON, sim, fail });
probeIdleStability(sim);
probeDeterminism();
probeWinnable(newSim());

console.log(`\n  singapore sandbox: blocks=${sim.blocks.length} mass=${sim.totalMass.toFixed(0)} blockers=${sim.cameraBlockers.length}`);

if (failures === 0) {
  console.log('ALL PASS.');
} else {
  console.error(`\nFAILED: ${failures} issue(s) detected.`);
  process.exit(1);
}
