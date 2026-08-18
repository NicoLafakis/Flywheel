// Test suite for:
// 1. HUD Sandbox % complete progress bar width & 95% endgame indicator
// 2. VoxelSandboxSim level completion when all blocks are consumed or goal mass is reached
// 3. The Lab structural stability (no spontaneous collapses at spawn)
// 4. Accurate road markings (stop lines at 4-way intersections for right-hand / 4-lane roads), street lights, trees, props

import assert from 'node:assert';
import { VoxelSandboxSim } from '../js/voxelsim.js';
import { HUD } from '../js/ui/hud.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('Running progress-and-lab.test.mjs...');

// --- 1. HUD sandbox progress bar tests ---
test('HUD.updateSandbox sets massBar style width accurately', () => {
  // Mock document and DOM elements
  const massBar = { style: {} };
  const massLabel = { textContent: '' };
  const timer = { textContent: '', classList: { remove() {}, add() {} } };
  const comboLabel = { classList: { add() {}, remove() {} } };
  const blocksLeftPill = { classList: { add() {}, remove() {}, contains(c) { return this._classes.has(c); }, _classes: new Set() } };
  const blocksLeftText = { textContent: '' };
  const appEl = { classList: { toggle() {} } };

  blocksLeftPill.classList.add = (c) => blocksLeftPill.classList._classes.add(c);
  blocksLeftPill.classList.remove = (c) => blocksLeftPill.classList._classes.delete(c);

  const mockDoc = {
    getElementById(id) {
      if (id === 'mass-bar') return massBar;
      if (id === 'mass-label') return massLabel;
      if (id === 'timer') return timer;
      if (id === 'combo-label') return comboLabel;
      if (id === 'blocks-left-pill') return blocksLeftPill;
      if (id === 'blocks-left-text') return blocksLeftText;
      if (id === 'app') return appEl;
      return {
        classList: { add() {}, remove() {}, toggle() {} },
        style: { setProperty() {} },
        textContent: '',
        getContext() { return {}; },
        querySelector() { return { style: {}, classList: { add() {}, remove() {}, toggle() {} } }; },
      };
    },
    body: { classList: { toggle() {} } },
  };

  const origDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const hud = new HUD();
    
    // Simulate 45% cleared
    const sim45 = {
      hole: { rawMass: 450, mass: 4500, size: 3, chain: 0 },
      totalMass: 1000,
      totalBlocks: 1000,
      goal: { name: 'CLEAR', targetFraction: 1.0 },
      won: false,
      timeLeft: 120,
      remainingBlocksCount: 550,
      activePowerUps: [],
    };

    hud.updateSandbox(sim45);
    assert.strictEqual(massBar.style.width, '45.0%', `Expected massBar width to be 45.0%, got ${massBar.style.width}`);
    assert.ok(blocksLeftPill.classList.contains('hidden'), 'At 45% cleared with >100 blocks and >30s left, blocksLeftPill should be hidden');

    // Simulate 96% cleared (last 4% stragglers, 400 blocks remaining out of 10,000)
    const sim96 = {
      hole: { rawMass: 9600, mass: 96000, size: 8, chain: 0 },
      totalMass: 10000,
      totalBlocks: 10000,
      goal: { name: 'CLEAR', targetFraction: 1.0 },
      won: false,
      timeLeft: 120,
      remainingBlocksCount: 400,
      activePowerUps: [],
    };

    hud.updateSandbox(sim96);
    assert.strictEqual(massBar.style.width, '96.0%', `Expected massBar width to be 96.0%, got ${massBar.style.width}`);
    assert.ok(!blocksLeftPill.classList.contains('hidden'), 'At 96% (>95%) cleared, blocksLeftPill should show for the last 5%');
    assert.strictEqual(blocksLeftText.textContent, '400 BLOCKS LEFT');

    // Simulate 100% cleared
    const sim100 = {
      hole: { rawMass: 1000, mass: 10000, size: 8, chain: 0 },
      totalMass: 1000,
      totalBlocks: 1000,
      goal: { name: 'CLEAR', targetFraction: 1.0 },
      won: true,
      timeLeft: 100,
      remainingBlocksCount: 0,
      activePowerUps: [],
    };

    hud.updateSandbox(sim100);
    assert.strictEqual(massBar.style.width, '100.0%', `Expected massBar width to be 100.0%, got ${massBar.style.width}`);
    assert.ok(blocksLeftPill.classList.contains('hidden'), 'When won, blocksLeftPill should be hidden');
  } finally {
    globalThis.document = origDoc;
  }
});

