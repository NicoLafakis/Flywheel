# Finding: Act II scene geometry has road/water/idle-stability defects, newly surfaced by wiring the gate

Found 2026-08-20, in the same session that closed
`REVIEW-2026-08-20-act-ii-megacities-commit-198ca4b.md` and landed ADR-0024.
That work registered `section('seoul', ...)`, `section('beijing', ...)`,
`section('bangkok', ...)` and `section('mumbai', ...)` in `tools/validate.mjs`
(the standard per-city probe pack: `probeCellOwnership`, `probeCameraBlockers`,
`probeBoundsRect`, `probeRoadConflicts`, `probeWaterOverSurfaces`,
`probePlacementStep`, `probeIdleStability`, matching `validateSingapore`'s
shape). Those probes had never run on these four scenes before — Hong Kong is
excluded from this pass by explicit instruction (concurrent edit elsewhere)
and is not part of this finding. Running them for the first time is red.

## Scope note
This finding is deliberately **not remediated** in the session that wrote it.
That session's authorized file scope was `tools/validate.mjs` and
`js/citycatalog.js` only; the defects below live in
`js/voxelscene-{seoul,beijing,bangkok,mumbai}.js`, which is scene-authoring
work requiring judgment about intended city layout, not a wiring fix. Per
CLAUDE.md rule 13 this is papered immediately rather than left in chat; the
next session with scene-file authority should pick it up directly from this
doc and the repro command below.

## Repro
```
FW_VALIDATE_SECTIONS=seoul,beijing,bangkok,mumbai node tools/validate.mjs
```
10 failures, all real (not a harness bug — `probeRoadConflicts` and
`probeWaterOverSurfaces` are the same shared probes Sydney/Auckland/Singapore
already pass; see `tools/validate.mjs` for their definitions, ~line 507-540).

## Findings

| # | City | Probe | Evidence |
|---|------|-------|----------|
| G1 | seoul | `probeRoadConflicts` | 3556 physical blocks inside a roadway rect, first `concrete/2m at (16,1,-54)` |
| G2 | seoul | `probeWaterOverSurfaces` | roads rect `(-26,-54 4x30)` is under water rect `(-70,-54 140x28)` — water paints over it |
| G3 | beijing | `probeRoadConflicts` | 6260 physical blocks inside a roadway rect, first `concrete/2m at (20,1,-44)` |
| G4 | bangkok | `probeRoadConflicts` | 4877 physical blocks inside a roadway rect, first `concrete/2m at (-20,1,-4)` |
| G5 | bangkok | `probeWaterOverSurfaces` | cobbles rect `(-38,-46 20x16)` is under water rect `(-70,-54 140x28)` — water paints over it |
| G6 | bangkok | `probeIdleStability` | 4 blocks non-static after 3s idle at spawn |
| G7 | bangkok | `probeIdleStability` | 4 blocks eaten during 3s idle at spawn |
| G8 | mumbai | `probeRoadConflicts` | 4468 physical blocks inside a roadway rect, first `concrete/2m at (10,1,-20)` |
| G9 | mumbai | `probeWaterOverSurfaces` | roads rect `(-54,6 108x5)` is under water rect `(-70,-20 22x88)` — water paints over it |
| G10 | mumbai | `probeWaterOverSurfaces` | plaza rect `(-22,-38 34x18)` is under water rect `(-70,-54 140x26)` — water paints over it |
| G11 | hongkong | `probeWaterOverSurfaces` | plaza rect `(-10,-32 20x18)` is under water rect `(-70,-42 140x28)` — water paints over it |

