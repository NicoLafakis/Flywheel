// Voxel form vocabulary — the twelve anisotropic primitives of ADR-0013.
// Pure sim: no three.js, no Math.random (determinism — see rng.js).
//
// This is the toolkit `.wiki/features/cambridge-sandbox/01-voxel-primitive-
// vocabulary.md` §4.1 specifies, and nothing else. One piece per architectural
// member, sized by what the member IS rather than by a brick ladder: a floor is
// a plate, a column is a pillar, a lintel is a lintel. Every builder here is one
// call to `sim._block` with three extents — no new shape, no new geometry, no
// new material. The atom stays an axis-aligned box because AABB separation is
// the sim's only geometric operation.
//
// LAYERING — this file is BELOW js/voxelkit.js and must stay there.
// `voxelkit` may one day consume `voxelforms`; `voxelforms` NEVER imports
// `voxelkit`. Being a separate, smaller layer is what stops it accreting city
// semantics: there are no named buildings here, no Cambridge, no Brooklyn.
// Graduation rule (the same one voxelkit carries): a composite moves out of a
// scene file into `voxelkit.js` only when a SECOND scene calls it. One caller
// is not a kit — and a composite never lands here at all, because this layer is
// members, not buildings.
//
// THE TWO-HAND RULE governs every call site, and both hands are needed:
//   Hand 1 — SKIN, NOT FILL. A solid piece replaces a SURFACE, never an
//     INTERIOR. A floor is a 0.25–0.5 m plate, not a 1 m solid cube of
//     concrete. Fine-cell cost is linear in occupied volume, so consolidating
//     by filling produces a beautifully low block count that builds slower and
//     costs the same per frame. `sim.grid.size` tells the truth; the block
//     count lies.
//   Hand 2 — SPEND IT BACK. Every block a primitive frees is owed back to the
//     scene, not banked. A falling block count is a warning sign, not a result:
//     it means the district is under-populated, not efficient.
//
// THE SCALE RULE: the bigger the building, the bigger the pieces. A 60 m tower
// is hundreds of blocks, not twenty thousand — same silhouette, same surface
// grain, same collapse read, fewer parts.
//
// GRAIN CAPS, and why they are comments rather than clamps. AGENTS.md
// invariant 4 keeps every size/edibility rule inside `tiers.js`, so a builder
// that silently clamped its own extents would be a second edibility ladder
// living out here. The caps are enforced by `tools/validate.mjs` instead, which
// is where every other scene contract already lives:
//   - Grade clause (hard, engine-derived). Any piece at `gy === 0` must have a
//     plan diagonal <= 8 m: sqrt((sx-0.1)^2 + (sz-0.1)^2). Past ~9.7 m it is
//     PERMANENTLY uneatable — it still counts toward `totalMass` and can never
//     be removed from it. This clause used to be described as "silently makes
//     the 50% goal harder"; since every scene went to targetFraction 1.0 it is
//     strictly worse than that — one violating piece makes the scene
//     UNWINNABLE, because the goal is now the whole map and that mass can never
//     leave `totalMass`. `probeGradeDiagonal` fails the build, and
//     `validateScenesWinnable` in tools/validate.mjs is the second net: it
//     consumes every block in every scene and asserts `won`.
//   - Bite clause (authoring). No single piece carries more than ~5% of its
//     structure's mass; a structure should take at least ~20 bites. In practice
//     that caps a floor plate at one BAY (4–6 m), not one floor: a 20 x 20 m
//     tower floor is 9–16 slabs, not 1. `_overVoid` tests a block's CENTRE
//     only, so any elevated piece of any size is swallowed whole the moment the
//     hole's centre reaches it.
//   - Ladder clause (feel). Match a district's dominant piece size to the SIZE
//     the player will be at when they arrive. The spawn neighbourhood must stay
//     fine-grained or the opening minute has nothing the hole can take.
//
// AUTHORING GOTCHAS, all of them structural rather than stylistic:
//   - A beam or slab NEVER receives horizontal support past `maxSpan` (3 m for
//     concrete/steel). One hop between two pieces costs (extent_a + extent_b)/2
//     along the hop axis, so two adjacent 4 m slabs cannot hold each other up at
//     all. Every plate needs a column UNDER it, not beside it. Vertical support
//     is free and resets the span to zero — a one-piece floor on solid columns
//     is the cheapest, safest thing this vocabulary builds.
//   - At grade the cap is `FLOOR_CANTILEVER` = 1 m, so ground-level big pieces
//     receive no horizontal support at all. That is fine (they are the BFS
//     anchors), but a paved plaza of large slabs is N independent zones, not one.
//   - Glass rules are unchanged and now apply to bigger pieces: a glass `panel`
//     needs a non-glass supporter AT ITS OWN LEVEL, and nothing rests on glass.
//     That supporter is what `mullion` is for.
//   - Keep everything >= 1.7 m from spawn (the SIZE-scaled hanging threshold).
//   - Every structure >= 6 m still needs a camera blocker; generate them from
//     the finished geometry, never hand-write the list.
//   - A very large PLAIN plate reads as one enormous brick: the mortar course is
//     proportional per face, so a 6 m slab gets the same 2.34%-of-face border a
//     0.25 m brick does. A big piece carries a surface or a paint break, exactly
//     as a big real member carries joints and shadow lines.
//
// CONVENTIONS every builder here shares:
//   - `(x, y, z)` is the MIN CORNER in metres, matching `sim._block`. `drum` is
//     no exception: it takes the min corner of its bounding square, not its
//     centre, so the module has exactly one placement convention.
//   - Extents are quantised to the 0.25 m fine grid by `q()` on the way in.
//     This is not tidiness: ADR-0006's determinism proof rests on every span
//     being an exact sum of multiples of 1/8, which holds only while extents are
//     multiples of 0.25 m. A builder that computes an extent by division — a bay
//     width, a chord, a taper — MUST round, and `q()` is why no builder has to
//     remember to.
//   - ONE `sim._block` site per builder. Nine of the twelve are a single call;
//     the three composites (`corbelArch`, `drum`, `wedge`) route all of their
//     geometry through one of the other nine and inherit its single site. That
//     is what made ADR-0013 a one-line edit per builder instead of an audit of
//     every nested loop, and it is why nothing below reaches `sim._block` twice.
//   - Emission order is part of the contract: block `id` is block-array order,
//     and `_falling`/`_sleepObs` ordering is load-bearing (ADR-0006). Each
//     composite states its order and must not change it.
//   - Colors are paint, never physics. Materials are the nine in `voxelsim.js`.

