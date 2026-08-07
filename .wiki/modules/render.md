---
covers:
  - "js/world3d.js"
  - "js/camera.js"
  - "js/controls.js"
  - "js/skins.js"
  - "js/quality.js"
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
| `js/controls.js` | Keyboard + touch joystick/orbit + optional world-space point-to-move → camera-relative move intents |
| `js/skins.js` | Hole skin registry (17 skins) + geometry primitives + per-frame runtime; consumed by `world3d.js`/`voxelworld.js` for the mesh and re-exported by `js/ui/screens.js` for the shop |

## Talks To

- **sim.js** — reads state, drains events
- **levels.js** — `METROS` themes (palette, sky, night fog)
- **main.js** — owns renderer lifecycle (`dispose` between levels)

## Gotchas

- Camera occlusion uses 2D XZ AABB tests against `world.blockers` (buildings
  with `h > 6`); eaten buildings are removed from the blocker list on the
  `eat` event — if you change building visuals, keep `blockers` in sync.
  The voxel sandbox feeds the same camera from `sim.cameraBlockers`, built by
  `generateBlockers` (`voxelkit.js`) for Brooklyn/Upper Manhattan and hand-pushed
  for Lower Manhattan. Same `h > 6` cut applies; `tools/validate.mjs` enforces it
  for Manhattan because nothing in the sim can.
- **`sim.cameraBlockers` now tracks demolition** (2026-08-05). It used to be
  built once at scene start and never pruned, so a levelled tower kept a ghost
  AABB the camera hid behind forever. `_bindCameraBlockers()` indexes each
  blocker's 1 m footprint cells into `_blockerCell` and records `b.h0` (the
  authored height, a permanent ceiling). Liveness rides the sim's existing
  `_top` heightmap — the cheapest honest signal there is, since `_topAdd` /
  `_topRemove` already maintain it — rather than a new subsystem or a per-frame
  rescan of 540 rects. Cost is controlled by a lazy max: each blocker caches the
  height band it is currently in (`b._tier`) and how many fine columns still
  reach it (`b._nTop`); a removal in that band decrements the count, and only
  when the band EMPTIES does the blocker get rescanned. A tower comes down
  wholesale, so that is a handful of rescans over its life, capped at 4 per step
  through a persistent `_blockerDirty` set drained as phase 0 of `step()`.
  Heights only ever move DOWN and are clamped to `min(h0, …)`, so a fresh sim is
  byte-identical to before and Lower Manhattan's deliberate hand-authored
  over-blocking survives — `probeCameraBlockers` in `tools/validate.mjs` sees
  exactly what it always saw. `b.h === 0` means demolished; the camera skips
  those. Measured over 45 s routes: 54–65 blockers retired and 4–8 shrunk per
  large-hole run, 0 on the pre-change build by construction.
- All geometry/material must come from the module-level caches; per-frame
  allocation shows up fast at 1500+ objects. Exception: `gableGeo` builds a
  small BufferGeometry per building — if house counts grow, cache per
  (w,h,d) bucket.
- Building archetypes (house/shop/tower/landmark) derive from tier + metro +
  `o.id` in `makeBuildingMesh` — deterministic without touching the RNG
  stream. Keep it that way: adding RNG draws here would change every city.
- Movement basis in `controls.js:getMove`: camera forward on the ground is
  `(-sin(yaw), -cos(yaw))`; W must move along forward (regression history:
  flipped basis made W go backwards). The same convention defines the hole's
  heading: forward = `(-sin(heading), -cos(heading))`.
- **Input is TWO schemes split by device (final, 2026-08-07).** The keyboard
  is TANK (next bullet); the touch stick is direct steer (further below).
  Both write the same `controls.heading`.
- **Keyboard: tank controls, now with a visible heading.** The hole carries a
  persistent world-space heading owned by `controls.js`. W/S are throttle
  along it, A/D rotate the heading itself at `ORBIT_RATE × turnSens × size
  ramp` (sandbox) — including spinning in place when stationary. The heading
  seeds from the live camera yaw on the first move input of a level (`main.js`
  resets it to `null` each start), so W initially drives up-screen; after that
  only A/D (or point-to-move, which keeps the heading synced to the driven
  direction) ever change it — the camera cannot, which is what makes the
  heading chase feedback-free BY CONSTRUCTION. `chaseMode` survives only as
  the flag that turns on the size-ramped turn rates and the camera's follow
  yaw. History: the `driveMode` scheme (A/D fed `orbitDelta` at `STEER_RATE`
  2.7 rad/s × a size-ramped 0.2→0.8) and the camera-relative strafe that
  replaced it are both gone; ADR-0008 documents the tank design.
- **The tank wind-up, the one-day direct detour, and the heading pointer
  (2026-08-07).** Tank's known flaw: A/D integrate the heading open-loop, so
  a W+A hold winds the heading ~150°/s past the view, and a later D only
  reverses the ROTATION — the heading unwinds every wound degree back through
  straight-ahead while W keeps driving along the stale heading. Player report:
  the hole "runs off the opposite way" and has to "come back around" to go
  right. The keyboard was switched to direct steer (WASD name screen
  directions, shortest-arc chase, basis hold) for one day, then A/B-tested
  live (a `?steer=` rig, keys 1–4: direct / tank / strafe-snap / mouse-follow;
  headless harness numbers: reversal-to-screen-right 1202 ms tank, 301 ms
  direct, 0 strafe). The player picked TANK — the roundabout was never the
  scheme, it was that an unmarked circle never shows the heading, so the
  wind-up was invisible. The fix is the **heading pointer** in
  `voxelworld.js`: a paper-plane arrow (dark outline plate + brand-orange
  face, depth test off like the hole ring) welded to `controls.heading`,
  scaling with the hole radius, identical on every skin — gameplay
  legibility, deliberately not part of `skins.js`. The rig was removed in the
  same pass.
