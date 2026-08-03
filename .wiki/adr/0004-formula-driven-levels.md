# ADR-0004: Formula-driven levels with validator-enforced margins

- **Status:** accepted
- **Date:** 2026-07-31
- **Deciders:** Nico, Kimi Code

## Context

100 hand-authored levels are unmaintainable; pure formulas risk untestable
difficulty. Tuning doc proposed freezing bot-derived targets per level.

## Decision

Level parameters (size, clock, density, target, mechanic loadout) are
formulas over the level index in `levels.js`. Correctness is enforced by
`tools/validate.mjs`: greedy bot must win every level with ≥ 15% clock
margin, first eat < 1 s, zero overlaps. The frozen-targets idea from
`docs/TUNING.md` was dropped in favor of re-validating formulas every run.

## Consequences

Difficulty ramps are adjustable in one place; any citygen/tuning change that
breaks beatability fails loudly. Downside: the validator is the safety net —
it must stay fast (~10 s) and must run before commits touching the sim.

## Alternatives Considered

- Frozen per-level target table — rejected: rots the moment citygen changes;
  the validator already recomputes bot mass every run.
- Hand-tuned levels — rejected: 100 levels, unmaintainable.
