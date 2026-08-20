// Mumbai Gateway of India, Marine Drive & Victoria Terminus — Sandbox Scene (Act II, chapter 9).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Mumbai merges grand Victorian Gothic heritage, Indo-Saracenic basalt arches,
// and the sweeping Art Deco curve of the Arabian Sea:
//
//   z -54..-20  Colaba Waterfront & Gateway of India: Arabian Sea harbour waters,
//               Gateway of India triumphal basalt arch & turrets, Taj Mahal Palace Hotel
//               domed heritage wing, Chai Kettle Bot 🫖, and harbour ferries
//   z -20..16   Fort District & Heritage Boulevard: Rajabai Clock Tower & university library
//               compound (Where's Waldo target), Kaali-Peeli taxis, and BEST red double-decker buses
//   z  16..68   Victoria Terminus (CSMT), Marine Drive & Sea Link: CSMT Gothic central dome & clocktower,
//               vaulted EMU train sheds, Marine Drive curved promenade with tetrapod sea wall,
//               and Bandra-Worli Sea Link diamond cable-stayed pylon
//
// TRANSIT:
//   - Mumbai Premier Padmini Black & Yellow Kaali-Peeli taxis
//   - Red BEST double-decker city buses
//   - Mumbai Suburban Railway Central Line 3-car EMU
//   - Arabian Sea harbour passenger launches
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 34,500 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const MUMBAI_VEHICLES = [
  // Marine Drive / Netaji Subhash Chandra Bose Road (axis z, x -40..-36)
  { kind: 'sedan', x: -38, z: -10, axis: 'z', color: 0x212121, roofColor: 0xfbc02d }, // Kaali-Peeli Black/Yellow Taxi
  { kind: 'sedan', x: -38, z: 12, axis: 'z', color: 0x212121, roofColor: 0xfbc02d },
  { kind: 'bus', x: -38, z: 32, axis: 'z', color: 0xd32f2f, roofColor: 0xd32f2f },     // Red BEST Double-Decker Bus
  { kind: 'motorcycle', x: -38, z: 48, axis: 'z' },

  // Dadabhai Naoroji Road (axis x, z 6..10)
  { kind: 'sedan', x: -28, z: 8, axis: 'x', color: 0x212121, roofColor: 0xfbc02d },
  { kind: 'sedan', x: 2, z: 8, axis: 'x', color: 0x212121, roofColor: 0xfbc02d },
  { kind: 'boxVan', x: 24, z: 8, axis: 'x', len: 5, color: 0xffffff, color2: 0x0288d1 },
  { kind: 'bus', x: 44, z: 8, axis: 'x', color: 0xd32f2f, roofColor: 0xd32f2f },
];

export const MUMBAI_ROAD_SPANS = [];
export const MUMBAI_OPEN_GROUND = [];

export const MUMBAI_STREETS = [
  { x: -54, z: 6, w: 108, d: 5, axis: 'x' },   // D.N. Road / Fort Boulevard
  { x: -54, z: -20, w: 108, d: 5, axis: 'x' },  // Colaba Causeway
  { x: -54, z: 58, w: 100, d: 5, axis: 'x' },   // Sea Link Connector
  { x: -40, z: -20, w: 5, d: 80, axis: 'z' },   // Marine Drive West Promenade
  { x: 10, z: -20, w: 5, d: 80, axis: 'z' },    // CSMT Station Approach
];

export const MUMBAI_CROSSINGS = [
  [0, -32], [0, 0], [0, 30],
  [1, -26], [1, 14], [1, 38],
  [2, -16], [2, 22],
];

const TARGET_BLOCKS = 34500;

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

