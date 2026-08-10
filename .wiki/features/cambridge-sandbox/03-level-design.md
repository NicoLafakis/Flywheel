---
covers:
  - "js/voxelscene-*.js"
  - "js/voxelkit.js"
  - "js/voxelsim.js"
  - "tools/validate.mjs"
---
# Cambridge sandbox — the level design

**Status:** the build spec, and built. ADR-0013's engine change, the primitive
layer (`js/voxelforms.js`), the coin-anchor and chain changes, the new validator
probes, all ten districts and the scene's registration are committed; the map is
complete and playable from the free-play picker, `node tools/validate.mjs`
reaches `ALL PASS`, and the scene lands at 72,943 blocks against the under-75,000
target with the dead-ground census at zero. Phase 7's hidden content, glyphs and
achievements and the Phase 8 sign-off are still ahead. Where this page describes
what was built, it has been reconciled against the built tree; where it describes
what a later phase will do, it still reads as the plan it was written as.
**Date:** 2026-08-06.
**Toolkit:** `01-voxel-primitive-vocabulary.md`. **Facts:**
`02-cambridge-reference.md`. **Decision:** `adr/0013-anisotropic-voxel-primitives.md`.
**Hidden things:** `04-easter-eggs-and-achievements.md` (separately owned — this
page reserves slots and states the placement principle; it does not catalogue).

Every real-world claim on this page traces to `02` and carries `02`'s confidence
marker. Where `02` says Unverified, this page says Unverified and designs a seam
rather than a spec. Where `02` records a conflict, both numbers appear. Numbers
that are *design choices* — bay sizes, block estimates, piece counts, scene
coordinates — are marked as such, and each one is re-derivable from the rules
stated here, so an author who disagrees with a number can recompute it rather
than guess at it.

---

## 1. Map extent and centering

### 1.1 The map

| | |
|---|---|
| **Scene id** | `cambridge` |
| **Origin** | 2 Canal Park's authored centre, placed at scene **(0, −14)** |
| **Axes** | `x` = grid-east, `z` = grid-south, north = `−z` — the same convention as every other scene |
| **`sim.boundsRect`** | `{ minX: −120, maxX: 132, minZ: −112, maxZ: 116 }` |
| **`sim.bounds`** | `132` (scalar fallback; `boundsRect` overrides it, as in Brooklyn and Boston) |
| **Playable extent** | **252 × 228 m**, area **57,456 m²**, diagonal **340 m** |
| **Block-count target** | Come in under **75,000** (§4). At the map's 57,456 m² that works out to roughly 1.3 blocks/m² — a description of where we expect to land, not a figure to author toward |
| **Goal** | `{ name: 'SWALLOW THE SPROCKET', targetFraction: 0.5 }` (same 50% as every other scene) |
| **Spawn** | fixed by the sim at `(0, 16)` — see §1.4 |

The rect is deliberately asymmetric, following the precedent set by Lower
Manhattan's `x[-70,74] z[-84,54]` and Brooklyn's `x[-78,66] z[-116,108]`: the
real content is not centred on the hero building, so a square clamp would leave
dead driving space on two sides and clip the Zakim off the third. It is 38%
larger than Boston's 192 × 216 m map, which is the largest authored footprint to
date, and its 340 m diagonal is 14% longer than Upper Manhattan's 297 m — about
13 s of driving at SIZE 12's 26.12 m/s, inside the "single digits to low teens"
band `.wiki/modules/voxel.md` sets for traversal.

### 1.2 The scale law — two rings, one rule each, both recorded

`02` §6 is blunt about the problem: everything in Tier 1 fits inside a ~1.8 km
real radius, Lower Manhattan is 124 × 118 m, and *"a literal 1:1 Cambridge at
that density is not on the table."* It is just as clear about what follows from
that: whatever compression we choose, we record it in the scene file, because the
offset table is the only thing that lets anyone check the layout later.

A single uniform factor cannot serve both halves of this scene. At 1:12 —
enough to fit MIT — the hero building becomes a 8.7 × 5.9 m shed, and the
audience test fails at the first glance. At 1:3 the hero reads correctly and
nothing beyond CambridgeSide exists. So the scene uses **two rings with an
explicit, recorded discontinuity**, which is the same move Boston made with its
three declared scale exceptions, generalised and named.

> **Ring A — the core.** Real radius ≤ **340 m** from 2 Canal Park.
> **1:3 in plan, 1:1.5 in height.** True positions in grid axes. Four places
> depart from this, and §1.5 names them.
>
> **Ring B — the shelf.** Real radius > 340 m. **Bearing is preserved exactly**
> (in grid axes); **radius is compressed** by
> `scene_r = 113 + (real_r − 340) / 41.9`, so real 340 m → scene 113 m and real
> 2,054 m (the furthest thing on the map, the NECCO tower) → scene 154 m.
> Footprints and heights stay on Ring A's 1:3 / 1:1.5 unless a per-landmark
> exception is declared in §5.

The discontinuity at r = 340 is real and it is the honest cost. It means the
walk from the Museum of Science to the Longfellow, which is 700 m in life, is
10 m in the scene. §5.4 states what that costs in credibility and why it is
still the right trade.

**The two rings disagree by 0.33 m at the seam, permanently.** At real r = 340
Ring A gives 113.333 and Ring B gives 113.000, so scene radius is briefly
non-monotonic across real r ∈ (339, 340] against (340, 354]. No landmark falls in
that window — the closest is the Third Congregational Church at 336.9 m real,
3.1 m of margin — but a future one could, and an author who meets it should know
it is the law rather than an error. Everything else about the Ring B branch
checks out against §5.4: worst radius error 0.109 m, inside the 0.25 m
quantisation step, and worst bearing error 0.056°.

**One plan compression is declared for a group rather than a landmark: the MIT
shelf runs at 1:5 in plan, not 1:3.** Six landmarks whose real radii spread over
1,000 m — the Great Dome at 1,706, Killian Court at 1,778, the Green Building at
1,530, Stata at 1,519, Kendall/MIT at 1,156, the NECCO tower at 2,054 — all
arrive inside one 50 × 25 m patch once Ring B has compressed the radius, and at
1:3 the Great Dome's range alone is 40 × 13 m of it. The height law is untouched
at 1:1.5, so the group keeps its silhouette and only its plan tightens. It sits
alongside §1.5's Museum of Science 1:5 as the second declared plan exception, and
it is a scale rule rather than a re-seating: no bearing moves.

**Why this law and not a smooth one.** A continuous log compression avoids the
seam but makes every position un-recomputable by hand and un-checkable by eye —
and `02`'s whole point is that the layout must stay checkable. Two rings with
two arithmetic rules can be recomputed on paper by anyone holding `02` §6's
table. That is worth a seam.

**Grid-axis conversion, stated once.** `02` gives offsets in true-north metres;
the scene's axes are the East Cambridge grid, 9.8° clockwise of true north
(§2). So for a feature at true offsets `(E, N)`:

```
E' = E·cos(9.8°) − N·sin(9.8°)        grid-east component
N' = N·cos(9.8°) + E·sin(9.8°)        grid-north component
scene_x =  E' / scale
scene_z = −N' / scale  −  14          (the −14 seats 2 Canal Park; see §1.4)
```

All scene coordinates in this document were produced by that formula and are
**design-time values**: the scene file computes them from an exported
`CAMBRIDGE_OFFSETS` table rather than hardcoding them, so a corrected real
offset re-derives the layout instead of requiring a re-author.

### 1.3 What is in and what is out

Derived by running §1.2 over `02` §6's 25-row table.

**In, at Ring A (true position, 1:3 plan):** 2 Canal Park · The Davenport ·
1 Canal Park · Lechmere station and its viaduct · the Lechmere Canal and its
basin · 10 Canal Park · 40 Thorndike · the First Street Garage · the Middlesex
South Registry of Deeds · the old Middlesex County Courthouse · the Glass
Factory · Sierra · Thomas Graves Landing · Archstone Northpoint · AVA East and
West · Avalon North Point Lofts · Tango · the Third Congregational Church ·
Centanni Park · the Athenæum Press.

**In, at Ring B (true bearing, compressed radius):** CambridgeSide · the Royal
Sonesta · 55 Cambridge Parkway · the Museum of Science and its garage · the
Charles River Dam and its two lock gatehouses · North Point Park · the
Longfellow Bridge · the Zakim · TD Garden · the Bunker Hill Monument · the Stata
Center · the MIT Green Building · the Great Dome and Killian Court ·
Kendall/MIT · the NECCO water tower · Twenty|20 at Cambridge Crossing · Hult
House · Education First · the East Cambridge Savings Bank · the Green Line
carhouse and the Inner Belt yard · Rivercourt · the Lofts at Kendall Square ·
Costa Lopez, Silva and Timothy J. Toomey parks · the Chang Shing Tofu Factory ·
American Twine.

Those last five sit in Ring B because §1.2's own seam puts them there: their real
radii are 402.0, 418.2, 541.4, 494.1 and 473.9 m, every one past 340. It is worth
saying which way the difference cuts, because the two rings do not merely seat
them differently — Ring A would put Silva Park at (−139.5, −12.25), 24.8 m from
its Ring B seat and 19.5 m outside `maxX`, and the other four at deltas of 19.5,
41.8, 48.1 and 62.6 m. `sceneOffset` implements §1.2 and returns the Ring B seats,
which is what is built.

**Out, and why:**

| Left out | Reason |
|---|---|
| **The Citgo sign** | `02` marks both its position **and its visibility from East Cambridge** as Unverified, and explicitly says not to place it as a "you can see it from the office" beat without checking. There is no backdrop plane to demote it to (see `00` §4.2), so it is simply absent. |
| **The Boston skyline proper** | `02` puts it 3–5 km out and assigns it to a backdrop plane the engine does not have. Absent rather than faked. |
| **Boston Sand & Gravel** | `02` could not geocode it. An unplaceable landmark cannot be placed. |
| **Fenway, the Freedom Trail, Harvard** | `02` names these as the "generic Boston" move this scene exists not to make. |
| **Named third-party wordmarks** (Novartis, Biogen, EF, Sonos, IBM/Lotus, the CambridgeSide tenants) | `02` §7: build the buildings, skip the wordmarks. Massing is what makes them recognizable, and a blank sign band reads as "a sign" at voxel resolution. |
| **Named local retail** (Casa Portugal, Courthouse Seafood, New Deal, the Druid, Dunkin') | `02` §7: evoke, do not name. `04` owns how. |

### 1.4 The edge, and why 2 Canal Park sits at (0, −14)

**Spawn is not a scene decision.** `voxelsim.js:164` hardcodes the hole at
`(0, 16)` for every scene. So the map is seated around the spawn point, not the
other way round: 2 Canal Park's authored centre goes at **(0, −14)** so that its
south facade lands at z ≈ +3.75 and the spawn disc sits **12 m clear** of the
building on the canal-side forecourt. That is comfortably outside the 1.7 m
SIZE-scaled hanging threshold (`.wiki/modules/voxel.md` scene rule 8) and
outside the 4 m clear disc Brooklyn established as the READY-gate convention.

**Edge handling** follows the two mechanisms the shipped scenes already use, and
adds nothing new:

- **`boundsRect` hugs content within the 12 m slack** the shared probe enforces.
  That is what forces the north edge to carry the Green Line carhouse and the
  Inner Belt yard (§4.11) rather than trailing off, and it is why the Zakim sits
  at x ≈ 131 against a `maxX` of 132.
- **`CAMBRIDGE_OPEN_GROUND`** — positional, named, reasoned declarations of
  ground that is empty *on purpose*, exactly as `BROOKLYN_OPEN_GROUND` is. The
  validator checks each one is genuinely block-free and edge-touching; "the edge
  of the map trails off" is the rationale that has held up in the shipped scenes,
  and it is the one we lean on here. **There is one: the Inner Belt yard's
  ballast**, and it is the only span this mechanism alone could ever have done
  work for. The three that were sketched alongside it are each better served
  another way. The canal basin's water is authored rather than promised —
  building the water is strictly better than declaring the ground empty, and it
  is the same reason District 10 laid a `sand` mudflat on the north edge instead
  of declaring the flat bare. The Zakim's channel sits under its own bridge deck,
  and the probe's emptiness check is 2D, so nothing there can read empty. The
  Charles is water that is built. A declaration is a promise; a built thing is a
  thing, and where both are available the built thing wins.
- **`sceneDecor.water` carries the Charles and the canal**, so the south and
  southeast edges terminate in water rather than in a cut. The far bank is *not*
  built: Boston is a landmark shelf here, not a shore.
- **The edge-band gallery (§8.3)** occupies the outer ground that would
  otherwise be the emptiest on the map. This is not decoration bolted on
  — it is the answer to the dead-ground census at the edges, and it is the
  answer to the owner's "familiar symbols and logos near the edges."

### 1.5 Declared Ring A exceptions

Six, in Boston's tradition of declaring rather than hiding them. Four were
declared when this page was written; two more were derived from the built tree
and belong here rather than in a scene-file comment, because an undeclared
hand-placement is exactly what this section exists to prevent.

1. **2 Canal Park's and 1 Canal Park's OSM bounding boxes overlap** (104 × 71 at
   offset 0 versus 56 × 67 at offset −40 E). A bbox over-estimates a
   non-rectangular plan, which `02` §6 flags in its method note. The scene
   authors 2 Canal Park with a **corrected footprint of 84 × 62 m real**
   (28 × 20.5 m scene) and seats 1 Canal Park so its east face stands **18 m
   real** west of the hero's west face. Marked **Likely, adjusted** — the true
   plan shapes are not established.
2. **The Lechmere Canal channel.** `02` confirms the basin's centroid at
   E +137 / N −170 *and* confirms that 2 Canal Park "fronts the historic
   Lechmere Canal on the east side." Those are only compatible if the channel
   runs northwest from the basin to the building. The scene authors a **channel
   plus a basin**: basin at the confirmed centroid, channel extent **inferred**
   and marked as such.
3. **The Museum of Science is compressed to 1:5 in plan**, not 1:3. `02`
   estimates it at ~250 m long spanning the dam; at 1:3 that is 83 m, a third of
   the map's width, for a Ring B item. At 1:5 it is 50 m and still reads as the
   long low slab lying *across* the water that `02` describes.
4. **The Green Line carhouse and the Inner Belt yard are pulled radially in**
   to z ≈ −100…−108 from a computed z ≈ −128, so the north edge carries content
   inside the `boundsRect` slack. Declared, not silently nudged.
5. **The Davenport stands 15 m east and 7.6 m north of the law's own seat.**
   §1.2's formula puts it at (−38.25, +6.0); District 2 as shipped occupies
   x[−71.5,−35] z[+3,+24.5], centred (−53.25, +13.75), and the law's answer would
   carry the block across First Street at x −33. Phase 5 built to §4's approximate
   district rect, which is not the same placement as §1.2's law, and District 2 is
   shipped, measured and frozen. The offset is recorded on `sceneOffset` and the
   exception is declared here rather than left as a discrepancy between two
   sections.
6. **TD Garden is pulled 13.2 m in from §5.1's seat** (13.9 m from the law's).
   The law puts it at (+132.25, +10.25), a quarter-metre outside `maxX` 132, so
   something had to move; the shelf's east band is where it moved to. Declared
   rather than quietly reproduced.

