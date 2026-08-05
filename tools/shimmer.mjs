// Mechanical gate on the procedural surface registry (js/voxeltiles.js).
// Run: node tools/shimmer.mjs [surfaceId]
//
// WHY THIS EXISTS
// The failure mode of a texture registry is not a crash. It is a wall that
// crawls when the camera pulls out to 80 m — invisible in a screenshot,
// invisible in a code review, and it only shows up in motion on the one scene
// nobody re-checked. voxelworld.js:319 already records the engine hitting this
// once: a hard 1-texel mortar line had to become a ramp. This turns that lesson
// into a check that runs.
//
// WHAT IT DOES NOT DO — read this before trusting a green.
// It does NOT reproduce the GPU shimmer measurement from the design spike. That
// was tried and it does not work, and the reason is worth recording because it
// determines what this tool can honestly claim. Three CPU models of crawl were
// built and scored against the nine measured GPU numbers:
//
//   mip-vs-truth residual        Spearman -0.47   (the shipped mortar scored
//                                                  WORST, above the control)
//   second-difference of the mip Spearman -0.18
//   contrast surviving to 4x4    no separation; the control ranked BEST
//
// None of them correlate, and the cause is clear in hindsight: the GPU probe's
// control was broken by FILTERING CONFIGURATION (mips off, anisotropy 1), and
// the registry rows' scores were driven by SHADING (a polished metal swinging
// its reflection) and by the renderer's real LOD selection. None of that is a
// property of the tile bytes, so no amount of tile statistics recovers it.
//
// So this tool gates the CAUSES instead, each one traceable to something that
// actually went wrong during authoring:
//
//   1. Ramp width   — the authoring rule itself, and the only one that IS a
//                     property of the bytes. Anchored to a control below.
//   2. Filter setup — the defect the GPU control embodied, checked at its source
//                     in js/voxelsurfaces.js.
//   3. Colour space — the single most common catastrophic error in the
//                     discipline, and silent when wrong.
//   4. Metal rules  — the stand-in for the shading crawl, from the one surface
//                     that measured worse than the broken control.
//   5. Determinism, ORM binarity, palette drift, naming, resolution.
//
// EXCLUSION ZONE, stated plainly: a surface can pass every check here and still
// crawl on screen, because this tool never renders anything. Rule 4 is a proxy,
// not a measurement — mat_metal_seam scored 3.05 on the GPU at roughness 0.34,
// worse than the broken control, with a texture that passes rule 1 comfortably.
// If someone loosens the metal rules, this tool goes blind to the failure that
// actually happened. The GPU probe in the design spike remains the only thing
// that measured crawl directly.
import { SURFACES, assembleField, buildOrmPixels } from '../js/voxeltiles.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let failures = 0;
const fail = (msg) => { failures++; console.error(`  FAIL: ${msg}`); };

// ------------------------------------------------------------- ramp metric
// Rule 1 of js/voxeltiles.js, measured rather than trusted: no step edges, every
// feature boundary ramps over at least 3 texels. A hard edge has
// maxStep == range; a 3-texel ramp has maxStep == range/3. So range / maxStep IS
// the narrowest ramp anywhere in the tile, in texels.
//
// Wrapping follows the surface's own wrap mode, because the gate must measure
// what the GPU samples and nothing else. A 'brick' surface is ClampToEdge, so
// its tile boundary is never crossed and a discontinuity there is not a defect;
// a 'metre' surface repeats, so it is. Getting this wrong in the first pass
// flagged mat_corrugated_rust at 1.93 for a seam that never renders — an
// exclusion set too SMALL flatters nothing, but one set too large invents work.
// The floor is not arbitrary. The shipped mortar texture measures EXACTLY 3.00
// (MORTAR_BORDER = 3 over a 0.54 range), so the limit is set at the one tile the
// engine already ships, already tuned, already known not to crawl. Inclusive,
// with an epsilon because 0.54 / 0.18 lands at 2.9999997 in binary floating
// point and the shipped texture must not fail its own standard.
const MIN_RAMP = 3.0;
const RAMP_EPS = 1e-6;

