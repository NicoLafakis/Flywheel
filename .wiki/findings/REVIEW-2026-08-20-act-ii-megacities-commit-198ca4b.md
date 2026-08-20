# Review: commit 198ca4b — Act II Asian Megacities (Hong Kong, Seoul, Beijing, Bangkok, Mumbai)

Post-push review, 2026-08-20. Evidence is from running sections against HEAD, not from reading the diff alone. Music cues are a known placeholder (owner, 2026-08-20: tracks not authored yet); findings about them are about the gate, not the art.

## Findings

### Blocking — the release gate is red at HEAD

| # | Finding | Evidence | Class |
|---|---------|----------|-------|
| F1 | **`node tools/validate.mjs` crashes.** The five new cities are PLAYABLE in `CITY_CATALOG` and present in `SCENE_GOALS`, but `tools/validate.mjs:92` still preloads only the original ten scenes. `scenesWinnable` iterates `SCENE_GOALS`, constructs `hongkong`, and throws `scene 'hongkong' is not loaded`. `declaredBlockCounts` would fail the same way for all five (its own message says "add it to the loadScene list"). | `FW_VALIDATE_SECTIONS=declaredBlockCounts,scenesWinnable,... node tools/validate.mjs` → uncaught `Error: VoxelSandboxSim: scene 'hongkong' is not loaded` | Half-retirement: one side of a seam (catalog/goals) moved, the consumer (preload list) did not |
| F2 | **The `multiplayer` child is red.** `js/audio/music.js:44-47` map seoul/beijing/bangkok/mumbai to `tokyo.mp3`, which does not exist in `assets/music/` (Tokyo itself plays `lower-manhattan.mp3`). `tools/music-assets-selftest.mjs` (run by the `multiplayer` group, `validate.mjs:2807`) asserts cue-registry == shipped-MP3 set and fails on `- 'tokyo.mp3'`. In the browser those four cities load a 404 and play silence. | `node tools/music-assets-selftest.mjs` → `AssertionError: cue registry and shipped MP3 set must match` | Plausible-but-wrong value; placeholder that a gate happens to catch |
| F3 | **None of the five cities is in the release gate at all.** Singapore shipped with `section('singapore', validateSingapore)` + a `groups` row + the preload entry (`validate.mjs:3117, 3187, 3447`). The new cities shipped only `tools/validate-<city>.mjs` standalone scripts that nothing in the orchestrator spawns. `orchestratorCoverage` cannot see this: it guards registered-vs-listed, and these are neither. The commit message's "validate" means "ran a script by hand once". | `grep -c hongkong tools/validate.mjs` → 0 | Exactly the "registered but never listed" class from 2026-08-19, one step earlier: never registered |

### Gaps

| # | Finding | Evidence |
|---|---------|----------|
| F4 | `audioCoverage` checks that every PLAYABLE city has a `MUSIC_CUES` key but not that the file exists, so it passed (`16 PLAYABLE cities checked`) while F2 was live. The existence check lives only in the standalone selftest spawned from the multiplayer group. A PLAYABLE-city gate that reports music coverage should fail on a missing file itself. | `FW_VALIDATE_SECTIONS=audioCoverage` → ALL PASS at HEAD |
| F5 | `js/ui/help.js:120` still says `HONG KONG (28,500 blocks)`; the catalog now declares 32,000. Help copy restates catalog numbers by hand, so every block-count correction has to be swept here too (and `help.test.mjs` did not catch it). | `grep -n "28,500" js/ui/help.js` |
| F6 | The five standalone validators were not run in this review (owner stopped the run); their PASS is unverified here. `tools/validate-{seoul,beijing,bangkok}.mjs` are 245 lines each and differ from one another by ~48 lines, i.e. they are near-copies. Once F3 folds their checks into `validate.mjs` via the shared probes, the standalone files are dead code, or they stay as the authoring-time harness the way `validate-singapore.mjs` did — pick one and say which. | `diff tools/validate-beijing.mjs tools/validate-bangkok.mjs \| grep -c '^[<>]'` → 48 |
| F7 | Every new scene exports `*_ROAD_SPANS = []` and `*_OPEN_GROUND = []`. Precedent exists (Sydney, Auckland, Singapore do the same) — **revised**: it is not merely vacuous, it is actively wrong for cities with real elevated structures. Once the gate actually ran (below), `probeRoadConflicts` fired on thousands of blocks per city; Seoul's own header comment documents "Banpo Bridge, Mapo Bridge" over the exact zone the probe flagged, and every OTHER city with a bridge (Boston, Brooklyn, Cambridge, Chicago, Tokyo, Upper Manhattan) declares a non-empty `*_ROAD_SPANS`. See the follow-on finding below. | `grep -n "ROAD_SPANS = \[\]" js/voxelscene-*.js` |

