// Boot + screen state machine + game loop glue.

import { Sim } from './sim.js';
import { VoxelSandboxSim, sandboxSizeProgress } from './voxelsim.js';
import { getLevel, METROS } from './levels.js';
import { loadSave, storeSave, recordLevelResult, recordSandboxResult, isLevelUnlocked } from './save.js';
import { World3D } from './world3d.js';
import { VoxelWorld3D } from './voxelworld.js';
import { ChaseCamera } from './camera.js';
import { Controls } from './controls.js';
import { HUD, ANN } from './ui/hud.js';
import { Screens, SKINS, INDICATOR_SKINS } from './ui/screens.js';
import { mountReadyGate } from './ui/ready.js';
import { TIERS } from './quality.js';

import { GameAudio } from './audio/game-audio.js';
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_SFX_VOLUME, reseedAudioMix } from './audio/mix.js';

const canvas = document.getElementById('game-canvas');
const hud = new HUD();
window.__hud = hud; // debug/smoke-test hook, same idiom as __sim / __cam / __controls
const save = loadSave();

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
if (mix.reseeded && save.settings
  && (save.settings.sfxVol !== mix.sfxVol || save.settings.ambVol !== mix.ambVol)) {
  save.settings.sfxVol = mix.sfxVol;
  save.settings.ambVol = mix.ambVol;
  storeSave(save);
}

const audio = new GameAudio().init();
window.__audio = audio; // debug hook, same idiom as scene-view.html
audio.setMuted(save.muted);
audio.setVolume(save.settings && typeof save.settings.sfxVol === 'number' ? save.settings.sfxVol : DEFAULT_SFX_VOLUME);
audio.setAmbienceVolume(save.settings && typeof save.settings.ambVol === 'number' ? save.settings.ambVol : DEFAULT_AMBIENCE_VOLUME);

// ------------------------------------------------------------------ game state
let state = 'menu'; // menu | intro | playing | paused | results
let isVoxelSandbox = false;
let level = null;
let sim = null;
let world = null;
let cam = null;
let controls = null;
let readyGate = null; // live mountReadyGate handle, so teardown can dismiss it
let lastSandboxScene = 'gallery'; // for pause-menu RESTART in the sandbox
let activePlayMusicCue = 'gallery'; // owner decision: gallery stays music-free
let accumulator = 0;
let lastTs = 0;
let shopBonus = { clock: 0, growth: 0 };

// ------------------------------------------------------------------ quality tier
// Two tiers, and the player picks one. Nothing here classifies the device and
// nothing watches frame times: full graphics or not is the whole contract.
// HIGH is the default, so an untouched settings screen ships the pre-tier sim.
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

// The player's setting is the only authority. Anything unexpected — a key from
// a hand-edited save, a value from a build that had more tiers — reads as HIGH
// rather than as nothing, so a bad string can never leave the game untiered.
function wantedTier() {
  return save.settings && save.settings.quality === 'low' ? 'low' : 'high';
}

// Push the current tier at both halves of the engine. Idempotent — every setter
// it calls returns early when nothing changed — so it is safe to call from
// applySettings, from level start, and from the debug hook.
function applyQuality() {
  const spec = TIERS[tierName] || TIERS.high;
  if (world && world.setQuality) world.setQuality(spec);
  if (sim && sim.tune) {
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
    if (isVoxelSandbox) startVoxelSandbox(lastSandboxScene);
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
  equip(id) {
    save.equippedSkin = id;
    storeSave(save);
  },
  equipIndicator(id) {
    save.equippedIndicator = id;
    storeSave(save);
  },
  toggleMute() { save.muted = !save.muted; storeSave(save); audio.setMuted(save.muted); },
  music(cue, opts) { audio.setMusicCue(cue, opts); },
  musicVolume() { return audio.musicVolume; },
  setMusicVolume(v) { audio.setMusicVolume(v); },
  ambienceVolume() { return audio.ambienceVolume; },
  setAmbienceVolume(v) { audio.setAmbienceVolume(v); },
  applySettings() {
    storeSave(save);
    audio.setVolume(typeof save.settings.sfxVol === 'number' ? save.settings.sfxVol : DEFAULT_SFX_VOLUME);
    audio.setAmbienceVolume(typeof save.settings.ambVol === 'number' ? save.settings.ambVol : DEFAULT_AMBIENCE_VOLUME);
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

// Dev voxel tuning sliders → the running sandbox sim (no-op elsewhere).
function applyVoxTuning() {
  if (!sim || !sim.tune) return;
  const st = save.settings;
  sim.tune.gravity = st.voxGravity;
  sim.tune.waveK = st.voxWaveK;
  sim.tune.creak = st.voxCreak;
  sim.tune.speed = st.voxSpeed;
  sim.tune.attract = st.voxAttract;
  sim.tune.perfMode = !!st.perfMode;
}

function startLevel() {
  teardownWorld();
  isVoxelSandbox = false;
  document.body.classList.remove('mode-sandbox');
  computeShopBonus();
  const lvl = { ...level, clock: level.clock + shopBonus.clock };
  sim = new Sim(lvl, { growthBonus: shopBonus.growth });
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
  activePlayMusicCue = 'gallery';
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
};

function startVoxelSandbox(scene = 'gallery') {
  lastSandboxScene = scene;
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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    teardownWorld();
    isVoxelSandbox = true;
    // Scopes the sandbox HUD hierarchy rules in main.css (coin pill dimmed,
    // goal readout loud) without touching the campaign countdown styling.
    document.body.classList.add('mode-sandbox');
    sim = new VoxelSandboxSim({ scene });
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
    applyVoxTuning(); // dev sliders from the save
    // After the sim and the renderer both exist, and after applyVoxTuning —
    // which writes the whole `tune` object's dev half and would otherwise be
    // the last word on it.
    startQuality();
    resize();
    hud.setLevel({ index: 'SANDBOX', clock: 999 }, hudLabel);
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
  requestAnimationFrame(frame);
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
      sim.step(FIXED_DT, move);
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
          // The combo track's OWN vocabulary: a bright tick rising with the
          // level (GameAudio), and a fast concentric pulse from the meter itself.
          // Never a screen phrase — those belong to consumption, which fires a
          // handful of times a level where this fires every few seconds.
          hud.pulseCombo();
          // Chatter damping (js/skins.js calls it that, for the same reason):
          // levels 1-4 cross every 7-10 s on a measured route, so they get a
          // tick and a meter change and nothing that costs a particle. Only the
          // rare steps are allowed to spend the screen.
          if (ev.level >= 5) {
            world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius, ev.top ? 0xff2d1f : 0xffd23f);
            if (!save.settings.reducedMotion) cam.triggerShake(ev.top ? 0.35 : 0.2);
          }
        } else if (ev.type === 'crash') {
          cam.triggerShake(Math.min(0.6, 0.1 + ev.size * 0.02));
        } else if (ev.type === 'growth') {
          // SIZE level-up: sting (GameAudio), shake, FOV punch, confetti, big pop
          cam.triggerShake(0.4);
          cam.fovKick(7);
          world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius, 0xffd23f);
          hud.announce({ text: `SIZE ${ev.size}!`, source: 'size', priority: ANN.SIZE, ms: 1200, channel: 'pop' });
        } else if (ev.type === 'milestone') {
          // Consumption: the widest thing in the mix. GameAudio scales the
          // fanfare by tier; the screen answers with the full-width band.
          const loud = ev.tier === 'roar';
          if (loud) {
            cam.fovKick(8);
            world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * 1.5, 0xffffff);
          }
          hud.announce({
            text: ev.text, tier: ev.tier, source: 'milestone',
            priority: ANN.MILESTONE, ms: 2000, channel: 'band',
          });
        } else if (ev.type === 'coin') {
          hud.announce({ text: `COIN! +${ev.value}`, source: 'coin', priority: ANN.COIN, ms: 700 });
        }
        // 'goal' needs no branch: GameAudio plays the sting, and the milestone
        // ladder's last row (fired one event earlier) is the screen's beat.
      }
      // The sandbox used to drop the event stream on the floor here — nothing
      // downstream of the renderer wanted it. The equipped skin does: it reacts
      // to eats, SIZE-ups and consumption milestones.
      world.update(realDt, events);
      const hole = sim.hole;
      // orbitHeld, not just the orbit delta: a touch-drag finger that has
      // stopped moving emits no delta and would otherwise let the camera's
      // recentre grace expire underneath it. See Controls.orbitHeld.
      cam.update(realDt, hole.x, hole.z, hole.radius, orbit, zoom, controls.orbitHeld, controls.heading);
      world.render(cam.camera);
      hud.updateSandbox(sim);
      if (sim.over) endSandbox();
    } else {
      audio.updateListener(sim.player.x, sim.player.z, null);
      for (const ev of events) {
        if (ev.type === 'eat') {
          // Only the player's own mouth is mic'd; rival holes chew in silence.
          if (ev.hole.isPlayer) {
            audio.handleEvent(ev);
            if (ev.obj.tier >= 4) {
              cam.triggerShake(ev.obj.tier >= 6 ? 0.8 : 0.4);
            }
            if (ev.obj.golden) hud.showToast('GOLDEN! 8x mass', 1200);
            if (ev.obj.kind === 'landmark') {
              hud.showToast('LANDMARK SWALLOWED!', 2000);
              cam.triggerShake(1.4);
              if (world) world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius);
            }
          }
        } else if (ev.type === 'tide') hud.showToast('THE TIDE IS RISING!', 2500);
        else if (ev.type === 'unlocked') hud.showToast('LANDMARK SHIELD DOWN!', 2500);
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
      if (sim.over) endLevel();
    }
  } else if ((state === 'paused' || state === 'results') && world && cam) {
    world.update(0, []);
    world.render(cam.camera);
  }
}

function endSandbox() {
  if (state === 'results') return;
  state = 'results'; hud.hide();
  audio.stopScene();   // the results reveal plays over quiet, same as the arena
  const finished = sim;
  screens.showSandboxResults(finished, (toCities, coins) => {
    recordSandboxResult(save, finished.scene, {
      coinsEarned: coins, size: finished.hole.size, elapsed: finished.time,
      bestCombo: finished.hole.bestCombo, score: finished.hole.mass,
    });
    if (toCities) { teardownWorld(); state = 'menu'; screens.showTitle(); }
    else startVoxelSandbox(finished.scene);
  });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (world) world.resize(w, h);
  if (cam) cam.resize(w / h);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
window.addEventListener('resize', resize);

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

// The boot splash (index.html) has done its job the moment the first screen
// can mount — remove it before the title draws over it.
const bootSplash = document.getElementById('boot-splash');
if (bootSplash) bootSplash.remove();
screens.showTitle();
resize();
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });
