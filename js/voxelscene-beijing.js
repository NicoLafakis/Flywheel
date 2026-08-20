// Beijing Forbidden City & Bird's Nest — Sandbox Scene (Act II, chapter 7).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Beijing manifests monumental imperial symmetry and colossal steel mega-structures:
//
//   z -54..-24  CBD & Hutongs: Rem Koolhaas's CCTV cantilevered loop skyscraper,
//               grey-brick Siheyuan courtyard hutongs, and Drum Tower Where's Waldo compound
//   z -24..18   Imperial Axis & Chang'an Avenue: 12-lane grand avenue, Jinshui Canal
//               bridges, Monumental Tiananmen Gate (red fortress base + yellow double-roof pavilion),
//               Imperial Lion Bot 🐲, and the 3-tiered Hall of Supreme Harmony
//   z  18..34   Forbidden City Inner Courtyard: White marble carved terraces & vermilion palaces
//   z  34..66   Olympic Green: Herzog & de Meuron's Bird's Nest steel lattice stadium,
//               translucent Water Cube (National Aquatics Centre), and Dragon Lake promenade
//
// TRANSIT:
//   - Beijing Red/White rapid transit buses along Chang'an Avenue
//   - Yellow & Green Hyundai Elantra urban taxis
//   - Hongqi (Red Flag) black official luxury sedans
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 38,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const BEIJING_VEHICLES = [
  // Chang'an Avenue North & South Lanes (axis x, z -2..4)
  { kind: 'bus', x: -34, z: -1.5, axis: 'x', color: 0xd32f2f },         // Beijing Transit Red/White Bus (Line 1)
  { kind: 'sedan', x: -16, z: -1.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d }, // Beijing Yellow/Green Taxi
  { kind: 'sedan', x: 8, z: -1.5, axis: 'x', color: 0x111111 },          // Hongqi Black Sedan
  { kind: 'bus', x: 28, z: -1.5, axis: 'x', color: 0xd32f2f },

  { kind: 'sedan', x: -28, z: 2.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d },
  { kind: 'boxVan', x: -8, z: 2.5, axis: 'x', len: 5, color: 0xf5f5f5, color2: 0xd32f2f },
  { kind: 'sedan', x: 18, z: 2.5, axis: 'x', color: 0x111111 },
  { kind: 'sedan', x: 38, z: 2.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d },

  // Jianguomenwai / CBD South (axis x, z -24..-20)
  { kind: 'sedan', x: 26, z: -22.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d },
  { kind: 'sedan', x: -22, z: -22.5, axis: 'x', color: 0x212121 },

  // Olympic Green North Boulevard (axis x, z 36..40)
  { kind: 'bus', x: -14, z: 37.5, axis: 'x', color: 0x1565c0 },
  { kind: 'sedan', x: 22, z: 37.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d },
];

export const BEIJING_ROAD_SPANS = [];
export const BEIJING_OPEN_GROUND = [];

export const BEIJING_STREETS = [
  { x: -54, z: -24, w: 108, d: 5, axis: 'x' }, // Jianguomenwai Dajie
  { x: -54, z: -3, w: 108, d: 8, axis: 'x' },  // Chang'an Avenue (Grand Imperial Highway)
  { x: -50, z: 36, w: 100, d: 5, axis: 'x' },  // Olympic Green Boulevard
  { x: -2, z: -54, w: 4, d: 30, axis: 'z' },   // Wangfujing Street
  { x: 20, z: -54, w: 4, d: 30, axis: 'z' },   // Dongdaqiao Road
];

export const BEIJING_CROSSINGS = [
  [0, -32], [0, 10], [0, 32],
  [1, -36], [1, -12], [1, 12], [1, 36],
  [2, -20], [2, 16],
];

const TARGET_BLOCKS = 38000;

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

