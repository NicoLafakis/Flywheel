// Standalone self-test for js/net/*. No backend, no browser, no deps.
//
//   node tools/net-selftest.mjs
//
// Proves five things, in the order the netcode depends on them:
//   1. protocol round-trips  — encode -> validate -> decode is identity on the
//      QUANTISED form (04-netcode-design.md §4.1's byte layouts are lossy by
//      design; identity on the raw floats would be the wrong claim).
//   2. snapshot symmetry     — capture/apply against a REAL VoxelSandboxSim,
//      gallery scene, actually stepped, plus interpolation and the §5.2 bands.
//   3. loopback exchange     — two ends, 120 ms latency, 5% drop, a PeerDriver
//      steering a real sim through it (04 §6).
//   4. hostile payloads      — the guard rejects everything it should.
//   5. supabase adapter      — the documented API shape, against a fake client.
//
// Exit 1 on any FAIL.

// Repo root, derived from this file's own location so the harness runs from
// any checkout path (the old hardcoded absolute URL broke on a renamed root).
const ROOT = new URL('../', import.meta.url).href;

const P = await import(ROOT + 'js/net/protocol.js');
const S = await import(ROOT + 'js/net/snapshot.js');
const T = await import(ROOT + 'js/net/transport.js');
const D = await import(ROOT + 'js/net/driver.js');
const H = await import(ROOT + 'js/net/host.js');
const { VoxelSandboxSim } = await import(ROOT + 'js/voxelsim.js');

let failures = 0;
let section = '';
const results = [];

function begin(name) { section = name; results.push({ name, checks: [], failed: 0 }); }
function check(label, cond, detail = '') {
  const r = results[results.length - 1];
  r.checks.push({ label, ok: !!cond, detail });
  if (!cond) { r.failed++; failures++; }
}
function eq(label, a, b) { check(label, Object.is(a, b) || a === b, `got ${fmt(a)} want ${fmt(b)}`); }
function near(label, a, b, tol) { check(label, Math.abs(a - b) <= tol, `got ${fmt(a)} want ${fmt(b)} +-${tol}`); }
function fmt(v) { return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : JSON.stringify(v); }
function deepEq(label, a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  check(label, sa === sb, sa === sb ? '' : `\n      got  ${sa}\n      want ${sb}`);
}

// A seeded generator so the fixtures are the same on every run — Math.random is
// banned in js/net and it has no business in the test that guards it either.
const { RNG } = await import(ROOT + 'js/rng.js');

