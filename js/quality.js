// Device quality tiers: boot-time detection plus a live frame-time watchdog.
//
// Why this exists as its own module rather than in main.js: it is a policy
// table, a classifier and a controller, and it has to be readable and testable
// on its own — main.js is boot glue and a state machine. It imports nothing
// from the game; main.js is what pushes a tier into the renderer and the sim.
//
// What it is NOT: a GPU story. The sandbox is CPU-bound — measured on an RTX
// 4060 Ti, `world.render` (35 draw calls, ~1M triangles) is 0.60 ms/frame while
// debris physics alone is 7.11 ms. Every lever below that actually moves a
// phone's frame time is a CPU lever; the pixel-ratio one is here because a 3x
// phone panel is the one place the GPU DOES bind.

// Ordered worst-last: stepping down means moving right.
export const TIER_ORDER = ['high', 'medium', 'low', 'potato'];

// The levers, all of them measured on the Boston profile (82,894 blocks,
// SIZE 5, 45 s) unless noted:
//   debrisCap      — loose debris physics is 47.7% of CPU and the only cost that
//                    grows without bound during a session. The single biggest
//                    lever there is.
//   contactBudget  — the number of loose blocks the pair-relaxation may consider
//                    per step, nearest the hole first. This is the lever that
//                    actually binds a runaway session: measured at 4x throttle on
//                    Brooklyn, a sustained run reaches ~800 loose blocks costing
//                    1266 ms/frame in that pass, and `debrisCap` alone barely
//                    dents it because most of that pile is debris resting on other
//                    DEBRIS, which must not be slept onto a support that can
//                    vanish (it hangs in the sky) — `_capDebris` skips it via
//                    `_looseSup`. Excluded blocks are parked, not integrated:
//                    see the long note in _resolveDebrisContacts.
//   contactRounds  — `_resolveDebrisContacts` is 24.9% of CPU on its own; the
//                    second relaxation round is roughly half of that.
//   supportEvery   — `_recalcSupport` is 8.6%; this amortises the coverage-driven
//                    half of its trigger (a graph change still recalcs at once).
//   maxSubSteps    — the fixed-timestep catch-up ceiling (main.js). The biggest
//                    lever of all on a device that is already behind, because it
//                    is the one that breaks the positive feedback loop rather
//                    than shaving a constant off it. See the note at the loop.
//   dpr            — no-op on a 1x panel by construction; 2.25x fewer fragments
//                    on a 3x phone panel, shadow pass included.
//   shadows        — a second draw of every casting bucket.
//   ambient        — 0.4% of CPU. Included because it is free once the tier is
//                    already down, not because it buys anything. Do not sell it.
//
// HIGH is exactly the pre-tier build: Infinity / Infinity / 2 / 1 / 6 / 1.5 / on / on. That is
// deliberate and load-bearing — a default-tier sim must stay byte-identical, and
// `tools/validate.mjs` never constructs a tier at all.
export const TIERS = {
  high: { dpr: 1.5, shadows: true, ambient: true, debrisCap: Infinity, contactBudget: Infinity, contactRounds: 2, supportEvery: 1, maxSubSteps: 6 },
  medium: { dpr: 1.25, shadows: true, ambient: true, debrisCap: 650, contactBudget: 400, contactRounds: 2, supportEvery: 1, maxSubSteps: 4 },
  low: { dpr: 1, shadows: false, ambient: false, debrisCap: 280, contactBudget: 200, contactRounds: 1, supportEvery: 2, maxSubSteps: 2 },
  potato: { dpr: 1, shadows: false, ambient: false, debrisCap: 120, contactBudget: 100, contactRounds: 1, supportEvery: 3, maxSubSteps: 1 },
};

// Software rasterisers and the "your GPU is blocklisted" fallbacks. A machine
// running one of these is not going to be rescued by a tier, but POTATO at
// least keeps it interactive.
const SOFTWARE_RE = /swiftshader|llvmpipe|software|basic render|microsoft basic|generic renderer/i;
// Mobile and integrated parts. Not a judgement about any specific chip — the
// classifier only uses this to decide that the CORE COUNT and MEMORY figures
// below should be read as a phone's rather than a workstation's.
const MOBILE_GPU_RE = /adreno|mali|powervr|apple gpu|videocore|tegra|immortalis|xclipse/i;

