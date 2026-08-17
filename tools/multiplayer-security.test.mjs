// TDD Security Test: Multiplayer hardening (T-610 XSS, T-611 colour validation,
// T-612 protocol validation, T-613 sender/slot binding, T-614 chat rate limit)
//
// Runs headless: every assertion targets a pure helper or a pure-JS session object.
// There is no jsdom in this project (no package.json, no node_modules), so the XSS
// work is proven against the escaping/colour helpers plus a source-level assertion
// that ui.js no longer interpolates untrusted values into innerHTML.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';
import { MultiplayerLobby } from '../js/multiplayer/lobby.js';
import { MultiplayerHost } from '../js/multiplayer/host.js';
import { MultiplayerPeer } from '../js/multiplayer/peer.js';
import * as protocol from '../js/multiplayer/protocol.js';
import { MAX_PLAYERS, MAX_CHAT_MESSAGE_LENGTH, PLAYER_PALETTES } from '../js/multiplayer/config.js';
import { loadScene } from '../js/voxelsim.js';

console.log('Testing multiplayer security hardening (T-610 .. T-614)...');

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log('  ok: ' + label);
  } catch (err) {
    failures++;
    const first = String(err && err.message ? err.message : err).split('\n')[0];
    console.error('  FAIL: ' + label + '\n        ' + first);
  }
}

// sanitize.js is expected to be a new pure module (no DOM, no three.js) so a Node
// test can assert on its string output directly.
let sanitize = null;
let sanitizeImportError = null;
try {
  sanitize = await import('../js/multiplayer/sanitize.js');
} catch (err) {
  sanitizeImportError = err;
}

const XSS = '<img src=x onerror=alert(1)>';
const { MSG_TYPES } = protocol;

// ---------------------------------------------------------------------------
// T-610 — Untrusted text must never be rendered as HTML
// ---------------------------------------------------------------------------
console.log('\n--- T-610: untrusted text is never rendered as HTML ---');

check('js/multiplayer/sanitize.js exists and exports escapeHtml', () => {
  assert.ok(sanitize, 'import failed: ' + (sanitizeImportError && sanitizeImportError.message));
  assert.equal(typeof sanitize.escapeHtml, 'function', 'escapeHtml must be exported');
});

check('escapeHtml renders an <img onerror> payload as literal text (zero img elements)', () => {
  const out = sanitize.escapeHtml(XSS);
  assert.equal(/<\s*img/i.test(out), false, 'escaped output must not contain an <img tag');
  assert.equal(out.includes('<'), false, 'escaped output must contain no raw "<"');
  assert.equal(out.includes('>'), false, 'escaped output must contain no raw ">"');
  assert.ok(out.includes('&lt;img'), 'the payload must survive as visible literal text');
  assert.ok(out.includes('onerror=alert(1)'), 'the payload text itself is preserved for display');
});

check('escapeHtml neutralises quotes and ampersands (attribute-context safe)', () => {
  assert.equal(sanitize.escapeHtml('a & b'), 'a &amp; b');
  assert.equal(sanitize.escapeHtml('" onload="x'), '&quot; onload=&quot;x');
  assert.equal(sanitize.escapeHtml("' onload='x"), '&#39; onload=&#39;x');
  assert.equal(sanitize.escapeHtml('</script>'), '&lt;/script&gt;');
});

check('escapeHtml coerces non-strings without throwing', () => {
  assert.equal(sanitize.escapeHtml(null), '');
  assert.equal(sanitize.escapeHtml(undefined), '');
  assert.equal(sanitize.escapeHtml(42), '42');
});

check('ui.js no longer interpolates untrusted name/text/colour into innerHTML', () => {
  const uiSrc = readFileSync(new URL('../js/multiplayer/ui.js', import.meta.url), 'utf8');
  const forbidden = [
    '${p.name}',
    '${msg.name}',
    '${msg.text}',
    '${winner.name',
    '${msg.color',
    '${p.color',
    'style="background: ${color}"',
    'style="--p-color: ${color}"',
  ];
  for (const token of forbidden) {
    assert.equal(uiSrc.includes(token), false, `ui.js must not raw-interpolate ${token}`);
  }
  assert.ok(/from\s+'\.\/sanitize\.js'/.test(uiSrc), 'ui.js must route untrusted values through sanitize.js');
});

