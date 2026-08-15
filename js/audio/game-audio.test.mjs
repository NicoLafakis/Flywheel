// Guard for the one thing a player complained about by ear: a single building
// coming down used to make a dozen crash sounds stacked on each other, because
// the sim reports one 'crash' per chunk that lands hard and GameAudio voiced
// every one of them. This file pins the pooling that replaced it — one voice
// per BUILDING, sized by the whole building, silent for anything that is just
// pieces falling off something.
//
// Fakes stand in for WebAudio, localStorage and the music director. The engine
// spy records what a player would actually hear (which name, how loud, how far
// into the voice), which is the only thing these assertions care about.

import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
globalThis.window = { AudioContext: class {} };

const { GameAudio } = await import('./game-audio.js');

/** Records plays instead of making them. `ctx.currentTime` is the clock the
 * pooling runs on, so a test drives time by assigning to it. */
class SpyEngine {
  constructor() {
    this.ctx = { currentTime: 0 };
    this.plays = [];
    this.ducks = [];
    this.muted = false;
  }
  play(name, { vol = 1, rate = 1, delay = 0 } = {}) { this.plays.push({ name, vol, rate, delay }); }
  // Deterministic pick: the variant chosen is irrelevant to every assertion
  // here, the fact that a debris/glass layer fired at all is not.
  playRandom(names, opts) { this.play(names[0], opts); }
  playCoin(opts) { this.play('coin', opts); }
  playPowerUpCollect(opts) { this.play('milestone', opts); }
  playPowerUpSpawn(opts) { this.play('coin', opts); }
  duckAmbience(sec, depth) { this.ducks.push({ sec, depth }); }
  loop() { return null; }
  count(name) { return this.plays.filter((p) => p.name === name).length; }
  find(name) { return this.plays.find((p) => p.name === name); }
  /** Every crash voice this engine heard, big or small. */
  get voices() { return this.count('crash-big') + this.count('crash-small'); }
}

function makeGame() {
  const music = {
    ducks: [],
    setMuted() {}, init() {}, request() {}, setVolume() {},
    get volume() { return 1; },
    duck(sec, depth) { this.ducks.push({ sec, depth }); },
  };
  const g = new GameAudio({ musicDirector: music, enableCrashSounds: true });
  const eng = new SpyEngine();
  g.engine = eng;   // swap AFTER construction: nothing has been played yet
  return { g, eng, music };
}

let n = 0;
const check = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.equal(a, b, msg); };

// ------------------------------------------------------- (a) one tower, once
// A skyscraper toppling: the trunk lands first and the rest of the structure
// rains down behind it over a second and a half. Fifteen sim events, 59 blocks.
{
  const { g, eng, music } = makeGame();
  const SIZES = [18, 8, 6, 5, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1];
  let total = 0;
  SIZES.forEach((size, i) => {
    eng.ctx.currentTime = i * 0.1;
    total += size;
    // Rubble spreads over a few metres — well inside one building's footprint.
    g.handleEvent({ type: 'crash', x: 40 + (i % 3) * 2, z: -12 + (i % 4), size });
  });
  eng.ctx.currentTime = 2.0;
  g.tick();

  check(total >= 40, 'the scenario really is a 40+ block building');
  eq(eng.voices, 1, 'one tower makes exactly ONE crash sound');
  eq(eng.count('crash-big'), 1, 'and it is the big tier');
  eq(eng.count('crash-small'), 0, 'the small tier never fires alongside it');
  eq(eng.count('rumble'), 1, 'one rumble bed under it, not fifteen');
  eq(eng.count('glass-1'), 1, 'one glass layer');
  eq(eng.count('debris-1'), 1, 'one debris layer');
  eq(eng.find('glass-1').delay, 0.25, 'the voice keeps its shape: glass a beat in');
  eq(eng.find('debris-1').delay, 0.45, 'settling grit behind that');
  // (e) the ducking rides the voice, not the impacts. Twenty rapid re-ducks of
  // the city bed and the score is a large part of what read as jarring.
  eq(eng.ducks.length, 1, 'the ambience bed ducks once for the collapse');
  eq(music.ducks.length, 1, 'and the score ducks once');
  // The tier is decided on the pooled count, not on whichever slab hit first:
  // the trunk alone (18) would have been the SMALL tier.
  eq(eng.find('crash-big').vol, 1.0, 'unattenuated with no listener set');
}

// --------------------------------------- (b) pieces falling: no sound at all
{
  const { g, eng, music } = makeGame();
  // Four chunks sloughing off one facade: 8 blocks, under the small threshold.
  [2, 2, 2, 2].forEach((size, i) => {
    eng.ctx.currentTime = i * 0.12;
    g.handleEvent({ type: 'crash', x: 0, z: 0, size });
  });
  eng.ctx.currentTime = 3.0;
  g.tick();
  eq(eng.plays.length, 0, 'pieces falling are SILENT — no crash, no debris scatter');
  eq(eng.ducks.length, 0, 'and nothing ducks the city for them');
  eq(music.ducks.length, 0, 'nor the score');
}
{
  const { g, eng } = makeGame();
  // Genuinely scattered: three separate small hits far apart, none a collapse.
  [[0, 0], [60, 0], [0, -70]].forEach(([x, z], i) => {
    eng.ctx.currentTime = i * 0.05;
    g.handleEvent({ type: 'crash', x, z, size: 3 });
  });
  eng.ctx.currentTime = 3.0;
  g.tick();
  eq(eng.plays.length, 0, 'three unrelated small impacts stay silent, separately');
}

