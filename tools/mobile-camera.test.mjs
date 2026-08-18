// tools/mobile-camera.test.mjs — Unit & contract tests for Adaptive Mobile FOV and High-DPI Resolution.
// Run: node tools/mobile-camera.test.mjs

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIERS, defaultTierForDevice } from '../js/quality.js';

// Extract computeAdaptiveFov directly from js/camera.js source without requiring Three.js in Node
const cameraSrc = readFileSync(new URL('../js/camera.js', import.meta.url), 'utf8');
const matchFovFn = cameraSrc.match(/export function computeAdaptiveFov\([\s\S]*?\n\}/);
if (!matchFovFn) {
  throw new Error('computeAdaptiveFov function not found in js/camera.js');
}

const computeAdaptiveFov = new Function(`${matchFovFn[0].replace('export ', '')}; return computeAdaptiveFov;`)();

export function runMobileCameraSelftest() {
  let p = 0;
  function t(name, fn) {
    fn();
    p++;
  }

  // 1. Adaptive FOV Calculation Contract
  t('computeAdaptiveFov keeps base FOV 45 on landscape screens (aspect >= 1.0)', () => {
    assert.strictEqual(computeAdaptiveFov(16 / 9), 45, '16:9 landscape should be 45 deg FOV');
    assert.strictEqual(computeAdaptiveFov(1.0), 45, '1:1 square should be 45 deg FOV');
    assert.strictEqual(computeAdaptiveFov(2.35), 45, 'Ultrawide should be 45 deg FOV');
  });

  t('computeAdaptiveFov expands vertical FOV on tall mobile portrait screens (aspect < 1.0)', () => {
    // iPhone 14/15/16 Pro portrait aspect is ~393/852 = 0.461
    const iphoneAspect = 393 / 852;
    const fov = computeAdaptiveFov(iphoneAspect);
    assert(fov > 60 && fov <= 80, `iPhone portrait FOV must expand between 60° and 80° (got ${fov.toFixed(1)}°)`);

    // Standard 9:16 portrait (0.5625)
    const stdPortraitFov = computeAdaptiveFov(9 / 16);
    assert(stdPortraitFov > 55 && stdPortraitFov < 75, `9:16 portrait FOV should be ~60°-70° (got ${stdPortraitFov.toFixed(1)}°)`);
    assert(stdPortraitFov < fov, 'Narrower screens should receive proportionally wider vertical FOV compensation');
  });

  // 2. Camera resize hook contract in camera.js
  t('ChaseCamera constructor and resize methods wire computeAdaptiveFov to camera.fov', () => {
    assert(cameraSrc.includes('const fov = computeAdaptiveFov(aspect);'), 'Constructor must compute adaptive FOV');
    assert(cameraSrc.includes('this.camera.fov = computeAdaptiveFov(aspect);'), 'Resize must update camera.fov with adaptive FOV');
    assert(cameraSrc.includes('this.camera.updateProjectionMatrix();'), 'Resize must update projection matrix');
  });

  // 3. Quality & High-DPI Resolution Contract
  t('Quality tiers provide crisp DPR and depth shadows for clear visibility', () => {
    assert(TIERS.high.dpr >= 1.5, 'High tier DPR must be >= 1.5 for crisp rendering');
    assert(TIERS.low.dpr >= 1.5, 'Low/mobile tier DPR must be >= 1.5 to prevent muddy blurriness');
    assert.strictEqual(TIERS.high.shadows, true, 'High tier shadows must be true');
    assert.strictEqual(TIERS.low.shadows, true, 'Low tier shadows must be enabled for 3D depth perception');
    assert.strictEqual(TIERS.low.ambient, true, 'Low tier ambient lighting must be enabled');
  });

  return p;
}

if (process.argv[1] && process.argv[1].endsWith('mobile-camera.test.mjs')) {
  console.log('--- Validating Adaptive Mobile Camera & Clarity System ---');
  const count = runMobileCameraSelftest();
  console.log(`\nALL PASS. ${count} mobile clarity tests passing cleanly!`);
}