### Checked and clean

- No `Math.random`, no three.js/DOM in the five scene files.
- `SCENE_IMPORTERS` builder names match the exports (`buildHongKong` … `buildMumbai`).
- `SCENE_AMBIENCE` values all resolve to shipped `.ogg` files.
- `validate-campaign.mjs` 16/13 split matches the catalog and the `playable + development == CITY_CATALOG.length` tripwire holds (`globalCampaign` section: 1345 assertions, pass).
- `js/main.js` `AUTHORED_SCENES` has label/hud/intro for all five.

## Remediation plan

Order matters: F1/F2 make the gate green again so the rest can be proved against it. Each step is test-first (CLAUDE.md TDD); the RED for every step already exists at HEAD, so the first run of each gate is the failing test.

### Step 1 — Green the gate (F1, F2)
1. `js/audio/music.js`: repoint seoul/beijing/bangkok/mumbai from `tokyo.mp3` to `lower-manhattan.mp3` (the track Tokyo already uses, so Act II stays on one bed until the real tracks exist). Comment it as a placeholder with the date.
2. `tools/validate.mjs:92`: add `'hongkong', 'seoul', 'beijing', 'bangkok', 'mumbai'` to the preload list.
3. Prove: `node tools/music-assets-selftest.mjs` passes; `FW_VALIDATE_SECTIONS=declaredBlockCounts,scenesWinnable,audioCoverage node tools/validate.mjs` passes. `declaredBlockCounts` will now actually compare the five built counts against 32000/32000/38000/30000/34500 — expect it to fail on any city whose geometry was not authored to its declared number, and fix the **catalog** toward the built count (ADR-0022 precedent: the number follows the geometry, never the other way).

### Step 2 — Put the five cities in the release gate (F3, F6)
1. For each city, add `function validate<City>()` in `tools/validate.mjs` shaped like `validateSingapore` (`:3187`): `probeCellOwnership`, `probeCameraBlockers`, `probeBoundsRect`, `probeRoadConflicts`, `probeWaterOverSurfaces`, `probePlacementStep`, `probeIdleStability`, plus whatever the standalone script asserts that the shared probes do not.
2. Add `section('<city>', validate<City>)` and a `['<city>', '<city>']` row in `groups`. `orchestratorCoverage` enforces the pair.
3. Decide the standalone files' fate in the same commit: either delete `tools/validate-{hongkong,seoul,beijing,bangkok,mumbai}.mjs` or keep them and add a one-line header saying they are the authoring harness and the gate is the section. Do not leave five silent copies.
4. Prove: `FW_VALIDATE_SECTIONS=hongkong,seoul,beijing,bangkok,mumbai,orchestratorCoverage node tools/validate.mjs` passes.

### Step 3 — Close the gate gaps (F4, F5)
1. `audioCoverage`: for each PLAYABLE city, assert `MUSIC_CUES[scene]` names a file present in `assets/music/MANIFEST.json`. RED first: temporarily point one cue at a fake name and watch it fail.
2. `js/ui/help.js:120`: correct Hong Kong to 32,000. Better: add an assertion in `tools/help.test.mjs` that every `(N blocks)` figure in the Acts copy equals the catalog's `blocks` for that city, so the next correction sweeps itself.

### Step 4 — Structural: make "a city ships with its gate" un-forgettable (new ADR)
Write **ADR-0024: a PLAYABLE city is one the orchestrator runs**. Decision: flipping a catalog row to PLAYABLE requires, in the same commit, (a) a `SCENE_IMPORTERS` entry, (b) a preload entry, (c) a `section()` + `groups` row, (d) a `MUSIC_CUES` entry whose file exists. Enforcement: one new section, `playableCitiesGated`, that for every PLAYABLE scene asserts all four in the validator source/registries, so F1 and F3 become a named failure instead of a crash or a silence. This generalises the 2026-08-19 `orchestratorCoverage` guard from "registered ⇔ listed" to "PLAYABLE ⇒ registered". Related: ADR-0018 (debris cost, why big-city sections are their own children), ADR-0022 (declared count follows geometry).

### Step 5 — Optional, not blocking (F7)
If any of the five cities has roads the player drives on, author `*_ROAD_SPANS` so `probeRoadConflicts` has a domain. Otherwise leave empty, matching Sydney/Auckland/Singapore.

## Status — updated 2026-08-20, same session

**Remediated for seoul/beijing/bangkok/mumbai (4 of 5 cities). Hong Kong deliberately deferred** — its scene file, standalone validator, and references doc were under active concurrent edit by another live session throughout this work; touching them risked clobbering. Hong Kong needs the identical four-point wiring once that settles: nothing new to design, just apply Step 1.2 + Step 2 below to it.

