// Hong Kong Victoria Harbour & Victoria Peak — Sandbox Scene (Act II, chapter 4).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// Landmark reference notes (silhouette / facade / colour per building, and how
// each is rendered here): .wiki/cities/hongkong-references.md
//
// GEOGRAPHY & VERTICAL TOPOGRAPHY:
//   z -54..-42  Kowloon / Tsim Sha Tsui: Clock Tower (red brick, white quoins,
//               cupola + rod), Cultural Centre (ribbed sloping windowless wing)
//   z -42..-14  Victoria Harbour: Star Ferry Pier 7 (arched shed, pitched roof,
//               clock tower), moored green-and-white double-deck Star Ferry, a
//               batwing-sailed junk, and a close-out flotilla of sampans
//   z -14..-4   Central Waterfront Promenade & Connaught Road Central
//   z   2..13   Commercial Core: Two IFC (slender cream tapering shaft, vertical
//               ribs, clawed crown) and Jardine House (recessed porthole grid)
//   z  18..29   Financial Canyon: HSBC Main
//               Building (eight masts, open ground floor, chevron trusses, glass
//               floors hung between, bronze lions), Lippo Centre (two octagonal
//               towers with "koala" pod bands), tong lau shophouse row with
//               balconies and projecting signboards, the Tram Terminus Loft
//   z  34..66   Peak foot and Victoria Peak: Bank of China Tower (four hollow
//               prisms with white X-bracing, stepped wedge tops, twin masts)
//               beside the Peak Tram cutting, two terraces of pastel pencil
//               towers (the Mid-Levels wall), and The Peak Tower's wok bowl on
//               a neck above its podium
//
// No block sits inside a roadway rect (validate-hongkong probeRoadConflicts);
// the first draft's IFC, Jardine and BoC footprints all did.
//
// STRUCTURE RULES THAT SHAPED THE GEOMETRY (see .wiki/modules/voxel.md):
//   - every piece rests on something or hangs within its material's maxSpan
//     (steel/concrete/panel 3 m, brick/wood 2 m, glass 1 m) of a supported
//     neighbour; glass never carries (vertBond 0.40 < BOND_CARRY), so glass is
//     only ever a leaf between load-bearing mullions
//   - BoC / Jardine / Lippo curtain walls are dark 'panel', not 'glass', because
//     the white X-bracing diagonals are NOT face-adjacent to each other and
//     would be islands in a glass field
//   - hollow 8 m shells carry a 1 m cap slab because the centre cell is at most
//     3 hops from the ring
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 32,000 blocks. The close-out is a
//   harbour flotilla (sampans, then mooring buoys), capped at 10% of budget by
//   tools/validate-hongkong.mjs probeNoBudgetPadding.

import {
  bench, bollard, generateBlockers, lampPost, planter, tower, tree,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const HONGKONG_VEHICLES = [
  // Connaught Road Central (axis x, z -3..1)
  { kind: 'bus', x: -30, z: -1.5, axis: 'x', color: 0xc62828 },        // KMB Red/Yellow double-decker bus
  { kind: 'sedan', x: -14, z: -1.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 }, // HK Red Taxi
  { kind: 'boxVan', x: 16, z: -1.5, axis: 'x', len: 5, color: 0xf5f5f5, color2: 0x1565c0 },
  { kind: 'sedan', x: 34, z: 0.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 }, // HK Red Taxi

  // Des Voeux Road Central (axis x, z 13..17 - Tram corridor)
  { kind: 'bus', x: -34, z: 14.5, axis: 'x', color: 0x1b5e20 },       // Ding Ding double-decker tram green
  { kind: 'sedan', x: -12, z: 14.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'bus', x: 18, z: 14.5, axis: 'x', color: 0x0d47a1 },        // Commercial wrapped Ding Ding tram
  { kind: 'sedan', x: 38, z: 14.5, axis: 'x', color: 0x212121 },

  // Queensway / Garden Road lower (axis x, z 29..33)
  { kind: 'sedan', x: -28, z: 30.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'motorcycle', x: 26, z: 30.5, axis: 'x' },
  { kind: 'sedan', x: 36, z: 30.5, axis: 'x', color: 0x37474f },

  // Murray Road (axis z, x 22..26)
  { kind: 'sedan', x: 23.5, z: 4, axis: 'z', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'boxVan', x: 23.5, z: 22, axis: 'z', len: 5, color: 0xffffff, color2: 0xd32f2f },
];

export const HONGKONG_ROAD_SPANS = [];
export const HONGKONG_OPEN_GROUND = [];

export const HONGKONG_STREETS = [
  { x: -54, z: -3, w: 108, d: 5, axis: 'x' },  // 0 Connaught Road Central
  { x: -50, z: 13, w: 100, d: 5, axis: 'x' },  // 1 Des Voeux Road Central
  { x: -46, z: 29, w: 92, d: 5, axis: 'x' },   // 2 Queensway
  { x: -2, z: 2, w: 4, d: 34, axis: 'z' },     // 3 Pedder Street / Garden Road
  { x: 22, z: 2, w: 4, d: 34, axis: 'z' },     // 4 Murray Road
];

export const HONGKONG_CROSSINGS = [
  [0, -32], [0, -8], [0, 8], [0, 30],
  [1, -26], [1, -6], [1, 10], [1, 32],
  [2, -20], [2, 12],
  [3, 8], [3, 24],
  [4, 8], [4, 24],
];

const TARGET_BLOCKS = 32000;

// Palette
const WHITE = 0xf5f5f5;
const CREAM = 0xe8e4da;
const GRANITE = 0xcfd8dc;
const BOC_BLUE = 0x143a6e;
const LIPPO_BLUE = 0x1d4a8a;
const LIPPO_POD = 0x2b6cb0;
const HSBC_GREY = 0x9aa5ad;
const BRONZE = 0x8d6e3a;
const PASTELS = [0xf4c2c2, 0xbfe3d0, 0xfff1c1, 0xf9d3b4, 0xcde4f7, 0xe6d4f2, 0xd7ecc1, 0xf7e1ea];
const NEON = [0xff1744, 0xffea00, 0x00e5ff, 0xff9100, 0x76ff03, 0xff4081];

function freeCells(sim, x, y, z, ex, ey, ez) {
  const f = 4;
  const gx = Math.round(x * f), gy = Math.round(y * f), gz = Math.round(z * f);
  const nx = Math.round(ex * f), ny = Math.round(ey * f), nz = Math.round(ez * f);
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let iz = 0; iz < nz; iz++) {
        if (sim.grid.has(`${gx + ix},${gy + iy},${gz + iz}`)) return false;
      }
    }
  }
  return true;
}