// -------------------------- (c) two buildings 100 m apart do NOT become one
{
  const { g, eng, music } = makeGame();
  const A = [0, 0];       // 33 blocks -> big
  const B = [100, 0];     // 15 blocks -> small
  const seq = [
    [0.0, A, 20], [0.0, B, 7],
    [0.1, A, 9], [0.1, B, 5],
    [0.2, A, 4], [0.2, B, 3],
  ];
  for (const [t, [x, z], size] of seq) {
    eng.ctx.currentTime = t;
    g.handleEvent({ type: 'crash', x, z, size });
  }
  eng.ctx.currentTime = 1.0;
  g.tick();
  eq(eng.voices, 2, 'two simultaneous collapses are two sounds, not one');
  eq(eng.count('crash-big'), 1, 'the 33-block building gets the big tier');
  eq(eng.count('crash-small'), 1, 'the 15-block one gets the small tier on its OWN total');
  eq(eng.ducks.length, 2, 'each voiced collapse ducks the bed once');
  eq(music.ducks.length, 1, 'only the big tier reaches the score');
}
{
  // The radius is a real boundary, not a formality: rubble 12 m apart is one
  // building, and neither half alone would have cleared the big threshold.
  const { g, eng } = makeGame();
  eng.ctx.currentTime = 0;
  g.handleEvent({ type: 'crash', x: 0, z: 0, size: 15 });
  eng.ctx.currentTime = 0.05;
  g.handleEvent({ type: 'crash', x: 12, z: 0, size: 15 });
  eng.ctx.currentTime = 1.0;
  g.tick();
  eq(eng.voices, 1, 'rubble inside the radius is one building');
  eq(eng.count('crash-big'), 1, 'and the pooled 30 blocks read as a tower');
}

// -------------------- (d) the tail is swallowed; a later collapse is not
{
  const { g, eng } = makeGame();
  const hit = (t, size) => { eng.ctx.currentTime = t; g.handleEvent({ type: 'crash', x: 0, z: 0, size }); };
  const at = (t) => { eng.ctx.currentTime = t; g.tick(); };

  hit(0, 30);
  at(0.3);
  eq(eng.count('crash-big'), 1, 'the collapse speaks');

  hit(1.0, 30);      // still settling, inside the suppression window
  at(1.5);
  eq(eng.count('crash-big'), 1, 'the long tail of the same tower adds nothing');

  at(3.1);           // suppression expired 2 s after that last impact
  hit(3.2, 30);
  at(3.5);
  eq(eng.count('crash-big'), 2, 'a genuinely new collapse there speaks again');
}

// ------------------------------------------ (f) surfaces with no listener
{
  const { g, eng } = makeGame();
  // No x/z at all (and no updateListener call anywhere): the pooling still has
  // to work, it just cannot tell two sites apart, and nothing attenuates.
  [10, 10, 10].forEach((size, i) => {
    eng.ctx.currentTime = i * 0.1;
    g.handleEvent({ type: 'crash', size });
  });
  eng.ctx.currentTime = 1.0;
  g.tick();
  eq(eng.voices, 1, 'positionless impacts still pool into one voice');
  eq(eng.count('crash-big'), 1, 'tiered on their pooled 30 blocks');
  eq(eng.find('crash-big').vol, 1.0, 'and played at full level, as before distance existed');
}

// ------------------------------------------------- distance still silences
{
  const { g, eng } = makeGame();
  g.updateListener(0, 0, null);
  eng.ctx.currentTime = 0;
  g.handleEvent({ type: 'crash', x: 400, z: 0, size: 60 });
  eng.ctx.currentTime = 1.0;
  g.tick();
  eq(eng.plays.length, 0, 'a collapse far past the attenuation range spends no nodes');
}
{
  const { g, eng } = makeGame();
  g.updateListener(0, 0, null);
  eng.ctx.currentTime = 0;
  g.handleEvent({ type: 'crash', x: 90, z: 0, size: 60 });
  eng.ctx.currentTime = 1.0;
  g.tick();
  const big = eng.find('crash-big');
  check(big && big.vol > 0.4 && big.vol < 0.7, 'a collapse a district away is audible but quiet');
}

// ------------------------------------------- a dead surface leaves nothing
{
  const { g, eng } = makeGame();
  eng.ctx.currentTime = 0;
  g.handleEvent({ type: 'crash', x: 0, z: 0, size: 40 });
  g.stopScene();     // level teardown / results reveal
  eng.ctx.currentTime = 5.0;
  g.tick();
  eq(eng.plays.length, 0, 'a pooling collapse is dropped with the scene, never banged over the results');
}
{
  // ...and the pool cannot grow without bound on a surface that keeps playing.
  const { g, eng } = makeGame();
  let peak = 0;
  for (let i = 0; i < 200; i++) {
    eng.ctx.currentTime = i * 0.5;
    g.handleEvent({ type: 'crash', x: (i % 7) * 30, z: 0, size: 12 });
    peak = Math.max(peak, g._collapses.length);
  }
  eng.ctx.currentTime = 1000; g.tick();   // the last one ripens...
  eng.ctx.currentTime = 1010; g.tick();   // ...and its suppression expires
  check(peak <= 8, 'the pool never holds more than the sites actually collapsing');
  eq(g._collapses.length, 0, 'retired collapses are reaped, so nothing accumulates');
}

// ----------------------------------------- everything else is unchanged
{
  const { g, eng } = makeGame();
  g.handleEvents([
    { type: 'eat', hole: { radius: 1.1 } },
    { type: 'coin' },
    { type: 'combo', level: 6 },
  ]);
  eq(eng.count('eat-1'), 1, 'gulps are untouched by the crash pooling');
  eq(eng.count('coin'), 1, 'coins too');
  eq(eng.count('combo-big'), 1, 'and the combo ladder');
  eq(eng.voices, 0, 'and none of them is mistaken for a collapse');
}

console.log(`PASS game audio: ${n} assertions`);
