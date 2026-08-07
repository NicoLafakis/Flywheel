---
covers:
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "js/voxelkit.js"
  - "js/voxelsurfaces.js"
  - "js/voxelscene-manhattan.js"
  - "js/voxelscene-upper-manhattan.js"
  - "js/voxelscene-brooklyn.js"
  - "js/voxelscene-boston.js"
---
# Voxel Sandbox (pile physics)

## Purpose

## Goal runs and rewards

Every sandbox is a complete replayable level. `VoxelSandboxSim` owns the
authored SIZE goal and deterministic coin scatter, collects coins during
`step()`, and emits coin/goal events. The renderer only mirrors those events.
Each run has 60 visible coins worth 2 coins each, plus a 35-coin goal bonus;
the save-side `recordSandboxResult()` persists completion history and rewards.
All five sandboxes use the READY establishing-shot path in `main.js`.

Sandbox mode (title screen → VOXEL SANDBOX, NYC: LOWER MANHATTAN, or NYC: UPPER
MANHATTAN — CENTRAL PARK): the
hole excavates a block-built world from underneath. The hole never decides
whether an object fits — it removes floor support, and a deterministic
load-path graph decides how each structure collapses: progressively,
bottom-up, along material bond strengths.

## Key Files

| File | Purpose |
|------|---------|
| `js/voxelsim.js` | `VoxelSandboxSim`: support graph, instant-default stress response, chunk + debris physics, scoring, the `gallery` scene. Pure sim (no three.js, seeded RNG via `rng.js`) |
| `js/voxelkit.js` | The 5 object size classes (PROP 0.25 m / VEHICLE 0.5 m / SMALL_BLDG / LARGE_BLDG / MEGA) + their canonical builders (vehicles, trees, lamps, props, `tower()`), plus the streetscape/landmark kit (`setbackTower`, `streetWall`, `porticoFront`, `spiralRotunda`, `pathRibbon`, `stoneArch`, `basinRim`, and more — see the Upper Manhattan section below). Pure sim, shared by all three built-city scenes (Lower Manhattan, Upper Manhattan, Brooklyn) |
| `js/voxelscene-manhattan.js` | `buildManhattan(sim)`: the full Lower Manhattan peninsula (~25.8k blocks). Sets `bounds`/`boundsRect`, `sceneDecor`, `cameraBlockers` |
| `js/voxelscene-upper-manhattan.js` | `buildUpperManhattan(sim)`: the full Central Park + Upper Manhattan district (73,393 blocks / 86,083 mass). Sets its own bounds, landmarks, curb kit, decor, and camera blockers |
| `js/voxelscene-brooklyn.js` | `buildBrooklyn(sim)`: bridges-to-Coney-Island sandbox, 1.35 blocks/m² |
| `js/voxelscene-boston.js` | `buildBoston(sim)`: Seaport, Fort Point and the BCEC (82,894 blocks, 2.0 blocks/m²) — see the Boston section below |
| `js/voxelworld.js` | `VoxelWorld3D`: one `InstancedMesh` per material + brick size with per-instance paint colors, cached static transforms, and per-frame dynamic motion; renders `sceneDecor` (roads/sidewalks/parks/bike paths/markings/water) |
| `js/voxelsurfaces.js` | three.js binding for `voxeltiles.js`'s procedural surface registry (canvas-generated textures for `sim.sceneSurfaces`); zero cost until a scene names a surface. Owns the metals-only PMREM-probe rule — see the Boston section below |

## Model

Blocks come in four sizes — 0.25 m (fine detail), 0.5 m (props/vehicles),
1 m (standard), 2 m (large structures) — all on a shared 0.25 m fine grid.
Content is organized into **five object size classes** (`js/voxelkit.js`):
C1 PROP (< 2 m, 0.25 bricks — lamps, hydrants, benches, carts), C2 VEHICLE
(2-8 m, 0.5 bricks — cars, buses, trees, boats, statues), C3 SMALL_BLDG
(3-10 m, 1 m — houses, shops, churches, terminals), C4 LARGE_BLDG (10-30 m,
1 m — apartments, hotels, industrial, offices, banks), C5 MEGA (30 m+, 1-2 m
— skyscrapers, monuments, forts). Brick size is voxel resolution; class is
object scale; physics is identical across classes.
Each block registers every fine cell it occupies; neighbors are found by
scanning face cells, so mixed-size blocks connect wherever their faces
touch. Cantilever spans are measured in meters (`(cur.s + nb.s)/2` per
horizontal step), block mass is `density × s³`, chunk centers of mass are
volume-weighted, fall speed is driven by material density (size-independent),
and rest/sink thresholds scale with block height.

Three layers, cheapest first:

