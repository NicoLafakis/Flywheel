// Boot + screen state machine + game loop glue.

import { Sim } from './sim.js';
import { VoxelSandboxSim, sandboxSizeProgress } from './voxelsim.js';
import { getLevel, METROS } from './levels.js';
import { loadSave, storeSave, recordLevelResult, recordSandboxResult, isLevelUnlocked } from './save.js';
import { World3D } from './world3d.js';
import { VoxelWorld3D } from './voxelworld.js';
import { ChaseCamera } from './camera.js';
import { Controls } from './controls.js';
import { HUD } from './ui/hud.js';
import { Screens, SKINS } from './ui/screens.js';
import { mountReadyGate } from './ui/ready.js';
import { TIERS, TIER_ORDER, detectTier, QualityWatchdog } from './quality.js';

const canvas = document.getElementById('game-canvas');
const hud = new HUD();
const save = loadSave();

// ------------------------------------------------------------------ audio (tiny)
let audioCtx = null;
function blip(freq = 440, dur = 0.07, type = 'square', vol = 0.05) {
  if (save.muted) return;
  const sfxVol = (save.settings && typeof save.settings.sfxVol === 'number') ? save.settings.sfxVol : 1;
  if (sfxVol <= 0) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol * sfxVol;
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}

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
let accumulator = 0;
let lastTs = 0;
let shopBonus = { clock: 0, growth: 0 };

