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
| Auckland | `auckland` | 16,000 | **PLAYABLE** — built exactly 16,000 with 115 camera blockers (2026-08-19) |
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

## Finding — `sceneReady()` reports an unknown scene id as READY

**Found**: 2026-08-19, while confirming Singapore's wiring. **Owner**:
`auckland-act1`, scheduled behind Singapore's commit (both files it touches
were in flight when it was found). **Severity**: ships to players.

`js/voxelsim.js:279-281`:

```js
export function sceneReady(scene) {
  return !SCENE_IMPORTERS[scene] || SCENE_BUILDERS.has(scene);
}
```

The `!SCENE_IMPORTERS[scene]` arm exists so the gallery — which legitimately has
no importer — reports ready. It cannot distinguish that from a scene id that is
unregistered or misspelled. Both return `true`:

```
gallery          sceneReady = true
singapore        sceneReady = false   (registered, not yet loaded)
tokyo            sceneReady = false   (registered, not yet loaded)
ATLANTIS_TYPO    sceneReady = true    <-- unknown name reports READY
```

An unknown id therefore skips the constructor's throw and **silently builds the
gallery under that city's label**. This is the exact outcome the comment at
`js/voxelsim.js:283-286` claims to prevent, in those words: *"the constructor
throws otherwise rather than silently building a gallery under a Brooklyn
label."* A typo in a `scene` field in `js/citycatalog.js` is enough to ship it.

A realistic near-miss typo behaves the same way: `singapor` also reports READY.
This does not require an obviously-fake id to trigger.

**Why it went unnoticed**: the `declaredBlockCounts` gate calls `sceneReady`,
so it cannot catch an unregistered scene at all. It caught Singapore only *by
coincidence* — the gallery's 15,767 blocks happen not to equal Singapore's
declared 22,000, so the mismatch surfaced as a count delta.

**This is measured, not hypothetical.** On an unpatched tree, with Auckland's
scene id misspelled to `aukland` *and* its declared count set to the gallery's
15,767:

```
declared counts: 11 PLAYABLE cities checked — ... aukland=15767 ...
ALL PASS.
```

A green run, with a row indistinguishable from a real one, while building the
gallery under Auckland's label. The same perturbation on the patched tree fails
naming the identity arm. That is the failure class this cycle was spent
eliminating: a gate that passes while checking the wrong object.

It also produced a phantom reading during the audit — Singapore measured at
15,767 blocks / 191 blockers / 2,273 tall cells, which are the gallery's
numbers exactly (independently confirmed), and was briefly mistaken for a
Singapore geometry defect.

**Fix — both layers, not just the gate**:

1. `js/voxelsim.js` — the readiness predicate must distinguish *legitimately
   importerless* from *unknown name*. The gallery is a specific known id, not
   "anything without an importer". An unknown id fails loudly at construction.
2. `tools/validate.mjs` — assert every `PLAYABLE` non-gallery scene has a
   `SCENE_IMPORTERS` entry, so **identity is checked before any count is**. The
   count check stays; this sits in front of it.

Prove RED with a deliberately misspelled scene id in a scratch tree, and
confirm the failure names the *identity* arm rather than the count arm — a
perturbation that trips the wrong arm proves nothing while looking identical to
success.

### The caller audit mattered more than the fix

`sceneReady` has exactly **one** caller in the repo (`tools/validate.mjs:3266`),
so the blast radius *through that export* is small. But the audit was run
against the reasoning, not the symbol, and that found two more instances:

**A second, independent occurrence of the same inference** —
`tools/multiplayer-fixes.test.mjs:461`:

```js
const sourceFor = (scene) => sceneModule.get(scene) || '../js/voxelsim.js';
```

commented "A scene with NO entry is authored inline in `_buildScene`, so its
source is voxelsim.js itself." That is the identical *absence implies gallery*
inference, reached independently in different words — which is exactly why
grepping callers of `sceneReady` would never have surfaced it. An unregistered
scene is not rejected there; it is **scanned as `voxelsim.js`**, so the
mover-declaration guard inspects the wrong file and returns a clean pass.
Currently **latent, not live**: `MULTIPLAYER_SCENES` is gallery/manhattan/
brooklyn, all correctly registered. It goes live the moment a misspelled or
unregistered scene enters that set.

Same file, line 464: `assert.ok(sceneModule.size >= 6)` guards a table that now
holds 11 entries — five registrations could disappear before it complains. A
floor is the wrong shape here; an exact count that must be bumped deliberately
is right.

