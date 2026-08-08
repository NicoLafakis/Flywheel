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
// and are deliberately absent.
//
// P6.1 has since added the MAP layer below the plan: `03` §1.2's scale law and
// `02` §6's real-world offset table, which is the ground the other nine
// districts get authored against. It is data and one pure function and emits
// nothing, so District 2's geometry is byte-for-byte what Phase 5 measured.
//
// P6.1 also moved `sim.boundsRect` to `03` §1.1's full-map x[−120,132]
// z[−112,116] and declared the two open-ground spans that rect makes legal. THE
// MAP IS THEREFORE KNOWINGLY UNDER-FILLED: `probeBoundsRect`'s 12 m
// content-slack clause fails against a 252 × 228 m rect holding one district,
// and will keep failing until districts 1 and 3-10 land. That is scaffolding
// rather than a defect, and it is survivable precisely because this scene is not
// registered anywhere yet — not in AUTHORED_SCENES or FREE_PLAY (P6.12), not in
// the validator's scene registry (P8.1) — so nothing runs the shared contract
// against it on the way past. The rect is a designed extent, not a hull, which
// is why it lands once instead of growing per district.
//
// The ten-row district table `03` §4 wants is still absent, for a reason
// recorded in full at CAMBRIDGE_DISTRICTS below: `probeDistrictDensity` derives
// its floor from the rows themselves, so an unbuilt district cannot be stubbed
// at all without failing. Each row lands with its geometry.
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

// --- THE MAP -----------------------------------------------------------------
// `03` §1.2's scale law, and the real-world offset table it consumes. This is
// P6.1's scaffolding: the ground the remaining nine districts get authored
// against. District 2 below PREDATES it and is not derived from it — see the
// discrepancy recorded on `sceneOffset`.
//
// `02` §6 states the obligation this section discharges: whatever compression is
// chosen, RECORD IT IN THE SCENE FILE, "because the offsets above are the only
// thing that will let anyone check the layout later." `03` §1.2 then sharpens it
// from a matter of content into a matter of FORM — the scene file computes its
// positions "from an exported `CAMBRIDGE_OFFSETS` table rather than hardcoding
// them, so a corrected real offset re-derives the layout instead of requiring a
// re-author." Hence data plus a pure function, and no list of scene coordinates
// anywhere: a hardcoded (x, z) is a number nobody can check against a source.

// The East Cambridge grid runs 9.8° clockwise of true north (`02` §2.1). `02`'s
// instruction is to "either author in true north and rotate the grid, or author
// in grid axes and rotate the landmarks. Do one, not both." `03` §2 takes the
// second: the scene's x/z axes ARE the grid, no building is ever rotated, and
// this constant is the only place true north appears in the file.
export const CAMBRIDGE_GRID_ROT = 9.8;

// RING A — the core. Real radius ≤ 340 m of 2 Canal Park: true position in grid
// axes, 1:3 in plan, 1:1.5 in height.
export const RING_A_RADIUS = 340;
export const RING_A_PLAN = 3;
export const RING_A_HEIGHT = 1.5;

// RING B — the shelf. Beyond 340 m real, the BEARING IS PRESERVED EXACTLY and
// only the radius compresses: `scene_r = 113 + (real_r − 340) / 41.9`. Real 340
// → scene 113 (against Ring A's own 340/3 = 113.33, so the declared seam is a
// 0.33 m step rather than a cliff); real 2,054 — the NECCO tower, the furthest
// thing on the map — → scene 154.
//
// FOOTPRINTS AND HEIGHTS DO NOT COMPRESS WITH THE RADIUS. A Ring B landmark
// keeps Ring A's 1:3 / 1:1.5 unless `03` §5 declares a per-landmark exception
// (Museum of Science 1:5 in plan, Longfellow 1:8 in length, Zakim 1:6, Stata
// 1:4). That asymmetry IS the shelf: every object is the right size and only the
// walk between them is compressed, which `03` §5.4 prices honestly — the Great
// Dome sits 155 m away instead of 1,706, an elevenfold lie, bought with bearings
// that are exact to better than a degree.
export const RING_B_SEAM = 113;
export const RING_B_RATE = 41.9;

