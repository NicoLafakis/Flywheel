// Input: keyboard (desktop) + virtual joystick / touch orbit (mobile) + an
// optional world-space point-to-move scheme (drag or tap, touch or mouse).
// Produces a camera-relative world-space move intent and orbit deltas.

// Held-key rates are PER SECOND. They used to be per frame, which quietly made
// the whole control scheme a function of how fast the machine ran: the same
// 0.7 s press of A turned the camera 2.99 rad on an idle 400 fps frame and
// 0.14 rad/s once a big collapse dragged the scene down to 3 fps — unsteerable
// at exactly the moment steering matters. Each constant below is the old
// per-frame step times 60, so a player at 60 fps feels no change at all.
// Exported so the settings screen can print the real orbit rate instead of
// keeping its own copy of this number (js/ui/screens.js).
export const ORBIT_RATE = 2.6;   // Q/E manual orbit at SIZE 1
const ZOOM_RATE = 24;     // was 0.4/frame   — R/F dolly
// Manual orbit ramps with hole size, on the same sizeT the camera uses. Two
// reasons, and the second is the load-bearing one:
//   1. the hole travels 2.6x faster at SIZE 12, so a heading correction has to
//      land in proportionally less time or it lands somewhere else;
//   2. the camera's own standoff ramps from ~11 m to ~57 m over the same range
//      (camera.js clearDist), and a manual orbit at a fixed rad/s therefore
//      drags the camera through 5x the arc-length for the same input — it FEELS
//      slower to the player because the world barely turns relative to how far
//      the camera has flown.
// 2.6 -> 5.2 rad/s is 149 -> 298 deg/s, against the 103 deg/s flat rate this
// replaces and the 31 deg/s of the drive-mode steering before that.
export const ORBIT_RATE_RAMP = 2;
// The sandbox's old A/D steering (STEER_RATE = 2.7 rad/s x a size-ramped 0.2 ->
// 0.8 sensitivity, i.e. 0.54 rad/s and 11.6 s per revolution at SIZE 1) is gone.
// A/D are strafe again and the camera aims itself — see chaseMode below and the
// yaw chase in camera.js. `turnSens` survives as a multiplier on the manual Q/E
// orbit that remains, which is the only turning the player now does by hand.
// Same clamp main.js puts on the sim's catch-up (main.js:308). A frame that
// took longer than this is a stall, and integrating the whole of it would snap
// the camera round rather than turn it.
const MAX_INPUT_DT = 0.1;

