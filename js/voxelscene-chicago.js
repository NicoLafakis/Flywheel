// Chicago Loop — seventh voxel sandbox scene.
//
// A compressed, walkable Loop rather than a literal survey: the river divides
// the north-bank skyline from the Loop; the elevated rectangle frames the core;
// the player moves from the Board of Trade and Willis Tower, under the 'L', to
// the river and Millennium Park. The landmark proportions and the elevated
// structure were checked against current CTA, Willis Tower, and Chicago image
// references before authoring (see STATUS.md).
//
// This stays pure sim: no DOM/three.js imports and no Math.random(). The long
// facades use ADR-0013 plates, panels, and columns — surface construction, not
// solid filled cubes — so the skyline is detailed without making the city an
// unnecessarily expensive physics scene.

import {
  beam, column, cornice, drum, mullion, panel, pier, plinth, slab, tread, wedge,
} from './voxelforms.js';
import {
  bench, bikeRack, bollard, boxVan, bus, cafeTable, generateBlockers, hydrant,
  lampPost, mailbox, marqueeSign, motorcycle, planter, sedan, setbackTower,
  signPost, tree, trashBin,
} from './voxelkit.js';

export const CHICAGO_BOUNDS = { minX: -112, maxX: 112, minZ: -110, maxZ: 104 };
export const CHICAGO_XW_LEN = 3.5;

// Roads are deliberately split around the Chicago River. Bridge decks are
// boardwalk spans rather than a road surface hidden beneath the water render.
export const CHICAGO_STREETS = [
  { id: 'state_st',        axis: 'z', x: 0,   z: -64,  w: 8,   d: 160 },
  { id: 'lasalle_st',      axis: 'z', x: -22, z: -64,  w: 8,   d: 160 },
  { id: 'michigan_south',  axis: 'z', x: 44,  z: -66,  w: 8,   d: 162 },
  { id: 'michigan_north',  axis: 'z', x: 44,  z: -110, w: 8,   d: 32 },
  { id: 'wacker_dr',       axis: 'x', x: -108, z: -64, w: 216, d: 8 },
  { id: 'randolph_st',     axis: 'x', x: -104, z: -35, w: 208, d: 8 },
  { id: 'washington_st',   axis: 'x', x: -72,  z: -9,  w: 176, d: 8 },
  { id: 'monroe_st',       axis: 'x', x: -72,  z: 18,  w: 176, d: 8 },
  { id: 'adams_st',        axis: 'x', x: -72,  z: 43,  w: 176, d: 8 },
  { id: 'jackson_blvd',    axis: 'x', x: -72,  z: 68,  w: 176, d: 8 },
  { id: 'van_buren_st',    axis: 'x', x: -10,  z: 88,  w: 114, d: 8 },
];

export const CHICAGO_CROSSINGS = [
  [0, -48], [0, -21], [0, 6], [0, 33], [0, 58], [0, 82],
  [1, -48], [1, -21], [1, 6], [1, 33], [1, 58], [1, 82],
  [2, -48], [2, -21], [2, 6], [2, 33], [2, 58], [2, 82],
  [3, -106], [3, -94],
  [4, -96], [4, -32], [4, 28], [4, 84],
  [5, -94], [5, -30], [5, 26], [5, 82],
  [6, -58], [6, -12], [6, 36], [6, 82],
  [7, -58], [7, -12], [7, 36], [7, 82],
  [8, -58], [8, -12], [8, 36], [8, 82],
  [9, -58], [9, -12], [9, 36], [9, 82],
  [10, 8], [10, 52], [10, 90],
];

// Vehicle entries use the same positions and axes passed to the shared kit
// placers below. The validator reads this exact table via vehicleBBox().
export const CHICAGO_VEHICLES = [
  { kind: 'sedan', x: 1,  z: -48, axis: 'z', body: 0x35536d, roof: 0x35536d },
  { kind: 'bus',   x: 4,  z: -21, axis: 'z', body: 0x3e6f9d, roof: 0x3e6f9d },
  { kind: 'sedan', x: 1,  z: 31,  axis: 'z', body: 0xe4e2da, roof: 0xe4e2da },
  { kind: 'sedan', x: 4,  z: 58,  axis: 'z', body: 0xb53e35, roof: 0xb53e35 },
  { kind: 'bus',   x: 45, z: 18,  axis: 'z', body: 0x406f9d, roof: 0x406f9d },
  { kind: 'sedan', x: 48, z: 56,  axis: 'z', body: 0x4f5e69, roof: 0x4f5e69 },
  { kind: 'sedan', x: 24, z: -31, axis: 'x', body: 0x2e4d67, roof: 0x2e4d67 },
  { kind: 'sedan', x: 69, z: 44, axis: 'x', body: 0x8b6a32, roof: 0x8b6a32 },
  { kind: 'motorcycle', x: -31, z: 21, axis: 'x' },
];

// Only elevated deck/car geometry may cross the asphalt. The 'L' bents skip
// every cross street; their ground-level supports stay inside the rail corridor
// rather than receiving an exemption through a traffic lane.
export const CHICAGO_ROAD_SPANS = [
  { minX: -48, maxX: -40, minZ: -54, maxZ: 68, minY: 5.5 },
  { minX: 24,  maxX: 32,  minZ: -54, maxZ: 68, minY: 5.5 },
  { minX: -40, maxX: 24,  minZ: -54, maxZ: -46, minY: 5.5 },
  { minX: -40, maxX: 24,  minZ: 66,  maxZ: 74, minY: 5.5 },
];

