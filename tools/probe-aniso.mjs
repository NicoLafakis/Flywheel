// ADR-0013: the ANISOTROPIC probe. Boxes, not cubes.
//
// Every shipped scene is 100% cubes, so every shipped scene passes the per-axis
// engine change whether or not it is right: for a cube `sx === sy === sz` and
// each new expression reduces to the old scalar one by construction. That makes
// `tools/validate.mjs` structurally blind to the box path, and this file is what
// covers it — most sharply ADR-0013 P2.4's hop-axis recovery, where reading the
// wrong horizontal extent is a 4x error in cantilever cost that no cube can show.
//
// It builds its fixture by wrapping `_buildScene`, appending pieces far from the
// gallery's own geometry and far from the hole, so each is its own structural
// zone and nothing here perturbs the scene the validator measures.
//
// Every assertion below was mutation-tested: the corresponding line in
// voxelsim.js was rewritten to read a different axis and this probe was required
// to go red. Assertions that no mutation could turn red were replaced, not kept.
// `ANISO_SRC` re-points the import at a mutated copy so that stays reproducible.
//
// Usage: node tools/probe-aniso.mjs
const SRC = process.env.ANISO_SRC || new URL('../js/voxelsim.js', import.meta.url).href;
const { VoxelSandboxSim } = await import(SRC);

let pass = 0, failed = 0;
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; } else { failed++; console.log(`  FAIL  ${msg}${detail ? `  [${detail}]` : ''}`); }
};
const eq = (got, want, msg) => ok(Object.is(got, want), msg, `got ${got}, want ${want}`);

const orig = VoxelSandboxSim.prototype._buildScene;
const tagged = { A: [], B: [], C: [], D: [], misc: {} };

VoxelSandboxSim.prototype._buildScene = function () {
  orig.call(this);
  const T = (key, b) => { tagged[key].push(b); return b; };

  // A: arm runs +x, pieces THIN in x (0.5 m) and LONG in z (2 m). The correct
  // hop cost is (0.5 + 0.5)/2 = 0.5 per step; reading the z extent gives
  // (2 + 2)/2 = 2 and the arm dies four times sooner. Steel spans 3 m.
  for (let i = 0; i < 6; i++) this._block(60, i * 0.5, 60, 'steel', [0.5, 0.5, 2]);
  for (let i = 0; i < 5; i++) T('A', this._block(60.5 + i * 0.5, 2.5, 60, 'steel', [0.5, 0.5, 2]));

  // B: the mirror. Arm runs +z, pieces THIN in z and LONG in x. A hop pinned to
  // either axis fails A or B; only recovering the crossed axis passes both.
  for (let i = 0; i < 6; i++) this._block(80, i * 0.5, 60, 'steel', [2, 0.5, 0.5]);
  for (let i = 0; i < 5; i++) T('B', this._block(80, 2.5, 60.5 + i * 0.5, 'steel', [2, 0.5, 0.5]));

  // D: A again with the arm running -x. The BFS reaches these from their +x
  // side, which is the only thing that exercises the second half of the
  // adjacency test (`nb.gx + nb.fsx === cur.gx`).
  for (let i = 0; i < 6; i++) this._block(90, i * 0.5, 60, 'steel', [0.5, 0.5, 2]);
  for (let i = 0; i < 5; i++) T('D', this._block(89.5 - i * 0.5, 2.5, 60, 'steel', [0.5, 0.5, 2]));

  // C: cube control at the same geometry and span budget.
  for (let i = 0; i < 6; i++) this._block(100, i * 0.5, 60, 'steel', 0.5);
  for (let i = 0; i < 5; i++) T('C', this._block(100.5 + i * 0.5, 2.5, 60, 'steel', 0.5));

  tagged.misc.box = this._block(120, 0, 60, 'brick', [2, 0.5, 1]);     // 8 x 2 x 4 cells
  tagged.misc.eastOf = this._block(122, 0, 60, 'brick', [2, 0.5, 1]);  // face-adjacent in +x
  tagged.misc.northOf = this._block(120, 0, 61, 'brick', [2, 0.5, 1]); // face-adjacent in +z
  tagged.misc.diag = this._block(122, 0.5, 61, 'brick', [2, 0.5, 1]);  // edge touch only
  tagged.misc.wide = this._block(130, 0, 60, 'concrete', [4, 2, 1]);
  // deep-in-z piece with a target at the FAR end of its z run: a lateral sweep
  // that is too short walks straight past this one
  tagged.misc.narrow = this._block(150, 0, 60, 'concrete', [1, 2, 4]);
  tagged.misc.farEnd = this._block(151, 0, 63, 'concrete', [1, 2, 1]);
  // shallow-in-z piece with a decoy OUTSIDE its depth: a sweep that is too long
  // reaches a block the mover's own face never touches
  tagged.misc.shallow = this._block(160, 0, 60, 'concrete', [4, 2, 1]);
  tagged.misc.decoy = this._block(164, 0, 62, 'concrete', [1, 2, 1]);
  // both traps rotated, so a sweep pinned to one axis fails on one of the two
  // travel directions whichever axis it picked
  tagged.misc.wideZ = this._block(170, 0, 60, 'concrete', [4, 2, 1]);
  tagged.misc.farEndZ = this._block(173, 0, 61, 'concrete', [1, 2, 1]);
  tagged.misc.deepZ = this._block(180, 0, 60, 'concrete', [1, 2, 4]);
  tagged.misc.decoyZ = this._block(182, 0, 64, 'concrete', [1, 2, 1]);
  // a pad under the far end of a slab deeper than it is tall: the bottom probe
  // sweeps (fsx, fsz) and nothing about that follows from fsy
  tagged.misc.pad = this._block(190, 0, 63, 'concrete', [1, 0.5, 1]);
};

