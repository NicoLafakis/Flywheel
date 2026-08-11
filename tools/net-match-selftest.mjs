// Standalone end-to-end match test for the loopback arena. No browser, no
// backend, no deps.
//
//   node tools/net-match-selftest.mjs
//
// This is the T-604/T-605 proof harness: a real ArenaHost stepping a real
// multi-hole VoxelSandboxSim, and a real ArenaPeer on the other side of a
// LoopbackHub dialled to booth-wifi conditions (120 ms latency, 30 ms jitter,
// 5% drop), for 60 simulated seconds of scripted play. It asserts the four
// claims the netcode design stakes out:
//
//   1. intents flow peer -> host and the AUTHORITATIVE sim obeys them
//      (the peer's hole moves in the host's world);
//   2. snapshots flow host -> peer and the peer's reconstruction tracks the
//      truth: interpolated ghosts within the correction bands, the predicted
//      own hole reconciled through ignore/smooth/snap (04 §5);
//   3. the failure handling is real: intent staleness zeroing (04 §6), the
//      keyframe's eaten bitset back-filling dropped eat events (04 §4.1/§7.4);
//   4. none of it disturbs determinism: replaying the host's recorded
//      multi-slot trace into a fresh sim reproduces the match bit for bit —
//      which is the entire replay-validation defense (04 §10.1).
//
// Exit 1 on any FAIL.

const ROOT = new URL('../', import.meta.url).href;

const P = await import(ROOT + 'js/net/protocol.js');
const S = await import(ROOT + 'js/net/snapshot.js');
const T = await import(ROOT + 'js/net/transport.js');
const H = await import(ROOT + 'js/net/host.js');
const PE = await import(ROOT + 'js/net/peer.js');
const { VoxelSandboxSim, sandboxSpeedForRadius } = await import(ROOT + 'js/voxelsim.js');

let failures = 0;
const results = [];
function begin(name) { results.push({ name, checks: [], failed: 0 }); }
function check(label, cond, detail = '') {
  const r = results[results.length - 1];
  r.checks.push({ label, ok: !!cond, detail });
  if (!cond) { r.failed++; failures++; }
}
function eq(label, a, b) { check(label, Object.is(a, b) || a === b, `got ${fmt(a)} want ${fmt(b)}`); }
function near(label, a, b, tol) { check(label, Math.abs(a - b) <= tol, `got ${fmt(a)} want ${fmt(b)} +-${tol}`); }
function fmt(v) { return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : JSON.stringify(v); }

const FIXED_DT = 1 / 60;
const FRAME_MS = 1000 / 60;
const SEED = 'netmatch-arena';
const SPAWNS = [{ x: -8, z: 8 }, { x: 8, z: 8 }];
const LATENCY = 120, JITTER = 30, DROP = 0.05;

// Scripted play: two different smooth lawnmower routes, pure functions of the
// virtual clock so the whole run is reproducible.
const hostMove = (tS) => ({ x: Math.cos(tS * 0.55), z: Math.sin(tS * 0.7) });
const peerMove = (tS) => ({ x: Math.cos(tS * 0.4 + 1.7), z: Math.sin(tS * 0.52 + 0.6) });

// =============================================================================
begin('1. the prediction speed function matches the sim exactly');
// =============================================================================
{
  const sim = new VoxelSandboxSim({ seed: 'speed-check', scene: 'gallery' });
  const h = sim.holes[0];
  h.x = 0; h.z = 0;
  const r0 = h.radius, x0 = h.x;
  sim.step(FIXED_DT, { x: 1, z: 0 });
  const predicted = sandboxSpeedForRadius(r0, sim.tune.speed) * FIXED_DT;
  near('one tick of +x displacement equals sandboxSpeedForRadius × dt',
    h.x - x0, predicted, 1e-12);
  // The affine radius/size identity the export leans on.
  const grownSpeed = sandboxSpeedForRadius(3.0, sim.tune.speed);
  check('speed is finite and positive across the ladder',
    Number.isFinite(grownSpeed) && grownSpeed > 0 && Number.isFinite(sandboxSpeedForRadius(7.1)));
}

