# Hong Kong scene — landmark reference notes

Source pass (2026-08-20, global rule 11) for `js/voxelscene-hongkong.js`. Wikipedia text
descriptions stand in for the Google Images pass Nico used. Each entry: silhouette /
facade pattern / colours, then how the voxel scene renders it (block sizes in metres).

| Landmark | Distinguishing silhouette | Facade pattern | Colours | Scene rendering |
|---|---|---|---|---|
| Bank of China Tower (I.M. Pei, 1990, 315 m + twin masts to 367 m, 72 fl) | Square plan cut into four triangular prisms; prisms terminate at 1/4, 1/2, 3/4 and full height, leaving a single sharp prism at the top; "vertical knife" | Giant white X-bracing (steel space frame) over reflective blue glass; sloping prism tops | Dark blue glass, white/aluminium diagonals | Four quadrants stepping 16/32/48/64 m; 1 m white steel diagonals laid over dark-blue 1 m steel curtain in 8 m X-bays; sloped 0.5-m-step tops; two 0.5 m masts |
| HSBC Main Building (Foster, 1985, 178.8 m, 47 fl) | Three stepped bays; 8 mast groups in 4 pairs; 5 levels of inverted-V (chevron) suspension trusses at double-height intervals; OPEN ground floor on stilts (atrium off Statue Square) | Exposed grey aluminium-clad masts and trusses outside the glass; floors hang between | Silver-grey aluminium, clear glass | Eight 1 m steel masts, open ground floor (only masts touch y=0), 1 m truss chevrons with a 0.5 m ridge at five levels, glass infill as non-loadbearing leaves; two bronze lions |
| Two IFC (Pelli, 2003, 412 m, 88 fl) | Tapering square shaft; four setbacks; crown of upward-pointing "claw" fins | Continuous vertical ribs (mullions) over glass | Cream-white / pale-grey | Four tiers (cream 2 m core), 0.5 m white vertical ribs on all faces every 2 m, 1 m notched crown fins on each corner |
| Jardine House (1972, 178.5 m, 52 fl) | Plain slab tower | Grid of ROUND porthole windows ("house of a thousand arseholes") | Silver-grey aluminium, dark glass discs | Pale 2 m core + 1 m facade skin with 0.5 m dark "porthole" inserts centred in every 1 m bay |
| Lippo Centre (Rudolph, 1988, 2 x 186 m) | Two octagonal towers with stacked C-shaped glass pods bulging out ("koalas clinging to a tree") | Stepped pod bands | Dark blue reflective glass | Two chamfered-octagon cores, 3-storey pod clusters cantilevered 1 m at three heights, dark blue |
| The Peak Tower (Farrell, 1997; Sky Terrace 428) | Wok / crescent bowl held above a podium on an open "neck" | Bowl of white/ silver panels, red accents | White, grey, red-orange rim | 4-storey podium, narrow neck columns, widening 1 m-stepped bowl with orange rim |
| Peak Tram (funicular, 1364 m, grade up to 27 deg) | Steep straight cutting up the slope | Twin rails on a ballast bed | 6th-gen cars green; classic 5th-gen burgundy | Stepped bed with 0.5 m rails; two burgundy-and-cream cars with 0.5 m windows |
| Star Ferry + Central Pier 7 | Double-deck boats, open upper deck, single funnel; Pier 7 is a 2006 Edwardian-revival shed with a clock tower | Green hull / white superstructure | Green 0x1b5e20, white, black funnel | Green hull with white upper deck, 0.5 m window strips and lifebuoys; pier shed with arched bays and a clock tower |
| TST Clock Tower (1915, 44 m) | Square red-brick tower with white granite quoins, cupola, 7 m lightning rod | Brick with pale stone corners and clock faces | Red brick 0x8d5b4c, white granite | 1 m brick shaft, 0.5 m white quoin columns at all four corners, clock face, cupola + 0.25 m rod |
| HK Cultural Centre (1989) | Long low wings with steeply SLOPING windowless roofs | Blank pinkish-beige tile | Pink-beige | Ramped wing: 1 m-stepped sloping roof with no windows |
| Mid-Levels pencil towers | Very thin (10-15 m), very tall (40-60 storey) residential slabs packed in a wall up the slope, bay windows, pastel paint | Tight window grid, protruding bay windows | Pastel pink, mint, cream, peach, sky | Wall of 4-6 m wide towers at three slope tiers, 1 m cores, 0.5 m bay-window protrusions, pastel palette |
| Tong lau shophouses | 3-4 storey narrow houses; ground-floor shops, balconies, projecting signboards | Horizontal balconies, vertical signs | Faded pastel, many neon signs | Row along Des Voeux Rd: 1 m brick, 0.5 m balconies, projecting 0.5 m signboards |
| Victoria Peak | Green granite hill, terraced | Vegetation + grey granite outcrops | Greens, granite grey | Terraced green slabs with granite retaining walls and tree clumps |
| Harbour traffic | Junks (batwing sails), sampans, kaito ferries | — | Red/brown sails | Budget close-out spent on sampans and pontoons, not a stone carpet |

## Character pass, 2026-08-20 (status + module notes live here; STATUS.md and voxel.md were owned by other sessions at the time)

Nico: "indistinguishable from a generic city". Measured root cause: 15,346 of the
blocks (54%) were a flat 0.5 m grey stone carpet on Victoria Harbour placed purely
as budget close-out, and every landmark was a solid 2 m box.

Rebuilt `js/voxelscene-hongkong.js` at the catalog's 32,000 exactly. Small y=0
water-zone blocks 15,129 -> 685 (sampan hulls + 8 buoys; close-out 1,191 blocks =
3.7% of budget). Blocks above y=4 that are not 2 m cubes: 29.3% -> 93.1%.

Three RED-first guards in `tools/validate-hongkong.mjs`: `probeNoBudgetPadding`
(failed at 15,129 vs cap 2,850), `probeFacadeArticulation` (failed at 29.3%),
`probeRoadConflicts` (ported from `tools/validate.mjs`; failed at 1,123 blocks —
the inherited IFC, Jardine and BoC footprints stood inside Connaught, Murray and
Queensway, all re-sited; BoC now at the Peak foot beside the tram, x 26..42, as
on Garden Road, because the 11 m canyon band cannot hold a 16 m footprint).

Structural lessons encoded in the scene header: support hops accumulate on BOTH
axes, so a 1 m slab over an open floor needs supports on a grid whose Manhattan
radius is <= 3; a diagonal of white cells in a glass field is a set of islands,
so curtain walls that carry bracing are `panel`, not `glass`.
