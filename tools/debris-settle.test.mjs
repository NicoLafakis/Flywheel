// Debris-settle regression test — pins RCA-2026-08-24 (fallen debris jiggles
// forever because retirement is gated on a `_grounded` flag the contact
// separator's 1.02 skin makes unreachable). Opt-in and standalone: run with
//   node tools/debris-settle.test.mjs
// Kept out of the default validator run — it steps ~2 minutes of Boston sim
// (about a minute of wall clock in Node).
//
// Repro per the RCA: Boston, seed 'probe', hole parked 20 s at (-96, -56) at
// r = 4.5 (size 7, frac 0.8 — radius is recomputed from the SIZE ladder every
// step, so the ladder inputs are what a harness must set), then retreated out
// of bounds (500, 500). Two assertions, both RED pre-fix:
//   (a) awake non-_budgetHold loose bodies decay to <= 5 within 40 s of quiet
//       and stay there at +60 s (pre-fix: flat at ~243 forever);
//   (b) no body stays awake through a full 300-step window while its position
//       swings >= 0.05 m on any axis (pre-fix: lateral ping-pong up to 2.0 m).
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

const DT = 1 / 60;
let failures = 0;
let checks = 0;
const assert = (cond, msg) => {
  checks++;
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
};

await loadScene('boston');
const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
const h = sim.hole;
h.x = -96; h.z = -56;
// Pin r = 4.5 for the whole park: radius is recomputed every step and on every
// eat from size/sizeFrac (which themselves derive from rawMass on eat), so a
// bare radius write drifts (measured: 6.68 by 20 s) and growthMult = 0 is
// swallowed by the `|| 1.0` default. Freeze the ladder inputs themselves.
Object.defineProperty(h, 'size', { get: () => 7, set: () => {} });
Object.defineProperty(h, 'sizeFrac', { get: () => 0.8, set: () => {} });

// Phase 1: 20 s of destruction parked in the dense corner.
for (let i = 0; i < 20 * 60; i++) sim.step(DT, { x: 0, z: 0 });
assert(Math.abs(h.radius - 4.5) < 0.6,
  `hole radius drifted from the repro spec (${h.radius.toFixed(2)}, wanted ~4.5)`);

// Phase 2: retreat out of bounds; nothing eats or excites debris from here on.
h.x = 500; h.z = 500;

const awakeLoose = () =>
  sim._falling.filter((b) => b && !b.consumed && !b.asleep && !b._budgetHold).length;

// (a) decay within 40 s of quiet.
let decayed = Infinity;
for (let i = 0; i < 40 * 60; i++) {
  sim.step(DT, { x: 0, z: 0 });
  decayed = awakeLoose();
  if (decayed <= 5) break;
}
assert(decayed <= 5,
  `awake loose bodies did not decay within 40 s of quiet (still ${decayed}, want <= 5)`);

// (b) 300-step amplitude window on whatever is still awake: an awake body must
// be going somewhere (falling/sliding), not oscillating in place. Bodies that
// retire mid-window are fine; bodies awake the whole window with >= 0.05 m
// positional swing are exactly the RCA's jiggle population.
const tracked = new Map(); // body -> {minX,maxX,minY,maxY,minZ,maxZ,always}
for (const b of sim._falling) {
  if (b && !b.consumed && !b.asleep && !b._budgetHold) {
    tracked.set(b, { minX: b.x, maxX: b.x, minY: b.y, maxY: b.y, minZ: b.z, maxZ: b.z, always: true });
  }
}
for (let i = 0; i < 300; i++) {
  sim.step(DT, { x: 0, z: 0 });
  for (const [b, r] of tracked) {
    if (b.consumed || b.asleep) { r.always = false; continue; }
    if (b.x < r.minX) r.minX = b.x; if (b.x > r.maxX) r.maxX = b.x;
    if (b.y < r.minY) r.minY = b.y; if (b.y > r.maxY) r.maxY = b.y;
    if (b.z < r.minZ) r.minZ = b.z; if (b.z > r.maxZ) r.maxZ = b.z;
  }
}
let jigglers = 0;
for (const [, r] of tracked) {
  if (!r.always) continue;
  const amp = Math.max(r.maxX - r.minX, r.maxY - r.minY, r.maxZ - r.minZ);
  if (amp >= 0.05) jigglers++;
}
assert(jigglers === 0,
  `${jigglers} bodies stayed awake a full 300-step window with >= 0.05 m positional swing`);

// (a cont.) never rises again: step out to +60 s total quiet and re-check.
// (300 window steps above already count toward the 60 s.)
for (let i = 0; i < 15 * 60; i++) sim.step(DT, { x: 0, z: 0 });
const late = awakeLoose();
assert(late <= 5, `awake loose bodies rose again by +60 s of quiet (${late}, want <= 5)`);

console.log(failures === 0
  ? `debris-settle: ALL PASS (${checks} checks; final awake=${awakeLoose()})`
  : `debris-settle: ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
