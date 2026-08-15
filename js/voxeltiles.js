// Procedural surface tiles for the voxel renderer. PURE JS — no three.js import,
// no DOM, no network. That is deliberate and load-bearing: `tools/shimmer.mjs`
// imports this file directly under Node, and the repo has no package.json and no
// node_modules, so a bare `three` specifier here would make the registry
// ungateable. Everything that needs three lives in js/voxelsurfaces.js.
//
// Every tile is generated in JS: no licence, no build step, no asset download,
// and it matches the engine's existing idiom (voxelworld.js mortarTexture()).
//
// AUTHORING RULES, derived from the aliasing lesson already recorded at
// voxelworld.js:319 — a hard 1-texel line crawls once the SIZE ramp pulls the
// camera 80 m out:
//   1. No step edges. Every feature boundary is a ramp at least 3 texels wide.
//   2. Highest-frequency feature >= 3 texels. Nothing finer survives mip 3.
//   3. The albedo tile is a MULTIPLIER in NoColorSpace, never a colour. It
//      composes with the per-instance paint the scenes already rely on.
//   4. Value range clamped to [0.30, 1.0]. An 8-bit unorm multiplier cannot
//      exceed 1.0, so a surface can only ever darken the authored tint. Stated,
//      not hidden — and mean-normalised below so the darkening is uniform.
//   5. Deterministic. Seeded from the surface id, so the same city always
//      renders identically and a framebuffer diff means something.
// Rules 1, 2 and 5 are enforced mechanically by `node tools/shimmer.mjs`.

// ---------------------------------------------------------------- noise
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const smooth = (v) => { const d = Math.max(0, Math.min(1, v)); return d * d * (3 - 2 * d); };
const lerp = (a, b, t) => a + (b - a) * t;

// Periodic value noise on a gx x gz lattice, sampled at n x n. Periodic so the
// tile wraps: a surface with uv repeat > 1 must not show a seam.
function valueNoise(n, gx, gz, rnd) {
  const lat = new Float32Array(gx * gz);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * gz, iy = Math.floor(fy), ty = smooth(fy - iy);
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * gx, ix = Math.floor(fx), tx = smooth(fx - ix);
      const x0 = ix % gx, x1 = (ix + 1) % gx, y0 = iy % gz, y1 = (iy + 1) % gz;
      const a = lerp(lat[y0 * gx + x0], lat[y0 * gx + x1], tx);
      const b = lerp(lat[y1 * gx + x0], lat[y1 * gx + x1], tx);
      out[y * n + x] = lerp(a, b, ty);
    }
  }
  return out;
}
// Octave sum. The loop breaks once the finest lattice would put a cell under
// four texels — rule 2. Detail below that floor does not survive mip 3; it just
// becomes temporal noise at range.
function fbm(n, gx, gz, oct, rnd) {
  const out = new Float32Array(n * n);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const cx = gx << o, cz = gz << o;
    if (n / Math.max(cx, cz) < 4) break;
    const lay = valueNoise(n, cx, cz, rnd);
    for (let i = 0; i < out.length; i++) out[i] += lay[i] * amp;
    norm += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= (norm || 1);
  return out;
}

// Distance-to-nearest-edge ramp inside a cell, in texels, ramped over `w`.
// 0 at the joint centre, 1 at `w` texels in. This is the mortarTexture ramp
// generalised, and it is the one shape in this file that is load-bearing for
// aliasing: every joint in every tile goes through it.
const jointRamp = (d, w) => (d >= w ? 1 : Math.max(0, d) / w);

