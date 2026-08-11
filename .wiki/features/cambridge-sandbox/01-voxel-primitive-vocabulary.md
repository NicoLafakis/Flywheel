---
covers:
  - "js/voxelsim.js"
  - "js/voxelworld.js"
  - "js/voxelkit.js"
  - "js/voxelsurfaces.js"
---
# Cambridge sandbox — the voxel primitive vocabulary

**Status:** the capability audit, and now the shipped toolkit — `js/voxelforms.js`
carries all twelve primitives. The audit below is kept as written, because it is
the reasoning the toolkit was built from. `js/voxelkit.js` picked up twelve more
gallery builders on 2026-08-10 (deliveryTruck, schoolBus, billboard and nine
others — see `modules/voxel.md`); they are ordinary `voxelkit` builders, not
`voxelforms.js` primitives, and Cambridge does not call them, so the toolkit
audit below is unaffected.
**Date:** 2026-08-06 (reconciled 2026-08-10).
**Answers:** the owner's *"Construction vocabulary"* request, which sat on
`STATUS.md`'s board as an open decision — *"his actual request, and nothing has
been started on it"* — until ADR-0013 was accepted and this vocabulary shipped.
The board entry is retired.

The product ask, in the owner's terms: the new Cambridge scene should not chase
a higher block count. It should be **more artistic with the voxels** — different
sized bricks, blocks and shapes, whatever size best represents a thing. His two
worked examples: an apartment floor should be **one solid piece**, not a field
of same-size cubes; a pillar should be **a solid pillar**, not a stack of
bricks. He accepts that this moves away from the brick-by-brick feel. That is
the point.

The objective is not minimisation. In the owner's words: *"we're not trying to
do a 'least amount of blocks possible.'"* The goal is **the right shape for the
thing**. Anisotropic primitives are a way to buy detail that uniform cubes could
not afford, so the same scene reads richer rather than sparser. The success
metric everywhere below is **detail per block** — how much place a district
delivers — not a block total in either direction.

This page establishes what the engine can already do toward that, what it
cannot, what the change actually costs, and the named set of primitives to
author with. Every claim about current behaviour cites a file and a line.

Line numbers move as the tree does. `STATUS.md`'s established-facts block cites
`_addBlock` at `voxelsim.js:188`, `_buildNeighbors` at `:516`, and the
`InstancedMesh` sizing at `voxelworld.js:377`; those functions now live at
`voxelsim.js:479`, `voxelsim.js:810` and `voxelworld.js:621`. The facts are the
same — only the offsets shifted. All citations below are against the tree at
2026-08-06 (`cc38fff`).

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

Read the figures below as a description of what a block buys, not as an argument
for buying fewer. The cost model tells us how much scene fits inside the
headroom the renderer and sim can carry (§4.4); what we do with that headroom is
a content question, and §4 answers it.

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
   as one solid 10 × 10 × 1 m piece it is 6,400. Hence *skin, not fill*: a
   solid piece stands in for a surface rather than an interior, so a floor
   becomes one 0.25 m or 0.5 m *plate* rather than a 1 m solid block. That is
   one half of the two-hand rule in §4.
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
  0.25/0.5/1/2 m)"*. Anisotropic extents therefore stay on multiples of 0.25 m,
  which keeps half-sums on multiples of 1/8 so two tying BFS paths still produce
  bit-identical floats. Everything downstream of that proof depends on it, so
  it is one of the few authoring rules with no give in it.

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
grade is as bad as its length. A 12 m ground-anchored plinth is a permanent,
uneatable monument. That is the ceiling any grain rule works under, and it
applies only to `gy === 0`; elevated pieces are removed by losing their
supports, not by this test.

Worth reading alongside `voxelsim.js:298`, which says *"The hole can only eat
bricks smaller than itself"*. There is no size gate anywhere in the file — that
behaviour is an emergent property of this corner test, and it holds only for
ground-anchored blocks.

### 3.3 Eating — a big piece goes in one bite

Consumption is two conditions, and neither one looks at size:

```js
_overVoid(x, z, remR2) { ... dx*dx + dz*dz <= remR2 }   // voxelsim.js:1322-1325
if (b.y + b.s / 2 <= SINK_Y) this._consume(b);           // :1743 (and :1620 for chunks)
```

`_overVoid` tests the block's **centre** only. Inside the void, `_stepDebris`
skips support entirely (`:1742-1745`) — the block simply falls. So:

A fallen 20 m slab lying beside the hole is eaten whole, in about a third of a
second, by a SIZE 1 hole, the moment the hole's centre passes within ~1.05 m of
the slab's centre. It wakes via `_wakeRestingUnderHole` (`:1534-1557`),
unsleeps, falls, and `_consume` (`:2174`) awards `mat.mass × s³ × comboMult`
and one combo tick (`h.chain += 1`, `:2192`).

