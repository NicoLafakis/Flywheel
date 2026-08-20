// Seoul Han River & N Seoul Tower — Sandbox Scene (Act II, chapter 5).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Seoul harmonizes 600 years of Joseon Dynasty heritage with ultra-dense
// futuristic tech monoliths and dramatic mountain-river topography:
//
//   z -54..-26  Han River (Hangang): Wide water channel, Banpo Bridge with
//               cantilevered fountain piers, Mapo Bridge, Hangang Park riverside
//               promenade, and moored Han River Cruise Ferry
//   z -26..6    Gangnam & DDP (Dongdaemun): Zaha Hadid's silver-curved DDP pod,
//               Teheran-ro glass skyscrapers, GT Tower neo-futuristic silhouette
//   z  6..22    Sejong-daero & Historic Core: Statue of King Sejong, Deoksugung
//               Stonewall walkway & Where's Waldo target pavilion
//   z  22..38   Gyeongbokgung Palace: Monumental Gwanghwamun Gate (3-arched stone
//               base + 2-storey timber pavilion) and Geunjeongjeon Throne Hall
//   z  38..66   Namsan Mountain & N Seoul Tower: Solid stepped granite terracing,
//               Namsan Cable Car incline, multi-level rotating observation decks,
//               and the communications transmission spire rising to y = 78
//
// TRANSIT:
//   - Seoul Blue trunk buses, Green feeder buses, Red express buses
//   - Distinctive Orange Seoul urban taxis
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 32,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const SEOUL_VEHICLES = [
  // Olympic-daero / Riverside South (axis x, z -25..-21)
  { kind: 'bus', x: -32, z: -23.5, axis: 'x', color: 0x1565c0 },        // Seoul Blue Trunk Bus (150/402)
  { kind: 'sedan', x: -14, z: -23.5, axis: 'x', color: 0xf57c00, roofColor: 0x212121 }, // Seoul Orange Taxi
  { kind: 'sedan', x: 18, z: -23.5, axis: 'x', color: 0xffffff, roofColor: 0x212121 },  // White sedan
  { kind: 'bus', x: 38, z: -23.5, axis: 'x', color: 0xd32f2f },         // Red Gyeonggi Express Bus

  // Banpo Bridge (axis z, x 16..20, z -54..-26)
  { kind: 'bus', x: 17.5, z: -44, axis: 'z', color: 0x2e7d32 },         // Seoul Green Feeder Bus
  { kind: 'sedan', x: 17.5, z: -32, axis: 'z', color: 0xf57c00, roofColor: 0x212121 },

  // Mapo Bridge (axis z, x -26..-22, z -54..-26)
  { kind: 'sedan', x: -24.5, z: -46, axis: 'z', color: 0x212121 },
  { kind: 'boxVan', x: -24.5, z: -34, axis: 'z', len: 5, color: 0xffffff, color2: 0x1565c0 },

  // Teheran-ro / Gangnam Core (axis x, z -3..1)
  { kind: 'sedan', x: -28, z: -1.5, axis: 'x', color: 0xf57c00, roofColor: 0x212121 },
  { kind: 'sedan', x: 4, z: -1.5, axis: 'x', color: 0x37474f },
  { kind: 'bus', x: 26, z: -1.5, axis: 'x', color: 0x1565c0 },

  // Sejong-daero (axis z, x -2..2, z 6..24)
  { kind: 'sedan', x: -0.5, z: 8, axis: 'z', color: 0xf57c00, roofColor: 0xe0e0e0 },
  { kind: 'motorcycle', x: -0.5, z: 18, axis: 'z' },
];

export const SEOUL_ROAD_SPANS = [];
export const SEOUL_OPEN_GROUND = [];

export const SEOUL_STREETS = [
  { x: -54, z: -25, w: 108, d: 5, axis: 'x' }, // Olympic-daero (Riverside)
  { x: -54, z: -3, w: 108, d: 5, axis: 'x' },  // Teheran-ro / Euljiro
  { x: -50, z: 17, w: 100, d: 5, axis: 'x' },  // Jongno
  { x: -26, z: -54, w: 4, d: 30, axis: 'z' },  // Mapo Bridge
  { x: 16, z: -54, w: 4, d: 30, axis: 'z' },   // Banpo Bridge
  { x: -2, z: 2, w: 4, d: 24, axis: 'z' },     // Sejong-daero Boulevard
];

export const SEOUL_CROSSINGS = [
  [0, -36], [0, -10], [0, 8], [0, 32],
  [1, -30], [1, -8], [1, 10], [1, 30],
  [2, -22], [2, 14],
  [5, 8], [5, 16],
];

