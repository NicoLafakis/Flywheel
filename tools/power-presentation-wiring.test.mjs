import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert(s.includes('new PowerPresentation('),'one active presentation controller');
const frame=s.slice(s.indexOf('function frame('));
assert(!frame.includes('queuePokemonSpawnIntro('),'spawns must not take the camera');
assert(frame.includes('powerPresentation.step(realDt)'),'presentation advances while sim is paused');
assert(s.includes('competitive: isMultiplayer || !!rankedRun'),'ranked/shared games cannot pause for presentation');
assert(s.includes('powerPresentation.cancel()'),'teardown/skip has a cleanup path');
for(const [name,end] of [['endSandbox','// ------------------------------------------------------------------ resize'],['endLevel','// ------------------------------------------------------------------ loop']]) {
 const body=s.slice(s.indexOf(`function ${name}()`),s.indexOf(end,s.indexOf(`function ${name}()`)));
 const calls=[];
 const run=new Function('powerPresentation','hud','audio','sim','screens',`let state='powerup_pause'; const level={}; ${body}; ${name}(); return state;`);
 const final=run({cancel:()=>calls.push('cancel')},{hide:()=>calls.push('hide')},{stopScene(){},win(){},lose(){}},{mode:'sandbox',won:true,elapsedTime:3},{showSandboxResults:()=>calls.push('results'),showResults:()=>calls.push('results')});
 assert.deepEqual(calls,['cancel','hide','results'],`${name} releases presentation before showing results`);assert.equal(final,'results');
}
console.log('ALL PASS power presentation application wiring');
