# ADR-0024: A PLAYABLE City Is One The Orchestrator Runs

**Status**: ACCEPTED (2026-08-20)
**Date**: 2026-08-20
**Deciders**: Ares
**Consulted**: `.wiki/findings/REVIEW-2026-08-20-act-ii-megacities-commit-198ca4b.md`

---

## 1. Context & Problem Statement

Commit `198ca4b` flipped five cities (Hong Kong, Seoul, Beijing, Bangkok, Mumbai) to `status: 'PLAYABLE'` in `CITY_CATALOG` and registered them in `SCENE_GOALS`, `SCENE_IMPORTERS`, `MUSIC_CUES`, and `SCENE_AMBIENCE`. `node tools/validate.mjs` — the release gate — crashed at HEAD: the scene-preload list at the top of `tools/validate.mjs` (`loadScene` calls, guarded by `FW_VALIDATE_SECTIONS`/`FW_VALIDATE_SEQ`) was never extended, so `scenesWinnable` threw `scene 'hongkong' is not loaded` the first time it tried to construct one. Separately, none of the five had a `section()` registration or a `groups` row, so even after the crash was fixed, the orchestrator's full run would silently never touch their geometry — `orchestratorCoverage` cannot catch this because it only proves registered sections and `groups` rows agree with each other; a city absent from both sides is invisible to it.

This is the same defect class the 2026-08-19 `orchestratorCoverage` guard closed one layer up (a section registered but never listed in `groups`). This ADR closes the layer below: a catalog row promoted to PLAYABLE but never wired into the gate at all.

## 2. Decision

**A city's `status: 'PLAYABLE'` flip and its four wiring points land in the same commit, and a validator section proves it:**

1. `SCENE_IMPORTERS` (`js/voxelsim.js`) — the scene can be built.
2. The scene-preload list (`tools/validate.mjs`, top of file) — the validator can construct it.
3. A `section('<city>', ...)` registration **and** a `groups` row (`tools/validate.mjs`) — the release gate actually runs it.
4. `MUSIC_CUES[city.scene]` (`js/audio/music.js`) names a file that exists in `assets/music/MANIFEST.json` — the city does not ship silent.

A new section, `playableCitiesGated`, asserts all four for every PLAYABLE row in `CITY_CATALOG`, generically — it does not name individual cities, so it needs no edit when the next city ships. It is cheap (registry lookups, no sim construction) and lives in the `core` group alongside `orchestratorCoverage` and `audioCoverage`, which it composes with rather than replaces:

- `orchestratorCoverage` proves: every registered section is reachable, every reachable section is registered.
- `audioCoverage` proves: every PLAYABLE city's ambience bed and music cue *key* exist.
- `playableCitiesGated` proves: every PLAYABLE city's importer, preload entry, and gate section exist, and now also that its music cue *resolves to a shipped file* (audioCoverage's existing gap).

## 3. Consequences

- **Positive**: a catalog row can never again go PLAYABLE without the gate noticing within the same `node tools/validate.mjs` run. The failure that shipped in `198ca4b` — a crash on the fast path, silence on the slow path — becomes one named assertion failure at commit time instead of a runtime discovery.
- **Negative**: one more cheap section to keep green; a city genuinely mid-authoring must stay `status: 'DEVELOPMENT'` until all four points are wired, which is already the documented contract for `declaredBlockCounts` (`tools/validate.mjs`: "metadata lands WITH its geometry").
- **Follow-up**: Hong Kong itself was mid-edit by a concurrent session when this ADR was written and was deliberately excluded from that pass's preload/section wiring to avoid a second writer on `js/voxelscene-hongkong.js` / `tools/validate-hongkong.mjs`. That session landed its work at commit `c02ea4a`; Hong Kong was wired into `tools/validate.mjs` the same day (2026-08-20) once it was safe to touch. `playableCitiesGated` now passes for all five Act II cities — see the geometry addendum in `.wiki/findings/REVIEW-2026-08-20-act-ii-scene-geometry-road-water-conflicts.md` for the one content defect (not a wiring gap) the newly-run probes found in Hong Kong's own scene.

## 4. Related

- `.wiki/findings/REVIEW-2026-08-20-act-ii-megacities-commit-198ca4b.md` — the findings this ADR resolves.
- ADR-0018 (debris cost — why heavy scenes are their own orchestrator child).
- ADR-0022 (declared count follows built geometry, not the reverse).
- `tools/orchestrator-coverage.test.mjs` — the sibling guard this one composes with.
