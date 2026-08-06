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

## Other tools (`tools/`)

- **`node tools/skinsheet.mjs [url] [size]`** — renders every row in
  `js/skins.js`'s `SKINS` to `docs/skins/<id>.png` plus an `index.html`
  contact sheet grouped by family (core/creature/partner), with name, id,
  price, blurb and rim/accent hexes per tile. It calls the shop's own
  `bakeSkinThumbnails()` and writes the bytes rather than posing its own
  render, so the sheet shows exactly what the shop shelf shows — a bespoke
  render could disagree with the shop and hide a defect instead of surfacing
  one. Idempotent (clears `docs/skins/` first). Guards on a sha256 of all
  PNGs being distinct, which is how it caught `partner-supered` baking as a
  bare rim (see `modules/render.md`'s `logoTex` entry) — a row whose
  `logoTex` mark isn't decoded in time gets flagged with an amber border on
  the tile rather than failing the run silently.
- **`node tools/gen-partner-logo.mjs --name "Agency" --site agency.com [--file path] [--generate]`**
  — the mechanical half of adding a partner skin. Discovers the agency's own
  square app icon (`link[rel~=apple-touch-icon]`, then the W3C manifest's
  `icons[]`, then `og:image`, then `--generate` via Leonardo as a last
  resort), computes `fullBleed` from real pixels (the same ink-box predicate
  as `logoTexPart` in `js/skins.js`: alpha ≥ 8 and luminance > 0.06; empty box
  is a hard failure so a badge can't silently never appear), extracts two
  brand hexes, verifies the asset 404s clean over a real static server (not
  `existsSync`, which passes a case mismatch the server then 404s on), and
  prints a pasteable `SKINS` row. Rejects marks made of black ink (dark ink
  above 35% of opaque pixels — see `modules/render.md`) and writes nothing
  into `assets/` for a rejected asset. `LEONARDO_API_KEY` is read from
  `process.env` at call time only and is never written to any file — this
  repo has no build step and no server, so anything under it is served
  verbatim to every browser. What stays manual, deliberately: looking at the
  discovered image before shipping it. `link rel=icon` is the weakest signal
  and real sites point it at unrelated art; no heuristic tells a logomark
  from a nice square graphic, and a wrong logo shipped confidently is worse
  than a slow one. The shop-blurb copy also stays manual — brand voice, not
  data.
- `tools/validate.mjs` also proves `freshSave()` and `save.js`'s `MIGRATIONS`
  chain describe the same object — see `conventions.md` hard rule 6.

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
