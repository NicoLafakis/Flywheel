// TDD Unit Test: Multiplayer Lobby Start Control
//
// Pins the start contract:
//
//   * a full lobby NEVER starts itself — reaching N/N is not consent
//   * the host's START NOW button is the normal path, at any seated count >= 2
//   * the unanimous non-host vote is an AFK escape hatch ONLY: at least 3 seated
//     players, locked until the host has been idle for 45 s, and wiped by any
//     roster change or any host activity
//   * the countdown is broadcast BY THE HOST even when a vote triggered it — a
//     client may ask for a start, it may never perform one
//
// Standalone by design (`node tools/lobby-start-control.test.mjs`) so it can run
// while tools/validate.mjs is owned by someone else. Registration there is
// outstanding.
//
// Test-design note: nothing below asserts by calling the method the
// implementation uses to decide the outcome. Votes are cast either through the
// public entry point or as RAW wire messages, and every start is judged from the
// COUNTDOWN_START that actually reached the room's transport, stamped with the
// senderId of whoever broadcast it.

import assert from 'node:assert/strict';
import { MultiplayerLobby } from '../js/multiplayer/lobby.js';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';
import * as protocol from '../js/multiplayer/protocol.js';

// The contract's own numbers, written here rather than imported: a test that
// reads the threshold out of the implementation cannot notice it changing.
const HOST_IDLE_UNLOCK_MS = 45000;
const MIN_SEATED_FOR_VOTE = 3;

// --- tiny runner ------------------------------------------------------------

let passes = 0;
let failures = 0;

