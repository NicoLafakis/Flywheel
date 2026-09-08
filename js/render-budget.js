// Rendering policy only; never return simulation parameters or alter saved settings.
export class RenderBudget {
  constructor() { this.reset(); }
  reset() { this.level=0; this.elapsed=0; this.frames=0; this.recovery=0; }
  sample(dt) {
    if(!Number.isFinite(dt) || dt<=0 || dt>1) {
      this.elapsed=0; this.frames=0; this.recovery=0; return false;
    }
    this.elapsed+=dt; this.frames++;
    if(this.elapsed<2) return false;
    const mean=this.elapsed/this.frames, previous=this.level;
    if(mean>.019) { this.level=Math.min(3,this.level+1); this.recovery=0; }
    else if(mean<.0175) {
      this.recovery+=this.elapsed;
      if(this.recovery>=10) { this.level=Math.max(0,this.level-1); this.recovery=0; }
    } else this.recovery=0;
    this.elapsed=0; this.frames=0;
    return previous!==this.level;
  }
  spec(base) {
    const cap=[Infinity,1.25,.9,.75][this.level];
    return {dpr:Math.min(base.dpr,cap),shadows:base.shadows && this.level===0,
      ambient:base.ambient && this.level<2};
  }
}