// 2 Canal Park's authored centre, in z. Spawn is NOT a scene decision —
// `voxelsim.js` hardcodes the hole at (0, 16) for every scene — so the map is
// seated around the spawn point rather than the other way round, and −14 is the
// offset that lands the hero's south facade at z ≈ +3.75 with the spawn disc
// 12 m clear of it on the canal-side forecourt (`03` §1.4).
export const CAMBRIDGE_ORIGIN_Z = -14;

// Rotation factors, derived once. `Math.cos`/`Math.sin` are implementation-
// defined to within an ULP where `Math.sqrt` is not, which would normally be a
// determinism worry in a scene-geometry path (ADR-0006) — it is not one here
// because `sceneOffset` snaps its result to the 0.25 m fine grid, and a 1e-16
// factor error over a 2 km offset moves the raw result by ~1e-13 m. Nothing
// reaches a quantisation boundary from there. `Math.sqrt` is used for the radius
// rather than `Math.hypot` for the same reason, in the direction where it costs
// nothing: `sqrt` is correctly rounded by spec, `hypot` is not.
const ROT = (CAMBRIDGE_GRID_ROT * Math.PI) / 180;
const ROT_COS = Math.cos(ROT), ROT_SIN = Math.sin(ROT);

// `02` §6's table, transcribed. One row per feature, in the doc's own order, so
// a row number here is a row number there.
//
//   E, N     real-world offset from 2 Canal Park in metres, true north, per
//            `02` §6's flat-earth projection at latitude 42.37 (1° lat =
//            111,132 m, 1° lon = 82,238 m). THE ONLY INPUT `sceneOffset` TAKES.
//   plan     real footprint [w, d] in metres, or `null` where `02` gives none.
//            A second element of `null` means the doc gives one dimension only.
//            Rows marked (bbox) in `conf` are the bounding box of an OSM
//            outline and therefore OVER-ESTIMATE a non-rectangular plan — `02`
//            §6's own method note 3, and the reason `03` §1.5 has to correct
//            2 Canal Park by hand.
//   height   real metres, or `[lo, hi]` where the doc states a range rather than
//            a figure. Where `02` had no source it is `storeys × 4.3` for
//            office/residential and `storeys × 3.5` for mill buildings, marked
//            (est.) in `conf` — method note 4, and its instruction: do not
//            treat an estimate as a measurement.
//   conf     `02`'s confidence marker, carried VERBATIM rather than reduced to a
//            flag. Several rows are conflicting or unverified and the next
//            author needs to see which, inline, at the moment they read the
//            number — not to go back to the doc to find out.
//
// The one row that is not a row: the Longfellow (#15) is a bridge and `02` gives
// both its ends, so it carries `E2`/`N2` for the Boston end. `E`/`N` is the
// Cambridge end, which is the one `03` §5.1 tables.
export const CAMBRIDGE_OFFSETS = [
  { id: 1, name: '2 Canal Park (HubSpot)', plan: [104, 71], height: 22, E: 0, N: 0,
    conf: 'Position, footprint, storeys: Confirmed. Height: est. (bbox; 5 storeys)' },
  { id: 2, name: 'The Davenport, 25 First St (HubSpot)', plan: [110, 65], height: [14, 25], E: -123, N: -40,
    conf: 'Position: Confirmed (measured). Footprint and heights: Likely/est. (4–7 storeys, stepped)' },
  { id: 3, name: '1 Canal Park (NOT HubSpot)', plan: [56, 67], height: 17, E: -40, N: -7,
    conf: 'Confirmed (bbox; 4 storeys, height est.)' },
  { id: 4, name: 'Lechmere station + viaduct', plan: [108, 11], height: [9, 12], E: 13, N: 127,
    conf: 'Platform dims: Confirmed. Rail height: est. (platform 108 × 11, curved island)' },
  { id: 5, name: 'Lechmere Canal + basin', plan: [140, 90], height: 0, E: 137, N: -170,
    conf: 'Position: Confirmed. Extent: est. (water level ~0; channel extent is `03` §1.5 exception 2, inferred)' },
  { id: 6, name: '40 Thorndike (ex-courthouse)', plan: [86, 57], height: 86, E: -272, N: -95,
    conf: 'Position/footprint: Confirmed (bbox). Storeys: CONFLICT, 20 vs 22 — `02` says build 20 and record both' },
  { id: 7, name: 'First Street Garage', plan: [123, 75], height: 20, E: -152, N: -125,
    conf: 'Position/footprint: Confirmed (bbox). Height: est.' },
  { id: 8, name: 'Archstone Northpoint', plan: null, height: 95, E: 264, N: -21,
    conf: 'Storeys: Confirmed (OSM, 22). Height: est.' },
  { id: 9, name: 'Twenty|20 at Cambridge Crossing', plan: null, height: 86, E: 375, N: 156,
    conf: 'Storeys: Confirmed (OSM, 20). Height: est.' },
  { id: 10, name: 'CambridgeSide (20 CambridgeSide corner)', plan: [120, 90], height: 43, E: -14, N: -352,
    conf: 'Position: Confirmed. Storeys: Confirmed (10). Footprint: est.' },
  { id: 11, name: 'Royal Sonesta Boston', plan: null, height: 47, E: 98, N: -397,
    conf: 'Storeys: Confirmed (OSM, 11). Height: est.' },
  { id: 12, name: 'Museum of Science', plan: [250, 60], height: 25, E: 428, N: -301,
    conf: 'Position: Confirmed. Dimensions: est. (spans the dam; 4 levels). PLAN 1:5, not 1:3 — `03` §1.5 exception 3' },
  { id: 13, name: 'Charles River Dam / Craigie Bridge', plan: [200, null], height: 6, E: 594, N: -332,
    conf: 'Position: Confirmed. Length and deck height: est.' },
  { id: 14, name: 'North Point Park', plan: [300, 150], height: 0, E: 591, N: -136,
    conf: 'Position: Confirmed. Extent: est. (ground)' },
  { id: 15, name: 'Longfellow Bridge', plan: [539, 32], height: 18, E: -84, N: -949, E2: 222, N2: -967,
    conf: 'Length: Confirmed. Tower height: est., UNVERIFIED (~18 above deck; deck ~9 above water). LENGTH 1:8 — `03` §5.1' },
  { id: 16, name: 'Zakim Bridge', plan: [444, 55], height: 82, E: 1098, N: -172,
    conf: 'Length, width, mast height: Confirmed — the one mast figure that is not an estimate. LENGTH 1:6 — `03` §5.1' },
  { id: 17, name: 'Kendall/MIT station + plaza', plan: [80, 60], height: 6, E: -774, N: -858,
    conf: 'Position: Confirmed. Dimensions and headhouse height: est.' },
  { id: 18, name: 'TD Garden', plan: [200, 150], height: 45, E: 1163, N: -427,
    conf: 'Position: Confirmed. Dimensions: est. — `02`: recognizable by where it is, not by shape' },
  { id: 19, name: 'Bunker Hill Monument', plan: [9, 9], height: 67, E: 1278, N: 690,
    conf: 'Position: Confirmed. Height: Likely (221 ft, widely cited, not re-verified). Base: est.' },
  { id: 20, name: 'Stata Center', plan: [130, 110], height: 40, E: -1181, N: -956,
    conf: 'Position: Confirmed. Dimensions: est., UNVERIFIED (7–9 storeys). PLAN 1:4 — `03` §5.1' },
  { id: 21, name: 'MIT Green Building', plan: [35, 20], height: 84, E: -1072, N: -1092,
    conf: 'Position, height: Confirmed (277 ft architectural; 90 to tip). Footprint: est.' },
  { id: 22, name: 'MIT Great Dome (Bldg 10)', plan: [120, 40], height: 46, E: -1290, N: -1116,
    conf: 'Height and dome diameter (ø 30.5): Confirmed. Position: Likely (approx). Block plan: est.' },
  { id: 23, name: 'Killian Court', plan: [180, 130], height: 0, E: -1249, N: -1265,
    conf: 'Position: Confirmed. Lawn extent: est. (ground)' },
  { id: 24, name: 'Novartis / old NECCO + water tower', plan: [150, 80], height: 30, E: -1791, N: -1006,
    conf: 'Position: Confirmed. Dimensions: est. (tower +12 above the building)' },
  { id: 25, name: 'Citgo sign', plan: [18, 18], height: 30, E: -1578, N: -2372,
    conf: 'UNVERIFIED position AND visibility from East Cambridge. `03` §1.3 leaves it OUT — no backdrop plane exists to demote it to. Carried here so nobody re-derives it as missing data' },
];

// `03` §1.2's law, in one function: real (E, N) offset in true-north metres →
// scene (x, z).
//
//   E' = E·cos(9.8°) − N·sin(9.8°)     grid-east component
//   N' = N·cos(9.8°) + E·sin(9.8°)     grid-north component
//   scene_x =  E' / scale
//   scene_z = −N' / scale − 14
//
// with `scale` fixed at 3 inside Ring A, and outside it replaced by the radial
// map that holds the bearing and compresses the distance.
//
// WHY TWO RINGS AND NOT A SMOOTH CURVE, since the seam is the obvious objection:
// a continuous log compression has no discontinuity but makes every position
// un-recomputable by hand, and `02`'s entire point is that the layout must stay
// CHECKABLE. Two rules of arithmetic can be redone on paper by anyone holding
// `02` §6's table. That is worth a 0.33 m seam.
//
// THE RESULT IS SNAPPED TO THE 0.25 m FINE GRID, through the same `q` the plan
// walker below uses. Every extent in this engine is
// a multiple of 0.25 (ADR-0006's determinism proof rests on it) and so is every
// position that generates one; an unsnapped 38.13 is a placement no builder can
// honour. The cost is that a computed position can sit up to 0.125 m off the
// design-time value `03` prints — which is why `03`'s figures are stated as
// design-time values and this function, not the doc, is the authority.
//
// VERIFIED against the sixteen scene positions `03` states independently of this
// code — the origin seat, Lechmere and 40 Thorndike in Ring A, and thirteen Ring
// B landmarks from CambridgeSide just over the seam (r 352) out to the NECCO
// tower at the far end (r 2,054). All sixteen reproduce inside the doc's own
// rounding plus this function's 0.25 m snap. Ring B is the half worth sampling
// densely, because its error would grow with radius and a couple of near points
// would not show it; it does not grow.
//
// TWO POSITIONS `03` PRINTS ARE NOT THIS FUNCTION'S OUTPUT, and both are the
// doc's, not the law's:
//   1 Canal Park — law (−12.75, −9.5), doc (−13.5, −12.5). DECLARED: `03` §1.5
//     exception 1 re-seats it so its east face stands 18 m real west of the
//     hero's west face, because the two OSM bounding boxes overlap. The law is
//     not the last word wherever §1.5 declares an exception, and a district
//     author must check §1.5 before trusting a computed seat.
//   TD Garden — law (+132.25, +10.25), doc (+130, +10). UNDECLARED: the law puts
//     it 0.25 m outside `maxX` 132 and §5.1 quietly pulls it in. No exception
//     covers it in §1.5 or §5. P6.9 should either declare it or move it; it is
//     recorded here rather than silently reproduced.
//
// ONE DISCREPANCY, RECORDED RATHER THAN RESOLVED. Row 2 is the Davenport, and
// this function puts it at scene (−38.25, +6.0). District 2 as shipped occupies
// x[−71.5,−35] z[+3,+24.5], centred (−53.25, +13.75) — 15 m west and 7.6 m south
// of the law, and the law's own answer would carry the block across First Street
// at x −33. Phase 5 built to `03` §4's approximate district rect, which is not
// the same placement as `03` §1.2's law; the two disagree in the doc, not in the
// code. District 2 is shipped and frozen, so the seating question belongs to
// whoever authors District 1 — the hero is the building the origin is DEFINED by
// (row 1 at (0, 0) → scene (0, −14), which this function reproduces exactly), so
// getting it from the law is what makes the law load-bearing rather than
// decorative. Flagged here so the next author meets it before building on it.
export function sceneOffset(E, N) {
  const gE = E * ROT_COS - N * ROT_SIN;
  const gN = N * ROT_COS + E * ROT_SIN;
  const r = Math.sqrt(gE * gE + gN * gN);
  // Ring A is a plain divide. Ring B rescales the SAME grid vector, so the
  // bearing survives exactly and only its length changes — which is the whole
  // claim `03` §5.4 makes to justify the compression.
  const k = r <= RING_A_RADIUS
    ? 1 / RING_A_PLAN
    : (RING_B_SEAM + (r - RING_A_RADIUS) / RING_B_RATE) / r;
  return { x: q(gE * k), z: q(-gN * k + CAMBRIDGE_ORIGIN_Z) };
}

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
//
// TWO OF `03` §1.4'S FOUR SPANS ARE HERE, and both are provisional. Each is the
// thinnest band that reaches its edge, anchored to a value `03` or `02` states
// rather than to geometry that does not exist yet, and each is owned by a
// district that replaces it with real `sceneDecor` when it builds. Sized to
// shrink, never to excuse: a span that later holds a block fails this probe,
// which is exactly the property that makes an early declaration safe.
//
// THE OTHER TWO CANNOT BE DECLARED, and the reason is the probe rather than the
// paperwork. Recorded so P6.6/P6.8/P6.9 do not re-derive them:
//
//   THE CANAL BASIN IS INTERIOR. `02` §6 row 5 puts it at real E +137 / N −170
//   over ~140 × 90 m, which `sceneOffset` maps to scene (+54.75, +34) spanning
//   roughly x[+31,+78] z[+19,+49] — the middle of the map, some 60 m short of
//   the nearest edge. `probeOpenGround` rejects an interior span outright
//   ("declare only level-edge emptiness, build the rest"), and stretching one to
//   an edge would mean inventing water `02` explicitly denies: it calls this "a
//   short dead-end canal basin ... cut inland from the Charles".
//
//   THE ZAKIM CHANNEL IS UNDER ITS OWN DECK. This probe's emptiness test is 2D
//   (`rectsOverlap` on x/z), so a bridge's deck, piers and masts project onto
//   the water beneath them and no span there can ever be block-free. `03` §5.1
//   also seats the Zakim at (+131, −16), inside district 7's x[+60,+132]
//   z[−90,+16]. A sliver BESIDE the deck would pass, but `03` does not say which
//   side the channel runs, and this file should not be what decides that.
//
// Neither omission costs the dead-ground census anything, which is the point:
// `reportDeadGround` already discounts every sample inside a `sceneDecor.water`
// rect through its own `BY_DESIGN` list, so both are covered the moment their
// district authors the water. Of `03` §1.4's four, only the Inner Belt ballast —
// rail, not water — was ever doing work this list alone could do.
//
// One constraint for P7.3, since it lands on the span below: `03` §8.3 lays the
// edge-band gallery's marks "inside a declared `CAMBRIDGE_OPEN_GROUND` span or
// on an authored apron", and `04` G11 puts the Flywheel sprocket in the Inner
// Belt yard. A mark inside the span makes it non-empty and fails this probe. The
// apron has to sit ADJACENT to a span, never inside one.
export const CAMBRIDGE_OPEN_GROUND = [
  {
    // District 3's, per `03` §4.3. `02` §2 puts the Michael Capuano Inner Belt
    // Carhouse at real E −132 / N +689 and the Green Line Transportation Office
    // at E −337 / N +604 (both Confirmed, OSM), which `sceneOffset` maps to
    // (−42.75, −127.75) and (−76.25, −108.5) — the first of which reproduces the
    // "computed z ≈ −128" that `03` §1.5 exception 4 cites before pulling both
    // radially in to z −100…−108. This is the ballast left north of the
    // pulled-in yard, between it and minZ.
    minX: -80, maxX: -40, minZ: -112, maxZ: -108,
    why: 'Inner Belt yard ballast running out to the north level edge',
  },
  {
    // District 8's, per `03` §4.8. `03` §5.1 seats the Longfellow's Cambridge end
    // at (+10.5, +113) and `sceneOffset` puts its Boston end at (+49.75, +104.5),
    // so this starts east of the deck's 2D footprint rather than under it — the
    // same constraint that keeps the Zakim's channel out of this list entirely.
    minX: 60, maxX: 132, minZ: 113, maxZ: 116,
    why: 'the Charles south of the Longfellow line, at the south level edge',
  },
];

