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

**2026-08-05: this trajectory is built.** A five-pass rebuild took the scene
from the ~8,400-block sketch described below to 73,393 blocks / 86,083 mass —
full Central Park geography, the Upper West Side, Fifth Avenue / Museum Mile,
and Harlem, all sharing the same scene contract (`buildUpperManhattan(sim)`,
`sim.boundsRect`, `sceneDecor`, `cameraBlockers`, the validator's shared
19-probe contract). See `.wiki/modules/voxel.md`'s upper-manhattan section and
`CHANGELOG.md`'s 2026-08-05 entry for what shipped, and `tasks.md` for the
rebuild's own task record. The rest of this page (scope, requirements) is kept
as the original feature's acceptance record; it still describes what shipped
correctly at the level of user-facing behavior, just not at 2026-08-04's
content scale.

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
