# PRD 0002: Score, Combo and Hype — the sandbox reward layer, on screen

> [Objective overview](00-objective-overview.md) — read first; this document
> assumes its trajectory and does not re-argue it. ·
> [Requirements](02-requirements.md)

- **Status:** Proposed
- **Priority:** P1 (wanted for the booth; not a hard external dependency the
  way the online package is)
- **Owner surface:** `index.html` (HUD markup), `css/main.css` (meters,
  banner, tokens), `js/ui/hud.js` (meter drive + announcement queue),
  `js/main.js` (sandbox event dressing), `js/voxelsim.js` (multiplier ladder,
  milestone ladder, SIZE-ladder rebalance), `js/ui/screens.js` (results
  screen), `js/save.js` (persisted best combo and best score),
  `tools/validate.mjs` (new assertions)
- **Migration:** `hole-city-save` schema bump for the new sandbox records; one
  `MIGRATIONS` entry plus the matching `freshSave()` keys
  (`.wiki/conventions.md` hard rule 6)
- **Related docs:** [00-objective-overview.md](00-objective-overview.md),
  [02-requirements.md](02-requirements.md), `.wiki/visual-direction.md`,
  [ADR-0002](../../adr/0002-sim-render-split.md),
  [ADR-0003](../../adr/0003-deterministic-seeded-generation.md),
  [ADR-0005](../../adr/0005-shared-brand-layer.md),
  [ADR-0014](../../adr/0014-vendored-same-origin-runtime.md)

**Note on location and numbering.** The repo has no `.wiki/prds/` directory;
numbered PRDs live inside their feature package. `PRD 0001` lived at
`.wiki/features/online-flywheel/01-prd.md` until that package was retired
along with the legacy multiplayer stack. This one follows that pattern and
continues the sequence.

---

## 1. Overview / problem / goal

The voxel sandbox keeps a real, combo-multiplied score in `hole.mass`
(`js/voxelsim.js:2338`) and has never rendered it. It applies a multiplier,
`comboMult` (`js/voxelsim.js:98`), that is rendered nowhere. What it *does*
render is a pill reading `⚡ COMBO x2` at a chain of 26 (`js/ui/hud.js:104`),
which is a level index formatted as a multiplier and overstates the actual
reward — at that moment the sim awards **1.1×**.

This PRD specifies: a **score meter**, a **combo meter** that tells the truth
about both the chain and what it is currently worth, a **replacement multiplier
ladder** with the owner's front-loaded thresholds, and a **staged consumption
celebration** that gives a run an arc. Each of the three tracked metrics gets
its own visual and audio vocabulary; none of them may obscure the hole; all of
them respect `reducedMotion`; none of them costs the 60 fps booth target.

**Primary goal:** a player can see, at a glance and without looking away from
the hole, how well they are doing, how much better the current combo is making
them, and how close the city is to gone — and the run has a shape they will
remember afterwards.

## 2. Load-bearing invariant

**Every number this package puts on screen is the number the sim is actually
using, and `rawMass / totalMass` remains the only thing the goal bar measures.**

Two halves, both non-negotiable.

The first half is what the whole package is correcting: a displayed multiplier
must be the value `comboMult` returned for the current chain, read from the
same source of truth the sim scores with. A pull request that computes a
display value from a second, parallel expression is wrong by construction, no
matter how well it matches — that parallel expression is exactly how
`js/ui/hud.js:104` came to disagree with `js/voxelsim.js:98`. There is one
ladder, it lives in the sim, and the HUD reads it.

The second half protects the goal bar. `hole.mass` is multiplied and can exceed
the city's total mass; `hole.rawMass` cannot (`js/voxelsim.js:2339`, and the
comment on that line records why the split exists). The score display uses
`mass`; the progress bar and every consumption milestone use `rawMass`. Wiring
the multiplied number into the progress bar makes the bar reach 100 % on a
half-eaten city, which is a broken game, not a broken readout.

This invariant depends on and inherits two existing ones:

- **The sim/render split** ([ADR-0002](../../adr/0002-sim-render-split.md)).
  Every effect here is driven by events the sim already emits or by state the
  sim already holds. No effect writes to sim state, and no sim change is made
  for a purely visual reason.
