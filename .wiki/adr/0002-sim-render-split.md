# ADR-0002: Sim/render split with a pure, importable simulation

- **Status:** accepted
- **Date:** 2026-07-31
- **Deciders:** Nico, Kimi Code

## Context

The PRD requires "provably beatable" levels. A proof needs to run the real
game logic headlessly (Node), which is impossible if rules are entangled with
three.js/DOM.

## Decision

`rng.js`, `tiers.js`, `citygen.js`, `levels.js`, `sim.js` form a pure core:
no three.js, no DOM, no `Math.random()`. Rendering (`world3d.js`,
`camera.js`) and UI consume sim state and drained event lists; they never
write sim state. Gameplay advances only via `sim.step(1/60)`.

## Consequences

`tools/validate.mjs` proves overlap-freedom, snack-ring timing, and win
margins on shipping code. Render can be rewritten (see visual-direction.md)
without touching rules. Cost: discipline around the boundary; cosmetic
animation must live render-side.

## Alternatives Considered

- Validate a separate simplified model — rejected: proof wouldn't cover the
  shipped behavior.
- Dependency-injected rendering inside sim — rejected: needless complexity.
