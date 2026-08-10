# PRD 0004 — AI Players

**Status:** planning · **Depends on:** nothing external. This package is
sim-side and offline; it is **not** blocked on the backend credentials that
block [online-flywheel](../online-flywheel/).

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md)
>
> This document extends `docs/PRD.md` and amends
> [score-combo-and-hype/01-prd.md](../score-combo-and-hype/01-prd.md) rather
> than replacing either. Every amendment it makes to an existing normative doc
> is listed in §12 and nowhere else.

---

## 1. The load-bearing invariant

**Every hole's movement is decided by exactly one driver, every driver is a
pure function of sim state plus a seeded stream, and no hole state is written
outside `sim.step()`.**

Everything below is downstream of this. If a bot's decision consults
`Math.random()`, the wall clock, the DOM, or the renderer, three things break
at once and none of them break loudly: replay validation
([ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md)) stops being
sound, the future arena's clients silently disagree about where the bots are
([ADR-0010](../../adr/0010-host-authoritative-arena.md)), and balance work
becomes unrepeatable so no tuning result can be trusted. This is the one
failure this feature cannot survive, and it is worse than the bots never
shipping.

Second invariant, inherited and non-negotiable: **no `Math.random()` anywhere
in the sim path** (conventions hard rule 1, enforced by `tools/validate.mjs`
over `js/voxelscene-*.js` and the seven named files). Bot decisions are seeded
via `rng.js`. The deliberate render-side `Math.random()` in `camera.js` and
`voxelworld.js` remains legal and must never influence a driver.

---

## 2. Scope

**In scope:** the multi-hole sim model and the driver interface; the seeded bot
brain and its difficulty parameter sets; hole-vs-hole swallowing, death,
respawn and respawn placement; the match clock and match end; the amendment of
every voxel scene's goal to 100%; per-hole scoring in a timed match; the HUD
additions (timer, leaderboard strip, rival size tags, respawn state); the
single-player fallback; validator probes; and the tunable constants block.

**Out of scope:** all networking, accounts, backends and credentials; the
campaign (`js/sim.js`, `LEVELS`); pathfinding and navigation meshes; bot
learning or adaptation; score-coupled rubber-banding (explicitly rejected — see
[00](00-objective-overview.md)); battle-royale / last-hole-standing rules; team
modes; attract mode; achievements or belts that count bot kills; any paid
third-party service; any build step or new dependency.

**Mode availability:** the **voxel sandbox only**. Development target is the
`gallery` scene; ship targets are `boston` and `cambridge`. The campaign is
untouched and must remain byte-identically behaved.

---

## 3. Functional requirements

### 3.1 The sim model and the driver seam

- **FR-001** `VoxelSandboxSim` must own an ordered array `this.holes`. Every
  hole carries its own complete state: `x`, `z`, `radius`, `mass`, `rawMass`,
  `chain`, `chainTimer`, `bestCombo`, `eatenCount`, `size`, `sizeFrac`, plus
  the new fields in FR-004.
- **FR-002** `this.hole` must remain as a getter returning `this.holes[0]`, so
  no existing consumer of `sim.hole` breaks in a single change. The getter is a
  migration aid and must be marked for removal once all call sites are
  converted; nothing new may be written against it.
- **FR-003** Each hole must carry a `driver` object implementing
  `decide(hole, world, dt) → {x, z}`, returning an unnormalised steering
  intent. The driver is the **only** channel through which anything outside the
  sim influences a hole's movement.
- **FR-004** Each hole must additionally carry: `index` (stable identity for
  the life of the match, preserved across death and respawn), `isPlayer`,
  `name`, `skinId`, `alive`, `respawnAt`, `invulnUntil`, and `kills`.
- **FR-005** `sim.step(dt, move)` must become `sim.step(dt)`, with the human's
  steering supplied by the human driver rather than passed as an argument. A
  compatibility overload accepting `move` may exist only during P1 and must be
  removed before P2 lands.
- **FR-006** Three drivers must be sanctioned: `human`, `bot`, `peer`. `peer`
  is declared in the interface and **not implemented** here — it is
  [online-flywheel](../online-flywheel/)'s to write. No code in this package
  may assume the driver list is closed.
