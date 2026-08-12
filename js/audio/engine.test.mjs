// Bus-level guard for the three independent audio levels. The case this file
// exists for is `duckAmbience`: it used to ramp the ambience bus back to a
// hardcoded 0.55, so the first skyscraper collapse silently reset the player's
// ambience slider to full. Everything else here is the surrounding contract —
// master carries mute only, effects and ambience never touch each other.
//
// Fakes stand in for WebAudio and localStorage: the engine only ever reads
// `.gain.value` and the scheduling methods, so a plain recorder is enough to
// assert what a player would hear.

import assert from 'node:assert/strict';

class FakeParam {
  constructor(value) { this.value = value; this.ramps = []; this.cancels = 0; }
  cancelScheduledValues() { this.cancels++; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.ramps.push([v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) { this.ramps.push([v, t]); this.value = v; return this; }
  setTargetAtTime(v) { this.value = v; return this; }
}

class FakeNode {
  constructor(kind) { this.kind = kind; this.gain = new FakeParam(1); this.dest = null; }
  connect(node) { this.dest = node; return node; }
}

class FakeSource {
  constructor() {
    this.buffer = null; this.loop = false; this.dest = null;
    this.playbackRate = new FakeParam(1); this.started = false;
  }
  connect(node) { this.dest = node; return node; }
  start() { this.started = true; }
  stop() { this.started = false; }
}

class FakeCtx {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { kind: 'destination' };
    this.sources = [];
  }
  createGain() { return new FakeNode('gain'); }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  resume() { return Promise.resolve(); }
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
let ctx = null;
globalThis.window = { AudioContext: class { constructor() { ctx = new FakeCtx(); return ctx; } } };

const { AudioEngine } = await import('./engine.js');
const { GameAudio } = await import('./game-audio.js');
const { MusicDirector } = await import('./music.js');

const AMB_GAIN = 0.55;
const MASTER_GAIN = 0.9;

const engine = new AudioEngine();
engine.unlock();
assert.ok(ctx, 'unlock builds the context');
// The graph the whole split depends on: two sibling buses under one master.
assert.equal(engine.sfx.dest, engine.master);
assert.equal(engine.amb.dest, engine.master);
assert.equal(engine.master.dest, ctx.destination);

// Defaults: master is mute-only, the two levels start full.
assert.equal(engine.master.gain.value, MASTER_GAIN);
assert.equal(engine.sfx.gain.value, 1);
assert.equal(engine.amb.gain.value, AMB_GAIN);

// (a) Effects at 0, ambience at 1: the city bed still plays, crashes are silent.
engine.setVolume(0);
assert.equal(engine.sfx.gain.value, 0, 'effects slider at 0 silences the SFX bus');
assert.equal(engine.amb.gain.value, AMB_GAIN, 'ambience is untouched by the effects slider');
assert.equal(engine.master.gain.value, MASTER_GAIN, 'master never carries a level');

// (b) Ambience at 0, effects at 1: beds silent, crashes audible.
engine.setVolume(1);
engine.setAmbienceVolume(0);
assert.equal(engine.amb.gain.value, 0, 'ambience slider at 0 silences the ambience bus');
assert.equal(engine.sfx.gain.value, 1, 'effects are untouched by the ambience slider');

// Both persist under their own keys, so standalone surfaces inherit them.
engine.setAmbienceVolume(0.4);
assert.equal(store.get('flywheel.audio.volume'), '1');
assert.equal(store.get('flywheel.audio.ambVolume'), '0.4');
assert.equal(engine.amb.gain.value, AMB_GAIN * 0.4);

// Live mid-loop: a bed already running is fed by the bus gain, not by a value
// captured at start, so a drag mid-game moves it.
engine.buffers.set('amb-chicago', { duration: 10 });
const bed = engine.loop('amb-chicago', { vol: 1 });
assert.ok(bed, 'a decoded bed loops');
assert.equal(ctx.sources[0].dest.dest, engine.amb, 'beds hang off the ambience bus');
engine.setAmbienceVolume(0.8);
assert.equal(engine.amb.gain.value, AMB_GAIN * 0.8, 'slider moves a looping bed');

// (c) THE regression: a big collapse ducks relative to the CURRENT level and
// restores to it, never to a constant.
engine.setAmbienceVolume(0.4);
engine.duckAmbience(3.5, 0.25);
const ramps = engine.amb.gain.ramps.slice(-2);
assert.deepEqual(ramps.map((r) => r[0]), [AMB_GAIN * 0.4 * 0.25, AMB_GAIN * 0.4],
  'duck floor and recovery are both scaled by the ambience slider');
assert.equal(engine.amb.gain.value, AMB_GAIN * 0.4,
  'a collapse leaves ambience where the player set it, not at full');

// A drag DURING the recovery ramp wins: the scheduled values are cancelled.
engine.duckAmbience(3.5, 0.25);
const cancelsBefore = engine.amb.gain.cancels;
engine.setAmbienceVolume(1);
assert.ok(engine.amb.gain.cancels > cancelsBefore, 'a mid-duck drag cancels the ramp');
assert.equal(engine.amb.gain.value, AMB_GAIN, 'and lands on the new level immediately');

// Mute is global and is the only thing on master; the levels survive it.
engine.setMuted(true);
assert.equal(engine.master.gain.value, 0);
assert.equal(engine.sfx.gain.value, 1);
assert.equal(engine.amb.gain.value, AMB_GAIN);
engine.setMuted(false);
assert.equal(engine.master.gain.value, MASTER_GAIN);

// (d) Music is on a different device entirely and answers only to its own
// slider: the facade must not route the effects level into it.
class FakeAudioEl {
  constructor() { this.volume = 1; this.paused = true; this.src = ''; }
  addEventListener() {}
  removeAttribute() {}
  load() {}
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const media = new FakeAudioEl();
const musicStore = new Map();
const music = new MusicDirector({
  createAudio: () => media,
  storage: { getItem: (k) => musicStore.get(k) ?? null, setItem: (k, v) => musicStore.set(k, v) },
  fadeMs: 0,
});
const game = new GameAudio({ musicDirector: music });
game.engine.unlock();   // build the facade's own bus graph
game.setMusicVolume(0.5);
const musicLevel = media.volume;
game.setVolume(0.1);
assert.equal(media.volume, musicLevel, 'the effects slider does not touch music');
game.setAmbienceVolume(0.2);
assert.equal(media.volume, musicLevel, 'the ambience slider does not touch music');
assert.equal(game.ambienceVolume, 0.2, 'the facade reports the engine level back');
assert.equal(game.engine.sfx.gain.value, 0.1);
assert.equal(game.engine.amb.gain.value, AMB_GAIN * 0.2);

console.log('PASS audio engine: 30 assertions');
