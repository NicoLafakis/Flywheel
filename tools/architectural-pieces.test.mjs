import assert from 'node:assert/strict';
const {architecturalPieces}=await import('../js/architectural-pieces.js');
const records=[];
for(let x=0;x<6;x++)for(let z=0;z<6;z++)records.push({x,y:3,z,mat:'concrete',size:1,color:123,surface:'floor'});
// Columns and different material must not be swallowed by a slab merge.
records.push({x:0,y:1,z:0,mat:'steel',size:1,color:456},{x:0,y:2,z:0,mat:'steel',size:1,color:456});
const options={id:'tower',origin:[0,0],bay:3,storey:3};
const pieces=architecturalPieces(records,options);
assert.equal(pieces.length,5,'four floor bays and one two-metre column');
assert.deepEqual(pieces,architecturalPieces(records,options),'stable authoring');
const cells=rows=>{const m=new Map();for(const r of rows){const s=Array.isArray(r.size)?r.size:[r.size,r.size,r.size];for(let x=r.x;x<r.x+s[0];x+=.25)for(let y=r.y;y<r.y+s[1];y+=.25)for(let z=r.z;z<r.z+s[2];z+=.25)m.set(`${x},${y},${z}`,`${r.mat}:${r.color}:${r.surface}`);}return m;};
assert.deepEqual(cells(pieces),cells(records),'preserve every occupied cell and its finish');
assert(pieces.every(p=>p.assemblyId==='tower'));
const opening=records.filter(r=>r.x!==1 || r.z!==1);assert.deepEqual(cells(architecturalPieces(opening,options)),cells(opening),'never fill openings to reduce count');
console.log('ALL PASS architectural pieces: bays, columns, finishes, openings and determinism');