- **Touch: direct steer + pinch zoom (2026-08-06).** The stick's ANGLE names a
  direction on screen; the heading turns toward it at a capped rate and stops
  itself when the error reaches zero. Screen→world is
  `target = basisYaw + atan2(-sx, -sy)` (client `sy` runs down, so screen-up is
  `-sy`; screen-left is `heading + π/2`, matching `forward = (-sin h, -cos h)`).
  Because it converges rather than integrating open-loop it can afford
  `DIRECT_STEER_BOOST` 1.6× — 238°/s at SIZE 1 — under a ceiling mirroring
  `camera.js`'s own follow rate, since a heading that outruns the camera reads
  as the world sliding sideways, not as a faster turn.
  **The feedback loop and how it is cut:** direct steer is inherently
  camera-relative, and the chase camera is simultaneously slewing to sit behind
  that same heading. Re-read the live yaw every frame and the pair has no fixed
  point except dead ahead (`target = yaw + φ`, `yaw` chases `heading`, so the
  heading advances by φ forever and a held stick drives in a circle) — a steady
  state, not a tuning bug. So the basis is **latched**: `_latchBasis` is only
  called on frames where the stick is NOT commanding (inside the dead zone, or
  lifted), so no frame both reads and writes it and there is no path from yaw
  back to heading. Held for the life of a push, which is what makes a held stick
  draw a straight line; relax the thumb for one frame and the basis is current
  again. Measured: latched drift 0.00° at all four φ, guard forced off winds up
  760.88° and 1032.60°. 48-angle sweep, worst world error 0.01°.
  Magnitude past the dead zone is deliberately NOT speed — both sims
  re-normalise `move`, so a half-push would be scaled straight back to 1.0.
  **The latch alone was not the fix (2026-08-06): "down still went forward"
  after it shipped, because the latch fixes the STICK's math, not the
  CAMERA's slew.** The world direction the stick produces was exact even
  before this — measured with the chase frozen, drag angle tracked to within
  2° from any origin, down landing at 89-90°. But the chase camera
  simultaneously slews to sit BEHIND the newly-set heading, and that motion
  erases the reversal in the same frame it creates it: the same sweep with
  the chase live collapsed every direction to 0-2° (straight up-screen),
  because the camera turns to face wherever the stick just pointed. Not a
  control bug wearing a camera's clothes — the camera. Fixed by pinning the
  chase to the stick's latched basis while the stick is driving:
  `Controls._setChaseHold(y)` calls `ChaseCamera.setChaseYawHold(y)`, which
  outranks `driveHeading` in the chase's per-frame target selection
  (`camera.js` `update()`). Held at the BASIS, not simply frozen wherever the
  camera happens to be — that is what makes engage/release lurch-free, since
  the basis is only ever written on a frame the stick is at rest, where it
  already equals the live yaw. `_latchBasis` also re-points a standing hold
  whenever it re-latches, so the basis and the hold can't drift apart if a
  second finger orbits between pushes. **The hold belongs to the stick
  alone:** direction-chase is a TANK affordance and the keyboard IS tank — a
  key press releases the hold and hands the camera back to the heading chase
  (last input wins, and relaxing the thumb to centre does NOT release — a
  brief pause would otherwise swing the view up to 180°). The rig is reached via
  `camera.userData.rig` (set in the `ChaseCamera` constructor), because
  `main.js` hands `Controls.setCamera()` the THREE camera object, not the rig
  — riding on `userData` keeps the arbitration between the two files it
  concerns rather than adding a plumbing argument through `main.js`. This is
  also how the genre already answers the underlying question: hole.io and
  its peers pair a drag-anywhere floating stick with a camera whose yaw never
  rotates, so the stick's angle and the screen agree permanently — the
  reference to start from next time a control scheme needs designing, rather
  than deriving one from scratch.
  Verified by A/B in one build with `setChaseYawHold` monkey-patched to a
  no-op: live worst error 2°, 0 of 32 cases off by more than 45°; disabled
  worst 180°, 20 of 32 off by more than 45°.
  **Pinch:** roles not counts — at most one finger is the stick (or the
  pointMove pointer) and every other finger down is a camera finger; one orbits
  by its travel, two orbit by their midpoint and zoom by their separation, so
  the gestures never contend. `PINCH_SIGN` = spread zooms OUT (deliberately
  inverted vs. the maps norm, Nico's call; one character to flip). `PINCH_GAIN`
  96 m per screen-diagonal of separation, normalised so portrait and landscape
  feel identical. Feeds the existing `zoomDelta`→`cam.dist` path; 8–40 m stays
  the camera's clamp, `ZOOM_ACC_MAX` 32 bounds only the accumulator. When the
  orbit finger lifts, a surviving camera finger **inherits the orbit slot** —
  without it `orbitHeld` went false with a finger still on the glass, which is
  exactly the 44°/0.5 s hole that getter exists to close.
  In `pointMove` mode finger 1 is unconditionally the pointer, so pinch needs
  fingers 2–3; not discoverable, but it regresses nothing.
  **The stick yields a finger it never used (`_joyEverLive`).** The stick's home
  is `clientX < innerWidth/2`, which on a 390 px phone puts the boundary at
  195 px — straight through the middle, exactly where a player who is *not*
  steering puts two fingers to zoom. Left alone the left finger takes the stick,
  the pinch is then excluded from `_pinchPoints`, and the zoom attempt reads as
  a drive command: measured on the staged tree from a parked 24 m, a centred
  converge gave dist 24→24 and moved the hole **12.12 m**, a centred spread
  **13.31 m**, both with zero zoom. So on touchstart, a stick finger that has
  never left the dead zone is handed back to the camera pool before roles are
  assigned, and `freed` blocks re-arming for the rest of that event — otherwise
  the very finger that triggered the release walks into the branch below and
  steals the same pinch one finger later. The test is a LATCH, not the live
  deflection: a thumb that pushed and coasted back to centre is a player
  stopping deliberately, and taking the stick from them mid-drive would be the
  same bug pointing the other way. After the fix, centred converge 24→8 and
  centred spread 24→35.3, both with the hole moving **0.00 m**; a steering thumb
  keeps the stick across an arriving finger even after coasting back; the
  three-finger case is unchanged (16→38.9 while driving 18.3 m). Direct steer
  re-swept at 36 angles after the change: worst heading error 0.43°.
- **Point-to-move (2026-08-05), off by default via `settings.pointMove`.**
  Drag sets a world-space direction; a short (< `TAP_MS = 350`), barely-moved
  (< `TAP_PX = 14`) press is a tap whose destination outlives the gesture —
  one screen→ground raycast projection serves both, so tap-to-move is the
  same scheme with a different release rule, not a second one. A setting, not
  a replacement: WASD/joystick are untouched when off, and keys stay live
  even when on. On touch, point mode **replaces the left-half joystick** and
  moves orbit to a second finger — the joystick is camera-relative and needs
  the basis latch, point mode is world-space and must not have one, so a
  frame with both live would have two answers to what an input means. Three
  latent bugs this surfaced and fixed: (1) a tap whose ray missed the ground
  used to clamp to a fallback distance — on the frame a level starts,
  `matrixWorld` is still identity (camera at y=0, ray horizontal), so an
  early tap could send the hole on a 396 m sprint; there is now no fallback,
  `_groundAt` returns `null` and the gesture is ignored; (2) tap timing came
  from `performance.now()` in the handler (measures the frame, not the
  finger) — now taken from the event's own `timeStamp`; (3) `js/ui/ready.js`'s
  `activate()` adds `.rg-out` (`pointer-events:none`) mid-gesture, so the
  touchstart of the press that hit START fell through to the canvas and drove
  the hole to a destination under the sign — defended (not cured; the
  overlay-drops-pointer-events-mid-gesture pattern will bite the next overlay
  that does it) with `PT_RELEASE_GRACE = 0.25 s` in `controls.js`. No mouse
  orbit-drag in point mode (Q/E are already the mouse's manual look, and a
  right-drag would mean suppressing the context menu canvas-wide). Drag
  magnitude deliberately does not set speed — both sims re-normalise `move`
  themselves, so this ships direction-only.
- **`setFollowDirection(true)` chases the control heading directly.** The
  sandbox camera's follow target is `controls.heading` itself (passed as
  `driveHeading` to `ChaseCamera.update`), not a velocity-derived estimate:
  the heading is exogenous input state, so there is no feedback loop to guard
  against — the old `dot > 0.05` toward-camera gate and the basis latch that
  replaced it are both unnecessary and gone. Chasing the heading also makes a
  stationary A/D spin visible (a velocity target could never show one), and
  while driving it is identical to the old velocity chase because in the tank
  scheme velocity IS heading × throttle. The one override is the touch
  stick's chase-yaw HOLD (the direct-steer bullet above): the stick names an
  absolute screen direction a slewing camera would erase. The velocity-derived target survives
  as the fallback for callers that pass no heading (old harnesses, and the
  frames before a level's first input). The chase still has its own smoothed,
  UNCLAMPED velocity for that fallback — the campaign's per-axis-clamped
  `lookAhead` collapsed every heading onto the nearest diagonal at 9.96 m/s
  and is untouched.
- Chase dynamics: critically damped spring under a hard angular-rate cap, both
  ramped on `sandboxSizeProgress` — `FOLLOW_OMEGA` 8 → 12 rad/s (`_RAMP` 1.5) and
  `FOLLOW_MAX_RATE` 4.2 → 7.0 rad/s, i.e. 241°/s at SIZE 1 rising to 401°/s at
  SIZE 12. Never overshoots, so it cannot limit-cycle (measured 0.0000° drift
  over a 30 s hold). Worst-case convergence to within 5° over 240 cases
  (48 headings × 5 start offsets) is 0.983 s at SIZE 1 and 0.633 s at SIZE 12 —
  the ramp is deliberately *gentler* than the 2.6× speed ramp, because angular
  rate is comfort-capped in a way linear speed is not; past ~400°/s a chase
  camera reads as a whip-pan regardless of how fast the subject is moving.
  Target yaw only updates above `FOLLOW_DEADZONE = 1.5 m/s`, and the chase coasts
  `FOLLOW_COAST = 1.2 s` past the last motion — long enough to finish a swing the
  player released mid-turn, short enough that a parked player gets the camera
  back. Reduced Motion still disables the chase entirely.
- **Manual orbit re-aims the chase, it no longer suspends it (2026-08-05).**
  The old scheme held the chase off for 0.7 s after the last orbit frame and
  then let the spring reclaim the whole yaw error at its rate cap — measured,
  a 1 s look gained 151.5° of framing and the spring took it all back at
  240.6°/s (SIZE 1) or 401.2°/s (SIZE 12, over a full revolution/second): the
  "camera fights me" report, exactly. Not fixable with a longer timeout —
  `ORBIT_HOLD` only sets *when* the snatch starts, not how fast it runs, and
  speed was the complaint. Manual orbit now accumulates a persistent yaw
  `_yawOffset` and the chase targets `heading + offset`, so the spring and the
  hand no longer write the same number — the offset absorbs the look, the
  spring error is untouched, and there's nothing left to fight. See
  `.wiki/adr/0007-camera-orbit-offset.md` for the full before/after and the
  alternatives rejected. The offset eases back to zero on its own,
  deliberately at a different rate than the spring: `ORBIT_RECENTRE_DELAY` grace
  (the `_orbitHold` field name is
  now a misnomer — it means "grace before unwind," not "chase suspended";
  left unrenamed to keep the diff scoped) before a first-order decay at
  `ORBIT_RECENTRE_RATE` capped at `ORBIT_RECENTRE_MAX` — a rate *ceiling*, not
  a lerp, because a lerp's peak
  rate is at t=0 and scales with the offset (a 180° look would start back at
  81°/s). The two rates are two
  different promises: the fast spring (4.2-7.0 rad/s) tracks the HEADING so a
  chosen framing survives a turn and therefore size-ramps with how fast the
  world moves; the slow unwind returns that framing to centre for an idle
  player and deliberately does **not** size-ramp — it's a readability budget,
  not a speed-tracking rate.
- **The unwind was retuned so follow wins over orbit (2026-08-06).** The
  structure above is unchanged; the three return-to-centre constants are not.
  As first shipped, `ORBIT_RECENTRE_DELAY = 1.2 s` / `RATE = 0.45`/s (tau 2.2 s)
  / `MAX = 0.5 rad/s` (29°/s) took **8.05 s** to bring a 90° look back behind
  the heading and 11.08 s for 180°. That is long enough that the camera reads as
  an *orbit* camera parked wherever you last looked, which is the opposite of
  the follow cam this mode is supposed to be — Nico's report was "feels
  orbital, I want it back to follow." Now `DELAY = 0.15 s`, `RATE = 18`/s
  (tau 56 ms), `MAX = 2.2 rad/s` (126°/s): **1.23 s** for 90° and 1.92 s for
  180°. Still 1.9× slower than the 240.6°/s reclaim ADR-0007 killed at SIZE 1
  and 3.2× slower than its 401.2°/s at SIZE 12, so it buys the return without
  buying back the snatch. `RATE = 18` makes tau (56 ms) far shorter than the
  frame budget, so the ceiling — not the decay — is what governs the whole
  return; that is deliberate, and it is what makes a 20° look and a 180° look
  come back at the same readable speed. The return time has a floor the three
  constants **cannot** reach: ~0.4 s of it is the chase spring settling its own
  ramp-tracking lag, set by `FOLLOW_OMEGA`. Note the unwind still must not
  size-ramp, and now the measurement says so rather than the argument alone:
  SIZE 12 returns *sooner* than SIZE 1 (1.08 s vs 1.23 s) because
  `FOLLOW_OMEGA` is higher there.
- **The grace is refreshed by an orbit pointer being DOWN, not just by orbit
  input arriving** (`Controls.orbitHeld` → `ChaseCamera.update`'s optional 7th
  argument, passed from both `main.js` call sites). This exists because of the
  retune above and would be pointless without it. A held Q/E emits a non-zero
  `orbitDelta` every frame, so the keyboard refreshes the grace on its own —
  but a **touch drag whose finger stops moving emits nothing**, and at a 1.2 s
  grace that never mattered while at 0.15 s it is a live defect: measured
  12.6° of look lost per 0.25 s of stationary finger, 44.1° per 0.5 s, 92.9°
  per 1.0 s. `orbitId !== null` closes it completely — touch is the only
  exposed surface, because the mouse deliberately has no orbit drag
  (`controls.js` `onMouseDown`: Q/E already *are* the mouse's manual look).
  With the bit live a paused finger loses 0.0° at every duration measured, a
  *lifted* finger still unwinds at the new rate, and the grace starts at the
  **lift** rather than at the last movement (a 5 s paused drag retires its
  offset 1.17 s after release, not during the pause).
- **`recentre()` is gone (2026-08-06), superseded when the heading stopped
  re-adopting the camera yaw.** It existed to drop the manual look offset on
  the frame a fresh press re-latched the move basis to the live yaw — without
  it, look-then-press cycles ratcheted (measured: four 60° cycles drifted
  216° at a 0.25 s re-press cadence with it forced off, 0.0° with it live).
  The steering heading never re-adopts the camera yaw after its one-time
  seed, and the basis the keys/stick read moves WITH the standing chase hold
  (`_latchBasis` re-points it), so the ratchet's mechanism no longer exists
  and neither does the call. ADR-0007 documents the old design; its drift
  figure caveat still applies to that history — the 123.8° figure did **not**
  reproduce on re-measurement (2026-08-06), the drift is cadence-dependent
  and wraps past 180° (the same 4-cycle scenario measures 338-347° at
  0.25-1.0 s, 62.0° at 4 s). Quote the claim (large drift off, 0.0° on), not
  the number.
- The chase runs on the BASE yaw: `_introOscYaw` is subtracted before it and
  re-added after, so the intro's decaying offset never biases the target or gets
  baked into the base.
- **Rates are per second, not per frame** (fixed 2026-08-05: `controls.js`'s
  `getMove` used to add a fixed step once per rendered frame with no `dt`, so
  turn rate was frame-rate-dependent — `0.009 × fps` rad/s, spanning 400×
  between a fast machine's idle and a struggling scene's crawl, and nearly
  unsteerable during a heavy collapse). `Controls._frameDt()` measures the gap
  between calls internally so this needed no change in `main.js`; `getMove` also
  accepts an explicit `dt` for a caller that already has one. `dt` clamps at
  0.1 s, same as the sim's catch-up clamp: `ORBIT_RATE = 2.6` (Q/E orbit, was
  0.03/frame), `ZOOM_RATE = 24` (R/F dolly, was 0.4/frame). Touch orbit
  (`onTouchMove`) is deliberately coupled to *pixels dragged*, not time — correct
  for a drag gesture. `settings.turnSens` multiplies A/D steering, Q/E **and**
  the touch drag in `chaseMode` only; campaign Q/E is explicitly divided back
  to the bare 1.8 rad/s it has always run at, so moving the base constant left
  it untouched, while campaign steering runs at the flat base rate
  (`_steerSens`). Steering and manual orbit also ramp with hole size
  (`ORBIT_RATE_RAMP = 2`): 149°/s at
  SIZE 1 → 298°/s at SIZE 12, against the flat 103°/s it replaced and the 31°/s
  of the drive-mode steering before that. The ramp is not cosmetic — the camera's
  own standoff grows from ~11 m to ~57 m over the same range (`clearDist`), so a
  fixed rad/s drags the camera through 5× the arc length for the same input and
  *feels* slower because the world barely turns relative to how far the camera
  flew. The settings screen prints the whole range (`~149-298°/s (SIZE 1→12)`)
  under the label "Sandbox turn sensitivity", true of steering and orbit
  alike — it used to print `STEER_RATE × turnSens` (~155°/s), which described
  no control that ran anywhere, since sandbox steering ignored the slider and
  turned at ~31°/s.
- In follow-direction mode the camera target is pinned ON the hole (no
  velocity look-ahead offset) — an offset drags the view toward the OLD
  heading mid-turn, which read as "turning off center". It also tracks tighter
  than the campaign's (`TARGET_RATE_FOLLOW = 14`/s vs 8, 71 ms vs 125 ms):
  measured steady-state lag behind the hole fell 1.079 m → 0.545 m at SIZE 1.
- **Spatial filter rates scale with traversal speed; angular ones do not.**
  `_spatialRate(base)` multiplies by `1 + (TRAVEL_SPEED_RATIO - 1) × sizeT`
  (`TRAVEL_SPEED_RATIO = 2.71`, the measured 2.62 SIZE 12 ÷ SIZE 1 speed rounded
  deliberately up — too-fast a filter under-lags, too-slow over-lags, and only
  one of those fails toward the complaint), and every
  rate whose job is to hold a *distance* constant goes through it:
  `TARGET_RATE_FOLLOW`, `BLOCKER_T_IN`, `BLOCKER_T_OUT`, the roof-lift release.
  A first-order filter at rate `k` tracking a target moving at `v` settles to a
  lag of `v/k` METRES, so leaving `k` flat while `v` went up 2.6× would have
  multiplied the visible lag by 2.6 — the exact complaint the chase work was
  meant to fix. With the ramp, measured target lag is 0.545 m at SIZE 1 and
  0.253 m at SIZE 12 (0.50 → 0.04 hole radii), against 1.079 m / 1.331 m before.
  Angular rates (`FOLLOW_OMEGA`, `FOLLOW_MAX_RATE`, `ORBIT_RATE`) deliberately do
  NOT use this: they are capped by what a human can watch, not by geometry.
- **Blocker standoff is smoothed, and clamped by an exact containment test.**
  `t` is discontinuous in the hole's position — the frame the hole→camera ray
  clips a tower corner it drops from 1 to whatever that corner subtends, which
  used to teleport the camera ~13 m and snap the pitch with it. It now follows
  through a first-order filter, asymmetric (`BLOCKER_T_IN = 9`/s vs
  `BLOCKER_T_OUT = 3.5`/s) because push-out is cosmetic and pull-in is the frame
  the camera would spend in a wall. Smoothing alone cannot guarantee that, so
  `_insideBlocker(x,y,z)` tests the placed point and falls back to the raw
  standoff when it is inside — **in both directions.** A standoff SMALLER than
  the sweep allows is unsafe too: camera height scales with `t`, so a ray that
  passes clean over a roof at `t = 1` puts the camera inside that roof at
  `t = 0.3`. Guarding only the pull-in left 38–83 inside-blocker frames per 90 s
  route; guarding both leaves 0. The filter is also what keeps the escape below
  from reading as a snap: measured over 4×45 s real-sim routes per scene, the
  worst standoff step (p99.9) is 2.4–30 m on the new build against 13–65 m on the
  pre-change one, and >1 m pops run 8–68 per 10 800 frames against 30–85. The
  residual is by design — the containment test WITHDRAWS the glide on the frames
  where gliding would leave the camera in a wall, so those frames are a recovery,
  not a wobble. They scale with the standoff, which is why the worst case is a
  SIZE 12 scene where the camera sits ~57 m out. **Sandbox only** — the establishing shot fits its
  distance against `BLOCKER_EASE` (`_fitAt`), so a lagging standoff would
  un-frame the shot it was fitted for, and the far-plane term reads `effT`
  directly. Verified bit-identical to the pre-change build: campaign path 1500
  frames, campaign level intro 263 frames, sandbox establishing hold 180 frames,
  sandbox intro hand-off 83 frames — max abs delta 0 on all four.
- **Containment: the sweep reports it, the push-out escapes it, the roof lift
  guarantees it** (2026-08-05). The old sweep was blind from inside a footprint —
  `rayHit2D` returned `Infinity` from inside an AABB (the `tmin > 0.02` guard),
  which reads as "clear", so the camera was placed at full standoff inside the
  building the hole was eating. Three layers now:
  1. `raySpan2D` returns the full `(enter, exit)` span, unclamped at the near
     end, into a caller-owned scratch (it runs against ~540 rects per frame and
     must not allocate). `enter <= 0` means the origin is INSIDE. `rayHit2D`
     survives as a wrapper and now returns `-1` for containment, not `Infinity` —
     callers that read "not a positive t" as "clear" were the bug, so the value
     they see had to change.
  2. **Push-out along the view ray.** For each box the genuinely unsafe interval
     is `(enter, min(exit, roofT))`; outside it you are either in front of the
     wall or above it. Containment raises a `floorT` the standoff must clear.
     Along the RAY, not along the shortest exit normal: a lateral push moves the
     camera off the yaw axis and breaks the "sits behind the heading" invariant
     the whole chase is built on, and in a dense grid the shortest exit from one
     building is straight into the next. The ray value is also CONTINUOUS in the
     hole's position (the box edge is fixed in world space, so `exit` slides as
     the hole drives deeper), which is what lets the same standoff filter smooth
     it without reintroducing a snap.
  3. **Roof lift, as the last resort and the only exact test.** Every other check
     is parametric, and the parameterisation is knowingly inconsistent: the sweep
     walks a ray at horizontal rate `cos(pitch)` while the camera is placed at
     `cos(effPitch)`, and `effPitch` depends on `effT`, which depends on the
     sweep — a fixed point nobody wants to solve per frame. During the intro the
     ray ORIGIN also slides toward the scene centre. So a parametrically-safe `t`
     can still land in a wall; measured, that was 9 frames of the intro hand-off
     buried 20 m inside a Brooklyn tower. `_roofOver(cx, cz)` reads the PLACED
     point, so it cannot be wrong about it: if a roof stands over the camera,
     `cy` is raised to `roof + ROOF_CLEAR` (2.5 m). Y is the one escape that
     cannot fail (there is always sky) and the only one that leaves `cx/cz` — and
     therefore the framing — untouched. Applied as a hard max on the way up,
     eased at `BLOCKER_T_OUT` on the way down so leaving a building does not drop
     the camera. Runs in every intro phase EXCEPT `hold`: the establishing shot
     is fitted to frame the whole city from outside it, so there is provably no
     roof above the camera and excluding it keeps the held pose bit-identical by
     construction rather than by measurement.

  4. **Dive pitch bump (2026-08-06, persona-playtest fix).** The guards above
     keep the camera out of walls, but the intro ZOOM's geometric dist lerp
     still crossed the city low over the rooftops around `_introK ≈ 0.5`,
     which the playtest caught as ~1 s of blank wall right after GO!. The fix
     adds `diveBump = _introK(1 - _introK) × 1.4` to `effPitch` — zero during
     `hold` (K=1) and `off` (K=0), so neither the fitted establishing shot nor
     the settled chase pose moves — peaking +0.35 rad mid-dive, which keeps
     the crossing above the roofline until the camera is nearly home.

  Verified on the REAL sim (`sim.step`, so buildings actually come down — a
  harness that never eats cannot test any of this): 4 independent 45 s routes ×
  {Brooklyn, Upper Manhattan, Lower Manhattan} × {SIZE 1, SIZE 12} × {with intro,
  without} = 129 600 frames, **zero** inside-blocker frames in every one of the
  12 cells. The pre-change build on the identical harness clips on 467–1151
  frames per small-hole cell (worst depth 56.5 m) and still 2–17 at SIZE 12,
  where the standoff is high enough to clear most roofs by accident. Live in the
  game (real rAF loop, real key events, per-frame sampler): 0 of 2036 frames at
  SIZE 1 and 0 of 804 at SIZE 12 in Brooklyn, 0 of 751 in Upper Manhattan. The
  lift did the work on 323 of those 2036 SIZE 1 frames and 0 at SIZE 12 — the
  large-hole camera is already above the skyline, so this is a small-hole,
  dense-low-rise problem, which is exactly where the complaint came from.
