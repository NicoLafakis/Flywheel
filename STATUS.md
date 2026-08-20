# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-19

This is a board, not a changelog. One line per shipped item; the detail lives in
the linked `.wiki` page and in `git log`. Older history: `CHANGELOG.md`.

---

## Baseline

- **Brand**: *Flywheel — A sprocket's story*. Branded landing screen over a live
  city backdrop, block wordmark, legal footer.
- **Campaign**: 29 metropolises across 7 regional Acts + a Prologue
  (`js/citycatalog.js`). **16 are `PLAYABLE`** (The Lab, Sydney, Auckland,
  Singapore, Bangkok, Hong Kong, Seoul, Beijing, Tokyo, Mumbai, Chicago, Lower Manhattan, Brooklyn, Upper Manhattan, Boston,
  Cambridge) — Act 0 (Prologue), Act I (Pacific Gateway), and Act II (Asian Megacities) are 100% COMPLETE and PLAYABLE; the rest are `DEVELOPMENT` and gated in the UI. Unlock ladder is 100%
  clear of the preceding *playable* city.
- **Run rules**: 5-minute clock, 100% full-clear goal, 60 deterministic coins
  per city, plus a 3-minute challenge tier. Ranked THE RUN (Chicago) is 90 s.
- **Boards**: public ranked boards with server-replayed trace verification;
  local/cloud profile fallback and a signed outbox. Offline play always works.
- **Audio & quality**: 19 streamed tracks, pause-menu picker with unlock gating,
  independent mix controls, HIGH/LOW quality tiers.

---

## Active focus

