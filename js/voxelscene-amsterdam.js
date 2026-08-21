// Amsterdam Canals, Step-Gable Rowhouses & Windmills — Sandbox Scene (Act IV, chapter 16).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Amsterdam joins concentric historic canal rings with Dutch golden age architecture:
//
//   z -56..-40  Prinsengracht & Merchant Mansions: Concentric canal ring, 17th-century narrow
//               brick step-gable canal mansions with hoisting beams, and Royal Palace on Dam Square
//   z -40..12   Central Grachtengordel: Historic clinker brick quays, arched stone bridges,
//               and Windmill Gear Bot 🚲 on canal pedestal
//   z  12..66   Herengracht & De Gooyer Windmill: Outer canal ring with houseboats, octagonal
//               thatched windmill with spinning 4-blade lattice sails (y=0..32), and tulip gardens
//
// TRANSIT:
//   - Dutch electric blue & white city trams
//   - Glass-topped canal tour barges
//   - Cargo delivery barges
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 28,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const AMSTERDAM_VEHICLES = [
  // Damrak Boulevard (axis x, z -8..-2)
  { kind: 'bus', x: -38, z: -5, axis: 'x', color: 0x0288d1, roofColor: 0xffffff },     // Blue City Tram/Bus
  { kind: 'sedan', x: -14, z: -5, axis: 'x', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'sedan', x: 18, z: -5, axis: 'x', color: 0x2e7d32, roofColor: 0xffffff },

  // Rozengracht Avenue (axis x, z 44..50)
  { kind: 'bus', x: -28, z: 47, axis: 'x', color: 0x0288d1, roofColor: 0xffffff },
  { kind: 'sedan', x: 22, z: 47, axis: 'x', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'boxVan', x: 44, z: 47, axis: 'x', len: 5, color: 0xffffff, color2: 0xe65100 },
];

export const AMSTERDAM_ROAD_SPANS = [
  // 4 Arched Brick Bridges spanning north and south canals
  { minX: -36, maxX: -30, minZ: -48, maxZ: -40, minY: 4 },
  { minX: 30, maxX: 36, minZ: -48, maxZ: -40, minY: 4 },
  { minX: -36, maxX: -30, minZ: 12, maxZ: 20, minY: 4 },
  { minX: 30, maxX: 36, minZ: 12, maxZ: 20, minY: 4 },
];

export const AMSTERDAM_OPEN_GROUND = [];

export const AMSTERDAM_STREETS = [
  { x: -56, z: -8, w: 114, d: 6, axis: 'x' },   // Damrak Boulevard
  { x: -56, z: 44, w: 114, d: 6, axis: 'x' },   // Rozengracht Avenue

  // Prinsengracht Quay (x: -36..-30) split across canals
  { x: -36, z: -56, w: 6, d: 8, axis: 'z' },
  { x: -36, z: -40, w: 6, d: 52, axis: 'z' },
  { x: -36, z: 20, w: 6, d: 46, axis: 'z' },

  // Keizersgracht Quay (x: 30..36) split across canals
  { x: 30, z: -56, w: 6, d: 8, axis: 'z' },
  { x: 30, z: -40, w: 6, d: 52, axis: 'z' },
  { x: 30, z: 20, w: 6, d: 46, axis: 'z' },
];

export const AMSTERDAM_CROSSINGS = [
  [0, -18], [0, 14], [0, 42],
  [1, -8], [1, 26],
];

const TARGET_BLOCKS = 28000;
const SPAWN_X = 0;
const SPAWN_Z = 16;
const SPAWN_KEEPOUT = 4.0;

function canPlace(sim, x, y, z, s = 0.5) {
  const f = 4;
  const gx = Math.round(x * f);
  const gy = Math.round(y * f);
  const gz = Math.round(z * f);
  const fs = Math.round(s * f);
  for (let ix = 0; ix < fs; ix++) {
    for (let iy = 0; iy < fs; iy++) {
      for (let iz = 0; iz < fs; iz++) {
        if (sim.grid.has(`${gx + ix},${gy + iy},${gz + iz}`)) return false;
      }
    }
  }
  return true;
}

function inDecorRect(rx, rz, s, rects) {
  for (const r of rects) {
    if (rx < r.x + r.w && rx + s > r.x && rz < r.z + r.d && rz + s > r.z) return true;
  }
  return false;
}

