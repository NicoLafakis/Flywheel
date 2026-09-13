import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoxelSandboxSim } from '../js/voxelsim.js';
import { driveRoute } from './route-driver.mjs';

export function validateLabComparison() {
  const sim = new VoxelSandboxSim({ seed: 'lab-comparison' });
  assert.equal(sim.labCities?.length, 2, 'Lab must contain two comparison cities');
  const screens = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');
  assert.match(screens, /PHYSICAL PIECES/, 'city scale must distinguish total pieces from cube voxels');
  const [a, b] = sim.labCities;
  assert.ok(b.minX - a.maxX >= 24, 'cities need at least 24m of clear separation');
  const pieces = c => sim.blocks.slice(c.first, c.end);
  const left = pieces(a), right = pieces(b);
  // The Tokyo prototype district shares the map but not the comparison: it is
  // recorded separately so the parity assertions below stay two-sided.
  const tokyo = sim.labTokyo;
  assert.ok(tokyo && tokyo.first < tokyo.end, 'Lab hosts a Tokyo prototype district');
  const tk = pieces(tokyo);
  assert.equal(left.length + right.length + tk.length, sim.blocks.length, 'old Lab geometry removed');
  assert.ok(left.every(p => p.sx === p.sy && p.sy === p.sz), 'voxel city uses cubes only');
  assert.ok(right.some(p => p.sx !== p.sy || p.sy !== p.sz), 'second city uses architectural pieces');
  assert.ok(right.length < left.length * 0.45, 'at least 55% fewer physical pieces');
  assert.ok(sim.blocks.length < 12000, 'compact combined piece budget');
  const volume = ps => ps.reduce((v,p) => v + p.sx*p.sy*p.sz, 0);
  assert.equal(volume(left), volume(right), 'same solid geometry and mass, without filled interiors');
  assert.ok(right.filter(p => p.sx === 0.5 && p.sy === 0.5 && p.sz === 0.5).length >= 100, 'retain small bites');

  // --- Tokyo prototype district (mixed-geometry sandbox) ---------------------
  assert.ok(
    tokyo.minX >= sim.boundsRect.minX && tokyo.maxX <= sim.boundsRect.maxX &&
    tokyo.minZ >= sim.boundsRect.minZ && tokyo.maxZ <= sim.boundsRect.maxZ,
    'Tokyo district inside play bounds');
  const cityMinZ = Math.min(...left.concat(right).map(p => p.z));
  assert.ok(cityMinZ - Math.max(...tk.map(p => p.z + p.sz)) >= 8, 'Tokyo band keeps clear of the comparison cities');
  assert.ok(tk.some(p => p.sx !== p.sy || p.sy !== p.sz), 'Tokyo district uses architectural pieces');
  assert.ok(tk.filter(p => p.sx === 0.5 && p.sy === 0.5 && p.sz === 0.5).length >= 60, 'Tokyo district keeps granular street food');
  assert.ok(tk.length >= 400 && tk.length <= 2500, `Tokyo district piece budget (found ${tk.length})`);
  const peak = (r) => Math.max(0, ...tk
    .filter(p => p.x < r.maxX && p.x + p.sx > r.minX && p.z < r.maxZ && p.z + p.sz > r.minZ)
    .map(p => p.y + p.sy));
  // Miniatures of Tokyo's five heroes (TOKYO_HEROES in voxelscene-tokyo.js),
  // each pinned by a bounding region and a minimum height.
  const TOKYO_HERO_MINIATURES = [
    { name: 'Tocho Twins', minX: -53, maxX: -37, minZ: -65, maxZ: -57, h: 11 },
    { name: 'Cocoon Tower', minX: -27, maxX: -15, minZ: -66, maxZ: -56, h: 12 },
    { name: 'Kabukicho gate', minX: -7, maxX: 7, minZ: -52, maxZ: -46, h: 5 },
    { name: 'Station viaduct', minX: -56, maxX: 56, minZ: -41, maxZ: -36, h: 3 },
    { name: 'Shibuya 109', minX: 36, maxX: 48, minZ: -67, maxZ: -56, h: 8 },
  ];
  for (const h of TOKYO_HERO_MINIATURES) {
    assert.ok(peak(h) >= h.h, `${h.name} miniature reaches ${h.h} m (peak ${peak(h)})`);
  }
  const cells = c => {
    const out = new Map();
    for (const p of pieces(c)) for(let x=0;x<p.fsx;x++) for(let y=0;y<p.fsy;y++) for(let z=0;z<p.fsz;z++) {
      const k = `${p.gx+x-c.offset*4},${p.gy+y},${p.gz+z}`;
      assert.ok(!out.has(k), 'no overlapping pieces'); out.set(k,p.matType);
    }
    return out;
  };
  assert.deepEqual(cells(a), cells(b), 'matching silhouettes, material placement and volume');
  for(let i=0;i<180;i++) sim.step(1/60, {x:0,z:0});
  assert.equal(sim.blocks.filter(p => p.state !== 'static').length, 0, 'both cities stand at rest');
  // Restart at each entry with identical seed and no upgrades: the second city
  // must be playable without inheriting growth earned in the cube city first.
  for (const city of sim.labCities) {
    const x = city.offset;
    const run = new VoxelSandboxSim({ seed:'lab-equal-route', holes:[{x:x+18,z:16}] });
    driveRoute(run, [
      {until:5,x:x-18,z:12}, {until:10,x:x-14,z:21},
      {until:15,x:x-4,z:-16}, {until:20,x:x+10,z:-16},
    ], 20);
    const eaten = run.blocks.slice(city.first,city.end).filter(p => p.state === 'consumed').length;
    assert.ok(eaten >= 100, `${city.name}: small bites lead into progressive consumption`);
    assert.ok(run.hole.rawMass >= 200 && run.hole.size >= 7, `${city.name}: independently playable from starting size`);
    assert.ok(run.blocks.every(p => Number.isFinite(p.x+p.y+p.z)), 'finite collapse positions');
  }
  // The Tokyo district gets its own route: promenade crates first, then the
  // izakaya lanes. It must grow from starting size like the comparison cities,
  // but its food is small cubes, so the mass bar is scaled to the band's
  // content rather than the cities' buildings.
  const tr = new VoxelSandboxSim({ seed:'lab-tokyo-route', holes:[{x:0,z:-46}] });
  driveRoute(tr, [
    {until:6,x:-16,z:-43.5}, {until:12,x:16,z:-43.5},
    {until:18,x:14,z:-54}, {until:24,x:24,z:-60},
    {until:30,x:9,z:-48}, {until:36,x:23,z:-53},
  ], 36);
  const tEaten = tr.blocks.slice(tokyo.first, tokyo.end).filter(p => p.state === 'consumed').length;
  assert.ok(tEaten >= 100, `Tokyo district: route consumes starter food and bites (${tEaten})`);
  assert.ok(tr.hole.rawMass >= 40 && tr.hole.size >= 4, `Tokyo district: independently playable from starting size (rawMass ${tr.hole.rawMass.toFixed(1)}, SIZE ${tr.hole.size})`);
  console.log(`Lab comparison: ${left.length} voxels vs ${right.length} physical pieces (${(100*(1-right.length/left.length)).toFixed(1)}% reduction); Tokyo prototype: ${tk.length} pieces`);
}
if (process.argv[1]?.endsWith('lab-comparison.test.mjs')) { validateLabComparison(); console.log('ALL PASS'); }
