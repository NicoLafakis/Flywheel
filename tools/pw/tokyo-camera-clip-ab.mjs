// TOKYO chase-camera A/B: does the camera end up INSIDE real geometry?
//
// Ground truth is the VOXEL GRID, never the blocker list — measuring the fix
// against its own data structure would make the OFF arm pass trivially. For
// each pose the camera's own world position (plus a small box around the near
// plane) is looked up in sim.grid, the same fine-cell map probeCellOwnership
// uses, so "inside" means "there is an actual block here".
//
// Two arms, same build, same poses:
//   ON  = the shipped cam.setBlockers(sim.cameraBlockers)
//   OFF = cam.setBlockers([])  — the forced slow path
// The OFF arm MUST fail. A probe that has only ever passed proves nothing.
//
// Every clip is CLASSIFIED by the height of the column it happened in, because
// generateBlockers' contract stops at minH = 6 m: a clip in a >= 6 m column is
// a blocker-coverage defect, a clip in a shorter column is outside what any
// blocker list covers on any scene. Sydney and Auckland run as control arms so
// the sub-6 m class can be seen for what it is — a roster-wide property of the
// 6 m knob, not something Tokyo does.
//
// The level intro parks the camera high and far for >12 s, which would report a
// clean sky pose for every heading; skipIntro() is called and introPhase is
// asserted 'off' before any pose is taken.
//
// Run: node tools/pw/tokyo-camera-clip-ab.mjs   (with python -m http.server 8000)
import { chromium } from 'file:///C:/programming/nico-apps/Flywheel/tools/pw/node_modules/playwright/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = 'C:/programming/nico-apps/Flywheel/tools/pw/_tokyo-camera';
const BASE = process.env.FW_BASE || 'http://localhost:8000';
await mkdir(OUT, { recursive: true });

// Hole positions at the foot of Tokyo's tall landmarks — the places the six
// hand-pushed rects were aimed at, plus the Shinjuku canyon they never covered.
const TOKYO_STATIONS = [
  { id: 'tocho-twins', x: -78, z: -55 },
  { id: 'cocoon-tower', x: -50, z: -20 },
  { id: 'docomo-spire', x: -14, z: 20 },
  { id: 'mori-tower', x: 36, z: -85 },
  { id: 'shinjuku-canyon', x: -60, z: -80 },
  { id: 'kabukicho', x: -20, z: -60 },
  { id: 'shibuya-109', x: -35, z: 55 },
  { id: 'ginza-wako', x: 45, z: -85 },
];
// Control scenes: both are known-clean on the validator's blocker probe, so any
// clipping they show is by definition NOT a coverage defect.
const SYDNEY_STATIONS = [
  { id: 'syd-a', x: 0, z: 0 }, { id: 'syd-b', x: 20, z: 20 },
  { id: 'syd-c', x: -20, z: 10 }, { id: 'syd-d', x: 10, z: -20 },
];
const AUCKLAND_STATIONS = [
  { id: 'akl-a', x: 0, z: 20 }, { id: 'akl-b', x: -16, z: 26 },
  { id: 'akl-c', x: 20, z: 10 }, { id: 'akl-d', x: -10, z: 0 },
];
const HEADINGS = 24; // every 15 deg

const browser = await chromium.launch({ headless: process.env.FW_HEADED !== '1' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__screens, null, { timeout: 60000 });
await page.waitForSelector('#boot-splash', { state: 'detached', timeout: 60000 })
  .catch(() => page.evaluate(() => document.getElementById('boot-splash')?.remove()));

async function boot(scene) {
  await page.evaluate((s) => window.__screens.actions.startVoxelSandbox(s), scene);
  await page.waitForFunction((s) => window.__sim && window.__sim.scene === s && window.__sim.blocks && window.__sim.blocks.length > 1000,
    scene, { timeout: 150000 });
  await page.waitForTimeout(1200);
  const gate = await page.$('#ready-gate');
  if (gate) {
    await page.click('#ready-gate', { position: { x: 720, y: 450 } }).catch(() => {});
    await page.waitForFunction(() => window.__sim && window.__sim.time > 0, null, { timeout: 20000 });
  }
  const b = await page.evaluate(() => {
    window.__cam.skipIntro();
    return { scene: window.__sim.scene, blocks: window.__sim.blocks.length, blockers: window.__sim.cameraBlockers.length, introPhase: window.__cam.introPhase, camY: +window.__cam.camera.position.y.toFixed(2) };
  });
  console.log(`booted ${scene}:`, JSON.stringify(b));
  if (b.introPhase !== 'off') { console.error('INTRO NOT SKIPPED — every pose would be a sky shot'); process.exit(2); }
  return b;
}

const runArm = (arm, stations, headings) => page.evaluate(([armName, sts, nH]) => {
  const sim = window.__sim, cam = window.__cam;
  cam.setBlockers(armName === 'off' ? [] : sim.cameraBlockers);
  cam.skipIntro();
  // Per-1 m-cell tallest block top — footprintTops from tools/validate.mjs:418,
  // built once so each clip can be classified against the 6 m blocker gate.
  const tops = new Map();
  for (const b of sim.blocks) {
    const top = (b.gy + b.fsy) * 0.25;
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fsx) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fsz) * 0.25); cz++) {
        const k = `${cx},${cz}`;
        if (!(tops.get(k) >= top)) tops.set(k, top);
      }
    }
  }
  const solid = (x, y, z) => {
    if (y < 0) return false;
    return sim.grid.get(`${Math.floor(x / 0.25)},${Math.floor(y / 0.25)},${Math.floor(z / 0.25)}`) !== undefined;
  };
  // A near-plane box around the camera, not just its centre point: a camera
  // whose eye is 0.2 m outside a wall still renders the wall's interior.
  const NEAR = 0.4;
  const hitPoint = (p) => {
    for (const dx of [-NEAR, 0, NEAR]) for (const dy of [-NEAR, 0, NEAR]) for (const dz of [-NEAR, 0, NEAR]) {
      if (solid(p.x + dx, p.y + dy, p.z + dz)) return { x: p.x + dx, y: p.y + dy, z: p.z + dz };
    }
    return null;
  };
  const clips = [];
  let total = 0;
  const r = sim.hole.radius;
  for (const st of sts) {
    for (let i = 0; i < nH; i++) {
      total++;
      const heading = (i / nH) * Math.PI * 2;
      // Settle the spring from a common state so both arms see the same input:
      // snap the yaw at the heading, then run 90 fixed steps of the real
      // cam.update with the hole parked at the station.
      cam.yaw = heading;
      for (let f = 0; f < 90; f++) cam.update(1 / 60, st.x, st.z, r, 0, 0, false, heading);
      const p = cam.camera.position;
      const hit = hitPoint(p);
      if (!hit) continue;
      const cell = `${Math.floor(hit.x)},${Math.floor(hit.z)}`;
      clips.push({
        st: st.id, deg: Math.round(heading * 180 / Math.PI),
        camY: +p.y.toFixed(2), cell, columnTop: tops.get(cell) ?? 0,
      });
    }
  }
  const tall = clips.filter((c) => c.columnTop >= 6);
  return { arm: armName, total, clipped: clips.length, tallClips: tall.length, clips };
}, [arm, stations, headings]);

