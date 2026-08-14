// three.js binding for the procedural surface registry in js/voxeltiles.js.
//
// Split deliberately: voxeltiles.js is pure JS so `node tools/shimmer.mjs` can
// import and gate it without a bundler; this file is everything that needs a GL
// context. Nothing here runs unless a scene declares `sim.sceneSurfaces`.
//
// ZERO COST WHEN UNUSED is a hard requirement, not an aspiration. No texture is
// generated, no material is built, and no PMREM render happens until a scene
// names a surface. It is proven by framebuffer hash, not by assertion — see the
// stage-0 gate evidence in the commit that introduced this file.
import * as THREE from 'three';
import { SURFACES, SURFACE_BY_ID, buildTilePixels, buildOrmPixels } from './voxeltiles.js';

export { SURFACES, SURFACE_BY_ID };

// Resolved once and shared across worlds, exactly like voxelworld.js matCache.
// Keyed by id (and by id@size for per-metre surfaces); a scene names surfaces,
// never indices.
const surfCache = new Map();
let envRT = null;

// One DataTexture per surface. Settings taken from mortarTexture() and then
// hardened: NoColorSpace because this is a MULTIPLIER and sRGB-decoding it would
// crush every joint far darker than intended, mips because the SIZE ramp reaches
// 80 m, anisotropy because a facade is read at a grazing angle almost always.
function albedoTexture(spec, maxAniso) {
  const { n, data } = buildTilePixels(spec);
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = spec.uv === 'metre' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = t.wrapS;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, maxAniso || 1);
  t.needsUpdate = true;
  t.name = 'tex_' + spec.id.replace('mat_', '') + '_albmul';
  return t;
}

// ORM. Also NoColorSpace — it is data, not colour. Getting this one wrong is
// invisible until the lighting is subtly and unfixably off.
function ormTexture(spec) {
  const { n, data } = buildOrmPixels(spec);
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = spec.uv === 'metre' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = t.wrapS;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.name = 'tex_' + spec.id.replace('mat_', '') + '_orm';
  return t;
}

// A metal with Metallic = 1.0 and nothing to reflect is BLACK. It has no diffuse
// lobe by definition, and a HemisphereLight is analytic — it contributes nothing
// to a specular reflection. Measured: mat_metal_seam and mat_corrugated_rust
// rendered as flat black rectangles until this existed.
//
// The scoping is the point. `scene.environment` would relight every material in
// every existing scene and break the zero-cost-when-unused rule outright, so the
// probe is built once and attached PER MATERIAL, to metals only. It is
// generated, not downloaded — a 3-stop vertical gradient matching the
// HemisphereLight the engine already runs (sky 0xffffff, ground 0x3a3f5c),
// pushed through PMREM. One render at construction, no network, no licence.
function surfaceEnvironment(renderer) {
  if (envRT) return envRT.texture;
  if (!renderer) return null;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  const lerp = (a, b, t) => a + (b - a) * t;
  for (let y = 0; y < n; y++) {
    const t = 1 - y / (n - 1);
    const c = t > 0.5
      ? [lerp(0.74, 1.0, (t - 0.5) * 2), lerp(0.78, 1.0, (t - 0.5) * 2), lerp(0.88, 1.0, (t - 0.5) * 2)]
      : [lerp(0.16, 0.74, t * 2), lerp(0.18, 0.78, t * 2), lerp(0.30, 0.88, t * 2)];
    for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4;
      data[o] = c[0] * 255; data[o + 1] = c[1] * 255; data[o + 2] = c[2] * 255; data[o + 3] = 255;
    }
  }
  const src = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  src.colorSpace = THREE.SRGBColorSpace;   // this one IS colour, unlike every map above
  src.mapping = THREE.EquirectangularReflectionMapping;
  src.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  envRT = pmrem.fromEquirectangular(src);
  src.dispose();
  pmrem.dispose();
  return envRT.texture;
}

