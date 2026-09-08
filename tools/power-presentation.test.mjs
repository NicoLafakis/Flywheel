import assert from 'node:assert/strict';
const {PowerPresentation}=await import('../js/power-presentation.js');
for(const type of ['quake','titan','vortex']) {
 const calls=[];const p=new PowerPresentation({begin:s=>calls.push(['begin',s]),frame:s=>calls.push(['frame',s]),end:()=>calls.push(['end'])});
 assert(p.start({type},{competitive:false,reducedMotion:false}));assert(p.blocking);
 assert.equal(p.start({type:'speed'},{}),false,'no overlapping camera owner');
 p.step(.35);assert.equal(p.sample().phase,'charge');
 p.step(.9);assert.equal(p.sample().phase,'release');
 p.step(.25);assert.equal(p.sample().phase,'return');
 p.step(.9);assert(!p.active);assert.equal(calls.filter(c=>c[0]==='end').length,1);
 p.cancel();assert.equal(calls.filter(c=>c[0]==='end').length,1);
}
for(const options of [{competitive:true},{reducedMotion:true},{}]) {
 const p=new PowerPresentation();p.start({type:options.competitive||options.reducedMotion?'titan':'speed'},options);
 assert(!p.blocking);assert.equal(p.sample().camera,null);p.step(.65);assert(!p.active);
}
const p=new PowerPresentation();p.start({type:'quake'},{});p.step(.5);p.cancel();assert.equal(p.sample(),null);
const ended=[];const priority=new PowerPresentation({end:previous=>ended.push(previous.power.type)});
priority.start({type:'frenzy'});priority.step(.3);
assert(priority.start({type:'titan'}),'routine feedback cannot suppress a major collection');
assert(priority.blocking);assert.deepEqual(ended,['frenzy']);
console.log('ALL PASS power presentation: timing, modes, interruption and single cleanup');
