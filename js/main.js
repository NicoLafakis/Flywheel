// Boot + screen state machine + game loop glue.

import { Sim } from './sim.js';
import {
  RANKED_TICK_COUNT, VoxelSandboxSim, sandboxSizeProgress, loadScene,
} from './voxelsim.js';
import { getLevel, METROS } from './levels.js';
import { loadSave, storeSave, recordLevelResult, recordSandboxResult, recordChallengeResult, isLevelUnlocked, buyUpgrade, playerName, markProgressDirty } from './save.js';
// Cloud progress sync (js/cloud/sync.js): the save follows the signed-in
// player. Imported here (not lazily) so its dirty-listener is registered before
// the first recorder can run; every call it makes is async and outside the
// fixed-step loop.
import { configureSync, flushSync } from './cloud/sync.js';
import { upgradeMultiplier } from './upgrades.js';
import { World3D } from './world3d.js';
import { VoxelWorld3D } from './voxelworld.js';
import { ChaseCamera } from './camera.js';
import { Controls } from './controls.js';
import { HUD, ANN } from './ui/hud.js';
import { Screens, SKINS, INDICATOR_SKINS, CITY_CATALOG } from './ui/screens.js';
import { isSkinAvailable } from './skinapproval.js';
import { mountReadyGate } from './ui/ready.js';
import { TutorialManager, shouldShowTutorial } from './ui/tutorial.js';
import { startMenuScene, stopMenuScene, tickMenuScene, resizeMenuScene } from './ui/menuscene.js';
import { TIERS, defaultTierForDevice } from './quality.js';

import { GameAudio } from './audio/game-audio.js';
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME, reseedAudioMix } from './audio/mix.js';
import { getAvailableTracks } from './audio/tracklist.js';
import { createInputBuffer, encodeTrace, inputAt, writeInput } from './replay.js';

import { LiveBroadcastChannel } from './multiplayer/channel.js';
import { MultiplayerLobby } from './multiplayer/lobby.js';
import { MultiplayerHost } from './multiplayer/host.js';
import { MultiplayerPeer } from './multiplayer/peer.js';
import { MultiplayerUI } from './multiplayer/ui.js';

const canvas = document.getElementById('game-canvas');
const hud = new HUD();
window.__hud = hud; // debug/smoke-test hook, same idiom as __sim / __cam / __controls
const save = loadSave();

// A failed submit stays local until the next useful network opportunity. This
// work is deliberately outside the fixed simulation loop: reconnecting may
// cause fetches, but it must never alter a completed replay.
function drainSavedBoardOutbox() {
  // Cloud progress shares every reconnect moment with the ranked outbox: a
  // dirty save is pushed on the same boot / `online` / 60 s tick. No-op unless
  // dirty and signed in; deferred by sync.js itself while a level is playing.
  void Promise.resolve(flushSync(save)).catch(() => {});
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
// caller that sees `reseeded` and can therefore also move the save's four level
// keys (master, sfx, amb, music) onto the new mix. Without that, the lines below
// would write the save's old levels straight back over the freshly seeded ones
// and nothing would change.
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
    if (audio.music && audio.music.audio && audio.music.audio.paused && !audio.music._muted) {
      audio.music._safePlay();
    }
  } catch {}
};
window.addEventListener('pointerdown', earlyUnlock, { passive: true });
window.addEventListener('touchstart', earlyUnlock, { passive: true });
window.addEventListener('mousedown', earlyUnlock, { passive: true });
window.addEventListener('click', earlyUnlock, { passive: true });
window.addEventListener('keydown', earlyUnlock, { passive: true });

// ------------------------------------------------------------------ game state
let state = 'menu'; // menu | intro | playing | powerup_pause | quake_cinematic | paused | results
// Invariant 4: sync applies to the SAVE, never a live sim, and not even to the
// save while a level is running — a merged document arriving mid-level would
// change what the results screen writes over. sync.js holds it until the menu.
configureSync({ isPlaying: () => state === 'playing' || state === 'intro' || state === 'powerup_pause' || state === 'quake_cinematic' });
// The menu is the natural flush point: every path back to the title passes
// here, so a level's coins and stars leave for the account within a beat of
// the player seeing them, instead of waiting out the debounce.
function backToTitle() {
  state = 'menu';
  void Promise.resolve(flushSync(save)).catch(() => {});
  screens.showTitle();
}
let isVoxelSandbox = false;
let level = null;
let sim = null;
let world = null;
let cam = null;
let controls = null;
let readyGate = null; // live mountReadyGate handle, so teardown can dismiss it
let tutorialManager = null; // live interactive onboarding walkthrough
let lastSandboxScene = 'gallery'; // for pause-menu RESTART in the sandbox
let lastSandboxMode = 'freeplay';
let rankedRun = null; // { inputs, ticks, ticket, move }; only allocated before a RUN starts
let rankedLaunch = 0; // rejects a stale ticket response after a fast double-tap
let activePlayMusicCue = 'gallery'; // The Lab's theme since the-lab.mp3 shipped
// Pause-menu picker override: session-scoped (never persisted), cleared at
// every run start so entering a new city returns to that city's own theme.
// js/audio/tracklist.js owns which cues the picker may offer.
let musicOverride = null;
const playCue = () => musicOverride || activePlayMusicCue;
let accumulator = 0;
let lastTs = 0;
let shopBonus = { clock: 0, growth: 0 };

let isMultiplayer = false;
// Module scope on purpose: the render loop needs the role to decide whether it
// may end the match, and reading the `isHost` parameter of startMultiplayerMatch
// from inside frame() was a ReferenceError thrown on every frame at the end of a
// joiner's match.
let mpIsHost = false;
let mpHost = null;
let mpPeer = null;
let mpLobby = null;
let mpUI = null;

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

// The server-side check we do not have. `buy` and `equip` are the only two ways
// an id ever reaches the save, and both are reachable without going through a
// freshly rendered shop — a screen built before a withdrawal, a click already in
// flight, or the console — so neither may trust that the UI offered the id.
//
// An id we do not recognise passes: `ownedItems` also holds indicator ids and
// the legacy `clock5`/`growth5` items, and none of those are skins. This
// answers only the one question isSkinAvailable() owns, for the rows it owns.
function isPurchasableSkin(id) {
  const row = SKINS.find((s) => s.id === id);
  return !row || isSkinAvailable(row);
}

function computeShopBonus() {
  shopBonus = {
    clock: save.ownedItems.includes('clock5') ? 5 : 0,
    growth: save.ownedItems.includes('growth5') ? 0.05 : 0,
    speedMult: upgradeMultiplier(save.upgrades?.speed),
    vortexMult: upgradeMultiplier(save.upgrades?.vortex),
    // T-703: the growth rank is the WHOLE growth bonus, and `growth5` must not
    // be added on top of it. The v20 migration (`__MIGRATIONS[19]` in save.js)
    // converts owning the legacy 500-coin item into `upgrades.growth >= 1`, and
    // rank 1 already IS the item's +5% — so the migration is the single source
    // of truth and a second term here paid one purchase twice. It went unseen
    // while nothing read `growthBonus`; T-702 wired it into campaign mass gain,
    // which would have shipped a pre-v20 player +10% in the campaign against
    // the +5% the sandbox gives them, since VoxelSandboxSim derives its
    // `growthMult` from `save.upgrades` alone and never looks at `ownedItems`.
    growthBonus: (upgradeMultiplier(save.upgrades?.growth) - 1.0),
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
  startVoxelSandbox(scene, mode = 'freeplay') { startVoxelSandbox(scene, mode); },
  startChallenge(scene, mode = 'challenge3m') { startVoxelSandbox(scene, mode); },
  startRankedRun(scene) { void startRankedRun(scene); },
  showMultiplayerModal() { showMultiplayerHostModal(); },
  resume() {
    if (state === 'paused') {
      state = 'playing';
      audio.setMusicCue(playCue());
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
    // The catalog, not the UI, is the authority on what may be sold. The shop
    // no longer lists an unapproved partner, but this path is reachable without
    // it — a screen rendered before the withdrawal, a queued click, the console
    // — and a purchase is what writes the id into `ownedItems` permanently.
    if (!isPurchasableSkin(id)) return false;
    if (save.coins < price || save.ownedItems.includes(id)) return false;
    save.coins -= price;
    save.ownedItems.push(id);
    markProgressDirty(save);
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
    // Refuse BEFORE the write: a withdrawn mark must not be wearable even by a
    // player who already owns it, and returning early is what leaves
    // `equippedSkin` on whatever they had on.
    if (!isPurchasableSkin(id)) return false;
    save.equippedSkin = id;
    markProgressDirty(save);
    storeSave(save);
    return true;
  },
  equipIndicator(id) {
    save.equippedIndicator = id;
    markProgressDirty(save);
    storeSave(save);
  },
  toggleMute() { save.muted = !save.muted; markProgressDirty(save); storeSave(save); audio.setMuted(save.muted); },
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
  // Pause-menu track picker: the catalog is availability-gated by save, and a
  // selection both takes effect immediately (it doubles as a preview while
  // paused — resume re-requests the same cue, which the director dedupes) and
  // persists until the run ends. A cue the save may not select is refused.
  musicTracks() { return getAvailableTracks(save); },
  nowPlaying() { return playCue(); },
  musicSelect(cue) {
    if (!getAvailableTracks(save).some((t) => t.cue === cue)) return false;
    musicOverride = cue;
    audio.setMusicCue(cue);
    return true;
  },
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

// The ANNOUNCE half. Every power-up spawn says so; only an ARRIVAL earns a
// cutscene. Split out of queuePokemonSpawnIntro so that suppressing the camera
// takeover does not silently take the toast with it — the toast is information
// the player needs, the cutscene is a flourish that costs them the shot they
// were looking at.
function announcePowerUpSpawn(pu) {
  if (!pu) return;
  screens.showOrbitalBeaconNotification(pu);
}

function queuePokemonSpawnIntro(pu, simInstance, camInstance, reason) {
  if (!pu) return;
  // The two map power-ups are placed by the sim CONSTRUCTOR and their events are
  // drained on the first frame of the level, before a single tick has run
  // (js/voxelsim.js, js/main.js's event pump). They are level furniture, not an
  // arrival, and announcing them with a cutscene costs the establishing shot —
  // measured overriding it 20 ms before the first cam.update of the level, which
  // is the whole of "the camera is jerky between hitting start and following the
  // player".
  if (reason === 'initial') { announcePowerUpSpawn(pu); return; }
  // Belt and braces for every other reason: the intro owns the camera until it
  // says otherwise. introActive() existed for exactly this and had no callers.
  if (camInstance && camInstance.introActive && camInstance.introActive()) {
    announcePowerUpSpawn(pu);
    return;
  }
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
  let token = null;
  const finishPokeIntro = () => {
    if (finished) return;
    finished = true;
    screens.dismissPokemonEncounterModal();
    // Identity-checked: this handler cancels ITS OWN cinematic and no other. A
    // bare cancel here would let a stale completion reach through and kill a
    // newer cutscene the queue had already started.
    if (c && c.skipPokemonSpawnCinematic) c.skipPokemonSpawnCinematic(token);
    pokeSpawnQueue.shift();
    if (pokeSpawnQueue.length > 0) {
      playNextPokemonSpawn();
    } else {
      isShowingPokeSpawn = false;
      state = prevState === 'powerup_encounter' ? 'playing' : prevState;
      if (sim && (sim.over || (typeof sim.timeLeft === 'number' && sim.timeLeft <= 0))) {
        if (isVoxelSandbox) endSandbox(); else endLevel();
      }
    }
  };

  // ARM BEFORE YOU ANNOUNCE. The presentation's completion callback cancels the
  // cinematic, so the cinematic has to exist before the presentation can run. If
  // the presentation ever completes synchronously — and showPokemonEncounterModal
  // did exactly that for months — the announce-first order makes the cancel run
  // before its own arm: it finds nothing to cancel, latches `finished`, and the
  // cinematic that is armed a line later is ORPHANED, seizing the camera for its
  // full 1.5 s with no path anywhere that can stop it. Ordering it this way makes
  // the function correct under BOTH contracts, which is the point: it must not
  // silently depend on the presentation being asynchronous again.
  // See .wiki/conventions.md, "arm before you announce".
  if (c && c.startPokemonSpawnCinematic) {
    token = c.startPokemonSpawnCinematic({
      dropX: pu.x,
      dropZ: pu.z,
      playerX: hX,
      playerZ: hZ,
      duration: 4.0,
      reducedMotion: save.settings.reducedMotion,
      onComplete: finishPokeIntro,
    });
  } else {
    setTimeout(finishPokeIntro, 4000);
  }

  screens.showPokemonEncounterModal({
    powerup: pu,
    onSkip: finishPokeIntro,
    reducedMotion: save.settings.reducedMotion,
  });
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
  let token = null;
  const finish = (skipped = false) => {
    if (finished) return;
    finished = true;

    // A skip reveals the completed visual state immediately; natural completion
    // leaves the fissure and its delayed collapses to finish in the live world.
    if (skipped && world && world.skipQuakeCinematic) world.skipQuakeCinematic();
    screens.dismissEarthquakeCinematic();
    if (skipped && cam && cam.skipEarthquakeCinematic) cam.skipEarthquakeCinematic(token);

    if (state === 'quake_cinematic') {
      state = previousState === 'quake_cinematic' ? 'playing' : previousState;
      accumulator = 0;
    }
    if (sim && (sim.over || (typeof sim.timeLeft === 'number' && sim.timeLeft <= 0))) {
      if (isVoxelSandbox) endSandbox(); else endLevel();
    }
  };

  controls?.cancelPointer();
  state = 'quake_cinematic';
  audio.playAnimeHitStop();
  // Arm before announce, same as playNextPokemonSpawn. This one works today only
  // because showEarthquakeCinematic is still a real asynchronous overlay; it is
  // one cleanup commit away from the identical failure, with 5.8 s of
  // uncancellable camera and eight hard-cut phases behind it.
  token = cam.startEarthquakeCinematic({
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
  screens.showEarthquakeCinematic({
    onSkip: () => finish(true),
    reducedMotion,
    duration,
  });
}

// Ground spawns already use the Pokemon encounter to announce themselves. This
// is the second half of that contract: on collection, pause the fixed-step
// world long enough for the Dragon Ball card to say what the earned power does.
// Fault Line Rupture owns its longer bespoke sequence and is intentionally
// excluded before this function is called.
function playPowerUpCollectCinematic(powerup) {
  if (!cam || !powerup || powerup.type === 'quake' || state !== 'playing') return;

  const prevState = state;
  state = 'powerup_pause';
  screens.showPowerUpShowcase(powerup, () => {
    state = prevState;
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
  musicOverride = null; // a new run always starts on its own theme
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
  'sydney': {
    label: 'SYDNEY: OPERA HOUSE AND CBD PROTOTYPE',
    hud: 'SYDNEY · THE LITTLE CITY VERTICAL SLICE',
    intro: { subtitle: 'SYDNEY' },
  },
  'auckland': {
    label: 'AUCKLAND: SKY TOWER AND THE WAITEMATĀ WHARVES',
    hud: 'AUCKLAND · THE HARBOUR AND THE CONES',
    intro: { subtitle: 'AUCKLAND' },
  },
  'singapore': {
    label: 'SINGAPORE: MARINA BAY AND THE GARDENS',
    hud: 'SINGAPORE · THE BAY AND THE SUPERTREES',
    intro: { subtitle: 'SINGAPORE' },
  },
  'hongkong': {
    label: 'HONG KONG: VICTORIA HARBOUR AND THE PEAK',
    hud: 'HONG KONG · BANK TOWERS & PEAK TRAM',
    intro: { subtitle: 'HONG KONG' },
  },
  'seoul': {
    label: 'SEOUL: HAN RIVER, GYEONGBOKGUNG AND N SEOUL TOWER',
    hud: 'SEOUL · N SEOUL TOWER & GYEONGBOKGUNG',
    intro: { subtitle: 'SEOUL' },
  },
  'beijing': {
    label: 'BEIJING: FORBIDDEN CITY, BIRD\'S NEST AND CCTV LOOP',
    hud: 'BEIJING · FORBIDDEN CITY & CCTV LOOP',
    intro: { subtitle: 'BEIJING' },
  },
  'bangkok': {
    label: 'BANGKOK: GRAND PALACE, WAT ARUN AND BTS SKYTRAIN',
    hud: 'BANGKOK · GRAND PALACE & WAT ARUN',
    intro: { subtitle: 'BANGKOK' },
  },
  'mumbai': {
    label: 'MUMBAI: GATEWAY OF INDIA, MARINE DRIVE AND VICTORIA TERMINUS',
    hud: 'MUMBAI · GATEWAY OF INDIA & MARINE DRIVE',
    intro: { subtitle: 'MUMBAI' },
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
  // Named and held rather than passed inline so the rejection has somewhere to
  // land: an `async` callback handed straight to requestAnimationFrame returns
  // its promise to nobody, so anything that throws below becomes an unhandled
  // rejection under a loading screen that never resolves. See failSceneLaunch.
  const buildSandbox = async () => {
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
    // ADR-0022 Bezier occlusion smoothing, scoped to The Lab first (owner
    // decision 2026-08-19): every other city keeps the legacy camera until it
    // has been felt here. Set BEFORE setBlockers so the first frame is already
    // on the flagged path.
    cam.setSmoothOcclusion(scene === 'gallery');
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
    const modeLabel = mode === 'run90' || mode === 'challenge90s'
      ? '90s RUN'
      : (mode === 'challenge3m' || mode === 'challenge' ? '3m CHALLENGE' : 'SANDBOX');
    const hudClock = sim.clockLimit ? sim.clockLimit / 60 : 90;
    hud.setLevel({ index: modeLabel, clock: hudClock }, hudLabel);
    hud.show();
    screens.clear();
    state = 'playing';
    musicOverride = null; // a new run always starts on its own theme
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
    const showTutorial = shouldShowTutorial(save, scene);
    if (showTutorial) {
      tutorialManager = new TutorialManager({
        save,
        scene,
        onSave: (s) => storeSave(s),
      });
    } else if (tutorialManager) {
      tutorialManager.unmount();
      tutorialManager = null;
    }

    const cityEntry = CITY_CATALOG.find((c) => c.scene === scene);
    if (authored && authored.intro) {
      // Arrival beat under the wide static overview; the gate's own downbeat
      // answers when the player starts the zoom.
      audio.countdownTick();
      readyGate = mountReadyGate({
        title: 'READY?',
        subtitle: authored.intro.subtitle,   // the pill is sized for one short word
        directive: cityEntry?.directive || '',
        transmission: cityEntry?.transmission || '',
        reducedMotion: save.settings.reducedMotion,
        showTutorialCards: showTutorial,
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
        title: 'READY?',
        subtitle: 'PROVING GROUND',
        directive: cityEntry?.directive || 'CALIBRATE VORTEX & INGEST STARTER SNACKS',
        transmission: cityEntry?.transmission || '',
        reducedMotion: save.settings.reducedMotion,
        showTutorialCards: showTutorial,
        onStart: () => { readyGate = null; audio.countdownGo(); cam.releaseIntro(); },
      });
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    buildSandbox().catch((err) => failSceneLaunch(scene, err, 'cities'));
  }));
}

// The recovery half of the unknown-scene guard in js/voxelsim.js. That
// constructor throws on a scene with no SCENE_IMPORTERS entry — a typo'd
// catalog row, a stale save naming a scene that has since been renamed, a city
// module that 404s — which is the correct loud failure, but the throw lands
// inside an async requestAnimationFrame callback. Uncaught, that is an
// unhandled promise rejection under a loading screen that never resolves:
// silent to the player and indistinguishable from a slow network. Trading
// "wrong map, looks fine" for "no map, looks broken and says nothing" is not
// the deal, so the failure is caught here and the player is put back on a live
// screen.
//
// Deliberately not an error-UI system: there is no message surface available on
// a menu screen — #toast lives inside #hud, which is hidden on every menu, and
// the multiplayer join-error modal is room-code-branded. The console line is
// the diagnostic channel and the navigation is the player-facing one.
function failSceneLaunch(scene, err, returnTo = 'cities') {
  console.error(
    `Flywheel: cannot launch scene '${scene}' — the world was not built, so the ` +
    'player has been returned to the menu rather than left on the loading screen.',
    err,
  );
  // The throw can land AFTER teardownWorld() and after the sandbox flags are
  // set, so recovery has to unwind them by hand. Leaving mode-sandbox on the
  // body restyles the next menu, and leaving isVoxelSandbox true tells the
  // frame loop a world exists that teardownWorld has already disposed.
  isVoxelSandbox = false;
  document.body.classList.remove('mode-sandbox');
  rankedRun = null;   // never assigned on this path; would otherwise be the last run's buffer
  teardownWorld();
  hud.hide();
  if (returnTo === 'title') {
    backToTitle();
  } else {
    state = 'menu';
    screens.showCitySelect();
  }
}

function teardownWorld() {
  // The menu backdrop owns the same canvas a game world is about to claim, so
  // it goes first and it goes here — this is the one function both start paths
  // call before constructing anything.
  stopMenuScene();
  screens.dismissPokemonEncounterModal();
  screens.dismissEarthquakeCinematic();
  pokeSpawnQueue = [];
  isShowingPokeSpawn = false;
  if (readyGate) { readyGate.dismiss(); readyGate = null; }
  if (tutorialManager) { tutorialManager.unmount(); tutorialManager = null; }
  if (world) { world.dispose(); world = null; }
  if (mpHost) { mpHost.destroy(); mpHost = null; }
  if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
  if (mpUI) { mpUI.hideRespawnOverlay(); }
  isMultiplayer = false;
  mpIsHost = false;
  sim = null;
  audio.stopScene();   // a level teardown silences the city bed with the city
}


// One construction site for the multiplayer UI. It used to be copy-pasted into
// each of the three entry points, which is how a fourth entry point ends up with
// a subtly different set of callbacks.
function ensureMultiplayerUI() {
  if (!mpUI) {
    mpUI = new MultiplayerUI({
      rootElement: document.getElementById('screen-root'),
      audio,
      onHostCreate: (opts) => hostMultiplayerLobby(opts),
      onPeerJoin: (code, playerName) => joinMultiplayerLobby(code, playerName),
      onLeaveLobby: () => {
        if (mpLobby) { mpLobby.destroy(); mpLobby = null; }
        teardownWorld();
        backToTitle();
      },
    });
  }
  return mpUI;
}

function showMultiplayerHostModal() {
  screens.clear();
  stopMenuScene();
  ensureMultiplayerUI();
  mpUI.showHostCreateModal({
    // Every player has a name from their first frame (js/save.js), so the
    // multiplayer prompts arrive pre-filled instead of demanding one. There is
    // no 'Host' and no 'Player_417' fallback any more: those were three
    // different answers to the question the save already answers once.
    defaultName: playerName(save),
    onCancel: () => {
      screens.showTitle();
    },
    onCreate: ({ scene, maxPlayers }) => {
      hostMultiplayerLobby({ scene, maxPlayers });
    },
    onJoin: ({ code, playerName }) => {
      joinMultiplayerLobby(code, playerName);
    },
  });
}

function hostMultiplayerLobby({ scene = 'gallery', maxPlayers = 4 }) {
  screens.clear();
  stopMenuScene();
  const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  const channel = new LiveBroadcastChannel(roomCode, 'host');
  const hostName = playerName(save);
  const playerSkin = equippedSkinId();

  ensureMultiplayerUI();

  mpLobby = new MultiplayerLobby({
    channel,
    isHost: true,
    playerName: hostName,
    playerSkin,
    scene,
    maxPlayers,
    roomCode,
  });

  mpUI.showLobby(mpLobby, {
    onLeave: () => {
      // Announce, THEN close the socket: closing it is what makes presence tell
      // the room, and a room that is never told keeps the seat occupied forever.
      if (mpLobby) { mpLobby.leave('LEFT'); mpLobby.destroy(); mpLobby = null; }
      channel.close();
      screens.showTitle();
    },
    onForceStart: () => {
      // Handled by mpLobby.startCountdown()
    },
  });

  mpLobby.onGameStart = (startMsg) => {
    startMultiplayerMatch({
      isHost: true,
      scene: startMsg.scene,
      matchSeed: startMsg.matchSeed,
      durationSeconds: startMsg.durationSeconds,
      // The FULL slot-indexed roster, empty slots and all. Compacting it here
      // put a slot-3 player at array index 2, which made `sim.holes[3]`
      // undefined and silently fell back to holes[0] - that peer then steered
      // the host's hole. See js/multiplayer/roster.js.
      players: mpLobby.players.slice(),
      mySlot: 0,
      channel,
    });
  };
}

function joinMultiplayerLobby(roomCode, chosenName = null) {
  screens.clear();
  stopMenuScene();
  const code = String(roomCode || '').toUpperCase();
  ensureMultiplayerUI();

  // REQ-MP-05: an invite link lands here with no name, and the player was simply
  // assigned one (Player_417). Ask first — pre-filled from the saved profile, so
  // a returning player taps straight through rather than retyping.
  if (chosenName === null || chosenName === undefined) {
    mpUI.showJoinNamePrompt({
      roomCode: code,
      defaultName: playerName(save),
      onConfirm: (name) => joinMultiplayerLobby(code, name),
      onCancel: () => { backToTitle(); },
    });
    return;
  }

  const senderId = 'peer_' + Math.random().toString(36).substring(2, 7);
  const channel = new LiveBroadcastChannel(code, senderId);
  const peerName = String(chosenName).trim() || playerName(save);
  const playerSkin = equippedSkinId();

  // A full room answers the JOIN_REQUEST from inside the constructor below, so
  // `joiningLobby` is still null at that moment — whichever of the two paths can
  // actually see the failed lobby is the one that releases it.
  let joiningLobby = null;
  const releaseJoin = () => {
    if (joiningLobby) {
      if (mpLobby === joiningLobby) mpLobby = null;
      joiningLobby.destroy();
      joiningLobby = null;
    }
    channel.close();
  };

  joiningLobby = new MultiplayerLobby({
    channel,
    isHost: false,
    playerName: peerName,
    playerSkin,
    roomCode: code,
    // Constructor-supplied rather than assigned afterwards, for the reason above.
    onJoinRejected: (reason) => {
      releaseJoin();
      mpUI.showJoinError({
        reason,
        roomCode: code,
        onRetry: () => showMultiplayerHostModal(),
        onBack: () => { backToTitle(); },
      });
    },
  });
  mpLobby = joiningLobby;

  // Rejected during construction: the error screen is already up and only the
  // lobby object itself is still to be released.
  if (joiningLobby.joinRejectedReason) {
    releaseJoin();
    return;
  }

  mpUI.showLobby(mpLobby, {
    onLeave: () => {
      // Announce, THEN close the socket — see the host path above.
      if (mpLobby) { mpLobby.leave('LEFT'); mpLobby.destroy(); mpLobby = null; }
      channel.close();
      screens.showTitle();
    },
  });

  // The host abandoning the room is terminal for a peer: no roster, no
  // countdown and no GAME_START will ever arrive again, and the room code still
  // looks perfectly valid. Say so instead of leaving them on "Waiting...".
  mpLobby.onHostLeft = () => {
    releaseJoin();
    mpUI.showJoinError({
      reason: 'HOST_LEFT',
      roomCode: code,
      onRetry: () => showMultiplayerHostModal(),
      onBack: () => { backToTitle(); },
    });
  };

  mpLobby.onGameStart = (startMsg) => {
    startMultiplayerMatch({
      isHost: false,
      scene: startMsg.scene,
      matchSeed: startMsg.matchSeed,
      durationSeconds: startMsg.durationSeconds,
      // The FULL slot-indexed roster, empty slots and all. Compacting it here
      // put a slot-3 player at array index 2, which made `sim.holes[3]`
      // undefined and silently fell back to holes[0] - that peer then steered
      // the host's hole. See js/multiplayer/roster.js.
      players: mpLobby.players.slice(),
      mySlot: mpLobby.mySlot >= 0 ? mpLobby.mySlot : 1,
      channel,
    });
  };
}

function startMultiplayerMatch({ isHost, scene, matchSeed, durationSeconds = 180, players, mySlot, channel }) {
  screens.showLoading('MULTIPLAYER · ' + scene.toUpperCase());
  // Same rejection-has-nowhere-to-land shape as startVoxelSandbox; here the
  // scene id arrives off the wire in the host's GAME_START message, so an
  // unknown one is remote input rather than a local typo.
  const buildMatch = async () => {
    await loadScene(scene);
    teardownWorld();  // clears mpIsHost, so publish the role AFTER it
    isMultiplayer = true;
    mpIsHost = Boolean(isHost);
    isVoxelSandbox = true;
    document.body.classList.add('mode-sandbox');
    computeShopBonus();

    if (isHost) {
      mpHost = new MultiplayerHost({
        channel,
        scene,
        matchSeed,
        players,
        durationSeconds,
      });
      sim = mpHost.sim;
      mpHost.onGameOver = (gameOverData) => {
        if (state === 'results') return;
        state = 'results';
        hud.hide();
        screens.clear();
        audio.setMusicCue('victory');
        const earned = (sim.localHole && typeof sim.localHole.coins === 'number') ? sim.localHole.coins : 0;
        if (earned > 0) {
          save.coins = (save.coins || 0) + earned;
          storeSave(save);
        }
        mpUI.showMultiplayerPodium(gameOverData, {
          localSlot: sim.localSlot ?? 0,
          onPlayAgain: () => {
            if (mpHost) { mpHost.destroy(); mpHost = null; }
            if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
            // Closing the socket is what tells the room this client is gone;
            // leaving it open keeps a ghost in every other player's roster.
            channel.close();
            teardownWorld();
            screens.clear();
            mpUI.clear();
            hostMultiplayerLobby({ scene, maxPlayers: players.length });
          },
          onExit: () => {
            if (mpHost) { mpHost.destroy(); mpHost = null; }
            if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
            // Closing the socket is what tells the room this client is gone;
            // leaving it open keeps a ghost in every other player's roster.
            channel.close();
            teardownWorld();
            screens.clear();
            mpUI.clear();
            backToTitle();
          },
        });
      };
    } else {
      mpPeer = new MultiplayerPeer({
        channel,
        scene,
        matchSeed,
        players,
        mySlot,
        durationSeconds,
      });
      sim = mpPeer.sim;
      mpPeer.onGameOver = (gameOverData) => {
        if (state === 'results') return;
        state = 'results';
        hud.hide();
        screens.clear();
        audio.setMusicCue('victory');
        const earned = (sim.localHole && typeof sim.localHole.coins === 'number') ? sim.localHole.coins : 0;
        if (earned > 0) {
          save.coins = (save.coins || 0) + earned;
          storeSave(save);
        }
        mpUI.showMultiplayerPodium(gameOverData, {
          localSlot: sim.localSlot ?? mySlot,
          onPlayAgain: () => {
            if (mpHost) { mpHost.destroy(); mpHost = null; }
            if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
            // Closing the socket is what tells the room this client is gone;
            // leaving it open keeps a ghost in every other player's roster.
            channel.close();
            teardownWorld();
            screens.clear();
            mpUI.clear();
            screens.showTitle();
          },
          onExit: () => {
            if (mpHost) { mpHost.destroy(); mpHost = null; }
            if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
            // Closing the socket is what tells the room this client is gone;
            // leaving it open keeps a ghost in every other player's roster.
            channel.close();
            teardownWorld();
            screens.clear();
            mpUI.clear();
            backToTitle();
          },
        });
      };
    }

    window.__sim = sim;
    world = new VoxelWorld3D(canvas, sim, equippedSkinId(), { indicatorId: equippedIndicatorId() });
    if (world && world.setReducedMotion) world.setReducedMotion(save.settings.reducedMotion);

    cam = new ChaseCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    cam.distScale = save.settings.camDist;
    cam.setReducedMotion(save.settings.reducedMotion);
    hud.setReducedMotion(save.settings.reducedMotion);
    hud.resetSandboxMeters();
    cam.setFollowDirection(true);
    cam.setSmoothOcclusion(scene === 'gallery'); // ADR-0022, The Lab only (see startVoxelSandbox)
    cam.setBlockers(sim.cameraBlockers);
    // Instant snap to local hole spawn to eliminate spawn swoop and shake
    const spawnHole = sim.localHole;
    if (spawnHole) {
      cam.target.set(spawnHole.x, 0, spawnHole.z);
      cam.smoothTarget.set(spawnHole.x, 0, spawnHole.z);
      cam.lastHoleX = spawnHole.x;
      cam.lastHoleZ = spawnHole.z;
    }
    cam.shakeIntensity = 0;

    controls = controls || new Controls(canvas);
    controls.settings = save.settings;
    controls.chaseMode = true;
    controls.setCamera(cam.camera);
    controls.heading = null;
    cam.setSandboxSizeProgress(0);
    controls.setSandboxSizeProgress(0);

    resize();
    hud.setLevel({ index: 'MULTIPLAYER', clock: durationSeconds }, 'MULTIPLAYER');
    hud.show();
    screens.clear();
    state = 'playing';
    musicOverride = null; // a new match always starts on the scene's own theme
    activePlayMusicCue = scene;
    audio.setMusicCue(activePlayMusicCue, { restart: true });
    accumulator = 0;
    lastTs = performance.now();
    audio.startScene(scene);

    if (mpLobby) {
      mpLobby.destroy();
      mpLobby = null;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // 'title', not 'cities' — do NOT unify these two paths for consistency.
    // They are different failures with different right answers. A sandbox
    // launch comes FROM City Select, so returning there puts the player back
    // where they were; a match comes from a lobby, so City Select would offer
    // them a single-player launch they never asked for. The scene id here also
    // arrives off the wire in the host's GAME_START message — remote input,
    // not a local typo or a stale save.
    buildMatch().catch((err) => failSceneLaunch(scene, err, 'title'));
  }));
}

function endLevel() {
  state = 'results';
  hud.hide();
  const won = sim.won;
  if (won) audio.win(); else audio.lose();
  const elapsed = typeof sim.elapsedTime === 'number' ? sim.elapsedTime : Math.max(0, (level.time || 300) - (sim.timeLeft || 0));
  screens.showResults(level, sim, (stars, coins, navAction) => {
    recordLevelResult(save, level.index, {
      stars, mass: sim.player.mass, bestCombo: sim.player.bestCombo,
      won, coinsEarned: coins, elapsed,
    });
    if (navAction === 'menu') {
      teardownWorld(); backToTitle();
    } else if (navAction === 'cities' || navAction === 'map' || navAction === true) {
      teardownWorld(); state = 'menu'; screens.showCitySelect();
    } else if (won && level.index < 100) {
      level = getLevel(level.index + 1); screens.actions.play(level);
    } else {
      startLevel();
    }
  });
}

// ------------------------------------------------------------------ loop
const FIXED_DT = 1 / 60;

function frame(ts) {
  // The handle is kept so the visibility listener can genuinely STOP the loop
  // rather than leave a throttled one running in a hidden tab. Re-armed first,
  // as it always was, so a throw anywhere below cannot kill the game loop.
  loopHandle = requestAnimationFrame(frame);
  // The frame delta, clamped at BOTH ends. Math.min alone caps the ceiling and
  // leaves the floor open, and a NEGATIVE delta is not a theoretical case: three
  // handlers used to rewrite `lastTs = performance.now()` from inside the event
  // loop, AFTER the line below had already advanced lastTs in the same frame,
  // which can only under-measure the next delta. Measured at -6.246 s on a
  // Brooklyn start taken across a multi-second build block. It drove a cinematic's
  // clock backwards (pinning it in phase 0 for the whole READY hold with shake
  // stuck at its cap) and turned `_fovKick *= Math.max(0, 1 - dt * 6)` into a
  // multiply by 38.2, for a field of view of 344 degrees. Those rewrites are gone;
  // the floor stays, because the class of bug is "something moved the clock" and
  // the next one will not announce itself. Kept on one line with rawDt so the
  // derivation reads as the single expression it is.
  const rawDt = (ts - lastTs) / 1000 || 0;
  const realDt = Math.max(0, Math.min(0.1, rawDt));
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
      const sizeT = sandboxSizeProgress(sim.localHole.size, sim.localHole.sizeFrac);
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
      : controls.getMove(cam.yaw, undefined, isVoxelSandbox ? sim.localHole : sim.player);
    // The steering heading rides on the hole for the renderer: directional
    // skins and bite bearings read it there (skins.js, world _skinFrame).
    // Neither sim ever does — it is presentational state, not gameplay state.
    const driveHole = isVoxelSandbox ? sim.localHole : sim.player;
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
      if (isMultiplayer) {
        if (mpHost) {
          mpHost.step(FIXED_DT, move);
          mpHost.sendStateSync();
        } else if (mpPeer) {
          mpPeer.sendInput(move);
          mpPeer.step(FIXED_DT, move);
        }
        const myHole = sim.localHole;
        if (myHole) {
          if (myHole.alive === false) {
            mpUI.showRespawnOverlay(myHole.respawnTimer);
          } else {
            mpUI.hideRespawnOverlay();
          }
        }
      } else {
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
      }
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
      audio.updateListener(sim.localHole.x, sim.localHole.z, sim.moverSim);
      for (const ev of events) {
        const isLocalHole = !isMultiplayer || ev.hole === sim.localHole || (ev.hole && ev.hole.slot === (sim.localSlot ?? 0));
        // Every sim event gets its voice: gulps, combo ladder, SIZE stings,
        // milestones, tiered collapses, the derailment. This line was deleted by
        // 8c3c85d while isLocalHole above was being introduced in its place, and
        // the city ran silent for a day because the only other caller sits in the
        // legacy branch below. See .wiki/findings/RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md
        //
        // THREE scopes, not two. `ev.hole == null` IS the world-event marker: a
        // tornado, a derailment, a collapse or a power-up spawning belongs to
        // everybody in the match, and gating those on hole ownership is what
        // would leave them silent — isLocalHole is false whenever there is no
        // hole to own. The fault-line quake is the exception in the other
        // direction: it is hole-scoped, but its consequences (`crash`) are not,
        // so muting a rival's rumble under audible collapses would give the
        // player the consequence without the cause. Rivals get it quiet.
        // Single player is unaffected: `!isMultiplayer` short-circuits true.
        if (!ev.hole || isLocalHole) audio.handleEvent(ev);
        else if (ev.type === 'quake') audio.handleEvent(ev, { quiet: true });

        if (tutorialManager) {
          if (ev.type === 'eat' && isLocalHole) tutorialManager.onEat(ev.obj);
          else if (ev.type === 'growth' && isLocalHole) tutorialManager.onSizeUp(ev.size);
          else if (ev.type === 'combo' && isLocalHole) tutorialManager.onCombo(ev.level);
          else if (ev.type === 'crash') tutorialManager.onCollapse();
          else if (ev.type === 'powerup_spawn') tutorialManager.onPowerUpSpawn(ev.powerup?.type);
          else if (ev.type === 'powerup_collect' && isLocalHole) tutorialManager.onPowerUpCollected(ev.powerup?.type);
        }

        if (ev.type === 'combo') {

          if (isLocalHole) {
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
          }
        } else if (ev.type === 'crash') {
          if (isLocalHole) cam.triggerShake(Math.min(0.6, 0.1 + ev.size * 0.02));
        } else if (ev.type === 'growth') {
          // SIZE level-up: sting (GameAudio), shake, FOV punch, confetti, center-screen big pop
          world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius, 0xffd23f, ev.size);
          if (isLocalHole) {
            cam.triggerShake(0.4);
            cam.fovKick(7);
            hud.announce({
              text: `SIZE ${ev.size}!`,
              sub: '✦ EXPANDING VORTEX ✦',
              tier: 'size',
              source: 'size',
              priority: ANN.SIZE,
              ms: 1300,
              channel: 'pop',
            });
          }
        } else if (ev.type === 'milestone') {
          // Consumption: the widest thing in the mix. GameAudio scales the
          // fanfare by tier; the screen answers with the full-width band.
          const loud = ev.tier === 'roar';
          if (loud) {
            if (isLocalHole) cam.fovKick(8);
            world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius * 1.3, 0xff7700, 8);
          }
          world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * (loud ? 1.6 : 1.2), loud ? 0xffffff : 0xffd23f);
          if (isLocalHole) {
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
          }
        } else if (ev.type === 'coin') {
          world.spawnGoldenSparkles(ev.hole.x, ev.hole.z, ev.hole.radius, 16);
          if (isLocalHole) {
            hud.announce({ text: `COIN! +${ev.value}`, source: 'coin', priority: ANN.COIN, ms: 700 });
            triggerHaptic(15);
            // No audio.playCoin() here: the pump above already reached
            // handleEvent's `case 'coin'`, and calling it again doubles the chime.
          }
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
          // The collect fanfare comes from the pump above (handleEvent's
          // `case 'powerup_collect'`). It used to be called here unconditionally,
          // which also meant a RIVAL's pickup was audible at full level in a
          // match; it is local-only now, which is the isolation 8c3c85d intended.
          if (!isMultiplayer) {
            const isQuake = ev.powerup.type === 'quake' || (ev.powerup.spec && ev.powerup.spec.id === 'quake');
            const isChrono = ev.powerup.type === 'chrono' || (ev.powerup.spec && ev.powerup.spec.id === 'chrono');
            // Chrono stays: handleEvent has no chrono voice on the collect path.
            if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });
            if (isQuake) {
              // No audio.playFaultLineQuake() here: the fault-line effect emits
              // its own `quake` event, which the pump voices with the same
              // master plus the ducking. Calling it here too played it twice.
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
          } else {
            // Multiplayer: only trigger lightweight non-blocking announcement if the local player collected it
            const isMyHole = ev.hole === sim.localHole || (ev.hole && ev.hole.slot === (sim.localSlot ?? 0));
            if (isMyHole) {
              const spec = ev.powerup.spec || {};
              hud.announce({
                text: `${spec.icon || '⚡'} ${spec.name || 'POWER-UP'}!`,
                sub: spec.tagline ? `✦ ${spec.tagline.toUpperCase()} ✦` : '✦ BUFF ACTIVATED ✦',
                source: 'powerup',
                tier: 'powerup',
                priority: ANN.SIZE,
                ms: 2200,
                channel: 'band',
              });
              triggerHaptic(50);
            }
          }
        } else if (ev.type === 'powerup_spawn') {
          if (!isMultiplayer) queuePokemonSpawnIntro(ev.powerup, sim, cam, ev.reason);
        } else if (ev.type === 'disaster') {
          if (!isMultiplayer) cam.triggerShake(1.2);
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
          if (!isMultiplayer) cam.triggerShake(1.5);
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
          if (!isMultiplayer) {
            triggerHaptic(75);
            playEarthquakeCinematic(ev);
          }
        } else if (ev.type === 'pvp_kill') {
          const mySlot = sim.localSlot ?? 0;
          const isLocalKiller = ev.killerSlot === mySlot;
          const isLocalVictim = ev.victimSlot === mySlot;
          if (isLocalKiller) {
            cam.triggerShake(0.6);
            cam.fovKick(8);
            world.spawnBurst(ev.killer.x, ev.killer.z, ev.killer.radius * 1.5, 0xff0054, 16);
            world.spawnShockRing(ev.killer.x, ev.killer.z, ev.killer.radius * 2.0, 0xffffff);
            hud.announce({
              text: `RIVAL SWALLOWED! +${Math.round(ev.awardMass)} MASS`,
              sub: '✦ PVP TAKEDOWN ✦',
              tier: 'roar',
              source: 'pvp',
              priority: ANN.SIZE + 3,
              ms: 2500,
              channel: 'band',
            });
            if (audio.playPowerUpCollect) audio.playPowerUpCollect();
          } else if (isLocalVictim) {
            cam.triggerShake(1.2);
            world.spawnBurst(ev.victim.x, ev.victim.z, ev.victim.radius * 1.5, 0xff0054, 12);
          }
        } else if (ev.type === 'pvp_respawn') {
          world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius * 1.5, 0x00f0ff, 10);
          world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * 2.0, 0x00f0ff);
        }
      }
      // to eats, SIZE-ups and consumption milestones.
      world.update(realDt, events);
      const hole = sim.localHole;
      // orbitHeld, not just the orbit delta: a touch-drag finger that has
      // stopped moving emits no delta and would otherwise let the camera's
      // recentre grace expire underneath it. See Controls.orbitHeld.
      cam.update(realDt, hole.x, hole.z, hole.radius, orbit, zoom, controls.orbitHeld, controls.heading);
      world.render(cam.camera);
      hud.updateSandbox(sim);
      // A fault line can clear the final blocks in the same fixed step. Keep
      // its presentation readable; the next playing frame opens results once
      // the cinematic releases the state hold.
      if (sim.over || (typeof sim.timeLeft === 'number' && sim.timeLeft <= 0)) {
        if (state !== 'quake_cinematic' && state !== 'powerup_pause' && state !== 'powerup_encounter') {
          if (isMultiplayer) {
            if (mpIsHost && mpHost && !mpHost.over) {
              mpHost.finishMatch(sim.won ? 'CITY_CLEARED' : 'TIME_EXPIRED');
            }
          } else {
            endSandbox();
          }
        }
      }
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
          queuePokemonSpawnIntro(ev.powerup, sim, cam, ev.reason);
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
      if (sim.over || (typeof sim.timeLeft === 'number' && sim.timeLeft <= 0)) {
        if (state !== 'quake_cinematic' && state !== 'powerup_pause' && state !== 'powerup_encounter') {
          endLevel();
        }
      }
    }
  } else if ((state === 'quake_cinematic' || state === 'powerup_pause' || state === 'powerup_encounter') && world && cam) {
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
      if (toCities) { teardownWorld(); backToTitle(); }
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
  screens.showSandboxResults(finished, (action, coins) => {
    if (finished.isChallenge || finished.mode === 'challenge3m' || finished.mode === 'challenge' || finished.mode === 'challenge90s') {
      recordChallengeResult(save, finished.scene, {
        mode: finished.mode,
        coinsEarned: coins, elapsed: finished.time,
        bestCombo: finished.hole.bestCombo, score: finished.hole.mass,
        won: finished.won,
        percent: finished.totalMass ? finished.hole.rawMass / finished.totalMass : 0,
      });
    } else {
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
    }
    if (action === 'menu') {
      teardownWorld(); backToTitle();
    } else if (action === 'cities' || action === 'map' || action === true) {
      teardownWorld(); state = 'menu'; screens.showCitySelect();
    } else {
      startVoxelSandbox(finished.scene, finished.mode);
    }
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
    // The tab going away may be the last moment this device is online: push
    // whatever the save owes the account now (paused is not playing, so a
    // level's mid-run state is untouched — only the save leaves).
    void Promise.resolve(flushSync(save)).catch(() => {});
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
  // Sync the emoji: the button is hardcoded 🔊 in index.html and was never
  // updated on toggle, so muting showed 🔊 forever. (ADR-0020)
  document.getElementById('btn-mute').textContent = save.muted ? '🔇' : '🔊';
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
    audio.setMusicCue(playCue());
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
  const bootSplash = document.getElementById('boot-splash');
  if (bootSplash) {
    bootSplash.style.cursor = 'pointer';
    const dismiss = () => {
      earlyUnlock();
      if (!bootSplash.classList.contains('fade-out')) {
        bootSplash.classList.add('fade-out');
        setTimeout(() => {
          if (bootSplash.parentNode) bootSplash.remove();
        }, 450);
      }
    };
    bootSplash.addEventListener('pointerdown', dismiss, { once: true });
    bootSplash.addEventListener('click', dismiss, { once: true });
  }
  setTimeout(() => {
    if (bootSplash && bootSplash.parentNode && !bootSplash.classList.contains('fade-out')) {
      bootSplash.classList.add('fade-out');
      setTimeout(() => {
        if (bootSplash.parentNode) bootSplash.remove();
      }, 450);
    }
  }, 1400);
}

// Start menu scene immediately on cold boot with onReady hook
startMenuScene(canvas, {
  settings: save.settings,
  skinId: equippedSkinId(),
  immediate: true,
  onReady: finishBootSplash,
});

// Fallback safety timeout so boot splash never gets stuck
// Check for invite link parameter (?room=CODE or ?join=CODE)
const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
const roomParam = urlParams ? (urlParams.get('room') || urlParams.get('join')) : null;

if (roomParam) {
  joinMultiplayerLobby(roomParam.trim().toUpperCase());
} else {
  screens.showTitle();
}

resize();
requestAnimationFrame((ts) => { lastTs = ts; loopHandle = requestAnimationFrame(frame); });