export function buildBeijing(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 68 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // Jinshui River & Dragon Lake Canal
  water.push(
    { x: -54, z: 6, w: 108, d: 4, color: 0x0288d1 },    // Jinshui Imperial Canal
    { x: -54, z: 42, w: 16, d: 24, color: 0x01579b },   // Olympic Dragon Lake
  );

  // Imperial Square & Plaza
  plaza.push(
    { x: -54, z: -18, w: 108, d: 14, color: 0xd7ccc8 }, // Tiananmen Grand Square
    { x: -54, z: 10, w: 108, d: 12, color: 0xcfd8dc },  // Meridian Forecourt
    { x: -24, z: 22, w: 48, d: 14, color: 0xb0bec5 },   // Forbidden City Inner Courtyard
    { x: -30, z: 38, w: 84, d: 28, color: 0x90a4ae },   // Olympic Green Concourse
  );

  // Siheyuan Hutongs & Gardens
  parks.push(
    { x: -50, z: -48, w: 32, d: 24, color: 0x2e7d32 },  // Hutong greenery & courtyard trees
    { x: -54, z: 38, w: 22, d: 28, color: 0x388e3c },   // Olympic Forest Park
  );

  cobbles.push(
    { x: -48, z: -46, w: 28, d: 20, color: 0x546e7a },  // Hutong grey cobblestones
    { x: -16, z: 22, w: 32, d: 12, color: 0x78909c },   // Forbidden City Marble Flagstones
  );

  // Roads
  roads.push(
    { x: -54, z: -24, w: 108, d: 5, color: 0x37474f },  // Jianguomenwai
    { x: -54, z: -3, w: 108, d: 8, color: 0x263238 },   // Chang'an Avenue
    { x: -50, z: 36, w: 100, d: 5, color: 0x37474f },   // Olympic Blvd
    { x: -2, z: -54, w: 4, d: 30, color: 0x37474f },    // Wangfujing
    { x: 20, z: -54, w: 4, d: 30, axis: 'z', color: 0x37474f }, // Dongdaqiao
  );

  // ------------------------------------------------------------
  // 0. CCTV HEADQUARTERS (REM KOOLHAAS - CANTILEVERED LOOP)
  // ------------------------------------------------------------
  // Solid Base Podium (x 18..38, z -44..-24, y 0..6, 20x6x20m)
  BOX(18, 0, -44, 10, 3, 10, 'concrete', 2, 0x37474f);

  // West Tower Leg (x 18..26, z -44..-24, y 6..36, 8x30x20m)
  BOX(18, 6, -44, 4, 15, 10, 'steel', 2, 0x455a64);

  // East Tower Leg (x 30..38, z -44..-24, y 6..36, 8x30x20m)
  BOX(30, 6, -44, 4, 15, 10, 'steel', 2, 0x455a64);

  // Cantilever Overhang Bent Bridge Vault linking the two towers at y 36..50
  // Spans x: 18..38, z: -44..-24 (20x14x20m)
  BOX(18, 36, -44, 10, 7, 10, 'steel', 2, 0x37474f);

  // ------------------------------------------------------------
  // 1. SIHEYUAN HUTONGS & DRUM TOWER (WHERE'S WALDO TARGET)
  // ------------------------------------------------------------
  // Hutong Quadrangular Courtyards (x -48..-20, z -48..-26)
  for (const hx of [-46, -32]) {
    for (const hz of [-46, -34]) {
      // Perimeter grey brick walls
      BOX(hx, 0, hz, 10, 3, 1, 'brick', 1, 0x78909c);
      BOX(hx, 0, hz + 1, 1, 3, 8, 'brick', 1, 0x78909c);
      BOX(hx + 9, 0, hz + 1, 1, 3, 8, 'brick', 1, 0x78909c);
      // South wall split with red entrance gate
      BOX(hx, 0, hz + 9, 4, 3, 1, 'brick', 1, 0x78909c);
      BOX(hx + 6, 0, hz + 9, 4, 3, 1, 'brick', 1, 0x78909c);
      BOX(hx + 4, 0, hz + 9, 2, 3, 1, 'wood', 1, 0xd32f2f); // Red gate
      // Charcoal tile roofs
      BOX(hx - 1, 3, hz - 1, 12, 1, 2, 'brick', 1, 0x212121);
      BOX(hx - 1, 3, hz + 8, 12, 1, 2, 'brick', 1, 0x212121);
    }
  }

  // Where's Waldo target: Historic Drum & Bell Tower (x -20..-12, z -44..-36, h 18)
  BOX(-20, 0, -44, 8, 6, 8, 'brick', 1, 0x8d5b4c); // Red-brick fortress base
  BOX(-18, 6, -42, 6, 6, 6, 'wood', 1, 0xb71c1c);  // Upper wooden tower
  BOX(-19, 12, -43, 8, 2, 8, 'brick', 1, 0x263238); // Curved dark hip roof
  B(-15, 14, -39, 'steel', 1, 0xffb300);            // Gold finial

  // ------------------------------------------------------------
  // 2. TIANANMEN GATE (GATE OF HEAVENLY PEACE) & JINSHUI BRIDGES
  // ------------------------------------------------------------
  // 5 Jinshui Carved Marble Bridges spanning the canal (z 6..10)
  for (const bx of [-20, -10, 0, 10, 20]) {
    BOX(bx - 1, 0, 6, 3, 1, 4, 'concrete', 1, 0xf5f5f5);
    B(bx - 1, 1, 7, 'concrete', 1, 0xffffff);
    B(bx + 1, 1, 7, 'concrete', 1, 0xffffff);
  }

  // Tiananmen Gate Fortress Base (x -24..24, z 10..18, y 0..8, 48x8x8m)
  BOX(-24, 0, 10, 24, 4, 4, 'concrete', 2, 0xb71c1c); // Vermilion red base

  // 2-Storey Timber Pavilion atop Gate (x -20..20, z 11..17, y 8..18)
  BOX(-20, 8, 11, 20, 2, 3, 'wood', 2, 0xc62828);   // Lower hall pillars
  BOX(-22, 12, 10, 22, 1, 4, 'panel', 2, 0xffb300); // Lower yellow glazed roof eaves
  BOX(-18, 14, 12, 18, 1, 2, 'wood', 2, 0xc62828);  // Upper hall
  BOX(-20, 16, 11, 20, 1, 3, 'panel', 2, 0xffb300); // Upper yellow glazed roof
  BOX(-16, 18, 12, 16, 1, 2, 'panel', 2, 0xffb300); // Ridge

  // Imperial Lion Bot 🐲 (Momentum Friend guarding Jinshui Bridge)
  BOX(5, 0, 8, 2, 1, 2, 'concrete', 1, 0xe0e0e0);   // Marble pedestal
  B(5.5, 1, 8.5, 'steel', 1, 0xffb300);             // Bronze Lion body
  B(5.5, 2, 8.5, 'steel', 1, 0xffb300);             // Lion head with mane

  // ------------------------------------------------------------
  // 3. FORBIDDEN CITY: HALL OF SUPREME HARMONY (TAIHEDIAN)
  // ------------------------------------------------------------
  // 3-Tiered White Marble Woldae Terrace (x -18..18, z 22..34, y 0..6)
  BOX(-18, 0, 22, 18, 1, 6, 'concrete', 2, 0xf5f5f5);
  BOX(-16, 2, 23, 16, 1, 5, 'concrete', 2, 0xf5f5f5);
  BOX(-14, 4, 24, 14, 1, 4, 'concrete', 2, 0xf5f5f5);

  // Main Throne Hall Structure (x -12..12, z 25..31, y 6..14)
  BOX(-12, 6, 25, 12, 4, 3, 'wood', 2, 0xb71c1c);
  // Colossal Double-Eaved Imperial Yellow Glazed Tile Roof (y 14..22)
  BOX(-14, 14, 24, 14, 1, 4, 'panel', 2, 0xffb300);
  BOX(-10, 16, 25, 10, 1, 3, 'wood', 2, 0xb71c1c);
  BOX(-12, 18, 24, 12, 1, 4, 'panel', 2, 0xffb300);
  BOX(-8, 20, 25, 8, 1, 3, 'panel', 2, 0xffb300);

  // ------------------------------------------------------------
  // 4. BIRD'S NEST NATIONAL STADIUM (HERZOG & DE MEURON)
  // ------------------------------------------------------------
  // Outer Intertwined Steel Diagrid Lattice Ring (x -24..12, z 40..64)
  BOX(-24, 0, 40, 18, 11, 1, 'steel', 2, 0xcfd8dc); // South facade
  BOX(-24, 0, 62, 18, 11, 1, 'steel', 2, 0xcfd8dc); // North facade
  BOX(-24, 0, 42, 1, 11, 10, 'steel', 2, 0xcfd8dc); // West facade
  BOX(10, 0, 42, 1, 11, 10, 'steel', 2, 0xcfd8dc);  // East facade
  // Red Interior Seating Bowl (inside outer ring: x -22..10, z 42..62)
  BOX(-22, 0, 42, 16, 6, 10, 'steel', 2, 0xd32f2f);
  // Perimeter Saddle-Shaped Roof Rim (sitting directly on the 4 outer walls)
  BOX(-24, 22, 40, 18, 1, 1, 'steel', 2, 0xb0bec5); // South roof rim
  BOX(-24, 22, 62, 18, 1, 1, 'steel', 2, 0xb0bec5); // North roof rim
  BOX(-24, 22, 42, 1, 1, 10, 'steel', 2, 0xb0bec5); // West roof rim
  BOX(10, 22, 42, 1, 1, 10, 'steel', 2, 0xb0bec5);  // East roof rim

  // ------------------------------------------------------------
  // 5. WATER CUBE (NATIONAL AQUATICS CENTRE)
  // ------------------------------------------------------------
  // Located at x 20..44, z 40..64, y 0..16 (24x16x24m)
  BOX(20, 0, 40, 12, 8, 12, 'steel', 2, 0x0288d1);

  // ------------------------------------------------------------
  // 6. STREET FURNITURE & IMPERIAL LAMPS
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (bx < -8 || bx > 8) bollard(sim, bx, -4);
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (lx < -8 || lx > 8) {
      lampPost(sim, lx, -5);
      planter(sim, lx + 4, -5, 2, 1);
      bench(sim, lx + 8, -5);
    }
  }

  // ------------------------------------------------------------
  // 7. PAVEMENT COPING & GRAND PLAZA INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const greys = [0x78909c, 0x607d8b, 0x546e7a];
  const currentCount = sim.blocks.length;
  const needed = TARGET_BLOCKS - currentCount;

  if (needed > 0) {
    let placed = 0;
    // Course A: Tiananmen Grand Square pavement (z = -6 down to -24, y = 0)
    for (let rz = -6; rz >= -24 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course B: Olympic Green Concourse (z = 36 to 66, x = -54 to 54, y = 0)
    for (let rz = 36; rz <= 66 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course C: Meridian Forecourt (z = 10 to 22, x = -54 to 54, y = 0)
    for (let rz = 10; rz <= 22 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course D: CBD & Hutong northern infill (z = -24 down to -54, x = -18 to 18, y = 0)
    for (let rz = -24; rz >= -54 && placed < needed; rz -= 0.5) {
      for (let rx = -18; rx <= 18 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course E: Western Courtyards (z = -24 down to -54, x = -54 to -18, y = 0)
    for (let rz = -24; rz >= -54 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= -18 && placed < needed; rx += 0.5) {
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
