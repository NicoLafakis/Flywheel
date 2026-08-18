---
covers:
  - "js/voxelscene-*.js"
  - "js/voxelforms.js"
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "tools/validate.mjs"
  - "js/main.js"
  - "js/ui/screens.js"
---
# Cambridge sandbox — the build tasks

**Status:** in flight. **Phases 0–6 are complete** — all ten districts stand, the
scene is registered and loadable, `node tools/validate.mjs` reaches `ALL PASS`,
and the map is driveable and goal-completable. Next up is Phase 7 (hidden
content, glyphs, achievements), whose achievement and belt rows remain blocked on
the online-Flywheel backend, and then the Phase 8 sign-off. `js/main.js`,
`js/ui/screens.js`, `js/voxelworld.js` and `tools/validate.mjs` have all moved
since (score-combo-and-hype, the directional-indicator fix, the twelve new
`voxelkit.js` gallery builders) — none of it touches Cambridge's registration,
districts or validator gate, so Phases 0-6 stand as complete. Later the same
day: `js/voxelsim.js`'s multi-hole roster refactor (single-player
bit-identical, see `architecture.md`) and the unrelated, uncommitted-to-any-menu
`js/voxelscene-chicago.js` (another session's in-progress work, incidentally
committed 92efbf2 to unbreak the deploy — see `modules/voxel.md`) don't touch
this page's Phase 0-6 claims either. `js/main.js`, `js/ui/screens.js` and
`tools/validate.mjs` show as changed in the drift tool's snapshot comparison
but are byte-identical across this range on inspection — a stale-snapshot
false positive. On 2026-08-11 `js/voxelsim.js`/`js/voxelworld.js` gained a
mover-simulation engine (derail/ground-run/eatable) and `js/voxelscene-chicago.js`
opted its CTA train into it (`f42ffde`/`89255b7`); `js/main.js`, `js/ui/screens.js`
and `tools/validate.mjs` are unchanged in this range (confirmed by diff).
None of it touches Cambridge's tasks.
**Reconciled 2026-08-17:** `js/voxelsim.js` changed again, scoped entirely to
The Lab (the `'gallery'` scene, not a `js/voxelscene-*.js` file) — new
monuments/mid-rises/supertalls/villas, a plinth/slab/wall subdivision into 2 m
structural bays, and a scoring/architecture/camera overhaul; none of it
touches Cambridge. `js/voxelworld.js` picked up one shared, engine-level
change that does reach every voxel scene including Cambridge: its 3D endgame
locator beacons now also trigger at ≤5% blocks remaining or ≥95% cleared, on
top of the existing ≤100-blocks / ≤30s triggers (see `modules/powerups.md`).
Cambridge's own tasks, registration and validator gate are unaffected.
**Date:** 2026-08-06, kept current as tasks land (reconciled 2026-08-10, twice; 2026-08-11; 2026-08-17).
**Reads with:** every other doc in this package — this page sequences their
decisions rather than re-arguing them. The owning-doc convention from `03`/`04`
holds: where a task description here disagrees with `01`–`04`, the numbered doc
is the one to trust.

This is a dependency-ordered list an implementer can work from without
re-deriving the design. Each task has a stable ID, a one-line statement of
done, the files or surfaces it touches, its dependencies, and a rough size
(S = under a day, M = a few days, L = the better part of a week).

**A note on piece counts.** The scene has a target we would like to come in
under — about **75,000 blocks** — and lower is better. Nothing in the validator
checks a block count, and there is no per-district contract to hit. What
`tools/validate.mjs` does check is per-district **density**: the mean gap
between consecutive eatable pieces along the scripted route. That is the real
guard against a map that feels sparse, and it is why coming in lean is safe. If
a district lands over the target, that is the signal to look at which buildings
could be built more efficiently — not a reason to pad one that came in light.

---

## Prerequisites

Three things gate the work downstream of them, and none is a normal task:

1. **ADR-0013.** Everything from Phase 2 onward is the anisotropic-extent
   engine change. The ADR was accepted on 2026-08-07 and the change has shipped
   (`js/voxelsim.js`, `js/voxelforms.js`).
2. **The coin-anchor change** (`sim.coinAnchors`, Phase 4) is a prerequisite,
   not a nice-to-have — see `00` §4.1 and `03` §8.1. Phase 7's hidden-content
   work is not buildable as designed without it: `04` §4.3 allocates 18 of 60
   coins to bridge specific gaps that a uniform scatter cannot target.
3. **The coin/chain change** (a coin refreshes `chainTimer`, never `chain` —
   `voxelsim.js:2192-2193`) ships with the coin-anchor change, same phase, same
   before/after. It is what keeps Cambridge's larger map from becoming the
   cheapest place to farm the Unbroken Chain belt (`04` §4.2).

None of the three is Cambridge-specific code. All three are small, general
sim/engine changes that Cambridge is simply the first thing to need.

---

## Phase 0 — Decision gate — **shipped**

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P0.1 | Owner has accepted or rejected ADR-0013. Acceptance flips its status line from `proposed` to `accepted`; ADRs are append-only, so a rejection would get a new ADR superseding it rather than an edit. | `.wiki/adr/0013-anisotropic-voxel-primitives.md` | none | — (decision, not build work) |

Accepted 2026-08-07 (`3613935`).

---

## Phase 1 — Independent renderer win + the measurement instrument — **shipped**

Shipped alone, on the pre-ADR tree, with its own before/after, so its win is
never credited to the vocabulary (`00` §2). Demonstrable on its own: the five
shipped scenes render at equal or fewer draw calls, `ALL PASS`.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P1.1 | `tools/probe-buildcost2.mjs` exists as a committed tool, min-of-N round-robin per `STATUS.md`'s instrument standard (N stated, machine quiet, no per-run number quoted otherwise). It came first because everything downstream is measured with it: the earliest numbers came from a scratch script, and the committed tool is what makes them reproducible. It is run by hand rather than by `tools/validate.mjs`. | `tools/probe-buildcost2.mjs` | none | S |
| P1.2 | `b.s` dropped from the render bucket key for unsurfaced blocks (`voxelworld.js:596-604`). Measured with P1.1: draw calls on all five shipped scenes are equal to or below the previous count, `ALL PASS`. | `js/voxelworld.js` | P1.1 | S |

**Gate:** `node tools/validate.mjs` → `ALL PASS`. Draw-call count reported
per scene, min-of-9, round-robin, before/after.

Both landed in `23a7708`.

---

## Phase 2 — The anisotropic-extent engine change (ADR-0013, Tier 1) — **shipped**

