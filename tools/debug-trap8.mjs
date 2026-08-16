import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
sim.tune.contactBudget = 12;
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;
h.rawMass = 800;

let stepIndex = 0;

for (const b of sim.blocks) {
  if (b.id === 3858) {
    let internalY = b.y;
    Object.defineProperty(b, 'y', {
      get() { return internalY; },
      set(val) {
        if (internalY !== val && Math.abs(val - internalY) > 0.0001) {
          console.log(`[Step ${stepIndex}] Block 3858 y changing from ${internalY} to ${val}. Base becoming ${val - b.sy / 2}. Stack:`);
          console.log(new Error().stack);
        }
        internalY = val;
      }
    });

    let internalAsleep = b.asleep;
    Object.defineProperty(b, 'asleep', {
      get() { return internalAsleep; },
      set(val) {
        if (val === true && !internalAsleep) {
          console.log(`[Step ${stepIndex}] Block 3858 asleep = true! Base: ${b.y - b.sy / 2}, _wantSleep: ${b._wantSleep}, _jamReady: ${b._jamReady}, _inContact: ${b._inContact}, _sleepSupport: ${b._sleepSupport}`);
        }
        internalAsleep = val;
      }
    });
  }
}

for (stepIndex = 0; stepIndex < 20 * 60; stepIndex++) {
  sim.step(DT, { x: 0, z: 0 });
}
console.log('Done.');