1. **Static support graph** — blocks are grid cells with 6-way neighbors.
   Support is a 0-1 BFS from floor anchors (`gy==0` blocks outside the
   support-removal zone `radius×0.95`): vertical moves reset the cantilever
   `span`, horizontal moves increment it and fail past the entered block's
   `maxSpan` (floor cells over the void cap at `FLOOR_CANTILEVER=1`). An edge
   only carries load if the *outgoing* block's `vertBond`/`horizBond` ≥ 0.5 —
   glass never carries. Recalc is **event-driven** (hole
   coverage change, consumption, detachment), never per-frame. Damage/healing
   likewise iterates only an explicit active set; an intact large scene has no
   per-step whole-city damage scan.
   **Structural zones (2026-08-05):** the BFS only ever walks `neighbors`
   edges, so it can never cross between two blocks that do not touch — the
   scene's connectivity graph is therefore already partitioned into
   physically separate structures, and that partition is fixed at build time
   (`neighbors` only shrinks as blocks detach). `_recalcSupport` computes
   these zones once (Upper Manhattan: 1,114 of them, largest 3.4% of the
   scene) and, on each call, recomputes only the zones a moving hole can
   provably reach — the graph-changed zones plus a small radius around the
   hole for support-ratio/hanging changes. This is the wiki's previously
   "not implemented" hierarchical zoning, shipped as *discovered* zones
   rather than authored ones, so no scene file declares anything. Proved
   byte-identical to the old whole-scene BFS three ways: `tools/validate.mjs`,
   a full per-step state digest across 16 scripted excursions, and 50
   randomized fuzz runs. On Upper Manhattan's 73,393 blocks this took
   `_recalcSupport` from 48.55 ms/call (80% of frame time while driving) to
   0.295 ms/call. The loose-debris scan (`_stepDebris`,
   `_resolveDebrisContacts`) and the sleeping-rubble broad phase (`_sleepObs`)
   got the same treatment — an active set (`_falling`, sorted by id) and a
   persistent cell index instead of a full block-array walk every step.
2. **Damage → chunks** — destruction is **rim-driven**: the crack front is
   seeded from solid (fully supported) blocks only, so the hanging rim — not
   the void's center — lets go first. The shipped `sim.tune.creak = 0`
   setting arms newly hanging/unsupported blocks at `damage = 1`, so they
   detach on the next `sim.step` with no visible wait. A positive dev tuning
   value restores the fast creak (`base + 0.15 + 0.25×span`, ≤`HANG_CAP`)
   and inward wave (`WAVE_K` 0.4 s per cell, ≤`FAIL_CAP` 2.5 s). Blocks accrue persistent `damage` (0..1) at `failRate`;
   damage **does not reset when support returns** — it heals slowly (0.08/s) —
   so wiggling the hole never rescues a collapsing structure, and a fast
   drive-through leaves visible weakening behind. Detaching blocks jolt
   neighbors (+0.15 damage, capped 0.95), so crumbling propagates instead of
   shearing cleanly. The renderer heats blocks from white to orange with the
   damage fraction (`instanceColor`), making the failure front visible.
   Detached connected regions (≤`FRESH_WINDOW`) flood-fill into rigid chunks
   without crossing edges below `GROUP_BOND` — steel frames stay whole,
   glass shears off. Chunks get mass-scaled gravity (`fallG(avgMass)` —
   heavier material falls faster), rim torque, attraction-zone inward pull,
   and ground-impact splitting along the weakest bonds.
3. **Debris** — groups < 3 blocks and all `loose`-material blocks get cheap
   individual physics: mass-scaled gravity, bounce, friction, rim tip-over
   (only when the hole-facing edge really overhangs the void), inward
   funnel. The vacuum acts only on airborne/sliding bodies — grounded
   blocks feel no attraction — and debris sleeps anywhere once slow,
   grounded, and contact-free (the hole wakes sleepers when it reaches
   them; support loss wakes the rest).
4. **Loose-body contacts** (`_resolveDebrisContacts`) — debris never
   interpenetrates: AABB overlap tests between near-resting debris, sleeping
   debris, chunk members, and falling rain, separated along the least-
   penetration axis with bounce + friction + spin kill (2 relaxation rounds
   per step, 1 in `perfMode`; fine-column buckets padded 1 cell using bit-packed
   integer spatial keys `keyInt(x,z)` and pooled bucket arrays for zero GC allocations per frame). Moving bodies also get full
   AABB separation against nearby solid collision buckets when a directional
   or top-surface probe finds contact; chunk members split on solid overlap.
   Blocks resting on loose
   rubble treat it as support (`_restLoose`) so piles quiet bottom-up;
   sleep is committed only after the contact pass proves the block
   contact-free, so nothing freezes mid-overlap. Chunk/debris tumble is
   capped (~0.6–0.7 rad): slabs lean, they don't pirouette.
5. **The tier levers got two correctness fixes (2026-08-07), and the
   one-step separation contract survived a challenge.** `_capDebris` must
   never sleep a block resting on awake loose
   debris: it now skips `_looseSup` blocks. Sleeping one registered it in
   `_top`/`_sleepers` with the loose block's top as its support, and when
   that support was eaten no wake path fired (awake blocks live in neither
   index), so the block — and whatever piled onto it — hung in the air until
   the hole passed directly underneath (player report: blocks "don't fall
   unless you position yourself under them"; the fountain and the hang are
   both visible in `../screenshots/flywheel-block-issues.jpg`). The walk's own sleep path
   already knew (the `looseSup` branch never sets `_wantSleep`); the cap
   simply failed to check. And `contactBudget`-excluded blocks are now
   PARKED (`_budgetHold`, `_stepDebris` skips their integration) instead of
   being integrated without a contact pass: their support probe cannot see
   the awake pile they rest on, so gravity sank them into each other a
   little per step, and the step the hole brought them back inside the
   budget the solver found up to a full block of penetration and shoved them
   straight up — the block fountain, and the rim "knocking bricks" sky-high.
   A 0.3 m clamp on `_pushAxis`'s positional correction was tried for the
   same symptom and REVERTED: full-pen one-step separation is the
   anti-tunnelling contract the validator probes (a mover coincident with a
   solid must be fully ejected by one call), the clamp broke it and shifted
   HIGH-tier eat counts, and with the wad source parked the launches no
   longer have a population to compound from. HIGH is untouched by the two
   lever fixes (both levers are Infinity there).

