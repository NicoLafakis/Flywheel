# Camera Bézier Occlusion Smoothing & The Lab Skyscraper Testbed

**Date**: 2026-08-19  
**Status**: PLANNED / SPECIFIED  
**Owner**: Antigravity  

---

## 1. Executive Summary

When Sprocket maneuvers near or behind tall buildings (skyscrapers, monuments, towers), the chase camera dynamically avoids clipping through walls and lifts above obstruction. However, the current transition produces a jarring, abrupt "overhead flip" and vertical pop due to:
1. Linear pitch ramp `effPitch = pitch + (1 - effT) * 0.5` without ease-in or ease-out.
2. Single-frame instantaneous teleport fallbacks inside `_insideBlocker` when the standoff filter lags behind building boundaries.
3. Instantaneous vertical roof-climb snaps (`if (need > this._lift) this._lift = need`) on upward ascents.

This feature package specifies a **$C^1$-continuous cubic Bézier / Hermite S-curve pitch interpolation** and **critically damped continuous ascent rate**, eliminating whip-pans and jarring vertical jumps while guaranteeing zero geometry clipping. It also specifies a dedicated **High-Rise Skyscraper Testbed in The Lab** (`gallery`) to provide immediate, dense urban corridors for live validation and feel tuning.

---

## 2. Core Objectives

1. **Eliminate Abrupt Overhead Flips**:
   - Replace the linear `(1 - effT) * 0.5` pitch calculation with a smooth cubic Bézier / Hermite S-curve $S(u) = u^2(3 - 2u)$ where $u = 1 - \text{effT}$.
   - Ensure zero jerk ($\frac{d^2\theta}{dt^2} = 0$) at $u=0$ (grazing buildings) and $u=1$ (full overhead).

2. **Smooth Roof Climbing (No Vertical Teleports)**:
   - Replace the 1-frame snap (`_lift = need`) with a high-speed, critically damped ascent ease ($16\text{–}20\text{ s}^{-1}$ rate) that lifts smoothly over rooftops.

3. **Continuous Boundary Fallback**:
   - When the camera is projected onto building boundary tangents during rapid motion, interpolate position continuously rather than hard-snapping in a single 16ms tick.

4. **The Lab Skyscraper Testbed**:
   - Author a cluster of 3 architectural test towers ($25\text{m}$, $35\text{m}$, $48\text{m}$ heights with varied alley gaps and overhangs) in The Lab (`js/voxelsim.js`) for instant local feel testing.

---

## 3. Documents in this Package

- [`01-prd.md`](01-prd.md) — Product & User Experience Requirements.
- [`02-technical-design.md`](02-technical-design.md) — Mathematical Specifications, Curves & Architecture.
- [`03-tasks.md`](03-tasks.md) — Phased Implementation & Verification Tasks.
- [`ADR-0022`](../../adr/0022-camera-bezier-occlusion-and-smooth-roof-climbing.md) — Architecture Decision Record.
