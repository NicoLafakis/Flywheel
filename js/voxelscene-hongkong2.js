// Hong Kong Take Two — Victoria Harbour frame (LOCAL-ONLY SANDBOX, not in the
// city catalog). Hand-authored and deterministic (pure sim: no Math.random, no
// three.js). Uses canonical builders from js/voxelkit.js.
//
// WHY THIS SCENE EXISTS: it is the construction-language proof at city scale.
// Every structure is made of PIECES — axis-aligned boxes of arbitrary per-axis
// extents (`sim._block(x, y, z, mat, [ex, ey, ez], color)`) — and cubes are
// NEVER the predominant shape. The `hongkong2` section in tools/validate.mjs
// holds that as a hard gate (cubic pieces < 25% of count and < 15% of volume
// outside the declared historic zones), generalizing the Lab's `labDoctrine`
// district to a full city. Vocabulary: CORE (one piece = a building's mass),
// COLUMN/BEAM (tall/long thin), SLAB (floor plate / cap), SHEET (thin facade
// panel), BRICK (small near-cubic unit, permitted ONLY in the historic zones).
//
// HOW TO LOAD IT LOCALLY (it is deliberately absent from CITY_CATALOG, so no
// menu shows it):
//   python -m http.server 8000
//   http://localhost:8000/tools/scene-view.html?scene=hongkong2
// The dev scene viewer takes any registered scene id; this scene is registered
// in SCENE_IMPORTERS (js/voxelsim.js) but has no catalog card, which is the
// least invasive wiring that still lets it render with the real renderer.
//
// GEOGRAPHY (z south-positive, matching the shipped hongkong scene):
//   z -64..-52  Kowloon / Tsim Sha Tsui: ICC, the TST tower wall, the Clock
//               Tower (historic brick), the Cultural Centre's ribbed wings
//   z -52..-50  TST promenade  ·  z -56..-52 Salisbury Road
//   z -50..-16  Victoria Harbour: Star Ferries, a junk, sampans, Central pier
//   z -16..-11  Central–Wan Chai harbourfront promenade
//   z -11..-6   Connaught Road Central
//   z  -6..22   The shore wall, west→east: Western Market (historic brick),
//               One IFC, Two IFC, Exchange Square, Jardine House, Statue
//               Square (the spawn plaza), The Center, Central Plaza, CWB infill
//   z  22..27   Queen's Road / Des Voeux corridor
//   z  27..46   The canyon: Man Mo Temple (historic brick), Mid-Levels infill,
//               HSBC, Bank of China, Lippo Centre, Two Pacific Place, Hong
//               Kong Park, Hopewell Centre
//   z  46..51   Hennessy Road
//   z  51..64   The residential estate wall (the Mid-Levels backdrop)
//
// STRUCTURAL RULES OBEYED (see .wiki/modules/voxel.md): every piece is either
// ground-stacked or rests on the piece below it; glass never carries, so all
// load-bearing facade work is 'panel'; ground-level pieces stay under the 8 m
// plan diagonal (probeGradeDiagonal — past 9.7 m a grade piece is permanently
// uneatable); collinear identical pieces either abut or sit >= one extent
// apart (probePlacementStep), which the per-storey column stacks satisfy by
// alternating colour per storey exactly as the Lab doctrine district does.
//
// SKYLINE RESEARCH (rule 11 — real composition, not memory): heights and
// west→east order from the CTBUH-derived lists and building pages —
// 2 IFC 412 m tallest on the Island, Central Plaza 374 m, BoC 315 m (+masts),
// Hopewell 222 m, HSBC 178.8 m, Jardine House 178.5 m, ICC 484 m across the
// harbour. https://en.wikipedia.org/wiki/International_Finance_Centre_(Hong_Kong)
// https://en.wikipedia.org/wiki/Jardine_House https://thetowerinfo.com/tallest-buildings-hong-kong/
// Scale here is ~1:7, clamped to the game's ~70 m ceiling.
//
// DETAIL BUDGET (Nico, 2026-08-25: up to 4,000 pieces, hard ceiling): the
// first-cut approximations are now real geometry — Jardine has porthole glass
// on spandrel/pier bands, BoC carries stair-run chevron cross-bracing proud
// of its facades, Lippo's koala pods are true overhanging floor plates, and
// Hopewell is an octagonal (cylindrical-read) shell. Background buildings are
// podium/shaft/crown/plant compositions with mullion fin rows and glass
// shopfronts. Remaining visual iteration: nothing structural — palette and
// proportion tuning only.