// =============================================================================
begin('1. protocol round-trips');
// =============================================================================
{
  const rng = new RNG('net-selftest-protocol');
  let allSnapOk = true, allIntentOk = true, worstBytes = 0;

  for (let trial = 0; trial < 200; trial++) {
    const holeCount = rng.int(1, 8);
    const eventCount = rng.int(0, 12);
    const snap = {
      generation: rng.int(0, 255),
      tick: rng.int(0, 65535),
      flags: rng.chance(0.2) ? P.FLAG.KEYFRAME : 0,
      timeLeftCs: rng.int(0, 18000),
      holes: Array.from({ length: holeCount }, (_, i) => ({
        slot: i,
        state: P.HOLE_STATE.ALIVE | (rng.chance(0.1) ? P.HOLE_STATE.SWALLOWING : 0),
        x: rng.float(-300, 300), z: rng.float(-300, 300),
        mass: rng.float(0, 8000), radius: rng.float(0.45, 6.0),
        heading: rng.float(0, Math.PI * 2),
      })),
      events: Array.from({ length: eventCount }, () => ({
        slot: rng.int(0, holeCount - 1),
        flags: rng.int(0, 7),
        objectId: rng.int(0, 65535),
      })),
    };

    const q = P.quantizeSnapshot(snap);
    const env = P.encodeEnvelope(snap.flags & P.FLAG.KEYFRAME ? 'K' : 'S', snap);
    const wire = JSON.parse(JSON.stringify(env));       // what Realtime actually carries
    const v = P.validate(wire);
    if (!v.ok) { allSnapOk = false; check('snapshot validate', false, v.reason); break; }
    const back = P.decodeEnvelope(wire);
    // Compare only the fields the layout carries; `v`/`type` are added by both.
    const strip = (s) => ({
      generation: s.generation, tick: s.tick, flags: s.flags, timeLeftCs: s.timeLeftCs,
      holes: s.holes, events: s.events,
    });
    if (JSON.stringify(strip(q)) !== JSON.stringify(strip(back))) {
      allSnapOk = false;
      check(`snapshot trial ${trial}`, false, `\n      got  ${JSON.stringify(strip(back))}\n      want ${JSON.stringify(strip(q))}`);
      break;
    }
    worstBytes = Math.max(worstBytes, P.encodeSnapshot(snap).length);

    const intent = { slot: rng.int(0, 7), seq: rng.int(0, 65535), x: rng.float(-1, 1), z: rng.float(-1, 1) };
    const ienv = JSON.parse(JSON.stringify(P.encodeEnvelope('I', intent)));
    if (!P.validate(ienv).ok) { allIntentOk = false; break; }
    const iback = P.decodeEnvelope(ienv);
    const iq = P.quantizeIntent(intent);
    if (iback.slot !== iq.slot || iback.seq !== iq.seq || iback.x !== iq.x || iback.z !== iq.z) {
      allIntentOk = false;
      check(`intent trial ${trial}`, false, `${JSON.stringify(iback)} vs ${JSON.stringify(iq)}`);
      break;
    }
  }
  check('200 random snapshots round-trip to the quantised form', allSnapOk);
  check('200 random intents round-trip to the quantised form', allIntentOk);

  // 04 §4.1: "At 8 holes and 12 events: 12 + 80 + 48 = 140 bytes, ~190 base64'd."
  const doc = {
    generation: 3, tick: 1000, flags: 0, timeLeftCs: 9000,
    holes: Array.from({ length: 8 }, (_, i) => ({ slot: i, state: 1, x: i, z: -i, mass: 100 + i, radius: 1.5, heading: 0 })),
    events: Array.from({ length: 12 }, (_, i) => ({ slot: i % 8, flags: 0, objectId: 1000 + i })),
  };
  const bytes = P.encodeSnapshot(doc);
  eq('doc worked example is 140 bytes (04 §4.1)', bytes.length, 140);
  const b64 = P.toBase64(bytes);
  check(`doc worked example base64 is ~190 chars (got ${b64.length})`, b64.length >= 180 && b64.length <= 200);
  deepEq('base64 is its own inverse', Array.from(P.fromBase64(b64)), Array.from(bytes));
  eq('intent is 6 bytes (04 §4.1)', P.encodeIntent({ slot: 1, seq: 2, x: 1, z: 0 }).length, 6);
  check(`worst random snapshot stays under the 1 KB target (${worstBytes} B)`, worstBytes <= 1024);

  // The wide-id escape hatch, for voxel block ids past u16.
  const wideSnap = { ...doc, events: [{ slot: 0, flags: 0, objectId: 82894 }] };
  const wback = P.decodeSnapshot(P.encodeSnapshot(wideSnap));
  eq('voxel-scale object id survives (wide ids)', wback.events[0].objectId, 82894);
  check('wide-id snapshot sets FLAG.WIDE_IDS', !!(wback.flags & P.FLAG.WIDE_IDS));
  check('narrow snapshot does not set FLAG.WIDE_IDS', !(P.decodeSnapshot(bytes).flags & P.FLAG.WIDE_IDS));

  // 16-bit wrap compare (04 §6).
  check('tickIsNewer handles the wrap', P.tickIsNewer(2, 65534) && !P.tickIsNewer(65534, 2) && !P.tickIsNewer(5, 5));

  // Control messages.
  for (const [t, d] of [
    [P.CONTROL.JOIN, { sessionId: 'abc' }],
    [P.CONTROL.WELCOME, { sessionId: 'abc', slot: 3, seed: 'arena:uuid', generation: 1, scene: 'gallery' }],
    [P.CONTROL.ROSTER, { members: [{ slot: 0 }], generation: 1 }],
    [P.CONTROL.HOST_ANNOUNCE, { sessionId: 'abc', generation: 2 }],
    [P.CONTROL.PING, { id: 7, tClient: 123 }],
    [P.CONTROL.PONG, { id: 7, tClient: 123, tHost: 456 }],
  ]) {
    const e = JSON.parse(JSON.stringify(P.encodeEnvelope(t, d)));
    const ok = P.validate(e).ok;
    check(`control ${t} validates and round-trips`, ok && P.decodeEnvelope(e).t === t);
  }
}