// Chicago has no artificial empty edge band: the river touches the east/west
// bounds and every other edge is carried by a physical skyline or park feature.
export const CHICAGO_OPEN_GROUND = [];

export const CHICAGO_DISTRICTS = [
  { id: 'west_loop',     name: 'Willis Tower and West Loop', rect: { minX: -112, maxX: -40, minZ: 28, maxZ: 96 }, gapFloor: 15 },
  { id: 'financial',     name: 'LaSalle Financial Corridor', rect: { minX: -40, maxX: 24, minZ: -42, maxZ: 96 }, gapFloor: 15 },
  { id: 'riverwalk',     name: 'Chicago River and Riverwalk', rect: { minX: -112, maxX: 112, minZ: -66, maxZ: -46 }, gapFloor: 15 },
  { id: 'north_bank',    name: 'River North Skyline', rect: { minX: -112, maxX: 112, minZ: -110, maxZ: -78 }, gapFloor: 15 },
  { id: 'michigan_park', name: 'Michigan Avenue and Millennium Park', rect: { minX: 32, maxX: 112, minZ: -46, maxZ: 96 }, gapFloor: 15 },
];

const C = {
  willis: 0x28343e,
  willisGlass: 0x4a6975,
  willisAccent: 0x93c8d4,       // hero key: only on Willis crown + aerials
  limestone: 0xc9c2b2,
  bronze: 0x7f6b43,
  chicagoBrick: 0x9f5742,
  theatreRed: 0xa92027,
  theatreGold: 0xffca4f,        // hero key: only on the Chicago blade lettering
  platformYellow: 0xe3bc42,
  marqueeBulbs: 0xfff0c0,
  elSteel: 0x536271,
  elDeck: 0x75818a,
  elRail: 0x9aa4ac,
  elSleeper: 0x5d5144,
  ctaBlue: 0x2b5f88,
  ctaRed: 0xb83b3e,
  ctaWhite: 0xe6e8e4,
  ctaGlass: 0x5f8393,
  bean: 0xdde5ea,               // hero key: only on Cloud Gate
  beanShadow: 0x9caab2,
  parkStone: 0xb7b1a7,
  riverStone: 0x909aa0,
  riverSteel: 0x4a5f6c,
  glassBlue: 0x6f91a1,
  glassDark: 0x4b6875,
};

export const CHICAGO_HEROES = [
  { id: 'willis_tower', name: 'Willis Tower', colorKey: C.willisAccent,
    hero: { minX: -98, maxX: -68, minZ: 40, maxZ: 70, minY: 0, maxY: 94 } },
  { id: 'cloud_gate', name: 'Cloud Gate', colorKey: C.bean,
    hero: { minX: 62, maxX: 88, minZ: 6, maxZ: 42, minY: 0, maxY: 8 } },
  { id: 'chicago_theatre', name: 'Chicago Theatre blade', colorKey: C.theatreGold,
    hero: { minX: 8, maxX: 24, minZ: -28, maxZ: -8, minY: 0, maxY: 30 } },
];

// The actual scripted line stays beside plinths and furniture, not in the
// middle of an empty carriageway. It is both the validator route and a useful
// authored first tour of the map.
export const CHICAGO_ROUTE = [
  { until: 4, x: 0, z: 16 },
  { until: 13, x: -18, z: 17 },
  { until: 23, x: -32, z: 45 },
  { until: 34, x: -76, z: 54 },
  { until: 45, x: -76, z: -56 },
  { until: 57, x: -18, z: -58 },
  { until: 68, x: 8, z: -24 },
  { until: 80, x: 30, z: 10 },
  { until: 92, x: 74, z: 22 },
  { until: 103, x: 72, z: 72 },
  { until: 114, x: 12, z: 78 },
];

// Coin anchors are authored as landmarks and route bridges, not placed by a
// random fallback that can put a reward on a roof or across the river.
export const CHICAGO_COIN_ANCHORS = [
  [-4, 16], [-8, 16], [-12, 16], [-16, 17], [-19, 20], [-22, 24], [-25, 29], [-28, 34], [-31, 39], [-33, 44], [-38, 46], [-44, 48],
  [-51, 50], [-58, 52], [-65, 54], [-72, 54], [-78, 52], [-80, 46], [-80, 38], [-80, 30], [-80, 22], [-80, 14], [-80, 6], [-80, -4],
  [-80, -14], [-80, -24], [-80, -34], [-79, -44], [-76, -53], [-66, -57], [-56, -58], [-46, -58], [-36, -58], [-26, -58], [-16, -58], [-8, -54],
  [0, -46], [6, -36], [10, -27], [14, -18], [18, -10], [22, -2], [27, 5], [34, 10], [42, 13], [50, 16], [58, 18], [66, 20],
  [74, 22], [78, 28], [78, 36], [76, 44], [74, 52], [72, 60], [72, 68], [64, 73], [54, 76], [44, 78], [32, 78], [20, 78],
].map(([x, z]) => ({ x, z }));

