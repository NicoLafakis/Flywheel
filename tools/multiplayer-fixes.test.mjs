// TDD Unit Test: Multiplayer Bug-Fix Batch (T-620 .. T-626)
//
// One suite per defect, in task order. Everything that can be proven without a
// DOM is proven here; the two DOM-only fixes (T-621 frame() role, T-626 name
// prompt) are pinned by static source assertions so a regression still fails a
// gate rather than waiting for a browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Namespace imports for the two modules that gain exports in this batch: a
// missing named import is a link-time SyntaxError, which would hide every other
// assertion in the file behind one unrelated failure.
import * as voxelsim from '../js/voxelsim.js';
import * as mpConfig from '../js/multiplayer/config.js';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import {
  LEVEL_CLOCK_TICKS,
  CHALLENGE_CLOCK_TICKS,
  SECRET_CHALLENGE_CLOCK_TICKS,
} from '../js/levelclock.js';
import { POWERUP_SPECS, POWERUP_TYPES, activatePowerUp } from '../js/powerups.js';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';
import { MultiplayerHost } from '../js/multiplayer/host.js';
import { MultiplayerPeer } from '../js/multiplayer/peer.js';
import { MultiplayerLobby } from '../js/multiplayer/lobby.js';
import { MSG_TYPES, createCountdownStart } from '../js/multiplayer/protocol.js';
import {
  COUNTDOWN_SECONDS,
  COUNTDOWN_TICKS,
  MATCH_DURATION_SECONDS,
  MULTIPLAYER_SCENES,
  PVP_RESPAWN_TIMEOUT_SECONDS,
} from '../js/multiplayer/config.js';

const { disasterTwoTimeSeconds } = voxelsim;
const { MULTIPLAYER_SCENE_META } = mpConfig;

console.log('Testing multiplayer bug-fix batch T-620..T-626...');

// core.autocrlf is on, so a working-tree file may be CRLF or LF depending on who
// last wrote it. Every static assertion below reads normalized text.
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const mainSrc = src('../js/main.js');
const hudSrc = src('../js/ui/hud.js');
const uiSrc = src('../js/multiplayer/ui.js');
const lobbySrc = src('../js/multiplayer/lobby.js');
const voxelSrc = src('../js/voxelsim.js');

