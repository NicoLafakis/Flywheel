// The pause-menu track picker's catalog: every track a player can switch to
// mid-run, and the rule for which of them a given save may select.
//
// Pure data + logic, no DOM/three.js — the Node validator imports this file
// (js/audio/tracklist.test.mjs) for the same reason citycatalog.js stays pure:
// the picker UI in js/ui/screens.js can never be imported headlessly, so its
// rules must live somewhere that can.
//
// Two groups:
//   * 'flywheel' — the Flywheel-music-* default pool, always selectable;
//   * 'city'     — a city's own theme, selectable only once that city is
//                  unlocked under the REAL progression gate (isCityUnlocked),
//                  so the picker can never offer music the map screen would
//                  not let the player hear in place.
//
// City rows reuse the scene cues (`gallery`, `manhattan`, ...) that the
// run-start paths in js/main.js already request, and carry the scene id so
// gating needs no cue→scene translation table. Tokyo is deliberately absent:
// it aliases Lower Manhattan's MP3, so a tokyo row would be a second button
// for the same bytes.

import { CITY_CATALOG, isCityUnlocked } from '../citycatalog.js';

export const TRACKLIST = Object.freeze([
  { cue: 'flywheel-afterhours-static', label: 'Afterhours Static', group: 'flywheel' },
  { cue: 'flywheel-basement-bloom', label: 'Basement Bloom', group: 'flywheel' },
  { cue: 'flywheel-block-drift', label: 'Block Drift', group: 'flywheel' },
  { cue: 'flywheel-falling-skies', label: 'Falling Skies', group: 'flywheel' },
  { cue: 'flywheel-i-wonder', label: 'I Wonder', group: 'flywheel' },
  { cue: 'flywheel-slow-down', label: 'Slow Down', group: 'flywheel' },
  { cue: 'flywheel-slow-smokey-vinyl', label: 'Slow Smokey Vinyl', group: 'flywheel' },
  { cue: 'flywheel-smoke-on-wax', label: 'Smoke On Wax', group: 'flywheel' },
  // Scene cued under its sandbox id: the gallery IS The Lab (citycatalog.js),
  // and its track ships as the-lab.mp3 behind the `gallery` cue.
  { cue: 'gallery', label: 'THE LAB', group: 'city', scene: 'gallery' },
  { cue: 'manhattan', label: 'LOWER MANHATTAN', group: 'city', scene: 'manhattan' },
  { cue: 'brooklyn', label: 'BROOKLYN', group: 'city', scene: 'brooklyn' },
  { cue: 'chicago', label: 'CHICAGO LOOP', group: 'city', scene: 'chicago' },
  { cue: 'cambridge', label: 'CAMBRIDGE', group: 'city', scene: 'cambridge' },
  { cue: 'upper-manhattan', label: 'UPPER MANHATTAN', group: 'city', scene: 'upper-manhattan' },
  { cue: 'boston', label: 'BOSTON SEAPORT', group: 'city', scene: 'boston' },
]);

// Every flywheel track, plus each city track whose city the save has unlocked.
// Order matches TRACKLIST so the picker renders the default pool first.
export function getAvailableTracks(save) {
  const knownScenes = new Set(CITY_CATALOG.map((c) => c.scene));
  return TRACKLIST.filter((t) => {
    if (t.group === 'flywheel') return true;
    if (!knownScenes.has(t.scene)) return false;
    return isCityUnlocked(save, t.scene);
  });
}
