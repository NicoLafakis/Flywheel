// Track-integrity / derail / ground-run / eatable self-test for the simulated
// mover seam (js/voxelsim.js "mover simulation"), on the Chicago Loop train.
// No browser, no backend, no deps.
//
//   node tools/train-derail-selftest.mjs
//
// What it pins, in order:
//   1. wiring — the scene's `sim:` config builds a mover runtime, unit ids
//      extend the block id space, and the INTACT loop never false-derails
//      (every arc sample reads solid track; three idle seconds keep 4 riders);
//   2. determinism — two runs of the same seed + the same scripted inputs
//      (a Lake-leg deck section consumed at a fixed tick) produce bit-identical
//      derail ticks, landings and final unit poses; every car derails, lands
//      on the street, and keeps running the route at ground level;
//   3. consumption — a grounded car over a grown hole's void sinks, is
//      consumed through the real path (`_award`): eat event with the unit's
//      object id, mass × combo credited to the COVERING hole (a second,
//      far-away hole gets nothing);
//   4. the wire — the car's eat event maps to a wire event, survives an
//      encode/decode round trip, and the keyframe's eaten RLE over
//      `sim.objectIdSpace` carries the unit's bit;
//   5. host/peer convergence — a real ArenaHost + ArenaPeer over a lossy
//      LoopbackHub (120 ms / 30 ms jitter / 5% drop) with the track eaten
//      mid-match: the peer ends up knowing every consumed id (track blocks
//      AND the swallowed car), and replaying the host's recorded inputs plus
//      the same scripted mutations into a fresh sim reproduces the mover
//      states bit for bit — the mover runtime is a pure function of sim
//      history, which is the whole multiplayer story.
//
// Exit 1 on any FAIL.

const ROOT = new URL('../', import.meta.url).href;

const { VoxelSandboxSim, moverPose, comboMult } = await import(ROOT + 'js/voxelsim.js');
const S = await import(ROOT + 'js/net/snapshot.js');
const P = await import(ROOT + 'js/net/protocol.js');
const T = await import(ROOT + 'js/net/transport.js');
const H = await import(ROOT + 'js/net/host.js');
const PE = await import(ROOT + 'js/net/peer.js');
const A = await import(ROOT + 'js/rival/attribution.js');

let failures = 0;
const results = [];
function begin(name) { results.push({ name, checks: [], failed: 0 }); }
function check(label, cond, detail = '') {
  const r = results[results.length - 1];
  r.checks.push({ label, ok: !!cond, detail });
  if (!cond) { r.failed++; failures++; }
}

const DT = 1 / 60;
const SEED = 'train-derail';
// The scripted gap: a Lake-leg deck section, clear of stations and junctions.
const GAP = { x0: -16, x1: -8, z0: -57.5, z1: -47.5, y: 5.25 };
const GAP_TICK = 180;   // 3 s in — the sim is warm, the train mid-lap

function eatGap(sim) {
  // Deterministic order: block-array order, exactly how the shared validator's
  // win guard feeds `_consume` directly.
  const ids = [];
  for (const b of sim.blocks) {
    if (b.state !== 'static') continue;
    if (b.x >= GAP.x0 && b.x <= GAP.x1 && b.z >= GAP.z0 && b.z <= GAP.z1 && b.y > GAP.y) {
      sim._consume(b, sim.holes[0]);
      ids.push(b.id);
    }
  }
  return ids;
}

