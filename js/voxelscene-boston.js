// Boston Seaport — the fifth voxel sandbox scene, and the first built from a
// measured survey rather than from memory: every footprint below started as an
// OpenStreetMap way, projected to metres about 42.3480 N / 71.0450 W, reduced to
// a minimum-area box, and then divided by the scale declared here.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
//
// Layout uses the same convention as the Manhattan and Brooklyn scenes:
// x = east, z = south, north = -z. The map is a north→south ladder of bands with
// water along TWO edges — the harbour across the whole north and Fort Point
// Channel down the whole west — meeting at a corner by the Moakley Courthouse:
//
//   z -124..-104  BOSTON HARBOR — open water, a container ship standing off the
//                 President Roads channel, buoys, the ferry track
//   z -104..-86   THE PIERS — Fan Pier and its marina (W), Pier 4 and the ICA
//                 cantilevering north over the HarborWalk, Commonwealth Pier's
//                 500 m shed, the Boston Fish Pier's twin rows and its trawler
//                 fleet, one dry dock and its gantry cranes at the east edge
//   z  -86..-64   NORTHERN AVENUE / THE HARBORWALK — the Moakley Courthouse's
//                 brick horseshoe and glass conoid at the channel mouth, Fan
//                 Pier Park, One Marina Park Drive, the two Vertex slabs
//   z  -64..-42   SEAPORT BOULEVARD — the Evelyn Moakley Bridge landing, the
//                 Barking Crab's striped tent, Envoy and YOTEL on the channel,
//                 the ellipse of 121 Seaport, St. Regis's sail, Seaport Common
//                 and the head of Harbor Way
//   z  -42..-16   CONGRESS STREET — Fort Point's red-brick warehouse grid, the
//                 Children's Museum, the Hood Milk Bottle, the Tea Party brigs,
//                 District Hall, NEMA, the Silver Line headhouses and portal
//   z  -16..  +4  SUMMER STREET — elevated on a truss viaduct for 28 m over the
//                 Massport Haul Road, then at grade past the BCEC's north plaza
//                 and its cantilevered PROW
//   z   +4.. +72  THE BCEC BODY — 68 m of barrel-vaulted hall running south from
//                 the prow, meeting-room blocks on both flanks, the truck-dock
//                 sawtooth on the east flank, the Westin's finned crown and the
//                 Omni's twin towers alongside. West of it: Track 61's weed-and-
//                 ballast corridor, the BCEC's surface lots (SPAWN IS HERE) and
//                 the A Street industrial strip, the map's deliberate low band.
//   z  +72.. +92  D STREET — the Lawn on D and its ring swings, the D Street
//                 hotels, the orange-finned garage, the South Boston Bypass Road
//
// ── SCALE, AND THE THREE PLACES IT IS DELIBERATELY BROKEN ────────────────────
// Uniform 1:6 in plan and 1:3.5 in height across the whole map. That is the
// house convention (Brooklyn's generic block is ~1:5 plan / ~1:4 height) and it
// is chosen against a hard floor: props and the player stay 1:1, so anything
// past ~1:7 makes the streets narrower than the cars parked on them. A 30 m
// boulevard becomes 5 m — still two 2.5 m lanes, still drivable by a `sedan`.
// A 250 ft Seaport tower becomes 22 m.
//
// Three declared exceptions, each one load-bearing:
//
//   1. THE BCEC ROOF IS 1:2.5 IN HEIGHT. The barrel vault's real rise is 16 m
//      (13.7 m eaves → 30 m crown). At 1:3.5 that is 4.6 m over a 17 m span —
//      too flat to read as a curve at 1 m bricks, and the vault IS the building.
//      At 1:2.5 it is a 7 m rise: eaves y 8, crown y 15, a legible arc. The
//      hero's silhouette is the whole point of putting it on the map.
//
//   2. THE MARINE INDUSTRIAL PARK IS TELESCOPED ~700 REAL METRES WEST. Harpoon
//      Brewery, the Innovation & Design Building and Black Falcon really sit
//      750 m east of the Fish Pier across the lowest-density ground in the
//      district. Carried at 1:6 they would add 40% to the map for a truck yard.
//      They are pulled in to x +76..+96 instead — an effective ~1:42 there.
//      Same move Brooklyn makes with Coney Island, declared for the same reason.
//
//   3. THE WEST EDGE IS RE-SEATED. The survey put Fort Point Channel at
//      x -96..-82 with the Financial District's far bank beyond it — off the
//      map. The channel is moved to x -88..-76 (12 m ≈ 72 real m, against a real
//      90-140 m) so an 8 m-deep far bank fits inside boundsRect. Everything west
//      of Boston Wharf Road shifts ~6 m east with it. The far bank is a SKYLINE
//      WALL, not walkable ground: nine masses capped at y 28 so the Federal
//      Reserve stays the tallest thing visible from anywhere, which is true to
//      the real view down Seaport Boulevard.
//
// Two smaller lies, both inherited from the survey's -30° rotation that puts the
// Seaport grid on the axes: Congress Street is really 17° off Summer Street (they
// converge eastward) and the BCEC's own axis is 11° off the grid. Both are
// snapped. The payoff is the two water edges meeting at a real corner.
//
// ── THE VISUAL STORY ─────────────────────────────────────────────────────────
// One channel with two centuries on either side of it. Drain the colour out and
// a player should still know which bank they are on: Fort Point is 1890s
// load-bearing brick, 6-9 m, narrow granite-sett streets, fire escapes on the
// alley faces, water tanks on the roofs. The Seaport is 2010s pale precast and
// cool glass, 16-22 m, wide boulevards, street trees, no roofline older than
// this century.
//
// The palette rule that enforces it is CHROMA, not value, and that changed under
// measurement. The eyeballed first pass separated the two banks by lightness —
// brick 0x6e-0xa0, precast 0xb9-0xd8, no overlap — and the corrected samples
// killed that rule outright: de-veiled Boston brick is far lighter than the eye
// reads it (0xa38673 against the 0x8f4a3a I had guessed), so brickSunlit at 183
// luminance now sits ABOVE precastGrey at 167. The separation that survived the
// correction is saturation. Every brick value carries 46-78 points of chroma;
// every precast, roof and glass value carries 9 or fewer; the ashlar family sits
// between at 19. That is a wider and more reliable gap than the value split ever
// was, and unlike value it cannot be closed by the sun. So: if a new wall is
// masonry it must be chromatic, and if it is 21st-century skin it must be
// neutral — brightness is free. East of both, the working port keeps rust,
// Massport blue and weathered timber. And the two waters do not match — the
// harbour is blue-grey, the channel greener and siltier, and the measurement
// widened that gap rather than closing it (0x354d58 against 0x2b3d3b).
//
// ── BRICK SIZES — all four are load-bearing decisions, not decoration ────────
//   2 m    the BCEC's podium shell and its prow, the Moakley Courthouse's brick
//          wings, the Omni's podium, gantry-crane legs. A 2 m horizontal hop
//          costs 2 m of a material's span, so a 2 m plate reaches exactly ONE
//          hop — every 2 m shell here carries the mod-5 interior column pattern
//          (megaShell in voxelkit.js) so no roof cell is ever two hops from
//          support. `lensCanopy` below REPAIRS that pattern where the ellipse
//          clips it, because a dominating set on a rectangle stops dominating
//          the moment you cut a curve out of it.
//   1 m    standard buildings, the vault skin, warehouses, pier sheds, decks.
//   0.5 m  vehicles, trees, trawler hulls, the ring swings, the milk bottle,
//          fire escapes, market stalls, the Tea Party brigs' masts.
//   0.25 m street furniture, sign lettering, bollards (the HarborWalk runs
//          hundreds of them), railings, cornices, chain-link, the chapel spire.
//
// Every large civic/industrial mass goes through a named parametric builder —
// megaShell, tower, streetWall, setbackTower, gantryCrane, plus the thirteen
// marked KIT CANDIDATE below — rather than a hand-rolled loop in this file. Each
// funnels its geometry through a single primitive call site, so changing the
// primitive is one line per builder instead of an audit of this file. Add a new
// mass here and it belongs in the kit, not in a local loop.
//
// ── SCENE CONTRACTS (each one is validator-enforced in tools/validate.mjs) ───
//   - one block per fine cell; placement step always equals the brick size.
//     Every footprint on this map was settled in a rect planner BEFORE any
//     geometry was written, because a mass overlapping its neighbour does not
//     look wrong — the later block silently overwrites the earlier one and the
//     loser becomes a ghost that is unreachable in the support BFS and drops at
//     spawn. The first authoring pass shipped 212k such cells.
//   - nothing floating: glass never carries (the BCEC's clerestory is mullioned
//     every third metre for exactly this reason — the vault's outermost course
//     stands on the steel posts, never on the panes), support never flows
//     downward, 2 m plates get columns, cantilevers stay inside the material's
//     maxSpan. The ICA's real 24.4 m cantilever is cut to 3 m here; see there.
//   - no ground-anchored block inside a `roads` rect except the vehicles in
//     BOSTON_VEHICLES, which the validator imports as its allowlist, and the
//     Summer Street viaduct deck in BOSTON_ROAD_SPANS
//   - every building footprint cell stands on a decor surface — no bare ground.
//     The decor stack draws parks → sand → plaza → cobbles → sidewalks → roads →
//     rail → bikePaths → laneMarkers → crosswalks → water → boardwalk, so a
//     later layer PAINTS OVER an earlier one. Every park on this map therefore
//     has its surrounding plaza/sand rect TILED AROUND it rather than laid
//     under it — a park rect beneath a plaza rect is simply an invisible park.
//   - water rects exactly match the interior of their physical rims, and never
//     cross a road or a plaza. The four channel bridges are pure geometry over
//     water with NO road rect under them: a road rect across the channel would
//     erase the channel.
//   - crosswalk stripes come from the axis-aware kit helper, never a hand roll,
//     and no crossing sits at an intersection — two crossings that overlap are
//     a validator failure, not a design choice.
//   - cameraBlockers are GENERATED from the finished geometry (generateBlockers
//     in voxelkit.js), because a 90k-block scene cannot keep a hand list in sync
//
// ── ONE DOCUMENTED DEVIATION FROM THE SURVEY ────────────────────────────────
// The survey put spawn on the BCEC's north plaza under the prow (scene x +52,
// z -6). VoxelSandboxSim hard-codes the hole at (0, 16) and every scene in this
// repo answers that the same way — "the fix is content, not a spawn move". So
// spawn here is the BCEC WEST SURFACE LOT at (0, 16): striped asphalt, four rows
// of parked cars, food trucks, jersey barriers, light masts and the Track 61
// ballast corridor 10 m north. That is genuinely what stands there, and it is the
// densest small-brick ground on the map.
//
// It is NOT the hero shot, and an earlier draft of this paragraph claimed it was.
// The vault crown stands 15 m up and 28 m east, which sounds like a skyline —
// but ChaseCamera's pitch is fixed steep, so from the lot the crown sits above
// the top of the frame at every hole size. Rendered at size 0 and at size 4 and
// looked at, rather than reasoned about: both frames are car park to the horizon.
// The BCEC is met on approach, from the plaza and the prow, and not on frame one.

import {
  amphitheater, balustrade, basinRim, bench, bigTruck, bikeRack, bollard, boxVan,
  bus, cafeTable, crateStack, drinkingFountain, fenceRun, generateBlockers,
  gantryCrane, hotDogCart, hydrant, lampPost, laneDashes, lightMast, mailbox,
  marketStall, megaShell, motorcycle, newsBox, newsstand, pathRibbon, pavilion,
  planter, playgroundSet, sailBoat, sandwichBoard, scaffoldShed, sedan,
  setbackTower, shippingContainer, signPost, signText, statue, streetWall,
  subwayEntrance, tower, towerCrown, trafficLight, trashBags, trashBin, tree,
  treeGrove, waterTower, zebra,
} from './voxelkit.js';

// Footprint of a vehicle entry. The implementation is shared with every other
// scene (js/voxelkit.js) and re-exported here because BOSTON_VEHICLES is what
// the validator resolves through it.
export { vehicleBBox } from './voxelkit.js';

// ─────────────────────────────────────────────────────────── PALETTE
// Every value below carries its provenance, because the three classes behave
// differently under a global rebase and mixing them is how a palette rots:
//
//   mm(hex)  MEASURED, DE-VEILED. Sampled off a photograph, then corrected for
//            atmospheric veil per channel on linear RGB — `(linear - 0.021) /
//            1.182`, clamped at zero. This is what the sample would have been
//            with no air between the camera and the wall, i.e. an albedo. The
//            sources are in _boston-palette-deliverables/measured-to-albedo.md.
//            These are the ONLY values a global rebase may touch.
//
//   sp(hex)  MEASURED, RAW, transform DELIBERATELY REFUSED. Specular surfaces —
//            both waters and the curtain-wall glass. A photograph of water is
//            mostly reflected sky, not the water's own colour, so de-veiling it
//            removes atmosphere that legitimately belongs in the pixel. Our
//            renderer hands the PMREM environment probe to metals only
//            (`spec.metal >= 1`), so a dielectric has nothing to reflect and its
//            BASE COLOUR has to carry the sky itself. Flagged separately rather
//            than merged into the authored class so that a future rebase can see
//            what it must skip, and so that the day dielectrics get a probe
//            these four are a findable list rather than an archaeology problem.
//
//   0x……     AUTHORED by eye. Chosen to sit in relation to a measured neighbour
//            — a step off a band, a hue the samples never covered, or a graphic
//            accent that was never a photograph in the first place.
//
// PALETTE_TRANSFORM is the seam team-lead asked for: set it to a function and
// every de-veiled value in the scene moves in one shot, with no call-site edits
// and no risk of half the map moving. Left null on purpose — the corrected
// values ship as measured, and the look call (Boston may read brighter than the
// other four scenes) gets made against a render, not against a spreadsheet.
// Signature is (r, g, b) => [r, g, b] on 0-255 sRGB, since that is the space the
// hexes are written in and the space `THREE.Color.setHex` decodes from.
const PALETTE_TRANSFORM = null;

