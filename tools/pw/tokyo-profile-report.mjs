import {readFileSync} from 'node:fs';
const dir='tools/pw/_tokyo-remediation/profile';
const p=JSON.parse(readFileSync(`${dir}/run-0.cpuprofile`)),r=JSON.parse(readFileSync(`${dir}/result.json`)).results[0];
const nodes=new Map(p.nodes.map(n=>[n.id,n.callFrame]));let elapsed=0;
const samples=p.samples.map((id,i)=>({time:(elapsed+=p.timeDeltas[i])/1000,id,weight:p.timeDeltas[i]/1000}));
for(const stall of r.stalls) {
 const counts=new Map();
 for(const sample of samples)if(sample.time>=stall.wall-stall.dt-15&&sample.time<=stall.wall+15){const n=nodes.get(sample.id);const label=`${n.functionName || '<anonymous>'} ${n.url?.split('/').at(-1) || ''}:${n.lineNumber+1}`;counts.set(label,(counts.get(label)||0)+sample.weight);}
 console.log(JSON.stringify({stall,nearby:r.timeline.filter(e=>Math.abs(e.wall-stall.wall)<500),cpuMs:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12)}));
}