// ---------------------------------------------------------------- registry
// A surface is a ROW here. Adding red brick to the engine is this row plus a
// scene declaring it — never a code change, exactly like DECOR_LAYERS in
// voxelworld.js:87.
//
//   id        contract naming: mat_<surface>_<variant>. Scenes address this
//             string, so it is the stable API and renaming one is a breaking
//             change to every scene that names it.
//   tile      procedural albedo-multiplier generator
//   rough     base roughness
//   roughVar  half-range of the roughness map around `rough`.
//             0 -> no ORM map is built and the scalars are used raw
//   metal     0.0 or 1.0. NEVER between. 0.5 is a bug, not a look.
//   uv        'brick' = one tile per face at every brick size (default)
//             'metre' = one tile per metre, so a 2 m block shows 2x2
//   edge      strength of the block-boundary darkening (the mortar course)
//   grime     downward-biased soiling, 0..1
//   res       authored AT ship resolution. No 4K maps in 1K slots.
//   envInt    reflection probe strength; metals only, ignored on dielectrics
//
// A row may also carry parameters its own tile function reads — `spec` is passed
// to `spec.tile(n, spec)`. Only 'metre' surfaces need this so far, and only
// because they are the two rows whose depicted feature has a real-world size (see
// WORLD SCALE below).
//
// WORLD SCALE, and why it touches exactly two rows.
// A 'metre' tile repeats once per MAP unit: voxelsurfaces.js sets
// `repeat.set(size, size)` from b.s, and voxelworld.js:1986 scales a UNIT cube by
// b.s. Texel density is therefore `res` texels per map unit, fixed here and
// independent of the scene's authoring scale — and a building's size in map units
// scales with the map unit too, so tiles-per-pixel on screen is invariant as well.
// Changing a scene from 1:6 to 1:2 CANNOT alter aliasing. Measured, not assumed.
//
// What it does change is what one map unit MEANS in real metres, so a tile whose
// feature is a real object — a plank — depicts a different-sized object at each
// scale. That is what `boards` below exists to express.
export const SURFACES = [
  // The identity row. Reproduces voxelworld.js mortarTexture() exactly, so a
  // surface-aware bucket that resolves to this is indistinguishable from an
  // unsurfaced one. metal 0.1 here is NOT a physical claim — it is the value the
  // shipped block material carries, kept so this row's job (be today's look) is
  // not quietly confused with the correct look. Every other row is 0.0 or 1.0.
  // edge 0.00, not 1.00: tMortar already DRAWS the mortar course, and the `edge`
  // pass in assembleField draws it a second time. Compounding them gave a range
  // of 0.700 against the shipped texture's 0.540 and collapsed the narrowest
  // ramp from 3.00 texels to 2.14 — under the 3-texel floor, in the one row
  // whose entire job is to be byte-identical to what ships. Caught by
  // `node tools/shimmer.mjs`, which is exactly the class of error it exists for.
  { id: 'mat_default', tile: tMortar, rough: 0.80, roughVar: 0.00, metal: 0.1, uv: 'brick', edge: 0.00, grime: 0.00, res: 128 },

  { id: 'mat_brick_red', tile: tBrick, rough: 0.86, roughVar: 0.10, metal: 0.0, uv: 'brick', edge: 0.35, grime: 0.30, res: 256 },
  { id: 'mat_glass_curtain', tile: tCurtain, rough: 0.10, roughVar: 0.07, metal: 0.0, uv: 'brick', edge: 0.20, grime: 0.10, res: 256 },
  { id: 'mat_concrete_precast', tile: tPrecast, rough: 0.78, roughVar: 0.09, metal: 0.0, uv: 'brick', edge: 0.85, grime: 0.35, res: 256 },

  // rough 0.55, not the 0.34 this started at. At 0.34 the shimmer probe scored
  // this surface 3.05 — WORSE than the deliberately-broken control at 2.18 —
  // because a near-polished metal reflects the environment, and lateral camera
  // motion then swings the whole reflection. That is not texture aliasing, but
  // on a roof it reads exactly like it. Architectural standing seam is 0.45-0.55
  // anyway; 0.34 was a showroom finish on a warehouse. envInt trims the probe's
  // contribution to match the stylised, analytic lighting the scenes use.
  { id: 'mat_metal_seam', tile: tSeam, rough: 0.55, roughVar: 0.10, metal: 1.0, uv: 'brick', edge: 0.45, grime: 0.15, res: 256, envInt: 0.35 },

  // boards 8, not the 4 this shipped with. One tile is one map unit, so the board
  // count IS the plank width: 4 boards read as 0.50 m planks at 1:2 and 1.50 m at
  // 1:6, against real dock decking of 0.15-0.30 m. At 8 the planks are 0.25 m at
  // 1:2 — the scale Nico specified — and the ramp measures 4.29 texels, clear of
  // the 3.00 floor at the shipped res 256.
  //
  // If the scene stays at 1:6 this becomes 0.75 m, still the best available:
  // 24 boards would be needed for 0.25 m there and that measures 2.34 texels at
  // res 256 AND 2.84 at res 512, so it fails the floor at any resolution worth
  // shipping. 1:6 simply cannot show real decking; 1:2 can. Ceiling at res 256 is
  // 10 boards (3.63); above 12 needs res 512.
  { id: 'mat_timber_dock', tile: tTimber, boards: 8, rough: 0.88, roughVar: 0.08, metal: 0.0, uv: 'metre', edge: 0.30, grime: 0.55, res: 256 },

  // Deliberately NOT scale-parameterised. Real asphalt aggregate is 5-20 mm, and
  // 20 mm needs 100 cells per map unit at 1:2 (2.56 texels per stone) or 300 at
  // 1:6 (0.85) — both under the 3.00 floor. Aggregate is unreachable at every
  // scale we ship, so this field is a stylised tone break rather than a depiction
  // of stones, and there is no scale at which a different lattice would make it
  // more truthful. Left alone.
  { id: 'mat_asphalt', tile: tAsphalt, rough: 0.95, roughVar: 0.04, metal: 0.0, uv: 'metre', edge: 0.25, grime: 0.20, res: 256 },
  { id: 'mat_stone_ashlar', tile: tAshlar, rough: 0.82, roughVar: 0.11, metal: 0.0, uv: 'brick', edge: 0.55, grime: 0.40, res: 256 },
  { id: 'mat_corrugated_rust', tile: tCorrugated, rough: 0.62, roughVar: 0.18, metal: 1.0, uv: 'brick', edge: 0.30, grime: 0.65, res: 256, envInt: 0.50 },

  // --- Cute Kenney-inspired surfaces ---
  { id: 'mat_awning_stripe', tile: tAwning, rough: 0.85, roughVar: 0.05, metal: 0.0, uv: 'brick', edge: 0.20, grime: 0.08, res: 256 },
  { id: 'mat_shop_window', tile: tShopWindow, rough: 0.20, roughVar: 0.15, metal: 0.0, uv: 'brick', edge: 0.30, grime: 0.08, res: 256 },
  { id: 'mat_suburban_siding', tile: tSuburbanSiding, rough: 0.82, roughVar: 0.08, metal: 0.0, uv: 'brick', edge: 0.35, grime: 0.10, res: 256 },
  { id: 'mat_clay_shingles', tile: tClayShingles, rough: 0.86, roughVar: 0.08, metal: 0.0, uv: 'brick', edge: 0.40, grime: 0.15, res: 256 },
  { id: 'mat_warehouse_roll', tile: tRollDoor, rough: 0.50, roughVar: 0.12, metal: 1.0, uv: 'brick', edge: 0.30, grime: 0.15, res: 256, envInt: 0.40 },
];

