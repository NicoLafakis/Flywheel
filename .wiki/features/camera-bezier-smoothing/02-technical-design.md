# Technical Specification: Camera Bézier Smoothing & The Lab Testbed

---

## 1. Mathematical Formulation

### 1.1 Current Pitch Formula (Linear)
Currently, `js/camera.js` computes effective pitch as:
$$\theta_\text{eff} = \theta_\text{base} + (1 - \text{effT}) \times 0.5 + \text{diveBump}$$
Where:
- $\text{effT} \in [0.15, 1.0]$ is the smoothed standoff along the hole-to-camera view ray.
- When $\text{effT}$ drops from $1.0 \to 0.15$, pitch increases linearly by $+0.425\text{ rad} \approx 24.4^\circ$.
- **Flaw**: The derivative $\frac{d\theta}{d(\text{effT})} = -0.5$ is constant everywhere. The moment $\text{effT}$ drops below $1.0$, pitch immediately starts tilting upwards at full velocity with non-zero initial acceleration, resulting in visual "snapping".

### 1.2 Proposed Cubic Hermite / Bézier Formulation
Let normalized occlusion parameter $u \in [0, 1]$ be defined as:
$$u = \text{clamp}\left(\frac{1 - \text{effT}}{1 - \text{MIN\_T}}, 0, 1\right)$$
where $\text{MIN\_T} = 0.15$.

We apply a smooth cubic Hermite S-curve (Smoothstep / Cubic Bézier):
$$S(u) = u^2(3 - 2u)$$
Properties:
1. $S(0) = 0, \quad S(1) = 1$
2. $S'(0) = 0, \quad S'(1) = 0 \quad (C^1 \text{ continuity with zero initial and terminal jerk})$
3. $S''(u) = 6 - 12u$ (smooth, bounded second derivative)

The new effective pitch is computed as:
$$\theta_\text{eff} = \theta_\text{base} + S(u) \times \text{PITCH\_MAX\_BOOST} + \text{diveBump}$$
where $\text{PITCH\_MAX\_BOOST} \approx 0.50\text{ rad} \approx 28.6^\circ$.

```
Pitch Boost (rad)
0.50 |                                   .---- (Smooth Overhead)
     |                                 /
0.25 |                           . - '
     |                     . - '
0.00 | _ . - - - ' ' ' ' 
     +-----------------------------------------> Occlusion (u)
     0.0 (No building)                     1.0 (Full occluded)
```

---

## 2. Smooth Roof-Climb Algorithm

### 2.1 Current Implementation (Instantaneous Snap)
```javascript
const roof = this._roofOver(cx, cz);
const need = roof > 0 ? roof + ROOF_CLEAR : 0;
if (need > this._lift) this._lift = need; // <-- INSTANTANEOUS SNAP
else this._lift += (need - this._lift) * Math.min(1, dt * this._spatialRate(BLOCKER_T_OUT));
```

### 2.2 Proposed Implementation (Critically-Damped Ascent)
```javascript
const roof = this._roofOver(cx, cz);
const need = roof > 0 ? roof + ROOF_CLEAR : 0;

// High-speed critically damped filter for upward climbs (18/s vs 3.5/s downward decay)
const BLOCKER_LIFT_IN = 18.0;
const rate = need > this._lift ? BLOCKER_LIFT_IN : BLOCKER_T_OUT;
this._lift += (need - this._lift) * Math.min(1, dt * this._spatialRate(rate));

// Continuous projective backstop (ensures camera never clips inside solid voxel roofs)
if (cy < this._lift) cy = this._lift;
```

---

## 3. The Lab Skyscraper Testbed Architecture

**As built (2026-08-19).** The spec originally placed the testbed in a north-east quadrant at $z: -80..-30$, which is outside The Lab's bounds ($x: \pm95$, $z: \pm45$). The free zone is the south-east strip ($x: 26..89$, $z: 25..45$), south of the existing skyscraper row ($z: 12..20$) and east of the East Fleet; the towers live there, with the $z = 22$ lane and the $x = 43$ / $x = 65$ canyons as the drive routes. Built with `megaShell` (2 m cells; walls `oy..oy+2ny`, 2 m roof plate above), roof plates always on 2 m multiples so stacked tiers do not overlap, ring corners placed once (duplicated cells get pushed off and fall). `_buildScene()` now ends with `this.cameraBlockers = generateBlockers(this)` — The Lab previously shipped with no camera blockers at all.

```
        z 12..20   [ existing skyscraper row: x 44..51, 66..73, 78..85 ]
        z 22       ---------------- drive lane ----------------
        z 25..45   [Gamma 26..40] | [Alpha 46..62] | [Beta 69..89]
                   (x 43 canyon)    (x 65 canyon)
```

### 3.1 Test Tower Specs (as built)
1. **Tower Alpha (Modern Steel Office)**: $x: 46..62$, $z: 26..42$, $35\text{m}$ — concrete podium $y: 0..4$ (no roof plate), steel shell $y: 4..32$ tinted glass-blue `0x7fb8d8` (a glass `megaShell` collapsed, 252 cells falling, so the curtain wall is steel), steel roof at 32..34, crown ring at $y: 34$.
2. **Tower Beta (Stepped Setbacks & Spire)**: $x: 69..89$, $z: 25..45$, $48\text{m}$ — tiers $y: 0..16$ (10x10 cells), $16..32$ (8x8), $32..44$ (6x6, steel roof), 2x2 spire $y: 44..48$.
3. **Tower Gamma (Brutalist Block)**: $x: 26..40$, $z: 27..41$, $25\text{m}$ — concrete shell $y: 0..22$ + roof plate, 1 m parapet ring at $y: 24$ (the spec's recessed glass bays and cantilevers were dropped: they overlapped or were unsupported).
4. **Canyons**: 6 m between Gamma and Alpha ($x: 40..46$), 7 m between Alpha and Beta ($x: 62..69$); both asserted clear of blockers in `tools/camera-smoothing.test.mjs`.
