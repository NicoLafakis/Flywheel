'use strict';
// T-901 single run: one ranked 90-second Chicago run on an emulated Pixel 5,
// driven closed-loop, with per-frame instrumentation written to a JSON file.
//
// This is the instrument described in
// .wiki/findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md section 2.
// It is preserved verbatim in every respect the measurement depends on:
//
//   * Playwright devices['Pixel 5'] - 393x727 CSS px, DPR 2.75, isMobile,
//     hasTouch, Pixel-5 UA. hasTouch is load-bearing: the floating stick is
//     pointer-driven and a mouse profile would test a different control path.
//   * CDP Emulation.setCPUThrottlingRate, set BEFORE page.goto and held for the
//     whole session. --throttle=1 is the control arm, not a target.
//   * A fresh browser and a fresh profile per run, so every run starts on a
//     fresh v17 save with qualityChosen:false and gets the device default tier
//     (LOW on a coarse-pointer profile) - what a real phone gets on first play.
//   * Real GPU, not SwiftShader. The renderer string is recorded so the reader
//     can check; a SwiftShader run is not comparable to any of these numbers.
//   * A closed-loop synthetic drive. pointerdown at screen centre arms the
//     stick, then ONE pointermove per rendered frame steering toward a
//     5-waypoint circuit derived from the scene's own block extents. The stick
//     angle is computed against the live latched basis (__controls._basisYaw)
//     and the ring's measured throw (__controls._joyThrow) - the real steering
//     contract. A held key would steer relative to wherever the camera happens
//     to be pointing and scrape the bounds clamp, which proves nothing.
//
// Usage (see README.md; normally you want tools/perf/t901.cjs instead):
//   node tools/perf/t901-run.cjs --label=a4x-1 --throttle=4 --out=run.json
//
// Flags:
//   --label=NAME       run label recorded in the JSON (default "run")
//   --throttle=N       CDP CPU throttling rate (default 4; 1 = control arm)
//   --out=FILE         where to write the run JSON (default ./<label>.json)
//   --rounds=N         force sim.tune.contactRounds at run start (T-901's own
//                      predeclared fallback arm). Omit for the shipping tune.
//   --tier=low|high    force a quality tier instead of the device default
//   --max-wait=SEC     give up on the run after this much wall clock (default 900)
//   --max-ticks=N      SMOKE ONLY. End the drive early at N ranked ticks and
//                      stamp the output truncated:true. Not a measurement.
//   --port=N           static server port (default 8791)
//   --url=URL          measure an already-running server instead of starting one
//   --no-serve         do not start a server (the orchestrator already did)
//   --server-kind=K    provenance only: which server the orchestrator started
//   --headed           run headed, for watching the drive

const fs = require('fs');
const path = require('path');
const { parseArgs, requirePlaywright, startStaticServer, gitHead, sleep } = require('./lib.cjs');

const args = parseArgs(process.argv.slice(2));
const LABEL = args.label || 'run';
const THROTTLE = Number(args.throttle != null ? args.throttle : 4);
const OUT = path.resolve(args.out || (LABEL + '.json'));
const FORCE_TIER = args.tier || '';
const ROUNDS = args.rounds != null ? Number(args.rounds) : null;
const MAX_WAIT = Number(args['max-wait'] || 900);
const MAX_TICKS = args['max-ticks'] != null ? Number(args['max-ticks']) : 0;
const PORT = Number(args.port || 8791);
const HARNESS_VERSION = 1;

