import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
sim.tune.contactBudget = 12;
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;
h.rawMass = 800;

for (const b of sim.blocks) {
  let internalSS = b._sleepSupport;
  Object.defineProperty(b, '_sleepSupport', {
    get() { return internalSS; },
    set(val) {
      if (val === 0 && Math.abs((b.y - b.sy / 2) - (-0.016584213731399955)) < 0.001) {
        console.error(`_sleepSupport set to 0 while base is -0.016!`);
        console.error(new Error().stack);
        process.exit(1);
      }
      internalSS = val;
    }
  });
}

for (let i = 0; i < 20 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
}
console.log('Done without detecting mismatch.');
