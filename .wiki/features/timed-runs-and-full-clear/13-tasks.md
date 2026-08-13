# Timed Runs & Full Clear — task list

**Date:** 2026-08-13 · **Status:** in build

> [Objective overview](00-objective-overview.md) · [Requirements](02-requirements.md)

Ordered, independently verifiable. Each task names its requirement and a
**done when** that can be observed. Phase digits: 1xx the clock, 2xx the goal,
3xx scoring and the multiplier, 4xx the items this work surfaced and owns.

**One-writer rule.** T-1xx, T-2xx and T-3xx all write `js/voxelsim.js` and
`js/ui/screens.js`. They run as one implementation pass with a single owner, not
as parallel agents — this repo has already paid for that mistake once
(`STATUS.md`, Process notes).

---

## Phase 1 — the 3:00 clock (R-1)

- **T-101 — declare the limit once.** A single exported constant (180 s) with
  the campaign's existing `level.clock` path and the sandbox path both reading
  it. *Done when:* no scene, tier or platform holds its own copy, and grep finds
  exactly one definition.
- **T-102 — sandbox levels honour the clock.** Sandbox city runs currently end
  only on the goal; they now also end at zero. *Done when:* a headless run of any
  city ends deterministically at the tick corresponding to 180 s.
- **T-103 — the countdown is visible.** HUD clock on desktop and the phone
  layout, counting down, legible against a busy city. *Done when:* both layouts
  show it without overlapping the goal bar, SIZE, or the coin pill.
- **T-104 — endgame states.** Distinct treatment at 30 s and 10 s, using the
  audio layer's existing cue where one fits (R-1.5). *Done when:* both states
  fire once, at the right ticks, and reduced-motion is honoured.
- **T-105 — expiry lands on results.** Time-out is a normal ending carrying the
  percentage reached, score, best chain and coins. *Done when:* the results
  screen renders from a timed-out run with no error path taken.
- **T-106 — pause and visibility do not bleed time.** *Done when:* a paused or
  backgrounded run resumes with the clock where it was left.
- **T-107 — THE RUN is unaffected.** *Done when:* a ranked run still ends at
  exactly 5,400 ticks and never consults the 180 s constant.

## Phase 2 — the goal is the whole city (R-2)

- **T-201 — `SCENE_GOALS` to 1.0 everywhere.** `js/voxelsim.js:243-249`. *Done
  when:* every scene reports `targetFraction === 1`.
- **T-202 — sweep every consumer.** The goal bar and percentage
  (`js/ui/hud.js:196-197`), the milestone ladder and its phrase rows
  (`js/voxelsim.js:3132-3133`), the goal-mass computation (`:3284`), the
  completion bonus, the results screen, and per-scene saved records. *Done
  when:* no consumer holds a 0.5 assumption and each reads the table. **Sweep
  values DERIVED from 0.5, not only literal `0.5` text** — this repo's recorded
  failure mode is a stale derived constant that greps clean.
- **T-203 — back end and fixtures.** The ranked verifier, board views, stored
  fixtures and any published fraction agree on the denominator (R-2.3). *Done
  when:* client and server report the same percentage for the same run.
- **T-204 — validator win guards generalise.** The gallery-only guard
  (`tools/validate.mjs:1614-1631`) applies to every scene. *Done when:* the guard
  asserts at 1.0 for all seven and its failure message names the scene.
- **T-205 — copy review.** Goal names and any fraction-bearing strings match the
  rule that actually runs (R-2.6). *Done when:* no user-facing string promises a
  partial objective.
- **T-206 — `SPEC.md` non-goal wording.** Its "do not rank a 50% city clear"
  line predates this change; the intent (never rank free play) stands, the
  fraction does not. *Done when:* reworded without weakening the rule.

## Phase 3 — scoring and the multiplier (R-3, R-4)

Findings from the scoring audit land here as concrete tasks when it reports;
these are the ones already confirmed by inspection.

- **T-301 — readout inventory.** Enumerate every combo surface and record which
  quantity each renders: chain, level, or multiplier (R-4.1). *Done when:* the
  table exists in this package and every row cites file:line.
