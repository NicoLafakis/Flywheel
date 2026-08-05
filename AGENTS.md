# AGENTS.md — Flywheel

Static browser game, no build step. Read `.wiki/INDEX.md` for the full wiki;
`STATUS.md` for where things stand.

## Commands

- Run: `python -m http.server 8000` → `http://localhost:8000/`
- Validate (REQUIRED before any commit touching `js/citygen.js`, `js/sim.js`,
  `js/tiers.js`, `js/levels.js`, `js/voxelsim.js`, `js/voxelscene-manhattan.js`):
  `node tools/validate.mjs` → must print `ALL PASS`
- No package.json, no lint, no test runner — the validator IS the test suite.

## Non-negotiable invariants

1. No `Math.random()` in `js/` — all randomness via `rng.js` (seeded).
2. Pure sim boundary: no three.js/DOM imports in `rng.js`, `tiers.js`,
   `citygen.js`, `levels.js`, `sim.js` (the Node validator imports them).
3. Gameplay state changes only in `sim.step(1/60)`.
4. Size/edibility only via `tiers.js` (strict 1.35× ladder; gate is
   `playerRadius > tierRadius`).
5. Placement no-overlap by construction via the spatial hash; snack ring is
   placed first; landmark uses the documented eviction path only.
6. Save schema changes: bump `CURRENT_VERSION` + add a migration in
   `save.js`; quarantine, never delete, bad saves.

## House style

ES modules, one concern per file, shared three.js geometry/material caches,
comments explain *why*. See `.wiki/conventions.md`.

## Doc hygiene

Update `STATUS.md` and the covering `.wiki/modules/*.md` page in the same
commit as code changes. ADRs are append-only. Visual-polish roadmap lives in
`.wiki/visual-direction.md`.
