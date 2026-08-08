// Cambridge, Kendall/East Cambridge — the sixth voxel sandbox scene, and the
// first authored entirely in the ADR-0013 primitive vocabulary. Pure sim: no
// Math.random, no three.js.
//
// SCOPE OF THIS FILE AS IT STANDS. Phase 5 of the Cambridge build sequence is
// "vocabulary proof": build ONE district — District 2, the Davenport block —
// twice, once at the old cube ladder and once through js/voxelforms.js, and
// measure the difference honestly. What ships here is the SECOND of those two
// builds plus the budget the first one freed, spent back into the same ground
// (`01` §7's Variant B2). The remaining districts, the hero building at 2 Canal
// Park, and this scene's registration in AUTHORED_SCENES/FREE_PLAY are Phase 6
// and are deliberately absent. `sim.boundsRect` therefore hugs District 2 alone
// and will widen when the rest of the map lands.
//
// LAYOUT. x = east, z = south, north = -z, the same convention as the other five
// scenes. District 2 is one urban block plus the two streets that bound it:
//
//   z -12 .. -7    CAMBRIDGE STREET FRONTAGE — a six-unit brick row, 3-4
//                  storeys, storefronts at grade, the north wall of the block
//   z  -7 .. -5.5  north sidewalk
//   z -5.5 .. +1.5 CAMBRIDGE STREET — 7 m carriageway, two lanes, kerb parking
//   z +1.5 .. +3   south sidewalk
//   z  +3 .. +24.5 THE DAVENPORT — seven adjoining brick-and-beam mill sections
//                  sharing party walls, 4 to 7 storeys, a stepped skyline. The
//                  hero of this district and the reason it was chosen for the
//                  proof: a mill wall is the vocabulary's best argument.
//   z +24.5 .. +30 THE REAR YARD — freight spur, loading dock and canopy, yard
//                  clutter. This band is where most of Variant B2's spend-back
//                  went, because it is the part of a mill block a cube ladder
//                  cannot afford to furnish.
//
//   x -35 .. -25.5 FIRST STREET — 6 m carriageway running the full depth, with
//                  the block's service elevation on its west side.
//
// SCALE, and the one place it is broken. `03` §1.2 sets Ring A at 1:3 in plan
// and 1:1.5 in height. The Davenport's real block is ~110 x 65 m, which at 1:3
// is 36.5 x 21.5 m — the authored figure, and the one used here. Its real storey
// is ~3.5 m, which at 1:1.5 is 2.33 m.
//
//   THE STOREY IS 2.5 m, NOT 2.33 m. 2.33 is not on the 0.25 m fine grid, so it
//   could never have been built as written; ADR-0006's determinism proof needs
//   every extent to be a multiple of 0.25. It is rounded UP rather than down to
//   2.25 for a reason that only matters to the Phase 5 measurement: 2.5 is a
//   multiple of 0.5, so the cube-ladder control (Variant A) gets to use 0.5 m
//   cubes for every full-height member instead of being forced down to 0.25 m
//   by an off-ladder storey height. Rounding down would have inflated the
//   control's block count by roughly 8x on those members and manufactured the
//   result the phase exists to test. The cost is a skyline 0.17 m per storey
//   taller than `03` §6.2's table: 10.0 / 12.5 / 17.5 / 15.0 / 12.5 / 10.0 /
//   15.0 m against its 9.3 / 11.7 / 16.3 / 14.0 / 11.7 / 9.3 / 14.0. The step
//   PATTERN — which is the whole visual signature — is preserved exactly.
//
// OTHER DELIBERATE DEVIATIONS FROM `03` §6.2, all recorded rather than silent:
//
//   1. SECTION WIDTHS are [5.5, 5.0, 6.5, 5.0, 5.0, 4.5, 5.0] = 36.5 m, against
//      the doc's "4.5-6.5 summing to 36.5" (it gives the range, not the list).
//      Every width is a multiple of 0.5 so that the window rhythm below resolves
//      onto the ladder without a 0.25 m sliver at a section joint.
//   2. THE BAY IS [5.5, 5.0, 5.0, 5.0] along z, not a uniform 5.375. 5.375 is
//      off the fine grid. Four bays, 20.5 m of interior between the two 0.5 m
//      long-face walls, exactly as the doc intends.
//   3. EIGHT FLOOR PLATES PER STOREY PER SECTION, not four. The doc's four
//      assume one plate per bay spanning the full interior width; that plate
//      would have to pass through the timber post line, and a post that stops
//      under every floor and restarts above it is a run of identical boxes
//      leaving a 0.5 m gap — `probePlacementStep` fails it, correctly, because
//      that is exactly the "placement step does not match the extent" defect.
//      So the post is CONTINUOUS through the storey and the deck is planked in
//      two runs beside it, which is also how a real mill floor is laid.
//   4. EVERY WINDOW IS TWO LIGHTS WITH A MULLION BETWEEN THEM, not §6.2's one
//      1.25 m pane per opening. This is a physics constraint, not a taste one.
//      Glass carries vertBond 0.40 and horizBond 0.30, both under the support
//      graph's BOND_CARRY of 0.5, so glass can RECEIVE support and never PASS
//      it: every glass cell must touch something that is not glass. One 1 m
//      pane is legal as a single FORMS panel — one block, one hop off the sill —
//      and orphans its two middle columns the moment a cube author subdivides
//      it, which cost the control 846 glass blocks on the first build. E1 needs
//      ONE plan through two emitters, so the split is authored into the shared
//      plan rather than papered over in the control. Splitting the opening
//      into a 0.5 m light and a 0.25 m light either side of an in-plane steel
//      mullion puts every glass column against a pier or the bar. Any glazed
//      elevation in Phase 6 will hit the same wall.
//   5. 161 FIRST STREET IS NOT BUILT. `03` §4.2 budgets it 900 blocks, but at
//      1:3 it sits ~400 real metres north of the Davenport, which is Ring B
//      ground and outside this district's rect entirely. Deferred to Phase 6
//      with the rest of the map rather than crushed into a 38 m-deep block.
//
// THE RULE `03` §8.2 ASKS TO BE CARRIED HERE, verbatim: *in a district built
// from large primitives, the ground plane carries the density.* A tower can be
// four slabs; the 30 m of pavement in front of it cannot be empty. That is the
// whole design of this file's spend-back — the rear yard, the mill floor, the
// dock and the shopfront row are all ground-plane content. Measured: this
// district ships at 4.29 eatable pieces per m² of built footprint, against
// `03` §8.2's 2.8 target for District 2 and its 2.34 scene median.
//
// PALETTE. Every value here is AUTHORED BY EYE, not measured. Boston's scene
// carries a measured, de-veiled palette because someone photographed the Seaport
// and did the arithmetic; nobody has done that for Cambridge. Writing `mm()`
// around a guess would claim a provenance these values do not have, so the
// convention is declared and then honestly reported as unmeasured. The one
// external anchor used: `02` describes the Davenport as red brick and `03` §6.4
// asks for high chroma to separate it from the low-chroma glass-and-precast
// conversions across the district, so these sit well clear of Boston's measured
// Fort Point band (0x8f725d..0xb79b89), which is a much greyer brick.
//
// SEVEN BRICK TONES, ONE PER SECTION. Not decoration: the Davenport is seven
// buildings put up over 35 years and joined in 1987, and the tone jog at each
// party wall is half of what makes the row read as a row rather than as one long
// shed. It also does structural work for the validator — `probePlacementStep`
// groups collinear identical boxes by colour, so a per-section tone means a
// section's window rhythm is only ever compared against its own.

import {
  slab, column, pier, beam, panel, mullion, cornice, plinth, tread,
  corbelArch, drum, wedge,
} from './voxelforms.js';
import {
  generateBlockers, zebra, laneDashes, sedan, boxVan, bigTruck, motorcycle,
  lampPost, hydrant, bench, trashBin, bollard, planter, signPost, bikeRack,
  crateStack, trashBags, newsBox, tree, shippingContainer, fireEscape,
  cafeTable, sandwichBoard, marketStall, lightMast,
} from './voxelkit.js';

// See the palette note in the header: authored, unmeasured. `sp()` marks the two
// specular values (glass) that a future de-veiling pass must skip; `mm()` is
// absent on purpose rather than applied to guesses.
const sp = (hex) => hex;

const C = {
  // The seven mill sections, west to east. Water-struck red brick, walked from
  // a warm light end to a darker, sootier east end so the row has a direction.
  mill: [0xa04a33, 0x96442f, 0xab5138, 0x8f3f2c, 0xa24c35, 0x99472f, 0x8b3d2a],
  // Deck/post timber, one tone per section, tracking its brick.
  timber: [0x7d5f42, 0x74573c, 0x846547, 0x6e5238, 0x7a5c40, 0x775a3e, 0x6a4f36],
  castStone: 0xb0a695,       // sills, lintels, cornice, parapet copings
  castStoneDeep: 0x9b917f,   // dentils and the shadow course under the cornice
  glass: sp(0x4c626b),       // industrial steel-sash glazing, dark and cold
  glassLobby: sp(0x5e7d88),  // the 1987 link, lighter and cleaner
  muntin: 0x3a3f43,
  // The Cambridge Street frontage row: later, cheaper, yellower brick.
  row: [0xa8794a, 0x9c6f45, 0xb08150, 0x966a41, 0xa4764a, 0x8f6440],
  rowTimber: 0x6f563d,
  // Ground and street.
  asphalt: 0x3c3a38,
  sidewalk: 0x8d8a83,
  kerb: 0x9d9a92,
  yardGravel: 0x6e6a62,
  millFloor: 0x6a5c4c,
  laneLine: 0xd8cf9a,
  crosswalk: 0xdedad0,
  rail: 0x4a443c,
  // Props and plant.
  steelDark: 0x3d444a,
  dockTimber: 0x5f4a34,
  awning: 0x2f5c48,
  ghostSign: 0xd9c8a0,       // the painted wall sign — see CAMBRIDGE_HEROES
};

// --- THE PLAN ----------------------------------------------------------------
// Everything below this line is data, and it is EXPORTED because Phase 5's
// control build (`_phase5-deliverables/variant-a.mjs`) walks the same tables
// through a cube-ladder emitter. "Both variants build the identical plan" is
// then structural rather than a claim in a report: there is one plan, one
// walker, and two emitters.

export const STOREY = 2.5;      // floor to floor
export const WALL_T = 0.5;      // long-face masonry wall thickness
export const LEAF_T = 0.5;      // party-wall leaf — each section owns its own
export const DECK_T = 0.5;      // floor plate
export const WIN_W = 1.0;       // window opening width
export const WIN_H = 1.0;       // glazed height
export const GLASS_T = 0.25;

// The storey's vertical stack, summing to STOREY:
//   0.00 .. 0.50  spandrel (brick apron under the sill)
//   0.50 .. 1.00  sill (cast stone)
//   1.00 .. 2.00  glazing + muntin
//   2.00 .. 2.50  lintel (cast stone)
// The jamb piers run the full 2.50 beside all four, which is both how a mill
// wall stands and what keeps the piers a continuous stack rather than a run of
// identical boxes with a gap in it.
const SPANDREL_H = 0.5, SILL_H = 0.5, LINTEL_H = 0.5;

export const DAVENPORT = {
  id: 'davenport',
  x0: -71.5, z0: 3.0, depth: 21.5,
  widths: [5.5, 5.0, 6.5, 5.0, 5.0, 4.5, 5.0],   // 36.5
  storeys: [4, 5, 7, 6, 5, 4, 6],
  wins: [2, 2, 3, 2, 2, 2, 2],
  bays: [5.5, 5.0, 5.0, 5.0],                    // 20.5 of interior
  brick: C.mill, timber: C.timber,
};

export const FRONTAGE = {
  id: 'frontage',
  x0: -72.0, z0: -12.0, depth: 5.0,
  widths: [6.0, 6.5, 6.0, 6.0, 6.0, 6.5],        // 37.0
  storeys: [3, 3, 4, 3, 4, 3],
  wins: [3, 3, 3, 3, 3, 3],
  bays: [4.0],
  brick: C.row, timber: C.row.map(() => C.rowTimber),
};

// Streets, in the shape `probeCrossingsOnDeclaredStreet` reads: `axis` is the
// direction of travel, and a crossing is declared as [streetIndex, at].
export const CAMBRIDGE_STREETS = [
  { name: 'Cambridge Street', axis: 'x', x: -72, z: -5.5, w: 46.5, d: 7 },
  { name: 'First Street', axis: 'z', x: -33, z: -12, w: 6, d: 42 },
];
export const CAM_XW_LEN = 3;
export const CAMBRIDGE_CROSSINGS = [
  [0, -63], [0, -44], [0, -34],
  [1, 4], [1, 21],
];

// Kerb-parked and moving vehicles. Exported because `probeRoadConflicts` treats
// them as the ONLY positional exemption from "no physical block inside a
// roadway rect" — a vehicle that moves and is not listed here fails the build.
export const CAMBRIDGE_VEHICLES = [
  { kind: 'sedan', x: -70, z: -0.5, axis: 'x', body: 0x2f4756, roof: 0x2f4756 },
  { kind: 'sedan', x: -58, z: -0.5, axis: 'x', body: 0x8d2f28, roof: 0x8d2f28 },
  { kind: 'sedan', x: -47, z: -0.5, axis: 'x', body: 0xd8d3c6, roof: 0xd8d3c6 },
  { kind: 'sedan', x: -66, z: -5.5, axis: 'x', body: 0x3d5a3a, roof: 0x3d5a3a },
  { kind: 'sedan', x: -52, z: -5.5, axis: 'x', body: 0x4a4f57, roof: 0x4a4f57 },
  { kind: 'sedan', x: -40, z: -5.5, axis: 'x', body: 0x8a6a2e, roof: 0x8a6a2e },
  { kind: 'boxVan', x: -32.5, z: 6, axis: 'z', len: 6, cab: 0xd8d3c6, box: 0xd8d3c6 },
  { kind: 'sedan', x: -32.5, z: 24, axis: 'z', body: 0x2f4756, roof: 0x2f4756 },
  // Axis 'x' because `motorcycle` has no axis parameter and always lays its two
  // wheels along x. Declaring 'z' would hand the roads probe a 0.5 x 1.5 m
  // allowance for a 1.5 x 0.5 m machine, and it would reject the half of the
  // bike that sticks out of its own declared box.
  { kind: 'motorcycle', x: -29.5, z: -8, axis: 'x' },
];

// No bridges or viaducts over a carriageway anywhere in this district.
export const CAMBRIDGE_ROAD_SPANS = [];

// Declared-empty ground. `probeOpenGround` holds each span to being genuinely
// block-free AND to touching a boundsRect edge, so this list cannot be widened
// to excuse an interior void.
export const CAMBRIDGE_OPEN_GROUND = [];

// `probeDistrictDensity` reads these. Only District 2 exists in this file, so
// the probe's density-floor clause (half the scene median) is self-referential
// and always passes; the mean-gap and worst-hole clauses along the scripted
// route are the ones that bind, and they are the ones that matter for combo.
export const CAMBRIDGE_DISTRICTS = [
  {
    id: 2,
    name: 'The Davenport block',
    rect: { minX: -72, maxX: -25.5, minZ: -12.5, maxZ: 30 },
    budget: 9800,     // `03` §4.2. Carried on the row because `03` §4 declares
                      // the table as { id, name, rect, budget, gapFloor } and a
                      // budget kept only in a doc cannot be checked against a
                      // build. Nothing reads it yet; the density probe takes
                      // rect and gapFloor. What it records: this district ships
                      // at 6,532 blocks, 67% of its own budget.
    gapFloor: 8,      // `03` §8.2's floor for District 2
  },
];

// The scripted excursion, `03` §9.5: the Davenport's long axis and back along
// First Street, 62 s. Declared here rather than in the validator because
// `probeDistrictDensity` measures inter-piece gaps ALONG it — the route is scene
// data. It never parks: every leg drags the opening onto ground it has not
// already emptied.
//
// One property of it is not a choice. The sim fixes spawn at (0, 16), which is
// 25.5 m east of this slice's content, and the bounds clamp only fires on a
// frame with nonzero input — so the first moving frame snaps the hole to
// boundsRect's east edge. That is identical in every variant and deterministic,
// but it does mean the 3 s idle-stability probe runs with the hole nowhere near
// the geometry. What actually proves this district stands is the first `step()`,
// which recalculates EVERY zone's support graph (voxelsim.js: "first recalc
// evaluates everything") — not the hole's proximity.
// Every leg is also placed against the density probe's 2.6 m corridor, which is
// the constraint that actually shapes it: a leg down the middle of a 6 m
// carriageway measures a hole the width of the street, so the First Street legs
// hug the west kerb where the service walk's furniture and the mill's east gable
// are both inside the corridor, and the rear-yard leg runs at z 26 rather than
// mid-yard so the mill's south wall stays within reach of it.
export const CAMBRIDGE_ROUTE = [
  { until: 6, x: -33.5, z: 12 },   // across First Street to the service walk
  { until: 14, x: -33.5, z: 26 },  // south along the mill's east gable
  { until: 22, x: -44, z: 26 },    // west along the rear yard
  { until: 30, x: -50, z: 20 },    // north in through the mill's south range
  { until: 42, x: -68, z: 14 },    // west down the mill spine
  { until: 51, x: -68, z: 5 },     // north through the west end
  { until: 62, x: -36, z: 2.2 },   // east along the Cambridge Street frontage
];

// "Do not put the mark on the wrong building." The Davenport carries a painted
// ghost sign on its west gable; the Cambridge Street frontage row must not. The
// hero/not-hero pair that matters for the whole scene is 2 Canal Park vs 1 Canal
// Park in District 1 (`03` §6.4) and lands in Phase 6 — this row exercises the
// same probe on the pair this slice actually contains.
export const CAMBRIDGE_HEROES = [
  {
    id: 'davenport-ghost-sign',
    colorKey: C.ghostSign,
    hero: { minX: -72, maxX: -35, minZ: 2.5, maxZ: 25, minY: 0, maxY: 20 },
    notHero: { minX: -72, maxX: -35, minZ: -12.5, maxZ: -6.5 },
  },
];

// --- EMITTERS ----------------------------------------------------------------
// The plan walker below never calls js/voxelforms.js directly. It calls an
// EMITTER, and this file ships the one that maps each member onto its primitive.
// Phase 5's control supplies a second emitter that fills the same AABB with
// cubes off the old 0.25/0.5/1/2 m ladder. Same walker, same tables, same
// member positions; the only difference between Variant A and Variant B is which
// object is passed in, which is what makes the comparison a measurement rather
// than an assertion.
export const FORMS = { slab, column, pier, beam, panel, mullion, cornice, plinth, tread };

// --- THE PLAN WALKER ---------------------------------------------------------

const q = (v) => Math.round(v / 0.25) * 0.25;
const half = (v) => Math.ceil(v / 2 / 0.5 + 0.5) * 0.5;   // the wider of two unequal halves

// Jamb-pier widths for one section: n openings of WIN_W, n-1 interior piers of
// WIN_W, and the remainder split between the two ends. The ends are made
// DIFFERENT where the arithmetic allows, and every pier is a multiple of 0.5, so
// no section joint leaves a 0.25 m sliver between two identical piers.
function pierRun(w, n) {
  const ends = w - (2 * n - 1) * WIN_W;
  const e1 = Math.max(0.5, Math.floor(ends / 2 / 0.5) * 0.5);
  const e0 = ends - e1;
  const out = [e0];
  for (let i = 0; i < n - 1; i++) out.push(WIN_W);
  out.push(e1);
  return out;
}

