// Pause-menu and Help-rail mobile contract (not part of validate.mjs — needs a
// real browser and a real compositor).
//
// Written RED against the 2026-08-19 tree, where two menus failed the same way
// at short viewports:
//
//   * PAUSE, 844x390 landscape — the phone-in-landscape case the game is
//     actually played in — put the MUSIC picker (9 tracks, 172px tall) in the
//     primary slot and pushed RESTART to y=556 and CITIES to y=622 on a 390px
//     screen. Both were off the fold; 360x640 portrait buried CITIES too
//     (bottom 679 of 640). Pause is a panic surface: the two things a player
//     reaches for under time pressure were the two not on screen.
//   * HELP tab rail, 360px — `.fw-help-tab` is `flex: 1 1 0%` with a 105px
//     min-width floor, so the pill shrinks to 105px while the label span keeps
//     its automatic min-content width. WALKTHROUGH is one unbreakable word, so
//     it painted 12.9px PAST its own pill instead of the rail scrolling.
//
// Both are viewport-shape bugs, so viewport shape is the dimension here. And
// `hasTouch` is a dimension too, never a baked-in constant — a touch-only
// assumption shipped an inert joystick in this repo once, and every context in
// that harness carried hasTouch:true so nothing caught it.
//
// Run: node tools/pw/menu-mobile.mjs   (with `python -m http.server 8000`)
// Headless by default so it can never block on a windowing system that is not
// there; FW_HEADED=1 to watch it.
import { chromium } from 'playwright';

const BASE = process.env.FW_BASE || 'http://localhost:8000';
const HEADED = process.env.FW_HEADED === '1';