- `cam.fovKick(v)` adds a decaying FOV punch (growth/milestone juice);
  respects Reduced Motion, eases back at ~6/s in `update`.
- Player settings (`save.settings`: invertX/Y, shadows, camDist, reducedMotion,
  perfMode, pointMove) flow through `actions.applySettings()` →
  controls/camera/renderer.
- Renderer fast-path (`voxelworld.js`): static, fully supported, undamaged, non-consumed blocks outside the hole region bypass matrix recomposition and color updates each frame, reducing per-frame block update iterations by over 90%.
- Performance Mode (`perfMode`): caps particle effects, crumble voxel count, and debris physics relaxation passes for smoother gameplay on lower-resource devices. **In the voxel sandbox specifically**, `VoxelWorld3D.setPerfMode(on)` was a silent no-op until 2026-08-05 — it existed only on the campaign's `World3D` (`world3d.js:429`), so `main.js:101`'s guarded call (`world.setPerfMode && …`) never reached the sandbox renderer. It now exists there too, matching `World3D`'s signature, and does two sandbox-specific things: pins device pixel ratio to 1 (a no-op on a 1× desktop panel by construction, the biggest lever on a 2×/3× screen) and freezes ambient life (gulls/pigeons/steam/ferries/surf/neon) through the same `_ambientFrozen` flag Reduced Motion uses, independently of it. Measured −35% median idle frame time on a 1× panel, −36% plus a 13× p95 collapse on a 2× panel. It does **not** cull or LOD the block field — that is a real look cost, deliberately left for a pass that can prove it rather than a toggle that silently degrades the city. Be honest about scale: this is ~0.9 ms/frame of renderer/ambient cost, not a fix for a sim-bound frame (see `.wiki/modules/voxel.md`'s structural-zones note).
- The ground plane is **sized to the scene, not a fixed constant.** `contentExtent(sim)` (`voxelworld.js`) measures every block's footprint, every decor rect, and the hole clamp, and the plane is centred on that and grown by `GROUND_MARGIN = 600` (== `camera.js`'s `CAM_FAR`) on every side, so no camera pose can frame the plane's edge. Before 2026-08-05 the plane was a fixed `PlaneGeometry(240, 240)` at the origin — harmless for scenes that fit inside it, but Upper Manhattan's `z[-149,116]` extent left 8.5% of its blocks standing past the plane's north rim with nothing behind them. The far edge (where the plane still gets clipped by the camera's far plane) is hidden with `scene.fog` riding `camera.far` (`fog.near = far × 0.7`, `fog.far = far × 0.995`) rather than a fixed-distance band, so the fog only ever eats what was about to be clipped anyway and doesn't grey out a stretched establishing shot. The plane is segmented into ~64 m cells (not one giant quad) with `polygonOffset` pushing it away from the camera, both needed so `sceneDecor` rects (which sit 1.2-8.9 mm above it with `depthWrite: false`) don't lose the depth test at distance.
- Blocks render at their **full cell size**, not 95% of it. Before 2026-08-05 every instance was inset by `min(0.05, s × 0.05)` to fake a mortar gap between courses — since a wall here is one block thick, that inset was a literal hole through the wall, visible as a see-through horizontal slot at any camera height that lined up with a course boundary. The course line is now painted: a shared 128×128 `DataTexture` (`mortarTexture()` in `voxelworld.js`) applied as `map` on the block material, proportional in face-UV space so a 0.25 m brick and a 1 m brick both show the same ~2.3%-of-face border. Zero extra draw calls, one 64 KB texture shared across every scene.
- **Skins (`js/skins.js`, 2026-08-05): 25 hole skins replacing the single
  circle** — 12 core, 5 creature, 8 partner (agency) skins — themed on
  marketing/B2B without borrowing branding. A skin is a registry row plus at
  most one small builder (the `DECOR_LAYERS` idiom from `voxelworld.js` —
  adding one is a row, not a code change), built from four shared geometry
  primitives (`ringPart`/`tickPart`/`barTeeth`/`worldQuads`/`lidPart`) with
  all per-frame animation written into the CPU colour attribute rather than a
  shader, so every skin stays one draw call on the existing
  `MeshBasicMaterial`. Five are eat-reactive (chomper, shredder, eyeballs,
  throat, closer), not rim decoration. Deep Funnel's resting pulse measures
  exactly 0.0000 drift with Reduced Motion on — the reduced-motion flag
  forces the pulse term to 0, making both the base and scaled expressions
  byte-identical to the pre-skins expressions rather than merely close.
  Fixed while in there: world marks (ground trails for Attribution Model /
  Compounding events) sat at y=0.0095, underneath all 27 opaque depth-writing
  ground planes (roads 0.03, tree pads 0.025, water/building pads 0.02) —
  invisible over every road and building footprint. Raised to 0.04.
