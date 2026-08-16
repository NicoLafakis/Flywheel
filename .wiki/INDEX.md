# Project Wiki

> Living documentation for **Flywheel** — "A sprocket's story" (repo:
> `Flywheel`; the eat-everything mechanic itself is still called "hole" in
> code and vocabulary — see [glossary.md](glossary.md)). Updated 2026-08-16.
> 
> **Current Shipped Capabilities:**
> - **8 Handcrafted Voxel Metropolises**: The Gallery (The Lab), Lower Manhattan, Upper Manhattan, Brooklyn, Boston, Cambridge, Chicago Loop (with runaway CTA train derailment physics), and Neo Tokyo.
> - **6-Player Synchronized Invite Multiplayer (`js/multiplayer/`)**: Real-time multi-hole sandbox over Supabase Realtime Broadcast with 5-letter room codes, shareable invite links (`?room=CODE`), ephemeral chat, auto-countdown, PvP hole swallowing ($r_\text{killer} > r_\text{victim} \times 1.05$), 10s perimeter respawn timeouts, per-player coin attribution, and victory podium rankings.
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
| [modules/](modules/) | Per-module docs with `covers:` globs: [audio](modules/audio.md), [campaign](modules/campaign.md), [citygen](modules/citygen.md), [multiplayer](modules/multiplayer.md), [sim](modules/sim.md), [render](modules/render.md), [ui](modules/ui.md), [voxel](modules/voxel.md) |
| [adr/](adr/) | Architecture Decision Records |
| [runbooks/](runbooks/) | Run/validate/deploy playbooks |
| [findings/](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md) | Root-cause analyses: [RCA-2026-08-11 skyscraper launch and hanging debris](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md) (roof-snap teleport in the debris landing test, wall-scrape vy bounce, per-material gravity — **resolved, fixed by commit 235c82d the same day**); [RCA-2026-08-11 cambridge validator stall](findings/RCA-2026-08-11-cambridge-validator-stall.md) (the 780 s Cambridge excursion hits superlinear debris churn on the untiered physics — **resolved 2026-08-13**: root cause was unretirable jammed debris, fixed by T-402/[ADR-0018](adr/0018-debris-retires-on-proven-stationarity.md), and the validator is now a parallel orchestrator that completes end to end) |
| [features/](features/) | Feature planning packages: [game-music](features/game-music/00-objective-overview.md) (implemented 2026-08-11), [upper-manhattan-park](features/upper-manhattan-park/overview.md), [multiplayer](features/multiplayer/README.md) (6-player synchronized shared-city sandboxes with invite links, pre-game lobby, ephemeral chat, auto-start on full room, and 1:1 single-player map parity across The Lab, Lower Manhattan, and Brooklyn), [scoreboards-and-profiles](features/scoreboards-and-profiles/00-objective-overview.md) (ADRs 0016/0017 accepted: bounded, server-replayed RUN scores; optional device-token profile names; implementation and applied schema), [rival-visibility](features/rival-visibility/README.md) (phases A-D shipped 2026-08-11 — craters, tug bar, off-screen chevron, callouts, end reveal), [cambridge-sandbox](features/cambridge-sandbox/README.md) (map complete and playable — sixth voxel scene + anisotropic voxel-primitive vocabulary) |

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
  chat), and automatic 3s countdown start on full room.
- [features/rival-visibility/](features/rival-visibility/README.md) — making
  a rival's progress visible in the live arena, out of a two-phone playtest
  complaint that neither screen ever said who ate what. **Phases A-D shipped
  2026-08-11:** per-slot color identity, per-block eater attribution, crater
  tinting, a coarse tug-of-war bar, an off-screen chevron, milestone
  callouts, and an end-of-match territory reveal with a follow-zoom camera —
  shared onto the hot-seat `multiplayer.html` demo too. Closed the one real
  protocol gap the package found: keyframes now carry per-slot eaten
  streams, so eater identity survives a late join or a missed snapshot.
  Two patterns (size-as-threat legibility, and its paired task) are deferred
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
