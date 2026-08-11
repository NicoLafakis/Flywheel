---
covers:
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "js/voxelkit.js"
  - "js/voxelforms.js"
  - "js/voxelsurfaces.js"
  - "js/voxelscene-manhattan.js"
  - "js/voxelscene-upper-manhattan.js"
  - "js/voxelscene-brooklyn.js"
  - "js/voxelscene-boston.js"
  - "js/voxelscene-cambridge.js"
  - "js/voxelscene-chicago.js"
---
# Voxel Sandbox (pile physics)

## Purpose

## Goal runs and rewards

Every sandbox is a complete replayable level. `VoxelSandboxSim` owns the
authored SIZE goal and deterministic coin scatter, collects coins during
`step()`, and emits coin/goal events. The renderer only mirrors those events.
Each run has 60 visible coins worth 2 coins each, plus a 35-coin goal bonus;
the save-side `recordSandboxResult()` persists completion history and rewards.
All authored city sandboxes use the READY establishing-shot path in `main.js`.

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
| `js/voxelkit.js` | The 5 object size classes (PROP 0.25 m / VEHICLE 0.5 m / SMALL_BLDG / LARGE_BLDG / MEGA) + their canonical builders (vehicles, trees, lamps, props, `tower()`), plus the streetscape/landmark kit (`setbackTower`, `streetWall`, `porticoFront`, `spiralRotunda`, `pathRibbon`, `stoneArch`, `basinRim`, and more — see the Upper Manhattan section below). Pure sim, shared by all three built-city scenes (Lower Manhattan, Upper Manhattan, Brooklyn). **Pass 4 (2026-08-10)** added twelve more gallery builders with no callers yet — `deliveryTruck`, `schoolBus`, `billboard`, `subwayStairEntrance`, `pierDeck`, `mooringBollard`, `dockCleat`, `motorLaunch`, `helipad`, `helicopter`, `fineTower`, `fineWarehouse` — the placement plan for wiring them into the gallery is staged for a follow-up commit. `subwayStairEntrance`, `pierDeck` and `helipad` reach for ADR-0013's anisotropic extents where a member is genuinely one piece; the rest stay on the cube ladder |
| `js/voxelscene-manhattan.js` | `buildManhattan(sim)`: the full Lower Manhattan peninsula (~25.8k blocks). Sets `bounds`/`boundsRect`, `sceneDecor`, `cameraBlockers` |
| `js/voxelscene-upper-manhattan.js` | `buildUpperManhattan(sim)`: the full Central Park + Upper Manhattan district (73,393 blocks / 86,083 mass). Sets its own bounds, landmarks, curb kit, decor, and camera blockers |
| `js/voxelscene-brooklyn.js` | `buildBrooklyn(sim)`: bridges-to-Coney-Island sandbox, 1.35 blocks/m² |
| `js/voxelscene-boston.js` | `buildBoston(sim)`: Seaport, Fort Point and the BCEC (82,894 blocks, 2.0 blocks/m²) — see the Boston section below |
| `js/voxelforms.js` | The twelve anisotropic primitives ADR-0013 unlocked (`slab`, `column`, `beam`, `panel`, `mullion`, `cornice`, `pier`, `plinth`, `tread`, and the rest), sitting below `js/voxelkit.js`. Geometry only — no named buildings, no city semantics. Pure sim |
| `js/voxelscene-cambridge.js` | `buildCambridge(sim)`: East Cambridge around 2 Canal Park, the first scene authored in the `voxelforms.js` vocabulary. All ten districts built and the map complete at 72,943 blocks with the dead-ground census at zero; wired into the sim's scene dispatch, `AUTHORED_SCENES` and `FREE_PLAY`, and validated by `validateCambridge()`. Phase 7's hidden content and the Phase 8 sign-off are still ahead |
| `js/voxelscene-chicago.js` | `buildChicago(sim)`: the Loop and Chicago River map, ground-up rebuilt on the Cambridge method (44,578 blocks, SIZE 7 reachable via `tools/chicago-probe.mjs`). Real street grid single-sourced through `CHICAGO_STREETS`; the river wraps north and west with three bascule bridges (LaSalle, State, DuSable); the 'L' Loop is a full four-corner elevated circuit (Lake/Wabash/Van Buren/Wells) with three stations (State/Lake, Washington/Wabash, Quincy) and a four-car CTA train riding it continuously via the new render-only mover seam. ~15 named landmarks (Willis Tower, Board of Trade/Ceres, Marina City, the Chicago Theatre blade, Cloud Gate, Wrigley, Tribune, and more). **Committed and playable, but as of this sync NOT reachable from the shipped title-screen menu:** `js/main.js`'s `AUTHORED_SCENES` entry, `js/ui/screens.js`'s free-play chip, and `tools/validate.mjs`'s `validateChicago()` gate are uncommitted in a concurrent session's working tree, and `chicago` is deliberately absent from `js/net/protocol.js`'s `ARENA_SCENES` allowlist ("ships later"). Verify with the dev-only `tools/scene-view.html?scene=chicago` or `node tools/chicago-probe.mjs`, not the live menu, until that wiring lands |
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
   glass shears off. Chunks get uniform gravity (`_fallG` returns
   `tune.gravity` unconditionally as of 2026-08-11, RCA-2026-08-11 fix 3 —
   material density used to scale it, up to a 2.3x spread between glass and
   steel, which the product owner overruled: every block now accelerates
   downward identically), rim torque, attraction-zone inward pull, and
   ground-impact splitting along the weakest bonds.
3. **Debris** — groups < 3 blocks and all `loose`-material blocks get cheap
   individual physics: uniform gravity (same `_fallG` fix), bounce, friction,
   rim tip-over (only when the hole-facing edge really overhangs the void),
   inward funnel. The vacuum acts only on airborne/sliding bodies — grounded
   blocks feel no attraction — and debris sleeps anywhere once slow,
   grounded, and contact-free (the hole wakes sleepers when it reaches
   them; support loss wakes the rest). Landing and vertical-contact tests
   only accept a support surface the block's pre-move base was at or above
   (`_supportBelow` walks the grid downward for the real support otherwise,
   and the `vy` bounce on contact only fires for floor-character hits) — see
   the gotcha below; RCA-2026-08-11 has the full mechanism and numeric
   reproduction, resolved by commit 235c82d.
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
removal zone → raw mass (`mat.mass × s³`) into `h.rawMass` and multiplied
score (`× comboMult(chain)`) into `h.mass`, combo (window `COMBO_WINDOW`,
1.5 s, mirrors `sim.js`), and SIZE progression via escalating `SIZE_MASS`
thresholds read against **`h.rawMass`** (radius interpolates +0.5 m per
level from the 1.1 start). The combo is points-only as of ADR-0015: it
buys score and never growth, so a hot chain cannot make the hole bigger.
The ladder scales per scene (`× min(10, max(1, round(totalMass/4200)))` —
gallery is exactly ×1, Manhattan ×10 at its 43,593 mass, Upper Manhattan ×10
at its 86,083 mass) so progression pacing is scene-relative. The multiplier
clamps at ×10: Upper Manhattan's raw ratio is `round(86083/4200) = 21`, so it
is pinned at the ceiling and cannot re-pace any harder however much mass a
future pass adds.

Because the ladder now reads RAW mass, the top levels are no longer priced
against a combo that can no longer pay for them, and the thresholds came down
to match (ADR-0015). In absolute terms Manhattan's SIZE 8 costs 2,694 raw mass
— **6.2% of the city**, against 53% of a 1× combo run before — SIZE 10 costs
6,306 (14.5%) and SIZE 12 costs 14,757 (33.9%). In Upper Manhattan SIZE 12 is
17.1% of the scene. Every level is now reachable by excavation alone, which is
the point: growth is a reward for eating, and the combo is a reward for eating
*fast*. Re-check this whenever scene mass changes: the ladder re-paces silently
up to the ×10 ceiling, and it drags the camera's SIZE-keyed zoom ramp with it.
`tools/validate.mjs` pins a per-scene SIZE floor set to the level each scripted
excursion reached on the OLD combo-mass ladder (Manhattan's WTC excursion ≥ 8,
its expansion-district sweep ≥ 5, Upper Manhattan / Brooklyn / Boston ≥ 5,
Cambridge ≥ 7, the gallery tour ≥ 8), so the rebase cannot quietly cost a scene
a level; Upper Manhattan also floors `eatenCount ≥ 300`.

