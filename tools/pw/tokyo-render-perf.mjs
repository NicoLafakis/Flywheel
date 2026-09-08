// Deployed, rendered workload. Desktop evidence only: emulation is not a phone.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {cpus,release,totalmem} from 'node:os';
const {chromium}=await import(process.env.FW_PLAYWRIGHT_MODULE || 'file:///C:/Users/lafak/AppData/Roaming/npm/node_modules/playwright/index.mjs');
const base=process.argv[2];assert(base?.startsWith('https://'));
const seconds=Number(process.env.FW_PERF_SECONDS || 300),runs=Number(process.env.FW_PERF_RUNS || 3);
const headful=process.env.FW_HEADFUL==='1';
const out=`tools/pw/_tokyo-remediation/${process.env.FW_CPU_PROFILE?'profile':headful?'headful':'perf'}`;await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:!headful,args:['--use-angle=d3d11','--ignore-gpu-blocklist']});
const results={url:base,seconds,runs,headful,browser:browser.version(),host:{cpu:cpus()[0]?.model,os:release(),ramBytes:totalmem()},errors:[],failed:[],results:[]};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
 const cdp=await context.newCDPSession(page);
 page.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
 page.on('requestfailed',r=>results.failed.push({url:r.url(),error:r.failure()?.errorText}));
 await page.goto(base);await page.locator('#boot-splash').waitFor({state:'detached',timeout:60000});
 await page.waitForFunction(()=>window.__screens?.actions?.startVoxelSandbox,null,{timeout:60000});
 for(let run=0;run<runs;run++) {
  await page.evaluate(()=>__screens.actions.startVoxelSandbox('tokyo'));
  await page.getByRole('button',{name:'Go: start the city'}).waitFor({timeout:60000});
  await page.keyboard.press('Enter');await page.waitForTimeout(5000);await page.evaluate(()=>__cam.skipIntro());
  if(process.env.FW_CPU_PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  await page.evaluate(()=>{
   const sim=__sim,h=sim.hole,controls=__controls;
   let target=null,retarget=-Infinity,waypoint=0;
   const points=[[-22,20],[-53,55],[-95,-55],[-53,-20],[-20,-50],[30,-80],[55,50]];
   controls.getMove=()=>{
    const [wx,wz]=points[waypoint%points.length];
    if(sim.time-retarget>=1 || target?.state==='consumed') {
     retarget=sim.time;if(Math.hypot(h.x-wx,h.z-wz)<10)waypoint++;
     let best=Infinity;target=null;
     for(const b of sim.blocks) {
      if(b.state==='consumed'||b.gy>0||Math.hypot(b.sx-.1,b.sz-.1)>h.radius*1.8)continue;
      const cost=Math.hypot(b.x-h.x,b.z-h.z)+.12*Math.hypot(b.x-wx,b.z-wz);
      if(cost<best){best=cost;target=b;}
     }
    }
    const x=(target?.x??wx)-h.x,z=(target?.z??wz)-h.z,d=Math.hypot(x,z);
    return d>.15?{x:x/d,z:z/d}:{x:0,z:0};
   };
   const gl=__world.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   window.__renderPerf={frames:[],stormFrames:[],stalls:[],costs:{},events:{},powers:{},timeline:[],started:performance.now(),simStart:sim.time,stormSeen:false,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};
   for(const [object,key,label] of [[sim,'step','sim'],[__world,'render','render'],[__world,'update','world'],[__cam,'update','camera']]) {
    const original=object[key].bind(object);object[key]=(...args)=>{const start=performance.now();try{return original(...args);}finally{const costs=__renderPerf.costs;costs[label]=(costs[label]||0)+performance.now()-start;}};
   }
   const quality=__world.setQuality.bind(__world);__world.setQuality=spec=>{quality(spec);__renderPerf.timeline.push({type:'quality',wall:performance.now()-__renderPerf.started,spec});};
   const drain=sim.drainEvents.bind(sim);
   sim.drainEvents=()=>{const events=drain(),p=window.__renderPerf;for(const e of events){p.events[e.type]=(p.events[e.type]||0)+1;if(e.type==='powerup_collect')p.powers[e.powerup.type]=(p.powers[e.powerup.type]||0)+1;if(['powerup_collect','disaster_teleport','quake','growth','storm_active','storm_cleared'].includes(e.type))p.timeline.push({wall:performance.now()-p.started,time:sim.time,type:e.type,power:e.powerup?.type});}return events;};
   let last=performance.now();
   const sample=now=>{
    const p=window.__renderPerf;if(p.stopped)return;
    const dt=now-last;last=now;p.frames.push(dt);
    if(dt>100)p.stalls.push({dt,wall:now-p.started,time:sim.time,size:h.size,storm:sim.stormSystem.state,falling:sim._falling.length,costs:p.costs});
    p.costs={};
    if(sim.stormSystem.state==='active'){p.stormSeen=true;p.stormFrames.push(dt);}
    requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
  });
  for(let elapsed=0;elapsed<seconds;elapsed+=30) {
   await page.waitForTimeout(Math.min(30,seconds-elapsed)*1000);
   console.log(JSON.stringify({run,elapsed:Math.min(seconds,elapsed+30),state:await page.evaluate(()=>({time:__sim.time,size:__sim.hole.size,storm:__sim.stormSystem.state,quality:__quality.levers()}))}));
  }
  const measurement=await page.evaluate(()=>{
   const p=__renderPerf;p.stopped=true;
   const stats=arr=>{if(!arr.length)return null;const a=[...arr].sort((x,y)=>x-y);return {frames:a.length,fps:1000/(arr.reduce((s,v)=>s+v,0)/a.length),p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
   return {all:stats(p.frames),storm:stats(p.stormFrames),stalls:p.stalls,timeline:p.timeline,events:p.events,powers:p.powers,eaten:__sim.hole.eatenCount,stormSeen:p.stormSeen,gpu:p.gpu,simSeconds:__sim.time-p.simStart,size:__sim.hole.size,quality:__quality.levers(),draw:__world.renderer.info.render};
  });
  if(process.env.FW_CPU_PROFILE){const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/run-${run}.cpuprofile`,JSON.stringify(profile));}
  results.results.push(measurement);await page.screenshot({path:`${out}/run-${run}.png`});
  await writeFile(`${out}/result.json`,JSON.stringify(results,null,2));
 }
 await context.close();
}finally{await writeFile(`${out}/result.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results));
assert.deepEqual(results.errors,[]);assert.deepEqual(results.failed,[]);
for(const r of results.results)assert(r.stormSeen&&r.all.fps>=59&&r.all.p95<=18&&r.all.p99<=33.4&&r.all.max<=100,'rendered performance gate failed; see evidence');
