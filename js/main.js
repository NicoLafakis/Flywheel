// Boot + screen state machine + game loop glue.

import { Sim } from './sim.js';
import {
  RANKED_TICK_COUNT, VoxelSandboxSim, sandboxSizeProgress, loadScene,
} from './voxelsim.js';
import { getLevel, METROS } from './levels.js';
import { loadSave, storeSave, recordLevelResult, recordSandboxResult, isLevelUnlocked, buyUpgrade } from './save.js';
import { upgradeMultiplier } from './upgrades.js';
import { World3D } from './world3d.js';
import { VoxelWorld3D } from './voxelworld.js';
import { ChaseCamera } from './camera.js';
import { Controls } from './controls.js';
import { HUD, ANN } from './ui/hud.js';
import { Screens, SKINS, INDICATOR_SKINS } from './ui/screens.js';
import { mountReadyGate } from './ui/ready.js';
import { startMenuScene, stopMenuScene, tickMenuScene, resizeMenuScene } from './ui/menuscene.js';
import { TIERS, defaultTierForDevice } from './quality.js';

import { GameAudio } from './audio/game-audio.js';
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME, reseedAudioMix } from './audio/mix.js';
import { createInputBuffer, encodeTrace, inputAt, writeInput } from './replay.js';

const canvas = document.getElementById('game-canvas');
const hud = new HUD();
window.__hud = hud; // debug/smoke-test hook, same idiom as __sim / __cam / __controls
const save = loadSave();

// A failed submit stays local until the next useful network opportunity. This
// work is deliberately outside the fixed simulation loop: reconnecting may
// cause fetches, but it must never alter a completed replay.
function drainSavedBoardOutbox() {
  if (!Array.isArray(save.outbox) || !save.outbox.length) return;
  void import('./board/outbox.js').then(({ drain }) => drain(save)).catch(() => {});
}
drainSavedBoardOutbox();
window.addEventListener('online', drainSavedBoardOutbox);
window.setInterval(drainSavedBoardOutbox, 60000);

// ------------------------------------------------------------------ audio
// The CC0 library + WebAudio engine (js/audio/). The save is the source of
// truth on this surface; the engine also mirrors every setting into
// localStorage, which is the only store the arena demo has — so muting or
// moving any of the three level sliders here carries over there.
// One-time re-seed FIRST, before the engine is built and before the save's
// levels are applied. Order is load-bearing in both directions: the engine runs
// the same stamped call in its constructor (which is what covers the arena and
// the scene viewer), so calling it here is what makes the main game the one
// caller that sees `reseeded` and can therefore also move the save's two keys
// onto the new mix. Without that, the lines below would write the save's old
// levels straight back over the freshly seeded ones and nothing would change.
const mix = reseedAudioMix();
if (mix.reseeded && save.settings) {
  save.settings.masterVol = mix.masterVol;
  save.settings.sfxVol = mix.sfxVol;
  save.settings.ambVol = mix.ambVol;
  save.settings.musicVol = mix.musicVol;
  storeSave(save);
}

const audio = new GameAudio().init();
window.__audio = audio; // debug hook, same idiom as scene-view.html
audio.setMuted(save.muted);
audio.setMasterVolume(save.settings && typeof save.settings.masterVol === 'number' ? save.settings.masterVol : DEFAULT_MASTER_VOLUME);
audio.setVolume(save.settings && typeof save.settings.sfxVol === 'number' ? save.settings.sfxVol : DEFAULT_SFX_VOLUME);
audio.setAmbienceVolume(save.settings && typeof save.settings.ambVol === 'number' ? save.settings.ambVol : DEFAULT_AMBIENCE_VOLUME);
audio.setMusicVolume(save.settings && typeof save.settings.musicVol === 'number' ? save.settings.musicVol : DEFAULT_MUSIC_VOLUME);

// Start preloading and streaming title music immediately on initial boot
audio.music.unlock();
audio.setMusicCue('menu');

const earlyUnlock = () => {
  try {
    audio.engine.unlock();
    audio.music.unlock();
  } catch {}
  window.removeEventListener('pointerdown', earlyUnlock);
  window.removeEventListener('touchstart', earlyUnlock);
  window.removeEventListener('keydown', earlyUnlock);
};
window.addEventListener('pointerdown', earlyUnlock, { passive: true });
window.addEventListener('touchstart', earlyUnlock, { passive: true });
window.addEventListener('keydown', earlyUnlock, { passive: true });

// ------------------------------------------------------------------ game state
let state = 'menu'; // menu | intro | playing | powerup_collect_cinematic | quake_cinematic | paused | results
let isVoxelSandbox = false;
let level = null;
let sim = null;
let world = null;
let cam = null;
let controls = null;
let readyGate = null; // live mountReadyGate handle, so teardown can dismiss it
let lastSandboxScene = 'gallery'; // for pause-menu RESTART in the sandbox
let lastSandboxMode = 'freeplay';
let rankedRun = null; // { inputs, ticks, ticket, move }; only allocated before a RUN starts
let rankedLaunch = 0; // rejects a stale ticket response after a fast double-tap
let activePlayMusicCue = 'gallery'; // owner decision: gallery stays music-free
let accumulator = 0;
let lastTs = 0;
let shopBonus = { clock: 0, growth: 0 };

// ------------------------------------------------------------------ quality tier
// Two tiers, and the player picks one. Nothing here watches frame times and
// nothing adjusts mid-session: full graphics or not is the whole contract.
// The DEFAULT does read the device once — a coarse-pointer phone that has never
// opened SETTINGS starts on LOW, everything else on HIGH — because HIGH on a
// phone measured as an unplayable frame rather than as better graphics. That is
// a starting point, not a classifier: one press of the Graphics detail button
// records a choice and this stops looking at the device forever (wantedTier).
let tierName = wantedTier();
// Debug hook, same idiom as window.__sim / __world / __cam / __controls.
// `force` lets a harness (and a dev) push a tier without going through the
// settings screen; it does not touch the saved setting, so the next level start
// resolves back to whatever the player chose.
window.__quality = {
  TIERS,
  tier: () => tierName,
  force(t) {
    if (!TIERS[t]) return false;
    tierName = t;
    applyQuality();
    return true;
  },
  levers: () => ({
    tier: tierName,
    dpr: world && world.renderer ? world.renderer.getPixelRatio() : null,
    shadows: world ? world.shadows : null,
    ambientFrozen: world ? world._ambientFrozen : null,
    debrisCap: sim && sim.tune ? sim.tune.debrisCap : null,
    contactBudget: sim && sim.tune ? sim.tune.contactBudget : null,
    maxSubSteps: (TIERS[tierName] || TIERS.high).maxSubSteps,
    contactRounds: sim && sim.tune ? sim.tune.contactRounds : null,
    supportEvery: sim && sim.tune ? sim.tune.supportEvery : null,
  }),
};


// The player's setting is the only authority ONCE THERE IS ONE. Until then the
// device picks the default: a coarse-pointer phone starts on LOW, everything
// else on HIGH (js/quality.js `defaultTierForDevice`). `qualityChosen` is what
// separates the two cases — it is written by the Graphics detail button and by
// nothing else, so a player who has picked a tier keeps it on every device, and
// a player who has not gets the one their hardware can actually run.
//
// Anything unexpected past that point — a key from a hand-edited save, a value
// from a build that had more tiers — still reads as HIGH rather than as nothing,
// so a bad string can never leave the game untiered.
function wantedTier() {
  const st = save.settings;
  if (!st) return 'high';
  if (!st.qualityChosen) return defaultTierForDevice();
  return st.quality === 'low' ? 'low' : 'high';
}

