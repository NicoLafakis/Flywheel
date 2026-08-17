// TDD static + executable guard: the sim-event to sound-effect seam.
//
// WHY THIS FILE EXISTS
// `tools/music-cue.test.mjs` guards the MUSIC side of the same class and cannot
// catch this one. It matches cue names passed as string literals and checks them
// against the registry, so it catches a caller asking for the WRONG name. It
// cannot catch a caller that has STOPPED ASKING, because a deleted call site
// simply drops out of its results array and its anti-vacuity floor stays
// satisfied by the other callers in the same file.
//
// That is exactly what shipped. Commit 8c3c85d deleted `js/main.js`'s one
// `audio.handleEvent(ev)` while introducing the multiplayer `isLocalHole` guard
// in its place, and the voxel city ran for a day with no gulps, no combo ladder,
// no SIZE stings, no milestones, no derailment and no tornado. Three existing
// guards were all green throughout. See
// .wiki/findings/RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md
//
// WHAT IT CATCHES
// 1. The pump going missing again from either frame-loop branch (lexical).
// 2. The guard's SCOPING regressing in either direction (executable): a rival's
//    hole-scoped event must not be voiced, a world event with no hole must be.
//    Direction matters. A one-directional check passes against the plausible
//    wrong fix (`if (isLocalHole)` alone), which silences the tornado and the
//    derailment in every multiplayer match.
//
// HOW THE EXECUTABLE HALF AVOIDS BEING A TAUTOLOGY
// It does not re-implement the guard. It EXTRACTS the shipped source text of the
// `const isLocalHole` line plus the statements that follow it, compiles that text
// with `new Function`, and drives it with synthetic events against a recording
// stub. A check written in the shape of the thing it audits proves nothing (see
// the tautological combo assertion in RCA-2026-08-13 section B5); this one runs
// the real line, so editing the guard changes what the test executes.
//
// WHAT IT DOES NOT CATCH (documented limits)
//   * whether the mapped asset decodes, or how loud the result is (that is
//     js/audio/game-audio.test.mjs, driving a spy engine);
//   * an event delivered through some future third path that is neither branch
//     of the frame loop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// Failures are COLLECTED, not thrown on the spot, then reported together and
// exited non-zero at the end. Aborting on the first assertion would have shown
// only "the pump is missing" and hidden the scoping and attenuation assertions
// behind it, which are the ones that distinguish this fix from the plausible
// wrong one. A gate that reports one defect at a time costs a run per defect.
let n = 0;
const failures = [];
const check = (cond, msg) => { n++; if (!cond) failures.push(msg); return !!cond; };
const eq = (a, b, msg) => check(Object.is(a, b), `${msg}\n      expected: ${JSON.stringify(b)}, actual: ${JSON.stringify(a)}`);

console.log('Testing the sim-event to sound-effect seam...');

// ---------------------------------------------------------------------------
// 1. What the audio layer claims it can voice.
// ---------------------------------------------------------------------------
const gameAudioSrc = read('js/audio/game-audio.js');
const handleEventSrc = gameAudioSrc.slice(gameAudioSrc.indexOf('handleEvent(ev,'));
const voiced = new Set([...handleEventSrc.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]));