/** Body of a top-level `function name(` declaration, up to the next column-0 `function`. */
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected js source to declare function ${name}()`);
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  return end === -1 ? source.slice(start) : source.slice(start, start + 1 + end);
}

/** Body of a class method `  name(` inside a source file (2-space indent house style). */
function methodBody(source, name) {
  const start = source.indexOf(`\n  ${name}(`);
  assert.ok(start !== -1, `expected source to declare method ${name}()`);
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\n  }\n');
  assert.ok(end !== -1, `could not find the end of method ${name}()`);
  return rest.slice(0, end);
}

/**
 * Deterministic stand-ins for setInterval/setTimeout/Date.now so a 3-second
 * countdown and an 8-second join timeout can be tested in microseconds.
 */
function createFakeTimers(startNow = 1_000_000) {
  const state = { nowMs: startNow, intervals: new Map(), timeouts: new Map(), _next: 1 };
  const timers = {
    now: () => state.nowMs,
    setInterval: (fn, ms) => { const id = state._next++; state.intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { state.intervals.delete(id); },
    setTimeout: (fn, ms) => { const id = state._next++; state.timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { state.timeouts.delete(id); },
  };
  return {
    state,
    timers,
    advance(ms) {
      state.nowMs += ms;
      for (const [, t] of [...state.intervals]) t.fn();
    },
    fireTimeouts() {
      for (const [id, t] of [...state.timeouts]) { state.timeouts.delete(id); t.fn(); }
    },
  };
}

await loadScene('gallery');

const TWO_PLAYERS = [
  { slot: 0, name: 'Host', skin: 'default', color: '#00f0ff', isHost: true, senderId: 'host' },
  { slot: 1, name: 'Alice', skin: 'nebula', color: '#ff0054', isHost: false, senderId: 'peer-1' },
];

// ---------------------------------------------------------------------------
// T-620 — the match clock must equal the match length, without the 2x coin trap
// ---------------------------------------------------------------------------
console.log('\n--- T-620: explicit clockLimitTicks drives the multiplayer clock ---');
{
  const mpSim = new VoxelSandboxSim('gallery', { seed: 3, mode: 'freeplay', clockLimitTicks: 180 * 60 });
  assert.equal(mpSim.clockLimit, 10800, 'an explicit tick budget must override the mode default');
  assert.equal(mpSim.timeLeft, 180, 'the HUD must read 3:00 at tick 0 of a 180 s match');
  assert.equal(mpSim.coinMultiplier, 1, 'multiplayer must NOT inherit the 2x challenge coin multiplier');
  assert.equal(mpSim.isChallenge, false, 'multiplayer is not a challenge run');

  // Fast-forward the tick counter rather than stepping 3 real minutes of sim.
  mpSim.clockTicks = 10799;
  mpSim.step(1 / 60);
  assert.equal(mpSim.clockTicks, 10800);
  assert.equal(mpSim.over, true, 'the sim must end on tick 10800 of a 180 s match');
  assert.equal(mpSim.timedOut, true, 'expiry must be flagged as a timeout, not a goal');

  // Every shipped mode keeps exactly the clock and coin rules it had.
  const freeplay = new VoxelSandboxSim('gallery', { seed: 3, mode: 'freeplay' });
  assert.equal(freeplay.clockLimit, LEVEL_CLOCK_TICKS);
  assert.equal(freeplay.coinMultiplier, 1);
  const challenge = new VoxelSandboxSim('gallery', { seed: 3, mode: 'challenge3m' });
  assert.equal(challenge.clockLimit, CHALLENGE_CLOCK_TICKS);
  assert.equal(challenge.coinMultiplier, 2, 'challenge modes keep their 2x payout');
  const secret = new VoxelSandboxSim('gallery', { seed: 3, mode: 'challenge90s' });
  assert.equal(secret.clockLimit, SECRET_CHALLENGE_CLOCK_TICKS);
  const ranked = new VoxelSandboxSim('gallery', { seed: 3, mode: 'run90' });
  assert.equal(ranked.clockLimit, null, 'THE RUN keeps its server-seeded bound');
  assert.equal(ranked.timeLeft, null);
}

console.log('--- T-620: the scheduled late-match meteor lands before the match ends ---');
{
  assert.equal(typeof disasterTwoTimeSeconds, 'function', 'the disaster schedule must be an assertable pure helper');
  assert.equal(disasterTwoTimeSeconds('freeplay', LEVEL_CLOCK_TICKS), 240, '300 s clock keeps its 240 s meteor');
  assert.equal(disasterTwoTimeSeconds('run90', null), 70, 'THE RUN keeps its 70 s meteor');
  assert.equal(disasterTwoTimeSeconds('challenge90s', SECRET_CHALLENGE_CLOCK_TICKS), 70);

  const at180 = disasterTwoTimeSeconds('freeplay', 180 * 60);
  assert.equal(at180, 120, 'a 180 s match fires its meteor two thirds through');
  assert.ok(at180 < 180, 'the meteor must land strictly before the final tick');
  assert.equal(disasterTwoTimeSeconds('challenge3m', CHALLENGE_CLOCK_TICKS), 120,
    '3-minute challenges had the same off-by-a-whole-match bug');
}

console.log('--- T-620: host and peer sessions build their sim with the match clock ---');
{
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('T620', 'host');
  const peerCh = hub.createChannel('T620', 'peer-1');

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 11, players: TWO_PLAYERS, durationSeconds: 180,
  });
  assert.equal(host.sim.clockLimit, 10800, 'the host sim clock must equal the host match length');
  assert.equal(host.sim.timeLeft, 180);
  assert.equal(host.sim.coinMultiplier, 1);

  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 11, players: TWO_PLAYERS, mySlot: 1, durationSeconds: 180,
  });
  assert.equal(peer.sim.clockLimit, 10800, 'the peer sim clock must match the host clock');
  assert.equal(peer.sim.timeLeft, 180);
  assert.equal(peer.sim.coinMultiplier, 1);

  host.destroy();
  peer.destroy();
}

console.log('--- T-620: a clock expiry still reports TIME_EXPIRED, not CITY_CLEARED ---');
{
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('T620B', 'host');
  const short = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 12, players: TWO_PLAYERS, durationSeconds: 2,
  });
  assert.equal(short.sim.clockLimit, 120, 'a 2 s match gets a 120-tick sim clock');
  let over = null;
  short.onGameOver = (msg) => { over = msg; };
  for (let t = 0; t < 130 && !short.over; t++) short.step(1 / 60);
  assert.ok(over, 'the host must end the match when its clock expires');
  assert.equal(over.reason, 'TIME_EXPIRED',
    'a plain timeout must not be reported as a 100% city clear');
  short.destroy();
}

// ---------------------------------------------------------------------------
// T-621 — frame() referenced an undefined `isHost`
// ---------------------------------------------------------------------------
console.log('\n--- T-621: multiplayer role lives at module scope in main.js ---');
{
  assert.match(mainSrc, /^let mpIsHost = false;$/m,
    'main.js must declare the multiplayer role at module scope');

  const startMatch = functionBody(mainSrc, 'startMultiplayerMatch');
  assert.match(startMatch, /mpIsHost\s*=\s*(?:Boolean\()?isHost/, 'startMultiplayerMatch must publish the role');

  const teardown = functionBody(mainSrc, 'teardownWorld');
  assert.match(teardown, /mpIsHost\s*=\s*false/, 'teardownWorld must reset the role');

  // Anywhere outside startMultiplayerMatch, a bare `isHost` identifier read is a
  // ReferenceError at runtime. Object keys (`isHost:`), property reads
  // (`p.isHost`) and comments are fine and are excluded.
  const outside = mainSrc.replace(startMatch, '').replace(/^\s*\/\/.*$/gm, '');
  const bare = outside.match(/(?<![.\w])isHost(?!\s*:)/g) || [];
  assert.equal(bare.length, 0,
    `main.js reads a bare isHost outside startMultiplayerMatch (${bare.length} occurrence(s))`);
}

// ---------------------------------------------------------------------------
// T-622 — power-up pills never rendered in a voxel city
// ---------------------------------------------------------------------------
console.log('\n--- T-622: power-ups live on the hole, and the sandbox HUD reads them there ---');
{
  const sim = new VoxelSandboxSim('gallery', { seed: 5 });
  assert.equal(Object.prototype.hasOwnProperty.call(VoxelSandboxSim.prototype, 'activePowerUps'), false,
    'VoxelSandboxSim has no activePowerUps — that is the whole bug');
  assert.equal(sim.activePowerUps, undefined, 'a sandbox sim exposes no sim-level active buff list');

  const hole = sim.localHole || sim.holes[0];
  assert.ok(Array.isArray(hole.activePowerUps), 'each hole owns its own active buff list');
  assert.equal(hole.activePowerUps.length, 0);

  activatePowerUp(hole.activePowerUps, { spec: POWERUP_SPECS[POWERUP_TYPES.SPEED] }, hole, sim);
  assert.equal(hole.activePowerUps.length, 1, 'activating a buff fills the hole list the HUD must read');
  assert.equal(hole.activePowerUps[0].type, POWERUP_TYPES.SPEED);
  assert.ok(hole.activePowerUps[0].remaining > 0);

  const sandbox = methodBody(hudSrc, 'updateSandbox');
  assert.ok(!/_updatePowerUps\(sim\.activePowerUps\)/.test(sandbox),
    'updateSandbox must not hand the badge renderer a property the sandbox sim does not have');
  assert.match(sandbox, /_updatePowerUps\(h\.activePowerUps/,
    'updateSandbox must render the local hole\'s buff list');

  // The campaign Sim genuinely does own sim.activePowerUps — that path (hud.update)
  // stays put.
  const campaign = methodBody(hudSrc, 'update');
  assert.match(campaign, /_updatePowerUps\(sim\.activePowerUps\)/,
    'the campaign HUD path must be left alone');
}

// ---------------------------------------------------------------------------
// T-623 — everyone except the host watched a frozen "3"
// ---------------------------------------------------------------------------
console.log('\n--- T-623: a peer runs its own countdown ticker off the host timestamp ---');
{
  const fake = createFakeTimers();
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('T623', 'host');
  const peerCh = hub.createChannel('T623', 'peer-1');

  const ticks = [];
  let startedAt = null;
  const peer = new MultiplayerLobby({
    channel: peerCh, isHost: false, playerName: 'Alice', roomCode: 'T623', timers: fake.timers,
  });
  peer.onCountdownStart = (sec) => { startedAt = sec; };
  peer.onCountdownTick = (sec) => { ticks.push(Math.ceil(sec)); };

  let sawGameStart = false;
  hostCh.onMessage((m) => { if (m.type === MSG_TYPES.GAME_START) sawGameStart = true; });

  hostCh.broadcast(createCountdownStart({ durationMs: 3000, serverStartTs: fake.state.nowMs }));

  assert.equal(peer.countdownActive, true, 'the peer must register the countdown');
  assert.equal(startedAt, 3, 'the peer must open its overlay at 3');
  assert.equal(fake.state.intervals.size, 1, 'the peer must start a local ticker on receipt');

  fake.advance(1000);
  fake.advance(1000);
  assert.deepEqual(ticks, [2, 1], 'the peer countdown must decrement 3 -> 2 -> 1');

  fake.advance(1000);
  assert.equal(ticks[ticks.length - 1], 0, 'the peer countdown must reach 0');
  assert.equal(fake.state.intervals.size, 0, 'the ticker must stop itself at 0');
  assert.equal(sawGameStart, false, 'only the host may launch the match');

  // Cancel stops a running ticker.
  hostCh.broadcast(createCountdownStart({ durationMs: 3000, serverStartTs: fake.state.nowMs }));
  assert.equal(fake.state.intervals.size, 1);
  peer.cancelCountdown('PLAYER_LEFT');
  assert.equal(peer.countdownActive, false);
  assert.equal(fake.state.intervals.size, 0, 'cancelCountdown must clear the peer ticker');

  // Destroy stops a running ticker too.
  hostCh.broadcast(createCountdownStart({ durationMs: 3000, serverStartTs: fake.state.nowMs }));
  assert.equal(fake.state.intervals.size, 1);
  peer.destroy();
  assert.equal(fake.state.intervals.size, 0, 'destroy must clear the peer ticker');
}

// ---------------------------------------------------------------------------
// T-624 — joining a full or nonexistent room hung forever
// ---------------------------------------------------------------------------
console.log('\n--- T-624: a full room and a dead room both surface a reason ---');
{
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('T624', 'host');
  const hostLobby = new MultiplayerLobby({
    channel: hostCh, isHost: true, playerName: 'Host', scene: 'gallery', maxPlayers: 2, roomCode: 'T624',
    timers: createFakeTimers().timers,
  });

  const f1 = createFakeTimers();
  let aliceReason = null;
  const alice = new MultiplayerLobby({
    channel: hub.createChannel('T624', 'peer-1'), isHost: false, playerName: 'Alice', roomCode: 'T624',
    timers: f1.timers, onJoinRejected: (r) => { aliceReason = r; },
  });
  assert.equal(hostLobby.connectedCount, 2, 'host + Alice fills a 2-player room');
  assert.equal(aliceReason, null, 'Alice got a slot and must not be rejected');
  assert.equal(f1.state.timeouts.size, 0, 'a ROOM_STATE answer must cancel the join timeout');

  const f2 = createFakeTimers();
  let bobReason = null;
  const bob = new MultiplayerLobby({
    channel: hub.createChannel('T624', 'peer-2'), isHost: false, playerName: 'Bob', roomCode: 'T624',
    timers: f2.timers, onJoinRejected: (r) => { bobReason = r; },
  });
  assert.equal(bobReason, 'ROOM_FULL', 'the 3rd player into a 2-player room must be told why');
  assert.equal(bob.joinRejectedReason, 'ROOM_FULL');
  assert.equal(aliceReason, null, 'only the addressed peer reacts to a JOIN_REJECT broadcast');
  assert.equal(hostLobby.joinRejectedReason ?? null, null, 'the host must ignore its own JOIN_REJECT');

  alice.destroy();
  bob.destroy();
  hostLobby.destroy();
}
{
  const hub = new InMemoryChannelHub();
  const fake = createFakeTimers();
  let reason = null;
  const lonely = new MultiplayerLobby({
    channel: hub.createChannel('T624B', 'peer-x'), isHost: false, playerName: 'Solo', roomCode: 'T624B',
    timers: fake.timers, joinTimeoutMs: 8000, onJoinRejected: (r) => { reason = r; },
  });
  assert.equal(fake.state.timeouts.size, 1, 'a joining peer must arm a join timeout');
  assert.equal(reason, null, 'nothing is surfaced before the timeout elapses');
  fake.fireTimeouts();
  assert.equal(reason, 'NO_ROOM', 'a room that never answers must surface NO_ROOM');
  assert.equal(lonely.joinRejectedReason, 'NO_ROOM');
  lonely.destroy();
}
{
  // The join-error path has to reach the player, not just the console.
  assert.match(uiSrc, /showJoinError\s*\(/, 'the multiplayer UI must render a join error screen');
  assert.match(mainSrc, /onJoinRejected/, 'main.js must wire the rejection into the UI');
  assert.match(uiSrc, /ROOM_FULL/, 'the UI must explain a full room in words');
  assert.match(uiSrc, /NO_ROOM/, 'the UI must explain a missing room in words');
}

// ---------------------------------------------------------------------------
// T-625 — constants duplicated instead of imported
// ---------------------------------------------------------------------------
console.log('\n--- T-625: one source per constant ---');
{
  // PvP respawn: voxelsim must read the shared constant, not a literal 10.0.
  const sim = new VoxelSandboxSim('gallery', {
    seed: 42,
    holes: [
      { slot: 0, name: 'A', x: 5, z: 5 },
      { slot: 1, name: 'B', x: 5.2, z: 5.2 },
    ],
  });
  // Radius is derived from SIZE every step, so the size ladder is what makes one
  // hole edible to the other.
  const kills = [];
  sim.onPvPKill = (ev) => kills.push({ ev, victimTimer: ev.victim.respawnTimer });
  sim.holes[0].size = 9;
  sim.holes[0].mass = 2000;
  sim.holes[0].x = 5.0;
  sim.holes[0].z = 5.0;
  sim.holes[1].size = 1;
  sim.holes[1].mass = 300;
  sim.holes[1].x = 5.2;
  sim.holes[1].z = 5.2;
  sim.step(1 / 60);
  assert.equal(kills.length, 1, 'the larger hole must swallow the smaller one');
  assert.equal(kills[0].victimTimer, PVP_RESPAWN_TIMEOUT_SECONDS,
    'the respawn penalty must come from PVP_RESPAWN_TIMEOUT_SECONDS');
  assert.equal(kills[0].ev.respawnDelaySeconds, PVP_RESPAWN_TIMEOUT_SECONDS,
    'the broadcast respawn delay must come from the same constant');
  assert.ok(!/respawnTimer\s*=\s*10\.0/.test(voxelSrc), 'voxelsim.js must not hold a second copy of the value');
  assert.ok(!/respawnDelaySeconds:\s*10\.0/.test(voxelSrc), 'voxelsim.js must not hold a second copy of the value');

  // Match duration: launchGame must announce the configured length.
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('T625', 'host');
  let started = null;
  const lobby = new MultiplayerLobby({
    channel: hostCh, isHost: true, playerName: 'Host', scene: 'gallery', maxPlayers: 2, roomCode: 'T625',
    timers: createFakeTimers().timers,
  });
  lobby.onGameStart = (m) => { started = m; };
  lobby.launchGame();
  assert.ok(started, 'the host must broadcast GAME_START');
  assert.equal(started.durationSeconds, MATCH_DURATION_SECONDS,
    'the announced match length must come from MATCH_DURATION_SECONDS');
  assert.ok(!/durationSeconds:\s*180/.test(lobbySrc), 'lobby.js must not hold a second copy of the value');
  lobby.destroy();

  // Countdown: COUNTDOWN_TICKS is the single source, COUNTDOWN_SECONDS derives from it.
  assert.equal(COUNTDOWN_SECONDS, COUNTDOWN_TICKS / 60, 'COUNTDOWN_SECONDS must derive from COUNTDOWN_TICKS');
  const hub2 = new InMemoryChannelHub();
  const ch2 = hub2.createChannel('T625B', 'host');
  const fake = createFakeTimers();
  let countdownMsg = null;
  ch2.onMessage((m) => { if (m.type === MSG_TYPES.COUNTDOWN_START) countdownMsg = m; });
  const lobby2 = new MultiplayerLobby({
    channel: ch2, isHost: true, playerName: 'Host', scene: 'gallery', maxPlayers: 2, roomCode: 'T625B',
    timers: fake.timers,
  });
  lobby2.startCountdown();
  assert.ok(countdownMsg, 'the host must broadcast COUNTDOWN_START');
  assert.equal(countdownMsg.durationMs, (COUNTDOWN_TICKS / 60) * 1000,
    'the broadcast countdown length must track COUNTDOWN_TICKS');
  lobby2.destroy();

  // Scene list: the UI must be driven by MULTIPLAYER_SCENES, not by three hand-written chips.
  assert.ok(MULTIPLAYER_SCENE_META, 'every multiplayer scene needs display metadata');
  for (const scene of MULTIPLAYER_SCENES) {
    const meta = MULTIPLAYER_SCENE_META[scene];
    assert.ok(meta && meta.name && meta.sub && meta.level, `MULTIPLAYER_SCENE_META is missing ${scene}`);
  }
  assert.match(uiSrc, /MULTIPLAYER_SCENES\s*\.\s*map|MULTIPLAYER_SCENES\.map/,
    'ui.js must build the scene chips from MULTIPLAYER_SCENES');
  assert.ok(!/data-scene="manhattan"/.test(uiSrc), 'ui.js must not hardcode the scene list');
  assert.ok(!/data-scene="brooklyn"/.test(uiSrc), 'ui.js must not hardcode the scene list');
}

// ---------------------------------------------------------------------------
// TRIPWIRE — no multiplayer-selectable scene may declare `sceneMovers`
//
// Movers (kinematic props on a closed path — today, Chicago's CTA train) are
// simulated per client and are NOT replicated by `js/multiplayer/`. That is fine
// right now only because MULTIPLAYER_SCENES offers gallery/manhattan/brooklyn and
// none of them has a mover, so `sim.moverSim` is null in every match that can be
// started. The exposure is zero by accident of the scene roster, not by design —
// adding one city to a frozen array in config.js would ship two live desyncs with
// nothing else in the repo objecting. This is that objection.
//
// It lives in this suite rather than a new file because the section above already
// pins the scene list, and a guard on the same constant belongs with it.
// ---------------------------------------------------------------------------
console.log('\n--- tripwire: no MULTIPLAYER_SCENES entry declares sceneMovers ---');
{
  const voxelsimSrc = src('../js/voxelsim.js');

  // scene -> the module whose builder runs, read out of the LOADER'S OWN table
  // (`SCENE_IMPORTERS` in js/voxelsim.js) rather than a hand-written copy. A
  // renamed scene file has to be renamed there too or the game cannot load the
  // city at all, so this mapping cannot drift out from under the guard and leave
  // it silently scanning a file that no longer exists. The GALLERY has no entry
  // because it is authored inline in `_buildScene`, so its source is
  // voxelsim.js itself — but that is true of the gallery specifically, NOT of
  // "anything without an entry", and conflating the two is the defect recorded
  // in .wiki/features/act-i-pacific-completion/ under sceneReady(). See below.
  const importerTable = voxelsimSrc.match(/const SCENE_IMPORTERS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(importerTable,
    'js/voxelsim.js must still declare SCENE_IMPORTERS — the tripwire reads its scene->module map');
  const sceneModule = new Map();
  for (const m of importerTable[1].matchAll(/['"]([\w-]+)['"]\s*:\s*\(\)\s*=>\s*import\(\s*['"]\.\/([\w.-]+)['"]/g)) {
    sceneModule.set(m[1], `../js/${m[2]}`);
  }
  // EXACT, not a floor. This was `>= 6` against a table that had grown to 10,
  // which is four deleted registrations of slack — a gate that would sit green
  // through most of the roster vanishing. Bump it deliberately when a city
  // ships, exactly as the 11/18 playable/development split is bumped.
  //
  // 15, not 16: this counts IMPORTERS, and the gallery has none because it is
  // authored inline in `_buildScene`. So it is (playable cities - gallery), and
  // deriving it from the playable count without that subtraction is wrong — I
  // did exactly that and this assertion caught it on the first run.
  const EXPECTED_IMPORTERS = 15;
  assert.equal(sceneModule.size, EXPECTED_IMPORTERS,
    `SCENE_IMPORTERS parsed to ${sceneModule.size} entr(ies), expected ${EXPECTED_IMPORTERS} — either the parser has drifted from the loader, or a scene was registered/unregistered and this count was not bumped with it`);

  // IDENTITY, not absence. `sceneModule.get(scene) || '../js/voxelsim.js'` gave
  // the gallery's answer to every unregistered or misspelled id, so such a scene
  // was silently SCANNED AS voxelsim.js and handed back a clean pass — the guard
  // inspecting the wrong file and reporting success. Same wrong inference as the
  // old `sceneReady`, reached independently in different words, which is why a
  // search for that symbol could never have found it.
  const GALLERY_SCENE = 'gallery';
  const sourceFor = (scene) => {
    if (scene === GALLERY_SCENE) return '../js/voxelsim.js';
    const mod = sceneModule.get(scene);
    assert.ok(mod,
      `scene '${scene}' has no SCENE_IMPORTERS entry in js/voxelsim.js and is not the gallery — it cannot be scanned, and defaulting it to voxelsim.js would pass this guard while inspecting the wrong file`);
    return mod;
  };

  // "Declares movers" = assigns `.sceneMovers` to something other than null, on a
  // line that is not prose (no `/` or `*` may precede the assignment, which rules
  // out `//`, `/*` and jsdoc ` * ` lines). The non-null clause is load-bearing:
  // gallery's builder lives in voxelsim.js, which is also where the constructor's
  // `this.sceneMovers = null` default sits, and that default is not a declaration.
  const MOVER_ASSIGN = /^[^\n/*]*\.sceneMovers\s*=\s*(?!null\b|undefined\b)\S/;
  const declaresMovers = (rel) => src(rel).split('\n').filter((line) => MOVER_ASSIGN.test(line));

  // POSITIVE CONTROL, permanent. Chicago's CTA train is the only mover in the
  // game, so the detector must SEE it on every single run. Without this a regex
  // that matched nothing would issue a clean bill of health forever.
  const chicagoSrc = sourceFor('chicago');
  const chicagoHits = declaresMovers(chicagoSrc);
  assert.ok(chicagoHits.length > 0,
    `detector is blind: ${chicagoSrc} declares sceneMovers and the scan did not see it`);

  // NEGATIVE CONTROL. The `this.sceneMovers = null` default and the prose that
  // discusses movers must not read as declarations, or every scene "fails".
  assert.equal(declaresMovers('../js/voxelsim.js').length, 0,
    'the `sceneMovers = null` default in the VoxelSandboxSim constructor must not count as declaring movers');

  // Anti-vacuity: an empty list, or a list whose sources did not resolve, must
  // not be able to pass.
  assert.ok(MULTIPLAYER_SCENES.length > 0, 'MULTIPLAYER_SCENES must not be empty');
  const scenesUnderGuard = MULTIPLAYER_SCENES;
  const offenders = [];
  for (const scene of scenesUnderGuard) {
    const rel = sourceFor(scene);
    // readFileSync throws if the module is gone, so a scene can never be skipped.
    assert.ok(src(rel).length > 0,
      `scene "${scene}" resolved to ${rel}, which is empty — the tripwire would be scanning nothing`);
    const hits = declaresMovers(rel);
    if (hits.length) offenders.push({ scene, rel, hit: hits[0].trim() });
  }

  if (offenders.length > 0) {
    const detail = offenders
      .map((o) => `    · "${o.scene}"  ->  ${o.rel.replace('../', '')}   ${o.hit}`)
      .join('\n');
    assert.fail(
      `${offenders.length} scene(s) in MULTIPLAYER_SCENES declare sceneMovers:\n${detail}\n\n`
      + 'Movers are NOT replicated by js/multiplayer/. Making a mover-bearing city selectable\n'
      + 'ships two player-visible defects on the same day:\n\n'
      + '  1. NOTHING ARBITRATES WHO ATE THE TRAIN. `eatenDelta` exists on STATE_SYNC\n'
      + '     (js/multiplayer/protocol.js) but host.js never populates it and peer.js never reads\n'
      + '     it, so `_consumeMoverUnit()` in js/voxelsim.js is decided locally on every client.\n'
      + '     A rival eats a train car on their screen and not on yours, and the unit mass is\n'
      + '     credited to a different hole on each machine. Blocks get away with this because\n'
      + '     every client re-derives them from host-published hole positions; a mover does not.\n\n'
      + '  2. THE TRAIN IS SOMEWHERE ELSE ON EVERY SCREEN. Riding pose is\n'
      + '     `u.s = this.time * rt.speed + u.off`, and `this.time` is a per-client accumulator\n'
      + '     (`this.time += dt`) that `applyClockAuthority()` does NOT reconcile — it ratchets\n'
      + '     `clockTicks` only. A peer that cannot hold 60 steps a second sees the train further\n'
      + '     back on the track and derails it at a different moment. That is the T-635 match-clock\n'
      + '     defect one layer down, and it was measured at 38 s of drift over a 180 s match.\n\n'
      + 'FIX IT, do not delete this assertion: make mover state host-published (units carried on\n'
      + 'STATE_SYNC, or populate eatenDelta and have the peer apply it) and drive mover pose off\n'
      + 'host-authoritative time. Then update this guard and .wiki/modules/multiplayer.md together.',
    );
  }

  console.log(`  ok: ${scenesUnderGuard.length} selectable scene(s) (${scenesUnderGuard.join(', ')}), none declaring sceneMovers`);
  console.log(`  ok: detector proven live against ${chicagoSrc.replace('../', '')} (${chicagoHits.length} declaration)`);
}

// ---------------------------------------------------------------------------
// T-626 — invite-link joiners were never asked their name (REQ-MP-05)
// ---------------------------------------------------------------------------
console.log('\n--- T-626: the direct-link join flow asks for a display name ---');
{
  assert.match(uiSrc, /showJoinNamePrompt\s*\(/, 'the multiplayer UI must offer a name prompt');
  assert.equal(mpConfig.MAX_PLAYER_NAME_LENGTH, 16, 'the display-name clamp is 16 characters');
  assert.match(uiSrc, /maxlength="\$\{MAX_PLAYER_NAME_LENGTH\}"/,
    'the name field must respect the shared 16-char clamp rather than a literal');
  assert.match(uiSrc, /mp-name-input/, 'the name field must use the existing .mp-* CSS vocabulary');

  const cssSrc = src('../css/multiplayer.css');
  assert.match(cssSrc, /\.mp-name-input\s*\{/, 'css/multiplayer.css must style the name field');

  const join = functionBody(mainSrc, 'joinMultiplayerLobby');
  assert.match(join, /showJoinNamePrompt/, 'the invite-link join path must prompt before connecting');
  // Was `save.player?.name`. That read could be empty — a save with no name
  // pre-filled the prompt with nothing, which is the state this guard was
  // written against. Every player now carries a generated name, and
  // `playerName(save)` is the one accessor that reads it and repairs a save that
  // somehow lacks one, so the requirement is unchanged and only the expression
  // that satisfies it moved.
  assert.match(join, /playerName\(save\)/, 'the prompt must be pre-filled from the saved profile');
}

console.log('\n✓ Multiplayer bug-fix batch (T-620..T-626) test PASSED');
