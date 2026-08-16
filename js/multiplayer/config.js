// js/multiplayer/config.js — Multiplayer Configuration & Constants

export const MULTIPLAYER_SCENES = Object.freeze([
  'gallery',     // Level 1: The Lab (12,213 blocks)
  'manhattan',   // Level 2: Lower Manhattan (25,875 blocks)
  'brooklyn',    // Level 3: Brooklyn (39,984 blocks)
]);

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DEFAULT_PLAYERS = 4;

export const COUNTDOWN_SECONDS = 3.0;
export const COUNTDOWN_TICKS = 180; // 3.0s * 60 Hz

export const MATCH_DURATION_SECONDS = 180; // 3 minutes standard clock
export const PVP_RESPAWN_TIMEOUT_SECONDS = 10.0; // 10s pause penalty when eaten

export const MAX_CHAT_MESSAGE_LENGTH = 140;
export const MAX_LOBBY_CHAT_HISTORY = 50;

export const PLAYER_PALETTES = Object.freeze([
  '#00f0ff', // Slot 0: Cyan / Host
  '#ff0054', // Slot 1: Neon Crimson
  '#ffd23f', // Slot 2: Electric Amber
  '#06d6a0', // Slot 3: Emerald
  '#9d4edd', // Slot 4: Purple / Violet
  '#ff9f1c', // Slot 5: Bright Orange
]);

export const PLAYER_PALETTE_NAMES = Object.freeze([
  'Cyan',
  'Crimson',
  'Gold',
  'Emerald',
  'Purple',
  'Orange',
]);
