// TDD Unit Test: Multiplayer Config & Constants
import assert from 'node:assert/strict';
import {
  MULTIPLAYER_SCENES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_PLAYERS,
  COUNTDOWN_SECONDS,
  COUNTDOWN_TICKS,
  PLAYER_PALETTES,
  MATCH_DURATION_SECONDS,
  PVP_RESPAWN_TIMEOUT_SECONDS,
  MAX_CHAT_MESSAGE_LENGTH,
} from '../js/multiplayer/config.js';

console.log('Testing multiplayer config & constants...');

// 1. Supported scenes check - starts with first 3 levels, first is 'gallery' (The Lab)
assert.equal(Array.isArray(MULTIPLAYER_SCENES), true);
assert.equal(MULTIPLAYER_SCENES[0], 'gallery', 'Level 1 must be The Lab (gallery)');
assert.equal(MULTIPLAYER_SCENES.includes('gallery'), true);
assert.equal(MULTIPLAYER_SCENES.includes('manhattan'), true);
assert.equal(MULTIPLAYER_SCENES.includes('brooklyn'), true);

// 2. Capacity bounds check (2 to 6 players)
assert.equal(MIN_PLAYERS, 2, 'Min players must be 2');
assert.equal(MAX_PLAYERS, 6, 'Max players must be 6 (Host + 5)');
assert.ok(DEFAULT_PLAYERS >= 2 && DEFAULT_PLAYERS <= 6);

// 3. Timing constants
assert.equal(COUNTDOWN_SECONDS, 3.0, 'Countdown must be 3.0 seconds');
assert.equal(COUNTDOWN_TICKS, 180, '3.0s at 60Hz is 180 ticks');
assert.equal(MATCH_DURATION_SECONDS, 180, 'Default match duration must be 180 seconds');
assert.equal(PVP_RESPAWN_TIMEOUT_SECONDS, 10.0, 'PvP respawn timeout must be 10.0 seconds');

// 4. Color palettes for up to 6 players
assert.equal(Array.isArray(PLAYER_PALETTES), true);
assert.ok(PLAYER_PALETTES.length >= 6, 'Must provide at least 6 distinct player palettes');

// 5. Chat message limits
assert.equal(MAX_CHAT_MESSAGE_LENGTH, 140, 'Chat messages capped at 140 chars');

console.log('✓ Multiplayer config test PASSED');
