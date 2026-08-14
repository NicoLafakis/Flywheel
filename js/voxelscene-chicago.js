// Chicago Loop — the seventh voxel sandbox scene, rebuilt ground-up on the
// Cambridge method (.wiki/features/cambridge-sandbox/): strict street-grid
// alignment, a declared street table that the decor, kerbs, crossings and el
// structure are all DERIVED from, palette discipline with named hero accents,
// and district/route contracts the shared validator probes for real.
//
// THE MAP. x = east, z = south, north = -z, like every other scene.
//
//   The Chicago River wraps the north and west edges: the Main Branch runs
//   east-west along the top of the map (z[-100,-86]) and the South Branch runs
//   north-south along the left edge (x[-118,-104]), meeting at Wolf Point.
//   Three bascule bridges cross the Main Branch — LaSalle, State, and the
//   double-width DuSable bridge at Michigan — each with tender houses on the
//   banks. North of the river: Marina City's two corncob drums flanking State,
//   the Mies-black IBM slab, the white Wrigley Building with its clock tower
//   west of Michigan, and Tribune Tower's pinnacled crown east of it.
//
//   South of the river is the grid, famously regular and kept that way here:
//   N-S — Wacker (south leg), Wells, LaSalle, State, Wabash, Michigan;
//   E-W — Wacker, Lake, Washington, Monroe, Adams, Van Buren. The 'L' Loop is
//   the real rectangular circuit: elevated tracks over LAKE (north), WABASH
//   (east), VAN BUREN (south) and WELLS (west), WITH all four corners built —
//   corner posts standing on the four sidewalk corners of each junction, a
//   corner deck, and stepped-arc special work joining the rails. Three
//   stations (State/Lake, Washington/Wabash, Quincy) hang their platforms off
//   the structure. A four-car CTA train RUNS the circuit continuously — a
//   render-only mover whose position is a pure function of the sim clock
//   (js/voxelsim.js moverArc/moverPose), so it is deterministic and identical
//   on every peer of a networked match.
//
//   Landmarks at their real relative positions: Willis Tower's nine bundled
//   tubes west of Wells at Van Buren; the Board of Trade closing the LaSalle
//   vista south of Van Buren, Ceres on its pyramid; the Chicago Theatre and
//   its gold CHICAGO blade on State just north of Lake; Harold Washington
//   Library at State/Van Buren; the Carbide & Carbon tower on Michigan; and
//   east of Michigan, Millennium Park — Cloud Gate on its plaza, Crown
//   Fountain, and the Pritzker trellis over the great lawn.
//
// PALETTE. Authored by eye, unmeasured (the Cambridge convention, declared
// honestly): low-chroma steel/limestone/terracotta banks carry the Loop, and
// the saturation budget is spent on exactly four named hero accents — the
// Willis crown/antennas, the Theatre's gold blade, Cloud Gate's chrome, and
// Ceres — each guarded by probeHeroIdentity, so no stray bright block can
// appear anywhere else. `sp()` marks speculars (glass) per conventions.md.
// Every default-bright kit path (tower()'s 0x88ccff glass) is avoided: all
// glazing here is an explicit muted hex.
//
// Pure sim: no DOM/three.js, no Math.random (build-time trig is quantised to
// the 0.25 m grid before it reaches a block, exactly like voxelforms' drum).

import {
  beam, column, panel, pier, plinth, slab, wedge,
} from './voxelforms.js';
import {
  bench, bikeRack, bollard, boxVan, bus, cafeTable, generateBlockers, hydrant,
  hotDogCart, lampPost, mailbox, marqueeSign, motorcycle, newsBox, planter,
  rowBoat, sedan, signPost, statue, towerCrown, trafficLight, trashBin, tree,
  zebra, laneDashes,
} from './voxelkit.js';

export const CHICAGO_BOUNDS = { minX: -120, maxX: 108, minZ: -116, maxZ: 84 };
export const CHICAGO_XW_LEN = 3.5;

// The street table is the single source the roads decor, kerbs, crossings and
// the el all derive from — the old map's failure was exactly that these four
// were authored independently and disagreed.
export const CHICAGO_STREETS = [
  { id: 'wacker_dr',      axis: 'x', x: -100, z: -84,  w: 208, d: 7 },  // 0
  { id: 'wacker_south',   axis: 'z', x: -100, z: -77,  w: 7,  d: 161 }, // 1 — the South Branch leg
  { id: 'wells_st',       axis: 'z', x: -58,  z: -77,  w: 7,  d: 161 }, // 2 — el, west leg
  { id: 'lasalle_st',     axis: 'z', x: -30,  z: -77,  w: 7,  d: 140 }, // 3 — ends AT the Board of Trade
  { id: 'state_st',       axis: 'z', x: -2,   z: -77,  w: 7,  d: 161 }, // 4
  { id: 'wabash_ave',     axis: 'z', x: 26,   z: -77,  w: 7,  d: 161 }, // 5 — el, east leg
  { id: 'michigan_ave',   axis: 'z', x: 54,   z: -77,  w: 8,  d: 161 }, // 6 — the grand avenue, one lane wider
  { id: 'lake_st',        axis: 'x', x: -100, z: -56,  w: 154, d: 7 },  // 7 — el, north leg
  { id: 'washington_st',  axis: 'x', x: -100, z: -28,  w: 154, d: 7 },  // 8
  { id: 'monroe_st',      axis: 'x', x: -100, z: 0,    w: 154, d: 7 },  // 9
  { id: 'adams_st',       axis: 'x', x: -100, z: 28,   w: 154, d: 7 },  // 10
  { id: 'van_buren_st',   axis: 'x', x: -100, z: 56,   w: 154, d: 7 },  // 11 — el, south leg
  { id: 'michigan_north', axis: 'z', x: 54,   z: -116, w: 8,  d: 16 },  // 12 — north-bank stub off the DuSable bridge
];

// Every crossing is placed clear of the junction rects AND of the kerb-parked
// vehicles below — a zebra painted under a parked car is legal to every probe
// and wrong to every eye (the Cambridge rule, carried verbatim).
export const CHICAGO_CROSSINGS = [
  [0, -75], [0, -45], [0, 9], [0, 40], [0, 70],
  [1, -66], [1, -40], [1, 12], [1, 45],
  [2, -40], [2, 12], [2, 45],
  [3, -40], [3, 12], [3, 45],
  [4, -66], [4, -40], [4, 12], [4, 45], [4, 70],
  [5, -40], [5, 12], [5, 45],
  [6, -66], [6, -40], [6, 12], [6, 45], [6, 70],
  [7, -75], [7, -40], [7, 12], [7, 40],
  [8, -75], [8, -40], [8, 12], [8, 40],
  [9, -75], [9, -40], [9, 12], [9, 40],
  [10, -75], [10, -40], [10, 12], [10, 40],
  [11, -75], [11, -40], [11, 12], [11, 40],
  [12, -104],
];

// The only positional exemption probeRoadConflicts grants. Kerb lanes, clear
// of every crossing band above and of each other.
export const CHICAGO_VEHICLES = [
  // State Street
  { kind: 'sedan', x: 2.75,  z: -60,  axis: 'z', body: 0x3b4a56, roof: 0x3b4a56 },
  { kind: 'sedan', x: 2.75,  z: -34,  axis: 'z', body: 0x7a8288, roof: 0x7a8288 },
  { kind: 'bus',   x: -1.75, z: -14,  axis: 'z', body: 0xd9d6cd },
  { kind: 'sedan', x: 2.75,  z: 22,   axis: 'z', body: 0x51452f, roof: 0x51452f },
  { kind: 'sedan', x: -1.75, z: 36,   axis: 'z', body: 0x2e3a44, roof: 0x2e3a44 },
  { kind: 'sedan', x: 2.75,  z: 50,   axis: 'z', body: 0x8d2f28, roof: 0x8d2f28 },
  // LaSalle
  { kind: 'sedan', x: -29.75, z: -46, axis: 'z', body: 0x30343b, roof: 0x30343b },
  { kind: 'sedan', x: -29.75, z: -12, axis: 'z', body: 0xd8d3c6, roof: 0x2f4756 },
  { kind: 'boxVan', x: -25.25, z: 18, axis: 'z', len: 6, cab: 0xd8d3c6, box: 0x2a4f9a },
  // Wells (under the el)
  { kind: 'sedan', x: -57.75, z: -34, axis: 'z', body: 0x3d5a3a, roof: 0x3d5a3a },
  { kind: 'sedan', x: -53.25, z: 40,  axis: 'z', body: 0x8a6a2e, roof: 0x8a6a2e },
  // Wabash (under the el)
  { kind: 'sedan', x: 26.25,  z: -34, axis: 'z', body: 0x4a4f57, roof: 0x4a4f57 },
  { kind: 'sedan', x: 31,     z: 6,   axis: 'z', body: 0x2f4756, roof: 0x2f4756 },
  { kind: 'boxVan', x: 26.25, z: 20,  axis: 'z', len: 6, cab: 0xd8d3c6, box: 0x2f6b7a },
  // Michigan Avenue — the bus street
  { kind: 'bus',   x: 54.5,  z: -50,  axis: 'z', body: 0xd9d6cd },
  { kind: 'bus',   x: 59.5,  z: -12,  axis: 'z', body: 0xd9d6cd },
  { kind: 'bus',   x: 54.5,  z: 24,   axis: 'z', body: 0x2b4f80 },
  { kind: 'sedan', x: 59.75, z: 50,   axis: 'z', body: 0xe0ddd2, roof: 0xe0ddd2 },
  // Wacker Drive
  { kind: 'sedan', x: -70, z: -83.75, axis: 'x', body: 0x2f4756, roof: 0x2f4756 },
  { kind: 'sedan', x: -20, z: -83.75, axis: 'x', body: 0x8d2f28, roof: 0x8d2f28 },
  { kind: 'boxVan', x: 14, z: -79.5,  axis: 'x', len: 6, cab: 0xd8d3c6, box: 0x3d5a3a },
  { kind: 'sedan', x: 60,  z: -79.5,  axis: 'x', body: 0x30343b, roof: 0x30343b },
  // Cross streets
  { kind: 'sedan', x: -70, z: -55.75, axis: 'x', body: 0x4a4f57, roof: 0x4a4f57 },
  { kind: 'motorcycle', x: -14, z: -54.5, axis: 'x' },
  { kind: 'sedan', x: -46, z: -27.75, axis: 'x', body: 0xd8d3c6, roof: 0xd8d3c6 },
  { kind: 'sedan', x: 10,  z: -23,    axis: 'x', body: 0x3d5a3a, roof: 0x3d5a3a },
  { kind: 'sedan', x: -70, z: 0.25,   axis: 'x', body: 0x8a6a2e, roof: 0x8a6a2e },
  { kind: 'sedan', x: -46, z: 4.75,   axis: 'x', body: 0x2e3a44, roof: 0x2e3a44 },
  { kind: 'sedan', x: -68, z: 28.25,  axis: 'x', body: 0x30343b, roof: 0x30343b },
  { kind: 'sedan', x: -12, z: 32.75,  axis: 'x', body: 0x8d2f28, roof: 0x8d2f28 },
  { kind: 'sedan', x: 14,  z: 28.25,  axis: 'x', body: 0xd8d3c6, roof: 0x2f4756 },
  { kind: 'sedan', x: -85, z: 56.25,  axis: 'x', body: 0x3b4a56, roof: 0x3b4a56 },
  { kind: 'boxVan', x: -64, z: 60.75, axis: 'x', len: 6, cab: 0xd8d3c6, box: 0x8a3a30 },
  { kind: 'sedan', x: -40, z: 60.75,  axis: 'x', body: 0x51452f, roof: 0x51452f },
  // North bank
  { kind: 'bus',   x: 54.5, z: -112,  axis: 'z', body: 0xd9d6cd },
];