const sim = new VoxelSandboxSim({ seed: 'aniso-fixture' });
VoxelSandboxSim.prototype._buildScene = orig;

console.log('probe-aniso: ADR-0013 box-path coverage\n');

// ------------------------------------------------------------------ build shape
console.log('BUILD');
const box = tagged.misc.box;
eq(box.sx, 2, 'box.sx'); eq(box.sy, 0.5, 'box.sy'); eq(box.sz, 1, 'box.sz');
eq(box.fsx, 8, 'box.fsx'); eq(box.fsy, 2, 'box.fsy'); eq(box.fsz, 4, 'box.fsz');
eq(box.x, 121, 'box centre x'); eq(box.y, 0.25, 'box centre y'); eq(box.z, 60.5, 'box centre z');
eq(box.sAvg, 1, 'box.sAvg is the characteristic length cbrt(2*0.5*1)');
eq(tagged.misc.wide.sAvg, Math.cbrt(8), 'wide.sAvg = cbrt(4*2*1)');
eq(tagged.A[0].sAvg, Math.cbrt(0.5 * 0.5 * 2), 'A piece sAvg');
eq(tagged.C[0].sAvg, 0.5, 'a cube sAvg is its exact side, not a cbrt round trip');

let owned = 0;
for (let ix = 0; ix < box.fsx; ix++) {
  for (let iy = 0; iy < box.fsy; iy++) {
    for (let iz = 0; iz < box.fsz; iz++) {
      if (sim.grid.get(`${box.gx + ix},${box.gy + iy},${box.gz + iz}`) === box) owned++;
    }
  }
}
eq(owned, 64, 'box owns fsx*fsy*fsz = 64 fine cells');
// The occupancy invariant over the WHOLE scene: one block per fine cell, so a
// build loop writing past an extent shows up as surplus cells even when the
// surplus lands somewhere nothing else looks.
const cellsClaimed = sim.blocks.reduce((s, b) => s + b.fsx * b.fsy * b.fsz, 0);
eq(sim.grid.size, cellsClaimed, 'grid holds exactly one cell per fsx*fsy*fsz of every block');
eq(sim.grid.get(`${box.gx + 8},${box.gy},${box.gz}`), tagged.misc.eastOf, 'the cell past the +x face belongs to the next box');
eq(sim.grid.get(`${box.gx},${box.gy + 2},${box.gz}`), undefined, 'the cell above the box is empty');

// ------------------------------------------------------------------- neighbours
console.log('NEIGHBOURS');
const nb = (a, b) => a.neighbors.includes(b);
ok(nb(box, tagged.misc.eastOf), 'x-face-adjacent boxes are neighbours');
ok(nb(box, tagged.misc.northOf), 'z-face-adjacent boxes are neighbours');
ok(!nb(box, tagged.misc.diag), 'an edge-only touch is NOT a neighbour');
eq(box.neighbors.length, 2, 'box has exactly its two face neighbours');

// -------------------------------------------------------------- P2.4 span hop
// Dirty every zone so the BFS runs scene-wide, not just around the hole.
console.log('SPAN HOP  (ADR-0013 P2.4)');
for (let c = 0; c < sim._compBlocks.length; c++) sim._dirtyComps.add(c);
sim.step(1 / 60, { x: 0, z: 0 });

