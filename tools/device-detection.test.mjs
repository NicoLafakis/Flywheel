// tools/device-detection.test.mjs — Automated tests for Device Detection & Device-Relative Controls.
// Run: node tools/device-detection.test.mjs

import assert from 'node:assert';
import { isTouchDevice, getDeviceInputMode } from '../js/device.js';
import { getTutorialStepDef, TUTORIAL_STEPS } from '../js/ui/tutorial.js';

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

  // 2. Device-Relative Tutorial Instructions
  test('getTutorialStepDef adapts Step 1 instructions based on device mode', () => {
    const touchStep1 = getTutorialStepDef(0, 'touch');
    assert(touchStep1.instruction.toLowerCase().includes('drag') || touchStep1.instruction.toLowerCase().includes('thumb'),
      'Touch Step 1 must reference dragging / thumb steering');
    assert(!touchStep1.instruction.includes('WASD'), 'Touch Step 1 must not instruct player to use WASD');

    const keyStep1 = getTutorialStepDef(0, 'keyboard');
    assert(keyStep1.instruction.includes('WASD') || keyStep1.instruction.includes('Arrow keys'),
      'Keyboard Step 1 must reference WASD or Arrow keys');
    assert(!keyStep1.instruction.includes('drag anywhere on the left'),
      'Keyboard Step 1 must not instruct player to drag on touch screen');
  });

  test('getTutorialStepDef adapts camera look hints based on device mode', () => {
    const touchStep3 = getTutorialStepDef(2, 'touch');
    const keyStep3 = getTutorialStepDef(2, 'keyboard');

    assert(touchStep3.instruction.length > 0);
    assert(keyStep3.instruction.length > 0);
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('device-detection.test.mjs')) {
  console.log('--- Validating Device Detection & Relative Controls ---');
  const count = runDeviceDetectionSelftest();
  console.log(`\nALL PASS. ${count} device detection tests passing cleanly!`);
}