// =============================================================================
begin('2. snapshot capture/apply on a real VoxelSandboxSim');
// =============================================================================
{
  const sim = new VoxelSandboxSim({ seed: 'net-selftest', scene: 'gallery' });
  check(`gallery sim built (${sim.blocks.length} blocks)`, sim.blocks.length > 0);
  eq('sim has exactly one hole today', S.holesOf(sim).length, 1);

  // Drive it far enough to eat something, so the events path is exercised on
  // real data rather than on a fixture I wrote to pass.
  let eats = 0;
  for (let i = 0; i < 900; i++) {
    sim.step(1 / 60, { x: Math.cos(i / 90), z: Math.sin(i / 90) });
    for (const e of sim.events) if (e.type === 'eat') eats++;
    sim.events.length = 0;   // main.js's drain, standing in
  }
  check(`the sim actually ate something (${eats} eats)`, eats > 0);

  const snap = S.captureSnapshot(sim, { generation: 1, tick: 900, timeLeftCs: 6000 });
  eq('capture found the hole', snap.holes.length, 1);
  near('captured x matches the sim', snap.holes[0].x, sim.hole.x, 1e-9);
  near('captured mass matches the sim (combo-multiplied)', snap.holes[0].mass, sim.hole.mass, 1e-9);
  check('capture did not drain sim.events', Array.isArray(sim.events));

  // Capture is READ-ONLY: invariant 7 in one assertion.
  const before = JSON.stringify({ x: sim.hole.x, z: sim.hole.z, mass: sim.hole.mass, raw: sim.hole.rawMass, chain: sim.hole.chain, size: sim.hole.size, time: sim.time });
  S.captureSnapshot(sim, { generation: 1, tick: 901, timeLeftCs: 5900 });
  const after = JSON.stringify({ x: sim.hole.x, z: sim.hole.z, mass: sim.hole.mass, raw: sim.hole.rawMass, chain: sim.hole.chain, size: sim.hole.size, time: sim.time });
  eq('captureSnapshot wrote nothing to the sim (invariant 7)', after, before);

  // capture -> encode -> decode -> apply lands in the ghost roster.
  const decoded = P.decodeSnapshot(P.encodeSnapshot(snap));
  const roster = new S.GhostRoster();
  S.applySnapshot(roster, decoded);
  const g = roster.get(0);
  near('ghost x survives the wire to within a cm', g.x, sim.hole.x, 0.01);
  near('ghost radius survives to within 1/20 m', g.radius, sim.hole.radius, 0.05);
  check('ghost is alive', g.alive);

  // The array-shaped sim of tomorrow (PRD 0004 FR-001), by duck-typing.
  // Roster holes carry their `index` identity (multi-hole refactor), so the
  // fabricated second hole carries index 1 the way a real `addHole` one does.
  const multi = { holes: [sim.hole, { ...sim.hole, index: 1, x: 5, z: -5, mass: 12 }], events: [] };
  const msnap = S.captureSnapshot(multi, { generation: 1, tick: 10, timeLeftCs: 100 });
  eq('captureSnapshot feature-detects sim.holes[]', msnap.holes.length, 2);
  eq('second hole gets slot 1', msnap.holes[1].slot, 1);

  // Interpolation (04 §5.1).
  const buf = new S.SnapshotBuffer();
  const mk = (tick, x) => ({ tick, generation: 1, flags: 0, timeLeftCs: 0, holes: [{ slot: 0, state: 1, x, z: 0, mass: 0, radius: 1, heading: 0 }], events: [] });
  check('buffer accepts an in-order snapshot', buf.push(mk(100, 0), 1000));
  check('buffer accepts the next', buf.push(mk(105, 10), 1083));
  check('buffer REJECTS an older tick (04 §6)', !buf.push(mk(102, 999), 1090));
  check('buffer rejects a duplicate tick', !buf.push(mk(105, 999), 1091));
  check('buffer accepts across the 16-bit wrap', (() => {
    const b = new S.SnapshotBuffer();
    b.push(mk(65534, 0), 0);
    return b.push(mk(2, 1), 10) && !b.push(mk(65000, 2), 20);
  })());

  // Render time = now - 100 ms. At now = 1183, renderAt = 1083 -> exactly the
  // second sample; at now = 1141.5 it is the midpoint.
  const mid = S.interpolate(buf, 1141.5).get(0);
  near('interpolation lands on the midpoint', mid.x, 5, 0.35);
  check('midpoint is interpolation, not extrapolation', !mid.extrapolated);

  const late = S.interpolate(buf, 1083 + S.INTERP_DELAY_MS + 100).get(0);
  check('past the buffer it extrapolates', late.extrapolated && !late.frozen);
  const dead = S.interpolate(buf, 1083 + S.INTERP_DELAY_MS + S.EXTRAPOLATE_MAX_MS + 50).get(0);
  check('past EXTRAPOLATE_MAX_MS it freezes (04 §5.1)', dead.frozen);
  check('a frozen ghost does not keep sliding', Math.abs(dead.x - late.x) < 12);

  // 6.1 -> 0.2 is a 0.383 rad step FORWARD across the wrap, not a 5.9 rad step
  // back. Half of it lands just past zero, at 6.2916 mod 2pi.
  near('lerpAngle takes the short arc across 0', S.lerpAngle(6.1, 0.2, 0.5), 0.00841, 0.001);
  near('lerpAngle at t=0 is the start', S.lerpAngle(6.1, 0.2, 0), 6.1, 1e-9);
  near('lerpAngle at t=1 is the end', S.lerpAngle(6.1, 0.2, 1), 0.2, 1e-9);
  check('lerpAngle never returns a negative angle', S.lerpAngle(0.1, 6.2, 0.5) >= 0);

  // Own-hole correction bands (04 §5.2).
  eq('error 0.4 m is ignored', S.correctionFor(0.4), S.CORRECTION.IGNORE);
  eq('error 1.5 m smooths', S.correctionFor(1.5), S.CORRECTION.SMOOTH);
  eq('error 4.0 m snaps', S.correctionFor(4.0), S.CORRECTION.SNAP);
  check('the ignore band clears the wire quantisation floor',
    S.CORRECTION_IGNORE_M > S.POSITION_RESOLUTION_M * 10);
  const b1 = S.blendToward({ x: 0, z: 0 }, { x: 3, z: 0 }, S.CORRECTION_BLEND_MS);
  check(`one blend window closes most of the gap (${b1.x.toFixed(2)}/3)`, b1.x > 1.5 && b1.x < 3);

  // The keyframe's eaten set.
  const eatenIds = new Set([0, 1, 2, 900, 901, 4000]);
  const rle = S.encodeEatenRLE((i) => eatenIds.has(i), 5000);
  const backSet = S.decodeEatenRLE(rle, 5000);
  let rleOk = true;
  for (let i = 0; i < 5000; i++) if (!!backSet[i] !== eatenIds.has(i)) { rleOk = false; break; }
  check(`eaten RLE round-trips 5000 objects in ${rle.length} bytes`, rleOk && rle.length < 32);
}

