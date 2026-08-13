# Timed Runs & Full Clear — requirements

**Date:** 2026-08-13 · **Status:** accepted

> [Objective overview](00-objective-overview.md) · [Tasks](13-tasks.md)

Each requirement is observable. Where a requirement fixes a number, that number
is the single source of truth and every other surface derives from it.

## R-1 — The 3-minute clock

- **R-1.1** Every playable level carries a **180-second** limit. One declared
  constant governs it; no scene, tier, or platform may hold its own copy.
- **R-1.2** The clock is shown to the player throughout, counting down, legible
  on both desktop and the phone layout.
- **R-1.3** At zero the run ends immediately and deterministically and the player
  lands on the results screen. Expiry is a normal ending, not a failure state or
  an error path.
- **R-1.4** The clock is **sim time**, consistent with the existing fixed-tick
  model, so a slow device does not receive a shorter game. This is the same
  choice ADR-0016 already made for THE RUN, and it carries the same known
  consequence: on a device that cannot hold real time, 3:00 of game clock costs
  more than 3:00 of the player's time. That honesty gap is tracked in
  [13-tasks](13-tasks.md) T-405, not papered over here.
- **R-1.5** The last stretch is legible without a separate mechanic: the clock
  changes state at 30 s and again at 10 s (visual, and audible where the audio
  layer already has a cue). Genre convention — the endgame pressure is the point
  of the timer.
- **R-1.6** Pausing stops the clock. Backgrounding the tab already lands on
  PAUSED and must not bleed time.
- **R-1.7** THE RUN's 90-second bound is untouched. The ranked mode keeps its own
  server-seeded clock and does not inherit the 180 s level limit.

## R-2 — The goal is the whole city

- **R-2.1** `targetFraction` is **1.0** for every scene in `SCENE_GOALS`
  (`js/voxelsim.js`), not only the gallery.
- **R-2.2** Every consumer of `targetFraction` reports against the whole map:
  the HUD goal bar and its percentage, the milestone phrase ladder, the
  completion bonus, the results screen, and the per-scene saved records.
- **R-2.3** Back end included, as instructed: the ranked verifier, the board
  views, and any stored or published figure that expresses progress as a
  fraction must agree with the client on what the denominator is. No surface may
  keep a 0.5 assumption, in code, in fixtures, or in copy.
- **R-2.4** The validator's win guards must hold at 1.0 for every scene. The
  existing gallery guard already asserts `targetFraction === 1`; it stops being
  gallery-specific.
- **R-2.5** **Seam, deliberately left open:** 100% is a scoring ceiling, not a
  pass/fail win condition — the run ends on the clock and the player is scored on
  the percentage reached. Flipping 100% to a hard win condition must remain a
  single-constant change, so the decision stays reversible.
- **R-2.6** Copy that names a fraction ("clear 50%", "OPEN THE FINANCIAL
  DISTRICT" and its siblings if they imply a partial objective) is reviewed
  against the new target. A goal name may stay flavourful but must not promise a
  different completion rule than the one that runs.

## R-3 — Scores add up

- **R-3.1** The score the player sees equals the sum of what they consumed, by
  the declared rules, in single player. One authoritative accumulator; every
  display reads from it rather than recomputing.
- **R-3.2** In the arena, the peer's displayed score converges to the host's
  authoritative score. Per-slot attribution neither double-counts nor drops
  across a keyframe heal.
- **R-3.3** The server-side replay in `api/_verify.mjs` produces the **same**
  score as the client did for the same input trace. A divergence here publishes a
  number the player never saw and is a release blocker, not a rounding note.
- **R-3.4** Any float accumulation whose result depends on summation order is
  identified and made order-independent, or documented as bounded with the bound
  stated. Consumption order varies by design; the total must not.

## R-4 — The multiplier tells the truth

- **R-4.1** Every combo readout declares which quantity it renders: **chain
  count** (blocks in the window, unbounded), **level index** (1-8), or
  **multiplier** (1x-8x). No slot may show one while labelled as another.
- **R-4.2** A value presented as a multiplier never exceeds the declared cap. If
  the cap is 8x, nothing displays above 8x — and the same rule holds if the
  ladder is later retuned to any other ceiling.
- **R-4.3** No label reads `MAX` while the number beneath it continues to climb.
  Either the number is capped with the label, or the label is not `MAX`.
- **R-4.4** `Best combo` — on the results screen, in the RUN results, and in the
  v17 save — is labelled for what it actually stores. A stored chain is presented
  as a chain.
- **R-4.5** The value the sim *pays* and the value the HUD *shows* are the same
  number at the same moment. This was already the intent of the ADR-0015
  points-only ruling; R-4 extends it to every remaining surface, including the
  arena's rival callouts and tug-of-war bar.

## R-5 — Nothing regresses

- **R-5.1** Determinism, seeded randomness, the fixed timestep, the tier model
  and the placement invariants are unchanged.
- **R-5.2** No new runtime dependency and no root `package.json`.
- **R-5.3** Where a change alters sim output, the `sim_version` implication is
  stated explicitly and stored ranked traces are considered before landing.
- **R-5.4** Scene content, audio and menu styling are not touched except where a
  requirement above names them.
