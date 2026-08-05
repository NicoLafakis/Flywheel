# Tasks: Upper Manhattan Park Sandbox Level

See [overview](overview.md) and [requirements](requirements.md).

- [x] Add `buildUpperManhattan(sim)` as a pure deterministic scene builder.
- [x] Route `scene: 'upper-manhattan'` through `VoxelSandboxSim`.
- [x] Add the title-screen entry plus loading and HUD labels.
- [x] Add ownership, camera-blocker, decor, idle, determinism, and excursion
      checks to `tools/validate.mjs`.
- [x] Update `.wiki/modules/voxel.md` and `STATUS.md`.
- [x] Run the validator and browser smoke test; capture the new level.

### 2026-08-05 rebuild (five passes, full district)

- [x] Pass 1 — rebuild the park core to the real geography plan, lift
      `generateBlockers`/`vehicleBBox` into the shared `js/voxelkit.js`, add
      the curvilinear-surface kit (`pathRibbon`, `basinRim`, `stoneArch`, …).
- [x] Pass 2 — mid + south park structures (Belvedere Castle, the Ramble, the
      Lake, Bethesda Terrace, the Mall, Conservatory Water, the Zoo, Wollman
      Rink) and the density/furniture pass.
- [x] Pass 3 — perimeter: Upper West Side, Fifth Avenue / Museum Mile,
      Harlem; widen `boundsRect`; extend streets/vehicles/road spans; 14 new
      kit builders (`setbackTower`, `streetWall`, `porticoFront`,
      `spiralRotunda`, `naveChurch`, `metroViaduct`, `rowBlock`, …).
- [x] Pass 4 — port Brooklyn's remaining validator probes onto the shared
      contract (9 → 19, refactored onto 16 shared helpers); performance and
      visual verification pass that found the scene unplayable while driving
      and diagnosed the root cause (`_recalcSupport`, not the renderer).
- [x] Pass 5 — structural-zone sim fix (playable at 60 fps, proved
      byte-identical three ways) + renderer/input fixes (ground plane,
      mortar seam, steering rate, `setPerfMode`).
- [x] Update `.wiki/modules/voxel.md`, `.wiki/modules/render.md`,
      `STATUS.md`, `CHANGELOG.md`, this page, and `AGENTS.md`'s validate-file
      list; correct the two stale "40k block ceiling" comments in
      `js/voxelscene-brooklyn.js` found along the way.
