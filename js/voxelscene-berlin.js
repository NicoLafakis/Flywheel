// Berlin Brandenburg Gate, Fernsehturm TV Tower & Reichstag — Sandbox Scene (Act IV, chapter 17).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Berlin unites Prussian neoclassical grand boulevards with modernist landmarks:
//
//   z -56..-14  Tiergarten, Reichstag & Spree: Reichstag building with Norman Foster glass dome
//               (y=0..28), Spreeufer river promenade, and Schlossbrücke stone bridge (y=0..6)
//   z -14..-2   River Spree Waterway: Flowing urban Spree river canal, tour barges, and quays
//   z  -2..66   Unter den Linden, Pariser Platz & Alexanderplatz: Brandenburg Gate neoclassical
//               Doric colonnade & golden Quadriga (y=0..26), Fernsehturm TV Tower supertall sphere
//               and needle mast (y=0..68), and Berlin Bear Bot 🐻 atop Alexanderplatz pedestal
//
// TRANSIT:
//   - Beige Mercedes-Benz Berlin taxis
//   - Yellow BVG double-decker city buses
//   - River Spree tourist cruise launches
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 36,500 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const BERLIN_VEHICLES = [
  // Unter den Linden (axis x, z 22..28)
  { kind: 'bus', x: -38, z: 25, axis: 'x', color: 0xffd600, roofColor: 0xffffff },     // Yellow BVG Bus
  { kind: 'sedan', x: -14, z: 25, axis: 'x', color: 0xf5f5dc, roofColor: 0x212121 },   // Beige Berlin Taxi
  { kind: 'sedan', x: 18, z: 25, axis: 'x', color: 0x212121, roofColor: 0xffffff },
  { kind: 'sedan', x: 42, z: 25, axis: 'x', color: 0xf5f5dc, roofColor: 0x212121 },

  // Scheidemannstraße (axis x, z -22..-16)
  { kind: 'sedan', x: -28, z: -19, axis: 'x', color: 0x0288d1, roofColor: 0xffffff },
  { kind: 'boxVan', x: 22, z: -19, axis: 'x', len: 5, color: 0xffffff, color2: 0xd32f2f },
];

export const BERLIN_ROAD_SPANS = [
  // Schlossbrücke stone bridge deck crossing over the River Spree
  { minX: -6, maxX: 6, minZ: -14, maxZ: -2, minY: 4 },
];

export const BERLIN_OPEN_GROUND = [];

export const BERLIN_STREETS = [
  { x: -56, z: 22, w: 114, d: 6, axis: 'x' },   // Unter den Linden
  { x: -56, z: -22, w: 114, d: 5, axis: 'x' },  // Scheidemannstraße
  { x: 2, z: 0, w: 5, d: 66, axis: 'z' },       // Friedrichstraße South
  { x: 32, z: 0, w: 5, d: 66, axis: 'z' },      // Alexanderstraße South
  { x: 2, z: -56, w: 5, d: 34, axis: 'z' },     // Friedrichstraße North
  { x: 32, z: -56, w: 5, d: 34, axis: 'z' },    // Alexanderstraße North
];

export const BERLIN_CROSSINGS = [
  [0, -18], [0, 16], [0, 44],
  [1, -10], [1, 30],
];

const TARGET_BLOCKS = 36500;
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

