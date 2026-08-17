---
covers:
  - "js/ui/**"
  - "js/main.js"
  - "index.html"
  - "privacy.html"
  - "terms.html"
  - "css/**"
---
# UI & glue

## Purpose

DOM overlay (HUD + screens + brand layer) and the `main.js` state machine
tying everything together.

## Key Files

| File | Purpose |
|------|---------|
| `js/main.js` | Boot, state machine (menu/intro/playing/paused/results), loop, audio; branches campaign vs voxel sandbox (`isVoxelSandbox`). Its separate `run90` path quantizes and records each fixed-tick input before stepping the pinned RUN tune; it lazy-loads board code and drains a durable outbox only at boot/reconnect/focus/timer boundaries, never in the sim loop |
| `js/ui/hud.js` | Mass/size bar, timer, combo, banner, minimap, the announcement queue and its three backends (`#toast`, `#big-pop`, `#hype-band`); `updateSandbox()` variant for the voxel mode (live `CLEARED x% OF THE CITY · SIZE n` readout, the `#level-clock` countdown pill via `_updateClock()`, dimmed coin pill via `body.mode-sandbox`, the score plate's count-up, and the combo ring — chain, window drain and the multiplier read from `voxelsim.js`'s exported ladder, never re-derived; see [ADR-0015](../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md)) |
| `js/ui/screens.js` | 2-Stage Menu Flow: Stage 1 Title (branded landing over live city backdrop: sprocket + `FLYWHEEL` wordmark + tagline plate, prominent `PLAY` CTA, always-visible player status strip with Player Login / profile, Highest Score overall, and graphic segmented coin progress meter toward next skin level; THE RUN Chicago 90s, RECORDS, SHOP, SETTINGS, and HELP & FAQ utilities, and `.fw-foot` CC0 sound manifest + PRIVACY/TERMS legal line); Stage 2 City Selection Carousel (`showCitySelect`: 3D featured city card, `<`/`>` navigation arrows, touch swipe gestures, dynamic block count size-ascending ordering via `getSortedCityCatalog()`, gated progression unlocking via `isCityUnlocked()`, and bottom dot rail); Modern Mobile Game Shop (`showShop`: 5 icon-based category tabs `🕳️ Skins`, `👾 Creatures`, `🤝 Partners`, `🧭 Indicators`, `⚡ Upgrades`, sticky header with collection stats `14/31 Cosmetics · 12/80 Upgrade Ranks` and live coin capsule, 4 incremental stat tracks with 20-segment pip progress meters and +5%..+100% power boost ladders, responsive item card grid with baked 3D previews), results, pause (two-step confirms for run-discarding buttons), mechanic intro |
| `js/ui/help.js` | Interactive Help, Walkthrough, FAQ, and Tips 'n Tricks system (`renderHelp`): 3 tabbed views (`WALKTHROUGH`, `FAQ`, `TIPS 'N TRICKS`), real-time search & filter engine across all chapters and tags, collapsible animated accordion cards, and comprehensive documentation covering all 8 cities, 6 power-ups, controls, menus, upgrades, combos, multiplayer mechanics, and pro strategies |
| `js/ui/boards.js` + `js/board/` | Lazy optional board layer: accessible public record tables and profile/claim/transfer/remove actions; direct PostgREST reads use only the publishable key, while every mutation goes through a Vercel Function with a timeout and offline fallback |
| `js/ui/menuscene.js` | The live city behind the landing screen — the same `VoxelSandboxSim` + `VoxelWorld3D` + `ChaseCamera` trio the sandbox mounts, on the same canvas, on autopilot (held establishing orbit, never released; a scripted heading sweep drives the hole so the skyline is actively being eaten). Scheduled, never blocking: `startMenuScene` only arms a timer, `tickMenuScene` is folded into `main.js`'s single rAF loop, and `stopMenuScene` disposes from `teardownWorld` before any game world claims the canvas |
| `js/ui/ready.js` | Level-start "READY?" gate overlay (`mountReadyGate`) — the visual reference for the brand layer; renders the shared wordmark at gate scale over the live 3D establishing shot |
| `js/ui/blockword.js` | Shared block-wordmark builder (`buildBlockWord`) — per-character gold slab letters with outline ring, extrude, deterministic index-derived tilt/stagger/bob. Used by both `screens.js` (`FLYWHEEL`) and `ready.js` (`READY?`) so the two never drift apart. See `.wiki/adr/0005-shared-brand-layer.md` |
| `js/ui/sprocket.js` | Brand mark builder (`buildSprocket`) — rotating 12-tooth wheel with an empty center (the hole/protagonist), used on the landing screen |
| `index.html` | Canvas, HUD skeleton, importmap (three vendored same-origin, `js/vendor/three.module.js` — see `architecture.md`'s Boot section and [ADR-0014](../adr/0014-vendored-same-origin-runtime.md)), inline boot watchdog |
| `privacy.html` + `terms.html` | The two legal documents, linked from the landing footer. Standalone pages that must render for someone arriving on a shared link with the game never booting, so they carry their own inlined stylesheet rather than linking `css/main.css` (whose `overflow: hidden` / `user-select: none` / `touch-action: none` body rules are right for a game surface and wrong for a scrollable, copyable document). Palette tokens are copied from `main.css`'s `:root` by value; the typographic register is deliberately different — long-form reading at a ~65ch measure, not dense uppercase HUD furniture. Pinch-zoom stays enabled, unlike the game surfaces. Every factual claim in the privacy copy is sourced from code, not drafted: the device key is 24 random bytes from `js/board/player.js` and is not a fingerprint, the IP is a keyed HMAC digest never stored raw (`api/_lib.mjs:107-115`), and only the SHA-256 hash of a name token is stored (`token_hash bytea`). Changing any of those behaviours means changing this copy in the same commit |
| `css/main.css` + `css/help.css` | HUD + screen styling, help modal styling, plus the unscoped `--fw-*`/`.fw-*` brand layer (tokens, wordmark/sprocket/glow/spark/CTA-pill primitives, keyframes) consumed by both `screens.js` and `ready.js` |
| `js/rival/` | Rival-visibility HUD surfaces for the arena/hot-seat pages (2026-08-11, `.wiki/features/rival-visibility/`): `identity.js` (THE per-slot color table — every surface reads it, none defines its own), `attribution.js` (block → eater record + tallies), `tugbar.js` (coarse possession bar, no digits during play), `offscreen.js` (rival chevron), `beats.js` + `announce.js` (milestone callouts through one priority channel), `reveal.js` (end-of-match territory reveal). Not loaded by `js/main.js`; consumed by `js/demo/arena.js` and `js/demo/demo.js` |

## Gotchas

- Screens communicate **only** through the `actions` object passed to
  `Screens` — don't reach into `main.js` state from UI code.
- The countdown lives in `#level-clock`, its OWN pill — not in `#timer`, which
  the sandbox already repurposed as the coin readout and the campaign still uses
  as its own countdown. `_updateClock(seconds)` is the single entry point: pass
  `null` (as the campaign `update()` does explicitly) to hide it, otherwise it
  writes `formatClock()` and toggles `.warn`/`.urgent` from the thresholds
  exported by `js/levelclock.js`. Never read 30/10 or 180 locally.
  **THE RUN goes through the same pill (T-504, 2026-08-13)** — its seconds are
  `(RANKED_TICK_COUNT - sim.rankedTicks) / 60`, never a literal 90, and never
  `#timer`. It used to overwrite `#timer`, which left the ranked countdown in a
  pill with no endgame states, hid `#level-clock` (run90 leaves `sim.timeLeft`
  null), and destroyed the coin readout for the length of the run. The rule that
  catches the next one: **count the visible countdowns, do not read one of
  them** — a probe reading `#timer`'s text passes just as happily with a second
  contradictory clock beside it.
