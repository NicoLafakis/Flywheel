// Headless tests for the rival-visibility package.
//
//   node js/rival/rival.test.mjs
//
// Covers, per the package's [V]-tagged criteria:
//   1. per-slot keyframe attribution round-trip — a cold decoder (a late
//      joiner) recovers exactly who ate what (AC-01.4, AC-01.5), and the
//      version gate cleanly rejects the old protocol (AC-01.6);
//   2. attribution record determinism: events-first and keyframe-first arrival
//      orders converge to the same record (AC-01.2), no block double-counted
//      (AC-01.1), headless-readable without three.js (AC-01.8);
//   3. territory tint bookkeeping determinism: permuted arrival orders end in
//      identical cell ownership;
//   4. tug bar shares: exact ratios, zero-mass even split, 8 slots through the
//      same code path (AC-02.1, AC-02.6);
//   5. milestone trigger logic: exactly-once firing, lead-change hysteresis
//      under oscillation, trailing-window latch (AC-05.1);
//   6. reveal math: final percentages equal the authoritative per-slot masses
//      (AC-06.1).
//
// Exit 1 on any FAIL. No browser, no three.js, no deps.

const ROOT = new URL('../../', import.meta.url).href;

const P = await import(ROOT + 'js/net/protocol.js');
const S = await import(ROOT + 'js/net/snapshot.js');
const T = await import(ROOT + 'js/net/transport.js');
const H = await import(ROOT + 'js/net/host.js');
const PE = await import(ROOT + 'js/net/peer.js');
const { AttributionRecord, finalSplit, EATER_UNKNOWN } = await import(ROOT + 'js/rival/attribution.js');
const { TerritoryMap, columnCount } = await import(ROOT + 'js/rival/territory.js');
const { computeShares } = await import(ROOT + 'js/rival/tugbar.js');
const { BeatTracker, BEAT, BEAT_COPY } = await import(ROOT + 'js/rival/beats.js');
const { edgeProject, chevronSize } = await import(ROOT + 'js/rival/offscreen.js');
const { SLOT_IDENTITY, slotColorCss } = await import(ROOT + 'js/rival/identity.js');