- **Determinism** ([ADR-0003](../../adr/0003-deterministic-seeded-generation.md)).
  No `Math.random()` enters `js/voxelsim.js`. Celebration randomness (particle
  scatter, confetti jitter) is render-side only, exactly as
  `js/voxelworld.js:1774` already does it.

## 3. Goals

1. **G1 — The score is visible and legible at a glance.** A player mid-run,
   eyes on the centre of the screen, can read their score in peripheral vision
   without parsing digits.
2. **G2 — The combo meter tells the truth.** The chain count, the current
   multiplier, and the time left in the 1.5 s window are all readable, and the
   multiplier shown is the one being applied.
3. **G3 — The multiplier ladder is front-loaded.** A player earns a visible
   step within the first seconds of a competent run, and the last steps are
   rare enough to be worth reaching.
4. **G4 — A run has an arc.** Staged consumption phrases mark the opening, the
   middle, the home stretch and the finish, and a player can tell where they
   are in a level without reading the percentage.
5. **G5 — Three vocabularies, distinguishable without words.** A player can
   tell what just fired from its shape, position and motion alone.
6. **G6 — Nothing obscures the hole.** The centre of the screen is clear except
   for the transient consumption banner, which is transparent to the play area
   and short-lived.
7. **G7 — No regression on the booth target.** 60 fps on booth hardware, and
   no measurable added `sim.step` cost.
8. **G8 — The run's peak survives the run.** Best combo and final score are on
   the results screen and in the save.

## 4. Non-goals (out of scope)

- **Achievements, easter eggs, hidden glyphs, championship belts.** Easter
  eggs and glyphs are designed in
  `.wiki/features/cambridge-sandbox/04-easter-eggs-and-achievements.md`;
  belts were designed in the online-flywheel package, retired along with the
  legacy multiplayer stack and not yet replaced. This package builds the
  announcement channel they will use and none of their content.
- **Online leaderboards, score submission, any backend.**
  [multiplayer](../multiplayer/README.md) and
  [scoreboards-and-profiles](../scoreboards-and-profiles/00-objective-overview.md)
  own it.
- **The campaign HUD.** `js/sim.js` has its own combo formula
  (`js/sim.js:11-13`) that reaches 3× at a chain of 21 and its own label
  (`js/ui/hud.js:74`). Both are left exactly as they are. The divergence is
  recorded in [00](00-objective-overview.md) as context, not as work.
- **Per-city phrase sets.** The data shape permits them; day one ships one set.
- **A shop item that boosts score.** The shop exists and this is one step away.
  Not now.
- **Any change to coin behaviour.** A coin still sustains a chain and is still
  never a link in one (`js/voxelsim.js:370-384`). That asymmetry is load-bearing
  for cross-city fairness and this package does not touch it.
- **Any change to `targetFraction`.** Only `gallery` is `1.0`; every other scene
  is `0.5` (`js/voxelsim.js:99-106`). The phrase ladder is expressed against the
  *goal*, not against the whole city, so it works for both without changing
  either.

## 5. Personas & user stories

- **The booth visitor (90 seconds, never played before).** Wants to feel
  competent immediately and to have something to say when they hand the
  controls over. Served by G3's early steps and G4's opening phrase.
- **The returning player (has played several runs).** Wants a number to beat.
  Served by G8.
- **The person watching over the shoulder.** Reads the screen from two metres
  away with no context. Served by G1, G4 and G5 — everything must be legible at
  a glance and from a distance.
- **The owner reviewing it.** Wants to change a word without asking an
  engineer. Served by the phrase ladder being data (§7).

Stories with acceptance criteria are in
[02-requirements.md](02-requirements.md).

## 6. Functional requirements

**Score**

- **FR-001** The system must display the player's current score during a
  sandbox run, derived from `hole.mass`.
- **FR-002** The score display must animate toward its new value rather than
  snapping, so that a large gain is visible as a gain.
- **FR-003** The score display must be sized for its largest expected value so
  that gaining a digit does not reflow the HUD.
- **FR-004** The score display must not use the goal bar and must not affect it.

**Combo**

- **FR-005** The system must display the current chain count while a chain is
  live.
- **FR-006** The system must display the current multiplier, obtained from the
  sim's own ladder function, never from a re-derivation.
