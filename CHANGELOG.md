# CHANGELOG — Flywheel

Detailed build history, migrated from STATUS.md (which is a lean board, not a
changelog). Newest first. Commit-level history: `git log`.

- 2026-08-13: **Four findings closed, not filed** (Phase 5 of
  `.wiki/features/timed-runs-and-full-clear/`, T-501..T-504 — the out-of-scope
  defects Phase 3 raised).
  (1) **The head of the combo ladder did nothing.** `comboLevel` mapped a
  crossing of `COMBO_THRESHOLDS[i]` to level `i + 1`, and level 1 is the floor,
  so crossing index 0 awarded what a chain of 0 already had: a chain of 2 scored
  exactly what a chain of 0 scored while the game published a step at 2. The
  defect was structural, not a bad number — **any** value at index 0 was inert,
  so re-tuning `2` to `5` would have fixed nothing. The entry is dropped, the
  mapping is `level = i + 2`, and `COMBO_MAX_LEVEL` is `length + 1` (the x1
  floor is a level with no threshold). Every rung x1..x8 keeps its exact chain
  range, so **no score moved and there is no `RANKED_SIM_VERSION` implication**.
  Proven twice over: the 27-row literal chain→multiplier table in
  `tools/validate.mjs` passes **unedited**, and six scripted routes replay
  bit-identically — gallery 19,149 (peak chain 601, so it crosses the top rung),
  Manhattan 23,175 (peak 1,526), its district excursion 5,025, Brooklyn 6,397,
  Boston 12,957, Chicago 7,228. A new guard asks the ladder FUNCTION whether
  each threshold changes the payout, rather than checking the index arithmetic
  that caused the bug.
  (2) **The stored stat says which quantity it holds.** `runs.stats.best_combo`
  was a chain COUNT under a multiplier's name — the schema-level twin of the
  readout defect T-309/T-311 closed, and the first surface to render it would
  have printed 530 against a ladder that stops at x8. Renamed to `best_chain`
  in `api/_verify.mjs` (its only writer; there is no reader) with an idempotent
  jsonb migration for existing rows. The multiplier that chain bought is
  deliberately not stored beside it: it is `comboMult(best_chain)`, derived by
  the same ladder every other surface reads.
  (3) **The finish bonus is paid for finishing.** `SANDBOX_GOAL_BONUS` was added
  to the coin payout unconditionally, so a run that ran out of clock at 3% of
  the city collected +35 for reaching a goal it never reached — on a screen
  whose own heading read "TIME'S UP". Harmless while reaching the goal was the
  only way to end a sandbox run; a live payout bug from the moment the 180 s
  clock made timing out the ordinary ending. Gated on `sim.won`, the same latch
  the heading and the percentage read. The row is **absent** when unearned
  rather than showing "+0" — and the same rule now applies one row down, because
  gating only the bonus left `Coins earned +0` on the screen of a run that
  collected nothing, which reads as a broken game rather than an honest nil.
  Measured end to end: a timed-out run banks `coins × 2`, a full clear banks
  `coins × 2 + 35`, and the bank moves by exactly the number the screen printed.
  (4) **One countdown, in the pill built for it.** THE RUN wrote its clock into
  `#timer` — the sandbox's coin readout — while `#level-clock` sat hidden
  (`sim.timeLeft` is null in run90). So the one mode whose length is a decision
  of record rendered its countdown in a pill with no endgame states, and the
  coin readout vanished for the whole run. `index.html`'s own comment had
  already warned that "one element cannot be both without one of them
  disappearing". The countdown now goes to `#level-clock` in every mode, derived
  from `RANKED_TICK_COUNT` rather than a literal 90 — as does the RUN results
  screen's "Clock 90.0 s", found while proving this and closed with it, since a
  length stated in three places is a length that will disagree in one. `#timer`
  no longer ships holding `75`, the start value of the campaign clock ramp R-1.1
  retired. The proof COUNTS visible countdowns in the browser rather than
  reading one of them, because a probe that reads `#timer` passes just as
  happily with a second contradictory clock beside it.
  Every guard above was run against a deliberately broken build first — HEAD's
  own files restored one at a time, plus the near-miss forms (the inert entry
  re-tuned instead of removed; the mapping left at `i + 1`, which the literal
  table catches as 23 moved scores; the money gated but the copy left
  unconditional) — and every one failed before it passed.
- 2026-08-13: **Score integrity and honest combo readouts** (Phase 3 of
  `.wiki/features/timed-runs-and-full-clear/`, closing
  `.wiki/findings/RCA-2026-08-13-scoring-and-combo-audit.md`).
  (1) **The ranked release blocker.** `RANKED_TUNE` is now a COMPLETE physics
  description — it names `perfMode` too — and a `run90` sim's `tune` is
  replaced rather than merged, then double-locked (`Object.freeze` on the
  object, `writable: false` on the property, so `sim.tune = {…}` is refused as
  well as `sim.tune.x = 1`). `Object.assign` could never clear a key its source
  lacked, which is exactly how SETTINGS → "Smoother play" leaked into ranked
  physics. `js/main.js` gates every physics lever on `!sim.tuneLocked` while
  still applying RENDER quality, and the server asserts the tune instead of
  assigning it (`unverifiable`, not `mismatch` — a build problem is not the
  player's fault). Measured: server 2231.9625, hostile client 2231.9625
  (delta 0), pre-fix client 2247.9250. Driving all 19 controls on the pause
  SETTINGS screen mid-run moves nothing; the same routine moves five tune keys
  on a free-play sim. **No `RANKED_SIM_VERSION` bump**: adding `perfMode: false`
  leaves the server byte-identical (`undefined` and `false` take the same
  branch), so stored traces replay to the same verdicts.
  (2) **The server compares the two numbers it always had.** A claimed score
  that disagrees with the replayed one is a `score` mismatch at zero tolerance,
  and the claim is recorded either way — including on the `unranked` placement
  gate, whose trust boundary is now written down rather than re-derived.
  (3) **The arena judges the currency it prints.** THE SCORE WINS: the winner
  comes off the combo-multiplied points on screen, not `finalSplit().mass`.
  ADR-0015 already ruled that the combo buys score and the boards rank score;
  if raw mass decided the match, a combo would carry no competitive meaning in
  the one mode where you are beating someone. The tug bar keeps showing
  raw-mass territory and now says `TERRITORY` so it cannot be read as the score.
  (4) **Protocol v4.** The per-hole `mass_q` field went u16 → u32 (a hole is 12
  bytes, a worked-example snapshot 156). The u16 clamped a peer's readable score
  at 16383.75 while the shipped 180 s Chicago route scores 7,425 — 14,709.5 if
  every block it ate had landed at the 8x ceiling, so the old cap sat at 1.11x
  the hard bound of a route we ship. New cap 1,073,741,823.75 = 1082x the
  whole-city-at-8x bound of 992,377.
  (5) **Every combo readout states its unit.** `Best combo x47` on the campaign
  results screen and `COMBO x47` on the campaign HUD pill were chain counts in
  multiplier notation against a ladder that caps at **3.0**; both now read
  `47 eats at x3.0` off `comboMultiplier`. The RUN and sandbox results say
  `530 eats at x7`. The HUD ring's big number — the largest text in the HUD —
  carries a `CHAIN` unit under it. `COMBO_LEVEL_NAMES` numbers its top rung
  `x8` instead of naming it `MAX`, so the real ceiling is finally shown; the
  summit reads as the summit through a paint-only `topped` state instead of a
  label sitting over a number that keeps climbing.
  (6) **The validator's tautology is gone.** The load-bearing combo assertion
  compared `comboMult(c)` against that function's own inlined body and passed on
  any code — proven: it reports ALL PASS on a ladder paying x50. It is replaced
  by a literal chain→multiplier table transcribed from the ruling, and the
  source guards now cover the whole audit B2 inventory (hud, screens, arena,
  index.html, arena.html) plus the float-layout trap that two `<b>` values in
  one results row renders in reverse. All ten breakages were run against a
  deliberately broken tree first and every one failed. `FW_VALIDATE_SECTIONS`
  lets a single section run, since the full validator still stalls in
  `validateCambridge`.
- 2026-08-13: **The 180 s clock and the full-clear goal** (Phases 1–2 of
  `.wiki/features/timed-runs-and-full-clear/`). (1) New pure module
  `js/levelclock.js` holds the ONE declaration — `LEVEL_CLOCK_SECONDS = 180`,
  its tick count, the 30 s/10 s endgame thresholds and `formatClock()`. It has
  zero imports on purpose: the campaign chain (`levels.js` → `sim.js`) and the
  sandbox (`voxelsim.js`, which `api/_verify.mjs` also imports) must both read
  it without dragging each other in. `js/levels.js` dropped its
  `75 + g*0.75 + metroIndex*3` formula; all 100 levels now carry the constant.
  Knock-on: `js/citygen.js` times tides at `level.clock * (0.35 + i*0.25)`, a
  DERIVED value, so campaign tides fire later in absolute seconds — a campaign
  sim-output change that does not touch `sim_version` (ranked `run90` only).
  (2) City runs had no timer at all and now have one. `VoxelSandboxSim` counts
  `clockTicks` (ticks, not accumulated float seconds, so expiry is bit-exact
  and device-independent) and sets `timedOut` + `over` at 10,800. The block
  sits after the goal/win check — a full clear on the final tick is a win — and
  after the `run90` early return, so THE RUN is untouched and its `clockLimit`
  is `null`. (3) Expiry is a NORMAL ending: it lands on the results screen
  under `TIME'S UP` carrying the percentage reached, score, best chain and
  coins. Not a failure state. (4) `GOALS` → exported `SCENE_GOALS`, with
  `targetFraction: 1.0` on all seven scenes. 100% is a scoring ceiling, not a
  win condition. The sweep past the literal `0.5` mattered more than the
  constant: `js/ui/hud.js` compared `cleared >= targetFraction`, which had half
  a city of slack at 0.5 and becomes the exact expression the sim needs a 1e-9
  epsilon for at 1.0 — it now reads the `sim.won` latch, or a real full clear
  would sit on "CLEARED 99%" forever. `js/save.js` v18 splits `completions`
  (full clears only) from the new `runs` (finished runs) and adds
  `bestPercent`; `bestTime` is only set on a win, since a timed-out run always
  takes exactly the clock and would otherwise drive every scene to 180. The
  city chips, RECORDS history and results screen follow that split. Nothing was
  needed on the back end — `api/_verify.mjs` already reports
  `rawMass / totalMass` over the whole map and no board view names a fraction.
  (5) New HUD pill `#level-clock` (its own element: `#timer` is already the
  sandbox coin readout and the campaign countdown), built from existing
  `--fw-*` tokens, with `.warn`/`.urgent` states; both reduced-motion paths
  (OS media query and the in-game `body.reduced-motion` setting) drop the pulse
  and keep the colour and size step. (6) `tools/validate.mjs` gained
  `validateLevelClock()` and `validateScenesWinnable()` — the latter replaces
  the gallery-only guard and consumes every block of all seven scenes in radial
  order, because the epsilon it is testing only fails in some consumption
  orders.

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
