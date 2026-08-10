# Runbook: run, validate, deploy

## Purpose

Daily operations for a static web game: run locally, prove levels beatable,
ship to static hosting.

## Run locally

1. `python -m http.server 8000` from repo root (or `npx serve`).
2. Open `http://localhost:8000/`.

## Confirm the game actually boots

`node tools/validate.mjs` cannot tell you this, and neither can `node --check`.
Both were observed passing on a renderer file the browser refuses to parse: the
validator drives the pure sim and never imports `js/voxelworld.js` or anything
else in the render ring, and `node --check` parses a file in isolation under
Node's rules rather than loading the module graph a browser would. No gate in
this repo can see a broken renderer, so a render-side change needs a browser
before it is believed.

The reliable check, against the static server from "Run locally":

1. Open `http://localhost:8000/` and watch the splash. It should be replaced by
   the first screen. If it instead reads "The game could not start. Please
   reload the page to try again.", the boot watchdog in `index.html` fired —
   either a module threw or 20 s elapsed with the splash still up. The console
   has the real error.
2. In the browser console, load the render ring directly:

   ```js
   await import('/js/voxelworld.js?cb=' + Date.now())
   ```

   A parse error prints with its file and line; success resolves to the module
   namespace. The cache-buster is not optional — a module already in the page's
   module map is never re-fetched or re-parsed, so without it a stale copy
   answers and a live syntax error stays hidden. Point it at whichever module
   the change touched; `js/voxelworld.js` is the one no other gate reaches.

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
4. Offline-boot failures (`validateOfflineBoot`):
   - `importmap resolves "three" to https://…` / `index.html loads a script
     from …` → a runtime dependency moved off-origin. Vendor it under
     `js/vendor/` and point the reference at the local path; a third-party host
     in the boot path leaves the player on the LOADING splash when that host
     blips (ADR-0014).
   - `index.html has no importmap` / `the importmap … is not valid JSON` → the
     browser drops a malformed map whole, so every bare `three` import fails and
     nothing in `js/` evaluates.

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
- **`node tools/probe-aniso.mjs`** — the ADR-0013 box-path coverage probe.
  Every shipped scene is still 100% cubes, so `validate.mjs` itself is
  structurally blind to the anisotropic (`sx/sy/sz`) code paths a box-shaped
  block exercises — this file builds its own fixture (thin/long steel arms,
  edge-touch vs. face-touch neighbours, off-axis contact sweeps, separation
  along each axis) and is what actually proves the per-axis engine change,
  most sharply the P2.4 hop-axis recovery in `voxelsim.js` where reading the
  wrong horizontal extent is a 4x cost error no cube could reveal. Not run by
  `validate.mjs`; run it directly when touching `voxelsim.js`'s box-extent
  code.
- **`node tools/probe-buildcost2.mjs [--n=9] [--scene=brooklyn] [--json]`** —
  build-cost and render-bucket probe for the five shipped voxel scenes
  (`gallery`, `manhattan`, `upper-manhattan`, `brooklyn`, `boston`). Times are
  min-of-N, round-robin across scenes (never all reps of one scene in a row),
  because a busy box contaminates every scene equally that way instead of
  landing entirely on whichever scene held the wall clock; `--n` below 3 is
  refused outright. Block/cell/mass/zone counts are exact and quotable even
  when the box is busy — the tool prints the median/min ratio and says so
  itself when it isn't. It reads `js/voxelworld.js`'s live render-bucket loop
  and hard-fails rather than reporting a number for a renderer that has since
  changed underneath it (`KEY_VARIANTS`, `resolveShippedVariant`) — a new
  bucket key needs a new variant added there, never a replacement of the old
  ones, since before/after comparisons depend on both staying computable from
  one committed instrument.

## Deploy

Static files only — copy repo root (minus `.wiki/`, `docs/`, `tools/` if you
want it lean; they're harmless if included) to any static host (GitHub Pages,
Netlify, S3+CDN). No server code, no env vars, no build step, and **no external
runtime dependency at all** — three.js is vendored at
`js/vendor/three.module.js` and the importmap in `index.html` resolves it
same-origin, which `validateOfflineBoot` enforces (ADR-0014). `js/vendor/` must
ship; leaving it out is the one omission that breaks the deploy outright.

## Rollback / recovery

- Re-deploy the previous static bundle. Save data is client-side
  (`localStorage`) and unaffected by deploys; schema migrations run on load.
- If a save-shape change shipped badly, bump `CURRENT_VERSION` and add a
  migration that repairs the field — never delete user saves; quarantined
  blobs sit under `hole-city-save.quarantine`.

## Common failures

- **Blank page, import errors** → served over `file://` (importmaps and module
  imports need a real origin; must use an HTTP server), or `js/vendor/` missing
  from the deployed bundle.
- **Stuck on the LOADING splash, then "The game could not start"** → the boot
  watchdog fired. Something in the module graph failed to load or threw; the
  console has it, and the direct-import check above narrows it to a file.
- **World map shows no cards / click does nothing** → a screen render threw;
  check console. (History: `append()` chaining bug.)
- **All levels locked** → corrupt save was quarantined; check
  `localStorage['hole-city-save.quarantine']`.
