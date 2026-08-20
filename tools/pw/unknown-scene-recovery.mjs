// Browser contract for the unknown-scene recovery path (js/main.js
// failSceneLaunch + the two `.catch` wirings; js/voxelsim.js unknown-scene
// throw). Not part of validate.mjs — the defect is a browser lifecycle
// behaviour (an unhandled promise rejection inside an async
// requestAnimationFrame callback) and has no Node-side surface at all.
//
// Run: node tools/pw/unknown-scene-recovery.mjs   (with `python -m http.server 8000`)
//      FW_HEADED=1 to watch.
//
// WHAT IS BEING PROTECTED
//
// js/voxelsim.js refuses to construct a scene with no SCENE_IMPORTERS entry,
// because the old behaviour was to fall through and build the GALLERY under
// the requested city's label — a wrong map that looks fine. That throw is
// correct, but it lands inside `requestAnimationFrame(() => rAF(async () => …))`,
// and an async callback handed to rAF returns its promise to nobody. Uncaught,
// the player sits on a loading screen that never resolves, with
// `body.mode-sandbox` still applied so the next menu they reach is restyled.
// Trading "wrong map, looks fine" for "no map, looks broken and says nothing"
// is not an improvement, so both halves are asserted here.
//
// WHY THE RED ARM IS A MUTATION AND NOT `git show HEAD:js/main.js`
//
// A RED arm pinned to a commit stops being red the moment the fix is committed,
// and then passes forever while asserting nothing. Instead the RED arm is the
// SHIPPED source with the `.catch(…)` wirings mechanically stripped, so the
// contrast is regenerated on every run against whatever main.js currently says.
// The strip is itself asserted to have changed the source (see MUTATION GUARD):
// a mutation that silently fails to apply makes both arms identical and turns
// the whole file green on a broken tree.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.FW_BASE || 'http://localhost:8000';
const HEADLESS = process.env.FW_HEADED !== '1';
// Deliberately not a near-miss of a real scene id: this must fail the
// registration check, not a fuzzy match, and it must never be mistaken for a
// city someone is midway through adding.
const BAD = 'atlantis-typo';

const MAIN = new URL('../../js/main.js', import.meta.url);
const SRC = readFileSync(MAIN, 'utf8');

// --- MUTATION GUARD -------------------------------------------------------
// The RED arm only means anything if the strip actually removes the recovery.
const CATCH_RE = /\.catch\(\(err\) => failSceneLaunch\([^)]*\)\)/g;
const found = SRC.match(CATCH_RE) || [];
const RED_SRC = SRC.replace(CATCH_RE, '');
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

console.log('mutation guard');
check(found.length === 2, 'js/main.js wires failSceneLaunch at both launch sites',
  `found ${found.length}, expected 2 (startVoxelSandbox + startMultiplayerMatch)`);
check(RED_SRC !== SRC, 'stripping the .catch wirings changes the source',
  RED_SRC === SRC ? 'the RED arm would be identical to GREEN and prove nothing' : `${SRC.length - RED_SRC.length} bytes removed`);
check(/function failSceneLaunch\(/.test(SRC), 'failSceneLaunch is defined in js/main.js');
if (failures) {
  console.log(`\n${failures} mutation-guard failure(s) — the browser arms were not run, because they could not have been meaningful.`);
  process.exit(1);
}

async function arm(label, body) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  if (body != null) {
    await page.route('**/js/main.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body }));
  }

  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__screens && window.__screens.actions,
    null, { polling: 100, timeout: 30000 });

  // `pageerror` does NOT fire for an unhandled promise rejection, which is
  // exactly the failure being tested, so the page reports them itself.
  await page.evaluate(() => {
    window.__rejections = [];
    window.addEventListener('unhandledrejection', (e) => {
      window.__rejections.push(String((e.reason && e.reason.message) || e.reason));
    });
  });

  // startChallenge -> startVoxelSandbox directly. An arbitrary scene id IS the
  // defect input, so nothing about the catalog needs patching to produce it.
  await page.evaluate((s) => window.__screens.actions.startChallenge(s, 'challenge3m'), BAD);
  // A real city build takes seconds; a hung loader is still a loader at 8 s and
  // a recovered one is on a menu long before that.
  await page.waitForTimeout(8000);

  const state = await page.evaluate(() => ({
    loaderUp: Boolean(document.querySelector('.loading-screen')),
    citySelectUp: Boolean(document.querySelector('.fw-city-select')),
    modeSandbox: document.body.classList.contains('mode-sandbox'),
    rejections: window.__rejections.slice(),
  }));
  await browser.close();

  state.namedErrors = errors.filter((t) => t.includes(BAD));
  console.log(`\n${label}`);
  console.log(`  loader still up: ${state.loaderUp} | city select: ${state.citySelectUp} | body.mode-sandbox: ${state.modeSandbox} | unhandled rejections: ${state.rejections.length}`);
  return state;
}

const red = await arm('RED arm (recovery stripped)', RED_SRC);
check(red.loaderUp, 'RED: an unrecovered failure strands the player on the loading screen',
  red.loaderUp ? '' : 'the RED arm did not reproduce the defect, so GREEN proves nothing');
check(red.rejections.length > 0, 'RED: the throw surfaces as an unhandled promise rejection');
check(red.modeSandbox, 'RED: body.mode-sandbox is left applied, restyling the next menu');

const green = await arm('GREEN arm (shipped js/main.js)', null);
check(!green.loaderUp, 'GREEN: the loading screen is torn down');
check(green.citySelectUp, 'GREEN: the player is returned to City Select');
check(!green.modeSandbox, 'GREEN: body.mode-sandbox is cleared');
check(green.rejections.length === 0, 'GREEN: no unhandled promise rejection',
  green.rejections.length ? JSON.stringify(green.rejections) : '');
check(green.namedErrors.length > 0, `GREEN: a console error names the offending scene id '${BAD}'`);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
