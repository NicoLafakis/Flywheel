// HIGH caps loose rubble in huge collapses (owner decision 2026-09-25).
//
// HIGH used to leave debrisCap/contactBudget at Infinity, and a big Singapore
// collapse ran at 8.8 FPS (PERF-2026-09-25-framerate). 700/500 was chosen on the
// measured knee (Singapore hero collapse, 240 steps, CPU ms per step):
//   uncapped 168 | 900/700 113 | 700/500 95 | 600/450 88 | LOW 55
// with pieces in the air staying within 8% of uncapped (1,206 -> 1,112 mean),
// so big collapses still look generous. Ranked play is untouched: it replaces
// the tune with the frozen RANKED_TUNE and main.js never writes a locked tune.
import assert from 'node:assert/strict';
import { TIERS } from '../js/quality.js';
import { VoxelSandboxSim, RANKED_TUNE, RANKED_SIM_VERSION, loadScene } from '../js/voxelsim.js';

assert.equal(TIERS.high.debrisCap, 700, 'HIGH debris cap');
assert.equal(TIERS.high.contactBudget, 500, 'HIGH contact budget');
assert.ok(TIERS.high.debrisCap > TIERS.low.debrisCap && TIERS.high.contactBudget > TIERS.low.contactBudget,
  'HIGH stays more generous than LOW');
// The other HIGH physics levers are unchanged.
assert.equal(TIERS.high.contactRounds, 2);
assert.equal(TIERS.high.supportEvery, 1);

// Ranked is its own contract and must not move.
assert.equal(RANKED_SIM_VERSION, 4, 'no ranked version bump');
assert.deepEqual({ ...RANKED_TUNE, gravity: 0, waveK: 0, speed: 0, attract: 0 },
  { gravity: 0, waveK: 0, creak: 0, speed: 0, attract: 0, debrisCap: 280, contactBudget: 200, contactRounds: 2, supportEvery: 1, perfMode: false });
await loadScene('gallery');
const ranked = new VoxelSandboxSim({ scene: 'gallery', mode: 'run90' });
assert.equal(ranked.tuneLocked, true);
assert.equal(ranked.tune.debrisCap, 280);
assert.equal(ranked.tune.contactBudget, 200);
// The validator and a bare sim still run uncapped: the tier is applied by the
// game shell (main.js applyQuality), never by the sim itself.
const free = new VoxelSandboxSim({ scene: 'gallery' });
assert.equal(free.tune.debrisCap, Infinity);
console.log('quality-high-cap: passed');
