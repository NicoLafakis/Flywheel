---
covers:
  - "js/world3d.js"
  - "js/camera.js"
  - "js/controls.js"
---
# Render & input

## Purpose

Draws the sim, animates events, owns the chase camera and all input. Never
mutates sim state.

## Key Files

| File | Purpose |
|------|---------|
| `js/world3d.js` | Scene build from city data, mesh caches, eat/flood anims, event sync |
| `js/camera.js` | `ChaseCamera`: follow, orbit, zoom, building-occlusion pull-in, opt-in follow-direction yaw |
| `js/controls.js` | Keyboard + touch joystick/orbit → camera-relative move intents |

## Talks To

- **sim.js** — reads state, drains events
- **levels.js** — `METROS` themes (palette, sky, night fog)
- **main.js** — owns renderer lifecycle (`dispose` between levels)

## Gotchas

- Camera occlusion uses 2D XZ AABB tests against `world.blockers` (buildings
  with `h > 6`); eaten buildings are removed from the blocker list on the
  `eat` event — if you change building visuals, keep `blockers` in sync.
  The voxel sandbox feeds the same camera from `sim.cameraBlockers`, which is
  hand-written per scene instead of derived from the city objects, and is never
  pruned as towers fall. Same `h > 6` cut applies; `tools/validate.mjs`
  enforces it for Manhattan because nothing in the sim can.
- All geometry/material must come from the module-level caches; per-frame
  allocation shows up fast at 1500+ objects. Exception: `gableGeo` builds a
  small BufferGeometry per building — if house counts grow, cache per
  (w,h,d) bucket.
- Building archetypes (house/shop/tower/landmark) derive from tier + metro +
  `o.id` in `makeBuildingMesh` — deterministic without touching the RNG
  stream. Keep it that way: adding RNG draws here would change every city.
- Movement basis in `controls.js:getMove`: camera forward on the ground is
  `(-sin(yaw), -cos(yaw))`; W must move along forward (regression history:
  flipped basis made W go backwards).
- `setFollowDirection(true)` (voxel sandbox only) swings the yaw behind the
  smoothed travel direction. It MUST stay gated on the hole moving away from
  the camera (`dot > 0.05`): the move basis is camera-relative, so following
  a toward-camera heading flips the input direction under the player and the
  yaw spins unbounded (observed: 19 rad in 3 s). Manual orbit suspends it for
  1.5 s (`_orbitHold`); Reduced Motion disables it entirely.
- Sandbox input is `controls.driveMode`: A/D feed `orbitDelta` (steer the
  heading, `STEER_RATE` (2.7 rad/s) × `settings.turnSens` × `dt` — the
  0.1–2.5 Turn sensitivity slider; steering only, throttle/strafe stay raw),
  W/S stay throttle along camera forward, Q/E sidestep — turn and strafe are
  separate abilities on separate keys. Campaign keeps A/D strafe + Q/E orbit
  (`driveMode = false`). invertX flips steer too. **Rates are per second, not
  per frame** (fixed 2026-08-05: `controls.js`'s `getMove` used to add a fixed
  step once per rendered frame with no `dt`, so turn rate was
  frame-rate-dependent — `0.009 × fps` rad/s, spanning 400× between a fast
  machine's idle and a struggling scene's crawl, and nearly unsteerable during
  a heavy collapse). `Controls._frameDt()` measures the gap between calls
  internally so this needed no change in `main.js`; `getMove` also accepts an
  explicit `dt` for a caller that already has one. `dt` clamps at 0.1 s, same
  as the sim's catch-up clamp. Every rate constant is the old per-frame step
  × 60, so a 60 fps player feels no change: `STEER_RATE = 2.7`, Q/E orbit
  `ORBIT_RATE = 1.8` (was 0.03/frame), R/F zoom `ZOOM_RATE = 24` (was
  0.4/frame). Touch orbit (`onTouchMove`) was deliberately left frame-rate
  coupled to *pixels dragged*, not time — that is already correct for a drag
  gesture.