// =============================================================================
begin('1. wiring + intact-track integrity');
// =============================================================================
{
  const sim = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
  const rt = sim.moverSim && sim.moverSim[0];
  check('the scene opted the train into the simulation (sim.moverSim wired)', !!rt);
  check('four units, one per car', rt && rt.units.length === 4);
  let maxBlockId = 0;
  for (const b of sim.blocks) if (b.id > maxBlockId) maxBlockId = b.id;
  check('unit ids extend the block id space (one wire format for both)',
    rt && rt.units.every((u) => u.id > maxBlockId));
  check(`sim.objectIdSpace covers the units (${sim.objectIdSpace})`,
    rt && sim.objectIdSpace === rt.units[rt.units.length - 1].id + 1);
  check('capabilities are flags, not train hardcode',
    rt && rt.derail === true && rt.groundRun === true && rt.eatable === true);

  // The whole intact circuit reads as solid track — no false derail anywhere,
  // including the stepped-arc corners.
  let bad = 0;
  for (let s = 0; s < rt.arc.total; s += 0.25) if (!sim.moverTrackOk(0, s)) bad++;
  check(`intact loop: 0 unsupported samples over ${Math.ceil(rt.arc.total / 0.25)} probes`, bad === 0, `${bad} bad`);

  for (let i = 0; i < 180; i++) sim.step(DT, { x: 0, z: 0 });
  check('3 s idle: all four cars still riding', rt.units.every((u) => u.phase === 'ride'));
  sim.events.length = 0;
}

// =============================================================================
begin('2. derail determinism: same seed + same script, twice');
// =============================================================================
{
  const run = () => {
    const sim = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
    const rt = sim.moverSim[0];
    const derailTick = new Map(), landTick = new Map();
    const groundTrail = new Map();  // unit -> [x at 55 s, x at 65 s]
    for (let tick = 0; tick < 70 * 60; tick++) {
      if (tick === GAP_TICK) eatGap(sim);
      sim.step(DT, { x: 0, z: 0 });
      for (const ev of sim.events) {
        if (ev.type === 'derail' && !derailTick.has(ev.unit)) derailTick.set(ev.unit, tick);
      }
      sim.events.length = 0;
      rt.units.forEach((u, ui) => {
        if ((u.phase === 'ground' || u.phase === 'rest') && u.y <= 0.5 && !landTick.has(ui)) landTick.set(ui, tick);
      });
      if (tick === 55 * 60 || tick === 65 * 60) {
        rt.units.forEach((u, ui) => {
          const a = groundTrail.get(ui) || [];
          a.push({ x: u.x, z: u.z });
          groundTrail.set(ui, a);
        });
      }
    }
    return { sim, rt, derailTick, landTick, groundTrail };
  };
  const A = run(), B = run();

  check(`every car derails within the run (${A.derailTick.size}/4)`, A.derailTick.size === 4);
  check(`every car reaches the street (${A.landTick.size}/4 grounded at y<=0.5)`, A.landTick.size === 4);
  check('cars reach the gap on their own schedules (derail ticks are distinct)',
    new Set(A.derailTick.values()).size === A.derailTick.size);

  let sameTicks = true;
  for (const [ui, t] of A.derailTick) if (B.derailTick.get(ui) !== t) sameTicks = false;
  check('derail ticks identical across runs', sameTicks && B.derailTick.size === A.derailTick.size);

  let bitIdentical = true, detail = '';
  for (let ui = 0; ui < 4; ui++) {
    const a = A.rt.units[ui], b = B.rt.units[ui];
    for (const f of ['x', 'y', 'z', 's', 'vy', 'tilt']) {
      if (!Object.is(a[f], b[f])) { bitIdentical = false; detail = `unit ${ui}.${f}: ${a[f]} vs ${b[f]}`; }
    }
    if (a.phase !== b.phase) { bitIdentical = false; detail = `unit ${ui}.phase`; }
  }
  check('final unit states bit-identical across runs', bitIdentical, detail);

  let moving = 0;
  for (let ui = 0; ui < 4; ui++) {
    const tr = A.groundTrail.get(ui);
    if (tr && tr.length === 2 && Math.hypot(tr[1].x - tr[0].x, tr[1].z - tr[0].z) > 5) moving++;
  }
  check(`grounded cars keep running the route (${moving}/4 moved >5 m between 55 s and 65 s)`, moving === 4);
  check('no NaN in any unit state',
    A.rt.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.z)));
}