- **Act I map completion** — every Act I city built to the voxel count declared
  in its catalog entry, exactly. Sydney, Auckland and Singapore done — Singapore
  is `PLAYABLE` at 22,000 blocks / 571 camera blockers with zero uncovered tall
  cells, and its `singapore` section plus `tools/validate-singapore.mjs` both run
  green. `.wiki/features/act-i-pacific-completion/`.
  **Closed 2026-08-19:** the 1,241-block budget close-out course used to stand
  entirely inside the Marina Bay water rect, rendering as a flat grey mat on the
  water. No probe could see it — `probeWaterOverSurfaces` compares decor rects,
  and a physical block standing in water is not a decor rect — so it was green
  the whole time. The lanes now walk SOUTH from the bank across the boardwalk
  instead of north into the bay, with occupancy, spawn and water skips; ground
  blocks wholly inside the water rect went 1,377 -> 136 (the remainder is the
  Shoppes podium's west face and the two moored launches, both legitimate), the
  count held at exactly 22,000, and blockers held at 571 with 0 uncovered.
  Also closed: `tools/pw/singapore-shots.mjs` was broken on the same retired
  `_buildScene` prototype seam that had broken `tools/validate-singapore.mjs` —
  two callers, one fix — and now runs green on `await loadScene('singapore')`
  with `canvas.toDataURL()` in place of `page.screenshot()`. Nothing else in the
  repo is on that seam; `tools/probe-aniso.mjs` uses the gallery fall-through,
  which is still valid and still runs.
- **Camera Bézier occlusion smoothing (The Lab only)** — C¹ cubic Hermite pitch
  transitions and critically-damped roof-climb easing, behind a per-scene flag.
  `.wiki/features/camera-bezier-smoothing/`, ADR-0022.
- **Global campaign & Sprocket storyline** — 29-city world tour, mission
  dossiers, progressive unlock ladders. Complete paperwork: 29 Marketing
  Engine modules, Where's Waldo target structures, Carmen Sandiego intel clues,
  Sub-60s speedrun extraction, 4 quadrant perks, Blueprint Workbench UI spec,
  and Save Schema v26 (ADR-0023). Ready for Phase 3 implementation.
  `.wiki/features/global-campaign/`.
- **Multiplayer multi-hole & join polish** — 6-player invite lobby, PvP hole
  swallowing, per-player coin isolation. `.wiki/modules/multiplayer.md`.
- **Cambridge Phase 7** — 44 easter eggs, 11 ground glyphs, championship belts.

- **Singapore exceeds the frame budget in real play — the only city that does.**
  With the hole growing as it eats (what actually happens in play), Singapore
  costs **18.03 ms/step median against a 16.67 ms budget — 108%**, for the sim
  alone before rendering, on a mobile-first game. Next worst are Auckland at 62%
  and Cambridge at 55%; every other playable city is at or under 12%. Measured
  across all 11 scenes, 3 round-robined reps × 200 steps, median and min.
  `tools/pw/hero-attack-perf.mjs`.
  **Cost tracks blocks concurrently IN MOTION, not map size and not component
  size.** Log-log across 11 cities: active debris r=0.727 (exponent ≈1.80),
  largest component r=0.318, total blocks r=−0.444 (*anti*-correlated — the four
  biggest cities are four of the five cheapest). Boston's largest component is
  11,739, **1.83× Singapore's**, at 7% of budget; Chicago's 6,512 is *larger*
  than Singapore's at 1%. Singapore is expensive because the Sands, undermined,
  dumps an unusually large fraction of itself at once for its size.
  The shipped device-tier lever is not the fix (`debrisCap` 280 /
  `contactBudget` 200 moved it ~10% with debris essentially unchanged).
  **Owner's call, three options, no work done on any of them**: (a) accept 108%;
  (b) incremental / dirty-region support propagation — the durable fix, and
  justified beyond Singapore by the 1.80 exponent, since a map dumping twice the
  debris would cost ~3.5× and nothing structural prevents one; (c) reshape the
  hero, which is **not** supported by this evidence and is not recommended.
  > **Correction — an earlier figure of 15.33 ms / 92% was wrong, and was on
  > this board.** It came from an uncontrolled comparison: the hole GREW while
  > eating, so Singapore finished at r=8.4 having eaten 3,273 blocks while
  > Boston sat at r=6.0 having eaten 361. Each arm ran a different experiment,
  > measuring how much each city happened to be engaging rather than the cost of
  > attacking it. Controlled, Singapore is 5.39 ms — **32%**, not 92%.
  > Two things made it controlled, and the first is the trap: pin `size`, **not**
  > `radius` — radius is recomputed from size every step, so an assigned radius
  > is silently overwritten on frame one and the hole reverts to 1.1 m while the
  > harness reads plausible numbers forever. And place the hole at the
  > **ground-footprint** centroid of the component, since a tall tower's 3D
  > centroid is up in the air and parks the hole beside the thing it is meant to
  > undermine. The 108% figure above is the *growth-allowed* run, which is a
  > deliberate play-realism measurement rather than a controlled comparison, and
  > is labelled as such.
- **Rip-rap palette: a third of every apron's colours never rendered.** The
  scatter expression `(Math.round(x * 2) + lane * N) % 3` is wrong twice over,
  and both halves shipped. **Coprimality**: with `N = 3` the per-lane term is a
  multiple of the modulus and cancels, so every lane gets an identical stripe —
  corduroy running perpendicular to the shore. **Sign**: JS `%` keeps the
  *dividend's* sign, so `-2 % 3` is `-2`, and the colour ternary funnels every
  negative index into the third grey. Auckland's 21 stones all sit at negative
  x, so the shipped split was **14 / 7 / 0 — the middle grey never appeared at
  all**. Fixed to a coprime lane term with a floor-mod:
  `(((Math.round(x * 2) + lane * 2) % 3) + 3) % 3`. Now 7/7/7.
  Two instances, both fixed, found by sweeping the idiom rather than the value:
  Auckland (both halves) and Singapore (coprime already right in the copy,
  **sign not** — 416/304/521 across 1,241 stones, now 416/415/410). No third:
  the only other `% 3` in `js/` are vendored three.js and an axis index 0..2.
  Geometry is bit-identical and counts hold exactly (16,000 / 22,000, blockers
  115 / 571, mass unchanged); `sceneFingerprint` hashes `b.color`, so the
  fingerprints move — auckland `6c1b3a42` → `4447ccb4`, singapore `3200114096`
  → `790920319` — and **no code constant anywhere pins either**.
  Guarded by one shared probe over both scenes, `tools/probe-lane-modulus.mjs`,
  not two copies — a second copy of a check is how the economy ladder above
  ended up half-retired. Its balance floor (0.75) was set from **both** arms
  measured first (0.583 broken, 0.986 fixed), so it is not fitted to either, and
  it skips loudly below 12 stones where an even 3-way split is not achievable —
  a threshold derived from the population must never make a small population
  illegal.
  **The refactor to a shared probe nearly disarmed it**, which is the part worth
  keeping: deriving the sample domain from the built stones made the corduroy
  check *undecidable* for Auckland, because all 21 of its stones sit at negative
  x and that property is only meaningful at x ≥ 0 — so the shared probe reported
  Auckland clean at HEAD on the exact fault its inline predecessor caught. The
  domain restriction was an exclusion zone with the defect inside it. Now the
  two properties sample deliberately different domains: the range check uses the
  scene's real domain so it quotes indices that genuinely occur, the corduroy
  check uses a fixed non-negative sweep because `lane * 3` is wrong wherever it
  is written. Caught only by running the refactored guard against the *bad*
  commit; green after a refactor proves the code passes, not that the guard
  still works.
- **Test-suite integrity — the suite was red on `main`.** Declaring Flywheel's
  real commit gates in `.sop-gates.json` (the attestation harness had been
  discovering gates only from `package.json`, which this repo does not have, so
  it wrote `PASS … 0 gate(s) ran` receipts) meant running them, and three
  defects fell out — all pre-existing at `origin/main`, proven by `git archive`
  across five trees. `sfx-event-guard.test.mjs` fails 16/32 because its
  positional source extraction from `js/main.js` now captures a nested
  `tutorialManager` arm, so fifteen assertions report an audio regression that
  does not exist; `economy-consistency.test.mjs` still asserts the retired
  size-as-progression coin ladder that `validate-campaign.mjs` replaced with the
  role-based floor/ceiling model; and the `singapore` section is registered in
  `tools/validate.mjs` but absent from the orchestrator's `groups`, so a bare
  full run has never executed it. `.wiki/findings/2026-08-19-the-suite-was-red-on-main.md`.

### Open decisions (owner's call, papered not parked)

- **Quake crack: swallow vs. award** — the open fissure currently *consumes* any
  loose body that settles in it, with no score awarded. Awarding it instead is a
  one-line change; it is a scoring-fairness call, not a physics one.
- **Quake sequencing** — the sim is held for the 5.8 s cinematic, so the
  wavefront plays *after* the camera returns. Running the fixed-step loop during
  cinematic phases 4–6 would put the collapse under the camera tracking the
  fissure. `js/main.js`.
- **Quake cutscene's authored hard cuts** — shot 0→1 turns 2.76 rad in one
  frame, deliberately outside the release-continuity gate. Shot design.
  `.wiki/modules/render.md`.
- **Menu-angle inheritance for the level intro** — the establishing beat uses
  the level's own sun-scored `_introYaw0`. Adopting the title backdrop's live
  yaw is two lines but discards that scoring, and the backdrop is hard-coded to
  Brooklyn regardless of city. `.wiki/modules/render.md`.
- **Mid-play power-up spawn cutscene** — still fires on every ~30 s respawn, now
  smooth and cancellable. Suppressing it is a one-line change to the gate that
  already suppresses it at level start.
- **Cambridge's card now reads 72,943, down from 88,500** — a player-facing
  number was corrected *downward*, so it is flagged rather than buried. The card
  metric (`js/ui/screens.js:792`) and the Help walkthrough had claimed 88,500
  against a map of 72,943, overstating it by 15,557 blocks. The card now states
  the map that exists. **The 88,500 figure is not abandoned — it is the
  Cambridge 2 target and lives in the entry below**; the risk this trades
  against is that editing a promise down can quietly retire the work behind it,
  which is why the target is recorded rather than deleted. Reverse it if the
  card should advertise the target instead.
- **Cambridge 2** — the map was specced to *look* as detailed as 73k voxels, not
  to contain them. Rebuild at perceived density; the existing map stays. Root
  cause of the validator's 37-minute runtime. **Target: 88,500 blocks** — the
  figure the card used to advertise, kept here so correcting the card did not
  delete the goal. The validator-side half of the same problem (budget the
  excursion by work, not sim-seconds; fast modes) is planned, not built:
  `.wiki/plans/validator-optimization.md`.
- **Cloud progress sync** — shipped and **on by default**; `FW_PROGRESS_SYNC=false`
  on Vercel pauses it (both routes answer `503 SERVER_NOT_READY`, game unchanged).
  An emergency switch, not a deploy step. `.wiki/modules/cloud.md`, ADR-0021.

---

## Shipped state

### 2026-08-19

- **Auckland: Act I chapter 2, playable at exactly 16,000 blocks** — new
  `js/voxelscene-auckland.js`: the Sky Tower (an octagonal shaft, copper pod and
  full antenna mast to y 67), three Waitematā wharves on even-bay `pierDeck`
  timber, the Ferry Building, and Maungawhau / North Head / Mt Victoria as solid
  truncated scoria cones with sunk craters. Wired through `SCENE_IMPORTERS`,
  `SCENE_GOALS` (*TOPPLE THE SKY TOWER*), `AUTHORED_SCENES`, the music cue
  registry, and `CITY_CATALOG` (`DEVELOPMENT` → `PLAYABLE`, 10 playable). The
  count is hit by authoring the city deliberately short and closing the gap with
  a shore-first harbour rip-rap apron, so the last ~55 blocks are real armour
  rock rather than filler. 115 camera blockers, 0 overlaps, 0 unsupported
  blocks, 0 road conflicts; `step` 4.4 ms/frame mid-collapse on a 390×844 touch
  viewport. `tools/validate.mjs` section `auckland`,
  `tools/pw/auckland-playtest.mjs`.
- **Sydney: camera blockers restored, exact 14,120 blocks** — `buildSydney` ended
  with a bare `generateBlockers(sim, 6);`, but the function *returns* the rect
  list rather than assigning it, so the Act I opener shipped with `blockers=0`
  and the camera clipped through every landmark. Now assigned, as every other
  scene does: 250 blockers, 0 uncovered cells. Geometry also trimmed 189 blocks
  of surplus street furniture to hit the catalog's declared 14,120 exactly; no
  hero touched. Proven by a forced-yaw A/B (0/120 camera-inside poses with
  blockers on, 31/120 with them off). `1d7bda9`.
- **Fault Line Rupture: full-length wavefront** — QUAKE and the Seismic disaster
  used to resolve in one frame, stop after ~160 blocks and detach only the y≤3
  band. The trigger now queues a fault and `step()` releases it front-to-back
  over 1.5 s at ≤60 blocks/step, every storey detaching with height-scaled kick;
  the open crack swallows loose bodies for 6 s. `RANKED_SIM_VERSION` 2→3.
  `js/voxelsim.js`, `tools/quake-rupture.test.mjs`, section `quakeRupture`.
- **City Select: campaign wayfinding** — 8-segment progress strip, `CITY n / 29 ·
  ACT · i / n` breadcrumb, act-tab cleared/total counts, and a World Tour sheet
  listing all 29 cities with status, best %, unlock hints and tap-to-jump.
  Dossier collapses under 700px tall so PLAY stays above the fold at 360×640.
  `js/ui/screens.js`, `tools/mobile-ui.test.mjs`.
- **ADR-0022 camera smoothing, The Lab only** — S-curve occlusion pitch,
  first-order roof lift, distance-normalised blocker sweep; all other cities
  bit-identical legacy (48k-sample parity). The Lab gains a 3-tower testbed and
  its first `cameraBlockers` (191). `tools/camera-smoothing.test.mjs`.
- **City Select: act-rail clipping fix** — the rail is a scroll container with
  automatic min-size 0, so it shrank to its own padding inside the column flex
  and clipped the tab pills on every viewport. `flex-shrink: 0`.
- **City Select: card-state cleanup** — status pill replaced by an on-card
  CLEARED passport stamp with an independent 3-MIN challenge seal; faded body +
  sticky lock bar naming the gating *playable* city; `PLAY {city}` CTA (no
  `(5 MIN)`); 29-dot rail gated off behind `SHOW_CITY_DOTS = false`.
- **Global Campaign Phase 2** — Act filter tabs, Sprocket Mission Dossier cards,
  Ready Gate narrative briefing, victory debrief cards. `tools/campaign-ui.test.mjs`.
- **Global Campaign Phase 1** — 29-metropolis roster across 7 Acts, narrative
  transmissions, hero rosters, `PLAYABLE`/`DEVELOPMENT` gating, monotonic economy
  ladders. `tools/validate-campaign.mjs`.

### 2026-08-18

- Mobile pinch/expand zoom surfaced across Ready Gate, speech bubbles and pause.
- Just-in-time milestone onboarding replacing the rigid step checklist.
- Device detection & contextual controls (`js/device.js`) — touch vs. keyboard.
- Mobile-first UI & navigation overhaul: ≥48px targets, safe-area insets.
- Adaptive portrait FOV (`V = 45°/√aspect`) killing mobile tunnel-vision.
- Interactive in-game onboarding & 5-step walkthrough (`js/ui/tutorial.js`).
- Sydney sandbox first authored in strict min-corner geometry.

### 2026-08-17

- The Lab architectural realism: zero-falling spawn physics, vector surfaces,
  stop lines, mast-arm signals; HUD progress bar and 95% endgame beacons.
- The Lab expansion: monuments, mid-rises, supertalls, cantilever villas.
- The Lab 2 m structural bay fragmentation enabling fluid collapse.
- Cloud progress sync (save schema v25, ADR-0021).
- Keyboard steering angular acceleration ramp.
- Power-up wild spawn encounter & overhead camera.
- Level intro camera: establishing hold → overhead rise → dive.
- Excursion harness advances on arrival, not on the clock.
- Inaudible sounds no longer fatigue their sample.
- Multiplayer match start is an act, not a side effect of capacity.
- Mobile shop bottom nav undocked from its own scroll container.
- Voxel event audio restored (eat, combo ladder, stingers, derailment, tornado).
- Partner skin approval gating & coin refund (v24); hole speed 1.4×→1.8× (v23).
- Automatic player names, one all-time leaderboard, guest run adoption.

### 2026-08-16

- Economy corrections; silent victory podium fix; host-authoritative match clock.
- Interactive help menu, walkthrough, FAQ & tips.
- Multiplayer scorecard/podium; 10 s combo meter; 3-minute city challenges.
- Multiplayer multi-hole system + 7 basic color skins; ADR-0020 menu wiring.
- Level 1 six-player invite lobby; legacy multiplayer scrapped and rearchitected.
- Demographic cohort playtesting (marketing professionals 30–55).

### 2026-08-15 and earlier

- Mobile game shop & multi-rank stat upgrades; gameplay mechanics polish.
- Strict TDD adopted as the mandatory standard.
- Power-up lifecycle, anime overlays, endgame beacons, scheduled disasters.
- Fault Line Rupture super-move, cinematic and pickup-sequence restorations.
- SIZE 24 ladder & proportional scaling; tiered coin economy.
- Tokyo mega-metropolis expansion, daytime palette and geographic accuracy.
- 19 rendered audio masters; boot progression and title autoplay fixes.
- 5-minute level duration & perimeter voxel containment.
- Fast startup & 2-stage menu flow; in-game GUI hierarchy overhaul.
- Kenney-inspired city surface textures; visual polish stages 2–6.
- Player identity chip, legal pages, score integrity (T-301..T-312).
- Parallelized validator suite & Cambridge soak opt-in; debris retirement (ADR-0018).

Older: `CHANGELOG.md`.