// Mirrors the private `FINE` in js/voxelsim.js. If that ever moves off 0.25 m,
// this moves with it — every extent below is quantised against it.
const FINE = 0.25;

// Quantise a metre extent onto the fine grid. Never returns zero: a builder
// asked for a sliver gets one cell rather than a block with no volume, which
// would divide by zero in the mass/volume path and own no fine cells at all.
const q = (v) => Math.max(FINE, Math.round(v / FINE) * FINE);

// --- the nine atoms: one `sim._block` call each -------------------------------

// One floor plate per structural bay; also roof decks and landings.
// `bay x t x bay`, bay <= 6 m, t 0.25–0.5 m. Detaches whole when its columns go
// and falls as one plate — the right read for a floor.
export function slab(sim, o) {
  const { x, y, z, w, d, t = 0.5, mat = 'concrete', color } = o;
  return sim._block(x, y, z, mat, [q(w), q(t), q(d)], color);
}

// The owner's "solid pillar": interior grid, portico columns, storey posts.
// `s x h x s`, s 0.5 or 1 m. Kill it and the slab above loses vertical support
// and drops the same step — "the leg went, the floor came down".
export function column(sim, o) {
  const { x, y = 0, z, h, s = 0.5, mat = 'concrete', color } = o;
  return sim._block(x, y, z, mat, [q(s), q(h), q(s)], color);
}

// Masonry piers, bridge bents, gate posts, plinth legs. `w x h x d`, 1–2 m in
// plan, 2–4 m tall, at grade — so the grade clause binds: a 2 m pier is
// removable from SIZE 1.8, and anything past an 8 m plan diagonal fails.
export function pier(sim, o) {
  const { x, y = 0, z, w = 1, h = 2, d = w, mat = 'concrete', color } = o;
  return sim._block(x, y, z, mat, [q(w), q(h), q(d)], color);
}