// Only elevated el/station geometry may stand over asphalt, and only from the
// crosshead soffit (y 5) up. Ground posts stand on the sidewalk corners —
// never in a carriageway — exactly like the real Loop's.
export const CHICAGO_ROAD_SPANS = [
  { minX: -59.25, maxX: -49.75, minZ: -57.25, maxZ: 64.25, minY: 5 },   // Wells leg + corners
  { minX: 24.75,  maxX: 34.25,  minZ: -57.25, maxZ: 64.25, minY: 5 },   // Wabash leg + corners
  { minX: -59.25, maxX: 34.25,  minZ: -57.25, maxZ: -47.75, minY: 5 },  // Lake leg
  { minX: -59.25, maxX: 34.25,  minZ: 54.75,  maxZ: 64.25, minY: 5 },   // Van Buren leg
  { minX: -6.25,  maxX: 6.25,   minZ: -47.75, maxZ: -45,   minY: 5.5 }, // State/Lake platform
  { minX: 34.25,  maxX: 36.75,  minZ: -28.5,  maxZ: -19.75, minY: 5.5 },// Washington/Wabash platform
  { minX: -61.75, maxX: -59.25, minZ: -1,     maxZ: 8,     minY: 5.5 }, // Quincy platform
];

// The river runs off the map on two edges and every land edge is held by
// built ground, so there is nothing to declare away.
export const CHICAGO_OPEN_GROUND = [];

export const CHICAGO_DISTRICTS = [
  { id: 'north_bank', name: 'Marina City and the North Bank', rect: { minX: -104, maxX: 108, minZ: -116, maxZ: -86 }, gapFloor: 15 },
  { id: 'riverwalk',  name: 'Wacker Drive and the Riverwalk', rect: { minX: -104, maxX: 108, minZ: -86, maxZ: -70 }, gapFloor: 15 },
  { id: 'north_loop', name: 'Theatre District and Lake Street', rect: { minX: -100, maxX: 54, minZ: -70, maxZ: -44 }, gapFloor: 15 },
  { id: 'west_loop',  name: 'Willis Tower and Wells Street', rect: { minX: -100, maxX: -51, minZ: -44, maxZ: 84 }, gapFloor: 15 },
  { id: 'lasalle',    name: 'LaSalle Canyon and the Board of Trade', rect: { minX: -51, maxX: 26, minZ: -44, maxZ: 84 }, gapFloor: 15 },
  { id: 'millennium', name: 'Michigan Avenue and Millennium Park', rect: { minX: 26, maxX: 108, minZ: -44, maxZ: 84 }, gapFloor: 15 },
];

// ---------------------------------------------------------------- palette ---
// Authored by eye (see header). sp() marks speculars a future de-veiling pass
// must skip. Four hero keys, each used inside its hero AABB and nowhere else.
const sp = (hex) => hex;

const C = {
  // The 'L': CTA's oxide-brown painted steel, weathered deck, bright railhead.
  elSteel: 0x4f4238, elDeep: 0x453930, elDeck: 0x6d675f, elRail: 0x8d939a,
  sleeper: 0x4a4038, parapet: 0x5a4d42, platform: 0xa39d92, tactile: 0xc9a83f,
  canopy: 0x3f4a44, canopyRoof: 0x767d75,
  // Loop banks.
  glassA: sp(0x4e5a63), glassB: sp(0x45525b), glassCool: sp(0x5b6d76),
  limestone: 0xbcb4a2, limeDeep: 0xa89f8c, terraWhite: 0xc7c2b4, terraDeep: 0xbdb8a8,
  brick: 0x84493b, brickDeep: 0x744034, monadnock: 0x53413a, monadDeep: 0x4a3a33,
  granite: 0x8f8b83, graniteDeep: 0x86827a, bronze: 0x6b5a48, mull: 0x39434c,
  sill: 0xb7b1a3, sillDeep: 0xaaa495,
  shopA: sp(0x46545c), shopB: sp(0x3f4d55),
  awnRed: 0x7e3a32, awnGreen: 0x37584a, awnBlue: 0x35516b,
  kerb: 0x9b988f,
  // Heroes (exact-hex keys — see CHICAGO_HEROES).
  willis: 0x2a3138, willisAlt: 0x303941, willisGlass: sp(0x3f4b55), willisCrown: 0xdfe3e7,
  botStone: 0xc6bda9, botDeep: 0xb0a794, botRoof: 0x7b848a, ceres: 0xaebbc3,
  theatreBrick: 0x8e4b3a, theatreDeep: 0x814435, marqueeRed: 0x8a322c, bulbs: 0xe8dcb0,
  theatreGold: 0xd9a832, marqueeText: 0xf2ead6,
  bean: 0xc9d2d8, beanShadow: 0x87929a,
  // River and banks.
  coping: 0x9a958c, railIron: 0x46505a, bridgeSteel: 0x5a5248,
  tender: 0x4f5a52, tenderRoof: 0x3f4a44,
  marina: 0x9f9a90, marinaDeep: 0x938d83, marinaBase: 0x968f85, marinaBaseAlt: 0x9c958b,
  mies: 0x2e353b, miesAlt: 0x333a41, wrigley: 0xd0ccbe, wrigleyTrim: 0xc4c0b0,
  tribune: 0xb5aea0, tribuneDeep: 0xaca596,
  carbide: 0x33413a, carbideAlt: 0x2e3a33, brass: 0xa8894c,
  cna: 0x8e3b32, cnaDeep: 0x853a30, hwl: 0x7d4437, hwlDeep: 0x744034, patina: 0x4f6b58,
  // Park.
  parkStone: 0xb3ada1, path: 0xa89f8e, fountain: sp(0x5d7382), trellis: 0x4b555e,
  petals: 0xaab2b8, stage: 0x3a3f45,
  // Street bites.
  paverA: 0xa39d92, paverB: 0x8f897e,
  // Train livery: stainless with muted CTA trim.
  trainSilver: 0xaeb4ba, trainGlass: sp(0x39444d), trainRoof: 0x878d93,
  trainDoor: 0x9aa0a6, trainSkirt: 0x555b61, trainBogie: 0x3a3f44,
};

export const CHICAGO_HEROES = [
  { id: 'willis_tower', name: 'Willis Tower', colorKey: C.willisCrown,
    hero: { minX: -88, maxX: -66, minZ: 35, maxZ: 56, minY: 0, maxY: 104 } },
  { id: 'board_of_trade', name: 'Board of Trade — Ceres', colorKey: C.ceres,
    hero: { minX: -38, maxX: -15, minZ: 63, maxZ: 84, minY: 0, maxY: 48 } },
  { id: 'chicago_theatre', name: 'Chicago Theatre blade', colorKey: C.theatreGold,
    hero: { minX: 2, maxX: 24, minZ: -76, maxZ: -54, minY: 0, maxY: 30 } },
  { id: 'cloud_gate', name: 'Cloud Gate', colorKey: C.bean,
    hero: { minX: 68, maxX: 88, minZ: -22, maxZ: 2, minY: 0, maxY: 8 } },
];

// The scripted tour: State Street south from spawn, west under the Van Buren
// el past Willis, up Wells through Quincy, east under Lake past the Theatre,
// out along the Riverwalk, then down Michigan into Millennium Park.
export const CHICAGO_ROUTE = [
  { until: 4,   x: 6,     z: 16 },
  { until: 13,  x: 6,     z: 52 },
  { until: 16,  x: -6,    z: 55 },
  { until: 26,  x: -44,   z: 55 },
  { until: 30,  x: -55,   z: 48 },
  { until: 41,  x: -61,   z: 8 },
  { until: 51,  x: -61,   z: -30 },
  { until: 56,  x: -58,   z: -48.25 },
  { until: 71,  x: 0,     z: -48.25 },
  { until: 75,  x: 5.75,  z: -62 },
  { until: 79,  x: 5.75,  z: -76 },
  { until: 85,  x: 26,    z: -85 },
  { until: 98,  x: 76,    z: -85 },
  { until: 110, x: 63.5,  z: -40 },
  { until: 122, x: 74,    z: 4 },
  { until: 129, x: 80,    z: 30 },
  { until: 135, x: 76,    z: 52 },
];

// Coins ride the tour line at a steady pitch — derived from the route rather
// than hand-drifted away from it, so a route edit can never orphan them.
export const CHICAGO_COIN_ANCHORS = (() => {
  const out = [];
  let prev = { x: 0, z: 16 }, carry = 0;
  for (const wp of CHICAGO_ROUTE) {
    const dx = wp.x - prev.x, dz = wp.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      for (let s = carry; s <= len; s += 8.25) {
        out.push({ x: Math.round((prev.x + dx * s / len) * 4) / 4, z: Math.round((prev.z + dz * s / len) * 4) / 4 });
        carry = s + 8.25 - len;
      }
    }
    prev = wp;
  }
  return out;
})();

// ------------------------------------------------------------------ decor ---
const DECOR_ROADS = CHICAGO_STREETS.map((s) => ({ x: s.x, z: s.z, w: s.w, d: s.d }));
const DECOR_XWALKS = (() => {
  const out = [];
  for (const [si, at] of CHICAGO_CROSSINGS) {
    const s = CHICAGO_STREETS[si];
    out.push(...(s.axis === 'x'
      ? zebra({ x: at, z: s.z, w: CHICAGO_XW_LEN, d: s.d, axis: 'x' })
      : zebra({ x: s.x, z: at, w: s.w, d: CHICAGO_XW_LEN, axis: 'z' })));
  }
  return out;
})();
const DECOR_DASHES = (() => {
  const out = [];
  for (const s of CHICAGO_STREETS) {
    if (s.axis === 'z') out.push(...laneDashes({ x: s.x + s.w / 2 - 0.125, z: s.z, w: 0.25, d: s.d, axis: 'z' }));
    else out.push(...laneDashes({ x: s.x, z: s.z + s.d / 2 - 0.125, w: 0.25, d: s.d, axis: 'x' }));
  }
  return out;
})();

