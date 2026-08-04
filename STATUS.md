# STATUS.md — Hole City

Last updated: 2026-08-04

---

## ⏸ PAUSED MID-WORK — READ THIS FIRST (2026-08-04)

Session paused for resource reasons with **a large uncommitted working tree**.
Nothing is staged, nothing is committed, nothing is pushed. Four subagents were
running in parallel and have been stood down. **The open question at the moment
of pausing is whether this work has turned into spaghetti — that audit was
started and is NOT finished. Do not commit any of this until it is.**

### Working tree at pause

`git status` — 9 modified, 2 new, **+3,451 / -93 lines**:

| file | Δ | owner | what |
|---|---|---|---|
| `js/voxelworld.js` | +1,553 | brooklyn-render | decor layers, ambient animation, shadow-box framing |
| `js/voxelkit.js` | +928 | brooklyn-scene | 8 large-mass builders + 5 new `C1 PROP` builders |
| `js/camera.js` | +531 | intro-camera | `beginIntro`/`releaseIntro`/`skipIntro`, yaw sweep, `minBox`, `orbitArc`, lighting term |
| `tools/validate.mjs` | +301 | brooklyn-scene | `validateBrooklyn()` at :432, 12 probes, called at :664 |
| `css/main.css` | +232 | ready-gate-ui | READY gate styling, scrim as a local radial pool |
| `js/main.js` | +122 | intro-camera | READY gate wiring, `beginIntro` call, Brooklyn-only gate, `sunDirOf()`, `window.__world` hook at :235 |
| `js/ui/hud.js` | +26 | (lead) | minimap show/hide on sandbox vs campaign |
| `js/voxelsim.js` | +18 | brooklyn-scene | Brooklyn scene dispatch + SIZE-ladder ×10 cap at :158 |
| `js/ui/screens.js` | +4 | ready-gate-ui | settings button label |
| `js/ui/ready.js` | NEW | ready-gate-ui | `mountReadyGate()` → `{ dismiss() }` |
| `js/voxelscene-brooklyn.js` | NEW | brooklyn-scene | the Brooklyn scene itself |

### The unfinished audit — resume here

Nico flagged: *"Seems like you're auto-creating code spaghetti here potentially,
but I can't tell."* He is right that it needs checking. All four agents were
frozen and asked to self-report (a) what they added section by section, (b)
anything now **unused, superseded, or a replaced approach left in place**, and
(c) anything they changed that they were not asked to change. **Those reports
were never received — the pause came first.**

Two commands were launched and interrupted; re-run both:

```
node tools/validate.mjs
git diff -U0 js/voxelworld.js   # +1,553 is the largest change; justify it section by section
```

Specific spaghetti suspicions worth checking by hand:

- `js/voxelkit.js` is **shared** with both Manhattan scenes. Anything
  Brooklyn-only added there does not belong in a shared kit.
- Possible **two overlapping mechanisms for the same job**: the positional
  `BROOKLYN_ROAD_SPANS` allowlist vs. the declared-span approach.
- Kit builders that nothing calls.
- Leftovers from replaced approaches: the pre-`orbitArc` orbit implementation
  in `camera.js`; the original full-frame scrim in `css/main.css` before it
  became a local radial pool.
- `js/voxelscene-brooklyn.js:672` asserts a "40k block ceiling" **that does not
  exist** (see Established facts below). The comment is still there.

### Established facts (measured this session, trust these)

- **The scene build is NOT superlinear.** An earlier "exponent ≈ 2.08,
  something is quadratic" claim was measurement noise from a loaded box and is
  retracted. Round-robin, min-of-9: gallery 3,798 blocks / 169 ms · upper
  8,442 / 570 ms · manhattan 25,875 / 2,521 ms · brooklyn 39,984 / **4,051 ms**
  (not 12.4 s). Exponent 1.15 vs *fine volume*; per-fine-cell cost is flat to
  1.47× where per-block cost spreads 2.27×. Cost is linear in total fine
  volume, as the code implies — `_addBlock` (`voxelsim.js:188`) writes `fs³`
  grid cells, `_buildNeighbors` (`:516`) probes `6·fs²`.
- **There is no 40k block ceiling.** Only occurrence in the repo is that one
  comment. `voxelworld.js:377` sizes each `InstancedMesh` to `list.length`, and
  draw calls scale with (material × size) buckets, not block count. +2,000
  blocks ≈ +203 ms build, 0 extra draw calls.
- **Perf measurement precondition:** this box showed 2.0–2.6× median/min noise
  and a 40 s outlier on a 2.5 s build while agents were live. No perf number is
  quotable until the tree is still. Min-of-N round-robin is the minimum
  acceptable instrument. Probes: `probe-buildcost2.mjs` (v1 kept as the
  broken-instrument counterexample).
- Brooklyn last known good: `blocks=39984 mass=65346 eaten=530 size=4
  blockers=510`, validator ALL PASS, 0 of 32 spawn headings dead.