// ---------------------------------------------------------------------------
// 2. What the sims actually emit. Brace-matched from each `events.push({` so a
//    multi-line event object is read whole rather than by a line window (that
//    window is what made a review miss `hole` declared as ES6 shorthand).
// ---------------------------------------------------------------------------
function emittedFrom(rel) {
  const src = read(rel);
  const out = [];
  for (const m of [...src.matchAll(/events\.push\(\s*\{/g)]) {
    const open = src.indexOf('{', m.index);
    let depth = 0, i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(open, i + 1);
    const type = (body.match(/type:\s*'([a-z_]+)'/) || [])[1];
    if (!type) continue;
    out.push({ type, hasHole: /(^|[{,\s])hole\s*[,:}]/.test(body), line: src.slice(0, m.index).split('\n').length, rel });
  }
  return out;
}
const emissions = [...emittedFrom('js/voxelsim.js'), ...emittedFrom('js/sim.js')];
const emitted = new Set(emissions.map((e) => e.type));

// ---------------------------------------------------------------------------
// 3. Anti-vacuity. A scanner that read nothing would pass forever while proving
//    nothing, so prove it is looking at real code BEFORE asserting anything.
// ---------------------------------------------------------------------------
check(voiced.size >= 15, `the case scanner found only ${voiced.size} voiced event type(s) — it is not reading handleEvent`);
check(voiced.has('eat'), "handleEvent must voice 'eat' — the scanner is not reading the switch");
check(emissions.length >= 15, `the emission scanner found only ${emissions.length} events.push site(s) — it is not reading the sims`);
check(emitted.has('eat'), "the sims must emit 'eat' — the scanner is not reading the pushes");

// ---------------------------------------------------------------------------
// 4. THE PUMP EXISTS. This is the assertion the regression would have failed.
// ---------------------------------------------------------------------------
const mainSrc = read('js/main.js');
const mainLines = mainSrc.split('\n');

// Anchored on the two updateListener calls, not on `if (isVoxelSandbox) {`:
// that string appears twice at the same indent and a findIndex on it would pick
// the earlier one, leaving this scan correct only by the accident of which `for`
// loop happens to come next. These two lines are each unique, and each is the
// first statement of the branch it belongs to.
const voxBranch = mainLines.findIndex((l) => l.includes('audio.updateListener(sim.localHole.x'));
check(voxBranch !== -1, 'js/main.js must still contain the voxel branch (audio.updateListener on sim.localHole)');
const legacyPump = mainLines.findIndex((l) => l.includes('audio.updateListener(sim.player.x'));
check(legacyPump !== -1, 'js/main.js must still contain the legacy branch (audio.updateListener on sim.player)');
check(voxBranch < legacyPump, 'js/main.js: the voxel branch must precede the legacy branch, or this scan is slicing the wrong region');

const voxLoopStart = mainLines.findIndex((l, i) => i > voxBranch && l.includes('for (const ev of events)'));
check(voxLoopStart !== -1 && voxLoopStart < legacyPump, 'js/main.js: the voxel branch must still iterate the drained events');
const voxLoopSrc = mainLines.slice(voxLoopStart, legacyPump).join('\n');
const legacySrc = mainLines.slice(legacyPump).join('\n');

check(/audio\.handleEvents?\s*\(/.test(voxLoopSrc),
  'js/main.js: the isVoxelSandbox event loop must hand every drained event to audio.handleEvent(). '
  + 'It does not. This is the RCA-2026-08-17 regression: the shipped city game requests no '
  + 'gulps, no combo ladder, no SIZE stings, no milestones, no derailment and no tornado.');
check(/audio\.handleEvents?\s*\(/.test(legacySrc),
  'js/main.js: the legacy campaign branch must hand its events to audio.handleEvent() too');

// ---------------------------------------------------------------------------
// 5. THE GUARD'S SCOPING, executed rather than re-implemented.
//    Extract the shipped `const isLocalHole` line and everything up to the first
//    `if (ev.type === ...)` arm, compile it, and drive it.
// ---------------------------------------------------------------------------
const isLocalHoleAt = mainLines.findIndex((l, i) => i > voxLoopStart && l.includes('const isLocalHole ='));
check(isLocalHoleAt !== -1, 'js/main.js: the voxel event loop must still compute isLocalHole');
const firstArmAt = mainLines.findIndex((l, i) => i > isLocalHoleAt && /^\s*(\} else )?if \(ev\.type ===/.test(l));
check(firstArmAt !== -1, 'js/main.js: the voxel event loop must still have ev.type arms after isLocalHole');

const guardSrc = mainLines.slice(isLocalHoleAt, firstArmAt).join('\n');
check(/audio\.handleEvents?\s*\(/.test(guardSrc),
  'js/main.js: the audio pump must sit between the isLocalHole computation and the first '
  + 'ev.type arm, so that every event passes it rather than only the arms someone remembered');

// Compile the REAL source text. `audio` is a recorder; `sim` supplies the two
// fields isLocalHole reads. A guard that will not compile is itself a failure,
// reported rather than thrown so the assertions below still run and report.
let runGuard = null;
try {
  runGuard = new Function('ev', 'isMultiplayer', 'sim', 'audio', guardSrc);
} catch (e) {
  check(false, `js/main.js: the extracted guard does not compile standalone (${e.message})`);
}
function deliver(ev, { isMultiplayer = true, localSlot = 0 } = {}) {
  if (!runGuard) return [];
  const calls = [];
  const localHole = { slot: 0, isPlayer: true };
  const audio = { handleEvent: (e, opts) => calls.push({ ev: e, opts: opts || {} }) };
  try {
    runGuard(ev, isMultiplayer, { localHole, localSlot }, audio);
  } catch (e) {
    check(false, `js/main.js: the guard threw on a ${ev.type} event (${e.message})`);
  }
  return calls;
}
const LOCAL = { slot: 0, isPlayer: true };
const RIVAL = { slot: 3, isPlayer: false };

// --- direction one: a rival's hole-scoped event is NOT voiced ---------------
eq(deliver({ type: 'eat', hole: RIVAL }).length, 0,
  "multiplayer: a RIVAL hole's eat must not be voiced (that is the coin isolation 8c3c85d added)");
eq(deliver({ type: 'coin', hole: RIVAL }).length, 0,
  "multiplayer: a RIVAL hole's coin must not be voiced");

// --- direction two: a WORLD event with no hole IS voiced --------------------
// This is the half a one-directional test would miss, and the half the plausible
// wrong fix (`if (isLocalHole)` alone) breaks: isLocalHole is false whenever
// there is no hole to own, so the tornado and the derailment go silent.
for (const type of ['derail', 'crash', 'storm_warning', 'storm_active', 'storm_cleared', 'powerup_spawn']) {
  eq(deliver({ type }).length, 1,
    `multiplayer: the world event '${type}' carries no hole and must still be voiced for everyone`);
}

// --- the local player always hears their own -------------------------------
eq(deliver({ type: 'eat', hole: LOCAL }).length, 1, "multiplayer: the local hole's eat must be voiced");
eq(deliver({ type: 'eat', hole: { slot: 0 } }).length, 1, 'multiplayer: slot match must count as local, not only identity');

// --- single player is unaffected either way --------------------------------
for (const ev of [{ type: 'eat', hole: RIVAL }, { type: 'derail' }, { type: 'quake', hole: LOCAL }]) {
  eq(deliver(ev, { isMultiplayer: false }).length, 1,
    `single player: '${ev.type}' must be voiced (!isMultiplayer short-circuits isLocalHole true)`);
}

// --- the rival quake: reaches handleEvent AND arrives attenuated ------------
// Owner decision 2026-08-17: world-audible, attenuated for rivals. `crash` is
// world-scoped and always voiced, so muting the rumble under audible collapses
// gives the consequence without the cause. Asserting only that it FIRES would
// pass against a build that plays a rival's quake at full volume.
const rivalQuake = deliver({ type: 'quake', hole: RIVAL });
eq(rivalQuake.length, 1, "multiplayer: a RIVAL's quake must still reach handleEvent, not be filtered out");
eq(rivalQuake[0] && rivalQuake[0].opts.quiet, true, "multiplayer: a RIVAL's quake must arrive with { quiet: true }, not at full level");
const localQuake = deliver({ type: 'quake', hole: LOCAL });
eq(localQuake.length, 1, "multiplayer: the local player's own quake must be voiced");
check(localQuake[0] && !localQuake[0].opts.quiet, "multiplayer: the local player's own quake must NOT be attenuated");

// ---------------------------------------------------------------------------
// 6. Non-fatal reporting. These are design questions, not defects, and making
//    them fatal would block this gate on decisions nobody has been asked for.
//    Printing them is what stops them going latent again.
// ---------------------------------------------------------------------------
const deadArms = [...voiced].filter((t) => !emitted.has(t)).sort();
const unvoiced = [...emitted].filter((t) => !voiced.has(t)).sort();
if (deadArms.length) console.log(`  note: ${deadArms.length} handleEvent case(s) nothing emits: ${deadArms.join(', ')}`);
if (unvoiced.length) console.log(`  note: ${unvoiced.length} emitted type(s) handleEvent has no case for: ${unvoiced.join(', ')}`);

// The `quiet` option is destructured once and read per case. Any case that does
// not read it silently ignores it, so a caller asking for a quiet rival event
// gets full volume with no warning. Printed rather than asserted: closing it
// needs a per-case level decision the owner has not been asked for.
const caseBlocks = [...handleEventSrc.matchAll(/case '([a-z_]+)':([\s\S]*?)(?=\n\s{6}case '|\n\s{6}default:)/g)];
const readsQuiet = caseBlocks.filter((m) => /\bquiet\b/.test(m[2])).map((m) => m[1]);
console.log(`  note: 'quiet' is honoured by ${readsQuiet.length} of ${caseBlocks.length} handleEvent case(s): ${readsQuiet.join(', ') || '(none)'}`);
if (readsQuiet.length < caseBlocks.length) {
  console.log("  note: every other case accepts { quiet: true } and plays at full level anyway (RCA-2026-08-17 section 7.1, sibling finding)");
}

// ---------------------------------------------------------------------------
// 7. Scope bookkeeping, printed so the guard's own table stays honest.
// ---------------------------------------------------------------------------
const worldScoped = [...new Set(emissions.filter((e) => !e.hasHole).map((e) => e.type))].sort();
console.log(`  scanned: ${emissions.length} emission(s), ${voiced.size} voiced type(s); world-scoped (no hole): ${worldScoped.join(', ')}`);

// ---------------------------------------------------------------------------
// 8. Report.
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`\nFAIL sfx event guard: ${failures.length} of ${n} assertion(s) failed\n`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  console.error('');
  assert.fail(`${failures.length} of ${n} sfx-event-seam assertion(s) failed`);
}
console.log(`PASS sfx event guard: ${n} assertions`);
