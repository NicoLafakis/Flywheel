# Conventions

## Hard rules (validator-enforced or review-blocking)

1. **No `Math.random()` in the pure-sim files** — all randomness there flows
   via `rng.js` (`RNG` class, seeded). Determinism is a product requirement
   (same seed → same level/scene). `tools/validate.mjs` enforces this on the
   seven named files (`rng`, `tiers`, `citygen`, `levels`, `sim`, `voxelsim`,
   `voxelkit`) **plus a glob over `js/voxelscene-*.js`** (2026-08-05) — every
   scene file is covered on sight, so a new scene can no longer ship unguarded
   the way Boston briefly did. The guard also fails hard if the glob ever
   matches zero files, so a silently-empty guard can't happen again.
   Deliberately **not** widened to all of `js/`: `camera.js` (screen shake) and
   `voxelworld.js` (facade/debris variation) use `Math.random()` on purpose for
   per-frame presentation that never touches sim state — sweeping those in
   would trade a real invariant for noise.
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

## Palette (voxel scenes)

- **The chroma rule.** When a scene mixes masonry with modern cladding,
  separate them by **chroma (saturation), not value (lightness)** — value
  cannot do this job. This replaced a value-based rule ("brick dark, precast
  light") that the Boston scene's own measurement inverted: de-veiled brick
  reads *lighter* than the eye expects (183 luminance) and actually
  out-luminances precast (167), so lightness cannot separate the two banks.
  Chroma survives the correction and is a wider gap than value ever was, and
  unlike value the sun cannot close it: masonry carries 46-78 points of
  saturation, 21st-century skin (precast, roof, glass) carries 9 or fewer,
  ashlar sits between the two at 19. Brightness is free — light or dark
  masonry both read as masonry as long as it's chromatic. Not a Boston-only
  fact; apply it to any scene mixing the two eras. See `modules/voxel.md`'s
  Boston section for the numbers this was measured from.
- **Provenance markers on every measured hex value.** Three classes, each
  behaving differently under a global rebase, so mixing them silently is how a
  palette rots:
  - `mm(hex)` — MEASURED, DE-VEILED. Sampled off a photograph, then corrected
    for atmospheric veil per channel on linear RGB: `(linear − 0.021) / 1.182`,
    clamped at zero. This is the value the sample would have been with no air
    between camera and wall — an albedo. Only these values may move under a
    global rebase.
  - `sp(hex)` — MEASURED, RAW, transform deliberately refused. For specular
    surfaces (water, curtain-wall glass) where de-veiling would strip
    atmosphere that legitimately belongs in the pixel: the renderer
    (`js/voxelsurfaces.js`) hands its PMREM environment probe to metals only
    (`spec.metal >= 1`), so a dielectric has nothing to reflect and its base
    colour has to carry the sky itself. If that metals-only rule is ever
    relaxed, every `sp()` value needs re-deriving with the veil correction
    applied — until then, leaving it raw is correct, not an oversight.
  - bare hex — AUTHORED by eye, in relation to a measured neighbour.
  - `PALETTE_TRANSFORM` (currently `null` in `js/voxelscene-boston.js`) is the
    seam: set it to a `(r,g,b) => [r,g,b]` function and every `mm()` value in
    the scene rebases in one shot, with no call-site edits. Left null on
    purpose — a scene reading brighter after de-veiling is a real, correct
    albedo result; the exposure/look call belongs against a render, not a
    spreadsheet.
  - When rebasing a palette, grep for the palette *key*, not the hex literal —
    six superseded Boston values were still hardcoded at builder default
    parameters and one-off call sites after a rebase, invisible to a key grep,
    which is exactly the failure mode a global transform exists to prevent.

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
