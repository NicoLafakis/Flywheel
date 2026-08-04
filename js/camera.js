// Chase camera: frames the hole, orbits, zooms, and never clips into buildings.
// Collision: sample along the hole->camera ray against standing building AABBs
// and pull the camera in front of the first hit; pitch rises as it pulls in.

import * as THREE from 'three';

const SANDBOX_ZOOM_IN = 0.7;
const SANDBOX_ZOOM_OUT = 1.5;
// Standoff the blocker sweep applies to every camera offset, hit or not.
const BLOCKER_EASE = 0.92;
const CAM_FAR = 600;             // gameplay far plane; the intro stretches it and restores it

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
    // The intro opens on a static hole, so pin the target rather than letting
    // the overview slide in from wherever smoothTarget happened to be.
    if (this._introSnap) { this._introSnap = false; this.smoothTarget.copy(this.target); }
    this.smoothTarget.lerp(this.target, Math.min(1, dt * 8));

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

    // find nearest blocker along the ray
    let t = 1;
    for (const b of this.blockers) {
      const th = this.rayHit2D(tx, tz, dirX, dirZ, b);
      if (th < t) {
        // would the camera at that t be below the building top?
        const camY = th * dist * dirY;
        if (camY < b.h) t = th;
      }
    }

    const effT = Math.max(0.15, t * BLOCKER_EASE);
    // raise pitch when pulled in close so we look down over the obstruction
    const effPitch = pitch + (1 - effT) * 0.5;
    const cx = tx + Math.sin(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.x;
    const cz = tz + Math.cos(this.yaw) * Math.cos(effPitch) * dist * effT + this.shakeOffset.z;
    const cy = Math.max(2.5, Math.sin(effPitch) * dist * effT + this.shakeOffset.y);

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