// One long face of one storey of one section. `face` is +1 for the north wall
// (its outer skin at z = fz) and -1 for the south.
function millFace(E, sim, o) {
  const { x0, w, n, y, fz, brick, glassColor } = o;
  const piers = pierRun(w, n);
  let x = x0;
  for (let i = 0; i < piers.length; i++) {
    E.pier(sim, { x, y, z: fz, w: piers[i], h: STOREY, d: WALL_T, mat: 'brick', color: brick });
    x += piers[i];
    if (i === piers.length - 1) break;
    // The opening: apron, sill, glazing, muntin, lintel. Each course rests
    // VERTICALLY on the one below (span resets to zero, which is the only way a
    // glass panel is ever legal), and the lintel takes its bearing sideways off
    // the two piers it sits between.
    E.panel(sim, { x, y, z: fz, w: WIN_W, h: SPANDREL_H, axis: 'x', t: WALL_T, mat: 'brick', color: brick });
    E.beam(sim, { x, y: y + SPANDREL_H, z: fz, len: WIN_W, axis: 'x', t: SILL_H, depth: WALL_T, mat: 'concrete', color: C.castStone });
    // The glazing sits in the INNER half of the 0.5 m reveal, and the muntin
    // sits IN that plane, between two lights — not applied to the outer face.
    // That is a structural requirement, not a stylistic one: glass carries
    // `vertBond` 0.40 and `horizBond` 0.30, both under `BOND_CARRY`, so a glass
    // block can RECEIVE support but can never pass it on. Every glass cell must
    // therefore touch a non-glass bearing directly. One 1 m pane is fine as a
    // single FORMS panel (one block, one hop off the sill) and collapses when a
    // cube author subdivides it, because the two middle columns then touch
    // nothing but glass. Splitting the opening into a 0.5 m light and a 0.25 m
    // light either side of the bar puts every column against the pier or the
    // bar, and both variants stand up.
    const gy = y + SPANDREL_H + SILL_H;
    const bar = q(WIN_W / 2);
    E.panel(sim, { x, y: gy, z: fz + GLASS_T, w: bar, h: WIN_H, axis: 'x', t: GLASS_T, mat: 'glass', color: glassColor });
    E.mullion(sim, { x: x + bar, y: gy, z: fz + GLASS_T, h: WIN_H, s: 0.25, mat: 'steel', color: C.muntin });
    E.panel(sim, { x: x + bar + 0.25, y: gy, z: fz + GLASS_T, w: WIN_W - bar - 0.25, h: WIN_H, axis: 'x', t: GLASS_T, mat: 'glass', color: glassColor });
    E.beam(sim, { x, y: gy + WIN_H, z: fz, len: WIN_W, axis: 'x', t: LINTEL_H, depth: WALL_T, mat: 'concrete', color: C.castStone });
    x += WIN_W;
  }
}

// One section: two long faces, its own pair of party-wall leaves, the post line,
// the girders that frame into it, the floor plates, and the roof.
function millSection(E, sim, o) {
  const { x0, w, z0, depth, storeys, n, brick, timber, glassColor } = o;
  const z1 = z0 + depth;
  const inZ0 = z0 + WALL_T, inZ1 = z1 - WALL_T;
  const bays = o.bays;
  // The interior splits leaf | west plank run | post | east plank run | leaf.
  // The two plank runs are deliberately UNEQUAL — they differ by exactly 0.5 m —
  // because two equal plates either side of a 0.5 m post are collinear identical
  // boxes with a 0.5 m gap between them, which is the defect
  // `probePlacementStep` exists to catch. Off-centring the post line is also
  // what a real mill does: the wide bay takes the machines.
  const wi = w - 2 * LEAF_T;
  const dW = half(wi - 0.5), dE = wi - 0.5 - dW;
  const colX = x0 + LEAF_T + dW;

  for (let s = 0; s < storeys; s++) {
    const y = s * STOREY, top = y + STOREY;
    millFace(E, sim, { x0, w, n, y, fz: z0, brick, glassColor });
    millFace(E, sim, { x0, w, n, y, fz: z1 - WALL_T, brick, glassColor });

    let bz = inZ0;
    for (const bd of bays) {
      // Party-wall leaves. `03` §6.2: a party wall is two pieces, never one —
      // two sections that should fail at different times must be two structures.
      // Split per bay as well, because a full-depth leaf at grade would be a
      // 20.5 m plan diagonal and permanently uneatable.
      E.panel(sim, { x: x0, y, z: bz, w: bd, h: STOREY, axis: 'z', t: LEAF_T, mat: 'brick', color: brick });
      E.panel(sim, { x: x0 + w - LEAF_T, y, z: bz, w: bd, h: STOREY, axis: 'z', t: LEAF_T, mat: 'brick', color: brick });

      // TWO posts per bay, not one. A mill's longitudinal girder is carried by a
      // line of posts at roughly 3 m centres, and that is also the spacing the
      // support graph needs: timber's `maxSpan` is 2 m, a hop between adjacent
      // 0.5 m pieces costs 0.5 m, so a post reaches 3.5 m of girder and no more.
      // At one post per 5 m bay the mid-bay girder is out of reach — which the
      // FORMS variant survives only because its girder is a single block and a
      // single block is a single hop. Sizing the structure to the rule rather
      // than to that accident is what makes the two variants comparable.
      for (const cz of bd >= 4 ? [bz + 1, bz + bd - 1.5] : [bz + Math.floor((bd - 0.5) / 2 / 0.5) * 0.5]) {
        E.column(sim, { x: colX, y, z: cz, h: STOREY, s: 0.5, mat: 'wood', color: timber });
      }
      E.beam(sim, { x: colX - 0.5, y: top - DECK_T - 0.5, z: bz, len: bd, axis: 'z', t: 0.5, depth: 0.5, mat: 'wood', color: timber });
      E.beam(sim, { x: colX + 0.5, y: top - DECK_T - 0.5, z: bz, len: bd, axis: 'z', t: 0.5, depth: 0.5, mat: 'wood', color: timber });
      E.slab(sim, { x: x0 + LEAF_T, y: top - DECK_T, z: bz, w: dW, d: bd, t: DECK_T, mat: 'wood', color: timber });
      E.slab(sim, { x: colX + 0.5, y: top - DECK_T, z: bz, w: dE, d: bd, t: DECK_T, mat: 'wood', color: timber });
      bz += bd;
    }
  }

  // Roof. No post continues above the top storey, so the roof deck is one plate
  // per bay across the full interior — the doc's four, here at last.
  const ry = storeys * STOREY;
  let bz = inZ0;
  for (const bd of bays) {
    E.slab(sim, { x: x0 + LEAF_T, y: ry, z: bz, w: wi, d: bd, t: DECK_T, mat: 'wood', color: timber });
    bz += bd;
  }
  // The corbelled brick cornice band, then the parapet above it. The order
  // matters structurally, not just visually: the dentil course and the cornice
  // hang OUTBOARD of the wall and take their bearing sideways off the top
  // storey's piers and lintels, while the parapet stands in the wall plane on
  // top of them. Putting the parapet's base anywhere above the wall head — even
  // 0.25 m above, behind a projecting cornice — leaves it floating, and it goes
  // over on the first frame.
  for (const fz of [z0, z1 - WALL_T]) {
    const out = fz === z0 ? z0 - 0.25 : z1;
    for (let dx = 0; dx + 0.5 <= w; dx += 1.0) {
      E.panel(sim, { x: x0 + dx, y: ry - 0.5, z: out, w: 0.5, h: 0.25, axis: 'x', t: 0.25, mat: 'concrete', color: C.castStoneDeep });
    }
    E.cornice(sim, { x: x0, y: ry - 0.25, z: out, run: w, axis: 'x', t: 0.25, proj: 0.25, mat: 'concrete', color: C.castStone });
    E.panel(sim, { x: x0, y: ry, z: fz, w, h: 0.75, axis: 'x', t: WALL_T, mat: 'brick', color: brick });
    E.beam(sim, { x: x0, y: ry + 0.75, z: fz, len: w, axis: 'x', t: 0.25, depth: WALL_T, mat: 'concrete', color: C.castStone });
  }
}

