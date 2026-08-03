# ADR-0003: Deterministic seeded generation everywhere

- **Status:** accepted
- **Date:** 2026-07-31
- **Deciders:** Nico, Kimi Code

## Context

PRD: the same level must be identical on every play and machine, including
rival behavior. Also required for the validator's results to be meaningful.

## Decision

All randomness flows through `RNG` (`mulberry32(hashString(seed))`). Level
seed is `hole-city-level-N`; sim gets a derived `seed + ':sim'` stream.
`Math.random()` is banned in `js/`. Simulation uses a fixed 60 Hz timestep.

## Consequences

Replays, the greedy-bot proof, and player experience all agree. Adding
variety (new props, visual variants) means drawing from the level RNG — which
changes the stream and therefore the city; expect validator re-runs and
possible target retuning when citygen changes.

## Alternatives Considered

- Per-play random cities — rejected: violates PRD, breaks proof.
- Seedable but wall-clock-dependent sim — rejected: rivals must be identical
  per level.