const spanOf = (b) => (sim._spanHas[b.bi] ? sim._spanVal[b.bi] : null);
const EXPECT = [0.5, 1, 1.5, 2, 2.5];
for (const [label, axis] of [['A', 'x'], ['B', 'z'], ['C', 'x'], ['D', 'x']]) {
  const got = tagged[label].map(spanOf);
  ok(got.every((v, i) => v === EXPECT[i]),
    `${label}: arm spans grow by the ${axis} extent, 0.5 m per hop`, `got ${JSON.stringify(got)}`);
  ok(tagged[label].every((b) => b.state === 'static'), `${label}: the whole arm stays supported`);
}
// The falsifier, stated as a number: reading the other horizontal extent costs
// 2 m per hop, so the arm blows steel's 3 m limit at its second piece.
const WRONG = [2, null, null, null, null].join();
ok(tagged.A.map(spanOf).join() !== WRONG, 'A did not use the z extent');
ok(tagged.B.map(spanOf).join() !== WRONG, 'B did not use the x extent');
ok(tagged.D.map(spanOf).join() !== WRONG, 'D (arm running -x) did not use the z extent');

// ------------------------------------------------------- heightmap and contact
console.log('HEIGHTMAP / CONTACT');
const wide = tagged.misc.wide; // 4 x 2 x 1 m at (130, 0, 60)
eq(sim._topAt(wide.x, wide.z, wide.fsx, wide.fsz), 2, '_topAt over a 4x2x1 box reads its 2 m top');
eq(sim._topAt(wide.x, wide.z, 1, 1), 2, '_topAt with a one-cell probe still reads the box');
eq(sim._topAt(wide.x + wide.sx / 2 + 1, wide.z, 1, 1), 0, '_topAt past the box is bare ground');

const asMover = (b, over = {}) => ({
  id: -9, state: 'falling', parentChunk: null, asleep: false,
  x: b.x, y: b.y, z: b.z, sx: b.sx, sy: b.sy, sz: b.sz,
  fsx: b.fsx, fsy: b.fsy, fsz: b.fsz, ...over,
});
eq(sim._contact(asMover(wide, { y: wide.y + wide.sy }), 0, 0), wide, '_contact finds a box directly underfoot');
// _contact probes the LEADING face, so the sign of travel selects which one.
const east = asMover(wide, { x: wide.x + wide.sx });
eq(sim._contact(east, -1, 0), wide, '_contact finds a box across its leading -x face');
eq(sim._contact(east, 1, 0), null, '_contact ignores the box behind a +x mover');
eq(sim._contact(asMover(wide, { x: wide.x - wide.sx }), 1, 0), wide, '_contact finds a box across its leading +x face');
eq(sim._contact(asMover(wide, { z: wide.z + wide.sz }), 0, -1), wide, '_contact finds a box across its leading -z face');
eq(sim._contact(asMover(wide, { x: wide.x + 20 }), 1, 0), null, '_contact reports nothing in open air');

// The lateral sweep of a side probe is the block's OTHER horizontal extent and
// has to be exactly that: too short misses a real contact, too long invents one.
// Both directions need a case, because a superset sweep passes every "did it
// find the thing" test on its own.
eq(sim._contact(asMover(tagged.misc.narrow), 1, 0), tagged.misc.farEnd,
  '_contact sweeps the FULL z depth of a deep block (target at the far end)');
eq(sim._contact(asMover(tagged.misc.shallow), 1, 0), null,
  '_contact does not sweep past a shallow block into a decoy outside its depth');
eq(sim._contact(asMover(tagged.misc.wideZ), 0, 1), tagged.misc.farEndZ,
  '_contact sweeps the FULL x width of a wide block (target at the far end)');
eq(sim._contact(asMover(tagged.misc.deepZ), 0, 1), null,
  '_contact does not sweep past a narrow block into a decoy outside its width');
// bottom face: a 1 x 0.5 x 4 slab with only its far z end over a pad
eq(sim._contact({
  id: -8, state: 'falling', parentChunk: null, asleep: false,
  x: 190.5, y: 0.75, z: 62, sx: 1, sy: 0.5, sz: 4, fsx: 4, fsy: 2, fsz: 16,
}, 0, 0), tagged.misc.pad, '_contact sweeps the full (fsx, fsz) bottom face, not a square derived from fsy');

