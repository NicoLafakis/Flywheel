// WebAudio engine: pooled decoded buffers, three gain buses, listener fatigue,
// ambience ducking, persistent mute + per-bus levels, and mobile-safe autoplay
// unlock.
//
// Bus model: master carries MUTE ONLY. The two child buses each carry their own
// persisted player level — `sfx` the effects slider, `amb` the ambience slider —
// so one can sit at zero while the other plays. Music is not on this graph at
// all (it is an HTMLAudioElement in music.js with its own slider), which is why
// nothing here scales it.
//
// Render-side ONLY (ADR-0003): this module reads sim events and never writes
// sim state, so two peers with different speakers stay bit-identical. Nothing
// here is awaited by the game loop — a sound that is not loaded yet simply
// does not play, and a page with no AudioContext (old WebView, autoplay-denied
// iframe) degrades to silence rather than to an error.

import { RNG } from '../rng.js';

const MUTE_KEY = 'flywheel.audio.muted';
// Historical key name: it predates the split and now holds the EFFECTS level.
// Renaming it would silently reset every existing player's slider, which is a
// worse trade than a key whose name is one generation out of date.
const VOL_KEY = 'flywheel.audio.volume';
const AMB_VOL_KEY = 'flywheel.audio.ambVolume';
const MASTER_GAIN = 0.9;   // unmuted ceiling; mute is the only thing master carries
const AMB_GAIN = 0.55;     // ambience headroom under the beds, before the slider

export class AudioEngine {
  constructor({ base = 'assets/audio/' } = {}) {
    this.base = base;
    this.ctx = null;             // created lazily, resumed on first gesture
    this.buffers = new Map();    // name -> AudioBuffer
    this._pendingLoads = new Map(); // name -> Promise (dedupe concurrent loads)
    this.master = null; this.sfx = null; this.amb = null;
    this._muted = false;
    try { this._muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* private mode */ }
    this._vol = 1;
    try {
      const v = parseFloat(localStorage.getItem(VOL_KEY));
      if (Number.isFinite(v)) this._vol = Math.min(1, Math.max(0, v));
    } catch { /* private mode */ }
    this._ambVol = 1;
    try {
      const v = parseFloat(localStorage.getItem(AMB_VOL_KEY));
      if (Number.isFinite(v)) this._ambVol = Math.min(1, Math.max(0, v));
    } catch { /* private mode */ }
    // Listener fatigue: every play of a name deposits "energy" that decays
    // over ~4 s; repeats land quieter the hotter the name is. Three minutes
    // of continuous demolition stays audible without staying LOUD.
    this._fatigue = new Map();   // name -> { at: seconds, energy }
    // Audio variation stays presentation-only, but still uses the repository's
    // one seeded randomness source so no new Math.random() exception leaks in.
    this._rng = new RNG('audio-variants');
    this._unlocked = false;
    this._onUnlock = [];         // callbacks queued until the first gesture
  }

  get muted() { return this._muted; }
  setMuted(m) {
    this._muted = !!m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* best effort */ }
    this._applyMaster();
  }
  toggleMuted() { this.setMuted(!this._muted); return this._muted; }

  /** Effects level, 0..1, persisted. Rides the SFX bus only: gulps, crashes,
   * UI taps and stingers. Named `volume`/`setVolume` because every existing
   * caller (arena, hot-seat demo, scene viewer) already speaks that name. */
  get volume() { return this._vol; }
  setVolume(v) {
    if (!Number.isFinite(v)) return;
    this._vol = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(VOL_KEY, String(this._vol)); } catch { /* best effort */ }
    this._applySfx();
  }

  /** Ambience level, 0..1, persisted. Rides the AMB bus only: the per-city
   * beds and the Chicago el-train rattle. */
  get ambienceVolume() { return this._ambVol; }
  setAmbienceVolume(v) {
    if (!Number.isFinite(v)) return;
    this._ambVol = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(AMB_VOL_KEY, String(this._ambVol)); } catch { /* best effort */ }
    this._applyAmbience();
  }

  /** The ambience bus's resting gain. duckAmbience() ramps back to THIS, never
   * to a literal — restoring to a constant would hand the player's slider back
   * at full the first time a tower came down. */
  _ambLevel() { return AMB_GAIN * this._ambVol; }

  _applyMaster() {
    if (this.master) this.master.gain.value = this._muted ? 0 : MASTER_GAIN;
  }

  _applySfx() {
    if (this.sfx) this.sfx.gain.value = this._vol;
  }

  /** Live even mid-duck: a slider drag during a collapse's recovery ramp has to
   * win, so the scheduled ramp is cancelled rather than left to overwrite us. */
  _applyAmbience() {
    if (!this.amb) return;
    const g = this.amb.gain;
    try {
      const now = this.ctx ? this.ctx.currentTime : 0;
      g.cancelScheduledValues(now);
      g.setValueAtTime(this._ambLevel(), now);
    } catch { g.value = this._ambLevel(); }
  }

  /** Bind the one-time autoplay unlock to the page. Any pointer or key
   * gesture creates/resumes the context and flushes queued ambience. */
  attachUnlock(target = window) {
    const kick = () => { this.unlock(); };
    target.addEventListener('pointerdown', kick, { once: false, passive: true });
    target.addEventListener('keydown', kick, { once: false });
  }

  unlock() {
    if (!this._ensureCtx()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this._unlocked && this.ctx.state !== 'closed') {
      this._unlocked = true;
      const q = this._onUnlock; this._onUnlock = [];
      for (const fn of q) { try { fn(); } catch { /* keep the rest */ } }
    }
  }

  /** Run now if the context is live, else after the first gesture. */
  whenUnlocked(fn) {
    if (this._unlocked && this.ctx && this.ctx.state === 'running') fn();
    else this._onUnlock.push(fn);
  }

  _ensureCtx() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this._vol;
      this.sfx.connect(this.master);
      this.amb = this.ctx.createGain();
      this.amb.gain.value = this._ambLevel();
      this.amb.connect(this.master);
    } catch { this.ctx = null; return false; }
    return true;
  }

  /** Fetch + decode a set of names ("ui-tap" -> assets/audio/ui-tap.ogg).
   * Parallel, tolerant: a missing file logs once and stays silent. */
  load(names) {
    if (!this._ensureCtx()) return Promise.resolve();
    return Promise.all(names.map((n) => this._loadOne(n))).then(() => {});
  }

  _loadOne(name) {
    if (this.buffers.has(name)) return Promise.resolve();
    if (this._pendingLoads.has(name)) return this._pendingLoads.get(name);
    const p = fetch(this.base + name + '.ogg')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); })
      .then((ab) => this.ctx.decodeAudioData(ab))
      .then((buf) => { this.buffers.set(name, buf); })
      .catch((e) => { console.warn(`audio: ${name} unavailable`, e); })
      .finally(() => { this._pendingLoads.delete(name); });
    this._pendingLoads.set(name, p);
    return p;
  }

  _fatigueScale(name) {
    if (!this.ctx) return 1;
    const now = this.ctx.currentTime;
    let f = this._fatigue.get(name);
    if (!f) { f = { at: now, energy: 0 }; this._fatigue.set(name, f); }
    // exponential decay, ~4 s half-life
    f.energy *= Math.pow(0.5, (now - f.at) / 4);
    f.at = now;
    const scale = 1 / (1 + f.energy * 0.7);
    f.energy += 1;
    return scale;
  }

  /** One-shot through the SFX bus. Fatigue-ducked per name. */
  play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
    if (this._muted) return;
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || this.ctx.state !== 'running') return;
    const v = vol * this._fatigueScale(name);
    if (v < 0.02) return;   // fully fatigued — skip the node churn
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = v;
      src.connect(g).connect(this.sfx);
      src.start(this.ctx.currentTime + delay);
    } catch { /* node limits */ }
  }

  /** Pick one of several variant names at random and play it. */
  playRandom(names, opts) {
    this.play(this._rng.pick(names), opts);
  }

  /** Looping bed through the ambience bus. Returns a handle: stop(fadeSec). */
  loop(name, { vol = 1, fadeIn = 1.5 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || this.ctx.state !== 'running') return null;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + fadeIn);
      src.connect(g).connect(this.amb);
      src.start();
      const ctx = this.ctx;
      return {
        /** Retarget the loop's level with a glide, so per-frame distance
         * updates don't zipper. */
        setVol(v, glide = 0.15) {
          try { g.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, glide); } catch { /* stopped */ }
        },
        stop(fade = 0.8) {
          try {
            const now = ctx.currentTime;
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(Math.max(0.001, g.gain.value), now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
            src.stop(now + fade + 0.05);
          } catch { /* already stopped */ }
        },
      };
    } catch { return null; }
  }

  /** Big moments push the ambience bed down and let it breathe back up.
   * Both ends of the ramp are relative to the player's ambience level, so a
   * collapse never restores the bed louder than the slider asked for. */
  duckAmbience(sec = 2.5, depth = 0.3) {
    if (!this.ctx || !this.amb) return;
    try {
      const now = this.ctx.currentTime;
      const g = this.amb.gain;
      const level = this._ambLevel();
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level * depth, now + 0.08);
      g.linearRampToValueAtTime(level, now + sec);
    } catch { /* best effort */ }
  }
}
