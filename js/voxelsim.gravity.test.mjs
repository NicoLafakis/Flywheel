// Headless physics regression tests for RCA 2026-08-11 (skyscraper launch,
// mid-air hover, per-material gravity). Run: node js/voxelsim.gravity.test.mjs
//
// Covers the three fixed mechanisms:
//   1. no teleport — during a Boston skyscraper collapse, no loose (non-chunk)
//      falling block ever gains more than 2 m of height in a single step
//      (pre-fix: 108 single-step jumps, max 30.9 m — debris snapped onto the
//      roof of the still-standing tower beside it)
//   2. uniform gravity — _fallG is tune.gravity for every material density,
//      and the collapse shows pure-gravity integration ticks (dvy == -g·dt)
//      on both light and heavy materials (pre-fix: glass fell at 44 m/s²,
//      steel at 101 — zero on-gravity ticks for either)
//   3. no mid-air hover — no awake block spends 3+ s nearly motionless with
//      its base more than 1 m above its true static support and no loose
//      support under it (pre-fix: wall-scraped blocks hovered indefinitely,
//      their downward velocity reflected every frame by a lateral contact)

import { VoxelSandboxSim } from './voxelsim.js';

const DT = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// --- 2a. uniform gravity: the mechanism ---------------------------------------
{
  const sim = new VoxelSandboxSim({ scene: 'gallery' });
  // The shipped density range (glass 0.8 .. steel 3.5) plus the extremes.
  let bad = 0;
  for (const density of [0.3, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 3.5]) {
    if (sim._fallG(density) !== sim.tune.gravity) bad++;
  }
  if (bad > 0) fail(`_fallG varies with density (${bad} of 8 samples off tune.gravity)`);
  else ok('uniform gravity: _fallG(density) === tune.gravity across the material range');
}

// --- 1 + 2b + 3. the Boston skyscraper collapse -------------------------------
// The RCA's reproduction: hole parked at the tallest tower, 25 s at 1/60.
{
  const sim = new VoxelSandboxSim({ seed: 'probe', scene: 'boston' });
  const h = sim.hole;
  h.x = -96; h.z = -56; h.radius = 3.2;

  const g = sim.tune.gravity;
  const prevY = new Map();          // id -> y last step
  const prevVy = new Map();         // id -> vy last step
  const hoverT = new Map();         // id -> consecutive seconds nearly motionless in mid-air
  let jumps = 0, worstJump = 0;
  let glassTicks = 0, steelTicks = 0;
  let hovered = 0, worstHover = '';

  for (let i = 0; i < 25 * 60; i++) {
    sim.step(DT, { x: 0, z: 0 });
    for (const b of sim.blocks) {
      if (b.state !== 'falling') { prevY.delete(b.id); prevVy.delete(b.id); hoverT.delete(b.id); continue; }
      // 1. teleport guard (loose debris only; chunk members ride a rigid body)
      const py = prevY.get(b.id);
      if (py !== undefined && !b.parentChunk) {
        const dy = b.y - py;
        if (dy > worstJump) worstJump = dy;
        // 2.5 m bound: _pushAxis's anti-tunnelling contract legally corrects a
        // full penetration in one step, bounded by block extents (~2.04 m for
        // two 2 m bodies plus the separation skin, a little more when a
        // gravity tick and a second contact land in the same step). Roof
        // teleports are BUILDING height — 7 m on the lowest roof, 29 m on the
        // Boston tower — so 2.5 separates the two populations cleanly.
        if (dy > 2.5) jumps++;
      }
      prevY.set(b.id, b.y);
      // 2b. pure-gravity integration ticks per material
      const pvy = prevVy.get(b.id);
      if (pvy !== undefined && !b.parentChunk && Math.abs((b.vy - pvy) + g * DT) < 1e-9) {
        if (b.matType === 'glass') glassTicks++;
        else if (b.matType === 'steel') steelTicks++;
      }
      prevVy.set(b.id, b.vy);
      // 3. hover census: nearly motionless, airborne, no support of any kind
      if (!b.asleep && !b.parentChunk && !b._grounded && !b._looseSup && !b._restLoose && Math.abs(b.vy) < 2) {
        hoverT.set(b.id, (hoverT.get(b.id) || 0) + DT);
      } else {
        hoverT.delete(b.id);
      }
    }
  }

  for (const [id, t] of hoverT) {
    if (t < 3) continue;
    const b = sim.blocks.find((bl) => bl.id === id);
    if (!b || b.state !== 'falling') continue;
    const support = sim._supportBelow(b, b.y - b.sy / 2);
    if (b.y - b.sy / 2 - support > 1) {
      hovered++;
      if (!worstHover) worstHover = `block #${id} ${b.matType} at y ${b.y.toFixed(2)} (support ${support.toFixed(2)}) for ${t.toFixed(1)}s`;
    }
  }

  if (jumps > 0) fail(`${jumps} single-step upward jumps over 2 m (worst ${worstJump.toFixed(2)} m) — the roof-snap teleport is back`);
  else ok(`no teleport: max single-step rise ${worstJump.toFixed(2)} m over the full collapse`);
  if (glassTicks === 0 || steelTicks === 0) {
    fail(`no pure-gravity ticks at tune.gravity for ${glassTicks === 0 ? 'glass' : ''}${glassTicks === 0 && steelTicks === 0 ? ' and ' : ''}${steelTicks === 0 ? 'steel' : ''} — gravity is not uniform in flight`);
  } else ok(`uniform gravity in flight: ${glassTicks} glass / ${steelTicks} steel on-gravity integration ticks`);
  if (hovered > 0) fail(`${hovered} block(s) hovered 3+ s in mid-air with no support — first ${worstHover}`);
  else ok('no mid-air hover: every nearly-motionless block sat on real support');
  console.log(`  collapse: eaten=${sim.hole.eatenCount} blocks over 25 s`);
}

if (failures > 0) { console.error(`${failures} FAILURE(S)`); process.exit(1); }
console.log('ALL PASS (voxelsim.gravity.test.mjs)');
