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
  assert.equal(left.length + right.length, sim.blocks.length, 'old Lab geometry removed');
  assert.ok(left.every(p => p.sx === p.sy && p.sy === p.sz), 'voxel city uses cubes only');
  assert.ok(right.some(p => p.sx !== p.sy || p.sy !== p.sz), 'second city uses architectural pieces');
  assert.ok(right.length < left.length * 0.45, 'at least 55% fewer physical pieces');
  assert.ok(sim.blocks.length < 12000, 'compact combined piece budget');
  const volume = ps => ps.reduce((v,p) => v + p.sx*p.sy*p.sz, 0);
  assert.equal(volume(left), volume(right), 'same solid geometry and mass, without filled interiors');
  assert.ok(right.filter(p => p.sx === 0.5 && p.sy === 0.5 && p.sz === 0.5).length >= 100, 'retain small bites');
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
  console.log(`Lab comparison: ${left.length} voxels vs ${right.length} physical pieces (${(100*(1-right.length/left.length)).toFixed(1)}% reduction)`);
}
if (process.argv[1]?.endsWith('lab-comparison.test.mjs')) { validateLabComparison(); console.log('ALL PASS'); }