- **Partner marks have two paths: `logoTex` (raster) beside the original
  `logo` (traced vertex-colour points).** `logoTex` wins over `logo` when a
  row carries both. Source priority for a new partner mark is the agency's
  OWN square app icon (`link[rel~=apple-touch-icon]` or the W3C manifest's
  `icons[]]`, generation as a last resort) — it is exact, theirs, and already
  designed to survive being small, which a wide horizontal lockup is not.
  `logoTexPart()` (the render-side half of the path) measures the mark's ink
  bounding box by luminance and crops the texture to it; a row sets
  `logoFit.fullBleed: true` to skip that scan when the art already runs to
  the edge (the scan assumes a mark sits on a dark surround, so a full-bleed
  field would otherwise be measured as its own ink box and cropped to
  nothing useful). A mark made *of* black cannot render on this path at all
  — the same "pure black is free under additive blending" property that
  makes black a good background makes it unrenderable as ink.
  **As of 2026-08-07, seven of the eight partner rows are raster**
  (`supered`, `huble`, `sixandflow`, `mediajunction`, `saltedstone`,
  `impulse`, `newbreed`), each a purely additive `logoTex:` swap onto its
  asset at `assets/skins/partners/<name>/<name>-logo-large.png` (or `.webp`
  for `supered`). **Kuno alone stays traced**, by measurement: 4.30x traced
  beats the 3.10x best raster attempt.
  **Two brightness ladders, not interchangeable.** Traced (`logo`) marks
  carry hue in vertex colours and stay at the 0.36 ceiling that stopped the
  white-silhouette bug. Raster (`logoTex`) marks carry hue in the texture at
  the brand's exact hex, so multiplying by 0.36 washes out the one thing the
  asset exists to get right — the raster ladder sits at 1.0 at rest, exactly
  the art. Its ceiling (`LOGO_TEX_MAX = 1.13`) is derived, not chosen: under
  additive blending a vertex colour above 1 clips channel-by-channel, and
  Supered's magenta clips its linear red at `1/0.787 = 1.27`, so the ceiling
  is tuned so the eat-reaction's PEAK (lift pinned at its 1.3 clamp, glow at
  1, landing at 1.187) stays clear of that — tuned against the peak, not the
  base, because the player eats almost continuously and `lift` never decays
  to base.
  `bakeSkinThumbnails()` (used by both the shop tile and
  `tools/skinsheet.mjs`) runs fully synchronously, so raster marks are
  decoded once up front via `img.decode()` + a module-level top-level-await
  cache rather than making the baker async — an `Image().onload` cannot fire
  inside a synchronous build/pose/render loop, which is why Supered's first
  bake shipped as a bare rim with no mark. The decode wait is capped at 2 s
  and then proceeds regardless, so a slow or missing asset costs the mark,
  never the boot.
