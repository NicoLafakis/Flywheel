// LAB-TOKYO visual review, phase 0 (Nishi-Shinjuku).
// Same pattern as singapore-shots.mjs: a synthetic page on the app origin runs
// the REAL renderer against the REAL sim, and frames are read with toDataURL
// inside the same evaluate() that renders (Playwright's screenshot loses the
// back buffer). Captures the new build ('gallery') AND the shipped Tokyo from
// matched cameras so each angle can be judged side by side.
//
// Run: node tools/pw/lab-tokyo-shots.mjs   (with `python -m http.server 8000`)
import { chromium } from 'file:///C:/programming/nico-apps/Flywheel/tools/pw/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'C:/programming/nico-apps/Flywheel/tools/pw/_lab-tokyo';
const BASE = process.env.FW_BASE || 'http://localhost:8000';
await mkdir(OUT, { recursive: true });

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "./js/vendor/three.module.js" } }</script>
<style>html,body{margin:0;background:#0b1015;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { VoxelSandboxSim, loadScene } from './js/voxelsim.js';
import { VoxelWorld3D } from './js/voxelworld.js';

const scene = new URLSearchParams(location.search).get('scene') || 'gallery';
await loadScene(scene);
const sim = new VoxelSandboxSim({ seed: 'validator', scene });
const canvas = document.getElementById('c');
const world = new VoxelWorld3D(canvas, sim, 'classic', {});
world.resize(canvas.clientWidth, canvas.clientHeight);
world.update(1 / 60, []);

window.__shot = {
  blocks: sim.blocks.length,
  tallest: sim.blocks.reduce((m, b) => Math.max(m, (b.gy + b.fsy) * 0.25), 0),
  shot(view) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    let cam;
    if (view.ortho) {
      const hw = view.span / 2, hh = hw * h / w;
      cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 2000);
    } else {
      cam = new THREE.PerspectiveCamera(view.fov || 55, w / h, 0.5, 2000);
    }
    cam.position.set(view.p[0], view.p[1], view.p[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(view.t[0], view.t[1], view.t[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    world.render(cam);
    return canvas.toDataURL('image/png');
  },
};
window.__shotReady = true;
</script></body></html>`;

const browser = await chromium.launch({ headless: process.env.FW_HEADED !== '1' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

await page.route('**/__labshots.html*', (r) => r.fulfill({ contentType: 'text/html', body: HARNESS }));

const VIEWS = [
  ['plan-ward', { ortho: true, span: 150, p: [-72, 300, -42], t: [-72, 0, -42] }],
  ['tocho-south', { p: [-94, 22, -18], t: [-94, 14, -58] }],
  ['tocho-oblique', { p: [-58, 38, -92], t: [-95, 16, -55] }],
  ['cocoon', { p: [-28, 14, 2], t: [-50, 11, -20] }],
  ['esplanade-chase', { fov: 50, p: [6, 3, 16], t: [-40, 4, 10] }],
  ['ward-wide', { p: [0, 55, 45], t: [-75, 10, -50] }],
];

for (const scene of ['gallery', 'tokyo']) {
  await page.goto(`${BASE}/__labshots.html?scene=${scene}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 60000 });
  const info = await page.evaluate(() => ({ blocks: window.__shot.blocks, tallest: window.__shot.tallest }));
  console.log(`${scene}: blocks=${info.blocks} tallest=${info.tallest.toFixed(1)} m`);
  const tag = scene === 'tokyo' ? '-orig' : '';
  for (const [name, view] of VIEWS) {
    // The shipped Tokyo is denser; keep identical cameras so the comparison is fair.
    const url = await page.evaluate((v) => window.__shot.shot(v), view);
    await writeFile(`${OUT}/${name}${tag}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`  wrote ${name}${tag}.png`);
  }
}

console.log(errs.length ? `PAGE ERRORS (${errs.length}):\n  ${errs.join('\n  ')}` : 'page errors: none');
await browser.close();
