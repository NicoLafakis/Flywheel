'use strict';
// Aggregates T-901 run JSONs into the per-run table and the per-arm summary
// that .wiki/findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md
// section 3 is built from.
//
// Usage:
//   node tools/perf/t901-report.cjs <dir>            all *.json in a run dir
//   node tools/perf/t901-report.cjs a.json b.json    explicit files
//   ... --json                                       per-run rows as JSON too
//
// THE ESTIMATOR RULE. Median AND min are both printed for every arm, always.
// Frame cost is a floor with one-sided noise - nothing makes the box faster
// than it can run, everything else makes it slower - so min is the honest
// best-case and median is the honest typical. Their RATIO is the tree-quiet
// readout: much above ~1.3 and something else was using the machine, and the
// numbers are not quotable no matter how many runs were collected.

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('./lib.cjs');

const args = parseArgs(process.argv.slice(2));
const inputs = args._;
if (!inputs.length) {
  console.error('usage: node tools/perf/t901-report.cjs <dir | file.json ...> [--json]');
  process.exit(2);
}

const files = [];
for (const i of inputs) {
  const p = path.resolve(i);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.json')) files.push(path.join(p, f));
  } else files.push(p);
}
if (!files.length) { console.error('no run JSON found in ' + inputs.join(', ')); process.exit(2); }

const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const med = (a) => q(a, 0.5);
const num = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : n);
const f1 = (n) => (num(n) === null ? null : +n.toFixed(1));
const f3 = (n) => (num(n) === null ? null : +n.toFixed(3));

function one(file) {
  const o = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dt = o.play.dt, ticks = o.play.ticks;
  const pre = [0];
  for (let i = 0; i < dt.length; i++) pre.push(pre[i] + dt[i]);
  const wall = o.wallMsGateToEnd;
  const simMs = ((o.play.ticksEnd || ticks[ticks.length - 1] || 0) / 60) * 1000;

  // Worst 5-second window of sim/wall. The whole-run ratio is a mean and a mean
  // smears a local stall in proportion to the good frames around it; the worst
  // window is where "unsteerable" actually lives.
  let worstWin = null;
  for (let i = 0, j = 0; i < pre.length - 1; i++) {
    while (j < pre.length - 1 && pre[j] - pre[i] < 5000) j++;
    if (pre[j] - pre[i] < 5000) break;
    const dT = ticks[Math.min(j, ticks.length - 1)] - ticks[Math.min(i, ticks.length - 1)];
    const r = ((dT / 60) * 1000) / (pre[j] - pre[i]);
    if (worstWin === null || r < worstWin) worstWin = r;
  }

  // The 60 s truncation used to evaluate ADR-0016's shorter-run fallback:
  // frames up to the first frame at tick >= 3600.
  let k = ticks.findIndex((t) => t >= 3600);
  if (k < 0) k = ticks.length - 1;
  const dt60 = dt.slice(0, Math.max(k, 0));
  const wall60 = pre[Math.min(Math.max(k, 0), pre.length - 1)];
  const over = (a, t) => a.filter((d) => d > t).length;
  const pct = (a, t) => (a.length ? f1((100 * over(a, t)) / a.length) : null);

  return {
    file: path.basename(file),
    label: o.label, throttle: o.throttle, tier: o.levers.tier,
    contactRounds: o.levers.contactRounds, maxSubSteps: o.levers.maxSubSteps, dpr: o.levers.dpr,
    commit: o.commit || null, gl: o.gl, serverKind: o.serverKind || null,
    coldMs: f1(o.coldLoad.interactiveMs), buildMs: o.buildMs, requests: o.coldLoad.requests,
    kb: Math.round(o.coldLoad.transferredBytes / 1024),
    frames: dt.length, fps: f1(dt.length / (wall / 1000)),
    median: f1(med(dt)), p95: f1(q(dt, 0.95)), p99: f1(q(dt, 0.99)),
    worst: dt.length ? f1(Math.max(...dt)) : null,
    over33: over(dt, 33), over33pct: pct(dt, 33),
    over50: over(dt, 50), over50pct: pct(dt, 50),
    over100pct: pct(dt, 100),
    wallSec: f1(wall / 1000), simSec: f1(simMs / 1000), simPerWall: f3(simMs / wall),
    worst5s: f3(worstWin),
    seg60_wallSec: f1(wall60 / 1000), seg60_median: f1(med(dt60)), seg60_p95: f1(q(dt60, 0.95)),
    seg60_simPerWall: wall60 ? f3(((3600 / 60) * 1000) / wall60) : null,
    ticksEnd: o.play.ticksEnd, distM: Math.round(o.play.dist), massEnd: Math.round(o.play.massEnd),
    sizeEnd: o.play.sizeEnd, results: o.end.hasResultsHeading,
    traceB: (() => {
      const m = /([\d,]+) B trace saved/.exec(o.end.screenText || '');
      return m ? Number(m[1].replace(/,/g, '')) : null;
    })(),
    rankStatus: /SAVED . NOT RANKED/.test(o.end.screenText || '') ? 'saved-not-ranked' : 'other',
    timedOut: o.timedOut, truncated: !!o.truncated, errs: (o.pageErrors || []).length,
  };
}

