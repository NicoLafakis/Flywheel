// Fast release gate for the Fault Line Rupture presentation contract.
//
// The normal validator intentionally imports only pure simulation modules, so
// it cannot execute browser-only camera/UI code. This focused check keeps the
// event wiring, skip affordance, and state hold from silently drifting apart.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [main, camera, screens, voxelWorld, world3d, css] = await Promise.all([
  read('js/main.js'),
  read('js/camera.js'),
  read('js/ui/screens.js'),
  read('js/voxelworld.js'),
  read('js/world3d.js'),
  read('css/main.css'),
]);

let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

function count(source, text) {
  return source.split(text).length - 1;
}

// Main loop: the emitted quake event must enter the dedicated state in both
// campaign and sandbox paths, rather than merely supplying a camera shake.
check(main.includes("let state = 'menu'; // menu | intro | playing | powerup_pause | quake_cinematic | paused | results"),
  'main state enum does not include both cinematic hold states');
check(main.includes('function playEarthquakeCinematic(ev) {'),
  'main does not own a quake cinematic coordinator');
check(main.includes("state = 'quake_cinematic';"),
  'quake coordinator does not hold the gameplay state');
check(main.includes('audio.playAnimeHitStop();'),
  'quake coordinator does not trigger the hit-stop audio cue');
check(main.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches"),
  'quake coordinator does not honor the operating-system reduced-motion setting');
check(main.includes('const duration = reducedMotion ? 2.4 : 5.8;'),
  'quake coordinator does not use the normal and reduced-motion sequence durations');
check(main.includes('screens.showEarthquakeCinematic({'),
  'quake coordinator does not mount the cinematic overlay');
check(main.includes('cam.startEarthquakeCinematic({'),
  'quake coordinator does not start the camera sequence');
check(main.includes('world.skipQuakeCinematic()'),
  'quake coordinator does not complete world effects on user skip');
check(count(main, 'playEarthquakeCinematic(ev);') === 2,
  'quake event must be wired once for sandbox and once for campaign');
check(main.includes('function playPowerUpCollectCinematic(powerup) {'),
  'main does not coordinate the non-quake collection showcase');
check(count(main, 'playPowerUpCollectCinematic(ev.powerup);') === 2,
  'non-quake collection showcase must be wired once for sandbox and once for campaign');
check(count(main, 'if (!isQuake) playPowerUpCollectCinematic(ev.powerup);') === 2,
  'the collection showcase must never replace Fault Line Rupture');
check(count(main, "if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });") === 2,
  'Chrono Freeze must cue its ice sound after the normal pickup cue in both play modes');
check(main.includes("state === 'powerup_pause'"),
  'frame loop does not hold the timer during the collection showcase');
check(main.includes("state === 'quake_cinematic' || state === 'powerup_pause' || state === 'powerup_encounter'"),
  'frame loop does not render both held cinematic states');
check(count(main, "state !== 'powerup_pause'") === 2,
  'results must wait for a non-quake collection showcase in campaign and sandbox play');

// Provider contract: the controls exposed by the coordinator must remain
// present on the camera, UI, and both renderers.
check(camera.includes('startEarthquakeCinematic({'), 'camera start API is missing');
check(camera.includes('Phases 1-3: three hard-cut arcade close-ups on the player.'),
  'camera no longer contains the three player close-up phase');
check(camera.includes('Phase 5: hold at the distant endpoint and pull a deliberate 180.'),
  'camera no longer performs the endpoint 180');
check(camera.includes('Phase 6: chase the glowing fissure back toward the player'),
  'camera no longer tracks the fissure back to the player');
check(camera.includes('skipEarthquakeCinematic()'), 'camera skip API is missing');
check(screens.includes('showCivilDisasterEmergencyCinematic(') || screens.includes('showEarthquakeCinematic('), 'civil emergency / earthquake UI overlay API is missing');
check(screens.includes('showPowerUpShowcase('),
  'the powerup showcase card API is missing');
check(screens.includes('civil-emergency-ticker')
  && screens.includes('civil-telemetry-badge')
  && screens.includes('civil-alert-title'),
  'civil emergency overlay no longer contains the municipal alert ticker and telemetry');
check(screens.includes("e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape'"),
  'earthquake overlay no longer supports all keyboard skip controls');
check(voxelWorld.includes('skipQuakeCinematic()'), 'voxel renderer skip API is missing');
check(world3d.includes('skipQuakeCinematic()'), 'campaign renderer skip API is missing');
check(css.includes('.civil-emergency-overlay')
  && css.includes('.civil-emergency-ticker')
  && css.includes('.civil-alert-title'),
  'civil emergency overlay CSS no longer styles the alert presentation');

console.log(`earthquake / civil disaster cinematic selftest: ${assertions} assertions PASS`);