export const CHICAGO_DECOR = {
  parks: [
    { x: 62, z: -46, w: 46, d: 102, color: 0x4f6f4e },   // Millennium Park
    { x: 62, z: 56, w: 46, d: 28, color: 0x567355 },     // Grant Park edge
    { x: 6, z: -114, w: 30, d: 10, color: 0x54715a },    // north-bank pocket lawn
  ],
  sand: [],
  plaza: [
    { x: 64, z: -26, w: 26, d: 30, color: C.parkStone }, // Cloud Gate plaza (AT&T Plaza)
    { x: 63.5, z: -38, w: 9, d: 14, color: 0x9fa39b },   // Crown Fountain reflecting plaza
    { x: 64, z: 2, w: 44, d: 5, color: 0xafa99d },       // Pritzker apron
    { x: -38, z: 63, w: 24, d: 2, color: C.parkStone },  // Board of Trade forecourt
    { x: -7, z: -47.5, w: 5.5, d: 9, color: 0xa5a096 },  // State/Lake stair forecourt
    { x: 33, z: -19.75, w: 4, d: 7, color: 0xa5a096 },   // Washington/Wabash stair forecourt
    { x: -62.5, z: 8, w: 3.5, d: 8, color: 0xa5a096 },   // Quincy stair forecourt
  ],
  cobbles: [
    { x: 21, z: -74, w: 3.5, d: 16.5, color: 0x6f6a63 }, // the theatre alley
  ],
  sidewalks: [
    { x: -102, z: -84, w: 164, d: 168, color: 0x99968d },// the Loop's land sheet, to the park edge
    { x: 62, z: -84, w: 46, d: 38, color: 0x99968d },    // east of Michigan, north of the park
    { x: -104, z: -116, w: 110, d: 14, color: 0x99968d },// north bank, west of the pocket lawn
    { x: 36, z: -116, w: 72, d: 14, color: 0x99968d },   // north bank, east of it
  ],
  roads: DECOR_ROADS,
  rail: [],
  bikePaths: [
    { x: 4, z: -77, w: 1, d: 161, color: 0x2e6b58 },     // State's protected lane
    { x: -100, z: -22.5, w: 154, d: 1, color: 0x2e6b58 },// Washington's
  ],
  laneMarkers: DECOR_DASHES,
  crosswalks: DECOR_XWALKS,
  water: [
    { x: -118, z: -116, w: 14, d: 200 },                 // South Branch (west edge — open)
    { x: -104, z: -100, w: 212, d: 14 },                 // Main Branch (east edge — open)
  ],
  boardwalk: [
    { x: -104, z: -86, w: 212, d: 2, color: 0x8b7f6c },  // the Riverwalk
    { x: -104, z: -102, w: 212, d: 2, color: 0x857a68 }, // the north-bank esplanade
    { x: -104, z: -84, w: 2, d: 168, color: 0x8b7f6c },  // the west (South Branch) walk
    { x: -120, z: -116, w: 2, d: 200, color: 0x7c7264 }, // the far bank sliver
  ],
};

export const CHICAGO_AMBIENT = {
  gulls: [{ x: -60, z: -93 }, { x: 20, z: -93 }, { x: 90, z: -92 }],
  steam: [
    { x: -40, z: 20, rate: 0.3 }, { x: 8, z: -30, rate: 0.35 },
    { x: -70, z: -60, rate: 0.25 }, { x: 40, z: 44, rate: 0.28 },
  ],
  neon: [
    { x: 7, z: -57.5, w: 12, d: 1, color: 0xc95348, period: 2.4 },  // the marquee wash
    { x: 33.25, z: -14, w: 1, d: 8, color: 0xc9a227, period: 3.1 }, // Wabash jewelers' row
    { x: -59.5, z: 14, w: 1.5, d: 6, color: 0x5a89b8, period: 3.4 },// Quincy stationfront
  ],
  pigeons: [
    { x: 74, z: -8, count: 14 }, { x: -28, z: 64, count: 10 },
    { x: 10, z: -55, count: 10 }, { x: -20, z: -85, count: 12 },
  ],
};

// ------------------------------------------------------------- the movers ---
// One four-car CTA train on the inner Loop track. The path is the inner-track
// centreline with 4 m corner chamfers, so each car swings the corner on its
// own arc offset. Speed 8.5 m/s laps the Loop in ~43 s.
function ctaCarParts() {
  const parts = [];
  const L = 8, W = 2.5;
  parts.push({ dx: 0, dy: 0, dz: 0, sx: W, sy: 0.25, sz: L, color: C.trainSkirt });
  for (const s of [-1, 1]) {
    const dx = s * (W / 2 - 0.125);
    parts.push({ dx, dy: 0.25, dz: 0, sx: 0.25, sy: 0.75, sz: L, color: C.trainSilver });
    for (let i = 0; i < 8; i++) {
      const dz = -3.5 + i;
      const door = i === 1 || i === 6;
      parts.push({
        dx, dy: 1.0, dz, sx: 0.25, sy: 0.75, sz: 1,
        color: door ? C.trainDoor : (i % 2 ? C.trainSilver : C.trainGlass),
      });
    }
    parts.push({ dx, dy: 1.75, dz: 0, sx: 0.25, sy: 0.5, sz: L, color: C.trainSilver });
  }
  parts.push({ dx: 0, dy: 2.25, dz: 0, sx: W, sy: 0.25, sz: L, color: C.trainRoof });
  for (const e of [-1, 1]) {
    const dz = e * (L / 2 - 0.125);
    parts.push({ dx: 0, dy: 0.25, dz, sx: W, sy: 0.75, sz: 0.25, color: C.trainSilver });
    parts.push({ dx: 0, dy: 1.0, dz, sx: 2, sy: 0.75, sz: 0.25, color: C.trainGlass });
    parts.push({ dx: 0, dy: 1.75, dz, sx: W, sy: 0.5, sz: 0.25, color: C.trainSilver });
  }
  for (const b of [-1, 1]) {
    parts.push({ dx: 0, dy: -0.25, dz: b * 2.5, sx: 1.5, sy: 0.25, sz: 1.5, color: C.trainBogie });
  }
  return parts;
}

export const CHICAGO_MOVERS = [{
  id: 'loop_train',
  path: [
    [-48, -50], [23, -50],   // Lake, eastbound
    [27, -46], [27, 53],     // Wabash, southbound
    [23, 57], [-48, 57],     // Van Buren, westbound
    [-52, 53], [-52, -46],   // Wells, northbound
  ],
  speed: 8.5,
  y: 7.0,
  units: [{ off: 0 }, { off: 8.75 }, { off: 17.5 }, { off: 26.25 }],
  parts: ctaCarParts(),
  // The simulated half (js/voxelsim.js mover simulation): each car samples the
  // deck band under its bogies; a full-width gap derails it (uniform gravity),
  // it lands on the street and keeps running the Loop route at ground level as
  // a runaway, and once derailed it is eatable — 75 raw mass a car, roughly a
  // carriage-sized helping of steel, credited through the real consumption
  // path. Elevated cars on intact track are NOT eatable (play-feel ruling: the
  // crash is the show; see the mover-simulation note in voxelsim.js).
  sim: {
    derail: true, groundRun: true, eatable: true,
    groundSpeed: 6.5,          // a runaway, slightly under its rail speed
    unitMass: 75,
    length: 8, width: 2.5, height: 2.5,
    probes: [-2.75, 2.75],     // the two bogies
    // Deck tiles ride y6-6.5 on legs and corners alike; the ±1 m lateral
    // sweep always finds deck wherever any deck survives, including the
    // stepped-arc corners.
    track: { y0: 6.0, y1: 6.5, halfW: 1.0 },
  },
}];

// ---------------------------------------------------------- shared helpers --
// A tower is a SKIN, not a fill (voxelforms' two-hand rule): 0.5 m-thick wall
// panels in 2 m courses with horizontal colour banding, slim interior columns
// on the megaShell dominating pattern, and a plate roof. Same silhouette and
// load path as the 2 m-cube shell at roughly a quarter of the fine-cell cost
// — the first cut of this scene built 12.6M cells against Boston's 4.6M and
// paid for it in build time. `w`, `d`, `h`, `band` are multiples of 2.
function shellTower(sim, { x, z, w, d, h, y0 = 0, color, alt = null, band = 8, roof = 0x565c62, topColor = null }) {
  const nx = Math.round(w / 2);
  const nz = Math.round(d / 2);
  for (let y = 0; y < h; y += 2) {
    const c = topColor && y + 2 >= h ? topColor : (alt && Math.floor(y / band) % 2 ? alt : color);
    for (let ix = 0; ix < nx; ix++) {
      sim._block(x + ix * 2, y0 + y, z, 'concrete', [2, 2, 0.5], c);
      sim._block(x + ix * 2, y0 + y, z + d - 0.5, 'concrete', [2, 2, 0.5], c);
    }
    // Side walls fill between the corner-owning front walls: 2 m pieces plus
    // a 1 m closer (d - 1 is odd in 2 m pieces).
    for (const wx of [x, x + w - 0.5]) {
      let zz = z + 0.5;
      while (zz < z + d - 0.5 - 0.01) {
        const seg = Math.min(2, z + d - 0.5 - zz);
        sim._block(wx, y0 + y, zz, 'concrete', [0.5, 2, seg], c);
        zz += seg;
      }
    }
    // Interior columns: the (ix + 2iz) % 5 dominating pattern, slimmed.
    for (let ix = 1; ix < nx - 1; ix++) {
      for (let iz = 1; iz < nz - 1; iz++) {
        if ((ix + 2 * iz) % 5 !== 0) continue;
        sim._block(x + ix * 2 + 0.75, y0 + y, z + iz * 2 + 0.75, 'steel', [0.5, 2, 0.5], c);
      }
    }
  }
  // Plate roof: every bay is over a wall or a column, or one hop from a bay
  // that is — the dominating pattern's whole point.
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      sim._block(x + ix * 2, y0 + h, z + iz * 2, 'concrete', [2, 0.5, 2], roof);
    }
  }
  return { top: y0 + h + 0.5 };
}

// Projecting cornice band around a roof plate — the avenue shadow line.
function corniceRing(sim, { x, z, w, d, y, color, t = 0.5 }) {
  beam(sim, { x: x - 0.25, y, z: z - 0.25, len: w + 0.5, axis: 'x', t, depth: 0.25, mat: 'concrete', color });
  beam(sim, { x: x - 0.25, y, z: z + d, len: w + 0.5, axis: 'x', t, depth: 0.25, mat: 'concrete', color });
  beam(sim, { x: x - 0.25, y, z, len: d, axis: 'z', t, depth: 0.25, mat: 'concrete', color });
  beam(sim, { x: x + w, y, z, len: d, axis: 'z', t, depth: 0.25, mat: 'concrete', color });
}

// Masonry setback tower: capped tiers, each wearing a cornice ring.
function masonryTower(sim, { x, z, tiers, color, alt = null, trim, roof = 0x565c62 }) {
  let cx = x, cz = tiers[0].z, y = 0;
  for (let t = 0; t < tiers.length; t++) {
    const { w, d, h, inset = 0 } = tiers[t];
    if (t > 0) { cx += inset; cz += inset; }
    const r = shellTower(sim, {
      x: cx, z: cz, w, d, h, y0: y, color, alt,
      roof: t === tiers.length - 1 ? roof : color,
    });
    corniceRing(sim, { x: cx, z: cz, w, d, y: r.top - 1, color: trim });
    y = r.top;
  }
  return { top: y };
}

// Street-facing curtain skin: grade storefronts + upper window bays applied
// 0.25 m proud of a shell face. Piers are grade-anchored stacked lifts; glass
// and spandrels checker two tones so probePlacementStep's identical-box rule
// never sees a broken rhythm.
function streetFace(sim, o) {
  const {
    u0, len, face, axis = 'x', out = -1, storeys = 2,
    pierC = C.mull, sillA = C.sill, sillB = C.sillDeep,
    glassA = C.shopA, glassB = C.shopB, spanA = C.limeDeep, spanB = C.granite,
    awn = null, awnEvery = 2,
  } = o;
  const c0 = out < 0 ? face - 0.25 : face;
  const bays = Math.max(1, Math.floor((len - 0.5) / 3));
  const totalH = 3.25 + storeys * 3;
  const P = (u, y, w, h, mat, color, t = 0.25) => (axis === 'x'
    ? sim._block(u, y, c0, mat, [w, h, t], color)
    : sim._block(c0, y, u, mat, [t, h, w], color));
  // Piers: continuous stacked lifts, one line per bay boundary.
  for (let k = 0; k <= bays; k++) {
    const u = u0 + k * 3;
    for (let y = 0; y < totalH - 0.01; y += 2.5) {
      P(u, y, 0.5, Math.min(2.5, totalH - y), 'concrete', pierC);
    }
  }
  for (let k = 0; k < bays; k++) {
    const u = u0 + k * 3 + 0.5;
    P(u, 0, 2.5, 0.5, 'concrete', k % 2 ? sillA : sillB);          // stall riser
    P(u, 0.5, 2.5, 2.0, 'glass', k % 2 ? glassA : glassB);         // shopfront
    for (let s = 0; s <= storeys; s++) {
      P(u, 2.5 + s * 3, 2.5, 0.75, 'concrete', (k + s) % 2 ? spanA : spanB); // spandrel
      if (s < storeys) P(u, 3.25 + s * 3, 2.5, 2.25, 'glass', (k + s) % 2 ? glassA : glassB);
    }
    if (awn && k % awnEvery === 0) {
      const aw = out < 0 ? c0 - 0.75 : c0 + 0.25;
      if (axis === 'x') sim._block(u, 2.5, aw, 'panel', [2.5, 0.25, 0.75], awn);
      else sim._block(aw, 2.5, u, 'panel', [0.75, 0.25, 2.5], awn);
    }
  }
}

// ------------------------------------------------------------- the river ----
function buildRiver(sim) {
  const bridges = [[-30, 7], [-2, 7], [54, 8]];   // LaSalle, State, DuSable/Michigan
  const nearBridge = (x) => bridges.some(([bx, bw]) => x + 3 > bx - 4.5 && x < bx + bw + 4.5);

  // South bank: Riverwalk coping + iron railing on the water edge, broken at
  // the bridges (the margin covers their tender houses too).
  for (let x = -104; x < 108; x += 3) {
    const w = Math.min(3, 108 - x);
    if (!nearBridge(x)) {
      plinth(sim, { x, z: -86, w, d: 0.5, h: 0.5, mat: 'concrete', color: C.coping });
      panel(sim, { x, y: 0.5, z: -86, w, h: 0.75, axis: 'x', t: 0.25, mat: 'steel', color: C.railIron });
    }
  }
  // North bank esplanade coping.
  for (let x = -104; x < 108; x += 3) {
    const w = Math.min(3, 108 - x);
    if (!nearBridge(x)) {
      plinth(sim, { x, z: -100.5, w, d: 0.5, h: 0.5, mat: 'concrete', color: C.coping });
      panel(sim, { x, y: 0.5, z: -100.5, w, h: 0.75, axis: 'x', t: 0.25, mat: 'steel', color: C.railIron });
    }
  }
  // West bank (South Branch): coping both sides, sparser furniture.
  for (let z = -84; z < 82; z += 3) {
    const d = Math.min(3, 82 - z);
    plinth(sim, { x: -104, z, w: 1, d, h: 0.5, mat: 'concrete', color: C.coping });
    panel(sim, { x: -103.5, y: 0.5, z, w: d, h: 0.75, axis: 'z', t: 0.25, mat: 'steel', color: C.railIron });
  }
  for (let z = -112; z < 82; z += 3) {
    const d = Math.min(3, 82 - z);
    plinth(sim, { x: -119.5, z, w: 1.5, d, h: 0.5, mat: 'concrete', color: C.coping });
  }
  rowBoat(sim, -114, -20, 'z', 0x2f6b3a);
  rowBoat(sim, -112, 30, 'z', 0x7a3a2e);

  // Riverwalk furniture — the tour's north edge, so the pitch is tight. The
  // line sits at z -85: clear of the coping/railing on the water side and of
  // Wacker's kerb line on the other.
  for (let x = -100; x < 104; x += 9) {
    if (nearBridge(x)) continue;
    bench(sim, x, -85);
    if (x % 18 === 0) lampPost(sim, x + 3, -84.9);
    else trashBin(sim, x + 3, -85, C.railIron);
  }
  for (const x of [-16, -8, 0]) { cafeTable(sim, x, -85); }
  for (let x = -96; x < 98; x += 18) {
    if (!nearBridge(x)) tree(sim, x + 6, -85);
  }
  // North esplanade benches, on the bank side of the coping.
  for (let x = -96; x < 100; x += 14) {
    if (!nearBridge(x)) bench(sim, x, -101.9);
  }

  // The bascule bridges: piered steel decks with tender houses on the banks.
  for (const [bx, bw] of bridges) {
    for (let z = -99; z < -87; z += 1) {
      slab(sim, { x: bx, y: 0.5, z, w: bw, d: 1, t: 0.5, mat: 'steel', color: C.bridgeSteel });
      panel(sim, { x: bx, y: 1, z, w: 1, h: 0.75, axis: 'z', t: 0.25, mat: 'steel', color: C.railIron });
      panel(sim, { x: bx + bw - 0.25, y: 1, z, w: 1, h: 0.75, axis: 'z', t: 0.25, mat: 'steel', color: C.railIron });
      if ((z + 99) % 3 === 0) {
        pier(sim, { x: bx + 0.25, y: 0, z, w: 1, h: 0.5, d: 1, mat: 'concrete', color: C.granite });
        pier(sim, { x: bx + bw - 1.25, y: 0, z, w: 1, h: 0.5, d: 1, mat: 'concrete', color: C.granite });
      }
    }
    // Approach ramps onto both banks.
    plinth(sim, { x: bx, z: -87, w: bw, d: 1, h: 0.5, mat: 'concrete', color: C.granite });
    plinth(sim, { x: bx, z: -100, w: bw, d: 1, h: 0.5, mat: 'concrete', color: C.granite });
    // Four tender houses per crossing, standing on the bank walks.
    for (const [hx, hz] of [[bx - 2.25, -86], [bx + bw + 0.5, -86], [bx - 2.25, -102], [bx + bw + 0.5, -102]]) {
      plinth(sim, { x: hx, z: hz, w: 1.75, d: 1.75, h: 2.5, mat: 'concrete', color: C.tender });
      wedge(sim, { x: hx, y: 2.5, z: hz, w: 1.75, d: 1.75, h: 0.75, axis: 'x', from: 'center', mat: 'panel', color: C.tenderRoof });
    }
  }
}

// --------------------------------------------------------- the north bank ---
// Tone index per facet, solved so every mirror pair of the 12-gon (same row
// on either axis) and every neighbouring pair draws a different tone.
const RING_IDX = [0, 1, 2, 3, 4, 3, 1, 0, 2, 0, 4, 2];

function marinaTower(sim, x, z, roof) {
  // A corncob is a stack of short drums: honest stepped cylinders, parking
  // spiral below, petal floors above, capped so the chase cam never sees a
  // hollow tube.
  const r = 6, facets = 12, t = 0.5;
  for (let k = 0; k < 15; k++) {
    // Four tones cycling around the ring: neighbours AND opposite facets
    // always differ, which reads as the corncob's fluting and keeps
    // probePlacementStep's identical-box rule off the drum's parallel chords.
    const ring = k < 5
      ? [C.marinaBase, C.marinaBaseAlt, 0x908a80, 0xa19a8e, 0x9a948a]
      : [C.marina, C.marinaDeep, 0x99948a, 0xa8a399, 0xa39e94];
    // A local drum (voxelforms' drum emits full-height facets; we want lifts).
    const chord = Math.max(0.25, Math.round((2 * r * Math.sin(Math.PI / facets)) / 0.25) * 0.25);
    for (let i = 0; i < facets; i++) {
      const a = (2 * Math.PI * i) / facets;
      const ca = Math.cos(a), sa = Math.sin(a);
      const radial = Math.abs(ca) >= Math.abs(sa) ? 'z' : 'x';
      const px = x + r + ca * (r - t / 2), pz = z + r + sa * (r - t / 2);
      panel(sim, {
        x: Math.round((px - (radial === 'z' ? t / 2 : chord / 2)) * 4) / 4,
        y: k * 2,
        z: Math.round((pz - (radial === 'z' ? chord / 2 : t / 2)) * 4) / 4,
        w: chord, h: 2, axis: radial, t, mat: 'concrete', color: ring[RING_IDX[i]],
      });
    }
  }
  slab(sim, { x, y: 30, z, w: 12, d: 12, t: 0.5, mat: 'concrete', color: roof });
}

