// IN-GAME skin review for the Sprocket Drive → Closer rework pass.
//
// The contact sheet (tools/skinsheet.mjs) proves the geometry at the shop's
// fixed hero pose; it cannot prove the things that only exist in a live scene:
// the hole mesh scaling every part by radius at SIZE 12, world-space quads
// sitting at y=0.04 over real roads, farBoost at camDist 84, and the
// reduced-motion path. This harness draws the REAL sim through the REAL
// renderer, exactly like singapore-shots.mjs, and swaps the skin on one live
// VoxelWorld3D — the same remove/dispose/makeSkin/add sequence the game's own
// skin-switch code path uses (js/voxelworld.js:4129).
//
// Per skin, three frames: SIZE 1 at rest (near cam), SIZE 12 mid-bite (far
// cam, camDist 84), and SIZE 1 with reduced motion frozen.
//
// Run: node tools/pw/skin-shots.mjs   (with `python -m http.server 8150`)
import { chromium } from 'file:///C:/programming/nico-apps/Flywheel/tools/pw/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'C:/programming/nico-apps/Flywheel/tools/pw/_skin-shots';
const BASE = process.env.FW_BASE || 'http://localhost:8150';
await mkdir(OUT, { recursive: true });

const SKINS = ['sprocket', 'lava', 'pipeline', 'frost', 'radar', 'galaxy',
  'abtest', 'attribution', 'gold', 'chomper', 'shredder', 'eyeballs', 'throat', 'closer'];

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "./js/vendor/three.module.js" } }</script>
<style>html,body{margin:0;background:#0b1015;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { VoxelSandboxSim, loadScene } from './js/voxelsim.js';
import { VoxelWorld3D } from './js/voxelworld.js';
import { makeSkin } from './js/skins.js';

await loadScene('singapore');
const sim = new VoxelSandboxSim({ seed: 'skinshots', scene: 'singapore' });
const canvas = document.getElementById('c');
const world = new VoxelWorld3D(canvas, sim, 'classic', {});
world.resize(canvas.clientWidth, canvas.clientHeight);
world.update(1 / 60, []);

function swapSkin(id) {
  world.holeMesh.remove(world.skin.local);
  world.scene.remove(world.skin.world);
  world.skin.dispose();
  world.skin = makeSkin(id);
  world.holeMesh.add(world.skin.local);
  world.scene.add(world.skin.world);
}

function shot(px, py, pz) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
  const hole = sim.hole;
  cam.position.set(hole.x + px, py, hole.z + pz);
  cam.up.set(0, 1, 0);
  cam.lookAt(hole.x, 0, hole.z);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  world.render(cam);
  return canvas.toDataURL('image/png');
}

window.__skins = {
  setSkin(id) { swapSkin(id); },
  // settle: run n idle frames so time-based poses leave t=0
  settle(n, frozen) {
    world._ambientFrozen = !!frozen;
    for (let i = 0; i < n; i++) world.update(1 / 60, []);
  },
  pose(size, radius, sizeFrac, camDist) {
    const h = sim.hole;
    h.size = size; h.radius = radius; h.sizeFrac = sizeFrac; h.heading = 0.6;
    world._skinCamDist = camDist;
  },
  bite(n) {
    // a real event stream: three meals over n frames, then a beat of settle so
    // the capture lands mid-reaction rather than on the exact event frame
    const h = sim.hole;
    for (let i = 0; i < n; i++) {
      const evs = (i === 2 || i === 10 || i === 18)
        ? [{ type: 'eat', obj: { tier: 4, x: h.x + 2, z: h.z + 1, color: 0xff8040 }, hole: h, gained: 60, chain: 3 }]
        : [];
      world.update(1 / 60, evs);
    }
  },
  shotA() { return shot(5, 6.5, 5); },      // SIZE 1, near
  shotB() { return shot(14, 17, 14); },     // SIZE 12, far
};
window.__ready = true;
</script></body></html>`;

const browser = await chromium.launch({
  args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.route(BASE + '/__skinshots', (route) => route.fulfill({ contentType: 'text/html', body: HARNESS }));
await page.goto(BASE + '/__skinshots', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });

const save = async (name, dataUrl) => {
  await writeFile(`${OUT}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

for (const id of SKINS) {
  await page.evaluate((skinId) => {
    window.__skins.setSkin(skinId);
    window.__skins.pose(1, 1.1, 0, 26);
    window.__skins.settle(90, false);
  }, id);
  await save(`${id}-s1`, await page.evaluate('window.__skins.shotA()'));

  await page.evaluate(() => {
    window.__skins.pose(12, 6.6, 0.5, 84);
    window.__skins.settle(30, false);
    window.__skins.bite(24);
  });
  await save(`${id}-s12`, await page.evaluate('window.__skins.shotB()'));

  await page.evaluate(() => {
    window.__skins.pose(1, 1.1, 0, 26);
    window.__skins.settle(60, true);
  });
  await save(`${id}-rm`, await page.evaluate('window.__skins.shotA()'));

  console.log(id + ': 3 shots');
}

if (pageErrors.length) {
  console.log('PAGE ERRORS: ' + JSON.stringify(pageErrors.slice(0, 10), null, 2));
} else {
  console.log('no page errors');
}
await browser.close();
console.log('done -> ' + OUT);
