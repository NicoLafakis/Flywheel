// TDD static + executable guard: the "show a presentation, then arm a camera
// cinematic" seam, and the continuity of every cinematic's release.
//
// WHY THIS FILE EXISTS
// Commit 8818c2d replaced `Screens.showPokemonEncounterModal` with a stub that
// calls its `onSkip` callback SYNCHRONOUSLY, where the modal it replaced only
// ever called it from a click, a keydown or a 10 s timer. Its caller,
// `playNextPokemonSpawn` in js/main.js, shows the presentation FIRST and arms
// the camera cinematic SECOND — an ordering that is only correct while the
// presentation is guaranteed asynchronous. Under the stub the completion
// handler runs before the thing it completes exists: the cancel finds nothing,
// the `finished` latch is already set when the real completion fires, and the
// camera is left running a 1.5 s cinematic that NO code path can cancel.
//
// Because the two map power-ups are created in the sim CONSTRUCTOR and the
// frame loop drains events unconditionally (even while the READY gate holds the
// sim), that fired on the first rendered frame of every level and overrode the
// establishing shot before it was ever drawn. Measured live: a 213.1 m
// single-frame camera translation, a 1076 deg/s whip-pan against the module's
// own 400 deg/s ceiling, and a permanent pitch leak (0.520 against a 0.54 base).
// See .wiki/findings/RCA-2026-08-17-level-start-camera-transition.md
//
// WHAT IT CATCHES
//   A1  a cancel that precedes its own arm (the ordering defect itself)
//   A2  a cinematic release that is discontinuous in any of its five channels,
//       or a yaw rate above the module's own chase ceiling
//   A3  a cinematic that does not return the rig state it borrowed
//   A4  a cinematic arming while the level intro owns the camera
//   A5  a negative frame delta
//   A6  a presentation whose completion callback fires synchronously — the one
//       assertion that would have failed the day 8818c2d landed
//
// HOW THE EXECUTABLE HALVES AVOID BEING TAUTOLOGIES
// js/camera.js cannot be imported in Node (it imports `three`, resolved by the
// page's import map), and js/main.js is a browser entry point. So this suite
// EXTRACTS the shipped source text of each block under test and compiles it with
// `new Function`, exactly as tools/sfx-event-guard.test.mjs does for the audio
// seam. Nothing below re-implements the logic it audits: editing the shipped
// code changes what these assertions execute.
//
// WHAT IT DOES NOT CATCH (documented limits)
//   * how any of this LOOKS. The live Playwright probe in the RCA's section 4 is
//     the instrument for that; this suite bounds the numbers it measures.
//   * the earthquake cinematic's INTERNAL hard cuts. Those are authored arcade
//     cuts, not a release defect — see the printed note near the end.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// Failures are COLLECTED, not thrown on the spot, then reported together and
// exited non-zero at the end. Aborting on A1 would hide A2 and A3, which are the
// assertions that distinguish the real fix from the plausible wrong one
// (deleting the cinematic outright).
let n = 0;
const failures = [];
const check = (cond, msg) => { n++; if (!cond) failures.push(msg); return !!cond; };
const eq = (a, b, msg) => check(Object.is(a, b), `${msg}\n      expected: ${JSON.stringify(b)}, actual: ${JSON.stringify(a)}`);

console.log('Testing the cinematic arming seam and cinematic release continuity...');

const cameraSrc = read('js/camera.js');
const mainSrc = read('js/main.js');
const screensSrc = read('js/ui/screens.js');

// ---------------------------------------------------------------------------
// 0. A source scanner that knows about strings and comments.
//
//    Naive brace matching is enough right up until someone writes a `{` inside a
//    comment or a template literal in one of these blocks, at which point the
//    extraction silently slices the wrong text and every assertion below becomes
//    a statement about a fragment. Cheap to do properly, so it is done properly.
// ---------------------------------------------------------------------------
function scanBlock(src, openIdx) {
  // openIdx must point at the `{` that opens the block. Returns the index of the
  // matching `}`, or -1.
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i === -1) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i === -1) return -1; i++; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Same scanner, for a parenthesised parameter list.
function scanParens(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i === -1) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i === -1) return -1; i++; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Extract `<anchor> ... }` where anchor is a literal string ending just before
// the block's opening brace region (e.g. `if (this.x) {`).
function extractFrom(src, anchor, label) {
  const at = src.indexOf(anchor);
  if (at === -1) { check(false, `ANTI-VACUITY: ${label}: anchor not found in the shipped source: ${JSON.stringify(anchor)}`); return null; }
  const open = src.indexOf('{', at + anchor.length - 1);
  if (open === -1) { check(false, `ANTI-VACUITY: ${label}: no opening brace after the anchor`); return null; }
  const close = scanBlock(src, open);
  if (close === -1) { check(false, `ANTI-VACUITY: ${label}: unbalanced braces from the anchor`); return null; }
  return src.slice(at, close + 1);
}

// Extract a whole method or function DECLARATION by name. Separate from
// extractFrom because a destructured parameter list opens a brace of its own
// (`showPokemonEncounterModal({ powerup, onSkip } = {})`), and taking the first
// `{` after the name slices off the parameter object instead of the body.
function extractMethod(src, name, label, { decl = false } = {}) {
  // `decl` anchors on `function <name>(` rather than the first mention: a
  // function that is CALLED before it is declared (queuePokemonSpawnIntro calls
  // playNextPokemonSpawn three lines above the declaration) would otherwise be
  // sliced from its own call site.
  const m = decl
    ? new RegExp(`function\\s+(${name})\\s*\\(`, 'm').exec(src)
    : new RegExp(`(^|[^A-Za-z0-9_$.])${name}\\s*\\(`, 'm').exec(src);
  if (!m) { check(false, `ANTI-VACUITY: ${label}: ${name} not found in the shipped source`); return null; }
  const start = decl ? m.index + m[0].indexOf(name) : m.index + (m[1] ? m[1].length : 0);
  const lparen = src.indexOf('(', start);
  const rparen = scanParens(src, lparen);
  if (rparen === -1) { check(false, `ANTI-VACUITY: ${label}: unbalanced parameter list on ${name}`); return null; }
  const open = src.indexOf('{', rparen);
  if (open === -1) { check(false, `ANTI-VACUITY: ${label}: no body after ${name}'s parameter list`); return null; }
  const close = scanBlock(src, open);
  if (close === -1) { check(false, `ANTI-VACUITY: ${label}: unbalanced braces in ${name}`); return null; }
  return { text: src.slice(start, close + 1), sig: src.slice(lparen, rparen + 1), body: src.slice(open + 1, close) };
}
const methodText = (src, name, label, opts) => { const r = extractMethod(src, name, label, opts); return r && r.text; };
const declText = (src, name, label) => methodText(src, name, label, { decl: true });

