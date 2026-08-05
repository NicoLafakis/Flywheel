// Chase camera: frames the hole, orbits, zooms, and never clips into buildings.
// Collision: sample along the hole->camera ray against standing building AABBs
// and pull the camera in front of the first hit; pitch rises as it pulls in.

import * as THREE from 'three';

const SANDBOX_ZOOM_IN = 0.7;
const SANDBOX_ZOOM_OUT = 1.5;
// Standoff the blocker sweep applies to every camera offset, hit or not.
const BLOCKER_EASE = 0.92;
const CAM_FAR = 600;             // gameplay far plane; the intro stretches it and restores it

// --- follow-direction chase (voxel sandbox only) -----------------------------
// The yaw chase is a CRITICALLY DAMPED SPRING, not the old exponential lerp.
// An exponential (`yaw += err * dt * k`) has its peak angular rate at t = 0, so
// a 180 deg reversal starts at k*pi rad/s — at the old k = 3 that is 9.4 rad/s,
// a whip-pan straight out of standstill. The spring accelerates into the turn
// (0 -> the rate cap in ~30 ms at omega = 7) and decelerates out of it with no
// overshoot, which is what makes a big swing readable instead of nauseating.
//
// omega = 7 rad/s settles a critically damped system to within 5% in 4.744/omega
// = 0.68 s, which is the "small correction feels attached" number. The rate cap
// is what governs the big swings: 3.5 rad/s = 200 deg/s, so a full 180 deg
// reversal sweeps in ~0.9 s and a full revolution in 1.8 s. Compare the scheme
// this replaces — A/D steering at STEER_RATE * sandboxTurnSens, 0.54 rad/s at
// SIZE 1, i.e. 11.6 s per revolution, and only if the player held the key.
// Both RAMP with hole size, and the two ramps are not the same shape because
// they are not tracking the same kind of signal.
//
// SPATIAL rates (the target filter, the occlusion standoff filter) chase a
// signal that moves in METRES. The sandbox hole now runs 9.96 m/s at SIZE 1 and
// 26.12 m/s at SIZE 12, so a fixed per-second rate lags 2.6x further at the top
// of the ladder — measured, the target filter's lag would go 0.545 m -> 1.43 m
// and the standoff filter would spend 2.6x more metres catching up, which is
// exactly the window in which the camera ends up inside geometry. Scaling them
// by the traversal-speed ratio holds the lag constant in METRES, which is what
// the framing actually cares about. See _spatialRate.
//
// ANGULAR rates (the chase spring) chase a signal that moves in RADIANS, and a
// heading change is a heading change at any size. They still ramp, but far more
// gently and for a different reason: at 2.6x the speed, the same convergence
// time is 2.6x more DISTANCE travelled while the camera is still catching up.
// Holding that distance constant would demand ~9.5 rad/s (545 deg/s), which is
// a nausea machine, so the ramp is capped at what reads as fast rather than at
// what the geometry would like — 4.2 -> 7.0 rad/s, i.e. 240 -> 400 deg/s.
// Measured worst-case convergence to within 5 deg over 240 cases (48 headings x
// 5 start offsets) is 0.983 s at SIZE 1 and 0.633 s at SIZE 12.
// End-to-end measured hole speed is 9.96 m/s at SIZE 1 and 26.12 m/s at SIZE 12,
// a ratio of 2.62. Rounded UP to 2.71 on purpose: this multiplies filter rates,
// and a first-order filter that is marginally too fast lags slightly less than
// asked, while one that is too slow lags more — of the two roundings only one
// fails in the direction of the complaint this work exists to fix.
const TRAVEL_SPEED_RATIO = 2.71;
const FOLLOW_OMEGA = 8;            // at SIZE 1; x1.5 at SIZE 12
const FOLLOW_OMEGA_RAMP = 1.5;
const FOLLOW_MAX_RATE = 4.2;       // rad/s at SIZE 1
const FOLLOW_MAX_RATE_RAMP = 1.667;
// Clearance above a roof the camera has been forced to climb over. Matches the
// 2.5 m floor on cy — the same "do not sit level with a surface" margin.
const ROOF_CLEAR = 2.5;
// Heading deadzone, in m/s of hole velocity. The sandbox hole runs 9.96 m/s at
// SIZE 1 and 26.1 m/s at SIZE 12, so 1.5 m/s is ~15% of the slowest real speed:
// far above the numerical noise of a parked hole (which is exactly 0 — the sim
// only integrates when `move` is non-zero) and far below anything the player
// can produce on purpose. Below it the yaw target simply stops updating, so a
// stationary hole cannot jitter the camera.
const FOLLOW_DEADZONE = 1.5;
// The hole has no inertia — release the key and velocity is 0 on the next tick —
// so a deadzone alone would abandon a swing the instant the player let go, and
// leave the camera parked half-turned. Coasting the chase for 1.2 s past the
// last motion is longer than the worst swing (0.9 s) and short enough that a
// player who has genuinely stopped gets the camera back to look around with.
const FOLLOW_COAST = 1.2;
// Smoothing on the heading signal. 12/s = 83 ms, roughly half the 167 ms the
// old code inherited from `lookAhead`. It can be this tight because the signal
// is clean: the sim integrates a normalised direction, so hole velocity is a
// step function, not a noisy measurement.
const FOLLOW_VEL_RATE = 12;
// Manual-orbit grace before the chase resumes. Was 1.5 s, which read as "the
// camera has given up" — and in the old drive-mode scheme A/D fed orbitDelta,
// so it was re-armed every steering frame and the chase never ran at all.
const ORBIT_HOLD = 0.7;
// Target smoothing, SPATIAL — scaled by _spatialRate. 14/s = 71 ms in the
// sandbox at SIZE 1 against 8/s = 125 ms in the campaign: the sandbox hole is
// the thing the player is directly driving, and 125 ms of positional lag is the
// "camera lags behind where I actually am" complaint. The campaign keeps a flat
// 8 because its look-ahead offset is already doing the leading, a tighter target
// would fight it, and none of this size ramp exists there.
const TARGET_RATE_FOLLOW = 14;
const TARGET_RATE_CAMPAIGN = 8;
// Occlusion pull-in / push-out rates (1/s), also SPATIAL. Asymmetric on purpose:
// crossing behind a tower has to reclaim the distance gently (3.5/s = 286 ms) or
// the camera pops, but going INTO occlusion is safety-critical, so 9/s = 111 ms
// with a hard containment clamp and a roof lift behind it.
const BLOCKER_T_IN = 9;
const BLOCKER_T_OUT = 3.5;

