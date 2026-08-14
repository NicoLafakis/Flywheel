# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-14

**This is a board, not a changelog** (`.wiki/conventions.md`): a shipped item is
one dated line here, the detailed entry goes in `CHANGELOG.md`, the design
detail in `.wiki/features/*`, and the module truth in `.wiki/modules/*`.
Budget: 5,000 tokens.

---

## Awaiting Nico

- **Two fields in the legal pages** (2026-08-13). Both shipped with a working
  fallback, so neither blocks anything; both are genuinely his to decide and are
  marked `TODO(nico)` in the HTML. (1) **Contact route** — `privacy.html` and
  `terms.html` currently point at the GitHub issue tracker, which is real and
  reachable. An email address would be better if he wants one. (2) **Governing
  law** — `terms.html` names the United States without a state. Naming a state
  fixes a forum; leaving it is normal for a free game. Everything else in both
  documents is grounded in code and ready to stand.

---

## Active focus

- **Closing the release blocker** (T-301..T-312 shipped 2026-08-13; see
  `.wiki/findings/RCA-2026-08-13-scoring-and-combo-audit.md`).
- **Timed Runs & Full Clear** (`.wiki/features/timed-runs-and-full-clear/`).
  Phases 1-2 shipped 2026-08-13 (180 s clock on every level, 100% goal, honest
  scoring, zero-margin sandbox results, clean time-out states, and the four
  follow-ups T-501..T-504 closing the loose ends).
- **Power-Up System**: full power-up catalogue (`VORTEX`, `SPEED`, `TITAN`, `QUAKE`, `FRENZY`, `CHRONO`)
  shipped across simulation, 3D render, and HUD with milestone drops every 100k points & 500 mult.
- **T-403 — Parallelize the validator sections**: the sequential run on one
  core reached ~20 s. Done 2026-08-14: child processes for the independent
  sections, Cambridge soak demoted to opt-in.
- **T-404 — Chicago Loop ranked gate**: paper the Chicago verification-cost
  measurement so the first ranked city has its route-budget evidence on
  record before the next one joins.
- **T-405 — The next ranked city**: select from Brooklyn / Boston / Cambridge
  by replay cost, run the same gate Chicago passed, and add it to `RUN_CITIES`.

---

## Shipped state

**Brand** — *Flywheel — A sprocket's story*. Branded landing screen over a live
city backdrop (sprocket mark, block wordmark, one PLAY CTA, grouped free-play
shelf, save-derived status strip with the identity chip at its head); shared
brand layer (`js/ui/blockword.js`, `--fw-*` tokens) used by both landing and the
READY gate. Legal footer (`privacy.html` + `terms.html`) linked from `.fw-foot`.

**Progression** — free-play voxel sandboxes on a shared 180 s clock, 100% full
clear goal, 60 deterministic collectible coins per city (2 coins/pickup, no
goal bonus on a run that timed out at 3%), skin & indicator shop, score attack
runs on Chicago Loop.

**Cities** — 7 real-world scenes: Gallery, Manhattan, Upper Manhattan (73k
blocks), Brooklyn (40k blocks), Boston (83k blocks), Cambridge (73k blocks),
Chicago Loop (44k blocks). All deterministic, overlap-free, zero-randomness
sim.

**Multiplayer & Boards** — live Supabase Realtime 1v1 arena (`arena.html`);
THE RUN Chicago 90 s score attack verified by headless server replay; public
leaderboards (Weekly Records + The Flywheel Overall); personal profile & bests
hub; device-token identity; signed outbox queue for offline/flaky-connection
play.

**Power-Ups** — 6 dynamic power-ups with physical simulation effects, 3D voxel
pickups, and active HUD timers/badges (`.wiki/modules/powerups.md`).

**Audio** — `js/audio/` voices every surface; 10 original streamed music cues
across menu, shop, the six authored cities, pause and results; independent
master/sfx/ambience/music volume controls.

**Quality** — player-chosen HIGH/LOW binary; phones default to LOW until
SETTINGS is opened.

---

## Recent history

One line per shipped item, newest first. Full detail lives in `CHANGELOG.md`,
the feature packages under `.wiki/features/`, and `git log` — not here.

- 2026-08-14 — Power-Up System: 6 distinct power-up types with physical suction/mass/speed/quake/multiplier/time effects, initial level placement, and milestone drops every 100k points & 500 mult
- 2026-08-14 — Validator parallelization & Cambridge soak opt-in (T-403)
- 2026-08-14 — Debris retirement on proven stationarity (T-402, ADR-0018)
- 2026-08-13 — Player identity and legal pages (owner request): `BIGGEST HOLE`
  dropped from the landing strip (a lifetime high-water mark on the hole's own
  radius, maxed early and never moving again — the per-city `SIZE` on the chips
  is the honest version and stays); the PROFILE button moved out of the utility
  row and into the head of the status strip as an identity chip, ungated, so the
  one screen explaining how to get a board name is no longer hidden from
  everyone who lacks one, and `showProfile()` gained the real claim route;
  `privacy.html` and `terms.html` added as standalone inlined documents with a
  `PRIVACY · TERMS` line in the landing footer, every factual claim sourced from
  `js/board/player.js`, `api/_lib.mjs` and the schema rather than drafted
- 2026-08-13 — Score integrity & honest combo readouts (T-301..T-312, closing the
  release blocker): `RANKED_TUNE` made a complete, double-locked physics
  description and every physics lever gated on `!sim.tuneLocked`; the server now
  compares its replayed score against the claimed one; the arena decides the
  match on the points it prints (**the score wins**, ADR-0015) and the tug bar is
  labelled `TERRITORY`; protocol v4 widens `mass_q` to u32; every combo readout
  states its unit and the true 8x ceiling is a number, not `MAX`
- 2026-08-13 — Timed Runs & Full Clear phases 1-2: the 180 s clock
  (`js/levelclock.js`) and `targetFraction` 1.0 on every scene
- 2026-08-13 — T-401: the T-901 mobile measurement preserved as a re-runnable
  instrument (`tools/perf/`)
- 2026-08-12 — Scoreboards & Profiles: THE RUN, replay-verified boards,
  device-token names, Vercel API, four Supabase migrations, save v17
- 2026-08-12 — Mobile perf: on-demand city modules, device-aware default tier,
  `maxSubSteps` 6 → 2, coalesced resize, hidden-tab pause, `vercel.json` cache policy
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
- 2026-08-06 — Persona playtest remediation: 21 findings from a five-agent UX audit
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