A seventh entry would be a category error and is deliberately not on this list:
the MIT group's 1:5 plan compression is a **scale rule**, not a seat, and it lives
in §1.2 with the Ring B law it modifies.

---

## 2. The grid — square up the buildings, rotate the world

`02` §2.1 measures the rotation and it is small: First and Second Street at
**9.8°**, Cambridge Street at **99.7°**, the cross streets at 99.4–100.0°, with
two real diagonals — Edwin H. Land Boulevard at 35.7° and Monsignor O'Brien
Highway at 124.7°. `02`'s own instruction is to *"either author in true north
and rotate the grid, or author in grid axes and rotate the landmarks. Do one,
not both."*

**Decision: the scene's x/z axes ARE the East Cambridge grid.** First Street
runs along `−z`; Cambridge Street and the cross streets run along `x`. Landmark
bearings are converted into grid axes by the formula in §1.2. The scene never
rotates a building.

### 2.1 What it costs to do it the other way

A block cannot be rotated: `_block` places an axis-aligned box, the sim's only
geometric operation is AABB separation, and ADR-0013 permanently refuses a
rotation or shape tag. So "honouring the true rotation" does not mean turning a
building 10° — it means **stair-stepping every facade**. A 28 m facade at 9.8°
needs 4.8 m of lateral offset: nineteen 0.25 m jogs along its length, on every
storey, on every building in the district.

That is not a rounding cost. It is a direct reversal of the entire vocabulary:
the one-piece 28 m spandrel band that `01` exists to make possible becomes
nineteen pieces, the mortar course breaks at every jog, the placement-step rule
(`.wiki/modules/voxel.md` rule 10) becomes near-impossible to hold, and the
grade clause's 8 m plan-diagonal cap gets harder to satisfy because every
ground piece is now a thin sliver. The district would cost roughly triple and
look worse.

### 2.2 What the player actually perceives

There is no compass in this game. Absolute north is not observable. What *is*
observable, and what makes East Cambridge read as East Cambridge rather than as
Anywhere USA, is the **relative** geometry:

- Two diagonals cutting a regular orthogonal grid at recognisable angles.
- The river meeting the grid obliquely rather than squarely.
- The Lechmere viaduct curving *across* the street rather than along it.
- Long shadows running down the cross streets rather than across them.

All four of those survive perfectly under a squared-up grid, because all four
are relationships *between* elements, and the conversion preserves every
relative bearing exactly. Land Boulevard becomes **25.9°** off the grid's
north axis; O'Brien Highway becomes **114.9°**, i.e. 24.9° past the cross-street
axis. Those are the numbers that go in the scene file, and they are drawn as
`sceneDecor` road rects plus stepped kerb runs — a diagonal is affordable as
*decor*, which is flat and render-only, and ruinous as *structure*.

The one thing genuinely lost is the equinox "Cambridgehenge" alignment `02` §4
derives from the 99.7° bearing. Since lighting is global today and the sun
elevation is an open, unanswered decision on `STATUS.md`, that was never
buildable in this pass anyway. It is surfaced in `00` §4.2 as a pen.

---

## 3. Palette

No hex values appear in this document, deliberately. `02` §5.1 gives a **material
inventory**, not a palette, and instructs that real photographs be sampled before
authoring. `conventions.md` then governs how the sampled values are recorded:
`mm()` for measured-and-de-veiled, `sp()` for measured-raw on speculars, bare hex
for authored-by-eye, and the `PALETTE_TRANSFORM` seam for a global rebase.

The **chroma rule** does the structural work here and Cambridge is almost a
textbook case for it: this is a district where 1860s mill brick stands 130 m from
2020s curtain wall, and `conventions.md` is explicit that value cannot separate
those two banks — de-veiled brick reads *lighter* than expected. So:

| Bank | Where, in this scene | Chroma |
|---|---|---|
| **Mill brick, red to red-brown** | The Davenport's seven sections, 2 Canal Park's water-struck brick, the triple-deckers, American Twine, the Athenæum Press | **High** — 46–78 points of saturation, per Boston's measurement |
| **Cast stone / precast, warm off-white to pale grey** | 2 Canal Park's base and cornice bands, the Registry of Deeds, the old courthouse | **Low** |
| **Curtain-wall glass, blue-green to grey-green** | 1 Canal Park's lab conversion, 20 CambridgeSide, Cambridge Crossing, Education First, 40 Thorndike's new skin | **Very low**, and `sp()` — specular, left raw |
| **Granite, cool mid grey** | Longfellow towers and piers, Bunker Hill | Low chroma, high value |
| **Concrete, weathered** | The Green Line viaduct, the First Street Garage, the Museum of Science garage, the dam and locks | Low |
| **Limestone, pale warm grey** | The Great Dome, the Killian Court range | Low |
| **Brushed metal, silver** | Stata's crumpled tower, the Zakim's masts and cables | ~Zero — except Stata's base, which carries deliberately clashing **high-chroma orange and yellow brick** |
| **The Charles** | The whole southern edge | Not blue. Slate to steel-blue-green. `sp()`. |
| **Transit accents** | Green Line green-and-white; Red Line silver with a red stripe (Longfellow only, never here) | Small areas, **very high chroma** |

`02`'s one-sentence summary is the art direction and should be quoted in the
scene file's header: *red brick and grey water, cut by low-chroma glass towers,
with the transit and the Stata Center supplying almost all the saturation in the
frame.*

The one addition Cambridge makes: **HubSpot orange**. `02` §7 says use the mark
and use it correctly, and get the current brand asset rather than redrawing it.
It is the highest-chroma thing in the scene and it appears in exactly three
places (§6.5) so that it stays an event.

---

## 4. Districts

Ten of them. Each is a declared entry in a `CAMBRIDGE_DISTRICTS` table — an
exported array of `{ id, name, rect, budget, gapFloor }` — because the density
probe (§9.4) iterates it, and because a district that only exists as a comment
cannot be tested.

The block figures below are **starting estimates to author against**, not
budgets to hit. They exist so that an author picking up a district has a sense
of its scale relative to the other nine before placing the first piece — a
district sketched at 9,800 should end up carrying about twice the substance of
one sketched at 5,000. Nothing downstream reads these numbers: the `budget` field on
each district row is an authoring annotation, and `tools/validate.mjs` has no
block-count check of any kind.

**How to read these figures now that all ten districts are built.** They are
wrong in two distinct directions, and both are properties of the unit rather than
of the districts:

| District | Shipped, against its figure | | District | Shipped, against its figure |
|---|---|---|---|---|
| 1 Canal Park | 72.6% | | 6 Canal & CambridgeSide | 47% (87% in scope) |
| 2 The Davenport | 66.7% | | 7 North Point | 158% |
| 3 Lechmere | 65.3% | | 8 Charles Shore | 62% (80% in scope) |
| 4 Cambridge Street | 71.2% | | 9 Landmark Shelf | 139% (84% in scope) |
| 5 Thorndike Civic | 107% | | 10 Street life | 481% |

Districts that built **buildings** to a §4 contents list land at 65–73% of it,
every time, while shipping every line item — one primitive now does what a whole
wall course of cubes used to, so §4's per-object figures are a stale unit rather
than five underbuilds. §4.4 prices a triple-decker at ~150 blocks; the built one
is 71, and it is not thinner, it is the same house in anisotropic primitives.
**To convert a building line below into a current-era expectation, multiply it by
about 0.7.** The "in scope" figures parenthesised above are the same comparison
made fair, adding back the line items a district inherited from a neighbour's
section; every district lands inside the same band once that is done.

Districts that had to add **ground** land over, and for the opposite reason: §4
under-priced pavement and in three places did not price it at all. §4.7 priced
seven buildings and no ground; §4.8 gave one 1,000-block line to two streets, two
kerb circuits, a 71 m seawall and a park strip; §4.9 priced nine landmarks and
zero, on the district whose §8.2 mitigation is nothing *but* ground; and §4.10
priced a whole map's connective tissue at less than one district's kerb line. So
**every district carries a ground line below, named as such and priced separately
from its buildings** — six already had one under another name, and the rest now
do. The two findings are one finding seen from either end: §4 measured masonry in
cube-era blocks and did not measure pavement.

Neither correction touches the 75,000 scene target. The finished scene lands at
72,943 without them.

| # | District | Scene rect (approx) | Est. blocks | Dominant primitives | Palette bank | Role in play |
|---|---|---|---|---|---|---|
| 1 | **Canal Park — the Hero Block** | x[−46,+40] z[−36,+24] | **11,270** | slab · column · pier · panel · mullion · cornice · plinth | mill brick + cast stone, glass entry court | Spawn, the front-door ring, and the climax target |
| 2 | **First Street & The Davenport** | x[−72,−26] z[−12,+26] | **9,800** | panel · beam · column · slab · cornice | mill brick, timber | The densest, most texturally rich district; the validator's excursion |
| 3 | **Lechmere & the Viaduct** | x[−40,+40] z[−80,−36] | **5,000** | pier · beam · slab · panel · tread | concrete + transit green | The first thing you drive to; the local-recognition beat |
| 4 | **Cambridge Street & the Portuguese Seam** | x[−120,−58] z[−28,+30] | **8,600** | panel · tread · slab · small props | mill brick, painted timber, awning chroma | The human-scale, high-object-count, low-block-per-object district |
| 5 | **Thorndike Civic** | x[−108,−26] z[+16,+56] | **5,200** | plinth · pier · slab · panel · mullion | cast stone, concrete, new glass | The tall-slab landmark; the mid-game growth engine |
| 6 | **The Canal & CambridgeSide** | x[+20,+90] z[+14,+116] | **7,600** | plinth · panel · slab · drum · tread | water, precast, glass podium | Water, the fountain basin, the south gateway |
| 7 | **North Point & Cambridge Crossing** | x[+60,+132] z[−90,+16] | **6,800** | slab · column · mullion · panel · cornice | low-chroma glass, precast | The tall glass ring; the late-game height |
| 8 | **The Charles Shore** | x[+20,+132] z[+20,+116] | **7,800** | pier · beam · slab · tread · drum | concrete, granite, water | The long horizontal infrastructure showcase |
| 9 | **The Landmark Shelf** | the Ring B annulus, all edges | **8,580** | whatever the landmark is: mostly slab · pier · drum | per landmark | The horizon, the recognition payoff, the endgame drive |
| 10 | **Street life, kerb kit & the edge-band gallery** | scene-wide | **1,210** | panel (marks) · props (kit reuse) | — | Density glue; the ≤15 m insurance |

Added up, the ten estimates land just under 72,000, which sits inside `01`
§4.4's 40–80k band with room on both sides. We would like the finished scene to
come in under 75,000; lower is better. If it lands over, that is the cue to look
at which buildings could be built more efficiently — it is a prompt to go
looking, not a failure. It landed at 72,943, which is over the sum of the
estimates and under the target, and the paragraphs above explain why both of
those are true at once.

> **Why a soft target and not a contract.** A level authored toward an exact
> block count starts making decisions for arithmetic reasons, and the geometry
> gets worse. What we actually care about is that no part of the map reads as
> empty, and that is protected by a different and better check: the per-district
> density probe (§8.2, §9.4), which measures mean gap between eatable pieces and
> pieces per m² of built footprint. That probe is the one with teeth. Because it
> guards the thing we were worried about, coming in under the block estimate is
> safe — a lean district that passes the density floors is a well-built
> district, not an under-built one.

> **On blocks/m².** Roughly 1.3 blocks/m² sits below Brooklyn's 1.35 and well
> below Boston's 2.0, which is what we would expect — under this vocabulary a
> single block covers more surface, so blocks per m² stops measuring apparent
> density and starts measuring how coarse the pieces are. The metrics that track
> what a player sees are `01` §7.2's *distinct identifiable objects placed* and
> *eatable pieces per m² of built footprint*, and those are the ones we want
> going up against a brick-built control. §7 and §8.2 turn that into a
> per-district floor.

### 4.1 District 1 — Canal Park, the Hero Block · 11,270

**Real identity.** 2 Canal Park (Confirmed HQ address of record, entire building
HubSpot-occupied on the 2021 lease), 1 Canal Park 40 m west (Confirmed **ex**-
HubSpot, now a Breakthrough Properties life-science building), Canal Park the
street, the forecourt onto the canal, and the residential edge — Sierra and
Thomas Graves Landing, both 8 storeys (Confirmed OSM).

**Contents, and how the estimate breaks down:**

| Item | Blocks | Note |
|---|---|---|
| **2 Canal Park** (§6) | 2,300 | The hero. Member-by-member breakdown in §6.1 |
| **The glass-and-steel entry court** | 380 | Counted separately because it is the scene's first interior |
| **1 Canal Park** | 1,150 | Lab conversion. Very-low-chroma glass, precast. **No mark, no orange, no sprocket** (§6.5) |
| **Ground plane** — Canal Park street, kerbs, crossings, sidewalks | 700 | Kit reuse: `zebra`, `laneDashes`, curb furniture at a 5 m pitch |
| **The front-door ring** (§7.2) | 900 | The SIZE-1 snack ring. 0.25 and 0.5 m only |
| **The canal forecourt and terrace** | 620 | Plinth steps down to the water, planters, the outdoor patio nod from HubSpot's own announcement |
| **Sierra** (8 storeys) | 1,500 | |
| **Thomas Graves Landing** (8 storeys, on the canal) | 1,450 | |
| **Loading dock, service yard, parking ramp, plant** | 700 | Hand-2 spend: the stuff a brick-built version could not afford |
| **Trees, lamps, benches, hydrants, vehicles, signage** | 700 | |
| **Glyph/egg reserve — the Cutaway (E36–E38) + G6 anamorph** | 870 | `04`'s six-room interior set piece (~750) and the anamorph glyph resolving from Lechmere (~120). Free-standing enough that it needs its own line rather than riding on a building already itemized above |

