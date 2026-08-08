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
// `sim.boundsRect` GROWS PER DISTRICT and does not jump to `03` §1.1's designed
// 252 × 228 m extent until every district exists to fill it (P6.10). P6.1 landed
// the full-map rect early and it was reverted: `probeBoundsRect`'s second clause
// fails a rect leaving more than 12 m of blank ground on any side, and it also
// silently moved District 2's own already-measured excursion result — the hole
// is clamped to the rect, so widening it changes where a leg ends. A rect is a
// measurement of what is built, not a statement of intent, and every task widens
// it to hug its own geometry. See `cambridgeShell` and `CAMBRIDGE_BOUNDS`.
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
  hotDogCart, mailbox, drinkingFountain, fenceRun, bus,
  naveChurch, playgroundSet,
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

  // --- DISTRICT 1, CANAL PARK -------------------------------------------
  // `03` §6.4 guard 3 asks that the hero and its neighbour be unconfusable at
  // any distance, and colour is the only channel that survives a silhouette
  // reading at 60 m. So 2 Canal Park gets the district's only warm, saturated
  // brick and 1 Canal Park gets the district's flattest greys — the separation
  // is in the palette before it is in the massing.
  heroBrick: 0xb0563a,       // 2 Canal Park's water-struck red
  heroBrickDeep: 0x9c4830,   // the plinth course and the parapet
  heroBand: 0xc8bda8,        // cast-stone sill/lintel bands
  heroGlass: sp(0x5a7b88),
  heroMullion: 0x39424a,
  heroSteel: 0x59626b,       // the frame: columns, girders
  heroDeck: 0xa9a49a,        // precast floor plates
  // HubSpot's brand orange, and the ONLY use of it anywhere in the scene: the
  // sprocket and the door reveal on the entry court. `probeHeroIdentity` keys
  // on this exact value, so any second use of it — on any building — fails the
  // build. That is the point of it having its own name here.
  hubspotOrange: 0xff7a59,
  // 1 Canal Park, the lab conversion. No mark, no orange, no sprocket:
  // `03` §6.4 guard 1. Very low chroma on purpose.
  labPrecast: 0x9a9c9b,
  labPrecastDeep: 0x87898a,
  labBand: 0xb2b4b3,
  labGlass: sp(0x76807f),
  labMullion: 0x63686a,
  labSteel: 0x7c8183,
  labDeck: 0x9fa2a1,
  // The residential edge: Sierra and Thomas Graves Landing.
  sierraBrick: 0x8e7a68,
  sierraBand: 0xb6b0a4,
  gravesBrick: 0x967f6a,
  gravesBand: 0xbab5aa,
  resGlass: sp(0x6d7f86),
  resMullion: 0x4f565c,
  resSteel: 0x6c7278,
  resDeck: 0xa5a29a,
  // Canal Park's ground.
  granite: 0x8b8b86,         // the forecourt ring and the terrace copings
  terrace: 0x9a9184,
  canalTimber: 0x6b5642,
  planterSoil: 0x4f4133,

  // --- DISTRICT 3, LECHMERE & THE VIADUCT -------------------------------
  // `03` §4's palette bank for this district is "concrete + transit green",
  // and §3's table files the viaduct under **concrete, weathered** at LOW
  // chroma. So the structure is a four-step grey ramp and the ONLY saturated
  // thing in the district is the train — §4.3's "very-high-chroma transit
  // accent, tiny area". That contrast is the district's whole read: a grey
  // line of infrastructure with one green object standing on it.
  viaductPier: 0x83878d,     // pier shafts, plinths — the darkest structural grey
  viaductCross: 0x8e9298,    // crossheads and girders
  viaductDeck: 0x9aa0a6,     // deck soffit plates
  viaductEdge: 0x777b81,     // fascia band and parapet, one step down so the
                             // deck edge reads as a line at distance
  platformDeck: 0xa8aca8,
  platformTactile: 0xc8b24a, // the yellow warning strip along both platform edges
  canopySteel: 0x59626b,
  canopyRoof: 0x8d949b,
  // The Green Line's own livery. Not the HubSpot orange and not near it:
  // `probeHeroIdentity` keys on 0xff7a59 alone, and nothing in this district
  // may carry it (`03` §6.5 — the mark belongs to 2 Canal Park only).
  transitGreen: 0x1a7a4c,
  transitWhite: 0xe4e8e4,
  carGlass: sp(0x4f6a72),
  carSkirt: 0x35393d,
  // Track and yard.
  ballast: 0x6b665e,
  sleeper: 0x4d443a,
  railHead: 0x8a8f94,
  signalMast: 0x4a5158,
  // Busway and street furniture.
  shelterGreen: 0x2f5c48,
  buswayKerb: 0x9d9a92,
  // The north edge (`03` §4.11): the carhouse and the Transportation Office.
  carhouseWall: 0x6f757c,
  carhouseRoof: 0x565c63,
  officeBrick: 0x8a7a68,
  officeBand: 0xa9a294,

  // --- DISTRICT 4, CAMBRIDGE STREET & THE PORTUGUESE SEAM ---------------
  // `03` §4's palette bank for this district is "mill brick, painted timber,
  // awning chroma", and it is the only district in the scene whose dominant
  // material is PAINTED WOOD rather than masonry. That changes how the ramp
  // is built. Brick tones separate on saturation (`02` §7's chroma rule);
  // painted clapboard separates on HUE, because a street of triple-deckers is
  // twenty-two owners each picking a colour from the same hardware shop.
  //
  // SIX CLAPBOARD TONES, ROTATING ON A THREE-CYCLE AGAINST THREE WIDTHS. Not
  // decoration, and not the seven-brick-tones argument repeated: it is what
  // keeps `probePlacementStep` off this district's back. A row of identical
  // houses on a fixed pitch is twenty-two identical front-wall panels at a
  // fixed spacing, which is the exact defect that probe exists to catch. Two
  // consecutive houses therefore never share both a width and a tone, so no
  // two collinear front walls are ever in the same group.
  clapCream: 0xd6cdb6,
  clapSage: 0x9aa88f,
  clapSlate: 0x8c9aa6,
  clapOchre: 0xc4a468,
  clapRose: 0xb98d84,
  clapDove: 0xb4b0a6,
  // Trim, porch and roof. One trim white for the whole street: the corner
  // boards, sills and porch rails are what read as a SHARED vernacular, and
  // varying them too would turn a neighbourhood into a paint chart.
  seamTrim: 0xe8e4d8,
  porchDeck: 0x8a7f6e,
  shopDeck: 0x7a6f5f,
  porchPost: 0xe8e4d8,
  seamRoof: 0x4e4a45,
  seamPlinth: 0x8d8880,
  houseGlass: sp(0x53616b),
  doorRed: 0x7a3b34,
  chimney: 0x7e6a5c,
  // The Cambridge Street storefront row. `02` §7 is binding here: EVOKE, DO
  // NOT NAME. The awnings carry the identity and they carry it in colour
  // alone — a fish market, a bakery, a coffee counter — with no `signText`
  // anywhere in this district. `04` owns the specifics.
  shopBrick: 0xa86b52,
  shopBrickAlt: 0x96604c,
  awningRed: 0xa8342c,
  awningGreen: 0x2f6b4a,
  awningBlue: 0x2a5f8a,
  awningYellow: 0xc9a227,
  shopSill: 0xd8d3c6,
  shopGlass: sp(0x46545c),
  // The two civic anchors at the west end. Both are LOW chroma against the
  // painted street, which is the whole point of a civic building in a
  // residential fabric: it is the thing made of stone.
  bankStone: 0xc6bfae,
  bankBase: 0xa79f8e,
  bankTrim: 0xdcd6c6,
  bankRoof: 0x6a655c,
  churchStone: 0xcdc6b4,
  churchRoof: 0x6f6a62,
  churchGlass: sp(0x3f5a6a),
  // The parks. Named on the ground plane (`03` §4.4) and fenced, which is how
  // a small city park in this neighbourhood actually reads.
  parkFence: 0x37503f,
  parkPath: 0xa89f8e,
  benchWood: 0x7d6a52,
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
  // ROWS 26-33 ADDED AT P6.4, NOT AT P6.1. Every one of `03` §4.4's named line
  // items has a Confirmed offset in `02` §2.4/§2.5 and none of them was
  // transcribed, so District 4 had no derivable position for a single thing it
  // was asked to build. They land here rather than in a scaffolding task for the
  // reason `03` §1.2 gives: the table is the only thing that lets anyone check
  // the layout later, so a row without geometry is a claim nobody has tested.
  // Heights follow `02` §6's own method note 4 — storeys × 4.3 for civic and
  // residential, × 3.5 for mill and industrial — and are marked (est.) as that
  // note instructs, never promoted to measurements.
  //
  // `03` §1.3 MISCLASSIFIES FIVE OF THESE AS RING A. Its prose list puts Costa
  // Lopez, Silva and Toomey parks, the Chang Shing Tofu Factory and American
  // Twine under "In, at Ring A (true position, 1:3 plan)" and only the savings
  // bank under Ring B. Their real radii are 402.0, 418.2, 541.4, 494.1 and
  // 473.9 m, every one of them past §1.2's own 340 m seam, so `sceneOffset`
  // (which implements §1.2, not §1.3) returns Ring B seats for all five. The law
  // and this table agree; §1.3's list is the thing that is wrong, and it is
  // wrong in the direction that matters. Ring A would seat Silva Park at
  // (−139.5,−12.25) — 24.8 m from its Ring B seat and 19.5 m outside `maxX` — and
  // the other four at deltas of 19.5, 41.8, 48.1 and 62.6 m. Verified against
  // §5.4's stated behaviour: bearing survives, radius compresses to
  // 113 + (r − 340)/41.9, which reproduces all five seats to the quarter metre.
  { id: 26, name: 'East Cambridge Savings Bank', plan: null, height: 8.6, E: -378, N: 88,
    conf: 'Position: Confirmed (OSM). Storeys: Confirmed (2). Height: est. (2 × 4.3). Footprint: `02` gives none' },
  { id: 27, name: 'Third Congregational Church', plan: null, height: null, E: -335, N: -36,
    conf: 'Position: Confirmed (OSM). Storeys, footprint AND height: `02` gives none — the only row in this table with no height at all. `02` §7 puts active places of worship under "handle with care"' },
  { id: 28, name: 'Chang Shing Tofu Factory', plan: null, height: 3.5, E: -238, N: -433,
    conf: 'Position: Confirmed (OSM). Storeys: Confirmed (1). Height: est. (1 × 3.5, industrial). CONFLICT: `02` §4 calls it "240 m southwest" but these offsets give a real radius of 494 m — the prose figure matches |E| alone. Offsets used; see the P6.4 report' },
  { id: 29, name: 'Centanni Park', plan: null, height: 0, E: -252, N: -16,
    conf: 'Position: Confirmed (OSM, `02` §2.5). Extent: `02` gives none (ground)' },
  { id: 30, name: 'Silva Park', plan: null, height: 0, E: -413, N: 66,
    conf: 'Position: Confirmed (OSM, `02` §2.5). Extent: `02` gives none (ground). One of the two Portuguese park names `02` §4 calls "the neighbourhood telling you what it is"' },
  { id: 31, name: 'Costa Lopez Park', plan: null, height: 0, E: -314, N: -251,
    conf: 'Position: Confirmed (OSM, `02` §2.5). Extent: `02` gives none (ground). The other Portuguese park name — and it derives to z +71.75, 42 m south of `03` §4.4\'s own rect for the district that owns it' },
  { id: 32, name: 'Timothy J. Toomey, Jr. Park', plan: null, height: 0, E: -366, N: -399,
    conf: 'Position: Confirmed (OSM, `02` §2.5). Extent: `02` gives none (ground)' },
  { id: 33, name: 'American Twine Office Park', plan: null, height: 10.5, E: -328, N: -342,
    conf: 'Position: Confirmed (OSM). Storeys: Confirmed (3). Height: est. (3 × 3.5, converted mill). Footprint: `02` gives none' },
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
  // District 1. Canal Park is a DEAD END in reality and it is one here: it runs
  // north off the forecourt and stops at 2 Canal Park's entry court, which is
  // the whole reason the street reads as the building's address rather than as
  // through traffic. APPENDED, never inserted — `CAMBRIDGE_CROSSINGS` addresses
  // streets by index, so a row inserted above this line silently re-points
  // District 2's five crossings.
  { name: 'Canal Park', axis: 'z', x: 6.5, z: 5, w: 6, d: 25 },
  // District 3, indices 3-5. NORTH FIRST STREET IS NOT FIRST STREET CONTINUED, and the
  // separation is forced by geometry rather than chosen: District 2's First
  // Street sits at x[−33,−27], and 1 Canal Park already occupies x[−39.5,−19.25]
  // z[−38,−12], so extending that carriageway north drives it through a
  // building. `02` gives Lechmere the address 3 North First Street and it is a
  // separate stub in life too, running north off the Lechmere junction. Here it
  // runs in the slot between 1 Canal Park's east flank and the viaduct's west
  // edge (deck minX −10.5 at its northernmost segment), which is the only
  // north-south corridor District 1 left open.
  //
  // It stops at z −39 rather than running down to meet District 1's service
  // yard: 1 Canal Park's east skin stands at x −19.25 as far south as z −38, and
  // a 6 m carriageway at x[−20,−14] that reached past it would have a wall
  // inside its own asphalt — `probeRoadConflicts` gates every block, not just
  // tall ones. The 1 m stub is the district seam, and P6.4 owns closing it.
  { name: 'North First Street', axis: 'z', x: -20, z: -87.5, w: 6, d: 48.5 },
  // The Lechmere junction: the east-west leg that passes UNDER the viaduct and
  // feeds the busway. This is the crossing `03` §9.4 names for
  // `CAMBRIDGE_ROAD_SPANS`, and it is deliberately sited in the one 12 m bay of
  // the viaduct (see `VIADUCT.bents`) so no pier ever stands in a carriageway.
  { name: 'Lechmere Junction', axis: 'x', x: -20, z: -87.5, w: 30, d: 6 },
  // The Lechmere Busway, east of and parallel to the viaduct. Not a public
  // street — a bus-only roadway — but it is a carriageway to every probe, so it
  // is declared as one and its buses are in `CAMBRIDGE_VEHICLES` below. Its west
  // kerb at x 4 clears the viaduct's southernmost deck edge (x 3.25) by 0.75 m,
  // which is the tightest gap in the district and the reason the chords sweep
  // west going north rather than east.
  { name: 'Lechmere Busway', axis: 'z', x: 4, z: -81.5, w: 6, d: 39.5 },
  // District 4, indices 6-8. CAMBRIDGE STREET IS ONE STREET AND TWO ROWS, and
  // the split is bookkeeping rather than geometry: row 0 runs x[−72,−25.5] and
  // this one continues it west to the map edge in the same z band, abutting at
  // exactly x −72. It cannot be widened in place because row 0 is addressed by
  // index — `CAMBRIDGE_CROSSINGS` holds [0,−63], [0,−44] and [0,−34] — and
  // because District 2's kerb runs, footway decor and frontage were all
  // measured against the rect as written at Phase 5.
  { name: 'Cambridge Street West', axis: 'x', x: -120, z: -5.5, w: 48, d: 7 },
  // Gore Street, one block north, and the frontage the twenty-two houses need.
  // `02` gives no offset for it, so it is placed rather than derived: 24.5 m
  // north of Cambridge Street's centreline, which is `03` §1.2's 1:3 of the ~74
  // m the real pair sit apart. Named rather than numbered because every
  // numbered street in this quarter is either already built (First Street) or
  // spoken for by `03` §4.5's Thorndike/Otis/Spring grid.
  { name: 'Gore Street', axis: 'x', x: -120, z: -30, w: 42, d: 6 },
  // Third Street, the north-south connector. Also unoffset in `02`, and placed
  // on the pitch the built map already implies: First Street stands at x −33,
  // and the East Cambridge numbered streets run ~100 real metres apart, which
  // at 1:3 is 33 m — so Third Street lands at −99 by that arithmetic and at −96
  // once its 6 m carriageway is centred on the block it actually divides. It
  // starts at Gore Street's south kerb rather than crossing it: a rect that
  // overlapped Gore Street's would make every block in the junction interior to
  // two carriageways at once.
  { name: 'Third Street', axis: 'z', x: -96, z: -24, w: 6, d: 50 },
];
export const CAM_XW_LEN = 3;
export const CAMBRIDGE_CROSSINGS = [
  [0, -63], [0, -44], [0, -34],
  [1, 4], [1, 21],
  // Both clear of the food-truck row's 18 m of kerb (z 9..27): a zebra painted
  // under a parked truck is legal to every probe and wrong to every eye.
  [2, 5.5], [2, 27],
  // District 3. Both North First Street zebras clear the kerb-parked rows
  // (z −70..−64 and z −52..−46) for the same reason District 1's do.
  [3, -74], [3, -46],
  // Under the viaduct, in the 12 m bay. A crossing here is what the junction is
  // for: it is how the busway's passengers reach the headhouse on the west side.
  [4, -6],
  [5, -72], [5, -46],
  // District 4. All six clear of the kerb ranks below for the same reason
  // District 1's and District 3's do: a zebra painted under a parked car is
  // legal to every probe and wrong to every eye.
  [6, -117], [6, -87],
  [7, -112], [7, -86],
  [8, -20], [8, 10],
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

  // District 1. `d` names the district that EMITS the row; District 2's rows
  // above are `d` 2 by omission. One exported allowlist is what
  // `probeRoadConflicts` needs, but the shell may only emit District 2's — the
  // Phase 5 variants call `cambridgeShell` directly and must stay byte-identical
  // to what they measured. So the table is whole and the emission is filtered.
  //
  // `03` §7.2's food-truck row, along Canal Park's west kerb and pointing north
  // toward Lechmere. Three 6 m vans cover z 9..27 continuously, which is also
  // what carries the density probe up the middle of a 6 m carriageway: nothing
  // else in a street is within the 2.6 m corridor of its own centreline.
  { kind: 'boxVan', x: 6.75, z: 9, axis: 'z', len: 6, cab: 0xd8d3c6, box: 0xc9532f, d: 1 },
  { kind: 'boxVan', x: 6.75, z: 15, axis: 'z', len: 6, cab: 0xd8d3c6, box: 0x2f6b7a, d: 1 },
  { kind: 'boxVan', x: 6.75, z: 21, axis: 'z', len: 6, cab: 0xd8d3c6, box: 0x3d5a3a, d: 1 },
  // A z-axis sedan is 2 m wide in x from its own origin, so x 10.25 parks it
  // 0.25 m off the east kerb at 12.5 — x 11 drove it through the kerb and the
  // footway furniture standing behind it.
  { kind: 'sedan', x: 10.25, z: 12, axis: 'z', body: 0x2f4756, roof: 0x2f4756, d: 1 },
  { kind: 'sedan', x: 10.25, z: 23, axis: 'z', body: 0x8d2f28, roof: 0x8d2f28, d: 1 },
  // District 3. Three buses on the Lechmere Busway, `03` §4.3's line item. A
  // z-axis bus is 6 m along z and 2 m across x from its own origin, so x 4.5 and
  // x 7.5 are the two lanes of a 6 m roadway at x[4,10] with 0.5 m of kerb
  // clearance each side.
  { kind: 'bus', x: 4.5, z: -76, axis: 'z', body: 0x2f6b4f, d: 3 },
  { kind: 'bus', x: 4.5, z: -60, axis: 'z', body: 0xc9a227, d: 3 },
  { kind: 'bus', x: 7.5, z: -68, axis: 'z', body: 0x2f6b4f, d: 3 },
  // North First Street's kerb rank, east side (kerb at x −14).
  { kind: 'sedan', x: -16.25, z: -70, axis: 'z', body: 0x30343b, roof: 0x30343b, d: 3 },
  { kind: 'sedan', x: -16.25, z: -52, axis: 'z', body: 0xd8d3c6, roof: 0x2f4756, d: 3 },
  { kind: 'boxVan', x: -19.75, z: -60, axis: 'z', len: 6, cab: 0xd8d3c6, box: 0x2a4f9a, d: 3 },
  // One car in the junction, under the viaduct.
  { kind: 'sedan', x: -4, z: -86, axis: 'x', body: 0x8d2f28, roof: 0x8d2f28, d: 3 },
  // District 4. Both Cambridge Street West ranks are placed ON the excursion's
  // own corridor rather than beside it: an axis-'x' sedan at z −5.5 occupies
  // z[−5.5,−3.5], so its centre sits exactly on the outbound leg's z −4.5, and
  // the south rank at z −0.5 does the same for the return at z +0.5. That is
  // the difference between a parked car the density probe meets and one it
  // drives past — and a residential street's kerb rank is the cheapest
  // continuous content this district has.
  { kind: 'sedan', x: -113, z: -5.5, axis: 'x', body: 0x30343b, roof: 0x30343b, d: 4 },
  { kind: 'sedan', x: -102, z: -5.5, axis: 'x', body: 0xd8d3c6, roof: 0x8d2f28, d: 4 },
  { kind: 'sedan', x: -83, z: -5.5, axis: 'x', body: 0x3d5a3a, roof: 0x3d5a3a, d: 4 },
  // −114, not −112: a sedan is 5 m long from its origin and the box van behind
  // it starts at −108, so −112 parks the two of them 1 m inside each other.
  { kind: 'sedan', x: -114, z: -0.5, axis: 'x', body: 0x8a6a2e, roof: 0x8a6a2e, d: 4 },
  { kind: 'boxVan', x: -108, z: -0.5, axis: 'x', len: 6, cab: 0xd8d3c6, box: 0x2f6b7a, d: 4 },
  { kind: 'sedan', x: -80, z: -0.5, axis: 'x', body: 0x2f4756, roof: 0x2f4756, d: 4 },
  // Third Street, both lanes. A z-axis sedan is 2 m across x from its origin,
  // so −94.5 and −92.5 are the two lanes of the x[−96,−90] carriageway with
  // 0.5 m of kerb clearance each side.
  { kind: 'sedan', x: -94.5, z: -13, axis: 'z', body: 0x8d2f28, roof: 0x8d2f28, d: 4 },
  { kind: 'sedan', x: -92.5, z: 15, axis: 'z', body: 0x4a4f57, roof: 0x4a4f57, d: 4 },
  { kind: 'motorcycle', x: -94.5, z: -4, axis: 'x', d: 4 },
  // Gore Street.
  { kind: 'sedan', x: -105, z: -30, axis: 'x', body: 0xd8d3c6, roof: 0xd8d3c6, d: 4 },
  { kind: 'sedan', x: -92, z: -26.5, axis: 'x', body: 0x2f6b4f, roof: 0x2f6b4f, d: 4 },
];

