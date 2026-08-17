// js/multiplayer/config.js — Multiplayer Configuration & Constants

export const MULTIPLAYER_SCENES = Object.freeze([
  'gallery',     // Level 1: The Lab (12,213 blocks)
  'manhattan',   // Level 2: Lower Manhattan (25,875 blocks)
  'brooklyn',    // Level 3: Brooklyn (39,984 blocks)
]);

// How each scene above presents itself on the host's CHOOSE METROPOLIS chips.
// The list and its copy live together so adding a fourth multiplayer city is one
// edit here rather than one here and three more in the markup.
export const MULTIPLAYER_SCENE_META = Object.freeze({
  gallery: Object.freeze({
    name: 'THE LAB',
    sub: 'Stage 1 · 12,213 Blocks · Warmup Grid',
    level: 'LEVEL 1',
  }),
  manhattan: Object.freeze({
    name: 'LOWER MANHATTAN',
    sub: 'Stage 2 · 25,875 Blocks · Financial Grid',
    level: 'LEVEL 2',
  }),
  brooklyn: Object.freeze({
    name: 'BROOKLYN',
    sub: 'Stage 3 · 39,984 Blocks · Waterfront Metropolis',
    level: 'LEVEL 3',
  }),
});

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DEFAULT_PLAYERS = 4;

// The lobby countdown, in the sim's own unit. COUNTDOWN_SECONDS is DERIVED so
// there is exactly one number to change: retuning the countdown by editing the
// seconds alone used to leave the tick count silently disagreeing with it.
export const COUNTDOWN_TICKS = 180; // 3.0s * 60 Hz
export const COUNTDOWN_SECONDS = COUNTDOWN_TICKS / 60;

// How long a joining peer waits for the room to answer with a ROOM_STATE before
// it tells the player the room does not exist. A mistyped 5-letter code matches
// no room at all, and nothing on the wire ever says so.
export const JOIN_TIMEOUT_MS = 8000;

// How long a peer tolerates hearing nothing from the host mid-match before it
// ends the match on its own terms. The host publishes a STATE_SYNC every fixed
// step, so 5 s is roughly 300 missed messages — far past any plausible hiccup,
// and short enough that a player whose host closed the tab is not stuck staring
// at a frozen city. Long enough that a backgrounded tab's throttling does not
// trip it on the host's side of a brief stall.
export const HOST_SILENCE_TIMEOUT_MS = 5000;
// How often the host proves it is still there when the render loop is NOT
// running. The loop is cancelled outright while a tab is hidden, so without this
// an alt-tabbed host would look identical to a closed one and every peer would
// end the match. Five heartbeats fit inside the silence window above, which is
// the margin that keeps a throttled background timer from tripping it.
export const HOST_HEARTBEAT_MS = 1000;
// How often the watchdog re-reads the clock. Cheap, and the granularity it adds
// to the timeout above is invisible.
export const HOST_SILENCE_POLL_MS = 250;

export const MATCH_DURATION_SECONDS = 180; // 3 minutes standard clock
export const PVP_RESPAWN_TIMEOUT_SECONDS = 10.0; // 10s pause penalty when eaten

// The display-name clamp. Lives here rather than in protocol.js because three
// layers need it: the wire validator, the lobby, and the name field the player
// types into. protocol.js re-exports it so existing importers are unaffected.
export const MAX_PLAYER_NAME_LENGTH = 16;

export const MAX_CHAT_MESSAGE_LENGTH = 140;
export const MAX_LOBBY_CHAT_HISTORY = 50;

// PRD 3.2: max 3 chat messages per second per client. Enforced outbound AND on
// receipt — a hostile client simply skips the outbound path.
export const MAX_CHAT_MESSAGES_PER_SECOND = 3;
export const CHAT_RATE_WINDOW_MS = 1000;

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
