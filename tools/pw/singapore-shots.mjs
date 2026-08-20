// SINGAPORE visual review, phase 1 (BEFORE any wiring exists).
//
// The scene is not registered in SCENE_IMPORTERS yet, so there is no City Select
// path to it and `auckland-playtest.mjs`'s "launch it like a player" approach is
// not available. Instead a synthetic page is served ON THE APP ORIGIN by
// intercepting a route, so every relative module specifier and the `three`
// importmap entry resolve exactly as they do for the real game, and the REAL
// renderer draws the REAL sim — no stub geometry, no second copy of anything.
//
// The prototype patch is the same instrument tools/validate-singapore.mjs uses:
// VoxelSandboxSim's constructor throws by name for a REGISTERED-but-unloaded
// scene, but falls through to `this._buildScene()` for an unknown id, so
// overriding that one method runs the unregistered builder through the genuine
// constructor — real grid ownership, real support solver, real cameraBlockers.
//
// An ORTHOGRAPHIC PLAN comes first and a chase-cam-height shot second: a
// perspective shot from inside the city hides whole districts behind whatever is
// nearest the lens, which is how a missing landmark survives a screenshot review.
//
// Run: node tools/pw/singapore-shots.mjs   (with `python -m http.server 8000`)
import { chromium } from 'file:///C:/programming/nico-apps/Flywheel/tools/pw/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';

const OUT = 'C:/programming/nico-apps/Flywheel/tools/pw/_singapore';
const BASE = process.env.FW_BASE || 'http://localhost:8000';
await mkdir(OUT, { recursive: true });

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "./js/vendor/three.module.js" } }</script>
<style>html,body{margin:0;background:#0b1015;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { VoxelSandboxSim } from './js/voxelsim.js';
import { VoxelWorld3D } from './js/voxelworld.js';
import { buildSingapore } from './js/voxelscene-singapore.js';

VoxelSandboxSim.prototype._buildScene = function () { buildSingapore(this); };
const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'singapore' });
const canvas = document.getElementById('c');
const world = new VoxelWorld3D(canvas, sim, 'classic', {});
// The canvas is 300x150 until CSS lays it out, and the constructor sizes the
// drawing buffer from clientWidth/clientHeight. Without this the whole city
// renders into the top-left corner of the screenshot.
world.resize(canvas.clientWidth, canvas.clientHeight);
// The instanced block meshes are POSED in update(), not in the constructor.
// Rendering without it draws the decor ground layer and nothing else — which
// looks exactly like a scene that built no geometry.
world.update(1 / 60, []);

window.__sg = {
  blocks: sim.blocks.length,
  blockers: sim.cameraBlockers.length,
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
    return true;
  },
};
window.__sgReady = true;
</script></body></html>`;

const browser = await chromium.launch({ headless: process.env.FW_HEADED !== '1' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

await page.route(`${BASE}/__singapore.html`, (r) => r.fulfill({ contentType: 'text/html', body: HARNESS }));
await page.goto(`${BASE}/__singapore.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sgReady, null, { timeout: 60000 });

const info = await page.evaluate(() => ({
  blocks: window.__sg.blocks, blockers: window.__sg.blockers, tallest: window.__sg.tallest,
}));
console.log(`blocks=${info.blocks} blockers=${info.blockers} tallest=${info.tallest.toFixed(1)} m`);

// The bay's centre is about (2, 3). Ortho plan first, then four obliques that
// each put a different district nearest the lens, then a chase-cam-height pass.
const VIEWS = [
  ['plan', { ortho: true, span: 130, p: [2, 300, 3], t: [2, 0, 3] }],
  ['elev-south', { ortho: true, span: 130, p: [2, 25, 260], t: [2, 25, 3] }],
  ['elev-west', { ortho: true, span: 130, p: [-260, 25, 3], t: [2, 25, 3] }],
  ['oblique-sands', { p: [-40, 55, -60], t: [20, 15, 0] }],
  ['oblique-gardens', { p: [70, 50, 90], t: [15, 12, 28] }],
  ['oblique-cbd', { p: [60, 45, 60], t: [-35, 12, 5] }],
  ['oblique-esplanade', { p: [40, 30, -70], t: [-8, 8, -25] }],
  ['chase-bay', { fov: 45, p: [-6, 6, 26], t: [10, 8, -6] }],
  ['chase-grove', { fov: 45, p: [12, 5, 30], t: [32, 14, 26] }],
];

for (const [name, view] of VIEWS) {
  await page.evaluate((v) => window.__sg.shot(v), view);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  wrote ${OUT}/${name}.png`);
}

console.log(errs.length ? `PAGE ERRORS (${errs.length}):\n  ${errs.join('\n  ')}` : 'page errors: none');
await browser.close();
