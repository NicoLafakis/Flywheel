import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

await loadScene('boston');
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });

let steelCount = 0;
for (const b of sim.blocks) {
  if (b.matType === 'steel') steelCount++;
}
console.log(`Total blocks: ${sim.blocks.length}, steel blocks: ${steelCount}`);
