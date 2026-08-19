// Auckland — Sandbox Scene (Act I, chapter 2: PACIFIC REACH).
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// GEOGRAPHY, which is what makes the layout readable rather than arbitrary:
// Auckland is an isthmus city looking NORTH across the Waitematā Harbour at
// Devonport, with volcanic cones standing over it. So the map runs south to
// north as land -> quay -> water -> land again:
//
//   z  34..56   Aotea Square, Albert Park, the Domain and MAUNGAWHAU / MT EDEN
//   z   4..33   the CBD grid — Queen St, Albert St, Customs St, Victoria St,
//               with the SKY TOWER (hero 1) standing over SkyCity at z 19..28
//   z  -3..3    Quay Street, the waterfront artery
//   z -13..-4   the Ferry Building and the Viaduct Harbour basin
//   z -40..-13  the harbour, with the WAITEMATĀ FERRY WHARVES (hero 2) —
//               Princes, Queens and Captain Cook — reaching north into it
//   z -53..-40  Devonport across the water: Mt Victoria and North Head (hero 3)
//
// The player spawns at the origin, which is the Queen St / Quay St corner: the
// one intersection every district is walkable from, and deliberately clear of
// parked traffic for 6 m in every direction so nothing is inside the fresh
// hole's rim at spawn.
//
// BLOCK BUDGET. `citycatalog.js` declares 16,000 blocks for this city and the
// card on the city-select screen prints that number, so it is a promise rather
// than an estimate — `tools/validate.mjs`'s `auckland` section fails the build
// on any drift. The authored geometry deliberately lands SHORT of it, and the
// remainder is spent on the harbour revetment (see §8 RIP-RAP): real armour
// rock along the seawall, the basin mole and the Devonport foreshore, laid
// shore-first, so the budget closes with detail the harbour actually has
// rather than with filler cubes somewhere the camera never goes.

