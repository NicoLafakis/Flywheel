# Project Wiki

> Living documentation for **Flywheel** — "A sprocket's story" (repo:
> `Flywheel`; the eat-everything mechanic itself is still called "hole" in
> code and vocabulary — see [glossary.md](glossary.md)). Updated 2026-08-06
> (save-schema drift guard, partner `logoTex` path, `tools/skinsheet.mjs` and
> `tools/gen-partner-logo.mjs`; online Flywheel planning package indexed —
> documentation only, nothing built yet).

## What is this?

Single source of truth for architecture, conventions, and operational knowledge,
read by both humans and AI agents. Product/design requirements live in `docs/`;
this wiki is the engineering companion.

## Quickstart

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
| [architecture.md](architecture.md) | System design, data flow, sim/render split |
| [onboarding.md](onboarding.md) | Setup, run, validate |
| [conventions.md](conventions.md) | Coding standards, naming, determinism rules |
| [glossary.md](glossary.md) | Domain terms (tier, snack ring, tide, ...) |
| [visual-direction.md](visual-direction.md) | Art-target gap analysis: current vs reference |
| [modules/](modules/) | Per-module docs with `covers:` globs: [campaign](modules/campaign.md), [citygen](modules/citygen.md), [sim](modules/sim.md), [render](modules/render.md), [ui](modules/ui.md), [voxel](modules/voxel.md) |
| [adr/](adr/) | Architecture Decision Records |
| [runbooks/](runbooks/) | Run/validate/deploy playbooks |
| [features/](features/) | Feature planning packages: [upper-manhattan-park](features/upper-manhattan-park/overview.md), [online-flywheel](features/online-flywheel/README.md) (planning only — accounts, live shared arena, leaderboards; nothing built yet) |

## Feature planning packages

- [features/online-flywheel/](features/online-flywheel/README.md) — the plan
  to take Flywheel from a single-player static toy to a networked product
  (accounts, achievements, a live shared arena, four leaderboard scopes) for
  the UNBOUND conference. **Documentation only — no code exists yet.** Start
  at the [README](features/online-flywheel/README.md), which points
  implementers at [00-objective-overview.md](features/online-flywheel/00-objective-overview.md)
  and Nico at [SETUP-FOR-NICO.md](features/online-flywheel/SETUP-FOR-NICO.md).

## External references

- `docs/PRD.md` — product requirements (normative)
- `docs/ARCHITECTURE.md` — original architecture note (merged into wiki architecture page)
- `docs/TUNING.md` — growth math and proof methodology
- `docs/references/Model City Expansion Game UI.png` — visual target
