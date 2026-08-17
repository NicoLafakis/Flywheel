# AI Players — Requirements

**Status:** planning

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md)

User stories with Given/When/Then acceptance criteria. This is the contract
verification checks against: if a behaviour is not written here, it is not
verified. Each criterion is tagged:

- **[V]** checkable in `tools/validate.mjs` or a headless Node run of the sim
- **[L]** live-verify only — a human, or a browser-driven pass, looking at it

This package was never blocked on a backend: every **[V]** criterion can be
executed today with the existing headless harness. (The original contrast
here was with party-mode, which was retired along with the legacy
multiplayer stack; see [multiplayer](../multiplayer/README.md) for its
shipped replacement.)

---

## US-01 — As a player, I drop into a city with rivals in it

**Given** I start a voxel sandbox match with the default settings
**When** the scene loads
**Then** five or more rival holes are present, visibly moving and eating, each
with a name. **[L]**

- **AC-01.1 [V]** `sim.holes.length` equals `1 + configuredBotCount`, and the
  default bot count is at least 5.
- **AC-01.2 [V]** `sim.holes[0].isPlayer` is true and every other hole's is
  false.
- **AC-01.3 [V]** Every hole has a distinct `index`, `name` and `skinId`.
- **AC-01.4 [V]** No two holes are placed within `SWALLOW_RATIO × radius` of
  each other at match start.
- **AC-01.5 [V]** The fleet's difficulty mix comes from a per-scene data row,
  not a constant, and contains at least two distinct difficulty rows.
- **AC-01.6 [L]** Rival holes are distinguishable from mine at a glance at the
  camera distances the shipped orbit camera produces.

## US-02 — As a returning solo player, the game I had still exists

**Given** I set the bot count to zero
**When** I play the scene I played yesterday
**Then** the game behaves exactly as it did before this package. **[L]**

- **AC-02.1 [V]** With `holes.length === 1`, a human driver and
  `MATCH_DURATION = Infinity`, the scripted `VOXEL_PATH` tour produces
  identical final `mass`, `rawMass`, `eatenCount`, `peakChain` and block counts
  to the pre-refactor build. The baseline must be derived from
  `git archive HEAD` into a scratch tree, not from an earlier run in the same
  working tree.
- **AC-02.2 [V]** Every existing voxel validator probe passes unchanged.
- **AC-02.3 [V]** The bot-count setting persists across a reload.
- **AC-02.4 [V]** With zero bots, no driver other than `human` is constructed
  and no bot code path executes.
- **AC-02.5 [V]** The campaign sim (`js/sim.js`, `LEVELS`) is untouched and all
  campaign probes pass unchanged.

## US-03 — As the sim, every hole is driven through one interface

**Given** a match with a human and several bots
**When** the sim steps
**Then** every hole's movement comes from its driver's `decide()` and from
nowhere else. **[V]**

- **AC-03.1 [V]** `sim.step(dt)` takes no steering argument after P1.
- **AC-03.2 [V]** No hole field is mutated by any file outside `js/voxelsim.js`
  — verified by grep over the render, HUD, input and debug paths for writes to
  hole fields.
- **AC-03.3 [V]** A test driver returning a fixed intent moves its hole exactly
  as the human driver would with the same intent.
- **AC-03.4 [V]** The driver list is open: registering a fourth driver kind
  requires no change to the sim.
- **AC-03.5 [V]** `sim.hole` returns `sim.holes[0]` and is marked for removal.

## US-04 — As the project, a match is exactly reproducible

**Given** a seed, a scene, a match config and a recorded human input trace
**When** the match is replayed
**Then** it produces the identical outcome, every time. **[V]**

- **AC-04.1 [V]** Two runs of the same tuple produce identical final `mass`,
  `rawMass`, `eatenCount` and `kills` for every hole.
- **AC-04.2 [V]** The two runs produce an identical event sequence, including
  ordering.
- **AC-04.3 [V]** Adding a sixth bot does not change any decision made by bots
  0–4.
- **AC-04.4 [V]** Reordering the slot roster does not change any individual
  slot's stream.
- **AC-04.5 [V]** Running the same match at 30 Hz, 60 Hz and with the
  fixed-timestep catch-up forced produces identical outcomes.
- **AC-04.6 [V]** No sim-path file added or changed by this package contains
  `Math.random`, `Date.now`, or `performance.now` — the existing conventions
  probe covers this and must be extended to the new files.

## US-05 — As a bot, I hunt the nearest thing I can eat

**Given** I am a bot with objects in range
**When** I decide
**Then** I steer toward the nearest object I can currently swallow. **[V]**

