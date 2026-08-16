// TDD Unit Test: 6-Player Multi-Hole City Simulation & PvP Hole Eating (Level 1: The Lab)
import assert from 'node:assert/strict';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

console.log('Testing 6-player multi-hole simulation on Level 1 (The Lab)...');

// 1. Ensure The Lab (gallery) scene is loaded
await loadScene('gallery');

// 2. Instantiate 6-player simulation on gallery
const sim = new VoxelSandboxSim('gallery', {
  seed: 42,
  holes: [
    { slot: 0, name: 'Host', skin: 'default', color: '#00f0ff', x: 0, z: 0 },
    { slot: 1, name: 'P2', skin: 'cosmic', color: '#ff0054', x: 10, z: 0 },
    { slot: 2, name: 'P3', skin: 'gold', color: '#ffd23f', x: 0, z: 10 },
    { slot: 3, name: 'P4', skin: 'emerald', color: '#06d6a0', x: -10, z: 0 },
    { slot: 4, name: 'P5', skin: 'violet', color: '#9d4edd', x: 0, z: -10 },
    { slot: 5, name: 'P6', skin: 'blaze', color: '#ff9f1c', x: 7, z: 7 },
  ],
});

assert.equal(sim.holes.length, 6, 'Must initialize exactly 6 active player holes');
for (let i = 0; i < 6; i++) {
  assert.equal(sim.holes[i].slot, i);
  assert.ok(sim.holes[i].radius > 0);
  assert.equal(sim.holes[i].alive, true);
  assert.equal(sim.holes[i].respawnTimer, 0);
}

// 3. Step the simulation forward - verifies all 6 holes move and eat without error
for (let t = 0; t < 60; t++) {
  sim.step(1 / 60);
}

// 4. Test PvP hole-on-hole eating:
// Set Hole 0 to be significantly larger than Hole 1
sim.holes[0].radius = 4.0;
sim.holes[0].mass = 2000;
sim.holes[0].x = 5.0;
sim.holes[0].z = 5.0;

sim.holes[1].radius = 1.5;
sim.holes[1].mass = 300;
sim.holes[1].x = 5.2;
sim.holes[1].z = 5.2; // Overlapping Hole 0!

// Step simulation to trigger PvP collision detection
let pvpEvents = [];
sim.onPvPKill = (event) => { pvpEvents.push(event); };

sim.step(1 / 60);

// Hole 0 should eat Hole 1
assert.equal(sim.holes[1].alive, false, 'Smaller hole must be flagged not alive when eaten');
assert.ok(sim.holes[1].respawnTimer > 0, 'Smaller hole must have respawn penalty timer set');
assert.equal(sim.holes[1].respawnTimer, 10.0, 'Respawn penalty must be exactly 10.0 seconds');

// 5. Test 10s Respawn Countdown:
// Step for 9 seconds (540 ticks) -> Hole 1 should STILL be paused / dead
for (let t = 0; t < 540; t++) {
  sim.step(1 / 60);
}
assert.equal(sim.holes[1].alive, false, 'After 9s, eaten hole must still be paused');
assert.ok(sim.holes[1].respawnTimer <= 1.1 && sim.holes[1].respawnTimer > 0);

// Step remaining 1.1 seconds (70 ticks) -> Hole 1 should respawn!
for (let t = 0; t < 70; t++) {
  sim.step(1 / 60);
}
assert.equal(sim.holes[1].alive, true, 'After 10s, eaten hole must respawn alive');
assert.equal(sim.holes[1].respawnTimer, 0);

console.log('✓ 6-Player multi-hole & PvP simulation test PASSED');
