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
  heading, 0.045 rad/frame × `settings.turnSens` — the 0.1–2.5 Turn
  sensitivity slider; steering only, throttle/strafe stay raw), W/S stay
  throttle along camera forward, Q/E
  sidestep — turn and strafe are separate abilities on separate keys.
  Campaign keeps A/D strafe + Q/E orbit (`driveMode = false`).
  invertX flips steer too.
- In follow-direction mode the camera target is pinned ON the hole (no
  velocity look-ahead offset) — an offset drags the view toward the OLD
  heading mid-turn, which read as "turning off center". The smoothed
  velocity is still computed, but only to drive the yaw chase above.
- `cam.fovKick(v)` adds a decaying FOV punch (growth/milestone juice);
  respects Reduced Motion, eases back at ~6/s in `update`.
- Player settings (`save.settings`: invertX/Y, shadows, camDist) flow
  through `actions.applySettings()` → controls/camera/renderer.
- The hole disc renders at `y=0.05/0.06` to win z-fighting against roads at
  `0.03` and park tint at `0.025`. The outer ring uses `depthTest: false`,
  `depthWrite: false`, and `renderOrder: 999` so it is always visible through
  occluding buildings and structures. Preserve the y-ordering and renderOrder
  when adding ground layers.
- Visual-polish roadmap (building kit, canvas textures, lighting): see
  `.wiki/visual-direction.md`.
