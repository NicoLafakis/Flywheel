# Audit: declared vs. built, and camera-blocker coverage, across every playable city

**Date**: 2026-08-19
**Trigger**: Sydney shipped with a block count 189 above what its catalog card
promised, and with zero camera blockers. Neither was gated. Before arming a
standing gate, the whole roster was measured to find out what that gate would
actually catch.

**Method**: each `PLAYABLE` city was built in a real browser straight off the
module graph (`loadScene` → `new VoxelSandboxSim`) and compared against its
`js/citycatalog.js` entry. Camera-blocker coverage was measured by transcribing
the validator's own `footprintTops` (`tools/validate.mjs:418`) and
`probeCameraBlockers` (`tools/validate.mjs:453`) **verbatim** rather than
reimplementing them.

---

## Instrument calibration (read this before trusting the numbers)

The first version of the coverage instrument keyed off `b.x` / `b.y` in metre
space. It reported **Sydney as 100% uncovered** — a scene the validator passes
clean. The real probe keys off the **fine grid** (`b.gx`, `b.fsx`, at 0.25 m),
and `b.x` is a block *centre*, not a min corner.

That error was caught only because Sydney was in the run as a **control arm**.
Every row would otherwise have been plausible, alarming and wrong.

The corrected instrument reports Sydney at **1,050 tall cells / 0 uncovered**,
which matches the `1050 footprint cell(s)` figure in Sydney's own historical
failure message exactly. Auckland reads 1,130 / 0. Both controls clean.

**Rule**: any harness that replicates a shipped predicate keeps at least one
known-good scene in every run and invalidates its own output loudly if that
control does not read zero.

---

## Finding 1 — two cities' block counts have drifted from their cards

| scene | built | declared | delta |
|---|---:|---:|---:|
| gallery | 15,767 | 13,652 | **+2,115** |
| cambridge | 72,943 | 88,500 | **−15,557** |
| sydney | 14,120 | 14,120 | 0 |
| auckland | 16,000 | 16,000 | 0 |
| tokyo | 84,122 | 84,122 | 0 |
| chicago | 44,578 | 44,578 | 0 |
| manhattan | 25,875 | 25,875 | 0 |
| brooklyn | 39,984 | 39,984 | 0 |
| upper-manhattan | 73,393 | 73,393 | 0 |
| boston | 82,894 | 82,894 | 0 |

The block count is printed on the city card, so both of these are **wrong
player-facing numbers**, not internal bookkeeping.

**gallery (+2,115)**: ADR-0022 added a three-tower camera testbed to The Lab on
2026-08-19 (+14.8% blocks) and the catalog was not moved. Here the geometry is
intentional and the declared number is stale, so **the catalog follows the
geometry**. Note this is the *opposite* direction to Sydney, where the
description was authoritative because it is a city map the owner specified. The
Lab is a testbed, not a specified map — the direction of the fix depends on
which side is the source of truth, and that is a judgement per city, not a rule.

**cambridge (−15,557)**: 88,500 has never been true; the map has been 72,943
since it was built. It is an aspirational figure from a spec that was already
misread once — Cambridge was specced to *look* as detailed as ~73k voxels, not
to contain 88.5k, and building it literally is why the full validator takes 37
minutes. Cambridge 2 is deferred and the existing map stays, so the catalog
should describe the map that exists.

## Finding 2 — Tokyo is Sydney's bug in the biggest map in the game

`js/voxelscene-tokyo.js` ships **six** hand-pushed `cameraBlockers` entries for
an 84,122-block city, and Tokyo has **no validator section at all** — it is
absent from the `probeCameraBlockers` call list, so nothing has ever checked it.

```
tokyo    5,963 footprint cells >= 6 m tall    5,404 UNCOVERED (90.6%)    worst 34 m at cell 27,-85
```

The chase camera clips through Shinjuku: the Tocho twin towers, Mode Gakuen
Cocoon Tower, the NTT Docomo spire. Manhattan (32 hand-authored rects) and the
gallery (191, generated) both measure clean, so this is Tokyo specifically, not
a general property of hand-authored blocker lists.

This is the same defect class as Sydney one city over, which is the lesson: when
a fix establishes a class, sweep the class rather than the single value.

---

## Actions

1. **Standing gate** — for every `PLAYABLE` city, assert
   `sim.blocks.length === entry.blocks`. `PLAYABLE` only: a `DEVELOPMENT` city
   with a declared count and no scene would fail by construction, which is why
   metadata lands *with* its geometry and never ahead of it.
2. **Correct the two drifted catalog numbers** in the directions argued above.
3. **Fix Tokyo's blockers** — derive them with
   `sim.cameraBlockers = generateBlockers(sim);` as the newer scenes do, and add
   a `tokyo` validator section so the fix is gated. The section is expected to
   land RED before the geometry fix lands; a knowingly-red gate that is
   announced is acceptable, a gate quietly narrowed to pass is not.
4. **Every playable city should have a validator section.** Tokyo proves the
   real hole is not a bad value but an *ungated* scene. A city with no section
   is unguarded by construction, and that is invisible from reading the scene
   file.
