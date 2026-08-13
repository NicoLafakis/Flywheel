# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-13

**This is a board, not a changelog** (`.wiki/conventions.md`): a shipped item is
one dated line here, the detailed entry goes in `CHANGELOG.md`, the design
detail in `.wiki/features/*`, and the module truth in `.wiki/modules/*`.
Budget: 5,000 tokens.

---

## Awaiting Nico

Nothing. Every open question on this board has been decided — the sun-elevation,
intro-orbit and T-901 items that used to sit here are recorded below with the
call that closed them.

## In progress

- **Timed Runs & Full Clear** (2026-08-13, owner instruction) — Phases 1-3 are
  landed (see Recent history): the 180 s clock, `targetFraction` 1.0 everywhere,
  ranked score integrity, and honest combo readouts. Package:
  `.wiki/features/timed-runs-and-full-clear/`. Design call recorded there: the
  clock ends the run and the player is scored on the percentage reached, so 100%
  is a scoring ceiling rather than a pass/fail win condition — otherwise every
  city level is an automatic loss. Genre precedent: Hole.io's two-minute match.
  Still open in the package: T-404 map snapshot caching and T-405 wall-clock
  honesty (both listed under Not started), T-308's per-hole combo attribution
  (deferred to ride with T-606 host migration), and the UI polish pass on the
  new readouts.
- **`COMBO_THRESHOLDS[0] = 2` is inert** (found 2026-08-13 during T-312,
  **reported not fixed**). `comboLevel` maps a crossing of `thresholds[i]` to
  level `i+1`, and level 1 is already the floor — so a chain of 2 scores exactly
  what a chain of 0 scores. The published ladder head reads "2, 10, 15" but the
  player only ever feels steps at 10 and 15. Fixing it moves every score in the
  game and needs a `RANKED_SIM_VERSION` bump, so it is the owner's call; it wants
  the same window as the other sim-output changes, while the board holds one run
  and zero claimed names.
- **T-901 failed, and it indicts the engine, not the tune** (2026-08-13). The
  physical-device requirement is retired in favour of the emulated Pixel-5 + 4x
  CPU throttle profile; measured over 13 runs, THE RUN holds a 100 ms median,
  350 ms p95 and **0.231 sim/wall** — a "90-second" run costs 6 min 30 s of real
  time. Both predeclared fallbacks were measured and neither closes a ~4x gap, so
  **neither was applied**. The shortfall is cumulative and debris-driven, which
  makes it the same defect as the validator stall. Evidence:
  `.wiki/findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md`.
- **The debris-drain defect** (T-402, 2026-08-11 diagnosed / 2026-08-13 scoped) —
  the awake-debris population never drains, so per-step cost climbs with elapsed
  route time. One engine defect makes the validator unusable *and* ranked play
  impossible on a phone. It changes sim output, so it wants to land while the
  board holds one run and zero claimed names.

- **The audit system needs rebuilding before it can gate anything** (T-403,
  2026-08-11, reaffirmed 2026-08-13). `node tools/validate.mjs` does not
  complete a run at all: `validateCambridge()`'s 780 s double excursion hits
  superlinear debris churn — the awake-debris population never drains (16 bodies
  at simT 10 s → 738 at 320 s; `_supportBelow` ~32% of CPU), so 93,600 steps
  cost 78 minutes and 2.33 GB, and everything ordered behind it — including
  `validateChicago()` — never runs. **Diagnosed, not fixed**
  (`.wiki/findings/RCA-2026-08-11-cambridge-validator-stall.md`); the same
  mechanism predicts a progressive slowdown in a long Cambridge session on the
  top tier. Owner's call: don't just unstick this one route — replace the audit
  design with something that runs in a usable time, then re-run it. Two blocked
  items are waiting on that re-run: Chicago's end-to-end proof and Brooklyn's
  unfinished code-health audit. Operative gates meanwhile: `tools/chicago-probe.mjs`
  and the per-feature selftests.
- **Code-health audit from the Brooklyn pass** (2026-08-04) — still unfinished
  (*"Seems like you're auto-creating code spaghetti here potentially, but I
  can't tell"*), and now explicitly downstream of the audit-system rebuild
  above. Named suspicions: Brooklyn-only additions living in the *shared*
  `js/voxelkit.js`; two overlapping mechanisms for one job (the positional
  `BROOKLYN_ROAD_SPANS` allowlist vs. declared spans); kit builders nothing
  calls; the pre-`orbitArc` orbit implementation in `js/camera.js`; the original
  full-frame scrim in `css/main.css`, now a local radial pool.
- **Online Flywheel** (2026-08-10) — a real two-device match is live at
  https://flywheel-woad.vercel.app/arena.html, which put Phase 6 ahead of
  Phases 1-5 by product decision. Open: host migration/succession (**T-606** — a
  vanished host freezes the match today, and **T-308**'s per-hole combo
  attribution rides with it by owner's call), server-minted rooms (T-602),
  spectators, more than two seated players (the netcode supports 8, the arena
  page seats 2), accounts, achievements, the four-scope leaderboard. Nothing in
  `js/net/` is reachable from `js/main.js`: `arena.html`, `netdemo.html` and
  `multiplayer.html` are standalone pages outside the state machine.
- **Cambridge sandbox** (2026-08-07) — the ten-district map is complete and
  playable: 72,943 blocks under the 75,000 target, dead ground zero, 814
  generated camera blockers, scripted excursion reaching SIZE 10 against a floor
  of 7. Open: Phase 7's hidden content and ground glyphs, then the Phase 8
  sign-off. Its achievement and belt rows are blocked on the online backend, not
  on the scene.

## Not started

- **Brooklyn voids** (2026-08-04) — the SW corner (exclude via a *declared named
  region*, never by narrowing a probe until it goes green) and the central
  110×12 m band at Z[-16,-4] (needs block headroom; runtime cost unmeasured).
- **Upper Manhattan authoring notes** (2026-08-05, from the rebuild's defect
  pass) — D6 Bethesda's bronze angel reads near-black (`bronze: 0x2c4038` →
  something nearer `0x4f7a68`), D7 Turtle Pond is barely findable, D8 Belvedere
  stands against the CPW wall (inherent — the park is 44 m wide at that
  latitude). Deliberate keeps, not defects: D4 shadow-map aliasing at SIZE 10-12
  (fixing it adds GPU cost exactly at the worst-case frame rate) and D5 the
  game-wide night-lighting read.
- **Campaign polish** — level-by-level visual review (level 2 next, once level 1
  is signed off), crosswalks, moving traffic, roof variety, ground textures,
  fog/grade. No instancing in campaign yet (revisit above ~800 draw calls).
- **Sandbox content** — the twelve gallery builders sitting in `js/voxelkit.js`
  with no callers (delivery truck, school bus, billboard, subway stairs, pier
  deck, mooring bollard, dock cleat, motor launch, helipad, helicopter, fine
  tower, fine warehouse), density re-skins of existing buildings, possibly
  moving traffic and pedestrians. Driven by playtesting.
- **Audio gaps** (2026-08-12) — no distance feed for the arena *peer* (its sim
  never steps, so a flat train bed), `debris-metal.ogg` still loaded but
  unheard, and no objective LUFS/true-peak analysis until there is a tool for it.
- **Deferred perf** — Upper Manhattan's worst collapse (SIZE 8 into the CPW
  wall) still has a 101 ms p95 against a fast 16.6 ms median; the `roads` decor
  colour `0x1c2030` reads as near-black gashes through the park.
- **Tests** — nothing beyond the validator and the per-feature selftests; UI
  untested except the smoke path.
- **Map snapshot caching** (T-404, 2026-08-13) — a Chicago build costs ~34 s on
  the throttled profile, paid before every RUN and again on every RUN AGAIN. Maps
  are deterministic and identical for every player, so the fix is a precomputed
  static asset plus a client-side cache, not per-user Supabase storage and not an
  accounts feature. Measure before building: the win is real only if hydrating
  the blob beats the grid writes it replaces.
- **Wall-clock honesty** (T-405, 2026-08-13) — "90 seconds" and now "3 minutes"
  are sim time. Even the unthrottled emulated phone finishes a 90 s ranked run in
  100.5 s. Verification is unaffected; the player-facing framing is not the
  player's time.
- **Preserve the T-901 harness** (T-401, 2026-08-13) — the 13-run measurement
  harness lives in a session-scoped scratchpad and will evaporate. It blocks any
  re-measure, so it moves into `tools/` first.

## Established facts — measured, don't re-derive

- **Sun elevation is 54.20° and is already shared by every city** (verified
  2026-08-13). One constant governs all seven voxel scenes —
  `SUN_DIR = (30, 50, 20).normalize()` at `js/voxelworld.js:219` — and no scene
  overrides it, so Brooklyn's sun *is* every city's sun. Owner's decision
  2026-08-13: keep it; the 32° alternative is declined. No code change was
  needed. (The retired campaign renderer, `js/world3d.js:326`, is separately at
  58.0°; it is unreachable from the game.)
- **Intro orbit is not a gameplay decision** (closed 2026-08-13, owner: "it has
  nothing to do with the actual operation of the game"). Recorded for whoever
  next touches `js/camera.js`: shipped `orbitArc: ±30` gives 12.19% coverage,
  ±20 gives 15.16%, static gives 24.22%, and apparent orbit speed is identical
  at every arc — so ±20 dominates ±30 if anyone ever revisits it.
- **UNBOUND show dates and booth duration are unpinned** (2026-08-10, noted not
  blocking). Several capacity and traffic figures in
  `.wiki/features/online-flywheel/08-rollout-and-runbook.md` and
  `11-risk-register.md` assume a duration that has never been fixed to real
  dates. Not an engineering blocker.
- **The Supabase backend is real and applied** (verified 2026-08-13 against
  project `flywheel` / `zrsrvhrkgfuqhcjnjezw`). All four scoreboards migrations
  are applied server-side (`scoreboards_profiles`, `harden_scoreboards`,
  `add_overall_board_rank`, `extend_submission_log_rate_kinds`); ten tables
  exist with RLS enabled on every one; the security advisors return **zero**
  lints; and the pipeline has been exercised end to end (1 run, 1 run_input,
  1 ticket, 4 submission_log rows). No player has claimed a name yet.
- **There is no user login, by design** (ADR-0017). A profile is a display name
  plus a server-minted, device-held bearer token with transfer, report,
  moderation and deletion flows — no account, no email, no sign-in. Nothing is
  missing here; see `.wiki/features/scoreboards-and-profiles/05-identity-and-names.md`.
- **The scene build is NOT superlinear** (2026-08-05). Round-robin, min-of-9:
  gallery 3,798 blocks / 169 ms · upper 8,442 / 570 ms · manhattan 25,875 /
  2,521 ms · brooklyn 39,984 / **4,051 ms** (not 12.4 s). Exponent 1.15 against
  *fine volume*; cost is linear in total fine volume, as `_addBlock`
  (`js/voxelsim.js:188`, writes `fs³` cells) and `_buildNeighbors` (`:516`,
  probes `6·fs²`) imply. The earlier "exponent ≈ 2.08" claim was loaded-box
  noise and is retracted.
- **There is no 40k block ceiling** (2026-08-05). `js/voxelworld.js:377` sizes
  each `InstancedMesh` to `list.length`, and draw calls scale with
  (material × size) buckets, not block count. Upper Manhattan at 73,393 blocks
  draws 30 calls from 22 buckets — *fewer* than Brooklyn's 39,984 blocks
  (26 buckets, 34-37 calls).
- **Perf measurement precondition** (2026-08-05). This box showed 2.0-2.6×
  median/min noise and a 40 s outlier on a 2.5 s build while agents were live.
  No perf number is quotable until the tree is still; min-of-N round-robin is
  the minimum acceptable instrument (`probe-buildcost2.mjs`; v1 is kept as the
  broken-instrument counterexample).
- **Brooklyn last known good** (2026-08-04): `blocks=39984 mass=65346 eaten=530
  size=4 blockers=510`, validator ALL PASS, 0 of 32 spawn headings dead.
- **Shipped intro pose** (2026-08-05): desktop yaw 90°, 238.6 m; portrait yaw 0°,
  521.4 m; worst-in-arc ndc 0.591/0.805 — nothing crops.
- **"The establishing shot got 38% darker" is retracted** (2026-08-05): luma
  across 48 poses ranges only 36.08-40.11 and the shipped pose is the brightest
  candidate — re-measure before acting on any darkening report. The latent bug
  found underneath it was real and is fixed by construction: the yaw search
  swept `[0, π)` while lighting is period-2π, so it could return the unlit
  member of an antipodal pair; a Lambertian term (r = 0.851 against measured
  luma) now disambiguates.

## Current state

**Brand** — *Flywheel — A sprocket's story*. The title screen is the branded
landing screen (rotating voxel sprocket, block wordmark, one PLAY pill, grouped
free-play city picker, live city backdrop); the wordmark and the READY gate draw
from one shared brand layer (`js/ui/blockword.js`, `--fw-*` tokens). The world
map and level select are deliberately still on the old treatment.

**Progression** — the campaign is no longer reachable from the game. City
sandboxes are replayable goal runs: shared establishing overview → READY zoom, a
180 s clock (`js/levelclock.js`, the one declaration both the campaign and the
sandbox read), the whole map as the goal, 60 deterministic coins, 2 coins per
pickup plus a 35-coin completion bonus (which makes the skin shelf a long-term
goal, not a one-session unlock). The clock, not the goal, ends the run: expiry
is a normal ending that lands on the results screen carrying the percentage
reached, and 100% is a scoring ceiling rather than a pass/fail condition.

**Scenes** — seven, all reachable from the title menu, all loaded on demand
(`await loadScene(id)`); detail in `.wiki/modules/voxel.md`: gallery (~3,800
blocks), Lower Manhattan (~25,800), Brooklyn (~39,980 — the showcase scene, the
only one with the establishing shot and READY gate), Chicago Loop (44,578,
rebuilt on the Cambridge method 2026-08-11, with a simulated el train that
derails at eaten track and can be eaten), Boston, Cambridge (72,943), Upper
Manhattan (73,393 — the largest).

**Sim & render** — 5-class content kit (`js/voxelkit.js`, 46+ builders shared
across the built cities), `js/voxelforms.js`'s twelve construction primitives
(ADR-0013: a block is an axis-aligned box, and the same change *lowered* draw
calls), rim-driven excavation, persistent-damage crumble, loose-body contact
resolution, SIZE-scaled hanging reach, structural-zone support recalculation
(the fix that made 73k blocks playable at 60 fps), hole-rim GLSL clipping,
dirty-set renderer skip plus `setPerfMode`.

**Controls** — tank everywhere: W/S throttle, A/D heading steer, Q/E orbit, R/F
zoom, spin in place when parked, plus the welded heading pointer that makes the
heading visible. Mobile is joystick direct-steer plus touch orbit. The chase
camera pulls in through building occlusion.

**Saves** — localStorage schema v17 (migrations v1→v17, quarantine). Board
tokens sit deliberately outside the save, and the bounded outbox preserves
ticketed RUNs across a reconnect.

**Boards** — THE RUN (Chicago, 90 s / 5,400 ticks, server-issued seed, one
pinned tune), replay codec and deterministic verifier, public city and overall
records, optional names with transfer, reporting, operator moderation and
player-requested deletion. Local city clears stay device-local and are never
ranked.

**Audio** — `js/audio/` voices every surface in both the main game and the
arena; ten original streamed music cues across menu, shop, the six authored
cities, pause and results, with Gallery deliberately silent; music volume is
persisted separately under the existing mute/master controls.

**Quality** — a strict player-chosen HIGH/LOW binary; phones default to LOW
until SETTINGS is opened (`qualityChosen`), after which the stored tier is the
only authority.

## Recent history

One line per shipped item, newest first. Full detail lives in `CHANGELOG.md`,
the feature packages under `.wiki/features/`, and `git log` — not here.

- 2026-08-13 — Score integrity & honest combo readouts (T-301..T-312, closing the
  release blocker): `RANKED_TUNE` made a complete, double-locked physics
  description and every physics lever gated on `!sim.tuneLocked`; the server now
  compares its replayed score against the claimed one; the arena decides the
  match on the points it prints (**the score wins**, ADR-0015) and the tug bar is
  labelled `TERRITORY`; protocol v4 widens `mass_q` to u32 (the u16 clamped a
  peer's readable score at 16,383.75 against a 14,709.5 route bound); every combo
  readout states its unit and the true 8x ceiling is a number, not `MAX`; the
  validator's tautological ladder assertion is replaced by a literal table with
  source guards over the whole readout inventory, all proven against a
  deliberately broken build
- 2026-08-13 — Timed Runs & Full Clear phases 1-2: the 180 s clock
  (`js/levelclock.js`) and `targetFraction` 1.0 on every scene
- 2026-08-12 — Scoreboards & Profiles: THE RUN, replay-verified boards,
  device-token names, Vercel API, four Supabase migrations, save v17
- 2026-08-12 — Mobile perf: on-demand city modules, device-aware default tier,
  `maxSubSteps` 6 → 2, coalesced resize, hidden-tab pause, `vercel.json` cache
  policy; the three eat gulps swapped to original masters
- 2026-08-12 — Menu: live city backdrop, one primary target, player progress
- 2026-08-11 — Original game music: ten streamed cues, stinger ducking,
  independent Music volume, main-game and arena lifecycle
- 2026-08-11 — Chicago Loop rebuilt on the Cambridge method (44,578 blocks) with
  a simulated, derailable el train; menu- and arena-reachable
- 2026-08-11 — Rival visibility A-D: protocol v3 attribution, player-coloured
  craters, tug-of-war bar, chevron, milestone callouts, end-of-match reveal
- 2026-08-10 — Live multiplayer end to end: `sim.holes[]` roster,
  `js/net/host.js` + `peer.js`, `arena.html` over Supabase Realtime, proven in a
  real two-device match
- 2026-08-10 — Score, combo and hype (ADR-0015): count-up score plate,
  real-multiplier combo ring, table-driven ladder, points-only ruling, save v16
- 2026-08-09 — Nav indicator skins (6) and shop expansion (save v15); rim-welded
  chevron heading pointer
- 2026-08-09 — Gallery 100% consumption goal, hole-rim clipping shader, funnel
  suction and crumble dust
- 2026-08-08 — Quality collapsed to a player-chosen HIGH/LOW binary (save v14);
  auto-detection and the frame-time watchdog deleted
- 2026-08-07 — Cambridge map complete (ADR-0013 boxes plus `js/voxelforms.js`);
  tank controls kept after a live four-scheme A/B; `_capDebris` physics fixes
- 2026-08-06 — Persona playtest remediation: 21 findings from a five-agent UX
  audit
- 2026-08-05 — Upper Manhattan full rebuild (8,442 → 73,393 blocks) plus the
  structural-zone sim fix that made it 60 fps
- 2026-08-04 — Rebrand to Flywheel — A sprocket's story; Brooklyn scene, intro
  camera and READY gate
- Older: `CHANGELOG.md`

## Process notes

- Four parallel agents on work this size produced real coordination waste: stale
  numbers relayed from a task description instead of from the owner, and a
  decision (±30) invalidated by a change landing underneath it. Fewer agents.
- Do not quote a task description as a measurement. Ask the owner.
- Commit path is gated: stage explicitly → `py ~/.claude/scripts/sop_attest.py`
  → standalone `git commit`. Never `git add -A`. Multiline messages via a
  scratchpad file and `git commit -F <abs-path>`.
