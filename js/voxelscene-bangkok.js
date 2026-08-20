// Bangkok Grand Palace & Wat Arun — Sandbox Scene (Act II, chapter 8).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Bangkok weaves vibrant canal waterways, gilded Buddhist temple spires,
// and modern elevated transit canyons:
//
//   z -54..-26  Chao Phraya River & Thonburi: Wide water channel, Wat Arun's
//               towering mosaic Phra Prang spire, moored express boats, and Wat Pho Where's Waldo shrine
//   z -26..18   Rattanakosin & Grand Palace: White crenellated palace perimeter walls,
//               Dusit Maha Prasat multi-tiered throne hall, golden Phra Sri Rattana Chedi,
//               and Tuk-Tuk Bot 🛺 on Sanam Luang royal promenade
//   z  18..66   Sukhumvit & Modern Mega-Malls: BTS Skytrain elevated concrete viaduct & train,
//               King Power MahaNakhon pixelated tower, Siam Paragon glass complex,
//               and vibrant night market street food stalls
//
// TRANSIT:
//   - Bangkok Pink taxis and Green/Yellow urban cabs
//   - Red & Cream BMTA non-AC buses
//   - BTS Skytrain 3-car elevated EMU
//   - Chao Phraya Express river passenger boats
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 30,000 blocks.

