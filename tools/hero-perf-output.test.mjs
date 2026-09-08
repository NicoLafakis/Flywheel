import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['tools/pw/hero-attack-perf.mjs', 'gallery'], {
  encoding: 'utf8', env: { ...process.env, FW_PERF_GROW: '1', FW_PERF_REPS: '1' },
});
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stderr, '', 'successful measurement must not emit errors on stderr');
assert.match(result.stdout, /hole growing from SIZE 11/);
const line = result.stdout.split('\n').find(line => line.startsWith('PERF_JSON '));
assert.ok(line, 'machine-readable step timings and settlement evidence');
const report = JSON.parse(line.slice(10));
assert.equal(report.growing, true);
assert.equal(report.rows.length, 1);
const row = report.rows[0];
assert.equal(row.s, 'gallery');
for (const key of ['median', 'p95', 'max', 'awake', 'settledAwake', 'settledMs']) assert.ok(Number.isFinite(row[key]), key);
assert.ok(row.p95 >= row.median && row.max >= row.p95);
console.log('ALL PASS: real hero performance output, workload label and settlement metrics');
