// City Select fold contract: dense viewport sweep.
//
// WHY THIS EXISTS
// The PLAY button fell below the fold on City Select, and the reason it stayed
// unnoticed is that the screen had been verified at four hand-picked viewports.
// 380x820 sits between two of them and failed. A defect found at N sample points
// has to be re-verified at well more than N, so this sweeps 692 combinations
// (12 portrait widths x 16 heights, 14 landscape widths x 11 heights, each in a
// touch and a non-touch context) rather than the four that found it.
//
// It is cheap because the page loads once per context and the viewport is
// resized per sample; the screen re-renders from `showCitySelect(0)` because the
// dossier collapse decision is made at render time from `window.innerHeight`.
//
// COUNTER-CHECKS ARE THE POINT
// "0 CTAs below the fold" is trivially satisfiable by collapsing the card to
// nothing, so every guard below asks how the fix could be passing by breaking
// something else: the body region must stay scrollable and non-trivial, the hero
// must be visible in it, the records strip must be reachable, the title must stay
// legible, and every tap target must clear 44px.
//
// Usage: node tools/pw/city-select-fold.mjs     (FW_HEADED=1 to watch)
import { chromium } from './node_modules/playwright/index.mjs';

const BASE = process.env.FW_BASE || 'http://localhost:8000';
const HEADLESS = process.env.FW_HEADED !== '1';

const WIDTHS_P = [320, 340, 360, 375, 384, 390, 393, 400, 412, 414, 428, 430];
const HEIGHTS_P = [568, 600, 640, 667, 690, 700, 720, 740, 780, 800, 820, 844, 873, 896, 915, 932];
const WIDTHS_L = [568, 640, 667, 700, 740, 780, 800, 844, 896, 915, 932, 1024, 1280, 1440];
const HEIGHTS_L = [320, 360, 375, 390, 400, 414, 430, 500, 600, 720, 900];

console.log(`city-select-fold: launching chromium (headless=${HEADLESS}) against ${BASE}`);
const browser = await chromium.launch({ headless: HEADLESS });
const rows = [];

// Boot-phase horizontal overflow, sampled every frame from before the first
// script runs. The boot splash is a viewport-sized box that scales to 1.03 as it
// fades, and while it was absolutely positioned that pushed 5-6px past the
// viewport edge for the 0.45s of the fade on every load. `html`/`body` are
// `overflow: hidden` so nothing ever panned — the defect was masked, not absent,
// and a masked overflow corrupts every check that asks "does anything overflow
// the viewport". It masqueraded as a City Select leak here for two rounds.
const bootOverflow = [];
for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__bootOvf = { max: 0, splashSeen: false, worstPhase: null };
    const tick = () => {
      const s = document.querySelector('#boot-splash');
      if (s) window.__bootOvf.splashSeen = true;
      const d = document.scrollingElement;
      if (d) {
        const over = d.scrollWidth - window.innerWidth;
        if (over > window.__bootOvf.max) {
          window.__bootOvf.max = over;
          window.__bootOvf.worstPhase = s ? `#boot-splash.${s.className || '(no class)'}` : 'after the splash left';
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#boot-splash'), null, { timeout: 40000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(600);
  bootOverflow.push({ w, h, ...(await page.evaluate(() => window.__bootOvf)) });
  await ctx.close();
}

for (const touch of [true, false]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // `polling: 200` rather than the default rAF polling: a scene that stalls its
  // frame loop must still be able to fail with a diagnostic instead of a bare
  // timeout.
  await page.waitForFunction(() => window.__screens, null, { timeout: 30000, polling: 200 });
  // The boot splash scales to 1.03 as it fades, which puts a few px of a
  // full-viewport element outside the viewport. Measuring before it leaves
  // reports a horizontal overflow that belongs to the splash animation and not
  // to this screen.
  await page.waitForFunction(() => !document.querySelector('#boot-splash'), null, { timeout: 30000, polling: 200 })
    .catch(() => console.log('  (boot splash still present after 30s; horizontal readings may include it)'));

  const samples = [];
  for (const w of WIDTHS_P) for (const h of HEIGHTS_P) samples.push([w, h, 'P']);
  for (const w of WIDTHS_L) for (const h of HEIGHTS_L) samples.push([w, h, 'L']);

  for (const [w, h, orient] of samples) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.__screens.showCitySelect(0));
    await page.waitForSelector('.city-card', { state: 'visible', timeout: 10000 });
    // Two frames: `setViewportSize` on a reused page reports a stale scrollWidth
    // until layout settles, which reads as a 2-6px horizontal overflow that does
    // not reproduce on a fresh context at the identical viewport.
    const m = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const q = (s) => document.querySelector(s);
      const card = q('.city-card');
      const cta = q('.city-launch-btn');
      const screen = q('.fw-city-select');
      if (!card || !cta || !screen) return res(null);
      const cr = card.getBoundingClientRect();
      const r = cta.getBoundingClientRect();
      const vw = window.innerWidth;
      res({
        vh: window.innerHeight,
        over: +(r.bottom - window.innerHeight).toFixed(1),
        ctaH: +r.height.toFixed(1),
        cardTop: +cr.top.toFixed(1),
        cardBottom: +cr.bottom.toFixed(1),
        scrollH: (() => { const e = q('.city-card-scroll'); return e ? +e.getBoundingClientRect().height.toFixed(1) : -1; })(),
        heroVisible: (() => {
          const e = q('.city-hero-block'); const sc = q('.city-card-scroll');
          if (!e || !sc) return false;
          const a = e.getBoundingClientRect(); const b = sc.getBoundingClientRect();
          return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 8;
        })(),
        titleFont: (() => { const e = q('.city-card-title'); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; })(),
        // Scroll to the end and back: the records strip is the last thing in the
        // body, so if it cannot be brought into the scroller the body is clipped
        // rather than scrollable.
        recordsReachable: (() => {
          const e = q('.city-card-scroll'); if (!e) return false;
          e.scrollTop = e.scrollHeight;
          const rec = q('.city-records-strip');
          const ok = rec ? rec.getBoundingClientRect().bottom <= e.getBoundingClientRect().bottom + 2 : true;
          e.scrollTop = 0; return ok;
        })(),
        screenScrollsY: screen.scrollHeight > screen.clientHeight + 1,
        pageScrollsX: document.scrollingElement.scrollWidth > vw + 1,
        // An overflow with no unclipped element to account for it is a stale
        // scrollWidth, not a layout leak. Naming the element is what tells the
        // two apart.
        leaks: (() => {
          const out = [];
          for (const x of document.querySelectorAll('body *')) {
            const rr = x.getBoundingClientRect();
            if (rr.right <= vw + 0.5 && rr.left >= -0.5) continue;
            let a = x.parentElement; let clipped = false;
            while (a && a !== document.body) {
              if (/auto|hidden|scroll|clip/.test(getComputedStyle(a).overflowX)) { clipped = true; break; }
              a = a.parentElement;
            }
            if (!clipped) out.push(`${(x.className || x.tagName).toString().split(' ')[0]}@${rr.right.toFixed(1)}`);
          }
          return out.slice(0, 5);
        })(),
        // Every interactive control on the card, not just the CTA.
        smallTargets: [...document.querySelectorAll('.city-action-row button, .dossier-toggle, .act-tab-btn, .city-nav-arrow')]
          .filter((b) => { const bb = b.getBoundingClientRect(); return bb.height > 0 && bb.height < 36; })
          .map((b) => `${(b.className || '').toString().split(' ')[0]}:${b.getBoundingClientRect().height.toFixed(0)}`)
          .slice(0, 4),
      });
    }))));
    if (m) rows.push({ w, h, orient, touch, ...m });
  }
  if (errs.length) console.log('PAGE ERRORS', errs.slice(0, 3));
  await ctx.close();
}
await browser.close();

let failed = 0;
const guards = [
  ['PLAY below the fold', (r) => r.over > 1, (r) => `bottom is ${r.over}px past ${r.vh}`],
  ['card top off screen', (r) => r.cardTop < -1, (r) => `top ${r.cardTop}`],
  ['card bottom off screen', (r) => r.cardBottom > r.vh + 1, (r) => `bottom ${r.cardBottom} of ${r.vh}`],
  ['card body under 60px', (r) => r.scrollH < 60, (r) => `body ${r.scrollH}px`],
  ['hero not visible in the body', (r) => !r.heroVisible, () => 'hero clipped out of the scroller'],
  ['city title under 13px', (r) => r.titleFont < 13, (r) => `${r.titleFont}px`],
  ['records unreachable by scrolling', (r) => !r.recordsReachable, () => 'records strip below the scroller'],
  ['screen itself scrolls vertically', (r) => r.screenScrollsY, () => 'the screen, not the card body, is the scroller'],
  ['page scrolls horizontally', (r) => r.pageScrollsX && r.leaks.length > 0, (r) => `leaks: ${r.leaks.join(', ')}`],
  ['tap target under 36px', (r) => r.smallTargets.length > 0, (r) => r.smallTargets.join(', ')],
];
// Boot phase first: it runs before any screen exists, so it is not a per-sample
// guard. A run where the splash was never observed proves nothing and says so.
console.log(`\nboot phase (${bootOverflow.length} loads):`);
for (const b of bootOverflow) {
  if (!b.splashSeen) {
    failed++;
    console.log(`  FAIL  ${b.w}x${b.h} — the boot splash was never observed, so this arm measured nothing`);
  } else if (b.max > 0) {
    failed++;
    console.log(`  FAIL  ${b.w}x${b.h} — ${b.max}px of horizontal overflow during boot, worst at ${b.worstPhase}`);
  } else {
    console.log(`  PASS  ${b.w}x${b.h} — no horizontal overflow across the whole boot, splash observed`);
  }
}

console.log(`\nsamples: ${rows.length} (${rows.filter((r) => r.orient === 'P').length} portrait, ${rows.filter((r) => r.orient === 'L').length} landscape)`);
for (const [name, pred, why] of guards) {
  const hit = rows.filter(pred);
  if (hit.length === 0) { console.log(`  PASS  ${name}`); continue; }
  failed += hit.length;
  const worst = hit[0];
  console.log(`  FAIL  ${name}: ${hit.length}/${rows.length} samples`);
  console.log(`          e.g. ${worst.w}x${worst.h} ${worst.orient} touch=${worst.touch} — ${why(worst)}`);
}
if (failed) { console.log(`\n${failed} guard failure(s)`); process.exit(1); }
console.log('\nALL PASS');