function baseMaterial(spec, maxAniso, renderer) {
  // three MULTIPLIES the map channel into the scalar
  // (roughnessFactor = material.roughness * texel.g), so when an ORM map is
  // present the absolute value belongs in the texture and the scalar must be
  // 1.0. Leaving the scalar at 0.55 and the map at 0.55 gives 0.30 — a mirror
  // where a brushed panel was intended. This is the glTF convention, and getting
  // it inverted is the classic way an ORM pack goes wrong.
  const orm = spec.roughVar > 0 ? ormTexture(spec) : null;
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: orm ? 1.0 : spec.rough,
    metalness: orm ? 1.0 : spec.metal,
    flatShading: true,
    map: albedoTexture(spec, maxAniso),
    roughnessMap: orm,
    metalnessMap: orm,
  });
  // `>= 1`, not `> 0`. An earlier pass tested `> 0` and caught mat_default's
  // inherited metalness of 0.1, handing a reflection probe to the one material
  // whose entire job is to look exactly like it does today. That is the
  // second-order cost of a stray non-zero Metallic on a dielectric: it is not
  // just wrong shading, it silently opts the surface into every code path
  // written for metal.
  // CONSEQUENCE FOR SCENE PALETTES — read this before widening the test below.
  //
  // Metals-only is correct today, but it is not free: it silently pushes a
  // calibration decision out into every scene file. A DIELECTRIC that is mostly
  // reflection in real life — water, curtain-wall glass, polished stone — gets
  // no probe here, so it has nothing to reflect and its BASE COLOUR has to carry
  // the sky itself. Scene authors have already had to do that. Boston ships
  // three values sampled straight off photographs with the atmospheric-veil
  // correction DELIBERATELY REFUSED, precisely because the veil in those pixels
  // is doing the job this probe would otherwise do:
  //
  //   C.harbourOpen   0x354d58   Boston Harbor
  //   C.channelDeep   0x2b3d3b   Fort Point Channel
  //   C.glassCurtain  0x91a0b6   Seaport curtain wall
  //
  // (js/voxelscene-boston.js, marked with the `sp()` wrapper for exactly this
  // reason — every other measured value there goes through `mm()` and IS an
  // albedo.)
  //
  // So the day someone relaxes `>= 1` and hands dielectrics an environment
  // probe, those three DOUBLE-COUNT the sky and the harbour goes pale and
  // washed out. That is a palette bug that will present as a lighting bug, and
  // it will be looked for in the wrong file. The fix at that point is not to
  // darken them by eye — it is to re-derive them from the original samples with
  // the veil correction applied, `(linear - 0.021) / 1.182` per channel, the
  // same transform the diffuse values already carry. The provenance is recorded
  // in _boston-palette-deliverables/measured-to-albedo.md and Boston has a
  // single `PALETTE_TRANSFORM` seam that exists to make that a one-shot change.
  if (spec.metal >= 1) {
    const env = surfaceEnvironment(renderer);
    if (env) {
      m.envMap = env;
      m.envMapIntensity = spec.envInt ?? 1.0;
    }
  }
  m.name = spec.id;
  return m;
}

// Resolve a surface id to a material, cached. Unknown ids fall back to the
// identity row rather than throwing, so a typo in a scene degrades to today's
// look instead of a blank city — and `resolveSurface` below is what a caller
// uses to find out whether the id was real.
//
// `size` matters only for 'metre' surfaces, where the tile repeats once per
// metre and a 2 m block must therefore show 2x2. The repeat lives on the
// TEXTURE, so per-metre density needs one material per brick size — which the
// bucket key already provides for free, because it always contained `b.s`.
export function surfaceMaterial(id, size = 1, maxAniso = 4, renderer = null) {
  const spec = SURFACE_BY_ID.get(id) || SURFACES[0];
  const perMetre = spec.uv === 'metre' && size !== 1;
  const key = perMetre ? spec.id + '@' + size : spec.id;
  const hit = surfCache.get(key);
  if (hit) return hit;
  if (!perMetre) {
    const m = baseMaterial(spec, maxAniso, renderer);
    surfCache.set(key, m);
    return m;
  }
  const base = surfaceMaterial(spec.id, 1, maxAniso, renderer);
  const m = base.clone();
  m.map = base.map.clone();
  m.map.repeat.set(size, size);
  m.map.needsUpdate = true;
  if (base.roughnessMap) {
    m.roughnessMap = base.roughnessMap.clone();
    m.roughnessMap.repeat.set(size, size);
    m.roughnessMap.needsUpdate = true;
    m.metalnessMap = m.roughnessMap;
  }
  m.name = spec.id + '_x' + size;
  surfCache.set(key, m);
  return m;
}