// Push the current tier at both halves of the engine. Idempotent — every setter
// it calls returns early when nothing changed — so it is safe to call from
// applySettings, from level start, and from the debug hook.
function applyQuality() {
  const spec = TIERS[tierName] || TIERS.high;
  if (world && world.setQuality) world.setQuality(spec);
  // RENDER quality is always applied — a phone may draw less at any time. The
  // PHYSICS half stops at a ranked sim (T-302, audit A5.2): these four are the
  // device-tier levers, and re-applying them mid-run rewrote ranked physics with
  // no guard at all. Measured on the ordinary LOW-tier phone value
  // (`supportEvery: 2`): 945.95 against a 2231.9625 baseline, a 58% loss — and
  // note the sign, the player was robbed rather than favoured. `tuneLocked` is
  // the sim's own flag, so this cannot drift from the mode test that set it.
  if (sim && sim.tune && !sim.tuneLocked) {
    sim.tune.debrisCap = spec.debrisCap;
    sim.tune.contactBudget = spec.contactBudget;
    sim.tune.contactRounds = spec.contactRounds;
    sim.tune.supportEvery = spec.supportEvery;
  }
}

// Called at every level start: re-resolve the tier from the setting and apply
// it. A level start is still the right moment to do this even though nothing
// varies per level any more — `world` and `sim` are rebuilt there, so the tier
// has to be pushed at the new pair.
function startQuality() {
  tierName = wantedTier();
  applyQuality();
}

function computeShopBonus() {
  shopBonus = {
    clock: save.ownedItems.includes('clock5') ? 5 : 0,
    growth: save.ownedItems.includes('growth5') ? 0.05 : 0,
    speedMult: upgradeMultiplier(save.upgrades?.speed),
    vortexMult: upgradeMultiplier(save.upgrades?.vortex),
    growthBonus: (upgradeMultiplier(save.upgrades?.growth) - 1.0) + (save.ownedItems.includes('growth5') ? 0.05 : 0),
    durationMult: upgradeMultiplier(save.upgrades?.duration),
  };
}

// Both renderers take the skin ID, not a colour — js/skins.js owns everything
// downstream of the id, and a colour would be a lossy key back to a row.
function equippedSkinId() {
  const s = SKINS.find((k) => k.id === save.equippedSkin);
  return s ? s.id : 'classic';
}

function equippedIndicatorId() {
  const i = INDICATOR_SKINS.find((k) => k.id === save.equippedIndicator);
  return i ? i.id : 'ind-default';
}

function triggerHaptic(ms = 12) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && !save?.settings?.reducedMotion) {
      navigator.vibrate(ms);
    }
  } catch { /* ignored */ }
}

const screens = new Screens(document.getElementById('screen-root'), save, {
  play(lvl) {
    if (!isLevelUnlocked(save, lvl.index)) return;
    level = lvl;
    if (lvl.introduces) {
      state = 'intro';
      screens.showMechanicIntro(lvl, () => startLevel());
    } else {
      startLevel();
    }
  },
  startVoxelSandbox(scene) { startVoxelSandbox(scene); },
  startRankedRun(scene) { void startRankedRun(scene); },
  resume() {
    if (state === 'paused') {
      state = 'playing';
      audio.setMusicCue(activePlayMusicCue);
      screens.clear();
    }
  },
  // Sandbox-aware: the old `if (level)` guard made RESTART a dead button in
  // the sandbox (playtest finding — campaign ghost UI on the pause path).
  restart() {
    if (isVoxelSandbox && lastSandboxMode === 'run90') void startRankedRun(lastSandboxScene);
    else if (isVoxelSandbox) startVoxelSandbox(lastSandboxScene, lastSandboxMode);
    else if (level) startLevel();
  },
  quitToMap() { teardownWorld(); state = 'menu'; hud.hide(); screens.showWorldMap(); },
  buy(id, price) {
    if (save.coins < price || save.ownedItems.includes(id)) return false;
    save.coins -= price;
    save.ownedItems.push(id);
    storeSave(save);
    computeShopBonus();
    return true;
  },
  buyUpgrade(id) {
    const res = buyUpgrade(save, id);
    if (res.success) {
      computeShopBonus();
      audio.playSfx('buy');
    }
    return res;
  },
  equip(id) {
    save.equippedSkin = id;
    storeSave(save);
  },
  equipIndicator(id) {
    save.equippedIndicator = id;
    storeSave(save);
  },
  toggleMute() { save.muted = !save.muted; storeSave(save); audio.setMuted(save.muted); },
  // The live city behind the title (js/ui/menuscene.js). Screens calls this
  // with `true` when the landing screen mounts and `false` for every takeover
  // that replaces it (loading, shop, settings), so the backdrop's lifetime is
  // the title screen's lifetime and nothing else has to remember to stop it.
  // Starting is idempotent, so a return trip from SHOP does not rebuild.
  menuScene(on) {
    if (on) startMenuScene(canvas, { settings: save.settings, skinId: equippedSkinId() });
    else stopMenuScene();
  },
  music(cue, opts) { audio.setMusicCue(cue, opts); },
  masterVolume() { return audio.masterVolume; },
  setMasterVolume(v) { audio.setMasterVolume(v); },
  musicVolume() { return audio.musicVolume; },
  setMusicVolume(v) { audio.setMusicVolume(v); },
  ambienceVolume() { return audio.ambienceVolume; },
  setAmbienceVolume(v) { audio.setAmbienceVolume(v); },
  applySettings() {
    storeSave(save);
    audio.setMasterVolume(typeof save.settings.masterVol === 'number' ? save.settings.masterVol : DEFAULT_MASTER_VOLUME);
    audio.setVolume(typeof save.settings.sfxVol === 'number' ? save.settings.sfxVol : DEFAULT_SFX_VOLUME);
    audio.setAmbienceVolume(typeof save.settings.ambVol === 'number' ? save.settings.ambVol : DEFAULT_AMBIENCE_VOLUME);
    if (typeof save.settings.musicVol === 'number') audio.setMusicVolume(save.settings.musicVol);
    if (controls) controls.settings = save.settings;
    if (cam) {
      cam.distScale = save.settings.camDist;
      cam.setReducedMotion(save.settings.reducedMotion);
    }
    if (world && world.setShadows) world.setShadows(save.settings.shadows);
    // Guarded like setShadows above: only the voxel renderer implements this,
    // and the campaign World3D must not be called with a method it lacks.
    if (world && world.setReducedMotion) world.setReducedMotion(save.settings.reducedMotion);
    // The HUD's own celebrations honour the same toggle, live: a mid-session
    // change must reach the next celebration without a restart (GWT-803).
    hud.setReducedMotion(save.settings.reducedMotion);
    if (world && world.setPerfMode) world.setPerfMode(save.settings.perfMode);
    // Unconditional: applySettings fires on every slider drag, but resolving a
    // tier is now two comparisons and applyQuality's setters all return early
    // when nothing moved. This used to be guarded against the last-seen value
    // because re-running it restarted the watchdog and cleared the window it
    // needed to judge anything; with the watchdog gone, so is the guard.
    startQuality();
    applyVoxTuning();
  },
});
window.__screens = screens; // debug/smoke-test hook, same idiom as __sim / __hud

// Dev voxel tuning sliders → the running sandbox sim (no-op elsewhere).
// Never a ranked sim (T-302, audit A5.2). The ADVANCED sliders persist in the
// save, so a player who once moved Gravity carried that value into every later
// RUN through this function's mid-run reapply — measured at 4438.43 against a
// 2231.9625 baseline. A ranked sim's tune is also frozen, so without this guard
// the write would throw rather than merely diverge.
function applyVoxTuning() {
  if (!sim || !sim.tune || sim.tuneLocked) return;
  const st = save.settings;
  sim.tune.gravity = st.voxGravity;
  sim.tune.waveK = st.voxWaveK;
  sim.tune.creak = st.voxCreak;
  sim.tune.speed = st.voxSpeed;
  sim.tune.attract = st.voxAttract;
  sim.tune.perfMode = !!st.perfMode;
}

let pokeSpawnQueue = [];
let isShowingPokeSpawn = false;

function queuePokemonSpawnIntro(pu, simInstance, camInstance) {
  if (!pu) return;
  pokeSpawnQueue.push({ pu, sim: simInstance, cam: camInstance });
  if (isShowingPokeSpawn) return;
  playNextPokemonSpawn();
}

