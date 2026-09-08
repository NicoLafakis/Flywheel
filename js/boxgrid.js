// Bounds-backed occupancy for architectural pieces. A tall column costs one
// record per horizontal bucket, not one allocation per interior fine cell.
const CELL = 16; // four metres, expressed in the existing quarter-metre grid
const bucketKey = (x, z) => (x + 32768) * 65536 + z + 32768;
const inside = (b,x,y,z) => x>=b.gx && x<b.gx+b.fsx && y>=b.gy && y<b.gy+b.fsy && z>=b.gz && z<b.gz+b.fsz;
const cellKey = (x,y,z) => `${x},${y},${z}`;
export class BoxGrid {
  constructor() { this.buckets=new Map(); this.blocks=new Set(); this.edits=new Map(); this.overlaps=new WeakSet(); }
  _keys(b) {
    const keys=[];
    for(let x=Math.floor(b.gx/CELL);x<=Math.floor((b.gx+b.fsx-1)/CELL);x++)
      for(let z=Math.floor(b.gz/CELL);z<=Math.floor((b.gz+b.fsz-1)/CELL);z++) keys.push(bucketKey(x,z));
    return keys;
  }
  addBlock(b) {
    if(this.blocks.has(b)) return;
    for(const other of this.range(b.gx,b.gy,b.gz,b.gx+b.fsx,b.gy+b.fsy,b.gz+b.fsz)) {
      this.overlaps.add(b);this.overlaps.add(other);
    }
    this.blocks.add(b);
    for(const key of this._keys(b)) {
      let bucket=this.buckets.get(key);
      if(!bucket) this.buckets.set(key,bucket=[]);
      bucket.push(b);
    }
  }
  removeBlock(b) {
    if(!this.blocks.delete(b)) return;
    for(const key of this._keys(b)) {
      const bucket=this.buckets.get(key);
      const i=bucket?.indexOf(b) ?? -1;
      if(i>=0) bucket.splice(i,1);
      if(bucket?.length===0) this.buckets.delete(key);
    }
  }
  getCell(x,y,z) {
    if(this.edits.size) { const key=cellKey(x,y,z); if(this.edits.has(key)) return this.edits.get(key); }
    const bucket=this.buckets.get(bucketKey(Math.floor(x/CELL),Math.floor(z/CELL)));
    if(bucket) for(let i=bucket.length-1;i>=0;i--) if(inside(bucket[i],x,y,z)) return bucket[i];
  }
  *range(x0,y0,z0,x1,y1,z1) {
    const seen=new Set();
    for(let x=Math.floor(x0/CELL);x<=Math.floor((x1-1)/CELL);x++)for(let z=Math.floor(z0/CELL);z<=Math.floor((z1-1)/CELL);z++) {
      const bucket=this.buckets.get(bucketKey(x,z));if(!bucket)continue;
      for(const b of bucket) {
        if(seen.has(b))continue;seen.add(b);
        if(b.gx<x1&&b.gx+b.fsx>x0&&b.gy<y1&&b.gy+b.fsy>y0&&b.gz<z1&&b.gz+b.fsz>z0)yield b;
      }
    }
  }
  supportUnder(x,z,sx,sz,cy,maxTop) {
    if(this.edits.size)return undefined;
    let top=0;
    for(const b of this.range(x,0,z,x+sx,cy+1,z+sz)) {
      if(this.overlaps.has(b))return undefined;
      const candidate=(b.gy+b.fsy)*.25;
      if((b.state==='static'||b.state==='unstable')&&candidate<=maxTop&&candidate>top)top=candidate;
    }
    return top;
  }
  contact(body,vx,vz) {
    if(this.edits.size)return undefined;
    const fx=Math.round(body.x/.25-body.fsx/2),fy=Math.round(body.y/.25-body.fsy/2),fz=Math.round(body.z/.25-body.fsz/2);
    const xd=Math.abs(vx)>Math.abs(vz),sgn=(xd?vx:vz)>=0?1:-1;
    const fixed=xd?(sgn>0?fx+body.fsx:fx-1):(sgn>0?fz+body.fsz:fz-1);
    const vMax=Math.max(body.fsy,body.fsz);
    let hit=null,rank=Infinity;
    for(const b of this.range(fx-1,fy-1,fz-1,fx+body.fsx+1,fy+body.fsy,fz+body.fsz+1)) {
      if(this.overlaps.has(b))return undefined;
      if(b===body||(b.state!=='static'&&b.state!=='unstable'))continue;
      const u=Math.max(0,(xd?b.gz-fz:b.gx-fx)),v=Math.max(0,b.gy-fy);
      const side=xd?fixed>=b.gx&&fixed<b.gx+b.fsx:fixed>=b.gz&&fixed<b.gz+b.fsz;
      const uEnd=xd?Math.min(body.fsz,b.gz+b.fsz-fz):Math.min(body.fsx,b.gx+b.fsx-fx);
      if(side&&u<uEnd&&v<Math.min(body.fsy,b.gy+b.fsy-fy)) {
        const r=(u*vMax+v)*2;if(r<rank){rank=r;hit=b;}
      }
      const bu=Math.max(0,b.gx-fx),bv=Math.max(0,b.gz-fz);
      if(fy-1>=b.gy&&fy-1<b.gy+b.fsy&&bu<Math.min(body.fsx,b.gx+b.fsx-fx)&&bv<Math.min(body.fsz,b.gz+b.fsz-fz)) {
        const r=(bu*vMax+bv)*2+1;if(r<rank){rank=r;hit=b;}
      }
    }
    return hit;
  }
  setCell(x,y,z,b) { this.edits.set(cellKey(x,y,z),b); return this; }
  deleteCell(x,y,z) { const had=this.getCell(x,y,z)!==undefined; this.edits.set(cellKey(x,y,z),undefined); return had; }
  get(key) { return this.getCell(...key.split(',').map(Number)); }
  has(key) { return this.get(key)!==undefined; }
  set(key,value) { return this.setCell(...key.split(',').map(Number),value); }
  delete(key) { return this.deleteCell(...key.split(',').map(Number)); }
  clear() { this.buckets.clear();this.blocks.clear();this.edits.clear(); }
  supportBelow(x,z,cy,maxTop) {
    const bucket=this.buckets.get(bucketKey(Math.floor(x/CELL),Math.floor(z/CELL)));
    const occluded=bucket?.some(b=>this.overlaps.has(b)&&x>=b.gx&&x<b.gx+b.fsx&&z>=b.gz&&z<b.gz+b.fsz);
    if(this.edits.size || occluded) {
      for(let y=cy;y>=0;) {
        const b=this.getCell(x,y,z);
        if(!b || (b.state!=='static' && b.state!=='unstable')) { y--;continue; }
        const top=(b.gy+b.fsy)*0.25;
        if(top<=maxTop) return top;
        y=b.gy-1;
      }
      return 0;
    }
    let top=0;
    if(bucket) for(const b of bucket) {
      if(b.gy>cy || b.gy+b.fsy<=0 || x<b.gx || x>=b.gx+b.fsx || z<b.gz || z>=b.gz+b.fsz) continue;
      if(b.state!=='static' && b.state!=='unstable') continue;
      const candidate=(b.gy+b.fsy)*0.25;
      if(candidate<=maxTop && candidate>top) top=candidate;
    }
    return top;
  }
  // Compatibility iteration is lazy; gameplay uses bounds and point queries.
  *entries() {
    for(const b of this.blocks) for(let x=b.gx;x<b.gx+b.fsx;x++)for(let y=b.gy;y<b.gy+b.fsy;y++)for(let z=b.gz;z<b.gz+b.fsz;z++) {
      const key=cellKey(x,y,z);
      if(!this.edits.has(key) && this.getCell(x,y,z)===b) yield [key,b];
    }
    for(const [key,b] of this.edits) if(b!==undefined) yield [key,b];
  }
  *keys() { for(const [key] of this.entries()) yield key; }
  *values() { for(const [,value] of this.entries()) yield value; }
  [Symbol.iterator]() { return this.entries(); }
  forEach(fn,thisArg) { for(const [key,value]of this) fn.call(thisArg,value,key,this); }
  get size() { let n=0;for(const unused of this.entries()) n++;return n; }
  get storageEntries() { let n=this.edits.size;for(const bucket of this.buckets.values()) n+=bucket.length;return n; }
}