let failures = 0;
const results = [];
function begin(name) { results.push({ name, checks: [], failed: 0 }); }
function check(label, cond, detail = '') {
  const r = results[results.length - 1];
  r.checks.push({ label, ok: !!cond, detail });
  if (!cond) { r.failed++; failures++; }
}
function eq(label, a, b) { check(label, Object.is(a, b) || a === b, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

// =============================================================================
begin('1. per-slot keyframe attribution round-trips cold (AC-01.5)');
// =============================================================================
{
  const COUNT = 5000;
  const slot0 = new Set([3, 4, 5, 120, 121, 4999]);
  const slot1 = new Set([1, 900, 901, 902, 2500]);
  const anon = new Set([10, 11]);
  const stream = (set) => S.encodeEatenRLE((i) => set.has(i), COUNT);
  const snap = {
    generation: 1, tick: 77, flags: P.FLAG.KEYFRAME, timeLeftCs: 12000,
    holes: [
      { slot: 0, state: 1, x: 1, z: 2, mass: 50, radius: 1.5, heading: 0 },
      { slot: 1, state: 1, x: -3, z: 4, mass: 60, radius: 1.6, heading: 1 },
    ],
    events: [],
    eatenSlots: [
      { slot: 0, rle: stream(slot0) },
      { slot: 1, rle: stream(slot1) },
      { slot: P.EATER_ANON, rle: stream(anon) },
    ],
  };
  const decoded = P.decodeSnapshot(P.encodeSnapshot(snap));
  check('keyframe carries all three streams', decoded.eatenSlots && decoded.eatenSlots.length === 3);
  const back = new Map(decoded.eatenSlots.map((s) => [s.slot, S.decodeEatenRLE(s.rle, COUNT)]));
  let exact = true;
  for (let i = 0; i < COUNT; i++) {
    if (!!back.get(0)[i] !== slot0.has(i)) exact = false;
    if (!!back.get(1)[i] !== slot1.has(i)) exact = false;
    if (!!back.get(P.EATER_ANON)[i] !== anon.has(i)) exact = false;
  }
  check('a cold decoder recovers both eaten sets exactly, plus the anonymous set', exact);

  // The envelope round trip (what actually rides the wire).
  const env = P.encodeEnvelope('K', snap);
  check('the keyframe envelope validates at v3', P.validate(env).ok);
  const dec2 = P.decodeEnvelope(env);
  check('envelope round trip keeps the per-slot streams', dec2.eatenSlots.length === 3);

  // AC-01.6: the version gate rejects the old protocol cleanly.
  check('protocol version bumped to 3', P.PROTOCOL_VERSION === 3);
  check('a v2 envelope is rejected by validate()', !P.validate({ ...env, v: 2 }).ok);

  // Malformed tails are dropped, not partially understood.
  const bytes = P.encodeSnapshot(snap);
  const truncated = bytes.slice(0, bytes.length - 2);
  let threw = false;
  try { P.decodeSnapshot(truncated); } catch { threw = true; }
  check('a truncated eaten tail throws', threw);

  // Legacy shape still frames: eatenRLE rides as one anonymous stream.
  const legacy = P.decodeSnapshot(P.encodeSnapshot({
    ...snap, eatenSlots: null, eatenRLE: stream(slot0),
  }));
  check('legacy eatenRLE input surfaces as one EATER_ANON stream and back-compat field',
    legacy.eatenSlots.length === 1 && legacy.eatenSlots[0].slot === P.EATER_ANON && !!legacy.eatenRLE);
}

// =============================================================================
begin('2. a late joiner learns who ate what through a real host/peer pair');
// =============================================================================
{
  // A stub sim: ArenaHost only reads holes/events/blocks. Slot 0 eats blocks
  // 2 and 6; slot 1 eats blocks 4 and 9 — disjoint by construction.
  const holes = [
    { slot: 0, x: 0, z: 0, mass: 10, rawMass: 8, radius: 1.2, alive: true },
    { slot: 1, x: 5, z: 5, mass: 12, rawMass: 9, radius: 1.3, alive: true },
  ];
  const blocks = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, state: 'intact' }));
  const sim = {
    holes, blocks, events: [],
    step() {
      // Tick 0 produces all four eats, attributed by the sim's rule.
      if (this._done) return;
      this._done = true;
      this.events.push({ type: 'eat', obj: { id: 2 }, hole: holes[0] });
      this.events.push({ type: 'eat', obj: { id: 6 }, hole: holes[0] });
      this.events.push({ type: 'eat', obj: { id: 4 }, hole: holes[1] });
      this.events.push({ type: 'eat', obj: { id: 9 }, hole: holes[1] });
    },
  };
  const hub = new T.LoopbackHub({ latencyMs: 5, seed: 'rival' });
  const host = new H.ArenaHost({ sim, transport: hub.endpoint('host'), generation: 1, nowMs: () => hub.nowMs });
  host.addSlot(1, 'peer');
  host.step(1 / 60, hub.nowMs);           // eats happen, events harvested

  // The "late joiner": a peer created AFTER the eats, healing purely from the
  // join keyframe — the exact scenario the old anonymous bitset failed.
  const peer = new PE.ArenaPeer({
    transport: hub.endpoint('peer'), slot: 1, sessionId: 'late', nowMs: () => hub.nowMs,
    objectCount: 11, generation: 1,
  });
  peer.join();
  hub.flush();   // JOIN reaches the host, which answers with a keyframe…
  hub.flush();   // …delivered here.
  check('the late joiner got a keyframe', peer.stats.keyframes >= 1);
  eq('peer knows all four blocks are eaten', peer.consumed.size, 4);
  eq('block 2 attributed to slot 0', peer.eaterOf.get(2), 0);
  eq('block 6 attributed to slot 0', peer.eaterOf.get(6), 0);
  eq('block 4 attributed to slot 1', peer.eaterOf.get(4), 1);
  eq('block 9 attributed to slot 1', peer.eaterOf.get(9), 1);
}

// =============================================================================
begin('3. attribution record: exactly-once, order-independent (AC-01.1/01.2)');
// =============================================================================
{
  const rawOf = (id) => id * 10;   // deterministic stand-in for block mass
  const feedA = [[5, 0], [3, 1], [8, 0], [5, 0], [3, 1]];        // dupes repeated
  const feedB = [[3, 1], [8, 0], [5, 0]];                        // same facts, other order
  const a = new AttributionRecord(rawOf);
  const b = new AttributionRecord(rawOf);
  for (const [id, slot] of feedA) a.recordEat(id, slot);
  for (const [id, slot] of feedB) b.recordEat(id, slot);
  eq('no block attributed twice (count)', a.totalCount, 3);
  check('same record from either arrival order',
    a.massBySlot[0] === b.massBySlot[0] && a.massBySlot[1] === b.massBySlot[1]
    && a.totalMass === b.totalMass);
  eq('slot 0 mass = 50 + 80', a.massBySlot[0], 130);
  eq('slot 1 mass = 30', a.massBySlot[1], 30);
  check('unknown-eater ids mark eaten without crediting anyone', (() => {
    const c = new AttributionRecord(rawOf);
    c.recordEat(7, EATER_UNKNOWN);
    return c.eaterOf.has(7) && c.totalMass === 0 && c.slotOf(7) === -1;
  })());
  check('invalid ids are refused', !a.recordEat(0, 0) && !a.recordEat(-3, 1));
}