- **FR-007** The system must display the remaining fraction of the combo window
  as a draining indicator, so the 1.5 s rule is learnable without instruction.
- **FR-008** The system must replace the `⚡ COMBO x{level}` label
  (`js/ui/hud.js:104`), which reports a level index in multiplier notation.
- **FR-009** The system must fire a combo-specific celebration on each ladder
  step, escalating in intensity with the step's rarity.
- **FR-010** The system must return the combo meter to a resting state when a
  chain breaks, distinguishably from it never having started.

**Multiplier ladder**

- **FR-011** `comboMult` must be replaced with a threshold-table ladder whose
  steps are at chain 2, 10, 15, 25, 50, 100, and then at a repeating interval
  of approximately 250.
- **FR-012** The ladder must be expressed as data (an ordered threshold array),
  not as a closed-form expression, so its shape can be retuned without algebra.
- **FR-013** The ladder's tail behaviour (unbounded versus a named top level)
  and its per-step increment must be single, clearly-named constants — the two
  open owner decisions in §21 resolve to values, not to rewrites.
- **FR-014** The SIZE ladder (`js/voxelsim.js:319`, `:2344-2350`) must be
  rebalanced in the same change so that a typical run's time-to-clear on each
  existing scene stays within the band it occupies today.

**Consumption milestones**

- **FR-015** The milestone ladder (`js/voxelsim.js:2357-2361`) must be replaced
  by a data-driven table of thresholds with associated copy and tier.
- **FR-016** Thresholds must be expressed as a fraction of the scene's *goal*,
  not of the whole city, so a `targetFraction: 0.5` scene and a `1.0` scene both
  stage correctly.
- **FR-017** The final threshold must coincide with goal completion so the run
  ends on the loudest beat.
- **FR-018** Milestone copy must be editable as data by someone who does not
  read code.

**Announcement channel**

- **FR-019** All transient screen announcements must pass through one queue
  that takes a priority and a source.
- **FR-020** A higher-priority announcement must interrupt a lower-priority one;
  a lower-priority one must not truncate a higher-priority one already showing.
- **FR-021** The queue must coalesce repeated announcements from the same source
  rather than stacking them.

**Cross-cutting**

- **FR-022** All three vocabularies must have a reduced-motion variant that
  conveys the same information with no translation, scale or shake animation.
- **FR-023** No element introduced by this package may render inside the central
  play area except the consumption banner, which must be transient and must not
  block pointer events.
- **FR-024** The final score and the run's best chain must appear on the sandbox
  results screen and be persisted per scene.

## 7. Data model & schema

No database; the data model here is three tables in module scope plus two save
keys.

**The multiplier ladder** — in `js/voxelsim.js`, replacing the expression at
line 98. An ordered array of chain thresholds; the level is the count of
thresholds passed, and the multiplier is derived from the level by a single
named step constant. The tail rule (repeat interval, and whether there is a cap)
is a constant beside it. Exported, because the HUD must read the same object the
sim scores with — that shared read is the mechanism enforcing §2's first half.

**The milestone ladder** — in `js/voxelsim.js`, replacing the `0.25`-step
arithmetic at lines 2357-2361. Ordered rows of `{ at, text, tier }` where `at`
is a fraction of the scene goal, `text` is the player-facing phrase, and `tier`
selects the volume of the celebration. The owner's examples ("Gettin' there!" at
15 %, "BAM! 25% COMPLETE!" at 25 %) are rows in this table. A scene may later
supply its own array; the field is read through a lookup that falls back to the
default set, and no scene supplies one on day one.

**Save** — two new per-scene sandbox records: best combo and best score. The
existing sandbox record already stores coins, size and elapsed
(`js/save.js:315-323`). One `MIGRATIONS` entry, and the matching keys added to
`freshSave()`, because `.wiki/conventions.md` hard rule 6 makes those two agree
by validator assertion and the last time they drifted it killed both buttons on
the results screen.

**Not stored:** anything per-frame. The meters read live sim state each frame
and hold their own display state in the HUD instance.

## 8. Surfaces & UX

