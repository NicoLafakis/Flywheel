// The live arena page: two real devices, one shared city, over the internet.
//
// One page, either role. HOST A CITY mints a room code, opens a Supabase
// Realtime broadcast channel (the vendored client — ADR-0014), and runs the
// one true sim (ADR-0010). JOIN A CITY subscribes to the same topic, takes a
// seat over the JSON control protocol (js/net/arena.js), builds the identical
// city from the shared seed (ADR-0003), and plays as a wire-fed peer: intents
// out, snapshots in, ghosts interpolated, own hole predicted.
//
// The netcode is exactly the stack netdemo.html proves over loopback —
// ArenaHost / ArenaPeer / SupabaseRealtimeTransport — with the LoopbackHub
// swapped for the real service. That swap being ONE line is the whole point of
// the transport seam.
//
// v1 scope, deliberately: two players, one match per page load, no host
// migration (a vanished host freezes the match and says so — succession is
// T-606), no spectators, no quick join.

import { VoxelSandboxSim, sandboxSpeedForRadius } from '../voxelsim.js';
import { DuelView } from './view.js';
import { realtimeClient } from '../net/client.js';
import { SupabaseRealtimeTransport } from '../net/transport.js';
import { ArenaHost, FIXED_DT } from '../net/host.js';
import { ArenaPeer } from '../net/peer.js';
import {
  ArenaRoomHost, ArenaRoomPeer,
  mintRoomCode, normalizeRoomCode, isValidRoomCode, roomTopic,
} from '../net/arena.js';

const SCENE = 'gallery';
const MATCH_SECONDS = 180;
const DURATION_TICKS = MATCH_SECONDS * 60;
const COLORS = [0x4da3ff, 0xff8b2d];          // slot 0 blue, slot 1 orange
const COLOR_CSS = ['#4da3ff', '#ff8b2d'];
const SPAWNS = [{ x: -8, z: 8 }, { x: 8, z: 8 }];
const HOST_GONE_MS = 6000;   // v1 freeze threshold; T-606 replaces this with HOST_TIMEOUT_MS + succession

// ------------------------------------------------------------------ elements
const el = (id) => document.getElementById(id);
const overlays = ['ov-landing', 'ov-join', 'ov-connecting', 'ov-hosting', 'ov-countdown', 'ov-banner'];
function showOverlay(id) {
  for (const o of overlays) el(o).classList.toggle('hidden', o !== id);
}
function hideOverlays() { showOverlay('none'); }

const canvas = el('game-canvas');
const hud = el('hud');
const clockEl = el('clock');
const reconnectEl = el('reconnect');
const stickEl = el('stick');

// ------------------------------------------------------------------ state
let state = 'landing';   // landing | join | connecting | hosting | countdown | playing | over | hostleft
let role = null;         // 'host' | 'peer'
let mySlot = 0;

let transport = null;
let roomHost = null;     // ArenaRoomHost (host role)
let roomPeer = null;     // ArenaRoomPeer (peer role)
let arenaHost = null;    // ArenaHost (host role)
let arenaPeer = null;    // ArenaPeer (peer role)
let sim = null;          // host: the one true sim; peer: the never-stepped local city
let view = null;
let peerBlockById = null;
let rivalName = 'RIVAL';
let rivalPresent = false;

// Debug/Playwright hooks, same idiom as netdemo.
window.__arena = {
  get state() { return state; },
  get role() { return role; },
  get sim() { return sim; },
  get host() { return arenaHost; },
  get peer() { return arenaPeer; },
  get code() { return roomHost ? roomHost.code : (roomPeer ? roomPeer.code : null); },
  consumedCount() {
    if (!sim) return 0;
    let n = 0;
    for (const b of sim.blocks) if (b.state === 'consumed') n++;
    return n;
  },
  holePositions() {
    if (role === 'host' && sim) return sim.holes.map((h) => ({ x: h.x, z: h.z, mass: h.mass }));
    if (role === 'peer' && arenaPeer) {
      const own = arenaPeer.ownHole();
      const g = arenaPeer.roster.bySlot.get(0);
      return [g ? { x: g.x, z: g.z, mass: g.mass } : null, { x: own.x, z: own.z, mass: own.mass }];
    }
    return [];
  },
};