// --- Tokyo, both arms --------------------------------------------------------
const built = await boot('tokyo');
if (built.scene !== 'tokyo' || built.blocks !== 84122) { console.error('wrong scene/block count'); process.exit(2); }
const on = await runArm('on', TOKYO_STATIONS, HEADINGS);
const off = await runArm('off', TOKYO_STATIONS, HEADINGS);
await page.evaluate(() => { window.__cam.setBlockers(window.__sim.cameraBlockers); window.__cam.skipIntro(); });

const summarise = (r) => `${r.clipped}/${r.total} poses inside geometry — ${r.tallClips} of them in a >=6 m column (the class blockers cover), ${r.clipped - r.tallClips} in a shorter one`;
console.log(`\nTOKYO blockers=ON   ${summarise(on)}`);
console.log(`TOKYO blockers=OFF  ${summarise(off)}`);
if (on.clipped) console.log('  ON residual:', on.clips.map((c) => `${c.st}@${c.deg}deg cell ${c.cell} columnTop=${c.columnTop}m camY=${c.camY}`).join('; '));

// --- Screenshots -------------------------------------------------------------
// Read off the drawing buffer inside the same evaluate as the render —
// page.screenshot() cannot photograph a flown camera, the app's RAF loop
// re-renders before the grab lands.
const grab = async (name, fnSrc, arg) => {
  const dataUrl = await page.evaluate(async ([src, a]) => {
    // eslint-disable-next-line no-new-func
    const cam = await new Function('a', `return (${src})(a)`)(a);
    window.__world.renderer.render(window.__world.scene, cam);
    return window.__world.renderer.domElement.toDataURL('image/png');
  }, [fnSrc, arg]);
  await writeFile(`${OUT}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return `${OUT}/${name}.png`;
};
const chaseShot = (a) => {
  const [armName, sx, sz, heading] = a;
  const sim = window.__sim, cam = window.__cam;
  cam.setBlockers(armName === 'off' ? [] : sim.cameraBlockers);
  cam.skipIntro();
  cam.yaw = heading;
  for (let f = 0; f < 90; f++) cam.update(1 / 60, sx, sz, sim.hole.radius, 0, 0, false, heading);
  return cam.camera;
};
const shots = [];
for (const id of ['tocho-twins', 'shinjuku-canyon', 'cocoon-tower']) {
  const s = TOKYO_STATIONS.find((q) => q.id === id);
  // Same pose in both shots: the heading where the OFF arm clipped hardest.
  const worst = off.clips.filter((c) => c.st === id)[0];
  const hd = ((worst ? worst.deg : 0) * Math.PI) / 180;
  shots.push(await grab(`${id}-OFF`, chaseShot.toString(), ['off', s.x, s.z, hd]));
  shots.push(await grab(`${id}-ON`, chaseShot.toString(), ['on', s.x, s.z, hd]));
}
await page.evaluate(() => { window.__cam.setBlockers(window.__sim.cameraBlockers); });
console.log('\nscreenshots:'); for (const s of shots) console.log('  ' + s);

// --- Control scenes ----------------------------------------------------------
// Both pass the validator's blocker probe with 0 uncovered cells, so whatever
// they clip on is the knob's own limit rather than a coverage hole.
const controls = {};
for (const [scene, stations] of [['sydney', SYDNEY_STATIONS], ['auckland', AUCKLAND_STATIONS]]) {
  await boot(scene);
  const r = await runArm('on', stations, HEADINGS);
  controls[scene] = r;
  console.log(`${scene.toUpperCase()} blockers=ON  ${summarise(r)}`);
}

if (errs.length) console.log('\npage errors:', errs.slice(0, 5));
await browser.close();

let bad = 0;
if (on.tallClips !== 0) { console.error(`\nFAIL: tokyo blockers=ON clips inside ${on.tallClips} >=6 m columns — that is a coverage hole`); bad++; }
if (off.tallClips === 0) { console.error('\nFAIL: tokyo blockers=OFF clipped 0 tall columns — the probe is dead, it cannot fail'); bad++; }
console.log(bad ? '\nA/B FAILED' : '\nA/B PASSED (ON has zero >=6 m clips, OFF fails as it must)');
process.exit(bad ? 1 : 0);
