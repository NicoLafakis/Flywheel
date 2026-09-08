import assert from 'node:assert/strict';
import { summarizeSteps, attackLabel, countAwake } from './perf-summary.mjs';
assert.equal(countAwake([{ state: 'consumed' }, { state: 'static' },
  { state: 'falling', asleep: true }, { state: 'falling', asleep: false }]), 1);
assert.deepEqual(summarizeSteps([5, 1, 4, 2, 3]), { median: 3, p95: 5, max: 5 });
assert.deepEqual(summarizeSteps([1, 2, 3, 4]), { median: 2.5, p95: 4, max: 4 });
assert.throws(() => summarizeSteps([]));
assert.throws(() => summarizeSteps([NaN]));
assert.match(attackLabel(true, 11), /growing/);
assert.match(attackLabel(false, 11), /pinned.*11/);
console.log('ALL PASS: performance percentiles and workload labels');
