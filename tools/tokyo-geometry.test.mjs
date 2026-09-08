import assert from 'node:assert/strict';
import {VoxelSandboxSim,loadScene} from '../js/voxelsim.js';
await loadScene('tokyo');
const old=new VoxelSandboxSim({scene:'tokyo',geometryVersion:1,seed:'architecture'});
const next=new VoxelSandboxSim({scene:'tokyo',geometryVersion:2,seed:'architecture'});
assert.equal(next.geometryVersion,2);
assert(next.blocks.length<old.blocks.length*.8,`meaningful physical piece reduction: ${next.blocks.length}/${old.blocks.length}`);
assert.equal(typeof next.grid.addBlock,'function','bounds backend selected');
assert(next.grid.storageEntries<old.grid.size/5,'no dense interior allocation');
assert(Math.abs(next.totalMass-old.totalMass)<.0001,'material mass preserved');
for(const b of old.blocks) {
 for(const dx of [0,b.fsx-1])for(const dy of [0,b.fsy-1])for(const dz of [0,b.fsz-1]) {
  const x=b.gx+dx,y=b.gy+dy,z=b.gz+dz;
  const a=old.grid.getCell(x,y,z),c=next.grid.getCell(x,y,z);
  assert(c,`missing Tokyo geometry ${x},${y},${z}`);
  assert.equal(c.color,a.color);assert.equal(c.matType,a.matType);assert.equal(c.surface,a.surface);
 }
}
const snack=old.blocks.filter(b=>b.sx<=.5&&b.sy<=.5&&b.sz<=.5).length;
assert(next.blocks.filter(b=>b.sx<=.5&&b.sy<=.5&&b.sz<=.5).length>=snack,'small props retained');
const target=next.blocks.find(b=>b.assemblyId);assert(target);
next._consume(target);const mass=next.hole.rawMass,score=next.hole.mass;
next._consume(target);assert.equal(next.hole.rawMass,mass);assert.equal(next.hole.mass,score,'cannot award twice');
console.log(`ALL PASS Tokyo geometry: ${old.blocks.length} -> ${next.blocks.length} pieces; ${next.grid.storageEntries} spatial entries`);