That is the legibility question in one sentence, and it is exactly the
difference the owner named between *a huge slab vanishing in one bite* and *a
wall crumbling*. It is not a bug — it is what the geometry says — and the grain
rule in §4 is how authors steer around it.

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
(`voxelsim.js:296-310`), and the 50% completion goal are all unaffected. The
combo ladder, though, is block-count-denominated, so a scene with far fewer
pieces yields proportionally fewer combo levels for the same excavation, which
slows SIZE growth (`h.mass` is combo-inflated, `voxelsim.js:2195-2204`) even
though raw mass is identical. `SANDBOX_COIN_COUNT` and the goal are mass and
position based, so they are unaffected either way.

The aggregate risk here is small; the local one is real, and it is worth
separating the two because the aggregate figure hides the mechanism.

- **At the scene level this mostly takes care of itself.** A chain persists as
  long as the player eats *something* every `COMBO_WINDOW` = 1.5 s
  (`voxelsim.js:2228-2231`), and combo level is `floor((chain − 1) / 25)`
  (`:92`) — so over an uninterrupted run, combo levels earned track total blocks
  eaten. Brooklyn's excursion eats 530 blocks in 62 s (`STATUS.md:54`), right at
  the ×3 cap's 501-block threshold; a Cambridge of comparable density reaches
  the same place.
- **Locally it does not.** The 1.5 s window is a rate gate, not a total.
  Consolidation reduces bites *per object* even where the scene as a whole has
  plenty to eat, and the chain only cares whether the next bite arrives within
  1.5 s of the last. A brick tower fed the player ~300 bites while they ploughed
  it and coasted them across the plaza beyond; the same tower as 8 slabs runs
  dry mid-plough, and at SIZE 1's 9.96 m/s the hole has only ~15 m of travel to
  find the next thing before the chain drops (~39 m at SIZE 12's 26.12 m/s —
  `.wiki/modules/voxel.md`).
- **So: a safeguard worth doing, not a prerequisite.** Re-denominating
  `comboMult` by mass rather than block count buys a genuinely better property —
  a combo economy invariant to authoring grain, forever, rather than "we
  measured it and it came out fine this time." It does not block the primitive
  change, and it is better as its own change with its own before/after than
  bundled into this one.
- **What would promote it to a prerequisite**, stated so it can be tested rather
  than argued: any contiguous district a player would plough in one pass whose
  mean gap between consecutive eatable pieces along a plausible driving line
  exceeds ~15 m (the SIZE 1 reach), or ~25 m at mid-ladder speeds. That is the
  concrete shape of an author leaning too hard on slabs in one place — the scene
  overall is fine, the warehouse quarter is a combo dead zone, and the market
  street two blocks over spikes. §7.2 puts chain-break count and mean inter-eat
  interval in the measured set so this gets caught by number rather than by
  feel.
- **The fix that follows from this** is specified in
  `.wiki/features/cambridge-sandbox/04-easter-eggs-and-achievements.md` §4.2: a
  coin refreshes `chainTimer` (`voxelsim.js:2193`) without incrementing `chain`
  (`:2192`). That sustains a chain rather than inflating it — `comboMult` and
  `longest_chain` stay strictly block-denominated, so it leaves the ×3 cap and
  the Unbroken Chain belt alone. It also leaves the mean-gap probe alone by
  design: a coin does not count as an eatable piece there, or a district could
  paper over a real dead zone with currency instead of content. That change is
  owned by `04` and by Cambridge's own per-district density floors (`03` §8),
  and is not restated here.

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

- **The atom stays an axis-aligned box.** The sim's only geometric operation is
  AABB separation (§1.4, §3.1), and adding a `shape` tag would give the renderer
  a third bucket-key dimension, which `STATUS.md:87-88` already flags as the
  caution on this exact request.
- **One piece per architectural member**, sized by what the member *is*, not by
  a brick ladder.
- **Solid where the member is solid; a plate where the member is a surface** —
  hollow interiors stay hollow (§2.4).
- **The map stays full.** Consolidation is a way to afford more place, not a way
  to end up with less of one. See the two-hand rule below.
- **All extents are multiples of 0.25 m**, so ADR-0006's determinism proof
  survives (§3.1).
- **Piece size follows building size.** The ask is not "more complex buildings,"
  it is *larger buildings that are not made of 20,000 cubes* — see the scale
  rule below, which the owner keeps coming back to.