- In follow-direction mode the camera target is pinned ON the hole (no
  velocity look-ahead offset) — an offset drags the view toward the OLD
  heading mid-turn, which read as "turning off center". The smoothed
  velocity is still computed, but only to drive the yaw chase above.
- `cam.fovKick(v)` adds a decaying FOV punch (growth/milestone juice);
  respects Reduced Motion, eases back at ~6/s in `update`.
- Player settings (`save.settings`: invertX/Y, shadows, camDist, reducedMotion, perfMode) flow
  through `actions.applySettings()` → controls/camera/renderer.
- Renderer fast-path (`voxelworld.js`): static, fully supported, undamaged, non-consumed blocks outside the hole region bypass matrix recomposition and color updates each frame, reducing per-frame block update iterations by over 90%.
- Performance Mode (`perfMode`): caps particle effects, crumble voxel count, and debris physics relaxation passes for smoother gameplay on lower-resource devices. **In the voxel sandbox specifically**, `VoxelWorld3D.setPerfMode(on)` was a silent no-op until 2026-08-05 — it existed only on the campaign's `World3D` (`world3d.js:429`), so `main.js:101`'s guarded call (`world.setPerfMode && …`) never reached the sandbox renderer. It now exists there too, matching `World3D`'s signature, and does two sandbox-specific things: pins device pixel ratio to 1 (a no-op on a 1× desktop panel by construction, the biggest lever on a 2×/3× screen) and freezes ambient life (gulls/pigeons/steam/ferries/surf/neon) through the same `_ambientFrozen` flag Reduced Motion uses, independently of it. Measured −35% median idle frame time on a 1× panel, −36% plus a 13× p95 collapse on a 2× panel. It does **not** cull or LOD the block field — that is a real look cost, deliberately left for a pass that can prove it rather than a toggle that silently degrades the city. Be honest about scale: this is ~0.9 ms/frame of renderer/ambient cost, not a fix for a sim-bound frame (see `.wiki/modules/voxel.md`'s structural-zones note).
- The ground plane is **sized to the scene, not a fixed constant.** `contentExtent(sim)` (`voxelworld.js`) measures every block's footprint, every decor rect, and the hole clamp, and the plane is centred on that and grown by `GROUND_MARGIN = 600` (== `camera.js`'s `CAM_FAR`) on every side, so no camera pose can frame the plane's edge. Before 2026-08-05 the plane was a fixed `PlaneGeometry(240, 240)` at the origin — harmless for scenes that fit inside it, but Upper Manhattan's `z[-149,116]` extent left 8.5% of its blocks standing past the plane's north rim with nothing behind them. The far edge (where the plane still gets clipped by the camera's far plane) is hidden with `scene.fog` riding `camera.far` (`fog.near = far × 0.7`, `fog.far = far × 0.995`) rather than a fixed-distance band, so the fog only ever eats what was about to be clipped anyway and doesn't grey out a stretched establishing shot. The plane is segmented into ~64 m cells (not one giant quad) with `polygonOffset` pushing it away from the camera, both needed so `sceneDecor` rects (which sit 1.2-8.9 mm above it with `depthWrite: false`) don't lose the depth test at distance.
- Blocks render at their **full cell size**, not 95% of it. Before 2026-08-05 every instance was inset by `min(0.05, s × 0.05)` to fake a mortar gap between courses — since a wall here is one block thick, that inset was a literal hole through the wall, visible as a see-through horizontal slot at any camera height that lined up with a course boundary. The course line is now painted: a shared 128×128 `DataTexture` (`mortarTexture()` in `voxelworld.js`) applied as `map` on the block material, proportional in face-UV space so a 0.25 m brick and a 1 m brick both show the same ~2.3%-of-face border. Zero extra draw calls, one 64 KB texture shared across every scene.
- Visual-polish roadmap (building kit, canvas textures, lighting): see
  `.wiki/visual-direction.md`.
