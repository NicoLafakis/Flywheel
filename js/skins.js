// Hole skins: the registry, the geometry primitives, and the per-frame runtime.
//
// A skin used to be one hex value tinting one flat ring. It is now a ROW in the
// registry below plus, at most, one small builder function — the DECOR_LAYERS
// idiom from voxelworld.js, where adding a thing is a row and never a code
// change. Geometry, per-element animation, consumption feedback and world-space
// trails all ride on four primitives and one trick:
//
//   ringPart()   N hard-edged wedges of an annulus
//   tickPart()   N SQUARE teeth standing off the rim
//   barTeeth()   a straight BANK of square blades (two banks interleave)
//   worldQuads() the same, parented to the scene instead of the hole
//   lidPart()    a half-disc clipped to the hole's own circle, for eyelids
//
//   The trick: animation is written into the COLOR ATTRIBUTE on the CPU, never
//   into a shader. 16 wedges x 8 verts x 3 floats is 384 floats a frame — free —
//   and it keeps a fully animated 16-element rim at ONE draw call with the same
//   MeshBasicMaterial the flat ring already used. Same
//   vertex-colours-instead-of-shaders idiom as rampQuadGeo() in voxelworld.js.
//
// Measured (Chromium/ANGLE, desktop, renderer.info): today's hole is 2 draw
// calls. Median skin here is 3, worst is 7 (Deep Funnel's five throat rings),
// worst update() is 0.0048 ms — 0.03% of a 16.7 ms frame. One skin is live at
// a time, so that is the whole cost of the feature.
//
// Four laws every skin obeys:
//
//   1. THE RESTING POSE KEEPS THE VOID. A skin may do anything it likes to the
//      centre DURING a bite, a growth or a milestone — those are transient and
//      they are feedback. At rest and while travelling it must read as a hole in
//      the ground, because that is the state the player steers in. The
//      constraint is not "do not touch the centre", it is "do not blind the
//      player to what they are about to eat".
//   2. STEADY-STATE COVER IS ADDITIVE; TRANSIENT COVER MAY BE OPAQUE. Anything
//      drawn outside the rim that is always on uses additive blending, which can
//      only brighten and therefore cannot hide a block. A jaw closing for 0.3 s
//      is allowed to be solid; an eyelid is opaque but is geometrically absent
//      while the eye is open.
//   3. AT MOST 16 ANGULAR FEATURES. At SIZE 12 the hole subtends ~166 px on a
//      1080p viewport (fov 50, camera ~84 m — see camera.js). 12 features is
//      43 px of arc each at SIZE 1 and 22 px at SIZE 12; 24 features alias into
//      mush at the far end. Smooth gradients may use more wedges, distinct
//      FEATURES may not.
//   4. THE RIM IS 15% OF THE RADIUS, NOT 8%. The old ring was 0.92-1.00 —
//      0.53 m thick at SIZE 12, about 6 screen px, which is why the hole used to
//      dissolve into a smudge once the camera pulled out to 84 m. 0.86-1.01
//      doubles that for free and costs nothing at SIZE 1.
//
// NO RANDOMNESS AT ALL. Not "seeded" — none. Every skin is a pure function of
// (t, hole state, element index); the flicker in Burn Rate is two incommensurate
// sines per tooth, the Shredder's confetti spray is derived from the chip index.
// So this module does not import rng.js: there is nothing here to seed. A skin
// that looked different every run would not be a design.

import * as THREE from 'three';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { const d = clamp01(v); return d * d * (3 - 2 * d); };
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ primitives

function partMaterial(color, opacity, additive) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true,
    transparent: true, opacity,
    depthTest: false, depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  // Since r151 three draws a DOUBLE-SIDED TRANSPARENT material in two passes,
  // back faces then front, to fix self-sorting. Measured: it doubled every skin's
  // draw calls (attribution went 9 meshes -> 18 calls). These are flat coplanar
  // ground quads with nothing to self-sort, so one pass is correct and free.
  m.forceSinglePass = true;
  return m;
}

// Shared tail of every part: stash the ramp weights and hand back a setter that
// writes one element's colour across all of its vertices in one go.
function finishPart(geo, pos, idx, ramp, vertsPer, count, cols, opts) {
  // A ramps array shorter than its radii ladder writes `undefined` into the
  // weights, which becomes NaN in the colour buffer and renders as black — a
  // silent, plausible-looking failure rather than a loud one. It cost three
  // visual passes once; it will not cost a fourth.
  for (let i = 0; i < ramp.length; i++) {
    if (!Number.isFinite(ramp[i])) throw new Error('skins: ramps array is shorter than its radii ladder');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const col = new Float32Array(pos.length);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, partMaterial(0xffffff, opts.opacity ?? 1, opts.additive));
  m.position.y = opts.y ?? 0.02;
  m.renderOrder = opts.order ?? 1000;
  m.userData.ramp = ramp;
  m.userData.vertsPer = vertsPer;
  m.userData.count = count;
  m.userData.rows = vertsPer / cols;
  m.userData.set = (i, r, gr, b) => {
    const base = i * vertsPer;
    for (let v = 0; v < vertsPer; v++) {
      const k = (base + v) * 3, w = ramp[base + v];
      col[k] = r * w; col[k + 1] = gr * w; col[k + 2] = b * w;
    }
    g.attributes.color.needsUpdate = true;
  };
  // Per-RADIAL-RUNG control. `rowMul[j]` scales rung j, which is how a tooth
  // appears to GROW inward without touching a single vertex position: build it
  // at full length, then reveal it a rung at a time. Every jaw in the creature
  // family is this one function.
  m.userData.setRows = (i, rowMul, r, gr, b) => {
    const base = i * vertsPer;
    for (let v = 0; v < vertsPer; v++) {
      const k = (base + v) * 3, w = ramp[base + v] * rowMul[(v / cols) | 0];
      col[k] = r * w; col[k + 1] = gr * w; col[k + 2] = b * w;
    }
    g.attributes.color.needsUpdate = true;
  };
  m.userData.setAll = (r, gr, b) => { for (let i = 0; i < count; i++) m.userData.set(i, r, gr, b); };
  return m;
}

// A reveal ramp: rungs up to `k` (fractional, 0..1 of the ladder) are lit, with
// one rung of soft edge so the growing tooth does not step in hard blocks.
function reveal(out, rows, k, invert) {
  const edge = k * (rows - 1);
  for (let j = 0; j < rows; j++) {
    const jj = invert ? rows - 1 - j : j;
    out[j] = clamp01(edge - jj + 1);
  }
  return out;
}

// N wedges of an annulus. `radii` is the radial ladder (2 entries = a plain
// band, 3 = a band with a falloff shoulder); `ramps` is the brightness weight at
// each rung, which is how a halo fades out at both edges with no texture.
function ringPart(count, radii, ramps, opts = {}) {
  const sub = opts.sub ?? 3;              // arc subdivisions per wedge
  const gap = opts.gap ?? 0;              // fraction of the wedge left dark
  const step = (opts.arc ?? TAU) / count; // `arc` < TAU makes a lid, a wedge, a half-disc
  const span = step * (1 - gap);
  const pos = [], idx = [], ramp = [];
  const rows = radii.length, cols = sub + 1;
  const vertsPer = rows * cols;
  for (let i = 0; i < count; i++) {
    const a0 = i * step + (opts.phase ?? 0);
    const base = i * vertsPer;
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < cols; k++) {
        const a = a0 + (k / sub) * span;
        pos.push(Math.cos(a) * radii[j], 0, Math.sin(a) * radii[j]);
        ramp.push(ramps[j]);
      }
    }
    for (let j = 0; j < rows - 1; j++) {
      for (let k = 0; k < sub; k++) {
        const p = base + j * cols + k;
        idx.push(p, p + 1, p + cols + 1, p, p + cols + 1, p + cols);
      }
    }
  }
  return finishPart(null, pos, idx, ramp, vertsPer, count, cols, opts);
}

// N SQUARE teeth. Straight tangential sides, not arcs — this is the house mark's
// profile (js/ui/sprocket.js): the wheel has to read as the same 1 m voxel stock
// the cities are cut from, and it is what keeps our sprocket unmistakably not
// anyone else's involute-toothed logo.
function tickPart(count, radii, ramps, halfWidth, opts = {}) {
  const step = TAU / count;
  const pos = [], idx = [], ramp = [];
  const rows = radii.length, vertsPer = rows * 2;
  const taper = opts.taper ?? 1;          // outer rung width multiplier
  for (let i = 0; i < count; i++) {
    const a = i * step + (opts.phase ?? 0);
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = i * vertsPer;
    for (let j = 0; j < rows; j++) {
      const w = halfWidth * (1 + (taper - 1) * (j / Math.max(1, rows - 1)));
      const r = radii[j];
      pos.push(ca * r - sa * w, 0, sa * r + ca * w);
      pos.push(ca * r + sa * w, 0, sa * r - ca * w);
      ramp.push(ramps[j], ramps[j]);
    }
    for (let j = 0; j < rows - 1; j++) {
      const p = base + j * 2;
      idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
    }
  }
  return finishPart(null, pos, idx, ramp, vertsPer, count, 2, opts);
}

// A straight BANK of square blades, laid along local X and extending in local
// +Z. Two of these facing each other, offset by half a pitch, interleave when
// they meet — which is the difference between a shredder and a pair of jaws.
function barTeeth(count, lengths, ramps, halfWidth, spacing, opts = {}) {
  const pos = [], idx = [], ramp = [];
  const rows = lengths.length, vertsPer = rows * 2;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    const base = i * vertsPer;
    for (let j = 0; j < rows; j++) {
      pos.push(x - halfWidth, 0, lengths[j]);
      pos.push(x + halfWidth, 0, lengths[j]);
      ramp.push(ramps[j], ramps[j]);
    }
    for (let j = 0; j < rows - 1; j++) {
      const p = base + j * 2;
      idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
    }
  }
  return finishPart(null, pos, idx, ramp, vertsPer, count, 2, opts);
}

