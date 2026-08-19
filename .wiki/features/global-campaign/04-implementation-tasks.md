---
covers:
  - "js/citycatalog.js"
  - "js/ui/screens.js"
  - "js/ui/ready.js"
  - "tools/validate.mjs"
---
# 04 — Implementation Tasks: Global Campaign Rollout

## Phase Tracker

- [x] **Phase 1: Catalog & Data Schema Foundation**
  - [x] Update `js/citycatalog.js` with the full 29-metropolis roster, 7 Acts, mission transmissions, and hero landmarks.
  - [x] Maintain helper functions (`getSortedCityCatalog()`, `getPlayableCityCatalog()`, `isCityUnlocked()`, `isCityChallengeCompleted()`, `getCompletedChallengeCount()`, `isSecret90sChallengeUnlocked()`) to handle `PLAYABLE` vs. `DEVELOPMENT` scene status without regressions.
  - [x] Write dedicated validator suite (`tools/validate-campaign.mjs`) asserting all 29 cities have valid schema, unique scenes, ascending block targets, and deterministic progression links.

- [x] **Phase 2: UI & Mission Dossier Integration**
  - [x] Expand City Selection screen (`js/ui/screens.js`) with **Act Filter Tabs** (All, Prologue, Acts I–VII).
  - [x] Add **Sprocket Mission Dossier** drawer on city cards with tactical directive, transmission, hero landmarks, and rescued companion bot.
  - [x] Integrate **Ready Gate Story Directive** in `js/ui/ready.js` pulling the active city's narrative directive and transmission.
  - [x] Update Results Screen (`js/ui/screens.js`) with story debrief and rescued companion note for 100% full clears.

- [ ] **Phase 3: Automated Validation & Invariant Guard**
  - [ ] Integrate campaign validation into `tools/validate.mjs`.
  - [ ] Ensure all 9 shipped scenes pass greedy bot and stability tests with zero errors.

- [ ] **Phase 4: Documentation & Status Reconcile**
  - [ ] Update `.wiki/INDEX.md` and `.wiki/modules/campaign.md`.
  - [ ] Update root `STATUS.md` with the new campaign architecture and roadmap.
