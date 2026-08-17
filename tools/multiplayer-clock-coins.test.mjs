// TDD Unit Test: Host-authoritative match clock + shared coin pool (T-635, T-636)
//
// T-635 was measured in a real two-browser match on Lower Manhattan: at the
// instant the host ended, host `sim.timeLeft` was 0.0 / `sim.over` true while the
// peer read 38.1 with `over` false. The clock was simulated independently on
// every client and nothing reconciled it, so any client that cannot sustain 60
// sim steps per second falls behind permanently.
//
// T-636 is a product decision: in a multiplayer match the coin readout is a
// SHARED pool draining, not a personal tally — every player sees the same number
// and it ticks down whoever took the coin. Solo play is untouched.
//
// Everything here runs headless: the in-memory hub carries the wire, every timer
// is injected, and the one DOM-only consequence (the HUD writing the readout) is
// pinned by a pure formatter plus a static source assertion.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import * as voxelsim from '../js/voxelsim.js';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';
import { MultiplayerHost } from '../js/multiplayer/host.js';
import { MultiplayerPeer } from '../js/multiplayer/peer.js';
import { createStateSync, validateMessage, MSG_TYPES } from '../js/multiplayer/protocol.js';
import { buildHoleConfigs, buildLeaderboard } from '../js/multiplayer/roster.js';
// Namespace import for the module that GAINS an export here: a missing named
// import is a link-time SyntaxError, which would hide every other assertion in
// the file behind one unrelated failure.
import * as hud from '../js/ui/hud.js';

const { formatCoinReadout } = hud;

console.log('Testing multiplayer clock authority & shared coin pool (T-635, T-636)...');

// core.autocrlf is on, so a working-tree file may be CRLF or LF depending on who
// last wrote it. Every static assertion below reads normalized text.
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hudSrc = src('../js/ui/hud.js');

/** Deterministic stand-ins so no watchdog or heartbeat sleeps in real time. */
function createFakeTimers(startNow = 1_000_000) {
  const state = { nowMs: startNow, intervals: new Map(), _next: 1 };
  return {
    state,
    timers: {
      now: () => state.nowMs,
      setInterval: (fn, ms) => { const id = state._next++; state.intervals.set(id, { fn, ms }); return id; },
      clearInterval: (id) => { state.intervals.delete(id); },
    },
  };
}

await loadScene('gallery');

const P = (slot, senderId, name, color) => ({
  slot, senderId, name, skin: 'default', color, isHost: slot === 0,
});
const TWO = [P(0, 'host-sender', 'Host', '#00f0ff'), P(1, 'peer-sender', 'Alice', '#ff0054')];
const TWO_CFG = buildHoleConfigs(TWO);

const FIXED_DT = 1 / 60;

// ===========================================================================
// T-635 — the match clock is host-authoritative
// ===========================================================================

console.log('\n--- T-635: STATE_SYNC carries the authoritative clock ---');
{
  const msg = createStateSync({ tick: 7, clockTicks: 4321, holes: [] });
  assert.equal(msg.type, MSG_TYPES.STATE_SYNC);
  assert.equal(msg.clockTicks, 4321,
    'STATE_SYNC must carry the host tick count the countdown is derived from');
  // It has to survive the transport gate, or it is dropped before any peer sees it.
  const clean = validateMessage(msg);
  assert.ok(clean, 'a STATE_SYNC carrying a clock must validate');
  assert.equal(clean.clockTicks, 4321);
  // A sync built without one must not poison a peer's clock with undefined.
  assert.equal(createStateSync({ tick: 1, holes: [] }).clockTicks, 0);
}

console.log('--- T-635: the sim exposes a clock-authority seam (headless, no DOM) ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery', seed: 'clock-a', mode: 'freeplay',
    clockLimitTicks: 10800, clockFollower: true, holes: TWO_CFG,
  });
  assert.equal(typeof sim.applyClockAuthority, 'function',
    'the sim must accept an external authoritative clock');
  assert.equal(sim.clockFollows, true, 'clockFollower must mark this sim as following a remote clock');
  assert.equal(Number.isFinite(voxelsim.CLOCK_AUTHORITY_SNAP_TICKS), true,
    'the snap threshold must be an exported constant, not a literal buried in a branch');
  assert.equal(voxelsim.CLOCK_AUTHORITY_SNAP_TICKS, 120, 'snap above 2 s of error');
  // A sim nobody is syncing keeps owning its own clock.
  const solo = new VoxelSandboxSim({ scene: 'gallery', seed: 'clock-a', mode: 'freeplay', holes: null });
  assert.equal(Boolean(solo.clockFollows), false);
}