The aesthetic is not invented here. It is `css/main.css:1-47` — gold
`--fw-gold` `#ffd23f`, hot orange `--fw-gold-hot` `#ff8a3f`, the orange CTA
gradient, the ink outline rings `--fw-ring-2/3`, the downward block extrude
(`--fw-extrude-1/2`) — and the existing HUD idiom of rounded pills with a hard
dark plate behind them. `.wiki/visual-direction.md` records that screen chrome
already had its brand pass; these meters join that family rather than starting
a new one.

**Layout.** The HUD's left column (`css/main.css:77-80`, `min(330px, 46vw)`)
already carries banner, goal bar, goal label and the combo pill. The right
column carries two 44 px buttons and the coin pill. The centre is the hole and
stays empty.

- **Score** joins the left column directly under the goal readout, as a wide
  numeric plate in the wordmark's block style. It is the quietest of the three
  in motion and the most prominent in size, because it is read constantly rather
  than glanced at on an event.
- **Combo** moves out of the left column to its own anchor on the right, below
  the coin pill. Separating it from the goal stack is what makes the two
  distinguishable in peripheral vision and is also what gives the meter room to
  be a ring rather than a pill.
- **Consumption phrases** take the full width, horizontally centred, positioned
  above the hole in the same band the existing `#toast` occupies
  (`css/main.css:162-166`, `top: 18%`), never over it.

**The three vocabularies**, restated as build instructions:

| | Consumption | Combo | Hole size |
|---|---|---|---|
| Shape | Full-width horizontal band | Radial ring / arc | Vertical stepped notches |
| Motion | Sweep in from one side, hold, sweep out | Concentric pulse outward from the ring | One rung clunks up, existing camera kick |
| Palette | Gold on ink, block extrude | Heat ramp: white → gold → hot orange → red at the top step | Gold, unchanged from today |
| Sound | Two-note rising fanfare, the widest in the mix | Short bright tick per step, pitch rising with level | Existing three-note arpeggio (`js/main.js:566-568`) |
| Duration | ~2 s | ~250 ms | Unchanged |
| Frequency | A handful per level | Constant at low levels, rare at high | A dozen or so per level |

The heat ramp already has a precedent in the shipped code — `js/ui/hud.js:107`
escalates the combo label through `#ffffff → #ffd23f → #ff9a3f → #ff5a1f`. That
progression is kept and extended; it is the one part of the current combo
display that was right.

**States.** Score: idle (resting number), counting (animating up). Combo:
absent (no chain), live (ring draining), stepping (pulse), broken (ring collapses
distinctly). Consumption band: absent, entering, holding, leaving.

**No empty or error states** in the conventional sense — there is no fetch and
nothing to fail. The equivalent is the sandbox-only scoping: every element here
is inside `body.mode-sandbox`, following the precedent at
`css/main.css:138-150`, so the campaign HUD is untouched by construction.

## 9. Interface contract

No network API and no agent surface. The internal contracts that matter:

- **Sim → renderer**, the existing event stream (`js/voxelsim.js:2352-2361`,
  `:385`, `:2464`), extended with a combo-step event carrying the new level and
  its multiplier, and with the milestone event carrying its row from the ladder
  table rather than a bare fraction. Additive; no existing consumer breaks.
- **Sim → HUD**, the existing per-frame read of `sim.hole` in
  `HUD.updateSandbox` (`js/ui/hud.js:82`), extended to read `mass`, the ladder
  level, and `chainTimer`.
- **Sim ladder export**, so the HUD's multiplier and the sim's multiplier are
  one function called twice (§2).
- **The announcement queue**, a small HUD-owned API taking text, tier, priority
  and source. `showToast` (`js/ui/hud.js:45`) and `showBigPop` (`:53`) become
  its two presentation backends rather than being called directly.
- **`js/skins.js`** already consumes this event stream and normalises it
  (`js/skins.js:374-419`). Additive event fields must not change the shape of
  the ones it reads.

## 10. Security, authz & access control

**N/A** — no network calls, no credentials, no user-supplied data, no server.
The one adjacent concern is that milestone copy is authored data rendered into
the DOM; it must be set as text content rather than as markup, so that the
phrase table can never become an injection surface if a later feature lets a
phrase come from anywhere but the repo.

## 11. Data integrity & write path

The sim is the single write path for every scored quantity, and this package
adds no second one.

