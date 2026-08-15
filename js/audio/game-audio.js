// The game-facing voice: one object that maps Flywheel sim events, scenes and
// UI moments onto the sound library in assets/audio/ (CC0 + original masters,
// see CREDITS.json).
//
// Owns the theming decisions so every surface (main game, arena, hot-seat
// demo, and the dev scene viewer) sounds the same:
//   eat        -> gulp, pitched DEEPER as the hole grows (radius-keyed)
//   combo      -> tick rising with level; level 5+ adds the big pluck
//   crash      -> ONE voice per BUILDING, not per falling piece: nearby impacts
//                 are pooled into a collapse, sized by the pooled block count,
//                 and anything short of a collapse stays silent
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
// The collapse pooling below is a render-side buffer for exactly that reason:
// the sim's event stream is untouched, so two peers with different speakers
// still step bit-identically.

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

// Sounds that ship as something other than OGG. The eat gulps are original
// Flywheel masters (Suno, like the music — see assets/audio/CREDITS.json) and
// arrived as MP3; every target browser decodes MP3, and re-encoding them to
// OGG would be a second lossy pass for zero gain. Names stay 'eat-N' so no
// call site or test knows the difference.
const FILE_EXT = { 'eat-1': '.mp3', 'eat-2': '.mp3', 'eat-3': '.mp3' };

// Distance model for positional sounds: full level inside ATT_FULL metres of
// the listener, gone at ATT_ZERO. City scenes span ~250 m, so a collapse two
// districts over reads as a distant thud rather than a point-blank bang.
const ATT_FULL = 25;
const ATT_ZERO = 160;
// El-train bed level BEFORE distance scaling (0.5 constant read as plainly
// LOUD — the rattle now also fades as the train circles away from the hole).
const TRAIN_VOL = 0.3;

// --------------------------------------------------------- collapse pooling
// The sim reports one 'crash' per CHUNK that lands hard (js/voxelsim.js's
// _splitChunk), and one toppling tower sheds a dozen of them over a couple of
// seconds. Voicing each one stacked the same bang on itself and re-ducked the
// bed every few frames, which is the jarring part. So impacts are pooled into
// COLLAPSES here, render-side, and each collapse speaks exactly once.
//
// CRASH_RADIUS: impacts landing inside this of a live collapse's centroid are
// the same building coming down. City scenes span ~250 m and a tower's rubble
// field is a good deal tighter than that, so 18 m keeps two buildings on
// opposite sides of a block apart while still catching a wide spill.
const CRASH_RADIUS = 18;
// Hold before speaking, so the weight class reflects the whole building rather
// than whichever slab happened to hit first. Each further impact pushes the
// deadline out by CRASH_EXTEND, but never past CRASH_MAX_HOLD from the first
// hit — beyond that the sound would start visibly late.
const CRASH_HOLD = 0.25;
const CRASH_EXTEND = 0.15;
const CRASH_MAX_HOLD = 0.6;
// Once a collapse has spoken, further impacts on the same spot add nothing for
// this long. The window is refreshed while rubble keeps arriving, so a tower
// that settles for four seconds still only ever made one sound.
const CRASH_SUPPRESS = 2.0;
// Pooled block count -> weight class. These are the pre-pooling numbers, now
// read against a whole building instead of one fragment: under CRASH_SMALL is
// pieces falling off something, and pieces falling off something are SILENT.
const CRASH_BIG = 26;
const CRASH_SMALL = 9;

/** Gulp pitch from hole radius: SIZE 1 (r 1.1) bright, SIZE 12 (r 6.6) deep. */
function gulpRate(radius) {
  const t = Math.max(0, Math.min(1, ((radius || 1.1) - 1.1) / (6.6 - 1.1)));
  return 1.25 - t * 0.55;   // 1.25 .. 0.70
}