- **T-302 — honest labels.** Chain counts are labelled as chains; multipliers are
  labelled as multipliers and are capped with their label (R-4.2, R-4.3, R-4.4).
  *Done when:* `Best combo 530` no longer reads as a multiplier anywhere, and no
  displayed multiplier exceeds the ladder's true ceiling of 8x.
- **T-303 — paid equals shown.** The multiplier the sim applies and the one the
  HUD shows are identical at the same moment, arena surfaces included (R-4.5).
  *Done when:* a headless run asserts equality every tick.
- **T-304 — single-player accumulation.** One authoritative accumulator, every
  display reading from it (R-3.1). *Done when:* displayed score equals the summed
  consumption for a scripted run.
- **T-305 — arena convergence.** Peer display converges to host authority; no
  double-count or drop across a keyframe heal (R-3.2). *Done when:* a loopback
  match ends with both sides on the same number.
- **T-306 — verifier parity.** `api/_verify.mjs` returns the client's score for
  the same trace (R-3.3). *Done when:* a fixture trace scores bit-identically on
  both sides. **Release blocker.**
- **T-307 — order-independent sums.** Any order-dependent float accumulation is
  made order-independent or its bound is documented (R-3.4). *Done when:* a
  harness that consumes in several different orders agrees on the total —
  and the harness is proven against a deliberately broken build first, because a
  check that consumes in the same order as the code it audits passes on bugs.

## Phase 4 — items this work surfaced (owned, not parked)

Recorded under global rule 13: a finding raised is a finding owned.

- **T-401 — preserve the T-901 harness.** The 13-run Pixel-5 harness lives in a
  session-scoped scratchpad and will evaporate
  ([finding](../../findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md)
  §8). Move it into `tools/` as a re-runnable perf harness. *Done when:* one
  command reproduces the measurement on a clean checkout. **Blocks any re-measure
  of T-901, so it comes first in this phase.**
- **T-402 — the debris-drain defect.** The awake-debris population never drains,
  making per-step cost climb with elapsed route time. It is the shared root cause
  of the validator stall
  ([RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md))
  and of T-901's 4x shortfall. *Done when:* a sustained Cambridge run holds a
  bounded awake-debris population and the T-901 re-measure moves. **Changes sim
  output — state the `sim_version` implication and land it while the board holds
  one run and zero claimed names.**
- **T-403 — rebuild the audit system.** `tools/validate.mjs` is one serial run
  where a single 780 s excursion takes the whole suite down and everything behind
  it, including `validateChicago()`, never executes. Split into independently
  runnable per-scene probes with a fast default path; demote long deterministic
  excursions to an opt-in soak. *Done when:* the default suite runs in seconds
  and a stalling scene cannot block the others.
- **T-404 — map snapshot caching.** A Chicago build costs ~34 s on the throttled
  profile, paid before every RUN and again on every RUN AGAIN. Maps are
  deterministic and identical for every player, so this is a precomputed static
  asset plus a client-side cache — **not** per-user Supabase storage and not an
  accounts feature. *Done when:* a measurement proves hydrating a snapshot beats
  rebuilding, and cold-start-to-playable drops on the throttled profile. Measure
  before building: the win is real only if loading the blob costs less than the
  grid writes it replaces.
- **T-405 — wall-clock honesty.** "90 seconds" and now "3 minutes" are sim time.
  Even the *unthrottled* emulated phone finishes a 90 s ranked run in 100.5 s
  (0.896 sim/wall). Verification is unaffected (traces are tick-indexed), but the
  player-facing framing is not the player's time. *Done when:* the framing is
  either accurate or an explicit, documented product choice.
- **T-406 — Brooklyn has no ranked run to measure.** T-901's text asks for
  Chicago *and* Brooklyn; `RANKED_SCENES` is `['chicago']` and the only ranked
  entry point is hardcoded to Chicago, so half that gate is unmeasurable through
  the product. *Done when:* either the gate text is corrected to match ADR-0016's
  one-city-at-a-time rule, or Brooklyn is given its own ranked entry and gate.
