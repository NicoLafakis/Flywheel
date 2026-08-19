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
  (`js/citycatalog.js`). **10 are `PLAYABLE`**; the rest are `DEVELOPMENT` and
  gated in the UI. Unlock ladder is 100% clear of the preceding *playable* city.
- **Run rules**: 5-minute clock, 100% full-clear goal, 60 deterministic coins
  per city, plus a 3-minute challenge tier. Ranked THE RUN (Chicago) is 90 s.
- **Boards**: public ranked boards with server-replayed trace verification;
  local/cloud profile fallback and a signed outbox. Offline play always works.
- **Audio & quality**: 19 streamed tracks, pause-menu picker with unlock gating,
  independent mix controls, HIGH/LOW quality tiers.

---

## Active focus

- **Act I map completion** — every Act I city built to the voxel count declared
  in its catalog entry, exactly. Sydney done; Auckland and Singapore in flight.
  `.wiki/features/act-i-pacific-completion/`.
- **Camera Bézier occlusion smoothing (The Lab only)** — C¹ cubic Hermite pitch
  transitions and critically-damped roof-climb easing, behind a per-scene flag.
  `.wiki/features/camera-bezier-smoothing/`, ADR-0022.
- **Global campaign & Sprocket storyline** — 29-city world tour, mission
  dossiers, progressive unlock ladders. `.wiki/features/global-campaign/`.
- **Multiplayer multi-hole & join polish** — 6-player invite lobby, PvP hole
  swallowing, per-player coin isolation. `.wiki/modules/multiplayer.md`.
- **Cambridge Phase 7** — 44 easter eggs, 11 ground glyphs, championship belts.

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
- **Cambridge 2** — the map was specced to *look* as detailed as 73k voxels, not
  to contain them. Rebuild at perceived density; the existing map stays. Root
  cause of the validator's 37-minute runtime.
- **Cloud progress sync** — shipped and **on by default**; `FW_PROGRESS_SYNC=false`
  on Vercel pauses it (both routes answer `503 SERVER_NOT_READY`, game unchanged).
  An emergency switch, not a deploy step. `.wiki/modules/cloud.md`, ADR-0021.

---

## Shipped state

### 2026-08-19

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