// Overhead spans: the ONE case where a physical block may stand inside a
// roadway rect, and only where it is fully inside the declared rect AND its
// underside clears `minY`. `03` §9.4 names the Lechmere viaduct crossing North
// First Street as this scene's first such case.
//
// The rect is stated in BLOCK-RECT terms with a margin, the same way Boston's
// is: `probeRoadConflicts` requires the block to be FULLY inside, and the
// viaduct's northern segment runs x[−10.5,−1.25], so the span runs x[−11,−0.75]
// to leave the parapet and fascia room. `minY` 4.5 sits below the crossheads
// (y 5.0) and above every ground-anchored thing in the junction — a pier that
// drifted into the carriageway would still fail, which is the point.
//
// THE SPAN IS THE WHOLE BAY, NOT THE CARRIAGEWAY. "Fully inside" is a clause
// about the BLOCK, not about the overlap: the girders that cross the junction
// are one 11.75 m member each, running z[−90.25,−78.5], so a span drawn to the
// road's own z[−88,−81] rejects the very structure it exists to admit. The rect
// therefore spans bent to bent. It buys nothing extra — the piers at both bents
// stand clear of the carriageway, and `minY` still holds the ground.
export const CAMBRIDGE_ROAD_SPANS = [
  { minX: -11, maxX: -0.75, minZ: -90.5, maxZ: -78.25, minY: 4.5 },
];

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
// EMPTY AGAIN AT P6.2, and it is the bounds rect that empties it rather than a
// change of mind. `probeOpenGround` requires each span to TOUCH a `boundsRect`
// edge. P6.1's two spans were anchored to `03` §1.1's full-map rect, which this
// task steps back from (see `cambridgeShell`'s `bounds` option) because a rect
// that large fails the same probe's 12 m content-slack clause with only two
// districts standing. Both derivations above survive as prose because they cost
// real work and neither number changes: the Inner Belt ballast at
// x[−80,−40] z[−112,−108] and the Charles at x[60,132] z[113,116] go back in the
// moment their districts land and carry the rect out to meet them — P6.3 and
// P6.8 respectively, and unconditionally by P6.10 when the rect becomes the
// designed extent for good.
//
// P6.3 LANDS THE FIRST ONE, and the span and the rect had to move together in a
// single edit rather than in two: `probeOpenGround` requires each span to touch
// a `boundsRect` edge, so the ballast band is illegal until the rect reaches
// z −112 to meet it, and the rect is illegal at z −112 until `03` §4.11's north
// edge exists to hold its 12 m content slack. Neither half is a valid commit on
// its own — the ballast, the rect and the carhouse/Transportation Office are one
// change. The Charles span stays deferred to P6.8 on the same terms.
export const CAMBRIDGE_OPEN_GROUND = [
  {
    // `03` §1.4's Inner Belt ballast, and the only one of its four spans that
    // ever needed this list: the other three are water, and `reportDeadGround`
    // already discounts a `sceneDecor.water` rect through its own BY_DESIGN set.
    //
    // The band is the yard's north throat beyond the last thing built in it.
    // `03` §4.11 pulls the carhouse and the Transportation Office radially in to
    // z ≈ −100…−108 precisely so the content stops short of here; both are built
    // to a north face at z −107.5, which leaves this 4 m band genuinely empty
    // rather than empty-until-someone-needs-the-room. The extent is the one
    // derived at P6.1 and preserved in the prose above, unchanged: this task
    // confirmed it against the built geometry rather than re-deriving it.
    minX: -80, maxX: -40, minZ: -112, maxZ: -108,
    why: 'Inner Belt yard ballast, north of the carhouse throat, at the level edge',
  },
];