// =============================================================================
begin('3. loopback exchange: 120 ms latency, 5% drop, a real sim');
// =============================================================================
{
  const hub = new T.LoopbackHub({ latencyMs: 120, jitterMs: 25, dropRate: 0.05, seed: 'booth-wifi' });
  const hostEnd = hub.endpoint('host');
  const peerEnd = hub.endpoint('peer');

  const sim = new VoxelSandboxSim({ seed: 'net-selftest-arena', scene: 'gallery' });
  const host = new H.ArenaHost({
    sim, transport: hostEnd, generation: 4, durationTicks: 60 * 60,
    nowMs: () => hub.nowMs,
  });
  const peerDriver = host.addSlot(1, 'peer');
  check('slot 1 seated as a PeerDriver', peerDriver instanceof D.PeerDriver);

  const buf = new S.SnapshotBuffer();
  const roster = new S.GhostRoster();
  let snapshotsSeen = 0, keyframesSeen = 0, rejects = 0;
  peerEnd.on((env) => {
    const v = P.validate(env);
    if (!v.ok) { rejects++; return; }
    if (env.t === 'S' || env.t === 'K') {
      const s = P.decodeEnvelope(env);
      if (env.t === 'K') keyframesSeen++; else snapshotsSeen++;
      if (buf.push(s, hub.nowMs)) S.applySnapshot(roster, s);
    }
  });

  // The peer holds the stick hard right for two seconds of virtual time, at
  // INTENT_HZ. 04 §6.1: "Intent send rate must stay time-based, not tick-based."
  let seq = 0, lastIntentMs = -Infinity, sent = 0;
  const startX = sim.hole.x;
  for (let tick = 0; tick < 120; tick++) {
    if (hub.nowMs - lastIntentMs >= S.INTENT_INTERVAL_MS) {
      peerEnd.send(P.encodeEnvelope('I', { slot: 1, seq: seq++, x: 1, z: 0 }));
      lastIntentMs = hub.nowMs;
      sent++;
    }
    host.step(H.FIXED_DT, hub.nowMs);
    hub.advance(1000 / 60);
  }
  hub.flush();

  check(`peer sent ${sent} intents at ~${S.INTENT_HZ} Hz over 2 s`, sent >= 18 && sent <= 22);
  check(`host received intents despite ${hub.stats.dropped} drops`, peerDriver.lastSeq >= 0);
  check('the host dropped some messages (the impairment is real)', hub.stats.dropped > 0);
  check('every delivered packet passed the guard', rejects === 0);
  check(`peer received snapshots (${snapshotsSeen}) and keyframes (${keyframesSeen})`, snapshotsSeen > 0 && keyframesSeen > 0);
  check(`snapshot rate is ~${S.SNAPSHOT_HZ} Hz over 2 s (${snapshotsSeen + keyframesSeen} total)`,
    snapshotsSeen + keyframesSeen >= 20 && snapshotsSeen + keyframesSeen <= 28);
  check('PeerDriver is steering sanely (unit-ish vector)', Math.abs(peerDriver._move.x - 1) < 0.01 && Math.abs(peerDriver._move.z) < 0.01);
  check(`the ghost roster tracked the host's hole (x ${roster.get(0).x.toFixed(2)})`, roster.bySlot.has(0));
  check('host trace recorded both slots', host.traceForSlot(0).length > 0 && host.traceForSlot(1).length > 0);
  eq('trace length equals ticks stepped', host.traceForSlot(1).length, 120);

  // The sim's own hole is slot 0 and is idle here; slot 1's intent is recorded
  // as applied but today's single-hole sim only moves slot 0. That is the
  // correct behaviour until PRD 0004 lands multi-hole, and it is asserted so
  // the day it changes, this test says so.
  near('single-hole sim did not move slot 0 from an idle driver', sim.hole.x, startX, 1e-9);
  check('slot 1 applied intent is the peer\'s steering', Math.abs(host.traceForSlot(1)[119].x - 1) < 0.01);

  // 04 §6: staleness zeroing.
  const stale = new D.PeerDriver({ slot: 2, staleMs: S.INTENT_STALE_MS });
  stale.receive({ slot: 2, seq: 1, x: 1, z: 0 }, 1000);
  check('fresh intent is applied', stale.decide(null, null, 0, 1100).x === 1);
  check('intent past INTENT_STALE_MS is zeroed', stale.decide(null, null, 0, 1000 + S.INTENT_STALE_MS + 1).x === 0);
  check('zeroIfStale reports the transition once', stale.zeroIfStale(2000) && !stale.zeroIfStale(2001));
  check('an out-of-order seq is rejected', !stale.receive({ slot: 2, seq: 1, x: -1, z: 0 }, 2100));
  check('a wrong-slot intent is rejected', !stale.receive({ slot: 9, seq: 99, x: -1, z: 0 }, 2100));

  // Latency actually happened.
  check(`the hub delivered under latency (${hub.latencyMs} ms +- ${hub.jitterMs})`, hub.stats.delivered > 0);
}