// Lintels, spandrel bands, crossheads, rails. `len` runs along `axis` ('x' or
// 'z'), `t` is the vertical thickness and `depth` the horizontal cross-extent
// (they differ for a spandrel band, which is wide and thin).
// MUST STAND ON SOMETHING AT EACH END: one hop from a support costs
// (len + s)/2, which blows `maxSpan` for any len past ~5 m.
export function beam(sim, o) {
  const { x, y, z, len, axis = 'x', t = 0.5, depth = t, mat = 'steel', color } = o;
  const L = q(len), T = q(t), D = q(depth);
  return sim._block(x, y, z, mat, axis === 'z' ? [D, T, L] : [L, T, D], color);
}

// Curtain-wall infill, spandrels, non-load-bearing walls, signage faces.
// `w` runs along `axis`, `h` is vertical, `t` is the thickness across the face.
// A glass panel still needs a non-glass supporter at its own level — that is
// what `mullion` is for, and it is not optional.
export function panel(sim, o) {
  const { x, y, z, w, h, axis = 'x', t = 0.25, mat = 'glass', color } = o;
  const W = q(w), H = q(h), T = q(t);
  return sim._block(x, y, z, mat, axis === 'z' ? [T, H, W] : [W, H, T], color);
}

// The vertical strip that CARRIES the glass panels beside it — the load path.
// Kill the mullion and the panels beside it lose their only horizontal support.
export function mullion(sim, o) {
  const { x, y, z, h, s = 0.25, mat = 'steel', color } = o;
  return sim._block(x, y, z, mat, [q(s), q(h), q(s)], color);
}

// The continuous avenue shadow line. `run` along `axis`, `proj` outboard of the
// plate carrying it. One block replaces a whole `for` loop — today's setback
// towers emit ~2*(w/0.5) cubes per building for this.
export function cornice(sim, o) {
  const { x, y, z, run, axis = 'x', t = 0.25, proj = 0.5, mat = 'concrete', color } = o;
  const R = q(run), T = q(t), P = q(proj);
  return sim._block(x, y, z, mat, axis === 'z' ? [P, T, R] : [R, T, P], color);
}

// Building bases, monument steps, terrace edges. At grade, so the grade clause
// binds hard: NEVER exceed 6 m in plan, or it becomes late-game-only furniture
// and past ~9.7 m of diagonal a permanent, uneatable monument.
export function plinth(sim, o) {
  const { x, y = 0, z, w, d, h = 0.5, mat = 'concrete', color } = o;
  return sim._block(x, y, z, mat, [q(w), q(h), q(d)], color);
}

// One step of a stair flight, grandstand or terrace. `run` is the step's length
// along `axis`, `going` its depth, `rise` its thickness. Each tread rests
// vertically on the one behind it, which is both how it stands and how it fails.
export function tread(sim, o) {
  const { x, y, z, run, axis = 'x', rise = 0.25, going = 0.5, mat = 'concrete', color } = o;
  const R = q(run), V = q(rise), G = q(going);
  return sim._block(x, y, z, mat, axis === 'z' ? [G, V, R] : [R, V, G], color);
}

// --- the three composites: each routes through exactly one atom ---------------

