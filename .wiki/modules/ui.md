---
covers:
  - "js/ui/**"
  - "js/main.js"
  - "index.html"
  - "css/**"
---
# UI & glue

## Purpose

DOM overlay (HUD + screens + brand layer) and the `main.js` state machine
tying everything together.

## Key Files

| File | Purpose |
|------|---------|
| `js/main.js` | Boot, state machine (menu/intro/playing/paused/results), loop, audio; branches campaign vs voxel sandbox (`isVoxelSandbox`) |
| `js/ui/hud.js` | Mass/size bar, timer, combo, banner, minimap, the announcement queue and its three backends (`#toast`, `#big-pop`, `#hype-band`); `updateSandbox()` variant for the voxel mode (live `CLEARED x% / 50% · SIZE n` readout, dimmed coin pill via `body.mode-sandbox`, the score plate's count-up, and the combo ring — chain, window drain and the multiplier read from `voxelsim.js`'s exported ladder, never re-derived; see [ADR-0015](../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md)) |
| `js/ui/screens.js` | Title (branded landing over a live city backdrop: sprocket + `FLYWHEEL` wordmark + tagline plate, PLAY BROOKLYN CTA as the screen's one saturated element, a save-derived status strip — biggest hole, best score, coin bank and the coin gap to the next unlock — a `FREE_PLAY`-driven voxel-scene chip shelf with per-city cleared/best records, one silhouetted locked card carrying its unlock price in words, and a demoted SHOP/SETTINGS row), shop, results, pause (two-step confirms for run-discarding buttons), mechanic intro |
| `js/ui/menuscene.js` | The live city behind the landing screen — the same `VoxelSandboxSim` + `VoxelWorld3D` + `ChaseCamera` trio the sandbox mounts, on the same canvas, on autopilot (held establishing orbit, never released; a scripted heading sweep drives the hole so the skyline is actively being eaten). Scheduled, never blocking: `startMenuScene` only arms a timer, `tickMenuScene` is folded into `main.js`'s single rAF loop, and `stopMenuScene` disposes from `teardownWorld` before any game world claims the canvas |
| `js/ui/ready.js` | Level-start "READY?" gate overlay (`mountReadyGate`) — the visual reference for the brand layer; renders the shared wordmark at gate scale over the live 3D establishing shot |
| `js/ui/blockword.js` | Shared block-wordmark builder (`buildBlockWord`) — per-character gold slab letters with outline ring, extrude, deterministic index-derived tilt/stagger/bob. Used by both `screens.js` (`FLYWHEEL`) and `ready.js` (`READY?`) so the two never drift apart. See `.wiki/adr/0005-shared-brand-layer.md` |
| `js/ui/sprocket.js` | Brand mark builder (`buildSprocket`) — rotating 12-tooth wheel with an empty center (the hole/protagonist), used on the landing screen |
| `index.html` | Canvas, HUD skeleton, importmap (three vendored same-origin, `js/vendor/three.module.js` — see `architecture.md`'s Boot section and [ADR-0014](../adr/0014-vendored-same-origin-runtime.md)), inline boot watchdog |
| `css/main.css` | HUD + screen styling, plus the unscoped `--fw-*`/`.fw-*` brand layer (tokens, wordmark/sprocket/glow/spark/CTA-pill primitives, keyframes) consumed by both `screens.js` and `ready.js` |
| `js/rival/` | Rival-visibility HUD surfaces for the arena/hot-seat pages (2026-08-11, `.wiki/features/rival-visibility/`): `identity.js` (THE per-slot color table — every surface reads it, none defines its own), `attribution.js` (block → eater record + tallies), `tugbar.js` (coarse possession bar, no digits during play), `offscreen.js` (rival chevron), `beats.js` + `announce.js` (milestone callouts through one priority channel), `reveal.js` (end-of-match territory reveal). Not loaded by `js/main.js`; consumed by `js/demo/arena.js` and `js/demo/demo.js` |

## Gotchas

- Screens communicate **only** through the `actions` object passed to
  `Screens` — don't reach into `main.js` state from UI code.
- `.screen` uses `justify-content: safe center` — plain `center` pushes
  overflowing content outside the scroll viewport (world map bug; fixed).
- `window.__sim` / `window.__cam` are exposed as debug/smoke-test hooks; fine
  to use in tests, never in gameplay code.
- Shop effects: `clock5`/`growth5` applied to a *clone* of the level in
  `startLevel` so `levels.js` data stays pristine.
- Brand layer (`.fw-*` in `css/main.css`, `blockword.js`, `sprocket.js`) is
  unscoped by design — `#ready-gate` and `.fw-landing` both consume it rather
  than each owning a copy. Edit the shared primitives, not a per-screen fork;
  gate-only sizing/scrim/exit rules stay under the `#ready-gate` prefix. See
  `.wiki/conventions.md` and `.wiki/adr/0005-shared-brand-layer.md`.
- The landing backdrop is opt-out by construction: `menuscene.js` puts
  `body.fw-scene` on only once a scene has built, and every rule that changes
  the landing screen for a live city is keyed off that class — so a weak
  device (few cores, little memory, LOW graphics or Performance Mode), a
  missing WebGL context or a throw during the build all land on the original
  flat dark field with no second code path. Its lifetime is the title screen's
  lifetime and nothing else has to remember: `showTitle` calls
  `actions.menuScene(true)`, and `showLoading`/`showShop`/`showSettings` each
  call it with `false`. Reduced motion (either source) freezes the camera drift
  by passing a zero orbit arc and keeps the city.
- Legibility over the backdrop is a scrim, not a panel: `.fw-landing`'s
  translucent fill and backdrop blur are dropped when the scene is up and
  replaced by a fixed layered gradient (warm pool behind the wordmark, a band
  under the chip shelf, an overall vignette). The type still carries its own
  outline ring, same as the READY gate's `.rg-scrim`.
- Everything the landing screen says about the player comes from
  `personalBest()`/`nextUnlock()` in `screens.js`, which read only the save. A
  record that was never set renders no cell rather than a zero, and the locked
  card is the cheapest unowned row across `SKINS`/`INDICATOR_SKINS`/`ITEMS` —
  cities are never locked, so shop content is the only thing that is.
- That next-unlock row has TWO states and one flag (`save.coins >= price`)
  decides both halves, so the strip and the card can never disagree. Short: the
  strip is a goal (bar + `N to go`) and the card is `.fw-chip--locked`, dashed,
  reading `UNLOCKS AT n COINS`. Covered: the bar goes entirely (a full bar is a
  finished journey drawn as a pending one), the strip names the item under
  `READY TO BUY`, and the card becomes `.fw-chip--ready` — solid frame, gold
  accent, gold coin instead of the lock disc, reading `BUY NOW · n COINS`.
- Phone portrait (`max-width: 640px`, portrait) is a distinct composition, not a
  squeeze: `#mp-link` leaves the top-right corner it shared with the centred
  sprocket and becomes a full-width top rail (index.html, same breakpoint) whose
  band `.fw-landing` reserves as padding, so the header stack cannot collide at
  any width. Below it only the card shelf flexes — everything else is
  `flex: none`, the shelf scrolls inside a 44vh cap with a 190px floor on its
  group, and the scrim's lower band lifts — which keeps the screen itself from
  scrolling and leaves a strip of live city legible between the strip and the
  shelf. `menuscene.js` pulls its establishing radius back (112 vs 74) on a
  narrow portrait viewport so that strip carries skyline rather than one facade.
- Landing-screen feel is token-driven (`--fw-press`/`--fw-release`/`--fw-back`/
  `--fw-lift`/`--fw-stagger` on `.fw-landing`). Reduced motion swaps those
  tokens rather than removing the animations, so a press still answers; every
  state change is transform/opacity only, and the unlock bar fills by
  `scaleX` so nothing on the screen animates layout.
- `screens.js`'s `FREE_PLAY` list is the single place the voxel-scene chip
  shelf's order/labels/tags live; `startVoxelSandbox(scene)` takes the
  `scene` id straight from it, and the sandbox's own `'gallery'` default
  covers the one entry (`SANDBOX`) that omits `scene`.
- `screens.js` imports `SKINS` and `INDICATOR_SKINS` from `js/skins.js` and
  re-exports both — the shop shelf **is** the skin registry, not a separate
  list, so a new skin (or a new nav-indicator skin) is a row in `skins.js`
  and nothing here changes. `SKINS` (25 rows) is the ball's own look;
  `INDICATOR_SKINS` (6 rows) is a separate shelf for the nav arrow's shape,
  read by `voxelworld.js`'s `indicatorShape()`/`INDICATOR_BY_ID`. Geometry/
  animation for both lives in `skins.js`; see `.wiki/modules/render.md`.
- Pause-screen buttons that discard the run (RESTART, CITIES) use a two-step
  inline confirm (`armable` in `showPause`): first click arms red, second
  acts, any other click disarms. No modals — the pause style is dialog-free.
  `actions.restart` is sandbox-aware via `main.js`'s `lastSandboxScene`.
- Dev voxel-physics sliders live in a collapsed `ADVANCED — CITY FEEL`
  `<details>` with RESET TO DEFAULTS driven by `VOX_DEFAULTS` (exported from
  `save.js` and spread into `defaultSettings()`, so reset and fresh-save
  defaults cannot drift).
- The READY gate carries a control cheat-sheet (`.rg-controls`, key/tap split
  like `.rg-hint`) plus the tier rule in one sentence (`.rg-rule`) — the short
  version of the SETTINGS CONTROLS list, which itself sits directly under the
  first toggles, above the fold.
- `index.html` has a static `#boot-splash` that `main.js` removes before the
  first screen mounts; `#btn-pause` uses CSS-drawn bars (`.pause-glyph`), not
  a text glyph (❙❙ fell back to a missing-glyph box on some systems).
- Settings panel has a "Tap to move" toggle (`settings.pointMove`) for the
  optional point-to-move control scheme — off by default, WASD/joystick
  unaffected either way. See `.wiki/modules/render.md`'s point-to-move entry
  for the input-side detail.
- The quality row (`🎚 Graphics detail`) is a two-state HIGH/LOW toggle
  button, not a `<select>` — every other control on this screen is a button,
  and two options make the cycle a straight flip (`js/ui/screens.js`). It
  reads and writes `st.quality` directly; there is no `AUTO` state, no device
  classifier, and nothing adjusts it while the screen is open (2026-08-08 —
  the prior `AUTO · <tier>` label and its live-watchdog staleness bug are
  gone along with the classifier). See `.wiki/modules/render.md`'s quality
  entries for the `TIERS` lever values and the removed system's history.
- SETTINGS carries one Game sounds toggle (global mute) above three sibling
  `.set-row` sliders: Effects volume, Ambience volume, Music volume, in that
  order, the second cloned from the same row template as the first. There is
  no master slider; each governs only its own audio bus. Effects and Ambience
  write `settings.sfxVol`/`settings.ambVol` through `actions.applySettings()`;
  Music goes straight through `actions.setMusicVolume()` since the music
  director owns its own persistence. A slider's resting position, when the
  save has no stored value yet, comes from `js/audio/mix.js`'s constants
  rather than a literal in `screens.js`, so it can never show a different
  number from what the game actually boots at. See `.wiki/modules/audio.md`.

**Reconciled 2026-08-10:** `js/main.js`, `js/ui/hud.js` and `js/ui/screens.js`
are unchanged since the score-combo-and-hype commit documented below. The
whole day's multiplayer arc — the multi-hole sim, `js/net/host.js`/`peer.js`
wiring, `netdemo.html`, and the live `arena.html` over Supabase Realtime — is
a separate surface that doesn't touch this module: `multiplayer.html`,
`netdemo.html` and `arena.html` each run their own loop outside `main.js`'s
state machine entirely (see `architecture.md`'s Boundaries section), and no
campaign or sandbox screen calls into `js/net/` yet.

**Planned, not built:** the online-Flywheel package
(`.wiki/features/online-flywheel/`) proposes new sign-in, leaderboard, and
trophy-room screens on top of this module. See
[05-identity-and-accounts.md](../features/online-flywheel/05-identity-and-accounts.md)
and [06-belts-and-achievements.md](../features/online-flywheel/06-belts-and-achievements.md).
None of these screens exist yet.

**Built (2026-08-10):** the score-combo-and-hype package
(`.wiki/features/score-combo-and-hype/`). Three vocabularies, deliberately not
sharing a look, so a player can tell what fired without reading it:

- **Consumption** — `#hype-band`, full width, horizontal sweep, gold on ink,
  driven by the `MILESTONES` table in `voxelsim.js` against the scene GOAL
  fraction. Its last row is exactly goal completion, so the run ends on it.
- **Combo** — `#combo-meter`, a radial SVG arc on the right that drains over
  the 1.5 s window, heat-ramped by level (`--fw-heat-1..8`), pulsing
  concentrically on each ladder step. Never a screen phrase: it fires every few
  seconds where the band fires a handful of times a level.
- **SIZE** — unchanged: the existing arpeggio, camera kick, confetti and
  `#big-pop`.

`#score-plate` in the left column carries the score (`hole.mass`) with an eased
count-up, sized for its largest value so gaining a digit reflows nothing. All of
it is scoped under `body.mode-sandbox`; the campaign HUD is untouched.

Every transient message now goes through **`hud.announce({ text, source,
priority, ms, channel, tier })`** — one channel, a priority scale (`ANN`), and
coalescing by source. `showToast`/`showBigPop`/`showBand` are its backends and
are not called directly from `main.js` any more (the validator asserts this).
That closed a live defect: a 700 ms coin toast used to erase a 2,200 ms
milestone toast mid-sentence, because both wrote the same element and timer.
