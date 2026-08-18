---
covers:
  - "js/citycatalog.js"
  - "js/ui/screens.js"
  - "js/ui/ready.js"
  - "tools/validate.mjs"
---
# 04 — Implementation Tasks: Global Campaign Rollout

## Phase Tracker

- [ ] **Phase 1: Catalog & Data Schema Foundation**
  - [ ] Update `js/citycatalog.js` with the full 29-metropolis roster, 7 Acts, mission transmissions, and hero landmarks.
  - [ ] Maintain helper functions (`getSortedCityCatalog()`, `isCityUnlocked()`, `isCityChallengeCompleted()`) to handle `PLAYABLE` vs. `DEVELOPMENT` scene status without regressions.
  - [ ] Write dedicated validator suite (`tools/validate-campaign.mjs`) asserting all 29 cities have valid schema, unique scenes, ascending block targets, and deterministic progression links.

- [ ] **Phase 2: UI & Mission Dossier Integration**
  - [ ] Expand City Selection screen (`js/ui/screens.js`) with **Act Filter Tabs** (Acts I–VII).
  - [ ] Add **Sprocket Mission Dossier** collapsible drawer with tactical transmission & hero landmarks.
  - [ ] Integrate **Ready Gate Story Directive** in `js/ui/ready.js` pulling the active city's transmission.
  - [ ] Update Results Screen with story debrief for 100% full clears.

- [ ] **Phase 3: Automated Validation & Invariant Guard**
  - [ ] Integrate campaign validation into `tools/validate.mjs`.
  - [ ] Ensure all 9 shipped scenes pass greedy bot and stability tests with zero errors.

- [ ] **Phase 4: Documentation & Status Reconcile**
  - [ ] Update `.wiki/INDEX.md` and `.wiki/modules/campaign.md`.
  - [ ] Update root `STATUS.md` with the new campaign architecture and roadmap.