// =============================================================================
begin('3. a derailed car is eatable, credited to the covering hole');
// =============================================================================
{
  const sim = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
  const rt = sim.moverSim[0];
  const h = sim.holes[0];
  const h2 = sim.addHole(100, 80);   // the control: far away, eats nothing
  for (let i = 0; i < GAP_TICK; i++) { sim.step(DT, [{ x: 0, z: 0 }, null]); sim.events.length = 0; }
  eatGap(sim);
  sim.events.length = 0;
  // Wait for the first car to be running at street level.
  let guard = 0;
  while (!rt.units.some((u) => u.phase === 'ground' && u.y <= 0.1) && guard++ < 3600) {
    sim.step(DT, [{ x: 0, z: 0 }, null]);
    sim.events.length = 0;
  }
  const lead = rt.units.find((u) => u.phase === 'ground' && u.y <= 0.1);
  check('a car is ground-running to park a hole in front of', !!lead);

  // A legitimately-grown hole (raw mass backs the radius, as the ladder would
  // have it) parked on the route ahead of the runaway.
  const p = moverPose(rt.arc, lead.s + 20);
  h.x = p.x; h.z = p.z;
  h.rawMass = 2600; h.size = 7; h.radius = 4;
  const before = { eaten: h.eatenCount, raw2: h2.rawMass, count2: h2.eatenCount };
  let ate = null;
  for (let k = 0; k < 20 * 60 && !ate; k++) {
    sim.step(DT, [{ x: 0, z: 0 }, null]);
    for (const ev of sim.events) {
      if (ev.type === 'eat' && ev.obj && ev.obj.mover) {
        ate = { id: ev.obj.id, gained: ev.gained, chain: ev.chain, hole: ev.hole };
      }
    }
    sim.events.length = 0;
  }
  check('a runaway car was consumed', !!ate);
  if (ate) {
    check('the eat event carries the unit object id',
      rt.units.some((u) => u.id === ate.id && u.phase === 'consumed'));
    check('credited to the covering hole (holes[0])', ate.hole === h);
    check(`mass is the declared 75 × the live combo (gained ${ate.gained} at chain ${ate.chain})`,
      ate.gained === 75 * comboMult(ate.chain));
    check('the eater\'s tallies moved (eatenCount, rawMass through _award)',
      h.eatenCount > before.eaten && h.rawMass > 2600);
    check('the far hole got nothing', h2.rawMass === before.raw2 && h2.eatenCount === before.count2);
  }
}

// =============================================================================
begin('4. the wire: unit eats ride the same format as block eats');
// =============================================================================
{
  const sim = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
  const rt = sim.moverSim[0];
  const unitId = rt.units[0].id;
  // Fake the sim having consumed unit 0 the honest way.
  rt.units[0].phase = 'fall';
  rt.units[0].y = -3;
  sim._consumeMoverUnit(rt, rt.units[0], sim.holes[0]);

  const wire = S.captureEvents(sim.events, () => 0);
  const eat = wire.find((e) => e.objectId === unitId);
  check('captureEvents maps the car eat to a wire event with the unit id', !!eat);

  // Wire events attach post-capture, exactly as ArenaHost._snapshot does.
  const snap = S.captureSnapshot(sim, { tick: 7, events: [] });
  snap.events = wire;
  const rtSnap = P.decodeSnapshot(P.encodeSnapshot(snap));
  check('the unit id survives an encode/decode round trip',
    rtSnap.events.some((e) => e.objectId === unitId));

  const consumed = new Set([unitId, 5, 6]);
  const rle = S.encodeEatenRLE((i) => consumed.has(i), sim.objectIdSpace);
  const back = S.decodeEatenRLE(rle, sim.objectIdSpace);
  check('the keyframe RLE over sim.objectIdSpace carries the unit bit',
    back[unitId] === 1 && back[5] === 1 && back[unitId + 1] === 0);

  const host = new H.ArenaHost({ sim, transport: new T.LoopbackHub({ seed: 'x' }).endpoint('h'), generation: 1 });
  check(`ArenaHost adopts the sim's published id space (${host.objectIdSpace})`,
    host.objectIdSpace === sim.objectIdSpace);
  host.dispose();
  sim.events.length = 0;
}

