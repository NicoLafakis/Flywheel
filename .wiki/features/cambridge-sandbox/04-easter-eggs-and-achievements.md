---
covers:
  - "js/voxelscene-*.js"
---
# Cambridge sandbox — hidden content, ground glyphs and achievements

**Status:** design spec for Phase 7. The engine work it depends on has shipped;
the catalogue itself is not authored yet.
**Date:** 2026-08-06 (reconciled 2026-08-10 — a seventh, unrelated,
not-yet-menu-wired scene file, `js/voxelscene-chicago.js`, matches this page's
`js/voxelscene-*.js` cover glob without being Cambridge; see
`.wiki/modules/voxel.md`).
**Owns:** what is hidden in the Cambridge scene, what is drawn on the ground,
what the player gets for finding it, and how all of that becomes rows rather
than code.
**Does not own:** map extent, districts, spawn, or the placement of the two
HubSpot buildings — those belong to `03-level-design.md`. Everything below is
expressed in **named places** from `02-cambridge-reference.md`, never in map
coordinates, so `03` can move any of it without reopening this page.

> **The product ask, verbatim.** *"Much like the other levels it should be
> chalked full of hidden easter eggs/achievements, coins, and stuff. Maybe some
> familiar symbols and logos created near the edges or something, I don't know,
> get creative with it."*

**Source discipline, kept from `02`.** Every real-world claim below traces to
`02-cambridge-reference.md` and carries its marker. Anything I made up is
labelled **(invented)** — it is flavour built on a real seam, not a fact. Where
a design depends on something the engine does not do today, it says so with a
file and a line, because a delightful idea that silently needs a code change is
how a conference deadline gets eaten.

---

## 0. The one design rule this whole page serves

The audience at UNBOUND is not "players". It is **people who work in the
building being eaten.** That changes what a collectible is worth. A generic
coin says "you explored". A ping-pong room behind a wall that they have
personally played in says *"somebody who made this knew."*

So every item on this page is graded on one axis, and only one:

> **Recognition per unit of work.** How many people in that specific room say
> "no way" divided by how long it takes to build.

Three consequences that shape everything downstream:

1. **Specificity beats scale.** One tofu factory that is genuinely there beats
   ten invented shops. `02` §4 already did the hard part — the seams are real
   and mostly unused.
2. **Reveal beats placement.** A logo sitting in a car park is a decoration. A
   logo that appears *because you ate the thing covering it* is a moment, and
   this game's entire verb is eating things. Every glyph below is checked
   against: "would this be better if it were hidden under something?"
3. **Layered legibility.** Nothing should be all-or-nothing. Design each item so
   a casual player sees *something*, a local sees *the joke*, and an employee
   sees *the detail*. The catalog in §2 uses an explicit obviousness tier for
   exactly this.

---

## 1. Ground-drawn symbols and logos

### 1.1 What "readable from the play camera" actually means

The play camera is not free. It is a chase camera at a fixed pitch, and its
distance is a known function of hole radius (`js/camera.js:997-1012`):

```js
const base = 7 + holeRadius * 3.6;                       // camera.js:1002
const clearDist = (this.maxBlockerH + 8) / Math.sin(this.pitch);   // :1007
```

with `pitch = 0.9` rad (≈ 51.6°, `camera.js:227`) and `fovBase = 50`
(`camera.js:261`). From that, the ground strip the player can actually see —
frame width on the ground ≈ `2 · d · tan(25°) · aspect`, at 16:9 ≈ `1.66 · d`:

| SIZE | hole r | camera dist `d` | visible ground width | a glyph reads at ~35% of width |
|---|---|---|---|---|
| 1 | 1.1 | ~11 m | ~18 m | **6 m** |
| 4 | 2.6 | ~16 m | ~27 m | **9 m** |
| 7 | ~4.1 | ~50 m (ramping) | ~83 m | **29 m** |
| 10 | 5.6 | ~110 m | ~180 m | **63 m** |
| 12 | 7.1 | ~125–145 m (clamped) | ~210–240 m | **75–85 m** |
| intro overview | — | scene-fit, FOV 65 (`camera.js:181`) | the whole map | **edge-band glyphs, any size** |

Numbers derived from the cited lines, not measured in-engine — treat the column
as a sizing ladder, not a specification. The shape of it is what matters and the
shape is not in doubt: **the player's readable frame grows roughly 12× across
the SIZE ladder.**

### 1.2 The edge law — why the big marks belong at the map edges, derived not asserted

Three independent constraints land on the same answer, which is the reason to
trust it:

- **Camera.** A 70 m mark only reads at SIZE 10+ (table above). Below that the
  player is inside one letter of it.
- **Grain.** `01` §3.2's ladder: a ground-anchored piece is only removable once
  the hole radius clears `(a/2 − 0.05) × 1.48865`. A glyph drawn at 4 m cells is
  first eatable at SIZE 4; at 6 m cells, SIZE 7.
- **Route.** The player reaches the map edge last, at high SIZE, by construction.

So: **big, coarse-celled glyphs at the edges; small, fine-celled glyphs in the
centre.** The owner's instinct — *"familiar symbols and logos created near the
edges"* — is not just a nice idea, it is the only place the engine will let a
big one work. Say that back to him as a compliment, because it is one.

**The glyph grain rule.** A glyph of span `S` drawn on an `N × N` raster
has cells of `S / N`. `01` §4.2 clause 1 caps a ground piece's plan diagonal at
8 m, and `01` §3.2 puts the permanent-scenery cliff at 9.7 m. So:

```
cell ≤ 5.6 m   →   N ≥ S / 5.6
```

A 64 m sprocket needs **at least a 12 × 12 raster** or it is a monument nobody
can ever eat. A 96 m edge mark needs 18 × 18. This is a validator probe waiting
to happen and it is already gate 4 in `01` §7.5 — glyphs are just the case that
will trip it first.

**Rooftop glyphs are exempt** from the grade clause (`gy > 0`; they fail by
losing support, not by the corner test), so a roof mark may run coarser — but
`01` §3.3's one-bite hazard still applies, so keep a roof glyph at ≥ 20 pieces
or it vanishes in one swallow and reads as a bug.

### 1.3 The glyph catalog

Cost is **ink cells** — one piece per inked raster cell, `01`'s `slab` primitive
at 0.25 m thickness. A glyph is paint, not a plinth: it replaces a surface, not
an interior, which is `01`'s *skin, not fill* guidance in its simplest form.

#### G1 · The Sprocket That Becomes The Mark — **hero**

- **What.** HubSpot's sprocket, drawn full-width across the top deck of the
  **First Street Garage** (`02` §2.4: *"a big blank-walled parking deck"*,
  123 × 75 m, WSW of the hero building — the largest unbroken flat surface in
  the neighbourhood and currently the least interesting object in it).
- **The move.** The sprocket is drawn **with a solid centre**. Eat the centre
  out — nothing else — and what is left is **twelve teeth around a hole**: the
  Flywheel sprocket mark, which the glossary defines as *"a portrait of the
  protagonist"*, 12 teeth, empty centre. The game's tagline is *"A sprocket's
  story"*. The player performs the tagline.
