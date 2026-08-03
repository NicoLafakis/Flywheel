# STATUS.md — Hole City

Last updated: 2026-08-03

## Current state

**Campaign**: playable v1, mechanically complete. All 100 levels validated
`ALL PASS` (worst bot margin 46%). Level 1 visually close to reference
(verified by screenshot); other levels share the code but are unreviewed.

**Voxel Sandbox**: physics complete and playtest-tuned, two levels: the
city gallery (~3,800 blocks, ~30 object kinds in 7 districts) and **full
Lower Manhattan** (~25,800 blocks, asymmetric clamp x[-70,74] z[-84,54] —
WTC + 7 WTC + Oculus,
memorial pools, Woolworth, Wall St canyon + NYSE + Fed Reserve, Municipal
Building + courthouse, Chinatown rows, Tribeca lofts, Brooklyn Bridge
tower, Seaport + pier sheds + tall ship + heliport, Battery Park City +
marina, Castle Clinton, SI Ferry Terminal + orange ferry, Custom House).
5-class content kit (`js/voxelkit.js`: PROP/VEHICLE/SMALL_BLDG/LARGE_BLDG/
MEGA). Rim-driven excavation, persistent-damage crumble, loose-body contact
resolution (no clipping/spinning), SIZE-scaled hanging reach, SIZE-10
camera clears the tallest building. Validator covers determinism,
stability, a 56 s gallery tour, Manhattan overlap/idle/excursion checks
(WTC + expansion-district sweep).

## What works

- Core loop: eat → grow → unlock tiers (strict 1.35× 7-tier ladder), win/fail
- Deterministic seeded city gen (streets, blocks, parks, parking, waterfront)
- 100-level campaign, 5 metros, 4 mechanics on schedule (golden L6, rivals
  L21, tide L41, landmark L20 + finales + L91–100)
- Combos (×3 cap), star ratings, coins, shop (skins + clock/growth items)
- World map with locks/stars, results screen, mechanic intro cards
- Saves: localStorage schema v7, migrations v1→v7, quarantine
- Desktop (WASD/QE/RF) + mobile (joystick + touch orbit) controls
- Chase camera with building-occlusion pull-in
- **Voxel Sandbox** (see `.wiki/modules/voxel.md`): deterministic load-path
  support graph, rim-first crack wave, persistent damage + neighbor shock,
  chunks/debris by material bond, mass-scaled fall + size-scaled creak,
  damage heat tint, drive-mode steering + follow camera
- Sandbox gallery: tower, warehouse, house, shop, church, brownstone,
  apartment, parking garage, gas station, crane, containers, fountain,
  statue, water tower, elevated bridge + train, 8 vehicles, 16 street-furniture
  props, trees, crate pile
- Sandbox Manhattan (`js/voxelscene-manhattan.js`): One WTC + spire, twin
  memorial pools, Woolworth-style tower, glass slab tower, Wall St bank
  porticos, rooftop water tower, Trinity Church, City Hall, elevated train
  (viaduct + 3-car train), Battery Park, Charging Bull, ferry pier, street
  furniture, road/park/harbor decor planes
- Headless proof: `node tools/validate.mjs`

## Known gaps / next up

- Campaign: level-by-level visual review (level 2 next, once level 1 is
  signed off); crosswalks, moving traffic, roof variety, ground textures,
  fog/grade polish. No instancing in campaign yet (revisit > ~800 draw calls).
- Sandbox direction: more gallery objects from the city-object research
  (delivery/school bus, billboard, subway stairs proper, waterfront/pier,
  helicopter), density re-skins of existing buildings (tower at 0.5 m bricks),
  possibly moving traffic and living pedestrians. Driven by playtesting.
- Audio is placeholder blips.
- No unit tests beyond the validator; UI untested except smoke path.

## Recent history