**Role.** This is where the player starts, where the ≤15 m rule is strictest,
and where the run ends. It carries the finest grain in the scene by a wide
margin, per `01` §4.3's third "don't": *don't consolidate the spawn
neighbourhood.*

### 4.2 District 2 — First Street & The Davenport · 9,800

**Real identity.** The Davenport, 25 First Street: seven adjoining 1860s
brick-and-beam mill buildings combined in a 1987 renovation, redesigned by
Sasaki in 2008, 218,037 sq ft, 4–7 storeys across the sections, spanning
108–134 Cambridge Street and 25 First Street (all Confirmed except the per-
section heights and the block outline, which `02` marks Likely/inferred).
Plus First Street itself, and 161 First Street — the 1907 building where Lotus
Development started the spreadsheet industry, about 400 m north on the same
street (Confirmed).

| Item | Blocks | Note |
|---|---|---|
| **The Davenport, seven sections** (§6.2) | 3,600 | |
| **The 1987 lobby link and the 2008 courtyard** | 620 | |
| **Loading docks, freight canopy, fire escapes, rear yard** | 780 | `fireEscape` reused from the kit |
| **Ground plane** — First Street: roadway, kerbs, crossings, transit stop | 850 | First Street is the *z* axis — the grid spine |
| **161 First Street** | 900 | Ordinary 1907 brick block. `04` owns whether anything is hidden in it |
| **The block's remaining Cambridge Street frontage** | 1,500 | Storefronts at grade, mill above |
| **Yard clutter, dumpsters, bike shelter, transformers, vehicles** | 1,050 | Hand-2 spend |
| **Trees, lamps, furniture, hydrants** | 500 | |

**Role.** The densest and most texturally rich district, and the scene's
validator excursion runs through it (§9.5). It is also the district where the
vocabulary pays off most legibly: `02` says so independently — *"a long brick
mill wall is one solid piece with punched openings, not a field of same-size
cubes. The two documents point at the same building."*

### 4.3 District 3 — Lechmere & the Viaduct · 5,000

**Real identity.** Lechmere station, 3 North First Street, **127 m due north**
of the hero building (Confirmed). Opened 21 March 2022 as part of the Green Line
Extension. **Elevated** on a viaduct — the old ground-level station was
demolished and rebuilt in the air. Single **curved island platform, 108 m long,
10–11 m wide** (Confirmed). Adjacent: the Lechmere Busway, the MBTA Green Line
Transportation Office, and the Michael Capuano Inner Belt Carhouse. **The Glass
Factory condos** (Confirmed, OSM, 8 storeys) stand on the yard's south flank —
`02` §2.4 seats them at real E −117 / N +191, which §1.2's law puts at
(−49.25, −70), 18 m south of this district's yard and 30 m west of District 7's
edge-band ground. §4.7 used to claim them and could not: they are 110 m west of
that district's rect. They belong to this quarter of the map by position and to
no district by declaration — 874 pieces at 2.96/m² over x[−58,−40] z[−80,−60],
which is comfortably above the scene's own density floor if anything were
measuring it. See §4.7's note on pieces that stand in no declared rect.

| Item | Blocks | Note |
|---|---|---|
| **Viaduct: piers, crossheads, deck** | 1,450 | `pier` + `beam` + `slab`. The single clearest demonstration of what the vocabulary does to long horizontal infrastructure |
| **The curved island platform** (36 × 3.7 m scene) | 700 | Curve as three shallow chords, per ADR-0013's stepped-approximation rule |
| **Canopy, headhouse, stairs, lifts, faregates** | 800 | `tread` runs for the stairs |
| **A green-and-white Green Line train, two cars** | 420 | Very-high-chroma transit accent, tiny area |
| **Ground plane** — busway, shelters, buses, North First Street | 900 | |
| **Track, catenary, signals, the retaining wall north** | 730 | |

**Role.** `02` ranks Lechmere Tier 1 *"not because tourists know it but because
everyone in the building does"*, and it is 127 m from their desks. It is the
first place the route sends the player (§7.4) and the first "oh, they got that"
moment. Structurally it is also the district that proves the primitive: a
viaduct built from 0.25 m cubes is the kind of thing that used to eat a
district's whole budget.

### 4.4 District 4 — Cambridge Street & the Portuguese Seam · 8,600

**Real identity.** `02` §4 calls this *"the most under-used, most genuinely
local seam in the whole map."* East Cambridge has had a Portuguese and Azorean
community since after the Civil War (Confirmed); Cambridge Street from Lechmere
toward Inman carries the two oldest fish markets in the city and Portuguese
bakeries (Confirmed); two parks 300 m from HubSpot are named **Costa Lopez** and
**Silva** (Confirmed, OSM). The residential fabric west and north is
three-storey wood-frame **triple-deckers** with stacked porches (Confirmed). The
East Cambridge Savings Bank (2 storeys, small, old, civic) and the Third
Congregational Church anchor the west end.

| Item | Blocks | Note |
|---|---|---|
| **Twenty-two triple-deckers** | 3,300 | ~150 each. Three storeys, flat/shallow roof, **stacked porches** — the porches are the signature and are `tread` + `column` + `panel` |
| **Cambridge Street storefront row** | 1,900 | Evoke, do not name (`02` §7): a fish on an awning, a bakery window, a coffee cup. `04` owns the specifics |
| **East Cambridge Savings Bank** | 480 | Two storeys, civic masonry, cast-stone door surround |
| **Third Congregational Church** | 620 | `naveChurch` from the kit, re-proportioned |
| **Costa Lopez Park, Silva Park, Centanni Park** | 700 | Named on the ground plane. Play equipment, benches, fencing |
| **The Chang Shing Tofu Factory** | 260 | One storey, genuinely there, genuinely a tofu factory (Confirmed, OSM) |
| **Ground plane** — street, kerbs, crossings, awnings, vehicles, trees | 1,340 | Gore Street and Third Street are part of this and neither has an offset in `02`, so both are placed on the pitch the built map implies rather than derived |

**Role.** This is the **high-object-count, low-blocks-per-object** district and
therefore the scene's density reservoir: it holds the mean inter-piece gap down
in the map's west half without a single large mass. It is also the emotional
counterweight to the lab towers, and `04`'s richest seam.

**Derived, seated, not built by this district.** Four features have a Confirmed
offset, a derived seat, a `CAMBRIDGE_OFFSETS` row and no geometry of this
district's own, and it is worth keeping them in one list rather than scattering
them across four sections. **Costa Lopez Park** and the **Chang Shing Tofu
Factory** derive to (−76, +71.75) and (−38, +96.25) — 42 m and 66 m south of this
district's rect, outside the map as it stood when this district was built —
and were picked up later by the district whose own ground reached them. The
**Middlesex South Registry of Deeds** and the **old Middlesex County Courthouse**
derive to (−84, −16.5) and (−90.75, +9), which is ground *this* district already
occupies: their footprints hold 759 and 223 of its blocks today, with Third
Street's carriageway running through both. They stay data. Building them would
have meant demolishing built, measured geometry to satisfy a contents list that
§4.5's own rect already ruled out, and a hand-placed seat 80 m from the derived
one is a number nobody can check against a source. The offset rows are the audit
trail and they stay exactly as they are.

### 4.5 District 5 — Thorndike Civic · 5,200

**Real identity.** 40 Thorndike Street, the former Edward J. Sullivan
Courthouse: originally a Brutalist concrete courthouse and jail, vacant for
years, re-clad and reopened 2024. Footprint 86 × 57 m (Confirmed).
**Height conflict, carried forward: OSM says 22 levels, the developer's own
release says 20 storeys.** `02` says use 20 and note the conflict, so the scene
uses 20 (~86 m real → 57.3 m scene) and records both numbers in the scene file.
Plus the First Street Garage — 123 × 75 m of blank-walled parking deck.

**The Registry of Deeds and the old Middlesex County Courthouse are not this
district's**, though an earlier draft of this section listed them as line items
worth 900 and 700 blocks. The rect above is right and that contents list was
wrong: both derive to seats 32.5 m and 7 m *north* of this district's own north
edge, on ground District 4 already occupies. A contents list cannot move a
Confirmed offset and a rect can be checked, so where the two disagree the one
derived from `02` wins. They are described with the rest of District 4's derived
seats at §4.4, and this section's estimate is 1,600 lower than it was for their
removal.

| Item | Blocks | Note |
|---|---|---|
| **40 Thorndike** | 2,600 | 20 storeys. `setbackTower`-family massing rebuilt in the vocabulary: a wide base, a strong vertical rhythm of narrow window bays, a re-clad slab above |
| **First Street Garage** | 1,500 | Seven open decks. **The scene's biggest ≤15 m risk** — see §7.6 |
| **Ground plane** — the Thorndike/Otis/Spring street grid, kerbs, crossings | 900 | Two of those three names turned out unbuildable on the map as it stands: Otis Street's own block is where District 4's church, Row D and the storefront row already stand, and Spring Street's is past the built map's south edge. The grid ships as Thorndike Street plus the Second Street connector, both fully kerbed and furnished |
| **Glyph reserve — G1 sprocket + centre disc** | 200 | On the First Street Garage's top deck (`04` G1) |

**Role.** The tall thing to the west. `02` notes 40 Thorndike is 288 m from
HubSpot's front door and *"locals will look for it"*, and that it is the tallest
thing in East Cambridge proper. In play it is the mid-game growth engine: a
20-storey slab is where SIZE 4 becomes SIZE 7.

**Sensitivity, carried forward from `02` §7:** it was a jail, it has a long
contested still-litigated local history. Build the building; no jokes, no bars,
no prisoner props. `04` holds the same line.

### 4.6 District 6 — The Canal & CambridgeSide · 7,600

**Real identity.** The Lechmere Canal — a short dead-end basin with a circular
pool and a fountain, cut inland from the Charles, and the reason 2 Canal Park
exists and is named that (Confirmed). Lechmere Canal Park wrapping it. 10 Canal
Park (5 storeys). CambridgeSide 352 m south: formerly the Galleria mall, now
mid-redevelopment — **20 CambridgeSide**, 10 storeys, ~366,000 sq ft office/lab
where a multi-storey Macy's used to be, and **100 CambridgeSide**, ~224,000 sq ft
of lab in the former Sears, with retail still operating on the lower levels
(Confirmed; the retail is Likely).

| Item | Blocks | Note |
|---|---|---|
| **The canal basin, channel and rim** | 1,100 | `basinRim` from the kit; the channel extent is the §1.5 declared inference |
| **The circular pool and fountain** | 480 | `drum` of panels + `tieredFountain` |
| **Lechmere Canal Park: paths, lawns, seating, trees** | 900 | `pathRibbon` |
| **10 Canal Park** | 950 | |
| **20 CambridgeSide** (10 storeys) | 2,100 | Big glassy podium block, retail base, lab floors above |
| **100 CambridgeSide** | 1,200 | |
| **Ground plane** — Land Boulevard's diagonal, kerbs, crossings | 670 | The 25.9° diagonal, as decor plus stepped kerbs (§2.2). The canal-edge kerb, rim, bollard and seating run §8.2 names as this district's mitigation is ground too, and is priced with the basin above |
| **Glyph reserve — G9 food court ghost + G10 canal flywheel** | 200 | Roof paving pattern + park arcs (`04` G9/G10) |

**Role.** Water, the south gateway, and the district that gives the map a
non-orthogonal edge. `02`'s designer note applies directly: anyone who worked in
the building before ~2020 remembers a mall with a food court; anyone after
remembers lab buildings. Both memories are in the room. The podium is authored as
now, with a mall-era nod reserved for `04`.

### 4.7 District 7 — North Point & Cambridge Crossing · 6,800

**Real identity.** The ring of new towers immediately east and northeast, all
Confirmed from OSM `building:levels`: Archstone Northpoint (22), Twenty|20 at
Cambridge Crossing (20), Tango (12), Hult House (12), Education First HQ (12),
AVA East and West (6/6), Avalon North Point Lofts (6) — and Glassworks Avenue, a
real street 400 m out, whose name is a genuine East Cambridge glassworks
reference. The Glass Factory condos share that reference and were once listed
here, but `02` §2.4 seats them 110 m west of this district's rect: they are
described at §4.3, next to the yard they actually stand on.

| Item | Blocks | Note |
|---|---|---|
| **Archstone Northpoint** (22 storeys → 63 m scene) | 1,700 | The tallest thing on the east side |
| **Twenty\|20 at Cambridge Crossing** (20) | 1,450 | Ring B position |
| **Tango** (12), **Hult House** (12), **Education First** (12) | 1,900 | EF is the distinctive glassy one; massing only, **no wordmark** |
| **AVA East, AVA West, Avalon Lofts** (6/6/6) | 1,050 | |
| **The Common at CX, Viaduct Courts, Glassworks Avenue** | 500 | |
| **Ground plane** — the tower ring's streets, kerbs, crossings, footways, aprons, the park strip, podium paving and parked vehicles | *unpriced above; see below* | The lines above price seven buildings and no ground at all, which is why this district ships at 158% of the figure in §4's table. Tower-and-plaza is the scene's classic dead-zone geometry (§8.2), and the mitigation §8.2 names for it — podium retail, a continuous kerb and street-tree pitch, the Common's furniture — is ground. A district authored to the building lines alone would be seven towers on bare earth and would fail its own density floor |
| **Glyph reserve — G2 Partner Alley, North Point half** | 200 | Half the partner-mark run on the container stacks (`04` G2) |

