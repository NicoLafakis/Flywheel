import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
sim.tune.contactBudget = 12;
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;
h.rawMass = 800;

let b3858;
for (const b of sim.blocks) {
  if (b.id === 3858) {
    b3858 = b;
    let internalY = b.y;
    Object.defineProperty(b, 'y', {
      get() { return internalY; },
      set(val) {
        if (internalY !== val && Math.abs(val - internalY) > 0.0001) {
          console.log(`Block 3858 y changing from ${internalY} to ${val}. Base becoming ${val - b.sy / 2}. Stack:`);
          console.log(new Error().stack);
        }
        internalY = val;
      }
    });
  }
}

for (let i = 0; i < 20 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
}
console.log('Done.');