check('ui.js keeps the existing CSS contract (class names unchanged)', () => {
  const uiSrc = readFileSync(new URL('../js/multiplayer/ui.js', import.meta.url), 'utf8');
  for (const cls of [
    'mp-chat-msg', 'mp-chat-author', 'mp-chat-body', 'mp-chat-sys-text',
    'mp-roster-card', 'mp-player-avatar', 'mp-player-meta', 'mp-player-name',
    'mp-player-tag', 'mp-player-dot', 'mp-podium-card', 'mp-row-color',
    'mp-winner-title', 'mp-you-badge',
  ]) {
    assert.ok(uiSrc.includes(cls), `class ${cls} must still be emitted so css/multiplayer.css applies`);
  }
});

// ---------------------------------------------------------------------------
// T-611 — Colour values must be validated before reaching a style attribute
// ---------------------------------------------------------------------------
console.log('\n--- T-611: wire colours are validated before hitting a style attribute ---');

check('safeColor is exported', () => {
  assert.ok(sanitize, 'sanitize.js did not import');
  assert.equal(typeof sanitize.safeColor, 'function', 'safeColor must be exported');
});

check('a CSS-injection colour is rejected and the slot palette is returned', () => {
  assert.equal(sanitize.safeColor('red;background:url(x)', 1), PLAYER_PALETTES[1]);
  assert.equal(sanitize.safeColor('javascript:alert(1)', 3), PLAYER_PALETTES[3]);
  assert.equal(sanitize.safeColor('#fff" onload="alert(1)', 2), PLAYER_PALETTES[2]);
  assert.equal(sanitize.safeColor('expression(alert(1))', 0), PLAYER_PALETTES[0]);
});

check('valid #RGB / #RRGGBB values pass through (case-insensitive)', () => {
  assert.equal(sanitize.safeColor('#0f0', 1), '#0f0');
  assert.equal(sanitize.safeColor('#00F0FF', 1), '#00F0FF');
  assert.equal(sanitize.safeColor('#ff0054', 2), '#ff0054');
});

check('an invalid colour with no valid slot falls back to #ffffff', () => {
  assert.equal(sanitize.safeColor('red', null), '#ffffff');
  assert.equal(sanitize.safeColor(undefined, undefined), '#ffffff');
  assert.equal(sanitize.safeColor('#12', 99), '#ffffff');
  assert.equal(sanitize.safeColor({}, -1), '#ffffff');
});

// ---------------------------------------------------------------------------
// T-612 — Validate every inbound message at the protocol boundary
// ---------------------------------------------------------------------------
console.log('\n--- T-612: inbound messages are validated at the protocol boundary ---');

check('validateMessage is exported from protocol.js', () => {
  assert.equal(typeof protocol.validateMessage, 'function', 'protocol.js must export validateMessage');
});

check('unknown / missing message types are rejected', () => {
  assert.equal(protocol.validateMessage({ type: 'EVIL_TYPE' }), null);
  assert.equal(protocol.validateMessage({ type: '__proto__' }), null);
  assert.equal(protocol.validateMessage({}), null);
  assert.equal(protocol.validateMessage(null), null);
  assert.equal(protocol.validateMessage('LOBBY_CHAT'), null);
});

check('a well-formed message survives validation', () => {
  const tick = protocol.createInputTick({ slot: 2, tick: 9, inputX: 0.5, inputZ: -0.25, boost: true, senderId: 'peer-2' });
  const okMsg = protocol.validateMessage(tick);
  assert.ok(okMsg, 'a valid INPUT_TICK must not be dropped');
  assert.equal(okMsg.slot, 2);
  assert.equal(okMsg.inputX, 0.5);
});

