# Project Wiki

> Living documentation for **Flywheel** — "A sprocket's story" (repo:
> `Flywheel`; the eat-everything mechanic itself is still called "hole" in
> code and vocabulary — see [glossary.md](glossary.md)). Updated 2026-08-16.
> 
> **Current Shipped Capabilities:**
> - **8 Handcrafted Voxel Metropolises**: The Gallery (The Lab), Lower Manhattan, Upper Manhattan, Brooklyn, Boston, Cambridge, Chicago Loop (with runaway CTA train derailment physics), and Neo Tokyo.
> - **6-Player Synchronized Invite Multiplayer (`js/multiplayer/`)**: Real-time multi-hole sandbox over Supabase Realtime Broadcast with 5-letter room codes, shareable invite links (`?room=CODE`), ephemeral chat, host-controlled match start, PvP hole swallowing ($r_\text{killer} > r_\text{victim} \times 1.05$), 10s perimeter respawn timeouts, per-player coin attribution, and victory podium rankings.
> - **Cosmetics & Multi-Rank Stat Upgrades (`js/skins.js`, `js/upgrades.js`)**: Modern mobile shop with 5 icon category tabs (`🕳️ Skins`, `👾 Creatures`, `🤝 Partners`, `🧭 Indicators`, `⚡ Upgrades`), 7 free basic color skins, and 4 stat tracks with 20 incremental ranks each (+0%..+100% speed, vortex, growth, duration boosts).
> - **Server-Replayed Scoreboards & Profiles (`js/board/`)**: Replay-validated ranked RUN leaderboards, anonymous device-token profile management, and seamless offline fallback.
> - **Interactive Audio Engine (`js/audio/`)**: Full WebAudio engine with 32 sound assets, spatial listener tracking, state-aware music cues, and volume ducking.

## What is this?

Single source of truth for architecture, conventions, and operational knowledge,
read by both humans and AI agents. Product/design requirements live in `docs/`;
this wiki is the engineering companion.

## Quickstart

**Wondering what is actually built?** → [roadmap.md](roadmap.md). Several
systems in [features/](features/) are documentation only; that page says which,
what each is waiting on, and what could start today.

**New developer?**
1. [onboarding.md](onboarding.md)
2. [architecture.md](architecture.md)
3. [conventions.md](conventions.md)
4. Relevant [modules/](modules/) pages

**AI agent?**
1. Root [AGENTS.md](../AGENTS.md) and [STATUS.md](../STATUS.md) first
2. [architecture.md](architecture.md) — system boundaries and design principles
3. [adr/](adr/) — why key decisions were made
4. [modules/](modules/) — component details and gotchas
5. [conventions.md](conventions.md), [glossary.md](glossary.md)

## Sections

