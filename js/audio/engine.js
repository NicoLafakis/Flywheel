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
import {
  AMB_VOLUME_KEY,
  DEFAULT_AMBIENCE_VOLUME,
  DEFAULT_SFX_VOLUME,
  SFX_VOLUME_KEY,
  reseedAudioMix,
} from './mix.js';

// The effects and ambience defaults and their keys live in ./mix.js, which is
// the one file all three levels are described in (save.js and the settings
// screen read the same constants). Re-exported here because this module is
// where the two buses are owned, so a caller reasoning about the SFX bus does
// not have to know the constants were hoisted.
export { DEFAULT_SFX_VOLUME, DEFAULT_AMBIENCE_VOLUME, reseedAudioMix };

const MUTE_KEY = 'flywheel.audio.muted';
const VOL_KEY = SFX_VOLUME_KEY;
const AMB_VOL_KEY = AMB_VOLUME_KEY;
const MASTER_GAIN = 0.9;   // unmuted ceiling; mute is the only thing master carries
const AMB_GAIN = 0.55;     // ambience headroom under the beds, before the slider

export class AudioEngine {
  constructor({ base = 'assets/audio/', ext = {} } = {}) {
    this.base = base;
    // name -> file extension override, for the few sounds that ship as
    // something other than OGG (the eat masters are MP3 — see FILE_EXT in
    // game-audio.js). Anything not listed loads as '.ogg'.
    this._ext = ext;
    this.ctx = null;             // created lazily, resumed on first gesture
    this.buffers = new Map();    // name -> AudioBuffer
    this._pendingLoads = new Map(); // name -> Promise (dedupe concurrent loads)
    this.master = null; this.sfx = null; this.amb = null;
    this._muted = false;
    try { this._muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* private mode */ }
    // Before the levels are read, not after: an install still carrying an older
    // shipped mix is moved onto the current one here, so the reads below see the
    // new numbers. This is the seam every surface passes through — the arena,
    // the hot-seat demo and the scene viewer all construct an AudioEngine and
    // have no save to consult — which is why the re-seed lives at the engine
    // rather than in main.js. Stamped and idempotent: the main game calls it
    // first (so it can also reconcile the save) and this call is then a no-op.
    reseedAudioMix();
    this._vol = DEFAULT_SFX_VOLUME;
    try {
      const v = parseFloat(localStorage.getItem(VOL_KEY));
      if (Number.isFinite(v)) this._vol = Math.min(1, Math.max(0, v));
    } catch { /* private mode */ }
    this._ambVol = DEFAULT_AMBIENCE_VOLUME;
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
   * Parallel, tolerant: a missing file logs once and stays silent. A name in
   * the constructor's `ext` map fetches that extension instead of '.ogg'. */
  load(names) {
    if (!this._ensureCtx()) return Promise.resolve();
    return Promise.all(names.map((n) => this._loadOne(n))).then(() => {});
  }

  _loadOne(name) {
    if (this.buffers.has(name)) return Promise.resolve();
    if (this._pendingLoads.has(name)) return this._pendingLoads.get(name);
    const p = fetch(this.base + name + (this._ext[name] || '.ogg'))
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

  /** Authentic bright metallic coin double-chime (B5 -> E6). Always audible and distinct. */
  playCoin({ vol = 0.85 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      // Pitch sequence: B5 (987.77Hz) -> E6 (1318.51Hz)
      osc1.frequency.setValueAtTime(987.77, now);
      osc1.frequency.setValueAtTime(1318.51, now + 0.07);

      osc2.frequency.setValueAtTime(1975.53, now);
      osc2.frequency.setValueAtTime(2637.02, now + 0.07);

      const targetGain = 0.42 * this._vol * vol;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + 0.012);
      gain.gain.setValueAtTime(targetGain, now + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.sfx);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } catch { /* fallback */ }
  }

  /** Shimmering ascending arpeggio fanfare for power-up collections. */
  playPowerUpCollect({ vol = 0.95 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const notes = [349.23, 440.00, 523.25, 659.25, 880.00, 1046.50]; // F4, A4, C5, E5, A5, C6
      const step = 0.055;
      
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * step);

        const startTime = now + idx * step;
        const noteGain = 0.28 * this._vol * vol;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(noteGain, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(this.sfx);

        osc.start(startTime);
        osc.stop(startTime + 0.38);
      });

      // Sub-harmonic warm body
      const body = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(523.25, now); // C5
      body.frequency.exponentialRampToValueAtTime(261.63, now + 0.35); // C4

      const bodyVol = 0.28 * this._vol * vol;
      bodyGain.gain.setValueAtTime(0.001, now);
      bodyGain.gain.linearRampToValueAtTime(bodyVol, now + 0.015);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

      body.connect(bodyGain);
      bodyGain.connect(this.sfx);
      body.start(now);
      body.stop(now + 0.5);
    } catch { /* fallback */ }
  }

  /** Panicked crowd scream effect triggered when an elevated train derails and falls. */
  playTrainScream({ vol = 1.0, delay = 0 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime + delay;
      const voices = [
        { startF: 920, peakF: 1180, endF: 380, vibratoRate: 7.2, vibratoDepth: 35, formant: 1800, q: 3.5, gainMult: 0.32 },
        { startF: 740, peakF: 890,  endF: 290, vibratoRate: 6.8, vibratoDepth: 28, formant: 1450, q: 3.0, gainMult: 0.36 },
        { startF: 520, peakF: 640,  endF: 220, vibratoRate: 6.1, vibratoDepth: 20, formant: 1100, q: 2.8, gainMult: 0.28 },
      ];

      voices.forEach((v, idx) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        // Sawtooth / triangle voice with vocal formant resonance
        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';

        // Panicked pitch envelope: starts high, shrieks upward, then drops with falling gravity
        osc.frequency.setValueAtTime(v.startF, now);
        osc.frequency.linearRampToValueAtTime(v.peakF, now + 0.18);
        osc.frequency.exponentialRampToValueAtTime(v.endF, now + 1.25);

        // Vocal tract formant filter ("AAAHHH!" vowel resonance)
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(v.formant, now);
        filter.Q.setValueAtTime(v.q, now);

        // Panicked vibrato / tremolo LFO
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(v.vibratoRate, now);
        lfoGain.gain.setValueAtTime(v.vibratoDepth, now);
        lfo.connect(osc.frequency);
        lfo.start(now);
        lfo.stop(now + 1.35);

        // Gain envelope: fast scream attack, sustained panic, trailing fade
        const targetVol = v.gainMult * this._vol * vol;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(targetVol, now + 0.08);
        gain.gain.setValueAtTime(targetVol * 0.85, now + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfx);

        osc.start(now);
        osc.stop(now + 1.35);
      });
    } catch { /* fallback */ }
  }

  /** Shimmering descending drop chime for milestone power-up spawns. */
  playPowerUpSpawn({ vol = 0.85 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const notes = [1567.98, 1318.51, 1046.50, 783.99]; // G6, E6, C6, G5
      const step = 0.06;
      
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * step);

        const startTime = now + idx * step;
        const noteGain = 0.22 * this._vol * vol;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(noteGain, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.3);

        osc.connect(gain);
        gain.connect(this.sfx);

        osc.start(startTime);
        osc.stop(startTime + 0.32);
      });
    } catch { /* fallback */ }
  }

  /** Dramatic anime hit-stop freeze impact sound with instant sub-bass drop. */
  playAnimeHitStop({ vol = 1.0 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      // High-frequency strike snap
      const oscHigh = this.ctx.createOscillator();
      const gainHigh = this.ctx.createGain();
      oscHigh.type = 'triangle';
      oscHigh.frequency.setValueAtTime(880, now);
      oscHigh.frequency.exponentialRampToValueAtTime(110, now + 0.12);
      gainHigh.gain.setValueAtTime(0.4 * this._vol * vol, now);
      gainHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      oscHigh.connect(gainHigh);
      gainHigh.connect(this.sfx);
      oscHigh.start(now);
      oscHigh.stop(now + 0.15);

      // Deep subterranean bass drop
      const oscBass = this.ctx.createOscillator();
      const gainBass = this.ctx.createGain();
      oscBass.type = 'sine';
      oscBass.frequency.setValueAtTime(110, now);
      oscBass.frequency.exponentialRampToValueAtTime(32, now + 0.7);
      gainBass.gain.setValueAtTime(0.65 * this._vol * vol, now);
      gainBass.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      oscBass.connect(gainBass);
      gainBass.connect(this.sfx);
      oscBass.start(now);
      oscBass.stop(now + 0.8);
    } catch { /* fallback */ }
  }

  /** Heavy concrete crumbling & building collapse impact crash. */
  playBuildingCollapse({ vol = 0.9 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95 + Math.random() * 25, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.linearRampToValueAtTime(80, now + 0.45);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.5 * this._vol * vol, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      osc.start(now);
      osc.stop(now + 0.52);
    } catch { /* fallback */ }
  }

  /** Fast rushing supersonic seismic tear whoosh. */
  playSeismicRupture({ vol = 1.0 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.8);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(180, now + 0.8);
      filter.Q.setValueAtTime(2.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.45 * this._vol * vol, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      osc.start(now);
      osc.stop(now + 0.9);
    } catch { /* fallback */ }
  }

  /** Deep subterranean tectonic fault line earthquake rumble and concrete snapping. */
  playFaultLineQuake({ vol = 1.0 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      // Sub-bass tectonic rumble
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 1.6);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, now);
      filter.frequency.linearRampToValueAtTime(60, now + 1.8);

      const targetVol = 0.55 * this._vol * vol;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetVol, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      osc.start(now);
      osc.stop(now + 2.1);
    } catch { /* fallback */ }
  }

  /** Ethereal reverse whoosh & time-freeze warp sound. */
  playTimeFreezeStart({ vol = 0.9 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.45);

      const targetVol = 0.4 * this._vol * vol;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetVol, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.sfx);
      osc.start(now);
      osc.stop(now + 0.75);
    } catch { /* fallback */ }
  }

  /** Iconic Pokémon battle encounter transition stinger and fanfare. */
  playPokemonEncounter({ vol = 1.0 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;

      // 1. Rapid rising 6-note battle encounter arpeggio (C5 -> E5 -> G5 -> C6 -> E6 -> G6)
      const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
      const noteDur = 0.048;
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        const t0 = now + idx * noteDur;
        osc.frequency.setValueAtTime(freq, t0);

        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.24 * this._vol * vol, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + noteDur * 1.5);

        osc.connect(gain);
        gain.connect(this.sfx);
        osc.start(t0);
        osc.stop(t0 + noteDur * 1.6);
      });

      // 2. High-energy retro battle brass blast on the resolve note (C6 octave + G5 harmony)
      const resolveT = now + freqs.length * noteDur;
      [1046.50, 783.99, 523.25].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, resolveT);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2800, resolveT);
        filter.frequency.exponentialRampToValueAtTime(600, resolveT + 0.65);

        gain.gain.setValueAtTime(0.001, resolveT);
        gain.gain.linearRampToValueAtTime(0.28 * this._vol * vol, resolveT + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, resolveT + 0.7);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfx);
        osc.start(resolveT);
        osc.stop(resolveT + 0.75);
      });

      // 3. Sub-bass battle drop punch
      const oscBass = this.ctx.createOscillator();
      const gainBass = this.ctx.createGain();
      oscBass.type = 'sine';
      oscBass.frequency.setValueAtTime(140, resolveT);
      oscBass.frequency.exponentialRampToValueAtTime(42, resolveT + 0.45);
      gainBass.gain.setValueAtTime(0.45 * this._vol * vol, resolveT);
      gainBass.gain.exponentialRampToValueAtTime(0.001, resolveT + 0.5);
      oscBass.connect(gainBass);
      gainBass.connect(this.sfx);
      oscBass.start(resolveT);
      oscBass.stop(resolveT + 0.52);

      // 4. Shimmering star sparkle
      [2093.00, 2637.02, 3135.96].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        const st = resolveT + 0.05 + i * 0.06;
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.001, st);
        gain.gain.linearRampToValueAtTime(0.18 * this._vol * vol, st + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
        osc.connect(gain);
        gain.connect(this.sfx);
        osc.start(st);
        osc.stop(st + 0.38);
      });
    } catch { /* fallback */ }
  }

  /** Heavy skyfall beacon impact and capsule touchdown. */
  playPokemonDropLand({ vol = 1.0 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      // Skyfall whistle descent
      const oscWhistle = this.ctx.createOscillator();
      const gainWhistle = this.ctx.createGain();
      oscWhistle.type = 'sine';
      oscWhistle.frequency.setValueAtTime(1200, now);
      oscWhistle.frequency.exponentialRampToValueAtTime(240, now + 0.25);
      gainWhistle.gain.setValueAtTime(0.2 * this._vol * vol, now);
      gainWhistle.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      oscWhistle.connect(gainWhistle);
      gainWhistle.connect(this.sfx);
      oscWhistle.start(now);
      oscWhistle.stop(now + 0.27);

      // Ground impact slam
      const impactT = now + 0.22;
      const oscImpact = this.ctx.createOscillator();
      const gainImpact = this.ctx.createGain();
      oscImpact.type = 'triangle';
      oscImpact.frequency.setValueAtTime(160, impactT);
      oscImpact.frequency.exponentialRampToValueAtTime(38, impactT + 0.4);
      gainImpact.gain.setValueAtTime(0.5 * this._vol * vol, impactT);
      gainImpact.gain.exponentialRampToValueAtTime(0.001, impactT + 0.45);
      oscImpact.connect(gainImpact);
      gainImpact.connect(this.sfx);
      oscImpact.start(impactT);
      oscImpact.stop(impactT + 0.48);
    } catch { /* fallback */ }
  }

  /** Crystal / glass shatter sound when time freeze expires and world resumes. */
  playTimeFreezeEnd({ vol = 0.9 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const freqs = [1760, 2217, 2637, 3520];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.02);
        osc.frequency.exponentialRampToValueAtTime(f * 0.4, now + idx * 0.02 + 0.25);

        const v = 0.22 * this._vol * vol;
        gain.gain.setValueAtTime(0.001, now + idx * 0.02);
        gain.gain.linearRampToValueAtTime(v, now + idx * 0.02 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.02 + 0.3);

        osc.connect(gain);
        gain.connect(this.sfx);
        osc.start(now + idx * 0.02);
        osc.stop(now + idx * 0.02 + 0.35);
      });
    } catch { /* fallback */ }
  }

  /** Distant rolling thunder and ominous storm wind cue. */
  playStormWarning({ stormType = 'tornado', vol = 0.95 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.linearRampToValueAtTime(75, now + 0.8);
      osc.frequency.exponentialRampToValueAtTime(30, now + 2.8);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 3.0);

      const targetVol = 0.5 * this._vol * vol;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetVol, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      osc.start(now);
      osc.stop(now + 3.3);
    } catch { /* fallback */ }
  }

  /** Howling wind vortex / gale surge during cataclysm. */
  playStormActive({ stormType = 'tornado', vol = 0.85 } = {}) {
    if (this._muted || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(260, now + 1.2);
      osc.frequency.linearRampToValueAtTime(120, now + 2.5);

      const targetVol = 0.35 * this._vol * vol;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetVol, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

      osc.connect(gain);
      gain.connect(this.sfx);
      osc.start(now);
      osc.stop(now + 3.1);
    } catch { /* fallback */ }
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
