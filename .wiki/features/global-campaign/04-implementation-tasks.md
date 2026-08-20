---
covers:
  - "js/citycatalog.js"
  - "js/ui/screens.js"
  - "js/ui/ready.js"
  - "js/ui/hud.js"
  - "js/save.js"
  - "js/voxelsim.js"
  - "js/tiers.js"
  - "tools/validate.mjs"
  - "tools/validate-campaign.mjs"
---
# 04 — Implementation Tasks: Global Campaign & Storyline Rollout

This document provides the actionable, step-by-step TDD task breakdown for implementing the complete Sprocket storyline, Marketing Engine modules, Workshop blueprint workbench, and speedrun extraction loops.

---

## Phase Tracker

- [x] **Phase 1: Catalog & Data Schema Foundation**
  - [x] Author the canonical 29-metropolis roster across 7 Acts in `js/citycatalog.js`.
  - [x] Implement helper query methods (`getSortedCityCatalog()`, `getPlayableCityCatalog()`, `isCityUnlocked()`, `isCityChallengeCompleted()`, `getCompletedChallengeCount()`, `isSecret90sChallengeUnlocked()`).
  - [x] Write `tools/validate-campaign.mjs` asserting all 29 cities pass schema integrity, unique scenes, ascending block targets, and deterministic progression links.

- [x] **Phase 2: UI & Mission Dossier Integration**
  - [x] Expand City Selection screen (`js/ui/screens.js`) with Act Filter Tabs (All, Prologue, Acts I–VII).
  - [x] Add Sprocket Mission Dossier drawers on city cards with tactical directive, transmission, hero landmarks, and rescued companion bot.
  - [x] Integrate Ready Gate Story Directive in `js/ui/ready.js` pulling the active city's narrative directive.
  - [x] Update Results Screen in `js/ui/screens.js` with story debrief transmission and companion bot note for 100% full clears.
  - [x] Write `tools/campaign-ui.test.mjs` validating UI components and DOM integration.

- [ ] **Phase 3: Module Token Metadata & Save Schema v26 Migration**
  - [ ] **Red (Write Tests First):** Write `tools/save-migration-v26.test.mjs` testing:
    - Save schema bump `CURRENT_VERSION = 26`.
    - Migration v25 → v26 initializing `campaignModules: []`, `quadrantsUnlocked: []`, `speedrunExtractions: []`.
    - Backward-compatibility quarantine for invalid future saves.
    - Quota-safe serialization and local/cloud progress sync compatibility.
  - [ ] **Green (Implementation):**
    - Populate all 29 `moduleToken` objects in `js/citycatalog.js` matching `05-master-module-catalog.md`.
    - Bump `CURRENT_VERSION` to `26` and add `__MIGRATIONS[25]` in `js/save.js`.
    - Add helper functions in `js/save.js`: `recordModuleBanked(save, moduleId, cityScene)`, `recordSpeedrunExtraction(save, cityScene)`, `hasModule(save, moduleId)`, `isQuadrantComplete(save, quadrantId)`.
  - [ ] **Refactor & Verify:** Run `node tools/save-migration-v26.test.mjs` and `node tools/validate-campaign.mjs` until green.

- [ ] **Phase 4: Master Machine Blueprint / Workshop Screen**
  - [ ] **Red (Write Tests First):** Expand `tools/campaign-ui.test.mjs` to assert `showMachineBlueprint()` renders:
    - 4 Quadrant panels (Awareness, Conversion, Retention, Analytics) surrounding the central Sprocket Hub.
    - 29 modular socket elements with `.locked`, `.recovered`, and `.speedrun-badge` classes.
    - Active passive perk indicators with live completion percentages.
    - Rescued Momentum Friends gallery row.
  - [ ] **Green (Implementation):**
    - Build `showMachineBlueprint(save, onBack)` in `js/ui/screens.js` (or a dedicated `js/ui/workbench.js`).
    - Add WORKSHOP / BLUEPRINT button to main menu and city select screens.
    - Style blueprint screen in `css/main.css` with industrial blueprint styling and glowing trace lines.
  - [ ] **Refactor & Verify:** Run `node tools/campaign-ui.test.mjs`.

- [ ] **Phase 5: In-Level Target Building & Physical Module Extraction**
  - [ ] **Red (Write Tests First):** Write `tools/module-extraction.test.mjs` verifying:
    - `VoxelSandboxSim` spawns `sim.moduleToken` when target building collapses or at defined coords.
    - Swallowing module raises `module_extracted` sim event and sets `sim.moduleExtracted = true`.
    - Sub-60s extraction sets `sim.speedrunBonusArmed = true`.
    - Option B gate: 100% full clear banks the module into `save.campaignModules`; non-100% clear does not bank.
  - [ ] **Green (Implementation):**
    - Tag target buildings in authored scenes (`js/voxelscene-*.js`).
    - In `js/voxelsim.js`, spawn physical module token pickup on target building foundation detachment.
    - In `js/ui/hud.js`, add golden 60-second early extraction timer and `⚡ 2X BONUS ARMED!` badge.
    - In `js/main.js`, handle `module_extracted` event with audio stinger and milestone celebration banner.
    - In `js/save.js` (`recordLevelResult`), bank module and 2x payout if conditions met.
  - [ ] **Refactor & Verify:** Run `node tools/module-extraction.test.mjs`.

- [ ] **Phase 6: Passive Quadrant Perks Wiring & Sim Hooks**
  - [ ] **Red (Write Tests First):** Write `tools/quadrant-perks.test.mjs` asserting:
    - `AWARENESS` active -> suction radius is $1.15\times$.
    - `CONVERSION` active -> size tier mass requirement is $0.90\times$.
    - `RETENTION` active -> combo grace decay window is $2.5\text{s}$ ($1.67\times$).
    - `ANALYTICS` active -> base coin payout is $1.25\times$.
    - `CORE` active -> overdrive particle state enabled.
  - [ ] **Green (Implementation):**
    - Wire `hasQuadrant(save, 'AWARENESS')` into `js/voxelsim.js` magnetic suction logic.
    - Wire `hasQuadrant(save, 'CONVERSION')` into `js/tiers.js` / `js/voxelsim.js` tier progression.
    - Wire `hasQuadrant(save, 'RETENTION')` into `js/voxelsim.js` combo decay clock.
    - Wire `hasQuadrant(save, 'ANALYTICS')` into `js/voxelsim.js` coin award calculations.
  - [ ] **Refactor & Verify:** Run `node tools/quadrant-perks.test.mjs`.

- [ ] **Phase 7: Full Suite Integration & Invariant Audit**
  - [ ] Register all new test suites into `tools/validate.mjs`.
  - [ ] Run full headless validator suite `node tools/validate.mjs` to ensure zero regressions across all 11 playable scenes.

- [ ] **Phase 8: Documentation & Status Sync**
  - [ ] Update `STATUS.md` with completed features and milestones.
  - [ ] Update `.wiki/modules/campaign.md` and `.wiki/INDEX.md`.
  - [ ] Append handoff entry to `MESSAGES.md`.
