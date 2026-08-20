// Singapore Marina Bay — Sandbox Scene.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Uses canonical builders from js/voxelkit.js.
//
// Geography, west to east across the bay:
//   Raffles Place is the CBD wall on the WEST bank, with Merlion Park at its
//   water's edge facing east. The bay itself is open water in the middle.
//   Marina Bay Sands stands on the EAST bank, its three tripartite towers
//   carrying the SkyPark, with the Singapore Flyer beyond it. South of the bay,
//   Gardens by the Bay: the Supertree Grove and the two biome domes. The Helix
//   Bridge crosses the bay's north neck, with the ArtScience Museum at its
//   eastern landing and the Esplanade theatres on the northern shore.
//
// SUPPORT IS THE BINDING CONSTRAINT, not the block budget. Support never flows
// downward in this sim and horizontal cantilever is capped at the material's
// maxSpan (concrete/steel/panel 3 m, brick/wood 2 m, glass/leaf 1 m). Three
// consequences run through everything below:
//   - The SkyPark's towers sit 1 m apart, not the real building's 38 m.
//   - Every curved shell (biome domes, Esplanade) puts STEEL in the cells that
//     overhang and glass only where the cell rests on the course beneath it.
//   - A diagonal staircase is not a support path: two cells touching at an edge
//     share no face, so every leaning form here is a solid fin, not a stair.

import {
  bench, bollard, boxVan, ferrisWheel, generateBlockers, lampPost, marketStall,
  mooringBollard, motorLaunch, pathRibbon, planter, sedan, signText, tower, tree,
  treeGrove, trashBin, zebra,
} from './voxelkit.js';

export { vehicleBBox } from './voxelkit.js';

export const SINGAPORE_VEHICLES = [
  // Raffles Quay (west bank, north-south)
  { kind: 'sedan', x: -36, z: -4, axis: 'z', color: 0x1c6ea4 },
  { kind: 'sedan', x: -36, z: 14, axis: 'z', color: 0xe8ecf2 },
  { kind: 'boxVan', x: -36, z: 22, axis: 'z', len: 5, color: 0xe8ecf2, color2: 0x00b4d8 },
  // Bayfront Avenue (east bank, north-south behind the Sands)
  { kind: 'sedan', x: 38, z: 2, axis: 'z', color: 0xc9302c },
  { kind: 'sedan', x: 38, z: 10, axis: 'z', color: 0x2a3440 },
];

export const SINGAPORE_ROAD_SPANS = [];
export const SINGAPORE_OPEN_GROUND = [];

export const SINGAPORE_STREETS = [
  { x: -38, z: -20, w: 4, d: 46, axis: 'z' },   // Raffles Quay / Shenton Way
  { x: 36, z: -2, w: 4, d: 16, axis: 'z' },     // Bayfront Avenue
];

export const SINGAPORE_CROSSINGS = [
  [0, -12], [0, 4], [0, 20],
  [1, 2], [1, 11],
];

// Mirrors the `blocks` field of the CITY_CATALOG entry for scene 'singapore'.
// It is duplicated rather than imported so the scene stays a leaf module with no
// dependency on the catalog; tools/validate-singapore.mjs asserts the two agree.
const TARGET_BLOCKS = 22000;