The widest change the sandbox has taken since ADR-0006, and almost entirely
mechanical — the risk sits in two tasks (P2.2, P2.4) rather than spread evenly
across the ~89 sites.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P2.1 | `fs`/`s` replaced by `fsx/fsy/fsz`/`sx/sy/sz` across the mechanical majority of `voxelsim.js`'s ~89 sites: `_addBlock`'s triple loop, `_consume`'s mirror of it, `_foot`, `_topAdd`/`_topRemove`/`_topAt`, `_contact`, `_sleepObsAdd`/`Remove`, `insertInto`, the collision-bucket build, `_assertCellKeyRange`'s pad, `_zoneCells`. Every cube (`sx===sy===sz`) reduces to its previous exact values. | `js/voxelsim.js` | P0.1 | L |
| P2.2 | Per-axis half-extents land in the solver everywhere at once (`hSum` and its uses become three values, not one). This one ships atomically with P2.1 rather than incrementally — a partial migration separates blocks along the wrong axes by the wrong amounts, and the intermediate state is not meaningfully testable. | `js/voxelsim.js` (solver: separation tests, contact resolution) | P2.1 | M |
| P2.3 | Mass/volume moved to `sx·sy·sz` (`totalMass`, `_consume`'s payout, `_sizeLadder`'s input); `sizeAvg` given a defined characteristic length (`cbrt(sx·sy·sz)`, so cubes are unchanged). | `js/voxelsim.js` | P2.1 | S |
| P2.4 | The span-hop axis-aware rewrite: `ns = cs + (cur.s + nb.s) / 2` (`:1090`) becomes extent-along-hop-axis-aware. `neighbors` is an unordered `Set` that does not record direction, so the axis is recovered from the two fine AABBs at BFS time. This is the one edit in the change that is not mechanical, and it lands in the hottest loop ADR-0006 exists to protect — budget it as its own piece of work, not as one line among ~89. | `js/voxelsim.js` (the 0-1 BFS) | P2.1, P2.2 | M |
| P2.5 | Vertical/horizontal classification moved to `cur.fsy`; creak timing moved to `cbrt(sx·sy·sz)` so existing scenes do not re-pace. | `js/voxelsim.js` | P2.1 | S |
| P2.6 | `voxelworld.js`'s six sites updated: `contentExtent`, the bucket key, camera-blocker sizing, the per-instance scale matrix. | `js/voxelworld.js` | P2.1 | S |
| P2.7 | `probeCellOwnership` and `footprintTops` in the validator generalised to three axes. | `tools/validate.mjs` | P2.1 | S |