// ------------------------------------------------------------------ quality tier
// Detection runs ONCE, at boot, and its result is cached: it costs a throwaway
// WebGL context, and the hardware does not change mid-session. The watchdog is
// what tracks anything that does — including the fact that Boston is 2.1x
// Brooklyn's block count, so the right tier genuinely differs per level.
const detected = detectTier();
// Seeded from the classifier rather than from a hardcoded 'high'. startQuality()
// overwrites this at every level start, so the seed is only ever READ before the
// first level — which is exactly when the SETTINGS screen asks for it to render
// "AUTO · <tier>". Left at 'high', that row told a handheld it was on HIGH
// before it had rendered a frame of a city (measured: a 390x844 coarse-pointer
// profile classifies as MEDIUM and the row still said AUTO · HIGH), which is the
// one failure the label exists to prevent — see the comment above it in
// js/ui/screens.js. Nothing else reads tierName this early: the loop's sub-step
// ceiling and applyQuality both require a level to have started.
let tierName = detected.tier;
const watchdog = new QualityWatchdog((tier, reason) => {
  tierName = tier;
  applyQuality();
  // Not a toast. A player who is already dropping frames does not need a popup
  // built out of more DOM work telling them so, and the whole point of the
  // ladder is that it is invisible. It goes to the console and to the debug
  // handle, where the next person profiling this can see it.
  if (typeof console !== 'undefined') console.info(`[quality] ${reason}`);
});
// Debug hook, same idiom as window.__sim / __world / __cam / __controls.
// `force` is what a harness (and a dev on a fast machine) uses to see a tier it
// will never be classified into; it stops the watchdog so the forced tier holds.
window.__quality = {
  detected, watchdog, TIERS,
  tier: () => tierName,
  force(t) {
    if (!TIERS[t]) return false;
    watchdog.enabled = false;
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

// The player's setting is the authority; 'auto' delegates to the classifier.
function wantedTier() {
  const q = save.settings && save.settings.quality;
  return q && q !== 'auto' && TIER_ORDER.includes(q) ? q : detected.tier;
}

// Push the current tier at both halves of the engine. Idempotent — every setter
// it calls returns early when nothing changed — so it is safe to call from
// applySettings, from level start, and from the watchdog.
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

// Called at every level start: re-resolve the tier from the setting, hand it to
// the watchdog (pinned when the player chose one by hand — or when the machine
// is desktop-class: the ladder exists for phones, and a desktop on AUTO gets
// HIGH and keeps it, see detectTier's header note), and apply it.
let qualityPref = null;   // last-seen save.settings.quality, so applySettings can tell it apart
function startQuality() {
  qualityPref = save.settings && save.settings.quality;
  tierName = wantedTier();
  const pinned = !!(qualityPref && qualityPref !== 'auto') || detected.desktopClass === true;
  watchdog.start(tierName, { pinned });
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
  resume() { if (state === 'paused') { state = 'playing'; screens.clear(); } },
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
  toggleMute() { save.muted = !save.muted; storeSave(save); },
  applySettings() {
    storeSave(save);
    if (controls) controls.settings = save.settings;
    if (cam) {
      cam.distScale = save.settings.camDist;
      cam.setReducedMotion(save.settings.reducedMotion);
    }
    if (world && world.setShadows) world.setShadows(save.settings.shadows);
    // Guarded like setShadows above: only the voxel renderer implements this,
    // and the campaign World3D must not be called with a method it lacks.
    if (world && world.setReducedMotion) world.setReducedMotion(save.settings.reducedMotion);
    if (world && world.setPerfMode) world.setPerfMode(save.settings.perfMode);
    // Only when the quality setting itself moved. applySettings fires on every
    // slider drag, and restarting the watchdog there would keep clearing its
    // window — it would never accumulate the three seconds it needs to judge
    // anything.
    if (save.settings.quality !== qualityPref) startQuality();
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
  controls.chaseMode = false;   // campaign: direct steering, no auto-follow camera
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
  accumulator = 0;
  lastTs = performance.now();
  blip(520, 0.12, 'triangle', 0.07);
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
    world = new VoxelWorld3D(canvas, sim, equippedSkinId());
    // The renderer reads the persisted setting at construction, but a mid-session
    // toggle has to reach it too or the ambient layer keeps animating. Guarded
    // to match the setShadows guard in applySettings.
    if (world && world.setReducedMotion) world.setReducedMotion(save.settings.reducedMotion);
    cam = new ChaseCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    cam.distScale = save.settings.camDist;
    cam.setReducedMotion(save.settings.reducedMotion);
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
        const h = b.s / 2;   // blocks carry a world centre and a world size
        if (b.x - h < mnX) mnX = b.x - h;
        if (b.x + h > mxX) mxX = b.x + h;
        if (b.z - h < mnZ) mnZ = b.z - h;
        if (b.z + h > mxZ) mxZ = b.z + h;
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
    // Third-person chase: WASD/joystick name a screen direction (direct
    // steer), the heading chases it through the wrapped shortest arc, and
    // while anything is steering the camera holds the latched basis yaw
    // (controls.js _setChaseHold) so a reversal happens on screen instead of
    // underneath a slewing camera. The heading is owned by Controls and never
    // derived from the camera yaw, so there is no feedback loop to wind up.
    // Q/E and the second-finger drag are still there for deliberately looking
    // around — they re-aim the basis itself (see _latchBasis and the yaw
    // offset in camera.js).
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
    accumulator = 0;
    lastTs = performance.now();
    blip(640, 0.15, 'triangle', 0.08);
    // The gate mounts over the live canvas, so the loop must already be running
    // for the establishing orbit to animate behind it. The hole stays parked
    // until the player starts — see the introHolding() check in frame().
    // The handle is kept so teardownWorld() can dismiss it: dropping the node
    // alone would leave a live window keydown listener AND body.rg-gate-up set,
    // which strands the HUD invisible on the next campaign level.
    if (authored && authored.intro) {
      // Arrival sting: lower and longer than the sandbox-start blip above,
      // because it plays under a wide static overview rather than a cut.
      blip(196, 0.5, 'triangle', 0.06);
      blip(294, 0.42, 'sine', 0.05);
      readyGate = mountReadyGate({
        title: 'READY?',
        subtitle: authored.intro.subtitle,   // the pill is sized for one short word
        reducedMotion: save.settings.reducedMotion,
        onStart: () => {
          readyGate = null;     // the gate tears itself down after onStart
          blip(880, 0.14, 'triangle', 0.07);   // downbeat for the zoom
          cam.releaseIntro();
        },
      });
    } else {
      // The gallery is a real goal level too. Its compact pile has no skyline
      // bounds to frame, so use its movement bounds for the same zoom-in beat.
      cam.beginIntro({ minR: sim.bounds, sun: sunDirOf(world) });
      readyGate = mountReadyGate({
        title: 'READY?', subtitle: 'SANDBOX', reducedMotion: save.settings.reducedMotion,
        onStart: () => { readyGate = null; blip(880, 0.14, 'triangle', 0.07); cam.releaseIntro(); },
      });
    }
  }));
}