function playNextPokemonSpawn() {
  if (pokeSpawnQueue.length === 0) {
    isShowingPokeSpawn = false;
    return;
  }
  isShowingPokeSpawn = true;
  const item = pokeSpawnQueue[0];
  const pu = item.pu;
  const s = item.sim;
  const c = item.cam;

  audio.playPokemonEncounter();
  audio.playPokemonDropLand();
  triggerHaptic(65);

  const hX = (s && s.hole ? s.hole.x : (s && s.player ? s.player.x : 0)) || 0;
  const hZ = (s && s.hole ? s.hole.z : (s && s.player ? s.player.z : 0)) || 0;
  const prevState = state;
  state = 'powerup_encounter';

  let finished = false;
  const finishPokeIntro = () => {
    if (finished) return;
    finished = true;
    screens.dismissPokemonEncounterModal();
    if (c && c.skipPokemonSpawnCinematic) c.skipPokemonSpawnCinematic();
    pokeSpawnQueue.shift();
    if (pokeSpawnQueue.length > 0) {
      playNextPokemonSpawn();
    } else {
      isShowingPokeSpawn = false;
      state = prevState === 'powerup_encounter' ? 'playing' : prevState;
      lastTs = performance.now();
    }
  };

  screens.showPokemonEncounterModal({
    powerup: pu,
    onSkip: finishPokeIntro,
    reducedMotion: save.settings.reducedMotion,
  });

  if (c && c.startPokemonSpawnCinematic) {
    c.startPokemonSpawnCinematic({
      dropX: pu.x,
      dropZ: pu.z,
      playerX: hX,
      playerZ: hZ,
      duration: 1.5,
      reducedMotion: save.settings.reducedMotion,
      onComplete: finishPokeIntro,
    });
  } else {
    setTimeout(finishPokeIntro, 1500);
  }
}

// The quake is resolved by the pure sim before this is called.  This is only a
// presentation hold: it gives the player a clear read on the rupture without
// allowing the fixed-step loop or a queued movement target to advance unseen.
function playEarthquakeCinematic(ev) {
  if (!cam || !ev || ev.x0 == null || ev.z0 == null || ev.x1 == null || ev.z1 == null) return;

  const previousState = state;
  const reducedMotion = !!save.settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reducedMotion ? 2.4 : 5.8;
  let finished = false;
  const finish = (skipped = false) => {
    if (finished) return;
    finished = true;

    // A skip reveals the completed visual state immediately; natural completion
    // leaves the fissure and its delayed collapses to finish in the live world.
    if (skipped && world && world.skipQuakeCinematic) world.skipQuakeCinematic();
    screens.dismissEarthquakeCinematic();
    if (skipped && cam && cam.skipEarthquakeCinematic) cam.skipEarthquakeCinematic();

    if (state === 'quake_cinematic') {
      state = previousState === 'quake_cinematic' ? 'playing' : previousState;
      accumulator = 0;
      lastTs = performance.now();
    }
  };

  controls?.cancelPointer();
  state = 'quake_cinematic';
  audio.playAnimeHitStop();
  screens.showEarthquakeCinematic({
    onSkip: () => finish(true),
    reducedMotion,
    duration,
  });
  cam.startEarthquakeCinematic({
    x0: ev.x0,
    z0: ev.z0,
    x1: ev.x1,
    z1: ev.z1,
    angle: ev.angle,
    length: ev.length,
    duration,
    reducedMotion,
    onComplete: () => finish(false),
  });
}

// Ground spawns already use the Pokemon encounter to announce themselves. This
// is the second half of that contract: on collection, pause the fixed-step
// world long enough for the Dragon Ball card to say what the earned power does.
// Fault Line Rupture owns its longer bespoke sequence and is intentionally
// excluded before this function is called.
function playPowerUpCollectCinematic(powerup) {
  if (!cam || !powerup || powerup.type === 'quake' || state !== 'playing') return;

  const previousState = state;
  const reducedMotion = !!save.settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  const finish = (skipped = false) => {
    if (finished) return;
    finished = true;
    screens.dismissDragonballCollectCinematic();
    if (skipped && cam && cam.skipDragonballCinematic) cam.skipDragonballCinematic();

    if (state === 'powerup_collect_cinematic') {
      state = previousState;
      accumulator = 0;
      lastTs = performance.now();
    }
  };

  const hole = isVoxelSandbox ? sim.hole : sim.player;
  controls?.cancelPointer();
  state = 'powerup_collect_cinematic';
  screens.showDragonballCollectCinematic({
    powerup,
    audio,
    onSkip: () => finish(true),
    onDone: () => finish(false),
    reducedMotion,
    duration: 3.4,
  });
  cam.startDragonballCollectCinematic({
    playerX: hole.x,
    playerZ: hole.z,
    duration: 3.4,
    reducedMotion,
    onComplete: () => finish(false),
  });
}

function startLevel() {
  teardownWorld();
  isVoxelSandbox = false;
  document.body.classList.remove('mode-sandbox');
  computeShopBonus();
  const lvl = { ...level, clock: level.clock + shopBonus.clock };
  sim = new Sim(lvl, {
    growthBonus: shopBonus.growthBonus,
    speedMult: shopBonus.speedMult,
    vortexMult: shopBonus.vortexMult,
    durationMult: shopBonus.durationMult,
  });
  sim.level = { ...lvl, target: level.target }; // keep original target
  world = new World3D(canvas, sim, equippedSkinId(), {
    shadows: save.settings.shadows,
    reducedMotion: save.settings.reducedMotion,
  });
  window.__sim = sim; // debug/validator hook
  window.__world = world; // debug hook — the sandbox path already had one
  cam = new ChaseCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
  cam.distScale = save.settings.camDist;
  cam.setReducedMotion(save.settings.reducedMotion);
  if (world && world.setReducedMotion) world.setReducedMotion(save.settings.reducedMotion);
  cam.setBlockers(world.blockers);
  controls = controls || new Controls(canvas);
  controls.settings = save.settings;
  controls.chaseMode = false;   // campaign: tank steering, no auto-follow camera
  // Controls is a singleton across levels, so these are reassigned every start
  // rather than set once: a stale camera would aim the point-to-move raycast
  // through the previous level's projection, and a stale heading would have the
  // first W of the level drive off in the previous level's last direction
  // instead of up-screen (the heading seeds from the live camera yaw on the
  // first move input — see controls.js).
  controls.setCamera(cam.camera);
  controls.heading = null;
  window.__controls = controls;   // debug hook — parity with the sandbox path
  resize();
  startQuality();
  hud.setLevel(level, METROS[level.metroIndex].name);
  hud.show();
  screens.clear();
  state = 'playing';
  const metroKey = (METROS[level.metroIndex] && METROS[level.metroIndex].id) || 'brooklyn';
  const metroCueMap = {
    suburbs: 'brooklyn',
    downtown: 'manhattan',
    coastal: 'boston',
    neon: 'chicago',
    industrial: 'cambridge',
  };
  activePlayMusicCue = metroCueMap[metroKey] || metroKey || 'brooklyn';
  audio.setMusicCue(activePlayMusicCue, { restart: true });
  accumulator = 0;
  lastTs = performance.now();
}

// The renderer's sun direction, for whoever needs to reason about which faces
// are lit. Read from the light itself so it tracks any change to the sun rather
// than duplicating its vector; the shadow offset is the same direction scaled,
// and is the field that is populated earliest. Null if neither is available yet,
// which callers must treat as "no lighting information", not as darkness.
function sunDirOf(w) {
  if (!w) return null;
  const cand = [];
  if (w._sun && w._sun.target) {
    cand.push({
      x: w._sun.position.x - w._sun.target.position.x,
      y: w._sun.position.y - w._sun.target.position.y,
      z: w._sun.position.z - w._sun.target.position.z,
    });
  }
  if (w._sunOffset) cand.push(w._sunOffset);
  if (w.sun) cand.push(w.sun.position);
  for (const c of cand) {
    if (c && Math.hypot(c.x, c.y, c.z) > 1e-6) return { x: c.x, y: c.y, z: c.z };
  }
  return null;
}

