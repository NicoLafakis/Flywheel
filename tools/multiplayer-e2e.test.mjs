// TDD E2E Test: Full 6-Player Multiplayer Lifecycle on Level 1 (The Lab)
import assert from 'node:assert/strict';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';
import { MultiplayerLobby } from '../js/multiplayer/lobby.js';
import { MultiplayerHost } from '../js/multiplayer/host.js';
import { MultiplayerPeer } from '../js/multiplayer/peer.js';
import { loadScene } from '../js/voxelsim.js';

console.log('Testing full 6-player E2E lifecycle on Level 1 (The Lab)...');

await loadScene('gallery');

const hub = new InMemoryChannelHub();
const ROOM_CODE = 'LAB01';

// 1. Host creates 6-Player room on The Lab
const hostChannel = hub.createChannel(ROOM_CODE, 'host');
const hostLobby = new MultiplayerLobby({
  channel: hostChannel,
  isHost: true,
  playerName: 'HostPlayer',
  playerSkin: 'default',
  scene: 'gallery',
  maxPlayers: 6,
  roomCode: ROOM_CODE,
});

assert.equal(hostLobby.connectedCount, 1);
assert.equal(hostLobby.isFull, false);

// 2. 5 Peers join sequentially via invite link
const peers = [];
const peerNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Evan'];

for (let i = 0; i < 5; i++) {
  const pChannel = hub.createChannel(ROOM_CODE, `peer-${i + 1}`);
  const pLobby = new MultiplayerLobby({
    channel: pChannel,
    isHost: false,
    playerName: peerNames[i],
    playerSkin: 'nebula',
    roomCode: ROOM_CODE,
  });
  peers.push(pLobby);
}

assert.equal(hostLobby.connectedCount, 6, 'All 6 players must be connected');
assert.equal(hostLobby.isFull, true, 'Lobby must be full');

// Auto-start on a full room was removed 2026-08-17 by owner decision; a full
// room now waits for the host to press start (or for the non-hosts to vote
// unanimously once the host has gone idle). Contract:
// .wiki/modules/multiplayer.md "Start control".
assert.equal(hostLobby.countdownActive, false, 'a full 6/6 room must wait rather than start itself');
peers.forEach((p, i) => assert.equal(p.countdownActive, false,
  `peer ${i + 1} must not believe a countdown is running either`));

// 3. Ephemeral Chat verification during lobby
peers[0].sendChat('Hey everyone, good luck in The Lab!');
assert.equal(hostLobby.chatMessages.length, 1);
assert.equal(hostLobby.chatMessages[0].text, 'Hey everyone, good luck in The Lab!');

// 4. The host starts the match, and every peer follows it into the countdown.
//    Driven through the real entry point rather than jumping straight to
//    launchGame(): with the auto-start gone, the host press IS the path into a
//    match, so it is the path this E2E has to walk.
let matchStarted = false;
hostLobby.onGameStart = () => { matchStarted = true; };

hostLobby.startCountdown();
assert.equal(hostLobby.countdownActive, true, 'the host press must arm the countdown');
peers.forEach((p, i) => assert.equal(p.countdownActive, true,
  `peer ${i + 1} must receive the host's countdown broadcast`));

hostLobby.launchGame();

assert.equal(matchStarted, true);

// 5. Initialize active 6-player match session
const hostSession = new MultiplayerHost({
  channel: hostChannel,
  scene: 'gallery',
  matchSeed: hostLobby.matchSeed,
  players: hostLobby.players,
  durationSeconds: 180,
});

const peerSessions = peers.map((pLobby, idx) => new MultiplayerPeer({
  channel: pLobby.channel,
  scene: 'gallery',
  matchSeed: hostLobby.matchSeed,
  players: hostLobby.players,
  mySlot: idx + 1,
}));

assert.equal(hostSession.sim.holes.length, 6);

// Step simulation for 60 ticks (1 second)
for (let t = 0; t < 60; t++) {
  hostSession.step(1 / 60);
  peerSessions.forEach((p) => p.step(1 / 60));
}

// 6. Finish match & verify leaderboard
let gameOverData = null;
peerSessions[0].onGameOver = (data) => { gameOverData = data; };

hostSession.finishMatch('TIME_EXPIRED');

assert.ok(gameOverData !== null, 'Peers must receive game over summary');
assert.equal(gameOverData.finalLeaderboard.length, 6, 'Leaderboard must contain all 6 players');
assert.equal(gameOverData.finalLeaderboard[0].rank, 1, 'Top player must be Rank 1');

// Clean up
hostLobby.destroy();
peers.forEach((p) => p.destroy());
hostSession.destroy();
peerSessions.forEach((p) => p.destroy());

console.log('✓ Full 6-player E2E lifecycle test PASSED');