// =============================================================================
begin('4. malformed and hostile payloads');
// =============================================================================
{
  const good = P.encodeEnvelope('S', {
    generation: 1, tick: 5, flags: 0, timeLeftCs: 10,
    holes: [{ slot: 0, state: 1, x: 1, z: 2, mass: 3, radius: 1, heading: 0 }], events: [],
  });

  const hostile = [
    ['null', null],
    ['a string', 'S'],
    ['an array', []],
    ['a number', 42],
    ['no version', { t: 'S', b: good.b }],
    ['wrong version', { v: 99, t: 'S', b: good.b }],
    ['unknown type', { v: P.PROTOCOL_VERSION, t: 'EVIL', d: {} }],
    ['type is an object', { v: P.PROTOCOL_VERSION, t: { toString: () => 'S' }, b: good.b }],
    ['binary envelope with no payload', { v: P.PROTOCOL_VERSION, t: 'S' }],
    ['payload is an object', { v: P.PROTOCOL_VERSION, t: 'S', b: { evil: true } }],
    ['non-base64 payload', { v: P.PROTOCOL_VERSION, t: 'S', b: '!!!!' }],
    ['base64 of the wrong length', { v: P.PROTOCOL_VERSION, t: 'S', b: 'AAA' }],
    ['truncated snapshot', { v: P.PROTOCOL_VERSION, t: 'S', b: P.toBase64(P.fromBase64(good.b).slice(0, 8)) }],
    ['snapshot with trailing garbage', { v: P.PROTOCOL_VERSION, t: 'S', b: P.toBase64(new Uint8Array([...P.fromBase64(good.b), 9, 9, 9])) }],
    ['header claims 200 holes', { v: P.PROTOCOL_VERSION, t: 'S', b: (() => { const b = P.fromBase64(good.b); b[8] = 200; return P.toBase64(b); })() }],
    ['intent bytes sent as a snapshot', { v: P.PROTOCOL_VERSION, t: 'S', b: P.toBase64(P.encodeIntent({ slot: 0, seq: 1, x: 0, z: 0 })) }],
    ['snapshot bytes sent as an intent', { v: P.PROTOCOL_VERSION, t: 'I', b: good.b }],
    ['keyframe envelope without the keyframe flag', { v: P.PROTOCOL_VERSION, t: 'K', b: good.b }],
    ['a 100 KB payload', { v: P.PROTOCOL_VERSION, t: 'S', b: 'A'.repeat(100000) }],
    ['duplicate slots in one snapshot', { v: P.PROTOCOL_VERSION, t: 'S', b: P.toBase64(P.encodeSnapshot({
      generation: 0, tick: 0, flags: 0, timeLeftCs: 0,
      holes: [{ slot: 3, state: 1, x: 0, z: 0, mass: 0, radius: 1, heading: 0 },
              { slot: 3, state: 1, x: 1, z: 1, mass: 0, radius: 1, heading: 0 }], events: [],
    })) }],
    ['join with no sessionId', { v: P.PROTOCOL_VERSION, t: 'join', d: {} }],
    ['control with no data object', { v: P.PROTOCOL_VERSION, t: 'join' }],
    ['control data is an array', { v: P.PROTOCOL_VERSION, t: 'join', d: ['abc'] }],
    ['welcome with a 10 KB seed', { v: P.PROTOCOL_VERSION, t: 'welcome', d: { sessionId: 'a', slot: 0, generation: 0, seed: 'x'.repeat(10000) } }],
    ['roster claiming 999 members', { v: P.PROTOCOL_VERSION, t: 'roster', d: { generation: 0, members: new Array(999).fill({}) } }],
    ['roster members is not an array', { v: P.PROTOCOL_VERSION, t: 'roster', d: { generation: 0, members: 'everyone' } }],
    ['slot 9999', { v: P.PROTOCOL_VERSION, t: 'leave', d: { slot: 9999 } }],
    ['negative slot', { v: P.PROTOCOL_VERSION, t: 'leave', d: { slot: -1 } }],
    ['fractional slot', { v: P.PROTOCOL_VERSION, t: 'leave', d: { slot: 1.5 } }],
    ['generation 300', { v: P.PROTOCOL_VERSION, t: 'host_announce', d: { sessionId: 'a', generation: 300 } }],
  ];

  let rejected = 0;
  for (const [label, env] of hostile) {
    let ok;
    try { ok = P.validate(env).ok; } catch (e) { ok = 'THREW: ' + e.message; }
    check(`rejects ${label}`, ok === false, ok === true ? 'ACCEPTED' : String(ok));
    if (ok === false) rejected++;
  }
  check(`all ${hostile.length} hostile payloads rejected`, rejected === hostile.length);
  check('the good payload still validates', P.validate(good).ok);

  // The guard never throws — a host on the hot path must be able to skip a
  // try/catch, and a decoder that throws inside validate would defeat that.
  let threw = false;
  for (const [, env] of hostile) { try { P.validate(env); } catch { threw = true; } }
  check('validate() never throws', !threw);

  // An unseated slot cannot spawn a hole on the host.
  const hub = new T.LoopbackHub({ seed: 'hostile' });
  const sim = new VoxelSandboxSim({ seed: 'hostile', scene: 'gallery' });
  const host = new H.ArenaHost({ sim, transport: hub.endpoint('host'), nowMs: () => hub.nowMs });
  const attacker = hub.endpoint('attacker');
  attacker.send(P.encodeEnvelope('I', { slot: 7, seq: 1, x: 1, z: 1 }));
  attacker.send({ v: P.PROTOCOL_VERSION, t: 'S', b: '!!!!' });
  hub.flush();
  eq('an intent for an unseated slot is counted and dropped', host.unseatedIntents, 1);
  eq('a malformed packet is counted and dropped', host.badPackets, 1);
  eq('the attacker created no drivers', host.drivers.size, 1);
}

