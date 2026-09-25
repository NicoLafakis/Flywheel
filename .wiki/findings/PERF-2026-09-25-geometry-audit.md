# PERF-2026-09-25: Per-city geometry efficiency audit

Investigation only; no game code changed. All 24 PLAYABLE scenes were built in Node
(`VoxelSandboxSim`, seed `audit`). Scratch scripts (not committed) lived in the
session scratchpad: `audit-city.mjs` (counts, hidden fill, merge estimate,
per-call-site attribution via stack traces), `boxgrid-swap.mjs` (same geometry
on the bounds grid), and `carpet-mass.mjs`.

## Method

- **Cube** = equal extents on all three axes; everything else is an architectural piece.
- **Hidden fill** = a piece whose six faces are all covered by other pieces (invisible interior).
- **Filler** = the `TARGET_BLOCKS - currentCount` "BUDGET CLOSE-OUT" ground carpet of 0.5 m
  cubes. It is measured as 0.5 m ground cubes with nothing on top, which matches the
  close-out sections' own counts to within a few pieces.
- **Estimate**: `architecturalPieces()` (Tokyo v2's own merge, bay 3 m / storey 3 m,
  global grid) is run over the authored geometry (filler excluded). It is then
  calibrated against Tokyo's real result. On Tokyo v1 the raw merge gives 15,365; the
  shipped v2 has 34,796. So only 71.7% of the raw merge's reduction was realised,
  and the "est." column applies that factor. It is a conservative, volume-preserving
  figure. Lab-style hand authoring went further (−74%), and hollowing the hidden
  fill would go further still.

## All 24 cities, ranked by expected piece reduction

| # | City | Pieces now | % cubes | Filler | Hidden fill | Est. achievable | Reduction |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Boston | 82,894 | 100 | 0 | 4,094 | ~41,000 | −51% |
| 2 | London | 45,000 | 100 | 40,822 | 1,801 | ~4,000 authored | −91% |
| 3 | Paris | 42,000 | 100 | 36,917 | 2,230 | ~4,800 authored | −89% |
| 4 | Upper Manhattan | 73,393 | 100 | 0 | 3,044 | ~36,700 | −50% |
| 5 | Berlin | 36,500 | 100 | 33,948 | 1,090 | ~2,400 authored | −93% |
| 6 | Dubai | 36,000 | 100 | 32,992 | 954 | ~2,700 authored | −93% |
| 7 | Beijing | 38,000 | 100 | 29,829 | 3,380 | ~6,900 authored | −82% |
| 8 | Rome | 35,000 | 100 | 30,061 | 2,540 | ~4,750 authored | −86% |
| 9 | Mumbai | 34,500 | 100 | 28,894 | 2,446 | ~5,400 authored | −84% |
| 10 | Cairo | 32,500 | 100 | 28,541 | 2,244 | ~3,650 authored | −89% |
| 11 | Amsterdam | 28,000 | 100 | 25,400 | 1,015 | ~2,350 authored | −92% |
| 12 | Seoul | 32,000 | 100 | 22,537 | 4,618 | ~6,600 authored | −79% |
| 13 | Bangkok | 30,000 | 100 | 24,940 | 2,564 | ~4,850 authored | −84% |
| 14 | Athens | 26,000 | 100 | 24,376 | 292 | ~1,400 authored | −95% |
| 15 | Cambridge | 72,943 | 54 | 0 | 1,196 | ~51,000 | −30% |
| 16 | Brooklyn | 39,984 | 100 | 0 | 1,420 | ~19,500 | −51% |
| 17 | Tokyo (v2) | 34,796 | 68 | 0 | 2,755 | ~21,300 | −39% |
| 18 | Lower Manhattan | 25,875 | 100 | 0 | 500 | ~12,700 | −51% |
| 19 | Hong Kong | 32,000 | 91 | 0 (1,183 boat close-out kept) | 2,954 | ~21,000 | −34% |
| 20 | Singapore | 22,000 | 100 | 1,238 | 2,583 | ~11,650 | −47% |
| 21 | Auckland | 16,000 | 97 | 0 | 1,175 | ~8,300 | −48% |
| 22 | Sydney | 14,120 | 100 | 0 | 2,820 | ~6,900 | −51% |
| 23 | Chicago | 44,578 | 18 | 0 | 168 | ~37,500 | −16% |
| 24 | The Lab | 7,474* | 4.5 | 0 | 0 | already mixed | ~0% |

\*The Lab figure is the uncommitted working tree (Shibuya recreation in progress). The
catalog still says 2,244.

