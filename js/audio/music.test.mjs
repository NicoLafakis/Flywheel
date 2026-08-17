import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_MUSIC_VOLUME, MUSIC_CUES, MUSIC_FALLBACK_CUE, MUSIC_VOLUME_KEY, MusicDirector } from './music.js';
import { MIX_VERSION, MIX_VERSION_KEY } from './mix.js';

class FakeAudio {
  constructor() {
    // `src` is a counted accessor, not a plain field: the whole point of arming
    // the element before the first gesture is that the gesture costs NO further
    // network work, and "no second src assignment" is the only way to say that
    // in a fake that has no network.
    this._src = '';
    this.srcSets = 0;
    this.currentTime = 0;
    this.duration = 200;
    this.readyState = 1;
    this.paused = true;
    this.volume = 1;
    this.loads = 0;
    this.plays = 0;
    this.listeners = new Map();
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.srcSets++; }
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
// ---------------------------------------------------------------------------
// Pre-gesture ARMING.
//
// Browsers gate play() behind a user gesture and that is not ours to fix. What
// WAS ours: the download was gated behind the same gesture, so the first tap
// bought a network wait instead of sound. Assigning src, setting preload='auto'
// and calling load() are all allowed while locked — only play() is not — so the
// cue is fully buffered before the tap and the tap only has to start it.
// ---------------------------------------------------------------------------
assert.equal(music.request('menu'), true);
assert.equal(media.src, 'assets/music/main-menu.mp3', 'a pre-gesture request must ARM the element');
assert.equal(media.preload, 'auto', 'and lift preload off "none", or no bytes are fetched');
assert.equal(media.loads, 1, 'and kick the fetch with load()');
assert.equal(media.plays, 0, 'but must NOT attempt playback while locked');
assert.equal(media.paused, true, 'so the element is still parked');
const armedSrcSets = media.srcSets;
const armedLoads = media.loads;
music.unlock();
assert.equal(media.src, 'assets/music/main-menu.mp3');
assert.equal(media.srcSets, armedSrcSets, 'the gesture must not re-assign src — that would re-fetch');
assert.equal(media.loads, armedLoads, 'nor call load() again: the bytes were already armed');
assert.equal(media.plays, 1, 'the gesture only has to press play');
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
assert.equal(media.src, 'assets/music/the-lab.mp3',
  'The Lab (gallery) plays its own theme since the-lab.mp3 shipped');

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

// ---------------------------------------------------------------------------
// Static guard on index.html's preload link. Invisible to any runtime test here
// (the director never reads the document) and exactly the kind of thing that
// rots silently: a preload whose `as` does not match the request the <audio>
// element actually makes is a whole extra download of the menu track, plus the
// "preloaded but not used" console warning. `as="audio"` is the media
// destination; `crossorigin` would put the entry in the CORS cache partition,
// which a same-origin <audio> without a crossorigin attribute never consults.
// ---------------------------------------------------------------------------
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const menuPreload = /<link\s+rel="preload"[^>]*main-menu\.mp3[^>]*>/i.exec(indexHtml);
assert.ok(menuPreload, 'index.html must still preload the menu track');
assert.match(menuPreload[0], /\bas="audio"/,
  'the menu-track preload must use as="audio", or the <audio> element cannot reuse it');
assert.doesNotMatch(menuPreload[0], /crossorigin/i,
  'no crossorigin on a same-origin track — it partitions the entry away from the audio element');
assert.doesNotMatch(indexHtml, /bgMusicPreload/,
  'the boot script must not fetch the menu track a second time');

console.log('PASS music director: 40 assertions');
