import assert from 'node:assert/strict';
import { VoxelGrid } from '../js/voxelgrid.js';
import { VoxelSandboxSim } from '../js/voxelsim.js';
const grid = new VoxelGrid();
const low = { gy: 0, fsy: 2, state: 'static' };
const high = { gy: 20, fsy: 8, state: 'static' };
for (let y = 0; y < 2; y++) grid.setCell(0, y, 0, low);
for (let y = 20; y < 28; y++) grid.setCell(0, y, 0, high);
function oracle(yBase) {
  for (let cy = Math.max(0, Math.floor(yBase / .25 + .2)); cy >= 0;) {
    const b = grid.getCell(0, cy, 0);
    if (!b || !['static', 'unstable'].includes(b.state)) { cy--; continue; }
    const top = (b.gy + b.fsy) * .25;
    if (top <= yBase + .05) return top;
    cy = b.gy - 1;
  }
  return 0;
}
function verify() {
  for (let i = -4; i < 160; i++) for (const offset of [-1e-12, 0, 1e-12]) {
    const base = i * .05 + offset;
    assert.equal(grid.supportBelow(0, 0, Math.max(0, Math.floor(base / .25 + .2)), base + .05), oracle(base), `base ${base}`);
  }
}
verify();
high.state = 'falling'; verify();
high.state = 'unstable'; verify();
for (let y = 20; y < 28; y++) grid.deleteCell(0, y, 0);
verify();
grid.set('0,4,0', { gy: 4, fsy: 1, state: 'static' }); verify();
grid.delete('0,4,0'); verify();
grid.clear(); verify();
assert.equal(grid.supportBelow(100, 100, 1000, 250), 0);
assert.equal(VoxelSandboxSim.prototype._supportBelow.call({ grid: { supportBelow: () => 2 } },
  { x: 0, z: 0, fsx: 2, fsz: 2 }, 5), 2, 'sim uses indexed support queries');
console.log('ALL PASS: sparse support columns match legacy scan across state changes, deletes and float boundaries');
