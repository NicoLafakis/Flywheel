// Input: keyboard (desktop) + virtual joystick / touch orbit (mobile).
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

    this.joyEl = document.getElementById('joystick');
    this.knobEl = document.getElementById('joystick-knob');

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.5 && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyActive = true;
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
      if (t.identifier === this.joyId) {
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
      if (t.identifier === this.joyId) {
        this.joyId = null; this.joyActive = false;
        this.joyVec = { x: 0, y: 0 };
        this.joyEl.classList.add('hidden');
        this.knobEl.style.transform = 'translate(-50%, -50%)';
      }
      if (t.identifier === this.orbitId) this.orbitId = null;
    }
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
  getMove(camYaw, dt) {
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
      if (this._basisYaw === null) this._basisYaw = camYaw;
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