export const SURFACE_BY_ID = new Map(SURFACES.map((s) => [s.id, s]));

// ---------------------------------------------------------------- tiles
// Each returns Float32Array(n*n) of albedo multipliers, before edge and grime.

// The shipped mortar course, restated here so the identity row is generated by
// the same pipeline as everything else rather than being a special case in the
// consumer. MORTAR_BORDER 3 at n=128, MORTAR_DARK 0.46 — voxelworld.js:308.
function tMortar(n) {
  const out = new Float32Array(n * n);
  const border = Math.round(n * 3 / 128);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    out[y * n + x] = 0.46 + 0.54 * jointRamp(d, border);
  }
  return out;
}

// Running bond. 5 courses and 2 stretchers per face; joint is 4 texels at 256
// (~16 mm on a 1 m face — a shade fat, which is what keeps it alive at mip 3
// instead of dissolving into flat grey).
function tBrick(n) {
  const rnd = mulberry32(hash32('brick_red'));
  const rows = 5, cols = 2, J = Math.max(3, Math.round(n / 64));
  const rh = n / rows, cw = n / cols;
  const jitter = new Float32Array(rows * (cols + 1));
  for (let i = 0; i < jitter.length; i++) jitter[i] = 0.88 + rnd() * 0.24;
  const grit = fbm(n, 8, 8, 3, mulberry32(hash32('brick_grit')));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const r = Math.floor(y / rh);
    const dy = Math.min(y - r * rh, (r + 1) * rh - 1 - y);
    const off = (r % 2) * cw * 0.5;             // half-stretcher offset per course
    for (let x = 0; x < n; x++) {
      const xs = (x + off) % n;
      const c = Math.floor(xs / cw);
      const dx = Math.min(xs - c * cw, (c + 1) * cw - 1 - xs);
      const joint = Math.min(jointRamp(dy, J), jointRamp(dx, J));
      const face = jitter[(r * (cols + 1) + c) % jitter.length] * (0.94 + grit[y * n + x] * 0.12);
      out[y * n + x] = lerp(0.52, Math.min(1, face), joint);
    }
  }
  return out;
}

