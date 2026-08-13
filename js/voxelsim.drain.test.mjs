// Headless regression tests for T-402 (the debris drain).
// Run: node js/voxelsim.drain.test.mjs
//
// The defect: a body wedged between an immovable partner and another mover
// reaches a geometric fixed point, `_separate` re-stamps `_inContact` from a
// penetration that never changes, and the sleep commit reads that as
// "mid-overlap" and refuses to retire it — forever. Measured on the validator's
// own Cambridge route: 78 of 101 awake bodies at simT 120 s were stationary to
// within 1 mm, grounded on solid support, and structurally unable to sleep. The
// awake population therefore grew without bound and per-step cost with it.
//
// Covered here:
//   1. the latch fires on a body that has held its position (and ONLY then)
//   2. it never fires on a drifting body, however long it stays in contact
//   3. it never fires on a `_budgetHold` (parked) body, which does not move
//      because it is not integrated — retiring those would let the device-tier
//      contact budget decide what leaves the sim
//   4. it never fires on a body resting on LOOSE support (the hang-in-the-sky
//      guard, RCA-2026-08-11 skyscraper-launch)
//   5. it never fires on a stale `_grounded` claim from a previous step
//   6. end to end: a sustained Cambridge run drains instead of accumulating
//   7. end to end: every sleeping body sits on solid support (static, ground,
//      or another sleeper) — never on a loose one
//   8. end to end: no parked body is ever asleep

import { VoxelSandboxSim, loadScene } from './voxelsim.js';
import { CAMBRIDGE_ROUTE } from './voxelscene-cambridge.js';

await loadScene('cambridge');
await loadScene('boston');

const DT = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// --- 1-5. the latch itself ----------------------------------------------------
// Driven directly, because the point of these is what the latch REFUSES, and a
// refusal is not observable through a whole-scene run: an eligible body that is
// never offered looks exactly like one that was correctly declined.
if (typeof VoxelSandboxSim.prototype._latchJammed !== 'function') {
  fail('_latchJammed is not defined — the jam-retirement path is absent entirely');
} else {
  const sim = new VoxelSandboxSim({ scene: 'gallery' });
  const JAM_STEPS = 30;   // mirrored from voxelsim.js; test 1a fails if it drifts

  const mk = (over = {}) => {
    const b = {
      id: 1, state: 'falling', parentChunk: null, asleep: false,
      _grounded: true, _groundT: sim.time, _looseSup: false, _budgetHold: false,
      vx: 0, vy: 0, vz: 0, x: 10, y: 0.25, z: 10, sx: 0.5, sy: 0.5, sz: 0.5,
      _wantSleep: false, _jamReady: false, _jamSteps: 0,
      ...over,
    };
    return b;
  };
  // `_latchJammed` walks `_falling` and reads `this.time`; hand it one body at a
  // time so a single refusal cannot be masked by another body's success.
  const run = (b, steps, move) => {
    sim._falling = [b];
    for (let i = 0; i < steps; i++) {
      if (move) move(b);
      b._groundT = sim.time;   // "integrated and snapped this step"
      sim._latchJammed();
      if (b._jamReady) return i + 1;
    }
    return 0;
  };

  const still = mk();
  const firedAt = run(still, JAM_STEPS * 3, null);
  if (firedAt !== JAM_STEPS) fail(`a motionless grounded body latched at step ${firedAt || 'never'}, expected exactly ${JAM_STEPS}`);
  else ok(`latch fires on a motionless body at exactly JAM_STEPS (${JAM_STEPS})`);

  const drifting = mk({ id: 2 });
  if (run(drifting, JAM_STEPS * 5, (b) => { b.x += 0.002; }) !== 0) {
    fail('a body drifting 2 mm per step latched — stationarity is not being measured');
  } else ok('a drifting body never latches, over 5x JAM_STEPS');

  // Sub-epsilon creep must not accumulate into a retirement: the drift is
  // measured from the anchor, not step to step.
  const creeping = mk({ id: 3 });
  if (run(creeping, JAM_STEPS * 5, (b) => { b.x += 0.0002; }) !== 0) {
    fail('a body creeping 0.2 mm per step latched — drift is being measured step-to-step, not from the anchor');
  } else ok('sub-epsilon creep never latches: drift is measured from the anchor');

  const parked = mk({ id: 4, _budgetHold: true });
  if (run(parked, JAM_STEPS * 5, null) !== 0) {
    fail('a `_budgetHold` body latched — the device-tier contact budget would decide what leaves the sim');
  } else ok('a parked (`_budgetHold`) body never latches, however still it is');

  const onLoose = mk({ id: 5, _looseSup: true });
  if (run(onLoose, JAM_STEPS * 5, null) !== 0) {
    fail('a body on LOOSE support latched — RCA-2026-08-11 hang-in-the-sky is back');
  } else ok('a body on loose support never latches (hang-in-the-sky guard held)');

  const stale = mk({ id: 6 });
  sim._falling = [stale];
  for (let i = 0; i < JAM_STEPS * 5; i++) { stale._groundT = -1; sim._latchJammed(); }
  if (stale._jamReady) fail('a body with a stale `_groundT` latched — `_grounded` alone is being trusted');
  else ok('a stale grounded claim never latches');

  const fast = mk({ id: 7, vx: 1 });
  if (run(fast, JAM_STEPS * 5, null) !== 0) fail('a moving-fast body latched');
  else ok('a body above the speed threshold never latches');

  // The walk sets `_wantSleep` on this exact population every step — grounded,
  // on solid support, slow — and the commit then discards it on `_inContact`.
  // That pair IS the defect, so the latch must fire on a body whose flag is
  // ALREADY set. Gating on `!_wantSleep` (which reads as harmless) makes the
  // whole path a measured no-op: awake held at 100 with 79 bodies counting
  // toward a threshold they were never allowed to act on.
  const alreadyWanted = mk({ id: 8, _wantSleep: true });
  if (run(alreadyWanted, JAM_STEPS * 3, null) !== JAM_STEPS) {
    fail('a body whose `_wantSleep` was already set by the walk never latched — the latch is gated on the flag it must override');
  } else ok('the latch fires on a body the walk had already flagged (the no-op trap)');

  sim._falling = [];
}

