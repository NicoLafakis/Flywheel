---
covers:
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "js/voxelscene-manhattan.js"
  - "js/voxelscene-upper-manhattan.js"
---
# Voxel Sandbox (pile physics)

## Purpose

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
| `js/voxelkit.js` | The 5 object size classes (PROP 0.25 m / VEHICLE 0.5 m / SMALL_BLDG / LARGE_BLDG / MEGA) + their canonical builders (vehicles, trees, lamps, props, `tower()`). Pure sim, shared by both scenes |
| `js/voxelscene-manhattan.js` | `buildManhattan(sim)`: the full Lower Manhattan peninsula (~25.8k blocks). Sets `bounds`/`boundsRect`, `sceneDecor`, `cameraBlockers` |
| `js/voxelscene-upper-manhattan.js` | `buildUpperManhattan(sim)`: the Central Park / Upper Manhattan park district (~8.4k blocks). Sets its own bounds, landmarks, curb kit, decor, and camera blockers |
| `js/voxelworld.js` | `VoxelWorld3D`: one `InstancedMesh` per material + brick size with per-instance paint colors, cached static transforms, and per-frame dynamic motion; renders `sceneDecor` (roads/sidewalks/parks/bike paths/markings/water) |

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
   coverage change, consumption, detachment), never per-frame.
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
   per step, fine-column buckets padded 1 cell). Moving bodies also get full
   AABB separation against nearby solid collision buckets when a directional
   or top-surface probe finds contact; chunk members split on solid overlap.
   Blocks resting on loose
   rubble treat it as support (`_restLoose`) so piles quiet bottom-up;
   sleep is committed only after the contact pass proves the block
   contact-free, so nothing freezes mid-overlap. Chunk/debris tumble is
   capped (~0.6–0.7 rad): slabs lean, they don't pirouette.

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
The ladder scales per scene (`× max(1, round(totalMass/4200))` — gallery is
exactly ×1, Manhattan ×10 at its 43,593 mass) so progression pacing is
scene-relative. In absolute terms Manhattan's SIZE 8 costs 23,000 combo-mass
(53% of the entire city at a 1× combo), SIZE 10 costs 133% and SIZE 12 costs
230% — the top levels are reachable only on sustained combos, by design.
Re-check this whenever scene mass changes: the ladder re-paces silently, and
it drags the camera's SIZE-keyed zoom ramp with it. `tools/validate.mjs` pins
a floor (the WTC excursion must reach ≥ SIZE 4).

## Scenes

Three levels share the sim (`new VoxelSandboxSim({ scene })`, default
`'gallery'`). Scene builders run inside the constructor, may set
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

~8,400 blocks across a separate Upper Manhattan park district (bounds
`x[-54,54] z[-60,68]`):

- **Central Park core**: a large green footprint with geographically placed
  Reservoir, The Lake, Harlem Meer, Bethesda Terrace, Belvedere Castle, trees,
  benches, and loop-path lamps
- **Park-edge landmarks**: Belvedere Castle, the Metropolitan Museum of Art,
  the Dakota / Upper West Side, Museum Mile buildings, and Harlem / Morningside
  blocks
- **Street dressing**: Central Park West and Fifth Avenue, the 59th/72nd/
  86th/96th/102nd/110th cross streets, sidewalks, loop bike paths, striped
  crosswalks, lane markers, oriented taxis/bus/delivery traffic, subway
  entrances, hydrants, waste bins, traffic lights, newsstand, hot-dog cart,
  and curbside lamps

The scene is intentionally separate from Lower Manhattan: its spawn starts on
the park promenade and the validator drives through the park to the Reservoir,
Belvedere Castle, the Met, and the Upper West Side. Camera blockers cover the
castle turret overhangs and every perimeter structure at least 6 m tall. The
street bands are a placement contract: tall structures, foliage, benches, and
other physical props stay off asphalt; every intersection reuses the same
five-stripe zebra template and sidewalk offsets.

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

Physics come from the material; paint is a per-block `color` override
(grouped into instancing batches by `matType:size:color`). Glass must never
have to carry load (strips between columns). Roof caps must sit on a full
slab or have span support at their own level — a ring at y=N does NOT
support a cap at y=N+1 above the ring's hollow interior. Keep every object
fully outside the spawn removal disc (radius×0.95 ≈ 1.05 m from (0,16)) and
mind the hanging threshold — remR + (span + 1.5) × radius/6.6, ≈ 1.6 m at
the 1.1 start radius — for anything whose support path includes horizontal
hops.

## Talks To

- **main.js** — `step(1/60, move)` + `drainEvents()` (`eat`, `crash`);
  `hud.updateSandbox(sim)` for mass/combo/elapsed
- **tools/validate.mjs** — determinism (two seeded runs identical), locality
  (nothing moves while the hole is far), progressive collapse, NaN guard,
  `Math.random` source guard for all pure-sim files (incl.
  `voxelscene-manhattan`). Manhattan: fine-cell ownership (ghost/overlap
  guard), 3 s spawn-idle stability, a scripted WTC excursion (must eat ≥ 100)
  plus a second expansion-district sweep, per-footprint-cell camera-blocker
  coverage (every cell ≥ 6 m needs an entry with `h` ≥ its top), a SIZE ≥ 4
  progression floor, and a decor draw-order check (no park rect may sit fully
  inside a water rect — it would never render). Upper Manhattan adds the same
  ownership/camera/decor/idle checks plus a deterministic park-to-perimeter
  excursion (must eat ≥ 100 and reach SIZE ≥ 4). The gallery run also asserts
  the instant-collapse default never leaves blocks in a delayed `unstable`
  state after a simulation step, plus solid-vs-mover and loose-body overlap
  separation probes.

## Gotchas

- **No `Math.random()`** — inject `this.rng` (seeded); the validator greps
  for it. Determinism also means: no `Date.now`, fixed iteration orders.
- Chunk grouping only uses blocks detached within `FRESH_WINDOW` (0.6 s);
  settled debris (`fallT = -1`) never re-groups — prevents rest-on-ground
  split/reform loops.
- Hole speed is `playerSpeedForRadius(radius) × SPEED_MULT` (1.4×) with a
  sandbox SIZE ramp of `1 + 0.75 × sizeProgress`: unlike campaign movement,
  the grown hole gets faster so the late ladder can cover the larger scene.
  Drive turn sensitivity ramps from `.20` at SIZE 1 to `.80` at SIZE 12;
  camera framing ramps from its max zoom-in multiplier (`0.7`) to max zoom-out
  (`1.5`) across the same curve.
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
- Hierarchical zone-level simulation (spec's "structural zones" optimization)
  is intentionally not implemented — the event-driven BFS handles the
  Manhattan scene's ~25,800 blocks fine (sim build ~1.3 s, recalcs are
  local). The per-frame cost is the renderer's instance matrix loop; on
  weak GPUs that's the first place to look (bigger instancing buckets,
  skip sleeping blocks). Revisit zoning only past ~30k blocks.