const TARGET_BLOCKS = 32000;

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

export function buildSeoul(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 68 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // Han River (Hangang)
  water.push(
    { x: -70, z: -54, w: 140, d: 28, color: 0x0288d1 },
  );

  // Riverside Park & Plaza
  parks.push(
    { x: -54, z: -26, w: 108, d: 8, color: 0x4caf50 },  // Hangang Riverside Park
    { x: -50, z: 38, w: 100, d: 30, color: 0x2e7d32 },  // Namsan Mountain slope
    { x: -16, z: 24, w: 32, d: 14, color: 0x388e3c },   // Gyeongbokgung Courtyard lawn
  );

  plaza.push(
    { x: -54, z: -18, w: 108, d: 14, color: 0xcfd8dc }, // Gangnam / Teheran-ro North apron
    { x: -14, z: 2, w: 28, d: 20, color: 0xd7ccc8 },    // Gwanghwamun / Sejong Plaza
    { x: 22, z: 2, w: 30, d: 14, color: 0xb0bec5 },     // DDP plaza
  );

  boardwalk.push(
    { x: -8, z: -42, w: 16, d: 16, color: 0x8d6e63 },   // Cruise Ferry Pier
  );

  cobbles.push(
    { x: -12, z: 22, w: 24, d: 16, color: 0x78909c },   // Palace stone flagstones
    { x: 6, z: 38, w: 12, d: 28, color: 0x546e7a },     // Namsan Cable Car path
  );

  // Roads. Mapo and Banpo Bridge are NOT declared here even though
  // SEOUL_STREETS lists them: both are water-crossing spans (deck at y=4,
  // piers rooted in the riverbed below), and this codebase's established
  // precedent — Brooklyn's Manhattan Bridge, Chicago's LaSalle/State/Michigan
  // river crossings — is that a bridge over water gets no `roads` ground-paint
  // rect at all; the physical deck is the only representation of the
  // crossing. Declaring one here painted a road stripe on top of the river
  // and put every pier/deck block "inside a roadway rect" with no span to
  // exempt them (they are rooted at y=0, so no minY clears them without also
  // clearing the unrelated riverbed coping fill).
  roads.push(
    { x: -54, z: -25, w: 108, d: 5, color: 0x37474f },  // Olympic-daero
    { x: -54, z: -3, w: 108, d: 5, color: 0x37474f },   // Teheran-ro
    { x: -50, z: 17, w: 100, d: 5, color: 0x37474f },   // Jongno
    { x: -2, z: 2, w: 4, d: 24, color: 0x37474f },      // Sejong-daero
  );

  // ------------------------------------------------------------
  // 0. HAN RIVER BRIDGES & CRUISE FERRY
  // ------------------------------------------------------------
  // Banpo Bridge (x 16..20, z -54..-26, y = 0..4)
  // Concrete piers rising from riverbed
  for (let bz = -54; bz <= -28; bz += 6) {
    BOX(16, 0, bz, 2, 2, 1, 'concrete', 2, 0x546e7a);
  }
  // Bridge deck (y = 4)
  BOX(16, 4, -54, 4, 1, 28, 'concrete', 1, 0x78909c);
  // Rainbow fountain sprayers along bridge edge
  for (let bz = -52; bz <= -28; bz += 2) {
    B(15.5, 4, bz, 'steel', 0.5, 0x00e5ff);
    B(20, 4, bz, 'steel', 0.5, 0xff4081);
  }

  // Mapo Bridge (x -26..-22, z -54..-26, y = 0..4)
  for (let bz = -54; bz <= -28; bz += 6) {
    BOX(-26, 0, bz, 2, 2, 1, 'concrete', 2, 0x546e7a);
  }
  BOX(-26, 4, -54, 4, 1, 28, 'concrete', 1, 0x607d8b);

  // Moored Han River Cruise Ferry (x -8..2, z -42..-32)
  BOX(-8, 0, -42, 10, 1, 10, 'steel', 1, 0x1565c0); // Hull base
  BOX(-8, 1, -42, 10, 1, 10, 'steel', 1, 0xffffff); // White hull
  BOX(-7, 2, -41, 8, 2, 8, 'panel', 1, 0x0288d1);   // Glass passenger salon
  BOX(-6, 4, -40, 6, 1, 6, 'panel', 1, 0xf5f5f5);   // Upper sun deck
  BOX(-4, 5, -37, 2, 2, 2, 'steel', 1, 0xd32f2f);   // Funnel

  // ------------------------------------------------------------
  // 1. DONGDAEMUN DESIGN PLAZA (DDP - ZAHA HADID NEOMORPHIC CURVES)
  // ------------------------------------------------------------
  // Pod 1 (Main Hall: x 24..42, z 2..14, y 0..8)
  BOX(24, 0, 2, 9, 4, 6, 'panel', 2, 0x90a4ae);
  // Curved aluminium shell layers
  BOX(22, 0, 4, 1, 3, 4, 'panel', 2, 0xb0bec5);
  BOX(42, 0, 4, 1, 3, 4, 'panel', 2, 0xb0bec5);
  BOX(26, 8, 4, 7, 1, 4, 'panel', 2, 0xcfd8dc); // Roof canopy

  // Pod 2 (Design Lab: x 28..46, z -16..-6, y 0..6)
  BOX(28, 0, -16, 9, 3, 5, 'panel', 2, 0x78909c);
  BOX(30, 6, -14, 7, 1, 3, 'panel', 2, 0xb0bec5);

  // ------------------------------------------------------------
  // 2. GANGNAM TECH SKYSCRAPER CANYON (TEHERAN-RO)
  // ------------------------------------------------------------
  // Trade Tower / Gangnam Finance Center (x -48..-32, z -18..-6, y 0..52)
  // Podium base
  BOX(-48, 0, -18, 8, 3, 6, 'concrete', 2, 0x37474f);
  // Stepped structural tower shaft
  BOX(-46, 6, -16, 6, 16, 4, 'steel', 2, 0x0288d1);
  BOX(-44, 38, -14, 4, 6, 2, 'steel', 2, 0x01579b);
  BOX(-42, 50, -13, 2, 2, 1, 'steel', 2, 0xe0e0e0); // Crown

  // GT Tower Twisting High-Rise (x -20..-8, z -18..-6, y 0..40)
  for (let y = 0; y < 40; y += 2) {
    const shift = Math.floor(Math.sin(y * 0.15) * 2);
    BOX(-18 + shift, y, -16, 4, 1, 4, 'steel', 2, y % 4 === 0 ? 0x0288d1 : 0x81d4fa);
  }

  // ------------------------------------------------------------
  // 3. SEJONG-DAERO & WHERE'S WALDO HISTORIC PAVILION
  // ------------------------------------------------------------
  // Statue of King Sejong (x -2..2, z 10..14)
  BOX(-2, 0, 10, 4, 3, 4, 'concrete', 1, 0x546e7a); // Granite pedestal
  BOX(-1, 3, 11, 2, 3, 2, 'steel', 1, 0xffb300);    // Golden seated statue

  // Where's Waldo target: Deoksugung Stonewall & Jeongdong Octagonal Pavilion
  // Located at x -36..-24, z 4..14
  // Stone masonry perimeter wall
  BOX(-36, 0, 4, 1, 3, 10, 'brick', 1, 0x8d6e63);
  BOX(-36, 0, 14, 12, 3, 1, 'brick', 1, 0x8d6e63);
  // Solid wooden pavilion core from ground to roof
  BOX(-32, 0, 7, 5, 5, 5, 'wood', 1, 0x4e342e);
  // Korean curved giwa tile roof (dancheong trim)
  BOX(-33, 5, 6, 7, 1, 7, 'panel', 1, 0x2e7d32); // Green eaves
  BOX(-32, 6, 7, 5, 1, 5, 'brick', 1, 0x212121); // Charcoal tiles
  BOX(-31, 7, 8, 3, 1, 3, 'brick', 1, 0x212121);
  B(-30, 8, 9, 'steel', 1, 0xffd54f);            // Gold finial

  // Magpie Drone Bot 🐦 (Momentum Friend sitting in plaza)
  B(-6, 0, 12, 'steel', 1, 0x546e7a);
  B(-6, 1, 12, 'steel', 1, 0x1565c0);
  B(-6, 2, 12, 'panel', 1, 0xffffff);

  // ------------------------------------------------------------
  // 4. GYEONGBOKGUNG PALACE & GWANGHWAMUN GATE
  // ------------------------------------------------------------
  // Gwanghwamun Gate Base (x -10..10, z 22..28, y 0..6)
  // White granite fortress base with 3 arched barrel portals
  BOX(-10, 0, 22, 20, 6, 6, 'concrete', 1, 0xe0e0e0);
  // 2-Storey Timber Pavilion atop gate (y 6..14)
  BOX(-8, 6, 23, 16, 3, 4, 'wood', 1, 0xc62828); // Lower pavilion red pillars
  BOX(-9, 9, 22, 18, 1, 6, 'panel', 1, 0x2e7d32); // Lower green roof eaves
  BOX(-7, 10, 23, 14, 2, 4, 'wood', 1, 0xc62828); // Upper pavilion
  BOX(-8, 12, 22, 16, 1, 6, 'brick', 1, 0x263238); // Upper curved tile roof
  BOX(-7, 13, 23, 14, 1, 4, 'brick', 1, 0x263238); // Ridge

  // Geunjeongjeon Palace Hall (x -12..12, z 30..38, y 0..16)
  // 2-Tiered Stone Woldae Terrace
  BOX(-14, 0, 30, 28, 2, 8, 'concrete', 1, 0xb0bec5);
  BOX(-12, 2, 31, 24, 2, 6, 'concrete', 1, 0xcfd8dc);
  // Main Hall structure (y 4..12)
  BOX(-10, 4, 32, 20, 5, 4, 'wood', 1, 0xb71c1c);
  // Multi-eaved double hip-and-gable roof
  BOX(-11, 9, 31, 22, 1, 6, 'panel', 1, 0x2e7d32);
  BOX(-9, 10, 32, 18, 3, 4, 'wood', 1, 0xb71c1c);
  BOX(-10, 13, 31, 20, 2, 6, 'brick', 1, 0x212121);
  BOX(-8, 15, 32, 16, 1, 4, 'brick', 1, 0x212121);

  // ------------------------------------------------------------
  // 5. NAMSAN MOUNTAIN TERRACES (SOLID SLABS)
  // ------------------------------------------------------------
  // Tier 1: z 38..46 (y 0..4)
  BOX(-50, 0, 38, 29, 2, 4, 'concrete', 2, 0x2e7d32); // West slope (x: -50..8)
  BOX(14, 0, 38, 18, 2, 4, 'concrete', 2, 0x2e7d32);  // East slope (x: 14..50)

  // Tier 2: z 46..54 (y 0..8)
  BOX(-50, 0, 46, 29, 4, 4, 'concrete', 2, 0x2e7d32); // West slope (x: -50..8)
  BOX(14, 0, 46, 18, 4, 4, 'concrete', 2, 0x2e7d32);  // East slope (x: 14..50)

  // Tier 3: z 54..60 (y 0..12)
  BOX(-50, 0, 54, 23, 6, 3, 'concrete', 2, 0x2e7d32); // West slope (x: -50..-4)
  BOX(14, 0, 54, 18, 6, 3, 'concrete', 2, 0x2e7d32);  // East slope (x: 14..50)

  // Tier 4: z 60..66 (y 0..16)
  BOX(-50, 0, 60, 23, 8, 3, 'concrete', 2, 0x2e7d32); // West slope (x: -50..-4)
  BOX(14, 0, 60, 18, 8, 3, 'concrete', 2, 0x2e7d32);  // East slope (x: 14..50)

  // Namsan Cable Car Cutting & Pylons (x 8..14, z 38..52)
  for (let z = 38; z <= 52; z += 2) {
    const trackY = Math.max(0, Math.floor((z - 38) * 0.7) - 1);
    const steps = Math.max(1, Math.floor(trackY / 2) + 1);
    BOX(8, 0, z, 3, steps, 1, 'concrete', 2, 0x455a64);
    const topY = steps * 2;
    if ((z < 42 || z > 44) && (z < 48 || z > 50)) {
      B(9, topY, z, 'steel', 0.5, 0xe0e0e0);
      B(12, topY, z, 'steel', 0.5, 0xe0e0e0);
    }
  }

  // Cable Cars on Mountain (sitting directly on cableway)
  for (const carZ of [42, 48]) {
    for (let cz = carZ; cz <= carZ + 2; cz += 2) {
      const czTrackY = Math.max(0, Math.floor((cz - 38) * 0.7) - 1);
      const czTopY = (Math.max(1, Math.floor(czTrackY / 2) + 1)) * 2;
      for (let cx = 9; cx <= 11; cx++) {
        for (let zOff = 0; zOff < 2; zOff++) {
          B(cx, czTopY, cz + zOff, 'steel', 1, 0xd32f2f);
          B(cx, czTopY + 1, cz + zOff, 'panel', 1, 0xffffff);
        }
      }
    }
  }

  // ------------------------------------------------------------
  // 6. N SEOUL TOWER (YTN SEOUL TOWER - TOWER OF SEOUL)
  // ------------------------------------------------------------
  // Solid base mountain podium rooted from y = 0 up to y = 20 (x: -4..14, z: 54..64)
  BOX(-4, 0, 54, 9, 10, 5, 'concrete', 2, 0x37474f);

  // Tower Base Plaza & Complex (x -2..12, z 56..62, y 20..26)
  BOX(-2, 20, 56, 7, 3, 3, 'concrete', 2, 0x90a4ae);

  // Tower Concrete Shaft (x 3..7, z 57..61, y 26..54, 4x28x4m)
  BOX(3, 26, 57, 2, 14, 2, 'concrete', 2, 0xe0e0e0);

  // Multi-Level Rotating Observatory Pod (x 3..7, z 57..61, y 54..62)
  // Tier 1 (Lower Observation Deck: 4x2x4m)
  BOX(3, 54, 57, 2, 1, 2, 'steel', 2, 0x0288d1);
  // Tier 2 (Main Deck / Restaurant: 4x4x4m)
  BOX(3, 56, 57, 2, 2, 2, 'steel', 2, 0x01579b);
  // Tier 3 (Roof Terrace: 4x2x4m)
  BOX(3, 60, 57, 2, 1, 2, 'concrete', 2, 0x546e7a);

  // Transmitter Mast & Antenna Spire (x 4..6, z 58..60, y 62..78)
  BOX(4, 62, 58, 1, 4, 1, 'steel', 2, 0xd32f2f); // Red lower truss
  for (let sy = 70; sy <= 78; sy++) {
    B(4.5, sy, 58.5, 'steel', 1, 0xffffff);      // White needle spire
  }

  // ------------------------------------------------------------
  // 7. STREET FURNITURE & ILLUMINATION
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (bx < -8 || bx > 8) bollard(sim, bx, -2);
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (lx < -8 || lx > 8) {
      lampPost(sim, lx, 0);
      planter(sim, lx + 4, 0, 2, 1);
      bench(sim, lx + 8, 0);
    }
  }

  // ------------------------------------------------------------
  // 8. RIVER REVETMENT & PROMENADE COPING (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const greys = [0x607d8b, 0x455a64, 0x78909c];
  const currentCount = sim.blocks.length;
  const needed = TARGET_BLOCKS - currentCount;

  // Olympic-daero footprint (mirrors the roads.push() entry above) — Course B's
  // South Apron coping is the only course whose z-range (-24..-6) reaches into
  // it (-25..-20); Course A's z-range bottoms out at -26 and Course C starts at
  // 0, so neither ever touches it. Skipping these cells here, without lowering
  // `needed`, lets the same loop relocate that many blocks into the remaining
  // Course B cells and Course C rather than dropping the total block count.
  const olympicDaero = { x: -54, z: -25, w: 108, d: 5 };
  const inOlympicDaero = (x, z) => x >= olympicDaero.x && x < olympicDaero.x + olympicDaero.w
    && z >= olympicDaero.z && z < olympicDaero.z + olympicDaero.d;

  // VoxelSandboxSim hard-codes the spawn hole at (0, 16) (js/voxelsim.js
  // `_newHole(0, 16, 0)`). Course C's z-range reaches that row, and skipping
  // the Olympic-daero cells above means Course C now has to absorb more of
  // `needed` than before, extending its fill further into that row than the
  // original scan did — close enough to leave blocks non-static/eaten at
  // spawn during probeIdleStability's 3 s idle. Keepout radius matches the
  // established convention for this defect class (js/voxelscene-bangkok.js's
  // `fillerExcluded`, SPAWN_KEEPOUT = 3).
  const SPAWN_X = 0, SPAWN_Z = 16, SPAWN_KEEPOUT = 3;
  const inSpawnKeepout = (x, z) => Math.hypot(x - SPAWN_X, z - SPAWN_Z) < SPAWN_KEEPOUT;

  if (needed > 0) {
    let placed = 0;
    // Course A: Flat riverbed stone coping across Han River (z = -26 down to -54, y = 0)
    for (let rz = -26; rz >= -54 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course B: Flat pavement coping across South Apron / Promenade (z = -6 down to -24, y = 0)
    for (let rz = -6; rz >= -24 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (inOlympicDaero(rx, rz)) continue;
        if (canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course C: Flat pavement coping across Sejong-daero & Jongno apron (z = 0 to 20, y = 0)
    for (let rz = 0; rz <= 20 && placed < needed; rz += 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (inSpawnKeepout(rx, rz)) continue;
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
