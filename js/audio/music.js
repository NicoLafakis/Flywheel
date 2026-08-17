// Streamed state-aware music. Unlike short SFX, the 47.49 MiB soundtrack is
// never decoded as one WebAudio pool: one HTMLAudioElement loads only the cue
// the current screen or scene requests.

import { DEFAULT_MUSIC_VOLUME, MUSIC_VOLUME_KEY, reseedAudioMix } from './mix.js';

// Re-exported, not redefined: ./mix.js is the single description of all three
// shipped levels (effects, ambience, music) so a retune is one edit rather than
// a hunt across engine.js, save.js, main.js and the settings screen. Every
// existing importer of these two names still imports them from here.
export { DEFAULT_MUSIC_VOLUME, MUSIC_VOLUME_KEY };

export const MUSIC_CUES = Object.freeze({
  menu: 'main-menu.mp3',
  title: 'main-menu.mp3',
  shop: 'shop.mp3',
  pause: 'pause.mp3',
  results: 'post-game.mp3',
  // The multiplayer podium is a post-game screen, so it shares the post-game
  // track by alias rather than by a second copy on disk — the same way `title`
  // shares the menu theme and `tokyo` shares lower Manhattan's. Registered here
  // because js/main.js's two game-over handlers ask for it by this name, and an
  // unregistered name used to leave the loudest moment in the game silent.
  victory: 'post-game.mp3',
  brooklyn: 'brooklyn.mp3',
  boston: 'boston.mp3',
  cambridge: 'cambridge.mp3',
  chicago: 'chicago.mp3',
  manhattan: 'lower-manhattan.mp3',
  'upper-manhattan': 'upper-manhattan.mp3',
  tokyo: 'lower-manhattan.mp3',
  gallery: null,   // Owner decision: the dev physics gallery stays music-free.
});

// Where an unrecognised cue name lands. A player cannot tell "this screen has a
// bug" from "this screen is quiet on purpose" — both are silence — so a name the
// registry does not know plays the signature theme instead of nothing, while the
// console still warns so the mismatch stays visible in development. The menu
// theme is the choice because it is the one track that is always tonally
// defensible as "Flywheel is running". tools/music-cue.test.mjs is the real
// guard: it fails the build on any caller/registry mismatch, so in shipped code
// this path should never run.
export const MUSIC_FALLBACK_CUE = 'menu';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function defaultAudio() {
  return new Audio();
}

export class MusicDirector {
  constructor({
    base = 'assets/music/',
    createAudio = defaultAudio,
    storage = defaultStorage(),
    fadeMs = 250,
    setIntervalFn = (fn, ms) => globalThis.setInterval(fn, ms),
    clearIntervalFn = (id) => globalThis.clearInterval(id),
    setTimeoutFn = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeoutFn = (id) => globalThis.clearTimeout(id),
    warn = (...args) => console.warn(...args),
  } = {}) {
    this.base = base;
    this.audio = createAudio();
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.audio.playsInline = true;
    this._storage = storage;
    this._fadeMs = Math.max(0, fadeMs);
    this._setInterval = setIntervalFn;
    this._clearInterval = clearIntervalFn;
    this._setTimeout = setTimeoutFn;
    this._clearTimeout = clearTimeoutFn;
    this._warn = warn;

    this._wanted = null;
    this._current = null;
    this._offsets = new Map();
    this._unlocked = false;
    this._hidden = false;
    this._muted = false;
    this._master = 1;
    this._music = DEFAULT_MUSIC_VOLUME;
    this._duck = 1;
    this._fade = 1;
    this._fadeTimer = null;
    this._duckTimer = null;
    this._transition = 0;
    this._warned = new Set();
    this._bindings = [];

    // Same one-time re-seed the AudioEngine runs, against THIS director's
    // storage: a surface that streams music without building a bus graph (and
    // any test that injects its own store) still lands on the current mix.
    // Stamped, so whichever of the two constructs first does the work and the
    // other finds nothing to do.
    reseedAudioMix(this._storage);
    try {
      const saved = parseFloat(this._storage && this._storage.getItem(MUSIC_VOLUME_KEY));
      if (Number.isFinite(saved)) this._music = clamp01(saved);
    } catch { /* storage may be blocked */ }

    this.audio.addEventListener('loadedmetadata', () => {
      this._restoreOffset();
      this._safePlay();
    });
    this.audio.addEventListener('error', () => this._warnOnce(
      `cue:${this._current}`,
      `music: ${this._current || 'unknown cue'} unavailable`,
    ));
    this._applyVolume();
  }

  init(target = globalThis.window, doc = globalThis.document) {
    const unlock = () => this.unlock();
    if (target && target.addEventListener) {
      target.addEventListener('pointerdown', unlock, { passive: true });
      target.addEventListener('touchstart', unlock, { passive: true });
      target.addEventListener('click', unlock, { passive: true });
      target.addEventListener('keydown', unlock);
      const pageHide = () => this.pauseForPage();
      const pageShow = () => this.resumeForPage();
      target.addEventListener('pagehide', pageHide);
      target.addEventListener('pageshow', pageShow);
      this._bindings.push(
        [target, 'pointerdown', unlock],
        [target, 'touchstart', unlock],
        [target, 'click', unlock],
        [target, 'keydown', unlock],
        [target, 'pagehide', pageHide],
        [target, 'pageshow', pageShow],
      );
    }
    if (doc && doc.addEventListener) {
      const visibility = () => {
        if (doc.visibilityState === 'hidden') this.pauseForPage();
        else this.resumeForPage();
      };
      doc.addEventListener('visibilitychange', visibility);
      this._bindings.push([doc, 'visibilitychange', visibility]);
      this._hidden = doc.visibilityState === 'hidden';
    }
    return this;
  }

