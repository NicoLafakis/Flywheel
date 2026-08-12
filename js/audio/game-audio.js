// The game-facing voice: one object that maps Flywheel sim events, scenes and
// UI moments onto the curated CC0 library in assets/audio/ (see CREDITS.json).
//
// Owns the theming decisions so every surface (main game, arena, hot-seat
// demo, and the dev scene viewer) sounds the same:
//   eat        -> gulp, pitched DEEPER as the hole grows (radius-keyed)
//   combo      -> tick rising with level; level 5+ adds the big pluck
//   crash      -> weight tiers: debris scatter / small collapse / skyscraper
//                 collapse with rumble bed + glass, ducking the ambience
//   milestone  -> pizzicato stinger; 'roar' tier gets the orchestral hit
//   derail     -> THE moment: screech first, crash landing a beat later
//   ambience   -> per-city bed (Chicago el, Brooklyn, Manhattan, Boston
//                 harbor + gulls, Cambridge park); gallery stays quiet
//
// Positional events (crash, derail) and the Chicago el-train bed are
// distance-attenuated against the local player's hole, fed per frame via
// updateListener(); a surface that never sets a listener hears everything at
// full level, which is the pre-distance behaviour.
//
// Deterministic-sim-safe: reads events, never touches sim state (ADR-0003).

import { AudioEngine } from './engine.js';
import { MusicDirector } from './music.js';

// Scene id -> ambience bed name (null = deliberate quiet).
export const SCENE_AMBIENCE = {
  gallery: null,
  brooklyn: 'amb-brooklyn',
  manhattan: 'amb-manhattan',
  'upper-manhattan': 'amb-manhattan',
  boston: 'amb-boston',
  cambridge: 'amb-cambridge',
  chicago: 'amb-chicago',
};

const ALL_SOUNDS = [
  'ui-tap', 'ui-tap-2', 'ui-back', 'ui-confirm', 'coin',
  'eat-1', 'eat-2', 'eat-3',
  'combo-tick', 'combo-big', 'milestone', 'milestone-roar', 'goal', 'win', 'lose',
  'debris-1', 'debris-2', 'debris-3', 'debris-metal', 'glass-1', 'glass-2',
  'crash-small', 'crash-big', 'rumble',
  'derail-screech', 'derail-crash', 'train-loop',
  'amb-brooklyn', 'amb-manhattan', 'amb-boston', 'amb-cambridge', 'amb-chicago',
];

const EATS = ['eat-1', 'eat-2', 'eat-3'];
const DEBRIS = ['debris-1', 'debris-2', 'debris-3'];
const GLASS = ['glass-1', 'glass-2'];

// Distance model for positional sounds: full level inside ATT_FULL metres of
// the listener, gone at ATT_ZERO. City scenes span ~250 m, so a collapse two
// districts over reads as a distant thud rather than a point-blank bang.
const ATT_FULL = 25;
const ATT_ZERO = 160;
// El-train bed level BEFORE distance scaling (0.5 constant read as plainly
// LOUD — the rattle now also fades as the train circles away from the hole).
const TRAIN_VOL = 0.3;

/** Gulp pitch from hole radius: SIZE 1 (r 1.1) bright, SIZE 12 (r 6.6) deep. */
function gulpRate(radius) {
  const t = Math.max(0, Math.min(1, ((radius || 1.1) - 1.1) / (6.6 - 1.1)));
  return 1.25 - t * 0.55;   // 1.25 .. 0.70
}

export class GameAudio {
  constructor({ base = 'assets/audio/', musicBase = 'assets/music/', musicDirector = null } = {}) {
    this.engine = new AudioEngine({ base });
    this.music = musicDirector || new MusicDirector({ base: musicBase });
    this.music.setMuted(this.engine.muted);
    this.music.setMasterVolume(this.engine.volume);
    this._ambHandle = null;
    this._trainHandle = null;
    this._sceneWanted = null;
    this._loaded = false;
    // Listener: the local hole's position, fed per frame by updateListener().
    this._lx = 0; this._lz = 0; this._hasListener = false;
    // event-class throttles (seconds of AudioContext time)
    this._lastEat = -1;
    this._lastScreech = -10;
    this._lastDerailCrash = -10;
  }