// ------------------------------------------------------------------ separation
// The push axis is least penetration, and with three different half-sums that is
// not the axis a single scalar picks. One case per axis, so a solver that
// hard-codes any one extent has a case where the minimum lands on the wrong axis
// — or, if the half-sum shrinks, on no axis at all.
console.log('SEPARATION');
const synth = (id, s, at) => ({
  id, state: 'falling', parentChunk: null, asleep: false,
  x: at[0], y: at[1], z: at[2], sx: s[0], sy: s[1], sz: s[2],
  vx: 0, vy: 0, vz: 0, vRotX: 0, vRotZ: 0, _inContact: false,
});
const AXIS_I = { x: 0, y: 1, z: 2 };
for (const [s, off, axis] of [
  [[4, 2, 1], [0, 0, 0.5], 'z'],
  [[1, 4, 1], [0, 3.5, 0], 'y'],
  [[1, 2, 3], [0.5, 0, 0], 'x'],
]) {
  const o = synth(-20, s, [500, 10, 500]);
  const b = synth(-21, s, [500 + off[0], 10 + off[1], 500 + off[2]]);
  sim._separate(b, o, false);
  const moved = { x: b.x - 500, y: b.y - 10, z: b.z - 500 };
  ok(Math.abs(moved[axis]) > Math.abs(off[AXIS_I[axis]]),
    `${axis}-min pair separates along ${axis}`, JSON.stringify(moved));
  for (const other of ['x', 'y', 'z']) {
    if (other === axis) continue;
    eq(moved[other], off[AXIS_I[other]], `${axis}-min pair does not move along ${other}`);
  }
}

// ------------------------------------------------------- broad-phase footprints
// The resting-rubble index pads one fine cell around the PLAN footprint, so a
// sleeping box claims (fsx+2)x(fsz+2) columns. Nothing in the shipped scenes
// ever sleeps a box, so this is asserted on the index directly.
console.log('BROAD PHASE');
const sleeper = { id: -30, x: 200.5, y: 1, z: 202, sx: 1, sy: 2, sz: 4, fsx: 4, fsy: 8, fsz: 16 };
const beforeCols = sim._sleepObs.size;
sim._sleepObsAdd(sleeper);
eq(sim._sleepObs.size - beforeCols, (4 + 2) * (16 + 2), 'a sleeping 1x2x4 box claims (fsx+2)*(fsz+2) columns');
sim._sleepObsRemove(sleeper);
eq(sim._sleepObs.size, beforeCols, 'and removing it walks exactly the same columns back out');

// Loose-body pair relaxation buckets the same padded plan footprint, so two deep
// boxes overlapping at one end of their z run must share a column before the
// solver can see the overlap at all. The pair is walked by the LOWER id, so the
// body whose query has to reach is chosen deliberately in each case.
const debris = (id, x, z) => ({
  id, state: 'falling', parentChunk: null, asleep: false,
  x, y: 1, z, sx: 1, sy: 2, sz: 4, fsx: 4, fsy: 8, fsz: 16,
  vx: 0, vy: 0, vz: 0, vRotX: 0, vRotZ: 0,
  _inContact: false, _budgetHold: false, _grounded: true, _restLoose: null,
});
const savedFalling = sim._falling;
const runPair = (a, b) => { sim._falling = [a, b]; sim._resolveDebrisContacts(); };

const d0 = debris(-41, 300.5, 300), d1 = debris(-40, 300.5, 303.5); // 0.5 m of z overlap
runPair(d0, d1);
ok(Math.abs(d1.z - d0.z) >= 4, 'two deep boxes overlapping at their far z end are found and separated',
  `dz=${(d1.z - d0.z).toFixed(4)}`);
eq(d1.x, d0.x, 'and the push does not wander onto the 1 m axis');

// A query window computed from the wrong extent is SHIFTED, not shortened, so it
// still reaches one end of the footprint. Only testing both ends pins it.
const f0 = debris(-61, 340.5, 340), f1 = debris(-60, 340.5, 336.5);
runPair(f0, f1);
ok(Math.abs(f0.z - f1.z) >= 4, 'the same overlap at the LOW z end is found too',
  `dz=${(f0.z - f1.z).toFixed(4)}`);

// The pre-reject in front of _separate is a HEIGHT test: 1.75 m apart is inside
// the 2 m half-sum of two 2 m-tall boxes and outside the 1.5 m a width-derived
// one would allow, so it decides whether the call happens at all.
const e0 = debris(-51, 320.5, 320), e1 = debris(-50, 320.5, 320);
e1.y = e0.y + 1.75;
runPair(e0, e1);
sim._falling = savedFalling;
ok(Math.abs(e1.y - e0.y) > 1.75, 'a 1.75 m vertical overlap clears the pre-reject and separates',
  `dy=${(e1.y - e0.y).toFixed(4)}`);

// ------------------------------------------------------------------------ mass
console.log('MASS');
eq(box.mat.mass * (box.sx * box.sy * box.sz), 1.8, 'a 2x0.5x1 brick weighs its density x 1 m3');
eq(wide.mat.mass * (wide.sx * wide.sy * wide.sz), 16, 'a 4x2x1 concrete box weighs 2.0 x 8 m3');

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
