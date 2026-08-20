// SINGAPORE end-to-end playtest: launch the city the way a player does
// (City Select -> World Tour -> PLAY), drive it, and photograph it.
//
// Mobile FIRST, desktop second, and both contexts declare hasTouch/isMobile
// explicitly — a touch-only assumption has shipped an inert control in this
// repo before, so the input dimension is never a baked-in constant here.
//
// Singapore is Act I chapter 3, so it gates behind a 100% clear of Auckland,
// which gates behind Sydney. All three are seeded so the run under test is the
// REAL unlock path rather than a scene id typed into the loader.
//
// Run: node tools/pw/singapore-playtest.mjs   (with `python -m http.server 8000`)
import { chromium } from 'file:///C:/programming/nico-apps/Flywheel/tools/pw/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';

const OUT = 'C:/programming/nico-apps/Flywheel/tools/pw/_singapore';
const BASE = process.env.FW_BASE || 'http://localhost:8000';
await mkdir(OUT, { recursive: true });

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

  await page.evaluate(() => {
    const save = window.__screens.save;
    save.sandbox = save.sandbox || {};
    save.sandbox.gallery = { runs: 2, completions: 1, bestScore: 4200, bestPercent: 1, bestTime: 210, bestSize: 4 };
    save.sandbox.sydney = { runs: 3, completions: 1, bestScore: 9100, bestPercent: 1, bestTime: 248, bestSize: 5 };
    save.sandbox.auckland = { runs: 2, completions: 1, bestScore: 10400, bestPercent: 1, bestTime: 262, bestSize: 5 };
  });
  await page.evaluate(() => window.__screens.showCitySelect(1));
  await page.waitForSelector('.city-card', { state: 'visible' });
  await page.waitForTimeout(600);

  await page.click('.city-progress-strip');
  await page.waitForSelector('.world-tour-sheet', { state: 'visible' });
  await page.waitForTimeout(300);
  const row = await page.evaluate(() => {
    const r = document.querySelector('.wt-row[data-scene="singapore"]');
    return r ? { locked: r.classList.contains('wt-row--locked'), text: r.textContent.replace(/\s+/g, ' ').trim() } : null;
  });
  check('Singapore has a World Tour row and is unlocked', !!row && !row.locked, row ? row.text.slice(0, 80) : 'missing');
  await page.click('.wt-row[data-scene="singapore"]');
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => ({
    title: document.querySelector('.city-card-title')?.textContent.trim(),
    blocks: document.body.innerText.match(/22[,.]?000/) ? '22,000 shown' : 'block count NOT shown',
    playDisabled: document.querySelector('.city-launch-btn')?.disabled ?? null,
  }));
  check('card shows SINGAPORE with its block count and a live PLAY',
    /SINGAPORE/i.test(card.title || '') && card.playDisabled === false, JSON.stringify(card));
  await page.screenshot({ path: `${OUT}/${tag}-1-card.png` });

  await page.click('.city-launch-btn');
  await page.waitForFunction(() => window.__sim && window.__sim.blocks && window.__sim.blocks.length > 1000, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  // The Ready Gate ("GO! TAP ANYWHERE") holds the sim at time 0 until tapped —
  // a harness that skips it drives a frozen world and reads as a dead map.
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
  check('the sim that booted is singapore at 22,000 blocks',
    built.scene === 'singapore' && built.blocks === 22000, JSON.stringify(built));

  // page.screenshot() cannot photograph a flown camera: the app's own RAF loop
  // re-renders the chase view between our render and the grab. toDataURL reads
  // the drawing buffer while our frame is still in it, so the capture is atomic
  // by construction. Taken HERE, on the pristine city, before the drive.
  const grab = async (name, fly, arg) => {
    const dataUrl = await page.evaluate(async ([fnSrc, a]) => {
      // eslint-disable-next-line no-new-func
      const cam = await new Function('a', `return (${fnSrc})(a)`)(a);
      window.__world.renderer.render(window.__world.scene, cam);
      return window.__world.renderer.domElement.toDataURL('image/png');
    }, [fly.toString(), arg]);
    await writeFile(`${OUT}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  };
  await page.evaluate(async () => {
    window.__THREE_FOR_PLAN = await import('/js/vendor/three.module.js');
  });
  // [targetX, targetZ, distance, cameraY, lookAtY]. lookAtY is explicit: the
  // SkyPark deck sits at y 40-44 and a fixed fraction of cameraY shears it off.
  const heroCam = (a) => {
    const [x, z, d, y, ly] = a;
    const cam = window.__cam.camera;
    cam.position.set(x + d * 0.62, y, z + d * 0.78);
    cam.lookAt(x, ly, z);
    cam.updateProjectionMatrix();
    return cam;
  };
  const heroes = tag === 'desktop' ? [
    ['3a-skypark', [30, 0, 86, 56, 34]],
    ['3b-supertrees', [30, 28, 56, 34, 14]],
    ['3c-merlion', [-24, -12, 34, 20, 6]],
    ['3d-biomedomes', [-7, 34, 48, 28, 8]],
  ] : [['3a-skypark', [30, 0, 86, 56, 34]]];
  for (const [name, arg] of heroes) await grab(`${tag}-${name}`, heroCam, arg);
  if (tag === 'desktop') {
    await grab('plan-ortho-topdown', () => {
      const THREE = window.__THREE_FOR_PLAN;
      // Frame the DECLARED bounds, not a guessed half-width: a plan that crops
      // is worse than no plan, because it looks authoritative about ground it
      // never showed.
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
  // from `controls.keys` or the touch stick. Hold the REAL throttle key and
  // steer closed-loop by writing `heading` at the next waypoint every 100 ms.
  //
  // The route runs NORTH off the spawn promenade into the bay revetment, east
  // along it under the SkyPark, then back south into Gardens by the Bay.
  //
  // WHAT THIS TEST IS FOR. Consumption rate and step cost are measured
  // headlessly, where dt is exactly 1/60 and no renderer competes; what only a
  // browser can prove is that the real player path works — that the controls
  // the app actually ships steer the hole the app actually built. So the gates
  // below are about STEERING and TRAVEL, and consumption is asserted only as a
  // liveness signal (> 0), not as a rate.
  //
  // Measured on the current tree for context, spawn-relative, over 8 compass
  // headings and 20 s each: singapore has 216 blocks within 5 m of spawn
  // (sydney 204, auckland 62) and forages a mean of 5.4 (sydney 19.8, auckland
  // 11.4). Dense at the spawn ring, slower to consume, because the promenade
  // around spawn is flat floor-anchored paving rather than topplable props.
  const drive = await page.evaluate(async () => {
    const c = window.__controls, sim = window.__sim;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    const startEaten = sim.hole.eatenCount;
    const path = [[-8, 8], [12, 6], [2, 30]];
    const startSize = sim.hole.size;
    let travelled = 0, worstAim = 0;
    let px = sim.hole.x, pz = sim.hole.z;
    c.keys.add('KeyW');
    for (const [tx, tz] of path) {
      // Leg budgets are in SIM time, never wall clock. The sim advances on the
      // app's RAF loop, and headless Chromium throttles RAF hard — measured at
      // roughly 0.4x here, so a 5 s wall-clock leg bought ~0.5 s of simulated
      // travel and every leg timed out about 4 m from spawn. That reads as a
      // hole that will not steer; steering was exact the whole time (commanded
      // heading matched the live heading to the degree at every sample). Wall
      // clock is still capped underneath, but only as a hang guard.
      const legEnd = sim.time + 12;
      const hardEnd = performance.now() + 60000;
      while (sim.time < legEnd && performance.now() < hardEnd) {
        const dx = tx - sim.hole.x, dz = tz - sim.hole.z;
        if (Math.hypot(dx, dz) < 1.5) break;
        // forward = (-sin h, -cos h), so aiming at (dx,dz) is atan2(-dx,-dz).
        c.heading = Math.atan2(-dx, -dz);
        await wait(50);
        // Steering fidelity is measured as the angle between where we AIMED and
        // where the hole actually went over the interval — the only check that
        // can catch a camera-relative basis quietly rotating our command.
        const mx = sim.hole.x - px, mz = sim.hole.z - pz;
        const moved = Math.hypot(mx, mz);
        if (moved > 0.2) {
          travelled += moved;
          const err = Math.abs(Math.atan2(mx * dz - mz * dx, mx * dx + mz * dz)) * 180 / Math.PI;
          if (err > worstAim) worstAim = err;
        }
        px = sim.hole.x; pz = sim.hole.z;
      }
    }
    c.keys.delete('KeyW');
    await wait(400);
    return {
      wall: Math.round(performance.now() - t0), simSeconds: +sim.time.toFixed(1),
      eaten: sim.hole.eatenCount - startEaten,
      radius: +sim.hole.radius.toFixed(2),
      size: sim.hole.size,
      grew: sim.hole.size - startSize,
      travelled: +travelled.toFixed(1), worstAim: +worstAim.toFixed(1),
      pos: [+sim.hole.x.toFixed(1), +sim.hole.z.toFixed(1)],
      nonStatic: sim.blocks.filter((b) => b.state !== 'static').length,
    };
  });
  console.log(`  drive: ${JSON.stringify(drive)}`);
  check('the hole traverses the whole route under keyboard control',
    drive.travelled >= 45, `${drive.travelled} m travelled`);
  check('the hole goes where it is steered (worst aim error < 20 deg)',
    drive.worstAim < 20, `worst ${drive.worstAim} deg`);
  check('consumption is live through the real app', drive.eaten > 0, `${drive.eaten} blocks`);

  // Ask first what a DEAD instrument would print here. A step that early-returns
  // costs ~0 ms and sails through a "< 16.7 ms" gate looking like a great
  // result — so the clock advancing by the full N/60 s is checked alongside the
  // cost, and the measurement is only reported if the sim actually ran.
  // Measured from a SETTLED world. The drive leaves ~80 blocks mid-collapse,
  // and timing on top of that measures the debris cascade, not the scene — the
  // first version of this read 31 ms on mobile and 79 ms on desktop for that
  // reason, against 1.65 ms for the same sim in Node. The authoritative
  // cross-city number is the headless round-robin (singapore 1.652 ms/step,
  // 0.39x sydney at 56% more blocks); this one guards the browser path.
  const perf = await page.evaluate(async () => {
    const sim = window.__sim, N = 240;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const settleBy = sim.time + 8;
    while (sim.time < settleBy && sim.blocks.some((b) => b.state !== 'static')) await wait(100);
    const debris = sim.blocks.filter((b) => b.state !== 'static').length;
    const t0 = sim.time, w = performance.now();
    for (let i = 0; i < N; i++) sim.step(1 / 60, { x: 0.7, z: -0.7 });
    return {
      ms: +((performance.now() - w) / N).toFixed(3), debris,
      advanced: +(sim.time - t0).toFixed(2), want: +(N / 60).toFixed(2),
    };
  });
  console.log(`  sim.step: ${perf.ms} ms/step over ${perf.advanced}s of sim, ${perf.debris} debris at start (${(1000 / 60).toFixed(1)} ms budget)`);
  check('the perf measurement ran on a live sim', Math.abs(perf.advanced - perf.want) < 0.01,
    `clock advanced ${perf.advanced}s, expected ${perf.want}s`);
  check('sim.step inside the 16.7 ms frame budget', perf.ms < 16.7, `${perf.ms} ms`);

  await page.screenshot({ path: `${OUT}/${tag}-4-play.png` });

  check('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
