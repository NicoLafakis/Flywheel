// Boot + screen state machine + game loop glue.

import { Sim } from './sim.js';
import { VoxelSandboxSim } from './voxelsim.js';
import { getLevel, METROS } from './levels.js';
import { loadSave, storeSave, recordLevelResult, isLevelUnlocked } from './save.js';
import { World3D } from './world3d.js';
import { VoxelWorld3D } from './voxelworld.js';
import { ChaseCamera } from './camera.js';
import { Controls } from './controls.js';
import { HUD } from './ui/hud.js';
import { Screens, SKINS } from './ui/screens.js';

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
let accumulator = 0;
let lastTs = 0;
let shopBonus = { clock: 0, growth: 0 };

function computeShopBonus() {
  shopBonus = {
    clock: save.ownedItems.includes('clock5') ? 5 : 0,
    growth: save.ownedItems.includes('growth5') ? 0.05 : 0,
  };
}

function skinColor() {
  const s = SKINS.find((k) => k.id === save.equippedSkin);
  return s ? s.color : 0x4be34b;
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
  restart() { if (level) startLevel(); },
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
}

function startLevel() {
  teardownWorld();
  isVoxelSandbox = false;
  computeShopBonus();
  const lvl = { ...level, clock: level.clock + shopBonus.clock };
  sim = new Sim(lvl, { growthBonus: shopBonus.growth });
  sim.level = { ...lvl, target: level.target }; // keep original target
  world = new World3D(canvas, sim, skinColor(), { shadows: save.settings.shadows });
  window.__sim = sim; // debug/validator hook
  cam = new ChaseCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
  cam.distScale = save.settings.camDist;
  cam.setReducedMotion(save.settings.reducedMotion);
  cam.setBlockers(world.blockers);
  controls = controls || new Controls(canvas);
  controls.settings = save.settings;
  controls.driveMode = false;
  resize();
  hud.setLevel(level, METROS[level.metroIndex].name);
  hud.show();
  screens.clear();
  state = 'playing';
  accumulator = 0;
  lastTs = performance.now();
  blip(520, 0.12, 'triangle', 0.07);
}

function startVoxelSandbox(scene = 'gallery') {
  // The scene build blocks the main thread (~1.3 s sim + instancing for
  // Lower Manhattan) — show a loading frame first so the click never reads
  // as a frozen tab.
  screens.showLoading(scene === 'manhattan' ? 'NYC: LOWER MANHATTAN' : 'VOXEL SANDBOX');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    teardownWorld();
    isVoxelSandbox = true;
    sim = new VoxelSandboxSim({ scene });
    window.__sim = sim; // debug/validator hook
    world = new VoxelWorld3D(canvas, sim, skinColor());
    cam = new ChaseCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    cam.distScale = save.settings.camDist;
    cam.setReducedMotion(save.settings.reducedMotion);
    cam.setFollowDirection(true); // chase cam swings behind the direction of travel
    cam.setBlockers(sim.cameraBlockers); // tall towers occlude the low chase cam
    window.__cam = cam; // debug hook
    controls = controls || new Controls(canvas);
    controls.settings = save.settings;
    controls.driveMode = true; // sandbox drives like a car: A/D steer, W/S throttle
    applyVoxTuning(); // dev sliders from the save
    resize();
    hud.setLevel({ index: 'SANDBOX', clock: 999 }, scene === 'manhattan' ? 'LOWER MANHATTAN' : 'VOXEL PILE PHYSICS');
    hud.show();
    screens.clear();
    state = 'playing';
    accumulator = 0;
    lastTs = performance.now();
    blip(640, 0.15, 'triangle', 0.08);
  }));
}

function teardownWorld() {
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
  const realDt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;

  if (state === 'playing' && sim) {
    accumulator += realDt;
    const move = controls.getMove(cam.yaw);
    const orbit = controls.consumeOrbit();
    const zoom = controls.consumeZoom();
    while (accumulator >= FIXED_DT) {
      sim.step(FIXED_DT, move);
      accumulator -= FIXED_DT;
      if (sim.over) break;
    }
    const events = sim.drainEvents();
    if (isVoxelSandbox) {
      for (const ev of events) {
        if (ev.type === 'eat') {
          // eat pitch rises with mass AND combo chain; every 10th chain pops
          blip(280 + Math.min(500, (ev.gained || 1) * 30) + Math.min(240, (ev.chain || 1) * 8), 0.04, 'square', 0.02);
          if (ev.chain && ev.chain % 10 === 0) {
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
        }
      }
      world.update(realDt);
      const hole = sim.hole;
      cam.update(realDt, hole.x, hole.z, hole.radius, orbit, zoom);
      world.render(cam.camera);
      hud.updateSandbox(sim);
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
      cam.update(realDt, sim.player.x, sim.player.z, sim.player.radius, orbit, zoom);
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

screens.showTitle();
resize();
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });
