// Throwaway visual review: screenshot the city select + title screens at
// representative viewports. Not part of validate.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.FW_BASE || 'http://localhost:8000';
const OUT = process.env.FW_OUT || '_menu-review';
fs.mkdirSync(OUT, { recursive: true });

const HEADLESS = process.env.FW_HEADLESS === '1';

const CASES = [
  { name: 'phone-portrait-390x844', vp: { width: 390, height: 844 }, touch: true },
  { name: 'small-portrait-360x640', vp: { width: 360, height: 640 }, touch: true },
  { name: 'tiny-portrait-320x568', vp: { width: 320, height: 568 }, touch: true },
  { name: 'phone-landscape-844x390', vp: { width: 844, height: 390 }, touch: true },
  { name: 'desktop-1440x900', vp: { width: 1440, height: 900 }, touch: false },
];

const browser = await chromium.launch({ headless: HEADLESS });
for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: c.vp, hasTouch: c.touch, isMobile: c.touch,
    deviceScaleFactor: c.touch ? 2 : 1,
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__screens, null, { timeout: 45000 });
  await page.waitForTimeout(600);

  // Title screen
  await page.screenshot({ path: `${OUT}/${c.name}-title.png` });

  // City select (ALL tab, default city)
  await page.evaluate(() => window.__screens.showCitySelect());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${c.name}-cityselect.png` });

  // Scroll check: does the card overflow the viewport?
  const metrics = await page.evaluate(() => {
    const card = document.querySelector('.city-card');
    const counter = document.querySelector('.city-counter');
    const launch = document.querySelector('.city-launch-btn');
    const screen = document.querySelector('.fw-city-select');
    return {
      scrolls: document.scrollingElement.scrollHeight > window.innerHeight + 1,
      cardBottom: card ? +card.getBoundingClientRect().bottom.toFixed(0) : null,
      launchBottom: launch ? +launch.getBoundingClientRect().bottom.toFixed(0) : null,
      counterTop: counter ? +counter.getBoundingClientRect().top.toFixed(0) : null,
      viewportH: window.innerHeight,
      screenScrollable: screen ? screen.scrollHeight > screen.clientHeight + 1 : null,
      actRailScrolls: (() => { const r = document.querySelector('.city-act-filter-rail'); return r ? r.scrollWidth > r.clientWidth + 1 : null; })(),
    };
  });
  console.log(c.name, JSON.stringify(metrics), pageErrors.length ? 'ERRORS: ' + pageErrors.join(' | ') : '');
  await ctx.close();
}
await browser.close();
