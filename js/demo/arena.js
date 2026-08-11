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

import * as THREE from 'three';
import { VoxelSandboxSim, sandboxSpeedForRadius } from '../voxelsim.js';
import { DuelView } from './view.js';
// The rival-visibility layer (.wiki/features/rival-visibility/): colored
// craters, tug-of-war bar, off-screen chevron, milestone callouts, end reveal.
// All of it is read-only dressing over sim events and wire snapshots (ADR-0002).
import { slotColorHex, slotColorCss, slotName } from '../rival/identity.js';
import { RIVAL } from '../rival/constants.js';
import { AttributionRecord, finalSplit } from '../rival/attribution.js';
import { TerritoryMap, columnCount } from '../rival/territory.js';
import { TerritoryLayer } from '../rival/territory-layer.js';
import { TugBar, computeShares } from '../rival/tugbar.js';
import { edgeProject, chevronSize, ChevronLayer } from '../rival/offscreen.js';
import { BeatTracker, BEAT, BEAT_COPY } from '../rival/beats.js';
import { AnnounceQueue } from '../rival/announce.js';
import { Reveal } from '../rival/reveal.js';
import { EVENT_FLAG } from '../net/protocol.js';
import { realtimeClient } from '../net/client.js';
import { SupabaseRealtimeTransport } from '../net/transport.js';
import { ArenaHost, FIXED_DT } from '../net/host.js';
import { ArenaPeer } from '../net/peer.js';
import {
  ArenaRoomHost, ArenaRoomPeer,
  mintRoomCode, normalizeRoomCode, isValidRoomCode, roomTopic,
  ARENA_SCENES, sceneLabel,
} from '../net/arena.js';

// The scene is the HOST's choice, made on the picker before the room opens.
// The joiner learns it from the WELCOME (allowlist-checked in protocol.js) —
// never from the URL, so a tampered link cannot desync the two cities.
const DEFAULT_SCENE = 'gallery';
let scene = DEFAULT_SCENE;
// Three minutes by default. `?t=<seconds>` shortens it — DEV ONLY, same idiom
// as the hot-seat page (js/demo/demo.js): it is how the end reveal is verified
// through the real clock. Host-side only; a joiner follows the wire's clock,
// so a tampered join link cannot change the match length.
const MATCH_SECONDS = (() => {
  const q = Number(new URLSearchParams(location.search).get('t'));
  return Number.isFinite(q) && q >= 5 ? q : 180;
})();
const DURATION_TICKS = MATCH_SECONDS * 60;
// Player colors come from THE one identity table (rival-visibility CC-3) —
// slot 0 blue, slot 1 orange, same as the duel HUD always shipped.
const COLORS = [slotColorHex(0), slotColorHex(1)];
const COLOR_CSS = [slotColorCss(0), slotColorCss(1)];
const SPAWNS = [{ x: -8, z: 8 }, { x: 8, z: 8 }];
const HOST_GONE_MS = 6000;   // v1 freeze threshold; T-606 replaces this with HOST_TIMEOUT_MS + succession

// ------------------------------------------------------------------ elements
const el = (id) => document.getElementById(id);
const overlays = ['ov-landing', 'ov-pick', 'ov-join', 'ov-connecting', 'ov-hosting', 'ov-countdown', 'ov-banner', 'ov-reveal'];
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
let state = 'landing';   // landing | pick | join | connecting | hosting | countdown | playing | over | hostleft
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

// --- rival-visibility state (all read-only over sim/wire data) --------------
let blockById = null;     // id -> block, both roles (attribution + territory)
let attribution = null;   // AttributionRecord — the one record every surface reads
let territory = null;     // TerritoryMap (bookkeeping)
let territoryLayer = null;// TerritoryLayer (the tinted tiles in the scene)
let tugBar = null;
let chevrons = null;
let beats = null;
let announcer = null;
let beatsFired = 0;
let lastShares = [0.5, 0.5];
let revealState = 'none'; // none | running | done
let revealSplit = null;
let chevFarM = 30;        // "apart" threshold for the chevron, set per city
const chevVec = new THREE.Vector3();   // reused every frame — no allocation

