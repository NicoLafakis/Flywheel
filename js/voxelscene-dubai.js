// Dubai Burj Khalifa, Palm Monorail & Sail Hotel — Sandbox Scene (Act III, chapter 10).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Dubai rises between desert sand dunes and the Persian Gulf:
//
//   z -56..-32  Persian Gulf Coast & Burj Al Arab: Blue Gulf waters, Sail Hotel Tower (y=0..38),
//               and island beach concourse
//   z -32..20   Sheikh Zayed Road & Downtown Dubai: Burj Khalifa needle tower (y=0..68), Dubai Mall
//               concourse, Falcon Sky Bot 🦅 on gold pedestal, and luxury supercar traffic
//   z  20..66   Palm Jumeirah & Monorail Corridor: Elevated monorail viaduct, Palm transit train,
//               desert resort villas and oasis parklands
//
// TRANSIT:
//   - Gold & crimson luxury supercars on Sheikh Zayed Expressway
//   - White airport luxury shuttles & Dubai taxis
//   - Palm Jumeirah Monorail 4-car transit train
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 36,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const DUBAI_VEHICLES = [
  // Sheikh Zayed Road (axis x, z -24..-18)
  { kind: 'sedan', x: -40, z: -21, axis: 'x', color: 0xffd700, roofColor: 0x212121 }, // Gold Supercar
  { kind: 'sedan', x: -16, z: -21, axis: 'x', color: 0xd50000, roofColor: 0xffffff }, // Crimson GT
  { kind: 'bus', x: 18, z: -21, axis: 'x', color: 0xffffff, roofColor: 0xffd700 },    // Airport Shuttle
  { kind: 'sedan', x: 42, z: -21, axis: 'x', color: 0xffd700, roofColor: 0x212121 },

  // Financial Centre Way (axis z, x 28..32)
  { kind: 'sedan', x: 30, z: 2, axis: 'z', color: 0xffffff, roofColor: 0xd50000 },
  { kind: 'boxVan', x: 30, z: 36, axis: 'z', len: 5, color: 0xffffff, color2: 0x0288d1 },
];

export const DUBAI_ROAD_SPANS = [
  { minX: -36, maxX: -32, minZ: 44, maxZ: 48, minY: 6 },
  { minX: 28, maxX: 32, minZ: 44, maxZ: 48, minY: 6 },
];

export const DUBAI_OPEN_GROUND = [];

export const DUBAI_STREETS = [
  { x: -56, z: -24, w: 114, d: 6, axis: 'x' },  // Sheikh Zayed Road
  { x: -56, z: 20, w: 114, d: 5, axis: 'x' },   // Al Safa Street
  { x: 28, z: -32, w: 4, d: 98, axis: 'z' },    // Financial Centre Way
  { x: -36, z: -32, w: 4, d: 98, axis: 'z' },   // Al Mustaqbal Street
];

export const DUBAI_CROSSINGS = [
  [0, -18], [0, 14], [0, 42],
  [1, -8], [1, 26],
];

const TARGET_BLOCKS = 36000;
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

