import assert from 'node:assert/strict';
import { VoxelGrid } from '../js/voxelgrid.js';
const grid = new VoxelGrid();
const coords = [-32769, -32768, -1, 0, 1, 32767, 32768];
let count = 0;
for (const x of coords) for (const z of coords) for (const y of [-524289, -524288, -1, 0, 524287, 524288]) {
  const value = { x, y, z };
  grid.setCell(x, y, z, value);
  assert.equal(grid.get(`${x},${y},${z}`), value);
  assert.equal(grid.getCell(x, y, z), value);
  assert.ok(grid.has(`${x},${y},${z}`));
  count++;
}
assert.equal(grid.size, count, 'coordinate packing is injective at every boundary');
for (const [key, value] of grid) assert.equal(key, `${value.x},${value.y},${value.z}`);
assert.equal([...grid.keys()].length, count);
assert.equal([...grid.values()].length, count);
grid.forEach((value, key, owner) => {
  assert.equal(key, `${value.x},${value.y},${value.z}`);
  assert.equal(owner, grid);
});
grid.set('1,2,3', 'external');
assert.equal(grid.getCell(1, 2, 3), 'external');
grid.deleteCell(1, 2, 3);
assert.equal(grid.has('1,2,3'), false);
grid.setCell(1, 2, 3, 'internal');
assert.equal(grid.delete('1,2,3'), true);
assert.equal(grid.getCell(1, 2, 3), undefined);
grid.clear();
assert.equal(grid.size, 0);
console.log(`ALL PASS: voxel grid compatibility and ${count} signed/boundary cell coordinates`);