### The scale rule — *the bigger the building, the bigger the pieces*

The owner's framing: *"It shouldn't be that the Empire State Building is made
out of 20,000 voxels. The floors are solid pieces, the columns are solid pieces
— the same look, just not made up of as many individual parts."*

Three clauses:

1. **The vocabulary matters most where the building is big.** A brownstone of
   0.5 m bricks costs hundreds of blocks; a tower of them costs tens of
   thousands — and reads worse. So the larger the structure, the harder an
   author leans on structural members: solid columns, per-bay floor slabs,
   curtain panels on mullions, cornice runs. A 60 m tower should be hundreds of
   blocks, not twenty thousand — call it the *Empire State test*: no single
   landmark should cost what a whole small scene costs.
2. **Same look, fewer parts.** Consolidation should be invisible from gameplay
   distance. The silhouette, the surface grain, and the collapse read all
   survive; only the part count changes. The one trap is §3.6's: a very large
   *plain* plate reads as one enormous brick, so a big piece wants a surface or
   a paint break, exactly as a big real member carries joints and shadow lines.
3. **The failure this avoids is the toy model.** A large building piled from
   small cubes reads as a miniature of a building — the Mickey Mouse read — and
   spends an enormous number of blocks doing it. That is a third failure mode
   alongside the two-hand rule's expensive solid lump and empty diorama: those
   two come from consolidating wrongly or stopping early; this one comes from
   not consolidating at all.

One deliberate refinement, and it comes from gameplay rather than from diluting
the ask: "each floor one solid piece" lands as **one slab per structural bay**
(§4.2 clause 2), so a 20 × 20 m tower floor is 9-16 pieces rather than 1 — a
25-40× reduction from the ~400 cubes it is today, with every bite still legible.
Floors *are* solid pieces; columns *are* solid pillars. The bay cap just keeps
the collapse readable while they are.

### The two-hand rule — *skin, not fill* · *keep it full*

Two guidelines, always stated together, because they pull in opposite directions
and an author wants both hands on the wheel. Each one alone produces a
recognisable, different failure.

> **Hand 1 — skin, not fill.** A solid piece stands in for a *surface*, not an
> *interior*. A floor becomes one 0.25 m or 0.5 m plate rather than a 1 m solid
> cube of concrete. A wall becomes a panel rather than a block. A column is
> solid because a column *is* solid.
>
> *Avoids:* **the expensive solid lump.** Fine-cell cost is linear in occupied
> volume, not in block count (§2.1, §2.4), so consolidating by filling produces
> a scene with a beautifully low block count that builds *slower*, eats more
> memory, and is no cheaper per frame than the thing it replaced. The block
> count flatters you; `sim.grid.size` tells the truth.

> **Hand 2 — keep it full.** Consolidating a member frees room for the loading
> dock, the roof plant, the fire escape, the bike racks — the things that make a
> district feel inhabited. Cambridge should read as *more* place than the
> existing authored scenes, not less, and no part of the map should feel empty
> as the player crosses it.
>
> *Avoids:* **the empty diorama.** Consolidating and then stopping produces a
> technically elegant, over-simplified level — correct silhouettes, nothing to
> look at between them, and (per §3.3 and §3.5) too few things to eat. This is
> the failure the owner named directly: *"we're not trying to do a 'least amount
> of blocks possible.'"*
>
> The guard here is **density, not count**. `probeDistrictDensity` in
> `tools/validate.mjs` checks eatable pieces per m² and the gap between
> consecutive pieces, per district — that is what actually catches an empty
> quarter. Nothing in the validator checks a block total, and nothing needs to.

Together they give the objective: **detail per block** — more place per block,
spread evenly enough that the player never crosses a dead patch.

### 4.1 The primitives

Dimensions are written `w × h × d` in metres (x, y, z), min-corner placement,
matching `_block`'s existing convention (`voxelsim.js:461-466`).