export const CHICAGO_DECOR = {
  parks: [
    { x: 54, z: 0, w: 50, d: 49, color: 0x54785d },
    { x: 54, z: 53, w: 50, d: 43, color: 0x5e815f },
    { x: -109, z: -65, w: 17, d: 10, color: 0x57745c },
  ],
  sand: [],
  plaza: [
    { x: -106, z: 36, w: 32, d: 40, color: C.parkStone },
    { x: -39, z: 28, w: 17, d: 13, color: C.parkStone },
    { x: 62, z: 8, w: 27, d: 33, color: 0xc7c4bb },
    { x: 36, z: -18, w: 7, d: 28, color: C.parkStone },
  ],
  cobbles: [
    { x: -108, z: -65, w: 216, d: 4, color: 0x77766f },
    { x: 8, z: -28, w: 14, d: 18, color: 0x78736a },
  ],
  // One inland sheet keeps the blocks of the Loop paved without painting over
  // the river. Roads render later and cut their own darker lanes through it.
  sidewalks: [
    { x: -112, z: -66, w: 224, d: 170, color: 0x9d9b93 },
    { x: -112, z: -110, w: 224, d: 32, color: 0x9d9b93 },
  ],
  roads: [
    { x: 0, z: -64, w: 8, d: 160 }, { x: -22, z: -64, w: 8, d: 160 },
    { x: 44, z: -66, w: 8, d: 162 }, { x: 44, z: -110, w: 8, d: 32 },
    { x: -108, z: -64, w: 216, d: 8 }, { x: -104, z: -35, w: 208, d: 8 },
    { x: -72, z: -9, w: 176, d: 8 }, { x: -72, z: 18, w: 176, d: 8 },
    { x: -72, z: 43, w: 176, d: 8 }, { x: -72, z: 68, w: 176, d: 8 },
    { x: -10, z: 88, w: 114, d: 8 },
  ],
  rail: [
    { x: -48, z: -54, w: 8, d: 122 }, { x: 24, z: -54, w: 8, d: 122 },
    { x: -40, z: -54, w: 64, d: 8 }, { x: -40, z: 66, w: 64, d: 8 },
  ],
  bikePaths: [
    { x: -13, z: -64, w: 2, d: 160, color: 0x2e7c67 },
    { x: -108, z: -58, w: 216, d: 2, color: 0x2e7c67 },
  ],
  laneMarkers: [
    { x: 3.75, z: -64, w: 0.25, d: 160 }, { x: -18.25, z: -64, w: 0.25, d: 160 },
    { x: 47.75, z: -66, w: 0.25, d: 162 }, { x: -108, z: -60.25, w: 216, d: 0.25 },
  ],
  crosswalks: [
    { x: 0, z: -48, w: 8, d: 3.5 }, { x: 0, z: -21, w: 8, d: 3.5 }, { x: 0, z: 6, w: 8, d: 3.5 }, { x: 0, z: 33, w: 8, d: 3.5 }, { x: 0, z: 58, w: 8, d: 3.5 }, { x: 0, z: 82, w: 8, d: 3.5 },
    { x: -22, z: -48, w: 8, d: 3.5 }, { x: -22, z: -21, w: 8, d: 3.5 }, { x: -22, z: 6, w: 8, d: 3.5 }, { x: -22, z: 33, w: 8, d: 3.5 }, { x: -22, z: 58, w: 8, d: 3.5 }, { x: -22, z: 82, w: 8, d: 3.5 },
    { x: 44, z: -48, w: 8, d: 3.5 }, { x: 44, z: -21, w: 8, d: 3.5 }, { x: 44, z: 6, w: 8, d: 3.5 }, { x: 44, z: 33, w: 8, d: 3.5 }, { x: 44, z: 58, w: 8, d: 3.5 }, { x: 44, z: 82, w: 8, d: 3.5 },
    { x: 44, z: -106, w: 8, d: 3.5 }, { x: 44, z: -94, w: 8, d: 3.5 },
    { x: -96, z: -64, w: 3.5, d: 8 }, { x: -32, z: -64, w: 3.5, d: 8 }, { x: 28, z: -64, w: 3.5, d: 8 }, { x: 84, z: -64, w: 3.5, d: 8 },
    { x: -94, z: -35, w: 3.5, d: 8 }, { x: -30, z: -35, w: 3.5, d: 8 }, { x: 26, z: -35, w: 3.5, d: 8 }, { x: 82, z: -35, w: 3.5, d: 8 },
    { x: -58, z: -9, w: 3.5, d: 8 }, { x: -12, z: -9, w: 3.5, d: 8 }, { x: 36, z: -9, w: 3.5, d: 8 }, { x: 82, z: -9, w: 3.5, d: 8 },
    { x: -58, z: 18, w: 3.5, d: 8 }, { x: -12, z: 18, w: 3.5, d: 8 }, { x: 36, z: 18, w: 3.5, d: 8 }, { x: 82, z: 18, w: 3.5, d: 8 },
    { x: -58, z: 43, w: 3.5, d: 8 }, { x: -12, z: 43, w: 3.5, d: 8 }, { x: 36, z: 43, w: 3.5, d: 8 }, { x: 82, z: 43, w: 3.5, d: 8 },
    { x: -58, z: 68, w: 3.5, d: 8 }, { x: -12, z: 68, w: 3.5, d: 8 }, { x: 36, z: 68, w: 3.5, d: 8 }, { x: 82, z: 68, w: 3.5, d: 8 },
    { x: 8, z: 88, w: 3.5, d: 8 }, { x: 52, z: 88, w: 3.5, d: 8 }, { x: 90, z: 88, w: 3.5, d: 8 },
  ],
  // The river reaches both x bounds, so it is deliberately open water and the
  // water-rim validator does not demand an impossible wall across its mouth.
  water: [{ x: -112, z: -78, w: 224, d: 12 }],
  boardwalk: [
    { x: -108, z: -65, w: 216, d: 4, color: 0x76695c },
    { x: -94, z: -78, w: 8, d: 14, color: 0x6d7780 },
    { x: -30, z: -78, w: 8, d: 14, color: 0x6d7780 },
    { x: 12, z: -78, w: 8, d: 14, color: 0x6d7780 },
    { x: 44, z: -78, w: 8, d: 14, color: 0x6d7780 },
  ],
};