// Authored scenes. Four separate lists used to answer "which scenes are real
// places" — the two label ternaries below, the derived-camera-bounds gate and
// the ready gate — and they had already drifted apart once. One row per scene
// instead, so the next scene is a row and not four edits. Same registry idiom
// as DECOR_LAYERS in voxelworld.js and SKINS in skins.js.
//
// A scene ABSENT from this table (the generic 'gallery' sandbox) falls through
// to the physics-test-bed labels and gets neither an establishing shot nor a
// gate, which is correct: it is not a place.
//
// `intro` present == authored showcase. It gates the establishing shot and the
// READY gate off the SAME field, so those two can no longer disagree about
// which scenes are showcases. Manhattan and Upper Manhattan carry no `intro`,
// which preserves today's behaviour exactly — neither gets one now.
//
// `fallbackR` is deliberately Brooklyn-only. It is the radius `beginIntro`
// falls back to when the derived box is empty, and 124.3 was FITTED to Brooklyn
// at +/-10 deg and 1280x800. Boston does not carry one because no one has
// measured Boston's, and an inherited number dressed up as a scene constant is
// worse than an obvious shared default: the `?? 124.3` below is at least
// visibly a fallback. It is unreachable in practice for any authored scene —
// it only fires when sim.blocks is empty, and Boston builds 82,894 of them.
const AUTHORED_SCENES = {
  'manhattan': {
    label: 'NYC: LOWER MANHATTAN',
    hud: 'LOWER MANHATTAN', intro: { subtitle: 'LOWER MANHATTAN' },
  },
  'upper-manhattan': {
    label: 'NYC: UPPER MANHATTAN — CENTRAL PARK',
    hud: 'UPPER MANHATTAN · CENTRAL PARK', intro: { subtitle: 'CENTRAL PARK' },
  },
  'brooklyn': {
    label: 'NYC: BROOKLYN — BRIDGES TO CONEY ISLAND',
    hud: 'BROOKLYN · BRIDGES TO CONEY ISLAND',
    intro: { subtitle: 'BROOKLYN', fallbackR: 124.3 },
  },
  // BOSTON:, not NYC: — the first scene outside New York, and the ternary chain
  // this table replaced quietly assumed there would never be one.
  'boston': {
    label: 'BOSTON: SEAPORT AND THE CONVENTION CENTER',
    hud: 'SEAPORT · BCEC AND THE FISH PIER',
    intro: { subtitle: 'BOSTON' },
  },
  // CAMBRIDGE:, not BOSTON: — it is its own city across the Charles, and the
  // scene's own docs name it that way throughout. No `fallbackR`: the scene
  // ships camera blockers from `generateBlockers`, so beginIntro frames the
  // blocker box rather than needing a hand-set radius.
  'cambridge': {
    label: 'CAMBRIDGE: KENDALL SQUARE AND THE PORTUGUESE SEAM',
    hud: 'CAMBRIDGE · CANAL PARK AND LECHMERE',
    intro: { subtitle: 'CAMBRIDGE' },
  },
  'chicago': {
    label: 'CHICAGO: THE LOOP AND THE CHICAGO RIVER',
    hud: 'CHICAGO · THE LOOP & WILLIS TOWER',
    intro: { subtitle: 'CHICAGO' },
  },
  'tokyo': {
    label: 'TOKYO: NEO-SHINJUKU AND SHIBUYA CROSSING',
    hud: 'TOKYO · SHIBUYA & SHINJUKU WARD',
    intro: { subtitle: 'TOKYO' },
  },
};

async function startRankedRun(scene) {
  const launch = ++rankedLaunch;
  screens.showLoading('STARTING THE RUN…');
  let ticket = null;
  try {
    const { BOARDS_ENABLED } = await import('./board/config.js');
    if (BOARDS_ENABLED) {
      // The ticket is optional by design: no connection starts the identical
      // local RUN, simply without a path onto the public board.
      const board = await import('./board/run.js');
      ticket = await board.startTicket(scene);
    }
  } catch { /* offline RUN stays playable */ }
  if (launch !== rankedLaunch) return;
  startVoxelSandbox(scene, 'run90', ticket);
}

