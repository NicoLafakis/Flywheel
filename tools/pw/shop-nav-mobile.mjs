// Shop bottom-nav contract (not part of validate.mjs — needs a real browser and
// a real compositor). Written RED against the shipped tree: the tab bar was
// `position: fixed` inside a scroll container that carried `backdrop-filter`,
// which makes that container the containing block for fixed descendants — so
// the bar scrolled away with the content instead of staying docked.
//
// Every case runs in BOTH a touch context and a non-touch one. A touch-only
// assumption has shipped an inert control in this repo before (the joystick),
// so `hasTouch` is a dimension here, never a baked-in constant.
//
// Run: node tools/pw/shop-nav-mobile.mjs   (with `python -m http.server 8000`)
import { chromium } from 'playwright';

const BASE = process.env.FW_BASE || 'http://localhost:8000';
const SAMPLES = 33; // ~4x the 8 points that first located the bug — a fix must
                    // hold BETWEEN the samples that found it, not just on them.

const results = [];
const check = (vp, name, pass, detail) => {
  results.push({ vp, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const CASES = [
  { name: 'phone-portrait  390x844', vp: { width: 390, height: 844 }, touch: true },
  { name: 'phone-landscape 844x390', vp: { width: 844, height: 390 }, touch: true, landscape: true },
  { name: 'small-portrait  360x640', vp: { width: 360, height: 640 }, touch: true },
  { name: 'small-landscape 640x360', vp: { width: 640, height: 360 }, touch: true, landscape: true },
  { name: 'tiny-portrait   320x568', vp: { width: 320, height: 568 }, touch: true },
  // The non-touch blind spot: a narrow desktop window is not a phone, and a
  // fix that only lands under `(pointer: coarse)` would ship inert here.
  { name: 'desktop-narrow  380x820', vp: { width: 380, height: 820 }, touch: false },
  { name: 'desktop-tablet  834x1112', vp: { width: 834, height: 1112 }, touch: false },
  { name: 'desktop-wide   1440x900', vp: { width: 1440, height: 900 }, touch: false },
];

const browser = await chromium.launch({ headless: true });

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
  await page.waitForFunction(() => window.__screens, null, { timeout: 45000 });

  // Every category, not just the default one: `upgrades` renders a different
  // grid, and a docking bug that only bites the tallest tab is still a bug.
  for (const cat of ['skins', 'upgrades']) {
    await page.evaluate((id) => window.__screens.showShop(id), cat);
    await page.waitForSelector('.shop-tab-bar', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(120);

    // --- 1/2/3: docked, never occluding, last row reachable ---
    const sweep = await page.evaluate(async (n) => {
      const sc = document.querySelector('.shop-scroll') || document.querySelector('.shop-screen');
      const shell = document.querySelector('.shop-screen');
      const bar = document.querySelector('.shop-tab-bar');
      const cards = () => [...document.querySelectorAll('.shop-item, .upgrade-card')];
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      let worstDock = 0, worstOcclusion = 0, worstAt = 0, worstSpill = -Infinity;
      for (let i = 0; i <= n; i++) {
        sc.scrollTop = (max * i) / n;
        await new Promise((r) => requestAnimationFrame(r));
        const br = bar.getBoundingClientRect();
        const sr = shell.getBoundingClientRect();
        const cr = sc.getBoundingClientRect();
        const dock = Math.abs(br.bottom - sr.bottom);
        if (dock > worstDock) { worstDock = dock; worstAt = sc.scrollTop; }
        // Does the scrolling region itself reach under the nav? This is the
        // structural form of the question and it does not depend on where any
        // particular card happens to sit.
        worstSpill = Math.max(worstSpill, cr.bottom - br.top);
        const hit = cards().filter((el) => {
          const r = el.getBoundingClientRect();
          // getBoundingClientRect reports the UNCLIPPED box, so a card halfway
          // past the scroller's bottom edge still reports pixels down there
          // even though the scroller has clipped them away. Intersect with the
          // scroll viewport first or this counts occlusion the geometry now
          // forbids — and sinks a working layout.
          const visTop = Math.max(r.top, cr.top, 0);
          const visBottom = Math.min(r.bottom, cr.bottom, window.innerHeight);
          if (visBottom <= visTop) return false;
          return visBottom > br.top + 0.5 && visTop < br.bottom - 0.5;
        }).length;
        if (hit > worstOcclusion) worstOcclusion = hit;
      }
      sc.scrollTop = max;
      await new Promise((r) => requestAnimationFrame(r));
      const br = bar.getBoundingClientRect();
      const all = cards();
      const last = all[all.length - 1];
      return {
        maxScroll: +max.toFixed(0),
        worstDock: +worstDock.toFixed(2), worstAt: +worstAt.toFixed(0),
        worstOcclusion, worstSpill: +worstSpill.toFixed(2),
        lastClearance: last ? +(br.top - last.getBoundingClientRect().bottom).toFixed(1) : null,
        cards: all.length,
      };
    }, SAMPLES);

    check(c.name, `[${cat}] bar stays docked to the shell bottom across ${SAMPLES + 1} scroll positions`,
      sweep.worstDock <= 1, `worst drift ${sweep.worstDock}px at scrollTop=${sweep.worstAt} (of ${sweep.maxScroll})`);
    check(c.name, `[${cat}] bar never covers a visible card`,
      sweep.worstOcclusion === 0, `worst ${sweep.worstOcclusion} card(s) covered`);
    check(c.name, `[${cat}] the scrolling region stops at the nav, never under it`,
      sweep.worstSpill <= 1, `worst spill ${sweep.worstSpill}px past the nav's top edge`);
    check(c.name, `[${cat}] last row clears the bar at max scroll`,
      sweep.lastClearance === null || sweep.lastClearance >= 0, `clearance ${sweep.lastClearance}px over ${sweep.cards} cards`);

    // --- 4: a real compositor-driven touch/wheel scroll, sampled per frame ---
    // A screenshot at rest cannot show a bar that lags or slides under a fling.
    const cdp = await ctx.newCDPSession(page);
    await page.evaluate(() => {
      const sc = document.querySelector('.shop-scroll') || document.querySelector('.shop-screen');
      sc.scrollTop = 0;
      window.__barTops = [];
      window.__barProbe = () => {
        const bar = document.querySelector('.shop-tab-bar');
        const shell = document.querySelector('.shop-screen');
        if (bar && shell) {
          window.__barTops.push(+(bar.getBoundingClientRect().bottom - shell.getBoundingClientRect().bottom).toFixed(2));
        }
        window.__barRaf = requestAnimationFrame(window.__barProbe);
      };
      window.__barProbe();
    });
    // Two drivers, because `Input.synthesizeScrollGesture` with
    // gestureSourceType:'touch' does not drive a NESTED scroller here — verified
    // against a control that removed body{touch-action:none} entirely and still
    // reported 0px, while a raw touchStart/Move/End drag moved the same list
    // 405px. A gesture that never scrolls reports a flawless 0px offset, so the
    // wrong driver would have made this check pass on any build at all.
    const x = Math.round(c.vp.width / 2);
    if (c.touch) {
      const y0 = Math.round(c.vp.height * 0.8), y1 = Math.round(c.vp.height * 0.2);
      for (let pass = 0; pass < 2; pass++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
        for (let y = y0; y >= y1; y -= 24) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
    } else {
      await cdp.send('Input.synthesizeScrollGesture', {
        x, y: Math.round(c.vp.height / 2), yDistance: -Math.round(c.vp.height * 1.6),
        gestureSourceType: 'mouse', speed: 4000, repeatCount: 2, repeatDelayMs: 60,
      });
    }
    await page.waitForTimeout(700);
    const fling = await page.evaluate(() => {
      cancelAnimationFrame(window.__barRaf);
      const sc = document.querySelector('.shop-scroll') || document.querySelector('.shop-screen');
      const s = window.__barTops;
      return { n: s.length, worst: s.length ? Math.max(...s.map(Math.abs)) : 0, moved: sc.scrollTop };
    });
    // A gesture that never moved the scroller would report a perfect 0px offset
    // on a completely broken build, so the distance travelled is part of the
    // assertion — otherwise this check passes by doing nothing.
    // `upgrades` fits without overflow on a big screen — nothing to scroll is a
    // legitimate skip, but a gesture that SHOULD have scrolled and did not is a
    // dead instrument, so the two cases are distinguished rather than merged.
    if (sweep.maxScroll < 50) {
      check(c.name, `[${cat}] bar holds its dock through a ${c.touch ? 'touch drag' : 'wheel scroll'}`,
        true, `skipped — content fits, nothing to scroll (maxScroll ${sweep.maxScroll}px)`);
    } else {
      check(c.name, `[${cat}] bar holds its dock through a ${c.touch ? 'touch drag' : 'wheel scroll'}`,
        fling.moved > 50 && fling.worst <= 1,
        `worst |offset| ${fling.worst}px over ${fling.n} frames, gesture travelled ${fling.moved.toFixed(0)}px`);
    }
    await cdp.detach();

    // --- 5/6/7/8: legibility, tap targets, chrome budget, safe area ---
    const ui = await page.evaluate(() => {
      const bar = document.querySelector('.shop-tab-bar');
      const hdr = document.querySelector('.shop-header');
      const shell = document.querySelector('.shop-screen');
      const tabs = [...document.querySelectorAll('.shop-tab')];
      const barCS = getComputedStyle(bar);
      return {
        clipped: tabs.filter((t) => {
          const l = t.querySelector('.tab-label');
          return l.scrollWidth > Math.ceil(l.getBoundingClientRect().width) + 1;
        }).map((t) => t.querySelector('.tab-label').textContent),
        shortestTab: Math.min(...tabs.map((t) => +t.getBoundingClientRect().height.toFixed(1))),
        tabCount: tabs.length,
        chromeFrac: +((hdr.getBoundingClientRect().height + bar.getBoundingClientRect().height)
          / shell.getBoundingClientRect().height).toFixed(3),
        // env() resolves to 0 in a desktop browser, so assert the TERM survives
        // rather than a pixel value that is 0 everywhere the harness can run.
        keepsBottomInset: bar.style.paddingBottom !== '' || /safe-area-inset-bottom|--sai-bottom/.test(
          [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch { return []; } })
            .filter((r) => r.selectorText && r.selectorText.includes('.shop-tab-bar'))
            .map((r) => r.style.getPropertyValue('padding-bottom') || r.cssText).join(' ')),
        paddingBottom: barCS.paddingBottom,
        undefinedText: (shell.innerText || '').includes('undefined'),
        docScrolls: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 1,
      };
    });

    check(c.name, `[${cat}] every tab label reads in full`,
      ui.clipped.length === 0, ui.clipped.length ? `clipped: ${ui.clipped.join(' | ')}` : `${ui.tabCount} tabs`);
    check(c.name, `[${cat}] every tab is a >=44px tap target`,
      ui.shortestTab >= 44, `shortest ${ui.shortestTab}px`);
    check(c.name, `[${cat}] header + nav take <=34% of the screen`,
      ui.chromeFrac <= 0.34, `${(ui.chromeFrac * 100).toFixed(1)}%`);
    check(c.name, `[${cat}] nav still consumes the bottom safe-area inset`,
      ui.keepsBottomInset === true, `computed padding-bottom ${ui.paddingBottom}`);
    check(c.name, `[${cat}] no "undefined" leaks into shop copy`,
      ui.undefinedText === false, ui.undefinedText ? 'found in .shop-screen text' : '');
    check(c.name, `[${cat}] the page itself never scrolls (the shell owns scrolling)`,
      ui.docScrolls === false, '');
  }

  // --- 9: the desktop layout must not move ---
  if (c.name.startsWith('desktop-wide')) {
    const d = await page.evaluate(() => {
      const bar = document.querySelector('.shop-tab-bar').getBoundingClientRect();
      return {
        width: +bar.width.toFixed(1),
        centreOffset: +Math.abs((bar.left + bar.right) / 2 - window.innerWidth / 2).toFixed(1),
        bottomGap: +(window.innerHeight - bar.bottom).toFixed(1),
      };
    });
    check(c.name, '[desktop] nav keeps its 720px centred dock', d.width === 720 && d.centreOffset <= 1 && d.bottomGap <= 1,
      `w=${d.width} centre±${d.centreOffset} bottomGap=${d.bottomGap}`);
  }

  // --- 10: the tabs still do their job, and BACK still leaves ---
  await page.evaluate(() => window.__screens.showShop('skins'));
  await page.waitForSelector('.shop-tab-bar', { state: 'visible' });
  await page.click('#shop-tab-indicators');
  await page.waitForTimeout(200);
  const switched = await page.evaluate(() => {
    const active = document.querySelector('.shop-tab.active');
    const bar = document.querySelector('.shop-tab-bar').getBoundingClientRect();
    const shell = document.querySelector('.shop-screen').getBoundingClientRect();
    const scroller = document.querySelector('.shop-scroll');
    return {
      activeId: active && active.id,
      selected: active && active.getAttribute('aria-selected'),
      docked: Math.abs(bar.bottom - shell.bottom) <= 1,
      scrollReset: scroller ? scroller.scrollTop : null,
    };
  });
  check(c.name, 'tapping a tab switches category and leaves the nav docked',
    switched.activeId === 'shop-tab-indicators' && switched.selected === 'true' && switched.docked,
    `active=${switched.activeId} aria-selected=${switched.selected} docked=${switched.docked}`);
  await page.click('#shop-back-btn');
  await page.waitForTimeout(200);
  check(c.name, 'BACK leaves the shop', await page.evaluate(() => !document.querySelector('.shop-screen')), '');

  // --- 11: a real notch. env() resolves to 0 in every browser this harness can
  // drive, so the insets are injected as the custom properties every consumer
  // already reads. A layout that only works at inset 0 is a layout untested. ---
  await page.evaluate(() => window.__screens.showShop('skins'));
  await page.waitForSelector('.shop-tab-bar', { state: 'visible' });
  check(c.name, 'the shop is a three-row shell with exactly one scroller',
    await page.evaluate(() => !!document.querySelector('.shop-screen > .shop-scroll')
      && getComputedStyle(document.querySelector('.shop-screen')).overflowY === 'hidden'), '');
  const noInset = await page.evaluate(() => document.querySelector('.shop-tab-bar').getBoundingClientRect().height);
  await page.addStyleTag({ content: ':root{--sai-top:47px;--sai-bottom:34px;--sai-left:21px;--sai-right:21px}' });
  await page.waitForTimeout(200);
  const inset = await page.evaluate(async () => {
    // Fall back to the old single-scroller shape so a tree without .shop-scroll
    // reports a FAIL for each contract below rather than dying on a null and
    // taking the rest of the run's results with it.
    const sc = document.querySelector('.shop-scroll') || document.querySelector('.shop-screen');
    const bar = document.querySelector('.shop-tab-bar');
    const shell = document.querySelector('.shop-screen');
    const hdr = document.querySelector('.shop-header');
    sc.scrollTop = sc.scrollHeight;
    await new Promise((r) => requestAnimationFrame(r));
    const br = bar.getBoundingClientRect(), sr = shell.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    return {
      barH: br.height, dock: +Math.abs(br.bottom - sr.bottom).toFixed(2),
      padBottom: cs.paddingBottom,
      // The nav's CONTENT must clear the home indicator, not just its box.
      tabsClearIndicator: +(br.bottom - document.querySelector('.shop-tab').getBoundingClientRect().bottom).toFixed(1),
      headerTop: +(hdr.getBoundingClientRect().top).toFixed(1),
      headerPadTop: getComputedStyle(hdr).paddingTop,
      spill: +(sc.getBoundingClientRect().bottom - br.top).toFixed(2),
      // Side insets: nothing may sit outside them.
      barLeft: +br.left.toFixed(1), barRight: +(window.innerWidth - br.right).toFixed(1),
    };
  });
  check(c.name, 'with a 34px home indicator the nav grows and stays docked',
    inset.barH >= noInset + 33 && inset.dock <= 1 && inset.spill <= 1,
    `h ${noInset}->${inset.barH}, dock ${inset.dock}, spill ${inset.spill}, padding-bottom ${inset.padBottom}`);
  check(c.name, 'with a 34px home indicator the tabs sit above it',
    inset.tabsClearIndicator >= 34, `${inset.tabsClearIndicator}px of clearance under the last tab`);
  check(c.name, 'with a 47px notch the header still clears it',
    parseFloat(inset.headerPadTop) >= 47, `header padding-top ${inset.headerPadTop}`);
  check(c.name, 'with 21px side insets the nav stays inside them',
    inset.barLeft >= 21 - 0.5 && inset.barRight >= 21 - 0.5,
    `left ${inset.barLeft}px right ${inset.barRight}px`);

  check(c.name, 'no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  ${f.vp} :: ${f.name} — ${f.detail}`);
  console.log('SHOP NAV: FAIL');
  process.exit(1);
}
console.log('SHOP NAV: ALL PASS');
process.exit(0);