| Section | Purpose |
|---------|---------|
| [roadmap.md](roadmap.md) | **What is real vs. what is only designed** — every planned system, whether it exists today, what it is blocked on, and rough size. Start here if you are wondering whether something is built |
| [architecture.md](architecture.md) | System design, data flow, sim/render split |
| [onboarding.md](onboarding.md) | Setup, run, validate |
| [conventions.md](conventions.md) | Coding standards, naming, determinism rules |
| [glossary.md](glossary.md) | Domain terms (tier, snack ring, tide, ...) |
| [visual-direction.md](visual-direction.md) | Art-target gap analysis: current vs reference |
| [modules/](modules/) | Per-module docs with `covers:` globs: [api](modules/api.md), [audio](modules/audio.md), [campaign](modules/campaign.md), [citygen](modules/citygen.md), [multiplayer](modules/multiplayer.md), [powerups](modules/powerups.md), [sim](modules/sim.md), [render](modules/render.md), [ui](modules/ui.md), [voxel](modules/voxel.md) |
| [adr/](adr/) | Architecture Decision Records |
| [runbooks/](runbooks/) | Run/validate/deploy playbooks |
| [findings/](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md) | Root-cause analyses: [RCA-2026-08-11 skyscraper launch and hanging debris](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md) (roof-snap teleport in the debris landing test, wall-scrape vy bounce, per-material gravity — **resolved, fixed by commit 235c82d the same day**); [RCA-2026-08-11 cambridge validator stall](findings/RCA-2026-08-11-cambridge-validator-stall.md) (the 780 s Cambridge excursion hits superlinear debris churn on the untiered physics — **resolved 2026-08-13**: root cause was unretirable jammed debris, fixed by T-402/[ADR-0018](adr/0018-debris-retires-on-proven-stationarity.md), and the validator is now a parallel orchestrator that completes end to end); [RCA-2026-08-17 eat SFX and voxel event audio](findings/RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md) (commit `8c3c85d` deleted `js/main.js`'s one `audio.handleEvent(ev)` while adding the multiplayer `isLocalHole` guard, so the shipped voxel path never requests the eat gulps, the combo ladder, SIZE stings, milestones, the derailment or the tornado; assets and registry are correct, the caller is gone; **resolved 2026-08-17** — the guard is now a three-way (`!ev.hole || isLocalHole`, plus a quiet rival quake), because gating on hole ownership alone would have left every world-scoped event — the tornado, the derailment, collapse crashes, power-up spawns — silent in multiplayer; a real 5400-tick `VoxelSandboxSim` run now requests 813 gulps against 0 before, and `tools/sfx-event-guard.test.mjs` watches the seam by executing the guard text lifted from the shipped file rather than re-implementing it); [RCA-2026-08-17 chicago excursion red since the speed retune](findings/RCA-2026-08-17-chicago-excursion-red-since-speed-retune.md) (`e8b84ae` bundled `SPEED_MULT` 1.4→1.8 with audio work; the excursion harness advances waypoints on the CLOCK, so a faster hole arrives early and parks — consumption fell 1433→878 and the combo chain shattered 1433→443, dropping Chicago under its SIZE 7 gate. Manhattan-district, brooklyn and cambridge show the same degradation without yet failing; **fixed 2026-08-17** — all nine excursions and `tools/chicago-probe.mjs` now share one arrival-driven, looping driver (`tools/route-driver.mjs`) whose `until` is a per-lap ceiling, every excursion is held to ≤2% parked ticks and prints its laps/idle/distance, and a new `speedInvariance` section requires a x2.00 hole to cover ≥1.25x the ground a x1.00 hole does. Manhattan-district 5→7 and boston 5→10 rose because the holes now eat more; no floor was lowered. The spec's consumption-monotonicity clause was retired on measurement, not weakened — per-metre yield is gravity-time-gated in the sim and falls with speed under every driver, which is also surfaced as a possible gameplay finding in section 6b); [RCA-2026-08-17 backdrop-filter captures fixed descendants](findings/RCA-2026-08-17-backdrop-filter-captures-fixed-descendants.md) (a `backdrop-filter` ancestor becomes the containing block for its `position: fixed` descendants, so anything fixed inside a `.screen` is positioned against that screen's scrolling content box instead of the viewport and scrolls away with it; the shop tab bar travelled 6087 px off a 390x844 phone leaving 4 of 5 categories unreachable — **fixed**; `#mp-countdown-modal` has the identical shape inside the scrolling `.mp-lobby-view` and hides the pre-match countdown — **open**; audit of every `position: fixed` rule and the resulting convention in the doc); [RCA-2026-08-17 level-start camera transition](findings/RCA-2026-08-17-level-start-camera-transition.md) (commit `8818c2d` turned `Screens.showPokemonEncounterModal` into a stub that calls `onSkip()` synchronously, inverting the timing contract `main.js:playNextPokemonSpawn` was written against: it shows the presentation first and arms the camera second, so the cinematic's canceller now runs before the cinematic exists and every level start arms an uncancellable 1.5 s power-up spawn cinematic on the first frame, measured overriding the establishing shot with a 213.1 m single-frame position cut, a 1076 deg/s whip-pan against the module's own 400 deg/s ceiling, and a permanent pitch leak. The owner's power-up hypothesis is CONFIRMED; the same hijack repeats mid-play on every 30 s respawn; five distinct discontinuities plus three state defects, with a fix spec, the blockers to the requested overhead choreography, and six RED-proven assertions. **Fixed 2026-08-17** — steps 1-5 of the fix spec are implemented: the spawn intro is gated on `reason === 'initial'` and on `introActive()` (the "ORBITAL DROP DETECTED" toast is preserved, only the camera cinematic is suppressed), both cinematics arm BEFORE their presentation and return an identity-checked cancellation token, release is continuous in all five channels with a geometric distance blend and the rig's own 400 deg/s yaw cap, `realDt` is floored at 0, and the intro is now a four-phase `'off' | 'hold' | 'rise' | 'dive'` machine that eases overhead to a capped 1.40 rad before diving — the choreography the owner asked for. Live on two scenes: worst single-frame camera travel 213.1 m -> 5.1 m (manhattan) and 207.9 m -> 7.6 m (brooklyn), peak yaw 1220 deg/s -> 42.5 deg/s, pitch settles at its 0.5400 base instead of leaking to 0.5200, and 185 of 350 hijacked frames -> 0. Watched by `tools/cinematic-arming-guard.test.mjs` (73 assertions, 34 RED on the pre-fix tree); the quake cutscene's authored INTERNAL hard cuts are a named open item in [modules/render](modules/render.md)). Performance reviews: [PERF-2026-08-17 runtime performance review](findings/PERF-2026-08-17-runtime-performance-review.md) (seven proposed optimisations graded on code evidence — shader precompile, particle Mesh pooling and a ~9 MB service-worker precache are clean wins; the music preload is blocked on the single shared `Audio()` element; size-growth interpolation has no step to smooth; a sim Web Worker is declined on invariants, boundary cost and a frame of added latency) |
| [features/](features/) | Feature planning packages: [game-music](features/game-music/00-objective-overview.md) (implemented 2026-08-11), [upper-manhattan-park](features/upper-manhattan-park/overview.md), [multiplayer](features/multiplayer/README.md) (6-player synchronized shared-city sandboxes with invite links, pre-game lobby, ephemeral chat, host-controlled match start with an AFK start-vote fallback, and 1:1 single-player map parity across The Lab, Lower Manhattan, and Brooklyn), [scoreboards-and-profiles](features/scoreboards-and-profiles/00-objective-overview.md) (ADRs 0016/0017 accepted: bounded, server-replayed RUN scores; optional device-token profile names; implementation and applied schema), [rival-visibility](features/rival-visibility/README.md) (historical design record — phases A-D shipped 2026-08-11 on the original `js/net/` arena, then retired 2026-08-16 with the rest of that prototype), [cambridge-sandbox](features/cambridge-sandbox/README.md) (map complete and playable — sixth voxel scene + anisotropic voxel-primitive vocabulary) |