// The whole plan for one range of sections. Both the Davenport and the Cambridge
// Street frontage row are the same object built with different tables.
function millRange(E, sim, R, glassColor) {
  let x = R.x0;
  for (let i = 0; i < R.widths.length; i++) {
    millSection(E, sim, {
      x0: x, w: R.widths[i], z0: R.z0, depth: R.depth, storeys: R.storeys[i],
      n: R.wins[i], bays: R.bays, brick: R.brick[i], timber: R.timber[i],
      glassColor,
    });
    x += R.widths[i];
  }
}

// The shared plan — everything Variant A and Variant B1 both build, in the same
// places, member for member. Exported so the control walks exactly this.
export function cambridgeBuildings(E, sim) {
  millRange(E, sim, DAVENPORT, C.glass);
  millRange(E, sim, FRONTAGE, C.glassLobby);
  // The painted wall sign on the Davenport's west gable — the mark
  // `probeHeroIdentity` guards. It belongs to the SHARED plan rather than to
  // B2's spend-back because it identifies the building, and both variants build
  // the same building; a control that has no mark on it would fail the identity
  // probe for a reason that has nothing to do with the vocabulary. Two panels of
  // different extents, so the pair is never a run of identical collinear boxes.
  E.panel(sim, { x: -71.75, y: 6, z: 6, w: 8, h: 3, axis: 'z', t: 0.25, mat: 'brick', color: C.ghostSign });
  E.panel(sim, { x: -71.75, y: 4.5, z: 8.5, w: 3, h: 1, axis: 'z', t: 0.25, mat: 'brick', color: C.ghostSign });
}

// --- THE SHELL ---------------------------------------------------------------
// Ground, streets, decor, kerbs, street furniture, vehicles, ambient life and
// camera blockers. IDENTICAL across all three variants by construction: it is
// one function and all three call it, so the A/B/B2 deltas are a property of the
// buildings and of the spend-back, never of the pavement.

