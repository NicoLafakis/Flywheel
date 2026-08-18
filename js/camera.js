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
// signal that moves in METRES. The sandbox hole runs 12.81 m/s at SIZE 1 and
// 30.13 m/s at the top of the ladder (9.96 / 26.12 before the 2026-08-17
// SPEED_MULT 1.8 retune — the multiplier scales every size uniformly, so the
// RATIO this paragraph is about does not move with it), so a fixed per-second
// rate lags 2.6x further at the top
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
// Re-measured since at 4x the heading density and against start offsets out to
// +/-144 deg — 192 headings x 5 offsets x both sizes, 1920 cases — the worst is
// 1.250 s at SIZE 1 and 1.017 s at SIZE 12, 1920/1920 converging and 384/384 on
// reversals. The 0.983 s above is not wrong, it is a smaller offset set; the
// number a big displacement actually costs is 1.25 s, and that is the one to
// beat. The recentre retune cannot reach any of this — every case here runs
// with _yawOffset at 0 — and measured identically before and after it.
// End-to-end measured hole speed is 12.81 m/s at SIZE 1 and 30.13 m/s at the
// top of the ladder. The 2.62 ratio this constant was rounded up from was
// measured on the old 12-SIZE ladder at SPEED_MULT 1.4 (9.96 / 26.12); the
// multiplier cancels in the ratio, so the retune to 1.8 does not move it.
// Rounded UP to 2.71 on purpose: this multiplies filter rates,
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
// Heading deadzone, in m/s of hole velocity. The sandbox hole runs 12.81 m/s at
// SIZE 1 (9.96 before the 1.8 retune) and 30.1 m/s at the top of the ladder,
// so 1.5 m/s is ~12% of the slowest real speed:
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
// --- manual orbit vs. the chase ---------------------------------------------
// Manual orbit no longer SUSPENDS the chase; it re-aims it. The old scheme held
// the chase off for ORBIT_HOLD = 0.7 s after the last orbit frame and then let
// the spring reclaim the yaw outright, and measured that is not a nudge:
// steering left with Q for 1 s while driving forward gained the player 146.4 deg
// of framing, the hold expired 0.700 s after release, and the spring — by then
// carrying a 146 deg error, so w^2*err saturates the cap instantly — took the
// whole of it back at the full 4.2 rad/s (241 deg/s) rate cap, leaving 2.7 deg
// of the 146.4 deg after 2.3 s. At SIZE 12 that reclaim runs at 7.0 rad/s
// (401 deg/s). That is the "camera fights me" report, exactly.
//
// The fix is structural rather than a longer timeout. Manual orbit accumulates
// a persistent yaw OFFSET and the chase targets `heading + offset`, so the two
// systems stop writing the same number: during a drag the target moves by
// exactly the drag, the spring error is unchanged, and there is nothing left to
// fight. The offset then eases back to zero on its own, and the two rates are
// deliberately different because they are two different promises:
//
//   FAST (the spring, 4.2-7.0 rad/s) tracks the HEADING, so the framing the
//   player chose stays attached through a turn — steer left and the camera
//   still swings left, holding the same relative angle.
//   SLOW (this unwind, 2.2 rad/s = 126 deg/s ceiling) returns that relative
//   angle to "directly behind", so the follow reasserts itself on its own and a
//   player who looked somewhere sees the camera settle rather than get
//   overruled. Still 1.91x slower than the reclaim it replaces at SIZE 1 and
//   3.18x slower at SIZE 12 — and unlike that reclaim it is one steady rate the
//   player can watch, not a snatch pinned to the spring's cap.
//
// The delay is the window in which a deliberate look is untouched, and it is
// NOT the 1.2 s this shipped with. Matching FOLLOW_COAST there bought a look
// that outlived the worst chase swing and cost the camera its follow entirely:
// measured, a 90 deg look took 8.05 s to come back within 5 deg of behind the
// heading and a 180 deg look 11.08 s, with the offset itself not fully retired
// for 22.8 s. A camera that holds the player's last look for eight seconds is
// an orbit camera, whatever the chase spring behind it is doing, and that is
// the whole of the "it feels orbital" report.
//
// A drag is not exposed to this window at all — _orbitHold is refreshed on
// every frame carrying a non-zero orbitDelta (measured: a 3.0 s held Q never
// lets it fall below the full 0.15 s, and unwinds 1.1e-14 deg during the
// press) — so all it has to cover is the gap BETWEEN input frames. 0.15 s is
// nine frames, and deliberately longer than the 0.1 s ceiling main.js and
// controls.js both clamp a single frame to: one stall frame between two
// touchmove events therefore cannot start an unwind, where a 0.1 s window
// would sit exactly on that boundary with no margin.
const ORBIT_RECENTRE_DELAY = 0.15;
// Unwind is a first-order decay with a rate ceiling, not a plain lerp. A lerp's
// peak rate is at t = 0 and scales with the offset, so a 180 deg look would
// start back at 81 deg/s while a 20 deg look crawled — the ceiling is what makes
// a big look and a small one return at the same readable speed.
//
// The two numbers split the return between them at M/R = 0.122 rad = 7.0 deg:
// above that the ceiling governs, below it the decay eases the last of it in.
// tau = 56 ms is chosen so that crossover sits just ABOVE the 5 deg "back behind
// the heading" threshold, so the whole visible return runs at ONE constant rate
// and the decay only shapes an approach the player has stopped reading as
// motion. The old tau of 2.2 s put the crossover at 64 deg, i.e. most of a
// 90 deg look decayed rather than travelled, which is what made the tail crawl.
//
// 2.2 rad/s is the ceiling of the readability budget and is what the return time
// is mostly made of. Measured, from release to within 5 deg of behind the
// heading while driving: 1.233 s for a 90 deg look and 1.917 s for 180 deg at
// SIZE 1, 1.083 s and 1.733 s at SIZE 12, at a peak of 126.0 deg/s. Deliberately
// NOT size-ramped — this is a readability budget, not a rate tracking how fast
// the world moves, and the measurements show it needs no help at SIZE 12, where
// it lands SOONER because FOLLOW_OMEGA is higher (see the next paragraph).
//
// About 0.4 s of each of those numbers is not the unwind at all. The chase
// spring trails a ramp input by 2*maxRate/omega = 0.55 rad, so at the moment the
// offset reaches zero the camera is still ~31 deg out and the spring settles the
// rest — measured, the offset is retired at 1.167 s of the 1.233 s. That floor
// is why raising the ceiling buys far less than it looks like it should: the
// 90 deg case lands at 1.23 s rather than the 0.82 s the ceiling alone predicts,
// and no value of this constant inside the readability budget reaches 1.2 s.
const ORBIT_RECENTRE_RATE = 18;     // 1/s, tau = 56 ms
const ORBIT_RECENTRE_MAX = 2.2;     // rad/s ceiling (126 deg/s)
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
// The overhead beat between the establishing hold and the dive. 0.8 s is long
// enough to read as a deliberate camera move and short enough that nobody sitting
// on the GO button feels it as a delay — and the sim stays frozen through it, so
// it costs the player no clock either way (see introHolding).
const INTRO_RISE_DUR = 0.8;
// How far "directly overhead" is allowed to go. NOT pi/2, deliberately. At a true
// 90 deg pitch cos(effPitch) is 0, so the camera's XZ offset from the pivot
// collapses to zero and camera.lookAt has its view direction parallel to the
// default up vector: three.js r160 does not NaN there (it nudges _z.z by 1e-4,
// js/vendor/three.module.js) but the resulting ROLL is arbitrary and spins
// rapidly as the pole is approached. 1.40 rad is 80.2 deg, and the placement code
// adds (1 - BLOCKER_EASE) * 0.5 = 0.04 on top, so the effective pitch peaks at
// 1.44 rad / 82.5 deg — reads as straight down, leaves the roll governed by yaw,
// and keeps 0.13 rad of clearance from the singularity.
const INTRO_OVERHEAD_PITCH = 1.40;
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
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, CAM_FAR);
    this.yaw = 0;
    this.pitch = 0.54;           // base action elevation angle (rad, ~31 deg dynamic 3D third-person chase)
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
    this._orbitHold = 0;      // grace (s) before a manual look eases back to centre
    this._yawOffset = 0;      // the player's framing choice, RELATIVE to the heading
    this._followYaw = null;   // last commanded "behind the heading" yaw, or null
    this._followCoast = 0;    // s of chase left after the hole stopped moving
    // Yaw the chase must aim at INSTEAD of the drive heading, or null for the
    // normal "sit behind where you are going" behaviour. See setChaseYawHold.
    this._chaseYawHold = null;
    // Back-reference so the module that owns the steering can reach the rig.
    // main.js hands Controls the THREE camera (controls.setCamera(cam.camera)),
    // not this object, and the chase-versus-stick arbitration below has to be
    // decided by whoever knows which scheme is driving — which is Controls.
    // Riding on userData rather than adding a plumbing argument keeps that fact
    // between the two files it concerns.
    this.camera.userData.rig = this;
    this._yawVel = 0;         // rad/s, the chase spring's state
    this._velX = 0;           // smoothed hole velocity, UNCLAMPED — see update()
    this._velZ = 0;
    this._effT = null;        // smoothed blocker standoff; null = adopt the raw one
    this._lift = 0;           // roof-clearance floor on cy (m), eases down only
    this._span = { enter: 0, exit: 0 };  // raySpan2D scratch; ~540 calls/frame
    this.fovBase = 45;
    this._fovKick = 0;        // temporary FOV punch (growth/milestone juice)

    // Level intro. Inert until beginIntro() is called: introK stays 0, which
    // makes every term below an exact identity.
    //
    // Three beats, not one, since 2026-08-17: the establishing HOLD the player
    // presses GO on, a RISE to directly overhead, then the DIVE onto the hole.
    // A separate phase per beat rather than sub-ranges inside one, because the
    // sim gate, the roof lift and the standoff filter all have to answer
    // "which beat is this" and a phase name is the only thing all three can read.
    this.introPhase = 'off';  // 'off' | 'hold' | 'rise' | 'dive'
    this._introK = 0;         // 1 = full overview, 0 = normal framing
    this._introT = 0;         // elapsed time in the current beat (s)
    // Fraction of the overhead pitch offset currently applied: 0 through the
    // hold, eased 0 -> 1 across the rise, then back down with _introK across the
    // dive. Separate from _introK because they move on different beats — _introK
    // is pinned at 1 for the whole rise, and one scalar cannot drive both.
    this._introPitchK = 0;
    // The pitch the intro borrowed, and the single value skipIntro() returns it
    // to. CONVENTION: the intro owns this.pitch only while introPhase !== 'off',
    // and skipIntro is the one place that hands it back.
    this._introPitchBase = null;
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
    this._introDistPitch = 0;
    this._blockerBox = null;  // raw XZ bounds of the blocker list, or null
    this.quakeCinematic = null; // active Dragon Ball earthquake cinematic cutscene state
    this.pokeSpawnCinematic = null; // active Pokemon powerup spawn cinematic state
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
    // Turning it on mid-move must not leave the player mid-flight. Both MOVING
    // beats count, not just the dive: switching it on during the rise would
    // otherwise strand the camera part-way to overhead. The hold is deliberately
    // excluded — the establishing shot is fine under reduced motion, it is the
    // flight through it that is not, and releaseIntro() already lands that case
    // on the final framing directly.
    if (this.reducedMotion && (this.introPhase === 'rise' || this.introPhase === 'dive')) this.skipIntro();
  }
  setFollowDirection(val) { this.followDir = !!val; }

  // Aim the chase at THIS yaw instead of at the drive heading, or pass null to
  // go back to chasing the heading.
  //
  // Why the chase needs an off switch at all, stated where the switch is: the
  // direction-chase is a TANK affordance, and the keyboard IS tank — A/D
  // integrate a heading the player steers, and the view swinging behind it is
  // part of how a turn reads (the on-hole heading pointer is the other part).
  // The TOUCH stick is not that — it names an absolute screen direction, so
  // "down" means "come toward the camera", and a camera that immediately
  // slews behind the new heading erases the only thing that made it down.
  // Measured, 8 drag directions x 4 origins x
  // 4 camera yaws: with the chase live every one of those 128 pushes settled to
  // a screen-space travel direction of 0.0-2.0 deg (straight up-screen), and the
  // camera's own yaw drifted by exactly the drag angle. Down went forward, and
  // so did every other direction. Frozen, the same sweep tracks the drag to
  // within 6.1 deg — and that residual is pure perspective foreshortening on the
  // diagonals, 0.0 deg on all four cardinals.
  //
  // Held at the stick's LATCHED BASIS rather than simply frozen, which is what
  // makes the release lurch-free: the basis is only ever written on a frame the
  // stick is at rest (controls.js _latchBasis), and at rest it equals the live
  // yaw — so engaging the hold at rest asks the camera for the pose it is
  // already in, and letting go of the stick asks for nothing new either. A
  // second finger's orbit still moves the view, because orbitDelta feeds
  // _yawOffset by the same amount it moves this.yaw and the spring's error is
  // untouched (see update()).
  setChaseYawHold(y) {
    this._chaseYawHold = Number.isFinite(y) ? y : null;
  }
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
    this._fovKick = Math.min(24, this._fovKick + v);
  }

  // Two writers must never own the rig's pitch at once. The intro holds it from
  // beginIntro() until skipIntro(); a cinematic holds it from its arm until its
  // completion. If a cinematic arms while the intro is still running, the intro
  // yields FIRST and cleanly — landing the camera on its final framing — so that
  // the pitch the cinematic saves is a real settled value rather than a frame of
  // someone else's animation. Called before savedPitch is read, deliberately.
  //
  // The poke spawn is additionally gated at its caller (js/main.js
  // queuePokemonSpawnIntro) and never reaches this; the quake can, because
  // collecting the quake power-up needs sim steps and the sim runs during the
  // dive.
  _yieldIntroToCinematic() {
    if (this.introPhase !== 'off') this.skipIntro();
  }

  // ---------------------------------------------------------- earthquake cinematic
  // Returns the cinematic it armed. That return value is a TOKEN: pass it back to
  // skipEarthquakeCinematic and the cancel applies only to this cinematic, so a
  // stale completion handler from a previous one cannot reach through and cancel
  // a newer cutscene. See .wiki/conventions.md, "arm before you announce".
  startEarthquakeCinematic({ x0, z0, x1, z1, angle, length, duration = 5.8, onComplete, reducedMotion = false }) {
    this._yieldIntroToCinematic();
    this.quakeCinematic = {
      x0, z0, x1, z1, angle, length,
      duration: Math.max(1.4, duration),
      time: 0,
      onComplete,
      reducedMotion: this.reducedMotion || reducedMotion,
      // The pitch this cutscene borrows, returned by its own phase-7 blend and
      // by skipEarthquakeCinematic. There is deliberately no savedDist: the
      // cutscene overrides the frame's LOCAL distance and never touches
      // this.dist, so a saved copy could only ever be used to undo a zoom the
      // player performed while it was running.
      savedPitch: this.pitch,
      // Phase-7 exit pose, latched on the first frame of the release. See update().
      exit: null,
    };
    if (!this.reducedMotion) {
      this.triggerShake(1.2);
      this.fovKick(12);
    }
    return this.quakeCinematic;
  }

  skipEarthquakeCinematic(token) {
    const qc = this.quakeCinematic;
    if (!qc) return;
    // A null/absent token still means "cancel whatever is armed", so every caller
    // that predates the token keeps working.
    if (token != null && qc !== token) return;
    this.quakeCinematic = null;
    if (qc.savedPitch != null) this.pitch = qc.savedPitch;
    const cb = qc.onComplete;
    if (typeof cb === 'function') cb();
  }

  isQuakeCinematicActive() {
    return this.quakeCinematic !== null;
  }

  // ---------------------------------------------------------- pokemon spawn cinematic
  // Returns the armed cinematic as a cancel token — see startEarthquakeCinematic.
  startPokemonSpawnCinematic({ dropX, dropZ, playerX, playerZ, duration = 4.0, onComplete, reducedMotion = false }) {
    this._yieldIntroToCinematic();
    this.pokeSpawnCinematic = {
      dropX, dropZ, playerX, playerZ,
      duration: Math.max(1.1, duration),
      time: 0,
      onComplete,
      reducedMotion: this.reducedMotion || reducedMotion,
      savedPitch: this.pitch,
      panFrom: null,   // phase-1 start yaw, latched once
      exit: null,      // phase-2 exit pose, latched once
    };
    if (!this.reducedMotion) {
      this.triggerShake(0.6);
      this.fovKick(8);
    }
    return this.pokeSpawnCinematic;
  }

  skipPokemonSpawnCinematic(token) {
    const pc = this.pokeSpawnCinematic;
    if (!pc) return;
    if (token != null && pc !== token) return;
    this.pokeSpawnCinematic = null;
    if (pc.savedPitch != null) this.pitch = pc.savedPitch;
    const cb = pc.onComplete;
    if (typeof cb === 'function') cb();
  }

  isPokeSpawnCinematicActive() {
    return this.pokeSpawnCinematic !== null;
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
    // Latch the pitch the rig had BEFORE the intro borrows it. Everything the
    // intro does to pitch is an offset from here, and skipIntro() puts exactly
    // this value back — so a level that starts, is skipped, and is replayed
    // never accumulates drift. Re-latched on every beginIntro rather than kept
    // from construction so that a scene which legitimately changed the base
    // pitch (settings, a different level) is honoured.
    this._introPitchBase = this.pitch;
    this._introPitchK = 0;

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


  // Player hit the CTA. The shot answers in two beats — RISE to overhead, then
  // DIVE to the player — so the transition reads as one deliberate move from the
  // angle the player was looking at into the angle they will play from, rather
  // than as a cut. Reduced Motion lands on the final framing directly: the
  // establishing shot is fine, the flight through it is not.
  releaseIntro() {
    if (this.introPhase !== 'hold') return;
    if (this.reducedMotion) { this.skipIntro(); return; }
    this.introPhase = 'rise';
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
    // Hand pitch back. The intro owns this.pitch only while introPhase !== 'off'
    // and this is the one place it is returned, so every exit — completion,
    // reduced motion, replay, a cinematic pre-empting the intro — lands on the
    // same value rather than wherever the rise happened to have got to.
    if (this._introPitchBase !== null) this.pitch = this._introPitchBase;
    this._introPitchK = 0;
    this._introDistCache = null;
  }

  introActive() { return this.introPhase !== 'off'; }
  // Beats during which the sim must stay frozen. The rise is part of the
  // establishing shot — the player has not been handed control yet — so it holds
  // exactly as the hold does; only the dive runs live.
  introHolding() { return this.introPhase === 'hold' || this.introPhase === 'rise'; }

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
  // Cached on aspect AND pitch, because _fitAt() reads this.pitch: the rise
  // steepens it, and a cache keyed on aspect alone would keep returning the
  // shallow-pitch fit for the whole climb. Constant through the hold, so the
  // established pose is unchanged bit-for-bit; it recomputes only on the frames
  // pitch is actually moving.
  _overviewDist() {
    if (this._introDistCache !== null
      && this._introDistAspect === this.camera.aspect
      && this._introDistPitch === this.pitch) {
      return this._introDistCache;
    }
    const d = Math.min(
      Math.min(this._introMaxDist, INTRO_MAX_RADII * this._fitRadiusMax()),
      this._fitArc(this._introYaw0, this._introArc) / BLOCKER_EASE,
    );
    this._introDistCache = d;
    this._introDistAspect = this.camera.aspect;
    this._introDistPitch = this.pitch;
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
  _roofOver(x, z, margin = 0.75) {
    let h = 0;
    for (const b of this.blockers) {
      if (b.h > h && x >= (b.minX - margin) && x <= (b.maxX + margin) && z >= (b.minZ - margin) && z <= (b.maxZ + margin)) {
        h = b.h;
      }
    }
    return h;
  }

  _insideBlocker(x, y, z, margin = 0.75) {
    for (const b of this.blockers) {
      if (b.h <= 0) continue;
      if (y < (b.h + 0.4) && x >= (b.minX - margin) && x <= (b.maxX + margin) && z >= (b.minZ - margin) && z <= (b.maxZ + margin)) {
        return true;
      }
    }
    return false;
  }

  // orbitHeld: an orbit POINTER is down this frame, whether or not it moved.
  // Passed per frame rather than pushed through a setter so there is one source
  // of truth per frame and no way for it to go stale behind the camera's back.
  // Omitted by every campaign caller and by any harness that predates it, which
  // reads as false and is exactly the old behaviour.
  //
  // driveHeading: the steering heading (controls.js), or null before the
  // first move input of a level. When present it is the chase target unless a
  // chase-yaw hold outranks it — see the follow-yaw section below.
  update(dt, holeX, holeZ, holeRadius, orbitDelta, zoomDelta, orbitHeld, driveHeading) {
    this.yaw += orbitDelta;
    // Manual orbit moves the camera AND the thing the chase aims at, by the same
    // amount, on the same frame. The spring's error is therefore untouched by
    // the player's own drag, so it neither fights the drag nor has to be
    // suspended for it — and the half-finished swing it may be carrying stays
    // meaningful, because the swing is toward the heading and the drag is now
    // measured relative to that heading. Nothing to dump, nothing to hand back.
    //
    // followDir-only. Outside the sandbox nothing reads _yawOffset or
    // _orbitHold, and leaving both at their initial 0 there keeps the campaign's
    // yaw arithmetic exactly what it was.
    if (this.followDir && orbitDelta) {
      this._yawOffset = Math.atan2(
        Math.sin(this._yawOffset + orbitDelta), Math.cos(this._yawOffset + orbitDelta));
    }
    // The grace is refreshed by INPUT, and a drag that has stopped moving is
    // still input. orbitDelta alone cannot say so: it is a function of pixels
    // dragged, so a finger resting on the glass emits zero and reads identically
    // to a finger that was lifted. Q/E do emit one every frame they are held, so
    // for the keyboard the delta is sufficient and orbitHeld is always false —
    // the two conditions cover different surfaces rather than overlapping.
    //
    // Split from the offset accumulation above deliberately: a held-still finger
    // must refresh the timer WITHOUT running _yawOffset back through
    // atan2(sin, cos), which is an identity in exact arithmetic and a slow drift
    // in floating point when it runs on every frame of a long hold.
    //
    // followDir-gated so the campaign arithmetic is untouched by construction:
    // with followDir false _orbitHold never leaves 0, so the decrement below is
    // a no-op on a value that is already 0, exactly as before.
    if (this.followDir && (orbitDelta || orbitHeld)) this._orbitHold = ORBIT_RECENTRE_DELAY;
    else if (this._orbitHold > 0) this._orbitHold -= dt;
    const maxZoomOut = 12 + holeRadius * 1.5;
    this.dist = Math.min(maxZoomOut, Math.max(0.5, this.dist + zoomDelta));

    // Level intro timeline (inert unless beginIntro() was called).
    //
    // Three beats, and the shape of them is the answer to "the transition from
    // the menu angle to the chase camera is jerky and makes no sense":
    //
    //   hold — the establishing pose, at the sun-scored azimuth, sim frozen.
    //          The angle the player is looking at when they press GO.
    //   rise — 0.8 s tilt from that angle up to (near) overhead, still frozen,
    //          still framing the whole city. This is the beat that was missing:
    //          without it the shot has to get from an oblique establishing angle
    //          to a close chase pose in one move, and doing two things at once
    //          over one curve is what reads as jerk.
    //   dive — the existing zoom in to the player, easing pitch back DOWN to the
    //          base chase elevation on the same curve, sim running.
    //
    // Pitch and framing are therefore deliberately out of phase: _introPitchK
    // goes 0 -> 1 -> 0 while _introK goes 1 -> 1 -> 0. One curve each, and the
    // camera is only ever doing one legible thing at a time.
    if (this.introPhase !== 'off') {
      if (this.introPhase === 'rise') {
        this._introT += dt;
        const u = Math.min(1, this._introT / INTRO_RISE_DUR);
        this._introPitchK = u * u * u * (u * (u * 6 - 15) + 10);
        if (u >= 1) { this.introPhase = 'dive'; this._introT = 0; }
      } else if (this.introPhase === 'dive') {
        this._introT += dt;
        const u = Math.min(1, this._introT / this._introDur);
        // smootherstep: leaves the hold gently instead of snapping to full
        // speed, and settles rather than arriving hot.
        const s = 1 - u * u * u * (u * (u * 6 - 15) + 10);
        this._introK = s;
        // Same curve, so the descent to the player and the return to chase
        // elevation are one motion rather than two overlapping ones. It also
        // guarantees pitch is back at base on the exact frame _introK reaches 0,
        // which is what makes skipIntro()'s restore a no-op on the happy path
        // instead of a visible correction.
        this._introPitchK = s;
        if (u >= 1) this.skipIntro();
      }
      // Pitch is an offset from the latched base, capped well short of vertical
      // (see INTRO_OVERHEAD_PITCH). Written every frame of the two moving beats
      // and never during the hold, so the established pose is untouched.
      if (this._introPitchK > 0) {
        this.pitch = this._introPitchBase
          + (INTRO_OVERHEAD_PITCH - this._introPitchBase) * this._introPitchK;
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
    // 12.81 m/s (9.96 before the 1.8 retune) the hole saturates that clamp on
    // both axes — a heading of
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

    // Follow-direction yaw: ease the camera behind the heading so the view
    // always faces where you're driving and the player never has to touch a
    // camera key. Manual orbit input and Reduced Motion suspend it.
    //
    // The heading arrives as `driveHeading`, the tank scheme's steering state
    // (controls.js). It is exogenous BY CONSTRUCTION: controls owns it, only
    // A/D (or point-to-move, or the touch stick's direct steer) change it, and
    // nothing here can write back to it — so the historical chase feedback
    // loop (basis read from the live yaw -> world direction -> yaw target ->
    // yaw, measured winding 19 rad in 3 s on a reversal) has no path to
    // exist, and no basis latch or toward-camera gate is needed anywhere.
    // Chasing it directly rather than deriving it from velocity also fixes
    // the parked case by definition: a stationary A/D spin rotates the
    // heading, so the camera swings round and the spin is VISIBLE (backing up
    // the on-hole heading pointer), which a velocity-derived target could
    // never show. The one override is the chase-yaw HOLD (setChaseYawHold),
    // which the touch stick sets while it drives — the stick names an
    // absolute screen direction a slewing camera would erase.
    //
    // The velocity path below remains as the fallback for callers that pass no
    // heading (harnesses that predate the param, and the frames before the
    // first input of a level), and is exactly the old behaviour.
    //
    // Runs on the BASE yaw. The intro adds _introOscYaw as an offset it removes
    // and re-adds every frame, and the chase must not aim at, or bake in, a
    // number that is about to decay to zero on its own.
    const osc = this._introOscYaw;
    this.yaw -= osc;
    if (this.followDir && !this.reducedMotion) {
      // The hold outranks the heading (see setChaseYawHold): while the touch
      // stick is the driver, "behind the heading" is the wrong place to be.
      // It does NOT reach the velocity fallback below — that path only runs
      // before the first move input of a level, when there is no stick driving
      // anything and nothing to arbitrate.
      if (this._chaseYawHold !== null) {
        this._followYaw = this._chaseYawHold;
        this._followCoast = FOLLOW_COAST;
      } else if (driveHeading != null) {
        this._followYaw = driveHeading;
        this._followCoast = FOLLOW_COAST;
      } else {
        const spd = Math.hypot(this._velX, this._velZ);
        if (spd > FOLLOW_DEADZONE) {
          this._followYaw = Math.atan2(this._velX, this._velZ) + Math.PI;
          this._followCoast = FOLLOW_COAST;
        } else if (this._followCoast > 0) {
          this._followCoast -= dt;
        }
      }
      const sizeT = this.sandboxSizeProgress;
      const omega = FOLLOW_OMEGA * (1 + (FOLLOW_OMEGA_RAMP - 1) * sizeT);
      const maxRate = FOLLOW_MAX_RATE * (1 + (FOLLOW_MAX_RATE_RAMP - 1) * sizeT);
      if (this._followYaw !== null && this._followCoast > 0) {
        // Ease the player's framing choice back to centre, but only while there
        // is a live heading for "centre" to mean anything. Under driveHeading
        // the heading is always live — so a parked look unwinds home rather
        // than holding — while on the velocity fallback parking still stops
        // the chase and a stationary look is held indefinitely rather than
        // quietly unwound against a stale heading.
        if (this._orbitHold <= 0 && this._yawOffset) {
          let d = this._yawOffset * Math.min(1, dt * ORBIT_RECENTRE_RATE);
          const cap = ORBIT_RECENTRE_MAX * dt;
          if (d > cap) d = cap; else if (d < -cap) d = -cap;
          this._yawOffset -= d;
          if (Math.abs(this._yawOffset) < 1e-4) this._yawOffset = 0;
        }
        let err = this._followYaw + this._yawOffset - this.yaw;
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

    // desired offset (framing scales with radius: tight at SIZE 1, wide at SIZE 24)
    let scale;
    if (this.followDir) {
      // sandbox: ~11 m at r=1.1 (SIZE 1). From SIZE 4 (r=2.6) the distance
      // ramps up so that by SIZE 10 (r=5.6) the camera clears the scene's
      // tallest blocker — the see-over-any-building rule — then smoothly
      // tracks holeRadius up across SIZE 1..24 so giant holes stay well-framed.
      const base = 7 + holeRadius * 3.6;
      let d = base;
      if (this.maxBlockerH > 0) {
        const clearDist = (this.maxBlockerH + 8) / Math.sin(this.pitch);
        const t = Math.max(0, Math.min(1, (holeRadius - 2.6) / 3));
        const s = t * t * (3 - 2 * t);
        const blendedClear = base + (clearDist - base) * s;
        d = Math.max(base, blendedClear);
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
    // Preserve the frame's ordinary chase distance before a cinematic changes
    // `dist`; the pickup finale must return to this real value, not a stale or
    // out-of-scope camera calculation.
    const liveDist = dist;

    // Earthquake Cinematic Cutscene Camera Override
    if (this.quakeCinematic) {
      const qc = this.quakeCinematic;
      qc.time += dt;
      const progress = Math.min(1, qc.time / qc.duration);

      if (qc.reducedMotion) {
        const midX = (qc.x0 + qc.x1) * 0.5;
        const midZ = (qc.z0 + qc.z1) * 0.5;
        const blend = progress < 0.85 ? 1 : Math.max(0, (1 - progress) / 0.15);
        tx = tx + (midX - tx) * blend;
        tz = tz + (midZ - tz) * blend;
        const overviewDist = Math.max(34, qc.length * 0.7);
        dist = dist + (overviewDist - dist) * blend;
      } else {
        let cineLookX, cineLookZ, cineDist, cinePitch, cineYaw;
        if (progress < 0.12) {
          // Phase 0: hit-stop. The first text slam gets one clean frozen frame.
          cineLookX = qc.x0;
          cineLookZ = qc.z0;
          cineDist = 13.0;
          cinePitch = 0.30;
          cineYaw = qc.angle + Math.PI;
          this.triggerShake(0.45);
        } else if (progress < 0.54) {
          // Phases 1-3: three hard-cut arcade close-ups on the player. Each
          // shot attacks from a distinct angle while the overlay slams EARTH,
          // QUAKE, then TIME into the centre of the screen.
          const shot = Math.min(2, Math.floor((progress - 0.12) / 0.14));
          const shotStart = 0.12 + shot * 0.14;
          const u = Math.min(1, (progress - shotStart) / 0.14);
          const easeU = u * u * (3 - 2 * u);
          const shotYaw = [qc.angle + Math.PI * 0.50, qc.angle - Math.PI * 0.62, qc.angle + Math.PI][shot];
          const shotPitch = [0.26, 0.63, 0.34][shot];
          const shotDist = [7.0, 8.5, 6.2][shot];
          cineLookX = qc.x0;
          cineLookZ = qc.z0;
          cineDist = 27.0 - (27.0 - shotDist) * easeU;
          cinePitch = shotPitch;
          cineYaw = shotYaw;
          this.triggerShake(0.12 + (1 - easeU) * 0.16);
        } else if (progress < 0.74) {
          // Phase 4: launch from the player to the furthest fault endpoint.
          const u = (progress - 0.54) / 0.20;
          const easeU = u * u * (3 - 2 * u);
          cineLookX = qc.x0 + (qc.x1 - qc.x0) * easeU;
          cineLookZ = qc.z0 + (qc.z1 - qc.z0) * easeU;
          cineDist = 9.0 + easeU * Math.min(42, qc.length * 0.42);
          cinePitch = 0.38 + easeU * 0.18;
          cineYaw = qc.angle + Math.PI;
        } else if (progress < 0.82) {
          // Phase 5: hold at the distant endpoint and pull a deliberate 180.
          const u = (progress - 0.74) / 0.08;
          const easeU = u * u * (3 - 2 * u);
          cineLookX = qc.x1;
          cineLookZ = qc.z1;
          cineDist = Math.max(22, Math.min(42, qc.length * 0.42));
          cinePitch = 0.56;
          cineYaw = qc.angle + Math.PI + Math.PI * easeU;
          this.triggerShake(0.24);
        } else if (progress < 0.94) {
          // Phase 6: chase the glowing fissure back toward the player so the
          // camera reads each collapse as the fault passes beneath it.
          const u = (progress - 0.82) / 0.12;
          const easeU = u * u * (3 - 2 * u);
          cineLookX = qc.x1 + (qc.x0 - qc.x1) * easeU;
          cineLookZ = qc.z1 + (qc.z0 - qc.z1) * easeU;
          cineDist = Math.max(15, Math.min(34, qc.length * 0.34));
          cinePitch = 0.52;
          cineYaw = qc.angle + Math.sin(u * Math.PI * 5) * 0.045;
          this.triggerShake(0.34);
        } else {
          // Phase 7: return to the live chase camera. Same defect and same fix
          // as the poke's phase 3 — an eased return computed for five channels
          // and applied to two. Its window is already 0.06 of 5.8 s (~21 frames),
          // long enough for the distance blend, so unlike the poke it needed no
          // boundary change: only the missing channels.
          const u = Math.min(1, (progress - 0.94) / 0.06);
          const easeU = u * u * (3 - 2 * u);
          const blendOut = 1 - easeU;
          if (!qc.exit) {
            qc.exit = {
              x: qc.x0,
              z: qc.z0,
              dist: qc.appliedDist != null ? qc.appliedDist : dist,
              pitch: this.pitch,
            };
          }
          const ex = qc.exit;
          cineLookX = ex.x * blendOut + tx * easeU;
          cineLookZ = ex.z * blendOut + tz * easeU;
          // Geometric, same reasoning as the poke's phase 3.
          cineDist = ex.dist > 0 && dist > 0
            ? ex.dist * Math.pow(dist / ex.dist, easeU)
            : ex.dist * blendOut + dist * easeU;
          cinePitch = ex.pitch * blendOut + (qc.savedPitch != null ? qc.savedPitch : this.pitch) * easeU;
          cineYaw = this.yaw;
        }

        // One write point for all five channels, so no phase can apply a partial
        // pose.
        //
        // The yaw rate cap is scoped to the RELEASE only, and that scope is the
        // decision rather than an oversight. Phases 0-6 are authored hard cuts —
        // "three hard-cut arcade close-ups", each attacking from a distinct
        // angle — and a cut is a discontinuity on purpose. Capping them would
        // turn shot 0 -> shot 1 (2.76 rad) into a ~0.4 s pan and quietly rewrite
        // a deliberate sequence nobody asked to change. The cut OUT to live play
        // is the opposite: nothing authored it, it is where the camera stops
        // being the director's and becomes the player's, and that is the seam
        // this fix exists to close. Measured numbers for the internal cuts, and
        // the standing open item, are in .wiki/modules/render.md.
        tx = cineLookX;
        tz = cineLookZ;
        dist = cineDist;
        this.pitch = cinePitch;
        if (progress < 0.94) {
          this.yaw = cineYaw;
        } else {
          const maxYawStep = FOLLOW_MAX_RATE * FOLLOW_MAX_RATE_RAMP * dt;
          const dYaw0 = cineYaw - this.yaw;
          const dYaw = Math.atan2(Math.sin(dYaw0), Math.cos(dYaw0));
          this.yaw = Math.abs(dYaw) > maxYawStep
            ? this.yaw + (dYaw < 0 ? -maxYawStep : maxYawStep)
            : cineYaw;
        }
        qc.appliedDist = dist;
      }

      if (progress >= 1.0) {
        const cb = qc.onComplete;
        this.quakeCinematic = null;
        if (qc.savedPitch != null) this.pitch = qc.savedPitch;
        if (typeof cb === 'function') cb();
      }
    }

    // Pokémon Power-Up Spawn Encounter Camera Override
    if (this.pokeSpawnCinematic) {
      const pc = this.pokeSpawnCinematic;
      pc.time += dt;
      const progress = Math.min(1, pc.time / pc.duration);

      if (pc.reducedMotion) {
        const midX = (pc.playerX + pc.dropX) * 0.5;
        const midZ = (pc.playerZ + pc.dropZ) * 0.5;
        const blend = progress < 0.8 ? 1 : Math.max(0, (1 - progress) / 0.2);
        tx = tx + (midX - tx) * blend;
        tz = tz + (midZ - tz) * blend;
        dist = dist + (28 - dist) * blend;
      } else {
        // Phase boundaries. The RETURN window's length is a design value, not a
        // magic number: it was 0.88 -> 1.0, which is 0.18 s at the shipped
        // duration — far too short for the distance channel to travel from the
        // cutscene's 16 m framing back to a chase distance that can legitimately
        // be hundreds of metres on a large city at a large SIZE.
        //
        // Sized in SECONDS, then converted, because smoothness is a function of
        // how many FRAMES the change is spread over and a fixed fraction of the
        // duration is not. INTRO-adjacent lesson learned the hard way here: a
        // 0.24 fraction measured a clean 21.0% per-frame step at the 1.5 s
        // js/main.js passes and 29.6% at the 1.1 s floor this same method
        // enforces two screens up (`Math.max(1.1, duration)`), because the same
        // fraction of a shorter shot is fewer frames.
        //
        // The remaining three boundaries scale into whatever is left, so the
        // table is EXACTLY the tuned 0.25 / 0.70 / 0.76 at duration 1.5 and
        // degrades proportionally rather than by starving one beat.
        //
        // The 0.12 taken from the beacon hold costs less than it reads: the
        // return still LOOKS at the beacon through the first third of its own
        // window (easeU is near zero there), so the beacon stays framed to about
        // progress 0.85 either way. What changes is that the camera starts moving
        // while it is still looking at it, which is a better shot than a hard
        // hold followed by a rush.
        const RETURN_S = 0.36;
        const RET = Math.min(0.30, RETURN_S / Math.max(0.1, pc.duration));
        const head = 1 - RET;
        const P_PAN = head * (0.25 / 0.76);      // hero freeze ends
        const P_TOUCH = head * (0.70 / 0.76);    // whip-pan ends, beacon framing begins
        const P_RETURN = head;                   // beacon framing ends, return to chase begins
        let cineLookX, cineLookZ, cineDist, cinePitch, cineYaw;
        if (progress < P_PAN) {
          // Phase 0: Dramatic hero freeze frame on player
          cineLookX = pc.playerX;
          cineLookZ = pc.playerZ;
          cineDist = 9.0;
          cinePitch = 0.38;
          cineYaw = this.yaw;
          this.triggerShake(0.3 * (1 - progress / P_PAN));
        } else if (progress < P_TOUCH) {
          // Phase 1: High-speed whip-pan zoom to overhead power-up drop site
          const u = (progress - P_PAN) / (P_TOUCH - P_PAN);
          const easeU = u * u * (3 - 2 * u);
          cineLookX = pc.playerX + (pc.dropX - pc.playerX) * easeU;
          cineLookZ = pc.playerZ + (pc.dropZ - pc.playerZ) * easeU;
          cineDist = 9.0 + (22.0 - 9.0) * easeU;
          cinePitch = 0.38 + (1.20 - 0.38) * easeU;
          const angleToDrop = Math.atan2(pc.dropX - pc.playerX, pc.dropZ - pc.playerZ);
          // Latch the pan's origin ONCE. Interpolating against a live `this.yaw`
          // that this same line rewrote each frame is not an ease at all — it is
          // a first-order chase whose gain climbs with easeU, and it reached
          // 1076 deg/s against a module ceiling of 400. Latched, the pan is the
          // eased arc it was written to be.
          if (pc.panFrom == null) pc.panFrom = this.yaw;
          // Shortest signed arc. The drop site frequently sits almost directly
          // behind the camera, and an unwrapped difference there picks the long
          // way round on the wrong side of an arbitrary sign.
          const d = angleToDrop - pc.panFrom;
          cineYaw = pc.panFrom + Math.atan2(Math.sin(d), Math.cos(d)) * easeU;
        } else if (progress < P_RETURN) {
          // Phase 2: Dynamic touchdown overhead framing on the skyfall beacon
          cineLookX = pc.dropX;
          cineLookZ = pc.dropZ;
          cineDist = 22.0;
          cinePitch = 1.20;
          const angleToDrop = Math.atan2(pc.dropX - pc.playerX, pc.dropZ - pc.playerZ);
          cineYaw = angleToDrop;
          this.triggerShake(0.35);
        } else {
          // Phase 3: return to the live chase camera, in EVERY channel it took.
          // The old version computed an eased return for five and applied it to
          // two: `dist`, `pitch` and `yaw` were assigned under `progress < 0.88`,
          // so at the boundary they reverted to their live values in one frame.
          // Measured at 213.1 m of camera travel in a 16.3 ms frame.
          const u = Math.min(1, (progress - P_RETURN) / (1 - P_RETURN));
          const easeU = u * u * (3 - 2 * u);
          const blendOut = 1 - easeU;
          // Latch the pose the cutscene is leaving FROM, once, from what was
          // actually applied last frame rather than from the authored constants
          // — so the two cannot drift apart if the shot is ever retuned.
          if (!pc.exit) {
            pc.exit = {
              x: pc.dropX,
              z: pc.dropZ,
              dist: pc.appliedDist != null ? pc.appliedDist : dist,
              pitch: this.pitch,
            };
          }
          const ex = pc.exit;
          cineLookX = ex.x * blendOut + tx * easeU;
          cineLookZ = ex.z * blendOut + tz * easeU;
          // Distance blends GEOMETRICALLY, for the reason the intro dolly gives
          // in _overviewDist's caller: "a linear dolly across a 20x range crawls
          // at the far end and slams at the near end; blending the exponent
          // holds the apparent rate steady". Here the near end is where the
          // cutscene starts (16 m) and the far end is the live chase framing, so
          // a linear return spends its worst per-frame RELATIVE step in the
          // first fifth of the window — measured at 34.2% against a 25% bound,
          // versus 21.0% for the same window in log space.
          cineDist = ex.dist > 0 && dist > 0
            ? ex.dist * Math.pow(dist / ex.dist, easeU)
            : ex.dist * blendOut + dist * easeU;
          cinePitch = ex.pitch * blendOut + (pc.savedPitch != null ? pc.savedPitch : this.pitch) * easeU;
          // Yaw is handed straight back to the chase spring, which is already
          // rate-limited and is the thing that knows where the player is heading.
          // Blending it here would be a second authority on the same channel.
          cineYaw = this.yaw;
        }

        // ONE write point for all five channels, so no phase can apply a partial
        // pose. The yaw step is capped at the rig's own ceiling
        // (FOLLOW_MAX_RATE * FOLLOW_MAX_RATE_RAMP, whose own comment calls
        // 545 deg/s "a nausea machine"), measured on the shortest signed arc.
        // A guarantee rather than a tuning: no authored shot, present or future,
        // can turn the camera faster than the player's own inputs may.
        const maxYawStep = FOLLOW_MAX_RATE * FOLLOW_MAX_RATE_RAMP * dt;
        const dYaw0 = cineYaw - this.yaw;
        const dYaw = Math.atan2(Math.sin(dYaw0), Math.cos(dYaw0));
        tx = cineLookX;
        tz = cineLookZ;
        dist = cineDist;
        this.pitch = cinePitch;
        this.yaw = Math.abs(dYaw) > maxYawStep
          ? this.yaw + (dYaw < 0 ? -maxYawStep : maxYawStep)
          : cineYaw;
        pc.appliedDist = dist;
      }

      if (progress >= 1.0) {
        const cb = pc.onComplete;
        this.pokeSpawnCinematic = null;
        // Hand back what the shot borrowed. savedPitch was captured at the arm
        // and read nowhere, which is why a 0.52 cutscene pitch used to leak into
        // the rest of the level permanently. Yaw is deliberately NOT restored —
        // the chase spring owns it and forcing it would be a second cut.
        if (pc.savedPitch != null) this.pitch = pc.savedPitch;
        if (typeof cb === 'function') cb();
      }
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
    // Sandbox-only, and NOT during the two beats that hold the fitted shot.
    // 'hold' and 'rise' keep the raw value bit-for-bit: both frame the whole
    // city from outside it, the intro FITS its distance against BLOCKER_EASE
    // (see _fitAt), so a standoff that lagged would un-frame the shot it was
    // fitted for, and the far-plane term below reads effT directly. Neither has
    // anything to smooth — from an overview standoff the sweep sits pinned at
    // BLOCKER_EASE.
    //
    // 'dive' is the opposite case and is smoothed like ordinary play. It
    // descends THROUGH the skyline rather than framing it, which is the exact
    // situation this filter exists for, and _introK has already eased the
    // fitted framing away by the time the camera reaches roof height. Measured
    // on brooklyn (see .wiki/modules/render.md): unsmoothed, the sweep chatters
    // 0.92 / 0.43 / 0.15 / 0.92 / 1.00 / 0.27 on consecutive frames as the
    // camera drops into the tower cluster at ~25 m, and each of those steps is
    // a 8-11 m camera jump inside one 17 ms frame against a ~4.5 m trend.
    let effT = rawT;
    if (this.followDir && this.introPhase !== 'hold' && this.introPhase !== 'rise') {
      if (this._effT === null) this._effT = rawT;
      const rate = this._spatialRate(rawT < this._effT ? BLOCKER_T_IN : BLOCKER_T_OUT);
      this._effT += (rawT - this._effT) * Math.min(1, dt * rate);
      effT = this._effT;
    } else {
      this._effT = rawT;   // resume from the settled value, not from a stale one
    }

    // raise pitch when pulled in close so we look down over the obstruction
    // +
    // a dive-only bump, _introK(1-_introK): ZERO at both ends (hold K=1, off
    // K=0, so neither the fitted establishing shot nor the settled chase pose
    // moves), peaking +0.35 rad mid-zoom. The geometric dist lerp crosses the
    // city low over the rooftops around K=0.5, and the playtest caught exactly
    // that: ~1 s of blank wall after GO! when the path clipped a building near
    // the spawn. Steepening the middle of the dive keeps it above the roofline
    // until the camera is nearly home.
    const diveBump = this._introK * (1 - this._introK) * 1.4;
    let effPitch = pitch + (1 - effT) * 0.5 + diveBump;
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
      effPitch = pitch + (1 - effT) * 0.5 + diveBump;
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
    // Runs in every phase EXCEPT 'hold' and 'rise'. The establishing shot is
    // fitted to frame the entire city from outside it, so there is provably no
    // roof above the camera and the lift would be a no-op — excluding it costs
    // nothing and keeps the held pose bit-identical by construction rather than
    // by measurement. The rise only ever moves that camera UP and IN over the
    // same footprint, so the same proof covers it, and excluding it also
    // guarantees _lift is pinned at 0 on the frame the dive begins rather than
    // carrying an eased remainder into it.
    if (this.introPhase !== 'hold' && this.introPhase !== 'rise') {
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