function rampWidth(v, n, wrap) {
  let lo = Infinity, hi = -Infinity, maxStep = 0, at = null;
  for (const t of v) { if (t < lo) lo = t; if (t > hi) hi = t; }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = v[y * n + x];
      if (wrap || x + 1 < n) {
        const s = Math.abs(v[y * n + ((x + 1) % n)] - c);
        if (s > maxStep) { maxStep = s; at = `${x},${y} across u`; }
      }
      if (wrap || y + 1 < n) {
        const s = Math.abs(v[((y + 1) % n) * n + x] - c);
        if (s > maxStep) { maxStep = s; at = `${x},${y} across v`; }
      }
    }
  }
  const range = hi - lo;
  return { range, maxStep, width: maxStep > 1e-9 ? range / maxStep : Infinity, at, lo, hi };
}

// ---------------------------------------------------------------- control
// The shipped mortar course with its ramp removed: a 1-texel hard joint, which
// is precisely the defect voxelworld.js:319 records having to fix. It is the
// instrument's zero point, and it must score at the floor or the metric has
// stopped measuring and every green below it is worthless.
const CONTROL = {
  id: 'CONTROL_hard_joint',
  rough: 0.8, roughVar: 0, metal: 0, uv: 'brick', edge: 0, grime: 0, res: 128,
  tile(n) {
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.min(x, y, n - 1 - x, n - 1 - y);
      out[y * n + x] = d < 1 ? 0.46 : 1.0;     // hard edge, no ramp
    }
    return out;
  },
};

// ---------------------------------------------------------------- rules
const ID_RE = /^mat_[a-z0-9]+(_[a-z0-9]+)*$/;

function checkRegistryRow(spec) {
  const id = spec.id;
  if (!ID_RE.test(id)) fail(`${id}: id does not match the contract naming mat_<surface>_<variant>`);
  if (!Number.isInteger(spec.res) || (spec.res & (spec.res - 1)) !== 0 || spec.res < 64) {
    fail(`${id}: res ${spec.res} must be a power of two >= 64 — the mip chain depends on it`);
  }
  if (spec.uv !== 'brick' && spec.uv !== 'metre') fail(`${id}: uv "${spec.uv}" is not 'brick' or 'metre'`);
  if (!(spec.rough >= 0 && spec.rough <= 1)) fail(`${id}: rough ${spec.rough} outside 0..1`);
  if (!(spec.roughVar >= 0 && spec.roughVar <= 0.5)) fail(`${id}: roughVar ${spec.roughVar} outside 0..0.5`);
  if (!(spec.edge >= 0 && spec.edge <= 1)) fail(`${id}: edge ${spec.edge} outside 0..1`);
  if (!(spec.grime >= 0 && spec.grime <= 1)) fail(`${id}: grime ${spec.grime} outside 0..1`);

  // Metallic is binary. mat_default is the ONE documented exemption: it exists
  // to reproduce the shipped block material exactly, inherited 0.1 and all, so
  // that an unsurfaced bucket and a mat_default bucket are the same pixels.
  // Every other row is a physical claim about a substance and must be 0 or 1.
  if (id !== 'mat_default' && spec.metal !== 0 && spec.metal !== 1) {
    fail(`${id}: metal ${spec.metal} — Metallic is 0.0 or 1.0. A dielectric at ${spec.metal} is a bug, not a look.`);
  }
  // The proxy for the shading crawl this tool cannot see. A metal smoother than
  // this swings its whole reflection as the camera tracks: measured 3.05 at
  // rough 0.34, against a broken control at 2.18.
  if (spec.metal >= 1) {
    if (spec.rough < 0.45) {
      fail(`${id}: metal at rough ${spec.rough} — below 0.45 a metal crawls through its reflection (measured 3.05 at 0.34; the GPU control was 2.18)`);
    }
    const e = spec.envInt ?? 1.0;
    if (e > 0.6) fail(`${id}: metal envInt ${e} > 0.6 — the probe overwhelms the scene's analytic lighting`);
  } else if (spec.envInt !== undefined) {
    fail(`${id}: envInt ${spec.envInt} on a dielectric — it is never read, so it is a false claim in the registry`);
  }
}