function test(name, fn) {
  try {
    fn();
    passes++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    const detail = (err && err.message ? String(err.message) : String(err))
      .split('\n').slice(0, 4).join('\n        ');
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

// --- deterministic clock ----------------------------------------------------

/**
 * The `this._timers` seam lobby.js already exposes, driven by hand. A 45-second
 * idle threshold is not something a test may sleep through.
 */
function makeClock(start = 1_000_000) {
  let now = start;
  let nextId = 1;
  const intervals = new Map();
  const timeouts = new Map();

  const api = {
    now: () => now,
    setInterval: (fn, ms) => {
      const id = nextId++;
      intervals.set(id, { fn, ms: Math.max(1, Number(ms) || 1), next: now + Math.max(1, Number(ms) || 1) });
      return id;
    },
    clearInterval: (id) => { intervals.delete(id); },
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timeouts.set(id, { fn, at: now + Math.max(0, Number(ms) || 0) });
      return id;
    },
    clearTimeout: (id) => { timeouts.delete(id); },
  };

  function advance(ms) {
    const target = now + ms;
    for (;;) {
      let nextAt = Infinity;
      for (const t of timeouts.values()) if (t.at < nextAt) nextAt = t.at;
      for (const i of intervals.values()) if (i.next < nextAt) nextAt = i.next;
      if (!Number.isFinite(nextAt) || nextAt > target) break;
      now = nextAt;
      for (const [id, t] of [...timeouts]) {
        if (t.at <= now) { timeouts.delete(id); t.fn(); }
      }
      for (const [id, i] of [...intervals]) {
        if (i.next <= now) { i.next = now + i.ms; i.fn(); }
      }
    }
    now = target;
  }

  return { api, advance };
}

// --- room fixture -----------------------------------------------------------

let roomSeq = 0;

/**
 * A real hub, a real host lobby, real peer lobbies that join over the wire, and
 * an OBSERVER channel that seats nobody but sees every broadcast in the room.
 * The observer is what makes "who broadcast the countdown" answerable: every
 * outbound message is stamped with its sender's id by the channel itself.
 */
function makeRoom({ maxPlayers = 4, peers = 0, peerBeforeHost = false } = {}) {
  const code = `RM${String(++roomSeq).padStart(3, '0')}`;
  const clock = makeClock();
  const hub = new InMemoryChannelHub();

  const observer = hub.createChannel(code, 'observer');
  const wire = [];
  observer.onMessage((m) => wire.push(m));

  // The hub dispatches to channels in creation order, so by default the host
  // sees every message before any peer does — which can hide a peer acting on
  // one. `peerBeforeHost` puts a peer's channel FIRST so the ordering flips.
  const earlyChannel = peerBeforeHost ? hub.createChannel(code, 'early') : null;

  const hostChannel = hub.createChannel(code, 'host');
  const host = new MultiplayerLobby({
    channel: hostChannel,
    isHost: true,
    playerName: 'Host',
    scene: 'gallery',
    maxPlayers,
    roomCode: code,
    timers: clock.api,
  });

  const peerLobbies = [];
  let peerSeq = 0;

  function addPeer(name, presetChannel = null) {
    const id = presetChannel ? String(presetChannel.senderId) : `p${++peerSeq}`;
    const ch = presetChannel || hub.createChannel(code, id);
    const lobby = new MultiplayerLobby({
      channel: ch,
      isHost: false,
      playerName: name || `Peer${peerSeq}`,
      roomCode: code,
      timers: clock.api,
    });
    lobby._testChannel = ch;
    lobby._testSenderId = id;
    peerLobbies.push(lobby);
    return lobby;
  }

  if (earlyChannel) addPeer('Early', earlyChannel);
  for (let i = 0; i < peers; i++) addPeer();

  const of = (type) => wire.filter((m) => m.type === type);

  return { code, clock, hub, wire, host, peers: peerLobbies, addPeer, of, observer };
}

/** A raw vote straight onto the transport, bypassing whatever the client does. */
function forgeVote(lobby) {
  lobby._testChannel.broadcast({ type: 'START_VOTE', slot: lobby.mySlot });
}

function systemTexts(lobby) {
  return lobby.chatMessages.filter((m) => m.slot === -1).map((m) => String(m.text || ''));
}

console.log('Testing multiplayer lobby start control...');

// --- 0. protocol ------------------------------------------------------------

test('START_VOTE exists on the wire protocol and is NOT host-only', () => {
  assert.equal(protocol.MSG_TYPES.START_VOTE, 'START_VOTE', 'MSG_TYPES must declare START_VOTE');
  assert.equal(
    protocol.isHostOnlyType(protocol.MSG_TYPES.START_VOTE), false,
    'a vote is cast BY a client, so host-only would make it undeliverable',
  );
  assert.equal(typeof protocol.createStartVote, 'function', 'protocol must expose createStartVote');
});

test('START_VOTE goes through the same validation gate as every other message', () => {
  const good = protocol.createStartVote({ slot: 2, senderId: 'p1', name: 'Alice' });
  assert.equal(good.type, 'START_VOTE');
  assert.equal(good.slot, 2);
  assert.ok(protocol.validateMessage(good), 'a well-formed vote must survive validation');
  assert.equal(protocol.validateMessage({ type: 'START_VOTE', slot: 99 }), null, 'out-of-range slot must be rejected');
  assert.equal(protocol.validateMessage({ type: 'START_VOTE', slot: 1.5 }), null, 'non-integer slot must be rejected');
  assert.equal(protocol.validateMessage({ type: 'START_VOTE', slot: -1 }), null, 'negative slot must be rejected');
});

// --- 1. the regression pin --------------------------------------------------

test('a full lobby does NOT start a countdown on the last join', () => {
  const r = makeRoom({ maxPlayers: 3, peers: 2 });
  assert.equal(r.host.connectedCount, 3, 'all three seats must be filled');
  assert.equal(r.host.isFull, true, 'the room must actually be full');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'reaching N/N must not put a COUNTDOWN_START on the wire');
  assert.equal(r.host.countdownActive, false, 'the host must still be waiting');
  for (const p of r.peers) assert.equal(p.countdownActive, false, 'no peer may believe a countdown is running');
});

// --- 2. the host button -----------------------------------------------------

test('the host button starts the countdown at 2 seated players', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 1 });
  assert.equal(r.host.connectedCount, 2);
  r.host.startCountdown();
  assert.equal(r.host.countdownActive, true);
  const started = r.of('COUNTDOWN_START');
  assert.equal(started.length, 1, 'exactly one countdown must reach the room');
  assert.equal(String(started[0].senderId), 'host', 'the countdown must come FROM the host');
  assert.equal(r.peers[0].countdownActive, true, 'the peer must pick the countdown up off the wire');
});

