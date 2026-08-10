# Score, Combo and Hype — Requirements

> [Objective overview](00-objective-overview.md) — the trajectory. ·
> [PRD](01-prd.md) — the normative spec these criteria verify.

**This document is the contract.** Verification checks against these lines and
not against anyone's memory of what was meant. A behaviour not written here is
not verified, and a criterion that cannot be observed is a defect in this
document — fix it here rather than testing something adjacent.

## Problem & goal

The voxel sandbox scores the player in `hole.mass` (`js/voxelsim.js:2338`) and
renders that number nowhere. It multiplies every bite by `comboMult`
(`js/voxelsim.js:98`) and renders that nowhere either. What it does render is a
pill that reads `⚡ COMBO x2` at a chain of 26 (`js/ui/hud.js:104`) while the sim
is awarding 1.1×, so the one piece of scoring feedback that exists is wrong.

"Done" means: the score is on screen and readable at a glance; the combo meter
reports the real multiplier and teaches its own 1.5 s window; the multiplier
ladder is front-loaded so a competent run is rewarded early and a great one is
rewarded rarely; the city's consumption is staged with escalating phrases; the
three tracks are distinguishable without reading; nothing covers the hole;
reduced motion is honoured; and the booth still runs at 60 fps.

## How to read the criteria

- **GWT-nnn** are Given/When/Then, written to be observable.
- **SYS-nnn** are EARS-style: "When `<trigger>`, the system shall `<response>`"
  / "While `<state>`, the system shall `<response>`" / "Where `<config>`, the
  system shall `<response>`".