The integrity risk that is real here is **the SIZE-ladder rebalance** (FR-014).
`h.mass` is both the score and the SIZE ladder's input, so the multiplier change
is a gameplay change wearing a UI change's clothes. Three properties must hold
afterwards and each is checkable in `tools/validate.mjs`, which already drives
scripted excursions on every scene and already asserts a SIZE floor of 4 on each
of them (`tools/validate.mjs:961`, `:1088`, `:1246`, `:1321`):

1. Every scene's scripted excursion still reaches at least the SIZE it reaches
   today, and does not overshoot the top of the ladder.
2. The excursions remain bit-identical across two runs — determinism is already
   asserted (`tools/validate.mjs:1081`, `:1316`) and a table-driven ladder must
   not disturb it.
3. `rawMass` is untouched, so every existing goal-completion assertion holds
   unchanged.

Save writes go through the existing `recordSandboxResult` (`js/save.js:315`),
extended, not forked. The `freshSave()` / `MIGRATIONS` agreement is validator-
enforced (`.wiki/conventions.md` hard rule 6) and must be satisfied in the same
commit.

## 12. Testing strategy

**Node-testable (`tools/validate.mjs`, the existing harness):**

- The ladder table is monotonic, starts at ×1, and its thresholds are strictly
  increasing.
- The multiplier the HUD would display equals `comboMult(chain)` for every chain
  from 1 to 1000 — the regression test for the defect this package closes.
- The milestone ladder's thresholds are strictly increasing, all within
  `(0, 1]`, and the last one lands exactly on the scene goal.
- Every scene's scripted excursion still reaches its SIZE floor, and the two
  runs of each remain identical.
- `freshSave()` and `MIGRATIONS` agree (existing assertion, will catch the new
  keys if only one side gets them).

**Live-verify only (the harness renders nothing):** every visual and audio
claim. Specifically, that the three vocabularies are distinguishable without
reading; that nothing overlaps the hole at any viewport this ships to; that the
reduced-motion variants convey the same information; and that the frame rate
holds on booth hardware during a high-chain plough, which is the worst case
because it is when the meters update most often.

**Regression test for the closed defect:** the chain-to-multiplier equality
check above. It is the one line that would have caught `js/ui/hud.js:104`.

## 13. Observability & logging

**N/A for production telemetry** — there is no backend on this path and none is
being added ([multiplayer](../multiplayer/README.md) and
[scoreboards-and-profiles](../scoreboards-and-profiles/00-objective-overview.md)
own that question).

What exists instead, and what should be used: `tools/validate.mjs` already
prints a per-scene summary line (`tools/validate.mjs:1324` and siblings) with
blocks, mass, eaten and size. The excursion's peak chain and its final score
should join those lines. That is the project's whole observability story for
this feature and it is the right one — it turns every validator run into a
record of whether a tuning change moved the numbers, which is the only question
anyone will ask about this feature after it ships.

The [00](00-objective-overview.md) §"How often does this actually fire?" section
measures the ladder against Cambridge's full scripted route and records what it
could not establish — the *human* chain distribution, as opposed to a scripted
one. Putting best combo on the results screen (FR-024) is the cheapest available
fix: it makes every future playtest a data point without any infrastructure.
Adding the excursion's peak chain to the validator's per-scene summary line does
the same for every scene, on every run of the gates.

## 14. Error handling & user feedback

The whole feature *is* user feedback, so the failure modes here are feedback
failures rather than exceptions.

- **Two things want to speak at once.** Resolved by the priority queue
  (FR-019-021) rather than by whoever wrote last. This is a live defect today:
  a coin toast at 700 ms overwrites a milestone toast at 2200 ms
  (`js/main.js:578-581`) because both write the same `#toast` element and the
  same timer (`js/ui/hud.js:45-49`).
- **A celebration fires while another is still on screen.** Coalesced, not
  stacked.
- **A chain breaks mid-celebration.** The celebration completes; the meter
  returns to rest underneath it. A truncated celebration reads as a bug.
- **The scene has no phrase row for a fraction.** The table is the only source;
  a missing row means no announcement, never a placeholder or an empty band.
- **A number too large for its plate.** Prevented by FR-003 rather than handled.

No error text is shown to the player under any circumstance in this feature;
there is nothing they could do about it and nothing they did to cause it.

## 15. Performance & cost

No LLM, no network, no cost dimension. The budget is frames.

