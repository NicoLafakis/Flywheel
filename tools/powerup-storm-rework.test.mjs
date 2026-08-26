// TDD guard for the 2026-08-25 power-up spawn rules + tornado rework.
//
// SPEC (Nico, 2026-08-25, STATUS.md "Power-up spawn rules + tornado rework"):
//   P1  30 s cadence, ONE respawn slot — never parallel per-slot timers.
//   P2  Power-ups accumulate up to MAX_MAP_POWERUPS = 5 if ignored; the
//       spawner pauses at 5; nothing is ever force-despawned.
//   P3  The four hardcoded 30.0 s literals collapse into one exported
//       POWERUP_RESPAWN_SECONDS constant in js/powerups.js.
//   P4  Initial board stays at 2 — accumulation happens over time only.
//   P5  With 5 on the board, all 5 types are distinct (no-duplicate invariant
//       survives the cap raise; 6 types > 5 slots makes this satisfiable).
//   S1  Storm duration 16 -> 20 s (long clocks), 12 -> 15 s (90 s modes),
//       both as single named exported constants.
//   S2  vortexRadius is assigned on activation (the 12.0 fallback at the
//       hole-teleport check must stop being the only value ever used).
//   S3  Pathing: seeded wander — the heading changes mid-flight away from
//       walls, deterministically per seed.
//   S4  Destruction uses the spatial top-surface sweep, not a full linear
//       blocks[] scan (source guard), with maxRips and y>=5 rule unchanged.
//   C1  A spawn onto a board that already holds uncollected power-ups is a
//       backlog spawn: its event says so, so main.js can suppress the
//       encounter cinematic (tools/cinematic-arming-guard.test.mjs owns the
//       main.js half).
//   R1  RANKED_SIM_VERSION bumps 3 -> 4 (duration, pathing, destruction and
//       cap all alter ranked determinism).
//   V1  Renderer: funnel is no longer a wireframe cone, tornado debris
//       particle materials are pooled (no per-particle material allocation),
//       and the tornado group is disposed on teardown (source guards —
//       js/voxelworld.js imports three.js so it cannot run in Node).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  MAX_MAP_POWERUPS, POWERUP_RESPAWN_SECONDS,
} from '../js/powerups.js';
import {
  VoxelSandboxSim, StormSystem, RANKED_SIM_VERSION,
  STORM_DURATION_SECONDS, STORM_DURATION_90S_SECONDS,
} from '../js/voxelsim.js';
import { Sim } from '../js/sim.js';
import { LEVELS } from '../js/levels.js';
import { LEVEL_CLOCK_TICKS } from '../js/levelclock.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

let n = 0;
const failures = [];
const check = (cond, msg) => { n++; if (!cond) failures.push(msg); return !!cond; };

console.log('Testing power-up spawn rules + tornado rework...');

// ---------------------------------------------------------------------------
// P3 — one shared constant, and the sims must import it rather than restate it.
// ---------------------------------------------------------------------------
check(POWERUP_RESPAWN_SECONDS === 30.0,
  `P3: POWERUP_RESPAWN_SECONDS must be 30.0, got ${POWERUP_RESPAWN_SECONDS}`);