function buildNorthBank(sim) {
  shellTower(sim, { x: -98, z: -113, w: 12, d: 12, h: 26, color: 0x8b8377, alt: 0x827a6d, roof: 0x6e675c });
  shellTower(sim, { x: -50, z: -113, w: 16, d: 12, h: 36, color: C.mies, alt: C.miesAlt, roof: 0x272d33 }); // the Mies slab
  marinaTower(sim, -28, -114, 0x8a857b);
  marinaTower(sim, -11, -114, 0x868177);
  // Wrigley: white terracotta mass + clock turret and lantern.
  const wr = shellTower(sim, { x: 42, z: -114, w: 10, d: 12, h: 18, color: C.wrigley, alt: 0xc9c5b6, roof: 0xb5b1a3 });
  const wt = shellTower(sim, { x: 44, z: -110, w: 6, d: 6, h: 12, y0: wr.top, color: C.wrigley, roof: 0xb5b1a3 });
  towerCrown(sim, { ox: 44, oz: -110, w: 6, d: 6, y: wt.top, style: 'lantern', color: C.wrigley, accent: C.wrigleyTrim });
  // Tribune: masonry shaft with a ring of gothic pinnacles.
  const trib = shellTower(sim, { x: 64, z: -114, w: 12, d: 12, h: 30, color: C.tribune, alt: C.tribuneDeep, roof: 0x9d968a });
  for (const [px, pz] of [[64, -114], [69.75, -114], [75.5, -114], [64, -108.25], [75.5, -108.25], [64, -102.5], [69.75, -102.5], [75.5, -102.5]]) {
    column(sim, { x: px, y: trib.top, z: pz, h: 3, s: 0.5, mat: 'concrete', color: C.tribune });
  }
  plinth(sim, { x: 68, y: trib.top, z: -110.25, w: 4, d: 4, h: 2, mat: 'concrete', color: C.tribuneDeep });
  shellTower(sim, { x: 84, z: -113, w: 14, d: 12, h: 24, color: 0x9fa8ae, alt: 0x96a0a6, roof: 0x87909a });
  // Pocket-park furniture between Marina City and Wrigley.
  for (const [tx, tz] of [[10, -110], [18, -108], [26, -111], [33, -107]]) tree(sim, tx, tz);
  for (const [bx, bz] of [[13, -106.5], [29, -106.5]]) bench(sim, bx, bz);
  lampPost(sim, 21, -105.5);
  // Michigan-north walks.
  for (const z of [-113, -107]) { lampPost(sim, 52.75, z); lampPost(sim, 63.25, z); }
}

// -------------------------------------------------------------- the Loop ----
function buildWillis(sim) {
  const cols = [-86, -80, -74], rows = [36.5, 42.5, 48.5];
  const heights = [[48, 48, 62], [48, 62, 76], [62, 76, 88]];
  for (let rz = 0; rz < 3; rz++) {
    for (let cx = 0; cx < 3; cx++) {
      const h = heights[rz][cx];
      // topColor is the crown band -- the hero key, nowhere else on the map.
      shellTower(sim, {
        x: cols[cx], z: rows[rz], w: 6, d: 6, h,
        color: C.willis, alt: C.willisAlt, band: 8, roof: C.willis, topColor: C.willisCrown,
      });
    }
  }
  // The two antennas grow off the tallest tubes' roof plates.
  column(sim, { x: -73, y: 88.5, z: 49.5, h: 12, s: 0.5, mat: 'steel', color: C.willisCrown });
  column(sim, { x: -69.5, y: 88.5, z: 53, h: 9, s: 0.5, mat: 'steel', color: C.willisCrown });
  // Wacker lobby: glassy skin along the Van Buren face the tour walks.
  streetFace(sim, {
    u0: -85.5, len: 17, face: 54.5, axis: 'x', out: 1, storeys: 1,
    glassA: C.willisGlass, glassB: C.glassB, spanA: 0x3a444d, spanB: 0x333d46, pierC: C.mull,
  });
}

function buildBoardOfTrade(sim) {
  const bot = masonryTower(sim, {
    x: -35.5, tiers: [
      { z: 65, w: 18, d: 16, h: 12 },
      { z: 65, w: 12, d: 12, h: 10, inset: 3 },
      { z: 65, w: 6, d: 8, h: 8, inset: 3 },
    ],
    color: C.botStone, alt: C.botDeep, trim: C.botDeep, roof: C.botRoof,
  });
  // The pyramid and Ceres stand on the top tier's cap plate.
  wedge(sim, { x: -29, y: bot.top, z: 71.5, w: 5, d: 5, h: 4, axis: 'x', from: 'center', mat: 'concrete', color: C.botRoof });
  column(sim, { x: -26.75, y: bot.top + 4, z: 73.75, h: 2.5, s: 0.75, mat: 'steel', color: C.ceres });
  sim._block(-26.75, bot.top + 6.5, 73.75, 'steel', 0.75, C.ceres);
  // The LaSalle-vista forecourt: a bollard line in the clear band between
  // the south el posts (to z 64.25) and the Board's own face (z 65).
  for (let fx = -34; fx <= -20; fx += 3.5) bollard(sim, fx, 64.6, 0x3a4450);
}

function buildTheatre(sim) {
  shellTower(sim, { x: 7, z: -74, w: 14, d: 16, h: 24, color: C.theatreBrick, alt: C.theatreDeep, roof: 0x6f6a63 });
  corniceRing(sim, { x: 7, z: -74, w: 14, d: 16, y: 23.5, color: C.limestone });
  // Marquee + the vertical CHICAGO blade, on the State-facing south front.
  marqueeSign(sim, {
    x: 8, z: -59, w: 12, dir: 1, y: 3.5, depth: 0.5,
    board: C.marqueeRed, bulbs: C.bulbs, blade: C.theatreGold,
    bladeX: 9, bladeH: 11, bladeW: 1.5,
    text: 'CHICAGO', textColor: C.marqueeText, textScale: 1,
  });
  // Storefront bays either side of the marquee, facing the State St walk.
  streetFace(sim, {
    u0: -74, len: 13, face: 7, axis: 'z', out: -1, storeys: 1,
    awn: C.awnRed, spanA: C.theatreDeep, spanB: C.brickDeep,
  });
}

function buildLoopBlocks(sim) {
  // West row (Wacker South to Wells).
  shellTower(sim, { x: -90, z: -75, w: 16, d: 16, h: 44, color: 0x53616b, alt: 0x4a5862, roof: 0x47525a });
  masonryTower(sim, { x: -72, tiers: [{ z: -74, w: 12, d: 14, h: 22 }, { z: -74, w: 8, d: 10, h: 8, inset: 2 }], color: C.limestone, alt: C.limeDeep, trim: C.limeDeep, roof: 0x8c8578 });
  shellTower(sim, { x: -90, z: -47, w: 16, d: 16, h: 36, color: 0x5d6b74, alt: 0x54626b, roof: 0x4c5860 });
  shellTower(sim, { x: -72, z: -46, w: 12, d: 14, h: 24, color: C.brick, alt: C.brickDeep, roof: 0x6f6a63 });
  corniceRing(sim, { x: -72, z: -46, w: 12, d: 14, y: 23.5, color: C.limestone });
  streetFace(sim, { u0: -45, len: 13, face: -60, axis: 'z', out: 1, storeys: 2, awn: C.awnGreen });
  shellTower(sim, { x: -91, z: -19, w: 18, d: 16, h: 28, color: 0xa8a08f, alt: 0x9e9685, roof: 0x8c8578 });
  shellTower(sim, { x: -71, z: -18, w: 10, d: 14, h: 40, color: 0x47555f, alt: 0x3e4c56, roof: 0x3a444c });
  streetFace(sim, { u0: -17, len: 13, face: -61, axis: 'z', out: 1, storeys: 2, glassA: C.glassA, glassB: C.glassB });
  masonryTower(sim, { x: -90, tiers: [{ z: 9, w: 16, d: 16, h: 24 }, { z: 9, w: 12, d: 12, h: 8, inset: 2 }], color: 0x9b9383, alt: 0x928a7a, trim: 0x8a8272, roof: 0x7d7668 });
  shellTower(sim, { x: -70, z: 9, w: 8, d: 16, h: 52, color: 0x2f3a42, alt: 0x354048, roof: 0x2b343b });
  streetFace(sim, { u0: 9.5, len: 15, face: -62, axis: 'z', out: 1, storeys: 2, glassA: C.glassA, glassB: C.glassB });
  buildWillis(sim);
  shellTower(sim, { x: -66, z: 38, w: 5.5, d: 14, h: 12, color: 0x8f8b83, alt: 0x86827a, roof: 0x7a766e });
  shellTower(sim, { x: -91, z: 65, w: 18, d: 16, h: 30, color: 0x56646d, alt: 0x4d5b64, roof: 0x49545c });
  masonryTower(sim, { x: -70, tiers: [{ z: 66, w: 10, d: 16, h: 22 }], color: 0xb0a896, alt: 0xa79f8d, trim: 0x9e9684, roof: 0x8c8578 });

  // Wells-LaSalle blocks.
  shellTower(sim, { x: -49, z: -75, w: 18, d: 16, h: 34, color: 0x5b6a74, alt: 0x526169, roof: 0x4a5860 });
  shellTower(sim, { x: -49, z: -47, w: 14, d: 16, h: 26, color: 0x76848d, alt: 0x6d7b84, roof: 0x66737b });
  masonryTower(sim, { x: -49, tiers: [{ z: -19, w: 18, d: 16, h: 26 }, { z: -19, w: 14, d: 12, h: 10, inset: 2 }], color: C.limestone, alt: C.limeDeep, trim: C.limeDeep, roof: 0x8c8578 });
  masonryTower(sim, { x: -49, tiers: [{ z: 9, w: 18, d: 16, h: 34 }], color: 0xbab2a0, alt: 0xafa792, trim: 0xa59d8a, roof: 0x938c7c });
  // The Rookery: dark red masonry, its Van Buren storefronts on the tour line.
  masonryTower(sim, { x: -49, tiers: [{ z: 37, w: 16, d: 16, h: 22 }], color: 0x7e4034, alt: 0x744040, trim: C.bronze, roof: 0x6a655c });
  streetFace(sim, { u0: -48.5, len: 15, face: 53, axis: 'x', out: 1, storeys: 1, awn: C.awnBlue, spanA: 0x6f3a30, spanB: 0x653a36 });
  shellTower(sim, { x: -49, z: 66, w: 8, d: 14, h: 16, color: 0x8b9198, alt: 0x828890, roof: 0x787e86 });

  // LaSalle-State blocks.
  shellTower(sim, { x: -21, z: -75, w: 16, d: 16, h: 28, color: 0x9c9484, alt: 0x938b7b, roof: 0x86806f });
  // Reliance-style white terracotta, set back off State for the L stair.
  masonryTower(sim, { x: -21, tiers: [{ z: -47, w: 12, d: 16, h: 30 }], color: C.terraWhite, alt: C.terraDeep, trim: C.terraDeep, roof: 0xa9a496 });
  masonryTower(sim, { x: -21, tiers: [{ z: -19, w: 16, d: 16, h: 30 }, { z: -19, w: 12, d: 12, h: 10, inset: 2 }], color: 0xbab2a0, alt: 0xafa792, trim: 0xa59d8a, roof: 0x938c7c });
  shellTower(sim, { x: -21, z: 9, w: 16, d: 16, h: 36, color: 0x8f9ba3, alt: 0x86929a, roof: 0x7c878f });
  // The Monadnock: tall, dark, austere — the flared base reads through its
  // deep bottom band rather than a monolithic plinth (a 9 x 17 m plinth is
  // permanently uneatable past the 8 m grade diagonal).
  shellTower(sim, { x: -21, z: 37, w: 8, d: 16, h: 26, color: C.monadnock, alt: C.monadDeep, roof: 0x453631 });
  streetFace(sim, { u0: -20.5, len: 15, face: 53, axis: 'x', out: 1, storeys: 1, spanA: C.monadDeep, spanB: 0x443530 });

  // State-Wabash blocks.
  buildTheatre(sim);
  // The big State Street store: deep masonry block, storefronts on State.
  masonryTower(sim, { x: 6.5, tiers: [{ z: -47, w: 18, d: 16, h: 26 }], color: 0x9d968a, alt: 0x948d80, trim: C.limeDeep, roof: 0x877f6f });
  streetFace(sim, { u0: -46.5, len: 15, face: 6.5, axis: 'z', out: -1, storeys: 2, awn: C.awnGreen });
  masonryTower(sim, { x: 6.5, tiers: [{ z: -19, w: 18, d: 16, h: 30 }], color: 0x8a7a68, alt: 0x817159, trim: 0x776850, roof: 0x6d5f4b });
  streetFace(sim, { u0: -18.5, len: 15, face: 6.5, axis: 'z', out: -1, storeys: 2, awn: C.awnBlue });
  // Sullivan Center: dark bronze mass over an ornate base.
  shellTower(sim, { x: 6.5, z: 9, w: 18, d: 16, h: 20, color: 0x4a4038, alt: 0x413830, roof: 0x393129 });
  streetFace(sim, { u0: 9.5, len: 15, face: 6.5, axis: 'z', out: -1, storeys: 2, pierC: 0x6b5a4a, spanA: 0x5c4d3f, spanB: 0x52453a });
  shellTower(sim, { x: 6.5, z: 37, w: 18, d: 16, h: 32, color: 0x5a6871, alt: 0x51606a, roof: 0x4a575f });
  streetFace(sim, { u0: 7.5, len: 15, face: 53, axis: 'x', out: 1, storeys: 1, glassA: C.glassA, glassB: C.glassB });

  buildBoardOfTrade(sim);
  // Harold Washington Library: red brick, patina roof, corner acroteria.
  shellTower(sim, { x: 6.5, z: 66, w: 18, d: 16, h: 20, color: C.hwl, alt: C.hwlDeep, roof: C.patina });
  corniceRing(sim, { x: 6.5, z: 66, w: 18, d: 16, y: 19.5, color: C.patina });
  for (const [ax, az] of [[6.5, 66], [23, 66], [6.5, 80.5], [23, 80.5]]) {
    plinth(sim, { x: ax, y: 20.5, z: az, w: 1.5, d: 1.5, h: 2, mat: 'panel', color: C.patina });
  }

  // Michigan Avenue street wall.
  const carb = shellTower(sim, { x: 34.5, z: -75, w: 18, d: 16, h: 40, color: C.carbide, alt: C.carbideAlt, roof: C.carbide });
  shellTower(sim, { x: 40.5, z: -70, w: 6, d: 6, h: 6, y0: carb.top, color: C.brass, roof: C.brass }); // the brass cap
  masonryTower(sim, { x: 34.5, tiers: [{ z: -47, w: 18, d: 16, h: 16 }], color: C.limestone, alt: C.limeDeep, trim: C.limeDeep, roof: 0x8c8578 });
  shellTower(sim, { x: 38, z: -15.5, w: 14, d: 14, h: 28, color: 0x9aa4aa, alt: 0x91999f, roof: 0x878f95 });
  masonryTower(sim, { x: 34.5, tiers: [{ z: 9, w: 18, d: 16, h: 24 }], color: 0xb0a89a, alt: 0xa79f8f, trim: 0x9d9583, roof: 0x8c8578 });
  shellTower(sim, { x: 34.5, z: 37, w: 18, d: 16, h: 30, color: 0x6f7d86, alt: 0x66747d, roof: 0x5e6b73 });
  shellTower(sim, { x: 35, z: 66, w: 16, d: 16, h: 34, color: C.cna, alt: C.cnaDeep, roof: 0x7c332b });
  // East of Michigan, north of the park: the Prudential/Aon pair closing the
  // park's north edge.
  shellTower(sim, { x: 66, z: -75, w: 12, d: 14, h: 44, color: 0x9a9484, alt: 0x918b7b, roof: 0x847e6f });
  shellTower(sim, { x: 84, z: -74, w: 10, d: 12, h: 48, color: 0xaeb2ae, alt: 0xa5a9a5, roof: 0x9a9e9a });
}