- **F1 (crash)**: fixed. `tools/validate.mjs`'s preload list now includes seoul/beijing/bangkok/mumbai. `validateScenesWinnable` also picked up a real secondary bug found while fixing this — it crashed uncaught (not a clean `fail()`) on any `SCENE_GOALS` entry that's registered-but-unpreloaded, which would have aborted every section queued after it. Now a named failure, matching `declaredBlockCounts`'s existing guard pattern. Hong Kong currently trips this named failure, as expected.
- **F2 (silent music)**: fixed. `js/audio/music.js` repoints seoul/beijing/bangkok/mumbai to `lower-manhattan.mp3` (Tokyo's own track) as a dated placeholder; `tools/music-assets-selftest.mjs` passes.
- **F3 (never gated)**: fixed for 4/5. Each of seoul/beijing/bangkok/mumbai has a `validate<City>()` function (Singapore's shape minus the scene-specific `probeLaneModulus` call), a `section()` registration, and its own `groups` row. `FW_VALIDATE_SECTIONS=seoul,beijing,bangkok,mumbai,orchestratorCoverage` passes structurally — see the new finding below for what the probes themselves then found.
- **F4 (audioCoverage gap)**: fixed. `validateAudioCoverage()` now also asserts each PLAYABLE city's music cue names a file present in `assets/music/MANIFEST.json`, not just that the key exists.
- **F5 (help.js drift)**: closed structurally, not numerically. `tools/help.test.mjs` now asserts every `(N blocks)` figure in the Acts copy equals `CITY_CATALOG`'s value, self-verified against all 29 cities by an out-of-band sweep (28/29 matched pre-existing; only Hong Kong was off). `js/ui/help.js` needed no other edits. Hong Kong's line is deliberately left unedited pending its catalog number settling.
- **F6 (standalone-validator duplication)**: re-assessed, not a defect. The near-duplication matches the documented Singapore/Sydney precedent (`tools/validate-singapore.mjs`'s own header: "a standalone harness... is not a fast loop" if it re-points at the shared file) — the standalone scripts are the fast single-city authoring loop, the new `section()`s are the authoritative shared-probe pass. No action needed; original framing was wrong.
- **F7 (empty ROAD_SPANS)**: reclassified from "not a defect" to a real contributing cause — see the follow-on finding.
- **New, Step 4 (ADR-0024 + `playableCitiesGated`)**: done. `.wiki/adr/0024-a-playable-city-is-one-the-orchestrator-runs.md` written; the new section correctly fails on exactly and only Hong Kong (importer + preload + section + music, all four checked generically, no per-city code).
- **Independently re-verified** (not just trusting the implementing agents' self-reports): `FW_VALIDATE_SECTIONS=orchestratorCoverage,playableCitiesGated,declaredBlockCounts,scenesWinnable,audioCoverage,syntaxCheck` → 4 failures, all four naming only `hongkong`, nothing else. Matches expectation exactly.

**New finding spun off, now mechanically remediated as far as safely possible**: running all five cities' probes for the first time (F3's fix, plus Hong Kong once its wiring landed) surfaced 11 real road/water/idle-stability defects in the scene geometry itself — outside this finding's original scope (which was about wiring, not content correctness). Tracked separately at `.wiki/findings/REVIEW-2026-08-20-act-ii-scene-geometry-road-water-conflicts.md`. Two remediation passes closed 7 of 11 outright (all water-over-surface overlaps, both idle-stability failures) and reduced the remaining 4 `probeRoadConflicts` findings to their landmark-only floor (seoul 1744, beijing 812, bangkok 664, mumbai 160 — down from 3556/6260/4877/4468), by making each city's budget-close-out filler loop road/water/spawn-aware without touching any hand-authored landmark geometry. Every fix independently re-verified against the live tree, not just trusted from the implementing agents' self-reports.

**Remaining**: Hong Kong's four-point wiring is done and its own geometry defect (G11) is fixed — `FW_VALIDATE_SECTIONS=hongkong` is a full PASS. The 4 remaining `probeRoadConflicts` failures (seoul/beijing/bangkok/mumbai) are hand-authored landmarks confirmed grounded at street level with no legitimate elevated-span exemption (one exception: mumbai's Sea Link deck is genuinely elevated and just needs a `ROAD_SPANS` declaration, not a move) — resolving the rest means deciding whether the road or the landmark moves, a scene-authoring design call outside an automated pass's scope. Full detail, per-landmark breakdown, and the recommended next step (an orthographic render of each affected corner before deciding) are in `.wiki/findings/REVIEW-2026-08-20-act-ii-scene-geometry-road-water-conflicts.md`'s "Resolution — Filler-Loop Pass" section. This is the intended stopping point for this session's remediation work.