- **AC-05.1 [V]** A bot never targets an object it cannot swallow at its
  current radius, using the same predicate the player's hole uses.
- **AC-05.2 [V]** A bot placed among a known object layout selects the nearest
  swallowable one.
- **AC-05.3 [V]** A bot keeps its target between re-picks and re-picks on the
  `repick` cadence in sim seconds.
- **AC-05.4 [V]** A bot re-picks immediately when its target is consumed by any
  hole.
- **AC-05.5 [V]** A whole-scene fallback scan occurs at most once per `repick`
  per bot; a per-step whole-scene scan fails this criterion.
- **AC-05.6 [V]** A bot wedged against geometry detects the stall and re-picks
  a different target within a bounded time.
- **AC-05.7 [V]** A `MEDIUM` bot left alone in `gallery` for `MATCH_DURATION`
  consumes a non-trivial fraction of the scene — the pacing probe reports the
  number rather than asserting a magic threshold.

## US-06 — As a bot, I run from holes that can eat me

**Given** a hole capable of swallowing me is within `threatRadius`
**When** I decide
**Then** I steer away from it, overriding my current target. **[V]**

- **AC-06.1 [V]** The flee intent points away from the threat.
- **AC-06.2 [V]** The override persists for at least `reactionTime` after the
  threat leaves range, so the bot does not oscillate on the boundary.
- **AC-06.3 [V]** A bot never hunts a rival while fleeing.
- **AC-06.4 [V]** An `IDLE` bot (`aggression 0`) still flees — survival is not
  gated on aggression.
- **AC-06.5 [L]** The flee reads as an opponent reacting, not as a bot
  teleporting its intent.

## US-07 — As a difficulty setting, I am a row of numbers

**Given** four shipped difficulty rows
**When** the brain runs
**Then** the only difference between an `EASY` and a `HARD` bot is the row.
**[V]**

- **AC-07.1 [V]** There is exactly one bot brain function; no branch on a
  difficulty name exists anywhere in it.
- **AC-07.2 [V]** The difficulty table is exported from `js/voxelsim.js`
  alongside the scoring tables.
- **AC-07.3 [V]** A `HARD` bot beats an `EASY` bot on final score in a
  controlled head-to-head over many seeds, by a margin the probe reports.
- **AC-07.4 [V]** Every shipped row has `speedScale === 1.0`.
- **AC-07.5 [V]** A bot's applied intent lags its decision by `reactionTime`.
- **AC-07.6 [V]** Adding a fifth row requires no code change outside the table.

## US-08 — As a bigger hole, I swallow a smaller one

**Given** my radius is at least `SWALLOW_RATIO` times a rival's and I reach it
**When** the sim steps
**Then** I swallow it, gain mass, and my combo advances. **[V]**

- **AC-08.1 [V]** `canSwallow` is the only expression of the rule; grep finds
  no second comparison of two holes' radii for this purpose.
- **AC-08.2 [V]** Two holes of equal radius never swallow each other, in either
  order.
- **AC-08.3 [V]** Mutual swallowing in one step is impossible for any radius
  pair.
- **AC-08.4 [V]** Pair resolution is index-ordered and a hole eaten in a step
  does not eat in that step.
- **AC-08.5 [V]** The eater's `rawMass` increases by exactly
  `EATEN_MASS_TRANSFER × victim.rawMass`, and total system mass is conserved
  (no mass is created).
- **AC-08.6 [V]** The eater's chain advances by one and `chainTimer` refreshes,
  identically to a block eat.
- **AC-08.7 [V]** The eater's `kills` increments; the victim's `kills` and
  banked `mass` are preserved.
- **AC-08.8 [V]** A hole inside its `invulnUntil` window cannot be swallowed.
- **AC-08.9 [L]** Eating a rival is unmistakable on screen and reads as the
  biggest thing that has happened in the match so far.

## US-09 — As the eaten player, I come back

**Given** a bigger hole swallowed me
**When** `RESPAWN_DELAY` elapses
**Then** I respawn small, somewhere useful, briefly safe. **[L]**

- **AC-09.1 [V]** On death, `alive` is false, `respawnAt` is set, and the hole
  stops moving, eating and contributing to the support graph.
- **AC-09.2 [V]** On respawn, `radius === START_RADIUS`, `rawMass === 0`,
  `size === 1`, `chain === 0`, `alive` is true, and `invulnUntil` is set.
- **AC-09.3 [V]** Banked `mass`, `bestCombo` and `kills` survive the death.
- **AC-09.4 [V]** The hole's `index` is unchanged across death and respawn, and
  its RNG stream is unchanged.
- **AC-09.5 [V]** Respawn placement is deterministic from the seed, is never
  inside another hole's radius, is never outside `bounds`, and prefers cells
  with remaining unconsumed mass.
