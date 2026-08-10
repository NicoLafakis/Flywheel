---
covers:
  - "js/levels.js"
  - "js/save.js"
  - "tools/validate.mjs"
---
# Campaign, saves & the beatability proof

## Purpose

Defines the 100-level campaign, persists progress, and proves every level
beatable headlessly.

## Key Files

| File | Purpose |
|------|---------|
| `js/levels.js` | `METROS`, `MECHANICS`, `levelDef(i)` formulas, stars/coins |
| `js/save.js` | localStorage schema v15 (+settings), migrations v1→v15, quarantine |
| `tools/validate.mjs` | Overlap + snack-ring + greedy-bot margin proof for every campaign level, plus `validateCambridge()` (drives the voxel-sandbox Cambridge scene through the same kind of greedy bot) and `validateOfflineBoot()` (parses `index.html` and fails on any external-origin runtime dependency — see `architecture.md`'s Boot section) |

## Talks To

- **citygen.js / sim.js** — validator imports the same modules as the game
- **ui/screens.js** — reads save for locks/stars, writes via `main.js` actions

## Gotchas

- Level params are *formulas* over index (size, clock, target, mechanics);
  the validator's margin gate (win with ≥ 15% clock left) is what makes a
  formula change safe. Never hand-edit a single level's target without
  re-running the full proof.
- Mechanic rollout schedule: golden L6, rivals L21, tide L41, landmark L20;
  landmark also on all metro finales + L91–100.
- Save version bumps need a `MIGRATIONS[oldV]` entry; future-version saves
  are quarantined, not read. v15's migration adds `equippedIndicator`
  (defaults to `'ind-default'`) for the shop's nav-indicator skins — see
  `.wiki/modules/ui.md`'s `INDICATOR_SKINS` gotcha.
- `starsForResult`: 1★ win, 2★ ≥20% time left, 3★ ≥35%.

**Planned, not built:** the online-Flywheel package
(`.wiki/features/online-flywheel/`) proposes a path from `save.js`'s local
schema to a cloud profile, so a guest's progress survives signing in. See
[12-migration-plan.md](../features/online-flywheel/12-migration-plan.md).
`save.js` itself is unchanged.
