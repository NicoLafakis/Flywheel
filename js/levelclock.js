// The level clock. One declaration, read by every playable path.
//
// Pure data, no imports, so both halves of the game can read it without
// dragging a dependency across: the campaign (js/levels.js -> js/sim.js) and
// the sandbox (js/voxelsim.js) each import this file rather than each other.
// That separation is the whole reason this is its own module — js/voxelsim.js
// deliberately duplicates COMBO_WINDOW to stay clear of the sim.js -> citygen.js
// chain, and importing the campaign's level table for one number would undo it.
//
// 300 s (5 minutes) is the level duration for all sandbox cities and campaign levels.
// The clock is what turns an open-ended demolition into a run with a score.
export const LEVEL_CLOCK_SECONDS = 300;
export const LEVEL_CLOCK_TICKS = LEVEL_CLOCK_SECONDS * 60;

// 180 s (3 minutes) is the duration for City Challenges (2x coin reward).
export const CHALLENGE_CLOCK_SECONDS = 180;
export const CHALLENGE_CLOCK_TICKS = CHALLENGE_CLOCK_SECONDS * 60; // 10,800 ticks

// 90 s is the secret challenge unlocked when all 3-minute city challenges are completed.
export const SECRET_CHALLENGE_CLOCK_SECONDS = 90;
export const SECRET_CHALLENGE_CLOCK_TICKS = SECRET_CHALLENGE_CLOCK_SECONDS * 60; // 5,400 ticks

// The two endgame states (R-1.5). Declared here, not in the HUD, because the
// sim fires the transition events at these exact ticks and the HUD styles the
// pill from the same numbers — a second copy in css or a hand-typed `<= 30` in
// the HUD is how the readout and the cue come to disagree about when the
// endgame started.
export const LEVEL_CLOCK_WARN_SECONDS = 30;
export const LEVEL_CLOCK_URGENT_SECONDS = 10;

/** `seconds` as m:ss, the shape the countdown pill renders. */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