- The `#timer` coin readout says something different in a match than it does
  solo, and the split lives in one pure exported function, `formatCoinReadout()`
  (T-636). Solo: `🪙 3/40`, the personal tally, unchanged. Multiplayer
  (`sim.isMultiplayer`): `🪙 31 LEFT`, the SHARED pool remaining — the same
  number on every player's screen, ticking down whoever took the coin, read from
  the host-authoritative `sim.coinsRemaining`. The `n/total` shape is
  deliberately dropped with it, because a fraction reads as a personal score
  while the point is that a rival is draining a finite pool. Presentation only:
  `hole.coinsCollected` / `hole.coins` still drive the podium breakdown and the
  banking into `save.coins`. The function is exported so the copy is asserted
  headlessly (`tools/multiplayer-clock-coins.test.mjs`) instead of in a browser.
- The goal line reads `sim.won`, never `cleared >= sim.goal.targetFraction`.
  At `targetFraction` 1.0 that comparison is the exact expression the sim needs
  a 1e-9 epsilon for, so a real full clear would sit on "CLEARED 99%" forever.
  **The sandbox results screen reads the same latch for its payout (T-503).**
  `SANDBOX_GOAL_BONUS` used to be added unconditionally, so a run that timed out
  at 3% was paid +35 for finishing on a screen headed "TIME'S UP". Rule for any
  future payout row: gate it on the outcome latch, and when it was not earned
  **omit the row** rather than printing `+0` — a zero on a results screen reads
  as a broken game, not as an honest nil. That applies to the coin payout total
  as much as to the bonus. The screen passes its computed payout into
  `recordSandboxResult` through the continue callback, so the number banked is
  the number displayed rather than a second calculation.
- THE RUN is not a city-clear variant. Its clock ends at 5,400 fixed steps and
  a browser-displayed score is provisional until the server marks the replay
  verified. Never make a board request from the fixed-step loop or treat a
  save-side score as a public record.
- `.screen` uses `justify-content: safe center` — plain `center` pushes
  overflowing content outside the scroll viewport (world map bug; fixed).
- `window.__sim` / `window.__cam` are exposed as debug/smoke-test hooks; fine
  to use in tests, never in gameplay code.
- Shop effects: `clock5`'s +5s is applied to a *clone* of the level in
  `startLevel` so `levels.js` data stays pristine. The campaign growth bonus
  passed alongside it is the `growth` upgrade rank and nothing else —
  `computeShopBonus()` has no legacy `growth5` term, because the v20 save
  migration already turns that purchase into rank 1. See
  `.wiki/modules/campaign.md`.
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
  card is the cheapest unowned row the shop itself sells: `nextUnlock()` walks
  `SHOP_CATEGORIES` and `getShopItemsByCategory(...)`, the same catalogue source
  the shop screen renders from, so the teaser can only ever name something the
  player has a tab to buy it on. The legacy `ITEMS` rows (`clock5`, `growth5`)
  are still exported and owners keep what they bought, but no category renders
  them, so the teaser no longer sweeps them — it was pointing at a "next
  unlock" with no screen behind it. Cities are never locked, so shop content is
  the only thing that is.
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
  Below ~780px viewport height (iPhone SE class) the pinned shelf cannot fit at
  any size, and the nested scroller trapped the page's one scroll gesture —
  the utility row painted off-screen while masked chips took its taps — so a
  second query (`max-height: 780px`) flattens the shelf back into document
  flow: no inner scroller, no mask, one page scroll.
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
  and two options make the cycle a straight flip (`js/ui/screens.js`). The
  label shows the EFFECTIVE tier: the stored `st.quality` once the player
  has chosen, the device default (`defaultTierForDevice()` — phones start
  LOW) until then, so the screen never tells a phone player their game is
  running HIGH when it is not. Pressing the button cycles from the
  displayed tier and sets `st.qualityChosen = true`, from which point the
  stored value is the only authority on every device (2026-08-12; there is
  still no `AUTO` state and nothing adjusts mid-session). See
  `.wiki/modules/render.md`'s quality entries for the `TIERS` lever values,
  the device-default measurement, and the removed system's history.
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

**Reconciled 2026-08-16 (ADR-0020):** Four menu-wiring bugs fixed in
`js/ui/screens.js` and `js/main.js`. (1) `CITY_CATALOG` was missing an `icon`
field on every entry; the city-select card template rendered the literal string
`"undefined"` — each entry now carries the correct emoji. (2) The power-up
showcase fill bar used `6000` as the total-ms denominator while the countdown
was `10000`; replaced with `SHOWCASE_TOTAL_MS = 10000`. (3) Shop tab buttons
called `actions?.sound('click')` which was never registered; tabs now carry
`.secondary` so the existing `#screen-root` delegated listener fires
`audio.uiTap()` on every switch. (4) The HUD mute button was hardcoded `🔊`
in `index.html` and never updated on toggle; the click handler now syncs the
emoji to `🔇`/`🔊` immediately after `audio.setMuted()`. No gameplay code
touched.


**Planned, not built:** the online-Flywheel package proposed new sign-in,
leaderboard, and trophy-room screens on top of this module, designed in its
identity-and-accounts and belts-and-achievements documents. That package was
retired along with the legacy multiplayer stack on 2026-08-16 and neither
document has a replacement yet; the identity/sign-in question has been
narrowed and partly superseded by
[scoreboards-and-profiles](../features/scoreboards-and-profiles/00-objective-overview.md)'s
simpler device-token names, but the trophy-room/belts screens remain
undesigned. None of these screens exist yet.

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

**Amended 2026-08-13 (T-309..T-311): every readout states its unit.** The two
combo ladders are different scales — the voxel ladder tops out at **8x**, the
campaign ladder at **3.0x** — and the HUD was printing a chain COUNT in a
multiplier's slot on both. The rule now, enforced by `tools/validate.mjs`'s
source guards over `hud.js`, `screens.js`, `arena.js`, `index.html` and
`arena.html`: **no `x${chain}` and no `x${bestCombo}`.** A number after an `x`
must have come out of `comboMult` (voxel) or `comboMultiplier` (campaign).

- The combo ring is a three-line stack: chain count, a `CHAIN` unit caption, and
  the live multiplier. The unit is what makes the biggest number in the HUD
  legible — it was a bare integer beside a multiplier arc.
- `COMBO_LEVEL_NAMES`'s top rung is `x8`, not `MAX`. A word cannot be compared
  to the rung below it, and the ceiling is a fact worth showing. The summit
  reads as the summit through a paint-only `topped` glow (`#cm-mult`), which
  costs no layout — a bordered pill collided with the arc at phone width.
- Results rows read `530 eats at x7` (and `47 eats at x3.0` in campaign): one
  `<b>` per row. `.results-stats b { float: right }` renders two bold values in
  a row **right-to-left and detached from their label**, which no `innerText`
  assertion can see; the validator now fails any results cell with two `<b>`s.

The arena is under the same rule: it decides the match on the combo-multiplied
points it prints, and its tug bar — still raw-mass — says `TERRITORY` so the two
currencies cannot be confused. See `CHANGELOG.md` 2026-08-13 and
`.wiki/findings/RCA-2026-08-13-scoring-and-combo-audit.md`.

Every transient message now goes through **`hud.announce({ text, source,
priority, ms, channel, tier })`** — one channel, a priority scale (`ANN`), and
coalescing by source. `showToast`/`showBigPop`/`showBand` are its backends and
are not called directly from `main.js` any more (the validator asserts this).
That closed a live defect: a 700 ms coin toast used to erase a 2,200 ms
milestone toast mid-sentence, because both wrote the same element and timer.
