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
| `js/ui/hud.js` | Mass/size bar, timer, combo, banner, minimap, toasts, `#big-pop` celebrations; `updateSandbox()` variant for the voxel mode (SIZE level + progress bar, elapsed clock, tiered combo) |
| `js/ui/screens.js` | Title (branded landing: sprocket + `FLYWHEEL` wordmark + tagline plate, PLAY CTA, `FREE_PLAY`-driven voxel-scene chip shelf, quiet SHOP/SETTINGS), world map, shop, results, pause, mechanic intro |
| `js/ui/ready.js` | Level-start "READY?" gate overlay (`mountReadyGate`) — the visual reference for the brand layer; renders the shared wordmark at gate scale over the live 3D establishing shot |
| `js/ui/blockword.js` | Shared block-wordmark builder (`buildBlockWord`) — per-character gold slab letters with outline ring, extrude, deterministic index-derived tilt/stagger/bob. Used by both `screens.js` (`FLYWHEEL`) and `ready.js` (`READY?`) so the two never drift apart. See `.wiki/adr/0005-shared-brand-layer.md` |
| `js/ui/sprocket.js` | Brand mark builder (`buildSprocket`) — rotating 12-tooth wheel with an empty center (the hole/protagonist), used on the landing screen |
| `index.html` | Canvas, HUD skeleton, importmap (three from CDN) |
| `css/main.css` | HUD + screen styling, plus the unscoped `--fw-*`/`.fw-*` brand layer (tokens, wordmark/sprocket/glow/spark/CTA-pill primitives, keyframes) consumed by both `screens.js` and `ready.js` |

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
- `screens.js`'s `FREE_PLAY` list is the single place the voxel-scene chip
  shelf's order/labels/tags live; `startVoxelSandbox(scene)` takes the
  `scene` id straight from it, and the sandbox's own `'gallery'` default
  covers the one entry (`SANDBOX`) that omits `scene`.