function mm(hex) {
  if (!PALETTE_TRANSFORM) return hex;
  const out = PALETTE_TRANSFORM((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
  const q = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (q(out[0]) << 16) | (q(out[1]) << 8) | q(out[2]);
}
const sp = (hex) => hex;

// Measured BANDS, quoted here because several authored values are steps off one
// and the band is the honest output of the measurement — the centroid is just
// its middle. dark end ‥ light end:
//   brick   0x8f725d ‥ 0xb79b89   (centroid 0xa38673, Fort Point sunlit)
//   precast 0xa7aaaf ‥ 0xcfd2d8   (centroid 0xbbbec4)
//   ashlar  0x938e80 ‥ 0xbbb6a8   (centroid 0xa7a294, Commonwealth Pier sunlit)
//   roof    0x979c9a ‥ 0xbfc4c2   (centroid 0xabb0ae, BCEC aluminium)
//   asphalt 0x5e5b54 ‥ 0x898781   (centroid 0x74716b — MEASURED BUT NOT ADOPTED;
//           road tone is the kit's, changing it is a five-scene decision)
const C = {
  // water — all specular, all raw
  harbourOpen: sp(0x354d58), harbourShore: 0x3f5a66,
  channelDeep: sp(0x2b3d3b), marinaBasin: 0x33474c,
  // Fort Point: 1890s-1920s brick. The three lit steps are the measured band's
  // ends and centre, so the value spread comes out of the measurement's own
  // uncertainty rather than out of my thumb. Deliberately NOT re-based toward
  // the old 0x8f4a3a — the correction says Boston brick is lighter and less
  // saturated than the eye reads it, and that finding is the point.
  bostonBrick: mm(0xa38673), brickSunlit: mm(0xb79b89), brickShaded: mm(0x8f725d),
  brickDark: 0x7b6250, graniteTrim: mm(0xbbb6a8), brickSidewalk: 0x9a7360,
  // the Seaport: 2000s-2020s
  precastPale: mm(0xbbbec4), precastGrey: mm(0xa7aaaf),
  glassCurtain: sp(0x91a0b6), glassLight: 0xa8b5c6, glassSail: 0x9dabbe,
  // the BCEC. Lit/shade are the roof band's two ends — see the note on
  // `barrelVaultHall` for why this vault needs an authored two-tone at all.
  bcecRoofLit: mm(0xbfc4c2), bcecRoofShade: mm(0x979c9a), bcecFascia: 0x5c6067,
  bcecFasciaLit: 0x7d828a, steelLeg: 0xa8adb2, bcecPodium: mm(0xbbbec4),
  // the working port
  fishPierBrick: 0x9c7a63, fishPierCornice: mm(0xa7a294), copperVerdigris: 0x5d8a76,
  pierStone: mm(0xa7a294), moakleyBrick: mm(0xbb8a6d),
  hullRust: 0x8a3f2e, hullGrey: 0x6e7378, craneBlue: 0x1f4f8a,
  containerRed: 0xb4552f, containerBlue: 0x23557f, containerGreen: 0x2e6a4a,
  dockTimber: 0x8a7256, dockTimberDark: 0x6f5b45, pierShedWhite: 0xe2e0d8,
  // ground
  quayConcrete: 0x8e8b83, graniteQuay: mm(0x938e80), cobbleGranite: 0x6a6560,
  constructionGravel: 0x8c8479, turf: 0x3d6b3a, turfShade: 0x2f5a33,
  // accents
  woodSoffit: mm(0xa3845d), swingWhite: mm(0xd6d2cd), silverLineBus: 0xb8bcc0,
  // Painted rooftop plant and the courthouse's lead dome. Its own key, because
  // it happens to sit near the BCEC roof's shaded end and a bare literal there
  // would silently ride along with any future roof rebase it has nothing to do
  // with — a coincidence of value is not a shared material.
  plantGrey: 0x9aa0a4,
  bostonRed: 0xc23b2e, bostonYellow: 0xf2c14e, milkBottleWhite: 0xefece4,
};

// One table drives roads, both sidewalks, and the centreline dashes, so a street
// can never ship with its sidewalk on the wrong side. Exported because the
// crossing table below indexes into it and the validator has to be able to
// resolve `[streetIndex, at]` back to the street it was declared against.
//
// Real widths come from OSM `width`/`lanes` tags, divided by 6, with a floor of
// 3 m for anything a `sedan` (2 m across) has to sit in. Summer Street is TWO
// entries because the middle of it is 7 m in the air.
export const BOSTON_STREETS = [
  { x: -56, z: -72, w: 128, d: 5, axis: 'x' },   // 0  Northern Ave (30.5 m real)
  { x: -75, z: -48, w: 111, d: 5, axis: 'x' },   // 1  Seaport Blvd (24.4 m real)
  { x: -75, z: -28, w: 151, d: 4, axis: 'x' },   // 2  Congress St (22.9 m real)
  { x: -75, z: -15, w: 69, d: 5, axis: 'x' },    // 3  Summer St, west of the viaduct
  { x: 22, z: -15, w: 52, d: 5, axis: 'x' },     // 4  Summer St, east of the viaduct
  { x: -6, z: -14, w: 28, d: 3, axis: 'x' },     // 5  Massport Haul Road, under the deck
  { x: 18, z: 86, w: 68, d: 3, axis: 'x' },      // 6  South Boston Bypass Rd
  { x: 76, z: -12, w: 18, d: 3, axis: 'x' },     // 7  Drydock Ave
  // Fort Point's four cross streets are each held ONE metre clear of the
  // warehouse run beside them. `streetWall` projects stoops, awnings and fire
  // escapes past its own `depth` on the `front` side, and a 258-block asphalt
  // violation was that projection landing in the carriageway.
  { x: -75, z: -46, w: 3, d: 68, axis: 'z' },    // 8  A St, Fort Point's spine
  { x: -62, z: -62, w: 3, d: 34, axis: 'z' },    // 9  Sleeper St
  { x: -49, z: -44, w: 3, d: 30, axis: 'z' },    // 10 Farnsworth St
  { x: -39, z: -44, w: 3, d: 42, axis: 'z' },    // 11 Boston Wharf Rd
  { x: -36, z: -84, w: 3, d: 36, axis: 'z' },    // 12 Fan Pier Blvd
  { x: 6, z: -92, w: 3, d: 44, axis: 'z' },      // 13 Pier Four Blvd
  { x: 26, z: -28, w: 3, d: 34, axis: 'z' },     // 14 B St
  { x: 60, z: -56, w: 3, d: 28, axis: 'z' },     // 15 World Trade Center Ave
  { x: 70, z: -24, w: 4, d: 112, axis: 'z' },    // 16 D St
  { x: 82, z: -100, w: 3, d: 42, axis: 'z' },    // 17 Fish Pier Rd
];

// Every vehicle in the scene. The scene places them from this list and
// tools/validate.mjs imports it as the roads allowlist, so a car can never be
// waved through at a position it does not actually occupy. Cross-street offsets
// come straight from the table above: d=5 → z+1.5, d=4 → z+1, d=3 → z+0.5, and
// w=3 → x+0.5, w=4 → x+1, because a vehicle is 2 m across and `ox/oz` is its
// MIN corner, not its centre.
export const BOSTON_VEHICLES = [
  // 0 Northern Avenue (x -56..72, z -72) — the widest street on the map
  { kind: 'sedan', x: -50, z: -70.5, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'bus', x: -30, z: -70.5, axis: 'x', color: C.silverLineBus },
  { kind: 'boxVan', x: -6, z: -70.5, axis: 'x', len: 5, color: 0xf2f2f2, color2: C.bostonRed },
  { kind: 'sedan', x: 18, z: -70.5, axis: 'x', color: 0x30343b },
  { kind: 'bigTruck', x: 44, z: -70.5, axis: 'x', color: 0x2e5d3a },
  { kind: 'sedan', x: 62, z: -70.5, axis: 'x', color: C.bostonYellow },
  // 1 Seaport Boulevard (x -75..36, z -48) — the district's spine
  { kind: 'bus', x: -68, z: -46.5, axis: 'x', color: C.silverLineBus },
  { kind: 'sedan', x: -44, z: -46.5, axis: 'x', color: 0xc23b2e },
  { kind: 'boxVan', x: -22, z: -46.5, axis: 'x', len: 6, color: 0xe8ecf2, color2: 0x2a5f9a },
  { kind: 'sedan', x: 2, z: -46.5, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'motorcycle', x: 24, z: -46.5, axis: 'x' },
  // 2 Congress Street (x -75..76, z -28)
  { kind: 'sedan', x: -66, z: -27, axis: 'x', color: 0x30343b },
  { kind: 'boxVan', x: -46, z: -27, axis: 'x', len: 5, color: 0xf2f2f2, color2: 0x2e6a4a },
  { kind: 'bus', x: -18, z: -27, axis: 'x', color: C.silverLineBus },
  { kind: 'sedan', x: 10, z: -27, axis: 'x', color: C.bostonYellow },
  { kind: 'sedan', x: 44, z: -27, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'boxVan', x: 68, z: -27, axis: 'x', len: 5, color: 0x8a8f98, color2: C.bostonRed },
  // 3 Summer Street, west of the viaduct (x -75..-6, z -15)
  { kind: 'sedan', x: -66, z: -13.5, axis: 'x', color: C.bostonYellow },
  { kind: 'bus', x: -42, z: -13.5, axis: 'x', color: 0x8a2f3a },
  { kind: 'sedan', x: -18, z: -13.5, axis: 'x', color: 0x30343b },
  // 4 Summer Street, east of the viaduct (x 22..74, z -15) — the BCEC frontage
  { kind: 'sedan', x: 30, z: -13.5, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'bus', x: 40, z: -13.5, axis: 'x', color: C.silverLineBus },
  { kind: 'boxVan', x: 54, z: -13.5, axis: 'x', len: 6, color: 0xf2f2f2, color2: C.bostonRed },
  { kind: 'sedan', x: 64, z: -13.5, axis: 'x', color: C.bostonYellow },
  // 5 the Massport Haul Road, under the viaduct (x -6..22, z -14)
  { kind: 'bigTruck', x: -4, z: -13.5, axis: 'x', color: 0x8a5a3a },
  { kind: 'boxVan', x: 12, z: -13.5, axis: 'x', len: 6, color: 0x8a8f98, color2: 0x2e5d3a },
  // 6 South Boston Bypass Road (x 18..86, z 86) — truck-only
  { kind: 'bigTruck', x: 26, z: 86.5, axis: 'x', color: 0x6e7378 },
  { kind: 'bigTruck', x: 58, z: 86.5, axis: 'x', color: 0x8a5a3a },
  // 7 Drydock Avenue (x 76..94, z -12)
  { kind: 'bigTruck', x: 80, z: -11.5, axis: 'x', color: 0x2e5d3a },
  // 8 A Street, Fort Point's spine (x -75, z -46..22)
  { kind: 'sedan', x: -74.5, z: -36, axis: 'z', color: 0x30343b },
  { kind: 'sedan', x: -74.5, z: -6, axis: 'z', color: C.bostonYellow },
  { kind: 'boxVan', x: -74.5, z: 8, axis: 'z', len: 5, color: 0x8a8f98, color2: 0x2a5f9a },
  // 9 Sleeper Street (x -62, z -62..-28)
  { kind: 'sedan', x: -61.5, z: -54, axis: 'z', color: 0xc23b2e },
  { kind: 'sedan', x: -61.5, z: -38, axis: 'z', color: 0xe8ecf2, roof: 0x2a2f3a },
  // 10 Farnsworth Street (x -49, z -44..-14)
  { kind: 'sedan', x: -48.5, z: -34, axis: 'z', color: 0x30343b },
  // 11 Boston Wharf Road (x -39, z -44..-2)
  { kind: 'sedan', x: -38.5, z: -24, axis: 'z', color: 0x8a2f3a },
  // 12 Fan Pier Boulevard (x -36, z -84..-48)
  { kind: 'sedan', x: -35.5, z: -76, axis: 'z', color: C.bostonYellow },
  { kind: 'sedan', x: -35.5, z: -60, axis: 'z', color: 0x2a5f9a },
  // 13 Pier Four Boulevard (x 6, z -92..-48)
  { kind: 'sedan', x: 6.5, z: -84, axis: 'z', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'boxVan', x: 6.5, z: -64, axis: 'z', len: 5, color: 0xf2f2f2, color2: C.bostonYellow },
  // 14 B Street (x 26, z -28..6)
  { kind: 'sedan', x: 26.5, z: -18, axis: 'z', color: 0x8a2f3a },
  // 15 World Trade Center Avenue (x 60, z -56..-28)
  { kind: 'bus', x: 60.5, z: -48, axis: 'z', color: C.silverLineBus },
  { kind: 'sedan', x: 60.5, z: -38, axis: 'z', color: 0x30343b },
  // 16 D Street (x 70, z -24..88) — the BCEC's east flank street
  { kind: 'sedan', x: 71, z: -14, axis: 'z', color: C.bostonYellow },
  { kind: 'bus', x: 71, z: 16, axis: 'z', color: 0x8a2f3a },
  { kind: 'boxVan', x: 71, z: 48, axis: 'z', len: 6, color: 0xf2f2f2, color2: 0x2e6a4a },
  { kind: 'sedan', x: 71, z: 68, axis: 'z', color: 0x30343b },
  // 17 Fish Pier Road (x 82, z -100..-58)
  { kind: 'boxVan', x: 82.5, z: -92, axis: 'z', len: 5, color: 0xe8ecf2, color2: 0x2f6fb0 },
  { kind: 'sedan', x: 82.5, z: -74, axis: 'z', color: 0x6e7378 },
  // --- THE BCEC WEST SURFACE LOT, at spawn. Not on any street, so none of these
  // needs the roads allowlist — they are here because one vehicle list is easier
  // to audit than two, and because these forty-odd small bricks ARE the opening
  // snack ring. Four rows on the striped asphalt, a 5 m gap left down the middle
  // so the 4 m spawn disc at (0, 16) stays clear.
  { kind: 'sedan', x: -14, z: 8, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'sedan', x: -7, z: 8, axis: 'x', color: 0xc23b2e },
  { kind: 'sedan', x: 7, z: 8, axis: 'x', color: 0x30343b },
  { kind: 'sedan', x: 14, z: 8, axis: 'x', color: C.bostonYellow },
  { kind: 'sedan', x: -14, z: 12, axis: 'x', color: 0x2a5f9a },
  { kind: 'sedan', x: -7, z: 12, axis: 'x', color: 0x8a8f98 },
  { kind: 'sedan', x: 7, z: 12, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'sedan', x: 14, z: 12, axis: 'x', color: 0x2e5d3a },
  { kind: 'sedan', x: -14, z: 20, axis: 'x', color: 0x8a2f3a },
  { kind: 'sedan', x: -7, z: 20, axis: 'x', color: 0x30343b },
  { kind: 'sedan', x: 7, z: 20, axis: 'x', color: C.bostonYellow },
  { kind: 'sedan', x: 14, z: 20, axis: 'x', color: 0xe8ecf2, roof: 0x2a2f3a },
  { kind: 'sedan', x: -14, z: 24, axis: 'x', color: 0x6e7378 },
  { kind: 'sedan', x: -7, z: 24, axis: 'x', color: 0x2a5f9a },
  { kind: 'sedan', x: 7, z: 24, axis: 'x', color: 0xc23b2e },
  { kind: 'sedan', x: 14, z: 24, axis: 'x', color: 0x30343b },
  { kind: 'motorcycle', x: -1, z: 25, axis: 'x' },
  { kind: 'motorcycle', x: 3, z: 25, axis: 'x' },
];

// The ONLY structures allowed to occupy a roadway rect besides the vehicles
// above, declared by explicit position and minimum underside height rather than
// by any size/height filter — a filter is what let a 0.25 m bollard and a stoop
// each stand in asphalt during Brooklyn's authoring.
//
// One entry: the Summer Street viaduct. Its 7 m clear span is the map's one
// piece of genuine vertical discovery — the Haul Road runs beneath it, so a
// player who drops off the deck edge finds a second ground level. The bents
// themselves stand OUTSIDE the Haul Road's asphalt at z -16 and z -10; only the
// top chord and the deck are inside it, and both are above y 6.
// The rect is stated in BLOCK-RECT terms, half a metre proud of the outermost
// member's centre on every side: the probe requires a block to be FULLY inside
// the span, and a 1 m chord centred on x 22 has its rect running to x 22.5.
export const BOSTON_ROAD_SPANS = [
  { minX: -7, maxX: 23, minZ: -17, maxZ: -9, minY: 6 },
];

// Ground that is empty ON PURPOSE. A dead-space sweep flags any point with
// nothing edible within 8 m; the honest way to answer one is to build there, or
// to say — here, in the scene, with a reason — that the emptiness is the design.
// The validator holds each span to being genuinely block-free and to touching a
// boundsRect edge, because "the edge of the map trails off" is the only accepted
// rationale. An INTERIOR void cannot be declared away.
export const BOSTON_OPEN_GROUND = [
  {
    // The harbour proper, north of the President Roads channel markers. The
    // container ship, the buoys and every pier head sit south of z -115; beyond
    // that it is open water running off the top of the map.
    minX: -96, maxX: 96, minZ: -124, maxZ: -115,
    why: 'open harbour north of the channel markers, at the level edge',
  },
];

// Length of a crossing along its street's direction of travel.
export const XW_LEN = 2.8;

// `[streetIndex, at]`, where `at` is an ABSOLUTE coordinate on the street's own
// axis and the crossing occupies `at .. at + XW_LEN`. The validator resolves each
// entry against BOSTON_STREETS[si] rather than against the road set, because
// Summer Street West and Summer Street East are collinear segments of one line —
// a crossing that overshot one would land on the other's asphalt, inside a legal
// road rect, and render as a perfectly ordinary crossing on the wrong street.
//
// Every entry is also held clear of the cross streets, because two crossings
// that meet at an intersection produce overlapping stripe rects and read as a
// smear rather than as two crossings.
export const BOSTON_CROSSINGS = [
  [0, -50], [0, -28], [0, 14], [0, 40], [0, 56],      // Northern Ave (x -56..72)
  [1, -66], [1, -56], [1, -30], [1, -12], [1, 26],    // Seaport Blvd (x -75..36)
  [2, -66], [2, -56], [2, -30], [2, -8], [2, 14], [2, 44], [2, 70],  // Congress St
  [3, -68], [3, -56], [3, -30],                       // Summer St W (x -75..-6)
  [4, 30], [4, 44], [4, 58],                          // Summer St E (x 22..74)
  [6, 30], [6, 62],                                   // Bypass Rd (x 18..86)
  [7, 78], [7, 88],                                   // Drydock Ave (x 76..94)
  [8, -34], [8, -8], [8, 14],                         // A St (z -46..22)
  [9, -56], [9, -44],                                 // Sleeper St (z -62..-28)
  [10, -40], [10, -22],                               // Farnsworth St (z -44..-14)
  [11, -36], [11, -10],                               // Boston Wharf Rd (z -44..-2)
  [12, -80], [12, -62],                               // Fan Pier Blvd (z -84..-48)
  [13, -88], [13, -80], [13, -60],                    // Pier Four Blvd (z -92..-48)
  [14, -20], [14, -4],                                // B St (z -28..6)
  [15, -52], [15, -40],                               // WTC Ave (z -56..-28)
  [16, -8], [16, 20], [16, 50], [16, 78],             // D St (z -24..88)
  [17, -94], [17, -70],                               // Fish Pier Rd (z -100..-58)
];

// ═══════════════════════════════════════════════════ KIT CANDIDATES
// Thirteen parametric builders that belong in js/voxelkit.js and are parked here
// only because that file is held by another author this pass. Each one is
// general (the reason is stated on each), each funnels its geometry through a
// single `put()` call site, and each stands by construction rather than by luck.

// KIT CANDIDATE — `barrelVaultHall`. Nothing in the kit does a curved roof over
// a long span, and the shape is not Boston-specific: any hangar, drill hall,
// market hall, armoury or train shed is this object. Highest priority of the
// thirteen by a distance, because it is the only way to build the BCEC.
//
// Structure, from the ground up:
//   - a `megaShell` podium in 2 m bricks, mod-5 interior columns, roof plate on
//     top. Its plate's TOP FACE is the eaves line and everything above stands
//     on it, which is why the vault never needs a rib.
//   - a continuous clerestory band one course above the plate, mullioned every
//     third metre. Glass carries nothing in this sim, so the mullions are the
//     vault's real bearing and the panes between are held horizontally off them.
//   - the vault skin: TWO cells per column, at [h(i) - 1, h(i)]. Two, not one,
//     and that is the whole trick. The profile steps by exactly 1 between
//     neighbouring columns, so a one-cell skin would only ever meet its
//     neighbour diagonally and the entire roof would drop at spawn. With two,
//     column i's LOWER cell is level with column i-1's UPPER cell: a 1 m
//     horizontal hop onto a cell that is itself vertically supported, so the
//     BFS resets the cantilever span at every step and the arch walks all the
//     way to the crown on a 1 m budget. It is a stair, built as masonry.
//   - an optional end taper, and roof monitors as darker patches on the skin.
function barrelVaultHall(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oz, nx2, nz2, ny2 = 3,
    crown = 15, crownDrop = 0, taper = 0,
    podium = C.bcecPodium, lit = C.bcecRoofLit, shade = C.bcecRoofShade,
    mullion = 0x8f959b, glass = C.glassLight,
    monitor = null, monitorEvery = 0, monitorLen = 3,
  } = o;
  const n = nx2 * 2;                       // 1 m columns across the vault
  const eaves = ny2 * 2 + 2;               // top face of the podium's 2 m roof plate
  const zEnd = oz + nz2 * 2;
  const spring = eaves + 1;                // the vault's first course
  megaShell(sim, ox, 0, oz, nx2, ny2, nz2, 'concrete', podium, {
    roofMat: 'concrete', roofColor: podium,
  });
  for (let z = oz; z < zEnd; z++) {
    const t = taper > 0 ? Math.max(0, taper - Math.min(z - oz, zEnd - 1 - z)) : 0;
    const nn = n - 2 * t;
    if (nn < 4) continue;
    if (t === 0) {
      for (const cx of [ox, ox + n - 1]) {
        const post = ((z - oz) % 3) === 0;
        put(cx, eaves, z, post ? 'steel' : 'glass', 1, post ? mullion : glass);
      }
    } else {
      // A tapered row has no clerestory to spring from, so it gets a SOLID
      // springing course under every column of the arch, not just under the two
      // ends. Two ends is enough for a wide row where the profile climbs one
      // cell at a time; a six-column row climbs four cells at once, and its
      // middle then reaches four hops sideways for support on a 3 m budget.
      for (let i = 0; i < nn; i++) put(ox + t + i, eaves, z, 'concrete', 1, podium);
    }
    const frac = (z - oz) / Math.max(1, zEnd - 1 - oz);
    const rise = crown - crownDrop * frac - spring;
    const mon = monitorEvery > 0 && ((z - oz) % monitorEvery) < monitorLen;
    // Roof trusses, every third bay. A real barrel vault carries its crown by
    // ARCH ACTION, which this sim does not model: it only walks a support graph
    // outward with a per-material span budget. The crown of this profile is a
    // plateau eight 1 m columns wide, so its middle sat eight hops from the
    // nearest vertical anchor and detached — and no amount of reshaping the skin
    // fixes that, because the plateau is the point of the shape. Posts on a 3 m
    // grid put every skin cell within three hops of the podium plate, and the
    // real building has exactly this: long-span trusses under a standing seam.
    const truss = ((z - oz) % 3) === 0;
    const hs = [];
    for (let i = 0; i < nn; i++) hs.push(spring + Math.round(rise * Math.sin(Math.PI * i / (nn - 1))));
    let prev = spring;
    for (let i = 0; i < nn; i++) {
      const x = ox + t + i;
      const h = hs[i];
      // Sunlit on the east-facing half, shaded on the west, so the vault reads
      // as a curve from an overhead camera instead of a flat white lozenge.
      //
      // This is the ONE place the palette's "never bake a shadow into an albedo"
      // rule is knowingly bent, so the reason is written down rather than left
      // to be rediscovered as a bug. A stepped voxel vault has no curve for the
      // renderer to shade: every cell is an axis-aligned cube, so every top face
      // carries the identical +y normal and every lit face the identical value.
      // Real shading needs a normal that turns, and there is none. Without the
      // two-tone the vault renders as one flat lozenge — the shape that is the
      // building's entire silhouette simply does not appear. So `lit`/`shade`
      // are a MODELLING device standing in for a normal, not a sampled shadow:
      // both come from the roof band's two measured ends (0xbfc4c2 / 0x979c9a),
      // and neither is the discarded shaded-stone sample. A global rebase moves
      // them together and the curve survives it.
      const face = i < nn * 0.45 ? shade : lit;
      const skin = mon && i > nn * 0.3 && i < nn * 0.7 && monitor !== null ? monitor : face;
      // Fill from the LOWER of this column and BOTH its neighbours, not from
      // h-1. A tapered row has only six columns for the same rise, so its
      // profile can jump four cells between neighbours and a two-cell cap only
      // bridges a one-cell step. Taking both neighbours (not just the previous
      // one) is what makes the DESCENDING flank contiguous — the ascending
      // flank was already fine, which is why the first pass only dropped cells
      // on the far side of the crown.
      const lo = Math.max(spring, Math.min(prev, h, hs[i + 1] ?? h) - 1);
      // The truss post carries this column from the podium plate up to the skin.
      const post = truss && (t + i) % 3 === 0 && t + i > 0 && t + i < n - 1;
      // A tapered row already has a solid springing course at `eaves` under
      // every one of its columns, so the post starts one course above it there.
      if (post) for (let y = t > 0 ? eaves + 1 : eaves; y < lo; y++) put(x, y, z, 'steel', 1, mullion);
      for (let y = lo; y <= h; y++) put(x, y, z, 'panel', 1, skin);
      prev = h;
    }
  }
}

// KIT CANDIDATE — `lensCanopy`. A lens/saucer mass held clear of the ground on a
// forest of columns, with a genuine soffit under it. Serves the BCEC prow here;
// the same object is every airport canopy, transit shed and stadium concourse
// roof. Generalises megaShell's mod-5 dominating pattern to a CLIPPED plan,
// which is the part that cannot be borrowed: `(ix + 2*iz) % 5` dominates a
// rectangle, and stops dominating the moment an ellipse is cut out of it, so
// this repairs the set cell by cell before it builds anything.
function lensCanopy(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oz, nx, nz, legTop = 10,
    soffit = C.bcecFascia, fascia = C.bcecFasciaLit, leg = C.steelLeg, roof = C.bcecRoofLit,
    flare = true,
  } = o;
  const cx = (nx - 1) / 2, cz = (nz - 1) / 2;
  const cells = [];
  const has = new Set();
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const u = (ix - cx) / (cx + 0.5), v = (iz - cz) / (cz + 0.5);
      if (u * u + v * v <= 1) { cells.push([ix, iz]); has.add(ix + ',' + iz); }
    }
  }
  const legs = new Set();
  for (const [ix, iz] of cells) if ((ix + 2 * iz) % 5 === 0) legs.add(ix + ',' + iz);
  for (const [ix, iz] of cells) {
    const k = ix + ',' + iz;
    if (legs.has(k)) continue;
    const held = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dz]) => legs.has((ix + dx) + ',' + (iz + dz)));
    if (!held) legs.add(k);
  }
  for (const k of legs) {
    const [ix, iz] = k.split(',').map(Number);
    const x = ox + ix * 2, z = oz + iz * 2;
    for (let y = 0; y < legTop; y += 2) put(x, y, z, 'steel', 2, leg);
    // Splayed foot: a stepped 0.5 m flare that reads as the X-brace in every
    // photograph of this plaza. Stepped and GROUNDED rather than raking,
    // because a strut that leans out over nothing is a cantilever that grows
    // 0.5 m of span per step and detaches at the fourth one. Placed strictly on
    // the 0.5 m lattice so it can never share a fine cell with the 2 m leg.
    if (!flare) continue;
    for (let s = 1; s <= 2; s++) {
      const hgt = 2.5 - s * 0.5;
      for (const fx of [x - s * 0.5, x + 1.5 + s * 0.5]) {
        for (let fz = z + 0.5; fz < z + 1.5; fz += 0.5) {
          for (let y = 0; y < hgt; y += 0.5) put(fx, y, fz, 'steel', 0.5, leg);
        }
      }
    }
  }
  const inner = (ix, iz) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .every(([dx, dz]) => has.has((ix + dx) + ',' + (iz + dz)));
  for (const [ix, iz] of cells) {
    const x = ox + ix * 2, z = oz + iz * 2;
    put(x, legTop, z, 'concrete', 2, soffit);          // the soffit everyone stands under
    put(x, legTop + 2, z, 'concrete', 2, fascia);      // the dark fascia band
    if (inner(ix, iz)) put(x, legTop + 4, z, 'concrete', 2, roof);
  }
}

