// js/multiplayer/protocol.js — Wire Protocol Codecs & Message Schemas

import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_PLAYERS,
  MAX_PLAYER_NAME_LENGTH,
  PVP_RESPAWN_TIMEOUT_SECONDS,
} from './config.js';

export const MSG_TYPES = Object.freeze({
  JOIN_REQUEST: 'JOIN_REQUEST',
  JOIN_ACCEPT: 'JOIN_ACCEPT',
  JOIN_REJECT: 'JOIN_REJECT',
  ROOM_STATE: 'ROOM_STATE',
  PLAYER_JOIN: 'PLAYER_JOIN',
  PLAYER_LEAVE: 'PLAYER_LEAVE',
  LOBBY_CHAT: 'LOBBY_CHAT',
  COUNTDOWN_START: 'COUNTDOWN_START',
  COUNTDOWN_CANCEL: 'COUNTDOWN_CANCEL',
  GAME_START: 'GAME_START',
  INPUT_TICK: 'INPUT_TICK',
  STATE_SYNC: 'STATE_SYNC',
  PVP_KILL: 'PVP_KILL',
  POWERUP_EVENT: 'POWERUP_EVENT',
  GAME_OVER: 'GAME_OVER',
});

// Re-exported from config.js, which is the single source (see the note there).
export { MAX_PLAYER_NAME_LENGTH };

/**
 * Message types only the authoritative host may originate. A peer that accepts
 * these from an arbitrary sender can be told the match is over, teleported, or
 * handed a forged roster by anyone who knows the room code.
 */
export const HOST_ONLY_TYPES = Object.freeze([
  MSG_TYPES.ROOM_STATE,
  MSG_TYPES.GAME_START,
  MSG_TYPES.GAME_OVER,
  MSG_TYPES.STATE_SYNC,
  MSG_TYPES.PVP_KILL,
  MSG_TYPES.COUNTDOWN_START,
  MSG_TYPES.COUNTDOWN_CANCEL,
  MSG_TYPES.JOIN_ACCEPT,
  MSG_TYPES.JOIN_REJECT,
  // The host is the only party that allocates a slot, so it is the only party
  // that may announce one was filled. A client able to forge PLAYER_JOIN could
  // seat itself, or a stranger, in any slot it liked.
  MSG_TYPES.PLAYER_JOIN,
]);

// PLAYER_LEAVE is DELIBERATELY NOT host-only.
//
// Two honest senders exist for it: the host, announcing an authoritative leave
// it detected through presence, and a client announcing its OWN graceful exit
// (which arrives before any presence timeout and is what makes "back out of a
// match" feel instant). Making it host-only would throw the second one away;
// leaving it unauthenticated would let anyone in the room evict anyone else.
// So the gate is ownership rather than role — see `isAuthorizedLeave`.

const MSG_TYPE_SET = new Set(Object.values(MSG_TYPES));
const HOST_ONLY_SET = new Set(HOST_ONLY_TYPES);

// Fields that name a player slot; each must index a real slot.
const SLOT_FIELDS = ['slot', 'killerSlot', 'victimSlot', 'winnerSlot'];
// Fields the receivers iterate; a non-array here throws or silently corrupts state.
const ARRAY_FIELDS = ['players', 'holes', 'eatenDelta', 'finalLeaderboard'];

export function isHostOnlyType(type) {
  return HOST_ONLY_SET.has(type);
}

/**
 * A message is "from the host" when its stamped senderId matches the recorded
 * host identity. When no host identity is known (local/dev channels that carry no
 * senderId at all) there is nothing to authenticate against, so the message passes.
 */
export function isFromHostSender(msg, hostSenderId) {
  if (hostSenderId === null || hostSenderId === undefined) return true;
  if (!msg || msg.senderId === null || msg.senderId === undefined) return false;
  return String(msg.senderId) === String(hostSenderId);
}

/**
 * May this PLAYER_LEAVE be acted on?
 *
 * Yes when the host sent it (the authoritative detection path), or when the
 * sender is announcing its own departure and nobody else's. Everything else is
 * one client trying to remove another from the match.
 */
