# ADR-0013: Anisotropic voxel primitives — a block is a box, not a cube

- **Status:** proposed (awaiting Nico; supersedes nothing until accepted)
- **Date:** 2026-08-06
- **Deciders:** Nico, Claude Opus 5

## Context

Every block in the voxel sandbox is an axis-aligned **cube**. `_addBlock`
(`js/voxelsim.js:479-513`) stores one scalar side, `fs` (fine cells) and its
metre twin `s`; there is no per-axis extent anywhere in the sim, the renderer,
the kit or the validator. The shipped sizes 0.25 / 0.5 / 1 / 2 m are a
convention documented in `js/voxelkit.js:27-33`, not an enumeration the engine
knows about — `_block` accepts any multiple of `FINE`, so a 3 m or 5 m *cube*
already works today. What does not exist is a block whose x, y and z extents
differ.

That constraint has shaped the content. A floor plate is a field of 1 m cubes
(`tower()`, `js/voxelkit.js:240-264`); a pillar is a stack of them; a cornice is
a run of 0.5 m cubes (`setbackTower`, `:2115-2125`). It is why the four scenes
carry 25,875 / 39,984 / 73,393 / 82,894 blocks, and why `STATUS.md` records the
sim — not the renderer — as the per-frame cost on a large scene (ADR-0006:
97% of frame time before the zone fix).

`STATUS.md`'s open decision 1 records the owner's standing request, unstarted:
per-building **construction vocabulary** — different sized bricks, blocks and
shapes, whatever size best represents a thing. His two examples: a floor as one
solid piece, a pillar as a solid pillar. That board entry also names the
enabling insight (ADR-0002's sim/render split means the **sim** needs cubes but
the **renderer** does not) and the caution (the renderer batches on
`matType + ':' + b.s`, so a `shape` tag would add a third key dimension).

**The objective is explicitly not minimisation**, clarified by the owner on
2026-08-06: *"we're not trying to do a 'least amount of blocks possible,' so I
hope you're not taking it to the extreme here."* The goal is the right shape for
the thing, and the block savings are **reinvested, not banked** — a floor that
costs one slab instead of forty bricks frees those forty for the thing next door
that would not otherwise have fit. Cambridge should land in the same block
neighbourhood as the existing authored scenes and deliver materially **more**
apparent detail and more eatable content for that budget. Anisotropic primitives
are a way to buy detail uniform cubes could not afford, not a way to build a
sparse level. This ADR is therefore about **detail per block**, never about a
reduced total.

A full capability audit against the current tree
(`.wiki/features/cambridge-sandbox/01-voxel-primitive-vocabulary.md`) resolved
three things the decision turns on:

1. **The cost model runs the owner's way.** For the same occupied volume, one
   big piece is cheaper than the equivalent volume in small pieces on build
   time, per-frame cost, memory objects and draw calls, and exactly *equal* on
   fine-grid cell writes — never worse. `_addBlock` writes `fs³` cells, so total
   writes are `V` regardless of `fs`; `_buildNeighbors`
   (`js/voxelsim.js:810-830`) probes `6·fs²` per block, i.e. `6V/fs` over the
   volume; everything per-block is `V/fs³`. This matches the measured finding in
   `STATUS.md`: *"Cost is linear in total fine volume… per-fine-cell cost is
   flat to 1.47× where per-block cost spreads 2.27×."* There is no crossover.
   The one real trap is not size but **solidity** — filling a hollow interior
   raises the flat term.
2. **The renderer barely knows about size.** Six sites in `js/voxelworld.js`
   touch `b.s`; scale lives entirely in the per-instance matrix
   (`:2149`), the geometry is one shared unit cube (`:38`), and the mortar
   course is proportional per face (`:322-355`) and therefore already
   scale-free. Non-cubic extents are a per-instance scale change, not a
   geometry change.
3. **Non-box *shapes* are a different and much worse proposition.** The sim's
   only geometric operation is AABB separation
   (`js/voxelsim.js:2110`, `:2129-2145`, both of which use a single half-extent
   sum for all three axes). A rendered wedge or cylinder would collide as its
   bounding box, so geometry and physics would visibly disagree — on top of
   `STATUS.md`'s bucket-key caution.

## Decision

**Make a block an axis-aligned box with independent per-axis extents. Do not
make it any other shape.** Concretely:

- `fs`/`s` become `fsx/fsy/fsz` and `sx/sy/sz`. Every extent stays a multiple of
  0.25 m — this is a hard constraint, not a style preference, because ADR-0006's
  determinism proof rests on *"every span is an exact sum of multiples of 1/8"*
  and the span hop `(cur.s + nb.s) / 2` must keep producing bit-identical floats
  when two BFS paths tie.