// A closing EYELID: a half-disc CLIPPED to the eye's circle, rebuilt per frame.
// Sliding an unclipped half-disc across the hole leaves it parked on the tarmac
// outside the rim whenever the eye is open, which is both wrong and ugly.
// Clipping means the lid only ever exists inside the void. 14 quads, one
// draw call, and the positions are the only thing that changes.
function lidPart(cols, opts = {}) {
  const pos = new Float32Array(cols * 12);
  const col = new Float32Array(cols * 12);
  const idx = [];
  for (let i = 0; i < cols; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, partMaterial(0xffffff, opts.opacity ?? 1, false));
  m.position.y = opts.y ?? 0.026;
  m.renderOrder = opts.order ?? 1005;
  m.frustumCulled = false;
  // k 0..1 is how far this lid has swept in from its own rim; sign picks which
  // side it comes from. Two lids at k = blink/2 meet exactly in the middle.
  m.userData.sweep = (k, sign, R, r, gr, b) => {
    const edge = R * (1 - 2 * clamp01(k));
    for (let i = 0; i < cols; i++) {
      const x0 = -R + (i / cols) * 2 * R, x1 = -R + ((i + 1) / cols) * 2 * R;
      const h0 = Math.sqrt(Math.max(0, R * R - x0 * x0));
      const h1 = Math.sqrt(Math.max(0, R * R - x1 * x1));
      const a0 = Math.min(h0, Math.max(edge, -h0));
      const a1 = Math.min(h1, Math.max(edge, -h1));
      const q = i * 12;
      const put = (o, x, z) => {
        pos[q + o] = x; pos[q + o + 1] = 0; pos[q + o + 2] = z * sign;
        col[q + o] = r; col[q + o + 1] = gr; col[q + o + 2] = b;
      };
      put(0, x0, a0); put(3, x1, a1); put(6, x1, h1); put(9, x0, h0);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  };
  return m;
}

// World-space quads (trails, touchpoint dots, ripples). Same setter, but the
// vertex positions are rewritten too, and depth testing is ON so a building
// between the camera and the mark occludes it correctly.
function worldQuads(count, opts = {}) {
  const pos = new Float32Array(count * 12);
  const col = new Float32Array(count * 12);
  const idx = [];
  for (let i = 0; i < count; i++) {
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const wm = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true, transparent: true,
    opacity: opts.opacity ?? 1, depthTest: !opts.local, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  wm.forceSinglePass = true;
  const m = new THREE.Mesh(g, wm);
  m.renderOrder = opts.order ?? (opts.local ? 1004 : 5);
  m.frustumCulled = false;
  m.userData.setQuad = (i, x, z, hw, hz, ang, r, gr, b) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const k = i * 12;
    const put = (o, dx, dz) => {
      pos[k + o] = x + dx * c - dz * s;
      // World-space marks are depth-tested, so they must clear the TALLEST
      // ground-hugging decor in either renderer, not just the ground plane.
      // Both grounds sit at y=0, but the campaign stacks 27 opaque depth-writing
      // planes above it — water and building pads at 0.02, tree pads at 0.025,
      // ROADS at 0.03 (measured off the live scene graph, not read off the
      // source). A mark under that ceiling is not dimmer, it is gone, and only
      // over roads and footprints, so it would blink as the hole crosses a kerb.
      //
      // 0.04 rather than a hair over 0.03 because the camera's near plane is
      // 0.1 (camera.js), which puts 24-bit depth resolution near 0.004 units at
      // a pulled-back 80-unit shot — a 0.005 gap is one or two steps and would
      // z-fight. 0.04 keeps 0.010 of clearance over the roads and the same
      // 0.010 under the campaign's hole disc at 0.05, and 0.010 is the gap the
      // old 0.0095-over-bare-ground value had already proven in the sandbox.
      // Local parts are unaffected: they are depthTest:false.
      pos[k + o + 1] = opts.local ? 0.024 : 0.04;
      pos[k + o + 2] = z + dx * s + dz * c;
      col[k + o] = r; col[k + o + 1] = gr; col[k + o + 2] = b;
    };
    put(0, -hw, -hz); put(3, hw, -hz); put(6, hw, hz); put(9, -hw, hz);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  };
  m.userData.clear = () => { col.fill(0); g.attributes.color.needsUpdate = true; };
  return m;
}

// sRGB -> linear. This is not optional and it is easy to miss: since r152
// `material.color.setHex()` treats its argument as sRGB and stores linear, but a
// value written straight into the COLOR ATTRIBUTE is taken as linear and encoded
// on output. Skipping the conversion makes every vertex-coloured part render
// visibly lighter and washed out compared to the same hex on a material — so a
// skin's rim would not match its own shop swatch, which is the one thing a skin
// has to get right.
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const rgb = (hex) => [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [1, 1, 1];

// The rim is the one normal-blended surface, so writing a brightness above 1
// into it does not glow — it clips channel by channel and the skin's identity
// colour turns into white. Scaling all three channels by the same factor keeps
// the hue and still lets the consumption lerp reach white on purpose.
// setRim's clamp, exposed for parts that are not the rim. Writing >1 into a
// NORMAL-blended surface clips channel by channel and turns the skin's identity
// colour into white; scaling all three by the same factor keeps the hue.
function safeb(c, b) { const m = Math.max(c[0], c[1], c[2]) * b; return m > 1 ? b / m : b; }

function setRim(part, i, c, b) {
  const m = Math.max(c[0], c[1], c[2]) * b;
  const k = m > 1 ? b / m : b;
  part.userData.set(i, c[0] * k, c[1] * k, c[2] * k);
}

// Angular-constancy compensation. Anything reaching past ~1.5x the rim is
// multiplied by this so its WORLD size does not explode with the hole: at SIZE 1
// a 3.2x halo is 7 m across, at SIZE 12 it would be 42 m. The camera only pulls
// back by 2x over that range, so the multiplier has to come down or the halo
// eats the screen.
const reach = (mult, radius) => mult - (mult - 1) * 0.55 * clamp01((radius - 1.1) / 5.5);

// Distance boost. Vertex colours are multiplied by material.color, so ONE grey
// written into every part's material lifts the whole skin's contrast as the
// camera pulls out — no per-builder plumbing, no shader, no extra draw call.
// Fine detail loses contrast to the frame long before it loses pixels; this is
// the cheapest correction that keeps a 12-tooth wheel legible at 84 m.
const farBoost = (camDist) => 1 + 0.30 * clamp01((camDist - 22) / 55);

// ------------------------------------------------------------------ reactions
//
// The sim already emits everything a character needs and almost none of it is
// used for anything but audio (js/voxelsim.js:1751-1759, js/main.js:344-390):
//
//   { type:'eat', obj, hole, gained, chain }   per object consumed
//   { type:'growth', size, hole }              SIZE level up
//   { type:'milestone', frac }                 25/50/75/100% of the city
//   hole.chain / hole.chainTimer               combo count and its countdown
//
// The two renderers disagree about `obj`: the campaign sim gives tier/golden/
// kind, the voxel sandbox gives a block with .s and .mat. One normaliser hides
// that from every skin, so a jaw opens wider for a bus than for a hydrant in
// both games without either builder knowing which game it is in.

export function biteFromEvent(ev) {
  const o = ev.obj || {}, h = ev.hole || {};
  let size;
  if (o.tier != null) size = clamp01((o.tier - 1) / 6);          // campaign: 1..7
  else if (o.s != null) size = clamp01((o.s - 0.5) / 2.5);        // sandbox: brick edge
  else size = clamp01(Math.log2(1 + (ev.gained || 1)) / 7);       // fallback: mass
  // World position of the meal, however the sim happens to carry it, and the
  // bearing FROM the hole TO it. Skins that mark the ground (Attribution,
  // Compounding) and skins that take a side (A/B Split) both need this, and
  // neither of them should have to know the sim's field names.
  const x = o.x ?? o.px ?? (o.mesh ? o.mesh.position.x : undefined);
  const z = o.z ?? o.pz ?? (o.mesh ? o.mesh.position.z : undefined);
  const hx = h.x ?? 0, hz = h.z ?? 0;
  const bearing = (x === undefined || z === undefined)
    ? (ev.bearing || 0)
    : Math.atan2(z - hz, x - hx) - (h.heading != null ? -h.heading : 0);
  return {
    size, golden: !!o.golden, landmark: o.kind === 'landmark',
    // The two sims disagree about where these live and it is not worth making
    // either of them change. voxelsim.js puts `chain` on the event; sim.js does
    // not, but passes `hole`, which has carried `chain` all along. Same for
    // `gained`: the campaign's swallow-start event has not scored yet, so fall
    // back to the object's own mass, which is what `gained` is derived from.
    chain: ev.chain ?? h.chain ?? 0,
    gained: ev.gained ?? o.mass ?? 0,
    // sim.js computes an exact swallow duration per object
    // (`swallowDuration()`: 0.22-0.62 s by size ratio) and ships it on the
    // event. When it is there, a jaw should stay shut for exactly as long as
    // the thing actually takes to go down rather than for a guess.
    dur: ev.dur,
    bearing, x, z,
    color: o.color != null ? o.color : (o.mat && o.mat.color != null ? o.mat.color : null),
  };
}

// One bite is one shot: snap shut, hold, ease open. Duration and depth scale
// with what was eaten.
//
// The important subtlety is CHATTER DAMPING. At a high chain the eat events
// arrive every ~0.25 s, and a jaw that closed fully on every one of them would
// be shut more often than open — which is exactly the "blinding the player"
// failure the old no-centre rule was trying to prevent. So the first bite after
// a pause is a full chomp and a machine-gun chain degrades into fast shallow
// chatter. That is both safer and a better read: you can SEE the difference
// between one big meal and a plough through a row of parked cars.
class Chomp {
  constructor() { this.a = 0; this.dur = 0.3; this.depth = 0; this.last = -9; this.age = 9; }
  fire(t, bite) {
    const rest = clamp01((t - this.last) / 0.55);
    this.depth = bite.size * (0.42 + 0.58 * rest) * (bite.golden ? 1.35 : 1);
    if (bite.landmark) this.depth = 1.2;
    this.depth = Math.min(1.15, Math.max(0.28, this.depth));
    // Prefer the sim's real swallow duration when it gives us one — the jaw
    // then holds for exactly as long as the object is visibly going down, which
    // no guess can match. Clamped because a 0.62 s hold is at the edge of what
    // still reads as feedback rather than as an obstruction.
    this.dur = Number.isFinite(bite.dur)
      ? Math.min(0.62, Math.max(0.18, bite.dur))
      : 0.2 + bite.size * 0.34;
    this.last = t; this.age = 0;
  }
  // 0 = open, 1 = shut. Fast close, brief hold, eased release.
  value(dt) {
    this.age += dt;
    const k = this.age / this.dur;
    if (k >= 1) return 0;
    const shape = k < 0.16 ? smooth(k / 0.16)
      : k < 0.34 ? 1
      : 1 - smooth((k - 0.34) / 0.66);
    return shape * this.depth;
  }
}

// ------------------------------------------------------------------- registry
//
// One row per skin, in the DECOR_LAYERS idiom: `id`, `name` and `price` are the
// contract with save data and the shop; `color`/`css` stay exactly as they were
// so a build that has not loaded the runtime yet still renders today's flat ring.
// `build` is the only code a new skin needs, and most rows share a builder.

export const SKINS = [
  { id: 'classic', name: 'Baseline', price: 0, color: 0x4be34b, css: '#4be34b',
    blurb: 'Where every campaign starts. Measure it before you move it.', build: buildBaseline },
  { id: 'funnel', name: 'The Funnel', price: 100, color: 0xff4fa3, css: '#ff4fa3',
    blurb: 'Awareness in. Revenue out. You are the conversion event.', build: buildFunnel },
  { id: 'neon', name: 'Impressions', price: 150, color: 0x00f0ff, css: '#00f0ff',
    blurb: 'The counter never stops. Neither do you.', build: buildImpressions },
  { id: 'sprocket', name: 'Sprocket Drive', price: 200, color: 0x9fb3c8, css: '#9fb3c8',
    blurb: 'Twelve square teeth of pure operating cadence.', build: buildSprocket },
  { id: 'lava', name: 'Burn Rate', price: 250, color: 0xff5a1f, css: '#ff5a1f',
    blurb: 'Spend fast, grow faster. The board will understand.', build: buildBurnRate },
  { id: 'pipeline', name: 'Pipeline Stages', price: 300, color: 0x5c7cfa, css: '#5c7cfa',
    blurb: 'Five rings. Every deal you swallow moves one stage inward.', build: buildPipeline },
  { id: 'frost', name: 'Cold Outreach', price: 350, color: 0x70c0ff, css: '#70c0ff',
    blurb: 'Ice-cold until it lands. Then it warms up fast.', build: buildColdOutreach },
  { id: 'radar', name: 'ICP Radar', price: 400, color: 0x2bff9b, css: '#2bff9b',
    blurb: 'Sweeps for your ideal customer profile. Blips are lunch.', build: buildRadar },
  { id: 'galaxy', name: 'Total Addressable Market', price: 500, color: 0xb44bff, css: '#b44bff',
    blurb: 'The faint ring is everything you have not eaten yet.', build: buildTAM },
  { id: 'abtest', name: 'A/B Split', price: 600, color: 0xffc23e, css: 'linear-gradient(90deg,#ffc23e 50%,#8b5cf6 50%)',
    blurb: 'Left is variant A. Right is variant B. Statistically significant.', build: buildABTest },
  { id: 'attribution', name: 'Attribution Ripple', price: 700, color: 0xe4c98d, css: '#e4c98d',
    blurb: 'Every touchpoint gets credit. The city remembers where you went.', build: buildAttribution },
  { id: 'gold', name: 'Compounding', price: 800, color: 0xffd23f, css: '#ffd23f',
    blurb: 'The curve behind you is the whole pitch deck.', build: buildCompounding },

  // ---- the creature shelf: skins that REACT rather than skins that look ----
  //
  // CUT CANDIDATES, in this order, if the shelf has to shrink. Recorded here
  // because a registry row is a one-line deletion and the reasoning should not
  // have to be re-derived by whoever makes the call:
  //   1. chomper — its closed fangs read close enough to closer's that at 84 m
  //      you cannot name which one you are wearing, and the chart's honesty (it
  //      really is your last twelve `gained` values) is invisible at speed.
  //   2. shredder — the only skin whose straight banks fight the circular
  //      silhouette; it took three tuning passes to stop reading as a cattle
  //      grid over a manhole, and the rim has to be drawn LAST to win.
  { id: 'chomper', name: 'Dashboard Jaws', price: 450, color: 0x4fd1c5, css: '#4fd1c5',
    family: 'creature',
    blurb: 'Your last twelve bites, plotted. The chart bites back.', build: buildChomper },
  { id: 'shredder', name: 'The Shredder', price: 550, color: 0x9aa9bb, css: '#9aa9bb',
    family: 'creature',
    blurb: 'Unqualified leads go in. Confetti comes out.', build: buildShredder },
  { id: 'eyeballs', name: 'Eyeballs', price: 650, color: 0xc98b2e, css: '#c98b2e',
    family: 'creature',
    blurb: 'The oldest metric in advertising. It watches. It blinks.', build: buildEyeballs },
  { id: 'throat', name: 'Deep Funnel', price: 750, color: 0xff4fa3, css: '#ff4fa3',
    family: 'creature',
    blurb: 'Top of funnel, bottom of funnel, and the part nobody diagrams.', build: buildThroat },
  { id: 'closer', name: 'The Closer', price: 900, color: 0xb8c4d4, css: '#b8c4d4',
    family: 'creature',
    blurb: 'It only ever opens in order to close.', build: buildCloser },

  // ---- the partner shelf: tributes to HubSpot solutions partners ----------
  //
  // Eight agencies, each wearing its OWN REAL LOGO — traced offline from the
  // vector file its site serves and baked into PARTNER_LOGOS as static point
  // data, never fetched. Four more were dropped for want of a vector original
  // rather than approximated by hand; the evidence for each is recorded with
  // the trace, in THE PARTNER SHELF further down.
  //
  // `color` is the rim, `accent` its alternating second tone, `logo` the key
  // into the traced data, and every one of the three is data — the eight rows
  // share ONE builder, so a ninth partner is a row and a trace, not code.
  //
  // `family: 'partner'` is the cheap seam: the shop iterates SKINS flat today,
  // and the tag is what lets it grow a Partners section later without anyone
  // having to work out after the fact which rows belong together.
  //
  // Uniform 750 above the previous top row so the shelf reads as one set, and
  // every id is namespaced `partner-*` because save data keys off `id` and a
  // collision with the first 17 would silently swap a player's skin.
  { id: 'partner-supered', name: 'Supered', price: 750, color: 0xe5097f, accent: 0x252a4a,
    css: 'linear-gradient(90deg,#e5097f 50%,#252a4a 50%)', family: 'partner', logo: 'supered',
    blurb: 'Guidance built into the tool itself. Adoption stops being a hope.', build: buildPartner },
  { id: 'partner-newbreed', name: 'New Breed', price: 750, color: 0x733bf6, accent: 0x3ad531,
    css: 'linear-gradient(90deg,#733bf6 50%,#3ad531 50%)', family: 'partner', logo: 'newbreed',
    blurb: 'Demand and RevOps in one motion. The handoff never drops.', build: buildPartner },
  { id: 'partner-impulse', name: 'Impulse Creative', price: 750, color: 0xf3961f, accent: 0xeb004f,
    css: 'linear-gradient(90deg,#f3961f 50%,#eb004f 50%)', family: 'partner', logo: 'impulse',
    blurb: 'Brand, story and system on one idea. It travels well.', build: buildPartner },
  { id: 'partner-sixandflow', name: 'Six & Flow', price: 750, color: 0x019fd6, accent: 0xea7765,
    css: 'linear-gradient(90deg,#019fd6 50%,#ea7765 50%)', family: 'partner', logo: 'sixandflow',
    blurb: 'Sprints run in flow. The pipeline keeps its rhythm.', build: buildPartner },
  { id: 'partner-kuno', name: 'Kuno Creative', price: 750, color: 0x6842d3, accent: 0x82edf7,
    css: 'linear-gradient(90deg,#6842d3 50%,#82edf7 50%)', family: 'partner', logo: 'kuno',
    blurb: 'Inbound from before it had a name. Still compounding.', build: buildPartner },
  { id: 'partner-saltedstone', name: 'Salted Stone', price: 750, color: 0x007297, accent: 0xd68231,
    css: 'linear-gradient(90deg,#007297 50%,#d68231 50%)', family: 'partner', logo: 'saltedstone',
    blurb: 'Global implementations, cut clean and set solid.', build: buildPartner },
  // The primary here really is #002d56, and a rim in it is invisible against a
  // 0x232838 ground. The row carries the lavender the mark is drawn in and the
  // navy stays in the swatch, the same trade buildABTest makes with its `color`.
  { id: 'partner-mediajunction', name: 'Media Junction', price: 750, color: 0xc191f8, accent: 0x4cdeba,
    css: 'linear-gradient(90deg,#002d56 50%,#c191f8 50%)', family: 'partner', logo: 'mediajunction',
    blurb: 'Where the site, the CRM and the content finally meet.', build: buildPartner },
  { id: 'partner-huble', name: 'Huble', price: 750, color: 0xff4d56, accent: 0x1f3042,
    css: 'linear-gradient(90deg,#ff4d56 50%,#1f3042 50%)', family: 'partner', logo: 'huble',
    blurb: 'One hub, many time zones. The diagram survives the audit.', build: buildPartner },
];

export const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));