const numConst = (name) => {
  const m = cameraSrc.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`));
  if (!m) { check(false, `ANTI-VACUITY: js/camera.js must still declare const ${name}`); return null; }
  return Number(m[1]);
};

// The module's OWN stated angular ceiling, read from the module rather than
// restated here, so the bound tracks the tuning instead of going stale.
const FOLLOW_MAX_RATE = numConst('FOLLOW_MAX_RATE');
const FOLLOW_MAX_RATE_RAMP = numConst('FOLLOW_MAX_RATE_RAMP');
check(FOLLOW_MAX_RATE > 0 && FOLLOW_MAX_RATE_RAMP >= 1,
  `ANTI-VACUITY: the chase rate ceiling read as ${FOLLOW_MAX_RATE} x ${FOLLOW_MAX_RATE_RAMP}, which is not a rate`);
const YAW_CEIL = FOLLOW_MAX_RATE * FOLLOW_MAX_RATE_RAMP;   // rad/s

// ---------------------------------------------------------------------------
// A1. THE CANCEL MUST NEVER PRECEDE THE ARM.
//
//     Compiles the SHIPPED text of js/main.js's queue/announce/play trio against
//     recording stubs, and drives `showPokemonEncounterModal` with the SHIPPED
//     text of the screens method, so the test tracks the real presentation
//     rather than a guess about it. The camera stub is not a stub either: its
//     two cinematic methods are the shipped ChaseCamera methods, compiled out of
//     js/camera.js, so the identity check A1 depends on is the real one.
// ---------------------------------------------------------------------------
const startPokeSrc = methodText(cameraSrc, 'startPokemonSpawnCinematic', 'ChaseCamera');
const skipPokeSrc = methodText(cameraSrc, 'skipPokemonSpawnCinematic', 'ChaseCamera');
const startQuakeSrc = methodText(cameraSrc, 'startEarthquakeCinematic', 'ChaseCamera');
const skipQuakeSrc = methodText(cameraSrc, 'skipEarthquakeCinematic', 'ChaseCamera');

// Helpers the four methods under test may call on `this`. Compiled from the
// SHIPPED text when they exist so their real behaviour is exercised, and
// substituted with an inert stand-in when they do not — a missing helper must
// surface as the assertion that cares about it failing, never as the harness
// crashing and taking the other 60 assertions down with it.
const HELPERS = ['_yieldIntroToCinematic'];
const helperSrc = HELPERS.map((n) => methodText(cameraSrc, n, 'ChaseCamera') || `${n}() {}`);

function makeCamera({ introActive = false } = {}) {
  const parts = [startPokeSrc, skipPokeSrc, startQuakeSrc, skipQuakeSrc].filter(Boolean);
  if (parts.length !== 4) return null;
  let obj;
  try {
    obj = new Function('INTRO_ACTIVE', `return {
      pitch: 0.54, dist: 16, yaw: 0, reducedMotion: false,
      pokeSpawnCinematic: null, quakeCinematic: null,
      introPhase: INTRO_ACTIVE ? 'hold' : 'off',
      introActive() { return this.introPhase !== 'off'; },
      skipIntro() { this.introPhase = 'off'; },
      triggerShake() {}, fovKick() {},
      ${helperSrc.join(',\n      ')},
      ${parts.join(',\n      ')}
    };`)(introActive);
  } catch (e) {
    check(false, `js/camera.js: the extracted cinematic methods do not compile standalone (${e.message})`);
    return null;
  }
  const log = [];
  for (const name of ['startPokemonSpawnCinematic', 'skipPokemonSpawnCinematic']) {
    const real = obj[name];
    obj[name] = function wrapped(...args) {
      log.push({ op: name.startsWith('start') ? 'start' : 'skip', held: this.pokeSpawnCinematic !== null });
      return real.apply(this, args);
    };
  }
  obj.__log = log;
  return obj;
}

// The shipped presentation, compiled as itself.
const modalSrc = methodText(screensSrc, 'showPokemonEncounterModal', 'Screens');
const dismissSrc = methodText(screensSrc, 'dismissPokemonEncounterModal', 'Screens');
function makeScreens() {
  const toasts = [];
  const timers = new Map();
  let seq = 0;
  // Timers are stubbed and DRIVEN, never real: a real one would keep the process
  // alive, and the property under test is when the callback fires relative to
  // the call returning, not how long the toast lives.
  const setT = (fn) => { timers.set(++seq, fn); return seq; };
  const clearT = (id) => timers.delete(id);
  let obj = null;
  try {
    obj = new Function('TOASTS', 'setTimeout', 'clearTimeout', `return {
      showOrbitalBeaconNotification(pu) { TOASTS.push(pu); },
      ${modalSrc},
      ${dismissSrc}
    };`)(toasts, setT, clearT);
  } catch (e) {
    check(false, `js/ui/screens.js: showPokemonEncounterModal does not compile standalone (${e.message})`);
    return null;
  }
  obj.__toasts = toasts;
  obj.__fireTimers = () => { const fns = [...timers.values()]; timers.clear(); for (const f of fns) f(); };
  return obj;
}

// The shipped caller trio. `announcePowerUpSpawn` is optional: it does not exist
// before the fix, and its absence must not stop A1/A4 running and reporting.
const rawAnnounce = mainSrc.includes('function announcePowerUpSpawn(')
  ? declText(mainSrc, 'announcePowerUpSpawn', 'js/main.js') : '';
const rawQueue = declText(mainSrc, 'queuePokemonSpawnIntro', 'js/main.js');
const rawPlay = declText(mainSrc, 'playNextPokemonSpawn', 'js/main.js');
const announceSrc = rawAnnounce ? `function ${rawAnnounce}` : '';
const queueSrc = rawQueue ? `function ${rawQueue}` : null;
const playSrc = rawPlay ? `function ${rawPlay}` : null;

check(!!rawQueue && /pokeSpawnQueue/.test(rawQueue || ''),
  'ANTI-VACUITY: the extracted queuePokemonSpawnIntro does not mention pokeSpawnQueue — the slice is wrong');
check(!!rawPlay && /startPokemonSpawnCinematic/.test(rawPlay || ''),
  'ANTI-VACUITY: the extracted playNextPokemonSpawn does not mention startPokemonSpawnCinematic — the slice is wrong');

const CALLER_PARAMS = ['pokeSpawnQueue', 'isShowingPokeSpawn', 'audio', 'triggerHaptic', 'screens',
  'save', 'state', 'lastTs', 'sim', 'isVoxelSandbox', 'endSandbox', 'endLevel'];

function makeCaller({ cam, screens }) {
  if (!queueSrc || !playSrc) return null;
  const body = `${announceSrc}\n${queueSrc}\n${playSrc}\n`
    + 'return { queue: queuePokemonSpawnIntro, play: playNextPokemonSpawn,'
    + ' snap: () => ({ state, isShowingPokeSpawn, queued: pokeSpawnQueue.length, lastTs }) };';
  let make;
  try {
    make = new Function(...CALLER_PARAMS, body);
  } catch (e) {
    check(false, `js/main.js: the extracted spawn-intro callers do not compile standalone (${e.message})`);
    return null;
  }
  const audioCalls = [];
  const audio = new Proxy({}, { get: () => (...a) => audioCalls.push(a) });
  const api = make([], false, audio, () => {}, screens,
    { settings: { reducedMotion: false } }, 'playing', 0,
    { over: false, timeLeft: 30 }, true, () => {}, () => {});
  api.__cam = cam;
  api.__screens = screens;
  return api;
}

{
  const cam = makeCamera();
  const screens = makeScreens();
  const caller = cam && screens ? makeCaller({ cam, screens }) : null;
  if (caller) {
    // The realistic mid-play case: an intermittent respawn with the intro long
    // over. `initial` is covered by A4, which asserts it never gets this far.
    try {
      caller.queue({ x: 10, z: -4, type: 'quake' }, { hole: { x: 0, z: 0 } }, cam, 'intermittent');
    } catch (e) {
      check(false, `js/main.js: queuePokemonSpawnIntro threw while driving an intermittent spawn (${e.message})`);
    }
    const log = cam.__log;
    const firstStart = log.findIndex((e) => e.op === 'start');
    const firstSkip = log.findIndex((e) => e.op === 'skip');
    check(firstStart !== -1,
      'A1: an intermittent power-up spawn must still arm the camera cinematic — nothing called '
      + 'startPokemonSpawnCinematic at all, so the fix has deleted the feature rather than ordered it');
    check(firstSkip === -1 || firstStart === -1 || firstStart < firstSkip,
      'A1: the cancel ran BEFORE the arm. `playNextPokemonSpawn` shows the presentation first and '
      + 'arms the camera second, which is only correct while the presentation is guaranteed '
      + `asynchronous. Call order was: ${log.map((e) => e.op).join(', ')} — this is the `
      + 'RCA-2026-08-17 defect: the cancel finds nothing to cancel and the cinematic is orphaned.');
    for (const e of log) {
      if (e.op === 'skip') {
        check(e.held, 'A1: skipPokemonSpawnCinematic ran with no cinematic armed — a cancel that '
          + 'cancels nothing is the signature of the arm/announce inversion');
      }
    }
    // THE ANTI-ORPHAN PROPERTY, tested directly rather than by timing accident:
    // fire the armed cinematic's own completion, the way update() does at
    // progress >= 1.0, and require that it still DOES something. Today the
    // callback is a latched no-op — `finished` was set inside the presentation,
    // before the cinematic existed — so the cinematic is left running with no
    // path anywhere that can cancel it.
    const armed = cam.pokeSpawnCinematic;
    if (armed && typeof armed.onComplete === 'function') armed.onComplete();
    eq(cam.pokeSpawnCinematic, null,
      "A1: firing the armed cinematic's own onComplete left it armed. Its completion callback is a "
      + 'dead latch: it ran to completion during the presentation, before the cinematic existed, so '
      + 'nothing anywhere can now cancel it and it will drive the camera for its full duration.');
    const snap = caller.snap();
    eq(snap.queued, 0, 'A1: the spawn queue must be drained');
    eq(snap.isShowingPokeSpawn, false, 'A1: the isShowingPokeSpawn latch must be cleared');
    eq(snap.state, 'playing', "A1: the caller must restore state to 'playing'");
    eq(screens.__toasts.length, 1, 'A1: the spawn must still announce itself exactly once');
  }
}

// --- A1a: the SAME caller, driven against a deliberately SYNCHRONOUS presentation.
//
//     Everything above is measured against the shipped screens.js, and once that
//     defers its callback the arm/announce ORDER stops being observable: both
//     orders behave identically when the presentation is asynchronous. Proven by
//     mutation — inverting the order in playNextPokemonSpawn survived the whole
//     suite unscathed.
//
//     That is exactly the property the fix claims: "correct under BOTH
//     contracts". A claim that only one contract is ever exercised is not a
//     tested claim, and the contract that bit us is the one no longer shipped. So
//     the adversary is supplied here rather than waited for: a stand-in
//     presentation that calls its completion inline, which is what
//     showPokemonEncounterModal did for months and what the next cleanup commit
//     may make it do again.
// ---------------------------------------------------------------------------
{
  const cam = makeCamera();
  const toasts = [];
  // Deliberately NOT the shipped method — the shipped one is checked by A6. This
  // is the hostile contract, held fixed so the caller is tested against it
  // whatever screens.js does today.
  const hostile = {
    __toasts: toasts,
    showOrbitalBeaconNotification(pu) { toasts.push(pu); },
    showPokemonEncounterModal({ powerup, onSkip } = {}) {
      this.showOrbitalBeaconNotification(powerup);
      if (typeof onSkip === 'function') onSkip();
    },
    dismissPokemonEncounterModal() {},
  };
  const caller = cam ? makeCaller({ cam, screens: hostile }) : null;
  if (caller) {
    try {
      caller.queue({ x: 10, z: -4, type: 'quake' }, { hole: { x: 0, z: 0 } }, cam, 'intermittent');
    } catch (e) {
      check(false, `js/main.js: the spawn caller threw against a synchronous presentation (${e.message})`);
    }
    const log = cam.__log;
    const firstStart = log.findIndex((e) => e.op === 'start');
    const firstSkip = log.findIndex((e) => e.op === 'skip');
    check(firstStart !== -1 && (firstSkip === -1 || firstStart < firstSkip),
      'A1a: against a SYNCHRONOUS presentation the cancel ran before the arm. Call order was: '
      + `${log.map((e) => e.op).join(', ') || '(nothing)'}. playNextPokemonSpawn must arm the camera `
      + 'BEFORE it shows the presentation, so that a presentation which completes inline still finds '
      + 'a cinematic to cancel. This ordering is the whole of RCA-2026-08-17 step 2.');
    for (const e of log) {
      if (e.op === 'skip') {
        check(e.held,
          'A1a: against a synchronous presentation, skipPokemonSpawnCinematic ran with nothing armed. '
          + 'The cancel fired first, latched `finished`, and the cinematic armed a line later is '
          + 'ORPHANED — it will drive the camera for its full 1.5 s with no path anywhere to stop it.');
      }
    }
    eq(cam.pokeSpawnCinematic, null,
      'A1a: a synchronous presentation left a cinematic armed with its completion handler already '
      + 'spent. This is the measured level-start defect: a 1.5 s camera takeover nothing can cancel, '
      + 'landing on top of the establishing shot.');
    const snap = caller.snap();
    eq(snap.queued, 0, 'A1a: the spawn queue must drain under a synchronous presentation too');
    eq(snap.isShowingPokeSpawn, false, 'A1a: the isShowingPokeSpawn latch must clear');
    eq(snap.state, 'playing', "A1a: the caller must restore state to 'playing'");
    eq(toasts.length, 1, 'A1a: the spawn must still announce itself exactly once');
  }
}

// --- A1b: the identity check. A stale handler must not cancel a newer cinematic.
{
  const cam = makeCamera();
  if (cam) {
    const first = cam.startPokemonSpawnCinematic({ dropX: 1, dropZ: 1, playerX: 0, playerZ: 0, duration: 1.5, onComplete: () => {} });
    check(first != null && first === cam.pokeSpawnCinematic,
      'A1b: startPokemonSpawnCinematic must RETURN the cinematic it armed, so the caller has a token '
      + 'to identity-check its cancel against');
    const stale = first;
    cam.pokeSpawnCinematic = null;
    const second = cam.startPokemonSpawnCinematic({ dropX: 5, dropZ: 5, playerX: 0, playerZ: 0, duration: 1.5, onComplete: () => {} });
    cam.skipPokemonSpawnCinematic(stale);
    eq(cam.pokeSpawnCinematic, second,
      "A1b: a STALE token must not cancel a newer cinematic. skipPokemonSpawnCinematic ignored its "
      + 'argument and cancelled whatever happened to be armed.');
    cam.skipPokemonSpawnCinematic(second);
    eq(cam.pokeSpawnCinematic, null, 'A1b: the matching token must still cancel');
  }
}

// --- A1c: the same treatment on the quake pairing, so the CLASS is covered ----
{
  const cam = makeCamera();
  if (cam) {
    const first = cam.startEarthquakeCinematic({ x0: 0, z0: 0, x1: 1, z1: 1, angle: 0, length: 40, onComplete: () => {} });
    check(first != null && first === cam.quakeCinematic,
      'A1c: startEarthquakeCinematic must return its cinematic too — the convention is the class, not '
      + 'the instance (js/main.js:playEarthquakeCinematic has the identical show-then-arm ordering and '
      + 'is one stub away from the same failure, with 5.8 s of uncancellable camera behind it)');
    cam.quakeCinematic = null;
    const second = cam.startEarthquakeCinematic({ x0: 0, z0: 0, x1: 9, z1: 9, angle: 1, length: 40, onComplete: () => {} });
    cam.skipEarthquakeCinematic(first);
    eq(cam.quakeCinematic, second, 'A1c: a stale quake token must not cancel a newer quake cinematic');
  }
}

// ---------------------------------------------------------------------------
// A2 / A3. THE RELEASE MUST BE CONTINUOUS IN EVERY CHANNEL, AND THE RIG STATE
//          THE CINEMATIC BORROWED MUST COME BACK.
//
//          The shipped override block is compiled as a function of
//          (dt, tx, tz, dist) over a fake `this`, and stepped at 1/60 across the
//          whole cinematic. Two live-distance populations are driven, not one:
//          250 m is the establishing overview the level start would hand it, 16 m
//          is the ordinary chase distance a mid-play respawn hands it. A single
//          population would have measured the mid-play case as nearly continuous
//          by coincidence — the phase-2 cineDist of 16.0 happens to equal the
//          chase distance, so the unblended channel has almost nothing to jump.
// ---------------------------------------------------------------------------
const pokeBlockSrc = extractFrom(cameraSrc, 'if (this.pokeSpawnCinematic) {', 'js/camera.js poke override block');
const quakeBlockSrc = extractFrom(cameraSrc, 'if (this.quakeCinematic) {', 'js/camera.js quake override block');
check(!!pokeBlockSrc && /pc\.dropX/.test(pokeBlockSrc || ''),
  'ANTI-VACUITY: the extracted poke override block does not mention pc.dropX — the slice is wrong');
check(!!quakeBlockSrc && /qc\.angle/.test(quakeBlockSrc || ''),
  'ANTI-VACUITY: the extracted quake override block does not mention qc.angle — the slice is wrong');

const DT = 1 / 60;
const shortest = (d) => Math.atan2(Math.sin(d), Math.cos(d));

function compileBlock(src, label) {
  try {
    return new Function('dt', 'tx', 'tz', 'dist', 'FOLLOW_MAX_RATE', 'FOLLOW_MAX_RATE_RAMP',
      `${src}\nreturn { tx, tz, dist };`);
  } catch (e) {
    check(false, `js/camera.js: the ${label} override block does not compile standalone (${e.message})`);
    return null;
  }
}

// Drives one cinematic to completion and returns the per-frame applied pose.
function runCinematic({ src, label, field, arm, liveDist, liveTx = 0, liveTz = 0, basePitch = 0.54, baseYaw = 0 }) {
  const fn = compileBlock(src, label);
  if (!fn) return null;
  const rig = {
    pitch: basePitch, yaw: baseYaw, reducedMotion: false,
    triggerShake() {}, fovKick() {},
    pokeSpawnCinematic: null, quakeCinematic: null,
  };
  rig[field] = arm;
  arm.time = 0;
  arm.savedPitch = basePitch;
  arm.reducedMotion = false;
  const frames = [];
  for (let i = 0; i < 600 && rig[field]; i++) {
    const progress = Math.min(1, (arm.time + DT) / arm.duration);
    let out;
    try {
      out = fn.call(rig, DT, liveTx, liveTz, liveDist, FOLLOW_MAX_RATE, FOLLOW_MAX_RATE_RAMP);
    } catch (e) {
      check(false, `js/camera.js: the ${label} override block threw while stepping (${e.message})`);
      return null;
    }
    frames.push({ progress, dist: out.dist, tx: out.tx, tz: out.tz, pitch: rig.pitch, yaw: rig.yaw });
  }
  return { frames, rig };
}

// Worst single-step change, measured over the cinematic's OWN outputs. Step 0 is
// deliberately excluded from the distance gate and reported separately: the cut
// INTO a cinematic is an authored film cut, and after the intro gate (A4) it can
// no longer land on top of an establishing shot. The gate is the cut OUT, which
// is the measured 213.1 m defect.
function worst(frames, from = 1, until = 1.01) {
  let dist = 0, distAt = null, yaw = 0, yawAt = null;
  for (let i = Math.max(1, from); i < frames.length; i++) {
    if (frames[i].progress < until - 1.0 - 1e-9) { /* unreachable, kept explicit */ }
    const prev = frames[i - 1], cur = frames[i];
    const rel = Math.abs(cur.dist - prev.dist) / Math.max(1e-6, Math.abs(prev.dist));
    if (rel > dist) { dist = rel; distAt = cur.progress; }
    const dy = Math.abs(shortest(cur.yaw - prev.yaw));
    if (dy > yaw) { yaw = dy; yawAt = cur.progress; }
  }
  return { dist, distAt, yaw, yawAt };
}
function worstIn(frames, lo, hi) {
  const idx = [];
  for (let i = 1; i < frames.length; i++) if (frames[i].progress >= lo && frames[i].progress <= hi) idx.push(i);
  let dist = 0, distAt = null, yaw = 0, yawAt = null;
  for (const i of idx) {
    const prev = frames[i - 1], cur = frames[i];
    const rel = Math.abs(cur.dist - prev.dist) / Math.max(1e-6, Math.abs(prev.dist));
    if (rel > dist) { dist = rel; distAt = cur.progress; }
    const dy = Math.abs(shortest(cur.yaw - prev.yaw));
    if (dy > yaw) { yaw = dy; yawAt = cur.progress; }
  }
  return { dist, distAt, yaw, yawAt };
}

const DIST_TOL = 0.25;                 // 25% of the running value in one step
const YAW_TOL = YAW_CEIL * DT * 1.02;  // the module's own ceiling, 2% for float slack

// A 176-degree return is the measured case (RCA 4.1): the drop site sits almost
// directly behind the camera, which is exactly when an unwrapped interpolation
// picks the long way round.
//
// Driven at TWO durations as well as two live distances. 1.5 s is what
// js/main.js passes; 1.1 s is the floor startPokemonSpawnCinematic itself
// enforces (`Math.max(1.1, duration)`), and the phases are fractions of the
// duration, so the floor is where every authored rate is at its fastest. Testing
// only the shipped 1.5 s leaves the whole bottom of the module's own accepted
// range unmeasured — and the rate cap is provably slack there and load-bearing
// here, which a single-duration run reports as "the cap does nothing".
const POKE_ARM = (duration = 1.5) => ({
  dropX: -0.7, dropZ: -60, playerX: 0, playerZ: 0, duration, onComplete: () => {},
});

for (const [liveDist, duration] of [[250, 1.5], [16, 1.5], [250, 1.1], [16, 1.1]]) {
  const run = pokeBlockSrc && runCinematic({
    src: pokeBlockSrc, label: 'poke', field: 'pokeSpawnCinematic', arm: POKE_ARM(duration), liveDist,
  });
  if (!run) continue;
  const w = worst(run.frames);
  const entry = run.frames.length ? Math.abs(run.frames[0].dist - liveDist) / liveDist : 0;
  console.log(`  poke @ live dist ${liveDist} m, duration ${duration} s: ${run.frames.length} frames, worst step `
    + `dist ${(w.dist * 100).toFixed(1)}% (at progress ${w.distAt && w.distAt.toFixed(3)}), `
    + `yaw ${(w.yaw * 180 / Math.PI).toFixed(2)} deg = ${(w.yaw / DT).toFixed(2)} rad/s `
    + `(at progress ${w.yawAt && w.yawAt.toFixed(3)}); entry cut ${(entry * 100).toFixed(1)}%`);
  check(w.dist < DIST_TOL,
    `A2: the poke cinematic's distance channel jumps ${(w.dist * 100).toFixed(1)}% in a single `
    + `1/60 s step at progress ${w.distAt && w.distAt.toFixed(3)} (live dist ${liveDist} m, `
    + `duration ${duration} s), against a `
    + `${DIST_TOL * 100}% bound. Phase 3 computes an eased return for all five channels but applies `
    + 'it to tx and tz only — `dist`, `pitch` and `yaw` are assigned under `if (progress < 0.88)`, so '
    + 'at the boundary the distance reverts to the live value in ONE frame. Measured live as 213.1 m '
    + 'of camera travel in a 16.3 ms frame.');
  check(w.yaw <= YAW_TOL,
    `A2: the poke cinematic's yaw steps ${(w.yaw / DT).toFixed(2)} rad/s `
    + `(${(w.yaw * 180 / Math.PI / DT).toFixed(0)} deg/s) at progress ${w.yawAt && w.yawAt.toFixed(3)}, `
    + `against the module's own ceiling of ${YAW_CEIL} rad/s `
    + `(FOLLOW_MAX_RATE ${FOLLOW_MAX_RATE} x FOLLOW_MAX_RATE_RAMP ${FOLLOW_MAX_RATE_RAMP}, whose own `
    + 'comment calls 545 deg/s "a nausea machine"). The phase-1 whip-pan interpolates an UNWRAPPED '
    + 'angle difference against a `this.yaw` it rewrote on the previous frame.');
  // A3, on the same run.
  const last = run.frames[run.frames.length - 1];
  check(Math.abs(run.rig.pitch - 0.54) < 1e-9,
    `A3: the poke cinematic left this.pitch at ${run.rig.pitch.toFixed(4)} against the 0.54 it borrowed `
    + `(final frame progress ${last.progress.toFixed(3)}). \`savedPitch\` is captured in `
    + 'startPokemonSpawnCinematic and read nowhere; the borrowed pitch leaks into the rest of the '
    + 'level. Measured live as a permanent 0.520.');
}

