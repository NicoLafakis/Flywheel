import { generateBlockers } from './voxelkit.js';
import { slab, column, beam, panel, drum } from './voxelforms.js';

// THE LAB is the Tokyo recreation sandbox: the shipped Tokyo map's geography
// rebuilt fresh under the geometry authoring standard (.wiki/geometry-authoring.md)
// — mixed voxelforms members for structure, deliberate 0.5 m cubes for starter
// food, street props and tactile detail. No assembly merging, no legacy kit
// builders, no cube ladder.
//
// Phase 0 (2026-09-13): map skeleton (bounds, streets, crossings) plus the
// Nishi-Shinjuku ward — Tocho twins with assembly hall and skybridges, Cocoon
// Tower, three articulated supporting towers, a podium shop row, and the
// starter-food esplanade. Remaining districts land in later phases.
//
// Construction rules learned in this file's own history (all test-pinned):
// glass carries no vertical support — window rhythm is PAINTED masonry;
// setback storeys sit on the lower roof plate; every floor bay touches a
// bearing wall within the hop budget; keep every structure divisible into
// multiple bites.

// Split an extent into bays that quantize exactly to the 0.25 fine grid —
// a bay that rounds off-grid either slivers or overlaps its neighbour.
const bays = (w, max = 4) => {
  for (let n = Math.max(1, Math.ceil(w / max)); n <= w * 4; n++) {
    const s = w / n;
    if (Math.abs(s / 0.25 - Math.round(s / 0.25)) < 1e-9) {
      return Array.from({ length: n }, (_, i) => [i * s, s]);
    }
  }
  return [[0, w]];
};

const slabGrid = (sim, x0, y, z0, w, d, mat, color, t = 0.5) => {
  for (const [dx, bw] of bays(w)) for (const [dz, bd] of bays(d)) {
    slab(sim, { x: x0 + dx, y, z: z0 + dz, w: bw, d: bd, t, mat, color });
  }
};

// One storey of bearing perimeter walls: x-face sections run corner to
// corner, z-face sections inset between them, so corners always have masonry.
// `courses` is [{y0, h, color}] measured from the storey's floor y; `side`
// overrides the z-face colour (dark side walls read as ribs between facades).
// Never add separate corner columns here — they share cells with the corner
// sections and the overlap resolver shifts the whole wall off grid.
const wallStorey = (sim, x0, y, z0, w, d, mat, courses, side = null) => {
  for (const c of courses) {
    for (const [dx, bw] of bays(w)) {
      sim._block(x0 + dx, y + c.y0, z0, mat, [bw, c.h, 0.5], c.color);
      sim._block(x0 + dx, y + c.y0, z0 + d - 0.5, mat, [bw, c.h, 0.5], c.color);
    }
    const sc = side ?? c.color;
    for (const [dz, bd] of bays(d - 1)) {
      sim._block(x0, y + c.y0, z0 + 0.5 + dz, mat, [0.5, c.h, bd], sc);
      sim._block(x0 + w - 0.5, y + c.y0, z0 + 0.5 + dz, mat, [0.5, c.h, bd], sc);
    }
  }
};

// Standard facade rhythm: bearing course, window band, bearing course.
const facade = (wall, win) => [
  { y0: 0.5, h: 1, color: wall },
  { y0: 1.5, h: 1, color: win },
  { y0: 2.5, h: 0.5, color: wall },
];