**Role.** `02`'s reading of the skyline is the design brief for this district and
should be quoted verbatim in the scene file: *"the hero building is one of the
shortest things in its own neighbourhood… HubSpot's five-storey brick slab sits
in a bowl between them. That is the honest silhouette and it is more interesting
than a hero tower would be."* The player's sense of scale comes from here: you
grow until these stop being tall.

**The rect above starts 10.5 m east of this district's own westernmost geometry,
and that is worth fixing.** `probeCellOwnership` reports how many of a district's
pieces stand inside a *neighbour's* rect and reads zero for a piece standing in no
rect at all, so a green result there proves nothing about ground nobody declared.
Measured across the finished scene, x[31,41.5] z[−94,−6] holds 1,961 pieces at
4.98/m², of which 1,557 are this district's own park strip, footway and aprons.
The remedy is measured rather than guessed: widening the rect to x[31,107]
z[−94,−8] reads 11,565 pieces over 2,751 cells — 4.204/m² against the shipped
row's 3.996 — so it neither weakens the check nor flatters the row, it counts
ground this district built. Two other bodies of geometry sit outside every
declared rect for the same structural reason: the Glass Factory (§4.3) and
scattered seam furniture at four district edges. District 10's boulevard verge
joins the west verge there deliberately. The choice between widening the rect and
declaring the verge deliberately unrowed is P8.1's.

### 4.8 District 8 — The Charles Shore · 7,800

**Real identity.** Cambridge Parkway and its park strip, the Royal Sonesta
(11 storeys), 55 Cambridge Parkway (9), the MDC Boathouse, the Charlesgate Yacht
Club, the Charles River Dam and its two lock gatehouses, North Point Park with
its curving footbridge, the Museum of Science Parking Garage (4), and the Museum
of Science itself — 524 m SE, sitting **on** the dam with a foot in Boston and a
foot in Cambridge (all Confirmed).

| Item | Blocks | Note |
|---|---|---|
| **Museum of Science** (1:5 plan, §1.5) | 1,900 | A long pale slab lying *across* the water, a low bridge deck continuing the line, a squat planetarium `drum` |
| **The dam, the lock channel, two hip-roofed gatehouses** | 1,200 | `02` §7: flood-control infrastructure. Build it; do not stage a disaster at it |
| **Museum of Science garage** (4 decks) | 700 | |
| **Royal Sonesta** (11), **55 Cambridge Parkway** (9) | 1,500 | |
| **North Point Park + the curving footbridge** | 900 | `archBridge` reused |
| **Ground plane** — Cambridge Parkway, the park strip, boathouses, seawall | 1,000 | One line for two streets, two kerb circuits, a 71 m seawall and a park strip, which is a fraction of what that ground actually costs. §8.2's mitigation for this district is a continuous eatable spine along the whole shore, and a spine is ground |
| **Duck Boat ramp, rowing shells** | 400 | `02`: Duck Tours launch **at the Museum of Science**, Confirmed. The coach is a real vehicle in `CAMBRIDGE_VEHICLES` waiting at the ramp rather than an ambient effect. Canada geese are universally observed and Unverified as a citation — *"nobody will fact-check a goose"* — but the renderer has no goose to draw, so they are absent rather than declared (§9.2) |
| **Glyph reserve — G2 Partner Alley, Cambridge Parkway half** | 200 | Half the partner-mark run on the river frontage (`04` G2) |

**Role.** The long horizontal showcase, and the district that most obviously
could not have existed at Boston's grain. One detail worth getting right, from
`02`: the **dinghy fleet is upstream of the Longfellow**, not here.
Off Cambridge Parkway you get rowing shells, Duck Boats and lock traffic. A
sailboat scatter would be the postcard, not the place.

### 4.9 District 9 — The Landmark Shelf · 8,580

Ring B. Detailed in §5, where the estimate is broken out landmark by landmark.

**The ground line §5's table does not carry.** §5.1 prices nine landmarks and not
one kerb, lawn edge, fence run, apron, walk or parked car — on the one district
whose §8.2 mitigation is *nothing but* ground: *"the shelf is not free-standing.
Each landmark sits on an authored block."* A district authored to 8,580 alone
would be nine objects on bare earth and would fail the floor §8.2 wrote for it.
Read the 8,580 as the landmarks only; the shelf's campus ground, coping,
promenade and lawn edges are additional and are what take the district to 139% of
it (84% once the five deferrals it inherited from four other districts are priced
in — both CambridgeSide blocks, the Royal Sonesta, 55 Cambridge Parkway, Hult
House's share and the tofu factory).

### 4.10 District 10 — Street life, kerb kit & the edge-band gallery · 1,210

Scene-wide glue: the shared curb-furniture pitch, oriented vehicles on
grid-aligned streets, the crossing template, and the **edge-band gallery**
(§8.3, whose five items run to roughly 930 pieces). This district exists as a
line item because the density probe needs somewhere to attribute the scene's
connective tissue, and because `01`'s hand 2 is easiest to drop precisely on the
things nobody thinks to count.

**The 1,210 covers the gallery and the crossing template, and nothing else.**
930 of it is `04`'s five gallery marks, which are P7.3's work and are not built
here; what remains is about 280 for the shared curb-furniture pitch, the oriented
vehicles and the crossing template across a 252 × 228 m map — less than one
district's kerb line. The district as built emits 5,822 blocks, and every one of
them is answering a dead-ground sample or a density floor rather than a number:
it is the district §8.2 calls the mitigation for the other nine, and closing
2,200 m² of empty rail land at the census's 8 m reach costs what it costs. It
also does not fit one rect. What it lays inside another district's rect gets no
row at all, because raising the neighbour's density *is* its brief and a second
row over the same pieces would count them twice; the edge-band half it builds on
ground no other district reaches carries four measured rows of its own, each
drawn to hold nothing but this district's content so it can fail on its own
merits.

### 4.11 The north edge

Not a district in its own right — it is the north tail of districts 3 and 7 —
but it carries a `boundsRect` obligation. The **Michael Capuano Inner Belt
Carhouse** and the **MBTA Green Line Transportation Office** (both Confirmed,
OSM) are pulled radially in to z ≈ −100…−108 under the §1.5 exception so the
scene's content reaches within the 12 m slack of `minZ: −112`. They run to about
600 blocks, which sits inside districts 3 and 7 rather than adding an eleventh
line. In the event District 3 built both, and reads 926 pieces north of z −88
against the combined D3+D7 estimate of ~900 — so District 7's share of this
frontage was already on the map before that district started, and its content
went elsewhere.

---

## 5. Landmarks

### 5.1 Which ones make the map, and at what fidelity

Ranked as `02` §3 ranks them. Scene positions derived by §1.2's formula; every
one is a **design-time value** the scene file recomputes from the exported
offset table.

| Landmark | `02` tier | Scene (x, z) | Fidelity | Blocks |
|---|---|---|---|---|
| **Lechmere station + viaduct** | 1 | (−2.9, −56.5) | Ring A, near-literal | in district 3 |
| **Museum of Science** | 1 | (+106, +36) | Ring B, plan 1:5 | in district 8 |
| **Longfellow Bridge** | 1 | Cambridge end (+10.5, +113) | Ring B, **length 1:8** | 1,700 |
| **Stata Center** | 1 | (−93, +92) | Ring B, plan **1:4** | 2,000 |
| **MIT Great Dome + Killian Court** | 1 | dome (−92, +99), court (−84, +107) | Ring B, plan **1:5** (MIT group, §1.2) | 1,900 |
| **Zakim Bridge** | 2 | (+131, −16) | Ring B, **length 1:6** | 1,300 |
| **Bunker Hill Monument** | 2 | (+110, −100) | Ring B; stacked `pier`s, not the kit's cube-era `obelisk` (§5.3) | 420 |
| **TD Garden** | 2 | (+130, +10) | Ring B, massing only | 700 |
| **40 Thorndike** | 2 | (−84, +33) | Ring A, near-literal | in district 5 |
| **CambridgeSide** | 2 | (+15, +98) | Ring B (r 352, just over the seam) | in district 6 |
| **MIT Green Building** | 3 | (−80.5, +102) | Ring B | 380 |
| **Kendall/MIT station** | 3 | (−71, +98) | Ring B, headhouse + plaza | 260 |
| **NECCO water tower** | 3 | (−120, +83) | Ring B, tower + a slice of factory | 340 |
| **North Point Park** | 3 | (+119, −7) | Ring B | in district 8 |
| **Charles River Dam locks** | 3 | (+114, +26) | Ring B | in district 8 |

**The MIT group runs at 1:5 in plan**, per §1.2 — the Great Dome and Killian
Court, the Green Building, Kendall/MIT and the NECCO tower, alongside Stata's own
declared 1:4. Once Ring B has compressed the radius, six landmarks spread over
1,000 real metres all arrive inside one 50 × 25 m patch, and at 1:3 the Dome's
range alone would take 40 × 13 m of it. Heights are untouched at 1:1.5.

The shelf's own items come to 1,700 + 2,000 + 1,900 + 1,300 + 420 + 700 + 380 +
260 + 340 = 9,000. Six hundred of that sits inside districts 6 and 8, where a
landmark falls within another district's rect and is counted there instead, and
180 is set aside for `04`'s "UNBOUND" ground glyph on the Killian Court lawn
(G5), which has no building to ride on. Net: the ~8,580 in §4's table.

### 5.2 The Stata Center — the vocabulary's showpiece

`02` calls it *"the single best voxel target in the region — its whole identity
is a small number of bold tilted masses, which is precisely what a low-block-count
voxel vocabulary is good at. It will read from a hundred metres."* It is also
the honest test of ADR-0013's stepped-approximation refusal, because Gehry's
building has no vertical line in it and boxes have nothing but.

At 1:4 plan the footprint is ~32.5 × 27.5 m and the height ~26.7 m. Authored as
**nine masses and a base**, roughly 2,000 blocks:

| Mass | Primitive expression | ~Blocks |
|---|---|---|
| **The crumpled silver tower** (Gates, 9 storeys) | A **tilted stack of `slab`s**: eleven plates of 6 × 0.5 × 5 m, each offset 0.5 m from the one below in a walking direction that reverses twice. The lean *is* the offset — no rotation needed, and it is exactly ADR-0013's "a gable becomes a stack of long thin slabs" made vertical | 220 |
| **Two leaning brushed-metal cylinders** | `drum`s of 14 `panel` facets, each drum a stack of four rings whose centres walk 0.75 m per ring | 340 |
| **The Dreyfoos wedge** (7 storeys) | A `tread` run turned on its side: seven slabs of decreasing plan, each stepped 1 m | 190 |
| **Mismatched orange and yellow brick base volumes** | Four boxy masses of 5–8 m plan, each one `plinth` + four `panel` faces + `cornice`. **High-chroma**, deliberately clashing — the only saturated masonry in the scene's west half | 520 |
| **The tilted window bands** | `mullion` + glass `panel` runs following each mass's own step, not a shared datum | 380 |
| **Roof plant, vents, the amphitheatre lawn, the block it sits on** | mixed | 350 |

**The grade ceiling, checked here too.** Each base mass's `plinth` is a run of
4 m-scale pieces — the same convention as the hero building's base band (§6.1) —
rather than one monolithic block per mass. §6.3 works the grade-diagonal clause
through the two hero buildings, so it is worth doing the same sum here rather
than assuming it carries over: at the 4 m plinth-run size nothing on Stata comes
close to the 8 m clause, let alone the 9.7 m cliff. Read "5–8 m plan" as a single
piece and it would exceed both, which is why the run size is what the authoring
rule keys on, not the mass's overall footprint.

One authoring note that matters more than the rest: **each tilted stack is a
vertical load path** — a
slab resting on the slab below resets the cantilever span to zero, so a leaning
tower of plates is structurally the *cheapest and safest* thing this engine can
build (`01` §3.1). The lean is free. What is not free is horizontal: two adjacent
masses cannot support one another at these sizes, so every mass stands on its own
footprint, which is also how it should collapse — one mass at a time, which reads
as the building coming apart in pieces rather than deflating.

Height is **Unverified** in `02` (no reliable figure; ~40 m estimated from storey
count). The scene records it as an estimate in the offset table and does not
harden it.

### 5.3 The rest, in a handful of bold masses each

- **Longfellow Bridge** — *"if exactly one bridge makes the map, make it this
  one."* Four shapes: a long low line of **steel arches** (11 spans real,
  compressed to 5 `corbel-arch` runs), two fat granite piers at mid-river, and
  **four stubby domed granite towers standing on them in pairs** — the
  salt-and-pepper shakers, each a `drum` of 12 panels under a `halfDomeShell`
  cap. The **Red Line runs down the middle, between the two roadways** — silver
  with a red stripe, and this is the *only* place in the scene a Red Line car may
  appear (`02` §2.3 is explicit: Red Line cars belong here, not at Lechmere).
  Tower height above deck is **estimated, unverified** in `02`; recorded as such.
- **Zakim Bridge** — two white **inverted-Y masts** (82 m above deck, Confirmed —
  the one mast figure that is not an estimate), two fans of cables as 0.25 m
  `beam` runs, a wide flat deck threading *through the legs*. `02` notes the
  inverted-Y was designed to echo the Bunker Hill Monument, so the two read as a
  pair — which is why both are on the northeast/east edge, ~30 m apart in scene
  terms, where they can be seen together.
- **Bunker Hill Monument** — a tapering grey granite needle on a square green
  hill. Height 67 m real (Likely, widely cited, not re-verified) → 44.7 m scene.
  Two shapes, ~420 blocks, very high recognition per block: the best value on the
  shelf. Not the kit's `obelisk`, which is cube-era and lays about 1,480 half-metre
  cubes over that height for the 420-block line item priced here; the needle is
  nine stacked `pier`s of shrinking plan plus a four-course pyramidion — sixteen
  blocks for the same silhouette, which is ADR-0013's whole argument stated on the
  simplest object in the scene. The kit function is left alone because four other
  scenes call it.
