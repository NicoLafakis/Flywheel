# Upper Manhattan Park Sandbox Level

## Objective overview

Add a third voxel sandbox level alongside the existing Gallery and Lower
Manhattan scenes: a park-first Upper Manhattan district centered on Central
Park. The scene should feel like a new neighborhood rather than a northward
extension of the Lower Manhattan map, while preserving the same deterministic
excavation physics, camera rules, and material/building kit.

The level's long-term role is to establish a reusable park-district pattern:
large open green space and water landmarks in the middle, readable avenue
edges, and recognizable low/mid-rise cultural buildings around the perimeter.
Future Upper Manhattan additions (Harlem blocks, the Reservoir, and east/west
neighborhood streets) should have clear room to grow without changing the
scene contract.

## Scope

- New pure-sim scene builder and scene identifier: `upper-manhattan`.
- Central Park render decor, lake/reservoir water, paths/avenues, trees,
  benches, lamps, and park props.
- Perimeter landmarks such as the Met, Dakota, Belvedere Castle, and Harlem /
  Museum Mile blocks.
- New title-screen entry and Upper Manhattan loading/HUD labels.
- Deterministic validator coverage for ownership, camera blockers, idle
  stability, and a scripted park-to-perimeter excursion.
- STATUS and voxel-module documentation updates.

## Out of scope

- Changes to the existing Gallery or Lower Manhattan layouts.
- Persistent saves, level unlocks, or campaign integration.
- New physics materials or renderer primitives.
