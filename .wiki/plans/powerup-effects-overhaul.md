# Power-up effects overhaul

Status: PLAN, data gathered 2026-09-27. Owner brief: stronger effects for the spawn, the look, finding it, capture, going away, and how many appear when. Related: modules/powerups.md (stale: still describes retired cards/overlays, fix it), plans/controls-powerup-remediation.md, ADR 0026.

## 1. Inventory
- 6 types: VORTEX, SPEED, TITAN, QUAKE (instant), FRENZY, CHRONO; timed 15 s x durationMult; repeat +4 s; max 3 buffs (js/powerups.js:15-93, 288-328).
- 2 at start, wander 2.4 m/s, 26 m separation; one 30 s respawn timer while board < 5; ground lifespan infinite (voxelsim.js:4463-4486, sim.js:400-420). Campaign bonus drops at 100k score / x500, 28 s lifespan.
- Spawn: encounter cinematic only on empty board; otherwise a toast. World: 1.8 s light pillar + ~20 sparks.
- Idle: small octahedron + ring + disc; 3 new materials per power-up.
- Finding aids: none.
- Capture: 28 sparks each with its own new material + shock ring; 2.4 s sequence for Quake/Titan/Vortex offline, 0.65 s brief otherwise; no hitstop; shake unused.
- Buff end: pill slides out, no sound. Ground despawn never fires in voxel play.
- Audio: spawn, collect, chrono tail, riser, encounter sting; no proximity/expiry/buff-end.
- Any cadence/cap/lifespan/placement/wander/reach change needs RANKED_SIM_VERSION bump (now 4).

## 2. Headless measurements (bot; relative, not absolute)
| Scene/mode | Sight | Spawned | Collected | Median/max time to collect | Left | Secs at cap 5 |
|---|---|---|---|---|---|---|
| Lab freeplay 300 s | 0 | 6-8 | 1-5 | -/247 s | 3-5 | 97-180 |
| Lab freeplay | 25 m | 8 | 7-8 | 24.5-25.5 / 142-186 s | 0-1 | 0 |
| Lab freeplay | 50 m | 8-10 | 8-9 | 2.7-21 / 17-100 s | 0-1 | 0 |
| Lab challenge 180 s | 0 | 6 | 1 | - | 5 | 60 |
| Lab run90 | 0/25/50 | 4 | 0/1/3-4 | -/8/13-27 s | 4/3/0-1 | 0 |
| Campaign L1-L6 | any | 2 | 0-2 | 2-6 s | - | runs end at 20-26 s |
Findings: finding them is the bottleneck (locator cuts time 2-9x); the cap wastes spawns (stall 60-180 s); run90 gets spawns only at 0,0,30,60; nearly every spawn is backlog (toast only); campaign ends before first respawn. Add report-only tools/powerup-discovery-probe.mjs.

## 3. Reference patterns
Mario Kart (silhouette/colour, reveal beat), Fortnite drops (map-wide beam, hum growing with proximity), Hole.io (edge arrows), Katamari (capture feedback on the player object, chime), Vampire Survivors (magnet, zip-to-you, rarity flash). Juice: 50-90 ms hitstop, scaled shake, flash, particles, stinger; accelerating expiry blink + power-down sting; quiet open, steady middle, late surge.

## 4. Per-stage design ([P] presentation only, [S] sim change)
- Spawn [P]: 1.2 s telegraph (shrinking ground ring + falling sky streak) via output-only powerup_incoming {x,z,type,eta}; landing flash, shock ring, dust, sparks, shake 0.25. Three-tier announcement: empty-board arrival keeps encounter (offline); other spawns get an edge "DROP" chip; start pair gets one "2 POWER-UPS ON THE MAP" line. Whistle rising to landing thud, panned.
- Idle [P]: shaped per-type items 2.5-3 m (spiral, bolt, crown, shard, flame, hourglass), ring + ground halo; persistent 60 m light pillar (one InstancedMesh, fades near the player); 6 cached materials total. [S optional] wander 2.4 -> 1.6 m/s.
- Finding [P]: pooled edge arrows with distance, bigger/faster within 40 m, fade if ignored 20 s; proximity hum (loudest only); lock-on ring under 12 m. [S] magnet within r+4 m (10 m/s^2, cap 14 m/s), collect at r+1.2. [S] first start power-up placed 30-60 m from spawn.
- Capture [P]: hitstop 70 ms (major 110 ms) offline; visual-only in ranked/multiplayer; none under reduced motion. Pooled sparks (zero allocation), 2x shock ring, 120 ms type-tint flash at 18%, hole scale pop 1.0->1.18->1.0 over 220 ms, shake 0.35/0.8, name slam 0.65 s (majors keep 2.4 s offline), type tails for all 6, music duck -6 dB 400 ms, pill flies into tray.
- Active [P]: auras for all 6 (speed trails, chrono frost rim + 10% vignette); radial timer ring; "+4s" pop.
- Expiry: buff warning from 5 s, blink 2/4/8 Hz, ticks at 3/2/1, power-down sting, aura shatters into 12 shards. Ground leaving [S]: 6 s warning flicker, implode + pop, "missed" arrow ghost.