// =============================================================================
begin('5. Supabase Realtime adapter shape (UNTESTED against the live service)');
// =============================================================================
{
  const calls = { channel: null, on: null, sent: [], subscribed: false };
  let handler = null;
  const fakeChannel = {
    on(kind, filter, cb) { calls.on = { kind, filter }; handler = cb; return this; },
    send(msg) { calls.sent.push(msg); return Promise.resolve('ok'); },
    subscribe(cb) { calls.subscribed = true; cb('SUBSCRIBED', null); return this; },
    unsubscribe() { calls.unsubscribed = true; },
  };
  const fakeClient = { channel(topic, opts) { calls.channel = { topic, opts }; return fakeChannel; } };

  const tr = new T.SupabaseRealtimeTransport(fakeClient, 'arena:K7QM');
  await tr.connect();

  eq('topic passed through', calls.channel.topic, 'arena:K7QM');
  deepEq('channel config matches the documented shape',
    calls.channel.opts, { config: { broadcast: { self: false, ack: false }, private: false } });
  eq('subscribes to broadcast', calls.on.kind, 'broadcast');
  deepEq('with an event filter', calls.on.filter, { event: 'm' });
  check('connect() resolves on SUBSCRIBED', tr.connected && calls.subscribed);

  const env = P.encodeEnvelope('I', { slot: 1, seq: 1, x: 1, z: 0 });
  tr.send(env);
  eq('send uses type: broadcast', calls.sent[0].type, 'broadcast');
  eq('send uses the channel event name', calls.sent[0].event, 'm');
  deepEq('the envelope rides in payload', calls.sent[0].payload, env);

  let got = null;
  tr.on((e) => { got = e; });
  handler({ type: 'broadcast', event: 'm', payload: env });
  deepEq('receive unwraps payload', got, env);
  got = null;
  handler(env);   // tolerate a bare payload
  deepEq('receive tolerates a bare envelope', got, env);

  tr.disconnect();
  check('disconnect unsubscribes', calls.unsubscribed === true && !tr.connected);

  check('constructing without a client throws', (() => {
    try { new T.SupabaseRealtimeTransport(null, 'x'); return false; } catch { return true; }
  })());

  // ADR-0014: no new deps. Proven structurally, not by assertion.
  const { readFileSync } = await import('node:fs');
  // These four are checked against IMPORT STATEMENTS, not against any mention of
  // the string. A file is allowed to write down why it does not import
  // supabase-js; that is documentation, not a dependency. The `Math.random`
  // check is the exception and is deliberately as blunt as the real guard in
  // tools/validate.mjs:183 (`/Math\.random\(/`), because that guard is what
  // js/net/ will be added to under T-011 and a comment with an open paren in it
  // would fail the build. Matching its bluntness here is the point.
  const importsOf = (s) => (s.match(/^\s*(?:import|export)\s[^\n]*?from\s+['"][^'"]+['"]/gm) || []).join('\n')
    + '\n' + (s.match(/\bimport\s*\(\s*['"][^'"]+['"]\s*\)/g) || []).join('\n');
  for (const f of ['protocol.js', 'snapshot.js', 'driver.js', 'transport.js', 'host.js']) {
    const s = readFileSync(new URL(ROOT + 'js/net/' + f)).toString();
    const imports = importsOf(s);
    check(`${f} imports no npm package (ADR-0014: relative paths only)`,
      !/from\s+['"][^.'"]/.test(imports) && !imports.includes('@supabase'));
    check(`${f} survives the tools/validate.mjs Math.random guard`, !/Math\.random\(/.test(s));
    check(`${f} has no three.js import (invariant 8)`, !/three/.test(imports));
  }
}

// =============================================================================
// report
// =============================================================================
const line = '-'.repeat(72);
console.log('\nFlywheel net layer self-test');
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
