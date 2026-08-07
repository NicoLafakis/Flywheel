---
covers:
  - "js/voxelscene-*.js"
  - "js/voxelforms.js"
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "tools/validate.mjs"
---
# Cambridge sandbox — the build tasks

**Status:** ordered work breakdown. Nothing here is built.
**Date:** 2026-08-07.
**Reads with:** every other doc in this package — this page sequences their
decisions, it does not re-argue them. Owning-doc rule from `03`/`04` still
applies: if a task description here disagrees with `01`–`04`, the numbered doc
is right and this page has drifted.

This is a dependency-ordered list an implementer can work from without
re-deriving the design. Each task has a stable ID, a one-line statement of
done, the files or surfaces it touches, its dependencies, and a rough size
(S = under a day, M = a few days, L = the better part of a week).

---

## Prerequisites — read this before task 1

Three things gate everything downstream of them, and none is a normal task:

1. **ADR-0013 is still `proposed`.** Everything in Phase 2 onward is an
   anisotropic-extent engine change that does not exist until the owner
   accepts it. This is an **approval gate**, not a done deal, and it is not
   this package's call to make for him — see P0.1.
2. **The coin-anchor change** (`sim.coinAnchors`, Phase 4) is a prerequisite,
   not a pen — reclassified during this package's reconciliation pass, see
   `00` §4.1 and `03` §8.1. Nothing in Phase 7's hidden-content work is
   buildable as designed without it: `04` §4.3 allocates 18 of 60 coins to
   bridge gaps that a uniform scatter cannot target.
3. **The coin/chain change** (a coin refreshes `chainTimer`, never `chain` —
   `voxelsim.js:2192-2193`) ships with the coin-anchor change, same phase,
   same before/after. It is what keeps Cambridge's larger map from becoming
   the cheapest place to farm the Unbroken Chain belt (`04` §4.2).

None of the three is Cambridge-specific code. All three are small, general
sim/engine changes that Cambridge is the first thing to need.

---

## Phase 0 — Decision gate

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P0.1 | Owner has accepted or rejected ADR-0013. Acceptance flips its status line from `proposed` to `accepted`; ADRs are append-only, so a rejection gets a new ADR that supersedes it, never an edit. | `.wiki/adr/0013-anisotropic-voxel-primitives.md` | none | — (decision, not build work) |

**Nothing in Phase 2 onward starts before P0.1 resolves yes.** Phase 1 does not
wait on it — see below.

---

## Phase 1 — Independent renderer win + the measurement instrument

Ships alone, on today's tree, with its own before/after, precisely so its win
is never credited to the vocabulary (`00` §2). Demonstrable on its own: the
five shipped scenes render at equal or fewer draw calls, `ALL PASS`.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P1.1 | `tools/probe-buildcost2.mjs` exists as a committed tool, min-of-N round-robin per `STATUS.md`'s instrument standard (N stated, machine quiet, no per-run number quoted otherwise). This is task zero: `01` §7 flags that today's numbers came from a scratch script not in the repo, so nothing downstream is measurable until this exists. | `tools/probe-buildcost2.mjs` (new) | none | S |
| P1.2 | `b.s` dropped from the render bucket key for unsurfaced blocks (`voxelworld.js:596-604`). Measured with P1.1: draw calls on all five shipped scenes are equal to or below today's count, `ALL PASS`. | `js/voxelworld.js` | P1.1 | S |

**Gate:** `node tools/validate.mjs` → `ALL PASS`. Draw-call count reported
per scene, min-of-9, round-robin, before/after.

---

## Phase 2 — The anisotropic-extent engine change (ADR-0013, Tier 1)

Gated on P0.1. This is the widest change the sandbox has taken since ADR-0006
and it is almost entirely mechanical — the risk is concentrated in two tasks
(P2.2, P2.4), not spread evenly across the ~89 sites.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P2.1 | `fs`/`s` replaced by `fsx/fsy/fsz`/`sx/sy/sz` across the mechanical majority of `voxelsim.js`'s ~89 sites: `_addBlock`'s triple loop, `_consume`'s mirror of it, `_foot`, `_topAdd`/`_topRemove`/`_topAt`, `_contact`, `_sleepObsAdd`/`Remove`, `insertInto`, the collision-bucket build, `_assertCellKeyRange`'s pad, `_zoneCells`. Every cube (`sx===sy===sz`) reduces to today's exact values. | `js/voxelsim.js` | P0.1 | L |
| P2.2 | Per-axis half-extents land in the solver everywhere at once (`hSum` and its uses become three values, not one) — must ship atomically with P2.1, not incrementally, or blocks separate along wrong axes by wrong amounts mid-migration. | `js/voxelsim.js` (solver: separation tests, contact resolution) | P2.1 | M |
| P2.3 | Mass/volume moved to `sx·sy·sz` (`totalMass`, `_consume`'s payout, `_sizeLadder`'s input); `sizeAvg` given a defined characteristic length (`cbrt(sx·sy·sz)`, so cubes are unchanged). | `js/voxelsim.js` | P2.1 | S |
| P2.4 | The span-hop axis-aware rewrite: `ns = cs + (cur.s + nb.s) / 2` (`:1090`) becomes extent-along-hop-axis-aware. `neighbors` is an unordered `Set` that does not record direction, so the axis must be recovered from the two fine AABBs at BFS time. This is the one edit in the whole change that is not mechanical, and it lands in the hottest loop ADR-0006 exists to protect — budget it accordingly and do not treat it as one line among ~89. | `js/voxelsim.js` (the 0-1 BFS) | P2.1, P2.2 | M |
| P2.5 | Vertical/horizontal classification moved to `cur.fsy`; creak timing moved to `cbrt(sx·sy·sz)` so existing scenes do not re-pace. | `js/voxelsim.js` | P2.1 | S |
| P2.6 | `voxelworld.js`'s six sites updated: `contentExtent`, the bucket key, camera-blocker sizing, the per-instance scale matrix. | `js/voxelworld.js` | P2.1 | S |
| P2.7 | `probeCellOwnership` and `footprintTops` in the validator generalised to three axes. | `tools/validate.mjs` | P2.1 | S |

**Gate (non-negotiable acceptance condition, ADR-0013):** `node tools/validate.mjs`
→ `ALL PASS`, and all five existing scenes **byte-identical** — block counts,
total mass, and a per-step state digest across the existing scripted
excursions, the same standard of proof ADR-0006 was held to. Trust nothing
here; re-run the digest.

---

## Phase 3 — The primitive layer and the shared gate probes

Independent of Phase 4; both can run in parallel once Phase 2 lands. The gate
tasks are listed first-class per the package brief — a scene should never be
authored against a probe that does not exist yet.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P3.1 | `js/voxelforms.js` exists: the twelve primitives (`slab`, `column`, `pier`, `beam`, `panel`, `mullion`, `cornice`, `plinth`, `tread`, `corbelArch`, `drum`, the stepped-wedge convention), pure geometry over `sim._block`, one `put()` site per builder, never imports `voxelkit.js`. | `js/voxelforms.js` (new) | P2.* | M |
| P3.2 | Grade-diagonal probe (shared): no `gy === 0` block with plan diagonal > 8 m. `01` §4.2 clause 1 made enforceable. | `tools/validate.mjs` | P2.* | S |
| P3.3 | Placement-step probe (shared): placement step equals piece extent on every axis. `.wiki/modules/voxel.md` rule 10, generalised to anisotropic pieces. | `tools/validate.mjs` | P2.* | S |
| P3.4 | Per-district density probe (shared): takes a `{ id, name, rect, budget, gapFloor }` table, iterates it, asserts mean gap between consecutive eatable pieces along the scene's scripted route stays under 15 m and no district falls below half the scene's median eatable-pieces-per-m². Must exclude coins from the eatable-piece count (see P4.3 — land these two together or the exclusion is untested). | `tools/validate.mjs` | P2.*, P3.1 | M |
| P3.5 | `probeHeroIdentity`: takes a hero/not-hero AABB pair and a colour key; asserts every signage block is inside the hero AABB and zero matching-colour blocks are inside the not-hero AABB. Written generically (table-parameterised) even though Cambridge is its first caller, per `03` §9.4's note that a future scene may have the same problem. | `tools/validate.mjs` | P2.* | S |

