# ADR-0022: Camera Bézier Occlusion Smoothing & Continuous Roof-Climbing Easing

**Status**: ACCEPTED (2026-08-19) — Scoped to The Lab first (owner decision 2026-08-19): `smoothOcclusion` is enabled only when `scene === 'gallery'`; every other city runs the legacy path bit-for-bit (flag-off parity proven, 48,000 samples, 0 differ).  
**Date**: 2026-08-19  
**Deciders**: Antigravity, Nico Lafakis  
**Consulted**: Camera & Simulation Systems  

---

## 1. Context & Problem Statement

In single-player and multiplayer 3D voxel scenes, Sprocket's chase camera uses raycast blocker sweeps (`js/camera.js`) to prevent the camera from clipping inside standing buildings. When a building occludes line-of-sight:
1. `effPitch = pitch + (1 - effT) * 0.5` adds a linear upward tilt to provide an overhead view.
2. If `need > this._lift` when passing over a roof edge, `this._lift = need` snaps the camera height instantaneously in a single 16ms frame.
3. If `_insideBlocker` detects a boundary overlap, `_effT = rawT` snaps the camera standoff in one frame.

This causes sharp, jarring "overhead flips" and vertical pops when driving past high-rise structures (such as in Chicago, Upper Manhattan, and Tokyo).

---

## 2. Decision Drivers

- **Zero Jerk at Boundary**: Brushing or grazing a building corner should not trigger a high-frequency camera twitch.
- **Continuous $C^1$ Transitions**: Both pitch and elevation must vary smoothly with continuous derivatives.
- **Safety Guarantee**: The camera must never clip inside building voxels or stand inside solid geometry.
- **Dedicated Test Environment**: The Lab (`gallery`) must have tall skyscraper structures to test, tune, and prove camera feel without requiring level-specific hacks.

---

## 3. Considered Options

1. **Option 1: Increase Linear Standoff Damping (`BLOCKER_T_IN`)**:
   - *Pros*: Simple constant tweak.
   - *Cons*: Slower damping causes the camera to spend more frames inside building geometry, triggering more frequent hard teleports. Does not fix non-zero initial derivative.
2. **Option 2: Cubic Hermite / Smoothstep S-Curve Easing & Critically Damped Ascent**:
   - *Pros*: Mathematically guarantees $S'(0) = 0$ and $S'(1) = 0$ (zero initial jerk). The ascent filter smoothly pulls the camera up over rooftops without single-frame pops, while projectively guaranteeing safe standoff.
   - *Cons*: Slightly more math in the frame step ($O(1)$ polynomial evaluation).

---

## 4. Decision Outcome

**Adopt Option 2**:
1. Implement cubic Hermite S-curve pitch compensation:
   $$S(u) = u^2(3 - 2u) \quad \text{where } u = \text{clamp}\left(\frac{1 - \text{effT}}{1 - \text{MIN\_T}}, 0, 1\right)$$
2. Implement directional critically damped ascent for roof-climbing:
   $$\text{rate} = \text{need} > \text{\_lift} \ ? \ 18.0\text{ s}^{-1} : 3.5\text{ s}^{-1}$$
3. Author a dedicated 3-tower skyscraper cluster in The Lab ($25\text{m}$, $35\text{m}$, and $48\text{m}$ high-rises) as a permanent testing ground.

---

## 5. Consequences & Invariants

- **Invariant Maintained**: No browser-specific DOM/WebGL code inside the pure sim boundary; camera math remains pure and deterministic.
- **Test Coverage**: Watched by `tools/camera-smoothing.test.mjs` asserting $C^1$ continuity and zero building boundary penetrations.
- **Backwards Compatibility**: Intro establishing shots (`beginIntro`) and scripted cinematics remain unaffected.

---

## Implementation notes (2026-08-19, shipped)

- Flag: `ChaseCamera.smoothOcclusion` (`setSmoothOcclusion(bool)`), wired in `js/main.js` at the sandbox and multiplayer `new ChaseCamera` sites as `scene === 'gallery'`; the campaign site stays off.
- Pitch: `occlusionPitchEase(u)` (exported smoothstep) drives `PITCH_MAX_BOOST = 0.5` through a decoupled `_pitchT` filter (`PITCH_EASE_IN = 5` in, `BLOCKER_T_OUT` out, **unscaled** — an angular rate, see the SPATIAL/ANGULAR note in `camera.js`), `u` measured from the 0.92 resting standoff.
- Roof: `_lift` rises as a first-order filter at `BLOCKER_LIFT_IN = 18` (spatially scaled) and falls at `BLOCKER_T_OUT`; `cy = max(cy, _lift)` backstop kept.
- Task 2.4: pitch no longer snaps on the containment re-solve (it is fed by `_pitchT`); the POSITION snap to a safe standoff is kept on purpose so the camera is never left inside geometry.
- Found while arming the flag (legacy, untouched under flag-off): the blocker sweep compares `raySpan2D` spans in metres/cos(pitch) against a dimensionless `t`, so legacy pull-in almost never fires; under the flag spans are normalised by distance and a 1.0 m `BLOCKER_STANDOFF` plus `SWEEP_PAD = 0.75` (matching the lift's pad) are applied.
- Measured (browser, The Lab, 1.4k camera updates at 60 fps): max |dpitch| 0.039 rad/frame; max |dy| 1.9 m/frame (SIZE-1 equivalent) outside roof climbs; roof climbs step up to ~12 m on a 39 m lift in one frame — the 2.5 m/frame lift budget is structurally unwinnable for a first-order 18/s filter (first frame is ~26-40 % of the gap) and is recorded as such in `03-tasks.md`.