test('the host button still starts the countdown in a full room', () => {
  const r = makeRoom({ maxPlayers: 3, peers: 2 });
  r.host.startCountdown();
  assert.equal(r.of('COUNTDOWN_START').length, 1);
  assert.equal(r.host.countdownActive, true);
});

// --- 3. two players: no vote path at all ------------------------------------

test('with 2 seated players the vote does not exist, at any idle duration', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 1 });
  const peer = r.peers[0];

  for (const elapsed of [10_000, HOST_IDLE_UNLOCK_MS, 120_000, 600_000]) {
    r.clock.advance(elapsed);
    assert.equal(peer.startVoteAvailable, false, `the vote must stay locked after ${elapsed} ms of host silence`);
    assert.equal(r.host.startVoteAvailable, false, 'the host must agree the vote is locked');
    assert.equal(peer.castStartVote(), false, 'castStartVote must refuse');
  }

  assert.equal(r.of('START_VOTE').length, 0, 'no vote may reach the wire');

  // ...and a client that skips castStartVote entirely gets nowhere either: with
  // one non-host seated, an ungated tally would be unanimous on the first vote.
  forgeVote(peer);
  assert.equal(r.host.countdownActive, false, 'a forged vote must not start a 2-player match');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'no countdown may reach the wire');
});

// --- 4. the idle threshold --------------------------------------------------

test('with 3 seated the vote is locked before the idle threshold and open after', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  assert.equal(r.host.connectedCount, MIN_SEATED_FOR_VOTE, 'fixture must seat exactly three');

  r.clock.advance(HOST_IDLE_UNLOCK_MS - 1000);
  assert.equal(r.host.startVoteAvailable, false, 'still locked one second short of the threshold');
  for (const p of r.peers) assert.equal(p.startVoteAvailable, false, 'a peer must not open it early either');

  // A raw vote in the locked window must be ignored, not banked for later.
  forgeVote(r.peers[0]);
  forgeVote(r.peers[1]);
  assert.equal(r.host.startVoteCount, 0, 'votes cast while locked must not be counted');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'and must certainly not start the match');

  r.clock.advance(2000);
  assert.equal(r.host.startVoteAvailable, true, 'past the threshold the vote must open');
  for (const p of r.peers) assert.equal(p.startVoteAvailable, true, 'every seated peer must see it open');
  assert.equal(r.host.startVoteRequired, 2, 'two non-hosts must be required');
  assert.equal(r.host.startVoteCount, 0, 'the tally starts empty');
});

// --- 5. non-unanimous -------------------------------------------------------

test('a non-unanimous tally does NOT start the match', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 3 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  assert.equal(r.host.startVoteRequired, 3, 'three non-hosts are seated');

  assert.equal(r.peers[0].castStartVote(), true);
  assert.equal(r.peers[1].castStartVote(), true);

  assert.equal(r.host.startVoteCount, 2, 'two of three votes must be tallied');
  assert.equal(r.host.countdownActive, false, 'two of three is not unanimous');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'nothing may reach the wire');

  // A second vote from the same player must not stand in for the missing one,
  // and must not re-announce itself in chat either — a client that spams the
  // wire would otherwise fill the feed with "Peer1 voted to start (2/3)".
  const before = systemTexts(r.host).length;
  r.peers[0].castStartVote();
  forgeVote(r.peers[0]);
  assert.equal(r.host.startVoteCount, 2, 'a duplicate vote must not inflate the tally');
  assert.equal(systemTexts(r.host).length, before, 'a duplicate vote must not re-announce itself');
  assert.equal(r.of('COUNTDOWN_START').length, 0);
});

test('the host cannot vote — it is not one of the non-hosts being polled', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  assert.equal(r.host.startVoteRequired, 2, 'two non-hosts must be required');

  // Stamped 'host' by the transport, so this is the strongest form of the case:
  // a vote genuinely originating from the host's own channel.
  r.host.channel.broadcast({ type: 'START_VOTE', slot: 0 });
  assert.equal(r.host.startVoteCount, 0, 'the host has a button; its vote is not counted');

  r.peers[0].castStartVote();
  assert.equal(r.host.startVoteCount, 1, 'one real vote of the two needed');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'host vote + one peer is not unanimity');
});

