// Athens Acropolis Parthenon, Plaka & Port Piraeus — Sandbox Scene (Act III, chapter 12).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Athens spans classical antiquity on the limestone Acropolis down to the Saronic Gulf:
//
//   z -56..-18  Acropolis Sacred Rock: Classical Doric Parthenon marble colonnade (y=0..26), Erechtheion
//               temple & draped Caryatid maidens, and Owl of Athena Bot 🦉 atop belvedere pedestal
//   z -18..46   Plaka & Historic City: Stepped stone taverna terraces, Cycladic whitewashed houses,
//               olive groves, and Leoforos Vasilissis Sofias grand boulevard
//   z  46..66   Port of Piraeus Harbour: Saronic Gulf azure waters, stone quays, and traditional
//               blue and red fishing kaikis
//
// TRANSIT:
//   - Yellow Athens Skoda & Mercedes taxis
//   - Piraeus harbour fishing kaikis & island passenger ferries
//   - Tour buses around Acropolis ring road
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 26,000 blocks.

import {
  bench, bollard, clearOfSpawn, freeForFill, generateBlockers, inDecorRects,
  lampPost, planter, zebra,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const ATHENS_VEHICLES = [
  // Leoforos Vasilissis Sofias (axis x, z 8..14)
  { kind: 'sedan', x: -38, z: 11, axis: 'x', color: 0xffeb3b, roofColor: 0x212121 }, // Yellow Athens Taxi
  { kind: 'sedan', x: -14, z: 11, axis: 'x', color: 0xffeb3b, roofColor: 0x212121 },
  { kind: 'bus', x: 22, z: 11, axis: 'x', color: 0x0288d1, roofColor: 0xffffff },     // Blue City Transit
  { kind: 'sedan', x: 44, z: 11, axis: 'x', color: 0xffeb3b, roofColor: 0x212121 },

  // Dionysiou Areopagitou Promenade (axis x, z 42..47)
  { kind: 'sedan', x: -28, z: 44, axis: 'x', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'boxVan', x: 16, z: 44, axis: 'x', len: 5, color: 0xffffff, color2: 0x0288d1 },
];

export const ATHENS_ROAD_SPANS = [];

export const ATHENS_OPEN_GROUND = [];

export const ATHENS_STREETS = [
  { x: -56, z: 8, w: 114, d: 6, axis: 'x' },    // Leoforos Vasilissis Sofias
  { x: -56, z: 42, w: 114, d: 5, axis: 'x' },   // Dionysiou Areopagitou
  { x: -34, z: 8, w: 5, d: 40, axis: 'z' },     // Panepistimiou Ave (ends at z=48)
  { x: 30, z: 8, w: 5, d: 40, axis: 'z' },      // Filellinon Street (ends at z=48)
];

// Zebra crossing positions: `[streetIndex, at]`, where `at` is the coordinate
// along that street's own axis and the crossing occupies `at .. at + XW_LEN`.
export const XW_LEN = 2.8;

export const ATHENS_CROSSINGS = [
  [0, -18], [0, 16],
  [1, -12], [1, 24],
];

// What the card promises, held to what the scene builds — see PARIS_LANDMARKS
// in js/voxelscene-paris.js for why `voids` is the clause that matters.
export const ATHENS_LANDMARKS = [
  {
    id: 'parthenon',
    name: 'Acropolis Parthenon',
    foot: { minX: -18, maxX: 18, minZ: -40, maxZ: -24 },
    peak: 16,
    voids: [{ minY: 2, maxY: 10, minFrac: 0.45, why: 'the peristyle colonnade' }],
  },
  {
    id: 'erechtheion',
    name: 'Erechtheion Caryatids',
    foot: { minX: -24, maxX: -10, minZ: -16, maxZ: 0 },
    peak: 12,
  },
  {
    id: 'plaka',
    name: 'Plaka Stepped Streets',
    foot: { minX: -18, maxX: 18, minZ: 0, maxZ: 8 },
    peak: 10,
  },
];

const TARGET_BLOCKS = 26000;

export function buildAthens(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 66 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  // Every layer the draw-order contract names, in the order it paints. An
  // unused layer keeps its key rather than being dropped.
  const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [], roads = [];
  const rail = [], bikePaths = [], laneMarkers = [], crosswalks = [], water = [], boardwalk = [];

  // ============================================================ DISTRICT SURFACES
  // Port of Piraeus Harbour Basin (z: 48..66, x: -56..58)
  water.push(
    { x: -56, z: 48, w: 114, d: 18, color: 0x00838f }, // Saronic Gulf Waters
  );

  // National Garden of Athens & Acropolis Slopes
  parks.push(
    { x: -52, z: -52, w: 24, d: 32, color: 0x2e7d32 }, // Philopappos Hill Pine Woods
    { x: 28, z: -52, w: 26, d: 32, color: 0x388e3c },  // National Gardens Olive Groves
    { x: -50, z: 20, w: 14, d: 20, color: 0x43a047 },  // Syntagma Park
  );

  // Acropolis Sacred Rock & Syntagma Square Plazas
  plaza.push(
    { x: -24, z: -52, w: 48, d: 46, color: 0xd7ccc8 }, // Acropolis Plateau Limestone Platform
    { x: -16, z: 18, w: 32, d: 20, color: 0xe0e0e0 },  // Syntagma Marble Concourse
  );

  boardwalk.push(
    { x: -54, z: 46, w: 108, d: 2, color: 0x795548 }, // Piraeus Quayside Wooden Docks
  );

  cobbles.push(
    { x: -24, z: -6, w: 48, d: 12, color: 0xbcaaa4 },  // Plaka Stepped Cobblestones
    { x: 18, z: 20, w: 36, d: 20, color: 0xa1887f },   // Monastiraki Flea Market Cobbles
  );

  // Road network
  roads.push(
    { x: -56, z: 8, w: 114, d: 6, color: 0x37474f },   // Leoforos Vasilissis Sofias
    { x: -56, z: 42, w: 114, d: 5, color: 0x37474f },  // Dionysiou Areopagitou
    { x: -34, z: 8, w: 5, d: 40, axis: 'z', color: 0x37474f },  // Panepistimiou Ave
    { x: 30, z: 8, w: 5, d: 40, axis: 'z', color: 0x37474f },   // Filellinon Street
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: 14, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 5, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 47, w: 114, d: 1, color: 0xb0bec5 },
    { x: -56, z: 39, w: 114, d: 3, color: 0xb0bec5 },
    { x: -37, z: 8, w: 3, d: 40, color: 0xb0bec5 },
    { x: -29, z: 8, w: 3, d: 40, color: 0xb0bec5 },
    { x: 27, z: 8, w: 3, d: 40, color: 0xb0bec5 },
    { x: 35, z: 8, w: 3, d: 40, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. ACROPOLIS PARTHENON (DORIC MARBLE TEMPLE)
  // ------------------------------------------------------------
  // Located at x -18..18, z -40..-24, y 0..16 (36x16x16m)
  //
  // A PERISTYLE, and a long low one. The temple shipped as a solid 36 x 24 x
  // 26 m block: proportions of 1 : 0.67 : 0.72 against the real stylobate's
  // 69.5 x 30.9 m under a 13.7 m order, which is 1 : 0.44 : 0.20. Built tall
  // and solid it read as a blockhouse. The colonnade IS the building — 8 columns
  // across the ends and 17 down the flanks, with sky between all of them.
  //
  // Columns on a 4 m rhythm leave 2 m gaps, well inside the one 2 m hop the
  // entablature above needs, and the cella within is a hollow shell rather than
  // a filled core.
  BOX(-18, 0, -40, 18, 1, 8, 'concrete', 2, 0xd7ccc8);   // Crepidoma (y: 0..2)

  const parthenonCols = new Set();
  for (let cx = -18; cx <= 16; cx += 4) { parthenonCols.add(`${cx},-40`); parthenonCols.add(`${cx},-26`); }
  for (let cz = -36; cz <= -28; cz += 4) { parthenonCols.add(`-18,${cz}`); parthenonCols.add(`16,${cz}`); }
  for (const key of parthenonCols) {
    const [cx, cz] = key.split(',').map(Number);
    BOX(cx, 2, cz, 1, 4, 1, 'concrete', 2, 0xfff8e1);    // Doric column (y: 2..10)
  }

  // Cella (naos) walls — a hollow shell, not a filled core (x -14..14, z -38..-26).
  // The ambulatory between the peristyle and the cella is 2 m, not 4: at 4 m its
  // outer half was two hops from both the columns outside and the walls inside,
  // and seven cells of entablature came down on it.
  BOX(-14, 2, -38, 14, 4, 1, 'concrete', 2, 0xf5f5f5);   // North wall
  BOX(-14, 2, -28, 14, 4, 1, 'concrete', 2, 0xf5f5f5);   // South wall
  BOX(-14, 2, -36, 1, 4, 4, 'concrete', 2, 0xf5f5f5);    // West wall
  BOX(12, 2, -36, 1, 4, 4, 'concrete', 2, 0xf5f5f5);     // East wall

  // Interior colonnade down the naos. The real temple carries a two-storey
  // Doric order inside the cella; here it is also what holds the entablature
  // up — without it the middle of the roof is two hops from any wall and
  // seven cells of it drop.
  // Two rows, offset by 2 m so each row covers the other's gaps. A single row
  // leaves the bay behind it two hops from anything and drops five roof cells.
  for (let cx = -10; cx <= 6; cx += 4) BOX(cx, 2, -34, 1, 4, 1, 'concrete', 2, 0xfff8e1);
  for (let cx = -8; cx <= 8; cx += 4) BOX(cx, 2, -32, 1, 4, 1, 'concrete', 2, 0xfff8e1);

  // Doric Entablature, Metopes & Triglyphs (y: 10..12)
  BOX(-18, 10, -40, 18, 1, 8, 'concrete', 2, 0xf5f5f5);

  // Terracotta roof (y: 12..14) and the pediments on the short ends (y: 14..16)
  BOX(-16, 12, -38, 16, 1, 6, 'brick', 2, 0xb71c1c);
  BOX(-18, 14, -38, 2, 1, 6, 'concrete', 2, 0xffe082);   // West pediment
  BOX(14, 14, -38, 2, 1, 6, 'concrete', 2, 0xffe082);    // East pediment

  // ------------------------------------------------------------
  // 1. ERECHTHEION & CARYATID PORCH
  // ------------------------------------------------------------
  // Located at x -24..-10, z -16..-4, y 0..14
  // Main Temple Hall (x: -24..-10, z: -16..-4, y: 0..10)
  BOX(-24, 0, -16, 7, 5, 6, 'concrete', 2, 0xf5f5f5);
  // South Caryatid Porch (x: -16..-10, z: -4..0, y: 0..12)
  BOX(-16, 0, -4, 3, 5, 2, 'concrete', 2, 0xd7ccc8);   // Grounded Porch Base (y: 0..10)
  BOX(-16, 10, -4, 3, 1, 2, 'concrete', 2, 0xf5f5f5);  // Porch Entablature (y: 10..12)

  // ------------------------------------------------------------
  // 2. MOMENTUM FRIEND: OWL OF ATHENA BOT 🦉
  // ------------------------------------------------------------
  // Located atop Belvedere Pedestal (x: 14..16, z: -8..-6, y: 0..8)
  BOX(14, 0, -8, 1, 2, 1, 'concrete', 2, 0x37474f); // Pentelic Pedestal (y: 0..4)
  BOX(14, 4, -8, 1, 1, 1, 'steel', 2, 0xffd700);    // Golden Owl Body (y: 4..6)
  BOX(13, 5, -8, 1, 1, 1, 'steel', 1, 0xffb300);    // Left Feather
  BOX(16, 5, -8, 1, 1, 1, 'steel', 1, 0xffb300);    // Right Feather
  BOX(14, 6, -8, 1, 1, 1, 'panel', 1, 0x0288d1);    // Wise Blue Owl Eyes

  // ------------------------------------------------------------
  // 3. PLAKA HISTORIC HOUSES & TAVERNA TERRACES
  // ------------------------------------------------------------
  // Taverna 1 (x: -18..-6, z: 0..6, y: 0..10)
  BOX(-18, 0, 0, 6, 4, 3, 'concrete', 2, 0xfff9c4); // Pastel yellow whitewash (z: 0..6)
  BOX(-18, 8, 0, 6, 1, 3, 'brick', 2, 0xd84315);    // Terracotta roof
  BOX(-12, 0, 6, 3, 2, 1, 'wood', 2, 0x5d4037);     // Taverna pergola trellis (z: 6..8)

  // House 2 (x: 6..18, z: 0..6, y: 0..10)
  BOX(6, 0, 0, 6, 4, 3, 'concrete', 2, 0xffffff);   // Cycladic white
  BOX(6, 8, 0, 6, 1, 3, 'brick', 2, 0xd84315);

  // ------------------------------------------------------------
  // 4. PORT OF PIRAEUS HARBOUR QUAYS & FISHING KAIKIS
  // ------------------------------------------------------------
  // Kaiki 1 (x: -42..-32, z: 52..58, y: 0..8)
  BOX(-42, 0, 52, 5, 1, 3, 'wood', 2, 0x0288d1);   // Blue wooden hull
  BOX(-40, 2, 53, 3, 1, 2, 'panel', 2, 0xffffff);  // White wheelhouse
  BOX(-36, 4, 54, 1, 2, 1, 'wood', 2, 0x8d6e63);   // Fishing mast

  // Kaiki 2 (x: 18..28, z: 52..58, y: 0..8)
  BOX(18, 0, 52, 5, 1, 3, 'wood', 2, 0xd32f2f);    // Red wooden hull
  BOX(20, 2, 53, 3, 1, 2, 'panel', 2, 0xffffff);
  BOX(24, 4, 54, 1, 2, 1, 'wood', 2, 0x8d6e63);

  // ------------------------------------------------------------
  // 5. STREET FURNITURE & OLIVE URNS
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 30) > 4 && Math.abs(bx + 34) > 4) {
      bollard(sim, bx, 6);
      bollard(sim, bx, 40);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx) >= 8 && Math.abs(lx - 30) > 4 && Math.abs(lx + 34) > 4) {
      lampPost(sim, lx, 18);
      planter(sim, lx + 4, 18, 2, 1);
      bench(sim, lx + 8, 18);
    }
  }

  // ------------------------------------------------------------
  // 6. PENTELIC MARBLE & PLAZA INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const marbleColors = [0xf5f5f5, 0xd7ccc8, 0xbcaaa4, 0xfff8e1];
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
    B(rx, 0, rz, 'concrete', 0.5, marbleColors[cIdx]);
    return true;
  };

  if (needed > 0) {
    let placed = 0;
    // Course A: Acropolis Rock (z = -20 down to R.minZ, x = R.minX to maxX0, y = 0)
    for (let rz = -20; rz >= R.minZ && placed < needed; rz -= 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course B: Plaka & Syntagma (z = -18 to 40, x = R.minX to maxX0, y = 0)
    for (let rz = -18; rz <= 40 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course C: Piraeus Harbour Promenade (z = 44 to maxZ0, x = R.minX to maxX0, y = 0)
    for (let rz = 44; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz)) placed++;
      }
    }
    // Course D: Piraeus Seabed (z = 48 to maxZ0, x = R.minX to maxX0, y = 0)
    for (let rz = 48; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz, true)) placed++;
      }
    }
  }

  // Zebra crossings, drawn from ATHENS_CROSSINGS against ATHENS_STREETS.
  // Both tables shipped with every one of these scenes and nothing had ever
  // read either of them — the roads were hand-copied into the decor list
  // beside them and no crossing was drawn at all.
  const cross = (st, at) => (st.axis === 'x'
    ? zebra({ x: at, z: st.z + 0.4, w: XW_LEN, d: st.d - 0.8, axis: 'x' })
    : zebra({ x: st.x + 0.4, z: at, w: st.w - 0.8, d: XW_LEN, axis: 'z' }));
  for (const [si, at] of ATHENS_CROSSINGS) crosswalks.push(...cross(ATHENS_STREETS[si], at));

  // Camera blockers
  sim.cameraBlockers = generateBlockers(sim, 6);

  // Decor surfaces
  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };
}
