# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-09-08

This is a board, not a changelog. One line per shipped item; the detail lives in
the linked `.wiki` page and in `git log`. Older history: `CHANGELOG.md`.

---

## Baseline

- **Brand**: *Flywheel — A sprocket's story*. Branded landing screen over a live
  city backdrop, block wordmark, legal footer.
- **Campaign**: 29 metropolises across 7 regional Acts + a Prologue
  (`js/citycatalog.js`). **24 are `PLAYABLE`** (The Lab, Sydney, Auckland,
  Singapore, Bangkok, Hong Kong, Seoul, Beijing, Tokyo, Mumbai, Dubai, Cairo,
  Athens, Rome, Paris, London, Amsterdam, Berlin, Chicago, Lower Manhattan,
  Brooklyn, Upper Manhattan, Boston, Cambridge) — Act 0 (Prologue), Act I
  (Pacific Gateway), Act II (Asian Megacities), Act III (Desert Horizons &
  Mediterranean Antiquity), and Act IV (European Capitals of Grandeur) are
  100% COMPLETE, VALIDATED, and PLAYABLE; the rest are `DEVELOPMENT` and
  gated in the UI. Unlock ladder is 100% clear of the preceding *playable* city.
  Acts III and IV had their landmarks rebuilt on 2026-08-23 — they had shipped
  as rectangular solids in the right places — and each scene now exports a
  `*_LANDMARKS` table that `probeLandmarks` and `probeCatalogHeroes` hold it to.
  The same pass un-broke Beijing, Bangkok and Mumbai, which were failing
  `probeRoadConflicts` at HEAD. See `.wiki/modules/voxel.md`.
- **Run rules**: 5-minute clock, 100% full-clear goal, 60 deterministic coins
  per city, plus a 3-minute challenge tier. Ranked THE RUN (Chicago) is 90 s.
- **Boards**: public ranked boards with server-replayed trace verification;
  local/cloud profile fallback and a signed outbox. Offline play always works.
- **Audio & quality**: 19 streamed tracks, pause-menu picker with unlock gating,
  independent mix controls, HIGH/LOW quality tiers.

---

## Active focus

- **Deployment identity (2026-09-08):** production currently comes from
  `Flywheel-v2` commit `28805e1`, not this legacy workspace. The legacy ranked
  API and cron are absent there. Remediation preview `flywheel-azk45ktwb`
  must not be promoted over that successor as a routine bug-fix release.
  A designated legacy acceptance environment and physical-phone target remain
  to be confirmed.
- **Bug remediation (2026-09-08), in progress:** ranked recovery and multiplayer countdown fixes pass targeted tests; countdown also passes 27 layout checks against the preview deployment. Sandbox bestSize omission/NaN repaired with a RED-proven test. The final full validator passed all 31 section groups (1867.0 s); physical-phone performance acceptance and live server-verdict verification remain open. See `.wiki/plans/bug-remediation-2026-09-08.md`.
- **LOW-quality deferred support loss (2026-09-08):** found while testing the
  real phone-quality path. A stationary hole could lose a deferred coverage
  recalculation and leave unsupported structures standing. RED scheduling
  regression reproduced it; pending work now drains on the next scheduled
  tick. Singapore stationary hero attack changed from 0 to 2,470 consumed blocks.
  Targeted tests and the updated preview LOW-quality flow pass (2,493 blocks
  consumed, no browser errors). Final full validation passed all 31 groups (1867.0 s). Synthetic
  4x CPU frame timing still misses the target; physical-phone results are unknown.


- **Act I map completion** — every Act I city built to the voxel count declared
  in its catalog entry, exactly. Sydney, Auckland and Singapore done and green
  (`singapore` section + `tools/validate-singapore.mjs`). The 2026-08-19
  water-course close-out and the `_buildScene`-seam harness repair are recorded
  in `.wiki/features/act-i-pacific-completion/` and `.wiki/modules/voxel.md`
  (§Singapore).