const results = [];
const check = (vp, name, pass, detail) => {
  results.push({ vp, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const CASES = [
  // Mobile first: the phone shapes lead, and the two that carry the defect
  // (844x390 landscape, 360x640 portrait) lead them.
  { name: 'phone-landscape 844x390', vp: { width: 844, height: 390 }, touch: true },
  { name: 'small-portrait  360x640', vp: { width: 360, height: 640 }, touch: true },
  { name: 'phone-portrait  390x844', vp: { width: 390, height: 844 }, touch: true },
  { name: 'tiny-portrait   320x568', vp: { width: 320, height: 568 }, touch: true },
  { name: 'small-landscape 640x360', vp: { width: 640, height: 360 }, touch: true },
  // The non-touch blind spot: a short desktop window is not a phone, and a fix
  // that only landed under `(pointer: coarse)` would ship inert here.
  { name: 'desktop-short  1280x420', vp: { width: 1280, height: 420 }, touch: false },
  { name: 'desktop-narrow  380x820', vp: { width: 380, height: 820 }, touch: false },
  { name: 'desktop-wide   1440x900', vp: { width: 1440, height: 900 }, touch: false },
];

const browser = await chromium.launch({ headless: !HEADED });

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
  // `polling: 200` rather than the default 'raf': a HEADED window that the OS
  // has occluded or minimised stops firing requestAnimationFrame entirely, so a
  // raf-polled predicate can sit there until the timeout with the app perfectly
  // healthy behind it. That is exactly how the earlier city-select harness read
  // as a hang.
  await page.waitForFunction(() => window.__screens, null, { timeout: 30000, polling: 200 });

  // ---------------------------------------------------------------- PAUSE ---
  await page.evaluate(() => window.__screens.showPause());
  // Wait on the SCREEN, not on the fix's own wrapper class: a harness that
  // waits for the element the fix introduces cannot report the defect it was
  // written to catch — it just dies on a selector timeout.
  await page.waitForSelector('.screen button', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(150);

  const pause = await page.evaluate(() => {
    const scr = document.querySelector('.screen');
    const byText = (t) => [...scr.querySelectorAll('button')]
      .find((b) => b.textContent.trim().toUpperCase().startsWith(t));
    const rect = (b) => {
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) };
    };
    const musicList = document.querySelector('.pause-music-list');
    const toggle = document.querySelector('.pause-music-toggle');
    return {
      vh: window.innerHeight, vw: window.innerWidth,
      resume: rect(byText('RESUME')), restart: rect(byText('RESTART')),
      cities: rect(byText('CITIES')), settings: rect(byText('SETTINGS')),
      help: rect(byText('HELP')),
      toggle: rect(toggle),
      toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
      listVisible: musicList ? musicList.getBoundingClientRect().height > 1 : false,
      trackCount: document.querySelectorAll('.pause-music-track').length,
      pageScrollsX: document.scrollingElement.scrollWidth > window.innerWidth + 1,
      screenScrollsX: scr.scrollWidth > scr.clientWidth + 1,
    };
  });

  // --- 1: the panic buttons are on screen, at every viewport, unscrolled ----
  const onScreen = (r) => r && r.top >= 0 && r.bottom <= pause.vh + 1;
  for (const [label, r] of [['RESUME', pause.resume], ['RESTART', pause.restart], ['CITIES', pause.cities]]) {
    check(c.name, `pause: ${label} is fully above the fold without scrolling`,
      onScreen(r), r ? `top ${r.top} bottom ${r.bottom} of ${pause.vh}` : 'button not found');
  }
  // SETTINGS and HELP are secondary but still should not need a scroll on any
  // shape this game ships to.
  for (const [label, r] of [['SETTINGS', pause.settings], ['HELP & FAQ', pause.help]]) {
    check(c.name, `pause: ${label} is on screen`,
      onScreen(r), r ? `bottom ${r.bottom} of ${pause.vh}` : 'button not found');
  }

  // --- 2: they are real touch targets --------------------------------------
  const shortest = Math.min(...[pause.resume, pause.restart, pause.cities, pause.settings, pause.help]
    .filter(Boolean).map((r) => r.h));
  check(c.name, 'pause: every action button is a >=44px tap target',
    shortest >= 44, `shortest ${shortest}px`);

  // --- 3: the music picker is a disclosure, collapsed on short viewports ----
  // The picker is exploratory; it may never hold the primary slot. On a short
  // viewport it collapses to one row and opens on demand.
  check(c.name, 'pause: music picker is a disclosure with a >=44px row',
    pause.toggle !== null && pause.toggle.h >= 44,
    pause.toggle ? `toggle ${pause.toggle.h}px` : 'no .pause-music-toggle');
  if (pause.vh < 700) {
    check(c.name, 'pause: music picker starts collapsed on a short viewport',
      pause.toggleExpanded === 'false' && !pause.listVisible,
      `aria-expanded=${pause.toggleExpanded} listVisible=${pause.listVisible}`);
  } else {
    check(c.name, 'pause: music picker starts open on a tall viewport',
      pause.toggleExpanded === 'true' && pause.listVisible,
      `aria-expanded=${pause.toggleExpanded} listVisible=${pause.listVisible}`);
  }
  check(c.name, 'pause: never scrolls horizontally',
    pause.pageScrollsX === false && pause.screenScrollsX === false,
    `page=${pause.pageScrollsX} screen=${pause.screenScrollsX}`);

  // --- 4: opening the picker actually works, and does not evict the actions -
  // A disclosure that hides the list forever is not a fix, and one that pushes
  // RESTART back off the fold when opened has only moved the bug.
  // Drive it BOTH ways from whatever state this viewport starts in — a tall
  // viewport starts open, so a single blind click would be testing the CLOSE
  // direction while claiming to test the open one.
  const readToggle = () => page.evaluate(() =>
    document.querySelector('.pause-music-toggle')?.getAttribute('aria-expanded'));
  const startState = await readToggle();
  await page.click('.pause-music-toggle').catch(() => {});
  await page.waitForTimeout(180);
  const flipped = await readToggle();
  check(c.name, 'pause: the disclosure flips state when tapped',
    flipped !== null && flipped !== startState, `${startState} -> ${flipped}`);
  if (flipped === 'false') {
    await page.click('.pause-music-toggle').catch(() => {});
    await page.waitForTimeout(180);
  }
  const opened = await page.evaluate(() => {
    const scr = document.querySelector('.screen');
    const byText = (t) => [...scr.querySelectorAll('button')]
      .find((b) => b.textContent.trim().toUpperCase().startsWith(t));
    const list = document.querySelector('.pause-music-list');
    const t = document.querySelector('.pause-music-toggle');
    const r = byText('RESTART');
    return {
      expanded: t && t.getAttribute('aria-expanded'),
      listVisible: list ? list.getBoundingClientRect().height > 1 : false,
      tracks: document.querySelectorAll('.pause-music-track').length,
      restartBottom: r ? +r.getBoundingClientRect().bottom.toFixed(1) : null,
      vh: window.innerHeight,
    };
  });
  check(c.name, 'pause: the disclosure opens the full track list',
    opened.expanded === 'true' && opened.listVisible && opened.tracks > 1,
    `expanded=${opened.expanded} visible=${opened.listVisible} tracks=${opened.tracks}`);
  check(c.name, 'pause: RESTART stays on the fold with the picker open',
    opened.restartBottom !== null && opened.restartBottom <= opened.vh + 1,
    `RESTART bottom ${opened.restartBottom} of ${opened.vh}`);

  // ----------------------------------------------------------------- HELP ---
  await page.evaluate(() => window.__screens.showHelp(() => {}));
  await page.waitForSelector('.fw-help-nav-tabs', { state: 'visible', timeout: 10000 });
  // The help card animates in with a transform; a rect read mid-animation is a
  // scaled rect, so wait for it to settle before measuring anything.
  await page.waitForTimeout(600);

  const help = await page.evaluate(() => {
    const rail = document.querySelector('.fw-help-nav-tabs');
    const rr = rail.getBoundingClientRect();
    const tabs = [...rail.querySelectorAll('.fw-help-tab')].map((t) => {
      const r = t.getBoundingClientRect();
      const label = t.querySelector('.fw-tab-name');
      const lr = label.getBoundingClientRect();
      return {
        name: label.textContent,
        // The label's own box painting outside the pill's box: the literal
        // form of "the label overruns its pill".
        spill: +(lr.right - r.right).toFixed(1),
        // And the pill's own content overflowing its content box, which is the
        // cause rather than the symptom.
        contentOverflow: +(t.scrollWidth - Math.ceil(r.width)).toFixed(1),
        // A label clipped by ellipsis/hidden overflow is a different failure
        // with the same cause, so catch that too.
        labelClipped: label.scrollWidth > Math.ceil(lr.width) + 1,
        h: +r.height.toFixed(1),
        w: +r.width.toFixed(1),
      };
    });
    return {
      railScrolls: rail.scrollWidth > rail.clientWidth + 1,
      railClientW: rail.clientWidth, railScrollW: rail.scrollWidth,
      railRight: +rr.right.toFixed(1),
      pageScrollsX: document.scrollingElement.scrollWidth > window.innerWidth + 1,
      tabs,
    };
  });

  const spilled = help.tabs.filter((t) => t.spill > 0.5);
  check(c.name, 'help: no tab label paints outside its own pill',
    spilled.length === 0,
    spilled.map((t) => `${t.name} +${t.spill}px past a ${t.w}px pill`).join(' | ')
      || help.tabs.map((t) => `${t.name} ${t.w}px`).join(', '));
  const over = help.tabs.filter((t) => t.contentOverflow > 1);
  check(c.name, 'help: no tab pill is narrower than its own content',
    over.length === 0, over.map((t) => `${t.name} overflows by ${t.contentOverflow}px`).join(' | '));
  const clipped = help.tabs.filter((t) => t.labelClipped);
  check(c.name, 'help: every tab label reads in full',
    clipped.length === 0, clipped.map((t) => t.name).join(' | '));
  const shortestTab = Math.min(...help.tabs.map((t) => t.h));
  check(c.name, 'help: every tab is a >=44px tap target',
    shortestTab >= 44, `shortest ${shortestTab}px`);
  check(c.name, 'help: rail overflow never becomes page-level horizontal scroll',
    help.pageScrollsX === false, `pageScrollsX=${help.pageScrollsX}`);

  check(c.name, 'no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  ${f.vp} :: ${f.name} — ${f.detail}`);
  console.log('MENU MOBILE: FAIL');
  process.exit(1);
}
console.log('MENU MOBILE: ALL PASS');
process.exit(0);