// --- 6. unanimous, host-broadcast ------------------------------------------

test('a unanimous tally starts the match, and the HOST is the broadcaster', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 3 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);

  assert.equal(r.peers[0].castStartVote(), true);
  assert.equal(r.peers[1].castStartVote(), true);
  assert.equal(r.host.startVoteCount, 2, 'two votes banked, one short');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'still nothing on the wire');

  assert.equal(r.peers[2].castStartVote(), true, 'the last non-host completes the tally');

  const started = r.of('COUNTDOWN_START');
  assert.equal(started.length, 1, 'exactly one countdown must reach the room');
  assert.equal(String(started[0].senderId), 'host', 'a client must never be the countdown broadcaster');
  assert.equal(r.host.countdownActive, true);
  for (const p of r.peers) assert.equal(p.countdownActive, true, 'every peer follows the host countdown');

  // The votes themselves came from the clients, so this is not the host talking
  // to itself: the seam being tested really was crossed.
  const votes = r.of('START_VOTE');
  assert.equal(votes.length, 3, 'three votes must have crossed the wire');
  for (const v of votes) {
    assert.notEqual(String(v.senderId), 'host', 'the host does not vote — it has a button');
  }
});

test('a peer that sees the deciding vote FIRST still does not launch the match', () => {
  // Ordering matters here and nowhere else: with the host at the head of the
  // dispatch order it starts the countdown before any peer has processed the
  // final vote, and every peer then bails on `countdownActive`. That masks a
  // missing host guard entirely. Flipping the order makes a peer the first
  // screen to see unanimity, which is the only arrangement that tests the guard.
  const r = makeRoom({ maxPlayers: 4, peers: 2, peerBeforeHost: true });
  assert.equal(r.host.connectedCount, 4, 'host + three non-hosts');
  assert.equal(String(r.peers[0]._testSenderId), 'early', 'the early peer must precede the host');
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);

  r.peers[0].castStartVote();
  r.peers[1].castStartVote();
  r.peers[2].castStartVote();

  const started = r.of('COUNTDOWN_START');
  assert.equal(started.length, 1, 'exactly one countdown, however the votes were ordered');
  assert.equal(String(started[0].senderId), 'host', 'the peer that tallied first must not have broadcast it');
});

test('a client cannot start the match by forging the countdown itself', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  r.peers[0]._testChannel.broadcast({ type: 'COUNTDOWN_START', durationMs: 3000, serverStartTs: r.clock.api.now() });
  assert.equal(r.peers[1].countdownActive, false, 'a countdown from a non-host must be discarded');
  assert.equal(r.host.countdownActive, false);
});

// --- 7. roster changes wipe the tally ---------------------------------------