export const CHICAGO_AMBIENT = {
  gulls: [{ x: -92, z: -72 }, { x: -18, z: -72 }, { x: 56, z: -72 }],
  steam: [{ x: -72, z: 46, rate: 0.28 }, { x: -7, z: -22, rate: 0.36 }, { x: 54, z: 34, rate: 0.24 }],
  neon: [{ x: 9, z: -27, w: 12, d: 1, color: 0xd94444, period: 2.1 }, { x: -7, z: -1, w: 4, d: 10, color: 0xf0be4c, period: 2.7 }, { x: 56, z: 8, w: 10, d: 1, color: 0x5ca7df, period: 3.2 }],
  pigeons: [{ x: -5, z: 16, count: 12 }, { x: -29, z: 38, count: 10 }, { x: 72, z: 22, count: 14 }],
};

// --- construction helpers ----------------------------------------------------

// Surface-built curtain tower. Its 3 m module is an explicit floor plate,
// perimeter posts, infill panels, and internal posts under each plate. It is the
// compact vocabulary used for Willis and the background towers: hundreds of
// pieces per landmark, never tens of thousands of cubes.
function facadeTower(sim, { x, z, w, d, storeys, wall, glass = C.glassBlue, roof = C.elSteel, belt = null }) {
  const module = 3;
  const runs = (n) => {
    const out = [];
    for (let p = 0; p < n - 0.5; p += module) out.push([p, Math.min(module, n - 0.5 - p)]);
    return out;
  };
  const xs = runs(w), zs = runs(d);
  for (let level = 0; level < storeys; level++) {
    const y = level * module;
    // A bay grid keeps every plate inside a 3 m support span.
    for (const [dx, sw] of xs) for (const [dz, sd] of zs) {
      slab(sim, { x: x + dx, y, z: z + dz, w: sw, d: sd, t: 0.5, mat: 'concrete', color: roof });
    }
    for (const [dx] of xs) {
      column(sim, { x: x + dx, y: y + 0.5, z, h: 2.5, s: 0.5, mat: 'steel', color: roof });
      column(sim, { x: x + dx, y: y + 0.5, z: z + d - 0.5, h: 2.5, s: 0.5, mat: 'steel', color: roof });
    }
    for (const [dz] of zs) {
      // The front loop already owns both front corner posts. Re-emitting the
      // z=0 side corners writes a second block into the same fine cells, which
      // looks harmless in a mesh but creates ghost support in the pure sim.
      if (dz === 0) continue;
      column(sim, { x, y: y + 0.5, z: z + dz, h: 2.5, s: 0.5, mat: 'steel', color: roof });
      column(sim, { x: x + w - 0.5, y: y + 0.5, z: z + dz, h: 2.5, s: 0.5, mat: 'steel', color: roof });
    }
    for (const [dx, sw] of xs) {
      if (sw <= 0.5) continue; // terminal half-bay belongs to the end post
      panel(sim, { x: x + dx + 0.5, y: y + 0.5, z, w: Math.max(0.25, sw - 0.5), h: 2.5, axis: 'x', mat: 'panel', color: glass });
      panel(sim, { x: x + dx + 0.5, y: y + 0.5, z: z + d - 0.25, w: Math.max(0.25, sw - 0.5), h: 2.5, axis: 'x', mat: 'panel', color: glass });
    }
    for (const [dz, sd] of zs) {
      if (sd <= 0.5) continue;
      panel(sim, { x, y: y + 0.5, z: z + dz + 0.5, w: Math.max(0.25, sd - 0.5), h: 2.5, axis: 'z', mat: 'panel', color: glass });
      panel(sim, { x: x + w - 0.25, y: y + 0.5, z: z + dz + 0.5, w: Math.max(0.25, sd - 0.5), h: 2.5, axis: 'z', mat: 'panel', color: glass });
    }
    for (let ix = module; ix < w - module; ix += module) {
      for (let iz = module; iz < d - module; iz += module) {
        column(sim, { x: x + ix, y: y + 0.5, z: z + iz, h: 2.5, s: 0.5, mat: 'steel', color: roof });
      }
    }
  }
  const top = storeys * module;
  for (const [dx, sw] of xs) for (const [dz, sd] of zs) {
    slab(sim, { x: x + dx, y: top, z: z + dz, w: sw, d: sd, t: 0.5, mat: 'concrete', color: roof });
  }
  if (belt !== null) {
    cornice(sim, { x, y: top, z: z - 0.5, run: w, axis: 'x', t: 0.25, proj: 0.5, mat: 'steel', color: belt });
    cornice(sim, { x, y: top, z: z + d, run: w, axis: 'x', t: 0.25, proj: 0.5, mat: 'steel', color: belt });
  }
  return { top: top + 0.5 };
}

function tiledGround(sim, x, z, w, d, color) {
  for (let dx = 0; dx < w; dx += 3) for (let dz = 0; dz < d; dz += 3) {
    plinth(sim, { x: x + dx, z: z + dz, w: Math.min(3, w - dx), d: Math.min(3, d - dz), h: 0.25, mat: 'concrete', color });
  }
}