// Debug/Playwright hooks, same idiom as netdemo.
window.__arena = {
  get state() { return state; },
  get role() { return role; },
  get scene() { return scene; },
  blockCount() { return sim ? sim.blocks.length : 0; },
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
  // Rival-visibility probes (live two-context proof reads these).
  territoryCells() {
    if (!territory) return {};
    const out = {};
    for (const [slot, n] of territory.countBySlot()) out[slot] = n;
    return out;
  },
  tugShares() { return lastShares.slice(); },
  get beatsFired() { return beatsFired; },
  get reveal() { return revealState; },
  get revealSplit() { return revealSplit; },
  chevronVisible(slot) { return !!(chevrons && chevrons.wasOffscreen(slot)); },
  cameraFrame() {
    return view ? {
      cx: view.frameCX, cy: view.frameCY,
      halfX: view.frameHalfX, halfY: view.frameHalfY,
      fullHalfX: view.fullHalfX, fullHalfY: view.fullHalfY,
      follow: view.followIndex,
    } : null;
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

/** Two frames of breathing room so a status line paints before a multi-second,
 * main-thread city build (same idiom as main.js's loading frame). */
function nextFrames() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** Build the shared city and stamp the page with what was built, so a second
 * device (or a test) can read scene + block count straight off the DOM. */
function buildCity(seed, sceneId) {
  const s = new VoxelSandboxSim({ seed, scene: sceneId });
  document.body.dataset.scene = sceneId;
  document.body.dataset.blocks = String(s.blocks.length);
  return s;
}

function startMatchUI() {
  hideOverlays();
  hud.classList.add('on');
  state = 'playing';
  setupRivalLayer();
  if (matchMedia('(pointer: coarse)').matches) el('touch-hint').classList.add('on');
  setTimeout(() => el('touch-hint').classList.remove('on'), 6000);
}

// ------------------------------------------------------- rival visibility
/** Build the whole visibility layer once, at match start, on either role.
 * Everything here READS sim events / wire data; nothing writes sim state. */
function setupRivalLayer() {
  blockById = new Map();
  for (const b of sim.blocks) blockById.set(b.id, b);
  // Raw (un-multiplied) block mass from the LOCAL build — both sides built the
  // identical city from the shared seed, so tallies agree by construction.
  attribution = new AttributionRecord((id) => {
    const b = blockById.get(id);
    return b ? b.mat.mass * b.sx * b.sy * b.sz : 0;
  });
  territory = new TerritoryMap();
  territoryLayer = new TerritoryLayer(view.scene, columnCount(sim.blocks));

  // "Apart" for the chevron scales with the city: a third of its long side.
  const br = boundsRectOf(sim);
  chevFarM = Math.max(br.maxX - br.minX, br.maxZ - br.minZ) / 3;

  const rivalSlot = mySlot === 0 ? 1 : 0;
  const labelOf = (slot) => (slot === mySlot ? 'YOU' : rivalName);
  tugBar = new TugBar(el('tug-track'), [
    { slot: 0, label: labelOf(0) },
    { slot: 1, label: labelOf(1) },
  ]);
  // The bar's end labels are the redundant non-color channel (CC-4):
  // left end is always slot 0's territory, right end slot 1's.
  el('tug-you').textContent = labelOf(0);
  el('tug-you').style.color = COLOR_CSS[0];
  el('tug-rival').textContent = labelOf(1);
  el('tug-rival').style.color = COLOR_CSS[1];

  chevrons = new ChevronLayer(el('chevrons'));
  chevrons.ensure(rivalSlot, labelOf(rivalSlot));
  beats = new BeatTracker({ mySlot, slots: [0, 1] });
  announcer = new AnnounceQueue(el('callout'));

  // The match camera is the game's progressive follow-zoom: it tracks YOUR
  // hole and widens as you grow. Rendering the whole city on both phones was
  // the big-city FPS killer; the full-city frame now exists only in the end
  // reveal (the first time you see the whole two-colored city). With the
  // tight camera, the chevron is the way you know where your rival is.
  view.setFollow(mySlot);
}

/** One eat, from either source (host sim events / peer wire), into the record,
 * the territory tiles, and the beat detectors. Exactly once per block id. */
function noteEat(id, slot, { landmark = false } = {}) {
  if (!attribution || !attribution.recordEat(id, slot)) return;
  if (slot >= 0 && slot < 8) {
    const b = blockById.get(id);
    if (b) {
      const act = territory.mark(b, slot);
      if (act) territoryLayer.apply(act);
    }
    if (beats && state === 'playing') fireBeats(beats.noteEat(slot, { landmark }));
  }
}

const BEAT_PRIORITY = { [BEAT.LANDMARK]: 2, [BEAT.TRAILING]: 2, [BEAT.LEAD_TAKEN]: 1, [BEAT.FIRST_BLOOD]: 1 };

function fireBeats(list) {
  for (const beat of list) {
    const who = beat.slot === mySlot ? 'YOU' : (rivalPresent ? rivalName : slotName(beat.slot));
    announcer.say({
      text: BEAT_COPY[beat.type](who),
      color: beat.type === BEAT.TRAILING ? '#ffcf5c' : slotColorCss(beat.slot),
      priority: BEAT_PRIORITY[beat.type] || 0,
      ms: RIVAL.CALLOUT_MS,
    });
    beatsFired++;
  }
}

/** Fold the peer's pending wire news (eats + heals) into the record. */
function syncPeerConsumed() {
  if (!arenaPeer || !attribution) return;
  for (const id of arenaPeer.drainConsumed()) {
    const b = peerBlockById.get(id);
    if (b) {
      b.state = 'consumed';
      view.noteConsumed(b);   // the peer sim never steps; tell the view directly
    }
    const slot = arenaPeer.eaterOf.has(id) ? arenaPeer.eaterOf.get(id) : -1;
    noteEat(id, slot);
  }
  for (const e of arenaPeer.drainEvents()) {
    // Landmark beats ride the wire's event flag (AC-05.4); the eat itself was
    // already attributed above via drainConsumed + eaterOf.
    if (e.objectId > 0 && (e.flags & EVENT_FLAG.LANDMARK) && beats && state === 'playing') {
      fireBeats(beats.noteEat(e.slot, { landmark: true }).filter((b) => b.type === BEAT.LANDMARK));
    }
  }
}

/** Per-frame standings work: tug bar, beat detectors, chevron. Cheap — a few
 * comparisons; DOM writes only when a width/transform actually changed. */
function updateRivalSurfaces(secondsLeft) {
  if (!attribution) return;
  const masses0 = attribution.massBySlot[0], masses1 = attribution.massBySlot[1];
  const shares = computeShares([masses0, masses1]);
  lastShares = shares;
  tugBar.update(shares);
  if (beats && state === 'playing') {
    fireBeats(beats.update(attribution.shares([0, 1]), secondsLeft, attribution.totalCount > 0));
  }

  // Rival chevron (pattern 4), from the same positions the renderer draws —
  // sim truth on the host, the interpolated ghost on a peer. The arena's
  // orthographic camera frames the WHOLE city, so a rival is rarely outside
  // the frustum; the chevron's job here is "where are they when we're apart":
  // it orbits your own hole pointing at a far rival (the shipped directional-
  // indicator vocabulary, 552f290) and hands off — disappears — as they come
  // near. A genuinely off-frustum rival still pins to the screen edge.
  if (!chevrons || state !== 'playing') return;
  const rivalSlot = mySlot === 0 ? 1 : 0;
  let rx = null, rz = 0, rmass = 0, ox = 0, oz = 0;
  if (role === 'host') {
    if (rivalPresent && sim.holes[1]) { rx = sim.holes[1].x; rz = sim.holes[1].z; rmass = sim.holes[1].mass; }
    ox = sim.holes[0].x; oz = sim.holes[0].z;
  } else {
    const g = arenaPeer.roster.bySlot.get(0);
    if (g) { rx = g.x; rz = g.z; rmass = g.mass; }
    ox = arenaPeer.renderPos.x; oz = arenaPeer.renderPos.z;
  }
  if (rx === null) return;
  const w = window.innerWidth, h = window.innerHeight;
  chevVec.set(rx, 0, rz).project(view.camera);
  const proj = edgeProject(chevVec.x, chevVec.y, w, h,
    RIVAL.CHEVRON_INSET_PX, chevrons.wasOffscreen(rivalSlot));
  if (!proj.offscreen) {
    const apart = Math.hypot(rx - ox, rz - oz) > chevFarM;
    if (apart) {
      const rsx = proj.x, rsy = proj.y;   // rival's on-screen position
      chevVec.set(ox, 0, oz).project(view.camera);
      const osx = ((chevVec.x + 1) / 2) * w, osy = ((1 - chevVec.y) / 2) * h;
      const ang = Math.atan2(rsy - osy, rsx - osx);
      proj.x = Math.min(w - 30, Math.max(30, osx + Math.cos(ang) * 52));
      proj.y = Math.min(h - 30, Math.max(30, osy + Math.sin(ang) * 52));
      proj.angle = ang;
      proj.offscreen = true;   // "show the pointer" — apart is the arena's off-screen
    }
  }
  chevrons.update(rivalSlot, proj, chevronSize(rmass));
}

// ------------------------------------------------------------------ host flow
async function hostCity(pickedScene) {
  scene = pickedScene || DEFAULT_SCENE;
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
  roomHost = new ArenaRoomHost({ transport, code, maxPlayers: 2, generation: 1, scene });

  // The big cities are 30-70k blocks and build on the main thread — say so
  // before the multi-second stall, or the phone looks frozen.
  el('connecting-msg').textContent = `BUILDING ${sceneLabel(scene)}…`;
  await nextFrames();
  sim = buildCity(roomHost.seed, scene);
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
  el('host-city').textContent = sceneLabel(scene);
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
  // The scene comes from the handshake — the host is authoritative — and it
  // already passed protocol.js's allowlist, or the WELCOME would have been
  // dropped. The belt-and-braces check still runs before it reaches a sim.
  scene = ARENA_SCENES.includes(seat.scene) ? seat.scene : DEFAULT_SCENE;
  el('connecting-msg').textContent = `BUILDING ${sceneLabel(scene)}…`;
  await nextFrames();

  // The peer's own build of the same city: same seed, same scene, NEVER
  // stepped. Blocks die in it only when the wire says so.
  sim = buildCity(seat.seed, scene);
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
    arenaHost.sendKeyframe();   // final MATCH_OVER keyframe, per-slot eaten streams included
    mine = Math.floor(sim.holes[0].mass);
    theirs = Math.floor(rivalPresent && sim.holes[1] ? sim.holes[1].mass : 0);
  } else {
    // Fold every pending heal into the record first — the reveal must be
    // computed from the healed state (AC-06.2: same split even mid-heal).
    syncPeerConsumed();
    const own = arenaPeer.ownHole();
    const g = arenaPeer.roster.bySlot.get(0);
    mine = Math.floor(own.mass);
    theirs = Math.floor(g ? g.mass : 0);
  }
  startReveal(mine, theirs);
}

/**
 * The territory reveal (pattern 6). The WINNER is decided by the attribution
 * record — the same per-block, raw-mass data the craters and the bar showed
 * all match — because that record is bit-identical on both screens by
 * construction (AC-06.1/06.2); the score lines below it show each side's
 * combo-multiplied points as flavor.
 */
function startReveal(mineScore, theirsScore) {
  revealState = 'running';
  // The reveal's own bar takes over; the live tug bar and the chevron would
  // only double it (and the rival needs no finding on a full-city frame).
  el('tug').style.display = 'none';
  el('chevrons').style.display = 'none';
  if (announcer) announcer.clear();
  const split = finalSplit(attribution, [0, 1]);
  revealSplit = split.map((s) => s.percent);

  // Build the reveal bar's segments + percent readouts, colored per slot.
  const track = el('reveal-track');
  const pcts = el('reveal-pcts');
  track.textContent = ''; pcts.textContent = '';
  const segEls = [], pctEls = [];
  for (const s of split) {
    const seg = document.createElement('div');
    seg.className = 'tug-seg';
    seg.style.background = COLOR_CSS[s.slot];
    seg.style.width = (lastShares[s.slot] * 100) + '%';
    track.appendChild(seg);
    segEls.push(seg);
    const p = document.createElement('span');
    p.style.color = COLOR_CSS[s.slot];
    p.textContent = '';
    pcts.appendChild(p);
    pctEls.push(p);
  }

  const mineIdx = mySlot, rivalIdx = mySlot === 0 ? 1 : 0;
  const winIdx = split[0].mass === split[1].mass ? -1 : (split[0].mass > split[1].mass ? 0 : 1);
  el('reveal-head').textContent = ' ';
  el('reveal-lines').innerHTML =
    `YOU &nbsp;${mineScore.toLocaleString()} PTS<br>${rivalName} &nbsp;${theirsScore.toLocaleString()} PTS`;
  showOverlay('ov-reveal');

  // The camera pull-up: from the follow window out to the FULL-CITY frame —
  // deliberately the only moment the whole two-colored city is on screen.
  const c0 = { cx: view.frameCX, cy: view.frameCY, hx: view.frameHalfX, hy: view.frameHalfY };
  view.followIndex = null;   // the reveal owns the frame now
  const reveal = new Reveal({
    segEls, pctEls,
    onZoom: (t) => {
      view.setFrame(
        c0.cx + (view.fullCX - c0.cx) * t,
        c0.cy + (view.fullCY - c0.cy) * t,
        c0.hx + (view.fullHalfX - c0.hx) * t,
        c0.hy + (view.fullHalfY - c0.hy) * t,
      );
    },
    skipEl: el('ov-reveal'),
    ms: RIVAL.REVEAL_MS,
  });
  reveal.run(lastShares, split, () => {
    setTimeout(() => {
      const head = el('reveal-head');
      head.textContent = winIdx < 0 ? 'DEAD HEAT'
        : (winIdx === mineIdx ? 'YOU TAKE THE CITY' : `${rivalName} TAKES THE CITY`);
      head.style.color = winIdx < 0 ? '#e9eef6' : COLOR_CSS[winIdx < 0 ? mineIdx : winIdx];
      revealState = 'done';
    }, reveal.reduced ? 0 : RIVAL.REVEAL_HOLD_MS);
  });
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

  if (state === 'playing') updateRivalSurfaces(secondsLeft);

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
      // main.js's drain, standing in (ArenaHost detects it by array identity).
      // The drained events feed the visibility layer: every eat carries the
      // eating hole, and roster index IS the slot (AC-01.1).
      for (const e of sim.drainEvents()) {
        if (e.type !== 'eat' || !e.obj || e.obj.id == null) continue;
        const s = sim.holes.indexOf(e.hole);
        noteEat(e.obj.id, s >= 0 ? s : 0, { landmark: !!e.obj.landmark });
      }
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
    syncPeerConsumed();
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
// The city picker: one big tap target per finished city, gallery first as the
// quick default, built from the same allowlist the wire guard enforces.
{
  const list = el('city-list');
  for (const id of ARENA_SCENES) {
    const b = document.createElement('button');
    b.className = id === DEFAULT_SCENE ? 'city-btn default' : 'city-btn';
    b.dataset.scene = id;
    b.textContent = sceneLabel(id);
    if (id === DEFAULT_SCENE) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'SMALL & FAST';
      b.appendChild(tag);
    }
    b.addEventListener('click', () => hostCity(id));
    list.appendChild(b);
  }
}

el('btn-host').addEventListener('click', () => {
  state = 'pick';
  showOverlay('ov-pick');
});
el('btn-pick-back').addEventListener('click', () => { state = 'landing'; showOverlay('ov-landing'); });
el('btn-show-join').addEventListener('click', () => {
  state = 'join';
  showOverlay('ov-join');
  el('join-error').textContent = '';
  el('code-input').focus();
});
el('btn-join-back').addEventListener('click', () => { state = 'landing'; showOverlay('ov-landing'); });
el('btn-host-back').addEventListener('click', () => location.replace(location.pathname));
el('btn-again').addEventListener('click', () => location.replace(location.pathname));
el('btn-reveal-again').addEventListener('click', () => location.replace(location.pathname));

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
    el('copy-hint').textContent = `Copied. ${sceneLabel(scene)} awaits your rival.`;
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
