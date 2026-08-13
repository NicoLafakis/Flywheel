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

Every task below is anchored to a **CONFIRMED** finding in
[RCA-2026-08-13-scoring-and-combo-audit](../../findings/RCA-2026-08-13-scoring-and-combo-audit.md),
with its numbers. Two findings that turned out to be clean are recorded at the
bottom so nobody re-walks them.

### Ranked score integrity — release blockers

- **T-301 — `perfMode` must not survive into a ranked run** (audit A5.1).
  `js/voxelsim.js:2579` reads `tune.perfMode` as a contact-rounds override;
  `RANKED_TUNE` has no such key, so `Object.assign` cannot clear it and a player
  with SETTINGS → "Smoother play" ON runs different physics than the server.
  Measured on one identical trace: client **2247.9250**, server **2231.9625**.
  *Done when:* the ranked tune is a complete physics description — every lever the
  sim reads is pinned by it, proven by a test that sets every settings key to a
  hostile value and still reproduces the server's score. **Release blocker.**
- **T-302 — freeze the physics for the duration of a ranked run** (audit A5.2).
  Pause is reachable during a RUN and the pause screen offers SETTINGS; every
  toggle calls `applySettings()` → `startQuality()` + `applyVoxTuning()`
  (`js/main.js:258-259`), neither of which has a `run90` guard. Measured swings
  against the 2231.9625 baseline: `supportEvery = 2` (the ordinary LOW-tier phone
  value) → **945.95, a 58% loss**; a realistic mid-run LOW-tier apply at t=30 s →
  1853.80; a persisted `gravity = 100` from the ADVANCED sliders → 4438.43.
  Note the sign on the common phone case: **the player is robbed, not favoured.**
  *Done when:* no settings path can write `sim.tune` or the quality levers while
  `mode === 'run90'`, proven by driving every control on the pause SETTINGS screen
  mid-run and reproducing the baseline score exactly. **Release blocker.**
- **T-303 — the server must compare the two numbers** (audit A5.3).
  `api/_verify.mjs:42-51` computes a score and returns `verified` without ever
  reading `run.claimed_score`, and there is no `mismatch` reason for a score
  disagreement. Both numbers are already in the same row. *Done when:* a
  divergence beyond a stated tolerance produces an explicit verdict and is
  observable, rather than being silently overwritten.
- **T-304 — `placementGate` trusts a client number** (audit A5.5).
  `api/run/submit.mjs:18-21,74` decides whether to replay a run at all by
  comparing the **client-supplied** `claimed_score` against 25th place, so a run
  that under-reports is marked `unranked` without ever being verified. *Done
  when:* the gate cannot be driven by an unverified client value, or the
  trust boundary is documented as deliberate with its consequence stated.

### Multiplayer currency

- **T-305 — the arena must judge and print the same currency** (audit A6.4).
  `js/demo/arena.js:680` picks the winner on `finalSplit().mass`, which is **raw,
  un-multiplied** mass (`js/rival/attribution.js:55-56`), while `:683` prints
  `Math.floor(hole.mass)`, the **combo-multiplied** score. The reveal can read
  "YOU 3,400 PTS / RIVAL 1,900 PTS" above "RIVAL TAKES THE CITY". The code comment
  at `:645-649` shows this was a deliberate flavour choice; it is still two
  contradictory verdicts in one frame and is the strongest candidate for the
  owner's "scores not adding up in multiplayer". *Done when:* one currency decides
  and is displayed, or the two are visually separated so neither reads as the
  other's total. **Owner-visible behaviour change — say which currency won.**
- **T-306 — the live HUD and the tug bar disagree the same way** (audit A6.5).
  `js/demo/arena.js:740-741` prints combo-multiplied points while the bar
  underneath (`:417-418`) shows raw-mass shares, so they move at different rates
  and can point opposite ways during a hot chain. *Done when:* consistent with
  T-305's ruling.
- **T-307 — the peer's wire score has a hard clamp at 16383.75** (audit A6.1).
  A 180 s scripted Chicago route already reaches 7,425 points — 45% of the cap —
  so this is a real ceiling in the same order of magnitude as live values, not a
  theoretical one. *Done when:* the clamp is raised or the quantisation is
  rescaled, with the new headroom stated against a measured route.
- **T-308 — attribution can drop credit under host migration** (audit A6.3,
  SUSPECTED). A successor's keyframe would mark a slice of the city eaten with no
  owner, and the tug bar and end reveal would silently renormalise over the
  remainder. Not reachable today (no migration path in `js/demo/arena.js`), so
  this rides with **T-606** host migration rather than shipping now — recorded so
  migration does not land on top of it unknowingly.

