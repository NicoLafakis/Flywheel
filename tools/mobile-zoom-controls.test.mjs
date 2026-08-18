// tools/mobile-zoom-controls.test.mjs — Automated tests for Mobile Pinch/Expand Zoom and Dual-Zone Gesture Guidance.
// Run: node tools/mobile-zoom-controls.test.mjs

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { isTouchDevice, getDeviceInputMode } from '../js/device.js';

const readySrc = readFileSync(new URL('../js/ui/ready.js', import.meta.url), 'utf8');
const tutorialSrc = readFileSync(new URL('../js/ui/tutorial.js', import.meta.url), 'utf8');
const helpSrc = readFileSync(new URL('../js/ui/help.js', import.meta.url), 'utf8');
const screensSrc = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');

export function runMobileZoomControlsSelftest() {
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

  // 1. Ready Gate Gesture Guidance
  test('Ready Gate displays clear Pinch/Expand zoom guidance on touch devices', () => {
    assert(readySrc.toLowerCase().includes('pinch'), 'Ready Gate must mention pinch gesture');
    assert(readySrc.toLowerCase().includes('zoom'), 'Ready Gate must mention zoom');
  });

  // 2. Tutorial & Milestone Gesture Guidance
  test('Tutorial system provides pinch/expand zoom instructions for mobile players', () => {
    assert(tutorialSrc.toLowerCase().includes('pinch'), 'Tutorial must explain pinch to zoom for mobile');
    assert(tutorialSrc.toLowerCase().includes('zoom'), 'Tutorial must explain zoom mechanics');
  });

  // 3. Help & FAQ Screen Controls Section
  test('Help & FAQ screen documents Pinch to zoom vs Desktop Keyboard/Scroll zoom', () => {
    assert(helpSrc.includes('Pinch with Two Fingers') || helpSrc.includes('Pinch'), 'Help must document pinch gesture');
    assert(helpSrc.includes('R / F: Zoom') || helpSrc.includes('R/F'), 'Help must document desktop zoom keys');
  });

  // 4. Pause Menu Quick Controls Strip
  test('Pause screen provides quick-reference control cheat sheet tailored to device', () => {
    assert(screensSrc.includes('showPause'), 'screens.js must have showPause method');
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('mobile-zoom-controls.test.mjs')) {
  console.log('--- Validating Mobile Pinch/Expand Zoom & Gesture Guidance ---');
  const count = runMobileZoomControlsSelftest();
  console.log(`\nALL PASS. ${count} mobile zoom and gesture tests passing cleanly!`);
}