**Two different kinds of gain.** Rows 2–14 (Acts II–IV) are **70–95% filler**. The authored
city is only 1.4k–9k pieces, mostly 2 m cubes. Their gain comes from deleting the
ground carpet, which the standard already forbids ("do not add filler to meet an old
catalog count"). Merging does little there: the carpet uses a four-colour checker,
and 2 m cubes cannot merge inside a 3 m bay. Boston, the Manhattans, Brooklyn and the
Act I cities are real 1 m cube buildings, where surface consolidation does the work.

## Top 5 to convert first, with their biggest structures

1. **Boston** (82,894). The shared `voxelkit.js tower()` accounts for ≥30,589 pieces
   (1 m cube walls, plus a full concrete floor plate every 3–4 layers). Next come
   `put@voxelscene-boston.js:709` (11,997; merges to ~3,066), BCEC/Seaport blocks at
   `:1037–1038` (7,885), and the lot at `:501` (3,235, 592 hidden). Heaviest scene
   today: 433 MB, 7.8 s to build.
2. **Upper Manhattan** (73,393). `tower()` accounts for ≥30,334 pieces, and the
   `setbackTower` crowns for another 6,891. Fifth Avenue and CPW frontage rows run
   2.9k–4.6k each and merge ~3:1. There are 6,371 × 0.25 m kerb cubes (`B25`, street
   life); these are food and should mostly stay.
3. **London** (45,000). Portland stone infill: 40,822 filler. Palace of Westminster:
   1,008 pieces, 693 of them hidden solid. The Shard: 783 pieces, 338 hidden. Big Ben:
   559 pieces, 231 hidden.
4. **Paris** (42,000). Limestone infill: 36,917 filler. Eiffel Tower: 3,549 pieces,
   1,088 hidden. Arc de Triomphe: 1,632 pieces, 410 hidden. Haussmann rows: 2 × 495
   pieces, about half hidden.
5. **Berlin** (36,500). Granite infill: 33,948 filler. Reichstag: 1,272 pieces, 756
   hidden. Brandenburg Gate: 1,048 pieces. Fernsehturm: 570 pieces.

Recommended order after those five: the other filler cities (Dubai, Rome, Cairo,
Amsterdam, Athens, Mumbai, Bangkok, Beijing, Seoul). These are cheap, and their
authored parts are small. Then the remaining `tower()` users: Brooklyn, Lower
Manhattan, Singapore, Hong Kong, Sydney, Auckland. Converting `tower()` once serves
eight cities. **Last**, or not at all: Chicago (already 82% architectural; it is the
ranked RUN, so any geometry change needs a ranked sim-version bump and replay
routing) and Cambridge (already 46% architectural; its full validator section alone
takes more than 4 h).

## What piece count actually costs

- **Memory and load time are driven by the occupancy grid, not by piece count.**
  Every city except Tokyo uses the per-fine-cell `VoxelGrid`, which stores one entry
  per 0.25 m cell. Cost therefore scales with occupied volume, and large pieces cost as
  much as the cubes they replace. For example, Hong Kong Take Two's 2,463 pieces still
  use 209 MB. With the geometry unchanged, swapping in the bounds `BoxGrid` (Tokyo v2's
  grid) gave these results, with identical eaten counts on a 10 s drive:

  | City | Heap, per-cell grid → bounds grid | Build time |
  |---|---|---|
  | Boston | 433 → 62 MB | 6.6 → 1.0 s |
  | Paris | 251 → 34 MB | 3.2 → 0.5 s |
  | Chicago | 317 → 48 MB | 6.5 → 0.9 s |
  | Lab | 238 → 16 MB | 3.4 → 0.3 s |

  Once a city is on the bounds grid, heap is roughly 0.75 KB per piece, so piece cuts
  then turn directly into memory and load savings.
- **Per-step simulation cost is mixed.** Idle steps got cheaper on the bounds grid
  (for example Boston 1.2 → 0.4 ms). Collapse-heavy drives were mixed: Rome 15.0 →
  22.7 ms and Singapore 3.9 → 7.7 ms got slower, while Paris 2.6 → 0.8 ms got faster.
  The grid swap therefore needs its own collapse benchmark before it is claimed as a
  frame-time win.
- **Rendering:** there is one instanced box (24 vertices) per piece, drawn in both the
  main and shadow passes. Draw calls are grouped by material and do not change, so
  vertex and instance work falls roughly in proportion to piece count. Hidden fill is
  pure render waste.

## Risks per city

- **Filler cities (Acts II–IV):**
  - Catalog counts are exact-match gated (`validate.mjs` "declared counts"), so every
    catalog entry must be updated.
  - The carpet is 5–25% of scene mass. Removing it changes the size ladder in Athens
    (6 → 4), Amsterdam (9 → 7), Berlin and Dubai (10 → 9), which changes growth
    pacing.
  - It is also most of the early food. Authored starter food has to replace it, or
    the opening starves.
- **`*_LANDMARKS` contracts** (Dubai, Cairo, Athens, Rome, Paris, London, Amsterdam,
  Berlin):
  - Peak heights must stay exact.
  - Void bands must stay open. Hollowing helps here.
  - Catalog heroes must still resolve.
  - Span budget: a 2 m piece gets only one hop, glass spans only 1 m and brick 2 m,
    so wide slabs need bearing walls or columns.
- **Shared `tower()`:** changing it changes eight cities at once. It needs a per-scene
  opt-in, like Tokyo's `geometryVersion`.
- **Chicago:** ranked replay compatibility.
- **Cambridge:** cost of validating it.
- **Every city:** full-clear reachability and `probePlacementStep` must be re-proven.

## Where the freed budget should go

Spend the savings on authored shape, never on filler. (The owner's reinvest rule;
`geometry-authoring.md` currently says "bank the savings", and the two should be
reconciled on the "no filler" point they share.)

- **Filler cities:** turn a share of the freed ~25–40k pieces into real districts
  around the heroes: articulated facades, arcades, street furniture, market stalls and
  quays. That food should be authored, with Lab-style bay floors and masonry sections.
- **Tower cities:** add window reveals, cornices, setback crowns, rooftop plant and
  interiors you can see through, kept hollow.
- **2 m-cube landmarks** (St Peter's 2,374 hidden, Citadel 1,319, Mahanakhon 1,127,
  Eiffel 1,088): rebuild as hollow shells with ribs and columns, recovering silhouette
  detail that the 2 m grain cannot show.