**Gate (ADR-0013's acceptance condition):** `node tools/validate.mjs` →
`ALL PASS`, and all five existing scenes **byte-identical** — block counts,
total mass, and a per-step state digest across the existing scripted
excursions, held to the same standard of proof as ADR-0006. The digest is the
evidence here; a passing validator alone does not establish it.

---

## Phase 3 — The primitive layer and the shared gate probes — **shipped**

Mostly independent of Phase 4 — the one join point is P4.3, which needs P3.4's
density probe to exist first; otherwise both run in parallel once Phase 2
lands. The gate tasks are first-class tasks in their own right, because a scene
authored against a probe that does not exist yet has nothing checking it.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P3.1 | `js/voxelforms.js` exists: the twelve primitives (`slab`, `column`, `pier`, `beam`, `panel`, `mullion`, `cornice`, `plinth`, `tread`, `corbelArch`, `drum`, the stepped-wedge convention), pure geometry over `sim._block`, one `put()` site per builder, no import of `voxelkit.js`. **`corbelArch` as shipped is incompatible with P3.3** — see that row — so eleven of the twelve are in use and the twelfth has never been called. | `js/voxelforms.js` (new) | P2.* | M |
| P3.2 | Grade-diagonal probe (shared): no `gy === 0` block with plan diagonal > 8 m. `01` §4.2 clause 1 made enforceable. | `tools/validate.mjs` | P2.* | S |
| P3.3 | Placement-step probe (shared): placement step equals piece extent on every axis. `.wiki/modules/voxel.md` rule 10, generalised to anisotropic pieces. **This probe and P3.1's `corbelArch` contradict each other as shipped**: every corbel course trips it, because the "gap" the probe looks for is the arch's opening. Two districts wanted an arch and both declined the primitive for that reason. Phase 8 chooses — give `corbelArch` a step equal to its extent, or drop it from the twelve and say so. | `tools/validate.mjs` | P2.* | S |
| P3.4 | Per-district density probe (shared): takes a `{ id, name, rect, gapFloor }` table, iterates it, asserts mean gap between consecutive eatable pieces along the scene's scripted route stays under 15 m and no district falls below half the scene's median eatable-pieces-per-m². Excludes coins from the eatable-piece count (see P4.3 — landing these two together is what makes the exclusion tested rather than assumed). | `tools/validate.mjs` | P2.*, P3.1 | M |
| P3.5 | `probeHeroIdentity`: takes a hero/not-hero AABB pair and a colour key; asserts every signage block is inside the hero AABB and zero matching-colour blocks are inside the not-hero AABB. Written generically (table-parameterised) even though Cambridge is its first caller, per `03` §9.4's note that a future scene may have the same problem. | `tools/validate.mjs` | P2.* | S |

**Gate:** the four probes exist and pass trivially against the five existing
scenes (no districts/hero-AABB declared → vacuous pass), documented in
`.wiki/modules/voxel.md`'s probe list.

---

## Phase 4 — The coin-anchor and chain-economy engine change — **shipped**

Small, general, and — per the prerequisites above — load-bearing for everything
in Phase 7. Mostly independent of Phase 3; P4.3 is the exception, gated on
P3.4's density probe.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P4.1 | `_placeCoins` accepts an optional scene-declared `sim.coinAnchors` table; scenes that declare none keep the uniform scatter, unchanged, with the RNG draw holding its exact position in the seed sequence (ADR-0003). Verified by digest: all five existing scenes' coin layouts byte-identical before and after. | `js/voxelsim.js` (`_placeCoins`, `:324-338`) | none | S |
| P4.2 | `_collectCoins` refreshes `h.chainTimer` on pickup without touching `h.chain` (`:2192-2193` stay the only place `chain` increments). Verified: `comboMult`, `longest_chain` and the Unbroken Chain belt's qualifier unaffected on all five existing scenes. | `js/voxelsim.js` (`_collectCoins`, `_consume`) | none | S |
| P4.3 | The density probe (P3.4) explicitly excludes coins from its eatable-piece count, with a comment stating why (`04` §4.2: counting them would let an author paper over a dead zone with currency). | `tools/validate.mjs` | P3.4, P4.1 | S |

**Gate:** `ALL PASS`; five-scene digest byte-identical on coin layout, mass,
and combo numbers.

---

## Phase 5 — Vocabulary proof: District 2, authored twice — **shipped**

This was `01` §7's E1/E2, pinned to a real district rather than the freestanding
"Kendall Square + MIT river face" testbed `01` originally proposed. That
proposal predates `03`'s ten-district plan and does not map onto it cleanly
(Kendall/MIT in `03` is a ~260-block item inside District 9, not a 120×90 m
testbed). **District 2, the Davenport**, was the better choice and had already
been independently selected by `03` §9.5 as the scripted-excursion/regression
district — so E1/E2 was not throwaway work, and its output is the shipped
district.

What the phase was really asking: does the new building vocabulary produce a
richer-looking, denser-playing district for the same cost or less? It does.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P5.1 | District 2's plan (footprint, seven-section step pattern, palette) fixed from `03` §4.2 and §6.2, independent of which variant builds it. | `03` (reference only) | P3.1 | XS |
| P5.2 | **Variant A, `cambridge-brickwise`** — the plan built at the 0.25/0.5/1/2 m cube ladder, competently, as a fair control rather than a strawman. | scratch/test scene file | P5.1 | M |
| P5.3 | **Variant B1, `cambridge-forms`** — the identical plan through `js/voxelforms.js`, nothing added. Measured with P1.1: block count materially under A, with `grid.size` no higher than A's. A rising `grid.size` would mean *skin, not fill* had been dropped somewhere — solid pieces filling interiors — which is worth chasing down before building on top of B1. | scratch/test scene file | P3.1, P5.2 | M |
| P5.4 | E1 recorded: block-count delta, `grid.size` comparison, min-of-N build cost. | measurement notes | P5.3 | S |
| P5.5 | **Variant B2** — B1 with the district's remaining line items authored in (loading docks, yard clutter, the fire escapes, roof plant — `03` §4.2's own list), taking the district to the detail level the design calls for rather than to any particular total. **This is the shipped `js/voxelscene-cambridge.js` District 2.** | `js/voxelscene-cambridge.js` | P5.4 | M |
| P5.6 | E2 recorded against `01` §7.2's full set: distinct identifiable objects (target ≥ 50% up), eatable pieces/m² (not below A's), mean inter-piece gap (< 15 m), combo levels earned (within 10% of A's), draw calls/buckets reported separately for Tier 1 alone vs. Tier 1 + P1.2's key change, per-frame `sim.step` median/p95 and `_recalcSupport` ms/call on a scripted excursion identical across A/B1/B2. Min-of-N, round-robin, tree quiet. | measurement notes | P5.5 | M |

**Gate:** A and B2 both pass the full 19-probe contract plus P3.2/P3.3/P3.4.
E2's targets are *recorded* rather than pass/fail — a miss is information for
Phase 6, not a blocker. The number that actually mattered was density: B2 had
to be at least as eatable per square metre as A, and it was. B2 also came in
below A on block count, which is the outcome the whole change was for.

---

## Phase 6 — Scene authoring: the remaining nine districts — **complete**

District by district, so a partial Cambridge stops at a coherent edge rather
than a half-built one. Ordered to follow `03` §7.4's intended route where
possible — District 1 first because it is the spawn/climax anchor and the first
thing `probeHeroIdentity` needs real geometry to check.

**All ten districts are landed.** P6.12 was pulled forward and landed early —
see the note under the table. The finished scene is 72,943 blocks against the
under-75,000 target, dead ground zero, 814 generated camera blockers, and the
scripted excursion reaches SIZE 7 against P8.2's floor of 4.

| ID | State | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|---|
| P6.1 | **done** (`faaf220`) | Map scaffolding, geometry-independent half: `CAMBRIDGE_OFFSETS` (from `02` §6, with confidence markers) and the §1.2 scale-law conversion function. `sim.boundsRect`, `CAMBRIDGE_OPEN_GROUND` and the district table are not part of this task — they belong with the geometry that justifies them, see "How the map metadata grows" below. | `js/voxelscene-cambridge.js` | P3.1, P4.1 | S |
| P6.2 | **done** (`21171cd`) | **District 1 — Canal Park, the Hero Block.** 2 Canal Park member-by-member (`03` §6.1), 1 Canal Park, the front-door ring, spawn seating at (0, −14). `probeHeroIdentity`'s AABB pair gets real geometry. `HERO_SIGNAGE` authored to the `'entry'` default seam (`03` §6.5) — see the outside-information note below. Adds District 1's row to `CAMBRIDGE_DISTRICTS` and widens `sim.boundsRect` to hug Districts 1+2. | `js/voxelscene-cambridge.js` | P6.1, P3.5 | L |
| P6.3 | **done** (`860919f`) | **District 3 — Lechmere & the Viaduct.** First route leg; the local-recognition beat. Includes the Inner Belt yard geometry and that district's `CAMBRIDGE_OPEN_GROUND` ballast span. Adds its own `CAMBRIDGE_DISTRICTS` row and widens `sim.boundsRect` to hug whatever districts exist by that point. | `js/voxelscene-cambridge.js` | P6.2 | M |
| P6.4 | **done** (`d0a83e9`) | **District 4 — Cambridge Street & the Portuguese Seam.** The density reservoir. Adds its own `CAMBRIDGE_DISTRICTS` row and widens `sim.boundsRect`. | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.5 | **done** (`dfb50ac`) | **District 5 — Thorndike Civic.** The First Street Garage needs all three of `03` §8.2's density mitigations; with fewer, a 123 × 75 m parking deck reads as a dead zone in the middle of the district, and the density probe will say so. Adds its own `CAMBRIDGE_DISTRICTS` row and widens `sim.boundsRect`. | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.6 | **done** (`41d4c9f`) | **District 6 — The Canal & CambridgeSide.** Adds its own `CAMBRIDGE_DISTRICTS` row and widens `sim.boundsRect`. Authored the canal's water rather than declaring its ground open, which is the argument that settled `03` §1.4 down to a single span. | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.7 | **done** (`26e1464`) | **District 7 — North Point & Cambridge Crossing.** District 3 already built both of `03` §4.11's named buildings, so this district's share of that frontage is already on the map — see "Notes carried forward". Adds its own `CAMBRIDGE_DISTRICTS` row and widens `sim.boundsRect`. Its rect starts 10.5 m east of its own westernmost geometry; the measured fix is P8.1's. | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.8 | **done** (`b4e48c5`) | **District 8 — The Charles Shore.** Adds its own `CAMBRIDGE_DISTRICTS` row and widens `sim.boundsRect`, and declares `CAMBRIDGE_OPEN_GROUND`'s other declarable span (the Charles south of the Longfellow line). | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.9 | **done** (`7a29fe2`) | **District 9 — The Landmark Shelf.** Stata Center (`03` §5.2, watch the grade-clause clarification on plinth-run sizing), Great Dome + Killian Court, Longfellow, Zakim, Bunker Hill, MIT Green Building, Kendall/MIT, NECCO water tower. `03` §4 gives this district no rect — it is described as "the Ring B annulus, all edges" — so this task decides between per-edge-band rows and extending `probeDistrictDensity` to an annulus shape. A full-map rect would swallow the Ring A core and let the scene's highest-risk district never fail the probe, which is the outcome to avoid. Also resolves the TD Garden law-vs-doc 0.25 m gap (declare a `03` §1.5-style exception or nudge the position in). **Landed as three measured bands rather than one annulus row**, and the TD Garden move is now `03` §1.5's declared exception 6. | `js/voxelscene-cambridge.js` | P6.1 | L |
| P6.10 | **done** (`a9090bf`) | **District 10 — Street life, kerb kit & the edge-band gallery.** All five gallery items belong to `04`'s catalogue (`03` §8.3), so coordinate with P7.3 rather than authoring them here. `03` §4 calls this district's extent "scene-wide" rather than giving it a rect; decide whether it gets a probed `CAMBRIDGE_DISTRICTS` row at all or folds into the other nine as embedded props. The gallery's marks sit on an apron *adjacent* to a declared `CAMBRIDGE_OPEN_GROUND` span rather than inside one — `probeOpenGround` checks a span for emptiness, so a span holding content is no longer open ground. Finally widens `sim.boundsRect` to `03` §1.1's full map rect, now that every district exists to justify it. This is also where the doc-level reconciliations listed below get folded back into `02` and `03`. **Landed as four measured edge-band rows plus an embedded half that gets no row at all** — raising a neighbour's density *is* this district's brief, so its embedded pieces count toward the district they mitigate rather than toward a row of their own. It took the dead-ground census from 297 undeclared points to zero, which is P8.3's target reached inside Phase 6. Size was S in the plan and was not: 5,822 blocks. | `js/voxelscene-cambridge.js` | P6.2–P6.9 | S — in the event M, for the reason `03` §4.10 now records: the district was priced at 1,210 for a whole map's connective tissue |
| P6.11 | **done** (`a9090bf`), no edit needed | `generateBlockers(sim)` run over the finished geometry; camera blockers never hand-written. This needed no change at all: the call has been `cambridgeShell`'s last statement since Phase 5 and it runs after `buildings(sim)`, so it has always generated over the finished geometry rather than being typed. `03` §9.4's rule holds by construction — there is no literal blocker anywhere in the file to drift. The count went 813 → 814 over District 10, one rect, for the only thing that district builds taller than 6 m. | `js/voxelscene-cambridge.js` | P6.2–P6.10 | S |
| P6.12 | **done** (`2a7e0cc`), out of order | Scene wired in so it is both reachable and checked, at four points. (1) `js/voxelsim.js`: an `import { buildCambridge }` line, a `cambridge` branch in the scene dispatch alongside `manhattan`/`brooklyn`/`boston`, and a `cambridge` entry in `GOALS` (name + `targetFraction`, matching the other scenes). Before this landed nothing in the codebase imported `js/voxelscene-cambridge.js`, so the sim could not build the scene at all. (2) `tools/validate.mjs`: a Cambridge validation block modelled on the boston one — import the scene's exported tables, construct the sim, run the full probe list including `probeDistrictDensity` and `probeHeroIdentity` with Cambridge's real district rows and hero pair, plus the grade-diagonal and placement-step probes and a deterministic excursion check. (3) `js/main.js`: a `cambridge` entry in `AUTHORED_SCENES` (label/hud/intro subtitle, matching the existing entries' shape). (4) `js/ui/screens.js`: a `cambridge` row in `FREE_PLAY`, without which the finished scene has no way to load from the landing screen's free-play picker. | `js/voxelsim.js`, `tools/validate.mjs`, `js/main.js`, `js/ui/screens.js` | P6.11 | M — was S when this task was only the two registration entries; the validator block alone is ~40 lines of probe calls plus the excursion determinism check, and the sim dispatch is what first makes the scene runnable at all. |

**Gate, per district:** `probeCellOwnership`, P3.2 (grade diagonal), P3.3
(placement step) clean; that district's own `gapFloor` from `03` §8.2 met.
**Gate, phase-end:** the map is complete, driveable, and goal-completable
(50% of `totalMass`) even with Phase 7 not yet started.

**P6.12 was pulled forward, so the validator now covers Cambridge.** It was
scheduled last, after all ten districts, and moved because the scene was
reachable by nothing — no import, no dispatch branch, no validator block — so
the four districts standing at the time had never been through a single probe
and every density figure, piece count and gap measurement in this package and in
`02`/`03` came from ad-hoc harnesses rather than the standing validator.
Building six more districts on that footing would have meant six more unverified
ones. `js/voxelsim.js` now imports `buildCambridge`, dispatches on `cambridge`
and carries its `GOALS` row; `tools/validate.mjs` has a `validateCambridge()`
block modelled on `validateBoston()`; `js/main.js` and `js/ui/screens.js` carry
the `AUTHORED_SCENES` and `FREE_PLAY` entries, so the scene loads from the
free-play picker. `probeDistrictDensity` takes `CAMBRIDGE_DISTRICTS` rather than
the `[]` every other scene passes, and `probeHeroIdentity` takes the real
hero/not-hero pairs — the first time either has run against real tables in this
repo. The excursion drives `CAMBRIDGE_ROUTE` itself instead of a validator-local
waypoint copy, because the district rects and `gapFloor`s were authored against
those exact legs, and it holds the same `≥ 300` eaten and `≥ 4` SIZE floors as
every other scene. Figures quoted in this package that predate `2a7e0cc` are
still worth re-taking against the validator rather than trusting, but from here
`ALL PASS` does say something about Cambridge.

**Waiting on outside information.** `02` §8 leaves HubSpot's exterior signage on
2 Canal Park Unverified, along with whether both buildings are still
HubSpot-occupied in 2026. Both are questions for the product owner — a
street-level photo and one email, per `03` §6.5 — rather than research tasks.
District 1 shipped with the seam in place (`HERO_SIGNAGE` at its conservative
`'entry'` default), so a correction whenever either answer arrives is a one-line
constant edit, not a re-author.

### How the map metadata grows

`sim.boundsRect`, `CAMBRIDGE_OPEN_GROUND` and the `CAMBRIDGE_DISTRICTS` rows
land district by district, alongside the geometry that justifies them, rather
than being stubbed out in advance. The reason is that metadata sized for the
finished map, sitting on a tree with two districts built, fails the probes in
exactly the same way missing content does:

- **`sim.boundsRect` widens incrementally**, one district at a time, reaching
  `03` §1.1's full-map rect at P6.10. Jumping it to the full rect early clears
  the open-ground spans' edge-touching requirement but fails
  `probeBoundsRect`'s 12 m content-slack clause (one district cannot fill a
  252×228 m map), and it changes the scripted-excursion result by clamping the
  hole's travel differently — a regression against already-verified content.
- **Each district's `CAMBRIDGE_DISTRICTS` row lands with its geometry.**
  Declaring all ten rows up front takes `probeDistrictDensity` to eight
  failures: an unbuilt district reads 0.00 pieces/m², which the probe cannot
  distinguish from a district that was simply never filled in. Better stand-in
  rects do not help — Districts 1, 4, 5 and 10 all overlap District 2's rect
  whatever rect they are given, so the scene median never reads zero and the
  empty rows always fail against it. Each row is also refined against the
  district's actual built shell rather than shipped as `03` §4's approximate
  figure, the same way District 2's was.
- **`CAMBRIDGE_OPEN_GROUND` ends up with one span, not four.** Of `03` §1.4's
  four, the canal basin's real offset maps to an interior scene position, which
  `probeOpenGround` rejects regardless of `boundsRect` size, and the Zakim
  channel sits under its own bridge deck (the probe's emptiness check is 2D, so
  nothing there can read empty). Both are structurally undeclarable in any
  district. That left two: the Inner Belt yard's ballast (rail, not water, so it
  needs the declaration), which lands with P6.3 and is the one span this
  mechanism alone could do work for; and the Charles south of the Longfellow
  line, which is redundant with `reportDeadGround`'s own `sceneDecor.water`
  `BY_DESIGN` exemption. The Charles is water that is *built*, so it needs no
  promise, and the same argument retired the canal basin — authoring the water
  beats declaring the ground empty. `03` §1.4 now says one.

