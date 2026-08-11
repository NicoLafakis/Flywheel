// Headless multi-hole sim tests (the ai-players FR-001/FR-002 refactor).
// Run: node js/voxelsim.multihole.test.mjs
//
// Covers:
//   1. roster shape — sim.holes[] is canonical, sim.hole aliases holes[0]
//   2. call-shape equivalence — step(dt, move) and step(dt, [move]) are the
//      same simulation, bit for bit
//   3. two-hole determinism — same seed + same input sequence = identical
//      outcome, including the event sequence and its ordering
//   4. independent accumulation — each hole's mass/rawMass/chain/size/eaten
//      are its own; a parked hole stays at zero while the other eats
//   5. shared-world conservation — no block consumed twice, no mass invented
//   6. the duel-heal fix — one hole's undermining is not healed by the other
//      hole's presence elsewhere (support resolves against the union)

import { VoxelSandboxSim } from './voxelsim.js';

const DT = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

const holeState = (h) => ({
  x: h.x, z: h.z, radius: h.radius, mass: h.mass, rawMass: h.rawMass,
  chain: h.chain, bestCombo: h.bestCombo, eatenCount: h.eatenCount,
  size: h.size, sizeFrac: h.sizeFrac,
});

// The duel harness's two lawnmower routes, driven off the sim clock.
function moveFor(i, t) {
  const phase = t * (i === 0 ? 0.55 : 0.4) + i * 1.7;
  return { x: Math.cos(phase), z: Math.sin(phase * 1.3) };
}

// --- 1. roster shape ---------------------------------------------------------
{
  const sim = new VoxelSandboxSim({ scene: 'gallery' });
  if (!Array.isArray(sim.holes) || sim.holes.length !== 1) fail('fresh sim does not have holes = [one hole]');
  if (sim.hole !== sim.holes[0]) fail('sim.hole is not an alias for sim.holes[0]');
  if (sim.holes[0].index !== 0) fail('holes[0].index is not 0');
  if (sim.holes[0].isPlayer !== true) fail('holes[0].isPlayer is not true');
  const h1 = sim.addHole(8, 8);
  if (sim.holes.length !== 2 || sim.holes[1] !== h1) fail('addHole did not append to the roster');
  if (h1.index !== 1) fail('added hole did not get index 1');
  if (h1.isPlayer !== false) fail('added hole should not be isPlayer');
  if (sim.hole !== sim.holes[0]) fail('sim.hole moved off holes[0] after addHole');
  if (sim.step.length < 2) fail('sim.step.length dropped below 2 — js/net/host.js feature detection breaks');
  if (failures === 0) ok('roster shape: holes[], hole alias, addHole, step.length');
}

// --- 2. single-move vs array-move equivalence --------------------------------
{
  const runs = [];
  for (const asArray of [false, true]) {
    const sim = new VoxelSandboxSim({ scene: 'gallery' });
    for (let i = 0; i < 30 * 60; i++) {
      const m = moveFor(0, i * DT);
      sim.step(DT, asArray ? [m] : m);
    }
    runs.push({ h: holeState(sim.hole), events: sim.events.length, time: sim.time });
  }
  const a = JSON.stringify(runs[0]), b = JSON.stringify(runs[1]);
  if (a !== b) fail(`step(dt, move) !== step(dt, [move]):\n    ${a}\n    ${b}`);
  else ok('call-shape equivalence: single move and one-element array are identical');
}

// --- 3 + 4 + 5. two-hole determinism, independence, conservation -------------
{
  const run = () => {
    const sim = new VoxelSandboxSim({ scene: 'gallery' });
    sim.hole.x = -8; sim.hole.z = 8;
    sim.addHole(8, 8);
    const evLog = [];
    for (let i = 0; i < 45 * 60; i++) {
      const t = i * DT;
      sim.step(DT, [moveFor(0, t), moveFor(1, t)]);
      for (const e of sim.events) {
        evLog.push(`${e.type}:${e.hole ? e.hole.index : '-'}:${e.obj ? e.obj.id : ''}`);
      }
      sim.events.length = 0;
    }
    return { sim, evLog };
  };

  const A = run();
  const B = run();

  // 3. determinism
  const sa = A.sim.holes.map(holeState), sb = B.sim.holes.map(holeState);
  if (JSON.stringify(sa) !== JSON.stringify(sb)) fail('two identical two-hole runs diverged in hole state');
  else ok('two-hole determinism: hole states identical across runs');
  if (A.evLog.length !== B.evLog.length || A.evLog.join('|') !== B.evLog.join('|')) {
    fail(`event sequences diverged (${A.evLog.length} vs ${B.evLog.length} events)`);
  } else ok(`two-hole determinism: ${A.evLog.length} events, identical sequence and order`);

  // 4. independence
  const [h0, h1] = A.sim.holes;
  if (!(h0.eatenCount > 0) || !(h1.eatenCount > 0)) fail(`both holes should eat (P1 ${h0.eatenCount}, P2 ${h1.eatenCount})`);
  if (h0.mass === h1.mass) fail('both holes have identical mass — accumulation looks shared');
  for (const [k, v] of Object.entries(holeState(h0))) {
    if (!Number.isFinite(v)) fail(`P1.${k} is not finite: ${v}`);
  }
  for (const [k, v] of Object.entries(holeState(h1))) {
    if (!Number.isFinite(v)) fail(`P2.${k} is not finite: ${v}`);
  }
  // every eat event must be attributed to exactly one roster hole
  const eatsBy = [0, 0];
  for (const e of A.evLog) {
    const m = e.match(/^eat:(\d+)/);
    if (m) eatsBy[Number(m[1])]++;
  }
  if (eatsBy[0] !== h0.eatenCount || eatsBy[1] !== h1.eatenCount) {
    fail(`eat attribution mismatch: events ${eatsBy}, counters ${[h0.eatenCount, h1.eatenCount]}`);
  } else ok(`independent accumulation: P1 ate ${h0.eatenCount}, P2 ate ${h1.eatenCount}, all events attributed`);

  // 5. conservation on the shared grid
  const consumed = A.sim.blocks.filter((b) => b.state === 'consumed').length;
  if (h0.eatenCount + h1.eatenCount !== consumed) {
    fail(`double-count: holes ate ${h0.eatenCount + h1.eatenCount} but grid lost ${consumed}`);
  }
  const rawSum = h0.rawMass + h1.rawMass;
  if (rawSum > A.sim.totalMass * (1 + 1e-9)) fail(`mass created from nothing: ${rawSum} > ${A.sim.totalMass}`);
  if (failures === 0) ok(`conservation: ${consumed} blocks consumed once each, raw mass within the city total`);
}

// --- 4b. a parked hole accumulates nothing -----------------------------------
{
  const sim = new VoxelSandboxSim({ scene: 'gallery' });
  // hole 0 parked on empty ground (the default spawn at (0, 16) is open
  // plaza); hole 1 ploughs the reference tower.
  const h1 = sim.addHole(-2, -3);
  for (let i = 0; i < 20 * 60; i++) {
    const t = i * DT;
    sim.step(DT, [null, moveFor(1, t)]);
    sim.events.length = 0;
  }
  const h0 = sim.holes[0];
  if (h0.eatenCount !== 0 || h0.mass !== 0 || h0.rawMass !== 0 || h0.chain !== 0 || h0.size !== 1) {
    fail(`parked hole accumulated state: eaten ${h0.eatenCount}, mass ${h0.mass}, chain ${h0.chain}, size ${h0.size}`);
  } else if (!(h1.eatenCount > 0)) {
    fail('driven hole ate nothing in the tower run');
  } else {
    ok(`parked hole stayed at zero while the driven hole ate ${h1.eatenCount} blocks (chain/combo isolated per hole)`);
  }
}

// --- 6. the duel-heal fix ----------------------------------------------------
// One hole (A) parks against the reference tower's wall and undermines its
// floor rim; a second hole (B) wanders far away, forcing a support recalc
// every step. In the retired time-slicing duel, B's recalc reset A's
// undermined blocks to full support ("each player's recalc partially heals
// the rim the other player was undermining"). With union support, A's
// undermining must persist untouched.
{
  const sim = new VoxelSandboxSim({ scene: 'gallery' });
  const A = sim.holes[0];
  A.x = -5.8; A.z = 0;              // hugging the tower's x = -5 wall
  sim.addHole(16, 10);              // B: far corner, empty ground
  // Let A's undermining register and the first collapse settle, holes still.
  for (let i = 0; i < 120; i++) { sim.step(DT, [null, null]); sim.events.length = 0; }

  // Find a still-static floor block partially undermined by A.
  const undermined = sim.blocks.filter((b) =>
    b.gy === 0 && b.state === 'static' && b.supportRatio > 0 && b.supportRatio < 1
    && Math.hypot(b.x - A.x, b.z - A.z) < A.radius + 1.6);
  if (!undermined.length) {
    fail('test setup: no partially-undermined static floor block found next to hole A');
  } else {
    const probe = undermined.map((b) => [b.id, b.supportRatio]);
    // B wanders in circles far from the tower: its coverage changes every
    // step, so the support recalc runs every step — the exact condition that
    // healed A's rim in the time-sliced duel.
    for (let i = 0; i < 300; i++) {
      const t = i * DT;
      sim.step(DT, [null, { x: Math.cos(t * 2), z: Math.sin(t * 2) }]);
      sim.events.length = 0;
    }
    let healed = 0;
    for (const [id, ratio] of probe) {
      const b = sim.blocks[id - 1]; // array order == id order
      if (b.state === 'static' && b.supportRatio !== ratio) healed++;
    }
    if (healed > 0) fail(`${healed}/${probe.length} undermined blocks changed support while only the FAR hole moved — the heal artifact is back`);
    else ok(`duel-heal fix: ${probe.length} undermined rim blocks held their reduced support through 300 far-hole recalcs`);
  }
}

console.log(failures === 0 ? '\nPASS — multi-hole sim tests, no failures.' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
