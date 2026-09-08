import assert from 'node:assert/strict';
import { VoxelGrid } from '../js/voxelgrid.js';
import { VoxelSandboxSim } from '../js/voxelsim.js';

import { originalContact } from './legacy-contact.mjs';

let seed = 8103;
const next = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
let probes = 0;
for (let scene = 0; scene < 80; scene++) {
  const grid = new VoxelGrid(), owners = [];
  for (let i = 0; i < 24; i++) {
    const gx = next(15) - 7, gy = next(15) - 4, gz = next(15) - 7;
    const fsx = 1 + next(5), fsy = 1 + next(9), fsz = 1 + next(5);
    const b = { gx, gy, gz, fsx, fsy, fsz, x: (gx + fsx / 2) * .25,
      y: (gy + fsy / 2) * .25, z: (gz + fsz / 2) * .25,
      state: ['static', 'unstable', 'falling', 'consumed'][next(4)] };
    owners.push(b);
    for (let x = 0; x < fsx; x++) for (let y = 0; y < fsy; y++) for (let z = 0; z < fsz; z++) grid.setCell(gx + x, gy + y, gz + z, b);
  }
  for (let phase = 0; phase < 3; phase++) {
    for (const b of owners) for (const [vx, vz] of [[0, 0], [2, 1], [-2, 1], [1, 2], [1, -2]]) {
      assert.equal(VoxelSandboxSim.prototype._contact.call({ grid }, b, vx, vz), originalContact.call({ grid }, b, vx, vz), `scene ${scene}, phase ${phase}, velocity ${vx},${vz}`);
      probes++;
    }
    // A cached column must see state changes immediately and ownership edits
    // on the next query; tall overlapping owners exercise disjoint runs.
    for (const b of owners) b.state = b.state === 'static' ? 'falling' : 'static';
    for (let i = 0; i < 20; i++) grid.deleteCell(next(15) - 7, next(15) - 4, next(15) - 7);
  }
}
console.log(`ALL PASS: ${probes} directional contact probes match the legacy order`);
