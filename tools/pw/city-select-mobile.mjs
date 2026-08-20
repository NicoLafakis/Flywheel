// City Select mobile-first contract (not part of validate.mjs — needs a real
// browser and a real compositor). Written RED against the Phase 2 tree: the
// card overflowed every phone viewport (CTA below the fold at 360x640), type
// ran at 8.5-11px, tap targets were ~27px, nav arrows overlapped card content,
// and a 29-button dots rail could never fit a phone.
//
// Every case runs in BOTH touch and non-touch contexts. A touch-only assumption
// has shipped an inert control in this repo before (the joystick), so
// `hasTouch` is a dimension here, never a baked-in constant.
//
// Run: node tools/pw/city-select-mobile.mjs   (with `python -m http.server 8000`)
//
// HEADLESS BY DEFAULT (was headed). This script was reported on 2026-08-19 as
// blocking for a full 300s with ZERO output, and the block was attributed to
// `waitForFunction(() => window.__screens)`. It was not that: `chromium.launch()`
// runs BEFORE the first console.log in this file, so anything that blocks in the
// launch produces exactly that signature — no output at all, and no evidence
// pointing at whatever line gets blamed. A HEADED launch is the one thing here
// that can block on the environment (it needs an interactive desktop session);
// the sibling harnesses that resolved the same predicate instantly all launch
// headless. Watching a run is opt-in now: FW_HEADED=1.
// (FW_HEADLESS=1 still accepted so older invocations keep working.)
import { chromium } from 'playwright';

const BASE = process.env.FW_BASE || 'http://localhost:8000';
const HEADLESS = process.env.FW_HEADED !== '1';

