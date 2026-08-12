// The live city behind the title screen.
//
// The landing screen used to sit on a flat dark field while a whole city
// renderer sat idle two clicks away. This mounts the SAME pair the sandbox
// mounts — VoxelSandboxSim + VoxelWorld3D + ChaseCamera — on the same canvas,
// on autopilot: nobody is driving, the camera holds the establishing orbit and
// never releases it, and a hole wanders the skyline eating blocks.
//
// Four rules govern everything below, and each one is a thing the menu must not
// cost the player:
//
//   1. It must never delay the menu. Nothing here runs before the title has
//      painted — `start()` only schedules, and the build itself waits out the
//      wordmark's entrance (BUILD_DELAY_MS) so the one unavoidable main-thread
//      block lands after the animation the player is watching, not during it.
//   2. It must never take input. The canvas is under #screen-root and this
//      module attaches no listeners at all, so every click still belongs to the
//      menu.
//   3. It must never make the first real game worse. `stop()` disposes the
//      world (which releases the GL context and the shared geometry) and is
//      called from teardownWorld() before any game world is constructed, so the
//      two never coexist on the one canvas.
//   4. It must be skippable. A weak device, a missing WebGL context or a throw
//      anywhere in the build leaves `active` null, and the landing screen keeps
//      the flat field it always had (css/main.css keys that off body.fw-scene).
//
// Reduced motion freezes the camera drift and keeps the city: a still skyline
// is the scene, an orbiting one is the motion.

import { VoxelSandboxSim, loadScene } from '../voxelsim.js';
import { VoxelWorld3D } from '../voxelworld.js';
import { ChaseCamera } from '../camera.js';
import { defaultTierForDevice } from '../quality.js';

// The scene the CTA names. The backdrop and the button have to agree, or the
// menu is advertising a city the player is not looking at.
const MENU_SCENE = 'brooklyn';
// Long enough for the wordmark's pop-in and the CTA's entrance to finish (the
// last letter lands at ~0.4 s, the CTA at ~1.0 s). The build blocks the main
// thread once; this is what keeps that block off the animation.
const BUILD_DELAY_MS = 1100;
const FIXED_DT = 1 / 60;
// The autopilot's heading sweep. Slow — the hole is scenery, not a demo of the
// controls, and a fast one reads as a bot playing badly.
const DRIFT_RATE = 0.11;

let active = null;   // { sim, world, cam, t, acc }
let timer = 0;       // pending setTimeout id
let ctx = null;      // { canvas, reducedMotion, lowTier }

// One WebGL probe, cached: a device that cannot make a context now will not
// make one in thirty seconds either, and each probe costs a real context.
let webglOk = null;
function canRender() {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement('canvas');
    webglOk = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { webglOk = false; }
  return webglOk;
}

// Deliberately conservative, and deliberately NOT a frame-time watchdog: the
// menu is the one screen where a bad guess is free to be pessimistic, because
// the fallback is the screen the game shipped with. Anything that reports few
// cores or little memory, or a player who has already asked for less, gets the
// flat field.
function tooWeak(settings) {
  if (!canRender()) return true;
  if (settings && settings.perfMode) return true;
  // The EFFECTIVE tier, not the stored string: a phone that has never opened
  // SETTINGS runs LOW while `quality` still reads 'high', and the backdrop is
  // the single most expensive thing on the title screen — it builds and
  // simulates the whole of Brooklyn behind a menu. Reading the raw key here
  // would hand exactly the devices the LOW default exists for the one cost the
  // default is meant to spare them.
  const tier = settings && settings.qualityChosen
    ? (settings.quality === 'low' ? 'low' : 'high')
    : defaultTierForDevice();
  if (tier === 'low') return true;
  const nav = navigator;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return true;
  return false;
}

// Schedules the backdrop. Safe to call on every return to the title — an
// already-running scene is left exactly where it is rather than rebuilt, so
// walking into SHOP and back does not pay the build twice.
export function startMenuScene(canvas, opts = {}) {
  if (active || timer) return;
  const settings = opts.settings || {};
  if (tooWeak(settings)) return;
  ctx = {
    canvas,
    skinId: opts.skinId || 'classic',
    // The OS preference and the in-game setting are two independent sources of
    // "hold still", same as the landing screen's .fw-still.
    reducedMotion: !!settings.reducedMotion
      || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  timer = setTimeout(build, BUILD_DELAY_MS);
}

async function build() {
  timer = 0;
  if (active || !ctx) return;
  try {
    // The city module is fetched on demand (js/voxelsim.js registry), so the
    // backdrop's scene is downloaded here rather than at page load. Rule 1 above
    // is what makes that safe AND what makes it a win: nothing on the title
    // screen waits for this, and a player who never reaches Brooklyn never pays
    // for it. `ctx` is re-checked after the await because `stop()` can run while
    // the fetch is in flight — a fast click into SHOP is exactly that race, and
    // building into a torn-down context would leak a world onto a canvas the
    // menu no longer owns.
    await loadScene(MENU_SCENE);
    if (active || !ctx) return;
    const sim = new VoxelSandboxSim({ scene: MENU_SCENE });
    const world = new VoxelWorld3D(ctx.canvas, sim, ctx.skinId, {
      // The backdrop pays for none of the shadow pass. It is behind a scrim and
      // behind the type; nobody is reading its contact shadows, and this is the
      // single biggest lever on a scene this size.
      shadows: false,
      reducedMotion: ctx.reducedMotion,
    });
    const cam = new ChaseCamera(ctx.canvas.clientWidth / Math.max(1, ctx.canvas.clientHeight));
    cam.setReducedMotion(ctx.reducedMotion);
    // Framing, and this is where the backdrop deliberately parts company with
    // the READY gate. The gate frames the WHOLE city, because its job is to
    // show the player the place they are about to eat; at that distance
    // Brooklyn reads as a map, and a map behind a menu is a texture. So: no
    // blocker list (which is what pulls the fit back to the full skyline) and a
    // hand-set radius instead, which puts the camera down among the towers
    // around the hole — close enough that a collapsing block is legible.
    //
    // Never released, so the camera holds this overview and orbits it forever.
    // A zero arc is a static hold, which is exactly what reduced motion wants:
    // the city stays, the drift stops.
    const arc = ctx.reducedMotion ? 0 : Math.PI / 5;
    // Sun direction, read off the renderer's own light, so the establishing yaw
    // lands on the lit side rather than on a silhouette.
    let sun = null;
    if (world._sun && world._sun.target) {
      sun = {
        x: world._sun.position.x - world._sun.target.position.x,
        y: world._sun.position.y - world._sun.target.position.y,
        z: world._sun.position.z - world._sun.target.position.z,
      };
    }
    // A phone sees this scene through a narrow slot between the wordmark and the
    // card shelf, and at radius 74 that slot is filled by two towers. Pulling
    // back puts skyline rather than facade in the band the UI leaves open, which
    // is the only part of the backdrop a phone player ever sees. Keyed off the
    // viewport at build time and not re-derived on resize: the establishing hold
    // is set once, and a mid-session orientation change is not worth restaging
    // the camera the player is already looking at.
    const narrow = window.innerWidth <= 640 && window.innerHeight > window.innerWidth;
    cam.beginIntro({ minR: narrow ? 112 : 74, orbitArc: arc, sun });
    world.resize(window.innerWidth, window.innerHeight);
    cam.resize(window.innerWidth / Math.max(1, window.innerHeight));
    active = { sim, world, cam, t: 0, acc: 0 };
    // The fade belongs to the canvas, not to a wrapper: one compositor-only
    // opacity animation, declared in css/main.css and armed by this class.
    document.body.classList.add('fw-scene');
  } catch (e) {
    // Any failure at all is a fallback, never an error the player sees. The
    // landing screen keeps its flat field because body.fw-scene never went on.
    active = null;
    try { document.body.classList.remove('fw-scene'); } catch (e2) { /* ignore */ }
  }
}

// Folded into main.js's single rAF loop rather than running one of its own, so
// there is exactly one frame callback in the app and the menu cannot compete
// with the game loop for it.
export function tickMenuScene(dt) {
  if (!active) return;
  // rAF already stops in a hidden tab; this covers the frame in flight when the
  // tab goes away and any host that keeps ticking regardless.
  if (document.hidden) return;
  const a = active;
  const realDt = Math.min(0.1, dt || 0);
  a.t += realDt;
  // Autopilot: a slowly rotating heading, so the hole tours the skyline instead
  // of grinding a single crater. One sub-step per frame, never a catch-up loop
  // — the backdrop is allowed to run in slow motion on a slow machine, and a
  // catch-up loop is the one thing that could make it cost more than a frame.
  a.acc += realDt;
  if (a.acc >= FIXED_DT) {
    a.acc = 0;
    const ang = a.t * DRIFT_RATE;
    a.sim.step(FIXED_DT, { x: Math.cos(ang), z: Math.sin(ang) });
    a.sim.drainEvents();   // nothing listens; the queue must not grow forever
  }
  const h = a.sim.hole;
  a.cam.update(realDt, h.x, h.z, h.radius, 0, 0, false, 0);
  a.world.update(realDt, []);
  a.world.render(a.cam.camera);
}

export function resizeMenuScene(w, h) {
  if (!active) return;
  active.world.resize(w, h);
  active.cam.resize(w / Math.max(1, h));
}

// Disposes rather than pauses. The next thing to use this canvas is a game
// world, and two live renderers on one canvas is not a state worth supporting.
export function stopMenuScene() {
  if (timer) { clearTimeout(timer); timer = 0; }
  document.body.classList.remove('fw-scene');
  if (!active) return;
  try { active.world.dispose(); } catch (e) { /* already gone */ }
  active = null;
}

export function menuSceneActive() { return !!active; }

// Debug hook, same idiom as window.__sim / __world / __cam. `mass` is what a
// smoke test reads to prove the backdrop is actually eating something rather
// than holding a still frame.
window.__menuScene = () => (active ? {
  scene: MENU_SCENE, t: active.t,
  mass: Math.floor(active.sim.hole.mass), size: active.sim.hole.size,
  x: Math.round(active.sim.hole.x), z: Math.round(active.sim.hole.z),
  falling: active.sim._falling.length,
} : null);