export function cambridgeShell(sim, buildings) {
  sim.bounds = 120;
  // minZ is -12.5 rather than the frontage row's own -12: the row's cornice and
  // dentil courses project 0.25 m outboard of its north wall, and boundsRect
  // must contain the geometry, not the footprint that generated it.
  sim.boundsRect = { minX: -72, maxX: -25.5, minZ: -12.5, maxZ: 30 };

  const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [];
  const roads = [], rail = [], bikePaths = [], laneMarkers = [], crosswalks = [];
  const water = [], boardwalk = [];

  for (const s of CAMBRIDGE_STREETS) roads.push({ x: s.x, z: s.z, w: s.w, d: s.d });

  sidewalks.push(
    { x: -72, z: -7, w: 46.5, d: 1.5 },      // Cambridge Street, north
    { x: -72, z: 1.5, w: 46.5, d: 1.5 },     // Cambridge Street, south
    { x: -35, z: -12, w: 2, d: 42 },         // First Street, west (the service walk)
    { x: -27, z: -12, w: 1.5, d: 42 },       // First Street, east
  );

  cobbles.push(
    { x: -71.5, z: 3, w: 36.5, d: 21.5 },    // the mill's own ground floor
    { x: -72, z: -12, w: 0.5, d: 42 },       // the west kerb strip against the map edge
  );
  plaza.push(
    // -12.5, not -12: the row's cornice and dentils project 0.25 m north of its
    // wall, so the footprint cell they land in is one metre further out than the
    // wall's own, and a surface has to reach it or that cell is bare ground.
    { x: -72, z: -12.5, w: 37, d: 5.5 },     // the frontage row's footprint
    { x: -64, z: 24.5, w: 38.5, d: 5.5 },    // the rear yard apron
  );
  parks.push({ x: -72, z: 24.5, w: 8, d: 5.5 });   // the yard's grass verge
  rail.push({ x: -64, z: 26.5, w: 31, d: 1.5 });   // the freight spur
  bikePaths.push({ x: -28.2, z: -12, w: 1.2, d: 42 });

  laneMarkers.push(
    ...laneDashes({ x: -72, z: -2.2, w: 46.5, d: 0.4, axis: 'x' }),
    ...laneDashes({ x: -30.2, z: -12, w: 0.4, d: 42, axis: 'z' }),
  );
  for (const [si, at] of CAMBRIDGE_CROSSINGS) {
    const s = CAMBRIDGE_STREETS[si];
    crosswalks.push(...(s.axis === 'x'
      ? zebra({ x: at, z: s.z, w: CAM_XW_LEN, d: s.d, axis: 'x' })
      : zebra({ x: s.x, z: at, w: s.w, d: CAM_XW_LEN, axis: 'z' })));
  }

  // Kerbs. Laid outside the carriageway rects (rectsOverlap is open, so an
  // abutting edge is not a conflict) and cut into 6 m runs so nothing at grade
  // approaches the 8 m plan-diagonal cliff.
  const kerbRun = (x, z, len, axis) => {
    for (let o = 0; o < len - 0.01; o += 6) {
      const l = Math.min(6, len - o);
      beam(sim, axis === 'x'
        ? { x: x + o, y: 0, z, len: l, axis: 'x', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb }
        : { x, y: 0, z: z + o, len: l, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb });
    }
  };
  // BOTH streets' kerbs stop short of the junction, in all four directions. A
  // kerb line carried straight through crosses the other street's kerb line —
  // two blocks in one fine cell, which is a ghost rather than a corner — and,
  // less obviously, it also stands inside the other street's carriageway rect,
  // which is a road conflict even though nothing overlaps.
  for (const kz of [-5.75, 1.5]) {
    kerbRun(-72, kz, 38.75, 'x');
    kerbRun(-26.75, kz, 1.25, 'x');
  }
  for (const kx of [-33.25, -27]) {
    kerbRun(kx, -12, 6.25, 'z');
    kerbRun(kx, 1.75, 28.25, 'z');
  }

  // The buildings, whichever variant this is.
  buildings(sim);

  // Street furniture, laid out as ONE deconflicted schedule rather than as four
  // independent loops. Two things forced that. Every prop here is drawn from
  // 0.25 m cells with its own internal offsets, so two props whose nominal
  // positions are 0.5 m apart can still land in the same fine cell — and a
  // shared cell is a ghost placement, invisible to the support graph, which
  // takes the whole prop down on the first frame. And these footways are 1.5 m
  // and 2 m wide, so a prop that is wider than its nominal centre suggests
  // overhangs either the carriageway (a road conflict) or the building line.
  //
  // NO STREET TREES for that second reason: `tree` lays a 2 m canopy, which does
  // not fit on a 1.5 m walk in either direction. This district's trees are in
  // the rear yard's verge, where there is room for them.
  for (const x of [-69, -60, -51, -42]) lampPost(sim, x, -6.5);
  for (const x of [-65.5, -47]) trashBin(sim, x, -6.5);
  hydrant(sim, -56.5, -6.5);

  for (const x of [-66, -57, -48, -39]) lampPost(sim, x, 2.0);
  for (const x of [-62, -44]) bench(sim, x, 2.0);
  hydrant(sim, -53, 2.0);
  planter(sim, -71, 2.0, 1.5, 1, 0x6d5a4a);

  // First Street's two walks carry NOTHING between z -5.5 and z 1.5. That band
  // is Cambridge Street's carriageway: its road rect spans the full map width,
  // so it crosses both walks, and the walk decor rects that run through it are
  // the junction's paint rather than a pavement anything may stand on.
  for (const z of [-9, 6, 15, 24]) lampPost(sim, -34.5, z);
  for (const z of [-11, 2, 9, 13.5, 20, 26]) bollard(sim, -34.5, z, C.steelDark);
  for (const z of [4, 10, 16]) planter(sim, -34.75, z, 1.5, 1, 0x5d6a4a);
  // Boards hang along z, not x: an x-facing board on this walk would reach into
  // First Street's carriageway.
  signPost(sim, -34.5, -7, 0x2c6e4f, 2, 'z', 1.0);
  signPost(sim, -34.5, 28, 0x2c6e4f, 2, 'z', 1.0);

  for (const z of [-8, 6, 22, 28]) lampPost(sim, -26.5, z);
  for (const z of [4, 20, 24]) bollard(sim, -26.5, z, C.steelDark);
  newsBox(sim, -26.5, 16, 0xc23b2e);
  newsBox(sim, -26.5, 17.5, 0x2a4f9a);

  // The First Street transit stop (`03` §4.2). A shelter roof on two posts, on
  // the east footway, clear of the carriageway.
  for (const pz of [10.5, 14.5]) {
    column(sim, { x: -26.5, y: 0, z: pz, h: 2.5, s: 0.25, mat: 'steel', color: C.steelDark });
  }
  slab(sim, { x: -26.75, y: 2.5, z: 10.25, w: 1.25, d: 4.75, t: 0.25, mat: 'steel', color: C.steelDark });
  bench(sim, -26.5, 12);

  for (const v of CAMBRIDGE_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.box);
    else motorcycle(sim, v.x, v.z);
  }

  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };

  // Procedural surfaces, bound by matType in js/voxelsurfaces.js.
  //
  // THIS IS NOT FREE, AND IT USED TO BE. `01` §2.3's win only reaches UNSURFACED
  // buckets: the key keeps the extent triple whenever a block is surfaced,
  // because surfaceMaterial() bakes the tile repeat per metre. Under the old
  // cube ladder that cost almost nothing — a scene had nine distinct sizes, so
  // five surfaced materials bought at most a few dozen buckets. This district
  // has NINETY-FIVE distinct extents, so surfacing multiplies rather than adds.
  // Measured on the shipped build (`_phase5-deliverables/buckets.mjs`):
  //
  //             surfaced (as shipped)     surfaces removed
  //   Variant A     21 / 20 buckets          21 / 8
  //   Variant B1    73 / 72                  73 / 8
  //   Variant B2   115 / 109                115 / 8
  //
  // — Tier 1 alone, then Tier 1 plus P1.2's key change. One InstancedMesh per
  // bucket, so declaring these five materials costs this district 101 block
  // draw calls, and P1.2 can only reclaim 6 of them. Still a long way inside
  // STATUS.md:276's ~800 revisit threshold on one district; NOT obviously so
  // across ten, which is Phase 6's to watch. The Tier-2 texture-array seam
  // (voxelworld.js:617-625) is the thing that would collapse it, and its stated
  // trigger — "a second, larger scene declares surfaces" — is now met.
  //
  // The district is authored to read correctly with this object deleted — the
  // mill's identity is in its massing and its seven brick tones, not in a tile.
  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_glass_curtain',
    concrete: 'mat_concrete_precast',
    steel: 'mat_metal_seam',
    wood: 'mat_timber_dock',
  };

  sim.sceneAmbient = {
    steam: [
      { x: -55, z: 27, rate: 0.34 },     // the yard's boiler vent
      { x: -46, z: 4.2, rate: 0.22 },    // a pavement grate on Cambridge Street
    ],
    neon: [
      { x: -58, z: -6.5, w: 9, d: 1.2, color: 0xff7a3a, period: 3.1 },   // the row's shopfronts
      { x: -42, z: -6.5, w: 7, d: 1.2, color: 0x4ad9ff, period: 4.4 },
      { x: -30, z: 12, w: 1.2, d: 6, color: 0xffd166, period: 2.4 },     // the transit stop
    ],
    pigeons: [
      { x: -34, z: 6, count: 12 },
      { x: -55, z: 27, count: 9 },
      { x: -64, z: -6, count: 11 },
    ],
  };

  sim.cameraBlockers = generateBlockers(sim);
}

// --- VARIANT B2: THE SPEND-BACK ----------------------------------------------
// Hand 2 of the two-hand rule. Every block the primitive vocabulary freed on the
// shared plan above is owed back to this district, not banked, and this is where
// it went. All of it is content a cube ladder could not afford on the same
// budget: the rear yard, the freight dock, the fire escapes, the 1987 lobby link
// and the 2008 courtyard, roof plant, and the shopfronts on the frontage row.
//
// It is also where the three COMPOSITE primitives earn their place — the dock's
// corbelled brick arch, the roof tank's drum, and the ramp's wedge. They are
// deliberately outside the shared plan: Variant A must build the same members as
// Variant B1 to be a fair control, and a composite has no honest cube analogue
// that is not just "the same decomposition, subdivided".

// The rear yard runs x -71.5..-35, z 24.5..30, and everything in it is laid out
// in three z-bands so that nothing has to be checked against everything:
//   band A, z 24.5..26.75 — against the mill wall: the dock, containers, crates
//   band B, z 27.0..28.5  — the freight spur
//   band C, z 28.5..30    — the back edge: bins, the truck, masts, the verge
function loadingDock(sim) {
  // Raised dock platform against the mill's south wall (band A), its vehicle
  // ramp at the west end and a pedestrian stair at the east.
  plinth(sim, { x: -52, y: 0, z: 24.5, w: 5, d: 2, h: 1.0, mat: 'concrete', color: 0x8b8378 });
  plinth(sim, { x: -47, y: 0, z: 24.5, w: 5, d: 2, h: 1.0, mat: 'concrete', color: 0x847c72 });
  wedge(sim, { x: -56, y: 0, z: 24.5, w: 4, d: 2, h: 1.0, axis: 'x', from: 'max', riser: 0.25, mat: 'concrete', color: 0x8b8378 });
  // The stair is a `wedge`, not a run of `tread`s. Free-standing treads only
  // touch each other along an EDGE — a step's underside is over the void of the
  // step behind it — and an edge shares no face cell, so the support graph never
  // pairs them and the flight goes over above its bottom step. `wedge` stacks
  // each course squarely on the one below, which is the same silhouette and a
  // real load path.
  wedge(sim, { x: -42, y: 0, z: 24.5, w: 2, d: 2, h: 1.0, axis: 'x', from: 'min', riser: 0.25, mat: 'concrete', color: 0x8b8378 });
  // Canopy over the dock: posts, a plate, and a corrugated deck.
  for (const px of [-52, -47.5, -42.5]) {
    column(sim, { x: px, y: 1.0, z: 26.25, h: 2.5, s: 0.25, mat: 'steel', color: C.steelDark });
  }
  beam(sim, { x: -52, y: 3.5, z: 26.25, len: 9.75, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.steelDark });
  slab(sim, { x: -52.25, y: 3.75, z: 24.5, w: 5, d: 2.25, t: 0.25, mat: 'steel', color: 0x6e757c });
  slab(sim, { x: -47.25, y: 3.75, z: 24.5, w: 5.25, d: 2.25, t: 0.25, mat: 'steel', color: 0x686f76 });
  // Brick buttresses on the rear wall, with a gabled relieving head over each,
  // set clear of the canopy at either end of the dock.
  //
  // `corbelArch` IS THE RIGHT PRIMITIVE FOR THIS AND IT IS NOT USED HERE. Every
  // corbel arch fails `probePlacementStep`: a course places two jamb beams of
  // equal length with the remaining clear span between them, and the moment the
  // arch is more than about a third closed that clear span is smaller than the
  // course length — which is the probe's gate condition exactly (0 < gap <
  // extent, on identical collinear boxes). It is a false positive rather than a
  // defect: the gap is the OPENING, not a mis-stepped placement. Both are Phase
  // 3 deliverables and they contradict each other; that is reported to the
  // build sequence rather than worked around by editing either file. A `wedge`
  // gable does the same visual job and steps course-on-course, so it passes.
  for (const jx of [-59, -37]) {
    pier(sim, { x: jx, y: 0, z: 24.5, w: 1.5, h: 3.5, d: 0.5, mat: 'brick', color: C.mill[3] });
    wedge(sim, { x: jx, y: 3.5, z: 24.5, w: 1.5, d: 0.5, h: 0.75, axis: 'x', from: 'center', riser: 0.25, mat: 'brick', color: C.mill[3] });
  }
}

function rearYard(sim) {
  // The freight spur, then the clutter a working yard actually carries. This
  // band is why Variant B2 exists: on the cube ladder the district's whole
  // budget went into the walls and there was nothing left.
  //
  // Band B. Sleepers ACROSS the track, rails on top of them — the previous
  // arrangement had both running the same way at the same level, which is not a
  // track and put two members in the same cells. Rails come in 6 m lengths
  // because a single 23 m rail would be a 23 m plan diagonal at grade.
  for (let x = -71; x < -48; x += 1.5) {
    beam(sim, { x, y: 0, z: 27, len: 1.5, axis: 'z', t: 0.25, depth: 0.5, mat: 'wood', color: 0x4c4238 });
  }
  for (const rz of [27, 28.25]) {
    for (const [rx, rl] of [[-71, 6], [-65, 6], [-59, 6], [-53, 5]]) {
      beam(sim, { x: rx, y: 0.25, z: rz, len: rl, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.rail });
    }
  }
  // Band A, west of the dock.
  for (const x of [-71, -69.5, -68, -57.5]) crateStack(sim, x, 24.75, 3, 0x8a6a44);
  shippingContainer(sim, -65, 0, 24.75, 6, 0xb4552f);
  shippingContainer(sim, -65, 3, 24.75, 6, 0x2f6b7a);
  // Band A, east of the dock: the yard transformers on their pad.
  // The two transformers stand exactly their own width apart: any closer and the
  // pair reads to `probePlacementStep` as one mis-stepped run rather than two
  // separate machines, since the gate is "gap smaller than the piece".
  plinth(sim, { x: -40, y: 0, z: 24.75, w: 2.5, d: 2, h: 0.25, mat: 'concrete', color: 0x8b8378 });
  for (const tx of [-39.75, -38.25]) {
    pier(sim, { x: tx, y: 0.25, z: 25, w: 0.75, h: 1.5, d: 1.5, mat: 'steel', color: 0x5a6168 });
  }
  // Band C.
  for (const x of [-59, -52, -46]) trashBin(sim, x, 28.5, 0x33453a);
  trashBags(sim, -48, 28.5, 0x22262c);
  trashBags(sim, -35.5, 28.5, 0x22262c);
  bigTruck(sim, -44, 28, 0xd8d3c6, true);
  lightMast(sim, -65, 29, 6, 0x39414d);
  lightMast(sim, -37, 29, 6, 0x39414d);
  for (const x of [-71, -69, -67]) tree(sim, x, 29);
}