### Notes carried forward

Findings from the districts already landed that change what a later task should
do. Each is measured against the built tree, not inferred from the docs.

**The SIZE-ladder multiplier is now pinned at its ×10 cap, so from here mass
buys SIZE monotonically.** District 5 took `totalMass` past 42,000, which is
where `voxelsim.js:316`'s `Math.min(10, …)` stops rising. The crossing is worth
knowing because it happened *during* the district that also added the mass: the
first draft of route leg 5 still read SIZE 4, not because the content was thin
but because the ladder got 2× more expensive at the same moment the mass
arrived. Three passes through the garage deck instead of one closed it, and the
excursion now reaches SIZE 5 against P8.2's `≥ 4` floor — off the floor it had
been sitting on with zero margin. Every district from P6.6 on is measured
against a multiplier that can no longer move, so a SIZE reading that fails to
improve after adding a district is a real content signal rather than the ladder
re-scaling underneath the measurement.

**District rects are measured, not copied from `03` §4.** A rect that borrows a
neighbour's tower flatters its own density. District 3 built as `03` §4.3 writes
it (`x[-40,+40] z[-80,-36]`) reads 4.62 pieces/m², higher than the shipped
rect's 3.98/m² — but 31% of that count (1,662 pieces) is Sierra, District 1's
residential slab, annexed by the west edge. Shipped rect: `x[-18,11] z[-88,-36]`.
District 4 the same: shipped `x[-120,-72] z[-41,26]` → 6,121 pieces / 4.317 per
m², nothing shared with a neighbour, against §4.4's rect as written at 6,942
pieces / 4.215 per m², of which 2,007 belong to District 2 while missing 1,186
of District 4's own. Both districts record both numbers in-file. Do the same for
each remaining district.

