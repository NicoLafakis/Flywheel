// Input: keyboard (desktop) + virtual joystick / touch orbit (mobile) + an
// optional world-space point-to-move scheme (drag or tap, touch or mouse).
// Produces a heading-relative world-space move intent and orbit deltas.
//
// ONE steering scheme for everything directional: DIRECT. The touch stick's
// angle names a direction on screen; the keys name one of eight (WASD as
// screen up/left/down/right and the diagonals). Either way the heading turns
// toward that target through the wrapped shortest arc at a capped rate, and
// the move intent is full-throw along the heading. (History: the keyboard was
// TANK for one day — c3579da made A/D integrate the heading open-loop, and a
// W+A hold wound the heading ~150 deg past the view, so a later D had to
// unwind all of it while W kept driving: the hole looped the long way round
// to go right. The camera-relative strafes before that had no heading at all
// for the chase camera to aim at. Direct-with-a-heading is the union that
// works: D means screen-right NOW, and the heading stays real.)
//
// Fingers are assigned by ROLE, not by count, and the roles are exclusive: at
// most one finger is the stick (or, in point-to-move, the world pointer), and
// every OTHER finger down is a camera finger. One camera finger orbits by its
// own travel; two orbit by their midpoint and zoom by the distance between
// them. That split is what lets a left thumb steer while a right hand pinches
// without the two gestures having to arbitrate against each other — they are
// never competing for the same finger in the first place.

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
// WASD name a screen direction (W up, A left, S down, D right, diagonals
// between) read against the latched camera basis, and the heading chases that
// target through the wrapped shortest arc. The chase rate is the same stack
// the manual Q/E orbit runs at (ORBIT_RATE × turnSens × the size ramp) times
// the direct-steer boost, capped where the chase camera caps (see
// DIRECT_STEER_MAX below): it is the player's only turn rate, a faster hole
// needs a proportionally faster heading correction, and a heading that
// outturns the camera reads as the world sliding sideways. The heading is
// absolute world state owned here — never derived from the camera — so the
// chase camera can aim itself at it with no feedback loop. The basis DOES
// come from the camera, latched at rest (the tank scheme needed no basis
// because it integrated A/D open-loop; that is precisely the wind-up that
// made reversals take the long way round) — see _latchBasis.
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

// --- touch stick ------------------------------------------------------------
// Dead zone, as a fraction of the max throw. A thumb parked on the glass is
// never still — it breathes, and the hand it is attached to is holding the
// phone — so without this the stick emits a small permanent direction and the
// hole never coasts to a stop. 0.15 of a ~39 px throw is ~6 px, which is under
// the 14 px touch slop the tap detector already treats as "did not move".
const JOY_DEAD = 0.15;
// Max throw as a fraction of the ring's rendered WIDTH, so the CSS owns the
// size and this owns only the proportion. 0.42 of the width is 0.84 of the
// radius, which is exactly where the old hardcoded pair sat (50 px throw in a
// 120 px ring) — the ring shrank on phones, the feel did not change. Reading
// the width back from the element rather than duplicating the clamp is what
// keeps those two facts from drifting apart.
const JOY_THROW_FRAC = 0.42;
// How far the ring is kept clear of the viewport edge (and of any safe-area
// inset) on top of its own radius, so a thumb landing near the bezel gets a
// whole ring rather than a crescent.
const JOY_EDGE_PAD = 6;
// Widest viewport that still gets the on-screen stick when the pointer is NOT
// coarse — i.e. a mouse in a narrow window, which is how this game is actually
// being tested on a laptop and the case that had no control at all.
//
// 420 is taken from css/main.css rather than invented, but it is worth being
// straight about the fit: that file has no width-based "this is a phone" block
// to borrow. Its device block is `(hover: none) and (pointer: coarse)` with no
// width at all, and its two width breakpoints (420, 700) are both about the
// SETTINGS PANEL — 420 shrinks the slider and readout, 700 decides whether a
// label and its value fit on one line, and that file explicitly documents them
// as answering two different questions. 420 is the narrower of the two and the
// only one that lines up with a phone-shaped viewport; 700 would hand a
// joystick to anyone running a half-width window on a desktop, which is a
// common laptop layout and would take their camera away.
const STICK_MAX_W = 420;
// Direct steer turns toward a TARGET angle rather than integrating a rate
// open-loop (the one-day tank scheme did the latter with A/D, and a held key
// wound the heading past the view — the wind-up reversals had to unwind).
// That is the whole reason it can afford a faster rate — there is nothing to
// overshoot, the error goes to zero and the turn stops itself, so the usual
// argument for keeping a turn rate low (an unrecoverable spin) does not apply.
// It NEEDS one, too: at the bare ORBIT_RATE a 180 deg reversal is 1.21 s of
// holding a thumb against a hole that is still going the wrong way, and a
// player who has pointed at a building expects to be heading there. 1.6x puts
// SIZE 1 at 4.16 rad/s = 238 deg/s: 180 deg in 0.76 s, 90 deg in 0.38 s.
const DIRECT_STEER_BOOST = 1.6;
// ...under a ceiling, because the chase camera has one. camera.js caps its own
// angular rate at FOLLOW_MAX_RATE — 4.2 rad/s at SIZE 1 ramping to 7.0 at
// SIZE 12 — and a heading that turns faster than the camera can follow does
// not read as a faster turn, it reads as the world sliding sideways while the
// turn happens off-centre. The two numbers are duplicated here rather than
// imported so controls.js keeps its zero render-side imports (the settings
// screen imports this file too); if camera.js retunes them, retune these.
const DIRECT_STEER_MAX = 4.2;
const DIRECT_STEER_MAX_RAMP = 7.0 / 4.2;

