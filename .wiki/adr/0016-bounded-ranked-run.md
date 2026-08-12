# ADR-0016: The ranked unit is a bounded 90-second RUN

- **Status:** accepted
- **Date:** 2026-08-12
- **Deciders:** Nico, Kimi

## Decision

Only a 90-second, 5,400-tick RUN at the pinned `ranked-v1` tune may produce a
public score. The server issues a single-use signed ticket, the client submits
the compact input trace, and the Vercel verifier re-simulates the shipping
voxel simulation before publishing a score. City clears and existing local
records remain personal history; they are never ranked.

Chicago is the first ranked city. A city joins only after its replay has met
the deployment and device budget; the pre-agreed fallback is a separate
60-second mode, not a weakened verification rule.

## Consequences

The browser may never write a board score. Network loss never blocks play: a
ticketed run is queued, and a run started with no ticket is honestly local-only.
The ranked step uses the recorded, quantised input pairs themselves, so the
browser and verifier replay one trajectory.

The accepted full rationale and alternatives remain in the planning record:
[Scoreboards ADR-0016](../features/scoreboards-and-profiles/adr-proposed/0016-bounded-ranked-run.md).
This ADR narrows, but does not weaken, [ADR-0012](0012-replay-validated-leaderboard-trust.md).
