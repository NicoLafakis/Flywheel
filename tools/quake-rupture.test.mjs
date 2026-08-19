// Fault Line Rupture: the QUAKE power-up must rupture the ENTIRE line from the
// player to the map edge, not the first 160 blocks of it.
//
// Before this test existed the fault stopped after 160 blocks (a few metres in
// a dense city) and only y<=3 blocks detached; taller blocks were flagged
// unstable/damage=1 and then reset to static by the very next support recalc
// because they still had a foundation. The owner's report was "doesn't break
// everything down between the player and the end of the quake". These
// assertions pin the full-length, staggered rupture that replaced it.
//
// Pure-sim (Node): constructs a gallery VoxelSandboxSim, parks the hole near
// one corner so the fault is as long as the map allows, triggers the quake and
// steps ~3 s. Run standalone (`node tools/quake-rupture.test.mjs`) or via the
// validator section `quakeRupture`.

import {
  VoxelSandboxSim,
  QUAKE_CRACK_WIDTH,
  QUAKE_RUPTURE_SECONDS,
  QUAKE_RELEASE_CAP,
  QUAKE_SWALLOW_SECONDS,
  QUAKE_SWALLOW_Y,
} from '../js/voxelsim.js';

const DT = 1 / 60;

function lineFrame(ev) {
  const cosA = Math.cos(ev.angle), sinA = Math.sin(ev.angle);
  return (b) => {
    const dx = b.x - ev.x0, dz = b.z - ev.z0;
    return { longDist: dx * cosA + dz * sinA, perp: Math.abs(-dx * sinA + dz * cosA) };
  };
}

function snapshot(sim) {
  // id -> state, stable across runs (ids are assigned at build time)
  const out = new Array(sim.blocks.length);
  for (let i = 0; i < sim.blocks.length; i++) {
    const b = sim.blocks[i];
    out[i] = b.state + ':' + (b.state === 'falling' ? `${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)}` : '');
  }
  return out;
}

function runQuake(seed, { steps = 180, onStep = null } = {}) {
  const sim = new VoxelSandboxSim({ seed, scene: 'gallery' });
  const r = sim.boundsRect || { minX: -sim.bounds, maxX: sim.bounds, minZ: -sim.bounds, maxZ: sim.bounds };
  const h = sim.hole;
  h.x = r.minX + 8;
  h.z = r.minZ + 8;
  const preStates = sim.blocks.map((b) => b.state);
  sim._triggerVoxelQuake(h);
  const ev = sim.events.find((e) => e.type === 'quake');
  for (let i = 0; i < steps; i++) {
    sim.step(DT, null);
    if (onStep) onStep(sim, i);
  }
  return { sim, ev, preStates };
}

