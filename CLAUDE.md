# CLAUDE.md — Flywheel

Static browser game, no build step. Read `.wiki/INDEX.md` for the full wiki;
`STATUS.md` for where things stand.

## Commands

- Run: `python -m http.server 8000` → `http://localhost:8000/`
- Validate (REQUIRED before any commit touching sim code):
  `node tools/validate-changed.mjs` → must print `ALL PASS`. It maps the files
  you changed to the sections that cover them, runs only those, and prints what
  it chose and why. Anything it cannot map escalates to the full suite rather
  than quietly narrowing. A scene edit typically costs seconds to a few minutes.
- Full suite: `node tools/validate.mjs`. **THIS TAKES HOURS.** Measured
  2026-08-23: the `cambridge` section alone is **4 h 16 m**, and it is not block
  count that costs it — Upper Manhattan is a bigger map (73,393 blocks vs
  72,943) and takes 27 s. Cambridge's cost is its scripted excursion, run twice,
  through superlinear debris churn (see the section's own GATE VS SOAK note and
  RCA-2026-08-11). Use the full suite for release checks, not for commits.
  This is why it is no longer the pre-commit gate: a gate nobody can run is
  worse than none, because it gets quoted as though it had been.
- Single section: `FW_VALIDATE_SECTIONS=<name> node tools/validate.mjs` (e.g.
  `offlineBoot`, `saveSchema`, `fwMath`). Section names are NOT always scene
  ids — Upper Manhattan's section is `upperManhattan`. An unknown name is a hard
  failure; it used to select nothing and still print `ALL PASS`.
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

## Geometry terminology and map authoring

These rules apply project-wide to every existing-map remediation and every new
map. Read [.wiki/geometry-authoring.md](.wiki/geometry-authoring.md) before
creating or changing map geometry.

- **Voxel** means a cube-shaped physical piece. **Architectural piece** means
  a non-cube physical piece, such as a wall panel, beam, column or floor slab.
  **Physical piece count** is the total of both; grid cells are a separate metric.
- Use the owner-approved twin-city Lab as the reference process: consolidate
  suitable surfaces into bounded architectural pieces, retain cubes where they
  serve eating, detail or silhouette, and preserve satisfying progressive destruction.
- Build new maps with this mixed approach from the outset. For existing maps,
  preserve their identity and compare before/after geometry and gameplay.
- Keep efficiency savings. Do not add filler to restore an old count or treat
  catalog counts as quotas.
- Keep interiors hollow and structures divisible into multiple satisfying bites.
  Verify startup food, growth, support/collapse and full-clear reachability;
  fewer pieces alone do not prove better performance or preserved fun.
- Follow the existing TDD and simulation invariants. Geometry optimization does
  not authorize changing the fixed timestep, physics or reward balance.

## House style

ES modules, one concern per file, shared three.js geometry/material caches,
comments explain *why*. See `.wiki/conventions.md`.

## Doc hygiene

Update `STATUS.md` and the covering `.wiki/modules/*.md` page in the same
commit as code changes. ADRs are append-only. Visual-polish roadmap lives in
`.wiki/visual-direction.md`.
