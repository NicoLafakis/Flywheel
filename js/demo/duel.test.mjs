// Headless proof that the duel drives two REAL holes through the sim's native
// multi-hole path (sim.holes[], one step per tick — no time-slicing).
// Run: node js/demo/duel.test.mjs
//
// Asserts, over 90 simulated seconds of two holes ploughing the gallery:
//   - both holes eat (eatenCount > 0) and grow (radius increases)
//   - no NaN anywhere in either hole's numeric state, ever
//   - both holes stay inside the sim's movement bounds
//   - no crash, and the shared block grid actually loses blocks
//   - the two holes are distinct sim entities with independent accumulation

import { VoxelSandboxSim } from '../voxelsim.js';
import { Duel } from './duel.js';

const DT = 1 / 60;
// 90 simulated seconds by default, at the DEFAULT tier — Infinity debris cap,
// Infinity contact budget — because the point is to prove the native
// multi-hole path against the shipped sim, not against a cheaper configuration
// of it. `node duel.test.mjs 30` runs a quick smoke pass instead.
const SECONDS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 90;
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };

const sim = new VoxelSandboxSim({ scene: 'gallery' });
console.log(`gallery: ${sim.blocks.length} blocks, totalMass ${sim.totalMass.toFixed(1)}, bounds ${sim.bounds}`);

const duel = new Duel(sim, [{ x: -8, z: 8 }, { x: 8, z: 8 }]);
const r0 = [duel.hole(0).radius, duel.hole(1).radius];

// Two different lawnmower routes so the holes cover different ground, driven
// off the sim clock rather than a fixed script.
function moveFor(i, t) {
  const phase = t * (i === 0 ? 0.55 : 0.4) + i * 1.7;
  return { x: Math.cos(phase), z: Math.sin(phase * 1.3) };
}

const steps = Math.round(SECONDS / DT);
let nanSeen = null;
const consumedBefore = sim.blocks.filter((b) => b.state === 'consumed').length;

for (let s = 0; s < steps; s++) {
  const t = s * DT;
  duel.step(DT, [moveFor(0, t), moveFor(1, t)]);
  duel.drain(0); duel.drain(1);
  for (let i = 0; i < 2 && !nanSeen; i++) {
    const h = duel.hole(i);
    for (const k of ['x', 'z', 'radius', 'mass', 'rawMass', 'chain', 'chainTimer', 'size', 'sizeFrac']) {
      if (!Number.isFinite(h[k])) { nanSeen = `P${i + 1}.${k} = ${h[k]} at t=${t.toFixed(2)}s`; break; }
    }
  }
}

if (nanSeen) fail('non-finite hole state: ' + nanSeen);

for (let i = 0; i < 2; i++) {
  const h = duel.hole(i);
  const tag = `P${i + 1}`;
  console.log(`${tag}: eaten ${h.eatenCount}, score(mass) ${Math.floor(h.mass)}, raw ${h.rawMass.toFixed(1)} `
    + `(${(duel.fraction(i) * 100).toFixed(1)}% of city), SIZE ${h.size}, r ${h.radius.toFixed(2)} (from ${r0[i].toFixed(2)}), `
    + `bestCombo ${h.bestCombo}, pos (${h.x.toFixed(1)}, ${h.z.toFixed(1)})`);
  if (!(h.eatenCount > 0)) fail(`${tag} ate nothing`);
  if (!(h.radius > r0[i])) fail(`${tag} never grew`);
  if (Math.abs(h.x) > sim.bounds + 1e-6 || Math.abs(h.z) > sim.bounds + 1e-6) fail(`${tag} escaped bounds`);
}

const consumedAfter = sim.blocks.filter((b) => b.state === 'consumed').length;
console.log(`shared world: ${consumedAfter - consumedBefore} blocks consumed of ${sim.blocks.length}`);
if (!(consumedAfter > consumedBefore)) fail('the shared world lost no blocks');

// Independence: the two holes must not be the same object nor hold equal state.
if (duel.hole(0) === duel.hole(1)) fail('both players share one hole object');
if (duel.hole(0).mass === duel.hole(1).mass) fail('both holes have identical mass — suspicious');

console.log(failures === 0 ? `\nPASS — ${SECONDS}s of two-hole simulation, no failures.` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
