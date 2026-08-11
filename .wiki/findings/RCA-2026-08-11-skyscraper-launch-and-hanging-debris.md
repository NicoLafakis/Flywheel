# RCA: Skyscraper blocks launch to roof height, and debris hangs or falls in slow motion

- **Date:** 2026-08-11
- **Status:** **Resolved.** Fixed by commit `235c82d` ("fix(sim): uniform gravity, no roof-snap teleports, no wall-scrape hover"), landed the same day as this RCA. All three mechanisms below were fixed atomically per the rollout constraint in §6. Regression coverage added: `js/voxelsim.gravity.test.mjs`. See [modules/voxel.md](../modules/voxel.md) for the current-state description of the fix.
- **Reporter:** Nico (product owner), observed live on the deployed game, Boston sandbox scene
- **Severity:** High. Core physics feel, affects every city scene, most visible on tall buildings (Boston, Manhattan, Chicago, Cambridge towers)
- **Investigator:** root-cause-analyst (read-only; no code was changed)

## 1. Symptom

As reported, verbatim in substance:

1. When the hole hits a skyscraper, blocks go flying vertically, almost 2x the distance up compared to normal buildings, and take much longer than expected to fall back down.
2. Some destabilized blocks on normal buildings just hang in the air, or fall at a much slower pace than others falling nearby.

Product expectation: gravity is uniform. Every block accelerates downward the same way, no per-block or per-building scaling, no slow motion. The reporter asked whether something applies a curve or easing to gravity.

