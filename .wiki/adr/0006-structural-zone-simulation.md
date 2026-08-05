# ADR-0006: Automatic structural zones for the support-graph BFS

- **Status:** accepted
- **Date:** 2026-08-05
- **Deciders:** Nico

## Context

`.wiki/modules/voxel.md` previously recorded a deliberate decision: *"Hierarchical
zone-level simulation (the spec's 'structural zones' optimization) is
intentionally not implemented — the event-driven BFS handles the Manhattan
scene's ~25,800 blocks fine... Revisit zoning only past ~30k blocks."* That
call was correct when it was made — at 25,800 blocks the whole-scene BFS in
`_recalcSupport` was cheap enough that a per-frame renderer cost dominated
instead.

The 2026-08-05 Upper Manhattan rebuild crossed that threshold by a wide
margin: 73,393 blocks, 2.8× Manhattan's count. Measured on the finished scene,
driving produced a 15 fps median and a large collapse produced 3.3 fps.
Profiling (Node-only sim benchmark, per-method CPU profile, and browser frame
timing, cross-checked to within 2% of each other) found the cost was not the
renderer — the renderer alone submits the whole scene in 1-2 ms — it was
`_recalcSupport` at 48.55 ms/call, firing on 366 of every 400 steps while the
hole moved, and costing 80% of frame time. The "revisit past ~30k blocks"
condition in the earlier decision had been met and then some.

## Decision

Implement structural zones, but as **automatic connected components**, not as
scene-authored regions. The observation that makes this work: `_recalcSupport`'s
BFS only ever walks `neighbors` edges, so it can never cross between two
blocks that do not touch. The scene's connectivity graph is therefore already
partitioned into physically separate structures — buildings, bridges, rock
formations — and that partition is fixed at build time (`_buildNeighbors` sets
it; state changes only ever *remove* edges, never add new blocks that could
merge two zones).

`_recalcSupport` computes this decomposition once per scene build (Upper
Manhattan: 1,114 zones, the largest 3.4% of the scene; Brooklyn: 369; Lower
Manhattan: 149) and, on each call, recomputes only the zones a moving hole can
provably affect: zones whose graph changed (a block detached or was eaten,
tracked in `_dirtyComps`) plus a small radius around the hole for
support-ratio and hanging-verdict changes, resolved through a 4 m zone-lookup
grid. No scene file declares anything — the earlier ADR's implicit assumption
that zoning would require scene authors to draw region boundaries did not
hold; the graph already contains that information.

Two invariants had to be proved to keep this bit-identical to the old
whole-scene pass:

- The state-assignment pass still walks `this.blocks` in **array order**,
  filtered by a per-zone dirty flag, because that order is snapshotted into
  `_damageBlocks` and step 2 has cross-block effects — iterating zone-by-zone
  instead would interleave differently and be a different simulation.
- The BFS relaxation computes a least fixpoint of a monotone operator, so its
  value is unique regardless of visit order, and every span is an exact sum of
  multiples of 1/8 (block sizes are 0.25/0.5/1/2 m), so two paths that tie
  produce bit-identical floats.

Equivalence was proved three independent ways, not asserted: `tools/validate.mjs`
(byte-identical output including all 100 campaign levels), a full per-step
state digest comparing the frozen pre-change sim against the live one across
16 scripted excursions (including two multi-minute SIZE-10 ploughs generating
thousands of sleep/wake/re-chunk events), and 50 randomized fuzz runs with
seeded-random routes and tuning parameters. All matched.

The same pass gave the loose-debris scan (`_stepDebris`,
`_resolveDebrisContacts`) a maintained active set (`_falling`, kept sorted by
id — the sort order the contact solver's pairwise dedup depends on) instead of
scanning all blocks to find the ~1% that are moving, and gave sleeping,
non-chunked rubble a persistent broad-phase cell index (`_sleepObs`) instead
of rebuilding it from scratch every step. Both are the same idea as the zone
work: stop doing whole-scene work for a shrinking active set.

## Consequences

`_recalcSupport` fell from 48.55 ms/call to 0.295 ms/call (165×). Upper
Manhattan went from unplayable (15 fps driving, 3.3 fps worst collapse) to a
locked 60 fps in normal driving; the worst collapse still spikes to a 101 ms
p95 because `main.js`'s fixed-timestep catch-up loop clamps at 6 steps/frame
(a separate, deliberately unaddressed issue — see `STATUS.md`). Idle cost is
now effectively independent of scene size across all three built-city scenes,
because no scan is proportional to scene size any more. The `_recalcSupport`
per-call `Map`/`Set` allocations became reused typed arrays, which also
removed most of a ~400 MB/min GC churn the old version produced.

The cost is a small amount of bookkeeping precision: any future change to a
block's support-graph membership must remember to mark its zone in
`_dirtyComps`, and `_falling`/`_sleepObs` must be kept sorted by id on every
transition. These are now documented as gotchas in `.wiki/modules/voxel.md`.
`sim._floorBlocks` was removed as dead code once the zone decomposition
replaced its only caller.

This supersedes the "intentionally not implemented... revisit past ~30k
blocks" text in `.wiki/modules/voxel.md`, which has been rewritten. It does
not contradict ADR-0002's sim/render split — the fix is entirely inside the
pure-sim boundary, proven by the same `tools/validate.mjs` invariant that
boundary exists to support.

## Alternatives Considered

- **Author zones per scene** (what the superseded decision assumed zoning
  would require) — rejected once measurement showed the connectivity graph
  already encodes the same information for free; hand-authoring would have
  meant keeping zone boundaries in sync with every future geometry edit across
  three scene files, for no accuracy gain over discovering them.
- **Cap frame work instead of fixing the algorithm** (e.g. lower `main.js`'s
  catch-up clamp, or skip `_recalcSupport` on some frames) — rejected as the
  primary fix: it trades correctness or responsiveness for throughput rather
  than removing the O(scene size) cost, and the measured root cause was fixable
  outright. The catch-up clamp remains a live, separate lever, reported but
  not pulled this pass (see `STATUS.md`).
- **Give up and shrink the scene** — rejected: the rebuild's content (73k
  blocks across four districts) was the point of the pass, not incidental
  bloat to trim.