- Shipped intro pose (desktop): yaw 90°, 238.6 m, 12.19% coverage at
  `orbitArc: ±30`. Static (`orbitArc: 0`) = 170.1 m / 24.22%. Portrait: yaw 0°,
  521.4 m. Worst-in-arc ndc 0.591/0.805 — nothing crops.
- **The "establishing shot got 38% darker" diagnosis was wrong and is
  retracted.** I attributed a 54.7 → 34.1 luma drop to the yaw objective
  lacking a lighting term. Measured across 48 poses on the shipped build,
  frame luma only ranges 36.08–40.11 — an 11% spread, so yaw cannot produce a
  38% swing, and neither number appears in this build at any pose. The shipped
  pose is in fact the *brightest* of the three candidates (40.10, vs 39.80 for
  the old framing and 37.63 for the old coverage pick); the city reads ~70 luma
  against a 32.1 background, so more city means a brighter frame. If the
  darkening was real it came from something else moving in parallel — Brooklyn
  scene edits were live between my two captures. **Re-measure before acting.**
- **A real latent bug was found underneath that wrong diagnosis.** The distance
  fit is period-π but lighting is period-2π, and the yaw search only swept
  `[0, π)` — so it could return either member of a lit/unlit antipodal pair,
  arbitrarily. Yaw 90 was correct *by luck*: it scores 0.5567 on the lighting
  term against 0.1752 for its antipode 270, which measures 6.6 luma darker yet
  has *higher* coverage, so a coverage-only objective would have taken 270.
  Now fixed by construction, with a Lambertian term validated at r = 0.851
  against measured city luma over all 48 poses.

### Awaiting Nico — three decisions, none answered

1. **Construction vocabulary.** His actual request, and **nothing has been
   started on it**: not bigger buildings, but *per-building construction
   vocabulary* — one apartment built from tons of blocks of one type, another
   from brick-shaped configurations, another from planks, another from columns
   made of extruded-cylinder "slices". He asked for thoughts before any action
   and has not yet replied. The enabling insight: the sim/render split
   (ADR-0002) means the **sim** needs cubes but the **renderer** does not.
   Caution: the renderer batches on `matType + ':' + b.s`, so a `shape` tag
   adds a third key dimension and multiplies draw-call buckets.
2. **Sun elevation** — leave at 54.2°, or drop to 32°? New information: the
   intro's lighting term reads the renderer's actual light via `sunDirOf()`
   rather than assuming a constant, and it gets more decisive as the sun drops
   (lit spread 0.758 at 54.2°, 0.868 at 32°, 0.917 at 20°). At 32° the portrait
   hold pose would move from yaw 0° to 15° on its own, no code change. So this
   decision now also improves the mobile establishing shot for free.
3. **Intro orbit** — motion at ±30° (shipped, 12.19%) or static (24.22%)?
   A ±20° option exists at 15.16%; apparent orbit speed is now identical at
   every arc, so ±20 dominates ±30 on coverage. Gated on an unmeasured check:
   whether the arc endpoint eases or snaps.

### Not started