function startVoxelSandbox(scene = 'gallery', mode = 'freeplay', ticket = null) {
  lastSandboxScene = scene;
  lastSandboxMode = mode;
  // The scene build blocks the main thread (~1.3 s sim + instancing for
  // Lower Manhattan) — show a loading frame first so the click never reads
  // as a frozen tab.
  const authored = AUTHORED_SCENES[scene];
  // 'SANDBOX' everywhere for the gallery: the chip, the loading frame, the
  // gate and the HUD used to split between 'SANDBOX' and 'THE COLLECTION' —
  // two names for one door (remediation re-run residual).
  const sceneLabel = authored ? authored.label : 'SANDBOX';
  const hudLabel = authored ? authored.hud : 'SANDBOX';
  screens.showLoading(sceneLabel);
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    // The city's own module is fetched here rather than at page load
    // (js/voxelsim.js registry). The loading frame is already painted — it went
    // up before these two rAFs — so the fetch happens under the same screen that
    // already covers the multi-second build, and the READY gate that follows is
    // mounted from inside this callback, after the await. Nothing downstream can
    // observe the gap: `sim` is not assigned until the builder is in hand.
    await loadScene(scene);
    teardownWorld();
    isVoxelSandbox = true;
    // Scopes the sandbox HUD hierarchy rules in main.css (coin pill dimmed,
    // goal readout loud) without touching the campaign countdown styling.
    document.body.classList.add('mode-sandbox');
    computeShopBonus();
    sim = new VoxelSandboxSim({
      scene,
      mode,
      seed: mode === 'run90' ? (ticket ? ticket.seed : `local-run:${scene}`) : undefined,
      upgrades: save.upgrades,
    });
    window.__sim = sim; // debug/validator hook
    world = new VoxelWorld3D(canvas, sim, equippedSkinId(), { indicatorId: equippedIndicatorId() });
    // The renderer reads the persisted setting at construction, but a mid-session
    // toggle has to reach it too or the ambient layer keeps animating. Guarded
    // to match the setShadows guard in applySettings.
    if (world && world.setReducedMotion) world.setReducedMotion(save.settings.reducedMotion);
    cam = new ChaseCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    cam.distScale = save.settings.camDist;
    cam.setReducedMotion(save.settings.reducedMotion);
    hud.setReducedMotion(save.settings.reducedMotion);
    hud.resetSandboxMeters(); // the plate and the ring must not open on the last run's numbers
    cam.setFollowDirection(true); // chase cam swings behind the direction of travel
    cam.setBlockers(sim.cameraBlockers); // tall towers occlude the low chase cam
    // Establishing shot, authored scenes only (an `intro` row in
    // AUTHORED_SCENES). Ordered AFTER setBlockers because beginIntro frames the
    // blocker box — call it first and the camera fits nothing and falls back to
    // a 30 m radius.
    //
    // minBox is the world extent of everything that RENDERS, which is wider than
    // the blocker list: generateBlockers drops anything under 6 m, so Coney
    // Island's beach, pier and Cyclone carry no blockers at all and a
    // blocker-only frame drops them off the bottom edge. Derived from the blocks
    // rather than written down, so it tracks the scene instead of going stale —
    // and passed as real bounds, not half-extents, because only the camera knows
    // which point it ends up pivoting on. That shape is load-bearing for Boston
    // in particular: its content runs z[-124,92], so the midpoint is -16 and a
    // frame built around the origin would drop the Fish Pier and Commonwealth
    // Pier off the bottom edge.
    if (authored && authored.intro) {
      let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
      for (const b of sim.blocks) {
        // blocks carry a world centre and a per-axis world size (ADR-0013)
        const hx = b.sx / 2, hz = b.sz / 2;
        if (b.x - hx < mnX) mnX = b.x - hx;
        if (b.x + hx > mxX) mxX = b.x + hx;
        if (b.z - hz < mnZ) mnZ = b.z - hz;
        if (b.z + hz > mxZ) mxZ = b.z + hz;
      }
      // Sun direction, READ from the renderer rather than restated here — the
      // establishing yaw is scored partly on which facades are lit, and a copied
      // vector would silently stop matching the moment the sun moves.
      const sd = sunDirOf(world);
      // orbitArc is the dial between motion and scale: the hold distance is
      // fitted to the worst pose the orbit can reach, so widening it pushes the
      // camera back. Measured on this scene at 1280x800: +/-30 deg = 238.6 m and
      // 12.19% of the frame covered, +/-20 = 213.6 m / 15.16%, +/-10 = 188.6 m /
      // 19.33%, 0 = 170.1 m / 24.22%. Angular speed is the SAME at every arc
      // (the phase rate is scaled by the arc), so a narrower sweep costs cadence,
      // not speed: the reversal comes every arc/rate seconds. Measured continuous
      // at every arc — velocity crosses zero on a straight line, so the turn
      // eases rather than bouncing, and 0 still reaches a static hold.
      cam.beginIntro(mnX < mxX
        ? { minBox: { minX: mnX, maxX: mxX, minZ: mnZ, maxZ: mxZ }, orbitArc: Math.PI / 9, sun: sd }
        : { minR: authored.intro.fallbackR ?? 124.3, sun: sd });
    }
    window.__cam = cam; // debug hook
    window.__world = world; // debug hook
    controls = controls || new Controls(canvas);
    controls.settings = save.settings;
    // Third-person chase: WASD/joystick drive the hole — keyboard is tank
    // (W/S throttle along the heading, A/D rotate the heading itself) and the
    // camera aims ITSELF at that heading (cam.setFollowDirection above +
    // the driveHeading arg to cam.update). The heading is owned by Controls
    // and never derived from the camera yaw, so the chase has no feedback
    // loop to wind up. Q/E and the second-finger drag are still there for
    // deliberately looking around; they no longer suspend the chase, they
    // re-aim it — see the yaw offset in camera.js. The on-hole heading
    // pointer (voxelworld.js) is what the player actually reads.
    controls.chaseMode = true;
    controls.setCamera(cam.camera);
    // Fresh level, fresh heading: the first move input seeds it from the live
    // camera yaw so W drives up-screen (controls.js).
    controls.heading = null;
    cam.setSandboxSizeProgress(0);
    controls.setSandboxSizeProgress(0);
    window.__controls = controls; // debug hook — the sizeT ramp has two consumers
    applyVoxTuning(); // dev sliders from the save — no-ops on a ranked sim
    // After the sim and the renderer both exist, and after applyVoxTuning —
    // which writes the whole `tune` object's dev half and would otherwise be
    // the last word on it.
    startQuality();
    // No ranked re-assign here any more. The constructor is now the ONLY writer
    // of a ranked tune: it replaces the object with a frozen copy of
    // RANKED_TUNE, and the two functions above return early on `tuneLocked`.
    // The old line was `Object.assign(sim.tune, RANKED_TUNE)`, which read as
    // "the ranked tune is the final physics writer" but was only true at run
    // start — every later applySettings() re-opened it (audit A5.2), and a
    // merge could never clear a key RANKED_TUNE did not carry (audit A5.1).
    rankedRun = mode === 'run90'
      ? { inputs: createInputBuffer(RANKED_TICK_COUNT), ticks: 0, ticket, move: { x: 0, z: 0 } }
      : null;
    resize();
    hud.setLevel({ index: mode === 'run90' ? 'RUN' : 'SANDBOX', clock: mode === 'run90' ? 90 : 999 }, hudLabel);
    hud.show();
    screens.clear();
    state = 'playing';
    activePlayMusicCue = scene;
    audio.setMusicCue(activePlayMusicCue, { restart: true });
    accumulator = 0;
    lastTs = performance.now();
    audio.startScene(scene);   // per-city bed; the gallery stays deliberately quiet
    // The gate mounts over the live canvas, so the loop must already be running
    // for the establishing orbit to animate behind it. The hole stays parked
    // until the player starts — see the introHolding() check in frame().
    // The handle is kept so teardownWorld() can dismiss it: dropping the node
    // alone would leave a live window keydown listener AND body.rg-gate-up set,
    // which strands the HUD invisible on the next campaign level.
    if (authored && authored.intro) {
      // Arrival beat under the wide static overview; the gate's own downbeat
      // answers when the player starts the zoom.
      audio.countdownTick();
      readyGate = mountReadyGate({
        title: 'READY?',
        subtitle: authored.intro.subtitle,   // the pill is sized for one short word
        reducedMotion: save.settings.reducedMotion,
        onStart: () => {
          readyGate = null;     // the gate tears itself down after onStart
          audio.countdownGo();   // downbeat for the zoom
          cam.releaseIntro();
        },
      });
    } else {
      // The gallery is a real goal level too. Its compact pile has no skyline
      // bounds to frame, so use its movement bounds for the same zoom-in beat.
      cam.beginIntro({ minR: sim.bounds, sun: sunDirOf(world) });
      readyGate = mountReadyGate({
        title: 'READY?', subtitle: 'SANDBOX', reducedMotion: save.settings.reducedMotion,
        onStart: () => { readyGate = null; audio.countdownGo(); cam.releaseIntro(); },
      });
    }
  }));
}

function teardownWorld() {
  // The menu backdrop owns the same canvas a game world is about to claim, so
  // it goes first and it goes here — this is the one function both start paths
  // call before constructing anything.
  stopMenuScene();
  screens.dismissPokemonEncounterModal();
  screens.dismissEarthquakeCinematic();
  screens.dismissDragonballCollectCinematic();
  pokeSpawnQueue = [];
  isShowingPokeSpawn = false;
  if (readyGate) { readyGate.dismiss(); readyGate = null; }
  if (world) { world.dispose(); world = null; }
  sim = null;
  audio.stopScene();   // a level teardown silences the city bed with the city
}

function endLevel() {
  state = 'results';
  hud.hide();
  const won = sim.won;
  if (won) audio.win(); else audio.lose();
  screens.showResults(level, sim, (stars, coins, toMap) => {
    recordLevelResult(save, level.index, {
      stars, mass: sim.player.mass, bestCombo: sim.player.bestCombo,
      won, coinsEarned: coins,
    });
    if (toMap) { teardownWorld(); state = 'menu'; screens.showWorldMap(); }
    else if (won && level.index < 100) { level = getLevel(level.index + 1); screens.actions.play(level); }
    else startLevel();
  });
}

// ------------------------------------------------------------------ loop
const FIXED_DT = 1 / 60;