// Arches, vaults and gateways, as a stack of `beam`s of shrinking span each
// resting VERTICALLY on the one below. True arches do not exist here and will
// not: the sim would still collide the AABB, so geometry and physics would
// visibly disagree. Corbelling is the compliant approximation, and it is also
// how the real thing fails — per course, bottom-up.
//
// The opening runs along `axis` from `x` (or `z`) for `span` metres, springing
// at `y`. Each course cantilevers `step` further inward than the one below and
// keeps `bear` metres of bearing on the jamb, so every course fully covers its
// predecessor's footprint — vertical support, which is free and resets the
// horizontal span to zero. A capstone bridges whatever is left.
//
// Emission order: bottom-up, left jamb then right jamb per course, capstone
// last. Returns the number of blocks placed.
export function corbelArch(sim, o) {
  const {
    x, y, z, span, axis = 'x', depth = 0.5, course = 0.5, step = 0.5,
    bear = 0.5, mat = 'concrete', color,
  } = o;
  const S = q(span), C = q(course), K = q(step), B = q(bear);
  // `at` maps an offset along the opening onto the two horizontal axes, so the
  // x-run and z-run cases share one body rather than forking into two.
  const at = (off, level) => (axis === 'z'
    ? { x, y: level, z: z + off }
    : { x: x + off, y: level, z });
  let clear = S, level = y, i = 0;
  // The 64-course bound guards against a caller whose `step` quantised down to
  // one cell against a wide span; 64 courses is 32 m of rise, past anything the
  // vocabulary builds.
  while (clear > 2 * K && i < 64) {
    const reach = B + (i + 1) * K;
    beam(sim, { ...at(-B, level), len: reach, axis, t: C, depth, mat, color });
    beam(sim, { ...at(S - (i + 1) * K, level), len: reach, axis, t: C, depth, mat, color });
    i++;
    clear = S - 2 * i * K;
    level += C;
  }
  beam(sim, {
    ...at((S - clear) / 2 - B, level), len: clear + 2 * B, axis, t: C, depth, mat, color,
  });
  return 2 * i + 1;
}

// Columns-in-the-round, rotundas, silos, tanks: a ring of `panel`s at 12–16
// facets, against a cube ring's 40+. `(x, z)` is the MIN CORNER of the bounding
// square, `r` its radius, so the centre is (x + r, z + r) — the module has one
// placement convention and this is not an exception to it.
//
// Each facet is an axis-aligned box (no rotation in sim, ever), so the ring is a
// stepped polygon rather than a circle — the same honest approximation every
// shipped curve already uses. Trig runs at build time only and every result is
// quantised to the fine grid before it reaches `sim._block`, so the 1/8 span
// invariant survives regardless of the engine's `Math.cos`.
//
// Emission order: facet 0 at +x, then anticlockwise. Returns the facet count.
export function drum(sim, o) {
  const { x, y, z, r, h, facets = 12, t = 0.25, mat = 'concrete', color } = o;
  const chord = q(2 * r * Math.sin(Math.PI / facets));
  const rc = r - t / 2;                       // wall centreline radius
  for (let i = 0; i < facets; i++) {
    const a = (2 * Math.PI * i) / facets;
    const ca = Math.cos(a), sa = Math.sin(a);
    // The facet faces whichever axis its outward normal leans toward, so a box
    // that is thin across the wall and long along it either way.
    const radial = Math.abs(ca) >= Math.abs(sa) ? 'z' : 'x';
    const px = x + r + ca * rc, pz = z + r + sa * rc;
    const halfW = chord / 2, halfT = t / 2;
    panel(sim, {
      x: px - (radial === 'z' ? halfT : halfW),
      y,
      z: pz - (radial === 'z' ? halfW : halfT),
      w: chord, h, axis: radial, t, mat, color,
    });
  }
  return facets;
}

// The stepped-wedge convention, made one call instead of a loop in every scene.
// A ramp, gable or batter is a run of `tread`s of decreasing width — the §4.1
// table's "ramp / wedge does not exist" entry, discharged.
//
// `w` is the extent along `axis` (the one that tapers), `d` the extent across
// it, `h` the total rise. `from` says which end holds still: 'min' and 'max'
// give a ramp or a batter, 'center' gives a gable.
//
// Emission order: bottom course first, upward. Returns the course count.
export function wedge(sim, o) {
  const {
    x, y, z, w, d, h, axis = 'x', from = 'max', riser = 0.25,
    mat = 'concrete', color,
  } = o;
  const W = q(w), V = q(riser), n = Math.max(1, Math.round(q(h) / V));
  for (let i = 0; i < n; i++) {
    const len = q((W * (n - i)) / n);
    const off = from === 'min' ? 0 : from === 'center' ? q((W - len) / 2) : W - len;
    tread(sim, {
      x: axis === 'z' ? x : x + off,
      y: y + i * V,
      z: axis === 'z' ? z + off : z,
      run: len, axis, rise: V, going: d, mat, color,
    });
  }
  return n;
}
