# CHANGELOG — Flywheel

Detailed build history, migrated from STATUS.md (which is a lean board, not a
changelog). Newest first. Commit-level history: `git log`.

- 2026-08-12: **Mobile performance pass.** Measured on a Pixel-5 profile at
  4x CPU throttle, then fixed: (1) the six authored city scene modules (1.19
  MB of source between them, Cambridge alone 664 KB) no longer load at boot —
  `js/voxelsim.js` gained an on-demand registry (`await loadScene(id)`, with
  in-flight dedupe; the constructor stays synchronous and throws by name if a
  city was not awaited), and the game start path, menu backdrop, arena, scene
  viewer and tools each fetch exactly the city they build. Static imports put
  most of an 18.6 s throttled cold load in front of the title screen; now the
  title paints with zero city modules fetched. (2) The default quality tier
  is device-aware for exactly as long as the player has not chosen:
  `defaultTierForDevice()` starts coarse-pointer phones on LOW, and the new
  `settings.qualityChosen` marker (deliberately no schema bump — absent reads
  false, which is the true answer for every pre-existing save) flips on the
  first Graphics-detail press, after which the stored tier is the only
  authority. The settings label and the menu backdrop's `tooWeak` both read
  the EFFECTIVE tier, so an unchosen phone is never told it runs HIGH and
  never builds a Brooklyn backdrop it cannot afford. (3) `maxSubSteps` 6 → 2
  on BOTH tiers: six was the arithmetic ceiling `0.1 / FIXED_DT` left
  unexamined, and a device that cannot finish one sub-step in a frame was
  asked for six — measured as a 16x frame-time blowup (Brooklyn at ~1 fps,
  6 s of game time per 60 s of wall clock). The cap lives in `main.js`'s
  real-time catch-up loop, not in `sim.tune`, so HIGH's sim trajectory stays
  byte-identical and the validator is untouched; a struggling device now
  gets steerable slow motion instead of a freeze. (4) `resize` events are
  coalesced to one realloc per frame and dropped when nothing moved (mobile
  browsers fire them continuously through the URL-bar collapse). (5) A
  hidden tab now genuinely stops the loop (no renders, no sim steps, no GPU
  work) and lands a mid-run game on PAUSED, with the accumulator and frame
  clock reset on return. (6) `vercel.json` declares the cache split:
  `/assets/**` immutable for a year, `/js/**` + `/css/**` five minutes with
  a week of stale-while-revalidate. **Same pass:** the three eat gulps are
  now original Flywheel MP3 masters (Nico with Suno) replacing the freesound
  CC0 gulps — `AudioEngine` gained a per-name extension map (`FILE_EXT`), so
  sound names, call sites and tests are unchanged; `CREDITS.json`/`CREDITS.md`
  record the provenance swap. Verified: all headless selftests green (voxelsim
  gravity/multihole, duel, rival, arena 72, net 132 + 48, train-derail 39,
  chicago-probe, audio suites, music-assets), validator pre-Cambridge stages
  clean (Cambridge excursion stall remains the documented open issue,
  RCA-2026-08-11), and the in-browser harness
  (`.playwright-mcp/verify.mjs` + `verify-backdrop.mjs`) proves the lazy
  fetch, resize guard and visibility pause on a live page.

- 2026-08-11: **Rival visibility shipped, phases A–D**
  (`.wiki/features/rival-visibility/`) — the answer to the two-phone
  playtest's "no sense of whose blocks were eaten". New `js/rival/` layer,
  read-only over sim events and wire snapshots (ADR-0002): one per-slot color
  identity table (`identity.js`, 8 slots, blue/orange unchanged for P1/P2), an
  attribution record (block id → eater slot + per-slot raw-mass tallies,
  headless-readable — the future seam for heatmaps/stats), crater tinting
  (each eaten column's ground tile takes its eater's color — one InstancedMesh,
  one draw call, tiles written once on the eat, zero per-frame work), a coarse
  tug-of-war possession bar with no digits during play, an "apart or
  off-screen" rival chevron extending the directional-indicator vocabulary,
  rare milestone callouts (first blood / lead change with hysteresis /
  trailing-at-30s / landmark) through one priority announcement channel, and
  an end-of-match territory reveal (ortho frame eases out over the crater map,
  the bar settles to exact percentages — shown there for the first time — and
  the winner is called from the same attribution record on both screens).
  Wire: **protocol v3** — the keyframe tail is now one eaten-RLE stream per
  occupied slot (codec unchanged, layout framed as `u8 count`, then
  `u8 slot/u16 len/bytes` per stream) so a late joiner or a healing peer
  learns *whose* every crater is; hard version gate unchanged. The hot-seat
  page shares the craters + bar; chevron/callouts skipped there on purpose
  (one screen, two humans). `arena.html?t=<seconds>` shortens the match
  (dev-only, host-side, same idiom as multiplayer.html). New headless suite
  `js/rival/rival.test.mjs` (58 checks: keyframe attribution round-trip,
  territory determinism, beat exactly-once/hysteresis, reveal math, shares,
  edge projection). Patterns 3 (size-as-threat) and 7 (score popups) left as
  planned seams for the 8-player pass.
  **Same pass, from device testing: the arena match camera is now the game's
  progressive follow-zoom**, not the full-city overhead frame — the window
  tracks your own hole and widens as it grows (mirroring the single-player
  sandbox feel), because both phones rendering the whole map and every
  distant collapse at once was the big-city FPS killer. `DuelView` grew a
  dirty-only block sync (full N-instance recompose once at start, then only
  `_falling`/`_leanSet`/`_renderTouch` per frame — the same union
  `VoxelWorld3D._syncBlocks` uses — with movers outside ~2.2× the view span
  skipped in follow mode; their settlement still lands via `_renderTouch`,
  and a wire-fed peer reports eats via `noteConsumed`). The hot-seat page
  keeps its full-city frame (two players, one screen) but inherits the
  dirty-only sync. The full-city frame now appears in the arena ONLY at the
  end reveal, which makes the pull-up the first sight of the whole
  two-colored city — and makes the rival chevron the way you find them
  mid-match.

- 2026-08-06: **Persona playtest remediation.** A five-agent UX playtest
  (ux-tester-personas suite, findings in
  `playtests/2026-08-06-persona-campaign/`, gitignored) scored the shipped
  game at "explains itself ~60%" across 21 findings; this pass fixes 15 of
  them and deliberately defers the rest. Sandbox HUD: the goal readout is now
  live (`CLEARED x% / 50% OF THE CITY · SIZE n`) and visually dominant while
  the coin pill shrinks and loses its unexplained `+2` (`body.mode-sandbox`
  scopes the CSS so the campaign countdown is untouched); the combo pill is
  gated at chain ≥ 26 so "COMBO x1" never renders. Pause: WORLD MAP renamed
  CITIES (no map exists; `showWorldMap()` is a `showTitle()` alias), RESTART
  works in the sandbox via `lastSandboxScene` (it was campaign-gated dead
  UI), and both run-discarding buttons got a two-step inline confirm.
  Onboarding: the READY gate carries a control cheat-sheet (key/tap split),
  SETTINGS shows CONTROLS directly under the first toggles, the CTA reads
  PLAY BROOKLYN, and Brooklyn's tag is START HERE. Persistence: the landing
  screen shows the coin bank (hidden at zero) and per-city `CLEARED ×n · BEST
  SIZE n` records from the existing `save.sandbox` data — no schema change.
  Settings hygiene: dev physics sliders folded into `ADVANCED — CITY FEEL`
  with RESET TO DEFAULTS driven by the newly exported `VOX_DEFAULTS` (spread
  into `defaultSettings()`, so reset and fresh-save defaults share one
  source), and BACK is sticky-bottom in the scrolling panel. Loading: a
  static `#boot-splash` in `index.html` covers the module/CDN load until
  `main.js` removes it; the pause button's ❙❙ text glyph became CSS-drawn
  bars. Camera: a `_introK(1-_introK)` pitch bump keeps the intro dive above
  the roofline mid-zoom — the playtest caught ~1 s of blank wall after GO!
  (zero at hold and settled, so neither end pose changes). A verification
  re-run of two personas scored the build at ~85% (from ~55-60%) and closed
  the last residuals the same day: the READY gate now also states the tier
  rule in one sentence ("EAT WHAT'S SMALLER THAN YOU TO GROW"), the sandbox
  results screen shows the projected coin Bank, and the gallery scene is
  'SANDBOX' on every surface (was 'THE COLLECTION' in three places).
  Deferred by decision: campaign resurrection (retired in a137054), sandbox
  coin minimap, per-prop edibility tint, pacing verdicts (headless
  SwiftShader ran the sim at 5-11% speed; needs a real-GPU pass). Validator
  ALL PASS; browser smoke of every new flow in
  `playtests/.../scripts/smoke-fixes.cjs`.

- 2026-08-06: **Tank controls everywhere — one scheme, campaign and sandbox.**
  The hole now carries a persistent world-space heading owned by
  `js/controls.js`: W/S are throttle along it, A/D rotate the heading itself
  at `ORBIT_RATE × turnSens × size ramp` (sandbox; flat base rate in the
  campaign) — including spinning in place when stationary, so a parked A-press
  visibly turns. Turning only bends the path while also driving, car-style.
  The heading seeds from the live camera yaw on the first move input of a
  level (reset to `null` on every start), so W always starts as "drive
  up-screen"; after that only A/D — or point-to-move, which keeps the heading
  synced to the driven direction — ever change it. Because the camera can no
  longer steer the input, the sandbox chase camera now chases the control
  heading outright (`driveHeading` arg to `ChaseCamera.update`), which makes
  parked spins visible and is identical to the old velocity chase while
  driving (velocity = heading × throttle by construction). The velocity-
  derived target survives as a fallback for heading-less callers. This retired
  the whole camera-relative-basis apparatus: the rising-edge basis latch,
  `onBasisLatch`, and `ChaseCamera.recentre()` (the ratchet mechanism ADR-0007
  guarded against cannot occur when the input never re-adopts the camera yaw —
  see ADR-0008). The heading also rides on the hole for the renderer:
  directional skins (`st.heading`) and bite bearings (`biteFromEvent`'s
  `h.heading`) are live for the first time — both fields existed but had never
  been fed, so A/B Split's left/right axis and the reduced-motion Impressions
  head were silently pinned north. Settings screen relabelled to match:
  "Sandbox turn sensitivity" (the slider scales steering AND orbit, both at
  the printed rate) and a proper tank-controls listing for both modes. The
  sims are untouched — `sim.step` still receives a world-space move vector —
  so determinism, the validator contract, and invariant 3 are unaffected.

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
