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
check(main.includes("let state = 'menu'; // menu | intro | playing | powerup_collect_cinematic | quake_cinematic | paused | results"),
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
  'main does not coordinate the non-quake Dragon Ball collection cinematic');
check(count(main, 'playPowerUpCollectCinematic(ev.powerup);') === 2,
  'non-quake collection cinematic must be wired once for sandbox and once for campaign');
check(count(main, 'if (!isQuake) playPowerUpCollectCinematic(ev.powerup);') === 2,
  'the Dragon Ball collection cinematic must never replace Fault Line Rupture');
check(count(main, "if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });") === 2,
  'Chrono Freeze must cue its ice sound after the normal pickup cue in both play modes');
check(main.includes("state === 'powerup_collect_cinematic'"),
  'frame loop does not hold the timer during the collection cinematic');
check(main.includes('screens.dismissDragonballCollectCinematic();'),
  'collection cinematic is not cleaned up during world teardown or completion');
check(main.includes("state === 'quake_cinematic' || state === 'powerup_collect_cinematic' || state === 'powerup_encounter'"),
  'frame loop does not render both held cinematic states');
check(count(main, "state !== 'powerup_collect_cinematic'") === 2,
  'results must wait for a non-quake collection cinematic in campaign and sandbox play');

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
check(camera.includes('const liveDist = dist;')
  && camera.includes('dist = startDist + (liveDist - startDist) * easeU;'),
  'Dragon Ball pickup return phase does not preserve a defined live chase distance');
check(screens.includes('showEarthquakeCinematic({'), 'earthquake UI overlay API is missing');
check(screens.includes('showDragonballCollectCinematic({')
  && screens.includes('duration = 3.4')
  && screens.includes('Math.max(2400, duration * 1000)'),
  'the Dragon Ball explanation card does not hold long enough to be read');
check(screens.includes('quake-word-earth">EARTH</div>')
  && screens.includes('quake-word-quake">QUAKE</div>')
  && screens.includes('quake-word-time">TIME!</div>'),
  'earthquake overlay no longer contains the three super-move text slams');
check(screens.includes('const cueScale = duration / 5.8;'),
  'quake text slams no longer scale with the cinematic duration');
check(screens.includes("e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape'"),
  'earthquake overlay no longer supports all keyboard skip controls');
check(voxelWorld.includes('skipQuakeCinematic()'), 'voxel renderer skip API is missing');
check(world3d.includes('skipQuakeCinematic()'), 'campaign renderer skip API is missing');
check(css.includes('.quake-zoom-stage.stage-earth .quake-word-earth')
  && css.includes('.quake-zoom-stage.stage-quake .quake-word-quake')
  && css.includes('.quake-zoom-stage.stage-time .quake-word-time'),
  'quake overlay CSS no longer animates all three text slams');
check(css.includes('@media (prefers-reduced-motion: reduce)'),
  'quake overlay CSS no longer provides a reduced-motion guard');

console.log(`earthquake cinematic selftest: ${assertions} assertions PASS`);
