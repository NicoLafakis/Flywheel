# Score, Combo and Hype — SHIPPED 2026-08-10

The sandbox has kept a score since it was built and has never shown it, and the
one piece of scoring feedback it does show is wrong. This package plans the
reward layer's face: a score meter, a combo meter that reports the real
multiplier, a front-loaded multiplier ladder, and a staged consumption
celebration that gives a run an arc.

**Built and shipped 2026-08-10**, all five phases, with
[ADR-0015](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md) as its
companion decision. The owner resolved the three open questions in
[00](00-objective-overview.md) §"Decisions that are the owner's" as:
**points-only** (the combo no longer feeds hole growth; the SIZE ladder reads
`rawMass` and was rebased in the same change), **a named top level** at chain
600 (`MAX`, level 8), and **a whole helping per level** (`COMBO_STEP = 1`, so
level *n* multiplies by *n*).

Where it lives: the two data tables and the multiplier functions in
`js/voxelsim.js`; the meters, the count-up and the announcement queue in
`js/ui/hud.js`; the markup in `index.html`; the styling and the heat-ramp tokens
in `css/main.css`; the event dressing in `js/main.js`; the persisted per-scene
`bestCombo`/`bestScore` in `js/save.js` (schema v16); the results-screen rows in
`js/ui/screens.js`; and `validateRewardLadders()` plus the per-scene
`peakChain`/`score` summary figures in `tools/validate.mjs`.

## Start here

- **Implementers:** [00-objective-overview.md](00-objective-overview.md) →
  [01-prd.md](01-prd.md) → [02-requirements.md](02-requirements.md). The
  overview is the spine; read it before the spec, or the literal ask gets built
  instead of the thing it serves.
- **Nico:** the overview's closing section, *"Decisions that are the owner's"*,
  is the only part written for you. It is three questions about what a player
  feels, each with a recommendation. Nothing else in this folder needs you.

## The docs

| Doc | What it is |
|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine (the three owner decisions at the end are now ANSWERED — see the note above; the recommendation on Q1 was overruled). What the ask really serves, the three separate effect vocabularies and why they may not be one component with a colour swap, the multiplier curve and what it replaces, how often each celebration actually fires (measured), the scope line, and the three decisions that are the owner's. |
| [01-prd.md](01-prd.md) | PRD 0002. The normative spec: load-bearing invariant, functional requirements, the three data tables, surfaces, performance and accessibility budgets, phasing, and the one companion ADR this makes. |
| [02-requirements.md](02-requirements.md) | Ten user stories with Given/When/Then and EARS criteria, each marked as validator-checkable or live-verify-only. This is the contract verification checks against. |

## What this package is not

Achievements, the 44 easter eggs, the 11 hidden glyphs, and championship belts
are designed elsewhere
([cambridge-sandbox/04](../cambridge-sandbox/04-easter-eggs-and-achievements.md),
[online-flywheel/06](../online-flywheel/06-belts-and-achievements.md)) and are
all out of scope here. What they get from this package is the announcement
channel they will all need and a persisted best-combo record. Online
leaderboards and any backend belong to [online-flywheel](../online-flywheel/).
The campaign HUD is untouched.

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — the sim
  emits events, the renderer dresses them. Every effect here is dressing.
- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — no `Math.random()` in the sim; celebration randomness is render-side only.
- [ADR-0005 shared brand layer](../../adr/0005-shared-brand-layer.md) — the
  meters apply the existing visual language rather than inventing one.
- [ADR-0014 vendored same-origin runtime](../../adr/0014-vendored-same-origin-runtime.md)
  — no build step, no new dependency, nothing fetched off-origin.