const rows = files.map(one);

// ------------------------------------------------------------- output ----

const TABLE_COLS = [
  ['label', 9], ['thr', 4], ['cr', 3], ['cold_ms', 8], ['build_s', 8],
  ['med', 7], ['p95', 7], ['p99', 7], ['worst', 6], ['>33%', 6], ['>50%', 6],
  ['wall_s', 7], ['sim/wall', 9], ['ticks', 6], ['dist_m', 7], ['mass', 6],
  ['results', 8], ['reqs', 5], ['KB', 5],
];
const pad = (v, w) => String(v === null || v === undefined ? '-' : v).padStart(w);
console.log(TABLE_COLS.map(([n, w]) => pad(n, w)).join(' |'));
for (const r of rows) {
  console.log([
    [r.label, 9], [r.throttle + 'x', 4], [r.contactRounds, 3], [Math.round(r.coldMs), 8],
    [(r.buildMs / 1000).toFixed(1), 8], [r.median, 7], [r.p95, 7], [r.p99, 7],
    [r.worst === null ? null : Math.round(r.worst), 6], [r.over33pct, 6], [r.over50pct, 6],
    [r.wallSec, 7], [r.simPerWall, 9], [r.ticksEnd, 6], [r.distM, 7], [r.massEnd, 6],
    [r.results ? 'yes' : 'NO', 8], [r.requests, 5], [r.kb, 5],
  ].map(([v, w]) => pad(v, w)).join(' |') + (r.truncated ? '  TRUNCATED' : '') + (r.timedOut ? '  TIMEDOUT' : ''));
}

// Arms are keyed by the two things that define one: the throttle rate and the
// contactRounds the sim actually ran with.
const groups = {};
for (const r of rows) {
  const k = r.throttle + 'x/cr' + r.contactRounds;
  (groups[k] = groups[k] || []).push(r);
}

