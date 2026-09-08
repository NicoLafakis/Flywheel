import assert from 'node:assert/strict';
import {BoxGrid} from '../js/boxgrid.js';
import {VoxelSandboxSim} from '../js/voxelsim.js';
import {originalContact} from './legacy-contact.mjs';
const grid=new BoxGrid();
for(let x=-4;x<4;x++)for(let z=-4;z<4;z++)for(let y=0;y<3;y++)grid.addBlock({id:grid.blocks.size,gx:x*12,gy:y*12,gz:z*12,fsx:4,fsy:8,fsz:7,state:'static'});
assert.equal(typeof grid.contact,'function');
let probes=0;
for(let x=-47;x<48;x+=3)for(let z=-46;z<48;z+=4)for(const y of [0,2,4,7]) {
 const b={x:x*.25,y,z:z*.25,fsx:8,fsy:5,fsz:10};
 for(const [vx,vz]of [[2,1],[-2,1],[1,2],[1,-2],[0,0]]) {
  assert.equal(grid.contact(b,vx,vz),originalContact.call({grid},b,vx,vz));probes++;
 }
 const fx=Math.round(b.x/.25-b.fsx/2),fz=Math.round(b.z/.25-b.fsz/2),cy=Math.max(0,Math.floor(y/.25+.2));
 let top=0;for(let ix=0;ix<b.fsx;ix++)for(let iz=0;iz<b.fsz;iz++)top=Math.max(top,grid.supportBelow(fx+ix,fz+iz,cy,y+.05));
 assert.equal(grid.supportUnder(fx,fz,b.fsx,b.fsz,cy,y+.05),top);
}
const overlap={id:999,gx:-48,gy:0,gz:-48,fsx:2,fsy:4,fsz:2,state:'falling'};grid.addBlock(overlap);
const b={x:-12,y:1,z:-12,fsx:4,fsy:4,fsz:4};
assert.equal(VoxelSandboxSim.prototype._contact.call({grid},b,1,0),originalContact.call({grid},b,1,0),'overlap fallback preserves owner visibility');
console.log(`ALL PASS ${probes} bounds contacts and footprint supports against cell oracle`);
