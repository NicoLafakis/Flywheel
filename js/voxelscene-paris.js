// Paris Eiffel Tower, Arc de Triomphe & Seine — Sandbox Scene (Act IV, chapter 14).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Paris spans the Champ de Mars iron tower across the River Seine to the Étoile:
//
//   z -56..-14  Champ de Mars & Eiffel Tower: Towering wrought-iron lattice (y=0..64), landscaped
//               lawns, and Croissant Bot 🥐 on green pedestal
//   z -14..-2   River Seine & Pont d'Iéna: Flowing Seine waterway, Pont d'Iéna stone bridge, and
//               Bateaux-Mouches river cruisers
//   z  -2..66   Champs-Élysées & Arc de Triomphe: Grand neoclassical triumphal arch (y=0..28),
//               Haussmannian 6-story residential mansions with zinc mansard roofs, and cafe kiosks
//
// TRANSIT:
//   - Blue & cream Renault and Peugeot Paris taxis
//   - Green RATP city transit buses
//   - Bateaux-Mouches panoramic Seine river cruisers
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 42,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const PARIS_VEHICLES = [
  // Avenue des Champs-Élysées (axis x, z 22..28)
  { kind: 'bus', x: -38, z: 25, axis: 'x', color: 0x2e7d32, roofColor: 0xffffff },    // RATP Green Bus
  { kind: 'sedan', x: -14, z: 25, axis: 'x', color: 0x0288d1, roofColor: 0x212121 },  // Blue Paris Taxi
  { kind: 'sedan', x: 18, z: 25, axis: 'x', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'sedan', x: 42, z: 25, axis: 'x', color: 0x0288d1, roofColor: 0x212121 },

  // Quai Branly (axis x, z -22..-16)
  { kind: 'sedan', x: -28, z: -19, axis: 'x', color: 0xd32f2f, roofColor: 0xffffff },
  { kind: 'boxVan', x: 22, z: -19, axis: 'x', len: 5, color: 0xffffff, color2: 0x0288d1 },
];

export const PARIS_ROAD_SPANS = [
  // Pont d'Iéna stone bridge deck crossing over the River Seine
  { minX: -6, maxX: 6, minZ: -14, maxZ: -2, minY: 4 },
];

export const PARIS_OPEN_GROUND = [];

export const PARIS_STREETS = [
  { x: -56, z: 22, w: 114, d: 6, axis: 'x' },   // Avenue des Champs-Élysées
  { x: -56, z: -22, w: 114, d: 5, axis: 'x' },  // Quai Branly (South Bank)
  { x: -38, z: 0, w: 5, d: 66, axis: 'z' },     // Avenue Montaigne
  { x: 32, z: 0, w: 5, d: 66, axis: 'z' },      // Avenue George V
];

export const PARIS_CROSSINGS = [
  [0, -18], [0, 16], [0, 44],
  [1, -10], [1, 30],
];

const TARGET_BLOCKS = 42000;
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