// ------------------------------------------------------------------- builders
//
// Every builder returns { parts, world, update(st), onEat(st, bearing) }.
// `st` is the hole state the renderer already has:
//   { t, dt, radius, glow, chain, size, sizeFrac, progress, speed, heading,
//     x, z, camDist, reduced }

function buildBaseline(row) {
  const c = rgb(row.color);
  const rim = ringPart(12, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const tick = tickPart(12, [1.03, 1.07], [1, 1], 0.018, { additive: true, y: 0.021, order: 1001, phase: TAU / 24 });
  for (let i = 0; i < 12; i++) {
    const b = i % 3 === 0 ? 1 : 0.72;
    rim.userData.set(i, c[0] * b, c[1] * b, c[2] * b);
    tick.userData.set(i, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
  }
  // Deliberately inert: the free skin is the ruler the paid ones are measured
  // against, and a starter that already looks expensive kills the shop.
  return { parts: [rim, tick], update() {} };
}

function buildFunnel(row) {
  const stages = [
    { part: ringPart(12, [1.18, 1.30], [1, 1], { additive: true, gap: 0.12, y: 0.023, order: 1002 }), c: rgb(0x7a2450), lag: 0.00, base: 0.85 },
    { part: ringPart(12, [1.05, 1.15], [1, 1], { additive: true, gap: 0.09, y: 0.022, order: 1001 }), c: rgb(0xc23a78), lag: 0.16, base: 0.9 },
    { part: ringPart(12, [0.86, 1.01], [1, 1], { gap: 0, y: 0.02, order: 1000 }), c: rgb(row.color), lag: 0.32, base: 1.0 },
  ];
  const pulses = [];          // { i, t0 }
  let nextAuto = 0.9, autoIndex = 0;
  return {
    parts: stages.map((s) => s.part),
    onEat(st, e) { pulses.push({ i: Math.round(e.bearing / TAU * 12) % 12, t0: st.t }); },
    update(st) {
      if (!st.reduced && st.t > nextAuto) { pulses.push({ i: autoIndex % 12, t0: st.t }); autoIndex += 5; nextAuto = st.t + 1.1; }
      while (pulses.length && st.t - pulses[0].t0 > 1.2) pulses.shift();
      for (const s of stages) {
        for (let i = 0; i < 12; i++) {
          let hot = 0;
          for (const p of pulses) {
            if (p.i !== i) continue;
            const age = st.t - p.t0 - s.lag;
            if (age > 0 && age < 0.34) hot = Math.max(hot, 1 - age / 0.34);
          }
          const k = mixc(s.c, WHITE, hot * 0.85);
          const b = s.base * (1 + hot * 1.1) * (1 + st.glow * 0.6);
          if (s.lag === 0.32) setRim(s.part, i, k, Math.min(b, 1.0));
          else s.part.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
        }
      }
    },
  };
}

function buildImpressions(row) {
  const N = 16, c = rgb(row.color);
  const rim = ringPart(N, [0.86, 1.01], [1, 1], { gap: 0.14, y: 0.02, order: 1000 });
  const dash = tickPart(N, [1.04, 1.10], [1, 0.25], 0.026, { additive: true, y: 0.021, order: 1001, phase: TAU / (N * 2) });
  let head = 0, rate = 1.4;
  return {
    parts: [rim, dash],
    onEat(st, e) { rate = Math.min(4.2, rate + 0.35 + e.size * 0.5); },
    update(st) {
      rate += (1.4 - rate) * Math.min(1, st.dt * 0.9);
      if (!st.reduced) head = (head + st.dt * rate * N) % N;
      else head = ((-st.heading / TAU) * N + N) % N;
      for (let i = 0; i < N; i++) {
        let d = (i - head + N) % N;
        const lit = d < 3 ? [1, 0.62, 0.3][Math.floor(d)] : 0;
        setRim(rim, i, mixc(c, WHITE, lit * 0.6), 0.30 + lit * 0.9 + st.glow * 0.3);
        const d2 = (i - head - 1 + N) % N;
        const lit2 = d2 < 3 ? [0.9, 0.45, 0.18][Math.floor(d2)] : 0;
        dash.userData.set(i, c[0] * (0.12 + lit2), c[1] * (0.12 + lit2), c[2] * (0.12 + lit2));
      }
    },
  };
}

function buildSprocket(row) {
  const N = 12;                             // the house mark's tooth count
  const steel = rgb(row.color), hot = rgb(0xe8f6ff);
  const teeth = tickPart(N, [0.97, 1.16], [1, 0.92], 0.058, { y: 0.021, order: 1001 });
  const rim = ringPart(24, [0.84, 1.00], [1, 1], { y: 0.02, order: 1000 });
  const hair = ringPart(24, [0.81, 0.835], [1, 1], { additive: true, y: 0.022, order: 1002 });
  const spin = new THREE.Group();
  spin.add(teeth, rim, hair);
  let ang = 0, kick = 0;
  return {
    parts: [spin],
    onEat(st, e) { kick += 0.16 + e.size * 0.34; },   // a ratchet click, sized by the meal
    update(st) {
      kick *= Math.max(0, 1 - st.dt * 5);
      if (!st.reduced) ang += st.dt * (0.35 + st.speed * 0.09) + kick * st.dt * 9;
      spin.rotation.y = -ang;
      for (let i = 0; i < N; i++) {
        // a glint travelling round the wheel: machined metal under a moving light
        const g = Math.pow(Math.max(0, Math.cos(i / N * TAU - (st.reduced ? 0.8 : st.t * 0.9))), 8);
        const k = mixc(steel, hot, g * 0.9 + st.glow * 0.5 + kick * 0.6);
        const b = 0.62 + g * 0.5 + kick;
        teeth.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
      }
      for (let i = 0; i < 24; i++) {
        setRim(rim, i, steel, 0.62 + st.glow * 0.4);
        hair.userData.set(i, hot[0] * 0.18, hot[1] * 0.18, hot[2] * 0.2);
      }
    },
  };
}

function buildBurnRate(row) {
  const N = 12, c = rgb(row.color), ember = rgb(0xffd08a);
  const rim = ringPart(N, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const flame = tickPart(N, [1.0, 1.14, 1.30], [1, 0.55, 0], 0.05, { additive: true, taper: 0.45, y: 0.021, order: 1001 });
  const lick = tickPart(N, [1.06, 1.26], [0.7, 0], 0.028, { additive: true, taper: 0.4, y: 0.022, order: 1002, phase: TAU / (N * 2) });
  let spike = 0;
  return {
    parts: [rim, flame, lick],
    onEat(st, e) { spike = Math.max(spike, 0.55 + e.size * 0.45); },
    update(st) {
      spike *= Math.max(0, 1 - st.dt * 2.6);
      const T = st.reduced ? 0 : st.t;
      for (let i = 0; i < N; i++) {
        // two incommensurate sines per tooth: deterministic fire, no rng
        const f = 0.55 + 0.45 * Math.sin(T * 3.1 + i * 2.4) * Math.sin(T * 1.7 + i * 0.9);
        const h = (0.5 + f * 0.8) * (1 + spike * 0.9);
        const k = mixc(c, ember, clamp01(f * 0.7 + spike));
        flame.userData.set(i, k[0] * h, k[1] * h, k[2] * h);
        const g = 0.35 + 0.3 * Math.sin(T * 2.3 + i * 1.7 + 1.1) + spike * 0.5;
        lick.userData.set(i, ember[0] * g, ember[1] * g, ember[2] * g);
        setRim(rim, i, mixc(c, WHITE, clamp01(st.glow + spike * 0.5)),
          (0.8 + f * 0.35) * (1 + st.glow * 0.5) * (1 + spike * 0.3));
      }
    },
  };
}

function buildPipeline(row) {
  // Five dials, coldest outside. A deal enters at the rim of the market and
  // works its way inward until you swallow it.
  const RINGS = [
    { r: [1.30, 1.37], c: 0x3b4fb8, fill: 1.00 },
    { r: [1.20, 1.27], c: 0x5c7cfa, fill: 0.78 },
    { r: [1.10, 1.17], c: 0x36c9d6, fill: 0.55 },
    { r: [1.00, 1.07], c: 0x4be36b, fill: 0.34 },
    { r: [0.86, 1.01], c: 0xffe9a8, fill: 0.18, solid: true },
  ];
  const N = 16;
  const rings = RINGS.map((R, j) => ({
    ...R, col: rgb(R.c), cur: R.fill,
    part: ringPart(N, R.r, [1, 1], { additive: !R.solid, gap: 0.18, y: 0.02 + j * 0.001, order: 1000 + j }),
  }));
  const hand = [];                          // deals in flight: { stage, t0 }
  return {
    parts: rings.map((r) => r.part),
    onEat(st, e) {
      hand.push({ t0: st.t, i: Math.round(e.bearing / TAU * N) % N });
      for (const r of rings) r.cur = Math.min(1, r.cur + 0.03);
    },
    update(st) {
      while (hand.length && st.t - hand[0].t0 > 0.8) hand.shift();
      rings[4].cur = 0.12 + st.sizeFrac * 0.88;
      for (let j = 0; j < rings.length; j++) {
        const R = rings[j];
        const lit = R.cur * N;
        const drift = st.reduced ? 0 : Math.sin(st.t * (0.5 + j * 0.13)) * 0.5;
        for (let i = 0; i < N; i++) {
          const on = i < lit ? 1 : 0;
          let hot = 0;
          for (const d of hand) {
            const age = st.t - d.t0 - j * 0.11;
            if (age > 0 && age < 0.3 && ((i - d.i + N) % N) < 2) hot = Math.max(hot, 1 - age / 0.3);
          }
          const edge = i < lit && i > lit - 1.6 ? 0.5 + drift * 0.3 : 0;
          const b = (on ? 0.85 : 0.16) + hot * 1.3 + edge + st.glow * 0.5;
          const k = mixc(R.col, WHITE, hot * 0.8);
          R.part.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
        }
      }
    },
  };
}

function buildColdOutreach(row) {
  const N = 8, cold = rgb(row.color), warm = rgb(0xffb15c);
  const rim = ringPart(12, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const shard = tickPart(N, [1.0, 1.12, 1.30], [1, 0.6, 0], 0.032, { additive: true, taper: 0.25, y: 0.021, order: 1001 });
  const heat = new Float32Array(N);
  return {
    parts: [rim, shard],
    onEat(st, e) {
      // a bigger lead warms more of the rim
      const i = Math.round(e.bearing / TAU * N) % N;
      heat[i] = Math.min(1.4, 0.75 + e.size * 0.65);
      heat[(i + 1) % N] = Math.max(heat[(i + 1) % N], 0.45);
      heat[(i + N - 1) % N] = Math.max(heat[(i + N - 1) % N], 0.45);
    },
    update(st) {
      // The heat decay survives reduced motion on purpose: it is discrete
      // feedback for an action the player took, not ambience. Only the idle
      // breathing is suppressed.
      const breathe = st.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(st.t * 0.8);
      for (let i = 0; i < N; i++) {
        heat[i] = Math.max(0, heat[i] - st.dt * 1.4);
        const h = smooth(heat[i]);
        const k = mixc(cold, warm, h);
        const b = 0.3 + breathe * 0.25 + h * 1.6;
        shard.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
      }
      let mean = 0; for (let i = 0; i < N; i++) mean += heat[i];
      mean /= N;
      const k = mixc(cold, mixc(warm, WHITE, st.glow), mean);
      const b = 0.65 + mean * 0.5 + st.glow * 0.5;
      for (let i = 0; i < 12; i++) setRim(rim, i, k, b);
    },
  };
}

function buildRadar(row) {
  const c = rgb(row.color), SW = 32, NB = 16;
  const rim = ringPart(12, [0.87, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const sweepG = new THREE.Group();
  const sweep = ringPart(SW, [1.05, 1.9, 2.6], [0.25, 1, 0], { additive: true, y: 0.021, order: 1001 });
  const blip = tickPart(NB, [2.3, 2.48], [1, 1], 0.022, { additive: true, y: 0.022, order: 1002 });
  sweepG.add(sweep, blip);
  let ang = 0;
  const seen = new Float32Array(NB);
  return {
    // The rim goes in FIRST and it must go in at all: it was built, written to
    // by setRim every frame, and never added to the group, so ICP Radar shipped
    // its whole prototype life as a glow field around a rimless hole. Caught by
    // a mechanical sweep for parts that are created and never parented, not by
    // looking at it — the missing rim reads as a style choice, which is exactly
    // why it survived every visual pass.
    parts: [rim, sweepG],
    onEat() {},
    update(st) {
      const R = reach(2.2, st.radius) / 2.6;
      sweepG.scale.setScalar(R);
      if (!st.reduced) ang = (ang + st.dt * 0.55 * TAU) % TAU;
      const head = ang / TAU * SW;
      for (let i = 0; i < SW; i++) {
        // trailing wake: bright at the head, gone 70 deg behind it
        const d = (head - i + SW) % SW;
        const w = st.reduced ? 0.10 : Math.pow(Math.max(0, 1 - d / (SW * 0.19)), 1.6);
        const b = (0.013 + w * 0.34) * (1 + st.glow * 0.6);
        sweep.userData.set(i, c[0] * b, c[1] * b, c[2] * b);
      }
      // Blips: `st.sectorMass[i]` is edible mass in that bearing sector, which
      // the sim's spatial grid already knows. A skin that is also a tool.
      const mass = st.sectorMass;
      for (let i = 0; i < NB; i++) {
        const passed = st.reduced ? 1 : (((head / SW * NB) - i + NB) % NB) < 1.2 ? 1 : 0;
        if (passed && mass) seen[i] = clamp01(mass[i]);
        seen[i] = Math.max(0, seen[i] - st.dt * (st.reduced ? 0 : 0.45));
        const b = seen[i] * 1.5 + 0.04;
        blip.userData.set(i, c[0] * b, WHITE[1] * seen[i] * 0.5 + c[1] * b, c[2] * b);
      }
      for (let i = 0; i < 12; i++) setRim(rim, i, c, 1);
    },
  };
}

function buildTAM(row) {
  const c = rgb(row.color), N = 16, HN = 48;
  const rim = ringPart(12, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const captured = ringPart(N, [1.03, 1.10], [1, 1], { additive: true, gap: 0.15, y: 0.021, order: 1001 });
  const outer = new THREE.Group();
  const halo = ringPart(HN, [1.4, 2.1, 2.8], [0, 1, 0], { additive: true, sub: 1, y: 0.022, order: 1002 });
  const edge = tickPart(12, [2.72, 2.92], [1, 1], 0.02, { additive: true, y: 0.023, order: 1003 });
  outer.add(halo, edge);
  let flare = 0, lastSize = 1;
  return {
    parts: [rim, captured, outer],
    onEat() {},
    update(st) {
      if (st.size > lastSize) { flare = 1; lastSize = st.size; }
      flare *= Math.max(0, 1 - st.dt * 1.6);
      outer.scale.setScalar(reach(2.8, st.radius) / 2.8);
      if (!st.reduced) outer.rotation.y = -st.t * 0.12;
      for (let i = 0; i < HN; i++) {
        const lobe = 0.6 + 0.4 * Math.sin(i / HN * TAU * 3 + (st.reduced ? 0 : st.t * 0.5));
        const b = (0.048 + flare * 0.2) * lobe;
        halo.userData.set(i, c[0] * b, c[1] * b, c[2] * b);
      }
      for (let i = 0; i < 12; i++) {
        const b = 0.22 + flare * 0.6;
        edge.userData.set(i, c[0] * b, c[1] * b, c[2] * b);
      }
      const lit = clamp01(st.progress) * N;
      for (let i = 0; i < N; i++) {
        const on = i < lit;
        const k = on ? mixc(c, WHITE, 0.45 + flare * 0.5) : c;
        const b = on ? 1.1 + flare : 0.13;
        captured.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
      }
      const k = mixc(c, WHITE, st.glow + flare * 0.6);
      for (let i = 0; i < 12; i++) setRim(rim, i, k, 1);
    },
  };
}

function buildABTest(row) {
  const N = 16, A = rgb(0xffc23e), B = rgb(0x8b5cf6);
  const lock = new THREE.Group();
  const rim = ringPart(N, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const sig = ringPart(N, [1.04, 1.11], [1, 1], { additive: true, gap: 0.2, y: 0.021, order: 1001 });
  lock.add(rim, sig);
  let sa = 3, sb = 3, flash = 0, winner = 0;
  return {
    parts: [lock],
    onEat(st, e) {
      // credited to whichever variant you approached from — bearing is relative
      // to heading, so left is always A. A bigger object is a bigger sample.
      const w = 1 + Math.round(e.size * 2);
      if (((e.bearing + TAU) % TAU) < Math.PI) sa += w; else sb += w;
    },
    update(st) {
      flash *= Math.max(0, 1 - st.dt * 2.2);
      // The split axis is welded to the heading. That is not autonomous motion —
      // it is the player's own steering made visible — so it survives reduced
      // motion untouched.
      lock.rotation.y = -st.heading;
      const total = sa + sb;
      const lead = Math.abs(sa - sb) / Math.max(1, Math.sqrt(total));
      const conf = clamp01(lead / 1.96);      // a wink at p < 0.05, not real stats
      if (conf >= 1) { flash = 1; winner = sa > sb ? 0 : 1; sa = 3; sb = 3; }
      const aWin = sa >= sb;
      for (let i = 0; i < N; i++) {
        const isA = i < N / 2;
        const c = isA ? A : B;
        const lead1 = (isA === aWin) ? 1 : 0.5;
        const fl = flash * ((isA ? 0 : 1) === winner ? 1 : 0);
        const k = mixc(c, WHITE, fl * 0.9);
        setRim(rim, i, k, lead1 * (1 + st.glow * 0.4) + fl * 0.8);
        // significance arc grows on the leader's side only
        const idx = isA ? i : i - N / 2;
        const on = (isA === aWin) && idx < conf * (N / 2);
        const sb2 = on ? 0.9 + fl * 1.5 : 0.06;
        sig.userData.set(i, c[0] * sb2, c[1] * sb2, c[2] * sb2);
      }
    },
  };
}

function buildAttribution(row) {
  // 4 ripples covers the worst case: 0.9 s life against ~0.26 s between
  // consumptions at a high chain. Each is its own mesh, which is why this is the
  // only skin above 5 draw calls.
  const c = rgb(row.color), accent = rgb(0x4fd1c5), DOTS = 64, RIPPLES = 4;
  const rim = ringPart(12, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const dial = tickPart(12, [1.05, 1.12], [1, 1], 0.022, { additive: true, y: 0.021, order: 1001 });
  const dots = worldQuads(DOTS);
  const rip = [];
  for (let i = 0; i < RIPPLES; i++) {
    const m = ringPart(24, [0.7, 0.88, 1.0], [0, 1, 0], { additive: true, sub: 2, y: 0.0098, order: 6 });
    m.material.depthTest = true;
    m.visible = false;
    rip.push({ mesh: m, life: 0, x: 0, z: 0 });
  }
  const log = [];             // { x, z, t }
  let head = 0, pulse = 0;
  return {
    parts: [rim, dial],
    world: [dots, ...rip.map((r) => r.mesh)],
    onEat(st, e) {
      const x = e.x ?? st.x, z = e.z ?? st.z;
      log[head % DOTS] = { x, z, t: st.t };
      head++;
      pulse = 1;
      const free = rip.find((r) => r.life <= 0);
      if (free) { free.life = 0.9; free.x = x; free.z = z; free.mesh.visible = true; }
    },
    update(st) {
      pulse *= Math.max(0, 1 - st.dt * 3);
      for (let i = 0; i < DOTS; i++) {
        const e = log[i];
        if (!e) { dots.userData.setQuad(i, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
        const age = st.t - e.t;
        const k = Math.max(0, 1 - age / 25);
        const s = st.radius * (0.16 + (1 - k) * 0.07);
        dots.userData.setQuad(i, e.x, e.z, s, s, 0.785, accent[0] * k * 0.8, accent[1] * k * 0.8, accent[2] * k * 0.8);
      }
      for (const r of rip) {
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        r.life -= st.dt;
        const k = clamp01(r.life / 0.9);
        // reduced motion: land on the final state, do not travel to it.
        // Scaled by the hole, or a SIZE-1 ripple swamps a 2.2 m player.
        const s = st.radius * (st.reduced ? 1.5 : 0.8 + (1 - k) * 1.2);
        r.mesh.position.set(r.x, 0.0098, r.z);
        r.mesh.scale.setScalar(s);
        const b = k * k * 0.32;
        for (let i = 0; i < 24; i++) r.mesh.userData.set(i, accent[0] * b, accent[1] * b, accent[2] * b);
      }
      // A consumption fires every ~0.3 s at a decent chain, so a pulse that
      // lerps half way to white keeps the rim permanently white and the skin
      // loses its colour entirely. The ripple is the feedback; the rim only
      // needs to breathe.
      const b = 0.82 + pulse * 0.25 + st.glow * 0.4;
      const k = mixc(c, WHITE, pulse * 0.22 + st.glow * 0.6);
      for (let i = 0; i < 12; i++) {
        setRim(rim, i, k, b);
        const d = 0.2 + pulse * 0.9;
        dial.userData.set(i, accent[0] * d, accent[1] * d, accent[2] * d);
      }
    },
  };
}

function buildCompounding(row) {
  const N = 16, TRAIL = 48;
  const c = rgb(row.color), hot = rgb(0xfff6d0);
  const dial = ringPart(N, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const spin = new THREE.Group();
  const teeth = tickPart(12, [1.02, 1.15], [1, 0.9], 0.05, { additive: true, y: 0.021, order: 1001 });
  spin.add(teeth);
  const trail = worldQuads(TRAIL);
  const pts = [];
  let head = 0, lastDrop = -1, ang = 0, flare = 0, lastSize = 1;
  return {
    parts: [dial, spin],
    world: [trail],
    onEat() {},
    update(st) {
      if (st.size > lastSize) { flare = 1; lastSize = st.size; }
      flare *= Math.max(0, 1 - st.dt * 1.3);
      if (!st.reduced) ang += st.dt * (0.28 + st.speed * 0.05);
      spin.rotation.y = -ang;
      // The growth curve: a ribbon dropped at a fixed spatial interval, so it
      // records DISTANCE travelled, not time — a parked hole does not smear.
      const prev = pts[(head - 1 + TRAIL) % TRAIL];
      const gap = st.radius * 0.9;           // drop spacing scales with the hole
      if (!prev || (st.x - prev.x) ** 2 + (st.z - prev.z) ** 2 > gap * gap) {
        pts[head % TRAIL] = { x: st.x, z: st.z, t: st.t, a: st.heading, w: st.radius * 0.15, l: gap * 0.60 };
        head++;
      }
      for (let i = 0; i < TRAIL; i++) {
        const p = pts[i];
        if (!p) { trail.userData.setQuad(i, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
        const near = Math.hypot(p.x - st.x, p.z - st.z) < st.radius * 1.15;
        if (near) { trail.userData.setQuad(i, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
        const k = Math.max(0, 1 - (st.t - p.t) / 7);
        const b = k * k * (0.22 + flare * 0.5);
        const col = mixc(c, hot, k * 0.2 + flare * 0.35);
        // local +x runs along travel: heading is atan2(dx, dz), so the quad's
        // rotation is its complement. Getting this wrong lays the ribbon
        // BROADSIDE to the path and it reads as a paved slab, not a curve.
        const ang = Math.PI / 2 - p.a;
        trail.userData.setQuad(i, p.x, p.z, p.l, p.w * (0.35 + k * 0.65), ang,
          col[0] * b, col[1] * b, col[2] * b);
      }
      const lit = st.sizeFrac * N;
      for (let i = 0; i < N; i++) {
        const on = i < lit;
        const k = mixc(c, hot, (on ? 0.4 : 0) + flare * 0.8 + st.glow);
        const b = (on ? 1.15 : 0.28) + flare * 0.9 + st.glow * 0.5;
        dial.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
      }
      for (let i = 0; i < 12; i++) {
        const g = Math.pow(Math.max(0, Math.cos(i / 12 * TAU - (st.reduced ? 0.7 : st.t * 0.8))), 6);
        const b = 0.35 + g * 0.8 + flare;
        const k = mixc(c, hot, g * 0.7 + flare);
        teeth.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
      }
    },
  };
}


// =========================================================================
// THE CREATURE FAMILY
// =========================================================================
// These are state machines over the sim's event stream, not looks. Each one has
// a resting pose that keeps the void readable, and a set of transient reactions
// that are allowed to do anything at all — including closing over the centre.
//
// Every jaw in here is the same trick: build the teeth at FULL length once and
// animate setRows() so they appear to grow inward. No vertex position is ever
// rewritten, so a mouth costs the same as a ring.

// --- The Shredder ---------------------------------------------------------
// Two banks of square blades, offset by half a pitch so they INTERLEAVE rather
// than butt together. Unqualified leads go in; confetti comes out.
function buildShredder(row) {
  const steel = rgb(row.color), red = rgb(0xff4d4d), pale = rgb(0xdfe8f5);
  const N = 6, LEN = [0, 0.34, 0.62, 0.88, 1.12, 1.34];
  const ones = LEN.map(() => 1);
  const mk = (o) => barTeeth(N, LEN, ones, 0.076, 0.272, o);
  const bankA = mk({ y: 0.022, order: 1002 });
  const bankB = mk({ y: 0.023, order: 1003 });
  const gA = new THREE.Group(); gA.add(bankA); gA.position.z = -0.99;
  const gB = new THREE.Group(); gB.add(bankB); gB.position.z = 0.99;
  gB.rotation.y = Math.PI;
  gB.position.x = 0.136;                     // half a pitch: the blades mesh
  const rim = ringPart(16, [0.84, 1.02], [1, 1], { y: 0.024, order: 1006 });
  const chaff = worldQuads(14, { local: true });
  const jaw = new Chomp();
  const rowsA = new Float32Array(LEN.length);
  const bits = [];
  return {
    parts: [rim, gA, gB, chaff],
    onEat(st, e) {
      jaw.fire(st.t, e);
      for (let i = 0; i < 14; i++) {
        // deterministic spray: index-derived, no rng
        bits[i] = { t0: st.t, side: i % 2 ? 1 : -1, o: ((i * 9) % 14) / 14 - 0.5,
                    sp: 1.2 + ((i * 5) % 7) * 0.22 };
      }
    },
    update(st) {
      const c = jaw.value(st.dt);
      reveal(rowsA, LEN.length, 0.24 + 0.76 * c);
      const heat = clamp01(c * 1.3);
      const col = mixc(steel, red, heat * 0.9);
      const b = safeb(col, 0.66 + c * 0.42 + st.glow * 0.2);
      for (let i = 0; i < N; i++) {
        bankA.userData.setRows(i, rowsA, col[0] * b, col[1] * b, col[2] * b);
        bankB.userData.setRows(i, rowsA, col[0] * b, col[1] * b, col[2] * b);
      }
      for (let i = 0; i < 14; i++) {
        const q = bits[i];
        const k = q ? Math.max(0, 1 - (st.t - q.t0) / 0.55) : 0;
        if (k <= 0) { chaff.userData.setQuad(i, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
        const d = 0.75 + (1 - k) * q.sp;
        const bb = k * 0.85;
        chaff.userData.setQuad(i, q.side * d, q.o * 2.1, 0.062, 0.062, q.o * 4,
          pale[0] * bb, pale[1] * bb, pale[2] * bb);
      }
      // the round rim has to hold its own against two straight banks, or the
      // whole thing silhouettes as a square grate over a round hole
      for (let i = 0; i < 16; i++)
        setRim(rim, i, mixc(steel, red, heat * 0.45), 1.15 + c * 0.35 + st.glow * 0.5);
    },
  };
}

// --- The Closer -----------------------------------------------------------
// An iris of square sprocket teeth. At rest it is indistinguishable from a
// toothed rim; then it shuts like a gear-driven aperture and goes gold.
function buildCloser(row) {
  const steel = rgb(row.color), gold = rgb(0xffd23f), hot = rgb(0xfff3c4);
  const R = [0.99, 0.84, 0.68, 0.52, 0.36, 0.20, 0.05];
  const ones = R.map(() => 1);
  const setA = tickPart(6, R, ones, 0.078, { taper: 0.42, y: 0.022, order: 1002 });
  const setB = tickPart(6, R, ones, 0.078, { taper: 0.42, y: 0.023, order: 1003, phase: TAU / 12 });
  const gA = new THREE.Group(); gA.add(setA);
  const gB = new THREE.Group(); gB.add(setB);
  const rim = ringPart(24, [0.84, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const jaw = new Chomp();
  const rows = new Float32Array(R.length);
  return {
    parts: [rim, gA, gB],
    onEat(st, e) { jaw.fire(st.t, e); },
    onGrowth(st) { jaw.fire(st.t, { size: 1, golden: true }); },
    update(st) {
      const c = jaw.value(st.dt);
      // idle drift: the teeth breathe a couple of percent so it is never frozen
      const idle = st.reduced ? 0 : 0.5 + 0.5 * Math.sin(st.t * 1.1);
      reveal(rows, R.length, 0.13 + idle * 0.02 + 0.85 * c);
      // counter-twist as they close — this is what makes them MESH instead of
      // collide, and it is the whole reason there are two sets of six
      gA.rotation.y = 0.10 * c;
      gB.rotation.y = -0.10 * c;
      const col = mixc(steel, gold, clamp01(c * 1.25));
      const b = 0.66 + c * 0.75 + st.glow * 0.35;
      for (let i = 0; i < 6; i++) {
        setA.userData.setRows(i, rows, col[0] * b, col[1] * b, col[2] * b);
        setB.userData.setRows(i, rows, col[0] * b, col[1] * b, col[2] * b);
      }
      const rc = mixc(steel, c > 0.92 ? hot : gold, clamp01(c * 1.1) * 0.8 + st.glow);
      for (let i = 0; i < 24; i++) setRim(rim, i, rc, 0.7 + c * 0.4);
    },
  };
}

// --- Eyeballs -------------------------------------------------------------
// The void is a pupil. It watches the largest mass near it, constricts when it
// swallows, and blinks when its combo is about to die.
function buildEyeballs(row) {
  const iris = rgb(row.color), limb = rgb(0xffe08a), lidc = rgb(0x141014);
  const IR = [0.40, 0.58, 0.76, 0.94, 1.02];
  const irisPart = ringPart(24, IR, [1, 1, 1, 1, 1], { sub: 2, y: 0.021, order: 1001 });
  const rim = ringPart(24, [0.94, 1.06], [1, 1], { y: 0.02, order: 1000 });
  const lidA = lidPart(14), lidB = lidPart(14);
  const look = new THREE.Group();
  look.add(irisPart);
  const rowsIris = new Float32Array(IR.length);
  let pupil = 0.62, target = 0.62, blink = 0, nextBlink = 3.2, blinkT = -9;
  return {
    parts: [rim, look, lidA, lidB],
    onEat(st, e) {
      target = e.golden ? 0.92 : 0.40 + (1 - e.size) * 0.14;   // constrict on a meal
      if (e.size > 0.55 || e.golden) blinkT = st.t;
    },
    onGrowth(st) { target = 0.94; blinkT = st.t; },
    onMilestone(st) { blinkT = st.t; nextBlink = st.t + 0.34; },
    update(st) {
      target += (0.62 - target) * Math.min(1, st.dt * 1.6);
      pupil += (target - pupil) * Math.min(1, st.dt * 9);
      // involuntary blinks, and panicked blinking when the combo is about to drop
      const panic = st.chainTimer > 0 && st.chainTimer < 0.7;
      if (!st.reduced) {
        if (st.t > nextBlink) { blinkT = st.t; nextBlink = st.t + (panic ? 0.3 : 4.4); }
        blink = Math.max(0, 1 - Math.abs(st.t - blinkT) / 0.19);
      } else blink = 0;
      // LOOK AT the fattest bearing sector. Nothing else in the game does this.
      let bi = 0, bv = 0;
      const SM = st.sectorMass, NS = SM ? SM.length : 16;
      if (SM) for (let i = 0; i < NS; i++) if (SM[i] > bv) { bv = SM[i]; bi = i; }
      const a = (bi + 0.5) / NS * TAU;
      const g = st.reduced ? 0 : Math.min(0.17, bv * 0.22);
      look.position.x += (Math.cos(a) * g - look.position.x) * Math.min(1, st.dt * 4);
      look.position.z += (Math.sin(a) * g - look.position.z) * Math.min(1, st.dt * 4);
      // the iris' INNER edge is the pupil, animated purely by the reveal ramp
      for (let j = 0; j < IR.length; j++) rowsIris[j] = clamp01((IR[j] - pupil) / 0.16);
      for (let i = 0; i < 24; i++) {
        const fibre = 0.72 + 0.28 * Math.cos(i * 2.4);         // iris striations
        const c = mixc(iris, limb, i % 2 ? 0.28 : 0);
        const b = fibre * (0.95 + st.glow * 0.6);
        irisPart.userData.setRows(i, rowsIris, c[0] * b, c[1] * b, c[2] * b);
        setRim(rim, i, mixc(limb, WHITE, st.glow), 0.85);
      }
      // two lids sliding in from opposite sides. Opaque on purpose: a blink is
      // 0.3 s long and it is the most alive thing a face can do.
      // Two lids, each sweeping half way. They meet at the equator at blink = 1
      // and are geometrically empty at blink = 0, so nothing has to be hidden.
      const k = smooth(blink) * 0.5;
      lidA.visible = lidB.visible = blink > 0.004;
      if (lidA.visible) {
        lidA.userData.sweep(k, 1, 0.995, lidc[0], lidc[1], lidc[2]);
        lidB.userData.sweep(k, -1, 0.995, lidc[0], lidc[1], lidc[2]);
      }
    },
  };
}

// --- Deep Funnel ----------------------------------------------------------
// The funnel, but with a throat. Rings recede into the dark so the void reads
// as a SHAFT rather than a sticker, and each swallow travels visibly down it.
function buildThroat(row) {
  const c = rgb(row.color), deep = rgb(0x5c1436), pale = rgb(0xffd2e8);
  const mouth = new THREE.Group();
  const lip = ringPart(16, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const flare = ringPart(16, [1.04, 1.20], [1, 1], { additive: true, gap: 0.1, y: 0.021, order: 1001 });
  mouth.add(lip, flare);
  const RR = [0.80, 0.65, 0.51, 0.39, 0.28];
  const rings = RR.map((r, j) => ringPart(16, [r, r - 0.055], [1, 1],
    { additive: true, sub: 2, y: 0.022 + j * 0.0005, order: 1002 + j }));
  const waves = [];
  let bulge = 0;
  return {
    parts: [mouth, ...rings],
    onEat(st, e) {
      waves.push({ t0: st.t, col: e.color != null ? rgb(e.color) : pale, amp: 0.5 + e.size });
      bulge = Math.max(bulge, e.size);
    },
    update(st) {
      bulge *= Math.max(0, 1 - st.dt * 4);
      while (waves.length && st.t - waves[0].t0 > 0.9) waves.shift();
      mouth.scale.setScalar(1 + bulge * 0.07);
      for (let j = 0; j < rings.length; j++) {
        let hot = 0, hc = deep;
        for (const w of waves) {
          const age = st.t - w.t0 - j * 0.065;
          if (age > 0 && age < 0.30) {
            const v = (1 - age / 0.30) * w.amp;
            if (v > hot) { hot = v; hc = w.col; }
          }
        }
        if (st.reduced) hot = waves.length ? 0.22 : 0;
        const hq = clamp01(hot);
        // Resting pulse. Without it the funnel is a static gradient between
        // bites, which is not what 750 buys. The per-ring phase offset is 0.85
        // rad, so across five rings the swell lags a little over half a period
        // and reads as travelling INWARD — the same axis a bite ripple travels,
        // so this is the throat idling rather than a second unrelated effect.
        // Damped by (1 - hq) so a bite always outshouts it, and exactly 0 under
        // reduced motion, which leaves that path's numbers untouched.
        //
        // 3.2 is deliberately large: the resting rings sit at 0.03-0.11 and a
        // 60% swing on that measures fine and is invisible on screen (two shots
        // at opposite phases were indistinguishable). It peaks near 0.47 on the
        // outer ring against a bite's ~2.0, so it is loud enough to see and
        // still a quarter of what a bite does.
        const sw = st.reduced ? 0 : (0.5 + 0.5 * Math.sin(st.t * 1.9 - j * 0.85)) * (1 - hq);
        // resting brightness falls off inward: that gradient IS the depth cue,
        // so the pulse multiplies the falloff rather than adding a flat term,
        // which would wash the gradient out at every crest.
        const base = (0.10 * (1 - j / rings.length) + 0.012) * (1 + sw * 3.2);
        const k = mixc(mixc(deep, c, 0.5), hc, hq);
        const b = base + hot * 1.9;
        rings[j].scale.setScalar(1 - hot * 0.20 + sw * 0.02);
        for (let i = 0; i < 16; i++) rings[j].userData.set(i, k[0] * b, k[1] * b, k[2] * b);
      }
      for (let i = 0; i < 16; i++) {
        setRim(lip, i, mixc(c, WHITE, st.glow + bulge * 0.3), 0.95 + bulge * 0.1);
        const fb = 0.3 + bulge * 0.5;
        flare.userData.set(i, c[0] * fb, c[1] * fb, c[2] * fb);
      }
    },
  };
}

// --- Dashboard Jaws -------------------------------------------------------
// A radial bar chart of your last twelve bites that is also a bear trap. The
// bars are real data; the fangs are what the data does when it is hungry.
function buildChomper(row) {
  const bar = rgb(row.color), fang = rgb(0xf2fbff), warn = rgb(0xff5d7a);
  const N = 12;
  const BR = [1.04, 1.15, 1.26, 1.37, 1.48];
  const FR = [0.99, 0.82, 0.65, 0.48, 0.31, 0.12];
  // One ramp per ladder. BR and FR are different lengths, and sharing a short
  // ramps array leaves `undefined` on the last rung, which lands in the colour
  // buffer as NaN and renders BLACK — invisible against the void, which is
  // exactly how it survived three visual passes before an is-finite sweep over
  // the attribute arrays caught it. See the length guard in finishPart().
  const onesB = BR.map(() => 1), onesF = FR.map(() => 1);
  const bars = tickPart(N, BR, onesB, 0.075, { additive: true, y: 0.021, order: 1001 });
  const fangs = tickPart(N, FR, onesF, 0.066, { taper: 0.28, y: 0.023, order: 1003 });
  const rim = ringPart(N, [0.88, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const hist = new Float32Array(N);
  const rowsB = new Float32Array(BR.length), rowsF = new Float32Array(FR.length);
  const jaw = new Chomp();
  let head = 0, flash = 0;
  return {
    parts: [rim, bars, fangs],
    onEat(st, e) {
      jaw.fire(st.t, e);
      hist[head % N] = e.gained || (e.size * 40 + 4);
      head++;
    },
    onGrowth() { flash = 1; },
    update(st) {
      flash *= Math.max(0, 1 - st.dt * 1.8);
      const c = jaw.value(st.dt) * (st.reduced ? 0.55 : 1);
      let max = 1e-6;
      for (let i = 0; i < N; i++) max = Math.max(max, hist[i]);
      reveal(rowsF, FR.length, 0.06 + 0.94 * c);
      const fb = safeb(fang, 0.5 + c * 0.7 + flash * 0.4);
      const fc = mixc(fang, warn, clamp01(c * 0.9) * 0.7);
      for (let i = 0; i < N; i++) {
        // newest bar first, walking backwards: the chart reads clockwise from
        // your most recent bite, which is the only ordering that stays stable
        const v = hist[(head - 1 - i + N * 2) % N] / max;
        reveal(rowsB, BR.length, 0.1 + clamp01(v) * 0.9);
        const recent = i < 1 ? 1 : i < 3 ? 0.55 : 0;
        const bc = mixc(bar, WHITE, recent * 0.5 + flash * 0.6);
        const bb = (0.34 + recent * 0.5 + flash * 0.45) * (1 + st.glow * 0.4);
        bars.userData.setRows(i, rowsB, bc[0] * bb, bc[1] * bb, bc[2] * bb);
        fangs.userData.setRows(i, rowsF, fc[0] * fb, fc[1] * fb, fc[2] * fb);
        setRim(rim, i, mixc(bar, WHITE, st.glow + flash * 0.5), 0.7 + c * 0.35);
      }
    },
  };
}

// =========================================================================
// THE PARTNER SHELF
// =========================================================================
// Eight tributes, and the mark on each one is the agency's REAL logo rather
// than a nod to it. Every path was traced OFFLINE from the vector file the
// agency's own site serves: the browser's SVG engine walked each subpath with
// getTotalLength()/getPointAtLength(), transform chains were flattened against
// the root CTM, the samples were split into subpaths on the sampling jump and
// decimated to a 0.0016 perpendicular-distance tolerance, then baked into
// PARTNER_LOGOS below. Nothing is fetched at runtime — a network call would end
// offline play, and the assets sit on someone else's origin behind their CORS.
//
// FOUR AGENCIES WERE DROPPED rather than approximated, because a wrong logo is
// worse than no logo. Aptitude 8, hapily and HarvestROI serve PNG lockups and
// PNG/JPG favicons, with no vector mark anywhere on the page — every .svg they
// do serve is a UI icon or an illustration. SmartBug Media's
// `smartbug-logo-black.svg` is a 94 KB `<rect fill="url(#pattern0)">` wrapping
// an embedded bitmap, which is a raster wearing an SVG's clothes. Tracing any
// of the four would have meant drawing by hand and calling it a trace.
//
// Three traced marks are near-black in their source file (Kuno #122b4b, Salted
// Stone #191e25, Media Junction #002d56). Additive blending cannot darken, so
// over the 0x232838 ground those would render as precisely nothing. Each is
// substituted for a colour the agency itself uses — Kuno's brand purple, Salted
// Stone's own white-on-dark treatment of that wordmark, Media Junction's
// lavender — and the substitution happens at bake time so the trace stays
// faithful to the file it came from.
//
// Cost, contour + holes, one vertex per traced point: supered 59, newbreed 160,
// impulse 45, sixandflow 130, kuno 63, saltedstone 367, mediajunction 37,
// huble 167. The heaviest row is Salted Stone at 367 plus a 128-vertex rim,
// under buildTAM's 560 — the budget this file already lives with. Two draw
// calls each: the rim, and the whole mark however many colours it has.

// Two base64 characters per coordinate over a 4096-step grid. That is 1/4096 of
// the unit box, fifteen times finer than the decimation tolerance that produced
// the points, so the encoding loses nothing the trace kept — at a third of the
// source size the equivalent number literals would cost.
const LOGO_A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOGO_I = new Uint8Array(128);
for (let i = 0; i < 64; i++) LOGO_I[LOGO_A.charCodeAt(i)] = i;

function logoPoly(s) {
  const n = s.length >> 2, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i << 2;
    out[i] = new THREE.Vector2(
      (((LOGO_I[s.charCodeAt(o)] << 6) | LOGO_I[s.charCodeAt(o + 1)]) / 4095) - 0.5,
      (((LOGO_I[s.charCodeAt(o + 2)] << 6) | LOGO_I[s.charCodeAt(o + 3)]) / 4095) - 0.5);
  }
  return out;
}

// One row per mark. `w`/`h` are the traced bounding box normalised so its longer
// side is 1.0; `s` is one entry per filled shape, [fill, contour, ...holes].
// The holes are real holes. New Breed's source paints its letter counters as
// separate BLACK shapes on top of the white letters — identical on a white page,
// and under additive blending every bowl would have filled in solid and the
// wordmark would have rendered as a row of blobs. Those were re-detected as
// knockouts at trace time by containment and folded in as holes.
const PARTNER_LOGOS = {
  supered: { w: 1.000, h: 1.000, s: [
    [0xe5097f, 'Kq//2L/94T/k6U+w8H9j9p8A+k6p/T5F/x3c/+1z//KX/rIF+3F69nD97+CU6mBZ5DAr3eAO11AAKVAAIDAVF4BID/CWCWD/BaFWAsG5ANIjAAKMAG2zAj4sBS6aCX8CDr9YFM+eG8/UIz/1',
     'QRddQEc/QLceQkcCRHbzdBbyYGJQYTIkY+IGZ2IEanIgwBi8wCjYv2jyvBkQjJkQoD2uoA3Pnt3qnM38mm4BmB34li3i'],
    [0xffffff, 'QRddQEc/QLceQkcCRHbzdBbyYGJQYTIkY+IGZ2IEanIgwBi8wCjYv2jyvBkQjJkQoD2uoA3Pnt3qnM38mm4BmB34li3i'],
  ] },
  newbreed: { w: 1.000, h: 0.132, s: [
    [0xffffff, 'F6bxELb1BvhRBtb3ABbxAAkOBvkKEMeuENkHEQkOF5kO'],
    [0xffffff, 'LEfbIafaIadLLidLLgbxGvbxGskNLjkMLcizIaiuIbgzLEgx'],
    [0xffffff, 'SQe6TEkNUskOTQbyTIbxRhbzQiguPkbxN1b1MWkMODkLO2e9P1kORRkL'],
    [0xffffff, 'Xcb5XekOawkLbmj8cNjgcpivcvhjcbgubwgJclfdc4eUckc4bucEakbxXcbx',
     'ZJfcZJdNZRdLavdTbGdxbLeWbAfFasfY',
     'ZPgsabgva5hFbChqa+iQavinaViyZJiy'],
    [0xffffff, 'gNe3fXezfXb1dqbydskOhakGiUjni1i5jEh5i8gtipgCh4fOjVbyhdb1',
     'fXgSg1gZhOg1hXhjhPiSg9iogjiyfXizfXga'],
    [0xffffff, 'oefbl0fal0dLo8dLo6bxkKbxkHkNo9kMo2izl0iul1gzoegx'],
    [0xffffff, 'uMfbrifaridLuqdLuobxp3bxp0kNurkMukizriiurjgzuMgx'],
    [0xffffff, 'vdb6vgkOyLkNzkjt0IjN0nid04hn09gk0zeD0ddOz5cizScHycb1vdbx',
     'xLizxOdLyZdSy9dwzOewzQgszKhuy2iZyNiw'],
    [0xffffff, '35hB6khC6xhZ60kE7EkO8jkN8yj380hM9DhB/3g8//gs//fW/vfC87e98yet8xcC8abz7Fbz6ycG6te53pfI3kgw'],
  ] },
  impulse: { w: 0.890, h: 1.000, s: [
    [0xffffff, '8eji78pA6YuS3zzJ0O3kv17Mq/9ylu/agE//aa/cVJ92QS7RL43qIRzRFruaEEpJDhjfEFd1FsYkISTuL5PUQULuVLJJacHkf6HBc1AAjoC7qQGqv7Ky0dPI3+T16iZJ7/eP',
     'SPsPUpl4rXl5ttsP',
     'VVj/XwdooRdpqmj3',
     'Ydbqa3VSlEVSngbm'],
    [0xfc8612, 'SPsPUpl4rXl5ttsP'],
    [0xfc8612, 'VVj/XwdooRdpqmj3'],
    [0xfc8612, 'Ydbqa3VSlEVSngbm'],
  ] },
  sixandflow: { w: 1.000, h: 1.000, s: [
    [0x00a1db, 'gA//cz/1Zu/YWt+nTx9kQ+8POO6mLu4vJW2mHN0OFWxtDwvDCbsPBYpTAomSAKjOAAgBAKc0AnZvBXWuCaTzDvQ/FVOUHLL0JUJbLsHROLFaQ7DxTvCcWqBYZrAocwAKf9AAjKAKmOAnpQBXsLCau/DuxqFU0KHK2jJT4tLr6kOK8OQ69jTu+mWp/XZq/0cv//f7/1jI/YmN+ppO9msK8Ru+6sxp420J2t2i0V4sx26jvG8NsT9ipX+mmX/XjS/0',
     'hhOhhbN9hGNZgmM+gEMzbcMxa0M+aTNXZ+N8Z3OfZ3XcZ9YGaOYlatZCbVZQf8ZRgkZFhFYrhbYHhhXj',
     'vNebvGd4uxdUuRc5tvcumMcxladQk/d/k7hjlBiHlVisl2jHmXjTt6jRupi2vIiE',
     'xMuDxFtgwvs8wOsjvrsYjPsWimsNiDr2hrrUhiqrhhePhKdYgUcyP2cwPDdQOod+OkhjO6inPZjDP6jRYTjVZBjkZkkFZ4lDZ4xfaPyWbEy8vzzAwoykxHxy'],
  ] },
  kuno: { w: 0.868, h: 1.000, s: [
    [0x6842d3, 'XC/zEd/zEO/kEOiCWziCXCiS'],
    [0x6842d3, 'XCcZEicZEOcOEOAPEdAAW9AA'],
    [0x6842d3, 'uvcZcPcZcdakdEXydxVhe1S4g3PIjrLUnBH9qbFZulDGylBm2vAp7dAQ7uAd7uSf5bSw3JTW1aUIzbVbyBWswiYivYan'],
    [0x6842d3, 'cCiAuHiAuZiNu+khv7msxQoqy6qY01rx29s05Ptd7nts7xuB7q//4W/01h/Yyw+twD9xtd8mq+7Noo5lmF3cjx1CiAyzgNwAe5ted0q1c/oGcalT'],
  ] },
  saltedstone: { w: 1.000, h: 0.289, s: [
    [0xe8eef5, '/Rgh98fH8yed7meU7Seg7Ee77Df597iH+7jd/Ika+/lX+ml998mQ8/mS8KmE7flk7Ak46fjZ5+gi54fU6AeX5ud25Tdn4mds4VeN4Tfb4xjR4mkN4Kkx3mk/2wk+2Ekt1akL1Pkz0hkp0Ni3yfhXyXimx8jVxEjsv3jlu1i+uIh2tugVtLc/szb+r5bBqoaoqJa8p9b4qogbrrgssfhOtIiGtfjNsxjDsciSr8hwrZhgqzherdlaqSlNpOfAohd4nXc2nXdsnJeYkrhNkZiPlAj7ldkVmCkfmnkVm5j8m9iEoQiWoUjroHknnYlZmMlkk6lPj/kejPi1jOhZjpgqlveUmEdrmIdElgaXlEZpkdZQj3ZOjXZjjKaPjLbNkybBk9btkHbujVcAh+bph4aMiEZIijYdjVYJkxYQl6Y7mpaBnQb/pCdvo0cTo1bFpGaSppZ1qmZtrqZ6smadtfbXt5a7ulasviavwVbBxDbrxmcvyYgq0EiBzBbn0Hbx1Zig10jg2fj/3Mj73kjU3liP3Kff3IeR3adP4Dcs4pcn5Wcv59dJ6bds7DdX7xdT8ude9od1+5ew//gD',
     'w+fAwYciv9b8vbbru1btuccJuWc/uhebu8grvzgPwlgNwogrvtg7vShgveiLwIisw2iqxPiFxQg/',
     '7Shj7zkC8alF9ElW9plM97kr9+j89tjR9Fii7PhK'],
    [0xe8eef5, 'jEfWigftiBewhBeXgfemgOfQgRgdhrpPgio8f+lefKlreMlldblPc1kocLjFbXe7akd4ZHcyYMceXgcnXKdGXGeDZkf/agg7bFiHbFjUapkKZxkhYckYXijyXDjGWriFV+eJVpdHU8cIT6bhTGbqSqcfStddTWhSUehnVRiLV0i9WOkGVhj+VHjHUlinTjiXULmSTAmERWcKQxbHQQazPxayPNbNPGcRQklmPZlWNwbjNQadMaaCL7aDLoaQLabLMZhoLdhbLJgqKohKJ8hWJHhLIZguHnfhG4dGGLcHFcbeFKdDCxfyCggVCdg7Cvh+DGinDji/EJjHEti7E9ihE9guGPg9GRi3GAjiFekAEpkNDkkGCljpB7i8BVhnBNgiBnfaEBcjELb2D/ahDSYeCwX+CLX1BtX6BYYQBPZ0C1ZoDAaVCKaWBZaoAFaWAAYNAPXhAoXEBTWyCQWwDFW9DzXZEpYkFTaoG3cIGraVG4ZJHiYeIvYVJ3YuKvZsLEZVLoZHM8ZPNoZuOPaoO2Z/P6Z2RDaQRzbLSNazSyanUVayVSbUWLcRWdb4W+blXsbfYibnaCcYbidycGc9dHcpehc8fdd4gZddhedgiaeCjJfS',
     'dgdndCdtcseMcugAdfjrd7kZekktfKknfckOfciTevevePd7',
     'KZcnJ3aRJeZpI+ZVIQZXH5Z0HzaqH9b/IqfTJFgCJlgWKTgTKrftKseo',
     'XVfxX3iRYdjTZHjjZsjZZ9i3aAiJZvheZHgvXRfW'],
  ] },
  mediajunction: { w: 1.000, h: 0.998, s: [
    [0xc191f8, 'H7gANBnQGfqQAAfrHEVuNBYw'],
    [0xc191f8, '35gAy6Ys47Vn//f/49qYy8nT'],
    [0xc191f8, 'f6IAYqNGVqGkgPAFqMHJnKNG'],
    [0xc191f8, 'f63/nKy5qM42gP/6Vq5bYqy5'],
    [0x0093bd, 'kqbQxVC69AOk'],
    [0x0093bd, 'bKkvOf9FC0xa'],
    [0x0093bd, 'VZP8bIbOC3OiOhC4'],
    [0x0093bd, 'kqkv9AxbxV9F'],
  ] },
  huble: { w: 1.000, h: 0.285, s: [
    [0xff4d56, 'KsiyJ/jXI+j5G+kREukACxjGCxpCAApBAAXACuW/CyeODDfkDogiEUhIFXhjGghpHahiIPhLI4giJPftJZekJZXDMEW/MLXHMIfjLrhT'],
    [0xff4d56, 'YodSYhcKYPbSXvaiXCZ9WMZnVEZgT8ZqTIaFSca+SJcESGkDSAkLPVkIPbbPQGZURTX9S7XJVMW4W+XMYsYGYuW/bZXDbZkDbTkLYokI'],
    [0xff4d56, 'o4jcm9kJk7kQjKj1hmi6hko+hfpIeypGe4W/hYW/hfYQivXfkCXClYW3mvW9o4Xup0YYqmZMrVaVr4b1sFdar/exrkgTq8hhqEijo+jY',
     'jghPlBhrmmhhn/gxo0fspReLpJcXoea7nRZ6l+ZhkYZnjJaKiFbVhlc2hpepiQgHjahM',
     'lafdmIfTmve5nKeSnTdjnKc1mvcOmIbzlabqksbzkEcOjqc1jhdjjqeSkEe5ksfT'],
    [0xff4d56, 'xBpIuSpIuPo9uPW/w9W/xBXK'],
    [0xff4d56, '//dl/6eu/mgD/BhS+WiN9VjH8Wjs7RkE57kR4ykO3dj72NjX1Tis0hh2z0gszbfnzLeRzLc6zbbkz8aT0tZL1sYP23Xi4JXF5gW47UW99EXf+aYV/WZg9tbV8xaW7kZt6OZe4pZq30aB27av2Sbr2Ecf/3cf',
     '8/e42Ke42De+2Yf13Og44Nhd5jht64hf74g98qgI9Le4'],
    [0xff4d56, 'lafdmIfTmve5nKeSnTdjnKc1mvcOmIbzlabqksbzkEcOjqc1jhdjjqeSkEe5ksfT'],
  ] },
};

// A traced mark as one flat mesh on the ground plane, up-screen of the rim.
//
// three's ShapeGeometry would almost do this, but it routes the points through
// CurvePath.getPoints(), which silently drops consecutive duplicates — and the
// per-shape colour ranges below are counted off the point list, so one dropped
// vertex would shift every colour after it and there would be nothing to see
// except a logo in the wrong colours. ShapeUtils.triangulateShape is the same
// earcut underneath with none of the curve machinery in between.
// Fitted into 2.0 rim-radii wide by 1.05 tall. A wordmark takes the width and a
// square mark takes the height, so New Breed's 7.7:1 lockup and Six & Flow's
// disc end up the same visual weight. 2.0 is not arbitrary: at 2.9 the traced
// "NEW BREED +" measured 390 px on a 390 px viewport and ran off both edges.
function logoPart(rec, opts = {}) {
  const k = Math.min((opts.maxW ?? 2.0) / rec.w, (opts.maxH ?? 1.05) / rec.h);
  const pos = [], idx = [], colors = [], ranges = [];
  let base = 0;
  for (const shape of rec.s) {
    const contour = logoPoly(shape[1]);
    const holes = [];
    for (let h = 2; h < shape.length; h++) holes.push(logoPoly(shape[h]));
    // Triangulate FIRST. It may pop a duplicate end point, and the vertex list
    // has to be built from what it left behind, not from what went in.
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    // Shape XY -> world XZ, with the mark's +y up-screen, which is -z. The chase
    // camera parks at hole + dist * (sin heading, cos heading) (camera.js), so a
    // group at rotation.y = +heading holds the camera at local +z. MEASURED in
    // game across eight headings rather than derived: azimuth minus heading held
    // constant to 0.01 rad while azimuth plus heading swung through 2.3. The
    // thumbnail bake poses at heading 0 with its camera at +z, so the shop plate
    // is the same frame and the mark cannot read one way there and mirrored here.
    for (const p of all) pos.push(p.x * k, 0, -p.y * k);
    for (const f of tris) idx.push(base + f[0], base + f[1], base + f[2]);
    ranges.push(base, base + all.length);
    colors.push(rgb(shape[0]));
    base += all.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const col = new Float32Array(pos.length);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, partMaterial(0xffffff, opts.opacity ?? 1, true));
  m.position.y = opts.y ?? 0.021;
  // Clear of the rim by a fixed margin, measured from the mark's own half-height,
  // so a 7.7:1 wordmark tucks in close and only a square mark is pushed out.
  const half = rec.h * k / 2;
  m.position.z = -(1.01 + 0.16 + half);
  m.renderOrder = opts.order ?? 1003;
  m.userData.count = colors.length;
  m.userData.colors = colors;
  m.userData.outer = 1.01 + 0.16 + half * 2;
  m.userData.set = (i, r, gr, b) => {
    for (let v = ranges[i * 2], e = ranges[i * 2 + 1]; v < e; v++) {
      const q = v * 3; col[q] = r; col[q + 1] = gr; col[q + 2] = b;
    }
  };
  // Unlike the other primitives the flush is separate, because every shape of a
  // mark is written in one pass and one upload is enough for all of them.
  m.userData.flush = () => { g.attributes.color.needsUpdate = true; };
  return m;
}

// ONE builder for the whole shelf. The mark is the identity now, so what varies
// between these eight rows is data — `logo`, `color`, `accent` — and a ninth
// partner is a registry row plus a traced entry, with no code at all. Same
// DECOR_LAYERS bargain the rest of this file is built on.
function buildPartner(row) {
  const N = 16;
  const c = rgb(row.color), acc = rgb(row.accent ?? row.color);
  // Several of these palettes' second colour is a near-black navy. Pulling it
  // most of the way to the primary keeps the alternating rim reading as two
  // tones of one brand rather than as a ring with holes punched out of it.
  const alt = mixc(acc, c, 0.45);
  const rim = ringPart(N, [0.86, 1.01], [1, 1], { y: 0.02, order: 1000 });
  const face = new THREE.Group();
  const badge = logoPart(PARTNER_LOGOS[row.logo], row.logoFit);
  face.add(badge);
  const shrink = 1 / badge.userData.outer;
  let lift = 0, lastB = -1, lastM = -1;
  return {
    parts: [rim, face],
    onEat(st, e) { lift = Math.min(1.3, lift + 0.32 + e.size * 0.45); },
    update(st) {
      lift *= Math.max(0, 1 - st.dt * 2.1);
      // Welded to the heading. That is not autonomous motion, it is the player's
      // own steering made visible, so it survives reduced motion untouched —
      // same reasoning the A/B Split axis is held on.
      face.rotation.y = st.heading;
      // Angular constancy: uncompensated, a badge 2.6 rim-radii across would be
      // 30 m of logo painted down the street at SIZE 12 while the camera only
      // pulled back by 2x. reach() draws the whole group in, offset and mark
      // together, because both of them live inside it.
      face.scale.setScalar(reach(badge.userData.outer, st.radius) * shrink);
      // A LOGO IS NOT A GLOW. These four constants were set off measured pixels,
      // not by eye: at (0.60 + lift * 0.55) * (1 + glow * 0.28) the peak was
      // 1.68x with a 34% push to white, and since the player is eating almost
      // continuously that peak was the RESTING state -- all eight marks
      // screenshotted as white silhouettes with the brand colour gone. Salted
      // Stone is meant to be white; Six & Flow's disc is meant to be #00a1db and
      // was rendering rgb(230,244,250). The ceiling here is 0.87, which lands
      // that disc near its own hex over the 0x232838 ground.
      const b = (0.36 + lift * 0.30) * (1 + st.glow * 0.16);
      const mix = lift * 0.12;
      // Every shape of a mark shares b and mix, so when neither has moved the
      // colour buffer is already correct. Salted Stone is 367 vertices — 4.4 KB
      // of upload a frame to say nothing, and at rest that is every frame.
      if (Math.abs(b - lastB) > 1e-4 || Math.abs(mix - lastM) > 1e-4) {
        for (let i = 0; i < badge.userData.count; i++) {
          const k = mixc(badge.userData.colors[i], WHITE, mix);
          badge.userData.set(i, k[0] * b, k[1] * b, k[2] * b);
        }
        badge.userData.flush();
        lastB = b; lastM = mix;
      }
      for (let i = 0; i < N; i++)
        setRim(rim, i, mixc(i % 2 === 0 ? c : alt, WHITE, st.glow * 0.45 + lift * 0.2), i % 2 === 0 ? 1 : 0.6);
    },
  };
}

// ------------------------------------------------------------------- runtime
//
// One instance per live hole. `local` is parented to the hole group and scaled
// by hole radius every frame exactly as the flat ring already is; `world` is
// added to the scene and never moves with the hole, which is what lets a trail
// stay where it was laid.

export function makeSkin(id) {
  const row = SKIN_BY_ID.get(id) || SKIN_BY_ID.get('classic');
  const impl = row.build(row);
  const local = new THREE.Group();
  for (const p of impl.parts) local.add(p);
  const world = new THREE.Group();
  for (const p of (impl.world || [])) world.add(p);
  const mats = [];
  // additive parts only: boosting the normal-blended rim just clips it to white
  local.traverse((o) => { if (o.isMesh && o.material.blending === THREE.AdditiveBlending) mats.push(o.material); });
  return {
    row, local, world,
    update(st) {
      impl.update(st);
      // the local group carries the rim, so it scales with the hole exactly as
      // the flat ring already does; the caller does not have to know that.
      local.scale.setScalar(st.radius);
      const b = farBoost(st.camDist);
      for (const m of mats) m.color.setScalar(b);
    },
    // The renderer forwards the sim's event stream verbatim; normalising it is
    // this module's job, not the caller's.
    onEat(st, ev) { if (impl.onEat) impl.onEat(st, biteFromEvent(ev)); },
    onGrowth(st, size) { if (impl.onGrowth) impl.onGrowth(st, size); },
    onMilestone(st, frac) { if (impl.onMilestone) impl.onMilestone(st, frac); },
    dispose() {
      local.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      world.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    },
  };
}

// ----------------------------------------------------------- shop thumbnails
//
// A flat CSS swatch could describe a skin back when a skin WAS a colour. It
// cannot show teeth, a radar sweep or an eyelid, so the shop renders each row's
// real geometry instead.
//
// One offscreen 192x192 context bakes every row to a data URL and is then
// destroyed, so the shop screen holds NO live GL context — it is showing
// images. Measured: 17 rows in 144-205 ms for ~214 KB, once per session.
// Cached, so reopening the shop is free.
//
// Returns null rather than throwing if WebGL is unavailable; the caller falls
// back to the `css` swatch, which is exactly what the shop renders today.

const THUMBS = new Map();
let thumbsFailed = false;

export function bakeSkinThumbnails(size = 192) {
  if (THUMBS.size) return THUMBS;
  if (thumbsFailed || typeof document === 'undefined') return null;
  let renderer = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    // preserveDrawingBuffer because toDataURL runs after render returns.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x141926, 1);
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    const scene = new THREE.Scene();
    // A stub of ground, so the void reads as a HOLE and not a black sticker.
    const plateGeo = new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    const plateMat = new THREE.MeshBasicMaterial({ color: 0x232838 });
    const discMat = new THREE.MeshBasicMaterial({ color: 0x06060c });
    scene.add(new THREE.Mesh(plateGeo, plateMat));
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.01;
    scene.add(disc);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    cam.position.set(0, 5.6, 3.4);
    cam.lookAt(0, 0, 0);

    // The hero pose: mid-combo, mid-run, one bite every 8 frames. Wound forward
    // in fixed steps so it is deterministic AND so the trail skins accumulate
    // the history that is their whole identity — a still of Compounding at t=0
    // is an empty ring.
    const st = {
      t: 0, dt: 1 / 30, radius: 1, glow: 0.25, chain: 5, chainTimer: 0,
      size: 6, sizeFrac: 0.62, progress: 0.55, speed: 9, heading: 0,
      x: 0, z: 0, camDist: 9, reduced: false,
      sectorMass: new Float32Array(16).fill(0.7),
    };
    const ev = { type: 'eat', chain: 5, gained: 46, hole: st, obj: { tier: 4 } };
    for (const row of SKINS) {
      const skin = makeSkin(row.id);
      scene.add(skin.local, skin.world);
      st.t = 0; st.x = 0; st.z = 0;
      for (let f = 0; f < 54; f++) {
        st.t += st.dt;
        st.x = Math.sin(st.t * 0.9) * 1.6;
        st.z = -st.t * 1.2;
        ev.obj.x = st.x + 1.2; ev.obj.z = st.z + 0.6;
        if (f % 8 === 0) skin.onEat(st, ev);
        skin.update(st);
      }
      // Ground marks were laid along the fake run; slide them back under the
      // camera so the trail is visible in a square 192 px frame.
      skin.world.position.set(-st.x, 0, -st.z);
      renderer.render(scene, cam);
      THUMBS.set(row.id, canvas.toDataURL('image/png'));
      scene.remove(skin.local, skin.world);
      skin.dispose();
    }
    plateGeo.dispose(); discGeo.dispose(); plateMat.dispose(); discMat.dispose();
    return THUMBS;
  } catch (e) {
    // No GL, a lost context, a blocked toDataURL — none of it is worth an
    // exception on the shop screen. Fall back to the flat swatch, once.
    thumbsFailed = true;
    THUMBS.clear();
    return null;
  } finally {
    if (renderer) {
      renderer.dispose();
      // dispose() alone leaves the context alive; the shop must not hold one.
      if (renderer.forceContextLoss) renderer.forceContextLoss();
    }
  }
}