check(MAX_MAP_POWERUPS === 5,
  `P2: MAX_MAP_POWERUPS must be 5, got ${MAX_MAP_POWERUPS}`);
{
  const simSrc = read('js/sim.js');
  const voxelSrc = read('js/voxelsim.js');
  for (const [name, src] of [['js/sim.js', simSrc], ['js/voxelsim.js', voxelSrc]]) {
    check(src.includes('POWERUP_RESPAWN_SECONDS'),
      `P3: ${name} must consume the shared POWERUP_RESPAWN_SECONDS constant`);
    check(!/RespawnTimers?\.push\(30\.0\)/.test(src),
      `P3: ${name} still pushes a hardcoded 30.0 s respawn timer`);
    check(!/powerupRespawnTimers\.push\(/.test(src),
      `P1: ${name} still queues parallel per-slot respawn timers — the rework is a single shared slot`);
  }
}

// ---------------------------------------------------------------------------
// P1/P2/P4/P5/C1 — sandbox sim behaviour, driven for real.
// ---------------------------------------------------------------------------
{
  const sim = new VoxelSandboxSim('gallery', { seed: 4242 });
  // Park the hole out of play: wandering power-ups drifting into it would be
  // COLLECTED, which is the other spawn path — this test isolates the timer.
  for (const h of sim.holes) h.departed = true;
  const uncollected = () => sim.powerups.filter((p) => !p.collected && !p.expired).length;
  check(uncollected() === 2, `P4: the opening board must stay at 2 power-ups, got ${uncollected()}`);
  sim.events.length = 0;

  const dt = 1 / 60;
  const spawnTimes = [];
  let maxPerStep = 0;
  let despawns = 0;
  let minCount = uncollected();
  for (let t = 0; t < 160; t += dt) {
    sim.step(dt);
    let spawnsThisStep = 0;
    for (const ev of sim.events) {
      if (ev.type === 'powerup_spawn') { spawnsThisStep++; spawnTimes.push({ t: sim.time, ev }); }
      if (ev.type === 'powerup_despawn') despawns++;
    }
    maxPerStep = Math.max(maxPerStep, spawnsThisStep);
    minCount = Math.min(minCount, uncollected());
    sim.events.length = 0;
  }
  check(maxPerStep <= 1, `P1: ${maxPerStep} power-ups spawned in a single step — one spawn at a time`);
  check(despawns === 0, `P2: ${despawns} forced despawn(s) — accumulated power-ups must persist`);
  check(minCount >= 2, `P2: the board dropped to ${minCount} with nothing collected`);
  check(uncollected() === MAX_MAP_POWERUPS,
    `P2: after 160 s ignored, the board must hold ${MAX_MAP_POWERUPS} power-ups, got ${uncollected()}`);
  check(spawnTimes.length === MAX_MAP_POWERUPS - 2,
    `P1: expected exactly ${MAX_MAP_POWERUPS - 2} accumulation spawns in 160 s (30 s cadence, pause at cap), got ${spawnTimes.length}`);
  for (let i = 0; i < spawnTimes.length; i++) {
    const expected = 30.0 * (i + 1);
    check(Math.abs(spawnTimes[i].t - expected) < 0.5,
      `P1: accumulation spawn ${i + 1} landed at ${spawnTimes[i].t.toFixed(2)} s, expected ~${expected} s`);
  }

  // P5 — all five on-board types distinct.
  const types = sim.powerups.filter((p) => !p.collected).map((p) => p.type);
  check(new Set(types).size === types.length,
    `P5: duplicate types on the full board: ${types.join(', ')}`);
  // Every accumulated power-up must be a live, in-bounds entity.
  const r = sim.boundsRect || { minX: -sim.bounds, maxX: sim.bounds, minZ: -sim.bounds, maxZ: sim.bounds };
  for (const p of sim.powerups) {
    check(Number.isFinite(p.x) && Number.isFinite(p.z)
      && p.x >= r.minX - 0.01 && p.x <= r.maxX + 0.01 && p.z >= r.minZ - 0.01 && p.z <= r.maxZ + 0.01,
      `P2: power-up ${p.id} (${p.type}) is out of bounds or non-finite at (${p.x}, ${p.z})`);
  }

  // C1 — every accumulation spawn here landed on a non-empty board: backlog.
  for (const { ev } of spawnTimes) {
    check(ev.backlog === true,
      `C1: a spawn onto a board holding uncollected power-ups must carry backlog: true (got ${JSON.stringify(ev.backlog)})`);
  }

  // P1 after collection: eat three, the single slot refills one per 30 s.
  let eaten = 0;
  for (const p of sim.powerups) { if (!p.collected && eaten < 3) { p.collected = true; eaten++; } }
  sim.step(dt);
  sim.events.length = 0;
  const refillTimes = [];
  const tAfterEat = sim.time;
  for (let t = 0; t < 100; t += dt) {
    sim.step(dt);
    let perStep = 0;
    for (const ev of sim.events) if (ev.type === 'powerup_spawn') { perStep++; refillTimes.push(sim.time - tAfterEat); }
    check(perStep <= 1, 'P1: multiple refills fired in one step after a triple collection');
    sim.events.length = 0;
  }
  check(refillTimes.length === 3,
    `P1: 3 collected slots must refill via 3 sequential 30 s waits, got ${refillTimes.length} refills in 100 s`);
  if (refillTimes.length === 3) {
    for (let i = 0; i < 3; i++) {
      check(Math.abs(refillTimes[i] - 30.0 * (i + 1)) < 1.0,
        `P1: refill ${i + 1} at +${refillTimes[i].toFixed(2)} s, expected ~${30 * (i + 1)} s — parallel timers would land all three at ~30 s`);
    }
  }
}

// C1 on an EMPTY board: the first respawn after a full clear is an arrival,
// not backlog.
{
  const sim = new VoxelSandboxSim('gallery', { seed: 7 });
  for (const h of sim.holes) h.departed = true;
  for (const p of sim.powerups) p.collected = true;
  sim.events.length = 0;
  const dt = 1 / 60;
  let firstSpawn = null;
  for (let t = 0; t < 35 && !firstSpawn; t += dt) {
    sim.step(dt);
    for (const ev of sim.events) if (ev.type === 'powerup_spawn') { firstSpawn = ev; break; }
    sim.events.length = 0;
  }
  check(!!firstSpawn, 'C1: an emptied board must respawn within ~30 s');
  if (firstSpawn) {
    check(firstSpawn.backlog === false,
      `C1: a spawn onto an EMPTY board must carry backlog: false (got ${JSON.stringify(firstSpawn.backlog)})`);
  }
}

// ---------------------------------------------------------------------------
// P1/P2 — the campaign sim (js/sim.js) follows the same single-slot rule.
// ---------------------------------------------------------------------------
{
  const sim = new Sim(LEVELS[0], {});
  const uncollected = () => sim.powerups.filter((p) => !p.collected && !p.expired).length;
  check(uncollected() === 2, `P4 (campaign): opening board must stay at 2, got ${uncollected()}`);
  sim.events.length = 0;
  const dt = 1 / 60;
  const input = { dx: 0, dz: 0 };
  let spawns = 0;
  let collects = 0;
  let maxPerStep = 0;
  for (let t = 0; t < 100; t += dt) {
    sim.step(dt, input);
    let perStep = 0;
    for (const ev of sim.events) {
      if (ev.type === 'powerup_spawn') { perStep++; spawns++; }
      if (ev.type === 'powerup_collect') collects++;
    }
    maxPerStep = Math.max(maxPerStep, perStep);
    sim.events.length = 0;
    if (sim.over) break;
  }
  // A wandering power-up can drift into the idle player and be collected; the
  // single slot then also refills those, so the exact spawn count floats with
  // `collects` — the cap and the one-per-step rule are the invariants.
  check(maxPerStep <= 1, `P1 (campaign): ${maxPerStep} spawns in one step`);
  check(spawns >= 3 && uncollected() === 5,
    `P2 (campaign): after 100 s ignored the campaign board must hold 5 (got ${uncollected()} after ${spawns} spawns, ${collects} accidental collects)`);
}

// ---------------------------------------------------------------------------
// S1 — durations as named constants, schedule updated, invariant still holds.
// ---------------------------------------------------------------------------
check(STORM_DURATION_SECONDS === 20.0,
  `S1: STORM_DURATION_SECONDS must be 20.0, got ${STORM_DURATION_SECONDS}`);
check(STORM_DURATION_90S_SECONDS === 15.0,
  `S1: STORM_DURATION_90S_SECONDS must be 15.0 (12 s scaled by the same 20/16 factor), got ${STORM_DURATION_90S_SECONDS}`);
{
  const fakeSim = (clockLimit, mode = 'freeplay') => ({ seed: 'storm', mode, clockLimit, scene: 'manhattan' });
  const at300 = new StormSystem(fakeSim(LEVEL_CLOCK_TICKS)).schedule;
  check(at300.length === 2 && at300.every((ev) => ev.duration === STORM_DURATION_SECONDS),
    `S1: 300 s schedule durations must both be ${STORM_DURATION_SECONDS}, got ${JSON.stringify(at300.map((e) => e.duration))}`);
  const run90 = new StormSystem({ seed: 'storm', mode: 'run90', clockLimit: null, scene: 'manhattan' }).schedule;
  check(run90.length === 1 && run90[0].duration === STORM_DURATION_90S_SECONDS,
    `S1: 90 s schedule duration must be ${STORM_DURATION_90S_SECONDS}, got ${JSON.stringify(run90.map((e) => e.duration))}`);
  // The schedule invariant: warning + storm must fit inside every clock.
  check(28.0 + 4.0 + STORM_DURATION_90S_SECONDS < 90,
    'S1: the 90 s storm no longer fits its match');
  check(108.0 + 4.0 + STORM_DURATION_SECONDS < 180,
    'S1: the 180 s second storm no longer fits its match');
}

// ---------------------------------------------------------------------------
// S2/S3 — activation assigns vortexRadius; the path wanders deterministically.
// ---------------------------------------------------------------------------
function driveStormToActive(seed = 'wander') {
  // A huge arena so no wall bounce can masquerade as a wander.
  const fake = {
    seed, mode: 'freeplay', clockLimit: LEVEL_CLOCK_TICKS, scene: 'manhattan',
    time: 0, events: [], bounds: 4000,
    boundsRect: { minX: -4000, maxX: 4000, minZ: -4000, maxZ: 4000 },
    blocks: [], grid: new Map(), _top: new Map(), _falling: [],
    _graphDirty: false, sceneDecor: null,
    _detachBlock() {},
  };
  const ss = new StormSystem(fake);
  fake.time = 61;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 5 && ss.state !== 'active'; i++) ss.step(dt);
  return { ss, fake, dt };
}
{
  const { ss, dt } = driveStormToActive();
  check(ss.state === 'active', `S2: harness failure — storm never activated (state ${ss.state})`);
  check(ss.vortexRadius === 16.0,
    `S2: an active tornado must assign vortexRadius = 16.0, got ${JSON.stringify(ss.vortexRadius)} — the 12.0 fallback at the hole-teleport check must stop being the only value ever used`);

  // S3: sample the heading each second for 12 s; away from every wall it must
  // change at least once (the shipped code never re-rolls it).
  const headings = [];
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 60; i++) ss.step(dt);
    headings.push(Math.atan2(ss.vortexVz, ss.vortexVx));
  }
  let changed = 0;
  for (let i = 1; i < headings.length; i++) {
    const d = Math.atan2(Math.sin(headings[i] - headings[i - 1]), Math.cos(headings[i] - headings[i - 1]));
    if (Math.abs(d) > 0.05) changed++;
  }
  check(changed >= 2,
    `S3: the vortex heading changed ${changed} time(s) in 12 s far from every wall — a fixed heading can loop a short corridor forever`);
}
{
  // S3 determinism: same seed, identical track; different seed, different track.
  const a = driveStormToActive('det');
  const b = driveStormToActive('det');
  const c = driveStormToActive('det2');
  const track = ({ ss, dt }) => {
    const out = [];
    for (let i = 0; i < 60 * 6; i++) { ss.step(dt); if (i % 30 === 0) out.push([ss.vortexX, ss.vortexZ]); }
    return JSON.stringify(out);
  };
  const ta = track(a), tb = track(b), tc = track(c);
  check(ta === tb, 'S3: two storms with the same seed diverged — the wander must draw from the storm\'s own seeded RNG stream');
  check(ta !== tc, 'S3: two different seeds produced the identical track — the wander is not actually seeded');
}