// =============================================================================
begin('4. territory bookkeeping is deterministic under arrival order');
// =============================================================================
{
  // One column (gx 0, gz 0) holds blocks 5 (slot 1) and 2 (slot 0) — the
  // lowest eaten id must own the tile on every client, whatever order the
  // news arrives in. Second column is uncontested.
  const blk = (id, gx, gz) => ({ id, gx, gz, x: gx + 0.5, z: gz + 0.5, sx: 1, sz: 1 });
  const seqA = [[blk(5, 0, 0), 1], [blk(2, 0, 0), 0], [blk(7, 3, 0), 1]];
  const seqB = [[blk(7, 3, 0), 1], [blk(2, 0, 0), 0], [blk(5, 0, 0), 1]];
  const run = (seq) => {
    const m = new TerritoryMap();
    const actions = [];
    for (const [b, s] of seq) { const a = m.mark(b, s); if (a) actions.push(a.type); }
    return { m, actions };
  };
  const A = run(seqA), B = run(seqB);
  const owners = (m) => [...m.cells.entries()].map(([k, c]) => k + '=' + c.slot).sort().join(';');
  eq('both orders converge to identical ownership', owners(A.m), owners(B.m));
  eq('contested column owned by the lowest eaten id\'s eater', A.m.cells.get('0,0').slot, 0);
  check('order A needed a recolor, order B did not — same end state',
    A.actions.includes('recolor') && !B.actions.includes('recolor'));
  eq('one tile per column, ever', A.m.size, 2);
  eq('columnCount counts distinct footprints', columnCount([blk(1, 0, 0), blk(2, 0, 0), blk(3, 1, 1)]), 2);
  const counts = A.m.countBySlot();
  check('tile counts per slot are readable (both colors present)', counts.get(0) === 1 && counts.get(1) === 1);
}