// NOTE ON THE KIT: voxelkit's vehicles, trees AND street furniture are built
// from 0.25–0.5 m BRICKS (its B25 helper is a box OF cubes; they predate
// ADR-0013), and importing them pushed this scene to 79.9% cubic on the first
// validator run — the exact failure the scene exists to refute. So traffic,
// trees, lamps, benches, planters and bollards are authored below as
// piece-built equivalents (2–4 boxes each); vehicles stay inside the kit's
// vehicleBBox allowlist envelopes. Only the geometry-derived helpers
// (generateBlockers, laneDashes) come from the kit.
import { generateBlockers, laneDashes } from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const HONGKONG2_VEHICLES = [
  // Salisbury Road (axis x, z -56..-52)
  { kind: 'bus', x: -40, z: -55, axis: 'x', color: 0xc62828 },          // KMB double-decker
  { kind: 'sedan', x: 10, z: -55, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 }, // red taxi
  // Connaught Road Central (axis x, z -11..-6)
  { kind: 'bus', x: -60, z: -9.5, axis: 'x', color: 0xf9a825 },         // Citybus yellow
  { kind: 'sedan', x: -20, z: -9.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'boxVan', x: 15, z: -9.5, axis: 'x', len: 5, color: 0xf5f5f5, color2: 0x1565c0 },
  { kind: 'sedan', x: 55, z: -9.5, axis: 'x', color: 0x212121 },
  // Queen's Road / Des Voeux corridor (axis x, z 22..27)
  { kind: 'bus', x: -35, z: 23.5, axis: 'x', color: 0x1b5e20 },         // Ding Ding tram green
  { kind: 'sedan', x: 20, z: 23.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'sedan', x: 60, z: 23.5, axis: 'x', color: 0x37474f },
  // Hennessy Road (axis x, z 46..51)
  { kind: 'sedan', x: -30, z: 47.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'bus', x: 30, z: 47.5, axis: 'x', color: 0x0d47a1 },
  { kind: 'sedan', x: -15, z: -55, axis: 'x', color: 0x1b5e20 },
  { kind: 'boxVan', x: 30, z: -55, axis: 'x', len: 5, color: 0xefebe9, color2: 0x4e342e },
  { kind: 'motorcycle', x: 55, z: -55, axis: 'x' },
  { kind: 'sedan', x: -45, z: -9.5, axis: 'x', color: 0x9e9e9e },
  { kind: 'bus', x: 35, z: -9.5, axis: 'x', color: 0xc62828 },
  { kind: 'motorcycle', x: 65, z: -9.5, axis: 'x' },
  // Ding Ding trams run the Des Voeux corridor — 'bus' envelope, tram livery
  { kind: 'bus', x: -60, z: 23.5, axis: 'x', color: 0x2e7d32 },
  { kind: 'bus', x: 40, z: 23.5, axis: 'x', color: 0x33691e },
  { kind: 'boxVan', x: 5, z: 23.5, axis: 'x', len: 5, color: 0xfff8e1, color2: 0xef6c00 },
  { kind: 'bus', x: -55, z: 47.5, axis: 'x', color: 0x1b5e20 },
  { kind: 'sedan', x: 0, z: 47.5, axis: 'x', color: 0x1565c0 },
  { kind: 'sedan', x: 50, z: 47.5, axis: 'x', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  // Pedder Street (axis z, x -50..-46)
  { kind: 'sedan', x: -49.5, z: 10, axis: 'z', color: 0xd32f2f, roofColor: 0xe0e0e0 },
  { kind: 'motorcycle', x: -48.5, z: 30, axis: 'z' },
  // Arsenal Street (axis z, x 40..44)
  { kind: 'boxVan', x: 40.5, z: 15, axis: 'z', len: 5, color: 0xffffff, color2: 0xd32f2f },
  { kind: 'motorcycle', x: 41.5, z: 36, axis: 'z' },
  { kind: 'sedan', x: 40.75, z: 0, axis: 'z', color: 0x37474f },
];

export const HONGKONG2_ROAD_SPANS = [];
export const HONGKONG2_OPEN_GROUND = [];

// Brick-grain (near-cubic pieces) is PERMITTED only inside these rects; the
// validator reads them from here rather than hardcoding, so the zone and the
// geometry move together or not at all.
export const HONGKONG2_HISTORIC_ZONES = [
  { name: 'Tsim Sha Tsui Clock Tower', minX: 30, maxX: 42, minZ: -64, maxZ: -56 },
  { name: 'Western Market', minX: -78, maxX: -64, minZ: -4, maxZ: 8 },
  { name: 'Man Mo Temple', minX: -78, maxX: -62, minZ: 28, maxZ: 44 },
];

// The silhouette contract (.wiki/modules/voxel.md): foot AABB, EXACT peak,
// and the voids that make the building read as itself rather than as a slab.
export const HONGKONG2_LANDMARKS = [
  { id: 'icc', name: 'International Commerce Centre', foot: { minX: -78, maxX: -66, minZ: -64, maxZ: -52 }, peak: 70,
    voids: [{ minY: 8, maxY: 56, minFrac: 0.6, why: 'a curtain-wall shell around a slender core, not a solid prism' }] },
  { id: 'ifc2', name: 'Two International Finance Centre', foot: { minX: -46, maxX: -36, minZ: -4, maxZ: 6 }, peak: 61,
    voids: [{ minY: 6, maxY: 44, minFrac: 0.55, why: 'the tapering ribbed shaft is a hollow tube, crowned by the claws' }] },
  { id: 'ifc1', name: 'One International Finance Centre', foot: { minX: -58, maxX: -50, minZ: -4, maxZ: 4 }, peak: 30.5,
    voids: [{ minY: 4, maxY: 24, minFrac: 0.5, why: 'the shorter IFC sibling is the same hollow-shell construction' }] },
  { id: 'jardine', name: 'Jardine House', foot: { minX: -22, maxX: -14, minZ: -2, maxZ: 6 }, peak: 26,
    voids: [{ minY: 4, maxY: 20, minFrac: 0.5, why: 'the porthole tower is a thin skin on a small core' }] },
  { id: 'hsbc', name: 'HSBC Main Building', foot: { minX: -24, maxX: -14, minZ: 28, maxZ: 40 }, peak: 28, minGroundFrac: 0.05,
    voids: [{ minY: 0, maxY: 3, minFrac: 0.85, why: 'the famous open ground-floor plaza under the suspended floors' }] },
  { id: 'boc', name: 'Bank of China Tower', foot: { minX: -8, maxX: 4, minZ: 28, maxZ: 40 }, peak: 54.5,
    voids: [
      { minY: 6, maxY: 20, minFrac: 0.45, why: 'four hollow glass prisms, not one solid block' },
      { minY: 41, maxY: 47, minFrac: 0.7, why: 'the wedge has stepped away to a single prism by this height' },
    ] },
  { id: 'lippo', name: 'Lippo Centre', foot: { minX: 8, maxX: 28, minZ: 28, maxZ: 36 }, peak: 30,
    voids: [{ minY: 4, maxY: 18, minFrac: 0.5, why: 'two separate hollow towers with open air between them' }] },
  { id: 'twopacific', name: 'Two Pacific Place', foot: { minX: 32, maxX: 38, minZ: 28, maxZ: 38 }, peak: 34.5,
    voids: [{ minY: 4, maxY: 28, minFrac: 0.55, why: 'a slender hollow shaft over Admiralty' }] },
  { id: 'centralplaza', name: 'Central Plaza', foot: { minX: 46, maxX: 58, minZ: -4, maxZ: 8 }, peak: 58.5,
    voids: [{ minY: 6, maxY: 38, minFrac: 0.6, why: 'the Wan Chai shaft is hollow up to its stepped crown and spire' }] },
  { id: 'thecenter', name: 'The Center', foot: { minX: 14, maxX: 26, minZ: -2, maxZ: 10 }, peak: 52,
    voids: [{ minY: 6, maxY: 38, minFrac: 0.6, why: 'the neon-banded shaft is a shell; the crown is open steelwork' }] },
  { id: 'hopewell', name: 'Hopewell Centre', foot: { minX: 60, maxX: 70, minZ: 30, maxZ: 40 }, peak: 34.5,
    voids: [{ minY: 6, maxY: 30, minFrac: 0.55, why: 'the round tower is a shell with a revolving-restaurant drum on top' }] },
  { id: 'clocktower', name: 'Tsim Sha Tsui Clock Tower', foot: { minX: 33, maxX: 39, minZ: -63, maxZ: -57 }, peak: 10.5,
    voids: [{ minY: 2, maxY: 6, minFrac: 0.45, why: 'the brick shaft is hollow — it housed a stairwell, not masonry mass' }] },
  { id: 'westernmarket', name: 'Western Market', foot: { minX: -77, maxX: -65, minZ: -3, maxZ: 7 }, peak: 10,
    voids: [{ minY: 1, maxY: 6, minFrac: 0.5, why: 'the Edwardian market hall is one open interior' }] },
  { id: 'manmo', name: 'Man Mo Temple', foot: { minX: -75, maxX: -63, minZ: 29, maxZ: 39 }, peak: 5.5,
    voids: [{ minY: 1, maxY: 3.5, minFrac: 0.5, why: 'the temple hall under the tiled roof is open incense-filled space' }] },
];

// Palette
const CREAM = 0xe8e4da;
const RIB = 0xd8d2c4;
const GRANITE = 0xcfd8dc;
const BOC_BLUE = 0x143a6e;
const BOC_WHITE = 0xe3ecf5;
const LIPPO_A = 0x1d4a8a;
const LIPPO_B = 0x2b6cb0;
const HSBC_GREY = 0x9aa5ad;
const HSBC_DARK = 0x5c6b75;
const PASTELS = [0xf4c2c2, 0xbfe3d0, 0xfff1c1, 0xf9d3b4, 0xcde4f7, 0xe6d4f2, 0xd7ecc1, 0xf7e1ea];
const MIDTONES = [0x7f9bb3, 0x8fa8a0, 0xa596b5, 0xb3a67f, 0x86a0c0, 0x9db08a];

export function buildHongKong2(sim) {
  sim.bounds = 100;
  sim.boundsRect = { minX: -78, maxX: 78, minZ: -64, maxZ: 66 };

  // 7th arg is the per-block procedural surface id (js/voxeltiles.js registry,
  // rendered via the tier-2 texture array — one material for every surfaced
  // block). The low-poly doctrine: facade articulation lives on the surface of
  // large pieces, geometry is for silhouette.
  const B = (x, y, z, m, s, c, surf) => sim._block(x, y, z, m, s, c, surf);

  // --- the shell-tower vocabulary ------------------------------------------
  // One band = four facade SHEETS (0.5 m thick 'panel' — glass never carries)
  // around a hollow interior; a full-height CORE takes the cap; a SLAB caps
  // the shaft. Only the ground band splits its long faces: probeGradeDiagonal
  // caps grade pieces at an 8 m plan diagonal, and an elevated sheet has no
  // such limit. Bands alternate two tints, which reads as curtain-wall
  // coursing AND keeps stacked ring courses legibly deliberate; stacked
  // same-tint bands sit exactly one extent apart, which probePlacementStep
  // accepts by rule (gap >= extent).
  const ringBand = (ox, oz, w, d, y, bh, col) => {
    const ground = y === 0;
    const nsSeg = ground && w > 8 ? w / 2 : w;
    for (let x = ox; x < ox + w - 0.1; x += nsSeg) {
      B(x, y, oz, 'panel', [nsSeg, bh, 0.5], col);
      B(x, y, oz + d - 0.5, 'panel', [nsSeg, bh, 0.5], col);
    }
    const ewLen = d - 1;
    const ewSeg = ground && ewLen > 8 ? ewLen / 2 : ewLen;
    for (let z = oz + 0.5; z < oz + d - 0.6; z += ewSeg) {
      B(ox, y, z, 'panel', [0.5, bh, ewSeg], col);
      B(ox + w - 0.5, y, z, 'panel', [0.5, bh, ewSeg], col);
    }
  };
  // A shaft from y0 up: `bands` rings of height bh starting at y0, a core
  // occupying y0..top, and a cap slab. Tiers stack by calling this again with
  // y0 = the returned cap top; the upper ring and core then rest on the cap.
  const shellTier = (ox, oz, w, d, y0, bands, bh, colA, colB, coreW, capC = 0x78909c) => {
    for (let i = 0; i < bands; i++) {
      ringBand(ox, oz, w, d, y0 + i * bh, bh, i % 2 === 0 ? colA : colB);
    }
    const H = bands * bh;
    B(ox + (w - coreW) / 2, y0, oz + (d - coreW) / 2, 'concrete', [coreW, H, coreW], 0x455a64);
    B(ox, y0 + H, oz, 'concrete', [w, 0.5, d], capC);
    return y0 + H + 0.5; // top of the cap slab
  };
  // A background building at the 4k detail budget (Nico, 2026-08-25): podium
  // band, shaft, setback crown, roof plant, antenna — five pieces where a cube
  // builder spends hundreds. Podium/crown colours derive from the shaft colour
  // so identical-extent neighbours never present same-colour sliver pairs.
  const dim = (c) => ((c >> 1) & 0x7b7b7b) + 0x1c1c1c;
  // `surf` paints the SHAFT with a procedural facade surface (the low-poly
  // doctrine: window grids ride the texture, not extra fin pieces — the
  // finRow helper this replaced read as "3 weird vertical pillars").
  const slabBlock = (ox, oz, w, h, dpt, col, fin = true, surf) => {
    B(ox, 0, oz, 'concrete', [w, 2, dpt], dim(col));
    B(ox, 2, oz, 'concrete', [w, h - 2, dpt], col, surf);
    B(ox + 0.5, h, oz + 0.5, 'concrete', [w - 1, 1.5, dpt - 1], dim(col));
    B(ox + 1, h + 1.5, oz + 1, 'concrete', [2, 1, 1.5], 0x546e7a);
    if (fin) B(ox + Math.max(w - 1.25, 3), h + 1.5, oz + 1, 'steel', [0.25, 2.5, 0.25], 0x50606c);
  };
  const shopfront = (x0, z0, w, c = 0x9fc4d8) => B(x0, 0, z0, 'glass', [w, 1.5, 0.25], c);
  // REAL cross-bracing (4k budget): stair-run chevrons, one step per metre of
  // rise, each step quarter-seated on the one below (the lab-proven 50%
  // bearing). Runs sit proud of a facade, outside the landmark foot, and each
  // run gets its own tint so two runs meeting on one line never form an
  // identical-piece sliver pair.
  const chevronX = (xa, xb, z, h, col) => {
    let x = xa, d = 0.25;
    for (let y = 0; y < h; y++) {
      B(x, y, z, 'steel', [0.5, 1, 0.25], col);
      x += d;
      if (x + 0.5 > xb || x < xa) { d = -d; x += 2 * d; }
    }
  };
  // Setback accent columns standing on a tier's cap slab at its four corners.
  const capCorners = (x0, z0, w, d, y, h, c) => {
    for (const [cx, cz] of [[x0, z0], [x0 + w - 0.5, z0], [x0, z0 + d - 0.5], [x0 + w - 0.5, z0 + d - 0.5]]) {
      B(cx, y, cz, 'steel', [0.5, h, 0.5], c);
    }
  };
  const chevronZ = (za, zb, x, h, col) => {
    let z = za, d = 0.25;
    for (let y = 0; y < h; y++) {
      B(x, y, z, 'steel', [0.25, 1, 0.5], col);
      z += d;
      if (z + 0.5 > zb || z < za) { d = -d; z += 2 * d; }
    }
  };
  // Piece-built street furniture: columns, slats and slabs, zero cubes.
  const hkLamp = (x, z) => {
    B(x - 0.125, 0, z - 0.125, 'steel', [0.25, 3, 0.25], 0x2f3640);
    B(x - 0.25, 3, z - 0.25, 'steel', [0.5, 0.25, 0.5], 0x37474f);
    B(x - 0.25, 3.25, z - 0.25, 'glass', [0.5, 0.25, 0.5], 0xfff3c4);
  };
  const hkBench = (x, z) => {
    B(x, 0, z, 'steel', [0.25, 0.5, 0.25], 0x3a4450);
    B(x + 1.25, 0, z, 'steel', [0.25, 0.5, 0.25], 0x3a4450);
    B(x, 0.5, z - 0.125, 'wood', [1.5, 0.25, 0.5], 0x8a6a44);
  };
  const hkPlanter = (x, z) => {
    B(x, 0, z, 'concrete', [2, 0.5, 1], 0x6d5a4a);
    B(x + 0.25, 0.5, z + 0.125, 'leaf', [1.5, 0.5, 0.75], 0x388e3c);
  };
  const hkBollard = (x, z) => B(x - 0.125, 0, z - 0.125, 'steel', [0.25, 0.75, 0.25], 0x2f3640);
  // Piece-built street tree: a 4:1 trunk column and two canopy slabs.
  const hkTree = (tx, tz) => {
    B(tx, 0, tz, 'wood', [0.5, 2, 0.5], 0x5d4037);
    B(tx - 0.75, 2, tz - 0.75, 'leaf', [2, 1, 2], 0x2e7d32);
    B(tx - 0.375, 3, tz - 0.375, 'leaf', [1.25, 0.75, 1.25], 0x388e3c);
  };
  // Piece-built traffic, kept inside the kit's vehicleBBox envelopes (the
  // validator's road-conflict allowlist is computed from the exported table
  // via voxelkit.vehicleBBox, so the footprint contract is the kit's).
  const veh = (v) => {
    const ax = v.axis !== 'z';
    const E = (l, h, wdt) => (ax ? [l, h, wdt] : [wdt, h, l]);
    const at = (dl, y, dw, s, m, c) => (ax
      ? B(v.x + dl, y, v.z + dw, m, s, c)
      : B(v.x + dw, y, v.z + dl, m, s, c));
    if (v.kind === 'sedan') {
      at(0, 0, 0, E(3.5, 0.75, 1.75), 'steel', v.color);
      at(0.75, 0.75, 0.25, E(2, 0.75, 1.25), 'steel', v.roofColor ?? v.color);
    } else if (v.kind === 'bus') {
      // 6.5 m: the kit's bus bbox is 6 m + the probe's 0.75 m slack
      at(0, 0, 0, E(6.5, 2.25, 2.25), 'steel', v.color);
      at(0, 2.25, 0, E(6.5, 0.25, 2.25), 'steel', 0xeceff1);
    } else if (v.kind === 'boxVan') {
      at(0, 0, 0.25, E(1.25, 2, 1.75), 'steel', v.color);
      at(1.25, 0, 0, E(v.len - 1.5, 2.25, 2.25), 'steel', v.color2 ?? v.color);
    } else { // motorcycle
      at(0, 0, 0.5, E(1.5, 0.75, 0.5), 'steel', 0x263238);
      at(0.5, 0.75, 0.5, E(0.5, 0.5, 0.25), 'steel', 0x37474f);
    }
  };

  // ======================================================== DISTRICT SURFACES
  const parks = [
    { x: 44, z: 28, w: 14, d: 16, color: 0x2e7d32 },   // Hong Kong Park
  ];
  const sand = [];
  const plaza = [
    { x: -78, z: -52, w: 156, d: 2, color: 0xcfd8dc },  // TST promenade
    { x: -78, z: -16, w: 156, d: 5, color: 0xd6d2c8 },  // Central–Wan Chai promenade
    { x: -78, z: -6, w: 156, d: 28, color: 0xb0bec5 },  // shore-wall apron incl. Statue Square
    { x: -78, z: 27, w: 122, d: 19, color: 0x90a4ae },  // canyon apron, west of HK Park
    { x: 58, z: 27, w: 20, d: 19, color: 0x90a4ae },    // canyon apron, east of HK Park
    { x: -70, z: 51, w: 146, d: 13, color: 0x9aa5ad },  // estate-wall ground
    { x: -78, z: -64, w: 156, d: 8, color: 0xaab6bd },  // Kowloon block ground
  ];
  const cobbles = [
    { x: 30, z: -64, w: 12, d: 8, color: 0x8a7f70 },    // Clock Tower forecourt
    { x: -78, z: -4, w: 14, d: 12, color: 0x8a7f70 },   // Western Market setts
    { x: -78, z: 28, w: 16, d: 16, color: 0x7d746a },   // Man Mo terrace
  ];
  const sidewalks = [
    { x: -78, z: -13, w: 156, d: 2, color: 0xc5ccd2 },
    { x: -62, z: -58, w: 138, d: 2, color: 0xc5ccd2 },
    { x: -72, z: 20, w: 144, d: 2, color: 0xc5ccd2 },
    { x: -72, z: 27, w: 144, d: 2, color: 0xc5ccd2 },
    { x: -64, z: 44, w: 128, d: 2, color: 0xc5ccd2 },
    { x: -64, z: 51, w: 128, d: 2, color: 0xc5ccd2 },
  ];
  const roads = [
    { x: -62, z: -56, w: 138, d: 4, color: 0x37474f }, // 0 Salisbury Road
    { x: -78, z: -11, w: 156, d: 5, color: 0x37474f }, // 1 Connaught Road Central
    { x: -72, z: 22, w: 144, d: 5, color: 0x37474f },  // 2 Queen's Road / Des Voeux
    { x: -64, z: 46, w: 128, d: 5, color: 0x37474f },  // 3 Hennessy Road
    { x: -50, z: -6, w: 4, d: 52, color: 0x37474f },   // 4 Pedder Street
    { x: 40, z: -6, w: 4, d: 52, color: 0x37474f },    // 5 Arsenal Street
  ];
  const rail = [];
  const bikePaths = [];
  const laneMarkers = [
    ...laneDashes({ x: -78, z: -8.75, w: 156, d: 0.5, axis: 'x' }),
    ...laneDashes({ x: -72, z: 24.25, w: 144, d: 0.5, axis: 'x' }),
    ...laneDashes({ x: -64, z: 48.25, w: 128, d: 0.5, axis: 'x' }),
  ];
  const crosswalks = [];
  const water = [
    { x: -78, z: -50, w: 156, d: 34, color: 0x164e63 }, // Victoria Harbour
  ];
  const boardwalk = [
    { x: -8, z: -26, w: 12, d: 10, color: 0x8d6e63 },   // Central ferry pier deck
    { x: 28, z: -26, w: 12, d: 10, color: 0x8d6e63 },   // Wan Chai ferry pier deck
  ];

  // ------------------------------------------------------------
  // 0. KOWLOON WALL & ICC (z -64..-52)
  // ------------------------------------------------------------
  // ICC — the tallest thing on the map, alone across the water. Shaft 60 m,
  // crown tier 6 m, cap, four corner fins → peak 70 m (landmark 'icc').
  {
    let y = shellTier(-78, -64, 12, 12, 0, 6, 10, 0x9fb8cc, 0x86a5bd, 4, 0xb8c9d6);
    y = shellTier(-77, -63, 10, 10, y, 1, 6, 0x86a5bd, 0x9fb8cc, 2, 0xb8c9d6);
    for (const [fx, fz] of [[-77, -63], [-67.5, -63], [-77, -53.5], [-67.5, -53.5]]) {
      B(fx, y, fz, 'steel', [0.5, 3, 0.5], 0xd6e2ea);
    }
    capCorners(-78, -64, 12, 12, 60.5, 4, 0xc4d4e0);
  }

  // The TST tower wall: twelve slender slabs, every height distinct (distinct
  // extents also keep probePlacementStep's identical-piece rule out of play).
  {
    const heights = [18, 22, 16, 25, 19, 23, 17, 21, 15, 24, 20, 26];
    const xs = [-62, -54, -46, -38, -30, -22, -14, -6, 2, 10, 18, 24];
    xs.forEach((px, i) => {
      slabBlock(px, -64, 6, heights[i], 5, PASTELS[i % PASTELS.length]);
      // the wall faces the harbour at +z here: fins stand just off the face,
      // the glass strip fronts them as an arcade (tint alternates — the
      // spacing pinches to 6 m at the row's east end, inside the sliver rule)
      shopfront(px + 1, -58.5, 4, i % 2 ? 0x8fb8d0 : 0x9fc4d8);
    });
  }
  // ICC podium (the Elements deck at the tower's east flank) — split in two so
  // each grade piece stays under the 8 m plan diagonal.
  B(-66, 0, -64, 'concrete', [4, 4, 5], 0x8fa6b8);
  B(-65.5, 4, -63.5, 'concrete', [3, 1, 4], 0x7b93a6);

  // TST Clock Tower (HISTORIC ZONE: 0.5 m brick grain is the correct grain
  // for 1915 masonry). Hollow shaft, granite quoin courses, white clock band,
  // stepped cupola, rod → peak 10.5 m (landmark 'clocktower').
  {
    const RED = 0x8d5b4c;
    for (let course = 0; course < 13; course++) {
      const yy = course * 0.5;
      const clockBand = course === 10 || course === 11;
      for (let gx = 34; gx < 38; gx += 0.5) {
        for (let gz = -62; gz < -58; gz += 0.5) {
          const edgeX = gx < 34.4 || gx > 37.4;
          const edgeZ = gz < -61.6 || gz > -58.6;
          if (!edgeX && !edgeZ) continue; // hollow shaft
          const corner = edgeX && edgeZ;
          const col = clockBand ? 0xfafafa : (corner && course % 2 === 0 ? GRANITE : RED);
          B(gx, yy, gz, 'brick', 0.5, col);
        }
      }
    }
    // The base tier must span the FULL 34..38 ring: the 0.5 m bearing edges
    // are the only solid masonry, so anything narrower floats over the void.
    B(34, 6.5, -62, 'concrete', [4, 0.5, 4], 0x37474f);
    B(34.75, 7, -61.25, 'concrete', [2.5, 0.5, 2.5], 0x37474f);
    B(35.5, 7.5, -60.5, 'concrete', [1, 0.5, 1], 0x263238);
    B(35.75, 8, -60.25, 'steel', [0.5, 2.5, 0.5], 0xeceff1);
    // Forecourt bollards (in-zone).
    for (const bx of [31, 33, 39, 41]) hkBollard(bx, -57);
  }

  // Cultural Centre: one windowless ribbed sweep, each rib ONE piece; abutting
  // same-height rib pairs are legal by the gap-zero rule.
  for (let i = 0; i < 16; i++) {
    B(46 + i, 0, -64, 'concrete', [1, 3 + Math.floor(i / 2), 6], Math.floor(i / 2) % 2 ? 0xe6c9c0 : 0xd7b9b0);
  }
  // Kowloon east waterfront hotels
  slabBlock(68, -64, 4, 18, 5, MIDTONES[0]);
  slabBlock(72, -64, 4, 15, 5, MIDTONES[1]);

  // TST promenade furniture (plaza z -52..-50, road is z -56..-52)
  for (const lx of [-60, -34, -8, 18, 44, 70]) hkLamp(lx, -51);
  for (const tx of [-20, -30]) hkTree(tx, -51);
  // Waterfront railing: posts only (a continuous top rail would span 4 m
  // against a 3 m steel maxSpan); alternating heights keep the sliver rule
  // off adjacent posts.
  for (let px = -75; px <= 75; px += 3) {
    B(px, 0, -50.5, 'steel', [0.25, (px / 3) % 2 === 0 ? 1.25 : 1, 0.25], 0x455a64);
  }
  // Avenue of Stars: a bronze figure and a run of hand-print plinths.
  B(25.5, 0, -52, 'steel', [1.5, 0.75, 1.5], 0x6d4c41);
  B(26, 0.75, -51.625, 'steel', [0.5, 1.75, 0.5], 0x8d6e63);
  for (const [pi, plx] of [4, 10, 16, 22].entries()) {
    B(plx, 0, -51.25, 'concrete', [0.75, pi % 2 ? 1.5 : 1.25, 0.75], 0x9e9e9e);
  }
  for (const bx of [-52, -44, 56, 64]) hkBench(bx, -51);
  hkPlanter(-14, -51.5); hkPlanter(12.5, -51.5);
  // Cultural Centre forecourt banner poles (alternating heights).
  for (let px = 47; px <= 61; px += 2) {
    B(px, 0, -57, 'steel', [0.25, px % 4 === 1 ? 4.5 : 4, 0.25], 0x37474f);
  }
  // TST Star Ferry pier: two deck slabs, mooring posts, ticket kiosk.
  B(56, 0, -49, 'concrete', [6, 1, 4], 0x5d4037);
  B(62, 0, -49, 'concrete', [6, 1, 4], 0x5d4037);
  for (const [mx, mz] of [[56.5, -48.75], [67.25, -48.75], [56.5, -46], [67.25, -46]]) {
    B(mx, 1, mz, 'steel', [0.25, 0.75, 0.25], 0x2f3640);
  }
  B(60, 1, -48.5, 'panel', [2.5, 1.5, 1.5], 0x1b5e20);
  B(59.75, 2.5, -48.75, 'concrete', [3, 0.5, 2], 0x2e7d32);

  // ------------------------------------------------------------
  // 1. VICTORIA HARBOUR (z -50..-16)
  // ------------------------------------------------------------
  // Central ferry pier: four abutting deck slabs, mooring posts on top.
  for (const [px, pz] of [[-8, -26], [-2, -26], [-8, -21], [-2, -21]]) {
    B(px, 0, pz, 'concrete', [6, 1, 5], 0x5d4037);
  }
  for (const [mx, mz] of [[-7.5, -25.5], [3, -25.5], [-7.5, -17], [3, -17]]) {
    B(mx, 1, mz, 'steel', [0.25, 0.75, 0.25], 0x2f3640);
  }
  // Star Ferries: green hull, white cabin, overhanging roof, black funnel.
  const starFerry = (x0, z0) => {
    B(x0, 0, z0, 'wood', [7, 1, 3], 0x1b5e20);
    B(x0 + 0.5, 1, z0 + 0.5, 'panel', [6, 1.5, 2], 0xf5f5f5);
    B(x0, 2.5, z0 + 0.25, 'steel', [7, 0.5, 2.5], 0x2e7d32);
    B(x0 + 3, 3, z0 + 1.25, 'steel', [0.5, 1.5, 0.5], 0x212121);
  };
  starFerry(-40, -46);
  starFerry(18, -32);
  // A junk: wood hull, three battened sails of distinct heights.
  B(-8, 0, -40, 'wood', [6, 1, 2.5], 0x4e342e);
  B(-7, 1, -39.25, 'panel', [1.5, 2.5, 0.25], 0x8d3b2e);
  B(-5, 1, -39.25, 'panel', [1.5, 3.5, 0.25], 0x9c4434);
  B(-3, 1, -39.25, 'panel', [1.5, 3, 0.25], 0x8d3b2e);
  // Sampans across the roads of the harbour.
  const sampan = (x, z) => {
    B(x, 0, z, 'wood', [2, 0.5, 1], 0x5d4037);
    B(x + 0.25, 0.5, z + 0.25, 'wood', [0.25, 0.75, 0.25], 0x3e2723);
    B(x + 1.5, 0.5, z + 0.25, 'wood', [0.25, 0.75, 0.25], 0x3e2723);
    B(x + 0.25, 1.25, z, 'panel', [1.5, 0.25, 1], 0xc9a25c);
  };
  for (const [sx, sz] of [[-60, -30], [-55, -25], [30, -45], [45, -25], [60, -40], [-40, -20], [-25, -44], [12, -35]]) sampan(sx, sz);
  // Wan Chai ferry pier: same four-slab deck as Central, its own ferry.
  for (const [px, pz] of [[28, -26], [34, -26], [28, -21], [34, -21]]) {
    B(px, 0, pz, 'concrete', [6, 1, 5], 0x5d4037);
  }
  for (const [mx, mz] of [[28.5, -25.5], [39, -25.5], [28.5, -17], [39, -17]]) {
    B(mx, 1, mz, 'steel', [0.25, 0.75, 0.25], 0x2f3640);
  }
  starFerry(44, -40);
  // Second junk, out toward Causeway Bay.
  B(50, 0, -36, 'wood', [6, 1, 2.5], 0x4e342e);
  B(51, 1, -35.25, 'panel', [1.5, 3, 0.25], 0x9c4434);
  B(53, 1, -35.25, 'panel', [1.5, 3.75, 0.25], 0x8d3b2e);
  B(55, 1, -35.25, 'panel', [1.5, 2.75, 0.25], 0x9c4434);
  // Channel buoys.
  for (const [bx, bz] of [[-70, -40], [-30, -35], [-15, -30], [10, -45], [40, -30], [65, -25], [-55, -45], [25, -25], [-5, -33], [55, -45]]) {
    B(bx, 0, bz, 'steel', [0.5, 0.75, 0.5], 0xc62828);
  }
  sampan(-72, -35); sampan(68, -35); sampan(0, -47);
  // Central pier ticket kiosk on the deck, gangways at both flanks.
  B(-6, 1, -25, 'panel', [2.5, 1.5, 1.5], 0x2e7d32);
  B(-6.25, 2.5, -25.25, 'concrete', [3, 0.5, 2], 0x1b5e20);
  B(-10, 0, -24, 'concrete', [2, 1, 3], 0x6d4c41);
  B(4, 0, -24, 'concrete', [2, 1, 3], 0x6d4c41);
  // Deck-edge railing posts on both piers.
  for (const [rx, rz] of [[-7, -16.5], [-3, -16.5], [1, -16.5], [29, -16.5], [33, -16.5], [37, -16.5]]) {
    B(rx, 1, rz, 'steel', [0.25, rx % 2 ? 1.25 : 1, 0.25], 0x455a64);
  }
  // Third junk and two more sampans out west.
  B(-45, 0, -38, 'wood', [6, 1, 2.5], 0x4e342e);
  B(-44, 1, -37.25, 'panel', [1.5, 2.75, 0.25], 0x8d3b2e);
  B(-42, 1, -37.25, 'panel', [1.5, 3.5, 0.25], 0x9c4434);
  B(-40, 1, -37.25, 'panel', [1.5, 3, 0.25], 0x8d3b2e);
  sampan(-68, -25); sampan(20, -42);

  // ------------------------------------------------------------
  // 2. CENTRAL–WAN CHAI PROMENADE (z -16..-11)
  // ------------------------------------------------------------
  for (const lx of [-70, -50, -30, -10, 10, 30, 50, 70]) hkLamp(lx, -13);
  for (const tx of [-65, -25, 25, 65, -45, 45, -5, 15, 55]) hkTree(tx, -14);
  for (let bx = -70; bx <= 70; bx += 14) hkBollard(bx, -11.5);
  for (const bx of [-58, -18, 38, 58]) hkBench(bx, -14.5);
  hkPlanter(-68, -15); hkPlanter(0, -15); hkPlanter(68, -15);
  // Harbour-edge railing posts (alternating heights, posts only — see the
  // TST railing note on rail spans).
  for (let px = -75; px <= 75; px += 3) {
    B(px, 0, -15.75, 'steel', [0.25, (px / 3) % 2 === 0 ? 1.25 : 1, 0.25], 0x455a64);
  }
  // Bus shelters on the Connaught sidewalk: back wall + half-seated roof
  // (50% bearing, the lab-proven overhang).
  for (const sx of [-34, 20]) { // clear of the 14 m bollard grid
    B(sx, 0, -11.5, 'panel', [3, 2.5, 0.25], 0x78909c);
    B(sx, 2.5, -11.75, 'concrete', [3, 0.5, 0.5], 0x546e7a);
  }

  // ------------------------------------------------------------
  // 3. THE SHORE WALL (z -6..22), west → east
  // ------------------------------------------------------------
  // Western Market (HISTORIC ZONE: 1 m brick grain, red brick with granite
  // bands, corner turrets) → peak 10 m (landmark 'westernmarket').
  {
    const RED = 0x9d4b3b;
    for (let course = 0; course < 7; course++) {
      const col = course === 2 || course === 5 ? GRANITE : RED;
      for (let gx = -76; gx < -66; gx += 1) {
        for (let gz = -2; gz < 6; gz += 1) {
          const edge = gx < -75.5 || gx > -67.5 || gz < -1.5 || gz > 4.5;
          if (!edge) continue;
          // south door: two bays, arch above stays
          if (course < 3 && gz > 4.5 && gx > -72.5 && gx < -70.5) continue;
          B(gx, course, gz, 'brick', 1, col);
        }
      }
    }
    B(-76, 7, -2, 'concrete', [10, 0.5, 4], 0x546e7a);
    B(-76, 7, 2, 'concrete', [10, 0.5, 4], 0x546e7a);
    for (const [tx, tz] of [[-76, -2], [-67, -2], [-76, 5], [-67, 5]]) {
      B(tx, 7.5, tz, 'brick', [1, 2, 1], RED);
      B(tx - 0.25, 9.5, tz - 0.25, 'concrete', [1.5, 0.5, 1.5], 0x455a64);
    }
    // Wet-market stalls on the setts outside the south door (in-zone).
    for (const [si, sx] of [-75, -71.5, -68].entries()) {
      B(sx, 0, 6.5, 'wood', [1.5, 1, 0.75], 0x6d4c41);
      B(sx + 0.25, 1, 6.75, 'wood', [0.75, si % 2 ? 0.5 : 0.75, 0.5], 0x8d6e63);
    }
  }

  // One IFC — shaft 28 m + rooftop plant → peak 30.5 (landmark 'ifc1').
  {
    const y = shellTier(-58, -4, 8, 8, 0, 4, 7, CREAM, RIB, 3, 0xd9d4c8);
    B(-56, y, -2, 'concrete', [4, 2, 3], 0xcfc9bb);
  }
  // Two IFC — 48 m ribbed shaft, crown tier, eight claw fins → peak 61
  // (landmark 'ifc2').
  {
    let y = shellTier(-46, -4, 10, 10, 0, 6, 8, CREAM, RIB, 4, 0xd9d4c8);
    y = shellTier(-45, -3, 8, 8, y, 1, 8, RIB, CREAM, 2, 0xd9d4c8);
    for (const [fx, fz] of [[-45, -3], [-41.25, -3], [-37.5, -3], [-45, 0.75], [-37.5, 0.75], [-45, 4.5], [-41.25, 4.5], [-37.5, 4.5]]) {
      B(fx, y, fz, 'steel', [0.5, 4, 0.5], 0xe4dfd3);
    }
    capCorners(-46, -4, 10, 10, 48.5, 4, 0xdcd6ca);
  }
  // Exchange Square — the real complex is twins over a shared podium.
  shellTier(-33, -4, 7, 7, 0, 3, 8, 0xd8b8ae, 0xc9a599, 2, 0xd0afa2);
  shellTier(-33, 5, 7, 7, 0, 3, 8, 0xc9a599, 0xd8b8ae, 2, 0xc4a396); // cap tint differs from twin's: identical caps 2 m apart would be a sliver pair
  B(-32.5, 0, 3, 'concrete', [6, 4, 2], 0xc7a79b);
  // Jardine House — TEXTURE PROTOTYPE (the low-poly doctrine's flagship):
  // the 192-piece band assembly (spandrels, piers, 72 glass portholes) is now
  // four full-height shell walls carrying 'mat_hk_porthole' — one round
  // window per metre-tile, so an 8x24 face reads the real 8x24 porthole grid.
  // Silhouette stays geometric: hollow shell + core + cap + plant, peak 26
  // (landmark 'jardine'); the voids gate still sees a thin skin on a small
  // core. Wall tints differ per axis pair so no identical-piece sliver forms.
  {
    B(-22, 0, -2, 'panel', [8, 24, 0.5], 0xe6e2d8, 'mat_hk_porthole');
    B(-22, 0, 5.5, 'panel', [8, 24, 0.5], 0xd8d2c6, 'mat_hk_porthole');
    B(-22, 0, -1.5, 'panel', [0.5, 24, 7], 0xe2ddd2, 'mat_hk_porthole');
    B(-14.5, 0, -1.5, 'panel', [0.5, 24, 7], 0xdcd6ca, 'mat_hk_porthole');
    B(-19.5, 0, 0.5, 'concrete', [3, 24, 3], 0x455a64);
    B(-22, 24, -2, 'concrete', [8, 0.5, 8], 0xd9d4c8);
    B(-19.5, 24.5, 1, 'concrete', [3, 1.5, 2], 0x4a5560);
  }
  // Statue Square — the spawn plaza (SOLO_SPAWN is (0,16); everything below
  // stays >= 4 m clear of it, wider than the validator's 2 m keep-out).
  hkLamp(-5, -2); hkLamp(8, -2);
  hkLamp(-5, 20); hkLamp(8, 20);
  hkBench(-4, 8); hkBench(7, 8);
  hkPlanter(-5, 12); hkPlanter(7, 12);
  hkTree(-5, 4); hkTree(7, 4);
  // The Cenotaph-side fountain — 4 m clear of SOLO_SPAWN (0,16).
  B(0, 0, 9, 'concrete', [3, 1, 3], 0x8fa2ad);
  B(1.25, 1, 10.25, 'steel', [0.5, 1.5, 0.5], 0x78909c);
  for (const bx of [-4, 0, 4, 8]) hkBollard(bx, -5.5);
  for (const [fi, fx] of [-4, -2, 0].entries()) {
    B(fx, 0, 0, 'steel', [0.25, 5 + fi * 0.5, 0.25], 0x90a4ae); // flag poles
  }
  // Shore-band street trees between the towers.
  for (const [tx, tz] of [[-25, 18], [-10, 19], [12, 19], [30, 19], [46.5, 19], [60, 19]]) hkTree(tx, tz);
  // Pedder Street / Arsenal Street lamps (plaza segments only — the corridor
  // crosses Queen's Road at z 22..27).
  for (const lz of [10, 18, 30, 38]) { hkLamp(-52.5, lz); hkLamp(45.5, lz); }
  // The Center — 40 m neon-banded shaft, crown tier, four fins → peak 52
  // (landmark 'thecenter').
  {
    let y = shellTier(14, -2, 12, 12, 0, 5, 8, 0x8e24aa, 0x00acc1, 4, 0x7b8794);
    y = shellTier(16, 0, 8, 8, y, 1, 8, 0x00acc1, 0x8e24aa, 2, 0x7b8794);
    for (const [fx, fz] of [[16, 0], [23.5, 0], [16, 7.5], [23.5, 7.5]]) {
      B(fx, y, fz, 'steel', [0.5, 3, 0.5], 0xb39ddb);
    }
    capCorners(14, -2, 12, 12, 40.5, 4, 0x9d7bb8);
  }
  // (The graded "curtain-wall mullion fin" ground columns that stood here in
  // front of 2 IFC, The Center and Central Plaza are gone — same "weird
  // pillars" read Nico rejected on finRow. Mullions are texture work now.)
  // Shore-wall infill east of The Center
  // TEXTURE PROTOTYPE (Nico, 2026-08-25): window-grid facade on the shaft —
  // one 'metre' tile per map unit, so a 16 m shaft reads 16 window courses.
  slabBlock(28, -2, 6, 16, 5, MIDTONES[2], true, 'mat_hk_grid');
  shopfront(29, -2.75, 4);
  // Central Plaza — 40 m shaft, crown tier, stepped apex, 8 m spire →
  // peak 58.5 (landmark 'centralplaza').
  {
    let y = shellTier(46, -4, 12, 12, 0, 5, 8, 0xc9b458, 0x9fb0c0, 4, 0xb0a26a);
    y = shellTier(48, -2, 8, 8, y, 1, 8, 0x9fb0c0, 0xc9b458, 2, 0xb0a26a);
    B(50.5, y, 0.5, 'concrete', [3, 1.5, 3], 0x8d99ae);
    B(51.75, y + 1.5, 1.75, 'steel', [0.5, 8, 0.5], 0xd8dee6);
    capCorners(46, -4, 12, 12, 40.5, 4, 0xb5a86e);
  }
  // Causeway Bay infill
  // TEXTURE PROTOTYPE: signage-band shaft. The tile only DARKENS, so the
  // "neon" is saturated paint burning through the bright core of the board —
  // a muted paint here reads as a shadow, not a sign.
  slabBlock(62, -2, 6, 18, 5, 0xe8517a, true, 'mat_hk_neon');
  shopfront(63, -2.75, 4);
  slabBlock(70, -2, 6, 15, 5, MIDTONES[4]);
  shopfront(71, -2.75, 4);
  slabBlock(64, 6, 6, 12, 4, MIDTONES[5]);

  // ------------------------------------------------------------
  // 4. THE CANYON (z 27..46), west → east
  // ------------------------------------------------------------
  // Man Mo Temple (HISTORIC ZONE: 1 m brick grain, granite walls, tiered
  // green tile roof, incense court) → peak 5.5 (landmark 'manmo').
  {
    const STONE = 0x9e9484;
    for (let course = 0; course < 4; course++) {
      for (let gx = -74; gx < -64; gx += 1) {
        for (let gz = 30; gz < 38; gz += 1) {
          const edge = gx < -73.5 || gx > -65.5 || gz < 30.5 || gz > 36.5;
          if (!edge) continue;
          if (course < 3 && gz > 36.5 && gx > -70.5 && gx < -68.5) continue; // temple doors
          B(gx, course, gz, 'brick', 1, STONE);
        }
      }
    }
    B(-74.5, 4, 29.75, 'concrete', [11, 0.5, 4.25], 0x2e7d32);
    B(-74.5, 4, 34, 'concrete', [11, 0.5, 4.25], 0x2e7d32);
    B(-72, 4.5, 33, 'concrete', [6, 1, 2], 0x1b5e20);
    B(-71, 0, 39, 'steel', [0.5, 1.5, 0.5], 0x8d6e3a); // incense brazier
    B(-68, 0, 39, 'steel', [0.5, 1.5, 0.5], 0x8d6e3a);
    B(-74, 0, 39, 'steel', [0.5, 1.25, 0.5], 0x7a5e33);
    B(-65, 0, 39, 'steel', [0.5, 1.25, 0.5], 0x7a5e33);
    // Guardian lions flanking the doors.
    B(-70.75, 0, 40.5, 'concrete', [0.75, 1.25, 0.75], 0x8f8574);
    B(-68.75, 0, 40.5, 'concrete', [0.75, 1.25, 0.75], 0x8f8574);
  }
  // Mid-Levels infill west of the banks
  slabBlock(-60, 28, 6, 22, 5, MIDTONES[0]);
  shopfront(-59, 27.25, 4);
  slabBlock(-60, 36, 5, 17, 4, MIDTONES[1]);
  slabBlock(-44, 28, 6, 24, 5, MIDTONES[2]);
  shopfront(-43, 27.25, 4);
  slabBlock(-36, 30, 5, 20, 4, MIDTONES[3]);
  // One more canyon mid-rise between the Mid-Levels wall and HSBC.
  slabBlock(-30, 30, 5, 26, 5, MIDTONES[4]);
  // HSBC Main Building — the expressed frame: 3x3 column grid per storey
  // (colour alternates per storey, the Lab-doctrine answer to the sliver
  // probe), two 5 m floor plates per level, glass-look panels on the long
  // faces from level 2 up, four corner masts. The ground floor is OPEN — the
  // walk-under plaza is the landmark's declared void. Peak 28 ('hsbc').
  {
    const colX = [-24, -19.25, -14.5], colZ = [28, 33.5, 39.25];
    for (let lvl = 0; lvl < 6; lvl++) {
      const y = lvl * 4;
      const cc = lvl % 2 === 0 ? HSBC_DARK : 0x46535c;
      for (const cx of colX) for (const cz of colZ) {
        B(cx, y, cz, 'steel', [0.75, 3.5, 0.75], cc);
      }
      const pc = lvl % 2 === 0 ? HSBC_GREY : 0x8b969e;
      B(-24, y + 3.5, 28, 'concrete', [5, 0.5, 12], pc);
      B(-19, y + 3.5, 28, 'concrete', [5, 0.5, 12], pc);
      if (lvl > 0) {
        const gc = lvl % 2 === 0 ? 0x7fa8bf : 0x6c98b0;
        B(-24, y, 28.75, 'panel', [10, 3.5, 0.25], gc);
        B(-24, y, 39, 'panel', [10, 3.5, 0.25], gc);
      }
    }
    for (const [mx, mz] of [[-24, 28], [-14.5, 28], [-24, 39.25], [-14.5, 39.25]]) {
      B(mx, 24, mz, 'steel', [0.75, 4, 0.75], 0x37424a);
    }
    // HSBC's famous exterior X-trusses, proud of the south frame.
    chevronX(-23.75, -15, 27.75, 24, 0xcfd8dd);
  }
  // Bank of China Tower — four hollow prisms stepping 24/32/40/48 m, the
  // diagonal-braced look carried by alternating white/blue bands (stepped
  // boxes only, per the map brief — no diagonal geometry exists). Twin masts
  // on the tallest prism → peak 54.5 (landmark 'boc').
  {
    // Band parity flips per quarter so the z-neighbour rings never present
    // identical same-colour sheets one metre apart (the sliver rule).
    const q = (qx, qz, bands, flip) => (flip
      ? shellTier(qx, qz, 6, 6, 0, bands, 8, BOC_BLUE, BOC_WHITE, 2.5, 0x2c4a6e)
      : shellTier(qx, qz, 6, 6, 0, bands, 8, BOC_WHITE, BOC_BLUE, 2.5, 0x2c4a6e));
    q(-8, 28, 4, false);  // SW 32 m
    q(-2, 28, 6, true);   // SE 48 m — the surviving prism
    q(-8, 34, 3, true);   // NW 24 m
    q(-2, 34, 5, false);  // NE 40 m
    B(0, 48.5, 30, 'steel', [0.5, 6, 0.5], 0xd6e2ea);
    B(1.5, 48.5, 31.5, 'steel', [0.5, 6, 0.5], 0xd6e2ea);
    chevronX(-7.75, -2.25, 27.75, 32, 0xeceff1);  // SW south face
    chevronX(-1.75, 3.75, 27.75, 48, 0xe3ecf5);   // SE south face
    chevronZ(28.25, 33.75, 4, 48, 0xdde7f0);      // SE east face
    chevronZ(34.25, 39.75, 4, 40, 0xd4e0ec);      // NE east face
    chevronZ(28.25, 33.75, -8.25, 32, 0xdde7f0);  // SW west face
    chevronZ(34.25, 39.75, -8.25, 24, 0xd4e0ec);  // NW west face
  }
  // Lippo Centre — two towers, the koala-pod rhythm as two-tone banding.
  // Peak 30 over the pair's shared foot (landmark 'lippo').
  {
    // The koala pods are REAL protrusions now: full 9.5 m floor plates that
    // overhang the 8 m shaft between ring segments. Each plate is carried by
    // the ring + core below it and carries the next segment — the same
    // cap-slab load path shellTier already uses. Segment cores are separate
    // pieces because a full-height core would collide with the plates.
    const lippoTower = (ox, oz, segs, colA, colB, podC) => {
      let y = 0;
      for (let s = 0; s < segs.length; s++) {
        const [bands, bh] = segs[s];
        for (let i = 0; i < bands; i++) ringBand(ox, oz, 8, 8, y + i * bh, bh, (s + i) % 2 === 0 ? colA : colB);
        const H = bands * bh;
        B(ox + 2.5, y, oz + 2.5, 'concrete', [3, H, 3], s % 2 === 0 ? 0x2c3e50 : 0x34495e);
        y += H;
        if (s < segs.length - 1) {
          B(ox - 0.75, y, oz - 0.75, 'concrete', [9.5, 1, 9.5], podC); // pod plate
          y += 1;
        }
      }
      B(ox, y, oz, 'concrete', [8, 0.5, 8], 0x27577f);
      return y + 0.5;
    };
    const yA = lippoTower(8, 28, [[1, 6.5], [1, 6.5], [2, 6.5]], LIPPO_A, LIPPO_B, 0x27577f);
    B(10.5, yA, 31, 'concrete', [3, 1.5, 2], 0x1f3f66); // peak 30 exactly
    const yB = lippoTower(20, 28, [[1, 6.5], [2, 6.5]], LIPPO_B, LIPPO_A, 0x1f4a72);
    B(22.5, yB, 31, 'concrete', [3, 1.5, 2], 0x1f3f66);
  }
  // Two Pacific Place — slender 32 m shaft, rooftop fin → peak 34.5
  // (landmark 'twopacific').
  {
    const y = shellTier(32, 28, 6, 10, 0, 4, 8, 0x7f9bb3, 0x6d8aa3, 2, 0x5f7d96);
    B(33, y, 32.75, 'concrete', [4, 2, 0.5], 0x54718a);
  }
  // Hong Kong Park (decor rect above) — trees and a pavilion-scale planter
  hkTree(48, 32); hkTree(54, 38);
  hkTree(46, 36); hkTree(51, 42); hkTree(56, 31); hkTree(49, 29);
  hkBench(47, 40); hkPlanter(52, 30);
  hkBench(53, 34); hkPlanter(45, 42);
  // Stone lanterns along the park path.
  for (const [lx, lz] of [[50, 33], [52, 36], [55, 41]]) {
    B(lx, 0, lz, 'concrete', [0.5, 1, 0.5], 0x8d8d84);
    B(lx - 0.25, 1, lz - 0.25, 'concrete', [1, 0.5, 1], 0x76766e);
  }
  // Hopewell Centre — a proper CYLINDRICAL shell now: each 8 m band is an
  // octagon (four faces + stepped chamfer corners), stacked in plan so every
  // course bears fully on the one below. Drum on top → peak 34.5
  // (landmark 'hopewell').
  {
    for (let b = 0; b < 4; b++) {
      const y = b * 8;
      const col = b % 2 === 0 ? 0xbfc5c9 : 0xa9b1b6;
      B(62, y, 30, 'panel', [6, 8, 0.5], col);          // N face
      B(62, y, 39.5, 'panel', [6, 8, 0.5], col);        // S face
      B(60, y, 32, 'panel', [0.5, 8, 6], col);          // W face
      B(69.5, y, 32, 'panel', [0.5, 8, 6], col);        // E face
      const cc = b % 2 === 0 ? 0xb3bac0 : 0x9da6ac;
      // stepped chamfers: two offset pieces per corner read as the 45° cut
      B(61, y, 30.5, 'panel', [1, 8, 0.5], cc);  B(60.5, y, 31, 'panel', [0.5, 8, 1], cc);   // NW
      B(68, y, 30.5, 'panel', [1, 8, 0.5], cc);  B(69, y, 31, 'panel', [0.5, 8, 1], cc);     // NE
      B(61, y, 39, 'panel', [1, 8, 0.5], cc);    B(60.5, y, 38, 'panel', [0.5, 8, 1], cc);   // SW
      B(68, y, 39, 'panel', [1, 8, 0.5], cc);    B(69, y, 38, 'panel', [0.5, 8, 1], cc);     // SE
    }
    B(63, 0, 33, 'concrete', [4, 32, 4], 0x8e969c);
    B(60, 32, 30, 'concrete', [10, 0.5, 10], 0x99a1a7);
    B(63, 32.5, 33, 'concrete', [4, 2, 4], 0x848c92);
  }
  slabBlock(72, 28, 4, 14, 5, MIDTONES[4]);
  // Canyon plaza lamps and trees along the Hennessy edge
  for (const lx of [-52, -20, 10, 50]) hkLamp(lx, 44);
  for (const tx of [-56, -40, -20, 6, 30, 36]) hkTree(tx, 42); // -56: clear of Pedder St (x -50..-46 runs to z 46)
  // Hennessy bus shelters (same half-seated roof as Connaught's).
  for (const sx of [-10, 34]) {
    B(sx, 0, 45.25, 'panel', [3, 2.5, 0.25], 0x78909c);
    B(sx, 2.5, 45, 'concrete', [3, 0.5, 0.5], 0x546e7a);
  }

  // ------------------------------------------------------------
  // 5. THE ESTATE WALL (z 51..64) — the residential backdrop, 2 pieces each
  // ------------------------------------------------------------
  {
    const h1 = [16, 20, 14, 24, 18, 22, 15, 26, 17, 21, 19, 25, 23, 27];
    for (let i = 0; i < 14; i++) {
      const ox = -64 + i * 10;
      slabBlock(ox, 52, 5, h1[i], 4, PASTELS[i % PASTELS.length]);
      shopfront(ox + 1, 51, 3, i % 2 ? 0x8fb8d0 : 0x9fc4d8);
      B(ox + 1.25, h1[i] + 1.5, 54.5, 'concrete', [1.5, 0.75, 1], 0x607d8b); // water tank
      // podium link between neighbouring towers (gap equals its own extent,
      // so the identical-piece rule passes by the >= rule)
      if (i < 13) B(ox + 5, 0, 52.5, 'concrete', [5, 2.5, 3], 0x8a9096);
    }
    const h2 = [18, 28, 21, 30, 19, 27, 16, 29, 22, 31, 20, 26, 24, 32];
    for (let i = 0; i < 14; i++) {
      const ox = -59 + i * 10;
      slabBlock(ox, 58, 5, h2[i], 4, PASTELS[(i + 3) % PASTELS.length]);
      shopfront(ox + 1, 57.75, 3, i % 2 ? 0x9fc4d8 : 0x8fb8d0);
      B(ox + 1.25, h2[i] + 1.5, 60.5, 'concrete', [1.5, 0.75, 1], 0x607d8b);
      if (i < 13) B(ox + 5, 0, 58.5, 'concrete', [5, 2.5, 3], 0x848a90);
    }
    for (const lx of [-60, -34, -8, 18, 44, 70]) hkLamp(lx, 57);
    for (const tx of [-57, -37, -17, 3, 23, 39, 63]) hkTree(tx, 56.75);
  }

  // ------------------------------------------------------------
  // 6. TRAFFIC — built from the exported table the validator reads as its
  //    road-conflict allowlist, so the two cannot drift apart.
  // ------------------------------------------------------------
  for (const v of HONGKONG2_VEHICLES) veh(v);

  sim.cameraBlockers = generateBlockers(sim, 6);

  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };

  // Arms the tier-2 texture-array path (voxelworld.js builds `arrayMat` only
  // when this object exists). Deliberately EMPTY: this scene surfaces blocks
  // per-piece via B()'s 7th argument, never by matType, so a plain concrete
  // kerb stays untextured while a named facade gets its grid.
  sim.sceneSurfaces = {};
}
