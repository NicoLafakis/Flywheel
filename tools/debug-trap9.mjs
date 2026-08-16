import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
sim.tune.contactBudget = 12;
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;
h.rawMass = 800;

for (const b of sim.blocks) {
  if (b.id === 3858) {
    let internalAsleep = b.asleep;
    Object.defineProperty(b, 'asleep', {
      get() { return internalAsleep; },
      set(val) {
        if (val === true && !internalAsleep) {
          console.log(`Block 3858 asleep = true! Stack:`);
          console.log(new Error().stack);
        }
        internalAsleep = val;
      }
    });
  }
}

for (let i = 0; i < 20 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
}
console.log('Done.');