- **FR-007** Drivers must be constructed from a `matchConfig` describing the
  slot roster (count, per-slot driver kind, per-slot difficulty, per-slot name
  and skin). The roster is data, not code.
- **FR-008** A hole's index must never be reused within a match, and slot order
  must be independent of eating, death or score, so that a bot's RNG stream is
  stable regardless of what happens in the match.
- **FR-009** Every mutation of hole state must occur inside `sim.step()`. No
  render, HUD, input or debug path may write to a hole.

### 3.2 Determinism

- **FR-010** Each hole's driver must own a private RNG stream derived
  deterministically from `(sceneSeed, holeIndex)` via `rng.js`. No two holes
  may share a stream, and no driver may draw from the sim's world-generation
  stream.
- **FR-011** Adding, removing, or reordering slots must not change any
  *other* slot's stream or decisions.
- **FR-012** A match must be exactly reproducible from `(seed, scene,
  matchConfig, human input trace)`. Two runs with the same tuple must produce
  identical final `mass`, `rawMass`, `eatenCount` and `kills` for every hole,
  and identical event ordering.
- **FR-013** Bot decisions must be independent of frame rate. A bot's re-pick
  cadence is measured in sim time, and the fixed-timestep catch-up in
  `js/main.js` must not change any outcome.
- **FR-014** No driver may read the wall clock, `performance.now()`,
  `Math.random()`, the DOM, or any renderer state.

### 3.3 The bot brain

- **FR-015** There must be exactly **one** bot brain. Difficulty is expressed
  entirely as a parameter row supplied to it — never as a subclass, a branch on
  a difficulty name, or a separate function.
- **FR-016** The brain's default behaviour is the promoted greedy driver from
  `tools/validate.mjs:64`: steer toward the nearest currently-swallowable
  object, re-plan on a cadence.
- **FR-017** Target selection must first query within `greedRadius` of the
  bot's position, and only fall back to a wider or whole-scene scan when that
  query is empty. The wide scan must be rate-limited (FR-021) — an unbounded
  per-step whole-scene scan per bot is a performance defect, not a difficulty
  setting.
- **FR-018** A bot must only target objects it can currently swallow, using the
  same edibility predicate the player's hole uses. A bot must never be able to
  eat something the player could not at the same size.
- **FR-019** The brain must implement a **threat override**: if a hole capable
  of swallowing this bot (per FR-026) is within `threatRadius`, the bot steers
  away from it, overriding its current target, for at least `reactionTime`.
- **FR-020** The brain must implement a **hunt** behaviour gated by
  `aggression`: when a swallowable rival hole is within `greedRadius`, the bot
  may select it as its target instead of the nearest object. A bot must never
  hunt when the threat override is active.
- **FR-021** The brain must re-pick its target on a cadence of `repick` sim
  seconds, and must otherwise persist its current target between decisions. It
  must re-pick immediately if its target has been eaten by anything.
- **FR-022** A bot must apply its steering with a latency of `reactionTime`
  sim seconds: the intent it returns is the decision it made `reactionTime`
  ago. This is the primary difficulty dial and the primary source of a bot
  reading as human rather than robotic.
- **FR-023** A bot must detect being stuck (net displacement below a threshold
  over a window while its intent is non-zero) and re-pick a different target.
- **FR-024** Bot speed must be governed by the same movement code and the same
  `SPEED_MULT` curve as the player's hole, scaled by the row's `speedScale`.
  `speedScale` must default to `1.0` for every shipped difficulty; it exists as
  a tuning escape hatch, and any shipped row with `speedScale > 1.0` is a
  design smell to be justified in the row's comment.
- **FR-025** Four difficulty rows must ship: `IDLE`, `EASY`, `MEDIUM`, `HARD`.
  Each row is `{greedRadius, threatRadius, reactionTime, repick, aggression,
  speedScale}`. The table must live beside the scoring tables in
  `js/voxelsim.js` and be exported, per the precedent
  [ADR-0015](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md) set.

### 3.4 Hole versus hole

- **FR-026** A single predicate `canSwallow(a, b)` must decide whether hole `a`
  can swallow hole `b`. It must be the only place the rule is expressed.
- **FR-027** The rule is: `a` may swallow `b` when `a.radius >= b.radius *
  SWALLOW_RATIO` **and** the centre distance is less than `a.radius`. A size
  ratio, not a size-level comparison, so the outcome is continuous and legible
  from the two on-screen circles.
