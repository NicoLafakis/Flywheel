---
covers:
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "js/voxelkit.js"
  - "js/voxelsurfaces.js"
---
# Cambridge sandbox — the voxel primitive vocabulary

**Status:** proposal / capability audit. Nothing here is built.
**Date:** 2026-08-06.
**Answers:** `STATUS.md`'s open decision 1, *"Construction vocabulary"* — the
one the board records as *"his actual request, and nothing has been started on
it"*.

The product ask, in the owner's terms: the new Cambridge scene should not chase
a higher block count. It should be **more artistic with the voxels** — different
sized bricks, blocks and shapes, whatever size best represents a thing. His two
worked examples: an apartment floor should be **one solid piece**, not a field
of same-size cubes; a pillar should be **a solid pillar**, not a stack of
bricks. He accepts that this moves away from the brick-by-brick feel. That is
the point.

> **The objective is not minimisation.** Corrected by the owner, 2026-08-06:
> *"we're not trying to do a 'least amount of blocks possible,' so I hope you're
> not taking it to the extreme here."* The goal is **the right shape for the
> thing**, and the savings are **reinvested, not banked**. A floor that costs
> one slab instead of forty bricks frees those forty for the thing next door
> that would not otherwise have fit. Cambridge should land in the same block
> neighbourhood as the existing authored scenes and deliver materially MORE
> apparent detail and more "stuff" for that budget — not a fraction of the count
> delivering the same. Anisotropic primitives are a way to **buy detail that
> uniform cubes could not afford**, not a way to build a sparse level. The
> success metric everywhere below is **detail per block at a comparable budget**,
> never a reduced total.

This page establishes what the engine can already do toward that, what it
cannot, what the change actually costs, and the named set of primitives to
author with. Every claim about current behaviour cites a file and a line.

> **Line-number drift, noted once.** `STATUS.md`'s established-facts block cites
> `_addBlock` at `voxelsim.js:188`, `_buildNeighbors` at `:516`, and the
> `InstancedMesh` sizing at `voxelworld.js:377`. Those functions are now at
> `voxelsim.js:479`, `voxelsim.js:810` and `voxelworld.js:621`. The *facts* in
> that block are unchanged and still hold — only the line numbers moved. All
> citations below are against the tree at 2026-08-06 (`cc38fff`).

---

## 1. What a "block" is today

### 1.1 The data shape

One place makes blocks: `_addBlock` (`js/voxelsim.js:479-513`). The literal it
returns is the whole shape:

| Field | Meaning | Source |
|---|---|---|
| `id`, `bi` | 1-based id; `bi` is the index in `sim.blocks` and is **always `id - 1`** | `voxelsim.js:483-484` |
| `gx, gy, gz` | fine-grid coordinate of the **min corner** (build-time; blocks move) | `:485` |
| `fs` | **one scalar** — the block's side in fine cells | `:486` |
| `s` | `fs * FINE` — the block's side in metres | `:480, :486` |
| `x, y, z` | world **centre** (`(fx + fs/2) * FINE`) | `:487` |
| `vx…vRotZ` | linear + angular velocity | `:488-489` |
| `matType`, `mat` | physics material (one of nine, `voxelsim.js:114-126`) | `:490` |
| `color` | paint only — never physics | `:491` |
| `state` | `static \| unstable \| falling \| consumed` | `:492` |
| `damage`, `failRate`, `supportRatio`, `fallT` | structural bookkeeping | `:493-498` |
| `asleep`, `_obsFx/_obsFz`, `_scSeen`, `parentChunk`, `neighbors` | solver bookkeeping | `:499-502` |

### 1.2 Does it carry a size? Yes — one number

`fs` and `s` are **scalars**, not vectors. There is no `sx/sy/sz`, no `w/h/d`,
no rotation-in-sim. A block is therefore **an axis-aligned CUBE, always**. The
sim relies on that in ~90 places: 41 uses of `.fs` and 48 of `.s` inside
`voxelsim.js` alone. The two that prove it are the collision tests, which use a
single half-extent sum for **all three axes at once**:

```js
const hSum = (b.s + o.s) / 2;                                  // voxelsim.js:2130
const px = hSum - Math.abs(dx), py = hSum - Math.abs(dy), pz = hSum - Math.abs(dz);
```

(the same expression is at `:2110` in `_resolveStaticContacts`). A rectangular
cuboid pushed through that solver would separate along wrong axes by wrong
amounts. This is the single hardest "cubes only" assumption in the file.

### 1.3 What sizes exist, and what `size=4` in STATUS.md means

The four shipped sizes — 0.25 / 0.5 / 1 / 2 m — are a **convention, not an
enumeration**. Nothing in the engine lists them. `_block`
(`voxelsim.js:463-466`) just does `Math.round(s / FINE)`, so **any multiple of
0.25 m already works today**: `sim._block(x, y, z, 'concrete', 3)` produces a
legal `fs = 12` block. The renderer's comment says so outright
(`voxelworld.js:556-557`): *"Nothing here enumerates legal brick sizes — the
bucket key is whatever `b.s` says."* `voxelworld.js:38` supplies one shared
`BoxGeometry(1, 1, 1)` and `voxelworld.js:2149` scales it per instance.

**`size=4` in `STATUS.md:54` is not a block size.** That line
(`blocks=39984 mass=65346 eaten=530 size=4 blockers=510`) is the validator's
Brooklyn report string, printed verbatim by `tools/validate.mjs:794`, and its
`size` field is `a.hole.size` — **the player's SIZE level (1..12)** reached by
the scripted excursion, gated at `>= 4` on line 791. It says nothing about
geometry. The block-size ladder lives in the doc comment at `voxelsim.js:31`
and the class table at `voxelkit.js:27-33`.

### 1.4 Shapes other than boxes

**There are none, anywhere.** The sim's only geometric primitive is the AABB;
the renderer's only block geometry is `boxGeo()`, a unit cube
(`voxelworld.js:38`), instanced once per bucket (`voxelworld.js:621`). Every
curve, ramp, arch, dome and cylinder in the shipped scenes is a **stepped
approximation out of cubes** — `spiralRotunda` (`voxelkit.js:2383`),
`glassSphere` (`:2418`), `halfDomeShell` (`:1774`), `archBridge` (`:1709`),
`stoneArch` (`:1369`), the BCEC's `barrelVaultHall`. `.wiki/modules/voxel.md`
records the cost of that honestly: a stepped vault *"has no curve for the
renderer to shade (every cell carries the identical +y normal)"*, so its lit
and shaded faces have to be **painted** rather than lit.

---

## 2. What block size costs — the crux

The owner's intuition is that bigger pieces are cheaper. **He is right, and by
more than he probably thinks — with exactly one trap.** Stated plainly, and
then traced:

> For the **same occupied volume**, one big piece is cheaper than the equivalent
> volume in small pieces on every axis that matters — build time, per-frame
> cost, memory objects, draw calls — and exactly *equal*, never worse, on the
> one axis where you might fear it (fine-grid cell writes). The trap is not
> size. It is **solidity**: the artistic style replaces a hollow assembly with a
> solid one, and fine-cell cost is linear in **occupied volume**, not in block
> count. A solid slab where a perimeter ring used to be costs more even though
> it is one block instead of forty.

**Read this as a budget result, not a savings result.** What the cost model
licenses is not a smaller scene — it is *the same scene budget buying more
scene*. Every figure below describes what a block buys; none of it is an
argument for buying fewer. The reinvestment rule in §4.2 is what turns this
section from a cost analysis into a content plan.