- **FR-nnn** references point at [01-prd.md §6](01-prd.md#6-functional-requirements).
- **[N]** marks a criterion checkable in `tools/validate.mjs`. **[L]** marks one
  that requires live verification because the Node harness renders nothing.
- "A sandbox run" means any scene reached through the free-play path; the
  campaign is out of scope ([01-prd.md §4](01-prd.md#4-non-goals-out-of-scope)).
- "The booth machine" means the hardware the game is demonstrated on; where a
  criterion is hardware-sensitive it says so.

---

## Story 1 — Seeing the score

> As a player mid-run with my eyes on the hole, I want to see how well I am
> doing without looking away, so that the eating feels like it is adding up to
> something. *(FR-001 … FR-004, G1)*

**Acceptance criteria**

- **GWT-101** **[L]** **Given** a sandbox run in progress, **when** the player
  consumes a block, **then** a score readout is visible on screen and its value
  increases.
- **GWT-102** **[N]** **Given** any moment in a run, **when** the displayed
  score is compared with `sim.hole.mass`, **then** they agree to the displayed
  precision once any count-up animation has settled.
- **GWT-103** **[L]** **Given** a large single gain, **when** it is scored,
  **then** the readout animates toward the new value over a visible interval
  rather than snapping, so that the size of the gain is legible from the
  animation alone. *(FR-002)*
- **GWT-104** **[L]** **Given** a score that gains a digit mid-run, **when** the
  new digit appears, **then** no other HUD element moves. *(FR-003)*
- **GWT-105** **[L]** **Given** a viewer two metres from the screen, **when**
  they look at the HUD, **then** the score is readable without leaning in.
- **GWT-106** **[N]** **Given** a run at any progress, **when** the goal bar's
  width is compared with `rawMass / (totalMass × goal.targetFraction)`, **then**
  they agree, and the score has had no effect on the bar. *(FR-004; the
  load-bearing invariant's second half)*
- **SYS-107** While a sandbox run is active, the system shall derive the score
  readout from `hole.mass` and from no other quantity.
- **SYS-108** Where the run is a campaign level rather than a sandbox run, the
  system shall render no score readout, leaving the campaign HUD unchanged.

---

## Story 2 — A combo meter that tells the truth

> As a player on a hot streak, I want to see how long my chain is, what it is
> currently worth, and how long I have left to keep it, so that I can play
> toward it instead of discovering it by accident. *(FR-005 … FR-010, G2)*

**This story closes a defect.** `js/ui/hud.js:104` currently prints a level
index in multiplier notation. The criteria below are written so that the defect
cannot survive them.

**Acceptance criteria**

- **GWT-201** **[N]** **Given** any chain value from 1 to 1000, **when** the
  multiplier the HUD would display is compared with `comboMult(chain)` from the
  sim, **then** they are equal for every value. *(FR-006; the load-bearing
  invariant's first half, and the regression test for the closed defect)*
- **GWT-202** **[N]** **Given** the codebase after this change, **when** it is
  searched for expressions computing a combo multiplier, **then** exactly one
  exists, it lives in `js/voxelsim.js`, and it is exported. *(FR-006, FR-012)*
- **GWT-203** **[L]** **Given** a live chain, **when** the player looks at the
  combo meter, **then** the chain count and the current multiplier are both
  readable, and they are visually distinguishable from one another. *(FR-005,
  FR-006)*
- **GWT-204** **[L]** **Given** a live chain and no further consumption,
  **when** the 1.5 s window elapses, **then** the meter has visibly drained to
  empty over that interval and the chain has ended. *(FR-007)*
- **GWT-205** **[L]** **Given** a live chain, **when** a coin is collected
  within the window, **then** the drain visibly refills and the chain count does
  not increase. *(`js/voxelsim.js:370-384` — a coin sustains a chain and is never
  a link in one)*
- **GWT-206** **[L]** **Given** a chain that crosses a ladder threshold,
  **when** it crosses, **then** a combo-specific celebration fires whose
  intensity is greater for a rarer threshold. *(FR-009)*
- **GWT-207** **[L]** **Given** a chain that breaks, **when** it breaks, **then**
  the meter returns to rest in a way visibly distinct from a run in which no
  chain has yet started. *(FR-010)*
- **SYS-208** When the chain is zero, the system shall show the combo meter in
  its resting state rather than hiding and re-showing it, so that its position on
  screen is learnable.
- **SYS-209** When the HUD needs a multiplier for display, the system shall call
  the sim's exported ladder rather than re-deriving one.

---

## Story 3 — A ladder worth climbing

> As a player, I want my first good streak to be rewarded within seconds and my
> best streak of the session to be genuinely rare, so that the combo is both
> encouraging early and worth chasing late. *(FR-011 … FR-014, G3)*

**Acceptance criteria**

- **GWT-301** **[N]** **Given** the shipped ladder, **when** its thresholds are
  read, **then** they are at chain 2, 10, 15, 25, 50, 100, and thereafter at a
  repeating interval of approximately 250. *(FR-011)*
- **GWT-302** **[N]** **Given** the shipped ladder, **when** it is inspected,
  **then** it is an ordered data table with strictly increasing thresholds, and
  the multiplier it yields is non-decreasing in chain and begins at ×1.
  *(FR-012)*
- **GWT-303** **[N]** **Given** the shipped ladder, **when** the tail rule and
  the per-step increment are located, **then** each is a single named constant
  that can be changed without restructuring the table. *(FR-013)*
- **GWT-304** **[L]** **Given** a competent opening on any scene, **when** the
  player's first sustained streak reaches ten consumed blocks, **then** at least
  one ladder step has fired. *(G3's front-loading, observable in play)*
- **GWT-305** **[N]** **Given** each scene's scripted excursion in
  `tools/validate.mjs`, **when** it is run after the change, **then** it reaches
  at least the SIZE it reached before the change and does not exceed the top of
  the SIZE ladder. *(FR-014)*
- **GWT-306** **[N]** **Given** each scene's scripted excursion, **when** it is
  run twice in the same process, **then** eaten count and mass are identical
  across the two runs. *(ADR-0003; the existing determinism assertions at
  `tools/validate.mjs:1081` and `:1316` must still pass)*
- **GWT-307** **[N]** **Given** the sim after this change, **when**
  `js/voxelsim.js` is scanned, **then** it contains no `Math.random()`.
  *(`.wiki/conventions.md` hard rule 1, already enforced; restated because this
  change touches the sim)*
- **SYS-308** When the multiplier ladder changes, the system shall rebalance the
  SIZE ladder in the same change such that each scene's time-to-clear on the
  scripted excursion stays within the band it occupies today.
- **SYS-309** While a chain is live, the system shall apply exactly the
  multiplier the ladder returns for the current chain, to every block consumed.

---

## Story 4 — The run has an arc

> As a player clearing a city, I want the game to react as I pass real
> milestones, so that a run has an opening, a middle, a home stretch and a
> finish rather than being uniform from start to end. *(FR-015 … FR-018, G4)*

**Acceptance criteria**

- **GWT-401** **[L]** **Given** a run in progress, **when** consumption crosses
  a milestone threshold, **then** a full-width phrase appears above the play
  area, holds long enough to read, and leaves.
- **GWT-402** **[N]** **Given** the phrase table, **when** it is read, **then**
  its thresholds are strictly increasing, all lie in `(0, 1]`, and each row
  carries its own copy and its own tier. *(FR-015, FR-018)*
- **GWT-403** **[N]** **Given** a scene with `targetFraction` 0.5 and a scene
  with `targetFraction` 1.0 (`js/voxelsim.js:99-106`), **when** the milestone
  thresholds are evaluated, **then** both stage across the full run because the
  thresholds are fractions of the scene's goal rather than of the whole city.
  *(FR-016)*
- **GWT-404** **[L]** **Given** a run that reaches its goal, **when** the goal
  is reached, **then** the final and loudest milestone coincides with it rather
  than arriving before or after. *(FR-017)*
- **GWT-405** **[L]** **Given** someone who does not read code, **when** they
  are shown the phrase table, **then** they can change a phrase's wording
  without touching anything else. *(FR-018)*
- **GWT-406** **[N]** **Given** the milestone thresholds, **when** they are
  compared against `rawMass`-derived progress, **then** they are driven by
  `rawMass` and not by `mass`. *(The load-bearing invariant's second half)*
- **SYS-407** When a milestone threshold is crossed, the system shall emit
  exactly one announcement for it for the remainder of the run, even if progress
  oscillates around the threshold.

---

## Story 5 — Three vocabularies, told apart at a glance

> As a player with my eyes on the hole, I want to know what just fired without
> reading it, so that celebration is information rather than decoration.
> *(FR-009, FR-023, G5)*

**Acceptance criteria**

- **GWT-501** **[L]** **Given** a viewer who cannot read the words, **when**
  each of the three celebrations fires (consumption milestone, combo step, SIZE
  increase), **then** they can name which one it was from shape, position and
  motion alone.
- **GWT-502** **[L]** **Given** the three celebrations, **when** they are
  compared, **then** no two share the same screen region, the same primary shape,
  or the same motion direction.
- **GWT-503** **[L]** **Given** the combo track, **when** any of its steps
  fires, **then** no full-width screen phrase appears. *(Screen phrases belong to
  consumption only)*
- **GWT-504** **[L]** **Given** the SIZE track, **when** a SIZE increase fires,
  **then** its existing presentation (`js/main.js:564-572` — arpeggio, shake, FOV
  kick, confetti, big pop) is recognisably the same event it is today.
- **GWT-505** **[L]** **Given** a player at any point in a run, **when** they
  glance at the HUD, **then** the visual weight of the three tracks matches the
  ranking consumption > combo > SIZE.
- **SYS-506** Where a new celebration is added for any metric, the system shall
  give it its own vocabulary rather than reusing another metric's with a colour
  change.

---

## Story 6 — Nothing talks over anything else

> As a player, I want the most important thing to be the thing I see, so that a
> minor event never erases a major one mid-sentence. *(FR-019 … FR-021)*

**This story closes a live defect.** A 700 ms coin toast currently overwrites a
2200 ms milestone toast, because both write the same element and the same timer
(`js/main.js:578-581`, `js/ui/hud.js:45-49`).

**Acceptance criteria**

- **GWT-601** **[L]** **Given** a milestone announcement on screen, **when** a
  coin is collected, **then** the milestone completes and the coin feedback does
  not truncate it. *(FR-020)*
- **GWT-602** **[L]** **Given** a low-priority announcement on screen, **when** a
  higher-priority one is raised, **then** the higher-priority one takes the
  channel immediately. *(FR-020)*
- **GWT-603** **[L]** **Given** several announcements from the same source in
  quick succession, **when** they are raised, **then** they coalesce into one
  rather than queueing into a backlog the player watches drain. *(FR-021)*
- **GWT-604** **[N]** **Given** the codebase after this change, **when** it is
  searched for direct calls to the transient-message primitives, **then** every
  gameplay announcement goes through the queue. *(FR-019)*
- **SYS-605** When an announcement is raised, the system shall accept a
  priority and a source alongside its text, so that a future reward system
  needs no new channel.

---

## Story 7 — Nothing covers the hole

> As a player, I want the thing I am steering to stay visible, because it is the
> game. *(FR-023, G6)*

**Acceptance criteria**

- **GWT-701** **[L]** **Given** any combination of celebrations firing at once,
  **when** the screen is observed, **then** the hole and its immediate
  surroundings remain unobscured.
- **GWT-702** **[L]** **Given** the consumption band on screen, **when** it is
  shown, **then** it sits above the play area, is transient, and does not
  intercept pointer or touch events.
- **GWT-703** **[L]** **Given** a phone in portrait with safe-area insets,
  **when** the HUD is rendered, **then** every element added by this package is
  inboard of its inset and none overlaps the joystick region or the two 44 px
  buttons. *(`css/main.css:44-47`, `:117-128`)*
- **GWT-704** **[L]** **Given** a 390 px-wide viewport, **when** all readouts
  are at their maximum expected values, **then** nothing overlaps, wraps
  unexpectedly, or leaves the viewport.
- **SYS-705** While a sandbox run is active, the system shall render no
  persistent element within the central play area.

---

## Story 8 — Less movement, same information

> As a player who has asked for less movement, I want to know exactly as much as
> everyone else does. *(FR-022, and the standing `reducedMotion` contract)*

**Acceptance criteria**

- **GWT-801** **[L]** **Given** `reducedMotion` is on in settings
  (`js/ui/screens.js:341`, `js/save.js:12`), **when** any of the three
  celebrations fires, **then** it conveys the same information with no
  translation, scale or shake animation.
- **GWT-802** **[L]** **Given** the OS reports `prefers-reduced-motion: reduce`
  and the in-game setting is off, **when** the game runs, **then** the reduced
  variants are used, matching how `js/camera.js:371` and `js/voxelworld.js:1561`
  already behave.
- **GWT-803** **[L]** **Given** `reducedMotion` is toggled mid-session, **when**
  the next celebration fires, **then** it uses the newly selected variant without
  a restart.
- **GWT-804** **[L]** **Given** `reducedMotion` is on, **when** the score
  changes, **then** it sets to its new value rather than counting up.
- **SYS-805** Where reduced motion is in effect, the system shall not add camera
  shake, FOV kick, or particle bursts beyond what the game already produces
  today.

---

## Story 9 — It still runs at 60

> As the person standing at the booth, I want the game to hold its frame rate
> during exactly the moments it is being watched. *(G7)*

**Acceptance criteria**

- **GWT-901** **[L]** **Given** a high-chain plough on booth hardware, **when**
  the frame rate is observed, **then** it holds the 60 fps target, and that is
  the worst case because it is when the meters update most often.
- **GWT-902** **[N]** **Given** the sim after this change, **when** `sim.step`
  timing is compared against the pre-change baseline on the same scripted
  excursion, **then** there is no measurable regression. *(A table lookup
  replaces an arithmetic expression)*
- **GWT-903** **[L]** **Given** a sustained run of several minutes, **when** DOM
  node count is observed, **then** it does not grow with the number of
  celebrations fired.
- **SYS-904** While a chain is live, the system shall animate the meters by
  mutating properties of persistent elements, and shall not create or destroy
  elements per consumed block.
- **SYS-905** Where a combo step is one of the frequent early levels, the system
  shall fire no particle effect, restricting particles to the rarer steps.
  *(The chatter-damping discipline of `js/skins.js:425`. Measured on Cambridge's
  full route: levels 1-4 cross every 7 to 10 seconds, level 6 every 21 seconds,
  level 7 once or twice in thirteen minutes — see
  [00](00-objective-overview.md) §"How often does this actually fire?")*
- **SYS-906** When a scripted excursion completes in `tools/validate.mjs`, the
  system shall report the run's peak chain and final score alongside the existing
  per-scene summary figures, so that a tuning change's effect on the ladder is
  visible on every gate run.

---

## Story 10 — The run's peak survives the run

> As a player who just did something good, I want to see it afterwards, so that
> the number I was watching meant something. *(FR-024, G8)*

**Acceptance criteria**

- **GWT-1001** **[L]** **Given** a completed sandbox run, **when** the results
  screen is shown (`js/ui/screens.js:148-161`), **then** the final score and the
  run's best chain are both on it.
- **GWT-1002** **[L]** **Given** a run that beats the stored best for that
  scene, **when** results are shown, **then** the improvement is marked.
- **GWT-1003** **[L]** **Given** a completed run, **when** the game is reloaded,
  **then** the stored best combo and best score for that scene persist.
- **GWT-1004** **[N]** **Given** the save module after the new keys are added,
  **when** `freshSave()` and the `MIGRATIONS` chain are compared, **then** their
  key sets are exactly equal at both the top level and inside `settings`.
  *(`.wiki/conventions.md` hard rule 6, already validator-enforced)*
- **GWT-1005** **[N]** **Given** a save from the previous schema version,
  **when** it is loaded, **then** it migrates without loss and the new keys are
  present.
- **SYS-1006** When a sandbox run ends, the system shall record the run's best
  chain and final score per scene through the existing
  `recordSandboxResult` path (`js/save.js:315`) rather than through a new one.

---

## Non-functional requirements

- **NFR-01** 60 fps on booth hardware during the worst case (a high-chain
  plough at large SIZE). **[L]**
- **NFR-02** No new runtime dependency and no build step.
  ([ADR-0014](../../adr/0014-vendored-same-origin-runtime.md)) **[N]**
- **NFR-03** No third-party host in the load path. **[N]**, already asserted.
- **NFR-04** Colour is never the only channel carrying a distinction. **[L]**
- **NFR-05** Every readout sits on an opaque plate, so contrast does not depend
  on the scene behind it. **[L]**
- **NFR-06** All new anchors respect `--sai-*` safe-area insets. **[L]**
- **NFR-07** Every player-facing phrase is set as text, never as markup, so the
  phrase table can never become an injection surface.
  ([01-prd.md §10](01-prd.md#10-security-authz--access-control)) **[N]**

## Out of scope

Restated here because a requirements document is where scope leaks in. None of
the following is verified by this contract and none of it may be built under it:
achievements, the 44 easter eggs, the 11 hidden glyphs, championship belts,
online leaderboards or any backend, the campaign HUD, per-city phrase sets, a
score-boosting shop item, and any change to coin behaviour or to any scene's
`targetFraction`. See [01-prd.md §4](01-prd.md#4-non-goals-out-of-scope).

## Open decisions this contract was waiting on — ANSWERED

All three were ruled on before the build (2026-08-10) and are recorded in
[00-objective-overview.md](00-objective-overview.md) §"Decisions that are the
owner's": **points-only**, **a named top level** at chain 600, and **a whole
helping per level**. The values they resolve into are what GWT-301, GWT-303 and
SYS-308 are now checked against — and Q1's ruling is what SYS-308 means in
practice, since the SIZE ladder's INPUT changed from `mass` to `rawMass` rather
than only its thresholds.