- **Target:** 60 fps on booth hardware, the standing project target. This
  package must not measurably move `sim.step` time, since the sim changes are a
  table lookup replacing an arithmetic expression.
- **The hot path is the eat event.** The Met excursion runs 11.6 eats per second
  (`tools/validate.mjs:1063-1070`, 721 in 62 s) and a big plough runs higher.
  Every meter must animate by mutating properties on persistent elements. No
  element creation, no class thrash, no layout-triggering property in the
  per-frame path — transform and opacity only, which is also what keeps the
  animation off the main thread's layout work.
- **The announcement channel** creates at most one element per announcement and
  reuses the existing two (`#toast`, `#big-pop`) as its backends.
- **Particle reuse.** Combo and consumption celebrations use the existing
  `spawnShockRing` / `spawnBurst` helpers (`js/voxelworld.js:1760`, `:1774`),
  which already pool through the shared particle list. High-frequency combo
  steps (levels 1-4) must not spawn particles at all — a tick and a meter change
  only. `js/skins.js:425` calls this chatter damping and solved the same problem
  for the same reason.
- **No new dependency, no build step.**
  [ADR-0014](../../adr/0014-vendored-same-origin-runtime.md).

## 16. Accessibility

- **Reduced motion** (FR-022). `save.settings.reducedMotion` (`js/save.js:12`)
  or the OS media query. In that mode: the score sets rather than counts, the
  combo ring fills without pulsing, the consumption band cross-fades rather than
  sweeping, and no camera kick or shake is added beyond what already ships. The
  information is identical; only the movement is removed. Both the camera
  (`js/camera.js:371`) and the renderer (`js/voxelworld.js:1560`) already expose
  live setters and the settings toggle already exists
  (`js/ui/screens.js:341`).
- **Contrast.** Every readout keeps a dark plate behind it (`--fw-plate`,
  `rgba(12,16,28,.92)`) so text contrast does not depend on what the city
  happens to be doing behind it. The heat ramp's top step `#ff5a1f` on ink meets
  the bar; on a light plate it would not, which is why the plate is dark.
- **Colour is never the only channel.** The combo level is a number as well as
  a heat; the consumption stage is a phrase as well as a colour. A player who
  cannot separate orange from red loses nothing.
- **Touch targets.** Nothing added here is interactive, so no new target exists
  to size. The existing 44 px rule (`css/main.css:117-128`) must not be
  encroached on by the new right-column meter.
- **Safe areas.** Every anchor uses the existing `--sai-*` custom properties
  (`css/main.css:44-47`) exactly as the current HUD corners do.
- **No motion in the central 40 % of the viewport**, which is both an
  accessibility property and G6.

## 17. Phases / rollout

No flags and no dark-ship; this is a static single-player game and each phase is
independently shippable and independently verifiable.

1. **Truth first.** Replace `comboMult` with the table-driven ladder, export it,
   and rebalance the SIZE ladder. Fix `js/ui/hud.js:104` to read the exported
   ladder. Add the validator assertions. *Ships as: the combo pill now says what
   is actually happening.* This is the defect fix and it stands alone.
2. **The score.** Score plate in the left column, animated count-up, on the
   results screen and in the save. *Ships as: you can see your score.*
3. **The combo meter.** Ring, window drain, heat ramp, step pulses, right-column
   anchor. *Ships as: the combo is a thing you play toward.*
4. **The announcement queue.** Priority, coalescing, the two existing backends.
   *Ships as: nothing gets talked over.* Must land before phase 5, which is what
   makes it dense enough to matter.
5. **The consumption ladder.** Phrase table, full-width band, staged volume.
   *Ships as: the run has an arc.*

Phase 1 answers the two open decisions in §21 by consuming their values, so it
is the one phase that should not start before the owner has chosen.

## 18. Reuse-don't-fork

Named explicitly, because each has an obvious tempting fork:

- **`comboMult` in `js/voxelsim.js`** — one ladder, exported, read by the HUD.
  Do not compute a display multiplier anywhere else. This is the defect.
- **`HUD.showToast` / `HUD.showBigPop` (`js/ui/hud.js:45`, `:53`)** — become
  backends of the queue. Do not add a third transient-message mechanism.
- **`js/voxelworld.js` particle helpers (`:1760`, `:1774`)** — the celebration
  particle system. Do not add a second one.