- **Performance pass** (Nico's explicit request): optimise for low-resource
  systems without degrading graphics or introducing tearing. Sequenced by him
  to come after the Brooklyn work.
- **Request A, still open from the prior session:** 11 Upper Manhattan defects
  were produced and remain unfixed, awaiting his decision.
- Brooklyn voids: SW corner (exclude via a *declared named region*, never by
  narrowing a probe until it goes green) and the central 110×12 m band at
  Z[-16,-4] (needs block headroom; runtime cost still unmeasured).

### Process notes for whoever resumes

- Four parallel agents on work this size produced real coordination waste:
  stale numbers relayed from a task description instead of from the owner, and
  a decision (±30) invalidated by a change landing underneath it. Fewer agents.
- Do not quote a task description as a measurement. Ask the owner.
- Commit path is gated: stage explicitly → `py ~/.claude/scripts/sop_attest.py`
  → standalone `git commit`. Never `git add -A`. Multiline messages via a
  scratchpad file and `git commit -F <abs-path>`.

---

## Current state

**Campaign**: playable v1, mechanically complete. All 100 levels validated
`ALL PASS` (worst bot margin 46%). Level 1 visually close to reference
(verified by screenshot); other levels share the code but are unreviewed.

**Voxel Sandbox**: physics complete and playtest-tuned, three levels: the
city gallery (~3,800 blocks, ~30 object kinds in 7 districts) and **full
Lower Manhattan** (~25,800 blocks, asymmetric clamp x[-70,74] z[-84,54] —
WTC + 7 WTC + Oculus,
memorial pools, Woolworth, Wall St canyon + NYSE + Fed Reserve, Municipal
Building + courthouse, Chinatown rows, Tribeca lofts, Brooklyn Bridge
tower, Seaport + pier sheds + tall ship + heliport, Battery Park City +
marina, Castle Clinton, SI Ferry Terminal + orange ferry, Custom House).
5-class content kit (`js/voxelkit.js`: PROP/VEHICLE/SMALL_BLDG/LARGE_BLDG/
MEGA). Rim-driven excavation, persistent-damage crumble, loose-body contact
resolution (no clipping/spinning), SIZE-scaled hanging reach, SIZE-10
camera clears the tallest building. Validator covers determinism,
stability, a 56 s gallery tour, Manhattan overlap/idle/excursion checks
(WTC + expansion-district sweep).

## What works

- Core loop: eat → grow → unlock tiers (strict 1.35× 7-tier ladder), win/fail
- Deterministic seeded city gen (streets, blocks, parks, parking, waterfront)
- 100-level campaign, 5 metros, 4 mechanics on schedule (golden L6, rivals
  L21, tide L41, landmark L20 + finales + L91–100)
- Combos (×3 cap), star ratings, coins, shop (skins + clock/growth items)
- World map with locks/stars, results screen, mechanic intro cards
- Saves: localStorage schema v9, migrations v1→v9, quarantine
- Desktop (WASD/QE/RF) + mobile (joystick + touch orbit) controls
- Chase camera with building-occlusion pull-in
- **Voxel Sandbox** (see `.wiki/modules/voxel.md`): deterministic load-path
  support graph, instant-default support loss, persistent damage + neighbor
  shock, chunks/debris by material bond, mass-scaled fall + optional creak,
  damage heat tint, drive-mode steering + follow camera
- Sandbox gallery: tower, warehouse, house, shop, church, brownstone,
  apartment, parking garage, gas station, crane, containers, fountain,
  statue, water tower, elevated bridge + train, 8 vehicles, 16 street-furniture
  props, trees, crate pile
- Sandbox Manhattan (`js/voxelscene-manhattan.js`): One WTC + spire, twin
  memorial pools, Woolworth-style tower, glass slab tower, Wall St bank
  porticos, rooftop water tower, Trinity Church, City Hall, elevated train
  (viaduct + 3-car train), Battery Park, Charging Bull, ferry pier, street
  furniture, road/park/harbor decor planes
- Sandbox Upper Manhattan (`js/voxelscene-upper-manhattan.js`): ~8,400-block
  Central Park district with geographically placed Reservoir, The Lake, Harlem
  Meer, Bethesda Terrace, Belvedere Castle, the Met, Dakota/Upper West Side,
  Museum Mile, Harlem blocks, sidewalks, loop bike paths, lane/crosswalk
  markings, oriented avenue traffic, hydrants, waste bins, traffic lights,
  subway entrances, park trees, benches, lamps, newsstand, and hot-dog cart.
  Street and prop footprints use shared templates; validator rejects physical
  blocks in road bands or overlapping fine cells.
- Headless proof: `node tools/validate.mjs`

## Known gaps / next up

- Campaign: level-by-level visual review (level 2 next, once level 1 is
  signed off); crosswalks, moving traffic, roof variety, ground textures,
  fog/grade polish. No instancing in campaign yet (revisit > ~800 draw calls).
- Sandbox direction: more gallery objects from the city-object research
  (delivery/school bus, billboard, subway stairs proper, waterfront/pier,
  helicopter), density re-skins of existing buildings (tower at 0.5 m bricks),
  possibly moving traffic and living pedestrians. Driven by playtesting.
- Audio is placeholder blips.
- No unit tests beyond the validator; UI untested except smoke path.

## Recent history

Lean board: one line per shipped item — full detail lives in `CHANGELOG.md` +
git log, not here. This section is NOT a changelog.

- 2026-08-04: Upper Manhattan realism + graphics pass (park geography, streets/furniture, renderer batching) — ALL PASS
- 2026-08-04: Upper Manhattan grid + object alignment scrub (intersection template, footprints off roads, validator guard)
- 2026-08-04: Sandbox feel tuning defaults (gravity 70, wave 0.10 s/m, pull 2, instant creak; schema v9)
- 2026-08-03: Upper Manhattan (Central Park) added as third sandbox scene — ALL PASS
- 2026-08-03: Instant sandbox collapse default (schema v9)
- 2026-08-03: SIZE-scaled sandbox handling (speed/turn/camera ramps)
- 2026-08-03: Voxel collision hardening (full AABB separation, overlap probes) — ALL PASS
- 2026-08-03: Upper Manhattan prop-accuracy scrub (bench leg fix)
- 2026-08-03: Manhattan sandbox review pass (13 cameraBlockers, sceneDecor peninsula/harbor, asymmetric bounds, 3 anti-drift probes)
- 2026-08-02: Full Lower Manhattan expansion + 5-class kit (`js/voxelkit.js`, ±80 bounds, 25,827 blocks) — ALL PASS
- 2026-08-02: Hanging reach scales with hole radius
- 2026-08-02: Loose-body contact resolution + sleep rework — ALL PASS
- 2026-08-02: Sandbox camera see-over-any-building rule — ALL PASS
- 2026-08-02: Hole ring visible through buildings (depth-test disabled)
- 2026-08-01: Settings sliders measurement readouts
- 2026-08-01: Block-vs-block collision (heightmap, piles, repose slide)
- 2026-08-01: Dev voxel-physics sliders in SETTINGS (schema v7) + `applySettings` crash fix
- 2026-08-01: Voxel gravity 26 → 65
- 2026-08-01: Lower Manhattan sandbox level added (`js/voxelscene-manhattan.js`)

