# Runbook: run, validate, deploy

## Purpose

Daily operations for a static web game: run locally, prove levels beatable,
ship to static hosting.

## Run locally

1. `python -m http.server 8000` from repo root (or `npx serve`).
2. Open `http://localhost:8000/`.

## Validate (required before commits touching sim/citygen/levels/tiers/voxelsim)

1. `node tools/validate.mjs` — expect `ALL PASS` (~30 s for 100 levels + voxel).
2. Campaign failures are printed per level with the invariant broken:
   - `overlap` → placement bug in `citygen.js` (check snack-ring-first and
     landmark eviction invariants, see `.wiki/modules/citygen.md`)
   - `snack objects within 6m` → snack ring regression (must be ≥ 10)
   - `greedy bot LOST` / margin < 15% → tuning or citygen change broke
     beatability; adjust `levels.js` formulas or revert
   - `first eat >= 1.0s` → spawn/ring geometry regression
3. Voxel sandbox failures:
   - `not deterministic` → a `Math.random()`/iteration-order leak in
     `voxelsim.js` (all randomness must flow through `rng.js`)
   - `non-static at t=2.5s` / `consumed at t=2.5s` → spawn-unstable scene:
     cell collision (ghost block), glass carrying load, floating mount, or an
     object inside the spawn removal disc (see `.wiki/modules/voxel.md`)
   - `not progressive` / `< 20 consumed` → support/failure-model regression
   - `non-finite positions` → physics NaN (usually a divide-by-zero)

## Deploy

Static files only — copy repo root (minus `.wiki/`, `docs/`, `tools/` if you
want it lean; they're harmless if included) to any static host (GitHub Pages,
Netlify, S3+CDN). No server code, no env vars. The only external dependency is
the three.js CDN importmap in `index.html`.

## Rollback / recovery

- Re-deploy the previous static bundle. Save data is client-side
  (`localStorage`) and unaffected by deploys; schema migrations run on load.
- If a save-shape change shipped badly, bump `CURRENT_VERSION` and add a
  migration that repairs the field — never delete user saves; quarantined
  blobs sit under `hole-city-save.quarantine`.

## Common failures

- **Blank page, import errors** → CDN unreachable or served over `file://`;
  must use an HTTP server.
- **World map shows no cards / click does nothing** → a screen render threw;
  check console. (History: `append()` chaining bug.)
- **All levels locked** → corrupt save was quarantined; check
  `localStorage['hole-city-save.quarantine']`.
