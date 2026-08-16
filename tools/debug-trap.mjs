import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
sim.tune.contactBudget = 12;
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;
h.rawMass = 800;

for (const b of sim.blocks) {
  let internalY = b.y;
  Object.defineProperty(b, 'y', {
    get() { return internalY; },
    set(val) {
      if (b.asleep && Math.abs((val - b.sy / 2) - (-0.016584213731399955)) < 0.001) {
        console.error(`b.y modified while asleep! new base: ${val - b.sy / 2}, old: ${internalY - b.sy / 2}`);
        console.error(new Error().stack);
        process.exit(1);
      }
      internalY = val;
    }
  });
}

for (let i = 0; i < 20 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
}
console.log('Done without detecting modification of asleep block.');