// ---------------------------------------------------------------------------
// S4 — destruction reads the spatial index, not the whole blocks array.
// ---------------------------------------------------------------------------
{
  const voxelSrc = read('js/voxelsim.js');
  const at = voxelSrc.indexOf('  _applyStormDestruction() {');
  check(at !== -1, 'ANTI-VACUITY: _applyStormDestruction declaration not found');
  if (at !== -1) {
    const body = voxelSrc.slice(at, voxelSrc.indexOf('\n  }', at));
    check(!/this\.sim\.blocks\.length/.test(body),
      'S4: _applyStormDestruction still linearly scans this.sim.blocks — it must query the spatial top-surface index');
    check(/_top/.test(body) && /grid/.test(body),
      'S4: _applyStormDestruction must consume the sim\'s _top heightmap + fine grid for candidate lookup');
    check(/maxRips = 8/.test(body), 'S4: maxRips must stay 8 (spec: do not change destruction volume)');
    check(/b\.y >= 5\.0/.test(body), 'S4: the tornado y>=5 vulnerability rule must stay');
  }
}

// ---------------------------------------------------------------------------
// S5 — physics saturation guard: rip pulses pause while too many movers are
// airborne. Measured on Tokyo: without it the wander + top-surface rips push
// awake debris to ~277 concurrent movers and the step cost past 14 ms; the
// plan's own FPS-protection lever caps the active-body count instead.
// ---------------------------------------------------------------------------
{
  const { ss, fake } = driveStormToActive('saturate');
  // Plant one obviously rippable column under the vortex.
  const f = 4; // 1 / FINE
  // Align the planted column with the sweep's stride-2 sampling lattice, which
  // starts at floor((vortexX - stormRad) * f).
  const align = (v) => {
    const min = Math.floor((v - 16.0) * f);
    let g = Math.round(v * f);
    if ((g - min) % 2 !== 0) g += 1;
    return g;
  };
  const gx = align(ss.vortexX), gz = align(ss.vortexZ);
  const mkBlock = () => ({
    x: ss.vortexX, y: 8.0, z: ss.vortexZ, state: 'static', matType: 'brick',
  });
  const cellKey = (x, z) => (((x + 8192) & 0x3FFF) << 14) | ((z + 8192) & 0x3FFF);
  fake._top.set(cellKey(gx, gz), 8.5);
  fake.grid.set(`${gx},${Math.round(8.5 * f) - 1},${gz}`, mkBlock());
  let detached = 0;
  fake._detachBlock = () => { detached++; };

  // Saturated: 300 awake airborne movers — the pulse must stand down.
  fake._falling = Array.from({ length: 300 }, () => ({ consumed: false, asleep: false }));
  ss._applyStormDestruction();
  check(detached === 0,
    `S5: with 300 awake movers airborne the rip pulse must pause (physics saturation guard), but it detached ${detached}`);

  // Calm airspace: the same column must rip.
  fake._falling = [];
  ss._applyStormDestruction();
  check(detached > 0,
    'S5: with clear airspace the same column must still rip — the guard is a governor, not a deletion');
}