console.log('');
console.log('=== ARM SUMMARY (median across runs; min and max in the object) ===');
const problems = [];
for (const [k, g] of Object.entries(groups)) {
  const col = (f) => g.map(f).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const ff = (v) => (v === null || v === undefined ? null : (Math.abs(v) < 3 ? f3(v) : f1(v)));
  const s = (f) => {
    const c = col(f);
    if (!c.length) return null;
    return { median: ff(med(c)), min: ff(Math.min(...c)), max: ff(Math.max(...c)) };
  };
  const frameMedian = s((r) => r.median);
  console.log(k, JSON.stringify({
    n: g.length,
    frameMedian, p95: s((r) => r.p95), p99: s((r) => r.p99), worst: s((r) => r.worst),
    over33pct: s((r) => r.over33pct), over50pct: s((r) => r.over50pct), over100pct: s((r) => r.over100pct),
    fps: s((r) => r.fps), wallSec: s((r) => r.wallSec), simPerWall: s((r) => r.simPerWall),
    worst5s: s((r) => r.worst5s), coldMs: s((r) => r.coldMs), buildMs: s((r) => r.buildMs),
    seg60_simPerWall: s((r) => r.seg60_simPerWall), seg60_median: s((r) => r.seg60_median),
    seg60_p95: s((r) => r.seg60_p95),
    distM: s((r) => r.distM), massEnd: s((r) => r.massEnd), traceB: s((r) => r.traceB),
  }));
  if (g.length < 5) problems.push(k + ': n=' + g.length + ', below the 5-run minimum');
  if (g.some((r) => r.truncated)) problems.push(k + ': contains a --max-ticks smoke run');
  if (g.some((r) => r.timedOut)) problems.push(k + ': contains a run that hit --max-wait');
  if (g.some((r) => r.errs)) problems.push(k + ': page errors in ' + g.filter((r) => r.errs).length + ' run(s)');
  if (g.some((r) => /SwiftShader/i.test(r.gl || ''))) problems.push(k + ': SwiftShader, not a real GPU');
  if (frameMedian && frameMedian.min > 0) {
    const noise = frameMedian.median / frameMedian.min;
    console.log('   box-noise readout (median/min of the per-run frame medians): ' + noise.toFixed(2)
      + (noise > 1.3 ? '  <- above 1.3: the box was busy, treat these as indicative only' : ''));
  }
}

console.log('');
if (problems.length) {
  console.log('=== NOT QUOTABLE ===');
  for (const p of problems) console.log('  - ' + p);
  console.log('  A single timing on a busy box is not a measurement. Re-run with');
  console.log('  n>=5 per arm on a quiet tree before any number here is quoted.');
} else {
  console.log('=== quotable: every arm has n>=5, no truncation, no timeouts, no page errors ===');
}

// Instrument validation. A probe that has only ever printed one value has not
// been shown to respond to anything. The unthrottled control arm is the check:
// if 4x and 1x are indistinguishable, the throttle never applied and every
// number above is describing the same thing twice.
//
// It is checked on THREE readouts, not one, because the frame median is parked
// on a clamp. The emulated profile is vsync-locked, so a median can sit at
// 16.7 ms on both arms whenever the run is short enough that debris has not yet
// accumulated - the 4x cost is cumulative, not constant (finding section 4.4).
// A metric resting against its own floor cannot falsify anything, so p95, the
// >33 ms share and sim/wall carry the check with it.
const a = groups['4x/cr2'], b = groups['1x/cr2'];
if (a && b) {
  const m = (g, f) => med(g.map(f).filter((v) => v !== null && v !== undefined));
  const r = (f) => m(a, f) / m(b, f);
  const rMed = r((x) => x.median), rP95 = r((x) => x.p95);
  const rSim = m(b, (x) => x.simPerWall) / m(a, (x) => x.simPerWall);
  console.log('');
  console.log('=== instrument check (4x vs 1x control) ===');
  console.log('  frame median 4x/1x : ' + rMed.toFixed(2) + 'x'
    + (rMed < 1.5 ? '   (parked on the 16.7 ms vsync floor - expected on a short run)' : ''));
  console.log('  frame p95    4x/1x : ' + rP95.toFixed(2) + 'x');
  console.log('  >33 ms share       : ' + m(a, (x) => x.over33pct).toFixed(1) + '% vs ' + m(b, (x) => x.over33pct).toFixed(1) + '%');
  console.log('  sim/wall 1x over 4x: ' + rSim.toFixed(2) + 'x   (4x=' + m(a, (x) => x.simPerWall).toFixed(3)
    + ', 1x=' + m(b, (x) => x.simPerWall).toFixed(3) + ')');
  if (rMed < 1.5 && rP95 < 1.5 && rSim < 1.5) {
    console.log('  WARNING: no readout separates the arms. The CPU throttle probably never');
    console.log('  applied. Suspect the instrument before you believe anything about the code.');
  }
}

if (args.json) {
  console.log('');
  console.log(JSON.stringify(rows, null, 1));
}
