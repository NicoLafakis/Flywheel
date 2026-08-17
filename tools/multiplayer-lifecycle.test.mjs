// TDD Unit Test: Multiplayer Lifecycle Batch (T-627, T-630, T-630a, T-631..T-634)
//
// One suite per task, in task order. Everything here runs headless: presence is
// driven through the in-memory hub, every timer is injected, and the two DOM-only
// consequences (main.js roster hand-off, ui.js podium copy) are pinned by static
// source assertions so a regression fails a gate rather than waiting for a browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Namespace imports for the modules that GAIN exports in this batch: a missing
// named import is a link-time SyntaxError, which would hide every other
// assertion in the file behind one unrelated failure.
import * as voxelsim from '../js/voxelsim.js';
import * as protocol from '../js/multiplayer/protocol.js';
import * as roster from '../js/multiplayer/roster.js';
import * as mpConfig from '../js/multiplayer/config.js';

import { VoxelSandboxSim, StormSystem, loadScene } from '../js/voxelsim.js';
import { LEVEL_CLOCK_TICKS, CHALLENGE_CLOCK_TICKS } from '../js/levelclock.js';
import {
  InMemoryChannelHub,
  LiveBroadcastChannel,
  MultiplayerChannel,
  _setRealtimeClientForTest,
} from '../js/multiplayer/channel.js';
import { MultiplayerLobby } from '../js/multiplayer/lobby.js';
import { MultiplayerHost } from '../js/multiplayer/host.js';
import { MultiplayerPeer } from '../js/multiplayer/peer.js';
import { MSG_TYPES } from '../js/multiplayer/protocol.js';

const { stormTwoTimeSeconds } = voxelsim;
const { isAuthorizedLeave, createPlayerJoin, createPlayerLeave } = protocol;
const { spawnAngleForSlot, spawnPositionForSlot, buildHoleConfigs, buildLeaderboard } = roster;
const { HOST_SILENCE_TIMEOUT_MS } = mpConfig;

console.log('Testing multiplayer lifecycle batch T-627, T-630..T-634...');

// core.autocrlf is on, so a working-tree file may be CRLF or LF depending on who
// last wrote it. Every static assertion below reads normalized text.
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const mainSrc = src('../js/main.js');
const uiSrc = src('../js/multiplayer/ui.js');
const voxelSrc = src('../js/voxelsim.js');

