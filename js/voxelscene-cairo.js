// Cairo & Giza Limestone Pyramids, Nile Feluccas & Citadel — Sandbox Scene (Act III, chapter 11).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Cairo joins the ancient limestone Giza Plateau with the historic River Nile:
//
//   x -56..-28  River Nile Channel: Azure Nile waters, traditional wooden feluccas with white lateen sails
//   x -28..-18  Corniche El Nil & Riverfront: Palm-lined riverbanks, wharves, and Scarab Gear Bot 🪲
//   x -18..56   Giza Plateau & Saladin Citadel: Khufu & Khafre limestone pyramids (y=0..36), recumbent
//               Great Sphinx of Giza, Mosque of Muhammad Ali twin pencil minarets (y=0..44)
//
// TRANSIT:
//   - White & black Cairo Peugeot 504 and Hyundai taxis
//   - River Nile passenger feluccas & tourist cruise launches
//   - Citadel tourist minibuses
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 32,500 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const CAIRO_VEHICLES = [
  // Sharia Al-Ahram (axis x, z 2..8)
  { kind: 'sedan', x: -14, z: 5, axis: 'x', color: 0xffffff, roofColor: 0x212121 },   // Cairo White Taxi
  { kind: 'sedan', x: 22, z: 5, axis: 'x', color: 0x212121, roofColor: 0xffffff },    // Black Sedan
  { kind: 'bus', x: 44, z: 5, axis: 'x', color: 0xffb300, roofColor: 0xffffff },      // Tourist Minibus

  // Corniche El Nil (axis z, x -24..-18)
  { kind: 'sedan', x: -21, z: -38, axis: 'z', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'sedan', x: -21, z: 24, axis: 'z', color: 0xd32f2f, roofColor: 0xffffff },
];

export const CAIRO_ROAD_SPANS = [];

export const CAIRO_OPEN_GROUND = [];

export const CAIRO_STREETS = [
  { x: -18, z: 2, w: 74, d: 6, axis: 'x' },     // Sharia Al-Ahram
  { x: -18, z: 54, w: 74, d: 5, axis: 'x' },    // Citadel Ring Road
  { x: -24, z: -56, w: 6, d: 118, axis: 'z' },  // Corniche El Nil
  { x: 12, z: 8, w: 5, d: 46, axis: 'z' },      // Al-Qalaa Approach
];

export const CAIRO_CROSSINGS = [
  [0, -12], [0, 20],
  [1, 6], [1, 38],
];

const TARGET_BLOCKS = 32500;
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