export function buildAmsterdam(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 44 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // 2 Concentric Grachten Canal Rings (North: z -48..-40, South: z 12..20)
  water.push(
    { x: -56, z: -48, w: 114, d: 8, color: 0x00695c }, // Prinsengracht Canal Ring
    { x: -56, z: 12, w: 114, d: 8, color: 0x00695c },  // Herengracht Canal Ring
  );

  // Vondelpark & Keukenhof Tulip Gardens
  parks.push(
    { x: -52, z: -38, w: 14, d: 28, color: 0x2e7d32 }, // West Vondelpark
    { x: -50, z: 22, w: 14, d: 20, color: 0x388e3c },  // South Tulip Park
    { x: 38, z: 22, w: 18, d: 20, color: 0x43a047 },   // Windmill Mill Green
  );

  // Dam Square & Museumplein Plazas
  plaza.push(
    { x: -24, z: -24, w: 48, d: 14, color: 0xd7ccc8 }, // Dam Square Royal Concourse
    { x: -24, z: 22, w: 48, d: 12, color: 0xb0bec5 },  // Museumplein Concourse
  );

  boardwalk.push(
    { x: -54, z: -40, w: 108, d: 2, color: 0x6d4c41 }, // North Canal Quayside Pier
    { x: -54, z: 20, w: 108, d: 2, color: 0x6d4c41 },  // South Canal Quayside Pier
  );

  cobbles.push(
    { x: -24, z: -36, w: 48, d: 10, color: 0x8d6e63 }, // Historic Clinker Brick Quays
    { x: -24, z: 2, w: 48, d: 8, color: 0x795548 },    // Spui Book Market Cobbles
  );

  // Road network
  roads.push(
    { x: -56, z: -8, w: 114, d: 6, color: 0x37474f },  // Damrak Boulevard
    { x: -56, z: 36, w: 114, d: 6, color: 0x37474f },  // Rozengracht Avenue
    { x: -36, z: -56, w: 6, d: 8, axis: 'z', color: 0x37474f },
    { x: -36, z: -40, w: 6, d: 52, axis: 'z', color: 0x37474f },
    { x: 30, z: -56, w: 6, d: 8, axis: 'z', color: 0x37474f },
    { x: 30, z: -40, w: 6, d: 52, axis: 'z', color: 0x37474f },
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: -2, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: -11, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 42, w: 114, d: 2, color: 0xb0bec5 },
    { x: -56, z: 33, w: 114, d: 3, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. 17TH-CENTURY STEP-GABLE MERCHANT CANAL HOUSES
  // ------------------------------------------------------------
  // Row of 4 Narrow Step-Gable Canal Mansions (x: -24..-6, z: -36..-26, y: 0..18)
  for (let hx = -24; hx <= -6; hx += 5) {
    // Brick Facade & Ground Base
    BOX(hx, 0, -36, 2, 7, 5, 'brick', 2, 0xb71c1c);    // Red Dutch Clinker Brick (y: 0..14)
    // Stepped Gable Roof (y: 14..18)
    BOX(hx, 14, -36, 2, 1, 4, 'concrete', 2, 0xffffff); // White ornamental trim step 1
    BOX(hx, 16, -35, 2, 1, 2, 'concrete', 2, 0xffffff); // Step 2 + Hoisting Beam
  }

  // Row 2 East (x: 6..24, z: -36..-26, y: 0..18)
  for (let hx = 6; hx <= 24; hx += 5) {
    BOX(hx, 0, -36, 2, 7, 5, 'brick', 2, 0x4e342e);    // Dark Umber Brick (y: 0..14)
    BOX(hx, 14, -36, 2, 1, 4, 'concrete', 2, 0xd7ccc8);
    BOX(hx, 16, -35, 2, 1, 2, 'concrete', 2, 0xd7ccc8);
  }

  // ------------------------------------------------------------
  // 1. HISTORIC DUTCH WINDMILL (DE GOOYER OCTAGONAL TOWER)
  // ------------------------------------------------------------
  // Located at x 38..48, z 24..34, y 0..32 (10x10x32m)
  // Thatched Octagonal Wooden Base (y: 0..12)
  BOX(38, 0, 24, 5, 6, 5, 'wood', 2, 0x5d4037);       // Octagonal Mill Base (y: 0..12)
  // Wooden Gallery Balcony (y: 12..14)
  BOX(38, 12, 24, 5, 1, 5, 'wood', 2, 0x8d6e63);      // Stelling Gallery (y: 12..14)
  // Upper Windmill Cap & Shaft (y: 14..22)
  BOX(39, 14, 25, 4, 4, 4, 'wood', 2, 0x3e2723);      // Mill Cap (y: 14..22)

  // 4-Blade Canvas Lattice Sails (y: 14..32, in front of cap at z = 23)
  BOX(41, 14, 23, 1, 9, 1, 'wood', 2, 0xffffff);      // Vertical Sails (18m span)
  BOX(39, 22, 23, 1, 1, 1, 'wood', 2, 0xffffff);      // Left Horizontal Sail (x: 39..41)
  BOX(43, 22, 23, 1, 1, 1, 'wood', 2, 0xffffff);      // Right Horizontal Sail (x: 43..45)
  BOX(41, 22, 22, 1, 1, 1, 'steel', 1, 0xffd700);     // Golden Windmill Axle Hub

  // ------------------------------------------------------------
  // 2. ROYAL PALACE ON DAM SQUARE
  // ------------------------------------------------------------
  // Located at x -16..16, z -24..-12, y 0..22
  BOX(-16, 0, -24, 16, 9, 6, 'concrete', 2, 0xd7ccc8); // Sandstone Classical Facade (y: 0..18)
  BOX(-4, 18, -22, 4, 2, 4, 'panel', 2, 0x00838f);     // Central Cupola Dome (y: 18..22)

  // ------------------------------------------------------------
  // 3. MOMENTUM FRIEND: WINDMILL GEAR BOT 🚲
  // ------------------------------------------------------------
  // Located on Canal Quay Pedestal (x: 14..16, z: -12..-10, y: 0..8)
  BOX(14, 0, -12, 1, 2, 1, 'concrete', 2, 0x37474f); // Basalt Pedestal (y: 0..4)
  BOX(14, 4, -12, 1, 1, 1, 'steel', 2, 0xe65100);    // Dutch Orange Bike Body (y: 4..6)
  BOX(13, 5, -12, 1, 1, 1, 'steel', 1, 0xffd700);    // Left Spoke Gear
  BOX(16, 5, -12, 1, 1, 1, 'steel', 1, 0xffd700);    // Right Spoke Gear
  BOX(14, 6, -12, 1, 1, 1, 'panel', 1, 0xffffff);    // White Headlight & Tulip Basket

  // ------------------------------------------------------------
  // 4. CANAL HOUSEBOATS & TOUR BARGES
  // ------------------------------------------------------------
  // Houseboat on North Canal (x: -22..-10, z: -46..-42, y: 0..4)
  BOX(-22, 0, -46, 6, 1, 2, 'wood', 2, 0x5d4037);     // Wooden barge hull
  BOX(-20, 2, -45, 4, 1, 1, 'panel', 2, 0xffffff);    // White living cabin

  // Glass-Top Canal Tour Barge on South Canal (x: 8..22, z: 14..18, y: 0..4)
  BOX(8, 0, 14, 7, 1, 2, 'steel', 2, 0x0288d1);       // Blue hull
  BOX(10, 2, 14, 5, 1, 2, 'panel', 2, 0x81d4fa);      // Panoramic glass canopy

  // ------------------------------------------------------------
  // 5. CANAL BRIDGES & DECK SPANS
  // ------------------------------------------------------------
  // 4 Arched Brick Bridges spanning north and south canals (y: 0..6)
  BOX(-36, 0, -48, 3, 2, 4, 'brick', 2, 0xa1887f); // Bridge pier
  BOX(-36, 4, -48, 3, 1, 4, 'brick', 2, 0xb71c1c); // Bridge deck
  BOX(30, 0, -48, 3, 2, 4, 'brick', 2, 0xa1887f);
  BOX(30, 4, -48, 3, 1, 4, 'brick', 2, 0xb71c1c);
  BOX(-36, 0, 12, 3, 2, 4, 'brick', 2, 0xa1887f);
  BOX(-36, 4, 12, 3, 1, 4, 'brick', 2, 0xb71c1c);
  BOX(30, 0, 12, 3, 2, 4, 'brick', 2, 0xa1887f);
  BOX(30, 4, 12, 3, 1, 4, 'brick', 2, 0xb71c1c);

  // ------------------------------------------------------------
  // 6. STREET FURNITURE & BIKE RACKS
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 33) > 4 && Math.abs(bx + 33) > 4) {
      bollard(sim, bx, -10);
      bollard(sim, bx, 42);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx) >= 8 && Math.abs(lx - 33) > 4 && Math.abs(lx + 33) > 4) {
      lampPost(sim, lx, 0);
      planter(sim, lx + 4, 0, 2, 1);
      bench(sim, lx + 8, 0);
    }
  }

  // ------------------------------------------------------------
  // 7. DUTCH CLINKER BRICK & PAVING INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const amsterdamColors = [0xb71c1c, 0x8d6e63, 0xd7ccc8, 0x795548];
  const currentCount = sim.blocks.length;
  const needed = TARGET_BLOCKS - currentCount;
  const R = sim.boundsRect;
  const maxX0 = R.maxX - 0.5;
  const maxZ0 = R.maxZ - 0.5;

  const tryPlaceFiller = (rx, rz, allowWater = false) => {
    if (inDecorRect(rx, rz, 0.5, roads)) return false;
    if (!allowWater && inDecorRect(rx, rz, 0.5, water)) return false;
    if (Math.hypot(rx - SPAWN_X, rz - SPAWN_Z) < SPAWN_KEEPOUT) return false;
    if (!canPlace(sim, rx, 0, rz, 0.5)) return false;
    const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 4) + 4) % 4;
    B(rx, 0, rz, 'concrete', 0.5, amsterdamColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Pass 1: All dry land
    for (let rz = R.minZ; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Pass 2: Canal seabed coping
    for (let rz = R.minZ; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz, true)) placed++;
      }
    }
  }

  // Camera blockers
  sim.cameraBlockers = generateBlockers(sim, 6);

  // Decor surfaces
  sim.sceneDecor = {
    parks, plaza, sidewalks, roads, water, boardwalk, cobbles,
  };
}