// True when the id names a real registry row. Callers use this to decide whether
// a bucket is surfaced at all — an unknown id must NOT create a bucket split,
// because a typo that silently doubled the draw calls would be worse than a typo
// that silently did nothing.
export function isSurface(id) {
  return typeof id === 'string' && SURFACE_BY_ID.has(id);
}

// ------------------------------------------------------- Tier-2 array material
// ONE material for every surfaced block in a scene. The per-bucket path above
// costs one InstancedMesh per (surface, brick size) pair, which priced full
// coverage at 200 draw calls on Chicago and 989 on Cambridge — measured, not
// estimated. Here the tiles live in two DataArrayTextures (albedo + ORM), the
// surface choice is a per-instance attribute, and the per-metre repeat is
// another, so every surfaced block in a scene draws in ONE call regardless of
// how many brick sizes it uses.
//
// The registry rows are resolution-parameterised (assembleField takes res), so
// the layers are regenerated at the array's uniform resolution rather than
// resampled — mat_default's mortar border scales by n and reads identically at
// 256. tools/shimmer.mjs still gates the authored rows; nothing in
// js/voxeltiles.js changed.
const ARRAY_ALBEDO_RES = 256;
const ARRAY_ORM_RES = 128;

// id -> layer index is the SURFACES array order. It is stable (a literal array,
// append-only by the registry's add-a-row rule) and it never crosses the
// network or a save, so a bare index is safe.
const SURFACE_LAYER = new Map(SURFACES.map((s, i) => [s.id, i]));

// The two facts voxelworld needs per block when it fills the instance
// attributes: which layer, and whether the tile repeats per metre.
export function surfaceArrayLayer(id) { return SURFACE_LAYER.has(id) ? SURFACE_LAYER.get(id) : 0; }
export function surfacePerMetre(id) { const s = SURFACE_BY_ID.get(id); return !!s && s.uv === 'metre'; }

function albedoArrayTexture(maxAniso) {
  const n = ARRAY_ALBEDO_RES, layers = SURFACES.length;
  const data = new Uint8Array(n * n * 4 * layers);
  SURFACES.forEach((spec, i) => {
    // `.data` — buildTilePixels returns { n, data }, and TypedArray.set on the
    // bare object has no `length` and silently writes NOTHING (all-zero tiles,
    // black city — caught by the Boston probe, not by a type error).
    data.set(buildTilePixels({ ...spec, res: n }).data, i * n * n * 4);
  });
  const t = new THREE.DataArrayTexture(data, n, n, layers);
  // Same settings as the per-surface albedo textures: a MULTIPLIER is data,
  // never colour, and a facade is read at a grazing angle almost always.
  t.colorSpace = THREE.NoColorSpace;
  // RepeatWrapping for the whole array: 'metre' rows wrap by construction and
  // 'brick' rows sample [0,1] exactly, where repeat and clamp are the same.
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, maxAniso || 1);
  t.needsUpdate = true;
  t.name = 'tex_array_albmul';
  return t;
}

function ormArrayTexture() {
  const n = ARRAY_ORM_RES, layers = SURFACES.length;
  const data = new Uint8Array(n * n * 4 * layers);
  SURFACES.forEach((spec, i) => {
    // buildOrmPixels derives its resolution as res>>1 (floor 64); passing 256
    // lands every row on the array's uniform 128. Rows with roughVar 0 (the
    // identity row) pack their constant scalars, so every layer can share one
    // ORM-fed shader path and the glTF scalar-at-1.0 convention holds for all.
    data.set(buildOrmPixels({ ...spec, res: n << 1 }).data, i * n * n * 4);
  });
  const t = new THREE.DataArrayTexture(data, n, n, layers);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.name = 'tex_array_orm';
  return t;
}

let arrayMat = null;