// ------------------------------------------------------------------ input
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => { held.clear(); touch.active = false; stickEl.style.display = 'none'; });

// Touch: drag anywhere = virtual joystick anchored where the finger lands.
const touch = { active: false, id: -1, x0: 0, y0: 0, x: 0, z: 0 };
const STICK_RANGE = 45;   // px of drag for full speed
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing' || e.pointerType === 'mouse') return;
  touch.active = true; touch.id = e.pointerId;
  touch.x0 = e.clientX; touch.y0 = e.clientY; touch.x = 0; touch.z = 0;
  stickEl.style.left = `${e.clientX}px`;
  stickEl.style.top = `${e.clientY}px`;
  stickEl.style.display = 'block';
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!touch.active || e.pointerId !== touch.id) return;
  let dx = (e.clientX - touch.x0) / STICK_RANGE;
  let dz = (e.clientY - touch.y0) / STICK_RANGE;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  touch.x = dx; touch.z = dz;
  const nub = stickEl.firstElementChild;
  nub.style.transform = `translate(calc(-50% + ${dx * 32}px), calc(-50% + ${dz * 32}px))`;
});
const endTouch = (e) => {
  if (!touch.active || e.pointerId !== touch.id) return;
  touch.active = false; touch.x = 0; touch.z = 0;
  stickEl.style.display = 'none';
};
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

/** Screen-space steering: camera sits on +z, so up = −z (same as netdemo). */
function localMove() {
  if (state !== 'playing') return { x: 0, z: 0 };
  if (touch.active && (touch.x || touch.z)) return { x: touch.x, z: touch.z };
  let x = 0, z = 0;
  if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
  if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
  if (held.has('KeyW') || held.has('ArrowUp')) z -= 1;
  if (held.has('KeyS') || held.has('ArrowDown')) z += 1;
  return { x, z };
}

// ------------------------------------------------------------------ helpers
function tuneForDuel(s) {
  // Same per-step CPU levers as netdemo/demo — two holes collapsing the tower
  // put the p95 over a frame without them.
  s.tune.debrisCap = 400;
  s.tune.contactBudget = 300;
  s.tune.contactRounds = 1;
  s.tune.supportEvery = 2;
}

function boundsRectOf(s) {
  return s.boundsRect || { minX: -s.bounds, maxX: s.bounds, minZ: -s.bounds, maxZ: s.bounds };
}

function inviteLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function fmtTime(sec) {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function setPlates() {
  const youSlot = mySlot, rivalSlot = mySlot === 0 ? 1 : 0;
  el('you-who').textContent = 'YOU';
  el('you-who').style.color = COLOR_CSS[youSlot];
  el('rival-who').textContent = rivalName;
  el('rival-who').style.color = COLOR_CSS[rivalSlot];
}

async function connectTransport(code) {
  transport = new SupabaseRealtimeTransport(realtimeClient(), roomTopic(code));
  await transport.connect();
  return transport;
}

function showChip(text) {
  el('chip-text').textContent = text;
  el('live-chip').classList.add('on');
}

function startMatchUI() {
  hideOverlays();
  hud.classList.add('on');
  state = 'playing';
  if (matchMedia('(pointer: coarse)').matches) el('touch-hint').classList.add('on');
  setTimeout(() => el('touch-hint').classList.remove('on'), 6000);
}

// ------------------------------------------------------------------ host flow
async function hostCity() {
  role = 'host'; mySlot = 0;
  state = 'connecting';
  el('connecting-msg').textContent = 'OPENING YOUR CITY…';
  showOverlay('ov-connecting');

  const code = mintRoomCode();
  try {
    await connectTransport(code);
  } catch (e) {
    return connectFailed(e);
  }

  // ORDER MATTERS: the room host registers its transport handler BEFORE the
  // ArenaHost does, so a JOIN seats the player (hole added, slot added) before
  // ArenaHost's handler fires the immediate keyframe — the newcomer's first
  // frame then already includes themselves (04 §8).
  roomHost = new ArenaRoomHost({ transport, code, maxPlayers: 2, generation: 1 });

  sim = new VoxelSandboxSim({ seed: roomHost.seed, scene: SCENE });
  tuneForDuel(sim);
  sim.holes[0].x = SPAWNS[0].x; sim.holes[0].z = SPAWNS[0].z;

  arenaHost = new ArenaHost({
    sim, transport, generation: 1, durationTicks: DURATION_TICKS,
    readInput: localMove, seed: roomHost.seed,
  });

  roomHost.onSeat = (slot, member) => {
    const h = sim.addHole(SPAWNS[slot] ? SPAWNS[slot].x : 0, SPAWNS[slot] ? SPAWNS[slot].z : 0);
    h.heading = 0;
    arenaHost.addSlot(slot, 'peer');
    rivalName = (member.name || 'RIVAL').toUpperCase().slice(0, 10);
    rivalPresent = true;
    roomHost.sendMatchStart({ durationTicks: DURATION_TICKS });
    startCountdown();
  };
  roomHost.onLeave = () => { rivalName += ' · LEFT'; setPlates(); };

  view = new DuelView(canvas, sim, COLORS);
  resize();

  el('room-code').textContent = code;
  history.replaceState(null, '', `?room=${code}`);
  state = 'hosting';
  showOverlay('ov-hosting');
  showChip(`LIVE · ${code}`);
}

function startCountdown() {
  if (state !== 'hosting' && state !== 'connecting') return;
  state = 'countdown';
  showOverlay('ov-countdown');
  let n = 3;
  el('countdown-num').textContent = String(n);
  const tick = setInterval(() => {
    n--;
    if (n > 0) { el('countdown-num').textContent = String(n); return; }
    clearInterval(tick);
    setPlates();
    startMatchUI();
  }, 1000);
}

// ------------------------------------------------------------------ peer flow
async function joinCity(rawCode) {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) {
    el('join-error').textContent = 'That doesn’t look like a code. 5 letters and numbers, no vowels.';
    return;
  }
  role = 'peer';
  state = 'connecting';
  el('connecting-msg').textContent = 'FINDING THAT CITY…';
  showOverlay('ov-connecting');

  try {
    await connectTransport(code);
  } catch (e) {
    return connectFailed(e);
  }

  roomPeer = new ArenaRoomPeer({ transport, code, name: 'RIVAL' });
  roomPeer.onHostLeft = hostLeft;

  let seat;
  try {
    seat = await roomPeer.join();
  } catch (e) {
    transport.disconnect();
    state = 'join';
    showOverlay('ov-join');
    el('join-error').textContent = e.code === 'room_full'
      ? 'That city already has two players.'
      : 'Nobody’s hosting that code right now. Check it, or ask your friend to open the city first.';
    return;
  }

  mySlot = seat.slot;
  el('connecting-msg').textContent = 'BUILDING THE CITY…';

  // The peer's own build of the same city: same seed, same scene, NEVER
  // stepped. Blocks die in it only when the wire says so.
  sim = new VoxelSandboxSim({ seed: seat.seed, scene: SCENE });
  peerBlockById = new Map();
  let maxBlockId = 0;
  for (const b of sim.blocks) {
    peerBlockById.set(b.id, b);
    if (b.id > maxBlockId) maxBlockId = b.id;
  }

  arenaPeer = new ArenaPeer({
    transport, slot: mySlot, sessionId: roomPeer.sessionId,
    readInput: localMove,
    speedForRadius: (r) => sandboxSpeedForRadius(r, sim.tune.speed),
    boundsRect: boundsRectOf(sim),
    spawn: SPAWNS[mySlot] || { x: 0, z: 0 },
    objectCount: maxBlockId + 1,
    generation: seat.generation,
  });
  arenaPeer.join();   // announce; the host answers with an immediate keyframe

  view = new DuelView(canvas, sim, COLORS);
  resize();

  rivalName = 'HOST';
  rivalPresent = true;
  setPlates();
  showChip(`LIVE · ${code}`);
  history.replaceState(null, '', `?room=${code}`);
  startMatchUI();
}

