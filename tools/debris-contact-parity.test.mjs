// Debris pair-contact pass: a pure cost cut must stay a pure cost cut.
//
// PERF-2026-09-25-framerate measured `_resolveDebrisContacts` finding the same
// pair up to 36 times per round (0.25 m buckets, padded) and calling
// `_separate` 188k times per step for 15k actual pushes. The pre-reject now
// tests all three overlap axes before the call. `_separate` discards any pair
// whose px, py or pz is <= 0, so the pre-reject is a strict subset of that
// early-out and the surviving calls, and their order, are unchanged.
//
// Two things are asserted here:
//   1. RED before the fix: the pair pass never calls `_separate` on a pair it
//      could already see does not overlap (zero no-op calls).
//   2. The whole collapse-heavy trajectory hashes to the value recorded from
//      the code BEFORE the change (commit 0ffdae5), in free play and in ranked
//      (run90). If a hash moves, the change is not bit-identical and ranked
//      replays would need a RANKED_SIM_VERSION bump: stop, do not re-pin.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';

const STEPS = Number(process.env.FW_PARITY_STEPS || 180);
const GOLDEN = {
  freeplay: '95cd2c69dd1de1e3',
  run90: 'abad69296618ec54',
};

function snapshot(sim) {
  return createHash('sha256').update(JSON.stringify({
    holes: sim.holes.map((h) => [h.x, h.z, h.size, h.mass, h.eatenCount]),
    time: sim.time,
    blocks: sim.blocks.map((b) => [b.id, b.state, b.x, b.y, b.z, b.vx, b.vy, b.vz,
      b.rotX, b.rotZ, b.damage, b.asleep, b._grounded, b.parentChunk?.id]),
  })).digest('hex').slice(0, 16);
}

// The framerate report's scenario: drop an 11 m hole under the largest
// structure, then drive a fixed figure-eight through the collapse.
function run(mode) {
  const sim = new VoxelSandboxSim({ seed: 'perf', scene: 'singapore', mode });
  sim.step(1 / 60, { x: 0, z: 0 });
  const byComp = new Map();
  for (const b of sim.blocks) {
    const c = sim._compOf[b.bi];
    if (!byComp.has(c)) byComp.set(c, []);
    byComp.get(c).push(b);
  }
  const big = [...byComp.values()].sort((a, b) => b.length - a.length)[0];
  const ground = big.filter((b) => b.gy === 0);
  const src = ground.length ? ground : big;
  const h = sim.hole;
  h.x = src.reduce((s, b) => s + b.x, 0) / src.length;
  h.z = src.reduce((s, b) => s + b.z, 0) / src.length;
  h.size = 11; h.sizeFrac = 0;

  // Count calls from the pair pass that could not possibly push: any pair
  // with no overlap on some axis. The static-contact pass pre-checks all three
  // axes already, so every such call is the pair pass's.
  let noop = 0, calls = 0, peak = 0;
  const sep = sim._separate;
  sim._separate = function (b, o, movableO) {
    calls++;
    if ((b.sx + o.sx) / 2 - Math.abs(b.x - o.x) <= 0 ||
        (b.sy + o.sy) / 2 - Math.abs(b.y - o.y) <= 0 ||
        (b.sz + o.sz) / 2 - Math.abs(b.z - o.z) <= 0) noop++;
    return sep.call(this, b, o, movableO);
  };
  for (let i = 0; i < STEPS; i++) {
    const a = i / 60 * 0.6;
    sim.step(1 / 60, { x: Math.cos(a), z: Math.sin(2 * a) });
    if (sim._falling.length > peak) peak = sim._falling.length;
  }
  return { hash: snapshot(sim), noop, calls, peak };
}

await loadScene('singapore');
for (const mode of ['freeplay', 'run90']) {
  const r = run(mode);
  console.log(`  ${mode}: hash ${r.hash}, peak falling ${r.peak}, _separate calls ${r.calls}, no-op ${r.noop}`);
  assert.ok(r.peak > 300, `${mode}: scenario must be collapse-heavy (peak falling ${r.peak})`);
  if (process.env.FW_PRINT_HASH !== "1") assert.equal(r.noop, 0, `${mode}: pair pass made ${r.noop} no-op _separate calls of ${r.calls}`);
  if (process.env.FW_PRINT_HASH !== '1') {
    assert.equal(r.hash, GOLDEN[mode], `${mode}: trajectory changed; this is no longer a pure cost cut`);
  }
}
console.log('debris-contact-parity: passed');
