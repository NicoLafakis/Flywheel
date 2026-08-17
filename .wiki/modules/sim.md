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
- `growthBonus` (shop `growth5` item, plus 2026-08-15's `growth` stat-upgrade
  track via `upgradeMultiplier(save.upgrades?.growth)`) is computed in
  `main.js` and passed into the `Sim` constructor as `options.growthBonus`,
  which stores it on `this.growthBonus` (`sim.js:135`) — beatability proof
  assumes it's absent; keep it that way. **As of this pass, `this.growthBonus`
  is written and never read anywhere else in `sim.js`.** The mass gained per
  eat (`completeEat`) is `obj.mass * goldenMult * comboMult * frenzyMult` —
  no `growthBonus` term. The old dead `* (1 + this.growthBonus * 0)` speed
  line this gotcha used to describe is gone from the file entirely, not fixed
  into a live multiplier; the net effect (no growth bonus in campaign play) is
  unchanged, but the "intentionally zeroed" framing no longer matches what is
  on disk. Contrast `js/voxelsim.js`, where the equivalent upgrade IS wired
  (`h.growthMult` from the same `upgradeMultiplier(upgrades?.growth)`,
  multiplied into `effectiveRaw` in the consumption path) — so the shop's
  growth item and the growth stat-upgrade rank currently do something in the
  voxel sandbox and nothing in the 100-level campaign, which is a real
  asymmetry worth checking before trusting either surface's growth-upgrade
  copy in the shop UI.
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
