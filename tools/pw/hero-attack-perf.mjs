// Per-step sim cost while the player is ATTACKING a city's largest structure,
// across every PLAYABLE city.
//
// WHY IT COVERS ALL OF THEM. Singapore's hero attack was measured at 15.33
// ms/step, 92% of the 16.7 ms frame budget for the simulation alone, and the
// obvious reading was "reshape Marina Bay Sands". But the diagnosis offered for
// it — the support solver re-runs a BFS over a whole dirty component, so cost
// follows the largest component — is a claim about the SOLVER, and if it were
// true it would indict every big city at once. Tokyo, Boston, Upper Manhattan
// and Cambridge are all 73-84k blocks. Reshaping one approved hero fixes one map
// and leaves the class standing, so the class is what gets measured here.
//
// WHAT IT FOUND, AND WHY THE OBVIOUS DIAGNOSIS IS WRONG. Largest-component size
// does NOT predict cost. Boston has the biggest component of any city (11,739
// blocks, 1.8x Singapore's 6,418) and is among the CHEAPEST under attack.
// What predicts cost is the number of blocks CONCURRENTLY IN MOTION — the
// active debris population — and Singapore is expensive because Marina Bay
// Sands, undermined, dumps an unusually large fraction of itself at once for
// its size, not because it is one large component.
//
// METHOD, and the three ways earlier versions of this measured nothing.
//
// 1. THE WORKLOAD IS DEFINED FUNCTIONALLY, PER CITY. An earlier version drove
//    every city along SINGAPORE's waypoint route. That route ends under the
//    Sands, so it compared "singapore attacking its hero" against "sydney
//    driving somewhere arbitrary" and reported a 5x that belonged to the route.
//    Each city is now attacked at the ground-footprint centroid of its own
//    largest component. Ground footprint, not 3D centroid: a tall tower's 3D
//    centroid is up in the air and parks the hole beside the thing it is meant
//    to undermine.
// 2. THE HOLE'S SIZE IS PINNED EVERY STEP. Without pinning, the hole grows as
//    it eats, so a city that engages early finishes the settle with a much
//    bigger aperture — singapore reached r=8.4 having eaten 3,273 while boston
//    sat at r=6.0 having eaten 361, and the "comparison" was then between two
//    different holes. Note it must be `size` that is pinned, not `radius`:
//    radius is recomputed from size every step, so an assigned radius is
//    overwritten on frame one and the hole silently reverts to 1.1 m.
// 3. THE TIMING LOOP MUST MAKE THE SIM DO WORK, AND MUST PROVE IT DID. A
//    stationary hole with nothing collapsing never changes its removal-zone
//    coverage, support never recalculates, and the step costs ~0.008 ms —
//    comfortably inside any budget, and measuring an early return. The loop
//    asserts the sim clock advanced by the full STEPS/60 and throws otherwise.
//
// Scenes are round-robined rather than run back to back, so a background spike
// on a shared box cannot be attributed entirely to whichever city was running
// during it, and both MEDIAN and MIN are reported: the min is the rep least
// polluted by other load, the median says whether the min was a fluke.
//
// Run: node tools/pw/hero-attack-perf.mjs            (all PLAYABLE cities)
//      node tools/pw/hero-attack-perf.mjs sydney boston
import { VoxelSandboxSim, loadScene } from '../../js/voxelsim.js';
import { CITY_CATALOG } from '../../js/citycatalog.js';

const ARGS = process.argv.slice(2);
const SCENES = ARGS.length ? ARGS : CITY_CATALOG.filter((c) => c.status === 'PLAYABLE').map((c) => c.scene);
const REPS = Number(process.env.FW_PERF_REPS || 3);
const ATTACK_SIZE = 11;      // pinned: radius 1.1 + (11-1)*0.5 = 6.1 m
const SETTLE = 60, STEPS = 200, BUDGET_MS = 1000 / 60;

for (const s of SCENES) await loadScene(s);

