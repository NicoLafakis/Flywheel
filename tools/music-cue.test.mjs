// TDD Static Guard: every music cue a caller asks for must exist in the registry.
//
// WHY THIS FILE EXISTS
// `js/audio/music.js` answers an unregistered cue name with one console warning
// and then plays nothing at all. That is a silent failure in the literal sense:
// the screen that asked for music just has none, and nothing in the game says so.
// It shipped that way — the multiplayer podium asked for a cue named "victory"
// that was never in `MUSIC_CUES`, so the end-of-match screen, the single loudest
// moment in the game, was dead quiet for every player of every match.
//
// A runtime test cannot catch this class: the callers live in `js/main.js` and
// `js/ui/screens.js`, which touch `document` at module scope and can never be
// imported by the headless validator. So the guard is lexical — it reads the
// caller files as text, collects every cue name passed as a string literal, and
// cross-checks the set against the real exported registry.
//
// WHAT IT CATCHES
// ANY caller/registry mismatch, not just the one that shipped: a typo'd cue, a
// cue renamed in the registry without updating its callers, a new screen asking
// for a track nobody added. The registry is imported (not re-transcribed), so the
// test cannot drift away from the thing it is checking.
//
// WHAT IT DOES NOT CATCH (documented limits — lexical scanner, no build step):
//   * a cue name passed as a variable (`setMusicCue(activePlayMusicCue)`), which
//     is a runtime value question, not a text question;
//   * a cue requested through an alias binding this scanner does not recognise —
//     the CALL_SITE_PATTERNS list below is deliberately explicit, so adding a new
//     way to ask for music is a considered edit here rather than a silent hole;
//   * whether the mapped MP3 actually decodes (that is tools/music-assets-selftest.mjs).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Namespace import, not a named one: a named import of a missing export is a
// link-time SyntaxError, which would hide the caller/registry mismatch below
// behind a module-loading error instead of reporting the defect that matters.
import * as musicModule from '../js/audio/music.js';

const { MUSIC_CUES } = musicModule;

console.log('Testing every music cue requested in js/ against the MUSIC_CUES registry...');

/**
 * Blank out comments while leaving string literals verbatim — the cue name IS a
 * string literal, so unlike the identifier scanner this one must keep strings
 * and drop only prose. Offsets and newlines are preserved so line numbers in a
 * failure message point at the real source line.
 */
function stripComments(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop); i = stop; continue;
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      // Skip the literal untouched: a `//` inside a URL string is not a comment.
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      i = j + 1; continue;
    }
    i++;
  }
  return out.join('');
}

// Every shape in which a cue name is handed to the music director. Explicit by
// design: an unknown shape must be added here on purpose, because a scanner that
// quietly matches nothing is a green light pointed at no code.
const CALL_SITE_PATTERNS = [
  // audio.setMusicCue('menu')  — js/main.js, js/audio/game-audio.js
  /\bsetMusicCue\s*\(\s*(['"])([^'"]*)\1/g,
  // this.actions.music('results', …)  — js/ui/screens.js, via main.js's action map
  /\bactions\s*\.\s*music\s*\(\s*(['"])([^'"]*)\1/g,
  // director.request('shop')  — anything holding a MusicDirector directly
  /\bmusic\s*\.\s*request\s*\(\s*(['"])([^'"]*)\1/g,
];

const jsRoot = new URL('../js/', import.meta.url);

/** Every shipped module under js/. `.js` only: `.mjs` here is test code, which
 *  deliberately requests bogus cues to prove the warn path. */
function collectModules(dirUrl, rel = 'js') {
  const files = [];
  for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...collectModules(new URL(`${entry.name}/`, dirUrl), `${rel}/${entry.name}`));
    } else if (entry.name.endsWith('.js')) {
      files.push({ path: fileURLToPath(new URL(entry.name, dirUrl)), rel: `${rel}/${entry.name}` });
    }
  }
  return files;
}

const lineOf = (code, index) => code.slice(0, index).split('\n').length;

const requests = [];   // { cue, rel, line }
for (const { path, rel } of collectModules(jsRoot)) {
  const code = stripComments(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  for (const pattern of CALL_SITE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of code.matchAll(pattern)) {
      requests.push({ cue: m[2], rel, line: lineOf(code, m.index) });
    }
  }
}

// ---------------------------------------------------------------------------
// Anti-vacuity: the scan must be looking at real code. A guard that found zero
// call sites would pass forever while proving nothing.
// ---------------------------------------------------------------------------
const scannedFiles = new Set(requests.map((r) => r.rel));
assert.ok(requests.length >= 8,
  `the scanner found only ${requests.length} cue request(s) — it is not reading the callers`);
assert.ok(scannedFiles.has('js/main.js'), 'js/main.js must be among the scanned callers');
assert.ok(scannedFiles.has('js/ui/screens.js'), 'js/ui/screens.js must be among the scanned callers');

// ---------------------------------------------------------------------------
// The guard proper: every requested cue is registered.
// ---------------------------------------------------------------------------
const unknown = requests.filter(
  (r) => !Object.prototype.hasOwnProperty.call(MUSIC_CUES, r.cue),
);
for (const r of unknown) {
  console.error(`  FAIL ${r.rel}:${r.line} — requests music cue "${r.cue}", which MUSIC_CUES does not define (screen plays silence)`);
}
assert.equal(unknown.length, 0,
  `${unknown.length} caller(s) request a music cue that does not exist — those screens are silent`);

// ---------------------------------------------------------------------------
// The end-of-match screens are the specific regression this file was written
// for, so they are asserted by name rather than only by the sweep above: both
// the multiplayer podium and the single-player results screen must land on a
// cue that maps to an actual track, not on the deliberate `null` silence entry.
// ---------------------------------------------------------------------------
for (const name of ['victory', 'results']) {
  assert.ok(Object.prototype.hasOwnProperty.call(MUSIC_CUES, name),
    `end-of-match cue "${name}" must be registered`);
  assert.equal(typeof MUSIC_CUES[name], 'string',
    `end-of-match cue "${name}" must map to a track, not to silence`);
}
const podium = requests.filter((r) => r.rel === 'js/main.js' && r.cue === 'victory');
assert.ok(podium.length >= 2,
  'both multiplayer game-over handlers (host and peer) must still request the victory cue');

// ---------------------------------------------------------------------------
// Last-resort safety net: even a cue name this scanner cannot see (one built at
// runtime) must not produce a dead-silent screen, so the director's unknown-cue
// path needs a registered fallback with a real track behind it.
// ---------------------------------------------------------------------------
const MUSIC_FALLBACK_CUE = musicModule.MUSIC_FALLBACK_CUE;
assert.equal(typeof MUSIC_FALLBACK_CUE, 'string',
  'js/audio/music.js must export MUSIC_FALLBACK_CUE — the cue an unknown request lands on');
assert.ok(Object.prototype.hasOwnProperty.call(MUSIC_CUES, MUSIC_FALLBACK_CUE),
  `MUSIC_FALLBACK_CUE "${MUSIC_FALLBACK_CUE}" must itself be a registered cue`);
assert.equal(typeof MUSIC_CUES[MUSIC_FALLBACK_CUE], 'string',
  'the fallback cue must map to a real track, or the safety net is more silence');

console.log(`  ok: ${requests.length} cue request(s) across ${scannedFiles.size} module(s), all registered`);
console.log(`  ok: fallback cue "${MUSIC_FALLBACK_CUE}" -> ${MUSIC_CUES[MUSIC_FALLBACK_CUE]}`);
console.log('✓ music cue registry/caller guard PASSED');
