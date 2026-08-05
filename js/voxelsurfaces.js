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
  if (envRT) { envRT.dispose(); envRT = null; }
}

export function surfaceCacheSize() { return surfCache.size; }
