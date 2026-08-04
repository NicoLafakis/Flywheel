// Chase camera: frames the hole, orbits, zooms, and never clips into buildings.
// Collision: sample along the hole->camera ray against standing building AABBs
// and pull the camera in front of the first hit; pitch rises as it pulls in.

import * as THREE from 'three';

const SANDBOX_ZOOM_IN = 0.7;
const SANDBOX_ZOOM_OUT = 1.5;

export class ChaseCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 600);
    this.yaw = 0;
    this.pitch = 0.9;           // base elevation angle (rad)
    this.dist = 16;
    this.distScale = 1;         // settings slider multiplier
    this.sandboxSizeProgress = 0;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.blockers = [];         // {minX,maxX,minZ,maxZ,h} standing buildings
    this.lastHoleX = null;
    this.lastHoleZ = null;
    this.lookAhead = new THREE.Vector3();
    this.shakeIntensity = 0;
    this.shakeOffset = new THREE.Vector3();
    this.reducedMotion = false;
    this.followDir = false;   // opt-in: swing the yaw behind the direction of travel
    this._orbitHold = 0;      // manual-orbit grace period that suspends followDir
    this.fovBase = 50;
    this._fovKick = 0;        // temporary FOV punch (growth/milestone juice)
  }

  setBlockers(list) {
    this.blockers = list;
    // Tallest structure in the scene — the sandbox camera must clear this by
    // SIZE 10 so the player sees over the top of any building.
    this.maxBlockerH = list.reduce((m, b) => Math.max(m, b.h || 0), 0);
  }
  setReducedMotion(val) { this.reducedMotion = !!val; }
  setFollowDirection(val) { this.followDir = !!val; }
  setSandboxSizeProgress(progress) {
    this.sandboxSizeProgress = Math.max(0, Math.min(1, progress || 0));
  }

  // Brief FOV widen that eases back — used for growth/milestone moments.
  fovKick(v = 5) {
    if (this.reducedMotion) return;
    this._fovKick = Math.min(10, this._fovKick + v);
  }

  triggerShake(amount = 0.5) {
    if (this.reducedMotion) return;
    this.shakeIntensity = Math.min(2.0, this.shakeIntensity + amount);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Ray (2D, XZ) vs AABB slab test; returns smallest t in (0,1] or Infinity.
  rayHit2D(ox, oz, dx, dz, b) {
    let tmin = 0, tmax = 1;
    for (const [o, d, mn, mx] of [[ox, dx, b.minX, b.maxX], [oz, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-8) {
        if (o < mn || o > mx) return Infinity;
      } else {
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return Infinity;
      }
    }
    return tmin > 0.02 ? tmin : Infinity;
  }

  update(dt, holeX, holeZ, holeRadius, orbitDelta, zoomDelta) {
    this.yaw += orbitDelta;
    if (orbitDelta) this._orbitHold = 1.5;
    else if (this._orbitHold > 0) this._orbitHold -= dt;
    this.dist = Math.min(40, Math.max(8, this.dist + zoomDelta));

    // Smoothed velocity estimate. Campaign uses it as a look-ahead offset on
    // the camera target; in follow-direction mode it ONLY feeds the yaw chase
    // below — the target stays pinned on the hole, because any offset drags
    // the view toward the OLD heading mid-turn (the "off-center" feel).
    if (this.lastHoleX !== null && dt > 0) {
      const vx = (holeX - this.lastHoleX) / dt;
      const vz = (holeZ - this.lastHoleZ) / dt;
      const lookMax = this.followDir ? 1.5 : 4;
      const lookRate = this.followDir ? 6 : 4;
      const targetLookX = Math.max(-lookMax, Math.min(lookMax, vx * 0.4));
      const targetLookZ = Math.max(-lookMax, Math.min(lookMax, vz * 0.4));
      this.lookAhead.x += (targetLookX - this.lookAhead.x) * Math.min(1, dt * lookRate);
      this.lookAhead.z += (targetLookZ - this.lookAhead.z) * Math.min(1, dt * lookRate);
    }
    this.lastHoleX = holeX;
    this.lastHoleZ = holeZ;

    // Follow-direction yaw: while moving, ease the camera behind the
    // (smoothed) travel direction so the view always faces where you're
    // driving. Only swings when driving AWAY from the camera — following a
    // toward-camera heading is a positive feedback loop (the move basis is
    // camera-relative, so the flip reverses the input and the yaw spins).
    // Manual orbit input and Reduced Motion suspend it.
    if (this.followDir && !this.reducedMotion && this._orbitHold <= 0) {
      const spd = Math.hypot(this.lookAhead.x, this.lookAhead.z);
      if (spd > 0.5) {
        // horizontal camera look direction = -(sin yaw, cos yaw)
        const dot = (this.lookAhead.x * -Math.sin(this.yaw) + this.lookAhead.z * -Math.cos(this.yaw)) / spd;
        if (dot > 0.05) {
          const targetYaw = Math.atan2(this.lookAhead.x, this.lookAhead.z) + Math.PI;
          let d = targetYaw - this.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest signed angle
          this.yaw += d * Math.min(1, dt * 3);
          this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
        }
      }
    }

    this.target.set(
      holeX + (this.followDir ? 0 : this.lookAhead.x), 0,
      holeZ + (this.followDir ? 0 : this.lookAhead.z));
    this.smoothTarget.lerp(this.target, Math.min(1, dt * 8));

    // Calculate camera shake offset
    this.shakeOffset.set(0, 0, 0);
    if (this.shakeIntensity > 0.01 && !this.reducedMotion) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity * 0.5,
        (Math.random() - 0.5) * this.shakeIntensity
      );
      this.shakeIntensity *= Math.max(0, 1 - dt * 6);
    }

    // desired offset (framing scales with radius: tight at SIZE 1, wide at SIZE 12)
    let scale;
    if (this.followDir) {
      // sandbox: ~11 m at r=1.1 (SIZE 1). From SIZE 4 (r=2.6) the distance
      // ramps up so that by SIZE 10 (r=5.6) the camera clears the scene's
      // tallest blocker — the see-over-any-building rule — then clamps just
      // above that clearance instead of pulling out without bound.
      const base = 7 + holeRadius * 3.6;
      let d = base;
      if (this.maxBlockerH > 0) {
        const clearDist = (this.maxBlockerH + 8) / Math.sin(this.pitch);
        const t = Math.max(0, Math.min(1, (holeRadius - 2.6) / 3));
        const s = t * t * (3 - 2 * t);
        d = Math.min(base + (clearDist - base) * s, clearDist * 1.15);
      }
      const sandboxZoom = SANDBOX_ZOOM_IN +
        (SANDBOX_ZOOM_OUT - SANDBOX_ZOOM_IN) * this.sandboxSizeProgress;
      scale = (d / 16) * this.distScale * sandboxZoom;
    } else {
      scale = (1 + Math.pow(holeRadius, 0.85) * 0.22) * this.distScale;
    }
    const dist = this.dist * scale;
    const pitch = this.pitch;
    const dirX = Math.sin(this.yaw) * Math.cos(pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);

    // find nearest blocker along the ray
    let t = 1;
    for (const b of this.blockers) {
      const th = this.rayHit2D(this.smoothTarget.x, this.smoothTarget.z, dirX, dirZ, b);
      if (th < t) {
        // would the camera at that t be below the building top?
        const camY = th * dist * dirY;
        if (camY < b.h) t = th;
      }
    }

    const effT = Math.max(0.15, t * 0.92);
    // raise pitch when pulled in close so we look down over the obstruction
    const effPitch = pitch + (1 - effT) * 0.5;
    const cx = this.smoothTarget.x + Math.sin(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.x;
    const cz = this.smoothTarget.z + Math.cos(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.z;
    const cy = Math.max(2.5, Math.sin(effPitch) * dist * effT + this.shakeOffset.y);

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.smoothTarget.x, 0, this.smoothTarget.z);

    // FOV punch decay (growth/milestone moments)
    if (this._fovKick > 0.01) {
      this.camera.fov = this.fovBase + this._fovKick;
      this.camera.updateProjectionMatrix();
      this._fovKick *= Math.max(0, 1 - dt * 6);
    } else if (this.camera.fov !== this.fovBase) {
      this.camera.fov = this.fovBase;
      this.camera.updateProjectionMatrix();
    }
  }
}