check('out-of-range / non-integer slot fields are rejected', () => {
  const base = { type: MSG_TYPES.INPUT_TICK, tick: 1, inputX: 0, inputZ: 0, boost: false };
  assert.equal(protocol.validateMessage({ ...base, slot: MAX_PLAYERS }), null, 'slot === MAX_PLAYERS is out of range');
  assert.equal(protocol.validateMessage({ ...base, slot: 99 }), null);
  assert.equal(protocol.validateMessage({ ...base, slot: -1 }), null);
  assert.equal(protocol.validateMessage({ ...base, slot: 1.5 }), null);
  assert.equal(protocol.validateMessage({ ...base, slot: '1' }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.PVP_KILL, killerSlot: 0, victimSlot: 42 }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.PVP_KILL, killerSlot: -3, victimSlot: 1 }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.GAME_OVER, winnerSlot: 7, finalLeaderboard: [] }), null);
});

check('non-finite numbers (NaN / Infinity) are rejected', () => {
  const base = { type: MSG_TYPES.INPUT_TICK, slot: 0, tick: 1, inputZ: 0, boost: false };
  assert.equal(protocol.validateMessage({ ...base, inputX: NaN }), null);
  assert.equal(protocol.validateMessage({ ...base, inputX: Infinity }), null);
  assert.equal(protocol.validateMessage({ ...base, inputX: -Infinity }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.STATE_SYNC, tick: 1, holes: [{ slot: 0, x: NaN, z: 0 }] }), null);
});

check('array-shaped payload fields must actually be arrays', () => {
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.ROOM_STATE, players: 'nope' }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.ROOM_STATE, players: { length: 9e9 } }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.STATE_SYNC, tick: 1, holes: 'nope' }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.STATE_SYNC, tick: 1, holes: [], eatenDelta: 3 }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.GAME_OVER, winnerSlot: 0, finalLeaderboard: 'nope' }), null);
});

check('name is clamped to 16 chars and text to MAX_CHAT_MESSAGE_LENGTH', () => {
  const joined = protocol.validateMessage({
    type: MSG_TYPES.JOIN_REQUEST,
    name: 'N'.repeat(64),
    skin: 'default',
    senderId: 'peer-9',
  });
  assert.ok(joined, 'a long name is clamped, not dropped');
  assert.equal(joined.name.length, 16, 'name must clamp to 16 characters');

  const chat = protocol.validateMessage({
    type: MSG_TYPES.LOBBY_CHAT,
    slot: 1,
    name: 'A'.repeat(40),
    color: '#ff0054',
    text: 'T'.repeat(400),
    ts: Date.now(),
  });
  assert.ok(chat, 'a long chat body is clamped, not dropped');
  assert.equal(chat.name.length, 16);
  assert.equal(chat.text.length, MAX_CHAT_MESSAGE_LENGTH);
  assert.equal(MAX_CHAT_MESSAGE_LENGTH, 140);
});

check('non-string name / text are rejected', () => {
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.JOIN_REQUEST, name: { toString: 1 } }), null);
  assert.equal(protocol.validateMessage({ type: MSG_TYPES.LOBBY_CHAT, slot: 0, text: ['a'] }), null);
});

check('MultiplayerChannel._dispatch drops malformed messages before any listener', () => {
  const hub = new InMemoryChannelHub();
  const ch = hub.createChannel('SECV', 'sender-a');
  const seen = [];
  ch.onMessage((m) => seen.push(m));

  ch.broadcast({ type: 'EVIL_TYPE', text: XSS });
  assert.equal(seen.length, 0, 'unknown type must never reach a listener');

  ch.broadcast({ type: MSG_TYPES.INPUT_TICK, slot: 99, tick: 1, inputX: 0, inputZ: 0 });
  assert.equal(seen.length, 0, 'out-of-range slot must never reach a listener');

  ch.broadcast(protocol.createInputTick({ slot: 0, tick: 1, senderId: 'sender-a' }));
  assert.equal(seen.length, 1, 'a valid message must still be delivered');
  ch.close();
});

// ---------------------------------------------------------------------------
// T-613 — Bind sender identity to slot; reject spoofed host messages
// ---------------------------------------------------------------------------
console.log('\n--- T-613: sender identity is bound to slot; host messages are authenticated ---');

await loadScene('gallery');