## Scenes

Seven scene files exist and the sim can boot any of them
(`new VoxelSandboxSim({ scene })`, default `'gallery'`): `gallery`,
`manhattan`, `upper-manhattan`, `brooklyn`, `boston`, `cambridge`, and
`chicago`. Six are reachable from the shipped title-screen menu today.
Cambridge is the full ten-district East Cambridge map documented in
[features/cambridge-sandbox/](../features/cambridge-sandbox/README.md).
Chicago is a complete, playable Loop map (see the Key Files table's entry for
what it contains) but is not yet wired into the shipped menu or the live
arena's scene allowlist — that wiring is a separate, concurrent session's
uncommitted work as of this sync; see the chicago section below.
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

### chicago (CHICAGO: THE LOOP AND THE CHICAGO RIVER)

44,578 blocks / ~254,000 mass over `x[-120,108] z[-116,84]`, ground-up rebuilt from a prior
map the product owner rejected as misaligned, oddly bright, and missing the
el's corners. Every road, kerb, crossing and el segment is now derived from
one declared street table (`CHICAGO_STREETS`) so the four can never disagree
again. The Chicago River wraps the north and west edges (Main Branch,
South Branch, Wolf Point) and is crossed by three bascule bridges — LaSalle,
State, and the double-width DuSable at Michigan — each with tender houses.
South of the river is the real numbered grid (Wacker, Wells, LaSalle, State,
Wabash, Michigan north-south; Wacker, Lake, Washington, Monroe, Adams,
Van Buren east-west). The 'L' Loop is a genuine four-corner elevated circuit
over Lake/Wabash/Van Buren/Wells, with corner posts, corner decks and
stepped-arc special work at all four junctions, and three stations
(State/Lake, Washington/Wabash, Quincy) with cantilevered platforms and
canopies. A four-car CTA train runs the circuit continuously via the new
render-only mover seam (`sim.sceneMovers` + pure `moverArc`/`moverPose` in
`js/voxelsim.js`, an instanced mover pass in `js/voxelworld.js`) — pose is a
pure function of the deterministic sim clock, so host and peer render the
same train, and future movers (boats, streetcars) get the seam for free.

~15 named landmarks at their real relative positions: Willis Tower's nine
bundled setback tubes, the Board of Trade closing the LaSalle vista with
Ceres on its pyramid, Marina City's two corncob drums, the Mies-black IBM
slab, the Wrigley Building and Tribune Tower on the north bank, the Chicago
Theatre's gold CHICAGO blade, Harold Washington Library, the Carbide & Carbon
tower, and Millennium Park (Cloud Gate, Crown Fountain, the Pritzker
trellis). Palette is low-chroma steel/limestone/terracotta with exactly four
saturated hero accents (Willis crown/antennas `0xdfe3e7`, Ceres `0xaebbc3`,
the Theatre's gold blade `0xd9a832`, Cloud Gate's chrome `0xc9d2d8`), each
guarded by `probeHeroIdentity` so no stray bright block appears elsewhere.
Park lawns render correctly (df82cf0 — the shared
sidewalk sheet used to bury Millennium Park's grass; it now stops at park
edges) and the empty band east of Michigan/north of the park carries a
Prudential/Aon tower pair. `tools/chicago-probe.mjs` is the headless
correctness gate (SIZE-7 deterministic route, block count, idle stability);
`tools/scene-view.html?scene=chicago` is a dev-only viewer for eyeballing an
unwired scene against the deployed build without touching menu code.