// ------------------------------------------------------------------ the L ---
// Section: posts to y5, crossheads 5-5.5 (corners 5-6), girders 5.5-6, deck
// 6-6.5, parapet/sleepers above, railhead at 6.75-7. The mover rides y7.
const EL = { w: 9.5, postY: 5 };
const EL_TILE = [[0, 2.5], [2.5, 2.25], [4.75, 2.25], [7, 2.5]];
const EL_GIRDER = [0.75, 4.5, 8.25];
const EL_TRACK = [1.25, 6.0];
const EL_RAIL = [1.75, 2.75, 6.5, 7.5];

function elPost(sim, x, z, corner = false) {
  for (const y of [0, 2.5]) {
    const c = corner ? (y ? 0x52453b : 0x4a3e34) : (y ? C.elSteel : C.elDeep);
    pier(sim, { x, y, z, w: 1.25, h: 2.5, d: 1.25, mat: 'steel', color: c });
  }
}

// One bent: posts at both deck edges + a crosshead across the section.
function elBent(sim, axis, cMin, u) {
  if (axis === 'x') {
    elPost(sim, u, cMin); elPost(sim, u, cMin + EL.w - 1.25);
    beam(sim, { x: u, y: EL.postY, z: cMin, len: EL.w, axis: 'z', t: 0.5, depth: 1.25, mat: 'steel', color: C.elSteel });
  } else {
    elPost(sim, cMin, u); elPost(sim, cMin + EL.w - 1.25, u);
    beam(sim, { x: cMin, y: EL.postY, z: u, len: EL.w, axis: 'x', t: 0.5, depth: 1.25, mat: 'steel', color: C.elSteel });
  }
}

// A straight leg between two corner squares. `axis` is the RUN axis, `cMin`
// the deck's min cross coordinate, blocked = carriageway intervals no ground
// post may enter, gaps = parapet openings (per edge) for the platforms.
function elLeg(sim, { axis, cMin, u0, u1, blocked, gapMin = null, gapMax = null }) {
  const B = (u, len, y, t, depth, color, mat = 'steel') => (axis === 'x'
    ? beam(sim, { x: u, y, z: 0, len, axis: 'x', t, depth, mat, color }) : null);
  void B;
  const put = (u, cOff, y, du, dc, t, mat, color) => (axis === 'x'
    ? sim._block(u, y, cMin + cOff, mat, [du, t, dc], color)
    : sim._block(cMin + cOff, y, u, mat, [dc, t, du], color));

  // Bents: 6 m pitch, shifted off carriageways, anchored near both ends.
  const bents = [];
  let u = u0 + 0.5;
  while (u + 1.25 <= u1 - 0.25) {
    const hit = blocked.find((b) => u + 1.25 > b[0] && u < b[1]);
    if (hit) {
      const pre = hit[0] - 1.75;
      if (bents.length === 0 || pre > bents[bents.length - 1] + 1.5) bents.push(pre);
      u = hit[1] + 0.25;
      continue;
    }
    bents.push(u);
    u += 6;
  }
  if (u1 - 0.5 - (bents[bents.length - 1] + 1.25) > 1.5) bents.push(u1 - 1.75);
  for (const bu of bents) elBent(sim, axis, cMin, bu);

  // Girders as marker segments: piece i runs from just past crosshead i-1 to
  // the far edge of crosshead i (the last piece carries on to the corner
  // square), so every piece OVERLAPS exactly one crosshead -- anchored, never
  // doubled. The first cut overlapped adjacent pieces on every crosshead and
  // shipped a row of ghost girders that rained at spawn.
  for (let i = 0; i < bents.length; i++) {
    const g0 = i === 0 ? u0 : bents[i - 1] + 1.25;
    const g1 = i === bents.length - 1 ? u1 : bents[i] + 1.25;
    for (const off of EL_GIRDER) put(g0, off, 5.5, g1 - g0, 0.5, 0.5, 'steel', C.elDeep);
  }
  // Deck tiles, four strips per 0.5 m row.
  for (let du = u0; du < u1 - 0.01; du += 0.5) {
    for (const [off, w] of EL_TILE) put(du, off, 6, 0.5, w, 0.5, 'concrete', C.elDeck);
  }
  // Parapets (1 m panels), broken where a platform hangs on.
  for (let du = u0; du < u1 - 0.01; du += 1) {
    const len = Math.min(1, u1 - du);
    for (const [edge, off] of [[0, 0], [1, EL.w - 0.25]]) {
      const gap = edge === 0 ? gapMin : gapMax;
      if (gap && du + len > gap[0] && du < gap[1]) continue;
      put(du, off, 6.5, len, 0.25, 0.75, 'concrete', C.parapet);
    }
  }
  // Sleepers (1 m pitch) and railheads (3 m sticks).
  for (let du = u0 + 0.25; du < u1 - 0.3; du += 1) {
    for (const off of EL_TRACK) put(du, off, 6.5, 0.25, 2.25, 0.25, 'wood', C.sleeper);
  }
  for (let du = u0; du < u1 - 0.01; du += 3) {
    const len = Math.min(3, u1 - du);
    for (const off of EL_RAIL) put(du, off, 6.75, len, 0.25, 0.25, 'steel', C.elRail);
  }
}