// --- 6-8. end to end on the route the defect was measured on ------------------
{
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'cambridge' });
  const WP = CAMBRIDGE_ROUTE;
  const SECONDS = 60;
  for (let i = 0; i < SECONDS * 60; i++) {
    const t = i * DT, h = sim.hole;
    let wp = WP[WP.length - 1];
    for (const w of WP) if (t < w.until) { wp = w; break; }
    const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
    sim.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
  }

  // 6. The population that must not accumulate is specifically the SETTLED one:
  // grounded, on solid support, going nowhere. Airborne bodies are real work and
  // are not what this fix retires, so counting them would hide the regression
  // behind whatever happens to be in flight at the sample instant.
  let settledAwake = 0, awake = 0;
  for (const b of sim._falling) {
    if (b.state !== 'falling' || b.parentChunk || b.asleep) continue;
    awake++;
    if (b._grounded && !b._looseSup) settledAwake++;
  }
  if (settledAwake > 10) {
    fail(`${settledAwake} settled bodies still awake after ${SECONDS} s (HEAD: 56) — the drain is not draining`);
  } else ok(`drain holds: ${settledAwake} settled bodies awake after ${SECONDS} s (HEAD: 56), ${awake} awake in total`);

  // 7. Every sleeper sits on solid support: bare ground, a static top, or
  // another SLEEPING body. Never a loose one — that is the configuration with no
  // wake path, and it is what hangs debris in the sky when the support rolls
  // away (RCA-2026-08-11).
  const asleepBodies = sim.blocks.filter((b) => b.asleep && b.state === 'falling');
  const tops = new Map();   // fine column -> [{top, id}]
  const FINE = 0.25;
  const colsOf = (b) => {
    const fx = Math.round(b.x / FINE - b.fsx / 2), fz = Math.round(b.z / FINE - b.fsz / 2);
    const out = [];
    for (let ix = 0; ix < b.fsx; ix++) for (let iz = 0; iz < b.fsz; iz++) out.push(`${fx + ix},${fz + iz}`);
    return out;
  };
  for (const b of asleepBodies) {
    const top = b.y + b.sy / 2;
    for (const k of colsOf(b)) {
      let a = tops.get(k);
      if (!a) { a = []; tops.set(k, a); }
      a.push({ top, id: b.id });
    }
  }
  let unsupported = 0, worst = '';
  for (const b of asleepBodies) {
    const base = b.y - b.sy / 2;
    if (b.restTop <= 0.001) continue;                                  // bare ground
    if (Math.abs(sim._supportBelow(b, base + 0.05) - b.restTop) < 0.05) continue;  // static
    let backed = false;
    for (const k of colsOf(b)) {
      for (const e of tops.get(k) || []) {
        if (e.id !== b.id && Math.abs(e.top - b.restTop) < 0.05) { backed = true; break; }
      }
      if (backed) break;
    }
    if (!backed) {
      unsupported++;
      if (!worst) worst = `#${b.id} ${b.matType} restTop ${b.restTop.toFixed(3)} base ${base.toFixed(3)} staticBelow ${sim._supportBelow(b, base + 0.05).toFixed(3)}`;
    }
  }
  if (unsupported > 0) fail(`${unsupported} sleeping body(ies) recorded on support that is neither ground, static, nor another sleeper — first ${worst}`);
  else ok(`every one of ${asleepBodies.length} sleeping bodies sits on ground, static, or another sleeper`);
}

// 8. A parked body is never asleep. Needs a finite contact budget, which the
// default (untiered) tune deliberately does not have, so this drives the tier
// lever explicitly on a scene that produces enough debris to exceed it.
{
  const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
  sim.tune.contactBudget = 12;
  const h = sim.hole;
  h.x = -96; h.z = -56; h.radius = 3.2;
  let parkedAsleep = 0, sawParked = 0;
  for (let i = 0; i < 20 * 60; i++) {
    sim.step(DT, { x: 0, z: 0 });
    for (const b of sim._falling) {
      if (!b._budgetHold) continue;
      sawParked++;
      if (b.asleep) parkedAsleep++;
    }
  }
  if (sawParked === 0) fail('the contact budget never parked anything — test 8 proved nothing');
  else if (parkedAsleep > 0) fail(`${parkedAsleep} parked-body-steps were asleep — the contact budget is retiring debris`);
  else ok(`no parked body ever slept (${sawParked} parked-body-steps observed)`);
}

if (failures > 0) { console.error(`${failures} FAILURE(S)`); process.exit(1); }
console.log('ALL PASS (voxelsim.drain.test.mjs)');
