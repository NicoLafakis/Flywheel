// Upper Manhattan — Central Park, rebuilt.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
//
// Axes match every other scene: x = east, z = south, north = -z. The frame is
// the park and the ground it sits in, a north→south ladder 196 m long:
//
//   z -101..-96  Central Park North (110th St) + the two 110th St circles
//   z  -96..-46  the north park — Harlem Meer, the North Woods and the
//                Ravine, the Great Hill, the Pool, the Conservatory Garden,
//                the North Meadow
//   z  -46..-3   the Reservoir belt — the largest object in the park, its
//                running track, its bridle ring and its two gatehouses
//   z   -3..+26  Pinetum · the Great Lawn (SPAWN sits at 0,16) · Turtle Pond
//   z  +26..+52  the Ramble · the Lake · Bank Rock Bay · Conservatory Water
//   z  +52..+73  Bethesda · the Mall · Sheep Meadow
//   z  +73..+100 the south park — Zoo, Wollman, the Pond, Heckscher
//   z +100..+105 Central Park South (59th St)
//
//   west of CPW  the Upper West Side: Columbus, Amsterdam, Broadway
//   east of 5th  Museum Mile, Madison, Park with its median, Lexington
//   z -145..-102 Harlem and Morningside Heights, on a compressed grid
//   z  100..113  Columbus Circle, Grand Army Plaza and 59th Street
//
// SCOPE — this file was rebuilt in four passes. PASS 1 laid the scaffolding,
// the whole park's SURFACE layer, the circulation system, and the built
// features of the north park and the Reservoir belt. PASS 2 added every
// structure in the mid and south park. PASS 3 (this state) built the CITY: the
// Central Park West twin-tower rhythm and the Upper West Side, Fifth Avenue's
// flat limestone wall and Museum Mile, the Metropolitan Museum inside the park,
// Harlem and Morningside Heights, Columbus Circle and Grand Army Plaza, the
// avenue grid, and the street life on the kerb.
//
// BRICK SIZES — load-bearing decisions, not decoration:
//   1 m    landforms (the Great Hill, the rock outcrops, Belvedere's crag), the
//          park wall, water rims, arches, pavilions, and — since Pass 3 — every
//          building in the city. There is still no 2 m brick here: the tallest
//          thing in the level is 30 m and 4 m across, and a 2 m lattice cannot
//          express a four-metre-deep street wall at all.
//   0.5 m  trees, fences, pergolas, statues, vehicles, tower crowns, mansard
//          courses, cornices, stoops, fire escapes, and the follies whose real
//          footprint is under 5 m.
//   0.25 m railings, balustrades, gates, curb furniture, sign lettering, the
//          watchtower's lattice, the spawn clutter, and the whole density pass —
//          an isolated 0.25 m prop is what a SIZE 1 hole can actually bite, and
//          a continuous paving field is not.
//
// SCENE CONTRACTS (each one is validator-enforced, or enforced by construction
// through a kit builder that cannot express the broken version):
//   - one block per fine cell; placement step always equals the brick size
//   - nothing floating: arches are CORBELLED (support never flows downward),
//     fence rails run continuously over their posts, roof rings sit on plates
//   - no ground-anchored block inside a `roads` rect except the vehicles in
//     UPPER_MANHATTAN_VEHICLES, which is exported as the allowlist
//   - every water rect is rimmed FROM the water rect by basinRim(), so the
//     plane and its bank can never drift apart (two of the old three had)
//   - water never covers a road, plaza, sidewalk or crosswalk
//   - crosswalk stripes come from the axis-aware kit helper, never a hand roll
//     (the old inline addZebra always stepped in z and half its crossings
//     rendered as one solid bar down the middle of the avenue)
//   - sceneDecor's key order equals DECOR_LAYERS' draw order
//   - cameraBlockers are GENERATED from the finished geometry
//
// The park green is x[-22,22] z[-96,100]; everything inside it stands on that
// base rect, so nothing in the park can end up on raw ground. Anything OUTSIDE
// it lays its own surface first — that is the rule the old scene broke 929
// times.

import {
  amphitheater, archBridge, balustrade, basinRim, bench, bigTruck, bikeRack, bollard,
  boxVan, bus, cafeTable, carousel, castleFolly, crateStack, crenellation, crownedTower,
  drinkingFountain, elmTunnel, equestrian, fenceRun, gazebo, generateBlockers, glassSphere,
  grandStair, halfDomeShell, hotDogCart, hydrant, lampPost, laneDashes, latticeTower,
  lightMast, mailbox, mansardRoof, marketStall, marqueeSign, metroViaduct, mosaicDisc,
  motorcycle, naveChurch, newsBox, newsstand, obelisk, parkWall, pathRibbon, pavilion,
  pergola, planter, playgroundSet, porticoFront, rockMound, roundHouse, rowBlock, rowBoat,
  sailBoat, sandwichBoard, scaffoldShed, sedan, setbackTower, signPost, signText,
  spiralRotunda, statue, stoneArch, streetWall, subwayEntrance, tieredFountain, tower,
  trafficLight, trashBags, trashBin, tree, TREE_FOOTPRINT, treeGrove, twinTowerBlock,
  waterTower, zebra,
} from './voxelkit.js';

// Footprint of a vehicle entry. Shared with every other scene; re-exported so
// the vehicle list and the thing that resolves it live at the same import.
export { vehicleBBox } from './voxelkit.js';

// One table drives roads, both sidewalks, and the centreline dashes, so a
// street can never ship with its sidewalk on the wrong side. The old scene kept
// roads, sidewalks and lane markers as three independent hand lists, and the
// result was 98 of every 110 m of each avenue's west kerb with no sidewalk at
// all plus six lane dashes floating past the end of the asphalt.
//
// Only the four true STREETS are here. The park's own drives, transverses and
// paths are curvilinear surfaces (see the circulation block below) and get no
// sidewalk, no dashes and no crossings.
// PASS 3 laid the avenue grid on top of Pass 1's four park-front streets. Two
// of those four had to be RE-CUT rather than extended, and both re-cuts are the
// reason a Pass 2 item could not be built:
//   - Fifth Avenue now stops at z 92 and resumes at x 25 for z 92..112, so the
//     avenue bends east around Grand Army Plaza instead of paving over it. That
//     is what finally makes room for the Pulitzer Fountain and the plaza's own
//     granite (Pass 2 §7 could not place either — their bboxes were roadway).
//   - Central Park South stops at x 22 for the same reason; past that it is
//     plaza, not asphalt.
// Central Park West stops at z 100 where Columbus Circle's ring takes over: a
// circle is FOUR road rects around a plaza island, and a through-running rect
// would have put the Columbus Column inside a roadway.
export const UPPER_MANHATTAN_STREETS = [
  // --- the four the park itself fronts on
  { x: -27, z: -95, w: 3.5, d: 193, axis: 'z' },     // 0  Central Park West (z -95..98)
  { x: 23.5, z: -95, w: 3.5, d: 187, axis: 'z' },    // 1  Fifth Avenue, north of Grand Army Plaza
  { x: -24, z: -100.5, w: 48, d: 3.5, axis: 'x' },   // 2  Central Park North (110th)
  { x: -24, z: 100.5, w: 45.5, d: 3.5, axis: 'x' },  // 3  Central Park South (59th), x -24..21.5
  // --- the west-side avenues. Columbus breaks at the Natural History Museum's
  //     superblock, Amsterdam at Lincoln Center's — both are real superblocks
  //     and both would otherwise have an avenue running through the building.
  { x: -37.5, z: -145, w: 3, d: 157, axis: 'z' },    // 4  Columbus Ave, north of the museum (z -145..12)
  { x: -37.5, z: 33, w: 3, d: 66.5, axis: 'z' },     // 5  Columbus Ave, south of it
  { x: -47.5, z: -93, w: 3.5, d: 166, axis: 'z' },   // 6  Amsterdam Ave, north of Lincoln Center
  { x: -47.5, z: 90, w: 3.5, d: 9.5, axis: 'z' },    // 7  Amsterdam Ave, south of it
  { x: -56.5, z: -145, w: 3, d: 244.5, axis: 'z' },  // 8  Broadway
  { x: -27, z: -145, w: 3.5, d: 44.5, axis: 'z' },   // 9  Frederick Douglass Blvd (CPW's line, north)
  // --- the east-side avenues
  { x: 23.5, z: -145, w: 3.5, d: 45, axis: 'z' },    // 10 Fifth Ave, Harlem
  { x: 24.5, z: 92, w: 3, d: 21, axis: 'z' },        // 11 Fifth Ave, bending round Grand Army Plaza
  { x: 34.5, z: -145, w: 3, d: 258, axis: 'z' },     // 12 Madison Ave
  { x: 43.5, z: -145, w: 2.5, d: 258, axis: 'z' },   // 13 Park Ave, west carriageway
  { x: 48, z: -145, w: 2.5, d: 258, axis: 'z' },     // 14 Park Ave, east carriageway
  { x: 56.5, z: -145, w: 3, d: 258, axis: 'z' },     // 15 Lexington Ave
  { x: 7, z: -145, w: 3, d: 45, axis: 'z' },         // 16 Lenox Ave / Malcolm X Blvd
  { x: -10, z: -145, w: 3, d: 45, axis: 'z' },       // 17 Adam Clayton Powell Jr Blvd
  // --- Harlem's cross-street grid. Shallow blocks, wide east-west: the plan's
  //     north-south compression (1.6 m a real block) is exactly this shape.
  { x: -33, z: -140.5, w: 90, d: 2.5, axis: 'x' },   // 18 W/E 138th St (Striver's Row)
  { x: -33, z: -132, w: 90, d: 2.5, axis: 'x' },     // 19 W/E 135th St
  { x: -33, z: -123.5, w: 90, d: 2.5, axis: 'x' },   // 20 W/E 130th St
  { x: -33, z: -115, w: 90, d: 3.5, axis: 'x' },     // 21 W/E 125th St — the commercial spine
  // --- the side streets that break the Upper West and Upper East Side bands.
  //     Every z below falls in a GENERIC stretch of the avenue wall: a side
  //     street through the Dakota or the Guggenheim is a hole in a landmark.
  { x: -62, z: -78, w: 33, d: 2.5, axis: 'x' },      // 22 W 104th St
  { x: -62, z: -50, w: 33, d: 2.5, axis: 'x' },      // 23 W 97th St
  { x: -62, z: -30, w: 33, d: 2.5, axis: 'x' },      // 24 W 92nd St
  { x: -62, z: 2, w: 33, d: 2.5, axis: 'x' },        // 25 W 85th St
  { x: -62, z: 66, w: 33, d: 2.5, axis: 'x' },       // 26 W 68th St
  { x: 28.5, z: -84, w: 36, d: 2.5, axis: 'x' },     // 27 E 106th St
  { x: 28.5, z: -44, w: 36, d: 2.5, axis: 'x' },     // 28 E 95th St
  { x: 28.5, z: 10, w: 36, d: 2.5, axis: 'x' },      // 29 E 82nd St
  { x: 28.5, z: 44, w: 36, d: 2.5, axis: 'x' },      // 30 E 73rd St
  { x: 28.5, z: 84, w: 36, d: 2.5, axis: 'x' },      // 31 E 62nd St
];

// Length of a crossing along its street's direction of travel.
export const XW_LEN = 2.8;

// `[streetIndex, at]`, where `at` is an ABSOLUTE coordinate on the street's own
// axis and the crossing occupies `at .. at + XW_LEN`. Indexed against the table
// above rather than against "some road rect" on purpose: two collinear streets
// share a band, so a crossing that overshoots one lands on the other's asphalt
// and renders as a perfectly ordinary crossing on the wrong street.
export const UPPER_MANHATTAN_CROSSINGS = [
  [0, -90], [0, -46], [0, -4], [0, 48], [0, 94],   // Central Park West (z -95..98)
  [1, -90], [1, -46], [1, -4], [1, 48], [1, 86],   // Fifth Avenue north (z -95..92)
  [2, -18], [2, 8],                                // Central Park North (x -24..24)
  [3, -18], [3, 8],                                // Central Park South (x -24..21.5)
  [4, -120], [4, -60], [4, -4],                    // Columbus Ave north (z -145..14)
  [5, 46], [5, 92],                                // Columbus Ave south (z 33..99.5)
  [6, -60], [6, -4], [6, 46],                      // Amsterdam Ave north (z -93..73)
  [8, -120], [8, -60], [8, -4], [8, 46], [8, 92],  // Broadway (z -145..99.5)
  [9, -136], [9, -122], [9, -107],                 // Frederick Douglass Blvd
  [10, -136], [10, -122], [10, -107],              // Fifth Ave, Harlem
  [12, -122], [12, -60], [12, -4], [12, 46], [12, 100], // Madison Ave
  [13, -60], [13, -4], [13, 46],                   // Park Ave west carriageway
  [14, -60], [14, -4], [14, 46],                   // Park Ave east carriageway
  [15, -122], [15, -60], [15, -4], [15, 46],       // Lexington Ave
  [16, -136], [16, -122], [16, -107],              // Lenox Ave
  [17, -136], [17, -122], [17, -107],              // Adam Clayton Powell Jr Blvd
  [18, -20], [18, 20],                             // 138th St (x -33..57)
  [19, -20], [19, 20],                             // 135th St
  [20, -20], [20, 20],                             // 130th St
  [21, -28], [21, -4], [21, 20], [21, 44],         // 125th St
  [22, -52], [23, -52], [24, -52], [25, -52], [26, -52],  // the Upper West Side side streets
  [27, 38], [28, 38], [29, 38], [30, 38], [31, 38],       // the Upper East Side side streets
];

// Every vehicle in the scene, placed FROM this list so the exported positions
// and the geometry can never disagree. Pass 3 fills it out with the avenue and
// Harlem traffic; these five exist so the shape is exercised and the placer is
// proven from Pass 1 onward.
export const UPPER_MANHATTAN_VEHICLES = [
  // Central Park West
  { kind: 'sedan', x: -26.5, z: -40, axis: 'z', color: 0xf7c948 },
  { kind: 'boxVan', x: -26.5, z: 58, axis: 'z', len: 5, color: 0xe8ecf2, color2: 0x2a5f9a },
  { kind: 'bus', x: -26.5, z: -8, axis: 'z', color: 0x2a5f9a },
  { kind: 'sedan', x: -26.5, z: 76, axis: 'z', color: 0x30343b },
  // Fifth Avenue
  { kind: 'sedan', x: 24.2, z: -62, axis: 'z', color: 0xc23b2e },
  { kind: 'bus', x: 24.2, z: 20, axis: 'z', color: 0x2a5f9a },
  { kind: 'sedan', x: 24.2, z: 62, axis: 'z', color: 0xf7c948 },
  { kind: 'boxVan', x: 24.2, z: -24, axis: 'z', len: 5, color: 0xf2f2f2, color2: 0xd97c2c },
  // Central Park North and South
  { kind: 'sedan', x: -10, z: -99.2, axis: 'x', color: 0x30343b },
  { kind: 'bus', x: 4, z: -99.2, axis: 'x', color: 0x8a2f3a },
  { kind: 'sedan', x: -14, z: 101.7, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'boxVan', x: 2, z: 101.7, axis: 'x', len: 5, color: 0xf2f2f2, color2: 0x3e8a5b },
  // Columbus / Manhattan Ave and Broadway
  { kind: 'sedan', x: -37, z: -78, axis: 'z', color: 0xf7c948 },
  { kind: 'sedan', x: -37, z: 0, axis: 'z', color: 0xc23b2e },
  { kind: 'bus', x: -37, z: 66, axis: 'z', color: 0x2a5f9a },
  { kind: 'sedan', x: -56, z: -128, axis: 'z', color: 0x30343b },
  { kind: 'boxVan', x: -56, z: -30, axis: 'z', len: 6, color: 0x8a8f98, color2: 0x2e5d3a },
  { kind: 'bus', x: -56, z: 40, axis: 'z', color: 0x8a2f3a },
  // Amsterdam Ave
  { kind: 'sedan', x: -47, z: -50, axis: 'z', color: 0xf7c948 },
  { kind: 'sedan', x: -47, z: 30, axis: 'z', color: 0x2e5d3a },
  // Madison, Park and Lexington
  { kind: 'sedan', x: 35, z: -40, axis: 'z', color: 0x2a5f9a },
  { kind: 'bus', x: 35, z: 34, axis: 'z', color: 0x8a2f3a },
  { kind: 'sedan', x: 44, z: -84, axis: 'z', color: 0xc23b2e },
  { kind: 'sedan', x: 48.5, z: 14, axis: 'z', color: 0xf7c948 },
  { kind: 'boxVan', x: 57, z: -14, axis: 'z', len: 5, color: 0xe8ecf2, color2: 0xc23b2e },
  { kind: 'boxVan', x: 57, z: 56, axis: 'z', len: 6, color: 0x8a8f98, color2: 0x2e5d3a },
  // Harlem: 125th Street and the north-south boulevards
  { kind: 'bus', x: -22, z: -114.5, axis: 'x', color: 0x8a2f3a },
  { kind: 'sedan', x: 2, z: -114.5, axis: 'x', color: 0xf7c948 },
  { kind: 'boxVan', x: 30, z: -114.5, axis: 'x', len: 5, color: 0xf2f2f2, color2: 0x2a5f9a },
  { kind: 'sedan', x: -9.5, z: -132, axis: 'z', color: 0x30343b },
  { kind: 'sedan', x: 7.5, z: -110, axis: 'z', color: 0xc23b2e },
  { kind: 'sedan', x: -26.5, z: -126, axis: 'z', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'sedan', x: 24.2, z: -138, axis: 'z', color: 0xf7c948 },
];

// The ONLY structures allowed to stand inside a roadway rect besides the
// vehicles, declared by explicit position and minimum underside height rather
// than by any size/height filter — a filter is what waves a bollard through.
//
// One entry: the Metro-North viaduct's deck over Park Avenue in Harlem. Its
// LEGS never appear here because they stand in the planted median between the
// two carriageways; only the deck, five metres up, is over asphalt. That split
// is the whole reason Park Avenue is declared as two 2.5 m carriageways rather
// than one wide one.
export const UPPER_MANHATTAN_ROAD_SPANS = [
  { minX: 43, maxX: 49, minZ: -145, maxZ: -100, minY: 4 },
];

// Ground that is empty ON PURPOSE, declared positionally with a reason, the way
// Brooklyn declares its rail-yard apron. Nothing is declared yet and that is the
// honest answer: every void inside this frame today is Pass 2 / Pass 3 build
// territory, not design. An interior void can never be declared away here — it
// has to be built or argued for — and "the edge of the map trails off" is the
// only rationale this table accepts.
export const UPPER_MANHATTAN_OPEN_GROUND = [];