- **FR-028** When mutual swallowing is geometrically possible in the same step,
  it must be impossible by construction: the predicate's ratio gate makes the
  relation asymmetric, and ties (equal radii) must resolve to neither.
- **FR-029** Resolution order across all hole pairs must be deterministic and
  index-ordered, and a hole eaten in a step must not itself eat in that step.
- **FR-030** On a swallow, the eater must gain `EATEN_MASS_TRANSFER` of the
  eaten hole's `rawMass`, added through the same path a block eat uses, so the
  SIZE ladder, milestones and goal bar all see it. Per genre research, eating a
  hole is the highest-value action available and the transfer must be
  substantial, not a token bonus.
- **FR-031** A swallow must advance the eater's combo chain by one and refresh
  its `chainTimer`, exactly as a block eat does.
- **FR-032** The eater's `kills` must increment. The eaten hole's `kills` and
  banked `mass` (the score) must be preserved.
- **FR-033** On death, the eaten hole must set `alive = false`, set `respawnAt
  = time + RESPAWN_DELAY`, and stop being simulated for movement, eating and
  support-graph purposes until it respawns.
- **FR-034** On respawn: position from the placement rule (FR-035), `radius =
  START_RADIUS`, `rawMass = 0`, `size = 1`, `sizeFrac = 0`, `chain = 0`, `alive
  = true`, `invulnUntil = time + RESPAWN_INVULN`. **Banked `mass` (the score)
  is kept**, and `bestCombo` and `kills` are kept. Per
  [00](00-objective-overview.md), this is the packaged ruling on Nico's
  "respawns small after a few seconds" and is surfaced there for revision.
- **FR-035** Respawn placement must be deterministic and seeded, and must
  select, among candidate cells with remaining unconsumed mass, one that
  maximises distance from every living hole. It must never place a hole inside
  another hole's radius, and it must never place a hole outside `bounds`.
- **FR-036** While `time < invulnUntil`, a hole must not be swallowable. The
  window must be short enough that it cannot be farmed and long enough that a
  respawn-loop is impossible.
- **FR-037** The player's death and respawn must be shown in-world, not behind
  a modal — the camera stays on the city and the countdown is an overlay. Per
  genre research the respawn window is time the player is expected to use to
  scout, and a modal takes that away.

### 3.5 The match clock and the goal amendment

- **FR-038** A match must run for `MATCH_DURATION` sim seconds, shipping at
  **180 s (3 minutes)** per the owner ruling of 2026-08-10, and the constant
  must be **tunable** — declared once in the constants block, never inlined,
  and changeable without touching any other file. See
  [00](00-objective-overview.md) §"Where the genre disagreed with us" for the
  genre's 120 s, the content-density reasoning that put the shipped value above
  it, and the 120/180/300 playtest that remains worth running.
- **FR-039** Every voxel scene's `targetFraction` must become `1.0`.
  Consequently the goal is a **ceiling, not a gate**: the match ends when the
  clock expires. **A match-end screen is mandatory in every outcome**, and when
  the player has not cleared the city it must report how much they took and
  where they placed (`"You took 34% of Cambridge — 1st"`), framed as an
  achievement and never as a failure. A 100% clear within the clock is a bonus
  outcome (`PERFECT CLEAR`), not the expected one. Owner-confirmed 2026-08-10.
- **FR-040** The existing win check `h.rawMass >= this.totalMass *
  this.goal.targetFraction` is known to fail at `targetFraction 1.0` because
  incremental summation lands ~1e-12 below the `reduce()` total. **An epsilon
  fix is queued with another agent and this package depends on it; this package
  must not implement its own.** At 100% goals in every scene this is
  load-bearing: without it, `PERFECT CLEAR` can never fire anywhere.
- **FR-041** Milestone events must continue to be computed against the goal
  (`rawMass / (totalMass * targetFraction)`), which at `targetFraction 1.0`
  makes them milestones against the whole city. This is the intended reading
  and requires no code change — the existing comment at `js/voxelsim.js` §MILESTONES
  already anticipated the 1.0 case.
- **FR-042** The clock must be sim time, advancing only when the sim advances,
  so a paused or backgrounded tab does not consume the match.