import {
  bench, bollard, generateBlockers, lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const BANGKOK_VEHICLES = [
  // Sanam Luang / Ratchadamnoen Avenue (axis x, z -25..-21)
  { kind: 'bus', x: -32, z: -23.5, axis: 'x', color: 0xd32f2f, roofColor: 0xfff8e1 }, // Red/Cream BMTA Bus
  { kind: 'sedan', x: -14, z: -23.5, axis: 'x', color: 0xe91e63 }, // Bangkok Hot Pink Taxi
  { kind: 'sedan', x: 18, z: -23.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d }, // Green/Yellow Taxi
  { kind: 'motorcycle', x: 34, z: -23.5, axis: 'x' },

  // Rama I / Sukhumvit Boulevard (axis x, z 20..24)
  { kind: 'sedan', x: -28, z: 21.5, axis: 'x', color: 0xe91e63 },
  { kind: 'sedan', x: -6, z: 21.5, axis: 'x', color: 0x43a047, roofColor: 0xfbc02d },
  { kind: 'boxVan', x: 16, z: 21.5, axis: 'x', len: 5, color: 0xffffff, color2: 0x1565c0 },
  { kind: 'bus', x: 38, z: 21.5, axis: 'x', color: 0xd32f2f, roofColor: 0xfff8e1 },
];

export const BANGKOK_ROAD_SPANS = [];
export const BANGKOK_OPEN_GROUND = [];

export const BANGKOK_STREETS = [
  { x: -54, z: -25, w: 108, d: 5, axis: 'x' }, // Ratchadamnoen Avenue
  { x: -54, z: -3, w: 108, d: 5, axis: 'x' },  // Na Phra Lan Road
  { x: -54, z: 20, w: 108, d: 5, axis: 'x' },  // Rama I Road (under Skytrain)
  { x: -50, z: 54, w: 100, d: 5, axis: 'x' },  // Sukhumvit Soi
  { x: -24, z: -25, w: 4, d: 50, axis: 'z' },  // Phra Athit Road
  { x: 20, z: -25, w: 4, d: 50, axis: 'z' },   // Phaya Thai Road
];

export const BANGKOK_CROSSINGS = [
  [0, -32], [0, 8], [0, 32],
  [1, -28], [1, -8], [1, 14], [1, 36],
  [2, -18], [2, 16],
];

const TARGET_BLOCKS = 30000;

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

export function buildBangkok(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 68 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // Chao Phraya River Channel, carved around the two riverbank temples
  // (Wat Arun and Wat Pho both stand on built land at the water's edge — the
  // cobbles rects below are their courtyards, already correctly placed; it
  // was the water rect that was declared too wide, painting over dry land).
  // One rect would double as both the flagstones' floor AND the water on top
  // of it, so this is 5 rects instead of 1: full-width strips north (z -54..
  // -46) and south (z -30..-26) of the temple band, and three segments across
  // the temple band itself (z -46..-30) split around both temples' footprints
  // (Wat Arun x -38..-18, Wat Pho x 22..40).
  water.push(
    { x: -70, z: -54, w: 140, d: 8, color: 0x0288d1 },
    { x: -70, z: -30, w: 140, d: 4, color: 0x0288d1 },
    { x: -70, z: -46, w: 32, d: 16, color: 0x0288d1 },
    { x: -18, z: -46, w: 40, d: 16, color: 0x0288d1 },
    { x: 40, z: -46, w: 30, d: 16, color: 0x0288d1 },
  );

  // Sanam Luang Royal Lawn & Lumpini Park
  parks.push(
    { x: -54, z: -26, w: 108, d: 8, color: 0x4caf50 },  // Sanam Luang North Lawn
    { x: -16, z: 2, w: 32, d: 16, color: 0x388e3c },    // Palace Inner Gardens
    { x: -50, z: 48, w: 100, d: 18, color: 0x2e7d32 },  // Modern Tropical Gardens
  );

  // Palace Terraces & Modern Shopping Plazas
  plaza.push(
    { x: -54, z: -18, w: 108, d: 14, color: 0xd7ccc8 }, // Grand Palace Courtyard
    { x: 18, z: 26, w: 36, d: 22, color: 0xcfd8dc },    // Siam Paragon Concourse
    { x: -44, z: 26, w: 26, d: 22, color: 0xb0bec5 },   // MahaNakhon Plaza
  );

  boardwalk.push(
    { x: -52, z: -30, w: 14, d: 6, color: 0x8d6e63 },   // Express Pier
    { x: 22, z: -30, w: 20, d: 6, color: 0x8d6e63 },    // Tha Tien Express Pier
  );

  cobbles.push(
    { x: -38, z: -46, w: 20, d: 16, color: 0x78909c },  // Wat Arun Stone Flagstones
    { x: 22, z: -46, w: 18, d: 16, color: 0x607d8b },   // Wat Pho Courtyard Flagstones
  );

  // Roads
  roads.push(
    { x: -54, z: -25, w: 108, d: 5, color: 0x37474f },  // Ratchadamnoen
    { x: -54, z: -3, w: 108, d: 5, color: 0x37474f },   // Na Phra Lan
    { x: -54, z: 20, w: 108, d: 5, color: 0x37474f },   // Rama I
    { x: -50, z: 54, w: 100, d: 5, color: 0x37474f },   // Sukhumvit
    { x: -24, z: -25, w: 4, d: 50, color: 0x37474f },   // Phra Athit
    { x: 20, z: -25, w: 4, d: 50, color: 0x37474f },    // Phaya Thai
  );

  // ------------------------------------------------------------
  // 0. WAT ARUN (TEMPLE OF DAWN - PHRA PRANG)
  // ------------------------------------------------------------
  // Stepped Pyramidal Base Terrace (x -36..-20, z -46..-30, y 0..16, 16x16x16m)
  BOX(-36, 0, -46, 8, 2, 8, 'concrete', 2, 0xf5f5f5); // Tier 1 (x: -36..-20, z: -46..-30, y: 0..4)
  BOX(-34, 4, -44, 6, 2, 6, 'concrete', 2, 0xf5f5f5); // Tier 2 (x: -34..-22, z: -44..-32, y: 4..8)
  BOX(-32, 8, -42, 4, 2, 4, 'concrete', 2, 0xf5f5f5); // Tier 3 (x: -32..-24, z: -42..-34, y: 8..12)
  BOX(-30, 12, -40, 2, 2, 2, 'concrete', 2, 0xf5f5f5); // Tier 4 (x: -30..-26, z: -40..-36, y: 12..16)

  // Central Phra Prang Pagoda Spire (x -30..-26, z -40..-36, y 16..52)
  // Lower banded tower shaft (4x16x4m)
  for (let my = 16; my < 32; my += 4) {
    BOX(-30, my, -40, 2, 1, 2, 'panel', 2, 0x00bcd4);
    BOX(-30, my + 2, -40, 2, 1, 2, 'concrete', 2, 0xf5f5f5);
  }
  // Middle bell tapering (2x12x2m)
  BOX(-29, 32, -39, 1, 6, 1, 'concrete', 2, 0xff9800);
  // Upper needle spire (Trishula 7-prong gilded finial)
  for (let ty = 44; ty <= 52; ty += 2) {
    BOX(-29, ty, -39, 1, 1, 1, 'steel', 2, 0xffd54f);
  }

  // 4 Satellite Prangs at the 4 Tier 1 corners
  const satCorners = [
    [-36, -46], [-36, -32],
    [-22, -46], [-22, -32],
  ];
  for (const [px, pz] of satCorners) {
    BOX(px, 4, pz, 1, 4, 1, 'concrete', 2, 0xf5f5f5);
    BOX(px, 12, pz, 1, 1, 1, 'steel', 2, 0xffd54f);
  }

  // Moored Chao Phraya Express Ferry & Floating Market Longtail Boats
  BOX(-52, 0, -32, 5, 1, 2, 'wood', 2, 0x8d6e63); // Ferry hull
  BOX(-50, 2, -32, 4, 1, 2, 'panel', 2, 0xff5722); // Orange canopy
  BOX(-16, 0, -38, 3, 1, 1, 'wood', 2, 0x5d4037); // Longtail boat 1
  BOX(-16, 0, -34, 3, 1, 1, 'wood', 2, 0x5d4037); // Longtail boat 2

  // ------------------------------------------------------------
  // 1. WAT PHO (WHERE'S WALDO TARGET SHRINE & RECLINING BUDDHA)
  // ------------------------------------------------------------
  // Located at x 24..38, z -46..-32
  BOX(24, 0, -46, 7, 2, 7, 'brick', 2, 0xd7ccc8); // Base podium (y: 0..4)
  BOX(26, 4, -44, 5, 2, 5, 'wood', 2, 0xb71c1c);  // Solid Shrine hall (y: 4..8)
  BOX(28, 4, -34, 3, 1, 1, 'steel', 2, 0xffb300); // Reclining Golden Buddha on front terrace (y: 4..6)
  BOX(26, 8, -44, 5, 1, 5, 'panel', 2, 0x2e7d32); // Green glazed roof (y: 8..10)
  BOX(28, 10, -42, 3, 1, 3, 'panel', 2, 0xf57c00); // Orange upper roof (y: 10..12)
  BOX(30, 12, -40, 1, 1, 1, 'steel', 2, 0xffd54f); // Gold peak

  // ------------------------------------------------------------
  // 2. GRAND PALACE & DUSIT MAHA PRASAT THRONE HALL
  // ------------------------------------------------------------
  // Outer White Crenellated Palace Perimeter Walls (x -20..20, z -14..14, y 0..4)
  BOX(-20, 0, -14, 20, 2, 1, 'concrete', 2, 0xf5f5f5); // North wall (z: -14..-12)
  BOX(-20, 0, 12, 20, 2, 1, 'concrete', 2, 0xf5f5f5);  // South wall (z: 12..14)
  BOX(-20, 0, -12, 1, 2, 12, 'concrete', 2, 0xf5f5f5); // West wall (x: -20..-18)
  BOX(18, 0, -12, 1, 2, 12, 'concrete', 2, 0xf5f5f5);  // East wall (x: 18..20)

  // Dusit Maha Prasat Throne Hall (x -8..8, z -6..6, y 0..28)
  // Cross-plan white marble podium base
  BOX(-8, 0, -6, 8, 3, 6, 'concrete', 2, 0xf5f5f5);
  // Main Hall Structure (y 6..12)
  BOX(-6, 6, -4, 6, 3, 4, 'wood', 2, 0xd32f2f);
  // Multi-Tiered Green & Orange Glazed Roofs (y 12..18)
  BOX(-6, 12, -4, 6, 1, 4, 'panel', 2, 0x2e7d32); // Lower green roof
  BOX(-4, 14, -2, 4, 1, 2, 'panel', 2, 0xf57c00); // Upper orange roof
  // Gilded 7-Tiered Prasat Spire (y 16..28)
  BOX(-2, 16, -2, 2, 3, 2, 'steel', 2, 0xffb300);
  for (let sy = 22; sy <= 28; sy += 2) {
    BOX(-1, sy, -1, 1, 1, 1, 'steel', 2, 0xffd54f);
  }

  // Phra Sri Rattana Chedi (Monumental Golden Stupa: x 10..16, z -2..4, y 0..22)
  BOX(10, 0, -2, 3, 4, 3, 'steel', 2, 0xffb300); // Octagonal bell base
  BOX(11, 8, -1, 2, 4, 2, 'steel', 2, 0xffb300); // Upper bell
  for (let cy = 16; cy <= 22; cy += 2) {
    BOX(12, cy, 0, 1, 1, 1, 'steel', 2, 0xffd54f); // Needle spire
  }

  // Tuk-Tuk Bot 🛺 (Momentum Friend sitting on Sanam Luang Promenade)
  BOX(-6, 0, 16, 2, 1, 2, 'concrete', 2, 0x78909c); // Pedestal
  BOX(-6, 2, 16, 2, 1, 2, 'steel', 2, 0x1565c0);    // Royal Blue Body
  BOX(-6, 4, 16, 2, 1, 2, 'panel', 2, 0xffeb3b);    // Yellow Canopy Roof

  // ------------------------------------------------------------
  // 3. BTS SKYTRAIN ELEVATED VIADUCT & TRAIN (RAMA I / SUKHUMVIT)
  // ------------------------------------------------------------
  // Elevated Dual-Track Concrete Viaduct (x -2..2, z 24..60, y 0..10)
  // Support Piers
  for (let pz = 24; pz <= 56; pz += 4) {
    BOX(-2, 0, pz, 2, 4, 1, 'concrete', 2, 0x78909c); // Support piers (y: 0..8, x: -2..2)
  }
  BOX(-2, 0, 58, 2, 4, 1, 'concrete', 2, 0x78909c);   // Terminal support pier (y: 0..8, z: 58..60)
  // Elevated Track Deck at y = 8 (4x2x36m)
  BOX(-2, 8, 24, 2, 1, 18, 'concrete', 2, 0x90a4ae);

  // 3-Car BTS Skytrain EMU sitting on track (x -1..1, z 30..50, y 10..14)
  BOX(-1, 10, 30, 1, 2, 10, 'steel', 2, 0xffffff); // White train body

  // ------------------------------------------------------------
  // 4. KING POWER MAHANAKHON (PIXELATED GLASS MONOLITH)
  // ------------------------------------------------------------
  // Located at x -40..-22, z 28..46, y 0..46 (18x46x18m)
  // Solid structural glass core
  BOX(-40, 0, 28, 9, 23, 9, 'steel', 2, 0x455a64);
  // SkyWalk Glass Observation deck atop tower (y = 46)
  BOX(-38, 46, 30, 7, 1, 7, 'panel', 2, 0x81d4fa);

  // ------------------------------------------------------------
  // 5. SIAM PARAGON & CENTRALWORLD MEGA-MALL COMPLEX
  // ------------------------------------------------------------
  // Located at x 22..44, z 28..48, y 0..28 (22x28x20m)
  BOX(22, 0, 28, 11, 14, 10, 'panel', 2, 0x0288d1);
  BOX(24, 28, 30, 9, 1, 8, 'steel', 2, 0xcfd8dc); // Atrium Roof

  // Night Market Street Food Stalls (x -18..18, z 50..58, avoiding central Skytrain pier at x=0)
  for (let sx = -16; sx <= 16; sx += 8) {
    if (sx === 0) continue;
    BOX(sx, 0, 52, 2, 1, 2, 'wood', 2, 0x8d6e63);
    BOX(sx, 2, 52, 2, 1, 2, 'panel', 2, sx % 16 === 0 ? 0xff5722 : 0x4caf50);
  }

  // ------------------------------------------------------------
  // 6. STREET FURNITURE & ILLUMINATION
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (bx < -24 || bx > 24) bollard(sim, bx, -2);
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (lx < -24 || lx > 24) {
      lampPost(sim, lx, 0);
      planter(sim, lx + 4, 0, 2, 1);
      bench(sim, lx + 8, 0);
    }
  }

  // ------------------------------------------------------------
  // 7. CANAL COPING & PLAZA INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const greys = [0x607d8b, 0x78909c, 0x546e7a];
  const currentCount = sim.blocks.length;
  const needed = TARGET_BLOCKS - currentCount;

  // Filler must stay off declared roadway rects (probeRoadConflicts), off
  // water rects, and clear of the default spawn hole at (0,16) radius 1.1
  // (probeIdleStability) — a raw raster scan otherwise paints concrete
  // straight through them. Skipped cells are simply not counted toward
  // `placed`, so the same scan keeps going until it finds `needed` legal
  // cells elsewhere in its range — the total block count is unaffected.
  // (x, z) is the block's MIN CORNER (matching sim._block's own convention —
  // its center comes out as x+s/2), so the overlap test below mirrors
  // validate.mjs's rectsOverlap exactly rather than approximating it around
  // a center point.
  const SPAWN_X = 0, SPAWN_Z = 16, SPAWN_KEEPOUT = 3;
  function fillerExcluded(x, z) {
    for (const r of roads) {
      if (x + 0.5 > r.x && x < r.x + r.w && z + 0.5 > r.z && z < r.z + r.d) return true;
    }
    for (const r of water) {
      if (x + 0.5 > r.x && x < r.x + r.w && z + 0.5 > r.z && z < r.z + r.d) return true;
    }
    const cx = x + 0.25, cz = z + 0.25;
    if (Math.hypot(cx - SPAWN_X, cz - SPAWN_Z) < SPAWN_KEEPOUT) return true;
    return false;
  }

  if (needed > 0) {
    let placed = 0;
    // Course A: Chao Phraya riverbed coping (z = -26 down to -54, y = 0)
    for (let rz = -26; rz >= -54 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (!fillerExcluded(rx, rz) && canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course B: Sanam Luang Royal Promenade (z = -16 down to -24, y = 0)
    for (let rz = -16; rz >= -24 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= 54 && placed < needed; rx += 0.5) {
        if (!fillerExcluded(rx, rz) && canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course C: Siam & Sukhumvit Modern Plaza (z = 20 to 66, x = -54 to 54, y = 0)
    for (let rz = 20; rz <= 66 && placed < needed; rz += 0.5) {
      for (let rx = -56; rx <= 57.5 && placed < needed; rx += 0.5) {
        if (!fillerExcluded(rx, rz) && canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course D: Sanam Luang West & East Flanks (z = -6 down to -16, x = -54..-22 and 22..54)
    for (let rz = -6; rz >= -16 && placed < needed; rz -= 0.5) {
      for (let rx = -54; rx <= -22 && placed < needed; rx += 0.5) {
        if (!fillerExcluded(rx, rz) && canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
      for (let rx = 22; rx <= 54 && placed < needed; rx += 0.5) {
        if (!fillerExcluded(rx, rz) && canPlace(sim, rx, 0, rz, 0.5)) {
          const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 3) + 3) % 3;
          B(rx, 0, rz, 'concrete', 0.5, greys[cIdx]);
          placed++;
        }
      }
    }
    // Course E: Palace Flanks & Royal Promenade (z = -6 to 20, x = -54 to 54, y = 0)
    // The one z-band no earlier course ever scanned. Water/road/spawn exclusion
    // shrank Course A and B's yield below `needed` (most of Course A's nominal
    // area is the river itself), so this course picks up the shortfall from
    // open ground beside the palace walls and Sanam Luang promenade rather than
    // dropping blocks or letting an earlier course spill past its own district.
    for (let rz = -6; rz <= 20 && placed < needed; rz += 0.5) {
      for (let rx = -56; rx <= 57.5 && placed < needed; rx += 0.5) {
        if (!fillerExcluded(rx, rz) && canPlace(sim, rx, 0, rz, 0.5)) {
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