function frame(ts) {
  // The handle is kept so the visibility listener can genuinely STOP the loop
  // rather than leave a throttled one running in a hidden tab. Re-armed first,
  // as it always was, so a throw anywhere below cannot kill the game loop.
  loopHandle = requestAnimationFrame(frame);
  const rawDt = (ts - lastTs) / 1000 || 0;
  const realDt = Math.min(0.1, rawDt);
  lastTs = ts;

  if (state === 'playing' && sim) {
    // The READY gate holds the establishing shot: the world renders and the
    // camera orbits, but the sim does not advance a single tick. Draining the
    // accumulator here (rather than letting it fill) means the level cannot
    // lurch forward by however long the player looked at the sign.
    const held = cam.introHolding();
    accumulator = held ? 0 : accumulator + realDt;
    if (isVoxelSandbox) {
      // One signal, two consumers: the camera scales its framing, standoff and
      // chase rates off it, Controls scales the manual orbit rate.
      const sizeT = sandboxSizeProgress(sim.hole.size, sim.hole.sizeFrac);
      cam.setSandboxSizeProgress(sizeT);
      controls.setSandboxSizeProgress(sizeT);
    }
    // Steering is dropped on the floor while held, so the key press that starts
    // the level is never also a throttle input.
    // The hole is passed so point-to-move can measure the world-space heading
    // from it; every other scheme ignores it. A zero vector is enough to hold
    // keys and the stick, but a tap-to-move destination outlives the frame it
    // was made on, so it has to be cancelled rather than merely ignored.
    if (held) controls.cancelPointer();
    const move = held ? { x: 0, z: 0 }
      : controls.getMove(cam.yaw, undefined, isVoxelSandbox ? sim.hole : sim.player);
    // The steering heading rides on the hole for the renderer: directional
    // skins and bite bearings read it there (skins.js, world _skinFrame).
    // Neither sim ever does — it is presentational state, not gameplay state.
    const driveHole = isVoxelSandbox ? sim.hole : sim.player;
    driveHole.heading = controls.heading ?? 0;
    const orbit = controls.consumeOrbit();
    const zoom = controls.consumeZoom();
    // Fixed-step catch-up, with a TIER-DRIVEN sub-step ceiling.
    //
    // This is the single nastiest failure mode on a slow device, and it is a
    // positive feedback loop rather than a slow degradation: `realDt` is clamped
    // to 0.1 s, so a frame may owe up to 6 sub-steps. The moment a device cannot
    // finish ONE sub-step inside a frame it is immediately asked for six, the
    // frame gets ~6x worse, which makes the next frame owe six again. Measured at
    // 4x CPU throttle on Brooklyn: `sim.step` 470 ms/frame at 3.8 fps, of which a
    // single step is ~78 ms. No quality tier fixes that, because the tier lowers
    // the cost of one step while the loop multiplies whatever is left by six.
    //
    // Capping the count converts the spiral into slow motion: the world advances
    // less game-time per second, but it stays INTERACTIVE and the input keeps
    // responding. That is the right trade on a phone. HIGH keeps 6, which is
    // exactly the pre-tier ceiling (0.1 / FIXED_DT), so nothing changes for a
    // machine that was coping — and `tools/validate.mjs` never runs this loop.
    const maxSteps = (TIERS[tierName] || TIERS.high).maxSubSteps || 6;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < maxSteps) {
      // Recording is a single pair of typed-array writes per fixed tick. It is
      // independent of ticket/network state: an offline RUN remains a complete
      // local trace rather than a different kind of play.
      let fixedMove = move;
      if (rankedRun && rankedRun.ticks < RANKED_TICK_COUNT) {
        writeInput(rankedRun.inputs, rankedRun.ticks++, move.x, move.z);
        // THE RUN is stepped from the same quantised pair that is stored. If
        // the browser stepped raw joystick floats and Node replayed int8s, a
        // perfectly honest trace could produce a different score.
        fixedMove = inputAt(rankedRun.inputs, rankedRun.ticks - 1, rankedRun.move);
      }
      sim.step(FIXED_DT, fixedMove);
      accumulator -= FIXED_DT;
      steps++;
      if (sim.over) break;
    }
    // Drop the debt we could not afford instead of carrying it into the next
    // frame — carrying it is what makes the spiral unrecoverable.
    if (accumulator >= FIXED_DT) accumulator = 0;
    const events = sim.drainEvents();
    if (isVoxelSandbox) {
      // The listener rides the local hole: positional sounds (collapses, the
      // derailment) and the el-train bed fall off with distance from it.
      audio.updateListener(sim.hole.x, sim.hole.z, sim.moverSim);
      for (const ev of events) {
        audio.handleEvent(ev);   // gulps, combo ladder, tiered collapses, stingers
        if (ev.type === 'combo') {
          hud.pulseCombo();
          if (ev.level >= 2) {
            const multNum = typeof ev.mult === 'number' ? ev.mult : ev.level;
            const comboText = ev.top ? `MAX ${multNum}X` : `${multNum}X`;
            let subText = 'COMBO!';
            if (ev.level >= 8 || ev.top) subText = 'GODLIKE!';
            else if (ev.level >= 6) subText = 'MEGA!';
            else if (ev.level >= 4) subText = 'HYPER!';

            hud.announce({
              text: comboText,
              sub: subText,
              tier: ev.level,
              source: 'combo',
              priority: ANN.COMBO + ev.level,
              ms: 1100,
              channel: 'cm_burst',
            });
            if (ev.level >= 4) {
              world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * 1.3, ev.top ? 0xff2d1f : 0x00e5ff);
              world.spawnGoldenSparkles(ev.hole.x, ev.hole.z, ev.hole.radius, 12);
              if (!save.settings.reducedMotion) cam.triggerShake(ev.top ? 0.35 : 0.2);
            }
          }
        } else if (ev.type === 'crash') {
          cam.triggerShake(Math.min(0.6, 0.1 + ev.size * 0.02));
        } else if (ev.type === 'growth') {
          // SIZE level-up: sting (GameAudio), shake, FOV punch, confetti, center-screen big pop
          cam.triggerShake(0.4);
          cam.fovKick(7);
          world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius, 0xffd23f, ev.size);
          hud.announce({
            text: `SIZE ${ev.size}!`,
            sub: '✦ EXPANDING VORTEX ✦',
            source: 'size',
            tier: 'size',
            priority: ANN.SIZE,
            ms: 1300,
            channel: 'pop',
          });
        } else if (ev.type === 'milestone') {
          // Consumption: the widest thing in the mix. GameAudio scales the
          // fanfare by tier; the screen answers with the full-width band.
          const loud = ev.tier === 'roar';
          if (loud) {
            cam.fovKick(8);
            world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius * 1.3, 0xff7700, 8);
          }
          world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * (loud ? 1.6 : 1.2), loud ? 0xffffff : 0xffd23f);
          const pct = Math.round((ev.frac || (ev.row && ev.row.at) || 0) * 100);
          hud.announce({
            text: ev.text,
            sub: pct >= 100 ? '⚡ FULL MAP EXTINCTION ⚡' : `✦ ${pct}% CITY HARVEST ✦`,
            tier: ev.tier,
            source: 'milestone',
            priority: ANN.MILESTONE + (loud ? 5 : 0),
            ms: 2200,
            channel: 'band',
          });
        } else if (ev.type === 'coin') {
          world.spawnGoldenSparkles(ev.hole.x, ev.hole.z, ev.hole.radius, 16);
          hud.announce({ text: `COIN! +${ev.value}`, source: 'coin', priority: ANN.COIN, ms: 700 });
          triggerHaptic(15);
          audio.playCoin();
        } else if (ev.type === 'clock') {
          // The endgame states (R-1.5). Fired by the sim at exact ticks, so both
          // arrive once and at the same moment on every device. The visual state
          // is the clock pill itself (js/ui/hud.js reads the same thresholds);
          // this is the audible half, on the countdown cue the audio layer
          // already has, plus one short announcement through the queue.
          audio.countdownTick();
          hud.announce({
            text: ev.at <= 10 ? `${ev.at} SECONDS!` : `${ev.at} SECONDS LEFT`,
            sub: '⏰ TIME RUNNING OUT ⏰',
            source: 'clock',
            tier: ev.at <= 10 ? 'roar' : 'hype',
            priority: ANN.CLOCK,
            ms: 1400,
            channel: 'band',
          });
        } else if (ev.type === 'powerup_collect') {
          audio.playPowerUpCollect();
          const isQuake = ev.powerup.type === 'quake' || (ev.powerup.spec && ev.powerup.spec.id === 'quake');
          const isChrono = ev.powerup.type === 'chrono' || (ev.powerup.spec && ev.powerup.spec.id === 'chrono');
          if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });
          if (isQuake) {
            audio.playFaultLineQuake();
            cam.triggerShake(1.2);
          } else {
            cam.triggerShake(0.35);
          }
          triggerHaptic(80);
          const spec = ev.powerup.spec || {};
          hud.announce({
            text: `${spec.icon || '⚡'} ${spec.name || 'POWER-UP'}!`,
            sub: spec.tagline ? `✦ ${spec.tagline.toUpperCase()} ✦` : '✦ BUFF ACTIVATED ✦',
            source: 'powerup',
            tier: 'powerup',
            priority: ANN.SIZE,
            ms: 6000,
            channel: 'band',
          });
          if (typeof screens.triggerActivePowerUpOverlay === 'function') {
            screens.triggerActivePowerUpOverlay(ev.powerup.type);
          }
          if (!isQuake) playPowerUpCollectCinematic(ev.powerup);
        } else if (ev.type === 'powerup_spawn') {
          queuePokemonSpawnIntro(ev.powerup, sim, cam);
        } else if (ev.type === 'disaster') {
          cam.triggerShake(1.2);
          triggerHaptic(100);
          hud.announce({
            text: ev.title || '⚠️ NATURAL DISASTER! ⚠️',
            sub: ev.sub || 'CATACLYSM INCOMING!',
            tier: 'roar',
            source: 'disaster',
            priority: ANN.SIZE + 1,
            ms: 6000,
            channel: 'band',
          });
        } else if (ev.type === 'disaster_teleport') {
          cam.triggerShake(1.5);
          triggerHaptic(120);
          world.spawnBurst(ev.fromX, ev.fromZ, ev.hole.radius * 1.5, 0xff0055, 8);
          world.spawnShockRing(ev.fromX, ev.fromZ, ev.hole.radius * 2.0, 0xff0055);
          world.spawnBurst(ev.toX, ev.toZ, ev.hole.radius * 1.5, 0x00f5d4, 8);
          world.spawnShockRing(ev.toX, ev.toZ, ev.hole.radius * 2.0, 0x00f5d4);
          hud.announce({
            text: ev.title || '⚡ DISASTER TELEPORT PENALTY! ⚡',
            sub: ev.sub || 'WARPED ACROSS THE METROPOLIS!',
            tier: 'roar',
            source: 'disaster_teleport',
            priority: ANN.SIZE + 2,
            ms: 6000,
            channel: 'band',
          });
        } else if (ev.type === 'quake') {
          triggerHaptic(75);
          playEarthquakeCinematic(ev);
        }
      }
      // to eats, SIZE-ups and consumption milestones.
      world.update(realDt, events);
      const hole = sim.hole;
      // orbitHeld, not just the orbit delta: a touch-drag finger that has
      // stopped moving emits no delta and would otherwise let the camera's
      // recentre grace expire underneath it. See Controls.orbitHeld.
      cam.update(realDt, hole.x, hole.z, hole.radius, orbit, zoom, controls.orbitHeld, controls.heading);
      world.render(cam.camera);
      hud.updateSandbox(sim);
      // A fault line can clear the final blocks in the same fixed step. Keep
      // its presentation readable; the next playing frame opens results once
      // the cinematic releases the state hold.
      if (sim.over && state !== 'quake_cinematic' && state !== 'powerup_collect_cinematic') endSandbox();
    } else {
      audio.updateListener(sim.player.x, sim.player.z, null);
      for (const ev of events) {
        if (ev.type === 'eat') {
          // Only the player's own mouth is mic'd; rival holes chew in silence.
          if (ev.hole.isPlayer) {
            audio.handleEvent(ev);
            triggerHaptic(ev.obj.tier >= 4 ? 22 : 12);
            if (ev.obj.tier >= 4) {
              cam.triggerShake(ev.obj.tier >= 6 ? 0.8 : 0.4);
            }
            if (ev.obj.golden) {
              hud.announce({
                text: 'GOLDEN! 8X MASS',
                sub: '✨ RARE TREASURE ✨',
                tier: 'roar',
                source: 'golden',
                priority: ANN.SIZE,
                ms: 1600,
                channel: 'band',
              });
              if (world && world.spawnGoldenSparkles) world.spawnGoldenSparkles(ev.hole.x, ev.hole.z, ev.hole.radius, 16);
            }
            if (ev.obj.kind === 'landmark') {
              hud.announce({
                text: 'LANDMARK SWALLOWED!',
                sub: '⚡ COLOSSAL CONSUMPTION ⚡',
                tier: 'roar',
                source: 'landmark',
                priority: ANN.MILESTONE + 10,
                ms: 2200,
                channel: 'band',
              });
              cam.triggerShake(1.4);
              triggerHaptic(60);
              if (world) {
                if (world.spawnShockRing) world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * 1.8, 0xffffff);
                if (world.spawnBurst) world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius * 1.4, 0xffd23f, 10);
              }
            }
          }
        } else if (ev.type === 'combo') {
          if (ev.hole && ev.hole.isPlayer) {
            const multStr = typeof ev.mult === 'number' ? ev.mult.toFixed(1) + 'X' : (ev.name || `${ev.mult}X`);
            const comboText = ev.top ? `MAX ${multStr}` : `${multStr}`;
            hud.announce({
              text: comboText,
              sub: 'COMBO!',
              tier: ev.level || 1,
              source: 'combo',
              priority: ANN.COMBO + (ev.level || 1),
              ms: 1100,
              channel: 'cm_burst',
            });
          }
        } else if (ev.type === 'bounce') {
          if (ev.hole && ev.hole.isPlayer && !save.settings.reducedMotion) {
            cam.triggerShake(0.2);
          }
        } else if (ev.type === 'powerup_collect') {
          audio.playPowerUpCollect();
          const isQuake = ev.powerup.type === 'quake' || (ev.powerup.spec && ev.powerup.spec.id === 'quake');
          const isChrono = ev.powerup.type === 'chrono' || (ev.powerup.spec && ev.powerup.spec.id === 'chrono');
          if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });
          if (isQuake) {
            audio.playFaultLineQuake();
            cam.triggerShake(1.2);
          } else {
            cam.triggerShake(0.35);
          }
          triggerHaptic(80);
          const spec = ev.powerup.spec || {};
          hud.announce({
            text: `${spec.icon || '⚡'} ${spec.name || 'POWER-UP'}!`,
            sub: spec.tagline ? `✦ ${spec.tagline.toUpperCase()} ✦` : '✦ BUFF ACTIVATED ✦',
            source: 'powerup',
            tier: 'powerup',
            priority: ANN.SIZE,
            ms: 2000,
            channel: 'band',
          });
          if (typeof screens.triggerActivePowerUpOverlay === 'function') {
            screens.triggerActivePowerUpOverlay(ev.powerup.type);
          }
          if (!isQuake) playPowerUpCollectCinematic(ev.powerup);
        } else if (ev.type === 'powerup_spawn') {
          queuePokemonSpawnIntro(ev.powerup, sim, cam);
        } else if (ev.type === 'disaster') {
          cam.triggerShake(1.2);
          triggerHaptic(100);
          hud.announce({
            text: ev.title || '⚠️ NATURAL DISASTER! ⚠️',
            sub: ev.sub || 'CATACLYSM INCOMING!',
            tier: 'roar',
            source: 'disaster',
            priority: ANN.SIZE + 1,
            ms: 2800,
            channel: 'band',
          });
        } else if (ev.type === 'quake') {
          triggerHaptic(75);
          playEarthquakeCinematic(ev);
        } else if (ev.type === 'tide') {
          hud.announce({
            text: 'THE TIDE IS RISING!',
            sub: '🌊 WATER SURGE 🌊',
            tier: 'hype',
            source: 'tide',
            priority: ANN.SIZE,
            ms: 2000,
            channel: 'band',
          });
        } else if (ev.type === 'unlocked') {
          hud.announce({
            text: 'LANDMARK SHIELD DOWN!',
            sub: '✦ READY TO DEVOUR ✦',
            tier: 'hype',
            source: 'unlocked',
            priority: ANN.SIZE,
            ms: 2000,
            channel: 'band',
          });
          triggerHaptic(50);
        }
      }
      world.update(realDt, events);
      // Passed here too so both call sites hand the camera the same per-frame
      // truth; the campaign camera provably ignores them (followDir is false,
      // and both the held flag and the heading are read only inside that
      // branch).
      cam.update(realDt, sim.player.x, sim.player.z, sim.player.radius, orbit, zoom, controls.orbitHeld, controls.heading);
      world.render(cam.camera);
      hud.update(sim);
      hud.drawMinimap(sim);
      if (sim.over && state !== 'quake_cinematic' && state !== 'powerup_collect_cinematic') endLevel();
    }
  } else if ((state === 'quake_cinematic' || state === 'powerup_collect_cinematic' || state === 'powerup_encounter') && world && cam) {
    world.update(realDt, []);
    const h = (sim && sim.hole) || (sim && sim.player) || { x: 0, z: 0, radius: 2 };
    cam.update(realDt, h.x, h.z, h.radius, 0, 0, false, null);
    world.render(cam.camera);
    if (sim && sim.hole) hud.updateSandbox(sim);
    else if (sim && sim.player) {
      hud.update(sim);
      hud.drawMinimap(sim);
    }
  } else if ((state === 'paused' || state === 'results') && world && cam) {
    world.update(0, []);
    world.render(cam.camera);
  } else if (state === 'menu') {
    // The title screen's live backdrop, folded into this loop rather than
    // running one of its own. It is a no-op until the scene has built, and a
    // permanent no-op on a device that never built one.
    tickMenuScene(realDt);
  }
}

