import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../js/camera.js',import.meta.url),'utf8').replace("from 'three'",`from '${new URL('../js/vendor/three.module.js',import.meta.url).href}'`);
const {ChaseCamera}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const c=new ChaseCamera(390/844);
assert.equal(typeof c.setFixedGameplayYaw,'function');
c.setFollowDirection(true); c.setFixedGameplayYaw(0);
for(let i=0;i<240;i++) {
 c.update(1/60,Math.sin(i/20)*5,Math.cos(i/20)*5,1,0.1,0,true,i/20);
 assert.equal(c.yaw,0,'normal movement and orbit cannot rotate the view');
}
c.yaw=2.4; c.update(1/60,0,0,1,0,0,false,2.4);
assert.equal(c.yaw,0,'restores orientation after presentation');
c.powerShot={yaw:.6,pitch:.45,distance:3,blend:1};
c.update(1/60,0,0,1,0,0,false,0);assert.equal(c.yaw,.6,'power presentation can frame its shot');
c.powerShot=null;c.update(1/60,0,0,1,0,0,false,0);assert.equal(c.yaw,0);
assert(c.camera.fov>=60,'portrait FOV must survive update');
assert(c.camera.position.distanceTo(c.target)>12,'normal view shows city context');
const zoom=new ChaseCamera(390/844);zoom.setFixedGameplayYaw(0);
const settle=()=>{for(let i=0;i<120;i++)zoom.update(1/60,0,0,1,0,0,false,0);};
settle();const normalDistance=zoom.camera.position.distanceTo(zoom.target);
zoom.update(1/60,0,0,1,0,-3,false,0);settle();
const nearDistance=zoom.camera.position.distanceTo(zoom.target);
assert(nearDistance<normalDistance*.95,'context framing must still allow visible zoom in');
zoom.update(1/60,0,0,1,0,6,false,0);settle();
assert(zoom.camera.position.distanceTo(zoom.target)>normalDistance*1.05,'zoom out remains visible');
console.log('ALL PASS fixed gameplay camera');