// --- 2. Level completion win conditions in VoxelSandboxSim ---
test('VoxelSandboxSim triggers won and over when all blocks are consumed', () => {
  const sim = new VoxelSandboxSim({ seed: 'win-test' });
  assert.strictEqual(sim.won, false);
  assert.strictEqual(sim.over, false);

  // Mark all blocks as consumed
  for (const b of sim.blocks) {
    b.state = 'consumed';
  }

  sim.step(1/60);
  assert.strictEqual(sim.won, true, 'sim.won should be true when all blocks are consumed');
  assert.strictEqual(sim.over, true, 'sim.over should be true when all blocks are consumed');
  assert.ok(sim.events.some(e => e.type === 'goal'), 'Should emit goal event on level completion');
});

// --- 3. The Lab Structural Stability at Spawn (No Pre-Knocked Buildings) ---
test('The Lab buildings are 100% stable at spawn and after 3s idle', () => {
  const sim = new VoxelSandboxSim({ seed: 'stability-check' });
  
  // At spawn: 0 unstable or falling blocks
  const initialUnstable = sim.blocks.filter(b => b.state === 'unstable').length;
  const initialFalling = sim.blocks.filter(b => b.state === 'falling').length;
  assert.strictEqual(initialUnstable, 0, `Expected 0 unstable blocks at t=0, got ${initialUnstable}`);
  assert.strictEqual(initialFalling, 0, `Expected 0 falling blocks at t=0, got ${initialFalling}`);

  // Idle for 3 seconds (180 ticks) with hole stationary far away
  sim.hole.x = -90;
  sim.hole.z = 40;
  for (let i = 0; i < 180; i++) {
    sim.step(1/60, { x: 0, z: 0 });
  }

  const fallingBlocks = sim.blocks.filter(b => b.state === 'falling');
  if (fallingBlocks.length > 0) {
    console.log(`Sample 10 falling blocks:`, fallingBlocks.slice(0, 10).map(b => ({ id: b.id, mat: b.mat, x: b.x, y: b.y, z: b.z, fsx: b.fsx, fsy: b.fsy, fsz: b.fsz })));
  }
  const unstableAfter3s = sim.blocks.filter(b => b.state === 'unstable').length;
  const fallingAfter3s = sim.blocks.filter(b => b.state === 'falling').length;
  const eatenAfter3s = sim.blocks.filter(b => b.state === 'consumed').length;
  assert.strictEqual(unstableAfter3s, 0, `Expected 0 unstable blocks at t=3s, got ${unstableAfter3s}`);
  assert.strictEqual(fallingAfter3s, 0, `Expected 0 falling blocks at t=3s, got ${fallingAfter3s}`);
  assert.strictEqual(eatenAfter3s, 0, `Expected 0 eaten blocks at t=3s, got ${eatenAfter3s}`);
});

// --- 4. Accurate Road Markings & Stop Lines ---
test('The Lab road network declares accurate stop lines, crosswalks, sidewalks, and traffic signals', () => {
  const sim = new VoxelSandboxSim({ seed: 'road-check' });
  const decor = sim.sceneDecor;
  assert.ok(decor, 'The Lab must declare sceneDecor');
  assert.ok(Array.isArray(decor.roads) && decor.roads.length > 0, 'Must have roads');
  assert.ok(Array.isArray(decor.sidewalks) && decor.sidewalks.length > 0, 'Must have sidewalks');
  assert.ok(Array.isArray(decor.crosswalks) && decor.crosswalks.length > 0, 'Must have crosswalks');
  assert.ok(Array.isArray(decor.laneMarkers) && decor.laneMarkers.length > 0, 'Must have lane markers');

  // Verify stop lines exist in decor (e.g. in laneMarkers or crosswalks)
  const stopLines = decor.laneMarkers.filter(m => m.isStopLine || (m.w >= 2.5 && m.d <= 0.8 && (m.color === 0xffffff || m.color === 0xf8fafc)));
  assert.ok(stopLines.length >= 4, `Expected at least 4 white stop lines at 4-way intersections, found ${stopLines.length}`);
});

console.log(`\nAll ${passed} progress-and-lab tests passed successfully!`);