// 2x2 panes with a 5-texel mullion and a shallow gradient inside each pane — a
// flat pane reads as a hole, a graded one reads as sky in glass.
function tCurtain(n) {
  const M = Math.max(5, Math.round(n / 40));
  const half = n / 2;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const ry = y % half, dy = Math.min(ry, half - 1 - ry);
    for (let x = 0; x < n; x++) {
      const rx = x % half, dx = Math.min(rx, half - 1 - rx);
      const mull = Math.min(jointRamp(dy, M), jointRamp(dx, M));
      // Shallow, not full-range. The first pass ran a sky-to-ground gradient
      // inside each pane and the result read as a stack of louvres, because on a
      // 4-brick wall that gradient repeats eight times and the eye groups the
      // repeats rather than the panes.
      const g = 1 - (ry / half);
      const pane = 0.88 + 0.12 * smooth(g);
      // Mullion DARK against the pane. A curtain wall's frame is anodised metal
      // read against a lit sky reflection, so it is the shadow line, not the
      // highlight. Getting this backwards is what made the panes disappear.
      out[y * n + x] = lerp(0.52, pane, mull);
    }
  }
  return out;
}

// Precast panel: soft chamfer at the panel edge, low-contrast cement mottle, and
// four form-tie dimples. The mottle is deliberately +/-6% — concrete that
// mottles harder than that reads as camouflage at 40 m.
function tPrecast(n) {
  const mott = fbm(n, 3, 3, 3, mulberry32(hash32('precast')));
  const out = new Float32Array(n * n);
  const ties = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const tr = n * 0.035;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0.94 + (mott[y * n + x] - 0.5) * 0.12;
    for (const [tx, ty] of ties) {
      const d = Math.hypot(x - tx * n, y - ty * n);
      if (d < tr * 2) v *= lerp(0.80, 1, smooth((d - tr) / tr));
    }
    out[y * n + x] = v;
  }
  return out;
}

// Standing-seam roof: 3 ribs per face, ~330 mm pans, the real pitch. A seam is a
// shadow line and a highlight side by side; one without the other reads as
// corduroy, which is exactly what the 4-rib first pass did.
function tSeam(n) {
  const ribs = 3;
  const streak = fbm(n, 2, 12, 2, mulberry32(hash32('seam')));
  const out = new Float32Array(n * n);
  for (let x = 0; x < n; x++) {
    const p = (x / n) * ribs;
    const f = p - Math.floor(p);
    const shade = smooth((f - 0.60) / 0.10) * (1 - smooth((f - 0.74) / 0.06));
    const lift = smooth((f - 0.74) / 0.05) * (1 - smooth((f - 0.86) / 0.10));
    const v = 0.86 - 0.22 * shade + 0.14 * lift + 0.03 * Math.cos(f * Math.PI * 2);
    for (let y = 0; y < n; y++) out[y * n + x] = v * (0.97 + streak[y * n + x] * 0.06);
  }
  return out;
}

// Dock timber: `boards` planks per map unit, per-board value jitter, grain
// stretched 8:1 along the board. Grain is the one place a stretched lattice is
// right — wood really is anisotropic.
//
// The gap is a fraction of BOARD HEIGHT, not of n. The original
// `max(4, round(n / 42))` was blind to the board count, which is fine at 4 boards
// and silently collapses above 8: at 24 boards it puts 12 texels of ramp inside a
// 10.7-texel board, so the plateau never forms and the gap stops reading as a
// gap. Anyone raising `boards` would have hit that with no signal other than the
// ramp score sagging. 0.15 rather than 0.10 because 8 boards at 0.10 measured
// 3.04 texels — passing, but with no margin left for the edge and grime passes.
function tTimber(n, spec) {
  const rnd = mulberry32(hash32('timber'));
  const boards = spec?.boards ?? 4;
  const bh = n / boards;
  const G = Math.max(3, Math.round(bh * 0.15));
  const tint = new Float32Array(boards);
  for (let i = 0; i < boards; i++) tint[i] = 0.80 + rnd() * 0.26;
  const grain = fbm(n, 24, 3, 3, mulberry32(hash32('grain')));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const b = Math.floor(y / bh);
    const dy = Math.min(y - b * bh, (b + 1) * bh - 1 - y);
    const gap = jointRamp(dy, G);
    for (let x = 0; x < n; x++) {
      const v = tint[b] * (0.88 + grain[y * n + x] * 0.24);
      out[y * n + x] = lerp(0.40, Math.min(1, v), gap);
    }
  }
  return out;
}