// The renderer string is behind an extension that some browsers gate; on the
// ones that don't expose it, `RENDERER` is a useless "WebGL 1.0" style string
// and the classifier just falls through to the cheap signals. Never throw: a
// detection failure must land on a tier, not on an exception during boot.
export function unmaskedRenderer(gl) {
  try {
    let ctx = gl;
    let temp = null;
    if (!ctx) {
      if (typeof document === 'undefined') return '';
      temp = document.createElement('canvas');
      ctx = temp.getContext('webgl2') || temp.getContext('webgl');
      if (!ctx) return '';
    }
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
    // A throwaway context holds a real GPU context slot until it is GC'd, and
    // browsers cap those at ~16 — losing it explicitly is not optional.
    if (temp) {
      const lose = ctx.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    return typeof s === 'string' ? s : '';
  } catch (e) {
    return '';
  }
}

// Boot-time classification. Conservative in one direction only, and ONLY for
// handhelds: guessing too LOW costs some pixels and some rubble, guessing too
// HIGH costs a slideshow on the device class most mobile players are on. The
// watchdog can walk a wrong guess down within a few seconds; it cannot
// un-annoy someone whose first ten seconds ran at 12 fps.
//
// Desktops are the opposite call, and deliberately so: the tier ladder exists
// for phones (every measured lever above is a CPU lever a phone feels). A
// mouse-and-keyboard machine classifies HIGH, full stop — no core-count or
// memory demotions — and main.js pins it there (watchdog off). A desktop that
// genuinely cannot hold HIGH still has the settings quality row as the escape
// hatch; a desktop that CAN hold it must never wake up on MEDIUM because a
// browser bucketed its RAM or a frame hitched during boot. The one exception
// that stays is the software renderer: a machine rasterising WebGL on its CPU
// cannot run the default sim at any tier but POTATO.
export function detectTier(env = {}) {
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : {});
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 0;
  const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;
  const renderer = 'renderer' in env ? env.renderer : unmaskedRenderer(env.gl);
  const coarse = 'coarse' in env ? !!env.coarse : matchesCoarsePointer();
  const px = 'screenPx' in env ? env.screenPx : screenPixels();
  const why = [];

  if (SOFTWARE_RE.test(renderer)) {
    return { tier: 'potato', why: [`software renderer (${renderer})`], renderer, cores, mem, coarse, screenPx: px };
  }

  const mobileGpu = MOBILE_GPU_RE.test(renderer);
  // Touch-only + a small panel is a phone whether or not the GPU string says so;
  // a touch laptop reports a coarse pointer too, which is why the panel size has
  // to agree before this counts.
  const handheld = mobileGpu || (coarse && px > 0 && px <= 1280 * 800);

  // Desktop-class machines pin HIGH: no core-count or memory demotions (see the
  // header note). `desktopClass` is what main.js uses to switch the watchdog
  // off; the classifier's own answer is already HIGH by construction here.
  if (!handheld) {
    const why = [`desktop-class (${cores || '?'} cores${renderer ? `, ${renderer}` : ''})`];
    return { tier: 'high', why, renderer, cores, mem, coarse, screenPx: px, desktopClass: true };
  }

  let idx = 1; // handhelds start at MEDIUM and demote on evidence
  why.push(mobileGpu ? `mobile GPU (${renderer || 'unknown'})` : 'coarse pointer + small panel');
  // hardwareConcurrency is the only CPU signal a browser gives, and the sandbox
  // is CPU-bound, so it carries real weight here. It is also the signal most
  // likely to be clamped for privacy — hence "0 means unknown, do not demote".
  if (cores > 0 && cores <= 4) { idx = 2; why.push(`${cores} logical cores`); }
  if (cores > 0 && cores <= 2) { idx = 3; why.push('2 or fewer cores'); }
  // deviceMemory is Chromium-only and bucketed (0.25/0.5/1/2/4/8). 4 GB is the
  // common phone bucket and is not on its own a reason to go below MEDIUM.
  if (mem > 0 && mem <= 4) { idx = Math.max(idx, 2); why.push(`${mem} GB device memory`); }
  if (mem > 0 && mem <= 2) { idx = 3; why.push('2 GB or less device memory'); }

  return { tier: TIER_ORDER[Math.min(idx, TIER_ORDER.length - 1)], why, renderer, cores, mem, coarse, screenPx: px, desktopClass: false };
}