- **The brand tokens in `css/main.css:1-47`** — no new colours, no new shadow
  recipes. If a value is needed that does not exist, it becomes a token.
- **`recordSandboxResult` (`js/save.js:315`)** — extended, not forked.
- **The `body.mode-sandbox` scoping precedent (`css/main.css:138-150`)** — the
  established way to give the sandbox HUD different rules without touching the
  campaign's.
- **The `--sai-*` safe-area properties** — already hoisted; use them.
- **The existing event stream** — extended additively, never replaced.

## 19. Acceptance criteria

The verifiable checklist lives in [02-requirements.md](02-requirements.md), one
Given/When/Then or EARS line per functional requirement above. Verification
checks against those lines. The three that map to the load-bearing invariant and
are therefore blocking:

- The multiplier displayed equals `comboMult(chain)` for every chain tested.
- The goal bar is driven by `rawMass` and never exceeds 100 %.
- Every scene's scripted excursion reaches at least the SIZE it reaches today,
  and is identical across two runs.

## 20. Dependencies & integration points

**Depends on:** nothing unbuilt. Every file it touches exists.

**Blocks nothing**, but is a natural precursor to achievements, easter eggs,
glyphs and belts, all of which need a place to appear on screen and all of which
are specified elsewhere.

**Integrates with:** `js/skins.js`, which consumes the same event stream and
must keep working; `tools/validate.mjs`, which gains assertions; and, if the
retired belts design is ever rebuilt, whatever package owns it — its belts
were scored on `longest_chain`, so the number this package displays and the
number that package ranks must be the same one, or the first player to notice
will be right.

**No new dependency of any kind, paid or free.**

## 21. Open questions

Three, all for the owner, all phrased as what a player feels rather than as
numbers. [00-objective-overview.md](00-objective-overview.md) §"Decisions that
are the owner's" carries the full wording and the reasoning; the short form:

- **Q1 — Does a big combo make the hole grow faster, or is it only worth
  points?** *Leading option: grow faster, tuned so a strong run finishes
  noticeably sooner rather than trivially sooner.* Blocks phase 1 (FR-014).
- **Q2 — Does the combo ladder run forever, or top out at a named final level?**
  *Leading option: a named top level around chain 600, because a summit is a
  story and an unbounded number is not, and because the longest chain measured
  across a complete thirteen-minute clear was 528.* Blocks phase 1 (FR-013).
- **Q3 — Is each new combo level worth a whole extra helping of everything you
  eat, or a smaller step?** *Leading option: a whole helping for the early cheap
  levels, with the late ones open to easing after the first playtest.* Blocks
  phase 1 (FR-013).

**Not an open question, recorded so it does not become one:** the frequency of
each ladder step *was* established, against Cambridge's full scripted route —
chain 100 crossed 37 times in thirteen minutes, chain 350 once or twice, chain
600 never, peak 528. See [00](00-objective-overview.md) §"How often does this
actually fire?" for the full table. What could not be established is the *human*
distribution as distinct from the scripted one; §13 explains the cheap fix that
ships with the feature.

## 22. Companion ADR(s)

One genuine architectural decision is made here and it deserves an ADR when
phase 1 is built:

- **"The scoring ladder is a table the HUD reads, not a formula the HUD
  mirrors."** The discarded alternative is the status quo — a closed-form
  expression in the sim and a second expression in the view — which is exactly
  what produced the disagreement between `js/voxelsim.js:98` and
  `js/ui/hud.js:104`. The decision forecloses closed-form tuning elegance and
  buys a shape the owner's curve can actually express, plus a single source of
  truth that a validator assertion can hold. Next free number is
  `.wiki/adr/0015-*`; confirm against the directory at write time, since ADRs
  are append-only per `.wiki/conventions.md`.

**Cited, not re-decided:** [ADR-0002](../../adr/0002-sim-render-split.md)
(sim emits, render dresses), [ADR-0003](../../adr/0003-deterministic-seeded-generation.md)
(no `Math.random()` in the sim), [ADR-0005](../../adr/0005-shared-brand-layer.md)
(the visual language these meters join),
[ADR-0014](../../adr/0014-vendored-same-origin-runtime.md) (no build step, no
new dependency).