// A corner square: four posts on the four sidewalk corners of the junction,
// two deep crossheads, one-piece deck rows, a ballast mat, and stepped-arc
// special work joining both tracks around the turn.
function elCorner(sim, x0, z0, px, pz, outerEdges) {
  for (const [dx, dz] of [[0, 0], [8.25, 0], [0, 8.25], [8.25, 8.25]]) elPost(sim, x0 + dx, z0 + dz, true);
  for (const dz of [0, 8.25]) {
    beam(sim, { x: x0, y: 5, z: z0 + dz, len: EL.w, axis: 'x', t: 1, depth: 1.25, mat: 'steel', color: C.elSteel });
  }
  for (let u = 0; u < EL.w - 0.01; u += 0.5) {
    slab(sim, { x: x0 + u, y: 6, z: z0, w: 0.5, d: EL.w, t: 0.5, mat: 'steel', color: C.elDeck });
  }
  for (const [ux, uw] of EL_TILE) {
    for (const [vz, vd] of EL_TILE) {
      slab(sim, { x: x0 + ux, y: 6.5, z: z0 + vz, w: uw, d: vd, t: 0.25, mat: 'concrete', color: 0x655f57 });
    }
  }
  // Parapets on the two outer edges (the inner edges belong to the arcs).
  for (const edge of outerEdges) {
    if (edge === 'w') for (let v = 0; v < EL.w - 0.01; v += 1) panel(sim, { x: x0, y: 6.75, z: z0 + v, w: Math.min(1, EL.w - v), h: 0.5, axis: 'z', t: 0.25, mat: 'concrete', color: C.parapet });
    if (edge === 'e') for (let v = 0; v < EL.w - 0.01; v += 1) panel(sim, { x: x0 + EL.w - 0.25, y: 6.75, z: z0 + v, w: Math.min(1, EL.w - v), h: 0.5, axis: 'z', t: 0.25, mat: 'concrete', color: C.parapet });
    if (edge === 'n') for (let u = 0.5; u < EL.w - 0.26; u += 1) panel(sim, { x: x0 + u, y: 6.75, z: z0, w: Math.min(1, EL.w - 0.25 - u), h: 0.5, axis: 'x', t: 0.25, mat: 'concrete', color: C.parapet });
    if (edge === 's') for (let u = 0.5; u < EL.w - 0.26; u += 1) panel(sim, { x: x0 + u, y: 6.75, z: z0 + EL.w - 0.25, w: Math.min(1, EL.w - 0.25 - u), h: 0.5, axis: 'x', t: 0.25, mat: 'concrete', color: C.parapet });
  }
  // Stepped quarter-arcs for both tracks (radii off the pivot corner).
  const sx = px > x0 + 4.75 ? -1 : 1;
  const sz = pz > z0 + 4.75 ? -1 : 1;
  for (const r of [2, 3, 6.75, 7.75]) {
    const N = r < 5 ? 3 : 5;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI / 2;
      const ux = Math.round((px + sx * r * Math.cos(th)) * 4) / 4;
      const vz = Math.round((pz + sz * r * Math.sin(th)) * 4) / 4;
      if (prev) {
        const zlo = Math.min(vz, prev.z), zhi = Math.max(vz, prev.z);
        if (zhi - zlo > 0.25) {
          beam(sim, { x: prev.x, y: 6.75, z: zlo + 0.25, len: zhi - zlo - 0.25, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.elRail });
        }
        const xlo = Math.min(ux, prev.x), xhi = Math.max(ux, prev.x);
        if (xhi - xlo > 0.01) {
          beam(sim, { x: xlo, y: 6.75, z: vz, len: xhi - xlo, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.elRail });
        }
      }
      prev = { x: ux, z: vz };
    }
  }
}

// A cantilevered side platform hung off the deck edge: brackets reach out at
// girder level, the platform rides them, tactile strip on the track side,
// railing outside, a canopy, and a solid stair to the sidewalk.
function elPlatform(sim, o) {
  const { axis, attach, out, u0, u1 } = o;
  const c0 = out < 0 ? attach - 2.5 : attach;
  const put = (u, cOff, y, du, dc, t, mat, color) => (axis === 'x'
    ? sim._block(u, y, c0 + cOff, mat, [du, t, dc], color)
    : sim._block(c0 + cOff, y, u, mat, [dc, t, du], color));
  // Brackets every 3 m plus one at the far end.
  const bs = [];
  for (let u = u0; u <= u1 - 0.5; u += 3) bs.push(u);
  if (u1 - 0.5 - bs[bs.length - 1] > 1) bs.push(u1 - 0.5);
  for (const bu of bs) put(bu, 0, 6, 0.5, 2.5, 0.5, 'steel', C.elSteel);
  for (let u = u0; u < u1 - 0.01; u += 0.5) put(u, 0, 6.5, 0.5, 2.5, 0.5, 'concrete', C.platform);
  // Tactile strip along the track side, railing along the street side.
  const inOff = out < 0 ? 2.25 : 0;
  const railOff = out < 0 ? 0 : 2.25;
  for (let u = u0; u < u1 - 0.01; u += 1) {
    const len = Math.min(1, u1 - u);
    put(u, inOff, 7, len, 0.25, 0.25, 'concrete', C.tactile);
    put(u, railOff, 7, len, 0.25, 1, 'steel', C.railIron);
  }
  // Canopy down the platform centre.
  const mid = 1.125;
  for (let u = u0 + 2; u < u1 - 1.5; u += 4) {
    put(u, mid, 7, 0.25, 0.25, 2.5, 'steel', C.canopy);
  }
  for (let u = u0; u < u1 - 0.01; u += 4) {
    const len = Math.min(4, u1 - u);
    put(u, mid, 9.5, len, 0.25, 0.25, 'steel', C.canopy);
    put(u, 0, 9.75, len, 2.5, 0.25, 'steel', C.canopyRoof);
  }
}

function elStair(sim, { axis, x, z, dir, w = 2 }) {
  // A solid stair: each step is its own grade-anchored mass, so the flight
  // can never hang. 13 steps of 0.5 m drop the 6.5 m to the walk.
  for (let i = 0; i < 13; i++) {
    const h = 6 - i * 0.5 + 0.5;
    const u = i * 0.5;
    if (axis === 'x') plinth(sim, { x: x + (dir > 0 ? u : -u - 0.5), z, w: 0.5, d: w, h, mat: 'concrete', color: i % 2 ? C.elDeck : 0x65605a });
    else plinth(sim, { x, z: z + (dir > 0 ? u : -u - 0.5), w, d: 0.5, h, mat: 'concrete', color: i % 2 ? C.elDeck : 0x65605a });
  }
}

function buildEl(sim) {
  const NS_BLOCK = [[-28.5, -20.5], [-0.5, 7.5], [27.5, 35.5]];  // Washington, Monroe, Adams
  const EW_BLOCK = [[-30.5, -22.5], [-2.5, 5.5]];                // LaSalle, State
  // Legs (deck cross mins: Wells -59.25, Wabash 24.75, Lake -57.25, VB 54.75).
  elLeg(sim, { axis: 'z', cMin: -59.25, u0: -47.75, u1: 54.75, blocked: NS_BLOCK, gapMin: [-1.25, 8.25] });    // Wells
  elLeg(sim, { axis: 'z', cMin: 24.75, u0: -47.75, u1: 54.75, blocked: NS_BLOCK, gapMax: [-28.75, -19.5] });   // Wabash
  elLeg(sim, { axis: 'x', cMin: -57.25, u0: -49.75, u1: 24.75, blocked: EW_BLOCK, gapMax: [-6.25, 6.25] });    // Lake
  elLeg(sim, { axis: 'x', cMin: 54.75, u0: -49.75, u1: 24.75, blocked: EW_BLOCK });                            // Van Buren
  // Corners, with the pivot on the loop-interior corner of each square.
  elCorner(sim, -59.25, -57.25, -49.75, -47.75, ['w', 'n']);  // Wells/Lake
  elCorner(sim, 24.75, -57.25, 24.75, -47.75, ['e', 'n']);    // Wabash/Lake
  elCorner(sim, 24.75, 54.75, 24.75, 54.75, ['e', 's']);      // Wabash/Van Buren
  elCorner(sim, -59.25, 54.75, -49.75, 54.75, ['w', 's']);    // Wells/Van Buren
  // Stations.
  elPlatform(sim, { axis: 'x', attach: -47.75, out: 1, u0: -6, u1: 6 });        // State/Lake
  elStair(sim, { axis: 'z', x: -6, z: -45.25, dir: 1 });
  elPlatform(sim, { axis: 'z', attach: 34.25, out: 1, u0: -28.5, u1: -19.75 }); // Washington/Wabash
  elStair(sim, { axis: 'z', x: 34.5, z: -19.75, dir: 1 });
  elPlatform(sim, { axis: 'z', attach: -59.25, out: -1, u0: -1, u1: 8 });       // Quincy
  elStair(sim, { axis: 'z', x: -61.75, z: 8.25, dir: 1 });
}

// -------------------------------------------------------- Millennium Park ---
function buildCloudGate(sim) {
  // The Bean: a corbelled chrome loaf with the walk-under arch in its middle.
  // Each z-slice is side pads reaching inward, then two one-piece spans.
  for (let i = 0; i < 6; i++) {
    const z = -18 + i * 2.75;
    const d = 2.75;
    const end = i === 0 || i === 5;
    if (end) {
      plinth(sim, { x: 72, z, w: 6, d, h: 2.5, mat: 'steel', color: C.bean });
      plinth(sim, { x: 78, z, w: 6, d, h: 2.5, mat: 'steel', color: C.bean });
      plinth(sim, { x: 73.5, y: 2.5, z, w: 9, d, h: 1.5, mat: 'steel', color: C.bean });
    } else {
      plinth(sim, { x: 71, z, w: 4.5, d, h: 1.25, mat: 'steel', color: C.bean });
      plinth(sim, { x: 80.5, z, w: 4.5, d, h: 1.25, mat: 'steel', color: 0xc5ced4 });
      plinth(sim, { x: 71.5, y: 1.25, z, w: 5.5, d, h: 1.25, mat: 'steel', color: C.bean });
      plinth(sim, { x: 79, y: 1.25, z, w: 5.5, d, h: 1.25, mat: 'steel', color: 0xc5ced4 });
      plinth(sim, { x: 72, y: 2.5, z, w: 12, d, h: 1.25, mat: 'steel', color: C.beanShadow });
      plinth(sim, { x: 73.5, y: 3.75, z, w: 9, d, h: 1, mat: 'steel', color: C.bean });
    }
  }
}

function buildCrownFountain(sim) {
  for (const z of [-37, -29]) {
    for (let y = 0; y < 7; y += 1) {
      beam(sim, { x: 64.5, y, z, len: 3, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.mull });
      beam(sim, { x: 64.5, y, z: z + 2.75, len: 3, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.mull });
      beam(sim, { x: 64.5, y, z: z + 0.25, len: 2.5, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.mull });
      beam(sim, { x: 67.25, y, z: z + 0.25, len: 2.5, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.mull });
      if (y < 6.5) {
        const tint = y % 2 ? 0x557084 : C.fountain;
        panel(sim, { x: 64.5, y: y + 0.25, z, w: 3, h: 0.75, axis: 'x', t: 0.25, mat: 'panel', color: tint });
        panel(sim, { x: 64.5, y: y + 0.25, z: z + 2.75, w: 3, h: 0.75, axis: 'x', t: 0.25, mat: 'panel', color: tint });
      }
    }
  }
}

