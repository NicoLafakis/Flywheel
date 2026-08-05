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

## Brand layer

- The gold block-letter/orange-pill visual language is unscoped, not
  per-screen: it lives in `css/main.css`'s `--fw-*` tokens and `.fw-*`
  primitives, plus `js/ui/blockword.js` (wordmark) and `js/ui/sprocket.js`
  (mark). Any screen wanting the game's look consumes these — never
  reimplement the outline-ring/extrude shadow stack locally. See
  `adr/0005-shared-brand-layer.md`.
- `js/ui/ready.js`'s `#ready-gate` is the visual reference; it must stay
  byte-identical on its computed styles. If a brand-layer edit needs to look
  different on the gate specifically, scope the override under
  `#ready-gate`, not by forking the shared class.
- No webfont, no CDN font, no new dependency for display type — the
  block-letter treatment is `text-shadow`/transform on the system font
  stack. This holds the line with the existing "no build step" architecture
  constraint.
- Wordmark letter tilt (`buildBlockWord`) derives from glyph index, never
  `Math.random()` — same rule as gameplay sim, extended to this decorative
  UI because `tools/validate.mjs` greps `js/` indiscriminately for the
  pattern.

## Saves

- Bump `CURRENT_VERSION` in `save.js` and add a `MIGRATIONS[oldV]` entry for
  every save-shape change. Never mutate old saves silently; quarantine on
  unparseable/future-version data.

## Wiki & status hygiene

- Update the covering `.wiki/modules/*.md` page and `STATUS.md` in the same
  commit as the code change.
- `STATUS.md` is a lean board (planned / doing / done), budget ≤ 5,000 tokens:
  a shipped item is ONE line there. The detailed dated entry goes in
  `CHANGELOG.md`; build narrative never accretes on the board.
- `covers:` globs must keep matching real paths.
- ADRs are append-only; supersede, never edit an accepted one.