export function buildDubai(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // Persian Gulf Coastal Waters (z: -56..-32, x: -56..58)
  water.push(
    { x: -56, z: -56, w: 114, d: 24, color: 0x00838f },
  );

  // Zabeel & Safa Park Palms
  parks.push(
    { x: -52, z: 28, w: 32, d: 32, color: 0x2e7d32 },  // Safa Park Oasis
    { x: 36, z: 28, w: 20, d: 32, color: 0x388e3c },   // Zabeel Gardens
  );

  // Downtown Dubai Mall & Burj Lake Concourse
  plaza.push(
    { x: -26, z: -16, w: 52, d: 34, color: 0xd7ccc8 }, // Burj Khalifa Concourse & Lake
    { x: 12, z: -32, w: 44, d: 8, color: 0xffecb3 },   // Jumeirah Beach Sand & Marina
  );

  boardwalk.push(
    { x: 10, z: -32, w: 46, d: 3, color: 0x8d6e63 },   // Jumeirah Beach Boardwalk
  );

  cobbles.push(
    { x: -52, z: -16, w: 22, d: 34, color: 0x90a4ae },  // DIFC Promenade
  );

  // Road network
  roads.push(
    { x: -56, z: -24, w: 114, d: 6, color: 0x37474f }, // Sheikh Zayed Road
    { x: -56, z: 20, w: 114, d: 5, color: 0x37474f },  // Al Safa Street
    { x: 28, z: -32, w: 4, d: 98, axis: 'z', color: 0x37474f },  // Financial Centre Way
    { x: -36, z: -32, w: 4, d: 98, axis: 'z', color: 0x37474f }, // Al Mustaqbal Street
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: -18, w: 114, d: 2, color: 0xb0bec5 },
    { x: -56, z: -27, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 25, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 17, w: 114, d: 3, color: 0xb0bec5 },
    { x: 25, z: -32, w: 3, d: 98, color: 0xb0bec5 },
    { x: 32, z: -32, w: 3, d: 98, color: 0xb0bec5 },
    { x: -39, z: -32, w: 3, d: 98, color: 0xb0bec5 },
    { x: -32, z: -32, w: 3, d: 98, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. BURJ KHALIFA (SUPERTALL NEEDLE SPIRE)
  // ------------------------------------------------------------
  // Located at central downtown (x -8..8, z -8..8, y 0..68)
  // Tier 1 Base Podium (y: 0..12, 16x16m)
  BOX(-8, 0, -8, 8, 6, 8, 'concrete', 2, 0xe0e0e0);
  // Tier 2 Y-Shaped Wings (y: 12..28, 12x12m)
  BOX(-6, 12, -6, 6, 8, 6, 'panel', 2, 0x81d4fa);
  // Tier 3 Middle Tower (y: 28..44, 8x8m)
  BOX(-4, 28, -4, 4, 8, 4, 'panel', 2, 0x4fc3f7);
  // Tier 4 Upper Tower (y: 44..56, 4x4m)
  BOX(-2, 44, -2, 2, 6, 2, 'panel', 2, 0x0288d1);
  // Tier 5 Steel Needle Spire (y: 56..64, 2x2m)
  BOX(-1, 56, -1, 1, 4, 1, 'steel', 2, 0xe0e0e0);
  // Antenna Pinnacle Beacon (y: 64..68)
  BOX(0, 64, 0, 1, 4, 1, 'steel', 1, 0xff1744);

  // ------------------------------------------------------------
  // 1. BURJ AL ARAB (SAIL HOTEL TOWER)
  // ------------------------------------------------------------
  // Located on private island at x 38..50, z -50..-38, y 0..38
  // Island Foundation Podium (x: 38..50, z: -50..-38, y: 0..4)
  BOX(38, 0, -50, 6, 2, 6, 'concrete', 2, 0xffecb3);
  // Main Sail White Atrium Facade (y: 4..32, x: 40..48, z: -48..-40)
  BOX(40, 4, -48, 4, 14, 4, 'panel', 2, 0xffffff);
  // Upper Observation Deck & Skyview Lounge (y: 32..38, x: 40..48, z: -48..-40)
  BOX(40, 32, -48, 4, 3, 4, 'steel', 2, 0x0288d1);

  // ------------------------------------------------------------
  // 2. MOMENTUM FRIEND: FALCON SKY BOT 🦅
  // ------------------------------------------------------------
  // Located on Gold Pedestal in Burj Plaza (x: -16..-14, z: 6..8, y: 0..8)
  BOX(-16, 0, 6, 1, 2, 1, 'concrete', 2, 0xffd700); // Golden Pedestal (y: 0..4)
  BOX(-16, 4, 6, 1, 1, 1, 'steel', 2, 0xffb300);    // Falcon Bot Body (y: 4..6)
  BOX(-17, 5, 6, 1, 1, 1, 'steel', 1, 0xffd54f);    // Left Wing
  BOX(-14, 5, 6, 1, 1, 1, 'steel', 1, 0xffd54f);    // Right Wing
  BOX(-16, 6, 6, 1, 1, 1, 'panel', 1, 0xff1744);    // Ruby Eye Sensor

  // ------------------------------------------------------------
  // 3. PALM JUMEIRAH MONORAIL CORRIDOR & VIADUCT
  // ------------------------------------------------------------
  // Solid Elevated Monorail Viaduct Piers & Deck (y: 0..8, z: 44..48, x: -52..52)
  for (let px = -52; px <= 48; px += 4) {
    if (px === -36 || px === 28) {
      // Over-road single 4m span: steel truss deck at y=6..8
      BOX(px, 6, 44, 2, 1, 2, 'steel', 2, 0xcfd8dc);
    } else {
      // Grounded Viaduct Base (y: 0..8)
      BOX(px, 0, 44, 2, 4, 2, 'concrete', 2, 0xcfd8dc);
    }
  }
  // Palm Transit 4-Car Monorail Train (y: 8..12, x: -16..16, z: 44..48)
  BOX(-16, 8, 44, 16, 2, 2, 'steel', 2, 0x0288d1);
  BOX(-12, 12, 44, 12, 1, 2, 'panel', 2, 0x81d4fa); // Glass Panorama Canopy

  // ------------------------------------------------------------
  // 4. DUBAI FINANCIAL TOWERS & LUXURY VILLAS
  // ------------------------------------------------------------
  // DIFC Gate Building (x: -52..-40, z: -14..-2, y: 0..24)
  BOX(-52, 0, -14, 6, 12, 6, 'concrete', 2, 0xffecb3);
  BOX(-52, 24, -14, 6, 1, 6, 'panel', 2, 0x00838f);

  // Dubai Mall Pavilions (x: 14..26, z: -14..-2, y: 0..16)
  BOX(14, 0, -14, 6, 8, 6, 'concrete', 2, 0xd7ccc8);

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & PALM TREES
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 30) > 4 && Math.abs(bx + 34) > 4) {
      bollard(sim, bx, -26);
      bollard(sim, bx, 26);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx - 30) > 4 && Math.abs(lx + 34) > 4) {
      lampPost(sim, lx, -16);
      planter(sim, lx + 4, -16, 2, 1);
      bench(sim, lx + 8, -16);
    }
  }

  // ------------------------------------------------------------
  // 6. DESERT QUARTZ & PLAZA INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const quartzColors = [0xfff8e1, 0xffecb3, 0xffe082, 0xd7ccc8];
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
    B(rx, 0, rz, 'concrete', 0.5, quartzColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Course A: Downtown & Burj Lake (z = -26 to 18, x = R.minX to maxX0, y = 0)
    for (let rz = -26; rz <= 18 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course B: Palm Jumeirah & South Oasis (z = 24 to maxZ0, x = R.minX to maxX0, y = 0)
    for (let rz = 24; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course C: Persian Gulf Coastal Seabed Coping (z = -28 down to R.minZ, x = R.minX to maxX0, y = 0)
    for (let rz = -28; rz >= R.minZ && placed < needed; rz -= 0.5) {
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
