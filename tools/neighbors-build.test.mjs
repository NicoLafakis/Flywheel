// Load-time adjacency build (`_buildNeighbors`) must produce exactly the
// adjacency it always did: same neighbours, in the same order, because the
// support BFS walks `neighbors` in array order.
//
// PERF-2026-09-25-load-times measured it at 1.0-3.0 s per city: one grid
// lookup and one coordinate array per 0.25 m cell of every face. The fix skips
// past a neighbour along the face row once found (every skipped cell belongs to
// that same neighbour, so first-discovery order is unchanged) and allocates
// nothing per cell. The oracle below is the pre-change algorithm, verbatim.
import assert from 'node:assert/strict';
import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import { VoxelGrid } from '../js/voxelgrid.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function oracle(sim) {
  let lookups = 0;
  const out = new Map();
  for (const b of sim.blocks) {
    const g = [b.gx, b.gy, b.gz];
    const e = [b.fsx, b.fsy, b.fsz];
    const found = new Set();
    for (const [dx, dy, dz] of DIRS) {
      const a = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
      const sign = dx + dy + dz;
      const fixed = sign > 0 ? g[a] + e[a] : g[a] - 1;
      const i1 = (a + 1) % 3, i2 = (a + 2) % 3;
      for (let u = 0; u < e[i1]; u++) {
        for (let v = 0; v < e[i2]; v++) {
          const c = [0, 0, 0];
          c[a] = fixed; c[i1] = g[i1] + u; c[i2] = g[i2] + v;
          lookups++;
          const nb = sim.grid.getCell(c[0], c[1], c[2]);
          if (nb && nb !== b) found.add(nb);
        }
      }
    }
    out.set(b, [...found].map((o) => o.id));
  }
  return { out, lookups };
}

for (const scene of (process.env.FW_NEIGHBOR_SCENES || 'brooklyn,cambridge,tokyo').split(',')) {
  await loadScene(scene);
  const sim = new VoxelSandboxSim({ scene });
  const t0 = performance.now();
  const { out, lookups } = oracle(sim);
  const oracleMs = performance.now() - t0;
  const grid = sim.grid;
  let calls = 0;
  const get = grid.getCell;
  grid.getCell = function (x, y, z) { calls++; return get.call(this, x, y, z); };
  for (const b of sim.blocks) b.neighbors = null;
  const t = performance.now();
  sim._buildNeighbors();
  const ms = performance.now() - t;
  grid.getCell = get;
  let edges = 0;
  for (const b of sim.blocks) {
    const ids = b.neighbors.map((o) => o.id);
    assert.deepEqual(ids, out.get(b), `${scene}: block ${b.id} adjacency differs from the pre-change build`);
    edges += ids.length;
  }
  console.log(`  ${scene}: ${sim.blocks.length} blocks, ${edges} edges identical; lookups ${calls} vs ${lookups} (${(calls / lookups * 100).toFixed(1)}%), ${ms.toFixed(0)} ms vs ${oracleMs.toFixed(0)} ms pre-change`);
  if (grid.overwrites === 0) {
    assert.ok(calls < lookups * 0.85, `${scene}: adjacency build still probes every face cell (${calls} of ${lookups})`);
  } else {
    // BoxGrid (Tokyo) has overlapping pieces: the skip would hide one, so the
    // full scan is the only correct build there.
    assert.equal(calls, lookups, `${scene}: overlapping cells must keep the full scan`);
  }
}

// The skip's precondition, in miniature. B is A's +x neighbour; C is written
// AFTER B into one of B's cells. Skipping past B's extent on A's face would
// miss C, so one overwrite must switch the skip off.
{
  const grid = new VoxelGrid();
  const fake = { grid, blocks: [] };
  const add = (id, gx, gy, gz, fsx, fsy, fsz) => {
    const b = { id, gx, gy, gz, fsx, fsy, fsz, neighbors: [] };
    fake.blocks.push(b);
    for (let i = 0; i < fsx; i++) for (let j = 0; j < fsy; j++) for (let k = 0; k < fsz; k++) grid.setCell(gx + i, gy + j, gz + k, b);
    return b;
  };
  const a = add(1, 0, 0, 0, 1, 4, 4);
  add(2, 1, 0, 0, 1, 4, 4);
  add(3, 1, 2, 2, 1, 1, 1);
  assert.equal(grid.overwrites, 1, 'VoxelGrid counts a cell taken over by another block');
  VoxelSandboxSim.prototype._buildNeighbors.call(fake);
  assert.deepEqual(a.neighbors.map((o) => o.id), oracle(fake).out.get(a), 'overlap: adjacency matches the full scan');
  assert.deepEqual(a.neighbors.map((o) => o.id), [2, 3]);
  console.log('  overlap guard: skip disabled, C still found');
}
console.log('neighbors-build: passed');
