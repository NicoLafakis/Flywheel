// Deterministic, no-power-up calibration drives. Retarget at human-scale
// intervals; move through food toward district waypoints without teleporting.
import {VoxelSandboxSim,loadScene} from '../js/voxelsim.js';
import {writeFileSync} from 'node:fs';
await loadScene('tokyo');
const routes=[
 [[-22,20],[-53,55],[-95,-55],[-53,-20],[-20,-50],[30,-80],[55,50]],
 [[35,45],[55,50],[30,-80],[-20,-50],[-53,-20],[-95,-55],[-53,55]],
 [[-20,-50],[30,-80],[-53,-20],[-95,-55],[-53,55],[-22,20],[55,50]],
];
const results=[];
for(let ri=0;ri<routes.length;ri++) {
 if(process.env.FW_ROUTE!==undefined && ri!==Number(process.env.FW_ROUTE))continue;
 const sim=new VoxelSandboxSim({scene:'tokyo',seed:`tokyo-route-${ri}`});
 let target=null,waypoint=0,reached=null;const marks=[];let timeMs=0,steps=0;
 for(let tick=0;tick<18000&&!sim.over;tick++) {
   const h=sim.hole;
   sim.powerups.length=0;sim.nextScorePowerUpThreshold=Infinity;sim.nextMultPowerUpThreshold=Infinity;
   if(tick%60===0 || target?.state==='consumed') {
     const [wx,wz]=routes[ri][waypoint%routes[ri].length];
     if(Math.hypot(h.x-wx,h.z-wz)<10)waypoint++;
     let best=Infinity;target=null;
     for(const b of sim.blocks) {
       if(b.state==='consumed'||b.gy>0||Math.hypot(b.sx-.1,b.sz-.1)>h.radius*1.8)continue;
       const d=Math.hypot(b.x-h.x,b.z-h.z);
       const cost=d+.12*Math.hypot(b.x-wx,b.z-wz);
       if(cost<best){best=cost;target=b;}
     }
   }
   const [wx,wz]=routes[ri][waypoint%routes[ri].length];
   const dx=(target?.x??wx)-h.x,dz=(target?.z??wz)-h.z,d=Math.hypot(dx,dz);
   const start=performance.now();sim.step(1/60,d>.15?{x:dx/d,z:dz/d}:{x:0,z:0});timeMs+=performance.now()-start;steps++;
   sim.drainEvents();
   if(h.size===24&&reached===null){reached=(tick+1)/60;console.log(JSON.stringify({route:ri,maximumAt:reached}));}
   if(reached!==null&&process.env.FW_GROWTH_STOP_ON_MAX==='1')break;
   if((tick+1)%3600===0){const m={seconds:(tick+1)/60,size:h.size,raw:h.rawMass,clear:h.rawMass/sim.totalMass,eaten:h.eatenCount};marks.push(m);console.log(JSON.stringify({route:ri,...m}));}
 }
 results.push({route:ri,reached,marks,simMs:timeMs,meanStepMs:timeMs/steps});
}
if(process.argv[2]&&!process.argv[2].startsWith('--'))writeFileSync(process.argv[2],JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
if(!process.argv.includes('--measure-only')&&results.some(r=>r.reached===null||r.reached<150||r.reached>210))process.exitCode=1;