// --- pinch zoom -------------------------------------------------------------
// SPREAD ZOOMS OUT, PINCH ZOOMS IN. This is deliberately the INVERSE of the
// maps/photos convention, where spreading two fingers magnifies what is between
// them — Nico's call, and it is coherent on its own terms: this gesture is not
// scaling a picture, it is pushing a camera backwards, and "spread for more
// room" is the shape that reads when the thing under your fingers is a city you
// are trying to see more of rather than an image you are trying to enlarge.
// Recorded as a named sign rather than as a minus buried in the delta maths so
// that changing our mind is one character in one place, not a hunt through the
// gesture code for which of two subtractions is the load-bearing one.
const PINCH_SIGN = 1;      // +1: spread -> dist grows -> camera pulls back
// Metres of camera distance per SCREEN DIAGONAL of change in finger separation.
// Normalised by the diagonal rather than taken in raw pixels so the same
// physical hand movement means the same thing on every panel: a tablet's longer
// sweep would otherwise cover ~2.5x the range for the same gesture, which is
// the tablet feeling twitchy and the phone feeling stuck, from one constant.
// Calibrated against the camera's own 8..40 m clamp (camera.js:784, so 32 m of
// usable travel). A comfortable one-handed spread runs ~40 px to ~300 px, i.e.
// 260 px of the 927 px diagonal of a 390x844 phone; at 96 m/diagonal that is
// 26.9 m, or 84% of the range in a single stroke. Deliberately short of the
// whole range — being able to slam both ends without lifting is exactly what
// makes a pinch feel nervous, and a second stroke costs nothing. For scale
// against the control it mirrors: holding R/F sweeps the same 32 m in ~1.33 s
// (ZOOM_RATE 24 m/s), so a spread taken over half a second is the same order of
// aggression as the keyboard — the gesture is not secretly a faster zoom.
const PINCH_GAIN = 96;
// Breakout dead zone, in px, applied to the finger separation and to the
// midpoint independently. Two fingers resting on glass each jitter a pixel or
// two and the distance between them jitters by their sum, so without this a
// two-finger hold slowly dollies the camera on its own. Subtracted from the
// first movement that clears it, so the gesture starts from zero instead of
// jumping the dead zone's worth of camera the instant it engages.
const PINCH_DEAD_PX = 5;
// Bound on the zoom accumulator. zoomDelta is drained once per frame
// (consumeZoom -> main.js:506), but touchmove fires several times between
// frames on a phone and can therefore queue up more travel than the camera even
// has. 32 m is exactly the 8..40 range, so the worst a single frame can do is
// sweep end to end — which is what an aggressive flick should do — and never
// more, so the accumulator cannot bank a debt that keeps zooming after the
// fingers have stopped.
const ZOOM_ACC_MAX = 32;
// Same px -> radians constant the one-finger orbit drag uses. Shared on purpose:
// the two-finger midpoint IS an orbit drag, just measured at the average of two
// fingers, so a player who learns the feel of one has learned the other.
const ORBIT_PX_RATE = 0.008;
// First-run hint dismissal. Its own key, NOT part of the save blob — the save
// is owned by js/save.js and versioned, and "has this person seen the stick
// hint" is a device fact rather than a profile fact: the same save opened on a
// desktop should not have burned the phone's one hint.
const HINT_KEY = 'flywheel-touch-hint-v1';

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.orbitDelta = 0;      // radians, accumulated per frame
    this.zoomDelta = 0;
    this.moveVec = { x: 0, z: 0 }; // raw input, pre camera-rotation
    this.settings = { invertX: false, invertY: false };
    // Voxel sandbox: the camera aims itself at the heading (camera.js follow
    // yaw reads controls.heading), so orbit rates ramp with hole size here.
    this.chaseMode = false;
    // The steering scheme's one piece of state: the hole's world-space heading
    // in radians, with forward = (-sin(heading), -cos(heading)) — the same
    // convention the camera yaw uses. null until the first move input of a
    // level, then seeded from the latched camera basis so W initially drives
    // up-screen. After that only the direct-steer targets (keys/stick) and
    // point-to-move ever change it; the camera cannot, which is what makes the
    // heading chase feedback-free.
    // main.js resets it to null on every level start.
    this.heading = null;
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
    this._joyThrow = 50;      // px, re-measured off the ring on every arm
    // Has THIS stick gesture ever been past the dead zone? Distinguishes a
    // thumb that is steering from a finger that merely landed on its way to a
    // pinch — which is now EVERY first finger of a pinch, since the stick's
    // home is the whole surface. See onPointerDown.
    this._joyEverLive = false;
    // The camera yaw the stick's angles are read against. Latched, never live:
    // see the long note on _latchBasis below — this is the field the feedback
    // loop would run through if it were re-read while the stick is commanding.
    this._basisYaw = null;
    // The chase camera rig (camera.js), reached through the THREE camera's
    // userData in setCamera, and the yaw currently held on it (null = chasing
    // the heading normally). See _setChaseHold and the direct-steer branch.
    this._rig = null;
    this._chaseHold = null;
    this._insets = null;      // cached safe-area insets, keyed on viewport size
    this._insetsKey = '';
    // first-run hint
    this._hintSettled = false;
    this._hintEl = null;
    // orbit touch state
    this.orbitId = null;
    this.orbitLastX = 0;

    // Every finger currently on the canvas, in landing order (Map preserves
    // insertion order, which is what makes "the first two camera fingers" a
    // stable pair rather than whichever two the browser happens to list first).
    // The stick and the point-to-move pointer live in here too and are filtered
    // out at use — one map of the truth beats three half-views of it.
    this._touches = new Map();   // identifier -> {x, y}
    // pinch state. _pinchOn is recomputed only when the finger SET changes
    // (touchstart/touchend), never mid-move, so the per-finger orbit branch and
    // the midpoint branch can never both run on the same event.
    this._pinchOn = false;
    this._pinchDist = 0;
    this._pinchMidX = 0;
    this._pinchZoomLive = false;   // cleared the dead zone in the separation
    this._pinchPanLive = false;    // ...and in the midpoint, independently

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

    this._canvas = canvas;
    // Pointer Events, NOT touch events plus a parallel mouse set.
    //
    // The touch listeners this replaces are the whole reason the stick was inert
    // on a laptop: a mouse emits pointer/mouse events and never a touchstart, so
    // nothing on the stick's path ever ran — whatever the window width, and
    // whatever pointMove was set to. Pointer events unify mouse, touch and pen
    // behind one pointerId that maps one-for-one onto the old touch identifier,
    // so the role arbitration, the _touches map, _pinchPoints, the orbit-slot
    // promotion and the _joyEverLive release all carry over unchanged.
    //
    // The old mouse set is DELETED rather than kept alongside. A browser fires
    // both pointer and compatibility mouse events for the same gesture, so
    // running the two together would double-handle every press — which is what
    // the comment that used to sit here was guarding against. The guard was
    // right; keeping two schemes was the wrong way to satisfy it.
    //
    // move/up sit on the canvas rather than on window because setPointerCapture
    // (see _capture) retargets them here for the life of the gesture. That is
    // the same "a drag that leaves the element keeps tracking" guarantee the
    // window listeners bought, without the stuck-stick failure when the release
    // lands on some other element.
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
  }

  // Point-to-move is a SETTING, read live off the settings object main.js
  // assigns (it hands over the same object the settings screen mutates, so a
  // toggle takes effect on the next frame with no wiring in between). Absent
  // from older saves, which reads as off.
  get pointMove() { return !!(this.settings && this.settings.pointMove); }

  // The camera the screen->ground raycast projects through. Set once per level
  // from main.js; null disables point-to-move rather than guessing a projection.
  //
  // Also where the chase RIG is picked up. main.js hands over the THREE camera,
  // so the rig arrives on its userData (camera.js constructor) — the alternative
  // was a second setter main.js would have to call, and the arbitration this
  // buys is entirely between these two files. Absent on a bare THREE camera (a
  // headless harness), which reads as "no chase to suspend" and is correct.
  setCamera(camera) {
    this.camera = camera;
    this._rig = (camera && camera.userData && camera.userData.rig) || null;
    // Fresh level: whatever the last one left held is not this one's business.
    this._setChaseHold(null);
  }

  // Ask the chase camera to hold a yaw, or release it back to chasing the
  // heading. Idempotent on the value so a held stick is not re-writing the rig
  // every frame, and silent when there is no rig (campaign, harnesses).
  _setChaseHold(y) {
    if (this._chaseHold === y) return;
    this._chaseHold = y;
    if (this._rig && this._rig.setChaseYawHold) this._rig.setChaseYawHold(y);
  }

  // Is an orbit finger DOWN — as distinct from an orbit finger MOVING.
  //
  // The chase camera's recentre grace is refreshed by a non-zero orbitDelta, and
  // orbitDelta is deliberately a function of pixels dragged (see onPointerMove), so
  // a finger that has stopped moving emits exactly nothing while still being a
  // player deliberately holding a look. Measured with the grace at 0.15 s, that
  // gap cost 12.6 deg of the look per 0.25 s of stillness and 44.1 deg per 0.5 s
  // — the camera walking out from under a finger that never left the glass. So
  // "the pointer is down" has to be reported separately from "the pointer moved".
  //
  // Pointer-driven only, and that is complete rather than partial. Above
  // STICK_MAX_W with a fine pointer there is no orbit drag to report at all
  // (Q/E are the mouse's manual look); below it a mouse takes the orbit slot
  // like any other pointer and is reported here on exactly the same terms as a
  // finger. Q/E emit an orbitDelta on every frame they are held, so the
  // keyboard path is already covered by the delta itself.
  //
  // A two-finger pinch is a held look too — the midpoint drives the same
  // orbitDelta a single finger would. The _pinchOn clause should never be the
  // one that fires: onPointerUp promotes a surviving camera finger into the orbit
  // slot, so orbitId is non-null whenever any camera finger is down, pinch or
  // not. It is here because the two costs are not comparable — a redundant
  // boolean against re-opening the 44 deg hole above if that invariant ever
  // slips — and because it says at the getter, where a reader looks, that a
  // pinch counts as a look.
  get orbitHeld() { return this.orbitId !== null || this._pinchOn; }

  onPointerDown(e) {
    // Wide surface with a fine pointer — a desktop. Unchanged from what the
    // deleted onMouseDown did, primary-button test included: no stick, no orbit
    // drag, point-to-move only if the player asked for it.
    //
    // The gate is the SURFACE, not e.pointerType, and that is the fix rather
    // than an implementation detail. The broken case is a MOUSE in a phone-
    // width window, so a device test would have kept it broken; and a coarse
    // tablet at 900 px wants the stick, so a width test alone would have missed
    // it too. _stickLive() asks the only question that separates them.
    if (!this._stickLive()) {
      if (!this.pointMove || e.button !== 0 || this._pt) return;
      e.preventDefault();
      this._capture(e);
      this._beginPoint(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      return;
    }
    e.preventDefault();
    // Hold the gesture even if it wanders off the canvas or off the document.
    this._capture(e);
    // Any pointer anywhere retires the first-run hint — it is teaching "touch
    // the screen", so the first press has by definition finished its job.
    this._dismissHint();
    // A stick pointer that has NEVER left the dead zone was never steering — it
    // was half of a pinch that had not opened yet. Hand it back to the camera
    // pool before any role is assigned below.
    //
    // This path used to be a fix for one bad case (a pinch straddling the old
    // left-half boundary). Now that the stick's home is the WHOLE surface it is
    // load-bearing for every two-pointer gesture there is: the first pointer of
    // a pinch always arms the stick, wherever it lands, so this release is the
    // only thing standing between "zoom" and "zoom while driving off". It runs
    // before any role is assigned precisely so the freed pointer is available
    // to be re-dealt as a camera pointer in the same event.
    //
    // "Never past the dead zone" is a LATCH (_joyEverLive), not the current
    // deflection: a thumb that pushed and came back to centre is a player
    // deliberately coasting to a stop, and stealing the stick from them
    // mid-drive would be the same class of bug pointing the other way. That
    // asymmetry is the whole design — a pointer that HAS steered keeps the
    // stick and the newcomer orbits, so drive-and-look works; a pointer that
    // has NOT steered yields, so pinch-to-zoom works.
    const freed = !this.pointMove && this.joyId !== null && !this._joyEverLive &&
      this._releaseStickToCamera();
    this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointMove) {
      // FIRST pointer points, SECOND orbits, and the joystick is gone. Not a
      // coexistence — a replacement. The old argument for that was partly
      // spatial (pointing needs the whole screen, the stick was fenced into
      // half of it); the stick now claims the whole surface too, which does not
      // weaken the case, it removes the only part of it that was ever
      // negotiable. What is left is the part that always did the work: the
      // stick steers a persistent heading while pointing drives at a world
      // point directly, so a frame where both were live would have two
      // different answers to "what does this input mean" — and now they would
      // also be competing for the same first pointer. Manual look survives, it
      // just moves to the second pointer.
      if (this._pt === null) this._beginPoint(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      else if (this.orbitId === null) { this.orbitId = e.pointerId; this.orbitLastX = e.clientX; }
      this._rebasePinch();
      return;
    }
    // ANYWHERE on the surface, not the left half. The half-split was a
    // twin-stick convention — a stick fenced left because the right was
    // reserved for orbit — imported into a one-thumb casual game where the
    // genre (hole.io, and floating-stick guidance generally) just lets you drag
    // from wherever your thumb already is. The fence was the thing denying
    // "press anywhere and move from that spot".
    //
    // What it costs, stated plainly: one-pointer orbit is gone in this mode.
    // A single pointer now always means DRIVE, so framing the shot needs a
    // second pointer (which orbits by travel, or pinches by separation once the
    // stick yields above). That is the trade — the camera is no longer reachable
    // one-thumbed, and Q/E remain the only single-input look.
    //
    // `!freed` blocks the pointer that TRIGGERED the release from re-arming.
    // Not belt-and-braces: without it that pointer walks straight into this
    // branch and takes the stick in the freed one's place, stealing the same
    // pinch one pointer later. It matters more now than it did behind the
    // half-split, because every second pointer lands inside the stick's home.
    if (!freed && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      this._joyEverLive = false;
      this.joyActive = true;
      this._markerMode(false);   // same node, back to thumb-rest proportions
      // Armed but LATENT: laid out and measurable, not yet drawn. The reveal
      // waits for the dead-zone crossing in onPointerMove — see _revealRing.
      //
      // Why two classes instead of just holding `hidden` back: `.hidden` is
      // `display:none`, and _placeRing measures the ring with
      // getBoundingClientRect to derive _joyThrow. Measured while hidden that
      // rect is 0 and the code falls back to w=120, but --joy-size is
      // `clamp(92px, 24vmin, 120px)` — 93.6px on a 390px phone. The stick would
      // silently arm with a 50px throw instead of 39px, a 28% wider deflection
      // for the same thumb sweep, on the device it matters most on. Opacity
      // keeps the element in layout so the measurement stays honest.
      this.joyEl.classList.remove('hidden');
      this.joyEl.classList.add('latent');
      this._placeRing(e.clientX, e.clientY);
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    } else if (this.orbitId === null) {
      this.orbitId = e.pointerId;
      this.orbitLastX = e.clientX;
    }
    this._rebasePinch();
  }

  onPointerMove(e) {
    // A hovering mouse fires this continuously with no button down. Every
    // branch below is keyed to a pointer that already claimed a role at
    // pointerdown, so a hover matches nothing and costs one map lookup —
    // but preventDefault has to move INSIDE the branches, or a bare hover
    // would be swallowing default behaviour across the whole canvas.
    const p = this._touches.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (this._pt && e.pointerId === this._pt.id) {
      e.preventDefault();
      this._movePoint(e.clientX, e.clientY);
    } else if (e.pointerId === this.joyId) {
      e.preventDefault();
      const dx = e.clientX - this.joyOrigin.x;
      const dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      // Measured off the ring at arm time, not a constant: the ring is sized
      // in vmin now, so a fixed 50 px throw would be 84% of the radius on a
      // phone and 38% on a tablet — the same thumb sweep meaning two
      // different things depending on the panel.
      const max = this._joyThrow;
      const cl = Math.min(len, max);
      const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
      this.joyVec = { x: (nx * cl) / max, y: (ny * cl) / max };
      // Latch "this stick has actually commanded something". Tested against
      // the same JOY_DEAD getMove uses, on the same magnitude — invert only
      // mirrors the components, so it cannot change the length. Once true it
      // stays true for the life of the gesture: see onPointerDown for why a
      // thumb returning to centre must not lose the stick.
      if (!this._joyEverLive && cl / max > JOY_DEAD) { this._joyEverLive = true; this._revealRing(); }
      this.knobEl.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
    } else if (e.pointerId === this.orbitId) {
      e.preventDefault();
      // Deliberately coupled to PIXELS DRAGGED, not to time — correct for a
      // drag gesture. turnSens scales it in the sandbox for the same reason it
      // scales Q/E: this drag is now the player's only manual camera, so the
      // slider has to reach it or it reaches nothing on touch.
      //
      // The reference is refreshed even while a pinch owns the orbit, and that
      // is not bookkeeping — it is the whole no-jump rule applied to the other
      // end of the gesture. Freeze it during the pinch and the frame the
      // second finger lifts would emit every pixel this finger travelled while
      // the midpoint was driving, as one delta: a two-finger gesture that
      // wandered 200 px across the screen would snap the camera 1.6 rad the
      // instant it became a one-finger gesture again.
      const dx = e.clientX - this.orbitLastX;
      this.orbitLastX = e.clientX;
      if (!this._pinchOn) this.orbitDelta += dx * ORBIT_PX_RATE * this._orbitSens();
    }
    this._updatePinch();
  }

  // Also the pointercancel handler. Cancel is not a rare path — the browser
  // fires it whenever it decides a gesture became something else — and it must
  // drop every role, which is exactly what a release does.
  //
  // Deliberately NOT gated on e.button. The deleted onMouseUp tested for the
  // primary button, but pointercancel reports button -1, so carrying that test
  // over would have leaked a stuck stick on every cancelled gesture. The cost
  // is that releasing a second mouse button ends a point-to-move drag; the
  // cancel leak is the worse of the two by a wide margin.
  onPointerUp(e) {
    this._release(e);
    this._touches.delete(e.pointerId);
    if (this._pt && e.pointerId === this._pt.id) this._endPoint(e.timeStamp);
    if (e.pointerId === this.joyId) {
      this.joyId = null; this.joyActive = false;
      this.joyVec = { x: 0, y: 0 };
      this._joyEverLive = false;
      this.joyEl.classList.add('hidden');
      this.joyEl.classList.remove('latent');
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    }
    if (e.pointerId === this.orbitId) this.orbitId = null;
    // A surviving camera finger inherits the orbit slot. Without this, lifting
    // the FIRST of two pinch fingers leaves the second one orbiting nothing:
    // orbitId is null, so orbitHeld goes false while a finger is still very much
    // holding a look, and the camera's recentre grace expires underneath it —
    // the measured 44 deg/0.5 s failure the orbitHeld getter exists to prevent.
    // Taking the position from the map rather than from the event is what makes
    // the handover jump-free: the new reference IS where that finger is now.
    if (this.orbitId === null) {
      for (const [id, p] of this._touches) {
        if (id === this.joyId || (this._pt && id === this._pt.id)) continue;
        this.orbitId = id;
        this.orbitLastX = p.x;
        break;
      }
    }
    this._rebasePinch();
  }

  // ----------------------------------------------------------- pinch/zoom guts

  // Give the stick's finger back to the camera pool, mid-gesture, without the
  // hole twitching on the way out.
  //
  // The no-kick property is structural rather than careful: this is only ever
  // called while _joyEverLive is false, which means the stick's magnitude has
  // never exceeded JOY_DEAD, which is the exact test getMove gates the direct-
  // steer branch on. So no frame has ever read a heading from this finger and
  // none can — zeroing joyVec here is belt-and-braces on a branch that was
  // already unreachable, not the thing doing the work.
  //
  // The finger inherits the orbit slot if it is free, which is what would have
  // happened had the stick never claimed it. That keeps orbitHeld truthful (the
  // 44 deg recentre bug) and gives _rebasePinch a pair in landing order.
  _releaseStickToCamera() {
    const id = this.joyId;
    if (id === null) return false;
    this.joyId = null;
    this.joyActive = false;
    this.joyVec = { x: 0, y: 0 };
    this._joyEverLive = false;
    if (this.joyEl) { this.joyEl.classList.add('hidden'); this.joyEl.classList.remove('latent'); }
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)';
    const p = this._touches.get(id);
    if (this.orbitId === null && p) { this.orbitId = id; this.orbitLastX = p.x; }
    return true;
  }

  // The fingers eligible to be a camera pair, in landing order.
  //
  // The exclusions are the entire arbitration, and they are subtractive on
  // purpose: a pinch is not a gesture we detect and then have to defend against
  // the others, it is simply what is left over once the one finger that has a
  // job already has been taken out. So the stick finger can never be pinched
  // against — a left thumb steering and two right fingers zooming are three
  // fingers with three roles and nothing to resolve — and neither can the
  // point-to-move pointer.
  //
  // Consequence worth stating rather than discovering: in point-to-move mode the
  // FIRST finger down is unconditionally the world pointer (see onPointerDown),
  // so a pinch there needs a third finger. That is not a compromise chosen here,
  // it falls out of pointing needing the whole screen; zoom is reachable in that
  // mode with three fingers and is honestly not discoverable with two. Keyboard
  // R/F and the settings zoom slider are unaffected either way.
  _pinchPoints() {
    const out = [];
    for (const [id, p] of this._touches) {
      if (id === this.joyId) continue;
      if (this._pt && id === this._pt.id) continue;
      out.push({ id, x: p.x, y: p.y });
      if (out.length === 2) break;
    }
    return out;
  }

  // Re-read the participating pair and RESET the references to it, emitting
  // nothing. Called on every event that can change the finger set — touchstart,
  // touchend/touchcancel, and _clearPoint (which frees the pointer finger back
  // into the pool without any touch event at all).
  //
  // This is the whole answer to the classic pinch discontinuity. A baseline is
  // only ever differenced against the same two fingers that produced it; the
  // moment either of them changes, the old separation and the old midpoint are
  // facts about a gesture that no longer exists, and differencing against them
  // is how a third finger landing teleports the camera. Re-baselining costs one
  // event of movement and buys "no jump", which is the correct trade every time.
  _rebasePinch() {
    const ps = this._pinchPoints();
    this._pinchOn = ps.length === 2;
    this._pinchZoomLive = false;
    this._pinchPanLive = false;
    if (!this._pinchOn) return;
    this._pinchDist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    this._pinchMidX = (ps[0].x + ps[1].x) * 0.5;
  }

  // Separation -> zoom, midpoint -> orbit. Called once at the END of a touchmove
  // rather than per changed finger: a two-finger gesture usually reports both
  // fingers in one event, and running this inside the loop would measure the
  // pair once with the first finger moved and the second stale, then again with
  // both — the same movement counted twice, half of it against a torn frame.
  _updatePinch() {
    if (!this._pinchOn) return;
    const ps = this._pinchPoints();
    if (ps.length < 2) { this._pinchOn = false; return; }   // set changed unseen
    const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    const midX = (ps[0].x + ps[1].x) * 0.5;
    // Normalising by the live diagonal rather than a cached one means a rotation
    // mid-gesture rescales rather than breaks. Guarded because a headless
    // teardown can report a zero-size window.
    const diag = Math.hypot(window.innerWidth, window.innerHeight) || 1;

    let dSep = dist - this._pinchDist;
    if (!this._pinchZoomLive) {
      if (Math.abs(dSep) < PINCH_DEAD_PX) dSep = 0;
      else { dSep -= Math.sign(dSep) * PINCH_DEAD_PX; this._pinchZoomLive = true; }
    }
    if (dSep) {
      this._pinchDist = dist;
      const m = PINCH_SIGN * (dSep / diag) * PINCH_GAIN;
      // Accumulate, then bound. NOT clamped to 8..40 here — that is the
      // camera's clamp (camera.js:784) and it owns the current distance;
      // duplicating it in a module that cannot see this.dist would just be a
      // second, wrong opinion about where the ends are.
      this.zoomDelta = Math.min(ZOOM_ACC_MAX, Math.max(-ZOOM_ACC_MAX, this.zoomDelta + m));
    }

    let dMid = midX - this._pinchMidX;
    if (!this._pinchPanLive) {
      if (Math.abs(dMid) < PINCH_DEAD_PX) dMid = 0;
      else { dMid -= Math.sign(dMid) * PINCH_DEAD_PX; this._pinchPanLive = true; }
    }
    if (dMid) {
      this._pinchMidX = midX;
      this.orbitDelta += dMid * ORBIT_PX_RATE * this._orbitSens();
    }
  }

  // ---------------------------------------------------------- touch stick guts

  // Place the ring's CENTRE, clamped so the whole ring stays on screen (and
  // inside the notch/home-indicator insets) however close to the bezel the
  // thumb lands. Deliberately clamps the RENDER only — this.joyOrigin, which is
  // what every vector is measured from, stays exactly where the finger touched.
  //
  // Those two cannot both be honoured near an edge: a ring fully on screen, a
  // knob that rests at the ring's centre, and a zero vector at the moment of
  // arming are three constraints and there is only room for two. Clamping the
  // ORIGIN instead is the common shortcut and it buys the third by giving up
  // the first: a thumb landing 20 px from the bezel would arm ~27 px off centre
  // in a ~39 px throw — 0.7 of full deflection, i.e. the hole sets off at full
  // speed before the player has moved a muscle. Clamping the render gives up
  // only the exact coincidence of ring centre and fingertip, which is invisible
  // in the one place it happens: under an opaque thumb.
  _placeRing(cx, cy) {
    const r = this.joyEl.getBoundingClientRect();
    const w = r.width || 120;
    this._joyThrow = w * JOY_THROW_FRAC;
    const s = this._safeInsets();
    const m = w * 0.5 + JOY_EDGE_PAD;
    const lo = { x: s.left + m, y: s.top + m };
    const hi = { x: window.innerWidth - s.right - m, y: window.innerHeight - s.bottom - m };
    // A viewport narrower than the ring inverts the box; centre it rather than
    // letting Math.min/Math.max resolve to the wrong bound.
    const x = hi.x < lo.x ? window.innerWidth * 0.5 : Math.min(Math.max(cx, lo.x), hi.x);
    const y = hi.y < lo.y ? window.innerHeight * 0.5 : Math.min(Math.max(cy, lo.y), hi.y);
    this.joyEl.style.left = `${x}px`;
    this.joyEl.style.top = `${y}px`;
  }

  // Draw the ring, once, on the frame the stick first leaves the dead zone.
  //
  // This is TOUCH SLOP: a gesture is not committed to an interpretation until
  // movement exceeds a threshold. The dead zone already IS that threshold, so
  // there is no new constant to get wrong — which is the reason to key off it
  // rather than off a hold-back timer. A timer would be a race against how fast
  // a particular human lands two fingers, and it fails for everyone slower than
  // whatever number we picked.
  //
  // What it buys: the stick's home is now the whole surface, so the first
  // pointer of every two-finger zoom arms the stick. Revealing on pointerdown
  // made every pinch flash a ring for as long as it took the second finger to
  // land. A pinch's fingers do not travel before the pair forms, so a gesture
  // that never crosses the dead zone never draws anything.
  //
  // The haptic moved here from arm for the same reason: a buzz on a gesture
  // that turns out to be a zoom is a phantom cue. It stays a one-shot per
  // gesture — _joyEverLive latches, so a thumb crossing back and forth over the
  // dead zone cannot make it stutter.
  _revealRing() {
    if (this.joyEl) this.joyEl.classList.remove('latent');
    // No-op on iOS Safari (which has never shipped the API), and this runs
    // inside a pointer handler on Android, which is a user gesture, so it
    // cannot trip the "blocked, no user activation" path.
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // Safe-area insets in px, read off the four --sai-* custom properties
  // css/main.css resolves from env(). Read through CSS rather than guessed
  // because env() has no JS equivalent, and cached per viewport size because
  // getComputedStyle forces a style flush and this is called from a touch
  // handler. The key includes the size so a rotation re-reads them (portrait
  // and landscape have different insets on a notched phone).
  _safeInsets() {
    const key = `${window.innerWidth}x${window.innerHeight}`;
    if (this._insets && this._insetsKey === key) return this._insets;
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    try {
      const cs = getComputedStyle(document.documentElement);
      for (const k of ['top', 'right', 'bottom', 'left']) {
        const n = parseFloat(cs.getPropertyValue(`--sai-${k}`));
        if (Number.isFinite(n)) out[k] = n;
      }
    } catch (e) { /* no computed style (headless teardown) — zeros are safe */ }
    this._insets = out;
    this._insetsKey = key;
    return out;
  }

  // The first-run hint, settled once per page load on the first frame that
  // actually asks for a move — NOT in the constructor. Two things are unknown
  // at construction time and both change the answer: main.js has not assigned
  // this.settings yet (so pointMove reads false even when the player has it
  // on, and the hint would teach a control that mode replaces outright), and
  // no level is running, so the hint would be armed behind the landing screen
  // and burn its one appearance on a menu.
  _settleHint() {
    this._hintSettled = true;   // one shot, whatever the outcome below
    const el = document.getElementById('touch-hint');
    if (!el) return;
    // Exactly when the stick is live, which is now the same test the stick
    // itself uses rather than a second copy of the coarse query. It had drifted
    // in the direction that matters: on its own, the coarse test hid "Drag to
    // steer" from precisely the narrow-window mouse player who has just been
    // given a stick and has no other way to find out it is there. A desktop
    // player still gets nothing — the hint would be a ghost ring sitting on
    // their city for nine seconds.
    if (!this._stickLive() || this.pointMove) return;
    // localStorage throws outright in Safari private mode rather than
    // returning null, and a first-run hint is not worth a broken control file.
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { seen = false; }
    if (seen) return;
    this._hintEl = el;
    el.classList.remove('hidden');
  }

  _dismissHint() {
    const el = this._hintEl;
    if (!el) return;
    this._hintEl = null;
    el.classList.add('hidden');
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* private mode */ }
  }

  // Re-latch the camera yaw the stick's angles are read against.
  //
  // This is the one place a camera yaw is allowed to reach the heading, and the
  // rule that makes it safe is WHEN, not how much. Direct steer is inherently
  // camera-relative — "up on the stick" has no meaning without a screen — so it
  // needs a yaw, and the chase camera is simultaneously slewing itself to sit
  // behind that same heading. Re-read the live yaw on every frame and the two
  // form a closed loop with no fixed point except dead ahead: target =
  // yaw + phi, yaw chases heading, so for any phi != 0 the heading advances by
  // phi forever and a held stick drives the hole in a circle. That is not a
  // tuning problem, it is the loop's steady state.
  //
  // Latching cuts it by construction: the basis is only ever written on frames
  // where the stick is NOT commanding a heading (in the dead zone, or lifted).
  // A frame that writes the basis does not read it, so there is no path from
  // yaw back to heading and nothing to wind up. Held for the life of a push,
  // which is what makes a held stick draw a straight line — the thing "drag to
  // steer" actually promises — at the cost of the stick's meaning drifting away
  // from the screen as the camera swings behind you during a long turn. That
  // cost is bounded and self-correcting: relax the thumb to the middle for one
  // frame and the basis is current again, no lift required.
  _latchBasis(camYaw) {
    if (!Number.isFinite(camYaw)) return;
    this._basisYaw = camYaw;
    // A standing chase hold travels WITH the basis, because they are the same
    // claim: "this is the yaw the stick's angles mean". Without this the two
    // drift apart the moment a second finger orbits between pushes — the basis
    // re-latches to the new yaw here while the hold still names the old one,
    // and the camera's own recentre (camera.js _yawOffset, which eases back to
    // _followYaw once the orbit grace lapses) would quietly drag the view back
    // to a pose the player had already dragged away from.
    if (this._chaseHold !== null) this._setChaseHold(camYaw);
  }

  // Should this surface get the on-screen stick?
  //
  // Asked of the SURFACE, never of the event, and never cached. Not cached
  // because a desktop window is resizable and devtools' responsive mode flips
  // both clauses live — a value latched at construction would answer for the
  // window the page happened to open in, which is the same class of mistake as
  // the touch-only listeners this replaces.
  //
  // The coarse test is the exact query css/main.css uses for its device block,
  // so the HUD and the stick can never disagree about what a phone is. The
  // width clause is the addition, and it is what fixes the reported bug: a mouse
  // in a phone-width window is a fine pointer that hovers, so the coarse test
  // alone says "desktop" and leaves the player with no control at all.
  //
  // Above the threshold with a fine pointer, nothing changes: no stick, and no
  // orbit drag either, because there never was one — Q/E are the mouse's manual
  // look. Below it a mouse now gets the whole touch scheme, orbit drag included.
  // That IS new behaviour for a narrow desktop window rather than something
  // being preserved, and it is the point: a player down there previously had a
  // canvas that ignored every drag.
  _stickLive() {
    const coarse = typeof matchMedia === 'function' &&
      matchMedia('(hover: none) and (pointer: coarse)').matches;
    return coarse || window.innerWidth <= STICK_MAX_W;
  }

  // Capture keeps a gesture reporting to the canvas after it leaves the canvas,
  // which is the usual source of a stick that sticks: without it, a thumb that
  // slides onto the HUD (or a mouse that exits the window) stops sending moves
  // and never sends the up, so the role is held forever. Wrapped because
  // setPointerCapture throws if the pointer is already gone, and a control file
  // must not break a gesture over a race it cannot lose meaningfully.
  _capture(e) {
    try { this._canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
  }

  _release(e) {
    try { this._canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already implicit */ }
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
    // Dropping the pointer releases its finger back into the camera pool, which
    // is a change to the pinch's participating set arriving without a touch
    // event. Re-baseline or the next touchmove differences a live separation
    // against one measured when that finger was not part of the pair.
    this._rebasePinch();
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
  // The ring is thumb-sized with a filled knob, which is right for a thumb rest
  // and wrong for a destination pip — it would put a quarter of the width of a
  // phone on the exact spot the player is trying to look at. Shrunk by inline
  // style rather than by a new CSS rule so the two uses of the same node stay
  // in one file; the joystick path clears the override rather than restoring a
  // number, so the CSS --joy-size clamp stays the only place the ring is sized.
  _markerMode(on) {
    if (!this.joyEl) return;
    this.joyEl.style.width = this.joyEl.style.height = on ? '44px' : '';
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
    // `latent` belongs to the stick's arm-then-reveal path; the destination pip
    // shares this node and must never inherit it.
    this.joyEl.classList.remove('hidden', 'latent');
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

  // Steering sensitivity for A/D and for direct steer's convergence rate. Same
  // turnSens × size-ramp stack as the sandbox orbit — it is the same "the
  // player's only turn rate" slider, now reaching the primary turn control —
  // but the campaign branch differs: campaign steering runs at the flat base
  // rate instead of the campaign orbit's legacy 1.8 rad/s. The stick multiplies
  // this by DIRECT_STEER_BOOST and then caps it, so the slider still moves the
  // touch feel but cannot push it past what the chase camera can follow.
  _steerSens() {
    if (!this.chaseMode) return 1;
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

  // camYaw: current camera yaw. Two consumers, both one-way. It SEEDS the
  // heading on the first move input of a level (while this.heading is null),
  // and it is LATCHED into the screen basis on frames where neither the stick
  // nor the keys are commanding anything (_latchBasis). Neither is a read on a
  // frame that also writes a heading from it, which is what keeps the chase
  // camera's aim free of a feedback loop — the heading remains absolute world
  // state that the camera cannot steer.
  // WASD name a screen direction against that basis, Q/E orbit the camera by
  // hand, R/F dolly. The touch stick names an angle directly — same scheme,
  // finer quantization. The touch CAMERA never reaches here at all: one finger
  // orbits and two pinch-zoom straight into orbitDelta/zoomDelta from the
  // event handlers, on the pixels dragged rather than on a per-frame rate, so
  // there is nothing for a frame to integrate.
  // hole: {x, z, radius} — only point-to-move needs it; omit it and the scheme
  // is inert, which is what every caller that predates it does.
  getMove(camYaw, dt, hole) {
    const step = this._frameDt(dt);
    if (!this._hintSettled) this._settleHint();
    let ix = 0, iy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    const orbitRate = ORBIT_RATE * this._orbitSens();
    if (this.keys.has('KeyQ')) this.orbitDelta += orbitRate * step;
    if (this.keys.has('KeyE')) this.orbitDelta -= orbitRate * step;
    // The stick is no longer folded into ix/iy — it steers a different scheme
    // now (see the header note), so it carries its own pair through. Invert
    // applies to both because it is a statement about the player's hands, not
    // about a particular device: invertX mirrors left/right, invertY mirrors
    // up/down, and on the stick that is a mirror of the commanded ANGLE rather
    // than of a turn direction.
    let sx = this.joyVec.x, sy = this.joyVec.y;
    if (this.settings.invertX) { ix = -ix; sx = -sx; }
    if (this.settings.invertY) { iy = -iy; sy = -sy; }
    const stickMag = Math.hypot(sx, sy);

    if (this.keys.has('KeyR')) this.zoomDelta -= ZOOM_RATE * step;
    if (this.keys.has('KeyF')) this.zoomDelta += ZOOM_RATE * step;

    // --- point-to-move ------------------------------------------------------
    // Resolved BEFORE the direct-steer branches and it wins outright while a
    // target is live, so a stray key cannot argue with a finger. Keys are not
    // disabled by the setting though: on a desktop both are reasonable, and
    // WASD picks up again the frame the pointer target retires.
    if (this.pointMove) {
      const pt = this._pointMoveVec(hole);
      this._syncMarker();
      if (pt) {
        // Point-to-move wants the chase: the heading it writes below IS the
        // direction the player asked to travel in, named in world space rather
        // than against the screen, so nothing is erased by the camera swinging
        // behind it. Releasing here also covers the setting being flipped on
        // while a stick hold was standing.
        this._setChaseHold(null);
        // Keep the heading honest while something else drives the hole: the
        // chase camera aims at the heading, and the first W after the target
        // retires must continue where the pointer left off, not where an old
        // heading points. Inverse of forward = (-sin, -cos) below.
        if (pt.x || pt.z) this.heading = Math.atan2(-pt.x, -pt.z);
        return pt;
      }
    } else if (this._ptTarget || this._pt) {
      this._clearPoint();   // setting turned off mid-gesture
    }

    // --- direct steer (touch stick) -------------------------------------------
    // The stick's angle IS a direction, in the screen basis latched at the last
    // moment the stick was at rest. It beats the keys outright while it is out
    // of the dead zone rather than summing with them — the two schemes disagree
    // about what an input means (one names an angle, the other a turn rate), so
    // a frame that ran both would be integrating a rate on top of a converging
    // error and neither control would do what it says. Keys pick up again the
    // frame the thumb comes back to the middle, which is the only case that
    // matters in practice: a phone with a keyboard attached.
    // `!this.pointMove` is the read-time half of an exclusivity that was only
    // enforced at routing time. onPointerDown will not ARM the stick while
    // pointing is on, which covers every gesture that begins in that mode — but
    // the setting is live, read off the object the settings screen mutates, so
    // it can flip while a stick finger is already down and holding a joyVec.
    // Nothing in the block above zeroes it (onPointerUp does, on lift), so
    // without this the player would be steering with a stick their mode says
    // does not exist. Mirrors the _clearPoint() in the other direction.
    if (!this.pointMove && stickMag > JOY_DEAD) {
      const basis = Number.isFinite(this._basisYaw) ? this._basisYaw
        : (Number.isFinite(camYaw) ? camYaw : 0);
      // Screen -> world. Screen-up is the camera's own forward, i.e. heading ==
      // basis; screen-LEFT is heading + pi/2, because forward is
      // (-sin h, -cos h) and increasing h rotates it from -z toward -x. sy runs
      // DOWN the screen (client coordinates), so the up component is -sy and
      // the left component is -sx, and the angle off screen-up is atan2 of the
      // two in that order.
      const target = basis + Math.atan2(-sx, -sy);
      // Pin the chase camera to the basis for as long as the stick is driving.
      //
      // This is THE fix for "down still goes forward", and the reason it is not
      // a sign flip is that the sign was never wrong. The world direction this
      // branch produces is exact: measured over 8 drag directions x 4 stick
      // origins x 4 camera yaws with the chase frozen, the hole's screen-space
      // travel matched the drag to within 6.1 deg, and to 0.0 deg on all four
      // cardinals — down went backward, from every origin. Then the camera slews
      // behind the heading it just set (camera.js, driveHeading), at a rate that
      // is CAPPED TO ITS OWN (see DIRECT_STEER_MAX above, which was deliberately
      // matched to camera.js FOLLOW_MAX_RATE), so it turns in lockstep with the
      // reversal and the reversal is never on screen. The same 128 pushes with
      // the chase live all settled to a screen direction of 0.0-2.0 deg — up-
      // screen — whatever was dragged.
      //
      // The genre answers this the same way: hole.io and its peers pair the
      // drag-anywhere floating stick with a camera whose yaw never rotates, so
      // the stick's angle and the screen agree permanently. Chasing the
      // direction of travel is a TANK affordance, and with the keyboard direct
      // as well there is no scheme left that wants it: the hold below is the
      // standing contract whenever anything is steering, keys included.
      //
      // Held at the basis rather than "frozen wherever we are": the basis is
      // only written on frames the stick is at rest (_latchBasis), where it
      // equals the live yaw, so engaging costs no motion and releasing asks for
      // no swing back. A camera that snapped behind the heading the instant a
      // thumb lifted would be the same bug wearing a different hat.
      this._setChaseHold(basis);
      // First input of a level. Seeded to the BASIS rather than to the target:
      // seeding to the target would snap the sprocket to face wherever the
      // first flick pointed, and the sprocket is already drawn at a heading
      // (main.js welds controls.heading onto the hole for the directional
      // skins). Starting at the basis means the very first push turns from
      // up-screen, visibly, exactly like every push after it.
      if (this.heading === null) this.heading = Math.atan2(Math.sin(basis), Math.cos(basis));
      // Shortest path through +/-pi. Without the wrap a target of -3.10 rad
      // from a heading of 3.10 reads as 6.20 rad of error and the hole takes
      // the long way round through a full turn to reach a point 5 deg away.
      const err = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const rate = Math.min(
        ORBIT_RATE * this._steerSens() * DIRECT_STEER_BOOST,
        DIRECT_STEER_MAX * (1 + (DIRECT_STEER_MAX_RAMP - 1) * this.sandboxSizeProgress),
      );
      const maxStep = rate * step;
      this.heading += Math.abs(err) <= maxStep ? err : Math.sign(err) * maxStep;
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
      // Full throw, always. Magnitude past the dead zone is deliberately NOT
      // speed: both sims re-normalise `move` themselves (voxelsim.js step,
      // sim.js step — same NOTE as _pointMoveVec), so a 0.4 vector would be
      // scaled straight back to 1.0 and the only thing a half-push would buy is
      // a control that lies about what it is doing. Proportional speed is one
      // line in each sim, not a fudge here.
      return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) };
    }
    // At rest (or lifted) — the one safe moment to re-read the camera. See
    // _latchBasis for why this line's POSITION is the whole feedback argument.
    this._latchBasis(camYaw);

    // --- direct steer (keyboard) --------------------------------------------
    // The keys are the stick with eight positions: (ix, iy) names a screen
    // direction against the same latched basis, the heading chases it through
    // the same wrapped shortest arc at the same capped rate, and the intent is
    // full-throw along the heading. W is up-screen, D is screen-right — and
    // pressed after a W+A hold it turns there DIRECTLY (at most a 180 deg
    // shortest-arc swing), where the tank scheme this replaced had to unwind
    // every degree A had wound in first, while W kept driving: the hole looped
    // the long way round to go right. Screen-LEFT is heading + pi/2 (see the
    // stick branch above), so with iy negative for W the angle off screen-up
    // is atan2(-ix, -iy), matching the stick's atan2(-sx, -sy).
    if (ix || iy) {
      const basis = Number.isFinite(this._basisYaw) ? this._basisYaw
        : (Number.isFinite(camYaw) ? camYaw : 0);
      const target = basis + Math.atan2(-ix, -iy);
      // Same camera contract as the stick (the long note above): hold the
      // chase at the basis while a key is driving, so a reversal happens on
      // screen instead of underneath a slewing camera. The campaign camera
      // ignores the hold (followDir is false there).
      this._setChaseHold(basis);
      if (this.heading === null) {
        // First input of a level: face up-screen so W reads as "drive away".
        this.heading = Math.atan2(Math.sin(basis), Math.cos(basis));
      }
      const err = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const rate = Math.min(
        ORBIT_RATE * this._steerSens() * DIRECT_STEER_BOOST,
        DIRECT_STEER_MAX * (1 + (DIRECT_STEER_MAX_RAMP - 1) * this.sandboxSizeProgress),
      );
      const maxStep = rate * step;
      this.heading += Math.abs(err) <= maxStep ? err : Math.sign(err) * maxStep;
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
      // Full throw, always — both sims re-normalise `move` themselves (same
      // NOTE as the stick branch and _pointMoveVec).
      return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) };
    }
    return { x: 0, z: 0 };
  }

  consumeOrbit() { const d = this.orbitDelta; this.orbitDelta = 0; return d; }
  consumeZoom() { const d = this.zoomDelta; this.zoomDelta = 0; return d; }
}
