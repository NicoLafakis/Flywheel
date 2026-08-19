// Sydney — Sandbox Scene.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.

import {
  bench, bigTruck, bollard, boxVan, brownstone, bus, cafeTable, crateStack,
  generateBlockers, hydrant, lampPost, marketStall, motorcycle, newsBox,
  newsstand, sedan, signText, subwayEntrance, tower, trafficLight, trashBin,
  tree, zebra,
} from './voxelkit.js';
// Trimmed 2026-08-19. `mailbox` and `hotDogCart` went with their last callers
// (see the Alfred St note below). The other nine — bikeRack, fireEscape,
// laneDashes, planter, sandwichBoard, shippingContainer, signPost, stoop and
// trashBags — never had a call site at all; `stoop` reads as used but only
// ever appears as brownstone's `{ stoop: true }` OPTION KEY, which is not a
// use of the imported symbol. Chicago and the other scenes carry no dead
// imports, so this was a wart in this file rather than a house pattern of
// importing the whole kit as a palette.

export { vehicleBBox } from './voxelkit.js';

export const SYDNEY_VEHICLES = [
  // Alfred St / Circular Quay
  { kind: 'bus', x: -10, z: 12.5, axis: 'x', color: 0x007a3d },       // Sydney Green & Yellow Bus
  { kind: 'sedan', x: 2, z: 12.5, axis: 'x', color: 0xf7c948 },        // Taxi
  { kind: 'boxVan', x: 16, z: 12.5, axis: 'x', len: 5, color: 0xe8ecf2, color2: 0x007a3d },
  { kind: 'sedan', x: -20, z: 12.5, axis: 'x', color: 0x2a3440 },
  // The Rocks / George St (x -32.5)
  { kind: 'sedan', x: -32.5, z: -16, axis: 'z', color: 0xc23b2e },
  { kind: 'boxVan', x: -32.5, z: 0, axis: 'z', len: 5, color: 0xf2f2f2, color2: 0x2a5f9a },
  // Macquarie St (x 28.5)
  { kind: 'sedan', x: 28.5, z: 4, axis: 'z', color: 0xf7c948 },
  { kind: 'motorcycle', x: 28.5, z: 20, axis: 'z' },
];

export const SYDNEY_ROAD_SPANS = [];
export const SYDNEY_OPEN_GROUND = [];

export const SYDNEY_STREETS = [
  { x: -32, z: 10, w: 68, d: 5, axis: 'x' },     // Alfred St / Circular Quay Promenade
  { x: -34, z: -22, w: 4, d: 32, axis: 'z' },    // George St (The Rocks)
  { x: 28, z: 2, w: 4, d: 26, axis: 'z' },       // Macquarie St
];

export const SYDNEY_CROSSINGS = [
  [0, -20], [0, 0], [0, 20],
  [1, -12], [1, 2],
  [2, 8], [2, 20],
];