// Asphalt: aggregate speckle only. Contrast held to 12% on purpose — a
// high-contrast noise field is the single worst thing to put on a surface the
// camera pulls 80 m away from, because every texel becomes a temporal coin-flip
// once it lands under a pixel.
function tAsphalt(n) {
  const a = fbm(n, 16, 16, 2, mulberry32(hash32('asphalt')));
  const b = fbm(n, 4, 4, 2, mulberry32(hash32('asphalt2')));
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = 0.90 + (a[i] - 0.5) * 0.12 + (b[i] - 0.5) * 0.06;
  return out;
}

// Ashlar: 2 courses of 1.5 stones, deep chamfered joint, coarse face texture.
// The bridge-tower and civic-plinth surface.
function tAshlar(n) {
  const rnd = mulberry32(hash32('ashlar'));
  // cols must be an EVEN divisor of n, and 1.5 was neither. A running bond
  // offsets alternate courses by half a stone, so with a non-integer column
  // count the `(x + off) % n` wrap lands in the MIDDLE of a stone and leaves a
  // hard edge inside the tile — measured as a 0.38 step where nothing wider than
  // 0.14 belongs, i.e. a 1.63-texel ramp against the 3-texel floor. At cols = 2
  // the wrap lands exactly on a joint and the ramp is symmetric across it.
  const rows = 2, cols = 2, J = Math.max(5, Math.round(n / 38));
  const rh = n / rows, cw = n / cols;
  const face = fbm(n, 6, 6, 3, mulberry32(hash32('ashlar_face')));
  // Per-stone jitter held to +/-8%, not the +/-13% this started at. At 80 m a
  // stone is about four pixels wide, so stone-to-stone contrast becomes
  // pixel-to-pixel contrast: the shimmer probe scored 1.14 against the shipped
  // mortar's 0.45. Variation you cannot resolve is not variation, it is noise.
  const jit = new Float32Array(8);
  for (let i = 0; i < jit.length; i++) jit[i] = 0.92 + rnd() * 0.16;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const r = Math.floor(y / rh);
    const dy = Math.min(y - r * rh, (r + 1) * rh - 1 - y);
    const off = (r % 2) * cw * 0.5;
    for (let x = 0; x < n; x++) {
      const xs = (x + off) % n;
      const c = Math.floor(xs / cw);
      const dx = Math.min(xs - c * cw, (c + 1) * cw - 1 - xs);
      const joint = Math.min(jointRamp(dy, J), jointRamp(dx, J));
      const v = jit[(r * 3 + c) % jit.length] * (0.95 + face[y * n + x] * 0.10);
      out[y * n + x] = lerp(0.60, Math.min(1, v), joint);
    }
  }
  return out;
}

// Corrugated sheet with a rust hem. Pure cosine ribs, perfectly band-limited by
// construction, plus soiling up the bottom fifth — the story is "nobody has
// replaced this shed". It is a mask, not paint, so it stays tunable.
function tCorrugated(n) {
  const ribs = 8;
  const rust = fbm(n, 5, 5, 3, mulberry32(hash32('rust')));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const up = 1 - y / n;                       // v=0 is the bottom of the face
    const hem = smooth((0.22 - up) / 0.22);
    for (let x = 0; x < n; x++) {
      const c = 0.86 + 0.14 * Math.cos((x / n) * ribs * Math.PI * 2);
      const r = rust[y * n + x];
      out[y * n + x] = c * lerp(1, 0.62 + r * 0.30, hem * (0.4 + 0.6 * r));
    }
  }
  return out;
}