const secHub = new InMemoryChannelHub();
const hostCh = secHub.createChannel('SECH', 'host');
const peer1Ch = secHub.createChannel('SECH', 'peer-1');
const peer2Ch = secHub.createChannel('SECH', 'peer-2');
const attackerCh = secHub.createChannel('SECH', 'attacker');

const secPlayers = [
  { slot: 0, senderId: 'host', name: 'Host', skin: 'default', color: '#00f0ff', isHost: true },
  { slot: 1, senderId: 'peer-1', name: 'Alice', skin: 'default', color: '#ff0054', isHost: false },
  { slot: 2, senderId: 'peer-2', name: 'Mallory', skin: 'default', color: '#ffd23f', isHost: false },
];

const secHost = new MultiplayerHost({
  channel: hostCh,
  scene: 'gallery',
  matchSeed: 7,
  players: secPlayers,
});

check('createInputTick carries the sender id', () => {
  const t = protocol.createInputTick({ slot: 1, tick: 1, senderId: 'peer-1' });
  assert.equal(t.senderId, 'peer-1', 'INPUT_TICK must carry senderId so the host can bind it to a slot');
});

check('an INPUT_TICK for slot 1 sent by the owner of slot 2 does not move slot 1', () => {
  secHost.pendingInputs[1] = null;
  peer2Ch.broadcast(protocol.createInputTick({
    slot: 1, tick: 1, inputX: 1, inputZ: 1, boost: true, senderId: 'peer-2',
  }));
  assert.equal(secHost.pendingInputs[1], null, 'a spoofed INPUT_TICK must be dropped by the host');
});

check('an INPUT_TICK from the slot owner is accepted', () => {
  secHost.pendingInputs[1] = null;
  peer1Ch.broadcast(protocol.createInputTick({
    slot: 1, tick: 2, inputX: 0.75, inputZ: 0, boost: false, senderId: 'peer-1',
  }));
  assert.ok(secHost.pendingInputs[1], 'the legitimate owner of slot 1 must still be able to steer');
  assert.equal(secHost.pendingInputs[1].x, 0.75);
});

check('an INPUT_TICK from an unknown sender is dropped entirely', () => {
  secHost.pendingInputs[2] = null;
  attackerCh.broadcast(protocol.createInputTick({
    slot: 2, tick: 3, inputX: -1, inputZ: 0, senderId: 'attacker',
  }));
  assert.equal(secHost.pendingInputs[2], null, 'a sender with no slot binding must be ignored');
});

const secPeer = new MultiplayerPeer({
  channel: peer1Ch,
  scene: 'gallery',
  matchSeed: 7,
  players: secPlayers,
  mySlot: 1,
});

check('MultiplayerPeer.sendInput populates senderId from the channel', () => {
  secHost.pendingInputs[1] = null;
  secPeer.sendInput({ x: 0.25, z: -0.5 }, false);
  assert.ok(secHost.pendingInputs[1], 'peer.sendInput must stamp its channel senderId or the host drops it');
  assert.equal(secHost.pendingInputs[1].x, 0.25);
});

check('a peer ignores a GAME_OVER that did not come from the host senderId', () => {
  let received = null;
  secPeer.onGameOver = (m) => { received = m; };
  attackerCh.broadcast(protocol.createGameOver({ reason: 'TIME_EXPIRED', winnerSlot: 2, finalLeaderboard: [] }));
  assert.equal(received, null, 'a spoofed GAME_OVER must be ignored');
  assert.equal(secPeer.over, false, 'a spoofed GAME_OVER must not end the match');
});

check('a peer ignores a STATE_SYNC that did not come from the host senderId', () => {
  let synced = null;
  secPeer.onStateSync = (m) => { synced = m; };
  attackerCh.broadcast(protocol.createStateSync({
    tick: 1,
    holes: [{ slot: 0, x: 9999, z: 9999, radius: 99, mass: 1e9 }],
  }));
  assert.equal(synced, null, 'a spoofed STATE_SYNC must be ignored');
  assert.notEqual(secPeer.sim.holes[0].x, 9999, 'a spoofed STATE_SYNC must not teleport a rival hole');
});