console.log('--- T-635: a large error snaps, a small one does not ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery', seed: 'clock-b', mode: 'freeplay',
    clockLimitTicks: 10800, clockFollower: true, holes: TWO_CFG,
  });
  for (let i = 0; i < 60; i++) sim.step(FIXED_DT, [null, null]);
  assert.equal(sim.clockTicks, 60);

  // 2 s or less: no snap — the correction is left to the per-step reconciler.
  sim.applyClockAuthority(60 + voxelsim.CLOCK_AUTHORITY_SNAP_TICKS);
  assert.equal(sim.clockTicks, 60, 'an error inside the snap window must not jump the clock');

  // Beyond it: snap, because 38 s of silent lag is worse than one visible jump.
  sim.applyClockAuthority(4000);
  assert.equal(sim.clockTicks, 4000, 'an error beyond the snap window must snap to host truth');
  assert.equal(sim.timeLeft, (10800 - 4000) / 60);
}

console.log('--- T-635: the countdown never runs backwards ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery', seed: 'clock-c', mode: 'freeplay',
    clockLimitTicks: 10800, clockFollower: true, holes: TWO_CFG,
  });
  for (let i = 0; i < 600; i++) sim.step(FIXED_DT, [null, null]);
  const aheadTicks = sim.clockTicks;
  const aheadLeft = sim.timeLeft;

  // The host is BEHIND this peer (peer ran ahead). Honouring that literally would
  // hand the player back time. It must be absorbed, never displayed.
  sim.applyClockAuthority(aheadTicks - 30);
  assert.equal(sim.clockTicks, aheadTicks, 'a backwards correction must never rewind the clock');
  assert.equal(sim.timeLeft, aheadLeft, 'a backwards correction must never add time to the HUD');

  // ...and it is absorbed by HOLDING, so the display converges without a rewind.
  let last = sim.timeLeft;
  for (let i = 0; i < 20; i++) {
    sim.step(FIXED_DT, [null, null]);
    assert.ok(sim.timeLeft <= last + 1e-9, `the countdown moved backwards: ${last} -> ${sim.timeLeft}`);
    last = sim.timeLeft;
  }
  assert.ok(sim.clockTicks - aheadTicks <= 5,
    'while the host is behind, the local clock holds rather than racing ahead of it');
}

console.log('--- T-635: a peer that cannot keep up converges on the host clock ---');
{
  const fake = createFakeTimers();
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('CLK635', 'host-sender');
  const peerCh = hub.createChannel('CLK635', 'peer-sender');

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 42, players: TWO,
    durationSeconds: 180, timers: fake.timers,
  });
  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 42, players: TWO, mySlot: 1,
    hostSenderId: 'host-sender', durationSeconds: 180, timers: fake.timers,
  });
  assert.equal(peer.sim.clockFollows, true, 'a peer sim must follow the host clock, not its own');

  // The measured failure: the peer manages one sim step for every two of the
  // host's. Over 600 host ticks that is 5 s of silent divergence.
  let last = peer.sim.timeLeft;
  let backwards = 0;
  let syncs = 0;
  for (let i = 0; i < 600; i++) {
    host.step(FIXED_DT, null);
    host.sendStateSync();
    syncs++;
    if (i % 2 === 0) {
      peer.step(FIXED_DT, null);
      if (peer.sim.timeLeft > last + 1e-9) backwards++;
      last = peer.sim.timeLeft;
    }
  }
  assert.equal(backwards, 0, 'the peer HUD must never show the countdown going back up');
  const lag = Math.abs(peer.sim.timeLeft - host.sim.timeLeft);
  assert.ok(lag <= 0.35,
    `a struggling peer must track the host clock; drifted ${lag.toFixed(2)}s after ${syncs} syncs`);

  // ...and once it can keep up again it lands exactly on host time, in a bounded
  // number of syncs rather than "eventually".
  let converged = -1;
  for (let i = 0; i < 200; i++) {
    host.step(FIXED_DT, null);
    host.sendStateSync();
    peer.step(FIXED_DT, null);
    if (Math.abs(peer.sim.timeLeft - host.sim.timeLeft) <= 2 / 60) { converged = i; break; }
  }
  assert.ok(converged >= 0 && converged < 200,
    `the peer must converge within 200 syncs (took ${converged})`);

  host.destroy();
  peer.destroy();
  hostCh.close();
  peerCh.close();
}

