import assert from 'node:assert/strict';
const {BoxGrid}=await import('../js/boxgrid.js');
const g=new BoxGrid(); const oracle=new Map(); const blocks=[];
for(let i=0;i<80;i++) {
 const b={id:i+1,gx:(i%8)*12-48,gy:Math.floor(i/8)*5,gz:(i%3)*10-15,fsx:7,fsy:4,fsz:6,state:'static'};
 blocks.push(b);g.addBlock(b);
 for(let x=b.gx;x<b.gx+b.fsx;x++)for(let y=b.gy;y<b.gy+b.fsy;y++)for(let z=b.gz;z<b.gz+b.fsz;z++)oracle.set(`${x},${y},${z}`,b);
}
for(let x=-50;x<50;x+=2)for(let y=0;y<52;y++)for(let z=-17;z<12;z+=2)assert.equal(g.getCell(x,y,z),oracle.get(`${x},${y},${z}`));
for(const b of blocks.filter((_,i)=>i%3===0)) {g.removeBlock(b);for(const [k,v]of oracle)if(v===b)oracle.delete(k);}
assert.equal(g.size,oracle.size);assert.deepEqual(new Map(g),oracle);
const support=new BoxGrid();
const lower={id:1,gx:0,gy:0,gz:0,fsx:4,fsy:8,fsz:4,state:'static'};
const upper={id:2,gx:0,gy:16,gz:0,fsx:4,fsy:4,fsz:4,state:'static'};
support.addBlock(lower);support.addBlock(upper);
assert.equal(support.supportBelow(1,1,19,4),2,'reject roof above body');
assert.equal(support.supportBelow(1,1,25,6),5);
upper.state='falling';assert.equal(support.supportBelow(1,1,25,6),2,'live support state');
assert.equal(support.getCell(1,10,1),undefined,'opening stays empty');
support.setCell(1,10,1,upper);assert.equal(support.get('1,10,1'),upper);support.deleteCell(1,10,1);assert.equal(support.getCell(1,10,1),undefined);
const huge=new BoxGrid();huge.addBlock({id:1,gx:0,gy:0,gz:0,fsx:16,fsy:4000,fsz:16,state:'static'});
assert(huge.storageEntries<100,'height must not expand storage into interior cells');
const hidden=new BoxGrid();hidden.addBlock({id:1,gx:0,gy:0,gz:0,fsx:4,fsy:8,fsz:4,state:'static'});
hidden.addBlock({id:2,gx:0,gy:0,gz:0,fsx:4,fsy:4,fsz:4,state:'falling'});
assert.equal(hidden.supportBelow(1,1,3,2),0,'hidden owner cannot supply support');
console.log('ALL PASS box grid: independent cell oracle, removal, support, openings, bounded storage');