| Primitive | Dimensions convention | Use it for | Cost vs. brick-by-brick | When eaten |
|---|---|---|---|---|
| **slab** | `bay × 0.25–0.5 × bay`, bay ≤ 6 m | one floor plate per structural bay; roof decks; landings | 1 block replaces 25-100. Fine cells **drop** (0.25 m plate vs 1 m course) | Detaches whole when its columns go; falls as one plate. Sits inside the grain ladder at its bay size |
| **column** | `0.5 × storey × 0.5` or `1 × storey × 1` | the owner's "solid pillar"; interior grid; portico columns | 1 block replaces 3-12 | Its slab above loses vertical support and drops the same step. Reads as "the leg went, the floor came down" — the right read |
| **pier** | `1–2 × 2–4 × 1–2`, at grade | masonry piers, bridge bents, gate posts, plinth legs | 1 replaces 8-32 | At grade → obeys the grain ladder (§3.2); a 2 m pier is removable from SIZE 1.8 |
| **beam** | `len × 0.5 × 0.5` along one axis, `len ≤ 6 m` | lintels, spandrel bands, crossheads, rails | 1 replaces up to 24 | Stands on something at each end. A beam is not fed horizontally — one hop from a support costs `(len + s)/2`, which exceeds `maxSpan` for any `len > ~5 m` |
| **panel** | `w × h × 0.25` (or `0.25 × h × d`) | curtain-wall infill, spandrels, non-load-bearing walls, signage faces | 1 replaces 4-40 | Glass panels: still `vertBond/horizBond < 0.5`, so **every panel needs a non-glass supporter at its own level** (`.wiki/modules/voxel.md`, rule 2). Unchanged rule, larger pieces |
| **mullion** | `0.25 × storey × 0.25` | the vertical strip that *carries* the glass panels beside it | 1 replaces 4-16 | The load path. Kill the mullion and the panels beside it lose their only horizontal support |
| **cornice** | `run × 0.25–0.5 × 0.5`, projecting one cell outboard of the plate carrying it | the continuous avenue shadow line | 1 replaces a whole `for` loop (see `setbackTower`, `voxelkit.js:2115-2125`, which currently emits ~2·`w/0.5` cubes per building) | Detaches with its plate |
| **plinth** | `w × 0.5–1 × d`, at grade, `w,d ≤ 6 m` | building bases, monument steps, terrace edges | 1 replaces 36+ | Grain ladder applies in full (§3.2). Keep it at or under 6 m — past that it is late-game-only furniture |
| **tread** | `run × 0.25 × 0.5` | stair flights, grandstand steps, terracing | 1 per step | Each tread rests vertically on the one behind it |
| **ramp / wedge** | **does not exist.** Author as a run of `tread`s of decreasing width. | slopes, gables, batter | ~1 block per 0.25 m of rise, vs ~`w` blocks today | Per tread |
| **corbel-arch** | a stack of `beam`s of shrinking span, each resting vertically on the one below | arches, vaults, gateways | replaces `stoneArch`'s cube ring | Per course, bottom-up — which is also how it fails structurally, correctly |
| **drum** | a ring of `panel`s at ~12-16 facets | columns-in-the-round, rotundas, silos, tanks | 12-16 blocks vs a cube ring of 40+ | Per facet |

Everything in that table is **one call to `_block` with three extents**. Nothing
needs a new shape, a new geometry, or a new material.

**Eleven of the twelve are usable as shipped. `corbel-arch` is not**, and the
reason is a contradiction between two deliverables of the same phase rather than
an authoring preference: every corbel course fails `probePlacementStep`, because
the "gap" that probe is looking for *is* the arch's opening. The primitive has
been imported and never called since the first district shipped, and two
districts that wanted an arch declined it for exactly this reason and built the
opening another way. The two cannot both stand as written — either `corbelArch`
gets a placement step equal to its own extent, which stops the courses being
identical collinear boxes, or it comes out of the twelve and this table says so.
That is a change to `js/voxelforms.js` and it re-measures every district that
uses the file, so it is a sign-off decision rather than a district's.

Two kit builders in `js/voxelkit.js` are in the same position, recorded here
because a scene author reaching for them should know before they do:
`halfDomeShell` builds a semi-dome and cannot close a full one, so a whole dome
has to be composed; and `obelisk` is cube-era, costing 1,480 blocks for what this
vocabulary prices at 420. Neither is a defect in what was built — both landmarks
stand — and both are the same stale-unit problem this page's own cost model
predicts, sitting in a shared file.

### 4.2 The grain rule

A player should be able to read *"I am eating a building"* rather than *"the
building deleted itself"*. Three clauses, all derived above:

1. **Grade clause (engine-derived).** A piece with `gy === 0` keeps its plan
   diagonal at or under 8 m, i.e. `√((a−0.1)² + (b−0.1)²) ≤ 8`. That puts it
   inside SIZE 10 on the §3.2 ladder with margin. Above ~9.7 m of diagonal it is
   permanently uneatable and becomes accidental scenery, which is why this one
   is a hard limit rather than a target.
2. **Bite clause (authoring, from §3.3).** Aim for no single piece carrying more
   than ~5% of its structure's mass, so a structure takes at least ~20 bites. In
   practice that caps a floor plate at one *bay* — 4-6 m — rather than one
   *floor*, which is the most important refinement to the naive reading of "each
   floor one solid piece". A 20 × 20 m tower floor becomes 9-16 slabs rather
   than 1; that is still a 25-40× reduction from the ~400 cubes it is today, and
   it keeps the collapse legible. The room that frees goes into the district
   around it (hand 2).