**Block-vs-block collision** (the solid-surface heightmap): per fine column,
`_top` tracks the highest SOLID top (static blocks + sleeping debris).
Falling bodies collide with it instead of a flat ground plane — debris and
chunk impacts land on rooftops and on top of earlier debris, so collapses
**stack into piles**. An **angle-of-repose** rule sheds blocks off steep
piles toward lower columns (the spill). Falling bodies also probe their
leading/bottom face against the occupancy grid (`_contact`): chunks shatter
on facades instead of ghosting through, debris wall-scrapes, and hard hits
(+0.1/+0.2) **smash-damage** whatever they strike (heat tint; the support
graph still decides actual detachment, so hits pre-weaken rather than
topple). Sleeping debris registers in `_sleepers` and becomes solid itself
(piles stack); when its support detaches or is eaten, `_topRemove` wakes it.
Consumption/impact thresholds are unchanged (`SINK_Y` over the void).

Consumption: a block whose top sinks below `SINK_Y` (0.15) inside the
removal zone → mass (`mat.mass × s³ × comboMult`), combo (window 1.5 s,
mirrors `sim.js`), and SIZE progression via escalating `SIZE_MASS`
thresholds (radius interpolates +0.5 m per level from the 1.1 start).
The ladder scales per scene (`× min(10, max(1, round(totalMass/4200)))` —
gallery is exactly ×1, Manhattan ×10 at its 43,593 mass, Upper Manhattan ×10
at its 86,083 mass) so progression pacing is scene-relative. The multiplier
clamps at ×10: Upper Manhattan's raw ratio is `round(86083/4200) = 21`, so it
is pinned at the ceiling and cannot re-pace any harder however much mass a
future pass adds — SIZE 12 there costs **116% of the entire scene's raw
mass**, reachable only on sustained combos. In absolute terms Manhattan's
SIZE 8 costs 23,000 combo-mass (53% of the entire city at a 1× combo), SIZE 10
costs 133% and SIZE 12 costs 230% — the top levels are reachable only on
sustained combos, by design. Re-check this whenever scene mass changes: the
ladder re-paces silently up to the ×10 ceiling, and it drags the camera's
SIZE-keyed zoom ramp with it. `tools/validate.mjs` pins a floor per scene
(Manhattan's WTC excursion and Upper Manhattan's perimeter excursion must each
reach ≥ SIZE 4; Upper Manhattan also floors `eatenCount ≥ 300`).

## Scenes

Five scenes share the sim (`new VoxelSandboxSim({ scene })`, default
`'gallery'`): `gallery`, `manhattan`, `upper-manhattan`, `brooklyn`, `boston`.
`js/main.js`'s `AUTHORED_SCENES` table is the single source of truth for which
scenes are real places (label text, HUD text, and whether an `intro`
establishing shot/READY-gate framing applies) — see Talks To below. Scene
builders run inside the constructor, may set
`sim.bounds` (square hole clamp in m — 24 gallery) or `sim.boundsRect`
(`{minX,maxX,minZ,maxZ}`, which overrides the scalar; off-center maps need it
— Manhattan's peninsula is 124 × 118 m and asymmetric, so the old square ±80
left ~36 m of empty harbor south of the last block), `sim.sceneDecor`
(render-only roads/parks/water planes) and `sim.cameraBlockers`
(building AABBs for the chase cam's occlusion pull-in — stale after a
tower falls, accepted).

### gallery (VOXEL SANDBOX)

Hand-authored, deterministic — a full city gallery in districts (~3800
blocks, one of each researched city-object kind):

- **Downtown core**: 1 m tower (steel/concrete/glass/wood), 2 m warehouse
- **Vehicle lot** (E): sedan, taxi, police, city bus, garbage truck, fire
  engine (ladder), ambulance (box van), motorcycle — all from parameterized
  builders (`_sedan`/`_bus`/`_boxVan`/`_bigTruck`/`_motorcycle`)
- **Street furniture strip** (S, near spawn): hydrant, mailbox, parking
  meter, bench, bike rack, bollards, NYPD barrier, phone booth, hot dog
  cart, traffic light, newsstand, dumpster, bus shelter, cones, flag pole,
  subway entrance, lamp posts
- **Construction site** (NE): tower crane (3 m jib = exactly steel's span
  limit), shipping containers, pipe pile, porta-potty, jersey barriers
- **Landmark plaza** (NW): fountain (glass water), statue, water tower on a
  brick pump house, brick apartment block
- **Civic row** (W): house, shop, church (brick + spire), brownstone,
  parking garage (open decks — pancakes), crate pile
- **Gas station** (E): canopy on 4 pillars, kiosk, pumps
- **Elevated bridge** (S edge): 6 m span at 0.5 m density — paired steel
  bents every 4 m, full-width crossheads, 12-block concrete deck, side
  rails, 2-car train

### upper-manhattan (NYC: UPPER MANHATTAN — CENTRAL PARK)

73,393 blocks / 86,083 mass (the largest scene in the game by both measures),
bounds `x[-66,68] z[-149,116]`, 538 generated camera blockers. Rebuilt
2026-08-05 from an ~8,400-block park sketch into the full district: Central
Park's real geography down the middle, flanked by the Upper West Side and
Fifth Avenue / Museum Mile, with Harlem across the north edge.