// --- point-to-move ----------------------------------------------------------
// A press that is short AND barely travelled is a TAP: the target sticks and the
// hole drives to it unattended. Anything else is a DRAG: the target tracks the
// finger and is dropped on release. One projection serves both, so tap-to-move
// is not a second control scheme, it is the same one with a different release
// rule. 14 px is the usual touch slop. 350 ms rather than the usual ~250: touch
// events are dispatched on the main thread, so a frame the size of a district
// collapse delays the touchend without the finger having been down any longer —
// measured 265 ms of wall clock across a synthetic 50 ms press on this scene.
// Erring long only ever misreads a slow deliberate press as a tap, and a tap
// that overshoots is one more tap to correct; erring short misreads real taps as
// drags, which does nothing at all and reads as the control being broken.
const TAP_MS = 350;
const TAP_PX = 14;
// Dead window after input is suspended, during which a press cannot start a new
// gesture. It exists because a full-screen overlay that yields DURING a gesture
// hands the rest of that gesture to the canvas: the READY gate takes the
// pointerdown, calls activate(), and adds .rg-out — which is pointer-events:none
// — so the touchstart that follows the same press milliseconds later hit-tests
// straight through to the game. Measured on Brooklyn: pressing START set a
// world destination under the sign and the hole drove to it. The press that
// dismisses an overlay must not also be a move order, and that is true of any
// overlay, so the rule lives here rather than in the gate.
const PT_RELEASE_GRACE = 0.25;   // s

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.orbitDelta = 0;      // radians, accumulated per frame
    this.zoomDelta = 0;
    this.moveVec = { x: 0, z: 0 }; // raw input, pre camera-rotation
    this.settings = { invertX: false, invertY: false };
    // Voxel sandbox: the camera aims itself at the direction of travel, so the
    // move basis has to be latched. See the latch in getMove().
    this.chaseMode = false;
    this._basisYaw = null;    // latched move basis (rad), or null when idle
    // Fired on the frame a fresh press adopts the live camera yaw. The chase
    // camera uses it to drop its manual look offset, which that press has just
    // made stale — see ChaseCamera.recentre() for why leaving it ratchets.
    this.onBasisLatch = null;
    this.sandboxSizeProgress = 0;
    // getMove is called once per rendered frame, so the gap between calls IS
    // the frame time. Measuring it here means the fix needs nothing from the
    // caller — but getMove also accepts an explicit dt, so a caller that
    // already has one (main.js has `realDt`) can hand it over instead.
    this._lastMoveT = 0;

    // joystick state
    this.joyActive = false;
    this.joyId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyVec = { x: 0, y: 0 };
    // orbit touch state
    this.orbitId = null;
    this.orbitLastX = 0;

    // point-to-move state
    this.camera = null;       // live three.js camera; the screen->ground raycast
    this._pt = null;          // gesture in flight: {id, downT, x0, y0, moved}
    this._ptTarget = null;    // {x, z} world destination, or null
    this._ptArrived = false;
    this._ptBlockUntil = 0;   // ms; presses before this are the tail of a dismissal

    this.joyEl = document.getElementById('joystick');
    this.knobEl = document.getElementById('joystick-knob');

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this._clearPoint(); });

    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    // Mouse is a separate listener set rather than Pointer Events: pointerdown
    // ALSO fires for touch, so unifying them would double-handle every tap
    // against the touch handlers above. move/up are on window so a drag that
    // leaves the canvas keeps tracking and still releases.
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }

  // Point-to-move is a SETTING, read live off the settings object main.js
  // assigns (it hands over the same object the settings screen mutates, so a
  // toggle takes effect on the next frame with no wiring in between). Absent
  // from older saves, which reads as off.
  get pointMove() { return !!(this.settings && this.settings.pointMove); }

  // The camera the screen->ground raycast projects through. Set once per level
  // from main.js; null disables point-to-move rather than guessing a projection.
  setCamera(camera) { this.camera = camera; }

  // Is an orbit finger DOWN — as distinct from an orbit finger MOVING.
  //
  // The chase camera's recentre grace is refreshed by a non-zero orbitDelta, and
  // orbitDelta is deliberately a function of pixels dragged (see onTouchMove), so
  // a finger that has stopped moving emits exactly nothing while still being a
  // player deliberately holding a look. Measured with the grace at 0.15 s, that
  // gap cost 12.6 deg of the look per 0.25 s of stillness and 44.1 deg per 0.5 s
  // — the camera walking out from under a finger that never left the glass. So
  // "the pointer is down" has to be reported separately from "the pointer moved".
  //
  // Touch only, and that is complete rather than partial: the mouse has no orbit
  // drag to report (onMouseDown is point-to-move only — Q/E are the mouse's
  // manual look), and Q/E emit an orbitDelta on every frame they are held, so
  // the keyboard path is already covered by the delta itself.
  get orbitHeld() { return this.orbitId !== null; }

  onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.pointMove) {
        // FIRST finger points, SECOND finger orbits, and the joystick is gone.
        // Not a coexistence — a replacement, for three reasons: pointing needs
        // the whole screen, so the left/right half split that gives the joystick
        // its home would make half the city unreachable; the joystick is
        // camera-relative and needs the basis latch while pointing is
        // world-space and must not have one, so a frame where both were live
        // would have two different answers to "what does this input mean"; and a
        // second finger is the one gesture that cannot be confused with the
        // first. Manual look survives, it just moves to the other thumb.
        if (this._pt === null) this._beginPoint(t.identifier, t.clientX, t.clientY, e.timeStamp);
        else if (this.orbitId === null) { this.orbitId = t.identifier; this.orbitLastX = t.clientX; }
        continue;
      }
      if (t.clientX < window.innerWidth * 0.5 && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyActive = true;
        this._markerMode(false);   // same node, back to thumb-rest proportions
        this.joyEl.classList.remove('hidden');
        this.joyEl.style.left = `${t.clientX}px`;
        this.joyEl.style.top = `${t.clientY}px`;
      } else if (this.orbitId === null) {
        this.orbitId = t.identifier;
        this.orbitLastX = t.clientX;
      }
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._pt && t.identifier === this._pt.id) {
        this._movePoint(t.clientX, t.clientY);
      } else if (t.identifier === this.joyId) {
        const dx = t.clientX - this.joyOrigin.x;
        const dy = t.clientY - this.joyOrigin.y;
        const len = Math.hypot(dx, dy);
        const max = 50;
        const cl = Math.min(len, max);
        const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
        this.joyVec = { x: (nx * cl) / max, y: (ny * cl) / max };
        this.knobEl.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
      } else if (t.identifier === this.orbitId) {
        // Deliberately coupled to PIXELS DRAGGED, not to time — correct for a
        // drag gesture. turnSens scales it in the sandbox for the same reason it
        // scales Q/E: this drag is now the player's only manual camera, so the
        // slider has to reach it or it reaches nothing on touch.
        this.orbitDelta += (t.clientX - this.orbitLastX) * 0.008 * this._orbitSens();
        this.orbitLastX = t.clientX;
      }
    }
  }

  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (this._pt && t.identifier === this._pt.id) this._endPoint(e.timeStamp);
      if (t.identifier === this.joyId) {
        this.joyId = null; this.joyActive = false;
        this.joyVec = { x: 0, y: 0 };
        this.joyEl.classList.add('hidden');
        this.knobEl.style.transform = 'translate(-50%, -50%)';
      }
      if (t.identifier === this.orbitId) this.orbitId = null;
    }
  }

  // Mouse mirrors the first finger exactly. There is no mouse orbit drag to
  // mirror the second finger: Q/E already are the mouse's manual look, and a
  // right-drag would mean suppressing the context menu over the whole canvas for
  // a control that is already bound.
  onMouseDown(e) {
    if (!this.pointMove || e.button !== 0 || this._pt) return;
    e.preventDefault();
    this._beginPoint('mouse', e.clientX, e.clientY, e.timeStamp);
  }

  onMouseMove(e) {
    if (this._pt && this._pt.id === 'mouse') this._movePoint(e.clientX, e.clientY);
  }

  onMouseUp(e) {
    if (this._pt && this._pt.id === 'mouse' && e.button === 0) this._endPoint(e.timeStamp);
  }

  // ------------------------------------------------------- point-to-move guts
  // Timed off the EVENT's timeStamp, not off performance.now() in the handler.
  // Both are on the same clock, but timeStamp is when the browser generated the
  // event and now() is when a busy main thread got round to running us — and
  // this game deliberately tolerates 100 ms frames during a collapse, so the
  // second measures the frame, not the finger. Measured: a synthetic 50 ms press
  // read as 265 ms of handler-clock on Lower Manhattan, i.e. a real tap taken
  // mid-collapse would have been misread as a press-and-hold and thrown away.
  _now(tstamp) {
    if (Number.isFinite(tstamp) && tstamp > 0) return tstamp;
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  }

  _beginPoint(id, cx, cy, tstamp) {
    const t = this._now(tstamp);
    if (t < this._ptBlockUntil) return;   // still inside the overlay-release grace
    this._pt = { id, downT: t, x0: cx, y0: cy, moved: 0 };
    // A fresh press drops whatever a previous tap left standing, BEFORE the new
    // aim is tried — so a press whose ray misses the ground cannot silently
    // inherit the old destination. Mid-drag the opposite rule applies: _aimAt
    // keeps the last good point, because a finger that grazes the sky for a
    // frame meant to keep going, not to stop.
    this._ptTarget = null;
    this._ptArrived = false;
    this._aimAt(cx, cy);
  }

  _movePoint(cx, cy) {
    const g = this._pt;
    const d = Math.hypot(cx - g.x0, cy - g.y0);
    if (d > g.moved) g.moved = d;
    this._aimAt(cx, cy);
  }

  _endPoint(tstamp) {
    const g = this._pt;
    this._pt = null;
    if (!g) return;
    const tap = (this._now(tstamp) - g.downT) <= TAP_MS && g.moved <= TAP_PX;
    // Drag: releasing stops. Tap: the target outlives the gesture and getMove
    // retires it on arrival.
    if (!tap) { this._ptTarget = null; this._ptArrived = false; this._hideMarker(); }
  }

  _aimAt(cx, cy) {
    const hit = this._groundAt(cx, cy);
    if (!hit) return;
    this._ptTarget = hit;
    this._ptArrived = false;
  }

  _clearPoint() {
    this._pt = null;
    this._ptTarget = null;
    this._ptArrived = false;
    this._hideMarker();
  }

  // Drop any live gesture AND its destination. Called by main.js on every frame
  // the level intro is holding, because a tap-to-move target is the one input
  // that OUTLIVES the frame it was made on: main.js already substitutes a zero
  // move vector while the READY gate is up, which is enough for keys and the
  // stick but not for a target that simply waits. Measured on Brooklyn — a tap
  // aimed at the READY sign set a world destination and the hole set off for it
  // the instant the gate released, so pressing START doubled as a move order.
  cancelPointer() {
    this._ptBlockUntil = this._now() + PT_RELEASE_GRACE * 1000;
    if (this._pt || this._ptTarget) this._clearPoint();
  }

  // Screen point -> the y = 0 ground plane, through the LIVE camera.
  //
  // A real raycast, not a fixed assumption, because there is no pitch or
  // standoff this could be pinned to: the sandbox camera's distance ramps from
  // ~11 m at SIZE 1 to ~57 m at SIZE 12, its effPitch rises with every blocker
  // it pulls in behind, and the roof lift moves it vertically again. Any of
  // those alone breaks a "screen delta is metres" shortcut.
  //
  // Done with raw matrix arithmetic rather than THREE.Raycaster so this module
  // keeps its zero three.js imports — it is also imported by the settings screen
  // and by anything headless that wants the orbit constants.
  //
  // Returns null when the ray does not meet the ground, and there is deliberately
  // NO fallback distance behind that. A clamped "head that way for 400 m" reads
  // as reasonable and is not: an unplaced camera (matrixWorld still identity on
  // the frame a level starts, before the first cam.update) sits at y = 0 with a
  // horizontal ray, which fails the plane test and would have sent the hole on a
  // 396 m sprint in a straight line — measured, from a tap dispatched one frame
  // too early. Ignoring the gesture is the honest answer: there is no ground
  // under that pixel. Nothing legitimate is lost, because the chase camera looks
  // down 53.9 deg with a 25 deg half-FOV and the roof lift only steepens it, so
  // the horizon is never on screen and every real pixel does meet the plane.
  _groundAt(clientX, clientY) {
    const cam = this.camera;
    if (!cam || !cam.matrixWorld || !this.canvas) return null;
    cam.updateMatrixWorld();
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((clientY - r.top) / r.height) * 2;
    const e = cam.matrixWorld.elements;   // column-major: 0-2 right, 4-6 up, 8-10 BACK
    const px = e[12], py = e[13], pz = e[14];
    const tv = Math.tan((cam.fov * Math.PI / 180) / 2);
    const th = tv * cam.aspect;
    let dx = e[0] * nx * th + e[4] * ny * tv - e[8];
    let dy = e[1] * nx * th + e[5] * ny * tv - e[9];
    let dz = e[2] * nx * th + e[6] * ny * tv - e[10];
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    if (dy > -1e-3 || py <= 0.01) return null;   // ray never reaches y = 0
    const t = -py / dy;
    return { x: px + dx * t, z: pz + dz * t };
  }

  // World point -> client pixels, for the destination marker. Returns null when
  // the point is behind the camera. Same matrices as the raycast, inverted, so
  // the marker cannot disagree with the target it is marking.
  _screenAt(x, z) {
    const cam = this.camera;
    if (!cam || !cam.matrixWorldInverse || !this.canvas) return null;
    const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const ex = v[0] * x + v[8] * z + v[12];
    const ey = v[1] * x + v[9] * z + v[13];
    const ez = v[2] * x + v[10] * z + v[14];
    const cw = p[3] * ex + p[7] * ey + p[11] * ez + p[15];
    if (cw <= 1e-6) return null;
    const cxp = (p[0] * ex + p[4] * ey + p[8] * ez + p[12]) / cw;
    const cyp = (p[1] * ex + p[5] * ey + p[9] * ez + p[13]) / cw;
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (cxp + 1) * 0.5 * r.width, y: r.top + (1 - cyp) * 0.5 * r.height };
  }

  // The destination marker reuses the joystick ring, which point mode has
  // retired anyway: it is already positioned in client pixels, already
  // pointer-events:none, and already inside #hud, so it hides itself with the
  // HUD on every menu and under the READY gate. Pinned to the WORLD target
  // rather than to the pixel that was touched — the camera moves under a tap,
  // and a marker that drifted off the ground point would be worse than none.
  // The ring is 120 px with a 52 px filled knob, which is right for a thumb rest
  // and wrong for a destination pip — on a 390 px-wide phone that is a third of
  // the width of the screen sitting on the exact spot the player is trying to
  // look at. Shrunk by inline style rather than by a new CSS rule so the two
  // uses of the same node stay in one file; the joystick path sets it back.
  _markerMode(on) {
    if (!this.joyEl) return;
    this.joyEl.style.width = this.joyEl.style.height = on ? '44px' : '120px';
    if (this.knobEl) this.knobEl.style.transform = on
      ? 'translate(-50%, -50%) scale(0.26)' : 'translate(-50%, -50%)';
  }

  _syncMarker() {
    if (!this.joyEl) return;
    const t = this._ptTarget;
    if (!t) { this._hideMarker(); return; }
    const s = this._screenAt(t.x, t.z);
    if (!s) { this._hideMarker(); return; }
    this._markerMode(true);
    this.joyEl.classList.remove('hidden');
    this.joyEl.style.left = `${s.x}px`;
    this.joyEl.style.top = `${s.y}px`;
  }

  _hideMarker() {
    if (!this.joyEl) return;
    this.joyEl.classList.add('hidden');
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)';
  }

  // World-space move intent from the live target, or null to fall through to
  // keys/joystick. NO camera basis anywhere in here, which is the entire point
  // of the scheme: the direction is fixed in the world, so the chase camera can
  // slew wherever it likes without changing what the player asked for. There is
  // no feedback loop to cut, and therefore no basis latch to cut it with.
  _pointMoveVec(hole) {
    const t = this._ptTarget;
    if (!t || !hole) return null;
    const dx = t.x - hole.x, dz = t.z - hole.z;
    const d = Math.hypot(dx, dz);
    // Arrival ring scales with the hole. A fixed ring would have SIZE 12 (radius
    // 5.6 m) grinding toward a point already well inside itself, and SIZE 1
    // (radius 1.1 m) stopping short. Hysteresis on the way back out so a target
    // that lands on the rim cannot chatter the hole in and out of motion.
    const stop = Math.max(0.6, (hole.radius || 1) * 0.5);
    if (this._ptArrived) {
      if (d < stop * 1.8) return { x: 0, z: 0 };
      this._ptArrived = false;
    } else if (d <= stop) {
      this._ptArrived = true;
      if (!this._pt) { this._ptTarget = null; this._hideMarker(); }  // tap goto served
      return { x: 0, z: 0 };
    }
    // NOTE: normalised, because both sims normalise `move` themselves
    // (voxelsim.js step, sim.js step) — a sub-unit magnitude would be scaled
    // straight back up. Distance-proportional speed needs one line in the sim,
    // not here; until then a drag sets DIRECTION only.
    return { x: dx / d, z: dz / d };
  }

  setSandboxSizeProgress(progress) {
    this.sandboxSizeProgress = Math.max(0, Math.min(1, progress || 0));
  }

  // turnSens AND the size ramp apply to manual orbit in chaseMode only. The
  // campaign's Q/E orbit is left at the bare 1.8 rad/s it has always run at —
  // sandboxSizeProgress is 0 there, so the ramp is identity, but the base
  // constant moved, hence the explicit branch rather than relying on it.
  _orbitSens() {
    if (!this.chaseMode) return (1.8 / ORBIT_RATE);
    return (this.settings.turnSens || 1) *
      (1 + (ORBIT_RATE_RAMP - 1) * this.sandboxSizeProgress);
  }

  // Seconds since the previous getMove call, clamped. Falls back to one 60 fps
  // frame on the first call and whenever the clock is unavailable or has jumped
  // (tab restored, level intro held for a while), so no press can ever be
  // integrated over dead time.
  _frameDt(explicit) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    const prev = this._lastMoveT;
    this._lastMoveT = now; // kept current even when a caller supplies its own dt
    if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, MAX_INPUT_DT);
    if (!now || !prev) return 1 / 60;
    return Math.min(Math.max((now - prev) / 1000, 0), MAX_INPUT_DT) || 1 / 60;
  }

  // camYaw: current camera yaw so movement is camera-relative.
  // Camera sits at yaw-offset behind the hole, so "forward" (W) is the
  // direction the camera looks: forward = (-sin(yaw), -cos(yaw)) in XZ.
  // A/D strafe, Q/E orbit the camera by hand, R/F dolly.
  // hole: {x, z, radius} — only point-to-move needs it; omit it and the scheme
  // is inert, which is what every caller that predates it does.
  getMove(camYaw, dt, hole) {
    const step = this._frameDt(dt);
    let ix = 0, iy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    const orbitRate = ORBIT_RATE * this._orbitSens();
    if (this.keys.has('KeyQ')) this.orbitDelta += orbitRate * step;
    if (this.keys.has('KeyE')) this.orbitDelta -= orbitRate * step;
    ix += this.joyVec.x;
    iy += this.joyVec.y;
    if (this.settings.invertX) ix = -ix;
    if (this.settings.invertY) iy = -iy;

    if (this.keys.has('KeyR')) this.zoomDelta -= ZOOM_RATE * step;
    if (this.keys.has('KeyF')) this.zoomDelta += ZOOM_RATE * step;

    // --- point-to-move ------------------------------------------------------
    // Resolved BEFORE the latched basis and it wins outright while a target is
    // live, so a stray key cannot argue with a finger. Keys are not disabled by
    // the setting though: on a desktop both are reasonable, and WASD picks up
    // again the frame the pointer target retires.
    if (this.pointMove) {
      const pt = this._pointMoveVec(hole);
      this._syncMarker();
      if (pt) { this._basisYaw = null; return pt; }
    } else if (this._ptTarget || this._pt) {
      this._clearPoint();   // setting turned off mid-gesture
    }

    // --- latched move basis (chaseMode) -------------------------------------
    // The sandbox camera aims itself at the direction of travel, which closes a
    // loop the campaign does not have: basis = camera yaw -> world direction ->
    // yaw target -> camera yaw. Left open it winds up (measured: 19 rad in 3 s
    // on a reversal), and the old fix was to refuse to follow any heading that
    // pointed back at the camera, which is precisely the case the player wanted.
    //
    // Cut the loop here instead. The basis is latched on the RISING EDGE of
    // input — first frame any key or the stick is live — and held until every
    // input is released. While it is latched the camera can slew anywhere it
    // likes and a held key still resolves to the same world-space direction, so
    // the heading is an exogenous input to the chase and there is no loop left
    // to wind up.
    //
    // Latching on the edge rather than re-anchoring whenever the input
    // direction CHANGES matters, and the difference is not cosmetic:
    // re-anchoring to the live yaw on every change reopens the loop for analog
    // input, because a thumb sweeping the stick would pick up the camera's own
    // rotation on each re-anchor and drift faster than the thumb. Holding one
    // basis for a whole press means a change in input direction rotates the
    // world direction by exactly that change, which is the behaviour a player
    // predicts, and the only thing that ever moves the basis is a fresh press —
    // by which time the camera has usually already settled behind them.
    const idle = ix === 0 && iy === 0;
    if (this.chaseMode && idle) this._basisYaw = null;
    if (idle) return { x: 0, z: 0 };
    let basis = camYaw;
    if (this.chaseMode) {
      if (this._basisYaw === null) {
        this._basisYaw = camYaw;
        // This press has just redefined "behind the heading" as the yaw the
        // camera already has, so any manual look offset the camera is holding
        // describes a heading that no longer exists.
        if (this.onBasisLatch) this.onBasisLatch(camYaw);
      }
      basis = this._basisYaw;
    }

    // rotate input by the basis yaw: ix along right = (cos, -sin), iy along
    // -forward (screen down) = (sin, cos)
    const cos = Math.cos(basis), sin = Math.sin(basis);
    return {
      x: ix * cos + iy * sin,
      z: -ix * sin + iy * cos,
    };
  }

  consumeOrbit() { const d = this.orbitDelta; this.orbitDelta = 0; return d; }
  consumeZoom() { const d = this.zoomDelta; this.zoomDelta = 0; return d; }
}
