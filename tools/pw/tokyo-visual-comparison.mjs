import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.FW_PLAYWRIGHT_MODULE || 'file:///C:/Users/lafak/AppData/Roaming/npm/node_modules/playwright/index.mjs');
const urls=process.argv.slice(2);assert.equal(urls.length,2);assert(urls.every(u=>u.startsWith('https://')));
const out='tools/pw/_tokyo-remediation/comparison';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist']});
const evidence=[];
try {
 for(let i=0;i<urls.length;i++) {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
  await page.goto(urls[i]);await page.locator('#boot-splash').waitFor({state:'detached',timeout:60000});
  await page.waitForFunction(()=>window.__screens?.actions?.startVoxelSandbox,null,{timeout:60000});
  await page.evaluate(()=>__screens.actions.startVoxelSandbox('tokyo'));
  await page.getByRole('button',{name:'Go: start the city'}).waitFor({timeout:60000});
  await page.keyboard.press('Enter');await page.waitForTimeout(5000);
  await page.evaluate(()=>{__cam.skipIntro();__cam.update=()=>{};document.querySelector('#hud').style.visibility='hidden';});
  for(const [name,x,z,height,offset] of [['whole-city',0,0,190,160],['shinjuku',-72,-50,65,58],['alleys',5,-50,55,50],['terminal',0,0,65,60],['shibuya',-53,55,55,50],['shrine',53,50,45,40]]) {
   await page.evaluate(({x,z,height,offset})=>{const c=__cam.camera;c.position.set(x,height,z+offset);c.fov=50;c.lookAt(x,0,z);c.updateProjectionMatrix();},{x,z,height,offset});
   await page.waitForTimeout(100);await page.screenshot({path:`${out}/${i===0?'before':'after'}-${name}.png`});
  }
  evidence.push({url:urls[i],blocks:await page.evaluate(()=>__sim.blocks.length),errors});assert.deepEqual(errors,[]);await context.close();
 }
}finally{await writeFile(`${out}/result.json`,JSON.stringify(evidence,null,2));await browser.close();}
console.log(JSON.stringify(evidence));
