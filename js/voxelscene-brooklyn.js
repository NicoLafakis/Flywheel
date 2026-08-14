// Brooklyn — the fourth voxel sandbox scene, and the densest.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
//
// Layout uses the same convention as both Manhattan scenes: x = east, z = south,
// north = -z. The map is a north→south ladder of bands, water at both ends:
//
//   z -112..-92  East River — Brooklyn + Manhattan Bridge towers, piers, ferry
//   z  -92..-58  DUMBO / Brooklyn Bridge Park (W) · Williamsburg + Domino (E)
//   z  -58..-16  Brooklyn Heights + the Promenade (W) · Downtown Brooklyn and
//                Fort Greene (C) — the Williamsburgh Savings Bank clock tower
//                is the tallest thing on the map, Barclays' rusted shell is
//                the widest
//   z  -16..+50  Grand Army Plaza (spawn) · Prospect Park · Brooklyn Museum ·
//                Red Hook + the Gowanus canal in the south-west
//   z  +50..+92  Coney Island — Cyclone, Wonder Wheel, Parachute Jump,
//                Nathan's, the boardwalk, Steeplechase Pier, the beach
//   z  +92..+104 the Atlantic
//
// BRICK SIZES — all four are load-bearing decisions here, not decoration:
//   2 m    bridge towers + anchorages, the Domino refinery, Barclays' shell,
//          the Grand Army arch, Parachute Jump legs, gantry-crane legs. A 2 m
//          horizontal hop costs 2 m of a material's span, so a 2 m plate
//          reaches exactly ONE hop — every 2 m shell here carries the mod-5
//          interior column pattern (see megaShell in voxelkit.js) so no roof
//          cell is ever two hops from support.
//
// Every large civic/industrial mass goes through a named parametric kit builder
// — stadiumBowl, refineryMass, museumBlock, triumphalArch, trussViaduct,
// parachuteTower, suspensionBridge, megaShell — rather than an inline loop.
// Each of those funnels its geometry through a single primitive call site, so
// changing the primitive is one line per builder instead of an audit of this
// file. Add a new mass here and it belongs in the kit, not in a local loop.
//   1 m    standard buildings, brownstone rows, warehouses, decks.
//   0.5 m  vehicles, trees, coaster trestle, Wonder Wheel, carousel, stoops,
//          fire escapes, market stalls, boat hulls, pier bents.
//   0.25 m street furniture, sign lettering, bridge cables and suspenders,
//          cornices, railings, bollards.
//
// SCENE CONTRACTS (each one is validator-enforced in tools/validate.mjs):
//   - one block per fine cell; placement step always equals the brick size
//   - nothing floating: glass never carries, hanging is impossible (support
//     never flows downward), 2 m plates get columns, cantilevers stay inside
//     the material's maxSpan
//   - no ground-anchored block inside a `roads` rect except the vehicles in
//     BROOKLYN_VEHICLES, which the validator imports as its allowlist
//   - every building footprint cell stands on a decor surface — no bare ground
//   - water rects exactly match the interior of their physical rims, and never
//     cross a road/plaza (water draws near the top of the stack)
//   - crosswalk stripes come from the axis-aware kit helper, never a hand roll
//   - cameraBlockers are GENERATED from the finished geometry (see
//     generateBlockers in voxelkit.js — shared with Upper Manhattan), because a
//     37k-block scene cannot keep a hand list in sync and every drift is
//     invisible until the camera clips a roof

import {
  bench, bigTruck, bikeRack, bollard, boxVan, brownstone, bus, cafeTable,
  carousel, ferrisWheel, crateStack, fireEscape, gantryCrane, generateBlockers,
  hotDogCart, hydrant, lampPost, laneDashes, mailbox, marketStall, motorcycle,
  museumBlock, newsBox, newsstand, parachuteTower, planter, refineryMass,
  sandwichBoard, sedan, shippingContainer, signPost, signText, stadiumBowl,
  stoop, subwayEntrance, suspensionBridge, tower, trafficLight, trashBags,
  trashBin, tree, triumphalArch, trussViaduct, waterTower, woodCoaster, zebra,
} from './voxelkit.js';

// Footprint of a vehicle entry. The implementation is shared with every other
// scene (js/voxelkit.js) and re-exported here because BROOKLYN_VEHICLES is what
// the validator resolves through it.
export { vehicleBBox } from './voxelkit.js';

// Every vehicle in the scene. The scene places them from this list and
// tools/validate.mjs imports it as the roads allowlist, so a car can never be
// waved through at a position it does not actually occupy.
export const BROOKLYN_VEHICLES = [
  // DUMBO / Old Fulton St
  { kind: 'sedan', x: -62, z: -64.5, axis: 'x', color: 0xf7c948 },
  { kind: 'boxVan', x: -46, z: -64.5, axis: 'x', len: 5, color: 0xe8ecf2, color2: 0x2a5f9a },
  { kind: 'bus', x: -22, z: -64.5, axis: 'x', color: 0x2a5f9a },
  // Williamsburg / Kent Ave
  { kind: 'sedan', x: 4, z: -64.5, axis: 'x', color: 0x30343b },
  { kind: 'bigTruck', x: 14, z: -65, axis: 'x', color: 0x2e5d3a },
  { kind: 'boxVan', x: 40, z: -64.5, axis: 'x', len: 6, color: 0xf2f2f2, color2: 0xd97c2c },
  // Atlantic Ave
  { kind: 'bus', x: -56, z: -20.5, axis: 'x', color: 0x8a2f3a },
  { kind: 'sedan', x: -12, z: -20.5, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'boxVan', x: 12, z: -20.5, axis: 'x', len: 5, color: 0x8a8f98, color2: 0xc23b2e },
  { kind: 'motorcycle', x: 44, z: -20.5, axis: 'x' },
  // Downtown Fulton St
  { kind: 'sedan', x: -30, z: -44.5, axis: 'x', color: 0xf7c948 },
  { kind: 'bus', x: -14, z: -44.5, axis: 'x', color: 0x2a5f9a },
  { kind: 'boxVan', x: 24, z: -44.5, axis: 'x', len: 5, color: 0xf2f2f2, color2: 0xf2f2f2 },
  { kind: 'sedan', x: 42, z: -44.5, axis: 'x', color: 0x30343b },
  // Flatbush Ave (runs in z)
  { kind: 'sedan', x: -2.5, z: -52, axis: 'z', color: 0xf7c948 },
  { kind: 'bus', x: -2.5, z: -40, axis: 'z', color: 0x2a5f9a },
  // Court St, Brooklyn Heights (runs in z)
  { kind: 'sedan', x: -45.5, z: -52, axis: 'z', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'sedan', x: -45.5, z: -34, axis: 'z', color: 0x30343b },
  // Prospect Park West + Sixth Ave (run in z)
  { kind: 'sedan', x: -21.5, z: 10, axis: 'z', color: 0xf7c948 },
  { kind: 'sedan', x: -21.5, z: 40, axis: 'z', color: 0x2a5f9a },
  { kind: 'sedan', x: 24.5, z: 20, axis: 'z', color: 0xc23b2e },
  { kind: 'boxVan', x: 24.5, z: 34, axis: 'z', len: 5, color: 0xf2f2f2, color2: 0x3e8a5b },
  // Eastern Pkwy + Union St
  { kind: 'bus', x: 26, z: 6.5, axis: 'x', color: 0x8a2f3a },
  { kind: 'sedan', x: 44, z: 6.5, axis: 'x', color: 0xf7c948 },
  { kind: 'sedan', x: 0, z: 35, axis: 'x', color: 0x30343b },
  { kind: 'sedan', x: 32, z: 35, axis: 'x', color: 0xf7c948 },
  // Ninth St / Gowanus + Van Brunt St, Red Hook
  { kind: 'bigTruck', x: -64, z: 22.5, axis: 'x', color: 0x8a5a3a },
  { kind: 'boxVan', x: -48, z: 22.5, axis: 'x', len: 6, color: 0x8a8f98, color2: 0x2e5d3a },
  { kind: 'sedan', x: -67.5, z: 0, axis: 'z', color: 0xc23b2e },
  // Surf Ave, Coney Island
  { kind: 'bus', x: -36, z: 51.5, axis: 'x', color: 0x2a5f9a },
  { kind: 'sedan', x: -20, z: 51.5, axis: 'x', color: 0xf7c948 },
  { kind: 'boxVan', x: 30, z: 51.5, axis: 'x', len: 5, color: 0xf2f2f2, color2: 0xf2c14e },
  { kind: 'motorcycle', x: 44, z: 51.5, axis: 'x' },
];