function buildWillisTower(sim) {
  const x0 = -98, z0 = 40;
  // The tube height map produces the recognisable grouped setbacks without
  // stacking one filled cuboid over another. Each tube is a standalone facade.
  const heights = [
    [14, 14, 14],
    [14, 19, 19],
    [14, 19, 26],
  ];
  for (let rz = 0; rz < 3; rz++) for (let cx = 0; cx < 3; cx++) {
    facadeTower(sim, {
      x: x0 + cx * 10, z: z0 + rz * 10, w: 9, d: 9, storeys: heights[rz][cx],
      wall: C.willis, glass: C.willisGlass, roof: C.willis, belt: C.willisAccent,
    });
  }
  // Two aerials grow from capped upper tubes; they are bright enough to keep
  // the tower's silhouette readable in the city-scale establishing shot.
  for (const [x, z] of [[-83.75, 54.25], [-73.75, 64.25]]) {
    column(sim, { x, y: 78.5, z, h: 12, s: 0.5, mat: 'steel', color: C.willisAccent });
    column(sim, { x: x + 0.5, y: 78.5, z: z + 0.5, h: 8, s: 0.25, mat: 'steel', color: C.willisAccent });
  }
}

function buildBoardOfTrade(sim) {
  facadeTower(sim, { x: -38, z: 76, w: 16, d: 19, storeys: 15, wall: C.limestone, glass: 0x7c7165, roof: C.bronze, belt: C.limestone });
  // The cap starts on the base tower's roof plate. A first pass built a second
  // tower inside the base from grade, which made thousands of invisible ghosts.
  wedge(sim, { x: -35, y: 45.5, z: 79, w: 10, d: 13, h: 6, axis: 'x', from: 'center', mat: 'concrete', color: C.limestone });
  column(sim, { x: -30.25, y: 51.5, z: 85, h: 4, s: 1, mat: 'steel', color: C.bronze });
}

function buildMarinaCity(sim) {
  for (const [x, z] of [[-35, -105], [-14, -105]]) {
    tiledGround(sim, x, z, 13, 13, C.limestone);
    // Alternating pale concrete and dark recessed glass rings create the
    // corncob balcony rhythm without a circular solid core.
    for (let y = 0.25, floor = 0; floor < 25; floor++, y += 1.5) {
      drum(sim, { x, y, z, r: 6.5, h: 0.5, facets: 16, t: 0.25, mat: 'concrete', color: floor % 2 ? C.limestone : C.elSteel });
      drum(sim, { x: x + 0.5, y: y + 0.5, z: z + 0.5, r: 6, h: 1, facets: 16, t: 0.25, mat: 'panel', color: C.glassDark });
    }
  }
}

// --- Chicago 'L' -------------------------------------------------------------
// The bent/deck/car arrangement deliberately follows the Cambridge Green Line
// asset's proven rule: columns carry a deck, deck carries rails, rails carry
// the car, and window pillars carry the car roof. Chicago changes the livery
// and closes it into the Loop; it does not fork the structural logic.

const EL = { deckY: 5.5, deckTop: 6.5, railY: 6.75, carY: 7, width: 8, bay: 6 };
const CROSS_Z = [-35, -9, 18, 43, 68];
const CROSS_X = [-22, 0];

function elBentZ(sim, x, z) {
  for (const px of [x + 0.75, x + EL.width - 2.25]) {
    pier(sim, { x: px, y: 0, z: z - 0.75, w: 1.5, h: EL.deckY, d: 1.5, mat: 'steel', color: C.elSteel });
  }
  beam(sim, { x, y: EL.deckY, z: z - 0.75, len: EL.width, axis: 'x', t: 0.5, depth: 1.5, mat: 'steel', color: C.elSteel });
}

function elBentX(sim, x, z) {
  for (const pz of [z + 0.75, z + EL.width - 2.25]) {
    pier(sim, { x: x - 0.75, y: 0, z: pz, w: 1.5, h: EL.deckY, d: 1.5, mat: 'steel', color: C.elSteel });
  }
  beam(sim, { x: x - 0.75, y: EL.deckY, z, len: EL.width, axis: 'z', t: 0.5, depth: 1.5, mat: 'steel', color: C.elSteel });
}

function elRunZ(sim, x, z0, z1) {
  for (let z = z0; z <= z1; z += EL.bay) {
    // The horizontal chord supplies the corner support; a second crosshead
    // here would occupy the same elbow volume.
    if (z === z0) continue;
    if (CROSS_Z.some((street) => Math.abs(street - z) < 3.5)) continue;
    elBentZ(sim, x, z);
  }
  for (let z = z0; z < z1; z += EL.bay) {
    const len = Math.min(EL.bay, z1 - z);
    for (const off of [1.25, 3.75, 6.25]) beam(sim, { x: x + off, y: EL.deckY + 0.5, z, len, axis: 'z', t: 0.25, depth: 0.5, mat: 'steel', color: C.elSteel });
    for (const off of [0, 2, 4, 6]) slab(sim, { x: x + off, y: EL.deckY + 0.75, z, w: 2, d: len, t: 0.25, mat: 'concrete', color: C.elDeck });
  }
  for (let z = z0; z < z1; z += 1) {
    for (const px of [x, x + EL.width - 0.25]) panel(sim, { x: px, y: EL.deckTop, z, w: 1, h: 0.75, axis: 'z', t: 0.25, mat: 'panel', color: C.elSteel });
    for (const tx of [x + 1.25, x + 4.75]) {
      slab(sim, { x: tx, y: EL.deckTop, z: z + 0.25, w: 2.25, d: 0.25, t: 0.25, mat: 'wood', color: C.elSleeper });
    }
  }
  for (const rx of [x + 1.75, x + 2.75, x + 5.25, x + 6.25]) {
    beam(sim, { x: rx, y: EL.railY, z: z0, len: z1 - z0, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.elRail });
  }
}