// Cute commercial striped canopy awning (3 bold stripes, rich contrast)
function tAwning(n) {
  const stripes = 3;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const valanceT = smooth((y - n * 0.80) / (n * 0.12));
    const valance = lerp(1.0, 0.82, valanceT);
    for (let x = 0; x < n; x++) {
      const u = (x / n) * stripes;
      const stripePos = u - Math.floor(u);
      const band = 0.68 + 0.32 * Math.cos(stripePos * Math.PI * 2);
      out[y * n + x] = band * valance;
    }
  }
  return out;
}

// Cute shopfront display window (large glass display + base kickplate + header sign band)
function tShopWindow(n) {
  const J = Math.max(5, Math.round(n / 24));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const isHeader = y < n * 0.22;
    const isKick = y > n * 0.82;
    const dy = isHeader ? Math.min(y, n * 0.22 - y) : isKick ? Math.min(y - n * 0.82, n - 1 - y) : Math.min(y - n * 0.22, n * 0.82 - y);
    for (let x = 0; x < n; x++) {
      const dx = Math.min(x, n - 1 - x);
      const frame = Math.min(jointRamp(dy, J), jointRamp(dx, J));
      let pane;
      if (isHeader) {
        pane = 0.72 + 0.22 * smooth(1 - y / (n * 0.22));
      } else if (isKick) {
        pane = 0.55;
      } else {
        const gy = 1 - (y - n * 0.22) / (n * 0.60);
        pane = 0.82 + 0.18 * smooth(gy);
      }
      out[y * n + x] = lerp(0.42, pane, frame);
    }
  }
  return out;
}

// Cute suburban wood clapboard siding (4 horizontal planks, soft overlap bevels)
function tSuburbanSiding(n) {
  const planks = 4;
  const ph = n / planks;
  const J = Math.max(5, Math.round(ph * 0.18));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const p = Math.floor(y / ph);
    const dy = Math.min(y - p * ph, (p + 1) * ph - 1 - y);
    const joint = jointRamp(dy, J);
    const py = (y - p * ph) / ph;
    const plankGrad = 0.78 + 0.22 * Math.cos(py * Math.PI);
    const bevel = lerp(0.58, plankGrad, joint);
    for (let x = 0; x < n; x++) {
      out[y * n + x] = bevel;
    }
  }
  return out;
}

// Cute scalloped clay shingles / roof tiles (3 courses of rounded scallops)
function tClayShingles(n) {
  const rows = 3, cols = 3;
  const rh = n / rows, cw = n / cols;
  const J = Math.max(5, Math.round(rh * 0.16));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const r = Math.floor(y / rh);
    const dy = Math.min(y - r * rh, (r + 1) * rh - 1 - y);
    const jointY = jointRamp(dy, J);
    const off = (r % 2) * cw * 0.5;
    for (let x = 0; x < n; x++) {
      const xs = (x + off) % n;
      const c = Math.floor(xs / cw);
      const dx = Math.min(xs - c * cw, (c + 1) * cw - 1 - xs);
      const jointX = jointRamp(dx, J);
      const scallop = 0.74 + 0.26 * Math.cos(((xs % cw) / cw - 0.5) * Math.PI) * Math.sin(((y % rh) / rh) * Math.PI);
      out[y * n + x] = lerp(0.55, scallop, Math.min(jointX, jointY));
    }
  }
  return out;
}

// Cute warehouse roll-up door (6 horizontal corrugated slats + side tracks)
function tRollDoor(n) {
  const slats = 6;
  const sh = n / slats;
  const trackW = Math.max(8, Math.round(n * 0.10));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const sy = (y % sh) / sh;
    const rib = 0.75 + 0.25 * Math.sin(sy * Math.PI * 2);
    for (let x = 0; x < n; x++) {
      const dSide = Math.min(x, n - 1 - x);
      const track = lerp(0.58, 1.0, jointRamp(dSide, trackW));
      out[y * n + x] = rib * track;
    }
  }
  return out;
}