export function isAuthorizedLeave(msg, hostSenderId) {
  if (!msg) return false;
  if (isFromHostSender(msg, hostSenderId)) return true;
  const from = msg.senderId;
  const leaver = msg.leaverSenderId;
  if (from === null || from === undefined || leaver === null || leaver === undefined) return false;
  return String(from) === String(leaver);
}

// Depth-limited: a message nests at most message -> array -> entry -> value.
function allNumbersFinite(value, depth = 0) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= 3 || value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!allNumbersFinite(entry, depth + 1)) return false;
    }
    return true;
  }
  for (const key of Object.keys(value)) {
    if (!allNumbersFinite(value[key], depth + 1)) return false;
  }
  return true;
}

/**
 * Single validation gate for everything arriving off the wire. Returns a sanitized
 * copy of the message, or `null` when the message is malformed or hostile — the
 * transport drops `null` before any listener sees it.
 *
 * Clamping is deliberately top-level only: nested roster/leaderboard entries are
 * echoed back verbatim so host and peer views of a match stay byte-identical, and
 * render safety for those is the escaping layer's job (`sanitize.js`).
 */
export function validateMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  if (typeof msg.type !== 'string' || !MSG_TYPE_SET.has(msg.type)) return null;

  for (const field of SLOT_FIELDS) {
    const v = msg[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= MAX_PLAYERS) return null;
  }

  for (const field of ARRAY_FIELDS) {
    const v = msg[field];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v)) return null;
  }

  if (msg.name !== undefined && msg.name !== null && typeof msg.name !== 'string') return null;
  if (msg.text !== undefined && msg.text !== null && typeof msg.text !== 'string') return null;

  // NaN/Infinity in a position or mass field poisons the simulation permanently.
  if (!allNumbersFinite(msg)) return null;

  const clean = { ...msg };
  if (typeof clean.name === 'string') clean.name = clean.name.slice(0, MAX_PLAYER_NAME_LENGTH);
  if (typeof clean.text === 'string') clean.text = clean.text.slice(0, MAX_CHAT_MESSAGE_LENGTH);
  return clean;
}

export function encodeMessage(msg) {
  return JSON.stringify(msg);
}