**Gate:** the four probes exist and pass trivially against the five existing
scenes (no districts/hero-AABB declared → vacuous pass), documented in
`.wiki/modules/voxel.md`'s probe list.

---

## Phase 4 — The coin-anchor and chain-economy engine change

Small, general, and — per the prerequisites section above — load-bearing for
everything in Phase 7. Independent of Phase 3; both can run in parallel.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P4.1 | `_placeCoins` accepts an optional scene-declared `sim.coinAnchors` table; scenes that declare none keep today's uniform scatter, unchanged, with the RNG draw holding its exact position in the seed sequence (ADR-0003). Verified by digest: all five existing scenes' coin layouts are byte-identical before and after. | `js/voxelsim.js` (`_placeCoins`, `:324-338`) | none | S |
| P4.2 | `_collectCoins` refreshes `h.chainTimer` on pickup without touching `h.chain` (`:2192-2193` stay the only place `chain` increments). Verified: `comboMult`, `longest_chain` and the Unbroken Chain belt's qualifier are unaffected on all five existing scenes. | `js/voxelsim.js` (`_collectCoins`, `_consume`) | none | S |
| P4.3 | The density probe (P3.4) explicitly excludes coins from its eatable-piece count, with a comment stating why (`04` §4.2's gate note: counting them lets an author paper over a dead zone with currency). | `tools/validate.mjs` | P3.4, P4.1 | S |

**Gate:** `ALL PASS`; five-scene digest byte-identical on coin layout, mass,
and combo numbers.

---

## Phase 5 — Vocabulary proof: District 2, authored twice

This is `01` §7's E1/E2, pinned to a real district rather than the freestanding
"Kendall Square + MIT river face" testbed `01` originally proposed — that
proposal predates `03`'s ten-district plan and does not map onto it cleanly
(Kendall/MIT in `03` is a ~260-block item inside District 9, not a 120×90 m
testbed). **District 2, the Davenport**, is the better choice and was already
independently selected by `03` §9.5 as the scripted-excursion/regression
district — reusing it means E1/E2 is not throwaway work, its B2 output is the
shipped district.

Demonstrable on its own: one fully validated, playable slice of Cambridge.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P5.1 | District 2's plan (footprint, seven-section step pattern, palette) is fixed from `03` §4.2 and §6.2, independent of which variant builds it. | `03` (reference only) | P3.1 | XS |
| P5.2 | **Variant A, `cambridge-brickwise`** — the plan built at today's 0.25/0.5/1/2 m ladder, competently, as a fair control (not a strawman). | scratch/test scene file | P5.1 | M |
| P5.3 | **Variant B1, `cambridge-forms`** — the identical plan through `js/voxelforms.js`, nothing added. Measured with P1.1: block count materially under A, `grid.size` not higher than A's (if `grid.size` rises, hand 1 was dropped — stop and fix before B2). | scratch/test scene file | P3.1, P5.2 | M |
| P5.4 | E1 recorded: block-count delta (the released budget), `grid.size` comparison, min-of-N build cost. | measurement notes | P5.3 | S |
| P5.5 | **Variant B2** — B1's released budget spent back into the same district (loading docks, yard clutter, the fire escapes, roof plant — `03` §4.2's "hand 2" line items) until the total is within ±15% of A. **This is the shipped `js/voxelscene-cambridge.js` District 2.** | `js/voxelscene-cambridge.js` | P5.4 | M |
| P5.6 | E2 recorded against `01` §7.2's full set: distinct identifiable objects (target ≥ 50% up), eatable pieces/m² (not below A's), mean inter-piece gap (< 15 m), combo levels earned (within 10% of A's), draw calls/buckets reported separately for Tier 1 alone vs. Tier 1 + P1.2's key change, per-frame `sim.step` median/p95 and `_recalcSupport` ms/call on a scripted excursion identical across A/B1/B2. Min-of-N, round-robin, tree quiet. | measurement notes | P5.5 | M |

**Gate:** A and B2 both pass the full 19-probe contract plus P3.2/P3.3/P3.4.
E1 target met (B1 down, `grid.size` not up) before B2 is authored. E2 targets
are *recorded*, not required to pass on the first attempt — a miss here is
information for P6, not a blocker to continuing (a falling block count in B2
is the one failure mode that must be fixed before shipping, per `01` §7.2).

---

## Phase 6 — Scene authoring: the remaining nine districts

District by district, so a partial Cambridge stops at a coherent edge rather
than a half-built one. Ordered to follow `03` §7.4's intended route where
possible — District 1 first because it is the spawn/climax anchor and the
first thing `probeHeroIdentity` needs real geometry to check.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P6.1 | Map scaffolding: `sim.boundsRect`, `CAMBRIDGE_OFFSETS` (from `02` §6, with confidence markers), the §1.2 scale-law conversion function, `CAMBRIDGE_OPEN_GROUND` (4 spans), `CAMBRIDGE_DISTRICTS` table stub (10 rows, budgets from `03` §4, `gapFloor` from `03` §8.2). | `js/voxelscene-cambridge.js` | P3.1, P4.1 | M |
| P6.2 | **District 1 — Canal Park, the Hero Block.** 2 Canal Park member-by-member (`03` §6.1), 1 Canal Park, the front-door ring, spawn seating at (0, −14). `probeHeroIdentity`'s AABB pair gets real geometry. `HERO_SIGNAGE` authored to the `'entry'` default seam (`03` §6.5) — **see the blocked-on-signage note below before finalising this task.** | `js/voxelscene-cambridge.js` | P6.1, P3.5 | L |
| P6.3 | **District 3 — Lechmere & the Viaduct.** First route leg; the local-recognition beat. | `js/voxelscene-cambridge.js` | P6.2 | M |
| P6.4 | **District 4 — Cambridge Street & the Portuguese Seam.** The density reservoir. | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.5 | **District 5 — Thorndike Civic.** Includes the First Street Garage's three required density mitigations (`03` §8.2) — all three, or the district fails the probe. | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.6 | **District 6 — The Canal & CambridgeSide.** | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.7 | **District 7 — North Point & Cambridge Crossing.** | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.8 | **District 8 — The Charles Shore.** | `js/voxelscene-cambridge.js` | P6.1 | M |
| P6.9 | **District 9 — The Landmark Shelf.** Stata Center (`03` §5.2, watch the grade-clause clarification on plinth-run sizing), Great Dome + Killian Court, Longfellow, Zakim, Bunker Hill, MIT Green Building, Kendall/MIT, NECCO water tower. | `js/voxelscene-cambridge.js` | P6.1 | L |
| P6.10 | **District 10 — Street life, kerb kit & the four edge marks.** Two of four edge-mark slots reserved for `04`'s catalogue — coordinate with P7.3 rather than filling all four here. | `js/voxelscene-cambridge.js` | P6.2–P6.9 | S |
| P6.11 | `generateBlockers(sim)` run over the finished geometry; camera blockers never hand-written. | `js/voxelscene-cambridge.js` | P6.2–P6.10 | S |

**Gate, per district:** `probeCellOwnership`, P3.2 (grade diagonal), P3.3
(placement step) clean; that district's own `gapFloor` from `03` §8.2 met.
**Gate, phase-end:** the map is complete, driveable, and goal-completable
(50% of `totalMass`) even with Phase 7 not yet started.

**Blocked on outside information — flag here, do not research around it:**
`02` §8 leaves HubSpot's exterior signage on 2 Canal Park Unverified, and
whether both buildings are still HubSpot-occupied in 2026. Both are questions
for the product owner — a street-level photo and one email, per `03` §6.5 —
not research tasks. P6.2 ships with the seam (`HERO_SIGNAGE` at its
conservative `'entry'` default) regardless of when either answer arrives; a
correction after the fact is a one-line constant edit, not a re-author.

---

## Phase 7 — Hidden content, glyphs, and achievements

Can start once its target districts exist (P6.*) and P4.* has landed. Eggs
tied to a specific district (§2.2–§2.8 of `04`) can be authored alongside
that district's own task in Phase 6 rather than waiting for all ten — this is
the phase's main parallelization opportunity, noted again below.

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P7.1 | `discoveries` field added to the metrics registry (per-scene bitmask, 128 bits) per `04` §3.1; `discovery_defs` content table (append-only bit indices); validator probe asserting every referenced bit exists, every declared bit is set by some code path, no achievement is unreachable. **Touches the online-Flywheel metrics registry** (`../online-flywheel/06-belts-and-achievements.md` §7) — coordinate with that package rather than forking a second registry. | `js/meta/rules.js`, `js/voxelscene-cambridge.js`, `tools/validate.mjs` | P6.* (at least one district) | M |
| P7.2 | `route_mask` field added (districts entered during the run, per-scene bitmask) — same registry, same probe coverage. Feeds achievement 80 ("Out of MIT") and doubles as the input P3.4's density probe already wants. | `js/meta/rules.js`, `js/voxelscene-cambridge.js` | P7.1 | S |
| P7.3 | The glyph gallery (`04` §1): G1 sprocket, G2 Partner Alley (slot-list, not hardcoded — extensibility note in `04`), G3 ghost sprocket, G4 Founders' Line, G5 "UNBOUND", G6 anamorph (prototype the resolving camera pose before committing — `04` flags this as the one glyph with real risk), G7 NECCO reveal, G8 spreadsheet, G9 food court, G10 canal flywheel, G11 edge-band remainder. | `js/voxelscene-cambridge.js` | P6.2, P6.9, P7.1 | M |
| P7.4 | The egg catalogue (`04` §2, E1–E44), authored per district as that district lands — see parallelization note. | `js/voxelscene-cambridge.js` | per-egg district task in P6.* | L |
| P7.5 | Achievement rows 59–96 (`04` §3.3) added as `achievement_defs` content, per `06` §7's data model. **Blocked on the same online-Flywheel backend prerequisites `STATUS.md` already tracks** (Supabase credential handover, plan choice) — this is not a new blocker, it is inheriting one that exists regardless of Cambridge. | content table (`03-technical-design.md`'s schema, online-Flywheel) | P7.1, online-Flywheel backend | M |
| P7.6 | "The Deep Cut" belt (`04` §3.5) taken to the belt-roster owner as a yes/no — an all-cities, UNBOUND-scoped belt over `discoveries` count, legal under `06`'s validator rule, not decided by this package. Achievement 95 ships either way at zero roster cost as the fallback. | decision only | P7.1 | XS |
| P7.7 | Cambridge added as a fifth Sprint Strap scope (`06` §2.2/§3) — one row, no design. Live UNBOUND belt count moves from 12 to 13. | content table, online-Flywheel | P6.* complete | XS |