### 2.1 Build cost — fine-grid writes are flat, neighbour probes get cheaper

`_addBlock` writes `fs³` entries into `sim.grid`, one per occupied fine cell
(`voxelsim.js:505-511`). For a fixed solid volume `V` (measured in fine cells)
split into cubes of side `fs`, the block count is `N = V / fs³` and the total
cell writes are `N · fs³ = V` — **invariant in `fs`**. This is the same
conclusion `STATUS.md:35-42` reached from measurement, and it is worth quoting
because it is the load-bearing fact of this whole design:

> *"Cost is linear in total fine volume, as the code implies… per-fine-cell cost
> is flat to 1.47× where per-block cost spreads 2.27×."* — gallery 3,798 blocks
> / 169 ms · upper 8,442 / 570 ms · manhattan 25,875 / 2,521 ms · brooklyn
> 39,984 / 4,051 ms, round-robin min-of-9.

`_buildNeighbors` (`voxelsim.js:810-830`) probes each of 6 faces over an
`fs × fs` grid of fine cells — `6 · fs²` lookups per block. Over the same
volume that is `6 · fs² · V / fs³ = 6V / fs` probes: **inversely proportional to
piece size**. A 2 m piece does 1/8 the neighbour probing of the same volume in
0.25 m bricks.

Per-block fixed overhead — the object literal at `voxelsim.js:481-503`, the
`neighbors` array, the zone arrays and the six per-block typed arrays sized `n`
at `voxelsim.js:899-903`, the `_collisionBuckets` insert loop at
`voxelsim.js:283-292` — is `O(N)`, i.e. `∝ 1/fs³`.

**Build-cost summary, same volume:**

| Cost | Scaling in piece side `fs` | Direction |
|---|---|---|
| `grid` Map writes (`_addBlock`) | `V`, constant | flat |
| Neighbour probes (`_buildNeighbors`) | `6V / fs` | **cheaper** |
| Block objects / arrays / zone bookkeeping | `V / fs³` | **much cheaper** |
| `_collisionBuckets` inserts | ~`(s+1)²` per block vs `4` per 1 m block | **cheaper** |

There is **no crossover**. Larger is never worse for equal volume; the flat
term simply refuses to improve.

### 2.2 Per-frame cost — larger is strictly cheaper

Every per-step scan is linear in the **active block count**, and the per-block
work is at worst `fs²`:

- `_topAt` / `_topAdd` / `_topRemove` sweep `fs²` fine columns
  (`voxelsim.js:1338-1351`, `:1390-1401`). One 2 m piece costs 64 column
  lookups; the same volume in 0.25 m bricks costs 512 blocks × 1 = 512.
- `_contact` probes `fs²` face cells (`voxelsim.js:1414-1424`) — same ratio.
- `_sleepObsAdd` / `insertInto` bucket `(fs + 2)²` padded cells
  (`voxelsim.js:1443-1452`, `:1987-1994`).
- Everything that is *per block rather than per cell* — `_falling` walks,
  `_damageBlocks`, `_recalcSupport`'s per-zone loops, the pair-relaxation
  population in `_resolveDebrisContacts` — is `∝ 1/fs³`.

That last group is the one that matters most, because ADR-0006 established that
**the sim, not the renderer, is the per-frame cost on a large scene** (measured
at 97% of frame time before the zone fix). Fewer, bigger pieces attack exactly
the term that ADR-0006 could only amortise.

### 2.3 Draw calls — unchanged today, and a free win is available

`voxelworld.js:596-604` buckets every block by
`(surfaceId ':')? matType ':' b.s`, and builds one `InstancedMesh` per bucket
sized to `list.length` (`:621`). Draw calls scale with **bucket count, not
block count** — `STATUS.md:44-48` proves it: Upper Manhattan's 73,393 blocks are
22 buckets / 30 draw calls, *fewer* than Brooklyn's 39,984 blocks at 26 buckets
/ 34-37 calls.

So a new vocabulary of many distinct sizes adds **one bucket per distinct
`b.s`** — a handful of extra draw calls, not hundreds. That alone is
acceptable. But there is something better available, and it is the finding that
de-risks the whole proposal:

**For an unsurfaced bucket, `b.s` in the key partitions blocks that are
otherwise byte-identical to the renderer.** Unsurfaced buckets all take
`mat(0xffffff)` (`voxelworld.js:619`), and `mat()` is cached on colour
(`voxelworld.js:83-92`) — so every unsurfaced bucket in a scene shares *the same
material object* and *the same geometry* (`boxGeo()`). Size lives entirely in
the per-instance matrix (`voxelworld.js:2149`), and the mortar course is painted
in face-UV space, which `voxelworld.js:321` documents as *"the same proportion
for every brick size"*. The only thing that genuinely needs `size` in the key is
`surfaceMaterial(id, size)` (`voxelsurfaces.js:167-192`), whose `uv: 'metre'`
surfaces set `map.repeat.set(size, size)` — and that is why the comment at
`voxelsurfaces.js:163-166` says the bucket key *"already provides"* it for free.

Dropping `b.s` from the key for **unsurfaced** blocks would collapse every
unsurfaced bucket in a scene to one, i.e. reduce draw calls below today's
number while making an arbitrarily rich size vocabulary cost **zero** extra
calls. This must be *measured*, not assumed — see §7 — but the code path is
plain.

### 2.4 Where "bigger" genuinely costs more

Three places, all honest:

1. **Solidity, not size.** Fine-cell cost is linear in occupied volume
   (§2.1). `tower()` (`voxelkit.js:230-265`) builds hollow: edge walls, window
   punches, an interior column grid, full plates only every `slabEvery` layers.
   A vocabulary that makes each floor *one solid piece* fills the interior. A
   10 × 10 m floor as a perimeter-plus-columns ring is a few hundred fine cells;
   as one solid 10 × 10 × 1 m piece it is 6,400. **The rule this generates —
   "skin, not fill": solid pieces replace surfaces, never interiors** — a floor
   becomes one 0.25 m or 0.5 m *plate*, not a 1 m solid block. It is half of a
   pair; see the two-hand rule in §4.
2. **One more render bucket per distinct `b.s`**, unless §2.3's key change
   lands.
3. **Per-metre surface tiling** is uniform (`repeat.set(size, size)`,
   `voxelsurfaces.js:181`). A non-cubic piece has no single `size`, and
   `BoxGeometry`'s one UV set is shared across all six faces, so a 4 × 4 × 0.25
   plate would want `(16, 16)` on its top and `(16, 1)` on its edge. Cosmetic,
   and only bites if Cambridge declares `uv: 'metre'` surfaces on non-cubic
   pieces.

---

## 3. What breaks

A large or non-cubic piece touches five subsystems. Taken in the order the
damage is most likely to surprise an author.

### 3.1 Structural support (ADR-0006's territory)

**The horizontal span rule is the one that bites hardest.** In the 0-1 BFS
(`voxelsim.js:1085-1095`), a horizontal hop costs

```js
ns = cs + (cur.s + nb.s) / 2;                          // voxelsim.js:1090
const cap = nb.gy === 0 ? Math.min(nb.mat.maxSpan, FLOOR_CANTILEVER) : nb.mat.maxSpan;
if (ns > cap) continue;                                // :1093-1094
```

`maxSpan` tops out at 3 m (`concrete`/`steel`, `voxelsim.js:115-118`) and
`FLOOR_CANTILEVER` is 1 m (`:47`). Consequences:

