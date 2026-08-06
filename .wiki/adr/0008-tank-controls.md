# ADR-0008: Tank controls — a persistent control-owned heading, chased directly by the camera

- **Status:** accepted
- **Date:** 2026-08-06
- **Deciders:** Nico

## Context

The sandbox's third-person scheme moved the hole in camera-relative world
directions: W meant "away from the camera", A/D strafed. Two structural costs
came with it:

1. **The feedback loop.** The move basis was derived from the live camera
   yaw, and the chase camera aimed itself at the resulting direction of
   travel: basis → world direction → yaw target → yaw → basis. Every fix was
   a patch on this loop — first the `dot > 0.05` toward-camera gate (which
   refused the exact reversal the player asked for), then the rising-edge
   basis latch plus `ChaseCamera.recentre()` (ADR-0007) to stop look-then-
   press cycles ratcheting.
2. **The ask was simpler than the machine.** Nico: W forward, S backward,
   A actually turns left, D actually turns right — car-style, with spin in
   place allowed when parked. The settings screen already advertised exactly
   this ("Turn left A / Turn right D"); the implementation never matched.

## Decision

One control scheme in both modes, built on a single piece of state:

- `Controls.heading` — the hole's world-space heading, owned by
  `js/controls.js`. W/S are throttle along it; A/D integrate it directly at
  `ORBIT_RATE × turnSens × size ramp` (sandbox; flat base rate in campaign),
  always — a stationary press spins in place, and the path only bends while
  also driving, like a car whose wheel is never locked when parked.
- The heading seeds from the live camera yaw once per level (first move
  input; `main.js` resets it to `null` on every start), so W always begins
  as "drive up-screen". After that only A/D change it — or point-to-move,
  which keeps the heading synced to the driven direction so the camera and
  the next W press both continue where the pointer left off.
- The chase camera chases the control heading outright (`driveHeading` arg
  to `ChaseCamera.update`) instead of a velocity-derived estimate. Identical
  while driving (velocity = heading × throttle by construction), and it makes
  parked spins visible, which a velocity target never could. The velocity
  path stays as a fallback for heading-less callers.
- The heading rides on the hole for the renderer (`main.js` stamps it;
  presentational only — neither sim reads it), which feeds `st.heading` in
  both world renderers and `h.heading` in `biteFromEvent` for the first time:
  both skin fields existed but had never been wired.

Retired: the camera-relative basis, the rising-edge latch, `onBasisLatch`,
and `ChaseCamera.recentre()`. ADR-0007's ratchet cannot occur when the input
never re-adopts the camera yaw; its orbit-offset machinery (`_yawOffset`,
`_orbitHold`) is untouched and still governs manual looks.

## Consequences

- The chase feedback loop is impossible by construction (one-way data flow:
  controls → heading → camera), not merely damped. No latch, no gate, no
  per-press correction hook.
- `sim.step` still receives a plain world-space move vector, so determinism,
  the validator contract, and invariant 3 are unaffected; heading integration
  runs at the same per-second, dt-clamped rates as every other held key.
- Campaign loses camera-relative strafe with no replacement; its camera never
  auto-follows, so a parked spin is shown only through the heading-welded
  skins — accepted as the price of one scheme everywhere.
- ADR-0007 stands as history for the offset design; this ADR supersedes its
  basis-latch context.