function elRunX(sim, x0, x1, z) {
  for (let x = x0; x <= x1; x += EL.bay) {
    if (CROSS_X.some((street) => Math.abs(street - x) < 3.5)) continue;
    elBentX(sim, x, z);
  }
  for (let x = x0; x < x1; x += EL.bay) {
    const len = Math.min(EL.bay, x1 - x);
    for (const off of [1.25, 3.75, 6.25]) beam(sim, { x, y: EL.deckY + 0.5, z: z + off, len, axis: 'x', t: 0.25, depth: 0.5, mat: 'steel', color: C.elSteel });
    for (const off of [0, 2, 4, 6]) slab(sim, { x, y: EL.deckY + 0.75, z: z + off, w: len, d: 2, t: 0.25, mat: 'concrete', color: C.elDeck });
  }
  for (let x = x0; x < x1; x += 1) {
    for (const pz of [z, z + EL.width - 0.25]) panel(sim, { x, y: EL.deckTop, z: pz, w: 1, h: 0.75, axis: 'x', t: 0.25, mat: 'panel', color: C.elSteel });
    for (const tz of [z + 1.25, z + 4.75]) {
      slab(sim, { x: x + 0.25, y: EL.deckTop, z: tz, w: 0.25, d: 2.25, t: 0.25, mat: 'wood', color: C.elSleeper });
    }
  }
  for (const rz of [z + 1.75, z + 2.75, z + 5.25, z + 6.25]) {
    beam(sim, { x: x0, y: EL.railY, z: rz, len: x1 - x0, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.elRail });
  }
}

function ctaCarZ(sim, x, z, len, accent = C.ctaBlue) {
  // Cambridge's car is deliberately paneled at 0.5 m, because a continuous
  // glass strip cannot carry the roof in this support graph. Keep every fourth
  // window bay structural on the Chicago repaint too.
  for (let dz = 0; dz < len; dz += 0.5) {
    const pillar = Math.abs(dz % 2) < 0.01;
    slab(sim, { x, y: EL.carY, z: z + dz, w: 2.25, d: 0.5, t: 0.25, mat: 'steel', color: C.elSteel });
    slab(sim, { x, y: EL.carY + 2.25, z: z + dz, w: 2.25, d: 0.5, t: 0.25, mat: 'panel', color: C.ctaWhite });
    for (const sx of [x, x + 2]) {
      panel(sim, { x: sx, y: EL.carY + 0.25, z: z + dz, w: 0.5, h: 0.75, axis: 'z', t: 0.25, mat: 'panel', color: accent });
      panel(sim, { x: sx, y: EL.carY + 1, z: z + dz, w: 0.5, h: 0.75, axis: 'z', t: 0.25, mat: pillar ? 'panel' : 'glass', color: pillar ? accent : C.ctaGlass });
      panel(sim, { x: sx, y: EL.carY + 1.75, z: z + dz, w: 0.5, h: 0.5, axis: 'z', t: 0.25, mat: 'panel', color: C.ctaWhite });
    }
  }
  for (const ez of [z, z + len - 0.25]) {
    panel(sim, { x: x + 0.25, y: EL.carY + 0.25, z: ez, w: 1.75, h: 0.75, axis: 'x', t: 0.25, mat: 'panel', color: accent });
    panel(sim, { x: x + 0.25, y: EL.carY + 1, z: ez, w: 1.75, h: 0.75, axis: 'x', t: 0.25, mat: 'glass', color: C.ctaGlass });
    panel(sim, { x: x + 0.25, y: EL.carY + 1.75, z: ez, w: 1.75, h: 0.5, axis: 'x', t: 0.25, mat: 'panel', color: C.ctaWhite });
  }
}

function ctaCarX(sim, x, z, len, accent = C.ctaRed) {
  // Same car, rotated in authoring coordinates — transforms do not exist in the
  // pure sim, and keeping the same structural bands avoids a divergent asset.
  for (let dx = 0; dx < len; dx += 0.5) {
    const pillar = Math.abs(dx % 2) < 0.01;
    slab(sim, { x: x + dx, y: EL.carY, z, w: 0.5, d: 2.25, t: 0.25, mat: 'steel', color: C.elSteel });
    slab(sim, { x: x + dx, y: EL.carY + 2.25, z, w: 0.5, d: 2.25, t: 0.25, mat: 'panel', color: C.ctaWhite });
    for (const sz of [z, z + 2]) {
      panel(sim, { x: x + dx, y: EL.carY + 0.25, z: sz, w: 0.5, h: 0.75, axis: 'x', t: 0.25, mat: 'panel', color: accent });
      panel(sim, { x: x + dx, y: EL.carY + 1, z: sz, w: 0.5, h: 0.75, axis: 'x', t: 0.25, mat: pillar ? 'panel' : 'glass', color: pillar ? accent : C.ctaGlass });
      panel(sim, { x: x + dx, y: EL.carY + 1.75, z: sz, w: 0.5, h: 0.5, axis: 'x', t: 0.25, mat: 'panel', color: C.ctaWhite });
    }
  }
}

