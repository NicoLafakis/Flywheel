'use strict';
// T-901 orchestrator: starts its own static server, runs the arms round-robin,
// writes one JSON per run outside the repo, then prints the report.
//
//   node tools/perf/t901.cjs             full reproduction (13 runs, ~75 min)
//   node tools/perf/t901.cjs --smoke     ~3 min self-test of the harness itself
//
// WHY IT IS SHAPED LIKE THIS. Three rules are enforced here rather than left to
// the caller's discipline, because each of them has already produced a wrong
// number in this repo:
//
//   1. ROUND-ROBIN. One rep runs every selected arm once, in order, then the
//      next rep starts. Never all runs of A then all runs of B. A box that
//      warms, throttles, GCs or picks up someone else's work mid-session then
//      contaminates every arm equally instead of landing entirely on whichever
//      arm held the wall clock at the time. A drifting box is the single
//      failure mode that most reliably manufactures a fake result.
//   2. A CONTROL ARM IS NOT OPTIONAL. b1x is the same profile at throttle 1.
//      It is not a target and nobody ships against it; it is the proof that the
//      instrument responds. If 4x and 1x come out the same, the throttle never
//      applied and every number in the run is describing the same thing twice.
//   3. ONE FRESH PROCESS, BROWSER AND PROFILE PER RUN. Each run is a separate
//      `node t901-run.cjs`, so no page state, GPU cache, save slot or leaked
//      timer can carry from one run into the next. A save that survives is how
//      run 2 quietly stops being a first-play device-default-tier run.
//
// Flags:
//   --n=5            runs per primary arm (a4x, b1x)
//   --fallback-n=3   runs for the contactRounds:1 fallback arm (c4xcr1)
//   --arms=a4x,b1x   which arms to run (default all three)
//   --port=8791      static server port
//   --out-dir=DIR    where the per-run JSON goes (default: OS temp, see below)
//   --max-wait=SEC   per-run wall-clock ceiling (default per arm)
//   --smoke          n=1, every arm truncated at 900 ticks. NOT a measurement:
//                    it proves the harness runs end to end, nothing else.
//   --headed         watch the drive

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { parseArgs, startStaticServer, gitHead } = require('./lib.cjs');

const args = parseArgs(process.argv.slice(2));
const SMOKE = !!args.smoke;
const PORT = Number(args.port || 8791);

// Arms, in round-robin order. label prefix -> instrument settings.
// a4x is the T-901 reference profile; b1x is the control; c4xcr1 is T-901's
// own predeclared fallback branch (a runtime override, no product code changes).
const ARMS = {
  a4x: { throttle: 4, rounds: null, maxWait: 900, desc: 'Pixel 5 @ 4x CPU throttle, shipping ranked tune  [the gate]' },
  b1x: { throttle: 1, rounds: null, maxWait: 400, desc: 'Pixel 5 @ 1x, no throttle  [control arm - instrument validation]' },
  c4xcr1: { throttle: 4, rounds: 1, maxWait: 900, desc: 'Pixel 5 @ 4x with sim.tune.contactRounds=1  [predeclared fallback]' },
};

const selected = (args.arms ? String(args.arms).split(',') : Object.keys(ARMS)).map((s) => s.trim());
for (const a of selected) if (!ARMS[a]) { console.error('unknown arm: ' + a + ' (have: ' + Object.keys(ARMS).join(', ') + ')'); process.exit(2); }

const N = SMOKE ? 1 : Number(args.n || 5);
const FN = SMOKE ? 1 : Number(args['fallback-n'] || 3);
const countFor = (arm) => (arm === 'c4xcr1' ? FN : N);

// Raw per-run JSON is EVIDENCE, not source, so it never lands in the repo.
// Default: %TEMP%/flywheel-perf/t901-<timestamp>/ (see README.md).
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.resolve(args['out-dir'] || path.join(os.tmpdir(), 'flywheel-perf', 't901-' + stamp));
fs.mkdirSync(OUT_DIR, { recursive: true });

const RUNNER = path.join(__dirname, 't901-run.cjs');
const REPORT = path.join(__dirname, 't901-report.cjs');

function runChild(script, argv) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...argv], { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

(async () => {
  console.log('T-901 harness  commit=' + gitHead());
  console.log('  arms      : ' + selected.map((a) => a + ' x' + countFor(a)).join(', '));
  for (const a of selected) console.log('              ' + a.padEnd(8) + ARMS[a].desc);
  console.log('  output    : ' + OUT_DIR);
  if (SMOKE) {
    console.log('  MODE      : SMOKE. Every run stops at 900 ranked ticks and is stamped');
    console.log('              truncated:true. This checks that the harness runs; it is');
    console.log('              NOT a T-901 measurement and must never be quoted as one.');
  } else {
    const mins = Math.round(selected.reduce((t, a) => t + countFor(a) * (ARMS[a].throttle === 4 ? 7 : 2), 0));
    console.log('  estimate  : ~' + mins + ' min. Leave the box alone; other work on this');
    console.log('              machine lands in these numbers.');
  }
  console.log('');

  const server = await startStaticServer({ port: PORT });
  let stopped = false;
  const shutdown = async () => { if (!stopped) { stopped = true; await server.stop(); } };
  process.on('SIGINT', async () => { await shutdown(); process.exit(130); });

  const results = [];
  try {
    const maxReps = Math.max(...selected.map(countFor));
    for (let rep = 1; rep <= maxReps; rep++) {
      for (const arm of selected) {
        if (rep > countFor(arm)) continue;
        const A = ARMS[arm];
        const label = arm + '-' + rep;
        const argv = [
          '--no-serve', '--port=' + PORT, '--server-kind=' + server.kind,
          '--label=' + label,
          '--throttle=' + A.throttle,
          '--out=' + path.join(OUT_DIR, label + '.json'),
          '--max-wait=' + (args['max-wait'] || A.maxWait),
        ];
        if (A.rounds != null) argv.push('--rounds=' + A.rounds);
        if (SMOKE) argv.push('--max-ticks=900');
        if (args.headed) argv.push('--headed');
        if (args.tier) argv.push('--tier=' + args.tier);

        const t0 = Date.now();
        process.stdout.write('[' + new Date().toISOString().slice(11, 19) + '] ' + label + ' ... ');
        let ok = await runChild(RUNNER, argv);
        if (!ok) {
          console.log('  ' + label + ' failed; one retry');
          ok = await runChild(RUNNER, argv);
        }
        results.push({ label, ok, sec: Math.round((Date.now() - t0) / 1000) });
        if (!ok) console.log('  ' + label + ' FAILED twice - continuing, the report will show the gap');
      }
    }
  } finally {
    await shutdown();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log('=== ' + (results.length - failed.length) + '/' + results.length + ' runs complete'
    + (failed.length ? ', FAILED: ' + failed.map((r) => r.label).join(', ') : '') + ' ===');
  console.log('raw JSON: ' + OUT_DIR);
  console.log('');
  await runChild(REPORT, [OUT_DIR]);
  console.log('');
  console.log('re-print this report any time with:');
  console.log('  node tools/perf/t901-report.cjs "' + OUT_DIR + '"');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