  /** Call once at page setup. Binds the autoplay unlock; the first user
   * gesture also triggers the buffer preload, so nothing downloads until
   * the visitor actually engages. */
  init(target = window) {
    this.engine.attachUnlock(target);
    this.music.init(target);
    this.engine.whenUnlocked(() => {
      if (this._loaded) return;
      this._loaded = true;
      this.engine.load(ALL_SOUNDS).then(() => {
        // ambience requested before the gesture starts now
        if (this._sceneWanted) this._startBed(this._sceneWanted);
      });
    });
    return this;
  }

  get muted() { return this.engine.muted; }
  toggleMuted() {
    const m = this.engine.toggleMuted();
    this.music.setMuted(m);
    if (!m) this.engine.unlock();
    return m;
  }
  /** Driven by an external settings screen (the main game's save carries
   * mute + volume); the engine persists both, so the arena inherits them. */
  setMuted(m) { this.engine.setMuted(m); this.music.setMuted(m); }
  setVolume(v) { this.engine.setVolume(v); this.music.setMasterVolume(v); }
  get musicVolume() { return this.music.volume; }
  setMusicVolume(v) { this.music.setVolume(v); }
  setMusicCue(cue, opts) { return this.music.request(cue, opts); }

  /** Per-frame listener feed. `moverSim` is the voxel sim's mover list
   * (null/undefined anywhere else): the Chicago bed tracks the nearest car
   * still on the rails, so the rattle swells as the train passes and fades
   * around the Loop. Surfaces without a live sim pass nothing and keep the
   * flat bed. */
  updateListener(x, z, moverSim) {
    this._lx = x; this._lz = z; this._hasListener = true;
    if (!this._trainHandle || !Array.isArray(moverSim)) return;
    let best = Infinity;
    for (const rt of moverSim) {
      for (const u of rt.units) {
        if (u.phase !== 'ride') continue;   // fallen cars don't rattle
        const d = Math.hypot(u.x - x, u.z - z);
        if (d < best) best = d;
      }
    }
    // No riding unit means the derail handler already killed the loop.
    if (best < Infinity) this._trainHandle.setVol(TRAIN_VOL * this._attD(best));
  }

  _attD(d) { return Math.max(0, Math.min(1, (ATT_ZERO - d) / (ATT_ZERO - ATT_FULL))); }
  _att(x, z) { return this._hasListener ? this._attD(Math.hypot(x - this._lx, z - this._lz)) : 1; }

  // ---------------------------------------------------------------- UI
  uiTap() { this.engine.playRandom(['ui-tap', 'ui-tap-2'], { vol: 0.7 }); }
  uiBack() { this.engine.play('ui-back', { vol: 0.7 }); }
  uiConfirm() { this.engine.play('ui-confirm', { vol: 0.8 }); }
  countdownTick() { this.engine.play('combo-tick', { vol: 0.8, rate: 0.9 }); }
  countdownGo() { this.engine.play('ui-confirm', { vol: 1.0, rate: 1.2 }); }

  // ---------------------------------------------------------------- finales
  win() { this._stopScene(); this.music.duck(3.0, 0.3); this.engine.play('win', { vol: 1.0 }); }
  lose() { this._stopScene(); this.music.duck(3.0, 0.3); this.engine.play('lose', { vol: 1.0 }); }
  draw() { this._stopScene(); this.music.duck(2.5, 0.4); this.engine.play('milestone', { vol: 0.9 }); }

  // ---------------------------------------------------------------- scene
  /** Start (or queue, pre-gesture) the per-city ambience. Chicago also gets
   * the running el-train rattle under its bed — until the derailment. */
  startScene(sceneId) {
    this._sceneWanted = sceneId;
    this.engine.whenUnlocked(() => this._startBed(sceneId));
  }

  _startBed(sceneId) {
    if (this._sceneWanted !== sceneId) return;   // superseded meanwhile
    this._stopScene(0.4);
    this._sceneWanted = sceneId;
    const bed = SCENE_AMBIENCE[sceneId];
    if (bed) this._ambHandle = this.engine.loop(bed, { vol: 1.0 });
    if (sceneId === 'chicago') {
      this._trainHandle = this.engine.loop('train-loop', { vol: TRAIN_VOL, fadeIn: 2.5 });
    }
  }

