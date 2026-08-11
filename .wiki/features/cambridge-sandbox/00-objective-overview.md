---
covers:
  - "js/voxelscene-*.js"
  - "js/voxelkit.js"
  - "js/voxelsim.js"
---
# Cambridge sandbox — objective overview

**Status:** the spine, and the map is built. ADR-0013's engine change, the
primitive layer (`js/voxelforms.js`), the coin-anchor and chain changes, the new
validator probes, all ten districts and the scene's registration are committed:
Cambridge is complete, playable from the free-play picker and `ALL PASS` on
`node tools/validate.mjs`. Phase 7's hidden content, glyphs and achievements and
the Phase 8 sign-off are still ahead; Phase 7's achievement rows remain blocked
on the online-Flywheel backend, which is an inherited blocker rather than a new
one. `js/voxelkit.js` gained twelve more gallery builders on 2026-08-10 (delivery
truck, school bus, billboard and the rest — see `modules/voxel.md`); they have no
callers yet and Cambridge does not use them, so nothing here changed. Later the
same day `js/voxelsim.js` gained the multi-hole roster (`sim.holes[]`, see
`architecture.md`) — a back-compat-preserving refactor that leaves every
single-player scene, Cambridge included, bit-identical — and a seventh,
unrelated scene file (`js/voxelscene-chicago.js`, a different in-progress
session's work, not registered in any menu) landed and matches this page's
`js/voxelscene-*.js` cover glob incidentally. Neither touches Cambridge.
**Date:** 2026-08-06 (reconciled 2026-08-10, twice).
**Reads with:** `01-voxel-primitive-vocabulary.md` (the toolkit),
`02-cambridge-reference.md` (the facts), `03-level-design.md` (the design),
`05-build-tasks.md` (the ordered work and its live state),
`adr/0013-anisotropic-voxel-primitives.md` (the decision).

This page exists to answer the question the other four do not: **why are we
doing this, what does it set up, and what does it close off.** It is the
20-moves-ahead document. If a later reader wants to know whether a choice in
`03` was a considered trade or an accident, the reasoning is here.

---

## 1. What this level actually serves

Three things at once, and they are not equally negotiable.

### 1.1 It is a gift to a specific room of people

This is not "a Boston level." It is the neighbourhood a few hundred HubSpot
employees walk through every morning, shown to them at their own conference. The
audience's relationship to the content is unlike any other scene in the game:
they are not evaluating a city, they are checking whether we got *their* block
right.

That inverts the usual accuracy calculus. In Brooklyn, a wrong cornice costs
nothing because nobody is holding a photograph. Here, the cost of a confident
guess is higher than the cost of an admitted blank — which is why `02` marks
every claim Confirmed / Likely / Unverified, and why an Unverified item does not
get hardened into a spec in `03`. The single most likely way to lose the room is
to put the sprocket on 1 Canal Park, which HubSpot *left* in 2021 and which is a
life-science building now. `03` carries a validator probe (`probeHeroIdentity`)
whose only job is to catch that mistake.

The corollary is that **delight is cheap here and errors are expensive.** A tofu
factory that is genuinely there, a Portuguese fish market, a police car on the
Great Dome, the Green Line's curved elevated platform one block north — each of
those costs a few hundred blocks and buys a laugh from someone who has walked
past it a thousand times. That asymmetry is the whole argument for spending the
research budget the way `02` spent it.

### 1.2 It is the debut vehicle for a new authoring vocabulary

`STATUS.md` carried the owner's construction-vocabulary request as an open
decision, unstarted, for weeks: not bigger buildings, but *per-building
construction vocabulary* — a floor as one solid piece, a pillar as a solid
pillar, different sized bricks and blocks and shapes, whatever best represents a
thing. ADR-0013 is the decision that answered it and `01` is the audit that made
the decision safe to take; the board entry is retired now that both have shipped.

A new primitive needs a scene **designed for it**, not a scene retrofitted to
it. Cambridge is that scene, and the fit is not coincidental: `02` independently
identified the Davenport's long brick mill walls and the Stata Center's small
number of bold tilted masses as the two best voxel targets in the region, for
exactly the reason `01` argues for the vocabulary. The research and the
capability audit point at the same buildings without having been told to.

### 1.3 It is a scene whose recognizability is the point

Every other sandbox is a *place-flavoured playground* — Coney Island is fun
whether or not you know Coney Island. Cambridge is a **portrait**. Its success
condition is that someone says "that's my building" before they say "this is
fun". That reorders the design priorities: silhouette fidelity and local texture
outrank spectacle, the two hero buildings get a disproportionate share of the
budget, and a landmark that cannot be placed honestly is left out rather than
approximated.

### 1.4 What it is *not*

It is not a Boston level. `02` is explicit that Fenway, the Freedom Trail,
Harvard Yard and the Financial District towers are the "generic Boston" move
this scene is trying not to make, and that Kendall/MIT is a fifteen-minute walk,
not the local stop. The local stop is Lechmere, on the Green Line, 127 m north.
Getting *that* right is worth more than the whole downtown skyline.

---

## 2. The two deliverables, and whether they can be decoupled

**Cambridge ships two things:** a level, and the anisotropic-primitive
capability the level is authored with. They arrive in the same release. The
honest question is whether they *must*.

**In principle, no — each could ship without the other.**

- The vocabulary could debut on a retrofit of an existing scene. ADR-0013 keeps
  every shipped scene byte-identical, so `voxelforms.js` could land, prove
  itself against a re-authored Fort Point, and Cambridge could follow later.
- Cambridge could be authored brick-wise at Boston's grain. ADR-0013 lists that
  as an alternative and rejects it — but on *product* grounds (it refuses a
  standing request), not on feasibility. A brick-built Cambridge is buildable
  today with no engine change at all.

**In practice they should ship together, and the reason is measurement, not
sentiment.** `01` §7's whole case rests on comparing a brick-built district
against a vocabulary-built district *of the same plan at the same budget*
(experiment E1/E2). That comparison only exists if a scene is designed for the
vocabulary from the plan up. A retrofit gives you B1 — the same silhouette,
fewer blocks — which `01` explicitly names as the *uninteresting* half of the
result. Only a scene planned around the primitive produces B2, and B2 is the
deliverable.

Two other bindings, weaker but real: the Davenport's seven-section mill range
and the Stata Center's tilted masses do not fit anywhere near `03`'s district
estimates at Boston's grain, and the vocabulary's authoring gotchas (a plate
needs a column *under* it, not beside it) are the kind of thing that is learned
by authoring a whole scene, not a corner of one.

**So: shipped together, sequenced apart.** Three commits, in this order, each
with its own before/after so no measurement is confounded. Steps 1 and 2 have
since landed; step 3 is the work in progress:

1. **The bucket-key change** (`01` §2.3, ADR-0013's "independent adjacent win").
   Drop `b.s` from the render bucket key for *unsurfaced* blocks. Independent of
   everything else, measurable on today's tree, likely *reduces* draw calls, and
   makes an arbitrarily rich size vocabulary cost zero extra calls. It removes
   the last standing objection to the vocabulary and it should land first
   precisely so its win is not credited to the vocabulary.
2. **ADR-0013 + `js/voxelforms.js`.** Per-axis extents through the sim, the
   renderer and the validator; the twelve primitives; the three new shared
   probes. The acceptance condition is that all five existing scenes come out
   byte-identical, shown the way ADR-0006 was shown — validator plus a per-step
   state digest across the existing scripted excursions — rather than asserted.
3. **Cambridge.**

The value of that order is that **if Cambridge slips, nothing is stranded.**
Steps 1 and 2 are shippable improvements to a game that already exists. Only
step 3 is exposure to a conference date.

---

## 3. Where this goes — twenty moves ahead

### 3.1 What the vocabulary unlocks for future scenes

The primitive change is not a Cambridge feature. It is a **permanent widening of
what a scene can afford**, and the doors it opens are worth naming now so that
`03`'s choices are made with them in view.

- **Interiors become affordable.** Today an interior is unthinkable: a room is a
  hollow shell whose walls cost as much as the building. A `panel` wall and a
  `slab` floor make a lobby, an atrium or a concourse a few dozen pieces. 2
  Canal Park's glass entry court in `03` is the first one; it is also a
  proof-of-concept for every station concourse, mall interior and stadium bowl
  after it.
- **Long horizontal infrastructure stops being ruinous.** A viaduct, a pier, a
  jetway, a conveyor gantry, a bridge deck: all of them are `beam` + `slab` +
  `pier` runs, and all of them currently cost a cube per 0.25 m of length. The
  Green Line viaduct in `03` costs roughly a tenth of what its Brooklyn
  equivalent did.
- **Stepped approximations get materially cheaper** — a gable becomes a short
  stack of long thin slabs instead of a field of cubes. ADR-0013 already banks
  this. It means the curved and tilted forms the shipped scenes fake
  (`spiralRotunda`, `halfDomeShell`, `stoneArch`, the BCEC vault) all get better
  at no extra cost, and it is why the Stata Center is finally buildable.
- **Signage and marks become one-piece objects.** A letter stroke is a `panel`.
  This is what makes the edge-band gallery in `03` affordable, and it is a
  general capability: every scene can carry ground-plane graphics for the cost
  of a park bench.
- **The detail budget rises everywhere, permanently.** This is the real
  compounding effect and it is easy to miss. The savings are not a one-time
  Cambridge dividend; every scene authored afterwards buys more scene per block,
  forever.

### 3.2 Should existing scenes be retrofitted?

No — leave all five alone. Three independent reasons, in descending strength:

1. **Byte-identical is the acceptance condition.** ADR-0013 passes only if the
   shipped scenes do not move. A retrofit *is* the scenes moving, and it would
   have to happen after the proof rather than during it — at which point the
   proof no longer covers the tree anyone is running.
2. **The retrofit destroys the control.** `01` §7's E1 needs a competently
   brick-built comparison to exist. Boston, Brooklyn and the two Manhattans
   *are* the corpus of brick-built work. Converting them removes the baseline
   that makes any future claim about the vocabulary checkable.
3. **The scenes are shipped, validated and unbroken.** They pass a 19-probe
   contract. Rewriting working, validated, non-defective content to use a newer
   primitive is the definition of a change with cost and no product.

**The one candidate worth surfacing** (a pen, not an eraser — see §4): Boston's
Fort Point brick warehouse grid is the closest existing analogue to the
Davenport, and it would benefit most obviously. If anyone ever wants a
second data point for E2, that district is where to get it — as its own
change, with its own before/after, long after Cambridge has shipped.

### 3.3 What it forecloses

Stated plainly, because a decision whose costs are unstated is a decision nobody
can revisit.

- **True non-box geometry is off the table for good.** ADR-0013's Tier 3 refusal
  is not "later" — it is structural. The sim's only geometric operation is AABB
  separation, so any rendered wedge or cylinder would be *climbed* as a box.
  Every curve in this game is now permanently a stepped approximation. That is
  the aesthetic ceiling and we are choosing it deliberately.
- **The brick-by-brick tactile read gets weaker in new content.** The owner has
  accepted this explicitly and calls it the point. Worth saying anyway: the
  mortar course is proportional per face, so a very large plain plate reads as
  *one enormous brick*. `01` §4.3 clause 4 is the guard, and if a Cambridge
  district ever reads flat, this is the first thing to look at.
- **Collapses read differently.** `CHUNK_MIN = 3` means a building whose every
  floor is one piece almost never forms a rigid chunk, so it loses the "a whole
  corner came off as one body" read and the `crash` event that drives the audio
  and shake juice. `03` handles it in authoring (bays, not floors) rather than
  by touching the constant — but the *feel* of a consolidated collapse is
  genuinely different, and it is one of the two questions `01` §8 leaves for the
  owner to answer by playing.
- **Two adjacent large pieces cannot support one another.** A 4 m→4 m hop costs
  4 m against concrete's 3 m `maxSpan`, and at grade the cap is 1 m. Every scene
  authored from here on has to know that consolidation *strengthens* vertical
  load paths and *removes* horizontal ones. This is a permanent new rule in the
  authoring model, not a Cambridge quirk.

---

## 4. The cheap future-proofing, and the pens

Per the pencil test: build the eraser and the sharpener silently; leave a clean
seam toward the pen and surface it.

### 4.1 Baked in (erasers — build these, they complete the thing)

| Thing | Why it is a completer, not an expansion |
|---|---|
| **`js/voxelforms.js` as a layer *below* `js/voxelkit.js`** | The primitives are the pencil; putting them in a shared 2,771-line kit is the failure `STATUS.md` is already tracking. A separate small file that never imports the kit is what stops it accreting. |
| **The graduation rule, written in both file headers** | *A composite moves into `voxelkit.js` only when a second scene calls it.* One caller is not a kit. Costs one comment; prevents the exact drift the board is watching. |
| **Three new shared validator probes** (grade diagonal ≤ 8 m; placement step = extent per axis; per-district mean inter-piece gap < 15 m) | The grain rule and hand 2 are useless as prose. They go in the shared contract because that is where every other scene contract already lives. |
| **The scale law and the real-offset table exported from the scene file** | `02` asks for it directly: the offsets are the only thing that will let anyone check the layout later. Exporting them as data (rather than baking them into literals) makes the layout re-derivable and lets a probe assert it. |
| **Districts declared as named data, not comments** | The density probe has to iterate districts. Declaring them as a table costs nothing and turns "the warehouse quarter is a combo dead zone" from a feeling into a failing test. |
| **Signage behind one switchable constant** | `02` flags HubSpot's real exterior signage as Unverified. One `HERO_SIGNAGE` constant with a placement switch means the correction after someone takes a photo is a one-line edit, not a re-author. |
| **`sceneAmbient` extended, never special-cased** | New ambient kinds (Duck Boats, geese, Green Line trains) go through the existing render-only ambient path. |
| **`sim.coinAnchors` — scene-declared coin locations** | Coins are a seeded scatter over `boundsRect` today (`voxelsim.js:324-338`). `04`'s coin-placement design — the bridging, egg-beacon and vertical allocations in its §4.3 table — presupposes an author can say where a coin goes, and a uniform scatter cannot express any of it; eighteen of the sixty coins are allocated specifically to bridge this package's own ≤15 m density rule, placed by measurement against the scripted-excursion probe. Existing scenes are unaffected: a scene that declares no anchors keeps today's scatter exactly as it runs now, and the RNG draw holds its position in the seed sequence for those scenes so their coin layout does not re-roll (ADR-0003's determinism invariant). See `03` §8.1 and `04` §4.1. |

### 4.2 Surfaced, not built (pens — for the owner to decide, later, separately)

| Pen | What it would buy | Why it is not in scope now |
|---|---|---|
| **Mass-denominated combo economy** | A combo ladder invariant to authoring grain, forever, rather than "we counted and it came out fine this time." | ADR-0013 demotes it from prerequisite to safeguard because the density probe, not the block total, is what actually guards the play experience — and the districts built so far earn combos comfortably. Bundling it would confound its own before/after. It becomes a prerequisite again the moment a district fails the 15 m probe. |
| **A backdrop silhouette plane** | `02` wants the Boston skyline on the southeast horizon as non-buildable low-detail silhouette. Would also retire the Citgo-sign question. | It is a renderer feature, not a scene feature, and no scene has one. Cambridge ships without a backdrop; the horizon is the landmark shelf. |
| **Per-axis surface UV repeat** | `uv: 'metre'` surfaces tile uniformly; a 4 × 0.25 plate wants different repeats on its top and its edge. | Only bites if Cambridge declares a metre-tiled surface on a non-cubic piece. `03` declares none. Revisit if it does. |
| **Retrofitting Boston's Fort Point** | A second E2 data point on the closest analogue to the Davenport. | See §3.2. Long after Cambridge ships, as its own change. |
| **A golden-hour / Cambridgehenge lighting preset** | `02` §5.2 makes a strong case that the late-afternoon light is the one to ship, and the ~10° grid rotation gives a real equinox alignment straight down the cross streets. | Lighting is global today, and `STATUS.md`'s sun-elevation decision is already open and unanswered. Do not open a second front on the same dial. |
| **A per-scene "what did I miss?" collectible summary** | The easter-egg catalogue in `04` is worth surfacing to the player somewhere. | Belongs with the achievements work in `.wiki/features/online-flywheel/`, not here. |

---

## 5. How we will know it worked

Three gates, in increasing order of authority.

1. **The contract holds.** `node tools/validate.mjs` prints `ALL PASS`, all five
   existing scenes byte-identical, Cambridge signs the full 19-probe contract
   plus the three new ones, dead ground at zero (Boston's standard, cell-by-cell
   — not the 4 m sampled probe, which can walk past an 8 m bare stripe).
2. **The numbers say "more scene per block."** `01` §7.2's targets: distinct
   identifiable objects up by ≥ 50% over a fair brick-built control, eatable
   pieces per m² not below the control's, mean inter-piece gap under 15 m in
   every district, combo levels earned within 10%.

   On the block total: we would like the finished scene to come in **under
   75,000 blocks**. That is a ceiling to stay beneath, not a number to hit —
   under is good, well under is better, and there is no exact figure we are
   shooting for. The level is driven by geometric aesthetics, not by arithmetic;
   working backwards from a pre-calculated total produces a mess. If the scene
   or a district runs over, that is the cue to look at which buildings could be
   built more efficiently, not a reason to thin the map out. `03` §4's
   per-district numbers are starting estimates to author against; the four
   districts built so far landed at 67–71% of theirs, which is a good outcome.

   The reason a lower count is safe is that nothing we care about is measured in
   blocks. The property we actually want — no part of the map reading as empty —
   is enforced directly by `probeDistrictDensity` in `tools/validate.mjs`, which
   measures eatable pieces per m² and inter-piece gap per district with coins
   excluded. The validator has no block-budget check at all, and does not need
   one.
3. **Someone who works in the building recognises it before they are told what
   it is.** No instrument measures this and none should. Ship it behind the
   free-play picker and put it in front of them.

## Related

- `README.md` — the package index
- `01-voxel-primitive-vocabulary.md` — the toolkit and its constraints
- `02-cambridge-reference.md` — the facts, with confidence markers
- `03-level-design.md` — the design
- `04-easter-eggs-and-achievements.md` — the hidden things
- `05-build-tasks.md` — the ordered work
- `../../adr/0013-anisotropic-voxel-primitives.md` — the decision
- `../../adr/0006-structural-zone-simulation.md` — the support BFS and the
  determinism proof this must preserve
- `../../modules/voxel.md` — the shipped model and the scene-building rules
- `../../../STATUS.md` — the construction-vocabulary decision (since retired
  from the board), the shared-kit warning, the measurement precondition