// --- level intro (see beginIntro) -------------------------------------------
// Wide establishing lens. Widening the FOV instead of only pulling back cuts
// the overview distance by ~27%, which keeps a tall scene inside the far plane
// and halves the apparent dolly speed on the way in.
const INTRO_FOV = 65;
const INTRO_ZOOM_DUR = 1.4;      // s, overview -> normal framing
const INTRO_ORBIT_RATE = 0.08;   // rad/s establishing drift (~78 s / revolution)
const INTRO_FALLBACK_R = 30;     // framed radius (m) when the scene has no blockers
const INTRO_MARGIN = 1.04;       // air around the fitted box
// Ceiling on the overview distance. Measured in SCENE RADII, not metres: a
// portrait viewport legitimately needs ~4.3 radii where 16:9 needs ~2, so a
// fixed metre ceiling is load-bearing on phones and slack everywhere else, and
// it silently crops the first time a scene grows. 6 radii is a backstop against
// a pathologically narrow viewport (the lateral term diverges as aspect -> 0),
// not a framing decision. INTRO_MAX_DIST is the absolute stop behind it.
const INTRO_MAX_RADII = 6;
const INTRO_MAX_DIST = 900;
const INTRO_FAR_MARGIN = 1.12;   // headroom on the stretched far plane
// Hold-yaw search (see _bestIntroYaw). 72 steps over a half turn is 2.5 deg;
// the curve is broad and smooth, so finer buys nothing.
const INTRO_YAW_STEPS = 72;
// Half-width of the establishing orbit. The hold distance is fitted to the
// worst pose inside this arc, so a narrower arc is a closer, larger shot: on
// Brooklyn a full circle needs 250.7 m where +/-20 deg needs far less. It is an
// arc rather than a full sweep because the fit has to hold at every yaw the
// camera can reach, and a full sweep therefore always costs the worst yaw.
const INTRO_ORBIT_ARC = 0.35;    // rad, ~20 deg either side
// How much fit distance the yaw search may give up to find a better-lit pose.
// A budget rather than a weight: the scale cost is capped and legible, where a
// blended score hides how much of one was traded for the other.
const INTRO_LIGHT_SLACK = 0.08;

// OS Reduced Motion, module-scoped on purpose. VoxelWorld3D subscribes
// per-instance and unhooks in dispose(), but a ChaseCamera is constructed fresh
// on every level and sandbox start (main.js:120, main.js:153) and nothing ever
// tears it down — a per-instance listener would leak one per level load. One
// listener for the whole app, read live by the getter below, leaks nothing.
let osReducedMotion = false;
try {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    osReducedMotion = !!mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', (e) => { osReducedMotion = !!e.matches; });
  }
} catch (e) { /* no matchMedia (headless/older) — motion stays enabled */ }

