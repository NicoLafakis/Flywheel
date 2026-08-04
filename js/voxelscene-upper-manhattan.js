// Upper Manhattan — Central Park sandbox scene.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
//
// Layout uses the same convention as Lower Manhattan: x = east, z = south,
// north = -z. This is a separate park-first level, not a continuation of the
// Lower Manhattan bounds. Central Park stays readable as open green space;
// the recognizable buildings sit on the avenue edges around it.

import {
  bench, boxVan, bus, hotDogCart, hydrant, lampPost, newsstand, sedan,
  subwayEntrance, tower, trafficLight, trashBin, tree,
} from './voxelkit.js';

export function buildUpperManhattan(sim) {
  sim.bounds = 64;
  sim.boundsRect = { minX: -54, maxX: 54, minZ: -60, maxZ: 68 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);
  const B25 = (x0, y0, z0, nx, ny, nz, m, c) => BOX(x0, y0, z0, nx, ny, nz, m, 0.25, c);

  // --- perimeter landmarks ---------------------------------------------------
  // The Dakota / Upper West Side block.
  tower(sim, -36, 19, 9, 9, 0, 9, 'masonry', 'brick', 0x8e594c);
  BOX(-36, 9, 19, 9, 1, 9, 'concrete', 1, 0x9c8777);
  sim.cameraBlockers.push({ minX: -36, maxX: -27, minZ: 19, maxZ: 28, h: 10 });

  // West-side apartment canyon.
  tower(sim, -49, -1, 10, 10, 0, 12, 'curtain');
  tower(sim, -48, -25, 9, 9, 0, 10, 'masonry', 'concrete', 0x777f8a);
  sim.cameraBlockers.push({ minX: -49, maxX: -39, minZ: -1, maxZ: 9, h: 12 });
  sim.cameraBlockers.push({ minX: -48, maxX: -39, minZ: -25, maxZ: -16, h: 10 });

  // The Metropolitan Museum of Art: broad, low masonry body and front steps
  // on Fifth Avenue, roughly opposite the 82nd Street cross street.
  tower(sim, 26, 14, 12, 10, 0, 7, 'masonry', 'concrete', 0xcfc6b1);
  BOX(26, 7, 14, 12, 1, 10, 'concrete', 1, 0xcfc6b1);
  BOX(26, 0, 24, 12, 1, 2, 'concrete', 1, 0xb7aa91);
  for (const x of [27, 30, 33, 36]) BOX(x, 1, 24, 1, 4, 1, 'steel', 1);
  BOX(26, 5, 24, 12, 1, 1, 'concrete', 1, 0xcfc6b1);
  sim.cameraBlockers.push({ minX: 26, maxX: 38, minZ: 14, maxZ: 26, h: 8 });

  // Museum Mile townhouses and cultural buildings.
  tower(sim, 40, -25, 8, 8, 0, 8, 'masonry', 'brick', 0x9b5545);
  tower(sim, 40, -13, 8, 8, 0, 7, 'masonry', 'concrete', 0x8a8f98);
  tower(sim, 40, 0, 8, 8, 0, 9, 'curtain');
  sim.cameraBlockers.push({ minX: 40, maxX: 48, minZ: -25, maxZ: -17, h: 8 });
  sim.cameraBlockers.push({ minX: 40, maxX: 48, minZ: -13, maxZ: -5, h: 7 });
  sim.cameraBlockers.push({ minX: 40, maxX: 48, minZ: 0, maxZ: 8, h: 9 });

  // South-east hotel wall: the park's grand-plaza edge.
  tower(sim, 29, 44, 11, 9, 0, 13, 'curtain');
  BOX(30, 13, 45, 9, 1, 7, 'concrete', 1, 0xb8b0a2);
  sim.cameraBlockers.push({ minX: 29, maxX: 40, minZ: 44, maxZ: 53, h: 14 });

  // Upper Harlem / Morningside row at the north edge.
  tower(sim, -43, -54, 8, 8, 0, 8, 'masonry', 'brick', 0x9b4e3f);
  tower(sim, -35, -55, 8, 8, 0, 7, 'masonry', 'brick', 0xb06950);
  tower(sim, 10, -55, 9, 8, 0, 10, 'masonry', 'concrete', 0x777c86);
  tower(sim, 26, -54, 9, 8, 0, 8, 'curtain');
  sim.cameraBlockers.push({ minX: -43, maxX: -35, minZ: -54, maxZ: -46, h: 8 });
  sim.cameraBlockers.push({ minX: -35, maxX: -27, minZ: -55, maxZ: -47, h: 7 });
  sim.cameraBlockers.push({ minX: 10, maxX: 19, minZ: -55, maxZ: -47, h: 10 });
  sim.cameraBlockers.push({ minX: 26, maxX: 35, minZ: -54, maxZ: -46, h: 8 });

  // Belvedere Castle: the real landmark sits near the park's center, above
  // the Reservoir and west of Fifth Avenue, not on the 110th Street edge.
  // Keep the full footprint north of the 86th Street road template.
  tower(sim, -12, 14, 8, 8, 0, 4, 'masonry', 'brick', 0x85644f);
  BOX(-9, 4, 17, 2, 3, 2, 'brick', 1, 0x85644f);
  for (const [x, z] of [[-14, 13], [-3, 13], [-14, 22], [-3, 22]]) {
    BOX(x, 0, z, 2, 7, 2, 'brick', 1, 0x765540);
    BOX(x - 0.25, 7, z - 0.25, 2.5, 1, 2.5, 'concrete', 0.5, 0x9b8069);
  }
  // The half-meter turret caps overhang the 1 m cores by 0.25 m; the blocker
  // intentionally covers the true outer footprint, not just the main tower.
  sim.cameraBlockers.push({ minX: -15, maxX: -1, minZ: 12, maxZ: 25, h: 8 });

  // --- Central Park voxel dressing ------------------------------------------
  // Keep the spawn promenade open. Trees are placed on the paths and edges,
  // while the water surfaces remain render-only so they never become physics
  // blockers or accidental support anchors.
  const parkTrees = [
    [-16, 34], [-10, 37], [-8, 26], [11, 26], [12, 34], [7, 35], [15, 34],
    [-16, 14], [11, 20], [-17, 4], [6, 4], [-16, -17], [7, -17],
    [-16, -29], [6, -25], [7, -39], [16, -24], [-19, 18], [19, 18],
  ];
  for (const [x, z] of parkTrees) tree(sim, x, z);

  const parkBenches = [
    [-11, 27], [10, 27], [-16, 4], [5, 4],
    [-16, 15], [5, 15], [6, -31], [19, -31],
    [-13, -17], [10, -17],
  ];
  for (const [x, z] of parkBenches) bench(sim, x, z);

  for (const [x, z] of [
    [-18.5, 36], [18.5, 36], [-18.5, 24], [18.5, 24],
    [-18.5, 16], [18.5, 16], [-18.5, 4], [18.5, 4],
    [-18.5, -8], [18.5, -8], [-18.5, -24], [18.5, -24],
  ]) lampPost(sim, x, z);

  // Bethesda Terrace: stepped masonry at the park's southern end.
  BOX(-7, 0, 35, 14, 1, 3, 'concrete', 1, 0xd0c4aa);
  BOX(-5, 1, 35, 10, 1, 2, 'concrete', 1, 0xd0c4aa);
  BOX(-3, 2, 35, 6, 1, 1, 'concrete', 1, 0xd0c4aa);
  BOX(-1, 3, 35, 2, 1, 1, 'glass', 1, 0x3fa7d6);

  // Water edges follow the recognizable park geography: the Reservoir is
  // north-central, The Lake sits above Bethesda Terrace, and Harlem Meer is
  // in the northeast corner. Water remains render-only; these low rims are
  // the only physical shoreline geometry.
  BOX(-14, 0, -3, 18, 1, 1, 'concrete', 1, 0x7b858c);
  BOX(-14, 0, 9, 18, 1, 1, 'concrete', 1, 0x7b858c);
  BOX(-14, 0, -2, 1, 1, 11, 'concrete', 1, 0x7b858c);
  BOX(3, 0, -2, 1, 1, 11, 'concrete', 1, 0x7b858c);
  BOX(-9, 0, 24, 18, 1, 1, 'concrete', 1, 0x7b858c);
  BOX(-9, 0, 33, 18, 1, 1, 'concrete', 1, 0x7b858c);
  BOX(-9, 0, 25, 1, 1, 8, 'concrete', 1, 0x7b858c);
  BOX(8, 0, 25, 1, 1, 8, 'concrete', 1, 0x7b858c);
  BOX(8, 0, -35, 10, 1, 1, 'concrete', 1, 0x7b858c);
  BOX(8, 0, -27, 10, 1, 1, 'concrete', 1, 0x7b858c);
  BOX(8, 0, -34, 1, 1, 7, 'concrete', 1, 0x7b858c);
  BOX(17, 0, -34, 1, 1, 7, 'concrete', 1, 0x7b858c);

  // --- street life -----------------------------------------------------------
  // Vehicles sit inside the avenue/cross-street surfaces and rotate to follow
  // the street direction. 72nd Street gets the bus and the busiest curbside
  // dressing, while the park perimeter carries lighter local traffic.
  sedan(sim, -24.5, -25, 0xc23b2e, undefined, 'z');
  sedan(sim, 21.5, -20, 0xf0c33c, undefined, 'z');
  bus(sim, 21.5, -12, 0x2a5f9a, 'z');
  boxVan(sim, -15, 28, 5, 0xe8ecf2, 0x2a5f9a);
  sedan(sim, -4, 40, 0x30343b);
  sedan(sim, -17, 40, 0xc23b2e);
  boxVan(sim, 8, 40, 5, 0xf2f2f2, 0xd97c2c);

  // Curb furniture is deliberately placed on sidewalks, not in the road
  // centerline or inside the park's physical props.
  for (const [x, z] of [[-20.5, 33], [25.5, 33]]) subwayEntrance(sim, x, z);
  for (const [x, z] of [[-20.5, 39], [25.25, 39], [-20.5, 15], [25.25, 15], [-20.5, -7], [25.25, -7]]) {
    hydrant(sim, x, z);
    trashBin(sim, x + 1, z - 2);
  }
  for (const [x, z] of [[-20.5, 44.5], [25.5, 44.5], [-20.5, 31.5], [25.5, 31.5]]) trafficLight(sim, x, z);
  newsstand(sim, -20.5, 35);
  hotDogCart(sim, 8, 36);
  for (const [x, z] of [[-20.5, 36], [25.5, 36], [-20.5, 24], [25.5, 24], [-20.5, 8], [25.5, 8], [-20.5, -8], [25.5, -8], [-20.5, -20], [25.5, -20], [-20.5, -30], [25.5, -30]]) {
    lampPost(sim, x, z);
  }

  // --- render-only decor -----------------------------------------------------
  // The real park's avenues, transverse streets, loop paths, and high-visibility
  // crossings are kept as separate render layers. They never enter the physics
  // grid, so the extra realism cannot create support anchors or edible mass.
  const crossStreets = [40, 28, 10, -4, -16, -35]; // 59th, 72nd, 86th, 96th, 102nd, 110th
  const roads = [
    { x: -25, z: -60, w: 4, d: 110 }, // Central Park West
    { x: 21, z: -60, w: 4, d: 110 },  // Fifth Avenue
    ...crossStreets.map((z) => ({ x: -52, z, w: 76, d: z === 40 ? 4 : 3 })),
  ];
  const laneMarkers = [];
  for (const x of [-23.65, 23.65]) {
    for (let z = -57; z < 64; z += 7) laneMarkers.push({ x, z, w: 0.12, d: 3.2 });
  }
  for (const z of crossStreets) {
    for (let x = -49; x < 24; x += 7) laneMarkers.push({ x, z: z + 1.42, w: 3.2, d: 0.12 });
  }
  // Standardize every intersection to the same five-stripe zebra template:
  // no outside border, a uniform 0.55 m gap, and a flat white bar that stays
  // entirely within the road surface. The repeated template makes crossings
  // read as NYC crosswalks instead of scattered fence-like props.
  const crosswalks = [];
  const addZebra = (x, z, w, d, count = 5) => {
    for (let i = 0; i < count; i++) crosswalks.push({ x, z: z + i * 0.55, w, d });
  };
  for (const z of crossStreets) {
    addZebra(-24.7, z - 1.15, 0.28, 4.6);
    addZebra(21.3, z - 1.15, 0.28, 4.6);
    addZebra(-25.3, z - 1.15, 4.6, 0.28);
    addZebra(20.7, z - 1.15, 4.6, 0.28);
  }
  sim.sceneDecor = {
    roads,
    sidewalks: [
      { x: -21, z: -60, w: 1, d: 110 },
      { x: 25, z: -60, w: 1, d: 110 },
      ...crossStreets.flatMap((z) => [
        { x: -52, z: z - 1, w: 76, d: 1 },
        { x: -52, z: z + (z === 40 ? 4 : 3), w: 76, d: 1 },
      ]),
    ],
    bikePaths: [
      { x: -18.5, z: -41, w: 1.5, d: 79 }, // Central Park loop, west leg
      { x: 17, z: -41, w: 1.5, d: 79 },    // Central Park loop, east leg
      { x: -17, z: -42, w: 34, d: 1.5 },   // loop south leg
      { x: -17, z: 37.5, w: 34, d: 1.5 },  // loop north leg
      { x: -20.5, z: 26.5, w: 1, d: 4 },   // 72nd Street park connection
    ],
    parks: [
      { x: -20, z: -43, w: 40, d: 84 }, // Central Park base green
    ],
    water: [
      { x: -13, z: -2, w: 16, d: 10 }, // Jacqueline Kennedy Reservoir
      { x: -8, z: 25, w: 16, d: 8 },    // The Lake
      { x: 9, z: -34, w: 8, d: 6 },     // Harlem Meer
    ],
    laneMarkers,
    crosswalks,
  };
}