// ---------------------------------------------------------------------------
// R1 — ranked version bump.
// ---------------------------------------------------------------------------
check(RANKED_SIM_VERSION === 4,
  `R1: RANKED_SIM_VERSION must be 4 (duration/pathing/destruction/cap all change ranked determinism), got ${RANKED_SIM_VERSION}`);

// ---------------------------------------------------------------------------
// V1 — renderer source guards (three.js module; cannot execute in Node).
// ---------------------------------------------------------------------------
{
  const worldSrc = read('js/voxelworld.js');
  const meshAt = worldSrc.indexOf('_ensureTornadoMesh(');
  check(meshAt !== -1, 'ANTI-VACUITY: _ensureTornadoMesh not found in js/voxelworld.js');
  if (meshAt !== -1) {
    const meshBody = worldSrc.slice(meshAt, worldSrc.indexOf('\n  }', meshAt));
    check(!/wireframe:\s*true/.test(meshBody),
      'V1: the funnel is still a wireframe cone — the rework wants a solid layered funnel');
  }
  const partAt = worldSrc.indexOf('spawnTornadoDebrisParticle(');
  check(partAt !== -1, 'ANTI-VACUITY: spawnTornadoDebrisParticle not found');
  if (partAt !== -1) {
    const partBody = worldSrc.slice(partAt, worldSrc.indexOf('\n  }', partAt));
    check(/_stormDebrisPool/.test(partBody) && /\.pop\(\)/.test(partBody),
      'V1: spawnTornadoDebrisParticle must draw from the _stormDebrisPool (allocating only on a pool miss), not allocate a material per particle');
    check(/pooled:\s*true/.test(partBody),
      'V1: pooled storm debris must be marked so the particle death path recycles it instead of disposing');
    check(/_stormDebrisPool\.push/.test(worldSrc),
      'V1: nothing ever returns a dead storm debris mesh to _stormDebrisPool — that is not a pool, it is a leak with extra steps');
  }
  const teardownAt = worldSrc.indexOf('} else if (this.tornadoGroup) {');
  check(teardownAt !== -1, 'ANTI-VACUITY: the tornado teardown branch not found');
  if (teardownAt !== -1) {
    const tdBody = worldSrc.slice(teardownAt, worldSrc.indexOf('\n    }', teardownAt));
    check(/dispose/.test(tdBody),
      'V1: the tornado teardown removes the group but never disposes its geometries/materials — that is the leak');
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`\nFAIL powerup-storm rework: ${failures.length} of ${n} assertion(s) failed\n`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  assert.fail(`${failures.length} of ${n} powerup-storm assertion(s) failed`);
}
console.log(`PASS powerup-storm rework: ${n} assertions`);
