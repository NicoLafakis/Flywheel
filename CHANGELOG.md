# CHANGELOG — Flywheel

Detailed build history, migrated from STATUS.md (which is a lean board, not a
changelog). Newest first. Commit-level history: `git log`.

- 2026-08-05: **Upper Manhattan full rebuild — Central Park geography,
  structural-zone sim optimization, renderer/input fixes.** Five sequential
  passes replaced Upper Manhattan's ~8,400-block Central Park sketch with the
  full district: 73,393 blocks / 86,083 mass across Central Park's real
  geography (Great Lawn, the Ramble, the Lake, Bethesda Terrace, the Mall,
  Conservatory Water, the Reservoir, the Zoo, Wollman Rink), the Upper West
  Side (El Dorado, the Beresford, the Dakota, the AMNH + Hayden Sphere, San
  Remo, Trump International, Columbus Circle), Fifth Avenue / Museum Mile (the
  Met, the Guggenheim, the Frick, Temple Emanu-El, Mount Sinai, the Jewish
  Museum), and Harlem (Striver's Row, the Apollo, Marcus Garvey Park,
  Abyssinian Baptist, the Adam Clayton Powell Jr building, four cruciform
  public-housing towers). 32 new parametric kit builders landed in the shared
  `js/voxelkit.js` (`setbackTower`, `streetWall`, `porticoFront`,
  `spiralRotunda`, `stoneArch`-driven bridges, `pathRibbon` for curvilinear
  park surfaces, and more), reused across scenes rather than duplicated. The
  validator's contract went from 9 to 19 probes for both Brooklyn and Upper
  Manhattan, refactored onto 16 shared `probe*`/`report*` helpers so
  duplicated probe bodies went from 19 to 0; the excursion floor rose to
  `eatenCount ≥ 300` (matches Brooklyn), measured yield 721 eaten, combo
  3,680, SIZE 4 at 37.8 s of 62.

  The rebuild made the scene briefly unplayable: 15 fps median while driving,
  3.3 fps in the worst collapse. The cause was `_recalcSupport` re-walking the
  entire 73k-block connectivity graph on nearly every step while the hole
  moved (48.55 ms/call, 80% of frame time — measured, not assumed, along with
  a matching Node-only sim benchmark and a per-method CPU profile). The fix:
  automatic structural zones. The support graph's connected components are
  computed once at build time (Upper Manhattan has 1,114 of them, the largest
  3.4% of the scene), and `_recalcSupport` now recomputes only the zones a
  moving hole can provably reach, instead of the whole scene every call. This
  is the "structural zones" optimization the wiki had previously recorded as
  intentionally unimplemented — it now ships as *discovered* zones rather than
  authored ones, so no scene file declares anything. `_recalcSupport` fell to
  0.295 ms/call (a 165× reduction), and the sim was proved byte-identical to
  the pre-fix version three independent ways: `tools/validate.mjs`, a full
  per-step state digest across 16 scripted excursions (including two 3-/2-
  minute SIZE-10 ploughs generating thousands of sleep/wake events), and 50
  randomized fuzz runs. Companion fixes gave the loose-debris scan
  (`_stepDebris`, `_resolveDebrisContacts`) a maintained active set instead of
  a full block-array walk every step, and gave sleeping rubble a persistent
  broad-phase cell index instead of a per-step rebuild (the latter alone was
  roughly half of step time five minutes into a long collapse). Net: driving
  p50 66.1 ms → 3.6 ms; the worst collapse's p50 300.9 ms → 16.6 ms.

  Renderer and input fixes, verified by A/B screenshot diff against the
  pre-pass tree (42 stacked comparison pairs) plus a raycast probe: the ground
  plane is now sized and centred on the scene's actual content
  (`contentExtent()` — every block footprint, every decor rect, the hole
  clamp) plus a 600 m margin, replacing a fixed `PlaneGeometry(240, 240)` that
  had left 8.5% of Upper Manhattan's blocks (the whole northern band) hanging
  off the edge of the world with sky behind them; the far edge is now hidden
  with distance fog riding the camera's far plane instead of showing a flat
  cut or a floating rim. Blocks now render at their full cell size instead of
  95% of it, closing a defect where the old 5% mortar inset became a
  continuous see-through slot through every wall in the scene at certain
  camera heights (confirmed by raycast: rays that hit nothing at any x across
  a full screen row); the course line is now a shared, proportional 128×128
  painted texture instead, at zero extra draw calls. `Controls` steering,
  orbit, and zoom are now rate-per-second (`STEER_RATE = 2.7`,
  `ORBIT_RATE = 1.8`, `ZOOM_RATE = 24`, each tuned to feel identical to the
  old per-frame step at 60 fps) instead of a fixed amount added once per
  rendered frame with no `dt` — the old code made turn rate `0.009 × fps`
  rad/s, a 400× swing measured between a fast machine's idle and a struggling
  scene's crawl, which made the hole nearly unsteerable exactly when driving
  through the pre-fix Upper Manhattan collapse. `VoxelWorld3D.setPerfMode` was
  implemented for the first time — it previously existed only on the campaign
  renderer (`World3D.setPerfMode`), so the sandbox's Performance Mode toggle
  was a silent no-op on the renderer (`main.js:101`'s guarded call never
  matched). It now pins device pixel ratio to 1 and freezes ambient motion
  (gulls/pigeons/steam/ferries/surf/neon), measured at −35% median idle frame
  time on a 1× panel and −36% median / 13× p95 collapse on a 2× panel; it
  deliberately does not cull or LOD the block field, which stays a real
  renderer lever for later.

  Two pre-existing "40k block ceiling" code comments in
  `js/voxelscene-brooklyn.js` (there is no such ceiling — see `STATUS.md`'s
  Established facts) were corrected in place while documenting this session.

  Known remaining, deliberately not addressed: `main.js`'s fixed-timestep
  catch-up loop clamps at 6 steps per frame, so a step that crosses ~16.7 ms
  costs roughly 6× itself — this is why the worst collapse's p95 is still
  101 ms even though its median is fast (16.6 ms). Lowering the clamp would
  trade dropped frames for brief slow motion during a big collapse, which is a
  pacing decision rather than a technical one, left unmade. Shadow-map
  aliasing at the widest SIZE 10-12 camera distances and the `roads` decor
  color (`0x1c2030`, reads as near-black) are also left as-is, along with
  three scene-authoring notes (Bethesda's bronze angel reads near-black,
  Turtle Pond is barely findable, Belvedere Castle stands close against the
  CPW wall — the last one inherent to the park's 44 m width at that latitude)
  for whoever next works in `voxelscene-upper-manhattan.js`.

- 2026-08-04: **Rebrand to Flywheel - A sprocket's story**. The game is no
  longer "Hole City"; product name and repo name now match. The visual language
  invented for the Brooklyn READY gate (gold slab letters with a hard ink ring,
  two-tone extrude, staggered pop-in, orange extruded CTA pill) was extracted
  out of that one screen into a shared brand layer: `js/ui/blockword.js` builds
  the wordmark for both the gate and the landing screen, and `css/main.css`
  gained `--fw-*` tokens plus `.fw-title` / `.fw-plate` / `.fw-cta` primitives
  that both screens now draw from, so the letter treatment cannot drift between
  them. New branded landing screen (`js/ui/sprocket.js`, `showTitle` in
  `js/ui/screens.js`): a rotating voxel sprocket mark whose empty center is the
  hole itself, the FLYWHEEL wordmark and tagline plate, one PLAY pill for the
  campaign, and a grouped free-play city picker (Brooklyn first as the showcase
  scene, then Lower Manhattan, Upper Manhattan, Sandbox) replacing the old stack
  of seven equal-weight buttons. `.btn`, `.btn.secondary`, and `.screen`
  headings were unified to the same brand treatment, so every other screen
  inherits it without being rewritten. Reduced motion is honored from both the
  in-game setting and the OS preference; the wordmark and mark are decorative
  and the accessible name is stated once in text. **The world map and level
  selection were deliberately left unchanged** - they are the campaign's own
  language and are out of scope for this pass. The READY gate was verified
  visually unchanged after the extraction: it renders the same wordmark at its
  own font size and contributes nothing else.

- 2026-08-04: **Brooklyn sandbox + performance pass**. Added
  `js/voxelscene-brooklyn.js` (bridges to Coney Island, ~39,980 blocks), the
  intro establishing camera (`beginIntro`/`releaseIntro`/`skipIntro`, yaw sweep
  with a Lambertian lighting term so the pose cannot land on the unlit side of
  an antipodal pair), and the READY gate (`js/ui/ready.js`) that holds the shot
  until the player starts. Performance pass on top: a renderer fast path that
  skips per-frame matrix and color work for static, undamaged, out-of-region
  blocks (40,000 down to roughly 50-200 active blocks per frame); a cached
  floor-block list and distance-gated anchor checks in the support-graph BFS;
  damage, healing, and collapse timers that visit only active blocks instead of
  scanning all 39,984; bit-packed integer spatial keys and pooled buckets that
  remove thousands of per-frame allocations from loose-body physics; particle
  and crumble-mesh pooling; and a user-facing Performance Mode toggle in
  SETTINGS (save schema v10) that caps particle, crumble, and relaxation work on
  low-resource hardware. Validator gained `validateBrooklyn()` with 12 probes;
  ALL PASS.

- 2026-08-04: **Upper Manhattan realism + graphics pass**. Repositioned the
  Reservoir, The Lake, Harlem Meer, Belvedere Castle, and Met to match the
  recognizable Central Park geography; added 59th/72nd/86th/96th/102nd/110th
  street surfaces, sidewalks, loop bike paths, lane markers, striped
  crosswalks, oriented curb traffic, hydrants, waste bins, traffic lights,
  subway entrances, a newsstand, and a hot-dog cart. Fine-cell ownership,
  idle stability, camera coverage, roadway clearance, and deterministic
  excursion remain ALL PASS;
  the renderer now batches by material/brick size and caches static transforms;
  Playwright smoke found WebGL/page/request errors at zero and 61–66 measured
  draw calls per frame under the available SwiftShader browser renderer.

- 2026-08-04: **Upper Manhattan grid + object alignment scrub**. Applied the
  official park map and object-level NYC street references to a reusable
  intersection template: five-stripe zebra crossings without border rails,
  consistent curb-side furniture offsets, avenue-facing vehicles, and a clear
  sidewalk buffer. Moved the Met and Belvedere footprints off roadway bands,
  corrected castle turret/building ownership, and added a validator guard for
  tall structures, foliage, benches, and roadway overlap. Playwright close-ups
  at the 72nd Street / west-curb template show aligned roads, sidewalks,
  crossings, lamps, signals, hydrants, bins, and benches.

- 2026-08-04: **Sandbox feel tuning**. Defaults are now gravity 70, collapse
  wave `0.10 s/m`, attraction pull 2, and instant creak. Existing saves
  migrate to these values in schema v9; the gradual turn `.20→.80` and camera
  ramps remain tied to sandbox SIZE rather than campaign settings.

- 2026-08-03: **Upper Manhattan: Central Park sandbox level** added as a third
  scene (`js/voxelscene-upper-manhattan.js`). The park-first map has ~7,600
  deterministic blocks around Central Park, the Reservoir, The Lake, Harlem
  Meer, Bethesda Terrace, Belvedere Castle, the Met, Dakota, Museum Mile, and
  Harlem edges. Added a title-screen entry, scene-specific loading/HUD labels,
  camera-blocker coverage, and a validator excursion from the park promenade
  to the Upper West Side; full suite `ALL PASS`.

- 2026-08-03: **Instant sandbox collapse**. Support loss now detaches newly
  unsupported blocks on the next `sim.step` by default, removing the visible
  creak/wave wait between the hole touching a structure and its fall. The
  optional SETTINGS tuning can still restore a nonzero delay; save schema v9
  migrates existing saves to the instant default. Validator now asserts that
  no blocks remain in the delayed `unstable` state.

- 2026-08-03: **SIZE-scaled sandbox handling**. Hole speed rises across SIZE
  1→12, turn sensitivity ramps `.20→.80`, and the chase camera ramps from
  max zoom-in to max zoom-out on top of its blocker-clearance curve. Campaign
  movement remains unchanged.

- 2026-08-03: **Voxel collision hardening**. Falling bodies now use full AABB
  separation against nearby solid buckets when a directional/top contact is
  detected; chunk members split on solid overlap, and loose-body separation
  remains prioritized over preserving flight paths. Added deterministic solid
  and loose-body overlap probes; full suite `ALL PASS`.

- 2026-08-03: **Upper Manhattan prop-accuracy scrub**. Playwright screenshots
  swept the spawn promenade, park water, Met edge, and Upper West Side. The
  shared bench builder had its second leg 1 m beyond the 1 m seat; moved it
  under the seat so every park bench now has aligned supports. Trees, lamps,
  subway railings, and vehicle frames passed the source/visual review.

- 2026-08-03: **Manhattan sandbox review pass**. The physics layer audited
  clean (0 ghost fine cells, 0 floaters, validator `ALL PASS`); every finding
  was in the derived/render-only data no test covered. Fixed: 13 missing
  `cameraBlockers` for the 6-9 m mid-rise band (Trinity, City Hall, NYSE,
  Custom House, Courthouse, Chinatown rows ×3, SE tenements, Seaport, Oculus,
  tall ship, and the 58 m-long El viaduct) plus one entry that understated its
  rooftop water tower by 2 m; `sceneDecor` extended with the peninsula (Duane
  St, Bayard St, two South St aprons, Battery Park green out to x 36, Pearl St
  no longer running through the park) and the harbor carved into five rects so
  Castle Clinton and the ferry terminal stand on land — the Castle Clinton
  park plane was being drawn over by the harbor and never rendered at all;
  Hudson marina basin + East River Seaport reach added so the moored boats and
  the tall ship float on water instead of asphalt; asymmetric `sim.boundsRect`
  replaces the square ±80 clamp (~36 m of dead harbor removed); the Battery
  Park hedge row rebuilt on a 0.5 m step (it was 13 isolated cubes); Municipal
  and Courthouse porticoes bridged to their facades and the Wall St bank
  colonnades evened to a 2 m pitch. Validator gained three anti-drift probes:
  per-footprint-cell camera-blocker coverage (≥ 6 m, matching the campaign's
  `world3d.js` cut), a SIZE ≥ 4 progression floor (the mass-scaled ladder is
  now ×10 and had nothing pinning it), and a decor draw-order check.
- 2026-08-02: **Full Lower Manhattan expansion + 5-class kit**. New
  `js/voxelkit.js`: the five object size classes (PROP 0.25 m / VEHICLE
  0.5 m / SMALL_BLDG / LARGE_BLDG / MEGA) with canonical builders extracted
  from `voxelsim.js` (vehicles) and `voxelscene-manhattan.js` (`tower()`);
  both scenes now build from the kit. Manhattan expanded ±40 → ±80,
  11,872 → 25,827 blocks: Seaport/piers/tall ship/heliport (E), Municipal
  Building + courthouse + Chinatown rows + Columbus Park + Tribeca lofts +
  Brooklyn Bridge tower (N), BPC towers + marina + pier shed (W), Fed
  Reserve + NYSE + offices (FiDi), 7 WTC + Oculus (WTC site), Castle
  Clinton + SI Ferry Terminal + orange ferry + Custom House (S). Every
  placement validated per the scene rules; the tower helper's column rule
  hardened (footprints ≥ 8 m need interior columns — an 8×8 masonry slab's
  center cell was 4 hops out once window panes punched the verticals).
  Loading overlay (`BUILDING CITY…`) covers the ~1.3 s scene build (was a
  silent freeze — persona P0). Validator gained a second scripted excursion
  (expansion-district sweep, 213 eaten). ALL PASS.
- 2026-08-02: **Hanging reach scales with hole radius** (playtest: the hole
  "affects buildings further out than the circle is"). The creak zone was
  `remR + span + 1.5` flat — up to ~5.5 m at SIZE 1, vs the ~1 m visible
  ring. Now `remR + (span + 1.5) × radius/6.6`: stress hugs the rim at
  small sizes (~0.5 m out), unchanged at max radius. Probes: intact
  building at 1.5 m/3 m pre-fails nothing (was rim-creak/facade-drop), and
  during excavation the stressed set tracks the current radius (max ~2.5 m
  at r 1.75). Validator ALL PASS.
- 2026-08-02: **Loose-body contact resolution + sleep rework** (playtest:
  blocks clipped through each other and spun in place near buildings).
  `js/voxelsim.js`: new `_resolveDebrisContacts` pass — AABB least-
  penetration separation between grounded/slow debris, sleepers, chunk
  members, and rain (2 relaxation rounds, padded fine-column buckets,
  deterministic pair order). Rim tip-over now requires the hole-facing edge
  to truly overhang the void; attraction only acts on airborne/sliding
  bodies (grounded blocks are exempt); debris sleeps anywhere once slow +
  contact-free (committed after the contact pass — never mid-overlap);
  `_restLoose` lets rubble serve as support so piles solidify bottom-up;
  chunk/debris tumble capped; repose threshold 0.75→1.25×s; recursive
  sleeper-wake crash fixed (`_topRemove` iterates a copy). Probes: frozen
  sleeper overlaps 0, resting overlaps transient-only, spinners 0.
  Manhattan excursion eats 1438 (was 1834 — piles no longer clip into the
  hole); validator ALL PASS.
- 2026-08-02: Sandbox camera see-over-any-building rule (`js/camera.js`):
  `setBlockers` caches the scene's tallest blocker (`maxBlockerH`) and the
  sandbox distance curve smoothstep-ramps from SIZE 4 (r 2.6) so that by
  SIZE 10 (r 5.6) the camera clears it (+8 m margin), clamped just above
  clearance through SIZE 12. Manhattan: ~84 m dist / ~66 m high at SIZE 10+
  (WTC is 58 m); gallery unchanged (no cameraBlockers). Validator ALL PASS.
- 2026-08-02: Hole ring render pass is now depth-test disabled (`depthTest: false`, `depthWrite: false`, `renderOrder: 999`) in both campaign (`js/world3d.js`) and voxel sandbox (`js/voxelworld.js`) — the hole's outer ring indicator remains visible through buildings and structures when occluded.
- 2026-08-01: Settings sliders gained measurement readouts: Turn sensitivity
  shows multiplier + actual turn rate (`0.15 · ~23°/s` — the user's optimal,
  2nd step from min) and Hole speed shows × + actual m/s at SIZE 1
  (`1.4× · ~9.9 m/s`, from `playerSpeedForRadius(1.1) = 7.1`).
- 2026-08-01: **Block-vs-block collision** for the voxel sandbox: a
  solid-surface heightmap (`_top`, per fine column: static + sleeping
  debris) replaces the flat ground plane for falling bodies — debris/chunks
  land on rooftops and stack into piles, an angle-of-repose slide spills
  steep piles outward (the requested "messy"), `_contact` probes make
  chunks shatter on facades + debris wall-scrape + hard hits smash-damage
  what they strike, and sleeping debris registers for wake-on-support-loss
  (piles stack, eaten bases drop what was on them). Probes: 24-block drop
  stacks + spills (not a flat carpet), roof landing at exactly roofTop+s/2.
  Tour eats dip ~5% (2044 vs 2152) as debris piles at rims — intended.
- 2026-08-01: Dev voxel-physics sliders in SETTINGS (schema v7): Gravity
  (26–130), Collapse wave (`WAVE_K` 0.05–1 s/m — higher = slower, more
  readable rim→center sweep), Creak delay (0.25–2× global `mat.delay`
  scale), Hole speed (0.7–3×), Attraction pull (0–20). Live-applied to the
  running sim via `sim.tune` (validator keeps constant defaults). Fixed a
  latent crash: `applySettings` called `world.setShadows` which
  VoxelWorld3D lacks — everything after it in the handler silently skipped
  (this is why live tuning never reached the sim).
- 2026-08-01: Voxel gravity 26 → 65 (2.5×) — playtest: falls read as
  floating. 10 m drop: steel 0.73 → 0.45 s, glass 1.06 → 0.68 s (density
  spread preserved). Harder impacts split/bounce/scatter more — spillier
  collapse, as requested. Tour eats slightly more (2125 → 2152), ALL PASS.
- 2026-08-01: New sandbox level — **Lower Manhattan** (`js/voxelscene-manhattan.js`,
  title → NYC: LOWER MANHATTAN). ~11,900 blocks in a ±40 m world: One WTC
  (3 setback tiers + spire), twin memorial pools, Woolworth-style tower,
  glass slab tower, Wall St bank canyon with porticos, elevated train
  (58 m viaduct + 3-car train), Trinity Church, City Hall, Battery Park +
  Charging Bull, ferry pier, full street-furniture/vehicle set. Engine grew
  a scene option: `bounds` per scene, render-only `sceneDecor` (roads/park/
  harbor), `cameraBlockers` for supertall occlusion, and the SIZE ladder
  scales with scene mass (gallery exactly ×1, Manhattan ×10 at its current
  43.5k mass — it was ×5 before the full-peninsula expansion). Bug-hunted via
  the new validator checks: El-through-tower overlap (ghost cells), lamps
  inside buildings, setback tiers topping out on wall rings (floating base
  slabs), interior-column grid math, El rails one cell past the deck edge,
  and Trinity 9 mm inside the hanging threshold (remR+span+1.5 ≈ 3.55 m).