// --- A3b: the cancel path has to return the borrowed pitch too ---------------
{
  const cam = makeCamera();
  if (cam) {
    cam.pitch = 0.54;
    const token = cam.startPokemonSpawnCinematic({ dropX: 4, dropZ: 4, playerX: 0, playerZ: 0, duration: 1.5, onComplete: () => {} });
    cam.pitch = 0.38;   // the cinematic's phase-0 hero pitch, as update() would have written it
    cam.skipPokemonSpawnCinematic(token);
    check(Math.abs(cam.pitch - 0.54) < 1e-9,
      `A3b: skipPokemonSpawnCinematic left this.pitch at ${cam.pitch} — a cancelled cinematic must `
      + 'hand back the rig state it borrowed, not only a completed one');
  }
}

// --- A2 on the quake, so the class is covered rather than the instance -------
// SCOPED to the release. The earthquake cutscene's internal phase boundaries are
// AUTHORED hard cuts ("three hard-cut arcade close-ups"), and turning those into
// pans would rewrite a deliberate sequence nobody asked to change. They are
// measured and printed below as a standing note, per the RCA's instruction to
// triage rather than silently exempt.
for (const liveDist of [250, 16]) {
  const arm = { x0: 0, z0: 0, x1: 40, z1: 30, angle: 0.6, length: 50, duration: 5.8, onComplete: () => {} };
  const run = quakeBlockSrc && runCinematic({
    src: quakeBlockSrc, label: 'quake', field: 'quakeCinematic', arm, liveDist,
  });
  if (run) {
    const rel = worstIn(run.frames, 0.90, 1.0);
    const all = worst(run.frames);
    console.log(`  quake @ live dist ${liveDist} m: ${run.frames.length} frames, RELEASE (progress >= 0.90) worst step `
      + `dist ${(rel.dist * 100).toFixed(1)}%, yaw ${(rel.yaw / DT).toFixed(2)} rad/s; `
      + `whole-sequence worst dist ${(all.dist * 100).toFixed(1)}% at progress `
      + `${all.distAt && all.distAt.toFixed(3)}, yaw ${(all.yaw / DT).toFixed(2)} rad/s at progress `
      + `${all.yawAt && all.yawAt.toFixed(3)}`);
    check(rel.dist < DIST_TOL,
      `A2q: the quake cinematic's RELEASE jumps ${(rel.dist * 100).toFixed(1)}% in a single step at `
      + `progress ${rel.distAt && rel.distAt.toFixed(3)}. Its phase 7 has the identical shape as the `
      + "poke's phase 3: an eased return computed for five channels and applied to two.");
    check(rel.yaw <= YAW_TOL,
      `A2q: the quake cinematic's RELEASE yaw steps ${(rel.yaw / DT).toFixed(2)} rad/s against the `
      + `${YAW_CEIL} rad/s ceiling`);
    check(Math.abs(run.rig.pitch - 0.54) < 1e-9,
      `A3q: the quake cinematic left this.pitch at ${run.rig.pitch.toFixed(4)} against the 0.54 it `
      + 'borrowed — savedPitch is captured at js/camera.js and read nowhere');
    console.log('  note: the quake cutscene\'s INTERNAL cuts (hit-stop -> three arcade close-ups -> '
      + 'launch) are authored hard cuts, deliberately not gated here. Standing open item, see '
      + '.wiki/modules/render.md.');
  }
}