export class GameAudio {
  constructor({ base = 'assets/audio/', musicBase = 'assets/music/', musicDirector = null, enableCrashSounds = false } = {}) {
    this.engine = new AudioEngine({ base, ext: FILE_EXT });
    this.music = musicDirector || new MusicDirector({ base: musicBase });
    this.music.setMuted(this.engine.muted);
    // Building crash sound toggle: stripped out by default per user direction
    this.enableCrashSounds = enableCrashSounds;
    // Deliberately NO setMasterVolume() here: music is governed by its own
    // slider and by mute, nothing else. Wiring the effects level in at boot is
    // what used to make turning effects down turn the score down with it.
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
    // Live collapses: impacts still pooling, plus the ones that have spoken and
    // are swallowing their own tail. Rarely more than two or three entries.
    this._collapses = [];
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
  /** Driven by an external settings screen (the main game's save carries mute
   * and all three levels); the engine and the director persist their own, so
   * the arena and the hot-seat demo inherit every one of them. */
  setMuted(m) { this.engine.setMuted(m); this.music.setMuted(m); }
  /** Effects only — crashes, gulps, UI. Independent of ambience and music. */
  setVolume(v) { this.engine.setVolume(v); }
  get ambienceVolume() { return this.engine.ambienceVolume; }
  setAmbienceVolume(v) { this.engine.setAmbienceVolume(v); }
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
    this.tick();
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
  playCoin(opts) {
    if (typeof this.engine.playCoin === 'function') this.engine.playCoin(opts);
    else this.engine.play('coin', opts);
  }
  playPowerUpCollect(opts) {
    if (typeof this.engine.playPowerUpCollect === 'function') this.engine.playPowerUpCollect(opts);
    else this.engine.play('milestone', opts);
  }
  playPowerUpSpawn(opts) {
    if (typeof this.engine.playPowerUpSpawn === 'function') this.engine.playPowerUpSpawn(opts);
    else this.engine.play('coin', opts);
  }

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
    // Anything still pooling is DROPPED, not flushed: the surface that was
    // feeding impacts has gone away (level teardown, results reveal, a scene
    // swap), and a collapse banging over the results screen a beat after the
    // city faded out is the same jarring miss this pooling exists to fix.
    this._collapses.length = 0;
  }
  stopScene() { this._sceneWanted = null; this._stopScene(); }

  // ---------------------------------------------------------------- events
  /** Feed a drained sim event batch. `opts.quiet` plays another player's
   * eats at reduced volume (the arena: your rival chews in the distance). */
  handleEvents(events, opts = {}) {
    this.tick();   // an empty batch is still a frame: pooled collapses ripen
    for (const ev of events) this.handleEvent(ev, opts);
  }

  /** Per-frame pump for the collapse pool. Free to call with nothing pending,
   * and already reached from updateListener() and every drained event, so the
   * three game surfaces pump it without extra wiring; a surface that drives
   * neither should call it from its frame loop so the last building of a quiet
   * moment still gets its voice. */
  tick() {
    this._tickCollapses(this.engine.ctx ? this.engine.ctx.currentTime : 0);
  }

  /** Find the live collapse this impact belongs to, or open a new one.
   * Positionless impacts (a surface that never set x/z) all share one pool —
   * without coordinates there is nothing to tell two buildings apart. */
  _collapseFor(positioned, x, z, now) {
    for (const c of this._collapses) {
      if (c.positioned !== positioned) continue;
      if (positioned && Math.hypot(x - c.x, z - c.z) > CRASH_RADIUS) continue;
      return c;
    }
    const c = {
      positioned, x, z, sx: 0, sz: 0, total: 0,
      first: now, due: now + CRASH_HOLD, voiced: false, until: 0,
    };
    this._collapses.push(c);
    return c;
  }

  /** Speak the ripe collapses and retire the ones done swallowing their tail. */
  _tickCollapses(now) {
    for (let i = this._collapses.length - 1; i >= 0; i--) {
      const c = this._collapses[i];
      if (c.voiced) {
        if (now >= c.until) this._collapses.splice(i, 1);
      } else if (now >= c.due) {
        this._voiceCollapse(c, now);
      }
    }
  }

  /** The one sound a building gets. Weight class comes from the POOLED block
   * count, position from the impacts' mass-weighted centroid.
   * Stripped out / disabled by default per user direction. */
  _voiceCollapse(c, now) {
    c.voiced = true;
    c.until = now + CRASH_SUPPRESS;
    const n = c.total;
    if (n < CRASH_SMALL) return;   // pieces falling off something, not a collapse
    if (!this.enableCrashSounds) return; // Muted by default per user request
    const a = c.positioned ? this._att(c.x, c.z) : 1;
    if (a < 0.05) return;          // too far to hear — skip the nodes
    const e = this.engine;
    if (n >= CRASH_BIG) {                // a tower came down
      e.play('crash-big', { vol: 1.0 * a });
      e.play('rumble', { vol: 0.8 * a });
      e.playRandom(GLASS, { vol: 0.7 * a, delay: 0.25 });
      e.playRandom(DEBRIS, { vol: 0.6 * a, delay: 0.45 });
      e.duckAmbience(3.5, 0.25);
      this.music.duck(3.5, 0.35);
    } else {                             // low building / big slab
      e.play('crash-small', { vol: 0.85 * a });
      e.playRandom(DEBRIS, { vol: 0.6 * a, delay: 0.2 });
      if (n >= 16) e.playRandom(GLASS, { vol: 0.5 * a, delay: 0.35 });
      e.duckAmbience(2.0, 0.45);
    }
  }

  handleEvent(ev, { quiet = false } = {}) {
    const e = this.engine;
    const now = e.ctx ? e.ctx.currentTime : 0;
    this._tickCollapses(now);
    switch (ev.type) {
      case 'eat': {
        if (now - this._lastEat < 0.055) return;   // a plowed row is one mouthful
        this._lastEat = now;
        const radius = ev.hole ? ev.hole.radius : undefined;
        e.playRandom(EATS, { vol: quiet ? 0.25 : 0.65, rate: gulpRate(radius) });
        break;
      }
      case 'coin':
        this.playCoin();
        break;
      case 'powerup_collect':
        this.playPowerUpCollect();
        break;
      case 'powerup_spawn':
        this.playPowerUpSpawn();
        break;
      case 'quake':
        if (typeof e.playFaultLineQuake === 'function') e.playFaultLineQuake({ vol: 1.0 });
        e.duckAmbience(3.0, 0.25);
        this.music.duck(3.0, 0.35);
        break;
      case 'time_freeze_start':
        if (typeof e.playTimeFreezeStart === 'function') e.playTimeFreezeStart({ vol: 0.95 });
        e.duckAmbience(8.0, 0.2);
        this.music.duck(8.0, 0.25);
        break;
      case 'time_freeze_end':
        if (typeof e.playTimeFreezeEnd === 'function') e.playTimeFreezeEnd({ vol: 0.95 });
        break;
      case 'storm_warning':
        if (typeof e.playStormWarning === 'function') e.playStormWarning({ stormType: ev.stormType, vol: 0.95 });
        e.duckAmbience(6.0, 0.3);
        this.music.duck(6.0, 0.4);
        break;
      case 'storm_active':
        if (typeof e.playStormActive === 'function') e.playStormActive({ stormType: ev.stormType, vol: 0.9 });
        break;
      case 'combo': {
        const lvl = ev.level || 1;
        e.play('combo-tick', { vol: 0.75, rate: 1 + lvl * 0.08 });
        if (lvl >= 5) e.play('combo-big', { vol: 0.8, rate: 1 + (lvl - 5) * 0.04 });
        break;
      }
      case 'crash': {
        if (!e.ctx) break;                 // no clock to pool against, no sound
        const n = Math.max(1, ev.size || 1);
        const positioned = ev.x != null;
        const x = positioned ? ev.x : 0;
        const z = positioned ? ev.z : 0;
        const c = this._collapseFor(positioned, x, z, now);
        if (c.voiced) { c.until = now + CRASH_SUPPRESS; break; }   // the tail
        c.total += n;
        if (positioned) {
          c.sx += x * n; c.sz += z * n;
          c.x = c.sx / c.total; c.z = c.sz / c.total;
        }
        c.due = Math.min(c.first + CRASH_MAX_HOLD, Math.max(c.due, now + CRASH_EXTEND));
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
        // THE derailment. Screech leads with people screaming, the crash lands a beat later, and
        // the running rattle dies with the train. Per-car events inside the
        // same pile-up fold into one screech + scream + crash.
        const a = ev.x != null ? this._att(ev.x, ev.z) : 1;
        if (a >= 0.05 && now - this._lastScreech > 2.0) {
          this._lastScreech = now;
          e.play('derail-screech', { vol: 1.0 * a });
          e.playTrainScream({ vol: 0.95 * a, delay: 0.15 });
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