test('a player LEAVING mid-vote resets the tally and re-locks the vote', () => {
  const r = makeRoom({ maxPlayers: 5, peers: 3 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  assert.equal(r.peers[0].castStartVote(), true);
  assert.equal(r.host.startVoteCount, 1, 'precondition: one vote is banked');

  r.host.handlePlayerLeave(r.peers[2]._testSenderId);

  assert.equal(r.host.startVoteCount, 0, 'a departure must wipe the tally');
  assert.equal(r.host.startVoteAvailable, false, 'and must restart the idle clock');
  assert.equal(r.peers[0].startVoteCount, 0, 'the surviving peer must wipe it too');
  assert.equal(r.of('COUNTDOWN_START').length, 0);
});

test('a player JOINING mid-vote resets the tally and re-locks the vote', () => {
  const r = makeRoom({ maxPlayers: 5, peers: 3 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  assert.equal(r.peers[0].castStartVote(), true);
  assert.equal(r.peers[1].castStartVote(), true);
  assert.equal(r.host.startVoteCount, 2, 'precondition: two votes are banked');

  r.addPeer('Latecomer');

  assert.equal(r.host.startVoteCount, 0, 'an arrival must wipe the tally');
  assert.equal(r.host.startVoteAvailable, false, 'and must restart the idle clock');
  assert.equal(r.peers[0].startVoteCount, 0, 'every seated peer must wipe it too');
  assert.equal(r.peers[0].startVoteAvailable, false, 'and re-lock');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'the new arrival certainly must not start the match');
});

test('the tally cannot survive a leave and be completed by the rest', () => {
  const r = makeRoom({ maxPlayers: 5, peers: 3 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  r.peers[0].castStartVote();
  r.peers[1].castStartVote();
  r.host.handlePlayerLeave(r.peers[2]._testSenderId);
  // Two non-hosts remain; if the tally had survived it would now read unanimous.
  forgeVote(r.peers[0]);
  forgeVote(r.peers[1]);
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'a wiped tally must not be completable from stale votes');
});

// --- 8. host activity -------------------------------------------------------

test('host activity during the idle window resets the timer and re-locks the vote', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  assert.equal(r.host.startVoteAvailable, true, 'precondition: the vote is open');
  assert.equal(r.peers[0].startVoteAvailable, true, 'precondition: the peer sees it open');

  r.host.noteHostActivity();

  assert.equal(r.host.startVoteAvailable, false, 'the host acting must re-lock the vote');
  assert.equal(r.peers[0].startVoteAvailable, false, 'and every peer must re-lock with it');
  assert.equal(r.peers[0].castStartVote(), false, 'a peer must not be able to vote into the closed window');

  r.clock.advance(HOST_IDLE_UNLOCK_MS - 1000);
  assert.equal(r.host.startVoteAvailable, false, 'the idle clock must have restarted, not resumed');

  r.clock.advance(2000);
  assert.equal(r.host.startVoteAvailable, true, 'a second full idle window re-opens it');
});

test('idle time does not accumulate across host activity', () => {
  // The ordinary case, and the one an "only re-lock an OPEN vote" shortcut gets
  // wrong: a host who does something every half minute is never idle for 45
  // seconds, however long the lobby has been sitting there in total.
  const r = makeRoom({ maxPlayers: 4, peers: 2 });

  r.clock.advance(30_000);
  r.host.noteHostActivity();
  r.clock.advance(30_000);
  assert.equal(r.host.startVoteAvailable, false, '60 s in the lobby but only 30 s since the host acted');
  assert.equal(r.peers[0].startVoteAvailable, false, 'and no peer may open it either');

  r.host.noteHostActivity();
  r.clock.advance(30_000);
  assert.equal(r.host.startVoteAvailable, false, 'still 30 s since the last thing the host did');

  r.clock.advance(HOST_IDLE_UNLOCK_MS - 30_000 + 1000);
  assert.equal(r.host.startVoteAvailable, true, 'a genuinely uninterrupted window does open it');
});

test('host activity mid-vote wipes the tally', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  r.peers[0].castStartVote();
  assert.equal(r.host.startVoteCount, 1, 'precondition: one vote is banked');

  r.host.noteHostActivity();
  assert.equal(r.host.startVoteCount, 0, 'the host coming back must wipe the tally');

  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  forgeVote(r.peers[1]);
  assert.equal(r.host.startVoteCount, 1, 'the re-opened vote starts from zero, not from one');
  assert.equal(r.of('COUNTDOWN_START').length, 0, 'so one vote is not unanimous');
});

test('the host sending chat counts as host activity', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  assert.equal(r.host.startVoteAvailable, true, 'precondition: the vote is open');
  r.host.sendChat('sorry, one sec');
  assert.equal(r.host.startVoteAvailable, false, 'a host that is typing is not AFK');
  assert.equal(r.peers[0].startVoteAvailable, false, 'and the room can see it typing');
});

test('a cancelled countdown does not drop the room into an already-open vote', () => {
  const r = makeRoom({ maxPlayers: 5, peers: 3 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 5000);
  assert.equal(r.host.startVoteAvailable, true, 'precondition: the vote is open');

  r.host.startCountdown();
  assert.equal(r.host.countdownActive, true);
  r.host.cancelCountdown('PLAYER_LEFT');
  assert.equal(r.host.countdownActive, false);

  // Starting the match was the host acting. The idle window restarts from there
  // rather than resuming a clock that had been running the whole time.
  assert.equal(r.host.startVoteAvailable, false, 'the vote must not reopen the instant a countdown is cancelled');
  assert.equal(r.peers[0].startVoteAvailable, false, 'nor on any peer');
  r.clock.advance(HOST_IDLE_UNLOCK_MS - 1000);
  assert.equal(r.host.startVoteAvailable, false, 'a full fresh window is required');
  r.clock.advance(2000);
  assert.equal(r.host.startVoteAvailable, true, 'and after it, the vote is open again');
});

// --- 9. chat feedback -------------------------------------------------------

test('the lobby narrates the vote in system chat', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);

  const unlockText = systemTexts(r.peers[0]).join(' | ');
  assert.match(unlockText, /vote/i, 'the unlock must be announced to the players who can use it');

  r.peers[0].castStartVote();
  const afterFirst = systemTexts(r.peers[1]).join(' | ');
  assert.match(afterFirst, /1\s*\/\s*2/, 'each vote landing must show the tally as n/m');

  r.peers[1].castStartVote();
  const afterPass = systemTexts(r.host).join(' | ');
  assert.match(afterPass, /pass|starting/i, 'the vote passing must be announced');
});