check('a peer accepts a GAME_OVER from the real host', () => {
  let received = null;
  secPeer.onGameOver = (m) => { received = m; };
  hostCh.broadcast(protocol.createGameOver({ reason: 'TIME_EXPIRED', winnerSlot: 0, finalLeaderboard: [] }));
  assert.ok(received, 'the genuine host must still be able to end the match');
  assert.equal(secPeer.over, true);
});

check('a peer lobby latches the host senderId broadcast in ROOM_STATE', () => {
  const lobbyHub = new InMemoryChannelHub();
  const lHostCh = lobbyHub.createChannel('SECR', 'host');
  const lPeerCh = lobbyHub.createChannel('SECR', 'peer-a');
  const lAttackCh = lobbyHub.createChannel('SECR', 'attacker');

  const hostLobby = new MultiplayerLobby({
    channel: lHostCh, isHost: true, playerName: 'Host', scene: 'gallery', maxPlayers: 4, roomCode: 'SECR',
  });
  const peerLobby = new MultiplayerLobby({
    channel: lPeerCh, isHost: false, playerName: 'Alice', roomCode: 'SECR',
  });

  assert.ok(peerLobby.hostSenderId, 'the peer must latch a host senderId from ROOM_STATE');
  assert.equal(peerLobby.hostSenderId, 'host');

  let started = null;
  peerLobby.onGameStart = (m) => { started = m; };
  lAttackCh.broadcast(protocol.createGameStart({ scene: 'brooklyn', matchSeed: 1, durationSeconds: 180 }));
  assert.equal(started, null, 'a spoofed GAME_START must not launch the match');

  lHostCh.broadcast(protocol.createGameStart({ scene: 'gallery', matchSeed: 5, durationSeconds: 180 }));
  assert.ok(started, 'the genuine host must still be able to launch the match');

  hostLobby.destroy();
  peerLobby.destroy();
});

// ---------------------------------------------------------------------------
// T-614 — Chat rate limit (PRD 3.2: max 3 messages per second per client)
// ---------------------------------------------------------------------------
console.log('\n--- T-614: chat is rate limited to 3 messages per second per client ---');

check('the 4th outbound chat message inside one second is dropped', () => {
  const hub = new InMemoryChannelHub();
  const ch = hub.createChannel('SECC', 'host');
  const lobby = new MultiplayerLobby({
    channel: ch, isHost: true, playerName: 'Host', scene: 'gallery', maxPlayers: 4, roomCode: 'SECC',
  });
  for (let i = 0; i < 4; i++) lobby.sendChat('flood ' + i);
  assert.equal(lobby.chatMessages.length, 3, 'outbound chat must cap at 3 messages per second');
  lobby.destroy();
});

check('inbound chat from a hostile client is dropped past 3 per second', () => {
  const hub = new InMemoryChannelHub();
  const hCh = hub.createChannel('SECD', 'host');
  const floodCh = hub.createChannel('SECD', 'flooder');
  const lobby = new MultiplayerLobby({
    channel: hCh, isHost: true, playerName: 'Host', scene: 'gallery', maxPlayers: 4, roomCode: 'SECD',
  });
  for (let i = 0; i < 6; i++) {
    floodCh.broadcast({
      type: MSG_TYPES.LOBBY_CHAT,
      id: 'f' + i,
      slot: 1,
      name: 'Flooder',
      color: '#ff0054',
      text: 'spam ' + i,
      ts: Date.now(),
      senderId: 'flooder',
    });
  }
  assert.equal(lobby.chatMessages.length, 3, 'a hostile client must not bypass the limit by hand-building messages');
  lobby.destroy();
});

secPeer.destroy();
secHost.destroy();
hostCh.close();
peer1Ch.close();
peer2Ch.close();
attackerCh.close();

if (failures > 0) {
  console.error(`\nFAIL — ${failures} multiplayer security assertion(s) failed.`);
  throw new Error(`${failures} multiplayer security assertion(s) failed`);
}

console.log('\n✓ Multiplayer security hardening test PASSED');
