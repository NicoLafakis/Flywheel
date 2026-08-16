import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');

const DT = 1 / 60;
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
sim.tune.contactBudget = 12;
const h = sim.hole;
h.x = -96; h.z = -56; h.radius = 3.2;
h.rawMass = 800;

let targetId = -1;
let lastY = -1;

for (let i = 0; i < 20 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
  for (const b of sim.blocks) {
    if (b.asleep && b.y - b.sy / 2 < b.restTop - 0.01) {
      console.log(`FOUND phantom sleeper! id: ${b.id}, base: ${b.y - b.sy / 2}, restTop: ${b.restTop}`);
      targetId = b.id;
      lastY = b.y;
      break;
    }
  }
  if (targetId !== -1) break;
}
