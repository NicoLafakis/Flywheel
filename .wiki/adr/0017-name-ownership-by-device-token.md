# ADR-0017: A name is owned by a device-held bearer token

- **Status:** accepted
- **Date:** 2026-08-12
- **Deciders:** Nico, Kimi

## Decision

Flywheel has no accounts. After a verified run earns a board place, a player
claims one display name. The server mints a random bearer token, stores only
its hash, and returns the token once. The public player id and name live in the
save for offline display; the bearer remains separately in `localStorage` and
is never exported with the save.

Names are normalised and checked server-side, unique on their folded key, and
may be transferred once with a six-character, ten-minute code. Clearing a
browser loses the capability; there is no recovery or implied sign-in path.

## Consequences

Names are frictionless without carrying anti-cheat trust: a score is trusted
because it was replayed, not because a person authenticated. The profile offers
transfer and removal controls, and moderator actions can rename or hide a
public name without rewriting the score history.

The accepted full rationale and alternatives remain in the planning record:
[Scoreboards ADR-0017](../features/scoreboards-and-profiles/adr-proposed/0017-name-ownership-by-device-token.md).