**District 7 should not re-spend District 3's frontage.** District 3 built both
of `03` §4.11's named buildings (Transportation Office + Capuano carhouse) and
reads 926 pieces north of z −88, against §4.11's combined D3+D7 estimate of ~900
(D3 ~600 + D7 ~300). P6.7's content should go somewhere that is not already
built.

**`03` §4's per-object piece figures predate the anisotropic primitives, and §4
never priced ground at all.** Across all ten districts the pattern is two
patterns. Districts that built *buildings* to a §4 contents list sit at 65–73% of
it while shipping every in-scope line item (D1 72.6%, D2 66.7%, D3 65.3%,
D4 71.2%, D6 47% and 87% in scope, D8 62% and 80% in scope, D9 139% and 84% in
scope) — one piece now does what used to take a whole wall course of cubes, so
those figures are a stale unit rather than five underbuilds, and padding to hit
them would make the level worse to make a number right. Districts that had to add
*ground* land over (D5 107%, D7 158%, D10 481%), because §4 measured masonry and
did not measure pavement. `03` §4 now carries both corrections: multiply a
building line by ~0.7, and every district has a named ground line. The 75,000
scene target is untouched — the scene lands at 72,943 without either correction.

**A green route-density number does not prove a leg reaches the buildings its
own doc names.** District 4's route leg 4 read a 0.08 m mean gap while the two
buildings `03` §7.4 names for that leg — the savings bank and Silva Park — were
completely unreached by the 2.6 m corridor (0/98 and 0/497 pieces met). The bank
fronts south onto Silva Park rather than north onto the street a direct diagonal
runs along, so no route line the aggregate probe's own logic would place ever
reaches it. Fixed by scoring six route variants against the probe's arithmetic
and landing the one that reaches both anchors (72/98, 147/497) with no
regression to the other three districts. Check named anchors directly wherever a
leg's prose calls out a specific building.

**Two ranks, not one, where a route doubles back.** `projectOnRoute` assigns each
piece to exactly one leg — its nearest. An outbound and a return route sharing
one physical corridor will starve one of the two legs of every piece, and the
starved leg reads a false "hole" that has nothing to do with the ground it runs
over. The fix is two separate ranks on offset lines, not more content.

**Two local exceptions to `03` §1.2's scale law, both deliberate.** `03` §4.3's
catenary line item cannot be built — `_recalcSupport` never flows support
downward, so a hanging wire is an unsupported floating block — so District 3
uses masts with cantilever brackets borne from below. Track gauge is drawn at
1.0 m rather than the scale-correct 0.48 m, which at 0.25 m rail width would
render as a solid strip.

**Ring A and Ring B disagree by 0.33 m at the seam.** At real r = 340, Ring A
gives 113.333 and Ring B gives 113.000, so scene radius is briefly
non-monotonic for real r ∈ (339, 340] vs (340, 354]. No landmark falls in that
window today — the closest is Third Congregational Church (District 4) at
336.9 m real, 3.1 m of margin — but a future district's landmark could, so it is
now a permanent note in `03` §1.2. Otherwise the Ring B branch checks out
against `03` §5.4: worst radius error 0.109 m (inside the 0.25 m quantisation
step), worst bearing error 0.056°.

**The scripted excursion is now the validator's dominant cost.** Every district
appended legs to it, because `probeDistrictDensity` measures gaps along the route
and a district the route never enters cannot be measured by it — so the route
went from 62 s at Phase 5 to 134 legs, 2,178 m of arc and 780 s at P6.9. The
validator drives it twice for the determinism check, and cost per second of route
is superlinear in the hole's own SIZE, because the removal disc and the loose-body
count both grow with it: timed in a quiet process, the first 180 s of route cost
21 s of wall, the next 180 cost 217, and the last stretch cost more again. A
longer route is not proportionally dearer, it is several times dearer. **The free
lever is time, not geometry** — District 8 established that the density probe
reads gaps along the route's *arc* and never reads a leg's duration, so tightening
the `until` values on the early low-SIZE legs costs the probe nothing and moves
only the excursion's own eaten and SIZE figures. Reach for that before reshaping
the route.

**Doc-level corrections, and where each one now lives.** These are facts about
`02`/`03` rather than about the build. Every district that found one recorded it
in the scene file and could not act on it alone; the settlement was made at P6.10
against the built tree and is carried in `01`, `02` and `03` now. The list stays
because it is the audit trail — it says which section moved and why, so nobody
re-derives any of it:

- `03` §1.3's prose put Costa Lopez, Silva and Toomey parks, the Chang Shing
  Tofu Factory and American Twine "In, at Ring A". Their real radii (402–541 m)
  are all past §1.2's own 340 m seam, so `sceneOffset` — which implements §1.2 —
  correctly seats all five in Ring B. Ring A would seat Silva Park 19.5 m
  outside `maxX`. The law and the code agreed; §1.3's list was the thing that was
  wrong, and the five have moved to its Ring B list with the deltas recorded.