**Gate:** discovery-bit coverage probe passes; achievement 95 ships regardless
of P7.6's outcome; `06`'s validator rule (no two belts at one scope share a
metric-and-direction) re-checked after P7.7.

---

## Phase 8 — Full validator sign-off and doc hygiene

| ID | Done when | Files / surfaces | Deps | Size |
|---|---|---|---|---|
| P8.1 | Full shared 19-probe contract plus the four new probes (P3.2–P3.5) pass against the complete scene, Cambridge's own tables supplied (`CAMBRIDGE_OFFSETS`, `CAMBRIDGE_DISTRICTS`, `CAMBRIDGE_COIN_ANCHORS`, `CAMBRIDGE_VEHICLES`, `CAMBRIDGE_ROAD_SPANS`, `CAMBRIDGE_STREETS`/`CROSSINGS`). | `tools/validate.mjs`, `js/voxelscene-cambridge.js` | P6.*, P7.* | S |
| P8.2 | The scripted excursion (Davenport long axis + First Street, `03` §9.5) passes: determinism across two runs, `eatenCount ≥ 300`, `size ≥ 4`. If eats fall short of 300 on the vocabulary-built district, the fix is content, not a lowered floor (`03` §9.5's own instruction). | `tools/validate.mjs` | P6.4/P5.5 | S |
| P8.3 | Dead-ground census at zero, checked cell-by-cell (not the 4 m sampled probe). | `tools/validate.mjs` | P6.* | S |
| P8.4 | Doc hygiene, same commit as the last code change: `.wiki/modules/voxel.md` gains `js/voxelforms.js` and `js/voxelscene-cambridge.js` in `covers:` and a Cambridge Scenes entry; `AGENTS.md`'s validate-required file list gains both; `STATUS.md` gets one line; ADR-0013 moves `proposed` → `accepted` if not already done at P0.1. | `.wiki/modules/voxel.md`, `AGENTS.md`, `STATUS.md`, ADR-0013 | P8.1 | S |
| P8.5 | The 12-fixed-pose apparent-richness capture (`01` §7.3): Sobel edge density, distinct roofline heights per 10 m of frontage, mean luminance, visible-piece count, compared A vs. B2 from Phase 5. Owner reviews both variants behind the free-play picker — this is the one gate whose pass/fail is a judgement call, not a number. | screenshots + measurement notes | P8.1 | M |

**Gate:** `node tools/validate.mjs` → `ALL PASS`. Both of `01` §8's open
owner questions (bite size, crumble-vs-collapse) are answered by playing, not
blocking — they tune bay size, they do not gate ship.

---

## Critical path

P0.1 (ADR-0013 accepted) → P2.1 → P2.2 → P2.4 → P2.1–P2.7 complete → P3.1
(voxelforms exists) → P3.2–P3.4 (gate probes exist) → P5.1–P5.6 (District 2
proves the vocabulary and ships as the first real district) → P6.1 (map
scaffolding) → P6.2 (hero district) → P6.3, P6.5–P6.9 (remaining districts,
order among these is flexible) → P6.10–P6.11 (glue + blockers) → P7.1–P7.2
(registry fields) → P7.3–P7.4 (hidden content) → P8.1–P8.5 (sign-off).

**The single longest pole is Phase 2** (the engine change) — it is the widest
change the sandbox has taken since ADR-0006, gated on a decision (P0.1) this
package cannot make, and its riskiest task (P2.4, the span-hop rewrite) sits
in the hottest loop in the sim. Everything else in the critical path is
authoring effort, which scales with people; P2 does not.

## Parallelizable work

- **P1.* runs the entire time, independent of everything else.** It has no
  downstream dependents inside this package except P5.4/P5.6/P8's measurement
  tasks, which need the tool (P1.1) but not the bucket-key change itself.
- **P3.* and P4.* are independent of each other** and can run side by side
  once P2 lands.
- **Districts in P6.3, P6.5–P6.9 have no dependency on one another**, only on
  P6.1 (scaffolding). With enough authors, six districts can be in progress
  at once.
- **P7.4 (the egg catalogue) parallelizes with P6.3–P6.9 directly**: each
  egg in `04` §2 is scoped to one district, so an author finishing a district
  can immediately author that district's eggs rather than waiting for Phase 7
  to formally start. The only hard sequencing is P7.1 (the `discoveries`
  field) needs to exist before any egg's discovery bit can be wired up — land
  P7.1 early, against whichever district finishes first, not last.
- **P7.5 and P7.7 (achievement/belt content rows) are blocked on the
  online-Flywheel backend**, not on any Cambridge task — they can be written
  and reviewed as content whenever, but cannot ship live until that package's
  own Supabase/Vercel prerequisites (`STATUS.md`) clear. This does not block
  Cambridge itself: the level is playable and its goal is completable without
  a single achievement or belt wired up.
- **P6.2's signage sub-task is the one item truly waiting on someone outside
  this package** (a photo, an email) — everything else in P6.2 proceeds on
  the conservative default and is a one-line edit away from correction.

## Related

- `README.md` — the package index
- `00-objective-overview.md` — why this level exists, the pens and erasers,
  the three-commit sequencing this task list follows
- `01-voxel-primitive-vocabulary.md` — the toolkit, the cost model, the
  measurement plan (§7) this page's Phase 5 and P8.5 execute
- `02-cambridge-reference.md` — the facts, and the two items P6.2 is blocked
  on
- `03-level-design.md` — the map, the districts, the density floors, the
  validator compliance section this page turns into tasks
- `04-easter-eggs-and-achievements.md` — the hidden-content catalogue Phase 7
  builds
- `../online-flywheel/06-belts-and-achievements.md` — the belt/achievement
  system Phase 7 extends, and the backend prerequisite it inherits
- `../../adr/0013-anisotropic-voxel-primitives.md` — the decision gating
  Phase 2
- `../../adr/0006-structural-zone-simulation.md` — the support BFS and
  determinism proof Phase 2 must preserve
- `../../adr/0003-deterministic-seeded-generation.md` — the RNG-sequence
  invariant Phase 4 must preserve