- **`nameText:` puts an agency's name on the mouth plate (2026-08-07).** Five
  previously icon-only rows (`newbreed`, `impulse`, `sixandflow`, `kuno`,
  `mediajunction`) now also carry `nameText:` — a canvas-texture label
  rendered under the mark via `namePart()`, gated the same way as the badge
  (`shut >= 0.55`, `name.visible = badge.visible && !!name.material.map`).
  Icon-only-ness is a property of the ART, not the row: a `logoTex` landing
  on a row can silently make it anonymous again if the new asset carries no
  wordmark, so `nameTexRecord()`'s list at the top of the file must be
  re-read whenever a `logoTex` lands (code comment near `js/skins.js:630`).
- **`class Maw` (2026-08-07) drives the hole's two lids and their meshing
  teeth on every bite — the closed mouth, not the open one, is the
  identity silhouette (Pac-Man's law: shut is the plain disc that goes on
  the cabinet).** It replaces `Chomp`'s depth-damping trade with a
  time-damping one: depth is always full and repeat bites while already shut
  EXTEND the hold (`MAW_HOLD_MAX = 0.40s`) instead of restacking it, with a
  guaranteed floor of open daylight after (`MAW_MIN_OPEN = 0.20s`) so the
  shut duty cycle cannot reach 100% however fast eat events arrive — measured
  shut duty 5.2-17% across full runs, zero per-frame allocation, ~0.003ms of
  frame cost. The partner brand mark (badge + `nameText`) is gated on
  `shut >= 0.55`; the rim only picks up a small brightening off the same shut
  value.
