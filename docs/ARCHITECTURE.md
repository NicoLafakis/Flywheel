# Architecture

Plain ES modules, no build step. Three.js loads from a CDN importmap. The same
simulation modules run **both** in the browser (rendered) and in Node
(headless validator) — rendering is a thin layer on top of a pure sim.

```
index.html                 entry, importmap, UI overlay roots
css/main.css               HUD, menus, world map, shop, results
js/
  main.js                  boot, screen state machine, game loop glue
  rng.js                   hashString, mulberry32, RNG helpers (pick, range, shuffle)
  tiers.js                 7-tier ladder, growth curve, edibility gate
  save.js                  localStorage load/save, schema v7 + migrations v1→v7
  levels.js                100-level campaign table (metros, seeds, targets, mechanics)
  citygen.js               deterministic district layout: streets, blocks, parks,
                           parking lots, waterfront; prop/building placement with
                           no-overlap rejection sampling; snack ring at spawn
  sim.js                   pure simulation: player, rivals, eating, combos, tides,
                           landmark shield, win/fail. No three.js imports.
  voxelsim.js              pure voxel-sandbox simulation: load-path support graph,
                           stress delays, rigid chunks, debris. No three.js imports.
  voxelworld.js            voxel sandbox renderer: one InstancedMesh per material
  world3d.js               three.js scene builder: meshes for ground, roads,
                           buildings, props, water; syncs from sim state; eat anims
  camera.js                chase camera + collision (no clipping), orbit, zoom
  controls.js              keyboard (strafe + orbit, chaseMode basis latch) + touch
                           joystick + touch orbit → move/orbit intents
  ui/
    hud.js                 mass bar, timer, combo, level banner, minimap
    screens.js             title, world map, level cards, shop, results, pause
tools/
  validate.mjs             headless beatability/overlap/snack-ring proof (node)
```

## Key design decisions

- **Sim/render split.** `sim.js` + `citygen.js` + `levels.js` + `tiers.js` +
  `rng.js` never import three.js. The validator imports them directly — so the
  thing that is proven beatable is the same code the player plays.
- **Determinism.** All randomness flows through `rng.js` seeded per level.
  Rival movement uses the level RNG plus fixed timesteps (sim runs on a fixed
  60 Hz accumulator; render interpolation is cosmetic only).
- **Fixed timestep.** `sim.step(dt=1/60)`; the loop accumulates real time.
- **Placement.** City is a coarse grid of lots; each lot gets an object whose
  footprint circle is rejection-sampled (max N tries) against an O(n) candidate
  list using a uniform spatial hash — no overlaps by construction, verified by
  the validator.
- **Growth/edibility single source.** `tiers.js` exports `radiusForTier`,
  `playerRadiusForMass`, `isEdible(playerRadius, tier)`. UI, sim, and validator
  all use it.
- **Save migrations.** `save.js` keeps `MIGRATIONS = {1: fn, 2: fn}` applied in
  sequence; unknown/future versions fall back to a fresh save with the old blob
  kept under `hole-city-save.quarantine`.
