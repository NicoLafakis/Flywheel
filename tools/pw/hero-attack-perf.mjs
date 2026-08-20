// Per-step sim cost while the player is ATTACKING a city's hero structure.
//
// Why this exists: a scene can sit comfortably inside the frame budget at rest
// and blow through it the moment the player starts doing the thing the goal
// asks for. Singapore's goal is CRUMBLE THE SKYPARK, and Marina Bay Sands is a
// single 6,418-block connected component (three towers plus the SkyPark deck
// that bridges them). The support solver re-runs its BFS over a whole dirty
// component, so undermining that one structure costs 7.7x what Sydney's Opera
// House costs, on 1.9x the component size -- superlinear, and it lands at 92%
// of the entire 16.7 ms frame budget for the simulation alone.
//
// Run: node tools/pw/hero-attack-perf.mjs   (no server, no renderer)
//
// METHOD NOTES, because the first three versions of this measured nothing.
//
// 1. Each city is driven into ITS OWN largest component. An earlier version
//    drove all three along Singapore's route -- which ends under the Sands --
//    so it compared "singapore attacking its hero" against "sydney driving
//    somewhere arbitrary", and the 5x it printed was a property of the route.
// 2. The timing loop must pass a REAL move vector or run against an already
//    collapsing structure. A stationary hole never changes its removal-zone
//    coverage, so support never recalculates and the step is nearly free:
//    a zero vector reports ~0.008 ms/step and looks like a triumph.
// 3. Round-robin across scenes with min-of-N. A min is the rep least polluted
//    by whatever else the box was doing, and interleaving stops one background
//    spike from landing entirely on one scene. Absolute ms on a shared machine
//    is not a measurement; the ORDERING between scenes is the falsifiable part,
//    so a run that inverts a known ordering indicts the instrument, not the code.
// 4. Debris is NOT the driver, though it correlates. Applying the shipped
//    device-tier lever (debrisCap 280, contactBudget 200) moved singapore from
//    15.33 to 13.75 ms and left the debris count at 3,178 -- component size is
//    what costs.
import { VoxelSandboxSim, loadScene } from '../../js/voxelsim.js';

const SCENES = process.argv.slice(2).length ? process.argv.slice(2) : ['sydney', 'auckland', 'singapore'];
const REPS = 3, STEPS = 300, BUDGET_MS = 1000 / 60;

for (const s of SCENES) await loadScene(s);

// Centre of the largest connected component: the structure whose collapse
// dirties the most support graph, which is what the goal points the player at.
const heroCentre = (sim) => {
  const byComp = new Map();
  for (const b of sim.blocks) {
    const c = sim._compOf[b.bi];
    if (!byComp.has(c)) byComp.set(c, []);
    byComp.get(c).push(b);
  }
  const [, bs] = [...byComp.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return {
    n: bs.length,
    x: bs.reduce((s, b) => s + b.x, 0) / bs.length,
    z: bs.reduce((s, b) => s + b.z, 0) / bs.length,
  };
};

const best = {}, meta = {};
for (let rep = 0; rep < REPS; rep++) {
  for (const scene of SCENES) {
    const sim = new VoxelSandboxSim({ seed: 'perf', scene });
    sim.step(1 / 60, { x: 0, z: 0 });      // one step to populate the component map
    const hero = heroCentre(sim);
    const h = sim.hole;
    for (let i = 0; i < 30 * 60; i++) {     // drive to it
      const dx = hero.x - h.x, dz = hero.z - h.z, m = Math.hypot(dx, dz);
      if (m < 1.0) break;
      sim.step(1 / 60, { x: dx / m, z: dz / m });
    }
    for (let i = 0; i < 120; i++) sim.step(1 / 60, { x: 0, z: 0 });   // bed in beneath it
    const debris = sim.blocks.filter((b) => b.state !== 'static').length;
    const t0 = sim.time, w = process.hrtime.bigint();
    for (let i = 0; i < STEPS; i++) sim.step(1 / 60, { x: 0, z: 0 });
    const ms = Number(process.hrtime.bigint() - w) / 1e6 / STEPS;
    // A step that early-returns costs nothing and beats every budget. If the
    // clock did not advance by the full STEPS/60, the number above is not a
    // measurement of anything and must not be reported as one.
    const advanced = sim.time - t0;
    if (Math.abs(advanced - STEPS / 60) > 1e-6) {
      throw new Error(`${scene}: sim clock advanced ${advanced.toFixed(3)}s over ${STEPS} steps, expected ${(STEPS / 60).toFixed(3)}s — the timing loop did not run the sim`);
    }
    if (!(scene in best) || ms < best[scene]) { best[scene] = ms; meta[scene] = { hero, debris }; }
  }
}

const baseline = best[SCENES[0]];
console.log(`hero-attack step cost, min of ${REPS} reps x ${STEPS} steps, frame budget ${BUDGET_MS.toFixed(2)} ms\n`);
for (const s of SCENES) {
  const m = meta[s];
  console.log(`${s.padEnd(11)} hero ${String(m.hero.n).padStart(5)} blocks @(${m.hero.x.toFixed(0)},${m.hero.z.toFixed(0)})  `
    + `debris ${String(m.debris).padStart(4)}  ${best[s].toFixed(3).padStart(7)} ms/step  `
    + `${(best[s] / baseline).toFixed(2)}x ${SCENES[0]}  ${(best[s] / BUDGET_MS * 100).toFixed(0)}% of budget`);
}