// ---------------------------------------------------------------------------
// A4. NO CAMERA CINEMATIC MAY ARM WHILE THE INTRO OWNS THE CAMERA.
//
//     Two directions, because a one-directional test passes against the
//     plausible wrong fix (never arming at all), which deletes the feature.
// ---------------------------------------------------------------------------
{
  // Direction one: an `initial` spawn is level furniture and must not arm.
  const cam = makeCamera();
  const screens = makeScreens();
  const caller = cam && screens ? makeCaller({ cam, screens }) : null;
  if (caller) {
    caller.queue({ x: 10, z: -4, type: 'quake' }, { hole: { x: 0, z: 0 } }, cam, 'initial');
    eq(cam.__log.filter((e) => e.op === 'start').length, 0,
      "A4: a `reason: 'initial'` power-up spawn must not arm a camera cinematic. The two map "
      + 'power-ups are placed by the sim CONSTRUCTOR and their events are drained on the first frame '
      + 'of the level, before a single tick has run, so this fires UNDER the establishing shot on '
      + 'every level start — measured overriding it 20 ms before the first cam.update of the level.');
    eq(screens.__toasts.length, 1,
      "A4: a `reason: 'initial'` spawn must still ANNOUNCE itself. Dropping the cinematic must not "
      + 'silently drop the ORBITAL DROP DETECTED toast with it.');
    eq(caller.snap().state, 'playing',
      "A4: an `initial` spawn must not put the game into the 'powerup_encounter' state under the "
      + 'READY gate');
  }
}
{
  // Direction two: the intro predicate, on a reason that would otherwise arm.
  const cam = makeCamera({ introActive: true });
  const screens = makeScreens();
  const caller = cam && screens ? makeCaller({ cam, screens }) : null;
  if (caller) {
    caller.queue({ x: 10, z: -4, type: 'quake' }, { hole: { x: 0, z: 0 } }, cam, 'intermittent');
    eq(cam.__log.filter((e) => e.op === 'start').length, 0,
      'A4: no cinematic may arm while introActive() is true — the intro owns the camera until it '
      + 'says otherwise');
  }
}
{
  // Direction three: with the intro over and a real arrival, it MUST arm. This is
  // the half that fails against "just delete the cinematic".
  const cam = makeCamera({ introActive: false });
  const screens = makeScreens();
  const caller = cam && screens ? makeCaller({ cam, screens }) : null;
  if (caller) {
    caller.queue({ x: 10, z: -4, type: 'quake' }, { hole: { x: 0, z: 0 } }, cam, 'intermittent');
    check(cam.__log.filter((e) => e.op === 'start').length === 1,
      'A4: an intermittent respawn with the intro over must still arm exactly one cinematic — '
      + 'the gate is a gate, not a deletion');
  }
}
{
  // The cleanest possible evidence that no gate exists: a zero-caller predicate.
  const callers = [...mainSrc.matchAll(/introActive\s*\(/g)].length;
  check(callers > 0,
    'A4: js/camera.js exports introActive() specifically to gate this, and js/main.js never calls '
    + 'it. A predicate with zero callers is a gate that was written and never wired up.');
}
// The call sites must actually forward the reason, or the gate above can never
// see anything but `undefined`.
for (const site of [/queuePokemonSpawnIntro\(ev\.powerup,\s*sim,\s*cam,\s*ev\.reason\)/]) {
  const hits = [...mainSrc.matchAll(new RegExp(site.source, 'g'))].length;
  const total = [...mainSrc.matchAll(/queuePokemonSpawnIntro\(ev\.powerup/g)].length;
  check(total >= 2, `ANTI-VACUITY: expected both powerup_spawn call sites in js/main.js, found ${total}`);
  eq(hits, total,
    `A4: ${total - hits} of ${total} queuePokemonSpawnIntro call site(s) do not forward ev.reason. `
    + 'The sims emit `reason` on every powerup_spawn (js/voxelsim.js, js/sim.js) and the gate is '
    + 'unreachable without it.');
}

// ---------------------------------------------------------------------------
// A5. THE FRAME DELTA MUST NEVER BE NEGATIVE.
//
//     Math.min clamps the ceiling and nothing clamps the floor. Three handlers
//     rewrite `lastTs = performance.now()` from inside the event loop, AFTER
//     frame() has already advanced lastTs in the same frame, so `ts - lastTs`
//     can be large and negative. Measured live at about -6.2 s, which drove the
//     cinematic clock backwards and the field of view to 344 degrees.
// ---------------------------------------------------------------------------
{
  const dtLines = mainSrc.split('\n');
  const rawAt = dtLines.findIndex((l) => l.includes('const rawDt = (ts - lastTs)'));
  check(rawAt !== -1, 'ANTI-VACUITY: js/main.js must still compute rawDt from (ts - lastTs)');
  const realAt = dtLines.findIndex((l, i) => i > rawAt && /const realDt\s*=/.test(l));
  check(realAt !== -1 && realAt - rawAt <= 2, 'ANTI-VACUITY: js/main.js must still derive realDt next to rawDt');
  if (rawAt !== -1 && realAt !== -1) {
    const src = dtLines.slice(rawAt, realAt + 1).join('\n');
    let dtFn = null;
    try { dtFn = new Function('ts', 'lastTs', `${src}\nreturn realDt;`); }
    catch (e) { check(false, `js/main.js: the frame-delta lines do not compile standalone (${e.message})`); }
    if (dtFn) {
      const back = dtFn(1000, 7246);   // the measured case: lastTs rewritten ahead of ts
      check(back >= 0,
        `A5: a frame delta of ${back.toFixed(3)} s reached the sim. Math.min clamps the ceiling and `
        + 'nothing clamps the floor, so a mid-frame `lastTs = performance.now()` rewrite (three of '
        + 'them exist) drives realDt negative. Measured live at -6.2 s, which pinned the spawn '
        + 'cinematic in phase 0 for the whole READY hold and drove the FOV to 344 degrees via '
        + '`_fovKick *= Math.max(0, 1 - dt*6)` evaluating as a multiply by 38.2.');
      eq(dtFn(1100, 1000), 0.1, 'A5: the ceiling clamp must survive the floor clamp');
      eq(dtFn(1050, 1000), 0.05, 'A5: an ordinary 50 ms frame must pass through untouched');
      eq(dtFn(1000, 1000), 0, 'A5: a zero-length frame must read as zero');
    }
  }
  // And the rewrites themselves — SCOPED to the three that run from inside the
  // event loop, mid-frame. The four other `lastTs = performance.now()` sites in
  // js/main.js seed the clock immediately before the loop is started or
  // re-armed, which is the correct use and must not be flagged: frame() has not
  // run yet, so there is nothing to under-measure.
  for (const fn of ['playNextPokemonSpawn', 'playEarthquakeCinematic', 'playPowerUpCollectCinematic']) {
    const body = declText(mainSrc, fn, 'js/main.js');
    if (!check(!!body, `ANTI-VACUITY: js/main.js must still define ${fn}`)) continue;
    const hits = [...body.matchAll(/lastTs = performance\.now\(\)/g)].length;
    eq(hits, 0,
      `A5: ${fn} rewrites lastTs from inside the event loop, AFTER frame() has already advanced `
      + 'lastTs = ts in the same frame. That can only UNDER-measure the next delta, which is how it '
      + 'goes negative. `accumulator = 0` is the mechanism that actually stops a paused interval '
      + 'being charged to the resumed sim, and it is already there in one of the three.');
  }
}

// ---------------------------------------------------------------------------
// A6. A PRESENTATION MUST NOT INVOKE ITS COMPLETION CALLBACK SYNCHRONOUSLY.
//
//     This is the assertion that would have failed the day 8818c2d landed. A
//     callback contract that exists only in a comment survives exactly one
//     cleanup commit.
//
//     EXECUTED, not grepped. A lexical "is the call inside a nested function"
//     scan has to model arrow bodies, concise arrows, method shorthand and
//     control-flow parentheses, and every one of those is a chance to be
//     confidently wrong in the direction that passes. So each presentation is
//     compiled from its shipped text against a minimal DOM and driven with a
//     recording completion callback: whether it fired before the call returned
//     is the property, measured directly.
// ---------------------------------------------------------------------------
{
  const PRESENTATIONS = [
    { name: 'showPokemonEncounterModal', call: (o, rec) => o.showPokemonEncounterModal({ powerup: { type: 'quake', spec: {} }, onSkip: rec }) },
    { name: 'showEarthquakeCinematic', call: (o, rec) => o.showEarthquakeCinematic({ onSkip: rec, duration: 5.8 }) },
    { name: 'showPowerUpShowcase', call: (o, rec) => o.showPowerUpShowcase({ type: 'quake', spec: { name: 'Q', icon: 'x', tagline: 't', desc: 'd', duration: 10, color: 1 } }, rec) },
  ];
  const EXTRA = ['showCivilDisasterEmergencyCinematic', 'showOrbitalBeaconNotification'];
  const bodies = [];
  let ok = true;
  for (const name of [...PRESENTATIONS.map((p) => p.name), ...EXTRA]) {
    const t = methodText(screensSrc, name, 'js/ui/screens.js');
    if (!check(!!t, `ANTI-VACUITY: js/ui/screens.js must still define ${name}`)) { ok = false; continue; }
    bodies.push(t);
  }
  // A control pair through the SAME harness, so a harness that can no longer
  // observe a synchronous call fails loudly instead of passing everything.
  bodies.push('__probeSync(cb) { cb(); }');
  bodies.push('__probeAsync(cb) { setTimeout(cb, 0); }');

  const fakeNode = () => {
    const node = {
      style: {}, textContent: '', innerHTML: '', dataset: {}, parentNode: null, id: '',
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      addEventListener() {}, removeEventListener() {},
      appendChild(c) { if (c) c.parentNode = node; return c; },
      removeChild() {}, remove() {}, setAttribute() {}, focus() {},
      querySelector() { return fakeNode(); },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    };
    return node;
  };
  const body = fakeNode();
  const doc = { body, createElement: fakeNode, getElementById: () => fakeNode(), querySelector: () => fakeNode() };
  const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  // Timers are stubbed rather than real: a real setInterval would keep the
  // process alive, and firing one would answer a different question anyway.
  let timerId = 0;
  const noTimer = () => ++timerId;

  let obj = null;
  if (ok) {
    try {
      obj = new Function('el', 'POWERUP_SPECS', 'document', 'window', 'setTimeout', 'setInterval',
        'clearTimeout', 'clearInterval', 'STUBS',
        `return Object.assign({}, STUBS, {\n${bodies.join(',\n')}\n});`)(
        fakeNode, {}, doc, win, noTimer, noTimer, () => {}, () => {},
        {
          clear() {}, dismissCivilDisasterEmergencyCinematic() {},
          dismissPokemonEncounterModal() {}, actions: {}, current: null,
          root: body, _civilDisasterOverlayEl: null, _civilDisasterCleanup: null,
        });
    } catch (e) {
      check(false, `js/ui/screens.js: the presentation methods do not compile standalone (${e.message})`);
    }
  }
  if (obj) {
    // Instrument check first: prove the harness can tell the two apart.
    let hits = 0;
    obj.__probeSync(() => { hits++; });
    eq(hits, 1, 'ANTI-VACUITY: the A6 harness cannot observe a synchronous callback at all');
    hits = 0;
    obj.__probeAsync(() => { hits++; });
    eq(hits, 0, 'ANTI-VACUITY: the A6 harness reports a DEFERRED callback as synchronous');

    for (const p of PRESENTATIONS) {
      let fired = 0;
      let threw = null;
      try { p.call(obj, () => { fired++; }); } catch (e) { threw = e; }
      if (threw) {
        check(false, `A6: ${p.name} could not be driven headlessly (${threw.message}) — the assertion `
          + 'below did not run, which is a gap, not a pass');
        continue;
      }
      eq(fired, 0,
        `A6: ${p.name} invoked its completion callback SYNCHRONOUSLY, before returning. Every caller `
        + 'that pairs "show a presentation" with "start a camera cinematic" is written against an '
        + "asynchronous completion; a synchronous one makes the caller's cancel run before its own "
        + 'arm. This is the RCA-2026-08-17 root cause: 8818c2d turned showPokemonEncounterModal into '
        + 'a toast with a bare `onSkip();` and the level-start camera has been hijacked on every '
        + 'start since. Pass the callback to a listener or a timer, or do not call it.');
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`\nFAIL cinematic arming guard: ${failures.length} of ${n} assertion(s) failed\n`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  console.error('');
  assert.fail(`${failures.length} of ${n} cinematic-arming assertion(s) failed`);
}
console.log(`PASS cinematic arming guard: ${n} assertions`);