## Feature planning packages

- [features/game-music/](features/game-music/00-objective-overview.md) — Tier 1
  plan for the ten supplied MP3s: streamed state-aware menu/shop/city/pause/results
  music, independent persisted music volume, focus safety, and mix ducking.
  Implemented 2026-08-11; all cue and rights decisions are resolved in the
  [requirements](features/game-music/01-requirements.md).
- [features/multiplayer/](features/multiplayer/README.md) — 6-player synchronized
  shared metropolis arena ([ADR-0019](adr/0019-six-player-invite-lobby-multiplayer.md)):
  host + up to 5 joiners, direct 1:1 copies of single-player maps starting with
  the first 3 levels (The Lab, Lower Manhattan, Brooklyn), shareable invite
  links, pre-game lobby with ephemeral in-memory chat (zero storage, zero in-game
  chat), and a deliberate 3s countdown start — the host presses start, or the
  non-hosts vote unanimously once the host has gone idle. Never on room capacity.
- [features/rival-visibility/](features/rival-visibility/README.md) — a
  historical design record, not a currently-running system. Out of a
  two-phone playtest complaint that neither screen ever said who ate what,
  **Phases A-D shipped 2026-08-11** on the original `js/net/` prototype
  arena: per-slot color identity, per-block eater attribution, crater
  tinting, a coarse tug-of-war bar, an off-screen chevron, milestone
  callouts, and an end-of-match territory reveal with a follow-zoom camera —
  shared onto the hot-seat `multiplayer.html` demo too. **Retired 2026-08-16**
  along with the rest of that prototype (`js/net/`, `js/demo/`, `arena.html`,
  `multiplayer.html`) in the clean-slate rebuild; the current
  `js/multiplayer/` only kept PvP takedown announcements from this package —
  see `architecture.md`'s "Rival visibility" note. Two patterns (size-as-threat
  legibility, and its paired task) were deferred
  until 8-player support lands.
- [features/cambridge-sandbox/](features/cambridge-sandbox/README.md) — the
  plan for a sixth voxel sandbox scene centred on HubSpot's real Cambridge, MA
  HQ (2 Canal Park + the Davenport), and the debut vehicle for a new
  anisotropic voxel-primitive vocabulary ([ADR-0013](adr/0013-anisotropic-voxel-primitives.md)).
  **The map is complete and playable** — the engine change, `js/voxelforms.js`,
  the new validator probes and all ten districts are committed in
  `js/voxelscene-cambridge.js`, the scene is registered and loadable from the
  free-play picker, and `validateCambridge()` runs in `tools/validate.mjs` to
  `ALL PASS` (72,943 blocks against an under-75,000 target, dead ground zero).
  Phase 7's hidden content, glyphs and achievements and the Phase 8 sign-off are
  ahead; Phase 7's achievement rows are blocked on the online-Flywheel backend
  rather than on anything in this package. Start at the
  [README](features/cambridge-sandbox/README.md), which points at
  [00-objective-overview.md](features/cambridge-sandbox/00-objective-overview.md).

## External references

- `docs/PRD.md` — product requirements (normative)
- `docs/ARCHITECTURE.md` — original architecture note (merged into wiki architecture page)
- `docs/TUNING.md` — growth math and proof methodology
- `docs/references/Model City Expansion Game UI.png` — visual target