// ---------------------------------------------------------------- assembly
// Edge darkening and grime are applied HERE, not inside each tile, so they stay
// one tunable pass shared by every surface instead of nine copies drifting
// apart. Both are masks driven off face-UV geometry: the edge ramp is the
// existing mortar course, and grime is the 2D stand-in for a Normal-Z mask —
// there is no per-face normal available in a tile generator, and on a cube the
// bottom of the face is where dirt settles and runs.
//
// MEAN NORMALISATION is why a scene can opt in without re-tuning its palette. An
// 8-bit unorm multiplier cannot exceed 1.0, so an un-normalised tile can only
// darken the authored paint — measured at -15% average on the first pass, which
// reads as "someone turned the lights down" rather than "that wall is brick
// now". Scaling each tile to a fixed mean makes the darkening a stated, uniform
// 8% instead of a per-surface accident.
const TARGET_MEAN = 0.92;

// Float assembly, shared by the RGBA packers and by the probe. Returns the
// linear multiplier field so tools/shimmer.mjs can measure the real signal
// rather than a quantised copy of it.
export function assembleField(spec) {
  const n = spec.res;
  // `spec` is passed so a tile can read its own row's parameters (tTimber's
  // `boards`). Every other tile ignores the second argument, and the CONTROL in
  // tools/shimmer.mjs does too, so this stays backward compatible.
  const base = spec.tile(n, spec);
  const border = Math.max(3, Math.round(n * 3 / 128));
  const soil = fbm(n, 4, 4, 3, mulberry32(hash32(spec.id + '_grime')));
  const v = new Float32Array(n * n);
  let sum = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let a = base[i];
      if (spec.edge > 0) {
        const d = Math.min(x, y, n - 1 - x, n - 1 - y);
        a *= 1 - spec.edge * 0.54 * (1 - jointRamp(d, border));
      }
      if (spec.grime > 0) {
        const up = 1 - y / n;
        const run = smooth((0.34 - up) / 0.34);       // settles low, runs up a third
        a *= 1 - spec.grime * 0.30 * run * (0.45 + 0.55 * soil[i]);
      }
      v[i] = a; sum += a;
    }
  }
  const mean = sum / v.length || 1;
  // 'mat_default' is exempt: it must stay byte-identical to the shipped mortar
  // texture, so the identity row is a true identity and not a lookalike.
  const k = spec.id === 'mat_default' ? 1 : Math.min(1 / mean, TARGET_MEAN / mean);
  for (let i = 0; i < v.length; i++) v[i] = Math.max(0.30, Math.min(1, v[i] * k));
  return { n, v, k, rawMean: mean };
}

// Greyscale albedo multiplier as RGBA bytes, ready for a DataTexture.
export function buildTilePixels(spec) {
  const { n, v } = assembleField(spec);
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < v.length; i++) {
    const c = Math.round(v[i] * 255);
    const o = i * 4;
    data[o] = c; data[o + 1] = c; data[o + 2] = c; data[o + 3] = 255;
  }
  return { n, data };
}

// ORM pack: R = occlusion, G = roughness, B = metalness — the glTF channel
// convention, and exactly the channels three reads from roughnessMap and
// metalnessMap, so one texture serves both samplers.
//
// R is RESERVED and written as 255. A unit-cube face has no crevice to occlude,
// and three's aoMap needs a uv1 channel the shared BoxGeometry does not carry.
// Adding one is the modeler's call, not this stage's.
//
// Roughness follows the albedo INVERSELY: the recessed dark parts of a tile are
// joints, grime and grain — the parts that scatter. This is the map that stops a
// surface reading as CG. Authored at half the albedo resolution because
// roughness carries no high-frequency detail worth the memory.
export function buildOrmPixels(spec) {
  const n = Math.max(64, spec.res >> 1);
  const sub = assembleField({ ...spec, res: n });
  const data = new Uint8Array(n * n * 4);
  const gMin = Math.max(0.05, spec.rough - spec.roughVar);
  const gMax = Math.min(1.0, spec.rough + spec.roughVar);
  for (let i = 0; i < n * n; i++) {
    const a = sub.v[i];                          // 1 = raised/clean, 0 = joint/grime
    const rough = gMax + (gMin - gMax) * a;      // dark -> rougher
    const o = i * 4;
    data[o] = 255;                               // O: reserved
    data[o + 1] = Math.round(Math.max(0, Math.min(1, rough)) * 255);
    data[o + 2] = Math.round(spec.metal * 255);  // M: exactly 0 or 255. Never between.
    data[o + 3] = 255;
  }
  return { n, data };
}