/**
 * Deterministic stand-ins for setInterval/setTimeout/Date.now so a 3-second
 * countdown and a 5-second host-silence watchdog can be tested in microseconds.
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
  };
}

await loadScene('gallery');

const P = (slot, senderId, name, color) => ({
  slot, senderId, name, skin: 'default', color, isHost: slot === 0,
});

// ---------------------------------------------------------------------------
// T-630 — presence: the system must know a player arrived and that one is gone
// ---------------------------------------------------------------------------
console.log('\n--- T-630: transport-agnostic presence on the channel base class ---');
{
  assert.equal(typeof MultiplayerChannel.prototype.onPresenceChange, 'function',
    'presence must be exposed on the base class so lobby/host/peer never touch Supabase');

  const hub = new InMemoryChannelHub();
  const a = hub.createChannel('PRES1', 'alpha');
  const seenByA = [];
  const unsub = a.onPresenceChange((ev) => seenByA.push(ev));

  const b = hub.createChannel('PRES1', 'bravo');
  assert.equal(seenByA.length, 1, 'an existing member must be told a new member arrived');
  assert.equal(seenByA[0].event, 'join');
  assert.equal(seenByA[0].senderId, 'bravo');

  b.close();
  assert.equal(seenByA.length, 2, 'closing an in-memory channel must emit a leave');
  assert.equal(seenByA[1].event, 'leave');
  assert.equal(seenByA[1].senderId, 'bravo');

  unsub();
  const c = hub.createChannel('PRES1', 'charlie');
  assert.equal(seenByA.length, 2, 'onPresenceChange must return a working unsubscribe');
  c.close();
  a.close();
}

console.log('--- T-630: LiveBroadcastChannel enables presence and tracks its senderId ---');
{
  global.window = global.window || {};
  const opened = [];
  const tracked = [];
  let untracked = 0;
  const presenceHandlers = new Map();
  let subscribeCb = null;

  class MockChannel {
    constructor(name, opts) { this.name = name; this.opts = opts; opened.push({ name, opts }); }
    on(type, filter, cb) {
      if (type === 'presence') presenceHandlers.set(filter.event, cb);
      return this;
    }
    subscribe(cb) { subscribeCb = cb; return this; }
    send() { return Promise.resolve(); }
    track(payload) { tracked.push(payload); return Promise.resolve(); }
    untrack() { untracked++; return Promise.resolve(); }
  }
  class MockClient {
    channel(name, opts) { return new MockChannel(name, opts); }
    removeChannel() {}
  }
  _setRealtimeClientForTest(new MockClient());

  const live = new LiveBroadcastChannel('PRESLIVE', 'peer-9');
  const seen = [];
  live.onPresenceChange((ev) => seen.push(ev));

  assert.equal(opened.length, 1);
  const cfg = opened[0].opts && opened[0].opts.config;
  assert.ok(cfg && cfg.presence, 'the realtime channel must be opened with a presence config');
  assert.equal(cfg.presence.key, 'peer-9', 'presence must be keyed by this client senderId');

  assert.ok(presenceHandlers.has('join'), 'the channel must listen for presence joins');
  assert.ok(presenceHandlers.has('leave'), 'the channel must listen for presence leaves');
  assert.ok(presenceHandlers.has('sync'), 'the channel must listen for the presence sync');

  subscribeCb('SUBSCRIBED');
  assert.equal(tracked.length, 1, 'the client must track itself once subscribed');
  assert.equal(tracked[0].senderId, 'peer-9', 'presence must carry the senderId the protocol binds slots to');

  presenceHandlers.get('leave')({ event: 'leave', key: 'peer-3', leftPresences: [{ senderId: 'peer-3' }] });
  assert.equal(seen.length, 1);
  assert.deepEqual(
    { event: seen[0].event, senderId: seen[0].senderId },
    { event: 'leave', senderId: 'peer-3' },
    'a Supabase presence leave must surface as a transport-agnostic leave event',
  );

  presenceHandlers.get('join')({ event: 'join', key: 'peer-4', newPresences: [{ senderId: 'peer-4' }] });
  assert.equal(seen[1].event, 'join');
  assert.equal(seen[1].senderId, 'peer-4');

  live.close();
  assert.ok(untracked >= 1, 'closing must untrack so the room stops counting this client as present');
  _setRealtimeClientForTest(null);
}

// ---------------------------------------------------------------------------
// T-630a — PLAYER_JOIN / PLAYER_LEAVE exist on the wire
// ---------------------------------------------------------------------------
console.log('\n--- T-630a: PLAYER_JOIN / PLAYER_LEAVE message types ---');
{
  assert.equal(MSG_TYPES.PLAYER_JOIN, 'PLAYER_JOIN');
  assert.equal(MSG_TYPES.PLAYER_LEAVE, 'PLAYER_LEAVE');

  const join = createPlayerJoin({ slot: 2, joinerSenderId: 'peer-2', name: 'Alice', skin: 'nebula', color: '#ffd23f' });
  assert.equal(join.type, MSG_TYPES.PLAYER_JOIN);
  assert.equal(join.slot, 2);
  assert.equal(join.joinerSenderId, 'peer-2');
  assert.ok(protocol.validateMessage(join), 'a well-formed PLAYER_JOIN must survive the wire validator');

  const leave = createPlayerLeave({ slot: 1, leaverSenderId: 'peer-1', name: 'Bob', reason: 'DISCONNECTED' });
  assert.equal(leave.type, MSG_TYPES.PLAYER_LEAVE);
  assert.equal(leave.slot, 1);
  assert.equal(leave.leaverSenderId, 'peer-1');
  assert.equal(leave.reason, 'DISCONNECTED');
  assert.ok(protocol.validateMessage(leave), 'a well-formed PLAYER_LEAVE must survive the wire validator');

  assert.equal(protocol.validateMessage({ ...leave, slot: 99 }), null, 'an impossible slot must be dropped');
  assert.equal(protocol.validateMessage({ ...leave, slot: -1 }), null);
  assert.equal(protocol.validateMessage({ ...join, name: { toString: 1 } }), null);

  // The host assigns slots, so only the host may say a slot was filled.
  assert.equal(protocol.isHostOnlyType(MSG_TYPES.PLAYER_JOIN), true,
    'a client must not be able to forge a roster addition');
  // A client announcing its OWN graceful exit is legitimate, so this one is not
  // host-only; ownership is enforced by isAuthorizedLeave instead.
  assert.equal(protocol.isHostOnlyType(MSG_TYPES.PLAYER_LEAVE), false,
    'a departing client must be able to say goodbye for itself');

  assert.equal(typeof isAuthorizedLeave, 'function');
  const fromHost = { ...leave, senderId: 'host' };
  const selfAnnounced = { ...leave, senderId: 'peer-1' };
  const forged = { ...leave, senderId: 'mallory' };
  assert.equal(isAuthorizedLeave(fromHost, 'host'), true, 'the host announces authoritative leaves');
  assert.equal(isAuthorizedLeave(selfAnnounced, 'host'), true, 'a client may announce its own exit');
  assert.equal(isAuthorizedLeave(forged, 'host'), false, 'nobody may evict a third party');
}

// ---------------------------------------------------------------------------
// T-631 — the lobby must free the slot of a player who backed out
// ---------------------------------------------------------------------------
console.log('\n--- T-631: a lobby slot is freed when its player disappears ---');
{
  const hub = new InMemoryChannelHub();
  const ROOM = 'T631';
  const hostFake = createFakeTimers();
  const hostCh = hub.createChannel(ROOM, 'host');
  const hostLobby = new MultiplayerLobby({
    channel: hostCh, isHost: true, playerName: 'Host', scene: 'gallery',
    maxPlayers: 3, roomCode: ROOM, timers: hostFake.timers,
  });

  const aliceCh = hub.createChannel(ROOM, 'peer-a');
  const alice = new MultiplayerLobby({
    channel: aliceCh, isHost: false, playerName: 'Alice', roomCode: ROOM,
    timers: createFakeTimers().timers,
  });
  const bobCh = hub.createChannel(ROOM, 'peer-b');
  const bob = new MultiplayerLobby({
    channel: bobCh, isHost: false, playerName: 'Bob', roomCode: ROOM,
    timers: createFakeTimers().timers,
  });

  assert.equal(hostLobby.connectedCount, 3, '3/3 must fill the room');
  // Auto-start on a full room was removed 2026-08-17 by owner decision; a full
  // room waits for the host. Started explicitly here because everything below
  // is about CANCELLING a running countdown — with nothing counting down, those
  // assertions would pass just as well on a lobby that can never start at all.
  assert.equal(hostLobby.countdownActive, false, 'a full room must not start itself');
  hostLobby.startCountdown();
  assert.equal(hostLobby.countdownActive, true, 'the host must be able to start a full room');
  const chatBefore = hostLobby.chatMessages.length;

  const roomStates = [];
  hostCh.onMessage((m) => { if (m.type === MSG_TYPES.ROOM_STATE) roomStates.push(m); });

  bobCh.close();

  assert.equal(hostLobby.players[2], null, 'the departed slot must be freed, not held forever');
  assert.equal(hostLobby.connectedCount, 2, 'the room must be able to reach N/N again');
  assert.equal(hostLobby.countdownActive, false, 'a running countdown must be cancelled by a departure');
  assert.equal(hostLobby.chatMessages.length, chatBefore + 1, 'the lobby must post the departure notice');
  assert.match(hostLobby.chatMessages[hostLobby.chatMessages.length - 1].text, /Bob/,
    'the notice must name who left');
  assert.ok(roomStates.length >= 1, 'the host must re-broadcast ROOM_STATE after freeing the slot');
  assert.equal(roomStates[roomStates.length - 1].players[2], null,
    'the broadcast roster must show the slot as empty');
  assert.equal(alice.players[2], null, 'every peer must see the freed slot');

  // The whole point of freeing the slot: the room can refill and start again.
  const carolCh = hub.createChannel(ROOM, 'peer-c');
  const carol = new MultiplayerLobby({
    channel: carolCh, isHost: false, playerName: 'Carol', roomCode: ROOM,
    timers: createFakeTimers().timers,
  });
  assert.equal(hostLobby.players[2] && hostLobby.players[2].name, 'Carol',
    'the freed slot must be reusable');
  // Both halves. Refilling must not start the match by itself...
  assert.equal(hostLobby.countdownActive, false, 'refilling to N/N must not start the match by itself');
  // ...but the room must still be startable afterwards. A room that quietly
  // became unstartable once somebody left and rejoined would strand everyone in
  // it — a worse failure than the auto-start this replaced.
  hostLobby.startCountdown();
  assert.equal(hostLobby.countdownActive, true, 'a refilled room must still be startable by the host');
  assert.equal(carol.countdownActive, true, 'and the player who rejoined must see that countdown');

  hostLobby.destroy(); alice.destroy(); bob.destroy(); carol.destroy();
  hostCh.close(); aliceCh.close(); carolCh.close();
}

// ---------------------------------------------------------------------------
// T-632 — a live match must react to a player leaving
// ---------------------------------------------------------------------------
console.log('\n--- T-632: a departed player stops playing and stops being played against ---');
{
  const hub = new InMemoryChannelHub();
  const ROOM = 'T632';
  const hostCh = hub.createChannel(ROOM, 'host');
  const aliceCh = hub.createChannel(ROOM, 'peer-a');
  const bobCh = hub.createChannel(ROOM, 'peer-b');

  const players = [
    P(0, 'host', 'Host', '#00f0ff'),
    P(1, 'peer-a', 'Alice', '#ff0054'),
    P(2, 'peer-b', 'Bob', '#ffd23f'),
  ];

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 7, players, durationSeconds: 180,
  });
  const alice = new MultiplayerPeer({
    channel: aliceCh, scene: 'gallery', matchSeed: 7, players, mySlot: 1,
    durationSeconds: 180, timers: createFakeTimers().timers,
  });
  const bob = new MultiplayerPeer({
    channel: bobCh, scene: 'gallery', matchSeed: 7, players, mySlot: 2,
    durationSeconds: 180, timers: createFakeTimers().timers,
  });

  // Alice steers, then vanishes with that input still buffered.
  alice.sendInput({ x: 1, z: 0 }, false);
  assert.ok(host.pendingInputs[1], 'the host must have buffered Alice\'s input');

  // Give her some stats so the podium has something to preserve.
  host.sim.holes[1].mass = 4321;
  host.sim.holes[1].rawMass = 1234;
  host.sim.holes[1].kills = 2;

  const leaveMsgs = [];
  bobCh.onMessage((m) => { if (m.type === MSG_TYPES.PLAYER_LEAVE) leaveMsgs.push(m); });
  let hostOver = null;
  host.onGameOver = (m) => { hostOver = m; };

  aliceCh.close();

  const gone = host.sim.holes[1];
  assert.equal(gone.departed, true, 'the departed hole must carry a distinct inactive flag');
  assert.notEqual(gone.alive, false,
    '`alive` means PvP-eaten-and-respawning; a departure must not be encoded in it');
  assert.equal(host.pendingInputs[1], null, 'the last input of a departed player must be cleared');

  // Her hole must not coast into the boundary clamp.
  const x0 = gone.x, z0 = gone.z;
  for (let t = 0; t < 60; t++) host.step(1 / 60, { x: 0, z: 0 });
  assert.equal(gone.x, x0, 'a departed hole must not keep moving');
  assert.equal(gone.z, z0, 'a departed hole must not keep moving');

  // Neither a PvP target...
  host.sim.holes[0].x = gone.x; host.sim.holes[0].z = gone.z;
  host.sim.holes[0].radius = 6; gone.radius = 1;
  const killsBefore = host.sim.holes[0].kills || 0;
  host.sim._stepPvP();
  assert.equal(host.sim.holes[0].kills || 0, killsBefore, 'a departed hole must not be edible');
  assert.notEqual(gone.alive, false, 'a departed hole must not be eaten');

  // ...nor a PvP attacker.
  gone.radius = 8; host.sim.holes[0].radius = 1;
  host.sim._stepPvP();
  assert.notEqual(host.sim.holes[0].alive, false, 'a departed hole must not be able to eat anyone');

  // Out of the live standings, still on the podium.
  assert.equal(typeof host.liveStandings, 'function', 'the host must expose the live standings');
  const live = host.liveStandings();
  assert.equal(live.some((r) => r.slot === 1), false, 'a departed player must leave the live standings');
  assert.equal(live.length, 2, 'the two players still in the match must remain');

  assert.ok(leaveMsgs.length >= 1, 'the host must broadcast PLAYER_LEAVE so peers stop rendering a frozen rival');
  assert.equal(leaveMsgs[0].slot, 1);
  assert.equal(bob.sim.holes[1].departed, true, 'a peer must mark the departed rival as departed');

  host.finishMatch('TIME_EXPIRED');
  const board = hostOver ? hostOver.finalLeaderboard : null;
  assert.ok(Array.isArray(board), 'finishMatch must publish a leaderboard');
  const aliceRow = board.find((r) => r.slot === 1);
  assert.ok(aliceRow, 'a departed player\'s final stats must still reach the podium');
  assert.equal(aliceRow.name, 'Alice');
  assert.equal(aliceRow.kills, 2, 'their stats must be the ones they earned before leaving');
  assert.equal(aliceRow.departed, true, 'the podium must be able to mark them as having left');

  host.destroy(); alice.destroy(); bob.destroy();
  hostCh.close(); bobCh.close();
}

// ---------------------------------------------------------------------------
// T-633 — a vanished host must not strand anybody
// ---------------------------------------------------------------------------
console.log('\n--- T-633: host silence ends the match locally instead of freezing it ---');
{
  assert.equal(typeof HOST_SILENCE_TIMEOUT_MS, 'number', 'the watchdog window must be a named constant');
  assert.ok(HOST_SILENCE_TIMEOUT_MS >= 3000 && HOST_SILENCE_TIMEOUT_MS <= 10000,
    'the watchdog must fire in a few seconds, not instantly and not never');

  const hub = new InMemoryChannelHub();
  const ROOM = 'T633';
  const hostCh = hub.createChannel(ROOM, 'host');
  const peerCh = hub.createChannel(ROOM, 'peer-a');
  const players = [P(0, 'host', 'Host', '#00f0ff'), P(1, 'peer-a', 'Alice', '#ff0054')];

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 5, players, durationSeconds: 180,
  });
  const fake = createFakeTimers();
  let over = null;
  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 5, players, mySlot: 1,
    durationSeconds: 180, timers: fake.timers, hostSilenceMs: 5000,
  });
  peer.onGameOver = (msg) => { over = msg; };

  host.sim.holes[0].mass = 900;
  host.sim.holes[1].mass = 1500;
  host.sendStateSync();
  assert.equal(peer.over, false);

  fake.advance(4000);
  assert.equal(peer.over, false, 'a live host must not trip the watchdog');
  host.sendStateSync();
  fake.advance(4000);
  assert.equal(peer.over, false, 'each STATE_SYNC must re-arm the watchdog');

  fake.advance(2000);
  assert.equal(peer.over, true, 'silence past the window must end the match locally');
  assert.ok(over, 'the peer must raise its own game over rather than wait forever');
  assert.equal(over.reason, 'HOST_LEFT', 'the reason must say the host left, in words the UI can print');
  assert.equal(over.finalLeaderboard.length, 2, 'the podium must be built from the last known standings');
  assert.equal(over.finalLeaderboard[0].slot, 1, 'the last known standings must be ranked, not raw');
  assert.equal(over.finalLeaderboard[0].score, 1500);

  host.destroy(); peer.destroy(); hostCh.close(); peerCh.close();
}

console.log('--- T-633: an alt-tabbed host must not read as a departed host ---');
{
  // The render loop is cancelled outright while the tab is hidden (see the
  // visibilitychange handler in js/main.js), so STATE_SYNC stops with it. Without
  // a heartbeat the watchdog above would end EVERY peer's match ~5 s after the
  // host glanced at another tab, which is a worse bug than the one it fixes.
  const hub = new InMemoryChannelHub();
  const ROOM = 'T633D';
  const hostCh = hub.createChannel(ROOM, 'host');
  const peerCh = hub.createChannel(ROOM, 'peer-a');
  const players = [P(0, 'host', 'Host', '#00f0ff'), P(1, 'peer-a', 'Alice', '#ff0054')];

  const hostFake = createFakeTimers();
  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 5, players, durationSeconds: 180,
    timers: hostFake.timers,
  });
  const peerFake = createFakeTimers();
  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 5, players, mySlot: 1,
    durationSeconds: 180, timers: peerFake.timers,
  });

  // The host's loop never runs again — only its heartbeat does.
  for (let elapsed = 0; elapsed < 20000; elapsed += 1000) {
    hostFake.advance(1000);
    peerFake.advance(1000);
  }
  assert.equal(peer.over, false, 'a host whose tab is merely hidden must keep the match alive');

  // ...and the heartbeat must stop the moment the match is genuinely over.
  host.finishMatch('TIME_EXPIRED');
  assert.equal(host._heartbeat, null, 'the heartbeat must not outlive the match');

  host.destroy(); peer.destroy(); hostCh.close(); peerCh.close();
}

console.log('--- T-633: presence gives the same answer without waiting for the watchdog ---');
{
  const hub = new InMemoryChannelHub();
  const ROOM = 'T633B';
  const hostCh = hub.createChannel(ROOM, 'host');
  const peerCh = hub.createChannel(ROOM, 'peer-a');
  const players = [P(0, 'host', 'Host', '#00f0ff'), P(1, 'peer-a', 'Alice', '#ff0054')];

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 5, players, durationSeconds: 180,
  });
  const fake = createFakeTimers();
  let over = null;
  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 5, players, mySlot: 1,
    durationSeconds: 180, timers: fake.timers,
  });
  peer.onGameOver = (msg) => { over = msg; };

  hostCh.close();
  assert.equal(peer.over, true, 'the host closing its tab must end the match at once');
  assert.equal(over && over.reason, 'HOST_LEFT');

  host.destroy(); peer.destroy(); peerCh.close();
}

console.log('--- T-633: the host leaving the LOBBY is surfaced too ---');
{
  const hub = new InMemoryChannelHub();
  const ROOM = 'T633C';
  const hostCh = hub.createChannel(ROOM, 'host');
  const hostLobby = new MultiplayerLobby({
    channel: hostCh, isHost: true, playerName: 'Host', scene: 'gallery',
    maxPlayers: 4, roomCode: ROOM, timers: createFakeTimers().timers,
  });
  const peerCh = hub.createChannel(ROOM, 'peer-a');
  const peerLobby = new MultiplayerLobby({
    channel: peerCh, isHost: false, playerName: 'Alice', roomCode: ROOM,
    timers: createFakeTimers().timers,
  });
  let reason = null;
  peerLobby.onHostLeft = (r) => { reason = r; };

  hostCh.close();
  assert.equal(peerLobby.hostLeft, true, 'a peer must notice the host abandoned the lobby');
  assert.equal(reason, 'HOST_LEFT', 'and must be told why in words the UI can print');

  hostLobby.destroy(); peerLobby.destroy(); peerCh.close();
}

// ---------------------------------------------------------------------------
// T-634 — slot number must always equal array index
// ---------------------------------------------------------------------------
console.log('\n--- T-634: an empty slot must not shift every player after it ---');
{
  assert.equal(typeof spawnAngleForSlot, 'function', 'spawn geometry must be one shared expression');
  assert.equal(spawnAngleForSlot(0, 6), 0);
  assert.equal(spawnAngleForSlot(3, 6), spawnAngleForSlot(3, 6));
  assert.notEqual(spawnAngleForSlot(2, 6), spawnAngleForSlot(3, 6));

  const configs = buildHoleConfigs([P(0, 'host', 'Host', '#00f0ff'), null, P(2, 'peer-b', 'Bob', '#ffd23f')]);
  assert.equal(configs.length, 3, 'the hole roster must stay slot-indexed, holes and all');
  assert.equal(configs[2].slot, 2, 'a player in slot 2 must build the hole at index 2');
  assert.equal(configs[1].departed, true, 'an empty slot must seat an inert placeholder, never a player');

  const hub = new InMemoryChannelHub();
  const ROOM = 'T634';
  const hostCh = hub.createChannel(ROOM, 'host');
  const peerCh = hub.createChannel(ROOM, 'peer-b');
  const sparse = [P(0, 'host', 'Host', '#00f0ff'), null, P(2, 'peer-b', 'Bob', '#ffd23f'), null];

  const host = new MultiplayerHost({
    channel: hostCh, scene: 'gallery', matchSeed: 3, players: sparse, durationSeconds: 180,
  });
  const peer = new MultiplayerPeer({
    channel: peerCh, scene: 'gallery', matchSeed: 3, players: sparse, mySlot: 2,
    durationSeconds: 180, timers: createFakeTimers().timers,
  });

  assert.equal(host.sim.holes.length, 4, 'the sim roster must be indexed by slot, not compacted');
  assert.equal(host.sim.holes[2].slot, 2);
  assert.equal(host.sim.holes[2].name, 'Bob');
  assert.equal(host.sim.holes[1].departed, true, 'the empty slot must never act as a player');
  assert.equal(peer.sim.localSlot, 2);
  assert.equal(peer.myHole, peer.sim.holes[2], 'a peer must steer ITS OWN hole, not the host\'s');
  assert.notEqual(peer.myHole, peer.sim.holes[0]);

  // Same slot, same spawn point, on both clients — otherwise rivals appear in
  // places they are not.
  for (let s = 0; s < 4; s++) {
    assert.equal(host.sim.holes[s].x, peer.sim.holes[s].x, `slot ${s} must spawn at the same x on host and peer`);
    assert.equal(host.sim.holes[s].z, peer.sim.holes[s].z, `slot ${s} must spawn at the same z on host and peer`);
  }
  const expected = spawnPositionForSlot(2, 4);
  assert.equal(host.sim.holes[2].x, expected.x, 'the spawn angle must be derived from the SLOT, not the array index');
  assert.equal(host.sim.holes[2].z, expected.z);

  let sparseOver = null;
  host.onGameOver = (m) => { sparseOver = m; };
  host.finishMatch('TIME_EXPIRED');
  const board = sparseOver.finalLeaderboard;
  assert.equal(board.length, 2, 'an empty slot must not appear on the podium as a phantom player');
  assert.deepEqual(board.map((r) => r.slot).sort(), [0, 2]);

  host.destroy(); peer.destroy(); hostCh.close(); peerCh.close();
}

console.log('--- T-634: main.js must hand the session the full slot-indexed roster ---');
{
  assert.ok(!/players:\s*mpLobby\.players\.filter\(Boolean\)/.test(mainSrc),
    'compacting the roster is what makes slot 3 land at array index 2');
  assert.ok(!/\.players\.filter\(Boolean\)/.test(mainSrc),
    'no path may hand a compacted roster to a multiplayer session');
}

console.log('--- T-634: voxelsim respawn must read the slot, including slot 0 ---');
{
  assert.ok(!/\(h\.slot \|\| h\.index\)/.test(voxelSrc),
    'a falsy-zero || silently substitutes index whenever slot === 0');

  // slot 0 seated at array index 1 is the case the || bug hides.
  const sim = new VoxelSandboxSim('gallery', {
    seed: 9,
    holes: [
      { slot: 1, name: 'B', x: 0, z: 0 },
      { slot: 0, name: 'A', x: 0, z: 0 },
    ],
  });
  const h = sim.holes[1];
  assert.equal(h.slot, 0);
  assert.equal(h.index, 1);
  h.alive = false;
  h.respawnTimer = 1 / 120;
  sim.step(1 / 60);
  assert.equal(h.alive, true, 'the respawn must have fired');
  const dist = Math.min(25, (sim.bounds || 30) * 0.7);
  assert.ok(Math.abs(h.x - dist) < 0.01 && Math.abs(h.z) < 0.01,
    `slot 0 must respawn at angle 0, got (${h.x}, ${h.z})`);
}

// ---------------------------------------------------------------------------
// T-627 — the second storm must land inside the match it belongs to
// ---------------------------------------------------------------------------
console.log('\n--- T-627: storm 2 fires before the final tick of a 3-minute match ---');
{
  assert.equal(typeof stormTwoTimeSeconds, 'function', 'the storm schedule must be an assertable pure helper');

  // The 300 s pacing is a hard constraint: byte-identical before and after.
  assert.equal(stormTwoTimeSeconds('freeplay', LEVEL_CLOCK_TICKS), 180.0, '300 s keeps its 180 s storm exactly');

  const at180 = stormTwoTimeSeconds('freeplay', 180 * 60);
  assert.ok(at180 < 180, 'a 180 s match must fire its storm strictly before the final tick');
  // 4 s of warning plus a 16 s storm has to fit inside what is left.
  assert.ok(at180 + 4 + 16 < 180, 'the storm must have time to actually play out');
  // And it must not land on top of the meteor beat the same match already has.
  assert.notEqual(at180, voxelsim.disasterTwoTimeSeconds('freeplay', 180 * 60));
  assert.equal(stormTwoTimeSeconds('challenge3m', CHALLENGE_CLOCK_TICKS), at180,
    '180 s city challenges had the same never-fires bug');

  const fakeSim = (clockLimit, mode = 'freeplay') => ({ seed: 'storm', mode, clockLimit, scene: 'manhattan' });

  const at300 = new StormSystem(fakeSim(LEVEL_CLOCK_TICKS)).schedule;
  assert.deepEqual(at300, [
    { triggerT: 60.0, duration: 16.0, done: false },
    { triggerT: 180.0, duration: 16.0, done: false },
  ], 'the 300 s schedule must be unchanged, entry for entry');

  const short = new StormSystem(fakeSim(180 * 60)).schedule;
  assert.equal(short.length, 2, 'a 3-minute match still gets both storms');
  assert.equal(short[0].triggerT, 60.0, 'the first storm keeps its 60 s beat');
  assert.ok(short[1].triggerT < 180, 'the second storm must trigger inside the match');
  assert.equal(short[1].triggerT, at180);

  // The 90 s modes keep their own single hand-tuned storm.
  const run90 = new StormSystem({ seed: 'storm', mode: 'run90', clockLimit: null, scene: 'manhattan' }).schedule;
  assert.deepEqual(run90, [{ triggerT: 28.0, duration: 12.0, done: false }]);
  const secret = new StormSystem(fakeSim(5400, 'challenge90s')).schedule;
  assert.deepEqual(secret, [{ triggerT: 28.0, duration: 12.0, done: false }]);
  // The Lab never storms.
  assert.deepEqual(new StormSystem({ seed: 'storm', mode: 'freeplay', clockLimit: LEVEL_CLOCK_TICKS, scene: 'gallery' }).schedule, []);
}

// ---------------------------------------------------------------------------
// Shared leaderboard builder — one shape for the host podium and the peer's
// fallback podium, so a host-loss podium cannot render differently.
// ---------------------------------------------------------------------------
console.log('\n--- shared: one leaderboard builder for both podium paths ---');
{
  assert.equal(typeof buildLeaderboard, 'function');
  const holes = [
    { slot: 0, mass: 100, rawMass: 50, kills: 0 },
    { slot: 1, mass: 900, rawMass: 400, kills: 3, departed: true },
    { slot: 2, mass: 400, rawMass: 200, kills: 1 },
  ];
  const players = [P(0, 'host', 'Host', '#00f0ff'), P(1, 'peer-a', 'Alice', '#ff0054'), null];
  const full = buildLeaderboard({ holes, players, totalMass: 1000 });
  assert.equal(full.length, 2, 'a slot nobody ever occupied has no stats to show');
  assert.equal(full[0].slot, 1);
  assert.equal(full[0].rank, 1);
  const liveOnly = buildLeaderboard({ holes, players, totalMass: 1000, includeDeparted: false });
  assert.equal(liveOnly.length, 1);
  assert.equal(liveOnly[0].slot, 0);
}

console.log('--- shared: the podium names the host-left ending ---');
{
  assert.match(uiSrc, /HOST_LEFT/, 'the podium must have copy for a host that walked out');
}

console.log('\n✓ Multiplayer lifecycle batch test PASSED');
