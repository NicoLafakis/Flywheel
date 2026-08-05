---
covers:
  - "js/world3d.js"
  - "js/camera.js"
  - "css/**"
---
# Visual direction — closing the gap to the reference

Reference: `docs/references/Model City Expansion Game UI.png`.
Current state: flat solid-color boxes/cones, one directional light, no texture
detail, coarse grid. The gap is **not** one thing — it's five stacked layers,
in order of impact-per-effort:

**Scope note (2026-08-04):** this page tracks the in-world 3D visuals (city
geometry, textures, lighting, camera) below. Screen *chrome* — title, menus,
the READY gate — got its own visual-language pass separately: the
Flywheel brand layer (gold block wordmark, sprocket mark, orange CTA pill;
`css/main.css` `.fw-*`, `js/ui/blockword.js`, `js/ui/sprocket.js`) now covers
every screen, not just the gate. See `conventions.md` and
`adr/0005-shared-brand-layer.md`. That work does not move any of the stages
below — it closes the *screen-chrome* gap, not the *world-rendering* gap this
page is about.

## Stage 1 — Shape language (biggest win)

Reference buildings are *recognizable*: houses with gabled roofs, shops with
awnings, towers with window grids and parapet roofs.

- [x] **Level 1 (done 2026-07-31): procedural building kit** in `world3d.js` —
  house (gabled roof via custom prism geometry, chimney, door), shop (awning +
  sign band + parapet), tower (parapet + AC units + water-tank variants),
  landmark (columns + gold pediment). Archetype picked by tier + metro,
  variants derived from `o.id` (deterministic, no RNG stream changes).
- [ ] **Level 2: props pass** — cars with cabins + wheel discs, buses with
  window bands, better trees, benches, hydrants, streetlights, fences.

## Stage 2 — Surface detail (window grids, roads)

- **Canvas-generated textures** (no asset pipeline): draw a window grid onto an
  offscreen canvas per building archetype → `CanvasTexture`. 3–4 variants
  suffice; cache them. Seeded from the level RNG for variety.
- Roads: lane dashes, crosswalks at intersections, sidewalk borders — all
  canvas texture on the existing road planes. This alone sells "city" at the
  reference camera distance.
- Ground: subtle checker/noise variation per block type (asphalt, sidewalk,
  grass) via canvas texture.

## Stage 3 — Lighting & color grade

- Hemisphere light (sky/ground bounce) + softer key light; raise ambient.
- Slight saturation lift; per-metro palettes are already in `levels.js` —
  extend to roofs, roads, foliage hues.
- Optional cheap polish: fog matched to sky color, gentle vignette via CSS
  overlay. Skip SSAO/bloom post-processing until Stages 1–2 land.

## Stage 4 — Density & layout richness

- Reference has ~2–3× our visible prop count: street trees along roads, parked
  cars on curb lanes, corner plazas with fountains/gazebos, buses in traffic.
- All placement must stay inside `citygen.js`'s no-overlap guarantee — add
  *decor layers* (non-edible, purely visual, no tier) so density doesn't break
  the beatability math. Decor still goes through the spatial hash.
- Suburbs metro should bias houses; Downtown towers — archetype weights per
  metro (data is already in `METROS`).

## Stage 5 — Camera & motion feel

- Reference reads as near-isometric: raise base pitch (~55–60°), longer
  distance, narrower FOV (~35–40°) for the tilt-shift look.
- Squash-and-stretch on eats, tiny camera kick on tier-up, golden sparkle
  burst — all render-side only.

## Hard constraints (do not break while beautifying)

- Edibility/growth math unchanged — visuals must not alter `tier` footprints.
- `node tools/validate.mjs` ALL PASS after every stage.
- Deterministic: any new variety flows from the level RNG, never `Math.random()`.
- Perf: convert props to `InstancedMesh` per archetype if draw calls exceed
  ~800; eat animations then use per-instance matrix scale-to-zero.
