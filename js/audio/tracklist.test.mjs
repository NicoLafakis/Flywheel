// The pause-menu track picker's catalog: which tracks exist, and which of them
// a given save may select. The picker itself lives in js/ui/screens.js and can
// never be imported headlessly, so the rules it must obey are pinned here
// against the real module — the same reason tools/music-cue.test.mjs imports
// the registry rather than re-transcribing it.
//
// The contract, per owner decision:
//   * every Flywheel-music-* track is always selectable (the default pool);
//   * a city's track is selectable only once that city is unlocked, judged by
//     the REAL isCityUnlocked in js/citycatalog.js so picker gating can never
//     drift away from map-screen gating;
//   * city rows reuse the scene cues (`gallery`, `manhattan`, ...) that the
//     run-start paths already request, so the picker's now-playing highlight
//     compares against activePlayMusicCue with no alias translation;
//   * The Lab (gallery) is the first city, so its track is always available;
//   * Tokyo has no track of its own (it aliases Lower Manhattan's), so it must
//     NOT appear — a selectable "tokyo" row would be a second button playing
//     the same MP3 as Manhattan's.
import assert from 'node:assert/strict';
import { MUSIC_CUES } from './music.js';
import { TRACKLIST, getAvailableTracks } from './tracklist.js';
import { CITY_CATALOG, isCityUnlocked } from '../citycatalog.js';

// ---------------------------------------------------------------- registry
// Every selectable cue must resolve to a real file — a picker row that plays
// silence is the exact defect class tools/music-cue.test.mjs guards for typed
// call sites, and the picker passes cues as variables, beyond that scanner's
// reach.
for (const entry of TRACKLIST) {
  assert.equal(typeof entry.cue, 'string', 'every track needs a cue id');
  assert.equal(typeof entry.label, 'string', `track ${entry.cue}: needs a label`);
  assert.ok(entry.label.length > 0, `track ${entry.cue}: empty label`);
  assert.ok(entry.group === 'flywheel' || entry.group === 'city',
    `track ${entry.cue}: group must be "flywheel" or "city"`);
  assert.ok(Object.prototype.hasOwnProperty.call(MUSIC_CUES, entry.cue),
    `track ${entry.cue}: not registered in MUSIC_CUES`);
  assert.equal(typeof MUSIC_CUES[entry.cue], 'string',
    `track ${entry.cue}: registered but maps to silence`);
}
assert.equal(new Set(TRACKLIST.map((t) => t.cue)).size, TRACKLIST.length,
  'cue ids must be unique — duplicates render as two rows for one track');

// ------------------------------------------------------------- flywheel pool
const flywheel = TRACKLIST.filter((t) => t.group === 'flywheel');
assert.equal(flywheel.length, 8, 'the Flywheel-music-* pool ships 8 tracks');
for (const t of flywheel) {
  assert.ok(t.cue.startsWith('flywheel-'), `flywheel pool cue "${t.cue}" must be namespaced`);
}

// ---------------------------------------------------------- availability
// A fresh save: the whole default pool plus The Lab, and nothing from any
// city the player has not reached.
const fresh = getAvailableTracks({});
for (const t of flywheel) {
  assert.ok(fresh.some((f) => f.cue === t.cue),
    `fresh save: default-pool track ${t.cue} must be selectable`);
}
assert.ok(fresh.some((f) => f.cue === 'gallery'),
  'fresh save: The Lab is the first city — its track is always selectable');
assert.ok(!fresh.some((f) => f.cue === 'chicago'),
  'fresh save: locked city tracks must not be selectable');

// A city is also unlocked by simply having played it (runs > 0 in the sandbox
// record) — the picker must honour that path, not only the full-clear ladder.
const playedBoston = { sandbox: { boston: { runs: 1 } } };
assert.ok(getAvailableTracks(playedBoston).some((f) => f.cue === 'boston'),
  'a city the player has run must offer its track');

// The ladder path: a 100% clear in under 300s unlocks the NEXT playable city.
//
// The pair is derived from the catalog rather than named, because naming it is
// what broke this assertion. It read "clearing Brooklyn unlocks Chicago", which
// was true until the 29-city roster landed and put Chicago six Acts earlier;
// from then on the test asserted an unlock the ladder had stopped granting, and
// went red on a catalog edit that was entirely correct. Every city added to the
// roster from here re-derives the pair instead of falsifying it.
const playableCities = CITY_CATALOG.filter((c) => c.status === 'PLAYABLE');
const trackCues = new Set(TRACKLIST.map((t) => t.cue));
const ladderPair = (() => {
  for (let i = 1; i < playableCities.length; i++) {
    const prev = playableCities[i - 1].scene, next = playableCities[i].scene;
    // Both ends need a selectable row, and the gate must be the clear itself —
    // a starter city is unlocked outright and would prove nothing.
    if (trackCues.has(prev) && trackCues.has(next) && !isCityUnlocked({}, next)) return [prev, next];
  }
  return null;
})();
assert.ok(ladderPair, 'the catalog must contain one adjacent playable pair with tracks at both ends');
const [prevCity, nextCity] = ladderPair;
const afterClear = getAvailableTracks({ sandbox: { [prevCity]: { completions: 1, bestTime: 250 } } });
assert.ok(afterClear.some((f) => f.cue === nextCity),
  `clearing ${prevCity} must unlock ${nextCity}'s track`);
const laterCities = playableCities.slice(playableCities.findIndex((c) => c.scene === nextCity) + 1);
for (const later of laterCities) {
  assert.ok(!afterClear.some((f) => f.cue === later.scene),
    `unlocking is one city at a time — clearing ${prevCity} must not leak into ${later.scene}`);
}

// Tokyo aliases Lower Manhattan's MP3; a tokyo row would be a duplicate button.
assert.ok(!TRACKLIST.some((t) => t.cue === 'tokyo'),
  'tokyo must not be a selectable track — it shares lower-manhattan.mp3');

console.log(`✓ tracklist: ${TRACKLIST.length} tracks (${flywheel.length} default pool), unlock gating matches isCityUnlocked`);