**A dead duplicate that is a trap for this very fix** — `old_voxelsim.js` at
the repo root: 445 KB, tracked and committed (last touched `38de172`), imported
by nothing in any `.js`, `.mjs`, or `.html`. It carries its own copy of the
buggy predicate (lines 235-236) and the same constructor path (801-802).
Anyone — human or agent — grepping `sceneReady` gets **two definitions**, and
can patch the dead one and measure no change. It is marked dead in-file;
whether it should be deleted outright is an owner decision.

**The generalisable point**: auditing the *symbol* finds one caller. Auditing
the *reasoning* finds the copies that were written independently, in different
words, by someone who reached the same wrong conclusion from the same data
shape. The second kind is what actually bites, because no search for the
original will ever return it.

### A third instance, and the correct search condition

`tools/pw/singapore-shots.mjs` overrode `VoxelSandboxSim.prototype._buildScene`
on the same dead premise and died on a 60 s `waitForFunction` timeout. Two
callers on one seam; one was repaired and the other kept calling. **The question
after any repair is never "does the caller work" but "how many callers were
there."** It was found by *running* the file, not reading it — both sides look
correct in isolation.

The search condition matters more than the count. **The override alone is not
the bug; the bug is the override combined with a *registered* id.** Audited on
that basis, tracked code is clean:

| file | verdict |
|---|---|
| `tools/probe-aniso.mjs` | **safe** — constructs with no scene, so it defaults to the gallery, which has no importer and legitimately still falls through. Verified by running it, not by reasoning. |
| `tools/pw/tokyo-blocker-cost.mjs`, `tokyo-blocker-coverage.mjs` | **safe** — already use `loadScene`, no prototype patch |
| `tools/validate-singapore.mjs`, `tools/pw/singapore-shots.mjs` | both repaired |

**The trap outside tracked code**: `_phase5-deliverables/` and
`_phase6-deliverables/` hold ~15 more scripts on this seam (`git ls-files`
returns 0 for both — untracked scratch, nobody is maintaining them). Their two
failure modes are opposites, and the safe-looking one is the dangerous one:

- `_phase5` constructs **unknown** ids (`drumscan`, `cambridge-${variant}`) →
  now **throws**. Loud, obvious, self-announcing.
- `_phase6` constructs `scene: 'cambridge'`, which **is registered** → the
  override is **silently ignored**, and the script builds real Cambridge while
  believing it built a variant.

A script that throws is safe. A script that succeeds against the wrong object is
the trap. Anyone reviving that scratch needs this; it is recorded here because
the scripts themselves are untracked and cannot carry the warning.

## Finding — Singapore was committed geometry-only

`10bfb1e` committed three files (`js/voxelscene-singapore.js`,
`tools/validate-singapore.mjs`, `tools/pw/singapore-shots.mjs`) and none of the
wiring. At HEAD the scene file existed and was unreachable:

| file | HEAD | working tree |
|---|---:|---:|
| `js/voxelsim.js` | 0 | 2 |
| `js/audio/music.js` | 0 | 3 |
| `js/audio/game-audio.js` | 0 | 1 |
| `js/main.js` | 0 | 4 |
| `tools/validate.mjs` | 1 | 18 |

(`grep -c singapore`, HEAD via `git show HEAD:<file>`.)

**The lesson is about verification, not about the commit.** Grepping the
working tree and concluding "it is wired" conflates *present on disk* with
*committed*, and both the lead and the build agent made that call. The check
that catches it is building from a clean `git archive HEAD` tree, which is how
it was actually found. A half-landed commit is invisible to every gate that
runs against the working tree — which is all of them.

`tools/validate-singapore.mjs` also shipped in that commit and, **as committed,
had never run green**. Its header stated it stood alone "before it is wired into
`js/voxelsim.js`'s SCENE_IMPORTERS", and it patched
`VoxelSandboxSim.prototype._buildScene` on the premise that an unregistered
scene id falls through to `_buildScene()`. It does not — the constructor throws
`scene 'singapore' is not loaded`.

**It was repaired, not deleted, and that reversal is worth recording.** The
lead's instruction was to delete it, on the reasoning that it was dead and
`section('singapore')` in the shared validator now covered it. That reasoning
was already stale when it was written: the prototype patch had been swapped for
`await loadScene('singapore')` and the file ran ALL PASS. It also carries five
assertions the shared section does **not** duplicate — exact declared count,
the dead-import check across all 18 `voxelkit` imports, the pure-sim boundary,
determinism across two builds (fingerprint `3200114096` — it moved from
`4195553297` when the apron relocated, which is the fingerprint doing its job;
do not read the old value as expected), and the winnable residual. It now also
carries `probeBlocksInWater`, below. `tools/validate-sydney.mjs` is the same shape and is not deleted.

