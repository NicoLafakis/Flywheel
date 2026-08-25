# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-24

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
- **Hong Kong Take Two (2026-08-25, Nico)** — new LOCAL-ONLY sandbox: recreate
  Hong Kong's skyline in its entirety using **pieces** (anisotropic boxes —
  cores, columns, beams, slabs, sheets; brick grain only in declared historic
  zones), hard budget ≤ 8,000 pieces, spec-as-validator-gate written BEFORE any
  geometry. Scope (harbour frame vs. whole territory) awaiting Nico's call.
- **Debris never settles — retirement predicate can't see solver-supported
  bodies** (RCA-2026-08-24-debris-jiggle-never-settles.md, CONFIRMED by
  ablation). Two defects: the 1.02 separation skin parks piled bodies ~0.3 mm
  above the zero-tolerance grounded test so they never sleep (243 permanently
  awake on Boston); `_pushAxis` pumps embedded pairs through grounded bodies
  (~1 m visible jiggle). Fix specced, not built; needs `RANKED_SIM_VERSION`
  3→4. Likely the same root cause as the validator's superlinear debris churn
  and much of Singapore's frame cost. Awaiting go.
- **Skin rework pass (outside agent, 2026-08-24) — UNDER REVIEW, disputed.**
  Uncommitted 479-line rewrite of `js/skins.js` + regenerated `docs/skins/`
  contact sheet. Its own shipped-entry claim of "verified" is not accepted:
  7 of 8 partner PNGs are byte-identical (all render one green ring) and Nico
  reports the reworked standard skins look worse in play.
  RCA in flight → `.wiki/findings/RCA-2026-08-25-partner-skins-render-identical.md`;
  outcome is fix-forward or surgical revert of the skins-scoped files.

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
  justified beyond Singapore by the 1.80 exponent; (c) reshape the hero — not
  supported by the evidence, not recommended. (An earlier 92% figure was an
  uncontrolled comparison and was corrected on this board 2026-08-22; the
  measurement method — pin `size` not `radius`, hole at the ground-footprint
  centroid — is documented in `tools/pw/hero-attack-perf.mjs`.) The 2026-08-24
  debris-settlement RCA above may substantially shrink this number if fixed.
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

- **Power-up respawn pacing (2026-08-24, Nico)** — raise the post-capture /
  post-despawn respawn delay from 30 s to ~45–55 s (exact value Nico's call
  within that band). At larger hole sizes (radius ≳ 20) power-ups repop so fast
  players hit them by accident. The 30 s is a hardcoded `30.0` at **four**
  sites — `js/sim.js:414`, `js/sim.js:424`, `js/voxelsim.js:1822`,
  `js/voxelsim.js:5088` — so the fix is one shared constant (e.g.
  `POWERUP_RESPAWN_SECONDS`) consumed by both sims, not four edited literals.
  Note: this timer feeds ranked determinism (`voxelsim`), so check whether
  `RANKED_SIM_VERSION` needs a bump when it lands.

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
