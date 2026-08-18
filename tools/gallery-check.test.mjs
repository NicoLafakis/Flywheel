import assert from 'node:assert';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import { CITY_CATALOG } from '../js/citycatalog.js';

await loadScene('gallery');
const sim = new VoxelSandboxSim({ scene: 'gallery', seed: 'test-lab' });

console.log('Total blocks in The Lab:', sim.blocks.length);
console.log('Total mass in The Lab:', sim.totalMass);

assert.ok(sim.blocks.length > 0, 'The Lab should have blocks');
assert.ok(sim.totalMass > 0, 'The Lab should have mass');

// Test eating a small block vs large block and point scaling
const h = sim.hole;
const initialScore = h.mass;
const initialRaw = h.rawMass;

// Eat the first block
const b1 = sim.blocks[0];
sim._consume(b1, h);

assert.ok(h.mass > initialScore, 'Score must increase upon eating');
assert.ok(h.rawMass > initialRaw, 'Raw mass must increase upon eating');
assert.ok(h.mass >= h.chain * 10, `Score (${h.mass}) must be >= chain * 10 (${h.chain * 10})`);

console.log(`Eat 1 block: chain=${h.chain}, score(h.mass)=${h.mass}, rawMass=${h.rawMass}`);

console.log('Gallery test passed successfully!');
