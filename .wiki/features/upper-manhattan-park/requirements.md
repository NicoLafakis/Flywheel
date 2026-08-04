# Requirements: Upper Manhattan Park Sandbox Level

See [overview](overview.md) for the feature trajectory.

## User stories and acceptance criteria

### New selectable sandbox level

As a player, I can choose Upper Manhattan from the title screen in addition to
Gallery and Lower Manhattan.

Given the title screen is visible, when I choose `NYC: UPPER MANHATTAN —
CENTRAL PARK`, then the loading overlay identifies that scene and the sandbox
starts with the same controls and HUD contract as the other scenes.

### Park-centered city district

As a player, I can excavate a recognizable Central Park area with surrounding
Upper Manhattan streets and landmarks.

Given the scene has loaded, the render-only decor includes a large central park
footprint, park paths/avenues, and at least two water features; voxel content
includes trees/benches/lamps plus distinct perimeter buildings representing
the Met, Dakota, Belvedere Castle, and Harlem/Museum Mile blocks.

### Stable deterministic physics

As a player, I get the same collapse behavior every time the scene is started
with the same seed.

Given two sims use the same seed and scene identifier, then they produce the
same block count, total mass, and scripted-excursion eaten count; no block may
own a fine cell that points to another block.

### Readable camera and spawn

As a player, I can see the hole and the surrounding park landmarks while
driving through the map.

Given the scene is idle at spawn for three seconds, then no blocks collapse or
are eaten and every structure at least 6 m tall is covered by a camera blocker
whose declared top reaches the structure's actual top.

### Documentation and validation

Given the feature is implemented, `node tools/validate.mjs` prints `ALL PASS`,
the voxel module page describes the third scene, and `STATUS.md` records the
new level and its current content.