console.log('--- T-635: the peer never ends the match on its own clock ---');
{
  const follower = new VoxelSandboxSim({
    scene: 'gallery', seed: 'clock-d', mode: 'freeplay',
    clockLimitTicks: 60, clockFollower: true, holes: TWO_CFG,
  });
  for (let i = 0; i < 240; i++) follower.step(FIXED_DT, [null, null]);
  assert.equal(follower.timeLeft, 0, 'the follower clock still reaches zero on the HUD');
  assert.equal(follower.timedOut, false, 'only GAME_OVER from the host may end a peer match');
  assert.equal(follower.over, false, 'a peer must not latch the match over on its local clock');

  // The host keeps ending its own match on its own clock — unchanged.
  const authority = new VoxelSandboxSim({
    scene: 'gallery', seed: 'clock-d', mode: 'freeplay',
    clockLimitTicks: 60, holes: TWO_CFG,
  });
  for (let i = 0; i < 240; i++) authority.step(FIXED_DT, [null, null]);
  assert.equal(authority.timedOut, true, 'the authoritative sim still times out');
  assert.equal(authority.over, true);
}

// ===========================================================================
// T-636 — coins read as one shared pool draining
// ===========================================================================

console.log('\n--- T-636: one pool, drained by whoever takes the coin ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery', seed: 'coins-a', mode: 'freeplay', holes: TWO_CFG,
  });
  const total = sim.coins.length;
  assert.ok(total > 4, 'the scene must actually place coins for this to mean anything');
  assert.equal(sim.coinsRemaining, total, 'a fresh pool is entirely unclaimed');

  // Two holes, two coins far enough apart that each pickup is unambiguous.
  const a = sim.coins[0];
  const b = sim.coins.find((c) => c !== a && Math.hypot(c.x - a.x, c.z - a.z) > 20);
  assert.ok(b, 'need two well-separated coins');
  sim.holes[0].x = a.x; sim.holes[0].z = a.z;
  sim.holes[1].x = b.x; sim.holes[1].z = b.z;
  sim.step(FIXED_DT, [null, null]);

  const byHole = (sim.holes[0].coinsCollected || 0) + (sim.holes[1].coinsCollected || 0);
  assert.ok(sim.holes[0].coinsCollected >= 1, 'slot 0 must be credited with what slot 0 took');
  assert.ok(sim.holes[1].coinsCollected >= 1, 'slot 1 must be credited with what slot 1 took');
  assert.equal(sim.coinsRemaining, total - byHole,
    'ONE pool: the remaining count is the total minus what EVERY player took');
  assert.ok(sim.coinsRemaining < total);
}

console.log('--- T-636: the shared total is host-authoritative on the wire ---');
{
  const msg = createStateSync({ tick: 3, holes: [], coinsCollected: 17 });
  assert.equal(msg.coinsCollected, 17,
    'STATE_SYNC must carry the shared pool so a peer cannot compute a different one');
  assert.ok(validateMessage(msg));
  assert.equal(createStateSync({ tick: 1, holes: [] }).coinsCollected, 0);
}