- **FR-043** At clock expiry the sim must set `over = true`, freeze all holes,
  emit a `matchEnd` event carrying the final ordered standings, and stop
  accepting driver intents.
- **FR-044** `MATCH_DURATION` must be overridable per match config, so an
  untimed sandbox session remains possible (`Infinity`) and so future modes do
  not require a code change.

### 3.6 Scoring in a timed match

- **FR-045** Ranking within a match must be by `mass` (the combo-multiplied
  score), descending, with `rawMass` then `holeIndex` as tie-breaks. This keeps
  the shipped [ADR-0015](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md)
  meaning of score intact: score is what you show, `rawMass` is what makes you
  grow.
- **FR-046** Every hole must accumulate score independently through the same
  combo machinery. A bot's chain, level and multiplier are computed by the same
  functions as the player's.
- **FR-047** Combo, growth and milestone **events** must carry the originating
  hole. The HUD must render meters and announcements for the local player's
  hole only; rival events drive world-space dressing at most. A bot's combo
  must never pulse the player's meter — this is the single most likely
  regression in the whole package.
- **FR-048** Per-scene persisted `bestCombo`/`bestScore` (`js/save.js` schema
  v16) must record the **local player's** figures only, and must record them
  under a match-type key so that a timed multi-hole run's best is not compared
  against a solo untimed run's best.
- **FR-049** The results screen must show final standings for all holes, the
  player's placement, the achieved city fraction, kills, and best combo.

### 3.7 HUD and presentation

- **FR-050** A match timer must be present, showing remaining time, with a
  distinct final-30-second state. It must be legible without colour alone.
- **FR-051** A leaderboard strip must show every living hole ranked by score,
  with name and a size indication, updating at a rate that is readable rather
  than every frame.
- **FR-052** Every rival hole must carry a world-space tag showing its name and
  its size relative to the player, and the relative-size signal must be
  encoded redundantly (not by colour alone) because the entire hole-vs-hole
  decision — *smaller, eat it; bigger, run* — is made from this one glance.
- **FR-053** Rival tags must be legible at the camera distances the shipped
  orbit camera ([ADR-0007](../../adr/0007-camera-orbit-offset.md)) actually
  produces, and must not occlude the play area when several holes cluster.
- **FR-054** A swallow must produce a distinct announcement for the player when
  they are the eater or the eaten, routed through the existing announcement
  queue from [score-combo-and-hype](../score-combo-and-hype/) rather than a new
  channel, and inheriting its reduced-motion rule.
- **FR-055** The respawn countdown must be a non-modal overlay (FR-037), and
  the player's controls during death must not steer anything.
- **FR-056** A debug overlay, behind the existing debug flag, must show each
  bot's current target, current state (`seek` / `flee` / `hunt` / `stuck`), and
  difficulty row. Every balance conversation depends on it.
- **FR-057** Rival holes must be visually distinguishable from the player's
  hole at a glance, and must use the existing skin and `nameText` machinery
  rather than a new material path.

### 3.8 Fallback and configuration

- **FR-058** A match with one hole, a human driver and `MATCH_DURATION =
  Infinity` must be behaviourally identical to today's game. This is both the
  single-player fallback and the regression test for the refactor.
- **FR-059** Bot count must be selectable per session, with zero permitted, and
  the setting must persist.
- **FR-060** The default fleet must be **five or more bots of mixed
  difficulty**, per the owner ruling, with the mix defined as a data row per
  scene rather than a constant.
- **FR-061** All new constants must live in one exported block (§10). Nothing
  in this package may be inlined at a use site.

---

## 4. The multi-hole refactor

The sim's hidden coupling to one hole is the real work. Named explicitly so it
is not discovered late:

| Coupled system | Today | Under N holes |
|---|---|---|
| Removal / support zone | `_coverage`, `REMOVAL_FRAC` computed from `this.hole` | Union over all living holes; a cell is covered if any hole covers it |
| Zone proximity recalc | `_prevProx` — "zones inside the hole's influence radius on the previous recalc" | Per-hole proximity sets, recompute set is their union. The largest hidden cost in the refactor |
| Rim lean | `_leanSet`, and the renderer leans a block *toward the hole* | A block leans toward its nearest covering hole; the render matrix becomes a function of that hole |
| Retired-rubble index sweep | `_restIdx` swept by "the hole" each step | Swept once per living hole |
| Debris ordering | "farthest-from-the-hole first" | Farthest from the nearest hole; must stay a total order or determinism dies |
| Contact budget | "the `budget` blocks nearest the hole" | Budget split deterministically across holes, or the pass becomes frame-order dependent |
| Movement clamp | `this.bounds = 24` | Per-scene, and must widen for a fleet — Boston and Cambridge bounds were authored for one hole |
| Block consumption | one consumer assumed | Two rims over one voxel resolve to the lowest hole index; mass must never be counted twice |