- `03` §5.4's Great Dome figure of "155 m" did not follow from its own
  real-world 1,706 m; the law gives 145.5 m (`sceneOffset` returns 145.49). The
  155 looks borrowed from NECCO's 154 m. §5.4 now states 145.5 with the
  derivation beside it, and its argument is unaffected — the ratio is ~11.7×.
- `02` §4 quoted several prose distances that are |E| (east component) rather
  than radius — the tofu factory as "240 m southwest" (|E| = 238) against a real
  radius of 494, the Portuguese parks as "300 m" against 402 and 418, the Glass
  Factory as "117 m WNW" against 224. It recurred three times, so it took one
  `02` fix: §4 now opens with a note that §6's table is the authority for any
  distance, and the three prose figures are corrected. It matters because a
  designer reading a prose distance is deciding which side of the 340 m ring seam
  a feature falls on, and at |E| all three read Ring A.
- District 2's in-file "6,532 blocks" comment is its own isolated build
  (`buildVariant('B2')`). In the shipped multi-district scene District 2's rect
  holds 6,535 — three of District 1's apron pieces at z −12.375 fall inside
  District 2's `minZ −12.5`. Confirmed unchanged at P6.10, and `01` §7.1 now
  says so, so the two numbers are never read as a regression.
- `03` §4.5 named the Registry of Deeds and the old Middlesex County Courthouse
  as District 5 line items worth 900 and 700 blocks, and §4.5's own rect excludes
  both derived seats. The rect is right and the contents list was wrong — a
  contents list cannot move a Confirmed offset and a rect can be checked. Both
  are struck from §4.5, its estimate is 1,600 lower, and they are described with
  District 4's other derived-but-unbuilt seats at §4.4. `CAMBRIDGE_OFFSETS` rows
  34–35 stay exactly as they are.
- `03` §4.7 claimed the Glass Factory, whose Confirmed offset seats it 110 m west
  of that district's rect. Same class of error, same resolution: the offset is
  right and the district assignment was wrong. It moves to §4.3, which is the
  quarter of the map it actually stands in, with a note that it is inside no
  `CAMBRIDGE_DISTRICTS` rect at all (874 pieces, 2.96/m²).
- `03` §9.2 listed seven ambient kinds and three of them — `ducks`, `geese`,
  `trains` — have no deriver, no mesh and no tick anywhere in the renderer.
  Resolved in favour of §9.2: Cambridge's roster is final at four kinds (gulls,
  steam, neon, pigeons). Adding three kinds touches a file four other scenes
  share, for ambient decoration, and declaring them without adding them would let
  `probeAmbient` go green on birds that do not exist. If anyone still wants them
  they are a `js/voxelworld.js` task in Phase 8, not a scene-file change.
- **Pieces that stand in no declared rect.** `probeCellOwnership` counts a
  district's pieces inside a *neighbour's* rect and reads zero for a piece inside
  no rect at all, so a green there proves nothing. Three bodies of geometry are
  outside every row: District 7's west verge (1,961 pieces at 4.98/m² over
  x[31,41.5] z[−94,−6], of which 1,557 are that district's own), the Glass
  Factory, and scattered seam furniture at four district edges. None is a defect
  in what is built and all three are defects in what is declared, and no district
  may move a neighbour's rect. P8.1's, with the numbers measured so the choice is
  not a guess — see that task.
- `corbelArch` is imported and has never been called, and it cannot be: it and
  P3.3's `probePlacementStep` are incompatible as shipped. `halfDomeShell` builds
  only a semi-dome and the kit's `obelisk` is cube-era at 1,480 blocks for a
  420-block line item. All three are recorded in `01` §4 and `03` §10, and all
  three are Phase 8 calls, because `js/voxelforms.js` and `js/voxelkit.js` are
  shared files and a change to either re-measures every district.

**Two District 4 items are deferred, by design.** Costa Lopez Park and the Chang
Shing Tofu Factory are genuine Ring B seats that land 40–66 m outside both `03`
§4.4's rect and the built map. Building them at their derived positions would
push `CAMBRIDGE_BOUNDS.maxZ` from +36 to ~+100 and open a 38 m dead band between
District 2's rear yard and the nearer of the two. `probeBoundsRect` would still
pass — it checks the perimeter — which is exactly the failure worth avoiding: a
green gate over a dead patch of playable map. Both shipped as `CAMBRIDGE_OFFSETS`
rows only (`plan: null`), no geometry, no district claim, until a district's own
ground reached them. **P6.9 built both** — Costa Lopez as a lawn centred (−71,+69)
and Chang Shing at (−40,+96), 5.7 m and 2.0 m from their seats — because the
landmark shelf's south band is the district that finally stands on that ground.
The owner review Chang Shing was flagged for is moot: the map reaches it.

**Two District 5 items are not built, and `03` §4.5 contradicts itself about
them — for P6.10 to reconcile.** The Registry of Deeds and the old Middlesex
County Courthouse both derive into ground District 4 already occupies (759 and
223 existing blocks inside their footprints, with Third Street's carriageway
running through both), and §4.5's own rect excludes both seats — so its contents
list and its rect disagree before this file is consulted. Building them would
have meant demolishing built, verified District 4 geometry to satisfy a list the
same section's rect already rules out. They ship as `CAMBRIDGE_OFFSETS` rows
34–35 with the plan recorded and no district claim, which keeps the derivation
auditable without putting geometry in contested ground. **P6.10 decided: the
contents list is what is wrong**, and §4.5 has been corrected accordingly.

**One known offset mismatch, left as-is.** `03` §1.2's law places the Davenport
15 m east / 7.6 m north of where District 2 actually ships, because Phase 5
built to `03` §4's approximate rect rather than to the law. District 2 is frozen
and correct as shipped; the mismatch is a fifth instance of the pattern `03`
§1.5 already establishes with its declared Ring A exceptions — a hand-placed
position overriding the raw formula — and it is now **declared as exception 5**
there rather than left as a disagreement between two sections. District 1 has no
equivalent ambiguity: `03` §1.4 hand-seats 2 Canal Park's centre at (0, −14)
directly. TD Garden's own 13.2 m move is exception 6, for the same reason.

---

## Phase 7 — Hidden content, glyphs, and achievements