// =============================================================================
begin('2. join handshake: a JOIN gets an immediate keyframe (04 §8)');
// =============================================================================
{
  const hub = new T.LoopbackHub({ latencyMs: 40, seed: 'join' });
  const sim = new VoxelSandboxSim({ seed: SEED, scene: 'gallery' });
  sim.addHole(SPAWNS[1].x, SPAWNS[1].z);
  const host = new H.ArenaHost({ sim, transport: hub.endpoint('host'), generation: 1, nowMs: () => hub.nowMs });
  host.addSlot(1, 'peer');
  const peer = new PE.ArenaPeer({
    transport: hub.endpoint('peer'), slot: 1, sessionId: 't', nowMs: () => hub.nowMs,
    spawn: SPAWNS[1], generation: 1,
  });
  peer.join();
  hub.flush();   // delivers the JOIN to the host, which queues its keyframe…
  hub.flush();   // …which this second flush delivers back to the peer.
  check('the host answered the JOIN with a keyframe before any tick ran', peer.stats.keyframes >= 1);
  check('the keyframe seeded the peer\'s view of its own hole', peer.self.radius > 0);
  check('the host\'s keyframe carries an object-id space for the eaten bitset', host.objectIdSpace > 1000);
  peer.dispose(); host.dispose();
}

