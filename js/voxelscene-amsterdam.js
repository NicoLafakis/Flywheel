// Amsterdam Canals, Step-Gable Rowhouses & Windmills — Sandbox Scene (Act IV, chapter 16).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY & ARCHITECTURAL ZONES:
// Amsterdam joins concentric historic canal rings with Dutch golden age architecture:
//
//   z -56..-40  Prinsengracht & Merchant Mansions: Concentric canal ring, 17th-century narrow
//               brick step-gable canal mansions with hoisting beams, and Royal Palace on Dam Square
//   z -40..12   Central Grachtengordel: Historic clinker brick quays, arched stone bridges,
//               and Windmill Gear Bot 🚲 on canal pedestal
//   z  12..66   Herengracht & De Gooyer Windmill: Outer canal ring with houseboats, octagonal
//               thatched windmill with spinning 4-blade lattice sails (y=0..32), and tulip gardens
//
// TRANSIT:
//   - Dutch electric blue & white city trams
//   - Glass-topped canal tour barges
//   - Cargo delivery barges
//
// BLOCK BUDGET:
//   Declared in js/citycatalog.js at exactly 28,000 blocks.

import {
  bench, bollard, clearOfSpawn, freeForFill, generateBlockers, inDecorRects,
  lampPost, planter, zebra,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const AMSTERDAM_VEHICLES = [
  // Damrak Boulevard (axis x, z -8..-2)
  { kind: 'bus', x: -38, z: -5, axis: 'x', color: 0x0288d1, roofColor: 0xffffff },     // Blue City Tram/Bus
  { kind: 'sedan', x: -14, z: -5, axis: 'x', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'sedan', x: 18, z: -5, axis: 'x', color: 0x2e7d32, roofColor: 0xffffff },

  // Rozengracht Avenue (axis x, z 44..50)
  { kind: 'bus', x: -28, z: 47, axis: 'x', color: 0x0288d1, roofColor: 0xffffff },
  { kind: 'sedan', x: 22, z: 47, axis: 'x', color: 0xffffff, roofColor: 0x212121 },
  { kind: 'boxVan', x: 44, z: 47, axis: 'x', len: 5, color: 0xffffff, color2: 0xe65100 },
];

export const AMSTERDAM_ROAD_SPANS = [
  // 4 Arched Brick Bridges spanning north and south canals
  { minX: -36, maxX: -30, minZ: -48, maxZ: -40, minY: 4 },
  { minX: 30, maxX: 36, minZ: -48, maxZ: -40, minY: 4 },
  { minX: -36, maxX: -30, minZ: 12, maxZ: 20, minY: 4 },
  { minX: 30, maxX: 36, minZ: 12, maxZ: 20, minY: 4 },
];

export const AMSTERDAM_OPEN_GROUND = [];

export const AMSTERDAM_STREETS = [
  { x: -56, z: -8, w: 114, d: 6, axis: 'x' },   // Damrak Boulevard
  { x: -56, z: 44, w: 114, d: 6, axis: 'x' },   // Rozengracht Avenue

  // Prinsengracht Quay (x: -36..-30) split across canals
  { x: -36, z: -56, w: 6, d: 8, axis: 'z' },
  { x: -36, z: -40, w: 6, d: 52, axis: 'z' },
  { x: -36, z: 20, w: 6, d: 46, axis: 'z' },

  // Keizersgracht Quay (x: 30..36) split across canals
  { x: 30, z: -56, w: 6, d: 8, axis: 'z' },
  { x: 30, z: -40, w: 6, d: 52, axis: 'z' },
  { x: 30, z: 20, w: 6, d: 46, axis: 'z' },
];

// Zebra crossing positions: `[streetIndex, at]`, where `at` is the coordinate
// along that street's own axis and the crossing occupies `at .. at + XW_LEN`.
export const XW_LEN = 2.8;

export const AMSTERDAM_CROSSINGS = [
  [0, -18], [0, 14], [0, 42],
  [1, -8], [1, 26],
];

// What the card promises, held to what the scene builds — see PARIS_LANDMARKS
// in js/voxelscene-paris.js for why `voids` is the clause that matters.
export const AMSTERDAM_LANDMARKS = [
  {
    id: 'canal_bridges',
    name: 'Canal Ring Bridge Network',
    foot: { minX: -36, maxX: 36, minZ: -48, maxZ: -40 },
    peak: 6,
  },
  {
    id: 'gable_row',
    name: 'Step-Gable Merchant Mansions',
    foot: { minX: -24, maxX: 26, minZ: -36, maxZ: -26 },
    peak: 18,
  },
  {
    id: 'de_gooyer',
    name: 'Historic Windmill Blades',
    foot: { minX: 38, maxX: 48, minZ: 22, maxZ: 34 },
    peak: 32,
    voids: [{ minY: 14, maxY: 32, minFrac: 0.55, why: 'the open lattice of the sails' }],
  },
];

const TARGET_BLOCKS = 28000;

export function buildAmsterdam(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -56, maxX: 58, minZ: -56, maxZ: 44 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  // Every layer the draw-order contract names, in the order it paints. An
  // unused layer keeps its key rather than being dropped.
  const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [], roads = [];
  const rail = [], bikePaths = [], laneMarkers = [], crosswalks = [], water = [], boardwalk = [];

  // ============================================================ DISTRICT SURFACES
  // 2 Concentric Grachten Canal Rings (North: z -48..-40, South: z 12..20)
  water.push(
    { x: -56, z: -48, w: 114, d: 8, color: 0x00695c }, // Prinsengracht Canal Ring
    { x: -56, z: 12, w: 114, d: 8, color: 0x00695c },  // Herengracht Canal Ring
  );

  // Vondelpark & Keukenhof Tulip Gardens
  parks.push(
    { x: -52, z: -38, w: 14, d: 28, color: 0x2e7d32 }, // West Vondelpark
    { x: -50, z: 22, w: 14, d: 20, color: 0x388e3c },  // South Tulip Park
    { x: 38, z: 22, w: 18, d: 20, color: 0x43a047 },   // Windmill Mill Green
  );

  // Dam Square & Museumplein Plazas
  plaza.push(
    { x: -24, z: -24, w: 48, d: 14, color: 0xd7ccc8 }, // Dam Square Royal Concourse
    { x: -24, z: 22, w: 48, d: 12, color: 0xb0bec5 },  // Museumplein Concourse
  );

  boardwalk.push(
    { x: -54, z: -40, w: 108, d: 2, color: 0x6d4c41 }, // North Canal Quayside Pier
    { x: -54, z: 20, w: 108, d: 2, color: 0x6d4c41 },  // South Canal Quayside Pier
  );

  cobbles.push(
    { x: -24, z: -36, w: 48, d: 10, color: 0x8d6e63 }, // Historic Clinker Brick Quays
    { x: -24, z: 2, w: 48, d: 8, color: 0x795548 },    // Spui Book Market Cobbles
  );

  // Road network
  roads.push(
    { x: -56, z: -8, w: 114, d: 6, color: 0x37474f },  // Damrak Boulevard
    { x: -56, z: 36, w: 114, d: 6, color: 0x37474f },  // Rozengracht Avenue
    { x: -36, z: -56, w: 6, d: 8, axis: 'z', color: 0x37474f },
    { x: -36, z: -40, w: 6, d: 52, axis: 'z', color: 0x37474f },
    { x: 30, z: -56, w: 6, d: 8, axis: 'z', color: 0x37474f },
    { x: 30, z: -40, w: 6, d: 52, axis: 'z', color: 0x37474f },
    // South of the Herengracht. Both north-south roads used to stop dead at the
    // canal's north bank (z 12) while the bridges over it were built and
    // declared in AMSTERDAM_ROAD_SPANS — so each of those two bridges crossed
    // the water and landed on bare ground, with Rozengracht Avenue stranded at
    // z 36 with no road reaching it.
    { x: -36, z: 20, w: 6, d: 24, axis: 'z', color: 0x37474f },
    { x: 30, z: 20, w: 6, d: 24, axis: 'z', color: 0x37474f },
  );

  // Sidewalks
  sidewalks.push(
    { x: -56, z: -2, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: -11, w: 114, d: 3, color: 0xb0bec5 },
    { x: -56, z: 42, w: 114, d: 2, color: 0xb0bec5 },
    { x: -56, z: 33, w: 114, d: 3, color: 0xb0bec5 },
  );

  // ------------------------------------------------------------
  // 0. 17TH-CENTURY STEP-GABLE MERCHANT CANAL HOUSES
  // ------------------------------------------------------------
  // TERRACED, on a 4 m stride. These are 4 m houses that were stepped every 5 m,
  // leaving a 1 m slot between each pair — 246 sub-extent gaps, the only scene
  // in the game to report any, and not what an Amsterdam canal row looks like:
  // the houses share party walls, which is exactly why they are so narrow and
  // so tall. What distinguishes one from the next is the gable, so the ridge
  // height alternates instead.
  for (let i = 0; i < 5; i++) {
    const hx = -24 + i * 4;
    const tall = i % 2 === 0;
    BOX(hx, 0, -36, 2, tall ? 7 : 6, 5, 'brick', 2, 0xb71c1c); // Red Dutch clinker
    const eaves = tall ? 14 : 12;
    BOX(hx, eaves, -36, 2, 1, 4, 'concrete', 2, 0xffffff);     // Ornamental trim step 1
    BOX(hx, eaves + 2, -35, 2, 1, 2, 'concrete', 2, 0xffffff); // Step 2 + hoisting beam
  }

  // Row 2 East (x: 6..26, z: -36..-26, y: 0..18)
  for (let i = 0; i < 5; i++) {
    const hx = 6 + i * 4;
    const tall = i % 2 === 1;
    BOX(hx, 0, -36, 2, tall ? 7 : 6, 5, 'brick', 2, 0x4e342e); // Dark umber brick
    const eaves = tall ? 14 : 12;
    BOX(hx, eaves, -36, 2, 1, 4, 'concrete', 2, 0xd7ccc8);
    BOX(hx, eaves + 2, -35, 2, 1, 2, 'concrete', 2, 0xd7ccc8);
  }

  // ------------------------------------------------------------
  // 1. HISTORIC DUTCH WINDMILL (DE GOOYER OCTAGONAL TOWER)
  // ------------------------------------------------------------
  // Located at x 38..48, z 24..34, y 0..32 (10x10x32m)
  // Thatched Octagonal Wooden Base (y: 0..12)
  BOX(38, 0, 24, 5, 6, 5, 'wood', 2, 0x5d4037);       // Octagonal Mill Base (y: 0..12)
  // Stelling gallery, projecting 2 m forward (y: 12..14). The projection is what
  // the sail frame stands on — one hop off the tower, and a real stelling does
  // project, which is how the miller reaches the sails.
  BOX(38, 12, 22, 5, 1, 6, 'wood', 2, 0x8d6e63);
  // Upper Windmill Cap & Shaft (y: 14..22)
  BOX(39, 14, 25, 4, 4, 4, 'wood', 2, 0x3e2723);      // Mill Cap (y: 14..22)

  // Sail frame (y: 14..32): two stocks carrying lattice bars, the whole thing
  // standing on the projecting gallery. A cantilevered cross was tried and
  // cannot be built — the arms reach four hops from the hub against a span cap
  // of three — so the sails are framed the way a real lattice sail is framed,
  // with the load coming down the stocks.
  BOX(38, 14, 22, 1, 9, 1, 'wood', 2, 0xffffff);      // West stock
  BOX(44, 14, 22, 1, 9, 1, 'wood', 2, 0xffffff);      // East stock
  for (const by of [16, 20, 24, 28]) {
    BOX(40, by, 22, 2, 1, 1, 'wood', 2, 0xffffff);    // Lattice bar
  }
  BOX(40, 22, 22, 2, 1, 1, 'steel', 2, 0xffd700);     // Golden windmill axle hub

  // ------------------------------------------------------------
  // 2. ROYAL PALACE ON DAM SQUARE
  // ------------------------------------------------------------
  // Located at x -16..16, z -24..-12, y 0..22
  BOX(-16, 0, -24, 16, 9, 6, 'concrete', 2, 0xd7ccc8); // Sandstone Classical Facade (y: 0..18)
  BOX(-4, 18, -22, 4, 2, 4, 'panel', 2, 0x00838f);     // Central Cupola Dome (y: 18..22)

  // ------------------------------------------------------------
  // 3. MOMENTUM FRIEND: WINDMILL GEAR BOT 🚲
  // ------------------------------------------------------------
  // Located on Canal Quay Pedestal (x: 14..16, z: -12..-10, y: 0..8)
  BOX(14, 0, -12, 1, 2, 1, 'concrete', 2, 0x37474f); // Basalt Pedestal (y: 0..4)
  BOX(14, 4, -12, 1, 1, 1, 'steel', 2, 0xe65100);    // Dutch Orange Bike Body (y: 4..6)
  BOX(13, 5, -12, 1, 1, 1, 'steel', 1, 0xffd700);    // Left Spoke Gear
  BOX(16, 5, -12, 1, 1, 1, 'steel', 1, 0xffd700);    // Right Spoke Gear
  BOX(14, 6, -12, 1, 1, 1, 'panel', 1, 0xffffff);    // White Headlight & Tulip Basket

  // ------------------------------------------------------------
  // 4. CANAL HOUSEBOATS & TOUR BARGES
  // ------------------------------------------------------------
  // Houseboat on North Canal (x: -22..-10, z: -46..-42, y: 0..4)
  BOX(-22, 0, -46, 6, 1, 2, 'wood', 2, 0x5d4037);     // Wooden barge hull
  BOX(-20, 2, -45, 4, 1, 1, 'panel', 2, 0xffffff);    // White living cabin

  // Glass-Top Canal Tour Barge on South Canal (x: 8..22, z: 14..18, y: 0..4)
  BOX(8, 0, 14, 7, 1, 2, 'steel', 2, 0x0288d1);       // Blue hull
  BOX(10, 2, 14, 5, 1, 2, 'panel', 2, 0x81d4fa);      // Panoramic glass canopy

  // ------------------------------------------------------------
  // 5. CANAL BRIDGES & DECK SPANS
  // ------------------------------------------------------------
  // 4 Arched Brick Bridges spanning north and south canals (y: 0..6)
  BOX(-36, 0, -48, 3, 2, 4, 'brick', 2, 0xa1887f); // Bridge pier
  BOX(-36, 4, -48, 3, 1, 4, 'brick', 2, 0xb71c1c); // Bridge deck
  BOX(30, 0, -48, 3, 2, 4, 'brick', 2, 0xa1887f);
  BOX(30, 4, -48, 3, 1, 4, 'brick', 2, 0xb71c1c);
  BOX(-36, 0, 12, 3, 2, 4, 'brick', 2, 0xa1887f);
  BOX(-36, 4, 12, 3, 1, 4, 'brick', 2, 0xb71c1c);
  BOX(30, 0, 12, 3, 2, 4, 'brick', 2, 0xa1887f);
  BOX(30, 4, 12, 3, 1, 4, 'brick', 2, 0xb71c1c);

  // ------------------------------------------------------------
  // 6. STREET FURNITURE & BIKE RACKS
  // ------------------------------------------------------------
  for (let bx = -46; bx <= 46; bx += 8) {
    if (Math.abs(bx - 33) > 4 && Math.abs(bx + 33) > 4) {
      bollard(sim, bx, -10);
      bollard(sim, bx, 42);
    }
  }
  for (let lx = -48; lx <= 48; lx += 16) {
    if (Math.abs(lx) >= 8 && Math.abs(lx - 33) > 4 && Math.abs(lx + 33) > 4) {
      lampPost(sim, lx, 0);
      planter(sim, lx + 4, 0, 2, 1);
      bench(sim, lx + 8, 0);
    }
  }

  // ------------------------------------------------------------
  // 7. DUTCH CLINKER BRICK & PAVING INFILL (BUDGET CLOSE-OUT)
  // ------------------------------------------------------------
  const amsterdamColors = [0xb71c1c, 0x8d6e63, 0xd7ccc8, 0x795548];
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
    B(rx, 0, rz, 'concrete', 0.5, amsterdamColors[cIdx]);
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
    // Pass 2: Canal seabed coping
    for (let rz = R.minZ; rz <= maxZ0 && placed < needed; rz += 0.5) {
      for (let rx = R.minX; rx <= maxX0 && placed < needed; rx += 0.5) {
        if (tryPlaceFiller(rx, rz, true)) placed++;
      }
    }
  }

  // Zebra crossings, drawn from AMSTERDAM_CROSSINGS against AMSTERDAM_STREETS.
  // Both tables shipped with every one of these scenes and nothing had ever
  // read either of them — the roads were hand-copied into the decor list
  // beside them and no crossing was drawn at all.
  const cross = (st, at) => (st.axis === 'x'
    ? zebra({ x: at, z: st.z + 0.4, w: XW_LEN, d: st.d - 0.8, axis: 'x' })
    : zebra({ x: st.x + 0.4, z: at, w: st.w - 0.8, d: XW_LEN, axis: 'z' }));
  for (const [si, at] of AMSTERDAM_CROSSINGS) crosswalks.push(...cross(AMSTERDAM_STREETS[si], at));

  // Camera blockers
  sim.cameraBlockers = generateBlockers(sim, 6);

  // Decor surfaces
  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };
}