- 2026-08-03: **Manhattan sandbox review pass**. The physics layer audited
  clean (0 ghost fine cells, 0 floaters, validator `ALL PASS`); every finding
  was in the derived/render-only data no test covered. Fixed: 13 missing
  `cameraBlockers` for the 6-9 m mid-rise band (Trinity, City Hall, NYSE,
  Custom House, Courthouse, Chinatown rows ×3, SE tenements, Seaport, Oculus,
  tall ship, and the 58 m-long El viaduct) plus one entry that understated its
  rooftop water tower by 2 m; `sceneDecor` extended with the peninsula (Duane
  St, Bayard St, two South St aprons, Battery Park green out to x 36, Pearl St
  no longer running through the park) and the harbor carved into five rects so
  Castle Clinton and the ferry terminal stand on land — the Castle Clinton
  park plane was being drawn over by the harbor and never rendered at all;
  Hudson marina basin + East River Seaport reach added so the moored boats and
  the tall ship float on water instead of asphalt; asymmetric `sim.boundsRect`
  replaces the square ±80 clamp (~36 m of dead harbor removed); the Battery
  Park hedge row rebuilt on a 0.5 m step (it was 13 isolated cubes); Municipal
  and Courthouse porticoes bridged to their facades and the Wall St bank
  colonnades evened to a 2 m pitch. Validator gained three anti-drift probes:
  per-footprint-cell camera-blocker coverage (≥ 6 m, matching the campaign's
  `world3d.js` cut), a SIZE ≥ 4 progression floor (the mass-scaled ladder is
  now ×10 and had nothing pinning it), and a decor draw-order check.
- 2026-08-02: **Full Lower Manhattan expansion + 5-class kit**. New
  `js/voxelkit.js`: the five object size classes (PROP 0.25 m / VEHICLE
  0.5 m / SMALL_BLDG / LARGE_BLDG / MEGA) with canonical builders extracted
  from `voxelsim.js` (vehicles) and `voxelscene-manhattan.js` (`tower()`);
  both scenes now build from the kit. Manhattan expanded ±40 → ±80,
  11,872 → 25,827 blocks: Seaport/piers/tall ship/heliport (E), Municipal
  Building + courthouse + Chinatown rows + Columbus Park + Tribeca lofts +
  Brooklyn Bridge tower (N), BPC towers + marina + pier shed (W), Fed
  Reserve + NYSE + offices (FiDi), 7 WTC + Oculus (WTC site), Castle
  Clinton + SI Ferry Terminal + orange ferry + Custom House (S). Every
  placement validated per the scene rules; the tower helper's column rule
  hardened (footprints ≥ 8 m need interior columns — an 8×8 masonry slab's
  center cell was 4 hops out once window panes punched the verticals).
  Loading overlay (`BUILDING CITY…`) covers the ~1.3 s scene build (was a
  silent freeze — persona P0). Validator gained a second scripted excursion
  (expansion-district sweep, 213 eaten). ALL PASS.
- 2026-08-02: **Hanging reach scales with hole radius** (playtest: the hole
  "affects buildings further out than the circle is"). The creak zone was
  `remR + span + 1.5` flat — up to ~5.5 m at SIZE 1, vs the ~1 m visible
  ring. Now `remR + (span + 1.5) × radius/6.6`: stress hugs the rim at
  small sizes (~0.5 m out), unchanged at max radius. Probes: intact
  building at 1.5 m/3 m pre-fails nothing (was rim-creak/facade-drop), and
  during excavation the stressed set tracks the current radius (max ~2.5 m
  at r 1.75). Validator ALL PASS.
- 2026-08-02: **Loose-body contact resolution + sleep rework** (playtest:
  blocks clipped through each other and spun in place near buildings).
  `js/voxelsim.js`: new `_resolveDebrisContacts` pass — AABB least-
  penetration separation between grounded/slow debris, sleepers, chunk
  members, and rain (2 relaxation rounds, padded fine-column buckets,
  deterministic pair order). Rim tip-over now requires the hole-facing edge
  to truly overhang the void; attraction only acts on airborne/sliding
  bodies (grounded blocks are exempt); debris sleeps anywhere once slow +
  contact-free (committed after the contact pass — never mid-overlap);
  `_restLoose` lets rubble serve as support so piles solidify bottom-up;
  chunk/debris tumble capped; repose threshold 0.75→1.25×s; recursive
  sleeper-wake crash fixed (`_topRemove` iterates a copy). Probes: frozen
  sleeper overlaps 0, resting overlaps transient-only, spinners 0.
  Manhattan excursion eats 1438 (was 1834 — piles no longer clip into the
  hole); validator ALL PASS.
