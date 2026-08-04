// Input: keyboard (desktop) + virtual joystick / touch orbit (mobile).
// Produces a camera-relative world-space move intent and orbit deltas.

const SANDBOX_TURN_SENS_START = 0.2;
const SANDBOX_TURN_SENS_END = 0.8;

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.orbitDelta = 0;      // radians, accumulated per frame
    this.zoomDelta = 0;
    this.moveVec = { x: 0, z: 0 }; // raw input, pre camera-rotation
    this.settings = { invertX: false, invertY: false };
    this.driveMode = false;   // sandbox: A/D steer, W/S throttle, Q/E strafe
    this.sandboxSizeProgress = 0;

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

  setSandboxSizeProgress(progress) {
    this.sandboxSizeProgress = Math.max(0, Math.min(1, progress || 0));
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
        this.orbitDelta += (t.clientX - this.orbitLastX) * 0.008;
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

  // camYaw: current camera yaw so movement is camera-relative.
  // Camera sits at yaw-offset behind the hole, so "forward" (W) is the
  // direction the camera looks: forward = (-sin(yaw), -cos(yaw)) in XZ.
  // driveMode (voxel sandbox): A/D STEER the heading (turn in place),
  // W/S are throttle forward/back, Q/E sidestep — like driving a car.
  // Turn and strafe are separate abilities on separate keys by design.
  getMove(camYaw) {
    let ix = 0, iy = 0, steer = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy += 1;
    if (this.driveMode) {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer += 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer -= 1;
      if (this.keys.has('KeyQ')) ix -= 1;
      if (this.keys.has('KeyE')) ix += 1;
    } else {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
      if (this.keys.has('KeyQ')) this.orbitDelta += 0.03;
      if (this.keys.has('KeyE')) this.orbitDelta -= 0.03;
    }
    ix += this.joyVec.x;
    iy += this.joyVec.y;
    if (this.settings.invertX) { ix = -ix; steer = -steer; }
    if (this.settings.invertY) iy = -iy;

    if (this.keys.has('KeyR')) this.zoomDelta -= 0.4;
    if (this.keys.has('KeyF')) this.zoomDelta += 0.4;
    // Sandbox steering sensitivity ramps gradually from .2 at SIZE 1 to
    // .8 at SIZE 12; the regular settings slider remains a multiplier.
    const sandboxTurnSens = SANDBOX_TURN_SENS_START +
      (SANDBOX_TURN_SENS_END - SANDBOX_TURN_SENS_START) * this.sandboxSizeProgress;
    const turnSens = this.driveMode ? sandboxTurnSens : (this.settings.turnSens || 1);
    this.orbitDelta += steer * 0.045 * turnSens;

    if (ix === 0 && iy === 0) return { x: 0, z: 0 };
    // rotate input by camera yaw: ix along right = (cos, -sin), iy along
    // -forward (screen down) = (sin, cos)
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw);
    return {
      x: ix * cos + iy * sin,
      z: -ix * sin + iy * cos,
    };
  }

  consumeOrbit() { const d = this.orbitDelta; this.orbitDelta = 0; return d; }
  consumeZoom() { const d = this.zoomDelta; this.zoomDelta = 0; return d; }
}
