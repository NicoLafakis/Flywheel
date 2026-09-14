import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoxelSandboxSim } from '../js/voxelsim.js';
import { driveRoute } from './route-driver.mjs';

// The Lab IS the Tokyo recreation: the gallery slot builds the city fresh
// under the geometry authoring standard (mixed voxelforms members + deliberate
// cubes), replacing the twin-city comparison retired 2026-09-13. Phase 0 pins
// the Nishi-Shinjuku slice: Tocho twins with identity details, Cocoon Tower,
// articulated supporting towers, designed starter food. Later districts get
// their own assertions as their phases land.
export function validateLabTokyo() {
  const sim = new VoxelSandboxSim({ seed: 'lab-tokyo' });
  assert.equal(sim.scene, 'gallery');
  const screens = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');
  assert.match(screens, /PHYSICAL PIECES/, 'city scale must distinguish total pieces from cube voxels');

  // --- map skeleton ----------------------------------------------------------
  assert.deepEqual(sim.boundsRect, { minX: -110, maxX: 110, minZ: -100, maxZ: 100 },
    'recreation uses the shipped Tokyo bounds');

  // Blocks store CENTER coordinates: plan extents are x ± sx/2, z ± sz/2, and
  // the top of a piece is y + sy/2.
  const lo = (p) => ({ x: p.x - p.sx / 2, z: p.z - p.sz / 2 });
  const hi = (p) => ({ x: p.x + p.sx / 2, z: p.z + p.sz / 2 });
  const inBox = (r) => sim.blocks
    .filter(p => lo(p).x < r.maxX && hi(p).x > r.minX && lo(p).z < r.maxZ && hi(p).z > r.minZ);
  const peak = (r) => Math.max(0, ...inBox(r).map(p => p.y + p.sy / 2));

  // --- Tocho twins: identity, not a grey box ---------------------------------
  const TOCHO_A = { minX: -105, maxX: -95, minZ: -65, maxZ: -53 };
  const TOCHO_B = { minX: -94, maxX: -83, minZ: -65, maxZ: -53 };
  for (const [name, r] of [['Tocho A', TOCHO_A], ['Tocho B', TOCHO_B]]) {
    assert.ok(peak(r) >= 29, `${name} reaches its 30 m storey (peak ${peak(r)})`);
    // Articulation is measurable: the crown storey must have a strictly
    // smaller footprint than the shaft below it.
    const shaft = inBox(r).filter(p => p.y - p.sy / 2 >= 3 && p.y + p.sy / 2 <= 24);
    const crown = inBox(r).filter(p => p.y + p.sy / 2 > 24);
    assert.ok(crown.length > 0, `${name} has a crown storey`);
    const spanX = ps => Math.max(...ps.map(p => hi(p).x)) - Math.min(...ps.map(p => lo(p).x));
    assert.ok(spanX(crown) < spanX(shaft), `${name} crown sets back from the shaft`);
    // Hollow interior: the shaft's slab stack must NOT be a filled column —
    // interior air is the rule, so some horizontal line through mid-shaft
    // crosses more air than masonry.
    const mid = inBox(r).filter(p => p.y + p.sy / 2 > 12 && p.y - p.sy / 2 < 15);
    const wallVol = mid.reduce((v, p) => v + p.sx * p.sy * p.sz, 0);
    assert.ok(wallVol < spanX(shaft) * 7 * 3 * 0.5, `${name} mid-shaft is mostly air`);
  }
  // Skybridges: at least two members crossing the gap between the towers.
  const bridges = sim.blocks.filter(p =>
    p.sx >= 3 && p.y >= 14 && p.y <= 26 && lo(p).x < -92 && hi(p).x > -96 && hi(p).z > -61 && lo(p).z < -53);
  assert.ok(bridges.length >= 2, `twin skybridges link the towers (found ${bridges.length})`);
  // Assembly hall: a low rounded hall between the towers, not more towers.
  const hall = inBox({ minX: -100, maxX: -88, minZ: -56, maxZ: -45 });
  assert.ok(hall.length >= 8 && peak({ minX: -100, maxX: -88, minZ: -56, maxZ: -45 }) <= 9,
    'assembly hall sits low between the towers');

  // --- Cocoon Tower: woven skin, rounded read --------------------------------
  const COCOON = { minX: -60, maxX: -40, minZ: -30, maxZ: -10 };
  assert.ok(peak(COCOON) >= 20, `Cocoon Tower reaches its storey (peak ${peak(COCOON)})`);
  const cocoonPieces = inBox(COCOON);
  assert.ok(cocoonPieces.length >= 60, `cocoon skin is woven facets, not a tube (${cocoonPieces.length} pieces)`);
  assert.ok(new Set(cocoonPieces.map(p => p.color)).size >= 2, 'cocoon skin bands two tones');

  // --- Supporting towers: podium/setback/crown, not slabs --------------------
  const SUPPORTERS = [
    { name: 'supporter S1', minX: -75, maxX: -61, minZ: -88, maxZ: -74, minH: 15 },
    { name: 'supporter S2', minX: -91, maxX: -79, minZ: -36, maxZ: -24, minH: 18 },
    { name: 'supporter S3', minX: -66, maxX: -54, minZ: -50, maxZ: -40, minH: 12 },
  ];
  for (const r of SUPPORTERS) {
    assert.ok(peak(r) >= r.minH, `${r.name} reaches ${r.minH} m (peak ${peak(r)})`);
    const low = inBox(r).filter(p => p.y + p.sy / 2 <= 6);
    const high = inBox(r).filter(p => p.y - p.sy / 2 >= 12);
    const spanX = ps => Math.max(...ps.map(p => hi(p).x)) - Math.min(...ps.map(p => lo(p).x));
    assert.ok(high.length > 0 && spanX(high) <= spanX(low), `${r.name} never widens with height`);
  }

  // --- mixed geometry + budgets ----------------------------------------------
  assert.ok(sim.blocks.some(p => p.sx !== p.sy || p.sy !== p.sz), 'architectural pieces carry the structures');
  assert.ok(sim.blocks.filter(p => p.sx === 0.5 && p.sy === 0.5 && p.sz === 0.5).length >= 200,
    'starter food and street props stay granular cubes');
  assert.ok(sim.blocks.length <= 9000, `phase-0 piece budget (${sim.blocks.length})`);
  // No overlap by construction, verified: fine-cell occupancy is unique.
  const seen = new Map();
  for (const p of sim.blocks) for (let x = 0; x < p.fsx; x++) for (let y = 0; y < p.fsy; y++) for (let z = 0; z < p.fsz; z++) {
    const k = `${p.gx + x},${p.gy + y},${p.gz + z}`;
    assert.ok(!seen.has(k), `overlapping pieces at fine cell ${k}`);
    seen.set(k, p.matType);
  }
  // Idle stability: nothing falls before the player touches anything.
  for (let i = 0; i < 180; i++) sim.step(1 / 60, { x: 0, z: 0 });
  assert.equal(sim.blocks.filter(p => p.state !== 'static').length, 0, 'city stands at rest');

  // --- starter route: spawn esplanade into the ward --------------------------
  const run = new VoxelSandboxSim({ seed: 'lab-tokyo-route' });
  driveRoute(run, [
    { until: 6, x: -10, z: 12 }, { until: 14, x: -45, z: 12 },
    { until: 22, x: -70, z: 0 }, { until: 30, x: -88, z: -35 },
    { until: 38, x: -94, z: -46 },
  ], 38);
  const eaten = run.hole.eatenCount;
  assert.ok(eaten >= 100, `starter route feeds a fresh hole (${eaten} pieces)`);
  assert.ok(run.hole.rawMass >= 40 && run.hole.size >= 4,
    `starter route grows the hole (rawMass ${run.hole.rawMass.toFixed(1)}, SIZE ${run.hole.size})`);

  console.log(`Lab Tokyo (phase 0): ${sim.blocks.length} pieces, Tocho peak ${peak(TOCHO_A).toFixed(1)} m, cocoon peak ${peak(COCOON).toFixed(1)} m`);
}
if (process.argv[1]?.endsWith('lab-tokyo.test.mjs')) { validateLabTokyo(); console.log('ALL PASS'); }