const results = [];
const check = (vp, name, pass, detail) => {
  results.push({ vp, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const CASES = [
  { name: 'phone-portrait  390x844', vp: { width: 390, height: 844 }, touch: true },
  { name: 'phone-landscape 844x390', vp: { width: 844, height: 390 }, touch: true },
  { name: 'small-portrait  360x640', vp: { width: 360, height: 640 }, touch: true },
  { name: 'tiny-portrait   320x568', vp: { width: 320, height: 568 }, touch: true },
  { name: 'desktop-narrow  380x820', vp: { width: 380, height: 820 }, touch: false },
  { name: 'desktop-wide   1440x900', vp: { width: 1440, height: 900 }, touch: false },
];

const intersect = (a, b) =>
  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

// Log BEFORE the launch, so a launch that blocks can never again look like a
// hang somewhere further down the file.
console.log(`launching chromium (headless=${HEADLESS}) against ${BASE} ...`);
const browser = await chromium.launch({ headless: HEADLESS });

for (const c of CASES) {
  console.log(`\n=== ${c.name}  touch=${c.touch} ===`);
  const ctx = await browser.newContext({
    viewport: c.vp, hasTouch: c.touch, isMobile: c.touch,
    deviceScaleFactor: c.touch ? 3 : 1,
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // `polling: 200` rather than the default 'raf', and a diagnostic instead of a
  // bare TimeoutError: if the app really is dead, the reason is on the page and
  // the next person should not have to go and find it.
  await page.waitForFunction(() => window.__screens, null, { timeout: 45000, polling: 200 })
    .catch(async (err) => {
      const state = await page.evaluate(() => ({
        readyState: document.readyState,
        hasCanvas: !!document.querySelector('canvas'),
        body: (document.body.innerText || '').slice(0, 200),
      })).catch(() => null);
      console.log(`  app never exposed window.__screens: ${err.message}`);
      console.log(`  page state: ${JSON.stringify(state)}  page errors: ${pageErrors.join(' | ') || '(none)'}`);
      throw err;
    });

  // Give the first city a play history on the LIVE save object — the dossier
  // must be collapsed by default once the lore has greeted the player, and
  // the records strip must show real values. (Seeding localStorage would
  // fight save-schema migrations; this is the in-memory shape the screen
  // actually reads.)
  await page.evaluate(() => {
    const save = window.__screens.save;
    save.sandbox = save.sandbox || {};
    save.sandbox.gallery = { runs: 2, completions: 1, bestScore: 4200, bestPercent: 1, bestTime: 231.4, bestSize: 4 };
  });

  // Pin the carousel to the first city (the played one) — the default index
  // logic advances past completed cities.
  await page.evaluate(() => window.__screens.showCitySelect(0));
  await page.waitForSelector('.city-card', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(150);

  // --- 1: the screen renders without runtime errors -------------------------
  // (Commit 7e3ea01 shipped a ReferenceError here that validate.mjs could not
  // see; a dead screen is the worst menu bug of all.)
  check(c.name, 'showCitySelect renders with zero page errors',
    pageErrors.length === 0, pageErrors.join(' | '));

  // --- 2: dossier is a collapsible drawer, collapsed for a played city ------
  const dossier = await page.evaluate(() => {
    const wrap = document.querySelector('.city-dossier-wrap');
    const toggle = document.querySelector('.dossier-toggle');
    if (!wrap || !toggle) return { exists: false };
    const tr = toggle.getBoundingClientRect();
    const body = wrap.querySelector('.dossier-body');
    const bodyH = body ? body.getBoundingClientRect().height : null;
    return {
      exists: true,
      expanded: toggle.getAttribute('aria-expanded'),
      toggleH: +tr.height.toFixed(1),
      bodyVisible: bodyH !== null && bodyH > 1,
    };
  });
  check(c.name, 'dossier toggle exists and is a >=44px tap target',
    dossier.exists && dossier.toggleH >= 44, dossier.exists ? `toggle ${dossier.toggleH}px` : 'no .dossier-toggle found');
  // The shipped rule is progressive disclosure on SHORT viewports only
  // (js/ui/screens.js: `innerHeight < 700`, asserted in tools/mobile-ui.test.mjs).
  // This case used to demand "always collapsed", which is a contract the screen
  // never had — on a 844px-tall phone the lore is meant to greet the player.
  const wantCollapsed = c.vp.height < 700;
  check(c.name, `dossier starts ${wantCollapsed ? 'collapsed' : 'open'} on a ${c.vp.height}px viewport`,
    dossier.exists && dossier.expanded === String(!wantCollapsed) && dossier.bodyVisible === !wantCollapsed,
    dossier.exists ? `aria-expanded=${dossier.expanded} bodyVisible=${dossier.bodyVisible}` : 'no dossier');

  // --- 3: CTA fully inside the viewport, dossier collapsed ------------------
  const ctaCollapsed = await page.evaluate(() => {
    const b = document.querySelector('.city-launch-btn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
  });
  check(c.name, 'launch CTA fully on screen (dossier collapsed)',
    !!ctaCollapsed && ctaCollapsed.top >= 0 && ctaCollapsed.bottom <= ctaCollapsed.vh + 1,
    ctaCollapsed ? `bottom ${ctaCollapsed.bottom.toFixed(0)} of ${ctaCollapsed.vh}` : 'no .city-launch-btn');

  // --- 4: toggle expands the dossier; CTA still reachable -------------------
  // Drive it from whatever state THIS viewport starts in. A blind single click
  // was testing the close direction on tall viewports while reporting on the
  // open one.
  await page.click('.dossier-toggle').catch(() => {});
  await page.waitForTimeout(150);
  if (await page.evaluate(() => document.querySelector('.dossier-toggle')?.getAttribute('aria-expanded')) === 'false') {
    await page.click('.dossier-toggle').catch(() => {});
    await page.waitForTimeout(150);
  }
  const expanded = await page.evaluate(() => {
    const t = document.querySelector('.dossier-toggle');
    const body = document.querySelector('.dossier-body');
    const sc = document.querySelector('.fw-city-select');
    const b = document.querySelector('.city-launch-btn');
    return {
      expanded: t && t.getAttribute('aria-expanded'),
      bodyVisible: body ? body.getBoundingClientRect().height > 1 : false,
      screenScrollable: sc ? sc.scrollHeight > sc.clientHeight + 1 : false,
      cta: b ? b.getBoundingClientRect().bottom : null,
      vh: window.innerHeight,
    };
  });
  check(c.name, 'tapping the toggle expands the dossier',
    expanded.expanded === 'true' && expanded.bodyVisible,
    `aria-expanded=${expanded.expanded} bodyVisible=${expanded.bodyVisible}`);
  if (c.vp.height >= 700) {
    // On roomier portrait screens the whole card must still fit with the
    // drawer open; on short screens an explicitly-opened drawer may scroll —
    // that is the progressive-disclosure deal, the collapsed CTA check above
    // is the hard floor.
    check(c.name, 'launch CTA still on screen with dossier expanded',
      expanded.cta !== null && expanded.cta <= expanded.vh + 1,
      `cta bottom ${expanded.cta && expanded.cta.toFixed(0)} of ${expanded.vh}`);
  }
  await page.click('.dossier-toggle').catch(() => {});
  await page.waitForTimeout(100);

  // --- 5: type legibility floors ---------------------------------------------
  const type = await page.evaluate(() => {
    const fs = (sel) => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    };
    return {
      directive: fs('.dossier-directive'),
      transmission: fs('.dossier-transmission'),
      metricLabel: fs('.metric-k'),
      metricValue: fs('.metric-v'),
      recLabel: fs('.rec-k'),
      recValue: fs('.rec-v'),
      counter: fs('.city-counter'),
    };
  });
  check(c.name, 'dossier body text reads at >=12px',
    type.directive >= 12 && type.transmission >= 12,
    `directive ${type.directive}px transmission ${type.transmission}px`);
  check(c.name, 'metric/record values read at >=12px, labels >=10px',
    type.metricValue >= 12 && type.metricLabel >= 10
      && (type.recValue === null || type.recValue >= 12)
      && (type.recLabel === null || type.recLabel >= 10),
    `metric ${type.metricLabel}/${type.metricValue} rec ${type.recLabel}/${type.recValue}`);

  // --- 6: act tabs are real touch targets; rail scrolls internally ----------
  const tabs = await page.evaluate(() => {
    const rail = document.querySelector('.city-act-filter-rail');
    const btns = [...document.querySelectorAll('.act-tab-btn')];
    return {
      shortest: btns.length ? Math.min(...btns.map((b) => +b.getBoundingClientRect().height.toFixed(1))) : 0,
      count: btns.length,
      railScrollsInternally: rail ? rail.scrollWidth > rail.clientWidth + 1 : null,
      pageScrollsX: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    };
  });
  check(c.name, `every act tab is a >=44px tap target (${tabs.count} tabs)`,
    tabs.shortest >= 44, `shortest ${tabs.shortest}px`);
  check(c.name, 'act rail overflow never becomes page-level horizontal scroll',
    tabs.pageScrollsX === false, `pageScrollsX=${tabs.pageScrollsX}`);

  // --- 7: numbered dots are gone; a compact counter takes their place -------
  const nav = await page.evaluate(() => {
    // Shipped as `.city-breadcrumb` ("CITY n / 29 · ACT · i / n"), which is
    // what tools/mobile-ui.test.mjs asserts. `.city-counter` was this harness's
    // working name for it and never existed in the DOM, so this case was
    // reporting a missing element rather than a missing feature.
    const counter = document.querySelector('.city-breadcrumb');
    const dots = [...document.querySelectorAll('.city-dot')];
    const rail = document.querySelector('.city-dots-rail');
    return {
      hasCounter: !!counter,
      counterText: counter ? counter.textContent.trim().replace(/\s+/g, ' ') : null,
      dotCount: dots.length,
      railOverflow: rail ? rail.scrollWidth > rail.clientWidth + 1 : null,
    };
  });
  check(c.name, 'compact city counter present, 29-button dots rail gone',
    nav.hasCounter && nav.dotCount === 0,
    `counter=${JSON.stringify(nav.counterText)} dots=${nav.dotCount}`);

  // --- 8: nav arrows never cover card content --------------------------------
  const overlap = await page.evaluate((fn) => {
    const card = document.querySelector('.city-card');
    const blocks = [...card.querySelectorAll('.city-card-header, .city-hero-block, .city-dossier-wrap, .city-metrics-row, .city-action-row')];
    const arrows = [...document.querySelectorAll('.city-nav-arrow')];
    const hit = [];
    for (const a of arrows) {
      const ar = a.getBoundingClientRect();
      for (const b of blocks) {
        const br = b.getBoundingClientRect();
        if (a.left < br.right - 0.5 && ar.right > br.left + 0.5 && ar.top < br.bottom - 0.5 && ar.bottom > br.top + 0.5) {
          hit.push(`${a.className.split(' ').pop()} x ${b.className}`);
        }
      }
    }
    return hit;
  });
  check(c.name, 'nav arrows never overlap card content blocks',
    overlap.length === 0, overlap.join(' | '));

  // --- 9: records strip shows real data when it exists (seeded save) --------
  const records = await page.evaluate(() => {
    const strip = document.querySelector('.city-records-strip');
    if (!strip) return { present: false };
    return { present: true, text: strip.textContent };
  });
  check(c.name, 'records strip renders real values for a played city',
    records.present && records.text.includes('4,200') && !records.text.includes('—'),
    records.present ? records.text.replace(/\s+/g, ' ').slice(0, 80) : 'strip missing on played city');

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  ${f.vp} :: ${f.name} — ${f.detail}`);
  console.log('CITY SELECT: FAIL');
  process.exit(1);
}
console.log('CITY SELECT: ALL PASS');
process.exit(0);