function buildChicagoEl(sim) {
  elRunZ(sim, -48, -46, 66);
  elRunZ(sim, 24, -46, 66);
  elRunX(sim, -40, 24, -54);
  elRunX(sim, -40, 24, 66);
  ctaCarZ(sim, -46, -25, 9, C.ctaBlue);
  ctaCarZ(sim, -46, -14, 9, C.ctaRed);
  ctaCarZ(sim, 26, 26, 9, C.ctaBlue);
  ctaCarX(sim, -26, -52, 9, C.ctaRed);

  // A single street-facing platform: yellow edge strips, a small canopy and a
  // stair keep the 'L' legible at ground level instead of as anonymous girders.
  for (let z = 0; z < 30; z += 3) {
    slab(sim, { x: -51, y: EL.deckTop, z, w: 3, d: 3, t: 0.25, mat: 'concrete', color: C.limestone });
    panel(sim, { x: -51, y: EL.deckTop + 0.25, z, w: 1, h: 0.25, axis: 'x', t: 0.25, mat: 'panel', color: C.platformYellow });
  }
  for (const z of [4, 12, 20, 28]) {
    column(sim, { x: -49.75, y: EL.deckTop + 0.25, z, h: 2.75, s: 0.25, mat: 'steel', color: C.elSteel });
    beam(sim, { x: -50.25, y: EL.deckTop + 3, z, len: 2.5, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.elSteel });
  }
  for (let i = 0; i < 10; i++) {
    tread(sim, { x: -54, y: 0, z: 10 - i * 0.5, run: 2.5, axis: 'x', going: 0.5, rise: (i + 1) * 0.25, mat: 'concrete', color: C.elDeck });
  }
}

function buildChicagoTheatre(sim) {
  facadeTower(sim, { x: 9, z: -26, w: 13, d: 16, storeys: 8, wall: C.chicagoBrick, glass: 0x70473e, roof: C.theatreRed, belt: C.limestone });
  marqueeSign(sim, {
    x: 10, z: -26, w: 11, dir: -1, y: 3, depth: 1.5,
    board: C.theatreRed, bulbs: C.marqueeBulbs, blade: C.theatreRed,
    bladeX: 18.25, bladeH: 14, bladeW: 1.5,
  });
  // Six separated gold strokes are legible as the vertical CHICAGO blade at
  // sandbox scale. They sit one fine cell proud of the red sign board, so the
  // letters never compete for its support cells.
  for (let y = 5; y < 17; y += 2) {
    panel(sim, { x: 18.5, y, z: -27.75, w: 1, h: 1, axis: 'x', t: 0.25, mat: 'panel', color: C.theatreGold });
  }
}

function buildCloudGate(sim) {
  // A low layered, reflective mass reads as the Bean from the chase camera;
  // its stepped footprint is honest voxel geometry rather than pretending this
  // AABB world can render a smooth mirrored NURBS surface.
  const rows = [
    [2, 8], [1, 10], [0, 12], [0, 12], [1, 10], [2, 8],
  ];
  for (let iz = 0; iz < rows.length; iz++) {
    const [inset, count] = rows[iz];
    for (let ix = 0; ix < count; ix++) {
      const x = 65 + (ix + inset) * 1.5;
      const z = 17 + iz * 2;
      plinth(sim, { x, y: 0, z, w: 1.5, d: 2, h: 1.25, mat: 'steel', color: C.bean });
      if (ix > 1 && ix < count - 2 && iz > 0 && iz < rows.length - 1) {
        plinth(sim, { x, y: 1.5, z, w: 1.5, d: 2, h: 0.75, mat: 'steel', color: C.bean });
      }
    }
  }
  // Its dark lower lip is a separate supported band, not a recolour of chrome.
  for (let x = 68; x < 80; x += 2) beam(sim, { x, y: 0.25, z: 16.5, len: 2, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.beanShadow });

  // Pritzker's trellis is held up by perimeter posts: no floating cable grid.
  for (const z of [4, 10, 16, 22]) {
    column(sim, { x: 56, y: 0, z, h: 6, s: 0.5, mat: 'steel', color: C.elSteel });
    column(sim, { x: 96, y: 0, z, h: 6, s: 0.5, mat: 'steel', color: C.elSteel });
    beam(sim, { x: 56, y: 6, z, len: 40, axis: 'x', t: 0.25, depth: 0.5, mat: 'steel', color: C.elSteel });
  }
}

function buildRiverwalk(sim) {
  // 3 m tiles keep the river banks eatable and keep the bounds physically
  // inhabited without a single grade-level slab exceeding the diagonal cap.
  const bridges = [-94, -30, 12, 44];
  for (let x = -112; x < 112; x += 3) {
    const w = Math.min(3, 112 - x);
    plinth(sim, { x, z: -79, w, d: 1, h: 0.5, mat: 'concrete', color: C.riverStone });
    // South-bank tiles leave an honest gap for each bridge abutment instead of
    // overlapping its pier base beneath the surface layer.
    if (!bridges.some((bx) => x < bx + 8 && x + w > bx)) {
      plinth(sim, { x, z: -66, w, d: 1, h: 0.5, mat: 'concrete', color: C.riverStone });
    }
  }
  for (const x of bridges) {
    for (const z of [-78, -75, -72, -69, -66]) {
      slab(sim, { x, y: 2.5, z, w: 8, d: 3, t: 0.5, mat: 'steel', color: C.riverSteel });
    }
    for (const pz of [-78, -66]) {
      pier(sim, { x, y: 0, z: pz, w: 1.5, h: 2.5, d: 2, mat: 'concrete', color: C.riverStone });
      pier(sim, { x: x + 6.5, y: 0, z: pz, w: 1.5, h: 2.5, d: 2, mat: 'concrete', color: C.riverStone });
    }
  }
  for (let x = -104; x < 102; x += 12) {
    bench(sim, x, -59); lampPost(sim, x + 3, -60); trashBin(sim, x + 6, -59, C.elSteel);
  }
}