- Cubes remain the degenerate case (`sx === sy === sz`). Every existing scene
  must stay **byte-identical**, proved the way ADR-0006 was proved — the
  validator plus a per-step state digest across the existing scripted
  excursions — not asserted.
- **Curves, ramps, arches, domes and cylinders stay stepped approximations out
  of boxes**, as they are today (`spiralRotunda`, `glassSphere`,
  `halfDomeShell`, `stoneArch`, `barrelVaultHall`). They get materially cheaper
  under this change — a gable becomes a short stack of long thin slabs instead
  of a field of cubes — without a `shape` tag, a second geometry, or a third
  bucket-key dimension.
- The authoring layer is a **new, small `js/voxelforms.js`** holding twelve
  named primitives (slab, column, pier, beam, panel, mullion, cornice, plinth,
  tread, and the tread/corbel/drum approximations), *below* `js/voxelkit.js` in
  the dependency order and never importing it. Cambridge-specific composites
  live in `js/voxelscene-cambridge.js`. A composite graduates into the shared
  kit **only when a second scene calls it** — the rule exists because
  `STATUS.md` is already tracking `voxelkit.js` (2,771 lines, ~95 exports) as a
  shared-kit dumping ground.
- Authoring is governed by **the two-hand rule**, two constraints that pull in
  opposite directions and are therefore always stated together:
  **(1) skin, not fill** — a solid piece replaces a *surface*, never an
  *interior* (a floor is a 0.25-0.5 m plate, not a 1 m solid cube), because
  fine-cell cost is linear in occupied volume and not in block count; and
  **(2) spend it back** — every block a primitive frees is budget owed back to
  the scene, not banked. An author holding only hand 1 produces an *empty
  diorama*: correct silhouettes, nothing between them, too little to eat. An
  author holding only hand 2 produces an *expensive solid lump*: a beautifully
  low block count that builds slower and is no cheaper per frame. A falling
  block count is a warning sign, not a result.
- Legibility is enforced by **authoring rules with validator probes**, never by
  a runtime size gate. Three probes join the shared contract: no ground-anchored
  piece with a plan diagonal > 8 m; placement step equals piece extent on every
  axis; and — enforcing hand 2 — per declared district, the mean gap between
  consecutive eatable pieces along the scene's scripted route stays under 15 m.

The one edit that is more than mechanical, flagged so it is budgeted rather
than discovered: the span hop at `js/voxelsim.js:1090` is direction-independent
today *because* blocks are cubes. With boxes it needs the extents along the hop
axis, and `neighbors` is an unordered `Set` (`:828`) that does not record
direction. The axis is recoverable from the two fine AABBs, but it lands in the
hottest loop ADR-0006 exists to protect.

## Consequences

**A block's data shape is the atom of the pure sim, so this is the widest
change the sandbox has taken since ADR-0006 — and it is almost entirely
mechanical.** ~89 sites in `js/voxelsim.js` (41 `.fs`, 48 `.s`), six in
`js/voxelworld.js`, two probes in `tools/validate.mjs`. Every mass builder in
`js/voxelkit.js` already funnels its geometry through a single `put()` call
site precisely so that *"when the primitive changes — a non-uniform slab
instead of a cube, say — it is a one-line edit per builder instead of an audit
of every nested loop in every scene"* (`js/voxelkit.js:270-278`). That seam was
written for this change and is now being cashed.

Four consequences are behavioural, not mechanical, and are the reason this is
an ADR rather than a refactor:

1. **Structure changes meaning.** A one-piece floor slab on solid columns is the
   cheapest and safest thing the engine can build (vertical support resets the
   cantilever span to 0). But two adjacent large pieces cannot support each
   other at all — a 4 m→4 m hop costs 4 m against concrete's `maxSpan` of 3 —
   and at grade the cap is `FLOOR_CANTILEVER = 1 m`, so large ground pieces get
   no horizontal support whatever. Consolidation therefore *strengthens*
   vertical load paths and *removes* horizontal ones. Scene authoring has to
   know this.
2. **Grade pieces have a hard size ceiling, derived from the rim test.** Losing
   floor-anchor status needs 3 of 4 base corners inside the removal disc
   (`js/voxelsim.js:1035-1058`, `:1072`), so a square ground piece of plan side
   `a` first becomes removable at `radius ≥ (a/2 − 0.05) × 1.48865`: 2 m at
   SIZE 1, 4 m at SIZE 4, 8 m at SIZE 10, and **nothing above ~9.7 m is ever
   removable** at the 7.1 m maximum radius. This also corrects a stale comment:
   `js/voxelsim.js:298`'s *"the hole can only eat bricks smaller than itself"*
   is not an enforced rule — no size gate exists anywhere — it is an emergent
   property of this corner test, and only for `gy === 0`.