### The multiplier tells the truth

- **T-309 — fix the two readouts that print a chain with an `x`** (audit B2 #4,
  #7). `js/ui/screens.js:501` prints `` `Best combo x${bestCombo}` `` on the
  campaign results screen — and the campaign ladder caps at **3.0**
  (`js/sim.js:9-12`), so `x47` overstates the real multiplier by 15.7x.
  `js/ui/hud.js:177-182` prints `` `COMBO x${chain}` `` on the campaign HUD. This
  is the exact defect ADR-0015 closed for the sandbox HUD, still live on the
  campaign path. *Done when:* neither surface puts an `x` in front of a chain.
- **T-310 — label the chain counts as chains** (audit B2 #1, #5, #6).
  The RUN results line the owner read as 530x (`js/ui/screens.js:329`), the
  sandbox equivalent (`:304,310`), and the unlabelled big number on the HUD combo
  ring (`js/ui/hud.js:259-262`) — which is the visually dominant readout at
  18-26px against the honest multiplier's 10-13px. *Done when:* every one states
  its unit, and the number a player calls "my combo" cannot be read as a
  multiplier.
- **T-311 — `MAX` must not sit over a climbing number** (audit B3).
  `h.chain` has no ceiling, so the ring shows `600 / MAX` and later `900 / MAX`.
  Also: the multiplier ladder displays `x1..x7, MAX`, so the number **8 is never
  shown** and a player counting the steps concludes the top is 7. This is the most
  likely origin of the owner's "it maxes out at 100x" belief. *Done when:* the cap
  is legible as a number and nothing climbs past a label that says it stopped.
- **T-312 — replace the tautological validator assertion** (audit B5).
  `tools/validate.mjs:1556-1562` compares `comboMult(c)` against
  `1 + (comboLevel(c) - 1) * COMBO_STEP` — which is `comboMult`'s entire body
  inlined — so it passes on any code, including broken code, over all 1,000
  iterations. The narrow source-text guard at `:1587-1594` inspects only
  `js/ui/hud.js` and would catch neither T-309 site. *Done when:* the assertion
  compares against an independent expectation (a literal table), the guard covers
  every readout named in the audit's B2 inventory, and **both are proven by
  running them against a deliberately broken build first.**

### Checked and clean — do not re-audit

- **The single-player accumulator is exact** (audit A1). `hole.mass` equals the
  sum of every award bit-for-bit; reordering the summands moves it by ~1e-12,
  and `Math.floor` before display means it can never move a shown digit.
- **Nothing is double-counted** (audit A2), and ranked determinism itself is
  sound (audit A5.4): `js/fwmath.js` pins the transcendentals, inputs are stepped
  from the same int8 pair that gets stored, and `maxSubSteps` throttles wall-clock
  catch-up without dropping a recorded tick.

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
  one run and zero claimed names.** **LANDED 2026-08-13** (ADR-0018): retirement
  on proven stationarity via `_latchJammed` — 30 consecutive still steps, 1 mm
  anchor-referenced drift tolerance, parked/loose-support/stale-grounded
  exclusions. Drain test `js/voxelsim.drain.test.mjs` ALL PASS; full validator
  completes end to end for the first time. T-901 re-measure is still owed.
- **T-403 — rebuild the audit system.** `tools/validate.mjs` is one serial run
  where a single 780 s excursion takes the whole suite down and everything behind
  it, including `validateChicago()`, never executes. Split into independently
  runnable per-scene probes with a fast default path; demote long deterministic
  excursions to an opt-in soak. *Done when:* the default suite runs in seconds
  and a stalling scene cannot block the others. **LANDED 2026-08-13:** the
  validator is a parallel orchestrator (nine section groups as concurrent child
  processes; `FW_VALIDATE_SEQ=1` for serial, `FW_VALIDATE_SECTIONS=x` for one
  section) and Cambridge's 780 s double excursion is demoted behind
  `FW_VALIDATE_SOAK=1` — the gate runs the route's opening 240 s, measured past
  the cost knee at simT ~270. Default gate: ALL PASS in 72 s wall; full 780 s
  soak: ALL PASS, 61 m wall.
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

## Phase 5 — found while landing Phases 1–3 (2026-08-13)

Raised by the implementer as out-of-scope for its own phase and verified against
the tree by the orchestrator before being written down. Recorded here rather
than mentioned in a report, because a finding that lives only in a message is a
finding nobody will action.

- **T-501 — the head of the combo ladder is inert.** `comboLevel` sets
  `level = i + 1` when the chain crosses `COMBO_THRESHOLDS[i]`
  (`js/voxelsim.js:217-223`), and level 1 is already the floor — so crossing
  index 0 awards the value a chain of 0 already had. A chain of 2 scores exactly
  what a chain of 0 scores. **Any** value at index 0 is inert; the defect is
  structural, not a bad number. The published head reads "2, 10, 15" and the
  validator prints "8 levels (2, 10, 15, …)", so the game states a step the
  player cannot feel. *Fix without moving a single score:* drop `2` from the
  array, make the mapping `level = i + 2`, and set
  `COMBO_MAX_LEVEL = COMBO_THRESHOLDS.length + 1`. Every rung x1..x8 keeps its
  exact current chain range, so there is no `RANKED_SIM_VERSION` implication —
  this is a representation fix, not a tuning change. *Done when:* every entry in
  `COMBO_THRESHOLDS` changes the multiplier when crossed, the literal `LADDER`
  table in `tools/validate.mjs` is unchanged and still passes (that is the proof
  scores did not move), and every consumer of the array — the HUD ring's
  next-rung arc above all — has been swept, not just the definition.
  Whether the first real step belongs at 10 is a separate tuning question; this
  task leaves a clean seam for it and deliberately does not answer it.
- **T-502 — `best_combo` is a chain count under a multiplier's name.** Written by
  `api/_verify.mjs` into a column nothing currently renders. The same ambiguity
  T-309/T-311 just removed from every player-facing readout is still live in the
  stored schema, and the first surface that renders it will reproduce the "it
  maxes out at 100x" confusion the audit traced. *Done when:* the column says
  which quantity it holds, the writer and any reader move with it, and the
  migration runs against Supabase. Land it while the board holds one run and
  zero claimed names — the cheapest window this rename will ever have.
- **T-503 — the finish bonus pays out on a run that finished nothing.**
  `js/ui/screens.js:326` adds `SANDBOX_GOAL_BONUS` unconditionally, and line 350
  prints "Finish bonus +35" — on a screen whose own heading two lines earlier
  reads "TIME'S UP" and whose own body prints "City cleared 3%". Harmless while
  a sandbox run could only end by reaching the goal; a live payout bug the
  moment the 180 s clock made timing out the ordinary ending. The screen already
  has `sim.won` in scope, which is what makes this an inconsistency the player
  can read off one frame. *Done when:* the bonus is gated on `sim.won`, the line
  is absent (not zeroed) when it was not earned, `recordSandboxResult` banks the
  same number the screen showed, and a validator guard fails on the ungated
  form.
- **T-504 — THE RUN's countdown is rendered into the coin readout's pill.**
  `updateSandbox` writes the coin readout into `#timer`, then overwrites it with
  the ranked countdown when `sim.mode === 'run90'` (`js/ui/hud.js:241-248`), so
  a ranked run loses its coin readout for the whole run and shows its countdown
  in a small grey chip with no warn or urgent state — while `#level-clock`, the
  pill built for countdowns, sits switched off. `index.html`'s own comment
  already warned that "one element cannot be both without one of them
  disappearing"; this is that, live. `index.html:136` also still ships
  `<div id="timer">75</div>`, the start value of the campaign clock ramp R-1.1
  retired. *Done when:* a ranked run shows exactly one countdown, in
  `#level-clock`, reading down from `RANKED_TICK_COUNT` rather than a literal
  90; the sandbox keeps its coin readout; the stale initial text is gone; and a
  browser probe asserts the COUNT of visible countdown elements rather than the
  text of one.

  **Correction, 2026-08-13.** This task first read "two contradictory clocks
  during THE RUN — `#level-clock` on 180 s and `#timer` on 90 s, at the same
  time". That was my error, from reading the call order in `updateSandbox` and
  inferring both pills would paint without checking what `sim.timeLeft` holds in
  run90. It holds `null` (`js/voxelsim.js:441`, guarded again at `:3396`), so
  `_updateClock(null)` hides `#level-clock` and there was only ever ONE visible
  countdown. The implementer measured it on the unfixed tree — `THE RUN: visible
  countdowns: 1 -> [{"id":"timer","text":"86.8 s"}]` — and reported the
  discrepancy before acting, which is why the fix went toward the design rather
  than toward my description of the accident. The defect is real and the
  acceptance criteria above were met unchanged; only the symptom was misstated.
  Inferring runtime state from control flow instead of reading the value is the
  mistake to not repeat.
