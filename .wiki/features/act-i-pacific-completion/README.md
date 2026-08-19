# Feature: Act I — The Pacific Awakening, Map Completion

**Status**: IN PROGRESS (opened 2026-08-19)
**Category**: Content / Voxel Scenes
**Owner directive**: complete every Act I map; the voxel count in each map's
catalog description is authoritative and must be matched **exactly**.

---

## Scope

Act I ships three cities (`js/citycatalog.js`, `act: 'ACT I'`). Only one had a
built map, and that one was defective.

| City | Scene id | Declared `blocks` | State at open |
|---|---|---|---|
| Sydney Harbour | `sydney` | 14,120 | PLAYABLE, but built **14,309** and had **0 camera blockers** |
| Auckland | `auckland` | 16,000 | DEVELOPMENT — no scene file |
| Singapore Marina Bay | `singapore` | 22,000 | DEVELOPMENT — no scene file |

**Acceptance**: for each city, `sim.blocks.length === catalogEntry.blocks`
exactly, the scene's validator section passes (including camera-blocker
coverage), the city is winnable, and `status` is `PLAYABLE`.

---

## Defects found at open (Sydney)

### 1. `generateBlockers` return value discarded — zero camera blockers

`js/voxelscene-sydney.js:407` read:

```js
generateBlockers(sim, 6);          // return value thrown away
```

`generateBlockers` (`js/voxelkit.js:898`) **returns** the blocker array; it does
not assign. Every other scene does `sim.cameraBlockers = generateBlockers(sim);`
(boston:2217, brooklyn:922, chicago:1228, upper-manhattan:2554). Sydney
therefore shipped with `blockers=0` and the camera clipped through every
building in the game's Act I opener.

`FW_VALIDATE_SECTIONS=sydney` was **already red at HEAD**:

```
FAIL: sydney: 1050 footprint cell(s) >=6 m tall have no cameraBlocker
      covering their height (tallest 53 m at cell 8,22)
  sydney sandbox: blocks=14309 mass=25242 blockers=0
```

This is the repo's recurring defect class: a two-sided seam where the caller
compiles fine and silently produces nothing. The Lab had the same hole (no
`generateBlockers` call at all) until ADR-0022's testbed work.

**Rule for scene authors**: the last line of a scene build is
`sim.cameraBlockers = generateBlockers(sim);` — assign it, then confirm the
probe reports a non-zero blocker count.

### 2. Declared count drifted from built count

Catalog said 14,120; geometry built 14,309 (+189). Nothing gated the two
against each other, so the drift was invisible. Geometry is corrected toward
the declared number (the description is authoritative), and a standing gate is
added so the pair can never drift again.

---

## Standing gate added by this work

For every `PLAYABLE` city in `CITY_CATALOG`, the scene's validator section
asserts `sim.blocks.length === entry.blocks`. Metadata lands **with** its
geometry, never ahead of it — a declared count for an unbuilt scene would fail
by construction, which is the intended behaviour.

---

## Execution

Serialised by file ownership (this repo's worst failure mode is two writers on
one file):

1. **Wave 1a — Sydney**: owns `js/voxelscene-sydney.js`. Fix the blocker
   assignment; trim 189 blocks of surplus detail to hit 14,120 exactly, leaving
   the three hero landmarks intact.
2. **Wave 1b — Auckland**: owns the new scene file plus the shared wiring
   (`voxelsim.js`, `main.js`, `citycatalog.js`, `validate.mjs`). Heroes: Sky
   Tower Needle, Waitematā Ferry Wharves, Mt Eden Volcanic Cones. 16,000 exact.
3. **Wave 2 — Singapore**: runs alone once the shared files are free. Heroes:
   Marina Bay Sands SkyPark, Supertree Grove, Merlion Waterfront. 22,000 exact.
   Also lands the cross-city declared-vs-built gate.

Docs (`STATUS.md`, `.wiki/**`) are written by the lead, not the build agents,
so the parallel waves cannot collide on them.

## Constraints carried into every new scene

- Strict min-corner placement, zero overlaps, zero unsupported blocks.
- Oversized masses subdivided into ~2 m structural bays so collapse and
  consumption behave.
- Deterministic and seeded; no `Math.random`, no three.js/DOM in scene files.
- **Look dense, do not be dense** — Cambridge's literal 73k voxels are why the
  full validator takes 37 minutes. New sections must stay in Sydney's runtime
  ballpark.