function matchesCoarsePointer() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;
  } catch (e) { return false; }
}

function screenPixels() {
  try {
    if (typeof window === 'undefined' || !window.screen) return 0;
    return (window.screen.width || 0) * (window.screen.height || 0);
  } catch (e) { return 0; }
}

// --- live watchdog -----------------------------------------------------------
//
// Detection guesses from static hardware facts; this measures what the machine
// actually does with the scene it was handed. Boston is 2.1x Brooklyn's block
// count, so the same phone genuinely belongs on different tiers in different
// levels — no static classifier can know that.
//
// Three things it has to get right, and each of them is a way the naive version
// fails:
//   1. It must ignore one-off stalls. Building Lower Manhattan blocks the main
//      thread for ~1.3 s; a tab returning from the background reports a gap of
//      whole seconds. Either one, fed to a p95, drops the player to POTATO for a
//      hitch that will never recur. Hence WARMUP and STALL_MS.
//   2. It must not oscillate. A quality setting that flickers is worse than one
//      that is merely low — the flicker is what the player notices, not the
//      pixels. Hence the cooldowns AND the ratchet below.
//   3. It must be allowed to step back UP, or a single unlucky stretch pins a
//      capable machine at POTATO for the rest of the session.
//
// The ratchet is the anti-oscillation mechanism that a cooldown alone cannot
// provide: if a tier we stepped UP to has to be abandoned again within
// RELAPSE_MS, that tier is recorded as a ceiling and never tried again this
// session. So the worst case is one visible flicker per tier, ever, instead of
// an indefinite cycle. Cooldowns only control the RATE of change; the ratchet
// controls how many times a given mistake may be repeated.
const WARMUP_MS = 2000;      // covers the scene build + the first frames' shader compiles
const STALL_MS = 250;        // a single frame worse than this is an event, not a trend
const DOWN_WINDOW_MS = 3000;
const UP_WINDOW_MS = 8000;   // stepping up needs 2.7x the evidence stepping down does
const DOWN_P95_MS = 42;      // p95 worse than ~24 fps: the 1-in-20 frames are visibly hitching
const UP_P95_MS = 20;        // p95 better than 50 fps, with headroom to spare
const DOWN_COOLDOWN_MS = 4000;
const UP_COOLDOWN_MS = 9000;
// Step up, then back down inside this = that tier is a ceiling. It has to be
// comfortably longer than the fastest possible up-then-down, which is
// UP_COOLDOWN_MS + DOWN_WINDOW_MS = 12 s — at 15 s the window covered barely one
// cycle and a measured relapse at 17 s (climb to MEDIUM at +53 s, fall at +70 s,
// same conditions) slipped through and was allowed to repeat.
const RELAPSE_MS = 25000;
const RETAIN_MS = UP_WINDOW_MS + 2000; // ring retention; must exceed the widest window read

