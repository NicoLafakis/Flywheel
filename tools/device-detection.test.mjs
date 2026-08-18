// tools/device-detection.test.mjs — Automated tests for Device Detection & Device-Relative Controls.
// Run: node tools/device-detection.test.mjs

import assert from 'node:assert';
import { isTouchDevice, getDeviceInputMode } from '../js/device.js';
import { TutorialManager } from '../js/ui/tutorial.js';

export function runDeviceDetectionSelftest() {
  let passed = 0;
  function test(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      throw err;
    }
  }

  // 1. Device Detection Functionality
  test('isTouchDevice and getDeviceInputMode return safe defaults in Node environment', () => {
    assert.strictEqual(typeof isTouchDevice(), 'boolean', 'isTouchDevice must return a boolean');
    const mode = getDeviceInputMode();
    assert(mode === 'touch' || mode === 'keyboard', `getDeviceInputMode must return 'touch' or 'keyboard' (got ${mode})`);
  });

  // 2. Just-In-Time Milestone Onboarding with Device Detection
  test('TutorialManager instantiates with device detection and triggers Start Eating bubble', () => {
    const mockSave = { tutorialCompleted: false, milestones: {} };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });
    assert.strictEqual(tm.isActive(), true);
    assert.strictEqual(tm.hasShown('start'), true);
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('device-detection.test.mjs')) {
  console.log('--- Validating Device Detection & Relative Controls ---');
  const count = runDeviceDetectionSelftest();
  console.log(`\nALL PASS. ${count} device detection tests passing cleanly!`);
}
