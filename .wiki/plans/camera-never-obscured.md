# Plan: Camera Never Obscured

Status: PROPOSED (2026-09-27). Owner brief: the camera is always placed to the player's advantage; the hole and its food are never hidden. Builds on ADR-0022, .wiki/features/camera-bezier-smoothing/, .wiki/plans/controls-powerup-remediation.md (fixed yaw, 65 deg pitch, pinch zoom kept).

## 1. Today (js/camera.js)
- Fixed yaw 0, pitch 65 deg forced each frame (:1630). Distance (12 + 5r) * distScale * zoom, zoom 0.7-1.5 from pinch (:1319-1323).
- Occlusion: 2D ray sweep vs sim.cameraBlockers (towers >= 6 m). Legacy path (all cities except the Lab) compares metres with a dimensionless t, so pull-in almost never fires. Flagged smoothOcclusion path (Lab only) works.
- No building fade/cut-away/x-ray; no food framing.

## 2. Measured (headless: 120 street positions x 6 radii, settled 90 frames; tower occluders only, so a lower bound)
| City | Hole hidden SIZE 1/10/24 | Food hidden SIZE 1/10/24 | >25% food hidden @24 |
|---|---|---|---|
| Lab (flag on) | 0/0/0% | 2/7/10% | 14% |
| Brooklyn | 10/11/12% | 26/28/35% | 43% |
| Chicago | 15/22/23% | 22/41/49% | 57% |
| Upper Manhattan | 8/8/8% | 19/17/16% | 23% |
| Tokyo | 3/3/3% | 20/21/29% | 37% |
| Manhattan | 9/15/16% | 10/18/11% | 13% |
Experiment A (flag on everywhere): hole hidden 0-6%, food still 7-47%. Experiment B (80 deg pitch): food improves only 0-9 points.
Failures: F1 hole hidden (legacy bug); F2 food hidden 16-49%, grows with size (dominant; camera moves can't fix); F3 tall-city tail; F4 residual 1-6% with flag; F5 occluders under 6 m unmeasured.

## 3. Comparable games
Hole.io/Donut County: steep camera + low buildings (breaks with 100 m towers). Katamari: zoom-out steps, brief occlusion accepted. Diablo/Divinity/Sims/XCOM: keep camera, remove occluder (cut-away, dither fade, silhouette). Dithering preferred on mobile (opaque, no sorting).

## 4. Recommended: keep the camera, dissolve the occluder
- L1: promote the flagged sweep to all cities (hole hidden 3-23% -> 0-6%).
- L2: occluder dither-fade. Volume = capsule camera->hole with radius r + FOOD_RING (max(4 m, 1.2r)). Blockers intersecting it on the camera side fade (ease in 8/s, out 4/s, hysteresis); per-instance uFade drives screen-space Bayer 4x4 discard up to 75%, never fully invisible (outline/roofline kept). Selection in new pure js/camera-occluders.js; shader in renderer; main passes blocker ids.
- L3: silhouette fallback: hole rim and edible highlight drawn through walls only where occluded (one small extra draw).

## 5. Rejected
Steeper/top-down pitch (0-9 point gain, sometimes worse); pulling back further (shrinks hole on phones); auto-yaw/orbit (breaks fixed-yaw stick basis, motion sickness); alpha fade (sorting/overdraw); full cut-away (hides hero targets); raycasting voxels (too expensive).

## 6. Framing rules
R1 fixed yaw 0, base pitch 65 deg (cinematics excepted). R2 distance formula, hole diameter >= 8% of short screen edge and food ring fits. R3 pitch boost only via flagged S-curve, <= +0.5 rad. R4 hole centre never behind geometry. R5 blockers in the volume dithered to <= 25% coverage within 150 ms. R6 the building being eaten is always faded camera-side. R7 <= 2 fade flips per building per second. R8 reduced motion: fades snap, no auto zoom.

## 7. Tests (tools/camera-occlusion.test.mjs, harness like camera-smoothing.test.mjs)
T1 no blockers -> []. T2 wall between selected, behind not. T3 wall hiding food but not hole selected. T4 no flips on +-0.2 m oscillation. T5 demolished blocker never selected. T6 fade reaches 0.95 in 150 ms; reduced motion snaps. T7 city gate (brooklyn, chicago, upper-manhattan, tokyo, manhattan, gallery at SIZE 1/10/24): hole visible 100%, food visible-or-faded >= 98%. T8 camera-smoothing assertions hold in every city. T9 R2 framing at all radii/zoom. T10 pinch range intact. T11 selection <= 0.15 ms on 538 blockers; <= 1 extra draw. T12 existing camera tests stay green.

## 8. Rollout
0 commit probe tools/camera-occlusion-probe.mjs + baseline finding. 1 Lab: L2+L3 behind ChaseCamera.occluderFade for scene gallery; owner playtest phone+desktop. 2 smoothOcclusion in every city. 3 fade everywhere, tallest cities first, mobile frame-time gate (<= 1 ms regression on low tier). 4 remove legacy path and flags; ADR "Occluder dithering over camera motion"; update render.md.
Risks: per-instance fade must reach instanced/merged chunks (may need footprint index); dither shimmer at low DPR (scale Bayer cell with DPR).

Critical files: js/camera.js, js/main.js (:903-914, :1434-1441), js/world3d.js, js/voxelsim.js (cameraBlockers ~:1968), tools/camera-smoothing.test.mjs.
