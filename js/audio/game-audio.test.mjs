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
  // `scale` is the rival ladder: recorded separately from `vol` so an assertion
  // can tell "this arm applied the wrong ratio" from "this arm has the wrong
  // base level". What a player hears is the product — see `eff()` below.
  play(name, { vol = 1, rate = 1, delay = 0, scale = 1 } = {}) { this.plays.push({ name, vol, rate, delay, scale }); }
  // Deterministic pick: the variant chosen is irrelevant to every assertion
  // here, the fact that a debris/glass layer fired at all is not.
  playRandom(names, opts) { this.play(names[0], opts); }
  playCoin(opts) { this.play('coin', opts); }
  playPowerUpCollect(opts) { this.play('milestone', opts); }
  playPowerUpSpawn(opts) { this.play('coin', opts); }
  playDisasterTeleport(opts) { this.play('disaster-teleport', opts); }
  playTrainScream(opts) { this.play('train-scream', opts); }
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

/** What a player actually hears from a recorded play: base level times the
 * rival ladder. Assertions about loudness must use this, never `.vol` alone. */
const effLevel = (p) => (p ? p.vol * (p.scale ?? 1) : null);

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

// -------------------------------------------- the rival quake is quiet, not off
// Owner decision 2026-08-17 (RCA-2026-08-17 section 7.1): a rival's fault-line
// quake is world-audible and attenuated. `crash` is world-scoped and always
// voiced, so muting the rumble under audible collapses gives a player the
// consequence without the cause, which reads as a missing sound.
//
// Both halves are asserted deliberately. `handleEvent` accepts `{ quiet }` and
// used to DISCARD it on this path (the case called playFaultLineQuake() with no
// argument, and that method took no parameters), so a test that checked only
// that the quake fired would pass against a build playing a rival at full
// volume. The ducking is the larger intrusion and the easier one to reintroduce
// by accident: a rival's quake must not dip the local player's bed or score.
{
  const { g, eng, music } = makeGame();
  g.playFaultLineQuake();
  eq(eng.count('earthquake'), 1, 'the local quake plays');
  eq(effLevel(eng.find('earthquake')), 1.0, 'the local quake plays at full level');
  eq(eng.ducks.length, 1, 'the local quake ducks the ambience bed');
  eq(music.ducks.length, 1, 'and ducks the music: it happened to YOU');
}
{
  const { g, eng, music } = makeGame();
  g.playFaultLineQuake({ quiet: true });
  eq(eng.count('earthquake'), 1, "a rival's quake is still heard, not muted");
  eq(effLevel(eng.find('earthquake')), 0.35, "a rival's quake is attenuated, not full level");
  eq(eng.ducks.length, 0, "a rival's quake must NOT duck the local ambience bed");
  eq(music.ducks.length, 0, "a rival's quake must NOT duck the local player's music");
}
{
  // The same, threaded through handleEvent, which is how main.js reaches it.
  const { g, eng, music } = makeGame();
  g.handleEvent({ type: 'quake', hole: {} }, { quiet: true });
  eq(eng.find('earthquake') && effLevel(eng.find('earthquake')), 0.35,
    "handleEvent must thread `quiet` to the quake, not accept it and drop it");
  eq(eng.ducks.length, 0, 'and a quiet quake ducks nothing through handleEvent either');
  eq(music.ducks.length, 0, 'including the music');
}
{
  const { g, eng } = makeGame();
  g.handleEvent({ type: 'quake', hole: {} });
  eq(eng.find('earthquake') && effLevel(eng.find('earthquake')), 1.0,
    'and an unqualified quake is still the full local one');
}