export function buildLab(sim) {
  sim.bounds = 105;
  sim.boundsRect = { minX: -110, maxX: 110, minZ: -100, maxZ: 100 };
  const roads = [], sidewalks = [], parks = [], laneMarkers = [], crosswalks = [];

  // --- palette (daytime Shinjuku) --------------------------------------------
  const P = {
    granite: 0x8d99ae, graniteDark: 0x2b2d42, tochoWin: 0x8ab9c5,
    precast: 0xdcdcdc, white: 0xe8ecef, cyan: 0x8ecae6, teal: 0x5b7a7a,
    amber: 0xb0a090, asphalt: 0x1f2421, walk: 0x6c757d, lawn: 0x8cae77,
    taxiGreen: 0x2d6a4f, taxiGold: 0xf7c948, neonRed: 0xc03050,
    wood: 0x8d6548, leaf: 0x78a66a, crate: 0xc98a50, crateB: 0xe9bd75,
  };

  // --- street skeleton (city plan: TOKYO_STREETS) -----------------------------
  for (const s of [
    { x: -105, z: -70, w: 210, d: 8 },   // yasukuni-dori
    { x: -105, z: -35, w: 210, d: 8 },   // shinjuku-dori
    { x: -105, z: 0, w: 210, d: 9 },     // koshu-kaido
    { x: -105, z: 35, w: 210, d: 8 },    // omotesando
    { x: -105, z: 70, w: 210, d: 8 },    // shibuya dogenzaka
    { x: -74, z: -95, w: 8, d: 190 },    // nishi-shinjuku ave
    { x: -35, z: -95, w: 8, d: 190 },    // chuo-dori
    { x: 10, z: -95, w: 9, d: 190 },     // meiji-dori
    { x: 60, z: -95, w: 8, d: 190 },     // gaien-higashi
  ]) roads.push({ ...s, color: P.asphalt });
  // Centre dashes on the avenues near the ward; stop lines where the esplanade
  // meets the north-south avenues (progress-and-lab pins >= 4).
  for (let x = -100; x < 100; x += 8) laneMarkers.push({ x, z: 4, w: 3, d: 0.25, color: 0xf3cf79 });
  for (const sx of [-35, 10, -74, 60, 105]) {
    laneMarkers.push({ x: sx - 1, z: 9.5, w: 6, d: 0.5, color: 0xf8fafc, isStopLine: true });
    for (let i = 0; i < 5; i++) crosswalks.push({ x: sx + i * 1.2 - 2.4, z: 10, w: 0.6, d: 5, color: 0xf8fafc });
  }

  // --- Tocho twins -------------------------------------------------------------
  // The identity read: twin 30 m slabs on ONE shared podium (TMG's base is a
  // single plinth, and two identical podiums 1 m apart trip probePlacementStep
  // on their collinear slab rows), granite shafts, cyan window bands, dark
  // side ribs, a setback crown, two skybridges, and the low assembly hall
  // between them. Twin A at (-100,-60), twin B at (-88,-60), 9x7 shafts.
  {
    // Shared podium: two storeys under both towers at 23x11.
    for (let f = 0; f < 2; f++) {
      slabGrid(sim, -105.5, f * 3, -65.5, 23, 11, 'concrete', P.precast);
      wallStorey(sim, -105.5, f * 3, -65.5, 23, 11, 'concrete',
        f === 0 ? facade(P.granite, P.amber) : facade(P.granite, P.tochoWin));
    }
    slabGrid(sim, -105.5, 6, -65.5, 23, 11, 'concrete', P.graniteDark);
  }
  const tochoTower = (cx) => {
    const x0 = cx - 4.5, z0 = -63.5;
    // Shaft: six storeys at 9x7, dark side walls as ribs. The shared podium
    // roof IS the first shaft floor plate — a second slab in the same cells
    // overlaps.
    for (let f = 2; f < 8; f++) {
      const y = f * 3;
      if (f > 2) slabGrid(sim, x0, y, z0, 9, 7, 'concrete', P.precast);
      wallStorey(sim, x0, y, z0, 9, 7, 'concrete', facade(P.granite, P.tochoWin), P.graniteDark);
    }
    // Setback crown: two storeys at 7x5, cap plate, warning beacon. The shaft
    // roof plate stays FULL-WIDTH — an inset floor plate touches no bearing
    // wall (0.5 m of air on every side) and the whole crown falls at tick 0.
    // The setback is read from the inset WALLS standing on that roof.
    for (let f = 8; f < 10; f++) {
      const y = f * 3;
      slabGrid(sim, f === 8 ? x0 : x0 + 1, y, f === 8 ? z0 : z0 + 1, f === 8 ? 9 : 7, f === 8 ? 7 : 5, 'concrete', P.precast);
      wallStorey(sim, x0 + 1, y, z0 + 1, 7, 5, 'concrete', facade(P.granite, P.tochoWin), P.graniteDark);
    }
    slabGrid(sim, x0 + 1, 30, z0 + 1, 7, 5, 'concrete', P.graniteDark);
    column(sim, { x: cx - 0.25, y: 30.5, z: z0 + 3.25, h: 2, s: 0.5, mat: 'steel', color: P.neonRed });
  };
  tochoTower(-100);
  tochoTower(-88);
  // Skybridges at y 16 and y 24: they span only the 3 m gap and bear
  // laterally on the facing tower walls — a beam emitted through a wall plane
  // overlaps the course it crosses and the resolver shifts both.
  for (const y of [16, 24]) {
    beam(sim, { x: -95.5, y, z: -60.75, len: 3, axis: 'x', t: 0.5, depth: 1.5, mat: 'concrete', color: P.granite });
  }
  // Assembly hall: low drum between the towers — the hemicycle read at scale.
  drum(sim, { x: -98, y: 0, z: -54, r: 4, h: 6, facets: 12, mat: 'concrete', color: P.precast });
  drum(sim, { x: -98, y: 6, z: -54, r: 4, h: 0.5, facets: 12, mat: 'concrete', color: P.graniteDark });

  // --- Mode Gakuen Cocoon Tower ----------------------------------------------
  // The diagrid read, in a box vocabulary: twelve facets per tier, two tones,
  // the weave shifted one facet per tier. Radius stays constant — a tapered
  // ring's facets stop aligning vertically and the upper tier falls.
  for (let t = 0; t < 6; t++) {
    for (let f = 0; f < 12; f++) {
      const a = (2 * Math.PI * f) / 12;
      const px = -50 + 4.875 * Math.cos(a), pz = -20 + 4.875 * Math.sin(a);
      const radial = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? 'z' : 'x';
      panel(sim, {
        x: px - (radial === 'z' ? 0.125 : 1.25), y: t * 3.5, z: pz - (radial === 'z' ? 1.25 : 0.125),
        w: 2.5, h: 3.5, axis: radial, t: 0.25, mat: 'concrete', color: (f + t) % 2 ? P.white : P.cyan,
      });
    }
  }
  // Crown band: a shallow darker tier closes the silhouette.
  drum(sim, { x: -55, y: 21, z: -25, r: 5, h: 1, facets: 12, mat: 'concrete', color: P.teal });

  // --- Supporting towers: podium, shaft, setback, crown ------------------------
  const supporter = (cx, cz, podiumW, podiumD, shaftW, shaftD, floors, crownW, crownD, wall, win) => {
    const x0 = cx - shaftW / 2, z0 = cz - shaftD / 2;
    slabGrid(sim, cx - podiumW / 2, 0, cz - podiumD / 2, podiumW, podiumD, 'concrete', P.precast);
    wallStorey(sim, cx - podiumW / 2, 0, cz - podiumD / 2, podiumW, podiumD, 'concrete', facade(wall, P.amber));
    slabGrid(sim, cx - podiumW / 2, 3, cz - podiumD / 2, podiumW, podiumD, 'concrete', P.graniteDark);
    for (let f = 0; f < floors; f++) {
      const y = 3 + f * 3;
      // The podium roof doubles as the first shaft floor plate.
      if (f > 0) slabGrid(sim, x0, y, z0, shaftW, shaftD, 'concrete', P.precast);
      wallStorey(sim, x0, y, z0, shaftW, shaftD, 'concrete', facade(wall, win));
    }
    const top = 3 + floors * 3;
    // The setback reads from inset WALLS on a full-width shaft roof; an inset
    // floor plate touches no bearing wall and the crown falls at tick 0.
    slabGrid(sim, x0, top, z0, shaftW, shaftD, 'concrete', P.precast);
    wallStorey(sim, cx - crownW / 2, top, cz - crownD / 2, crownW, crownD, 'concrete', facade(wall, win));
    slabGrid(sim, cx - crownW / 2, top + 3, cz - crownD / 2, crownW, crownD, 'concrete', P.graniteDark);
  };
  supporter(-68, -81, 12, 10, 10, 8, 4, 8, 6, P.teal, P.cyan);        // S1, 21 m
  supporter(-85, -30, 10, 10, 8, 8, 5, 6, 6, P.white, P.tochoWin);     // S2, 24 m
  supporter(-60, -45, 9, 8, 7, 6, 3, 5, 4, P.granite, P.amber);        // S3, 15 m

  // --- Podium shop row on shinjuku-dori ---------------------------------------
  // Two shops only, kept west of the Cocoon Tower footprint (x -55..-45):
  // anything closer shares cells with its facets and the overlap resolver
  // shifts both buildings off grid.
  for (let i = 0; i < 2; i++) {
    const x0 = -78 + i * 8, z0 = -26;
    slabGrid(sim, x0, 0, z0, 8, 6, 'concrete', P.precast);
    wallStorey(sim, x0, 0, z0, 8, 6, 'brick', facade(P.wood, [P.neonRed, P.cyan][i]));
    slabGrid(sim, x0, 3, z0, 8, 6, 'concrete', P.graniteDark);
    wallStorey(sim, x0, 3, z0, 8, 6, 'brick', facade(P.wood, P.tochoWin));
    slabGrid(sim, x0, 6, z0, 8, 6, 'concrete', P.graniteDark);
  }

  // --- Starter food & street props (granular by design) -------------------------
  // Esplanade stalls: crate clusters a fresh hole can chain west into the ward.
  for (let x = -6; x >= -58; x -= 4) {
    sim._block(x, 0, 11.5, 'wood', 0.5, P.crate);
    sim._block(x + 0.5, 0, 12, 'brick', 0.5, P.crateB);
    sim._block(x + 1, 0, 11.5, 'wood', 0.5, P.crate);
    sim._block(x + 0.5, 0.5, 11.75, 'brick', 0.5, P.crateB);
    sim._block(x, 0, 15.5, 'wood', 0.5, P.crateB);
    sim._block(x + 1, 0, 15.5, 'brick', 0.5, P.crate);
  }
  // Yokocho stall alley east of the cocoon plaza: ten tiny stalls, all bites.
  for (let i = 0; i < 10; i++) {
    const x = -40 + i * 2.5, z = -18;
    sim._block(x, 0, z, 'wood', 0.5, P.wood);
    sim._block(x + 0.5, 0, z, 'wood', 0.5, P.crate);
    sim._block(x, 0, z + 0.5, 'wood', 0.5, P.crateB);
    sim._block(x + 0.5, 0, z + 0.5, 'wood', 0.5, P.wood);
    sim._block(x, 0.5, z + 0.25, 'brick', 0.5, P.neonRed);
    sim._block(x + 0.5, 0.5, z + 0.25, 'glass', 0.5, 0xffd166);
  }
  // Tocho plaza crates: the ward's ground game continues at the towers' feet.
  for (const [x, z] of [[-97, -41], [-93, -41], [-89, -41], [-97, -38], [-93, -38], [-89, -38], [-95, -35], [-91, -35], [-99, -35], [-85, -41]]) {
    sim._block(x, 0, z, 'wood', 0.5, P.crate);
    sim._block(x + 0.5, 0, z, 'brick', 0.5, P.crateB);
    sim._block(x, 0, z + 0.5, 'brick', 0.5, P.crateB);
    sim._block(x + 0.5, 0, z + 0.5, 'wood', 0.5, P.crate);
  }
  // Planters and vending machines along the same walk — mid-bite variety.
  for (let x = -12; x >= -56; x -= 6) {
    sim._block(x, 0, 14, 'concrete', [1, 0.5, 1], P.walk);
    sim._block(x + 0.25, 0.5, 14.25, 'wood', 0.5, P.leaf);
  }
  for (const [x, c] of [[-16, P.neonRed], [-30, 0x0077b6], [-44, P.neonRed], [-52, 0x0077b6]]) {
    sim._block(x, 0, 13.5, 'steel', [1, 2, 0.5], c);
  }
  // Tocho plaza: benches (4 m spacing — 2 m beams 1 m apart read as one
  // mis-stepped row to the placement probe), lantern cubes, trees on the lawn.
  for (const x of [-98, -94, -90]) {
    beam(sim, { x, y: 0.5, z: -46, len: 2, axis: 'x', t: 0.25, depth: 0.5, mat: 'wood', color: P.wood });
    sim._block(x, 0, -46, 'concrete', 0.5, P.walk);
    sim._block(x + 1.5, 0, -46, 'concrete', 0.5, P.walk);
  }
  for (let x = -99; x <= -87; x += 3) sim._block(x, 0, -44.5, 'glass', 0.5, 0xffd166);
  parks.push({ x: -100, z: -51, w: 14, d: 8, color: P.lawn });
  for (const [tx, tz] of [[-104, -48], [-84, -48], [-104, -44], [-84, -44]]) {
    sim._block(tx, 0, tz, 'wood', 0.5, P.wood);
    sim._block(tx - 0.5, 0.5, tz - 0.5, 'wood', [1.5, 1.5, 1.5], P.leaf);
  }
  // Taxis and a bus on the ward's streets: single body pieces plus roof, all
  // grade-floor bites.
  for (const [x, z] of [[-60, -68], [-20, -33], [-71, -20], [-80, -31.5], [-50, -67], [-90, -68.5]]) {
    sim._block(x, 0, z, 'steel', [2, 1, 1.5], P.taxiGreen);
    sim._block(x + 0.25, 1, z + 0.25, 'steel', [1.5, 0.5, 1], P.taxiGold);
  }
  sim._block(-40, 0, -32.5, 'steel', [2.5, 2.5, 2], 0x2b9348);
  sim._block(-39.75, 2.5, -32.25, 'steel', [2, 0.5, 1.5], P.white);

  // Esplanade pavement and the ward's sidewalks.
  sidewalks.push({ x: -60, z: 9.5, w: 70, d: 7, color: P.walk });
  sidewalks.push({ x: -78, z: -95, w: 4, d: 105, color: P.walk });
  sidewalks.push({ x: -66, z: -95, w: 4, d: 105, color: P.walk });
  sidewalks.push({ x: -105, z: -70, w: 31, d: 80, color: 0x7d8590 });

  sim.sceneDecor = { roads, sidewalks, parks, laneMarkers, crosswalks };
  sim.sceneSurfaces = {};
  sim.cameraBlockers = generateBlockers(sim);
}
