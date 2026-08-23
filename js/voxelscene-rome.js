// Rome Colosseum, St. Peter’s Great Dome & Aqueducts — Sandbox Scene (Act III, chapter 13).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Rome unites imperial antiquity, Renaissance domes, and the River Tiber:
//
//   x -56..-24  River Tiber Corridor: Flowing green-blue Tiber waters, Ponte Sant'Angelo stone bridge
//               (y=0..8), quayside lungotevere embankments, and Castel Sant'Angelo approach
//   x -24..14   Vatican & Piazza Navona: St. Peter's Basilica & Great Renaissance Dome (y=0..44),
//               Vatican red granite obelisk, Piazza Navona cobblestones, and Vespa Scooter Bot 🛵
//   x  14..56   Colosseum & Roman Aqueducts: Monumental Colosseum amphitheatre with multi-tier
//               travertine arcades (y=0..30), and Aqua Claudia double-tier stone aqueduct arches
//
// TRANSIT:
//   - White Fiat 500 & Alfa Romeo Rome taxis
//   - Maroon ATAC city transit buses
//   - Tiber river shuttle boats
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 35,000 blocks.

import {
  bench, bollard, clearOfSpawn, freeForFill, generateBlockers, inDecorRects,
  lampPost, planter,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const ROME_VEHICLES = [
  // Via dei Fori Imperiali (axis x, z 4..10)
  { kind: 'sedan', x: -14, z: 7, axis: 'x', color: 0xffffff, roofColor: 0x212121 },   // White Rome Taxi
  { kind: 'sedan', x: 22, z: 7, axis: 'x', color: 0xb71c1c, roofColor: 0xffffff },    // Alfa Romeo Maroon
  { kind: 'bus', x: 44, z: 7, axis: 'x', color: 0x880e4f, roofColor: 0xffffff },      // ATAC Bus

  // Lungotevere (axis z, x -24..-18)
  { kind: 'sedan', x: -21, z: -38, axis: 'z', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'boxVan', x: -21, z: 24, axis: 'z', len: 5, color: 0xffffff, color2: 0x0288d1 },
];

export const ROME_ROAD_SPANS = [
  // Ponte Sant'Angelo stone bridge deck crossing over the River Tiber
  { minX: -48, maxX: -24, minZ: -24, maxZ: -18, minY: 4 },
];

export const ROME_OPEN_GROUND = [];

export const ROME_STREETS = [
  { x: -18, z: 4, w: 74, d: 6, axis: 'x' },     // Via dei Fori Imperiali
  { x: -18, z: 54, w: 74, d: 5, axis: 'x' },    // Via della Conciliazione
  { x: -24, z: -56, w: 6, d: 118, axis: 'z' },  // Lungotevere
  { x: 26, z: 4, w: 5, d: 50, axis: 'z' },      // Via del Corso
];

export const ROME_CROSSINGS = [
  [0, -12], [0, 20],
  [1, 6], [1, 38],
];

// What the card promises, held to what the scene builds — see PARIS_LANDMARKS
// in js/voxelscene-paris.js for why `voids` is the clause that matters.
export const ROME_LANDMARKS = [
  {
    id: 'colosseum',
    name: 'Colosseum Oval Arena',
    foot: { minX: 10, maxX: 48, minZ: -46, maxZ: -14 },
    peak: 16,
    voids: [{ minY: 0, maxY: 12, minFrac: 0.55, why: 'the arena and the arcade openings' }],
  },
  {
    id: 'st_peters',
    name: 'St. Peter\u2019s Great Dome',
    foot: { minX: -16, maxX: 16, minZ: 22, maxZ: 52 },
    peak: 44,
  },
  {
    id: 'aqua_claudia',
    name: 'Roman Aqueduct Arches',
    foot: { minX: 48, maxX: 52, minZ: -10, maxZ: 46 },
    peak: 16,
    voids: [{ minY: 0, maxY: 12, minFrac: 0.55, why: 'the arches between the piers' }],
  },
];

const TARGET_BLOCKS = 35000;

export function buildRome(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // River Tiber Channel (x: -56..-24, z: -56..64)
  water.push(
    { x: -56, z: -56, w: 32, d: 120, color: 0x00695c }, // River Tiber Green Waterway
  );

  // Villa Borghese & Palatine Hill Pines
  parks.push(
    { x: -18, z: -52, w: 28, d: 36, color: 0x2e7d32 }, // Palatine Hill Pine Gardens
    { x: 34, z: 12, w: 20, d: 40, color: 0x388e3c },   // Caelian Hill Cypress Woods
  );

  // Piazza San Pietro & Colosseum Plazas
  plaza.push(
    { x: -16, z: 14, w: 40, d: 46, color: 0xd7ccc8 },  // St. Peter's Travertine Piazza
    { x: 12, z: -52, w: 44, d: 46, color: 0xbcaaa4 },  // Colosseum Outer Esplanade
  );

  boardwalk.push(
    { x: -24, z: -50, w: 4, d: 108, color: 0x795548 }, // Tiber Embankment Stone Pier
  );

  cobbles.push(
    { x: -14, z: -12, w: 24, d: 16, color: 0x616161 }, // Piazza Navona Sampietrini Cobbles
    { x: 18, z: 8, w: 34, d: 14, color: 0x757575 },   // Imperial Forum Cobblestones
  );

  // Roads
  roads.push(
    { x: -18, z: 4, w: 64, d: 6, color: 0x37474f },    // Via dei Fori Imperiali (ends at x=46)
    { x: -18, z: 54, w: 74, d: 5, color: 0x37474f },   // Via della Conciliazione
    { x: -24, z: -56, w: 6, d: 118, axis: 'z', color: 0x37474f }, // Lungotevere
    { x: 26, z: 4, w: 5, d: 50, axis: 'z', color: 0x37474f },     // Via del Corso
  );

  // Sidewalks
  sidewalks.push(
    { x: -18, z: 10, w: 64, d: 3, color: 0xb0bec5 },
    { x: -18, z: 1, w: 64, d: 3, color: 0xb0bec5 },
    { x: -18, z: 59, w: 74, d: 3, color: 0xb0bec5 },
    { x: -18, z: 51, w: 74, d: 3, color: 0xb0bec5 },
    { x: -18, z: -56, w: 3, d: 118, color: 0xb0bec5 },
    { x: 21, z: 4, w: 5, d: 50, color: 0xb0bec5 },
    { x: 31, z: 4, w: 5, d: 50, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. THE COLOSSEUM (FLAVIAN AMPHITHEATRE)
  // ------------------------------------------------------------
  // Located at x 10..48, z -46..-14, y 0..16 (38x32x16m)
  //
  // A RING ROUND AN ARENA, and much lower than it shipped. Two things were
  // wrong and they compounded. The proportion: the real amphitheatre is 189 m
  // on its long axis and 48 m tall, about 1:0.25, and this was 34 m by 30 m
  // tall — 1:0.88, which reads as a tower block rather than the widest low
  // ring in Rome. And it was solid, so the arena, the hole the whole building
  // exists to enclose, was filled with travertine.
  //
  // Built as an elliptical arcade: piers on the ellipse carrying a continuous
  // attic cornice, arena open inside them. Openings are flanked on both sides
  // at every angle, so each cornice cell bridging one is a single legal hop —
  // the same reason Paris's tower is an arch across one axis, not a cross.
  const COL = { x0: 10, x1: 48, z0: -46, z1: -14 };
  const colCx = (COL.x0 + COL.x1) / 2, colCz = (COL.z0 + COL.z1) / 2;
  const colAx = (COL.x1 - COL.x0) / 2, colAz = (COL.z1 - COL.z0) / 2;
  const COL_TIER_COLORS = [0xd7ccc8, 0xcfd8dc, 0xbcaaa4]; // Doric, Ionic, Corinthian

  // Arcade piers, walked round the ellipse. Deduped through a Set: rounding two
  // neighbouring angles onto the same 2 m cell would place a block twice and
  // fail cell ownership.
  // Centres snap to a 4 m lattice, which is the pier's own width: two piers an
  // odd 2 m apart would interpenetrate and fail cell ownership, and the Set
  // only dedupes exact repeats, not overlaps.
  const colPiers = new Set();
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const px = Math.round((colCx + Math.cos(t) * (colAx - 2)) / 4) * 4;
    const pz = Math.round((colCz + Math.sin(t) * (colAz - 2)) / 4) * 4;
    colPiers.add(`${px},${pz}`);
  }
  for (const key of colPiers) {
    const [px, pz] = key.split(',').map(Number);
    for (let t = 0; t < 3; t++) BOX(px - 2, t * 4, pz - 2, 2, 2, 2, 'concrete', 2, COL_TIER_COLORS[t]);
  }

  // Attic cornice: a closed elliptical band over the piers (y: 12..16), which
  // is what makes the arcade read as one building rather than a colonnade.
  for (let x = COL.x0; x < COL.x1; x += 2) {
    for (let z = COL.z0; z < COL.z1; z += 2) {
      const u = (x + 1 - colCx) / colAx, v = (z + 1 - colCz) / colAz;
      const ui = (x + 1 - colCx) / (colAx - 4), vi = (z + 1 - colCz) / (colAz - 4);
      if (u * u + v * v > 1) continue;          // outside the outer ellipse
      if (ui * ui + vi * vi <= 1) continue;     // inside the arena
      BOX(x, 12, z, 1, 2, 1, 'concrete', 2, 0xa1887f);
    }
  }

  // ------------------------------------------------------------
  // 1. ST. PETER'S BASILICA & RENAISSANCE DOME
  // ------------------------------------------------------------
  // Located at x -16..16, z 22..52, y 0..44 (32x30x44m)
  // Travertine Main Nave & Facade (y: 0..18)
  BOX(-16, 0, 22, 16, 9, 15, 'concrete', 2, 0xf5f5f5); // Basilica Body (y: 0..18)
  BOX(-14, 18, 24, 14, 2, 13, 'concrete', 2, 0xe0e0e0); // Parapet with Apostles Statues (y: 18..22)

  // Monumental Ribbed Renaissance Double Dome (y: 22..38, x: -10..10, z: 28..48)
  BOX(-10, 22, 28, 10, 8, 10, 'panel', 2, 0x90a4ae);   // Lead/Copper Sheathed Dome
  BOX(-6, 38, 32, 6, 2, 6, 'concrete', 2, 0xf5f5f5);   // Dome Drum Lantern (y: 38..42)
  BOX(-2, 42, 34, 2, 1, 2, 'steel', 2, 0xffd700);      // Gilded Papal Cross Finial (y: 42..44)

  // Vatican Egyptian Red Granite Obelisk (x: 4..8, z: 12..16, y: 0..16)
  BOX(4, 0, 12, 2, 1, 2, 'concrete', 2, 0x424242);   // Pedestal (y: 0..2)
  BOX(5, 2, 13, 1, 6, 1, 'brick', 2, 0xb71c1c);      // Red Granite Needle Obelisk (y: 2..14)
  BOX(5, 14, 13, 1, 1, 1, 'steel', 2, 0xffd700);     // Gilded Star Cross Top (y: 14..16)

  // ------------------------------------------------------------
  // 2. ROMAN AQUEDUCT (AQUA CLAUDIA STONE ARCHES)
  // ------------------------------------------------------------
  // Spans along eastern district boundary (x: 48..52, z: -10..46, y: 0..16)
  //
  // Arches, which the card has always promised and the scene admitted in its
  // own comment it did not build: this shipped as one solid 4 x 16 x 56 m stone
  // wall. Piers every 8 m carry a continuous channel, so the 4 m gaps between
  // them are single hops and the whole run stands.
  // 2 m piers on a 6 m rhythm: 4 m of arch between each pair, which is both the
  // widest gap a 2 m springing course can bridge in one hop and close to the
  // real Aqua Claudia's slender-pier, wide-arch proportion. 4 m piers on an 8 m
  // rhythm were tried and left the run only 41% open — arches you could not see
  // daylight through. The last pier lands at z 44 and caps the run.
  for (let az = -10; az < 46; az += 6) {
    BOX(48, 0, az, 2, 6, 1, 'concrete', 2, 0x8d6e63);   // Pier (y: 0..12)
  }
  BOX(48, 12, -10, 2, 1, 28, 'concrete', 2, 0xa1887f);  // Springing course (y: 12..14)
  BOX(48, 14, -10, 2, 1, 28, 'concrete', 2, 0x8d6e63);  // Specus water channel (y: 14..16)

  // ------------------------------------------------------------
  // 3. PONTE SANT'ANGELO STONE BRIDGE
  // ------------------------------------------------------------
  // Spanning River Tiber at x: -48..-24, z: -24..-18, y: 0..8
  BOX(-48, 4, -24, 12, 2, 3, 'concrete', 2, 0xd7ccc8); // Roadway deck (y: 4..8)
  // Bridge Piers in water
  BOX(-48, 0, -24, 2, 2, 3, 'concrete', 2, 0xa1887f); // West bank pier
  BOX(-44, 0, -24, 2, 2, 3, 'concrete', 2, 0xa1887f);
  BOX(-36, 0, -24, 2, 2, 3, 'concrete', 2, 0xa1887f);
  BOX(-28, 0, -24, 2, 2, 3, 'concrete', 2, 0xa1887f);

  // ------------------------------------------------------------
  // 4. MOMENTUM FRIEND: VESPA SCOOTER BOT 🛵
  // ------------------------------------------------------------
  // Located on Piazza Navona Cobblestone Pedestal (x: -4..-2, z: -2..0, y: 0..8)
  BOX(-4, 0, -2, 1, 2, 1, 'concrete', 2, 0x37474f); // Basalt Pedestal (y: 0..4)
  BOX(-4, 4, -2, 1, 1, 1, 'steel', 2, 0x00e676);    // Emerald Italian Vespa Body (y: 4..6)
  BOX(-5, 4, -2, 1, 1, 1, 'steel', 1, 0xffffff);    // White Wheel Rim Front (x: -5..-4)
  BOX(-2, 4, -2, 1, 1, 1, 'steel', 1, 0xffffff);    // White Wheel Rim Rear (x: -2..-1)
  BOX(-4, 6, -2, 1, 1, 1, 'panel', 1, 0xffd700);    // Headlight & Mirror Finial

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & ROMAN FOUNTAINS
  // ------------------------------------------------------------
  for (let bz = -46; bz <= 16; bz += 8) {
    if (Math.abs(bz - 7) > 4) {
      bollard(sim, -16, bz);
    }
  }
  for (let lz = -48; lz <= -16; lz += 16) {
    if (Math.abs(lz - 7) > 4) {
      lampPost(sim, -16, lz);
      planter(sim, -16, lz + 4, 1, 2);
      bench(sim, -16, lz + 8);
    }
  }

  // ------------------------------------------------------------
  // 6. ROMAN TRAVERTINE & SAMPIETRINI INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const romeColors = [0xd7ccc8, 0xbcaaa4, 0xa1887f, 0x757575];
  const currentCount = sim.blocks.length;
  const needed = TARGET_BLOCKS - currentCount;
  const R = sim.boundsRect;
  const maxX0 = R.maxX - 0.5;
  const maxZ0 = R.maxZ - 0.5;

  const tryPlaceFiller = (rx, rz, allowWater = false) => {
    if (inDecorRects(rx, rz, 0.5, roads)) return false;
    if (!allowWater && inDecorRects(rx, rz, 0.5, water)) return false;
    if (!clearOfSpawn(rx, rz)) return false;
    if (!freeForFill(sim, rx, 0, rz, 0.5)) return false;
    const cIdx = (((Math.round(rx * 2) + Math.round(rz * 2)) % 4) + 4) % 4;
    B(rx, 0, rz, 'concrete', 0.5, romeColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Course A: Colosseum & Palatine (z = -24 down to R.minZ, x = -18 to maxX0, y = 0)
    for (let rz = -24; rz >= R.minZ && placed < needed; rz -= 0.5) {
      for (let rx = -18; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course B: Piazza Navona & Forum (z = -20 to 20, x = -18 to maxX0, y = 0)
    for (let rz = -20; rz <= 20 && placed < needed; rz += 0.5) {
      for (let rx = -18; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course C: Vatican & St. Peter's (z = 24 to maxZ0, x = -18 to maxX0, y = 0)
    for (let rz = 24; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = -18; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course D: River Tiber Riverbed Coping (x = R.minX to -24, z = R.minZ to maxZ0, y = 0)
    for (let rz = R.minZ; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= -24 && placed < needed; rx += 0.5) {
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