- **The mouth plate under the mark holds constant Rec.709 linear luminance
  (2026-08-07), not a constant fraction of brand colour.** `PLATE_L =
  0.02253` (`== rgb(0xf3961f) * 0.055`, the row that measured right) with a
  per-channel ceiling `PLATE_CH = 0.10` (binds on blue-dominant brands, e.g.
  New Breed, whose target blue channel would otherwise overshoot). A
  constant *fraction* made darker brands get darker plates on top of already
  darker ink (Kuno 29.2, New Breed 31.4 mean tile luminance vs Impulse
  60.1) — normalising to a constant floor instead: Kuno 29.2 → 43.6, New
  Breed 31.4 → 40.0, Supered 37.7 → 43.1.
- **Performance: active set, device tiers, watchdog (2026-08-06).**
  `voxelworld.update()` used to walk every block every frame — measured at 4.31
  ms/frame live vs 0.094 ms with the loop stubbed, i.e. **98% of `world.update`**
  — while only ~108 matrix and ~29 colour writes actually landed. 0.13% of blocks
  changed and 100% were visited. Replaced with an active set: median
  `world.update` on Boston desktop 5.109 → 0.233 ms, and at 4x CPU throttle on a
  390 px viewport 15.099 → 0.781 ms (round-robin A/B, phase-A tree vs this one,
  median of 3). Framebuffer is byte-identical against a full legacy repair scan
  and the determinism validator is unchanged vs HEAD.
  `js/quality.js` adds `detectTier` (coarse pointer, cores, memory, screen px,
  GL renderer string) and a `QualityWatchdog` that steps the tier on sustained
  p95: down after 3 s bad, up after 8 s good. Levers per tier are `dpr`,
  `shadows`, `ambientFrozen`, `debrisCap`, `contactRounds`, `supportEvery`.
  **Read this before optimising the renderer further.** Under real debris load
  the renderer is no longer the bottleneck and the active-set win stops
  mattering: at 4x throttle with debris accumulating, `world.update` is 2.58 ms
  against a `step` of 470 ms, of which `stepDebris` is 458 ms. Median fps goes
  before/high 2.2 → after/high 4.3 → after/potato 30.8, so essentially the whole
  rescue at load is `debrisCap` (Infinity/650/280/120), not the draw path. That
  makes the WATCHDOG load-bearing rather than a nicety — a phone that detects
  `high` and stays there gets 4 fps. Demonstrated stepping high→medium→low→potato
  within ~8 s under 6x throttle and recovering when load drops, though it
  oscillated once with throttle off (up at +102 s, down at +119 s), so the
  anti-oscillation ratchet is not airtight. Debris physics is the next ceiling
  and wants a budget or LOD of its own; nothing in the draw path will move it.