export function buildUpperManhattan(sim) {
  sim.bounds = 150;
  // PASS 3 widened this from Pass 1's x[-36,36] z[-110,110]. Physical content
  // now runs x[-62,64] z[-145,112] — the Upper West Side out to Broadway's west
  // frontage, the Upper East Side out to Lexington, Harlem to 140th St and
  // Columbus Circle / Grand Army Plaza in the south. The rect hugs that by 3-4 m
  // on each side, well inside the 12 m of blank driving ground Brooklyn's probe
  // allows. It is deliberately NOT the geography plan's x[-64,64] z[-144,140]:
  // south of the Circle there is no content, and 28 m of empty asphalt-coloured
  // ground is the exact failure that probe exists to catch.
  sim.boundsRect = { minX: -66, maxX: 68, minZ: -149, maxZ: 116 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators, declared in DECOR_LAYERS draw order. Districts push
  // their own surfaces so a feature and the ground it stands on are always
  // written next to each other; the monolithic literal the old scene ended with
  // put every surface 150 lines away from the geometry it served.
  const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [];
  const roads = [], rail = [], bikePaths = [], laneMarkers = [], crosswalks = [];
  const water = [], boardwalk = [];

  // Overlap predicate factory: `blocked(rects, pad)(x, z)` is what every tree
  // scatter and prop cluster is filtered through, so foliage can never end up
  // in asphalt or standing in a pond.
  const blocked = (lists, pad) => (x, z) => lists.some((l) => l.some((r) =>
    x > r.x - pad && x < r.x + r.w + pad && z > r.z - pad && z < r.z + r.d + pad));

  // ==================================================================== FRAME
  // The park green. Everything inside x[-22,22] z[-96,100] stands on this, so
  // the "no building on raw ground" rule is satisfied by construction for the
  // whole park; only geometry OUTSIDE it has to lay its own surface.
  parks.push({ x: -22, z: -96, w: 44, d: 196, color: 0x35652f });

  // PASS 3 · DISTRICT GROUND. Four broad surfaces covering every square metre of
  // city outside the park green, laid FIRST so the streets, kerbs and plazas
  // below paint over them in draw order. This is the same rule the park solves
  // with its green: no building may stand on the raw ground plane, and the way
  // to guarantee it for two hundred buildings is one rect per district rather
  // than one rect per lot. Colour separates the three neighbourhoods at a
  // glance even before a wall goes up — warm grey west, cold pale grey east,
  // browner in Harlem.
  // They go in `plaza` rather than `sidewalks` so every later layer — the kerbs,
  // the cobbled medians, the asphalt — still paints on top of them in order.
  plaza.push(
    { x: -63, z: -146, w: 34.5, d: 260, color: 0x7c7669 },   // the Upper West Side
    { x: 27, z: -146, w: 38.5, d: 260, color: 0x86847e },    // the Upper East Side
    { x: -28.5, z: -146, w: 55.5, d: 44, color: 0x74695c },  // Harlem, between the boulevards
    { x: -28.5, z: 100, w: 50, d: 14, color: 0x807a6e },     // south of 59th St
  );

  // ================================================================== STREETS
  for (const s of UPPER_MANHATTAN_STREETS) {
    roads.push({ x: s.x, z: s.z, w: s.w, d: s.d });
    const sw = 1.5;
    if (s.axis === 'x') {
      sidewalks.push({ x: s.x, z: s.z - sw, w: s.w, d: sw }, { x: s.x, z: s.z + s.d, w: s.w, d: sw });
      laneMarkers.push(...laneDashes({ x: s.x, z: s.z + s.d / 2 - 0.06, w: s.w, d: 0.12, axis: 'x' }));
    } else {
      sidewalks.push({ x: s.x - sw, z: s.z, w: sw, d: s.d }, { x: s.x + s.w, z: s.z, w: sw, d: s.d });
      laneMarkers.push(...laneDashes({ x: s.x + s.w / 2 - 0.06, z: s.z, w: 0.12, d: s.d, axis: 'z' }));
    }
  }
  // Crossings. The rect is inset 0.4 m inside the roadway and the bars repeat
  // along the direction of travel, so every stripe lands inside the asphalt.
  const cross = (s, at) => (s.axis === 'x'
    ? zebra({ x: at, z: s.z + 0.4, w: XW_LEN, d: s.d - 0.8, axis: 'x' })
    : zebra({ x: s.x + 0.4, z: at, w: s.w - 0.8, d: XW_LEN, axis: 'z' }));
  for (const [si, at] of UPPER_MANHATTAN_CROSSINGS) {
    crosswalks.push(...cross(UPPER_MANHATTAN_STREETS[si], at));
  }

  // The two 110th St circles. Each is a RING of four road rects around a granite
  // island, not one solid rect: the island is a plaza surface and plaza draws
  // below roads, so a single rect would have painted over its own centre — and
  // the bronze standing on it would have been a block inside a roadway.
  for (const [cx, sign] of [[26.5, 1], [-26.5, -1]]) {
    const x0 = cx - 2.5, ix0 = cx - 1;
    roads.push(
      { x: x0, z: -100, w: 5, d: 1.5 },
      { x: x0, z: -96.5, w: 5, d: 1.5 },
      { x: x0, z: -98.5, w: 1.5, d: 2 },
      { x: x0 + 3.5, z: -98.5, w: 1.5, d: 2 },
    );
    plaza.push({ x: ix0, z: -98.5, w: 2, d: 2, color: sign > 0 ? 0x8a8578 : 0x9a9488 });
    // Ellington's bronze group and Douglass's figure, both H5 on a granite
    // plinth. They stand on the island, which is the surface they claim.
    statue(sim, {
      x: ix0 + 0.5, z: -98, h: 5, plinth: 2, w: 1, d: 1, figW: 0.5, figD: 0.5,
      stone: 0x9a9184, bronze: sign > 0 ? 0x4a5f46 : 0x54604f,
    });
  }

  // ============================================================= PARK SURFACES
  // Every GROUND feature of the whole park, laid now — Pass 2 and Pass 3 place
  // structures onto these, so they all have to exist before either runs.

  // -- north park (110th to the 97th transverse)
  parks.push(
    { x: -14, z: -93, w: 18, d: 27, color: 0x1f4023 },     // North Woods
    { x: -12, z: -76, w: 13, d: 9, color: 0x35341f },      // the Ravine floor, leaf litter
    { x: -21, z: -85, w: 6, d: 16, color: 0x437a37 },      // the Great Hill
    { x: 14, z: -78, w: 7, d: 7, color: 0x4d8340 },        // Conservatory Garden
    { x: -11, z: -62, w: 18, d: 13, color: 0x59a03f },     // North Meadow
    { x: 10, z: -95, w: 11, d: 14, color: 0x2b5730 },      // Meer's wooded shore
    { x: -21, z: -68, w: 5, d: 8, color: 0x2f6a3a },       // the Pool's willow bank
  );
  // North Meadow ball diamonds: tan infields on the mown grass.
  for (const [dx, dz] of [[-9, -60], [-3, -60], [3, -60], [-9, -54], [-3, -54], [3, -54]]) {
    sand.push({ x: dx, z: dz, w: 3.6, d: 3.6, color: 0xb99a63 });
  }

  // -- Reservoir belt: the layered corridor, west to east, is
  //    wall (-22) | drive | bridle | track | fence | rim | WATER | mirror.
  const reservoir = { x: -14, z: -42, w: 28, d: 32, color: 0x28455e };
  sand.push(
    { x: -16.6, z: -44.6, w: 33.2, d: 1.2, color: 0xa8563a },   // running track, N
    { x: -16.6, z: -8.4, w: 33.2, d: 1.2, color: 0xa8563a },    // running track, S
    { x: -16.6, z: -44.6, w: 1.2, d: 36.2, color: 0xa8563a },   // running track, W
    { x: 15.4, z: -44.6, w: 1.2, d: 36.2, color: 0xa8563a },    // running track, E
    { x: -18.4, z: -46.4, w: 36.8, d: 1.5, color: 0xa38a5e },   // bridle ring, N
    { x: -18.4, z: -7, w: 36.8, d: 1.5, color: 0xa38a5e },      // bridle ring, S
    { x: -18.4, z: -46.4, w: 1.5, d: 39.4, color: 0xa38a5e },   // bridle ring, W
    { x: 16.9, z: -46.4, w: 1.5, d: 39.4, color: 0xa38a5e },    // bridle ring, E
  );

  // -- Great Lawn / Belvedere district (structures are Pass 2; the ground is here)
  parks.push(
    { x: -15, z: -2.4, w: 12, d: 2.8, color: 0x1c4433 },   // Arthur Ross Pinetum
    { x: -14, z: 0.5, w: 23.5, d: 16.5, color: 0x5aa844 }, // the Great Lawn
    { x: -21, z: 3, w: 4, d: 9, color: 0x6f6a61 },         // Summit Rock outcrop
    // PASS 2 moved the Shakespeare Garden west of the West Drive and pushed the
    // Swedish Cottage's ground in beside it: the plan's x[-19,-15.5] is under
    // the drive's own ribbon, and a terraced garden cannot sit on asphalt.
    { x: -21, z: 15, w: 3.5, d: 4, color: 0x63873c },      // Shakespeare Garden
    { x: -21.5, z: 12, w: 4, d: 3, color: 0x4a7a3a },      // Swedish Cottage's clearing
  );

  // -- the Ramble and the Lake
  parks.push(
    { x: -8, z: 26, w: 12.5, d: 16, color: 0x2a5c2c },     // the Ramble
    { x: -7, z: 47, w: 4, d: 3, color: 0x4a8a3c },         // Cherry Hill
    { x: -22, z: 44, w: 4, d: 7, color: 0x2e5c33 },        // Strawberry Fields
  );

  // -- Bethesda, the Mall, Sheep Meadow. The Mall is the only straight formal
  // axis in the park, so it is one rect rather than a ribbon; Pass 2 sets the
  // elm tunnel and the Literary Walk bronzes onto this paving.
  sidewalks.push({ x: -4, z: 57, w: 4, d: 16, color: 0x8f887a });
  plaza.push(
    { x: -6, z: 50, w: 8, d: 3, color: 0xb0a184 },       // Bethesda's lower terrace
    { x: 0.5, z: 57.5, w: 6.5, d: 5, color: 0x9a958a },  // the Naumburg Bandshell plaza
    { x: 11.5, z: 39, w: 1.5, d: 6, color: 0x9a958a },   // Conservatory Water's west apron
  );
  parks.push(
    // PASS 2 pulled the east edge back from -4 to -6.5: the Mall's west elm row
    // stands at x -4.5 and its canopy overhangs to -5, and the plan is explicit
    // that nothing at all goes inside Sheep Meadow.
    { x: -17, z: 61.5, w: 10.5, d: 11.5, color: 0x63b447 },  // Sheep Meadow, unbroken lawn
    { x: 4.5, z: 57.5, w: 3.5, d: 4, color: 0x4f8a3c },    // Rumsey Playfield
  );

  // -- south park
  parks.push(
    { x: -19, z: 80, w: 9, d: 12, color: 0x4f8a3c },       // Heckscher ballfields
    { x: -21, z: 84, w: 2, d: 4, color: 0x6f6a61 },        // Umpire Rock
    { x: 7, z: 90, w: 3.5, d: 6, color: 0x1f4023 },        // Hallett Nature Sanctuary
    { x: 13, z: 77.5, w: 7, d: 8.5, color: 0x3d7a38 },     // the Zoo grounds
  );

  // ============================================================== CIRCULATION
  // §2.1 Park Drive: one continuous closed polyline, 2.4 m of dark asphalt. It
  // is a `bikePaths` surface rather than a `roads` one on purpose — the park
  // drives carry no traffic in this scene, and `roads` is a placement contract
  // that would then have to exempt every kerb and every rim it brushes past.
  const DRIVE = [
    [19, 96], [17.5, 90], [11.5, 85], [10.5, 76], [10, 68], [11, 58], [12.5, 50],
    [10.5, 43], [11, 33], [11.5, 25], [10.5, 16], [11, 6], [14, -1], [19.6, -10],
    [19.6, -30], [19, -45], [17.5, -60], [12.5, -74], [8.5, -84], [0, -92],
    [-8, -91], [-15, -87], [-13.6, -78], [-13, -68], [-17, -57], [-18, -50],
    [-19, -40], [-18.5, -25], [-18, -10], [-16.5, 5], [-16.5, 20], [-17.5, 34],
    // PASS 2 nudged the z 66 waypoint from x -18 to -17 so the drive passes
    // clear of Tavern on the Green's glass wing, which is what waypoint 36 of
    // the plan says it does anyway.
    [-18, 46], [-18.5, 56], [-17, 66], [-16, 71], [-15, 80], [-12, 90], [-6, 96],
    [6, 97], [14, 97],
  ];
  bikePaths.push(...pathRibbon(DRIVE, 2.4, { closed: true, color: 0x3a3d42 }));
  // §2.2 the 72nd St Cross Drive — the only mid-park drive that crosses at grade.
  // PASS 2 flattened the middle of this run from z 56 to z 54: the drive has to
  // pass OVER the Bethesda arcade (z 53..55) and clear the upper terrace behind
  // it (z 56+), and at the plan's z 56 it ran straight through the terrace.
  bikePaths.push(...pathRibbon(
    [[-18.5, 51], [-12, 52.5], [-5, 54], [0, 54], [7, 53.5], [12.5, 50]], 2.4, { color: 0x3a3d42 },
  ));
  // §2.3 bridle path, west/north branch. Soft tan dirt, always just inside the
  // loop drive; the Reservoir ring half of it is the `sand` ring laid above.
  sand.push(...pathRibbon([
    [-15, 92], [-14.5, 80], [-14, 66], [-15, 52], [-15.5, 38], [-15.5, 24],
    [-15.5, 10], [-14.5, -1],
  ], 1.5, { color: 0xa38a5e }));
  sand.push(...pathRibbon([
    [-15.5, -48], [-15, -54], [-13.5, -62], [-12.5, -66],
  ], 1.5, { color: 0xa38a5e }));

  // §2.4 the four sunken transverse roads. Each is a stone slot: a wide
  // `cobbles` shoulder (the schist retaining walls, read from above) with the
  // asphalt ribbon laid inside it. These ARE `roads` — they are the only
  // through traffic in the park and the placement contract has to hold.
  const TRANSVERSE = [
    [[-23.5, 73.5], [-16, 74.4], [-10, 75.3], [-4, 75.9], [2, 76.3], [10, 76.6], [23.5, 76.8]],
    // PASS 2 moved the 79th's west half ~2 m south. The plan has it tunnelling
    // BENEATH Vista Rock, which this engine cannot express (no overhangs), so
    // the trench has to pass clear of Belvedere's crag AND of the Delacorte,
    // the Shakespeare Garden and the Swedish Cottage stacked up the west side.
    [[-23.5, 19], [-18, 21], [-15, 23], [-12, 25], [-8, 25.8], [-2, 26], [6, 25.4], [14, 24], [23.5, 23.2]],
    [[-23.5, -3.6], [-12, -3.6], [0, -3.1], [12, -3.3], [23.5, -3.7]],
    // 97th sits 3 m north of the plan's line: at -46.6 its trench swallowed the
    // North Gate House and the Reservoir's bridle ring, which share that metre.
    [[-23.5, -50.6], [-10, -50.1], [2, -49.6], [12, -49.6], [23.5, -49.9]],
  ];
  for (const line of TRANSVERSE) {
    cobbles.push(...pathRibbon(line, 3.6, { color: 0x59564e }));
    roads.push(...pathRibbon(line, 2, { color: 0x24262c }));
  }

  // §2.5 pedestrian path network. Not a grid — an informal web of hexagonal
  // pavers, curvilinear everywhere except the Mall.
  // No path may cross a water body: water paints near the top of the decor
  // stack, so the pavers would simply vanish under it. Every line below stops
  // at a bank, and the two Ravine crossings happen 3 m up, on the arch decks.
  const PATHS = [
    [[-20, -94], [-15, -92], [-9, -88], [-3, -87], [3, -91], [8, -94]],       // Central Park North walk
    [[-18, -86], [-16, -80], [-15, -74], [-14, -69], [-12, -67]],             // Great Hill to the Ravine
    [[-8, -68], [-3, -67], [2, -69], [7, -74], [11, -77], [13, -77]],         // Ravine to the Conservatory Garden
    [[-11, -64], [-6, -63], [0, -63], [6, -64], [11, -66]],                   // North Meadow rim
    [[-14, -52], [-6, -53], [2, -53], [10, -52]],                             // North Meadow south walk
    [[-13, -6], [-6, -6], [0, -5.5], [7, -6], [13, -7]],                      // Reservoir south walk
    [[-12, 2], [-6, 3], [0, 3], [6, 3], [9, 5]],                              // Great Lawn ring, north
    [[-12, 2], [-13, 8], [-12, 14], [-8, 16.5], [-2, 17.4], [4, 16.5], [8, 13], [9, 5]],
    [[-16, 30], [-10, 31], [-4, 33], [0, 36], [3, 37]],                       // Ramble wander
    [[-16, 58], [-10, 59], [-4, 60], [-2, 66], [-2, 73]],                     // the Mall approach
    [[-18, 88], [-12, 86], [-6, 88], [0, 90], [5, 92], [8, 93]],              // Central Park South walk
  ];
  for (const line of PATHS) sidewalks.push(...pathRibbon(line, 1.1, { color: 0x8b8578 }));

  // ===================================================================== WATER
  // Every water body in the park, declared here and rimmed FROM these rects.
  // Lobes of one body are separate rects so the shorelines are not rectangles;
  // basinRim() takes the whole body and rims the boundary of the UNION, which
  // is why a shared edge between two lobes stays wet.
  const MEER = [
    { x: 11, z: -90, w: 9, d: 8 }, { x: 13, z: -92, w: 6, d: 2 }, { x: 12, z: -82, w: 7, d: 2 },
  ];
  const LOCH = [{ x: -11, z: -72, w: 12, d: 1 }];
  const POOL = [{ x: -20, z: -67, w: 3, d: 4 }];
  const LASKER = [{ x: 3, z: -87, w: 4, d: 3 }];
  const GARDEN_FOUNTAIN = [{ x: 17, z: -75, w: 2, d: 2 }];
  // Turtle Pond's north bank is 2.0 m from the spawn disc and that is the
  // constraint that sizes it, not the plan: at the plan's depth its rim landed
  // ON (0,16) and the whole spawn cluster fell in the first frame.
  // PASS 2 pulled the west edge from -5 to -4: Belvedere's crag needs the
  // metre, and the pond's north bank (z 18) is what actually sets the spawn
  // clearance, so shortening it westward costs nothing.
  const TURTLE = [{ x: -4, z: 19, w: 7, d: 3 }, { x: 3, z: 20, w: 4, d: 2 }];
  const LAKE = [
    { x: -15, z: 43, w: 11, d: 6 },   // west basin (PASS 2: d 7 → 6, see below)
    { x: -4, z: 44, w: 3, d: 3 },     // the narrow neck — Bow Bridge crosses here
    { x: -1, z: 43, w: 6, d: 6 },     // east basin
    { x: -16, z: 49, w: 5, d: 4 },    // south-west arm, still touching the basin at z 49
  ];
  // PASS 2 pulled the west basin's south bank from z 50 to z 49 and grew the SW
  // arm north to meet it. Bethesda's fountain is 1.5 m of radius on a plaza that
  // starts at z 50, and at the old depth the lake's own rim owned the cells it
  // needed. The two lobes still share an edge, so the union rim keeps it wet.
  //
  // Bank Rock Bay is now a bay plus a one-metre NECK: a corbelled arch clears at
  // most three cells at grade, so a four-metre-wide inlet cannot be bridged at
  // all — the Oak Bridge needs somewhere narrow to cross.
  const BANK_ROCK = [{ x: -12, z: 38, w: 3, d: 3 }, { x: -11, z: 41, w: 1, d: 2 }];
  const BOAT_COVE = [{ x: 3, z: 40, w: 3, d: 3 }];
  const CONSERVATORY_WATER = [{ x: 13, z: 39, w: 7, d: 6 }];
  // The Gill: the Ramble's thin stream, 1 m on the grid (the same width as the
  // Loch) because that is the narrowest a rimmed body can be.
  const GILL = [{ x: 1, z: 28, w: 1, d: 6 }];
  // The Pond gets the same treatment as Bank Rock Bay: a 1 m north neck for
  // Gapstow Bridge to sit on.
  const POND = [
    { x: 11, z: 90, w: 9, d: 4 }, { x: 15, z: 94, w: 5, d: 3 }, { x: 16, z: 88, w: 1, d: 2 },
  ];
  // Two south-park basins that are not lakes: the Zoo's sea lion pool and
  // Wollman's ice sheet. Both go through basinRim like every other body — the
  // rink's "low grey parapet" IS its rim, and the pool's kerb IS its rim.
  const SEA_LION = [{ x: 15, z: 82, w: 2, d: 2 }];
  const WOLLMAN = [{ x: 1, z: 85, w: 4, d: 3 }];

  const tint = (rects, color) => rects.map((r) => ({ ...r, color }));
  water.push(
    { ...reservoir },
    ...tint(MEER, 0x2e4034), ...tint(LOCH, 0x2f4238), ...tint(POOL, 0x2c4a44),
    ...tint(LASKER, 0x2f7f88), ...tint(GARDEN_FOUNTAIN, 0x3a6f92),
    ...tint(TURTLE, 0x2b4432), ...tint(LAKE, 0x24483f), ...tint(BANK_ROCK, 0x2b4a3c),
    ...tint(BOAT_COVE, 0x24483f), ...tint(CONSERVATORY_WATER, 0x3a6f92),
    ...tint(GILL, 0x2f4238), ...tint(POND, 0x1f3a4a),
    ...tint(SEA_LION, 0x2f7f98), ...tint(WOLLMAN, 0xcfe0ec),
  );

  // ================================================== BRIDGES, DECLARED UP FRONT
  // Every park bridge is a CORBELLED stoneArch, and its ground course lands
  // exactly where the water's rim wants to be — the abutment IS the bank there.
  // Declaring the footprints before the rims and handing them to basinRim as its
  // `skip` is what keeps the two from writing the same fine cell; the alternative
  // (rim first, arch second) silently overwrites the rim and the ghost falls at
  // spawn. Pass 1's Ravine arches escape this only because their span happens to
  // clear the Loch's rim row at grade.
  //
  // The span must match the WATER exactly, because the grade course opens
  // `span` cells centred in the run and every opened cell that is dry land is a
  // hole in the bank the rim was told not to fill. So: 1 m of water gets
  // span 1 / pier 2 (origin = water cell - 2, one cell open); 3 m of water gets
  // span 3 / pier 2 (origin = water cell - 3, three cells open).
  const PARK_BRIDGES = [
    // Ramble: two rustic timber footbridges over the Gill
    { x: -1, z: 30, span: 1, pier: 2, width: 1, rise: 2, axis: 'x', mat: 'wood',
      color: 0x6b5334, deckColor: 0x8a6a4a, railMat: 'wood', rail: 0x7a5f3c },
    { x: -1, z: 33, span: 1, pier: 2, width: 1, rise: 2, axis: 'x', mat: 'wood',
      color: 0x6b5334, deckColor: 0x8a6a4a, railMat: 'wood', rail: 0x7a5f3c },
    { x: -1, z: 28, span: 1, pier: 2, width: 1, rise: 2, axis: 'x', mat: 'wood',
      color: 0x6b5334, deckColor: 0x8a6a4a, railMat: 'wood', rail: 0x7a5f3c },
    // Oak Bridge over Bank Rock Bay's neck — white-painted timber and cast iron
    { x: -13, z: 41, span: 1, pier: 2, width: 1, rise: 2, axis: 'x', mat: 'concrete',
      color: 0xd8d2c2, deckColor: 0xe4dfd0, railMat: 'steel', rail: 0xf0ece0 },
    // Bow Bridge over the Lake's neck. The postcard one: long, thin, cream cast
    // iron on a single very shallow arch, urn planters on the parapet. It has to
    // read BRIGHT against dark water, so every colour here is near-white.
    { x: -3, z: 42, span: 3, pier: 2, width: 2, rise: 2, axis: 'z', mat: 'concrete',
      color: 0xe8e2d2, deckColor: 0xf0ece0, railMat: 'steel', rail: 0xf4f1e6,
      railH: 0.75, urnEvery: 1.5, urn: 0xe0d8c4 },
    // Gapstow Bridge over the Pond's north neck — squat, heavy, rough schist
    // with a pale coping. The deliberate opposite of Bow.
    { x: 14, z: 88, span: 1, pier: 2, width: 2, rise: 2, axis: 'x', mat: 'concrete',
      color: 0x5d5a52, deckColor: 0x6d6a60, railMat: 'concrete', rail: 0xa8a294 },
  ];
  const bridgeFoot = (b) => {
    const L = b.pier * 2 + b.span;
    return b.axis === 'x'
      ? { x: b.x, z: b.z, w: L, d: b.width }
      : { x: b.x, z: b.z, w: b.width, d: L };
  };
  const onBridge = (x, z) => PARK_BRIDGES.some((b) => {
    const f = bridgeFoot(b);
    return x >= f.x && x < f.x + f.w && z >= f.z && z < f.z + f.d;
  });

  // Where foliage and loose props may NOT go: asphalt, drives, paths, every
  // water body plus the metre of rim around it, and every mass already placed.
  // `built` is filled AS the districts run and the predicate closes over the
  // live array, so a grove written under a landform still sees it — a tree
  // inside a rock outcrop is two blocks in one fine cell and the second one is
  // a ghost that drops at spawn.
  // Groves are DEFERRED for the same reason: a district writes its planting
  // next to its geometry (so the two are read together), but every grove is
  // actually scattered in one pass at the end, once `built` is complete.
  // Running them inline meant a grove could only see the masses written above
  // it, and the Ravine's trees grew straight through the arch that had not been
  // placed yet.
  const built = [];
  const groves = [];
  const claim = (x, z, w, d) => built.push({ x, z, w, d });
  const plant = (o) => groves.push(o);
  const offLimits = blocked([roads, bikePaths, sidewalks], 0.9);
  const wet = blocked([water], 1.6);
  const onBuilt = blocked([built], 1.2);
  const noPlant = (x, z) => offLimits(x, z) || wet(x, z) || onBuilt(x, z);
  // The looser gate, for things that BELONG beside a path: keep off asphalt,
  // out of the water, and off anything already standing.
  const nearRoad = blocked([roads], 0.4);
  const nearWater = blocked([water], 1.3);
  const nearBuilt = blocked([built], 0.8);
  const clear = (x, z) => !nearRoad(x, z) && !nearWater(x, z) && !nearBuilt(x, z);
  // `clear()`'s road pad is 0.4 m and it is a POINT test — a bench is 1 m of
  // seat and a boulder is a whole metre, so an anchor 0.5 m off the asphalt
  // still puts cells in it. Anything wider than a point uses clearFurn; a tree
  // uses clearTree, because a canopy reaches a metre past its trunk.
  const nearRoadWide = blocked([roads], 1.2);
  const clearFurn = (x, z) => clear(x, z) && !nearRoadWide(x, z);
  const nearRoadTree = blocked([roads], 1.7);
  const clearTree = (x, z) => clear(x, z) && !nearRoadTree(x, z);
  // The same test for a whole FOOTPRINT rather than a point, which is what the
  // perimeter's street walls are filtered through. Padding by 1.2 m is what
  // makes the wall self-aligning: a band is laid as one continuous run and the
  // buildings that would land in a cross street simply are not placed, so a
  // side street can be moved without hand-editing the wall either side of it.
  // It also keeps the 0.5 m cornice and the 1 m fire-escape landing — both of
  // which project toward the street — inside the 1.5 m sidewalk.
  const roadClash = (x, z, w, d) => roads.some((r) =>
    x - 1.2 < r.x + r.w && x + w + 1.2 > r.x && z - 1.2 < r.z + r.d && z + d + 1.2 > r.z);

  // ============================================================== PERIMETER WALL
  // A continuous 1.2 m rough schist wall follows the whole park boundary, with
  // square piers and named gate openings. Gaps are offsets from each run's own
  // origin, so a gate stays put when the run's endpoints move. Every gap is a
  // place something crosses: a transverse, the Vanderbilt Gate, a path.
  const WALL = { mat: 'concrete', color: 0x5f5b52, pierColor: 0x777165, h: 1, pierH: 1, pierEvery: 14 };
  parkWall(sim, {
    ...WALL, x: -22, z: -96, len: 196, axis: 'z',            // west wall, u = z + 96
    gaps: [[1, 6], [43, 51], [88, 96], [108, 118], [138, 144], [164, 176], [190, 195]],
  });
  // PASS 3 widened the east wall's z 18..28 gate to z 3..28 (offsets 99..124).
  // The Metropolitan Museum stands INSIDE the park at x[13,22] z[4,19] and its
  // Fifth Avenue front IS the boundary there — which is true of the real one
  // too. Leaving the wall in place would have put its run through the museum's
  // east range, one block per cell twice over.
  parkWall(sim, {
    ...WALL, x: 21, z: -96, len: 196, axis: 'z',             // east wall, u = z + 96
    gaps: [[1, 6], [15, 25], [43, 51], [88, 96], [99, 124], [134, 138], [167, 178], [190, 195]],
  });
  parkWall(sim, {
    ...WALL, x: -21, z: -96, len: 42, axis: 'x',             // north wall, u = x + 21
    gaps: [[8, 12], [20, 24], [33, 39]],                     // the Dana Center stands in the last one
  });
  parkWall(sim, {
    ...WALL, x: -21, z: 99, len: 42, axis: 'x',              // south wall, u = x + 21
    gaps: [[8, 12], [20, 24], [30, 34]],
  });
  claim(-22, -96, 1, 196); claim(21, -96, 1, 196);
  claim(-21, -96, 42, 1); claim(-21, 99, 42, 1);

  // ================================================== WATER RIMS (built FROM the water)
  const RIM = { color: 0x6d6a60 };
  basinRim(sim, [reservoir], { ...RIM, color: 0x7a746a });
  basinRim(sim, MEER, { color: 0x6a6152 });
  basinRim(sim, POOL, { color: 0x66695c });
  basinRim(sim, LASKER, { color: 0x9a9a92 });
  basinRim(sim, GARDEN_FOUNTAIN, { color: 0xbcb4a2 });
  basinRim(sim, TURTLE, { color: 0x5f6553 });
  // The Lake, its north-west arm and the boathouse cove are ONE body: rimmed
  // separately, each arm's rim ran straight across the neck it shares with the
  // basin next to it and both rims wanted the same cells.
  basinRim(sim, [...LAKE, ...BANK_ROCK, ...BOAT_COVE], { color: 0x63665a, skip: onBridge });
  basinRim(sim, CONSERVATORY_WATER, { color: 0x9a958a });   // the formal granite kerb
  basinRim(sim, GILL, { color: 0x585448, skip: onBridge });
  basinRim(sim, POND, { color: 0x60635a, skip: onBridge });
  basinRim(sim, SEA_LION, { color: 0x8f887c });
  basinRim(sim, WOLLMAN, { color: 0x9a9a92 });
  // The Loch's rim stops short where the two Ravine arches cross it — an arch
  // pier and a rim block would otherwise want the same cells, and the block
  // placed second becomes an unreachable ghost that falls at spawn.
  basinRim(sim, LOCH, { color: 0x585448 });

  // ============================================================ N — HARLEM MEER
  // The Meer's shore, the Dana Discovery Center on the north bank, and the
  // Lasker/Davis Center in the notch between the Meer and the Ravine.
  pavilion(sim, {
    x: 13, z: -96, w: 4, d: 3, h: 3, wallMat: 'wood', wall: 0x3f5240,
    plate: 0x6a6259, roofMat: 'panel', roof: 0x5f6b5a, roofRise: 1,
  });
  claim(13, -96, 4, 3);
  boardwalk.push({ x: 13, z: -93, w: 4, d: 2, color: 0x8a6a4a });   // the deck over the water
  plaza.push({ x: 12, z: -97, w: 6, d: 1, color: 0x7d7669 });       // the lodge's forecourt

  // Lasker / Davis Center: a sunken oval — pool in summer, rink in winter. The
  // deck is FOUR rects around the water, not one under it: water paints over
  // plaza, so a single rect would have erased its own middle.
  plaza.push(
    { x: 2, z: -91, w: 6, d: 4, color: 0xa9a49a },
    { x: 2, z: -84, w: 6, d: 2, color: 0xa9a49a },
    { x: 2, z: -87, w: 1, d: 3, color: 0xa9a49a },
    { x: 7, z: -87, w: 1, d: 3, color: 0xa9a49a },
  );
  pavilion(sim, {
    x: 3, z: -91, w: 4, d: 3, h: 2, kind: 'masonry', wallMat: 'concrete', wall: 0x8d9099,
    plate: 0x74777e, roofMat: 'panel', roof: 0x5a5f66, roofRise: 1,
  });
  claim(3, -91, 4, 3);

  // ============================================== NW — THE NORTH WOODS + RAVINE
  // The densest woodland in the park: uneven ground, exposed schist, and no
  // lawn. The two Ravine arches carry the woodland paths over the Loch.
  // exposed grey schist outcrops on the valley banks, laid BEFORE the grove so
  // the scatter's skip predicate can see them
  rockMound(sim, { x: -8, z: -78, w: 4, d: 3, h: 3, color: 0x6b675e, crownColor: 0x777268, crownW: 2, crownD: 2 });
  claim(-8, -78, 4, 3);
  rockMound(sim, { x: -3, z: -68, w: 3, d: 3, h: 2, color: 0x6b675e, crownColor: 0x777268, crownW: 2, crownD: 2 });
  claim(-3, -68, 3, 3);
  rockMound(sim, { x: -13, z: -84, w: 3, d: 4, h: 3, color: 0x6b675e, crownColor: 0x777268, crownW: 2, crownD: 2 });
  claim(-13, -84, 3, 4);
  rockMound(sim, { x: -2, z: -84, w: 4, d: 3, h: 3, color: 0x6b675e, crownColor: 0x777268, crownW: 2, crownD: 2 });
  claim(-2, -84, 4, 3);
  // The boulder valley floor, split around the Loch: water paints over cobbles,
  // so a single rect would have erased its own middle.
  cobbles.push(
    { x: -12, z: -74, w: 13, d: 2, color: 0x4e4a40 },
    { x: -12, z: -71, w: 13, d: 2, color: 0x4e4a40 },
  );
  plant({ x: -14, z: -93, w: 18, d: 20, step: 2.5 });
  plant({ x: -12, z: -70, w: 15, d: 4, step: 2.5 });

  // Glen Span Arch (west) and Huddlestone Arch (east). Both span the Loch and
  // both of them corbel — the opening closes one cell per course, which is a
  // 1 m hop off a cell that is itself carried from below.
  stoneArch(sim, {
    x: -11, z: -75, span: 3, width: 2, rise: 3, axis: 'z', pier: 2,
    color: 0x615d54, deckColor: 0x736c60,
  });
  claim(-11, -75, 2, 7);
  stoneArch(sim, {
    x: -1, z: -75, span: 3, width: 2, rise: 4, axis: 'z', pier: 2,
    color: 0x6f665a, deckColor: 0x7d7468,                            // dry-laid boulders, heavier
  });
  claim(-1, -75, 2, 7);

  // The Blockhouse (No. 1), 1814: a roofless square of rough fieldstone on top
  // of a rock shelf. Oldest structure in the park, and the tallest thing north
  // of the Reservoir. The floor plate goes down FIRST and the walls start a
  // course above it — walls and plate written at the same y is one block per
  // cell twice over, and the loser is a ghost.
  rockMound(sim, { x: -19, z: -92, w: 5, d: 5, h: 4, color: 0x655f56, crownColor: 0x6f6a60, crownW: 3, crownD: 3 });
  BOX(-18, 4, -91, 3, 1, 3, 'concrete', 1, 0x5f594f);
  for (let y = 5; y < 8; y++) {
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        if (i === 1 && k === 1) continue;                            // roofless, and hollow
        if (y === 6 && i === 1 && k === 0) continue;                 // the single arched opening
        B(-18 + i, y, -91 + k, 'brick', 1, 0x6a635a);
      }
    }
  }
  claim(-19, -92, 5, 5);

  // The Great Hill: a broad grassy plateau rising 5 m, ringed by elms. This is
  // the largest single mass in the north park and the densest thing to excavate
  // anywhere north of the Reservoir.
  rockMound(sim, {
    x: -21, z: -85, w: 6, d: 16, h: 5, color: 0x4a6e3a, crownColor: 0x54823f,
    crownW: 4, crownD: 12,
  });
  claim(-21, -85, 6, 16);
  plant({ x: -21, z: -88, w: 6, d: 3, step: 2.5 });
  plant({ x: -21, z: -68, w: 6, d: 3, step: 2.5 });

  // The Pool: a small still pond with weeping willows and a cascade at its east
  // end feeding the Loch.
  for (let x = -16; x < -13; x++) B(x, 0, -65, 'concrete', 1, 0x5e5a4e);   // the cascade run
  B(-15, 1, -65, 'concrete', 1, 0x6a6659);   // the step above sits ON the run, not half inside it
  claim(-16, -65, 3, 1);
  plant({ x: -21, z: -61, w: 5, d: 3, step: 2.5 });

  // ============================================= NE — THE CONSERVATORY GARDEN
  // The only formal garden in the park: three rooms, clipped hedges, gravel
  // paths, symmetric — the opposite of everything around it.
  // The garden sits at z[-78,-71], two metres south of the plan's line: at
  // -80 its north parterre shared cells with the Harlem Meer's south rim.
  // The gravel is split around the fountain basin for the same reason the
  // Lasker deck is: water paints over plaza.
  plaza.push(
    { x: 14, z: -77.8, w: 7, d: 0.8, color: 0xa89a7c },
    { x: 14, z: -72.6, w: 7, d: 0.8, color: 0xa89a7c },
    { x: 14, z: -70.6, w: 7, d: 0.8, color: 0xa89a7c },
    { x: 15.2, z: -78, w: 0.8, d: 3, color: 0xa89a7c },
    { x: 19.2, z: -78, w: 0.8, d: 3, color: 0xa89a7c },
  );
  // the wisteria pergola backing the Italian centre room
  pergola(sim, { x: 14.5, z: -71, len: 6, axis: 'x', w: 2, h: 2.5, color: 0x3a4038, beamColor: 0x4a5046 });
  claim(14.5, -71, 6, 2);
  // clipped parterre beds, the French room north of the fountain
  for (const [px, pz] of [[14.5, -77.9], [16.5, -77.9], [18.5, -77.9]]) {
    planter(sim, px, pz, 1.5, 1, 0x7a6a52);
    claim(px, pz, 1.5, 1);
  }
  // Vanderbilt Gate: the garden's only Fifth Avenue entrance, standing in the
  // gate opening cut out of the east wall run.
  for (const gz of [-78, -74]) { BOX(21, 0, gz, 1, 4, 1, 'concrete', 1, 0x8d8578); claim(21, gz, 1, 1); }
  for (let z = -77; z < -74; z += 0.25) {
    for (let y = 0; y < 3; y += 0.25) B(21.375, y, z, 'steel', 0.25, 0x1f1f22);
  }
  claim(21, -77, 1, 3);
  plant({ x: 14, z: -69.5, w: 7, d: 3, step: 2.5 });

  // ================================================== NW — THE NORTH MEADOW
  // Twelve ball fields on flat bright grass: backstops, no trees inside, and a
  // tree line all round.
  for (const [bx, bz] of [[-9, -61], [-3, -61], [3, -61]]) {
    fenceRun(sim, { x: bx, z: bz, len: 3, axis: 'x', h: 1.5, s: 0.25, postEvery: 1, color: 0x7a4f38 });
    claim(bx, bz, 3, 1);
  }
  pavilion(sim, {
    x: -14, z: -58, w: 3, d: 3, h: 3, wallMat: 'brick', wall: 0x8f4d3c,
    plate: 0x6a6259, roofMat: 'panel', roof: 0x585f5c, roofRise: 1,
  });
  claim(-14, -58, 3, 3);
  plaza.push({ x: -15, z: -59, w: 5, d: 5, color: 0x7d7669 });
  plant({ x: -12, z: -66, w: 20, d: 3, step: 2.5 });
  plant({ x: -12, z: -48, w: 20, d: 3, step: 2.5 });

  // ======================================================= C — THE RESERVOIR BELT
  // The single largest object in the park. Chain-link fence around the entire
  // perimeter, riprap rim below it, the cinder track outside that. The four
  // fence runs share no cell: the two x-runs own the corners.
  const FENCE = { h: 1.5, s: 0.5, postEvery: 2, color: 0x2f4a35, mat: 'steel' };
  fenceRun(sim, { ...FENCE, x: -15.5, z: -43.5, len: 31, axis: 'x' });
  fenceRun(sim, { ...FENCE, x: -15.5, z: -9, len: 31, axis: 'x' });
  fenceRun(sim, { ...FENCE, x: -15.5, z: -43, len: 34, axis: 'z' });
  fenceRun(sim, { ...FENCE, x: 15, z: -43, len: 34, axis: 'z' });

  // The two 1864 granite gatehouses: small, heavy, blank-walled, steep roofs.
  // Both stand clear of the fence line rather than in it.
  for (const [gx, gz] of [[-2, -8], [6, -47]]) {
    pavilion(sim, {
      x: gx, z: gz, w: 3, d: 3, h: 4, kind: 'masonry', wallMat: 'concrete', wall: 0x827c72,
      plate: 0x6d675e, roofMat: 'panel', roof: 0x4a4f56, roofRise: 1,
    });
    claim(gx, gz, 3, 3);
    plaza.push({ x: gx - 1, z: gz - 1, w: 5, d: 5, color: 0x84806f });
  }
  // Tree line along the outside of the belt, between the bridle path and the
  // drive — the corridor is 7.5 m wide and everything in it is a surface.
  plant({ x: -21, z: -40, w: 3, d: 30, step: 3 });
  plant({ x: 18, z: -40, w: 3, d: 30, step: 3 });

  // ============================================================= SPAWN — the Great Lawn
  // The hole starts at (0, 16), on the Great Lawn's south edge, and this is a
  // PHYSICS problem before it is a dressing one. A SIZE 1 hole (r 1.1 m,
  // removal disc 1.045 m) unseats a 1 m ground block only when 3 of its 4 base
  // corners fall inside that disc, and even then any neighbour inside the
  // material's span keeps carrying it — so a continuous surface is close to
  // inedible at SIZE 1 no matter how much of it there is. Loose 0.25/0.5 m
  // props are the opposite: isolated, so losing the anchor drops them outright.
  // A bare lawn at spawn is therefore a dead zone, and the fix is content.
  //
  // Everything here clears (0,16) by more than 1.7 m — the hanging threshold at
  // the start radius, not just the 1.05 m removal disc — so nothing is chewing
  // before the player has touched a key.
  bench(sim, -2.6, 17.4); bench(sim, 2.4, 17.4); bench(sim, -2.6, 13.6); bench(sim, 2.4, 13.6);
  trashBags(sim, 1.8, 12.4); trashBags(sim, -2.9, 12.4); trashBags(sim, 4.4, 17.3);
  trashBin(sim, 3.6, 12.2); trashBin(sim, -4.4, 17.4); trashBin(sim, -1.4, 10.2);
  hotDogCart(sim, -6, 17.4); hotDogCart(sim, 4.5, 11.5);
  bikeRack(sim, -4.6, 14, 4, 'z'); bikeRack(sim, 3.6, 14, 4, 'z');
  for (const [cx, cz] of [[-6.5, 12.5], [6.5, 15.5], [-7.5, 15.5], [6.5, 12.5], [0, 10.5]]) {
    cafeTable(sim, cx, cz);
  }
  for (const [px, pz] of [[-4, 8.5], [3, 8.5], [-9, 17.5], [8, 17.5]]) planter(sim, px, pz, 1.5, 1);
  for (const [bx, bz] of [[-9, 13], [-9, 10], [9, 13], [9, 10], [-6, 7.5], [6, 7.5]]) {
    bollard(sim, bx, bz, 0x4a5058);
  }
  for (const [lx, lz] of [[-8, 8], [8, 8], [-10, 15], [10, 15], [0, 6]]) lampPost(sim, lx, lz);
  claim(-11, 5.5, 22, 14.5);   // the whole cluster, so nothing later lands in it

  // Great Lawn outfield fences + the tree line that rings the lawn.
  fenceRun(sim, { x: -13, z: 1.5, len: 8, axis: 'x', h: 1, s: 0.25, postEvery: 2, color: 0x3a4a3a });
  fenceRun(sim, { x: 2, z: 1.5, len: 6, axis: 'x', h: 1, s: 0.25, postEvery: 2, color: 0x3a4a3a });
  claim(-13, 1.5, 8, 1); claim(2, 1.5, 6, 1);
  // Summit Rock: the highest point in the park, a bare striated crag. It is the
  // nearest real mass to spawn, and the excursion's orbit target.
  rockMound(sim, {
    x: -21, z: 3, w: 4, d: 9, h: 6, color: 0x6b675e, crownColor: 0x7b756a,
    crownW: 2, crownD: 5,
  });
  claim(-21, 3, 4, 9);
  plaza.push({ x: -21, z: 3, w: 4, d: 9, color: 0x67635a });
  // Summit Rock's paved overlook and its curved stair. The crown's own top face
  // is y 6, so the deck is a 0.5 m course laid ON it — not a plate on legs.
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 8; k++) B(-19.5 + i * 0.5, 6, 5 + k * 0.5, 'concrete', 0.5, 0x8d8578);
  }
  balustrade(sim, { x: -19.5, z: 5, len: 2, axis: 'x', y0: 6.5, color: 0x9a9184, pierColor: 0x86806f });
  balustrade(sim, { x: -19.5, z: 8.75, len: 2, axis: 'x', y0: 6.5, color: 0x9a9184, pierColor: 0x86806f });
  // The stair climbs WEST onto the rock, so its top tread lands against the
  // crag's east face rather than inside it — dir = -1 with the origin outboard.
  grandStair(sim, { x: -15.5, z: 6, w: 1.5, steps: 3, dir: -1, axis: 'x', stone: 0x7d7768, cheek: 0x6f6a61 });
  claim(-17.2, 5.3, 2, 2.5);

  // ==================================== PASS 2 · §1.3 GREAT LAWN AND BELVEDERE
  // The half of the park a New Yorker pictures first, and the half that decides
  // this level's pacing: everything here is inside 25 m of spawn (0,16), which
  // is the only stretch of park a SIZE 1 hole can reach before the growth ladder
  // starts asking for real mass. Belvedere's crag alone is 75 one-metre concrete
  // blocks — 150 mass in one landform, against 0.016 for a panel brick.

  // #23 the ball-field fan: eight tan infields swung in an arc across the lawn's
  // north half, with the low outfield fences down both flanks.
  for (let i = 0; i < 8; i++) {
    sand.push({ x: -13.5 + i * 3, z: 1 + Math.abs(i - 3.5) * 0.55, w: 2.4, d: 2.4, color: 0xb99a63 });
  }
  for (const fx of [-13.5, 8.5]) {
    fenceRun(sim, { x: fx, z: 3, len: 11, axis: 'z', h: 1, s: 0.25, postEvery: 2, color: 0x3a4a3a });
    claim(fx - 0.3, 3, 1, 11);
  }

  // #25 Belvedere Castle on Vista Rock. The single highest-value object in the
  // scene: 11 m to the crenellations, 7 m from spawn, and built from the same
  // grey schist as the crag under it so the folly reads as grown out of the rock.
  castleFolly(sim, {
    x: -10, z: 19, w: 5, d: 5, cragH: 3, towerW: 3, towerD: 3, towerH: 6,
    wingH: 4, terraceD: 2, rock: 0x67635a, rockCrown: 0x746f66,
    stone: 0x6c6760, trim: 0x9e988a, roof: 0x49505a, merlon: 0x7d776b,
  });
  claim(-10, 19, 5, 5);
  plaza.push({ x: -11, z: 24, w: 7, d: 1, color: 0x7a746a });   // the apron below the terrace
  for (const [lx, lz] of [[-10.5, 24.5], [-4.5, 24.5]]) {
    if (clear(lx, lz)) { lampPost(sim, lx, lz); claim(lx - 0.4, lz - 0.4, 1, 1); }
  }

  // #24 Turtle Pond's furniture: the wooden viewing dock on the south-east, the
  // turtle logs, and the cattail bed on the east shore. The dock stands IN the
  // water — the plane is render-only decor, so a deck at grade floats on it.
  for (let i = 0; i < 4; i++) {
    for (const dz of [21, 21.5]) B(1 + i * 0.5, 0, dz, 'wood', 0.5, 0x8a6a4a);
  }
  for (const [rx, rz] of [[-1, 20], [4.5, 20.5]]) B(rx, 0, rz, 'concrete', 0.5, 0x5f5a50);
  for (const [cx2, cz2] of [[4.25, 23], [4.75, 23.25], [5.5, 23], [6, 23.5], [3.5, 23.25]]) {
    for (let y = 0; y < 0.75; y += 0.25) B(cx2, y, cz2, 'leaf', 0.25, 0x4a6b3a);
  }
  claim(1, 20.5, 3, 1.5); claim(3.25, 22.75, 3, 1.25);

  // #26 the Delacorte: a fan of solid seating banks opening east onto the pond
  // and the castle, with the stage box and its rigging mast on the west.
  amphitheater(sim, {
    x: -14.5, z: 17.5, w: 4, d: 4, rows: 5, rise: 0.5, stageW: 1.5, stageH: 3, towerH: 6,
    seat: 0x37453d, stage: 0x6f6e67, mast: 0x2f3640,
  });
  claim(-14.5, 17.5, 4.5, 4);
  plaza.push({ x: -15, z: 21.5, w: 5, d: 1, color: 0x7d7669 });

  // #28 the Swedish Cottage: a small dark-timber Nordic chalet with a steep
  // shingled roof, tucked between Summit Rock and the Shakespeare Garden.
  pavilion(sim, {
    x: -21, z: 12.5, w: 3, d: 3, h: 3, wallMat: 'wood', wall: 0x4a3524,
    plate: 0x6a5a44, roofMat: 'panel', roof: 0x5a4636, roofRise: 1,
  });
  claim(-21, 12.5, 3, 3);

  // #27 the Shakespeare Garden: terraced, dry-stone-walled, and the only place
  // in the park planted in more than one colour.
  // The band between the Swedish Cottage and the 79th's trench is 3 m deep, so
  // the garden is exactly what fits: two dry-stone retaining courses and the
  // planting between them. Its pergola did not fit and is NOT built — see the
  // Pass 2 handoff; the Conservatory Garden's wisteria arcade already carries
  // that silhouette two hundred metres north.
  parkWall(sim, { x: -20.5, z: 15.5, len: 3, axis: 'x', h: 1, mat: 'concrete', color: 0x6a6459 });
  parkWall(sim, { x: -20.5, z: 17.6, len: 3, axis: 'x', h: 1, mat: 'concrete', color: 0x625d53 });
  claim(-20.5, 15.5, 3, 1); claim(-20.5, 17.6, 3, 1);
  for (const [px, pz, pc] of [[-20.6, 16.75, 0x8a3f52], [-19.4, 16.75, 0x7a6a2e], [-18.2, 16.75, 0x5a3f7a]]) {
    planter(sim, px, pz, 1, 0.75, pc);
    claim(px, pz, 1, 0.75);
  }

  // #30 Cleopatra's Needle on Greywacke Knoll: red granite, tapered, a small
  // pyramidion cap, and a low iron fence round the grass it stands on. The one
  // warm colour accent in a district that is otherwise green and grey.
  obelisk(sim, {
    x: 8.5, z: 18.5, h: 6, s: 0.5, baseW: 1.5, baseH: 1, shaftW: 1, taper: 1,
    taperEvery: 4, stone: 0x8a4a3a, capColor: 0xb99a63, plinth: 0x8f887c,
  });
  claim(8.5, 18.5, 1.5, 1.5);
  // Only the south side gets a rail: the north side of the knoll is already
  // Pass 1's planter, which is the flower ring the plan asks for anyway.
  fenceRun(sim, { x: 8.25, z: 20.25, len: 1.75, axis: 'x', h: 0.75, s: 0.25, postEvery: 1, color: 0x22262c });
  claim(8.25, 20.25, 1.75, 0.6);

  // #22 the Pinetum's edge furniture. Isolated 0.25 m props on the needle floor
  // — the cheapest thing a fresh hole can actually bite, and the reason the
  // conifer stand is not a dead zone.
  for (const [bx, bz] of [[-13.5, -1.5], [-9, -1.5], [-5, -1.5]]) {
    if (clear(bx, bz)) { bench(sim, bx, bz); claim(bx - 0.4, bz - 0.4, 1.8, 1.3); }
  }
  for (const [dx, dz] of [[-11, -1], [-7, -1]]) {
    if (clear(dx, dz)) { drinkingFountain(sim, dx, dz); claim(dx - 0.4, dz - 0.4, 1, 1); }
  }
  signPost(sim, -15.5, -1, 0x2f4a3a, 1.75, 'x', 1);
  claim(-15.7, -1.2, 1.8, 0.8);

  // ================================= PASS 2 · §1.4 THE RAMBLE AND THE LAKE
  // Thirty-six acres of deliberately disorienting woodland with a stream in it,
  // and the one stretch of the park with no straight lines anywhere.

  // Every park bridge, built from the table declared with the water. They go in
  // as a group rather than one per district because their footprints are what
  // the rims were told to skip, and a bridge that moves without its rim moving
  // leaves a hole in the bank.
  for (const b of PARK_BRIDGES) {
    archBridge(sim, b);
    const f = bridgeFoot(b);
    claim(f.x, f.z, f.w, f.d);
  }

  // Rock outcrops in the Ramble's woodland floor, laid before the grove so the
  // scatter's skip predicate can see them.
  for (const [rx, rz, rw, rd, rh] of [[-7, 27, 3, 3, 3], [-6, 36, 3, 2, 2], [4, 37, 3, 2, 2], [-3, 39, 2, 2, 2]]) {
    rockMound(sim, { x: rx, z: rz, w: rw, d: rd, h: rh, color: 0x66625a, crownColor: 0x736e64, crownW: 2, crownD: 1 });
    claim(rx, rz, rw, rd);
  }
  // The Ramble's own path maze: half-width ribbons that wander rather than run.
  for (const line of [
    [[-8, 28], [-5, 29.5], [-3, 32], [-4, 35], [-6, 38], [-8, 40]],
    [[-1, 27], [-0.5, 30.5], [-1.5, 34], [-0.5, 37.5], [1, 40]],
    [[2, 35], [3.5, 34], [4, 31], [3, 28]],
  ]) sidewalks.push(...pathRibbon(line, 0.5, { color: 0x8b8578 }));
  plant({ x: -7.2, z: 27.2, w: 11, d: 14, step: 2.2 });   // second pass, thickens the canopy

  // #38 Hernshead: a rock promontory on the Lake's west shore carrying the
  // Ladies Pavilion — a small cream cast-iron gazebo with a polychrome roof.
  gazebo(sim, {
    x: -16, z: 40, w: 2, d: 2, h: 2.5, post: 0xe4e0d0, plate: 0xd4cdb8,
    roof: 0x8a4a52, peak: 2, octagon: true,
  });
  claim(-16.4, 39.6, 2.8, 2.8);

  // #36 / #37 the Boathouse cove and the Loeb Boathouse: a long low pavilion in
  // yellow-buff brick with a broad green roof, its dock deck out over the water.
  pavilion(sim, {
    x: 7, z: 39, w: 3, d: 4, h: 3, wallMat: 'brick', wall: 0xc9b481,
    plate: 0xe8e2d4, roofMat: 'panel', roof: 0x3f6b4a, roofRise: 1,
  });
  claim(7, 39, 3, 4);
  boardwalk.push({ x: 3.2, z: 40.2, w: 2.6, d: 2.6, color: 0x8a6a4a });
  for (const [bx, bz, ax] of [[3.5, 41, 'x'], [4.5, 42, 'x'], [-12, 45, 'x'], [-9, 46.5, 'z'], [1, 46, 'x']]) {
    rowBoat(sim, bx, bz, ax, (bx + bz) % 2 < 1 ? 0x2f6b3a : 0x7a3a2e);
  }

  // #35 Cherry Hill: a small rise with a paved carriage-turn and the Cherry Hill
  // Fountain — a stone basin under a ring of gas-lamp globes.
  plaza.push({ x: -10, z: 49.6, w: 4.5, d: 3.4, color: 0x9a958a });
  tieredFountain(sim, { cx: -8, cz: 51, r: 0.75, tiers: 2, stone: 0xa8a294, rim: 0x8f887c });
  claim(-9.2, 49.8, 2.4, 2.4);
  for (const [lx, lz] of [[-9.6, 50.2], [-6.6, 50.2], [-9.6, 52], [-6.6, 52]]) {
    if (clear(lx, lz)) { lampPost(sim, lx, lz); claim(lx - 0.3, lz - 0.3, 0.8, 0.8); }
  }

  // ============== PASS 2 · §1.5 BETHESDA, THE MALL, CONSERVATORY WATER
  // The park's one formal axis and its ceremonial heart. Everything here is
  // built to a straight line, which is exactly why the Ramble above and Sheep
  // Meadow beside it read as wild.

  // #44 the Angel of the Waters. Solid stepped stone discs with the bronze
  // standing on the crown — three metres across and four and a half tall, which
  // is deliberately oversized for a park at this scale. It is the centrepiece.
  tieredFountain(sim, {
    cx: -2, cz: 51.5, r: 1.5, tiers: 3, tierDrop: 0.5, figureH: 2.5,
    stone: 0xb0a184, rim: 0x9a8d72, bronze: 0x2c4038, jet: 0xd8e4e8,
  });
  claim(-3.8, 49.8, 3.6, 3.6);
  // #43 the lower plaza's sandstone balustrades. The north run is in two
  // segments because the fountain's own basin owns the middle of that edge.
  balustrade(sim, { x: -6, z: 50, len: 2.5, axis: 'x', color: 0xb0a184, pierColor: 0x9a8d72 });
  balustrade(sim, { x: -0.5, z: 50, len: 2.5, axis: 'x', color: 0xb0a184, pierColor: 0x9a8d72 });
  // The side runs start a cell in: a corner cell belongs to exactly one run.
  balustrade(sim, { x: -6, z: 50.25, len: 2.75, axis: 'z', color: 0xb0a184, pierColor: 0x9a8d72 });
  balustrade(sim, { x: 1.75, z: 50.25, len: 2.75, axis: 'z', color: 0xb0a184, pierColor: 0x9a8d72 });
  claim(-6.2, 49.8, 0.7, 3.4); claim(1.6, 49.8, 0.7, 3.4);
  for (const [bx, bz] of [[-5.4, 52.2], [1, 52.2], [-5.4, 50.4], [1, 50.4]]) {
    if (clear(bx, bz)) { bench(sim, bx, bz); claim(bx - 0.4, bz - 0.3, 1.8, 1.2); }
  }

  // #45 the arcade. A single corbelled sandstone vault under the Cross Drive,
  // with the Minton ceiling painted onto the deck's UNDERSIDE — one soffit
  // colour instead of a tile plane hanging under a plate it could not reach.
  // The plan's three round bays per face are not built: a corbelled opening
  // cannot be subdivided without putting a pier in the middle of the passage.
  stoneArch(sim, {
    x: -6, z: 53, span: 5, pier: 1, width: 2, rise: 3, axis: 'x',
    color: 0xbfae8c, deckColor: 0x44474d, soffit: 0xd9924a,
  });
  claim(-6, 53, 7, 2);

  // #46 the upper terrace: a 1.5 m raised sandstone landing at the head of the
  // Mall with two broad stairs down to the arcade's mouth. Solid all the way
  // through — a hollow terrace is a plate on legs and it drops at spawn.
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 18; i++) {
      for (let k = 0; k < 4; k++) {
        B(-6.5 + i * 0.5, j * 0.5, 56 + k * 0.5, 'concrete', 0.5, j === 2 ? 0xb0a184 : 0x9a8d72);
      }
    }
  }
  for (const sx of [-4.5, 1.5]) {
    grandStair(sim, { x: sx, z: 54.5, w: 1, steps: 3, dir: 1, axis: 'z', stone: 0xb0a184, cheek: 0x9a8d72 });
  }
  balustrade(sim, { x: -6.5, z: 56, len: 1.5, axis: 'x', y0: 1.5, color: 0xb0a184, pierColor: 0x9a8d72 });
  balustrade(sim, { x: -3, z: 56, len: 4, axis: 'x', y0: 1.5, color: 0xb0a184, pierColor: 0x9a8d72 });
  for (const lx of [-6.25, 2.25]) lampPost(sim, lx, 57.75, 1.5);
  claim(-7, 54.3, 10.5, 4.2);
  plaza.push({ x: -7, z: 55.8, w: 10, d: 2.4, color: 0xa89a80 });

  // #47 the Mall — the only straight formal axis in the park, and the only
  // place two rows of trees are asked to MEET overhead. The vault is corbelled
  // leaf: see elmTunnel for why the crowns can close at all.
  elmTunnel(sim, {
    x: -4.5, z: 58, len: 15, axis: 'z', gap: 4, step: 1.5, courses: 3, overhang: 0.5,
    trunkH: 2, trunk: 0x5f4630, leaf: 0x3f7a3a, leaf2: 0x336b30,
  });
  claim(-5.2, 58, 6, 15);

  // #48 Literary Walk: five bronzes on granite plinths, alternating down the
  // Mall's edges outside the elm rows.
  for (const [sx, sz] of [[-6, 72], [-6, 69.5], [-6, 67], [1, 70.5], [1, 68]]) {
    statue(sim, {
      x: sx, z: sz, h: 4, plinth: 1.5, w: 1, d: 1, figW: 0.5, figD: 0.5,
      stone: 0x9a9184, bronze: 0x2b342c,
    });
    claim(sx - 0.6, sz - 0.6, 2.2, 2.2);
  }
  // Green cast-iron benches and twin-globe lamps down both Mall edges.
  for (let z = 59; z < 73; z += 2) {
    for (const lx of [-5.25, 0.75]) {
      if (clear(lx, z)) { lampPost(sim, lx, z); claim(lx - 0.3, z - 0.3, 0.8, 0.8); }
    }
    for (const bx of [-5.9, 0.6]) {
      if (clear(bx, z + 1)) { bench(sim, bx, z + 1); claim(bx - 0.4, z + 0.7, 1.8, 1.2); }
    }
  }

  // #49 the Naumburg Bandshell: a corbelled limestone half-dome opening north
  // onto its plaza, with the coffer bands reading as rings inside the vault.
  halfDomeShell(sim, { cx: 3.5, cz: 63, r: 3, drum: 4, thick: 3, dir: -1, stone: 0xd8d0ba, coffer: 0xc0b79f });
  claim(0.3, 59.8, 6.5, 3.6);
  // #50 Rumsey Playfield: flat event ground, a low fence and a stage footprint.
  fenceRun(sim, { x: 4.5, z: 57.5, len: 3.5, axis: 'x', h: 1, s: 0.25, postEvery: 1.5, color: 0x2f3640 });
  claim(4.5, 57.3, 3.5, 0.6);
  plaza.push({ x: 5, z: 59.5, w: 2.5, d: 1.5, color: 0x6f6a62 });

  // #39-#42 Conservatory Water: the formal boat pond. Hard granite kerb (the rim
  // is already the kerb), a model-sailboat fleet on the water, and the two
  // bronzes children climb.
  for (const [sx, sz] of [[14, 41], [16.5, 42.5], [18, 40.5], [15, 44], [17, 43.5]]) {
    sailBoat(sim, sx, sz, (sx + sz) % 3 < 1 ? 0xf2ede2 : 0xe8d4b0);
  }
  statue(sim, {                                        // #40 Alice in Wonderland
    x: 13.5, z: 36.5, h: 4, plinth: 1.5, w: 1.5, d: 1, figW: 1, figD: 0.5,
    stone: 0x9a9184, bronze: 0x35352c,
  });
  claim(12.8, 35.8, 3.2, 2.7);
  statue(sim, {                                        // #41 Hans Christian Andersen
    x: 13.5, z: 46.5, h: 3, plinth: 1, w: 1, d: 1, figW: 0.5, figD: 0.5,
    stone: 0x9a9184, bronze: 0x35352c,
  });
  claim(12.8, 45.8, 2.4, 2.4);
  pavilion(sim, {                                      // #42 Kerbs Boathouse
    x: 16, z: 35, w: 3, d: 3, h: 3, wallMat: 'brick', wall: 0x9a4536,
    plate: 0xd8cfae, roofMat: 'panel', roof: 0x7a4030, roofRise: 1,
  });
  claim(16, 35, 3, 3);
  for (let z = 39.5; z < 45; z += 2) {
    for (const [bx, bz] of [[11, z], [21.2, z]]) {
      if (clear(bx, bz)) { bench(sim, bx, bz); claim(bx - 0.4, bz - 0.3, 1.8, 1.2); }
    }
  }

  // #51 / #52 Strawberry Fields and the Imagine mosaic. The mosaic is DECOR, not
  // blocks: a flush terrazzo medallion has no volume, and it is pushed last so
  // it paints over the path ribbon it is set into.
  parkWall(sim, { x: -21, z: 45, len: 5, axis: 'z', h: 1, mat: 'concrete', color: 0x6a6459 });
  claim(-21, 45, 1, 5);
  sidewalks.push(...pathRibbon([[-21.5, 50], [-19.5, 50], [-17.5, 49.4]], 1.2, { color: 0x8b8578 }));
  sidewalks.push(...mosaicDisc(-19.5, 50, 0.8, { colors: [0x14161a, 0xece8de], segments: 12, core: 1 }));
  for (const [bx, bz] of [[-20.6, 47.5], [-20.6, 52], [-18.4, 46.5]]) {
    if (clear(bx, bz)) { bench(sim, bx, bz); claim(bx - 0.4, bz - 0.3, 1.8, 1.2); }
  }

  // #53 Sheep Meadow: fifteen acres of nothing, ringed by a low chain fence.
  // The emptiness IS the feature, so the fence is the only thing that touches it.
  fenceRun(sim, { x: -17, z: 61.5, len: 11.5, axis: 'z', h: 0.75, s: 0.25, postEvery: 2, color: 0x3a4a3a });
  fenceRun(sim, { x: -6.75, z: 61.5, len: 11.5, axis: 'z', h: 0.75, s: 0.25, postEvery: 2, color: 0x3a4a3a });
  fenceRun(sim, { x: -16.75, z: 61.5, len: 9.75, axis: 'x', h: 0.75, s: 0.25, postEvery: 2, color: 0x3a4a3a });
  fenceRun(sim, { x: -16.75, z: 72.75, len: 9.75, axis: 'x', h: 0.75, s: 0.25, postEvery: 2, color: 0x3a4a3a });
  claim(-17.2, 61.3, 0.7, 11.9); claim(-7, 61.3, 0.7, 11.9);
  claim(-17, 61.3, 10.2, 0.6); claim(-17, 72.6, 10.2, 0.6);

  // ================================================ PASS 2 · §1.6 SOUTH PARK
  // Everything below the 65th transverse: the Zoo, the rink, the Carousel, the
  // Pond and the two corner monuments. The transverse is a hard northern edge
  // here — it is a `roads` rect, so nothing in this district may cross z 77.7.

  // #54 the Central Park Zoo. Small red-brick pavilions with green-tiled hipped
  // roofs ranged around the sea lion pool, with a brick-piered pergola arcade
  // down its west side and the glazed tropic house on the south.
  pavilion(sim, {                                       // bird house, north-west
    x: 13, z: 78, w: 3, d: 3, h: 3, wallMat: 'brick', wall: 0x9a4536,
    plate: 0xd8cfae, roofMat: 'panel', roof: 0x3f6b4a, roofRise: 1,
  });
  claim(13, 78, 3, 3);
  pavilion(sim, {                                       // the tropic house, glazed
    x: 18, z: 82.5, w: 3, d: 3, h: 3, kind: 'curtain', wallMat: 'steel', wall: 0xb8bec6,
    plate: 0xd8cfae, roofMat: 'panel', roof: 0x3f6b4a, roofRise: 1,
  });
  claim(18, 82.5, 3, 3);
  // The sea lion house sits WEST of the pool, not south of it: the band between
  // the pool's own rim (z 85) and the Pond neck's rim (z 87) is two metres, and
  // a pavilion needs three in both directions or tower() reads it as all corner.
  pavilion(sim, {
    x: 12, z: 85, w: 3, d: 3, h: 3, wallMat: 'brick', wall: 0x9a4536,
    plate: 0xd8cfae, roofMat: 'panel', roof: 0x3f6b4a, roofRise: 1,
  });
  claim(12, 85, 3, 3);
  pergola(sim, { x: 13, z: 81.5, len: 3, axis: 'z', w: 1, h: 2.5, mat: 'brick', color: 0x8a4536, beamColor: 0x6f4a34 });
  claim(13, 81.5, 1, 3);
  rockMound(sim, { x: 15, z: 82, w: 1, d: 1, h: 2, color: 0x6b675e, crownColor: 0x7b756a });
  claim(15, 82, 1, 1);
  // #55 the Delacorte Music Clock: a bronze dial on a two-legged brick arch over
  // the zoo's north entrance.
  stoneArch(sim, {
    x: 16, z: 78, span: 1, pier: 1, width: 1, rise: 3, axis: 'x',
    mat: 'brick', color: 0x8a4536, deckColor: 0x6f4a34,
  });
  B(17, 4, 78, 'panel', 1, 0xc9a227);                   // the dial and its two bell monkeys
  B(17, 5, 78.25, 'panel', 0.5, 0x8a7a3a); B(17.5, 5, 78.25, 'panel', 0.5, 0x8a7a3a);
  claim(16, 78, 3, 1);

  // #56 the Arsenal: an 1851 red-brick fort with corner battlements. Predates
  // the park, and looks it — a toy castle wedged against the Fifth Ave wall.
  pavilion(sim, {
    x: 18, z: 79.2, w: 3, d: 3, h: 4, wallMat: 'brick', wall: 0x8a3f2e,
    plate: 0x9a4536, roofMat: 'panel', roof: 0x8a3f2e, roofRise: 0,
  });
  crenellation(sim, { x: 18, y: 5, z: 79.2, w: 3, d: 3, mat: 'brick', color: 0x9a4536 });
  claim(18, 79.2, 3, 3);

  // #57 Wollman Rink. The ice is a water rect and its low grey parapet is the
  // rim that goes with it; the skate-hire block sits on the north side and four
  // flood masts stand clear of the parapet's own cells at the corners.
  pavilion(sim, {
    x: 1, z: 81, w: 3, d: 3, h: 2, kind: 'masonry', wallMat: 'concrete', wall: 0x8d9099,
    plate: 0x74777e, roofMat: 'panel', roof: 0x5a5f66, roofRise: 1,
  });
  claim(1, 81, 3, 3);
  for (const [mx, mz] of [[-0.4, 83.6], [6.4, 83.6], [-0.4, 88.4], [6.4, 88.4]]) {
    lightMast(sim, mx, mz, 5);
    claim(mx - 0.4, mz - 0.4, 1, 1);
  }
  // Four deck rects around the ice, not one under it: water paints over plaza,
  // so a single rect would erase its own middle (the Lasker deck, again).
  plaza.push(
    { x: -0.5, z: 83.5, w: 7.5, d: 1.5, color: 0x8f8d86 },
    { x: -0.5, z: 88, w: 7.5, d: 1.5, color: 0x8f8d86 },
    { x: -0.5, z: 85, w: 1.5, d: 3, color: 0x8f8d86 },
    { x: 5, z: 85, w: 2, d: 3, color: 0x8f8d86 },
  );

  // #60 the Carousel: a round red-brick drum with a conical shingled roof, and
  // the ride itself standing inside it. The drum's cap plate is at 3.5 m so it
  // clears the carousel's own canopy — they are two objects in one footprint and
  // a shared cell between them is a ghost.
  roundHouse(sim, {
    cx: -4, cz: 80, r: 3, h: 3.5, wallMat: 'brick', wall: 0xa8452f,
    plate: 0x8a6a4a, roof: 0xc4552f, cone: 3, arches: 6,
  });
  carousel(sim, -4, 80, 2, { deck: 0xe8d9b5, canopy: [0xc23b2e, 0xf2ede2] });
  claim(-7.2, 76.8, 6.4, 6.4);

  // #61 the Chess & Checkers House on the Kinderberg: an octagonal brick
  // pavilion with open arcaded sides and stone game tables around it.
  gazebo(sim, {
    x: -10, z: 78, w: 3, d: 3, h: 2.5, postMat: 'brick', post: 0x9a4536,
    plate: 0xc0b79f, roof: 0x7a4030, peak: 2, octagon: true,
  });
  claim(-10, 78, 3, 3);
  for (const [tx, tz] of [[-11.2, 79], [-11.2, 80.8], [-6.6, 79], [-6.6, 80.8]]) {
    if (clear(tx, tz)) { cafeTable(sim, tx, tz, 0x9a958a, 0x4a4f46); claim(tx - 0.9, tz - 0.4, 2, 1); }
  }

  // #62 Heckscher: multi-diamond ballfields with a primary-coloured playground
  // on the west, all of it below the surrounding rock.
  for (const [dx, dz] of [[-18, 84], [-14, 84], [-18, 89], [-14, 89]]) {
    sand.push({ x: dx, z: dz, w: 3.2, d: 3.2, color: 0xb99a63 });
    fenceRun(sim, { x: dx, z: dz - 0.4, len: 3, axis: 'x', h: 1.5, s: 0.25, postEvery: 1, color: 0x7a4f38 });
    claim(dx - 0.2, dz - 0.6, 3.4, 0.6);
  }
  playgroundSet(sim, { x: -20, z: 81 });
  claim(-20.2, 80.6, 5.6, 1.6);

  // #64 Tavern on the Green: Victorian-Gothic cream stucco under a steep slate
  // roof, with the glazed Crystal Room wing on its north.
  pavilion(sim, {
    x: -21, z: 68.5, w: 3, d: 4, h: 3, wallMat: 'brick', wall: 0xd6cdb4,
    plate: 0xb8ae94, roofMat: 'panel', roof: 0x4a4a52, roofRise: 2,
  });
  claim(-21, 68.5, 3, 4);
  pavilion(sim, {
    x: -21, z: 65.2, w: 3, d: 3, h: 3, kind: 'curtain', wallMat: 'steel', wall: 0xe8ecf2,
    plate: 0xd8d2c2, roofMat: 'panel', roof: 0xb8bec6, roofRise: 0,
  });
  claim(-21, 65.2, 3, 3);

  // #65 Balto: a bronze sled dog on a schist boulder, right on the East Drive
  // where the real one stands.
  statue(sim, {
    x: 8.5, z: 69, h: 3, plinth: 1.5, w: 1, d: 1, figW: 1, figD: 0.5,
    stone: 0x6b675e, bronze: 0x8a6a3a,
  });
  claim(7.8, 68.3, 2.4, 2.4);

  // #58 the Hallett Nature Sanctuary: a dark wooded rock knoll on the Pond's
  // west bank, and the boulders that spill out of it.
  rockMound(sim, { x: 7, z: 91, w: 3, d: 3, h: 3, color: 0x615d54, crownColor: 0x6f6a60, crownW: 2, crownD: 2 });
  claim(7, 91, 3, 3);

  // #66 the USS Maine Monument at Merchants' Gate: a white marble pylon with a
  // gilded crown. The brightest highlight at the park's south-west corner.
  obelisk(sim, {
    x: -21, z: 96.5, h: 8, s: 0.5, baseW: 2.5, baseH: 1.5, shaftW: 1.5, taper: 0,
    stone: 0xe8e4d8, capColor: 0xd6b84a, plinth: 0xdcd6c6,
  });
  claim(-21, 96.5, 2.5, 2.5);
  plaza.push({ x: -21.5, z: 96, w: 3.5, d: 3, color: 0xa8a294 });

  // #67 the Sherman Monument at Scholars' Gate. It stands in the east wall's
  // z 94..99 gate opening, on Fifth Avenue's park-side sidewalk, and its plinth
  // stops exactly at the kerb — one more cell east and it would be in the road.
  equestrian(sim, { x: 21.5, z: 96, h: 3, s: 0.5, w: 1.5, d: 1, stone: 0xb59a6a, bronze: 0xc9a227 });
  claim(21, 95.5, 2.5, 2.5);

  // ========================================== PASS 3 · THE CITY AROUND THE PARK
  // Everything from here down is §3 (Central Park West and the Upper West Side),
  // §4 (Fifth Avenue, Museum Mile and the Upper East Side), §5 (Harlem) and §6
  // (making the three read apart) of the geography plan.
  //
  // HOW THE WALLS ARE AUTHORED. An avenue is one continuous `streetWall` run per
  // band, filtered through two predicates rather than hand-cut:
  //   - `roadClash` drops any building whose footprint comes within 1.2 m of a
  //     roadway, so a cross street can be moved in the table above and the wall
  //     re-parts around it with no edits either side. It is also what keeps the
  //     0.5 m cornice and the 1 m fire-escape landing inside the 1.5 m sidewalk.
  //   - `taken` drops any building overlapping a RESERVED landmark footprint.
  //     Every named building is `hold()`ed first, the generic fill runs second,
  //     and the landmarks are built third — so the Dakota is never half a
  //     generic apartment block.
  //
  // WHAT MAKES THE THREE NEIGHBOURHOODS TELL APART (plan §6), in the order a
  // player notices them:
  //   west  — warm buff/tan brick over limestone, IRREGULAR heights, twin towers
  //           punched up out of a 13 m wall, water towers on nearly every roof,
  //           fire escapes on the side-street elevations.
  //   east  — cold pale grey limestone, a DEAD-FLAT 13 m line for whole blocks,
  //           heavy stone cornice at one height, museums that step DOWN out of
  //           the wall rather than up, almost no water towers and no escapes.
  //   north — warm red-brown brownstone, FOUR storeys and one cornice line, a
  //           stoop every few metres, fire escapes across the full front, and
  //           exactly one seventeen-metre outlier in the whole district.
  const reserved = [];
  const hold = (x, z, w, d) => { reserved.push({ x, z, w, d }); claim(x, z, w, d); };
  const taken = (x, z, w, d) => reserved.some((r) =>
    x < r.x + r.w && x + w > r.x && z < r.z + r.d && z + d > r.z);
  const wallSkip = (x, z, w, d) => roadClash(x, z, w, d) || taken(x, z, w, d);
  const claimAll = (fps) => { for (const f of fps) claim(f.x, f.z, f.w, f.d); };

  // Neighbourhood palettes. Colour is the fastest of the six tells and the only
  // one that survives being seen from across the park.
  const UWS_BRICK = [0xbfa87e, 0xc9b48c, 0xb39a72, 0xa8916a, 0xc4ad84];
  const UWS_ROOF = [0x5f5a52, 0x565149, 0x666056];
  const UWS_CORNICE = 0x8f7d5c;
  const LIMESTONE = 0xd0c8b6;
  const UES_STONE = [0xd2cec2, 0xc8c4b8, 0xdcd8cc, 0xbfbcb2, 0xd6d2c6];
  const UES_ROOF = [0x6a6862, 0x615f5a];
  const UES_CORNICE = 0xb0aca0;
  const HARLEM_BRICK = [0x8a5545, 0x77463a, 0x9a6250, 0x6f4034, 0x8f4d3c];
  const HARLEM_ROOF = [0x5a5f66, 0x54585e];
  const HARLEM_CORNICE = 0x5f4436;

  // =============================================== §4 E12 THE METROPOLITAN MUSEUM
  // The one perimeter building that stands INSIDE the park — its Fifth Avenue
  // front IS the park's east boundary, which is why Pass 3 widened that wall's
  // gate to z 3..28 rather than trying to thread the museum past it.
  //
  // It is also, deliberately, the densest single mass in the level and twelve
  // metres from spawn. The SIZE ladder multiplies every growth threshold by
  // round(totalMass / 4200) and this scene now sits on the ×10 clamp, so the
  // excursion needs one place it can bank two thousand units of mass without a
  // long crossing. A 9 x 14 x 7 limestone block with a lantern on top is it.
  hold(12, 0, 10, 21);
  tower(sim, 12, 3, 9, 14, 0, 7, 'masonry', 'concrete', 0xd6cfba);
  BOX(12, 7, 3, 9, 1, 14, 'concrete', 1, 0xc2bba6);
  // the Great Hall's lantern, standing on the main roof plate
  tower(sim, 15, 7, 4, 5, 8, 12, 'masonry', 'concrete', 0xd6cfba);
  BOX(15, 12, 7, 4, 1, 5, 'concrete', 1, 0xbfb7a2);
  for (const [gx, gz] of [[13, 5], [13, 13], [18, 4], [18, 14]]) {   // glass roof lanterns
    BOX(gx, 8, gz, 2, 1, 2, 'glass', 1, 0xa8c4d0);
  }
  // E12a the Beaux-Arts Fifth Avenue front: paired colossal columns, a heavy
  // entablature, four uncarved attic blocks and the flight of steps.
  porticoFront(sim, {
    x: 21, z: 5, len: 11, axis: 'z', dir: 1, depth: 1, colH: 8, colEvery: 3,
    colPairs: true, color: 0xe0d8c4, entab: 0xcdc4ae, attic: 0xd8d0ba, steps: 3,
    stepColor: 0xc8c0aa,
  });
  // E12b the Sackler wing: the sloped glass curtain the Temple of Dendur sits
  // behind, facing north-west into the park. The only glass on this side.
  tower(sim, 15, 0, 5, 3, 0, 4, 'curtain', 'steel', 0xb8bec6);
  BOX(15, 4, 0, 5, 1, 3, 'steel', 1, 0x9db3c0);        // the cap carries; glass never does
  // The raking wall leans back half a metre a course. Each course lays TWO
  // cells so the step above always has one directly beneath it, and every
  // second mullion is steel — a pane's only neighbours being glass is the
  // classic floating curtain (glass vertBond 0.4, below the carry threshold).
  for (let i = 0; i < 10; i++) {
    const m = i % 2 === 0 ? 'steel' : 'glass';
    const c = i % 2 === 0 ? 0xb8bec6 : 0x9dbfd2;
    for (let j = 0; j < 4; j++) {
      B(15 + i * 0.5, 5 + j * 0.5, j * 0.5, m, 0.5, c);
      if (j < 3) B(15 + i * 0.5, 5 + j * 0.5, (j + 1) * 0.5, m, 0.5, c);
    }
  }
  // E12c the Modern wing: a plainer flat-roofed limestone range on the south.
  tower(sim, 13, 17, 7, 3, 0, 4, 'masonry', 'concrete', 0xcfc7b2);
  BOX(13, 4, 17, 7, 1, 3, 'concrete', 1, 0xbdb5a0);
  plaza.push(
    { x: 21.5, z: 3, w: 2, d: 15, color: 0xb8b0a0 },     // the Fifth Ave forecourt
    { x: 12, z: 20, w: 8, d: 1.5, color: 0x9a958a },
  );
  // The plaza's banner poles stand OUTSIDE the step field: the flight already
  // owns x 22..23.5 for the museum's whole frontage.
  for (const pz of [4, 17]) {
    for (let y = 0; y < 4; y += 0.25) B(21.375, y, pz, 'steel', 0.25, 0x6f6a60);
    B(21.375, 4, pz, 'panel', 0.25, 0xc23b2e);
  }
  claim(21.2, 3.8, 0.8, 0.8); claim(21.2, 16.8, 0.8, 0.8);

  // ================ §3 CENTRAL PARK WEST AND THE UPPER WEST SIDE (north → south)
  // §3.1 is explicit that the famous thing here is a RHYTHM OF PAIRED TOWERS
  // rising off a flat 13 m wall, and that the rhythm only reads if the tower
  // COUNT is right building by building:
  //     El Dorado (2) · Beresford (3) · AMNH+sphere · San Remo (2) ·
  //     Dakota (NONE — the deliberate break) · Majestic (2) · Century (2)
  // twinTowerBlock takes that count as data for exactly this reason.
  const CPW_X = -33, CPW_D = 4;                       // the wall band, x[-33,-29]
  hold(CPW_X, -25, CPW_D, 8);        // W4  the El Dorado
  hold(CPW_X, 9, CPW_D, 9);          // W6  the Beresford
  hold(-42, 13, 13, 19);             // W7  the American Museum of Natural History + Rose Center
  hold(CPW_X, 32.5, CPW_D, 3.5);     // W10 the New-York Historical Society
  hold(CPW_X, 39, CPW_D, 7);         // W11 the San Remo
  hold(CPW_X, 46.5, CPW_D, 3);       // W12 the Langham
  hold(CPW_X, 50, CPW_D, 5);         // W13 the Dakota
  hold(CPW_X, 55.5, CPW_D, 7);       // W14 the Majestic
  hold(CPW_X, 70, CPW_D, 4);         // W15 the Hotel des Artistes
  hold(CPW_X, 84, CPW_D, 7);         // W16 the Century
  hold(CPW_X, 93.5, CPW_D, 4);       // W18 Trump International
  hold(-48, 75, 10, 13);             // W17 Lincoln Center
  hold(-41, 102, 7, 9);              // W19 the Deutsche Bank Center
  hold(-29, 110, 3, 3);              // W22 the Museum of Arts and Design
  hold(-52, -122, 9, 18);            // W1  Columbia University
  hold(-52, -101, 10, 6);            // W2  the Cathedral of St John the Divine
  hold(-42, -124, 4, 22);            // H16 the Morningside Park escarpment

  // W5 / W15 the generic pre-war wall. One run for the whole 195 m: the fill
  // parts around every hold() above and every cross street in the table.
  claimAll(streetWall(sim, {
    x: CPW_X, z: -96, len: 194, depth: CPW_D, axis: 'z', front: 1, unit: 6, gap: 1,
    heights: [12, 13, 14, 11], jitter: 1, colors: UWS_BRICK, roofColors: UWS_ROOF,
    cornice: UWS_CORNICE, base: LIMESTONE, water: 2, escape: 3, setback: 3,
    seed: 1, skip: wallSkip,
  }));
  // W23 the Upper West Side block fill: Columbus to Amsterdam, then Amsterdam to
  // Broadway, then Broadway's west frontage. Lower and browner as it goes west,
  // which is what the real avenues do.
  claimAll(streetWall(sim, {
    x: -42, z: -96, len: 194, depth: 3, axis: 'z', front: 1, unit: 6, gap: 1,
    heights: [9, 10, 12, 8], jitter: 2, colors: UWS_BRICK, roofColors: UWS_ROOF,
    cornice: UWS_CORNICE, water: 2, escape: 2, seed: 2, skip: wallSkip,
  }));
  claimAll(streetWall(sim, {
    x: -52, z: -96, len: 194, depth: 3, axis: 'z', front: 1, unit: 7, gap: 1,
    heights: [7, 8, 10, 6], jitter: 2, colors: UWS_BRICK, roofColors: UWS_ROOF,
    cornice: UWS_CORNICE, water: 3, escape: 2, seed: 3, skip: wallSkip,
  }));
  claimAll(streetWall(sim, {
    x: -62, z: -144, len: 242, depth: 3, axis: 'z', front: 1, unit: 7, gap: 2,
    heights: [6, 7, 8], jitter: 1, colors: UWS_BRICK, roofColors: UWS_ROOF,
    cornice: UWS_CORNICE, water: 4, escape: 3, seed: 4, skip: wallSkip,
  }));

  // W4 the El Dorado — TWIN TOWERS, the northernmost of the set. Buff-tan Deco
  // brick, stepped crowns, matching towers at the block's north and south ends.
  twinTowerBlock(sim, {
    ox: CPW_X, oz: -25, w: CPW_D, d: 7, baseH: 14, wall: 0xc9b184, base: LIMESTONE,
    cornice: UWS_CORNICE, corniceDir: 1, corniceAxis: 'z', roof: 0x5f5a52,
    crown: 'deco', crownColor: 0xc9b184, crownAccent: 0x8a7346, water: false,
    towers: [{ dx: 0, dz: 0, w: 3, d: 3, h: 10 }, { dx: 0, dz: 4, w: 3, d: 3, h: 10 }],
  });
  // W6 the Beresford — THREE towers, not four, and baroque lanterns rather than
  // Deco crowns. Heavy Italian Renaissance: the bulkiest thing on the strip.
  twinTowerBlock(sim, {
    ox: CPW_X, oz: 9, w: CPW_D, d: 9, baseH: 16, wall: 0xc4ad84, base: LIMESTONE,
    cornice: UWS_CORNICE, corniceDir: 1, corniceAxis: 'z', roof: 0x5f5a52,
    crown: 'lantern', crownColor: 0xc4ad84, crownAccent: 0x3e8a6a,
    towers: [
      { dx: 0, dz: 0, w: 3, d: 3, h: 6 },
      { dx: 1, dz: 3, w: 3, d: 3, h: 6 },
      { dx: 0, dz: 6, w: 3, d: 3, h: 6 },
    ],
  });
  // W7 the American Museum of Natural History: a whole superblock of dark pink
  // granite and red brick, low and horizontal in a street of towers. Columbus
  // Avenue is declared in two segments precisely so it does not run through it.
  tower(sim, -42, 21, 12, 11, 0, 6, 'masonry', 'brick', 0x9a6f62);
  BOX(-42, 6, 21, 12, 1, 11, 'concrete', 1, 0x6f5f56);
  for (const [tx, tz] of [[-41, 22], [-33, 22], [-41, 28], [-33, 28]]) {   // corner turrets
    tower(sim, tx, tz, 3, 3, 7, 10, 'masonry', 'brick', 0x8f6558);
    BOX(tx, 10, tz, 3, 1, 3, 'concrete', 1, 0x6f5f56);
  }
  waterTower(sim, -37, 7, 25, 0x6f5238);
  // W8 the Theodore Roosevelt Memorial front: a pink granite triumphal screen
  // with four colossal Ionic columns and the equestrian bronze in front of it.
  porticoFront(sim, {
    x: -30, z: 23, len: 7, axis: 'z', dir: 1, depth: 1, colH: 8, colEvery: 2,
    color: 0xb08878, entab: 0x9a7466, attic: 0xa88072, steps: 2, stepColor: 0x9a8a80,
  });
  equestrian(sim, { x: -29.4, z: 21, h: 3, s: 0.5, w: 1.5, d: 1, stone: 0x9a8a80, bronze: 0x4a5044 });
  claim(-29.6, 20.8, 2, 2);
  // W9 the Rose Center: a transparent cube with the Hayden sphere inside it —
  // the only glass building on Central Park West, and it glows at night. The
  // sphere is a stack of discs on a core column, because nothing floats here.
  // The cube is 7 m so the 2 m sphere clears its own curtain wall: at 5 m the
  // equator reached x -36.5 and the east wall started at -37.
  glassSphere(sim, {
    ox: -42, oz: 14, w: 7, d: 7, h: 8, cx: -38.5, cz: 17.5, r: 2, y0: 1.5,
    frame: 0xcdd4dc, sphere: 0xf2f0ea, core: 0xb8bec6,
  });
  // W10 the New-York Historical Society: grey granite, flat roof, an Ionic
  // colonnade across the front. Restrained and horizontal — a museum, not a
  // tower, and the pause before the San Remo.
  tower(sim, CPW_X, 32.5, CPW_D, 3, 0, 7, 'masonry', 'concrete', 0xa8a49a);
  BOX(CPW_X, 7, 32.5, CPW_D, 1, 3, 'concrete', 1, 0x8f8b82);
  porticoFront(sim, {
    x: -29, z: 32.5, len: 3, axis: 'z', dir: 1, depth: 1, colH: 6, colEvery: 2,
    color: 0xb8b4aa, entab: 0xa09c92, steps: 1, stepColor: 0x9a968c,
  });
  // W11 the San Remo — TWIN TOWERS, each capped by a circular open temple of
  // ten columns. That cap is the whole recognition point; nothing else on the
  // avenue has it.
  twinTowerBlock(sim, {
    ox: CPW_X, oz: 39, w: CPW_D, d: 7, baseH: 13, wall: 0xc9b48c, base: LIMESTONE,
    cornice: UWS_CORNICE, corniceDir: 1, corniceAxis: 'z', roof: 0x5f5a52,
    crown: 'temple', crownColor: 0xd8cfb4, crownAccent: 0x3e8a6a,
    towers: [{ dx: 0, dz: 0, w: 3, d: 3, h: 9 }, { dx: 0, dz: 4, w: 3, d: 3, h: 9 }],
  });
  // W12 the Langham fills the gap: Beaux-Arts, heavy cornice, a dormered top.
  setbackTower(sim, {
    ox: CPW_X, oz: 46.5, w: CPW_D, d: 3, tiers: [{ h: 11 }], wall: 0xbfa87e,
    base: LIMESTONE, cornice: UWS_CORNICE, corniceDir: 1, corniceAxis: 'z', roof: 0x4a4a52,
  });
  mansardRoof(sim, {
    ox: CPW_X, oz: 46.5, w: CPW_D, d: 3, y: 12, courses: 3, color: 0x44474e,
    dormer: { every: 1, faces: ['maxX'] }, chimney: [[0.5, 0.5], [3, 2]],
  });
  // W13 the Dakota — NO TOWERS. The rhythm breaker, and its whole character is
  // the roofline: a steep slate mansard bristling with gables, dormers, chimney
  // stacks and iron cresting, filling a third of the total height.
  setbackTower(sim, {
    ox: CPW_X, oz: 50, w: CPW_D, d: 5, tiers: [{ h: 8 }], wall: 0xc4a05e,
    base: 0x8a6a3a, cornice: 0x7a5a34, corniceDir: 1, corniceAxis: 'z', roof: 0x3a3f46,
  });
  mansardRoof(sim, {
    ox: CPW_X, oz: 50, w: CPW_D, d: 5, y: 9, courses: 5, color: 0x33373d,
    dormer: { every: 1, faces: ['maxX', 'minZ', 'maxZ'], color: 0xd8d2c2 },
    chimney: [[0.5, 0.5], [3, 0.5], [0.5, 4], [3, 4], [1.5, 2]], chimneyH: 3,
  });
  fenceRun(sim, { x: -28.9, z: 50, len: 5, axis: 'z', h: 1, s: 0.25, postEvery: 1, color: 0x1c1f24 });
  claim(-29.1, 49.8, 0.6, 5.4);
  // W14 the Majestic — TWIN TOWERS, flat-topped, no crown ornament at all, with
  // the Deco signature of horizontal window bands wrapped round the corners.
  twinTowerBlock(sim, {
    ox: CPW_X, oz: 55.5, w: CPW_D, d: 7, baseH: 14, wall: 0xb39a72, base: LIMESTONE,
    cornice: UWS_CORNICE, corniceDir: 1, corniceAxis: 'z', roof: 0x5f5a52,
    crown: 'flat', crownColor: 0xb39a72,
    towers: [{ dx: 0, dz: 0, w: 3, d: 3, h: 10 }, { dx: 0, dz: 4, w: 3, d: 3, h: 10 }],
  });
  // W15 the Hotel des Artistes: neo-Gothic, double-height studio windows.
  setbackTower(sim, {
    ox: CPW_X, oz: 70, w: CPW_D, d: 4, tiers: [{ h: 12 }], wall: 0xa8916a,
    base: LIMESTONE, cornice: 0x6f5f42, corniceDir: 1, corniceAxis: 'z', roof: 0x4a4f56,
  });
  // W16 the Century — TWIN TOWERS, the slenderest pair and the last before
  // Columbus Circle.
  twinTowerBlock(sim, {
    ox: CPW_X, oz: 84, w: CPW_D, d: 7, baseH: 15, wall: 0xc9b48c, base: LIMESTONE,
    cornice: UWS_CORNICE, corniceDir: 1, corniceAxis: 'z', roof: 0x5f5a52,
    crown: 'flat', crownColor: 0xc9b48c,
    towers: [{ dx: 0, dz: 0, w: 3, d: 3, h: 10 }, { dx: 0, dz: 4, w: 3, d: 3, h: 10 }],
  });
  // W18 Trump International: a slim bronze-mirrored glass slab, flat-topped and
  // deliberately alien beside a hundred and ninety metres of pre-war brick.
  tower(sim, CPW_X, 93.5, CPW_D, 4, 0, 23, 'curtain', 'steel', 0x6a5f4a);
  BOX(CPW_X, 23, 93.5, CPW_D, 1, 4, 'concrete', 1, 0x4a4438);
  // the freestanding polished steel globe at its base: a solid ball on a short
  // plinth, not a ball on a mast that runs up through the middle of it
  BOX(-28.5, 0, 95.5, 2, 1, 2, 'steel', 0.5, 0x8f979f);
  BOX(-29, 0.5, 95, 3, 2, 3, 'steel', 0.5, 0xa8b0ba);
  BOX(-28.5, 1.5, 95.5, 2, 1, 2, 'steel', 0.5, 0xb8c0c8);
  claim(-29.2, 94.8, 2.4, 2.4);
  // W17 Lincoln Center: three matched white travertine buildings around a raised
  // plaza with a circular fountain. Same cream, same flat roof, same colonnade
  // language — they read as one building in three pieces, which is the point.
  plaza.push({ x: -48, z: 75, w: 10, d: 13, color: 0xc0b8a4 });
  tower(sim, -48, 78, 4, 8, 0, 11, 'masonry', 'concrete', 0xe0d8c4);       // Metropolitan Opera
  BOX(-48, 11, 78, 4, 1, 8, 'concrete', 1, 0xc8c0aa);
  porticoFront(sim, {            // the five tall round-headed arched windows
    x: -44, z: 79, len: 6, axis: 'z', dir: 1, depth: 1, colH: 9, colEvery: 2,
    color: 0xe8e0cc, entab: 0xd0c8b2, steps: 0,
  });
  tower(sim, -43, 75, 4, 3, 0, 9, 'masonry', 'concrete', 0xe0d8c4);        // David Geffen Hall
  BOX(-43, 9, 75, 4, 1, 3, 'concrete', 1, 0xc8c0aa);
  tower(sim, -43, 85, 4, 3, 0, 9, 'masonry', 'concrete', 0xe0d8c4);        // David H. Koch Theater
  BOX(-43, 9, 85, 4, 1, 3, 'concrete', 1, 0xc8c0aa);
  tieredFountain(sim, { cx: -40.5, cz: 82, r: 1, tiers: 2, stone: 0xd8d0ba, rim: 0xc0b8a2, jet: 0xd8e4e8 });
  claim(-42, 80.5, 3, 3);
  // W19 the Deutsche Bank Center: twin dark-glass towers on a curved podium —
  // modern twins answering the pre-war ones, and the tallest thing in the level.
  tower(sim, -41, 102, 7, 9, 0, 6, 'curtain', 'steel', 0x3a4048);
  BOX(-41, 6, 102, 7, 1, 9, 'concrete', 1, 0x2f343a);
  for (const [tx, tz] of [[-41, 102], [-37, 106]]) {
    tower(sim, tx, tz, 3, 4, 7, 29, 'curtain', 'steel', 0x2b3138);
    BOX(tx, 29, tz, 3, 1, 4, 'concrete', 1, 0x22262c);
  }
  // W22 the Museum of Arts and Design: a narrow white slot-faced slab.
  tower(sim, -29, 110, 3, 3, 0, 10, 'masonry', 'concrete', 0xe8e6e0);
  BOX(-29, 10, 110, 3, 1, 3, 'concrete', 1, 0xcfcdc6);

  // W1 Columbia's Morningside campus: a walled quadrangle of matched red brick
  // and limestone blocks around a stepped central lawn, with Low Library's
  // colonnaded Pantheon front and copper dome on the axis.
  // Every patch of green OUTSIDE the park goes in `plaza`, pushed after the
  // district bases: `parks` draws first in the layer order, so a lawn declared
  // there would be painted over by the base rect it sits inside.
  plaza.push({ x: -51, z: -111, w: 7, d: 3, color: 0x4f8a3c });          // the central lawn
  plaza.push({ x: -52, z: -122, w: 9, d: 10, color: 0x9a958a }, { x: -52, z: -109, w: 9, d: 5, color: 0x9a958a });
  roundHouse(sim, {                                                       // Low Memorial Library
    // arches 0 = a solid drum. A one-cell-thick ring pierced by bays loses its
    // orthogonal path at the 45-degree diagonals, so the lintel band over a bay
    // there has neither a cell below nor a reachable pier beside it.
    cx: -47.5, cz: -115, r: 3, h: 8, wallMat: 'brick', wall: 0xb0a184,
    plate: 0xd0c8b6, roof: 0x3e8a6a, cone: 3, arches: 0,
  });
  porticoFront(sim, {                                                     // its ten-column portico
    x: -49, z: -111.5, len: 3, axis: 'x', dir: 1, depth: 1, colH: 6, colEvery: 1,
    color: 0xd8d0ba, entab: 0xc0b8a2, steps: 3, stepColor: 0xb8b0a0,
  });
  for (const [qx, qz, qw, qd] of [[-52, -122, 4, 3], [-45, -122, 3, 3], [-52, -107, 4, 3], [-45, -107, 3, 3]]) {
    setbackTower(sim, {
      ox: qx, oz: qz, w: qw, d: qd, tiers: [{ h: 8 }], wallMat: 'brick', wall: 0x9a6a52,
      base: LIMESTONE, roof: 0x3e8a6a,
    });
  }
  statue(sim, { x: -47.5, z: -108.5, h: 3, plinth: 1, w: 1, d: 1, stone: 0xc0b8a2, bronze: 0x3e6a52 });
  claim(-48, -109, 2, 2);
  // W2 the Cathedral of St John the Divine: enormous, Gothic, and UNFINISHED —
  // the two west towers stay as stubs, which is the building's signature. They
  // stand clear of the nave rather than at its corners: a tower footprint
  // inside the nave would want the same cells as the nave's own roof.
  naveChurch(sim, {
    ox: -51, oz: -101, w: 9, d: 5, h: 10, axis: 'x', stone: 0xc4beac, roof: 0x6a6f74,
    roofRise: 1, buttress: 4, buttressH: 7, transept: { at: 4, over: 2, h: 13, thick: 3 },
    apse: { end: 'max', r: 2 },
    gable: { face: 'min', w: 4, h: 6, color: 0x2f4a6a, y0: 2 },   // the rose over the portals
  });
  for (const tz of [-101, -98]) {
    tower(sim, -53.5, tz, 2, 2, 0, 8, 'masonry', 'concrete', 0xc4beac);
    BOX(-53.5, 8, tz, 2, 1, 2, 'concrete', 1, 0xb2ac9c);
  }
  hold(-54, -105, 12, 12);
  plaza.push({ x: -52, z: -95.5, w: 10, d: 2, color: 0x4f8a3c });   // the cathedral close
  // H16 the Morningside Park escarpment: a wooded schist cliff rising 8 m
  // west-to-east, the only large elevation change north of the park and the
  // reason Columbia and the cathedral look DOWN on Harlem.
  plaza.push({ x: -42, z: -124, w: 4.5, d: 22, color: 0x2f6a3a });
  rockMound(sim, {
    x: -42, z: -124, w: 4, d: 22, h: 7, inset: 1, crownW: 2, crownD: 20,
    color: 0x6b675e, crownColor: 0x5f7a4a,
  });
  plant({ x: -42, z: -122, w: 4, d: 18, step: 2.6 });
  // H17 St Nicholas Park: the second, smaller escarpment, in the two Harlem
  // bands that are not crossed by a street.
  for (const [rz, rd] of [[-136.5, 3], [-128, 3]]) {
    plaza.push({ x: -33, z: rz, w: 3, d: rd, color: 0x2f6a3a });
    rockMound(sim, { x: -33, z: rz, w: 3, d: rd, h: 4, crownW: 1, crownD: 1, color: 0x6b675e, crownColor: 0x5f7a4a });
    hold(-33, rz, 3, rd);
  }

  // ============ §4 FIFTH AVENUE, MUSEUM MILE AND THE UPPER EAST SIDE (N → S)
  // The east side's rule is the OPPOSITE of Central Park West: no towers, one
  // flat limestone wall, punctured by museums that step DOWN out of it or change
  // material. The skyline here is a straight line, not a rhythm — so the generic
  // run below gets a single height and no jitter, which is the whole tell.
  const FIFTH_X = 29, FIFTH_D = 4;                     // the wall band, x[29,33]
  hold(FIFTH_X, -101, FIFTH_D, 4);      // E1  the Africa Center
  hold(FIFTH_X, -77, FIFTH_D, 4);       // E2  El Museo del Barrio
  hold(FIFTH_X, -72.5, FIFTH_D, 4);     // E3  the Museum of the City of New York
  hold(FIFTH_X, -64, FIFTH_D, 12);      // E4  Mount Sinai Hospital
  hold(FIFTH_X, -31, FIFTH_D, 4);       // E6  the Jewish Museum
  hold(FIFTH_X, -23.5, FIFTH_D, 4);     // E7  Cooper Hewitt + its garden
  hold(FIFTH_X, -19, FIFTH_D, 3);       // E8  the Church of the Heavenly Rest
  hold(FIFTH_X, -16, FIFTH_D, 8);       // E9  the Guggenheim + its monitor block
  hold(FIFTH_X, -7, FIFTH_D, 2);        // E10 the National Academy
  hold(FIFTH_X, -4.5, FIFTH_D, 4);      // E11 the Neue Galerie
  hold(FIFTH_X, 54, FIFTH_D, 5);        // E14 the Frick Collection + garden
  hold(FIFTH_X, 73.5, FIFTH_D, 4);      // E15 Temple Emanu-El
  hold(FIFTH_X, 90.5, FIFTH_D, 5);      // E17 the Pierre
  hold(FIFTH_X, 95.5, FIFTH_D, 4.5);    // E18 the Sherry-Netherland
  hold(28, -110, 6, 7);                 // H5  Marcus Garvey Park
  // H15's public-housing superblocks sit ON the Madison/Park and Park/Lexington
  // bands, so they are reserved here, before those runs, not after.
  const EAST_HARLEM_TOWERS = [[38, -139], [50, -130], [38, -121], [52, -108]];
  for (const [tx, tz] of EAST_HARLEM_TOWERS) hold(tx - 1, tz - 1, 7, 6);

  // E5 / E13 / E16 the generic Fifth Avenue limestone wall. ONE height, no
  // jitter, no setback, one cornice line: dead flat for blocks at a time.
  claimAll(streetWall(sim, {
    x: FIFTH_X, z: -96, len: 188, depth: FIFTH_D, axis: 'z', front: -1, unit: 7, gap: 1,
    heights: [13], colors: UES_STONE, roofColors: UES_ROOF, cornice: UES_CORNICE,
    base: LIMESTONE, water: 0, escape: 0, seed: 11, skip: wallSkip,
  }));
  // E22 the Upper East Side fill. Madison is five-storey retail, Park Avenue a
  // solid brick canyon with a planted median, Lexington and Third mid-century
  // white-brick towers with fire escapes on the side streets.
  claimAll(streetWall(sim, {
    x: 39, z: -145, len: 256, depth: 3, axis: 'z', front: -1, unit: 7, gap: 2,
    heights: [8, 9, 10], jitter: 1, colors: [0xd6d2c6, 0xcac6ba, 0xdedacd],
    roofColors: UES_ROOF, cornice: UES_CORNICE, seed: 12, skip: wallSkip,
  }));
  claimAll(streetWall(sim, {
    x: 52, z: -145, len: 256, depth: 3, axis: 'z', front: -1, unit: 8, gap: 2,
    heights: [14, 15, 16], colors: [0xb8a894, 0xc0b09a, 0xae9e8a], roofColors: UES_ROOF,
    cornice: 0x998a76, base: LIMESTONE, seed: 13, skip: wallSkip,
  }));
  claimAll(streetWall(sim, {
    x: 61, z: -145, len: 256, depth: 3, axis: 'z', front: -1, unit: 7, gap: 2,
    heights: [6, 7, 8], jitter: 1, colors: [0xa8705a, 0x9a6450, 0xb07a62],
    roofColors: HARLEM_ROOF, cornice: HARLEM_CORNICE, escape: 1, seed: 14, skip: wallSkip,
  }));
  // The Park Avenue planted median, and the Metro-North viaduct standing in it
  // north of 110th. `cobbles` rather than `parks` because the district base is
  // a plaza rect and plaza paints over parks.
  cobbles.push({ x: 46, z: -100, w: 2, d: 213, color: 0x3f6b3a });
  cobbles.push({ x: 46, z: -145, w: 2, d: 45, color: 0x4a463e });
  // H14 the viaduct: dark rusted steel on riveted lattice bents, deck five
  // metres up, cars passing beneath. Only the DECK is over asphalt, and it is
  // the single entry in UPPER_MANHATTAN_ROAD_SPANS.
  metroViaduct(sim, {
    legXs: [46, 47], deckX0: 45, deckW: 4, z0: -144, z1: -102, legH: 4, bay: 2,
    steel: 0x5a4c42, deckColor: 0x6a625a, rail: 0x7a6a5a,
    // Exact overlap, NOT roadClash: the padded test would reject every bent,
    // because the median is 1.2 m from the two carriageways by design. The only
    // thing a bent must miss is a Harlem cross street running under the line.
    skip: (z) => roads.some((r) => 46 < r.x + r.w && 48 > r.x && z < r.z + r.d && z + 1 > r.z),
  });
  claim(45, -145, 4, 45);

  // E1 the Africa Center: pale stone and glass with a faceted glass corner
  // cutting into the block at street level. The only modern thing on the Mile.
  setbackTower(sim, {
    ox: FIFTH_X + 0.5, oz: -101, w: 3, d: 4, tiers: [{ h: 11 }], kind: 'curtain',
    wallMat: 'steel', wall: 0xd8dce2, roof: 0x8f959c,
  });
  // The angled glass screen cutting across the block at street level. It stands
  // one course OUTBOARD of the tower rather than stepping diagonally into it,
  // and every second mullion is steel — a lone glass column carries nothing to
  // the pane above it.
  for (let i = 0; i < 6; i++) {
    for (let y = 0; y < 2; y += 0.5) {
      B(29.5 + i * 0.5, y, -101.5, i % 2 ? 'glass' : 'steel', 0.5, i % 2 ? 0x9dbfd2 : 0xb8bec6);
    }
  }
  // E2 El Museo del Barrio: buff brick and limestone with a bright banner panel.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -77, w: FIFTH_D, d: 4, tiers: [{ h: 6 }], wall: 0xc4b48c,
    base: LIMESTONE, cornice: UES_CORNICE, corniceDir: -1, corniceAxis: 'z', roof: 0x6a6862,
  });
  for (let y = 2; y < 5; y += 0.5) B(28.5, y, -75.5, 'panel', 0.5, 0xc23b2e);
  for (let y = 2; y < 5; y += 0.5) B(28.5, y, -75, 'panel', 0.5, 0xf2c14e);
  // E3 the Museum of the City of New York: red brick with white marble trim,
  // a pedimented centre and a small white cupola — the one red front here.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -72.5, w: FIFTH_D, d: 4, tiers: [{ h: 7 }], wallMat: 'brick',
    wall: 0x9a4536, base: 0xe8e4d8, cornice: 0xd8d2c2, corniceDir: -1, corniceAxis: 'z',
    roof: 0x6a6862,
  });
  // the small white cupola, on the roof plate rather than inside the building:
  // gazebo() has no y0, so calling it here would have built the cupola at grade
  BOX(30.5, 8, -71, 3, 2, 3, 'concrete', 0.5, 0xe8e4d8);
  BOX(30.75, 9, -70.75, 2, 1, 2, 'panel', 0.5, 0xd8d2c2);
  // E4 Mount Sinai: the wall breaks completely — a grey-and-glass slab complex
  // in several stepped blocks with plant on the roof. Institutional and bulky.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -64, w: FIFTH_D, d: 7, tiers: [{ h: 12 }, { h: 6, insetZ: 1 }],
    kind: 'curtain', wallMat: 'steel', wall: 0x9aa2ab, roof: 0x70777e,
  });
  setbackTower(sim, {
    ox: FIFTH_X, oz: -55.5, w: FIFTH_D, d: 3.5, tiers: [{ h: 16 }], kind: 'curtain',
    wallMat: 'steel', wall: 0x9aa2ab, roof: 0x70777e,
  });
  // rooftop plant, on the parts of the lower roof the upper slab does NOT cover
  for (const [px, pz] of [[30, -64], [31, -58]]) BOX(px, 13, pz, 2, 1, 2, 'steel', 0.5, 0x5f666d);
  // E6 the Jewish Museum: a French Gothic chateau — steep slate roof, tall
  // dormers, an octagonal corner turret. Fussy and vertical against the wall.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -31, w: FIFTH_D, d: 4, tiers: [{ h: 7 }], wall: 0xcfcabe,
    base: LIMESTONE, cornice: UES_CORNICE, corniceDir: -1, corniceAxis: 'z', roof: 0x4a4f56,
  });
  // The octagonal corner turret is the mansard's own corner stack: a separate
  // shaft dropped in at the corner shares every cell of the roof course under it.
  mansardRoof(sim, {
    ox: FIFTH_X, oz: -31, w: FIFTH_D, d: 4, y: 8, courses: 4, color: 0x3f444b,
    dormer: { every: 1, faces: ['minX'], color: 0xd8d2c2 },
    chimney: [[0, 0], [0, 3.5], [3.5, 3.5]], chimneyH: 3, chimneyColor: 0xcfcabe,
  });
  // E7 Cooper Hewitt: a freestanding Georgian red-brick mansion with its OWN
  // GARDEN — a gap in the wall, which is the entire point of it.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -23.5, w: FIFTH_D, d: 2.5, tiers: [{ h: 6 }], wallMat: 'brick',
    wall: 0x8f4d3c, base: 0xd8d2c2, cornice: 0xd8d2c2, corniceDir: -1, corniceAxis: 'z',
    roof: 0x3e8a6a,
  });
  plaza.push({ x: FIFTH_X, z: -20.5, w: FIFTH_D, d: 1, color: 0x4f8a3c });
  fenceRun(sim, { x: 28.9, z: -20.5, len: 1, axis: 'z', h: 1, s: 0.25, postEvery: 0.5, color: 0x22262c });
  // E8 the Church of the Heavenly Rest: stripped Gothic, one deep vertical
  // window, angular buttresses and no spire at all.
  naveChurch(sim, {
    ox: FIFTH_X, oz: -19, w: FIFTH_D, d: 3, h: 9, axis: 'z', stone: 0xb8b4a8,
    roof: 0x5a5f66, roofRise: 1, buttress: 2, buttressH: 6,
    gable: { face: 'min', w: 1.5, h: 5, color: 0x2f4a6a, y0: 2 },
  });
  // E9 the Solomon R. Guggenheim: the inverted spiral, built exactly the way
  // §4 prescribes — stacked circular slabs each WIDER than the one below, so
  // the outer face is a cone opening upward. It looks like an upside-down layer
  // cake from every angle, which is the test.
  spiralRotunda(sim, {
    cx: 31, cz: -13.5, y0: 0, s: 0.5, slabs: 5, courses: 3, r0: 1.6, dr: 0.2,
    thick: 1, color: 0xe4dcc8, groove: 0xcdc4ae, cap: 0xd8d0ba, dome: 2,
  });
  setbackTower(sim, {                                   // the monitor block, north
    ox: FIFTH_X, oz: -10, w: 3, d: 2, tiers: [{ h: 6 }], wallMat: 'concrete',
    wall: 0xe4dcc8, roof: 0xd0c8b4,
  });
  // E10 the National Academy: a townhouse-scale grey block filling the gap.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -7, w: 3, d: 2, tiers: [{ h: 6 }], wall: 0xc0bcb0,
    base: LIMESTONE, cornice: UES_CORNICE, corniceDir: -1, corniceAxis: 'z', roof: 0x6a6862,
  });
  // E11 the Neue Galerie: a Beaux-Arts limestone townhouse, small and
  // jewel-like, with iron balconies and a mansard with two dormers.
  setbackTower(sim, {
    ox: FIFTH_X, oz: -4.5, w: FIFTH_D, d: 3, tiers: [{ h: 5 }], wall: 0xdcd8cc,
    base: LIMESTONE, cornice: UES_CORNICE, corniceDir: -1, corniceAxis: 'z', roof: 0x4a4f56,
  });
  mansardRoof(sim, {
    ox: FIFTH_X, oz: -4.5, w: FIFTH_D, d: 3, y: 6, courses: 3, color: 0x44474e,
    dormer: { every: 1, faces: ['minX'], color: 0xe0dcd0 },
  });
  for (let z = -4.25; z < -1.75; z += 0.5) B(28.5, 2, z, 'steel', 0.5, 0x2b3038);   // iron balcony
  // E14 the Frick Collection: deliberately LOW and horizontal — a two-storey
  // limestone mansion with a colonnaded loggia and a walled garden beside it.
  // The garden's reflecting pool is paving, not water: every water rect in this
  // scene is inside the park green, and a pool here would sit on the district's
  // own plaza base, which water paints straight over.
  setbackTower(sim, {          // no cornice: the loggia already owns x 28..29
    ox: FIFTH_X, oz: 54, w: FIFTH_D, d: 3.5, tiers: [{ h: 4 }], wall: 0xdcd8cc,
    base: LIMESTONE, roof: 0x4a4f56,
  });
  porticoFront(sim, {
    x: FIFTH_X, z: 54, len: 3, axis: 'z', dir: -1, depth: 1, colH: 3, colEvery: 1,
    color: 0xe8e4d8, entab: 0xd0ccc0, steps: 1, stepColor: 0xc8c4b8,
  });
  plaza.push({ x: FIFTH_X, z: 57.8, w: FIFTH_D, d: 1.2, color: 0x4f8a3c },
    { x: 30, z: 58.1, w: 2, d: 0.6, color: 0x8fb0c4 });
  balustrade(sim, { x: 28.6, z: 57.8, len: 1.2, axis: 'z', color: 0xd0ccc0, pierColor: 0xb8b4a8 });
  // E15 Temple Emanu-El: one vast limestone basilica with NO towers, whose whole
  // identity is a single enormous recessed round-arched window in the gable end.
  naveChurch(sim, {
    ox: FIFTH_X, oz: 73.5, w: FIFTH_D, d: 4, h: 9, axis: 'z', stone: 0xd0c8b4,
    roof: 0x8a7f6a, roofRise: 1,
    gable: { face: 'min', w: 2.5, h: 7, color: 0x3a4f6a, y0: 1.5 },
  });
  for (const bz of [73.5, 76.5]) BOX(FIFTH_X - 1, 0, bz, 1, 4, 1, 'concrete', 1, 0xc0b8a2);
  // E17 the Pierre and E18 the Sherry-Netherland: two slender pre-war hotel
  // towers whose spired copper caps bracket Grand Army Plaza. They are the only
  // two things on the east side that break the flat line upward.
  crownedTower(sim, {
    ox: FIFTH_X, oz: 90.5, w: FIFTH_D, d: 4, y0: 0, h: 24, wall: 0xd8d2c2,
    crown: 'pyramid', crownColor: 0x3e8a6a, crownAccent: 0xd8d2c2, roof: 0x6a6862,
  });
  crownedTower(sim, {
    ox: FIFTH_X, oz: 95.5, w: 3, d: 4, y0: 0, h: 22, wall: 0xd2cec2,
    crown: 'spire', crownColor: 0x4a5058, crownAccent: 0xd8d2c2, roof: 0x6a6862,
  });

  // ================================= §5 HARLEM AND NORTH OF THE PARK (z -145..-102)
  // Everything up here is LOWER, BROWNER and MORE GRANULAR than south of 110th,
  // and the north-south compression (1.6 m a real block, §0.3) makes the blocks
  // shallow rectangles — wide east-west, thin north-south. Leaning into that is
  // what makes it read as a dense grid rather than as an error.
  //
  // Five bands, from the map's north edge down to Central Park North:
  //   N1 z[-145,-142]     Striver's Row and Abyssinian Baptist
  //   N2 z[-136.5,-133.5] 135th-137th, Harlem Hospital on Lenox
  //   N3 z[-128,-125]     the 128th-130th brownstone rows
  //   N4 z[-119.5,-116.5] 125th Street's north frontage + the ACP tower
  //   N5 z[-110,-103.5]   125th's south frontage, the Apollo, Marcus Garvey Park
  const HAR_SHADE = [0x8a5545, 0x77463a, 0x9a6250, 0x6f4034];
  hold(-22, -145, 12, 3);      // H11 Striver's Row
  hold(-6, -145, 6, 3);        // H12 Abyssinian Baptist Church
  hold(11, -136.5, 11, 3);     // H10 Harlem Hospital Center
  hold(-16, -119.5, 5, 3);     // H9  Adam Clayton Powell Jr State Office Building
  hold(-18, -110, 6, 3);       // H8  the Apollo Theater
  hold(18, -128, 16, 3);       // H4  the Mount Morris Park historic district
  hold(18, -119.5, 16, 3);

  // H3 the brownstone rows and H7's commercial spine, band by band. Rows first
  // (they are the dominant Harlem texture and they reserve their own ground),
  // then the taller commercial fill parts around them.
  const harlemRow = (z, x, len, dir, floors = 1) => rowBlock(sim, {
    // No fire escapes on the ROWS: a one-floor brownstone tops out at 4 m,
    // which is exactly where brownstone() hangs its first landing, and the
    // landing and the cornice then want the same cells. Harlem's escapes live
    // on the taller tenement walls below, where setbackTower hangs them on slab
    // layers.
    x, z, len, axis: 'x', unit: 3, depth: 3, floors, dir,
    shades: HAR_SHADE, trim: HARLEM_CORNICE, stoopSteps: 3, escapeEvery: 0,
    roof: 0x54585e, seed: Math.round(z), skip: wallSkip,
  }).forEach((f) => claim(f.x, f.z, f.w, f.d));
  const harlemWall = (z, x, len, front, heights, seed) => claimAll(streetWall(sim, {
    x, z, len, depth: 3, axis: 'x', front, unit: 6, gap: 1, heights, jitter: 1,
    colors: HAR_SHADE, roofColors: HARLEM_ROOF, cornice: HARLEM_CORNICE,
    water: 3, escape: 2, seed, skip: wallSkip,
  }));
  harlemRow(-145, -33, 66, 1);                    // N1, fronting 138th St
  harlemWall(-136.5, -33, 66, -1, [5, 6, 7], 21); // N2, fronting 138th
  harlemRow(-128, -33, 66, 1);                    // N3, fronting 130th
  harlemWall(-119.5, -33, 66, 1, [5, 6], 22);     // N4, 125th's north frontage
  harlemWall(-110, -33, 66, -1, [5, 6, 7], 23);   // N5, 125th's south frontage
  // The back row starts at z -106, not -106.5: the wall in front of it hangs
  // its fire-escape landings a metre off its own back face, at z -107..-106.
  harlemRow(-106, -33, 66, 1, 1);                 // N5's back row, fronting 110th

  // H11 Striver's Row: three graded sub-rows of the finest row houses in Harlem
  // — red brick with limestone trim, buff brick with terracotta, dark
  // brownstone — all four storeys with a dead-flat unified roofline, deep front
  // gardens and mature street trees.
  // Three sub-rows, one per material band, each a whole-metre lot: unit 2.5 put
  // a three-metre house in a two-and-a-half-metre lot and every party wall
  // overlapped its neighbour.
  for (const [rx, shade, trim] of [[-22, [0x9a5a48], 0xd8d2c2], [-19, [0xc4a878], 0xa8703a], [-16, [0x6f4034], 0x54382c], [-13, [0x9a5a48], 0xd8d2c2]]) {
    rowBlock(sim, {
      x: rx, z: -145, len: 3, axis: 'x', unit: 3, depth: 3, floors: 1, dir: 1,
      shades: shade, trim, stoopSteps: 3, roof: 0x54585e, seed: 7,
    }).forEach((f) => claim(f.x, f.z, f.w, f.d));
  }
  plaza.push({ x: -22, z: -141.8, w: 12, d: 0.8, color: 0x4f7a3c });   // the front gardens
  // H12 Abyssinian Baptist: grey bluestone Gothic Revival, a gabled front and a
  // square battlemented corner tower.
  naveChurch(sim, {
    ox: -6, oz: -145, w: 4, d: 3, h: 6, axis: 'z', stone: 0x8f97a0, roof: 0x4a5058,
    roofRise: 1, gable: { face: 'max', w: 2, h: 4, color: 0x2f4a6a, y0: 1.5 },
  });
  tower(sim, -2, -145, 2, 2, 0, 8, 'masonry', 'concrete', 0x8f97a0);
  BOX(-2, 8, -145, 2, 1, 2, 'concrete', 1, 0x7f8790);
  crenellation(sim, { x: -2, y: 9, z: -145, w: 2, d: 2, color: 0x8f97a0 });
  // H10 Harlem Hospital Center: a long white slab with a full-height glass
  // curtain on its Lenox Avenue front — the Mural Pavilion — with the enlarged
  // colour murals printed on the glass, and older red-brick wings behind it.
  setbackTower(sim, {
    ox: 11, oz: -136.5, w: 7, d: 3, tiers: [{ h: 9 }], kind: 'curtain',
    wallMat: 'steel', wall: 0xe0e4e8, roof: 0x9aa2ab,
  });
  for (let i = 0; i < 6; i++) {                   // the printed murals, facing Lenox
    for (let y = 1; y < 4; y += 0.5) B(10.5, y, -136.5 + i * 0.5, 'panel', 0.5, [0xc23b2e, 0xf2c14e, 0x2a5f9a][i % 3]);
  }
  setbackTower(sim, {
    ox: 18, oz: -136.5, w: 4, d: 3, tiers: [{ h: 6 }], wallMat: 'brick', wall: 0x8f4d3c,
    cornice: HARLEM_CORNICE, corniceDir: -1, corniceAxis: 'x', roof: 0x54585e, water: true,
  });

  // H7 the 125th Street commercial spine: three to six storeys of continuous
  // retail behind big plate glass, painted wall signage, awnings in every
  // colour, blade signs and billboards. Busier and louder than any street south
  // of 110th, which is the whole tell.
  for (let i = 0; i < 12; i++) {
    const hx = -30 + i * 7;
    if (roadClash(hx, -119.5, 5, 3) || taken(hx, -119.5, 5, 3)) continue;
    // The glazing sits in the 0.5 m band at the wall face, BELOW the cornice —
    // the cornice already owns z -116.5..-116 at its own two courses.
    for (let y = 0; y < 2; y += 0.5) {
      for (let u = 0; u < 8; u++) B(hx + u * 0.5, y, -116.5, u % 3 === 0 ? 'steel' : 'glass', 0.5, u % 3 === 0 ? 0x4a4038 : 0x9dbfd2);
    }
    claim(hx, -116.6, 4, 0.7);        // so the kerb pass cannot land a bin in the glass
  }
  // Painted wall signage at awning height, again clear of the cornice line, with
  // the lettering mounted one cell proud of its own board.
  for (const [sx, sc, txt] of [[-30, 0xc23b2e, 'RECORDS'], [8, 0x2a5f9a, 'SOUL'], [26, 0x2e7a4a, 'MARKET']]) {
    if (roadClash(sx, -119.5, 4, 3) || taken(sx, -119.5, 4, 3)) continue;
    for (let u = 0; u < txt.length * 2; u++) {
      for (let y = 3; y < 4; y += 0.5) B(sx + u * 0.5, y, -116.5, 'panel', 0.5, sc);
    }
    signText(sim, txt, sx + 0.25, 3.25, -116, { axis: 'x', px: 0.25, scale: 1, color: 0xf2ede2, mat: 'panel' });
    claim(sx, -116.6, txt.length + 0.5, 0.9);
  }
  // H8 the Apollo Theater: red brick and cream terracotta, and the two things
  // nobody could mistake — a bulb-edged marquee over the sidewalk and the tall
  // red APOLLO blade climbing three metres above the roofline.
  setbackTower(sim, {
    ox: -18, oz: -110, w: 6, d: 3, tiers: [{ h: 5 }], wallMat: 'brick', wall: 0x9a4536,
    base: 0xe0d8c4, cornice: 0xd8cfae, corniceDir: -1, corniceAxis: 'x', roof: 0x54585e,
  });
  marqueeSign(sim, {
    x: -17, z: -110, w: 4, dir: -1, y: 3, depth: 1, board: 0x2b1f1a, bulbs: 0xf2e8c0,
    blade: 0xc23b2e, bladeX: -15.5, bladeW: 1.5, bladeH: 5, text: 'APOLLO',
    textColor: 0xf2ede2, textScale: 1,
  });
  claim(-18.2, -111.4, 6.4, 4.4);
  // H9 the Adam Clayton Powell Jr State Office Building: the only tall thing in
  // Harlem, and deliberately out of scale with everything around it — a blunt
  // bronze-glass and precast slab on a podium over an open brick plaza.
  setbackTower(sim, {
    ox: -16, oz: -119.5, w: 5, d: 3, tiers: [{ h: 17 }], kind: 'curtain',
    wallMat: 'steel', wall: 0x6a5a44, roof: 0x4a4032,
  });
  plaza.push({ x: -16, z: -122.5, w: 5, d: 2.5, color: 0x8a6a58 });
  // The Powell bronze: a 1.5 m base, because the strip between 130th's kerb and
  // the podium is exactly 1.5 m and the standard 2 m plinth ran into both.
  statue(sim, { x: -13.5, z: -120.5, h: 4, plinth: 1, w: 0.5, d: 0.5, stone: 0x9a9184, bronze: 0x2b342c });
  claim(-14, -121, 2, 2);
  // H5 Marcus Garvey Park: a rugged rock-outcrop park whose ground rises five
  // metres to a bare grey schist summit, trees round the edges only.
  plaza.push({ x: 28, z: -110, w: 6, d: 6.5, color: 0x3f7a3a });
  rockMound(sim, {
    x: 29, z: -109, w: 4, d: 4, h: 5, inset: 1, crownW: 2, crownD: 2,
    color: 0x6b675e, crownColor: 0x7b756a,
  });
  hold(28, -110, 6, 6.5);
  // H6 the Mount Morris Fire Watchtower, 1856, the last of its kind: an open
  // cast-iron skeleton of three tapering octagonal tiers with a bell hung under
  // the top platform, standing on bare rock five metres up so it reads at ten.
  latticeTower(sim, {
    cx: 31, cz: -107, y0: 5, tiers: [[2, 1.75], [1.5, 1.75], [1, 1.25]],
    color: 0x22262c, plate: 0x2f3440, bell: 0x8a6a3a,
  });
  grandStair(sim, { x: 27.5, z: -107, w: 1.5, steps: 3, dir: 1, axis: 'x', stone: 0x7d7768, cheek: 0x6f6a61 });
  plant({ x: 28, z: -110, w: 6, d: 1.5, step: 2 });
  plant({ x: 28, z: -105, w: 6, d: 1.5, step: 2 });
  // H4 the Mount Morris Park historic district: the best-preserved rows in
  // Harlem — grander than H3, five storeys, wider houses, and a church tower.
  for (const rz of [-128, -119.5]) {
    rowBlock(sim, {
      x: 18, z: rz, len: 12, axis: 'x', unit: 4, depth: 3, floors: 1, dir: rz === -128 ? 1 : -1,
      shades: [0x8a5545, 0x9a6250, 0x77463a], trim: 0xb08a5a, stoopSteps: 4,
      roof: 0x54585e, seed: 9, skip: wallSkip,
    }).forEach((f) => claim(f.x, f.z, f.w, f.d));
  }
  naveChurch(sim, {
    ox: 28, oz: -128, w: 3, d: 3, h: 6, axis: 'z', stone: 0x8f97a0, roof: 0x4a5058,
    roofRise: 1, towers: [{ dx: 3, dz: 0, w: 2, d: 2, h: 8, cap: 'battlement' }],
  });
  // H15 East Harlem: 4-6 storey brick tenements with fire escapes across the
  // full front and colourful storefronts, punctuated by cruciform red-brick
  // public-housing towers standing free in open green superblocks — the one
  // place the grid breaks.
  for (const [tx, tz] of EAST_HARLEM_TOWERS) {
    if (roadClash(tx, tz, 5, 4)) continue;
    plaza.push({ x: tx - 1, z: tz - 1, w: 7, d: 6, color: 0x4f7a3c });
    setbackTower(sim, {
      ox: tx, oz: tz, w: 5, d: 4, tiers: [{ h: 14 }], wallMat: 'brick', wall: 0x8f4d3c,
      roof: 0x54585e, water: true,
    });
  }

  // ======================= COLUMBUS CIRCLE, GRAND ARMY PLAZA AND 59TH STREET
  // W20 Columbus Circle, built the way Pass 1 built the two 110th St circles:
  // a RING of four road rects around a granite island, never one solid rect —
  // the island is a plaza surface, plaza draws under roads, and the column
  // standing on it would otherwise be a block inside a roadway.
  roads.push(
    { x: -32, z: 99.5, w: 9, d: 2 }, { x: -32, z: 106.5, w: 9, d: 2 },
    { x: -32, z: 101.5, w: 2, d: 5 }, { x: -25, z: 101.5, w: 2, d: 5 },
  );
  plaza.push({ x: -30, z: 101.5, w: 5, d: 5, color: 0x8a8578 });
  // W21 the Columbus Column: a single tall grey granite shaft with bronze
  // ship-prow rostra, a white marble figure on top. Thin and very vertical —
  // the pivot of the whole south-west corner.
  obelisk(sim, {
    x: -28, z: 104, h: 7, s: 0.5, baseW: 2, baseH: 1.5, shaftW: 1, taper: 0,
    stone: 0x8f8b82, capColor: 0xe8e4d8, plinth: 0x9a9690,
  });
  // The bronze ship-prow rostra, hung against the shaft (which obelisk() puts
  // at x -27.5..-26.5): half a metre further out and they are four floating
  // bronze cubes.
  for (const [rx, rz] of [[-28, 104.5], [-26.5, 104.5], [-28, 105], [-26.5, 105]]) {
    B(rx, 4, rz, 'panel', 0.5, 0x7d6a3f);
  }
  claim(-28.5, 103.5, 2.5, 2.5);
  for (const [bx, bz] of [[-29.5, 102], [-26, 102], [-29.5, 105.5], [-26, 105.5]]) {
    if (clear(bx, bz)) { bench(sim, bx, bz); claim(bx - 0.4, bz - 0.3, 1.8, 1.2); }
  }
  // #67 / #68 Grand Army Plaza. Pass 2 could build the Sherman Monument and
  // nothing else here: the plaza's granite and the Pulitzer Fountain both fell
  // wholly inside Fifth Avenue's roadway rect. Pass 3 bends the avenue east
  // around them (street 11, x 24.5..27.5) and Central Park South stops at
  // x 21.5, so the strip between the park wall and the new kerb is plaza.
  plaza.push({ x: 21.5, z: 92, w: 3, d: 21, color: 0x9a908a });
  tieredFountain(sim, {
    cx: 23, cz: 102.5, r: 1.5, tiers: 3, tierDrop: 0.5, figureH: 1.5,
    stone: 0xd8d0ba, rim: 0xc0b8a2, bronze: 0x4a5f46, jet: 0xd8e4e8,
  });
  claim(21.8, 101.3, 2.4, 2.4);
  for (const pz of [94, 99, 106, 110]) {                // the ring of pollarded trees
    if (clearTree(22.5, pz)) tree(sim, 22.5, pz);
  }
  // E20 the Plaza Hotel: a French Renaissance chateau facing Grand Army Plaza,
  // white glazed brick over a rusticated base and — the signature — a steep
  // green copper mansard loaded with dormers and chimneys, a full quarter of
  // the building's height.
  setbackTower(sim, {
    ox: 16, oz: 105.5, w: 6, d: 4, tiers: [{ h: 15 }], wall: 0xe4e0d4,
    base: LIMESTONE, cornice: 0xc8c0aa, corniceDir: -1, corniceAxis: 'x', roof: 0x2f6a52,
  });
  mansardRoof(sim, {
    ox: 16, oz: 105.5, w: 6, d: 4, y: 16, courses: 5, color: 0x2f6a52,
    dormer: { every: 1, faces: ['minZ'], color: 0xe8e4d8 },
    chimney: [[0, 0], [5.5, 0], [0, 3.5], [5.5, 3.5], [2.5, 0]], chimneyH: 3,
  });
  hold(16, 105.5, 6, 4);
  // E21 the Central Park South hotel wall: a continuous run of tall pre-war
  // hotels and apartment blocks, uniform cornice, a few slim towers above it.
  // This is the wall Sheep Meadow frames.
  claimAll(streetWall(sim, {
    x: -21, z: 105.5, len: 36, depth: 4, axis: 'x', front: -1, unit: 6, gap: 1,
    heights: [16, 18, 20, 17], jitter: 2, colors: [0xc4b48c, 0xd0c8b6, 0xbfa87e, 0xcfc7b2],
    roofColors: UES_ROOF, cornice: UWS_CORNICE, base: LIMESTONE, setback: 4,
    water: 3, seed: 31, skip: wallSkip,
  }));

  // ============================================ PASS 3 · STREET LIFE ON THE KERB
  // Curb furniture cannot go through `clear()`. That gate rejects anything
  // within 0.8 m of a claimed mass, and a New York sidewalk is 1.5 m of kerb
  // with a building wall on the far side of it — every hydrant in the level
  // would be filtered out. So the kerb gets its own gate: a FOOTPRINT test that
  // asks only the two questions that matter here, is any of it in the asphalt
  // and is any of it inside a building.
  const overlapsAny = (lists, pad, x, z, w, d) => lists.some((l) => l.some((r) =>
    x - pad < r.x + r.w && x + w + pad > r.x && z - pad < r.z + r.d && z + d + pad > r.z));
  const curbFree = (x, z, w, d) => !overlapsAny([roads], 0.1, x, z, w, d)
    && !overlapsAny([built], 0, x, z, w, d) && !overlapsAny([water], 0.5, x, z, w, d);

  // Walk every street's two kerbs and drop furniture at a fixed pitch, offset
  // half a metre outboard of the asphalt so a one-metre prop lands inside the
  // one-and-a-half-metre sidewalk with a quarter-metre to spare on each side.
  let curbIdx = 0;
  const curbProp = (px, pz, kind) => {
    const put = (w, d, fn) => {
      if (!curbFree(px, pz, w, d)) return;
      fn();
      claim(px - 0.1, pz - 0.1, w + 0.2, d + 0.2);
    };
    switch (kind) {
      case 0: put(1, 0.6, () => hydrant(sim, px + 0.25, pz)); break;
      case 1: put(1, 0.9, () => trashBin(sim, px + 0.15, pz + 0.15)); break;
      case 2: put(0.6, 0.6, () => mailbox(sim, px, pz)); break;
      case 3: put(0.4, 0.8, () => trafficLight(sim, px, pz)); break;
      case 4: put(1.3, 1.3, () => newsstand(sim, px + 0.25, pz + 0.25)); break;
      case 5: put(0.6, 0.6, () => lampPost(sim, px + 0.3, pz + 0.3)); break;
      case 6: put(0.4, 0.4, () => bollard(sim, px, pz)); break;
      case 7: put(1, 0.6, () => sandwichBoard(sim, px, pz)); break;
      case 8: put(1.4, 1.1, () => hotDogCart(sim, px, pz + 0.25)); break;
      // Two hoops, not three: a three-hoop rack is two metres long and every
      // one of them ran off the end of the sidewalk into the crossing.
      default: put(1.2, 0.9, () => bikeRack(sim, px + 0.1, pz + 0.1, 2, 'x')); break;
    }
  };
  for (const st of UPPER_MANHATTAN_STREETS) {
    const along = st.axis === 'x' ? st.w : st.d;
    const pitch = 5;
    for (let u = 2; u < along - 2; u += pitch) {
      const i = curbIdx++;
      const side = i % 2 ? 1 : -1;
      if (st.axis === 'x') {
        const pz = side < 0 ? st.z - 1.25 : st.z + st.d + 0.25;
        curbProp(st.x + u, pz, i % 10);
      } else {
        const px = side < 0 ? st.x - 1.25 : st.x + st.w + 0.25;
        curbProp(px, st.z + u, i % 10);
      }
    }
  }
  // Subway entrances need two and a half metres square, which no kerb has: they
  // go on the plazas and the widened corners, by hand.
  for (const [sx, sz] of [[-30.5, 96], [24.5, -96], [-29.5, 105], [21.8, 108], [-14, -104], [7, -104]]) {
    if (!curbFree(sx - 0.5, sz - 1, 2.75, 2.5)) continue;
    subwayEntrance(sim, sx, sz);
    claim(sx - 0.6, sz - 1.1, 3, 2.7);
  }
  // Sidewalk sheds — the most New York object there is — outside four buildings
  // that are visibly mid-renovation.
  for (const [sx, sz, len, ax] of [[-28.4, 40, 6, 'z'], [28.6, -40, 6, 'z'], [-20, -113.5, 6, 'x'], [12, -111, 6, 'x']]) {
    const w = ax === 'x' ? len : 1.5, d = ax === 'x' ? 1.5 : len;
    if (!curbFree(sx, sz, w, d)) continue;
    scaffoldShed(sim, { x: sx, z: sz, len, axis: ax, w: 1.5, h: 2.5, fascia: 0x2f6b4a });
    claim(sx - 0.1, sz - 0.1, w + 0.2, d + 0.2);
  }
  // Street trees. Not through plant(): the deferred grove skips anything within
  // 0.9 m of a sidewalk rect, and outside the park EVERY square metre is one.
  // A canopy is 1.5 m across and is not centred on its trunk, so the test that
  // matters is the CANOPY rect against the asphalt and against the walls.
  let treeIdx = 0;
  for (let tx = -60; tx <= 62; tx += 3) {
    for (let tz = -143; tz <= 111; tz += 3) {
      if (tx > -23 && tx < 23 && tz > -97 && tz < 101) continue;         // the park plants itself
      const cx2 = tx + TREE_FOOTPRINT.dx, cz2 = tz + TREE_FOOTPRINT.dz;
      if (!curbFree(cx2, cz2, TREE_FOOTPRINT.w, TREE_FOOTPRINT.d)) continue;
      if (!overlapsAny([plaza, sidewalks], 0, cx2, cz2, TREE_FOOTPRINT.w, TREE_FOOTPRINT.d)) continue;
      // Dense and mature on the Upper West Side's side streets, formal and
      // sparse on Fifth and Park, sparse on 125th and thick on Striver's Row.
      const density = tx < -28 ? 2 : (tz < -100 ? 3 : 4);
      if (treeIdx++ % density) continue;
      tree(sim, tx, tz);
      claim(cx2, cz2, TREE_FOOTPRINT.w, TREE_FOOTPRINT.d);
    }
  }

  // ======================================= PASS 2 · PARK DENSITY (a PACING fix)
  // This is not dressing. The SIZE ladder is `SIZE_MASS × round(totalMass/4200)`
  // and Pass 3's perimeter will drive that multiplier to its ×10 ceiling, so
  // every size level is about to cost several times what it costs today. A hole
  // crossing open lawn eats nothing and stalls; the audit measured the old route
  // eating 79 things instead of 360 under that pacing.
  //
  // The fix is objects, and specifically ISOLATED ones. Per the note on
  // crateStack in the kit: a continuous field of 1 m paving is nearly inedible
  // at SIZE 1 because its neighbours hold it up, while a small isolated prop
  // drops the moment the removal disc reaches it. Real Central Park is dense
  // with exactly that — benches, lamps, bins, fountains, boulders — so building
  // it honestly and fixing the pacing are the same job.

  // Walk a polyline at a fixed pitch and hand back the point plus the left
  // normal, so furniture lands BESIDE the path rather than on it. Sampling at
  // segment midpoints keeps it deterministic and keeps two segments from both
  // claiming their shared vertex.
  const alongPath = (points, spacing, fn) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const nx = (x1 - x0) / len, nz = (z1 - z0) / len;
      const n = Math.max(1, Math.floor(len / spacing));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) * (len / n);
        fn(x0 + nx * t, z0 + nz * t, -nz, nx);
      }
    }
  };
  const snap = (v) => Math.round(v * 4) / 4;
  let furnIdx = 0;
  const furnish = (points, spacing, off) => alongPath(points, spacing, (px, pz, ox, oz) => {
    const i = furnIdx++;
    const side = i % 2 ? 1 : -1;
    const fx = snap(px + ox * off * side), fz = snap(pz + oz * off * side);
    if (!clearFurn(fx, fz)) return;
    switch (i % 6) {
      case 0: case 3: bench(sim, fx, fz); claim(fx - 0.4, fz - 0.35, 1.8, 1.3); break;
      case 1: lampPost(sim, fx, fz); claim(fx - 0.3, fz - 0.3, 0.9, 0.9); break;
      case 2: trashBin(sim, fx, fz); claim(fx - 0.3, fz - 0.3, 1.2, 1.2); break;
      case 4: drinkingFountain(sim, fx, fz); claim(fx - 0.3, fz - 0.3, 1, 1); break;
      default: signPost(sim, fx, fz, 0x2f4a3a, 1.5, 'x', 0.75); claim(fx - 0.3, fz - 0.3, 1.4, 0.8);
    }
  });
  for (const line of PATHS) furnish(line, 3.2, 1.05);
  furnish(DRIVE, 5, 2.2);
  furnish([[-18.5, 51], [-12, 52.5], [-5, 54], [0, 54], [7, 53.5], [12.5, 50]], 4.5, 2.2);

  // Kiosks, carts and stacked crates at the four places a park actually sells
  // things: Bethesda, the head of the Mall, the Naumburg plaza and the Zoo.
  for (const [kx, kz, kc] of [[-8.5, 55.5, 0x2e4d3a], [-7.5, 62, 0xc23b2e], [6, 60.5, 0x2a5f9a], [11, 79, 0x7a5a3a]]) {
    if (!clearFurn(kx, kz)) continue;
    marketStall(sim, kx, kz, kc, 2, 1.5);
    claim(kx - 0.3, kz - 0.3, 2.6, 2.1);
  }
  for (const [cx2, cz2] of [[-9, 57], [5.5, 62.5], [12, 81], [-2.5, 84]]) {
    if (!clearFurn(cx2, cz2)) continue;
    crateStack(sim, cx2, cz2, 2);
    claim(cx2 - 0.3, cz2 - 0.3, 1.6, 1.6);
  }
  for (const [nx2, nz2] of [[-6.5, 58.5], [1.5, 57], [-17.5, 50.5], [10.5, 71]]) {
    if (!clearFurn(nx2, nz2)) continue;
    newsBox(sim, nx2, nz2, 0x2f6b4a);
    claim(nx2 - 0.3, nz2 - 0.3, 1.1, 0.9);
  }
  for (const [hx, hz] of [[-11, 55.5], [2.5, 56.5], [-12.5, 79], [14, 90]]) {
    if (!clearFurn(hx, hz)) continue;
    hotDogCart(sim, hx, hz);
    claim(hx - 0.3, hz - 0.4, 1.7, 1.3);
  }

  // Low ornamental iron edging where a lawn or a garden meets a walk.
  fenceRun(sim, { x: 14, z: -78.8, len: 6, axis: 'x', h: 0.75, s: 0.25, postEvery: 1.5, color: 0x22262c });
  claim(14, -79, 6, 0.6);
  fenceRun(sim, { x: 15.5, z: 86.2, len: 3.5, axis: 'x', h: 0.75, s: 0.25, postEvery: 1.5, color: 0x22262c });
  claim(15.5, 86, 3.5, 0.6);
  // The Pinetum's north edging stops at x -5.5: the 86th transverse's asphalt
  // crests to z -2.1 by mid-park, and this run has to stay north of it.
  fenceRun(sim, { x: -13.5, z: -2, len: 8, axis: 'x', h: 0.75, s: 0.25, postEvery: 1.5, color: 0x2f4a35 });
  claim(-13.5, -2.2, 8, 0.6);

  // Glacial erratics: isolated schist boulders left on the lawns and among the
  // conifers. They matter more than they look. The loose 0.25 m clutter above
  // is what a SIZE 1 hole can BITE, but a 0.25 m panel brick is 0.016 mass and
  // SIZE 2 costs 25 — a whole heap of refuse is a fifth of one mass unit, so an
  // opening built only of clutter takes most of a minute to grow. A boulder is
  // a single ISOLATED 1 m concrete block: 2.0 mass in one bite, and unlike the
  // Reservoir's rim or a paving field it has no neighbour inside concrete's 3 m
  // span to keep carrying it once its own anchor goes.
  const ERRATICS = [
    [-13, 2, 1], [-10, 3.5, 1], [-7, 1.5, 0.5], [-4, 3, 1], [-1, 1.5, 1],
    [2, 3, 0.5], [5, 1.5, 1], [8, 3.5, 1], [-13.5, -1, 1], [-10, -2, 0.5],
    [-6, -1, 1], [-2, -2, 1], [2, -1, 0.5], [6, -2, 1], [-12, 21, 1],
    [-9, 24, 1], [7, 24, 1], [9, 21, 0.5], [-16, -6, 1], [-13, -8, 1],
    [12, -6, 1], [15, -8, 1], [-12, 34, 1], [9, 33, 1], [-19, 26, 1],
    // PASS 2 doubled the field. Two thirds of the additions are inside 25 m of
    // spawn on purpose: a 1 m isolated schist block is 2.0 mass in ONE bite
    // against 0.016 for a panel brick, and it is the only thing on open lawn a
    // SIZE 1 hole can take. The rest ring the new south-park structures so the
    // ground around them is not a dead crossing.
    [-11.5, 6, 1], [-8, 5.5, 0.5], [-5, 6.5, 1], [4, 6, 1], [7, 5.5, 0.5],
    [-12, 12, 1], [10, 8, 1], [-4, 21.5, 0.5], [1.5, 24, 1], [5, 26.5, 1],
    [-13, 26, 1], [-16, 20, 1], [-11, 30, 0.5], [-6, 43, 1], [6, 32, 1],
    [-10, 57, 1], [7, 48, 1], [-14, 56, 1], [15, 48, 1], [-2, 63, 0.5],
    [-8, 74, 1], [3, 71, 1], [-13, 76, 1], [9, 65, 1], [-2, 88, 1],
    [-8, 92, 1], [8, 82, 1], [-16, 94, 1], [17, 72, 1], [-19, 62, 1],
  ];
  for (const [ex, ez, es] of ERRATICS) {
    // clearFurn, not clear: a boulder is a whole metre wide and clear()'s road
    // pad is a 0.4 m POINT test, so two of the new erratics landed with a
    // corner in a transverse.
    if (!clearFurn(ex, ez)) continue;
    B(ex, 0, ez, 'concrete', es, 0x6b675e);
    if (es === 1) B(ex + 0.25, 1, ez + 0.25, 'concrete', 0.5, 0x7b756a);   // the split cap
    claim(ex - 0.4, ez - 0.4, es + 0.8, es + 0.8);
  }

  plant({ x: -14, z: 4, w: 3, d: 12, step: 2.5 });
  plant({ x: 7, z: 4, w: 3, d: 12, step: 2.5 });
  // The Pinetum: a dense stand of dark conifers, a distinctly different green
  // from every lawn around it, on bare needle-brown ground.
  plant({ x: -15, z: -2.4, w: 12, d: 3, step: 2.5 });

  // ============================================= S — the outcrops Pass 2 builds against
  // Umpire Rock: a massive glacially-polished crag, striated and treeless. It
  // is a GROUND feature, so it lands with the surfaces rather than with the
  // Heckscher structures Pass 2 will set beside it.
  rockMound(sim, { x: -21, z: 84, w: 2, d: 4, h: 4, color: 0x6f6a61, crownColor: 0x7d7768, crownW: 2, crownD: 2 });
  claim(-21, 84, 2, 4);

  // ========================================================== LOOP-DRIVE FURNITURE
  // A green twin-globe lamp at every drive waypoint and a bench at every third,
  // set INWARD off the kerb: the drive is 2.4 m wide and these sit 1.4 m clear
  // of it, which is also what keeps them out of the transverses they cross.
  const inward = (x, z, dist) => {
    const dx = 0 - x, dz = 2 - z, len = Math.hypot(dx, dz) || 1;
    return [Math.round((x + (dx / len) * dist) * 4) / 4, Math.round((z + (dz / len) * dist) * 4) / 4];
  };
  DRIVE.forEach(([wx, wz], i) => {
    const [lx, lz] = inward(wx, wz, 2.6);
    if (clear(lx, lz)) { lampPost(sim, lx, lz); claim(lx - 0.5, lz - 0.5, 1, 1); }
    if (i % 3 !== 0) return;
    const [bx, bz] = inward(wx, wz, 4.2);
    if (clear(bx, bz)) { bench(sim, bx, bz); claim(bx - 0.5, bz - 0.5, 2, 1.5); }
  });
  for (const [tx, tz] of [[-16, -30], [17, -20], [12, 30], [-16, 66], [10, 84], [-14, -90]]) {
    if (clear(tx, tz)) { trashBin(sim, tx, tz); claim(tx - 0.4, tz - 0.4, 1.3, 1.3); }
  }

  // ================================================================== PLANTING
  // Every grove in the file, scattered now that `built` holds every mass.
  //
  // The perimeter lines go in last: a continuous tree line just inside the park
  // wall is the park's outline from every street around it, and the scatter's
  // skip predicate quietly opens it wherever the drive swings out to hug the
  // wall — which is exactly where the real park has no trees either.
  plant({ x: -20, z: -94, w: 3, d: 190, step: 3 });
  plant({ x: 17, z: -94, w: 3, d: 190, step: 3 });
  plant({ x: -8, z: 26, w: 12, d: 16, step: 2.5 });     // the Ramble's disorienting woodland
  plant({ x: -21, z: 44, w: 4, d: 7, step: 2.5 });      // Strawberry Fields
  plant({ x: -8, z: 46, w: 5, d: 4, step: 2.5 });       // Cherry Hill
  plant({ x: -20, z: 36, w: 4, d: 8, step: 2.5 });      // the Lake's west shore
  plant({ x: -18, z: 59, w: 14, d: 3, step: 3 });       // Sheep Meadow's tree line, north
  plant({ x: -18, z: 73, w: 14, d: 3, step: 3 });       // Sheep Meadow's tree line, south
  plant({ x: 13, z: 77.5, w: 7, d: 8, step: 3 });       // the Zoo grounds
  plant({ x: -20, z: 78, w: 11, d: 3, step: 3 });       // Heckscher, north
  plant({ x: -20, z: 92, w: 11, d: 3, step: 3 });       // Heckscher, south
  plant({ x: 7, z: 90, w: 3, d: 6, step: 2.5 });        // Hallett Nature Sanctuary
  // PASS 2 planting. Groves overlap earlier ones on purpose: the deferred
  // scatter thins each one where a canopy is already taken, so a second pass at
  // a tighter step FILLS a wood instead of colliding with it. Real park density
  // is the pacing fix, and a tree is 22 blocks the hole can take at SIZE 2.
  plant({ x: -7.2, z: 27.2, w: 11, d: 14, step: 1.9 });   // the Ramble, third pass
  plant({ x: -14, z: 0.5, w: 23, d: 2, step: 2.2 });      // the Great Lawn's north tree line
  plant({ x: -13.5, z: 4, w: 2.5, d: 12, step: 2.2 });    // and its west flank
  plant({ x: 7.5, z: 4, w: 2.5, d: 12, step: 2.2 });      // and its east flank
  plant({ x: -8.5, z: 58, w: 2.5, d: 15, step: 2.4 });    // the Mall's outer walks
  plant({ x: 2, z: 66, w: 2.5, d: 8, step: 2.4 });
  plant({ x: -13, z: 54, w: 6, d: 4, step: 2.4 });        // Bethesda's western wood
  plant({ x: 12, z: 33, w: 8, d: 3, step: 2.4 });         // Conservatory Water's tree ring
  plant({ x: 12, z: 46, w: 8, d: 3, step: 2.4 });
  plant({ x: -21, z: 44, w: 4, d: 7, step: 2 });          // Strawberry Fields, thickened
  plant({ x: -9, z: 83, w: 8, d: 8, step: 2.4 });         // the south park's mid wood
  plant({ x: 4, z: 92, w: 6, d: 5, step: 2.4 });          // the Pond's north shore
  plant({ x: -20, z: 66, w: 3, d: 6, step: 2.4 });        // Tavern on the Green's grove
  plant({ x: -14, z: 20, w: 3, d: 5, step: 2.2 });        // below the Delacorte
  plant({ x: -6, z: 30, w: 5, d: 10, step: 2.2 });        // the Ramble's east half
  // Groves are laid down in list order and each tree records its own canopy
  // rect, so a later grove overlapping an earlier one simply thins out where it
  // does. Point-in-rect is not enough here: a canopy spans 1.5 m and is not
  // centred on its trunk, so two trunks 1 m apart both pass a point test and
  // then share fine cells.
  const planted = [];
  const treeClash = (x, z) => planted.some((p) =>
    x + TREE_FOOTPRINT.dx < p.x + p.w && x + TREE_FOOTPRINT.dx + TREE_FOOTPRINT.w > p.x
    && z + TREE_FOOTPRINT.dz < p.z + p.d && z + TREE_FOOTPRINT.dz + TREE_FOOTPRINT.d > p.z);
  for (const g of groves) {
    treeGrove(sim, {
      ...g,
      skip: (x, z) => noPlant(x, z) || treeClash(x, z),
      note: (tx, tz) => planted.push({
        x: tx + TREE_FOOTPRINT.dx, z: tz + TREE_FOOTPRINT.dz, w: TREE_FOOTPRINT.w, d: TREE_FOOTPRINT.d,
      }),
    });
  }

  // ================================================================== VEHICLES
  for (const v of UPPER_MANHATTAN_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.color, v.roof ?? v.color, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.color, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.color, v.color2, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.color, v.ladder ?? false);
    else motorcycle(sim, v.x, v.z);
  }

  // ============================================================ DECOR + AMBIENT
  // Key order MUST equal DECOR_LAYERS in js/voxelworld.js — the file then reads
  // in draw order, and a surface that is meant to paint over another one is
  // visibly above it in this literal too.
  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };

  // Render-only ambient life. Never physical, never eatable — VoxelWorld3D owns
  // all of it and the physics grid never sees a single one.
  sim.sceneAmbient = {
    gulls: [
      { x: 0, z: -26, r: 16, y: 14, count: 8, speed: 0.3 },      // over the Reservoir
      { x: 15, z: -86, r: 8, y: 10, count: 5, speed: 0.4 },      // over the Meer
    ],
    pigeons: [
      { x: 0, z: 16, count: 14 },      // the spawn lawn
      { x: 17, z: -76, count: 9 },     // the Conservatory Garden
      { x: 26.5, z: -98, count: 8 },   // Duke Ellington Circle
      { x: -26.5, z: -98, count: 8 },  // Frederick Douglass Circle
      { x: -2, z: -60, count: 10 },    // the North Meadow
      // PASS 3: the plazas the city puts people on.
      { x: 22.8, z: 103, count: 14 },  // Grand Army Plaza, round the fountain
      { x: -27.5, z: 104, count: 12 }, // Columbus Circle's island
      { x: -45, z: 82, count: 10 },    // Lincoln Center's plaza
      { x: 22.5, z: 10, count: 12 },   // the Met's steps
      { x: -47.5, z: -111, count: 9 }, // Columbia's quad
      { x: 30, z: -106, count: 8 },    // Marcus Garvey Park
      { x: -14, z: -113, count: 10 },  // 125th St outside the Apollo
    ],
    steam: [
      { x: -25, z: -40, rate: 0.3 }, { x: 25, z: 20, rate: 0.26 },
      // PASS 3: manhole steam down the middle of every avenue. The vents sit on
      // the asphalt, which is exactly where the renderer wants them.
      { x: -25.2, z: 12, rate: 0.32 }, { x: -25.2, z: -62, rate: 0.24 },
      { x: 25.2, z: -30, rate: 0.3 }, { x: 25.2, z: 70, rate: 0.22 },
      { x: -35.8, z: -36, rate: 0.28 }, { x: -35.8, z: 62, rate: 0.2 },
      { x: -45.8, z: 8, rate: 0.26 }, { x: -55, z: -84, rate: 0.24 },
      { x: 36, z: 34, rate: 0.3 }, { x: 44.5, z: -22, rate: 0.26 },
      { x: 58, z: 6, rate: 0.22 }, { x: -8.5, z: -128, rate: 0.3 },
      { x: 8.5, z: -108, rate: 0.24 }, { x: -20, z: -113, rate: 0.34 },
    ],
    // Neon only where a marquee justifies it: 125th Street is the one place in
    // this level that is louder after dark than before it.
    neon: [
      { x: -16, z: -111, w: 4, d: 1, color: 0xff2e63, period: 1.2 },   // the Apollo marquee
      { x: -15.5, z: -111, w: 1.5, d: 1, color: 0xff4b3a, period: 2.6 }, // its blade
      { x: -30, z: -116.5, w: 4, d: 1, color: 0xff4b3a, period: 3.1 },
      { x: 8, z: -116.5, w: 4, d: 1, color: 0x4ad9ff, period: 2.2 },
      { x: 26, z: -116.5, w: 6, d: 1, color: 0xffd166, period: 4.1 },
    ],
  };

  // Camera blockers, generated from the finished geometry. The old scene carried
  // thirteen hand-written literals; that survived only because it was small, and
  // the one comment in it already documented a near-miss where a turret cap
  // overhung its core and the rect had to be widened by hand.
  sim.cameraBlockers = generateBlockers(sim);

  // ==================================================================== SEAMS
  // PASSES 1-3 ARE DONE. Everything in geography-plan §1 through §6 is built
  // except the items below, each for a physical reason. Pass 2's three:
  // the Shakespeare Garden's pergola (the band between the Swedish Cottage and
  // the 79th's trench is 3 m and the walls and planting fill it); the Bethesda
  // arcade's three-bays-per-face articulation (a corbelled opening cannot be
  // subdivided without a pier standing in the passage); and Hernshead's rock
  // ledge. The Pulitzer Fountain and Grand Army Plaza, deferred by Pass 2
  // because their bboxes were Fifth Avenue's roadway, ARE built — the avenue
  // now bends east around them.
  //
  // Pass 3's own five, all logged in the Pass 3 handoff:
  //   - the Frick's reflecting pool is PAVING, not water. Every water rect in
  //     this scene sits inside the park green; a pool on Fifth Avenue would sit
  //     on the Upper East Side's plaza base, and water paints straight over
  //     plaza. Cutting a 2 m hole in a 38 x 260 m base rect to hold it is four
  //     rects and a permanent trap for the next person who moves it.
  //   - the Hudson shoreline (plan §0.5, water beyond x < -58) is not built for
  //     the same reason plus one more: the boundsRect probe allows 12 m of
  //     blank ground on a side, and a river needs far more than that.
  //   - West End Ave and Riverside Drive are folded into Broadway's west
  //     frontage, and Second/Third Ave into Lexington's east frontage. Six
  //     avenues a side does not fit between the park and a boundsRect that has
  //     to hug the content.
  //   - the Met's two plaza fountains and Lincoln Center's red-and-gold opera
  //     interior are not modelled; the Met's whole frontage is its own step
  //     flight, and the opera's interior is behind a solid travertine screen.
  //   - Striver's Row's rear service alleys and their "Walk Your Horses" gates:
  //     the band is 3 m deep, which is one house and its stoop.
  //
  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>> PASS 4 SEAM <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  // PASS 4 ships it. Pass 3 already ported ONE of Brooklyn's probes because the
  // scene now needs it: the roadway check in validate.mjs is the strict form,
  // all blocks against the exported vehicle list and UPPER_MANHATTAN_ROAD_SPANS,
  // rather than the old foliage-or-tall filter that waved a bollard through.
  // Still to port, all verified green against this state by scratchpad/
  // check-um.mjs: bare ground at ANY height, water-over-surface, union-aware
  // rimmed water, crossing-vs-declared-street, decor key order, boundsRect
  // slack (currently W 4.0 / E 4.0 / N 4.0 / S 3.0 m), and the dead-ground
  // census (1 point).
  //
  // Nothing added here may take a cell from the park or from a roadway. The
  // gates, in increasing strictness: `clear()` for a point beside a path,
  // `clearFurn()` for anything wider than a point, `clearTree()` for a canopy,
  // `curbFree()` for a footprint on the kerb, `roadClash()` + `taken()` for a
  // whole building, and `plant()` for everything deferred to the grove pass.
}
