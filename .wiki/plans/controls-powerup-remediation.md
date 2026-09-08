# Direct controls and power-up presentation remediation

Status: implementation and deployed browser checks complete; device/art acceptance open.
Reference: Flywheel-v3's immediate input direction and fixed camera orientation.

## Accepted outcome

WASD/arrows move up/left/down/right on screen, immediately, with normalized
diagonals. A floating joystick begins at the gameplay touch location. Normal
camera orientation stays fixed. Major powers receive a short dramatic charge
and release; routine pickups do not interrupt movement.

## Implementation

- A/D translate instead of rotating. Stick reversals apply immediately; heading
  is cosmetic. Existing inversion preferences remain respected. Desktop optional
  point-to-move remains mouse-only; mobile always uses the floating stick.
- Visual edge clamping never changes the logical touch origin. Release,
  cancellation, blur, pause, teardown and cinematic holds clear input. Overlay
  dismissal has a fresh-gesture grace period. Pinch zoom remains; manual yaw
  controls and their obsolete instructions are removed.
- Normal gameplay uses fixed yaw and a 65-degree pitch with follow and zoom.
  Portrait adaptive FOV now survives update (it was reset to 45 every frame).
  Minimum framing preserves city context instead of filling the screen with the hole.
  Neutral framing scales with zoom rather than imposing a floor that makes zoom
  inert. Browser-dispatched two-finger spread and cancellation passed.
- A single active PowerPresentation controller owns major collection sequences:
  0.35 s anticipation, 0.9 s charge, 0.25 s release, 0.9 s return. Quake/Titan/Vortex
  are major; Speed/Chrono/Frenzy use brief nonblocking feedback. Ground spawns only
  announce. Historical unused spawn-camera helpers remain covered until removal.
- Existing audio transformation/riser and impact cues are reused. Gameplay HUD
  elements hide during full sequences and return on skip/completion. A small title
  and accessible Skip button replace competing full-screen text treatments.
- The five legacy full-screen power overlays and animated screen-heat classes
  are retired. Duration pills and world effects remain. This avoids competing
  treatments; the performance comparison did not establish a frame-time gain.
- Only ordinary offline play pauses for a full sequence. Ranked and multiplayer
  presentation does not pause gameplay. Reduced motion uses the brief path.
  Sim activation stays authoritative; presentation grants no reward or buff.
- Skip, scene exit and completion share idempotent cleanup. Simultaneous activations
  cannot stack camera owners. A major collection preempts brief routine feedback
  so a preceding pickup cannot swallow its sequence. Normal yaw and framing return afterward.

## Verification and acceptance

RED-proven unit/integration coverage: cardinal/diagonal input, immediate reversal,
dead zone, edge origins, cancellation, fixed yaw, portrait FOV, context framing,
phase timing, reduced-motion/competitive modes, interruption and application wiring.

Preview browser testing has exercised actual A movement, all three major
collections, pause-of-simulation during their sequences, skip and camera return,
and all three nonblocking routine pickups without browser errors or failed
requests. Browser-dispatched touch passed right-side origin, immediate reversal,
and release. Natural completion restores HUD and simulation; reduced motion
bypasses the major camera. This check exposed the brief-feedback priority bug,
which was reproduced with a failing unit test and fixed before the successful rerun.

Scene replacement during a full sequence also passed: the previous overlay and
camera ownership are released before the new city's ready gate.

Remaining acceptance: physical touch/pinch cancellation scenarios, visual/audio review,
and the shared physical-device frame-time gate in the geometry plan. No claim of
finished art direction or 60 FPS on phones is made from the automated timing model.

See [ADR 0026](../adr/0026-direct-input-and-power-presentation.md) and the separate
[Tokyo geometry plan](tokyo-geometry-remediation.md).