export function buildBerlin(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // River Spree Channel (z: -14..-2, x: -56..58)
  water.push(
    { x: -56, z: -14, w: 114, d: 12, color: 0x00695c }, // River Spree Green Urban Waterway
  );

  // Großer Tiergarten & Lustgarten Parks
  parks.push(
    { x: -52, z: -52, w: 104, d: 30, color: 0x2e7d32 }, // Großer Tiergarten Woods
    { x: -50, z: 32, w: 20, d: 30, color: 0x388e3c },   // Platz der Republik Lawn
    { x: 38, z: 32, w: 18, d: 30, color: 0x43a047 },    // Lustgarten & Alexanderplatz Green
  );

  // Pariser Platz & Alexanderplatz Plazas
  plaza.push(
    { x: -26, z: 30, w: 26, d: 34, color: 0xd7ccc8 },  // Pariser Platz Sandstone Concourse
    { x: 14, z: 28, w: 24, d: 36, color: 0xb0bec5 },   // Alexanderplatz Modernist Concourse
  );

  boardwalk.push(
    { x: -54, z: -14, w: 108, d: 2, color: 0x795548 }, // Spreeufer River Promenade
    { x: -54, z: -4, w: 108, d: 2, color: 0x795548 },
  );

  cobbles.push(
    { x: -16, z: 4, w: 22, d: 14, color: 0x9e9e9e },  // Bebelplatz Granite Cobbles
    { x: 20, z: -52, w: 32, d: 30, color: 0x757575 }, // Nikolaiviertel Historic Cobbles
  );

  // Road network
  roads.push(
    { x: -56, z: 22, w: 114, d: 6, color: 0x37474f },  // Unter den Linden
    { x: -56, z: -22, w: 114, d: 5, color: 0x37474f }, // Scheidemannstraße
    { x: 2, z: 0, w: 5, d: 66, axis: 'z', color: 0x37474f },   // Friedrichstraße South
    { x: 32, z: 0, w: 5, d: 66, axis: 'z', color: 0x37474f },  // Alexanderstraße South
    { x: 2, z: -56, w: 5, d: 34, axis: 'z', color: 0x37474f },  // Friedrichstraße North
    { x: 32, z: -56, w: 5, d: 34, axis: 'z', color: 0x37474f }, // Alexanderstraße North
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: 28, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 19, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: -25, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: -17, w: 114, d: 3, color: 0xb0bec5 },
    { x: -1, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: 7, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: 29, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: 37, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: -1, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: 7, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: 29, z: -56, w: 3, d: 34, color: 0xb0bec5 },
    { x: 37, z: -56, w: 3, d: 34, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. BRANDENBURG GATE (NEOCLASSICAL SANDSTONE COLONNADE & QUADRIGA)
  // ------------------------------------------------------------
  // Located on Pariser Platz at x -24..-4, z 30..48, y 0..26 (20x18x26m)
  // 6 Monumental Doric Fluted Sandstone Columns & Base (y: 0..16)
  BOX(-24, 0, 30, 10, 8, 9, 'concrete', 2, 0xd7ccc8);

  // Grand Classical Attic Story & Metope Entablature (y: 16..22, x: -24..-4, z: 30..48)
  BOX(-24, 16, 30, 10, 3, 9, 'concrete', 2, 0xcfd8dc);

  // Gilded Copper Quadriga Chariot of Victory (y: 22..26, x: -16..-12, z: 37..41)
  BOX(-16, 22, 38, 2, 1, 1, 'steel', 2, 0x00897b);    // Patinated Copper Chariot (y: 22..24)
  BOX(-16, 24, 38, 2, 1, 1, 'steel', 2, 0xffd700);    // Golden Goddess & Wing Staff (y: 24..26)

  // ------------------------------------------------------------
  // 1. FERNSEHTURM BERLIN TV TOWER (SPHERE & NEEDLE MAST)
  // ------------------------------------------------------------
  // Located at Alexanderplatz (x 22..32, z 28..38, y 0..68)
  // Tapering Concrete Base Shaft (y: 0..40, 10x10m shaft)
  BOX(22, 0, 28, 5, 20, 5, 'concrete', 2, 0xf5f5f5);

  // Faceted Stainless Steel Sphere (y: 40..54, x: 22..32, z: 28..38, 10x10x14m)
  BOX(22, 40, 28, 5, 7, 5, 'steel', 2, 0xb0bec5);

  // Segmented Red and White Steel Antenna Needle (y: 54..68, x: 26..28, z: 32..34)
  BOX(26, 54, 32, 1, 7, 1, 'steel', 2, 0xd32f2f);

  // ------------------------------------------------------------
  // 2. REICHSTAG BUILDING & NORMAN FOSTER GLASS DOME
  // ------------------------------------------------------------
  // Located at x -48..-24, z -46..-24, y 0..28 (24x22x28m)
  // Sandstone Parliament Body & Portico (y: 0..18)
  BOX(-48, 0, -46, 12, 9, 11, 'concrete', 2, 0xd7ccc8);
  // 4 Corner Towers (y: 0..20)
  BOX(-48, 18, -46, 2, 1, 2, 'concrete', 2, 0xbcaaa4);
  BOX(-28, 18, -46, 2, 1, 2, 'concrete', 2, 0xbcaaa4);
  BOX(-48, 18, -28, 2, 1, 2, 'concrete', 2, 0xbcaaa4);
  BOX(-28, 18, -28, 2, 1, 2, 'concrete', 2, 0xbcaaa4);

  // Transparent Helical Glass Dome (y: 18..28, x: -40..-32, z: -38..-30)
  BOX(-40, 18, -38, 4, 4, 4, 'panel', 2, 0x81d4fa);   // Transparent Glass Dome (y: 18..26)
  BOX(-38, 26, -36, 2, 1, 2, 'steel', 2, 0xffffff);   // Skyward Light Mirror Cone (y: 26..28)

  // ------------------------------------------------------------
  // 3. MOMENTUM FRIEND: BERLIN BEAR BOT 🐻
  // ------------------------------------------------------------
  // Located on Alexanderplatz Pedestal (x: 18..20, z: 32..34, y: 0..8)
  BOX(18, 0, 32, 1, 2, 1, 'concrete', 2, 0x37474f); // Basalt Pedestal (y: 0..4)
  BOX(18, 4, 32, 1, 1, 1, 'wood', 2, 0x5d4037);     // Brown Bear Body (y: 4..6)
  BOX(17, 5, 32, 1, 1, 1, 'wood', 1, 0x8d6e63);     // Left Paw
  BOX(20, 5, 32, 1, 1, 1, 'wood', 1, 0x8d6e63);     // Right Paw
  BOX(18, 6, 32, 1, 1, 1, 'steel', 1, 0xffd700);    // Golden Mural Crown

  // ------------------------------------------------------------
  // 4. SCHLOSSBRÜCKE & MUSEUM ISLAND STONE ARCHES
  // ------------------------------------------------------------
  // Spanning River Spree at x -6..6, z -14..-2, y 0..6
  BOX(-6, 0, -14, 6, 2, 6, 'concrete', 2, 0x8d6e63); // Stone Piers from seabed (y: 0..4)
  BOX(-6, 4, -14, 6, 1, 6, 'concrete', 2, 0xd7ccc8); // Schlossbrücke Bridge Deck (y: 4..6)

  // Altes Museum Sandstone Colonnade (x: 16..32, z: 6..18, y: 0..16)
  BOX(16, 0, 6, 8, 8, 6, 'concrete', 2, 0xd7ccc8);

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & BERLIN ILLUMINATION
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 32) > 4 && Math.abs(bx - 2) > 4 && (bx < -26 || bx > -2)) {
      bollard(sim, bx, 20);
      bollard(sim, bx, -24);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx) >= 8 && Math.abs(lx - 32) > 4 && Math.abs(lx - 2) > 4 && (lx <= -36 || lx >= 36)) {
      lampPost(sim, lx, 30);
      planter(sim, lx + 4, 30, 2, 1);
      bench(sim, lx + 8, 30);
    }
  }

  // ------------------------------------------------------------
  // 6. BERLIN GRANITE & PAVING INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const berlinColors = [0xd7ccc8, 0xbcaaa4, 0xb0bec5, 0x9e9e9e];
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
    B(rx, 0, rz, 'concrete', 0.5, berlinColors[cIdx]);
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
    // Pass 2: River Spree seabed coping
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
