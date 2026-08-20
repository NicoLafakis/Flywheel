# ADR-0023: Marketing Engine Modules, Blueprint Workbench & Save Schema v26

**Status**: ACCEPTED (2026-08-20)  
**Date**: 2026-08-20  
**Deciders**: Antigravity, Nico Lafakis  
**Consulted**: Progression, Simulation, UI, Save Systems  

---

## 1. Context & Problem Statement

Flywheel is narrative-first: "A sprocket's story." To turn the game's 29-metropolis campaign from a series of disconnected sandboxes into a coherent, epic narrative odyssey, the player needs:
1. **A Concrete In-Universe Goal**: Reassembling the **Universal Marketing Flywheel** by collecting 29 missing mechanical components scattered across the globe.
2. **Tactical In-Level Objectives**: Unique "Where's Waldo" target buildings in each city holding that metropolis's module, solvable via Carmen Sandiego briefing clues.
3. **Speedrun Replayability**: A Sub-60s Early Extraction window awarding a $2\times$ coin and score multiplier upon 100% full clear.
4. **Meta-Progression & Permanent Rewards**: A **Master Machine Blueprint Screen ("Reverse Operation")** where assembled quadrants unlock permanent, passive gameplay perks.

---

## 2. Decision Drivers

- **Deterministic Pure-Sim Boundary**: All module extraction, quadrant perk calculations, and economy multipliers must execute headlessly in the pure sim without DOM/three.js dependencies.
- **Save Integrity & Schema Versioning**: Progression must be safely persisted across local and cloud saves via an official schema bump (v25 → v26) with explicit migration guarantees.
- **No Cheese Progression (Option B Gate)**: Swallowing a module only banks it if the sector achieves a **100% full clear** within the 5-minute clock limit.
- **Strict TDD Compliance**: Every new feature must be tested upfront via unit test suites (`validate-campaign.mjs`, `save-migration-v26.test.mjs`, `campaign-ui.test.mjs`, `module-extraction.test.mjs`).

---

## 3. Considered Options

1. **Option A: Immediate Bank-on-Swallow**:
   - *Pros*: Player gets the part immediately.
   - *Cons*: Encourages "cheese quits" where players dive straight for the target building, eat the part, and immediately restart/exit without playing the city.
2. **Option B: 100% Full-Clear Banking Gate (Adopted)**:
   - *Pros*: Requires the player to master and clear the entire city sandbox to officially secure the part for the master machine.
   - *Cons*: High difficulty for late-game cities (mitigated by generous 5-minute clock).
3. **Option C: Tier-Gated Extraction**:
   - *Pros*: Ties part extraction to reaching Size 7.
   - *Cons*: Eliminates the sub-60s speedrun extraction dynamic.

---

## 4. Decision Outcome

**Adopt Option B (100% Full-Clear Gate) with Save Schema v26**:

1. **Catalog Metadata (`js/citycatalog.js`)**:
   - Every city defines a canonical `moduleToken` object (`id`, `name`, `quadrant`, `desc`, `targetBuilding`, `intelClue`, `difficulty`, `revivalWave`).
2. **Save Schema v26 (`js/save.js`)**:
   - Bump `CURRENT_VERSION = 26`.
   - Add `campaignModules: []`, `quadrantsUnlocked: []`, and `speedrunExtractions: []` to `freshSave()`.
   - Add migration `__MIGRATIONS[25]`.
3. **Sub-60s Speedrun Early Extraction**:
   - Swallowing the module in $\le 60\text{s}$ arms `sim.speedrunBonusArmed = true`.
   - On 100% full clear, all coin and score payouts are multiplied by $2.0\times$.
4. **Four Passive Quadrant Perks**:
   - **Quadrant 1 (Awareness)**: +15% Magnetic Pull Radius (`js/voxelsim.js`).
   - **Quadrant 2 (Conversion)**: -10% Size Tier Mass Threshold (`js/tiers.js`).
   - **Quadrant 3 (Retention)**: +1.0s Combo Timer Grace Window (`js/voxelsim.js`).
   - **Quadrant 4 (Analytics)**: +25% Base Coin & Score Payout (`js/voxelsim.js`).
   - **UNBOUND Center Hub**: Golden overdrive particle state and instant terminal velocity (`js/voxelworld.js`).
5. **Blueprint Workbench UI (`js/ui/screens.js`)**:
   - Visual interactive schematic cutaway displaying the 4 quadrants, 29 socket states, active perks, and rescued Momentum Friends gallery.

---

## 5. Consequences & Invariants

- **Save Invariant**: Quarantining bad future saves remains intact. Migration v25 → v26 guarantees zero progress loss for existing players.
- **Simulation Invariant**: Passive perks act strictly through deterministic multipliers in the fixed-step sim loop (`sim.step(1/60)`).
- **Validation**: All 29 cities and their module metadata are continuously verified by `tools/validate-campaign.mjs`.