(async () => {
  const { chromium, devices } = requirePlaywright();

  let server = null;
  let base = args.url || null;
  if (!base) {
    if (args['no-serve']) base = 'http://127.0.0.1:' + PORT;
    else { server = await startStaticServer({ port: PORT }); base = server.url; }
  }
  const URL = base.replace(/\/$/, '') + '/index.html';

  const out = {
    harnessVersion: HARNESS_VERSION,
    label: LABEL,
    throttle: THROTTLE,
    forceTier: FORCE_TIER,
    forcedRounds: ROUNDS,
    maxTicks: MAX_TICKS || null,
    truncated: false,
    commit: gitHead(),
    url: URL,
    serverKind: server ? server.kind : (args['server-kind'] || 'external'),
    startedAt: new Date().toISOString(),
  };

  const browser = await chromium.launch({
    headless: !args.headed,
    // Without these, headless Chromium falls back to SwiftShader and every
    // WebGL timing below becomes meaningless. out.gl records what we got.
    args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => { (out.pageErrors = out.pageErrors || []).push(String(e).slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') (out.consoleErrors = out.consoleErrors || []).push(m.text().slice(0, 300)); });

  // Time-to-offer, measured in the page rather than by polling from node: the
  // title screen is interactive the moment the RUN button exists.
  await page.addInitScript(() => {
    window.__t901ready = null;
    const scan = () => {
      if (window.__t901ready !== null) return true;
      for (const b of document.querySelectorAll('button')) {
        if (/RUN CHICAGO/i.test(b.textContent || '')) { window.__t901ready = performance.now(); return true; }
      }
      return false;
    };
    const mo = new MutationObserver(() => { if (scan()) mo.disconnect(); });
    document.addEventListener('DOMContentLoaded', () => {
      scan();
      mo.observe(document.documentElement, { childList: true, subtree: true });
    });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  const tNav = Date.now();
  await page.goto(URL, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__t901ready !== null, null, { timeout: 180000 });
  out.coldLoad = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      interactiveMs: window.__t901ready,
      domContentLoadedMs: nav.domContentLoadedEventEnd || null,
      loadEventMs: nav.loadEventEnd || null,
      requests: performance.getEntriesByType('resource').length,
      transferredBytes: performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0),
    };
  });
  out.coldLoadWallMs = Date.now() - tNav;

  out.gl = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'no-debug-ext';
    } catch (e) { return 'none'; }
  });
  out.env = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    vw: window.innerWidth, vh: window.innerHeight,
    coarse: matchMedia('(hover: none) and (pointer: coarse)').matches,
    tier: window.__quality ? window.__quality.tier() : null,
    hw: navigator.hardwareConcurrency,
  }));
  if (FORCE_TIER) await page.evaluate((t) => window.__quality.force(t), FORCE_TIER);

  // Enter THE RUN through the real UI button (js/ui/screens.js), never by
  // calling into module scope: the mode, the tune and the ticket branch must be
  // the ones a player gets.
  const tClick = Date.now();
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (/RUN CHICAGO/i.test(b.textContent || '')) { b.click(); return; }
    }
    throw new Error('RUN CHICAGO button not found');
  });
  await page.waitForSelector('.fw-cta', { timeout: 300000 });
  out.buildMs = Date.now() - tClick;
  out.mode = await page.evaluate(() => (window.__sim
    ? { mode: window.__sim.mode, scene: window.__sim.scene, tune: { ...window.__sim.tune } }
    : null));

  // Order matters: the override lands BEFORE levers() is read, so the recorded
  // levers describe the run that actually happened.
  if (ROUNDS != null) await page.evaluate((r) => { window.__sim.tune.contactRounds = r; }, ROUNDS);
  out.levers = await page.evaluate(() => window.__quality.levers());

  // The closed-loop drive. Everything below runs in the page, one steering
  // sample per rendered frame, exactly as the shipped input path is sampled
  // (js/main.js reads the stick once per frame).
  await page.evaluate((cfg) => {
    const cv = document.getElementById('game-canvas');
    const S = {
      dt: [], ticks: [], done: false, truncated: false, t0: 0, tEnd: 0,
      dist: 0, moves: 0, massStart: 0, massEnd: 0, sizeEnd: 0, wp: 0, wpHits: 0,
    };
    window.__t901 = S;
    const sim = window.__sim;

    // Waypoints derived from the scene's own block extents, at 30% of the half
    // span, so the circuit stays well inside the bounds clamp. A route that
    // scrapes the clamp measures the clamp, not the game.
    let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
    for (const b of sim.blocks) {
      if (b.x < mnX) mnX = b.x;
      if (b.x > mxX) mxX = b.x;
      if (b.z < mnZ) mnZ = b.z;
      if (b.z > mxZ) mxZ = b.z;
    }
    const cx = (mnX + mxX) / 2, cz = (mnZ + mxZ) / 2;
    const rx = (mxX - mnX) * 0.30, rz = (mxZ - mnZ) * 0.30;
    S.bounds = { mnX, mxX, mnZ, mxZ };
    const WPS = [
      { x: cx + rx, z: cz + rz }, { x: cx - rx, z: cz + rz },
      { x: cx - rx, z: cz - rz }, { x: cx + rx, z: cz - rz },
      { x: cx, z: cz },
    ];

    const ox = Math.round(window.innerWidth / 2), oy = Math.round(window.innerHeight / 2);
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: x, clientY: y,
      buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true,
    }));
    ev('pointerdown', ox, oy);
    S.massStart = sim.hole.mass;

    let lx = sim.hole.x, lz = sim.hole.z, last = -1;
    const loop = (ts) => {
      if (S.done) return;
      requestAnimationFrame(loop);
      if (last >= 0) S.dt.push(ts - last);
      last = ts;
      const s = window.__sim;
      if (!s) return;
      S.ticks.push(s.rankedTicks | 0);
      const h = s.hole;
      S.dist += Math.hypot(h.x - lx, h.z - lz); lx = h.x; lz = h.z;
      const w = WPS[S.wp % WPS.length];
      const dx = w.x - h.x, dz = w.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d < 18) { S.wp++; S.wpHits++; }
      // Steer against the LIVE latched basis and the ring's measured throw.
      const c = window.__controls;
      const basis = Number.isFinite(c._basisYaw) ? c._basisYaw : (window.__cam ? window.__cam.yaw : 0);
      const T = Math.atan2(-dx, -dz);
      const phi = T - basis;
      const m = (c._joyThrow || 40) * 0.92;
      ev('pointermove', ox - Math.sin(phi) * m, oy - Math.cos(phi) * m);
      S.moves++;
      const cut = cfg.maxTicks > 0 && (s.rankedTicks | 0) >= cfg.maxTicks;
      if (s.runComplete || s.over || cut) {
        S.done = true; S.truncated = !!cut && !s.runComplete && !s.over;
        S.tEnd = performance.now();
        S.massEnd = h.mass; S.sizeEnd = h.size; S.ticksEnd = s.rankedTicks;
        ev('pointerup', ox, oy);
      }
    };
    S.t0 = performance.now();
    requestAnimationFrame(loop);
  }, { maxTicks: MAX_TICKS });

  // Space dismisses the READY gate. t0 is re-stamped immediately after so the
  // measured window is gate-dismissal to runComplete, not build time.
  const tGate = Date.now();
  await page.keyboard.press('Space');
  await page.evaluate(() => { window.__t901.t0 = performance.now(); });

  const deadline = Date.now() + MAX_WAIT * 1000;
  let prog = null;
  while (Date.now() < deadline) {
    await sleep(3000);
    prog = await page.evaluate(() => {
      const S = window.__t901;
      return {
        done: S.done, frames: S.dt.length,
        ticks: S.ticks.length ? S.ticks[S.ticks.length - 1] : 0,
        ms: performance.now() - S.t0, dist: S.dist,
      };
    });
    if (prog.done) break;
  }
  out.timedOut = !prog || !prog.done;

  out.play = await page.evaluate(() => {
    const S = window.__t901;
    return {
      frames: S.dt.length, dt: S.dt, ticks: S.ticks, t0: S.t0, tEnd: S.tEnd,
      dist: S.dist, moves: S.moves, wpHits: S.wpHits, massStart: S.massStart,
      massEnd: S.massEnd, sizeEnd: S.sizeEnd, ticksEnd: S.ticksEnd || 0,
      bounds: S.bounds, truncated: !!S.truncated,
    };
  });
  out.truncated = !!out.play.truncated;
  out.wallMsGateToEnd = (out.play.tEnd && out.play.t0) ? out.play.tEnd - out.play.t0 : Date.now() - tGate;

  await sleep(1500);
  out.end = await page.evaluate(() => {
    const s = window.__sim;
    const scr = document.querySelector('.screen');
    return {
      runComplete: !!(s && s.runComplete), rankedTicks: s ? s.rankedTicks : null,
      over: !!(s && s.over), mass: s ? s.hole.mass : null,
      screenText: scr ? (scr.innerText || '').replace(/\s+/g, ' ').slice(0, 600) : null,
      hasResultsHeading: !!(scr && /THE RUN/i.test(scr.textContent || '')),
    };
  });

  await browser.close();
  if (server) await server.stop();

  out.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(LABEL,
    'frames=', out.play.frames,
    'ticks=', out.end.rankedTicks,
    'wallMs=', Math.round(out.wallMsGateToEnd),
    'timedOut=', out.timedOut,
    out.truncated ? '(TRUNCATED - smoke, not a measurement)' : '',
    '->', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
