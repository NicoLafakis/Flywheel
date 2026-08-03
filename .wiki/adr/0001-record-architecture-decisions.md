# ADR-0001: Record architecture decisions

- **Status:** accepted
- **Date:** 2026-07-31
- **Deciders:** Nico, Kimi Code

## Context

The project needs a durable record of why the codebase is shaped the way it
is, so future changes don't silently undo load-bearing decisions.

## Decision

Keep Architecture Decision Records in `.wiki/adr/`, one decision per file,
numbered `XXXX-short-kebab-title.md`. Accepted ADRs are immutable; supersede
instead of editing.

## Consequences

Decisions are discoverable and linkable from module pages. Small overhead per
significant change.

## Related

- 0002 sim/render split
- 0003 deterministic seeded generation
- 0004 formula-driven levels with validator margins