// =============================================================================
begin('3. 60 s scripted match: 120 ms latency, 30 ms jitter, 5% drop');
// =============================================================================
{
  const hub = new T.LoopbackHub({ latencyMs: LATENCY, jitterMs: JITTER, dropRate: DROP, seed: 'booth-wifi' });
  const sim = new VoxelSandboxSim({ seed: SEED, scene: 'gallery' });
  const h0 = sim.holes[0];
  h0.x = SPAWNS[0].x; h0.z = SPAWNS[0].z;
  const h1 = sim.addHole(SPAWNS[1].x, SPAWNS[1].z);

  const DURATION_TICKS = 60 * 60;
  const host = new H.ArenaHost({
    sim, transport: hub.endpoint('host'), generation: 1, durationTicks: DURATION_TICKS,
    readInput: () => hostMove(hub.nowMs / 1000), nowMs: () => hub.nowMs, seed: SEED,
  });
  host.addSlot(1, 'peer');

  let maxBlockId = 0;
  for (const b of sim.blocks) if (b.id > maxBlockId) maxBlockId = b.id;

  const peer = new PE.ArenaPeer({
    transport: hub.endpoint('peer'), slot: 1, sessionId: 't', nowMs: () => hub.nowMs,
    readInput: () => peerMove(hub.nowMs / 1000),
    speedForRadius: (r) => sandboxSpeedForRadius(r, sim.tune.speed),
    boundsRect: sim.boundsRect || { minX: -sim.bounds, maxX: sim.bounds, minZ: -sim.bounds, maxZ: sim.bounds },
    spawn: SPAWNS[1], objectCount: maxBlockId + 1, generation: 1,
  });
  peer.join();

  // Truth history, one row per tick, for the ghost-lag comparison; prediction
  // history likewise for the own-hole comparison.
  const truth = [];
  const predHist = [];
  const ghostErrs = [];
  const ownErrs = [];
  const ownLiveErrs = [];
  let nan = null;
  const startX1 = h1.x;

  for (let frame = 0; frame < DURATION_TICKS; frame++) {
    hub.advance(FRAME_MS);
    host.step(FIXED_DT, hub.nowMs);
    truth.push({ ms: hub.nowMs, x0: h0.x, z0: h0.z, x1: h1.x, z1: h1.z });
    sim.drainEvents();   // main.js's drain, standing in (ArenaHost detects it by array identity)
    peer.update(hub.nowMs, FRAME_MS);

    predHist.push({ ms: hub.nowMs, x: peer.pred.x, z: peer.pred.z });

    // Own-hole prediction error. The apples-to-apples comparison is truth(t)
    // against the prediction ONE ONE-WAY earlier: the host integrates every
    // intent ~a one-way after the peer's prediction did, so truth(t) IS the
    // predicted trajectory shifted by the one-way — what remains after the
    // shift is the genuine residual (quantisation, 10 Hz hold, jitter, the
    // corrections themselves), which is what the bands are about.
    if (frame > 60) {
      const refIdx = Math.max(0, Math.round((hub.nowMs - LATENCY - predHist[0].ms) / FRAME_MS));
      const p = predHist[Math.min(predHist.length - 1, refIdx)];
      ownErrs.push(Math.hypot(p.x - h1.x, p.z - h1.z));
      // And the honest same-instant gap, which INCLUDES the protocol's
      // intrinsic input lag — bounded, not tiny.
      ownLiveErrs.push(Math.hypot(peer.pred.x - h1.x, peer.pred.z - h1.z));
    }

    // Ghost error: what the peer draws for slot 0, against where the host's
    // hole truly was one interpolation delay plus one one-way latency ago.
    if (frame > 300 && frame % 30 === 0) {
      const g = peer.ghosts(hub.nowMs).get(0);
      if (g) {
        const refMs = hub.nowMs - S.INTERP_DELAY_MS - LATENCY;
        const idx = Math.min(truth.length - 1, Math.max(0, Math.round((refMs - truth[0].ms) / FRAME_MS)));
        const t = truth[idx];
        ghostErrs.push(Math.hypot(g.x - t.x0, g.z - t.z0));
      }
    }

    if (!nan) {
      for (const [k, v] of [['pred.x', peer.pred.x], ['pred.z', peer.pred.z],
        ['self.mass', peer.self.mass], ['self.radius', peer.self.radius],
        ['h0.x', h0.x], ['h1.x', h1.x], ['h0.mass', h0.mass], ['h1.mass', h1.mass]]) {
        if (!Number.isFinite(v)) { nan = `${k} at frame ${frame}`; break; }
      }
    }
  }

  // Final flush so the last keyframe (MATCH_OVER) reaches the peer.
  host.sendKeyframe(hub.nowMs);
  hub.flush();

  check('no NaN anywhere across 3600 ticks' + (nan ? ` (first: ${nan})` : ''), !nan);
  check('the match ran its clock out', host.over && host.tick === DURATION_TICKS);
  check('the peer heard MATCH_OVER over the wire', peer.matchOver);

  // -- claim 1: the host sim obeyed the peer's wire intents.
  check(`the peer's hole moved in the AUTHORITATIVE sim (x ${startX1.toFixed(1)} -> ${h1.x.toFixed(1)})`,
    Math.abs(h1.x - startX1) > 1 || Math.abs(h1.z - SPAWNS[1].z) > 1);
  check(`the peer's hole ate in the authoritative sim (${h1.eatenCount} blocks)`, h1.eatenCount > 0);
  check(`the host's own hole played too (${h0.eatenCount} blocks)`, h0.eatenCount > 0);

  // -- claim 2: the reconstruction tracked the truth.
  const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  check(`ghost sampled ${ghostErrs.length} times`, ghostErrs.length > 80);
  check(`ghost mean error ${mean(ghostErrs).toFixed(2)} m < 1.2 m`, mean(ghostErrs) < 1.2);
  check(`ghost p95 error ${pct(ghostErrs, 0.95).toFixed(2)} m < 2.5 m`, pct(ghostErrs, 0.95) < 2.5);
  check(`own-hole mean residual ${mean(ownErrs).toFixed(2)} m < 1.0 m (lag-compensated)`, mean(ownErrs) < 1.0);
  check(`own-hole p95 residual ${pct(ownErrs, 0.95).toFixed(2)} m stays in the smooth band (< 3 m)`,
    pct(ownErrs, 0.95) < S.CORRECTION_SMOOTH_M);
  check(`own-hole same-instant gap ${mean(ownLiveErrs).toFixed(2)} m stays bounded (< 3 m mean)`,
    mean(ownLiveErrs) < 3.0);
  const c = peer.stats.corrections;
  check(`corrections ran (ignore ${c.ignore} / smooth ${c.smooth} / snap ${c.snap})`, c.ignore + c.smooth > 0);
  check(`snaps are rare under 120 ms (${c.snap})`, c.snap < 10);

  // -- rates and transport health.
  check(`intents sent at ~10 Hz over 60 s (${peer.stats.intentsSent})`,
    peer.stats.intentsSent >= 550 && peer.stats.intentsSent <= 650);
  const rx = peer.stats.snapshots + peer.stats.keyframes;
  check(`snapshots+keyframes received (${rx}) consistent with 12 Hz less ~5% drop`, rx >= 580 && rx <= 760);
  check(`the impairment was real (${hub.stats.dropped} dropped of ${hub.stats.sent})`, hub.stats.dropped > 0);
  check(`RTT measured from PING/PONG (${Math.round(peer.rttMs)} ms) ≈ 2× latency`,
    peer.rttMs >= 2 * (LATENCY - JITTER) - 5 && peer.rttMs <= 2 * (LATENCY + JITTER) + 20);
  check('no packet was rejected by the guard', peer.stats.rejected === 0 && !host.badPackets);

  // -- claim 3a: the keyframe's eaten bitset healed every dropped eat event.
  let missing = 0;
  for (const id of host._eatenIds) if (!peer.consumed.has(id)) missing++;
  eq(`peer knows every eaten block (${host._eatenIds.size} eaten, ${peer.consumed.size} known)`, missing, 0);
  check('peer never invented an eat the host did not report',
    [...peer.consumed].every((id) => host._eatenIds.has(id)));

  // -- claim 4: determinism. Replay the host's recorded multi-slot trace into
  // a FRESH sim and demand the exact same match, bit for bit.
  const t0 = host.traceForSlot(0), t1 = host.traceForSlot(1);
  eq('trace covers every tick for slot 0', t0.length, DURATION_TICKS);
  eq('trace covers every tick for slot 1', t1.length, DURATION_TICKS);
  const sim2 = new VoxelSandboxSim({ seed: SEED, scene: 'gallery' });
  sim2.holes[0].x = SPAWNS[0].x; sim2.holes[0].z = SPAWNS[0].z;
  sim2.addHole(SPAWNS[1].x, SPAWNS[1].z);
  for (let t = 0; t < DURATION_TICKS; t++) {
    sim2.step(FIXED_DT, [t0[t], t1[t]]);
    sim2.events.length = 0;
  }
  for (const [i, a, b] of [[0, h0, sim2.holes[0]], [1, h1, sim2.holes[1]]]) {
    check(`slot ${i} replays exactly: x`, Object.is(a.x, b.x), `${a.x} vs ${b.x}`);
    check(`slot ${i} replays exactly: z`, Object.is(a.z, b.z), `${a.z} vs ${b.z}`);
    check(`slot ${i} replays exactly: mass`, Object.is(a.mass, b.mass), `${a.mass} vs ${b.mass}`);
    check(`slot ${i} replays exactly: rawMass`, Object.is(a.rawMass, b.rawMass), `${a.rawMass} vs ${b.rawMass}`);
    check(`slot ${i} replays exactly: eatenCount`, a.eatenCount === b.eatenCount, `${a.eatenCount} vs ${b.eatenCount}`);
  }

  peer.dispose(); host.dispose();
}