// =============================================================================
begin('5. host/peer convergence over lossy loopback, track eaten mid-run');
// =============================================================================
{
  const FRAME_MS = 1000 / 60;
  const TICKS = 50 * 60;
  const EAT_HOLE_TICK = 30 * 60;   // late enough that a car is street-running

  // The scripted mutations, applied identically to the live host sim and the
  // replay sim — they are part of the match's inputs.
  const script = (sim, tick) => {
    if (tick === GAP_TICK) eatGap(sim);
    if (tick === EAT_HOLE_TICK) {
      const rt = sim.moverSim[0];
      const lead = rt.units.find((u) => u.phase === 'ground') || rt.units[0];
      const p = moverPose(rt.arc, lead.s + 18);
      const h = sim.holes[0];
      h.x = p.x; h.z = p.z;
      h.rawMass = 2600; h.size = 7; h.radius = 4;
    }
  };

  const hub = new T.LoopbackHub({ latencyMs: 120, jitterMs: 30, dropRate: 0.05, seed: 'train-wifi' });
  const sim = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
  const h1 = sim.addHole(90, 70);
  const host = new H.ArenaHost({
    sim, transport: hub.endpoint('host'), generation: 1, durationTicks: TICKS,
    nowMs: () => hub.nowMs, seed: SEED,
  });
  host.addSlot(1, 'peer');
  const peer = new PE.ArenaPeer({
    transport: hub.endpoint('peer'), slot: 1, sessionId: 't', nowMs: () => hub.nowMs,
    spawn: { x: 90, z: 70 }, objectCount: sim.objectIdSpace, generation: 1,
  });
  peer.join();

  // The host's attribution record, fed exactly the way the arena page feeds
  // it (drained sim events; eater slot = hole roster index), over the one true
  // mass lookup — blocks AND mover units (the scoring-parity fix under test).
  const hostAttr = new A.AttributionRecord(A.cityRawMassOf(sim));
  const carEats = [];   // { id, gained, chain } for every swallowed car
  for (let tick = 0; tick < TICKS; tick++) {
    hub.advance(FRAME_MS);
    script(sim, tick);
    host.step(DT, hub.nowMs);
    for (const ev of sim.drainEvents()) {   // main.js's drain, standing in
      if (ev.type === 'eat' && ev.obj && ev.obj.id != null) {
        const s = sim.holes.indexOf(ev.hole);
        hostAttr.recordEat(ev.obj.id, s >= 0 ? s : 0);
        if (ev.obj.mover) carEats.push({ id: ev.obj.id, gained: ev.gained, chain: ev.chain });
      }
    }
    peer.update(hub.nowMs, FRAME_MS);
  }
  host.sendKeyframe(hub.nowMs);
  hub.flush();
  peer.update(hub.nowMs, FRAME_MS);

  const rt = sim.moverSim[0];
  const consumedUnits = rt.units.filter((u) => u.phase === 'consumed');
  check(`the hole swallowed at least one car during the match (${consumedUnits.length})`, consumedUnits.length >= 1);
  check(`the impairment was real (${hub.stats.dropped} of ${hub.stats.sent} dropped)`, hub.stats.dropped > 0);

  let missing = 0;
  for (const id of host._eatenIds) if (!peer.consumed.has(id)) missing++;
  check(`the peer knows every consumed id incl. track blocks (${host._eatenIds.size} eaten, ${missing} missing)`, missing === 0);
  check('the peer knows the swallowed car(s) by object id',
    consumedUnits.every((u) => peer.consumed.has(u.id)));
  check('the peer never invented an eat',
    [...peer.consumed].every((id) => host._eatenIds.has(id)));

  // Replay: recorded intents + the same scripted mutations into a FRESH sim —
  // the mover runtime must land in the same state bit for bit.
  const t0 = host.traceForSlot(0), t1 = host.traceForSlot(1);
  const sim2 = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
  sim2.addHole(90, 70);
  for (let tick = 0; tick < TICKS; tick++) {
    script(sim2, tick);
    sim2.step(DT, [t0[tick] || { x: 0, z: 0 }, t1[tick] || { x: 0, z: 0 }]);
    sim2.events.length = 0;
  }
  const rt2 = sim2.moverSim[0];
  let same = true, detail = '';
  for (let ui = 0; ui < 4; ui++) {
    const a = rt.units[ui], b = rt2.units[ui];
    if (a.phase !== b.phase) { same = false; detail = `unit ${ui} phase ${a.phase} vs ${b.phase}`; }
    for (const f of ['x', 'y', 'z', 's', 'vy']) {
      if (!Object.is(a[f], b[f])) { same = false; detail = detail || `unit ${ui}.${f}`; }
    }
  }
  check('replay reproduces every unit state bit for bit', same, detail);
  check('replay reproduces the eater\'s mass bit for bit',
    Object.is(sim.holes[0].mass, sim2.holes[0].mass) && Object.is(sim.holes[0].rawMass, sim2.holes[0].rawMass));
  check('no NaN anywhere at match end',
    rt.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y)) && Number.isFinite(sim.holes[0].mass));

  // --- arena scoring parity (the 216be53 caveat this section closes) --------
  // A car eaten IN AN ARENA MATCH must score like it does solo: the host sim's
  // `_award` grants the declared 75 raw × the live combo, and the attribution
  // record (tug bar / reveal winner) credits the same 75 raw — never the 0 a
  // blocks-only mass map returned for a mover id.
  check('arena-context car eats award 75 × combo through the host sim (solo parity)',
    carEats.length >= 1 && carEats.every((e) => e.gained === rt.unitMass * comboMult(e.chain)));
  check(`the mass lookup resolves a unit id to the declared unitMass (${rt.unitMass})`,
    rt.units.every((u) => A.cityRawMassOf(sim)(u.id) === rt.unitMass));
  check('host attribution credits every swallowed car\'s raw mass to slot 0',
    consumedUnits.every((u) => hostAttr.eaterOf.get(u.id) === 0)
      && hostAttr.massBySlot[0] >= consumedUnits.length * rt.unitMass);

  // The peer's record, built the way the arena page builds it: a never-stepped
  // local city (same seed), eats folded in from the wire (consumed + eaterOf).
  const peerCity = new VoxelSandboxSim({ seed: SEED, scene: 'chicago' });
  const peerAttr = new A.AttributionRecord(A.cityRawMassOf(peerCity));
  for (const id of peer.consumed) {
    peerAttr.recordEat(id, peer.eaterOf.has(id) ? peer.eaterOf.get(id) : -1);
  }
  // Tolerance: same id set, but fold-in ORDER differs host vs peer, and float
  // addition is order-sensitive in the last ulps.
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  check('peer attribution converges to the host\'s per-slot mass tallies (lossy wire)',
    close(peerAttr.massBySlot[0], hostAttr.massBySlot[0])
      && close(peerAttr.massBySlot[1], hostAttr.massBySlot[1])
      && close(peerAttr.totalMass, hostAttr.totalMass));
  check('peer attribution includes the swallowed car(s) at full mass',
    consumedUnits.every((u) => peerAttr.eaterOf.get(u.id) === 0));

  // The peer's DISPLAYED score for the eater converges too: the snapshot's
  // hole mass is the sim's combo-multiplied score, quantized u16/4 on the wire.
  const eaterGhost = peer.roster.bySlot.get(0);
  check('the peer\'s displayed eater score converges to the host\'s (≤ wire quantum 0.25)',
    !!eaterGhost && Math.abs(eaterGhost.mass - sim.holes[0].mass) <= 0.25);

  peer.dispose(); host.dispose();
}

// =============================================================================
// report
// =============================================================================
const line = '-'.repeat(72);
console.log('\nFlywheel train derail/ground-run/eatable self-test');
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