- **Two adjacent 4 m pieces cannot support one another at all.** One hop costs
  `(4 + 4) / 2 = 4 m > 3`. A row of big slabs is a row of *independent*
  structures — every one needs its own vertical support. This is already true
  at 2 m and is documented as such (`voxelkit.js:17-22`: *"a 2 m plate reaches
  exactly ONE hop"*, and `megaShell`'s mod-5 interior column pattern at
  `:280-303` exists purely to satisfy it).
- **At grade it is worse.** For `gy === 0` the cap is 1 m, and any hop between
  two pieces ≥ 1 m costs ≥ 1 m, with `>` failing. Ground-level big pieces
  receive *no* horizontal support; they must each stand on their own footprint.
  That is fine — `gy === 0` blocks are themselves the BFS anchors
  (`voxelsim.js:1068-1074`) — but it means a paved plaza of large slabs is 40
  independent zones, not one.
- **Vertical is free and unchanged.** `nb.gy >= cur.gy + cur.fs` resets the span
  to 0 (`voxelsim.js:1085-1088`). *A one-piece floor slab resting on solid
  columns is the cheapest, safest thing this vocabulary can build.* Both of the
  owner's examples are in the engine's sweet spot.
- **The direction test is fine-cell-range based, not `gy`-equality based**
  (`voxelsim.js:1083`, `:1085`), which is exactly what makes mixed sizes legal
  today (`.wiki/modules/voxel.md`, "Multi-size gotchas").
- **Zones get coarser.** ADR-0006's decomposition is over `neighbors` edges. A
  one-piece floor merges what used to be 100 nodes into 1, so the zone graph
  shrinks — good. But `_zoneCells` (`voxelsim.js:880-895`) registers a zone in
  every 4 m cell any of its blocks touches, so one 30 m slab makes its zone
  "near the hole" across a 30 m front, and `_markDirtyZones` will recompute it
  more often. Net is almost certainly still a large win (the zone is tiny), but
  it is the one place the change is not monotonically good.
- **Determinism survives, conditionally.** ADR-0006's tie-breaking proof rests
  on *"every span is an exact sum of multiples of 1/8 (block sizes are
  0.25/0.5/1/2 m)"*. Any anisotropic extent must therefore stay a multiple of
  0.25 m, so half-sums stay multiples of 1/8 and two tying BFS paths still
  produce bit-identical floats. **This is a hard authoring constraint, not a
  preference.**

### 3.2 The rim-support test, and the grain ceiling it creates

Ground-anchored blocks near the rim sample **four base corners** against the
removal disc (`voxelsim.js:1035-1058`):

```js
const o = b.s / 2 - 0.05;      // :1040 — corner inset from centre
...
const sr = outside / 4;        // :1057 — fraction of corners still on solid ground
if (b.supportRatio < 0.3) continue;   // :1072 — base mostly gone, no anchor
```

Losing anchor status needs **3 of 4 corners inside the disc** (`sr = 0.25`).
The smallest circle covering 3 corners of a square of half-side `o` is centred
on the block with radius `o√2`. With `remR = 0.95 · radius`
(`REMOVAL_FRAC`, `voxelsim.js:46`) and `radius = 1.1 + (SIZE − 1 + frac) · 0.5`
(`voxelsim.js:2208`), a **square, ground-anchored** piece of plan side `a`
metres first becomes removable at

```
radius ≥ (a/2 − 0.05) · √2 / 0.95   =   (a/2 − 0.05) × 1.48865
```

| Plan side `a` | Required hole radius | First SIZE level |
|---|---|---|
| 1 m | 0.67 m | SIZE 1 (immediately) |
| 2 m | 1.49 m | SIZE 1 (78% through) |
| 3 m | 2.16 m | SIZE 3 |
| 4 m | 2.91 m | SIZE 4 |
| 6 m | 4.39 m | SIZE 7 |
| 8 m | 5.88 m | SIZE 10 |
| **9.6 m** | **7.07 m** | **SIZE 12 — the ceiling** |
| > 9.7 m | > 7.1 m | **never removable** |

`MAX_RADIUS` is 6.6 m at `sizeFrac 0` (`voxelsim.js:63`) and reaches 7.1 m at
`sizeFrac 1`. For a rectangle `a × b` the driver is the diagonal:
`radius ≥ √((a−0.1)² + (b−0.1)²) / 1.9` — so a long thin kerb or cornice run at
grade is as bad as its length. **A 12 m ground-anchored plinth is a permanent,
uneatable monument.** This is the hard ceiling any grain rule must respect, and
it applies only to `gy === 0`; elevated pieces are removed by losing their
supports, not by this test.

This also corrects a stale note. `voxelsim.js:298` says *"The hole can only eat
bricks smaller than itself"*. That is not an enforced rule — there is no size
gate anywhere in the file — it is an **emergent property of this corner test**,
and it holds only for ground-anchored blocks.

### 3.3 Eating — the one-bite hazard

Consumption is two conditions, and **neither one looks at size**:

```js
_overVoid(x, z, remR2) { ... dx*dx + dz*dz <= remR2 }   // voxelsim.js:1322-1325
if (b.y + b.s / 2 <= SINK_Y) this._consume(b);           // :1743 (and :1620 for chunks)
```

`_overVoid` tests the block's **centre** only. Inside the void, `_stepDebris`
skips support entirely (`:1742-1745`) — the block simply falls. So:

> **A fallen 20 m slab lying beside the hole is eaten whole, in about a third of
> a second, by a SIZE 1 hole, the moment the hole's centre passes within
> ~1.05 m of the slab's centre.** It wakes via `_wakeRestingUnderHole`
> (`:1534-1557`), unsleeps, falls, and `_consume` (`:2174`) awards
> `mat.mass × s³ × comboMult` and **one** combo tick (`h.chain += 1`, `:2192`).

That is the legibility problem in one sentence, and it is exactly the difference
the owner named between *a huge slab vanishing in one bite* and *a wall
crumbling*. It is not a bug — it is what the geometry says — and the grain rule
in §4 exists to keep authors out of it.

### 3.4 Chunks, debris and feel

- `CHUNK_MIN = 3` (`voxelsim.js:43`) — a detached region of fewer than 3 blocks
  never becomes a rigid chunk. **A building whose every floor is one piece
  almost never chunks**; it becomes individual debris with the cheap per-block
  path (`_stepDebris`). Cheaper, but it loses the "a whole corner of the
  building came off as one body" read, and the `crash` event
  (`voxelsim.js:1651-1653`) that drives the audio/shake juice only fires for
  pools of ≥ 3. Mitigation is authoring, not code: split a floor into 2-4 bays.
- `sizeAvg` (`:1210`) drives rim torque `tip = 3.5 / c.sizeAvg` (`:1598`), and
  debris tipping is `tip = 1.5 / b.s` (`:1795`). Big pieces already tip slowly —
  the "slabs lean, they don't pirouette" cap at `:1605-1606` and `:1796-1797`
  holds. Good.
- Fall speed is **density-driven, size-independent** (`_fallG`,
  `voxelsim.js:1329`) — deliberately, per `.wiki/modules/voxel.md`, *"or big
  slabs would out-fall small bricks of the same material"*. Unaffected.
- The angle-of-repose spill (`voxelsim.js:1804-1813`) probes one block-width out
  and triggers on `support - lowTop > b.s * 1.25`. A large piece has a large
  threshold, so big rubble stops spilling and just sits. Expected; acceptable.