## 5. Pacing model [S]
- Cap = clamp(round(area/11000), 3, 5) (Lab/Chicago -> 4).
- Opening t < 0.2C: the 2 start items only. Middle interval I = clamp(C/10, 18, 30). Surge: one guaranteed drop at t >= C - max(25, 0.15C), may exceed cap by 1, landing 15-20 s after the T-60 meteor.
- Ground lifespan (owner 2026-09-27): an uncollected ground power-up disappears after 25 s, with the visible warning in its final 6 s (from 19 s). After a disappearance the next spawn waits about 45 s. Reverses the 2026-08-25 "no forced despawn" rule; replaces the earlier L = 2.5 x I formula and the relocate-at-cap alternative (both dropped).
- Ranked run90 is unchanged (owner 2026-09-27): keeps today's 0,0,30,60 cadence; no RANKED_SIM_VERSION bump for pacing.
| Mode | C | Today | Proposed | Max |
|---|---|---|---|---|
| run90 (ranked) | 90 | 0,0,30,60 | unchanged | 4 |
| challenge3m | 180 | 0,0,30..150 | 0,0,36,54..144,158(surge) | ~9 |
| freeplay/level | 300 | 0,0,30..270 | 0,0,60,90..240,255(surge) | ~9 |
Targets: with 25 m sight + arrows, Lab median time-to-collect <= 12 s and <= 15% uncollected; never > 60 s at cap.

## 6. Ranked impact
All [P] and powerup_incoming: no bump (pin replay hash unchanged). Pacing (cadence, surge, 25 s lifespan) does not apply to ranked run90, so no bump for pacing (owner 2026-09-27). Magnet, annulus, wander and cap-by-area still need one bump 4 -> 5 if they ever reach ranked; deferred. Offline sim hitstop: test ranked/multiplayer/reduced-motion never hold ticks.

## 7. Perf budget
<= +8 draw calls for 5 power-ups; <= 0.25 ms desktop / 0.5 ms phone per frame; pooled arrows (no per-frame DOM churn); zero allocation on capture (replaces per-particle materials in spawnPowerUpCollectBurst/spawnPowerUpSpawnBeams); <= 32 particles per burst (perfMode 12); sim <= 0.02 ms/step; one proximity loop; Lab+Tokyo p95 regression <= 0.3 ms, no new > 50 ms frames.

## 8. TDD tests
1 powerup-pacing: cap by area, interval formula, opening quiet, one surge after meteor, cap exceeded by at most 1. 2 lifespan: despawn at 25 s, warning from 19 s, next spawn about 45 s after a despawn; ranked run90 schedule unchanged. 3 powerup-magnet: r+3.9 m reaches in 1 s, r+4.1 m doesn't move, bit-identical. 4 annulus 30-60 m for 50 seeds x 3 scenes. 5 RANKED_SIM_VERSION stays 4 and ranked replay hash unchanged. 6 powerup_incoming exactly 72 ticks early, hash identical with/without listener. 7 update powerup-storm-rework P1/P2/P4 (superseded, dated). 8 hitstop durations, no sim hold in competitive/multiplayer/reduced motion. 9 pure computeEdgeArrow (8 bearings, portrait safe area). 10 no new THREE materials in burst/beam/add paths; pillars InstancedMesh. 11 cinematic-arming-guard three-tier announcement. 12 expiry warning at 5 s, ticks 3/2/1, one power-down sting per buff end. 13 power-overlay-retirement stays green (flash <= 18%, <= 120 ms). 14 discovery probe before/after each phase. 15 validate-changed ALL PASS + earthquake-cinematic-selftest.

## 9. Rollout
0 probe + powerups.md doc fix + baseline. 1 Lab only, [P] only behind labFx (scene gallery); owner review + mobile perf. 2 [P] everywhere, three-tier announcements, hum, offline hitstop; re-run probe. 3 [S] in Lab unranked first, then single 4 -> 5 bump with ranked seeds, board note, STATUS entry. 4 campaign parity (28 s drops get expiry FX) and multiplayer checks.

## 10. Owner decisions
Owner guidance 2026-09-27: add no complexity beyond what is needed unless it affects performance. Pure extras are DEFERRED: [S optional] wander slowdown, magnet, start annulus, cap-by-area, lock-on ring, proximity hum, "missed" arrow ghost, hole scale pop, music duck, aura shatter shards, type tails for all 6.
1. Ground lifespan. Decided by owner 2026-09-27: 25 s lifespan (inside the 15-30 s window), warning in the final 6 s, next spawn about 45 s after a disappearance. Relocate alternative dropped; 2026-08-25 "no forced despawn" reversed.
2. Surge may exceed cap by one. Decided by lead 2026-09-27: yes.
3. Capture freeze-frame. Decided by lead 2026-09-27: offline-only and brief; visual-only in ranked/multiplayer.
4. Ranked 90 s cadence. Decided by owner 2026-09-27: not changed; ranked stays as-is, no RANKED_SIM_VERSION bump for pacing.

Critical files: js/powerups.js, js/voxelsim.js, js/voxelworld.js, js/main.js, js/power-presentation.js.