export function buildParis(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // River Seine Waterway (z: -14..-2, x: -56..58)
  water.push(
    { x: -56, z: -14, w: 114, d: 12, color: 0x00695c }, // River Seine Emerald Waters
  );

  // Champ de Mars Lawns & Tuileries Gardens
  parks.push(
    { x: -52, z: -52, w: 104, d: 30, color: 0x2e7d32 }, // Champ de Mars Grand Lawn
    { x: -50, z: 32, w: 20, d: 30, color: 0x388e3c },   // Parc Monceau
    { x: 34, z: 32, w: 20, d: 30, color: 0x43a047 },    // Jardin des Champs-Élysées
  );

  // Place de l'Étoile & Trocadéro Plazas
  plaza.push(
    { x: -24, z: 30, w: 48, d: 34, color: 0xd7ccc8 },  // Place Charles de Gaulle (Étoile)
    { x: -20, z: -2, w: 40, d: 20, color: 0xb0bec5 },  // Pont d'Iéna / Quayside Concourse
  );

  boardwalk.push(
    { x: -54, z: -14, w: 108, d: 2, color: 0x795548 }, // Quai de la Seine Wooden Promenade
    { x: -54, z: -4, w: 108, d: 2, color: 0x795548 },
  );

  cobbles.push(
    { x: -24, z: -26, w: 48, d: 10, color: 0x9e9e9e }, // Champ de Mars Gravel Walkways
    { x: -24, z: 12, w: 48, d: 10, color: 0x757575 },  // Avenue Cobblestones
  );

  // Road network
  roads.push(
    { x: -56, z: 22, w: 114, d: 6, color: 0x37474f },  // Avenue des Champs-Élysées
    { x: -56, z: -22, w: 114, d: 5, color: 0x37474f }, // Quai Branly
    { x: -38, z: 0, w: 5, d: 66, axis: 'z', color: 0x37474f },  // Avenue Montaigne
    { x: 32, z: 0, w: 5, d: 66, axis: 'z', color: 0x37474f },   // Avenue George V
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: 28, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 19, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: -25, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: -17, w: 114, d: 3, color: 0xb0bec5 },
    { x: -41, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: -33, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: 29, z: 0, w: 3, d: 66, color: 0xb0bec5 },
    { x: 37, z: 0, w: 3, d: 66, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. EIFFEL TOWER (TOUR EIFFEL WROUGHT-IRON LATTICE)
  // ------------------------------------------------------------
  // Located on Champ de Mars at x -14..14, z -52..-24, y 0..64 (28x28x64m)
  // Monumental Wrought-Iron Base & Arched Core (y: 0..20)
  BOX(-14, 0, -52, 14, 10, 14, 'steel', 2, 0x6d4c41);

  // Tier 1 Observation Platform Deck (y: 20..24, x: -14..14, z: -52..-24)
  BOX(-14, 20, -52, 14, 2, 14, 'steel', 2, 0x8d6e63);

  // Tier 2 Tapering Mid-Tower (y: 24..40, x: -8..8, z: -46..-30)
  BOX(-8, 24, -46, 8, 8, 8, 'steel', 2, 0x5d4037);

  // Tier 2 Upper Platform Deck (y: 40..44, x: -8..8, z: -46..-30)
  BOX(-8, 40, -46, 8, 2, 8, 'steel', 2, 0x8d6e63);

  // Tier 3 Slender Summit Spire (y: 44..60, x: -4..4, z: -42..-34)
  BOX(-4, 44, -42, 4, 8, 4, 'steel', 2, 0x4e342e);

  // Lantern Dome & Summit Beacon Spire (y: 60..64, x: -1..1, z: -39..-37)
  BOX(-1, 60, -39, 1, 2, 1, 'steel', 2, 0xffd54f);

  // ------------------------------------------------------------
  // 1. ARC DE TRIOMPHE (PLACE DE L'ÉTOILE)
  // ------------------------------------------------------------
  // Located at x -12..12, z 36..56, y 0..28 (24x20x28m)
  // Neoclassical Sandstone Base & Relief Piers (y: 0..18)
  BOX(-12, 0, 36, 12, 9, 10, 'concrete', 2, 0xd7ccc8);

  // Monumental Attic Story with Inscribed Victories (y: 18..24)
  BOX(-12, 18, 36, 12, 3, 10, 'concrete', 2, 0xcfd8dc);

  // Summit Balustrade & Cornice (y: 24..28, x: -10..10, z: 38..54)
  BOX(-10, 24, 38, 10, 2, 8, 'concrete', 2, 0xb0bec5);

  // ------------------------------------------------------------
  // 2. MOMENTUM FRIEND: CROISSANT BOT 🥐
  // ------------------------------------------------------------
  // Located on Champ de Mars Lawns (x: 20..22, z: -34..-32, y: 0..8)
  BOX(20, 0, -34, 1, 2, 1, 'concrete', 2, 0x37474f); // Basalt Pedestal (y: 0..4)
  BOX(20, 4, -34, 1, 1, 1, 'wood', 2, 0xffb74d);     // Golden Pastry Crust (y: 4..6)
  BOX(19, 5, -34, 1, 1, 1, 'wood', 1, 0xff9800);     // Left Horn
  BOX(22, 5, -34, 1, 1, 1, 'wood', 1, 0xff9800);     // Right Horn
  BOX(20, 6, -34, 1, 1, 1, 'panel', 1, 0xffffff);    // Butter Glaze Specular

  // ------------------------------------------------------------
  // 3. HAUSSMANNIAN RESIDENTIAL MANSIONS
  // ------------------------------------------------------------
  // Mansion Row North-West (x: -52..-42, z: 34..56, y: 0..22)
  BOX(-52, 0, 34, 5, 9, 11, 'concrete', 2, 0xfff8e1); // Lutetian Limestone Facade (y: 0..18)
  BOX(-52, 18, 34, 5, 2, 11, 'steel', 2, 0x455a64);   // Zinc Mansard Roof (y: 18..22)

  // Mansion Row North-East (x: 40..50, z: 34..56, y: 0..22)
  BOX(40, 0, 34, 5, 9, 11, 'concrete', 2, 0xfff8e1);
  BOX(40, 18, 34, 5, 2, 11, 'steel', 2, 0x455a64);

  // ------------------------------------------------------------
  // 4. PONT D'IÉNA & BATEAUX-MOUCHES
  // ------------------------------------------------------------
  // Pont d'Iéna Stone Bridge (x: -6..6, z: -14..-2, y: 0..6)
  BOX(-6, 0, -14, 6, 2, 6, 'concrete', 2, 0xa1887f); // Stone Bridge Base & Piers (y: 0..4)
  BOX(-6, 4, -14, 6, 1, 6, 'concrete', 2, 0xd7ccc8); // Bridge Deck (y: 4..6)

  // Bateaux-Mouches Cruise Boat on Seine (x: 14..28, z: -10..-6, y: 0..4)
  BOX(14, 0, -10, 7, 1, 2, 'steel', 2, 0xffffff);    // White Hull
  BOX(16, 2, -10, 5, 1, 2, 'panel', 2, 0x81d4fa);    // Panoramic Glass Canopy

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & BOULEVARD KIOSKS
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 32) > 4 && Math.abs(bx + 38) > 4) {
      bollard(sim, bx, 20);
      bollard(sim, bx, -24);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx) >= 8 && Math.abs(lx - 32) > 4 && Math.abs(lx + 38) > 4) {
      lampPost(sim, lx, 30);
      planter(sim, lx + 4, 30, 2, 1);
      bench(sim, lx + 8, 30);
    }
  }

  // ------------------------------------------------------------
  // 6. PARISIAN LIMESTONE & GRAVEL INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const parisColors = [0xd7ccc8, 0xbcaaa4, 0xfff8e1, 0xb0bec5];
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
    B(rx, 0, rz, 'concrete', 0.5, parisColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Course A: Champ de Mars (z = -24 down to R.minZ, x = R.minX to maxX0, y = 0)
    for (let rz = -24; rz >= R.minZ && placed < needed; rz -= 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course B: River Seine Quays (z = -20 to 18, x = R.minX to maxX0, y = 0)
    for (let rz = -20; rz <= 18 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course C: Champs-Élysées & Étoile (z = 20 to maxZ0, x = R.minX to maxX0, y = 0)
    for (let rz = 20; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course D: River Seine Riverbed Coping (z = -14 to -2, x = R.minX to maxX0, y = 0)
    for (let rz = -14; rz <= -2 && placed < needed; rz += 0.5) {
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