function connectFailed(e) {
  state = 'landing';
  showOverlay('ov-landing');
  // eslint-disable-next-line no-console
  console.error('arena connect failed:', e);
  alert('Couldn’t reach the arena service. Check your connection and try again.');
}

// ------------------------------------------------------------------ endings
function endMatch() {
  if (state === 'over') return;
  state = 'over';
  held.clear();
  let mine = 0, theirs = 0;
  if (role === 'host') {
    arenaHost.sendKeyframe();   // final MATCH_OVER keyframe for the peer
    mine = Math.floor(sim.holes[0].mass);
    theirs = Math.floor(rivalPresent && sim.holes[1] ? sim.holes[1].mass : 0);
  } else {
    const own = arenaPeer.ownHole();
    const g = arenaPeer.roster.bySlot.get(0);
    mine = Math.floor(own.mass);
    theirs = Math.floor(g ? g.mass : 0);
  }
  const win = mine === theirs ? -1 : (mine > theirs ? 1 : 0);
  el('banner-head').textContent = win < 0 ? 'DEAD HEAT' : (win ? 'YOU WIN' : `${rivalName} WINS`);
  el('banner-head').style.color = win < 0 ? '#e9eef6' : (win ? COLOR_CSS[mySlot] : COLOR_CSS[mySlot === 0 ? 1 : 0]);
  el('banner-lines').innerHTML =
    `YOU &nbsp;${mine.toLocaleString()}<br>${rivalName} &nbsp;${theirs.toLocaleString()}`;
  showOverlay('ov-banner');
}

function hostLeft() {
  if (state === 'over' || state === 'hostleft') return;
  state = 'hostleft';
  el('banner-head').textContent = 'HOST LEFT';
  el('banner-head').style.color = '#ffcf5c';
  el('banner-lines').textContent = 'The city froze. The host’s connection is gone.';
  showOverlay('ov-banner');
}

// ------------------------------------------------------------------ HUD
function updateHud() {
  let mine = 0, theirs = 0, secondsLeft = MATCH_SECONDS;
  if (role === 'host') {
    mine = sim.holes[0].mass;
    theirs = rivalPresent && sim.holes[1] ? sim.holes[1].mass : 0;
    secondsLeft = Math.max(0, (arenaHost.durationTicks - arenaHost.tick) * FIXED_DT);
    el('you-sub').textContent = `SIZE ${sim.holes[0].size}`;
  } else {
    const own = arenaPeer.ownHole();
    const g = arenaPeer.roster.bySlot.get(0);
    mine = own.mass;
    theirs = g ? g.mass : 0;
    secondsLeft = arenaPeer.timeLeftCs / 100;
    el('you-sub').textContent = 'VIA THE WIRE';
  }
  el('you-score').textContent = Math.floor(mine).toLocaleString();
  el('rival-score').textContent = Math.floor(theirs).toLocaleString();
  clockEl.textContent = fmtTime(secondsLeft);
  clockEl.classList.toggle('urgent', state === 'playing' && secondsLeft <= 15);

  if (role === 'peer' && state === 'playing') {
    const age = arenaPeer.snapshotAgeMs();
    // Only meaningful once the stream is flowing: the peer sits through the
    // host's 3-2-1 countdown before the first regular snapshot, and that quiet
    // is not a reconnect.
    const streaming = arenaPeer.stats.snapshots > 5;
    reconnectEl.style.display = streaming && age > 1000 && age < HOST_GONE_MS ? 'block' : 'none';
    if (streaming && age > HOST_GONE_MS) hostLeft();
  }
}