Precise characterization after investigation: the "flying" is not ballistic at all. 95 to 96 percent of all upward block motion during a Boston collapse is positional (the sim moves the block's y coordinate directly), not velocity driven. Blocks at ground level teleport to the roof of the still-standing structure in a single 1/60 s step, and the teleport height equals the building height, which is why skyscrapers look roughly twice (actually up to 4x) as violent as low buildings. Separately, gravity genuinely is non-uniform per material (a deliberate founding design choice), and a side-contact bounce rule can cancel gravity every frame, holding blocks motionless in mid air indefinitely.

## 2. Root cause

**Confidence: confirmed** (numerically reproduced headless, exact code sites identified, all three mechanisms measured).

Three distinct mechanisms produce the two symptoms, and all three are founding design choices in the initial commit (`0e1c3e3`, 2026-08-03), not a regression:

1. **Roof-snap teleport (symptom 1, and the roof-perched "hanging" blocks).** The debris landing test uses `_topAt`, a 2D max-height field that returns the HIGHEST solid surface anywhere in the block's footprint column, and then snaps the block up onto it with no proximity guard: `if (b.y <= rest) b.y = rest` (`js/voxelsim.js:2132` and `js/voxelsim.js:2147-2150`). A debris block at ground level whose footprint overlaps the column of a still-standing tower (exactly what hole-eats-the-base creates) reads the tower ROOF as its "support" and is teleported there in one step. Teleport height = building height.
2. **Wall-scrape vertical bounce (symptom 2, true mid-air hover and slow fall).** Any contact with a standing structure, including a purely lateral facade scrape, reverses downward velocity: `if (b.vy < 0) b.vy *= -0.25` (`js/voxelsim.js:2120-2122`). The vacuum attraction presses debris against facades every step, so gravity's per-step tick (70/60 = 1.167 m/s) is reflected to +0.29 m/s every frame. The block reaches a stable oscillation around vy = 0 and hangs in open air indefinitely, or descends at a small fraction of gravity while touching a wall.
3. **Per-material gravity (symptom 2, "falls much slower than others nearby").** `_fallG(density)` scales gravity by material density: `tune.gravity * (0.4 + 0.6 * (density / 2))` (`js/voxelsim.js:1637`, constants at `js/voxelsim.js:48-55`). Measured in free fall: glass 44.3, concrete 70, steel 101.4 m/s^2, a 2.3x spread between blocks falling side by side. This was intentional ("game feel, not physics class", `js/voxelsim.js:50`), and the product owner has now overruled it: gravity must be uniform.

There is no easing curve on gravity anywhere, and the render layer applies no easing to block positions (`js/voxelworld.js:2354-2400` reads `b.x/y/z` directly).

## 3. Causal chain

Symptom 1 (skyscraper launch):

- **Trigger:** the hole eats a skyscraper's base; upper floors remain standing while base-floor blocks detach as debris at y around 0 to 2 m, and vacuum attraction (`js/voxelsim.js:2092-2101`) pulls them under and against the standing column.
- **Proximate cause:** the landing snap `b.y = rest` at `js/voxelsim.js:2147-2150` with `rest = _topAt(...) + sy/2`, where `_topAt` (`js/voxelsim.js:1698-1709`) returns the tower roof (29 m in Boston) because it is the max top over the footprint. The condition `b.y <= rest` is trivially true for a ground-level block, so the block is set onto the roof in one 1/60 s step.
- **Root cause:** the decision (initial commit `0e1c3e3`) to collapse 3D solid occupancy into a single-valued 2D max-height map (`_top`) and to treat "block is below the surface" as "block has landed on the surface". The representation cannot express "open air underneath a standing structure", which is precisely the state an undermined tower is in.
- **Contributing factors:** blocks then fall off the roof from 29 m, and glass falls at 0.64x concrete's gravity (mechanism 3), so the flight reads floaty and long. On low-tier devices the frame loop additionally drops sim time under load (`js/main.js:549-559`, tier `maxSubSteps`), which makes the whole collapse play in slow motion and lengthens the perceived hang; that one is a documented intentional trade, uniform across all blocks.

Symptom 2 (hanging and slow falls):

- **Trigger:** debris drifts against a still-standing facade (vacuum pushes it there every step), or lands on a roof it was teleported to.
- **Proximate cause:** the contact response at `js/voxelsim.js:2120-2122` reflects vy on ANY hit, including pure side contacts, cancelling gravity's tick each frame; plus `_fallG`'s 2.3x per-material acceleration spread.
- **Root cause:** (a) the contact response does not distinguish "landed on top of something" from "scraped the side of something", another initial-commit choice; (b) the deliberate density-scaled gravity in `_fallG`, now overruled by the product owner.

## 4. Evidence (numeric reproduction)

Headless probes (Node, importing `js/voxelsim.js` unmodified, Boston scene, seed `probe`, hole teleported to the tallest cell at (-96, -56), radius 3.2, 25 s at fixed 1/60). Probe scripts lived in the session scratchpad; their design is described in section 7 (regression tests) so they can be recreated.

- Free-fall acceleration measured per material (frames with no contact impulse): glass 44.3 m/s^2 (n = 3512), concrete ~70 excluding contact-polluted frames, steel 101.4 (n = 623), brick ~59 to 66. Matches `_fallG` arithmetic exactly (glass 0.8 density gives 0.64 x 70 = 44.8; steel 3.5 gives 1.45 x 70 = 101.5). Gravity is measurably non-uniform per material.
- Ascent decomposition over the full collapse: total upward motion 161 m ballistic vs 3105 m positional on the skyscraper (95 percent positional); 9 m vs 211 m on a low building (96 percent). Max single-step upward jumps: 30.9 m (default tier), 34.0 m (low tier), against a max observed upward VELOCITY of only 16 to 21 m/s, whose ballistic apex would be under 3 m. The flight is teleportation, not launch.
- Teleport events: 108 single-step upward jumps over 2 m on the skyscraper (94 of them over 10 m, landing at y = 29.5, the roof, flagged `_grounded`); 23 on the low building, all capped at exactly 7.0 m, its roof. Teleport height = building height, matching "almost 2x on skyscrapers".
- Hover census: 63 to 70 blocks per collapse stayed awake, airborne-flagged, at |vy| < 2 for 25 straight seconds. Classification at t = 25 s: most sit at y = 29.50 on the tower roof they were teleported to; two hover in TRUE mid air (y around 7.2, static support 4.7 to 5.7 m below, no loose block within 4.6 m) with vy = +0.23 and +0.29. The value +0.29 is exactly 0.25 x 70/60, the wall-scrape reflection of one gravity tick, fingerprinting `js/voxelsim.js:2122`.
- The max upward velocities of 16 to 21 m/s that do occur are the fixed 0.25 restitution applied to impact speeds from tall falls (sqrt(2 x 70 x 29) = 63.7 m/s x 0.25 = 15.9, matching the measured 16.0). Secondary effect, small next to the teleports.

Hypotheses tested and falsified:

- **Multi-hole cap starvation (commit `c02d5d2`) parking airborne debris.** Measured zero airborne `_budgetHold` blocks across all 1500 steps in all three runs, including a low-tier run where the hole walks away after 8 s. The parking path (`js/voxelsim.js:2090`, `2353-2364`) only ever caught grounded blocks in practice, because the awake prefilter excludes fast airborne bodies and near-apex slow ones were never in excess in these scenes. `c02d5d2` is exonerated; the defect predates it (initial commit) and reproduces on default (pre-tier-identical) tune.
- **Render-side easing.** `js/voxelworld.js:2341-2400` composes instance matrices from raw sim `b.x/y/z`; the only smoothsteps in that file belong to birds, glow quads and boats. Falsified.
- **The pair-separation solver (`_pushAxis`) launching blocks.** Its full-penetration correction is bounded by block extents (about 2 m max), and the 2026-08-07 investigation recorded in the code (`js/voxelsim.js:2540-2548`) already traced historical fountains to the since-fixed budget sinking. It cannot produce a 30 m jump. Falsified as the primary cause.
- **Fixed-timestep debt (`maxSubSteps`) as the per-block slow fall.** Real, but it slows the entire world uniformly on a struggling device (`js/main.js:533-559`); it cannot make one block fall slower than its neighbor. Kept as a contributing factor to "takes longer than expected" on phones, not a cause of the per-block symptoms.

## 5. Blast radius and siblings

- Every scene with tall structures: Boston, Manhattan, Upper Manhattan, Brooklyn bridges, Chicago, Cambridge towers. The gallery's low builds mostly hide it (7 m teleports read as a pop, not a launch).
- Sibling of the roof-snap: the chunk-member impact probe uses the same max-height field (`js/voxelsim.js:1965`), so a rigid chunk sliding beside a tall standing structure registers "impact" and shatters prematurely. Cosmetic next to the teleport, but the same representational flaw; fix optionally with the same guard.
- Sibling of the snap: `_capDebris` records `_sleepSupport = b.y - sy/2` (`js/voxelsim.js:2306`) and the sleep commit records `restTop` (`js/voxelsim.js:2217`) after a teleport has happened, so blocks fall asleep ON roofs they never physically reached, and wake/hang behavior downstream inherits the wrong resting place.
- The repose spill probe (`js/voxelsim.js:2180-2189`) also reads `_topAt` of neighbor columns; after the landing fix it behaves as designed (it compares roof-relative heights while actually on a surface), no change needed.
- Multiplayer: `js/net/` snapshots and the host-authoritative arena replicate whatever the sim does; peers faithfully replay the teleports today. A fix changes outcomes on every machine (see constraint below).

## 6. Fix specification

All three changes are in `js/voxelsim.js` only. No render change is needed. They are separable in principle, but see the determinism constraint: land them as ONE atomic commit.

**Fix 1: guard the landing snap (symptom 1, the launcher).**
In `_stepDebris`, capture the block's base height BEFORE integration (before `js/voxelsim.js:2103`), e.g. `const yPrevBase = b.y - b.sy / 2` taken pre-move, then at the landing test (`js/voxelsim.js:2132-2150`) accept a support surface only if the block was at or above it before this step's motion: `support` is valid for landing only when `support <= yPrevBase + EPS` (EPS around 0.05; the fast-fall crossing case is covered because the pre-move base was above the roof). When the max-height support is rejected (block is underneath or beside a standing structure), do not snap; find the real support below instead: walk the footprint columns downward from the block's base through `this.grid` exactly the way `_topRemove` already does (`js/voxelsim.js:1671-1675`), taking the highest solid top at or below `yPrevBase`, defaulting to 0 (bare ground). That walk is deterministic (grid state only) and bounded by build height. Apply the same pre-move-base validity test to the `topHit` probe at `js/voxelsim.js:2116` so a ground-level block beside a tower is not treated as touching its roof. Optionally apply it to the chunk-member probe at `js/voxelsim.js:1965` (prevents premature shatter against facades); if deferred, note it as known.

**Fix 2: bounce only on real vertical contacts (symptom 2, the hover).**
At `js/voxelsim.js:2120-2127`, split the response: keep `vx/vz` damping and the damage tick for any hit, but apply the `b.vy *= -0.25` reflection only when the contact actually has a floor character, i.e. when `topHit` (as corrected by Fix 1) is true, or when `_resolveStaticContacts` resolved along the y axis. The cheapest faithful signal: have `_resolveStaticContacts`/`_separate` report whether any push happened on 'y' with sign +1 (returning it or setting a per-call flag), and gate the vy reflection on that. A block scraping a facade then keeps falling at gravity while sliding, which is the expected feel.

**Fix 3: uniform gravity (product decision).**
Replace the body of `_fallG` (`js/voxelsim.js:1637`) with `return this.tune.gravity;` and update the comments at `js/voxelsim.js:48-55`. Both call sites (`js/voxelsim.js:1924` chunks, `js/voxelsim.js:2102` debris) inherit it. Glass now slams at 70 m/s^2 like everything else; that is the explicit product ask ("every block accelerates downward the same way"). Leave the density value itself in `MATERIALS` untouched (it still drives mass accounting, bonds and scoring).

**Determinism and rollout constraint (binding).**
ADR-0003's replay/keyframe determinism means these changes are protocol compatible but outcome changing: a host on new physics and a peer on old physics would still exchange valid messages while simulating different worlds. Land all three fixes in one commit, deploy atomically, and do not cherry-pick a subset to a different branch that can end up live simultaneously. The tune-default equivalence note at `js/voxelsim.js:376-383` concerns tier defaults, not this: changing physics is allowed, silently diverging between machines is not. `tools/validate.mjs` pinned expectations (eat counts, settle probes) WILL shift and must be re-baselined by the implementer in their own working tree (this session deliberately did not run it; it is hour-long and belongs to another session's tree).

**Regression tests to add with the fix** (headless, seconds not minutes, style of the probes used here; suggest `js/voxelsim.gravity.test.mjs`):

1. Teleport guard: boot Boston, hole at (-96, -56) radius 3.2, 25 s at 1/60; assert no non-chunk falling block ever gains more than 2 m of height in a single step (pre-fix measurement: 108 violations, max 30.9 m).
2. Uniform gravity: for every material, place a free block high over empty ground and assert measured dvy/dt equals `tune.gravity` within epsilon on every uncontacted frame (pre-fix: glass 44.3, steel 101.4).
3. No mid-air hover: after the same collapse, assert no awake block spends more than 3 s with |vy| < 2 while its base is more than 1 m above both the (corrected) static support and any loose block in its footprint (pre-fix: blocks hovering the full 25 s).

**Concurrent work overlap warning.** Two agent sessions are editing adjacent surfaces right now: `js/demo/arena.js` plus `js/net/*` (no overlap with this fix), and `js/voxelscene-chicago.js` with a possible additive mover seam in `js/voxelsim.js`/`js/voxelworld.js` (POTENTIAL MERGE OVERLAP with `_stepDebris`). The implementer must rebase against their landed state before touching `_stepDebris`, and re-run the mover seam's tests if that seam exists by then.

## 7. Prevention

- The class of bug is "a 2D summary of a 3D world answered a question it cannot represent". Any future consumer of `_top`/`_topAt` must state whether it needs "highest surface BELOW me" (support) or "highest surface in my column" (occlusion/camera); the two are only equal in open terrain. A one-line doc comment on `_topAt` making that distinction, added with the fix, closes the trap for the next caller.
- Physics invariants now have a numeric harness pattern (the probes above): per-step displacement bounds, measured acceleration per material, hover detection. Keep them in the fast test suite so any future "feel" tuning that reintroduces non-uniform acceleration or positional teleports fails a test instead of a playtest.
- Observability stays within existing tooling: the sim already exposes everything needed headless; no new services.