// ------------------------------------------- the rival ladder is a DISTANCE
// `quiet` marks an event as someone else's. The level it plays at is not a flat
// constant: it is `base * RIVAL_RATIO * _att(their hole)`, because a flat
// scalar makes a rival quaking 150 m away exactly as loud as one 10 m from your
// hole, which inverts the point. The near rival is the one you need to hear;
// the far one is pure mix tax. It also dissolves most of the N-rival stacking
// problem, since five rivals only stack at full ratio when all five are on top
// of you, which is the one moment that information is worth the headroom.
//
// RIVAL_RATIO is written out here rather than imported: a test that imports the
// constant it is checking asserts nothing.
const RATIO = 0.35;
const ATT_FULL = 25, ATT_ZERO = 160;
const att = (d) => Math.max(0, Math.min(1, (ATT_ZERO - d) / (ATT_ZERO - ATT_FULL)));
const eff = (p) => (p ? p.vol * (p.scale ?? 1) : null);
const near = (a, b, msg) => { n++; assert.ok(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, want ${b})`); };

// (h) Distance, not a constant.
{
  const { g, eng } = makeGame();
  g.updateListener(0, 0, null);

  // Right on top of you: the loudest a rival ever gets, still well under yours.
  g.handleEvent({ type: 'eat', hole: { x: 0, z: 0, radius: 2 } }, { quiet: true });
  eq(eng.plays.length, 1, "a rival eating next to you is heard");
  near(eff(eng.plays[0]), 0.65 * RATIO, "...at RIVAL_RATIO of the local gulp");

  // Half a city away: quieter by the same model the collapses already use.
  const { g: g2, eng: e2 } = makeGame();
  g2.updateListener(0, 0, null);
  g2.handleEvent({ type: 'eat', hole: { x: 150, z: 0, radius: 2 } }, { quiet: true });
  near(eff(e2.plays[0]), 0.65 * RATIO * att(150), 'a rival 150 m away is attenuated too');
  check(eff(e2.plays[0]) < 0.02,
    'and lands under the engine audibility floor, which is CORRECT: a rival that '
    + 'far should be gone, not faint. Do not "fix" this by raising the ratio.');

  // Past ATT_ZERO there is nothing left, exactly as for a distant collapse.
  const { g: g3, eng: e3 } = makeGame();
  g3.updateListener(0, 0, null);
  g3.handleEvent({ type: 'eat', hole: { x: 200, z: 0, radius: 2 } }, { quiet: true });
  near(eff(e3.plays[0]), 0, 'a rival past ATT_ZERO is silent, not faint');
}

// (i) The local player is untouched by any of it.
{
  const { g, eng } = makeGame();
  g.updateListener(0, 0, null);
  g.handleEvent({ type: 'eat', hole: { x: 90, z: 0, radius: 2 } });
  near(eff(eng.plays[0]), 0.65,
    'your own gulp is never distance-scaled: the listener IS your hole');
}

// (j) Every hole-scoped arm carries the ladder, not just the two that already
// read `quiet`. This is the defect: 2 of 22 cases honoured it and the rest
// accepted the flag and played at full level anyway.
{
  const HOLE = { x: 0, z: 0, radius: 2, slot: 3 };
  const cases = [
    ['coin', { type: 'coin', hole: HOLE, value: 5 }],
    ['powerup_collect', { type: 'powerup_collect', hole: HOLE, powerup: { type: 'quake' } }],
    ['combo', { type: 'combo', hole: HOLE, level: 2 }],
    ['growth', { type: 'growth', hole: HOLE }],
    ['milestone', { type: 'milestone', hole: HOLE }],
    ['goal', { type: 'goal', hole: HOLE }],
    ['disaster_teleport', { type: 'disaster_teleport', hole: HOLE }],
    ['quake', { type: 'quake', hole: HOLE }],
  ];
  for (const [label, ev] of cases) {
    const { g: gl, eng: el } = makeGame();
    gl.updateListener(0, 0, null);
    gl.handleEvent(ev);
    const loud = el.plays.map(eff);

    const { g: gq, eng: eq2 } = makeGame();
    gq.updateListener(0, 0, null);
    gq.handleEvent(ev, { quiet: true });
    const soft = eq2.plays.map(eff);

    eq(soft.length, loud.length, `${label}: a rival's event still sounds, it is not dropped`);
    check(loud.length > 0, `${label}: precondition, the local event sounds at all`);
    for (let i = 0; i < loud.length; i++) {
      near(soft[i], loud[i] * RATIO, `${label}: layer ${i} plays at RIVAL_RATIO of local`);
    }
  }
}