function teardownWorld() {
  if (readyGate) { readyGate.dismiss(); readyGate = null; }
  if (world) { world.dispose(); world = null; }
  sim = null;
}

function endLevel() {
  state = 'results';
  hud.hide();
  const won = sim.won;
  blip(won ? 880 : 180, 0.3, won ? 'triangle' : 'sawtooth', 0.08);
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
    // The watchdog gets the RAW gap, not the clamped one: the clamp exists so a
    // long frame cannot make the sim lurch, and feeding it the clamped value
    // would cap every sample at 100 ms and hide the worst frames — precisely the
    // ones it is looking for. It does its own stall rejection (see quality.js).
    //
    // Not while the READY gate holds the establishing shot: the sim is not
    // stepping, so those frames are the cheapest in the level and a player who
    // reads the sign for ten seconds would otherwise hand the watchdog ten
    // seconds of evidence that the machine is fast. The scene-build hitch lands
    // in the same window and is excluded by the same line.
    if (!held) watchdog.sample(rawDt * 1000);
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
      for (const ev of events) {
        if (ev.type === 'eat') {
          // eat pitch rises with mass AND combo chain; every 10th chain pops
          blip(280 + Math.min(500, (ev.gained || 1) * 30) + Math.min(240, (ev.chain || 1) * 8), 0.04, 'square', 0.02);
          if (ev.chain && ev.chain % 25 === 0) {
            blip(660, 0.09, 'triangle', 0.06);
            blip(880, 0.14, 'triangle', 0.05);
            world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius, 0xffd23f);
            cam.triggerShake(0.25);
          }
        } else if (ev.type === 'crash') {
          blip(Math.max(70, 130 - ev.size * 3), 0.1, 'sawtooth', 0.05);
          cam.triggerShake(Math.min(0.6, 0.1 + ev.size * 0.02));
        } else if (ev.type === 'growth') {
          // SIZE level-up: arpeggio, shake, FOV punch, confetti burst, big pop
          blip(523, 0.1, 'triangle', 0.08);
          blip(659, 0.12, 'triangle', 0.07);
          blip(784, 0.2, 'triangle', 0.07);
          cam.triggerShake(0.4);
          cam.fovKick(7);
          world.spawnBurst(ev.hole.x, ev.hole.z, ev.hole.radius, 0xffd23f);
          hud.showBigPop(`SIZE ${ev.size}!`);
        } else if (ev.type === 'milestone') {
          blip(520, 0.12, 'triangle', 0.07);
          blip(780, 0.18, 'triangle', 0.06);
          cam.fovKick(8);
          world.spawnShockRing(ev.hole.x, ev.hole.z, ev.hole.radius * 1.5, 0xffffff);
          hud.showToast(ev.frac >= 1 ? 'TOTAL CONSUMPTION!' : `${Math.round(ev.frac * 100)}% OF THE CITY CONSUMED`, 2200);
        } else if (ev.type === 'coin') {
          blip(1040, 0.08, 'triangle', 0.06);
          hud.showToast(`COIN! +${ev.value}`, 700);
        } else if (ev.type === 'goal') {
          blip(523, 0.12, 'triangle', 0.09); blip(784, 0.18, 'triangle', 0.08);
          hud.showBigPop('GOAL COMPLETE!');
        }
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
      for (const ev of events) {
        if (ev.type === 'eat') {
          if (ev.hole.isPlayer) {
            blip(300 + Math.min(600, ev.gained * 2), 0.05, 'square', 0.03);
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
  const finished = sim;
  screens.showSandboxResults(finished, (toCities, coins) => {
    recordSandboxResult(save, finished.scene, { coinsEarned: coins, size: finished.hole.size, elapsed: finished.time });
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
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'playing') { state = 'paused'; screens.showPause(); }
  else if (e.code === 'Escape' && state === 'paused') { state = 'playing'; screens.clear(); }
});

// The boot splash (index.html) has done its job the moment the first screen
// can mount — remove it before the title draws over it.
const bootSplash = document.getElementById('boot-splash');
if (bootSplash) bootSplash.remove();
screens.showTitle();
resize();
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });
