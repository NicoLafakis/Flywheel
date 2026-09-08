# ADR 0025: Tokyo architectural pieces and bounds occupancy

Status: Accepted for the Tokyo pilot, 2026-09-08; release acceptance pending.

## Context

The user requested fewer, larger architectural shapes without losing the city's
detail or enjoyable breakup. Instancing alone leaves per-piece simulation work.
Larger pieces stored as dense interior fine cells also retain avoidable memory
and query costs. The earlier doctrine of spending every saved block back into
the scene conflicts with this explicit performance objective and is superseded
for the pilot.

## Decision

Consolidate homogeneous adjacent cells only within authored building bays and
storeys. Preserve material, occupied space and finish. Select a bounds-backed
occupancy implementation for Tokyo v2, retaining exact legacy fallback queries
around overlaps. Keep v1 available and other cities unchanged. Preserve material
rewards and base points; spread already-earned upper growth over simulation time.
Use a fixed physics tune across devices. See the
[implementation plan](../plans/tokyo-geometry-remediation.md).

## Alternatives and consequences

Whole-building meshes sacrifice breakup; generic spatial slicing ignores
architecture; draw-only merging leaves simulation cost. Full arbitrary-polyhedron
physics would expand scope far beyond the pilot. The chosen path reuses existing
surface rendering and material-joint chunks, substantially reduces pieces and
interior storage, but changes fragmentation and requires pacing, replay compatibility
and real-device acceptance. The Tokyo revision must not be treated as a
behavior-preserving patch to a ranked ruleset.