export function decodeMessage(raw) {
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createJoinRequest({ name, skin, clientVersion = 1 }) {
  return {
    type: MSG_TYPES.JOIN_REQUEST,
    name: String(name || 'Guest').slice(0, 16).trim(),
    skin: String(skin || 'default'),
    clientVersion,
  };
}

export function createRoomState({ roomCode, scene, maxPlayers, matchSeed, players, hostSenderId = null }) {
  const msg = {
    type: MSG_TYPES.ROOM_STATE,
    roomCode: String(roomCode || '').toUpperCase(),
    scene: String(scene || 'gallery'),
    maxPlayers: Number(maxPlayers) || 4,
    matchSeed: Number(matchSeed) || 0,
    players: Array.isArray(players) ? players : [],
  };
  // Declares which sender id peers should trust for host-only messages from here on.
  if (hostSenderId !== null && hostSenderId !== undefined) msg.hostSenderId = String(hostSenderId);
  return msg;
}

/**
 * A slot was filled. Host-originated (see HOST_ONLY_TYPES): the roster in
 * ROOM_STATE stays the full truth, and this is the incremental "who just walked
 * in" event the lobby and the match HUD announce from.
 */
export function createPlayerJoin({ slot = 0, joinerSenderId = null, name = 'Player', skin = 'default', color = '#ffffff' }) {
  const msg = {
    type: MSG_TYPES.PLAYER_JOIN,
    slot: Number(slot) || 0,
    name: String(name || 'Player').slice(0, MAX_PLAYER_NAME_LENGTH),
    skin: String(skin || 'default'),
    color: String(color || '#ffffff'),
  };
  // Named separately from `senderId`, which everywhere else means "who
  // originated this message" — here that is the host, not the joiner.
  if (joinerSenderId !== null && joinerSenderId !== undefined) msg.joinerSenderId = String(joinerSenderId);
  return msg;
}

/**
 * A slot emptied. `leaverSenderId` names WHO left, separately from the `senderId`
 * stamp that names who is telling us — the two are equal only for a client
 * announcing its own exit, which is exactly what `isAuthorizedLeave` keys on.
 */
export function createPlayerLeave({ slot = 0, leaverSenderId = null, name = 'Player', reason = 'DISCONNECTED' }) {
  const msg = {
    type: MSG_TYPES.PLAYER_LEAVE,
    slot: Number(slot) || 0,
    name: String(name || 'Player').slice(0, MAX_PLAYER_NAME_LENGTH),
    reason: String(reason || 'DISCONNECTED'),
  };
  if (leaverSenderId !== null && leaverSenderId !== undefined) msg.leaverSenderId = String(leaverSenderId);
  return msg;
}

export function createLobbyChat({ slot = 0, name = 'Player', color = '#ffffff', text = '' }) {
  const cleanText = String(text || '').trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
  return {
    type: MSG_TYPES.LOBBY_CHAT,
    id: Math.random().toString(36).slice(2, 8),
    slot: Number(slot) || 0,
    name: String(name || 'Player').slice(0, 16),
    color: String(color || '#ffffff'),
    text: cleanText,
    ts: Date.now(),
  };
}

export function createCountdownStart({ durationMs = 3000, serverStartTs = Date.now() }) {
  return {
    type: MSG_TYPES.COUNTDOWN_START,
    durationMs: Number(durationMs) || 3000,
    serverStartTs: Number(serverStartTs) || Date.now(),
  };
}

export function createCountdownCancel({ reason = 'PLAYER_LEFT' } = {}) {
  return {
    type: MSG_TYPES.COUNTDOWN_CANCEL,
    reason,
  };
}

export function createGameStart({ scene = 'gallery', matchSeed = 1, durationSeconds = 180 }) {
  return {
    type: MSG_TYPES.GAME_START,
    scene,
    matchSeed: Number(matchSeed) || 0,
    durationSeconds: Number(durationSeconds) || 180,
  };
}

export function createInputTick({ slot, tick, inputX = 0, inputZ = 0, boost = false, senderId = null }) {
  const msg = {
    type: MSG_TYPES.INPUT_TICK,
    slot: Number(slot) || 0,
    tick: Number(tick) || 0,
    inputX: Number(inputX) || 0,
    inputZ: Number(inputZ) || 0,
    boost: Boolean(boost),
  };
  // The host binds this to the roster so a sender can only steer its own slot.
  if (senderId !== null && senderId !== undefined) msg.senderId = String(senderId);
  return msg;
}

/**
 * The authoritative snapshot. Two fields here are the ONLY copy of their number
 * a peer is allowed to believe:
 *
 *   clockTicks     the match clock (T-635). Every client used to count its own
 *                  `step()` calls, so a device that could not sustain 60 steps a
 *                  second fell behind for good — measured at 38 s of drift over
 *                  a 180 s match, with the peer's HUD reading 0:38 at the moment
 *                  the host ended it. `tick` above is the host's STEP counter and
 *                  is deliberately not reused for this: chrono-freeze stops the
 *                  clock while the sim keeps stepping, so the two diverge.
 *   coinsCollected coins taken out of the shared pool by ANY player (T-636), so
 *                  every player watches the same finite pool drain.
 */
export function createStateSync({ tick, holes = [], eatenDelta = [], clockTicks = 0, coinsCollected = 0 }) {
  return {
    type: MSG_TYPES.STATE_SYNC,
    tick: Number(tick) || 0,
    clockTicks: Number(clockTicks) || 0,
    coinsCollected: Number(coinsCollected) || 0,
    holes,
    eatenDelta,
  };
}

export function createPvPKill({ killerSlot, victimSlot, awardMass = 0, respawnDelaySeconds = PVP_RESPAWN_TIMEOUT_SECONDS }) {
  return {
    type: MSG_TYPES.PVP_KILL,
    killerSlot: Number(killerSlot),
    victimSlot: Number(victimSlot),
    awardMass: Number(awardMass) || 0,
    respawnDelaySeconds: Number(respawnDelaySeconds) || PVP_RESPAWN_TIMEOUT_SECONDS,
  };
}

export function createGameOver({ reason = 'TIME_EXPIRED', winnerSlot = 0, finalLeaderboard = [] }) {
  return {
    type: MSG_TYPES.GAME_OVER,
    reason,
    winnerSlot: Number(winnerSlot) || 0,
    finalLeaderboard,
  };
}