  destroy() {
    for (const [target, type, fn] of this._bindings) target.removeEventListener(type, fn);
    this._bindings.length = 0;
    this._cancelFade();
    if (this._duckTimer !== null) this._clearTimeout(this._duckTimer);
    this.audio.pause();
  }

  get cue() { return this._wanted; }
  get volume() { return this._music; }

  unlock() {
    this._unlocked = true;
    if (this._wanted && this._current !== this._wanted) {
      this._switchTo(this._wanted, false);
    } else {
      this._safePlay();
    }
  }

  request(cue, { restart = false } = {}) {
    if (!Object.prototype.hasOwnProperty.call(MUSIC_CUES, cue)) {
      this._warnOnce(`unknown:${cue}`, `music: unknown cue "${cue}" — falling back to "${MUSIC_FALLBACK_CUE}"`);
      // Still `false`: the caller did not get the cue it asked for, and that
      // contract is what the unknown-cue test asserts. But it does get music.
      // The self-comparison guards against a stack overflow in the audio path
      // if the fallback itself is ever unregistered.
      if (cue !== MUSIC_FALLBACK_CUE) this.request(MUSIC_FALLBACK_CUE, { restart });
      return false;
    }
    if (restart) this._offsets.delete(cue);
    if (this._wanted === cue && !restart) {
      if (this._unlocked && this.audio.paused) this._safePlay();
      return true;
    }
    this._wanted = cue;
    if (this._unlocked) this._switchTo(cue, restart);
    return true;
  }

  setMuted(muted) {
    this._muted = !!muted;
    this._applyVolume();
    if (!this._muted) this._safePlay();
  }

  setMasterVolume(value) {
    if (!Number.isFinite(value)) return;
    this._master = clamp01(value);
    this._applyVolume();
  }

  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this._music = clamp01(value);
    try {
      if (this._storage) this._storage.setItem(MUSIC_VOLUME_KEY, String(this._music));
    } catch { /* best effort */ }
    this._applyVolume();
  }

  duck(seconds = 2.5, depth = 0.45) {
    this._duck = clamp01(depth);
    this._applyVolume();
    if (this._duckTimer !== null) this._clearTimeout(this._duckTimer);
    this._duckTimer = this._setTimeout(() => {
      this._duckTimer = null;
      this._duck = 1;
      this._applyVolume();
    }, Math.max(0, seconds) * 1000);
  }

  pauseForPage() {
    this._hidden = true;
    this._saveOffset();
    this.audio.pause();
  }

  resumeForPage() {
    this._hidden = false;
    if (this._unlocked && this._current !== this._wanted) this._switchTo(this._wanted, false);
    else this._safePlay();
  }

  _switchTo(cue, restart) {
    if (this._current === cue) {
      if (restart) {
        try { this.audio.currentTime = 0; } catch { /* metadata not ready */ }
      }
      this._safePlay();
      return;
    }
    const token = ++this._transition;
    const commit = () => {
      if (token !== this._transition) return;
      this._saveOffset();
      this.audio.pause();
      this._current = cue;
      const file = MUSIC_CUES[cue];
      if (!file) {
        this.audio.removeAttribute('src');
        this._fade = 1;
        this._applyVolume();
        return;
      }
      this._fade = this._fadeMs > 0 ? 0 : 1;
      this.audio.src = this.base + file;
      this.audio.preload = 'auto';
      if (restart) this._offsets.delete(cue);
      // Browsers reset this on a source swap, but making it explicit gives the
      // retained-offset contract one starting point across WebViews and tests.
      try { this.audio.currentTime = 0; } catch { /* metadata not ready */ }
      try { this.audio.load(); } catch { /* browser starts from src assignment */ }
      this._restoreOffset();
      this._safePlay();
      this._ramp(this._fade, 1, this._fadeMs);
    };
    if (this._current && !this.audio.paused && this._fadeMs > 0) {
      this._ramp(this._fade, 0, this._fadeMs, commit);
    } else {
      commit();
    }
  }

  _saveOffset() {
    if (!this._current) return;
    const at = Number(this.audio.currentTime);
    if (Number.isFinite(at) && at >= 0) this._offsets.set(this._current, at);
  }

  _restoreOffset() {
    if (!this._current || !this._offsets.has(this._current)) return;
    let at = this._offsets.get(this._current);
    const duration = Number(this.audio.duration);
    if (Number.isFinite(duration) && duration > 0) at %= duration;
    try { this.audio.currentTime = at; } catch { /* metadata not ready */ }
  }

  _safePlay() {
    if (!this._unlocked || this._hidden || this._muted || !this.audio.paused
      || !this._current || !MUSIC_CUES[this._current]) return;
    try {
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => this._warnOnce(
        `play:${this._current}`,
        `music: browser blocked cue "${this._current}"`,
      ));
    } catch {
      this._warnOnce(`play:${this._current}`, `music: could not play cue "${this._current}"`);
    }
  }

  _ramp(from, to, ms, done) {
    this._cancelFade();
    if (!(ms > 0)) {
      this._fade = to;
      this._applyVolume();
      if (done) done();
      return;
    }
    const steps = Math.max(1, Math.ceil(ms / 25));
    let step = 0;
    this._fade = from;
    this._applyVolume();
    this._fadeTimer = this._setInterval(() => {
      step++;
      this._fade = from + (to - from) * Math.min(1, step / steps);
      this._applyVolume();
      if (step >= steps) {
        this._cancelFade();
        if (done) done();
      }
    }, ms / steps);
  }

  _cancelFade() {
    if (this._fadeTimer !== null) {
      this._clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  _applyVolume() {
    this.audio.volume = this._muted ? 0 : clamp01(this._master * this._music * this._duck * this._fade);
  }

  _warnOnce(key, message) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    this._warn(message);
  }
}