function lobbyLink(sim) {
  // The 1987 glass link and the 2008 Sasaki courtyard, on First Street between
  // the mill's east gable and the footway. Light, glazed and low, against the
  // mill's mass — the two are supposed to read as different decades.
  // The screen stands ON the gable, in the 0.25 m immediately outboard of the
  // mill's east leaf, so the whole 1.75 m footway east of it stays clear for the
  // kerb kit. Its earlier line, half a metre further east, put the glass through
  // every lamp standard on the walk.
  // Irregular bays, on purpose. A curtain wall on a uniform pitch puts identical
  // panels a mullion's width apart, and a mullion is always narrower than the
  // pane it separates — which is `probePlacementStep`'s gate condition and
  // cannot be escaped at a constant pitch. Varying the bay puts each repeat of a
  // given pane a full bay apart instead of a mullion apart.
  let lz = 5;
  for (const bw of [3, 2.5, 3, 2.5, 4]) {
    mullion(sim, { x: -35, y: 0, z: lz, h: 5, s: 0.25, mat: 'steel', color: C.steelDark });
    panel(sim, { x: -35, y: 0, z: lz + 0.25, w: bw - 0.25, h: 5, axis: 'z', t: 0.25, mat: 'glass', color: C.glassLobby });
    lz += bw;
  }
  for (let z = 5; z < 20; z += 5) {
    slab(sim, { x: -35, y: 5, z, w: 0.5, d: 5, t: 0.25, mat: 'concrete', color: C.castStone });
  }
  cornice(sim, { x: -35, y: 5.25, z: 5, run: 15, axis: 'z', t: 0.25, proj: 0.5, mat: 'concrete', color: C.castStone });
  // The courtyard furniture, all of it narrow enough for a 1.75 m walk: a cafe
  // table's chairs alone are 1.75 m across, which is the walk with nothing left
  // for the kerb.
  for (const cz of [6.5, 12.5, 18.5]) bench(sim, -34.25, cz);
  marketStall(sim, -34.75, 21.5, 0xc23b2e, 1.5, 1.5);
  sandwichBoard(sim, -34.3, 9.5, 0x2b3038);
}

function shopfronts(sim) {
  // The frontage row at grade. `03` §4.2 pays for storefronts and this is them:
  // stall risers, awnings, hanging signs and the pavement clutter that goes with
  // a shop — all of it inside the row's own footprint or on its own footway.
  // On the row's SOUTH face, at z = -7: that is the Cambridge Street elevation,
  // the one the footway and the carriageway are on. The north face at z = -12
  // backs onto the block interior and has no shop to front.
  //
  // Every run is continuous section to section rather than a 5 m piece on a 6 m
  // pitch: an inset piece repeated at a wider pitch is a sub-extent gap, and the
  // section widths here are not even uniform, so there is no single inset that
  // would work down the row anyway.
  let x = FRONTAGE.x0;
  for (let i = 0; i < FRONTAGE.widths.length; i++) {
    const w = FRONTAGE.widths[i];
    plinth(sim, { x, y: 0, z: -7, w, d: 0.25, h: 0.5, mat: 'concrete', color: 0x7d7468 });
    beam(sim, { x, y: 2.5, z: -7, len: w, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.steelDark });
    for (let k = 0; k < 2; k++) {
      panel(sim, {
        x: x + k * (w / 2), y: 2.75, z: -7, w: w / 2, h: 0.25, axis: 'x', t: 0.5,
        mat: 'panel', color: (i + k) % 2 ? C.awning : 0x7a3b30,
      });
    }
    x += w;
  }
}

function roofPlant(sim) {
  // The rooftop water tank on the tallest section, plus the mechanical
  // penetrations and the stepped parapet jogs where sections meet.
  // Every y here is a section's ROOF TOP — `storeys * STOREY + DECK_T` — not its
  // wall head. The roof plate is 0.5 m thick and sits on the wall head, so
  // anything placed at the wall head is placed inside the plate.
  //
  // The tank is r = 2.0, not 1.5. A `drum` is a ring of identical panels, so its
  // two facets symmetric about an axis are always collinear with the same
  // extent — and whether the gap between them lands above or below that extent
  // is decided by how the facet centres quantise onto the 0.25 m grid. At
  // facets = 12 the radius decides it: 1.5 m gates, 2.0 m does not (swept in
  // `_phase5-deliverables/drumscan.mjs`). Sizing a drum is therefore a probe
  // question as well as a design one.
  for (const [px, py, pz] of [[-60, 18, 12]]) {
    for (const lx of [px, px + 3.5]) {
      for (const lz of [pz, pz + 3.5]) {
        column(sim, { x: lx, y: py, z: lz, h: 0.5, s: 0.25, mat: 'steel', color: C.steelDark });
      }
    }
    // The tank stands on a deck plate, not straight on its four legs. A drum is
    // a ring of staves on a circle and the legs are at the corners of a square:
    // no stave is over a leg, so a tank set directly on them has nothing under
    // any part of it. One plate spans the legs and carries the whole ring.
    slab(sim, { x: px - 0.25, y: py + 0.5, z: pz - 0.25, w: 4.5, d: 4.5, t: 0.25, mat: 'wood', color: 0x5f4a34 });
    drum(sim, { x: px, y: py + 0.75, z: pz, r: 2, h: 3, facets: 12, t: 0.25, mat: 'wood', color: 0x6b5238 });
    slab(sim, { x: px - 0.25, y: py + 3.75, z: pz - 0.25, w: 4.5, d: 4.5, t: 0.25, mat: 'wood', color: 0x5f4a34 });
  }
  for (const [px, py, pz, pw] of [[-53.5, 15.5, 8, 2], [-53.5, 15.5, 16, 1.5], [-47, 13, 10, 1.5], [-38, 15.5, 18, 2]]) {
    pier(sim, { x: px, y: py, z: pz, w: pw, h: 1.25, d: pw, mat: 'steel', color: 0x6e757c });
  }
  for (const [fx, fz, floors] of [[-67, 24.5, 3], [-57, 24.5, 5], [-43, 3, 3], [-58, 3, 4]]) {
    fireEscape(sim, fx, fz, floors, fz > 12 ? 1 : -1, 2, 3, 2.5);
  }
}

// Ground-storey clutter down the mill: the working floor `03` §4.2 pays for.
// It is also the answer to a floor the excursion misses. `03` §9.5 predicted
// that a 62 s run through a vocabulary-built district could come in under 300
// eats where its brick-built twin cleared it easily, and said in advance that
// "the answer is content, not a lower floor". It came in at 289. This is the
// content: it sits directly under the route's spine leg, at grade, in the two
// strips either side of the post line that nothing structural occupies.
function millFloor(sim) {
  let x0 = DAVENPORT.x0;
  for (const w of DAVENPORT.widths) {
    let i = 0;
    for (const cz of [5, 8.5, 12, 15.5, 19, 22.5]) {
      crateStack(sim, x0 + 0.75, cz, 3, 0x8a6a44);
      crateStack(sim, x0 + w - 1.5, cz, i % 2 ? 2 : 3, 0x7d6340);
      i++;
    }
    x0 += w;
  }
}

export function cambridgeSpendBack(sim) {
  millFloor(sim);
  loadingDock(sim);
  rearYard(sim);
  lobbyLink(sim);
  shopfronts(sim);
  roofPlant(sim);
}

// --- THE SHIPPED SCENE -------------------------------------------------------

export function buildCambridge(sim) {
  cambridgeShell(sim, (s) => {
    cambridgeBuildings(FORMS, s);
    cambridgeSpendBack(s);
  });
}