import {
  bench, bikeRack, bollard, boxVan, bus, cafeTable, crateStack,
  dockCleat, fenceRun, generateBlockers, hydrant, lampPost,
  laneDashes, lightMast, mailbox, marketStall, marqueeSign, mooringBollard,
  motorLaunch, motorcycle, newsBox, newsstand, obelisk, parkWall, pavilion,
  pierDeck, planter, rowBlock, rowBoat, sailBoat, sandwichBoard, scaffoldShed,
  sedan, setbackTower, shippingContainer, signPost, signText, statue,
  streetWall, subwayStairEntrance, tower, towerCrown, trafficLight, trashBags,
  trashBin, tree, treeGrove, zebra,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const AUCKLAND_VEHICLES = [
  // Quay Street (axis x, road z -3..3). Nothing within 6 m of the origin: the
  // hole spawns there and a car under its rim is eaten during the idle probe.
  { kind: 'bus', x: -22, z: -2, axis: 'x', color: 0x005b9a },          // AT Metro blue
  { kind: 'sedan', x: -12, z: -2, axis: 'x', color: 0xe8ecf2 },
  { kind: 'boxVan', x: 12, z: -2, axis: 'x', len: 5, color: 0xf2f2f2, color2: 0x0b7a4b },
  { kind: 'sedan', x: 26, z: 0.5, axis: 'x', color: 0x2a3440 },
  // Queen Street (axis z, road x -2..3)
  { kind: 'sedan', x: -1.5, z: 20, axis: 'z', color: 0xf7c948 },       // taxi
  // Albert Street (axis z, road x -30..-26)
  { kind: 'boxVan', x: -29.5, z: 7, axis: 'z', len: 5, color: 0xe8ecf2, color2: 0x005b9a },
  // `motorcycle` always builds along x whatever axis it is declared with, so
  // an axis 'z' bike reports a bounding box a metre narrower than the bike —
  // and the metre outside it reads to the road probe as scenery in a roadway.
  { kind: 'motorcycle', x: -28.5, z: 24, axis: 'x' },
  // Anzac Avenue (axis z, road x 20..24)
  { kind: 'sedan', x: 20.5, z: 12, axis: 'z', color: 0x3a7d44 },
];

// Nothing overhead spans a roadway here (no viaduct, no through-arch), and no
// consumer reads AUCKLAND_OPEN_GROUND yet — both stay empty rather than
// carrying a claim nothing checks.
export const AUCKLAND_ROAD_SPANS = [];
export const AUCKLAND_OPEN_GROUND = [];

export const AUCKLAND_STREETS = [
  { x: -52, z: -3, w: 104, d: 6, axis: 'x' },   // 0 Quay Street (waterfront)
  { x: -46, z: 13, w: 86, d: 5, axis: 'x' },    // 1 Customs Street
  { x: -46, z: 29, w: 76, d: 5, axis: 'x' },    // 2 Victoria Street West
  { x: -2, z: 3, w: 5, d: 41, axis: 'z' },      // 3 Queen Street (the spine)
  { x: -30, z: 3, w: 4, d: 37, axis: 'z' },     // 4 Albert Street
  { x: 20, z: 3, w: 4, d: 27, axis: 'z' },      // 5 Anzac Avenue
];

export const AUCKLAND_CROSSINGS = [
  [0, -34], [0, -8], [0, 8], [0, 30],
  [1, -20], [1, 8], [1, 28],
  [2, -20], [2, 10],
  [3, 10], [3, 26], [3, 40],
  [4, 10], [4, 26],
  [5, 10], [5, 26],
];

// The catalog's declared block count for this city. Restated here rather than
// imported because the scene files are pure sim and js/citycatalog.js is a
// UI-facing module; `tools/validate.mjs` asserts the two are equal, so a change
// to either without the other fails the build.
const TARGET_BLOCKS = 16000;

export function buildAuckland(sim) {
  sim.bounds = 90;
  // Hugs the built content: the rip-rap apron reaches x ±54, the wharves end at
  // z -40, Devonport's shore at -53, and Mt Eden's skirt at z 51.
  sim.boundsRect = { minX: -58, maxX: 58, minZ: -57, maxZ: 56 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], cobbles = [], sidewalks = [];
  const roads = [], water = [], boardwalk = [];

  // ============================================================ DISTRICT SURFACES
  // The Waitematā, and the Viaduct Harbour basin cut into the land west of the
  // Ferry Building. Both stop clear of every paved rect: water draws OVER
  // roads, plaza and sidewalks, so an overlap deletes the street underneath it.
  water.push(
    { x: -70, z: -40, w: 140, d: 27, color: 0x1b5a78 },   // Waitematā Harbour
    { x: -54, z: -13, w: 20, d: 7, color: 0x1f6482 },     // Viaduct Harbour basin
  );

  plaza.push(
    { x: -34, z: -13, w: 90, d: 10, color: 0xc9c3b6 },    // Quay St waterfront promenade
    { x: -51, z: 4, w: 21, d: 25, color: 0x8f8a80 },      // CBD west apron
    { x: -25, z: 4, w: 23, d: 25, color: 0x8f8a80 },      // Britomart / SkyCity apron
    { x: 3, z: 4, w: 18, d: 25, color: 0x8f8a80 },        // CBD east apron
    { x: -25, z: 34, w: 23, d: 13, color: 0xa39c8e },     // Aotea Square
    { x: -51, z: 34, w: 21, d: 16, color: 0x8f8a80 },     // Victoria Quarter
  );

  cobbles.push(
    { x: -24, z: 5, w: 18, d: 7, color: 0x5f5a52 },       // Britomart heritage lanes
    { x: -15, z: -13, w: 14, d: 9, color: 0x6b6459 },     // Ferry Building forecourt
  );

  parks.push(
    { x: 25, z: 18, w: 31, d: 34, color: 0x2f6136 },      // The Domain & Maungawhau slopes
    { x: 3, z: 34, w: 17, d: 16, color: 0x2f6136 },       // Albert Park
    { x: -40, z: -54, w: 80, d: 14, color: 0x35683a },    // Devonport (north shore)
  );

  // Wharf aprons read as timber over the water rather than as bare harbour.
  boardwalk.push(
    // Depths are EVEN multiples of the 2 m pile pitch and end flush on the
    // promenade at z -13. `pierDeck` rounds d/pitch, so an odd depth silently
    // lays one more bay than the rect declares and the deck overruns the quay.
    { x: -34, z: -35, w: 14, d: 22, color: 0x8c6239 },    // Princes Wharf
    { x: -8, z: -31, w: 14, d: 18, color: 0x8c6239 },     // Queens Wharf
    { x: 16, z: -29, w: 18, d: 16, color: 0x7d5936 },     // Captain Cook Wharf
    { x: -52, z: -12, w: 16, d: 5, color: 0x8c6239 },     // Viaduct marina pontoons
  );

  // ============================================================ 1. SKY TOWER (HERO)
  // Auckland's 328 m needle, at this map's scale a ~70 m spike over the SkyCity
  // podium — more than twice the height of anything else here, which is the
  // whole point of it. Four parts, each standing on the one below:
  // podium -> shaft -> observation pod -> mast.
  //
  // The shaft and the pod are OCTAGONS on the grid — a square with its corners
  // chamfered off — rather than squares: a square shaft reads as an ordinary
  // office core, and the chamfer is what makes a needle read as a needle at
  // voxel resolution.
  //
  // They are octagons and NOT diamonds for a structural reason. On a square
  // grid the cells of a diamond (|dx| + |dz| === r) touch only at their
  // corners, so a "ring" drawn that way is not one wall at all — it is sixteen
  // separate columns that share no face and pass no support to each other. The
  // octagon's boundary is face-connected the whole way round.
  //
  // The rest of what has to be right or the tower falls at spawn: an outer WALL
  // and a CENTRAL CORE, both continuous from the podium to the pod roof. The
  // core is what carries the pod's floor and roof plates — their interior cells
  // are five hops from the outer wall, far past concrete's 3 m span, so a pod
  // without a core is a floating disc. And glass carries NOTHING (vertBond
  // 0.40, under the 0.5 a block needs to pass support on), so every pane is a
  // single cell with a concrete mullion beside it and concrete under it.
  // Sited WEST of Queen Street, between Albert St and the Queen St retail wall,
  // which is where SkyCity actually stands. The podium footprint has to contain
  // the shaft's whole diamond (x -20..-11, z 19..28) or the tower stands on air.
  const SKY_CX = -16, SKY_CZ = 23;

  // SkyCity podium (casino + convention floors), x -24..-9, z 19..28
  tower(sim, -24, 19, 15, 9, 0, 5, 'masonry', 'concrete', 0x9aa0a6);
  BOX(-24, 5, 19, 15, 1, 9, 'concrete', 1, 0x7f858b);

  // An octagon of radius `rad`: the square of side 2*rad with a corner triangle
  // cut off each end. `inside` is the solid region, `edge` its boundary ring.
  const octIn = (dx, dz, rad) => Math.max(Math.abs(dx), Math.abs(dz)) <= rad
    && Math.abs(dx) + Math.abs(dz) <= rad + Math.floor(rad / 2);
  const octEdge = (dx, dz, rad) => octIn(dx, dz, rad)
    && !(octIn(dx - 1, dz, rad) && octIn(dx + 1, dz, rad)
      && octIn(dx, dz - 1, rad) && octIn(dx, dz + 1, rad));
  const hasWallNbr = (dx, dz, rad) => octEdge(dx - 1, dz, rad) || octEdge(dx + 1, dz, rad)
    || octEdge(dx, dz - 1, rad) || octEdge(dx, dz + 1, rad);

  const SHAFT_Y0 = 6, POD_Y = 38, SHAFT_R = 4;
  for (let y = SHAFT_Y0; y < POD_Y; y++) {
    const floorPlate = (y - SHAFT_Y0) % 7 === 0;          // sky lobbies / plant floors
    for (let dx = -SHAFT_R; dx <= SHAFT_R; dx++) {
      for (let dz = -SHAFT_R; dz <= SHAFT_R; dz++) {
        if (!octIn(dx, dz, SHAFT_R)) continue;
        const wall = octEdge(dx, dz, SHAFT_R), core = Math.abs(dx) + Math.abs(dz) <= 1;
        if (!wall && !core && !floorPlate) continue;
        // Mullions are CONTINUOUS concrete columns (fixed by plan parity, never
        // by height) and the panes go between them on alternate courses. Both
        // halves of that matter: a pane needs concrete beside it because glass
        // passes no support sideways, and concrete under it because glass
        // passes none upward either — so a mullion that alternated with height
        // would leave its own concrete resting on the pane below it.
        // The chamfer corners have no face-adjacent wall cell at all (their
        // neighbours around the octagon are diagonal), so they are solid posts
        // whatever the parity says — a pane there would have nothing beside it.
        const mullion = (dx + dz) % 2 !== 0 || !hasWallNbr(dx, dz, SHAFT_R);
        const pane = wall && !mullion && y % 2 === 0;
        B(SKY_CX + dx, y, SKY_CZ + dz, pane ? 'glass' : 'concrete', 1,
          pane ? undefined : (core ? 0xb9b3a8 : 0xd8d4ca));
      }
    }
  }

  // Observation pod: floor plate, four glazed levels around the core, roof.
  //
  // Radius 5, not 6, and that is a SITE constraint rather than a style one. The
  // pod is the only part of this tower that overhangs its own podium, and the
  // block it stands in is 11 m deep between Customs St (z 13..18) and Victoria
  // St (z 29..34). A radius-6 pod is 13 m across, so it hung two courses out
  // over Customs Street — 154 blocks inside a roadway rect, 38 m up.
  const POD_R = 5;
  for (const py of [POD_Y, POD_Y + 6]) {
    for (let dx = -POD_R; dx <= POD_R; dx++) {
      for (let dz = -POD_R; dz <= POD_R; dz++) {
        if (!octIn(dx, dz, POD_R)) continue;
        B(SKY_CX + dx, py, SKY_CZ + dz, 'concrete', 1, 0x6f757b);
      }
    }
  }
  for (let y = POD_Y + 1; y < POD_Y + 6; y++) {
    for (let dx = -POD_R; dx <= POD_R; dx++) {
      for (let dz = -POD_R; dz <= POD_R; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= 1) { B(SKY_CX + dx, y, SKY_CZ + dz, 'concrete', 1, 0xb9b3a8); continue; }
        if (!octEdge(dx, dz, POD_R)) continue;
        // Steel mullions every other cell, glass between: the Sky Deck band is
        // the one part of the tower a player reads as WINDOWS from the street.
        const solid = y === POD_Y + 1 || y === POD_Y + 5;
        const glazed = (dx + dz) % 2 === 0 && y % 2 === 0 && hasWallNbr(dx, dz, POD_R);
        const mat = solid || !glazed ? (solid ? 'panel' : 'steel') : 'glass';
        B(SKY_CX + dx, y, SKY_CZ + dz, mat, 1, mat === 'glass' ? undefined : 0xb9812f);
      }
    }
  }

  // Mast: 0.25 m lattice in three tapering tiers, topped by the aviation
  // beacon. Hand-run rather than latticeTower() because the pod's roof is a 1 m
  // plate and the mast has to stand on its centre cells — latticeTower lays a
  // plate of its own at every tier joint, and the first of those would share
  // fine cells with the roof beneath it.
  {
    let y = POD_Y + 7;
    for (const [half, th] of [[0.75, 9], [0.5, 7], [0.25, 5]]) {
      const corners = [[-half, -half], [-half, half - 0.25], [half - 0.25, -half], [half - 0.25, half - 0.25]];
      for (const [ax, az] of corners) {
        for (let yy = 0; yy < th; yy += 0.25) B(SKY_CX + ax, y + yy, SKY_CZ + az, 'steel', 0.25, 0x2b3038);
      }
      // Horizontal ties every metre. A diagonal brace has no vertical path on
      // this grid, so the lattice reads through the ties instead; each tie cell
      // touches a leg orthogonally. The top tier is only two cells across, so
      // its legs are already adjacent and a tie would land ON one of them.
      for (let yy = 1; yy < th && half > 0.25; yy += 1) {
        for (const [ax, az] of corners) {
          B(SKY_CX + ax + (ax < 0 ? 0.25 : -0.25), y + yy, SKY_CZ + az, 'steel', 0.25, 0x3a424e);
          B(SKY_CX + ax, y + yy, SKY_CZ + az + (az < 0 ? 0.25 : -0.25), 'steel', 0.25, 0x3a424e);
        }
      }
      // Tier cap: a SOLID plate over this tier's own square, not four corner
      // cells. The next tier's legs are inset by a quarter metre, so they land
      // between the legs below them — diagonal in plan and offset in height,
      // which is not a face-adjacency at all. Everything above the joint
      // detaches on the first step unless the plate spans the gap.
      y += th;
      for (let ax = -half; ax < half; ax += 0.25) {
        for (let az = -half; az < half; az += 0.25) {
          B(SKY_CX + ax, y, SKY_CZ + az, 'steel', 0.25, 0x4a5568);
        }
      }
      y += 0.25;
    }
    B(SKY_CX - 0.25, y, SKY_CZ - 0.25, 'steel', 0.25, 0x4a5568);
    B(SKY_CX - 0.25, y + 0.25, SKY_CZ - 0.25, 'glass', 0.25, 0xff2b2b);   // aviation beacon
  }

  // SkyCity forecourt on Federal St
  // A cafeTable reaches a metre past its own x on the chair side, so -25.25 is
  // the westmost it fits without a chair leg standing in Albert Street.
  for (const fz of [20, 23, 26]) { cafeTable(sim, -25.25, fz); planter(sim, -25.5, fz + 1.5, 1.5, 1, 0x5f6a4a); }
  signText(sim, 'SKY', -22, 3, 18.5, { px: 0.25, scale: 1, color: 0xf2c14e, rail: 0x2b2f36, dir: 1 });

  // ============================================================ 2. WAITEMATĀ FERRY WHARVES (HERO)
  // Three timber wharves reaching north into the harbour, the middle one
  // carrying the ferry basin the city actually queues on.

  // --- Princes Wharf (cruise berth + the white prow of the hotel on it)
  const princes = pierDeck(sim, { x: -34, z: -35, w: 14, d: 22, y: 1.5, pitch: 2, deck: 0x9a7a52, railStep: 0 });
  // Terminal / hotel: 2 m masses stepping DOWN toward the tip, so the
  // silhouette reads as a ship's superstructure rather than as a shed.
  for (const [zz, h] of [[-32, 5], [-26, 3]]) {
    for (let ix = 0; ix < 5; ix++) {
      for (let iy = 0; iy < h; iy++) {
        for (let iz = 0; iz < 3; iz++) {
          const edge = ix === 0 || ix === 4 || iz === 0 || iz === 2;
          if (!edge && (ix + 2 * iz) % 5 !== 0) continue;
          // Every glazed course has a solid one under it: glass carries nothing
          // vertically, so a two-course band leaves its upper pane in mid-air.
          const glassBand = iy > 0 && iy < h - 1 && iy % 2 === 1 && edge && ix % 2 === 1;
          B(-32 + ix * 2, princes.top + iy * 2, zz + iz * 2, glassBand ? 'glass' : 'concrete', 2,
            glassBand ? undefined : 0xeceae2);
        }
      }
    }
    for (let ix = 0; ix < 5; ix++) {
      for (let iz = 0; iz < 3; iz++) B(-32 + ix * 2, princes.top + h * 2, zz + iz * 2, 'panel', 2, 0xd6d2c6);
    }
  }
  for (const bz of [-33, -23]) {
    mooringBollard(sim, -33.75, bz, princes.top);
    mooringBollard(sim, -20.75, bz, princes.top);
  }
  for (const lz of [-31, -21]) lampPost(sim, -33, lz, princes.top);

  // --- Queens Wharf (the ferry basin: Shed 10 and the terminal apron)
  // railStep 2, not 4: `pierDeck` posts its rail on a DIAGONAL sum, so on a
  // 14x18 deck a step of 4 leaves the last 3.25 m of the long edge with no post
  // under it — a quarter metre past what steel will cantilever.
  const queens = pierDeck(sim, { x: -8, z: -31, w: 14, d: 18, y: 1.5, pitch: 2, deck: 0x8a6540, railStep: 2 });
  // Shed 10: the last of the working sheds, 2 m corrugated with a raised ridge.
  for (let ix = 0; ix < 5; ix++) {
    for (let iy = 0; iy < 3; iy++) {
      for (let iz = 0; iz < 5; iz++) {
        const edge = ix === 0 || ix === 4 || iz === 0 || iz === 4;
        if (!edge && (ix + 2 * iz) % 5 !== 0) continue;
        B(-6 + ix * 2, queens.top + iy * 2, -30 + iz * 2, 'panel', 2, 0x8a4436);
      }
    }
  }
  for (let ix = 0; ix < 5; ix++) {
    for (let iz = 0; iz < 5; iz++) B(-6 + ix * 2, queens.top + 6, -30 + iz * 2, 'steel', 2, 0x6a3a2e);
  }
  for (let iz = 0; iz < 5; iz++) B(-2, queens.top + 8, -30 + iz * 2, 'steel', 2, 0x7a4232);
  signText(sim, 'SHED', -5, queens.top + 4, -30.5, { px: 0.25, scale: 1, color: 0xf2ede2, rail: 0x5a2a22, dir: 1 });
  for (const bz of [-29, -19]) {
    // Inboard of the deck rail at x 5.75: a bollard's head flares 0.125 m past
    // its shaft on every side, so a bollard set flush to the edge eats the rail.
    mooringBollard(sim, -7.5, bz, queens.top);
    mooringBollard(sim, 5, bz, queens.top);
  }
  for (const cz of [-25, -17]) { dockCleat(sim, -7.5, cz, queens.top, 'z'); dockCleat(sim, 5, cz, queens.top, 'z'); }
  for (const lz of [-29, -19]) lampPost(sim, 4.5, lz, queens.top);

  // --- The moored Waitematā ferry (white hull, blue band — a Fullers commuter)
  {
    const fx = -15, fz = -26;
    BOX(fx, 0, fz, 4, 1, 9, 'panel', 1, 0xe8ecf2);                 // hull
    for (let y = 1; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        for (let z = 1; z < 8; z++) {
          const edge = x === 0 || x === 3 || z === 1 || z === 7;
          if (!edge) continue;
          const corner = (x === 0 || x === 3) && (z === 1 || z === 7);
          if (corner) { B(fx + x, y, fz + z, 'steel', 1, 0x2a3440); continue; }
          const mat = y === 1 ? 'glass' : 'panel';
          B(fx + x, y, fz + z, mat, 1, mat === 'glass' ? undefined : 0x005b9a);
        }
      }
    }
    BOX(fx, 3, fz + 1, 4, 1, 7, 'panel', 1, 0xe8ecf2);             // cabin roof
    BOX(fx + 1, 4, fz + 4, 2, 1, 2, 'panel', 1, 0x005b9a);         // wheelhouse
    B(fx + 1, 5, fz + 4, 'steel', 1, 0x2b3038);                    // mast
  }

  // --- Captain Cook Wharf (the working port: containers, a gantry, light masts)
  const cook = pierDeck(sim, { x: 16, z: -29, w: 18, d: 16, y: 1.5, pitch: 2, deck: 0x7d5936, railStep: 0 });
  for (const [cx, cz, len, col] of [
    [17, -29, 6, 0xb4552f], [17, -26, 6, 0x2a5f9a], [25, -29, 6, 0x3a7d44],
    [25, -26, 6, 0xb4552f], [17, -23, 6, 0xc9a227], [25, -23, 6, 0x2a5f9a],
    [17, -20, 6, 0x8a4436], [25, -20, 6, 0x6a6f74],
  ]) shippingContainer(sim, cx, cook.top, cz, len, col);
  // No gantry crane here on purpose. `gantryCrane` stands its legs on GRADE,
  // and every square metre of this berth is already a pile field 1.75 m below
  // the deck — the legs would share cells with the piles wherever they landed.
  // The berth reads as a working port through the container stacks and the
  // flood masts instead.
  for (const bz of [-27, -19]) {
    mooringBollard(sim, 16.25, bz, cook.top);
    mooringBollard(sim, 33.25, bz, cook.top);
  }
  // The flood masts stand on the PROMENADE at the root of the berth, not on the
  // deck: `lightMast` rises from grade, and grade under the wharf is 1.75 m
  // below the deck plates it would have to pass through.
  lightMast(sim, 20, -12.5, 7);
  lightMast(sim, 30, -12.5, 7);

  // --- Small craft. Auckland is the City of Sails, so the water between the
  // wharves is never empty.
  // Every hull below sits in the OPEN water between the wharves — x -20..-8,
  // x 6..16, or outside x ±34. A boat inside a wharf's rectangle would be
  // parked in its pile field, sharing cells with the piles.
  // Every hull below sits in the OPEN water between the wharves — x -20..-8,
  // x 6..16, or outside x ±34 — and NORTH of z -20, which is where the rip-rap
  // apron's last lane ends. A boat inside a wharf rectangle is parked in its
  // pile field; a boat over the apron is parked on the rocks.
  for (const [bx, bz] of [[-18, -31], [-18, -23], [10, -28], [12, -22], [-2, -36]]) {
    motorLaunch(sim, bx, bz, 'z', 0xf2ede2, 0x005b9a);
  }
  for (const [bx, bz] of [[-16, -21], [9, -25], [-11, -21], [2, -38], [-40, -22], [26, -35], [36, -24]]) {
    sailBoat(sim, bx, bz);
  }
  for (const [bx, bz] of [[-19, -27], [11, -33], [38, -30]]) rowBoat(sim, bx, bz, 'x', 0x2f6b3a);

  // ============================================================ 3. VIADUCT HARBOUR & THE FERRY BUILDING
  // Marina pontoons in the basin, low to the water, with the yacht fleet.
  const pontoon = pierDeck(sim, { x: -52, z: -12, w: 16, d: 4, y: 0.75, pitch: 2, deck: 0xb08050, railStep: 0 });
  for (let i = 0; i < 7; i++) sailBoat(sim, -51.5 + i * 2, -12.75);
  for (let i = 0; i < 6; i++) sailBoat(sim, -50.5 + i * 2, -7.25);
  for (const bx of [-50, -44, -38]) mooringBollard(sim, bx, -11.75, pontoon.top);
  for (const bx of [-49, -43, -37]) dockCleat(sim, bx, -8.75, pontoon.top, 'x');

  // Te Wero basin edge: a low stone parapet the promenade runs behind.
  parkWall(sim, { x: -34, z: -13, len: 9, axis: 'z', h: 1, color: 0x8a857a, pierEvery: 4, pierColor: 0x9d978a });

  // The 1912 Ferry Building: Edwardian baroque in Coromandel sandstone, with
  // the clock tower that is still the front door of the city from the water.
  const ferryBase = setbackTower(sim, {
    ox: -15, oz: -12, w: 11, d: 6, tiers: [{ h: 6 }],
    kind: 'masonry', wallMat: 'brick', wall: 0xc09a63, roof: 0x7a5a3c,
    base: 0x9a8f7a, baseH: 2, cornice: 0xa8864f, corniceAxis: 'x', corniceDir: -1,
  });
  tower(sim, -11, -10, 4, 4, ferryBase.top, ferryBase.top + 7, 'masonry', 'brick', 0xc09a63);
  BOX(-11, ferryBase.top + 7, -10, 4, 1, 4, 'concrete', 1, 0x7a5a3c);
  towerCrown(sim, { ox: -11, oz: -10, w: 4, d: 4, y: ferryBase.top + 8, style: 'pyramid', color: 0x3f7f6f, accent: 0x2f5f53 });
  signText(sim, 'FERRY', -14, 3, -12.25, { px: 0.25, scale: 1, color: 0xf2ede2, rail: 0x6a4a2c, dir: -1 });

  // Quay-edge seawall between the wharves, and the promenade furniture behind it.
  for (const [wx, len] of [[-20, 12], [6, 10], [34, 20]]) {
    parkWall(sim, { x: wx, z: -13, len, axis: 'x', h: 1, color: 0x8a857a, pierEvery: 4, pierColor: 0x9d978a });
  }
  for (const px of [-30, -24, 0, 10, 22, 34, 46]) { lampPost(sim, px, -11); bench(sim, px + 2, -11); }
  for (const px of [-20, 14, 38]) trashBin(sim, px, -11);
  for (const px of [18, 42]) bikeRack(sim, px, -11, 3, 'x');
  for (const px of [28, 50]) marketStall(sim, px, -10, 0xc23b2e, 3, 2);
  for (const px of [32, 54]) cafeTable(sim, px, -8);
  treeGrove(sim, { x: 38, z: -7, w: 12, d: 4, step: 5 });

  // ============================================================ 4. BRITOMART & QUAY STREET
  // The heritage block: Edwardian brick warehouses turned into the transport
  // hub, kept deliberately low so the Sky Tower behind them still reads.
  streetWall(sim, {
    x: -24, z: 5, len: 12, depth: 5, axis: 'x', front: -1, unit: 6,
    heights: [7, 9], colors: [0x9a5a42, 0x8a4c38], roofColors: [0x5f5a52],
    kind: 'masonry', wallMat: 'brick', cornice: 0xd8cbb4, seed: 3,
  });
  streetWall(sim, {
    x: 4, z: 5, len: 10, depth: 5, axis: 'x', front: -1, unit: 5,
    heights: [8, 10], colors: [0x8a4c38, 0x99604a], roofColors: [0x5f5a52],
    kind: 'masonry', wallMat: 'brick', cornice: 0xd8cbb4, seed: 11,
  });
  subwayStairEntrance(sim, { x: -6, z: 4.5, w: 3, steps: 5, kiosk: 0x1f4f3a });
  scaffoldShed(sim, { x: -11, z: 4.5, len: 4, axis: 'x', w: 1.5, h: 2.5 });
  for (const px of [-25, -15, 5, 13]) { lampPost(sim, px, 4); trashBin(sim, px + 1.5, 4); }
  newsstand(sim, 9, 4);
  newsBox(sim, -18, 4);
  mailbox(sim, 12, 4);
  hydrant(sim, -11.5, 4);
  sandwichBoard(sim, -19.5, 4);
  trashBags(sim, 18, 4);

  // ============================================================ 5. THE CBD GRID
  // Albert St / Queen St towers. Curtain glass for the 1990s-2010s stock,
  // masonry setbacks for the interwar stone the Queen St valley still has.
  tower(sim, -50, 19, 9, 9, 0, 16, 'curtain');                                 // PwC Tower
  // Stops at x -32 so the Albert St sidewalk band (-31.5..-30) stays clear for
  // its lamp posts and street trees — a 1.5 m canopy overhangs its own trunk by
  // a metre, and the tree is the thing that has to move if they fight.
  setbackTower(sim, {
    ox: -39, oz: 19, w: 7, d: 9,
    tiers: [{ h: 8 }, { h: 4, insetX: 1, insetZ: 1 }],
    kind: 'masonry', wallMat: 'brick', wall: 0xb0a184, roof: 0x6a655c,
    base: 0x9a9184, cornice: 0xc7b795, corniceAxis: 'z', corniceDir: 1,
  });
  tower(sim, 5, 19, 7, 9, 0, 16, 'curtain');                                   // Qantas House
  tower(sim, 14, 19, 5, 9, 0, 12, 'masonry', 'concrete', 0x9aa39a);            // Chancery mid-rise

  // Queen Street valley: the retail street wall, facing the spine. Its east
  // face lands on the Queen St sidewalk at x -3.5, and its back stops clear of
  // the SkyCity podium at x -9.
  streetWall(sim, {
    x: -8.5, z: 19, len: 10, depth: 5, axis: 'z', front: 1, unit: 5,
    heights: [9, 11], colors: [0xbcae90, 0xa89a80], roofColors: [0x5f5a52],
    kind: 'masonry', wallMat: 'brick', cornice: 0xd8cbb4, seed: 7,
  });

  // Aotea Square: the Town Hall, the Civic's marquee, and the market that fills
  // the square between them.
  pavilion(sim, {
    x: -24, z: 36, w: 7, d: 5, h: 6, kind: 'masonry', wallMat: 'brick',
    wall: 0xb08a5c, plate: 0x8a7f70, roof: 0x4a5450, roofRise: 2,
    porch: { dir: -1, xs: [-23, -21, -19, -17], h: 3 },
  });
  // The Civic: its facade IS the marquee's support — the sign's outermost
  // course has to touch the wall or it hangs in the air with nothing under it.
  tower(sim, -13, 36, 6, 6, 0, 8, 'masonry', 'brick', 0x8a4c38);
  BOX(-13, 8, 36, 6, 1, 6, 'concrete', 1, 0x5f5a52);
  marqueeSign(sim, { x: -13, z: 36, w: 5, dir: -1, y: 3, depth: 1, blade: 0xc23b2e, bladeH: 4, bladeW: 1.5 });
  statue(sim, { x: -6, z: 40, h: 5, plinth: 2, w: 1.5, d: 1.5, bronze: 0x4a5f46 });
  for (const [mx, mz] of [[-22, 44], [-17, 44], [-12, 44]]) marketStall(sim, mx, mz, 0x2e5d3a, 3, 2);
  for (const tx of [-23, -18, -13, -8]) tree(sim, tx, 47);
  crateStack(sim, -20, 46, 2);

  // Victoria Quarter: the Freemans Bay villas climbing the ridge behind the CBD.
  rowBlock(sim, { x: -50, z: 38, len: 5, axis: 'x', unit: 5, depth: 5, floors: 2, dir: 1, seed: 5 });
  for (const tx of [-49, -43, -37]) tree(sim, tx, 47);
  // A street line along the quarter's Victoria St frontage, and seating on the
  // ridge walk behind the villas. This was the emptiest ground on the map from
  // above — one villa row on 21x16 m of pavement — and a district that reads as
  // unbuilt apron is the same failure as a district that is missing.
  for (const tx of [-49, -43]) tree(sim, tx, 35);

  // Albert Park: the Victorian gardens above the university.
  fenceRun(sim, { x: 4, z: 34, len: 15, axis: 'x', h: 1.25, color: 0x2f4a35, postEvery: 3 });
  treeGrove(sim, { x: 5, z: 36, w: 12, d: 9, step: 5 });
  statue(sim, { x: 12, z: 41, h: 4, plinth: 1.5, bronze: 0x5a6f52 });
  for (const bz of [37, 43]) { bench(sim, 6, bz); bench(sim, 16, bz); }
  rowBlock(sim, { x: 4, z: 47, len: 5, axis: 'x', unit: 5, depth: 5, floors: 2, dir: -1, seed: 17 });

  // ============================================================ 6. THE VOLCANIC CONES (HERO)
  // Maungawhau / Mt Eden over the Domain, and Mt Victoria + North Head across
  // the water in Devonport. Solid stepped scoria, not shells: a hollow hill
  // collapses like a building and reads like one the moment the hole opens it.
  //
  // The crater is subtracted only from the TOP courses, so every remaining cell
  // still sits on solid rock and nothing can float.
  // A scoria cone: a TRUNCATED cone (flat-topped, as a real one is) with a
  // cylindrical crater sunk into its summit.
  //
  // Both of those shapes are load-bearing, not stylistic. A cone that tapers to
  // a point has no summit wide enough to carve, and a crater whose radius
  // FOLLOWS the taper undercuts itself: the inner edge of course y sits over
  // cells that course y-1 already removed, and the whole summit ring falls on
  // the first step. A fixed inner radius, no wider than the flat top, can only
  // ever remove a column of cells that carries nothing above it.
  const cone = (cx, cz, R, h, opts = {}) => {
    const { rock = 0x5d5348, crown = 0x6f5a45, crater = 0 } = opts;
    const rTop = R * 0.45;
    const rIn = crater > 0 ? Math.max(0, rTop - 1.6) : 0;
    for (let y = 0; y < h; y++) {
      const r = R - (R - rTop) * (y / (h - 1));
      const carve = crater > 0 && y >= h - crater;
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const dd = Math.hypot(dx + 0.5, dz + 0.5);
          if (dd > r) continue;
          if (carve && dd < rIn) continue;
          B(cx + dx, y, cz + dz, 'concrete', 1, y === h - 1 ? crown : rock);
        }
      }
    }
  };
  cone(40, 36, 8, 6, { crater: 3, rock: 0x53493e, crown: 0x6d7a4a });          // Maungawhau / Mt Eden
  // The memorial at the foot of the mountain, on the Domain lawn. It stands
  // BESIDE the cone, not on it: the cone is solid rock, so anything placed on
  // the summit coordinates shares cells with the hill it is meant to crown.
  obelisk(sim, { x: 34, z: 22, h: 3, baseW: 2, baseH: 1, shaftW: 1, stone: 0xb9b2a4, plinth: 0x8a857a });
  treeGrove(sim, { x: 25, z: 19, w: 9, d: 8, step: 4 });                       // Domain woodland
  treeGrove(sim, { x: 47, z: 20, w: 7, d: 9, step: 5 });
  for (const [px, pz] of [[30, 44], [50, 30]]) { bench(sim, px, pz); trashBin(sim, px + 1.5, pz); }
  // The Domain's SOUTHERN lawn. The first pass wooded only the strip north of
  // the mountain, which left the park's larger half a flat green plane that
  // read as unbuilt ground rather than as parkland — the one place the city
  // looked empty from the air. Both groves clear the cone's skirt (it reaches
  // z 45) and stay inside the park rect. They cost nothing against the target:
  // §8 sizes the revetment from whatever the authored city leaves over, so
  // authoring more here simply lays a narrower apron.
  treeGrove(sim, { x: 27, z: 46, w: 8, d: 5, step: 4 });
  treeGrove(sim, { x: 44, z: 46, w: 9, d: 5, step: 4 });

  // --- Devonport, across the Waitematā
  cone(16, -46, 6, 5, { crater: 2, rock: 0x574d42, crown: 0x63713f });         // North Head
  cone(-14, -46, 5, 4, { crater: 2, rock: 0x574d42, crown: 0x63713f });        // Mt Victoria
  obelisk(sim, { x: -22, z: -48, h: 3, baseW: 2, baseH: 1, shaftW: 1, stone: 0xb9b2a4, plinth: 0x8a857a });
  const devWharf = pierDeck(sim, { x: -4, z: -42, w: 8, d: 4, y: 1.5, pitch: 2, deck: 0x8a6540, railStep: 0 });
  mooringBollard(sim, -4.5, -41, 0);
  mooringBollard(sim, 4.5, -41, 0);
  lampPost(sim, -3.5, -41, devWharf.top);
  rowBlock(sim, { x: -34, z: -44, len: 5, axis: 'x', unit: 5, depth: 5, floors: 2, dir: -1, seed: 21 });
  rowBlock(sim, { x: 28, z: -44, len: 5, axis: 'x', unit: 5, depth: 5, floors: 2, dir: -1, seed: 29 });
  for (const tx of [-6, 0, 6, 28, 34]) tree(sim, tx, -50);
  motorLaunch(sim, 4, -38, 'z', 0xf2ede2, 0x3a7d44);

  // ============================================================ 7. STREETS, CROSSINGS & FURNITURE
  for (const s of AUCKLAND_STREETS) {
    roads.push({ x: s.x, z: s.z, w: s.w, d: s.d, color: 0x36393f });
    if (s.axis === 'x') {
      sidewalks.push(
        { x: s.x, z: s.z - 1.5, w: s.w, d: 1.5, color: 0x817b71 },
        { x: s.x, z: s.z + s.d, w: s.w, d: 1.5, color: 0x817b71 },
      );
    } else {
      sidewalks.push(
        { x: s.x - 1.5, z: s.z, w: 1.5, d: s.d, color: 0x817b71 },
        { x: s.x + s.w, z: s.z, w: 1.5, d: s.d, color: 0x817b71 },
      );
    }
  }

  const cross = (s, at) => (s.axis === 'x'
    ? zebra({ x: at, z: s.z + 0.4, w: 2.8, d: s.d - 0.8, axis: 'x' })
    : zebra({ x: s.x + 0.4, z: at, w: s.w - 0.8, d: 2.8, axis: 'z' }));
  const crosswalks = [];
  for (const [si, at] of AUCKLAND_CROSSINGS) crosswalks.push(...cross(AUCKLAND_STREETS[si], at));

  // Centre lines, so the arterials read as arterials from the establishing shot.
  const laneMarkers = [
    ...laneDashes({ x: -50, z: -0.25, w: 100, d: 0.5, axis: 'x' }),
    ...laneDashes({ x: -44, z: 15.25, w: 82, d: 0.5, axis: 'x' }),
    ...laneDashes({ x: 0.25, z: 5, w: 0.5, d: 37, axis: 'z' }),
  ];

  for (const v of AUCKLAND_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.color, v.roof ?? v.color, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.color, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.color, v.color2, v.axis);
    else motorcycle(sim, v.x, v.z);
  }

  // Street trees, signals and furniture on the sidewalk bands. Every position
  // here is OUTSIDE the roadway rects above — the validator's road probe reads
  // all physical blocks, not a height or material subset. A `tree` reaches from
  // tx-0.5 to tx+1, so a 1.5 m sidewalk band admits exactly one trunk position;
  // these are those positions, not the band's nominal edge.
  for (const tx of [-44, -34, -22, 7, 16]) tree(sim, tx, 3.5);
  for (const tz of [20, 26, 38]) { tree(sim, -3, tz); tree(sim, 3.5, tz); }
  for (const tz of [8, 20]) tree(sim, -31, tz);
  trafficLight(sim, -3.5, -3.5);
  trafficLight(sim, 4.5, 3.5);
  trafficLight(sim, -31.5, 12);
  trafficLight(sim, 24.5, 12);
  signPost(sim, -4.5, 10, 0xf2c14e, 2, 'x', 1.25);
  signPost(sim, 3.25, 22, 0x2a5f9a, 2, 'x', 1);
  for (const px of [-40, -20, 26, 34]) lampPost(sim, px, 4.5);
  for (const pz of [22, 36]) { lampPost(sim, -31.5, pz); lampPost(sim, 25.5, pz); }
  // Bollards line the Ferry Building forecourt, not the Britomart kerb: the
  // kerb there is already the subway entrance's podium.
  for (const px of [-2, 0, 2]) bollard(sim, px, -9);

  // ============================================================ 8. RIP-RAP (BUDGET CLOSE-OUT)
  // Armour rock along the seawall, the basin mole and the Devonport foreshore,
  // laid lane by lane from the shore outward. This is where the map's declared
  // 16,000-block budget is spent down to the last stone: the authored city
  // above lands short of it on purpose and `need` is whatever is left. Two
  // things make that honest rather than filler — every one of these quay edges
  // is armoured in life, and the ORDER is shore-first, so a short run reads as
  // a narrower apron rather than as a half-finished one.
  //
  // The x windows are the gaps BETWEEN the wharves, which is both where the
  // rock actually goes and the only place it can go: a stone inside a wharf's
  // pile field would share a fine cell with a pile and ghost it.
  const need = TARGET_BLOCKS - sim.blocks.length;
  if (need > 0) {
    const aprons = [
      { z0: -13.5, dz: -0.5, lanes: 12, windows: [[-54, -34], [-20, -8], [6, 16], [34, 54]] },
      { z0: -39.5, dz: 0.5, lanes: 8, windows: [[-38, -6], [4, 38]] },
    ];
    let placed = 0;
    for (const apron of aprons) {
      for (let lane = 0; lane < apron.lanes && placed < need; lane++) {
        const z = apron.z0 + lane * apron.dz;
        for (const [x0, x1] of apron.windows) {
          for (let x = x0; x < x1 && placed < need; x += 0.5) {
            // Three greys on a fixed positional pattern: a single-colour apron
            // reads as a painted strip, and being positional keeps it
            // identical on every build.
            const t = (Math.round(x * 2) + lane * 3) % 3;
            B(x, 0, z, 'concrete', 0.5, t === 0 ? 0x6b655c : t === 1 ? 0x5a554e : 0x7a746a);
            placed++;
          }
        }
      }
    }
  }

  // ============================================================ 9. SCENE DECOR & AMBIENT
  sim.sceneDecor = {
    parks, plaza, cobbles, sidewalks, roads, crosswalks, laneMarkers, water, boardwalk,
  };

  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_glass_curtain',
    concrete: 'mat_stone_ashlar',
    steel: 'mat_metal_seam',
    panel: 'mat_awning_stripe',
    wood: 'mat_timber_dock',
  };

  sim.sceneAmbient = {
    gulls: [
      { x: -6, z: -22, r: 14, y: 20, count: 12, speed: 0.35 },   // over the ferry basin
      { x: 26, z: -22, r: 12, y: 18, count: 8, speed: 0.4 },     // over the container wharf
      { x: -13, z: 23, r: 18, y: 46, count: 6, speed: 0.28 },    // circling the Sky Tower
    ],
    surf: [
      { x: -34, z: -13, w: 20, d: 1.5 },
      { x: 6, z: -13, w: 28, d: 1.5 },
    ],
    ferries: [
      { x0: -12, z0: -16, x1: 2, z1: -38, period: 46, color: 0xe8ecf2 },
      { x0: 20, z0: -34, x1: -30, z1: -20, period: 68, color: 0x005b9a },
    ],
  };

  // Camera blockers, GENERATED from the finished geometry and ASSIGNED. The
  // return value is the whole point: a sibling scene called this and dropped
  // the result, and has shipped with zero blockers — the camera clipping
  // through every building — ever since. This stays the last statement of the
  // build, after the rip-rap, or the apron is invisible to it.
  sim.cameraBlockers = generateBlockers(sim);
}
