# Glossary

- **Flywheel** — the product name (rebranded 2026-08-04 from "Hole City"),
  tagline "A sprocket's story". The core eat-everything mechanic is still
  called "hole" throughout code, saves, and this glossary — only the product
  identity changed, not the vocabulary.
- **Block wordmark** — the shared gold slab-letter treatment (hard 8-direction
  outline ring + two-tone downward extrude + per-glyph tilt/stagger/bob),
  built once by `js/ui/blockword.js` (`buildBlockWord`) and rendered at two
  sizes: the landing screen's `FLYWHEEL` and the level-start gate's `READY?`.
  See `adr/0005-shared-brand-layer.md`.
- **Sprocket mark** — the rotating toothed-wheel brand mark
  (`js/ui/sprocket.js`, `buildSprocket`), 12 teeth, empty center. The hole in
  its middle is deliberate: the player is a hole, a sprocket is a toothed
  wheel with a hole in the middle, so the mark is a portrait of the
  protagonist, not an arbitrary logo shape.
- **Brand layer** — the unscoped `--fw-*` tokens and `.fw-*` CSS primitives in
  `css/main.css` that carry the block wordmark, sprocket, glow, sparkles, and
  CTA pill styling across every screen, extracted from what used to be
  `#ready-gate`-only rules. See `conventions.md` and `adr/0005`.
- **Tier** — one of 7 object size classes on the strict 1.35× radius ladder
  (`tiers.js`). T1 trash … T7 large building.
- **Edibility gate** — object is edible iff `playerRadius > tierRadius *
  1.12` (fit margin): the opening must physically fit the object. Near-miss
  props bounce off the rim; piles jam at `MAX_SWALLOW = 2` concurrent swallows.
- **Snack ring** — 12 guaranteed T1/T2 objects placed in a ring around spawn
  before any other placement, so the first eat lands in < 1 s.
- **Metro** — one of 5 themed areas of 20 levels (Suburbs, Downtown, Harbor,
  Neon District, Old Town).
- **Golden prop** — rare gold-tinted object worth 8× its tier mass.
- **Rival** — AI hole with a greedy nearest-edible policy; deterministic via
  level seed. Cannot eat or be eaten by the player.
- **Tide** — scheduled bounds-shrink event; objects outside are flooded
  (removed, no mass), holes are pushed inward.
- **Landmark / capstone** — shielded T7-scale object on finales and L91–100;
  shield drops at `unlockMass` player mass; worth `rewardMass`.
- **Combo** — eats within 1.5 s chain; mass multiplier `1 + 0.1·(chain−1)`,
  cap ×3.
- **Greedy bot** — the validator's player surrogate: steers at the nearest
  edible object. Levels must pass with ≥ 15% clock margin under it.
- **Save schema v7** — current `localStorage` shape (`hole-city-save`), adds
  dev voxel-tuning (`settings.voxGravity/voxWaveK/voxCreak/voxSpeed/voxAttract`)
  over v6; migrations v1→v7 in `save.js`. The `hole-city-save` key and the
  `hole-city-level-N` seed strings were deliberately NOT renamed in the
  Flywheel rebrand — renaming either would orphan existing player saves and
  re-roll every level's deterministic layout.
- **Crack front** (voxel) — BFS distance from solid support; unsupported
  blocks fail on a wave `WAVE_K × dist`, so collapse sweeps rim → center.
- **Hanging** (voxel) — a block supported only by a cantilever that reaches
  over the opening; accrues damage until it breaks.
- **Density vs size** (voxel) — an object's meter footprint (size) and the
  bricks that form it (0.25/0.5/1/2 m) are separate axes; objects can be
  re-skinned denser without changing footprints.
- **Ghost block** (voxel) — a block overwritten in the fine-cell grid by a
  later placement sharing its cells; unreachable by the support BFS, falls
  at spawn. Never place two blocks in one cell.
- **Chroma rule** (voxel palette) — masonry must be chromatic (high
  saturation), 21st-century cladding must be neutral (low saturation);
  brightness is free. Separates eras by chroma, not value — see
  `conventions.md`'s Palette section.
- **`logoTex`** — the raster partner-mark path in `js/skins.js` (a photo/PNG
  asset, brand hue baked into the texture), as opposed to the original
  `logo` traced-vertex-colour path. Wins over `logo` when a row has both.
  See `modules/render.md`.
- **`fullBleed`** — flag on a partner skin row saying its `logoTex` art runs
  to the edge, so `logoTexPart`'s ink-bounding-box scan (which assumes a mark
  on a dark surround) is skipped rather than misapplied. See
  `modules/render.md`.
