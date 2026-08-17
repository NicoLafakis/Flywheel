---
covers:
  - "js/sim.js"
  - "js/tiers.js"
  - "js/rng.js"
---
# Sim (pure simulation core)

## Purpose

Runs the entire game ruleset with zero rendering/DOM dependencies so the Node
validator can prove levels beatable on the exact shipping code.

## Key Files

| File | Purpose |
|------|---------|
| `js/sim.js` | `Sim` class: holes, eating, combos, tides, landmark, win/fail |
| `js/tiers.js` | 7-tier 1.35× ladder, growth curve, edibility gate, speed curve |
| `js/rng.js` | `hashString`, `mulberry32`, `RNG` — all randomness |

## Talks To

- **citygen.js** — builds the city at construction; sim only mutates `eaten`
  flags, bounds, and hole state
- **powerups.js** — `Sim` imports `POWERUP_TYPES`, `hasActivePowerUp`,
  `MAX_MAP_POWERUPS`, `MIN_POWERUP_SEPARATION` and
  `findSpacedPowerUpLocation` for campaign power-up spawning/consumption
  (Titan Surge pins `hole.radius` to `PLAYER_MAX_RADIUS`, Chrono Freeze raises
  `maxSwallow` from 2 to 4, Chain Frenzy adds a growing multiplier on top of
  `comboMultiplier`)
- **world3d.js** — consumes `drainEvents()` (`eat`, `flooded`, `tide`,
  `unlocked`, `win`, `fail`)
- **tools/validate.mjs** — drives `Sim` directly with a greedy bot

## Gotchas

- `step(dt)` must only ever be called with `1/60` (fixed timestep; rival
  retarget cadence and deterministic replays depend on it).
- **Combo multiplier is campaign-only math and does not match the sandbox.**
  `comboMultiplier(chain)` here (`sim.js:11-13`) is
  `min(3, 1 + 0.1·(chain − 1))`, reaching the 3× cap at chain **21**. The
  voxel sandbox's own curve, `comboMult` in `voxelsim.js`, reaches the same 3×
  cap at chain **501** — a chain 25× longer, because it steps in 25-chain
  bands instead of per-chain. They read the same on paper ("a combo
  multiplier capped at 3×") but are not the same tuning; do not port one
  file's constant into the other expecting parity. See
  `.wiki/features/score-combo-and-hype/00-objective-overview.md`, which is
  what surfaced the gap and proposes reconciling the two curves (planning
  only — neither file has changed for it).
- **Fit & throughput model** (2026-07-31): edibility is
  `hole.radius > tier.radius * FIT_MARGIN` (1.12) — the hole opening must fit
  the object, not just out-class it. Movable props (tier ≤ 4) that touch the
  mouth without fitting **bounce off the rim** (velocity + damping, hash
  re-homed via `hash.update`). Eating is queued: `MAX_SWALLOW = 2` concurrent,
  duration `0.22 + 0.4·min(1, objR/holeR)` — piles jam at the rim. Committed
  objects are `obj.committed` and eaten at queue completion (`completeEat`).
  Tunables live at the top of `sim.js`; the validator's margin gate is the
  guardrail if you loosen/tighten them.
- Events: `enter` (swallow start → tip-fall anim), `eat` (completion → mass),
  `bounce` (rim rejection → position sync + hop). Rivals emit them too;
  sound/toast is player-only.
- **Growth bonus** (T-702/T-703, 2026-08-16): the `growth` stat-upgrade track
  (`Mass Assimilator`, 20 ranks, 27,195 coins to max) is the whole of this
  number. `main.js` computes it as
  `(upgradeMultiplier(save.upgrades?.growth) - 1.0)` — a FRACTION, not a
  multiplier — and passes it as `options.growthBonus`; the constructor stores
  it on `this.growthBonus` (default 0). The legacy `growth5` shop item (500
  coins) is **not** a second, independent term: the v20 migration
  (`__MIGRATIONS[19]` in `js/save.js`) converts owning it into
  `upgrades.growth >= 1`, and rank 1 already IS its +5%, so a `growth5` clause
  added on top paid one purchase twice — +10% in the campaign against the +5%
  the same save gets in a city, since `VoxelSandboxSim` derives `growthMult`
  from `save.upgrades` alone and never reads `ownedItems`. The migration is the
  single source of truth for that item; see `.wiki/modules/campaign.md`.
  `completeEat` reads the bonus:
  `effectiveRaw = obj.mass * goldenMult * (1 + sim.growthBonus)`, then
  `gained = effectiveRaw * comboMult * frenzyMult`. Four properties are load-
  bearing and each has an assertion in `tools/economy-consistency.test.mjs`:
  (1) growth scales the RAW bite BEFORE the combo, the same shape as
  `_award`'s `effectiveRaw = raw * h.growthMult` in `js/voxelsim.js`, so a
  combo multiplies an already-boosted bite instead of compounding a second
  bonus; (2) it is gated on `hole.isPlayer`, matching the sandbox's
  `isPlayer ? this.growthMult : 1.0` — rivals never inherit a purchase;
  (3) at `growthBonus === 0` the run is bit-identical to `new Sim(level)`, so
  the beatability proof still measures an un-upgraded game; (4) a migrated
  `growth5` owner gets +5% total, equal at every rank to what the same save
  grows by in the sandbox. Until this pass `this.growthBonus` was written and
  never read, so the growth purchase was live in the voxel sandbox and a pure
  coin sink across all 100 campaign levels; the shop copy ("Mass gained is 5%
  higher", "+% Mass Boost") described the sandbox only. Nothing about the bonus
  is persisted — it is recomputed from the save's `upgrades` on every
  `startLevel()`, so an existing save needed no migration and an
  already-purchased rank started working the moment this shipped.
- `COMBO_WINDOW = 10.0` (`sim.js`, shared value with `voxelsim.js`) is the
  window a chain survives without a new eat before it resets; it was 1.5 s at
  the score-combo-and-hype package's original 2026-08-10 ship and widened to
  10.0 s on 2026-08-16 to give players more room to cross streets between
  eats without breaking a chain. `COMBO_MAX_MULT` (the 3× campaign cap) is
  unchanged.

**Planned, not built:** the scoreboards-and-profiles package proposes
replaying this module server-side to validate every leaderboard score before
it's trusted, which makes cross-engine float determinism (browser vs. Node) a
security property rather than just a validator nicety. See
[scoreboards-and-profiles/04-anti-cheat.md](../features/scoreboards-and-profiles/04-anti-cheat.md)
and [ADR-0012](../adr/0012-replay-validated-leaderboard-trust.md). (This
proposal originated in the online-Flywheel package's netcode design, which
was retired along with the legacy multiplayer stack; scoreboards-and-profiles
carries it forward for the solo-run leaderboard scope.) Nothing here has
changed yet.