// `probeDistrictDensity` reads these. Only District 2 exists in this file, so
// the probe's density-floor clause (half the scene median) is self-referential
// and always passes; the mean-gap and worst-hole clauses along the scripted
// route are the ones that bind, and they are the ones that matter for combo.
//
// `03` §4's OTHER NINE ROWS ARE DELIBERATELY NOT HERE YET, and the reason is the
// probe rather than the paperwork. The density-floor clause fails any row whose
// rect holds no geometry: an unbuilt district reads as 0.00 pieces/m², which is
// below half of any nonzero median, and the probe cannot tell "empty because
// nobody built it" from "empty because the budget was banked". Declaring all ten
// now takes the Phase 5 gate from ALL PASS to eight density failures — districts
// 3, 6, 7 and 8, the four whose rects do not overlap District 2's geometry,
// across both variants. Measured, not predicted.
//
// It is also not fixable by choosing better stand-in rects for the two rows `03`
// §4 gives none for (District 9 is "the Ring B annulus, all edges", District 10
// is "scene-wide"). Districts 1, 4, 5 and 10 all overlap District 2 whatever
// rect they are given, so at least five of ten rows are always nonzero, so the
// median is always nonzero, so the empty rows always fail. The table becomes
// declarable when the districts it describes are built, one row per P6.x task,
// each rect refined against what actually stands — the same way District 2's own
// rect became x[−72,−25.5] z[−12.5,30] rather than §4's approximate
// x[−72,−26] z[−12,+26] (the frontage row's cornice and dentils project 0.25 m
// north of its wall, so the rect has to reach further out than the footprint
// that generated it).
//
// The two figures that column needs when it lands, checked and recorded so they
// do not have to be re-derived: §4's ten budgets sum to exactly 74,060, and §8.2
// gives District 10 a gap floor of "n/a" — which encodes as an ABSENT `gapFloor`
// field, not a null and not a 15, because the probe reads
// `Math.min(maxGap, d.gapFloor ?? maxGap)` and an absent field falls back to the
// scene-wide 15 m ceiling rather than exempting the row.
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
  // `03` §1.1's full-map rect, landed whole at P6.1 rather than grown district by
  // district: it is a DESIGNED extent — 252 x 228 m, 340 m diagonal, asymmetric
  // so the Zakim clears x 131 against a maxX of 132 (§1.4) — and not a hull of
  // whatever happens to be standing. Districts 1 and 3-10 are still Phase 6 work,
  // so it is knowingly under-filled and `probeBoundsRect`'s 12 m content-slack
  // clause fails against it until they land. See the header note.
  sim.boundsRect = { minX: -120, maxX: 132, minZ: -112, maxZ: 116 };

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
