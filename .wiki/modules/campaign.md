---
covers:
  - "js/levels.js"
  - "js/citycatalog.js"
  - "js/save.js"
  - "js/ui/screens.js"
  - "js/voxelsim.js"
  - "tools/validate.mjs"
  - "tools/validate-campaign.mjs"
---
# Campaign, saves & the beatability proof

## Current implementation

The Lab comparison (2026-09-13) contains 6,872 total physical pieces. Its
Prologue rewards remain 60 coins at value 1 plus the 25-coin clear bonus.
The UI uses physical pieces for total geometry counts, reserving voxel for cubes.

Tokyo geometry v2 displays 34,796 physical pieces. Its explicit `economyWeight`
retains 84,122, the authored reward-tier weight: optimization changes neither coin
rewards nor canonical story order. The economy validator uses that weight when
present and otherwise the original catalog block count. World Tour copy matches
the current physical count. Save schema and progression gates are unchanged.

The workspace contains the 100-level campaign, a 29-entry metropolis catalog
with 24 playable cities, Act filters and mission dossiers, local save data,
and optional cloud progress sync. The full storyline design goes beyond the
implemented catalog and progression UI.

| File | Responsibility |
|---|---|
| `js/levels.js` | Level formulas, mechanics, stars and coins |
| `js/citycatalog.js` | Catalog metadata, Acts, narrative fields, progression and challenge unlock rules |
| `js/save.js` | Schema v25, migrations, settings/upgrades/challenges, cloud bookkeeping and bad-save quarantine |
| `js/ui/screens.js` | Act-based city selection, mission dossiers, profile and result screens |
| `js/levelclock.js` | 300-second levels, 180-second city challenges, 90-second secret challenges and clock formatting |
| `tools/validate.mjs` | Full simulation, save, progression and beatability validation |
| `tools/validate-campaign.mjs` | Catalog, narrative metadata, economy and unlock regression checks |

## Boundaries and invariants

The campaign validator imports the same pure city generation and simulation
modules as the game. Level parameters are formulas over the index; changes
must preserve the validator's beatability margins. Screens read saved progress
for locks and records; the save layer handles migration and quarantine.
Future-version saves are quarantined. A schema change requires a version bump
and a migration; the current `CURRENT_VERSION` is 25.

Economy values are derived from the catalog rather than persisted as another
copy. `CITY_COIN_TIERS` projects the city metadata into the voxel simulation.
Clock values come from `levelclock.js`; the HUD and simulation share them.

## Designed, not implemented

[ADR-0023](../adr/0023-marketing-engine-modules-and-blueprint-workbench.md) and
[the global-campaign package](../features/global-campaign/) specify Marketing
Engine module extraction, the full-clear banking gate, early-extraction
bonuses, quadrant perks and a blueprint workbench. They also propose schema
v26 with `campaignModules`, `quadrantsUnlocked` and `speedrunExtractions`.
Those fields, the v26 migration and `showMachineBlueprint` are absent from the
current implementation. The design package must not be treated as evidence
that these features are shipped.

## Sandbox bestSize repair (2026-09-08)

The results callback supplies `finished.hole.size`. `recordSandboxResult`
keeps a finite previous maximum, defaults missing/non-finite values to SIZE 1,
and repairs legacy null records on the next result. No fields change, so the
schema remains v25. `tools/sandbox-size.test.mjs` executes the actual caller
payload and checks fresh, damaged and repeated records.
