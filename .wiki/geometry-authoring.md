# Geometry terminology and map authoring

Owner decision: 2026-09-13. Applies to all Flywheel maps, both remediation and
new construction. The owner approved the twin-city Lab as the reference and
asked that its approach become the default authoring process.

## Shared vocabulary

| Term | Meaning |
| --- | --- |
| Voxel | A cube-shaped physical piece, with equal dimensions on all three axes. Cubes may have different sizes. |
| Architectural piece | A non-cube physical piece: a wall panel, slab, beam, column or another architectural member. Current box-based builders use axis-aligned rectangular boxes; this terminology does not imply arbitrary mesh physics. |
| Physical piece count | Voxels plus architectural pieces: the total independently represented physical pieces. |
| Grid cell | An occupancy/indexing unit. One physical piece can occupy many cells; a cell is not necessarily a voxel. |
| Render geometry | The visual mesh and its triangles/instances, counted separately from physical pieces. |

Use these meanings in discussion, documentation, new UI copy and authoring
reports. Legacy identifiers such as `blocks`, `VoxelSandboxSim` and
`voxelscene-*` may remain for compatibility; they do not redefine the terms.
Avoid the ambiguous word "block" when reporting geometry counts.

## Design standard

Use architectural pieces wherever they reduce unnecessary subdivision without
losing the pleasure of eating objects. Preserve small cubes for starter food,
street props, tactile detail and silhouettes that benefit from them. Divide
buildings into digestible wall sections, supported floor bays, roof sections
and structural members. A building must retain progressive bites and a readable
collapse; a whole building or oversized floor swallowed as one piece is not the
default optimization.

Replace surfaces with surfaces. Keep hollow interiors hollow; joining pieces
must not add hidden solid fill. Respect support spans, grid alignment, no-overlap
placement and the engine's edibility limits. Size pieces for the player's growth
stage and verify that ground-level pieces can eventually be eaten.

**Bank the savings.** Lower physical piece counts are a desired outcome when
visual quality and eating remain strong. Do not repopulate a map simply to spend
the savings, or add filler to meet an old catalog count. The authoring objective is fewer physical pieces with preserved visual quality
and enjoyable eating.

There is no universal reduction percentage or piece budget. Choose a budget
appropriate to the map and measure it. Fewer pieces can reduce per-piece work,
but grid occupancy, active debris, collision work and rendering also matter.
Do not translate a piece-count reduction into an unmeasured frame-rate claim.

## Existing-map remediation

1. Record a baseline: cube count, architectural-piece count, total pieces,
   occupied volume/cells, materials, startup food and representative views.
   Capture timing on comparable hardware when claiming performance improvement.
2. Identify surfaces and repeated cube assemblies that can become bounded
   architectural members. Preserve the layout, landmarks, material distribution
   and occupied volume for the initial subdivision comparison. Record deliberate
   design changes separately so their effects are distinguishable.
3. Write failing geometry and gameplay assertions before implementation, following
   the repository's TDD rules. Cover the intended reduction, overlap/occupancy,
   determinism, idle stability, small bites and relevant progression risks.
4. Convert suitable sections, retaining detailed or enjoyable cube assemblies.
   Verify support beneath slabs and multiple independent bites per structure.
5. Compare render appearance and actual eating/collapse. Use comparable seeds,
   starting sizes, upgrades, powers and routes. Check startup growth, progression,
   stranded debris and full-clear reachability. Score/combo parity does not follow
   from equal volume because consumed-piece counts can affect them.
6. Update catalog counts, UI/help, validators and covering docs to actual totals.
   Preserve reward/economy intent explicitly where counts feed it; do not silently
   retune rewards or physics to compensate for a geometry change. Run the required
   validation and report subjective gameplay findings separately from test results.

## New-map construction

Start with a mixed geometry layout: architectural members for suitable building
surfaces and cubes where their granularity serves play or appearance. Plan the
starter-food route and destruction stages alongside the skyline. Set a physical
piece budget before detailing and monitor both piece count and occupied volume.

Use the same test-first, support, edibility, visual and gameplay checks as
remediation. A representative building or district comparison is useful when a
piece size or technique is uncertain. Building an entire cube-only version first,
or duplicating the Lab's two-city layout in every map, is not required.

The fixed 60 Hz simulation remains unchanged. This standard establishes the
workflow for future work; it does not claim that every existing map has already
been converted or that every future design has been accepted.

## Approved reference: The Lab

See [the Lab module notes](modules/voxel.md#the-lab-twin-micro-city-comparison-2026-09-13),
[`js/voxelscene-lab.js`](../js/voxelscene-lab.js), and
[`tools/lab-comparison.test.mjs`](../tools/lab-comparison.test.mjs).

Two matching micro cities share occupied cells, material distribution and total
volume, with a 32 m gap between declared city edges. West uses 5,461 cube voxels.
East uses 293 cube voxels and 1,118 architectural pieces: 1,411 total physical
pieces, a 74.2% reduction. Small props remain granular; floors use 2 x 0.5 x 2 m
bays and walls use short sections. That percentage is a reference result, not a
quota for other maps.

The owner approved the Lab result on 2026-09-13 and selected its process for
all maps. This records design acceptance; the module notes retain the separate
validation limitations and browser findings.
