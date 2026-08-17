import assert from 'node:assert/strict';
import { DEFAULT_MUSIC_VOLUME, MUSIC_CUES, MUSIC_FALLBACK_CUE, MUSIC_VOLUME_KEY, MusicDirector } from './music.js';
import { MIX_VERSION, MIX_VERSION_KEY } from './mix.js';

class FakeAudio {
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.duration = 200;
    this.readyState = 1;
    this.paused = true;
    this.volume = 1;
    this.loads = 0;
    this.plays = 0;
    this.listeners = new Map();
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  load() { this.loads++; const fn = this.listeners.get('loadedmetadata'); if (fn) fn(); }
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}

class FakeTarget {
  constructor() { this.listeners = new Map(); this.visibilityState = 'visible'; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type) { this.listeners.delete(type); }
  fire(type) { const fn = this.listeners.get(type); if (fn) fn(); }
}

const data = new Map();
const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
const media = new FakeAudio();
let restoreDuck = null;
const warnings = [];
const music = new MusicDirector({
  createAudio: () => media,
  storage,
  fadeMs: 0,
  setTimeoutFn: (fn) => { restoreDuck = fn; return 1; },
  clearTimeoutFn: () => {},
  warn: (msg) => warnings.push(msg),
});

assert.equal(music.volume, DEFAULT_MUSIC_VOLUME);
// The one-time mix re-seed runs on the director's own storage, so a surface
// that streams music without building a bus graph still lands on (and stamps)
// the shipped mix rather than an older one.
assert.equal(data.get(MUSIC_VOLUME_KEY), String(DEFAULT_MUSIC_VOLUME), 'a fresh store is seeded');
assert.equal(data.get(MIX_VERSION_KEY), String(MIX_VERSION), 'and stamped');
assert.equal(music.request('menu'), true);
assert.equal(media.src, '', 'pre-unlock request must not load music');
music.unlock();
assert.equal(media.src, 'assets/music/main-menu.mp3');
assert.equal(media.paused, false);
const firstLoads = media.loads;
music.request('menu');
assert.equal(media.loads, firstLoads, 'duplicate cue must not reload');

media.currentTime = 42;
music.request('shop');
assert.equal(media.src, 'assets/music/shop.mp3');
music.request('menu');
assert.equal(media.currentTime, 42, 'menu position survives a shop visit');

music.request('gallery');
assert.equal(media.src, '');
assert.equal(media.paused, true, 'gallery is deliberately music-free');

music.setMasterVolume(0.8);
music.setVolume(0.5);
music.request('brooklyn', { restart: true });
assert.equal(media.currentTime, 0);
assert.equal(media.volume, 0.4);
assert.equal(data.get(MUSIC_VOLUME_KEY), '0.5');
music.setMuted(true);
assert.equal(media.volume, 0);
music.setMuted(false);
assert.equal(media.volume, 0.4);

music.duck(2, 0.25);
assert.equal(media.volume, 0.1);
restoreDuck();
assert.equal(media.volume, 0.4);

const page = new FakeTarget();
const target = new FakeTarget();
music.init(target, page);
page.visibilityState = 'hidden'; page.fire('visibilitychange');
assert.equal(media.paused, true);
page.visibilityState = 'visible'; page.fire('visibilitychange');
assert.equal(media.paused, false);

assert.equal(music.request('not-a-cue'), false);
assert.equal(warnings.length, 1);
music.request('not-a-cue');
assert.equal(warnings.length, 1, 'unknown cue warns once');
// An unknown cue is still REFUSED (`false` above — the caller did not get what
// it asked for) but must never leave the screen dead quiet: the multiplayer
// podium shipped silent for exactly that reason. So the director lands on the
// fallback and keeps playing while the console carries the warning.
assert.equal(music.cue, MUSIC_FALLBACK_CUE, 'an unknown cue lands on the fallback');
assert.equal(media.src, `assets/music/${MUSIC_CUES[MUSIC_FALLBACK_CUE]}`, 'and loads its track');
assert.equal(media.paused, false, 'and actually plays it, rather than going silent');

// An install already stamped keeps the music level its player chose: the
// re-seed is one-shot, not a policy that re-applies on every boot.
const stampedData = new Map([[MUSIC_VOLUME_KEY, '0.5'], [MIX_VERSION_KEY, String(MIX_VERSION)]]);
const stamped = new MusicDirector({
  createAudio: () => new FakeAudio(),
  storage: { getItem: (k) => stampedData.get(k) ?? null, setItem: (k, v) => stampedData.set(k, v) },
  fadeMs: 0,
});
assert.equal(stamped.volume, 0.5, 'a stamped install keeps its chosen music level');
assert.equal(stampedData.get(MUSIC_VOLUME_KEY), '0.5', 'and is not rewritten');

console.log('PASS music director: 29 assertions');
