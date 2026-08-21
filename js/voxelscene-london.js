// London Tower Bridge, Big Ben & The Shard — Sandbox Scene (Act IV, chapter 15).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// London joins Gothic heritage along the River Thames to modern glass skyscrapers:
//
//   z -56..-16  Westminster & City of London: Palace of Westminster & Big Ben Elizabeth Tower (y=0..46),
//               Tower of London forecourt, Victoria Embankment, and Double-Decker Bus Bot 🚌
//   z -16..4    River Thames & Tower Bridge: River Thames waterway, iconic Tower Bridge twin Gothic
//               stone towers, high-level walkways (y=0..36), and Thames clipper boats
//   z   4..66   South Bank & Southwark: The Shard glass pyramid skyscraper (y=0..62), London Bridge
//               concourse, Borough Market cobblestones, and Victorian brick warehouses
//
// TRANSIT:
//   - Iconic London Black Cabs (TX4)
//   - Red AEC Routemaster Double-Decker Buses
//   - River Thames high-speed catamarans (Uber Boat by Thames Clippers)
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 45,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const LONDON_VEHICLES = [
  // Victoria Embankment (axis x, z -22..-16)
  { kind: 'bus', x: -38, z: -19, axis: 'x', color: 0xd32f2f, roofColor: 0xffffff },    // Red Double-Decker Bus
  { kind: 'sedan', x: -14, z: -19, axis: 'x', color: 0x212121, roofColor: 0x212121 },  // Black Cab
  { kind: 'sedan', x: 18, z: -19, axis: 'x', color: 0x212121, roofColor: 0x212121 },

  // Southwark Street (axis x, z 8..13)
  { kind: 'bus', x: -28, z: 10, axis: 'x', color: 0xd32f2f, roofColor: 0xffffff },
  { kind: 'sedan', x: 22, z: 10, axis: 'x', color: 0x212121, roofColor: 0x212121 },
  { kind: 'boxVan', x: 44, z: 10, axis: 'x', len: 5, color: 0xffffff, color2: 0x0288d1 },
];

export const LONDON_ROAD_SPANS = [
  // Tower Bridge central bascule drawbridge deck crossing over the River Thames
  { minX: 28, maxX: 34, minZ: -16, maxZ: 4, minY: 6 },
];

export const LONDON_OPEN_GROUND = [];

export const LONDON_STREETS = [
  { x: -56, z: -22, w: 114, d: 6, axis: 'x' },   // Victoria Embankment
  { x: -56, z: 8, w: 114, d: 5, axis: 'x' },     // Southwark Street
  { x: 28, z: -56, w: 6, d: 34, axis: 'z' },     // Tower Bridge Road North (ends at z=-22)
  { x: 28, z: 13, w: 6, d: 53, axis: 'z' },      // Tower Bridge Road South (starts at z=13)
  { x: -18, z: -56, w: 5, d: 34, axis: 'z' },    // Whitehall North (ends at z=-22)
  { x: -18, z: 13, w: 5, d: 53, axis: 'z' },     // Whitehall South (starts at z=13)
];

export const LONDON_CROSSINGS = [
  [0, -18], [0, 14], [0, 42],
  [1, -8], [1, 26],
];

const TARGET_BLOCKS = 45000;
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