// KIT CANDIDATE — `cantileverBox`. A box that overhangs its support by a declared
// distance with a distinct soffit material. Every museum, transit hall and
// broadcast studio built since 2000 has one.
//
// THE DEVIATION, STATED: the ICA's real cantilever is 24.4 m (80 ft), which is
// 4 m at this scale. A 1 m concrete plate accumulates 1 m of span per hop and
// fails past maxSpan 3, so 4 m of unsupported plate is 4 hops and it drops at
// spawn — the survey flagged this before a block was placed. It is built at 3 m
// instead. Three is the honest maximum, not a rounding: the alternative was a
// hidden 2 m brace grid under the soffit, and a brace grid you can see from the
// HarborWalk is worse than a metre of lost drama.
function cantileverBox(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oz, w, d, over = 3, y0, h,
    wall = 0x8fa8ae, rib = 0xdcd2d6, frame = 0x242a30, soffit = C.woodSoffit,
    ribSide = 'w',
  } = o;
  // A TRANSFER SLAB under the plate, one course down, across the supported
  // footprint only. Without it the cantilever's budget is spent before it
  // starts: `tower`'s curtain wall puts a glass pane at every odd cell of its
  // top course, glass carries nothing vertically, and the plate's back row is
  // therefore anchored at only half its cells — the other half is already one
  // hop into its 3 m allowance and the outermost row lands on 4.
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) {
    put(ox + i, y0 - 1, oz + k, 'concrete', 1, frame);
  }
  // The soffit plate is the cantilever. Cells run from the supported edge out.
  for (let i = 0; i < w; i++) for (let k = 0; k < d + over; k++) {
    put(ox + i, y0, oz - over + k, 'concrete', 1, k < over ? soffit : frame);
  }
  // Box walls stand ON the plate, so every course above resets its own span,
  // plus an interior column grid on a 3 m pitch — the cap plate is as wide as
  // the floor plate and a perimeter-only box drops its middle exactly the way
  // an uncolumned pier shed does.
  for (let y = y0 + 1; y < y0 + h; y++) {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d + over; k++) {
        const edge = i === 0 || i === w - 1 || k === 0 || k === d + over - 1;
        if (!edge) { if (i % 3 === 1 && k % 3 === 1) put(ox + i, y, oz - over + k, 'steel', 1, frame); continue; }
        const ribbed = (ribSide === 'w' && i === 0) || (ribSide === 'e' && i === w - 1);
        const post = (i + k) % 3 === 0;
        put(ox + i, y, oz - over + k, post ? 'steel' : (ribbed ? 'panel' : 'glass'), 1,
          post ? frame : (ribbed ? rib : wall));
      }
    }
  }
  for (let i = 0; i < w; i++) for (let k = 0; k < d + over; k++) {
    put(ox + i, y0 + h, oz - over + k, 'concrete', 1, frame);
  }
}

// KIT CANDIDATE — `pierShed`. A long low building on a pier deck: ribbed face,
// monitor roof, parapet, and — the part that cannot be skipped — an interior
// column grid. Nine uses on this map alone and every working port has a dozen.
//
// The columns are the whole lesson. A floor plate is carried HORIZONTALLY off
// whatever it touches, and concrete gives up past 3 m, so an 18 m-wide shed
// whose only support is its own perimeter drops its middle nine metres at spawn.
// Columns on a 3 m grid keep every plate cell within two hops of one.
function pierShed(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oz, w, d, h, wall = 0xe2e0d8, ribColor = 0xb8b5ad, roof = 0x6a6a62,
    cornice = null, axis = 'z', monitor = true, ribEvery = 3, colColor = 0x7a7f86,
  } = o;
  const col = (i, k) => i % 3 === 1 && k % 3 === 1;
  for (let y = 0; y < h; y++) {
    const slab = y % 3 === 0;
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) {
        const edge = i === 0 || i === w - 1 || k === 0 || k === d - 1;
        if (slab) { put(ox + i, y, oz + k, 'concrete', 1, y === 0 ? wall : roof); continue; }
        if (!edge) { if (col(i, k)) put(ox + i, y, oz + k, 'steel', 1, colColor); continue; }
        const along = axis === 'z' ? k : i;
        const rib = along % ribEvery === 0;
        const win = !rib && y % 3 === 2;
        put(ox + i, y, oz + k, win ? 'glass' : 'panel', 1, win ? undefined : (rib ? ribColor : wall));
      }
    }
  }
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) put(ox + i, h, oz + k, 'concrete', 1, roof);
  if (cornice !== null) {
    // On the roof plate's own edge cells, never a quarter-metre outboard of it:
    // an eaves course hung off the side of the parapet has no cell beneath it
    // and drops the whole band at spawn.
    for (let k = 0; k < d * 4; k++) {
      for (const cx of [ox, ox + w - 0.25]) {
        sim._block(cx, h + 1, oz + k * 0.25, 'concrete', 0.25, cornice);
        sim._block(cx, h + 1.25, oz + k * 0.25, 'concrete', 0.25, cornice);
      }
    }
  }
  if (monitor && w >= 5 && d >= 5) {
    for (let i = 2; i < w - 2; i++) for (let k = 2; k < d - 2; k++) put(ox + i, h + 1, oz + k, 'panel', 1, roof);
  }
}

// KIT CANDIDATE — `fishingTrawler`. Hull, wheelhouse, blue A-frame gantry and
// two net drums. `rowBoat` and `sailBoat` are an order of magnitude too small
// for a working berth, and the Fish Pier needs four of these; any harbour scene
// does. The A-frame is the read — the drums and the frame are what says
// "dragger" rather than "boat". Everything above the deck starts at y 1, on the
// deck plate: half a metre of clearance for a mooring line is half a metre of
// nothing to stand on, and the first authoring pass floated 541 blocks that way.
function fishingTrawler(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const S = 0.5;
  const {
    x, z, len = 9, axis = 'z', hull = 0x8a3f2e, deck = 0x6e7378,
    house = 0xe8ecf2, gantry = 0x2f6fb0, net = 0x6f8f3f,
  } = o;
  const B = (u, y, v, m, c) => (axis === 'z' ? put(x + v, y, z + u, m, S, c) : put(x + u, y, z + v, m, S, c));
  for (let u = 0; u < len; u += S) {
    for (let v = 0; v < 2.5; v += S) {
      if (u < 1 && (v < 0.5 || v > 1.5)) continue;       // raked bow
      B(u, 0, v, 'panel', hull);
      B(u, S, v, 'panel', deck);
      if (v === 0 || v >= 2) B(u, 1, v, 'panel', hull);  // bulwark
    }
  }
  // Wheelhouse. The window course alternates with solid mullions rather than
  // glazing the whole band: glass carries nothing in this sim, so a continuous
  // pane course leaves the roof above it standing on air.
  for (let u = 1.5; u < 3.5; u += S) {
    for (let v = 0.5; v < 2; v += S) {
      B(u, 1, v, 'panel', house);
      B(u, 1.5, v, ((u * 2) % 2 === 0) ? 'panel' : 'glass', ((u * 2) % 2 === 0) ? house : undefined);
      B(u, 2, v, 'panel', house);
    }
  }
  for (let y = 2.5; y < 4.5; y += S) B(2, y, 1, 'steel', 0x39414d);   // mast
  const g = len - 2.5;
  for (const v of [0.5, 1.5]) for (let y = 1; y < 4; y += S) B(g, y, v, 'steel', gantry);
  for (let v = 0.5; v <= 1.5 + 1e-9; v += S) B(g, 4, v, 'steel', gantry);
  for (const u of [g - 1.5, g - 0.5]) {
    for (let v = 0.5; v < 2; v += S) { B(u, 1, v, 'panel', net); B(u, 1.5, v, 'panel', net); }
  }
}

// KIT CANDIDATE — `roadViaduct`. `trussViaduct` in the kit runs along z only and
// hard-codes its leg geometry to that axis; an east-west elevated road cannot
// use it. This is the same object with the axis as a parameter, plus the top
// chord that lets a deck wider than one bay stand up. The chord width is capped
// by steel's 3 m span from each leg line, which is why the deck here is 7 cells.
function roadViaduct(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    u0, u1, vN, vS, legH = 7, bay = 4, axis = 'x',
    steel = 0x5a6472, deckColor = 0x7f858c, rail = 0x8d3f36, railStep = 2,
  } = o;
  const B = (u, y, v, m, s, c) => (axis === 'x' ? put(u, y, v, m, s, c) : put(v, y, u, m, s, c));
  for (let u = u0; u <= u1; u += bay) {
    for (const lv of [vN, vS]) for (let y = 0; y < legH; y++) B(u, y, lv, 'steel', 1, steel);
    for (let v = vN; v <= vS; v++) B(u, legH, v, 'steel', 1, steel);      // top chord
  }
  for (let u = u0; u <= u1; u++) {
    for (let v = vN; v <= vS; v++) B(u, legH + 1, v, 'concrete', 1, deckColor);
  }
  for (let u = u0; u <= u1; u += railStep) {
    for (const rv of [vN, vS + 0.5]) {
      B(u, legH + 2, rv, 'steel', 0.5, rail);
      B(u, legH + 2.5, rv, 'steel', 0.5, rail);
    }
  }
}

// KIT CANDIDATE — `dryDock`. A stepped rectangular basin cut into a quay with a
// caisson gate at the water end. The single best "this is a working port" object
// available and it costs almost nothing. Built as stepped SOLID altars rather
// than a hollow box, for the same reason `rockMound` is solid: a hollow basin
// collapses like a building and reads like one when the hole opens it.
function dryDock(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    x, z, w, d, steps = 3, floor = 0x7a766c, wall = 0x8e8b83, caisson = 0x5a6472,
  } = o;
  for (let s = 0; s < steps; s++) {
    for (let i = s; i < w - s; i++) {
      for (let k = s; k < d - s; k++) {
        const ring = i === s || i === w - 1 - s || k === s || k === d - 1 - s;
        if (!ring && s < steps - 1) continue;
        put(x + i, 0, z + k, 'concrete', 1, s === steps - 1 ? floor : wall);
      }
    }
  }
  for (let i = 0; i < w; i++) put(x + i, 1, z, 'steel', 1, caisson);   // caisson gate
}

// KIT CANDIDATE — `ringSwing`. The Lawn on D's *Swing Time*: illuminated
// translucent ring swings on steel frames. It is THE photograph of that park and
// nothing else on any of these maps looks like it. Generalises to any hung-seat
// play structure. The ring hangs at the frame beam's OWN level, never below it —
// support never flows downward in this sim, so a swing that actually swings is
// impossible and a swing that reads is the goal.
function ringSwing(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const s = 0.25;
  const { x, z, n = 3, pitch = 2, frame = 0x8f959b, ring = C.swingWhite } = o;
  for (let i = 0; i < n; i++) {
    const ox = x + i * pitch;
    for (const px of [ox, ox + 1.25]) for (let y = 0; y < 2.5; y += s) put(px, y, z, 'steel', s, frame);
    for (let u = 0; u <= 1.25 + 1e-9; u += s) put(ox + u, 2.5, z, 'steel', s, frame);
    // Lintel under the beam. Without it the lower half of the ring hangs off a
    // cell that is only ABOVE it, and support never flows downward — the ring
    // reads fine in a screenshot and drops the moment the sim starts.
    for (let u = s; u < 1.25; u += s) put(ox + u, 2.25, z, 'steel', s, frame);
    for (const dx of [0.25, 0.5, 0.75]) put(ox + dx, 2.5, z + s, 'panel', s, ring);
    for (const dx of [0.25, 0.75]) put(ox + dx, 2.25, z + s, 'panel', s, ring);
  }
}

// KIT CANDIDATE — `harborFerry`. A 25-30 m passenger ferry / water taxi. Boston's
// yellow water taxis are a genuine identity marker and the Fan Pier and
// Commonwealth Pier landings both need one moored; every waterfront scene does.
function harborFerry(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const S = 0.5;
  const { x, z, len = 7, axis = 'x', hull = 0xf2c14e, house = 0xe8ecf2, trim = 0x2a4f6a } = o;
  const B = (u, y, v, m, c) => (axis === 'x' ? put(x + u, y, z + v, m, S, c) : put(x + v, y, z + u, m, S, c));
  for (let u = 0; u < len; u += S) {
    for (let v = 0; v < 2.5; v += S) {
      if (u < 0.5 && (v < 0.5 || v > 1.5)) continue;
      B(u, 0, v, 'panel', hull);
      B(u, S, v, 'panel', trim);
    }
  }
  for (let u = 1; u < len - 1.5; u += S) {
    for (let v = 0.5; v < 2; v += S) {
      B(u, 1, v, 'panel', house);
      B(u, 1.5, v, ((u * 2) % 2 === 0) ? 'panel' : 'glass', ((u * 2) % 2 === 0) ? house : undefined);
      B(u, 2, v, 'panel', house);
    }
  }
  for (let y = 2.5; y < 3.5; y += S) B(2, y, 1, 'steel', trim);
}

