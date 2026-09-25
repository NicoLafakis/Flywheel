// Title boot: the splash must not report a slow boot as a failed one, and the
// menu must not wait for the Brooklyn backdrop.
//
// PERF-2026-09-25-load-times reproduced "LOAD ERROR" on every 4x-CPU boot: the
// 25 s watchdog could not run during the backdrop's one long build task, ran
// the instant it ended, and saw `done` still false. This drives the REAL inline
// boot script from index.html on a fake clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const bootSrc = scripts.find((s) => s.includes('__setBootProgress'));
assert.ok(bootSrc, 'inline boot script found');

function el() {
  return {
    style: {}, textContent: '', parentNode: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
    querySelector() { return null; }, appendChild() {}, remove() { this.parentNode = null; this.removed = true; },
  };
}

function boot() {
  let now = 0, seq = 0;
  const timers = [];
  let raf = [];
  const els = { 'boot-progress-bar': el(), 'boot-percentage-text': el(), 'boot-status-text': el(), 'boot-splash': el() };
  let resources = 0;
  const win = {
    addEventListener() {},
    performance: { now: () => now, getEntriesByType: (t) => (t === 'resource' ? new Array(resources) : []) },
    document: {
      getElementById: (id) => (id === 'boot-splash' && els[id].removed ? null : els[id] || null),
      createElement: () => el(),
    },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    setTimeout: (fn, ms) => { timers.push({ at: now + (ms || 0), fn, id: ++seq }); return seq; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    console: { error() {}, warn() {}, log() {} },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(bootSrc, win);
  // Event loop: due timers first (in due order), then one animation frame.
  const run = (until) => {
    while (now <= until) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      if (timers.length && timers[0].at <= now) { timers.shift().fn(); continue; }
      const frame = raf; raf = [];
      for (const fn of frame) fn(now);
      const nextT = timers.length ? timers[0].at : Infinity;
      now = Math.min(until + 1, Math.max(now + 16, Math.min(nextT, now + 16)));
    }
  };
  // A long main-thread task: nothing runs until it ends.
  const block = (until) => { now = until; };
  const status = () => els['boot-status-text'].textContent;
  return { win, run, block, status, els, set resources(n) { resources = n; }, get now() { return now; } };
}

// 1. Slow CPU (the report's case): progress 45 at 1 s, then a build task that
//    ends at 26 s having finished the backdrop (100). Must not say LOAD ERROR.
{
  const b = boot();
  b.run(1000);
  b.win.__setBootProgress(45, 'FETCHING');
  b.run(3000);
  b.block(26000);
  b.win.__setBootProgress(100, 'READY TO ROLL!');
  b.run(40000);
  assert.notEqual(b.status(), 'LOAD ERROR', 'slow-but-progressing CPU boot reported as failed');
  assert.ok(b.els['boot-splash'].removed, 'splash completes and is removed');
}

// 2. Slow network: files keep arriving every 3 s until 40 s, then the game
//    boots. Must not say LOAD ERROR.
{
  const b = boot();
  for (let t = 3000, n = 1; t <= 40000; t += 3000, n++) { b.run(t); b.resources = n * 5; }
  b.win.__setBootProgress(100, 'READY TO ROLL!');
  b.run(60000);
  assert.notEqual(b.status(), 'LOAD ERROR', 'slow-but-progressing network boot reported as failed');
  assert.ok(b.els['boot-splash'].removed, 'splash completes and is removed');
}

// 3. Dead boot: nothing ever progresses. The watchdog must still fire.
{
  const b = boot();
  b.run(60000);
  assert.equal(b.status(), 'LOAD ERROR', 'a boot that never progresses must still report');
}

// 4. The menu no longer waits for the backdrop: main.js clears the splash
//    itself, and the backdrop is built only once the splash is gone.
{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../js/ui/menuscene.js', import.meta.url), 'utf8');
  assert.ok(!/immediate:\s*true/.test(main),'main.js must not build the backdrop before the menu');
  assert.ok(!/onReady:\s*finishBootSplash/.test(main), 'the splash must not wait on the backdrop');
  assert.ok(/^finishBootSplash\(\);/m.test(main), 'main.js finishes the splash once the title is mounted');
  assert.ok(/getElementById\('boot-splash'\)/.test(menu), 'backdrop build waits for the splash to clear');
}
console.log('boot-watchdog: passed');