// A registry seeded from anything but its own id makes every framebuffer diff
// meaningless, which would take the stage-0 gate down with it.
function checkDeterminism(spec) {
  const a = assembleField(spec).v;
  const b = assembleField(spec).v;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      fail(`${spec.id}: tile is NOT deterministic — texel ${i} differs between two builds in the same process`);
      return;
    }
  }
}

// Metalness must survive quantisation as exactly 0 or 255 in the ORM blue
// channel. Anything between means the packed texture disagrees with the row it
// came from, and the texture is what the GPU reads.
function checkOrm(spec) {
  const { n, data } = buildOrmPixels(spec);
  const want = Math.round(spec.metal * 255);
  for (let i = 0; i < n * n; i++) {
    if (data[i * 4 + 2] !== want) {
      fail(`${spec.id}: ORM blue (metalness) is ${data[i * 4 + 2]} at texel ${i}, expected ${want}`);
      return;
    }
    if (data[i * 4] !== 255) { fail(`${spec.id}: ORM red is not the reserved 255`); return; }
  }
  if (spec.roughVar > 0) {
    let lo = 255, hi = 0;
    for (let i = 0; i < n * n; i++) { const g = data[i * 4 + 1]; if (g < lo) lo = g; if (g > hi) hi = g; }
    if (hi - lo < 4) {
      fail(`${spec.id}: ORM roughness spans only ${hi - lo}/255 — roughVar ${spec.roughVar} is not reaching the map, so the surface has no roughness story`);
    }
  }
}

// The two checks that read js/voxelsurfaces.js as text. They are source checks
// on purpose: both defects are invisible at runtime until the lighting is
// subtly and unfixably wrong, and both must fail in this run rather than
// needing a GL context to catch.
function checkTextureSetup() {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'js', 'voxelsurfaces.js'), 'utf8');
  const lines = src.split('\n');

  // Colour space. Every map built here is DATA and must be NoColorSpace; the one
  // exception is the environment gradient, which is genuinely colour.
  // sRGB-decoding an albedo MULTIPLIER crushes every joint far darker than
  // intended.
  let sRGB = 0, noColor = 0;
  lines.forEach((ln, i) => {
    if (!/colorSpace\s*=/.test(ln)) return;
    if (/SRGBColorSpace/.test(ln)) {
      sRGB++;
      if (!/^\s*src\.colorSpace/.test(ln)) {
        fail(`voxelsurfaces.js:${i + 1}: sRGB on something that is not the environment gradient — "${ln.trim()}"`);
      }
    } else if (/NoColorSpace/.test(ln)) {
      noColor++;
    } else {
      fail(`voxelsurfaces.js:${i + 1}: colorSpace set to something unrecognised — "${ln.trim()}"`);
    }
  });
  if (noColor < 2) fail(`voxelsurfaces.js: the albedo AND the ORM texture must both be NoColorSpace, found ${noColor}`);
  if (sRGB !== 1) fail(`voxelsurfaces.js: expected exactly one sRGB texture (the environment gradient), found ${sRGB}`);

  // Filtering. This is the defect the GPU control embodied — it crawled because
  // mips were off and anisotropy was 1, not because of anything in its pixels.
  const need = [
    [/generateMipmaps\s*=\s*true/g, 2, 'generateMipmaps = true'],
    [/minFilter\s*=\s*THREE\.LinearMipmapLinearFilter/g, 2, 'minFilter = LinearMipmapLinearFilter'],
  ];
  for (const [re, count, what] of need) {
    const found = (src.match(re) || []).length;
    if (found < count) {
      fail(`voxelsurfaces.js: ${what} appears ${found} time(s), expected ${count} (albedo and ORM) — this is exactly how the GPU control was made to crawl`);
    }
  }
  if (!/anisotropy\s*=/.test(src)) fail('voxelsurfaces.js: no anisotropy is set — a facade is read at a grazing angle almost always');
  if (/minFilter\s*=\s*THREE\.(Nearest|Linear)Filter\b/.test(src)) {
    fail('voxelsurfaces.js: a minFilter without mipmapping — a minified texture will alias by construction');
  }
  console.log(`  texture setup: ${noColor} NoColorSpace (data), ${sRGB} sRGB (environment gradient only), mips + anisotropy present`);
}

