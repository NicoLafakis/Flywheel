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

// The SAME limit expressed in fixed ticks, which is what the sandbox actually
// counts. Ticks, not accumulated seconds: `time += 1/60` ten thousand times
// lands a few parts in 1e12 off 180.000, and a clock that expires on a float
// comparison is a clock whose expiry tick depends on rounding. Counting ticks
// makes expiry exact and identical on every device, which is the same choice
// ADR-0016 made for THE RUN — and the reason a slow phone gets the same game
// rather than a shorter one.
export const LEVEL_CLOCK_TICKS = LEVEL_CLOCK_SECONDS * 60;

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