// (k) A rival never spends YOUR ducks. The ambience and music dips are most of
// what makes an event feel like it happened to you; spending them on someone
// else's timer dips your own bed and score for something you did not do.
{
  const { g, eng, music } = makeGame();
  g.updateListener(0, 0, null);
  g.handleEvent({ type: 'milestone', hole: { x: 0, z: 0 }, tier: 'roar' }, { quiet: true });
  eq(eng.ducks.length, 0, "a rival's roar does not duck your ambience");
  eq(music.ducks.length, 0, "a rival's roar does not duck your music");

  const { g: g2, music: m2 } = makeGame();
  g2.updateListener(0, 0, null);
  g2.handleEvent({ type: 'goal', hole: { x: 0, z: 0 } }, { quiet: true });
  eq(m2.ducks.length, 0, "a rival's goal does not duck your music");

  // ...and the local versions still do, so this is a scope fix, not a removal.
  const { g: g3, eng: e3, music: m3 } = makeGame();
  g3.updateListener(0, 0, null);
  g3.handleEvent({ type: 'milestone', hole: { x: 0, z: 0 }, tier: 'roar' });
  check(e3.ducks.length > 0 && m3.ducks.length > 0, 'your own roar still ducks both');
}

// (l) A rival cannot starve your gulps through the shared eat throttle. The
// 0.055 s "a plowed row is one mouthful" limiter is per-GameAudio, so if a
// rival's eat consumed it, your next gulp inside that window would be dropped —
// the rival would be eating your feedback, not just making noise.
{
  const { g, eng } = makeGame();
  g.updateListener(0, 0, null);
  g.handleEvent({ type: 'eat', hole: { x: 0, z: 0, radius: 2, slot: 3 } }, { quiet: true });
  eng.ctx.currentTime = 0.01;   // well inside the 0.055 s window
  g.handleEvent({ type: 'eat', hole: { x: 0, z: 0, radius: 2 } });
  eq(eng.plays.length, 2, "a rival's gulp must not consume the local player's eat throttle");
  near(eff(eng.plays[1]), 0.65, 'and the local gulp that follows it is full strength');
}

// (m) The batch entry point REFUSES `quiet`. One flag cannot be right for a
// drained batch: it mixes ownerless world events with hole-scoped ones from
// several holes, and the obvious future call `handleEvents(rivalEvents,
// { quiet: true })` would attenuate the tornado and the derailment for
// everybody. The caller that knows ownership decides, per event.
{
  const { g, eng } = makeGame();
  g.updateListener(0, 0, null);
  const warns = [];
  const realWarn = console.warn;
  console.warn = (m) => warns.push(m);
  // Past the derail screech's 2 s re-trigger guard so the world event really fires.
  eng.ctx.currentTime = 5;
  try {
    g.handleEvents([
      { type: 'eat', hole: { x: 0, z: 0, radius: 2, slot: 3 } },
      { type: 'derail', x: 0, z: 0 },
    ], { quiet: true });
  } finally { console.warn = realWarn; }

  near(effLevel(eng.plays.find((p) => p.name === 'eat-1')), 0.65,
    'handleEvents must NOT attenuate through a batch-level quiet');
  const screech = eng.plays.find((p) => p.name === 'derail-screech');
  check(screech, 'precondition: the world event in the batch actually sounded');
  near(effLevel(screech), 1.0,
    'and a world event in that batch is certainly not attenuated for everybody');
  eq(warns.length, 1, 'the refusal is announced once, not silently swallowed');
  check(/handleEvents\(\) ignores `quiet`/.test(warns[0] || ''), 'and it says what to do instead');
}

console.log(`PASS game audio: ${n} assertions`);
