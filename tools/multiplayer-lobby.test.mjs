// TDD Unit Test: Multiplayer Lobby & Ephemeral Chat
import assert from 'node:assert/strict';
import { MultiplayerLobby } from '../js/multiplayer/lobby.js';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';

console.log('Testing multiplayer lobby & ephemeral chat...');

const hub = new InMemoryChannelHub();

// 1. Host creates room for Level 1 (The Lab, 3 players)
const hostChannel = hub.createChannel('TEST1', 'host');
const hostLobby = new MultiplayerLobby({
  channel: hostChannel,
  isHost: true,
  playerName: 'HostPlayer',
  playerSkin: 'default',
  scene: 'gallery',
  maxPlayers: 3,
  roomCode: 'TEST1',
});

assert.equal(hostLobby.isHost, true);
assert.equal(hostLobby.scene, 'gallery');
assert.equal(hostLobby.maxPlayers, 3);
assert.equal(hostLobby.connectedCount, 1);
assert.equal(hostLobby.countdownActive, false);

// 2. Peer 1 joins
const peer1Channel = hub.createChannel('TEST1', 'peer-1');
const peer1Lobby = new MultiplayerLobby({
  channel: peer1Channel,
  isHost: false,
  playerName: 'Alice',
  playerSkin: 'nebula',
  roomCode: 'TEST1',
});

// Sync handshake
hostLobby.handleJoinRequest({ name: 'Alice', skin: 'nebula', senderId: 'peer-1' });
assert.equal(hostLobby.connectedCount, 2);
assert.equal(hostLobby.countdownActive, false, 'Should not start with 2/3 players');

// 3. Ephemeral Chat Test
let peer1ReceivedChat = null;
peer1Lobby.onChat = (msg) => { peer1ReceivedChat = msg; };

hostLobby.sendChat('Welcome to The Lab!');
// Hub dispatches
assert.ok(hostLobby.chatMessages.length === 1);
assert.equal(hostLobby.chatMessages[0].text, 'Welcome to The Lab!');

// Verify chat is not written to disk or storage (memory array only)
assert.equal(typeof hostLobby.chatMessages, 'object');

// 4. Peer 2 joins -> room reaches full capacity (3/3) and WAITS there.
//
// The auto-start on a full room was removed 2026-08-17 by owner decision: the
// match had been beginning the instant the last player finished loading, before
// anyone had picked a skin or read the chat. A countdown now has exactly two
// entry points — the host pressing start, or a unanimous vote of the non-hosts
// once the host has gone idle. See .wiki/modules/multiplayer.md "Start control"
// for the contract, and tools/lobby-start-control.test.mjs for the vote gate.
let countdownStarted = false;
hostLobby.onCountdownStart = () => { countdownStarted = true; };

hostLobby.handleJoinRequest({ name: 'Bob', skin: 'gold', senderId: 'peer-2' });
assert.equal(hostLobby.connectedCount, 3);
assert.equal(hostLobby.isFull, true, 'the room must genuinely be at capacity for the next line to mean anything');
assert.equal(hostLobby.countdownActive, false, 'a full room must WAIT for the host, not start itself');
assert.equal(countdownStarted, false, 'filling the room must not fire the countdown callback either');

// 4b. ...and the host can still start it from exactly that state. This half is
//     what keeps the assertion above honest: `countdownActive === false` on its
//     own also passes on a lobby that seats nobody, or that can never start.
hostLobby.startCountdown();
assert.equal(hostLobby.countdownActive, true, 'the host must be able to start a full room');
assert.equal(countdownStarted, true, 'the host start must fire the countdown callback the UI draws from');

// 5. Peer leaves during countdown -> Countdown cancels and slot is freed
hostLobby.handlePlayerLeave('peer-2');
assert.equal(hostLobby.connectedCount, 2);
assert.equal(hostLobby.countdownActive, false, 'Countdown must cancel if a player leaves');

// 6. Destruction clears all memory
hostLobby.destroy();
assert.equal(hostLobby.chatMessages.length, 0);

console.log('✓ Multiplayer lobby test PASSED');