Following the instruction would have deleted working coverage to satisfy a
premise that no longer held. It was caught because the agent re-checked the
premise instead of executing the task. **In a tree with several concurrent
writers, an instruction is a snapshot; verify its premise still holds at the
moment you act on it, not at the moment you received it.**

## Finding — 1,241 blocks stand on the surface of Marina Bay

Found by browser review, not by any probe, and it is the reason the review is
mandatory. The scene's budget close-out course is exactly 1,241 blocks and
**all 1,241 sit inside the bay water rect** (x −18..22, z −14..14) — a uniform
32 × 10 m mat with hard square corners, at constant height, with open water on
three sides. That is 5.6% of the city.

**No probe can see it.** `probeWaterOverSurfaces` compares *decor rects* only;
a physical block standing in water is not a decor rect. The condition was
equally true at HEAD and survived the plaza/spawn fixes untouched, because
nothing in the suite expresses "solid geometry should not stand on open water".

The builder's comment claims intent — "granite armour on the reservoir's south
bank... riprapped in life, so this is a real edge rather than filler" — and the
two motor launches were positioned relative to it. The intent is sound; the
geometry does not deliver it. Riprap follows an irregular bank, slopes, and
varies. A constant-height rectangle at a fixed 0.5 m offset from the shoreline
reads at chase-cam height as unfinished paving. **Fix the code toward the
design, not the design toward the accident.**

**Resolved**: the lanes walk *south* from z 14.0 across **x −18..18, 20 lanes,
z 14.0..23.5 — capacity 1,340** against the 1,241 needed. That span is exactly
the boardwalk rect, so the apron paves the deck it stands on and never spills
onto the gardens. The shortfall lands in the *last* lane, farthest from the
bank, and shore-first ordering is preserved, so a short run reads as a narrower
apron rather than an unfinished one. Count holds at exactly 22,000 — nothing
added, nothing deleted.

> **Correction.** An earlier revision of this page specified "1,359 cells across
> x −14..18". Those numbers were measured honestly but came from a lab whose 24
> lanes ran to z 25.5 — **1.5 m past the boardwalk's south edge, onto the
> gardens**. Confined to the boardwalk, x −14..18 yields only **1,182 cells: 59
> short of the 1,241 needed.** The footprint this page recommended would not
> have fitted. A capacity figure is only meaningful with its bounding
> constraint attached; quoting the number without the constraint it was
> measured under is how a lab result becomes a wrong instruction.

Three skips make it work: `sim.grid` occupancy, a keep-out of
`sim.hole.radius + 1.4` read *off `sim.hole`* rather than hard-coded (so the
apron follows the spawn if it ever moves), and the water rects. The occupancy
skip is load-bearing and proven so by neutering **only** the `sim.grid.has`
test: ghosted cells go 0 → 52 and non-static props 0 → 27, while the
water-arm count holds at 136 in both — so the two skips are cleanly separated
rather than covering for each other.

The section was renamed REVETMENT → **PROMENADE APRON**. On land it is paving,
not riprap, and the name should say what the geometry does.

### Gap closed — `probeBlocksInWater`

`tools/validate-singapore.mjs` now gates the class, between `probeBoundsRect`
and `probePureSimBoundary`:

```
GREEN  PASS: blocks in water: 136 ground blocks inside a water rect,
             all of them occluded by a built edge
RED    FAIL: singapore: 1390 ground blocks stand wholly inside a water rect
             (exactly 136 expected: the Shoppes podium's west face and the two
             launches) — first at (18.5, -13.5)
```

RED proven against **HEAD's geometry** in a scratchpad tree (`git archive HEAD`,
plus only the uncommitted `js/voxelsim.js` registry entry, without which nothing
constructs); the repo tree was never reverted.

**136 is pinned exact, not as a floor.** An allowance with slack in it is the
same defect as the `>= 6` floor replaced elsewhere this cycle — it would sit
green through a new course of up to N blocks. A deliberate change must
re-derive the number and name the difference rather than widen it.

**Two populations, two sets of numbers** — they are not a contradiction. The
*finding* counts the close-out course: 1,241 → 0. The *gate* counts a wider
population, every ground-anchored block wholly inside a water rect: 1,390 → 136.
The residual 136 is the Shoppes podium's west face (672 concrete + 56 glass
columns whose base course sits inside the rect) and the two launch hulls, all of
which fully occlude the water beneath them.

> A second correction, this one to a number quoted earlier in this cycle: the
> RED baseline is **1,390**, not 1,377. 1,377 was the *working tree* after the
> bay rect had already been shrunk 40×34 → 40×28 by the plaza fix but before the
> apron moved; 1,390 is true HEAD, where the larger rect swallows ~13 more
> podium blocks. An intermediate reading was quoted as though it were the
> baseline. The gate is RED on both and GREEN only at 136.
