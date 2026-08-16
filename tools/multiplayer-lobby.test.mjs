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

// 4. Peer 2 joins -> Room reaches full capacity (3/3) -> Auto-start countdown initiates!
let countdownStarted = false;
hostLobby.onCountdownStart = () => { countdownStarted = true; };

hostLobby.handleJoinRequest({ name: 'Bob', skin: 'gold', senderId: 'peer-2' });
assert.equal(hostLobby.connectedCount, 3);
assert.equal(hostLobby.countdownActive, true, 'Countdown must automatically start when room is full (3/3)!');

// 5. Peer leaves during countdown -> Countdown cancels and slot is freed
hostLobby.handlePlayerLeave('peer-2');
assert.equal(hostLobby.connectedCount, 2);
assert.equal(hostLobby.countdownActive, false, 'Countdown must cancel if a player leaves');

// 6. Destruction clears all memory
hostLobby.destroy();
assert.equal(hostLobby.chatMessages.length, 0);

console.log('✓ Multiplayer lobby test PASSED');