export class QualityWatchdog {
  // `onChange(tier, reason)` is called only when the tier actually moves.
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.enabled = false;
    this.tier = 'high';
    this._ceiling = 0;      // lowest index we are allowed to climb to (the ratchet)
    this.reset('high');
  }

  // Called on every level start. `pin` disables the watchdog entirely — a player
  // who chose a tier by hand keeps it, and a paused/menu frame must not feed it.
  start(tier, { pinned = false } = {}) {
    this.reset(tier);
    // The ratchet records "this tier was tried HERE and did not hold". That is a
    // claim about one scene under one set of conditions, and this module's own
    // premise is that it cannot be a claim about the device: Boston is 2.1x
    // Brooklyn's block count, so the same machine genuinely belongs on different
    // tiers in different levels. Left standing across a level start it silently
    // became the stronger claim — a relapse recorded in Boston made HIGH
    // unreachable in Brooklyn for the rest of the page session, and survived the
    // player pinning a tier by hand and setting it back to AUTO, since that path
    // also comes through here. Measured before this line: after one relapse, 40 s
    // of unbroken 16 ms frames on the next level topped out at MEDIUM.
    //
    // Everything else the ratchet is defending is per-window and already cleared
    // by reset() above; this is the one piece of learned state that outlived the
    // conditions it was learned under.
    this._ceiling = 0;
    this.enabled = !pinned;
  }

  reset(tier) {
    if (tier) this.tier = tier;
    this._t = 0;            // ms of accepted samples since the window opened
    this._buf = [];         // {t, ms} ring, trimmed by age
    this._elapsed = 0;      // ms since start, for the warmup gate
    this._cooldown = 0;     // ms remaining before another change is allowed
    this._sinceUp = -1;     // ms since the last step UP, or -1 if we have not
    this._stalls = 0;       // diagnostics: how many samples were discarded
  }

  // frameMs is the RAW gap between rAF callbacks. Pass it unclamped: main.js
  // clamps its own copy to 0.1 s for the sim's catch-up, and a clamped sample
  // would hide exactly the frames this is looking for.
  sample(frameMs) {
    if (!this.enabled || !(frameMs > 0)) return;
    this._elapsed += frameMs;
    if (this._cooldown > 0) this._cooldown -= frameMs;
    if (this._sinceUp >= 0) this._sinceUp += frameMs;
    if (this._elapsed < WARMUP_MS) return;
    if (frameMs > STALL_MS) { this._stalls++; return; }

    this._t += frameMs;
    const buf = this._buf;
    buf.push({ t: this._t, ms: frameMs });
    // Retain MORE than the widest window we read. Trimming to exactly
    // UP_WINDOW_MS makes the "is the window full?" test below unsatisfiable: the
    // trim guarantees the oldest surviving sample is younger than the window, so
    // a test for "oldest is at least a window old" can never pass and the
    // watchdog can never step back up. Measured: a 30 s unthrottled stretch after
    // a demotion produced zero up-steps.
    while (buf.length && this._t - buf[0].t > RETAIN_MS) buf.shift();
    if (this._cooldown > 0) return;

    const down = this._p95(DOWN_WINDOW_MS);
    if (down !== null && down > DOWN_P95_MS) { this._step(1, `p95 ${down.toFixed(1)} ms over ${DOWN_WINDOW_MS / 1000} s`); return; }
    const up = this._p95(UP_WINDOW_MS, true);
    if (up !== null && up < UP_P95_MS) this._step(-1, `p95 ${up.toFixed(1)} ms over ${UP_WINDOW_MS / 1000} s`);
  }

  // p95 over the last `windowMs`. `full` demands the window is actually full —
  // stepping up on four seconds of a nine-second window is how a watchdog talks
  // itself into a tier it cannot hold. "Full" means we have accumulated at least
  // `windowMs` of ACCEPTED samples since the last reset, which is why the ring
  // has to retain more than the window it is asked about.
  _p95(windowMs, full = false) {
    const buf = this._buf;
    if (!buf.length) return null;
    const cut = this._t - windowMs;
    if (full && this._t - buf[0].t < windowMs) return null;
    const v = [];
    for (let i = buf.length - 1; i >= 0 && buf[i].t > cut; i--) v.push(buf[i].ms);
    if (v.length < 30) return null;   // half a second of frames, minimum
    v.sort((a, b) => a - b);
    return v[Math.min(v.length - 1, Math.floor(v.length * 0.95))];
  }

  _step(dir, reason) {
    const i = TIER_ORDER.indexOf(this.tier);
    const next = i + dir;
    if (next < this._ceiling || next >= TIER_ORDER.length) return;
    if (dir < 0) {
      this._sinceUp = 0;
      this._cooldown = UP_COOLDOWN_MS;
    } else {
      // Relapse: we climbed to this tier recently and it did not hold. Record it
      // as a ceiling so the session never tries it again.
      if (this._sinceUp >= 0 && this._sinceUp < RELAPSE_MS) this._ceiling = Math.max(this._ceiling, i + 1);
      this._sinceUp = -1;
      this._cooldown = DOWN_COOLDOWN_MS;
    }
    const from = this.tier;
    this.tier = TIER_ORDER[next];
    this._buf.length = 0;   // the old tier's frames say nothing about the new one
    this._t = 0;
    this.onChange(this.tier, `${dir > 0 ? 'down' : 'up'} from ${from}: ${reason}`);
  }
}