- **Size.** ~64 m across on the 123 × 75 m deck. Roof, so exempt from the grade
  clause; use a 20 × 20 raster (3.2 m cells) so it also eats legibly.
- **Cost.** ~150–190 pieces (annulus + teeth ink at ~45% coverage) plus ~36 for
  the removable centre disc.
- **Eatable?** Yes, and being eatable in a *specific order* is the whole point.
- **Reward.** Achievement **A68 "A Sprocket's Story"** (secret, Main Event) fires
  only if the centre is gone and ≥ 90% of the teeth ring survives. Also a
  camera beat: `fovKick` (`camera.js:423`) on completion.
- **Rights.** HubSpot's own mark, shown to HubSpot, at their invitation. Fine.
  Get the current brand asset; do not redraw by eye (`02` §7).

#### G2 · Partner Alley — **hero, and nearly free**

- **What.** The marks of the shipped partner skins — Supered, New Breed, Impulse
  Creative, Six & Flow, Kuno Creative, Salted Stone, Media Junction, Huble
  (`js/skins.js:522-558`) — laid as a row of large flat marks along the
  **Cambridge Parkway river frontage** and the **North Point** rail-yard
  container stacks, reading from the water side.
- **Why it is the best ratio on this page.** The art already exists in the repo,
  the rights conversation already happened, and `tools/gen-partner-logo.mjs`
  turns "one more partner signed at the show" into one command. A partner walks
  past the booth, sees their own logo painted on a shipping container in a game
  about eating Cambridge, and photographs it. That is the entire marketing
  function of a conference build, delivered by content that is already sitting
  in `SKINS`.
- **Size.** ~24 m per mark, 8 marks, ~40 m apart along the shore band.
- **Raster.** 8 × 8 to 12 × 12 depending on mark complexity; 24 m / 8 = 3 m
  cells, inside the grain law with room.
- **Cost.** ~40–70 pieces each, **~400 total**.
- **Eatable?** Yes. Eating your own agency's logo is a better feature than not.
- **Reward.** **A91 "Partner Alley"** (find them all) and **A92 "Represent,
  Locally"** — a *secret* that fires when the player eats the mark matching the
  partner skin they are currently wearing. `js/skins.js` already knows which
  skin is equipped; this is a one-line comparison and it is the best individual
  moment in the level for the partner audience.
- **Rights.** Established practice — these partners are already in the shop.
  Same consent path, no new question. **New** partners added at the show go
  through `gen-partner-logo.mjs` exactly as they do for a skin.
- **Extensibility (the forward move).** Author Partner Alley as a **slot list**,
  not eight hardcoded glyphs: `n` evenly-spaced pads along the shore band, each
  filled from `SKINS`' partner rows at build time. Then a partner signed on day
  two of UNBOUND appears in the level as a data edit, exactly as they appear in
  the shop. This is the same "content not code" property `06` §7 argues for
  belts, applied to geometry.

#### G3 · The Ghost Sprocket under 1 Canal Park — **the deepest cut**

- **What.** `02` §0 is emphatic that **1 Canal Park is a trap**: HubSpot was in
  it, HubSpot left in 2021, it is a life-science building now, and *"the people
  who moved out of it will be the first to notice."* So do not label it HubSpot
  — instead, put a **faded sprocket ghost on the old brick underneath the new
  lab cladding.** Eat the west facade panels and the mark someone painted over
  is still there.
- **Where.** The west elevation of 1 Canal Park, facing the hero building.
- **Size.** ~14 m, wall-mounted, revealed only by removing the `panel` skin in
  front of it (`01` §4.1 — a panel and a mullion are a load path, so this is
  authored, not faked: kill the mullion and the panels drop).
- **Cost.** ~60 pieces of ghost + the cladding that hides it, which the building
  needs anyway.