- **Construction-doctrine district (The Lab, north quarter)** — prototype for
  era-appropriate construction language: five beam-and-slab towers built from
  single large pieces (columns, floor plates, curtain sheets), the Corbel Gate
  monument and three cottages kept at brick grain, plus Doctrine Row street kit.
  4,581 blocks standing in for an equivalent ~44,000 half-metre cubes (89.6%
  saved); Lab is 20,348 total, bounds now z −95..45. Gated by the `labDoctrine`
  validator section (piece-volume contrast ≥10×, shape mix, overlap, road,
  stability). Uncommitted — under Nico's visual review. `.wiki/modules/voxel.md`.
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
- **Hong Kong Take Two (2026-08-25) — BUILT and committed in `20ae91c`, under Nico's visual
  review.** Local-only sandbox (`hongkong2`, not in CITY_CATALOG): the Victoria
  Harbour frame in **pieces** — **2,463** total, regenerated and verified 2026-09-08 after the texture detail
  pass (Nico's ceiling 4,000; 1,537 headroom), **0.0% cubic by count / 0.2%
  by volume outside the three historic zones**, standing in for ~379k
  half-metre cubes (99.3% saved). Gates re-raised RED first (current gate in source,
  cap 4,000 in the `hongkong2` section). The former approximations are now
  real geometry: BoC/HSBC chevron cross-bracing, Jardine porthole facade
  (~200 glass insets), octagonal Hopewell shell, Lippo overhanging pod
  plates; all background buildings articulated (podium/setback/crown), Star
  Ferry piers, trams, 28 vehicles, harbour traffic. Dev viewer now has
  free-look controls (orbit/zoom/pan, touch, WASD).
  Load: `tools/scene-view.html?scene=hongkong2`.
- **Debris never settles — retirement predicate can't see solver-supported
  bodies** (RCA-2026-08-24-debris-jiggle-never-settles.md, CONFIRMED by
  ablation). Two defects: the 1.02 separation skin parks piled bodies ~0.3 mm
  above the zero-tolerance grounded test so they never sleep (243 permanently
  awake on Boston); `_pushAxis` pumps embedded pairs through grounded bodies
  (~1 m visible jiggle). **FIXED 2026-08-25** (committed in `20ae91c`, riding the tornado
  rework's `RANKED_SIM_VERSION` 3→4): `_sepFloor` solver-support stamp +
  jam-latch alternative eligibility, and grounded bodies never pushed below
  support. Pinned by `tools/debris-settle.test.mjs` (opt-in, ~2 min): RED
  pre-fix, GREEN post-fix with final awake = 0. Post-storm sustained cost on
  Tokyo: 5.700 ms/step (145 awake forever) → 0.002 ms/step (0 awake). The
  Updated collision profiling and measurements are recorded below.
- **Skin rework and skinsheet atomicity:** committed in `20ae91c`.
  Withdrawn partner skins intentionally resolve to Classic; identical partner
  PNGs are expected. The skinsheet writer now validates before publishing
  generated assets; its regression suite passed again on 2026-09-08.
- **Collision performance remediation (2026-09-08), verification in progress.**
  The old 11-city report is superseded by a 24-city baseline. Growing-hole
  attack medians were Singapore 24.36 ms, Paris 25.64 ms and Auckland 17.32 ms.
  Numeric cell keys and indexed vertical support queries reduce those to
  13.98 ms, 17.18 ms and 12.30 ms respectively. Singapore's per-step p95 is
  still 21.52 ms; these are simulation timings, not sustained 60 FPS results.
  Profiles identify collision probes as the main measured opportunity;
  incremental structural-support propagation is not justified by this profile.
  All 24 cities pass comparison against the legacy grid and support algorithm.
  The full validator passed all 31 groups. Rendered viewer emulation shows an
  improvement but misses the frame target; final all-city timing and the
  actual phone-quality game path remain under verification. See
  `.wiki/findings/PERF-2026-09-08-collision-grid.md`.
- **Rip-rap palette bug: fixed, both instances (Auckland, Singapore).** The
  `% 3` lane-scatter expression was wrong twice (coprimality + JS sign) and a
  third of the apron colours never rendered; fixed with a coprime floor-mod,
  guarded by `tools/probe-lane-modulus.mjs` (one shared probe, deliberately
  split sample domains — the refactor-nearly-disarmed-it lesson lives in the
  probe's own header comments). Geometry bit-identical; both
  `sceneFingerprint`s moved, nothing pins them.
- **Test-suite integrity — the suite was red on `main`.** Declaring the real
  commit gates in `.sop-gates.json` surfaced three pre-existing defects
  (sfx-event-guard positional extraction, the retired economy ladder, the
  `singapore` section missing from the orchestrator's groups). Full detail:
  `.wiki/findings/2026-08-19-the-suite-was-red-on-main.md`.

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
- **Cambridge's card now reads 72,943, down from 88,500** — the card
  (`js/ui/screens.js:792`) and Help walkthrough now state the map that exists;
  88,500 is NOT abandoned, it is the Cambridge 2 target below. Reverse if the
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

- **Power-up spawn rules + tornado rework (2026-08-25, Nico — SUPERSEDES the
  2026-08-24 45–55 s pacing note)** — new spec: spawn cadence stays **30 s**,
  one spawn at a time, but power-ups now **accumulate on the board up to a
  maximum of 5** if the player ignores them (spawner pauses at 5; no forced
  despawn to make room). Tornado specifically: (a) cut its processing cost,
  (b) improve its visual, (c) improve its pathing, (d) duration → **20 s**.
  Recon done (2026-08-25); corrections to the spec's assumptions:
  - The tornado is NOT a power-up — it is the scheduled `StormSystem`
    cataclysm (`js/voxelsim.js:98`). Actual duration is **16 s** on long
    clocks / **12 s** in 90 s modes (`js/voxelsim.js:106-110`), not 15.
    Open Nico call: does the 90 s ranked mode also go to 20 s, or scale
    (e.g. 12→15)?
  - CPU cost: full linear block scan at 8.3 Hz to find ≤8 rip candidates
    (`js/voxelsim.js:198-238`) + support-graph invalidation each pulse +
    uncapped swirl walk of `_falling` (`:5416-5463`). A ready-made perf spec
    exists: `.wiki/plans/tornado-cataclysm-optimization.md`.
  - Pathing today is one random heading at 6.8 m/s with wall bounce, never
    re-rolled (`js/voxelsim.js:151-176`) — can loop a short bounce path.
  - Visual: wireframe cones + 6 torus rings, per-particle material allocation
    (no pooling), and the tornado group is never disposed (leak) —
    `js/voxelworld.js:2598-2699`, `:3252-3283`. Renderer work needs no
    version bump.
  - The four 30 s hardcodes are `js/sim.js:414`, `:424`,
    `js/voxelsim.js:1825`, `:5399` (two previously-cited lines were stale);
    consolidate into one shared constant.
  - Cap raise 2→5 must also touch the two initial-placement literals
    (`js/sim.js:191`, `js/voxelsim.js:1408`) and rework the top-up loop
    (`js/sim.js:413`, `js/voxelsim.js:5398`), which otherwise queues 5
    parallel timers that all fire at once — defeating "one spawn at a time".
  - Known test collisions: `tools/multiplayer-lifecycle.test.mjs:609`
    hardcodes the 16 s duration; `tools/cinematic-arming-guard.test.mjs`
    arms a cinematic per intermittent spawn (5 spawns = 5 cinematics —
    behavior call); `.wiki/modules/powerups.md:29-35` is stale (says 35 s).
  - Latent bug to fix or preserve deliberately: `vortexRadius` read at
    `js/voxelsim.js:5427` is never assigned; the 12.0 fallback always fires.
  - `RANKED_SIM_VERSION` (3, `js/voxelsim.js:662`) MUST bump: duration,
    pathing, destruction, and cap changes all alter ranked determinism.
  **COMMITTED 2026-08-25 in `20ae91c`.** All spec items
  landed: shared `POWERUP_RESPAWN_SECONDS = 30` single-slot spawner, cap 5
  (initial placement stays 2), backlog spawns suppress the encounter
  cinematic (toast only), the two tunable duration constants are
  `STORM_DURATION_SECONDS = 20` and `STORM_DURATION_90S_SECONDS = 15`
  (`js/voxelsim.js`), spatial-hash rip candidates + batched graph
  invalidation + bounded swirl + `AIRBORNE_CAP = 160` saturation guard,
  seeded heading wander, `vortexRadius` fixed (16 tornado / 22 hurricane),
  solid pooled funnel renderer with teardown dispose, and
  `RANKED_SIM_VERSION` 3→4. Pinned by `tools/powerup-storm-rework.test.mjs`
  (6063 assertions). Storm active-window cost ~3.2 ms mean on Tokyo with the
  old 116–139 ms spikes gone; ~1.9× more blocks ripped. The debris-settle RCA
  fix (above) rode the same version bump.

### Open defects observed during smoke/RCA work

Per `.wiki/findings/RCA-2026-08-20-cross-device-zero-progress.md` §8: a live
(non-hypothetical) defect surfaced by a runbook or RCA gets tracked here, not
just left as a paragraph, so "we already knew this could happen" turns into
"we already scheduled the fix."

- ~~**Sign-in catch-all fabricated a phantom "claimed" identity on any
  unrecognized server error.** Fixed 2026-08-20 via the `isRetryableOffline()`
  deny-list + visible `pending` state.~~ `.wiki/modules/api.md` ("The `local-*`
  identity trap, fixed"), `tools/player-identity.test.mjs` guards it.
- **`run/start` still 401s a device holding a genuine offline `local-*`
  fallback token** — un-ranks that browser until it signs in for real or
  clears storage. Narrower now (only reachable via a genuine network failure,
  not any unrecognized error), but not eliminated — invariant 10 still
  requires an offline player be able to keep playing. `.wiki/modules/api.md`
  ("The `run/start` local-token-401 gap").

---

## Shipped state

### 2026-08-24

- **Hole-skin rework pass (14 skins, outside agent) — NOT accepted as shipped;
  see the UNDER REVIEW entry in Active focus.** Registry ids/prices untouched.
  The entry's original "verified" claim is disputed by the byte-identical
  partner PNGs and Nico's in-play report. `.wiki/modules/render.md`.

### 2026-08-20

- **Fixed the sign-in phantom-identity bug**
  (RCA-2026-08-20-cross-device-zero-progress.md) — the `isRetryableOffline()`
  deny-list plus the visible `pending` sync state.
  `tools/player-identity.test.mjs`, `.wiki/modules/api.md`, `.wiki/modules/cloud.md`.

### 2026-08-19

- **Auckland: Act I chapter 2, playable at exactly 16,000 blocks** — Sky Tower,
  wharves, Ferry Building, scoria cones; fully wired and validated (section
  `auckland`, `tools/pw/auckland-playtest.mjs`). `.wiki/modules/voxel.md`.
- **Sydney: camera blockers restored, exact 14,120 blocks** — the unassigned
  `generateBlockers` return had shipped blockers=0; now 250, proven by forced-yaw
  A/B. `1d7bda9`.
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
