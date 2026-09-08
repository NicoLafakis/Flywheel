// Presentation clock only. Activation, durations and rewards stay in sim.step.
const MAJOR = new Set(['quake','titan','vortex']);
const ease = t => t*t*(3-2*t);
export class PowerPresentation {
  constructor(ports={}) {this.ports=ports;this.active=null;}
  get blocking() {return !!this.active?.blocking;}
  start(power,{competitive=false,reducedMotion=false}={}) {
    const blocking=MAJOR.has(power.type) && !competitive && !reducedMotion;
    if(this.active) {
      if(this.active.blocking || !blocking) return false;
      // A brief routine toast must never swallow the next major collection.
      this.cancel();
    }
    this.active={power,time:0,blocking,duration:blocking?2.4:.65};
    // Arm before calling external presentation code, which may skip immediately.
    this.ports.begin?.(this.sample());
    return true;
  }
  sample() {
    const a=this.active;if(!a)return null;
    const t=a.time;
    if(!a.blocking)return {power:a.power,phase:'brief',intensity:Math.sin(Math.PI*Math.min(1,t/.65)),camera:null};
    const phase=t<.35-1e-9?'anticipation':t<1.25-1e-9?'charge':t<1.5-1e-9?'release':'return';
    const charge=Math.max(0,Math.min(1,(t-.35)/.9));
    const back=ease(Math.max(0,Math.min(1,(t-1.5)/.9)));
    const inward=a.power.type==='vortex',ground=a.power.type==='quake';
    return {power:a.power,phase,intensity:phase==='return'?1-back:charge,
      camera:{yaw:(inward?.65:-.55)*(1-back),pitch:(ground?.38:.48)+charge*.12,
        distance:inward?4-charge:3+charge,blend:1-back}};
  }
  step(dt) {
    if(!this.active)return;
    this.active.time+=Math.max(0,Number.isFinite(dt)?dt:0);
    if(this.active.time>=this.active.duration-1e-9){this.cancel();return;}
    this.ports.frame?.(this.sample());
  }
  cancel() {
    if(!this.active)return;
    const previous=this.active;this.active=null;
    this.ports.end?.(previous);
  }
}