- **The ratchet's `_ceiling` never cleared, so one relapse cost HIGH for the
  rest of the session (2026-08-06).** The anti-oscillation ratchet records a
  tier that relapsed as a ceiling on `_ceiling`, set once in the
  `QualityWatchdog` constructor and only ever raised upward. `start()` runs on
  every level start and every quality change, and reset every other piece of
  learned state (`_buf`, `_t`, `_cooldown`, `_sinceUp`) but not that one — so a
  relapse recorded in one scene became a permanent ceiling in the next,
  including a scene with half the block count, and survived pinning a tier by
  hand and setting it back to AUTO (that path comes through the same
  `start()`). Measured before: 40 s of unbroken 16 ms frames on the next level
  still topped out at MEDIUM. `start()` now also clears `_ceiling`. Checked
  this doesn't just delete the ratchet (which would trade a stuck tier for the
  oscillation above): within a single level, 60 s of perfect frames after a
  recorded relapse still cannot climb past the ceiling. The ratchet's
  behaviour is intact; it simply no longer outlives the conditions it was
  learned under.
- **The `AUTO · <tier>` settings label lied before the first level
  (2026-08-06).** `main.js`'s `tierName` was hardcoded `'high'` at module
  scope and only overwritten by `startQuality()` at level start; the SETTINGS
  row reads `tierName` to render `AUTO · <tier>` and could say `AUTO · HIGH`
  on a device the classifier had already placed on MEDIUM (measured on a
  390×844 coarse-pointer profile) — exactly the confusion the label exists to
  prevent. Now seeded from `detectTier()` at module load. Nothing else reads
  `tierName` that early.
