// The loopback arena: the first real end-to-end networked match.
//
// ONE page, BOTH ends of the wire, and a deliberately hostile middle. The left
// half is the HOST — it steps the one true sim (ADR-0010) with its own WASD
// steering plus whatever intents arrive over the transport. The right half is
// the PEER — it steers with the arrow keys, sends intents at INTENT_HZ, and
// renders EXCLUSIVELY what came back over the wire: interpolated ghosts, its
// own predicted hole, and eat events. Between them sits a LoopbackHub dialled
// to booth-wifi conditions (120 ms latency, 30 ms jitter, 5% drop by default).
//
// THE PROOF, and the rule that makes it one: nothing on the peer side holds a
// reference to `hostSim`. The peer half of this file touches only `peerCity`
// (its own build of the same scene from the same seed — ADR-0003's dividend),
// the ArenaPeer object, and the wire. If the right half of the screen tracks
// the left through lag, jitter and drop, the netcode works; if someone later
// "simplifies" a peer read into hostSim, the page stops proving anything —
// which is why tools/net-match-selftest.mjs greps for exactly that.
//
// Standalone by design, like js/demo/demo.js: no js/main.js, no screens, its
// own loop. The wire clock is the hub's virtual clock, advanced by real frame
// time, so latency here is the same latency the Node test asserts against.

import { VoxelSandboxSim, sandboxSpeedForRadius } from '../voxelsim.js';
import { DuelView } from './view.js';
import { LoopbackHub } from '../net/transport.js';
import { ArenaHost } from '../net/host.js';
import { ArenaPeer } from '../net/peer.js';

const FIXED_DT = 1 / 60;
const SEED = 'netdemo';
const SCENE = 'gallery';
const P1_COLOR = 0x4da3ff;   // host player, blue
const P2_COLOR = 0xff8b2d;   // peer player, orange
const SPAWNS = [{ x: -8, z: 8 }, { x: 8, z: 8 }];

// ?t= match seconds, ?lat/?jit= ms, ?drop= 0..1 — the impairment dials, so a
// demo can be run at 300 ms / 20% to watch the correction bands earn their keep.
const q = new URLSearchParams(location.search);
const num = (k, d) => { const v = Number(q.get(k)); return Number.isFinite(v) && v >= 0 ? v : d; };
const MATCH_SECONDS = num('t', 180) || 180;
const LATENCY_MS = num('lat', 120);
const JITTER_MS = num('jit', 30);
const DROP_RATE = Math.min(0.9, num('drop', 0.05));

// ------------------------------------------------------------------ the wire
const hub = new LoopbackHub({ latencyMs: LATENCY_MS, jitterMs: JITTER_MS, dropRate: DROP_RATE, seed: 'booth-wifi' });

// ------------------------------------------------------------------ host side
const hostSim = new VoxelSandboxSim({ seed: SEED, scene: SCENE });
// Same per-step CPU levers as the hot-seat demo (js/demo/demo.js) — two holes
// collapsing the tower put the p95 over a frame without them.
hostSim.tune.debrisCap = 400;
hostSim.tune.contactBudget = 300;
hostSim.tune.contactRounds = 1;
hostSim.tune.supportEvery = 2;

const h0 = hostSim.holes[0];
h0.x = SPAWNS[0].x; h0.z = SPAWNS[0].z; h0.heading = 0;
const h1 = hostSim.addHole(SPAWNS[1].x, SPAWNS[1].z);
h1.heading = 0;

const host = new ArenaHost({
  sim: hostSim,
  transport: hub.endpoint('host'),
  generation: 1,
  durationTicks: Math.round(MATCH_SECONDS * 60),
  readInput: () => moveFor(KEYS.p1),
  nowMs: () => hub.nowMs,
  seed: SEED,
});
host.addSlot(1, 'peer');   // seat the remote player (arena.js's job, done by hand here)

