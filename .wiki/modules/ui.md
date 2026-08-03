---
covers:
  - "js/ui/**"
  - "js/main.js"
  - "index.html"
  - "css/**"
---
# UI & glue

## Purpose

DOM overlay (HUD + screens) and the `main.js` state machine tying everything
together.

## Key Files

| File | Purpose |
|------|---------|
| `js/main.js` | Boot, state machine (menu/intro/playing/paused/results), loop, audio; branches campaign vs voxel sandbox (`isVoxelSandbox`) |
| `js/ui/hud.js` | Mass/size bar, timer, combo, banner, minimap, toasts, `#big-pop` celebrations; `updateSandbox()` variant for the voxel mode (SIZE level + progress bar, elapsed clock, tiered combo) |
| `js/ui/screens.js` | Title, world map, shop, results, pause, mechanic intro |
| `index.html` | Canvas, HUD skeleton, importmap (three from CDN) |
| `css/main.css` | HUD + screen styling |

## Gotchas

- Screens communicate **only** through the `actions` object passed to
  `Screens` — don't reach into `main.js` state from UI code.
- `.screen` uses `justify-content: safe center` — plain `center` pushes
  overflowing content outside the scroll viewport (world map bug; fixed).
- `window.__sim` / `window.__cam` are exposed as debug/smoke-test hooks; fine
  to use in tests, never in gameplay code.
- Shop effects: `clock5`/`growth5` applied to a *clone* of the level in
  `startLevel` so `levels.js` data stays pristine.
