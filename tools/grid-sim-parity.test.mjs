import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import { VoxelGrid } from '../js/voxelgrid.js';
import { BoxGrid } from '../js/boxgrid.js';
import { originalContact } from './legacy-contact.mjs';

// The original string grid is the independent lookup oracle. The simulation
// must produce the same state and events with either storage representation.
class StringGrid extends Map {
  getCell(x, y, z) { return this.get(`${x},${y},${z}`); }
  setCell(x, y, z, b) { return this.set(`${x},${y},${z}`, b); }
  deleteCell(x, y, z) { return this.delete(`${x},${y},${z}`); }
}
function originalSupportBelow(b, yBase) {
  const fx = Math.round(b.x / 0.25 - b.fsx / 2), fz = Math.round(b.z / 0.25 - b.fsz / 2);
  let best = 0;
  for (let ix = 0; ix < b.fsx; ix++) for (let iz = 0; iz < b.fsz; iz++) {
    for (let cy = Math.max(0, Math.floor(yBase / 0.25 + 0.2)); cy >= 0;) {
      const o = this.grid.get(`${fx + ix},${cy},${fz + iz}`);
      if (!o || (o.state !== 'static' && o.state !== 'unstable')) { cy--; continue; }
      const top = (o.gy + o.fsy) * 0.25;
      if (top <= yBase + 0.05) { if (top > best) best = top; break; }
      cy = o.gy - 1;
    }
  }
  return best;
}
function snapshot(sim) {
  return createHash('sha256').update(JSON.stringify({ holes: sim.holes, time: sim.time,
    blocks: sim.blocks.map(b => [b.id, b.state, b.x, b.y, b.z, b.vx, b.vy, b.vz,
      b.rotX, b.rotZ, b.damage, b.asleep, b._grounded, b.parentChunk?.id]),
    events: sim.drainEvents(),
  }, (key, value) => value && typeof value.bi === 'number' && Array.isArray(value.neighbors)
    ? { blockId: value.id } : key === 'parentChunk' ? value?.id : value)).digest('hex');
}
for (const scene of (process.env.FW_GRID_SCENES || 'gallery,singapore').split(',')) {
  await loadScene(scene);
  const a = new VoxelSandboxSim({ scene, seed: 'perf' });
  assert.ok(a.grid instanceof (a.geometryVersion === 2 ? BoxGrid : VoxelGrid), 'scene-selected occupancy backend');
  const b = new VoxelSandboxSim({ scene, seed: 'perf' });
  b.grid = new StringGrid(b.grid);
  b._supportBelow = originalSupportBelow;
  b._contact = originalContact;
  a.step(1/60, { x: 0, z: 0 }); b.step(1/60, { x: 0, z: 0 });
  const groups = new Map();
  for (const block of a.blocks) {
    const c = a._compOf[block.bi];
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(block);
  }
  const hero = [...groups.values()].sort((x, y) => y.length - x.length)[0];
  const ground = hero.filter(block => block.gy === 0);
  const feet = ground.length ? ground : hero;
  for (const sim of [a, b]) {
    sim.hole.x = feet.reduce((v, block) => v + block.x, 0) / feet.length;
    sim.hole.z = feet.reduce((v, block) => v + block.z, 0) / feet.length;
    sim.hole.size = 11; sim.hole.sizeFrac = 0;
  }
  for (let tick = 0; tick < 260; tick++) {
    a.step(1/60, { x: 0, z: 0 }); b.step(1/60, { x: 0, z: 0 });
    if (tick % 20 === 0 || tick === 259) assert.equal(snapshot(a), snapshot(b), `${scene} parity tick ${tick}`);
  }
  console.log(`PASS: ${scene} numeric/string grid physics, score and event parity over 260 collapse ticks`);
}
console.log('ALL PASS: grid simulation parity');