// =============================================================================
begin('4. intent staleness: a silent peer\'s hole stops (04 §6)');
// =============================================================================
{
  const hub = new T.LoopbackHub({ latencyMs: 40, seed: 'stale' });
  const sim = new VoxelSandboxSim({ seed: 'stale-arena', scene: 'gallery' });
  sim.holes[0].x = SPAWNS[0].x; sim.holes[0].z = SPAWNS[0].z;
  const h1 = sim.addHole(SPAWNS[1].x, SPAWNS[1].z);
  const host = new H.ArenaHost({ sim, transport: hub.endpoint('host'), generation: 1, durationTicks: 60 * 60, nowMs: () => hub.nowMs });
  const driver = host.addSlot(1, 'peer');
  const peerEnd = hub.endpoint('peer');

  // 2 s of hard-right steering at 10 Hz…
  let seq = 0, lastIntent = -Infinity;
  for (let f = 0; f < 120; f++) {
    hub.advance(FRAME_MS);
    if (hub.nowMs - lastIntent >= S.INTENT_INTERVAL_MS) {
      peerEnd.send(P.encodeEnvelope('I', { slot: 1, seq: seq++, x: 1, z: 0 }));
      lastIntent = hub.nowMs;
    }
    host.step(FIXED_DT, hub.nowMs);
  }
  const movedX = h1.x;
  check(`the hole drove while intents flowed (x ${SPAWNS[1].x} -> ${movedX.toFixed(1)})`, movedX > SPAWNS[1].x + 3);

  // …then silence. Within INTENT_STALE_MS the host zeroes the steering and the
  // hole must stop exactly — no drift, no grind against the far wall.
  for (let f = 0; f < 45; f++) { hub.advance(FRAME_MS); host.step(FIXED_DT, hub.nowMs); }   // 750 ms
  const stoppedX = h1.x;
  check('the driver reports itself stale', driver.isStale(hub.nowMs));
  for (let f = 0; f < 60; f++) { hub.advance(FRAME_MS); host.step(FIXED_DT, hub.nowMs); }   // +1 s
  check('a stale peer\'s hole is frozen in place', Object.is(h1.x, stoppedX));
  check('the trace recorded the zeroed intent, not the last received one',
    host.traceForSlot(1)[host.tick - 1].x === 0);
  host.dispose();
}

