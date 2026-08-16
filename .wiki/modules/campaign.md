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
| `js/citycatalog.js` | Pure catalog metadata & progression rules for metropolis sandboxes, 3-minute challenges, and secret 90s unlock logic |
| `js/save.js` | localStorage schema v21 (+settings, +upgrades, +challenges), migrations v1→v21, quarantine |
| `tools/validate.mjs` | Overlap + snack-ring + greedy-bot margin proof for every campaign level, plus `validateCambridge()` (drives the voxel-sandbox Cambridge scene through the same kind of greedy bot) and `validateOfflineBoot()` (parses `index.html` and fails on any external-origin runtime dependency — see `architecture.md`'s Boot section) |

## Talks To

- **citygen.js / sim.js** — validator imports the same modules as the game
- **ui/screens.js** — reads save for locks/stars, writes via `main.js` actions

## Gotchas

- Level params are *formulas* over index (size, target, mechanics); the
  validator's margin gate (win with ≥ 15% clock left) is what makes a formula
  change safe. Never hand-edit a single level's target without re-running the
  full proof.
- `clock` is NO LONGER a formula (2026-08-13). Every level carries exactly
  `LEVEL_CLOCK_SECONDS` from `js/levelclock.js` — 180 s, one declaration shared
  with the sandbox — and `validateLevelClock()` asserts all 100 levels agree.
  The old `75 + g * 0.75 + metroIndex * 3` ladder gave 75–160 s. Consequence
  worth knowing: `js/citygen.js` times tides at `level.clock * (0.35 + i*0.25)`,
  a value DERIVED from the clock, so tides now fire later in absolute seconds on
  every campaign level. That is a campaign sim-output change; it does not touch
  `sim_version`, which covers only the ranked `run90` path.
- Mechanic rollout schedule: golden L6, rivals L21, tide L41, landmark L20;
  landmark also on all metro finales + L91–100.
- Save version bumps need a `MIGRATIONS[oldV]` entry; future-version saves
  are quarantined, not read. v15's migration adds `equippedIndicator`
  (defaults to `'ind-default'`) for the shop's nav-indicator skins — see
  `.wiki/modules/ui.md`'s `INDICATOR_SKINS` gotcha.
- `ambVol` joined `defaultSettings()` for the ambience volume slider
  (2026-08-12) without a version bump: same rationale as `pointMove`, an
  absent key reads as the default through every consumer's `typeof … ===
  'number'` guard, so an upgrading player's ambience level is just the
  default rather than requiring a migration. It and `sfxVol` take their
  values from `js/audio/mix.js`, which owns the shipped mix (0.7 effects /
  0.4 ambience / 0.3 music); retuning those numbers is likewise not a
  migration — an existing player's stored level is legal, just old, and
  `reseedAudioMix()` moves it forward once against a localStorage version
  stamp so the save-less surfaces get the same treatment. See
  `.wiki/modules/audio.md`.
- `starsForResult`: 1★ win, 2★ ≥20% time left, 3★ ≥35%.

**Reconciled 2026-08-10:** the full day's commits — `js/voxelkit.js`'s twelve
new gallery builders, the multi-hole sim roster (`sim.holes[]`), and the
`js/net/**`/`js/demo/**` work that took multiplayer from a wire-layer skeleton
to a live two-device arena over Supabase Realtime (see `architecture.md`) —
don't touch `js/save.js` or `tools/validate.mjs`; this page's save-schema and
validator description stand as written.

**Planned, not built:** the online-Flywheel package
(`.wiki/features/online-flywheel/`) proposes a path from `save.js`'s local
schema to a cloud profile, so a guest's progress survives signing in. See
[12-migration-plan.md](../features/online-flywheel/12-migration-plan.md).
`save.js` itself is unchanged.