**Not yet shipped.** The scene file itself is committed, but reaching it
requires either the dev tools above or code that has not landed yet: see the
Key Files table entry above for exactly which files are uncommitted.

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
Met (756 eaten, 1,398 raw mass, SIZE 5 — on the old combo-mass ladder the same
route read 721 eaten / 3,680 combo mass / SIZE 4 at 37.8 s; the discriminator that
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

**Accepted and shipped:** [ADR-0013](../adr/0013-anisotropic-voxel-primitives.md)
widened a block from a cube to an axis-aligned box (independent `sx/sy/sz`),
authored through the `js/voxelforms.js` layer below `js/voxelkit.js`, with
`js/voxelscene-cambridge.js` as its debut scene. Every shipped scene stayed
byte-identical across the change. See
[features/cambridge-sandbox/](../features/cambridge-sandbox/README.md),
especially
[01-voxel-primitive-vocabulary.md](../features/cambridge-sandbox/01-voxel-primitive-vocabulary.md)
(the capability audit against this file's cost model) and
[00-objective-overview.md](../features/cambridge-sandbox/00-objective-overview.md).

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
  determinism, an excursion `eatenCount ≥ 300` floor, a per-scene SIZE
  progression floor (the level that scene reached on the pre-ADR-0015 ladder,
  so 5 for most and 7 for Cambridge), and a finite-position guard. Per-scene differences (exported tables,
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
  center 0.35 would pop out of existence visibly above ground). Fall speed is
  uniform gravity as of 2026-08-11 (`_fallG` returns `tune.gravity`
  unconditionally) — density still drives mass, bonds and scoring, just not
  acceleration; before this fix density scaled gravity too, which the
  product owner overruled (glass fell 0.64x concrete's rate).
- **`_topAt` answers "highest surface in this column" (occlusion), not
  "highest surface below me" (support) — a caller that conflates the two
  teleports debris onto rooftops.** A ground-level block whose footprint
  overlaps a still-standing tower's column used to read the tower's roof as
  its landing surface and snap there in one step (measured up to 30.9 m in a
  single frame; RCA-2026-08-11). Landing and +y-contact tests now only
  accept a support the block's pre-move base was at or above; when rejected,
  `_supportBelow` walks the grid downward for the real support instead. Any
  future caller of `_topAt`/`_top` must state which question it is asking —
  the two only agree in open terrain. The paired symptom (mid-air hover) was
  a floor-only vertical bounce firing on pure facade scrapes, cancelling
  gravity every frame; the `vy` reflection now gates on floor-character
  contact. Regression coverage: `js/voxelsim.gravity.test.mjs`.
- HUD: `hole.mass` is combo-inflated (can exceed the world total) and is now
  the displayed SCORE, on its own plate under the goal bar. The goal
  bar/label, the milestone ladder **and the SIZE ladder** all read
  `hole.rawMass` (un-multiplied) — see ADR-0015. The old combo pill is gone;
  the chain is drawn by the ring meter in the right column, which imports
  `comboMult` from the sim rather than mirroring it.
- **Juice events** (render-side, deterministic): `eat` carries `chain`;
  `combo` fires once per LEVEL gained (levels 1-4 get a tick and a meter
  change only, 5+ add particles and shake); `growth` fires per SIZE level
  (arpeggio, `cam.fovKick` punch, confetti `spawnBurst`, center-screen
  "SIZE N!" pop); `milestone` fires on each row of the `MILESTONES` table,
  keyed to a fraction of the scene GOAL rather than of `totalMass`, and is
  dressed as a full-width band. All four go through the HUD's announcement
  priority queue (`ANN`), so a coin toast can no longer erase a milestone.
  Rim material glows with combo intensity and blinks when the chain is about
  to drop.
- **SIZE levels** are the player-facing growth unit: `hole.size` 1..12 with
  escalating RAW-mass thresholds `SIZE_MASS` (24 → 4 919). Radius is just
  an interpolation inside each level (+0.5 m per level from the 1.1 start).
  The shape is the design: early sizes are seconds away, each later level
  costs clearly more, and SIZE 12 (about a third of a big scene's total raw
  mass) is reserved for a long, sustained excavation — not for a lucky chain,
  which since ADR-0015 buys score only. HUD shows
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
  fully out by SIZE 9-10, which after the ADR-0015 rebase costs 9.5-14.5% of
  the city's raw mass rather than 87-133%, so the wide end of the camera curve
  is now something a normal session actually reaches.
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
