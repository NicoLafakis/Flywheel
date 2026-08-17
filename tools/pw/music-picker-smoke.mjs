// Manual smoke for the pause-menu track picker (not part of validate.mjs —
// needs a real browser). Serves the game, starts The Lab on a fresh profile,
// and asserts: The Lab plays its own theme, pause lists exactly the default
// pool + THE LAB on a fresh save, picking a track switches the director, and
// resume keeps the override.
import { chromium } from 'playwright';

const fail = (msg) => { console.error('SMOKE FAIL:', msg); process.exit(1); };
const ok = (msg) => console.log('  ok:', msg);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (err) => fail(`page error: ${err}`));

await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });
// Landing → city shelf → launch. Fresh profile: only THE LAB is unlocked.
await page.waitForSelector('#btn-main-play', { state: 'visible', timeout: 30000 });
// The CTA idles with an animation, so Playwright's stability check never
// settles; dispatch the click directly.
await page.$eval('#btn-main-play', (b) => b.click());
await page.waitForSelector('.city-launch-btn:not(.disabled)', { state: 'visible', timeout: 30000 });
await page.$eval('.city-launch-btn:not(.disabled)', (b) => b.click());

await page.waitForFunction(() => window.__audio && window.__audio.music, null, { timeout: 15000 });
await page.waitForFunction(
  () => window.__audio.music._current === 'gallery', null, { timeout: 15000 },
);
ok('The Lab run starts on the gallery cue (the-lab.mp3)');
const src = await page.evaluate(() => window.__audio.music.audio.src);
if (!src.endsWith('the-lab.mp3')) fail(`expected the-lab.mp3, got ${src}`);
ok('director is armed with the-lab.mp3');

await page.keyboard.press('Escape');
await page.waitForSelector('.pause-music', { state: 'visible', timeout: 5000 });
const tracks = await page.$$eval('.pause-music-track', (bs) => bs.map((b) => b.textContent));
if (tracks.length !== 9) fail(`fresh save should offer 9 tracks (8 pool + THE LAB), got ${tracks.length}: ${tracks}`);
ok(`fresh save offers 9 tracks: ${tracks.join(', ')}`);
const playing = await page.$eval('.pause-music-track.playing', (b) => b.textContent).catch(() => null);
if (playing !== 'THE LAB') fail(`expected THE LAB highlighted, got ${playing}`);
ok('THE LAB is highlighted as now playing');

await page.click('.pause-music-track:text-is("Block Drift")');
await page.waitForFunction(
  () => window.__audio.music._current === 'flywheel-block-drift', null, { timeout: 5000 },
);
ok('picking Block Drift switches the director immediately (preview while paused)');

await page.keyboard.press('Escape'); // resume
await page.waitForFunction(
  () => window.__audio.music._wanted === 'flywheel-block-drift', null, { timeout: 5000 },
);
ok('resume keeps the session override');

await browser.close();
console.log('SMOKE PASS: track picker end-to-end');
process.exit(0);
