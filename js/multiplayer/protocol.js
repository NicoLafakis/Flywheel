// js/multiplayer/protocol.js — Wire Protocol Codecs & Message Schemas

import { MAX_CHAT_MESSAGE_LENGTH, PVP_RESPAWN_TIMEOUT_SECONDS } from './config.js';

export const MSG_TYPES = Object.freeze({
  JOIN_REQUEST: 'JOIN_REQUEST',
  JOIN_ACCEPT: 'JOIN_ACCEPT',
  JOIN_REJECT: 'JOIN_REJECT',
  ROOM_STATE: 'ROOM_STATE',
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

export function createRoomState({ roomCode, scene, maxPlayers, matchSeed, players }) {
  return {
    type: MSG_TYPES.ROOM_STATE,
    roomCode: String(roomCode || '').toUpperCase(),
    scene: String(scene || 'gallery'),
    maxPlayers: Number(maxPlayers) || 4,
    matchSeed: Number(matchSeed) || 0,
    players: Array.isArray(players) ? players : [],
  };
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

export function createInputTick({ slot, tick, inputX = 0, inputZ = 0, boost = false }) {
  return {
    type: MSG_TYPES.INPUT_TICK,
    slot: Number(slot) || 0,
    tick: Number(tick) || 0,
    inputX: Number(inputX) || 0,
    inputZ: Number(inputZ) || 0,
    boost: Boolean(boost),
  };
}

export function createStateSync({ tick, holes = [], eatenDelta = [] }) {
  return {
    type: MSG_TYPES.STATE_SYNC,
    tick: Number(tick) || 0,
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