**This is the next phase, and every district it targets now exists.** Eggs tied
to a specific district (§2.2–§2.8 of `04`) could have been authored alongside
that district's own Phase 6 task; none were, so the whole catalogue is ahead. The
edge-band gallery's *ground* is authored and kerbed and its five marks are not —
District 10 built the aprons adjacent to the ground each mark wants, and its
header names which apron belongs to which `04` item, so P7.3 does not have to
rediscover that. The one thing not unblocked by Phase 6 is P7.5 and P7.7:
achievement and belt content rows are still waiting on the online-Flywheel
backend, which is an inherited blocker rather than a new one.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P7.1 | `discoveries` field added to the metrics registry (per-scene bitmask, 128 bits) per `04` §3.1; `discovery_defs` content table (append-only bit indices); validator probe asserting every referenced bit exists, every declared bit is set by some code path, no achievement is unreachable. **Touches the online-Flywheel metrics registry** (`../online-flywheel/06-belts-and-achievements.md` §7) — coordinate with that package rather than forking a second registry. | `js/meta/rules.js`, `js/voxelscene-cambridge.js`, `tools/validate.mjs` | P6.* (at least one district) | M |
| P7.2 | `route_mask` field added (districts entered during the run, per-scene bitmask) — same registry, same probe coverage. Feeds achievement 80 ("Out of MIT") and doubles as the input P3.4's density probe already wants. | `js/meta/rules.js`, `js/voxelscene-cambridge.js` | P7.1 | S |
| P7.2b | `belt_taken` field added to the metrics registry (has the player earned the named belt this run) — same registry, same probe coverage as P7.1/P7.2. The only metric achievement 94 ("Home Field") needs that the registry does not already carry (`04` §3.4). | `js/meta/rules.js` | P7.2 | S |
| P7.3 | The glyph gallery (`04` §1): G1 sprocket, G2 Partner Alley (slot-list, not hardcoded — extensibility note in `04`), G3 ghost sprocket, G4 Founders' Line, G5 "UNBOUND", G6 anamorph (prototype the resolving camera pose before committing — `04` flags this as the one glyph with real risk), G7 NECCO reveal, G8 spreadsheet, G9 food court, G10 canal flywheel, G11 edge-band remainder. | `js/voxelscene-cambridge.js` | P6.2, P6.9, P7.1 | M |
| P7.4 | The egg catalogue (`04` §2, E1–E44), authored per district as that district lands — see parallelisation note. | `js/voxelscene-cambridge.js` | per-egg district task in P6.* | L |
| P7.4b | `CAMBRIDGE_COIN_ANCHORS` authored per `04` §4.3's six categories (18 bridging, 14 egg-beacon, 10 vertical, 8 edge-band, 6 efficiency, 4 true-hide; 60 total). The bridging coins are placed by running the scripted excursion and dropping one in every inter-eatable gap over 15 m, so this needs the districts it measures against substantially finished. The third of the three Cambridge-specific tables `03` §9.3 requires — `CAMBRIDGE_OFFSETS` and `CAMBRIDGE_DISTRICTS` are P6's. | `js/voxelscene-cambridge.js` | P3.4, P4.1, P6.* (bridging coins need finished district geometry to measure gaps against) | M |
| P7.5 | Achievement rows 59–96 (`04` §3.3) added as `achievement_defs` content, per `06` §7's data model. **Blocked on the same online-Flywheel backend prerequisites `STATUS.md` already tracks** (Supabase credential handover, plan choice) — not a new blocker, an inherited one that exists regardless of Cambridge. | content table (`03-technical-design.md`'s schema, online-Flywheel) | P7.1, P7.2b, online-Flywheel backend | M |
| P7.6 | "The Deep Cut" belt (`04` §3.5) taken to the belt-roster owner as a yes/no — an all-cities, UNBOUND-scoped belt over `discoveries` count, legal under `06`'s validator rule, and that owner's call rather than this package's. Achievement 95 ships either way at zero roster cost as the fallback. | decision only | P7.1 | XS |
| P7.7 | Cambridge added as a fifth Sprint Strap scope (`06` §2.2/§3) — one row, no design. Live UNBOUND belt count moves from 12 to 13. | content table, online-Flywheel | P6.* complete | XS |

**Gate:** discovery-bit coverage probe passes; achievement 95 ships regardless
of P7.6's outcome; `06`'s validator rule (no two belts at one scope share a
metric-and-direction) re-checked after P7.7.

---