export function runQuakeRuptureSelftest() {
  let assertions = 0;
  const check = (cond, msg) => { assertions++; if (!cond) throw new Error('quakeRupture: ' + msg); };

  // ---- 0. constants exist and are sane (the wavefront is tunable, not magic)
  check(QUAKE_CRACK_WIDTH > 0, 'QUAKE_CRACK_WIDTH must be exported and positive');
  check(QUAKE_RUPTURE_SECONDS >= 1.0 && QUAKE_RUPTURE_SECONDS <= 2.0,
    `QUAKE_RUPTURE_SECONDS ${QUAKE_RUPTURE_SECONDS} must sit in the 1.0-2.0 s band the cinematic sweep allows`);
  check(QUAKE_RELEASE_CAP >= 20 && QUAKE_RELEASE_CAP <= 200, 'QUAKE_RELEASE_CAP must bound per-step releases');

  // ---- 1. trigger does not change gameplay state outside step()
  {
    const sim = new VoxelSandboxSim({ seed: 'rupture-A', scene: 'gallery' });
    const r = sim.boundsRect;
    sim.hole.x = r.minX + 8; sim.hole.z = r.minZ + 8;
    const before = sim.blocks.map((b) => b.state).join('');
    const fallingBefore = sim._falling.length;
    sim._triggerVoxelQuake(sim.hole);
    const after = sim.blocks.map((b) => b.state).join('');
    check(before === after, 'triggering the quake must not change any block state before step()');
    check(sim._falling.length === fallingBefore, 'triggering the quake must not detach before step()');
    check(Array.isArray(sim._activeFaults) && sim._activeFaults.length === 1, 'trigger must queue exactly one active fault');
    const ev = sim.events.find((e) => e.type === 'quake');
    check(ev && ev.subtype === 'fault_line' && ev.x0 != null && ev.x1 != null && ev.angle != null
      && ev.length > 0 && Array.isArray(ev.affectedBlocks), 'quake event shape (fault_line, endpoints, angle, length, affectedBlocks) must be preserved');
    check(ev.affectedBlocks.length <= 120, 'affectedBlocks stays <= 120 entries');
    // affectedBlocks must span the line, not cluster at the hole
    const lds = ev.affectedBlocks.map((a) => a.longDist);
    check(Math.max(...lds) > ev.length * 0.85, `affectedBlocks must sample to the far end (max longDist ${Math.max(...lds).toFixed(1)} of ${ev.length.toFixed(1)})`);
  }

  // ---- 2. full-length rupture, per-step cap, rupture timing
  {
    let maxReleased = 0;
    let finishedAtStep = -1;
    const { sim, ev, preStates } = runQuake('rupture-A', {
      steps: 180,
      onStep: (s, i) => {
        if (s._lastFaultReleases > maxReleased) maxReleased = s._lastFaultReleases;
        if (finishedAtStep < 0 && s._activeFaults.every((f) => f.idx >= f.list.length)) finishedAtStep = i;
      },
    });
    check(maxReleased <= QUAKE_RELEASE_CAP, `per-step releases ${maxReleased} exceeded cap ${QUAKE_RELEASE_CAP}`);
    check(maxReleased > 0, 'the fault must release blocks inside step()');
    check(finishedAtStep >= 0, 'the fault must finish within 3 s');
    const finishedS = (finishedAtStep + 1) * DT;
    check(finishedS >= 0.8 && finishedS <= 2.2,
      `rupture should finish in ~${QUAKE_RUPTURE_SECONDS} s (cap-throttled allowed), got ${finishedS.toFixed(2)} s`);

    const frame = lineFrame(ev);
    const deciles = new Array(10).fill(0).map(() => ({ total: 0, stillStatic: 0 }));
    let crackTotal = 0, crackDetached = 0;
    for (let i = 0; i < sim.blocks.length; i++) {
      if (preStates[i] !== 'static') continue;
      const b = sim.blocks[i];
      // b.x/z move once falling; use the stored original longDist via the
      // fault's own frame on current position for static blocks only — a
      // static block has not moved, so its frame is exact.
      if (b.state !== 'static') { crackDetached++; continue; }
      const f = frame(b);
      if (f.longDist < 0 || f.longDist > ev.length || f.perp > QUAKE_CRACK_WIDTH) continue;
      const d = Math.min(9, Math.floor((f.longDist / ev.length) * 10));
      deciles[d].total++;
      deciles[d].stillStatic++;
      crackTotal++;
    }
    // Any block still static inside the crack is a failure, in EVERY decile.
    for (let d = 0; d < 10; d++) {
      check(deciles[d].stillStatic === 0,
        `decile ${d}: ${deciles[d].stillStatic} crack blocks still static (the old 160 cap left the far end untouched)`);
    }
    // Swallow: what lands in the crack is consumed without award; the banks keep
    // their rubble. (Why: dropped in place, a tower's worth of blocks stacks into
    // loose bodies the pair solver walks apart for seconds -- see voxelsim.js.)
    let swallowed = 0, resting = 0, restingInCrack = 0;
    for (let i = 0; i < sim.blocks.length; i++) {
      const b = sim.blocks[i];
      if (preStates[i] !== 'static') continue;
      if (b.state === 'consumed') swallowed++;
      else if (b.state === 'falling' && b.asleep) {
        resting++;
        const f = frame(b);
        if (f.longDist >= 0 && f.longDist <= ev.length && f.perp <= QUAKE_CRACK_WIDTH && b.y - b.sy * 0.5 <= QUAKE_SWALLOW_Y) restingInCrack++;
      }
    }
    check(swallowed > 300, `the fissure must swallow the debris that lands in it (swallowed ${swallowed})`);
    check(resting > 100, `rubble must remain on the banks for the player (resting ${resting})`);
    check(restingInCrack === 0, `${restingInCrack} loose blocks are resting inside the open crack`);
    check(sim.hole.mass === 0 && sim.hole.eatenCount === 0, 'swallowed blocks must not score (mass/eatenCount unchanged)');
    const detached = preStates.filter((s, i) => s === 'static' && sim.blocks[i].state !== 'static').length;
    check(detached > 600, `total detached ${detached} must be far beyond the old 160 cap on a 200 m gallery fault`);
    check(sim._lastFaultReleases === 0, 'release list drains');
    // The crack stays open (swallowing debris that lands in it) for a while after
    // the last release, then the fault record is dropped.
    for (let i = 0; i < Math.ceil(QUAKE_SWALLOW_SECONDS / DT) + 5; i++) sim.step(DT, null);
    check(sim._activeFaults.length === 0, 'fault record is removed once the swallow window closes');
    check(QUAKE_SWALLOW_SECONDS > 0 && QUAKE_SWALLOW_Y >= 0, 'swallow constants exported');
  }

  // ---- 3. determinism: same seed, same inputs -> identical block states
  {
    const a = runQuake('rupture-D', { steps: 150 });
    const b = runQuake('rupture-D', { steps: 150 });
    const sa = snapshot(a.sim), sb = snapshot(b.sim);
    let diff = 0;
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) diff++;
    check(diff === 0, `two runs with the same seed diverged on ${diff} blocks`);
  }

  // ---- 4. the natural Seismic disaster takes the same staggered full-map path
  {
    const sim = new VoxelSandboxSim({ seed: 'rupture-S', scene: 'gallery' });
    const pre = sim.blocks.map((b) => b.state);
    sim._triggerNaturalSeismicDisaster();
    check(sim.blocks.every((b, i) => b.state === pre[i]), 'seismic disaster must not detach before step()');
    const ev = sim.events.find((e) => e.type === 'disaster' && e.subtype === 'quake');
    check(ev && ev.affectedBlocks.length <= 120, 'seismic disaster event shape preserved');
    let maxRel = 0;
    for (let i = 0; i < 180; i++) { sim.step(DT, null); if (sim._lastFaultReleases > maxRel) maxRel = sim._lastFaultReleases; }
    check(maxRel <= QUAKE_RELEASE_CAP, `seismic per-step releases ${maxRel} exceeded cap`);
    const frame = lineFrame(ev);
    let still = 0;
    for (let i = 0; i < sim.blocks.length; i++) {
      const b = sim.blocks[i];
      if (pre[i] !== 'static' || b.state !== 'static') continue;
      const f = frame(b);
      if (f.longDist >= 0 && f.longDist <= ev.length && f.perp <= 5.0) still++;
    }
    check(still === 0, `seismic disaster left ${still} crack blocks static (old 180 cap / y<=3 pattern)`);
    check(sim._activeFaults.every((f) => f.idx >= f.list.length), 'seismic release list drains');
  }

  return assertions;
}

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
    || process.argv[1] && process.argv[1].endsWith('quake-rupture.test.mjs')) {
  const n = runQuakeRuptureSelftest();
  console.log(`quake-rupture: ${n} assertions passed`);
}
