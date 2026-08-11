// Offline self-test for js/net/arena.js: room codes, seed derivation, and the
// join handshake over a LoopbackHub. No network, no browser, no deps.
//
//   node tools/arena-selftest.mjs

const ROOT = new URL('../', import.meta.url).href;

const A = await import(ROOT + 'js/net/arena.js');
const T = await import(ROOT + 'js/net/transport.js');
const P = await import(ROOT + 'js/net/protocol.js');

let failures = 0;
const results = [];
function begin(name) { results.push({ name, checks: [], failed: 0 }); }
function check(label, cond, detail = '') {
  const r = results[results.length - 1];
  r.checks.push({ label, ok: !!cond, detail });
  if (!cond) { r.failed++; failures++; }
}
function eq(label, a, b) { check(label, a === b, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

// ---------------------------------------------------------------------------
begin('1. room codes: alphabet, length, uniqueness, uniformity');
// ---------------------------------------------------------------------------
{
  check('alphabet has no vowels', ![...'AEIOU'].some((c) => A.ROOM_CODE_ALPHABET.includes(c)));
  check('alphabet has no confusables (O 0 I 1 L)', ![...'O0I1L'].some((c) => A.ROOM_CODE_ALPHABET.includes(c)));
  eq('alphabet size', A.ROOM_CODE_ALPHABET.length, 27);
  check('alphabet has no duplicates', new Set(A.ROOM_CODE_ALPHABET).size === A.ROOM_CODE_ALPHABET.length);

  const seen = new Set();
  const counts = new Map();
  for (let i = 0; i < 2000; i++) {
    const c = A.mintRoomCode();
    if (c.length !== A.ROOM_CODE_LENGTH || ![...c].every((ch) => A.ROOM_CODE_ALPHABET.includes(ch))) {
      check(`bad minted code ${c}`, false);
    }
    seen.add(c);
    for (const ch of c) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  // Not `=== 2000`: 2000 draws from 27^5 = 14.3 M collide by birthday bound in
  // ~13% of runs, so exact uniqueness is a coin-flip test. One collision is
  // expected noise; three would mean the mint is biased.
  check(`2000 minted codes are near-unique (${seen.size})`, seen.size >= 1998);
  // Rejection sampling should keep every symbol within a loose band of the
  // expected 2000*5/27 ≈ 370. A modulo-biased mint fails this.
  const expected = (2000 * A.ROOM_CODE_LENGTH) / A.ROOM_CODE_ALPHABET.length;
  let worst = 0;
  for (const ch of A.ROOM_CODE_ALPHABET) {
    const dev = Math.abs((counts.get(ch) || 0) - expected) / expected;
    if (dev > worst) worst = dev;
  }
  check(`symbol distribution roughly uniform (worst deviation ${(worst * 100).toFixed(0)}%)`, worst < 0.35);
  check('every minted code validates', [...seen].every(A.isValidRoomCode));
}

// ---------------------------------------------------------------------------
begin('2. normalization is forgiving (global rule 3)');
// ---------------------------------------------------------------------------
{
  eq('lowercase', A.normalizeRoomCode('k7qm3'), 'K7QM3');
  eq('stray spaces', A.normalizeRoomCode('  K7 QM3 '), 'K7QM3');
  eq('dashes', A.normalizeRoomCode('K7-QM3'), 'K7QM3');
  eq('pasted invite URL', A.normalizeRoomCode('https://flywheel-woad.vercel.app/arena.html?room=K7QM3'), 'K7QM3');
  eq('pasted URL with more params', A.normalizeRoomCode('arena.html?room=k7qm3&x=1'), 'K7QM3');
  eq('garbage in, empty out', A.normalizeRoomCode('!!!'), '');
  eq('empty in, empty out', A.normalizeRoomCode(''), '');
  eq('non-string', A.normalizeRoomCode(null), '');
  check('a code with an out-of-alphabet char normalizes but does not validate',
    A.normalizeRoomCode('AEIOU') === 'AEIOU' && !A.isValidRoomCode('AEIOU'));
  check('too short / too long fail validation', !A.isValidRoomCode('BCD') && !A.isValidRoomCode('BCDFGHJ'));
}

// ---------------------------------------------------------------------------
begin('3. seed and topic derivation are deterministic');
// ---------------------------------------------------------------------------
{
  eq('seed is a pure function of the code', A.deriveSeed('K7QM3'), A.deriveSeed('K7QM3'));
  eq('seed shape', A.deriveSeed('K7QM3'), 'arena:K7QM3');
  check('different codes, different seeds', A.deriveSeed('K7QM3') !== A.deriveSeed('K7QM4'));
  eq('topic shape', A.roomTopic('K7QM3'), 'arena:K7QM3');
  check('session ids are unique-ish', A.mintSessionId() !== A.mintSessionId());
}

// ---------------------------------------------------------------------------
begin('4. join handshake over loopback: welcome, roster, seats');
// ---------------------------------------------------------------------------
{
  const hub = new T.LoopbackHub({ latencyMs: 5, seed: 'arena-join' });
  const code = 'K7QM3';
  const host = new A.ArenaRoomHost({ transport: hub.endpoint('host'), code, maxPlayers: 2 });
  const seats = [];
  host.onSeat = (slot, m) => seats.push({ slot, name: m.name });

  const peer = new A.ArenaRoomPeer({ transport: hub.endpoint('p1'), code, name: 'SAM' });
  const rosters = [];
  peer.onRoster = (m) => rosters.push(m);

  const joinP = peer.join({ timeoutMs: 2000 });
  // Walk the virtual clock so the JOIN and the WELCOME cross the hub.
  for (let i = 0; i < 10; i++) { hub.advance(10); await Promise.resolve(); }
  const res = await joinP;

  eq('peer got slot 1', res.slot, 1);
  eq('peer got the derived seed', res.seed, A.deriveSeed(code));
  eq('peer got the generation', res.generation, 1);
  eq('host seated exactly one player', seats.length, 1);
  eq('the seat callback fired for slot 1', seats[0].slot, 1);
  eq('the seat kept the joiner\'s name', seats[0].name, 'SAM');
  check('roster reached the peer', rosters.length >= 1 && rosters[rosters.length - 1].length === 2);
  eq('host reports 2 players', host.playerCount, 2);
  check('host reports full', host.isFull);

  // A duplicate JOIN from the same session is idempotent: same slot again.
  const again = peer.join({ timeoutMs: 2000 });
  for (let i = 0; i < 10; i++) { hub.advance(10); await Promise.resolve(); }
  eq('rejoin resolves to the same slot', (await again).slot, 1);
  eq('rejoin did not seat anyone new', seats.length, 1);

  // Match start crosses.
  let started = null;
  peer.onMatchStart = (m) => { started = m; };
  host.sendMatchStart({ durationTicks: 180 * 60 });
  hub.flush();
  check('MATCH_START arrived', !!started);
  eq('with the seed', started && started.seed, A.deriveSeed(code));
  eq('with the duration', started && started.durationTicks, 180 * 60);

  // Host leaving on purpose: peers hear it.
  let hostLeft = false;
  peer.onHostLeft = () => { hostLeft = true; };
  host.sendHostLeave();
  hub.flush();
  check('HOST LEFT reached the peer', hostLeft);

  host.dispose(); peer.dispose();
}

// ---------------------------------------------------------------------------
begin('5. room full and no host');
// ---------------------------------------------------------------------------
{
  const hub = new T.LoopbackHub({ latencyMs: 5, seed: 'arena-full' });
  const host = new A.ArenaRoomHost({ transport: hub.endpoint('host'), code: 'BCDFG', maxPlayers: 2 });

  const p1 = new A.ArenaRoomPeer({ transport: hub.endpoint('p1'), code: 'BCDFG' });
  const j1 = p1.join({ timeoutMs: 2000 });
  for (let i = 0; i < 10; i++) { hub.advance(10); await Promise.resolve(); }
  eq('first joiner seated', (await j1).slot, 1);

  const p2 = new A.ArenaRoomPeer({ transport: hub.endpoint('p2'), code: 'BCDFG' });
  const j2 = p2.join({ timeoutMs: 2000 });
  for (let i = 0; i < 10; i++) { hub.advance(10); await Promise.resolve(); }
  let fullErr = null;
  try { await j2; } catch (e) { fullErr = e; }
  check('second joiner was rejected', !!fullErr);
  eq('with code room_full', fullErr && fullErr.code, 'room_full');
  eq('the room did not over-seat', host.playerCount, 2);

  // Leave frees the seat; the next joiner takes it.
  p1.leave();
  hub.flush();
  eq('leave freed the seat', host.playerCount, 1);
  const p3 = new A.ArenaRoomPeer({ transport: hub.endpoint('p3'), code: 'BCDFG' });
  const j3 = p3.join({ timeoutMs: 2000 });
  for (let i = 0; i < 10; i++) { hub.advance(10); await Promise.resolve(); }
  eq('freed slot is re-seated', (await j3).slot, 1);

  // Join with no host at all: a clean, coded timeout.
  const lonely = new A.ArenaRoomPeer({ transport: hub.endpoint('p4'), code: 'ZZZZZ' });
  // (Same hub, but nobody answers a JOIN for a session the host never sees —
  // simulate an empty room by disposing the host first.)
  host.dispose();
  const j4 = lonely.join({ timeoutMs: 150 });
  hub.flush();
  let noHost = null;
  try { await j4; } catch (e) { noHost = e; }
  check('joining a hostless room fails', !!noHost);
  eq('with code no_host', noHost && noHost.code, 'no_host');

  p1.dispose(); p2.dispose(); p3.dispose(); lonely.dispose();
}

// ---------------------------------------------------------------------------
begin('6. the REJECT control message passes the wire guard');
// ---------------------------------------------------------------------------
{
  const env = P.encodeEnvelope(P.CONTROL.REJECT, { sessionId: 'abc', reason: 'room_full' });
  check('REJECT validates', P.validate(env).ok, P.validate(env).reason);
  check('REJECT without a reason fails', !P.validate({ v: P.PROTOCOL_VERSION, t: 'reject', d: { sessionId: 'abc' } }).ok);
  check('REJECT with a huge reason fails', !P.validate({ v: P.PROTOCOL_VERSION, t: 'reject', d: { sessionId: 'abc', reason: 'x'.repeat(100) } }).ok);
}

// ---------------------------------------------------------------------------
begin('7. the scene rides the WELCOME (host choice, allowlist-guarded)');
// ---------------------------------------------------------------------------
{
  // The allowlist is the finished cities and nothing else.
  check('allowlist holds the six finished scenes',
    ['gallery', 'manhattan', 'upper-manhattan', 'brooklyn', 'boston', 'cambridge']
      .every((s) => A.ARENA_SCENES.includes(s)) && A.ARENA_SCENES.length === 6);
  check('chicago is not on the allowlist yet', !A.isArenaScene('chicago'));
  check('every allowlisted scene has a player-facing label',
    A.ARENA_SCENES.every((s) => typeof A.SCENE_LABELS[s] === 'string' && A.SCENE_LABELS[s].length > 0));

  // Round trip: the host's pick arrives in the joiner's seat.
  const hub = new T.LoopbackHub({ latencyMs: 5, seed: 'arena-scene' });
  const host = new A.ArenaRoomHost({ transport: hub.endpoint('host'), code: 'K7QM3', maxPlayers: 2, scene: 'manhattan' });
  const peer = new A.ArenaRoomPeer({ transport: hub.endpoint('p1'), code: 'K7QM3' });
  const joinP = peer.join({ timeoutMs: 2000 });
  for (let i = 0; i < 10; i++) { hub.advance(10); await Promise.resolve(); }
  const seat = await joinP;
  eq('the WELCOME carried the host\'s scene', seat.scene, 'manhattan');
  eq('the peer remembers it', peer.scene, 'manhattan');
  host.dispose(); peer.dispose();

  // A host defaults to the gallery; an unknown scene never opens a room.
  const dhost = new A.ArenaRoomHost({ transport: hub.endpoint('h2'), code: 'BCDFG', maxPlayers: 2 });
  eq('host default scene is gallery', dhost.scene, 'gallery');
  dhost.dispose();
  let threw = null;
  try { new A.ArenaRoomHost({ transport: hub.endpoint('h3'), code: 'BCDFG', scene: 'chicago' }); } catch (e) { threw = e; }
  check('hosting an off-allowlist scene throws', !!threw);

  // The wire guard: never trust the scene string.
  const good = P.encodeEnvelope(P.CONTROL.WELCOME, { sessionId: 'abc', slot: 1, seed: 'arena:K7QM3', generation: 1, scene: 'brooklyn' });
  check('WELCOME with an allowlisted scene validates', P.validate(good).ok, P.validate(good).reason);
  check('WELCOME without a scene fails',
    !P.validate({ v: P.PROTOCOL_VERSION, t: 'welcome', d: { sessionId: 'abc', slot: 1, seed: 's', generation: 1 } }).ok);
  check('WELCOME with an unknown scene fails',
    !P.validate({ v: P.PROTOCOL_VERSION, t: 'welcome', d: { sessionId: 'abc', slot: 1, seed: 's', generation: 1, scene: 'xyzzy' } }).ok);
  check('WELCOME with chicago fails (not shipped)',
    !P.validate({ v: P.PROTOCOL_VERSION, t: 'welcome', d: { sessionId: 'abc', slot: 1, seed: 's', generation: 1, scene: 'chicago' } }).ok);
  check('WELCOME with a non-string scene fails',
    !P.validate({ v: P.PROTOCOL_VERSION, t: 'welcome', d: { sessionId: 'abc', slot: 1, seed: 's', generation: 1, scene: 42 } }).ok);

  // Version guard: a v1 client's envelope is dropped, not misread.
  check('protocol version is 3 (v3: per-slot eaten streams in the keyframe tail)', P.PROTOCOL_VERSION === 3);
  check('a v1 envelope fails validation',
    !P.validate({ v: 1, t: 'welcome', d: { sessionId: 'abc', slot: 1, seed: 's', generation: 1, scene: 'gallery' } }).ok);
}

// ---------------------------------------------------------------------------
begin('8. determinism: same seed + same scene builds the identical city');
// ---------------------------------------------------------------------------
{
  const V = await import(ROOT + 'js/voxelsim.js');
  const seed = A.deriveSeed('K7QM3');
  const a = new V.VoxelSandboxSim({ seed, scene: 'manhattan' });
  const b = new V.VoxelSandboxSim({ seed, scene: 'manhattan' });
  check(`manhattan is a real city (${a.blocks.length} blocks)`, a.blocks.length > 10000);
  eq('block counts match across the two builds', a.blocks.length, b.blocks.length);
  const sig = (s) => {
    let h = 0;
    for (const bl of s.blocks) {
      h = (h * 31 + Math.round(bl.x * 100) + Math.round(bl.z * 100) * 7 + Math.round(bl.mass * 4) * 13) >>> 0;
    }
    return h;
  };
  eq('block layout signatures match across the two builds', sig(a), sig(b));
  const g = new V.VoxelSandboxSim({ seed, scene: 'gallery' });
  check('a different scene really is a different city', g.blocks.length !== a.blocks.length);
}

// ---------------------------------------------------------------------------
begin('9. host-eaten blocks reach the peer despite per-frame drainEvents');
// ---------------------------------------------------------------------------
// Regression for the two-phone repro: blocks the host ate stayed visible on
// the peer forever. Root cause: the arena page calls sim.drainEvents() every
// frame, which REPLACES sim.events with a fresh array; ArenaHost's harvest
// cursor only reset when the new array was SHORTER than the cursor, so under
// steady eating the eat events (always at the low indexes) were sliced off
// and never reached the wire or the keyframe's eaten set. This drives the
// exact page loop — step, drain, repeat — and demands the peer learn every
// consumed block, with the last keyframe healing anything a drop lost.
{
  const H = await import(ROOT + 'js/net/host.js');
  const PE = await import(ROOT + 'js/net/peer.js');
  const V = await import(ROOT + 'js/voxelsim.js');
  const FIXED_DT = H.FIXED_DT;
  const FRAME_MS = 1000 / 60;

  const hub = new T.LoopbackHub({ latencyMs: 30, seed: 'eaten-regress' });
  const sim = new V.VoxelSandboxSim({ seed: 'eaten-regress', scene: 'gallery' });
  sim.holes[0].x = -8; sim.holes[0].z = 8;
  sim.addHole(8, 8);

  const host = new H.ArenaHost({
    sim, transport: hub.endpoint('host'), generation: 1, durationTicks: 60 * 60,
    readInput: () => ({ x: Math.cos(hub.nowMs / 2500), z: Math.sin(hub.nowMs / 2500) }),
    nowMs: () => hub.nowMs,
  });
  host.addSlot(1, 'peer');
  let maxBlockId = 0;
  for (const b of sim.blocks) if (b.id > maxBlockId) maxBlockId = b.id;
  const peer = new PE.ArenaPeer({
    transport: hub.endpoint('peer'), slot: 1, sessionId: 't', nowMs: () => hub.nowMs,
    readInput: () => ({ x: 0, z: 0 }),
    speedForRadius: (r) => V.sandboxSpeedForRadius(r, sim.tune.speed),
    spawn: { x: 8, z: 8 }, objectCount: maxBlockId + 1, generation: 1,
  });
  peer.join();

  for (let frame = 0; frame < 15 * 60; frame++) {   // 15 s of the page's loop
    hub.advance(FRAME_MS);
    host.step(FIXED_DT, hub.nowMs);
    sim.drainEvents();   // exactly what js/demo/arena.js does each frame
    peer.update(hub.nowMs, FRAME_MS);
  }
  host.sendKeyframe(hub.nowMs);   // one keyframe interval's heal, at most
  hub.flush();
  peer.update(hub.nowMs, FRAME_MS);

  const hostConsumed = new Set();
  for (const b of sim.blocks) if (b.state === 'consumed' && b.id != null) hostConsumed.add(b.id);
  let missing = 0;
  for (const id of hostConsumed) if (!peer.consumed.has(id)) missing++;
  check(`the host actually ate (${hostConsumed.size} blocks)`, hostConsumed.size > 100);
  check(`the host's keyframe eaten set kept up (${host._eatenIds.size}/${hostConsumed.size})`,
    host._eatenIds.size === hostConsumed.size);
  check(`every host-eaten block reached the peer (missing ${missing})`, missing === 0);
  check('the peer never invented an eat',
    [...peer.consumed].every((id) => hostConsumed.has(id)));
  peer.dispose(); host.dispose();
}

// ---------------------------------------------------------------------------
const line = '-'.repeat(72);
console.log('\nFlywheel arena room-lifecycle self-test');
console.log(line);
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok);
  console.log(`\n${r.failed ? 'FAIL' : 'PASS'}  ${r.name}   (${r.checks.length - r.failed}/${r.checks.length})`);
  for (const c of bad) console.log(`      x ${c.label}${c.detail ? '  ' + c.detail : ''}`);
}
console.log(`\n${line}`);
const total = results.reduce((n, r) => n + r.checks.length, 0);
console.log(failures
  ? `FAIL  ${failures} of ${total} checks failed`
  : `PASS  all ${total} checks in ${results.length} sections`);
process.exit(failures ? 1 : 0);