console.log('--- T-636: host and peer show the same remaining count ---');
{
  const fake = createFakeTimers();
  const hub = new InMemoryChannelHub();
  const hostCh = hub.createChannel('CON636', 'host-sender');
  const peerCh = hub.createChannel('CON636', 'peer-sender');

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 7, players: TWO,
    durationSeconds: 180, timers: fake.timers,
  });
  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 7, players: TWO, mySlot: 1,
    hostSenderId: 'host-sender', durationSeconds: 180, timers: fake.timers,
  });
  assert.equal(host.sim.isMultiplayer, true, 'a match sim must know it is a match');
  assert.equal(peer.sim.isMultiplayer, true);
  assert.equal(host.sim.coins.length, peer.sim.coins.length, 'same seed, same pool');
  const total = host.sim.coins.length;

  // The HOST's own hole takes a coin. The peer never saw it happen locally.
  const c = host.sim.coins[0];
  host.sim.holes[0].x = c.x; host.sim.holes[0].z = c.z;
  host.step(FIXED_DT, null);
  host.sendStateSync();

  const hostTook = host.sim.holes[0].coinsCollected || 0;
  assert.ok(hostTook >= 1);
  assert.equal(host.sim.coinsRemaining, total - hostTook);
  assert.equal(peer.sim.coinsRemaining, host.sim.coinsRemaining,
    'the peer must render the HOST\'s pool, not one it computed for itself');

  // Now the peer's own local sim collects the same coin with the teleported rival
  // hole — the drift path the clock bug rode in on. The shared count must not
  // double-count it, because it is host truth rather than a local sum.
  for (let i = 0; i < 3; i++) peer.step(FIXED_DT, null);
  assert.equal(peer.sim.coinsRemaining, host.sim.coinsRemaining,
    'a peer\'s local collection must not move the authoritative shared pool');

  // ...and a stale sync must never hand coins back to the pool.
  peer.sim.applyCoinAuthority(0);
  assert.equal(peer.sim.coinsRemaining, host.sim.coinsRemaining,
    'the shared pool only ever drains');

  // Per-player attribution survives all of it, which is what the podium banks.
  host.sim.holes[1].coinsCollected = 4;
  host.sim.holes[1].coins = 8;
  host.sendStateSync();
  assert.equal(peer.sim.holes[1].coinsCollected, 4, 'per-player found-count stays attributed');
  assert.equal(peer.sim.holes[1].coins, 8, 'per-player coin value stays attributed');
  const board = buildLeaderboard({ holes: peer.sim.holes, players: TWO, totalMass: peer.sim.totalMass || 1 });
  const alice = board.find((r) => r.slot === 1);
  assert.equal(alice.coinsCollected, 4, 'the podium breakdown still reads per player');
  assert.equal(alice.coins, 8);

  host.destroy();
  peer.destroy();
  hostCh.close();
  peerCh.close();
}

console.log('--- T-636: the readout copy — solo unchanged, match reads as a draining pool ---');
{
  assert.equal(typeof formatCoinReadout, 'function',
    'the readout must be a pure formatter so it can be asserted without a DOM');

  // SOLO: byte-for-byte what it has always been.
  const soloSim = { coins: new Array(40), coinsCollected: 9 };
  assert.equal(formatCoinReadout(soloSim, { coinsCollected: 3 }), '🪙 3/40');
  assert.equal(formatCoinReadout(soloSim, null), '🪙 9/40');
  assert.equal(formatCoinReadout({ coins: [], coinsCollected: 0 }, null), '🪙 0/0');
  assert.equal(formatCoinReadout(soloSim, { coinsCollected: NaN }), '🪙 9/40');

  // MATCH: one shared number, counting down, reading as the pool and not as a tally.
  const matchSim = { coins: new Array(40), isMultiplayer: true, coinsRemaining: 31, coinsCollected: 9 };
  const readout = formatCoinReadout(matchSim, { coinsCollected: 3 });
  assert.equal(readout, '🪙 31 LEFT');
  assert.ok(!readout.includes('/'),
    'a "3/40" shape reads as a personal tally, which is the thing being replaced');
  assert.equal(formatCoinReadout({ ...matchSim, coinsRemaining: 0 }, { coinsCollected: 3 }), '🪙 0 LEFT');

  // The HUD must actually route through it, or the assertions above prove nothing.
  assert.match(hudSrc, /this\.timer\.textContent = formatCoinReadout\(/,
    'updateSandbox must render the readout through the shared formatter');
}

console.log('\n✓ Multiplayer clock authority & shared coin pool test PASSED');