- Creak timing scales with `b.s` (`:1169`, `:1180`) — *"small bricks pop, big
  slabs grind"*. That already reads correctly for large pieces, and the shipped
  default (`creak = 0`) bypasses it anyway.

### 3.5 Combo and progression economy

`comboMult` awards a level **every 25 blocks eaten**, not per unit mass
(`voxelsim.js:89-92`), and the chain counter increments once per block
(`:2192`). Mass is conserved when you consolidate — `mat.mass × s³` sums the
same — so `totalMass`, the per-scene SIZE ladder scaling
(`voxelsim.js:296-310`), and the 50% completion goal are all unaffected. But
**the combo ladder is block-count-denominated**, so a Cambridge at half the
block count of Boston yields roughly half the combo levels for the same
excavation, which slows SIZE growth (`h.mass` is combo-inflated,
`voxelsim.js:2195-2204`) even though raw mass is identical.

Also note `SANDBOX_COIN_COUNT` and the goal are mass/position based, not block
based, so they are safe.

**Re-examined against the reinvestment principle (2026-08-06).** The first
version of this section assumed a large drop in total count and concluded that
re-denominating combos was close to a prerequisite. With the two-hand rule
holding the total steady, that conclusion changes — but **only partly, and it
matters which part survives**, because the aggregate figure hides the mechanism.

- **De-risked at the aggregate level: yes, materially.** A chain persists as
  long as the player eats *something* every `COMBO_WINDOW` = 1.5 s
  (`voxelsim.js:2228-2231`), and combo level is `floor((chain − 1) / 25)`
  (`:92`) — so over an uninterrupted run, combo levels earned track **total
  blocks eaten**. If the scene total holds, they hold. Brooklyn's excursion eats
  530 blocks in 62 s (`STATUS.md:54`), right at the ×3 cap's 501-block
  threshold; a Cambridge at a comparable count reaches the same place.