- **Central Park** (the green spine, `x[-22,22] z[-96,100]`): the Great Lawn
  and its ball fields, Turtle Pond, Belvedere Castle (the pacing anchor, 7 m
  from spawn), the Delacorte Theater, the Ramble's rock outcrops and rustic
  bridges, the Lake (Bow Bridge, the Ladies Pavilion, Loeb Boathouse, five
  rowboats), Bethesda Terrace and Fountain (arcade with a painted Minton
  soffit, the Angel of the Waters), the Mall's corbelled elm tunnel, the
  Naumburg Bandshell, Conservatory Water (model sailboats, Alice, Andersen),
  Strawberry Fields, Sheep Meadow, the Central Park Zoo, the Arsenal, Wollman
  Rink, the Carousel, Chess & Checkers House, Heckscher Playground, Tavern on
  the Green, the Reservoir with its running track, the North Meadow, the
  Conservatory Garden, and Summit Rock
- **Upper West Side / Central Park West** (`x[-33,-29]` band): the twin-tower
  rhythm — El Dorado, the Beresford, San Remo, the Majestic, the Century — the
  Dakota as the deliberate rhythm-breaker (no towers, five mansard courses),
  the AMNH with the Hayden Sphere (`glassSphere`), Trump International,
  Columbus Circle (a ring of road rects around the Columbus Column), the
  Deutsche Bank Center's twin towers (the tallest things in the level), and
  Morningside Heights (Columbia's Low Library, the Cathedral of St John the
  Divine with its two intentionally unfinished towers)