export function buildCairo(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // River Nile Channel (x: -56..-28, z: -56..64)
  water.push(
    { x: -56, z: -56, w: 28, d: 120, color: 0x0288d1 }, // River Nile Main Stream
  );

  // Nile Valley Palm Groves & Al-Azhar Hillside Parks
  parks.push(
    { x: -18, z: -20, w: 14, d: 20, color: 0x388e3c }, // Nile Palm Oasis
    { x: -18, z: 12, w: 14, d: 38, color: 0x43a047 },  // Corniche Park Green
    { x: 38, z: 10, w: 16, d: 20, color: 0x2e7d32 },   // Al-Azhar Hill Gardens
  );

  // Giza Plateau Desert Base & Citadel Historic Courts
  plaza.push(
    { x: -6, z: -52, w: 60, d: 48, color: 0xd7ccc8 }, // Giza Plateau Limestone Podium
    { x: 14, z: 12, w: 40, d: 48, color: 0xbcaaa4 },  // Saladin Citadel Concourse
  );

  boardwalk.push(
    { x: -28, z: -50, w: 4, d: 108, color: 0x795548 }, // Nile Wharf Wooden Pier
  );

  cobbles.push(
    { x: -6, z: -6, w: 24, d: 8, color: 0xffecb3 },   // Sphinx Desert Causeways
    { x: 20, z: 10, w: 18, d: 12, color: 0x8d6e63 },  // Bab al-Azab Fort Cobbles
  );

  // Roads
  roads.push(
    { x: -18, z: 2, w: 74, d: 6, color: 0x37474f },    // Sharia Al-Ahram
    { x: -18, z: 54, w: 74, d: 5, color: 0x37474f },   // Citadel Ring Road
    { x: -24, z: -56, w: 6, d: 118, axis: 'z', color: 0x37474f }, // Corniche El Nil
    { x: 12, z: 8, w: 5, d: 46, axis: 'z', color: 0x37474f },     // Al-Qalaa Approach
  );

  // Sidewalks
  sidewalks.push(
    { x: -18, z: 8, w: 74, d: 3, color: 0xb0bec5 },
    { x: -18, z: -1, w: 74, d: 3, color: 0xb0bec5 },
    { x: -18, z: 59, w: 74, d: 3, color: 0xb0bec5 },
    { x: -18, z: 51, w: 74, d: 3, color: 0xb0bec5 },
    { x: -18, z: -56, w: 3, d: 118, color: 0xb0bec5 },
    { x: 7, z: 8, w: 5, d: 46, color: 0xb0bec5 },
    { x: 17, z: 8, w: 5, d: 46, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. GREAT PYRAMIDS OF GIZA (KHUFU & KHAFRE)
  // ------------------------------------------------------------
  // Great Pyramid of Khufu (x: 18..46, z: -46..-18, y: 0..36, 28x28m base)
  BOX(18, 0, -46, 14, 4, 14, 'concrete', 2, 0xd7ccc8);  // Tier 1 (28x28m, y: 0..8)
  BOX(20, 8, -44, 12, 4, 12, 'concrete', 2, 0xd7ccc8);  // Tier 2 (24x24m, y: 8..16)
  BOX(22, 16, -42, 10, 4, 10, 'concrete', 2, 0xcfd8dc); // Tier 3 (20x20m, y: 16..24)
  BOX(24, 24, -40, 8, 4, 8, 'concrete', 2, 0xcfd8dc);   // Tier 4 (16x16m, y: 24..32)
  BOX(27, 32, -37, 5, 2, 5, 'steel', 2, 0xffd700);      // Gilded Pyramidion Summit (y: 32..36)

  // Pyramid of Khafre (x: -4..14, z: -48..-30, y: 0..26, 18x18m base)
  BOX(-4, 0, -48, 9, 3, 9, 'concrete', 2, 0xbcaaa4);   // Tier 1 (18x18m, y: 0..6)
  BOX(-2, 6, -46, 7, 3, 7, 'concrete', 2, 0xbcaaa4);   // Tier 2 (14x14m, y: 6..12)
  BOX(0, 12, -44, 5, 3, 5, 'concrete', 2, 0xa1887f);   // Tier 3 (10x10m, y: 12..18)
  BOX(2, 18, -42, 3, 3, 3, 'concrete', 2, 0x8d6e63);   // Original Casing Cap (y: 18..24)
  BOX(3, 24, -41, 2, 1, 2, 'steel', 2, 0xffb300);      // Summit Finial (y: 24..26)

  // ------------------------------------------------------------
  // 1. GREAT SPHINX OF GIZA
  // ------------------------------------------------------------
  // Located at x -6..6, z: -18..-6, y: 0..12
  // Limestone Recumbent Lion Body (x: -6..6, z: -18..-6, y: 0..6)
  BOX(-6, 0, -18, 6, 3, 6, 'concrete', 2, 0xd7ccc8);
  // Extended Forepaws (x: -4..-2 and 2..4, z: -6..-2, y: 0..2)
  BOX(-4, 0, -6, 1, 1, 2, 'concrete', 2, 0xbcaaa4);
  BOX(2, 0, -6, 1, 1, 2, 'concrete', 2, 0xbcaaa4);

  // Pharaonic Nemes Head & Royal Headdress (y: 6..12, x: -2..2, z: -16..-12)
  BOX(-2, 6, -16, 2, 3, 2, 'concrete', 2, 0xffecb3); // Head
  BOX(-4, 8, -16, 1, 2, 2, 'panel', 2, 0x0288d1);    // Nemes Left Flap
  BOX(2, 8, -16, 1, 2, 2, 'panel', 2, 0x0288d1);     // Nemes Right Flap
  BOX(-1, 12, -15, 1, 1, 1, 'steel', 2, 0xffd700);   // Uraeus Cobra Crest

  // ------------------------------------------------------------
  // 2. CAIRO CITADEL & MOSQUE OF MUHAMMAD ALI
  // ------------------------------------------------------------
  // Fortress Bastions & Ramparts (x: 20..50, z: 20..50, y: 0..16)
  BOX(20, 0, 20, 15, 8, 15, 'concrete', 2, 0xa1887f); // Fortress Plinth (y: 0..16)
  // Crenellated Parapets
  for (let cx = 20; cx <= 48; cx += 4) {
    BOX(cx, 16, 20, 1, 1, 1, 'brick', 2, 0x8d6e63);
    BOX(cx, 16, 48, 1, 1, 1, 'brick', 2, 0x8d6e63);
  }

  // Mosque Grand Central Silver Dome (y: 16..28, x: 28..42, z: 28..42)
  BOX(28, 16, 28, 7, 4, 7, 'panel', 2, 0xb0bec5); // Ottoman Central Dome (y: 16..24)
  BOX(32, 24, 32, 3, 2, 3, 'steel', 2, 0xffd700);  // Crescent Finial (y: 24..28)

  // Twin Slender Ottoman Pencil Minarets (y: 16..44)
  // Minaret 1 (North-East: x 22, z 22)
  BOX(22, 16, 22, 1, 12, 1, 'concrete', 2, 0xd7ccc8); // Shaft (y: 16..40)
  BOX(22, 40, 22, 1, 2, 1, 'steel', 2, 0xffd700);     // Conical Spire (y: 40..44)
  // Minaret 2 (South-West: x 46, z 46)
  BOX(46, 16, 46, 1, 12, 1, 'concrete', 2, 0xd7ccc8);
  BOX(46, 40, 46, 1, 2, 1, 'steel', 2, 0xffd700);

  // ------------------------------------------------------------
  // 3. RIVER NILE FELUCCA SAILING BOATS
  // ------------------------------------------------------------
  // Felucca 1 (x: -46..-36, z: -32..-28, y: 0..12)
  BOX(-46, 0, -32, 5, 1, 2, 'wood', 2, 0x5d4037); // Wooden Hull (y: 0..2)
  BOX(-42, 2, -32, 1, 5, 1, 'wood', 2, 0x8d6e63); // Mast (y: 2..12)
  BOX(-44, 2, -30, 4, 2, 1, 'wood', 2, 0x5d4037); // Boom & Yardarm Spars (y: 2..6)
  BOX(-44, 6, -30, 4, 3, 1, 'panel', 2, 0xffffff); // White Lateen Sail (y: 6..12)

  // Felucca 2 (x: -44..-34, z: 20..24, y: 0..12)
  BOX(-44, 0, 20, 5, 1, 2, 'wood', 2, 0x5d4037);  // Hull (y: 0..2)
  BOX(-40, 2, 20, 1, 5, 1, 'wood', 2, 0x8d6e63);  // Mast (y: 2..12)
  BOX(-42, 2, 22, 4, 2, 1, 'wood', 2, 0x5d4037);  // Boom (y: 2..6)
  BOX(-42, 6, 22, 4, 3, 1, 'panel', 2, 0xfff8e1); // Sail (y: 6..12)

  // ------------------------------------------------------------
  // 4. MOMENTUM FRIEND: SCARAB GEAR BOT 🪲
  // ------------------------------------------------------------
  // Located on Pedestal on Corniche (x: -14..-12, z: 12..14, y: 0..8)
  BOX(-14, 0, 12, 1, 2, 1, 'concrete', 2, 0x37474f); // Basalt Pedestal (y: 0..4)
  BOX(-14, 4, 12, 1, 1, 1, 'steel', 2, 0x00bcd4);    // Lapis/Turquoise Shell (y: 4..6)
  BOX(-15, 5, 12, 1, 1, 1, 'steel', 1, 0xffd700);    // Gold Wing Flap Left
  BOX(-12, 5, 12, 1, 1, 1, 'steel', 1, 0xffd700);    // Gold Wing Flap Right
  BOX(-14, 6, 12, 1, 1, 1, 'panel', 1, 0x7cb342);    // Scarab Emerald Head

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & CORNICHE LIGHTING
  // ------------------------------------------------------------
  for (let bx = -14; bx <= 46; bx += 8) {
    if (Math.abs(bx - 12) > 4) {
      bollard(sim, bx, 0);
      bollard(sim, bx, 52);
    }
  }
  for (let lz = -48; lz <= 32; lz += 16) {
    if (lz !== 0) {
      lampPost(sim, -16, lz);
      planter(sim, -16, lz + 4, 1, 2);
      bench(sim, -16, lz + 8);
    }
  }

  // ------------------------------------------------------------
  // 6. LIMESTONE & DESERT INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const limestoneColors = [0xd7ccc8, 0xbcaaa4, 0xa1887f, 0xffecb3];
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
    B(rx, 0, rz, 'concrete', 0.5, limestoneColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Course A: Giza Plateau & Desert (z = -24 down to R.minZ, x = -18 to maxX0, y = 0)
    for (let rz = -24; rz >= R.minZ && placed < needed; rz -= 0.5) {
      for (let rx = -18; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course B: Central Corniche & Al-Ahram (z = -20 to 20, x = -18 to maxX0, y = 0)
    for (let rz = -20; rz <= 20 && placed < needed; rz += 0.5) {
      for (let rx = -18; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course C: Saladin Citadel District (z = 24 to maxZ0, x = -18 to maxX0, y = 0)
    for (let rz = 24; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = -18; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course D: River Nile Riverbed Coping (x = R.minX to -28, z = R.minZ to maxZ0, y = 0)
    for (let rz = R.minZ; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= -28 && placed < needed; rx += 0.5) {
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
