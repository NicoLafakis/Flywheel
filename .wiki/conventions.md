# Conventions

## Hard rules (validator-enforced or review-blocking)

1. **No `Math.random()` in `js/`** — all randomness via `rng.js` (`RNG` class,
   seeded). Determinism is a product requirement (same seed → same level).
2. **No three.js or DOM imports in the pure sim** (`rng.js`, `tiers.js`,
   `citygen.js`, `levels.js`, `sim.js`, `voxelsim.js`). The Node validator
   imports these.
3. **Fixed timestep** — gameplay state changes only inside `sim.step(1/60)`.
   Render-side animation uses real `dt` and never touches sim state.
4. **Single source of truth for size/edibility** — always `tiers.js`
   (`radiusForTier`, `playerRadiusForMass`, `isEdible`). Never re-derive the
   1.35× ladder inline.
5. **Placement goes through the tile funnel** — `place()` in `citygen.js`:
   snap to tile center, circle-overlap check, allowed-tile check, reserve.
   Never set coordinates directly (exceptions: the landmark's documented
   eviction path, and the snack ring's candidate-offset walk, which still
   goes through `place()`).

## Style

- ES modules, one class or cohesive function set per file, no build tooling.
- `camelCase` functions/vars, `PascalCase` classes, `SCREAMING_CASE` constants.
- Comments explain *why* (invariants, tuning rationale), not *what*.
- Shared three.js geometry/material through the caches in `world3d.js`;
  do not allocate per-frame in hot paths.

## Saves

- Bump `CURRENT_VERSION` in `save.js` and add a `MIGRATIONS[oldV]` entry for
  every save-shape change. Never mutate old saves silently; quarantine on
  unparseable/future-version data.

## Wiki & status hygiene

- Update the covering `.wiki/modules/*.md` page and `STATUS.md` in the same
  commit as the code change.
- `covers:` globs must keep matching real paths.
- ADRs are append-only; supersede, never edit an accepted one.