export class ChaseCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, CAM_FAR);
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
    this._settingReduced = false;   // the in-game toggle; see the accessor below
    this.followDir = false;   // opt-in: swing the yaw behind the direction of travel
    this._orbitHold = 0;      // manual-orbit grace period that suspends followDir
    this._followYaw = null;   // last commanded "behind the heading" yaw, or null
    this._followCoast = 0;    // s of chase left after the hole stopped moving
    this._yawVel = 0;         // rad/s, the chase spring's state
    this._velX = 0;           // smoothed hole velocity, UNCLAMPED — see update()
    this._velZ = 0;
    this._effT = null;        // smoothed blocker standoff; null = adopt the raw one
    this._lift = 0;           // roof-clearance floor on cy (m), eases down only
    this._span = { enter: 0, exit: 0 };  // raySpan2D scratch; ~540 calls/frame
    this.fovBase = 50;
    this._fovKick = 0;        // temporary FOV punch (growth/milestone juice)

    // Level intro. Inert until beginIntro() is called: introK stays 0, which
    // makes every term below an exact identity.
    this.introPhase = 'off';  // 'off' | 'hold' | 'zoom'
    this._introK = 0;         // 1 = full overview, 0 = normal framing
    this._introT = 0;         // elapsed zoom time (s)
    this._fitX = null;        // (x extent, z extent, height) frontier, from the pivot
    this._fitZ = null;
    this._fitH = null;
    this._introSnap = false;  // pin smoothTarget on the first intro frame
    this._introOrbit = INTRO_ORBIT_RATE;
    this._introMaxDist = INTRO_MAX_DIST;
    this._introDur = INTRO_ZOOM_DUR;
    this._introMinR = 0;      // caller-supplied floor on the framed radius
    this._introMinBox = null; // ...or the same floor as real world bounds
    this._introSun = null;    // unit vector toward the light, or null
    this._introArc = INTRO_ORBIT_ARC;
    this._introYaw0 = 0;      // chosen establishing azimuth
    this._introOsc = 0;       // orbit phase within the arc (rad)
    this._introOscYaw = 0;    // yaw the orbit is currently contributing
    this._introDistCache = null;
    this._introDistAspect = 0;
    this._blockerBox = null;  // raw XZ bounds of the blocker list, or null
    this._sceneBox = null;    // pivot the establishing shot looks at, or null
  }

  setBlockers(list) {
    this.blockers = list;
    // Tallest structure in the scene — the sandbox camera must clear this by
    // SIZE 10 so the player sees over the top of any building. The XZ centre of
    // the same list is what the level intro's establishing shot looks at.
    let maxH = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of list) {
      if (b.h > maxH) maxH = b.h;
      if (b.minX < minX) minX = b.minX;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.minZ < minZ) minZ = b.minZ;
      if (b.maxZ > maxZ) maxZ = b.maxZ;
    }
    this.maxBlockerH = maxH;
    this._blockerBox = list.length ? { minX, maxX, minZ, maxZ } : null;
    this._sceneBox = list.length
      ? { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 }
      : null;
    this._buildIntroFit();
  }

  // Level-intro fit data: for every blocker, its half-extents in X and Z from
  // the shot's PIVOT plus its height. Three numbers per blocker, not one radius,
  // because the framing requirement is anisotropic — a city 69 m wide and 122 m
  // deep needs 69 m of lateral room when viewed down its long axis, and a single
  // radius spends 124 m on both. Collapsing to a radius is what made portrait
  // pull back 1.87x further than the geometry needs.
  //
  // Extents are measured FROM THE PIVOT, which is _sceneBox — not the world
  // origin and not the content centroid. Measured on Brooklyn the three differ
  // materially (69.3/122.5 from the pivot vs 78/112 from the origin vs
  // 69.1/107.5 from the centroid), and only the pivot is the point the camera
  // actually looks at.
  //
  // Kept as a 3D Pareto frontier: an entry is dropped only if some other blocker
  // is at least as far out in X, in Z, AND at least as tall. Nothing real is
  // discarded, and the per-frame path stays short.
  _buildIntroFit() {
    const box = this._sceneBox;
    this._fitX = null;
    this._fitZ = null;
    this._fitH = null;
    if (!box) return;
    const pts = [];
    for (const b of this.blockers) {
      pts.push([
        Math.max(Math.abs(b.minX - box.cx), Math.abs(b.maxX - box.cx)) * INTRO_MARGIN,
        Math.max(Math.abs(b.minZ - box.cz), Math.abs(b.maxZ - box.cz)) * INTRO_MARGIN,
        (b.h || 0) * INTRO_MARGIN,
      ]);
    }
    // ground-level scenery the blocker list never sees (beaches, piers): a real
    // box in world space, folded in at zero height
    const mb = this._introMinBox;
    if (mb) {
      pts.push([
        Math.max(Math.abs(mb.minX - box.cx), Math.abs(mb.maxX - box.cx)) * INTRO_MARGIN,
        Math.max(Math.abs(mb.minZ - box.cz), Math.abs(mb.maxZ - box.cz)) * INTRO_MARGIN,
        0,
      ]);
    }
    pts.sort((a, b) => b[0] - a[0]);   // widest X first
    const fx = [], fz = [], fh = [];
    for (const p of pts) {
      let dominated = false;
      for (let i = 0; i < fx.length; i++) {
        // everything already kept has fx >= p[0], so X is covered by construction
        if (fz[i] >= p[1] && fh[i] >= p[2]) { dominated = true; break; }
      }
      if (dominated) continue;
      fx.push(p[0]); fz.push(p[1]); fh.push(p[2]);
    }
    this._fitX = Float64Array.from(fx);
    this._fitZ = Float64Array.from(fz);
    this._fitH = Float64Array.from(fh);
  }

  // OS preference OR the in-game toggle, matching VoxelWorld3D so the camera and
  // the renderer never disagree inside one frame. The toggle can switch reduced
  // motion ON when the OS says nothing, but must never switch OFF what the OS
  // asked for. Read through a getter rather than cached, so an OS change takes
  // effect live without every instance needing its own listener.
  get reducedMotion() { return osReducedMotion || this._settingReduced; }
  set reducedMotion(val) { this._settingReduced = !!val; }

  setReducedMotion(val) {
    this._settingReduced = !!val;
    // Turning it on mid-dolly must not leave the player mid-flight.
    if (this.reducedMotion && this.introPhase === 'zoom') this.skipIntro();
  }
  setFollowDirection(val) { this.followDir = !!val; }
  setSandboxSizeProgress(progress) {
    this.sandboxSizeProgress = Math.max(0, Math.min(1, progress || 0));
  }

  // A per-second rate that has to keep pace with how fast the hole crosses the
  // world. Identity at SIZE 1, x TRAVEL_SPEED_RATIO at SIZE 12 — so anything
  // measured in metres of lag stays where it was tuned instead of stretching
  // with the speed ramp. Identity outside the sandbox: sandboxSizeProgress is 0
  // on every campaign camera, so the campaign gets its old constants exactly.
  _spatialRate(base) {
    return base * (1 + (TRAVEL_SPEED_RATIO - 1) * this.sandboxSizeProgress);
  }

  // Brief FOV widen that eases back — used for growth/milestone moments.
  fovKick(v = 5) {
    if (this.reducedMotion) return;
    this._fovKick = Math.min(10, this._fovKick + v);
  }

  // ---------------------------------------------------------- level intro
  // Park the camera on a wide overview of the whole city and HOLD there (the
  // READY card sits on top of it) until releaseIntro() eases it down to normal
  // framing. Everything the intro adds — distance, FOV, orbit drift — is an
  // offset that decays to zero, so the settled shot is exactly what the normal
  // path would have produced on its own. Call after setBlockers().
  //   opts.orbit    rad/s establishing drift (0 disables)
  //   opts.maxDist  ceiling on the overview distance (m) — pull it in on
  //                 fogged scenes so the city does not wash out
  //   opts.duration zoom length (s)
  //   opts.minR     floor on the framed footprint RADIUS (m), for ground-level
  //                 scenery that never reaches the blocker list. Isotropic, so
  //                 it spends the long axis on both — prefer minBox.
  //   opts.minBox   {minX,maxX,minZ,maxZ} world bounds of that same scenery.
  //                 Absolute, not half-extents, so there is no question of what
  //                 they are measured from: the camera resolves them against its
  //                 own pivot. Also recentres the shot on all content rather
  //                 than on the blockers alone.
  //   opts.orbitArc half-width (rad) of the establishing orbit. The hold
  //                 distance is fitted to the worst pose inside it, so a
  //                 narrower arc is a closer, larger shot; 0 is a static pose.
  //   opts.sun      {x,y,z} direction TOWARD the light. Supply it and the yaw
  //                 search prefers poses that show sunlit facades; omit it and
  //                 the search is scale-only, exactly as before.
  //   opts.yaw      force the establishing azimuth (rad)
  beginIntro(opts) {
    this.introPhase = 'hold';
    this._introK = 1;
    this._introT = 0;
    this._introSnap = true;
    this._introOrbit = opts && opts.orbit !== undefined ? opts.orbit : INTRO_ORBIT_RATE;
    this._introMaxDist = (opts && opts.maxDist) || INTRO_MAX_DIST;
    this._introDur = (opts && opts.duration) || INTRO_ZOOM_DUR;
    this._introMinR = (opts && opts.minR) || 0;
    this._introMinBox = (opts && opts.minBox) || null;
    this._introSun = null;
    if (opts && opts.sun) {
      const s = opts.sun;
      const m = Math.hypot(s.x, s.y, s.z);
      if (m > 1e-6) this._introSun = { x: s.x / m, y: s.y / m, z: s.z / m };
    }
    this._introArc = opts && opts.orbitArc !== undefined ? opts.orbitArc : INTRO_ORBIT_ARC;
    this._introOsc = 0;
    this._introOscYaw = 0;
    this._introDistCache = null;

    // The pivot moves when minBox adds content the blockers never saw, so the
    // fit has to be rebuilt against it before anything reads a distance.
    const bb = this._blockerBox, mb = this._introMinBox;
    if (bb || mb) {
      const lo = (a, b) => (a === null ? b : b === null ? a : Math.min(a, b));
      const hi = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));
      this._sceneBox = {
        cx: (lo(bb && bb.minX, mb && mb.minX) + hi(bb && bb.maxX, mb && mb.maxX)) / 2,
        cz: (lo(bb && bb.minZ, mb && mb.minZ) + hi(bb && bb.maxZ, mb && mb.maxZ)) / 2,
      };
      this._buildIntroFit();
    }

    this._introYaw0 = opts && opts.yaw !== undefined ? opts.yaw : this._bestIntroYaw();
    this.yaw = this._introYaw0;
  }

  // Establishing azimuth. Two objectives, and they are not the same one:
  //
  //   SCALE — the arc whose worst pose needs the camera closest, which is the
  //   arc that puts the most city on screen. Period pi: a box presents the same
  //   silhouette from opposite sides.
  //
  //   LIGHT — how much of the visible surface faces the sun. Period 2pi, and
  //   that asymmetry is the whole point: yaw and yaw+pi are identical to the fit
  //   and opposite to the sun, so a search over half the circle picks one of a
  //   lit/unlit pair arbitrarily. With a bounded arc the shot sits near one
  //   azimuth for its whole duration, so which one it lands on is the
  //   difference between a sunlit hero frame and a silhouette.
  //
  // Resolved with an EXCHANGE RATE rather than a blended score or a flat budget.
  // Start from the best-lit pose that is already at the closest distance — that
  // is free, and it is the case the sun term mainly exists for, since yaw and
  // yaw+pi cost exactly the same and differ enormously in light. Only then
  // consider paying distance for more light, and never pay more than it is
  // worth: a shot 1% wider has to return at least 1% more lit surface.
  //
  // A flat budget is not enough. Measured on Brooklyn in portrait, it spent the
  // whole 8% allowance to buy 2.7% more light — a trade nobody would take if
  // they saw the two numbers side by side. INTRO_LIGHT_SLACK stays as the hard
  // cap on top of the rate. opts.yaw overrides all of it.
  _bestIntroYaw() {
    if (!this._fitX || !this._fitX.length) return this.yaw;
    const full = this._introSun ? 2 : 1;      // no sun, no reason to sweep twice
    const n = INTRO_YAW_STEPS * full;
    const yawOf = (s) => (s / n) * Math.PI * full;

    let dmin = Infinity;
    for (let s = 0; s < n; s++) {
      const d = this._fitArc(yawOf(s), this._introArc);
      if (d < dmin) dmin = d;
    }

    // free light: best-lit pose among those already at the closest distance
    let base = -Infinity, bestYaw = this.yaw, bestLit = -Infinity;
    for (let s = 0; s < n; s++) {
      const yaw = yawOf(s);
      if (this._fitArc(yaw, this._introArc) > dmin * 1.0001) continue;
      const lit = this._litScoreAt(yaw);
      if (lit > base) { base = lit; bestLit = lit; bestYaw = yaw; }
    }

    // paid light, at par or better
    for (let s = 0; s < n; s++) {
      const yaw = yawOf(s);
      const d = this._fitArc(yaw, this._introArc);
      if (d > dmin * (1 + INTRO_LIGHT_SLACK)) continue;
      const lit = this._litScoreAt(yaw);
      if (base > 0 && lit / base - 1 < d / dmin - 1) continue;
      if (lit > bestLit) { bestLit = lit; bestYaw = yaw; }
    }
    return bestYaw;
  }

  // Fraction of the visible building surface that faces the sun, weighted by how
  // much of the frame each face actually occupies. Lambertian against a
  // directional light, which is what the renderer uses.
  //
  // A box face with normal n is visible when n . f < 0 (f being the view
  // direction), and its projected area scales with |n . f|. Ground and sky are
  // left out deliberately: both are constant across yaw, so they move the
  // absolute number without changing which yaw wins.
  _litScoreAt(yaw) {
    const L = this._introSun;
    if (!L) return 0;
    const p = this.pitch + (1 - BLOCKER_EASE) * 0.5;
    const sp = Math.sin(p), cp = Math.cos(p);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const wx = Math.abs(sy * cp), wz = Math.abs(cy * cp);
    // which side of each axis is turned toward the camera, and is that side lit
    const litX = Math.max(0, sy > 0 ? L.x : -L.x);
    const litZ = Math.max(0, cy > 0 ? L.z : -L.z);
    const litY = Math.max(0, L.y);
    let lit = 0, total = 0;
    for (const b of this.blockers) {
      const dx = b.maxX - b.minX, dz = b.maxZ - b.minZ, h = b.h || 0;
      const ax = dz * h * wx;          // the X-facing wall
      const az = dx * h * wz;          // the Z-facing wall
      const ay = dx * dz * sp;         // the roof
      lit += ax * litX + az * litZ + ay * litY;
      total += ax + az + ay;
    }
    return total > 0 ? lit / total : 0;
  }


  // Player hit the CTA. Reduced Motion lands on the final framing directly —
  // the establishing shot is fine, the flight through it is not.
  releaseIntro() {
    if (this.introPhase !== 'hold') return;
    if (this.reducedMotion) { this.skipIntro(); return; }
    this.introPhase = 'zoom';
    this._introT = 0;
  }

  // Straight to normal framing (replay path, or a cancelled intro).
  skipIntro() {
    this.introPhase = 'off';
    this._introK = 0;
    this._introT = 0;
    // unwind whatever the orbit was contributing, so yaw lands where it would
    // have been if the intro had never run
    this.yaw -= this._introOscYaw;
    this._introOscYaw = 0;
    this._introOsc = 0;
    this._introDistCache = null;
  }

  introActive() { return this.introPhase !== 'off'; }
  introHolding() { return this.introPhase === 'hold'; }

  // Radial distance that frames the scene from the pivot through the intro's
  // wide lens. Fits height as well as footprint: a hero landmark far taller than
  // the map is wide is exactly what the establishing shot exists to show off,
  // and a footprint-only fit crops its top off.
  //
  // Fit against the pitch and standoff the placement code ACTUALLY uses, not
  // the raw ones: it pulls every offset in by BLOCKER_EASE and steepens the
  // pitch to match. Modelling the raw values under-frames by ~30%, which crops
  // precisely the top of the hero landmark the shot exists to show off.
  //
  // Yaw-INDEPENDENT on purpose: it is fitted once
  // to the worst pose inside the orbit's arc, so the camera never dollies in and
  // out as the city turns (that reads as breathing). Bounding the arc is what
  // makes the anisotropic fit pay — a full 360 sweep has to cover the long axis
  // laterally and is no better than a radius.
  _overviewDist() {
    if (this._introDistCache !== null && this._introDistAspect === this.camera.aspect) {
      return this._introDistCache;
    }
    const d = Math.min(
      Math.min(this._introMaxDist, INTRO_MAX_RADII * this._fitRadiusMax()),
      this._fitArc(this._introYaw0, this._introArc) / BLOCKER_EASE,
    );
    this._introDistCache = d;
    this._introDistAspect = this.camera.aspect;
    return d;
  }

  // Worst framing requirement over an arc of +/- half around centre. The fit is
  // period-pi in yaw (only |sin| and |cos| enter), so a half-turn covers it.
  _fitArc(centre, half) {
    let d = this._fitAt(centre);
    if (half > 0) {
      const steps = Math.max(2, Math.ceil(half / 0.05));
      for (let i = -steps; i <= steps; i++) {
        const v = this._fitAt(centre + (half * i) / steps);
        if (v > d) d = v;
      }
    }
    return d;
  }

  // Framing requirement at one azimuth. An axis-aligned box of half-extents
  // (ex, ez) about the pivot presents, to a camera at azimuth yaw, a depth
  // extent of ex|sin| + ez|cos| and a lateral extent of ex|cos| + ez|sin|.
  _fitAt(yaw) {
    const tv = Math.tan(INTRO_FOV * Math.PI / 360);
    const th = tv * Math.max(0.2, this.camera.aspect);
    const p = this.pitch + (1 - BLOCKER_EASE) * 0.5;
    const sp = Math.sin(p), cp = Math.cos(p);
    const sy = Math.abs(Math.sin(yaw)), cy = Math.abs(Math.cos(yaw));
    const fx = this._fitX, fz = this._fitZ, fh = this._fitH;
    if (!fx || !fx.length) {
      // nothing to frame (gallery sandbox): a plain radius around the target
      const r = Math.max(INTRO_FALLBACK_R, this._introMinR * INTRO_MARGIN);
      return this._fitOne(r, r, 0, sp, cp, tv, th);
    }
    let d = 0;
    for (let i = 0; i < fx.length; i++) {
      const a = fx[i] * sy + fz[i] * cy;      // along the camera's ground axis
      const b = fx[i] * cy + fz[i] * sy;      // lateral
      const v = this._fitOne(a, b, fh[i], sp, cp, tv, th);
      if (v > d) d = v;
    }
    // Legacy isotropic floor. Unchanged for any caller that passes minR and no
    // minBox — the other three scenes must not move.
    if (this._introMinR) {
      const r = this._introMinR * INTRO_MARGIN;
      const v = this._fitOne(r, r, 0, sp, cp, tv, th);
      if (v > d) d = v;
    }
    return d;
  }

  // Widest radius the overview has to cover — drives both the distance ceiling
  // and the far plane, so neither is a fixed number that a bigger scene outgrows.
  _fitRadiusMax() {
    let r = this._introMinR * INTRO_MARGIN;
    const fx = this._fitX, fz = this._fitZ;
    if (fx && fx.length) {
      for (let i = 0; i < fx.length; i++) {
        const h = Math.hypot(fx[i], fz[i]);
        if (h > r) r = h;
      }
    } else if (r <= 0) {
      r = INTRO_FALLBACK_R;
    }
    return r;
  }

  // Distance that keeps a box of depth half-extent a and lateral half-extent b,
  // at height h, inside the frame. a === b reproduces the old radius fit exactly.
  _fitOne(a, b, h, sp, cp, tv, th) {
    let d = a * cp + a * sp / tv;                                   // near edge, ground
    d = Math.max(d, h * sp - a * cp + (h * cp + a * sp) / tv);      // far edge, roofline
    d = Math.max(d, h * sp + a * cp + Math.abs(h * cp - a * sp) / tv); // near edge, roofline
    return Math.max(d, h * sp + a * cp + b / th);                   // lateral
  }

  triggerShake(amount = 0.5) {
    if (this.reducedMotion) return;
    this.shakeIntensity = Math.min(2.0, this.shakeIntensity + amount);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Ray (2D, XZ) vs AABB slab test. Returns the ENTRY and EXIT parameters of the
  // overlap, unclamped at the near end so a ray that starts INSIDE the box says
  // so (entry <= 0) instead of pretending the box is not there.
  //
  // That distinction is the whole defect. The old test clamped tmin to 0 and
  // then threw the result away with `tmin > 0.02 ? tmin : Infinity`, so a ray
  // whose origin sat inside a building reported "clear" — and the origin here is
  // the HOLE, which spends much of its life inside a footprint because eating
  // one is the game. The camera was then placed at full standoff inside the same
  // building with nothing telling it to move.
  //
  // Writes into a caller-owned scratch object; this runs once per blocker per
  // frame against ~540 of them and must not allocate.
  raySpan2D(ox, oz, dx, dz, b, out) {
    let tmin = -Infinity, tmax = Infinity;
    if (Math.abs(dx) < 1e-8) {
      if (ox < b.minX || ox > b.maxX) return null;
    } else {
      let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(dz) < 1e-8) {
      if (oz < b.minZ || oz > b.maxZ) return null;
    } else {
      let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    if (tmin > tmax || tmax <= 0) return null;   // no overlap, or entirely behind
    out.enter = tmin === -Infinity ? -1 : tmin;
    out.exit = tmax === Infinity ? 1e9 : tmax;
    return out;
  }

  // Back-compat wrapper. Same contract as before EXCEPT that containment now
  // reports -1 rather than Infinity — callers that treat "not a positive t" as
  // "clear" were the bug, so the value they see has to change.
  rayHit2D(ox, oz, dx, dz, b) {
    const s = this.raySpan2D(ox, oz, dx, dz, b, this._span);
    if (!s) return Infinity;
    if (s.enter <= 0.02) return -1;              // origin is inside this box
    return s.enter <= 1 ? s.enter : Infinity;
  }

  // Tallest roof standing over this XZ point, or 0. Doubles as the containment
  // test — a point is inside iff its Y is below the value this returns. Same
  // "below the roof" rule the sweep uses, so the two can never disagree about
  // what counts as an obstruction: a camera above b.h is looking over the roof,
  // not stuck in it. b.h === 0 is a blocker the player has demolished.
  _roofOver(x, z) {
    let h = 0;
    for (const b of this.blockers) {
      if (b.h > h && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) h = b.h;
    }
    return h;
  }

  _insideBlocker(x, y, z) {
    for (const b of this.blockers) {
      if (y < b.h && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
    }
    return false;
  }

  update(dt, holeX, holeZ, holeRadius, orbitDelta, zoomDelta) {
    this.yaw += orbitDelta;
    // Manual orbit suspends the chase and DUMPS its spring velocity — carrying a
    // half-finished swing under the player's own drag is the "camera fights me"
    // feel, and restarting the spring from rest is what makes the hand-back at
    // the end of ORBIT_HOLD an ease rather than a resumed lurch.
    if (orbitDelta) { this._orbitHold = ORBIT_HOLD; this._yawVel = 0; }
    else if (this._orbitHold > 0) this._orbitHold -= dt;
    this.dist = Math.min(40, Math.max(8, this.dist + zoomDelta));

    // Level intro timeline (inert unless beginIntro() was called).
    if (this.introPhase !== 'off') {
      if (this.introPhase === 'zoom') {
        this._introT += dt;
        const u = Math.min(1, this._introT / this._introDur);
        // smootherstep: leaves the hold gently instead of snapping to full
        // speed, and settles rather than arriving hot.
        this._introK = 1 - u * u * u * (u * (u * 6 - 15) + 10);
        if (u >= 1) this.skipIntro();
      }
      // Slow establishing drift, bounded to the arc the distance was fitted to
      // — an unbounded sweep would eventually reach a pose the fit does not
      // cover. Applied as an offset that is removed and re-added each frame, so
      // manual orbit input and followDir still act on the base yaw, and so it
      // decays to exactly zero with _introK instead of leaving the camera
      // permanently rotated by however long the player sat on the READY card.
      //
      // _introOrbit is still the pin: at 0 the phase never advances, the offset
      // stays 0, and the pose is static. Harnesses rely on that.
      this.yaw -= this._introOscYaw;
      // Phase rate is scaled by the arc so opts.orbit keeps meaning ANGULAR
      // SPEED: d(arc*sin)/dt peaks at arc * rate, so without this a narrow arc
      // would silently slow the drift in proportion to how narrow it is.
      if (!this.reducedMotion && this._introArc > 1e-6) {
        this._introOsc += (this._introOrbit / this._introArc) * dt;
      }
      this._introOscYaw = this._introArc * Math.sin(this._introOsc) * this._introK;
      this.yaw += this._introOscYaw;
    }

    // Velocity estimate, and the two modes want DIFFERENT ones.
    //
    // Campaign: a look-ahead OFFSET on the camera target, clamped per axis to
    // +/-4 m so a fast player cannot fling the framing off the hole.
    //
    // Sandbox: a HEADING, and the per-axis clamp is poison for a heading. The
    // old code reused lookAhead (clamped to +/-1.5 m) for the yaw chase, and at
    // 9.96 m/s the hole saturates that clamp on both axes — a heading of
    // (4.98, 8.63) m/s clamps to (1.5, 1.5) and reads as 45 deg. Every
    // off-axis direction collapsed onto the nearest diagonal, which is a large
    // part of "the camera lags behind actual positioning". So the chase gets its
    // own smoothed, UNCLAMPED velocity and the campaign path is left untouched.
    if (this.lastHoleX !== null && dt > 0) {
      const vx = (holeX - this.lastHoleX) / dt;
      const vz = (holeZ - this.lastHoleZ) / dt;
      if (this.followDir) {
        const k = Math.min(1, dt * FOLLOW_VEL_RATE);
        this._velX += (vx - this._velX) * k;
        this._velZ += (vz - this._velZ) * k;
      } else {
        const targetLookX = Math.max(-4, Math.min(4, vx * 0.4));
        const targetLookZ = Math.max(-4, Math.min(4, vz * 0.4));
        this.lookAhead.x += (targetLookX - this.lookAhead.x) * Math.min(1, dt * 4);
        this.lookAhead.z += (targetLookZ - this.lookAhead.z) * Math.min(1, dt * 4);
      }
    }
    this.lastHoleX = holeX;
    this.lastHoleZ = holeZ;

    // Follow-direction yaw: ease the camera behind the travel direction so the
    // view always faces where you're driving and the player never has to touch
    // a camera key. Manual orbit input and Reduced Motion suspend it.
    //
    // THE TOWARD-CAMERA CASE. This used to be gated on `dot > 0.05` — the chase
    // only ran when the hole moved AWAY from the camera — because the move basis
    // is camera-relative, so chasing a reversing heading rotated the basis under
    // a held key, which rotated the heading, which rotated the yaw further: a
    // positive feedback loop that wound the yaw 19 rad in 3 s. That gate is gone,
    // and the loop is broken AT ITS SOURCE instead: `controls.chaseMode` latches
    // the move basis on the rising edge of input and holds it until every key is
    // released (controls.js:getMove), so a held input produces one fixed
    // world-space direction no matter what the yaw does. With the basis frozen
    // the heading is an exogenous input to the chase, the feedback path does not
    // exist, and following a 180 deg reversal is just a large error to settle.
    // Latching at the source is what lets the camera be UNCONDITIONAL here;
    // damping the chase instead would only have slowed the wind-up down.
    //
    // Runs on the BASE yaw. The intro adds _introOscYaw as an offset it removes
    // and re-adds every frame, and the chase must not aim at, or bake in, a
    // number that is about to decay to zero on its own.
    const osc = this._introOscYaw;
    this.yaw -= osc;
    if (this.followDir && !this.reducedMotion) {
      const spd = Math.hypot(this._velX, this._velZ);
      if (spd > FOLLOW_DEADZONE) {
        this._followYaw = Math.atan2(this._velX, this._velZ) + Math.PI;
        this._followCoast = FOLLOW_COAST;
      } else if (this._followCoast > 0) {
        this._followCoast -= dt;
      }
      const sizeT = this.sandboxSizeProgress;
      const omega = FOLLOW_OMEGA * (1 + (FOLLOW_OMEGA_RAMP - 1) * sizeT);
      const maxRate = FOLLOW_MAX_RATE * (1 + (FOLLOW_MAX_RATE_RAMP - 1) * sizeT);
      if (this._followYaw !== null && this._followCoast > 0 && this._orbitHold <= 0) {
        let err = this._followYaw - this.yaw;
        err = Math.atan2(Math.sin(err), Math.cos(err)); // shortest signed angle
        // critically damped: a = w^2*err - 2*w*v, so it never overshoots and
        // therefore can never settle into a limit cycle around the heading
        this._yawVel += (omega * omega * err - 2 * omega * this._yawVel) * dt;
        this._yawVel = Math.max(-maxRate, Math.min(maxRate, this._yawVel));
        // Never step past the target in one frame. At the SIZE 12 ceiling of
        // 400 deg/s a 0.1 s stall frame (main.js clamps realDt there) is a
        // 40 deg step, which on a nearly-settled camera would overshoot and give
        // the spring something to bounce off.
        const step = this._yawVel * dt;
        this.yaw += Math.abs(step) > Math.abs(err) ? err : step;
        this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
      } else {
        // Coast expired or the player took the camera: bleed the spring to rest
        // rather than freezing it mid-swing.
        this._yawVel -= this._yawVel * Math.min(1, dt * 2 * omega);
      }
    }
    this.yaw += osc;

    this.target.set(
      holeX + (this.followDir ? 0 : this.lookAhead.x), 0,
      holeZ + (this.followDir ? 0 : this.lookAhead.z));
    // The intro opens on a static hole, so pin the target rather than letting
    // the overview slide in from wherever smoothTarget happened to be.
    if (this._introSnap) { this._introSnap = false; this.smoothTarget.copy(this.target); }
    this.smoothTarget.lerp(this.target, Math.min(1, dt * (this.followDir
      ? this._spatialRate(TARGET_RATE_FOLLOW) : TARGET_RATE_CAMPAIGN)));

    // The establishing shot frames the CITY, not the hole, so the look target
    // slides from the scene centre onto the hole as the dolly comes in — which
    // is what makes the release read as a push-in TO the circle. k = 0 leaves
    // smoothTarget untouched.
    let tx = this.smoothTarget.x, tz = this.smoothTarget.z;
    if (this.introPhase !== 'off' && this._sceneBox) {
      tx += (this._sceneBox.cx - tx) * this._introK;
      tz += (this._sceneBox.cz - tz) * this._introK;
    }

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
    let dist = this.dist * scale;
    if (this.introPhase !== 'off') {
      // Geometric (log-space) blend toward the overview. A linear dolly across
      // a 20x range crawls at the far end and slams at the near end; blending
      // the exponent holds the apparent rate steady. pow(x, 0) === 1, so k = 0
      // returns the normal distance untouched.
      const ov = Math.max(this._overviewDist(), dist * 1.02);
      dist *= Math.pow(ov / dist, this._introK);
    }
    const pitch = this.pitch;
    const dirX = Math.sin(this.yaw) * Math.cos(pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);

    // Blocker sweep. Two bounds now come out of it, not one.
    //
    // Along the ray, the span a box occupies is (enter, exit), and the camera is
    // safely placed anywhere OUTSIDE the sub-span where it would also be below
    // that box's roof. The roof is reached at t = h / (dist * dirY), so the
    // genuinely unsafe interval for one box is (enter, min(exit, roofT)) — past
    // either end you are in front of the wall or above it.
    //
    //   enter > 0  the hole is outside the box: retreat to `enter`. This is the
    //              original behaviour and the common case, unchanged.
    //   enter <= 0 THE HOLE IS INSIDE THE BOX. Pulling in goes deeper into the
    //              building, which is exactly backwards, and is what the old
    //              code did on every frame the sweep silently reported "clear".
    //              The escape is to push OUT to the far side.
    //
    // Push-out along the view ray rather than along the shortest exit normal,
    // and the reason is not taste. A lateral push moves the camera off the yaw
    // axis, so the "sits behind the heading" invariant the whole chase is built
    // on breaks, the framing swings, and in a dense grid the shortest exit from
    // one building is straight into the next. Along the ray the yaw is preserved
    // exactly, and the value is CONTINUOUS in the hole's position: the box edge
    // is fixed in world space, so `exit` slides smoothly as the hole drives
    // deeper. That is what lets the same standoff filter smooth it without
    // reintroducing a snap.
    let t = 1;
    let floorT = 0;         // push-out bound: t must be at least this
    const invReach = 1 / Math.max(1e-6, dist * dirY);
    for (const b of this.blockers) {
      if (b.h <= 0) continue;                    // demolished, no longer occludes
      const s = this.raySpan2D(tx, tz, dirX, dirZ, b, this._span);
      if (!s) continue;
      const hi = Math.min(s.exit, b.h * invReach);
      if (hi <= s.enter) continue;               // camera clears it at every t
      if (s.enter > 0.02) { if (s.enter < t) t = s.enter; }
      else if (hi > floorT) floorT = hi;
    }

    // The pull-in keeps its standoff; the push-out gets a slightly larger one,
    // for the same reason in the opposite direction — land ON the face and
    // rounding puts you back inside it.
    let rawT = Math.max(0.15, t * BLOCKER_EASE);
    // Capped at 1: pushing past the nominal distance would dolly out, and if the
    // box reaches beyond the camera there is nothing to push out to anyway. That
    // residue is what the roof lift below exists for.
    if (floorT > rawT) rawT = Math.min(1, floorT * 1.04);

    // Smoothed standoff. `t` is a DISCONTINUOUS function of the hole's position:
    // the moment the hole->camera ray clips a tower corner it drops from 1 to
    // whatever that corner subtends, so at 16 m the raw value teleports the
    // camera ~13 m in one frame — and the pitch, which rides `(1 - effT) * 0.5`,
    // snaps with it. Following it through a first-order filter turns both into a
    // glide. Asymmetric because the two directions are not the same problem:
    // push-out is purely cosmetic and can afford 286 ms, pull-in is the frame
    // where the camera would otherwise be standing in a wall.
    //
    // Smoothing alone cannot guarantee it stays out of the wall, so the guarantee
    // is separate and exact: place the camera, test that point against the
    // blocker AABBs, and if it is inside one below its roof, fall back to the raw
    // standoff for this frame. The glide is granted whenever it is safe and
    // withdrawn only when it is not, rather than being traded away everywhere for
    // a case that occurs on a handful of frames.
    //
    // Sandbox-only. The campaign and the establishing shot keep the raw value
    // bit-for-bit: the intro FITS its distance against BLOCKER_EASE (see
    // _fitAt), so a standoff that lagged would un-frame the shot it was fitted
    // for, and the far-plane term below reads effT directly.
    let effT = rawT;
    if (this.followDir && this.introPhase === 'off') {
      if (this._effT === null) this._effT = rawT;
      const rate = this._spatialRate(rawT < this._effT ? BLOCKER_T_IN : BLOCKER_T_OUT);
      this._effT += (rawT - this._effT) * Math.min(1, dt * rate);
      effT = this._effT;
    } else {
      this._effT = rawT;   // resume from the settled value, not from a stale one
    }

    // raise pitch when pulled in close so we look down over the obstruction
    let effPitch = pitch + (1 - effT) * 0.5;
    let cx = tx + Math.sin(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.x;
    let cz = tz + Math.cos(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.z;
    let cy = Math.max(2.5, Math.sin(effPitch) * dist * effT + this.shakeOffset.y);
    // Tested in BOTH directions, which is not the obvious half. A smoothed
    // standoff larger than the sweep allows is the case you expect — the camera
    // has not finished pulling in behind the wall. But a standoff SMALLER than
    // the sweep allows is unsafe too, because the camera's height scales with
    // it: at t = 1 the ray may pass clean over a roof, and the same ray lagging
    // at t = 0.3 puts the camera a third as high and inside that roof. Guarding
    // only the pull-in direction left 38-83 frames per 90 s route standing in a
    // building on Brooklyn and Upper Manhattan; guarding both leaves none.
    if (this._insideBlocker(cx, cy, cz)) {
      this._effT = effT = rawT;
      effPitch = pitch + (1 - effT) * 0.5;
      cx = tx + Math.sin(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.x;
      cz = tz + Math.cos(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.z;
      cy = Math.max(2.5, Math.sin(effPitch) * dist * effT + this.shakeOffset.y);
    }

    // LAST RESORT: climb over the roof. The sweep can be handed a position with
    // no safe t at all — the hole inside one box while another blocks the way
    // out, or a box that reaches past the camera so `floorT` clamped at 1. There
    // is always sky above, so lifting Y is the one escape that cannot fail, and
    // it is the only one that leaves cx/cz — and therefore the yaw framing the
    // chase depends on — untouched. It is also what the code already gestures at
    // by steepening the pitch "to look down over the obstruction"; this just
    // makes it sufficient instead of decorative.
    //
    // Kept smooth on the way DOWN only. The lift is a hard constraint, so it is
    // applied as a max and engages the instant it is needed; releasing it eases
    // out at BLOCKER_T_OUT so leaving a building does not drop the camera. That
    // asymmetry is the whole trick: the rise is bounded by how far the camera
    // already was below the roof (usually a metre or two, because the push-out
    // above has already done the coarse work) while the fall is the part a
    // player watches, so the fall is the part that gets eased.
    //
    // This is the only test in the whole placement that is POSITIONAL rather
    // than parametric, and that is why it has to be the backstop. The sweep
    // walks a ray whose horizontal rate is cos(pitch), while the camera is
    // actually placed at cos(effPitch) — effPitch depends on effT, which depends
    // on the sweep, so the two cannot be reconciled without solving a fixed
    // point every frame. During the intro the ray ORIGIN also slides toward the
    // scene centre. Both mean a parametrically-safe t can still land the camera
    // in a wall; measured, that was 9 frames of the intro hand-off buried 20 m
    // inside a Brooklyn tower. _roofOver reads the placed point directly, so it
    // cannot be wrong about it.
    //
    // Runs in every phase EXCEPT 'hold'. The establishing shot is fitted to
    // frame the entire city from outside it, so there is provably no roof above
    // the camera and the lift would be a no-op — excluding it costs nothing and
    // keeps the held pose bit-identical by construction rather than by measurement.
    if (this.followDir && this.introPhase !== 'hold') {
      const roof = this._roofOver(cx, cz);
      const need = roof > 0 ? roof + ROOF_CLEAR : 0;
      if (need > this._lift) this._lift = need;
      else this._lift += (need - this._lift) * Math.min(1, dt * this._spatialRate(BLOCKER_T_OUT));
      if (this._lift > cy) cy = this._lift;
    } else {
      this._lift = 0;
    }

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, 0, tz);

    // FOV: the growth/milestone punch decays out, and the intro's wide
    // establishing lens eases back to fovBase on the same curve as the dolly.
    const kick = this._fovKick > 0.01 ? this._fovKick : 0;
    const fov = this.fovBase + (INTRO_FOV - this.fovBase) * this._introK + kick;
    if (kick) this._fovKick *= Math.max(0, 1 - dt * 6);

    // Far plane: stretched only while the intro needs it, and sized off the
    // deepest point actually in view rather than off the camera distance. The
    // deepest is the far ground edge at D + r*cos(pitch); anything with height
    // sits nearer. Raising CAM_FAR globally instead would spend depth precision
    // during gameplay to pay for an establishing shot with no near geometry.
    let far = CAM_FAR;
    if (this.introPhase !== 'off') {
      const need = (dist * effT + this._fitRadiusMax() * Math.cos(effPitch)) * INTRO_FAR_MARGIN;
      if (need > far) far = need;
    }
    if (this.camera.fov !== fov || this.camera.far !== far) {
      this.camera.fov = fov;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }
}