- **Great Dome and Killian Court** — a wide limestone-grey classical block, a
  colonnade of tall `column`s across its front, a **shallow hemispherical dome
  with an oculus**, and a big open rectangle of lawn running from its base toward
  the river. The dome is a stack of four shrinking `drum`s on plates, not the
  kit's `halfDomeShell`: that builder skips every cell on one side of the centre,
  so it is an apse against a wall rather than a dome on a rotunda, and the two
  mirrored calls that would close it write the same cells twice. Shrinking drums
  are full-round, leave the Confirmed oculus open at the crown by construction,
  and cost 32 facets and four plates against `halfDomeShell`'s ~300 cubes at this
  radius — cheaper as well as correct. `02`'s
  warning is a hard authoring constraint: *the dome is low and broad, not tall and
  pointed — get that ratio wrong and it reads as a capitol building.* Dome
  diameter 30.5 m and height 46 m are both Confirmed, so the ratio is not a guess.
  The Killian-Court-to-2-Canal-Park sightline is, literally, HubSpot's own founding
  story — 1.8 km in life, 145 m here, and both ends are on the map.
- **MIT Green Building** — the tallest building in Cambridge (84 m architectural,
  Confirmed). A narrow concrete slab on **open pilotis** at the base with a radar
  `drum` on the roof. Three shapes.
- **TD Garden** — `02` is honest that it is *"recognizable mostly by where it is
  rather than by shape."* So it is a big blank drum-over-box at the Zakim's foot
  and nothing more. 700 blocks, no detail spent.
- **NECCO water tower** — a long brick factory slice with a **rooftop water
  tower**, once painted as a roll of NECCO wafers, now carrying a **DNA double
  helix** (Confirmed). `02` calls it *"a perfect two-shape voxel prop with a
  punchline."* The helix is the punchline and it is a `04` item; the tower and the
  factory slice are here.

### 5.4 What compressing distance costs, stated honestly

The Ring B law puts the Great Dome **145.5 m** from HubSpot's front door instead
of 1,706 m. **A person who works in this building knows that is a lie of nearly
twelve to one.** It is the single largest liberty this design takes and it should
be named rather than buried. The 145.5 is what §1.2's own law returns —
`113 + (1,706 − 340) / 41.9` — and `sceneOffset` reproduces it at 145.49, so the
figure is checkable against the table rather than quoted.

Three things make it the right trade anyway:

1. **Bearing is exact.** MIT is southwest, the Zakim is due east, Bunker Hill is
   northeast, the Longfellow is south, the Museum is southeast — all correct to
   better than a degree in grid axes. A player who orients by *which way* things
   are will never be wrong. Only *how far* is compressed, and every other scene in
   this game compresses distance far harder: Lower Manhattan's peninsula is ~1:20,
   Brooklyn's bridges-to-Coney span is telescoped past 1:60.
2. **The core is not compressed.** Ring A is 1:3 and holds everything within
   340 m — which is everything a person sees from the building. The lie starts
   where knowledge stops being daily.
3. **The alternative is worse.** Uniform compression enough to fit MIT honestly
   makes the hero building a shed. Leaving MIT out removes the Stata Center, the
   Great Dome and the founding-story sightline — the three highest-recognition
   objects available.

**What was left out rather than compressed:** the Citgo sign (unverified
position *and* unverified visibility), the Boston skyline (no backdrop plane
exists), and Boston Sand & Gravel (ungeocodable). Those three were candidates for
"compress it in anyway" and each was refused on the same principle: a landmark we
cannot place honestly is not placed. The scene file records all three as
deliberate omissions with the reason, so nobody re-adds them by accident.

---

## 6. The two HubSpot buildings

These are the hero assets, and they are where the new style has the most to
prove. Both are authored in the §1.2 Ring A scale — **1:3 in plan, 1:1.5 in
height** — and every extent below is a multiple of 0.25 m. That last part is not
a stylistic preference: ADR-0006's determinism proof rests on every span being an
exact sum of multiples of 1/8, so an off-grid extent quietly costs us
reproducibility.

### 6.1 2 Canal Park — the hero

**What `02` establishes.** Coordinates 42.37014 N, −71.07631 W (Confirmed).
Footprint 104 × 71 m bbox (Confirmed, measured — but see §1.5's overlap
correction). **5 storeys** (Confirmed, OSM `building:levels=5`, corroborated).
Height ~22 m (Likely, derived not sourced). Facade: *"traditional cast stone and
water-struck brick facade counterpointed by a modern glass and steel entry
court"* (Confirmed, repeated verbatim across listings). Fronts the Lechmere Canal
on the east side (Confirmed). Built 1987, gut-renovated 2015 — **conflicting**
with a second source saying 1999, 4 storeys, 200,000 sq ft; OSM's 5 levels backs
the 1987/5-storey reading, so the scene builds 5 and records the conflict.

**The massing brief, from `02`:** *"a wide, low, flat-topped brick slab —
roughly one and a half times as long as it is deep — with a lighter cast-stone
base band and cornice band, and a glass-and-steel entry court punched into the
canal-facing side… It is a broad building, not a tall one… **Do not draw it as a
tower.**"*

**Authored dimensions (design values):**

| | Real | Scene | Derivation |
|---|---|---|---|
| Plan | 84 × 62 m (corrected, §1.5) | **28 × 20.5 m** | 1:3 |
| Height to parapet | 22 m | **14.5 m** | 1:1.5 |
| Storey height | 4.3 m | **2.75 m** | 5 storeys = 13.75 m + 0.75 m parapet/cornice |
| Structural bay | 12 × 12 m | **4 × 4 m** | 7 bays along x × 5 along z = **35 bays** |

The 4 m bay is not arbitrary. It is `01` §4.2 clause 2 — *a floor becomes one
**bay**, not one **floor*** — sized so that no single piece carries more than ~5%
of the structure's mass, and it is the same 4 m that the SIZE-4 hole (radius
2.6 m) can take in one pass. The building's grain and the player's ladder are set
by the same number, on purpose.

**Member breakdown, per storey (×5):**