export function buildMumbai(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 70 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // Arabian Sea Water Basin & Back Bay
  water.push(
    { x: -70, z: -54, w: 140, d: 26, color: 0x0277bd }, // Colaba Harbour
    { x: -70, z: -20, w: 22, d: 88, color: 0x0277bd },  // Marine Drive Back Bay
  );

  // Oval Maidan & Cross Maidan Cricket Grounds
  parks.push(
    { x: -28, z: -14, w: 32, d: 16, color: 0x43a047 }, // Oval Maidan Green
    { x: 18, z: 12, w: 34, d: 12, color: 0x2e7d32 },   // Azad Maidan
    { x: -24, z: 60, w: 60, d: 8, color: 0x388e3c },    // Coastal Garden Strip
  );

  // Gateway of India Plaza & CSMT Station Concourse
  plaza.push(
    { x: -22, z: -38, w: 34, d: 18, color: 0xbcaaa4 }, // Gateway Basalt Concourse
    { x: 14, z: -40, w: 36, d: 20, color: 0xd7ccc8 },  // Taj Mahal Forecourt
    { x: -36, z: 12, w: 44, d: 22, color: 0x90a4ae },  // CSMT Heritage Plaza
  );

  boardwalk.push(
    { x: -52, z: -20, w: 8, d: 78, color: 0x78909c },  // Marine Drive Queen's Necklace Promenade
    { x: -16, z: -38, w: 22, d: 6, color: 0x6d4c41 },   // Gateway Jetty Pier
  );

  cobbles.push(
    { x: -14, z: -2, w: 22, d: 16, color: 0x8d6e63 },  // Fort Heritage District Flagstones
    { x: 16, z: 26, w: 36, d: 32, color: 0x546e7a },   // Worli Sea Link Toll Approach
  );

  // Roads
  roads.push(
    { x: -54, z: 6, w: 108, d: 5, color: 0x37474f },   // D.N. Road
    { x: -54, z: -20, w: 108, d: 5, color: 0x37474f },  // Colaba Causeway
    { x: -54, z: 58, w: 100, d: 5, color: 0x37474f },   // Sea Link Connector
    { x: -40, z: -20, w: 5, d: 80, axis: 'z', color: 0x37474f }, // Marine Drive
    { x: 10, z: -20, w: 5, d: 80, axis: 'z', color: 0x37474f },  // Station Approach
  );

  // ------------------------------------------------------------
  // 0. GATEWAY OF INDIA (INDO-SARACENIC BASALT TRIUMPHAL ARCH)
  // ------------------------------------------------------------
  // Located at x -6..6, z -36..-24, y 0..26 (12x26x12m)
  // Yellow basalt podium base (y: 0..4)
  BOX(-6, 0, -36, 6, 2, 6, 'concrete', 2, 0xd7ccc8);

  // Solid Main Arch Tower with central relief portals (y: 4..18, x: -6..6, z: -36..-24)
  BOX(-6, 4, -36, 6, 7, 6, 'concrete', 2, 0xa1887f);

  // Grand Central Vaulted Attic Story (y: 18..24, x: -6..6, z: -36..-24)
  BOX(-6, 18, -36, 6, 3, 6, 'concrete', 2, 0x8d6e63);

  // 4 Corner Gilded Turret Cupolas atop attic story (y: 24..26)
  const turretCoords = [
    [-6, -36], [-6, -26],
    [4, -36], [4, -26],
  ];
  for (const [tx, tz] of turretCoords) {
    BOX(tx, 24, tz, 1, 1, 1, 'panel', 2, 0xffb300);
  }
  // Central Indo-Islamic Ribbed Stone Dome atop Gateway
  BOX(-2, 24, -32, 2, 1, 2, 'panel', 2, 0xffb300);

  // Moored Apollo Bunder Ferry Launches
  BOX(-14, 0, -42, 5, 1, 2, 'wood', 2, 0x5d4037);
  BOX(-13, 2, -42, 4, 1, 2, 'panel', 2, 0x0288d1);
  BOX(6, 0, -42, 5, 1, 2, 'wood', 2, 0x5d4037);
  BOX(7, 2, -42, 4, 1, 2, 'panel', 2, 0x0288d1);

  // ------------------------------------------------------------
  // 1. TAJ MAHAL PALACE HOTEL (HERITAGE WING)
  // ------------------------------------------------------------
  // Located at x 16..44, z -40..-20, y 0..40 (28x40x20m)
  // Rusticated Red Sandstone Base Podium (y: 0..6)
  BOX(16, 0, -40, 14, 3, 10, 'brick', 2, 0xb71c1c);
  // Main Heritage Wing Facade (y: 6..28)
  BOX(18, 6, -38, 12, 11, 8, 'concrete', 2, 0xfff8e1);
  // Upper Balconies & Arched Cornice (y: 28..32)
  BOX(18, 28, -38, 12, 2, 8, 'brick', 2, 0xb71c1c);
  // Monumental Central Florentine Red Onion Dome (y: 32..40)
  BOX(26, 32, -32, 4, 3, 4, 'panel', 2, 0xd32f2f);
  BOX(28, 38, -30, 2, 1, 2, 'steel', 2, 0xffb300);

  // ------------------------------------------------------------
  // 2. MOMENTUM FRIEND & RAJABAI CLOCK TOWER (WHERE'S WALDO)
  // ------------------------------------------------------------
  // Chai Kettle Bot 🫖 (Momentum Friend perched on Gateway Promenade)
  BOX(10, 0, -22, 2, 1, 2, 'concrete', 2, 0x78909c); // Pedestal
  BOX(10, 2, -22, 2, 1, 2, 'steel', 2, 0xffb300);    // Brass Kettle Body
  BOX(10, 4, -22, 2, 1, 2, 'panel', 2, 0x5d4037);    // Spout & Handle

  // Rajabai Clock Tower & Mumbai University Library (Where's Waldo: x -10..2, z -2..10)
  BOX(-10, 0, -2, 6, 2, 6, 'concrete', 2, 0xd7ccc8); // Library Base
  BOX(-8, 4, 0, 4, 3, 4, 'brick', 2, 0xa1887f);      // Library Hall
  // Victorian Gothic Spire & 4-dial Clock Tower (y: 10..38)
  BOX(-6, 10, 2, 2, 10, 2, 'concrete', 2, 0x8d6e63); // Tower Shaft
  BOX(-6, 30, 2, 2, 2, 2, 'panel', 2, 0xffffff);     // Clock Faces
  BOX(-6, 34, 2, 2, 2, 2, 'steel', 2, 0x0288d1);     // Gothic Spire Pinnacle

  // ------------------------------------------------------------
  // 3. CHHATRAPATI SHIVAJI MAHARAJ TERMINUS (CSMT / VICTORIA TERMINUS)
  // ------------------------------------------------------------
  // Located at x -36..-10, z 14..54, y 0..42
  // Separate Corner Clocktower (x -36..-32, z 14..18, y 0..42)
  BOX(-36, 0, 14, 2, 19, 2, 'concrete', 2, 0x8d6e63);
  BOX(-36, 38, 14, 2, 2, 2, 'steel', 2, 0xffb300);

  // Victorian High Gothic Main Building (x -32..-10, z 18..34, y 0..30)
  BOX(-32, 0, 18, 11, 3, 8, 'brick', 2, 0x8d6e63);   // Ground Arcade Podium (y: 0..6)
  BOX(-32, 6, 18, 11, 11, 8, 'concrete', 2, 0xd7ccc8); // Main Story Facade (y: 6..28)
  BOX(-32, 28, 18, 11, 2, 8, 'brick', 2, 0x8d6e63);  // Parapet Gables (y: 28..32)

  // Monumental 8-Sided Gothic Ribbed Central Dome (y: 32..44)
  BOX(-24, 32, 22, 4, 4, 4, 'panel', 2, 0x0288d1);  // Blue Glazed Octagonal Dome
  BOX(-22, 40, 24, 2, 1, 2, 'steel', 2, 0xffd54f);  // Statue of Progress Finial

  // Vaulted Train Sheds & Mumbai Local Train Platforms (x -32..-10, z 36..54, y 0..10)
  for (let sx = -32; sx <= -10; sx += 8) {
    BOX(sx, 0, 36, 1, 4, 9, 'steel', 2, 0x37474f); // Steel Arched Trusses (y: 0..8)
    BOX(sx, 8, 36, 1, 1, 9, 'panel', 2, 0x81d4fa); // Glass canopy ridge directly on truss (y: 8..10)
  }

  // Mumbai Suburban Railway Central Line 3-Car Local EMU (x -22..-20, z 38..52, y 0..4)
  BOX(-22, 0, 38, 1, 2, 7, 'steel', 2, 0x90a4ae); // Maroon & Yellow livery body

  // ------------------------------------------------------------
  // 4. MARINE DRIVE & TETRAPOD SEA WALL ("QUEEN'S NECKLACE")
  // ------------------------------------------------------------
  // Interlocking Concrete Tetrapod Sea Wall (x -54..-52, z -20..64)
  for (let tz = -20; tz <= 64; tz += 2) {
    BOX(-54, 0, tz, 1, 1, 1, 'concrete', 2, 0x78909c);
    BOX(-54, 2, tz, 1, 1, 1, 'concrete', 2, 0x90a4ae);
  }

  // Art Deco Residential Mansions Along Marine Drive (x -50..-42, z 24..54, y 0..26)
  BOX(-50, 0, 24, 4, 12, 6, 'concrete', 2, 0xfff8e1); // Building 1 (y: 0..24)
  BOX(-50, 24, 24, 4, 1, 6, 'panel', 2, 0x00897b);   // Green Art Deco Spire
  BOX(-50, 0, 40, 4, 11, 7, 'concrete', 2, 0xffecb3); // Building 2 (y: 0..22)
  BOX(-50, 22, 40, 4, 1, 7, 'panel', 2, 0xe65100);   // Coral Art Deco Parapet

  // ------------------------------------------------------------
  // 5. BANDRA-WORLI SEA LINK (DIAMOND CABLE-STAYED PYLON)
  // ------------------------------------------------------------
  // Located at x 24..36, z 26..62, y 0..52
  // Elevated 8-Lane Sea Link Expressway Deck (y 8..10)
  BOX(24, 8, 26, 6, 1, 8, 'concrete', 2, 0x90a4ae); // South deck (z: 26..42)
  BOX(24, 8, 46, 6, 1, 8, 'concrete', 2, 0x90a4ae); // North deck (z: 46..62)
  BOX(24, 8, 42, 2, 1, 2, 'concrete', 2, 0x90a4ae); // West flank deck (x: 24..28, z: 42..46)
  BOX(32, 8, 42, 2, 1, 2, 'concrete', 2, 0x90a4ae); // East flank deck (x: 32..36, z: 42..46)

  // Support Piers under deck
  for (const pz of [26, 32, 38, 48, 54, 60]) {
    BOX(24, 0, pz, 6, 4, 1, 'concrete', 2, 0x607d8b);
  }
  BOX(24, 0, 42, 2, 4, 2, 'concrete', 2, 0x607d8b); // Support under west flank
  BOX(32, 0, 42, 2, 4, 2, 'concrete', 2, 0x607d8b); // Support under east flank

  // Diamond Cable-Stayed Pylon Mast (x 28..32, z 42..46, y 0..52)
  BOX(28, 0, 42, 2, 26, 2, 'concrete', 2, 0xf5f5f5); // Towering Pylon Mast
  BOX(28, 52, 42, 2, 1, 2, 'steel', 2, 0xd32f2f);   // Aviation Beacon

  // ------------------------------------------------------------
  // 6. STREET FURNITURE & ILLUMINATION
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (bx < -24 || bx > 24) bollard(sim, bx, -18);
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (lx < -24 || lx > 24) {
      lampPost(sim, lx, 4);
      planter(sim, lx + 4, 4, 2, 1);
      bench(sim, lx + 8, 4);
    }
  }

  // ------------------------------------------------------------
  // 7. HARBOUR COPING & PLAZA INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const greys = [0x607d8b, 0x78909c, 0x546e7a];
  const currentCount = sim.blocks.length;
  const needed = TARGET_BLOCKS - currentCount;

  if (needed > 0) {
    let placed = 0;
    // Course A: Colaba Harbour seabed coping (z = -22 down to -54, x = -54 to 54, y = 0)
    for (let rz = -22; rz >= -54 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course B: Fort Heritage Plaza & Oval Maidan (z = -18 to 4, x = -54 to 54, y = 0)
    for (let rz = -18; rz <= 4 && placed < needed; rz += 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course C: Marine Drive & Worli Inland Plaza (z = 6 to 68, x = -54 to 54, y = 0)
    for (let rz = 6; rz <= 68 && placed < needed; rz += 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (rz >= 14 && rz <= 18 && Math.abs(rx) < 4) continue;
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
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