- **Reward.** **A67 "Wrong Canal Park"** (secret, Midcard).
- **Colour key.** `03` §6.4/§9.4's `probeHeroIdentity` flags any HubSpot-orange
  block inside `CAMBRIDGE_NOT_HERO_AABB`, which is exactly where this egg lives.
  So the ghost gets its own `HERO_SIGNAGE_GHOST` constant — a desaturated,
  weathered version of the live orange rather than the live orange itself. That
  also happens to be the right look: a painted-over mark should not match the
  paint on the building across the water. Authoring it from its own constant
  (never importing `HERO_SIGNAGE`'s) means the probe passes by construction.
- **Rights.** HubSpot's own mark on a building HubSpot demonstrably occupied
  (`02` §0, Confirmed). It reads as fondness for a former office, which is what
  it is. **One check:** the current owner's building is being depicted with a
  former tenant's mark under its skin. Low risk, worth one deliberate look — the
  mitigation is that the mark is *painted over*, i.e. explicitly historical.

#### G4 · The Founders' Line

- **What.** HubSpot's own lease announcement calls Cambridge *"our home since
  Brian and Dharmesh founded the company out of MIT"* (`02` §4, Confirmed). `02`
  then makes the geometric observation that does all the work: **that sentence
  is 1.8 km long, from Killian Court to 2 Canal Park.** Draw it. A faint dashed
  line in the ground plane, one dash per ~12 m, running the whole diagonal.
- **How it reads.** From the play camera it is a stripe on the road that keeps
  turning up. From the intro overview it is a single line connecting two
  buildings, and the penny drops.
- **Cost.** ~150 dashes, 1 piece each, laid into road surfaces already being
  built. Effectively free.
- **Reward.** **A80 "Out of MIT"** — drive it end to end in one run, Killian
  Court to Two Canal Park. Legend, visible. This is the marquee achievement of
  the level because it is the company's own sentence turned into a route.
- **Rights.** Quoting HubSpot's own public copy back at HubSpot. Fine.

#### G5 · "UNBOUND" on Killian Court

- **What.** Eight block letters laid across the Killian Court lawn (`02` §6 #23,
  ~180 × 130 m). Letters ~16 m tall, word ~120 m wide. Readable only from the
  intro overview or from high SIZE.
- **Why it is period-correct.** MIT's own alumni association runs a hack gallery
  and a hack tournament (`02` §7). A giant word on the Institute's front lawn is
  participating in a tradition MIT publicly celebrates, not defacing anything.
- **Raster.** 8 letters × a 5 × 7 cell grid at 3.2 m cells. ~180 ink pieces.
- **Eatable?** Yes, and it should be — mowing a letter off is funny.
- **Event scoping.** If the level ships beyond the conference, this is the one
  glyph that should be swappable by data (see §3.5 on event-scoped content). A
  `FLYWHEEL` variant is the same raster.
- **Rights.** MIT hacks: fine (`02` §7). "UNBOUND" is HubSpot's own event name.

#### G6 · The Southbound Platform anamorph

- **What.** A glyph whose cells are **stretched along the view axis** so that it
  only resolves from one specific vantage: the **Lechmere station platform**
  looking south (`02` §2.3 — a real elevated curved island platform, 108 m long,
  127 m due north of the hero building, and the single most-used vantage point
  in the lives of the audience). From anywhere else it is a smear of orange
  paint across the canal-side plaza. From the platform it snaps into the
  sprocket.
- **Why it belongs here specifically.** Everyone in that building has stood on
  that platform. Nobody has ever looked south from it and seen anything.
- **Size.** ~50 m of ground, resolving to a ~20 m apparent mark.
- **Cost.** ~120 pieces. Authoring is a projection, done once in the scene
  builder — pure geometry, no engine change.
- **Reward.** **A90 "Southbound Platform"** (Legend, secret). Fires on the
  camera pose, not on eating: the player has to *stand there*.
- **Risk, stated.** The chase camera's pitch is fixed and its yaw is player-led,
  so the resolving pose is reachable but not guaranteed to be comfortable.
  Prototype this one before committing to it; if the pose fights the camera,
  demote it to a rooftop mark that resolves from the platform's *height* rather
  than a single point.

#### G7 · The NECCO reveal

- **What.** `02` §4 hands this over complete: the old NECCO factory's rooftop
  water tower *"once painted as a roll of candy wafers, now carrying a DNA
  double helix."* Build the helix. **Under it, on the drum, is the wafer roll.**
  Eat the helix and Kendall Square's whole history changes hands in one bite.
- **Cost.** Helix ~40 pieces (a twisted pair of `drum` facets, `01` §4.1); the
  wafer roll is paint on the drum beneath, ~0 extra.
- **Reward.** **A79 "Sweet Then, Sweeter Now"** (Main Event, secret).
- **Placement.** 2,054 m WSW, so this one depended on `03`'s map extent. `03`
  §1.3 and §5.1 put the NECCO water tower in scope, in Ring B at scene
  (−120, +83), around 340 blocks. It stays an egg.
- **Rights.** Novartis owns the building now; the water tower's paint is a
  public landmark. Build the tower and the helix, **no Novartis wordmark**
  (`02` §7).

#### G8 · The Spreadsheet — 161 First Street

- **What.** Lotus Development was at **161 First Street** (`02` §4, Confirmed) —
  *"the spreadsheet industry started on First Street"*, the same street as
  HubSpot, ~400 m north. Draw a **grid of cells** into the plaza in front of it,
  ~20 × 14 cells, with **one cell highlighted** and a fat selection border. No
  wordmark, no product name.
- **Why it lands.** It is a shape that every person in a revenue-operations
  audience has looked at for ten thousand hours, laid into the ground at the
  address where it was invented, four hundred metres from their desk.
- **Size.** ~40 × 28 m at 2 m cells. ~280 pieces (mostly grid lines — author as
  long thin `slab` runs, not cell-by-cell, and it drops to ~40).
- **Reward.** **A77 "Recalculate"** — eat exactly the highlighted cell. Midcard,
  secret.
- **Rights.** A grid is not a trademark. IBM/Lotus wordmarks: **do not**
  (`02` §7). The abstraction is not a compromise here, it is funnier.

#### G9 · The Ghost of the Food Court

- **What.** `02` §2.6 makes the point that two memories of CambridgeSide are in
  the room at UNBOUND — the mall, and the lab buildings. Depict the buildings as
  they are now, and paint the **old atrium fountain's circular footprint** on the
  new lab roof, with the radial paving pattern around it.
- **Size.** ~30 m circle on a roof. ~90 pieces.
- **Reward.** Counts toward the discovery mask; no dedicated achievement (the
  catalog does not need one per item — see §3.4).
- **Rights.** A paving pattern. Fine. No mall branding, no tenant names.

#### G10 · The Canal Flywheel

- **What.** Three concentric arcs in the **Lechmere Canal Park** lawn (`02`
  §2.5), planted as hedge and path — the flywheel's three-stage loop, resolving
  only from above.
- **Size.** ~40 m outer diameter. ~110 pieces at 3 m cells.
- **Reward.** Discovery mask.
- **Rights.** HubSpot's own model, in HubSpot's own park frontage. Fine.

#### G11 · The Edge Band gallery

`03` owns the map extent; whatever it is, reserve the **outer ~10%** as an edge
band — water, rail yard, highway interchange, mudflat. It is the least
architecturally load-bearing ground on the map, it is what the intro overview
frames, and per §1.2 it is exactly where coarse glyphs are legal and legible.
Fill it with:

| Mark | Where in the band | Span | Cells | Pieces | Eatable |
|---|---|---|---|---|---|
| The Flywheel sprocket, huge | Inner Belt rail yard, north (`02` §2.3 names the Capuano carhouse there) | ~90 m | 5 m | ~230 | yes |
| Partner Alley (G2) | river frontage / North Point containers | 8 × 24 m | 3 m | ~400 | yes |
| "UNBOUND" (G5) | Killian Court, SW corner of the map | 120 m | 3.2 m | ~180 | yes |
| A rowing-eight wake pattern | Charles surface, south edge | ~70 m | 5 m | ~50 | scenery |
| The rotated grid, drawn once as a compass rose with the real 9.8° bearing on it (`02` §2.1) | NE corner mudflat | ~50 m | 4 m | ~70 | yes |

Roughly **930 pieces** for the whole gallery — a rounding error against a scene
of tens of thousands, and a good use of the room the anisotropic primitives
opened up. This is exactly the sort of content the consolidated floor plates
paid for.

`03` §8.3 describes the same five items, including the rowing-eight wake's
scenery (non-eatable) status. HubSpot's sprocket (G1) is not part of the edge
band — it sits on the First Street Garage roof in District 5 (`03` §4.5) — so
all five gallery slots here are filled by Flywheel's own mark and the four items
above. District 10 carries the gallery at ~1,210 pieces.

### 1.4 Glyph budget rollup

| Group | Pieces |
|---|---|
| G1 sprocket + centre | ~200 |
| G2 Partner Alley | ~400 |
| G3 ghost sprocket | ~60 |
| G4 Founders' Line | ~150 |
| G5 UNBOUND | ~180 |
| G6 anamorph | ~120 |
| G7 NECCO helix | ~40 |
| G8 spreadsheet | ~40 (as runs) |
| G9 food court | ~90 |
| G10 canal flywheel | ~110 |
| G11 remainder of the edge band | ~350 |
| **Total** | **~1,740** |

Two to four percent of the scene. Everything in §2 adds roughly the same again.

---

## 2. The easter-egg catalog

### 2.1 The obviousness tiers

| Tier | Name | Means |
|---|---|---|
| **T0** | *On the route* | You will see it playing normally. It is texture, not treasure. |
| **T1** | *One turn off* | Visible from the main route; requires one deliberate detour. |
| **T2** | *Under something* | Requires eating a specific thing to expose it. |
| **T3** | *Told about it* | Nobody finds this alone. It exists to be shared — a Slack message from a colleague is the intended discovery mechanism. |

A healthy distribution for a level this size: roughly **40% T0, 30% T1, 20% T2,
10% T3**. `06` §6 uses ~20% secret achievements for the same reason — enough
floor under the room that it feels deep, few enough that the list still reads as
a to-do list.

### 2.2 East Cambridge, the Portuguese seam

`02` §4 calls this *"the most under-used, most genuinely local seam in the whole
map"* and it is right. All Confirmed unless noted.

| # | Egg | Where | How you meet it | Tier |
|---|---|---|---|---|
| E1 | A fish market: a fish on the awning, crates on ice out front, no name on the sign | Cambridge Street, west of Lechmere | On the route | T0 |
| E2 | A bakery with a tray of custard tarts in the window; the tray glints like a golden prop | next door to E1 | On the route | T0 |
| E3 | The **Costa Lopez Park** and **Silva Park** signs, legible | both real, ~300 m out (`02` §2.5) | Reading them is the egg | T1 |
| E4 | A *galo de Barcelos* rooster on the bakery counter, visible once the shopfront goes **(invented flavour, real symbol)** | inside E2 | T2 | T2 |
| E5 | Bunting in Portuguese-flag colours across a side street **(invented flavour)** | between Otis and Thorndike | On the route | T0 |
| E6 | **St. Anthony's Church** — depicted, respectfully, and **deliberately holding no egg at all** | Cambridge Street | It is the absence that is the design | — |

E6 is listed on purpose. `02` §7 says active places of worship are depict-or-
skip, never a set-piece beat. Writing the non-egg down is how it survives a
later pass by someone who did not read `02`.

### 2.3 The First Street tech corridor

| # | Egg | Where | How you meet it | Tier |
|---|---|---|---|---|
| E7 | The spreadsheet plaza (G8) | 161 First Street | On the route north | T1 |
| E8 | A pallet of 5.25" floppies on 161 First Street's loading dock | behind E7 | Eat the dock door | T2 |
| E9 | A **DSKY** keypad — the Apollo guidance computer's faceplate, a grid of keys and a small green display — painted into a parking lot. Draper built the AGC (`02` §4, Confirmed) | Kendall/Tech Square end of the map | T2 | T2 |
| E10 | **`1202`** on the DSKY's display — the Apollo 11 program alarm | on E9 | T3 | T3 |
| E11 | The NECCO wafer roll under the DNA helix (G7) | old NECCO / Novartis | Eat the helix | T2 |
| E12 | A plain 1980s warehouse with a hand-lettered sign, standing among lab towers — biotech's actual origin (`02` §4: Biogen into a Binney Street warehouse, 1983) | Binney Street | T3 | T3 |

E9/E10's *placement* is invented; Draper's connection to the AGC and its
Tech Square move are Confirmed in `02` §4, but `02` gives no Draper offset.
Flag to `03`.

### 2.4 MIT and the hacks

`02` §4 does the sourcing here and the design read is already written into it:
*"A single object sitting on the Great Dome is a free easter egg with enormous
local recognition, and the tradition means almost any object is period-correct."*
So layer them.

| # | Egg | Detail | Tier |
|---|---|---|---|
| E13 | **The campus police cruiser on the Great Dome** — flashing lights, dummy officer, box of donuts, parking ticket, plate reading **IHTFP**. Every one of those details is Confirmed (`02` §4, 1994 hack) | the canonical hack | T1 |
| E14 | **The fire truck, under the cruiser.** Eat the cruiser and the next hack in the tradition is already there | layered | T2 |
| E15 | And under *that*, the half-scale **Apollo Lunar Module** | third layer | T3 |
| E16 | A **piano** at the foot of Baker House with a piano-shaped dent in the lawn (the annual piano drop) | one turn off | T2 |
| E17 | The **Caltech cannon** standing outside the Green Building | T3 | T3 |
| E18 | A **plastic cow**, unexplained, somewhere on campus | T3 | T3 |
| E19 | The Green Building's rooftop **radar dome** (`02` §6 #21) rolls when eaten | physics gag | T1 |
| E20 | A **Red Line car on the Great Dome** (a real hack) *and* a Red Line train on the Longfellow (real transit). Seeing both in one run is the joke | two places | T2 |

Three stacked hacks on one dome (E13→E14→E15) is the single best
destruction-reveal in the level after G1, and it costs one extra prop per layer.

### 2.5 Transit, water, weather

| # | Egg | Detail | Tier |
|---|---|---|---|
| E21 | A **green-and-white Green Line trolley** on the Lechmere viaduct, running a loop | `02` §2.3, 127 m from the hero building | T0 |
| E22 | Its destination board flips **LECHMERE → NOT IN SERVICE** on a timer | universal Boston joke **(invented detail, real board)** | T1 |
| E23 | **Duck Boats** rolling down the ramp into the river at the Museum of Science (`02` §4, Confirmed departure point) | amphibious, on a loop | T0 |
| E24 | **Canada geese** on the Cambridge Parkway and North Point lawns; they scatter and honk as the hole nears (`02` §4: *"Nobody will fact-check a goose."*) | flock behaviour | T0 |
| E25 | **One goose does not move.** Ever. For anything | T3 | T3 |
| E26 | Rowing eights on the water; a scatter of **sailing dinghies placed correctly *south* of the Longfellow**, per `02` §4's correction — with exactly **one** dinghy up here on the wrong side | the misplaced boat is the egg for people who sail | T3 |
| E27 | **Discarded coffee cups**, orange-and-pink, no wordmark, at a slightly absurd density. `02` §7: *"for Dunkin' specifically the joke is the density, not any one store"* | count them | T0 / T1 |
| E28 | A **lawn chair holding a shovelled parking space** **(invented; real and beloved Boston custom, not sourced in `02`)** | side street | T1 |
| E29 | **Cambridgehenge** — at the equinox lighting preset the sun runs straight down Cambridge, Otis and Thorndike (`02` §4, Likely, derived from the measured 99.7° bearing) | a light, not an object | T1 |

### 2.6 The neighbourhood's own oddities

| # | Egg | Detail | Tier |
|---|---|---|---|
| E30 | **A single perfect white cube on the roof of the tofu factory.** `02` §2.4: *"Chang Shing Tofu Factory. Genuinely there. Genuinely a tofu factory."* A voxel game whose most on-brand object is a literal block of tofu | T1 | T1 |
| E31 | **Glassworks Avenue's street sign**, plus a pile of glass cullet at its kerb (`02` §4, real street) | T1 | T1 |
| E32 | The **Glass Factory** condos with a ghost furnace chimney on the roof (`02` §2.4, the name is a genuine glassworks reference) | T2 | T2 |
| E33 | The **East Cambridge Savings Bank**'s time-and-temperature clock, running the real in-game clock **(invented detail, real building — 2 storeys, `02` §2.4)** | T1 | T1 |
| E34 | The **Charles River locks**: the gates cycle, slowly, forever, with nothing in them (`02` §2.2, two real gatehouses) | T1 | T1 |
| E35 | **40 Thorndike**: built accurately, carrying **no egg and no joke.** `02` §7: *"It was a jail… Build the building; skip the jokes about it."* | the second deliberate non-egg | — |

### 2.7 HubSpot-specific — the ones the room is actually here for

This is the highest-value block on the page and it needed no invention at all.
`02` §1.1 lists, **Confirmed from HubSpot's own announcement**, what is inside
2 Canal Park: *event space with bleacher seating, industrial kitchen, ping-pong
room, indoor beer garden, private outdoor patio, barista café.*

| # | Egg | Detail | Tier |
|---|---|---|---|
| E36 | **The Cutaway.** Each of those six rooms is authored as an interior set piece behind the facade. Take a wall off and you are looking into your own office | T2, six times over | T2 |
| E37 | Ping-pong **balls** as loose debris the moment that room opens — dozens of them, bouncing | T2 | T2 |
| E38 | The **bleachers** face a small stage. Empty. Waiting | T2 | T2 |
| E39 | A **davenport sofa** in the lobby of the Davenport — the building is the birthplace of the davenport sofa (`02` §1.2, Confirmed, National Register) | T2 | T2 |
| E40 | And a **giant davenport on the Davenport's roof**, visible from above, unexplained | T1 | T1 |
| E41 | One covered parking space marked with a sprocket, permanently empty (`02` §1.1: covered on-site parking, Confirmed) | T2 | T2 |
| E42 | The **glass-and-steel entry court** punched into the canal-facing side (`02` §1.1, the facade description is Confirmed verbatim across listings) carries the sprocket in its floor — invisible from outside until the roof goes | T2 | T2 |
| E43 | An **orange front door**, the only saturated warm object for two blocks. `02` §5.1: the district is *"red brick and grey water"* with almost no chroma outside transit and the Stata Center | T0 | T0 |
| E44 | The **five-storey brick slab sitting in a bowl between three 20-plus-storey towers** (`02` §2.4's *"reading of the skyline"*) is itself the joke — and the level should not "fix" it by making the hero building taller | — | — |

E44 is a third deliberate non-egg, and the most important one: the temptation to
heroize the hero building is real and `02` explains exactly why the honest
silhouette is better.

### 2.8 Egg budget

~44 items. Most are one prop (2–30 pieces); the Cutaway (E36–E38) is the
expensive one at ~600–900 pieces of interior. Call the whole catalog
**~1,500–1,800 pieces**, i.e. about the same again as the glyphs. Combined with
§1.4 that is **~3,500 pieces**, a few percent of the scene.

Most of that rides free: small props sitting on buildings `03` already accounts
for. Six items do not — the Cutaway and five glyphs (G1, G2, G5, G6, G9+G10,
~1,850 pieces between them) sit on ground or roof with no existing line item to
absorb them, and another ~210 belongs to the edge-band gallery (`03` §8.3). So
the eggs and glyphs carry roughly **2,060 pieces** of content of their own, which
`03` §4 shows as a glyph/egg reserve row on each affected district. The other
~1,650 pieces of this catalogue come along with geometry that is being built
anyway.

---

## 3. Achievements

### 3.1 How these plug into the existing system

`06-belts-and-achievements.md` §7 is unambiguous: *"a new belt or a new
achievement is a row, not a deploy."* Three layers — a **metrics registry**
(code), **definition rows** (data), and **one pure evaluator** (`js/meta/rules.js`)
run identically in browser, server and `tools/validate.mjs`. Predicates use only
`>=`, `<=`, `==`, `in`, `bitmask_all`, and the `all` / `any` combinators.

**The one architectural decision this page makes, and it is load-bearing.**

Naively, forty easter eggs means forty new metrics, which is forty schema bumps
and forty sim edits — the exact thing `06` §7 warns about (*"the ones that are
not free are the ones asking the game to measure something it has never
measured"*). There is a much cheaper shape available. Add **one** field to the
registry:

```
discoveries       // per-scene bitmask of named discovery IDs, 128 bits
```

Every named egg, glyph and reveal in §1 and §2 registers one bit at scene-build
time. The sim sets the bit when the discovery condition fires. `06` already
lists `bitmask_all` as a supported operator, so **every single achievement below
is then a data row over an existing metric**, and adding egg number forty-five
during the conference is an insert — same property `06` §7 promises for belts.

Two smaller consequences worth designing for now rather than later:

- **The bit registry is scene-scoped and versioned.** `discovery_defs` maps
  `(city, bit) → name`, owned as content. Bit indices are **append-only** — a
  reused bit index silently retroactively grants somebody else's achievement.
  This is `AGENTS.md` invariant 6's discipline applied to a new table.
- **`tools/validate.mjs` gains a probe**: every bit referenced by a predicate
  exists in `discovery_defs`, every bit in `discovery_defs` is actually set by
  some code path in its scene, and no achievement is unreachable. `06` §7
  already asks the validator to assert exactly this for the belt catalog.

One further field, and it pays for four achievements below rather than one:

```
route_mask        // districts entered during the run, per-scene bitmask
```

Same shape, same operator, and it is the metric `01` §7.5 gate 6 (the combo
dead-zone probe) is already going to want.

### 3.2 An existing achievement this breaks — flagging it, not silently living with it

`06` §6.5 #35 **"Road Warriors" — *complete all five city goals*.** Cambridge is
the sixth city. Shipping it silently turns a Main Event achievement into a
statement that is no longer true, and anyone holding it now holds it for a
smaller feat than the name implies.

Two clean options; **recommendation is (b)**:

- (a) Re-scope #35 to six cities. Cheap, but it retroactively un-earns nothing
  and quietly moves a goalpost, which is the sort of thing players notice and
  resent — the same instinct `06` §5.4 uses to reject score decay.
- (b) **Leave #35 at five, and mint a new one** — see A59 below. Additive, no
  rewriting, and it gives Cambridge a headline city achievement of its own.

The same check applies to **#39 "Coin Purse" — all 60 coins in a single city.**
See §4.3: on a 2.5 km map that is a materially harder achievement than it is in
Brooklyn, and it should be either accepted deliberately or handled by coin
placement.

### 3.3 The catalog

Numbering continues from `06`'s 58. Card positions are `06`'s four:
**Opener → Midcard → Main Event → Legend.**

**Arriving in Cambridge**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 59 | **Home Sweet Home** | Complete Cambridge's goal. *(The name is HubSpot's own lease-renewal headline — `02` sources.)* | Opener | Visible |
| 60 | **The Whole Map** | Complete all six city goals. *(Supersedes nothing; `06` #35 stays at five.)* | Main Event | Visible |
| 61 | **Local Stop** | Eat a Green Line trolley on the Lechmere viaduct. | Opener | Visible |
| 62 | **Not In Service** | Eat the trolley in the second after its board flips. | Opener | **Secret** |
| 63 | **Regular, Milk, Two Sugars** | Collect twelve discarded coffee cups in one run. | Opener | **Secret** |

**The two buildings**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 64 | **Two Canal Park** | Clear the hero building to nothing. | Midcard | Visible |
| 65 | **The Whole Campus** | Clear both HubSpot buildings in a single run. | Main Event | Visible |
| 66 | **The Cutaway** | Open all six of Two Canal Park's rooms in one run — bleachers, kitchen, ping-pong, beer garden, patio, café. | Main Event | Visible |
| 67 | **Wrong Canal Park** | Uncover the ghost sprocket under 1 Canal Park's cladding. | Midcard | **Secret** |
| 68 | **A Sprocket's Story** | Eat the centre out of the garage-roof sprocket and leave the teeth standing. | Main Event | **Secret** |
| 69 | **Sit Down, You're Home** | Find the davenport on the Davenport. | Midcard | **Secret** |
| 70 | **Reserved** | Eat the one parking space with a sprocket painted on it. | Opener | **Secret** |

**The neighbourhood**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 71 | **Firm, Not Silken** | Eat the tofu factory's rooftop cube. | Midcard | **Secret** |
| 72 | **Bom Dia** | Visit the fish market, the bakery, and both Portuguese-named parks in one run. | Midcard | Visible |
| 73 | **The Oldest Trade** | Eat the fish market and the bakery within fifteen seconds of each other. | Midcard | **Secret** |
| 74 | **Space Saver** | Eat the lawn chair. | Opener | **Secret** |
| 75 | **Cambridgehenge** | Be aligned to the grid axis on Cambridge, Otis or Thorndike Street at the equinox preset's sun moment. | Legend | **Secret** |
| 76 | **Glassworks** | Find every glass-industry reference in the map. | Midcard | Visible |

**Tech history**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 77 | **Recalculate** | Eat the highlighted cell of the 161 First Street spreadsheet, and only that cell. | Midcard | **Secret** |
| 78 | **Program Alarm** | Find the DSKY. | Main Event | **Secret** |
| 79 | **Sweet Then, Sweeter Now** | Eat the DNA helix off the NECCO tower and expose the wafer roll. | Main Event | **Secret** |
| 80 | **Out of MIT** | Drive the Founders' Line end to end — Killian Court to Two Canal Park — in one unbroken run. | Legend | Visible |

**The hacks**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 81 | **Hacked** | Eat the police cruiser off the Great Dome. | Midcard | Visible |
| 82 | **Layer Two** | Eat the cruiser and find what is under it. | Main Event | **Secret** |
| 83 | **All The Way Down** | Reach the third hack on the Dome. | Legend | **Secret** |
| 84 | **IHTFP** | Eat the cruiser's licence plate without eating the cruiser. | Legend | **Secret** |

**Water and season**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 85 | **Amphibious** | Eat a Duck Boat mid-ramp, half in the water. | Midcard | **Secret** |
| 86 | **Gaggle** | Scatter twenty geese in one run. | Opener | Visible |
| 87 | **The One Goose** | Eat the goose that never moves. | Legend | **Secret** |
| 88 | **Salt and Pepper** | Eat all four Longfellow towers in one run. | Midcard | Visible |

**The glyphs**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 89 | **Sightseer** | Resolve any three edge-band glyphs. | Midcard | Visible |
| 90 | **Southbound Platform** | See the anamorph resolve from the Lechmere platform. | Legend | **Secret** |
| 91 | **Partner Alley** | Find every partner mark on the river frontage. | Main Event | Visible |
| 92 | **Represent, Locally** | Eat the partner mark matching the partner skin you are wearing. | Main Event | **Secret** |

**The show — UNBOUND-scoped**

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 93 | **In the Building** | Play a Cambridge run tagged to UNBOUND. | Opener | Visible *(during the event)* |
| 94 | **Home Field** | Take the Cambridge Sprint Strap during UNBOUND. | Main Event | Visible *(during the event)* |
| 95 | **The Deep Cut** | Find twenty Cambridge discoveries in a single run. | Legend | Visible |
| 96 | **Every Last One** | Find every Cambridge discovery across your career. | Legend | Visible |

**38 achievements, numbers 59–96, 20 of them secret** — 53%, deliberately higher
than `06`'s ~20% baseline, because this is a *discovery* level and the secret
ratio is the level's entire pitch. The tables above are the source of truth for
that count. If 53% reads too high against the rest of the catalogue, flipping
63, 70, 74 and 85 to Visible lands it at 16/38, 42%.

Two are event-scoped (93, 94), which fits `06` §3's model exactly: event scoping
is recorded on the run at submission and immutable afterwards, so 93 and 94
simply carry `{ "metric": "event_tag", "op": "==", "value": "unbound" }`. No new
mechanism.

### 3.4 Worked predicates

Six representative rows, in `06` §7's exact JSON shape. Bit indices are
illustrative.

```json
// 59 Home Sweet Home
{ "all": [ { "metric": "city",           "op": "==", "value": "cambridge" },
           { "metric": "clear_fraction", "op": ">=", "value": 0.5 } ] }

// 66 The Cutaway — six interior rooms, one bitmask test
{ "all": [ { "metric": "city",        "op": "==",          "value": "cambridge" },
           { "metric": "discoveries", "op": "bitmask_all", "value": "0x00000FC0" } ] }

// 68 A Sprocket's Story — the reveal is its own bit, set by the scene
{ "all": [ { "metric": "city",        "op": "==",          "value": "cambridge" },
           { "metric": "discoveries", "op": "bitmask_all", "value": "0x00000004" } ] }

// 80 Out of MIT — both endpoints plus every district on the line
{ "all": [ { "metric": "city",       "op": "==",          "value": "cambridge" },
           { "metric": "route_mask", "op": "bitmask_all", "value": "0x000001FF" } ] }

// 92 Represent, Locally — one bit, set by the sim comparing equipped skin to mark id
{ "all": [ { "metric": "city",        "op": "==",          "value": "cambridge" },
           { "metric": "discoveries", "op": "bitmask_all", "value": "0x00080000" } ] }

// 94 Home Field — event-scoped, no new mechanism
{ "all": [ { "metric": "city",      "op": "==", "value": "cambridge" },
           { "metric": "event_tag", "op": "==", "value": "unbound" },
           { "metric": "belt_taken","op": "in", "value": ["sprint_strap_cambridge"] } ] }
```

Note that 94 is the **only** row in the whole catalog that wants a metric the
registry does not have (`belt_taken`). Everything else is `city`, `event_tag`,
`clear_fraction`, plus the two new masks. That ratio — one genuinely new metric
across 38 achievements — is the payoff of the bitmask decision in §3.1, and it
is the number to quote if anyone proposes doing it egg-by-egg instead.

### 3.5 Does Cambridge get its own belt?

**No. Cambridge feeds the existing per-city Sprint Strap, and mints no new belt
type.** Stated plainly because the ask asked plainly.

The reasoning is `06`'s own, applied honestly:

- **`06` §2.2 already makes the Sprint Strap city-scoped by nature** — *"Brooklyn
  and Boston are not the same race and pretending they are would make the belt
  meaningless."* Cambridge is a fifth race. Adding it costs one row, no design.
  Live belt count goes from 12 to 13.
- **`06` §3 sets the scarcity argument and it is the right one:** *"A belt is
  valuable in exact proportion to how few of them exist and how many people are
  chasing each one."* Twelve was chosen so *"a person walking past can read the
  whole board in ten seconds."* Thirteen still reads. Fourteen with a
  Cambridge-branded novelty title starts to sprawl, and it sprawls in the worst
  direction — a title that exists because a city is special rather than because a
  metric is.
- **`06` §7's validator rule forbids the obvious version anyway:** *"no two belts
  at one scope share a metric-and-direction."* A "Cambridge Championship" over
  peak SIZE at city scope collides head-on with the city Heavyweight. Any
  Cambridge belt would have to invent a metric to be legal.
- **Cambridge already gets four belts' worth of contest without a new type**:
  the city Sprint Strap, the city Heavyweight, the city Two-Minute, the city
  Chain. That is a full local card.

**The one belt worth arguing about, surfaced rather than decided.** §3.1 creates
a metric no existing belt uses — `discoveries` count. A belt over *"most
discoveries found in a single run"* would be legal under the validator rule,
non-colliding, and would reward exactly the behaviour this whole page exists to
create. It is **not a Cambridge belt** — it would be all-cities, UNBOUND-scoped,
and Cambridge would simply be the richest place to contest it. Call it **The
Deep Cut**, qualifier 15 discoveries. That is a roster-scarcity trade for the
belt roster's owner to make, not one this page should make on their behalf; the
cost is one row and one line on the board, and the benefit is that the
exploration content has a championship pointing at it. Achievement 95 covers the
same ground at zero roster cost if the answer is no.

---

## 4. Coins and collectibles

### 4.1 Two facts about coins that change the whole section

Read these first; the rest follows from them.

**(1) Coins cannot be placed by an author today.** `_placeCoins`
(`js/voxelsim.js:324-338`) is a **seeded uniform scatter** over the bounds rect,
inset 8% from each edge:

```js
x: r.minX + (r.maxX - r.minX) * (0.08 + this.rng.next() * 0.84),
```

`SANDBOX_COIN_COUNT = 60` (`voxelsim.js:100`). Sixty coins scattered uniformly
over a 2.5 × 2.5 km map is **one coin per ~104,000 m²** — visually, a coin every
280 m of driving in a straight line, which is not a collectible, it is a rumour.
Whatever else this section proposes, the level needs **scene-authored coin
positions**, with the existing scatter kept as the fallback for scenes that
declare none. That is a small, contained change to one function, and the RNG
draw must stay in the same place in the sequence for any scene that *doesn't*
declare coins, or every existing scene's coin layout re-rolls.

`00` §4.1 and `03` §8.1/§9.3 carry `sim.coinAnchors` as a prerequisite for this
level, on exactly the dependency above.

**(2) A coin does not keep a combo alive.** The chain increments in exactly one
place — `_consume` (`voxelsim.js:2192`: `h.chain += 1; h.chainTimer = COMBO_WINDOW;`)
— and `_collectCoins` (`voxelsim.js:340-349`) pushes a `coin` event and touches
nothing else. So the premise "a coin bridges a sparse stretch" is **not true
today.** It is a good idea; it is just not a fact.

### 4.2 The recommended fix, and why this exact shape

> **A coin refreshes `chainTimer`. It does not increment `chain`.**

One line, and the asymmetry is the entire point:

- **It sustains.** A coin buys the player another 1.5 s to find the next
  eatable, which is precisely the bridging function this section wants, and it
  is the direct answer to `01` §3.5's rate-gate problem: *"the chain does not
  care about the map total; it cares whether the next bite arrives within 1.5 s
  of the last."*
- **It never inflates.** `h.bestCombo` and `comboMult` stay strictly
  block-denominated, so the **Unbroken Chain belt** (`06` §2.4, metric
  `longest_chain`) and its 500-block achievement (`06` #14) are untouched, and
  Cambridge's numbers stay comparable with Brooklyn's. A coin that incremented
  the chain would quietly make Cambridge the best city to farm a chain belt in,
  which is a cross-city fairness bug wearing a feature costume.
- **It is authorable.** Coin placement becomes a legitimate tool for meeting
  `01` §7.5 gate 6 (mean inter-eatable gap under 15 m per district) without
  padding a district with props it does not want.

If that line is judged out of scope, the fallback costs no code: **place a
small eatable prop within one hole-diameter of every coin** — a bin, a bollard,
a bike rack. The coin becomes a *marker* for a chain-sustaining bite rather than
being one. Less elegant, zero risk, and it is worth authoring that way anyway so
the level is correct under either decision.

### 4.3 Placement philosophy

Sixty coins. Allocate them against what a coin is *for*, which is not reward —
reward is mass — but **direction**. A coin is the cheapest possible way to say
"go that way".

| Allocation | Count | Job |
|---|---|---|
| **Bridging** — sparse stretches on the plausible driving lines between districts | 18 | Keeps a chain alive across the gaps `01` §3.5 warns about. Placed *by measurement*: run the scripted excursion, find every inter-eatable gap over 15 m, drop a coin in it. This is the one allocation that should be derived from the validator probe rather than by eye. |
| **Egg beacons** — one coin at ~14 of the T1/T2 eggs in §2 | 14 | A coin is a legible "something is here" signal that costs no UI. It converts a T2 into a findable T2 without a marker, an arrow or a tutorial. |
| **Vertical** — on roofs, the Lechmere platform, the viaduct, the Longfellow towers, the Dome | 10 | The only reward in the game for the risk of going up. Also the natural pairing with the rooftop glyphs in §1. |
| **The edge band** — spread along the outer 10% | 8 | Pulls late-game, high-SIZE players out to the glyph gallery, which is otherwise easy to never visit. |
| **Efficiency traps** — directly on the fastest route | 6 | So a Sprint Strap run picks up a few for free. A collectible that *punishes* the speedrunner splits the two audiences; a few free ones keep them on the same map. |
| **True hides** — behind, under, inside | 4 | The T3 tail. Four is enough. |

**Exploration versus efficiency, resolved deliberately.** The Sprint Strap
rewards the shortest route; coins reward the longest. Left alone, the two
metrics fight and one of them loses the player. The split above resolves it by
**not making coins a tax on speed**: six sit on the fast line, and the other
fifty-four are an explicit, opt-in second game with its own achievements (`06`
#39 Coin Purse) and no bearing on any belt. Two games on one map, each honest
about which one you are playing.

**`06` #39 "Coin Purse" — all 60 in a single city.** On a 2.5 km map this is a
much longer sit than it is in Brooklyn. That is arguably correct — the biggest
map should hold the hardest sweep — but it should be a decision, not a surprise.
The mitigation, if it plays badly: the bridging 18 and the efficiency 6 are
already on the natural route, the beacon 14 come free with the eggs, and only
the last 22 are real work.

**Interaction with the ≤15 m combo-density rule.** `01` §7.5 gate 6 measures the
mean inter-eatable gap per district along the scripted route, and coins stay out
of that count. Under today's code they are genuinely not eatables, and under
§4.2's change they sustain a chain rather than feed it — so counting them would
let an author paper over a dead zone with currency. That density check is the
real guard against a map that feels sparse, which is worth remembering whenever
piece counts come up: `tools/validate.mjs` enforces per-district density, and
enforces nothing at all about a scene's total block count. A district that comes
in lean but dense is fine; a district that comes in fat but empty is not. Worth
a line in the probe's comment so the reason survives.

---

## 5. Greatest hits — if only five ship

Ranked by recognition-per-unit-of-work for the specific UNBOUND room, per §0.

**1. The Cutaway (E36–E38) — their own beer garden, behind their own wall.**
Every detail is Confirmed from HubSpot's own press release, so there is no
research risk, no rights question and no invention. It needs no engine change —
it is interior geometry behind a facade, which the vocabulary in `01` builds
more cheaply than the current kit does. And it is the only item on this page
that a person can recognise *from having stood in it*. Nothing else competes on
that axis. Most expensive of the five (~600–900 pieces) and still first.

**2. Partner Alley (G2) — the art is already in the repo.**
Eight marks, already licensed, already rasterised, already shipping in the shop,
and `tools/gen-partner-logo.mjs` makes a ninth a one-command job during the
conference. Partners are half the room at UNBOUND and this is the only item that
speaks to them directly. Authored as a slot list it also becomes the level's
live-updatable surface, which is worth more than the glyphs themselves.
Lowest work of the five by a wide margin.

**3. A Sprocket's Story (G1) — the tagline, performed.**
A sprocket with a solid centre that you eat the centre out of, leaving twelve
teeth around a hole. It is the brand mark, the protagonist, and the product
tagline collapsed into one interaction, on the roof of the neighbourhood's most
boring building. It is also the clearest demonstration of the whole
destruction-reveal idea, so it earns its place as the one that teaches the
player that eating things *shows* them things.

**4. Wrong Canal Park (G3) — the ghost under the cladding.**
Cheapest of the five (~60 pieces). Lands hardest with the longest-tenured people
in the room, which is the group most likely to be unimpressed by everything
else. And it demonstrates that the build knows the difference between the two
Canal Parks — which `02` §0 identifies as the single worst failure mode
available. Getting it right is table stakes; getting it right *as a joke* is a
flex.

**5. Out of MIT (G4 + A80) — the company's own sentence, made drivable.**
A dashed line and one achievement. Near-zero build cost (the dashes lie in roads
being built anyway), and it is the only item that gives the map a *narrative*
reason to be 2.5 km wide instead of 500 m. It also makes the MIT half of the map
load-bearing rather than decorative, which retroactively justifies the hacks,
the Dome and Killian Court.

**Runners-up, in order:** the tofu cube (E30 — highest laugh-per-piece on the
page, ~6 pieces), the layered Dome hacks (E13–E15), the davenport on the
Davenport (E39/E40), and the geese (E24 — the single best texture-per-effort
item, and the one goose that does not move is free).

---

## 6. Rights and taste

Applying `02` §7. Practical, brief, flagged not litigated.

**Clearly fine — HubSpot's own marks, shown to HubSpot, at their invitation.**

| Item | Note |
|---|---|
| G1 garage sprocket, G3 ghost sprocket, G4 Founders' Line, G10 canal flywheel, E41 parking space, E42 atrium floor, E43 orange door | Use the **current brand asset**, do not redraw. `02` §7: *"a wrong-shade, wrong-proportion sprocket on the hero building is a worse outcome than no sprocket."* |
| G5 "UNBOUND" | HubSpot's own event name. |
| A59's name, and every quoted line | Taken from HubSpot's own published copy. |

**Clearly fine — place names, not marks.**

The Davenport, Lechmere, CambridgeSide, Museum of Science, Longfellow, Zakim,
Bunker Hill, the MIT buildings, Killian Court, Glassworks Avenue, Costa Lopez
Park, Silva Park. `02` §7: *"These are place names before they are marks."*

**Clearly fine — a tradition that invites participation.**

E13–E18, the MIT hacks, including the IHTFP plate. `02` §7: MIT's own alumni
association runs the hack gallery.

**Already-cleared third-party marks.**

G2 Partner Alley. These eight are shipping partner skins today
(`js/skins.js:522-558`) via an established consent path. New partners go through
the same path or do not appear. **One practical note:** a partner logo in a shop
menu and a partner logo painted on a shipping container in a destructible city
are different placements. Worth one line in the same conversation that gets the
asset — not a blocker, just don't assume the shop consent silently covers it.

**Needs a check.**

| Item | The check |
|---|---|
| G3 ghost sprocket on 1 Canal Park | A former tenant's mark on a building with a current owner. Mitigated by it being *painted over*, i.e. plainly historical. Low risk; look once. |
| G7 NECCO water tower | The tower and both paint schemes are public landmarks; **no Novartis wordmark** anywhere on the building (`02` §7). |

**Abstract into an affectionate look-alike — do not reproduce.**

| Real thing | What ships instead |
|---|---|
| Dunkin' | E27: orange-and-pink cups, no wordmark, at absurd density. `02` §7: *"the joke is the density, not any one store."* |
| Courthouse Seafood / New Deal Fish Market | E1: a fish on an awning, crates on ice, no name. |
| Casa Portugal, the Portuguese bakeries | E2: custard tarts in a window, no name. |
| Lotus / IBM | G8: a grid of cells with one selected. No wordmark. Funnier abstracted. |
| Chang Shing Tofu Factory | E30: a white cube on an unnamed one-storey industrial roof. The building is real and unmistakable to a local; the sign is not needed. |
| Biogen, Novartis, Google, Microsoft, EF, Sonos, the CambridgeSide tenants | Build the massing, skip the wordmarks (`02` §7). Blank sign bands read as signs at voxel resolution. |
| MBTA | Green-and-white trolley, silver-and-red Red Line car. Correct liveries are how transit is recognised; the roundel is not needed. |

**Competitor branding.** None. `02` §7, and it is not close.

**Handle with care — the three deliberate non-eggs.**

| Item | Why it holds nothing |
|---|---|
| **E6 St. Anthony's Church** | Active place of worship. Depicted respectfully; no egg, no destruction beat (`02` §7). |
| **E35 40 Thorndike** | It was a jail; the history is contested and still litigated. Build it accurately, no joke inside it (`02` §7). |
| **E44 The hero building's honest silhouette** | Not a rights item — a taste one. `02` §2.4 says HubSpot's five-storey slab sits in a bowl between three towers and that this is *"more interesting than a hero tower would be."* Resist heroizing it. |

**Private residences.** The triple-deckers, the condos, the apartment towers are
people's homes. Generic massing, no individual detailing, no named house, no egg
hidden in a specific one (`02` §7). E28's lawn chair is on a *street*, not a
property, for exactly this reason.

**Destruction framing.** `02` §7's line holds for everything above: the tone
stays playful and cartoon-physical, never catastrophic. Two specific
applications for this page: no egg rewards destroying the **dam or the locks**
(E34's gates cycle; they do not fail), and no achievement is named in a way that
reads as damage to a real neighbourhood. Check every name in §3.3 against that
before it ships — they read clean today, and the failure mode is a witty name
added later by someone who did not read this paragraph.

---

## Related

- `02-cambridge-reference.md` — every factual claim on this page traces there
- `01-voxel-primitive-vocabulary.md` — the grain rule, the grade ceiling, the
  one-bite hazard, and the skin-not-fill guidance glyphs are the simplest case of
- `03-level-design.md` — owns extent, districts, spawn and placement; the glyph
  gallery in §1.3 and the NECCO reveal in G7 both depend on its map extent
- `../online-flywheel/06-belts-and-achievements.md` — the achievement system
  this catalog extends, and the belt roster it deliberately does not
- `../../adr/0006-structural-zone-simulation.md` — the support BFS the glyph
  grain law derives from
- `../../modules/render.md` — `logoTex` / `fullBleed`, the raster partner-mark
  path Partner Alley reuses