// The ONLY structures allowed to occupy a roadway rect besides the vehicles
// above, declared by explicit position and minimum underside height rather than
// by any size/height filter — a filter is what let a 0.25 m bollard and a stoop
// each stand in asphalt during authoring. Today this is one entry: the Manhattan
// Bridge colonnade's arch, which Washington St's view corridor runs beneath.
export const BROOKLYN_ROAD_SPANS = [
  { minX: -21, maxX: -2, minZ: -79, maxZ: -76, minY: 7 },
];

// Ground that is empty ON PURPOSE. A dead-space sweep flags any point with
// nothing edible within 8 m, and the honest way to answer one of those is either
// to build there or to say — here, in the scene, with a reason — that the
// emptiness is the design. The dishonest way is to shrink the sweep's region
// until it reports green, which is the same failure as widening a guard with a
// material filter: the exclusion stops being a decision anyone can find.
//
// So these are declared the way BROOKLYN_ROAD_SPANS is: positional, named, and
// checked. The validator holds each one to being genuinely block-free and to
// touching the level edge, because "the edge of the map trails off" is the only
// rationale that has been accepted. An INTERIOR void cannot be declared away
// here — it has to be built or argued for.
export const BROOKLYN_OPEN_GROUND = [
  {
    // Continues the Bush Terminal rail yard (rail decor x[-76,-46] z[28,44],
    // which this abuts exactly) south to the waterfront: freight apron, then
    // open flat, then the water at z 92. Sized to the real void, not to the
    // dead-sample bbox — sample points sit 8 m inside the true boundary, which
    // is why this reads 32 x 48 m where the sweep reported 28 x 36.
    minX: -78, maxX: -46, minZ: 44, maxZ: 92,
    why: 'rail-yard apron running out to the water at the level edge',
  },
];

// One table drives roads, both sidewalks, and the centreline dashes, so a
// street can never ship with its sidewalk on the wrong side. Exported because
// the crossing table below indexes into it and the validator has to be able to
// resolve `[streetIndex, at]` back to the street it was declared against.
export const BROOKLYN_STREETS = [
  { x: -70, z: -66, w: 54, d: 5, axis: 'x' },     // 0  Old Fulton St, DUMBO
  // Washington St threads the colonnade's centre bay: 3 m wide at x -15..-12
  // so the flanking columns touch the kerb without standing in the asphalt,
  // and it starts at z -80, clear of the Manhattan Bridge anchorage's mass.
  { x: -15, z: -80, w: 3, d: 14, axis: 'z' },     // 1  Washington St
  { x: -2, z: -66, w: 64, d: 5, axis: 'x' },      // 2  Kent Ave, Williamsburg
  { x: 31, z: -86, w: 4, d: 20, axis: 'z' },      // 3  Berry St — 1 m west of the warehouse mural skin
  { x: -66, z: -22, w: 126, d: 6, axis: 'x' },    // 4  Atlantic Ave
  { x: -3, z: -58, w: 6, d: 36, axis: 'z' },      // 5  Flatbush Ave
  { x: -46, z: -58, w: 4, d: 36, axis: 'z' },     // 6  Court St
  { x: -40, z: -46, w: 96, d: 5, axis: 'x' },     // 7  Fulton St, Downtown
  { x: -22, z: 2, w: 4, d: 48, axis: 'z' },       // 8  Prospect Park West
  { x: 18, z: 4, w: 44, d: 6, axis: 'x' },        // 9  Eastern Pkwy
  { x: -20, z: 34, w: 66, d: 4, axis: 'x' },      // 10 Union St
  { x: -70, z: 22, w: 48, d: 4, axis: 'x' },      // 11 Ninth St, Gowanus
  { x: -68, z: -12, w: 4, d: 34, axis: 'z' },     // 12 Van Brunt St, Red Hook
  { x: -44, z: 50, w: 96, d: 6, axis: 'x' },      // 13 Surf Ave, Coney Island
  { x: 24, z: 12, w: 4, d: 38, axis: 'z' },       // 14 Sixth Ave
];

// Length of a crossing along its street's direction of travel.
export const XW_LEN = 2.8;

// `[streetIndex, at]`, where `at` is an ABSOLUTE coordinate on the street's own
// axis and the crossing occupies `at .. at + XW_LEN`.
//
// Three entries here once pointed at streets that did not contain them, and one
// of the three was SILENT: Old Fulton St (x -70..-16) and Kent Ave (x -2..62)
// share the z band -66..-61, so `[0, 6]` overshot Old Fulton by 22 m and landed
// on Kent's asphalt — inside a legal road rect, so a "is it on some road" guard
// waves it through while it renders as a crossing on the wrong street. That is
// why the validator resolves each entry against BROOKLYN_STREETS[si] rather than
// against the road set.
export const BROOKLYN_CROSSINGS = [
  [0, -60], [0, -46], [0, -30], [0, -22],    // Old Fulton St (x -70..-16)
  [2, 0], [2, 20], [2, 40],                  // Kent Ave (x -2..62)
  [4, -60], [4, -20], [4, 20], [4, 48],      // Atlantic Ave (x -66..60)
  [5, -54], [5, -34],                        // Flatbush Ave (z -58..-22)
  [6, -54], [6, -30],                        // Court St (z -58..-22)
  [7, -34], [7, 0], [7, 34], [7, 50],        // Fulton St (x -40..56)
  [8, 6], [8, 30],                           // Prospect Park West (z 2..50)
  [9, 24], [9, 48],                          // Eastern Pkwy (x 18..62)
  [10, -14], [10, 28],                       // Union St (x -20..46)
  [11, -64], [11, -34],                      // Ninth St (x -70..-22)
  [12, 4], [12, 18],                         // Van Brunt St (z -12..22)
  [13, -36], [13, 0], [13, 36],              // Surf Ave (x -44..52)
  [14, 20], [14, 42],                        // Sixth Ave (z 12..50)
];