- **Not eliminated locally, and this is the honest part.** The 1.5 s window is a
  **rate gate**, not a total. Consolidation reduces *bites per object* even when
  it does not reduce *bites per scene* — and the two-hand rule explicitly
  **redistributes**: a consolidated building goes sparse and its savings are
  spent somewhere else on the map. The chain does not care about the map total;
  it cares whether the next bite arrives within 1.5 s of the last. A brick tower
  fed the player ~300 bites while they ploughed it and coasted them across the
  plaza beyond; the same tower as 8 slabs runs dry mid-plough, and at SIZE 1's
  9.96 m/s the hole has only ~15 m of travel to find the next thing before the
  chain drops (~39 m at SIZE 12's 26.12 m/s — `.wiki/modules/voxel.md`).
- **Verdict: a safeguard worth doing anyway, no longer a prerequisite.**
  Re-denominating `comboMult` by mass rather than block count still buys a
  genuinely better property — a combo economy invariant to authoring grain,
  forever, rather than "we counted and it came out fine this time." But it no
  longer blocks the primitive change and **should not be bundled into it**: own
  change, own before/after, or not at all.
- **What would make it a prerequisite again** — stated so it can be tested
  rather than argued: any contiguous district a player would plough in one pass
  whose **mean gap between consecutive eatable pieces along a plausible driving
  line exceeds ~15 m** (the SIZE 1 reach), or ~25 m at mid-ladder speeds. That
  is the concrete shape of "an author leans hard on slabs in one district": the
  scene total is fine, the warehouse quarter is a combo dead zone, and the
  market street two blocks over spikes. §7.2 adds chain-break count and mean
  inter-eat interval to the measured set precisely so this is caught by number
  and not by feel.
- **Cross-reference, added during Cambridge reconciliation (2026-08-07).**
  `.wiki/features/cambridge-sandbox/04-easter-eggs-and-achievements.md` §4.2
  proposes the concrete fix this section implies but does not specify: a coin
  refreshes `chainTimer` (`voxelsim.js:2193`) without incrementing `chain`
  (`:2192`). Checked against this section's own terms, it sustains rather than
  inflates — `comboMult` and `longest_chain` stay strictly block-denominated, so
  it does not touch the ×3 cap or the Unbroken Chain belt, and it does not
  relax the mean-gap probe either (a coin must not be counted as an eatable
  piece by that probe, or a district could paper over a real dead zone with
  currency instead of content). Consistent with this section and with
  Cambridge's own per-district floors (`03` §8); owned and stated in full there
  and in `04`, not repeated here.

### 3.6 Surfaces and texturing

Covered in §2.4(3): `uv: 'metre'` surfaces tile uniformly and would need
per-axis repeat for non-cubic pieces, and `BoxGeometry`'s single UV set means
one repeat serves all six faces. `uv: 'block'` surfaces (clamped, one tile per
face) are unaffected. The mortar course is proportional per face
(`voxelworld.js:322-355`) and therefore already scale-free — a 6 m slab gets the
same 2.34%-of-face border a 0.25 m brick does, which is *visually* the thing to
watch: a very large plain plate will read as one enormous brick unless it
carries a surface or a paint break.

### 3.7 Edibility/tier rules

The sandbox does **not** use `tiers.js` edibility at all. `isEdible` and the
1.35× ladder govern the campaign; the sandbox's removal is purely geometric
(§3.2, §3.3). This matters for AGENTS.md invariant 4 — see §5.

---

## 4. The vocabulary

Design premises, each grounded above:

- **The atom stays an axis-aligned box.** Not a preference — the sim's only
  geometric operation is AABB separation (§1.4, §3.1), and adding a `shape` tag
  would give the renderer a third bucket-key dimension, which `STATUS.md:87-88`
  already flags as the caution on this exact request.
- **One piece per architectural member**, sized by what the member *is*, not by
  a brick ladder.
- **Solid where the member is solid; a plate where the member is a surface.**
  Never fill a hollow interior (§2.4).
- **The budget is spent, not saved.** What a primitive frees goes back into the
  scene. See the two-hand rule immediately below — it is the premise the whole
  vocabulary exists to serve.
- **All extents are multiples of 0.25 m**, so ADR-0006's determinism proof
  survives (§3.1).
- **Piece size follows BUILDING size.** The ask is not "more complex
  buildings," it is *larger buildings that are not made of 20,000 cubes* —
  see the scale rule immediately below, stated as strongly as the two-hand
  rule because the owner keeps coming back to it.

### The scale rule — *the bigger the building, the bigger the pieces*

The owner's framing, 2026-08-07: *"It shouldn't be that the Empire State
Building is made out of 20,000 voxels. The floors are solid pieces, the
columns are solid pieces — the same look, just not made up of as many
individual parts."*

Three clauses:

1. **The vocabulary matters MOST where the building is BIG.** A brownstone of
   0.5 m bricks costs hundreds of blocks; a tower of them costs tens of
   thousands — and reads worse. So the larger the structure, the harder an
   author leans on structural members: solid columns, per-bay floor slabs,
   curtain panels on mullions, cornice runs. A 60 m tower is hundreds of
   blocks, not twenty thousand — the *Empire State test*: no landmark in
   Cambridge may cost a small scene's entire budget in one footprint.
2. **Same look, fewer parts.** Consolidation is invisible from gameplay
   distance or it is wrong. The silhouette, the surface grain, and the
   collapse read all survive; only the part count changes. The one trap is
   §3.6's: a very large *plain* plate reads as one enormous brick — a big
   piece carries a surface or a paint break, exactly as a big real member
   carries joints and shadow lines.
3. **The failure this prevents is the toy model.** A large building piled
   from small cubes reads as a miniature of a building — the Mickey Mouse
   read — and burns a whole district's budget doing it. This is the third
   named failure mode, beside the two-hand rule's expensive solid lump and
   empty diorama: those two come from consolidating wrongly or stopping
   early; this one comes from not consolidating at all.

The one deliberate refinement, and it is gameplay's, not a dilution of the
ask: "each floor one solid piece" lands as **one slab per structural bay**
(§4.2 clause 2), so a 20 × 20 m tower floor is 9-16 pieces rather than 1 —
a 25-40× reduction from the ~400 cubes it is today, with every bite still
legible. Floors *are* solid pieces; columns *are* solid pillars. The bay cap
just keeps the collapse readable while they are.

### The two-hand rule — *skin, not fill* · *spend it back*

Two rules, always stated together, because **they pull in opposite directions
and an author needs both hands on the wheel.** Each one alone produces a
recognisable, different failure.

> **Hand 1 — SKIN, NOT FILL.** A solid piece replaces a *surface*, never an
> *interior*. A floor becomes one 0.25 m or 0.5 m plate; it does not become a
> 1 m solid cube of concrete. A wall becomes a panel; it does not become a
> block. A column is solid because a column *is* solid.
>
> *Prevents:* **the expensive solid lump.** Fine-cell cost is linear in occupied
> volume, not in block count (§2.1, §2.4), so an author who consolidates by
> filling produces a scene with a beautifully low block count that builds
> *slower*, eats more memory, and is no cheaper per frame than the thing it
> replaced. The block count lies; `sim.grid.size` tells the truth.

> **Hand 2 — SPEND IT BACK.** Every block a primitive frees is budget **owed
> back to the scene**, not banked. A floor that costs one slab instead of forty
> bricks has bought forty blocks of something else: the loading dock, the roof
> plant, the fire escape, the bike racks, the thing next door that would not
> otherwise have fit. Cambridge should land in the same block neighbourhood as
> the existing authored scenes and read as *more* place for it.
>
> *Prevents:* **the empty diorama.** An author who consolidates and stops
> produces a technically elegant, over-simplified level — correct silhouettes,
> nothing to look at between them, and (per §3.3 and §3.5) far too few things to
> eat. This is the failure the owner named directly: *"we're not trying to do a
> 'least amount of blocks possible.'"*

The two together give the actual objective: **detail per block, at a comparable
budget.** Neither "fewer blocks" nor "more blocks" is the goal; *more scene per
block, all of it spent* is.

### 4.1 The primitives

Dimensions are written `w × h × d` in metres (x, y, z), min-corner placement,
matching `_block`'s existing convention (`voxelsim.js:461-466`).

| Primitive | Dimensions convention | Use it for | Cost vs. brick-by-brick | When eaten |
|---|---|---|---|---|
| **slab** | `bay × 0.25–0.5 × bay`, bay ≤ 6 m | one floor plate per structural bay; roof decks; landings | 1 block replaces 25-100. Fine cells **drop** (0.25 m plate vs 1 m course) | Detaches whole when its columns go; falls as one plate. Sits inside the grain ladder at its bay size |
| **column** | `0.5 × storey × 0.5` or `1 × storey × 1` | the owner's "solid pillar"; interior grid; portico columns | 1 block replaces 3-12 | Its slab above loses vertical support and drops the same step. Reads as "the leg went, the floor came down" — the right read |
| **pier** | `1–2 × 2–4 × 1–2`, at grade | masonry piers, bridge bents, gate posts, plinth legs | 1 replaces 8-32 | At grade → obeys the grain ladder (§3.2); a 2 m pier is removable from SIZE 1.8 |
| **beam** | `len × 0.5 × 0.5` along one axis, `len ≤ 6 m` | lintels, spandrel bands, crossheads, rails | 1 replaces up to 24 | **Must stand on something at each end.** A beam is never fed horizontally — one hop from a support costs `(len + s)/2`, which blows `maxSpan` for any `len > ~5 m` |
| **panel** | `w × h × 0.25` (or `0.25 × h × d`) | curtain-wall infill, spandrels, non-load-bearing walls, signage faces | 1 replaces 4-40 | Glass panels: still `vertBond/horizBond < 0.5`, so **every panel needs a non-glass supporter at its own level** (`.wiki/modules/voxel.md`, rule 2). Unchanged rule, larger pieces |
| **mullion** | `0.25 × storey × 0.25` | the vertical strip that *carries* the glass panels beside it | 1 replaces 4-16 | The load path. Kill the mullion and the panels beside it lose their only horizontal support |
| **cornice** | `run × 0.25–0.5 × 0.5`, projecting one cell outboard of the plate carrying it | the continuous avenue shadow line | 1 replaces a whole `for` loop (see `setbackTower`, `voxelkit.js:2115-2125`, which currently emits ~2·`w/0.5` cubes per building) | Detaches with its plate |
| **plinth** | `w × 0.5–1 × d`, at grade, `w,d ≤ 6 m` | building bases, monument steps, terrace edges | 1 replaces 36+ | Grain ladder applies hard (§3.2). **Never exceed 6 m** or it becomes late-game-only furniture |
| **tread** | `run × 0.25 × 0.5` | stair flights, grandstand steps, terracing | 1 per step | Each tread rests vertically on the one behind it |
| **ramp / wedge** | **does not exist.** Author as a run of `tread`s of decreasing width. | slopes, gables, batter | ~1 block per 0.25 m of rise, vs ~`w` blocks today | Per tread |
| **corbel-arch** | a stack of `beam`s of shrinking span, each resting vertically on the one below | arches, vaults, gateways | replaces `stoneArch`'s cube ring | Per course, bottom-up — which is also how it fails structurally, correctly |
| **drum** | a ring of `panel`s at ~12-16 facets | columns-in-the-round, rotundas, silos, tanks | 12-16 blocks vs a cube ring of 40+ | Per facet |

Everything in that table is **one call to `_block` with three extents**. Nothing
needs a new shape, a new geometry, or a new material.

### 4.2 The grain rule

A player must be able to read *"I am eating a building"* rather than *"the
building deleted itself"*. Three clauses, all derived above:

1. **Grade clause (hard, engine-derived).** Any piece with `gy === 0` must have
   a plan diagonal `≤ 8 m`, i.e. `√((a−0.1)² + (b−0.1)²) ≤ 8`. That puts it
   inside SIZE 10 on the §3.2 ladder with margin. Above ~9.7 m of diagonal it is
   permanently uneatable and becomes accidental scenery.
2. **Bite clause (authoring, from §3.3).** No single piece may carry more than
   **~5% of its structure's mass**. A structure should take at least ~20 bites.
   In practice this caps a floor plate at one *bay* — 4-6 m — not one *floor*,
   which is the single most important correction to the naive reading of "each
   floor one solid piece". A 20 × 20 m tower floor becomes 9-16 slabs, not 1;
   that is still a 25-40× reduction from the ~400 cubes it is today, and it
   keeps the collapse legible. The ~385 blocks that frees are **owed straight
   back to the district** (hand 2), not banked.
3. **Ladder clause (feel).** Match the *dominant* piece size of a district to
   the SIZE the player will be at when they reach it, using the §3.2 table:
   0.5-1 m street furniture and infill everywhere (SIZE 1); 2 m piers and
   plinths on the approach (SIZE 2); 4 m bays in the mid-district (SIZE 4);
   6 m plinths and monument masses only where the route arrives late (SIZE 7).
   Cambridge's spawn neighbourhood must be fine-grained or the opening minute
   has nothing the hole can take.

### 4.3 When NOT to consolidate

With the budget holding steady (the two-hand rule), the risk is no longer "too
few pieces in the scene." It is **an author reaching for a big primitive where
several smaller ones would read better and eat better.** Consolidation is
bracketed from both ends by findings already established above:

- **From below, by the grade ceiling (§3.2).** A ground-anchored piece over
  ~9.7 m of plan diagonal is *permanently uneatable* — it stops being content
  and becomes accidental scenery, invisible to the 50%-of-mass goal in the worst
  way (it counts toward `totalMass` at `voxelsim.js:293` and can never be
  removed from it). Clause 1's 8 m cap is the working limit; treat 9.7 m as the
  cliff, not the target.
- **From above, by the one-bite hazard (§3.3).** `_overVoid` tests the centre
  only, so any elevated piece, at any size, is swallowed whole the moment the
  hole's centre reaches it. Past ~5% of a structure's mass, a piece stops
  reading as a bite and starts reading as the building deleting itself.

**Consolidate when the member is one physical thing whose failure is genuinely
all-or-nothing** — a floor plate, a pier, a lintel, a column, a cornice run on
one facade. **Keep it split when the real thing is an assembly** — a brick wall,
a rubble mound, a truss, a stair, a roofline. Five specific "don'ts":

1. **Don't consolidate across a support boundary.** Two members that need to
   fail at different times must be two pieces — merging them puts them in one
   BFS node and they now fail together, always.
2. **Don't consolidate below ~4 bites per object.** Clause 2 caps a piece at 5%
   of its *structure*; the same instinct applies per object. A kiosk that is one
   block is a kiosk that vanishes.
3. **Don't consolidate the spawn neighbourhood.** At SIZE 1 the hole is 1.1 m
   and the §3.2 ladder says only ~1-2 m pieces are removable at grade. A
   consolidated opening district is an opening minute with nothing to eat.
4. **Don't consolidate where the silhouette is the point.** A stepped parapet,
   gable or cornice reads as detail; the same run as one bar reads as a bar.
   This is also where the mortar course betrays you — it is proportional per
   face (§3.6), so a very large plain plate reads as *one enormous brick*.
5. **Don't consolidate to hit a number.** There is no block-count target to
   beat. If a member reads better as six pieces, it is six pieces, and the
   budget it did not save was never owed to anyone.

### 4.4 What the budget should land at

**Not a reduced total.** Applying clauses 1-3 plus the two-hand rule should put
Cambridge in **the same block neighbourhood as the existing authored scenes** —
call it Brooklyn-to-Boston range, ~40-80k — while delivering materially more
apparent detail and more eatable "stuff" per square metre than any of them.
The primitive vocabulary is what makes that affordable: the blocks a one-slab
floor frees are the blocks that pay for the loading dock next to it.

A falling block count is therefore a **warning sign, not a result**. If a
Cambridge district comes in dramatically under its brick-built twin, hand 2 has
been dropped and the district is under-populated, not efficient. §7 is how that
gets caught rather than admired.

---

## 5. Engine changes, ordered by cost

### Tier 0 — already works, zero change

**Arbitrary cube sizes on the 0.25 m grid.** `_block` accepts any multiple of
`FINE` (`voxelsim.js:463-466`); nothing enumerates legal sizes; `_addBlock`,
`_buildNeighbors`, `_sleepObsAdd` and the cell-ownership probe
(`tools/validate.mjs:276-290`) are all written against `b.fs` generically. A
3 m or 5 m cube ships today. This covers `pier` and `plinth` immediately and
should be used to prototype the vocabulary's *feel* before any code lands.

### Tier 1 — the one genuinely required change: anisotropic extents

Replace the scalar `fs`/`s` with per-axis `fsx/fsy/fsz` and `sx/sy/sz`. This is
what `slab`, `column`, `beam`, `panel`, `mullion`, `cornice` and `tread` all
need, and it is the whole of the ask. Scope, from the audit:

- `voxelsim.js` — ~89 sites (41 × `.fs`, 48 × `.s`). Most are mechanical:
  `_addBlock`'s triple loop (`:505-511`), `_consume`'s mirror of it
  (`:2184-2190`), `_foot` (`:1334-1336`), `_topAdd/_topRemove/_topAt`
  (`:1338-1401`), `_contact` (`:1406-1427`), `_sleepObsAdd/Remove`
  (`:1440-1469`), `insertInto` (`:1985-1995`), the collision-bucket build
  (`:283-292`), `_assertCellKeyRange`'s pad (`:1297`), `_zoneCells`
  (`:886-887`), `contentExtent` (`voxelworld.js:281`).
- **Per-axis half-extents in the solver** (`:2110`, `:2130-2133`, `:2039`,
  `:2049` etc.): `hSum` becomes three values. Mechanical but must be done
  everywhere at once, or blocks separate along wrong axes by wrong amounts.
- **Mass and volume**: `b.s ** 3` → `sx·sy·sz` at `:293`, `:1201`, `:2195`,
  `:2197`. `sizeAvg` (`:1203`, `:1210`) needs a defined characteristic length.
- **The one non-mechanical edit: the span hop.** `ns = cs + (cur.s + nb.s) / 2`
  (`:1090`) is direction-independent today *because blocks are cubes*. With
  boxes it must use the extents **along the hop axis**, and `neighbors` is an
  unordered `Set` (`:828`) that does not record direction. The axis is
  recoverable at BFS time from the two fine AABBs — the hop axis is the one
  whose ranges are adjacent rather than overlapping — but it is real work in the
  hottest loop ADR-0006 exists to protect. Budget the measurement.
- **Vertical/horizontal classification** (`:1083`, `:1085`, `:1272`, `:1671`)
  uses `cur.fs` as a y-extent; becomes `cur.fsy`.
- **Creak timing** (`:1169`, `:1180`) multiplies by `b.s`. Use
  `cbrt(sx·sy·sz)` so cubes produce bit-identical values and existing scenes do
  not re-pace.
- `voxelworld.js` — **six sites only** (`:281`, `:596-604`, `:791`, `:2149`).
  The renderer barely knows about size. `voxelkit.js:270-278` already
  anticipates this exact change: *"when the primitive changes — a non-uniform
  slab instead of a cube, say — it is a one-line edit per builder"*, because
  every mass builder funnels through a single `put()` site.
- `tools/validate.mjs` — `probeCellOwnership` (`:276-290`) and `footprintTops`
  (`:262-274`) both iterate `b.fs`; both become three-axis.

**Non-negotiable acceptance condition:** all five existing scenes must remain
**byte-identical**. Every cube keeps `sx === sy === sz`, so every expression
above must reduce to today's exactly. `node tools/validate.mjs` must print
`ALL PASS` (`AGENTS.md:9-13` makes it mandatory for any touch of `voxelsim.js`
or `voxelkit.js`), and the per-step state digest ADR-0006 established as the
standard of proof should be re-run rather than trusted.

### Tier 2 — nice-to-have, sequence after Tier 1

- **Drop `b.s` from the unsurfaced bucket key** (§2.3). Likely a net *reduction*
  in draw calls and it makes the size vocabulary free. Independent of Tier 1 and
  measurable on today's tree — do it first as its own change with its own
  before/after, exactly so the vocabulary's own cost is not confounded with it.
- **Per-axis surface repeat** (`voxelsurfaces.js:167-192`) — only if Cambridge
  declares a `uv: 'metre'` surface on a non-cubic piece.
- **A `crash` / chunk floor for large pieces.** `CHUNK_MIN = 3` (§3.4) means a
  consolidated building loses its chunk juice. Prefer the authoring fix
  (bays, per §4.2 clause 2) and only touch the constant if playtest says so.

### Tier 3 — refuse

- **Non-box render shapes** (true wedges, cylinders, arches). Wanted
  aesthetically; refused because the sim would still collide the AABB, so
  geometry and physics would visibly disagree, and because `STATUS.md:87-88`
  correctly flags the `shape` tag as a third bucket-key dimension.
  **Compliant alternative:** the `tread` / `corbel-arch` / `drum`
  approximations in §4.1, which the shipped scenes already use and which get
  materially cheaper under Tier 1 (a stepped gable becomes one wedge-shaped
  stack of long thin slabs instead of a field of cubes).

### Invariant check against `AGENTS.md`

| Invariant | Verdict |
|---|---|
| 1 — no `Math.random()` in `js/` | Unaffected. New primitives are pure geometry; the validator's glob already covers `js/voxelscene-*.js` (`conventions.md` hard rule 1). |
| 2 — pure sim boundary | Unaffected. Everything in Tier 1 is inside `voxelsim.js`; no three.js, no DOM. |
| 3 — state changes only in `sim.step(1/60)` | Unaffected. Scene builders run in the constructor, as they always have. |
| 4 — **size/edibility only via `tiers.js`** | **This is the one to watch.** The temptation is to add a legibility gate like `if (b.sx > hole.radius * 2) return;` to stop the one-bite hazard (§3.3). **Do not.** That is a second edibility ladder living outside `tiers.js`, in direct conflict with the invariant, and it would also break the sandbox's *"the hole never decides whether an object fits"* premise (`.wiki/modules/voxel.md`). **Compliant alternative:** solve it in *authoring* — §4.2's grain rule — and enforce it with a validator probe (§7), which is where every other scene contract already lives. If a runtime gate ever does become necessary, it belongs in `tiers.js` as a named export, not inline in `voxelsim.js`. |
| 5 — placement no-overlap via the spatial hash | Campaign-only; the sandbox's equivalent is one-block-per-fine-cell, enforced by `probeCellOwnership`. Larger pieces make overlap *easier to commit* (a 6 m slab clashes with far more) and *cheaper to detect* (the probe is per fine cell either way). Run it. |
| 6 — save schema | Unaffected. No save shape changes. |

---

## 6. Authoring ergonomics

### 6.1 A new module, not a bigger kit

`STATUS.md:18-21` is explicit and it applies directly here:

> *"`js/voxelkit.js` is **shared** across all three built-city sandbox scenes
> now… Anything Brooklyn-only added there still does not belong in a shared
> kit."*

`voxelkit.js` is 2,771 lines and ~95 exports. Adding a Cambridge vocabulary to
it would repeat exactly the mistake the board is already tracking. The split:

- **`js/voxelforms.js` (new, small)** — the twelve primitives of §4.1 and
  nothing else. Pure geometry over `sim._block`, no city semantics, no named
  buildings. This is a *lower* layer than `voxelkit.js`: `voxelkit` may
  eventually consume it, `voxelforms` never imports `voxelkit`. Being separate
  is what stops it accreting.
- **`js/voxelscene-cambridge.js`** — every Cambridge-specific composite
  (`mitDome`, `harvardYardRange`, `kendallLab`, …) lives here, next to the only
  scene that uses it, exactly as Boston's scene-local builders do today.
- **Graduation rule** (write it in the header of both files): a composite moves
  from a scene file into `voxelkit.js` **only when a second scene calls it**.
  One caller is not a kit.

The existing `covers:` frontmatter in `.wiki/modules/voxel.md` must gain both
new files in the same commit as the code (`conventions.md`, Wiki hygiene).

### 6.2 What a scene file should read like

The target is that a reader sees the *building*, not the loops. Today's
`tower()` (`voxelkit.js:230-265`) is five nested branches emitting cubes; the
vocabulary's equivalent should name members:

```
frame(sim, {                  // an MIT-style lab block, ~6 pieces per storey
  ox: 12, oz: -40, w: 18, d: 12, storeys: 5, storeyH: 3.5,
  bays: [6, 6, 6],            // slab bay widths along x — clause 2 of the grain rule
  column: { s: 0.5, mat: 'concrete' },
  plate:  { t: 0.5, mat: 'concrete', color: C.precast },
  skin:   { kind: 'mullion+panel', period: 3, glass: C.labGlass },
  cornice:{ at: 'top', proj: 0.5, color: C.limestone },
});
```

Three properties to preserve from the existing kit, because they were learned
the hard way:

1. **One `put()` site per builder** (`voxelkit.js:270-278`). Non-negotiable —
   it is what makes the Tier 1 primitive change a one-line edit per builder
   rather than an audit of every nested loop.
2. **Emission order is part of the contract.** `megaShell`'s comment at
   `voxelkit.js:277-278` notes `fill` reproduces `_box`'s x→y→z order exactly,
   because `id` order is block-array order and `_falling`/`_sleepObs` ordering
   is load-bearing (ADR-0006). Any new builder must fix and document its order.
3. **Extents on the 0.25 m grid, always** (§3.1's determinism condition). A
   builder that computes an extent by division must round to `FINE`.

### 6.3 Author-facing gotchas to put in the module header

- A beam/slab **never receives horizontal support** past `maxSpan` (§3.1). Every
  plate needs a column under it, not beside it.
- Glass rules are unchanged and now apply to bigger pieces: a glass `panel`
  needs a non-glass neighbour **at its own level**, and nothing rests on glass.
- Keep everything ≥ 1.7 m from spawn (the SIZE-scaled hanging threshold,
  `.wiki/modules/voxel.md` scene rule 8), not 1.05 m.
- **The placement step must equal the piece extent** — the same rule as
  `.wiki/modules/voxel.md` rule 10, and far easier to violate with mixed
  anisotropic extents than with a uniform brick. A validator probe should
  enforce it.
- Every structure ≥ 6 m still needs a camera blocker; Cambridge should use
  `generateBlockers` (`voxelkit.js:742`) like Brooklyn and Upper Manhattan, not
  a hand list.

---

## 7. Measurement plan

The claim to prove is **"at a comparable block budget, materially more
scene."** Not "same detail, fewer blocks" — that was the first draft's framing
and the owner corrected it. Lower block count is *not* the deliverable; it is
headroom, and the deliverable is what gets built with the headroom. So the
measurement has to answer two questions, and confusing them is the main way
this goes wrong:

- **Is the primitive more efficient per member?** (a control experiment, E1)
- **Does the scene deliver more, at the same budget?** (the real claim, E2)

`STATUS.md:50-53` sets the instrument standard and it is binding:

> *"this box showed 2.0–2.6× median/min noise and a 40 s outlier on a 2.5 s
> build while agents were live. **No perf number is quotable until the tree is
> still.** Min-of-N round-robin is the minimum acceptable instrument."*

Note that `probe-buildcost2.mjs`, the probe that produced the current numbers,
is **not in `tools/`** — it was a scratch script. It has to be rebuilt as a
committed tool before any of this is measurable, and that is task zero.

### 7.1 The two experiments

Both run on **one Cambridge district**, not against Boston — comparing Cambridge
to Boston measures two different cities and proves nothing. Proposal: Kendall
Square + the MIT river face, ~120 × 90 m.

**E1 — member efficiency (control).** Author the district **twice from the same
plan**: same footprints, same skyline, same palette.

- **A — `cambridge-brickwise`**: today's `voxelkit.js`, today's 0.25/0.5/1/2 m
  ladder. It must be a *fair* control — a genuine, competent Boston-quality
  pass, not a strawman.
- **B1 — `cambridge-forms`**: the identical plan through the §4 vocabulary,
  **with nothing added**.

E1 answers only "how much headroom does the primitive buy?" Its block-count
delta is the **budget released**, and it is an input to E2 — *not a result to
celebrate*. A large delta here with nothing done about it is exactly the empty
diorama the two-hand rule exists to prevent.

**E2 — scene richness (the real claim).** Take E1's released budget and spend
it.

- **B2 — `cambridge`**: same ground area, same 19-probe contract, authored
  freely through the vocabulary, **to a block budget within ±15% of A**. This is
  the shippable variant.

The comparison that decides the direction is **A vs. B2 at equal budget**, and
the question it answers is: *does the same number of blocks deliver a materially
richer place?*

Both A and B2 must pass the full shared 19-probe contract in
`tools/validate.mjs`. Neither ships until the comparison is recorded.

### 7.2 Counts — exact, noise-free, quotable immediately

Recorded from a headless build (these are counts, not timings):

| Metric | Source | What it is for |
|---|---|---|
| `sim.totalBlocks` | `voxelsim.js:278` | **E2 constraint**, not a target — B2 within ±15% of A |
| Fine-cell count | `sim.grid.size` | **the honest cost metric** (§2.1); catches the *skin-not-fill* failure |
| `sim.totalMass` | `:293` | pacing; drives `_sizeLadder` (`:296-310`) and the 50% goal |
| Distinct `b.s` / bucket count / draw calls | the §2.3 key | render cost of the vocabulary |
| Zone count | `sim._compBlocks.length` | ADR-0006's unit |
| **Distinct identifiable objects placed** | count of named builder/composite calls in the scene file | **the headline E2 number** — "more stuff" made countable |
| **Eatable pieces per m² of built footprint** | blocks ÷ footprint cells with content | density the player actually meets |
| **Mean gap between consecutive eatable pieces** along the scripted route, per district | derived from the excursion | §3.5's re-trigger condition — the combo dead-zone detector |
| **Chain breaks + combo levels earned** on the scripted excursion | `hole.bestCombo`, chain-reset count | §3.5's regression risk, measured not assumed |
| Dead-ground census | existing shared probe | Boston ships zero; Cambridge should too |

**E1 target:** B1's block count materially under A's *with `grid.size` no higher
than A's*. If `grid.size` goes **up**, hand 1 has been dropped (§2.4) and the
design is wrong regardless of what the block count says.

**E2 targets:** B2 within ±15% of A's block count; distinct identifiable objects
**up by ≥ 50%**; eatable pieces per m² of built footprint **not below A's**;
mean inter-piece gap under 15 m in every district; combo levels earned **within
10% of A's**.

**A falling block count in E2 is a failure, not a success.** If B2 lands far
under A, the released budget was banked instead of spent and the district is
under-populated. That is the specific thing this experiment exists to catch.

### 7.3 Apparent richness — the half that is easy to fake

Define it before running it, or it becomes an argument.

- **Silhouette variety, not silhouette agreement.** E1's B1 should match A's
  outline almost exactly (that is the control working). **E2's B2 should not** —
  it should be visibly busier. Render from **12 fixed camera poses** (the
  establishing shot plus 11 on a ring, reusing the intro-camera framing path
  from the 48-pose luma study, `STATUS.md:60-76`) and record per pose:
  **edge density** (Sobel edge pixels per frame — a decent proxy for apparent
  detail), **distinct roofline heights per 10 m of street frontage**, and mean
  luminance (so a richness gain is not just a lighting change).
- **Per-pose visible-piece count** — distinct blocks contributing pixels. In E1
  this will fall and that is expected; **in E2 it should be flat or up against
  A**. If B2's visible-piece count is below A's at most poses, the district
  reads flatter than the thing it replaced, no matter what the object count
  says, and the grain rule (§4.2 clause 3) plus hand 2 both need tightening.
- **The judgement call is the owner's, not the instrument's.** Numbers bound the
  risk; they cannot decide whether it looks good. Ship A and B2 behind the
  free-play picker and let him drive both.

### 7.4 Performance — under the STATUS.md discipline

Only after the tree is still (no agents running, nothing else building):

- **Build cost**: min-of-9, **round-robin** (A, B1, B2, A, B1, B2, … — never all
  of A then all of B, which is what makes a drifting machine look like a
  result).
- **Per-frame**: median and p95 `sim.step` over a **scripted, deterministic
  excursion** identical in all three variants, plus `_recalcSupport` ms/call,
  which is ADR-0006's headline number and the one most likely to move. Note the
  expectation: B1 should be clearly cheaper than A, and **B2 should be roughly
  level with A** — B2 spent its savings, so a big per-frame win there means it
  under-spent.
- **Draw calls / buckets**: report separately for (i) Tier 1 alone and (ii) Tier
  1 plus the §2.3 key change, so the two are not confounded.
- Report **min-of-N**, state N, state the machine was quiet, and quote nothing
  otherwise.

### 7.5 Regression gates (all must pass before either variant ships)

1. `node tools/validate.mjs` → `ALL PASS` (`AGENTS.md:9-13`).
2. All five existing scenes **byte-identical** — block counts, total mass, and a
   per-step state digest across the existing scripted excursions, the standard
   ADR-0006 set.
3. `probeCellOwnership` clean on both variants — larger pieces make overlaps far
   easier to author.
4. A **new probe**: no `gy === 0` block with a plan diagonal > 8 m (§4.2
   clause 1). This is the grain rule made enforceable, and it belongs in the
   shared contract, not in a scene file.
5. A **new probe**: placement step equals piece extent on every axis
   (`.wiki/modules/voxel.md` rule 10, generalised).
6. A **new probe, and the one that enforces hand 2**: per declared district,
   the mean gap between consecutive eatable pieces along the scene's own
   scripted route stays under 15 m, and no district falls below the scene's
   median eatable-pieces-per-m² by more than half. This is the combo dead zone
   (§3.5) and the empty diorama made enforceable, and like every other scene
   contract it belongs in the shared probe set, not in a scene file.

---

## 8. Open questions for the owner (product, not technical)

Only two, and both are answerable from playing:

1. **How big should one bite feel?** §4.2 clause 2 proposes "a building takes at
   least twenty bites." That is a feel number, and it is the single dial that
   decides how far this whole direction goes.
2. **Which reads better in Cambridge — the crumble or the collapse?** Consolidated
   pieces trade the "wall crumbling" texture for a "the corner came off in one
   slab" read. Both are legitimate; the vocabulary can be tuned toward either by
   bay size alone.

Everything else on this page is a decision that has been made here.

## Related

- `adr/0013-anisotropic-voxel-primitives.md` — the architectural decision this
  page proposes
- `adr/0006-structural-zone-simulation.md` — the support BFS and the
  determinism proof this change must preserve
- `adr/0002-sim-render-split.md` — why the renderer can be told about extents
  the sim cares nothing for
- `modules/voxel.md` — the shipped model, the scene-building rules
- `STATUS.md` — open decision 1 (construction vocabulary), the measurement
  precondition, the shared-kit warning