// =============================================================================
begin('5. the peer stays pure (invariant 7, structurally)');
// =============================================================================
{
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL(ROOT + 'js/net/peer.js')).toString();
  const importsOf = (x) => (x.match(/^\s*(?:import|export)\s[^\n]*?from\s+['"][^'"]+['"]/gm) || []).join('\n');
  const imports = importsOf(s);
  check('peer.js imports no npm package (ADR-0014)', !/from\s+['"][^.'"]/.test(imports));
  check('peer.js has no three.js import (invariant 8)', !/three/.test(imports));
  check('peer.js never imports a sim — the world reaches it only through injection',
    !/voxelsim|from\s+['"]\.\.\/sim/.test(imports));
  check('peer.js survives the Math.random guard', !/Math\.random\(/.test(s));

  // And the demo page keeps the two sides apart: after the peer-render marker,
  // the authoritative sim is never touched.
  const demo = readFileSync(new URL(ROOT + 'js/demo/netdemo.js')).toString();
  const marker = demo.indexOf('---- peer render');
  check('netdemo.js has the peer-render section', marker > 0);
  const peerHalf = demo.slice(marker, demo.indexOf('updateHud()'));
  check('the peer renderer never reads hostSim / host holes (the whole proof)',
    !/hostSim|\bh0\b|\bh1\b|\bhost\./.test(peerHalf));
}

// =============================================================================
// report
// =============================================================================
const line = '-'.repeat(72);
console.log('\nFlywheel loopback-arena match self-test');
console.log(line);
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok);
  console.log(`\n${r.failed ? 'FAIL' : 'PASS'}  ${r.name}   (${r.checks.length - r.failed}/${r.checks.length})`);
  for (const c of bad) console.log(`      x ${c.label}${c.detail ? '  ' + c.detail : ''}`);
}
console.log(`\n${line}`);
const total = results.reduce((n, r) => n + r.checks.length, 0);
console.log(failures
  ? `FAIL  ${failures} of ${total} checks failed across ${results.filter((r) => r.failed).length} section(s)`
  : `PASS  all ${total} checks in ${results.length} sections`);
process.exit(failures ? 1 : 0);