- **Fifth Avenue / Museum Mile** (`x[29,33]` band, deliberately flat and
  unjittered against CPW's jittered rhythm): the Metropolitan Museum of Art
  (inside the park, the densest single mass in the level and the excursion
  target), the Guggenheim (`spiralRotunda`), the Frick, Temple Emanu-El, the
  Jewish Museum, Cooper Hewitt, Mount Sinai, and Grand Army Plaza with the
  Pulitzer Fountain
- **Harlem** (compressed grid across the north): Striver's Row, Abyssinian
  Baptist, the Apollo Theater (an emissive marquee blade in
  `sceneAmbient.neon`), the Adam Clayton Powell Jr State Office Building,
  Marcus Garvey Park with the Mount Morris fire watchtower, four cruciform
  public-housing towers, and the Park Avenue Metro-North viaduct
  (`metroViaduct`, on median bents)
- **Street dressing**: 32 declared streets (Central Park West, Fifth Avenue —
  each re-cut around Columbus Circle / Grand Army Plaza — the four
  transverses, the avenues, 125th Street, Harlem's cross streets), 78
  crossings, 33 oriented vehicles, curb furniture at a 5 m pitch, six subway
  entrances, four sidewalk sheds, and ~1,000 street trees

The scene is intentionally separate from Lower Manhattan. Spawn is on the
Great Lawn; the validator's excursion is a 62 s perimeter orbit inside the
Met (721 eaten, combo mass 3,680, SIZE 4 at 37.8 s — the discriminator that
made this route work over five slower candidates is walking a wall's footprint
rather than re-excavating the same crater twice). Camera blockers are
*generated* from finished geometry (`generateBlockers`, shared with Brooklyn),
not hand-written. The street bands are a placement contract: tall structures,
foliage, benches, and other physical props stay off asphalt; every
intersection reuses the same five-stripe zebra template and sidewalk offsets;
every building lot is filtered through `roadClash` + `taken` so the generic
street-wall runs self-align around declared streets and hand-placed
landmarks. Fourteen kit builders shipped for this scene alone (`setbackTower`,
`streetWall`, `towerCrown`, `porticoFront`, `spiralRotunda`, `glassSphere`,
`naveChurch`, `metroViaduct`, `rowBlock`, and others), plus five park-surface
builders from the first pass (`pathRibbon`, `basinRim`, `parkWall`,
`rockMound`, `stoneArch`) — all in the shared `js/voxelkit.js`, all
parametric, no per-building special-casing.

### manhattan (NYC: LOWER MANHATTAN)

~25,800 blocks across the full Lower Manhattan peninsula (bounds ±80),
street grid as render-only decor (Broadway–Fulton–Liberty grid, West Side
Hwy, FDR; Hudson W, East River E, harbor S):

- **WTC plaza** (NW): One WTC — three curtain-wall setback tiers (25+13+9
  layers, tier tops land on slab layers) + 10 m spire; twin memorial pools
  (concrete rim, glass water); plaza trees; 7 WTC (8×8 curtain, 21 layers);
  Oculus-style rib pavilion (vertical stacks of rising height)
- **North towers**: Woolworth-style terracotta setbacks (masonry, 13+7+7)
  + modern glass slab (12×10, 33 layers) east of the El
- **Wall St canyon**: three bank buildings with Federal-Hall porticos,
  south-side brick/concrete offices with a rooftop water tower, Trinity
  Church (nave + bell tower as one complex), City Hall (portico, dome,
  cupola), NYSE (columns + flag), Federal Reserve fortress
- **Civic Center / Chinatown / Tribeca** (N): Municipal Building (base +
  tower + cupola), courthouse, Chinatown storefront rows (bright awnings),
  Columbus Park, Tribeca loft warehouses with roof water towers
- **Brooklyn Bridge** (NE edge): twin Gothic pylons + connecting crown,
  approach viaduct — edge monument, not the full span
- **Elevated train** over Pearl St (x 22..27, z −36..22): steel bents
  every 4 m, crossheads, 0.5 m concrete deck, guard rails, parked 3-car
  train on bogies
- **East River / Seaport** (E): pier pavilion + deck, two brick pier sheds,
  docked tall ship (two masts), Downtown heliport pad
- **Battery Park City / Hudson** (W): two residential towers, marina with
  small boats, Hudson pier shed, esplanade dressing
- **Battery Park + harbor** (S): trees, lamps, benches, Charging Bull
  (bronze, Bowling Green on Broadway), Castle Clinton round fort, ferry
  pier, Staten Island Ferry Terminal + slips + orange ferry, Custom House
- **Street life**: taxis, NYPD, delivery van, city bus, ambulance,
  motorcycle (all on E-W streets so the +x build axis reads parallel),
  Broadway lamps, traffic lights, hydrants, mailboxes, newsstands, hot dog
  carts, subway entrances (green globes)

**Render-only decor** is a rect list (min-corner + size), drawn parks → sidewalks
→ roads → bike paths → lane/crosswalk markings → water in ascending y layers,
so water always wins an overlap and markings sit above asphalt. Two consequences
survive as scene invariants: the harbor is deliberately *carved* into five
rects around the two land pockets that carry structures (Castle Clinton's
Battery point, the Whitehall ferry apron) — one big rect put a fort and a
ferry terminal in open water and buried the Castle Clinton park plane beneath
the harbor; and each river needs an inboard rect to reach the built waterfront
(the Hudson ribbon ends at x −66 and the East River at x +66, ~20 m outboard
of the last pier, so the marina boats and the tall ship floated on asphalt
until the marina basin and the Seaport reach were added). Props and vehicles
must land on the surface they imply — the road grid grew with the peninsula
only after 21 of 43 sites were found standing on bare ground.

**Camera blockers must cover every structure ≥ 6 m** — the same cut
`world3d.js` uses for the campaign (`o.h > 6`). The sandbox chase cam's lowest
framing is ~8.6 m high / 11 m back at SIZE 1, so a 7-9 m mid-rise occludes the
hole with no pull-in when it has no entry, and `camera.js` only pulls in while
`camY < b.h` — an entry whose `h` understates its rooftop water tower is as
bad as a missing one. The list is hand-written, so `tools/validate.mjs`
enforces coverage per footprint cell rather than trusting it.

### boston (BOSTON: SEAPORT AND THE CONVENTION CENTER)

82,894 blocks over a 192 × 216 m map (`z[-124,92]`, midpoint −16), density 2.0
blocks/m² — between Brooklyn's 1.35 and Manhattan's 2.26. First scene outside
New York; `js/main.js`'s `AUTHORED_SCENES` table exists partly because the
older four-separate-lists scheme quietly assumed that would never happen. The
only sandbox with **zero dead ground** (Brooklyn reports 148 points, Upper
Manhattan 1), because coverage was checked cell-by-cell rather than by the 4 m
sampled probe, which has 8 m of reach and can walk straight past an 8 m bare
stripe.

North→south band ladder built from a real OpenStreetMap survey (42.3480 N,
71.0450 W), uniform 1:6 in plan / 1:3.5 in height, with three declared scale
exceptions (the BCEC roof at 1:2.5 so its 16 m barrel-vault rise reads as a
curve at 1 m bricks; the Marine Industrial Park telescoped ~700 real m west so
a low-density truck yard doesn't inflate the map 40%; the west edge re-seated
so Fort Point Channel's far bank fits inside `boundsRect`):

- **Boston Harbor** (open water, north edge) → **the Piers** (Fan Pier, Pier 4
  / ICA, Commonwealth Pier, the Fish Pier's twin rows + trawler fleet, a dry
  dock) → **Northern Avenue / the HarborWalk** (Moakley Courthouse) →
  **Seaport Boulevard** (the Evelyn Moakley Bridge, St. Regis, 121 Seaport) →
  **Congress Street** (Fort Point's brick warehouse grid, the Children's
  Museum, the Hood Milk Bottle, the Tea Party brigs) → **Summer Street**
  (elevated 28 m over the Massport Haul Road) → **the BCEC body** (68 m
  barrel-vaulted hall, the Westin, the Omni's twin towers — spawn is here) →
  **D Street** (the Lawn on D)
- One channel, two centuries either side of it: 1890s load-bearing brick west
  (Fort Point), 2010s precast and glass east (the Seaport), the BCEC over the
  middle, a working port north/east that hasn't gentrified

**Palette is measured, not eyeballed** — see `conventions.md`'s Palette
section for the `mm()`/`sp()`/bare-hex provenance markers and the
`PALETTE_TRANSFORM` seam. The finding that mattered: de-veiled Boston brick
(`0xa38673`) is far lighter than the `0x8f4a3a` it was originally guessed at,
so `brickSunlit` (183 luminance) now sits *above* `precastGrey` (167) — the
value separation the scene was designed around is gone. What survived is
chroma (brick 46-78 points of saturation vs. precast/roof/glass at ≤ 9,
ashlar at 19) — see the **chroma rule** in `conventions.md`. `barrelVaultHall`
is the one place the never-bake-a-shadow convention is knowingly bent: a
stepped voxel vault has no curve for the renderer to shade (every cell
carries the identical +y normal), so its lit/shade pair is authored from the
measured roof band's two ends, not derived.

Physics come from the material; paint is a per-block `color` override that
rides in `instanceColor`, so it costs zero extra draw calls — instancing
batches are keyed on `matType:size` only (Upper Manhattan's 299 distinct paint
colours are 22 buckets, fewer than Brooklyn's 26). Glass must never
have to carry load (strips between columns). Roof caps must sit on a full
slab or have span support at their own level — a ring at y=N does NOT
support a cap at y=N+1 above the ring's hollow interior. Keep every object
fully outside the spawn removal disc (radius×0.95 ≈ 1.05 m from (0,16)) and
mind the hanging threshold — remR + (span + 1.5) × radius/6.6, ≈ 1.6 m at
the 1.1 start radius — for anything whose support path includes horizontal
hops.

**Planned, not built:** [ADR-0013](../adr/0013-anisotropic-voxel-primitives.md)
proposes widening a block from a cube to an axis-aligned box (independent
`sx/sy/sz`), authored through a new `js/voxelforms.js` layer below
`js/voxelkit.js`, with `js/voxelscene-cambridge.js` as its debut scene. See
[features/cambridge-sandbox/](../features/cambridge-sandbox/README.md),
especially
[01-voxel-primitive-vocabulary.md](../features/cambridge-sandbox/01-voxel-primitive-vocabulary.md)
(the capability audit against this file's cost model) and
[00-objective-overview.md](../features/cambridge-sandbox/00-objective-overview.md).
Nothing in `voxelsim.js`, `voxelworld.js` or `voxelkit.js` has changed yet.

## Talks To

- **main.js** — `step(1/60, move)` + `drainEvents()` (`eat`, `crash`);
  `hud.updateSandbox(sim)` for mass/combo/elapsed; `AUTHORED_SCENES` (single
  table of scene label/HUD text/`intro` establishing-shot flag, replacing four
  independently-drifting lists) picks the scene at `startVoxelSandbox(scene)`
- **tools/validate.mjs** — determinism (two seeded runs identical), locality
  (nothing moves while the hole is far), progressive collapse, NaN guard,
  `Math.random` source guard — **globbed** over `js/voxelscene-*.js` plus the
  seven named pure-sim files (2026-08-05; see `conventions.md`'s hard rule
  #1), so every scene is covered the moment it's added rather than only once
  someone remembers to list it. Brooklyn and Upper Manhattan run the **same
  19-probe contract** through 16 shared `probe*`/`report*` helpers (a
  `--- shared voxel-scene contract probes ---` block above the scene
  functions); `validateBoston()` signs the same shared probes with Boston's
  own tables (own vehicle/road-span/open-ground/crossing tables, own
  `sceneAmbient` kinds) plus its own scripted excursion (a closed loop through
  the BCEC podium and the south podium's shed — end-to-end legs, deliberately
  not orbiting a point, so the hole never re-harvests footprint it already
  took). No probe is re-implemented per scene: a probe that drifts per scene
  stops being a contract. fine-cell ownership (ghost/overlap guard),
  `boundsRect` hugging
  content within a 12 m slack, unfiltered road conflicts against the scene's
  exported vehicle + road-span tables, water never covering a road/plaza/
  cobble/sidewalk/crosswalk, no park rect fully inside water (draw-order
  trap), a union-aware rimmed-water check (multi-lobed bodies don't demand a
  kerb block where one lobe legitimately overlaps another's ring), no bare
  ground at any height per footprint cell, declared open-ground spans that are
  block-free and edge-touching, a dead-ground census (printed, not gated),
  crosswalk-stripe containment and non-overlap, crossings inside their
  declared street's span, `sceneDecor` key order matching draw order,
  `sceneAmbient` present and render-only, 3 s spawn-idle stability, excursion
  determinism, an excursion `eatenCount ≥ 300` floor, a SIZE ≥ 4 progression
  floor, and a finite-position guard. Per-scene differences (exported tables,
  which `sceneAmbient` kinds exist, the slack threshold) are always a
  parameter to the shared probe, never a second implementation — duplicated
  probe bodies across the file went from 19 to 0 in the 2026-08-05 refactor.
  Manhattan (Lower Manhattan) still runs only 4 of these (ownership, camera
  coverage, park-under-water, idle stability) — a deliberate, recorded
  decision at its call site, not an oversight, since that scene has never
  been re-authored against the other ten. Manhattan also keeps its own
  scripted WTC excursion (must eat ≥ 100) plus an expansion-district sweep.
  The gallery run also asserts the instant-collapse default never leaves
  blocks in a delayed `unstable` state after a simulation step, plus
  solid-vs-mover and loose-body overlap separation probes.

## Gotchas

- **No `Math.random()`** — inject `this.rng` (seeded); the validator's guard
  now globs `js/voxelscene-*.js` (see conventions.md #1), so any new scene
  file is covered without an update here. Determinism also means: no
  `Date.now`, fixed iteration orders.
- Chunk grouping only uses blocks detached within `FRESH_WINDOW` (0.6 s);
  settled debris (`fallT = -1`) never re-groups — prevents rest-on-ground
  split/reform loops.
- Hole speed is `playerSpeedForRadius(radius) × SPEED_MULT` (1.4×) with a
  sandbox SIZE ramp of `1 + SANDBOX_SPEED_RAMP × sizeProgress`
  (`SANDBOX_SPEED_RAMP = 2.72`, raised from 0.75 on 2026-08-05): unlike campaign
  movement, the grown hole gets faster so the late ladder can cover the larger
  scene. Measured end to end: **9.96 m/s at SIZE 1 (unchanged — the SIZE 1 feel
  is the thing being held) and 26.12 m/s at SIZE 12, against 12.29 m/s before.**
  Upper Manhattan's 297 m diagonal therefore takes 11.4 s instead of 24.2 s.
  The landing number is not "constant body-lengths per second" — that rule would
  demand ~50 m/s at SIZE 12 (9.06 radii/s × 6.6 m), which is uncontrollable in a
  street grid and outruns what the chase camera can frame. It is set instead so
  the longest diagonal in the game stays in single digits to low teens of
  seconds at every size: 29.8 s → 11.4 s across the ladder, i.e. traversal gets
  materially *faster* as you grow instead of slower in real terms. Note the ramp
  lives in `voxelsim.js:step` and NOT in `playerSpeedForRadius` (`tiers.js`),
  which the campaign shares — the campaign's speed curve is untouched.
  Sandbox camera framing ramps from its max zoom-in multiplier (`0.7`) to max
  zoom-out (`1.5`) across the same `sandboxSizeProgress` curve, and so do the
  camera's yaw-chase rate and the manual Q/E orbit (see `.wiki/modules/render.md`).
  The old `driveMode` turn sensitivity ramp (`.20` → `.80`) is gone with
  `driveMode` itself.
- **Traversal time is now frame-rate-bound at SIZE 12, not speed-bound.**
  Measured live in Brooklyn at SIZE 12, the 263 m diagonal takes 10.02 s of SIM
  time but 14.81 s on the wall clock, because eating a district at max size
  drops the loop to ~13 fps and `main.js:314` clamps `realDt` at 0.1 s — every
  frame heavier than that silently drops sim time on the floor. Upper Manhattan
  is worse: 11.18 s sim / 19.84 s wall at ~9 fps. The speed ramp has done its
  job (10 s of sim time against 24 s before) and the remaining gap is a
  PERFORMANCE problem in the sandbox sim, not a movement one. Raising the ramp
  further would not close it — it would just make the hole outrun the frame
  rate by more. Do not tune `SANDBOX_SPEED_RAMP` against a wall-clock stopwatch
  without checking the sim clock first.
- Steel `maxSpan` is 3 (not 6). The shipped creak multiplier is 0, so support
  loss is immediate; setting Creak delay above 0 in SETTINGS restores the
  slower, readable rim-to-center collapse for tuning experiments.
- An earlier instant-recovery rule (unstable → static reset the stress timer
  whenever the hole moved off) made structures effectively indestructible
  while the player wiggled. Persistent damage replaced it — do not
  reintroduce free resets; the slow heal is the only recovery.
- The crack front must be seeded from SOLID support only. Seeding it from
  hanging (cantilevered) blocks inverts the collapse: the void's center
  measures distance 1 from the hanging ring and drops first, which reads as
  "driven by the hole's center". Rim-first is the intended feel.
- Multi-size gotchas: direction tests use y-range overlap (a block is
  "above" only when entirely above), not `gy` equality; consumption is
  top-sinks-below `SINK_Y`, not a center threshold (a 2 m block vanishing at
  center 0.35 would pop out of existence visibly above ground); fall speed
  uses density, never total block mass, or big slabs would out-fall small
  bricks of the same material.
- HUD: `hole.mass` is combo-inflated (can exceed the world total); the mass
  bar/label use `hole.rawMass` (un-multiplied). Combo label clamps at `x99+`.
- **Juice events** (render-side, deterministic): `eat` carries `chain`
  (every 10th chain: gold ring + shake + rising two-tone + escalating combo
  label color/size at 10/25/50); `growth` fires per SIZE level (arpeggio,
  `cam.fovKick` punch, confetti `spawnBurst`, center-screen "SIZE N!" pop);
  `milestone` fires at 25/50/75/100% of `totalMass` consumed (fanfare +
  white ring + toast). Rim material glows with combo intensity and blinks
  when the chain is about to drop.
- **SIZE levels** are the player-facing growth unit: `hole.size` 1..12 with
  escalating combo-mass thresholds `SIZE_MASS` (25 → 10 000). Radius is just
  an interpolation inside each level (+0.5 m per level from the 1.1 start).
  The shape is the design: early sizes are seconds away, each later level
  costs clearly more, and SIZE 12 (~79% of the scene's theoretical ×3-combo
  max) is reserved for sustained high combos on big targets. HUD shows
  "SIZE N → SIZE N+1 · pct" on a gold bar — never show raw radius to
  players. Pacing reference: crate pile ≈ SIZE 2, tower center ≈ SIZE 6-7
  at ~25 s, tour bot tops out at 9-10. The sandbox camera zooms with size:
  tight (~11 m) at SIZE 1, then a smoothstep ramp from SIZE 4 that clears
  the scene's tallest `cameraBlocker` (+8 m) by SIZE 10 — the
  see-over-any-building rule (`camera.js maxBlockerH`) — and holds there
  through SIZE 12 (~86 m dist, ~67 m high in Manhattan). The **gallery ships
  zero `cameraBlockers`**, so `maxBlockerH` is 0 there, the ramp never engages
  and the camera stays on the base curve (11 → 31 m) with no occlusion pull-in
  at all: the see-over rule is Manhattan-only today. The ramp is keyed to
  radius and an explicit SIZE 1→12 camera multiplier (`0.7→1.5`), i.e. to
  SIZE and to the mass-scaled ladder — in Manhattan it is
  fully out by SIZE 9-10, which costs 87-133% of the city's raw mass, so most
  of a session is played on the low half of the curve.
- **Scene-building rules** (all learned from spawn-collapse bugs):
  1. Two blocks may NEVER share a fine cell — the grid Map holds one owner,
     and the overwritten "ghost" block is unreachable in the support BFS, so
     it falls at spawn and cascades. Check building footprints before
     placing props (the furniture strip once sat inside the warehouse wall;
     a shelter bench inside the back wall; Broadway lamps inside City Hall
     and a bank facade; the El viaduct through a tower). The validator's
     cell-ownership probe catches this — run it for every scene change.
  2. Glass never carries load (`vertBond`/`horizBond` < 0.5): every pane
     needs a non-glass supporter at its own level, and nothing may rest on
     top of glass. Lamp heads/globes get a steel plate under the glass.
  3. Rails/beams must include cells DIRECTLY above their posts — a beam
     that starts one cell past the post top floats. Edge rails go on the
     deck's edge cell, not one past it (the El's x=25.5 rails floated —
     the deck ended at x=25).
  4. Mounting blocks (umbrellas, awnings) need a vertical path — a pole top
     at y must equal the mount's bottom y, no gap.
  5. Keep every object fully outside the spawn removal disc (radius×0.95 ≈
     1.05 m from (0,16)); corners count, not just centers.
  6. **Setback tiers must top out on a slab layer.** A tier whose top is a
     wall ring leaves the next tier's base slab floating over hollow
     interior — pick heights ≡ 0 (mod slabEvery) + 1 (curtain: 4k+1,
     masonry: 3k+1), or add an explicit full cap plate.
  7. **Slab plates need a ≤ maxSpan path to an edge or column, in hops.**
     Footprints ≥ 8 m need an interior column grid — an 8×8 masonry slab's
     center cell sits 4 hops out once window panes punch the vertical
     support field (glass period 3), so the old "columns only ≥ 9 m" rule
     dropped the two center cells at spawn. Quarter points
     (`floor(w/3)`, `w−1−floor(w/3)`) on long axes, middle row on the short
     one; 12×12 with {4,8}² loses the center cell (4 hops > 3).
  8. The **hanging threshold scales with the hole**: remR + (span + 1.5) ×
     radius/6.6 — ≈ 1.6 m at the 1.1 start radius, ≈ remR + span + 1.5 only
     at max radius. (The flat +1.5 let facades 4-5 m away pre-fail at
     SIZE 1 — the hole read as grabbing far beyond its circle.) For ANY
     supported block whose path includes a horizontal hop — keep structures
     ≥ 1.7 m from spawn, not just 1.05 m. Trinity's nave once sat 9 mm
     inside the OLD flat threshold (3.55 m) and dropped its roof into the
     hole.
  9. **Every structure ≥ 6 m needs a `cameraBlockers` entry** whose `h` is its
     true top, water tower and spire included, and whose AABB matches the
     footprint (not the district). Nothing in the sim derives these — a new
     building is invisible to the camera until someone types it in, which is
     how all nineteen original entries ended up being ≥ 9 m towers while a
     dozen 6-9 m mid-rises, the 58 m-long El viaduct among them, had none.
  10. **The placement step must equal the brick size.** `_block(x, …, 0.5)`
      walked on a 1 m step leaves 0.5 m gaps — the Battery Park "hedge row"
     was 13 isolated cubes for exactly this reason. Physics never complains
     (each cube is grounded), so only the eye catches it.
- Bond semantics are "outgoing carry capacity": a wheel (`rubber`) supports
  the car vertically (0.9) but shears off sideways (0.2). Don't read bonds as
  probabilities — the pre-2026-08-01 sim did per-frame dice rolls and whole
  buildings collapsed spontaneously.
- **Hierarchical zone-level simulation (the "structural zones" optimization)
  shipped 2026-08-05** as automatic connected-component zones inside
  `_recalcSupport` — see the Model section above. It was proved necessary,
  not optional: at Upper Manhattan's 73,393 blocks the whole-scene BFS this
  replaced was 80% of frame time while driving (48.55 ms/call), not the
  renderer. **The sim, not the renderer, is the per-frame cost on a large
  scene** — measured at 97% of frame time before this fix, and the renderer
  alone (draw calls, instancing, triangles) is 1-2 ms even on Upper
  Manhattan's 892k-triangle scene. If a future scene gets slow again, profile
  `voxelsim.js` first; do not assume it is `voxelworld.js`.
- `sim._floorBlocks` was removed 2026-08-05 (dead since the zone
  decomposition replaced its one caller).
- Internal invariants added by the zone work, worth knowing before touching
  `voxelsim.js`: `b.bi` is the block's index in `sim.blocks` (`id - 1`);
  `_falling` must stay sorted by id — any new transition into or out of state
  `falling` has to preserve that; `_sleepObs` buckets must stay sorted by id,
  membership is `asleep && !parentChunk`; any change to a block's support-graph
  membership must mark its zone in `_dirtyComps`; `_top`/`_sleepers`/
  `_collisionBuckets` are keyed by a packed integer `cellKey(x, z)` (valid for
  fine coordinates in ±8192), not the `"x,z"` strings they used before.
- **Settled rubble retires out of `_falling` (2026-08-05).** `_falling`'s frame
  cost is linear in its size, and `_syncFalling` only ever dropped `consumed`
  entries — settled-but-uneaten debris stayed in the list forever, so four
  per-step passes kept re-walking the same sleepers. Measured on a 120 s
  Brooklyn plough: 11,853 entries, 90% asleep. Settled blocks now retire into
  `_restIdx`, a coarse spatial index the hole sweeps each step; every wake
  path (support loss, the hole reaching a sleeper) revives them back into
  `_falling`. Retirement is **deferred past `FRESH_WINDOW`** on purpose:
  `_groupChunks` seeds its flood fill from `_falling`, so a block pulled out
  while still fresh is a seed that never fires, which would change which
  chunks form and in what order. `_sleepObs` is now **y-banded** — it used to
  key cells on `(x, z)` alone, so one cell of a deep pile held every sleeper
  in that column at every height. `_assertCellKeyRange` turns a silent
  aliasing failure loud: both cell-key packs (`cellKey`, the y-banded one)
  mask rather than range-check, so a scene that outgrows them would otherwise
  silently alias two far-apart columns into one bucket and present as phantom
  collisions against nothing.