export function buildBrooklyn(sim) {
  sim.bounds = 110;
  // Content bbox is x[-74,62] z[-112,104]; this leaves a few metres of open
  // water/lot on every side and no dead driving space.
  sim.boundsRect = { minX: -78, maxX: 66, minZ: -116, maxZ: 108 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);
  const B25 = (x0, y0, z0, nx, ny, nz, m, c) => BOX(x0, y0, z0, nx, ny, nz, m, 0.25, c);

  // Decor accumulators. Districts push their own surfaces so a building and the
  // ground it stands on are always written next to each other.
  const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [];
  const roads = [], rail = [], bikePaths = [], laneMarkers = [], crosswalks = [];
  const water = [], boardwalk = [];

  // ============================================================ DISTRICT BASES
  // Rule: no building may stand on the raw ground plane. Each district lays a
  // broad surface first; roads are drawn on top of it and buildings sit beside
  // them. Colour is free on every rect, so the districts read apart at a glance.
  plaza.push(
    { x: -74, z: -92, w: 68, d: 34, color: 0x6b6157 },   // DUMBO lots — meets the Williamsburg apron at x -6 so the Manhattan Bridge anchorage is never on bare ground
    { x: -6, z: -92, w: 70, d: 34, color: 0x5f5c55 },    // Williamsburg yards
    { x: -76, z: -60, w: 36, d: 44, color: 0x6d6f74 },   // Brooklyn Heights
    { x: -40, z: -60, w: 100, d: 44, color: 0x76736c },  // Downtown / Fort Greene
    { x: -20, z: -16, w: 84, d: 34, color: 0x8a8578 },   // Grand Army + museum apron
    // Red Hook / Gowanus lots, tiled AROUND the canal: water paints over plaza,
    // so a single rect here would have erased its own middle.
    { x: -78, z: -16, w: 20, d: 42, color: 0x6a655c },
    { x: -50, z: -16, w: 20, d: 42, color: 0x6a655c },
    { x: -58, z: -16, w: 8, d: 8, color: 0x6a655c },
    { x: -58, z: 18, w: 8, d: 8, color: 0x6a655c },
    { x: -48, z: 46, w: 106, d: 30, color: 0x9a8f7a },   // Coney Island lots
  );
  cobbles.push(
    { x: -70, z: -86, w: 54, d: 26, color: 0x5a5560 },   // DUMBO cobblestone streets
    { x: -18, z: 2, w: 36, d: 28, color: 0x6e6a72 },     // Grand Army Plaza oval
  );
  rail.push(
    { x: -76, z: 28, w: 30, d: 16, color: 0x3a3128 },    // Red Hook rail yard
    { x: 36, z: -92, w: 26, d: 22, color: 0x3a3128 },    // Williamsburg freight spur
  );
  parks.push(
    { x: -46, z: 24, w: 60, d: 26, color: 0x2d5a33 },    // Prospect Park meadow — reaches x 14 so the bandshell and its east bench are not on bare ground
    { x: 4, z: -60, w: 20, d: 13, color: 0x2f6136 },     // Fort Greene Park
    { x: -74, z: -60, w: 8, d: 44, color: 0x2f6136 },    // Promenade green strip
    { x: -70, z: -92, w: 26, d: 8, color: 0x35683c },    // Brooklyn Bridge Park
  );

  // ===================================================== N — EAST RIVER + BRIDGES
  water.push(
    { x: -78, z: -116, w: 144, d: 24, color: 0x16375e },   // East River
    { x: -78, z: 92, w: 144, d: 16, color: 0x1b4a72 },     // the Atlantic
  );

  // Brooklyn Bridge: tower + anchorage + piered deck + 0.25 m cable rig.
  suspensionBridge(sim, {
    x0: -48, towerZ: -104, towerH: 17, anchorZ0: -92, anchorZ1: -80,
    deckZ0: -112, deckY: 12, stone: 0x8d8377, deckColor: 0x7f858c,
  });
  // Manhattan Bridge: taller, bluer, and it lands on a colonnade in DUMBO.
  suspensionBridge(sim, {
    x0: -20, towerZ: -104, towerH: 15, anchorZ0: -92, anchorZ1: -82,
    deckZ0: -112, deckY: 12, stone: 0x6f7a86, cable: 0x4a5666, deckColor: 0x707880,
  });
  // The Manhattan Bridge colonnade + arch on Washington St, framed by the
  // view corridor below.
  for (const cx of [-20, -16, -12, -8, -4]) {
    BOX(cx, 0, -78, 1, 7, 1, 'concrete', 1, 0xd0c8b8);
    BOX(cx, 7, -78, 1, 1, 1, 'concrete', 1, 0xb8ae9c);
  }
  BOX(-20, 8, -78, 17, 1, 2, 'concrete', 1, 0xd0c8b8);
  BOX(-18, 9, -78, 13, 1, 2, 'concrete', 1, 0xb8ae9c);

  // Piers, ferry landing, and a moored tug on the East River shore. Pier decks
  // are 1 m: a 0.5 m plank field costs four times the blocks for a surface the
  // camera never gets close enough to read.
  for (const [px, pw] of [[-70, 8], [-58, 8], [4, 10], [22, 8]]) {
    BOX(px, 0, -92, pw, 1, 6, 'wood', 1, 0x8a6a4a);
    for (let x = 0; x < pw; x += 3) BOX(px + x, 1, -91.5, 1, 2, 1, 'wood', 0.5, 0x5c4530);
    boardwalk.push({ x: px, z: -92, w: pw, d: 6, color: 0x9c7248 });
  }
  // ferry terminal shed at the DUMBO landing
  tower(sim, -58, -90, 7, 4, 1, 4, 'masonry', 'panel', 0xe8ecf2);
  BOX(-58, 4, -90, 7, 1, 4, 'panel', 1, 0x2a5f9a);
  // Sign height is chosen so every rail row has shed wall beside it — mount a
  // rail above a building's roofline and the letters have nothing to lean on.
  signText(sim, 'FERRY', -57, 3.5, -90.5, { px: 0.25, scale: 1, color: 0xf2f2f2, rail: 0x2a5f9a, dir: 1 });
  // tug boat, moored in open water between the two bridge anchorages
  {
    const hx = -32, hz = -96;
    for (let x = 0; x < 6; x += 0.5) {
      for (let z = 0; z < 3; z += 0.5) {
        B(hx + x, 0, hz + z, 'panel', 0.5, 0x1f2a38);
        // FULL deck, not just a bulwark ring — the wheelhouse stands mid-hull
        // and a ring leaves the cells under it empty
        B(hx + x, 0.5, hz + z, 'panel', 0.5, 0x3a4450);
        if (x === 0 || x >= 5.5 || z === 0 || z >= 2.5) B(hx + x, 1, hz + z, 'panel', 0.5, 0xc23b2e);
      }
    }
    BOX(hx + 1.5, 1, hz + 0.5, 4, 3, 4, 'panel', 0.5, 0xe8ecf2);
    BOX(hx + 1.5, 2.5, hz + 0.5, 4, 1, 4, 'panel', 0.5, 0x2a2f38);
    BOX(hx + 2, 3, hz + 1, 2, 4, 2, 'steel', 0.5, 0x30363f);   // funnel, on the wheelhouse roof
  }

  // ============================================== NW — DUMBO / BRIDGE PARK
  // Empire Stores: the brick warehouse wall along the cobbles, arched windows,
  // rooftop water towers. This row is the district's whole silhouette.
  {
    const shades = [0x8a4a38, 0x9a5a44, 0x7e4232, 0x8f5140];
    // The row starts at z -79, one metre clear of the Brooklyn Bridge
    // anchorage's south face — the cornice and the awning both project north.
    for (let i = 0; i < 3; i++) {
      const ox = -68 + i * 11;
      tower(sim, ox, -79, 10, 8, 0, 10, 'masonry', 'brick', shades[i]);
      BOX(ox, 10, -79, 10, 1, 8, 'concrete', 1, 0x6a6259);
      for (let u = 0; u < 10 * 4; u++) B25(ox + u * 0.25, 10, -79.25, 1, 1, 1, 'brick', 0x5f4436);
      waterTower(sim, ox + 3, 11, -76, 0x6f5238);
      // loading-dock awning over the cobbles, 4 m up so it clears traffic
      BOX(ox + 1, 4, -79.5, 8, 1, 1, 'panel', 0.5, i % 2 ? 0x2e5d3a : 0xc23b2e);
      fireEscape(sim, ox + 6, -79, 2, -1, 2.5, 4, 3);
    }
  }
  // Jane's Carousel: steel-framed glass pavilion on the park lawn. Kept to 7×7
  // because the roof plate has no interior columns (the carousel fills the
  // floor) and steel only spans 3 m — an 11 m box would drop its own roof.
  {
    const ox = -30, oz = -88;
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        const edge = x === 0 || x === 6 || z === 0 || z === 6;
        if (!edge) continue;
        const post = x % 3 === 0 || z % 3 === 0;
        for (let y = 0; y < 4; y++) B(ox + x, y, oz + z, post ? 'steel' : 'glass', 1, post ? 0xd8d2c2 : undefined);
      }
    }
    BOX(ox, 4, oz, 7, 1, 7, 'steel', 1, 0xd8d2c2);
    BOX(ox + 1, 5, oz + 1, 5, 1, 5, 'panel', 1, 0xb8442f);
    carousel(sim, ox + 3.5, oz + 3.5, 2.5);
    plaza.push({ x: ox - 2, z: oz - 2, w: 11, d: 11, color: 0x7d7365 });
  }
  // DUMBO street life
  for (const [x, z] of [[-66, -60], [-52, -60], [-38, -60], [-24, -60]]) lampPost(sim, x, z);
  for (const [x, z] of [[-64, -68.5], [-44, -68.5], [-26, -68.5]]) lampPost(sim, x, z);
  newsstand(sim, -60, -68.5); hotDogCart(sim, -34, -68.5);
  hydrant(sim, -50, -60.25); trashBin(sim, -30, -60.25); mailbox(sim, -20, -60.25);
  subwayEntrance(sim, -12, -59.5);
  for (const [x, z] of [[-70, -59.5], [-16, -59.5]]) trafficLight(sim, x, z);
  // waterfront bollards skip the bridge anchorage and Jane's Carousel
  for (let x = -68; x <= -20; x += 8) { if (x > -47 && x < -21) continue; bollard(sim, x, -85.5); }
  for (const [x, z] of [[-38, -58], [-28, -58], [-20, -58]]) tree(sim, x, z);
  for (const [x, z] of [[-48, -90], [-62, -84], [-50, -84]]) tree(sim, x, z);
  bench(sim, -64, -84); bench(sim, -54, -84);

  // ======================================= NE — WILLIAMSBURG / GREENPOINT
  // Domino Sugar: the district's brick mass, all 2 m bricks, with the rooftop
  // sign standing on its own 0.25 m billboard frame.
  refineryMass(sim, {
    ox: 6, oz: -86, nx: 10, ny: 8, nz: 5,
    wallMat: 'brick', wallColor: 0x7c4436, roofMat: 'concrete', roofColor: 0x5a5048,
    // Smokestack, standing off the refinery's south-east corner. It used to sit
    // at x 28..32, which put its west half inside Berry St's asphalt.
    stack: { x: 24, z: -74, h: 30 },
    // Two tanks, not three: the pitch keeps the gap at x 14 clear for the Kent
    // Ave lamp post, which the third tank used to swallow.
    tanks: { xs: [8, 16], z: -72 },
  });
  signText(sim, 'DOMINO', 8.5, 18, -76.25, {
    px: 0.25, scale: 2, color: 0xf2c14e, rail: 0x4a4038, postY: -2, dir: 1,
  });
  // Williamsburg warehouse blocks with painted mural facades + water towers
  {
    const rows = [
      [36, -88, 10, 8, 9, 0x8a5040, 0x2f7fa8],
      [48, -88, 12, 8, 11, 0x7a4636, 0xd94f3d],
      [48, -76, 12, 8, 10, 0x6f4132, 0x3e8a5b],
    ];
    for (const [ox, oz, w, d, h, wall, muralColor] of rows) {
      tower(sim, ox, oz, w, d, 0, h, 'masonry', 'brick', wall);
      BOX(ox, h, oz, w, 1, d, 'concrete', 1, 0x60584f);
      waterTower(sim, ox + w - 4, h + 1, oz + 2, 0x6f5238);
      // mural: a painted 0.5 m skin on the west facade (0.25 m here would cost
      // four times the blocks for a flat colour field)
      for (let u = 0; u < d * 2; u++) {
        for (let y = 1; y < 4.5; y += 0.5) B(ox - 0.5, y, oz + u * 0.5, 'panel', 0.5, muralColor);
      }
      fireEscape(sim, ox + 1, oz, Math.max(2, Math.floor(h / 4)), -1, 2.5, 4, 3);
    }
  }
  // Williamsburg Bridge approach: a steel truss viaduct heading north off-map.
  // Deck and parapet stop one and two metres short of the last bent so the run
  // reads as continuing past the map edge rather than ending in mid-air.
  trussViaduct(sim, { xW: 40, xE: 46, legH: 8, z0: -110, legZ1: -88, deckZ1: -89, railZ1: -90 });
  // Williamsburg street life + rail spur furniture
  for (const [x, z] of [[2, -60], [18, -60], [34, -60], [50, -60], [60, -60]]) lampPost(sim, x, z);
  for (const [x, z] of [[14, -67.5], [30, -67.5], [50, -67.5]]) lampPost(sim, x, z);
  hotDogCart(sim, 14, -60.25); newsstand(sim, 26, -67.5); trashBin(sim, 40, -60.25);
  hydrant(sim, 4, -60.25); mailbox(sim, 56, -60.25); subwayEntrance(sim, 20, -59.5);
  trafficLight(sim, 32, -59.5); trafficLight(sim, 0, -59.5);
  for (const [x, z] of [[10, -58], [24, -58], [38, -58], [52, -58]]) tree(sim, x, z);
  // Container stack in the yard between the warehouse blocks and Kent Ave.
  shippingContainer(sim, 36, 0, -70, 6, 0xb4552f);
  shippingContainer(sim, 42, 0, -70, 5, 0x2f6f9a);   // stops short of the mural skin at x 47.5
  shippingContainer(sim, 36, 3, -70, 6, 0x3e8a5b);

  // ============================================ W — BROOKLYN HEIGHTS
  // Brownstone rows. Four terraces, party walls touching, alternating brick
  // shades so the run reads as individual houses.
  // Rows sit east of the Promenade deck and west of Court St, all fronting
  // south on an 11 m pitch: 7 m of house, a 2 m stoop, and 2 m of clearance so
  // no two stoops ever reach into the same cells.
  {
    const shades = [0x8a5545, 0x77463a, 0x9a6250, 0x6f4034];
    const rows = [{ oz: -58, floors: 3 }, { oz: -47, floors: 4 }, { oz: -36, floors: 3 }];
    for (let r = 0; r < rows.length; r++) {
      for (let i = 0; i < 3; i++) {
        brownstone(sim, -67 + i * 5, rows[r].oz, 5, 7, rows[r].floors + (i % 2), shades[(i + r) % 4], {
          dir: 1, escape: i % 2 === 1, trim: 0x6b5546,
        });
      }
    }
  }
  // The Promenade: a public deck bridging the BQE, on concrete columns that
  // stand clear of the roadway rect on both banks.
  // Three column lines, not two: with 3 m column pitch in z, a 4 m clear span in
  // x puts every deck cell within 1 m of a column line and 1.5 m along it —
  // 2.5 m of load path, inside concrete's 3 m.
  for (let z = -56; z <= -20; z += 3) {
    for (const cx of [-74, -72, -70]) BOX(cx, 0, z, 1, 4, 1, 'concrete', 1, 0x8a8f98);
  }
  for (let x = -74; x <= -70; x++) {
    for (let z = -56; z <= -19; z++) B(x, 4, z, 'concrete', 1, 0x9a958a);
  }
  // railing stands ON the deck's outboard edge cell — one 0.25 m step outboard
  // and it has nothing under it (the whole Promenade rail floated once)
  for (let z = -56; z <= -19.75; z += 0.25) B25(-74, 5, z, 1, 3, 1, 'steel', 0x3b424c);
  // Furniture stands ON the deck (its top face is y 5), not on the ground
  // beneath it where nobody would ever see it.
  for (let z = -54; z < -21; z += 7) bench(sim, -73.5, z, 5);
  for (let z = -50; z < -21; z += 9) planter(sim, -70.5, z, 1.5, 1, undefined, 5);
  for (let z = -52; z < -21; z += 11) lampPost(sim, -72.5, z, 5);
  // Heights street furniture
  for (const [x, z] of [[-60, -25.5], [-52, -25.5], [-68, -60]]) lampPost(sim, x, z);
  // Street trees line the west kerb of Court St, not Old Fulton's: a trunk close
  // enough to Old Fulton to read as a street tree drops its canopy into the road.
  for (const [x, z] of [[-50, -55], [-50, -45], [-50, -35]]) tree(sim, x, z);
  hydrant(sim, -47.75, -50); trashBin(sim, -47.75, -38); mailbox(sim, -47.75, -28);
  trafficLight(sim, -47.75, -25.5);

  // ================================ C — DOWNTOWN BROOKLYN / FORT GREENE
  // Williamsburgh Savings Bank: base, shaft, four clock faces, copper pyramid.
  // The tallest structure on the map by design.
  tower(sim, 8, -40, 12, 10, 0, 13, 'masonry', 'brick', 0x8a6a4a);
  BOX(8, 13, -40, 12, 1, 10, 'concrete', 1, 0x7a6d5c);
  tower(sim, 12, -37, 6, 6, 14, 41, 'masonry', 'brick', 0x8a6a4a);
  BOX(12, 41, -37, 6, 1, 6, 'concrete', 1, 0x7a6d5c);
  for (let y = 42; y < 46; y++) {                       // clock stage
    for (let x = 0; x < 6; x++) {
      for (let z = 0; z < 6; z++) {
        const edge = x === 0 || x === 5 || z === 0 || z === 5;
        if (!edge) continue;
        const face = (x === 0 || x === 5) ? z : x;
        const dial = y > 42 && y < 45 && face > 1 && face < 4;
        B(12 + x, y, -37 + z, dial ? 'glass' : 'brick', 1, dial ? 0xf2ede2 : 0x8a6a4a);
      }
    }
  }
  BOX(12, 46, -37, 6, 1, 6, 'concrete', 1, 0x7a6d5c);
  BOX(12.5, 47, -36.5, 10, 2, 10, 'panel', 0.5, 0x3e8a6a);   // copper pyramid, lower
  BOX(13.5, 48, -35.5, 6, 2, 6, 'panel', 0.5, 0x357f60);
  BOX(14.5, 49, -34.5, 2, 2, 2, 'panel', 0.5, 0x2e7357);
  BOX(14.75, 50, -34.25, 2, 6, 2, 'steel', 0.25, 0xd8d2c2);  // finial

  // Borough Hall: Greek revival portico + cupola.
  tower(sim, -34, -38, 10, 8, 0, 7, 'masonry', 'concrete', 0xd6cfbe);
  BOX(-34, 7, -38, 10, 1, 8, 'concrete', 1, 0xc4bca9);
  for (const px of [-33, -31, -29, -27, -25]) BOX(px, 0, -40, 1, 4, 1, 'steel', 1, 0xe0d9c8);
  BOX(-34, 4, -40, 10, 1, 2, 'concrete', 1, 0xd6cfbe);
  BOX(-35, 0, -41, 12, 1, 1, 'concrete', 1, 0xb8b0a0);
  BOX(-32, 8, -36, 6, 2, 4, 'wood', 1, 0xd6cfbe);
  BOX(-31, 10, -35, 4, 1, 2, 'wood', 1, 0x3e8a6a);
  BOX(-29.5, 11, -34.5, 2, 4, 2, 'steel', 0.25, 0x3e8a6a);

  // Barclays Center: a rusted 2 m shell — rounded rectangle, hollow bowl,
  // stepped in three height bands, with the oculus notch cut out of the
  // north-west corner. Sized to sit between Fulton St and Atlantic Ave with
  // both sidewalks clear.
  {
    const arena = stadiumBowl(sim, { cx: 42, cz: -31, rx: 7, rz: 3 });
    plaza.push(arena.plaza);
    // The sign's backing rail leans on the shell's south face; without it the
    // middle of an O would have no load path at all.
    signText(sim, 'BARCLAYS', 34, 9, arena.faceZ + 0.25, {
      px: 0.25, scale: 1, color: 0xf2c14e, rail: 0x4a4038, dir: -1,
    });
  }

  // Fort Greene Park + the Prison Ship Martyrs' Monument. The monument sits at
  // the park's crown, well north of Fulton St — its 2 m base used to straddle
  // the roadway, which is both a road violation and a bus-shaped collision.
  for (const [x, z] of [[6, -58], [20, -58], [6, -51], [20, -51], [10, -49], [17, -49]]) tree(sim, x, z);
  bench(sim, 9, -52); bench(sim, 17, -52);
  for (let y = 0; y < 6; y += 2) for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) B(12 + ix * 2, y, -58 + iz * 2, 'concrete', 2, 0xc9c1ae);
  BOX(13, 6, -57, 2, 22, 2, 'concrete', 1, 0xd6cfbe);
  BOX(12.5, 28, -57.5, 6, 2, 6, 'concrete', 0.5, 0xc4bca9);
  BOX(13.5, 29, -56.5, 4, 4, 4, 'steel', 0.5, 0xb8a05a);

  // Downtown offices: glass slabs along Flatbush + Fulton.
  // d 8, not 9: at 9 the south wall reached z -21 and stood one metre inside
  // Atlantic Ave's asphalt for all sixteen floors.
  tower(sim, -26, -30, 10, 8, 0, 16, 'curtain');
  // Roof plant, 3 deep not 5: at d 8 the tower's interior columns land on the
  // single row z -27, so a 5-deep cap put its far corners 4 m from any support.
  BOX(-24, 16, -28, 6, 2, 3, 'panel', 1, 0x555c66);
  tower(sim, 26, -56, 10, 9, 0, 13, 'curtain');
  tower(sim, 42, -56, 9, 9, 0, 19, 'curtain');
  tower(sim, -14, -38, 8, 8, 0, 13, 'masonry', 'concrete', 0x8d939c);
  BOX(-14, 13, -38, 8, 1, 8, 'concrete', 1, 0x767d86);
  waterTower(sim, -12, 14, -36, 0x6f5238);
  // Fulton Mall storefront row: awnings + sidewalk signs. The run stops at
  // x -7 so neither a shopfront nor its awning reaches Flatbush Ave's sidewalk.
  {
    const awn = [0xc23b2e, 0x2e5d3a, 0xd9a02c, 0x2a5f9a, 0x8a2f6a];
    for (let i = 0; i < 4; i++) {
      const ox = -36 + i * 6;
      tower(sim, ox, -56, 5, 7, 0, 7, 'masonry', 'brick', [0x9a5a3a, 0x8a4a3a, 0xa8765a][i % 3]);
      BOX(ox, 7, -56, 5, 1, 7, 'concrete', 1, 0x605850);
      BOX(ox, 3, -49, 10, 1, 1, 'panel', 0.5, awn[i]);
      sandwichBoard(sim, ox + 2, -48.5);
    }
  }
  // Downtown street life + steam
  for (const [x, z] of [[-38, -47.5], [-20, -47.5], [0, -47.5], [20, -47.5], [40, -47.5]]) lampPost(sim, x, z);
  // Fulton St's north sidewalk is crowded: Borough Hall's portico, the Savings
  // Bank and Barclays all front it, so furniture only goes in the gaps between
  // them (x -24..-14, -6..8, 22..28).
  for (const [x, z] of [[-22, -39.5], [0, -39.5], [24, -39.5]]) lampPost(sim, x, z);
  subwayEntrance(sim, -6, -39.5); subwayEntrance(sim, 38, -47.75);
  newsstand(sim, -18, -39.5); hotDogCart(sim, 6, -39.5); hotDogCart(sim, -18, -47.75);
  hydrant(sim, -4, -39.5); trashBin(sim, -12, -47.75); trashBin(sim, 26, -39.5);
  mailbox(sim, -16, -39.5); trafficLight(sim, -4.5, -47.75); trafficLight(sim, 3.5, -39.5);
  for (const [x, z] of [[-34, -38.5], [-4, -38.5], [26, -38.5], [52, -38.5]]) bollard(sim, x, z);

  // ============================ C-S — GRAND ARMY PLAZA / PROSPECT PARK / MUSEUM
  // Soldiers' and Sailors' Memorial Arch: 2 m granite, 4 m opening (one 2 m hop
  // from each pier — the widest a 2 m lintel can carry), quadriga on top.
  triumphalArch(sim, { ox: -6, oz: 4, quadriga: { xs: [-4, -2, 0, 2] } });
  // Plaza fountain, clear of the spawn disc at (0,16) by more than 5 m.
  {
    const fx = 0, fz = 24;
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        const r = Math.hypot(x, z);
        if (r > 3.4) continue;
        // The pedestal stands on the four centre cells, so they must be
        // concrete: glass has vertBond 0.40 and carries nothing at all.
        const core = x >= -1 && x <= 0 && z >= -1 && z <= 0;
        if (r > 2.4 || core) B(fx + x, 0, fz + z, 'concrete', 1, 0x8c8578);
        else B(fx + x, 0, fz + z, 'glass', 1, 0x3fa7d6);
      }
    }
    for (const [px, pz] of [[fx, fz], [fx - 0.5, fz], [fx, fz - 0.5], [fx - 0.5, fz - 0.5]]) {
      for (let y = 1; y < 3; y += 0.5) B(px, y, pz, 'concrete', 0.5, 0x9a9184);
    }
    BOX(fx - 1, 3, fz - 1, 4, 1, 4, 'concrete', 0.5, 0x9a9184);
    BOX(fx - 0.5, 3.5, fz - 0.5, 2, 1, 2, 'glass', 0.5, 0x3fa7d6);
  }
  // plaza dressing — kept off the spawn promenade
  for (const [x, z] of [[-14, 6], [14, 6], [-14, 28], [14, 28], [-16, 18], [16, 18]]) lampPost(sim, x, z);
  for (const [x, z] of [[-13, 12], [12, 12], [-13, 22], [12, 22]]) bench(sim, x, z);
  for (const [x, z] of [[-16, 8], [15, 8], [-16, 26], [15, 26]]) tree(sim, x, z);
  for (const [x, z] of [[-10, 29], [8, 29]]) planter(sim, x, z, 2, 1);
  hotDogCart(sim, 10, 27); newsstand(sim, -12, 27); trashBin(sim, 6, 29);

  // ------------------------------------------- the Grand Army greenmarket
  // The oval used to be swept clean for the establishing shot, and that made
  // the opening of the level dead: a SIZE 1 hole drove 13.8 m before its first
  // bite here against 3.3 m in Lower Manhattan, and the north-east heading ran
  // 107 m into nothing. Clean paving is the WORST ground for a fresh hole, and
  // not for the obvious reason — a 1 m paving block only unseats when 3 of its
  // 4 base corners fall inside the 1.045 m removal disc, and even then any
  // neighbour within concrete's 3 m span keeps carrying it. So a paved field is
  // effectively inedible at SIZE 1 no matter how much of it there is. Loose
  // 0.25/0.5 m props are the opposite: isolated, so losing the anchor drops
  // them outright.
  //
  // The fix is therefore content, not a spawn move: Grand Army Plaza runs a
  // real Saturday greenmarket, so the oval gets one. Everything here is 0.25 m
  // or 0.5 m, which is also where the scene's brick mix was thinnest.
  //
  // The 4 m disc around spawn stays clear — the hole must not be chewing before
  // the player has touched a key, and the READY gate holds on a static frame.
  {
    // market aisle, running east along the promenade
    for (const [x, z] of [[4, 9], [10, 9], [4, 13], [10, 13]]) marketStall(sim, x, z, 0xc23b2e);
    for (const [x, z] of [[7.5, 11], [13.5, 11], [7.5, 15.5]]) crateStack(sim, x, z);
    for (const [x, z] of [[14.5, 13.5], [2.5, 16.5]]) trashBags(sim, x, z);
    // café terrace, south-west of the fountain
    for (const [x, z] of [[-5, 19], [-8.5, 21], [-5.5, 23.5], [-10, 17.5]]) cafeTable(sim, x, z);
    // bike-share dock along the promenade's west kerb
    bikeRack(sim, -6, 14, 4, 'z');
    bikeRack(sim, 3.5, 20.5, 3, 'x');
    // news boxes under the arch, and a second row by the museum apron
    for (const [x, z] of [[-2, 11], [-0.5, 11], [1, 11]]) newsBox(sim, x, z, 0x2a5f9a);
    for (const [x, z] of [[-13.5, 16], [-13.5, 17.5]]) newsBox(sim, x, z, 0xc23b2e);
    // clutter filling the remaining headings out of spawn
    for (const [x, z] of [[-8, 12], [-12.5, 13], [11, 19.5]]) crateStack(sim, x, z, 3);
    trashBags(sim, -3.5, 27.5);
    // One rack, not two: the second stood inside the arch's east pier and
    // punched seven fine cells out of a 2 m concrete block. Moving it avoided
    // that clash once the hoops grew their proper cross bars, and the
    // northern headings already bite at 4.3 m off the news boxes.
    bikeRack(sim, -4, 24.5, 2, 'x');
    // The oval's outer edge takes bollards rather than more furniture: at 2
    // blocks each they buy the same "the plaza is used" read for a sixth of
    // the block cost of full furniture (there is no 40k block ceiling — see
    // STATUS.md's Established facts — this is purely a density choice).
    for (const [x, z] of [
      [-16.5, 13], [-16.5, 20], [16.5, 13], [16.5, 20],
      [-9, 3.5], [9, 3.5], [-9, 30.5], [9, 30.5], [17, 25], [-17, 25],
    ]) bollard(sim, x, z, 0x4a5058);
    // Fountain apron, where the market queue stands. This cluster is the one
    // that matters most: the fountain is a contiguous 1 m concrete field, so a
    // hole driving due south rides straight over it — every block it unseats is
    // still carried by a neighbour 1 m away, well inside concrete's 3 m span —
    // and then crosses 14 m of empty meadow. Due south was a 19.4 m walk and
    // 191° was a 47.3 m one until these went in.
    hotDogCart(sim, -2.5, 18.5); trashBin(sim, 1.5, 18.5);
    for (const [x, z] of [[-0.75, 19.25], [2.75, 18.5]]) trashBags(sim, x, z);
    // The market's west end, closing the arch-to-market gap on the north-west
    // headings (304° ran 16.6 m through it).
    marketStall(sim, -7, 9, 0x2e6f4d);
    crateStack(sim, -9, 10);
  }

  // Brooklyn Museum: broad beaux-arts body, colonnade, and a stepped forecourt.
  // It sits east of Sixth Ave and north of Eastern Pkwy's sidewalk — the body
  // used to straddle both roadways.
  plaza.push(museumBlock(sim, {
    ox: 30, oz: 13, w: 12, d: 9, h: 10,
    colXs: [31, 34, 37, 40],
    attic: { dx: 3, dz: 3, w: 6, h: 3, d: 4 },
    court: { x: 26, z: 10, w: 22, d: 20, color: 0x8a8578 },
  }).court);
  for (const [x, z] of [[47, 13], [47, 25], [30, 26], [40, 26]]) tree(sim, x, z);
  for (const [x, z] of [[29, 14], [45.5, 14]]) lampPost(sim, x, z);
  bench(sim, 34, 26); bench(sim, 43, 26);

  // Prospect Park: the meadow, the lake (rim built FROM the water rect so the
  // two can never drift apart), the boathouse, and a bandshell.
  {
    const lake = { x: -42, z: 32, w: 18, d: 12 };
    water.push({ ...lake, color: 0x1d5a52 });
    for (let x = lake.x - 1; x < lake.x + lake.w + 1; x++) {
      B(x, 0, lake.z - 1, 'concrete', 1, 0x7b7f74);
      B(x, 0, lake.z + lake.d, 'concrete', 1, 0x7b7f74);
    }
    for (let z = lake.z; z < lake.z + lake.d; z++) {
      B(lake.x - 1, 0, z, 'concrete', 1, 0x7b7f74);
      B(lake.x + lake.w, 0, z, 'concrete', 1, 0x7b7f74);
    }
    // boathouse on the north shore, west of Prospect Park West's roadway
    tower(sim, -38, 26, 8, 5, 0, 4, 'masonry', 'concrete', 0xd6cfbe);
    BOX(-38, 4, 26, 8, 1, 5, 'panel', 1, 0xb84f3a);
    BOX(-37, 5, 27, 6, 1, 3, 'panel', 1, 0xa8452f);
    // rowboats moored inside the rim, clear of the boathouse footprint
    for (const [bx, bz] of [[-40, 32.5], [-33, 32.5]]) {
      for (let x = 0; x < 3; x += 0.5) B(bx + x, 0, bz, 'wood', 0.5, 0xdcd2bc);
      for (let x = 0; x < 3; x += 0.5) B(bx + x, 0.5, bz, 'wood', 0.5, 0x8a6a4a);
    }
    // bandshell
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 5; y++) {
        if (Math.hypot(x - 3.5, y - 0) > 6.2) continue;
        B(2 + x, y, 40, 'concrete', 1, 0xcfc6b1);
      }
    }
    BOX(2, 0, 41, 8, 1, 4, 'wood', 1, 0x8a6a4a);
  }
  // Canopies spread ~1.5 m from the trunk, so a trunk on a kerb still drops
  // leaves into the asphalt — every trunk here clears Ninth St and Prospect
  // Park West by more than the canopy radius.
  const parkTrees = [
    [-46, 29], [-40, 46], [-30, 47], [-12, 29], [-14, 44], [-6, 30], [-4, 44],
    [4, 27], [6, 46], [-44, 40], [-28, 29], [-24, 47], [-10, 25], [0, 47],
  ];
  for (const [x, z] of parkTrees) tree(sim, x, z);
  for (const [x, z] of [[-46, 30], [-16, 30], [-2, 33], [12, 42]]) bench(sim, x, z);
  for (const [x, z] of [[-17, 28], [-17, 44], [-40, 48], [-8, 48]]) lampPost(sim, x, z);
  bikePaths.push(
    { x: -45, z: 28, w: 52, d: 1.5, color: 0x2a8068 },
    { x: -45, z: 44, w: 52, d: 1.5, color: 0x2a8068 },
    { x: -45, z: 28, w: 1.5, d: 17.5, color: 0x2a8068 },
    { x: 5.5, z: 28, w: 1.5, d: 17.5, color: 0x2a8068 },
  );

  // ==================================== SW — RED HOOK / GOWANUS
  // Gowanus canal: rim built from the water rect, with a bascule drawbridge.
  {
    // d 26, not 30: at 30 the canal's south end ran under Ninth St's north
    // sidewalk, and water draws above sidewalks — the kerb simply vanished.
    const canal = { x: -58, z: -8, w: 8, d: 26 };
    water.push({ ...canal, color: 0x2f4030 });
    for (let z = canal.z - 1; z < canal.z + canal.d + 1; z++) {
      B(canal.x - 1, 0, z, 'concrete', 1, 0x6f6a60);
      B(canal.x + canal.w, 0, z, 'concrete', 1, 0x6f6a60);
    }
    for (let x = canal.x; x < canal.x + canal.w; x++) {
      B(x, 0, canal.z - 1, 'concrete', 1, 0x6f6a60);
      B(x, 0, canal.z + canal.d, 'concrete', 1, 0x6f6a60);
    }
    // bascule bridge: towers each bank, a fixed leaf, and a raised leaf
    for (const tx of [canal.x - 3, canal.x + canal.w + 1]) {
      BOX(tx, 0, 8, 2, 8, 2, 'steel', 1, 0x4f5a68);
      BOX(tx, 8, 8, 2, 1, 2, 'steel', 1, 0x8d3f36);
    }
    // fixed leaf: 3 m of cantilever off the west tower, steel's exact limit
    for (let x = canal.x - 1; x < canal.x + 2; x++) BOX(x, 4, 8, 1, 1, 2, 'steel', 1, 0x8d3f36);
    // raised leaf: each step needs a riser cell, or consecutive blocks meet only
    // along a diagonal and carry nothing
    for (let i = 0; i < 4; i++) {
      const bx = canal.x + canal.w - i;
      BOX(bx, 4 + i, 8, 1, 1, 2, 'steel', 1, 0x8d3f36);
      if (i < 3) BOX(bx - 1, 4 + i, 8, 1, 1, 2, 'steel', 1, 0x8d3f36);
    }
  }
  // container stacks + two gantry cranes on the Red Hook rail apron
  {
    const cols = [0xb4552f, 0x2f6f9a, 0x3e8a5b, 0xc9a227, 0x8a4f8a];
    let n = 0;
    for (let z = 30; z < 42; z += 4) {
      for (let x = -74; x < -60; x += 7) {
        shippingContainer(sim, x, 0, z, 6, cols[n % cols.length]);
        if ((n + z) % 3 === 0) shippingContainer(sim, x, 3, z, 6, cols[(n + 2) % cols.length]);
        n++;
      }
    }
    gantryCrane(sim, -58, 30, { h: 14 });
    gantryCrane(sim, -58, 38, { h: 14 });
  }
  // Red Hook row houses + warehouses. Everything here is threaded between three
  // hard edges: Van Brunt St (x -68..-64), the canal's physical rim (x -59..-49)
  // and Ninth St (z 22..26).
  {
    const shades = [0x8a5545, 0x6f4034, 0x94604e];
    tower(sim, -78, -14, 8, 8, 0, 8, 'masonry', 'brick', 0x7e4838);
    BOX(-78, 8, -14, 8, 1, 8, 'concrete', 1, 0x5f574e);
    waterTower(sim, -76, 9, -12, 0x6f5238);
    tower(sim, -78, 2, 8, 8, 0, 6, 'masonry', 'brick', 0x9a6250);
    BOX(-78, 6, 2, 8, 1, 8, 'concrete', 1, 0x5f574e);
    tower(sim, -44, -8, 8, 8, 0, 10, 'masonry', 'brick', 0x8f5140);
    BOX(-44, 10, -8, 8, 1, 8, 'concrete', 1, 0x5f574e);
    waterTower(sim, -42, 11, -6, 0x6f5238);
    // Row fronts NORTH: a south-facing stoop would land in Ninth St's sidewalk.
    for (let i = 0; i < 2; i++) {
      brownstone(sim, -46 + i * 5, 14, 5, 7, 2 + (i % 2), shades[i % 3], { dir: -1, stoopSteps: 3 });
    }
  }
  for (const [x, z] of [[-70, 20], [-48, 20], [-30.5, 20], [-70, 29], [-36, 47]]) lampPost(sim, x, z);
  hydrant(sim, -63, 20.25); trashBin(sim, -48, 10); mailbox(sim, -32, 12);
  for (const [x, z] of [[-72, -2], [-72, 12], [-36, 2]]) tree(sim, x, z);
  for (const [x, z] of [[-76, 43], [-70, 43], [-64, 43]]) bollard(sim, x, z);

  // ============================================ S — CONEY ISLAND
  sand.push({ x: -48, z: 80, w: 106, d: 12, color: 0xd9c48a });
  boardwalk.push({ x: -48, z: 74, w: 106, d: 6, color: 0xb08050 });
  plaza.push({ x: -48, z: 56, w: 106, d: 18, color: 0x9a8f7a });

  // Wonder Wheel — the rim's bottom sits on the ground, which is what anchors
  // the whole ring; the A-frames flank the wheel plane.
  ferrisWheel(sim, 18, 64, 9, { rim: 0x8f2f3a, spokeColor: 0xf2ede2 });
  // The sign stands on its own posts beside the wheel — the wheel plane is at
  // z 64 and the sign at z 62.75, so nothing on the wheel can hold it up.
  signText(sim, 'WONDER', 11, 5, 62.75, { px: 0.25, scale: 1, color: 0xf2c14e, rail: 0x4a4038, postY: -5, dir: -1 });

  // The Cyclone — a stepped wooden trestle with a lift hill and two drops.
  {
    const prof = (i) => [4, 7, 11, 15, 16, 14, 10, 7, 5, 8, 11, 8, 4][i] ?? 4;
    woodCoaster(sim, -24, 60, 13, prof, { w: 3, cars: [4, 5], carColor: 0xe2452f });
    signText(sim, 'CYCLONE', -24, 6, 59.75, { px: 0.25, scale: 1, color: 0xf2f2f2, rail: 0x8d3f36, postY: -6, dir: -1 });
  }

  // Parachute Jump: 2 m steel legs to 18 m, a 0.5 m lattice mast above, and the
  // ring at the top. Every tie is a 2 m hop or less from a leg.
  parachuteTower(sim, { ox: 38, oz: 62 });

  // Nathan's, the arcade, and the boardwalk stalls.
  tower(sim, -42, 58, 9, 7, 0, 5, 'masonry', 'panel', 0xf2ede2);
  BOX(-42, 5, 58, 9, 1, 7, 'panel', 1, 0xc9302c);
  BOX(-42, 6, 58, 9, 1, 2, 'panel', 1, 0xf2c14e);
  signText(sim, 'NATHANS', -41, 5.5, 57.5, { px: 0.25, scale: 1, color: 0xf2ede2, rail: 0x8d3f36, dir: 1 });
  // arcade, south of the Cyclone's trestle run (which occupies x -24..8, z 60..63)
  tower(sim, -32, 66, 10, 7, 0, 7, 'masonry', 'brick', 0x8a4f6a);
  BOX(-32, 7, 66, 10, 1, 7, 'concrete', 1, 0x5f5058);
  for (let i = 0; i < 6; i++) marketStall(sim, -40 + i * 12, 76, [0xc23b2e, 0x2a5f9a, 0xf2c14e][i % 3]);
  for (const [x, z] of [[-44, 74.5], [-20, 74.5], [4, 74.5], [28, 74.5], [50, 74.5]]) lampPost(sim, x, z);
  for (let x = -46; x < 52; x += 6) bollard(sim, x, 79.5, 0x6b4a2c);
  bench(sim, -30, 78.5); bench(sim, -6, 78.5); bench(sim, 18, 78.5); bench(sim, 42, 78.5);
  hotDogCart(sim, -36, 73); trashBin(sim, 8, 73); newsstand(sim, 34, 72.5);

  // Steeplechase Pier: wood bents out over the Atlantic, deck at 2 m.
  {
    // Pile grid: columns 3 m apart in x, rows 3 m apart in z. Deck planks are
    // 1 m, so a hop costs 1 m and wood's maxSpan of 2 allows exactly two hops —
    // this grid puts every plank at most one hop in x plus one hop in z from a
    // pile, with nothing to spare.
    const px = 4, pw = 8;
    for (let x = px; x <= px + 6; x += 3) {
      for (let z = 80; z <= 101; z += 3) {
        B(x, 0, z, 'wood', 1, 0x5c4530); B(x, 1, z, 'wood', 1, 0x5c4530);
      }
    }
    for (let x = px; x < px + pw; x++) {
      for (let z = 80; z <= 102; z++) B(x, 2, z, 'wood', 1, 0x9c7248);
    }
    for (let z = 80; z <= 102; z += 2) {
      for (const rx of [px, px + pw - 0.5]) { B(rx, 3, z, 'wood', 0.5, 0x6b4a2c); B(rx, 3.5, z, 'wood', 0.5, 0x6b4a2c); }
    }
    boardwalk.push({ x: px, z: 80, w: pw, d: 23, color: 0xa8763f });
    for (const [lx, lz] of [[px + 3, 86], [px + 4, 94], [px + 3, 100]]) {
      for (let y = 3; y < 5; y += 0.5) B25(lx, y, lz, 1, 2, 1, 'steel', 0x2f3440);
      B25(lx, 5, lz, 1, 1, 1, 'glass', 0xfff2c8);
    }
  }
  // beach dressing: lifeguard stand, umbrellas
  {
    for (let y = 0; y < 2; y += 0.5) for (const lx of [-8, -6.5]) for (const lz of [84, 85.5]) B(lx, y, lz, 'wood', 0.5, 0xdcd2bc);
    BOX(-8, 2, 84, 4, 1, 4, 'wood', 0.5, 0xdcd2bc);
    BOX(-8, 2.5, 84, 4, 2, 1, 'panel', 0.5, 0xd94f3d);
  }
  for (const [ux, uz] of [[-30, 84], [-18, 86], [24, 84], [36, 86], [44, 83]]) {
    B25(ux, 0, uz, 1, 6, 1, 'steel');
    B25(ux - 0.5, 1.5, uz - 0.5, 5, 1, 5, 'panel', (ux + uz) % 3 === 0 ? 0xd94f3d : 0x2f8fbf);
  }

  // ================================================================= STREETS
  for (const s of BROOKLYN_STREETS) {
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
  // Crossings. The rect is inset inside the roadway and the bars repeat along
  // the direction of travel, so every stripe lands inside the asphalt.
  const cross = (s, at) => (s.axis === 'x'
    ? zebra({ x: at, z: s.z + 0.4, w: XW_LEN, d: s.d - 0.8, axis: 'x' })
    : zebra({ x: s.x + 0.4, z: at, w: s.w - 0.8, d: XW_LEN, axis: 'z' }));
  for (const [si, at] of BROOKLYN_CROSSINGS) crosswalks.push(...cross(BROOKLYN_STREETS[si], at));

  // ================================================================ VEHICLES
  for (const v of BROOKLYN_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.color, v.roof ?? v.color, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.color, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.color, v.color2, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.color, false);
    else motorcycle(sim, v.x, v.z);
  }

  // ============================================================== DECOR + AMBIENT
  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };

  // Surface registry rollout — render-side only; the sim never reads it.
  // The same full-coverage map every scene carries (js/voxelsurfaces.js);
  // rubber/leaf stay unmapped on Boston's documented judgement.
  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_glass_curtain',
    concrete: 'mat_concrete_precast',
    steel: 'mat_metal_seam',
    panel: 'mat_metal_seam',
    wood: 'mat_timber_dock',
  };

  // Render-only ambient life. Never physical, never eatable — VoxelWorld3D owns
  // all of it and the physics grid never sees a single one.
  sim.sceneAmbient = {
    gulls: [
      { x: -40, z: -98, r: 14, y: 22, count: 9, speed: 0.35 },
      { x: 20, z: -96, r: 10, y: 18, count: 6, speed: 0.42 },
      { x: 6, z: 92, r: 18, y: 16, count: 12, speed: 0.3 },
      { x: -30, z: 86, r: 11, y: 12, count: 7, speed: 0.46 },
    ],
    surf: [
      { x: -48, z: 88, w: 106, d: 5, amp: 2.2, period: 6.5 },
      { x: -48, z: 92, w: 106, d: 3, amp: 1.4, period: 4.2 },
    ],
    ferries: [
      { x0: -70, z0: -104, x1: 40, z1: -98, period: 46, color: 0xd96c2c },
      { x0: 30, z0: -110, x1: -50, z1: -96, period: 62, color: 0xe8ecf2 },
    ],
    steam: [
      { x: -6, z: -43, rate: 0.5 }, { x: 18, z: -43, rate: 0.32 },
      { x: -28, z: -20, rate: 0.4 }, { x: 4, z: -25, rate: 0.26 },
    ],
    neon: [
      { x: -42, z: 57.5, w: 9, d: 1, color: 0xff4b3a, period: 1.6 },   // Nathan's
      { x: 9, z: 62, w: 18, d: 1, color: 0xffd166, period: 2.4 },      // Wonder Wheel
      { x: -24, z: 59, w: 12, d: 1, color: 0xff2e63, period: 1.1 },    // Cyclone
      { x: -34, z: -48.5, w: 20, d: 1, color: 0x4ad9ff, period: 3.2 }, // Fulton Mall awnings
      { x: 20, z: -76, w: 12, d: 1, color: 0xf2c14e, period: 4.5 },    // Domino
    ],
    pigeons: [
      { x: 0, z: 20, count: 16 }, { x: -8, z: 28, count: 10 },
      { x: -71, z: -38, count: 12 }, { x: -71, z: -26, count: 8 },
      { x: -30, z: -44, count: 9 }, { x: -40, z: 76, count: 14 },
    ],
  };

  sim.cameraBlockers = generateBlockers(sim);
}