- 2026-08-02: Sandbox camera see-over-any-building rule (`js/camera.js`):
  `setBlockers` caches the scene's tallest blocker (`maxBlockerH`) and the
  sandbox distance curve smoothstep-ramps from SIZE 4 (r 2.6) so that by
  SIZE 10 (r 5.6) the camera clears it (+8 m margin), clamped just above
  clearance through SIZE 12. Manhattan: ~84 m dist / ~66 m high at SIZE 10+
  (WTC is 58 m); gallery unchanged (no cameraBlockers). Validator ALL PASS.
- 2026-08-02: Hole ring render pass is now depth-test disabled (`depthTest: false`, `depthWrite: false`, `renderOrder: 999`) in both campaign (`js/world3d.js`) and voxel sandbox (`js/voxelworld.js`) — the hole's outer ring indicator remains visible through buildings and structures when occluded.
- 2026-08-01: Settings sliders gained measurement readouts: Turn sensitivity
  shows multiplier + actual turn rate (`0.15 · ~23°/s` — the user's optimal,
  2nd step from min) and Hole speed shows × + actual m/s at SIZE 1
  (`1.4× · ~9.9 m/s`, from `playerSpeedForRadius(1.1) = 7.1`).
- 2026-08-01: **Block-vs-block collision** for the voxel sandbox: a
  solid-surface heightmap (`_top`, per fine column: static + sleeping
  debris) replaces the flat ground plane for falling bodies — debris/chunks
  land on rooftops and stack into piles, an angle-of-repose slide spills
  steep piles outward (the requested "messy"), `_contact` probes make
  chunks shatter on facades + debris wall-scrape + hard hits smash-damage
  what they strike, and sleeping debris registers for wake-on-support-loss
  (piles stack, eaten bases drop what was on them). Probes: 24-block drop
  stacks + spills (not a flat carpet), roof landing at exactly roofTop+s/2.
  Tour eats dip ~5% (2044 vs 2152) as debris piles at rims — intended.
- 2026-08-01: Dev voxel-physics sliders in SETTINGS (schema v7): Gravity
  (26–130), Collapse wave (`WAVE_K` 0.05–1 s/m — higher = slower, more
  readable rim→center sweep), Creak delay (0.25–2× global `mat.delay`
  scale), Hole speed (0.7–3×), Attraction pull (0–20). Live-applied to the
  running sim via `sim.tune` (validator keeps constant defaults). Fixed a
  latent crash: `applySettings` called `world.setShadows` which
  VoxelWorld3D lacks — everything after it in the handler silently skipped
  (this is why live tuning never reached the sim).
- 2026-08-01: Voxel gravity 26 → 65 (2.5×) — playtest: falls read as
  floating. 10 m drop: steel 0.73 → 0.45 s, glass 1.06 → 0.68 s (density
  spread preserved). Harder impacts split/bounce/scatter more — spillier
  collapse, as requested. Tour eats slightly more (2125 → 2152), ALL PASS.
- 2026-08-01: New sandbox level — **Lower Manhattan** (`js/voxelscene-manhattan.js`,
  title → NYC: LOWER MANHATTAN). ~11,900 blocks in a ±40 m world: One WTC
  (3 setback tiers + spire), twin memorial pools, Woolworth-style tower,
  glass slab tower, Wall St bank canyon with porticos, elevated train
  (58 m viaduct + 3-car train), Trinity Church, City Hall, Battery Park +
  Charging Bull, ferry pier, full street-furniture/vehicle set. Engine grew
  a scene option: `bounds` per scene, render-only `sceneDecor` (roads/park/
  harbor), `cameraBlockers` for supertall occlusion, and the SIZE ladder
  scales with scene mass (gallery exactly ×1, Manhattan ×10 at its current
  43.5k mass — it was ×5 before the full-peninsula expansion). Bug-hunted via
  the new validator checks: El-through-tower overlap (ghost cells), lamps
  inside buildings, setback tiers topping out on wall rings (floating base
  slabs), interior-column grid math, El rails one cell past the deck edge,
  and Trinity 9 mm inside the hanging threshold (remR+span+1.5 ≈ 3.55 m).