3. **The one-bite hazard is real and is handled in authoring.** `_overVoid`
   tests a block's **centre** only (`js/voxelsim.js:1322-1325`) and consumption
   is `top <= SINK_Y` (`:1743`), so a fallen 20 m slab is swallowed whole by a
   SIZE 1 hole in about a third of a second, for one combo tick. The fix is the
   grain rule (no piece over ~5% of its structure's mass; a floor becomes one
   *bay*, not one *floor*), enforced by probe. A runtime gate is explicitly
   refused: it would be a second edibility ladder outside `tiers.js`, against
   `AGENTS.md` invariant 4, and against the sandbox's premise that *"the hole
   never decides whether an object fits."*
4. **The combo economy is block-count-denominated — a safeguard now, not a
   prerequisite.** `comboMult` awards a level every 25 blocks eaten
   (`js/voxelsim.js:89-92`), while mass, the per-scene SIZE ladder and the 50%
   goal are all mass-based and therefore conserved. Because the reinvestment
   rule holds the scene total roughly steady, the *aggregate* risk is largely
   gone: a chain persists while the player eats something every 1.5 s
   (`:2228-2231`), so combo levels over an uninterrupted run track total blocks
   eaten, and Brooklyn's 530-eat excursion (`STATUS.md:54`) sits right at the
   ×3 cap's 501 threshold either way. **What does not go away is the local
   rate.** The 1.5 s window is a rate gate, and consolidation reduces bites *per
   object* even when it does not reduce bites *per scene* — while reinvestment
   explicitly moves those bites elsewhere on the map. A brick tower fed the
   player ~300 bites and coasted them across the plaza beyond; the same tower as
   eight slabs runs dry mid-plough, with ~15 m of travel at SIZE 1 to find the
   next thing. So: re-denominating `comboMult` by mass is **still worth doing**
   — it makes the economy invariant to authoring grain rather than
   coincidentally fine — but it no longer blocks this change and must not be
   bundled into it. It becomes a prerequisite again the moment any district's
   mean gap between consecutive eatable pieces along a plausible route exceeds
   ~15 m, which is exactly the third shared probe above.

An **independent, adjacent win** falls out of the audit and should ship first,
on its own measurement: the bucket key at `js/voxelworld.js:601` includes `b.s`,
but every unsurfaced bucket shares the *same* material object (`mat(0xffffff)`,
cached on colour at `:83-92`) and the *same* geometry. For unsurfaced blocks
`b.s` partitions instances that are byte-identical to the renderer. Only
`surfaceMaterial(id, size)`'s `uv: 'metre'` repeat (`js/voxelsurfaces.js:181`)
genuinely needs it. Dropping it for unsurfaced buckets would likely reduce draw
calls below today's count *and* make an arbitrarily rich size vocabulary cost
zero extra calls — which is what removes the last objection to this ADR. It
must be measured separately so the vocabulary's own cost is not confounded with
it.

Nothing here crosses ADR-0002's sim/render boundary: the extents are pure-sim
data and the renderer reads them, as it reads `b.s` today.

## Alternatives Considered

- **Keep cubes; just use bigger ones.** Free (arbitrary cube sizes already
  work) and worth prototyping with, but it cannot express a pillar, a plate, a
  beam or a cornice — the four members the owner's request is actually about. A
  cube ladder is isotropic; architecture is not.
- **Add a `shape` tag with real non-box geometry** (wedges, cylinders).
  Rejected on two independent grounds: the sim would still collide the AABB, so
  a rendered ramp would be climbed as a block, and `STATUS.md` correctly flags
  the third bucket-key dimension. The stepped approximations already in the
  scenes cover the aesthetic need and get cheaper under this decision anyway.
- **Render-only consolidation** — keep the sim on cubes and merge them into
  larger drawn boxes. Rejected: it would fix nothing. ADR-0006 established that
  the sim, not the renderer, is the per-frame cost on a large scene (the
  renderer submits Upper Manhattan's 892k triangles in 1-2 ms), so a render-only
  change optimises the cheap half and buys **no headroom in the sim** — which is
  the currency the whole reinvestment argument is denominated in. It would also
  put geometry and physics on two different models, which is the failure the
  `shape` tag was rejected for.
- **Do nothing; author Cambridge at Boston's grain.** Rejected as the default,
  not on cost but on product: it is a direct refusal of a standing request that
  `STATUS.md` has been carrying unstarted, and every further scene authored
  brick-by-brick raises the eventual conversion cost.

## Related

- 0002 sim/render split
- 0006 automatic structural zones (the support BFS and determinism proof this
  must preserve)
- `.wiki/features/cambridge-sandbox/01-voxel-primitive-vocabulary.md` — the full
  capability audit, the twelve primitives, the grain rule, and the measurement
  plan