3. **Ladder clause (feel).** Match the *dominant* piece size of a district to
   the SIZE the player will be at when they reach it, using the §3.2 table:
   0.5-1 m street furniture and infill everywhere (SIZE 1); 2 m piers and
   plinths on the approach (SIZE 2); 4 m bays in the mid-district (SIZE 4);
   6 m plinths and monument masses only where the route arrives late (SIZE 7).
   Cambridge's spawn neighbourhood wants to be fine-grained, or the opening
   minute has nothing the hole can take.

### 4.3 When NOT to consolidate

The risk worth watching is an author reaching for a big primitive where several
smaller ones would read better and eat better. Consolidation is bracketed from
both ends by findings already established above:

- **From below, by the grade ceiling (§3.2).** A ground-anchored piece over
  ~9.7 m of plan diagonal is permanently uneatable — it stops being content and
  becomes accidental scenery, and in the worst way for the 50%-of-mass goal (it
  counts toward `totalMass` at `voxelsim.js:293` and can never be removed from
  it). Clause 1's 8 m cap is the working limit; 9.7 m is the cliff, not the
  target.
- **From above, by the one-bite behaviour (§3.3).** `_overVoid` tests the centre
  only, so any elevated piece, at any size, is swallowed whole the moment the
  hole's centre reaches it. Past ~5% of a structure's mass, a piece stops
  reading as a bite and starts reading as the building deleting itself.

Consolidate when the member is one physical thing whose failure is genuinely
all-or-nothing — a floor plate, a pier, a lintel, a column, a cornice run on one
facade. Keep it split when the real thing is an assembly — a brick wall, a
rubble mound, a truss, a stair, a roofline. Five cases where splitting wins:

1. **Across a support boundary.** Two members that need to fail at different
   times want to be two pieces; merging them puts them in one BFS node, and from
   then on they always fail together.
2. **Below ~4 bites per object.** Clause 2 caps a piece at 5% of its
   *structure*; the same instinct applies per object. A kiosk that is one block
   is a kiosk that vanishes.
3. **The spawn neighbourhood.** At SIZE 1 the hole is 1.1 m and the §3.2 ladder
   says only ~1-2 m pieces are removable at grade. A consolidated opening
   district is an opening minute with nothing to eat.
4. **Where the silhouette is the point.** A stepped parapet, gable or cornice
   reads as detail; the same run as one bar reads as a bar. This is also where
   the mortar course works against you — it is proportional per face (§3.6), so
   a very large plain plate reads as *one enormous brick*.
5. **To hit a number.** There is no block count to chase in either direction. If
   a member reads better as six pieces, it is six pieces.

### 4.4 The headroom the level lives inside

The 40-80k block range is engineering headroom, not a destination. It is what
the renderer and the sim demonstrably carry well: Brooklyn ships 39,984 blocks
and Upper Manhattan 73,393, both at healthy frame times and modest draw counts
(§2.3), so a scene anywhere in that band is on proven ground. Above it we are
extrapolating; the sim, not the renderer, is what runs out first (ADR-0006).

Inside that headroom, the number we aim to come in **under is 75,000 blocks for
the whole of Cambridge**. It is a ceiling we would like to stay beneath, not a
figure to hit. Lower is better and entirely fine. If a build comes in over it,
that is the signal to look at which buildings could be built more efficiently —
which is exactly the kind of question the primitive vocabulary is good at
answering.

There is no exact total to shoot for, and trying to derive one produces a mess:
the level is driven by geometric aesthetics — what each building actually looks
like, member by member — not by an arithmetic target handed down in advance.

Coming in low is safe, and it is worth being explicit about why. The thing that
would make a map feel thin is not a small block count, it is emptiness the
player can walk through, and that is caught by the per-district **density**
check — eatable pieces per m² and the gap between consecutive pieces, enforced
by `probeDistrictDensity` in `tools/validate.mjs`. Nothing in the validator
looks at a block total. So a district that passes density and comes in well
under 75,000 has done the job.

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

**Acceptance condition:** all five existing scenes come out byte-identical.
Every cube keeps `sx === sy === sz`, so every expression above reduces to
today's exactly — if one does not, that is the bug. `node tools/validate.mjs`
prints `ALL PASS` (`AGENTS.md:9-13` requires it for any touch of `voxelsim.js`
or `voxelkit.js`), and the per-step state digest ADR-0006 established as the
standard of proof gets re-run rather than assumed.

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