function endSandbox() {
  if (state === 'results') return;
  state = 'results'; hud.hide();
  audio.stopScene();   // the results reveal plays over quiet, same as the arena
  const finished = sim;
  if (finished.mode === 'run90') {
    const trace = rankedRun && rankedRun.ticks === RANKED_TICK_COUNT
      ? encodeTrace(rankedRun.inputs, rankedRun.ticks) : null;
    const completedRun = rankedRun;
    const resultScreen = screens.showRunResults(finished, trace, (toCities) => {
      rankedRun = null;
      if (toCities) { teardownWorld(); state = 'menu'; screens.showTitle(); }
      else void startRankedRun(finished.scene);
    });
    if (trace && completedRun && completedRun.ticket) {
      resultScreen.setRunId(completedRun.ticket.run_id);
      void import('./board/run.js').then(({ finishRun }) => finishRun(save, completedRun.ticket, finished, completedRun.inputs))
        .then((result) => resultScreen.setRankStatus(result))
        .catch(() => resultScreen.setRankStatus({ verdict: 'queued' }));
    } else {
      resultScreen.setRankStatus({ verdict: 'unranked' });
    }
    return;
  }
  screens.showSandboxResults(finished, (toCities, coins) => {
    recordSandboxResult(save, finished.scene, {
      coinsEarned: coins, elapsed: finished.time,
      bestCombo: finished.hole.bestCombo, score: finished.hole.mass,
      // Both halves of the outcome, because the clock made them different
      // questions (R-2.2). `won` is a genuine full clear of the city and is what
      // `completions` counts; `percent` is what the player actually reached in
      // the 180 s and is the record almost every run will set.
      won: finished.won,
      percent: finished.totalMass ? finished.hole.rawMass / finished.totalMass : 0,
    });
    if (toCities) { teardownWorld(); state = 'menu'; screens.showCitySelect(); }
    else startVoxelSandbox(finished.scene);
  });
}

// ------------------------------------------------------------------ resize
// `world.resize` reallocates the drawing buffer and every shadow render target,
// which is one of the most expensive single calls in the app. On a phone that is
// not a rare event: iOS Safari and Chrome Android fire `resize` continuously for
// the whole of the URL-bar collapse animation, DURING normal play, so an
// undebounced listener paid a full reallocation per animation frame of a bar
// sliding away — and many of those events report a size that has not changed at
// all (an orientation-neutral scroll, a keyboard dismissal, a devtools repaint).
//
// Two guards, and they cover different halves of the problem. The rAF coalesce
// collapses a burst of events into one reallocation per frame; the
// dimension check drops the burst entirely when nothing actually moved, which is
// the common case for the URL-bar animation's tail.
//
// The direct `resize()` is still there and still immediate, because the level
// start paths call it against a renderer that was constructed one line earlier:
// there is no previous size to compare against and nothing to coalesce with, so
// it FORCES past both guards.
let resizeRaf = 0;
let lastResizeW = 0;
let lastResizeH = 0;

function applyResize(force) {
  const w = window.innerWidth, h = window.innerHeight;
  if (!force && w === lastResizeW && h === lastResizeH) return;
  lastResizeW = w; lastResizeH = h;
  if (world) world.resize(w, h);
  if (cam) cam.resize(w / h);
  resizeMenuScene(w, h);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

function resize() {
  if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
  applyResize(true);
}

window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; applyResize(false); });
});

// ------------------------------------------------------------------ visibility
// A backgrounded tab was still holding everything: a 150-265 MB heap, a live GL
// context and a loop that browsers throttle rather than stop. On iOS Safari that
// combination is what gets a tab discarded outright — the player switches app,
// takes a call, comes back to a reload and loses the run.
//
// So the loop is genuinely STOPPED, not slowed: `frame` stops re-arming itself
// and the handle is cancelled, which means zero renders, zero sim steps and no
// GPU work at all while hidden. The music engine already tracks visibility on
// its own (js/audio/music.js), so this is only the loop's half.
//
// A hidden tab mid-run also becomes PAUSED. That is a product decision as much
// as a performance one: coming back to a city that kept collapsing without you
// is the same bad surprise either way, and the pause screen is the honest place
// to land. `accumulator` and `lastTs` are both reset on the way back in — the
// accumulator so the sim cannot try to replay the minutes it was away (the
// sub-step cap would clamp it anyway, but into slow motion rather than into
// nothing), and lastTs so the first frame back reports a normal delta instead of
// however long the player was gone.
let loopHandle = 0;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (loopHandle) { cancelAnimationFrame(loopHandle); loopHandle = 0; }
    if (state === 'playing') { state = 'paused'; screens.showPause(); }
    accumulator = 0;
  } else if (!loopHandle) {
    drainSavedBoardOutbox();
    lastTs = performance.now();
    accumulator = 0;
    loopHandle = requestAnimationFrame(frame);
  }
});

document.getElementById('btn-pause').addEventListener('click', () => {
  if (state === 'playing') { state = 'paused'; screens.showPause(); }
});
document.getElementById('btn-mute').addEventListener('click', () => {
  save.muted = !save.muted; storeSave(save);
  audio.setMuted(save.muted);
});
// Menu voice: one delegated listener over every screen the Screens class
// mounts. Primary CTAs confirm, secondary buttons tap, BACK steps out.
document.getElementById('screen-root').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (/^BACK/.test(b.textContent.trim())) audio.uiBack();
  else if (b.classList.contains('secondary')) audio.uiTap();
  else audio.uiConfirm();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'playing') { state = 'paused'; screens.showPause(); }
  else if (e.code === 'Escape' && state === 'paused') {
    state = 'playing';
    audio.setMusicCue(activePlayMusicCue);
    screens.clear();
  }
});

// The boot splash tracks actual loading progress until the 3D spinning city
// is built and rendered, and title music has started.
let bootFinished = false;
function finishBootSplash() {
  if (bootFinished) return;
  bootFinished = true;
  if (typeof window.__setBootProgress === 'function') {
    window.__setBootProgress(100, 'READY TO ROLL!');
  }
  setTimeout(() => {
    const bootSplash = document.getElementById('boot-splash');
    if (bootSplash) {
      bootSplash.classList.add('fade-out');
      setTimeout(() => {
        if (bootSplash.parentNode) bootSplash.remove();
      }, 450);
    }
  }, 1600);
}

// Start menu scene immediately on cold boot with onReady hook
startMenuScene(canvas, {
  settings: save.settings,
  skinId: equippedSkinId(),
  immediate: true,
  onReady: finishBootSplash,
});

// Fallback safety timeout so boot splash never gets stuck
setTimeout(finishBootSplash, 5000);

screens.showTitle();
resize();
requestAnimationFrame((ts) => { lastTs = ts; loopHandle = requestAnimationFrame(frame); });