// =============================================================================
begin('5. tug bar shares (AC-02.1 / AC-02.6)');
// =============================================================================
{
  const even = computeShares([0, 0]);
  check('zero-mass match renders an even split, no divide by zero', even[0] === 0.5 && even[1] === 0.5);
  const s = computeShares([300, 100]);
  check('a 3:1 mass vector splits 75/25 exactly', s[0] === 0.75 && s[1] === 0.25);
  check('segments always sum to the full bar', Math.abs(s[0] + s[1] - 1) < 1e-12);
  const eight = computeShares([10, 20, 30, 40, 0, 0, 0, 0]);
  eq('8 slots flow through the same code path', eight.length, 8);
  check('8-way split still tiles the bar exactly', Math.abs(eight.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  const q = computeShares([333, 667], 0.02);
  check('shares quantise to the requested step', q.every((v) => Math.abs(v * 50 - Math.round(v * 50)) < 1e-9));
}

// =============================================================================
begin('6. milestone beats: exactly-once, hysteresis (AC-05.1)');
// =============================================================================
{
  const tr = new BeatTracker({ mySlot: 1, slots: [0, 1], hysteresis: 0.08, trailingAtS: 30, maxLeadBeats: 3 });
  let beats = [];
  const feed = (shares, left, eaten = true) => { beats.push(...tr.update(shares, left, eaten)); };

  check('first eat is FIRST_BLOOD, exactly once', (() => {
    const a = tr.noteEat(0, {});
    const b = tr.noteEat(1, {});
    return a.length === 1 && a[0].type === BEAT.FIRST_BLOOD && a[0].slot === 0 && b.length === 0;
  })());

  feed([0.6, 0.4], 170);          // slot 0 clearly ahead — first leader, no beat
  eq('first clear leader does not fire LEAD_TAKEN', beats.length, 0);
  // Oscillation INSIDE the hysteresis band must stay silent.
  feed([0.52, 0.48], 160); feed([0.48, 0.52], 150); feed([0.51, 0.49], 140); feed([0.49, 0.51], 130);
  eq('oscillation across 50% within the band fires nothing', beats.length, 0);
  feed([0.40, 0.60], 120);        // slot 1 clears the band — one beat
  check('a real lead change fires once', beats.length === 1 && beats[0].type === BEAT.LEAD_TAKEN && beats[0].slot === 1);
  feed([0.40, 0.60], 118);
  eq('holding the lead does not re-fire', beats.length, 1);
  beats = [];
  feed([0.60, 0.40], 100); feed([0.40, 0.60], 90); feed([0.60, 0.40], 80); feed([0.40, 0.60], 70); feed([0.60, 0.40], 60);
  check('lead-change beats cap at MAX_LEAD_BEATS', beats.length <= 3);
  beats = [];
  feed([0.60, 0.40], 29);         // inside the trailing window, I (slot 1) am behind
  check('trailing beat fires once at 30 s', beats.length === 1 && beats[0].type === BEAT.TRAILING);
  feed([0.60, 0.40], 20); feed([0.60, 0.40], 10);
  eq('trailing beat never repeats', beats.length, 1);

  const tr2 = new BeatTracker({ mySlot: 0, slots: [0, 1] });
  eq('nothing fires before the first eat', tr2.update([0.5, 0.5], 100, false).length, 0);
  check('landmark beat carries the actor', (() => {
    const l = tr2.noteEat(1, { landmark: true });
    return l.some((x) => x.type === BEAT.LANDMARK && x.slot === 1);
  })());
  check('all copy lives in the table and names its actor',
    typeof BEAT_COPY[BEAT.FIRST_BLOOD] === 'function' && BEAT_COPY[BEAT.LEAD_TAKEN]('ORANGE').includes('ORANGE'));
}

// =============================================================================
begin('7. reveal math: final percentages equal authoritative masses (AC-06.1)');
// =============================================================================
{
  const rawOf = (id) => (id === 1 ? 120 : id === 2 ? 60 : 20);
  const rec = new AttributionRecord(rawOf);
  rec.recordEat(1, 0);   // 120 to slot 0
  rec.recordEat(2, 1);   // 60 to slot 1
  rec.recordEat(3, 1);   // 20 to slot 1
  const split = finalSplit(rec, [0, 1]);
  eq('slot 0 mass exact', split[0].mass, 120);
  eq('slot 1 mass exact', split[1].mass, 80);
  eq('slot 0 percent = 60.0', split[0].percent, 60);
  eq('slot 1 percent = 40.0', split[1].percent, 40);
  check('shares sum to 1', Math.abs(split[0].share + split[1].share - 1) < 1e-12);
  const empty = finalSplit(new AttributionRecord(rawOf), [0, 1]);
  check('an eventless match reveals an even split, not NaN', empty[0].percent === 50 && empty[1].percent === 50);
}

// =============================================================================
begin('8. chevron edge projection (AC-04.1) and the one color table (CC-3)');
// =============================================================================
{
  const W = 800, Ht = 600, INSET = 26;
  const right = edgeProject(2, 0, W, Ht, INSET, true);
  check('a rival to the right pins to the right edge, arrow pointing right',
    right.offscreen && Math.round(right.x) === W - INSET && Math.round(right.y) === Ht / 2 && right.angle === 0);
  const up = edgeProject(0, 3, W, Ht, INSET, true);
  check('a rival above pins to the top edge, arrow pointing up',
    up.offscreen && Math.round(up.y) === INSET && Math.abs(up.angle + Math.PI / 2) < 1e-9);
  const on = edgeProject(0.5, -0.5, W, Ht, INSET, true);
  check('an on-screen rival shows no chevron', !on.offscreen);
  // Hysteresis: just past the edge is NOT off-screen until it clears the band…
  const nearEdge = edgeProject(1.01, 0, W, Ht, INSET, false);
  check('just past the edge stays on-screen (no flicker out)', !nearEdge.offscreen);
  // …but once off-screen it stays off until genuinely back inside.
  const stillOff = edgeProject(1.01, 0, W, Ht, INSET, true);
  check('once off-screen, 1.01 is still off-screen (no flicker in)', stillOff.offscreen);
  check('chevron size grows with mass and clamps', chevronSize(0) < chevronSize(400) && chevronSize(1e9) === chevronSize(1e12));

  eq('identity table covers 8 slots', SLOT_IDENTITY.length, 8);
  check('slots 0/1 keep the shipped duel colors', slotColorCss(0) === '#4da3ff' && slotColorCss(1) === '#ff8b2d');
  check('every slot color is distinct', new Set(SLOT_IDENTITY.map((s) => s.css)).size === 8);
}

// =============================================================================
// report
// =============================================================================
let totalChecks = 0;
for (const r of results) {
  totalChecks += r.checks.length;
  const mark = r.failed ? 'FAIL' : ' ok ';
  console.log(`[${mark}] ${r.name}`);
  for (const c of r.checks) {
    if (!c.ok) console.log(`       FAIL: ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
  }
}
console.log(`\n${totalChecks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
