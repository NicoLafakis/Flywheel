# CLAUDE.md — Flywheel

Static browser game, no build step. Read `.wiki/INDEX.md` for the full wiki;
`STATUS.md` for where things stand.

## Commands

- Run: `python -m http.server 8000` → `http://localhost:8000/`
- Validate (REQUIRED before any commit touching `js/citygen.js`, `js/sim.js`,
  `js/tiers.js`, `js/levels.js`, `js/voxelsim.js`, `js/voxelscene-manhattan.js`,
  `js/voxelscene-upper-manhattan.js`, `js/voxelscene-brooklyn.js`,
  `js/voxelkit.js`): `node tools/validate.mjs` → must print `ALL PASS`
- Fast single section check: `node tools/validate.mjs` with `FW_VALIDATE_SECTIONS=<name>` (e.g. `offlineBoot`, `saveSchema`, `fwMath`, etc.)
- No package.json, no lint, no test runner — the validator IS the test suite.

## Development Methodology: Test-Driven Development (TDD)

**All code changes, bug fixes, and feature additions MUST strictly follow TDD:**
1. **Red (Write Tests First)**:
   - Before writing or modifying any implementation code, write a failing automated test or assertion in `tools/validate.mjs` (or a dedicated modular validator / test harness).
   - Run the test suite to confirm the test fails as expected and reproduces the issue or asserts the missing behavior.
2. **Green (Write Minimal Implementation)**:
   - Write the cleanest, most concise implementation necessary to make the test pass.
   - Adhere strictly to the pure-sim boundary (no three.js/DOM in sim code), seeded RNG determinism, and performance requirements.
3. **Refactor (Clean & Verify)**:
   - Refactor code for clarity, maintainability, and zero performance regression.
   - Run `node tools/validate.mjs` (or the relevant test suites) to ensure all tests pass (`ALL PASS`).
4. **Zero Untested Code**:
   - Never write or commit code without corresponding automated tests written upfront.

## Non-negotiable invariants

1. **Strict TDD**: Write failing tests before implementation code for every change; all code must pass `node tools/validate.mjs`.
2. No `Math.random()` in `js/` — all randomness via `rng.js` (seeded).
3. Pure sim boundary: no three.js/DOM imports in `rng.js`, `tiers.js`,
   `citygen.js`, `levels.js`, `sim.js` (the Node validator imports them).
4. Gameplay state changes only in `sim.step(1/60)`.
5. Size/edibility only via `tiers.js` (strict 1.35× ladder; gate is
   `playerRadius > tierRadius`).
6. Placement no-overlap by construction via the spatial hash; snack ring is
   placed first; landmark uses the documented eviction path only.
7. Save schema changes: bump `CURRENT_VERSION` + add a migration in
   `save.js`; quarantine, never delete, bad saves.
8. No browser-writable score reaches a board. A client may supply only a
   claimed score for the server's verification-cost gate; the displayed score
   is recomputed by the server from the replay.
9. `js/board/**` never mutates simulation state and never imports three.js;
   network work stays outside the synchronous fixed-step loop.
10. Network is optional: an offline player can always start and finish every
    city or RUN, and failed ranked submissions remain queued rather than
    blocking play.

## House style

ES modules, one concern per file, shared three.js geometry/material caches,
comments explain *why*. See `.wiki/conventions.md`.

## Doc hygiene

Update `STATUS.md` and the covering `.wiki/modules/*.md` page in the same
commit as code changes. ADRs are append-only. Visual-polish roadmap lives in
`.wiki/visual-direction.md`.