function buildSkylineAndInfill(sim) {
  buildWillisTower(sim);
  buildBoardOfTrade(sim);
  buildMarinaCity(sim);

  // River North: one ornate limestone rhythm beside two cooler office slabs.
  facadeTower(sim, { x: -108, z: -104, w: 14, d: 20, storeys: 12, wall: C.limestone, glass: C.glassDark, roof: C.elSteel, belt: C.limestone });
  facadeTower(sim, { x: 56, z: -106, w: 16, d: 24, storeys: 16, wall: C.limestone, glass: C.glassDark, roof: C.elSteel, belt: C.limestone });
  facadeTower(sim, { x: 76, z: -106, w: 22, d: 24, storeys: 13, wall: 0xb9b1a4, glass: C.glassBlue, roof: C.elSteel, belt: C.limestone });

  // LaSalle's dense street walls stay clear of the road and of the elevated
  // right-of-way. Their variations are silhouette/colour, not a second generic
  // tower algorithm.
  const loopBlocks = [
    [-38, -25, 14, 15, 8, 0x7c8b91], [-38, 0, 14, 15, 9, 0x87959a],
    [-38, 27, 14, 14, 7, 0xa39a88], [-38, 52, 14, 14, 8, 0x7d8589],
    [10, 1, 12, 14, 8, 0x5f737d], [10, 28, 12, 14, 7, 0x857f72],
    [10, 53, 12, 13, 8, 0x71828a], [10, 77, 12, 9, 5, 0x967a65],
    [56, -42, 16, 12, 11, 0xbab4a9], [78, -42, 18, 12, 12, 0x8a99a0],
    [56, 55, 14, 14, 9, 0xa89d8d], [84, 56, 15, 14, 10, 0x7a8c92],
  ];
  for (const [x, z, w, d, storeys, color] of loopBlocks) {
    facadeTower(sim, { x, z, w, d, storeys, wall: color, glass: C.glassBlue, roof: C.elSteel, belt: color });
  }
  // Classical low frontage establishes the Board of Trade vista at the route's
  // southern end without blocking LaSalle Street itself.
  setbackTower(sim, { ox: -70, oz: 76, w: 14, d: 10, tiers: [{ h: 10 }, { h: 5, inset: 2 }], kind: 'masonry', wallMat: 'concrete', wall: C.limestone, roof: C.bronze, cornice: C.limestone });
}

function buildStreetLife(sim) {
  // Keep the four-metre spawn disc at (0, 16) open, then place the first bite
  // ring just beyond it. That makes the opening active without auto-eating at
  // idle, which the shared stability probe verifies.
  for (const [x, z] of [[-5, 12], [-5, 20], [-9, 15], [-12, 18], [-16, 21], [-20, 24]]) {
    tree(sim, x, z); bench(sim, x - 1, z + 1); bollard(sim, x + 1.5, z - 1, C.elSteel);
  }
  for (const [x, z] of [[-12, -25], [-12, -14], [-12, 3], [-12, 31], [-12, 56], [-12, 80], [34, 5], [34, 32], [34, 57], [38, 10], [55, 6], [55, 48]]) {
    lampPost(sim, x, z); planter(sim, x - 1.5, z + 2, 1.5, 1, C.riverSteel);
  }
  for (const [x, z] of [[34, -26], [34, -15], [34, -4], [34, 8], [55, 14], [57, 19], [57, 26], [61, 33]]) {
    bikeRack(sim, x, z, 3, 'z', C.elSteel); cafeTable(sim, x + 1.5, z + 1); signPost(sim, x + 3, z, C.elSteel);
  }
  for (const [x, z] of [[58, 10], [64, 12], [84, 10], [58, 42], [64, 48], [82, 46], [94, 52], [60, 72], [72, 74], [84, 72]]) {
    tree(sim, x, z); bench(sim, x + 2, z + 1); lampPost(sim, x - 1, z + 2);
  }
  mailbox(sim, -8, 27, C.ctaBlue);
  trashBin(sim, -11, 32, C.elSteel);
  cafeTable(sim, -17, -15);
  cafeTable(sim, -14, -15);
  planter(sim, -19, -18, 2, 1.25, C.riverSteel);
  planter(sim, 30, 4, 2, 1.25, C.riverSteel);
}

function buildVehicles(sim) {
  for (const v of CHICAGO_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.body, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else if (v.kind === 'motorcycle') motorcycle(sim, v.x, v.z);
  }
}

export function buildChicago(sim) {
  buildRiverwalk(sim);
  buildSkylineAndInfill(sim);
  buildChicagoEl(sim);
  buildChicagoTheatre(sim);
  buildCloudGate(sim);
  buildStreetLife(sim);
  buildVehicles(sim);

  sim.boundsRect = CHICAGO_BOUNDS;
  sim.coinAnchors = CHICAGO_COIN_ANCHORS;
  sim.sceneDecor = CHICAGO_DECOR;
  sim.sceneAmbient = CHICAGO_AMBIENT;
  sim.cameraBlockers = generateBlockers(sim);
}