export function buildSingapore(sim) {
  sim.bounds = 90;
  sim.boundsRect = { minX: -52, maxX: 54, minZ: -40, maxZ: 46 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);

  // Decor accumulators
  const parks = [], plaza = [], sidewalks = [], roads = [];
  const water = [], boardwalk = [], cobbles = [];

  // ============================================================ DISTRICT SURFACES
  // The bay's south shore is at z 14, not z 20, because every scene in this
  // engine spawns its hole at a hard-coded (0, 16) — js/voxelsim.js:844 — and
  // that has to be solid promenade the player can stand on, not open water with
  // a revetment under it. The bay is 40 x 28.
  water.push({ x: -18, z: -14, w: 40, d: 28, color: 0x1a5a72 });   // Marina Bay

  plaza.push(
    { x: -50, z: -24, w: 32, d: 60, color: 0x8e8a82 },   // Raffles Place / CBD apron
    // Starts at the water's east edge, not 4 m inside it: water draws OVER
    // plaza, so the overlap was 4 m of apron that never rendered.
    { x: 22, z: -20, w: 32, d: 40, color: 0xd6d2c8 },    // Bayfront / Sands apron
    { x: -20, z: -34, w: 40, d: 18, color: 0xc8c4ba },   // Esplanade forecourt
  );

  parks.push(
    { x: 14, z: 20, w: 34, d: 22, color: 0x2f6636 },     // Supertree Grove ground
    { x: -26, z: 24, w: 40, d: 20, color: 0x2f6636 },    // Gardens by the Bay west
    { x: -52, z: 29, w: 14, d: 13, color: 0x2f6636 },    // Telok Ayer green
  );

  boardwalk.push(
    { x: -32, z: -18, w: 14, d: 16, color: 0x9a7048 },   // Merlion Park deck
    { x: -18, z: 14, w: 36, d: 10, color: 0x9a7048 },    // south bay promenade
  );

  cobbles.push({ x: -50, z: 6, w: 12, d: 12, color: 0x6a6560 });   // Telok Ayer lane

  // ---------------------------------------------------------------- shell helper
  // One routine for every domed shell in the scene, in two passes: pass 1 decides
  // WHICH cells exist, pass 2 decides what each one is MADE of. They have to be
  // separate, because a cell's material depends on whether anything ends up
  // resting on it, which is not known while the cells are still being emitted.
  //
  // GLASS CANNOT CARRY. The solver (js/voxelsim.js, `_recalcSupport`) passes
  // support along an edge only when the *outgoing* block's bond clears
  // BOND_CARRY = 0.5. Glass is vertBond 0.40 / horizBond 0.30, so both are under
  // it: a glass cell can RECEIVE support and can never PASS it on. That single
  // fact is why the first two domes collapsed from y=1 upward while every span
  // sat comfortably inside its material's maxSpan — the load path ran through
  // the panes, and a diagonal steel rib (`(dx + dz + y) % 3`) shares no FACE with
  // the rib cell above it, so there was no continuous carrying path to the
  // ground anywhere in the shell. Hence: glass goes only where nothing rests on
  // it, and always within one metre of a carrying cell, which is exactly glass's
  // own maxSpan of 1.
  //
  // THICKNESS IS DERIVED, NOT FIXED. A course that steps inward by more than the
  // band is thick lands none of the next course on itself. `r - rNext + 1`
  // guarantees a full metre of vertical overlap all the way to the crown; the
  // 3 m floor is what closes the inward cantilever, and `solidAt` collapses the
  // last courses to solid discs so the crown closes rather than ringing a hole.
  // Both numbers are the cheapest values that produce zero falling blocks — at
  // 1.5 m the same shell sheds 272.
  const domeShell = (cx, cz, R, o) => {
    const {
      fillColor = 0x9fd8c8, paneColor = 0xbfe8dc, ribColor = 0x8a9098,
      rib = 4, minThick = 3, solidAt = 3, spike = null,
    } = o;
    const rad = (y) => Math.sqrt(Math.max(0, R * R - y * y));
    const key = (dx, y, dz) => `${dx},${y},${dz}`;
    const cells = new Set();
    for (let y = 0; y <= R; y++) {
      const r = rad(y);
      if (r < 1) break;
      const thick = Math.max(minThick, r - rad(y + 1) + 1);
      const inner = thick > solidAt ? 0 : Math.max(0, r - thick);
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = Math.hypot(dx + 0.5, dz + 0.5);
          if (d > r || d < inner) continue;
          cells.add(key(dx, y, dz));
        }
      }
    }
    // A cell carries iff something sits directly on it. Everything else is a
    // candidate pane, taken only when a carrier is one face away.
    const carries = new Set();
    for (const k of cells) {
      const [dx, y, dz] = k.split(',').map(Number);
      if (cells.has(key(dx, y + 1, dz))) carries.add(k);
    }
    const placed = new Set(), panes = new Set();
    for (const k of cells) {
      const [dx, y, dz] = k.split(',').map(Number);
      const pane = !carries.has(k) && (
        carries.has(key(dx - 1, y, dz)) || carries.has(key(dx + 1, y, dz))
        || carries.has(key(dx, y, dz - 1)) || carries.has(key(dx, y, dz + 1)));
      if (pane) { B(cx + dx, y, cz + dz, 'glass', 1, paneColor); panes.add(k); }
      else if ((dx + dz + y) % rib === 0) B(cx + dx, y, cz + dz, 'steel', 1, ribColor);
      else B(cx + dx, y, cz + dz, 'panel', 1, fillColor);
      placed.add(k);
    }
    // Sunshade fins stand ON the shell. Two cells are ineligible to carry one:
    // a cell the shell's own next course already occupies (that is an overlap,
    // not a fin, and it is exactly what a naive `y + 1` targets), and a PANE,
    // which by construction is the one material here that cannot hold anything
    // up. Fins over panes are what the first pass of this shed.
    if (spike) {
      for (const k of [...placed]) {
        const [dx, y, dz] = k.split(',').map(Number);
        if (y < 2 || (dx + dz + y) % 3 !== 0) continue;
        if (panes.has(k) || placed.has(`${dx},${y + 1},${dz}`)) continue;
        B(cx + dx, y + 1, cz + dz, 'steel', 1, spike);
        placed.add(`${dx},${y + 1},${dz}`);
      }
    }
  };

  // ============================================================ 1. MARINA BAY SANDS
  // Tower spacing is set by the DECK, not by the elevation: at 3 m gaps the deck
  // cells sitting in a gap and outboard of the shafts had to reach support three
  // hops away — exactly concrete's limit — and fell. 7 m deep towers on this
  // pitch leave 1 m gaps instead.
  const SANDS_TOWERS = [-12, -4, 4];
  for (const tz of SANDS_TOWERS) {
    tower(sim, 26, tz, 8, 7, 0, 39, 'curtain');
    // Solid roof plate, flared 2 m past the shaft each side. `tower` lays a full
    // slab only every 4th course, so its TOP course is a hollow perimeter ring —
    // a deck dropped onto that spans the tower's own void. The flare also puts
    // the deck's outboard strips on plate instead of reaching the shaft
    // diagonally, which is not a support path at all.
    BOX(24, 39, tz, 12, 1, 7, 'concrete', 1, 0xb4ada2);
  }

  // SkyPark deck (y 40..41), overhanging 3 m past the outer towers.
  BOX(24, 40, -15, 12, 1, 29, 'concrete', 1, 0xbfb8ac);
  for (let z = -15; z < 14; z++) {
    B(24, 41, z, 'panel', 1, 0x3d4450);      // hull-line fascia, west
    B(35, 41, z, 'panel', 1, 0x3d4450);      // hull-line fascia, east
  }
  BOX(26, 41, -10, 4, 1, 20, 'glass', 1, 0x37b6c9);           // infinity pool
  for (let z = -10; z < 10; z++) B(25, 41, z, 'panel', 1, 0xe4dfd4);  // pool lip
  BOX(31, 41, -12, 3, 1, 21, 'leaf', 1, 0x3f7f43);            // garden strip
  BOX(30, 41, 10, 5, 1, 3, 'panel', 1, 0xd8d2c6);             // observation nose
  for (const px of [30, 32, 34]) {
    B(px, 42, 11, 'steel', 1, 0x4a525c);                      // crown palms, stood
    B(px, 43, 11, 'leaf', 1, 0x468a4a);                       // on the nose plate
  }
  // Sign stands ON the deck. A free-standing sign has no support path — the
  // glyph strokes are islands — so its bottom row must rest on something.
  signText(sim, 'SANDS', 26, 41, -14.5, { px: 0.25, scale: 1, color: 0xffffff, rail: 0x2a3440, dir: 1 });

  // The Shoppes podium the towers rise out of.
  BOX(18, 0, -14, 8, 6, 28, 'concrete', 1, 0x9a938a);
  for (let z = -14; z < 14; z++) {
    for (let y = 2; y < 5; y++) {
      if ((z + y) % 3 === 0) continue;
      B(17, y, z, 'glass', 1, 0x9fd8e8);                      // podium glazing band
    }
  }

  // ============================================================ 2. SINGAPORE FLYER
  ferrisWheel(sim, 45, -8, 8, { cabins: 12, cabinColor: 0xe8ecf2, rimColor: 0x8a9298 });

  // ============================================================ 3. ARTSCIENCE MUSEUM
  // The lotus: eight petals splaying from a low bowl. Each petal is a SOLID FIN
  // that grows one cell per course, not a diagonal run of single cells — a
  // staircase of corner-touching voxels shares no faces and has no support path,
  // which is why the first version of this rained into the bay.
  {
    const cx = 14, cz = -24;
    BOX(cx - 3, 0, cz - 3, 6, 2, 6, 'concrete', 1, 0xe4e0d6);
    const petals = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const lotus = new Set();
    for (const [sx, sz] of petals) {
      for (let t = 0; t < 5; t++) {
        for (let d = 1; d <= t + 1; d++) {
          // A DIAGONAL petal steps in x and z at once, so consecutive cells meet
          // at an edge and share no face — the same staircase trap as before,
          // moved from elevation into plan. The elbow cell fills the corner so
          // the run is face-connected the whole way out.
          const run = sx && sz ? [[sx * d, sz * (d - 1)], [sx * d, sz * d]] : [[sx * d, sz * d]];
          for (const [ox, oz] of run) {
            const px = cx + ox, pz = cz + oz;
            const k = `${px},${2 + t},${pz}`;
            if (lotus.has(k)) continue;
            lotus.add(k);
            B(px, 2 + t, pz, t >= 3 ? 'panel' : 'concrete', 1, t >= 3 ? 0xf4f1e8 : 0xe8e4da);
          }
        }
      }
    }
  }

  // ============================================================ 4. SUPERTREE GROVE
  const supertree = (cx, cz, h, bloom) => {
    // Trunk stops 2 courses short of h: the crown's lowest disc lands at h-2 and
    // a trunk run to h-1 would put steel and crown panel in the same cells.
    for (let y = 0; y < h - 2; y++) {
      B(cx, y, cz, 'steel', 1, 0x6a5f52);
      B(cx + 1, y, cz, 'steel', 1, 0x6a5f52);
      B(cx, y, cz + 1, 'steel', 1, 0x6a5f52);
      B(cx + 1, y, cz + 1, 'steel', 1, 0x6a5f52);
      // Vertical-garden panels, CONTIGUOUS from y=2 rather than every other
      // course: leaf spans 1 m horizontally, so a floating band has nothing
      // holding it, while a stack rests on itself and support is free.
      if (y >= 2) {
        B(cx - 1, y, cz, 'leaf', 1, y % 2 ? 0x3f8a44 : 0x4a9a4f);
        B(cx + 2, y, cz + 1, 'leaf', 1, y % 2 ? 0x4a9a4f : 0x3f8a44);
      }
    }
    // Crown: three SOLID stepped discs growing 1 m per course. Solid, not
    // annular — an annulus leaves a hole exactly over the trunk, so the ring it
    // should rest on is not there. The top disc is panel with the leaf canopy
    // laid ON it, because leaf carried horizontally would be at its 1 m limit.
    for (const [ry, r, mat, col] of [[h - 2, 2, 'panel', 0x7a6a58], [h - 1, 3, 'panel', 0x8a7a66], [h, 4, 'panel', 0x8a7a66]]) {
      for (let dx = -r + 1; dx <= r; dx++) {
        for (let dz = -r + 1; dz <= r; dz++) {
          if (Math.hypot(dx - 0.5, dz - 0.5) > r) continue;
          B(cx + dx, ry, cz + dz, mat, 1, col);
        }
      }
    }
    for (let dx = -3; dx <= 4; dx++) {
      for (let dz = -3; dz <= 4; dz++) {
        if (Math.hypot(dx - 0.5, dz - 0.5) > 4) continue;
        if ((dx + dz) % 2 !== 0) continue;
        B(cx + dx, h + 1, cz + dz, 'leaf', 1, bloom);
      }
    }
    B(cx, h + 2, cz, 'glass', 1, 0xffd479);      // crown lantern
  };

  // 10 m x 11 m pitch. The crowns are 8 m across, so anything tighter has two
  // trees writing the same cells.
  const GROVE = [
    [20, 24, 14, 0x46a04c], [30, 24, 18, 0x3f8f45], [40, 24, 13, 0x52aa58],
    [20, 35, 12, 0x3f8f45], [30, 35, 16, 0x46a04c], [40, 35, 12, 0x52aa58],
  ];
  for (const [gx, gz, gh, bloom] of GROVE) supertree(gx, gz, gh, bloom);

  // OCBC Skyway between the two tallest supertrees, on columns every 3 m. The
  // real skyway spans 40 m unsupported, which this engine cannot carry.
  for (let z = 27; z <= 32; z++) {
    B(30, 12, z, 'steel', 1, 0x8a8276);
    B(31, 12, z, 'steel', 1, 0x8a8276);
    if (z % 3 === 0) { B(30, 13, z, 'steel', 1, 0x5a6068); B(31, 13, z, 'steel', 1, 0x5a6068); }
  }
  for (const cz of [28, 31]) for (let y = 0; y < 12; y++) B(30, y, cz, 'steel', 1, 0x6a6f78);

  // ============================================================ 5. BIOME DOMES
  domeShell(2, 34, 9, { fillColor: 0x9fd8c8 });     // Flower Dome
  domeShell(-16, 34, 7, { fillColor: 0xaee0e8 });   // Cloud Forest

  // ============================================================ 6. MERLION WATERFRONT
  // Fish body rising from a plinth, lion head above, facing east across the bay.
  // Every course is stacked squarely on the one below — the detail cells (eye,
  // spout, mane) sit PROUD of the head rather than inside it, which is what the
  // first version got wrong: a detail written into an occupied cell is an
  // overlap, not a feature.
  {
    const mx = -26, mz = -14;
    BOX(mx - 1, 0, mz - 1, 8, 2, 8, 'concrete', 1, 0xb0a89a);        // plinth
    BOX(mx, 2, mz, 6, 1, 6, 'concrete', 1, 0xc8c0b2);                // step
    // Fish body: a tapering stack, each course inset half a metre.
    BOX(mx + 1, 3, mz + 1, 8, 2, 8, 'concrete', 0.5, 0xf2efe6);      // y 3..4
    BOX(mx + 1.5, 4, mz + 1.5, 7, 2, 7, 'concrete', 0.5, 0xf2efe6);  // y 4..5
    BOX(mx + 2, 5, mz + 2, 6, 2, 6, 'concrete', 0.5, 0xf6f3ea);      // y 5..6
    BOX(mx + 2.5, 6, mz + 2.5, 5, 2, 5, 'concrete', 0.5, 0xf6f3ea);  // y 6..7
    // Lion head, squarely on the body's top course.
    BOX(mx + 2.5, 7, mz + 2.5, 5, 4, 5, 'concrete', 0.5, 0xf8f5ec);
    // Mane: a ring of lobes standing ON the head's crown, not buried in it.
    // The two z-runs stop short of the corners the x-runs already own: a ring
    // walked as four full sides writes every corner twice.
    for (let i = 0; i < 5; i++) {
      B(mx + 2.5 + i * 0.5, 9, mz + 2.5, 'concrete', 0.5, 0xe8e4d8);
      B(mx + 2.5 + i * 0.5, 9, mz + 4.5, 'concrete', 0.5, 0xe8e4d8);
      if (i === 0 || i === 4) continue;
      B(mx + 2.5, 9, mz + 2.5 + i * 0.5, 'concrete', 0.5, 0xe8e4d8);
      B(mx + 4.5, 9, mz + 2.5 + i * 0.5, 'concrete', 0.5, 0xe8e4d8);
    }
    // Face, mounted one cell PROUD of the head's east face (x = mx + 5).
    B(mx + 5, 8.5, mz + 3, 'glass', 0.5, 0x2a3440);                  // eye
    B(mx + 5, 8.5, mz + 4, 'glass', 0.5, 0x2a3440);                  // eye
    BOX(mx + 5, 7.5, mz + 3.5, 1, 1, 2, 'glass', 0.5, 0x9fd8e8);     // the spout
  }
  // The bollards moved from x -31 to the bay's own west edge: -31 is now inside
  // the Collyer Quay footprints, and a bollard is a quayside object anyway.
  for (let z = -13; z <= 17; z += 5) mooringBollard(sim, -19, z);
  for (const bz of [-17, -11]) bench(sim, -18, bz);
  for (const lz of [-19, -13, -7]) lampPost(sim, -17, lz);

  // ============================================================ 7. RAFFLES PLACE CBD
  // The bank wall the waterfront is looked at against.
  tower(sim, -50, -8, 8, 8, 0, 30, 'curtain');                          // UOB Plaza
  tower(sim, -50, 6, 8, 8, 0, 26, 'curtain');                           // OCBC Centre
  tower(sim, -49, 20, 7, 7, 0, 22, 'masonry', 'concrete', 0x8a929a);    // Republic Plaza
  tower(sim, -33, 30, 7, 7, 0, 18, 'masonry', 'concrete', 0x9aa0a8);    // Telok Ayer block
  tower(sim, -33, 8, 6, 6, 0, 14, 'masonry', 'concrete', 0x93999f);     // Chinatown Point
  // Collyer Quay and Shenton Way, filling the wall out to the bay's north-west
  // corner. Footprints are placed against what is already claimed: the Merlion
  // plinth owns x -27..-19 at z -15..-7 and its park deck -32..-18, so the
  // Shenton Way row stops at x -33.
  // Nothing stands in x -38..-34: that is Raffles Quay's carriageway, and the
  // first placement of these four put two blocks straight through it and through
  // the sedans parked on it. The row is split either side of the road instead.
  tower(sim, -50, -22, 8, 8, 0, 34, 'curtain');                         // One Raffles Quay
  tower(sim, -33, -22, 7, 7, 0, 27, 'curtain');                         // Ocean Financial Centre
  tower(sim, -33, -6, 6, 6, 0, 24, 'masonry', 'concrete', 0x8f959d);    // Fullerton block
  tower(sim, -33, 16, 6, 6, 0, 20, 'masonry', 'concrete', 0x9aa2a8);    // Tanjong Pagar block
  tower(sim, 42, 2, 7, 7, 0, 22, 'curtain');                            // Bayfront tower, east bank

  // ============================================================ 8. ESPLANADE THEATRES
  // The two spiked shells on the northern shore, kept clear of the lotus bowl.
  // Centres 14 m apart: at 10 m the R=6 and R=5 shells intersected over 512
  // cells, because two spheres share ground whenever the gap is under the sum
  // of their radii and the thicker shell made that sum bigger.
  domeShell(-13, -28, 6, { fillColor: 0xa89a7c, paneColor: 0xc4b894, ribColor: 0xb4a888, spike: 0xc0b494 });
  domeShell(1, -29, 5, { fillColor: 0xa89a7c, paneColor: 0xc4b894, ribColor: 0xb4a888, spike: 0xc0b494 });

  // ============================================================ 9. HELIX BRIDGE
  // Crosses the bay's north neck. Piered every 3 m, and the twin helix tubes are
  // stood up on columns from the deck rather than left in mid-air — the sine
  // only ever brought one phase in six back down to something solid.
  {
    const y0 = 4;
    for (let x = -14; x <= 4; x += 3) BOX(x, 0, -18, 1, 4, 2, 'concrete', 1, 0x8a8378);
    BOX(-14, y0, -18, 20, 1, 2, 'concrete', 1, 0xcfc9bd);
    for (let x = -14; x <= 5; x++) {
      const p = ((x + 14) % 6) / 6;
      const a = 1 + Math.round(Math.sin(p * Math.PI * 2) + 1);
      const b = 1 + Math.round(Math.sin(p * Math.PI * 2 + Math.PI) + 1);
      for (let y = 1; y <= a; y++) B(x, y0 + y, -18, 'steel', 1, y === a ? 0xe0dcd2 : 0x9aa4ac);
      for (let y = 1; y <= b; y++) B(x, y0 + y, -17, 'steel', 1, y === b ? 0xb8c4cc : 0x9aa4ac);
    }
  }

  // ============================================================ 10. PROMENADE & GARDENS
  // Deliberately sparse: Sydney shipped a bin at every lamp post and it read as
  // noise at the player's eye height. Each run keeps its own z lane so no two
  // props ever contend for a cell.
  for (let x = -16; x <= 12; x += 7) lampPost(sim, x, 19);
  for (const bx of [-14, 10]) trashBin(sim, bx, 19);
  for (const bx of [-9, 1, 8]) bench(sim, bx, 20.5);
  for (let x = -16; x <= 13; x += 5) bollard(sim, x, 22);
  for (const tx of [-12, -2, 8]) tree(sim, tx, 23.5);

  treeGrove(sim, { x: -50, z: 30, w: 10, d: 10, step: 4 });
  // The whole strip from x -33 to -9 at these z values belongs to something:
  // the Telok Ayer block owns -33..-26 and the Cloud Forest shell -23..-9. The
  // planters go to the garden's south edge instead, which nothing else claims.
  for (const [px, pz] of [[-24, 44], [-16, 44], [-8, 44]]) planter(sim, px, pz, 2, 1);

  const gardenPath = pathRibbon([[-14, 22], [0, 26], [16, 28], [34, 30]], 2, { color: 0xb5a98c });

  // Two launches under way in open water. Their old rationale — "moored NORTH
  // of z 4, as far into the bay as the revetment's last lane can reach" — died
  // with the revetment: §12's close-out course moved out of the bay onto the
  // promenade, so there are no rocks to sit on and the whole basin from z -14
  // to the z 14 shore is clear water. What actually constrains them now is the
  // built edges: the Merlion Park deck runs to x -18 on the west and the
  // Shoppes podium starts at x 18 on the east, so a launch must stay inside
  // that span to read as afloat rather than beached on a quay. Both do, with
  // several metres to spare, so they are left where they are.
  motorLaunch(sim, -12, -4, 'x', 0xe8ecf2, 0x1c6ea4);
  motorLaunch(sim, 6, -2, 'x', 0xf2efe6, 0xc9302c);

  // Satay Club stalls on the Esplanade forecourt, west of the shells.
  // x = -23 clears the promenade lamp posts standing at x = -17.
  marketStall(sim, -23, -24, 0xc23b2e, 3, 2);
  marketStall(sim, -23, -19, 0x2e5d3a, 3, 2);

  // ============================================================ 11. STREETS
  for (const s of SINGAPORE_STREETS) {
    roads.push({ x: s.x, z: s.z, w: s.w, d: s.d, color: 0x373b42 });
    if (s.axis === 'x') {
      sidewalks.push(
        { x: s.x, z: s.z - 1.5, w: s.w, d: 1.5, color: 0x8a857b },
        { x: s.x, z: s.z + s.d, w: s.w, d: 1.5, color: 0x8a857b },
      );
    } else {
      sidewalks.push(
        { x: s.x - 1.5, z: s.z, w: 1.5, d: s.d, color: 0x8a857b },
        { x: s.x + s.w, z: s.z, w: 1.5, d: s.d, color: 0x8a857b },
      );
    }
  }

  const cross = (s, at) => (s.axis === 'x'
    ? zebra({ x: at, z: s.z + 0.4, w: 2.8, d: s.d - 0.8, axis: 'x' })
    : zebra({ x: s.x + 0.4, z: at, w: s.w - 0.8, d: 2.8, axis: 'z' }));
  const crosswalks = [];
  for (const [si, at] of SINGAPORE_CROSSINGS) crosswalks.push(...cross(SINGAPORE_STREETS[si], at));

  for (const v of SINGAPORE_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.color, v.roof ?? v.color, v.axis);
    else boxVan(sim, v.x, v.z, v.len, v.color, v.color2, v.axis);
  }

  // ============================================================ 12. DECOR & AMBIENT
  // ============================================================ 12. PROMENADE APRON (BUDGET CLOSE-OUT)
  // Granite setts paving the south-bay promenade, laid lane by lane from the
  // bank SOUTHWARD across the boardwalk deck. The authored city above lands
  // deliberately short of TARGET_BLOCKS and `need` is whatever the budget has
  // left, so this course is what makes the count exact.
  //
  // IT USED TO RUN THE OTHER WAY, AND THAT WAS THE BUG. The lanes walked NORTH
  // from the shore, which put all 1,241 stones INSIDE the Marina Bay water rect
  // — 5.6% of the city standing on the water. Nothing caught it and nothing
  // could: `probeWaterOverSurfaces` compares DECOR rects against the water
  // rects, and a physical block standing in water is not a decor rect. It was
  // green the whole time and rendered as a flat grey mat floating on the bay.
  //
  // The old comment called it riprap, and that intent was reasonable — Marina
  // Bay is a dammed freshwater basin and its banks are armoured in life. The
  // geometry never delivered it: riprap hugs an irregular bank and slopes,
  // while a constant-height rectangle at a fixed offset from the shore reads as
  // unfinished paving. It IS paving. So it is laid where paving belongs, on the
  // promenade, and the name now matches the thing.
  //
  // THREE SKIPS, EVERY ONE LOAD-BEARING — the apron crosses ground that is
  // already in use, which the old course never did:
  //   1. OCCUPANCY. The promenade carries lamp posts, stalls and railings. A
  //      stone sharing a fine cell with a prop does not collide, it GHOSTS it —
  //      the later block wins the grid cell and the prop silently stops being
  //      solid. `sim.grid` is live mid-build, so this asks the engine rather
  //      than modelling it; `probeCellOwnership` is the backstop, not the guard.
  //   2. THE SPAWN. A stone under the hole is eaten on frame one, which reports
  //      through BOTH arms of `probeIdleStability` — its non-static arm counts
  //      `consumed`, so four stones straddling the spawn read as a collapse that
  //      never happened. Read off `sim.hole` (0, 16 here, set before the builder
  //      runs) rather than hard-coded, so the apron follows the spawn if it moves.
  //   3. WATER. Cheap, and it is the defect this very course just had.
  //
  // The footprint is EXACTLY the boardwalk rect (x -18..18, z 14..24), so the
  // apron paves the deck it stands on and never spills onto the gardens.
  // Capacity is 1,340 cells against 1,241 needed. The shortfall therefore lands
  // in the LAST lane, farthest from the bank — the shore-first order is what
  // makes a short run read as a narrower apron instead of an unfinished one.
  const need = TARGET_BLOCKS - sim.blocks.length;
  if (need > 0) {
    const wetCell = (x, z) => water.some((w) =>
      x + 0.5 > w.x && x < w.x + w.w && z + 0.5 > w.z && z < w.z + w.d);
    // 1.4 m outside the rim, which is comfortably past the widest a SIZE-1 hole
    // reaches before the player has moved at all.
    const keepOut = sim.hole.radius + 1.4;
    const clearOfSpawn = (x, z) =>
      Math.hypot(x + 0.25 - sim.hole.x, z + 0.25 - sim.hole.z) >= keepOut;
    // Min-corner in metres -> fine cells [g, g+2) on each axis, matching
    // `_block`'s own rounding. All four base cells AND the course above them,
    // because a prop's post occupies y as well.
    const cellFree = (x, z) => {
      const gx = Math.round(x * 4), gz = Math.round(z * 4);
      for (let ix = 0; ix < 2; ix++) {
        for (let iy = 0; iy < 2; iy++) {
          for (let iz = 0; iz < 2; iz++) if (sim.grid.has(`${gx + ix},${iy},${gz + iz}`)) return false;
        }
      }
      return true;
    };
    let placed = 0;
    for (let lane = 0; lane < 20 && placed < need; lane++) {
      const z = 14 + lane * 0.5;
      for (let x = -18; x < 18 && placed < need; x += 0.5) {
        if (wetCell(x, z) || !clearOfSpawn(x, z) || !cellFree(x, z)) continue;
        // Three greys on a fixed positional pattern: one colour reads as a
        // painted strip, and keying it to position keeps it build-identical.
        //
        // Two things are load-bearing here. The lane term must not be a
        // multiple of the modulus — at `lane * 3` every lane gets an IDENTICAL
        // stripe and the apron renders as corduroy running the length of the
        // promenade. `lane * 2` staggers it, and that half was already right.
        //
        // And the result must be FLOORED into range, which it was not. JS keeps
        // the DIVIDEND's sign, so `-2 % 3` is -2; the ternary below sends every
        // negative index down to the third grey. This apron runs x -18..18, so
        // 635 of its 1,241 stones were on the negative side and the split came
        // out 416/304/521 against an even 414 — the middle grey losing a third
        // of its stones to the third. Floored it is 416/415/410.
        const t = (((Math.round(x * 2) + lane * 2) % 3) + 3) % 3;
        B(x, 0, z, 'concrete', 0.5, t === 0 ? 0x6f6a60 : t === 1 ? 0x5c574f : 0x7d776c);
        placed++;
      }
    }
  }

  sim.sceneDecor = {
    parks, plaza, cobbles, sidewalks, roads, crosswalks, water, boardwalk,
    paths: gardenPath,
  };

  sim.sceneSurfaces = {
    glass: 'mat_shop_window',
    concrete: 'mat_suburban_siding',
    steel: 'mat_warehouse_roll',
    panel: 'mat_awning_stripe',
  };

  sim.sceneAmbient = {
    gulls: [
      { x: 30, z: -4, r: 18, y: 46, count: 10, speed: 0.32 },  // over the SkyPark
      { x: -24, z: -12, r: 12, y: 18, count: 6, speed: 0.38 }, // over Merlion Park
    ],
    ferries: [
      { x0: -14, z0: -8, x1: 16, z1: 12, period: 56, color: 0xe8ecf2 },
    ],
  };

  // Generate camera blockers dynamically from high geometry.
  // generateBlockers RETURNS the rect list — it does NOT assign it. Sydney
  // shipped a bare `generateBlockers(sim, 6);` whose return value was discarded
  // and ran with ZERO blockers, the chase cam clipping through every landmark it
  // had. Always assign. minH is left off on purpose: 6 is the builder's own
  // default and matching the other scenes keeps the roster on one knob.
  sim.cameraBlockers = generateBlockers(sim);
}