### Tier 3 — not doing

- **Non-box render shapes** (true wedges, cylinders, arches). Wanted
  aesthetically, but the sim would still collide the AABB, so geometry and
  physics would visibly disagree — and `STATUS.md:87-88` correctly flags the
  `shape` tag as a third bucket-key dimension.
  The route we take instead: the `tread` / `corbel-arch` / `drum`
  approximations in §4.1, which the shipped scenes already use and which get
  materially cheaper under Tier 1 (a stepped gable becomes one wedge-shaped
  stack of long thin slabs instead of a field of cubes).

### Invariant check against `AGENTS.md`

| Invariant | Verdict |
|---|---|
| 1 — no `Math.random()` in `js/` | Unaffected. New primitives are pure geometry; the validator's glob already covers `js/voxelscene-*.js` (`conventions.md` hard rule 1). |
| 2 — pure sim boundary | Unaffected. Everything in Tier 1 is inside `voxelsim.js`; no three.js, no DOM. |
| 3 — state changes only in `sim.step(1/60)` | Unaffected. Scene builders run in the constructor, as they always have. |
| 4 — size/edibility only via `tiers.js` | The one to watch. The temptation is a legibility gate like `if (b.sx > hole.radius * 2) return;` to soften §3.3's one-bite behaviour. That would be a second edibility ladder living outside `tiers.js`, which the invariant exists to prevent, and it would also break the sandbox's *"the hole never decides whether an object fits"* premise (`.wiki/modules/voxel.md`). The compliant route is authoring — §4.2's grain rule — backed by a validator probe (§7), which is where every other scene contract already lives. If a runtime gate ever does become necessary, it belongs in `tiers.js` as a named export rather than inline in `voxelsim.js`. |
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

The existing `covers:` frontmatter in `.wiki/modules/voxel.md` gains both new
files in the same commit as the code (`conventions.md`, Wiki hygiene).

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

1. **One `put()` site per builder** (`voxelkit.js:270-278`). This is what makes
   the Tier 1 primitive change a one-line edit per builder rather than an audit
   of every nested loop, so it is worth holding to strictly.
2. **Emission order is part of the contract.** `megaShell`'s comment at
   `voxelkit.js:277-278` notes `fill` reproduces `_box`'s x→y→z order exactly,
   because `id` order is block-array order and `_falling`/`_sleepObs` ordering
   is load-bearing (ADR-0006). Any new builder must fix and document its order.
