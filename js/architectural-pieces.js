// Consolidate only inside authored floor bays. Equal, adjoining faces merge;
// openings, finish changes, storeys and building boundaries cannot disappear.
export function architecturalPieces(records,{id,origin=[0,0],bay=3,storey=3}) {
  let rows=records.map((r,index)=>{
    const size=Array.isArray(r.size)?[...r.size]:[r.size,r.size,r.size];
    return {...r,index,size,tileSize:[...size],sourceVolumes:[size[0]*size[1]*size[2]],assemblyId:id};
  });
  const pos=['x','y','z'];
  const group=r=>[r.mat,r.color,r.surface,Math.floor((r.x-origin[0])/bay),Math.floor(r.y/storey),Math.floor((r.z-origin[1])/bay)];
  for(const axis of [0,2,1]) {
    const groups=new Map();
    for(const r of rows) {
      const key=JSON.stringify([...group(r),...pos.flatMap((p,i)=>i===axis?[]:[r[p],r.size[i]])]);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(r);
    }
    rows=[];
    for(const list of groups.values()) {
      list.sort((a,b)=>a[pos[axis]]-b[pos[axis]] || a.index-b.index);
      let last=null;
      for(const r of list) {
        const edge=r[pos[axis]]+r.size[axis];
        const limit=axis===1?storey:bay;
        const start=axis===1?0:origin[axis===0?0:1];
        const withinBay=Math.floor((r[pos[axis]]-start)/limit)===Math.floor((edge-start-1e-6)/limit);
        if(last && withinBay && last[pos[axis]]+last.size[axis]===r[pos[axis]] && last.size[axis]+r.size[axis]<=limit) {
          last.size[axis]+=r.size[axis];last.index=Math.min(last.index,r.index);
          last.sourceVolumes.push(...r.sourceVolumes);
        } else {last=r;rows.push(r);}
      }
    }
  }
  return rows.sort((a,b)=>a.index-b.index).map(({index,...r})=>r);
}

// The caller supplies the architectural footprint and bay spacing. Existing
// builders keep their silhouettes and surface choices; only their atom size changes.
export function buildArchitecturalAssembly(sim,options,build) {
  if(sim.geometryVersion!==2) return build();
  const records=[];
  const original=sim._block;
  sim._block=(x,y,z,mat,size=1,color,surface)=>{records.push({x,y,z,mat,size,color,surface});};
  try {build();} finally {sim._block=original;}
  for(const r of architecturalPieces(records,options)) {
    const b=sim._block(r.x,r.y,r.z,r.mat,r.size,r.color,r.surface);
    b.assemblyId=r.assemblyId;
    b.tileSize=r.tileSize;
    b.basePoints=r.sourceVolumes.reduce((sum,v)=>sum+Math.max(10,Math.round(b.mat.mass*v*25)),0);
  }
}