// The single surfaced-block material. Per-instance attributes `aSurf` (array
// layer) and `aRepeat` (UV repeat: sAvg for 'metre' surfaces, 1 otherwise) are
// written once at bucket build; paint stays in instanceColor, so this one
// program replaces the whole surfaced bucket set.
//
// Requires WebGL2 (sampler2DArray) — the caller guards on
// renderer.capabilities.isWebGL2 and falls back to surfaceMaterial() buckets.
export function surfaceArrayMaterial(maxAniso = 4, renderer = null) {
  if (arrayMat) return arrayMat;
  const orm = ormArrayTexture();
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    // Scalars at 1.0: the ORM layers carry absolute values (glTF convention —
    // see baseMaterial above for why the scalar must not double up).
    roughness: 1.0,
    metalness: 1.0,
    flatShading: true,
    map: albedoArrayTexture(maxAniso),
    roughnessMap: orm,
    metalnessMap: orm,
  });
  // One probe for every layer, not the per-material metals-only attach of the
  // bucket path: the ORM metalness channel already gates the reflection
  // per-fragment, so dielectrics pick up only the physical F0 sheen while
  // metals get the real reflection they need to not render black. 0.35 splits
  // the registry's two metal envInt values (0.35 seam / 0.50 rust) toward the
  // one surface scenes actually declare.
  const env = surfaceEnvironment(renderer);
  if (env) {
    m.envMap = env;
    m.envMapIntensity = 0.35;
  }
  m.onBeforeCompile = (shader) => {
    // Anchors are the #include LINES, not the chunk contents: onBeforeCompile
    // runs before three resolves includes, so 'uniform sampler2D map;' is not
    // in the source yet (the first pass of this learned that the hard way).
    // Each map chunk is therefore restated here in full, with the sampler
    // widened to an array and the per-instance layer/repeat folded in. The
    // restated fragments track r160's chunks exactly, minus DECODE_VIDEO_TEXTURE
    // (video textures only — these are generated DataArrayTextures).
    const vs = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tvSurf = aSurf;\n\tvRepeat = aRepeat;'
    );
    let fs = shader.fragmentShader;
    const swaps = [
      ['#include <map_pars_fragment>',
        '#ifdef USE_MAP\n\tuniform sampler2DArray map;\n#endif'],
      ['#include <roughnessmap_pars_fragment>',
        '#ifdef USE_ROUGHNESSMAP\n\tuniform sampler2DArray roughnessMap;\n#endif'],
      ['#include <metalnessmap_pars_fragment>',
        '#ifdef USE_METALNESSMAP\n\tuniform sampler2DArray metalnessMap;\n#endif'],
      ['#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture( map, vec3( vMapUv * vRepeat, vSurf ) );
	diffuseColor *= sampledDiffuseColor;
#endif`],
      ['#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture( roughnessMap, vec3( vRoughnessMapUv * vRepeat, vSurf ) );
	roughnessFactor *= texelRoughness.g;
#endif`],
      ['#include <metalnessmap_fragment>',
        `float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture( metalnessMap, vec3( vMetalnessMapUv * vRepeat, vSurf ) );
	metalnessFactor *= texelMetalness.b;
#endif`],
    ];
    let ok = vs !== shader.vertexShader;
    let missing = ok ? '' : 'begin_vertex';
    for (const [from, to] of swaps) {
      if (fs.indexOf(from) === -1) { ok = false; missing = from; break; }
      fs = fs.replace(from, to);
    }
    // Fail safe, same rule as applyHoleClipping: if a chunk anchor moved under
    // us (a three upgrade), leave the program alone so it still links — a city
    // without tiles beats a city that does not render. The sweep's console
    // capture is where a miss would surface.
    if (!ok) { console.error('surfaceArrayMaterial: shader anchor missing, array path disabled —', missing); return; }
    shader.vertexShader = 'attribute float aSurf;\nattribute float aRepeat;\nvarying float vSurf;\nvarying float vRepeat;\n' + vs;
    shader.fragmentShader = 'varying float vSurf;\nvarying float vRepeat;\n' + fs;
  };
  m.name = 'mat_array';
  arrayMat = m;
  return m;
}


// Released from voxelworld.js dispose() on the same refcount that frees the
// shared geometry, so surfaces live exactly as long as the last world.
export function disposeSurfaces() {
  const seen = new Set();
  for (const m of surfCache.values()) {
    for (const t of [m.map, m.roughnessMap]) {
      if (t && !seen.has(t.uuid)) { seen.add(t.uuid); t.dispose(); }
    }
    m.dispose();
  }
  surfCache.clear();
  if (arrayMat) {
    // The array material owns the two biggest textures in the pipeline
    // (256²x9 albedo + 128²x9 ORM); same shared-lifetime rule as the caches.
    for (const t of [arrayMat.map, arrayMat.roughnessMap]) if (t) t.dispose();
    arrayMat.dispose();
    arrayMat = null;
  }
  if (envRT) { envRT.dispose(); envRT = null; }
}

export function surfaceCacheSize() { return surfCache.size; }