| Member | Primitive | Extents (m) | Count | Note |
|---|---|---|---|---|
| Floor plate | `slab` | 4 × 0.25 × 4 | **35** | **Skin, not fill**: a 0.25 m plate, never a solid 1 m cube. Plan diagonal 5.66 m — elevated, so the grade clause does not apply |
| Interior column | `column` | 0.5 × 2.75 × 0.5 | **15** | One per interior bay. Vertical support resets the cantilever span to 0, so one column per slab is sufficient *and necessary* — two adjacent 4 m slabs cannot support each other (a 4 m hop blows concrete's 3 m `maxSpan`) |
| Perimeter pier | `pier` | 0.75 × 2.75 × 0.75 | **20** | Water-struck brick. Reads on the facade and carries the perimeter bays |
| Spandrel band | `panel` | 4 × 1.0 × 0.25 | **24** | One per facade bay (perimeter 97 m ÷ 4 m) |
| Window lintel | `beam` | 4 × 0.25 × 0.25 | **24** | Cast stone. Under 5 m, so it never needs a mid-span support |
| Mullion | `mullion` | 0.25 × 1.5 × 0.25 | **48** | Two per bay. **These are the load path** — kill the mullion and the glass beside it loses its only horizontal support |
| Glass | `panel` | 1.75 × 1.5 × 0.25 | **48** | Glass never carries; every pane has a non-glass supporter at its own level |
| Brick pier face | `panel` | 0.75 × 1.75 × 0.25 | **24** | The masonry between windows |
| Spandrel tie beam | `beam` | 4 × 0.5 × 0.5 | **24** | Ties the piers; the horizontal load path the slabs cannot provide for themselves |
| **Per storey** | | | **262** | |

**Plus, once:**

| Member | Primitive | Extents (m) | Count | Note |
|---|---|---|---|---|
| Cast-stone base band | `plinth` | 4 × 0.75 × 1.0 | **48** | Two courses × 24 runs. **At grade**, so the grade clause bites: plan diagonal 4.12 m → first removable at radius 2.11 m → **SIZE 3**. Well inside the 8 m cap and well clear of the 9.7 m cliff |
| Entry steps and terrace | `tread` | 4 × 0.25 × 0.5 | **26** | |
| Cornice run | `cornice` | 4 × 0.5 × 0.75 | **24** | Projecting one cell outboard. Replaces a `for` loop that would emit ~194 cubes |
| Parapet | `panel` | 4 × 0.75 × 0.25 | **24** | |
| Roof deck | `slab` | 4 × 0.25 × 4 | **35** | |
| Roof plant, screens, lift overrun, two stair bulkheads | mixed | | **~70** | Hand-2 spend: a brick-built version would have skipped it |
| **Structure subtotal** | | | **~1,537** | 262 × 5 + 227 |

**The glass-and-steel entry court** — 12 × 8 m in plan, 3 storeys, punched into
the canal-facing (south/east) corner, budgeted separately at **380**: 8 steel
`column`s, 16 `beam`s, three levels of curtain wall (24 `mullion`s, 36 glass
`panel`s), a canopy of 6 beams and 8 plates, a revolving-door mass, and — a nod
to HubSpot's own announcement, which is Confirmed — a run of **bleacher `tread`s**
visible through the glass. This is the scene's first interior and the first thing
the vocabulary makes affordable that was simply not on the table before.

**And the rest of the hero's 2,300:** the loading dock and service yard, the
canal terrace and the private outdoor patio (Confirmed from HubSpot's own
announcement), bike racks, planters, the barista-café awning, and the signage
reserve (§6.5). Roughly 763 blocks of "the stuff next door that would not
otherwise have fit" — which is hand 2 in one line item.

**Sanity check against the brick-built twin.** A 28 × 20.5 × 14.5 m building
through today's `tower()` — hollow walls, window punches, an interior column
grid, full plates every `slabEvery` layers — lands somewhere around 2,500–3,500
cubes with a flat facade, no cornice, no plinth, no entry court and no roof
plant. The vocabulary version is **2,300 blocks with all of that**. That is the
result `01` is asking for and the one the owner corrected the first draft toward:
not a fraction of the count delivering the same, but a comparable count
delivering materially more.

### 6.2 The Davenport, 25 First Street

**What `02` establishes.** ~130 m WSW (offset E −123, N −40; Confirmed,
measured). An **1860s brick furniture factory** — the A. H. Davenport / Irving &
Casson works, birthplace of the "davenport" sofa, on the National Register
(Confirmed). **Seven adjoining brick-and-beam mill buildings** combined into one
office complex in a 1987 renovation, redesigned by Sasaki in 2008 (Confirmed).
218,037 sq ft (Confirmed). Storeys **4 to 7**, mixed across the constituent
buildings (Likely). Block roughly 110 × 65 m, irregular (**Likely** — OSM does
not carry the Davenport under that name, so the block edges were inferred from
the 108–134 Cambridge Street / 25 First Street address range).

**The massing brief, from `02`:** *"Not one building — a **ragged row** of
red-brick mill blocks of slightly different heights and rooflines, sharing party
walls, with tall regularly-spaced industrial window openings, flat roofs, and a
stepped skyline where the pieces meet. The visual signature is the height jog
between adjoining sections. A single clean box loses the whole character."*

**Authored dimensions (design values):**

| | Real | Scene |
|---|---|---|
| Block | ~110 × 65 m (Likely) | **36.5 × 21.5 m** |
| Sections | 7 | **7**, widths 4.5–6.5 m summing to 36.5 |
| Storeys | 4–7 (Likely) | 4–7, stepping **9.3 / 11.7 / 16.3 / 14.0 / 11.7 / 9.3 / 14.0 m** |
| Storey height | 3.5 m (mill) | **2.33 m** |
| Bay | ~16 m | **5.375 m** along z (4 bays deep) |

**Member breakdown, per section per storey** (a representative 5.25 m × 21.5 m
five-storey section):

| Member | Primitive | Extents (m) | Count |
|---|---|---|---|
| Mill floor deck | `slab` | 5.25 × 0.5 × 5.375 | **4** |
| Heavy timber post | `column` | 0.5 × 2.33 × 0.5 | **4** |
| Long-axis girder | `beam` | 5.25 × 0.5 × 0.5 | **4** |
| **Brick mill wall, per long face:** spandrel | `panel` | 5.25 × 0.75 × 0.5 | **1** |
| — window jamb pier | `pier` | 0.5 × 1.5 × 0.5 | **4** |
| — lintel | `beam` | 1.25 × 0.25 × 0.5 | **3** |
| — sill | `beam` | 1.25 × 0.25 × 0.5 | **3** |
| — glass | `panel` | 1.25 × 1.5 × 0.25 | **3** |
| — muntin | `mullion` | 0.25 × 1.5 × 0.25 | **3** |
| (long faces ×2) | | | **34** |
| **Per storey** | | | **~46** |

Five storeys ≈ 230, plus per section: the corbelled brick cornice band
(1 `cornice` run + 6 dentil `panel`s per face = 14), the roof deck (4 slabs), the
parapet (2 panels), a rooftop water tank or monitor skylight (~12), and the party-
wall jog where it meets its neighbour (~10). **Per section ≈ 336** (the listed
members sum to ~272; the remainder is trim, corner returns and colour-break
coursing at each jog, not separately itemized). Seven sections
= **2,352**, plus the ragged-row extras: six stepped parapet jogs (~60), the 1987
glass lobby link and the 2008 Sasaki courtyard (~220), four fire escapes (~160,
`fireEscape` reused), rooftop plant (~140), the First Street freight canopy and
loading dock (~180), yard clutter (~200), and the reserve for `04`'s Davenport-sofa
item (~120). **Total ≈ 3,600** (the itemized figures above sum to ~3,430; the
remainder is block-level trim and mechanical penetrations not itemized per
section, the same headroom noted at the per-section total above).

**Why the mill wall is the vocabulary's best argument.** A brick-built mill wall
is a field of 1 m cubes with holes punched in it — several hundred per storey per
face, and the window openings are a subtraction rather than a construction. Here
the wall *is* its members: one spandrel band that runs the whole section, jamb
piers, lintels, sills. Thirty-four pieces per storey per face instead of ~150,
each one an object the collapse can take individually, each one carrying a
different colour break so the wall reads as brickwork rather than as one enormous
brick (`01` §3.6's warning about proportional mortar on large plates).

**The height jog is the deliverable.** Seven sections at seven heights, sharing
party walls, is the entire visual signature. The authoring rule that protects it:
**a party wall is two pieces, never one.** `01` §4.3's first "don't" — do not
consolidate across a support boundary — has a visual twin here: two sections that
should fail at different times must be two structures.

### 6.3 The grade ceiling, checked

Every ground-anchored piece on both buildings, against `01` §3.2's ladder
(`radius ≥ √((a−0.1)² + (b−0.1)²) / 1.9`, cap 8 m plan diagonal, cliff at 9.7 m):

| Piece | Plan (m) | Diagonal | Required radius | First SIZE |
|---|---|---|---|---|
| Hero cast-stone plinth run | 4 × 1.0 | 4.03 | 2.11 m | **3** |
| Hero perimeter pier at grade | 0.75 × 0.75 | 0.92 | 0.48 m | **1** |
| Hero entry step tread | 4 × 0.5 | 4.02 | 2.11 m | **3** |
| Entry-court steel column | 0.5 × 0.5 | 0.57 | 0.30 m | **1** |
| Davenport jamb pier at grade | 0.5 × 0.5 | 0.57 | 0.30 m | **1** |
| Davenport ground spandrel | 5.25 × 0.5 | 5.17 | 2.72 m | **5** |
| Loading-dock plinth | 4 × 2 | 4.44 | 2.34 m | **3** |

Nothing exceeds 5.2 m of plan diagonal, against an 8 m cap — so no piece on
either hero building is permanently uneatable, with 2.8 m of margin to spare.
Worked through by hand here, and re-checked by the probe in §9.4 so it stays true
after edits.

### 6.4 Making the right building unmistakably the hero

`02` §0 exists entirely to prevent one mistake, and it names it: *"1 Canal Park
is a trap. It is a four-storey building 40 m due west of 2 Canal Park, it is
still called 'Canal Park', HubSpot was in it, and HubSpot is not in it any more…
If the scene puts the sprocket on the wrong Canal Park building, the people who
moved out of it will be the first to notice."*

Five guards, in descending order of how much they would survive a careless edit:

1. **A validator probe, `probeHeroIdentity` (§9.4).** The scene exports
   `CAMBRIDGE_HERO_AABB` and `CAMBRIDGE_NOT_HERO_AABB`. The probe asserts that
   every block emitted by the signage builder lies inside the hero AABB, and that
   **zero** blocks inside the not-hero AABB carry the HubSpot orange colour key.
   This is the guard that survives being forgotten, because it fails the build.
   There is one intentional piece of content inside the not-hero AABB: `04`'s G3
   "Ghost Sprocket" egg, a faded mark on 1 Canal Park's facade. It carries its
   own `HERO_SIGNAGE_GHOST` colour constant — a desaturated, weathered version of
   the live orange rather than the live constant itself — so it sits there by
   design without tripping the colour-key check. The ghost builder takes its
   colour from `HERO_SIGNAGE_GHOST`, never from `HERO_SIGNAGE`; see `04`'s G3
   entry.
2. **One signage builder, one call site.** The mark is emitted by
   `sprocketPanel()` and it is called exactly once, from one place, with the
   hero's own origin. There is no second way to draw it.
3. **Palette separation.** 1 Canal Park is authored as what it is now — a
   life-science conversion in very-low-chroma glass and precast. The hero is
   high-chroma water-struck brick with cast-stone bands. Under the chroma rule
   they cannot be confused at any distance or in any light.
4. **Massing separation.** The hero is 5 storeys and broad (28 × 20.5 m);
   1 Canal Park is 4 storeys and squarer (18.7 × 22.3 m), seated 18 m real west
   of the hero's west face per §1.5.
5. **`02` §0's timeline table, quoted verbatim in the scene file header**, with
   the 2021 Bisnow/Breakthrough citation. The next person to touch this file
   should not have to go looking.

### 6.5 Signage — the reserved, unverified detail

`02` §8 lists it as the first known gap and calls it *"the most-looked-at single
detail in the scene"*: HubSpot's exterior signage on 2 Canal Park — placement,
size, whether the sprocket appears at roof, parapet or door level — is
**Unverified**. There is no reliable public description.

**This design does not resolve it. It builds the seam.**

```
HERO_SIGNAGE = {
  placement: 'entry',        // 'entry' | 'parapet' | 'both'
  face: 'canal',             // which elevation
  markBlocks: 120,           // parapet budget, reserved
  doorBlocks: 40,            // entry budget, reserved
}
```

- **Default is `'entry'`** — a mark at the door — because that is the
  conservative reading, true of very nearly every leased headquarters, and
  because a wrong roof-level sprocket is a louder error than a missing one.
- **160 blocks are reserved** either way, so switching the constant after
  someone takes a street-level photo is a one-line edit and not a re-author.
- **Use the current official brand asset, do not redraw it.** `02` §7: *"a
  wrong-shade, wrong-proportion sprocket on the hero building is a worse outcome
  than no sprocket."* The mark is authored as a flat `panel` field on a 0.25 m
  grid sampled from the real asset, not as a hand-drawn approximation.
- **One open product question, and it is not a technical one:** `02` §0 also
  recommends confirming with someone at HubSpot that **both** buildings are still
  occupied as of 2026, since HubSpot has publicly consolidated leases elsewhere.
  That determines whether the Davenport carries any branding at all. One email,
  before ship.

---

## 7. Play experience

### 7.1 Spawn

**(0, 16)** — fixed by `voxelsim.js:164`, not chosen. What *is* chosen is what
the map puts there: **the canal-side forecourt of 2 Canal Park, 12 m from the
front door, facing the water.**

Three reasons this is the right seating:

1. **It is the emotional frame of the whole level.** You begin at HubSpot's front
   door as a 1.1 m hole that cannot so much as lift the plinth, and you end by
   swallowing the building. Every metre of the route is measured against a
   landmark that is behind you the whole time.
2. **It is the one place where the establishing shot writes itself.** The READY
   gate holds a static frame; the hero building fills it, the canal is behind it,
   the Lechmere viaduct is over its shoulder, and 40 Thorndike's slab is on the
   west horizon. Nothing else on the map frames that well.
3. **It satisfies the clearance rules with room.** 12 m to the hero's south
   facade, 20 m+ to 1 Canal Park, against a 1.7 m SIZE-scaled hanging threshold
   and Brooklyn's 4 m clear-disc convention.

### 7.2 The opening ten seconds, and the snack-ring equivalent

A sandbox has no snack ring — `citygen.js`'s ring is campaign-only. Brooklyn
solved the same problem by putting a Saturday greenmarket on Grand Army Plaza,
after discovering that a *paved* plaza is effectively inedible at SIZE 1 (a 1 m
paving block only unseats when 3 of 4 base corners fall inside the 1.045 m
removal disc, and any neighbour within concrete's 3 m span keeps carrying it).

Cambridge's equivalent is **the front-door ring**: the working forecourt of a
tech headquarters, at 0.25 and 0.5 m only, 900 blocks, filling every heading out
of spawn.

| Ring content | Grain | Why it is here |
|---|---|---|
| A food-truck row along Canal Park | 0.5 | Lunchtime is real; trucks are `boxVan`-family reuse |
| Café tables and chairs on the terrace | 0.25 | `cafeTable` reuse |
| The private outdoor patio's furniture | 0.25 | Confirmed from HubSpot's own announcement |
| A bike-share dock and staff bike racks | 0.25 | `bikeRack` reuse |
| Planters along the canal edge | 0.5 | `planter` reuse |
| News boxes, bollards, a coffee cart, sandwich boards | 0.25 | `newsBox`, `bollard`, `hotDogCart`, `sandwichBoard` |
| Trash and recycling on the service side | 0.25 | `trashBags`, `trashBin` |

**Two things shape the ring, and both are checkable (§9.4):** the innermost 4 m
around spawn stays completely clear, so the hole is not already chewing before
the player touches a key and the READY gate can hold a static frame; and every
one of 32 sampled headings out of spawn finds something edible within 6 m.
Brooklyn ships 0 of 32 dead, and Cambridge aims at the same result.

**Second 0–10:** the hole is 1.1 m and moving at 9.96 m/s. Turn any direction and
you are into the ring within half a second. Ten seconds of eating 0.25 m
furniture at ~25 blocks per combo level puts the player at SIZE 2 with a live
chain, and the chain must not break on the way out — which is what the food-truck
row is for: it is a *line* of eatables pointing north toward Lechmere, so the
chain survives the transition from ring to route.

### 7.3 The ladder, and where each rung unlocks

Radius is `1.1 + (SIZE − 1 + frac) × 0.5`, so the grade ladder from `01` §3.2
converts directly into a district ladder. This is `01` §4.2's clause 3 —
*match the dominant piece size of a district to the SIZE the player will be at
when they reach it* — applied as a map:

| SIZE | Radius | What becomes takeable | Where it lives |
|---|---|---|---|
| 1 | 1.10 m | 0.25–1 m furniture, jamb piers, steel columns, mullions | The front-door ring; every kerb in the scene |
| 2 | 1.60 m | 2 m piers and plinths | Lechmere's stair walls, the busway kerbs, triple-decker porches |
| 3 | 2.10 m | 3–4 m plinth runs, the hero's base band | The hero's forecourt, the Davenport's dock |
| 4 | 2.60 m | **A full 4 m bay in one pass** | The hero's bay lines; the Davenport's mill bays |
| 5 | 3.10 m | 5 m ground spandrels | The Davenport's ground floor |
| 6 | 3.60 m | 6 m monument masses | Stata's base volumes, 40 Thorndike's plinth |
| 7 | 4.10 m | 6 m plinths comfortably; two bays a pass | The Landmark Shelf |
| 8–10 | 4.6–5.6 m | 8 m grade pieces — the largest the grade clause permits | The Museum of Science's terrace, the dam |
| 11–12 | 6.1–7.1 m | Everything on the map. Nothing is uneatable | — |

Nothing on this map goes above an 8 m plan diagonal at grade, so the 9.7 m cliff
never comes into play. §9.4's probe checks that rather than leaving it to
memory.

### 7.4 The intended route and the growth curve

Six legs, arranged so that each one is fed by the size the previous one gave you,
and so that the player travels *away* from the hero building and comes back to it.

| Leg | Where | Enters at | Leaves at | Why here |
|---|---|---|---|---|
| **1** | The front-door ring | SIZE 1 | SIZE 2, ~20 s | Fine grain, no walls, immediate feedback |
| **2** | North up First Street to **Lechmere** | SIZE 2 | SIZE 3, ~50 s | The viaduct's piers and stair walls are 2 m; the platform is a long line of eatables that holds a chain. The recognition beat lands while the player is still small enough to be impressed by a station |
| **3** | West and south into **the Davenport** | SIZE 3 | SIZE 5, ~2 min | The densest district on the map. Mill bays are 5.25 m; jamb piers and lintels feed a chain continuously. This is where a player learns that a building comes apart in *members* |
| **4** | Out along **Cambridge Street** to the Portuguese seam and the savings bank | SIZE 5 | SIZE 6, ~3 min | Highest object count per metre in the scene. Keeps the chain alive across the map's widest crossing |
| **5** | Back east into **Thorndike Civic** — 40 Thorndike and the garage | SIZE 6 | SIZE 8, ~4½ min | A 20-storey slab and a seven-deck garage. Mass, not detail. This is the growth engine |
| **6** | **Return to 2 Canal Park** | SIZE 8 | SIZE 10–12 | The climax. See §7.5 |

**Optional loops**, not on the critical path, which is what makes them worth
finding: the Canal and CambridgeSide south (district 6), North Point's tower ring
east (district 7), the Charles Shore and the Museum (district 8), and the
Landmark Shelf, which is the late-game drive when the hole is fast enough that
340 m is 13 seconds. `04`'s items are weighted toward these, so exploring pays.

**Completion** is 50% of `totalMass`, which — given districts 5, 7 and 9 hold the
tall masses — is reachable without ever taking the hero building. **That is
deliberate.** Eating 2 Canal Park should be a thing the player *chooses*, not a
box the goal ticks for them.

### 7.5 Eating the HubSpot building — the climax

This is the question the level is built around, so here is the arithmetic.

- **First bite: SIZE 1.** The hero's 0.75 m perimeter piers at grade need a
  0.48 m radius. A SIZE 1 hole can chip the corner of the building on second one.
  That is intentional and it is a tease — chipping a pier does nothing.
- **The base band: SIZE 3.** The 4 × 1.0 m cast-stone plinth runs need a 2.11 m
  radius. At SIZE 3 the building's skirt starts coming away.
- **Structurally takeable: SIZE 4.** At radius 2.60 m the hole spans a full 4 m
  bay. One pass along the south facade removes a bay line's plinth, pier and
  spandrel tie; the five floor plates above lose their only vertical support —
  because two adjacent 4 m slabs *cannot* support each other, a 4 m hop blowing
  concrete's 3 m `maxSpan` — and come down as five plates plus their columns. One
  pass, one bay, five storeys. **This is the moment the building becomes food.**
- **The whole building: SIZE 6.** The hero is 35 bays. At SIZE 6 (radius 3.60 m)
  a pass takes a bay line and shoulders the next, so seven passes along x clear
  it. At 9.96 m/s → ~18 m/s at SIZE 6, seven 28 m passes is about 15 seconds of
  driving. **That is the emotional climax and the route is timed to arrive at
  SIZE 8**, two rungs of margin, so it never feels like a struggle at the moment
  it is supposed to feel like an ending.

**Why leg 6 returns instead of starting there.** Because the answer to "when can
I eat my office?" has to be *earned*, and because the building is behind you for
the entire run. The player spends four minutes looking at it in the rear-view.
Then they turn around.

**The last bite, reserved for `04`:** whatever is on the parapet goes last, and
it should. That is a `04` decision, and this document only reserves the slot and
notes that the parapet band is elevated — so it is removed by losing its support,
not by the grade test, and it comes down with the top plate.

### 7.6 Where the SIZE-1 player is *not* sent

Three places are deliberately hostile early, and it is worth saying so here so
that nobody later reads them as oversights and "fixes" them: the **First Street
Garage** (blank concrete decks, nothing under 2 m), the **Landmark Shelf** (bold
masses at 4–8 m), and the **Charles Shore's** dam and locks. All three are
late-ladder content. They still sit under the ≤15 m rule (§8), though — being
late in the ladder is a reason for the pieces to be big, not a reason for the
ground between them to be bare.

---

## 8. The ≤15 m rule, and density floors

### 8.1 What the rule is

`01` §3.5 states the re-trigger condition for the combo economy precisely: *any
contiguous district a player would plough in one pass whose **mean gap between
consecutive eatable pieces along a plausible driving line exceeds ~15 m** (the
SIZE 1 reach), or ~25 m at mid-ladder speeds.* The 15 m is not arbitrary — the
combo window is 1.5 s and SIZE 1 speed is 9.96 m/s, so 14.9 m of travel is
exactly one chain's worth of patience.

This is a *local* measure, and that is the whole point of it. Consolidating a
building into fewer, larger pieces can leave the scene looking fine in aggregate
while that particular stretch of pavement goes sparse. The chain has no opinion
about the map as a whole; it only cares whether the next bite arrives within
1.5 s of the last one. So the check that matters is per-district and along a
driving line, which is exactly what §8.2's floors and §9.4's density probe
measure.

**Coin anchors are a prerequisite here, not a pen.** `04` §4.1 establishes that
today's coin scatter (`_placeCoins`, `voxelsim.js:324-338`) is a uniform draw over
`boundsRect` with no per-scene control — a coin every ~104,000 m² on a map this
size. `04` §4.3 then allocates 18 of the scene's 60 coins specifically to bridge
the gaps this section defines, "placed by measurement" against this page's own
scripted-excursion probe. A design that reserves nearly a third of its coin budget
for a capability the engine does not yet have is not deferring that capability, it
is depending on it — which is why `00` §4.1 carries `sim.coinAnchors` as a
completer rather than a pen.

Two things travel with it, and they belong here because this is where the density
floors live. First, the RNG draw needs to hold its position in the seed sequence
for any scene that declares no anchors; otherwise the five shipped scenes' coin
layouts re-roll (ADR-0003). Second, per `04` §4.2's companion fix, a coin
refreshes `chainTimer` without incrementing `chain`. Read against this section's
terms, that lets a coin sustain a chain across a gap without inflating
`comboMult` or the Unbroken Chain belt's `longest_chain` metric, which is what
`01` §3.5's rate-gate analysis and the floors below both assume.

One corollary for the density probe: a coin does not count as an eatable piece
in the pieces/m² or mean-gap measurement. If it did, an author could paper over a
genuine dead zone with currency instead of content, and the probe would stop
telling us anything.

### 8.2 Per-district floors

Across roughly 31,600 m² of built footprint, the scene's median density comes out
at **~2.34 eatable pieces per m²**. `01` §7.5's probe 6 sets the floor at half
the scene median — **1.17/m²** — with a 15 m ceiling on mean gap. These are the
numbers with real consequences: they are what `tools/validate.mjs` measures, and
they are the reason a district can come in lean on block count and still be
demonstrably not-empty. Per district, with the tighter targets the design asks
for where it can afford them:

| District | Risk | Mean-gap target | Pieces/m² floor | The mitigation, named |
|---|---|---|---|---|
| 1 Canal Park | **Low** | **≤ 6 m** | 3.0 | The front-door ring; the finest grain in the scene by design |
| 2 The Davenport | **Low** | ≤ 8 m | 2.8 | Mill-wall members are inherently dense: 34 pieces per storey per face |
| 3 Lechmere | **Medium** | ≤ 12 m | 1.6 | A viaduct is a line of piers with gaps between them. **Mitigation: the busway, shelters, kerbs and track furniture run continuously between bents** — the gap between piers is filled at ground level, not left as span |
| 4 Cambridge Street | **Low** | ≤ 8 m | 2.6 | The density reservoir. Twenty-two triple-deckers with porches |
| 5 Thorndike Civic | **HIGH** | ≤ 14 m | 1.3 | **The First Street Garage is 1,025 m² of blank deck.** Three mitigations, and it takes all three to get there: (a) the decks are authored as *open* decks with a column grid and edge kerbs, not solid plates, so a pass through one deck meets a column every 4 m; (b) the ground level is a working lot with parked vehicles, ticket booths, barriers and light masts; (c) 40 Thorndike's grade retail wraps the block's street faces. Drop any one of them and the district comes in under its floor |
| 6 Canal & CambridgeSide | **Medium** | ≤ 13 m | 1.4 | Water is excluded from the built footprint, but the *route around it* is not. **Mitigation: a continuous canal-edge kerb, rim, bollard and seating run** all the way round the basin, plus the park's path furniture |
| 7 North Point | **HIGH** | ≤ 14 m | 1.3 | Tower-and-plaza is the classic dead-zone geometry: 1,700 blocks in one 22-storey slab and nothing between it and the next. **Mitigation: podium retail at grade on every tower, a continuous kerb and street-tree pitch, and the Common at CX's furniture.** The towers are tall, not wide — the ground plane does the density work |
| 8 Charles Shore | **HIGH** | ≤ 15 m | 1.2 | Water, park and one very long building. **Mitigation: the seawall, the park path furniture, the boathouse cluster, the Duck Boat ramp and the parkway's kerb line form one continuous eatable spine** along the whole shore. A player driving the shore never leaves the spine |
| 9 Landmark Shelf | **HIGHEST** | ≤ 15 m | 1.2 | Bold masses with hundreds of scene-metres between them is what a shelf *is*. **Mitigation: the shelf is not free-standing.** Each landmark sits on an authored block — a plinth, a lawn edge, a kerb, a fence run, a row of parked vehicles — and the shelf items are placed so that consecutive ones are ≤ 40 m apart along the map's edge, with the edge-band gallery (§8.3) and the kerb line closing the remaining gaps. If the probe still comes up short, the answer is more ground furniture rather than a wider probe |
| 10 Street life | n/a | — | — | This district *is* the mitigation for the other nine |

The single line worth carrying into the scene file's header: *in a district built
from large primitives, the ground plane carries the density.* A tower can be four
slabs. It is the 30 m of pavement in front of it that has to do the work.

### 8.3 The edge-band gallery

The owner asked for *"familiar symbols and logos created near the edges."* The
design turns that into a mechanism rather than a decoration: reserve the outer
~10% of the map — water, rail yard, highway interchange, mudflat — as the
ground the architecture does not reach, and put content there instead of
leaving it as the dead-ground census's worst offender.

The gallery `04` §1.3's G11 lays out has five items, roughly 930 pieces in all:
the Flywheel sprocket (~230, in the Inner Belt rail yard to the north), Partner
Alley (~400, along the river frontage and North Point, G2), "UNBOUND" (~180, on
Killian Court, G5), a rowing-eight wake pattern (~50, on the Charles south edge,
inert scenery rather than eatable), and the rotated-grid compass rose (~70, on
the northeast mudflat). HubSpot's own sprocket is not among them — G1 lives on
the First Street Garage roof in District 5 (§4.5), where it reads against a
building rather than against open ground.

Four things shape how the gallery gets built, each of them following from
something already established elsewhere:

- Flat and on the ground plane, laid at each item's own declared raster pitch, on
  an authored apron and not inside a `roads`, `water` or `parks` rect. The
  road-conflict and water-over-surfaces probes would catch that anyway, but it is
  worth writing down so nobody has to learn it from a red build. An earlier
  version of this bullet also offered "inside a declared `CAMBRIDGE_OPEN_GROUND`
  span", and that half is not buildable: `probeOpenGround` fails any span holding
  a block, so a mark laid inside a span un-declares the span the moment it is
  authored. District 10 discharged this by building the aprons **adjacent** to
  the ground each mark wants — its own header names which apron belongs to which
  `04` item, and three of the five items need no new apron at all, because
  District 8's promenade, District 9's Killian Court lawn and the Charles's own
  water already are the ground those marks sit on.
- No third-party trademarks. `02` §7 draws the line well: HubSpot's own mark is
  the point of the exercise, a competitor's would read as a jab, and a small
  local business did not ask to be in a game.
- Eatable by default, for the same reason the edge band exists at all — a mark
  that comes apart is better than a mark that sits there as scenery. `04`'s
  rowing-eight wake is the one exception in the current catalogue, and since it
  sits on the Charles south edge it does not count toward District 8's
  eatable-pieces-per-m² floor (§8.2). District 8 is already one of the tighter
  ones, so that is worth keeping in view.
- **The gallery's contents and the achievement each mark unlocks belong to
  `04`** — this section states the placement principle, `04` §1.3 owns the
  catalogue.

---

## 9. Validator compliance

### 9.1 What the validator asks of this scene

`AGENTS.md` calls for `node tools/validate.mjs` → `ALL PASS` before any commit
touching `js/voxelsim.js` or `js/voxelkit.js`, and `conventions.md` hard rule 1's
glob over `js/voxelscene-*.js` picks up `js/voxelscene-cambridge.js` the moment
the file exists — the `Math.random()` guard included. That coverage is automatic
by design, so a new scene does not have to remember to opt in.

Worth noting what the validator does *not* check: there is no block-count probe
anywhere in it. The `budget` field on each `CAMBRIDGE_DISTRICTS` row is an
authoring annotation and nothing reads it. Density is the thing that gets
enforced (§8.2, §9.4), which is the right place for the pressure to sit.

### 9.2 The shared 19-probe contract

Cambridge signs the full set, the same way Brooklyn, Upper Manhattan and Boston
do: the same probe bodies, parameterised with Cambridge's own tables, rather than
a second implementation. `.wiki/modules/voxel.md` puts the reason well — *a probe
that drifts per scene stops being a contract.*

| Probe | What Cambridge supplies |
|---|---|
| `probeCellOwnership` | Nothing — but **run it first and often**. `01` §5 notes that larger pieces make overlaps far easier to author but no more expensive to catch — the probe cost is per fine cell regardless of piece size. A 4 m slab clashes with far more than a 1 m cube |
| `probeCameraBlockers` | `sim.cameraBlockers = generateBlockers(sim)` — **generated, never hand-written** (`01` §6.3). Every structure ≥ 6 m, with `h` at its true top including the water tanks, the Zakim's masts and the radar drum |
| `probeBoundsRect` | Content within the 12 m slack of `x[−120,132] z[−112,116]` — which is what forces §4.11's north-edge content |
| `probeRoadConflicts` | `CAMBRIDGE_VEHICLES` (exported, the validator's allowlist) + `CAMBRIDGE_ROAD_SPANS` (the Lechmere viaduct crosses North First Street; the Land Boulevard diagonal passes under the ramp) |
| `probeWaterOverSurfaces` | Charles, canal basin, canal channel, lock channel — none may cover a road, plaza, cobble, sidewalk or crosswalk |
| `probeParkUnderWater` | No park rect fully inside water. The canal park wraps the basin, so this is a real risk here |
| `probeRimmedWater` | The canal basin's rim must match the water interior. Union-aware: the channel and the basin are two lobes of one body |
| `probeBareGround` | Every footprint cell on a decor surface. Cambridge targets **zero dead ground**, Boston's standard |
| `probeOpenGround` | `CAMBRIDGE_OPEN_GROUND` — one span, the Inner Belt yard's ballast (§1.4), genuinely block-free **and edge-touching** |
| `reportDeadGround` | Printed, not gated. **Target: 0**, checked cell-by-cell rather than by the 4 m sampled probe, which has 8 m of reach and walks past an 8 m bare stripe |
| `probeCrosswalkStripes` | From `zebra`, never hand-rolled |
| `probeCrossingsOnDeclaredStreet` | `CAMBRIDGE_CROSSINGS` inside `CAMBRIDGE_STREETS` spans |
| `probeDecorKeyOrder` | `sceneDecor` key order matches draw order — water wins overlaps, markings above asphalt |
| `probeAmbient` | Kinds: `gulls`, `steam`, `neon`, `pigeons`, and the roster is final at those four. Render-only, never physical. `ducks`, `geese` and `trains` were listed here and are dropped: `js/voxelworld.js` enumerates the kinds it can resolve and there is no deriver, no mesh and no tick for any of the three, so declaring them would make this probe go green on birds that do not exist. Adding them is a change to a file four other scenes share, made for ambient decoration — a Phase 8 decision in its own right, not a rider on a scene |
| `probeIdleStability` | 3 s spawn-idle with nothing moving |
| `probeFinitePositions` | Before and after the excursion |
| Excursion determinism | Two identical runs (§9.5) |
| `eatenCount ≥ 300` | (§9.5) |
| `size ≥ 4` | (§9.5) |

### 9.3 The three Cambridge-specific tables

Beyond the standard exports, the scene exports three things no other scene has:

- **`CAMBRIDGE_OFFSETS`** — the real-world offset table from `02` §6, verbatim,
  with each row's confidence marker. The scene *computes* positions from it via
  §1.2's scale law rather than hardcoding scene coordinates, so a corrected
  offset re-derives the layout. This is `02`'s "record the compression factor in
  the scene file" obligation, discharged as data rather than as a comment.
- **`CAMBRIDGE_DISTRICTS`** — `{ id, name, rect, budget, gapFloor }` × 10, which
  the density probe iterates.
- **`CAMBRIDGE_COIN_ANCHORS`** — scene-declared coin positions, keyed to `04`
  §4.3's allocation table (bridging, egg beacons, vertical, edge band, efficiency,
  true hides). This is the `sim.coinAnchors` capability §8.1 promotes from pen to
  prerequisite: it requires a small, contained change to `_placeCoins`
  (`voxelsim.js:324-338`), it must leave every scene that declares no anchors
  drawing from the RNG in exactly the same sequence position as today, and it
  ships alongside the companion fix in `js/voxelsim.js:2192-2193` — a coin
  refreshes `chainTimer`, never `chain`.

### 9.4 The probes this design adds

Four. Three come from `01` §7.5 and belong in the **shared** contract; one is
Cambridge-specific.

1. **Grade-diagonal probe (shared).** No `gy === 0` block with a plan diagonal
   over 8 m. This is `01` §4.2 clause 1 made checkable, and it is what catches a
   permanently uneatable monument that still counts toward `totalMass` and so
   quietly makes the 50% goal harder. §6.3 walks both hero buildings through it;
   they clear with 2.8 m of margin.
2. **Placement-step probe (shared).** Placement step equals piece extent on every
   axis — `.wiki/modules/voxel.md` rule 10, generalised. This is far easier to
   get wrong with mixed anisotropic extents than with a uniform brick, and the
   failure is invisible to physics (each piece is grounded) while being obvious to
   the eye. The Battery Park "hedge row" of 13 isolated cubes is the shipped
   precedent.
3. **District density probe (shared) — the one that carries hand 2.** Per
   declared district: mean gap between consecutive eatable pieces along the
   scene's own scripted route stays under 15 m, and no district falls below half
   the scene's median eatable-pieces-per-m². §8.2's table is the input. This turns
   the combo dead zone and the empty diorama into a failing test, and it is the
   most valuable probe on the list — it is the check standing behind everything
   §4 says about being relaxed on block counts.
4. **`probeHeroIdentity` (Cambridge-specific, §6.4).** Every signage block inside
   `CAMBRIDGE_HERO_AABB`; zero HubSpot-orange blocks inside
   `CAMBRIDGE_NOT_HERO_AABB`. Scene-specific because the mistake is
   scene-specific — but it takes a table parameter, so if a future scene ever has
   a "do not confuse these two buildings" problem, the probe generalises without
   a second implementation. The check is keyed on the live `HERO_SIGNAGE` colour
   constant specifically, so `04`'s G3 ghost mark (its own, distinct
   `HERO_SIGNAGE_GHOST` constant) sits inside `CAMBRIDGE_NOT_HERO_AABB` on
   purpose without failing it.

**A fifth, worth considering and not proposed:** a spawn-heading probe. `STATUS.md`
records Brooklyn at "0 of 32 spawn headings dead" but that came from a scratch
sweep, not from `tools/validate.mjs`. §7.2 sets Cambridge the same target. If
that check is going to be a standard, it should be a shared probe rather than a
number in a status file — but that is a change to the shared contract that
affects four other scenes and it should be its own decision, not a rider on this
one.

### 9.5 The scripted excursion

Following both lessons the shipped scenes learned: Upper Manhattan's (walk a
wall's *footprint* rather than re-excavating the same crater twice) and Boston's
(end-to-end legs, deliberately not orbiting a point, so the hole never
re-harvests footprint it already took).

**Route: the Davenport's long axis and back along First Street.** It began at
62 s and five waypoints, entering at the block's west end, running the full
36.5 m of the mill range along its spine, out onto First Street, and back north —
legs, not an orbit. The Davenport is chosen because it is the densest district
and because it is the district whose grain the vocabulary changes most, so the
excursion is also the vocabulary's own regression test. Each district then
appended its own legs, because the density probe measures inter-piece gaps *along
this route* and a district the route never enters cannot be measured by it; the
finished route is 134 legs, 2,178.0 m of arc and 780 s, and the run reaches
SIZE 7.

**The route is now the validator's dominant cost, and anyone appending to it
should know that before they do.** `tools/validate.mjs` drives it twice for the
determinism check, and the cost per second of route is superlinear in the hole's
own SIZE — the removal disc and the loose-body count both grow with it. Timed in
a quiet process: the first 180 s of route cost 21 s of wall, the next 180 cost
217, and the last stretch cost more again. A longer route is therefore not
proportionally dearer, it is several times dearer, and two more districts of
appended loops would put a full run past what a laptop finishes between edits.
The cheap lever is **time rather than geometry**: the density probe reads gaps
along the route's *arc* and never reads a leg's duration, so tightening the
`until` values on the early low-SIZE legs costs the probe nothing and moves only
the excursion's own eaten and SIZE figures.

**Floors:** determinism across two runs (identical `eatenCount` and `mass` to six
decimal places), `eatenCount ≥ 300`, `size ≥ 4`. The SIZE floor is held to the
same `≥ 4` as every other scene; the ladder's ×10 cap exists precisely so the
largest scenes are not held to a lower standard than the ones they were built to
surpass.

**One thing to watch, and it happened.** `01` §3.5 is explicit that consolidation
reduces bites *per object*, and this section predicted that a 62 s excursion
through a vocabulary-built district could come in under 300 eats where its
brick-built twin cleared it easily. It came in at 289. The fix was the one stated
in advance — more content, not a lower floor: ground-storey clutter down the
mill, at grade, in the two strips either side of the post line that nothing
structural occupies, sitting directly under the route's spine leg. That is the
same instinct behind Brooklyn's declared open ground. We do not narrow a probe to
get it green.

---

## 10. Authoring plan

### 10.1 Where a new builder goes

`STATUS.md` puts the constraint plainly: *"`js/voxelkit.js` is **shared** across
all three built-city sandbox scenes now… Anything Brooklyn-only added there still
does not belong in a shared kit."* The kit is 2,771 lines and ~95 exports, and
the board is already tracking it as a dumping ground.

So this design sorts new builders three ways, and the test goes in the header of
every file it governs so it is checkable rather than remembered:

> A builder belongs in `js/voxelforms.js` if it has no city semantics at all —
> it is a shape, not a thing.
> A builder belongs in `js/voxelkit.js` once a second scene already calls it.
> One caller is not a kit.
> Everything else is Cambridge-local, and graduates later or never.

Every new builder lands in exactly one of the three.

### 10.2 `js/voxelforms.js` — new, shared, and deliberately small

The twelve primitives of `01` §4.1, and nothing beyond them: `slab`, `column`,
`pier`, `beam`, `panel`, `mullion`, `cornice`, `plinth`, `tread`, plus the
`corbelArch`, `drum` and stepped-wedge approximations. Pure geometry over
`sim._block`. No named buildings, no street semantics, no colours.

Eleven of the twelve are in use. **`corbelArch` is not usable as shipped**, and
it is a straight contradiction between two Phase 3 deliverables rather than an
authoring preference: every corbel course trips `probePlacementStep`, because the
"gap" the probe looks for *is* the arch's opening. The primitive has been
imported and never called since Phase 5, and two districts declined it for that
reason. Phase 8 chooses between giving it a step that equals its extent — which
stops the courses being identical boxes — and dropping it from the twelve and
saying so. Either is a change to `js/voxelforms.js`, which re-measures every
district, so neither belongs in a district task.

This is a *lower* layer than `voxelkit.js`: the kit may eventually consume it;
`voxelforms` never imports the kit. **Being a separate file is what stops it
accreting** — the moment a primitive needs to know it is a warehouse, it is in
the wrong file.

Shared, not Cambridge-local, and this is not a contradiction of the rule above:
these are not composites, they are the primitive layer ADR-0013 defines. Every
scene authored after this one uses them, and putting them anywhere else would
mean the second scene has to import from `voxelscene-cambridge.js`, which is
precisely the shape of mistake the rule exists to prevent.

Three properties carried over from the existing kit, because they were learned
the hard way:

1. **One `put()` site per builder.** This is what makes a future primitive change
   a one-line edit per builder rather than an audit of every nested loop, and it
   is worth holding to even when a second site would be convenient.
2. **Emission order is part of the contract.** Block `id` order is block-array
   order, and `_falling` / `_sleepObs` ordering is load-bearing (ADR-0006). Each
   builder fixes its order and documents it.
3. **Extents on the 0.25 m grid, always.** A builder that computes an extent by
   division rounds to `FINE`.

### 10.3 `js/voxelscene-cambridge.js` — Cambridge-local composites

Every composite that knows what it is depicting lives next to the only scene that
uses it, exactly as Boston's scene-local builders do today:

`canalOfficeBlock` · `entryCourt` · `millRange` (the seven-section Davenport) ·
`tripleDecker` · `mercadoRow` (the Cambridge Street storefronts) ·
`elevatedCurvedPlatform` · `greenLineViaduct` · `greenLineCar` ·
`parkingDeck` · `lockGatehouse` · `stataMass` · `saltPepperTower` ·
`invertedYMast` · `steelArchSpan` · `sprocketPanel` · `edgeMark` ·
`labConversion` (1 Canal Park's re-clad skin) · `podiumBlock` (CambridgeSide).

**None of these graduate on day one.** Each has exactly one caller. The two most
likely to graduate later, noted so the seam is deliberate: `parkingDeck` (every
city has one) and `tripleDecker` (Boston's Dorchester and Somerville would want
it). Neither moves until a second scene actually calls it.

### 10.4 What is reused unchanged from `js/voxelkit.js`

Substantial, and worth listing because the cheapest builder is the one that
already exists and is already validated:

- **Infrastructure:** `generateBlockers`, `zebra`, `laneDashes`, `pathRibbon`,
  `vehicleBBox`, `basinRim`, `parkWall`, `fenceRun`.
- **Vehicles:** `sedan`, `bus`, `boxVan`, `bigTruck`, `motorcycle`, `rowBoat`.
- **Props:** `tree`, `treeGrove`, `lampPost`, `bench`, `hydrant`, `mailbox`,
  `trashBin`, `trashBags`, `bollard`, `planter`, `bikeRack`, `cafeTable`,
  `newsBox`, `newsstand`, `hotDogCart`, `sandwichBoard`, `marketStall`,
  `crateStack`, `shippingContainer`, `signPost`, `signText`, `trafficLight`,
  `subwayEntrance`, `waterTower`, `lightMast`, `drinkingFountain`.
- **Structure:** `fireEscape`, `stoop`, `streetWall`, `rowBlock`, `setbackTower`,
  `naveChurch`, `museumBlock`, `scaffoldShed`, `gantryCrane`, `trussViaduct`,
  `grandStair`, `balustrade`, `crenellation`.
- **Landmark reuse, the high-value cases:** **`archBridge`** for North Point
  Park's curving footbridge, **`tieredFountain`** for the canal basin's fountain,
  **`stoneArch`** for the lock channel, **`mosaicDisc`** as the pattern the
  edge-band gallery's marks follow.

That is roughly sixty existing builders doing real work in Cambridge, which is
the strongest available argument that the kit *is* a kit and not just a pile.

**Two kit builders this section proposed do not do what their names say, and the
landmarks that needed them were built another way.** `halfDomeShell` builds a
semi-dome and cannot close a full one, so a landmark needing a whole dome — the
Great Dome, and the salt-and-pepper tower caps — has to compose it. The kit's
`obelisk` is cube-era, costing 1,480 blocks against a 420-block line item, which
is the same stale unit §4 carries, in a shared file. Both live in
`js/voxelkit.js`/`js/voxelforms.js` and both are recorded rather than fixed here,
for the same reason `corbelArch` is: touching those files re-measures every
district. Phase 8's call.

### 10.5 Documentation obligations, same commit

`conventions.md`'s wiki hygiene, discharged in the same commit as the code, not
after:

- `.wiki/modules/voxel.md`'s `covers:` frontmatter gains `js/voxelforms.js` and
  `js/voxelscene-cambridge.js`, and its Scenes section gains a Cambridge entry
  in the shape of the Boston one.
- `AGENTS.md`'s validate-required file list gains both new files.
- `STATUS.md` gets **one line** — it is a lean board, and the narrative goes in
  `CHANGELOG.md`.
- ADR-0013 moves from *proposed* to *accepted* when the owner accepts it. ADRs
  are append-only; supersede, never edit.

---

## 11. The open items this design does not close

Carried forward rather than resolved. `02` marks each of these Unverified or
conflicting, and hardening them here would mean inventing a fact — so they stay
open, with the thing that would close each one written down next to it.

| Item | Where it bites | What closes it |
|---|---|---|
| **HubSpot's exterior signage on 2 Canal Park** | §6.5 — the most-looked-at detail in the scene | One street-level photograph, then one constant |
| **Whether HubSpot still occupies both buildings in 2026** | Whether the Davenport carries any branding | One email, before ship |
| **2 Canal Park: 1987/5-storey vs 1999/4-storey** | ±4 m of building height | Built as 5 on OSM's evidence; conflict recorded in the scene file |
| **40 Thorndike: 20 vs 22 storeys** | ±9 m on the tallest local landmark | Built as 20 per `02`'s recommendation; both numbers recorded |
| **The Davenport's exact block outline and per-section heights** | The ragged-row silhouette, which is the whole character | The seven-section step pattern is a design choice, marked as such, not a measurement |
| **Stata Center height** | Its read on the shelf | Estimated from storey count, recorded as an estimate |
| **The Lechmere Canal channel's extent** | Whether the hero building genuinely fronts water | §1.5's declared inference |
| **How big one bite should feel** (`01` §8) | Bay size everywhere | The owner, by playing. The 4 m bay is this design's proposal, not a finding |
| **Crumble or collapse** (`01` §8) | Bay size again, tuned the other way | Same |

Four more are open for a different reason: they are defects in shared code or in
what this page *declares*, found while building, and each is fixable only by
touching a file that would re-measure districts already verified. They are Phase
8's, and every number they need is already recorded so nobody re-derives them.

| Item | Where it bites | What closes it |
|---|---|---|
| **District 7's rect starts 10.5 m east of its own westernmost geometry** | 1,961 pieces stand in no declared rect, which `probeCellOwnership` cannot see (§4.7) | P8.1 either widens the rect to x[31,107] z[−94,−8] — measured at 4.204/m² against the shipped 3.996 — or declares the verge deliberately unrowed |
| **`corbelArch` and `probePlacementStep` are incompatible as shipped** | One of the twelve primitives is unusable and has never been called (§10.2) | Give the primitive a step equal to its extent, or drop it from the twelve and say so |
| **`halfDomeShell` builds only a semi-dome; the kit's `obelisk` is cube-era** | Whole domes have to be composed; the obelisk costs 1,480 blocks for a 420-block line item (§10.4) | The same Phase 8 pass, in the same two files |
| **The excursion is the validator's dominant cost** | A full run at 780 s of route, driven twice, is past what a laptop finishes between edits (§9.5) | Tightening `until` values on the early low-SIZE legs — the density probe reads arc, never duration, so it costs the probe nothing |

## Related

- `README.md` — the package index
- `00-objective-overview.md` — why this level exists and where it goes
- `01-voxel-primitive-vocabulary.md` — the twelve primitives, the cost model, the
  two-hand rule, the grain rule, the measurement plan
- `02-cambridge-reference.md` — every fact on this page, with its confidence
- `04-easter-eggs-and-achievements.md` — the hidden things this page reserves
  slots for
- `05-build-tasks.md` — the ordered work
- `../../adr/0013-anisotropic-voxel-primitives.md` — the decision
- `../../adr/0006-structural-zone-simulation.md` — the support BFS and the
  determinism proof
- `../../modules/voxel.md` — the shipped model and the ten scene-building rules
- `../../conventions.md` — the chroma rule, palette provenance, wiki hygiene
