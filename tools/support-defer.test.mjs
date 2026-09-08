import assert from 'node:assert/strict';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

for (const every of [1, 2, 3]) {
  const sim = new VoxelSandboxSim({ scene: 'gallery', seed: 'deferred-support' });
  for (let i = 0; i < 10; i++) sim.step(1 / 60, { x: 0, z: 0 });
  sim.tune.supportEvery = every;
  sim._graphDirty = false;
  sim._supportSkipped = 0;
  let changed = true, recalcs = 0;
  sim._coverageChanged = () => { const result = changed; changed = false; return result; };
  sim._recalcSupport = () => { recalcs++; sim._graphDirty = false; };
  for (let tick = 1; tick <= every; tick++) {
    sim.step(1 / 60, { x: 0, z: 0 });
    assert.equal(recalcs, tick === every ? 1 : 0, `coverage change must run by tick ${every}, even after movement stops (tick ${tick})`);
  }
  sim.step(1 / 60, { x: 0, z: 0 });
  assert.equal(recalcs, 1, 'completed work must not keep scheduling support');
  changed = true;
  sim._graphDirty = true;
  sim.step(1 / 60, { x: 0, z: 0 });
  assert.equal(recalcs, 2, 'graph changes must still run immediately');
  assert.equal(sim._supportSkipped, 0);
}

// Real stationary hero attack: LOW used to discard the only coverage change,
// leaving an unsupported building standing indefinitely until the hole moved.
await loadScene('singapore');
const sim = new VoxelSandboxSim({ scene: 'singapore', seed: 'perf' });
Object.assign(sim.tune, { debrisCap: 350, contactBudget: 250, contactRounds: 1, supportEvery: 2 });
for (let i = 0; i < 2; i++) sim.step(1 / 60, { x: 0, z: 0 });
sim.hole.x = 25.428571428571427; sim.hole.z = -0.21428571428571427;
sim.hole.size = 11; sim.hole.sizeFrac = 0;
for (let i = 0; i < 260; i++) sim.step(1 / 60, { x: 0, z: 0 });
assert.ok(sim.hole.eatenCount > 500, `stationary LOW-quality attack must collapse the hero; ate ${sim.hole.eatenCount}`);
console.log(`ALL PASS: deferred support drains while stationary; Singapore LOW ate ${sim.hole.eatenCount}`);
