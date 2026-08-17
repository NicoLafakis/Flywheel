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
| `js/save.js` | localStorage schema v24 (+settings, +upgrades, +challenges), migrations v1→v24, quarantine |
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
  `LEVEL_CLOCK_SECONDS` from `js/levelclock.js` — one declaration shared with
  the sandbox — and `validateLevelClock()` asserts all 100 levels agree. It
  shipped at 180 s and was extended to **300 s (5:00)** on 2026-08-14 to give
  speed-boost routing and full clears more room; `js/levels.js`'s own code
  comment still says "every playable level is 180 s" — read the constant, not
  the comment. The old `75 + g * 0.75 + metroIndex * 3` ladder that predates
  both gave 75–160 s. Consequence worth knowing: `js/citygen.js` times tides at
  `level.clock * (0.35 + i*0.25)`, a value DERIVED from the clock, so tides
  fire later in absolute seconds whenever the clock constant moves. That is a
  campaign sim-output change; it does not touch `sim_version`, which covers
  only the ranked `run90` path.
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
- **Economy values are derived, and none of them are persisted**
  (T-701/T-702/T-703, 2026-08-16). Three economy defects were closed together
  and none needed a save migration, for the same reason: `save.js` stores what
  the player OWNS (`coins`, `ownedItems`, `upgrades` ranks, `sandbox` records)
  and never a price, payout, or multiplier, so a retune takes effect on the
  next run without a version bump or re-seed. (1) `CITY_COIN_TIERS` in
  `js/voxelsim.js` is now projected from `CITY_CATALOG` instead of duplicating
  its three coin fields — the two copies had drifted, and `gallery` was paying
  `tokyo`'s apex rate; see `.wiki/modules/voxel.md`. (2) `options.growthBonus`
  is now read by `sim.js`'s `completeEat`, so the `growth` upgrade rank finally
  does in the campaign what it already did in the sandbox; an already-purchased
  rank started working immediately because the bonus is recomputed from the
  save on every `startLevel()`. See `.wiki/modules/sim.md`. (3) That bonus is
  the growth RANK and nothing else. The legacy `growth5` shop item is not a
  second, independent term: the v20 migration (`__MIGRATIONS[19]` in
  `js/save.js`) converts owning it into `upgrades.growth >= 1`, and rank 1 IS
  its +5%, so `computeShopBonus()` adding `0.05` again for the same
  `ownedItems` marker paid one purchase twice. Harmless while nothing read
  `growthBonus`; (2) would have made it live, handing a pre-v20 save +10% in
  the campaign against the +5% it gets in a city, since `VoxelSandboxSim`
  derives `growthMult` from `save.upgrades` alone and never reads
  `ownedItems`. The migration is the single source of truth for that item, so
  the redundant `main.js` term is deleted rather than subtracted back out.

  All three are pinned by `tools/economy-consistency.test.mjs`, spawned from
  the `multiplayer` section of `validate.mjs` alongside the other standalone
  cross-file suites. It asserts that a `growthBonus: 0` run is bit-identical to
  `new Sim(level)`, so the greedy-bot beatability proof is still measuring an
  un-upgraded game, and — because `js/main.js` cannot be imported headlessly
  (`document.getElementById` at module scope, three.js in its import graph) —
  it lifts the `computeShopBonus()` object literal out of the source text and
  evaluates it, so the campaign/sandbox parity check is on the number the
  shipped line produces rather than on the shape of the text producing it.

- **Partner-skin approval gating and the v24 refund (2026-08-17).** Only two of
  the eight partner agencies have granted permission to use their mark, so
  `js/skinapproval.js` adds `approved: true` as the entry condition for the
  `partner` family and the other seven rows lose it. The predicate lives in its
  own import-free module rather than in `js/skins.js`, which pulls three.js at
  module scope and is therefore unreachable from the Node validator and from
  `js/upgrades.js` on the pure-sim side of the boundary. It fails CLOSED
  (`row.approved === true`), so a future partner row that forgets the field is
  hidden rather than published.

  Withdrawing a purchasable item is not the same as never shipping it: seven
  rows were buyable for 750 coins each and some saves own them. The v24
  migration refunds every withdrawn id at its price and un-equips it back to
  `classic`. Its price table is a frozen LITERAL in `js/save.js`, deliberately
  NOT a read of the live `SKINS` catalog — the rows it prices are expected to
  be deleted from `js/skins.js` eventually, and a migration that stops paying
  out when its subject disappears is a migration that silently breaks years
  after anyone remembers it exists.

  The save is not the only path a withdrawn id arrives on. `makeSkin()` now
  resolves through `skinRowFor()`, which falls back to `classic` on
  UNAVAILABLE rather than on UNKNOWN — a peer's roster entry
  (`js/multiplayer/roster.js` → `js/world3d.js`) supplies a skin id straight
  off the wire, where no local migration can reach it. Indicators resolve the
  same way through `indicatorRowFor()`; `ind-supered` stays live because
  Supered is approved, so no indicator row actually changes today.
  `tools/partner-approval.test.mjs` pins the set at exactly seven withdrawn
  ids, so an eighth going quiet fails rather than passing unnoticed.

**Reconciled 2026-08-10:** the full day's commits — `js/voxelkit.js`'s twelve
new gallery builders, the multi-hole sim roster (`sim.holes[]`), and that
day's `js/net/**`/`js/demo/**` multiplayer work (both retired 2026-08-16 and
replaced by `js/multiplayer/`; see `architecture.md`'s "Key decisions") —
don't touch `js/save.js` or `tools/validate.mjs`; this page's save-schema and
validator description stand as written.

**Planned, not built:** the online-Flywheel package proposed a path from
`save.js`'s local schema to a cloud profile, so a guest's progress survives
signing in (see its migration plan, §12). That package was retired along
with the legacy multiplayer stack on 2026-08-16 and has no replacement yet.
`save.js` itself is unchanged.
