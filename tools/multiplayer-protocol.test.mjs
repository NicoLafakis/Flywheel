// TDD Unit Test: Multiplayer Protocol & Codecs
import assert from 'node:assert/strict';
import {
  MSG_TYPES,
  encodeMessage,
  decodeMessage,
  createJoinRequest,
  createRoomState,
  createLobbyChat,
  createCountdownStart,
  createGameStart,
  createInputTick,
  createStateSync,
  createPvPKill,
  createGameOver,
} from '../js/multiplayer/protocol.js';

console.log('Testing multiplayer protocol & messages...');

// 1. Message Types enum exists
assert.ok(MSG_TYPES.JOIN_REQUEST);
assert.ok(MSG_TYPES.ROOM_STATE);
assert.ok(MSG_TYPES.LOBBY_CHAT);
assert.ok(MSG_TYPES.COUNTDOWN_START);
assert.ok(MSG_TYPES.GAME_START);
assert.ok(MSG_TYPES.INPUT_TICK);
assert.ok(MSG_TYPES.STATE_SYNC);
assert.ok(MSG_TYPES.PVP_KILL);
assert.ok(MSG_TYPES.GAME_OVER);

// 2. Chat message validation and encoding (Anti-persistence test)
const chat = createLobbyChat({
  slot: 1,
  name: 'TestPlayer',
  color: '#ff0054',
  text: '  Hello from The Lab!  ',
});
assert.equal(chat.type, MSG_TYPES.LOBBY_CHAT);
assert.equal(chat.slot, 1);
assert.equal(chat.name, 'TestPlayer');
assert.equal(chat.text, 'Hello from The Lab!', 'Text should be trimmed');
assert.ok(typeof chat.ts === 'number');

// Chat long string truncation
const longText = 'A'.repeat(200);
const truncatedChat = createLobbyChat({ slot: 0, name: 'Host', color: '#00f0ff', text: longText });
assert.equal(truncatedChat.text.length, 140, 'Chat text must be clamped to 140 characters');

// 3. Room state message
const roomState = createRoomState({
  roomCode: 'K7QM3',
  scene: 'gallery',
  maxPlayers: 4,
  matchSeed: 12345,
  players: [
    { slot: 0, name: 'Host', isHost: true, skin: 'default', color: '#00f0ff' },
    { slot: 1, name: 'Player2', isHost: false, skin: 'neon', color: '#ff0054' },
    null,
    null,
  ],
});
assert.equal(roomState.type, MSG_TYPES.ROOM_STATE);
assert.equal(roomState.scene, 'gallery');
assert.equal(roomState.maxPlayers, 4);

// 4. PvP kill message
const pvpKill = createPvPKill({
  killerSlot: 0,
  victimSlot: 1,
  awardMass: 500,
  respawnDelaySeconds: 10.0,
});
assert.equal(pvpKill.type, MSG_TYPES.PVP_KILL);
assert.equal(pvpKill.killerSlot, 0);
assert.equal(pvpKill.victimSlot, 1);
assert.equal(pvpKill.respawnDelaySeconds, 10.0);

// 5. Codec round-trip
const encoded = encodeMessage(pvpKill);
assert.ok(typeof encoded === 'string');
const decoded = decodeMessage(encoded);
assert.deepEqual(decoded, pvpKill);

console.log('✓ Multiplayer protocol test PASSED');