// ------------------------------------------------------------------ loop
let accumulator = 0;
let lastTs = performance.now();

function frame(ts) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (!view) return;

  if (state === 'playing') {
    if (role === 'host') {
      accumulator += realDt;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 6 && !arenaHost.over) {
        arenaHost.step(FIXED_DT);
        accumulator -= FIXED_DT;
        steps++;
      }
      if (accumulator >= FIXED_DT) accumulator = 0;
      sim.drainEvents();   // main.js's drain, standing in (the host's cursor survives it)
      if (arenaHost.over) endMatch();
    } else {
      arenaPeer.update(undefined, realDt * 1000);
      if (arenaPeer.matchOver) endMatch();
    }
  }

  if (role === 'host') {
    const h1 = sim.holes[1];
    view.update([sim.holes[0], h1 || { x: 0, z: 0, radius: 0 }]);
  } else if (arenaPeer) {
    for (const id of arenaPeer.drainConsumed()) {
      const b = peerBlockById.get(id);
      if (b) b.state = 'consumed';
    }
    arenaPeer.drainEvents();
    const ghosts = arenaPeer.ghosts();
    const g = ghosts.get(0) || arenaPeer.roster.bySlot.get(0)
      || { x: SPAWNS[0].x, z: SPAWNS[0].z, radius: 1.1 };
    view.update([g, arenaPeer.ownHole()]);
    const frozen = !!(ghosts.get(0) && ghosts.get(0).frozen);
    view.holes[0].ring.material.opacity = frozen ? 0.35 : 0.95;
    view.holes[0].beacon.material.opacity = frozen ? 0.15 : 0.45;
    view.holes[1].ring.material.opacity = arenaPeer.lastCorrection === 'snap' ? 1.0 : 0.95;
  }
  view.render();

  if (state === 'playing' || state === 'over') updateHud();
}

function resize() {
  if (view) view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });

// ------------------------------------------------------------------ leaving
window.addEventListener('beforeunload', () => {
  try {
    if (roomHost) roomHost.sendHostLeave();
    if (roomPeer) roomPeer.leave();
  } catch { /* best effort */ }
});

// ------------------------------------------------------------------ UI wiring
el('btn-host').addEventListener('click', hostCity);
el('btn-show-join').addEventListener('click', () => {
  state = 'join';
  showOverlay('ov-join');
  el('join-error').textContent = '';
  el('code-input').focus();
});
el('btn-join-back').addEventListener('click', () => { state = 'landing'; showOverlay('ov-landing'); });
el('btn-host-back').addEventListener('click', () => location.replace(location.pathname));
el('btn-again').addEventListener('click', () => location.replace(location.pathname));

const codeInput = el('code-input');
codeInput.addEventListener('input', () => {
  // Auto-uppercase and strip as they type (global rule 3); a pasted URL
  // collapses to its code.
  const v = normalizeRoomCode(codeInput.value) || codeInput.value.toUpperCase().replace(/[^A-Z0-9]/gi, '');
  if (v !== codeInput.value) codeInput.value = v;
  el('join-error').textContent = '';
});
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCity(codeInput.value); });
el('btn-join').addEventListener('click', () => joinCity(codeInput.value));

el('copy-link').addEventListener('click', async () => {
  const code = roomHost ? roomHost.code : '';
  try {
    await navigator.clipboard.writeText(inviteLink(code));
    el('copy-hint').textContent = 'Copied. Send it to your rival.';
  } catch {
    el('copy-hint').textContent = inviteLink(code);
  }
});

// ?room=CODE — an invite link auto-joins (the host's own URL also carries it,
// but the host never reloads into it mid-session; a reload lands here as a
// fresh joiner, which for v1 is the honest behaviour).
const urlCode = normalizeRoomCode(location.search);
if (urlCode && isValidRoomCode(urlCode)) {
  joinCity(urlCode);
} else {
  showOverlay('ov-landing');
}
