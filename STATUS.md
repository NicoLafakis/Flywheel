# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-11

---

## Open items — read this first

### Code health — unfinished audit from the Brooklyn pass

Brooklyn, the intro camera, the READY gate, and the performance pass all
shipped. The spaghetti audit Nico asked for did not finish before they did:
*"Seems like you're auto-creating code spaghetti here potentially, but I can't
tell."* It still needs doing. Specific suspicions worth checking by hand:

- `js/voxelkit.js` is **shared** across all three built-city sandbox scenes
  now (Brooklyn, Lower Manhattan, Upper Manhattan — the Upper Manhattan
  rebuild added 32 more builders to it). Anything Brooklyn-only added there
  still does not belong in a shared kit.
- Possible **two overlapping mechanisms for the same job**: the positional
  `BROOKLYN_ROAD_SPANS` allowlist vs. the declared-span approach.
- Kit builders that nothing calls.
- Leftovers from replaced approaches: the pre-`orbitArc` orbit implementation
  in `camera.js`; the original full-frame scrim in `css/main.css` before it
  became a local radial pool.
- ~~`js/voxelscene-brooklyn.js:667` and `:672` assert a "40k block ceiling"~~
  **Fixed 2026-08-05**, incidentally, while documenting the Upper Manhattan
  rebuild: both comments rewritten to describe their real reason (a fine-cell
  clash / a density choice) instead of the nonexistent ceiling.

### Established facts (measured, trust these)

- **The scene build is NOT superlinear.** An earlier "exponent ≈ 2.08,
  something is quadratic" claim was measurement noise from a loaded box and is
  retracted. Round-robin, min-of-9: gallery 3,798 blocks / 169 ms · upper
  8,442 / 570 ms · manhattan 25,875 / 2,521 ms · brooklyn 39,984 / **4,051 ms**
  (not 12.4 s). Exponent 1.15 vs *fine volume*; per-fine-cell cost is flat to
  1.47× where per-block cost spreads 2.27×. Cost is linear in total fine
  volume, as the code implies — `_addBlock` (`voxelsim.js:188`) writes `fs³`
  grid cells, `_buildNeighbors` (`:516`) probes `6·fs²`.
- **There is no 40k block ceiling.** The only occurrences in the repo were
  those two comments (fixed 2026-08-05). `voxelworld.js:377` sizes each
  `InstancedMesh` to `list.length`, and draw calls scale with (material × size)
  buckets, not block count. +2,000 blocks ≈ +203 ms build, 0 extra draw calls.
  Upper Manhattan proves this at 73,393 blocks: 22 buckets, 30 draw calls,
  *fewer* than Brooklyn's 39,984-block scene (26 buckets, 34-37 calls).
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
- **The "establishing shot got 38% darker" diagnosis is retracted.** Measured
  luma across 48 poses ranges only 36.08–40.11, and the shipped pose is the
  brightest candidate. Re-measure before acting on any darkening report.
- **Latent yaw-antipode bug found under it, now fixed by construction:** the
  yaw search swept `[0, π)` while lighting is period-2π, so it could return
  the unlit member of an antipodal pair. A Lambertian lighting term
  (r = 0.851 against measured luma) now disambiguates.

### Online Flywheel — the live arena shipped 2026-08-10, ahead of the plan's own order

`.wiki/features/online-flywheel/` (16 docs) plus ADRs 0009-0012 landed
2026-08-06 as paperwork only. 2026-08-10 took it from paperwork through a
standalone wire layer all the way to **a real, live, two-device match** in
one day, by product decision (Nico chose "two phones ASAP" over building
Phases 1-5 first) — so Phase 6 (the live arena, `13-tasks.md`) is
substantially ahead of Phases 1-5:

- **Multi-hole sim**: `VoxelSandboxSim` now runs `sim.holes[]` (roster) with
  a `sim.hole` back-compat alias, union-based support recalc, and an
  array-move `step()` signature. The hot-seat duel demo (`multiplayer.html`)
  is now native two-hole instead of its old dt-slicing hack. New test:
  `js/voxelsim.multihole.test.mjs`.
- **Netcode wired end to end**: `js/net/host.js` (promoted to the real
  authority loop) and the new `js/net/peer.js` (follower loop — prediction,
  banded reconciliation, keyframe healing) proven over a loopback demo page
  (`netdemo.html`) — `tools/net-match-selftest.mjs`, 48 checks incl. a
  bit-exact host replay.
- **Live multiplayer, real project**: `js/net/arena.js` (T-603, the minimal
  cut — 5-char room codes, JOIN/WELCOME/REJECT/ROSTER handshake, no
  server-side room minting yet) plus `js/vendor/supabase-realtime.module.js`
  (vendored same-origin, ADR-0014 pattern) and `arena.html` + `js/demo/arena.js`
  (HOST A CITY / JOIN A CITY, invite links, touch steering). **Proven live**:
  a two-browser-context match played to completion at
  https://flywheel-woad.vercel.app/arena.html. `tools/arena-selftest.mjs`
  (48/48 offline) and `tools/net-live-selftest.mjs` (18/18 against the real
  project, kept out of default chains).
- See `.wiki/architecture.md`'s Boundaries section and
  `.wiki/features/online-flywheel/13-tasks.md`'s Phase 6 section for the
  file-by-file detail and what's still open.

**Still open, named so nobody re-derives it:** host migration/succession
(T-606 — a vanished host freezes the match today), server-minted rooms
(T-602), spectators, more than two seated players (the netcode itself
supports up to 8; the arena page seats 2), accounts, achievements, and the
four-scope leaderboard. None of `js/net/` is called from `js/main.js` or any
campaign/sandbox screen — `arena.html`/`netdemo.html`/`multiplayer.html` are
all standalone pages outside the state machine.

**Credential handover is done as of 2026-08-10** — the item that used to block
everything is cleared:

1. ~~**Credential handover**~~ **Done 2026-08-10.** Supabase project `flywheel`
   (ref `zrsrvhrkgfuqhcjnjezw`, us-east-1, Pro plan) and Vercel project
   `flywheel` (live at https://flywheel-woad.vercel.app, GitHub-connected, push
   to `main` auto-deploys) both exist. Credentials live in the repo's
   gitignored `.env.local`; variable names are documented in `.env.example`.
   Google and HubSpot sign-in credentials are still open — see
   `.wiki/features/online-flywheel/SETUP-FOR-NICO.md` sections 3-5.
2. ~~**Supabase plan choice**~~ **Settled.** The project was created on Pro
   ($25/month, confirmed — not the $10/month figure from an earlier
   conversation, which was one line item inside the real total).
3. **UNBOUND show dates and booth duration** — still open. Several
   capacity/traffic figures in the planning docs (see `08-rollout-and-runbook.md`
   and `11-risk-register.md`) depend on how long the booth runs and haven't
   been pinned to real dates yet.

### Cambridge sandbox — the map is complete and playable

A sixth voxel sandbox scene centred on HubSpot's real Cambridge, MA HQ (2 Canal
Park + the Davenport) for UNBOUND, planned in `.wiki/features/cambridge-sandbox/`
(6 docs) plus ADR-0013, which is **accepted and shipped**: a block is now an
axis-aligned box rather than a cube.

Built and committed: the anisotropic-extent change through `voxelsim.js` /
`voxelworld.js` / the validator, the twelve-primitive layer `js/voxelforms.js`,
the render bucket-key win, scene-declared coin anchors, the four new validator
probes (grade diagonal, placement step, per-district density, hero identity),
the scene's registration, and **all ten districts** —
`js/voxelscene-cambridge.js` is ~11,000 lines. The scene loads from the landing
screen's free-play picker and `node tools/validate.mjs` reaches `ALL PASS`:
72,943 blocks against the under-75,000 target, dead ground zero, 814 generated
camera blockers, and the scripted excursion reaching SIZE 10 against a floor of 7
(the floor is the SIZE this route reached before the ADR-0015 ladder rebase; the
route now clears it by three levels because the rebased thresholds are set by
Manhattan, whose excursion leaned hardest on the old combo multiplier).

Ahead: Phase 7's hidden content, glyphs and achievement rows, then the Phase 8
sign-off. Phase 7's achievement and belt rows are blocked on the online-Flywheel
backend prerequisites already tracked above, not on anything in this scene.

The vocabulary page carries the owner's **scale rule** (2026-08-07): piece size
follows building size — a landmark tower is solid columns + per-bay slabs +
curtain panels, hundreds of blocks and never 20,000 cubes, same look, no toy
models. The **block budget is a target to come in under, not a quota**: aim
below 75,000 blocks for the finished scene, lower is better, and going over is
the cue to build some buildings more efficiently rather than to thin the map.
Density, not block count, is what the validator actually checks. See
`.wiki/modules/voxel.md` and `05-build-tasks.md` for the live task state.

### Awaiting Nico — two decisions, neither answered

*(The construction-vocabulary question that used to sit at the top of this list
is answered and off it. ADR-0013 was accepted 2026-08-07 and the work has
shipped: a block is now an axis-aligned box, and `js/voxelforms.js` gives each
building its own construction vocabulary — twelve named primitives, so one
facade is columns and per-bay slabs and the next is brick courses. The
draw-call caution that made it a question turned out to be the opposite of a
problem: the renderer's bucket key was reworked as part of the same change, and
draw calls went down, not up. See the Cambridge section above.)*

1. **Sun elevation** — leave at 54.2°, or drop to 32°? New information: the
   intro's lighting term reads the renderer's actual light via `sunDirOf()`
   rather than assuming a constant, and it gets more decisive as the sun drops
   (lit spread 0.758 at 54.2°, 0.868 at 32°, 0.917 at 20°). At 32° the portrait
   hold pose would move from yaw 0° to 15° on its own, no code change. So this
   decision now also improves the mobile establishing shot for free.
2. **Intro orbit** — motion at ±30° (shipped, 12.19%) or static (24.22%)?
   A ±20° option exists at 15.16%; apparent orbit speed is now identical at
   every arc, so ±20 dominates ±30 on coverage. Gated on an unmeasured check:
   whether the arc endpoint eases or snaps.

### Chicago Loop sandbox — map built and wired into free play

Chicago is now the seventh real-world voxel scene: `js/voxelscene-chicago.js`
is registered in `voxelsim.js`, `AUTHORED_SCENES`, `FREE_PLAY`, and the shared
validator contract. It is a compressed Loop/River map rather than a literal
survey: Willis Tower's bundled setbacks and aerials, the Board of Trade,
Marina City, the Chicago Theatre blade, Cloud Gate / Millennium Park, the
Riverwalk, bridges, and a complete elevated Loop frame the playable route.
The 'L' keeps Cambridge's proven structural sequence — bent, deck, rails,
car floor, window posts, roof — while changing its livery and closing it into
the Loop.

The map is 23,151 blocks / 236,224 mass with 60 authored coins and 106
generated camera blockers. Its sidewalk promenade route cleared 1,137 pieces,
reached SIZE 7, and kept finite positions; a three-second idle simulation left
all 23,151 blocks static and an ownership scan found zero overwritten fine
cells. Reference points were checked against [CTA's Loop facts and map](https://www.transitchicago.com/facts/),
[Willis Tower's history](https://www.willistower.com/about?c=0&p=1), and
current Chicago imagery. The full `node tools/validate.mjs` suite was launched
twice (10- and 20-minute allowances): its pre-Chicago stages reported no
failure, but the existing Cambridge excursion did not complete before either
shell limit. Re-run it on a quiet machine before committing; the Chicago-only
structural and route checks above are current.

### Not started
- Brooklyn voids: SW corner (exclude via a *declared named region*, never by
  narrowing a probe until it goes green) and the central 110×12 m band at
  Z[-16,-4] (needs block headroom; runtime cost still unmeasured).
- **Upper Manhattan, retired from Not started 2026-08-05**: the "11 Upper
  Manhattan defects" item is gone because the scene those defects described no
  longer exists — `js/voxelscene-upper-manhattan.js` was a full rewrite
  (8,442 → 73,393 blocks, entirely new geography), so item-by-item carryover
  isn't meaningful. The rebuild got its own independent, measurement-based
  defect pass instead (screenshots + raycasts + A/B diff against the pre-pass
  tree): 8 visual defects found (D1-D8) plus a frame-rate-dependent-steering
  bug and a sandbox `setPerfMode` no-op. 5 fixed and verified (world-edge
  cutoff D1, floating ground-plane rim D2, see-through mortar slits D3, the
  steering bug, the `setPerfMode` no-op). 2 left as deliberate art/perf calls
  (D4 shadow-map aliasing at SIZE 10-12 — fixing it adds GPU cost exactly at
  the frame rate that was already the worst case; D5 the whole game's
  night-lighting read, a scope call not a bug). 3 left as scene-authoring
  notes for whoever next touches `voxelscene-upper-manhattan.js` (D6
  Bethesda's bronze angel reads near-black — one constant, `bronze:
  0x2c4038` → something nearer `0x4f7a68`; D7 Turtle Pond is barely findable;
  D8 Belvedere stands against the CPW wall, inherent to the park being 44 m
  wide at that latitude). See `CHANGELOG.md`'s 2026-08-05 entry for the full
  list.

### Process notes

- Four parallel agents on work this size produced real coordination waste:
  stale numbers relayed from a task description instead of from the owner, and
  a decision (±30) invalidated by a change landing underneath it. Fewer agents.
- Do not quote a task description as a measurement. Ask the owner.
- Commit path is gated: stage explicitly → `py ~/.claude/scripts/sop_attest.py`
  → standalone `git commit`. Never `git add -A`. Multiline messages via a
  scratchpad file and `git commit -F <abs-path>`.

---

## Current state

**Brand**: the game is **Flywheel - A sprocket's story**. The title screen is
the branded landing screen (rotating voxel sprocket mark, block wordmark, one
PLAY pill, grouped free-play city picker); the wordmark and the READY gate draw
from one shared brand layer (`js/ui/blockword.js`, `--fw-*` tokens in
`css/main.css`). The world map and level selection are deliberately still on
the old treatment.

**Progression**: the retired campaign is no longer reachable from the game.
The city sandboxes are replayable goal runs: each starts with the shared
establishing overview/READY zoom, ends after clearing 50% of that map, and contains
60 deterministic collectible coins. A run pays 2 coins per pickup plus a 35
coin completion bonus; this intentionally makes the skin shelf a long-term
goal rather than a one-session unlock.

**Voxel Sandbox**: physics complete and playtest-tuned, seven scenes: the
city gallery (~3,800 blocks, ~30 object kinds in 7 districts), **Brooklyn**
(~39,980 blocks, bridges to Coney Island - the showcase scene, the only one
with an establishing shot and a READY gate), **full
Lower Manhattan** (~25,800 blocks, asymmetric clamp x[-70,74] z[-84,54] —
WTC + 7 WTC + Oculus,
memorial pools, Woolworth, Wall St canyon + NYSE + Fed Reserve, Municipal
Building + courthouse, Chinatown rows, Tribeca lofts, Brooklyn Bridge
tower, Seaport + pier sheds + tall ship + heliport, Battery Park City +
marina, Castle Clinton, SI Ferry Terminal + orange ferry, Custom House),
and **Upper Manhattan** (73,393 blocks / 86,083 mass — the largest scene in
the game — full Central Park geography + Upper West Side + Fifth Avenue/
Museum Mile + Harlem, rebuilt 2026-08-05 from an ~8,400-block sketch).
**Chicago** (23,151 blocks / 236,224 mass) is the newest: the Loop elevated,
Willis Tower, Board of Trade, Riverwalk, theatre blade, Cloud Gate, and a
Millennium Park promenade are fully playable from the city picker. Boston and
Cambridge remain the larger east-coast city sandboxes described in
`.wiki/modules/voxel.md`.

5-class content kit (`js/voxelkit.js`: PROP/VEHICLE/SMALL_BLDG/LARGE_BLDG/
MEGA, now 46+ builders shared across Brooklyn/Lower Manhattan/Upper
Manhattan). Rim-driven excavation, persistent-damage crumble, loose-body
contact resolution (no clipping/spinning), SIZE-scaled hanging reach,
SIZE-10 camera clears the tallest building, **structural-zone support
recalculation** (automatic connected-component zones so a moving hole only
recomputes what it can reach — the fix that made the 73k-block Upper
Manhattan scene playable). Validator covers determinism, stability, a 56 s
gallery tour, a shared 19-probe contract for Brooklyn and Upper Manhattan,
Lower Manhattan's 4-probe overlap/idle/excursion checks (WTC + expansion-
district sweep).

## What works

- Branded landing screen (`js/ui/screens.js` `showTitle`, `js/ui/blockword.js`,
  `js/ui/sprocket.js`): sprocket mark, FLYWHEEL wordmark, tagline plate, PLAY,
  free-play city picker; reduced motion honored from setting and OS
- Core loop: eat → grow → unlock tiers (strict 1.35× 7-tier ladder), win/fail
- Deterministic seeded city gen (streets, blocks, parks, parking, waterfront)
- 100-level campaign, 5 metros, 4 mechanics on schedule (golden L6, rivals
  L21, tide L41, landmark L20 + finales + L91–100)
- Combos (×3 cap), star ratings, coins, shop (skins + clock/growth items)
- World map with locks/stars, results screen, mechanic intro cards
- Saves: localStorage schema v11, migrations v1→v11, quarantine
- Desktop tank controls (W/S throttle, A/D heading steering, Q/E camera orbit,
  R/F zoom — one scheme in campaign and sandbox) + an on-hole heading pointer
  that makes the heading visible + mobile (joystick direct steer + touch orbit)
- Chase camera with building-occlusion pull-in
- **Voxel Sandbox** (see `.wiki/modules/voxel.md`): deterministic load-path
  support graph, instant-default support loss, persistent damage + neighbor
  shock, chunks/debris by material bond, mass-scaled fall + optional creak,
  damage heat tint, tank controls (W/S throttle, A/D heading steering, spin in
  place when parked) + an on-hole heading pointer + heading-chase follow camera
- Sandbox gallery: tower, warehouse, house, shop, church, brownstone,
  apartment, parking garage, gas station, crane, containers, fountain,
  statue, water tower, elevated bridge + train, 8 vehicles, 16 street-furniture
  props, trees, crate pile
- Sandbox Manhattan (`js/voxelscene-manhattan.js`): One WTC + spire, twin
  memorial pools, Woolworth-style tower, glass slab tower, Wall St bank
  porticos, rooftop water tower, Trinity Church, City Hall, elevated train
  (viaduct + 3-car train), Battery Park, Charging Bull, ferry pier, street
  furniture, road/park/harbor decor planes
- Sandbox Upper Manhattan (`js/voxelscene-upper-manhattan.js`): 73,393
  blocks / 86,083 mass, the full district — Central Park's real geography
  (Great Lawn, the Ramble, the Lake, Bethesda Terrace, the Mall, Conservatory
  Water, the Reservoir, the Zoo, Wollman Rink, Belvedere Castle), the Upper
  West Side (twin-tower rhythm, the Dakota, the AMNH + Hayden Sphere,
  Columbus Circle), Fifth Avenue / Museum Mile (the Met, the Guggenheim, the
  Frick, Grand Army Plaza), and Harlem (Striver's Row, the Apollo, Marcus
  Garvey Park, the Metro-North viaduct). 538 generated camera blockers, 32
  new parametric kit builders. Playable: driving went from a 15 fps median
  (75-98% of frames under 30 fps) to a locked 60 after the structural-zone sim
  fix; see `.wiki/modules/voxel.md`. Street and prop footprints use shared
  templates; validator runs the full 19-probe shared contract (same as
  Brooklyn).
- Sandbox Brooklyn (`js/voxelscene-brooklyn.js`): ~39,980 blocks, bridges to
  Coney Island, with the intro establishing camera (`js/camera.js`) and the
  READY gate (`js/ui/ready.js`) holding the shot until the player starts
- Performance Mode in SETTINGS (schema v10): Brooklyn's renderer dirty-set
  skip (static/undamaged/out-of-region blocks bypass per-frame matrix/color
  updates) plus, since 2026-08-05, `VoxelWorld3D.setPerfMode` itself (device
  pixel ratio pinned to 1, ambient life frozen — previously a silent no-op in
  the voxel sandbox, see `.wiki/modules/render.md`). Large scenes are cheap to
  drive, not just idle, because of the sim-side fix: structural-zone support
  recalculation plus active-set scans for debris and sleeping rubble replace
  the old whole-scene-every-step walks (`.wiki/modules/voxel.md`)
- Headless proof: `node tools/validate.mjs`

## Known gaps / next up

- Campaign: level-by-level visual review (level 2 next, once level 1 is
  signed off); crosswalks, moving traffic, roof variety, ground textures,
  fog/grade polish. No instancing in campaign yet (revisit > ~800 draw calls).
- Sandbox direction: more gallery objects from the city-object research
  (delivery/school bus, billboard, subway stairs proper, waterfront/pier,
  helicopter), density re-skins of existing buildings (tower at 0.5 m bricks),
  possibly moving traffic and living pedestrians. Driven by playtesting.
- Audio: the sound library (`js/audio/` — CC0 save the three original
  eat masters) now voices every surface, main game
  included — the `blip()` oscillator is gone. Settings mute + volume drive
  the engine everywhere (save mirrors into the engine's localStorage keys,
  which the arena reads). Positional sounds and the el-train bed are
  distance-attenuated off the local hole. Ten original music tracks now stream
  one at a time across menu, shop, authored cities, pause and results in both
  the main game and arena; Gallery stays music-free. Music volume is separately
  persisted under the existing mute/master controls. Remaining gaps: no
  distance feed for the arena *peer* (its sim never steps — flat train bed),
  `debris-metal.ogg` is still loaded but unheard, and objective LUFS/true-peak
  analysis awaits an audio-analysis tool.
- No unit tests beyond the validator; UI untested except smoke path.
- Upper Manhattan's worst collapse (SIZE 8 into the CPW wall) still has a
  101 ms p95 (median is a fast 16.6 ms). `main.js`'s fixed-timestep catch-up
  loop clamped at 6 steps/frame until 2026-08-12, when the clamp dropped to 2
  on both quality tiers — the measured 4x-throttle blowup was the unexamined
  ceiling asking a device that cannot finish one sub-step in a frame for six
  (~1 fps, sim time at 1/10 wall clock). The trade is now made: brief slow
  motion during a big collapse instead of dropped frames. Still deferred:
  shadow-map aliasing at SIZE 10-12, and the `roads` decor color
  (`0x1c2030`) reading as near-black gashes through the park.

## Recent history

Lean board: one line per shipped item — full detail lives in `CHANGELOG.md` +
git log, not here. This section is NOT a changelog.

- 2026-08-12: Mobile performance pass: the six city scene modules (1.19 MB)
  now load on demand via `loadScene()` instead of at boot; phones that have never
  opened SETTINGS default to quality LOW (`qualityChosen` marker, no schema bump);
  `maxSubSteps` 6 → 2 on both tiers (kills the measured 1 fps catch-up spiral);
  resize events coalesced + no-op sizes dropped; a hidden tab stops the loop and
  lands on PAUSED; `vercel.json` declares cache policy. Same pass: the three eat
  gulps are original MP3 masters (Suno), replacing the freesound CC0 gulps —
  `AudioEngine` gained a per-name extension map; names and call sites unchanged
- 2026-08-11: Original game music implemented: ten streamed MP3 cues
  (menu/shop/six authored cities/pause/results), Gallery deliberate silence,
  retained pause/shop positions, visibility-safe playback, major-stinger
  ducking, independent persisted Music volume, main-game + arena lifecycle
  wiring; music lifecycle 21 assertions and asset registry/hash self-test pass
- 2026-08-11: Rival visibility (phases A–D of `.wiki/features/rival-visibility/`): protocol v3 per-slot keyframe attribution, player-colored crater tiles, coarse tug-of-war bar (digits only at the end), rival chevron, milestone callouts, end-of-match territory reveal — on arena.html, craters + bar shared to multiplayer.html; new `js/rival/` layer + `js/rival/rival.test.mjs` (58 checks); same pass: arena match camera switched to the sandbox-style progressive follow-zoom + `DuelView` dirty-only block sync with out-of-view mover culling (full-city rendering was the phones' big-city FPS killer; the full frame now shows only at the reveal); patterns 3/7 deferred to the 8-player pass
- 2026-08-10: Live multiplayer shipped end to end: `sim.holes[]` multi-hole roster (`js/voxelsim.multihole.test.mjs`), `js/net/host.js`/`peer.js` wired over a loopback proof page (`netdemo.html`, `tools/net-match-selftest.mjs` 48/48), then a real two-device arena over Supabase Realtime (`arena.html`, `js/net/arena.js`, `js/vendor/supabase-realtime.module.js` — ADR-0014 pattern), proven with a live two-browser match at https://flywheel-woad.vercel.app/arena.html; `js/voxelscene-chicago.js` shipped incidentally (committed, not yet menu-wired, a concurrent session's in-progress work)
- 2026-08-10: Score, combo and hype (`.wiki/features/score-combo-and-hype/`, ADR-0015): score plate with animated count-up, radial combo ring that drains the 1.5 s window and reports the sim's REAL multiplier (the old pill printed a level index as `x{n}` — x2 at chain 26 while the sim paid 1.1), table-driven combo ladder at chains 2/10/15/25/50/100/350/600 topping out at a named `MAX`, points-only ruling (SIZE ladder rebased onto `rawMass`, so a hot chain buys score and not growth), 9-row consumption phrase ladder against the scene goal with a full-width band, one priority-and-source announcement queue (a coin toast no longer erases a milestone mid-sentence), per-scene `bestCombo`/`bestScore` on the results screen and in the save (schema v15 → v16)

- 2026-08-09: Nav Indicator Skins & Shop expansion: added 6 incremental indicator skins to Shop (Baseline Chevron, Plasma Wedge, Supered Hot Pink Lightning, Inferno Flame, Cyber Prism, Cosmic Star Vector) with save schema v14 → v15 migration and custom 3D geometries/pulsing animations
- 2026-08-09: Floating nav indicator in Sandbox updated: bold rim-welded chevron arrow pointer (electric cyan body, dark outline, glowing white core) welded to outer hole rim (reference indicator-02.webp / movement-01.webp), dynamically gliding along moving perimeter in real-time
- 2026-08-08: Quality settings collapsed to a strict HIGH/LOW binary, player-chosen only — device auto-detection and the live frame-time watchdog are gone (`js/quality.js` 314 → 58 lines); save schema v13 → v14 remaps every legacy tier value
- 2026-08-07: Tank controls stay, now readable: player A/B-tested four keyboard schemes live (direct / tank / strafe-snap / mouse-follow) and picked tank — the "roundabout" was an INVISIBLE heading, not the scheme. New heading pointer welded to the hole (paper-plane arrow, brand orange, all skins); rig removed same pass
- 2026-08-07: Voxel physics: `_capDebris` stops sleeping blocks onto loose supports (no more mid-air hangs), contact-budget-excluded debris parks instead of sinking into itself (no more re-entry fountain / rim knocking bricks sky-high)
- 2026-08-07: Desktop-class machines classify quality HIGH and pin it (watchdog off) — the tier ladder is for phones; a desktop no longer loses shadows/ambient life to a boot hitch or a bucketed RAM report
- 2026-08-06: Persona playtest remediation (5-agent UX audit → 21 findings): numeric goal bar + SIZE on the sandbox HUD, dimmed coin pill, combo gated at x2, CSS pause glyph, pause CITIES label + two-step RESTART/quit confirms + sandbox RESTART fixed, READY-gate control cheat-sheet, CONTROLS above the fold in SETTINGS, PLAY BROOKLYN CTA + START HERE tag, title coin bank + per-city cleared/best records, ADVANCED fold + reset for physics sliders, sticky settings BACK, boot splash, intro-dive pitch bump (no more wall frames after GO!) — ALL PASS
- 2026-08-06: Tank controls everywhere (W/S throttle along a persistent heading, A/D steer the heading — spin in place parked), sandbox camera chases the control heading directly, basis latch + `recentre()` retired (ADR-0008)
- 2026-08-05: Upper Manhattan full rebuild (8,442 → 73,393 blocks, full Central Park + UWS + Museum Mile + Harlem geography) + structural-zone sim fix (playable at 60 fps) + renderer/input fixes (ground plane, mortar seam, steering, setPerfMode) — ALL PASS
- 2026-08-04: Rebrand to Flywheel - A sprocket's story (shared `fw-*` brand layer, branded landing screen, world map untouched)
- 2026-08-09: Generic SANDBOX (`gallery`) 100% consumption goal + Hole rim building clipping GLSL shader (`applyHoleClipping`) + Funnel suction FX & crumble dust particles — ALL PASS
- 2026-08-09: Nav Indicator Skins System (6 tiered skins, supered glowing hot pink lightning bolt, schema v15 migration) & Shop expansion — ALL PASS
- 2026-08-04: Brooklyn sandbox scene + intro camera + READY gate + performance pass (schema v10) — ALL PASS
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

