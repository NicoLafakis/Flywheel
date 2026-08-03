# Onboarding

## Prerequisites

- Any static file server (Python, `npx serve`, etc.)
- Node.js ≥ 18 for the validator (no npm install needed — zero dependencies)
- Playwright (global) only for browser smoke tests

## Run the game

```
python -m http.server 8000     # from repo root
# open http://localhost:8000/
```

## Run the proof

```
node tools/validate.mjs        # all 100 levels, ~10s
node tools/validate.mjs 42     # single level
```

Validator must print `ALL PASS` before any commit touching `js/citygen.js`,
`js/sim.js`, `js/tiers.js`, `js/levels.js`, or `js/voxelsim.js`. Besides the
campaign proofs it asserts the voxel sandbox is deterministic, spawn-stable,
and progressively collapsing (`Math.random` grep on all pure-sim files).

## Browser smoke test

Serve on a port, then drive Playwright (globally installed; resolve via
`process.env.APPDATA + "/npm/node_modules/playwright"`). Checks: title renders,
world map opens, level starts with no console errors, eating increases mass.

## First change checklist

1. Read `.wiki/architecture.md` and the relevant `modules/` page.
2. Make the change; keep the sim/render boundary intact.
3. `node tools/validate.mjs` → ALL PASS.
4. Update the wiki page and `STATUS.md` in the same commit.