export function buildSydney(sim) {
  sim.bounds = 80;
  sim.boundsRect = { minX: -55, maxX: 45, minZ: -45, maxZ: 35 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);
  const B25 = (x0, y0, z0, nx, ny, nz, m, c) => BOX(x0, y0, z0, nx, ny, nz, m, 0.25, c);

  // Decor accumulators
  const parks = [], plaza = [], cobbles = [], sidewalks = [];
  const roads = [], water = [], boardwalk = [];

  // ============================================================ DISTRICT SURFACES
  // Water: Sydney Harbour Cove
  water.push({ x: -45, z: -42, w: 80, d: 48, color: 0x1d4d6b });

  // Plazas & Promenades (Must cover all building footprints so no bare ground)
  plaza.push(
    { x: 12, z: -32, w: 26, d: 38, color: 0xd8d4cc },   // Bennelong Point (Opera House apron)
    { x: -36, z: -2, w: 72, d: 32, color: 0x8a847a },   // Circular Quay & CBD apron
    { x: -38, z: -38, w: 18, d: 36, color: 0x6e6860 },  // The Rocks & Bridge Approach
  );

  cobbles.push(
    { x: -36, z: -24, w: 14, d: 22, color: 0x5a5560 },  // The Rocks historic alleys
  );

  parks.push(
    { x: 22, z: 6, w: 18, d: 24, color: 0x2e5e33 },     // Royal Botanic Garden fringe
  );

  // Boardwalks along the quay
  boardwalk.push(
    { x: -18, z: 2, w: 34, d: 8, color: 0x8c6239 },
    { x: 12, z: -28, w: 4, d: 30, color: 0x8c6239 },
  );

  // ============================================================ 1. SYDNEY OPERA HOUSE
  // Monumental Granite Podium on Bennelong Point (x 14..34, z -30..-4)
  BOX(14, 0, -30, 20, 2, 26, 'concrete', 1, 0x7a6e62);
  // Monumental South Stairs (1m tiered steps leading up from Circular Quay promenade)
  BOX(14, 0, -4, 20, 1, 2, 'concrete', 1, 0x6e6256);
  BOX(14, 0, -2, 20, 1, 2, 'concrete', 1, 0x6e6256);

  // Authentic Utzon Peaked Ceramic Sail / Vault Builder
  // Solid spherical-section shells (zero-falling physics: every voxel is supported down to
  // the podium at y=2, so no cantilevered skin). Per the LEGO reference the HIGHEST point of
  // each shell is its forward-leaning MOUTH lip; the ridge then descends toward a low tail.
  // Shells nest: each smaller shell's mouth sits inside the previous shell's tail zone.
  // Taller shells are built FIRST so the dedupe Set keeps their tile where they overlap.
  const shellCells = new Set();
  const place = (x, y, z, mat, color) => {
    const k = `${x},${y},${z}`;
    if (shellCells.has(k)) return;
    shellCells.add(k);
    B(x, y, z, mat, 1, color);
  };
  const buildShell = (cx, minZ, maxZ, apexY, halfW, mouth) => {
    const depth = Math.max(1, maxZ - minZ);
    const mouthZ = mouth === 'north' ? minZ : maxZ;
    const tailZ = mouth === 'north' ? maxZ : minZ;
    // Arc height at lateral offset dx for a given ridge height (spherical section)
    const arcTop = (ridgeY, dx) => 2 + Math.round((ridgeY - 2) * Math.sqrt(Math.max(0, 1 - (dx / halfW) ** 2)));

    for (let z = minZ; z <= maxZ; z++) {
      // i = slices behind the mouth; t = 0 at mouth, 1 at tail
      const i = Math.abs(z - mouthZ);
      const t = i / depth;
      let ridgeY;
      if (i === 0) ridgeY = apexY - 1;            // curved lip: front slice 1 below the crest
      else if (i === 1) ridgeY = apexY;           // true apex just behind the lip
      else ridgeY = 2 + Math.round((apexY - 2) * Math.pow(1 - t, 1.6)); // eased descent to ~y3
      ridgeY = Math.max(3, ridgeY);
      const ribSlice = i % 3 === 0;
      const tile = ribSlice ? 0xf0ece0 : 0xfcfaf2;
      const glassSlice = i <= 1;                  // mouth lip + one foyer slice behind it

      for (let dx = -halfW; dx <= halfW; dx++) {
        const x = cx + dx;
        const topY = arcTop(ridgeY, dx);
        // Solid column from podium top to arc top: top 2 voxels ceramic tile
        for (let y = 2; y <= topY; y++) {
          if (y >= topY - 1) place(x, y, z, 'concrete', tile);
          else if (glassSlice) {
            const isMullion = dx === 0 || y % 2 === 0;
            place(x, y, z, isMullion ? 'steel' : 'glass', isMullion ? 0x3a3028 : 0xdfa048);
          } else if (z === tailZ) place(x, y, z, 'concrete', 0xf0ece0);
          else place(x, y, z, 'concrete', 0xded8cc);
        }
      }
    }
  };

  // --- Concert Hall (Eastern row, cx=29, halfW 4, x 25..33): A-shells mouth north, B-shell mouth south
  buildShell(29, -29, -19, 24, 4, 'north'); // A1: main harbour shell
  buildShell(29, -21, -14, 17, 4, 'north'); // A2: mouth nested in A1 tail
  buildShell(29, -16, -11, 12, 4, 'north'); // A3: mouth nested in A2 tail
  buildShell(29, -9, -5, 10, 4, 'south');   // B1: forecourt shell, tail meets A3 tail

  // --- Joan Sutherland Theatre (Western row, cx=18, halfW 3, x 15..21)
  buildShell(18, -29, -20, 20, 3, 'north');
  buildShell(18, -22, -15, 14, 3, 'north');
  buildShell(18, -17, -12, 10, 3, 'north');
  buildShell(18, -9, -5, 8, 3, 'south');

  // --- Bennelong Restaurant shell (Southern forecourt, cx=24, x 22..26)
  buildShell(24, -7, -5, 7, 2, 'south');

  // Western Boardwalk Dining & Promenade (x 9.5..12, clear of podium x 14..34)
  // Spaced every 6 m, not 4: at 4 m this was a table-and-bench every car length
  // for 22 m straight, which read as a repeating stamp rather than a promenade.
  for (let z = -28; z <= -6; z += 6) {
    cafeTable(sim, 11.5, z);
    bench(sim, 10.5, z + 2);
    bollard(sim, 9.5, z);
  }

  // ============================================================ 2. SYDNEY HARBOUR BRIDGE
  // --- South Pylons (The Rocks approach: z -13..-6)
  // Southeast Pylon (x -20..-16)
  tower(sim, -20, -12, 4, 6, 0, 16, 'masonry', 'concrete', 0xb8aa96);
  BOX(-20, 16, -12, 4, 1, 6, 'concrete', 1, 0x8a7f70); // cornice cap
  // Southwest Pylon (x -30..-26)
  tower(sim, -30, -12, 4, 6, 0, 16, 'masonry', 'concrete', 0xb8aa96);
  BOX(-30, 16, -12, 4, 1, 6, 'concrete', 1, 0x8a7f70); // cornice cap
  // South Abutment Base Pier
  BOX(-26, 0, -13, 6, 8, 7, 'concrete', 1, 0x9a8f80);
  // South Approach Ramp (x -26..-20, z -6..0)
  BOX(-26, 0, -6, 6, 8, 6, 'concrete', 1, 0x9a8f80);

  // --- North Pylons (North Sydney approach: z -42..-35)
  // Northeast Pylon (x -20..-16)
  tower(sim, -20, -42, 4, 6, 0, 16, 'masonry', 'concrete', 0xb8aa96);
  BOX(-20, 16, -42, 4, 1, 6, 'concrete', 1, 0x8a7f70); // cornice cap
  // Northwest Pylon (x -30..-26)
  tower(sim, -30, -42, 4, 6, 0, 16, 'masonry', 'concrete', 0xb8aa96);
  BOX(-30, 16, -42, 4, 1, 6, 'concrete', 1, 0x8a7f70); // cornice cap
  // North Abutment Base Pier
  BOX(-26, 0, -42, 6, 8, 7, 'concrete', 1, 0x9a8f80);

  // --- Harbour Pier Bents (Grounded support in the open bay: z -32..-16)
  for (const pz of [-32, -28, -24, -20, -16]) {
    BOX(-26, 0, pz, 6, 8, 1, 'concrete', 1, 0x5a6068);
  }

  // --- Bridge Deck (Spanning x -26..-20, z -36..-12 at y=8)
  BOX(-26, 8, -36, 6, 1, 24, 'concrete', 1, 0x4a5058);

  // Guard Rails (z -34..-14)
  for (let z = -34; z <= -14; z += 2) {
    B(-26, 9, z, 'steel', 1, 0x3a424e);
    B(-21, 9, z, 'steel', 1, 0x3a424e);
  }

  // Ground Transition Ramp
  BOX(-26, 0, 0, 6, 4, 4, 'concrete', 1, 0x9a8f80);
  BOX(-26, 0, 4, 6, 1, 4, 'concrete', 1, 0x9a8f80);

  // --- Through-Arch Steel Truss Ribs (The Coathanger: z -36..-12, apex at z=-24)
  for (let i = 0; i <= 12; i++) {
    const az = -36 + i * 2;
    const ay = 9 + Math.floor(Math.sin((i / 12) * Math.PI) * 15);
    
    // East Arch Truss
    B(-21, ay, az, 'steel', 1, 0x2e3540);
    B(-21, ay + 1, az, 'steel', 1, 0x3a424e);
    // West Arch Truss
    B(-26, ay, az, 'steel', 1, 0x2e3540);
    B(-26, ay + 1, az, 'steel', 1, 0x3a424e);

    // Cross Bracing between upper trusses (Inner span x -25..-22)
    if (i % 2 === 0 && ay > 14) {
      BOX(-25, ay + 1, az, 4, 1, 1, 'steel', 1, 0x3a424e);
    }

    // Vertical Hangers connecting arch to deck (y=10..ay-1)
    if (ay > 10 && i > 0 && i < 12) {
      for (let hy = 10; hy < ay; hy++) {
        B(-21, hy, az, 'steel', 1, 0x4a5568);
        B(-26, hy, az, 'steel', 1, 0x4a5568);
      }
    }
  }

  // ============================================================ 3. CIRCULAR QUAY & FERRIES
  // Ferry Wharves (Wharf 3 & 4 extending north into the cove)
  for (const wx of [-8, 2]) {
    BOX(wx, 0, -4, 6, 1, 8, 'wood', 1, 0x8a6540); // wharf deck
    // Terminal Hall Canopy
    tower(sim, wx + 1, -2, 4, 4, 1, 4, 'masonry', 'panel', 0x007a3d); // Sydney Green
    BOX(wx + 1, 4, -2, 4, 1, 4, 'panel', 1, 0xf7c948); // Sydney Gold roof
    signText(sim, 'FERRY', wx + 1.25, 2.5, -2.5, { px: 0.25, scale: 1, color: 0xffffff, rail: 0x007a3d, dir: 1 });
  }

  // Moored Green & Gold Sydney Ferry (First Fleet class) at Wharf 3 (x=-6, z=-14)
  {
    const fx = -7, fz = -14;
    // Hull
    BOX(fx, 0, fz, 5, 1, 8, 'panel', 1, 0x007a3d);
    // Cabin with glass windows
    for (let y = 1; y < 3; y++) {
      for (let x = 0; x < 5; x++) {
        for (let z = 0; z < 6; z++) {
          const edge = x === 0 || x === 4 || z === 0 || z === 5;
          if (!edge) continue;
          const corner = (x === 0 || x === 4) && (z === 0 || z === 5);
          if (corner) { B(fx + x, y, fz + 1 + z, 'steel', 1); continue; }
          const mat = y === 1 ? 'glass' : 'panel';
          B(fx + x, y, fz + 1 + z, mat, 1, mat === 'glass' ? undefined : 0xf7c948);
        }
      }
    }
    BOX(fx, 3, fz + 1, 5, 1, 6, 'panel', 1, 0xf7c948); // cabin roof
    BOX(fx + 2, 4, fz + 3, 1, 2, 2, 'steel', 1, 0x222222); // funnel / smokestack
  }

  // ============================================================ 4. THE ROCKS (Heritage District)
  // Victorian Sandstone & Brick Terrace Houses with Stoops & Balconies (x -42..-36)
  brownstone(sim, -42, -20, 6, 8, 3, 0x9e5b40, { stoop: true });
  brownstone(sim, -42, -10, 6, 8, 3, 0xb06d48, { stoop: true });
  brownstone(sim, -42, 0, 6, 8, 3, 0x8a4b38, { stoop: true });

  // Historic Pub: The Fortune of War (x -42, z 16)
  tower(sim, -42, 16, 7, 8, 0, 8, 'masonry', 'brick', 0x7a3a2a);
  BOX(-42, 8, 16, 7, 1, 8, 'concrete', 1, 0x5a2a1a);
  signText(sim, 'PUB', -41, 4, 15.5, { px: 0.25, scale: 1, color: 0xf7c948, rail: 0x3a1a0a, dir: 1 });
  for (const sx of [-41, -38]) cafeTable(sim, sx, 13);

  // Market Stalls along George St in The Rocks (x -35)
  marketStall(sim, -35, -8, 0xc23b2e, 3, 2);
  marketStall(sim, -35, -2, 0x2e5d3a, 3, 2);
  crateStack(sim, -35, 4, 2);

  // ============================================================ 5. SYDNEY CBD & SYDNEY TOWER EYE
  // Sydney Tower Eye (Centrepoint) - Spire Landmark (x=8, z=22)
  // Base Podium
  BOX(5, 0, 19, 8, 4, 8, 'concrete', 1, 0x8a847a);
  // Central Steel Shaft Column
  for (let y = 4; y < 34; y++) {
    for (let x = 7; x <= 9; x++) {
      for (let z = 21; z <= 23; z++) {
        const edge = x === 7 || x === 9 || z === 21 || z === 23;
        B(x, y, z, edge ? 'steel' : 'concrete', 1, 0x4a5058);
      }
    }
  }
  // Golden Observation Turret (The Golden Bucket: y 34..40)
  // Chamfered Octagonal Steel Floor & Roof Plates (all cells within <= 3 hops of shaft)
  for (let x = 5; x <= 11; x++) {
    for (let z = 19; z <= 25; z++) {
      const ax = Math.abs(x - 8), az = Math.abs(z - 22);
      if (ax + az > 4) continue; // Chamfer corners
      B(x, 34, z, 'steel', 1, 0xc89b3c);
      B(x, 39, z, 'steel', 1, 0xc89b3c);
    }
  }
  // Outer Facade Ring (y 35..38)
  for (let y = 35; y < 39; y++) {
    for (let x = 5; x <= 11; x++) {
      for (let z = 19; z <= 25; z++) {
        const ax = Math.abs(x - 8), az = Math.abs(z - 22);
        if (ax + az > 4) continue;
        const outer = ax === 3 || az === 3 || ax + az === 4;
        if (!outer) continue;
        const isWin = (y === 36 || y === 37);
        const isMullion = (x + z) % 2 === 0;
        const mat = isWin ? (isMullion ? 'steel' : 'glass') : 'panel';
        B(x, y, z, mat, 1, mat === 'glass' ? 0xffea78 : 0xd4a017); // Gold Anodized Aluminum
      }
    }
  }
  BOX(6, 40, 20, 5, 1, 5, 'steel', 1, 0x3a4048); // Turret Upper Bulkhead

  // Tower Spire & Antenna (reaching up to y=52)
  for (let y = 41; y < 52; y++) {
    B(8, y, 22, 'steel', 1, 0xe8ecf2);
  }
  B(8, 52, 22, 'glass', 1, 0xff0000); // Red Aviation Beacon

  // Modern Glass CBD High-Rises
  tower(sim, -12, 18, 10, 10, 0, 24, 'curtain');                  // Commercial Tower West
  tower(sim, 18, 18, 9, 9, 0, 20, 'curtain');                    // Commercial Tower East
  tower(sim, -2, 22, 6, 8, 0, 16, 'masonry', 'concrete', 0x8a929a); // Mid-rise Office

  // ============================================================ 6. STREETS, CROSSINGS & FURNITURE
  // Assemble roads and sidewalks from SYDNEY_STREETS
  for (const s of SYDNEY_STREETS) {
    roads.push({ x: s.x, z: s.z, w: s.w, d: s.d, color: 0x383c44 });
    if (s.axis === 'x') {
      sidewalks.push(
        { x: s.x, z: s.z - 1.5, w: s.w, d: 1.5, color: 0x847e74 },
        { x: s.x, z: s.z + s.d, w: s.w, d: 1.5, color: 0x847e74 },
      );
    } else {
      sidewalks.push(
        { x: s.x - 1.5, z: s.z, w: 1.5, d: s.d, color: 0x847e74 },
        { x: s.x + s.w, z: s.z, w: 1.5, d: s.d, color: 0x847e74 },
      );
    }
  }

  // Crossings
  const cross = (s, at) => (s.axis === 'x'
    ? zebra({ x: at, z: s.z + 0.4, w: 2.8, d: s.d - 0.8, axis: 'x' })
    : zebra({ x: s.x + 0.4, z: at, w: s.w - 0.8, d: 2.8, axis: 'z' }));
  const crosswalks = [];
  for (const [si, at] of SYDNEY_CROSSINGS) crosswalks.push(...cross(SYDNEY_STREETS[si], at));

  // Vehicles
  for (const v of SYDNEY_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.color, v.roof ?? v.color, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.color, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.color, v.color2, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.color, false);
    else motorcycle(sim, v.x, v.z);
  }

  // Street trees along Alfred St and Macquarie St (Botanical Gardens sidewalk x 34)
  for (const tx of [-22, -14, -4, 6, 16]) tree(sim, tx, 8);
  for (const tz of [6, 14, 22]) tree(sim, 34, tz);

  // Street lighting, trash bins, benches, news boxes.
  // Lamps stay on the full 10 m rhythm; bins do NOT — a bin at every single
  // lamp post is denser than any real quay-side street and just noise at the
  // player's eye height, so only the two ends of Alfred St carry one.
  for (const lx of [-20, -10, 0, 10, 20]) lampPost(sim, lx, 9);
  for (const bx of [-18, 12]) trashBin(sim, bx, 9);
  bench(sim, -16, 9);
  bench(sim, 4, 9);
  bench(sim, 15, 9);

  // No US-pattern mailbox or hot dog cart here: both were generic North
  // American street furniture standing on Circular Quay, and they were the two
  // lowest-read props on the strip. The news box, newsstand, subway entrance
  // and hydrant carry the same "inhabited street" job without the wrong accent.
  newsBox(sim, -5, 9);
  newsstand(sim, 13, 9);
  subwayEntrance(sim, 1, 9);
  hydrant(sim, 8, 9);
  trafficLight(sim, -25.5, 9.5);
  trafficLight(sim, 26.5, 9.5);

  // ============================================================ 7. SCENE DECOR & AMBIENT
  sim.sceneDecor = {
    parks, plaza, cobbles, sidewalks, roads, crosswalks, water, boardwalk,
  };

  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_shop_window',
    concrete: 'mat_suburban_siding',
    steel: 'mat_warehouse_roll',
    panel: 'mat_awning_stripe',
    wood: 'mat_clay_shingles',
  };

  sim.sceneAmbient = {
    gulls: [
      { x: 24, z: -18, r: 16, y: 24, count: 12, speed: 0.35 }, // Circling Bennelong Point & Opera House
      { x: -24, z: -24, r: 14, y: 26, count: 8, speed: 0.4 },   // Circling Sydney Harbour Bridge
      { x: -4, z: -8, r: 10, y: 16, count: 6, speed: 0.3 },     // Circular Quay Cove
    ],
    ferries: [
      { x0: -6, z0: -6, x1: 20, z1: -36, period: 50, color: 0x007a3d },
    ],
  };

  // Generate camera blockers dynamically from high geometry.
  // generateBlockers RETURNS the rect list — it does NOT assign it. Sydney
  // shipped as a bare `generateBlockers(sim, 6);` whose return value was
  // discarded, so the scene ran with ZERO blockers and the chase cam clipped
  // straight through the Opera House, the Bridge and the Tower. Always assign,
  // exactly as every other scene does. The minH argument is left off on
  // purpose: 6 is the builder's own default and matching the other scenes
  // literally keeps the whole roster on one knob.
  sim.cameraBlockers = generateBlockers(sim);
}
