// Real layout engine, current source served by request interception (no dev server).
// Set FW_TEST_URL to verify deployed assets instead, without interception.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(resolve(process.env.APPDATA, 'npm/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true });
const root = resolve('.');
const base = process.env.FW_TEST_URL || 'https://flywheel.test';
const evidence = resolve('tools/pw/_remediation');
const mainSource = await readFile(resolve(root, 'js/main.js'), 'utf8');
const matchStart = mainSource.match(/function startMultiplayerMatch\([^\n]+\) \{([\s\S]*?)  const buildMatch/);
assert.ok(matchStart, 'match startup seam exists');
await mkdir(evidence, { recursive: true });
let checks = 0;
try {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 500 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
    if (!process.env.FW_TEST_URL) await page.route(`${base}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><head></head><body></body></html>' });
      const file = resolve(root, '.' + pathname);
      assert.ok(file.startsWith(root + sep));
      await route.fulfill({ body: await readFile(file), contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    await page.goto(base);
    await page.evaluate(async () => {
      document.body.innerHTML = '<div id="screen-root"></div>';
      for (const href of ['/css/main.css', '/css/multiplayer.css']) {
        await new Promise((done, reject) => {
          const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
          link.onload = done; link.onerror = reject; document.head.append(link);
        });
      }
      const { MultiplayerUI } = await import('/js/multiplayer/ui.js');
      window.ui = new MultiplayerUI({ rootElement: document.querySelector('#screen-root') });
      window.makeLobby = () => ({ roomCode: 'TESTS', scene: 'gallery', maxPlayers: 6,
        isHost: true, connectedCount: 2, players: [], startVoteState: {}, noteHostActivity() {},
        startCountdown() {}, sendChat() {}, inviteUrl: location.origin });
      window.lobby = makeLobby();
      ui.showLobby(lobby, { onLeave: () => ui.clear() });
      document.querySelector('.mp-lobby-container').style.minHeight = '1800px';
    });
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate(f => {
        const scroller = document.querySelector('#mp-lobby-screen');
        scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * f;
        lobby.onCountdownStart(3);
      }, fraction);
      for (const digit of [3, 2, 1]) {
        await page.evaluate(d => lobby.onCountdownTick(d), digit);
        const bounds = await page.locator('.mp-countdown-card').boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1,
          `${viewport.width} scroll=${fraction} digit=${digit}: countdown outside viewport ${JSON.stringify(bounds)}`);
        assert.equal(await page.locator('#mp-countdown-num').textContent(), String(digit));
        checks++;
      }
      await page.screenshot({ path: `${evidence}/countdown-${viewport.width}-${fraction}.png` });
      await page.evaluate(() => lobby.onCountdownCancel());
      assert.equal(await page.locator('#mp-countdown-modal').isVisible(), false);
    }
    await page.evaluate(() => { window.oldLobby = lobby; ui.clear(); });
    assert.equal(await page.locator('#mp-countdown-modal').count(), 0);
    await page.evaluate(() => {
      lobby = makeLobby(); ui.showLobby(lobby, {});
      oldLobby.onCountdownStart(3); oldLobby.onCountdownTick(1);
    });
    assert.equal(await page.locator('#mp-countdown-modal').count(), 1);
    assert.equal(await page.locator('#mp-countdown-modal').isVisible(), false, 'stale lobby must not control new overlay');
    await page.evaluate(source => {
      lobby.onCountdownStart(3);
      new Function('mpUI', 'screens', 'scene', source)(ui,
        { showLoading() { document.querySelector('#screen-root').innerHTML = ''; } }, 'gallery');
    }, matchStart[1]);
    assert.equal(await page.locator('#mp-countdown-modal').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`ALL PASS: countdown layout (${checks} scroll/digit/viewport combinations + lifecycle)`);
} finally { await browser.close(); }