// ---------------------------------------------------------------- run
const only = process.argv[2];

console.log('Calibrating the ramp metric against the deliberately broken control...');
const cf = assembleField(CONTROL);
const ctl = rampWidth(cf.v, cf.n, false);
console.log(`  ${CONTROL.id}: narrowest ramp ${ctl.width.toFixed(2)} texels (1-texel joint, no ramp)`);
if (ctl.width > 1.5) {
  fail(`instrument broken: the control measured ${ctl.width.toFixed(2)} texels, which is not a failing score. Every result below is meaningless.`);
}
console.log(`  floor: ${MIN_RAMP.toFixed(2)} texels — nothing finer survives mip 3\n`);

checkTextureSetup();
console.log('');

const rows = only ? SURFACES.filter((s) => s.id === only) : SURFACES;
if (!rows.length) {
  console.error(`no such surface: ${only}. Known: ${SURFACES.map((s) => s.id).join(', ')}`);
  process.exit(1);
}

const seen = new Set();
for (const spec of rows) {
  if (seen.has(spec.id)) fail(`${spec.id}: duplicate id in the registry`);
  seen.add(spec.id);

  checkRegistryRow(spec);
  checkDeterminism(spec);
  checkOrm(spec);

  const field = assembleField(spec);
  const r = rampWidth(field.v, field.n, spec.uv === 'metre');
  let sum = 0;
  for (const t of field.v) sum += t;
  const mean = sum / field.v.length;

  const ok = r.width >= MIN_RAMP - RAMP_EPS;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${spec.id.padEnd(22)} ramp ${r.width.toFixed(2).padStart(6)} texels` +
    `  res ${String(spec.res).padStart(3)} ${spec.uv.padEnd(5)}` +
    `  mean ${mean.toFixed(3)}  range ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}` +
    `  rough ${String(spec.rough).padEnd(4)} metal ${spec.metal}`
  );
  if (!ok) {
    fail(`${spec.id}: narrowest ramp ${r.width.toFixed(2)} texels at ${r.at}, floor is ${MIN_RAMP.toFixed(2)}. A boundary this sharp crawls once the camera pulls out. Widen the joint, lower the contrast across it, or raise the resolution.`);
  }
  // A tile whose mean has drifted stops being a surface and becomes a dimmer.
  // assembleField mean-normalises to 0.92 for exactly this reason; mat_default
  // is exempt because it must match the shipped texture, mean and all.
  if (spec.id !== 'mat_default' && (mean < 0.80 || mean > 0.96)) {
    fail(`${spec.id}: mean ${mean.toFixed(3)} outside 0.80-0.96 — an albedo multiplier this far off re-tints the authored palette instead of texturing it`);
  }
}

console.log('---');
if (failures === 0) {
  console.log(`ALL PASS. ${rows.length} surface(s) above the ${MIN_RAMP.toFixed(2)}-texel floor; control sits at ${ctl.width.toFixed(2)}.`);
} else {
  console.error(`${failures} failure(s).`);
  process.exit(1);
}