## Phase 8 — Full validator sign-off and doc hygiene

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P8.1 | Full shared 19-probe contract plus the four new probes (P3.2–P3.5) pass against the complete scene, Cambridge's own tables supplied (`CAMBRIDGE_OFFSETS`, `CAMBRIDGE_DISTRICTS`, `CAMBRIDGE_COIN_ANCHORS`, `CAMBRIDGE_VEHICLES`, `CAMBRIDGE_ROAD_SPANS`, `CAMBRIDGE_STREETS`/`CROSSINGS`). It passes today against the ten-district scene without `CAMBRIDGE_COIN_ANCHORS`, which is P7.4b's; the remaining work is re-running it once Phase 7's tables exist. **Also settles the pieces that stand in no declared rect** (see "Notes carried forward"): either widen District 7's rect west to x[31,107] z[−94,−8] — measured at 11,565 pieces over 2,751 cells, 4.204/m² against the shipped row's 3.996, so it neither weakens the check nor flatters the row — or add a `03` §4.7 note that the verge is deliberately unrowed. No district could do this, because none may move a neighbour's rect. | `tools/validate.mjs`, `js/voxelscene-cambridge.js` | P6.*, P7.* | S |
| P8.2 | The scripted excursion (Davenport long axis + First Street, `03` §9.5) passes: determinism across two runs, `eatenCount ≥ 300`, `size ≥ 4`. If eats fall short of 300 on the vocabulary-built district, the answer is content rather than a lowered floor (`03` §9.5's own instruction). Measured against the **complete** ten-district scene — see the ladder-scaling note below. The eats shortfall predicted here did happen (289) and was answered with content rather than a lower floor; the finished run reaches SIZE 7, three rungs above the floor. | `tools/validate.mjs` | P6.4/P5.5 | S |
| P8.3 | Dead-ground census at zero, checked cell-by-cell (not the 4 m sampled probe). **Reached at P6.10**, by the district `03` §8.2 calls the mitigation for the other nine: District 9 left the census at 297 undeclared points in four clusters, and District 10 was drawn around those exact clusters and took it to zero. What remains for this task is confirming it holds once Phase 7 adds content. | `tools/validate.mjs` | P6.* | S |
| P8.4 | Doc hygiene, same commit as the last code change: `.wiki/modules/voxel.md` gains `js/voxelforms.js` and `js/voxelscene-cambridge.js` in `covers:` and a Cambridge Scenes entry; `AGENTS.md`'s validate-required file list gains both; `STATUS.md` gets one line. | `.wiki/modules/voxel.md`, `AGENTS.md`, `STATUS.md` | P8.1 | S |
| P8.5 | The 12-fixed-pose apparent-richness capture (`01` §7.3): Sobel edge density, distinct roofline heights per 10 m of frontage, mean luminance, visible-piece count, compared A vs. B2 from Phase 5. Owner reviews both variants behind the free-play picker — the one gate whose pass/fail is a judgement call rather than a number. | screenshots + measurement notes | P8.1 | M |
| P8.6 | The three shared-file items Phase 6 recorded and could not fix, decided together because they touch the same two files and each change re-measures every district. (a) `corbelArch` and `probePlacementStep` are incompatible as shipped — give the primitive a step equal to its extent, or drop it from the twelve and say so in `01` §4.1. (b) `halfDomeShell` builds only a semi-dome. (c) The kit's `obelisk` is cube-era, 1,480 blocks for a 420-block line item. Optionally also (d): whether `ducks`, `geese` and `trains` get derivers, meshes and ticks in `js/voxelworld.js` — Cambridge's ambient roster is final at four kinds either way, so this is a shared-contract question rather than a Cambridge one. | `js/voxelforms.js`, `js/voxelkit.js`, `tools/validate.mjs`, `js/voxelworld.js` | P8.1 | M |

**Gate:** `node tools/validate.mjs` → `ALL PASS`. Both of `01` §8's open owner
questions (bite size, crumble-vs-collapse) get answered by playing rather than
by blocking — they tune bay size, they do not gate ship.

**The SIZE ladder scales with the scene's own mass.** `voxelsim.js:316` scales
the entire ladder by total mass:

```js
this._sizeLadder = SIZE_MASS.map((m) => m * 0.3 * Math.min(10, Math.max(1,
  Math.round(this.totalMass / 4200))));
```

District 2 alone (totalMass 9,299) multiplies ×2; Districts 1+2 (totalMass
21,783) already multiplies ×5 — every rung 2.5× more expensive — and District 5
took `totalMass` past 42,000, which pins the multiplier at its ×10 cap for the
rest of the build. Measured on Districts 1+2 at ×5, the Davenport excursion
reaches SIZE 3 against
P8.2's `≥ 4`, and not because of a content regression: holding the multiplier
and the route fixed, District 1 strictly *improves* the excursion. That is the
ladder's own design working as intended.

It is also not a reason to weaken P8.2's floor. `03` §9.5 anticipated scenes
needing more mass and capped the multiplier at ×10 "so the largest scenes are
not held to a lower standard than the ones they were built to surpass" — the
absolute `size ≥ 4` target is the point, and asserting it against a scene's own
ladder rung instead would undo what the cap is for. What it does mean is that
P8.2 only becomes meaningful once the map is complete. A two-of-ten-district
build reading SIZE 3 is expected. Any dev-time gate run during Phase 6
(`_phase5-deliverables/gate.mjs`) that still asserts Phase 5's District-2-only
numbers (`eaten ≥ 300` / `size ≥ 4`, calibrated to a ×2 multiplier) against a
growing partial build should treat that one assertion as informational until
P8.2 runs against the finished scene. The district, gap, hero, dead-ground and
cross-run determinism checks all stay meaningful at partial scale.

**One pacing question for P8.5's owner review.** `03` §7.2 promises "ten seconds
of eating 0.25 m furniture ... puts the player at SIZE 2 with a live chain."
Measured on the Districts-1+2 scene at its ×5 multiplier, ten seconds in the
front-door ring yields `rawMass` 7 against a SIZE-2 rung of 37.5 — roughly 5×
short, and the finished map's ×10 cap would double that gap. The same arithmetic
likely touches every rung in §7.3's table (SIZE 2/3/5/6/8/10-12 at named route
legs), since all of those are absolute-SIZE promises made before the ladder's
mass-scaling was measured at real content volume. Whether to add mass to the
early ring, redesign the opening beat, or accept the drift as intended pacing
for a bigger map is a level-design call — re-measure against the finished map at
P8.5 and decide then.

---

## Critical path

P0.1 (ADR-0013 accepted) → P2.1 → P2.2 → P2.4 → P2.1–P2.7 complete → P3.1
(voxelforms exists) → P3.2–P3.4 (gate probes exist) → P5.1–P5.6 (District 2
proves the vocabulary and ships as the first real district) → P6.1 (map
scaffolding) → P6.2 (hero district) → P6.3, P6.5–P6.9 (remaining districts,
order among these is flexible) → P6.10–P6.12 (glue, blockers & scene
registration) → P7.1–P7.2b (registry fields) → P7.3–P7.4b (hidden content) →
P8.1–P8.6 (sign-off).

**All of Phase 6 is done**, so the live critical path now runs P7.1 → P7.2/P7.2b
→ P7.3/P7.4/P7.4b → P8. P7.5 and P7.7 sit outside it, waiting on the
online-Flywheel backend rather than on anything here.

The longest pole was Phase 2, the engine change, and it has landed. What remains
is authoring effort, which scales with people.

## Parallelizable work

- **P3.* and P4.* were mostly independent** and ran side by side once P2
  landed — the one join point was P4.3, which needed P3.4's density probe to
  exist before it could wire in the coin-exclusion clause.
- **Districts P6.5–P6.9 had no dependency on one another**, only on P6.1
  (scaffolding), and in the event they ran in order anyway.
- **P7.4 (the egg catalogue) was meant to parallelise with P6.5–P6.9 directly**:
  each egg in `04` §2 is scoped to one district, so an author finishing a
  district could have authored that district's eggs immediately. That did not
  happen, so the whole catalogue is Phase 7 work now and it parallelises across
  districts instead of alongside them. The hard sequencing is unchanged: P7.1
  (the `discoveries` field) has to exist before any egg's discovery bit can be
  wired up, so land P7.1 first.
- **P7.4b (coin anchors) does not parallelise the same way.** Its bridging coins
  are placed by measuring real gaps along the scripted route, so unlike P7.4 it
  needs the districts it measures substantially finished, not just started —
  plan it near the end of Phase 6/7.
- **P7.5 and P7.7 (achievement/belt content rows) are blocked on the
  online-Flywheel backend**, not on any Cambridge task — they can be written and
  reviewed as content whenever, but cannot ship live until that package's own
  Supabase/Vercel prerequisites (`STATUS.md`) clear. This does not block
  Cambridge itself: the level is playable and its goal completable without a
  single achievement or belt wired up.
- **District 1's signage detail is the one item waiting on someone outside this
  package** (a photo, an email) — it shipped on the conservative default and is
  a one-line edit away from correction.

## Related

- `README.md` — the package index
- `00-objective-overview.md` — why this level exists, and the sequencing this
  task list follows
- `01-voxel-primitive-vocabulary.md` — the toolkit, the cost model, the
  measurement plan (§7) this page's Phase 5 and P8.5 execute
- `02-cambridge-reference.md` — the facts, and the signage item District 1 is
  still waiting on
- `03-level-design.md` — the map, the districts, the density floors, the
  validator compliance section this page turns into tasks
- `04-easter-eggs-and-achievements.md` — the hidden-content catalogue Phase 7
  builds
- `../online-flywheel/06-belts-and-achievements.md` — the belt/achievement
  system Phase 7 extends, and the backend prerequisite it inherits
- `../../adr/0013-anisotropic-voxel-primitives.md` — the decision Phase 2
  implements
- `../../adr/0006-structural-zone-simulation.md` — the support BFS and
  determinism proof Phase 2 preserves
- `../../adr/0003-deterministic-seeded-generation.md` — the RNG-sequence
  invariant Phase 4 preserves
