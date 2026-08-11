# Project Wiki

> Living documentation for **Flywheel** — "A sprocket's story" (repo:
> `Flywheel`; the eat-everything mechanic itself is still called "hole" in
> code and vocabulary — see [glossary.md](glossary.md)). Updated 2026-08-11
> (rival-progress visibility phases A-D shipped in the live arena — crater
> tinting, tug bar, off-screen chevron, milestone callouts, end-of-match
> territory reveal with a follow-zoom camera — plus protocol v3, so eater
> identity survives a keyframe; a same-day physics fix made gravity uniform
> and stopped debris teleporting onto rooftops or hanging mid-air, see
> [findings/](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md).
> Also shipped the same day: the Chicago Loop's CTA train now derails at
> eaten track, runs the streets as a runaway, and is eatable once derailed
> (a mover-simulation engine in `js/voxelsim.js`, opt-in capability flags any
> mover can use); a real WebAudio engine (`js/audio/`, 32 CC0 sound files,
> see `CREDITS.md`) wired into the live arena, the hot-seat demo, and the
> scene viewer (not yet the main campaign game); and a MULTIPLAYER plate on
> the title screen linking to a clean `/arena` URL, so the live arena is a
> click away for the first time. The Chicago Loop scene itself was rebuilt
> ground-up — playable and committed, but **the menu/arena-allowlist wiring
> to reach it is in flight in a concurrent session as of 2026-08-11**. The
> `js/net/` multiplayer layer remains wired end to end and **live**: host +
> peer loops proven over a loopback demo page, then over real Supabase
> Realtime in a two-device arena at
> https://flywheel-woad.vercel.app/arena.html, still not called from
> `js/main.js`'s state machine even though the title screen now links to it;
> the Cambridge sandbox's map is complete and playable with hidden content
> still ahead).

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
| [modules/](modules/) | Per-module docs with `covers:` globs: [campaign](modules/campaign.md), [citygen](modules/citygen.md), [sim](modules/sim.md), [render](modules/render.md), [ui](modules/ui.md), [voxel](modules/voxel.md) |
| [adr/](adr/) | Architecture Decision Records |
| [runbooks/](runbooks/) | Run/validate/deploy playbooks |
| [findings/](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md) | Root-cause analyses: [RCA-2026-08-11 skyscraper launch and hanging debris](findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md) (roof-snap teleport in the debris landing test, wall-scrape vy bounce, per-material gravity — **resolved, fixed by commit 235c82d the same day**) |
| [features/](features/) | Feature planning packages: [upper-manhattan-park](features/upper-manhattan-park/overview.md), [online-flywheel](features/online-flywheel/README.md) (the `js/net/` layer is wired end to end and proven live over Supabase Realtime — a two-device arena at flywheel-woad.vercel.app/arena.html — but not yet called from `js/main.js` or any campaign/sandbox screen; accounts and leaderboards remain undesigned in code), [rival-visibility](features/rival-visibility/README.md) (phases A-D shipped 2026-08-11 — craters, tug bar, off-screen chevron, callouts, end reveal; two patterns deferred until 8-player), [cambridge-sandbox](features/cambridge-sandbox/README.md) (map complete and playable — sixth voxel scene + anisotropic voxel-primitive vocabulary; engine change, primitive layer, scene registration and all ten districts committed, Phase 7's hidden content and the Phase 8 sign-off ahead) |

## Feature planning packages

- [features/online-flywheel/](features/online-flywheel/README.md) — the plan
  to take Flywheel from a single-player static toy to a networked product
  (accounts, achievements, a live shared arena, four leaderboard scopes) for
  the UNBOUND conference. **The `js/net/` layer is wired end to end and live
  (2026-08-10):** host and peer loops proven over a loopback demo page, then
  over real Supabase Realtime in a two-device arena at
  https://flywheel-woad.vercel.app/arena.html. It is a standalone page, still
  not called from `js/main.js` or any campaign/sandbox screen, though a
  MULTIPLAYER plate on the title screen has linked to it since 2026-08-11;
  accounts,
  leaderboards and host succession remain undesigned or unbuilt. Start
  at the [README](features/online-flywheel/README.md), which points
  implementers at [00-objective-overview.md](features/online-flywheel/00-objective-overview.md)
  and Nico at [SETUP-FOR-NICO.md](features/online-flywheel/SETUP-FOR-NICO.md).
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