  _stopScene(fade = 0.8) {
    if (this._ambHandle) { this._ambHandle.stop(fade); this._ambHandle = null; }
    if (this._trainHandle) { this._trainHandle.stop(fade); this._trainHandle = null; }
  }
  stopScene() { this._sceneWanted = null; this._stopScene(); }

  // ---------------------------------------------------------------- events
  /** Feed a drained sim event batch. `opts.quiet` plays another player's
   * eats at reduced volume (the arena: your rival chews in the distance). */
  handleEvents(events, opts = {}) {
    for (const ev of events) this.handleEvent(ev, opts);
  }

  handleEvent(ev, { quiet = false } = {}) {
    const e = this.engine;
    const now = e.ctx ? e.ctx.currentTime : 0;
    switch (ev.type) {
      case 'eat': {
        if (now - this._lastEat < 0.055) return;   // a plowed row is one mouthful
        this._lastEat = now;
        const radius = ev.hole ? ev.hole.radius : undefined;
        e.playRandom(EATS, { vol: quiet ? 0.25 : 0.65, rate: gulpRate(radius) });
        break;
      }
      case 'coin':
        e.play('coin', { vol: 0.8 });
        break;
      case 'combo': {
        const lvl = ev.level || 1;
        e.play('combo-tick', { vol: 0.75, rate: 1 + lvl * 0.08 });
        if (lvl >= 5) e.play('combo-big', { vol: 0.8, rate: 1 + (lvl - 5) * 0.04 });
        break;
      }
      case 'crash': {
        // ev.size = blocks in the settled pool: the collapse's weight class.
        const n = ev.size || 1;
        const a = ev.x != null ? this._att(ev.x, ev.z) : 1;
        if (a < 0.05) break;               // too far to hear — skip the nodes
        if (n >= 26) {                     // a tower came down
          e.play('crash-big', { vol: 1.0 * a });
          e.play('rumble', { vol: 0.8 * a });
          e.playRandom(GLASS, { vol: 0.7 * a, delay: 0.25 });
          e.playRandom(DEBRIS, { vol: 0.6 * a, delay: 0.45 });
          e.duckAmbience(3.5, 0.25);
          this.music.duck(3.5, 0.35);
        } else if (n >= 9) {               // low building / big slab
          e.play('crash-small', { vol: 0.85 * a });
          e.playRandom(DEBRIS, { vol: 0.6 * a, delay: 0.2 });
          if (n >= 16) e.playRandom(GLASS, { vol: 0.5 * a, delay: 0.35 });
          e.duckAmbience(2.0, 0.45);
        } else {                           // debris scatter
          e.playRandom(DEBRIS, { vol: 0.55 * a });
          if (n >= 4) e.playRandom(DEBRIS, { vol: 0.4 * a, delay: 0.12 });
        }
        break;
      }
      case 'growth':
        e.play('milestone', { vol: 0.9, rate: 1.05 });
        break;
      case 'milestone':
        if (ev.tier === 'roar') {
          e.play('milestone-roar', { vol: 1.0 });
          e.duckAmbience(2.5, 0.35);
          this.music.duck(2.5, 0.45);
        } else {
          e.play('milestone', { vol: 0.85 });
        }
        break;
      case 'goal':
        e.play('goal', { vol: 1.0 });
        this.music.duck(2.5, 0.35);
        break;
      case 'derail': {
        // THE derailment. Screech leads, the crash lands a beat later, and
        // the running rattle dies with the train. Per-car events inside the
        // same pile-up fold into one screech + one crash.
        const a = ev.x != null ? this._att(ev.x, ev.z) : 1;
        if (a >= 0.05 && now - this._lastScreech > 2.0) {
          this._lastScreech = now;
          e.play('derail-screech', { vol: 1.0 * a });
          e.duckAmbience(4.0, 0.2);
          this.music.duck(4.0, 0.3);
        }
        if (a >= 0.05 && now - this._lastDerailCrash > 2.5) {
          this._lastDerailCrash = now;
          e.play('derail-crash', { vol: 1.0 * a, delay: 1.1 });
        }
        if (this._trainHandle) { this._trainHandle.stop(1.2); this._trainHandle = null; }
        break;
      }
      default:
        break;   // tide/unlocked/win/fail are campaign-sim events with no mapped voice
    }
  }
}