- **Three items the settings audit found and deliberately left unfixed
  (2026-08-06):** the campaign `World3D` has no `setQuality`, so the tier
  table is a renderer no-op on that path — latent only, since `showTitle()` no
  longer routes to a campaign level; the `dpr` lever is genuinely nothing on a
  1x panel by construction (`Math.min(devicePixelRatio, cap)`), so HIGH vs
  MEDIUM differs there in debris/support/contact rounds, not pixels; and the
  `AUTO · <tier>` label can go stale if the watchdog steps a tier down while
  the settings screen is open — it does not re-render on that event. See
  `.wiki/modules/ui.md` for the settings-screen side.
- **Desktop-class machines pin HIGH, watchdog off (2026-08-07).** The tier
  ladder exists for phones — every lever in `TIERS` is a CPU lever a phone
  feels — but `detectTier` applied its core-count/memory demotions to
  desktops too, and the watchdog could then walk a desktop down to LOW/POTATO
  (shadows and ambient life off) on a boot hitch or a big monitor. Player
  report: laptop showed the full game, desktop lost it. Now anything that is
  not a handheld (no mobile GPU, no coarse+small panel) and not a software
  renderer classifies HIGH with `desktopClass: true`, and `startQuality()`
  passes `pinned` for it so the watchdog never runs. Handheld classification
  is unchanged. Escape hatch for a genuinely weak desktop: the settings
  quality row. Check any machine's classification live via
  `window.__quality.detected` in the console.
- Visual-polish roadmap (building kit, canvas textures, lighting): see
  `.wiki/visual-direction.md`.
