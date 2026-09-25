// "Blocks remaining" is a running count on the sim, not a per-frame rescan.
//
// PERF-2026-09-25-framerate: `sim.remainingBlocksCount` was read by the HUD and
// the world but never assigned, so both fell back to filtering every block
// every frame (two 22k-35k arrays per frame, 1.8-2.7 ms of HUD time, and the
// likely main feeder of the GC drops). Display-only: nothing in the sim reads
// the count, so it cannot move a trajectory.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

const standing = (sim) => sim.blocks.filter((b) => b.state !== 'consumed' && b.state !== 'eaten').length;

await loadScene('brooklyn');
const sim = new VoxelSandboxSim({ scene: 'brooklyn', seed: 'count' });
assert.equal(sim.remainingBlocksCount, sim.blocks.length, 'count starts at the full block list');
const h = sim.hole;
h.size = 9; h.sizeFrac = 0;
let checks = 0;
for (let i = 0; i < 600; i++) {
  const a = i / 60 * 0.7;
  sim.step(1 / 60, { x: Math.cos(a), z: Math.sin(2 * a) });
  if (i % 50 === 0) { assert.equal(sim.remainingBlocksCount, standing(sim), `step ${i}`); checks++; }
}
const eaten = sim.blocks.length - sim.remainingBlocksCount;
assert.ok(eaten > 50, `scenario must eat something (${eaten})`);
assert.equal(sim.remainingBlocksCount, standing(sim), 'count matches a full rescan after play');

// A repeat consume of the same block must not count twice.
const done = sim.blocks.find((b) => b.state === 'consumed');
const before = sim.remainingBlocksCount;
sim._consume(done, sim.hole, false);
assert.equal(sim.remainingBlocksCount, before, 'consuming an already-consumed block leaves the count alone');

// Neither per-frame reader may rescan the block list for it any more.
for (const f of ['js/ui/hud.js', 'js/voxelworld.js']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.ok(!/blocks\.filter\(\(b\) => b\.state !== '(eaten|consumed)'/.test(src), `${f} still rescans every block for the remaining count`);
}
console.log(`remaining-count: passed (${checks} checkpoints, ${eaten} eaten)`);
