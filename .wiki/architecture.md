---
covers:
  - "js/**"
  - "index.html"
  - "tools/**"
---
# Architecture

Plain ES modules, no build step. Three.js loads from a CDN importmap. The same
simulation modules run in the browser (rendered) and in Node (headless
validator) — rendering is a thin layer over a pure sim.

## Data flow

```
levels.js ──► citygen.js ──► sim.js ──► world3d.js ──► screen
                 (seed)      (fixed     (meshes only)
                              60 Hz)
                                ▲
controls.js ──► move/orbit intents ──┘
save.js ◄──► localStorage (schema v7 + migrations)

voxelsim.js ──► voxelworld.js        (voxel sandbox: same split,
 (seed, fixed 60 Hz)                  no citygen/levels)
```

## Boundaries

- **Pure sim** (`rng.js`, `tiers.js`, `citygen.js`, `levels.js`, `sim.js`,
  `voxelsim.js`, plus the voxel authoring layers `voxelforms.js` and
  `voxelkit.js` and the scene files `voxelscene-*.js`, among them
  `voxelscene-cambridge.js`): no three.js imports, no DOM, no `Math.random()`.
  This is what `tools/validate.mjs` proves beatable (and deterministic).
- **Render** (`world3d.js`, `voxelworld.js`, `camera.js`): reads sim state,
  never writes it. Eat/tide/unlock arrive as drained event lists.
- **UI** (`ui/hud.js`, `ui/screens.js`): DOM overlay; screens drive
  `main.js`'s state machine via an `actions` callback object.
- **Glue** (`main.js`): boot, screen state machine, fixed-timestep loop,
  audio blips.

**Planned, not built:** a fourth **net** ring outside these three boundaries,
proposed in [features/online-flywheel/03-technical-design.md](features/online-flywheel/03-technical-design.md).
No code for it exists yet. When it lands, its invariants are: the net layer
never writes sim state outside `sim.step()`, it never imports three.js, a
client's score is never the record (the server replays the pure sim before
anything reaches a leaderboard), and the network is optional at every point.

**Built, and still in progress:** [ADR-0013](adr/0013-anisotropic-voxel-primitives.md)
widened a voxel block from a cube (`fs`/`s`) to an axis-aligned box with
independent per-axis extents (`fsx/fsy/fsz`, `sx/sy/sz`), and added the
`js/voxelforms.js` authoring layer sitting below `js/voxelkit.js`. It stays
inside the existing pure-sim/render boundary — the extents are pure-sim data
and `voxelworld.js` reads them the way it reads `b.s` today — and every
shipped scene stayed byte-identical. Its debut vehicle is the sixth voxel
scene, [features/cambridge-sandbox/](features/cambridge-sandbox/README.md).
The engine change, the primitive layer, the coin-anchor change, the new
validator probes and Districts 1, 2, 3 and 4 are committed in
`js/voxelscene-cambridge.js`. Districts 5 through 10, Phase 7's hidden content
and achievements, and the Phase 8 sign-off are still ahead. The scene is not
yet registered in `AUTHORED_SCENES` or `FREE_PLAY` (task P6.12), so it cannot
be loaded from the menu yet.

## Key decisions

See `adr/`: 0002 sim/render split, 0003 deterministic seeded generation,
0004 formula-driven levels with validator-enforced margins. Planned (not yet
implemented): 0009 Supabase backend, 0010 host-authoritative arena, 0011
guest-first identity with deferred claim, 0012 replay-validated leaderboard
trust — see [features/online-flywheel/](features/online-flywheel/README.md).
Accepted and shipped: 0013 anisotropic voxel primitives — see
[features/cambridge-sandbox/](features/cambridge-sandbox/README.md).

## Performance notes

Shared geometries/materials via caches in `world3d.js`; individual meshes per
object (needed for eat animations). Frustum culling handles most of the cost;
if object counts grow, move props to `InstancedMesh` with per-instance eaten
flags (see visual-direction.md).
