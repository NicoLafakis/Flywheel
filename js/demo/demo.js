// Hot-seat duel bootstrap: one shared gallery, two holes, three minutes.
//
// Standalone by design — it does not go through js/main.js's screen state
// machine, HUD or chase camera, all of which are single-player wiring. It owns
// its own loop, its own fixed timestep (same FIXED_DT as main.js) and its own
// overhead view.

import { VoxelSandboxSim } from '../voxelsim.js';
import { Duel } from './duel.js';
import { DuelView } from './view.js';

const FIXED_DT = 1 / 60;
// Three minutes by default. `?t=<seconds>` shortens it — which is how the
// end-of-match banner is verified through the real clock rather than through a
// stand-in, and doubles as a way to run a quick round when the show is short.
const MATCH_SECONDS = (() => {
  const q = Number(new URLSearchParams(location.search).get('t'));
  return Number.isFinite(q) && q > 0 ? q : 180;
})();
const P1_COLOR = 0x4da3ff;   // blue
const P2_COLOR = 0xff8b2d;   // orange
const SPAWNS = [{ x: -8, z: 8 }, { x: 8, z: 8 }];

const canvas = document.getElementById('duel-canvas');
const sim = new VoxelSandboxSim({ scene: 'gallery' });

// The duel runs the sim TWICE per fixed step, so the per-step CPU levers in
// js/quality.js matter about twice as much here as they do in the single-player
// sandbox. Profiled in-page on the gallery with both players ploughing the
// tower: `duel.step` was 11.0 ms p50 / 18.3 ms p95 at HIGH (Infinity /
// Infinity / 2 / 1), which puts the p95 over a 16.7 ms frame during a collapse.
// These sit between quality.js's `high` and `low` rows — the two dominant costs
// (debris physics and contact relaxation) are capped and the support recalc is
// amortised, while the caps stay generous enough that a tower still comes down
// in a visible avalanche, which is the entire point of the demo.
sim.tune.debrisCap = 400;
sim.tune.contactBudget = 300;
sim.tune.contactRounds = 1;
sim.tune.supportEvery = 2;
const duel = new Duel(sim, SPAWNS);
const view = new DuelView(canvas, sim, [P1_COLOR, P2_COLOR]);

// Debug hooks, same idiom as main.js's __sim / __world.
window.__sim = sim;
window.__duel = duel;
window.__view = view;

// ------------------------------------------------------------------ input
// The camera carries no yaw (see view.js), so screen-relative steering IS
// world-space: right is +x, up is -z. Both handlers live on window and the
// arrow keys are preventDefault'd so the page never scrolls under the match.
const held = new Set();
const KEYS = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
};
const ARROWS = new Set(Object.values(KEYS.p2));

window.addEventListener('keydown', (e) => {
  if (ARROWS.has(e.code) || e.code === 'Space') e.preventDefault();
  held.add(e.code);
});
window.addEventListener('keyup', (e) => { held.delete(e.code); });
// A window that loses focus mid-press otherwise leaves a hole driving forever.
window.addEventListener('blur', () => held.clear());

function moveFor(map) {
  if (state !== 'playing') return { x: 0, z: 0 };
  let x = 0, z = 0;
  if (held.has(map.left)) x -= 1;
  if (held.has(map.right)) x += 1;
  if (held.has(map.up)) z -= 1;
  if (held.has(map.down)) z += 1;
  return { x, z };
}

// ------------------------------------------------------------------ HUD
const el = (id) => document.getElementById(id);
const scoreEls = [el('p1-score'), el('p2-score')];
const sizeEls = [el('p1-size'), el('p2-size')];
const barEls = [el('p1-bar'), el('p2-bar')];
const timerEl = el('duel-timer');
const bannerEl = el('duel-banner');

let state = 'playing';       // playing | over
let remaining = MATCH_SECONDS;
let accumulator = 0;
let lastTs = performance.now();

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function updateHud() {
  // Both bars are scaled against the LEADER's raw mass rather than against the
  // city, because at three minutes on a 4.2k-mass gallery neither player gets
  // far enough up an absolute scale for the bar to say anything. Relative, the
  // bar answers the only question a spectator has: who is ahead, and by how much.
  const raws = [duel.hole(0).rawMass, duel.hole(1).rawMass];
  const lead = Math.max(raws[0], raws[1], 1e-6);
  for (let i = 0; i < 2; i++) {
    const h = duel.hole(i);
    scoreEls[i].textContent = Math.floor(h.mass).toLocaleString();
    sizeEls[i].textContent = `SIZE ${h.size}   ×${h.eatenCount} blocks`;
    barEls[i].style.width = `${(raws[i] / lead) * 100}%`;
  }
  timerEl.textContent = fmtTime(remaining);
  timerEl.classList.toggle('urgent', state === 'playing' && remaining <= 15);
}

function endMatch() {
  state = 'over';
  held.clear();
  const s = [Math.floor(duel.hole(0).mass), Math.floor(duel.hole(1).mass)];
  const pct = [duel.fraction(0) * 100, duel.fraction(1) * 100];
  const win = s[0] === s[1] ? -1 : (s[0] > s[1] ? 0 : 1);
  const name = ['P1', 'P2'];
  const headline = win < 0
    ? 'DEAD HEAT'
    : `${name[win]} WINS — ${pct[win].toFixed(1)}% of the city`;
  el('banner-head').textContent = headline;
  el('banner-head').style.color = win < 0 ? '#e9eef6' : (win === 0 ? '#4da3ff' : '#ff8b2d');
  el('banner-p1').textContent = `P1  ${s[0].toLocaleString()}  ·  ${pct[0].toFixed(1)}% eaten`;
  el('banner-p2').textContent = `P2  ${s[1].toLocaleString()}  ·  ${pct[1].toFixed(1)}% eaten`;
  bannerEl.classList.remove('hidden');
}

el('btn-restart').addEventListener('click', () => location.reload());

// ------------------------------------------------------------------ loop
function frame(ts) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;

  if (state === 'playing') {
    remaining -= realDt;
    accumulator += realDt;
    const moves = [moveFor(KEYS.p1), moveFor(KEYS.p2)];
    // Same fixed-step catch-up shape as main.js, same 6-substep ceiling: a
    // frame that falls behind runs the world in slow motion rather than
    // spiralling. Two holes means twice the sim work per step, so the ceiling
    // matters more here, not less.
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 6) {
      duel.step(FIXED_DT, moves);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (accumulator >= FIXED_DT) accumulator = 0;
    duel.drain(0); duel.drain(1);   // nothing consumes events in this build
    if (remaining <= 0) { remaining = 0; endMatch(); }
  }

  view.update([duel.hole(0), duel.hole(1)]);
  view.render();
  updateHud();
}

function resize() {
  view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
updateHud();
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });
