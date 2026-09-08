import assert from 'node:assert/strict';
import { Controls } from '../js/controls.js';
const events = new Map();
const el = () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} }, getBoundingClientRect: () => ({width:100,height:100}), addEventListener(){}, setPointerCapture(){}, releasePointerCapture(){} });
globalThis.window = {innerWidth:390,innerHeight:844,matchMedia:()=>({matches:true}),addEventListener:(n,f)=>events.set(n,f)};
globalThis.document = {getElementById:()=>el(),documentElement:el(),addEventListener(){}};
globalThis.getComputedStyle = () => ({getPropertyValue:()=> '0'});
globalThis.localStorage = {getItem:()=> '1',setItem(){}};
function control() { const c=new Controls(el()); c._hintSettled=true; c._safeInsets=()=>({left:0,right:0,top:0,bottom:0}); c._dismissHint=()=>{}; return c; }
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
for(const dt of [1/30,1/60,1/120]) {
  const c=control();
  for(const [key,x,z] of [['KeyW',0,-1],['KeyA',-1,0],['KeyS',0,1],['KeyD',1,0],['ArrowLeft',-1,0]]) {
    c.keys=new Set([key]); const m=c.getMove(0,dt); near(m.x,x); near(m.z,z);
  }
  c.keys=new Set(['KeyW','KeyD']); const m=c.getMove(0,dt); near(m.x,Math.SQRT1_2); near(m.z,-Math.SQRT1_2);
  c.keys=new Set(['KeyW','KeyS','KeyA','KeyD']); assert.deepEqual(c.getMove(0,dt),{x:0,z:0});
  c.keys.clear(); c.joyVec={x:0,y:1}; near(c.getMove(0,dt).z,1); c.joyVec.y=-1; near(c.getMove(0,dt).z,-1);
  c.joyVec={x:0.1,y:0}; assert.deepEqual(c.getMove(0,dt),{x:0,z:0});
  c.keys.add('KeyQ'); c.getMove(0,dt); assert.equal(c.consumeOrbit(),0);
}
const pointer=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0,timeStamp:10000,preventDefault(){}});
for(const [x,y] of [[1,1],[389,843],[200,400]]) {
  const c=control(); c.onPointerDown(pointer(1,x,y)); assert.deepEqual(c.joyOrigin,{x,y});
  c.onPointerMove(pointer(1,x+30,y)); near(c.getMove(0,1/60).x,1);
  c.onPointerUp(pointer(1,x+30,y)); assert.deepEqual(c.getMove(0,1/60),{x:0,z:0});
}
{
 const c=control(); c.onPointerDown(pointer(1,100,100)); c.onPointerMove(pointer(1,140,100));
 events.get('blur')(); assert.equal(c.joyId,null); assert.deepEqual(c.getMove(0,1/60),{x:0,z:0});
 c.keys.add('KeyW'); c.cancelPointer(); assert.equal(c.keys.size,0);
 c.onPointerDown({...pointer(2,100,100),timeStamp:performance.now()}); assert.equal(c.joyId,null,'overlay tail cannot arm stick');
}
console.log('ALL PASS direct controls: cardinal, diagonal, reversal, cancellation and edge origins');