// KIT CANDIDATE — `movableBridge`. A low steel deck on piers with a machinery
// house and timber dolphin fender clusters in the water. Three of the four Fort
// Point Channel bridges are movable and it shows; the type recurs on every
// working waterfront. Note there is NO road decor under any of these — a road
// rect drawn across a water rect erases the water, so the deck IS the surface.
function movableBridge(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    x0, x1, z0, w = 4, deckY = 2, pierEvery = 4,
    steel = 0x8d9298, deckColor = 0x6f7378, house = null, fender = 0x6f5b45,
  } = o;
  for (let x = x0; x <= x1; x += pierEvery) {
    for (let k = 0; k < w; k++) for (let y = 0; y < deckY; y++) put(x, y, z0 + k, 'concrete', 1, steel);
  }
  for (let x = x0; x <= x1; x++) {
    for (let k = 0; k < w; k++) put(x, deckY, z0 + k, 'concrete', 1, deckColor);
  }
  // Handrails on the deck's own outermost cells, not outboard of them — and
  // never inside the machinery house's footprint, because the house has to
  // stand ON the deck (nothing else here is over anything but water) and a
  // 0.25 m rail written into a 1 m house cell makes a ghost of one of them.
  const inHouse = (hx, hz) => house
    && hx >= house.x && hx < house.x + 3 && hz + 0.25 > house.z && hz < house.z + 3;
  for (let x = x0; x <= x1; x += 2) {
    for (const rz of [z0, z0 + w - 0.25]) {
      if (inHouse(x, rz)) continue;
      put(x, deckY + 1, rz, 'steel', 0.25, steel);
      put(x, deckY + 1.25, rz, 'steel', 0.25, steel);
    }
  }
  if (house) {
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        for (let y = deckY + 1; y < deckY + 4; y++) put(house.x + i, y, house.z + k, 'panel', 1, house.color);
      }
    }
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) put(house.x + i, deckY + 4, house.z + k, 'concrete', 1, 0x5a5f66);
  }
  // dolphin fender clusters — timber piles standing in the channel bed
  for (let x = x0 + 2; x < x1; x += 6) {
    for (const dz of [-1.5, w + 0.5]) {
      for (let u = 0; u < 1; u += 0.5) for (let y = 0; y < deckY + 0.5; y += 0.5) {
        put(x + u, y, z0 + dz, 'wood', 0.5, fender);
      }
    }
  }
}

// KIT CANDIDATE — `tallShip`. The two Tea Party brigs at the Congress Street
// bridge. Masts, yards and a dark hull; the payoff per brick is high and any
// historic waterfront wants one. Yards sit at their mast's own level, never hung
// off its top.
function tallShip(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const S = 0.5;
  const { x, z, len = 7, axis = 'x', hull = 0x3a2f28, deck = 0x8a7256, mast = 0x6b5540, sail = 0xe8e2d2 } = o;
  const B = (u, y, v, m, c) => (axis === 'x' ? put(x + u, y, z + v, m, S, c) : put(x + v, y, z + u, m, S, c));
  for (let u = 0; u < len; u += S) {
    for (let v = 0; v < 2; v += S) {
      if (u < 0.5 && (v < 0.5 || v > 1)) continue;
      B(u, 0, v, 'wood', hull);
      B(u, S, v, 'wood', deck);
      if (v === 0 || v >= 1.5) B(u, 1, v, 'wood', hull);
    }
  }
  for (const mu of [1.5, 4]) {
    for (let y = 1; y < 6; y += S) B(mu, y, 0.5, 'wood', mast);
    for (const yy of [3, 4.5]) {
      // v 0.5 IS the mast — writing the yard through it makes one of the two a
      // ghost, and the ghost takes the sail above it down with it.
      for (let v = 0; v < 1.5; v += S) { if (v !== 0.5) B(mu, yy, v, 'wood', mast); }
      for (let v = 0; v < 1.5; v += S) B(mu + S, yy, v, 'panel', sail);
    }
  }
}

// KIT CANDIDATE — `conoidWall`. A tall glazed wall that bows in plan, on steel
// mullions, with the bow QUANTIZED to the mullion pitch. The quantization is the
// general lesson and the reason this is not three lines inline: a wall whose
// plan offset changes every column meets its neighbour diagonally, and a
// diagonal neighbour is not a support path — the panes between two steps have
// nothing to hang off. Bowing in mullion-pitch groups keeps every pane
// orthogonally adjacent to a grounded post. Serves the Moakley Courthouse here;
// the same object is every curved lobby and conservatory front.
function conoidWall(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oz, w, h, bows = [0], group = 2, axis = 'x',
    post = 0x8a8378, glass = 0x5f7a86, postEvery = 4,
  } = o;
  for (let i = 0; i < w; i++) {
    const bow = bows[Math.min(bows.length - 1, Math.floor(i / group))];
    for (let y = 0; y < h; y++) {
      const isPost = i % group === 0 || y % postEvery === 0;
      const bx = axis === 'x' ? ox + i : ox + bow;
      const bz = axis === 'x' ? oz + bow : oz + i;
      put(bx, y, bz, isPost ? 'steel' : 'glass', 1, isPost ? post : glass);
    }
  }
}

// KIT CANDIDATE — `parkingStalls`. Painted stall stripes as DECOR rects, the
// companion to `zebra` and `laneDashes`. The Seaport's single most characteristic
// ground surface is striped surface lot — hundreds of metres of it around the
// BCEC and along the Haul Road — and there was no helper for it, so every scene
// that wanted one would have hand-rolled a loop and got the axis wrong the way
// an inline zebra once did. `axis` is the direction stalls REPEAT.
function parkingStalls({ x, z, w, d, axis = 'x', pitch = 2.4, line = 0.14 }) {
  const out = [];
  const span = axis === 'x' ? w : d;
  const n = Math.max(1, Math.floor(span / pitch));
  for (let i = 0; i <= n; i++) {
    const o = i * pitch;
    out.push(axis === 'x' ? { x: x + o, z, w: line, d } : { x, z: z + o, w, d: line });
  }
  return out;
}

// KIT CANDIDATE — `foodTruck`. `boxVan` is close, but the raised serving hatch
// and awning are the whole read and there is no way to get them out of boxVan.
// The BCEC lots, Northern Avenue and the Lawn on D all cluster them.
function foodTruck(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const S = 0.5;
  const { x, z, axis = 'x', body = 0xe8ecf2, trim = 0xc23b2e } = o;
  const B = (u, y, v, m, c) => (axis === 'x' ? put(x + u, y, z + v, m, S, c) : put(x + v, y, z + u, m, S, c));
  for (const [wu, wv] of [[0.5, 0], [0.5, 1.5], [4, 0], [4, 1.5]]) B(wu, 0, wv, 'rubber', undefined);
  for (let u = 0; u < 5.5; u += S) for (let v = 0; v < 2; v += S) B(u, 0.5, v, 'steel', undefined);
  for (let u = 0; u < 5.5; u += S) {
    for (let v = 0; v < 2; v += S) {
      const edge = u === 0 || u >= 5 || v === 0 || v >= 1.5;
      if (!edge) continue;
      const cab = u < 1.5;
      B(u, 1, v, cab && u === 0 ? 'glass' : 'panel', cab && u === 0 ? undefined : body);
      B(u, 1.5, v, 'panel', body);
    }
  }
  for (let u = 0; u < 5.5; u += S) for (let v = 0; v < 2; v += S) B(u, 2, v, 'panel', body);
  // serving hatch: a raised awning board standing on the roof line, kerb side.
  // Both courses are inside the roof's own footprint (v < 2), because a board
  // half a metre proud of the roof edge has nothing under it.
  for (let u = 2; u < 4.5; u += S) { B(u, 2.5, 1, 'panel', trim); B(u, 2.5, 1.5, 'panel', trim); }
}

// ═══════════════════════════════════════════════════════════ THE SCENE
export function buildBoston(sim) {
  sim.bounds = 120;
  // Content bbox is x[-96,96] z[-114,92]; the harbour's north strip is declared
  // open ground rather than filled, so boundsRect hugs the built content on the
  // three land edges and runs out into water on the fourth.
  sim.boundsRect = { minX: -96, maxX: 96, minZ: -124, maxZ: 92 };

  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s = 1, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);
  const B25 = (x0, y0, z0, nx, ny, nz, m, c) => BOX(x0, y0, z0, nx, ny, nz, m, 0.25, c);

  // Decor accumulators. Districts push their own surfaces so a building and the
  // ground it stands on are always written next to each other.
  const parks = [], sand = [], plaza = [], cobbles = [], sidewalks = [];
  const roads = [], rail = [], bikePaths = [], laneMarkers = [], crosswalks = [];
  const water = [], boardwalk = [];

  // ══════════════════════════════════════════════════════ WATER
  // Nine rects. The two bodies are deliberately different colours — the harbour
  // is blue-grey and the channel is green and silty, and they do not match in
  // any photograph of this place. W_HARBOUR / W_CHANNEL / W_EASTQUAY /
  // W_RESERVED run off a map edge by design and the rim probe skips them; the
  // five enclosed lobes get their rim built from the SAME rect objects below, so
  // the wall and the water it holds back can never drift apart under an edit.
  const W_HARBOUR = { x: -96, z: -124, w: 192, d: 20, color: C.harbourOpen };
  const W_MOUTH = { x: -88, z: -104, w: 32, d: 18, color: C.harbourShore };
  const W_CHANNEL = { x: -88, z: -86, w: 12, d: 178, color: C.channelDeep };
  const W_MARINA = { x: -40, z: -104, w: 16, d: 16, color: C.marinaBasin };
  const W_PIER4 = { x: -24, z: -104, w: 64, d: 8, color: C.harbourShore };
  const W_NORTHERN = { x: 16, z: -96, w: 24, d: 10, color: C.harbourShore };
  const W_BETWEEN = { x: 62, z: -104, w: 13, d: 18, color: C.harbourShore };
  const W_EASTQUAY = { x: 92, z: -104, w: 4, d: 18, color: C.harbourShore };
  const W_RESERVED = { x: 88, z: 58, w: 8, d: 34, color: C.harbourShore };
  water.push(W_HARBOUR, W_MOUTH, W_CHANNEL, W_MARINA, W_PIER4, W_NORTHERN,
    W_BETWEEN, W_EASTQUAY, W_RESERVED);

  // ═══════════════════════════════════════════ DISTRICT BASES
  // Rule: no building may stand on the raw ground plane. Each district lays a
  // broad surface first; roads are drawn on top of it and buildings sit beside
  // them. Colour is free on every rect, so the districts read apart at a glance —
  // and here that carries the map's whole story, because Fort Point's ground is
  // granite sett and brick paver while the Seaport's is pale precast and gravel.
  //
  // The rects TILE rather than overlap, and — because plaza and sand both draw
  // ON TOP of parks — every rect below is cut around the park it surrounds. A
  // park laid under a plaza is an invisible park, which is exactly the bug that
  // made Seaport Common and Fan Pier Park vanish on the first authoring pass.
  parks.push(
    { x: -54, z: -100, w: 12, d: 12, color: C.turf },     // Fan Pier Park
    { x: -44, z: -46, w: 10, d: 12, color: C.turfShade }, // Smith Family Waterfront
    { x: -6, z: -46, w: 12, d: 12, color: C.turf },       // Seaport Common
    { x: 10, z: -46, w: 10, d: 12, color: C.turfShade },  // Sea Green, on Harbor Way
    { x: 40, z: -54, w: 6, d: 16, color: C.turfShade },   // Eastport Park
    { x: 60, z: 38, w: 10, d: 36, color: C.turf },        // THE LAWN ON D
    { x: -32, z: 60, w: 12, d: 12, color: C.turfShade },  // the Track 61 volunteer green
  );
  plaza.push(
    { x: -96, z: -104, w: 8, d: 196, color: 0x6a6862 },      // far bank (Financial District)
    // Fan Pier's tip, tiled as a ring around Fan Pier Park
    { x: -56, z: -104, w: 16, d: 4, color: C.quayConcrete },
    { x: -56, z: -100, w: 2, d: 14, color: C.quayConcrete },
    { x: -42, z: -100, w: 2, d: 12, color: C.quayConcrete },
    { x: -54, z: -88, w: 12, d: 2, color: C.quayConcrete },
    { x: -76, z: -86, w: 32, d: 24, color: C.graniteQuay },  // Moakley quay, channel mouth
    { x: -76, z: -62, w: 32, d: 86, color: 0x6e6a64 },       // FORT POINT
    { x: -44, z: -88, w: 60, d: 40, color: C.quayConcrete },  // Fan Pier / Seaport north
    { x: -24, z: -96, w: 40, d: 8, color: C.quayConcrete },   // Pier 4 head
    { x: 16, z: -86, w: 24, d: 38, color: C.quayConcrete },   // Northern Ave waterfront
    { x: 40, z: -104, w: 22, d: 48, color: C.quayConcrete },  // Commonwealth Pier
    { x: 62, z: -86, w: 13, d: 30, color: C.quayConcrete },   // between the piers
    { x: 75, z: -104, w: 17, d: 48, color: C.quayConcrete },  // Boston Fish Pier
    { x: 92, z: -86, w: 4, d: 30, color: C.quayConcrete },    // east quay
    // the SEAPORT core, tiled around Smith Family / Seaport Common / Sea Green
    { x: -44, z: -48, w: 84, d: 2, color: 0x8e8b83 },
    { x: -34, z: -46, w: 28, d: 12, color: 0x8e8b83 },
    { x: 6, z: -46, w: 4, d: 12, color: 0x8e8b83 },
    { x: 20, z: -46, w: 20, d: 12, color: 0x8e8b83 },
    { x: -44, z: -34, w: 84, d: 20, color: 0x8e8b83 },
    // WTC Ave / Congress east, tiled around Eastport Park
    { x: 40, z: -56, w: 36, d: 2, color: 0x8a8782 },
    { x: 46, z: -54, w: 30, d: 16, color: 0x8a8782 },
    { x: 40, z: -38, w: 36, d: 24, color: 0x8a8782 },
    { x: 76, z: -56, w: 20, d: 76, color: 0x7f7c74 },         // the telescoped port
    // the BCEC + Summer St plaza, tiled around the Lawn on D
    { x: 22, z: -14, w: 52, d: 52, color: 0x8a8782 },
    { x: 22, z: 38, w: 38, d: 36, color: 0x8a8782 },
    { x: 70, z: 38, w: 4, d: 36, color: 0x8a8782 },
    { x: 22, z: 74, w: 52, d: 6, color: 0x8a8782 },
    { x: 74, z: 20, w: 14, d: 66, color: 0x8e8b83 },          // D Street hotels
    { x: 88, z: 20, w: 8, d: 38, color: 0x7f7c74 },           // Black Falcon apron
    { x: 14, z: 80, w: 72, d: 12, color: 0x6f6c66 },          // Bypass Road verge
    { x: 75, z: -14, w: 1, d: 34, color: 0x8a8782 },          // WTC Ave / BCEC apron seam
    { x: 86, z: 86, w: 2, d: 6, color: 0x6f6c66 },            // SE corner seam
  );
  // The Seaport is permanently half-built, so `sand` is repurposed as crushed
  // construction gravel rather than beach — there is no beach in this district
  // and gravel is more honest than grass. It carries the surface lots, and the
  // Track 61 corridor is likewise tiled around its one volunteer green.
  sand.push(
    { x: -76, z: 24, w: 40, d: 68, color: C.constructionGravel },  // A St industrial strip
    { x: -36, z: 4, w: 58, d: 56, color: C.constructionGravel },   // Track 61 / BCEC lots
    { x: -36, z: 60, w: 4, d: 12, color: C.constructionGravel },
    { x: -20, z: 60, w: 42, d: 12, color: C.constructionGravel },
    { x: -36, z: 72, w: 58, d: 10, color: C.constructionGravel },
    { x: -34, z: -14, w: 28, d: 18, color: 0x8f8b80 },             // Summer St parcel
    // Three seams the district rects left on the raw ground plane. None of them
    // failed a probe — probeBareGround only tests cells a BUILDING stands on, and
    // reportDeadGround only samples ground more than 8 m from any block — but the
    // engine's default ground renders through every one of them, and a bare
    // stripe eight metres wide reads as a hole in the map. Found by scanning the
    // decor stack cell by cell rather than by trusting either probe.
    { x: -44, z: -2, w: 10, d: 6, color: C.constructionGravel },   // Boston Wharf Rd tail
    { x: -44, z: 4, w: 8, d: 20, color: C.constructionGravel },
    { x: -6, z: -11, w: 28, d: 15, color: 0x8f8b80 },              // under the Summer St viaduct
    { x: -36, z: 82, w: 50, d: 10, color: C.constructionGravel },  // Bypass Rd verge, west half
    // and the hairline seams left where a district rect met a road's sidewalk
    // half a metre short. Each is stated to the exact remaining width rather
    // than overlapped onto its neighbour, so the layers still tile.
    { x: -44, z: -9, w: 3.5, d: 7, color: C.constructionGravel },
    { x: -34.5, z: -9, w: 0.5, d: 7, color: C.constructionGravel },
  );
  // Fort Point's granite setts are real and are half its character.
  cobbles.push(
    { x: -70, z: -20, w: 26, d: 12, color: C.cobbleGranite },   // Necco Ct / Necco Pl
    { x: -70, z: -6, w: 26, d: 10, color: C.cobbleGranite },    // Stillings St alleys
    { x: -76, z: -60, w: 6, d: 14, color: 0x60594f },           // the old wharf edge
  );
  rail.push(
    { x: -34, z: 4, w: 62, d: 6, color: 0x3a3128 },       // Track 61, disused freight spur
    { x: 76, z: -40, w: 20, d: 6, color: 0x3a3128 },      // dry-dock crane rails
  );
  boardwalk.push(
    { x: -54, z: -88, w: 12, d: 2, color: C.dockTimber },      // Fan Pier HarborWalk
    { x: -24, z: -96, w: 40, d: 2, color: C.dockTimber },      // Pier 4 / ICA deck
    { x: -40, z: -88, w: 16, d: 2, color: C.dockTimberDark },  // marina head docks
    { x: 75, z: -104, w: 17, d: 2, color: C.dockTimberDark },  // Fish Pier head
  );

  // Every enclosed water lobe gets its rim from the same rect objects the water
  // layer was pushed from. `skip` suppresses ring cells that another lobe
  // already covers, which is what lets the harbour, the mouth, the marina and
  // Pier 4's basin meet without a wall standing in open water between them.
  const wetAny = (x, z) => water.some((w) => x >= w.x && x < w.x + w.w && z >= w.z && z < w.z + w.d);
  basinRim(sim, [W_MOUTH, W_MARINA, W_PIER4, W_NORTHERN, W_BETWEEN],
    { mat: 'concrete', color: C.graniteQuay, skip: wetAny });

  // ══════════════════════════════════ N — BOSTON HARBOR
  // The map's north edge is open water, and boundsRect only hugs the content if
  // SOMETHING stands out there: a container ship on the President Roads track,
  // three channel markers, and the ferry line. All of it sits on a water rect,
  // which is a decor layer, so none of it stands on bare ground — and all of it
  // sits SOUTH of z -115 so the declared open-ground span stays genuinely empty.
  {
    const hx = 52, hz = -114;
    for (let x = 0; x < 30; x++) {
      for (let z = 0; z < 6; z++) {
        if (x > 27 && (z < 1 || z > 4)) continue;         // raked bow
        B(hx + x, 0, hz + z, 'panel', 1, 0x5a3f38);
        B(hx + x, 1, hz + z, 'panel', 1, 0x2f3640);
        if (z === 0 || z === 5) B(hx + x, 2, hz + z, 'panel', 1, 0x2f3640);
      }
    }
    // container stacks on deck — the ship IS the stacks, seen from the shore
    const cols = [C.containerRed, C.containerBlue, C.containerGreen, C.bostonYellow];
    let n = 0;
    for (let x = 2; x < 16; x += 7) {
      for (let z = 1; z < 5; z += 2) {
        shippingContainer(sim, hx + x, 2, hz + z, 6, cols[n % 4]);
        if (n % 3 !== 2) shippingContainer(sim, hx + x, 5, hz + z, 6, cols[(n + 2) % 4]);
        n++;
      }
    }
    BOX(hx + 24, 2, hz + 1, 4, 4, 4, 'panel', 1, 0xe8ecf2);   // bridge house, aft
    BOX(hx + 24, 6, hz + 1, 4, 1, 4, 'concrete', 1, 0x5a5f66);
    BOX(hx + 25, 7, hz + 2, 2, 3, 2, 'steel', 1, 0x8d9298);
  }
  // President Roads channel markers — a green can, a red nun, and a bell buoy
  for (const [bx, bz, col] of [[-14, -112, 0x2e6a4a], [8, -110, C.bostonRed], [-52, -111, C.bostonRed]]) {
    for (let y = 0; y < 1.5; y += 0.5) B(bx, y, bz, 'panel', 0.5, col);
    B25(bx + 0.125, 1.5, bz + 0.125, 1, 4, 1, 'steel', 0x39414d);
    B25(bx, 2.5, bz, 2, 1, 2, 'panel', col);
  }

  // ══════════════════════════════════ NW — THE FAR BANK (skyline wall only)
  // Not walkable: a 7 m-deep wall of masses across the channel giving the map its
  // western horizon. Capped at y 28 so the Federal Reserve's slab stays the
  // tallest thing visible from anywhere, which is true to the real view down
  // Seaport Boulevard. The real Fed is 187 m — 53 m at 1:3.5 — and at that
  // height it would simply eat the map.
  for (const [ox, oz, w, d, h, col, crown] of [
    [-96, -100, 7, 10, 12, 0x7e4a3a, 'lantern'],   // Rowes Wharf, brick + the famous dome
    [-96, -86, 7, 12, 21, 0x8f9aa0, 'flat'],       // InterContinental Boston
    [-96, -70, 7, 10, 8, 0x8a5644, 'flat'],        // Atlantic Wharf brick base
    [-96, -58, 7, 9, 28, 0xe4e2d6, 'flat'],        // FEDERAL RESERVE — the tallest
    [-96, -46, 7, 9, 26, 0x8d8a82, 'deco'],        // One Financial Center
    [-96, -34, 7, 8, 13, 0x5f7f8a, 'flat'],        // Independence Wharf
    [-96, -22, 7, 12, 10, 0x8a5644, 'flat'],       // South Station head house
    [-96, -6, 7, 14, 7, C.brickShaded, 'flat'],    // Gillette / Channel Center far side
    [-96, 14, 7, 16, 6, 0x6e6a62, 'flat'],         // the channel's silted south end
  ]) {
    const glassy = col === 0x8f9aa0 || col === 0x5f7f8a || col === 0x8d8a82;
    tower(sim, ox, oz, w, d, 0, h, glassy ? 'curtain' : 'masonry', glassy ? 'panel' : 'brick', col);
    BOX(ox, h, oz, w, 1, d, 'concrete', 1, 0x5f5a52);
    if (crown !== 'flat') {
      towerCrown(sim, {
        ox: ox + 1, oz: oz + 2, w: w - 2, d: Math.min(d - 4, 6), y: h + 1,
        style: crown, color: C.plantGrey, accent: 0x7a7f86,
      });
    }
  }

  // ══════════════════════════════════ FORT POINT CHANNEL — quay, bridges, brigs
  // The channel's two granite rims. They start at z -85 because the harbour
  // mouth's own rim (built from the water rects above) already owns the cells
  // north of that, and a rim written twice is a ghost.
  for (let z = -85; z < 92; z++) {
    B(-89, 0, z, 'concrete', 1, C.graniteQuay);
    B(-76, 0, z, 'concrete', 1, C.graniteQuay);
  }
  // Four crossings, north to south. None of them carries a `roads` rect: water
  // draws near the top of the decor stack, so a road rect laid across the channel
  // would simply erase the channel. The decks ARE the surface.
  movableBridge(sim, {                                    // Old Northern Ave, the 1908 swing truss
    x0: -88, x1: -77, z0: -68, w: 3, deckY: 2, pierEvery: 5,
    steel: 0x6f7a80, deckColor: 0x5f676c, fender: C.dockTimberDark,
  });
  // The truss stands INBOARD of the deck's own handrails (z -68 and -65.25) —
  // a 0.5 m chord written into a 0.25 m rail cell is one of the two blocks
  // becoming a ghost, and the ghost is whichever one loses the race.
  for (let x = -88; x <= -77; x += 0.5) {
    for (const rz of [-67.5, -66]) {
      for (let y = 3; y < 5; y += 0.5) B(x, y, rz, 'steel', 0.5, 0x6f7a80);
      B(x, 5, rz, 'steel', 0.5, 0x7a858c);
    }
  }
  movableBridge(sim, {                                    // Evelyn Moakley Bridge — Seaport Blvd
    x0: -88, x1: -77, z0: -48, w: 5, deckY: 2, pierEvery: 4,
    steel: 0x9a958a, deckColor: 0x7f858c, fender: C.dockTimberDark,
  });
  movableBridge(sim, {                                    // Congress Street Bridge
    x0: -88, x1: -77, z0: -28, w: 4, deckY: 2, pierEvery: 4,
    steel: C.precastPale, deckColor: C.quayConcrete,
    // The house stands ON the deck (z -28..-24), not beside it — a machinery
    // house hung off the deck edge has nothing under it but channel water.
    // Painted steel plant, so it takes the hull family and NOT brickShaded —
    // it carried the old brick value only because the two happened to look
    // alike, which is the coincidence the plantGrey note warns about.
    house: { x: -81, z: -28, color: C.hullRust }, fender: C.dockTimberDark,
  });
  movableBridge(sim, {                                    // Summer Street retractile bridge
    x0: -88, x1: -77, z0: -15, w: 5, deckY: 2, pierEvery: 4,
    steel: 0x8d9298, deckColor: 0x7f858c,
    house: { x: -81, z: -15, color: 0x5a5f66 }, fender: C.dockTimberDark,
  });
  // The Tea Party brigs, moored on the Congress St bridge's south side
  tallShip(sim, { x: -86, z: -22.5, len: 7, axis: 'x' });
  tallShip(sim, { x: -86, z: -20, len: 7, axis: 'x' });

  // ══════════════════════════════════ W — FORT POINT
  // The map's other half and the reason it has a story: Boston Wharf Company
  // warehouses, 1890s-1920s, load-bearing red brick over granite, 6-9 m here.
  // Built as RUNS rather than individually — the rhythm of a party-wall block is
  // the neighbourhood tell, and no single warehouse is. Each run stops at the
  // cross street it meets, which is why A Street's wall is two runs and not one.
  {
    const brick = [C.bostonBrick, C.brickSunlit, C.brickShaded, C.brickDark];
    streetWall(sim, {                                     // A St east wall, north of Congress
      x: -70, z: -42, len: 14, depth: 7, axis: 'z', front: -1, unit: 7, gap: 1,
      heights: [7, 8, 9], colors: brick, roofColors: [0x5f574e, 0x554e46],
      cornice: C.graniteTrim, water: 2, escape: 2, seed: 3,
    });
    streetWall(sim, {                                     // A St east wall, south of Congress
      x: -70, z: -24, len: 8, depth: 7, axis: 'z', front: -1, unit: 8, gap: 1,
      heights: [8, 9], colors: brick, roofColors: [0x5f574e],
      cornice: C.graniteTrim, water: 1, escape: 1, seed: 5,
    });
    streetWall(sim, {                                     // the Sleeper/Farnsworth block
      x: -58, z: -42, len: 14, depth: 7, axis: 'z', front: 1, unit: 7, gap: 1,
      heights: [8, 9, 7], colors: brick, roofColors: [0x5f574e],
      cornice: C.graniteTrim, water: 2, escape: 3, seed: 7,
    });
    streetWall(sim, {                                     // the Boston Wharf Rd edge
      x: -45, z: -40, len: 12, depth: 4, axis: 'z', front: 1, unit: 6, gap: 1,
      heights: [8, 6, 9], colors: brick, roofColors: [0x554e46],
      cornice: C.graniteTrim, escape: 2, seed: 11,
    });
    // 315 on A — the modern intruder, 20 storeys of pale panel in the middle of
    // the brick. It is real and it is the exception that proves the palette rule.
    setbackTower(sim, {
      ox: -70, oz: -8, w: 7, d: 8, tiers: [{ h: 14 }, { h: 6, insetX: 1, insetZ: 1 }],
      kind: 'curtain', wallMat: 'panel', wall: 0x9a8d80, roof: 0x5f5a52,
    });
    // Boston Children's Museum — a red-brick wharf warehouse with a bolted-on
    // glazed entry cube in green and yellow.
    tower(sim, -70, -56, 6, 6, 0, 6, 'masonry', 'brick', 0x8a4a3a);
    BOX(-70, 6, -56, 6, 1, 6, 'concrete', 1, 0x5f574e);
    BOX(-64, 0, -54, 2, 4, 3, 'panel', 1, 0x3f8f6a);      // the glazed entry cube (panel: it carries its own lid)
    BOX(-64, 4, -54, 2, 1, 3, 'panel', 1, C.bostonYellow);
    waterTower(sim, -68, 7, -54, 0x6f5238);
    // The Hood Milk Bottle — 12.2 m of wooden milk bottle on the wharf. At 1:6 in
    // plan it would vanish, so it is built 1:1: a 2 m-square stack with a conical
    // cap. Cheapest recognisable object on the map.
    {
      const mx = -65, mz = -59;
      for (let y = 0; y < 4; y += 0.5) BOX(mx, y, mz, 4, 1, 4, 'wood', 0.5, C.milkBottleWhite);
      BOX(mx + 0.5, 4, mz + 0.5, 3, 1, 3, 'wood', 0.5, C.milkBottleWhite);
      // _box takes CELL COUNTS, not metres: `ny 2` at s 0.5 is one metre of
      // neck, and the red cap two metres above it was hanging in mid-air.
      BOX(mx + 1, 4.5, mz + 1, 2, 4, 2, 'wood', 0.5, C.milkBottleWhite);
      BOX(mx + 1, 6.5, mz + 1, 2, 1, 2, 'panel', 0.5, C.bostonRed);
    }
    // Boston Fire Museum — the little 1891 firehouse, south of Congress
    pavilion(sim, {
      x: -57, z: -22, w: 4, d: 4, h: 4, wallMat: 'brick', wall: 0x8f4f3c,
      plate: 0x5f574e, roof: 0x4a5450, roofRise: 1,
    });
    // Alley life on the setts. Fire escapes live on the runs above, so this is
    // ground-level clutter — loading docks, bins, pallets.
    // The runs own x -70..-63 (z -42..-29 and -24..-17) and x -70..-63 again at
    // z -8..0, so every stack below sits in the open setts east of them.
    for (const [x, z] of [[-60, -18], [-53, -18], [-50, -6], [-61, -4], [-56, -2]]) {
      crateStack(sim, x, z, 3);
      trashBags(sim, x + 1.5, z + 0.5);
    }
    for (const [x, z] of [[-71.5, -22], [-71.5, 0], [-63.5, -50], [-52.5, -50]]) lampPost(sim, x, z);
    for (const [x, z] of [[-71.5, -20], [-71.5, 10], [-62.5, -20]]) hydrant(sim, x, z);
    trashBin(sim, -71.5, -29.5); mailbox(sim, -71.5, 4); newsstand(sim, -62, -19);
    trafficLight(sim, -71.5, -30.5); trafficLight(sim, -62.5, -30.5);
    for (const [x, z] of [[-71.5, -6], [-71.5, 16], [-50, -32]]) tree(sim, x, z);
    sandwichBoard(sim, -61, -6); sandwichBoard(sim, -55, -10);
    // Seated at x -72..-70.5: A Street's asphalt ends at -72 and the run's
    // cornice band hangs at -70.5, so this is the only 1.5 m of free sidewalk.
    scaffoldShed(sim, { x: -72, z: -40, len: 10, axis: 'z', w: 1.5, h: 2.5, fascia: 0x2f6b4a });
    subwayEntrance(sim, -60, -23);
    // Channel Center — the converted brick industrial block at Fort Point's
    // southern tail. It exists because the dead-ground report put four samples
    // on this plaza with nothing within eight metres of them: the district's
    // last twenty metres were paved and abandoned. Brick, not the SW band's
    // concrete sheds, because the tell of which bank you are standing on has to
    // hold all the way to where the two districts meet.
    tower(sim, -60, 8, 12, 10, 0, 6, 'masonry', 'brick', C.brickShaded);
    BOX(-60, 6, 8, 12, 1, 10, 'concrete', 1, 0x5f574e);
    waterTower(sim, -56, 7, 12, 0x6f5238);
    for (const [x, z] of [[-62, 20], [-46, 10]]) crateStack(sim, x, z, 3);
    lampPost(sim, -62.5, 6);
  }

  // ══════════════════════════════════ SW — A STREET / CHANNEL CENTER
  // The map's deliberate low band: industrial sheds, a rail-served yard, and the
  // silted south end of the channel. It is quiet ON PURPOSE — the Seaport's
  // density is the contrast that makes this side read as the working edge — but
  // quiet is not empty, so it carries yards, containers and one volunteer green.
  {
    for (const [ox, oz, w, d, h, col] of [
      [-70, 28, 10, 8, 5, 0x7a7268], [-70, 48, 9, 8, 4, 0x6f6a62],
      [-70, 66, 10, 9, 5, 0x7a7268], [-48, 30, 9, 8, 4, 0x6f6a62],
      [-48, 52, 10, 8, 5, 0x7a7268], [-48, 72, 9, 8, 4, 0x746e66],
    ]) {
      pierShed(sim, { ox, oz, w, d, h, wall: col, ribColor: 0x5f5a52, roof: 0x55504a, axis: 'x', monitor: false });
    }
    // ONE stack row, not two. A second row at x -29 runs a 6 m container out to
    // x -23 and lands in both the yard fence and the volunteer green's canopy —
    // the yard reads from the rhythm of the stacks, not from their count.
    let n = 0;
    for (let z = 30; z < 60; z += 8) {
      for (const x of [-36]) {
        shippingContainer(sim, x, 0, z, 6, [C.containerRed, C.containerBlue, C.containerGreen][n % 3]);
        if (n % 3 === 0) shippingContainer(sim, x, 3, z, 6, [C.containerBlue, C.containerGreen, C.containerRed][n % 3]);
        n++;
      }
    }
    for (const [x, z] of [[-40, 26], [-40, 64], [-40, 82], [-59, 24], [-59, 84]]) lightMast(sim, x, z, 6);
    // The yard's back fence runs ALONG the yard, not down the map. A north-south
    // line here would cross the spawn lot's own fence, its barrier runs and its
    // market stalls; the spawn lot already owns x -32 and x -30.
    fenceRun(sim, { x: -36, z: 59, len: 16, axis: 'x', h: 1.5, color: 0x6a7078, postEvery: 3 });
    treeGrove(sim, { x: -31, z: 61, w: 10, d: 10, step: 4 });
    for (const [x, z] of [[-30, 74], [-24, 74]]) bench(sim, x, z);
    drinkingFountain(sim, -27, 76);
    // The Bypass Road verge, west of where the carriageway starts at x 18. It
    // was a fifty-metre band of empty gravel — the one stretch the dead-ground
    // report could see, and it read as the map simply stopping. Containers and a
    // wire line are the honest fill: this is the truck route's back fence, not a
    // street. Everything here stays west of x 14 so the Bypass Road's own plaza
    // and asphalt are untouched.
    for (const [x, col] of [[-32, C.containerRed], [-20, C.containerBlue], [-6, C.containerGreen]]) {
      shippingContainer(sim, x, 0, 84, 6, col);
    }
    shippingContainer(sim, -20, 3, 84, 6, C.containerRed);
    for (const [x, z] of [[-26, 88], [4, 88]]) crateStack(sim, x, z, 3);
    for (const [x, z] of [[-34, 88], [8, 84]]) lightMast(sim, x, z, 6);
    fenceRun(sim, { x: -34, z: 90, len: 46, axis: 'x', h: 1.5, color: 0x6a7078, postEvery: 3 });
  }

  // ══════════════════════════════════ NW — THE MOAKLEY COURTHOUSE
  // A red-brick horseshoe wrapping a huge CONCAVE curved glass conoid facing the
  // harbour, with a domed lantern centred on the roof above it. It stands exactly
  // on the corner where the two waters meet, which is the map's strongest single
  // piece of geography — that corner is real and it is not softened here.
  {
    megaShell(sim, -74, 0, -84, 3, 6, 9, 'brick', C.moakleyBrick, { roofMat: 'concrete', roofColor: 0x6a5f56 });
    megaShell(sim, -62, 0, -84, 3, 6, 9, 'brick', C.moakleyBrick, { roofMat: 'concrete', roofColor: 0x6a5f56 });
    // The centre was hand-rolled as bare floor plates on the first pass and
    // dropped its middle; `tower` carries the mod-based interior columns that a
    // 6 x 14 plate needs, and is a builder rather than a loop for that reason.
    tower(sim, -68, -80, 6, 14, 0, 12, 'masonry', 'concrete', 0x8a7f72);
    BOX(-68, 12, -80, 6, 1, 14, 'concrete', 1, 0x6a5f56);
    conoidWall(sim, { ox: -68, oz: -84, w: 6, h: 12, bows: [0, 2, 0], group: 2, post: 0x8a8378, glass: 0x5f7a86 });
    // the domed lantern on the roof, centred over the conoid
    BOX(-67, 13, -76, 4, 2, 4, 'concrete', 1, 0x8a8378);
    BOX(-66.5, 15, -75.5, 6, 1, 6, 'panel', 0.5, C.plantGrey);
    BOX(-66, 15.5, -75, 4, 1, 4, 'panel', 0.5, 0x8a9098);
    BOX(-65.5, 16, -74.5, 2, 2, 2, 'steel', 0.5, 0xb0b6bc);
    // z -85, not -85.5: the harbour-mouth basin's rim owns z -86, and the rail
    // has to sit a clear half metre inboard of it or the two want the same cells.
    balustrade(sim, { x: -75, z: -85, len: 18, axis: 'x', h: 0.75, color: 0xb0a184 });
    for (const [x, z] of [[-70, -64], [-48, -64], [-62, -64]]) lampPost(sim, x, z);
  }

  // ══════════════════════════════════ N — FAN PIER + THE MARINA
  {
    // Fan Pier's towers, the district's first: One Marina Park Drive, the two
    // Vertex slabs reading as one campus, VIA Seaport, and the two curved-balcony
    // residential blocks at Liberty Wharf.
    setbackTower(sim, { ox: -52, oz: -82, w: 8, d: 10, tiers: [{ h: 23 }], kind: 'curtain', wallMat: 'panel', wall: 0xa9a79e, base: 0x8f8b80, baseH: 2, roof: 0x5f5a52 });
    setbackTower(sim, { ox: -32, oz: -84, w: 10, d: 10, tiers: [{ h: 21 }], kind: 'curtain', wallMat: 'panel', wall: 0x6d8894, roof: 0x4f5a60 });
    setbackTower(sim, { ox: -20, oz: -86, w: 11, d: 8, tiers: [{ h: 16 }], kind: 'curtain', wallMat: 'panel', wall: 0x6d8894, roof: 0x4f5a60 });
    // The glazed Vertex link. Its skin is `panel` in a glass tint, not `glass`:
    // eight courses of real glass carry nothing (vertBond .40 < BOND_CARRY), so
    // the concrete cap above would float. Same read, load path intact.
    BOX(-22, 0, -80, 2, 8, 4, 'panel', 1, 0x557a86);
    BOX(-22, 8, -80, 2, 1, 4, 'concrete', 1, 0x4f5a60);
    setbackTower(sim, { ox: -46, oz: -64, w: 10, d: 10, tiers: [{ h: 19 }], kind: 'curtain', wallMat: 'panel', wall: 0xa09488, roof: 0x5f5a52 });
    setbackTower(sim, { ox: -32, oz: -66, w: 12, d: 8, tiers: [{ h: 17 }], kind: 'curtain', wallMat: 'panel', wall: 0x7d949c, roof: 0x4f5a60 });
    // Twenty Two Liberty / 50 Liberty — the balcony bands ARE the read
    for (const [ox, oz, w, d, h] of [[-8, -94, 10, 5, 13], [-8, -86, 8, 6, 13]]) {
      tower(sim, ox, oz, w, d, 0, h, 'curtain', 'panel', 0xc0bcb2);
      BOX(ox, h, oz, w, 1, d, 'concrete', 1, 0x5f5a52);
      for (let y = 3; y < h; y += 3) {
        for (let i = 0; i < w * 2; i++) B(ox + i * 0.5, y, oz - 0.5, 'panel', 0.5, 0x5d6d76);
      }
    }
    // Fan Pier Park + the HarborWalk
    treeGrove(sim, { x: -53, z: -99, w: 10, d: 10, step: 4 });
    for (const [x, z] of [[-50, -87], [-45, -87]]) bench(sim, x, z);
    for (let x = -53; x < -43; x += 3) bollard(sim, x, -89.5, 0x4a5058);
    for (const [x, z] of [[-52, -90], [-44, -91]]) lampPost(sim, x, z);
    for (const [x, z] of [[-48, -85], [-28, -85]]) signPost(sim, x, z, 0x2a5f9a, 2, 'x');
    // the marina: yachts on the docks, and a water taxi standing off the mouth
    for (const [x, z] of [[-38, -102], [-35, -99], [-38, -96], [-35, -93], [-32, -101], [-29, -97], [-32, -93]]) {
      sailBoat(sim, x, z, 0xf2ede2, 0x7a3a2e);
    }
    harborFerry(sim, { x: -70, z: -95, len: 7, axis: 'x', hull: C.bostonYellow });
    // Our Lady of Good Voyage — pale limestone walls and a verdigris copper spire
    pavilion(sim, {
      x: -58, z: -66, w: 5, d: 4, h: 5, wallMat: 'concrete', wall: 0xcfc7b6,
      plate: 0xb8b0a0, roofMat: 'panel', roof: 0x8a8378, roofRise: 1,
    });
    B25(-56.375, 7, -64.375, 2, 12, 2, 'steel', C.copperVerdigris);
    B25(-56.5, 10, -64.5, 4, 1, 4, 'panel', C.copperVerdigris);
  }

  // ══════════════════════════════════ N — PIER 4 AND THE ICA
  {
    // THE ICA — the most distinctive silhouette on the map after the BCEC. Its
    // top gallery floor cantilevers north over the HarborWalk, wrapped on three
    // sides in vertical channel glass, with a warm wood soffit under it and a
    // timber grandstand stepping down to the deck. See cantileverBox for why the
    // real 24.4 m overhang is built at 3 m. It sits WEST of Pier Four Boulevard
    // because the basin rim north of it owns z -96, and a gallery standing in
    // the harbour is worse than a gallery eight metres off its survey point.
    // y 0..4 only: cantileverBox lays its own transfer slab at y 5, and two
    // blocks written into the same fine cell make a ghost of one of them.
    tower(sim, -22, -92, 8, 5, 0, 5, 'curtain', 'panel', 0x8fa8ae);
    cantileverBox(sim, {
      ox: -22, oz: -92, w: 8, d: 6, over: 3, y0: 6, h: 4,
      wall: 0x8fa8ae, rib: 0xdcdcd6, frame: 0x242a30, soffit: C.woodSoffit, ribSide: 'w',
    });
    BOX(-17, 11, -91, 2, 2, 2, 'panel', 1, 0x2f3440);        // rooftop plant box, offset east
    // On the gallery's WEST parapet, read from the HarborWalk (see the MENINO
    // note for the two orientations `signText` can render legibly). The landward
    // parapet at z -86 is the face the real building carries its name on, and it
    // is also the face an axis-'x' run would be legible from — but the Fan Pier
    // office block stands hard against z -86 for twelve metres and twenty in the
    // air, so those glyphs faced a wall two hundred millimetres away. Measured,
    // not eyeballed: a ray from the reading side hit eight solid cells before it
    // reached the sign.
    signText(sim, 'ICA', -22, 11, -89.5, {
      axis: 'z', px: 0.25, scale: 1, color: 0xf2f2f2, rail: 0x242a30, dir: 1,
    });
    // The founders' grandstand — timber steps on the HARBOUR side of the gallery,
    // under the cantilever, stepping up toward the building. It cannot go south:
    // that band belongs to Vertex A (x -32..-22) and Vertex B (x -20..-9), and
    // there is no 6 m of free deck between them.
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < 12; i++) {
        for (let y = 0; y <= s; y++) B(-22 + i * 0.5, y * 0.5, -94 + s * 0.5, 'wood', 0.5, 0xa07f52);
      }
    }
    // 100 Pier 4 stands a metre south of the basin rim that owns z -86.
    setbackTower(sim, { ox: 22, oz: -85, w: 9, d: 8, tiers: [{ h: 19 }], kind: 'curtain', wallMat: 'panel', wall: 0xa09488, roof: 0x5f5a52 });
    // HarborWalk furniture — the Seaport is heavily furnished and bollards are
    // its most-repeated single object
    for (const x of [-12, -10, 4, 12, 14]) bollard(sim, x, -94.5, 0x4a5058);
    for (const [x, z] of [[-11, -91], [4, -91]]) bench(sim, x, z);
    bikeRack(sim, 11, -90, 4, 'x');
    for (const [x, z] of [[-18, -76], [-4, -76], [12, -76]]) tree(sim, x, z);
    for (const [x, z] of [[-14, -94], [4, -94]]) lampPost(sim, x, z);
  }

  // ══════════════════════════════════ NE — COMMONWEALTH PIER + FISH PIER
  {
    // Commonwealth Pier / Seaport World Trade Center. Beaux-arts granite
    // headhouse at the landward end, then a 500 m two-storey shed — 34 m at 1:6,
    // the second-biggest object on the map. It is a live construction site in
    // 2026, so it gets the historic fabric plus a tower crane on the deck.
    pierShed(sim, {
      ox: 42, oz: -100, w: 18, d: 28, h: 8, wall: C.pierShedWhite,
      ribColor: 0xb8b5ad, roof: 0x8a8f94, axis: 'z', ribEvery: 3,
    });
    tower(sim, 42, -66, 18, 6, 0, 7, 'masonry', 'concrete', C.pierStone);
    BOX(42, 7, -66, 18, 1, 6, 'concrete', 1, C.graniteTrim);
    for (let i = 0; i < 18 * 4; i++) {                       // the beaux-arts eaves band
      B25(42 + i * 0.25, 8, -66, 1, 1, 1, 'concrete', C.graniteTrim);
      B25(42 + i * 0.25, 8.25, -66, 1, 1, 1, 'concrete', C.pierStone);
    }
    // SEAPORT goes on the SHED's west roof edge, not on the head house's landward
    // parapet. The head house is only 6 m deep in z and the word is 6.75 m long,
    // so it cannot run along that face at all; laid across the face instead it
    // pointed at the Seaport Boulevard block, which is solid from z -60 to -52.
    // Here it runs along 28 m of pier and reads across the water, which is the
    // elevation Commonwealth Pier actually signs. y 9 is the roof plate's top
    // course — measured, because the shed's h is 8 and the plate sits above it.
    signText(sim, 'SEAPORT', 42, 9, -92, {
      axis: 'z', px: 0.25, scale: 1, color: 0xe8e4da, rail: 0x8a8378, dir: 1,
    });
    // tower crane on the pier — the revitalisation is unfinished in August 2026
    BOX(52, 0, -104, 2, 1, 2, 'concrete', 1, 0x8e8b83);
    for (let y = 1; y < 14; y++) B(52, y, -104, 'steel', 1, C.bostonYellow);
    // Jib x 49..55 — three metres either side of the mast and not a centimetre
    // more, because steel's maxSpan is 3 and a longer jib is six floating blocks.
    for (let x = 49; x <= 55; x++) B(x, 14, -104, 'steel', 1, C.bostonYellow);
    B(49, 15, -104, 'concrete', 1, 0x6a6560);               // counterweight, ON the jib
    harborFerry(sim, { x: 66, z: -100, len: 8, axis: 'z', hull: C.bostonYellow });
    // z -59 clears the headhouse (which ends at -60); z -66.5 is the 1 m slot
    // between Northern Avenue's kerb and the headhouse's north wall.
    for (const [x, z] of [[44, -59], [60.5, -59], [44, -66.5], [58, -66.5]]) lampPost(sim, x, z);
    for (const x of [42, 46, 57]) bollard(sim, x, -103.5, 0x4a5058);   // x 52 is the crane base
    marketStall(sim, 65, -56, C.bostonRed); marketStall(sim, 69, -56, 0x2a5f9a);
    foodTruck(sim, { x: 54, z: -59, axis: 'x' });

    // BOSTON FISH PIER — 1914, the oldest continuously working fish pier in the
    // US: two parallel rows of brick sheds with a limestone cornice and an
    // oxidised copper roof band, the Exchange Conference Center at the head, and
    // the dragger fleet moored on the outer faces. This is the map's working
    // heart and the trawlers are the reason the pier is worth carrying at all.
    for (const ox of [76, 87]) {
      pierShed(sim, {
        ox, oz: -100, w: 4, d: 40, h: 6, wall: C.fishPierBrick,
        ribColor: 0x7a4c3a, roof: 0x6a6a62, cornice: C.fishPierCornice, axis: 'z', monitor: false,
      });
      // y 7.5, on TOP of the shed's own cornice band (which owns 7..7.5 at the
      // plate's two edge columns) rather than through it.
      for (let i = 0; i < 16; i++) B25(ox + i * 0.25, 7.5, -100, 1, 1, 1, 'panel', C.copperVerdigris);
    }
    tower(sim, 76, -58, 15, 5, 0, 7, 'masonry', 'brick', C.fishPierBrick);
    BOX(76, 7, -58, 15, 1, 5, 'concrete', 1, C.fishPierCornice);
    // The one sign on this map that is BOTH legible and on the elevation the
    // real building signs: the Exchange Conference Center's landward gable, read
    // from the Northern Avenue apron. `axis:'x', dir:-1` per the handedness rule
    // (see the MENINO note), and z -53 is open ground for thirty metres north.
    signText(sim, 'FISH PIER', 77, 8, -53.25, { px: 0.25, scale: 1, color: 0x2a8fc0, rail: 0xe8e4da, dir: -1 });
    // Moored between z -103 and -86: the between-piers basin's south rim owns
    // z -86, so a 9 m boat starting at -94 would run its bow through the rim.
    for (const tz of [-103, -94]) {
      fishingTrawler(sim, { x: 93, z: tz, len: 8, axis: 'z', hull: C.hullRust });
      fishingTrawler(sim, { x: 71, z: tz, len: 8, axis: 'z', hull: C.hullGrey });
    }
    // timber dock edge with tyre fenders, on both outer faces
    for (let z = -103; z < -62; z += 3) {
      for (const fx of [74.5, 92]) { B(fx, 0, z, 'wood', 0.5, C.dockTimberDark); B(fx, 0.5, z, 'rubber', 0.5); }
    }
    for (let z = -98; z < -62; z += 6) { bollard(sim, 80.5, z, 0xe8e4da); bollard(sim, 85.5, z, 0xe8e4da); }
    // The two landward masts stand in the 2 m slot between the sheds' south end
    // (z -60) and the Exchange (z -58), not inside the sheds themselves.
    // The two landward masts stand in the slot between the sheds' south end
    // (z -60) and the Exchange (z -58), and OUTSIDE Fish Pier Road (x 82..85).
    for (const [x, z] of [[78, -103], [90, -103], [81, -59], [86, -59]]) lightMast(sim, x, z, 6);
  }

  // ══════════════════════════════════ E — THE TELESCOPED WORKING PORT
  // Harpoon, the Innovation & Design Building, Black Falcon, one dry dock and its
  // gantry cranes — pulled ~700 real metres west (see the header). Cheap per
  // block and it is what makes the east edge read as a port rather than a border.
  {
    // `gantryCrane` is 11 m long in x once its boom overhang is counted and 6 m
    // deep in z — it is a portal that STRADDLES its rail, so it can never share
    // ground with the dock it serves. One crane, on the apron immediately south
    // of the dock, rather than two ghosting through the dock floor.
    dryDock(sim, { x: 78, z: -50, w: 12, d: 8, steps: 3 });
    gantryCrane(sim, 79, -40, { h: 14, color: C.craneBlue });
    pierShed(sim, { ox: 76, oz: -32, w: 12, d: 7, h: 7, wall: 0x8a5a45, ribColor: 0x6f4636, roof: 0x55504a, axis: 'x', monitor: false });
    // West roof edge, along the brewery's 7 m depth, read from the Drydock Avenue
    // apron. The landward face at z -25 is the legible face for an axis-'x' run,
    // but the Innovation & Design Building starts three metres north of it and
    // stands two metres taller — a word you can only read by standing inside
    // another building is not a word on the map.
    signText(sim, 'HARPOON', 76, 8, -31.75, {
      axis: 'z', px: 0.25, scale: 1, color: C.bostonYellow, rail: 0x4a4038, dir: 1,
    });
    for (const tx of [89, 93]) {                              // brewhouse tank silos
      for (let y = 0; y < 6; y++) {
        for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {
          if (i === 1 && k === 1 && y < 5) continue;
          B(tx + i, y, -30 + k, 'panel', 1, 0xd8d2c2);
        }
      }
    }
    // The Innovation & Design Building — a long flat-roofed brick-and-precast
    // industrial block, split by Drydock Avenue
    pierShed(sim, { ox: 76, oz: -22, w: 18, d: 7, h: 9, wall: 0x8a6a56, ribColor: 0xb0a898, roof: 0x5f5a52, axis: 'x' });
    pierShed(sim, { ox: 76, oz: -6, w: 18, d: 8, h: 8, wall: 0x8a6a56, ribColor: 0xb0a898, roof: 0x5f5a52, axis: 'x' });
    // Black Falcon Cruise Terminal — an 85 x 5 m white bar at the map's edge.
    // Pure silhouette, and it says "cruise port" for almost nothing.
    pierShed(sim, { ox: 88, oz: 12, w: 6, d: 40, h: 5, wall: 0xe2e0d8, ribColor: 0xc4c2ba, roof: 0x8a8f94, axis: 'z', monitor: false });
    // dir 1, not -1: see the MENINO note. An axis-'z' run reads the right way
    // round only from the WEST, so the rail has to sit east of the glyphs.
    signText(sim, 'BLACK FALCON', 88.25, 6, 14, { axis: 'z', px: 0.25, scale: 1, color: 0x2a4f6a, rail: 0xe2e0d8, dir: 1 });
    let n = 0;
    for (let z = 26; z < 40; z += 8) {
      for (const x of [76, 82]) {
        shippingContainer(sim, x, 0, z, 6, [C.containerRed, C.containerBlue, C.containerGreen][n % 3]);
        if (n % 2 === 0) shippingContainer(sim, x, 3, z, 6, [C.containerGreen, C.containerRed][n % 2]);
        n++;
      }
    }
    gantryCrane(sim, 84, 62, { h: 16, color: C.craneBlue });
    for (const [x, z] of [[94, -46], [95, -22], [86, 22], [94, 54]]) lightMast(sim, x, z, 7);
    fenceRun(sim, { x: 75, z: 22, len: 34, axis: 'z', h: 1.5, color: 0x6a7078, postEvery: 3 });
  }

  // ══════════════════════════════════ C — SEAPORT BOULEVARD + THE COMMON
  {
    // Envoy Hotel and the Barking Crab, right on the channel at Sleeper Street.
    // The Barking Crab is literally a red-and-yellow striped tent over a shed —
    // one of the few genuinely beloved objects on this whole waterfront.
    tower(sim, -74, -60, 8, 4, 0, 4, 'masonry', 'brick', 0x5c4c46);
    BOX(-74, 4, -60, 8, 1, 4, 'concrete', 1, 0x4a423c);
    // The tent is four stalls on the quay strip between the hotel and the
    // Children's Museum — the only 6 m of ground here that is neither road,
    // channel rim nor warehouse.
    // ONE row. `marketStall` is 3 m across, the quay strip between the rim and
    // the Children's Museum is 6, and a second row at x -72 puts its far end
    // inside the museum's brick.
    for (const z of [-56, -53]) marketStall(sim, -75, z, C.bostonRed);
    marketStall(sim, -75, -50, C.bostonYellow);
    for (const [x, z] of [[-71, -55], [-71, -52]]) cafeTable(sim, x, z);
    setbackTower(sim, { ox: -58, oz: -60, w: 8, d: 4, tiers: [{ h: 10 }], kind: 'curtain', wallMat: 'panel', wall: 0x8f8f8f, roof: 0x5f5a52 });
    // Watermark Seaport — residential over ground-floor retail, both sides of
    // Congress Street
    setbackTower(sim, { ox: -32, oz: -40, w: 12, d: 8, tiers: [{ h: 18 }], kind: 'masonry', wallMat: 'brick', wall: 0x8a7b6d, roof: 0x5f5a52, base: 0xb0a898, baseH: 2 });
    setbackTower(sim, { ox: -32, oz: -24, w: 9, d: 8, tiers: [{ h: 15 }], kind: 'masonry', wallMat: 'brick', wall: 0x8a7b6d, roof: 0x5f5a52 });
    // 121 SEAPORT — the only true ellipse on the map, and worth the extra bricks
    {
      const cx = -11, cz = -59, rx = 5, rz = 4.5, h = 21;
      for (let y = 0; y < h; y++) {
        const slab = y % 4 === 0;
        for (let ix = -6; ix <= 6; ix++) {
          for (let iz = -5; iz <= 5; iz++) {
            const r = (ix / rx) ** 2 + (iz / rz) ** 2;
            if (r > 1) continue;
            if (slab) { B(cx + ix, y, cz + iz, 'concrete', 1, 0x6a6560); continue; }
            if (r <= 0.55) { if (ix === 0 && iz === 0) B(cx, y, cz, 'steel', 1); continue; }
            const post = (ix + iz) % 2 === 0;
            B(cx + ix, y, cz + iz, post ? 'steel' : 'glass', 1, post ? 0x8a9098 : 0x7f98a2);
          }
        }
      }
      for (let ix = -6; ix <= 6; ix++) for (let iz = -5; iz <= 5; iz++) {
        if ((ix / rx) ** 2 + (iz / rz) ** 2 > 1) continue;
        B(cx + ix, h, cz + iz, 'concrete', 1, 0x5f5a52);
      }
    }
    // St. Regis Residences — the sail-inspired curved west face. Each course of
    // the sail is a CONTIGUOUS run out from the tower wall, not a single skin
    // pushed to the bow distance: a skin standing off in space has nothing
    // between it and the building it belongs to, and 228 blocks proved it.
    {
      const ox = 12, oz = -64, w = 7, d = 6, h = 22;
      tower(sim, ox, oz, w, d, 0, h, 'curtain', 'panel', C.glassSail);
      BOX(ox, h, oz, w, 1, d, 'concrete', 1, 0x5f5a52);
      for (let y = 1; y < h; y++) {
        const bow = Math.round(2 * Math.sin(Math.PI * y / h));
        for (let b = 0; b <= bow; b++) {
          for (let k = 0; k < d * 2; k++) B(ox - 0.5 - b * 0.5, y, oz + k * 0.5, 'panel', 0.5, C.glassSail);
        }
      }
    }
    setbackTower(sim, { ox: 22, oz: -60, w: 12, d: 8, tiers: [{ h: 18 }], kind: 'curtain', wallMat: 'panel', wall: 0x8e9aa0, roof: 0x4f5a60 });
    // Seaport Common + the head of Harbor Way: a stepped pedestrian spine, not a
    // road. It is the one place in the new district that reads as a public room.
    // The park rects run z -46..-34 but Seaport Blvd's asphalt runs to z -43, so
    // everything planted here starts at z -42: a tree standing in a traffic lane
    // is a validator failure, not a landscaping choice.
    treeGrove(sim, { x: -5, z: -42, w: 10, d: 8, step: 4 });
    for (const [x, z] of [[-4, -38], [2, -38], [-4, -35], [2, -35]]) bench(sim, x, z);
    for (const [x, z] of [[-6, -40], [5, -40], [-6, -35], [5, -35]]) lampPost(sim, x, z);
    for (const [x, z] of [[-2, -41.5], [1, -41.5]]) cafeTable(sim, x, z);
    // Everything below lives in the 5 m plaza band between Seaport Common's turf
    // (which ends at z -34) and NEMA's brick (which starts at x 2). Two newsBoxes
    // a quarter of a metre apart is one newsBox and one ghost.
    hotDogCart(sim, -6, -32); newsBox(sim, -2.5, -32, 0x2a5f9a); newsBox(sim, 0, -32);
    for (const [x, z] of [[-8, -30], [-2, -30]]) planter(sim, x, z, 2, 1);
    treeGrove(sim, { x: 11, z: -42, w: 8, d: 8, step: 4 });
    marketStall(sim, -6, -30, 0x2e6f4d); crateStack(sim, 0.5, -31, 3);
    bikeRack(sim, -12, -31, 4, 'z');
    // Seaport Blvd's separated cycle track — 1.4 km of it in the real data,
    // which is a `bikePaths` rect and never a road lane
    bikePaths.push(
      { x: -75, z: -50, w: 111, d: 1.6, color: 0x2a8068 },
      { x: -75, z: -42.2, w: 111, d: 1.6, color: 0x2a8068 },
      { x: -56, z: -74, w: 128, d: 1.4, color: 0x2a8068 },
    );
  }

  // ══════════════════════════════════ C — CONGRESS STREET
  {
    // District Hall — a small angular civic pavilion, dark wood-clad boxes with a
    // folded roof. The kit's `pavilion` is exactly this massing.
    pavilion(sim, {
      x: -14, z: -40, w: 7, d: 5, h: 4, wallMat: 'panel', wall: 0x4e4038,
      plate: 0x3a322c, roofMat: 'panel', roof: 0x5a4e42, roofRise: 2,
    });
    // NEMA Boston — a long thin residential slab along Congress St
    setbackTower(sim, { ox: 2, oz: -34, w: 20, d: 5, tiers: [{ h: 20 }], kind: 'masonry', wallMat: 'brick', wall: 0x9a8d80, roof: 0x5f5a52, base: 0xb0a898, baseH: 2 });
    // Foundation Medicine + Seaport West, the Summer St lab and office blocks
    setbackTower(sim, { ox: 30, oz: -42, w: 10, d: 12, tiers: [{ h: 16 }], kind: 'curtain', wallMat: 'panel', wall: 0x7d949c, roof: 0x4f5a60 });
    setbackTower(sim, { ox: 46, oz: -44, w: 10, d: 12, tiers: [{ h: 18 }], kind: 'curtain', wallMat: 'panel', wall: 0x8e9aa0, roof: 0x4f5a60 });
    // Seaport Hotel — the older, 1998 one: pale beige precast with punched
    // windows, NOT curtain wall. That distinction is most of why it reads as the
    // odd one out on a street of glass.
    // x 63..70, one metre short of D Street's kerb: the hotel is the last mass
    // before the port and it cannot borrow the asphalt to get its full width.
    setbackTower(sim, { ox: 63, oz: -52, w: 7, d: 14, tiers: [{ h: 16 }], kind: 'masonry', wallMat: 'concrete', wall: 0xc2b7a4, roof: 0x8a8378 });
    setbackTower(sim, { ox: 63, oz: -36, w: 7, d: 8, tiers: [{ h: 21 }], kind: 'curtain', wallMat: 'panel', wall: 0xb0aca2, roof: 0x5f5a52 });
    setbackTower(sim, { ox: 46, oz: -60, w: 8, d: 9, tiers: [{ h: 17 }], kind: 'curtain', wallMat: 'panel', wall: 0xb0aca2, roof: 0x5f5a52 });
    // the Silver Line: two headhouses and the surface portal where the buses
    // come up. Nothing in the kit does a portal, so it is a ramp cut of stepped
    // retaining walls — the interesting half of the transitway.
    subwayEntrance(sim, -16, -30.5);
    subwayEntrance(sim, 56, -30.5);
    {
      const px = 60, pz = -24;
      for (let i = 0; i < 10; i++) {
        const h = Math.max(0, 3 - Math.floor(i / 2));
        for (const k of [0, 5]) for (let y = 0; y < h + 1; y++) B(px + i, y, pz + k, 'concrete', 1, 0x6a6560);
      }
      // No deck slab between the retaining walls: the portal is a CUT, the bus
      // stands on the plaza inside it, and a slab written at y 0 under a bus
      // written at y 0 is one fine cell fighting for two blocks.
      bus(sim, px + 2, pz + 1.5, C.silverLineBus, 'x');
    }
    // Eastport Park's sculpture lawn — west of WTC Avenue rather than east of it.
    // Its survey block is now the Seaport Hotel's footprint; the park keeps its
    // real size and its relationship to Congress St, not its exact corner.
    treeGrove(sim, { x: 41, z: -53, w: 4, d: 14, step: 5 });
    statue(sim, { x: 42, z: -44, h: 3.5, plinth: 1.5, w: 1, d: 1, bronze: 0x4a5f46 });
    for (const [x, z] of [[41, -41], [44, -41]]) bench(sim, x, z);
    // Congress Street furniture. The north kerb line is z -30.5 EXCEPT where a
    // mass owns it — NEMA runs z -34..-29 and Foundation Medicine z -42..-30, so
    // anything in front of those moves to the 1 m sidewalk band at z -28.75.
    for (const [x, z] of [[-34, -30.5], [-24, -30.5], [-8, -30.5], [16, -28.75], [44, -30.5], [74.5, -30.5]]) lampPost(sim, x, z);
    for (const [x, z] of [[-34.5, -22], [0, -22], [32, -22], [52, -22]]) lampPost(sim, x, z);
    for (const [x, z] of [[-36, -30.5], [12, -28.75], [48, -30.5]]) trashBin(sim, x, z);
    hydrant(sim, -20, -30.5); hydrant(sim, 36, -22.5); mailbox(sim, -4, -30.5);
    trafficLight(sim, -45.5, -22.5); trafficLight(sim, 22.5, -22.5); trafficLight(sim, 56.5, -22.5);
    for (const [x, z] of [[-36, -22], [-18, -22], [8, -22], [44, -22], [58, -22]]) tree(sim, x, z);
    newsstand(sim, -28, -30.5); hotDogCart(sim, 24, -30.5);
    for (const [x, z] of [[-42, -21], [50, -21]]) sandwichBoard(sim, x, z);
  }

  // ══════════════════════════════════ C — SUMMER STREET AND THE VIADUCT
  // The band most scenes would get wrong. Summer Street runs on a viaduct through
  // the Seaport, ~7 m above the old rail and haul-road grade, and a player who
  // drops off the deck edge finds a whole second ground level in the first thirty
  // seconds. The bents stand OUTSIDE the Haul Road's asphalt; only the chord and
  // the deck are over it, and both are declared in BOSTON_ROAD_SPANS.
  roadViaduct(sim, {
    u0: -6, u1: 22, vN: -16, vS: -10, legH: 7, bay: 4, axis: 'x',
    steel: 0x5a6472, deckColor: 0x7f858c, rail: 0x8d3f36,
  });
  // Track 61 — a disused freight spur in a weed-and-ballast corridor, running
  // west from the BCEC past the Fort Point end. Rusted rail on sleepers.
  for (let x = -32; x < 26; x += 2) {
    for (const rz of [5.5, 7.5]) { B(x, 0, rz, 'steel', 0.5, 0x6b4a34); B(x + 0.5, 0, rz, 'steel', 0.5, 0x6b4a34); }
    B(x, 0, 6.5, 'wood', 0.5, 0x4a3f32);
  }

  // ══════════════════════════════════ SPAWN — THE BCEC WEST SURFACE LOT
  // The hole starts at (0, 16) and the house rule is that the fix for a thin
  // spawn is CONTENT, not a spawn move. A swept-clean plaza would be the worst
  // possible ground here: a continuous 1 m paved field is effectively inedible at
  // SIZE 1, because every block that loses its anchor is still carried by a
  // neighbour 1 m away, well inside concrete's 3 m span. Loose 0.25/0.5 m props
  // are the opposite — isolated, so losing the anchor drops them outright. So the
  // lot is FURNISHED: thirty-four parked cars (in BOSTON_VEHICLES), food trucks,
  // jersey barriers, crates and light masts, with the 4 m disc around (0, 16)
  // left clear so the hole is not chewing before the player has moved.
  {
    for (let x = -22; x < 22; x += 6) {                     // jersey barrier runs
      BOX(x, 0, 4, 2, 1, 1, 'concrete', 1, 0xb0aca2);
      BOX(x, 0, 28, 2, 1, 1, 'concrete', 1, 0xb0aca2);
    }
    for (const [x, z] of [[-24, 6], [-24, 26], [20, 6], [20, 26]]) lightMast(sim, x, z, 6);
    foodTruck(sim, { x: -20, z: 30, axis: 'x' });
    foodTruck(sim, { x: 8, z: 30, axis: 'x' });
    for (const [x, z] of [[-18, 33], [-12, 33], [5, 33], [12, 33]]) marketStall(sim, x, z, C.bostonRed);
    for (const [x, z] of [[-26, 16], [20, 16], [-26, 34], [20, 34]]) crateStack(sim, x, z, 3);
    for (const [x, z] of [[-9, 6], [9, 6], [-9, 26], [9, 26]]) trashBags(sim, x, z);
    for (let x = -24; x < 20; x += 3) bollard(sim, x, 36.5, C.bostonYellow);
    for (const [x, z] of [[-16, 38], [0, 38], [16, 38]]) trashBin(sim, x, z);
    // z 4.5, not 4: the along-x run below already owns the corner cell (-30, 4).
    // x -28.5, z 4.5: the along-x run owns the corner cell, Track 61's rails own
    // x -30..-29 and -28..-27, and the container yard's stacks reach x -30.
    fenceRun(sim, { x: -28.5, z: 4.5, len: 33.5, axis: 'z', h: 1.25, color: 0x6a7078, postEvery: 3 });
    fenceRun(sim, { x: -32, z: 4, len: 56, axis: 'x', h: 1.25, color: 0x6a7078, postEvery: 3 });
    scaffoldShed(sim, { x: -30, z: -6, len: 20, axis: 'x', w: 1.5, h: 2.5, fascia: 0x2f6b4a });
    signPost(sim, -24, 20, C.bostonYellow, 2, 'z');
    sandwichBoard(sim, 1, 33);
  }

  // ══════════════════════════════════ THE HERO — THE BCEC
  // Thomas M. Menino Convention & Exhibition Center (renamed from the Boston
  // Convention & Exhibition Center in July 2025; the signage says Menino and
  // everybody still says BCEC). 470 real metres — NOT the architect's own
  // "610 m", which neither the OSM polygon (458 m) nor the geo-referenced aerial
  // (470-485 m) can reproduce. At 1:6 that is 68 m of hall here.
  //
  // The roof is the building: a single double-curved barrel vault in aluminium
  // standing seam, over 10 acres of it, tapering to the prow at the north end and
  // squared off at the south, with the crown line dropping 2 m from prow to tail.
  // Three-storey meeting-room blocks run symmetrically along both flanks and the
  // east flank carries a continuous sawtooth of truck dock bays.
  barrelVaultHall(sim, {
    ox: 34, oz: 4, nx2: 9, nz2: 34, ny2: 3,
    crown: 15, crownDrop: 2, taper: 6,
    podium: C.bcecPodium, lit: C.bcecRoofLit, shade: C.bcecRoofShade,
    mullion: 0x8f959b, glass: C.glassLight,
    monitor: 0x7a8086, monitorEvery: 11, monitorLen: 3,
  });
  for (const [ox, oz, w, d] of [[28, 6, 6, 30], [28, 40, 6, 28], [52, 6, 6, 30], [52, 40, 6, 28]]) {
    tower(sim, ox, oz, w, d, 0, 6, 'masonry', 'concrete', C.bcecPodium);
    BOX(ox, 6, oz, w, 1, d, 'concrete', 1, 0xb0aca2);
  }
  // The south podium goes through pierShed rather than tower: `tower` puts two
  // interior column lines wherever the plan is 9 m or wider, which is right for
  // a 10 m office floor and hopeless for a 34 m one — the plate spans 11 m to
  // the first column and drops its outer third. pierShed's 3 m grid holds it.
  pierShed(sim, {
    ox: 26, oz: 72, w: 34, d: 14, h: 5, wall: C.bcecPodium,
    ribColor: 0xb0aca2, roof: 0xb0aca2, axis: 'x', ribEvery: 4, monitor: false,
  });
  // the truck-dock sawtooth on the east flank — 14 bays, real, visible in every
  // aerial, and a free source of small-scale interest along an otherwise blank
  // 68 m wall
  for (let i = 0; i < 14; i++) {
    const z = 8 + i * 4;
    BOX(58, 0, z, 2, 3, 2, 'concrete', 1, 0xa8a49a);
    BOX(58, 3, z, 2, 1, 2, 'panel', 1, 0x5f5a52);
  }
  // THE PROW. The north end is the thing everyone photographs and the thing that
  // must survive voxelization: an elliptical mass held clear of the ground on
  // splayed steel legs with a genuine soffit under it, a full-height glass
  // curtain-wall lobby behind, and a small glazed information bridge projecting
  // from the fascia. The drama is entirely in the void, so nothing but legs goes
  // under it — see lensCanopy for how the mod-5 column pattern is repaired
  // around the ellipse.
  lensCanopy(sim, {
    ox: 32, oz: -10, nx: 12, nz: 6, legTop: 10,
    soffit: C.bcecFascia, fascia: C.bcecFasciaLit, leg: C.steelLeg, roof: C.bcecRoofLit,
  });
  // the glass lobby behind the prow: two stacked levels of curtain wall against
  // the hall's north face
  for (let i = 0; i < 18; i++) {
    for (const cz of [2, 3]) {
      for (let y = 0; y < 10; y++) {
        const post = i % 3 === 0 || y % 4 === 0 || cz === 3;
        B(34 + i, y, cz, post ? 'steel' : 'glass', 1, post ? 0x8f959b : C.glassCurtain);
      }
      B(34 + i, 10, cz, 'concrete', 1, C.bcecFascia);
    }
  }
  // the information bridge — a small glazed box projecting one cell west off the
  // canopy fascia. One cell, not two: 'panel' spans 3 m but the fascia block it
  // hangs from is 2 m, so the first hop already costs 1.5 m of budget.
  BOX(31, 12, -6, 1, 2, 4, 'panel', 1, C.glassLight);
  BOX(31, 14, -6, 1, 1, 4, 'panel', 1, C.bcecFascia);
  // MENINO, on the west podium flank rather than the prow's north end wall.
  //
  // ── THE SIGN HANDEDNESS RULE. Every signText call on this map obeys it. ──
  //
  // `signText` lays its glyph run along +x (axis 'x') or +z (axis 'z') and puts
  // its backing rail on the side `dir` points at, so the viewer stands opposite
  // the rail. That leaves one free choice per axis, and only one value of it
  // renders the word rather than its mirror image:
  //
  //   axis 'x'  →  legible from +z only  →  dir must be -1 (rail south)
  //   axis 'z'  →  legible from -x only  →  dir must be +1 (rail east)
  //
  // Both lines are MEASURED, not reasoned out. The glyph table is 3x5, in which
  // M, N and W are the same blob and I, O, A and H are all symmetric, so a
  // screenshot cannot settle it — the only letters that can are C and E. So the
  // two planes were dumped straight out of the sim as ASCII in both reading
  // orders (scratchpad/boston-sign.mjs) and read off: the C in ICA opens right
  // and spells I-C-A only for a viewer at +z, the E in MENINO bars left and
  // spells M-E-N-I-N-O only for a viewer at -x. I had this backwards on the
  // first pass and a render confirmed the wrong answer, because the wall the
  // sign was buried in was the same colour either way.
  //
  // The practical consequence is that a sign cannot be read from the south or
  // the east at all, so every one of the six on this map sits on a north- or
  // west-facing wall — three of them are NOT on the elevation the real building
  // signs, and each of those three says so at its call site. The fix belongs in
  // the kit, not here: `signText` wants a `mirror` option that reverses both the
  // glyph order and each glyph's columns. Brooklyn's FERRY and NATHANS carry the
  // same defect today (both `axis:'x', dir:1`, both rendering mirrored).
  //
  // The original call here was `axis:'x', dir:-1` at z 2.75 — the legible
  // combination, aimed into the vault: rail south, glyphs facing north into a
  // hall that starts at z 4. Six metres of lettering nobody could ever see.
  // This is `axis:'z', dir:1` on the west podium wall at x 28, read from the
  // surface lot the player spawns in — which is where the real building carries
  // its name, and the first thing anyone reads on this map. Glyphs at
  // x 27.5..27.75 and the rail at 27.75..28.0, hard against the podium's own
  // face; a rail written AT x 28 would land in the wall block and one of the two
  // would become a ghost.
  signText(sim, 'MENINO', 27.5, 3.5, 20, {
    axis: 'z', px: 0.25, scale: 1, color: 0xe8e4da, rail: 0x5c6067, dir: 1,
  });
  // the plaza under the prow — the red paved entry strip, benches, bollard runs
  // The plaza runs z -14..0 but Summer Street's asphalt covers z -15..-10 and
  // the canopy's ellipse fills z -10..2, so the only walkable ground under the
  // prow is the two skirts either side of the legs. All the furniture goes
  // there, in two vertical runs, which is also where it is in the photographs.
  plaza.push({ x: 28, z: -14, w: 32, d: 14, color: 0x8a6a5e });
  // Every piece here is placed against its own drawn extent, not its nominal
  // coordinate: lampPost straddles x-0.125..x+0.25 and bench x-0.25..x+0.75, so
  // "x 29" on a kerb at x 29 is a quarter of a metre INSIDE B Street's asphalt.
  // Every piece here is placed against its own drawn extent, not its nominal
  // coordinate: lampPost straddles x-0.125..x+0.25 and bench x-0.25..x+0.75, so
  // "x 29" on a kerb at x 29 is a quarter of a metre INSIDE B Street's asphalt.
  // The east skirt is only x 56..58 wide — the prow's legs end at 56 and the
  // Omni's podium starts at 58 — so it is packed tighter than the west one.
  for (const [x, z] of [[29.5, -8], [57, -8]]) lampPost(sim, x, z);
  for (const [x, z] of [[29.5, -4], [29.5, -1], [57, -4], [57, -1]]) bench(sim, x, z);
  // West skirt only. The east skirt is 2 m wide between the canopy's splayed
  // leg feet and the Omni's podium, and a bollard run does not fit in it.
  for (let z = -9; z < 0; z += 2) bollard(sim, 30.5, z, 0x4a5058);
  bikeRack(sim, 29.25, -6, 3, 'z'); bikeRack(sim, 57, -6, 3, 'z');
  hotDogCart(sim, 30, -2); newsBox(sim, 57.25, -2, C.bostonRed);

  // ══════════════════════════════════ E — THE OMNI AND THE WESTIN
  // The Omni's twin guestroom towers stand on one warm-brick podium across
  // Summer Street from the prow; the Westin's six vertical fin stacks are the
  // crown you see standing proud behind the prow in every street photograph, and
  // they are the reason to build the Westin at all.
  {
    megaShell(sim, 58, 0, -8, 6, 3, 5, 'brick', 0x8d5a44, { roofMat: 'concrete', roofColor: 0x6a5f56 });
    for (const ox of [58, 64]) {
      tower(sim, ox, -6, 6, 6, 8, 21, 'curtain', 'panel', 0xc8c4bb);
      BOX(ox, 21, -6, 6, 1, 6, 'concrete', 1, 0x5f5a52);
      BOX(ox + 1, 22, -5, 4, 2, 4, 'panel', 1, 0x8a8f94);   // mech penthouse
    }
    tower(sim, 60, 20, 10, 10, 0, 17, 'masonry', 'concrete', C.precastGrey);
    BOX(60, 17, 20, 10, 1, 10, 'concrete', 1, 0x9b9890);
    for (let i = 0; i < 5; i++) BOX(60 + i * 2, 18, 23, 2, 5, 3, 'concrete', 1, 0x9b9890);
  }

  // ══════════════════════════════════ S — THE LAWN ON D AND D STREET
  {
    // The Lawn on D: Massport's event lawn, a hard plaza edge, and *Swing Time* —
    // twenty illuminated ring swings, which is THE photograph of this park.
    ringSwing(sim, { x: 61, z: 42, n: 3, pitch: 2.5 });
    ringSwing(sim, { x: 61, z: 48, n: 3, pitch: 2.5 });
    ringSwing(sim, { x: 61, z: 54, n: 3, pitch: 2.5 });
    amphitheater(sim, { x: 60, z: 64, w: 8, d: 8, rows: 5, stageW: 1.5, stageH: 3, towerH: 6 });
    treeGrove(sim, { x: 61, z: 58, w: 8, d: 4, step: 4 });
    for (const [x, z] of [[62, 39], [68, 39], [62, 60], [68, 60]]) lampPost(sim, x, z);
    for (const [x, z] of [[64, 40], [64, 60]]) bench(sim, x, z);
    foodTruck(sim, { x: 62, z: 76, axis: 'x' });
    for (const [x, z] of [[69, 76], [69, 78]]) cafeTable(sim, x, z);
    playgroundSet(sim, { x: 62, z: 72 });
    // D Street's hotels: Aloft and Element share a twin-brand block, Flats on D
    // is the red-brick-and-panel residential foil to them.
    setbackTower(sim, { ox: 76, oz: 44, w: 12, d: 8, tiers: [{ h: 13 }], kind: 'curtain', wallMat: 'panel', wall: 0xb5b0a6, roof: 0x5f5a52 });
    setbackTower(sim, { ox: 76, oz: 56, w: 8, d: 11, tiers: [{ h: 13 }], kind: 'curtain', wallMat: 'panel', wall: 0xb5b0a6, roof: 0x5f5a52 });
    setbackTower(sim, { ox: 76, oz: 70, w: 10, d: 11, tiers: [{ h: 6 }], kind: 'masonry', wallMat: 'brick', wall: 0x96604c, roof: 0x5f5a52 });
    // the D Street garage, with its orange fins — the thing in the foreground of
    // half the photographs taken from the BCEC prow. Interior columns on the same
    // 3 m grid as pierShed, for the same reason.
    {
      const ox = 76, oz = 10, w = 8, d = 14;
      for (let y = 0; y < 9; y++) {
        const slab = y % 3 === 0;
        for (let i = 0; i < w; i++) {
          for (let k = 0; k < d; k++) {
            const edge = i === 0 || i === w - 1 || k === 0 || k === d - 1;
            if (slab) { B(ox + i, y, oz + k, 'concrete', 1, 0x9a958c); continue; }
            if (!edge) { if (i % 3 === 1 && k % 3 === 1) B(ox + i, y, oz + k, 'steel', 1, 0x7a7f86); continue; }
            B(ox + i, y, oz + k, 'concrete', 1, 0x8a857c);
          }
        }
      }
      for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) B(ox + i, 9, oz + k, 'concrete', 1, 0x8a857c);
      for (let k = 0; k < d * 2; k++) for (let y = 1; y < 9; y += 2) B(ox - 0.5, y, oz + k * 0.5, 'panel', 0.5, 0xd97c2c);
    }
    // the Bypass Road's south edge — jersey barriers either side of the BCEC's
    // south podium, chain link, and the last trailing strip of the map
    for (let x = 14; x < 24; x += 4) BOX(x, 0, 82, 2, 1, 1, 'concrete', 1, 0xb0aca2);
    for (const x of [62, 66, 76, 80]) BOX(x, 0, 82, 2, 1, 1, 'concrete', 1, 0xb0aca2);
    fenceRun(sim, { x: 18, z: 90, len: 66, axis: 'x', h: 1.5, color: 0x6a7078, postEvery: 3 });
    for (const [x, z] of [[17, 84], [65, 84], [79, 84]]) lightMast(sim, x, z, 7);
  }

  // ══════════════════════════════════ THE STREETS
  // A generated sidewalk that runs off a quay into the channel is not a
  // sidewalk — water draws over it and the rect is simply a lie. Trim the band
  // on its own THIN axis instead of dropping it: A Street's west walk is a real
  // metre of granite between the channel rim and the asphalt, and deleting it
  // outright would leave the rim's own blocks standing on bare ground.
  const pushWalk = (r, thin) => {
    let a = thin === 'x' ? r.x : r.z;
    let b = a + (thin === 'x' ? r.w : r.d);
    for (const w of water) {
      const crosses = thin === 'x'
        ? (r.z < w.z + w.d && w.z < r.z + r.d)
        : (r.x < w.x + w.w && w.x < r.x + r.w);
      if (!crosses) continue;
      const wa = thin === 'x' ? w.x : w.z;
      const wb = wa + (thin === 'x' ? w.w : w.d);
      if (wa <= a && wb >= b) { a = b; break; }
      if (wa <= a && wb > a) a = wb;
      else if (wb >= b && wa < b) b = wa;
    }
    if (b - a < 0.25) return;
    sidewalks.push(thin === 'x' ? { ...r, x: a, w: b - a } : { ...r, z: a, d: b - a });
  };
  for (const s of BOSTON_STREETS) {
    roads.push({ x: s.x, z: s.z, w: s.w, d: s.d });
    const sw = 1.5;
    if (s.axis === 'x') {
      pushWalk({ x: s.x, z: s.z - sw, w: s.w, d: sw, color: C.brickSidewalk }, 'z');
      pushWalk({ x: s.x, z: s.z + s.d, w: s.w, d: sw, color: C.brickSidewalk }, 'z');
      laneMarkers.push(...laneDashes({ x: s.x, z: s.z + s.d / 2 - 0.06, w: s.w, d: 0.12, axis: 'x' }));
    } else {
      pushWalk({ x: s.x - sw, z: s.z, w: sw, d: s.d, color: C.brickSidewalk }, 'x');
      pushWalk({ x: s.x + s.w, z: s.z, w: sw, d: s.d, color: C.brickSidewalk }, 'x');
      laneMarkers.push(...laneDashes({ x: s.x + s.w / 2 - 0.06, z: s.z, w: 0.12, d: s.d, axis: 'z' }));
    }
  }
  // Crossings. The rect is inset inside the roadway and the bars repeat along the
  // direction of travel, so every stripe lands inside the asphalt.
  const cross = (s, at) => (s.axis === 'x'
    ? zebra({ x: at, z: s.z + 0.4, w: XW_LEN, d: s.d - 0.8, axis: 'x' })
    : zebra({ x: s.x + 0.4, z: at, w: s.w - 0.8, d: XW_LEN, axis: 'z' }));
  for (const [si, at] of BOSTON_CROSSINGS) crosswalks.push(...cross(BOSTON_STREETS[si], at));
  // Painted parking-lot stalls — the Seaport's single most characteristic ground
  // surface, and the reason parkingStalls exists (see the KIT CANDIDATE note).
  laneMarkers.push(
    ...parkingStalls({ x: -24, z: 7, w: 44, d: 5, axis: 'x', pitch: 2.4 }),
    ...parkingStalls({ x: -24, z: 11, w: 44, d: 5, axis: 'x', pitch: 2.4 }),
    ...parkingStalls({ x: -24, z: 19, w: 44, d: 5, axis: 'x', pitch: 2.4 }),
    ...parkingStalls({ x: -24, z: 23, w: 44, d: 5, axis: 'x', pitch: 2.4 }),
    ...parkingStalls({ x: 76, z: 26, w: 5, d: 14, axis: 'z', pitch: 2.4 }),
  );
  // the HarborWalk — 4,359 m of it mapped inside the study box, so the route is
  // real data rather than invention, and it is what ties the whole north edge
  // together. Held at z -85..-80 the entire way: every water rect on the north
  // edge ends at z -86 or further north, so the ribbon can never be painted over
  // by the water layer, which is exactly what happened when it hugged the quays.
  plaza.push(...pathRibbon([
    [-54, -84], [-30, -84], [-14, -82], [10, -82], [24, -84], [44, -84],
  ], 2.4, { color: 0x9a958c }));

  // ══════════════════════════════════ VEHICLES
  for (const v of BOSTON_VEHICLES) {
    if (v.kind === 'sedan') sedan(sim, v.x, v.z, v.color, v.roof ?? v.color, v.axis);
    else if (v.kind === 'bus') bus(sim, v.x, v.z, v.color, v.axis);
    else if (v.kind === 'boxVan') boxVan(sim, v.x, v.z, v.len, v.color, v.color2, v.axis);
    else if (v.kind === 'bigTruck') bigTruck(sim, v.x, v.z, v.color, false);
    else motorcycle(sim, v.x, v.z);
  }

  // ══════════════════════════════════ DECOR + AMBIENT
  sim.sceneDecor = {
    parks, sand, plaza, cobbles, sidewalks, roads, rail,
    bikePaths, laneMarkers, crosswalks, water, boardwalk,
  };

  // Procedural surfaces (js/voxeltiles.js SURFACES, bound in js/voxelsurfaces.js).
  // Boston is the first scene to declare any, so the mapping is stated with its
  // reasoning rather than left to look obvious.
  //
  // Surface is a function of matType, which is what makes this free: the render
  // bucket key was already `matType:size`, so prefixing it with a surface id adds
  // no partitions. Measured on this scene — 26 buckets before, 26 after.
  //
  // The scene is authored to READ CORRECTLY WITH THIS LINE DELETED. Every
  // district's identity is carried by colour and by massing first; the tiles
  // sharpen the brick-versus-glass contrast across the channel, they do not
  // create it.
  //
  // `panel` and `steel` deliberately share mat_metal_seam. Panel is the BCEC
  // vault's aluminium standing seam — the single most-photographed surface on
  // this map and literally what that tile is — and it is also the containers and
  // the curtain-wall spandrels, all of which are seamed sheet. Steel is mullions,
  // handrails, crane lattice and rails; mat_corrugated_rust would be right for
  // the dry dock and wrong for every window mullion in the Seaport, so it is left
  // for a later per-block override rather than applied to all 16.8k steel cells.
  // `rubber` and `leaf` stay unmapped on purpose: tyres and canopies are the two
  // things a masonry or metal tile makes worse.
  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_shop_window',
    concrete: 'mat_suburban_siding',
    steel: 'mat_warehouse_roll',
    panel: 'mat_awning_stripe',
    wood: 'mat_clay_shingles',
  };

  // Render-only ambient life. Never physical, never eatable — VoxelWorld3D owns
  // all of it and the physics grid never sees a single one.
  sim.sceneAmbient = {
    gulls: [
      { x: 84, z: -92, r: 12, y: 18, count: 11, speed: 0.34 },   // over the fish pier
      { x: 50, z: -96, r: 14, y: 20, count: 8, speed: 0.4 },
      { x: -36, z: -96, r: 10, y: 16, count: 7, speed: 0.46 },
      { x: -82, z: -30, r: 8, y: 12, count: 6, speed: 0.52 },    // over the channel
    ],
    // Surf is DERIVED, and this is the one layer on the map where hand-authoring
    // is strictly worse than asking the engine.
    //
    // Surf is a shoreline effect: `_shorelines` finds every place a `water` rect
    // comes within 3 m of a `sand` or `boardwalk` rect, and `_deriveSurf` lays
    // two 4.4 m bands there — one breaking, one draining back, on different
    // periods. It cannot be off by a metre, because it reads the same decor list
    // the ground is drawn from.
    //
    // My hand-authored version was off by a metre, four times. The first attempt
    // was two 192 m bands across the open harbour, which the plan render showed
    // for what they were: two white lines ruled across the water. The second
    // attempt aimed four short bands at real shorelines and still missed — the
    // Pier 4 pair sat at z -101 and -99 against a boardwalk edge at z -96, and
    // the "channel mouth" band was in open water with no shore within 12 m,
    // because at x -84 the harbour meets more harbour. Measured against the
    // decor rects, not guessed: boardwalk [-24,-96 40x2] and [75,-104 17x2] are
    // the only two shorelines on this map, and both are exactly what `auto`
    // finds. Everything else here is a quay wall, which does not break surf.
    surf: 'auto',
    ferries: [
      { x0: -60, z0: -110, x1: 60, z1: -100, period: 52, color: C.bostonYellow },
      { x0: 70, z0: -118, x1: -40, z1: -106, period: 68, color: 0xe8ecf2 },
    ],
    steam: [
      { x: 43, z: -12, rate: 0.42 }, { x: -20, z: -26, rate: 0.3 },
      { x: -66, z: -30, rate: 0.36 }, { x: 64, z: 30, rate: 0.26 },
    ],
    neon: [
      { x: 36, z: 3, w: 18, d: 1, color: 0x4ad9ff, period: 3.4 },     // the BCEC lobby
      { x: -74, z: -55.5, w: 8, d: 1, color: 0xff4b3a, period: 1.8 }, // the Barking Crab
      { x: 77, z: -57.5, w: 14, d: 1, color: 0x2ab0ff, period: 2.6 }, // BOSTON FISH PIER
      { x: 61, z: 41, w: 10, d: 1, color: 0xffd166, period: 2.1 },    // Swing Time
      // On the SIDEWALK at z -43, not in the carriageway. Neon here is a glow
      // POOL cast down onto pavement (voxelworld.js `_deriveNeon`, y 0.0093) and
      // the engine derives its own sites from sidewalks/plaza/boardwalk and never
      // from `roads` — so a hand-placed strip at z -45 read as a magenta stripe
      // painted down the middle of Seaport Boulevard. Caught in a chase-height
      // render; no probe looks at ambient placement.
      { x: -20, z: -43, w: 16, d: 1.4, color: 0xff2e63, period: 4.2 }, // Seaport Blvd retail
    ],
    pigeons: [
      { x: 0, z: 16, count: 15 }, { x: -10, z: 22, count: 9 },        // the spawn lot
      { x: 44, z: -12, count: 12 }, { x: -66, z: -30, count: 10 },
      { x: 84, z: -60, count: 13 }, { x: 64, z: 50, count: 8 },
    ],
  };

  sim.cameraBlockers = generateBlockers(sim);
}

