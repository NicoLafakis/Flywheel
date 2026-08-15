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

## Stage 1 — Shape language (completed 2026-07-31)

Reference buildings are *recognizable*: houses with gabled roofs, shops with
awnings, towers with window grids and parapet roofs.

- [x] **Level 1 (done 2026-07-31): procedural building kit** in `world3d.js` —
  house (gabled roof via custom prism geometry, chimney, door), shop (awning +
  sign band + parapet), tower (parapet + AC units + water-tank variants),
  landmark (columns + gold pediment). Archetype picked by tier + metro,
  variants derived from `o.id` (deterministic, no RNG stream changes).
- [x] **Level 2 (done 2026-08-14): props pass** — cars with chassis, cabins, tinted
  glass, wheels, headlights/taillights; buses with tinted window strips and roof caps;
  tiered evergreen conifer and lush deciduous trees; hydrants, street lamps, park benches,
  and kiosks/bollards.

## Stage 2 — Surface detail (completed 2026-08-14)

- [x] **Canvas-generated textures**: 4 architectural facade styles (punched office grid,
  modern ribbon glass, residential double-hung 4-pane sash windows with stone sills,
  mixed-use storefronts) drawn onto offscreen canvases and cached per `(color, floors, variant)`.
- [x] **Roads**: 256x256 high-contrast canvas texture with aggregate noise, sidewalk flagstones,
  stone curbs with depth shadows, and dashed centerline lane markers.
- [x] **Ground & Pads**: Subtle procedural textures per block type (`yardTexture` with lawn mower
  striping, `lotTexture` with painted parking stalls, `padTexture` with paver expansion joints).

## Stage 3 — Lighting & color grade (completed 2026-08-14)

- [x] **Hemisphere & Ambient**: Elevated sky/ground bounce light (0.65 day, 0.4 night) and ambient fill (0.52 day, 0.35 night).
- [x] **Key Light**: Warm soft directional sun (0xfffaed, 0.98 intensity) with soft PCF shadow maps.
- [x] **Atmospheric Depth Fog**: Distance fog calibrated to sky palette across day and night themes.
- [x] **Peripheral Vignette**: Smooth CSS radial vignette on `#app::after` adding cinematic focus.

## Stage 4 — Density & layout richness (completed 2026-08-14)

- [x] **Detailed Vehicles**: Multi-part sedans (chassis, cabin, tinted glass, 4 wheels with silver hubs, headlights, taillights) and transit buses with wrap-around tinted window bands and roof caps.
- [x] **Street Props**: Varied street furniture (fire hydrants with side nozzles, cast-iron street lamps with emissive luminaire heads, wooden park benches with metal legs, postal drop boxes / kiosks).
- [x] **Botanical Diversity**: Tiered conical conifers and dual-cluster deciduous trees with lush foliage tones.

## Stage 5 — Camera & motion feel (completed 2026-08-14)

- [x] **Near-Isometric Perspective**: Elevated base pitch to 0.98 rad (~56.1°) and tightened FOV to 45° for optical tilt-shift compression and enhanced street-grid readability.
- [x] **Squash-and-Stretch on Eats**: Elastic procedural scale deformation (compression along horizontal towards hole center, vertical elongation into the void) on falling objects in `world3d.js`.
- [x] **Tactile Bite Pulse**: Hole mesh pulses/recoils on object ingestion.
## Stage 6 — Power-Up Auras & Atmospheric Screen Juiciness (completed 2026-08-14)

- [x] **In-World Active Power-Up Auras**: Dynamic glowing ground projection rings on the hole (`vortexAura`, `titanAura`, `frenzyAura`), speed drift motion sparks (`spawnSpeedDriftSpark`), rising heat embers (`spawnHeatEmber`), and vortex suction particles (`spawnVortexDustParticle`).
- [x] **Inner Void Accretion Depth**: Hypnotic rotating 3-arm logarithmic spiral depth texture (`voidSwirlTexture()`) inside the void disc providing gravitational visual depth.
- [x] **Demolition & Structural Dust Poofs**: Soft low-poly voxel dust clouds expanding and dissipating on large building topples, capstone eats, and seismic quakes.
- [x] **Dynamic Peripheral Screen FX**: Smooth CSS viewport edge heat glows reflecting combo ladders (`combo-lvl-4`, `combo-lvl-6`, `combo-lvl-8`) and active power-up states (`pu-vortex-active`, `pu-titan-active`, `pu-frenzy-active`).
- [x] **Tactile Haptics**: Native `navigator.vibrate` integration delivering crisp micro-haptic feedback on bites, power-up collections, landmark swallows, and quake detonations.

## Hard constraints (verified)

- Edibility/growth math unchanged — visuals do not alter `tier` footprints.
- `node tools/validate.mjs` ALL PASS across all 9 parallel test suites.
- Deterministic: all procedural variety flows from seeded object IDs and levels, never `Math.random()`.

