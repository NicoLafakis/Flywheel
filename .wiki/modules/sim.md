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
- **world3d.js** — consumes `drainEvents()` (`eat`, `flooded`, `tide`,
  `unlocked`, `win`, `fail`)
- **tools/validate.mjs** — drives `Sim` directly with a greedy bot

## Gotchas

- `step(dt)` must only ever be called with `1/60` (fixed timestep; rival
  retarget cadence and deterministic replays depend on it).
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
- `growthBonus` (shop item) is applied to gain in `main.js`'s level clone —
  beatability proof assumes it's absent; keep it that way.
- **`sim.js:164`'s speed line is dead by design, not by bug:**
  `playerSpeedForRadius(p.radius) * (1 + this.growthBonus * 0)` — the `* 0`
  means the shop's growth item has never affected speed (found and
  deliberately left alone 2026-08-05; what it should actually buy is a
  game-feel decision, not a fix). Don't "clean up" the `* 0` without checking
  whether that decision has since been made.

**Planned, not built:** the online-Flywheel package
(`.wiki/features/online-flywheel/`) proposes replaying this module
server-side to validate every leaderboard score before it's trusted, which
makes cross-engine float determinism (browser vs. Node) a security property
rather than just a validator nicety. See
[04-netcode-design.md](../features/online-flywheel/04-netcode-design.md) and
[ADR-0012](../adr/0012-replay-validated-leaderboard-trust.md). Nothing here
has changed yet.
