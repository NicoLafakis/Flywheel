---
covers:
  - "js/citygen.js"
---
# Citygen (deterministic district generator)

## Purpose

Turns a level definition (seed, size, metro, mechanics) into an identical city
on every machine: street grid, tile classification, zoned blocks, buildings,
props, snack ring, landmark, tide schedule.

## Key Files

| File | Purpose |
|------|---------|
| `js/citygen.js` | `generateCity(level)`, `SpatialHash`, `TileGrid`, `TILE` |

## Tile system (placement is grid-based)

The map is a 1 m lattice (`TileGrid`). Every tile is classified:

| Type | Meaning | Who may occupy |
|------|---------|----------------|
| `WATER` | waterfront strip | nobody |
| `LANE` | driving lanes + intersections | buses |
| `CURB` | parking band at road edges | curb-parked cars |
| `SIDEWALK` | outer 1 m ring of each block | clutter, bikes |
| `BUILD` | frontage/interior buildable | buildings |
| `YARD` | housing-block interior | trees, clutter |
| `PARK` | park-block interior | trees, clutter |
| `STALL` | parking-lot interior | cars, buses (stalls) |

Placement goes through one funnel (`place()`): snap to tile center → circle
overlap check (spatial hash) → `canOccupy` (every tile under the footprint is
an allowed type and unreserved) → `occupy` reserves the tiles.

## Placement invariants

1. Snack ring placed **first**, with a candidate-offset walk (ring arc spacing
   ≥ 1 tile; same-tile collisions fall through to neighbor tiles).
2. Buildings walk block edges in tile steps (`frontageFill`) — rows facing the
   street — never at free coordinates.
3. Cars exist only on `CURB`/`STALL` tiles, buses on `LANE`/`STALL`. Nothing
   drives or parks on `SIDEWALK`/`PARK`/`YARD`.
4. Landmark is the only eviction path (last, guaranteed). It reserves its
   tiles after eviction.
5. Object `radius` is the continuous tier-ladder radius (gameplay + the
   validator's circle-overlap proof). The grid governs *where* things go;
   circles still govern *how big* they are.

## Zoning

Block type by center distance from spawn: `< coreR` towers, `< midR` shops/
park/parking mix, else housing/park/parking. `coreR = (0.16 + metro·0.06)·size`,
`midR = coreR + 0.22·size` — sized so the residential ring exists even on the
smallest (90 m) maps.

## Gotchas

- `hash` is reused by the sim for eat queries and by the validator for the
  overlap proof — if objects move, the hash must be updated (they never move).
- Water strip is south (`zmax` side); `playable` bounds exclude it.
- The tile grid is exported as `tileGrid` on the city object — world3d uses
  block rects for pads/tints, not the grid (yet).