// `probeDistrictDensity` reads these. Districts 1 and 2 exist in this file, so
// the density-floor clause (half the scene median) is now a real two-row
// comparison rather than the self-referential one it was at Phase 5; the
// mean-gap and worst-hole clauses along the scripted route still bind hardest,
// and they are the ones that matter for combo.
//
// THE TWO RECTS OVERLAP, and that is `03` §4's own arithmetic rather than a
// mistake here: §4 gives District 1 x[−46,+40] and District 2 x[−72,−26], which
// share x[−46,−26], and both run through z[−12,+24]. The geometry does NOT
// overlap — 1 Canal Park sits at z[−35,−12.75], north of District 2's z range —
// but the RECTS do, so 1,359 of District 2's pieces stand inside District 1's
// rect and are counted toward its density. Measured both ways: District 1 reads
// 3.42 pieces/m² with the overlap in and 3.26 with it taken back out, and §8.2's
// floor for it is 3.0, so the clause passes on District 1's own brickwork and not
// on its neighbour's. Recorded rather than resolved: making the rects disjoint
// means either abandoning 1 Canal Park's west half or moving a district boundary
// §4 sets, and neither is P6.2's to decide.
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
//
// TWO ROWS NOW, AND THEIR RECTS OVERLAP BY 13.5 m IN x. That is `03` §4's own
// arithmetic, not a slip here: §4 gives District 1 x[−46,+40] and District 2
// x[−72,−26], which overlap by 20 m before either is refined. Refining both
// against built geometry narrows it (−39.5 against −25.5) but cannot close it,
// because 1 Canal Park genuinely stands west of First Street's east footway and
// District 2's footway genuinely runs past it. Overlapping rects are legal —
// `probeDistrictDensity` scores each row independently and a block may be inside
// both — but the consequence is worth stating: part of District 1's measured
// density is District 2's First Street furniture. Reported, not hidden.
export const CAMBRIDGE_DISTRICTS = [
  {
    id: 1,
    name: 'Canal Park',
    // REFINED AGAINST WHAT STANDS, not transcribed from `03` §4.1's approximate
    // x[−46,+40] z[−36,+24]. West to 1 Canal Park's outer skin at −39.5 rather
    // than −46 (nothing is built in the 6.5 m beyond it); east to the canal
    // terrace's coping at +30.5 rather than +40; north to the service yard's
    // plant enclosure at −36.5; south to the terrace's south coping at +27.
    //
    // SIERRA AND THOMAS GRAVES LANDING ARE OUTSIDE IT, deliberately. `02` §6
    // seats them at real (E+111,N+115) and (E+141,N−92), which `sceneOffset`
    // maps to (+30,−58) and (+51.5,+8.25) — 22 m north of §4.1's rect and 11.5 m
    // east of it. Both are built at the law's position (`03` §1.2 is the
    // authority and §1.5 declares no exception for either), so the rect is drawn
    // around Canal Park proper and leaves them to the districts whose rects
    // actually reach them. Sierra lands inside §4.3's District 3
    // (x[−40,+40] z[−80,−36]); Thomas Graves Landing lands in NO declared rect
    // in `03` §4 at all. Both recorded for P6.3 and P6.6 rather than forced.
    rect: { minX: -39.5, maxX: 30.5, minZ: -36.5, maxZ: 27 },
    budget: 11270,    // `03` §4.1
    gapFloor: 6,      // `03` §8.2's floor for District 1 — the tightest in the
                      // scene, and the reason every route leg below runs over
                      // furnished ground rather than down a carriageway.
  },
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
  {
    id: 3,
    name: 'Lechmere & the Viaduct',
    // REFINED AGAINST WHAT STANDS, and this one departs from `03` §4.3's
    // approximate x[−40,+40] z[−80,−36] much further than District 1's did.
    // Two reasons, both measured rather than argued.
    //
    // EAST: §4.3's rect reaches x +40, which swallows SIERRA — District 1's
    // 8-storey residential slab at x[+19.5,+40.5] z[−63.75,−48], seated there by
    // `sceneOffset(111,115)` and recorded on District 1's row above. A rect that
    // holds a neighbour's tower measures the neighbour: Sierra alone contributes
    // more pieces than this district's entire busway, and it would carry the
    // density clause on ground District 3 never built. So the east edge stops at
    // +11, the busway's outer kerb. The number that would have been reported at
    // §4.3's own rect is in the P6.3 report, both ways, rather than hidden.
    //
    // WEST: §4.3's x −40 covers ground that belongs to 1 Canal Park (District 1
    // owns x[−39.5,−19.25] up to z −38). District 3 builds nothing west of North
    // First Street's west kerb at −17.
    //
    // NORTH: −88, the viaduct's north abutment, rather than §4.3's −80. The
    // viaduct is 49.5 m long and it does not fit in a 44 m rect.
    //
    // THE §4.11 NORTH EDGE IS OUTSIDE THIS RECT ON PURPOSE. The carhouse and the
    // Transportation Office stand at z ≈ −100…−107.5, and §4.11 is explicit that
    // they are "not a district in its own right — the north tail of districts 3
    // and 7". They exist to hold `boundsRect`'s 12 m content slack at z −112,
    // and they are 12 m of open yard away from anything else, so a rect stretched
    // to hold them would report a hole this district's own ground does not have.
    rect: { minX: -18, maxX: 11, minZ: -88, maxZ: -36 },
    budget: 5000,     // `03` §4.3. §4.11's ~600-block north edge is drawn from
                      // this budget and District 7's; since D3 builds BOTH of
                      // §4.11's buildings, D7 should not re-spend its share.
    gapFloor: 12,     // `03` §8.2's floor for District 3 — the most forgiving in
                      // the scene, and §8.2 says why: "a viaduct is a line of
                      // piers with gaps between them." The mitigation it names —
                      // busway, shelters, kerbs and track furniture running
                      // continuously between bents — is built, and the measured
                      // mean gap is far inside 12 rather than just under it.
  },
  {
    id: 4,
    name: 'Cambridge Street & the Portuguese seam',
    // REFINED AGAINST WHAT STANDS, and the departure from `03` §4.4's
    // x[−120,−58] z[−28,+30] is measured in both directions rather than argued.
    //
    // EAST: −72 rather than −58. §4.4's east edge reaches 14 m into District
    // 2's built block and would annex 2,007 of its pieces (31% of District 2's
    // 6,535) into this district's density. Nothing §4.4 asks for stands there:
    // every item with a derivable position lands west of x −72, which is
    // District 2's own west edge, so the two rects ABUT instead — the first
    // pair in this scene that do. `rectsOverlap` is open, so an abutting edge
    // costs nothing, and the three-district run of overlapping rects stops
    // here. The number §4.4's rect-as-written would have reported is in the
    // P6.4 report, both ways.
    //
    // WEST: −120, the map edge, which §4.4 already gives. Silva Park's own
    // offset (−114.75 centre, 9.5 m wide) reaches −119.5 and is what carries
    // `CAMBRIDGE_BOUNDS` out to −120 this task.
    //
    // NORTH: −41 rather than −28. §4.4's z −28 predates Gore Street, and Gore
    // Street is not optional: twenty-two triple-deckers need ~77 m of frontage
    // and Cambridge Street alone offers 48, of which the storefront row, the
    // bank, the church and two parks already claim most. The ten-house row on
    // its north side reaches z −40.25 with its rear porches.
    //
    // MEASURED BOTH WAYS, for P6.10: §4.4's rect as written reports 6,942
    // pieces over 1,647 cells (4.22/m²) — but 2,007 of those pieces are District
    // 2's, and it MISSES 1,186 of District 4's own, all of them on Gore Street
    // at z[−39.88,−28.25]. The rect below reports 6,121 over 1,418 (4.32/m²)
    // with zero pieces shared with any neighbour.
    //
    // SOUTH: +26 rather than +30. Row D's last house reaches exactly +26 and the
    // church +22.75; nothing this district builds goes further.
    //
    // NOT IN THIS RECT, on purpose: Costa Lopez Park at (−76,+71.75) and the
    // Chang Shing Tofu Factory at (−38,+96.25). See the district's own note
    // above — both are Ring B items whose bearings land them outside the map as
    // it currently stands, and both are recorded at `CAMBRIDGE_OFFSETS` 31 and
    // 28 rather than force-fitted into a rect they are 46 m and 70 m outside.
    rect: { minX: -120, maxX: -72, minZ: -41, maxZ: 26 },
    budget: 8600,     // `03` §4.4. Ships at 6,121 blocks over 1,418 built cells:
                      // 71% of budget, 4.32 piece(s)/m² against §8.2's 2.6
                      // target. THE UNDERSPEND IS SCENE-WIDE, NOT LOCAL — every
                      // district built so far lands in the same band (D1 72.6%,
                      // D2 66.7%, D3 65.3%, D4 71.2%), because §4's per-object
                      // figures are cube-era counts and ADR-0013 collapses a
                      // whole wall course into one piece. §4.4 budgets a
                      // triple-decker at ~150 blocks; the built one is 71, and
                      // it is not thinner — it is the same house in anisotropic
                      // primitives. Line by line: houses 1,562 vs 3,300,
                      // storefront row 294 vs 1,900, bank 98 vs 480, church 959
                      // vs 620, parks 782 vs 700 with only two of the three
                      // built, tofu factory 0 vs 260 (deferred, Ring B), street
                      // furniture ~2,400 vs 1,340. Budget is a ceiling and the
                      // density clause is the floor; the floor is cleared by
                      // 66%, so the gap was reported rather than padded out.
    gapFloor: 8,      // `03` §8.2's floor for District 4 — joint second-tightest
                      // in the scene, and the mitigation §8.2 names is the
                      // district itself: "the density reservoir. Twenty-two
                      // triple-deckers with porches." A stacked porch is ~15
                      // separately-eatable members on a 3 m frontage, which is
                      // what makes an 8 m ceiling reachable without a mass.
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
// P6.2 PREPENDS DISTRICT 1 AND SHIFTS DISTRICT 2 BY 43 s rather than appending.
// Appending is the cheaper edit and it is the wrong one: the run starts at the
// hardcoded spawn (0, 16), which is now inside District 1's forecourt, so a
// route that opens 33 m west of it makes the first leg a traverse of ground
// nobody scores. The legs below start where the player starts.
//
// Two properties of the old note change with the second district. Spawn is now
// INSIDE `boundsRect`, so the first moving frame no longer snaps the hole to the
// east edge — the 3 s idle-stability probe and the excursion both now begin in
// the front-door ring, which is what `03` §7.2 asked for. And the run is 105 s
// rather than 62; anything that hardcodes 62 measures the first two thirds of
// it. Every leg is still placed against the density probe's 2.6 m corridor, and
// District 1's 6 m gap floor is half as forgiving as District 2's, so the legs
// here hug furnished ground harder: the Canal Park leg runs 0.75 m off the
// food-truck row rather than down the crown of the carriageway.
//
// CURRENT LENGTH, kept here so nothing downstream has to count: 43 legs, 580.1 m
// of arc, 256 s. It was 62 s at P5, 105 at P6.2, 185 at P6.3, 245 at P6.4's first
// draft and 256 once leg 4 was extended to the savings bank's park front. `03`
// §7.4's own column says leg 4 should LEAVE at ~3 min; the drift is P6.2's and
// P6.3's prepends, not this leg's pace, and it compounds with every district
// added ahead of the ones already written.
export const CAMBRIDGE_ROUTE = [
  { until: 4, x: 0, z: 20.5 },     // south out of the front-door ring
  { until: 8, x: 2.5, z: 25 },     // southeast across the forecourt
  { until: 13, x: 9.5, z: 26 },    // east onto Canal Park
  { until: 20, x: 9.5, z: 11 },    // north up the food-truck row
  { until: 24, x: 4.5, z: 6 },     // northwest onto the entry plaza
  { until: 29, x: -8, z: 1.5 },    // west along the hero's south apron bosque
  { until: 34, x: -20, z: -1 },    // west across the link plaza
  // --- `03` §7.4 LEG 2: north to Lechmere. INSERTED HERE, NOT APPENDED, and
  // for a different reason than P6.2's prepend. §7.4 puts Lechmere second, ahead
  // of the Davenport, because it is the recognition beat and it has to land
  // "while the player is still small enough to be impressed by a station"; an
  // appended leg would reach it at the size that eats it in one pass. The loop
  // returns to EXACTLY (−20, −1), so every District 2 leg below keeps its own
  // geometry and its own duration and moves only in time — the same discipline
  // P6.2 used, for the same reason: District 2's excursion result was measured
  // once and a re-routed leg would silently re-measure it.
  // THE TRANSIT LEGS BEND AT THE DISTRICT SEAM (z −36) BECAUSE NO SINGLE x CAN
  // SERVE BOTH SIDES OF IT. District 1's continuous frontage on this line is 1
  // Canal Park's east skin at x −19.38..−19.88, which needs x ≤ −17.28 to sit
  // inside the 2.6 m corridor. District 3's is North First Street's east kerb at
  // x −13.875 — the street's own rect is x[−20,−14], so nothing of District 3's
  // can stand west of that — which needs x ≥ −16.475. The two windows do not
  // intersect. A single straight leg at x −17 measured green on the mean (0.11 m)
  // and still opened a 21.9 m hole in District 1 and a 21.4 m one in District 3,
  // because it ran down the one line that is 2.9 m from everything and 2.6 m from
  // nothing. So: −17.5 while District 1 owns the ground, −16 once District 3
  // does, and the jog between them inside District 3's first 4 m, where the
  // pass-in gap it costs is 3 m against a 20 m ceiling.
  { until: 40, x: -17.5, z: -16 },  // north into the slot between 1 and 2 Canal Park
  { until: 46, x: -17.5, z: -36 },  // north past 1 Canal Park's east flank, to the seam
  { until: 48, x: -16, z: -40 },    // the jog east onto North First Street's east kerb
  { until: 55, x: -16, z: -60 },    // up the kerb rank, past the station chord
  { until: 62, x: -16, z: -84.5 },  // to the Lechmere junction
  { until: 67, x: -6, z: -84.5 },   // east through the viaduct's junction bay
  { until: 72, x: 6.5, z: -79 },    // onto the Lechmere Busway
  { until: 82, x: 6.5, z: -58 },    // south past the station, beside the platform
  { until: 89, x: 6.5, z: -44 },    // to the busway's south end
  { until: 95, x: -5, z: -40 },     // west under the viaduct's south abutment
  // THE RETURN TAKES THE OTHER SIDE OF THE SLOT, AND IT HAS TO. `projectOnRoute`
  // gives each piece to exactly ONE leg — the nearest — so an out-and-back that
  // retraces its own line hands every piece to the outbound and leaves the
  // return pass with zero met pieces and a 30.6 m hole. Two legs sharing a slot
  // therefore need two continuous ranks, one each: the outbound at x −17.5 takes
  // 1 Canal Park's east skin (x −19.38..−19.88, 1.88−2.38 m away, and 3.13 m
  // from the return), the return at x −16.25 takes the service yard's new west
  // fence and 2 Canal Park's west skin (x −13.88..−14.38, 1.88−2.38 m away, and
  // 3.13 m from the outbound). Neither leg can reach the other's rank, which is
  // the point.
  { until: 99, x: -16, z: -40 },     // back onto North First Street's east kerb
  { until: 102, x: -16.25, z: -35 }, // across the seam onto the slot's east side
  { until: 108, x: -16.25, z: -12 }, // south along the yard fence and 2 Canal Park
  { until: 114, x: -20, z: -1 },    // back to the link plaza, where leg 2 began
  // --- District 2 resumes, every leg +80 s and otherwise untouched ---
  { until: 118, x: -26, z: 1 },     // to Cambridge Street's east kerb stub
  { until: 123, x: -26.5, z: 12 },  // north up First Street's east footway
  { until: 129, x: -33.5, z: 12 },  // across First Street to the service walk
  { until: 137, x: -33.5, z: 26 },  // south along the mill's east gable
  { until: 145, x: -44, z: 26 },    // west along the rear yard
  { until: 153, x: -50, z: 20 },    // north in through the mill's south range
  { until: 165, x: -68, z: 14 },    // west down the mill spine
  { until: 174, x: -68, z: 5 },     // north through the west end
  { until: 185, x: -36, z: 2.2 },   // east along the Cambridge Street frontage
  // --- `03` §7.4 LEG 4: out along Cambridge Street to the Portuguese seam and
  // the savings bank. APPENDED, unlike leg 2: §7.4 puts this one AFTER the
  // Davenport, so the ordering the doc asks for and the ordering the file
  // already has agree, and District 2's nine legs keep their times as well as
  // their geometry.
  //
  // IT GOES OUT ON THE NORTH SIDE AND STAYS THERE, and that is forced rather
  // than chosen. District 2's own last leg runs east at z +2.2, which is 1.7 m
  // from any return this leg could take along the south kerb — inside the 2.6 m
  // corridor, so `projectOnRoute` would hand District 2's whole south-side rank
  // to whichever leg won the tie and leave the other with a 32 m hole. The
  // north side is free: no existing leg comes within 6 m of it, so this one
  // takes the frontage row's kerb, posts and parked cars without moving a
  // single piece off a leg that already measured green.
  //
  // IT ALSO DOES NOT COME BACK. §7.4's leg 5 is "back east into Thorndike
  // Civic", so the return east is P6.5's to author down Thorndike's own
  // streets, not a retrace of this one. An out-and-back here would hit exactly
  // the trap P6.3 hit at Lechmere.
  // THE WESTBOUND LEG RUNS AT z −5.5, NOT −4.5, WEST OF x −88. One course further
  // south puts Silva Park's north railing 2.375 m off the line instead of 3.375,
  // which is the difference between inside and outside the 2.6 m corridor: 147
  // more of the park's pieces are met for 1.6 m of extra arc. The bend happens at
  // x −88 rather than at the district seam so that District 2's own stretch of
  // this leg keeps the geometry it measured green under.
  { until: 189, x: -44, z: -4.5 },     // northwest onto Cambridge Street's north kerb line
  { until: 197, x: -66, z: -4.5 },     // west past the frontage row's shopfronts
  { until: 205, x: -88, z: -5.5 },     // across the district seam at x −72, easing onto the kerb line
  { until: 212, x: -108, z: -5.5 },    // west along Silva Park's railings
  { until: 215, x: -117, z: -5.5 },    // to the west end, below the savings bank
  { until: 217, x: -117, z: 0.5 },     // across to the south kerb, under the awnings
  { until: 223, x: -99, z: 0.5 },      // east along the storefront row
  { until: 225, x: -94.5, z: 0.5 },    // into the Third Street junction
  { until: 233, x: -94.5, z: -22 },    // north up Third Street's west kerb rank
  { until: 237, x: -94.5, z: -32.75 }, // across Gore Street onto the house frontage
  { until: 246, x: -119, z: -32.75 },  // west along Row A's stacked porches, to the map edge
  // AND THEN BACK DOWN THE WEST EDGE TO THE BANK'S OWN FRONT. §7.4 names the
  // savings bank in this leg and the leg as first drawn never reached it: the
  // Gore Street return passes its BACK at 9.00 m, four times the corridor, and a
  // stub along that face was measured and met 2 of its 98 pieces. The bank fronts
  // SOUTH onto Silva Park — that is what the offsets produce and what the
  // building actually does — so the face that can be met is the park face, and
  // this pair of legs meets 72 of 98. Down the west edge rather than diagonally
  // across, because the diagonal drives through the bank's own footprint.
  { until: 252, x: -119, z: -16 },     // south past the bank's west flank
  { until: 256, x: -108, z: -16 },     // east along its park front, and out toward leg 5
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
  {
    // The one the whole scene is about. `hero` is 2 Canal Park's envelope plus
    // its entry court; `notHero` is 1 Canal Park's, drawn generously so that a
    // mark drifting even 1 m off the hero lands in it rather than in the gap
    // between them. Both AABBs are read off the built footprints below, not off
    // `03` §1.5's design-time figures.
    id: 'canal-park-sprocket',
    colorKey: C.hubspotOrange,
    hero: { minX: -15.5, maxX: 16, minZ: -26, maxZ: 6.5, minY: 0, maxY: 16 },
    notHero: { minX: -40, maxX: -19, minZ: -36.5, maxZ: -12 },
  },
];

// `03` §6.5's signage declaration, carried in the doc's own shape. `color` is
// the one field added to it: the probe needs a key and a colour kept only in a
// doc cannot be checked against a build (the same reason `budget` rides on the
// district rows). The two counts are RESERVES, not measurements — see
// `sprocketPanel` for what the raster actually spends against them, and why the
// difference is banked rather than padded out.
export const HERO_SIGNAGE = {
  placement: 'entry',
  face: 'canal',
  markBlocks: 120,
  doorBlocks: 40,
  color: C.hubspotOrange,
};

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

// --- DISTRICT 1: CANAL PARK --------------------------------------------------
// `03` §4.1's 11,270-block district: 2 Canal Park and its entry court, the
// 1 Canal Park lab conversion, Canal Park itself, the front-door ring, the canal
// forecourt and terrace, the two residential slabs, the service yard, and the
// street furniture that ties them together.
//
// THE 1980s OFFICE VOCABULARY IS A DIFFERENT WALL FROM THE MILL'S, and that is
// the point of building it with the same nine atoms. District 2's wall is a
// masonry pier run with punched openings; this one is a storey-height bay of
// pier, spandrel, sill band, twin lights and lintel band, on a 2.75 m floor to
// floor (`03` §6.1) rather than the mill's 2.5. Same emitters, different
// grammar — which is what makes ADR-0013's claim a vocabulary claim rather than
// a one-building trick.
//
// FIVE RULES SHAPE EVERY NUMBER BELOW, and four of them are `probePlacementStep`
// wearing different hats. Recorded here once instead of at each call site:
//
//   1. TWO LIGHTS PER BAY, NEVER EQUAL. `bayLights` splits the glazed part of a
//      bay into unequal panes, so the pair inside one bay is never two identical
//      collinear boxes a mullion apart — the gate condition, and the same one
//      `lobbyLink` hit from the other direction.
//   2. THE ODD BAY GOES AT THE END OF A RUN. Bays of equal width abut, so their
//      repeated members sit gap 0 apart; an odd bay in the middle would put a
//      sub-extent gap between the two equal runs either side of it.
//   3. EVERY INTERIOR STRIP IS A DIFFERENT WIDTH. Floor plates repeat along the
//      frame, and two equal plates separated by a 0.5 m column line are exactly
//      the defect. Unequal strips also off-centre the column grid, which is what
//      a real deep-plan floor plate does anyway.
//   4. GLAZED HEIGHT ≤ HALF THE FLOOR PITCH. A 2.5 m light on a 2.75 m storey
//      repeats 0.25 m above itself; 1.25 m on 2.75 leaves a 1.5 m gap and
//      passes. This is why the storey stack carries a 1 m spandrel rather than
//      full-height glass, and it is a physics answer as much as a probe one —
//      glass carries no load, so it needs a bearing course every storey.
//   5. COLUMNS RUN THE FULL PITCH; PLATES SIT BESIDE THEM ON GIRDERS. A column
//      that stops under each plate leaves a plate-thickness gap in its own
//      stack. District 2 proved the pattern on timber; `frameGrid` is the steel
//      version of it.
//
// WHAT IS DELIBERATELY NOT HERE: `03` §4.1's ~870-block glyph and egg reserve —
// the Cutaway at E36–E38 and the G6 anamorph — belongs to P7.3/P7.4 and is
// banked, not spent. This district therefore targets ~10,400, not 11,270.

const PIER_W = 0.75;      // jamb pier in plan
const MUL_W = 0.25;
const WALL_D = 0.75;      // wall zone: 0.25 m skin outboard of a 0.5 m pier
const SP_H = 1.0;         // spandrel apron
const BAND_H = 0.25;      // sill and lintel bands
const D1_STOREY = 2.75;   // `03` §6.1

// Footprints. Every one is the OUTER envelope including the wall zone, and every
// extent is a multiple of 0.25 (ADR-0006).
//
// 1 CANAL PARK MOVED NORTH, and the deviation is large enough to state plainly.
// `03` §1.5 exception 1 fixes its EAST face 6 m (scene) clear of the hero's west
// face, which pins x to [−38.75,−20] and is honoured exactly. It says nothing
// about z, and the law's own z — around −9.5 — puts the building through three
// things that already exist: District 2's frontage row (x[−72,−35] z[−12,−7]),
// Cambridge Street's carriageway (z[−5.5,+1.5] across the full map width), and
// First Street's (x[−33,−27]). Nothing in §1.5 or §6.4 licenses moving a shipped
// street, so the building moves instead: z[−35,−12.75], about 34 real metres
// north of its true seat. THE COST IS TO §6.4 GUARD 4 — "the two Canal Park
// buildings must read as neighbours" — because they now meet at a corner rather
// than face to face across 6 m. Recorded, not silently absorbed: whoever
// re-seats District 4's Cambridge Street can give this back.
export const CANAL_PARK = {
  hero:   { x0: -14,    z0: -24.25, w: 28,    d: 20.5,  storeys: 5 },
  court:  { x0: 1.75,   z0: -3.75,  w: 12.5,  d: 8.25,  storeys: 3 },
  lab:    { x0: -38.75, z0: -35,    w: 18.75, d: 22.25, storeys: 4 },
  // Both at `sceneOffset`'s answer for `02` §6's rows, footprints estimated
  // (the doc gives neither a plan nor a height for either — `02` §6 method note
  // 4's territory) and heights at §6.1's 8 storeys.
  sierra: { x0: 20,     z0: -63,    w: 20,    d: 10,    storeys: 8 },
  graves: { x0: 42.25,  z0: 4,      w: 18.5,  d: 8.5,   storeys: 8 },
};

const HERO_PAL = {
  brick: C.heroBrick, band: C.heroBand, glass: C.heroGlass,
  mullion: C.heroMullion, steel: C.heroSteel, deck: C.heroDeck,
  parapet: C.heroBrickDeep,
};
const LAB_PAL = {
  brick: C.labPrecast, band: C.labBand, glass: C.labGlass,
  mullion: C.labMullion, steel: C.labSteel, deck: C.labDeck,
  parapet: C.labPrecastDeep,
};
const SIERRA_PAL = {
  brick: C.sierraBrick, band: C.sierraBand, glass: C.resGlass,
  mullion: C.resMullion, steel: C.resSteel, deck: C.resDeck,
  parapet: C.sierraBand,
};
const GRAVES_PAL = {
  brick: C.gravesBrick, band: C.gravesBand, glass: C.resGlass,
  mullion: C.resMullion, steel: C.resSteel, deck: C.resDeck,
  parapet: C.gravesBand,
};

// The glazed part of a bay, split into two UNEQUAL lights. `a` is always at
// least 0.25 m narrower than `b`, and both are 0.25 m multiples by construction.
function bayLights(bw) {
  const rem = bw - PIER_W - 2 * MUL_W;
  const a = q(rem / 2) - 0.25;
  return [a, rem - a];
}

// One face of one storey. `axis` is the direction the face RUNS; `v` is the min
// coordinate of its 0.75 m wall zone on the other plan axis; `u0` where it
// starts along its own.
function curtainFace(sim, o) {
  const { axis, u0, v, y, bays, pal } = o;
  const glH = D1_STOREY - SP_H - 2 * BAND_H;
  const gy = y + SP_H + BAND_H;
  let u = u0;
  for (const bw of bays) {
    if (axis === 'x') pier(sim, { x: u, y, z: v, w: PIER_W, h: D1_STOREY, d: WALL_D, mat: 'brick', color: pal.brick });
    else pier(sim, { x: v, y, z: u, w: WALL_D, h: D1_STOREY, d: PIER_W, mat: 'brick', color: pal.brick });
    let g = u + PIER_W;
    for (const pane of bayLights(bw)) {
      const seg = MUL_W + pane;
      if (axis === 'x') {
        panel(sim, { x: g, y, z: v, w: seg, h: SP_H, axis: 'x', t: WALL_D, mat: 'brick', color: pal.brick });
        beam(sim, { x: g, y: y + SP_H, z: v, len: seg, axis: 'x', t: BAND_H, depth: WALL_D, mat: 'concrete', color: pal.band });
        mullion(sim, { x: g, y: gy, z: v + 0.25, h: glH, s: MUL_W, mat: 'steel', color: pal.mullion });
        panel(sim, { x: g + MUL_W, y: gy, z: v + 0.25, w: pane, h: glH, axis: 'x', t: 0.25, mat: 'glass', color: pal.glass });
        beam(sim, { x: g, y: gy + glH, z: v, len: seg, axis: 'x', t: BAND_H, depth: WALL_D, mat: 'concrete', color: pal.band });
      } else {
        panel(sim, { x: v, y, z: g, w: seg, h: SP_H, axis: 'z', t: WALL_D, mat: 'brick', color: pal.brick });
        beam(sim, { x: v, y: y + SP_H, z: g, len: seg, axis: 'z', t: BAND_H, depth: WALL_D, mat: 'concrete', color: pal.band });
        mullion(sim, { x: v + 0.25, y: gy, z: g, h: glH, s: MUL_W, mat: 'steel', color: pal.mullion });
        panel(sim, { x: v + 0.25, y: gy, z: g + MUL_W, w: pane, h: glH, axis: 'z', t: 0.25, mat: 'glass', color: pal.glass });
        beam(sim, { x: v, y: gy + glH, z: g, len: seg, axis: 'z', t: BAND_H, depth: WALL_D, mat: 'concrete', color: pal.band });
      }
      g += seg;
    }
    u += bw;
  }
}

// The steel frame and its plates. Columns run the FULL storey pitch so they
// stack gap-free; the girders flank each column line and the plates land on the
// girders, which is the only arrangement where nothing floats and nothing
// repeats at a sub-extent gap. `strips` are the plate widths along x (all
// different — rule 3), `frames` the bay depths along z (odd one first — rule 2).
function frameGrid(sim, o) {
  const { x0, z0, strips, frames, storeys, pal } = o;
  const colXs = [];
  let cx = x0;
  for (let i = 0; i < strips.length - 1; i++) { cx += strips[i]; colXs.push(cx); cx += 0.5; }
  const colZs = [];
  let cz = z0;
  for (const f of frames) { colZs.push(cz); cz += f; }
  colZs.push(cz - 0.5);
  for (let s = 0; s < storeys; s++) {
    const y = s * D1_STOREY;
    for (const colX of colXs) {
      for (const pz of colZs) {
        column(sim, { x: colX, y, z: pz, h: D1_STOREY, s: 0.5, mat: 'steel', color: pal.steel });
      }
      let bz = z0;
      for (const f of frames) {
        for (const gx of [colX - 0.5, colX + 0.5]) {
          beam(sim, { x: gx, y: y + D1_STOREY - 0.75, z: bz, len: f, axis: 'z', t: 0.5, depth: 0.5, mat: 'steel', color: pal.steel });
        }
        bz += f;
      }
    }
    let sx = x0;
    for (const w of strips) {
      let bz = z0;
      for (const f of frames) {
        slab(sim, { x: sx, y: y + D1_STOREY - 0.25, z: bz, w, d: f, t: 0.25, mat: 'concrete', color: pal.deck });
        bz += f;
      }
      sx += w + 0.5;
    }
  }
}

// Dentil course, cornice, parapet and coping, at the wall head. The order is the
// mill's and for the same reason: the dentils sit level with the top lintel band
// so they have something to take a bearing off sideways, the cornice sits on the
// dentils, and the parapet stands ON the wall head rather than behind a
// projecting cornice with nothing under it.
function capBuilding(sim, o) {
  const { x0, z0, w, d, y, pal } = o;
  const x1 = x0 + w, z1 = z0 + d;
  const faces = [
    { axis: 'x', u0: x0, len: w, v: z0, out: z0 - 0.25 },
    { axis: 'x', u0: x0, len: w, v: z1 - WALL_D, out: z1 },
    { axis: 'z', u0: z0 + WALL_D, len: d - 2 * WALL_D, v: x0, out: x0 - 0.25 },
    { axis: 'z', u0: z0 + WALL_D, len: d - 2 * WALL_D, v: x1 - WALL_D, out: x1 },
  ];
  for (const f of faces) {
    for (let o2 = 0; o2 + 0.5 <= f.len; o2 += 1.0) {
      if (f.axis === 'x') panel(sim, { x: f.u0 + o2, y: y - 0.25, z: f.out, w: 0.5, h: 0.25, axis: 'x', t: 0.25, mat: 'concrete', color: C.castStoneDeep });
      else panel(sim, { x: f.out, y: y - 0.25, z: f.u0 + o2, w: 0.5, h: 0.25, axis: 'z', t: 0.25, mat: 'concrete', color: C.castStoneDeep });
    }
    if (f.axis === 'x') {
      cornice(sim, { x: f.u0, y, z: f.out, run: f.len, axis: 'x', t: 0.25, proj: 0.25, mat: 'concrete', color: pal.band });
      panel(sim, { x: f.u0, y, z: f.v, w: f.len, h: 0.75, axis: 'x', t: WALL_D, mat: 'brick', color: pal.parapet });
      beam(sim, { x: f.u0, y: y + 0.75, z: f.v, len: f.len, axis: 'x', t: 0.25, depth: WALL_D, mat: 'concrete', color: pal.band });
    } else {
      cornice(sim, { x: f.out, y, z: f.u0, run: f.len, axis: 'z', t: 0.25, proj: 0.25, mat: 'concrete', color: pal.band });
      panel(sim, { x: f.v, y, z: f.u0, w: f.len, h: 0.75, axis: 'z', t: WALL_D, mat: 'brick', color: pal.parapet });
      beam(sim, { x: f.v, y: y + 0.75, z: f.u0, len: f.len, axis: 'z', t: 0.25, depth: WALL_D, mat: 'concrete', color: pal.band });
    }
  }
}

// A plinth course wrapping a building, cut into ≤5 m runs. The cut is the grade
// clause: `plinth`'s own doc says never past 6 m in plan at grade, and
// `probeGradeDiagonal` fails anything past an 8 m plan diagonal at gy 0.
function plinthBand(sim, o) {
  const { x0, z0, w, d, color, skipSouthFrom } = o;
  const run = (ax, az, len, axis) => {
    for (let t = 0; t < len - 0.01; t += 5) {
      const l = Math.min(5, len - t);
      plinth(sim, axis === 'x'
        ? { x: ax + t, y: 0, z: az, w: l, d: 0.75, h: 0.5, mat: 'concrete', color }
        : { x: ax, y: 0, z: az + t, w: 0.75, d: l, h: 0.5, mat: 'concrete', color });
    }
  };
  run(x0 - 0.75, z0 - 0.75, w + 1.5, 'x');
  run(x0 - 0.75, z0 + d, skipSouthFrom === undefined ? w + 1.5 : skipSouthFrom - (x0 - 0.75), 'x');
  run(x0 - 0.75, z0, d, 'z');
  run(x0 + w, z0, d, 'z');
}

// A whole office block: skin, frame, cap, plinth. Four buildings run through it.
function curtainBlock(sim, o) {
  const { x0, z0, w, d, storeys, longAxis, xBays, zBays, strips, frames, pal, skipSouthFrom } = o;
  const x1 = x0 + w, z1 = z0 + d;
  for (let s = 0; s < storeys; s++) {
    const y = s * D1_STOREY;
    if (longAxis === 'x') {
      curtainFace(sim, { axis: 'x', u0: x0, v: z0, y, bays: xBays, pal });
      curtainFace(sim, { axis: 'x', u0: x0, v: z1 - WALL_D, y, bays: xBays, pal });
      curtainFace(sim, { axis: 'z', u0: z0 + WALL_D, v: x0, y, bays: zBays, pal });
      curtainFace(sim, { axis: 'z', u0: z0 + WALL_D, v: x1 - WALL_D, y, bays: zBays, pal });
    } else {
      curtainFace(sim, { axis: 'z', u0: z0, v: x0, y, bays: zBays, pal });
      curtainFace(sim, { axis: 'z', u0: z0, v: x1 - WALL_D, y, bays: zBays, pal });
      curtainFace(sim, { axis: 'x', u0: x0 + WALL_D, v: z0, y, bays: xBays, pal });
      curtainFace(sim, { axis: 'x', u0: x0 + WALL_D, v: z1 - WALL_D, y, bays: xBays, pal });
    }
  }
  frameGrid(sim, { x0: x0 + WALL_D, z0: z0 + WALL_D, strips, frames, storeys, pal });
  capBuilding(sim, { x0, z0, w, d, y: storeys * D1_STOREY, pal });
  plinthBand(sim, { x0, z0, w, d, color: pal.parapet, skipSouthFrom });
}

// `03` §6.5's mark. ONE call site, called ONCE, from 2 Canal Park's own origin —
// which is the whole content of §6.4 guard 2: the sprocket is not a decal the
// scene can sprinkle, it is a property of one building, so there is exactly one
// function and exactly one caller and both live inside `canalParkHero`.
//
// A 12 x 12 cell raster on the 0.25 m grid (3.0 x 3.0 m), emitted as horizontal
// runs so the whole mark is 18 blocks rather than 88 cells. Each row rests on
// the row below and the bottom row rests on the sign rail, so the mark is a
// supported stack rather than a decal that falls on frame one.
//
// AUTHORED, NOT SAMPLED. `03` §6.5 says to use the current official brand asset
// and not to redraw it; there is no asset in this repo to sample, so this is a
// sprocket silhouette at the declared grid and the raster is the thing P7.3
// should replace when the asset lands. Flagged rather than passed off as traced.
// It spends 18 of `HERO_SIGNAGE.markBlocks`' 120: the reserve is sized for a
// sampled raster at this grid, and padding a cleaner shape out to hit a
// reserved number would be spending budget on nothing.
const SPROCKET = [
  '....#..#....',
  '....####....',
  '..########..',
  '.##########.',
  '###......###',
  '#..........#',
  '#..........#',
  '###......###',
  '.##########.',
  '..########..',
  '....####....',
  '....#..#....',
];

function sprocketPanel(sim, o) {
  const { x, yTop, z0 } = o;
  // The rail the mark stands on, and the only non-orange piece of the assembly:
  // it takes its bearing sideways off the wall and hands the raster a vertical
  // bearing, which a glass wall could never do (glass receives support and never
  // passes it on).
  beam(sim, { x, y: yTop - SPROCKET.length * 0.25 - 0.25, z: z0 - 0.25, len: SPROCKET[0].length * 0.25 + 0.5, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.heroSteel });
  for (let r = 0; r < SPROCKET.length; r++) {
    const row = SPROCKET[r];
    const y = yTop - (r + 1) * 0.25;
    let c = 0;
    while (c < row.length) {
      if (row[c] !== '#') { c++; continue; }
      let n = 0;
      while (c + n < row.length && row[c + n] === '#') n++;
      panel(sim, { x, y, z: z0 + c * 0.25, w: n * 0.25, h: 0.25, axis: 'z', t: 0.25, mat: 'panel', color: C.hubspotOrange });
      c += n;
    }
  }
}

// The glazed entry court: `03` §6.1's 12 x 8 m, three storeys, on the hero's
// canal-facing corner. A different wall from the office bays above it — a
// transom-and-spandrel curtain wall on a steel frame, which is what a 2010s
// lobby insertion into an 1980s block actually looks like.
// A run terminates on its last bay and no further. The obvious-looking closing
// mullion past the end of the run has nothing under it — the bands and panels
// stop at `u0 + sum(bays)` — so it would be a floating post at every storey.
// The corner is closed by the adjacent wall's own plane instead.
function courtWall(sim, o) {
  const { axis, u0, v, y, bays } = o;
  let u = u0;
  const put = (kind, uu, len, yy, h) => {
    if (axis === 'x') {
      if (kind === 'band') beam(sim, { x: uu, y: yy, z: v, len, axis: 'x', t: h, depth: 0.25, mat: 'steel', color: C.heroSteel });
      else panel(sim, { x: uu, y: yy, z: v, w: len, h, axis: 'x', t: 0.25, mat: kind, color: kind === 'glass' ? C.heroGlass : C.heroBand });
    } else if (kind === 'band') {
      beam(sim, { x: v, y: yy, z: uu, len, axis: 'z', t: h, depth: 0.25, mat: 'steel', color: C.heroSteel });
    } else {
      panel(sim, { x: v, y: yy, z: uu, w: len, h, axis: 'z', t: 0.25, mat: kind, color: kind === 'glass' ? C.heroGlass : C.heroBand });
    }
  };
  const post = (uu, yy, h) => (axis === 'x'
    ? mullion(sim, { x: uu, y: yy, z: v, h, s: MUL_W, mat: 'steel', color: C.heroMullion })
    : mullion(sim, { x: v, y: yy, z: uu, h, s: MUL_W, mat: 'steel', color: C.heroMullion }));
  for (const bw of bays) {
    put('band', u, bw, y, BAND_H);
    post(u, y + 0.25, 1.25);
    put('glass', u + MUL_W, bw - MUL_W, y + 0.25, 1.25);
    put('band', u, bw, y + 1.5, BAND_H);
    put('panel', u, bw, y + 1.75, 1.0);
    u += bw;
  }
}

function entryCourt(sim) {
  const K = CANAL_PARK.court;
  const x0 = K.x0, z0 = K.z0, x1 = x0 + K.w, z1 = z0 + K.d;
  const top = K.storeys * D1_STOREY;
  // The frame. Its plates are the court's floors and its top plate is its roof.
  frameGrid(sim, {
    x0: x0 + 0.25, z0, strips: [3.25, 3.75, 4.0], frames: [4, 4],
    storeys: K.storeys, pal: HERO_PAL,
  });
  for (let s = 0; s < K.storeys; s++) {
    const y = s * D1_STOREY;
    // West wall (the plaza side), south wall, east wall. The north side is the
    // hero's own south elevation and is deliberately left as it stands.
    courtWall(sim, { axis: 'z', u0: z0, v: x0, y, bays: [3.75, 4.25] });
    courtWall(sim, { axis: 'x', u0: x0, v: z1 - 0.25, y, bays: [3.75, 4.0, 4.5] });
    courtWall(sim, { axis: 'z', u0: z0, v: x1 - 0.25, y, bays: [3.75, 4.25] });
  }
  // Coping around the roof, in three runs so no two identical pieces meet at a
  // sub-extent gap and nothing at grade is implicated.
  beam(sim, { x: x0, y: top, z: z1 - 0.25, len: K.w, axis: 'x', t: 0.25, depth: 0.25, mat: 'concrete', color: C.heroBand });
  beam(sim, { x: x0, y: top, z: z0, len: K.d - 0.25, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.heroBand });
  beam(sim, { x: x1 - 0.25, y: top, z: z0, len: K.d - 0.25, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.heroBand });

  // THE DOOR. `HERO_SIGNAGE.doorBlocks`' orange, on the canal face under the
  // mark. Jambs and fins stand on the threshold, the header stands on them, and
  // the sign rail stands on the header — one load path from the pavement to the
  // sprocket.
  const dz0 = -2.0, dLen = 4.5;
  plinth(sim, { x: x1, y: 0, z: dz0, w: 0.25, d: dLen, h: 0.25, mat: 'concrete', color: C.hubspotOrange });
  for (const jz of [dz0, dz0 + dLen - 0.25]) {
    mullion(sim, { x: x1, y: 0.25, z: jz, h: 2.25, s: MUL_W, mat: 'steel', color: C.hubspotOrange });
  }
  for (const fz of [-1.25, -0.5, 0.75, 1.5]) {
    mullion(sim, { x: x1, y: 0.25, z: fz, h: 2.25, s: MUL_W, mat: 'steel', color: C.hubspotOrange });
  }
  beam(sim, { x: x1, y: 2.5, z: dz0, len: dLen, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.hubspotOrange });
  // Entry canopy, outboard over the terrace approach.
  for (const cz of [-1.75, -0.25, 1.25]) {
    slab(sim, { x: x1 + 0.25, y: 2.5, z: cz, w: 1.25, d: 1.5, t: 0.25, mat: 'steel', color: C.hubspotOrange });
  }
  return { x1, top };
}

function canalParkHero(sim) {
  const H = CANAL_PARK.hero;
  curtainBlock(sim, {
    x0: H.x0, z0: H.z0, w: H.w, d: H.d, storeys: H.storeys, longAxis: 'x',
    xBays: [4, 4, 4, 4, 4, 4, 4],
    zBays: [3, 4, 4, 4, 4],
    strips: [3.25, 3.5, 4.0, 4.5, 3.0, 2.75, 2.5],
    frames: [3, 4, 4, 4, 4],
    pal: HERO_PAL,
    skipSouthFrom: CANAL_PARK.court.x0 - 0.75,
  });
  const court = entryCourt(sim);
  // The mark, from the hero's own origin: one call, one call site.
  sprocketPanel(sim, { x: court.x1 + 0.25, yTop: 6.0, z0: -1.25 });

  // Roof plant on the hero. `ry` is the ROOF DECK'S TOP FACE — the top storey's
  // plates end at `storeys * D1_STOREY`, and the parapet above that stands on
  // the wall head, not on the deck. Anything placed at the coping's level
  // instead is placed 1 m above the only thing that could carry it.
  const ry = H.storeys * D1_STOREY;
  for (const [px, pz, pw] of [[-9, -20, 2], [-3.5, -20, 1.5], [4, -19, 2], [-6, -9, 1.5]]) {
    pier(sim, { x: px, y: ry, z: pz, w: pw, h: 1.25, d: pw, mat: 'steel', color: 0x6e757c });
  }
  // Stair and lift overrun.
  plinth(sim, { x: 7, y: ry, z: -12.5, w: 4, d: 4, h: 0.5, mat: 'concrete', color: C.heroDeck });
  for (let s = 0; s < 2; s++) {
    curtainFace(sim, { axis: 'x', u0: 7, v: -12.5, y: ry + 0.5 + s * D1_STOREY, bays: [4], pal: HERO_PAL });
  }
}

function oneCanalPark(sim) {
  const L = CANAL_PARK.lab;
  curtainBlock(sim, {
    x0: L.x0, z0: L.z0, w: L.w, d: L.d, storeys: L.storeys, longAxis: 'z',
    xBays: [3.25, 3.5, 3.5, 3.5, 3.5],
    zBays: [4.25, 4.5, 4.5, 4.5, 4.5],
    strips: [2.5, 2.75, 3.0, 3.25, 3.75],
    frames: [3.75, 4.25, 4.25, 4.25, 4.25],
    pal: LAB_PAL,
  });
  // The conversion's tell: lab exhaust stacks and a chilled-water plant on the
  // roof, and a covered goods entrance on the north gable. NO MARK, NO ORANGE,
  // NO SPROCKET anywhere on this building — `03` §6.4 guard 1, and the reason
  // `probeHeroIdentity`'s `notHero` box is drawn around it.
  const ry = L.storeys * D1_STOREY;
  for (const sx of [-36, -33.5, -31, -28.5]) {
    mullion(sim, { x: sx, y: ry, z: -30, h: 3.5, s: 0.5, mat: 'steel', color: 0x8d9298 });
  }
  // The two chiller sets stand their own width apart in BOTH plan axes. Any
  // closer and the pair reads to `probePlacementStep` as one mis-stepped run —
  // the same rule District 2's yard transformers are spaced by.
  plinth(sim, { x: -27, y: ry, z: -22, w: 5, d: 4, h: 0.5, mat: 'concrete', color: C.labDeck });
  for (const [px, pz] of [[-26.5, -21.5], [-23.5, -21.5]]) {
    pier(sim, { x: px, y: ry + 0.5, z: pz, w: 1.5, h: 1.0, d: 1.5, mat: 'steel', color: 0x7f868c });
  }
  // Covered goods entrance on the north gable, clear of the wall zone.
  for (const gx of [-35, -30]) {
    column(sim, { x: gx, y: 0, z: -37.5, h: 3.0, s: 0.5, mat: 'steel', color: C.labSteel });
  }
  slab(sim, { x: -35.5, y: 3.0, z: -38, w: 6, d: 3, t: 0.25, mat: 'steel', color: 0x6e757c });
}

function residentialEdge(sim) {
  const S = CANAL_PARK.sierra;
  curtainBlock(sim, {
    x0: S.x0, z0: S.z0, w: S.w, d: S.d, storeys: S.storeys, longAxis: 'x',
    xBays: [4, 4, 4, 4, 4],
    zBays: [4.25, 4.25],
    strips: [3.5, 4.0, 4.5, 5.0],
    frames: [4.25, 4.25],
    pal: SIERRA_PAL,
  });
  const G = CANAL_PARK.graves;
  curtainBlock(sim, {
    x0: G.x0, z0: G.z0, w: G.w, d: G.d, storeys: G.storeys, longAxis: 'x',
    xBays: [3.5, 3.75, 3.75, 3.75, 3.75],
    zBays: [3.5, 3.5],
    strips: [3.5, 3.75, 4.0, 4.25],
    frames: [3.5, 3.5],
    pal: GRAVES_PAL,
  });
}

// `03` §7.2's front-door ring. A granite seat ring on an octagonal outline, one
// quadrant authored and mirrored, every piece 0.5 m so SIZE 1 can take it.
//
// THE OUTLINE IS THE WHOLE POINT AND IT IS WHY THIS IS NOT A RING OF BOLLARDS.
// The target is that all 32 headings out of spawn meet something eatable inside
// 6 m. A prop is a point: sixteen bollards on a 4.75 m circle cover about a
// quarter of the headings between them and the rest of the sweep finds nothing.
// A CONTINUOUS outline covers every heading by construction — consecutive pieces
// meet at a face or at a corner, and a corner is angularly complete because a
// ray either side of it enters one piece or the other. Measured band: nearest
// face 4.25 m, furthest corner 5.26 m, so it clears the 4 m spawn disc on the
// inside and the 6 m target on the outside with room either way.
const RING_C = { x: 0, z: 16 };
const RING_QUARTER = [
  [0, -4.75], [0.5, -4.75], [1.0, -4.75], [1.5, -4.75], [2.0, -4.75],
  [2.25, -4.25], [2.75, -3.75], [3.25, -3.25], [3.75, -2.75],
  [4.25, -2.25], [4.25, -1.75], [4.25, -1.25], [4.25, -0.75], [4.25, -0.25],
];

function frontDoorRing(sim) {
  const seen = new Set();
  for (const [dx, dz] of RING_QUARTER) {
    for (const [sx, sz] of [[dx, dz], [-dx - 0.5, dz], [dx, -dz - 0.5], [-dx - 0.5, -dz - 0.5]]) {
      const key = `${sx},${sz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plinth(sim, { x: RING_C.x + sx, y: 0, z: RING_C.z + sz, w: 0.5, d: 0.5, h: 0.5, mat: 'concrete', color: C.granite });
      // A seat back on the two straight runs facing the hero and the canal, so
      // the ring reads as furniture rather than as a kerb.
      if (Math.abs(sz + 0.25) > 4.4) {
        plinth(sim, { x: RING_C.x + sx, y: 0.5, z: RING_C.z + sz, w: 0.5, d: 0.5, h: 0.5, mat: 'wood', color: C.canalTimber });
      }
    }
  }
}

// Canal Park's kerbs, and the furniture that carries the density probe up a 6 m
// carriageway. Cut into 5 m runs for the same grade reason as District 2's.
function canalParkStreet(sim) {
  const kerb = (x, z, len, axis) => {
    for (let o = 0; o < len - 0.01; o += 5) {
      const l = Math.min(5, len - o);
      beam(sim, axis === 'x'
        ? { x: x + o, y: 0, z, len: l, axis: 'x', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb }
        : { x, y: 0, z: z + o, len: l, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb });
    }
  };
  for (const kx of [6.25, 12.5]) kerb(kx, 5.5, 24, 'z');
  // West footway: the food-truck row's customer side, and the leg the excursion
  // runs. Everything on a 5 m pitch, deconflicted by hand the way District 2's
  // schedule is — these are 1.5 m walks and a 2 m prop overhangs a carriageway.
  for (const z of [6, 16, 26]) lampPost(sim, 5.75, z);
  for (const z of [9, 19]) bollard(sim, 5.75, z, C.steelDark);
  for (const z of [12, 22]) trashBin(sim, 5.6, z, 0x33453a);
  newsBox(sim, 5.5, 14, 0xc23b2e);
  newsBox(sim, 5.5, 15.5, 0x2a4f9a);
  hydrant(sim, 5.6, 24);
  for (const z of [13.5, 20.5]) bench(sim, 13, z);
  for (const z of [8, 18, 28]) lampPost(sim, 13.25, z);
  for (const z of [11, 24]) bollard(sim, 13.25, z, C.steelDark);
  planter(sim, 12.75, 16, 1.5, 1, 0x5d6a4a);
  mailbox(sim, 12.75, 26.5, 0x2a4f9a);
  // z 27, not 29: the board hangs 1 m beyond the post and the footway ends at 30.
  signPost(sim, 5.75, 27, 0x2c6e4f, 2, 'z', 1.0);
}

// The canal forecourt and terrace: `03` §4.1's plinth stepping down toward the
// water. THE WATER ITSELF IS NOT DECLARED HERE. `02` calls the basin "a short
// dead-end canal basin cut inland from the Charles" and `03` §4.6 gives it to
// District 6; a half-built body of water would have to satisfy `probeRimmedWater`
// against a rim nobody has authored yet. The terrace is built to the edge it
// will meet, and P6.6 brings the water up to it.
function canalTerrace(sim) {
  // Three steps down eastward, each its own ground-anchored course.
  for (let i = 0; i < 3; i++) {
    const y = 0.75 - i * 0.25;
    for (let z = 8; z < 26; z += 4.5) {
      plinth(sim, { x: 17 + i * 2.5, y: 0, z, w: 2.5, d: 4.5, h: y, mat: 'concrete', color: C.terrace });
    }
  }
  for (let z = 8; z < 26; z += 4.5) {
    plinth(sim, { x: 24.5, y: 0, z, w: 4, d: 4.5, h: 0.25, mat: 'concrete', color: C.granite });
  }
  // The coping the water will meet, and the rail behind it. The coping sits ON
  // the granite course, INSIDE its western half — a coping outboard of the last
  // plinth is a coping standing on nothing.
  for (let z = 8; z < 26; z += 6) {
    beam(sim, { x: 28, y: 0.25, z, len: 6, axis: 'z', t: 0.25, depth: 0.5, mat: 'concrete', color: C.granite });
  }
  fenceRun(sim, { x: 29.25, z: 8, len: 17.5, axis: 'z', h: 1.0, mat: 'steel', color: 0x4a5158 });
  // The furniture stands ON the steps, not through them: every prop below takes
  // the top face of the course it occupies as its `y`.
  for (const z of [9, 15, 21, 26]) lampPost(sim, 16.5, z);
  for (const z of [11, 17, 23]) bench(sim, 22.5, z, 0.25);
  for (const z of [12.5, 19.5]) planter(sim, 20, z, 1.5, 1, 0x5d6a4a, 0.5);
  for (const [tx, tz] of [[15.5, 12], [15.5, 18], [15.5, 24]]) tree(sim, tx, tz);
  // `03` §7.2's "planters along the canal edge", on the granite course between
  // the last step and the coping. 1.25 m wide so the run stops exactly where the
  // coping starts rather than growing through it.
  for (const z of [9, 12.5, 16, 19.5, 23]) planter(sim, 26.75, z, 1.25, 1, 0x5d6a4a, 0.25);
  // `03` §7.2's private outdoor patio, at grade on the terrace's north apron
  // rather than on the steps: `cafeTable` builds from its own floor and there is
  // no version of it that starts on a raised course.
  for (const x of [18.5, 21, 23.5, 26]) cafeTable(sim, x, 6.75);
}

// The service yard, dock, ramp and plant north of the hero — `03` §4.1's line
// item, and the district's one piece of back-of-house.
function serviceYard(sim) {
  wedge(sim, { x: -13, y: 0, z: -30, w: 5, d: 3, h: 1.0, axis: 'x', from: 'max', riser: 0.25, mat: 'concrete', color: 0x8b8378 });
  plinth(sim, { x: -8, y: 0, z: -30, w: 5, d: 3, h: 1.0, mat: 'concrete', color: 0x8b8378 });
  plinth(sim, { x: -3, y: 0, z: -30, w: 4.5, d: 3, h: 1.0, mat: 'concrete', color: 0x847c72 });
  wedge(sim, { x: 1.5, y: 0, z: -30, w: 2, d: 3, h: 1.0, axis: 'x', from: 'min', riser: 0.25, mat: 'concrete', color: 0x8b8378 });
  for (const px of [-8, -3.5, 1]) {
    column(sim, { x: px, y: 1.0, z: -28.25, h: 2.5, s: 0.25, mat: 'steel', color: C.steelDark });
  }
  beam(sim, { x: -8, y: 3.5, z: -28.25, len: 9.25, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.steelDark });
  slab(sim, { x: -8.25, y: 3.75, z: -30.25, w: 4.5, d: 2.25, t: 0.25, mat: 'steel', color: 0x6e757c });
  slab(sim, { x: -3.75, y: 3.75, z: -30.25, w: 5, d: 2.25, t: 0.25, mat: 'steel', color: 0x686f76 });
  // The parking ramp down to the basement, and the plant enclosure beside it.
  // 6 x 3.5 m, not 8 x 5: `probeGradeDiagonal` caps a piece that meets grade at
  // an 8 m plan diagonal, and 8 x 5 is 9.43 m across the corners.
  wedge(sim, { x: 5, y: 0, z: -35, w: 6, d: 3.5, h: 2.0, axis: 'x', from: 'min', riser: 0.25, mat: 'concrete', color: 0x7f7a72 });
  shippingContainer(sim, -13, 0, -34.5, 6, 0xb4552f);
  shippingContainer(sim, -13, 3, -34.5, 6, 0x2f6b7a);
  for (const x of [-6, -4.5, -3]) crateStack(sim, x, -34.5, 3, 0x8a6a44);
  for (const x of [-11, -1]) trashBin(sim, x, -26.5, 0x33453a);
  trashBags(sim, 3, -26.5, 0x22262c);
  // Backed up east of the container stack, not into it.
  bigTruck(sim, -6, -33.5, 0xd8d3c6, true);
  lightMast(sim, 12, -34, 6, 0x39414d);
  lightMast(sim, -13, -26, 6, 0x39414d);
  fenceRun(sim, { x: -14, z: -36, len: 28, axis: 'x', h: 1.5, mat: 'steel', color: 0x3a4450 });
  // The yard's WEST return, added in P6.3. A yard fenced on three sides and open
  // to the street it backs onto was already odd; what forced it is that the
  // Lechmere excursion's return leg comes down this alley, and District 1 had
  // 13 m of nothing on its east side (z −36 to −23.5) — a 12.2 m hole against a
  // 10 m ceiling. It starts at z −35.75 rather than −36 because the south run
  // already owns the corner cell.
  fenceRun(sim, { x: -14, z: -35.75, len: 10.75, axis: 'z', h: 1.5, mat: 'steel', color: 0x3a4450 });
}

// `03` §4.1's trees, lamps, benches, hydrants, vehicles and signage — the layer
// that turns four buildings and a street into a place, and the layer the
// district's 6 m gap floor actually rides on. The apron bosque between the hero
// and the forecourt is load-bearing for it: the excursion's westbound legs run
// 5 m off the hero's south wall, which is twice the density probe's corridor.
function canalParkProps(sim) {
  for (const tx of [-12, -8, -4, 0]) tree(sim, tx, 1.0);
  for (const tx of [-14, -10, -6, -2]) lampPost(sim, tx + 0.5, 3.0);
  for (const bx of [-11, -5]) bench(sim, bx, 3.25);
  for (const tx of [-16, -20, -24]) tree(sim, tx, 0.0);
  // The westmost lamp stops at -25: its head is 0.5 m wide, and Cambridge
  // Street's carriageway runs to x -25.5.
  for (const x of [-18, -22, -25]) lampPost(sim, x, -2.0);
  for (const x of [-17, -21]) bollard(sim, x, 1.5, C.steelDark);
  for (const x of [-19, -23]) planter(sim, x, 2.0, 1.5, 1, 0x5d6a4a);
  bikeRack(sim, -20.5, -5.5, 3, 'x');
  drinkingFountain(sim, -24.5, 2.5);
  hydrant(sim, -15.5, -2.0);
  // The forecourt itself, outside the ring: the working plaza `03` §7.2 asks
  // for, all of it 0.25/0.5 m grain so the opening can start on any of it.
  for (const [px, pz] of [[-7.5, 9], [-7.5, 22], [1.5, 8], [1.5, 24]]) cafeTable(sim, px, pz);
  for (const [px, pz] of [[-11, 12], [-11, 20]]) bikeRack(sim, px, pz, 4, 'z');
  for (const [px, pz] of [[-14, 8], [-14, 26]]) marketStall(sim, px, pz, 0xc23b2e, 2, 2);
  // Both stand OUTSIDE the seat ring's z band (11.25 to 20.75). Anything on the
  // ring's own footprint is a prop placed through a 0.5 m granite course.
  hotDogCart(sim, 2.5, 8);
  sandwichBoard(sim, 3.0, 24);
  for (const [px, pz] of [[-17, 10], [-17, 17], [-17, 24]]) tree(sim, px, pz);
  for (const [px, pz] of [[-9, 6], [-3, 6], [-9, 28], [-3, 28]]) lampPost(sim, px, pz);
  for (const pz of [7.5, 27]) bench(sim, -6, pz);
  for (const pz of [11, 21]) planter(sim, -19.5, pz, 1.5, 1, 0x5d6a4a);
  for (const pz of [14, 18]) trashBin(sim, -19.5, pz, 0x33453a);
  newsBox(sim, 3.25, 22, 0x2a4f9a);
  signPost(sim, -19.5, 6, 0x2c6e4f, 2, 'z', 1.0);
  // The residential edge's own ground, so neither slab stands on bare fill.
  for (const tx of [21, 26, 31, 36]) tree(sim, tx, -51);
  for (const x of [23, 33]) lampPost(sim, x, -49.5);
  for (const z of [5, 9]) lampPost(sim, 41, z);
  for (const tx of [44, 50, 56]) tree(sim, tx, 14);
  bench(sim, 47, 14.5);
  bench(sim, 53, 14.5);
}

export function canalParkDistrict(sim) {
  canalParkHero(sim);
  oneCanalPark(sim);
  residentialEdge(sim);
  frontDoorRing(sim);
  canalParkStreet(sim);
  canalTerrace(sim);
  serviceYard(sim);
  canalParkProps(sim);
  for (const v of CAMBRIDGE_VEHICLES) {
    if (v.d !== 1) continue;
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.box);
    else motorcycle(sim, v.x, v.z);
  }
}

// The district's ground. Passed to `cambridgeShell` as an option rather than
// emitted inside it, because the shell is shared with Phase 5's variants and
// they must keep measuring the pavement they measured.
export const CANAL_PARK_DECOR = {
  plaza: [
    { x: -15, z: -25.25, w: 30.5, d: 22.5 },    // 2 Canal Park and its plinth
    { x: 1.5, z: -4, w: 15, d: 9 },             // the entry court and its door apron
    { x: -39.5, z: -38, w: 20.25, d: 26 },      // 1 Canal Park + its goods canopy
    { x: -26, z: -3.25, w: 31, d: 34 },         // the apron, forecourt and ring
    { x: -26, z: -9.5, w: 12.5, d: 6.25 },      // the link plaza west of the hero
    { x: 14.25, z: 5.5, w: 16.25, d: 21.5 },    // the canal terrace
    { x: -14.5, z: -36.5, w: 29, d: 11.75 },    // the service yard
    { x: 19.5, z: -63.75, w: 21, d: 15.75 },    // Sierra
    { x: 40, z: 3.5, w: 21.25, d: 11.5 },       // Thomas Graves Landing
  ],
  sidewalks: [
    { x: 5, z: 5, w: 1.5, d: 25 },
    { x: 12.5, z: 5, w: 1.5, d: 25 },
  ],
  parks: [
    { x: 14.5, z: 10.5, w: 2.5, d: 15.5 },      // the terrace verge
  ],
};

export const CANAL_PARK_AMBIENT = {
  steam: [{ x: -6, z: -27, rate: 0.28 }],
  neon: [
    { x: 8, z: 4.4, w: 6, d: 1.2, color: 0xff7a59, period: 3.6 },
    { x: 9.5, z: 18, w: 1.2, d: 8, color: 0x4ad9ff, period: 4.1 },
  ],
  pigeons: [
    { x: 0, z: 16, count: 14 },
    { x: 20, z: 17, count: 10 },
  ],
};

// --- DISTRICT 3: LECHMERE & THE VIADUCT --------------------------------------
// `03` §4.3. The first place the route sends the player, the first "oh, they got
// that" moment, and structurally the district that proves the primitive: a
// viaduct built from 0.25 m cubes is the kind of thing that used to eat a whole
// district's budget.
//
// THE ALIGNMENT IS DERIVED, NOT DRAWN. `sceneOffset(13, 127)` — `02` §6's row
// for Lechmere station — and `03` §5.1's independently stated (−2.9, −56.5) have
// to agree, so `VIADUCT.segs` is laid out such that the MIDDLE chord's
// centreline passes through that point: chord B runs z[−62.5,−50.5] with its
// deck at x[−7.5,+1.75], giving a centre of (−2.875, −56.5). The check is a
// measurement in the P6.3 report rather than an assertion here, because a
// hardcoded scene coordinate is a number nobody can check against a source.
//
// THE CURVE IS THREE SHALLOW CHORDS, per §4.3's instruction and ADR-0013's
// stepped-approximation rule. The WHOLE cross-section steps 1.5 m east per 12 m
// chord rather than the platform curving inside a straight deck — a curved
// island platform between straight tracks is not a thing that exists — and every
// step lands ON a bent, so no girder is ever asked to be at two x positions at
// once. The sweep is westward going north, which is both the real alignment
// (the viaduct curves toward the Inner Belt) and the only direction with room:
// the busway's west kerb at x 4 clears chord C's deck edge by 0.75 m.
//
// CATENARY CANNOT BE BUILT, AND THIS IS A DOC-VS-ENGINE CONFLICT, NOT A CUT.
// §4.3's last line item is "track, catenary, signals, the retaining wall north".
// Support in this sim never flows downward — `voxelkit.js` says so at 307, 355
// and 367 — so a contact wire strung between two masts has no load path at all:
// every segment of it is a floating block that fails `probeIdleStability` on the
// first recalc, and there is no authoring trick that fixes it, because the rule
// is the engine's. What is built instead is the half that stands: masts rising
// from the deck and cantilever brackets borne from below, inside steel's 3 m
// span. The wire itself is absent and its share of the 730 went into signals,
// the yard's track furniture and the retaining wall. Recorded for the §4-vs-§9
// reconciliation at P6.10, not papered over.

const VIADUCT = {
  w: 9.25,          // track 2.75 + island platform 3.75 + track 2.75
  track: 2.75,
  island: 3.75,
  plinthH: 0.5,
  pierH: 4.5,       // 0.5 + 4.5 puts the crosshead soffit at 5.0
  crossY: 5.0,
  girderY: 5.5,
  deckY: 6.0,
  deckTop: 6.5,
  platTop: 7.0,     // platform surface, 0.5 above the deck and level with rail head
  // Each chord's deck runs x[.x, .x + w] over z[.z0, .z1).
  segs: [
    { z0: -90.5,  z1: -74.5,  x: -10.5 },   // north approach, over the junction
    { z0: -74.5,  z1: -62.5,  x: -9 },      // chord A
    { z0: -62.5,  z1: -50.5,  x: -7.5 },    // chord B — the station chord
    { z0: -50.5,  z1: -37.75, x: -6 },      // chord C
  ],
  // Bent centres. The 11 m bay between −89.5 and −78.5 is the one the junction
  // passes through; every other bay is 6 m. Segment boundaries are all bents.
  bents: [-89.5, -78.5, -74.5, -68.5, -62.5, -56.5, -50.5, -44.5, -38.5],
  plat: { z0: -74.5, z1: -38.5 },     // 36 m, `03` §4.3's stated scene length
  entry: { z0: -81.5, z1: -80.5 },    // the gap in the west parapet at the stair head
};

const viaSeg = (z) => VIADUCT.segs.find((s) => z >= s.z0 && z < s.z1) ?? VIADUCT.segs[3];

// The deck width a bent has to carry. At the three segment boundaries the bent
// serves two chords at once, so it spans their union — 10.75 m instead of 9.25.
function bentSpan(bz) {
  let lo = Infinity, hi = -Infinity;
  for (const s of VIADUCT.segs) {
    if (bz + 0.75 <= s.z0 || bz - 0.75 >= s.z1) continue;
    lo = Math.min(lo, s.x); hi = Math.max(hi, s.x + VIADUCT.w);
  }
  return [lo, hi];
}

// Plinth, a three-lift pier pair, and the crosshead they carry. `03` §7.4 wants
// these takeable at SIZE 2, so each shaft is 2 m in plan and cut into 1.5 m
// lifts rather than standing as one 4.5 m block.
//
// THE PIERS SIT UNDER THE TRACKS, NOT UNDER THE PLATFORM — offsets 0.75 and
// w−2.75 from the deck edge — which is both how a bent actually works and what
// leaves the centre strip clear for the stair well to drop through.
function viaductBent(sim, bz) {
  const V = VIADUCT;
  const [lo, hi] = bentSpan(bz);
  const z = bz - 0.75;
  for (const px of [lo + 0.75, hi - 2.75]) {
    plinth(sim, { x: px - 0.25, y: 0, z: z - 0.25, w: 2.5, d: 2, h: V.plinthH, mat: 'concrete', color: C.viaductPier });
    for (let i = 0; i < 3; i++) {
      pier(sim, { x: px, y: V.plinthH + i * 1.5, z, w: 2, h: 1.5, d: 1.5, mat: 'concrete', color: C.viaductPier });
    }
  }
  // Three crosshead segments rather than one member. The middle one reaches
  // 0.25 m ONTO the west pier: `rectsOverlap` is open, so a segment that merely
  // abutted the pier would have no vertical support and would be a floating
  // block on the first recalc.
  const w = hi - lo;
  for (const [cx, cw] of [[lo, 2.5], [lo + 2.5, w - 5], [hi - 2.5, 2.5]]) {
    beam(sim, { x: cx, y: V.crossY, z, len: cw, axis: 'x', t: 0.5, depth: 1.5, mat: 'concrete', color: C.viaductCross });
  }
}

// `greenLineViaduct` — the composite `03` §10.3 names. Three longitudinal girder
// lines per bay carried on the crossheads, so every deck tile lands on steel
// rather than hopping the full 9.25 m between edges (concrete's `maxSpan` is 3,
// and 9.25 m of 0.5 m tiles is 18 hops).
function greenLineViaduct(sim) {
  const V = VIADUCT, B = V.bents;
  for (const bz of B) viaductBent(sim, bz);

  for (let i = 0; i < B.length - 1; i++) {
    const z0 = i === 0 ? V.segs[0].z0 : B[i];
    const z1 = i === B.length - 2 ? V.segs[3].z1 : B[i + 1];
    const s = viaSeg((B[i] + B[i + 1]) / 2);
    for (const off of [1.5, 4.25, 7.0]) {
      beam(sim, { x: s.x + off, y: V.girderY, z: z0, len: z1 - z0, axis: 'z', t: 0.5, depth: 0.75, mat: 'steel', color: C.viaductCross });
    }
  }

  // Deck, parapet and coping. 0.5 m tiles in three strips, so the deck reads as
  // a laid surface rather than one plate, and so the district's eatable-piece
  // density comes from the structure itself rather than from props scattered on
  // it (`03` §8.2's mitigation is continuity, not decoration).
  // THE LAST TILE OF A SEGMENT IS CLAMPED TO THE SEGMENT. Two of the four chords
  // are not a whole number of 0.5 m tiles long (the north approach is 15.75 m),
  // so an unclamped run overshoots `z1` by 0.25 and lands inside the first tile
  // of the chord below — 2,573 doubly-owned fine cells, all of them at three
  // segment seams.
  for (const s of V.segs) {
    for (let z = s.z0; z < s.z1 - 0.01; z += 0.5) {
      const d = Math.min(0.5, s.z1 - z);
      const strips = [[s.x, V.track], [s.x + V.track, V.island], [s.x + V.track + V.island, V.track]];
      for (let k = 0; k < 3; k++) {
        slab(sim, { x: strips[k][0], y: V.deckY, z, w: strips[k][1], d, t: 0.5, mat: 'concrete', color: C.viaductDeck });
      }
    }
    for (let z = s.z0; z < s.z1 - 0.01; z += 1) {
      const len = Math.min(1, s.z1 - z);
      for (const px of [s.x, s.x + V.w - 0.25]) {
        // The west parapet is broken at the stair head — a station whose only
        // entrance is walled off is a station nobody reaches.
        if (px === s.x && z < V.entry.z1 && z + len > V.entry.z0) continue;
        panel(sim, { x: px, y: V.deckTop, z, w: len, h: 0.75, axis: 'z', t: 0.25, mat: 'concrete', color: C.viaductEdge });
        panel(sim, { x: px, y: V.deckTop + 0.75, z, w: len, h: 0.25, axis: 'z', t: 0.25, mat: 'concrete', color: C.castStone });
      }
    }
  }

  // Track. Sleepers at a 1 m pitch and 3 m rail lengths — the gap between
  // sleepers is 0.75 m against a 0.25 m extent, so `probePlacementStep`'s
  // sub-extent clause does not see a run of sleepers as a broken line.
  //
  // GAUGE IS 1.0 m, NOT 0.48. `03` §1.2's 1:3 plan scale puts standard gauge at
  // 0.48 m, which with 0.25 m rails leaves 0.23 m between them and renders as a
  // solid strip. The track is drawn at the width that reads as track; it is a
  // deliberate local exception to the plan scale, in the same spirit as §1.5's
  // declared four, and it costs nothing positional because nothing keys off it.
  for (const s of V.segs) {
    for (const t0 of [s.x + 0.25, s.x + 6.75]) {
      for (let z = s.z0 + 0.25; z < s.z1 - 0.5; z += 1) {
        slab(sim, { x: t0, y: V.deckTop, z, w: 2.25, d: 0.25, t: 0.25, mat: 'wood', color: C.sleeper });
      }
      for (let z = s.z0; z < s.z1 - 0.01; z += 3) {
        const len = Math.min(3, s.z1 - z);
        for (const rx of [t0 + 0.5, t0 + 1.5]) {
          beam(sim, { x: rx, y: V.deckTop + 0.25, z, len, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.railHead });
        }
      }
    }
  }
}

// `elevatedCurvedPlatform` — the second composite `03` §10.3 names. 36 x 3.75 m
// over three chords, each 12 m, each stepped 1.5 m east of the one north of it.
function elevatedCurvedPlatform(sim) {
  const V = VIADUCT;
  for (const s of V.segs) {
    const z0 = Math.max(s.z0, V.plat.z0), z1 = Math.min(s.z1, V.plat.z1);
    if (z1 - z0 < 0.01) continue;
    const px = s.x + V.track;
    for (let z = z0; z < z1 - 0.01; z += 0.5) {
      for (let k = 0; k < 3; k++) {
        slab(sim, { x: px + k * 1.25, y: V.deckTop, z, w: 1.25, d: 0.5, t: 0.5, mat: 'concrete', color: C.platformDeck });
      }
    }
    // The yellow warning strip down both edges — the district's one saturated
    // thing apart from the train, and the reason the platform reads as a
    // platform in silhouette rather than as more deck.
    for (let z = z0; z < z1 - 0.01; z += 1) {
      const len = Math.min(1, z1 - z);
      for (const tx of [px, px + V.island - 0.25]) {
        panel(sim, { x: tx, y: V.platTop, z, w: len, h: 0.25, axis: 'z', t: 0.25, mat: 'concrete', color: C.platformTactile });
      }
    }
    // Canopy: a column line down the platform centre at a 4 m pitch, a ridge
    // beam on it, and a three-tile roof. The outer roof tiles hop 1.5 m from the
    // ridge, half of steel's `maxSpan`.
    const cx = s.x + V.track + 1.75;
    for (let z = z0 + 2; z < z1 - 1; z += 4) {
      for (let i = 0; i < 3; i++) {
        column(sim, { x: cx, y: V.platTop + i, z, h: 1, s: 0.25, mat: 'steel', color: C.canopySteel });
      }
      bench(sim, cx - 1.25, z + 1.25, V.platTop);
    }
    for (let z = z0; z < z1 - 0.01; z += 4) {
      const len = Math.min(4, z1 - z);
      beam(sim, { x: cx - 0.25, y: V.platTop + 3, z, len, axis: 'z', t: 0.25, depth: 0.75, mat: 'steel', color: C.canopySteel });
      for (let k = 0; k < 3; k++) {
        slab(sim, { x: s.x + 2.5 + k * 1.5, y: V.platTop + 3.25, z, w: 1.5, d: len, t: 0.25, mat: 'steel', color: C.canopyRoof });
      }
    }
    // Overhead line masts, `03` §4.3's "catenary" line item as far as the engine
    // allows: a mast off the platform edge and a bracket cantilevered over the
    // track from it. THE WIRE ITSELF IS NOT HERE — see the header note.
    for (let z = z0 + 4; z < z1 - 2; z += 8) {
      column(sim, { x: px + V.island, y: V.platTop, z, h: 2.75, s: 0.25, mat: 'steel', color: C.signalMast });
      beam(sim, { x: px + V.island - 1.5, y: V.platTop + 2.5, z, len: 1.5, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.signalMast });
    }
  }
}

// `greenLineCar` — the third composite `03` §10.3 names. Two of these make
// §4.3's "green-and-white Green Line train, two cars": very high chroma, tiny
// area, and the only saturated object in a district of greys.
function greenLineCar(sim, o) {
  const { x, z, len } = o;
  const y = VIADUCT.platTop;            // rail head — the car stands on the rails
  const w = 2.25;
  // The bogies sit BETWEEN the rails, not across them: the rail head occupies
  // y[6.75,7.0] over x+0.5 and x+1.5, so a 1.5 m skirt at the same level owns
  // cells the track already owns.
  for (const tz of [z + 1, z + len - 1.5]) {
    slab(sim, { x: x + 0.75, y: y - 0.25, z: tz, w: 0.75, d: 0.5, t: 0.25, mat: 'steel', color: C.carSkirt });
  }
  // A WINDOW PILLAR EVERY 2 m, AND IT IS STRUCTURAL, NOT DECORATIVE. Glass has
  // vertBond 0.40 against the engine's BOND_CARRY of 0.5, so it passes no
  // support upward at all: a continuous glazed band leaves the white band and
  // the roof above it with no load path, and both cars came apart in the idle
  // probe. The pillars are the only thing carrying the car's upper half.
  for (let dz = 0; dz < len - 0.01; dz += 0.5) {
    const pillar = Math.abs(dz % 2) < 0.01;
    slab(sim, { x, y, z: z + dz, w, d: 0.5, t: 0.25, mat: 'steel', color: C.carSkirt });
    slab(sim, { x, y: y + 2.25, z: z + dz, w, d: 0.5, t: 0.25, mat: 'panel', color: C.transitWhite });
    for (const sx of [x, x + w - 0.25]) {
      panel(sim, { x: sx, y: y + 0.25, z: z + dz, w: 0.5, h: 0.75, axis: 'z', t: 0.25, mat: 'panel', color: C.transitGreen });
      panel(sim, { x: sx, y: y + 1.0, z: z + dz, w: 0.5, h: 0.75, axis: 'z', t: 0.25, mat: pillar ? 'panel' : 'glass', color: pillar ? C.transitGreen : C.carGlass });
      panel(sim, { x: sx, y: y + 1.75, z: z + dz, w: 0.5, h: 0.5, axis: 'z', t: 0.25, mat: 'panel', color: C.transitWhite });
    }
  }
  // The cab ends carry the SAME three bands as the flanks — 0.75/0.75/0.5, not
  // 0.75 three times. A 0.75 m top band runs to y+2.5 and the roof slab starts
  // at y+2.25, so the taller version puts the whole end wall through the roof.
  for (const ez of [z, z + len - 0.25]) {
    for (const [dy, h, m, col] of [[0.25, 0.75, 'panel', C.transitGreen], [1.0, 0.75, 'glass', C.carGlass], [1.75, 0.5, 'panel', C.transitWhite]]) {
      panel(sim, { x: x + 0.25, y: y + dy, z: ez, w: 1.75, h, axis: 'x', t: 0.25, mat: m, color: col });
    }
  }
  // The pantograph, borne from below off the roof — the one piece of overhead
  // kit that has a load path in this sim.
  for (const pz of [z + len / 2 - 0.75, z + len / 2 + 0.5]) {
    column(sim, { x: x + 1, y: y + 2.5, z: pz, h: 0.5, s: 0.25, mat: 'steel', color: C.signalMast });
  }
  beam(sim, { x: x + 0.5, y: y + 3.0, z: z + len / 2 - 0.75, len: 1.5, axis: 'z', t: 0.25, depth: 1.25, mat: 'steel', color: C.signalMast });
}

// The headhouse: ticket hall, flight and lift. `03` §4.3's "canopy, headhouse,
// stairs, lifts, faregates".
//
// THE CORE STANDS WEST OF THE VIADUCT, NOT INSIDE IT. The first cut put the
// flight up through the deck's centre strip, which cannot work: a 0.5/0.5 stair
// needs 7 m of run, the only bay that long is the one the junction road passes
// under, and every other bay puts a bent's crosshead (y[5.0,5.5], full deck
// width) straight through the flight. The strip between North First Street's
// kerb and the viaduct's west fascia — x[−13.5,−10.5] — is 3 m of otherwise
// dead ground that no pier, road or footway occupies, and it is exactly where
// an at-grade headhouse belongs.
//
// Every step is ground-anchored — a stair built as floating treads is a stair
// that falls the moment the flight below it goes.
function lechmereHeadhouse(sim) {
  // The flight: 13 risers of 0.5 climbing NORTHWARD from grade at z −74.5 to
  // deck level (6.5) at z −81, then a landing that meets the parapet opening.
  // It tops out at the deck, not at the platform: concourse first, then the
  // 0.5 m step up to the island, which is how an elevated station actually
  // reads and what keeps the stair clear of the platform's canopy columns.
  for (let i = 0; i < 13; i++) {
    for (let k = 0; k < 3; k++) {
      plinth(sim, { x: -13 + k * 0.75, y: 0, z: -75 - i * 0.5, w: 0.75, d: 0.5, h: (i + 1) * 0.5, mat: 'concrete', color: C.viaductPier });
    }
  }
  for (let k = 0; k < 3; k++) {
    plinth(sim, { x: -13 + k * 0.75, y: 0, z: -81.5, w: 0.75, d: 0.5, h: 6.5, mat: 'concrete', color: C.viaductPier });
  }
  // Cheek walls in 2 m lengths, which is `03` §7.4's own promise for what a
  // SIZE 2 player meets here. They flank the treads rather than sharing their
  // x, and the east cheek stops at x −10.5 so it abuts the fascia.
  for (let i = 0; i < 14; i += 4) {
    const zz = -81.5 + i * 0.5;
    const seg = Math.min(2, -74.5 - zz);
    for (const cw of [-13.25, -10.75]) {
      panel(sim, { x: cw, y: 0, z: zz, w: seg, h: 7.5 - i * 0.5, axis: 'z', t: 0.25, mat: 'concrete', color: C.viaductPier });
    }
  }

  // The ticket hall at grade, south of the flight: a glazed box open to the
  // north, so hall and stair are one movement.
  // THE MULLIONS CARRY THE SPANDREL AND THE ROOF; THE GLASS IS INFILL. Glass
  // passes no support upward (vertBond 0.40 < BOND_CARRY 0.5), so a glazed
  // panel with a spandrel stacked on it is a spandrel standing on nothing. Each
  // bay is therefore mullion, then glass INSET past it, then a spandrel that
  // spans the whole bay and lands on the mullion head.
  // THE PANES ALTERNATE 1.25 / 0.75 — same rule `curtainFace` follows on the
  // District 1 blocks. Equal panes on an equal pitch put a 0.25 m mullion gap
  // between identical boxes, which is `probePlacementStep`'s sub-extent clause;
  // alternating widths puts each pane two bays from its own kind, where the gap
  // is at least the extent. The spandrel above runs as four EQUAL 1.25 m pieces
  // at gap 0, which passes for the opposite reason.
  for (const wx of [-13.5, -10.75]) {
    let z = -74.5;
    for (const pane of [1.25, 0.75, 1.25, 0.75]) {
      mullion(sim, { x: wx, y: 0, z, h: 2.25, s: 0.25, mat: 'steel', color: C.canopySteel });
      panel(sim, { x: wx, y: 0, z: z + 0.25, w: pane, h: 2.25, axis: 'z', t: 0.25, mat: 'glass', color: C.labGlass });
      z += pane + 0.25;
    }
    for (let sz = -74.5; sz < -69.6; sz += 1.25) {
      panel(sim, { x: wx, y: 2.25, z: sz, w: 1.25, h: 1, axis: 'z', t: 0.25, mat: 'panel', color: C.viaductEdge });
    }
  }
  // The south wall closes the box from OUTSIDE the two side lines — z −69.5 is
  // where they end, so the corner mullion abuts rather than doubling up.
  let hx = -13.25;
  for (const pane of [1.25, 0.75]) {
    mullion(sim, { x: hx, y: 0, z: -69.5, h: 2.25, s: 0.25, mat: 'steel', color: C.canopySteel });
    panel(sim, { x: hx + 0.25, y: 0, z: -69.5, w: pane, h: 2.25, axis: 'x', t: 0.25, mat: 'glass', color: C.labGlass });
    hx += pane + 0.25;
  }
  mullion(sim, { x: -10.75, y: 0, z: -69.5, h: 2.25, s: 0.25, mat: 'steel', color: C.canopySteel });
  panel(sim, { x: -13.25, y: 2.25, z: -69.5, w: 1.25, h: 1, axis: 'x', t: 0.25, mat: 'panel', color: C.viaductEdge });
  panel(sim, { x: -12, y: 2.25, z: -69.5, w: 1.5, h: 1, axis: 'x', t: 0.25, mat: 'panel', color: C.viaductEdge });
  // The roof runs OVER the wall lines rather than between them, so every plank
  // has a mullion head under it or a plank that does.
  for (let x = -13.5; x < -10.6; x += 0.5) {
    slab(sim, { x, y: 3.25, z: -74.5, w: 0.5, d: 5, t: 0.25, mat: 'panel', color: C.canopyRoof });
  }

  // Faregates: a paired-post line across the hall, and the ticket machines.
  // PITCH IS 1.75, NOT 1.25, AND THE MACHINES SIT 1.5 APART. A 0.75 m post on a
  // 1.25 m pitch leaves a 0.50 m gap, which is `probePlacementStep`'s sub-extent
  // clause exactly: a run of identical boxes whose gap is smaller than the box
  // reads as a line that failed to close, not as a rank of separate objects.
  for (const gz of [-73.5, -72.25]) {
    for (const x of [-13, -11.5]) {
      pier(sim, { x, y: 0, z: gz, w: 0.75, h: 1, d: 0.5, mat: 'steel', color: C.canopySteel });
    }
  }
  for (const mz of [-71.5, -70.5]) {
    pier(sim, { x: -13.25, y: 0, z: mz, w: 0.75, h: 1.75, d: 0.5, mat: 'panel', color: C.transitGreen });
  }

  // The lift: a glazed shaft in the 1.5 m strip between the hall's east wall and
  // the chord-A fascia, rising to deck level. Mullions carry the glass —
  // `panel`'s own rule, not optional for glass. Its head slab tops out at 6.5,
  // level with the deck it opens onto, so nothing cantilevers.
  for (let i = 0; i < 5; i++) {
    const ly = i * 1.25;
    for (const mx of [-10.5, -9.25]) for (const mz of [-71.5, -70.25]) {
      mullion(sim, { x: mx, y: ly, z: mz, h: 1.25, s: 0.25, mat: 'steel', color: C.canopySteel });
    }
    for (const mx of [-10.5, -9.25]) {
      panel(sim, { x: mx, y: ly, z: -71.25, w: 1, h: 1.25, axis: 'z', t: 0.25, mat: 'glass', color: C.heroGlass });
    }
    panel(sim, { x: -10.25, y: ly, z: -71.5, w: 1, h: 1.25, axis: 'x', t: 0.25, mat: 'glass', color: C.heroGlass });
  }
  slab(sim, { x: -10.5, y: 6.25, z: -71.5, w: 1.5, d: 1.5, t: 0.25, mat: 'steel', color: C.canopySteel });
}

// The Lechmere Busway and North First Street: `03` §4.3's 900-block line item,
// and — more load-bearing than that — `03` §8.2's NAMED MITIGATION for this
// district's density risk: "the busway, shelters, kerbs and track furniture run
// continuously between bents." A viaduct is a line of piers with gaps; what
// closes the gaps is what stands on the ground under and beside it.
function lechmereBusway(sim) {
  const kerb = (x, z, len, axis) => {
    for (let o = 0; o < len - 0.01; o += 6) {
      const l = Math.min(6, len - o);
      beam(sim, axis === 'x'
        ? { x: x + o, y: 0, z, len: l, axis: 'x', t: 0.25, depth: 0.25, mat: 'concrete', color: C.buswayKerb }
        : { x, y: 0, z: z + o, len: l, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.buswayKerb });
    }
  };
  kerb(3.75, -81.5, 39.5, 'z');
  kerb(10, -81.5, 39.5, 'z');
  kerb(-20.25, -87.5, 48.5, 'z');
  kerb(14, -87.5, 48.5, 'z');
  kerb(-20, -88, 30, 'x');
  // North First Street's EAST kerb. It stops 6 m short of its west twin because
  // the Lechmere Junction carriageway runs x[−20,+10] across z[−87.5,−81.5] and
  // a kerb inside a carriageway is a road conflict — the same reason the east
  // footway's furniture has a hole there. What it is really for is the density
  // probe: it is the only continuous line of District 3 content east of the
  // street's own rect, so it is what the northbound leg measures for 42 m.
  kerb(-14, -81.5, 42.5, 'z');

  // Three bus shelters on the busway's east footway, on a 12 m pitch so the
  // route leg down the busway is never more than 6 m from one.
  for (const sz of [-79, -67, -55]) {
    for (const pz of [sz, sz + 3.5]) {
      column(sim, { x: 10.5, y: 0, z: pz, h: 2.5, s: 0.25, mat: 'steel', color: C.shelterGreen });
      column(sim, { x: 12.75, y: 0, z: pz, h: 2.5, s: 0.25, mat: 'steel', color: C.shelterGreen });
    }
    slab(sim, { x: 10.25, y: 2.5, z: sz - 0.25, w: 3, d: 4.25, t: 0.25, mat: 'steel', color: C.shelterGreen });
    panel(sim, { x: 12.75, y: 0, z: sz + 0.25, w: 3.25, h: 2.5, axis: 'z', t: 0.25, mat: 'glass', color: C.labGlass });
    bench(sim, 11, sz + 1.5);
    signPost(sim, 10.75, sz - 1.5, C.shelterGreen, 2, 'z', 1.0);
  }
  for (const z of [-77, -71, -65, -59, -53, -47]) lampPost(sim, 10.75, z);
  for (const z of [-74, -62, -50]) trashBin(sim, 13.5, z, 0x33453a);
  for (const z of [-68, -56]) bollard(sim, 13.5, z, C.steelDark);
  hydrant(sim, 13.5, -80);
  for (const [tx, tz] of [[13, -72], [13, -60], [13, -44]]) tree(sim, tx, tz);

  // North First Street's west footway. Everything on a 4.5 m pitch, which is
  // what carries the density probe up the outbound leg: the corridor at x −17
  // sees this walk on one side and the viaduct's piers on the other.
  for (const z of [-85, -76, -67, -58, -49, -41]) lampPost(sim, -20.75, z);
  for (const z of [-81, -72, -63, -54, -45]) bollard(sim, -20.75, z, C.steelDark);
  for (const z of [-79, -61, -43]) planter(sim, -21.75, z, 1.5, 1, 0x5d6a4a);
  for (const z of [-70, -52]) bench(sim, -21.25, z);
  hydrant(sim, -20.75, -87);
  mailbox(sim, -21, -47, 0x2a4f9a);
  newsBox(sim, -21, -66, 0xc23b2e);
  for (const [tx, tz] of [[-22, -84], [-22, -66], [-22, -48]]) tree(sim, tx, tz);

  // The east footway is the station's own approach, so it carries the wayfinding
  // rather than the greenery: a totem at each end and a bike rack at the door.
  //
  // TWO HOLES IN THIS LINE ARE DELIBERATE. Nothing sits in z[−87.5,−81.5]: the
  // Lechmere Junction carriageway runs x[−20,+10] there, so a lamp on this walk
  // is a lamp in the road. And nothing sits in z[−82,−69]: that is the
  // headhouse's own footprint, and the station entrance is the streetscape
  // event on that stretch.
  for (const z of [-67, -59, -50, -42]) lampPost(sim, -13.25, z);
  for (const z of [-65, -56, -44]) bollard(sim, -13.25, z, C.steelDark);
  bikeRack(sim, -13.5, -62, 3, 'z');
  signPost(sim, -13.25, -68.5, C.shelterGreen, 2.5, 'z', 1.25);
  signPost(sim, -13.25, -46, C.shelterGreen, 2.5, 'z', 1.25);
  drinkingFountain(sim, -13.5, -53);
  hotDogCart(sim, -13.5, -66);
  for (const v of CAMBRIDGE_VEHICLES) {
    if (v.d !== 3) continue;
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.body, v.axis);
    else motorcycle(sim, v.x, v.z);
  }
}

// `03` §4.11's north edge and §4.3's "retaining wall north". The yard throat
// leaves the viaduct's north abutment at grade, turns west, and runs into the
// Michael Capuano Inner Belt Carhouse; the MBTA Green Line Transportation
// Office stands beyond it. BOTH ARE PULLED RADIALLY IN under `03` §1.5's
// exception 4 — the carhouse computes to (−43, −127.75) and the office to
// (−76.25, −108.5), and each is scaled toward the origin until its z lands in
// §4.11's declared −100…−108 band: (−35, −104) and (−74.5, −103.5). That pull
// is what makes `boundsRect`'s minZ −112 legal, which is what makes the Inner
// Belt ballast span declarable at all.
function innerBeltYard(sim) {
  // The abutment: the viaduct's north end is retained ground, not a dangling
  // deck. It is also the seam a later district extends the alignment from.
  for (let x = -10.5; x < -1.3; x += 1.5) {
    const w = Math.min(1.5, -1.25 - x);
    for (let i = 0; i < 4; i++) {
      panel(sim, { x, y: i * 1.5, z: -91, w, h: 1.5, axis: 'x', t: 0.5, mat: 'concrete', color: C.viaductPier });
    }
  }
  // Ballasted track at grade, two legs: north out of the abutment, then west
  // into the carhouse throat. Sleepers on a 1 m pitch the whole way, which is
  // what stops the 20 m between the district and the north edge reading as void.
  const yardTrack = (x0, z0, len, axis, n) => {
    for (let i = 0; i < n; i++) {
      const a = i * 1;
      if (axis === 'z') {
        slab(sim, { x: x0, y: 0, z: z0 + a, w: 2.25, d: 0.25, t: 0.25, mat: 'wood', color: C.sleeper });
      } else {
        slab(sim, { x: x0 + a, y: 0, z: z0, w: 0.25, d: 2.25, t: 0.25, mat: 'wood', color: C.sleeper });
      }
    }
    for (let o = 0; o < len - 0.01; o += 3) {
      const l = Math.min(3, len - o);
      for (const g of [0.5, 1.5]) {
        beam(sim, axis === 'z'
          ? { x: x0 + g, y: 0.25, z: z0 + o, len: l, axis: 'z', t: 0.25, depth: 0.25, mat: 'steel', color: C.railHead }
          : { x: x0 + o, y: 0.25, z: z0 + g, len: l, axis: 'x', t: 0.25, depth: 0.25, mat: 'steel', color: C.railHead });
      }
    }
  };
  // Both legs stop SHORT of what they run into. The north leg ended at z −90.5,
  // which is the abutment's own face, and the west leg ran to x −8, straight
  // through the curve that is supposed to join them.
  yardTrack(-7.75, -99.5, 8.5, 'z', 9);
  yardTrack(-23, -104.5, 11, 'x', 11);
  // The curve between them, as one stepped chord — the same stepped
  // approximation ADR-0013 asks for on the platform, at yard scale. ONE sleeper
  // per z, 0.5 m apart: two interleaved chords at a 1 m pitch put half their
  // sleepers on the same z as the other chord's, and a sleeper is 2.25 m wide.
  for (let i = 0; i < 4; i++) {
    slab(sim, { x: -8.5 - i, y: 0, z: -100.5 - i * 0.5, w: 2.25, d: 0.25, t: 0.25, mat: 'wood', color: C.sleeper });
  }
  // Signals and yard lighting. `03` §4.3's "signals" — free-standing, borne from
  // the ground, which is the only way anything vertical stands out here.
  for (const [sx, sz] of [[-6.5, -93], [-6.5, -97], [-14, -101.5], [-19, -101.5]]) {
    column(sim, { x: sx, y: 0, z: sz, h: 2.5, s: 0.25, mat: 'steel', color: C.signalMast });
    pier(sim, { x: sx - 0.25, y: 2.5, z: sz - 0.25, w: 0.75, h: 1, d: 0.75, mat: 'panel', color: C.transitGreen });
  }
  // THE MASTS STAND BESIDE THE SHED, NOT IN IT. (−26,−101) and (−40,−101) were
  // inside the carhouse footprint x[−47,−23] z[−107.5,−99.5], so a 5 m mast came
  // up through a 4.5 m roof and was still moving at the end of the idle probe.
  for (const [mx, mz] of [[-3, -95], [-12, -100], [-26, -97.5], [-40, -97.5], [-55, -100], [-66, -100]]) {
    lightMast(sim, mx, mz, 5, C.signalMast);
  }
  // The retaining wall north: a 2 m-panel run along the yard's east side, which
  // is `03` §4.3's line item and doubles as the thing that keeps the throat
  // reading as cut ground rather than open field.
  for (let z = -99.5; z < -92.4; z += 2) {
    panel(sim, { x: -3.5, y: 0, z, w: 2, h: 1.75, axis: 'z', t: 0.5, mat: 'concrete', color: C.viaductPier });
  }
  for (let x = -22; x < -12.4; x += 2) {
    panel(sim, { x, y: 0, z: -100.5, w: 2, h: 1.5, axis: 'x', t: 0.5, mat: 'concrete', color: C.viaductPier });
  }

  // The Michael Capuano Inner Belt Carhouse: a 24 x 8 m shed, portal doors on
  // the throat end. Steel and profiled sheet, no chroma — `02` files it under
  // infrastructure, and the district already has its one saturated object.
  for (let x = -47; x < -23.1; x += 1.5) {
    for (const wz of [-107.5, -99.75]) {
      for (let i = 0; i < 3; i++) {
        panel(sim, { x, y: i * 1.5, z: wz, w: 1.5, h: 1.5, axis: 'x', t: 0.25, mat: 'panel', color: C.carhouseWall });
      }
    }
  }
  // THE SIDE WALLS START INSIDE THE END WALLS. An 8 m run of 1.5 m panels begun
  // at the building line puts its first panel through the end wall's own 0.25 m
  // thickness at the corner, and its last panel 1 m out the far end.
  for (let z = -107.25; z < -99.8; z += 1.5) {
    for (const wx of [-47, -23.25]) {
      for (let i = 0; i < 3; i++) {
        // The throat end is open to the track: a shed with a wall across its
        // own doors is a shed nobody believes.
        if (wx === -23.25 && z > -105.5 && z < -101.5) continue;
        panel(sim, { x: wx, y: i * 1.5, z, w: 1.5, h: 1.5, axis: 'z', t: 0.25, mat: 'panel', color: C.carhouseWall });
      }
    }
  }
  for (let x = -47; x < -23.1; x += 2) {
    beam(sim, { x, y: 4.5, z: -107.5, len: 8, axis: 'z', t: 0.25, depth: 0.5, mat: 'steel', color: C.carhouseRoof });
    for (let k = 0; k < 4; k++) {
      slab(sim, { x, y: 4.75, z: -107.5 + k * 2, w: 2, d: 2, t: 0.25, mat: 'panel', color: C.carhouseRoof });
    }
  }

  // The MBTA Green Line Transportation Office: two storeys, brick, the one
  // domestic-scaled thing on the north edge.
  // THE TWO STOREYS ARE DIFFERENT HEIGHTS ON PURPOSE — 2.0 then 1.75. Two brick
  // panels of the SAME extent stacked in one column with a 0.75 m window band
  // between them are `probePlacementStep`'s sub-extent case: the run reads as a
  // wall that failed to close rather than as two storeys. Differing the height
  // puts them in different groups, which is also what they honestly are.
  //
  // The window band is 0.5, not 0.75, so the sill course above it LANDS ON IT.
  // At 0.75 the course and the glass shared y[+2.5,+2.75]: an overlap, not a
  // bearing, and the whole upper storey and roof came down in the idle probe.
  // THE PIERS CARRY THE SILL COURSE; THE WINDOW IS INFILL BETWEEN THEM. Glass
  // has vertBond 0.40 against BOND_CARRY 0.5, so it passes nothing upward: the
  // first cut ran a full-width brick panel, a glazed band on top of it and the
  // course on top of that, and the course, the upper storey and the roof all
  // came down in the idle probe with no overlap anywhere to explain it.
  //
  // The two storeys are also deliberately different heights (2.25 then 2.0).
  // Two brick pieces of the SAME extent stacked in one column with a course
  // between them are `probePlacementStep`'s sub-extent case; differing the
  // height puts them in separate groups, which is what they honestly are.
  const storeys = [{ y: 0, h: 2.25 }, { y: 2.5, h: 2 }];
  for (let x = -81.5; x < -67.6; x += 1.75) {
    for (const wz of [-107.5, -100]) {
      for (const st of storeys) {
        for (const px of [x, x + 1.25]) {
          pier(sim, { x: px, y: st.y, z: wz, w: 0.5, h: st.h, d: 0.5, mat: 'brick', color: C.officeBrick });
        }
        panel(sim, { x: x + 0.5, y: st.y, z: wz, w: 0.75, h: 0.75, axis: 'x', t: 0.5, mat: 'brick', color: C.officeBrick });
        panel(sim, { x: x + 0.5, y: st.y + 0.75, z: wz, w: 0.75, h: st.h - 0.75, axis: 'x', t: 0.5, mat: 'glass', color: C.labGlass });
        beam(sim, { x, y: st.y + st.h, z: wz, len: 1.75, axis: 'x', t: 0.25, depth: 0.5, mat: 'concrete', color: C.officeBand });
      }
    }
  }
  for (let z = -107; z < -100.1; z += 1.75) {
    for (const wx of [-81.5, -68]) {
      for (const st of storeys) {
        panel(sim, { x: wx, y: st.y, z, w: 1.75, h: st.h + 0.25, axis: 'z', t: 0.5, mat: 'brick', color: C.officeBrick });
      }
    }
  }
  for (let x = -81.5; x < -67.6; x += 2) {
    slab(sim, { x, y: 4.75, z: -107.5, w: 2, d: 8, t: 0.5, mat: 'concrete', color: C.officeBand });
  }
  // The yard fence between the two buildings, and the service road they share.
  fenceRun(sim, { x: -67.5, z: -103.75, len: 20.5, axis: 'x', h: 1.5, mat: 'steel', color: 0x4a5158 });
  // The containers stand clear of BOTH sheds: 1 m cubes six long from `cx`, two
  // deep from `z`, so the old (−50, −101.5) run reached x −44 z −99.5 and put
  // its corner through the carhouse's south wall.
  for (const cx of [-67, -60, -53]) shippingContainer(sim, cx, 0, -102.5, 6, 0x3d6b5a);
}

// The station's west forecourt and the props that make the undercroft read as a
// place rather than as the space under a bridge.
function lechmereProps(sim) {
  for (const [tx, tz] of [[-12, -46], [-12, -41], [-8, -44]]) tree(sim, tx, tz);
  for (const z of [-46, -41]) lampPost(sim, -9.5, z);
  bikeRack(sim, -12.5, -49, 3, 'z');
  for (const x of [-11, -8.5]) cafeTable(sim, x, -38.5);
  sandwichBoard(sim, -10.5, -50, C.shelterGreen);
  for (const [px, pz] of [[-12.5, -52], [-9, -52]]) planter(sim, px, pz, 1.5, 1, 0x5d6a4a);
  // The undercroft's own lighting and kit, between the bents.
  for (const z of [-79, -72, -60, -48]) lampPost(sim, -1, z);
  for (const z of [-70, -58]) trashBin(sim, -0.75, z, 0x33453a);
  crateStack(sim, -9.5, -68, 2, C.dockTimber);
  trashBags(sim, -9.5, -57);
  greenLineCar(sim, { x: -2.25, z: -73.5, len: 8 });
  greenLineCar(sim, { x: -0.75, z: -61.5, len: 8 });
}

export function lechmereDistrict(sim) {
  greenLineViaduct(sim);
  elevatedCurvedPlatform(sim);
  lechmereHeadhouse(sim);
  lechmereBusway(sim);
  innerBeltYard(sim);
  lechmereProps(sim);
}

export const LECHMERE_DECOR = {
  plaza: [
    { x: -10.75, z: -90.75, w: 14.5, d: 53.25 },   // the viaduct undercroft, all four chords
    { x: -14.5, z: -53, w: 4.25, d: 16 },          // North First Street's east walk widening
    { x: -13.5, z: -87.5, w: 4.5, d: 50 },         // the station approach walk
    { x: -21.5, z: -87.5, w: 4.5, d: 50 },         // North First Street's west walk
    { x: 3.5, z: -81.75, w: 11, d: 40 },           // the busway, its island and east footway
    { x: -47.5, z: -108, w: 25, d: 12 },           // the carhouse and its south apron
    { x: -82, z: -108, w: 15, d: 9 },              // the Transportation Office
    { x: -68, z: -104.5, w: 21, d: 5.5 },          // the yard's shared service road
  ],
  rail: [
    { x: -13, z: -101, w: 11, d: 11 },             // the yard throat leaving the abutment
    { x: -24, z: -106, w: 17, d: 6 },              // the carhouse neck
    { x: -11, z: -103.5, w: 4, d: 3 },             // the stepped curve between them
  ],
  sidewalks: [
    { x: -20.25, z: -88, w: 0.5, d: 49 },
    { x: -14, z: -81.5, w: 0.5, d: 43 },           // the east kerb, short of the junction
    { x: 13.75, z: -88, w: 0.5, d: 49 },
    { x: 3.5, z: -81.75, w: 0.5, d: 40 },
  ],
  parks: [
    { x: -23, z: -87, w: 2.5, d: 48 },             // the verge behind the west walk
  ],
};

export const LECHMERE_AMBIENT = {
  pigeons: [
    { x: -6, z: -79, count: 12 },
    { x: 8, z: -60, count: 9 },
  ],
  neon: [
    { x: -12, z: -80, w: 1.2, d: 4, color: 0x4ad9ff, period: 5.2 },
  ],
  steam: [{ x: -34, z: -102, rate: 0.22 }],
};

// --- DISTRICT 4: CAMBRIDGE STREET & THE PORTUGUESE SEAM ----------------------
// `03` §4.4's density reservoir, and the one district in the scene whose job is
// COUNT rather than mass: twenty-two triple-deckers, a storefront row, two
// civic anchors and two parks, none of which is a large object. §8.2 gives it
// the second-tightest mean-gap target on the map (8 m) and a 2.6 pieces/m²
// floor, and the reason it can carry both is that a three-storey wooden house
// with stacked porches is 71 separately-eatable members on an 18 m² footprint
// (measured, Row A #0). A tower is four slabs; this is the opposite trade. The
// rest of the census, for P6.10: one storefront unit 42, the savings bank 98,
// the church 959, Silva Park 497, Centanni Park 285.
//
// WHERE IT SITS, AND WHY IT ABUTS RATHER THAN OVERLAPS. `03` §4 gives this
// district x[−120,−58] z[−28,+30], which reaches 14 m into District 2's built
// ground. It does not need to: everything §4.4 asks for that has a derivable
// position lands west of x −72, which is exactly District 2's own west edge. So
// the geometry stops at −72.5 and the rect stops at −72, and this is the FIRST
// district pair in the scene whose rects do not overlap at all (`rectsOverlap`
// is open, so an abutting edge is not a conflict). The 2,007-piece figure that
// §4's rect-as-written would have annexed from District 2 is reported in the
// P6.4 report rather than measured into this district's density.
//
// TWO OF §4.4'S LINE ITEMS ARE NOT HERE, and it is the scale law that moves
// them rather than a decision taken here. `02` §2.5 puts Costa Lopez Park at
// real (E−314,N−251) and the Chang Shing Tofu Factory at (E−238,N−433). Both
// are past `03` §1.2's 340 m Ring B seam, so the law preserves their BEARING
// and compresses only the radius — a thing 400 m south-west stays south-west,
// at ~114 m out. They derive to scene (−76,+71.75) and (−38,+96.25), which is
// 42 m and 66 m south of §4.4's own rect and outside `CAMBRIDGE_BOUNDS`
// entirely. Building them there would force the south edge from +36 to ~+100
// and open a 38 m band of empty ground between District 2's rear yard and them,
// which `probeBoundsRect` would pass (it measures the EDGES) and a player would
// walk straight into. Their offsets are recorded at `CAMBRIDGE_OFFSETS` rows 28
// and 31 with the derived positions; the geometry waits for a district whose
// own ground reaches them. `03` §4.5 takes District 5 to z +56, which halves
// the distance.
//
// THE ONE NUMBER `02` AND ITS OWN OFFSET TABLE DISAGREE ON, recorded once here
// rather than three times: `02` §4 calls Costa Lopez and Silva "two parks 300 m
// from HubSpot" and the tofu factory "240 m southwest", against real radii of
// 402, 418 and 494 m computed from §2.5's own offsets. In all three cases the
// prose figure matches |E| alone rather than the radius, so it reads as a
// consistent transcription habit rather than three separate errors. `03` §1.2
// makes the offsets the authority and they are what is built.

// The residential fabric's geometry, in one place because every constant in it
// is load-bearing for `probePlacementStep` rather than for the eye.
//
// STOREY PITCH EQUALS THE WALL MEMBER'S OWN HEIGHT, 2.25 m, and that is the
// whole reason this house stands up to the probe. A repeated non-cube element
// must have gap 0 (abut) or gap >= its own extent; a 2.25 m wall panel on a
// 2.5 m pitch leaves 0.25 m of daylight between courses, which is 0 < gap <
// extent and exactly the "placement step does not match the extent" defect. So
// the jamb piers run the FULL storey and abut, and the floor plate is inset
// 0.25 m from every wall rather than sitting between courses. 3 x 2.25 + the
// 0.25 m plinth is 7.0 m, which is `02`'s 10.5 m triple-decker at `03` §1.2's
// 1:1.5 height scale exactly, with nothing rounded.
const TD_H = 2.25;          // storey pitch AND wall-member height — see above
const TD_D = 4;             // body depth
const TD_PORCH = 1;         // porch projection, front and rear
// Three widths and six paint tones, rotating on coprime cycles (3 and 6 share a
// factor, so a width/tone pair repeats every six houses — 21 m at the 3.5 m
// pitch, which is far outside any member's own extent). Nothing here is
// decoration: a row of identical houses on a fixed pitch is a run of identical
// collinear boxes at a fixed spacing, which is the defect the probe exists to
// catch, and the fix is that no two neighbours share a group at all.
const TD_WIDTHS = [3.0, 2.75, 3.25];
const TD_TONES = [C.clapCream, C.clapSage, C.clapSlate, C.clapOchre, C.clapRose, C.clapDove];
const TD_PITCH = 3.5;

// One three-decker. `dir` −1 puts the front porch on the −z face (axis 'x') or
// the −x face (axis 'z'); +1 puts it on the far face. Everything below is
// authored in (u, v): u runs along the frontage, v runs BACK from the front
// face, so the porch is simply negative v and the same body code serves all
// four orientations.
function tripleDecker(sim, o) {
  const {
    x, z, w = 3, d = TD_D, axis = 'x', dir = -1,
    clap = C.clapCream, trim = C.seamTrim, rear = true,
  } = o;
  const H = TD_H, N = 3, P = TD_PORCH;
  const box = (u, v, du, dv, y, h, mat, color) => {
    const bx = axis === 'x' ? x + u : (dir < 0 ? x + v : x + d - v - dv);
    const bz = axis === 'x' ? (dir < 0 ? z + v : z + d - v - dv) : z + u;
    pier(sim, {
      x: bx, y, z: bz,
      w: axis === 'x' ? du : dv,
      h,
      d: axis === 'x' ? dv : du,
      mat, color,
    });
  };

  box(0, 0, w, d, 0, 0.25, 'concrete', C.seamPlinth);
  const y0 = 0.25;

  // THE TWO FRONT WINDOWS ARE DELIBERATELY DIFFERENT WIDTHS. Two 0.75 m lights
  // 0.5 m apart are one group with a 0.5 m gap against a 0.75 m extent, which
  // fails; 0.75 and 0.5 are two groups and neither has a neighbour at all.
  const wins = [{ u: 0.5, ww: 0.75 }, { u: 1.75, ww: 0.5, door: true }];
  const jambs = [{ u: 0, jw: 0.5 }, { u: 1.25, jw: 0.5 }, { u: 2.25, jw: w - 2.25 }];

  for (let s = 0; s < N; s++) {
    const y = y0 + s * H;
    for (const j of jambs) box(j.u, 0, j.jw, 0.25, y, H, 'wood', clap);
    for (const wn of wins) {
      if (s === 0 && wn.door) {
        // The street door and its transom light. Its own extents, so it never
        // joins the window groups stacked above it.
        box(wn.u, 0, wn.ww, 0.25, y, 1.75, 'wood', C.doorRed);
        box(wn.u, 0, wn.ww, 0.25, y + 1.75, 0.5, 'glass', C.houseGlass);
        continue;
      }
      // 0.5 sill + 1.0 light + 0.75 head = 2.25. The light is 1.0 rather than
      // the 1.25 the eye would pick because the vertical gap between courses is
      // 2.25 − h, and h must be <= 1.125 for that gap to clear the extent.
      box(wn.u, 0, wn.ww, 0.25, y, 0.5, 'wood', trim);
      box(wn.u, 0, wn.ww, 0.25, y + 0.5, 1.0, 'glass', C.houseGlass);
      box(wn.u, 0, wn.ww, 0.25, y + 1.5, 0.75, 'wood', trim);
    }
    box(0, 0.25, 0.25, d - 0.5, y, H, 'wood', clap);
    box(w - 0.25, 0.25, 0.25, d - 0.5, y, H, 'wood', clap);
    box(0, d - 0.25, w, 0.25, y, H, 'wood', clap);
    // Inset from every wall so it is a floor rather than a course joint.
    box(0.25, 0.25, w - 0.5, d - 0.5, y + H - 0.25, 0.25, 'wood', C.porchDeck);
  }

  // THE STACKED PORCHES — `03` §4.4 calls them the signature and they are also
  // where a third of this house's piece count lives. The posts run CONTINUOUS
  // through all three decks rather than stopping at each: a post per storey is
  // three collinear boxes with a deck's thickness of daylight between them.
  const TOP = y0 + N * H;
  // `v0` is the porch's near edge and `rail` the v of its OUTER 0.25 m band —
  // which is v0 for the front porch (v runs back from the front face, so the
  // outermost cell is the most negative) and v0 + P − 0.25 for the rear.
  const porch = (v0, rail, roofed) => {
    // From y 0, not from the plinth's top: the plinth is the BODY's footprint
    // and stops at the front wall, so a post starting at 0.25 out here would be
    // a post with nothing under its own cell.
    box(0.25, rail, 0.25, 0.25, 0, TOP, 'wood', C.porchPost);
    box(w - 0.5, rail, 0.25, 0.25, 0, TOP, 'wood', C.porchPost);
    for (let s = 0; s < N; s++) {
      const y = s * H;
      box(0.5, v0, w - 1, P, y, 0.25, 'wood', C.porchDeck);
      for (let bu = 0.75; bu <= w - 1.0 + 1e-9; bu += 0.75) {
        box(bu, rail, 0.25, 0.25, y + 0.25, 0.5, 'wood', C.porchPost);
      }
      box(0.5, rail, w - 1, 0.25, y + 0.75, 0.25, 'wood', C.porchPost);
    }
    if (roofed) box(0, v0, w, P, TOP, 0.25, 'panel', C.seamRoof);
  };
  porch(-P, -P, false);
  if (rear) porch(d, d + P - 0.25, true);

  // Flat roof over the body and the front porch in one plate, its fascia band,
  // and the brick flue every one of these houses has.
  box(0, -P, w, d + P, TOP, 0.25, 'panel', C.seamRoof);
  box(0, -P, w, 0.25, TOP + 0.25, 0.25, 'wood', trim);
  box(w - 0.75, d - 1.25, 0.5, 0.5, TOP + 0.25, 1.0, 'brick', C.chimney);
}

// A row of them along one frontage. `i0` continues the district-wide index so
// the width/tone rotation never restarts at a row boundary — two rows meeting
// at a corner would otherwise both open with the same house.
function tripleDeckerRow(sim, o) {
  const { x, z, n, axis = 'x', dir = -1, i0 = 0, rear = true } = o;
  for (let i = 0; i < n; i++) {
    const g = i0 + i;
    const w = TD_WIDTHS[g % TD_WIDTHS.length];
    const u = i * TD_PITCH;
    tripleDecker(sim, {
      x: axis === 'x' ? x + u : x,
      z: axis === 'x' ? z : z + u,
      w, axis, dir, rear, clap: TD_TONES[g % TD_TONES.length],
    });
  }
}

// --- The Cambridge Street storefront row -------------------------------------
// `02` §7 is binding and it is binding by omission: EVOKE, DO NOT NAME. There
// is no `signText` anywhere in this district and there is no wordmark on any
// awning. What carries the identity is the awning CHROMA — the reds, greens and
// blues of a fish market, a bakery and a coffee counter — over a plain brick
// party-wall row, which is what the street actually looks like. `04` owns the
// specifics; this builds the shell they hang on.
const SHOP_TONES = [C.shopBrick, C.shopBrickAlt];
const AWNINGS = [C.awningRed, C.awningGreen, C.awningBlue, C.awningYellow];
// Two board tones for the floor plates. Not decoration — the plate is 2.5 m wide
// on a 3 m unit pitch, so one shared colour makes every plate in the row one
// `probePlacementStep` group with a 0.5 m gap against a 2.5 m extent. Alternating
// puts same-group plates 6 m apart (gap 3.5), which clears their own width.
const SHOP_DECKS = [C.porchDeck, C.shopDeck];

function shopUnit(sim, o) {
  const { x, z, w = 3, d = 5, dir = -1, storeys = 2, brick, awning, deck } = o;
  const H = 2.75;
  const box = (u, v, du, dv, y, h, mat, color) => {
    pier(sim, {
      x: x + u, y, z: dir < 0 ? z + v : z + d - v - dv,
      w: du, h, d: dv, mat, color,
    });
  };
  box(0, 0, w, d, 0, 0.25, 'concrete', C.seamPlinth);
  const y0 = 0.25;

  // Grade: two brick jambs, a central mullion, and two shopfronts of different
  // widths either side of it — same two-group trick the houses use.
  box(0, 0, 0.5, 0.25, y0, H, 'brick', brick);
  box(w - 0.5, 0, 0.5, 0.25, y0, H, 'brick', brick);
  box(1.5, 0, 0.25, 0.25, y0, H, 'brick', brick);
  const bays = [{ u: 0.5, bw: 1.0 }, { u: 1.75, bw: w - 2.25 }];
  for (const b of bays) {
    box(b.u, 0, b.bw, 0.25, y0, 0.5, 'wood', C.shopSill);        // stallriser
    box(b.u, 0, b.bw, 0.25, y0 + 0.5, 1.25, 'glass', C.shopGlass);
    box(b.u, 0, b.bw, 0.25, y0 + 1.75, 0.5, 'glass', C.shopGlass); // transom
    box(b.u, 0, b.bw, 0.25, y0 + 2.25, 0.5, 'wood', C.shopSill);   // fascia
  }
  // The awning: one 0.5 m canopy projecting a metre over the footway, on two
  // brackets. ONE piece rather than a canopy plus a hanging valance, and the
  // brackets sit in front of the brick JAMBS rather than in front of the
  // shopfront — support never flows downward, so a valance under a canopy has
  // nothing to stand on, and a bracket in front of a transom is a bracket
  // leaning on glass, which carries nothing in either direction. Both fell.
  box(0.25, -1, w - 0.5, 1, y0 + 2.25, 0.5, 'panel', awning);
  for (const bu of [0, w - 0.25]) box(bu, -0.75, 0.25, 0.75, y0 + 2.0, 0.25, 'steel', C.steelDark);

  for (let s = 1; s < storeys; s++) {
    const y = y0 + s * H;
    for (const j of [{ u: 0, jw: 0.5 }, { u: 1.25, jw: 0.5 }, { u: 2.25, jw: w - 2.25 }]) {
      box(j.u, 0, j.jw, 0.25, y, H, 'brick', brick);
    }
    for (const wn of [{ u: 0.5, ww: 0.75 }, { u: 1.75, ww: 0.5 }]) {
      box(wn.u, 0, wn.ww, 0.25, y, 0.5, 'concrete', C.shopSill);
      box(wn.u, 0, wn.ww, 0.25, y + 0.5, 1.0, 'glass', C.shopGlass);
      box(wn.u, 0, wn.ww, 0.25, y + 1.5, 0.75, 'concrete', C.shopSill);
    }
  }
  for (let s = 0; s < storeys; s++) {
    const y = y0 + s * H;
    box(0, d - 0.25, w, 0.25, y, H, 'brick', brick);            // rear wall
    box(w - 0.25, 0.25, 0.25, d - 0.5, y, H, 'brick', brick);   // party wall
    box(0.25, 0.25, w - 0.5, d - 0.5, y + H - 0.25, 0.25, 'wood', deck);
  }
  // The wall head is at `top`; the roof goes ON it, not 0.25 m into it. Setting
  // `top` a course low puts the roof slab in the same cells as the last floor
  // plate (`y + H - 0.25` for the top storey IS `y0 + storeys*H - 0.25`), which
  // is 180 overlapping cells per unit. The cornice sits BESIDE the wall head
  // rather than above the roof, so it has brick to hold onto — projecting off
  // a roof edge it has nothing under or beside it and falls.
  const top = y0 + storeys * H;
  cornice(sim, {
    x: x + 0, y: top - 0.25, z: dir < 0 ? z - 0.25 : z + d,
    run: w, axis: 'x', t: 0.25, proj: 0.25, mat: 'concrete', color: C.shopSill,
  });
  box(0, 0, w, d, top, 0.25, 'panel', C.seamRoof);
  box(0, 0, w, 0.25, top + 0.25, 0.5, 'brick', brick);          // parapet
}

function mercadoRow(sim, o) {
  const { x, z, n, d = 5, dir = -1, i0 = 0, tall = null } = o;
  for (let i = 0; i < n; i++) {
    const g = i0 + i;
    shopUnit(sim, {
      x: x + i * 3, z, w: 3, d, dir,
      storeys: tall && tall(g) ? 3 : 2,
      brick: SHOP_TONES[g % SHOP_TONES.length],
      awning: AWNINGS[g % AWNINGS.length],
      deck: SHOP_DECKS[g % SHOP_DECKS.length],
    });
  }
}

// --- East Cambridge Savings Bank ---------------------------------------------
// `02` §2.4 row: 2 storeys, real (E−378,N+88), which `sceneOffset` puts at
// (−114,−20.5) — so the footprint below is centred on that point to the
// quarter-metre rather than shifted to a tidier address. Two storeys at `02`
// §6's civic 4.3 m is 8.6 m real, 5.73 scene, taken as 5.75 (0.75 base + two
// 2.5 m storeys) because 5.73 is not on ADR-0006's grade.
//
// It fronts SOUTH onto Silva Park rather than onto Gore Street behind it, which
// is both what the offsets produce and the right way round: a small civic
// building facing a green is the one composition this neighbourhood repeats.
function savingsBank(sim) {
  const x0 = -118.5, z0 = -24, W = 9, D = 7;
  // The base is laid in three runs rather than one plate: at grade the plan
  // diagonal clause bites at 8 m and a 9 x 7 slab is 11.4.
  for (let i = 0; i < 3; i++) {
    plinth(sim, { x: x0 + i * 3, y: 0, z: z0, w: 3, d: D, h: 0.75, mat: 'concrete', color: C.bankBase });
  }
  const y0 = 0.75, H = 2.5;
  // ALTERNATING SPANDREL STONE, and it is a probe constraint before it is a
  // detail. A 1.25 m bay on a 1.75 m pilaster pitch leaves 0.50 m between
  // consecutive bays, which is `probePlacementStep`'s exact defect: a repeat step
  // shorter than the piece it repeats. Alternating the stone on `(bay + storey)`
  // parity puts same-group bays 3.5 m apart on x — clear of their 1.25 m width —
  // and, because the parity flips with the storey, makes every vertical pair two
  // different groups as well, which is the other half of the same failure (the
  // 1.5 m glass repeats on a 2.5 m storey pitch, gap 1.0).
  const BAY_STONE = [C.bankTrim, C.bankStone];
  const BAY_GLASS = [C.churchGlass, C.houseGlass];
  // Six pilasters on the park face, five bays between them.
  for (let s = 0; s < 2; s++) {
    const y = y0 + s * H;
    for (let p = 0; p < 6; p++) {
      pier(sim, { x: x0 + p * 1.75, y, z: z0 + D - 0.5, w: 0.5, h: H, d: 0.5, mat: 'concrete', color: C.bankStone });
    }
    for (let b = 0; b < 5; b++) {
      const bx = x0 + 0.5 + b * 1.75;
      if (s === 0 && b === 2) {
        // The cast-stone door surround `03` §4.4 asks for: jambs proud of the
        // wall plane, a deep lintel, and the door recessed behind both.
        pier(sim, { x: bx, y, z: z0 + D - 0.75, w: 0.25, h: H, d: 0.25, mat: 'concrete', color: C.bankTrim });
        pier(sim, { x: bx + 1, y, z: z0 + D - 0.75, w: 0.25, h: H, d: 0.25, mat: 'concrete', color: C.bankTrim });
        pier(sim, { x: bx, y, z: z0 + D - 0.5, w: 1.25, h: 2.0, d: 0.5, mat: 'wood', color: C.doorRed });
        pier(sim, { x: bx, y: y + 2.0, z: z0 + D - 0.5, w: 1.25, h: 0.5, d: 0.5, mat: 'concrete', color: C.bankTrim });
        pier(sim, { x: bx, y: y + H, z: z0 + D - 0.75, w: 1.25, h: 0.25, d: 0.25, mat: 'concrete', color: C.bankTrim });
        continue;
      }
      const stone = BAY_STONE[(b + s) % 2], lite = BAY_GLASS[(b + s) % 2];
      pier(sim, { x: bx, y, z: z0 + D - 0.5, w: 1.25, h: 0.5, d: 0.5, mat: 'concrete', color: stone });
      panel(sim, { x: bx, y: y + 0.5, z: z0 + D - 0.5, w: 1.25, h: 1.5, axis: 'x', t: 0.5, mat: 'glass', color: lite });
      pier(sim, { x: bx, y: y + 2.0, z: z0 + D - 0.5, w: 1.25, h: 0.5, d: 0.5, mat: 'concrete', color: stone });
    }
    // The rear wall, plain ashlar, and the two flanks — the flanks are laid as
    // three pier segments with the window bays cut out between them rather than
    // as one wall with a pane placed over it. A `panel` dropped onto a solid
    // pier is two blocks in the same cells, which is a ghost, not an opening.
    pier(sim, { x: x0, y, z: z0, w: W, h: H, d: 0.5, mat: 'concrete', color: C.bankStone });
    for (const sx of [x0, x0 + W - 0.5]) {
      for (const sz of [z0 + 0.5, z0 + 3, z0 + 5.5]) {
        pier(sim, { x: sx, y, z: sz, w: 0.5, h: H, d: 1, mat: 'concrete', color: C.bankStone });
      }
      // Same alternation on the flanks, for the same reason on the other axis:
      // two 1.5 m windows on a 2.5 m centre leave a 1.0 m step.
      for (const [wi, sz] of [[0, z0 + 1.5], [1, z0 + 4]]) {
        pier(sim, { x: sx, y, z: sz, w: 0.5, h: 0.5, d: 1.5, mat: 'concrete', color: wi ? C.bankBase : C.bankStone });
        panel(sim, { x: sx, y: y + 0.5, z: sz, w: 1.5, h: 1.25, axis: 'z', t: 0.5, mat: 'glass', color: BAY_GLASS[wi] });
        pier(sim, { x: sx, y: y + 1.75, z: sz, w: 0.5, h: 0.75, d: 1.5, mat: 'concrete', color: wi ? C.bankTrim : C.bankStone });
      }
    }
    // D − 1.5, not D − 1: the door surround is recessed a course behind the
    // pilaster line, so a plate that reaches the full depth puts a cell of itself
    // inside each door jamb.
    slab(sim, { x: x0 + 0.5, y: y + H - 0.25, z: z0 + 0.5, w: W - 1, d: D - 1.5, t: 0.25, mat: 'concrete', color: C.bankBase });
  }
  const top = y0 + 2 * H;
  slab(sim, { x: x0, y: top, z: z0, w: W, d: D, t: 0.25, mat: 'concrete', color: C.bankRoof });
  // ONE cornice, on the park face only. The north face stands on Gore Street's
  // south kerb line, and a 0.25 m projection there is a physical block inside a
  // declared carriageway — `probeRoadConflicts` gates every block, not tall ones.
  // ...and it hangs at the wall HEAD, not above the roof: a projecting course
  // at `top` has the roof beside it but a course too low to touch, and nothing
  // at all beneath it. At `top - 0.25` it is face-adjacent to the pilasters.
  cornice(sim, { x: x0, y: top - 0.25, z: z0 + D, run: W, axis: 'x', t: 0.25, proj: 0.25, mat: 'concrete', color: C.bankTrim });
  pier(sim, { x: x0 + 0.5, y: top + 0.25, z: z0 + 0.5, w: W - 1, h: 0.5, d: 0.25, mat: 'concrete', color: C.bankStone });
  pier(sim, { x: x0 + 0.5, y: top + 0.25, z: z0 + D - 0.75, w: W - 1, h: 0.5, d: 0.25, mat: 'concrete', color: C.bankStone });
  // The clock lantern every branch of this vintage carries.
  pier(sim, { x: x0 + W / 2 - 1, y: top + 0.25, z: z0 + D / 2 - 1, w: 2, h: 1.5, d: 2, mat: 'concrete', color: C.bankStone });
  slab(sim, { x: x0 + W / 2 - 1.25, y: top + 1.75, z: z0 + D / 2 - 1.25, w: 2.5, d: 2.5, t: 0.25, mat: 'concrete', color: C.bankRoof });
}

// --- Third Congregational Church ---------------------------------------------
// `02` §7's sensitivities list names this one explicitly: an ACTIVE place of
// worship, to be depicted respectfully and never as a destruction set-piece.
// What that means in a game where everything is eatable is that it gets the
// same care as any other building and no more attention than that — no glyph,
// no easter egg, no signage, nothing that singles it out. It is a church on a
// corner, built and left alone.
//
// `02` gives it no height, so the massing is the New England congregational
// type rather than a measurement: a plain gabled nave with a square west tower
// and a spire. Position (−108,+16.75) is `sceneOffset(−335,−36)` exactly.
function seamChurch(sim) {
  naveChurch(sim, {
    ox: -114, oz: 11.25, w: 12, d: 11, h: 6, axis: 'x',
    mat: 'concrete', stone: C.churchStone, roof: C.churchRoof, roofRise: 2,
    buttress: 4, buttressH: 5, buttressColor: C.churchStone,
    // WEST OF THE NAVE, not on its corner. `naveChurch` skips whatever cells the
    // nave already owns, so a tower at dx 0 would start at the roof line and
    // stand on the nave's cap plate; at dx −3 it is a ground-anchored shaft
    // beside the west end, which is also where a congregational tower goes.
    // `cap: 'spire'` builds the whole crown — a hand-authored spire on top of it
    // is two structures in the same cells.
    towers: [{ dx: -3, dz: 0, w: 3, d: 3, h: 13, cap: 'spire' }],
    gable: { face: 'max', w: 6, h: 4, color: C.churchGlass, y0: 2 },
  });
  // The entry stair, threaded between two buttresses. `buttress: 4` lands them
  // at ox+2, +5, +8 and +11 on both flanks, each a 1 m cube reaching z 23.25, so
  // the only clear run on this face is x[−111,−109] south of that line.
  // Going 0.75 on a 0.5 m step, so each tread OVERLAPS the one below it by 0.25
  // rather than meeting it edge to edge — an exactly-abutting stair touches only
  // along a line, which is not face adjacency, so every tread above the first is
  // unsupported and the flight collapses.
  for (let i = 0; i < 3; i++) {
    tread(sim, { x: -111, y: i * 0.25, z: 24.25 - i * 0.5, run: 2, axis: 'x', rise: 0.25, going: 0.75, mat: 'concrete', color: C.bankBase });
  }
}

// --- The parks ---------------------------------------------------------------
// `03` §4.4: "named on the ground plane. Play equipment, benches, fencing." The
// fencing is doing double duty — a park is a hole in the built fabric, so the
// mean-gap clause sees straight through one unless its EDGE is content, and a
// fence run is the cheapest continuous edge there is.
function seamParks(sim) {
  // Silva Park (−114.75,−12.5), between the savings bank and Cambridge Street.
  fenceRun(sim, { x: -119.5, z: -8, len: 9.5, axis: 'x', h: 1, mat: 'steel', color: C.parkFence });
  fenceRun(sim, { x: -110, z: -17, len: 9, axis: 'z', h: 1, mat: 'steel', color: C.parkFence });
  playgroundSet(sim, { x: -118.5, z: -13.5, slide: C.awningYellow, frame: C.awningRed, climb: C.awningBlue, deck: C.parkFence });
  for (const [tx, tz] of [[-117, -10], [-113, -10], [-118, -15.5], [-112, -15.5], [-111.5, -12]]) tree(sim, tx, tz);
  for (const bx of [-116.5, -113.5]) bench(sim, bx, -9);
  drinkingFountain(sim, -111, -9.5, C.parkFence);
  trashBin(sim, -110.75, -14, 0x33453a);
  for (const lz of [-15, -10]) lampPost(sim, -110.75, lz);
  for (const [px, pz] of [[-119, -11], [-119, -9]]) planter(sim, px, pz, 1.5, 1, C.planterSoil);

  // Centanni Park (−81.75,+5.5), the pocket park at the district's east end. It
  // is 5 m deep because its centre is fixed and Cambridge Street's south kerb is
  // 2.5 m from it — the park is small in life for the same reason.
  // The returns start a course SOUTH of the north run's line. Two runs sharing a
  // corner cell is two blocks in the same cells, not a mitre.
  fenceRun(sim, { x: -87, z: 3, len: 10.5, axis: 'x', h: 1, mat: 'steel', color: C.parkFence });
  fenceRun(sim, { x: -87, z: 3.25, len: 4.75, axis: 'z', h: 1, mat: 'steel', color: C.parkFence });
  fenceRun(sim, { x: -76.5, z: 3.25, len: 4.75, axis: 'z', h: 1, mat: 'steel', color: C.parkFence });
  for (const [tx, tz] of [[-85.5, 5], [-82, 5], [-78.5, 5]]) tree(sim, tx, tz);
  for (const bx of [-84.5, -80]) bench(sim, bx, 6.5);
  statueBase(sim, -82.25, 6.5);
  for (const lx of [-86, -77]) lampPost(sim, lx, 6.5);
  trashBin(sim, -78, 3.5, 0x33453a);
}

// A plinth-and-shaft memorial rather than a figure: the parks are named for
// people and a named park in this neighbourhood carries a stone, not a bronze.
function statueBase(sim, x, z) {
  plinth(sim, { x, y: 0, z, w: 1.5, d: 1.5, h: 0.5, mat: 'concrete', color: C.bankBase });
  pier(sim, { x: x + 0.25, y: 0.5, z: z + 0.25, w: 1, h: 1.5, d: 1, mat: 'concrete', color: C.bankStone });
  cornice(sim, { x: x + 0.125, y: 2, z: z + 0.125, run: 1.25, axis: 'x', t: 0.25, proj: 1.25, mat: 'concrete', color: C.bankTrim });
}

// --- The streetscape ---------------------------------------------------------
// `03` §8.2's rule, applied literally: the ground plane carries the density.
// Every kerb run, tree, post and parked car below is placed against the
// excursion's own corridor (2.6 m off the route line) rather than by eye, which
// is why the ranks sit where they do and not on the crown of the carriageway.
function seamKerb(sim, x, z, len, axis) {
  for (let o = 0; o < len - 0.01; o += 6) {
    const l = Math.min(6, len - o);
    beam(sim, axis === 'x'
      ? { x: x + o, y: 0, z, len: l, axis: 'x', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb }
      : { x, y: 0, z: z + o, len: l, axis: 'z', t: 0.25, depth: 0.25, mat: 'concrete', color: C.kerb });
  }
}

function seamStreetscape(sim) {
  // Cambridge Street West, both kerbs, broken at the Third Street junction.
  // THE EAST SEGMENTS START ON A 6 m MULTIPLE OF THEIR OWN JOIN, and that is a
  // probe constraint rather than a tidiness one: `seamKerb` lays 6 m runs with
  // the remainder LAST, so a segment of 17.75 m ends with a 5.75 m piece and
  // leaves the 6 m group with a 5.75 m gap against District 2's first 6 m run at
  // x −72 — one sub-extent step, exactly the defect `probePlacementStep` names.
  // At 18 m the last piece is 6 m and the two districts' kerbs simply abut.
  for (const kz of [-5.75, 1.5]) {
    seamKerb(sim, -119.5, kz, 23.25, 'x');
    seamKerb(sim, -90, kz, 18, 'x');
  }
  // Gore Street's north kerb. Its SOUTH kerb starts at x −109.5 rather than at
  // the street's west end, because the savings bank's plinth stands on that line
  // from x −118.5 to −109.5 — the building fronts the pavement directly, the way
  // a corner bank does, and a kerb there would be laid through its base.
  seamKerb(sim, -119.5, -30.25, 23.25, 'x');
  seamKerb(sim, -90, -30.25, 12, 'x');
  seamKerb(sim, -109.5, -24, 13.25, 'x');
  seamKerb(sim, -90, -24, 12, 'x');
  // Third Street, both kerbs, broken at Cambridge Street. It starts a course
  // SOUTH of Gore Street's kerb line and stops a course NORTH of Cambridge
  // Street's: at a T-junction the two kerbs meet in one corner cell, and two
  // beams in one cell is an overlap, not a corner.
  for (const kx of [-96.25, -90]) {
    seamKerb(sim, kx, -23.75, 17.75, 'z');
    seamKerb(sim, kx, 1.75, 24.25, 'z');
  }

  // Cambridge Street West's north footway — the outbound leg's rank. Posts and
  // bins alternate on a 4.5 m pitch so nothing on this walk is more than 2.5 m
  // from the next thing on it.
  // NOTHING ON EITHER WALK STANDS BETWEEN x −96 AND x −90. That is Third Street's
  // carriageway, and `probeRoadConflicts` gates a block for being inside a
  // declared road rect whatever height it is — the two walks cross the junction
  // on the crossing decor, not on street furniture. Same clause District 2's
  // First Street note already records; this is its west-end twin. The three props
  // that sat in it (a bin at −93, a bench at −95.5, a hydrant at −91) moved out
  // rather than being deleted, so the rank keeps its count.
  for (const x of [-116, -107, -98, -80, -75]) lampPost(sim, x, -6.5);
  for (const x of [-111.5, -97.25, -84.5]) trashBin(sim, x, -6.5, 0x33453a);
  hydrant(sim, -102.5, -6.5);
  mailbox(sim, -89, -6.5, C.awningBlue);
  for (const x of [-119, -105.5, -77]) bollard(sim, x, -6.5, C.steelDark);
  // The south footway — the return leg's rank, under the storefront awnings.
  for (const x of [-118, -109, -100, -82, -73.5]) lampPost(sim, x, 2.0);
  for (const x of [-113.5, -99.25]) bench(sim, x, 2.0);
  for (const x of [-104.5, -86.5]) trashBin(sim, x, 2.0, 0x33453a);
  hydrant(sim, -88.25, 2.0);
  newsBox(sim, -78, 2.0, C.awningRed);
  newsBox(sim, -76.5, 2.0, C.awningGreen);
  // The market clutter that makes a storefront row read as a working street.
  // `02` §7 again: crates and stalls, no names on any of them.
  // ALL OF IT STANDS AT z 1.75 AND IS AT MOST 1 m DEEP. The shopfronts are at
  // z 3 and the south kerb at z 1.5, so the walk is 1.5 m wide and anything
  // deeper than that is inside a shop's own plinth, not in front of it. The x
  // addresses below are interleaved with the post-and-bin rank above rather than
  // chosen by eye — every one of them sits in a gap between two of those.
  // The x addresses are the 2.5 m windows BETWEEN the awning brackets, which
  // stand at each unit's origin and 2.75 m along it: −116.25, −107.25 and the
  // open stretch east of the row. A stall parked on a unit boundary is parked in
  // a bracket.
  for (const [sx, sc] of [[-116.25, C.awningRed], [-107.25, C.awningGreen], [-85, C.awningYellow]]) {
    marketStall(sim, sx, 1.75, sc, 2.5, 1);
  }
  crateStack(sim, -112, 1.75, 2, C.dockTimber);
  crateStack(sim, -103, 1.75, 3, C.shopSill);
  sandwichBoard(sim, -110.25, 1.75, C.awningBlue);
  hotDogCart(sim, -80.5, 2.0);

  // Third Street's west footway, the leg that climbs into the residential
  // fabric. Trees rather than posts north of Cambridge Street: this is the
  // domestic half of the district and a triple-decker street is a tree street.
  // Trees only SOUTH of Cambridge Street on this side. North of it Row D's front
  // porches come out to x −96.5 and the kerb is at −96.25, so the walk there is
  // 0.25 m wide — a tree is 1.5 m across its canopy and would grow through three
  // houses. The posts and bollards are 0.25 m and abut the house line cleanly.
  // The north side's greenery moves across to Third Street's east walk instead,
  // which is open ground for its whole length.
  for (const tz of [-21, -17, -13, -9]) tree(sim, -97, tz);
  for (const lz of [-19, -11]) lampPost(sim, -97.75, lz);
  bollard(sim, -97.75, -15, C.steelDark);
  bikeRack(sim, -89, -20, 3, 'z');
  // x −89 exactly: a canopy is 1.5 m across and this walk is 2 m, between the
  // kerb at −90 and Row C's porch line at −88. There is one address that fits.
  for (const tz of [-16, -12, 6, 14, 22]) tree(sim, -89, tz);
  for (const lz of [-22, -14, 4, 12, 20]) lampPost(sim, -89, lz);

  // Gore Street's north footway and the front-yard line that fronts Row A. The
  // fence is what makes the porches reachable by the corridor: it stands 2.4 m
  // off the route line and the porch posts stand 2.1 m the other side of it.
  fenceRun(sim, { x: -119.5, z: -30.5, len: 36, axis: 'x', h: 0.75, mat: 'wood', color: C.seamTrim });
  for (const x of [-115, -106, -97, -88]) lampPost(sim, x, -31.5);
  for (const x of [-110.5, -92.5]) trashBin(sim, x, -31.5, 0x33453a);
  for (const [tx, tz] of [[-118, -32.5], [-101.5, -32.5], [-84, -32.5]]) tree(sim, tx, tz);
  // Gore Street's south footway, EAST of the savings bank only. The bank's own
  // plinth runs x[−118.5,−109.5] along this line at y[0,0.75] and street furniture
  // is 0.25 m across — a post at −116 stands inside the base of the building it
  // is meant to light.
  for (const x of [-108, -99, -88]) lampPost(sim, x, -23.5);
  for (const x of [-103.5, -84]) bollard(sim, x, -23.5, C.steelDark);
  bench(sim, -105, -23.5);

  for (const v of CAMBRIDGE_VEHICLES) {
    if (v.d !== 4) continue;
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else motorcycle(sim, v.x, v.z);
  }
}

export function portugueseSeamDistrict(sim) {
  // Row A — ten houses on Gore Street's north side, fronting south. The longest
  // continuous frontage in the district and the one the excursion's last leg
  // runs along.
  tripleDeckerRow(sim, { x: -118, z: -39, n: 10, axis: 'x', dir: 1, i0: 0 });
  // Row B — three on Gore Street's south side, east of the savings bank.
  tripleDeckerRow(sim, { x: -108.5, z: -21, n: 3, axis: 'x', dir: -1, i0: 10 });
  // Row C — four on Third Street's east side, fronting west.
  tripleDeckerRow(sim, { x: -87, z: -22, n: 4, axis: 'z', dir: -1, i0: 13 });
  // Row D — five on Third Street's west side, fronting east. No rear porches:
  // their backs abut the church's lot and a rear porch would stand in it.
  //
  // IT STARTS AT z 9, NOT z 4. The storefront row is 5 m deep from z 3, and this
  // row's body is 4 m deep from x −101.5, so the corner of the two at z 4 was
  // literally the same 3 x 4 m of ground twice over — 296 overlapping pairs, and
  // the far-away non-static blocks that came with them. z 9 leaves the corner to
  // the shop that already owns it and a 1 m service gap behind it.
  tripleDeckerRow(sim, { x: -101.5, z: 9, n: 5, axis: 'z', dir: 1, i0: 17, rear: false });

  mercadoRow(sim, { x: -119.5, z: 3, n: 5, dir: -1, i0: 0, tall: (g) => g % 3 === 1 });
  mercadoRow(sim, { x: -104.5, z: 3, n: 2, dir: -1, i0: 5 });
  mercadoRow(sim, { x: -82, z: -12, n: 3, dir: 1, i0: 7, tall: (g) => g % 3 === 1 });

  savingsBank(sim);
  seamChurch(sim);
  seamParks(sim);
  seamStreetscape(sim);
}

export const SEAM_DECOR = {
  plaza: [
    { x: -120, z: 2, w: 18.5, d: 8 },            // the south storefront run
    { x: -83, z: -13.5, w: 10.5, d: 7.5 },       // the north storefront run
    { x: -119, z: -24.5, w: 10, d: 8.5 },        // the savings bank and its apron
    { x: -118, z: 9.5, w: 18, d: 16.5 },         // the church, its tower, buttresses and stair
  ],
  parks: [
    { x: -120, z: -17.5, w: 10.5, d: 10 },       // Silva Park
    { x: -87.5, z: 2.5, w: 11.5, d: 6.5 },       // Centanni Park
    { x: -119.5, z: -41, w: 37, d: 11.5 },       // Row A's lots and front yards
    { x: -109.5, z: -24, w: 12, d: 9 },          // Row B's lots
    { x: -91, z: -23, w: 10, d: 16 },            // Row C's lots
    { x: -103, z: 3, w: 7.5, d: 23 },            // Row D's lots, to the rect's north edge
  ],
  sidewalks: [
    { x: -120, z: -7, w: 48, d: 1.5 },           // Cambridge Street West, north
    { x: -120, z: 1.5, w: 48, d: 1.5 },          // Cambridge Street West, south
    { x: -120, z: -31.75, w: 42, d: 1.75 },      // Gore Street, north
    { x: -120, z: -24, w: 42, d: 1.5 },          // Gore Street, south
    { x: -97.75, z: -24, w: 1.75, d: 50 },       // Third Street, west
    { x: -90, z: -24, w: 1.5, d: 50 },           // Third Street, east
  ],
};

export const SEAM_AMBIENT = {
  // The awning line, read as one continuous glow rather than seven signs —
  // there is no lettering anywhere in this district and there is none here.
  neon: [
    { x: -117, z: 2.5, w: 15, d: 1.2, color: 0xff9a4a, period: 3.7 },
    { x: -81, z: -6.8, w: 8, d: 1.2, color: 0xffd166, period: 4.9 },
  ],
  pigeons: [
    { x: -114, z: -11, count: 11 },
    { x: -95, z: 1, count: 9 },
    { x: -100, z: -32, count: 8 },
  ],
  steam: [{ x: -108, z: 4.5, rate: 0.18 }],
};

// --- THE SHELL ---------------------------------------------------------------
// Ground, streets, decor, kerbs, street furniture, vehicles, ambient life and
// camera blockers. IDENTICAL across all three variants by construction: it is
// one function and all three call it, so the A/B/B2 deltas are a property of the
// buildings and of the spend-back, never of the pavement.

// `opts` is P6.2's one structural addition, and it exists so that this function
// can stay the single shared shell while the SHIPPED scene grows past what the
// Phase 5 variants measured. Three optional fields, all defaulting to exactly
// the Phase 5 behaviour, so `buildVariant('A')` and `buildVariant('B2')` are
// byte-identical to what they were:
//
//   bounds   the level rect. Defaults to District 2's own hull.
//   decor    extra `sceneDecor` layers, merged in before the object is frozen
//            onto the sim — a district's ground has to be declared by the shell
//            (that is where `sceneDecor` is assembled) but must not appear in a
//            variant that does not build that district's geometry.
//   ambient  extra ambient life, merged the same way.
//
// P6.1 SET THE FULL-MAP RECT HERE AND IT IS ROLLED BACK. `03` §1.1's designed
// 252 x 228 m extent is right and it is not yet true: `probeBoundsRect`'s second
// clause fails a rect that leaves more than 12 m of blank ground on any side,
// and with two districts standing that rect leaves about a hundred. It lands for
// good at P6.10, when every district exists to fill it. Until then each task
// widens the rect to hug what is actually built — see `buildCambridge`.
export function cambridgeShell(sim, buildings, opts = {}) {
  sim.bounds = 120;
  sim.boundsRect = opts.bounds ?? { minX: -72, maxX: -25.5, minZ: -12.5, maxZ: 30 };

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

  // District 2's rows only. `CAMBRIDGE_VEHICLES` is one whole allowlist because
  // `probeRoadConflicts` needs one, but a row belongs to the district that emits
  // it — District 1's are emitted by `canalParkDistrict`.
  for (const v of CAMBRIDGE_VEHICLES) {
    if ((v.d ?? 2) !== 2) continue;
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.body, v.roof, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.cab, v.box, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.box);
    else motorcycle(sim, v.x, v.z);
  }

  // The key ORDER here is the contract `probeDecorKeyOrder` reads, so the merge
  // has to fill these arrays rather than spread another object over them.
  const layers = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };
  for (const [k, rects] of Object.entries(opts.decor ?? {})) layers[k].push(...rects);
  sim.sceneDecor = layers;

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
  for (const [k, items] of Object.entries(opts.ambient ?? {})) sim.sceneAmbient[k].push(...items);

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

// The rect below is the HULL OF WHAT IS BUILT plus the slack `probeBoundsRect`
// allows, computed from the three districts standing rather than transcribed
// from `03` §1.1's designed extent. It widens again at every P6.x and becomes
// §1.1's designed rect at P6.10.
//
// P6.3 MOVES THREE OF THE FOUR EDGES, AND minZ IS THE ONE THAT MATTERS. It goes
// to −112 not because District 3's geometry reaches there — the viaduct stops at
// −90.5 and the north edge at −108 — but because `probeOpenGround` will only
// accept the Inner Belt ballast span if the span TOUCHES a rect edge. That is
// the whole reason `03` §1.5's exception 4 exists: the carhouse and the
// Transportation Office are pulled radially in to z ≈ −100…−108 so that a rect
// reaching −112 still has content inside the probe's 12 m slack (measured: 4.5 m
// at the north edge). Span, rect and buildings are one indivisible change; land
// any two without the third and the gate goes red.
//
// minX goes to −83 for the Transportation Office's west wall at −81.5, and it is
// the office rather than District 2's mill that now sets that edge.
//
// P6.4 MOVES ONE EDGE, WEST TO −120, AND IT IS THE ONE THIS TASK WAS ALWAYS
// GOING TO MOVE. Silva Park's offset fixes its centre at x −114.75 and the park
// is 9.5 m across, so its west railing stands at −119.5 and the rect has to
// reach −120 to hold it. That happens to equal `03` §1.1's designed west edge
// exactly, which is a coincidence of one park's position rather than a decision
// to stop growing the rect — the other three edges still hug what is built and
// still move at P6.5 through P6.10.
//
// SOUTH STAYS AT +36 rather than going to ~+100. Costa Lopez Park and the Chang
// Shing Tofu Factory derive to z +71.75 and +96.25 and are the only two things
// in `03` §4.4 that would have moved it; both are deferred with their offsets
// recorded, for the reason in District 4's own note above. A rect stretched to
// +100 passes `probeBoundsRect` — it only measures the edges — and leaves 38 m
// of empty ground in the middle of the playable map, which is precisely the
// class of green-but-wrong this file keeps refusing.
export const CAMBRIDGE_BOUNDS = { minX: -120, maxX: 66, minZ: -112, maxZ: 36 };

export function buildCambridge(sim) {
  cambridgeShell(sim, (s) => {
    cambridgeBuildings(FORMS, s);
    cambridgeSpendBack(s);
    canalParkDistrict(s);
    lechmereDistrict(s);
    portugueseSeamDistrict(s);
  }, {
    bounds: CAMBRIDGE_BOUNDS,
    decor: mergeDecor(CANAL_PARK_DECOR, LECHMERE_DECOR, SEAM_DECOR),
    ambient: mergeDecor(CANAL_PARK_AMBIENT, LECHMERE_AMBIENT, SEAM_AMBIENT),
  });
}

// Several districts' worth of ground handed to one `opts.decor`. Merged here
// rather than in the shell because the shell is shared with Phase 5's variants
// and must keep seeing exactly one object.
function mergeDecor(...srcs) {
  const out = {};
  for (const src of srcs) {
    for (const [k, rects] of Object.entries(src)) (out[k] ??= []).push(...rects);
  }
  return out;
}