export function buildHongKong(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -54, maxZ: 68 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);
  // Overlap-guarded placement: shared walls between adjacent prisms, and
  // anything laid over geometry another section already owns.
  const P = (x, y, z, m, s, c) => {
    const a = Array.isArray(s);
    if (!freeCells(sim, x, y, z, a ? s[0] : s, a ? s[1] : s, a ? s[2] : s)) return false;
    B(x, y, z, m, s, c);
    return true;
  };
  const PBOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => {
    const a = Array.isArray(s);
    const ex = a ? s[0] : s, ey = a ? s[1] : s, ez = a ? s[2] : s;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) P(x0 + i * ex, y0 + j * ey, z0 + k * ez, m, s, c);
      }
    }
  };
  // Perimeter walk of a w×d footprint of 1 m cells. fn(x, z, along, face, corner):
  // `along` runs 0..w-1 on the z faces and 0..d-1 on the x faces.
  const ring = (x0, z0, w, d, fn) => {
    for (let i = 0; i < w; i++) {
      fn(x0 + i, z0, i, 'n', i === 0 || i === w - 1);
      fn(x0 + i, z0 + d - 1, i, 's', i === 0 || i === w - 1);
    }
    for (let k = 1; k < d - 1; k++) {
      fn(x0, z0 + k, k, 'w', false);
      fn(x0 + w - 1, z0 + k, k, 'e', false);
    }
  };

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  water.push(
    { x: -70, z: -42, w: 140, d: 10, color: 0x164e63 }, // Victoria Harbour, north band above the pier notch
    { x: -70, z: -32, w: 60, d: 18, color: 0x164e63 },  // ...west of the Star Ferry Pier forecourt
    { x: 10, z: -32, w: 60, d: 18, color: 0x164e63 },   // ...east of the Star Ferry Pier forecourt
  );
  plaza.push(
    { x: -54, z: -54, w: 108, d: 12, color: 0xcfd8dc }, // TST Promenade
    { x: -54, z: -14, w: 108, d: 11, color: 0xd6d2c8 }, // Central Harbourfront promenade
    { x: -50, z: 2, w: 100, d: 11, color: 0xb0bec5 },   // Financial district north apron
    { x: -46, z: 18, w: 92, d: 11, color: 0x90a4ae },   // Bank canyon plaza / Chater Garden
    { x: -10, z: -32, w: 20, d: 18, color: 0xcfd8dc },  // Star Ferry Pier forecourt
  );
  boardwalk.push({ x: -8, z: -30, w: 16, d: 16, color: 0x8d6e63 }); // Star Ferry deck
  parks.push(
    { x: -50, z: 34, w: 100, d: 32, color: 0x2e7d32 },  // Victoria Peak mountain slope
    { x: 4, z: 18, w: 14, d: 10, color: 0x388e3c },     // Chater Garden green
    { x: -36, z: 20, w: 12, d: 8, color: 0x388e3c },    // Statue Square park
  );
  cobbles.push(
    { x: 4, z: 34, w: 10, d: 30, color: 0x546e7a },     // Peak Tram rail cutting bed
    { x: -42, z: 40, w: 20, d: 24, color: 0x455a64 },   // Peak Road switchback
  );
  roads.push(
    { x: -54, z: -3, w: 108, d: 5, color: 0x37474f },   // Connaught Rd
    { x: -50, z: 13, w: 100, d: 5, color: 0x37474f },   // Des Voeux Rd
    { x: -46, z: 29, w: 92, d: 5, color: 0x37474f },    // Queensway
    { x: -2, z: 2, w: 4, d: 34, color: 0x37474f },      // Garden Rd
    { x: 22, z: 2, w: 4, d: 34, color: 0x37474f },      // Murray Rd
  );

  // ------------------------------------------------------------
  // 0. KOWLOON / TSIM SHA TSUI
  // ------------------------------------------------------------
  // TST Clock Tower (x -4..0, z -52..-48, 16 m): red brick shaft, alternating
  // white-granite quoins on all four corners, white clock faces, cupola, rod.
  BOX(-3, 0, -51, 2, 16, 2, 'brick', 1, 0x8d5b4c);
  for (let y = 0; y < 16; y++) {
    const face = y === 12 || y === 13;
    for (const [x, z] of [[-3, -52], [-2, -52], [-3, -49], [-2, -49], [-4, -51], [-4, -50], [-1, -51], [-1, -50]]) {
      B(x, y, z, face ? 'panel' : 'brick', 1, face ? 0xfafafa : 0x8d5b4c);
    }
    const qc = y % 2 === 0 ? GRANITE : 0x8d5b4c;
    for (const [x, z] of [[-4, -52], [-1, -52], [-4, -49], [-1, -49]]) {
      for (const [dx, dz] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) B(x + dx, y, z + dz, 'brick', [0.5, 1, 0.5], qc);
    }
  }
  BOX(-3.5, 16, -51.5, 6, 1, 6, 'steel', 0.5, 0x37474f);     // cupola tier 1
  BOX(-3, 16.5, -51, 4, 1, 4, 'steel', 0.5, 0x37474f);       // cupola tier 2
  BOX(-2.5, 17, -50.5, 2, 1, 2, 'steel', 0.5, 0x263238);     // cupola cap
  BOX(-2.25, 17.5, -50.25, 1, 8, 1, 'steel', 0.25, 0xeceff1); // lightning rod

  // Hong Kong Cultural Centre wing (x 6..24, z -52..-44): windowless pinkish
  // tile, ribbed roof sloping up from 3 m to 11 m in 1 m steps.
  for (let i = 0; i < 18; i++) {
    const h = 3 + Math.floor(i / 2);
    for (let y = 0; y < h; y++) B(6 + i, y, -52, 'concrete', [1, 1, 8], y === h - 1 ? 0xe6c9c0 : 0xd7b9b0);
  }
  // Second wing (x 26..44) mirrors the first: the two roofs sweep up toward
  // the auditorium block between them.
  for (let i = 0; i < 18; i++) {
    const h = 3 + Math.floor((17 - i) / 2);
    for (let y = 0; y < h; y++) B(26 + i, y, -52, 'concrete', [1, 1, 8], y === h - 1 ? 0xe6c9c0 : 0xd7b9b0);
  }
  BOX(24, 0, -52, 1, 6, 4, 'concrete', 2, 0xc9a9a0); // auditorium block between the wings
  // Avenue of Stars promenade railing along the Kowloon seawall.
  for (let rx = -52; rx < 52; rx += 2) {
    B(rx, 0, -42.5, 'steel', [0.25, 1, 0.25], 0x37474f);
    B(rx, 1, -42.5, 'steel', [2, 0.25, 0.25], 0x78909c);
  }

  // TST promenade lamps
  for (let lx = -52; lx <= 52; lx += 8) {
    if (lx < -8 || lx > 44) lampPost(sim, lx, -46);
  }

  // ------------------------------------------------------------
  // 1. STAR FERRY PIER 7 & HARBOUR VESSELS
  // ------------------------------------------------------------
  BOX(-8, 0, -30, 17, 1, 16, 'concrete', 1, 0x455a64); // pier foundation
  BOX(-8, 1, -30, 17, 1, 16, 'concrete', 1, 0x5d4037); // pier deck (top y = 2)

  // Terminal shed (x -6..7, z -28..-16), y 2..6: green panel walls with arched
  // glass bays every third cell; solid interior core carries the upper deck.
  BOX(-5, 2, -27, 11, 4, 10, 'concrete', 1, 0x455a64); // Terminal interior core (y: 2..6)
  ring(-6, -28, 13, 12, (x, z, along, face, corner) => {
    for (let y = 2; y < 6; y++) {
      const arch = !corner && along % 3 === 1 && (y === 3 || y === 4);
      B(x, y, z, arch ? 'glass' : 'panel', 1, arch ? undefined : 0x1b5e20);
    }
  });
  BOX(-6, 6, -28, 13, 1, 12, 'concrete', 1, 0xeceff1); // upper deck floor
  // Pitched roof: green slats along x, each course inset one cell.
  for (let c = 0; c < 5; c++) {
    const z0 = -27 + c, n = 10 - 2 * c;
    for (let k = 0; k < n; k++) B(-6, 7 + c, z0 + k, 'steel', [13, 1, 1], c === 4 ? 0x2e7d32 : 0x1b5e20);
  }
  // Pier clock tower (x 0..3, z -16..-14), Edwardian revival, white with a
  // green clock band and a stepped cap.
  BOX(0, 2, -16, 3, 12, 2, 'panel', 1, 0xfafafa);
  BOX(0, 11, -16.5, 6, 2, 1, 'panel', 0.5, 0x1b5e20); // clock face band (north)
  BOX(0.5, 14, -15.5, 4, 1, 2, 'steel', 0.5, 0x004d40);
  BOX(1, 14.5, -15, 2, 1, 1, 'steel', 0.5, 0x004d40);

  // Star Ferries: green hull, open lower deck, white upper deck with window
  // strip, slatted roof, funnel, lifebuoys on the rail.
  const starFerry = (x0, z0) => {
    BOX(x0, 0, z0, 6, 1, 10, 'steel', 1, 0x1b5e20);
    ring(x0, z0, 6, 10, (x, z) => B(x, 1, z, 'panel', 1, 0x1b5e20));
    BOX(x0, 2, z0, 6, 1, 10, 'concrete', 1, WHITE);
    ring(x0, z0, 6, 10, (x, z, along, face, corner) => {
      const win = !corner && along % 2 === 1;
      B(x, 3, z, win ? 'glass' : 'panel', 1, win ? undefined : WHITE);
    });
    for (let k = 0; k < 10; k++) B(x0, 4, z0 + k, 'steel', [6, 0.5, 1], 0xeceff1);
    B(x0 + 2, 4.5, z0 + 4, 'steel', [1, 2, 1], 0x212121); // funnel
    for (const dz of [1, 4, 7]) B(x0 - 0.5, 1, z0 + dz, 'rubber', 0.5, 0xff6f00);
  };
  starFerry(-18, -28); // "Twinkling Star" alongside Pier 7
  starFerry(30, -40);  // "Morning Star" on the Kowloon run

  // Junk (x 12..18, z -28..-18): wood hull, deck, three battened red sails.
  BOX(12, 0, -28, 6, 1, 10, 'wood', 1, 0x4e342e);
  ring(12, -28, 6, 10, (x, z) => B(x, 1, z, 'wood', 1, 0x5d4037));
  BOX(13, 1, -27, 4, 1, 8, 'wood', 1, 0x8d6e63);
  B(13, 2, -22, 'wood', [4, 1, 2], 0x6d4c41); // cabin
  for (const [mz, mh] of [[-26, 7], [-23, 9], [-20, 6]]) {
    BOX(14, 2, mz, 1, mh, 1, 'steel', 1, 0x3e2723); // mast
    const rows = mh * 2 - 2;
    for (let r = 0; r < rows; r++) {
      const w = Math.max(1, 6 - Math.floor(r / 2));
      for (let i = 0; i < w; i++) B(15 + i * 0.5, 2 + r * 0.5, mz, 'panel', [0.5, 0.5, 0.5], r % 3 === 2 ? 0x8e1b1b : 0xc62828);
    }
  }

  // ------------------------------------------------------------
  // 2. TWO IFC (x -40..-26, z 2..12): slender cream tapering shaft, vertical
  //    ribs, clawed crown. Sited between Connaught and Des Voeux roads.
  // ------------------------------------------------------------
  BOX(-40, 0, 2, 7, 3, 5, 'concrete', 2, 0xb8b4aa); // podium y 0..6
  const ifcTier = (x0, z0, n, y0, y1, col) => {
    BOX(x0, y0, z0, n, (y1 - y0) / 2, n, 'steel', 2, col);
    const w = n * 2;
    for (let y = y0; y < y1; y += 2) {
      for (let k = 0; k < n; k++) {
        const o = 2 * k + 0.75;
        B(x0 - 0.5, y, z0 + o, 'steel', [0.5, 2, 0.5], WHITE);
        B(x0 + w, y, z0 + o, 'steel', [0.5, 2, 0.5], WHITE);
        B(x0 + o, y, z0 - 0.5, 'steel', [0.5, 2, 0.5], WHITE);
        B(x0 + o, y, z0 + w, 'steel', [0.5, 2, 0.5], WHITE);
      }
    }
  };
  ifcTier(-37, 3, 4, 6, 26, CREAM);
  ifcTier(-36, 4, 3, 26, 48, 0xe0dcd2);
  ifcTier(-35, 5, 2, 48, 68, CREAM);
  // Crown: corner claws plus a picket of fins along every edge.
  for (const [fx, fz] of [[-35, 5], [-32, 5], [-35, 8], [-32, 8]]) B(fx, 68, fz, 'steel', [1, 4, 1], WHITE);
  B(-33.25, 68, 5, 'steel', [0.5, 3, 0.5], WHITE);
  B(-33.25, 68, 8.5, 'steel', [0.5, 3, 0.5], WHITE);
  B(-35, 68, 6.75, 'steel', [0.5, 3, 0.5], WHITE);
  B(-31.5, 68, 6.75, 'steel', [0.5, 3, 0.5], WHITE);
  B(-34, 68, 6, 'concrete', 2, 0x9e9a90); // crown roof platform

  // ------------------------------------------------------------
  // 3. JARDINE HOUSE (x -20..-8, z 2..12, 44 m): grey core, 1 m skin with a
  //    grid of recessed dark portholes on every other cell of every other floor.
  // ------------------------------------------------------------
  BOX(-19, 0, 3, 5, 22, 4, 'concrete', 2, 0x90a4ae);
  ring(-20, 2, 12, 10, (x, z, along, face, corner) => {
    for (let y = 0; y < 44; y++) {
      const port = !corner && y >= 2 && y % 2 === 1 && along % 2 === 1;
      if (!port) { B(x, y, z, 'panel', 1, 0xe0e0e0); continue; }
      B(x, y, z, 'panel', [1, 0.25, 1], 0xe0e0e0); // sill
      const px = face === 'w' ? x + 0.5 : face === 'e' ? x : x + 0.25;
      const pz = face === 'n' ? z + 0.5 : face === 's' ? z : z + 0.25;
      B(px, y + 0.25, pz, 'panel', [0.5, 0.75, 0.5], 0x263238);
    }
  });

  // ------------------------------------------------------------
  // 4. BANK OF CHINA TOWER (x 26..42, z 34..50, at the foot of the Peak beside
  //    the tram, as the real one stands on Garden Road): four hollow 8 m prisms ending
  //    at four heights, white X-bracing over dark blue, stepped wedge tops,
  //    twin masts. Adjacent prisms share their party walls (P skips the
  //    second placement).
  // ------------------------------------------------------------
  BOX(26, 0, 34, 8, 3, 8, 'steel', 2, 0xeceff1); // podium y 0..6
  const prism = (x0, z0, top) => {
    ring(x0, z0, 8, 8, (x, z, along, face, corner) => {
      for (let y = 6; y < top; y++) {
        const v = (y - 6) % 8;
        const brace = corner || along === v || along === 7 - v;
        P(x, y, z, 'steel', 1, brace ? WHITE : BOC_BLUE);
      }
    });
    PBOX(x0, top, z0, 8, 1, 8, 'steel', 1, WHITE);                       // cap
    for (let k = 1; k < 8; k++) {                                          // wedge
      for (let j = 0; j < k; j++) P(x0, top + 1 + j * 0.5, z0 + k, 'steel', [8, 0.5, 1], j % 2 ? 0xeceff1 : WHITE);
    }
  };
  prism(34, 34, 66); // NE, full height — built first so it owns the shared walls
  prism(26, 34, 52); // NW
  prism(26, 42, 38); // SW
  prism(34, 42, 24); // SE
  for (const mx of [35, 40.5]) BOX(mx, 67, 34.25, 1, 6, 1, 'steel', [0.5, 2, 0.5], 0xfafafa); // masts

  // ------------------------------------------------------------
  // 5. HSBC MAIN BUILDING (x -18..-2, z 18..26, 44 m; Garden Road is x -2..2): eight masts in four
  //    pairs, OPEN ground floor (only masts and slim hangers touch y=0), floor
  //    slabs hung between, glass skin with mullions, chevron trusses at four
  //    levels, bronze lions at the Des Voeux Road edge.
  // ------------------------------------------------------------
  const mastX = [-18, -13, -8, -3], mastZ = [19, 24];
  for (const mx of mastX) for (const mz of mastZ) BOX(mx, 0, mz, 1, 44, 1, 'steel', 1, HSBC_GREY);
  // Slim ground-floor hangers: the first slab has no spandrel under its edge,
  // so without these the open floor's middle cells sit 4 hops from a mast
  // (hops accumulate on both axes; concrete maxSpan is 3).
  for (const hx of [-16, -11, -6]) for (const hz of mastZ) B(hx + 0.25, 0, hz + 0.25, 'steel', [0.5, 4, 0.5], HSBC_GREY);
  const trussLevels = new Set([12, 20, 28, 36]);
  for (let y = 4; y < 44; y++) {
    if ((y - 4) % 4 === 0) { PBOX(-18, y, 18, 16, 1, 8, 'concrete', 1, 0xb0bec5); continue; }
    const tl = [...trussLevels].find((t) => y === t + 1 || y === t + 2);
    ring(-18, 18, 16, 8, (x, z, along, face, corner) => {
      if (tl !== undefined && (face === 'n' || face === 's')) {
        // Chevron between mast pair: outer cells on the lower course, inner on the upper.
        const bay = (x + 18) % 5;           // masts sit at bay 0
        const lower = y === tl + 1;
        const chev = lower ? (bay === 1 || bay === 4) : (bay === 2 || bay === 3);
        if (chev) { P(x, y, z, 'steel', 1, WHITE); return; }
      }
      if (corner || along % 2 === 0) { P(x, y, z, 'steel', 1, HSBC_GREY); return; }
      if ((y - 4) % 4 === 3) { P(x, y, z, 'panel', 1, 0x78909c); return; } // spandrel
      P(x, y, z, 'glass', 1);
    });
  }
  BOX(-18, 44, 18, 16, 1, 8, 'concrete', 1, 0x90a4ae); // roof plate
  B(-17, 45, 19, 'steel', [1, 3, 1], 0xd32f2f); B(-4, 45, 24, 'steel', [1, 3, 1], 0xd32f2f); // maintenance cranes
  // Stephen and Stitt, the bronze lions, at the Des Voeux Road entrance.
  B(-17, 0, 18.5, 'steel', [1, 1, 0.5], BRONZE); B(-4, 0, 18.5, 'steel', [1, 1, 0.5], BRONZE);

  // ------------------------------------------------------------
  // 6. LIPPO CENTRE: two chamfered-octagon towers with three "koala" pod
  //    bands each, dark blue.
  // ------------------------------------------------------------
  const lippo = (x0, z0, top) => {
    ring(x0, z0, 6, 6, (x, z, along, face, corner) => {
      if (corner) return;
      for (let y = 0; y < top; y++) B(x, y, z, 'panel', 1, LIPPO_BLUE);
    });
    for (let y = 0; y < top; y++) {
      const band = (y >= 8 && y < 12) || (y >= 20 && y < 24) || (y >= 32 && y < 36);
      if (!band) continue;
      for (let k = 1; k <= 4; k++) { B(x0 - 1, y, z0 + k, 'panel', 1, LIPPO_POD); B(x0 + 6, y, z0 + k, 'panel', 1, LIPPO_POD); }
    }
    ring(x0, z0, 6, 6, (x, z, along, face, corner) => { if (!corner) B(x, top, z, 'concrete', 1, 0x546e7a); });
    BOX(x0 + 1, top, z0 + 1, 4, 1, 4, 'concrete', 1, 0x546e7a);
  };
  lippo(33, 18, 46);
  lippo(40, 23, 42);

  // ------------------------------------------------------------
  // 7. WHERE'S WALDO TARGET: HISTORIC TRAM TERMINUS LOFT (x 6..13, z 22..29)
  // ------------------------------------------------------------
  BOX(6, 0, 22, 7, 5, 7, 'brick', 1, 0xa63a2a);
  for (let x = 6; x <= 12; x += 2) {
    B(x, 2, 21.5, 'panel', 0.5, 0xd7ccc8);
  }
  for (let r = 0; r <= 3; r++) BOX(6 + r, 5 + r, 22 + r, 7 - r * 2, 1, 7 - r * 2, 'brick', 1, 0x3e2723);
  for (const tx of [-34, -30, -26]) tree(sim, tx, 21); // Statue Square
  for (const [tx, tz] of [[4.5, 19.5], [15.5, 19.5], [4.5, 25.5], [15.5, 25.5]]) tree(sim, tx, tz); // Chater Garden

  // ------------------------------------------------------------
  // 8. TONG LAU SHOPHOUSE ROW (x -50..-38, z 19..27): four narrow 4-storey
  //    houses, balconies over the pavement, projecting neon signboards.
  // ------------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const hx = -50 + i * 3;
    tower(sim, hx, 19, 3, 8, 0, 12, 'masonry', 'brick', PASTELS[i]);
    for (const by of [3, 6, 9]) B(hx, by, 18, 'concrete', [3, 0.25, 1], 0xb0bec5);           // balcony
    for (const sy of [3.25, 6.25, 9.25]) B(hx + 1.5, sy, 18, 'panel', [0.25, 2, 1], NEON[(i * 3 + Math.floor(sy)) % 6]); // signboard
  }

  // ------------------------------------------------------------
  // 9. EAST CURTAIN-WALL OFFICE BLOCK (x 44..52, z 2..9)
  // ------------------------------------------------------------
  tower(sim, 44, 2, 8, 7, 0, 30, 'curtain', 'concrete', 0x455a64);

  // ------------------------------------------------------------
  // 10. VICTORIA PEAK TERRACES & THE MID-LEVELS PENCIL-TOWER WALL
  // ------------------------------------------------------------
  BOX(-50, 0, 36, 29, 2, 4, 'concrete', 2, 0x2e7d32); // tier 1 west, top y 4
  BOX(14, 0, 36, 6, 2, 4, 'concrete', 2, 0x2e7d32);   // tier 1 east of the tram, up to the BoC podium
  BOX(42, 0, 36, 4, 2, 4, 'concrete', 2, 0x2e7d32);   // tier 1 east of BoC
  BOX(-50, 0, 44, 29, 4, 4, 'concrete', 2, 0x2e7d32); // tier 2, top y 8
  BOX(14, 0, 44, 6, 4, 4, 'concrete', 2, 0x2e7d32);
  BOX(42, 0, 44, 4, 4, 4, 'concrete', 2, 0x2e7d32);
  BOX(-50, 0, 52, 23, 6, 2, 'concrete', 2, 0x2e7d32); // tier 3, top y 12
  BOX(20, 0, 52, 15, 6, 2, 'concrete', 2, 0x2e7d32);
  // Pencil towers: 4×4 m, pastel, heights from a fixed pattern so the wall
  // reads as a jagged skyline. Air-con boxes on the street faces.
  const pencil = (px, pz, y0, h, i) => {
    tower(sim, px, pz, 4, 4, y0, y0 + h, 'masonry', 'concrete', PASTELS[i % PASTELS.length]);
    BOX(px, y0 + h, pz, 4, 1, 4, 'concrete', 1, 0x90a4ae);          // roof slab
    B(px + 1, y0 + h + 1, pz + 1, 'concrete', [2, 0.5, 2], 0x78909c); // rooftop tank
    for (let y = y0 + 5; y < y0 + h - 2; y += 6) B(px + 2, y, pz - 0.5, 'steel', 0.5, 0x9e9e9e);
  };
  const heights1 = [18, 24, 20, 27, 22, 30, 19, 26, 25, 21, 28, 23];
  const xs1 = [-48, -42, -36, -30, -24, -18, -12, -6, 2, 15, 20, 44];
  xs1.forEach((px, i) => pencil(px, 37, 4, heights1[i], i));
  const heights2 = [32, 34, 40, 36, 44, 38, 42, 36, 37, 40];
  const xs2 = [-50, -45, -35, -25, -15, -5, 3, 16, 21, 44];
  xs2.forEach((px, i) => pencil(px, 45, 8, heights2[i], i + 3));

  // Peak Tramway (x 8..14, z 36..54): stepped bed, 0.5 m rails, two cars.
  for (let z = 36; z <= 54; z += 2) {
    const trackY = Math.max(0, Math.floor((z - 36) * 0.7) - 1);
    const steps = Math.max(1, Math.floor(trackY / 2) + 1);
    BOX(8, 0, z, 3, steps, 1, 'concrete', 2, 0x4e342e);
    const topY = steps * 2;
    if ((z < 40 || z > 42) && (z < 50 || z > 52)) {
      B(8.5, topY, z, 'steel', 0.5, 0xe0e0e0);
      B(9.5, topY, z, 'steel', 0.5, 0xe0e0e0);
      B(10.5, topY, z, 'steel', 0.5, 0xe0e0e0);
      B(11.5, topY, z, 'steel', 0.5, 0xe0e0e0);
    }
  }
  for (const carZ of [40, 50]) {
    for (let cz = carZ; cz <= carZ + 2; cz += 2) {
      const czTrackY = Math.max(0, Math.floor((cz - 36) * 0.7) - 1);
      const czTopY = (Math.max(1, Math.floor(czTrackY / 2) + 1)) * 2;
      for (let cx = 9; cx <= 11; cx++) {
        for (let zOff = 0; zOff < 2; zOff++) {
          B(cx, czTopY, cz + zOff, 'steel', 1, 0x880e4f);
          B(cx, czTopY + 1, cz + zOff, 'steel', [1, 0.5, 1], 0x880e4f);
          // centre pillar stays steel: glass cannot carry the roof course
          if (cx === 10) B(cx, czTopY + 1.5, cz + zOff, 'steel', [1, 0.5, 1], 0x880e4f);
          else B(cx, czTopY + 1.5, cz + zOff, 'glass', [1, 0.5, 1]);
          B(cx, czTopY + 2, cz + zOff, 'panel', 1, 0xfff8e1);
        }
      }
    }
  }

  // ------------------------------------------------------------
  // 11. THE PEAK TOWER (x -4..20, z 56..64): podium, open neck of four
  //     columns, a wok bowl of 8 m slats widening one cell per course, an
  //     orange rim and the Sky Terrace pavilion on top.
  // ------------------------------------------------------------
  BOX(-4, 0, 56, 12, 8, 4, 'concrete', 2, 0x37474f);                 // podium y 0..16
  for (const nx of [-2, 4, 10, 16]) BOX(nx, 16, 58, 1, 3, 2, 'concrete', 2, 0x455a64); // neck
  for (let c = 0; c < 7; c++) {
    const x0 = -4 - c, w = 24 + 2 * c;
    for (let i = 0; i < w; i++) B(x0 + i, 22 + c, 56, 'steel', [1, 1, 8], c % 2 ? 0xeceff1 : WHITE);
  }
  for (let i = 0; i < 36; i++) { B(-10 + i, 29, 56, 'steel', [1, 0.5, 0.5], 0xff6f00); B(-10 + i, 29, 63.5, 'steel', [1, 0.5, 0.5], 0xff6f00); }
  BOX(6, 29, 59, 4, 2, 2, 'panel', 1, 0xfafafa);                     // Sky Terrace pavilion

  // ------------------------------------------------------------
  // 12. NEON GANTRY SIGNS & STREET FURNITURE
  // ------------------------------------------------------------
  const neonSigns = [
    { x: -28, y: 8, z: 12, w: 4, h: 2, c: 0xff007f },
    { x: -16, y: 10, z: 12, w: 3, h: 2, c: 0x00f5d4 },
    { x: 16, y: 8, z: 12, w: 4, h: 2, c: 0xffb703 },
    { x: 30, y: 12, z: 12, w: 4, h: 2, c: 0xff5d8f },
  ];
  for (const ns of neonSigns) {
    BOX(ns.x, 0, ns.z, 1, ns.y, 1, 'steel', 1, 0x455a64);
    for (let dx = 0; dx < ns.w; dx++) {
      for (let dy = 0; dy < ns.h; dy++) B(ns.x + dx, ns.y + dy, ns.z, 'panel', 1, ns.c);
    }
  }
  for (let bx = -46; bx <= 46; bx += 8) {
    if (bx < -8 || bx > 8) bollard(sim, bx, -13);
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (lx < -8 || lx > 8) {
      lampPost(sim, lx, -11);
      planter(sim, lx + 4, -11, 2, 1);
      bench(sim, lx + 8, -11);
    }
  }

  // ------------------------------------------------------------
  // 13. HARBOUR FLOTILLA (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  // Sampans (7 pieces: 4-cube wood hull, two posts, a canopy) moored in
  // deterministic rows across the harbour, then single mooring buoys for the
  // last few blocks. Only the hull cubes are y=0 half-metre pieces.
  const sampanRows = [-40, -37, -34, -31, -22, -19, -16];
  const sampanAt = (x, z) => {
    const need = [[x, 0, z, 2, 0.5, 0.5]];
    for (const [px, py, pz, ex, ey, ez] of need) if (!freeCells(sim, px, py, pz, ex, ey, ez)) return 0;
    for (let i = 0; i < 4; i++) B(x + i * 0.5, 0, z, 'wood', 0.5, i % 2 ? 0x5d4037 : 0x6d4c41);
    B(x + 0.5, 0.5, z + 0.25, 'wood', [0.25, 0.75, 0.25], 0x3e2723);
    B(x + 1.25, 0.5, z + 0.25, 'wood', [0.25, 0.75, 0.25], 0x3e2723);
    B(x + 0.25, 1.25, z, 'panel', [1.5, 0.25, 0.5], 0xc9a25c);
    return 7;
  };
  let needed = TARGET_BLOCKS - sim.blocks.length;
  outer:
  for (const [ri, rz] of sampanRows.entries()) {
    for (let rx = ri % 2 ? -50.5 : -52; rx <= 50; rx += 3) { // staggered rows, not a grid
      if (needed < 7) break outer;
      if (rx > -10 && rx < 20 && rz > -31) continue; // pier, ferry and junk basin
      needed -= sampanAt(rx, rz);
    }
  }
  for (let rx = -53; rx <= 53 && needed > 0; rx += 1) {
    for (const rz of [-29, -26]) {
      if (needed <= 0) break;
      if (freeCells(sim, rx, 0, rz, 0.5, 0.5, 0.5)) { B(rx, 0, rz, 'rubber', 0.5, 0xff6f00); needed--; }
    }
  }

  sim.cameraBlockers = generateBlockers(sim, 6);

  sim.sceneDecor = {
    parks, plaza, sidewalks, roads, water, boardwalk, cobbles,
  };
}