// ------------------------------------------------------------------ peer side
// The peer's OWN city: same seed, same scene, never stepped. It exists so the
// peer half has geometry to draw — blocks die in it only when a wire event or
// a keyframe bitset says so.
const peerCity = new VoxelSandboxSim({ seed: SEED, scene: SCENE });
const peerBlockById = new Map();
let maxBlockId = 0;
for (const b of peerCity.blocks) {
  peerBlockById.set(b.id, b);
  if (b.id > maxBlockId) maxBlockId = b.id;
}
const peerBoundsRect = peerCity.boundsRect
  || { minX: -peerCity.bounds, maxX: peerCity.bounds, minZ: -peerCity.bounds, maxZ: peerCity.bounds };

const peer = new ArenaPeer({
  transport: hub.endpoint('peer'),
  slot: 1,
  sessionId: 'netdemo',
  readInput: () => moveFor(KEYS.p2),
  nowMs: () => hub.nowMs,
  // The exact sandbox speed curve, from the sim's own export (hard rule 4) —
  // read off the PEER's city object, not the host's.
  speedForRadius: (r) => sandboxSpeedForRadius(r, peerCity.tune.speed),
  boundsRect: peerBoundsRect,
  spawn: SPAWNS[1],
  objectCount: maxBlockId + 1,
  generation: 1,
});
peer.join();   // announce; the host answers with an immediate keyframe (04 §8)

// ------------------------------------------------------------------ input
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

// ------------------------------------------------------------------ views
const hostView = new DuelView(document.getElementById('host-canvas'), hostSim, [P1_COLOR, P2_COLOR]);
const peerView = new DuelView(document.getElementById('peer-canvas'), peerCity, [P1_COLOR, P2_COLOR]);

// Debug hooks, same idiom as the other demos.
window.__hub = hub;
window.__host = host;
window.__peer = peer;
window.__hostSim = hostSim;

// ------------------------------------------------------------------ HUD
const el = (id) => document.getElementById(id);
const hostScoreEl = el('host-score'), hostSubEl = el('host-sub');
const peerScoreEl = el('peer-score'), peerSubEl = el('peer-sub');
const clockEl = el('clock'), wireClockEl = el('wire-clock');
const reconnectEl = el('reconnect');
const stRtt = el('st-rtt'), stAge = el('st-age'), stSnaps = el('st-snaps');
const stCorr = el('st-corr'), stErr = el('st-err'), stLink = el('st-link');
stLink.textContent = `${LATENCY_MS}ms ±${JITTER_MS} · ${(DROP_RATE * 100).toFixed(0)}% drop`;

let state = 'playing';       // playing | over
let accumulator = 0;
let lastTs = performance.now();

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function updateHud() {
  // Host plate: read straight from the authoritative sim — this side owns it.
  hostScoreEl.textContent = Math.floor(h0.mass).toLocaleString();
  hostSubEl.textContent = `SIZE ${h0.size}   ×${h0.eatenCount} blocks`;

  // Peer plate: WIRE DATA ONLY. Mass and radius from the last snapshot; the
  // score a peer sees is exactly the claim `observed_final` will one day attest.
  const own = peer.ownHole();
  peerScoreEl.textContent = Math.floor(own.mass).toLocaleString();
  peerSubEl.textContent = `r ${own.radius.toFixed(2)} m · via the wire`;

  const hostRemaining = Math.max(0, (host.durationTicks - host.tick) * FIXED_DT);
  clockEl.firstChild.textContent = fmtTime(hostRemaining);
  wireClockEl.textContent = `WIRE ${fmtTime(peer.timeLeftCs / 100)}`;
  clockEl.classList.toggle('urgent', state === 'playing' && hostRemaining <= 15);

  const age = peer.snapshotAgeMs(hub.nowMs);
  reconnectEl.style.display = age > 1000 && state === 'playing' ? 'block' : 'none';

  stRtt.textContent = Number.isFinite(peer.rttMs) ? `${Math.round(peer.rttMs)} ms` : '—';
  stAge.textContent = Number.isFinite(age) ? `${Math.round(age)} ms` : '—';
  stSnaps.textContent = `${peer.stats.snapshots + peer.stats.keyframes} (${hub.stats.dropped} dropped)`;
  const c = peer.stats.corrections;
  stCorr.textContent = `${c.ignore} / ${c.smooth} / ${c.snap}`;
  stCorr.parentElement.className = c.snap > 0 ? 'warn' : '';
  stErr.textContent = `${peer.lastErrorM.toFixed(2)} m`;
}

function endMatch() {
  state = 'over';
  held.clear();
  // One last keyframe so the peer side hears MATCH_OVER and the final state
  // even though the loop is stopping.
  host.sendKeyframe(hub.nowMs);
  hub.flush();
  const s = [Math.floor(h0.mass), Math.floor(h1.mass)];
  const win = s[0] === s[1] ? -1 : (s[0] > s[1] ? 0 : 1);
  const head = win < 0 ? 'DEAD HEAT' : (win === 0 ? 'HOST WINS' : 'PEER WINS');
  el('banner-head').textContent = head;
  el('banner-head').style.color = win < 0 ? '#e9eef6' : (win === 0 ? '#4da3ff' : '#ff8b2d');
  el('banner-host').textContent = `HOST P1  ${s[0].toLocaleString()}`;
  const peerSaw = Math.floor(peer.ownHole().mass);
  el('banner-peer').textContent = `PEER P2  ${s[1].toLocaleString()}  ·  saw ${peerSaw.toLocaleString()} over the wire`;
  el('banner').classList.remove('hidden');
}

el('btn-restart').addEventListener('click', () => location.reload());

// ------------------------------------------------------------------ loop
function frame(ts) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;

  if (state === 'playing') {
    // Advance the virtual wire clock by real time: due messages deliver into
    // both ends exactly as a real network would trickle them in.
    hub.advance(realDt * 1000);

    accumulator += realDt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 6 && !host.over) {
      host.step(FIXED_DT, hub.nowMs);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (accumulator >= FIXED_DT) accumulator = 0;
    // main.js's drain, standing in: the host's event cursor survives it.
    hostSim.drainEvents();

    peer.update(hub.nowMs, realDt * 1000);

    if (host.over) endMatch();
  }

  // ---- host render: the truth, both real holes.
  hostView.update([h0, h1]);
  hostView.render();

  // ---- peer render: WIRE ONLY. Blocks die on events/keyframes; P1 is an
  // interpolated ghost; P2 is the local prediction.
  for (const id of peer.drainConsumed()) {
    const b = peerBlockById.get(id);
    if (b) b.state = 'consumed';
  }
  peer.drainEvents();   // nothing consumes the rest of the event juice yet

  const ghosts = peer.ghosts(hub.nowMs);
  const g = ghosts.get(0);
  const seen = peer.roster.bySlot.get(0);
  const p1Ghost = g || seen || { x: SPAWNS[0].x, z: SPAWNS[0].z, radius: 1.1 };
  peerView.update([p1Ghost, peer.ownHole()]);
  // A ghost whose feed went quiet dims (04 §5.1 "freeze the ghost and dim it").
  const frozen = !!(g && g.frozen);
  peerView.holes[0].ring.material.opacity = frozen ? 0.35 : 0.95;
  peerView.holes[0].beacon.material.opacity = frozen ? 0.15 : 0.45;
  // A snap correction flashes the own rim (04 §5.2 "snap, and flash the rim").
  peerView.holes[1].ring.material.opacity = peer.lastCorrection === 'snap' ? 1.0 : 0.95;
  peerView.render();

  updateHud();
}

function resize() {
  const w = Math.floor(window.innerWidth / 2), h = window.innerHeight;
  hostView.resize(w, h);
  peerView.resize(w, h);
}
window.addEventListener('resize', resize);
resize();
updateHud();
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });
