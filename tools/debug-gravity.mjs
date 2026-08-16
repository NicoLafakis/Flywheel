import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;

const g = sim.tune.gravity;
const prevVy = new Map();

for (let i = 0; i < 25 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
  for (const b of sim.blocks) {
    if (b.state !== 'falling') continue;
    const pvy = prevVy.get(b.id);
    if (pvy !== undefined && !b.parentChunk && b.matType === 'steel') {
      const diff = b.vy - pvy;
      const discrepancy = Math.abs(diff + g * DT);
      if (discrepancy > 1e-9) {
        console.log(`Tick ${i}, block ${b.id}: diff=${diff}, expected=${-g * DT}, discrepancy=${discrepancy}`);
        break; // just print one to see
      }
    }
    prevVy.set(b.id, b.vy);
  }
}