function buildPritzker(sim) {
  // Headwall + stepped petal fans, and the lawn trellis the tour walks under.
  shellTower(sim, { x: 90, z: 8, w: 12, d: 10, h: 10, color: 0x9ba3a9, alt: 0x8f979d, roof: C.stage });
  for (const [wx, ww, wh, pc] of [[90.5, 3.5, 3, C.petals], [94.75, 3.5, 4, 0xa2aab0], [99, 2.75, 3, C.petals]]) {
    wedge(sim, { x: wx, y: 10.5, z: 10, w: ww, d: 4, h: wh, axis: 'x', from: 'max', mat: 'panel', color: pc });
  }
  for (const cx of [66, 76, 86]) {
    for (const cz of [10, 21, 32]) {
      column(sim, { x: cx, y: 0, z: cz, h: 7, s: 0.5, mat: 'steel', color: C.trellis });
    }
  }
  for (const cz of [10, 21, 32]) {
    beam(sim, { x: 66, y: 7, z: cz, len: 20.5, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.trellis });
  }
  for (const cx of [66, 76, 86]) {
    beam(sim, { x: cx, y: 7.25, z: 10, len: 22.5, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.trellis });
  }
}

function buildMillennium(sim) {
  buildCloudGate(sim);
  buildCrownFountain(sim);
  buildPritzker(sim);
  // The park ground: tree rows, benches, hedges, path furniture.
  for (const x of [66, 75, 84, 93, 102]) { tree(sim, x, 38); tree(sim, x + 4, 50); }
  for (const z of [40, 46, 52]) bench(sim, 71, z);
  for (const z of [42, 48]) bench(sim, 88, z);
  for (const [px, pz] of [[66, -42], [80, -42], [94, -40], [98, -20], [98, 0]]) tree(sim, px, pz);
  for (const [hx, hz] of [[65, -14], [65, -2], [88, -14], [88, -2]]) planter(sim, hx, hz, 2, 1.25, 0x5d5546);
  for (const [lx, lz] of [[68, -24], [84, -24], [68, 2], [92, 2], [74, 36], [90, 36]]) lampPost(sim, lx, lz);
  bench(sim, 70, -22); bench(sim, 84, -22); bench(sim, 66, 4);
  // Michigan-edge park fence posts (west edge, along the tour's walk).
  for (let z = -44; z < 56; z += 4) bollard(sim, 62.4, z + 0.5, 0x37503f);
  for (const z of [-44, -20, -4, 12, 28, 44]) tree(sim, 64.5, z);
}

// --------------------------------------------------------- street ground ----
// Kerbs derived from the street table: 6 m granite runs along both edges of
// every non-el street, stopped at every crossing carriageway. The el streets
// get no kerb line — their post rows articulate the edge instead.
function buildKerbs(sim) {
  const EL_IDS = new Set(['wells_st', 'wabash_ave', 'lake_st', 'van_buren_st']);
  const others = (s) => CHICAGO_STREETS.filter((o) => o !== s);
  for (const s of CHICAGO_STREETS) {
    if (EL_IDS.has(s.id)) continue;
    const lo = s.axis === 'x' ? s.x : s.z;
    const hi = lo + (s.axis === 'x' ? s.w : s.d);
    const crossCuts = others(s)
      .filter((o) => o.axis !== s.axis)
      .map((o) => (s.axis === 'x' ? [o.x - 0.5, o.x + o.w + 0.5] : [o.z - 0.5, o.z + o.d + 0.5]));
    const edges = s.axis === 'x' ? [s.z - 0.25, s.z + s.d] : [s.x - 0.25, s.x + s.w];
    for (const e of edges) {
      let u = lo;
      while (u < hi - 0.01) {
        const cut = crossCuts.find((c) => u >= c[0] && u < c[1]);
        if (cut) { u = cut[1]; continue; }
        const next = Math.min(hi, u + 6, ...crossCuts.filter((c) => c[0] > u).map((c) => c[0]));
        const len = next - u;
        if (len >= 0.5) {
          if (s.axis === 'x') beam(sim, { x: u, y: 0, z: e, len, axis: 'x', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb });
          else beam(sim, { x: e, y: 0, z: u, len, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb });
        }
        u = next;
      }
    }
  }
}

// True when a prop footprint of half-width `pad` at (x, z) stays clear of
// every carriageway rect. The first cut placed walk furniture by eye and a
// dozen lamps/hydrants/benches landed inside the cross streets' rects.
function walkOK(x, z, pad = 0.6) {
  return !CHICAGO_STREETS.some((st) =>
    x + pad > st.x && x - pad < st.x + st.w && z + pad > st.z && z - pad < st.z + st.d);
}

function buildStreetLife(sim) {
  // State Street — the tour's first leg, so both walks carry a full schedule.
  for (const z of [-72, -60, -48, -36, -24, -12, 8, 20, 32, 44]) if (walkOK(-2.75, z)) lampPost(sim, -2.75, z);
  for (const z of [-66, -42, -18, 14, 38]) if (walkOK(-2.75, z - 3)) trashBin(sim, -2.75, z - 3, 0x3f4650);
  for (const z of [-54, -30, 26]) if (walkOK(-2.75, z)) hydrant(sim, -2.75, z);
  for (const z of [-68, -56, -44, -32, -20, 10, 22, 34, 46]) if (walkOK(5.75, z + 3)) lampPost(sim, 5.75, z + 3);
  newsBox(sim, 5.75, -64, 0xc23b2e); newsBox(sim, 5.75, -62.75, 0x2a4f9a);
  mailbox(sim, 5.75, 24, 0x2b4f80);
  for (const z of [-50, -26, 30]) if (walkOK(5.75, z)) bench(sim, 5.75, z);
  signPost(sim, 5.75, -70, 0x2c4a5e, 2, 'z', 1);
  signPost(sim, 5.75, 42, 0x2c4a5e, 2, 'z', 1);
  // Theatre alley.
  hotDogCart(sim, 21.75, -66);
  // LaSalle canyon walks.
  for (const z of [-70, -52, -34, -16, 12, 24, 42]) { if (walkOK(-30.75, z)) lampPost(sim, -30.75, z); if (walkOK(-22.25, z + 6)) lampPost(sim, -22.25, z + 6); }
  for (const z of [-42, -6, 40]) planter(sim, -22.75, z, 1.5, 1, 0x5d5546);
  bikeRack(sim, -22.25, -40, 3, 'z', 0x3a4450);
  // Wacker / Michigan / Washington accents.
  for (const x of [-92, -56, -36, 8, 34, 76, 96]) if (walkOK(x, -76.4)) lampPost(sim, x, -76.4);
  for (const z of [-74, -62, -46, -34, -18, -6, 14, 30, 46]) if (walkOK(63.9, z)) lampPost(sim, 63.9, z);
  for (const z of [-70, -30, 22]) if (walkOK(52.9, z)) lampPost(sim, 52.9, z);
  for (const x of [-88, -66, -44, -16, 20]) if (walkOK(x, -28.75)) lampPost(sim, x, -28.75);
  for (const x of [-80, -54, -38, -8, 18]) if (walkOK(x, 35.75)) lampPost(sim, x, 35.75);
  // Junction traffic lights (non-el corners only).
  for (const [tx, tz] of [
    [-31, -28.75], [5.5, -28.75], [-31, 7.75], [5.5, 7.75],
    [-31, 35.75], [5.5, 35.75], [53.5, -56.75], [53.25, -1],
  ]) trafficLight(sim, tx, tz);
  // Wabash's east walk belongs to the post row; the jewelers' row reads
  // through the neon ambient instead of floor furniture.
}

function buildVehicles(sim) {
  for (const v of CHICAGO_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.body, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else if (v.kind === 'motorcycle') motorcycle(sim, v.x, v.z);
  }
}

// The tour's continuous first meal: raised kerb pavers on the walked line,
// three abreast, skipping roads, water and anything already standing.
function buildRoutePavers(sim) {
  const seen = new Set();
  const roadHit = (x, z) => CHICAGO_STREETS.some((r) =>
    x < r.x + r.w && x + 1 > r.x && z < r.z + r.d && z + 1 > r.z);
  const waterHit = (x, z) => CHICAGO_DECOR.water.some((r) =>
    x < r.x + r.w && x + 1 > r.x && z < r.z + r.d && z + 1 > r.z);
  const occupied = (x, z) => {
    const gx = Math.round(x * 4), gz = Math.round(z * 4);
    for (let ix = 0; ix < 4; ix++) for (let iy = 0; iy < 4; iy++) for (let iz = 0; iz < 4; iz++) {
      if (sim.grid.has(`${gx + ix},${iy},${gz + iz}`)) return true;
    }
    return false;
  };
  let n = 0;
  const paver = (cx, cz) => {
    const x = Math.round(cx) - 0.5, z = Math.round(cz) - 0.5;
    const key = `${x},${z}`;
    n++;
    if (seen.has(key) || roadHit(x, z) || waterHit(x, z) || occupied(x, z)) return;
    seen.add(key);
    if (n % 3) plinth(sim, { x, z, w: 1, d: 1, h: 1.25, mat: 'concrete', color: C.paverA });
    else plinth(sim, { x, z, w: 1, d: 1, h: 1.5, mat: 'steel', color: 0x4a5046 });
  };
  let prev = { x: 0, z: 16 };
  for (const wp of CHICAGO_ROUTE) {
    const dx = wp.x - prev.x, dz = wp.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    const nx = -dz / len, nz = dx / len;
    for (let u = 0; u <= len; u += 1) {
      const x = prev.x + dx * u / len, z = prev.z + dz * u / len;
      if (Math.hypot(x - 0, z - 16) < 5) continue;   // the spawn disc stays open
      paver(x, z);
      paver(x + nx * 1.1, z + nz * 1.1);
      paver(x - nx * 1.1, z - nz * 1.1);
    }
    prev = wp;
  }
}

export function buildChicago(sim) {
  buildRiver(sim);
  buildNorthBank(sim);
  buildLoopBlocks(sim);
  buildEl(sim);
  buildMillennium(sim);
  buildKerbs(sim);
  buildStreetLife(sim);
  buildVehicles(sim);
  buildRoutePavers(sim);

  sim.boundsRect = CHICAGO_BOUNDS;
  sim.coinAnchors = CHICAGO_COIN_ANCHORS;
  sim.sceneDecor = CHICAGO_DECOR;
  // Surface registry rollout — render-side only; the sim never reads it, so
  // the ranked replay is untouched. The same full-coverage map every scene
  // carries (js/voxelsurfaces.js); rubber/leaf stay unmapped on Boston's
  // documented judgement.
  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_glass_curtain',
    concrete: 'mat_concrete_precast',
    steel: 'mat_metal_seam',
    panel: 'mat_metal_seam',
    wood: 'mat_timber_dock',
  };
  sim.sceneAmbient = CHICAGO_AMBIENT;
  sim.sceneMovers = CHICAGO_MOVERS;
  sim.cameraBlockers = generateBlockers(sim);
}