// The largest connected component, and the point on the ground where a player
// would be standing to bring it down.
const heroOf = (sim) => {
  const byComp = new Map();
  for (const b of sim.blocks) {
    const c = sim._compOf[b.bi];
    if (!byComp.has(c)) byComp.set(c, []);
    byComp.get(c).push(b);
  }
  const [, bs] = [...byComp.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const ground = bs.filter((b) => b.gy === 0);
  const src = ground.length ? ground : bs;
  return {
    n: bs.length,
    x: src.reduce((s, b) => s + b.x, 0) / src.length,
    z: src.reduce((s, b) => s + b.z, 0) / src.length,
  };
};

const runs = Object.fromEntries(SCENES.map((s) => [s, []]));
const meta = {};
for (let rep = 0; rep < REPS; rep++) {
  for (const scene of SCENES) {
    const sim = new VoxelSandboxSim({ seed: 'perf', scene });
    sim.step(1 / 60, { x: 0, z: 0 });                 // populates _compOf
    const hero = heroOf(sim);
    const h = sim.hole;
    h.x = hero.x; h.z = hero.z;
    h.size = ATTACK_SIZE; h.sizeFrac = 0;   // same starting aperture either way
    // FW_PERF_GROW=1 lets the hole grow as it eats, which is what really
    // happens in play and is the condition the original alarming Singapore
    // number was measured under. It is NOT a controlled comparison — a city
    // that engages early ends up with a bigger aperture than one that does
    // not — so it answers a different question: not "which city is dearest
    // per unit of attack" but "does any city blow the budget in real play".
    const GROW = process.env.FW_PERF_GROW === '1';
    const pin = () => { if (!GROW) { h.size = ATTACK_SIZE; h.sizeFrac = 0; } };
    pin();
    for (let i = 0; i < SETTLE; i++) { pin(); sim.step(1 / 60, { x: 0, z: 0 }); }
    const eaten0 = h.eatenCount;
    const debris = sim.blocks.filter((b) => b.state !== 'static').length;
    const t0 = sim.time, w = process.hrtime.bigint();
    for (let i = 0; i < STEPS; i++) { pin(); sim.step(1 / 60, { x: 0, z: 0 }); }
    const ms = Number(process.hrtime.bigint() - w) / 1e6 / STEPS;
    const advanced = sim.time - t0;
    if (Math.abs(advanced - STEPS / 60) > 1e-6) {
      throw new Error(`${scene}: clock advanced ${advanced.toFixed(3)}s over ${STEPS} steps, expected ${(STEPS / 60).toFixed(3)}s — the timing loop did not run the sim`);
    }
    runs[scene].push(ms);
    meta[scene] = { hero: hero.n, blocks: sim.blocks.length, debris, ate: h.eatenCount - eaten0 };
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

console.log(`\nhero-attack step cost — ${REPS} round-robined reps x ${STEPS} steps, hole pinned at SIZE ${ATTACK_SIZE} (r 6.1 m)`);
console.log(`frame budget ${BUDGET_MS.toFixed(2)} ms\n`);
console.log('scene            blocks  largestComp  debris   ate    min ms   median ms   % budget');
const rows = SCENES.map((s) => ({ s, ...meta[s], min: Math.min(...runs[s]), med: median(runs[s]) }))
  .sort((a, b) => b.med - a.med);
for (const r of rows) {
  console.log(`${r.s.padEnd(17)}${String(r.blocks).padStart(6)}${String(r.hero).padStart(13)}`
    + `${String(r.debris).padStart(8)}${String(r.ate).padStart(6)}`
    + `${r.min.toFixed(3).padStart(10)}${r.med.toFixed(3).padStart(12)}`
    + `${(r.med / BUDGET_MS * 100).toFixed(0).padStart(10)}%`);
}

// Which variable actually predicts the cost? Reported rather than assumed:
// the whole point of widening this to 11 cities was that the first answer
// ("largest component") was a guess fitted to one city.
const corr = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
};
const usable = rows.filter((r) => r.debris > 0 && r.med > 0);
const lg = (v) => Math.log(v);
const y = usable.map((r) => lg(r.med));
for (const [name, pick] of [['largest component', (r) => r.hero], ['active debris', (r) => r.debris], ['total blocks', (r) => r.blocks]]) {
  const x = usable.map((v) => lg(pick(v)));
  const r = corr(x, y);
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  console.log(`\nlog-log vs ${name.padEnd(18)} r=${r.toFixed(3)}  exponent=${(sxy / sxx).toFixed(2)}  (n=${n})`);
}
console.log('\nAn exponent is only meaningful where r is high; a low r means the variable does not');
console.log('predict cost at all and its exponent is noise, not a scaling law.');