// `_appendSystemChat` writes to the LOCAL chat log only — it never puts anything
// on the wire (a system line carries slot -1, which `validateMessage` rejects
// outright, so it physically cannot be broadcast). Narration therefore reaches
// everyone only because every client independently derives it from a message
// that IS broadcast: START_VOTE for the tally, ROOM_STATE.startVoteOpen for the
// gate. If that derivation were done on the caster alone, the vote would look
// silent to everybody else. This test is the difference between those two.
test('every seated client sees the vote narration, not just the one that generated it', () => {
  const r = makeRoom({ maxPlayers: 4, peers: 2 });
  const everyone = () => [r.host, r.peers[0], r.peers[1]];
  const who = ['host', 'peer0', 'peer1'];

  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  everyone().forEach((c, i) => assert.match(systemTexts(c).join(' | '), /vote/i,
    `${who[i]} must be told the vote unlocked`));

  r.peers[0].castStartVote();
  everyone().forEach((c, i) => assert.match(systemTexts(c).join(' | '), /1\s*\/\s*2/,
    `${who[i]} must see the running tally, including the two clients that did not cast it`));

  r.peers[1].castStartVote();
  everyone().forEach((c, i) => assert.match(systemTexts(c).join(' | '), /pass|starting/i,
    `${who[i]} must be told the vote passed`));

  // Exactly once. Two paths can announce it and the ordering decides which runs
  // first, so a missing guard shows up here as a doubled line rather than a
  // missing one — the opposite failure, equally wrong.
  everyone().forEach((c, i) => assert.equal(
    systemTexts(c).filter((t) => /vote passed/i.test(t)).length, 1,
    `${who[i]} must be told once, not twice`));
});

test('the pass is announced once in either dispatch order', () => {
  // `peerBeforeHost` puts a peer ahead of the host, so that peer tallies the
  // deciding vote itself AND then receives COUNTDOWN_START.viaVote — the one
  // arrangement where both announce paths fire on the same client.
  const r = makeRoom({ maxPlayers: 5, peers: 1, peerBeforeHost: true });
  r.clock.advance(HOST_IDLE_UNLOCK_MS + 1000);
  r.peers.forEach((p) => p.castStartVote());

  [r.host, ...r.peers].forEach((c, i) => assert.equal(
    systemTexts(c).filter((t) => /vote passed/i.test(t)).length, 1,
    `client ${i} must see the pass exactly once with the peer dispatching first`));
  assert.equal(r.host.countdownActive, true, 'and the vote must still have started the match');
});

// --- summary ----------------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log('✗ Multiplayer lobby start control test FAILED');
  process.exit(1);
}
console.log('✓ Multiplayer lobby start control test PASSED');