`probeRoadConflicts` (G1/G3/G4/G8) fires on every physical block that overlaps
a `sim.sceneDecor.roads` rect and is neither a listed vehicle nor under a
declared overhead span — the counts (3556-6260 blocks per city, roughly 10-16%
of each city's total) suggest buildings/decor were placed without querying
the roads list at all, not a few stray blocks. This is a different failure
mode than F7 in the megacities review (`ROAD_SPANS = []` making the overhead-
span exemption vacuous) — this is the base collision check itself failing,
which is not vacuous on an empty list.

`probeWaterOverSurfaces` (G2/G5/G9/G10) fires when a road/plaza/cobbles rect
sits under a water rect in the decor draw order, so the ground surface never
renders — the water plane paints over it.

`probeIdleStability` (G6/G7) is scoped to bangkok only and much smaller in
magnitude (4 blocks) — likely a local spawn-point placement issue distinct
from the road/water pattern above, worth checking separately.

## Addendum — Hong Kong wired 2026-08-20, later same session

Hong Kong's scene file and standalone validator landed at commit `c02ea4a`
(concurrent session), after which `js/voxelscene-hongkong.js` was wired into
`tools/validate.mjs` the same way seoul/beijing/bangkok/mumbai were above
(`section('hongkong', validateHongKong)`, preload entry, `groups` row — see
ADR-0024). Running its probes for the first time surfaced one defect, same
class as G2/G5/G9/G10: G11 above. `probeRoadConflicts` is clean for hongkong
(zero conflicts) despite `HONGKONG_ROAD_SPANS = []`, unlike G1/G3/G4/G8.

Repro: `FW_VALIDATE_SECTIONS=hongkong node tools/validate.mjs` — 1 failure
(G11). All wiring gates (`declaredBlockCounts`, `scenesWinnable`,
`audioCoverage`, `playableCitiesGated`, `orchestratorCoverage`) pass with
hongkong included — this is a scene-geometry defect, not a wiring gap.
Declared block count (32000) matches the built count, so no catalog
correction is needed. Not remediated here, for the same reason G1-G10 were
not: fixing it requires judgment about hongkong's intended plaza/water
layout, which is scene-authoring work outside this pass's file scope.

## Suggested next steps (not started)
1. For each city, read `sim.sceneDecor.roads` / `.water` / `.plaza` /
   `.cobbles` against the block-placement code in the matching
   `js/voxelscene-<city>.js` to find where decor rects and physical placement
   diverge.
2. Fix road conflicts first (largest counts, all four cities) — either move
   the colliding geometry or correct the declared road rect footprint,
   whichever matches the intended city layout.
3. Fix water-over-surface overlaps (seoul, bangkok, mumbai, hongkong) by
   narrowing the water rect or moving the road/cobbles/plaza rect so they no
   longer overlap.
4. Investigate bangkok's 4-block idle instability separately — smaller,
   possibly a spawn-adjacent placement bug rather than a road/water one.
5. Re-run `FW_VALIDATE_SECTIONS=hongkong,seoul,beijing,bangkok,mumbai node tools/validate.mjs`
   after each fix; it must reach 0 failures before Act II's release gate is
   genuinely green (currently only wired, not clean).

## Resolution (2026-08-20)

Picked up by a follow-on session with `js/voxelscene-{seoul,beijing,bangkok,mumbai}.js`
authority. Per finding, classified each `probeRoadConflicts` cluster into
Bucket A (missing span declaration over real elevated/bridge structure — safe
to fix via `*_ROAD_SPANS` or decor-rect correction) or Bucket B (genuine
ground-level block placed in a road/water rect by the scene's unguarded
"budget close-out" filler loop or a hand-authored building/landmark — not
safe to fix without moving physical geometry, forbidden this pass). Fixes
were decor-rect-only (`sim.sceneDecor` water/roads rects, `*_ROAD_SPANS`
arrays); no `bldg()`/`wall()`/block-placement code was touched.

- **G1 (seoul, `probeRoadConflicts`)** — REMAINS, reduced 3556 → 2971 by the
  G2 fix (removing the two bridge road rects eliminated their conflict zones
  entirely). Three Bucket B roads left: road[0] Olympic-daero (~1416 blocks,
  pure uniform filler), road[1] Teheran-ro (~1236 blocks, mixed-material
  building encroachment consistent with a palace-wall/tower base built
  directly on the declared street), road[5] Sejong-daero (~319 blocks,
  includes a statue pedestal built on the declared street). All grounded
  from y=0, no elevated-only structure to declare a span over.
- **G2 (seoul, `probeWaterOverSurfaces`)** — FIXED. Removed the Mapo Bridge
  and Banpo Bridge entries from `roads.push(...)` in
  `js/voxelscene-seoul.js`, matching the established Brooklyn/Chicago
  convention that a bridge deck crossing water gets no `roads` decor rect at
  all (the physical deck alone represents the crossing).
- **G3 (beijing, `probeRoadConflicts`)** — REMAINS unchanged at 6260. No
  Bucket A entries found — every conflicting structure is grounded/
  continuous from y=0 to full height, not an elevated span. road[2] Olympic
  Blvd (512 blocks, Bird's Nest Stadium south facade wall overlapping the
  road at z40-41), road[4] Dongdaqiao Road (524 blocks, CCTV Headquarters
  tower base + west leg + cantilever overlapping x18-38,z-44..-24 from y=0
  to y=48), roads[0]/[1]/[3] (~5224 blocks combined, pure uniform filler).
  No water-decor overlaps exist for beijing (G3 was the only beijing
  finding).
- **G4 (bangkok, `probeRoadConflicts`)** — REMAINS unchanged at 4877. Mix of
  pure filler (roads[0],[4],[5]) and multi-material landmark encroachments:
  road[1] Na Phra Lan (2232 blocks — Grand Palace walls, Dusit Maha
  Prasat/Phra Sri Rattana Chedi at low-to-mid height, plus BTS Skytrain
  piers grounded at y=0), road[2] Rama I (226 blocks, small monument
  encroachment), road[3] Sukhumvit (38 blocks, BTS terminal pier). All
  grounded, Bucket B.
- **G5 (bangkok, `probeWaterOverSurfaces`)** — FIXED. Split the single Chao
  Phraya water rect in `js/voxelscene-bangkok.js` into 5 pieces, notching
  around both Wat Arun cobbles and Wat Pho cobbles. Wat Pho was a hidden
  second overlap masked by the probe's `.find()` (first-match-only) behind
  the originally-reported Wat Arun one — verified zero remaining overlaps
  with a standalone rect-math script before editing the real file.
- **G6 (bangkok, `probeIdleStability`, non-static)** — REMAINS. Diagnosed
  precisely: 4 filler-grid concrete blocks (0.5×0.5×0.5) sit within/adjacent
  to the default spawn hole at (0,16) radius 1.1. Same unguarded
  filler-loop root cause as G4 — the close-out filler paints a flat grid
  with no keep-clear zone around spawn. Bucket B, requires filler-loop code
  change.
- **G7 (bangkok, `probeIdleStability`, eaten)** — REMAINS. Same 4 blocks as
  G6, consumed by the hole during the first idle steps. Bucket B, same
  cause.
- **G8 (mumbai, `probeRoadConflicts`)** — REMAINS, reduced 4468 → 4322 by
  the G9 fix. Remaining conflicts are Bucket B: filler-dominated
  roads[0]/[1]/[4], plus road[3] Marine Drive West Promenade with a
  continuous grounded structure (the Bandra-Worli Sea Link diamond pylon
  mast, y=0 to y=52 continuous) and road[2] Sea Link Connector small
  monument encroachment.
- **G9 (mumbai, `probeWaterOverSurfaces`)** — FIXED. Trimmed all three
  west-east road rects (D.N. Road, Colaba Causeway, Sea Link Connector) in
  `js/voxelscene-mumbai.js` from x-start -54 to x-start -48, removing a
  shared 6m sliver each dipped into the Marine Drive Back Bay water rect.
  Colaba Causeway and Sea Link Connector were hidden overlaps behind the
  originally-reported D.N. Road one (same `.find()` masking as G5).
- **G10 (mumbai, `probeWaterOverSurfaces`)** — FIXED. Split the Colaba
  Harbour water rect into 6 pieces, notching around both the Gateway
  Basalt Concourse plaza and the Taj Mahal Forecourt plaza. The latter was
  a hidden second overlap masked by `.find()` behind the originally-reported
  Gateway plaza one.
- **G11 (hongkong, `probeWaterOverSurfaces`)** — out of scope for this pass
  (hongkong excluded by explicit instruction, concurrent edit elsewhere).
  Untouched.

All fixes verified via `FW_VALIDATE_SECTIONS=<city> node tools/validate.mjs`
after each city, plus rect-overlap math scripts run before editing any real
file to confirm proposed decompositions left zero overlaps and conserved
area. Final combined re-run:

```
FW_VALIDATE_SECTIONS=seoul,beijing,bangkok,mumbai,orchestratorCoverage node tools/validate.mjs
```
6 failure(s) — down from 10. `orchestratorCoverage` unaffected (0 failures,
5 assertions). Remaining 6 (G1, G3, G4, G6, G7, G8) are all Bucket B:
genuine ground-level block placement (hand-authored landmarks or the
unguarded budget-close-out filler loop) that requires touching
`bldg()`/`wall()`-class block-placement code — explicitly out of this
pass's scope, same as this doc's original framing. Next step for whoever
picks this up: either give the filler loop road/spawn/water awareness
(likely clears most of the filler-attributable remainder in one change
per city) or hand-carve keep-clear zones, then separately adjudicate each
named landmark/monument encroachment (CCTV HQ, Bird's Nest, Grand Palace
walls, Sea Link pylon, King Sejong statue, Deoksugung-area building) on
whether the road or the landmark should move.

## Resolution — Filler-Loop Pass (2026-08-20, same session)

Picked up immediately after the pass above, once its "next step" recommendation
(give the filler loop road/spawn/water awareness) was read back as the concrete
plan. Five parallel agents, one file each (`js/voxelscene-{seoul,beijing,
bangkok,mumbai}.js` and `js/voxelscene-hongkong.js`), independently verified
against the live tree after each report.

- **G11 (hongkong, `probeWaterOverSurfaces`)** — FIXED. Split the Victoria
  Harbour water rect `(-70,-42 140x28)` into 3 pieces notching around the
  Star Ferry Pier forecourt plaza `(-10,-32 20x18)`; area conserved exactly
  (3920 → 3560 across the 3 pieces + 360 notch). No second hidden overlap
  found (checked all 5 plaza rects, both cobbles rects, all 5 road rects by
  hand). `FW_VALIDATE_SECTIONS=hongkong` now fully PASSES (0 failures).
- **G6/G7 (bangkok, `probeIdleStability`)** — FIXED, folded into the same
  filler-loop edit that fixed G4's filler portion (below): a
  `fillerExcluded(x,z)` guard added a radius-3 keepout around the spawn hole
  at (0,16), alongside the road/water exclusion. Both "non-static" and
  "eaten" failures are gone (0 failures, not even listed in the section's
  output anymore).
- **G1 (seoul, `probeRoadConflicts`)** — filler portion FIXED, landmark
  portion REMAINS. `fillerExcluded`-style guard added to Course B (the only
  course whose z-range reaches Olympic-daero); skipped cells relocate into
  Course B/C rather than being dropped. 2971 → **1744**. Course A (Han River
  "riverbed coping") was deliberately left able to sit inside the *water*
  rect — that's the intended design (coping under the river) and neither
  `probeRoadConflicts` nor `probeWaterOverSurfaces` gates physical blocks
  against water, only decor-vs-decor. Fixing the relocation surfaced a new
  spawn-hole regression (Course C's larger fill reached the hole) — closed
  with the same spawn-keepout pattern bangkok used.
- **G3 (beijing, `probeRoadConflicts`)** — filler portion FIXED, landmark
  portion REMAINS. Same exclusion pattern across all 5 filler courses (A-E),
  plus a Course F full-boundsRect fallback sweep to guarantee the total
  still lands on 38000 once large fixed-strip chunks got excluded. Also
  fixed a latent direction bug in Courses B/C (`rz -= 0.5` where the range
  comment said ascending) that was dormant before — the unguarded loop
  always hit `needed` before the bug could matter; once exclusion shrank the
  yield, the loops searched further and the wrong direction sent them past
  `boundsRect`. 6260 → **812**.
- **G4 (bangkok, `probeRoadConflicts`)** — filler portion FIXED, landmark
  portion REMAINS. Same pattern; water exclusion alone ate ~97% of Course
  A's yield (it's nominally the river channel by design), so a new Course E
  was added scanning the one z-band (-6..20) no prior course ever covered,
  to relocate the ~8226-block shortfall. Also fixed a `_block()` min-corner-
  vs-center rect-math bug found while building the exclusion check
  (mirrored `tools/validate.mjs`'s `rectsOverlap` exactly instead of
  re-deriving it). 4877 → **664**. First-fail block is now the Grand Palace
  west wall corner — a genuine landmark encroachment, not filler.
- **G8 (mumbai, `probeRoadConflicts`)** — filler portion FIXED, landmark
  portion REMAINS **and this doc's original attribution was corrected**.
  4322 → **160**. A diagnostic script bucketed every conflicting block by
  its own signature (filler is uniquely `matType: 'concrete'`, 0.5³, y-center
  0.25, one of 3 filler greys) rather than trusting the prior doc text — this
  found the "Sea Link pylon" attribution above was imprecise: the pylon's
  real footprint (`x28-32,z42-46` per its own placement call) does **not**
  overlap any road rect at all. The 160 remaining blocks are actually: the
  Chai Kettle Bot pedestal/kettle/spout on Colaba Causeway (the real
  first-fail block), the Rajabai Clock Tower library base on D.N. Road, the
  CSMT Corner Clocktower overlapping Marine Drive West Promenade by 1m, and
  the Bandra-Worli Sea Link's elevated deck (`x24-36,z58-62`, y8-10) on Sea
  Link Connector. That last one is worth flagging distinctly: unlike every
  other remaining landmark in this doc, it is **genuinely elevated** (not
  grounded from y=0) with `MUMBAI_ROAD_SPANS = []` — a legitimate Bucket A
  candidate (declare the span, don't move geometry) for whoever picks up the
  landmark-only remainder next, rather than Bucket B like the rest.

All 5 fixes independently re-verified against the live tree after each
report landed (not just trusted from the delegate's own output), including a
full combined re-run:

```
FW_VALIDATE_SECTIONS=seoul,beijing,bangkok,mumbai,hongkong,orchestratorCoverage,declaredBlockCounts,scenesWinnable,audioCoverage,playableCitiesGated,syntaxCheck node tools/validate.mjs
```

4 failure(s) — down from 10 (6 after the first pass, now 4). All four are
`probeRoadConflicts` landmark-only remainders (seoul 1744, beijing 812,
bangkok 664, mumbai 160); `probeIdleStability`, `probeWaterOverSurfaces`,
`orchestratorCoverage`, `scenesWinnable`, `declaredBlockCounts`,
`audioCoverage`, `playableCitiesGated`, and `syntaxCheck` are all fully
clean across all 16 PLAYABLE cities including hongkong. Declared block
counts held exactly (32000/38000/30000/34500/32000) through every filler
relocation — no city's total shifted.

**What's actually left, and why it stops here:** four hand-authored
landmarks/street-furniture clusters sit on a declared street with no
legitimate elevated span to exempt them (confirmed grounded at y=0, except
mumbai's Sea Link deck noted above): Seoul's Teheran-ro building + Sejong-
daero statue pedestal, Beijing's Bird's Nest Stadium facade + CCTV HQ tower
base, Bangkok's Grand Palace walls/chedi + BTS piers + a small monument, and
Mumbai's Chai Kettle Bot + Rajabai Clock Tower + CSMT Corner Clocktower.
Resolving these means either moving real, deliberately-placed landmark
geometry or reclassifying part of a declared street — a scene-authoring
design decision, not a mechanical bug, and out of scope for an automated
pass per this session's standing rule against blind content edits without
visual verification. Recommended next step for whoever picks this up:
render each city's affected corner from an orthographic top-down view (per
this repo's established level-review method) before deciding whether the
road rect or the landmark should move.

## Related
- `.wiki/findings/REVIEW-2026-08-20-act-ii-megacities-commit-198ca4b.md` — the wiring review this follows.
- `.wiki/adr/0024-a-playable-city-is-one-the-orchestrator-runs.md` — the ADR whose gate first exercised these scenes.