- **AC-09.6 [V]** No respawn loop is possible: an all-bot match run to
  completion never produces a hole dying more than a bounded number of times
  per minute.
- **AC-09.7 [L]** The respawn countdown is a non-modal overlay; the city stays
  visible and the camera keeps showing the world, so the dead player can scout.
- **AC-09.8 [V]** Controls during death steer nothing.

## US-10 — As a player, I race a clock

**Given** a timed match
**When** the clock runs out
**Then** the match ends and I am ranked. **[L]**

- **AC-10.1 [V]** `MATCH_DURATION` is read from the constants block; grep finds
  no inlined duration anywhere.
- **AC-10.2 [V]** The clock advances on sim time only; a stalled or
  backgrounded frame loop does not consume the match.
- **AC-10.3 [V]** At expiry `over` is true, all holes freeze, a `matchEnd`
  event carries the ordered standings, and no driver intent is applied
  afterwards.
- **AC-10.4 [V]** `MATCH_DURATION = Infinity` yields an untimed match with no
  clock behaviour.
- **AC-10.5 [L]** The timer is legible, and its final-30-second state is
  distinguishable without relying on colour.

## US-11 — As every map, my goal is the whole city

**Given** any voxel scene
**When** I read its goal
**Then** it asks for 100% and the match ends on the clock, not on the goal.
**[V]**

- **AC-11.1 [V]** Every voxel scene's `targetFraction` is `1.0`.
- **AC-11.2 [V]** Milestone events fire against the goal fraction and, at
  `targetFraction 1.0`, the last milestone lands exactly on a full clear.
- **AC-11.3 [V]** `PERFECT CLEAR` fires when the city is fully consumed —
  **this criterion depends on the queued epsilon fix to the win check and will
  fail until that lands.** Its failure must be attributed there, not here.
- **AC-11.4 [L]** The match-end screen reports the achieved fraction as an
  achievement, with placement, and never as a failure.
- **AC-11.5 [V]** With the epsilon fix absent, the match still ends correctly
  on the clock with correct standings — degraded, not broken.

## US-12 — As a player, I always know who is bigger than me

**Given** rivals on screen
**When** I look at one
**Then** I can tell instantly whether to eat it or run. **[L]**

- **AC-12.1 [L]** Every rival carries a world-space name and relative-size tag.
- **AC-12.2 [V]** The relative-size signal is encoded redundantly and never by
  colour alone.
- **AC-12.3 [L]** Tags are legible at the camera distances the shipped orbit
  camera produces, across a full orbit.
- **AC-12.4 [L]** Several holes clustered together do not produce a wall of
  overlapping tags that occludes the play area.
- **AC-12.5 [L]** The leaderboard strip is readable during play and does not
  visibly thrash as scores tick.
- **AC-12.6 [V]** Neither the tags nor the strip allocate per frame.

## US-13 — As a player, my meters are mine

**Given** bots eating and comboing constantly
**When** I watch my HUD
**Then** nothing on it reflects anyone's hole but mine. **[V]**

- **AC-13.1 [V]** Every combo, growth and milestone event carries its
  originating hole.
- **AC-13.2 [V]** A bot reaching combo level 8 produces no change in the
  player's combo meter, score meter, or announcement queue.
- **AC-13.3 [V]** Persisted `bestCombo`/`bestScore` record the local player's
  figures only, under a match-type key that separates timed multi-hole runs
  from solo untimed runs.
- **AC-13.4 [V]** A swallow announcement fires for the player only when they
  are the eater or the eaten.
- **AC-13.5 [L]** With reduced motion enabled, every new announcement obeys the
  shipped reduced-motion rule.

## US-14 — As a developer, I can see why a bot did that

**Given** the debug flag is on
**When** I watch a match
**Then** I can read each bot's target and state. **[L]**

- **AC-14.1 [L]** The overlay shows, per bot: current target, state (`seek` /
  `flee` / `hunt` / `stuck`), and difficulty row.
- **AC-14.2 [V]** The overlay is inert with the flag off and writes nothing to
  any hole.
- **AC-14.3 [V]** An all-bot match runs to completion headlessly with no NaN in
  any hole field, no negative mass, and no block consumed twice.
- **AC-14.4 [V]** The per-scene pacing probe reports what fraction a `MEDIUM`
  bot clears in `MATCH_DURATION` for `gallery`, `boston` and `cambridge`.
- **AC-14.5 [V]** Six holes in Cambridge hold the frame budget the scene holds
  today with one hole, measured min-of-N on a quiet machine rather than from a
  single timing.
</content>