3. **Extents on the 0.25 m grid, always** (§3.1's determinism condition). A
   builder that computes an extent by division must round to `FINE`.

### 6.3 Author-facing gotchas to put in the module header

- A beam or slab receives no horizontal support past `maxSpan` (§3.1), so every
  plate wants a column under it rather than beside it.
- Glass rules are unchanged and now apply to bigger pieces: a glass `panel`
  needs a non-glass neighbour **at its own level**, and nothing rests on glass.
- Keep everything ≥ 1.7 m from spawn (the SIZE-scaled hanging threshold,
  `.wiki/modules/voxel.md` scene rule 8), not 1.05 m.
- **The placement step equals the piece extent** — the same rule as
  `.wiki/modules/voxel.md` rule 10, and far easier to get wrong with mixed
  anisotropic extents than with a uniform brick. A validator probe covers it.
- Every structure ≥ 6 m still needs a camera blocker; Cambridge should use
  `generateBlockers` (`voxelkit.js:742`) like Brooklyn and Upper Manhattan, not
  a hand list.

---

## 7. Measurement plan

The claim to prove is **"materially more scene, comfortably inside the
headroom."** A lower block count is not itself the deliverable — it is room, and
the deliverable is what gets built in it. So the measurement answers two
questions, and keeping them apart is most of the discipline here:

- **Is the primitive more efficient per member?** (a control experiment, E1)
- **Does the district deliver more place?** (the real claim, E2)

`STATUS.md:50-53` sets the instrument standard:

> *"this box showed 2.0–2.6× median/min noise and a 40 s outlier on a 2.5 s
> build while agents were live. **No perf number is quotable until the tree is
> still.** Min-of-N round-robin is the minimum acceptable instrument."*

The instrument that standard describes is `tools/probe-buildcost2.mjs`, and it
is in the repo. It builds each of the five shipped scenes `--n` times
round-robin — one rep of every scene in order, then the next rep, never all reps
of one scene in a row — reports min as the estimator with median and max beside
it, and prints the worst med/min ratio as the tree-quiet readout: over 1.30 it
says outright that the box was busy and the timings are not quotable. `--n`
below 3 is refused and there is no flag to override that. Alongside the timings
it prints the exact counts (blocks, fine cells, mass, zones, distinct sizes) and
the render-bucket count under each of the three bucket-key variants, and it pins
itself to `voxelworld.js`'s live bucket loop — an unrecognised loop is a hard
refusal to report rather than a warning, so it can never quote draw calls for a
renderer that no longer ships. Counts are cross-checked across every rep, and a
disagreement voids the run as a determinism failure (ADR-0003).

`tools/probe-aniso.mjs` is the second manually-run probe: ADR-0013 box-path
coverage, on a fixture of its own thin-and-long pieces, because every shipped
scene is 100% cubes and `tools/validate.mjs` is therefore structurally blind to
the per-axis code paths. Neither probe runs as part of `validate.mjs`'s
`ALL PASS`; both are run by hand.

### 7.1 The two experiments

Both run on **one Cambridge district**, not against Boston — comparing Cambridge
to Boston measures two different cities and proves nothing. The district used is
**District 2, the Davenport**, which is `03` §9.5's own independently-chosen
scripted-excursion and regression district, so the E1/E2 output is the shipped
district rather than throwaway proof work. See `05-build-tasks.md`'s
Prerequisites section.

**E1 — member efficiency (control).** Author the district twice from the same
plan: same footprints, same skyline, same palette.

- **A — `cambridge-brickwise`**: today's `voxelkit.js`, today's 0.25/0.5/1/2 m
  ladder. It needs to be a *fair* control — a genuine, competent Boston-quality
  pass, not a strawman.
- **B1 — `cambridge-forms`**: the identical plan through the §4 vocabulary, with
  nothing added.

E1 answers one question: how much room does the primitive buy? Its block-count
delta is an input to E2, not a result in itself — a large delta with nothing
built into it is the empty diorama the two-hand rule warns about.

**E2 — scene richness (the real claim).** Take the room E1 opened up and build
in it.

- **B2 — `cambridge`**: same ground area, same 19-probe contract, authored
  freely through the vocabulary and comfortably inside the headroom.

The comparison that decides the direction is **A vs. B2 at equal ground area**,
and the question it answers is: does the vocabulary deliver a materially richer
place than the same plan diced into cubes would have?

Both A and B2 pass the full shared 19-probe contract in `tools/validate.mjs`,
and the comparison is recorded before either ships.

**What it produced.** Phase 5 ran this on District 2: A built the plan in cubes
at 54,933 blocks, B1 at 5,162, and B2 shipped through the vocabulary at 6,532.
A is a cube-diced upper bound on the same plan rather than a shippable size —
it is 5.6× what `03` sketches for this district — so it is a reference point for
what cubes cost, not a figure B2 should have been chasing. B2 shipped unpadded
at 6,532 with 159 identifiable objects and 4.29 eatable pieces/m², which is the
outcome the whole exercise was for. That 6,532 is District 2 built *alone*. In
the shipped ten-district scene the same rect reads 6,535, because three of
District 1's apron pieces at z −12.375 fall inside District 2's `minZ` of −12.5.
The two figures are the same district measured in two different scenes and
neither is a regression against the other.

### 7.2 Counts — exact, noise-free, quotable immediately

Recorded from a headless build (these are counts, not timings):

| Metric | Source | What it is for |
|---|---|---|
| `sim.totalBlocks` | `voxelsim.js:278` | headroom check — is the scene comfortably under 75,000 (§4.4)? Not a target to hit |
| Fine-cell count | `sim.grid.size` | **the honest cost metric** (§2.1); catches the *skin-not-fill* failure |
| `sim.totalMass` | `:293` | pacing; drives `_sizeLadder` (`:296-310`) and the 50% goal |
| Distinct `b.s` / bucket count / draw calls | the §2.3 key | render cost of the vocabulary |
| Zone count | `sim._compBlocks.length` | ADR-0006's unit |
| **Distinct identifiable objects placed** | count of named builder/composite calls in the scene file | **the headline E2 number** — "more stuff" made countable |
| **Eatable pieces per m² of built footprint** | blocks ÷ footprint cells with content | density the player actually meets |
| **Mean gap between consecutive eatable pieces** along the scripted route, per district | derived from the excursion | §3.5's re-trigger condition — the combo dead-zone detector, and the real guard against a sparse map |
| **Chain breaks + combo levels earned** on the scripted excursion | `hole.bestCombo`, chain-reset count | §3.5's regression risk, measured not assumed |
| Dead-ground census | existing shared probe | Boston ships zero; Cambridge should too |

**E1 target:** B1's block count materially under A's, with `grid.size` no higher
than A's. If `grid.size` goes *up*, hand 1 has slipped (§2.4) and the design is
wrong regardless of what the block count says.

**E2 targets.** These are about density and richness, not about a total:

- Block count: comfortably inside §4.4's headroom, aiming under 75,000 for the
  whole scene. *Measured: District 2 shipped at 6,532, and the whole scene at
  72,943.* There is no per-district figure to match to the block, and coming in
  low is not a shortfall.
- Distinct identifiable objects: **up by ≥ 50%** over A. *Measured: 49 → 159,
  +224%. Met.*
- Eatable pieces per m² of built footprint: the district's own density target
  (`03` §8.2 — District 2: 2.8/m², `gapFloor` ≤ 8 m). This is not compared
  against A: a cube ladder dicing the identical plan will always out-count a
  primitive vocabulary on pieces/m² by construction, because coarser, larger
  pieces are ADR-0013's whole thesis. The shipped validator gate
  (`probeDistrictDensity`) enforces the real number. *Measured: B2 4.29/m²
  median. Met.*
- Mean inter-piece gap under 15 m in every district, or the district's own
  tighter `gapFloor`. This is what `probeDistrictDensity` gates, and it is the
  measurement that actually protects against a map that feels empty. *B2
  passes.*
- Combo levels are not compared against A. Combo level tracks total blocks eaten
  (§3.5), so an A-relative target would inherit A's inflated block count rather
  than say anything about the district. Combo behaviour is exercised directly by
  the scripted-excursion regression check instead.

The density gates above are where a thin district gets caught. A block total
that comes in low, on its own, is not evidence of anything.

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
  this will fall and that is expected; in E2 it should be flat or up against A.
  If B2's visible-piece count sits below A's at most poses, the district reads
  flatter than the thing it replaced, whatever the object count says, and the
  grain rule (§4.2 clause 3) plus hand 2 both want tightening.
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
  which is ADR-0006's headline number and the one most likely to move. Expect B1
  to be clearly cheaper than A. B2 will land somewhere between the two, since it
  builds more into the room B1 opened up.
- **Draw calls / buckets**: report separately for (i) Tier 1 alone and (ii) Tier
  1 plus the §2.3 key change, so the two are not confounded.
- Report **min-of-N**, state N, state the machine was quiet, and quote nothing
  otherwise.

### 7.5 Regression gates — the checks that run before either variant ships

1. `node tools/validate.mjs` → `ALL PASS` (`AGENTS.md:9-13`).
2. All five existing scenes byte-identical — block counts, total mass, and a
   per-step state digest across the existing scripted excursions, the standard
   ADR-0006 set.
3. `probeCellOwnership` clean on both variants — larger pieces make overlaps far
   easier to author by accident.
4. `probeGradeDiagonal`: no `gy === 0` block with a plan diagonal > 8 m (§4.2
   clause 1). This is the grain rule made checkable, and it lives in the shared
   contract rather than in a scene file.
5. `probePlacementStep`: placement step equals piece extent on every axis
   (`.wiki/modules/voxel.md` rule 10, generalised).
6. `probeDistrictDensity`, **the one that keeps hand 2 honest**: per declared district,
   the mean gap between consecutive eatable pieces along the scene's own
   scripted route stays under 15 m, and no district falls below the scene's
   median eatable-pieces-per-m² by more than half. That makes the combo dead
   zone (§3.5) and the empty diorama measurable, and like every other scene
   contract it lives in the shared probe set.

**What this list costs to run, now that a scene has been authored against it.**
Gate 6 is why the scripted excursion grows: a district the route never enters
cannot be measured by it, so every district appends its own legs. Cambridge's
route reached 134 legs, 2,178 m of arc and 780 s, and at that length **the
excursion is the dominant cost of the whole validator run** — gate 1 drives it
twice for the determinism check in gate 2, and the cost per second of route is
superlinear in the hole's own SIZE, because the removal disc and the loose-body
count both grow with it. Timed in a quiet process on that scene: the first 180 s
of route cost 21 s of wall, the next 180 cost 217, and the last stretch cost more
again. A route twice as long is several times dearer, not twice as dear, and a
full run can land past what a laptop finishes between edits.

The lever that costs nothing is **time rather than geometry**. Gate 6 measures
gaps along the route's *arc* and never reads a leg's duration, so tightening the
`until` values on the early low-SIZE legs leaves every district's density figure
untouched and moves only the excursion's own eaten and SIZE readings. A scene
that needs its validator run back under a working attention span should reach for
that before it reaches for the route's shape.

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
- `STATUS.md` — the construction-vocabulary decision (since retired from the
  board, answered by ADR-0013 and this page), the measurement precondition, the
  shared-kit warning