export function buildLondon(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // River Thames Channel (z: -16..4, x: -56..58)
  water.push(
    { x: -56, z: -16, w: 114, d: 20, color: 0x00695c }, // River Thames Muddy Green Waters
  );

  // Victoria Tower Gardens & St. James's Park
  parks.push(
    { x: -52, z: -52, w: 20, d: 28, color: 0x2e7d32 }, // Parliament Square Lawn
    { x: -50, z: 16, w: 24, d: 42, color: 0x388e3c },  // Jubilee Gardens / South Bank Green
    { x: 38, z: 20, w: 16, d: 38, color: 0x43a047 },   // Potters Fields Park
  );

  // Tower of London Concourse & Southwark Station Plazas
  plaza.push(
    { x: 14, z: -52, w: 40, d: 30, color: 0xd7ccc8 }, // Tower of London Moat Forecourt
    { x: 12, z: 14, w: 42, d: 46, color: 0xb0bec5 },  // London Bridge / Shard Concourse
    { x: -26, z: -52, w: 20, d: 28, color: 0xe0e0e0 }, // Westminster Abbey Plaza
  );

  boardwalk.push(
    { x: -54, z: -18, w: 108, d: 2, color: 0x6d4c41 }, // Albert Embankment Wooden Pier
    { x: -54, z: 4, w: 108, d: 2, color: 0x6d4c41 },   // Queen's Walk South Bank Pier
  );

  cobbles.push(
    { x: -24, z: -26, w: 48, d: 4, color: 0x9e9e9e },  // Victoria Embankment Cobbles
    { x: -24, z: 6, w: 48, d: 2, color: 0x757575 },    // Borough Market Cobblestones
  );

  // Road network
  roads.push(
    { x: -56, z: -22, w: 114, d: 6, color: 0x37474f },  // Victoria Embankment
    { x: -56, z: 8, w: 114, d: 5, color: 0x37474f },    // Southwark Street
    { x: 28, z: -56, w: 6, d: 34, axis: 'z', color: 0x37474f }, // Tower Bridge Road North
    { x: 28, z: 13, w: 6, d: 53, axis: 'z', color: 0x37474f },  // Tower Bridge Road South
    { x: -18, z: -56, w: 5, d: 34, axis: 'z', color: 0x37474f }, // Whitehall North
    { x: -18, z: 13, w: 5, d: 53, axis: 'z', color: 0x37474f },  // Whitehall South
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: -25, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 13, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 5, w: 114, d: 3, color: 0xb0bec5 },
    { x: 25, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: 34, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: 25, z: 13, w: 3, d: 53, color: 0xb0bec5 },
    { x: 34, z: 13, w: 3, d: 53, color: 0xb0bec5 },
    { x: -21, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: -13, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: -21, z: 13, w: 3, d: 53, color: 0xb0bec5 },
    { x: -13, z: 13, w: 3, d: 53, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. TOWER BRIDGE (DUAL GOTHIC SUSPENSION TOWERS & BASCULES)
  // ------------------------------------------------------------
  // Spanning River Thames at x 26..36, z -16..4, y 0..36
  // North Tower (x: 26..36, z: -14..-6, y: 0..36)
  BOX(26, 0, -14, 5, 15, 4, 'concrete', 2, 0xd7ccc8); // Portland Stone Base & Walls (y: 0..30)
  BOX(26, 30, -14, 5, 3, 4, 'steel', 2, 0x00838f);    // Victorian Blue/Copper Spire (y: 30..36)

  // South Tower (x: 26..36, z: -4..4, y: 0..36)
  BOX(26, 0, -4, 5, 15, 4, 'concrete', 2, 0xd7ccc8);  // Portland Stone Base (y: 0..30)
  BOX(26, 30, -4, 5, 3, 4, 'steel', 2, 0x00838f);     // Copper Spire (y: 30..36)

  // Bascule Drawbridge Central Road Deck & Piers (y: 0..8, x: 28..34, z: -6..-4)
  BOX(28, 0, -6, 3, 4, 1, 'concrete', 2, 0xa1887f);  // Pier & deck (y: 0..8)

  // ------------------------------------------------------------
  // 1. PALACE OF WESTMINSTER & BIG BEN (ELIZABETH TOWER)
  // ------------------------------------------------------------
  // Located at x -48..-20, z -48..-24, y 0..46
  // Parliamentary Hall (x: -48..-20, z: -48..-32, y: 0..18)
  BOX(-48, 0, -48, 14, 9, 8, 'concrete', 2, 0xd7ccc8); // Sandstone Gothic Hall
  BOX(-48, 18, -48, 14, 2, 8, 'steel', 2, 0x455a64);   // Slate Roof with Turrets

  // Elizabeth Tower / Big Ben Clocktower (x: -44..-34, z: -32..-22, y: 0..46)
  BOX(-44, 0, -32, 5, 15, 5, 'concrete', 2, 0xd7ccc8); // Main Sandstone Shaft (y: 0..30)
  // 4 Illuminated Great Clock Dials (y: 30..36)
  BOX(-44, 30, -32, 5, 3, 5, 'panel', 2, 0xfff9c4);    // Glowing Opal Clock Faces
  // Neo-Gothic Lantern Spire & Belfry (y: 36..46)
  BOX(-44, 36, -32, 5, 4, 5, 'steel', 2, 0xffd700);    // Gilded Spire Pinnacle
  BOX(-42, 44, -30, 3, 1, 3, 'steel', 2, 0xffb300);    // Spire Finial (y: 44..46)

  // ------------------------------------------------------------
  // 2. THE SHARD (GLASS PYRAMID SUPERTALL SKYSCRAPER)
  // ------------------------------------------------------------
  // Located at x 12..26, z 24..38, y 0..62 (14x14x62m)
  // Tier 1 Base (y: 0..20, 14x14m)
  BOX(12, 0, 24, 7, 10, 7, 'panel', 2, 0x81d4fa);
  // Tier 2 Mid-Section (y: 20..38, 10x10m)
  BOX(14, 20, 26, 5, 9, 5, 'panel', 2, 0x4fc3f7);
  // Tier 3 Upper Section (y: 38..52, 6x6m)
  BOX(16, 38, 28, 3, 7, 3, 'panel', 2, 0x0288d1);
  // Shattered Glass Spire Pinnacle (y: 52..62, x: 18..20, z: 30..32)
  BOX(18, 52, 30, 1, 5, 1, 'steel', 2, 0xe0e0e0);

  // ------------------------------------------------------------
  // 3. MOMENTUM FRIEND: DOUBLE-DECKER BUS BOT 🚌
  // ------------------------------------------------------------
  // Located on Westminster Promenade (x: -8..-6, z: -26..-24, y: 0..8)
  BOX(-8, 0, -26, 1, 2, 1, 'concrete', 2, 0x37474f); // Pedestal (y: 0..4)
  BOX(-8, 4, -26, 1, 1, 1, 'steel', 2, 0xd32f2f);    // Crimson Bus Body (y: 4..6)
  BOX(-9, 5, -26, 1, 1, 1, 'panel', 1, 0xffffff);    // Destination Blind "HERO"
  BOX(-6, 5, -26, 1, 1, 1, 'panel', 1, 0xffd700);    // Route Number Finial
  BOX(-8, 6, -26, 1, 1, 1, 'steel', 1, 0xffffff);    // White Upper Roof Deck

  // ------------------------------------------------------------
  // 4. HISTORIC SOUTHWARK BRICK WAREHOUSES & PUBS
  // ------------------------------------------------------------
  BOX(-36, 0, 16, 6, 8, 8, 'brick', 2, 0x5d4037);     // Victorian London Stock Brick (y: 0..16)
  BOX(40, 0, -50, 6, 7, 6, 'brick', 2, 0x8d6e63);

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & RED TELEPHONE BOXES
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 28) > 4 && Math.abs(bx + 18) > 4 && Math.abs(bx + 34) > 4) {
      bollard(sim, bx, -24);
      bollard(sim, bx, 6);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx) >= 8 && Math.abs(lx - 28) > 4 && Math.abs(lx + 18) > 4 && Math.abs(lx + 34) > 4) {
      lampPost(sim, lx, 14);
      planter(sim, lx + 4, 14, 2, 1);
      bench(sim, lx + 8, 14);
    }
  }

  // ------------------------------------------------------------
  // 6. PORTLAND STONE & GRAVEL INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const londonColors = [0xd7ccc8, 0xbcaaa4, 0xb0bec5, 0x9e9e9e];
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
    B(rx, 0, rz, 'concrete', 0.5, londonColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Course A: Westminster & North Bank (z = -24 down to R.minZ, x = R.minX to maxX0, y = 0)
    for (let rz = -24; rz >= R.minZ && placed < needed; rz -= 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course B: South Bank & Southwark (z = 4 to maxZ0, x = R.minX to maxX0, y = 0)
    for (let rz = 4; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course C: River Thames Riverbed Coping (z = -16 to 4, x = R.minX to maxX0, y = 0)
    for (let rz = -16; rz <= 4 && placed < needed; rz += 0.5) {
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