**Two rules govern every one of these rows:** the resolution must be a total
order derived from hole index (never from iteration accident), and the result
with `holes.length === 1` must be bit-identical to today.

---

## 5. Phasing

**P1 — Multi-hole refactor and one greedy bot in the Sandbox.**
The refactor (FR-001…FR-014), the driver interface, per-slot RNG, and a single
`HARD` bot in `gallery`. No eating between holes, no clock, no goal change.
Exit gate: `holes.length === 1` reproduces today's game exactly, and a
one-bot match is deterministic across two runs.

**P2 — Hole-versus-hole eating and respawn.**
FR-026…FR-037. Still `gallery`, still untimed. Exit gate: an all-bot match runs
to a stable state with no NaN, no double-counted mass, and no respawn loop.

**P3 — The clock, the 100% goal amendment, and the match-end screen.**
FR-038…FR-049. Depends on the queued epsilon fix (FR-040). Exit gate: every
scene's goal reads 1.0, `PERFECT CLEAR` fires in `gallery`, and a timed match
ends with correct standings.

**P4 — The mixed-difficulty fleet and the Boston/Cambridge rollout.**
FR-015…FR-025 completed to four rows, FR-050…FR-061, per-scene fleet rows,
bounds widening, and the balance pass. Exit gate: a five-bot mixed match in
Cambridge is playable, performant, and the standings are not a foregone
conclusion in either direction.

**P5 — The peer-input seam handoff.**
No new gameplay. Confirm `peerDriver` can be implemented against the interface
without sim changes; write the handoff note into
[online-flywheel/04-netcode-design.md](../online-flywheel/04-netcode-design.md)
recording which of its assumptions this package satisfied and which it did not;
create ADR-0016 from the draft in [00](00-objective-overview.md). Exit gate:
online-flywheel's netcode work can begin without reopening `js/voxelsim.js`'s
hole model.

---

## 6. Verification

