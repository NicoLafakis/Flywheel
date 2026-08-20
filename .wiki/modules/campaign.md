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

## Purpose

Defines the 100-level campaign, the 29-metropolis global storyline odyssey, persists progress across local/cloud saves, and proves every level beatable headlessly.

## Key Files

| File | Purpose |
|------|---------|
| `js/levels.js` | `METROS`, `MECHANICS`, `levelDef(i)` formulas, stars/coins |
| `js/citycatalog.js` | Pure catalog metadata & progression rules for the 29-metropolis global campaign across 7 Acts, 3-minute challenges, secret 90s unlock logic, and the 29 `moduleToken` definitions |
| `js/save.js` | localStorage schema v26 (+settings, +upgrades, +challenges, +v25 `cloud{}` sync bookkeeping, +v26 `campaignModules[]`, `quadrantsUnlocked[]`, `speedrunExtractions[]`), migrations v1→v26, quarantine |
| `js/ui/screens.js` | Act filter carousel, Sprocket Mission Dossiers, Master Machine Blueprint Screen (`showMachineBlueprint`), victory debriefs |
| `tools/validate.mjs` | Overlap + snack-ring + greedy-bot margin proof for every campaign level, plus `validateCambridge()`, `validateSydney()`, and `validateOfflineBoot()` |
| `tools/validate-campaign.mjs` | TDD validator asserting schema integrity, monotonic economy ladder, and unlock gates across all 29 cities |
| `.wiki/features/global-campaign/` | Comprehensive package specification for Sprocket's Odyssey: 29 metropolises, 7 Acts, world bible, mission dossiers, master module catalog, and progression rules |
| `.wiki/adr/0023-marketing-engine-modules-and-blueprint-workbench.md` | Architecture Decision Record for Marketing Engine modules, blueprint workbench, and save schema v26 |

## Talks To

- **citygen.js / sim.js** — validator imports the same modules as the game
- **ui/screens.js** — reads save for locks/stars/modules/quadrants, renders Act-based carousel, mission dossiers, and the Machine Blueprint Workbench
- **ui/ready.js** — renders level-start Ready Gate with active city mission directives
- **ui/hud.js** — renders golden Sub-60s early extraction countdown timer and `⚡ 2X BONUS ARMED!` badge

## Gotchas & Invariants

- **Level params are *formulas* over index** (size, target, mechanics); the validator's margin gate (win with ≥ 15% clock left) is what makes a formula change safe. Never hand-edit a single level's target without re-running the full proof.
- **Clock duration is 300s (5:00)** across all 100 levels and sandboxes (`LEVEL_CLOCK_SECONDS` in `js/levelclock.js`).
- **Storyline Module Extraction & Option B Gate (ADR-0023)**:
  - Each metropolis contains one Marketing Engine module inside its "Where's Waldo" target building.
  - Collapsing the building ejects the module token into the field.
  - Swallowing the module in $\le 60\text{s}$ arms a $2.0\times$ coin and score payout multiplier upon 100% full clear.
  - **Option B Gate**: The module is only permanently banked into `save.campaignModules` upon achieving a **100% full clear** within the 5-minute sector limit.
- **Four Passive Quadrant Perks**:
  - `AWARENESS` (Acts I–II) → **Inbound Magnetism**: +15% magnetic suction radius.
  - `CONVERSION` (Acts II–IV) → **Pipeline Velocity**: -10% mass threshold required for size tiers.
  - `RETENTION` (Acts IV–V) → **Low-Churn Buffer**: +1.0s combo timer decay grace window (2.5s total).
  - `ANALYTICS` (Acts VI–VII) → **High-Yield Attribution**: +25% coin and score yield across all cities.
  - `UNBOUND CORE` (Cambridge Finale) → **Perpetual Motion**: Golden cosmetic overdrive trail.
- **Save version bumps need a `MIGRATIONS[oldV]` entry**; future-version saves are quarantined, not read.
  - v26 migration adds `campaignModules: []`, `quadrantsUnlocked: []`, and `speedrunExtractions: []`.
- **Economy values are derived, and none of them are persisted** (T-701/T-702/T-703).
  - `CITY_COIN_TIERS` in `js/voxelsim.js` is projected directly from `CITY_CATALOG`.
  - Economy follows the role-based monotonic ladder verified by `tools/validate-campaign.mjs`.
