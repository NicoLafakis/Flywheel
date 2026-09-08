import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __freshSave, recordSandboxResult } from '../js/save.js';
const save = __freshSave();
recordSandboxResult(save, 'gallery', { coinsEarned: 0, size: 7, elapsed: 10 });
assert.equal(save.sandbox.gallery.bestSize, 7, 'first result must retain attained size');
for (const damaged of [undefined, null, NaN]) {
  save.sandbox.gallery.bestSize = damaged;
  recordSandboxResult(save, 'gallery', { coinsEarned: 0, size: 9, elapsed: 10 });
  assert.equal(save.sandbox.gallery.bestSize, 9, 'repair legacy missing/null size on next result');
}
recordSandboxResult(save, 'gallery', { coinsEarned: 0, elapsed: 10 });
assert.equal(save.sandbox.gallery.bestSize, 9, 'missing size must not poison a valid record');
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const call = main.match(/recordSandboxResult\(save, finished\.scene, \{[\s\S]*?\n      \}\);/);
assert.ok(call, 'execute the actual results callback payload');
let payload;
new Function('recordSandboxResult', 'save', 'finished', 'coins', call[0])(
  (_save, _scene, value) => { payload = value; }, {},
  { scene: 'gallery', time: 10, won: false, totalMass: 100, hole: { size: 12, bestCombo: 1, mass: 10, rawMass: 10 } }, 0,
);
assert.equal(payload.size, 12, 'results caller must supply attained size');
console.log('ALL PASS: sandbox bestSize persistence and results caller');