- **Validator (`tools/validate.mjs`).** The greedy driver moves out of the
  validator and into the sim; the validator imports it. New probes: a
  determinism probe (same tuple twice, identical finals), a slot-independence
  probe (adding a slot does not change another slot's decisions), an all-bot
  match-to-completion probe (no NaN, mass conserved, no respawn loop), a
  mass-conservation probe across swallows, and a per-scene pacing probe
  reporting what fraction a `MEDIUM` bot clears in `MATCH_DURATION`.
- **Regression.** The existing scripted `VOXEL_PATH` tour and every shipped
  voxel probe must pass unchanged with `holes.length === 1`.
- **Live.** Rival tag legibility, the readability of the leaderboard strip, the
  feel of `reactionTime`, and whether 180 s is the right number are all
  live-verify only. See [02-requirements.md](02-requirements.md) for the tags.

---

## 7. Performance budget

- Bot decision cost must be bounded by the re-pick cadence, not the frame rate:
  a whole-scene fallback scan may occur at most once per `repick` per bot.
- Six holes in Cambridge (72,943 blocks) must hold the frame budget the scene
  holds today with one hole. The union proximity recompute (§4) is the item to
  measure first, and it must be measured on a quiet machine with min-of-N, not
  a single timing.
- The leaderboard strip and rival tags must not allocate per frame.

---

## 8. Accessibility

- Relative size (FR-052) and the final-30-second timer state (FR-050) must
  never be encoded by colour alone.
- All new announcements inherit the reduced-motion rule shipped with
  [score-combo-and-hype](../score-combo-and-hype/).
- The respawn overlay must not flash, and its countdown must be readable text,
  not only a shrinking ring.

---

## 9. Non-goals restated as guard rails

If a proposed change requires any of these, it is out of scope and needs a new
decision: a navmesh; a bot that reads the player's score; a network call; a
build step; a new runtime dependency; a change to `js/sim.js`; a modal on
death; or a difficulty implemented as a branch rather than a row.

---

## 10. Tunable constants

One exported block. Provisional values; every one of them is expected to move
during P4's balance pass.

| Constant | Provisional | Notes |
|---|---|---|
| `MATCH_DURATION` | `180` s | **Owner-set 2026-08-10, explicitly tunable.** Genre norm is 120 s; set above it because Cambridge holds an order of magnitude more content than a Hole.io street grid. Playtest 120/180/300 in Cambridge (see [00](00-objective-overview.md)) |
| `DEFAULT_BOT_COUNT` | `5` | Owner ruling: "5+" |
| `SWALLOW_RATIO` | `1.25` | Radius ratio required to swallow another hole |
| `EATEN_MASS_TRANSFER` | `0.5` | Fraction of the eaten hole's `rawMass` transferred to the eater |
| `RESPAWN_DELAY` | `5` s | Owner: "a few seconds". Genre reference is 10 s |
| `RESPAWN_INVULN` | `1.5` s | Long enough to prevent a re-death loop, short enough not to be farmable |
| `BOT_DIFFICULTY` rows | see below | `{greedRadius, threatRadius, reactionTime, repick, aggression, speedScale}` |

Provisional difficulty rows:

| Row | greedRadius | threatRadius | reactionTime | repick | aggression | speedScale |
|---|---|---|---|---|---|---|
| `IDLE` | 20 m | 10 m | 1.2 s | 3.0 s | 0.0 | 1.0 |
| `EASY` | 35 m | 20 m | 0.8 s | 2.0 s | 0.2 | 1.0 |
| `MEDIUM` | 50 m | 35 m | 0.4 s | 1.0 s | 0.5 | 1.0 |
| `HARD` | 60 m | 50 m | 0.15 s | 0.5 s | 0.9 | 1.0 |

`HARD`'s `greedRadius` of 60 m is the validator's shipped greedy query radius
(`tools/validate.mjs:70`), preserved deliberately so the promoted driver starts
from a value that has been driving campaign levels to a win for months.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The refactor changes single-hole behaviour subtly | High | FR-058 plus the unchanged existing probes are the gate; a `holes.length === 1` diff against `git archive HEAD` is the honest baseline |
| Union proximity recompute blows the frame budget | High | Measure at P1 with one bot before any content work; the re-pick cadence is the lever |
| A bot reads as unfair rather than hard | Medium | `speedScale` stays at 1.0 for every shipped row (FR-024); difficulty comes from reaction and radius, which are legible |
| 180 s is the wrong number | Medium | Tunable by construction (FR-038); the 120/180/300 playtest in Cambridge is the check |
| 100% goals make maps read as unwinnable | Medium | FR-039 makes the end screen report achievement, not failure. The owner's longer-term answer is a power-up layer, surfaced as a pen in [00](00-objective-overview.md) and deliberately not specified here |
| The epsilon fix does not land | Medium | `PERFECT CLEAR` never fires; the match still ends correctly on the clock. Degraded, not broken |
| A bot's combo pulses the player's meter | Medium | FR-047, and a validator probe on event routing |

---

## 12. Amendments to existing normative docs

- **`docs/PRD.md` and every voxel scene:** `targetFraction` becomes `1.0` for
  `manhattan`, `upper-manhattan`, `brooklyn`, `boston` and `cambridge`
  (`gallery` is already 1.0), and the goal's meaning changes from a completion
  gate to a ceiling. FR-039.
- **[score-combo-and-hype/01-prd.md](../score-combo-and-hype/01-prd.md):** its
  scoring model is unchanged, but every field it introduced becomes per-hole,
  and its events gain an originating-hole field. FR-046, FR-047.
- **`js/save.js` (schema v16):** `bestCombo`/`bestScore` gain a match-type key.
  FR-048.
- **`AGENTS.md`:** the sim invariants gain "no hole state is written outside
  `sim.step()`", which is the checkable form of this package's load-bearing
  invariant and the precondition
  [ADR-0010](../../adr/0010-host-authoritative-arena.md)'s invariants 7–10
  assume.
- **New:** ADR-0016, drafted in [00](00-objective-overview.md), created at P5.
</content>
