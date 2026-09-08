import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./validate.mjs', import.meta.url), 'utf8');
const gates = JSON.parse(readFileSync(new URL('../.sop-gates.json', import.meta.url), 'utf8')).gates;
assert.ok(gates.some(g => g.cmd.join(' ') === 'node tools/validate.mjs' && !g.env?.FW_VALIDATE_SECTIONS),
  'user-required full validator must be an actual gate, not only excluded subsets');
for (const suite of ['ranked-recovery', 'countdown-layout', 'sandbox-size', 'perf-summary', 'hero-perf-output', 'voxel-grid', 'support-query', 'contact-query', 'support-defer', 'grid-sim-parity']) {
  assert.ok(source.includes(`runSuite('tools/${suite}.test.mjs')`), `${suite} must run from the validator`);
}
console.log('ALL PASS: remediation suites wired into validator');
