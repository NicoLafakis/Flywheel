// AUCKLAND end-to-end playtest: launch the city the way a player does (City
// Select -> PLAY), drive it, and photograph it.
//
// Mobile FIRST, desktop second, and both contexts declare hasTouch/isMobile
// explicitly — a touch-only assumption has shipped an inert control in this
// repo before, so the input dimension is never a baked-in constant here.
//
// Run: node tools/pw/auckland-playtest.mjs   (with `python -m http.server 8000`)
import { chromium } from 'file:///C:/programming/nico-apps/Flywheel/tools/pw/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const OUT = 'C:/programming/nico-apps/Flywheel/tools/pw/_auckland';
const BASE = process.env.FW_BASE || 'http://localhost:8000';
const CASES = [
  { w: 390, h: 844, touch: true, tag: 'mobile' },
  { w: 1440, h: 900, touch: false, tag: 'desktop' },
];

let fails = 0;
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ headless: process.env.FW_HEADED !== '1' });

for (const { w, h, touch, tag } of CASES) {
  console.log(`\n=== ${tag} ${w}x${h} touch=${touch} ===`);
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch,
    deviceScaleFactor: touch ? 2 : 1,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__screens, null, { timeout: 60000 });
  await page.waitForSelector('#boot-splash', { state: 'detached', timeout: 60000 })
    .catch(() => page.evaluate(() => document.getElementById('boot-splash')?.remove()));

  // Auckland is chapter 2: it unlocks on a 100% clear of Sydney inside 300 s.
  // Seed exactly that, so the run under test is the REAL gated path rather
  // than a scene id typed straight into the loader.
  await page.evaluate(() => {
    const save = window.__screens.save;
    save.sandbox = save.sandbox || {};
    save.sandbox.gallery = { runs: 2, completions: 1, bestScore: 4200, bestPercent: 1, bestTime: 210, bestSize: 4 };
    save.sandbox.sydney = { runs: 3, completions: 1, bestScore: 9100, bestPercent: 1, bestTime: 248, bestSize: 5 };
  });
  await page.evaluate(() => window.__screens.showCitySelect(1));
  await page.waitForSelector('.city-card', { state: 'visible' });
  await page.waitForTimeout(600);

  // Reach Auckland through the World Tour sheet, as a player would.
  await page.click('.city-progress-strip');
  await page.waitForSelector('.world-tour-sheet', { state: 'visible' });
  await page.waitForTimeout(300);
  const row = await page.evaluate(() => {
    const r = document.querySelector('.wt-row[data-scene="auckland"]');
    return r ? { locked: r.classList.contains('wt-row--locked'), text: r.textContent.replace(/\s+/g, ' ').trim() } : null;
  });
  check('Auckland has a World Tour row and is unlocked', !!row && !row.locked, row ? row.text.slice(0, 80) : 'missing');
  await page.click('.wt-row[data-scene="auckland"]');
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => ({
    title: document.querySelector('.city-card-title')?.textContent.trim(),
    blocks: document.body.innerText.match(/16[,.]?000/) ? '16,000 shown' : 'block count NOT shown',
    playDisabled: document.querySelector('.city-launch-btn')?.disabled ?? null,
  }));
  check('card shows AUCKLAND with its block count and a live PLAY', /AUCKLAND/i.test(card.title || '') && card.playDisabled === false, JSON.stringify(card));
  await page.screenshot({ path: `${OUT}/${tag}-1-card.png` });

  await page.click('.city-launch-btn');
  await page.waitForFunction(() => window.__sim && window.__sim.blocks && window.__sim.blocks.length > 1000, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  // The Ready Gate ("GO! TAP ANYWHERE") holds the sim at time 0 until the
  // player taps — so a harness that skips it drives a frozen world and reads
  // as a dead map rather than as an undismissed overlay. Tap it, then wait for
  // the clock to actually advance before believing anything downstream.
  const gate = await page.$('#ready-gate');
  if (gate) {
    await page.click('#ready-gate', { position: { x: w / 2, y: h / 2 } }).catch(() => {});
    await page.waitForFunction(() => window.__sim && window.__sim.time > 0, null, { timeout: 15000 });
  }
  check('the Ready Gate dismisses and the sim clock advances', await page.evaluate(() => window.__sim.time > 0));

  const built = await page.evaluate(() => ({
    scene: window.__sim.scene, blocks: window.__sim.blocks.length,
    blockers: window.__sim.cameraBlockers.length, goal: window.__sim.goal?.name,
  }));
  check('the sim that booted is auckland at 16,000 blocks', built.scene === 'auckland' && built.blocks === 16000, JSON.stringify(built));

  // Hero framing + the orthographic plan, taken HERE — on the pristine city,
  // before the drive and the perf loop chew a crater through it — and read back
  // off the canvas inside the same evaluate as the render.
  //
  // page.screenshot() cannot photograph a flown camera: the app's own RAF loop
  // re-renders the chase view between our render and the grab, so the first
  // pass wrote four "hero" shots that were all the same live gameplay frame,
  // within 400 bytes of each other. toDataURL reads the drawing buffer while
  // our frame is still in it, which makes the capture atomic by construction.
  const grab = async (name, fly, arg) => {
    const dataUrl = await page.evaluate(async ([fnSrc, a]) => {
      // eslint-disable-next-line no-new-func
      const cam = await new Function('a', `return (${fnSrc})(a)`)(a);
      window.__world.renderer.render(window.__world.scene, cam);
      return window.__world.renderer.domElement.toDataURL('image/png');
    }, [fly.toString(), arg]);
    await writeFile(`${OUT}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  };
  // The plan camera needs three.js, and the grab helper stringifies its
  // callback — so the import happens here, once, rather than inside a function
  // that has no module scope to import from.
  await page.evaluate(async () => {
    window.__THREE_FOR_PLAN = await import('/js/vendor/three.module.js');
  });
  // [targetX, targetZ, distance, cameraY, lookAtY]. lookAtY is explicit rather
  // than a fixed fraction of cameraY: the Sky Tower runs to y 67 and the first
  // pass sheared its mast off the top of the frame, which is precisely the
  // detail the shot exists to show.
  const heroCam = (a) => {
    const [x, z, d, y, ly] = a;
    const cam = window.__cam.camera;
    cam.position.set(x + d * 0.62, y, z + d * 0.78);
    cam.lookAt(x, ly, z);
    cam.updateProjectionMatrix();
    return cam;
  };
  const heroes = tag === 'desktop' ? [
    ['3a-skytower', [-16, 23, 96, 60, 34]],
    ['3b-wharves', [-6, -26, 46, 34, 6]],
    ['3c-cones', [40, 36, 46, 30, 6]],
    ['3d-ferrybuilding', [-9, -9, 36, 24, 7]],
  ] : [['3a-skytower', [-16, 23, 96, 60, 34]]];
  for (const [name, arg] of heroes) await grab(`${tag}-${name}`, heroCam, arg);
  if (tag === 'desktop') {
    await grab('plan-ortho-topdown', () => {
      const THREE = window.__THREE_FOR_PLAN;
      // Frame the DECLARED bounds, not a guessed half-width. The first pass
      // hard-coded half=62 and derived the vertical from 0.62, which framed
      // 38 m of a 113 m-deep map — a plan that crops is worse than no plan,
      // because it looks authoritative about ground it never showed.
      const r = window.__sim.boundsRect;
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      const aspect = window.innerWidth / window.innerHeight;
      const vert = Math.max((r.maxZ - r.minZ), (r.maxX - r.minX) / aspect) / 2 + 3;
      const horiz = vert * aspect;
      const ortho = new THREE.OrthographicCamera(-horiz, horiz, vert, -vert, 0.5, 600);
      ortho.position.set(cx, 300, cz + 0.001);
      ortho.lookAt(cx, 0, cz);
      ortho.updateProjectionMatrix();
      return ortho;
    }, null);
  }

  // Drive. There is no `move` vector to write: getMove() derives everything
  // from `controls.keys` (the tank scheme — A/D integrate `heading`, W/S
  // throttle along it) or from the touch stick. Writing a made-up field left
  // the hole parked on spawn while the clock ran, which reads exactly like a
  // frozen sim. So hold the REAL throttle key and steer closed-loop by writing
  // `heading` straight at the next waypoint every 100 ms — no A/D turn-rate to
  // integrate, no camera basis in the loop, and the aim is re-derived from the
  // live hole position rather than dead-reckoned.
  const drive = await page.evaluate(async () => {
    const c = window.__controls, sim = window.__sim;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    const startEaten = sim.hole.eatenCount;
    // Up Queen St into the upper CBD blocks -> west across to the Sky Tower
    // podium -> back south to the Quay St frontage. The first leg deliberately
    // runs INTO built frontage rather than along the open plaza lane the hole
    // spawns on: a route that only ever tracks open ground reports eaten=0 and
    // indicts the map for what is really a routing choice.
    const path = [[0, 34], [-16, 30], [-10, 8]];
    c.keys.add('KeyW');
    for (const [tx, tz] of path) {
      const legEnd = performance.now() + 4000;
      while (performance.now() < legEnd) {
        const dx = tx - sim.hole.x, dz = tz - sim.hole.z;
        if (Math.hypot(dx, dz) < 1.5) break;
        // forward = (-sin h, -cos h), so aiming at (dx,dz) is atan2(-dx,-dz).
        c.heading = Math.atan2(-dx, -dz);
        await wait(100);
      }
    }
    c.keys.delete('KeyW');
    await wait(400);
    return {
      elapsed: Math.round(performance.now() - t0),
      eaten: sim.hole.eatenCount - startEaten,
      radius: +sim.hole.radius.toFixed(2),
      size: sim.hole.size,
      pos: [+sim.hole.x.toFixed(1), +sim.hole.z.toFixed(1)],
      nonStatic: sim.blocks.filter((b) => b.state !== 'static').length,
    };
  });
  console.log(`  drive: ${JSON.stringify(drive)}`);
  check('the hole moved and ate real geometry', drive.eaten > 0, `${drive.eaten} blocks`);

  // Step cost, measured in the page against the live sim.
  const perf = await page.evaluate(() => {
    const sim = window.__sim, N = 240;
    const t = performance.now();
    for (let i = 0; i < N; i++) sim.step(1 / 60, { x: 0, z: 0 });
    return +((performance.now() - t) / N).toFixed(3);
  });
  console.log(`  sim.step: ${perf} ms/step (${(1000 / 60).toFixed(1)} ms budget)`);
  check('sim.step inside the 16.7 ms frame budget', perf < 16.7, `${perf} ms`);

  await page.screenshot({ path: `${OUT}/${tag}-4-play.png` });

  check('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
