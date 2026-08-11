// Rival-visibility tunables — THE one constants block (rival-visibility CC-5).
//
// Every tunable the package's surfaces read lives here, commented, so tuning
// is one file and a grep for a magic number has exactly one place to land.
// Pure data. No three.js, no DOM, no I/O.

export const RIVAL = Object.freeze({
  // --- crater tint (pattern 1) ----------------------------------------------
  // Opacity of the territory tiles over the ground. High enough that two
  // colors read at arm's length on a phone, low enough that the tint can
  // never make an un-eaten block look eaten (AC-01.7) — tiles sit on the
  // GROUND plane only, under columns that have already lost blocks.
  TINT_OPACITY: 0.5,
  // Tiles are inset a hair inside the block footprint so adjacent tiles read
  // as claimed ground rather than one undifferentiated slab.
  TINT_INSET: 0.94,
  // Height of the tint quads above the ground plane (ground sits at −0.02;
  // hole discs at 0.05). Between the two: over the ground, under the opening.
  TINT_Y: 0.012,

  // --- tug-of-war bar (pattern 2) -------------------------------------------
  // Segment widths quantise to this fraction. Coarseness is enforced by
  // showing NO digits during play (AC-02.5 — the exact number is the END
  // screen's payoff); the quant keeps the widths stable rather than jittering.
  BAR_QUANT: 0.01,

  // --- off-screen chevron (pattern 4) ---------------------------------------
  CHEVRON_INSET_PX: 26,     // how far the chevron sits inside the screen edge
  CHEVRON_MIN_PX: 16,       // chevron size at minimum rival mass…
  CHEVRON_MAX_PX: 34,       // …and at CHEVRON_MASS_FULL
  CHEVRON_MASS_FULL: 800,   // mass at which the chevron reaches full size
  // Hysteresis on the visibility boundary in NDC units: the chevron appears
  // only past this margin outside the frustum and hides as soon as the rival
  // is inside it, so it cannot flicker at the boundary (AC-04.3).
  CHEVRON_EDGE_EPS: 0.02,

  // --- milestone feed (pattern 5) -------------------------------------------
  // Lead-change hysteresis: the new leader must be ahead by this share of
  // consumed mass before "took the lead" fires, so a see-sawing scrap cannot
  // machine-gun the feed (AC-05.1).
  LEAD_HYSTERESIS: 0.08,
  // The timed "you're behind" beat fires once, at this many seconds left,
  // only if trailing by at least LEAD_HYSTERESIS.
  TRAILING_AT_S: 30,
  // Ceiling on lead-change beats per match — cadence stays 3–5 beats total.
  MAX_LEAD_BEATS: 3,
  // How long one callout holds the announcement channel.
  CALLOUT_MS: 2000,

  // --- end-of-match reveal (pattern 6) --------------------------------------
  // The pull-up target is the view's own full-city frame (view.fullHalfX/Y) —
  // the one moment the whole two-colored city is on screen, by design.
  REVEAL_MS: 2600,          // full reveal animation length; skippable by tap
  REVEAL_HOLD_MS: 600,      // beat of stillness before the winner line lands

  // --- seams left on purpose (patterns 3 and 7 — NOT built this pass) -------
  // Score popups (pattern 7) threshold: a popup fires only above this raw
  // block mass. Named now (AC-07.1's constant) so the popup task starts here.
  POPUP_MIN_RAW: 60,
});
