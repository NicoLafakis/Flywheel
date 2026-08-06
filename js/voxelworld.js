// Three.js renderer for the Voxel Sandbox pile simulation.
// Blocks render as one InstancedMesh per physical material and brick size
// (paint is per-instance color) instead of one mesh per block. All per-block
// motion (chunk rotation, debris tumble, rim
// tilt, stress wobble) is composed into instance matrices each frame.
//
// Three render-only fields the scene builder may set, none of which the sim ever
// reads: `sim.sceneDecor` (flat ground rects — see DECOR_LAYERS),
// `sim.sceneAmbient` (gulls / surf / ferries / steam / neon / pigeons) and
// `sim.sceneSurfaces` (matType -> surface id — see js/voxeltiles.js SURFACES).
import * as THREE from 'three';
import { loadSave } from './save.js';
import { surfaceMaterial, isSurface, disposeSurfaces } from './voxelsurfaces.js';
import { makeSkin } from './skins.js';

// Read-only peek at the persisted SETTINGS block, so player preferences apply
// from the first frame with no wiring in main.js. save.js owns the schema and
// its migrations; re-deriving the storage key here would rot the moment it
// changes. Read once per world, never written back.
function savedSettings() {
  try { return loadSave().settings || {}; } catch (e) { return {}; }
}
function pref(saved, key, dflt) { return key in saved ? !!saved[key] : dflt; }

// Shared across every world, so no single world may dispose them while another
// is alive — but they cannot simply live forever either. main.js reuses one
// <canvas>, so every scene switch reuses the same WebGL context, and three only
// deletes an attribute's GL buffer when the geometry fires `dispose`. Never
// disposing meant 22 orphaned buffers per scene switch, growing without bound.
// Refcount the worlds and flush the cache when the last one goes; rebuilding
// five small geometries costs nothing next time.
let liveWorlds = 0;
const geoCache = new Map();
function releaseSharedGeometry() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
function boxGeo() { if (!geoCache.has('box')) geoCache.set('box', new THREE.BoxGeometry(1, 1, 1)); return geoCache.get('box'); }
function circleGeo() { if (!geoCache.has('circ')) geoCache.set('circ', new THREE.CircleGeometry(1, 32)); return geoCache.get('circ'); }
function ringGeo() { if (!geoCache.has('ring')) geoCache.set('ring', new THREE.RingGeometry(0.92, 1, 32)); return geoCache.get('ring'); }
const smooth = (v) => { const d = Math.max(0, Math.min(1, v)); return d * d * (3 - 2 * d); };
// Falloff quads: three multiplies the vertex color attribute AND instanceColor
// into the same `vColor`, so a baked ramp gives soft-edged additive shapes with
// no shader, no texture, and no extra draw call — a hard-edged rectangle is the
// difference between "neon sign" and "coloured sticker on the pavement".
function rampQuadGeo(key, segX, segZ, ramp) {
  if (!geoCache.has(key)) {
    const g = new THREE.PlaneGeometry(1, 1, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const f = ramp(p.getX(i), p.getZ(i));
      col[i * 3] = f; col[i * 3 + 1] = f; col[i * 3 + 2] = f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}
// radial pool of light
const glowQuadGeo = () => rampQuadGeo('glowq', 12, 12, (x, z) => smooth(1 - 2 * Math.hypot(x, z)));
// long band, soft across its width and feathered at both ends
const bandQuadGeo = () => rampQuadGeo('bandq', 14, 6, (x, z) =>
  smooth(1 - Math.abs(2 * z)) * smooth((0.5 - Math.abs(x)) / 0.14));

// The block material. `map` is the painted mortar course (see mortarTexture
// below) — it is the ONLY thing on a block that reads as a brick edge now that
// blocks fill their cell, so it belongs here rather than at the call site.
// Shared across worlds like matCache itself, so a scene switch never rebuilds
// the texture or the shader program.
//
// metalness 0.0, not 0.1. Metallic is a binary property of a substance, not a
// dial: a material is either a conductor or it is not. Brick, concrete, glass,
// wood, rubber and stone are dielectrics, and 0.1 tells the shader that a tenth
// of every one of them is polished metal. What that actually does is take a
// tenth of the diffuse albedo away and hand it to a specular lobe that has
// nothing to reflect — these scenes light with an analytic HemisphereLight and
// carry no environment map — so the energy is simply lost. Measured across all
// four scenes at three camera poses each: mean framebuffer luminance rose
// 0.3-2.6 (up to +4.0%) when it went to 0. The city was being quietly dimmed by
// a value that was never a deliberate look.
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({
      color, roughness: 0.8, metalness: 0.0, flatShading: true,
      map: mortarTexture(),
    }));
  }
  return matCache.get(color);
}

// ---------------------------------------------------------------- decor
// Ground-surface registry: adding a surface kind is a row here, never a code
// change. Draw order is list order (low index paints first, later layers paint
// over it) — `boardwalk` sits after `water` on purpose so the Coney Island pier
// reads as decking over the river. A rect may carry its own `color`, which
// beats the layer default; that is how murals, painted courts, rusted rail beds
// and tinted pavement happen without inventing a layer.
export const DECOR_LAYERS = [
  ['parks', 0x2d5a33],
  ['sand', 0xd9c48a],
  ['plaza', 0x8a8578],
  ['cobbles', 0x5a5560],
  ['sidewalks', 0x676b72],
  ['roads', 0x1c2030],
  ['rail', 0x3a3128],
  ['bikePaths', 0x2a8068],
  ['laneMarkers', 0xd6bd55],
  ['crosswalks', 0xe4e5df],
  ['water', 0x16375e],
  ['boardwalk', 0xb08050],
];
// 12 layers between the ground plane and the hole disc at y 0.01.
const DECOR_Y0 = 0.0012;
const DECOR_DY = 0.0007; // top layer lands at 0.0089

// Decor is merged into ONE geometry with vertex colors: N rects used to be N
// meshes and N draw calls (Upper Manhattan alone ships 253 rects, and per-rect
// color would only have made that worse). The merged mesh does not write depth
// and renders at a fixed renderOrder between the ground and everything else, so
// layer stacking is painter's order from the list above instead of a 0.7 mm
// depth margin — which is what stops the whole ladder z-fighting once the
// SIZE ramp pulls the camera 80 m out.
const GROUND_ORDER = -2;
const DECOR_ORDER = -1;

// ---------------------------------------------------------------- shadows
// The shadow box frames what the CAMERA can see, not the world origin and not
// the hole. The hole is the right centre almost all the time — but Brooklyn
// opens on an establishing shot 194 m up framing a 288 m ground radius, and a
// hole-locked 45 m box covered 2.4% of that hero frame.
//
// Extent is quantised to a x2 ladder rather than eased. Texel size is derived
// from the extent, so a box that resizes every frame moves the snap grid under
// stationary geometry and every shadow edge crawls — exactly the artifact the
// snap exists to prevent. Discrete rungs pop once instead.
//   45 m -> 0.088 m/texel  chase distance; three texels per 0.25 m brick
//   90 m -> 0.176 m/texel
//  180 m -> 0.352 m/texel  covers all of Brooklyn (127 m half-diagonal), and at
//                          194 m altitude one screen pixel is ~0.38 m anyway, so
//                          this is texel-per-pixel, not a compromise.
//
// The ladder is stateful, not a pure function of the framed radius. A pure one
// makes the two thresholds coincide, so a camera parked ON a rung boundary
// flips 45<->90 every frame and the texel size halves and doubles at frame
// rate — a strobe, strictly worse than the crawl. Measured: 57 flips in 120
// frames with 0.5 m of camera jitter. So grow the moment the frame outruns the
// box, but shrink only once the frame sits comfortably inside the rung below.
const SHADOW_EXTENT_MIN = 45;
const SHADOW_EXTENT_MAX = 180;
const SHADOW_MARGIN = 1.15; // tall casters just outside the frame still cast in
const SHADOW_SHRINK_AT = 0.425; // of current extent: half a rung, less 15% deadband
const SHADOW_MAP_SIZE = 1024;
// The light must sit far enough back that the far corner of the box is still in
// front of the near plane; at ±180 a fixed 120 m offset clips a third of it.
const shadowDistFor = (e) => e * 1.6 + 90;
// Direction is the original sun vector; only the length changes, so the lighting
// is byte-identical and only the shadow box travels.
const SUN_DIR = new THREE.Vector3(30, 50, 20).normalize();
const ZERO3 = new THREE.Vector3(0, 0, 0);

// ---------------------------------------------------------------- ambient
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const ONE3 = new THREE.Vector3(1, 1, 1);
const Q_ID = new THREE.Quaternion();

const GULL_KIT = {
  body: new THREE.Vector3(0.38, 0.15, 0.17),
  rootY: 0.03, rootZ: 0.05,
  wingL: null, wingR: null, // filled below
};
const PIGEON_KIT = {
  body: new THREE.Vector3(0.3, 0.2, 0.18),
  rootY: 0.02, rootZ: 0.05,
  wingL: null, wingR: null,
};
function buildWings(kit, len, thick, chord) {
  const mk = (side) => new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, side * len * 0.5), Q_ID, new THREE.Vector3(chord, thick, len)
  );
  kit.wingL = mk(1);
  kit.wingR = mk(-1);
}
buildWings(GULL_KIT, 0.3, 0.045, 0.22);
buildWings(PIGEON_KIT, 0.2, 0.05, 0.2);

const STEAM_LIFE = 3.4;
const WAKE_PER_FERRY = 5;
const SURF_BANDS = 2;

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number.isFinite(v) ? v : dflt);
  return Math.max(lo, Math.min(hi, n));
}
function num(v, dflt) { return Number.isFinite(v) ? v : dflt; }

// ------------------------------------------------ derived ambient placement
// Ambient sites authored as literal coordinates rot. The city gets re-authored
// underneath them and the gull that circled the harbour ends up circling a
// warehouse — silently, because nothing validates a coordinate against the
// scene it was written for. Deriving sites from the decor registry and the
// block field instead means ambient life follows the city whenever it moves.
//
// Deliberately DETERMINISTIC. Jitter is seeded from a hash of the geometry that
// produced the site, so the same city always places life identically — which is
// what makes the result reviewable and pixel-diffable — while any real edit to
// the scene reseeds it and the life moves with it.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rectW = (r) => Math.max(0, num(r.w, 0));
const rectD = (r) => Math.max(0, num(r.d, 0));
const rectArea = (r) => rectW(r) * rectD(r);
// Rects are corner-anchored everywhere in the decor registry, so centre them
// once here rather than at every call site.
const rectCX = (r) => num(r.x, 0) + rectW(r) / 2;
const rectCZ = (r) => num(r.z, 0) + rectD(r) / 2;
const rectKey = (r) => `${num(r.x, 0)},${num(r.z, 0)},${rectW(r)},${rectD(r)}`;
// Overlap of two intervals, negative when they are apart. Used both to find
// shorelines (water meeting sand) and frontages (building meeting pavement).
const overlap1d = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
function rectsFrom(decor, keys) {
  const out = [];
  if (!decor) return out;
  for (const k of keys) {
    const list = decor[k];
    if (!Array.isArray(list)) continue;
    for (const r of list) if (r && rectArea(r) > 0) out.push(r);
  }
  return out;
}
// Biggest first, then by position, so the pick is stable when two rects tie on
// area — otherwise the scene's array order silently decides placement.
function byAreaThenPos(a, b) {
  const d = rectArea(b) - rectArea(a);
  return d !== 0 ? d : (num(a.x, 0) - num(b.x, 0)) || (num(a.z, 0) - num(b.z, 0));
}

// ---------------------------------------------------------------- ground
// The ground was a hardcoded 240 x 240 plane at the world origin, which is a
// constant pretending to be a measurement. It broke in both directions at once:
// Upper Manhattan is 134 x 265 m, so 6,257 blocks (8.5% of the scene) stood
// PAST the north rim with nothing but sky behind them and the world ended in a
// hard cut; and everywhere the plane overshot the built city, its own rim read
// from a low camera as a slab hovering beside the level.
//
// Size and centre it on what the scene actually contains, then push the rim a
// full far-plane past that. CAM_FAR is 600 m (camera.js:11), so from any camera
// standing over the content the rim is at or beyond the frustum's back wall in
// every direction: there is no camera pose the game can reach where the edge is
// in frame. What the player sees at the horizon is ground meeting sky.
// Cost is two triangles either way.
const GROUND_MARGIN = 600;
function contentExtent(sim) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const grow = (x0, x1, z0, z1) => {
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
    if (z0 < minZ) minZ = z0;
    if (z1 > maxZ) maxZ = z1;
  };
  for (const b of sim.blocks) {
    const h = num(b.s, 1) / 2;
    grow(b.x - h, b.x + h, b.z - h, b.z + h);
  }
  // Decor rects can reach past the block field (a river, a beach, a park edge
  // with nothing built on it), and they are the surface the player reads as the
  // world — ground has to be under all of it.
  const decor = sim.sceneDecor;
  if (decor) {
    for (const [key] of DECOR_LAYERS) {
      const list = decor[key];
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        if (!r) continue;
        const x = num(r.x, 0), z = num(r.z, 0);
        grow(x, x + rectW(r), z, z + rectD(r));
      }
    }
  }
  // Wherever the hole is allowed to go, the player will stand — even if the
  // city stops short of it.
  const br = sim.boundsRect;
  if (br) grow(num(br.minX, 0), num(br.maxX, 0), num(br.minZ, 0), num(br.maxZ, 0));
  else { const b = num(sim.bounds, 24); grow(-b, b, -b, b); }
  if (!Number.isFinite(minX)) return { cx: 0, cz: 0, w: 240, d: 240 };
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

// ---------------------------------------------------------------- mortar
// Blocks used to be drawn at 95% of their cell so the 5 cm shortfall read as a
// mortar course. That gap is a real hole through the model: a wall is one block
// thick, so at whatever screen row the eye ray runs level it threads the gap in
// every wall in the scene at once and the background shows through as a slot
// spanning the whole frame (measured: rays at row 160 hit nothing at any x,
// while rows 155 and 170 hit walls normally). It is not a scene bug — every
// scene renders through this path.
//
// Blocks now fill their cell exactly, so neighbours meet and nothing sees
// through, and the course line is PAINTED instead: a dark border in face-UV
// space. Two touching faces each contribute their border, so the drawn line is
// ~4.7% of a block against the 5% the gap used to be — the same look, in the
// same place, at the same proportion for every brick size, with no hole in it.
const MORTAR_TEX_N = 128;
const MORTAR_BORDER = 3;   // texels per face edge -> 2.34% of a face
const MORTAR_DARK = 0.46;  // multiplier at the outermost texel
let mortarTex = null;
function mortarTexture() {
  if (mortarTex) return mortarTex;
  const n = MORTAR_TEX_N;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const edge = Math.min(x, y, n - 1 - x, n - 1 - y);
      // Ramp rather than a step: a hard 1-texel line aliases into a crawling
      // dotted seam once the SIZE ramp pulls the camera 80 m out.
      const f = edge >= MORTAR_BORDER
        ? 1
        : MORTAR_DARK + (1 - MORTAR_DARK) * (edge / MORTAR_BORDER);
      const v = Math.round(f * 255);
      const i = (y * n + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  mortarTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  // A multiplier, not a colour: sRGB-decoding it would drive the line far
  // darker than the gap it replaces.
  mortarTex.colorSpace = THREE.NoColorSpace;
  mortarTex.wrapS = THREE.ClampToEdgeWrapping;
  mortarTex.wrapT = THREE.ClampToEdgeWrapping;
  mortarTex.magFilter = THREE.LinearFilter;
  mortarTex.minFilter = THREE.LinearMipmapLinearFilter;
  mortarTex.generateMipmaps = true;
  mortarTex.anisotropy = 4; // the line is read at grazing angles almost always
  mortarTex.needsUpdate = true;
  return mortarTex;
}

export class VoxelWorld3D {
  // The third parameter is a SKIN ID, not a colour. A colour is a lossy key —
  // two registry rows may legitimately share a rim hex, and resolving back
  // through it would silently pick whichever came first (see js/skins.js).
  constructor(canvas, sim, skinId = 'classic', opts = {}) {
    this.sim = sim;
    this.time = 0;
    this._disposed = false;
    liveWorlds++;
    const saved = savedSettings();

    // The shadow pass redraws every casting bucket a second time, so it is the
    // one real performance lever a player on a weak machine has — and Brooklyn
    // (~39k blocks) is exactly where they will reach for it. Resolved BEFORE the
    // renderer so the first frame already honours the setting; `startVoxelSandbox`
    // constructs with no options object, so the persisted value is the mechanism
    // and `setShadows` below is the live-update path.
    this.shadows = 'shadows' in opts ? !!opts.shadows : pref(saved, 'shadows', true);
    // Device-tier overlay (js/quality.js). Null/true here means "no tier has
    // spoken yet", which is exactly the pre-tier behaviour — `setQuality` is the
    // only thing that ever narrows these.
    this._settingShadows = this.shadows;
    this._tierShadows = true;
    this._tierDprCap = null;
    this._tierAmbient = null;
    // Performance Mode, renderer half — resolved here for the same reason, so
    // the first frame already honours it. See setPerfMode for what it buys.
    this.perfMode = 'perfMode' in opts ? !!opts.perfMode : pref(saved, 'perfMode', false);
    // Meshes that participate in shadows, with their INTENDED flags — ambient
    // movers are deliberately absent, so re-enabling never switches them on.
    this._shadowMeshes = [];

    // The voxel scene is already flat-shaded; multisampling is expensive on
    // software/low-power WebGL and adds little to this art style.
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this._wantPixelRatio());
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // A facade is read at a grazing angle almost always, which is exactly the
    // case trilinear filtering blurs into mush. Asked for once here rather than
    // per texture; surfaces clamp it to 8 (js/voxelsurfaces.js), which is where
    // the visible return flattens out.
    this._maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1f3d);
    // Sizing the ground to the scene (contentExtent) means the world no longer
    // ends at the plane's rim — but the FAR PLANE still cuts the ground, and
    // from a chase camera that cut lands a degree or two below the true horizon
    // as a faint straight line with sky above it. Fog the last stretch before
    // the clip to exactly the background colour and the cut has nothing left to
    // show: the ground is already sky-coloured by the time it is clipped.
    //
    // The band is re-derived from the camera's own far plane every frame in
    // render(), never fixed. The far plane is 600 m in play but the level intro
    // stretches it to fit the whole city in one shot, and a fixed band would
    // then sit in the MIDDLE of that shot and grey out half the establishing
    // frame. Riding the far plane, the fog only ever eats what was about to be
    // clipped anyway. Mutating near/far is a uniform update; the object itself
    // must survive, because swapping the fog on or off recompiles every
    // material in the scene.
    this.scene.fog = new THREE.Fog(0x1a1f3d, 1, 2);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3f5c, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.castShadow = this.shadows;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sun.shadow.camera.near = 1;
    // Depth bias, tuned against the 0.25 m bricks (railings, cables, kerbs) —
    // acne and peter-panning both show up on the smallest geometry first.
    // normalBias is well under a quarter-brick, so nothing detaches from its
    // caster at this scale.
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this._sun = sun;
    this.scene.add(sun);
    // A DirectionalLight aims at its target's WORLD matrix; an unparented target
    // never gets one updated, so moving the box would silently do nothing.
    this.scene.add(sun.target);
    // Rotation-only basis of the light's view, for the texel snap below. Depends
    // on the sun DIRECTION only, so resizing the box never invalidates it.
    this._shadowRot = new THREE.Matrix4().lookAt(SUN_DIR, ZERO3, AXIS_Y);
    this._shadowRotInv = new THREE.Matrix4().copy(this._shadowRot).invert();
    this._shadowCentre = new THREE.Vector3();
    this._shadowFwd = new THREE.Vector3();
    this._sunOffset = new THREE.Vector3();
    this._shadowExtent = 0;
    this._setShadowExtent(SHADOW_EXTENT_MIN);
    this._followShadow();

    // Ambient motion is decoration; a player who asked the OS (or the in-game
    // SETTINGS toggle) for less of it gets the scene posed, not animated.
    // Both sources are read HERE, at construction — that is the mechanism, and
    // it needs nothing from main.js. `setReducedMotion` below is a live-update
    // nicety on top, and main.js must call it guarded
    // (`world.setReducedMotion && ...`): the campaign renderer has no such
    // method, and an unguarded call there throws and silently kills the rest of
    // applySettings (see the setShadows guard at main.js:95).
    this._osReduced = false;
    this._mq = null;
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        this._mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        this._osReduced = !!this._mq.matches;
        this._onMq = (e) => { this._osReduced = !!e.matches; this._syncReducedMotion(); };
        if (this._mq.addEventListener) this._mq.addEventListener('change', this._onMq);
      }
    } catch (e) { /* no matchMedia (headless/older) — fall through */ }
    this._settingReduced = 'reducedMotion' in opts
      ? !!opts.reducedMotion
      : pref(saved, 'reducedMotion', false);
    this.reducedMotion = this._osReduced || this._settingReduced;
    // Ambient life freezes for either reason; they are separate settings with
    // the same consequence for the ambient tick.
    this._ambientFrozen = this.reducedMotion || this.perfMode;
    this._ambientPosed = false;

    this._ownedGeos = [];
    this._ownedMats = [];
    this._ambientMeshes = [];

    // Sized and centred on the scene, not on a constant — see contentExtent.
    const ext = contentExtent(sim);
    this.groundExtent = ext;
    const gw = ext.w + GROUND_MARGIN * 2, gd = ext.d + GROUND_MARGIN * 2;
    // Segmented, not one giant quad. Depth is interpolated across a triangle
    // from its vertices, and a single quad 1.3 km on a side has a w range wide
    // enough that the interpolated depth in the middle of it drifts by more
    // than the 1.2 mm the first decor layer sits above the ground — which made
    // the park, the roads and the pavements wink out at mid distance the moment
    // the plane got big. ~64 m cells keep the interpolation honest for a few
    // hundred triangles, which is free.
    const seg = (m) => Math.max(1, Math.min(48, Math.round(m / 64)));
    const groundGeo = new THREE.PlaneGeometry(gw, gd, seg(gw), seg(gd));
    // Belt and braces on the same problem, and a fix for the pre-existing
    // version of it: the decor layers are decals 1.2-8.9 mm above this surface,
    // a margin no depth buffer can resolve at 100 m. Offsetting the GROUND away
    // from the eye means the decals win by construction at every distance
    // instead of by luck. Blocks are unaffected — they stand above it.
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a2f4c, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4,
    });
    this._ownedGeos.push(groundGeo);
    this._ownedMats.push(groundMat);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ext.cx, 0, ext.cz);
    ground.renderOrder = GROUND_ORDER;
    this._registerShadow(ground, false, true);
    this.ground = ground;
    this.scene.add(ground);

    this.decorMesh = null;
    this.decorRectCount = 0;
    if (sim.sceneDecor) this._buildDecor(sim.sceneDecor);

    // Hole Mesh
    //
    // The void disc is unchanged and always will be: it is the gameplay-legible
    // part, the thing the player reads as "here is where the city goes". What
    // used to sit on top of it was one flat tinted ring; that is now whatever
    // js/skins.js builds for the equipped id, which may be a rim, a set of
    // teeth, or an eyelid. The skin owns everything above y=0.01 and scales
    // itself by hole radius, so nothing here has to know which it got.
    this.holeMesh = new THREE.Group();
    const disc = new THREE.Mesh(circleGeo(), new THREE.MeshBasicMaterial({ color: 0x06060c }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    this.skin = makeSkin(skinId);
    this.holeMesh.add(disc, this.skin.local);
    this.holeMesh.userData = { disc };
    this._ownedMats.push(disc.material);
    this.scene.add(this.holeMesh);
    // Coins are gameplay objects owned by the pure sim; this tiny render layer
    // only mirrors their collected flag. Flat gold discs stay legible from the
    // high establishing shot without adding a texture or a draw-call per coin.
    this.coinMeshes = new Map();
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x6b4700, emissiveIntensity: 0.35, roughness: 0.32 });
    this._ownedGeos.push(coinGeo); this._ownedMats.push(coinMat);
    for (const coin of sim.coins || []) {
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.position.set(coin.x, 0.16, coin.z);
      mesh.castShadow = false; mesh.receiveShadow = false;
      this.coinMeshes.set(coin.id, mesh); this.scene.add(mesh);
    }
    // Marks a skin lays on the GROUND (Attribution's touchpoints, Compounding's
    // trail) must stay where they were laid, so they are parented to the scene
    // and not to the hole. Empty for most skins; the group costs nothing.
    this.scene.add(this.skin.world);

    // One InstancedMesh per material × block size; paint rides in
    // instanceColor. Nothing here enumerates legal brick sizes — the bucket key
    // is whatever `b.s` says, so 2 m bricks cost one more bucket and nothing
    // else.
    //
    // SURFACES ride on this key for free. `sim.sceneSurfaces` maps a matType to
    // a registry id (js/voxeltiles.js), and because surface is a function of
    // matType, prefixing the key adds NO partitions: brick:1 and
    // mat_brick_red:brick:1 are the same set of blocks. Measured on Brooklyn —
    // 26 buckets before, 26 after, 52 real GL draws either way. That is why
    // there is no atlas here: an atlas exists to collapse draw calls a
    // per-surface split would create, and this split creates none.
    //
    // An unknown id is ignored rather than honoured, so a typo in a scene
    // degrades to today's look instead of silently doubling the bucket count.
    //
    // SEAM, deliberately not built — per-BLOCK surface override. Today surface
    // is a function of matType alone, which is what makes the bucket split free.
    // A per-block override (a 7th positional argument on voxelsim's _block, or a
    // `b.surface` field) would let one steel crane be corroded while the rest of
    // the steel is not. `surfOf` is the single place that would change: read
    // `b.surface` first, fall back to the matType map. TRIGGER: a scene needs
    // two different surfaces on the SAME matType. Until then the override would
    // cost a bucket per variant and buy nothing, because a scene that wants a
    // different surface can already declare a different matType.
    //
    // SEAM, deliberately not built — WebGL2 texture array. Would collapse all
    // surfaced buckets into one draw by moving the surface id into a per-instance
    // attribute and the tiles into a 2D array texture. TRIGGER: distinct
    // materials exceeding the 12-material mobile cap, or a scene where surface
    // must vary per block (above) and the bucket split therefore stops being
    // free. Measured today: 26 buckets surfaced vs 26 unsurfaced, 52 GL draws
    // either way, so it would collapse nothing that is not already collapsed.
    const surfaceMap = sim.sceneSurfaces || null;
    const surfOf = (b) => {
      if (!surfaceMap) return null;
      const id = surfaceMap[b.matType];
      return isSurface(id) ? id : null;
    };
    this.imMeshes = [];
    this._surfaced = false;
    const byMat = new Map();
    for (const b of sim.blocks) {
      // Paint belongs in instanceColor; batching only by physical material
      // and brick size keeps a detailed city from turning every paint variant
      // into another draw call.
      const surf = surfOf(b);
      const k = (surf ? surf + ':' : '') + b.matType + ':' + b.s;
      if (!byMat.has(k)) byMat.set(k, { surf, size: b.s, list: [] });
      byMat.get(k).list.push(b);
    }
    const boxG = boxGeo();
    const white = new THREE.Color(1, 1, 1);
    const tmpColor = new THREE.Color();
    for (const bucket of byMat.values()) {
      const { surf, size, list } = bucket;
      // The unsurfaced branch is the SAME expression it has always been, reached
      // by the same path, so a scene that declares nothing builds a
      // byte-identical frame. Proven by framebuffer hash at three poses per
      // scene, not asserted.
      let bMat;
      if (surf) {
        bMat = surfaceMaterial(surf, size, this._maxAnisotropy, this.renderer);
        this._surfaced = true;
      } else {
        bMat = mat(0xffffff);
      }
      const im = new THREE.InstancedMesh(boxG, bMat, list.length);
      this._registerShadow(im, true, true);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      list.forEach((b, i) => {
        b._im = im; b._imIndex = i; b._imHidden = false; b._imTinted = false;
        b._renderMatrixReady = false;
        b._renderDamage = -1;
        im.setColorAt(i, tmpColor.setHex(b.color));
        b._renderBaseColor = b.color;
      });
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor.needsUpdate = true;
      // Partial re-uploads: a 30k-instance bucket is a 1.9 MB matrix buffer, and
      // a localized collapse touches a handful of contiguous instances. Track
      // the dirty span per frame instead of re-sending the whole array.
      im.userData.mLo = 0; im.userData.mHi = -1;
      im.userData.cLo = 0; im.userData.cHi = -1;
      // The dirty indices themselves, so the flush can upload runs instead of
      // one span from the lowest to the highest — see _flushRange.
      im.userData.mIdx = []; im.userData.cIdx = [];
      this.scene.add(im);
      this.imMeshes.push(im);
    }

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._white = white;
    this.particles = [];
    this._dirtyM = new Set();
    this._dirtyC = new Set();
    // Render active set — see the long note above update()'s block pass.
    this._visitStamp = 0;      // per-frame dedup: the union below overlaps heavily
    this._active = [];         // blocks that WROTE last frame (carried one more frame)
    this._activeNext = [];     // double-buffered so neither is reallocated per frame
    this._fullPass = true;     // frame 1 uploads every block's matrix for the first time

    // Ambient scratch — allocated once, reused every frame. Nothing in the
    // ambient update path may call `new`.
    this._aFrame = new THREE.Matrix4();
    this._aLocal = new THREE.Matrix4();
    this._aOut = new THREE.Matrix4();
    this._aq = new THREE.Quaternion();
    this._aq2 = new THREE.Quaternion();
    this._av = new THREE.Vector3();
    this._av2 = new THREE.Vector3();
    this._as = new THREE.Vector3();
    this._ac = new THREE.Color();
    this._ac2 = new THREE.Color();

    this.ambient = null;
    // Authored sites that had gone stale against the current decor and were
    // re-placed. Empty is the healthy state; a growing list is the scene and its
    // ambient life drifting apart.
    this.ambientRepairs = [];
    this._buildAmbient(sim.sceneAmbient);

    if (typeof window !== 'undefined') window.__voxelWorld = this; // debug hook
  }

  // ------------------------------------------------------------ decor build
  _buildDecor(decor) {
    const rects = [];
    for (let i = 0; i < DECOR_LAYERS.length; i++) {
      const [key, layerColor] = DECOR_LAYERS[i];
      const list = decor[key];
      if (!list || !list.length) continue;
      const y = DECOR_Y0 + i * DECOR_DY;
      for (const r of list) {
        if (!r) continue;
        rects.push({ r, y, color: Number.isFinite(r.color) ? r.color : layerColor });
      }
    }
    this.decorRectCount = rects.length;
    if (!rects.length) return;

    const n = rects.length;
    const pos = new Float32Array(n * 18);
    const nor = new Float32Array(n * 18);
    const col = new Float32Array(n * 18);
    const c = new THREE.Color();
    let o = 0;
    for (let i = 0; i < n; i++) {
      const { r, y, color } = rects[i];
      const x0 = r.x, x1 = r.x + r.w, z0 = r.z, z1 = r.z + r.d;
      // Wound so the face normal is +y: (x0,z0)-(x1,z1)-(x1,z0) and
      // (x0,z0)-(x0,z1)-(x1,z1).
      const vx = [x0, x1, x1, x0, x0, x1];
      const vz = [z0, z1, z0, z0, z1, z1];
      // setHex converts sRGB -> linear working space, exactly like
      // MeshStandardMaterial({ color }) did, so merged decor matches the old
      // per-mesh look pixel for pixel.
      c.setHex(color);
      for (let k = 0; k < 6; k++) {
        pos[o] = vx[k]; pos[o + 1] = y; pos[o + 2] = vz[k];
        nor[o] = 0; nor[o + 1] = 1; nor[o + 2] = 0;
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        o += 3;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    // metalness 0.0 — asphalt, sand, grass, cobbles and painted lane markers are
    // all dielectrics. See the note on mat() above; the same tenth of the
    // diffuse was being discarded here.
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.8, metalness: 0.0, flatShading: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, m);
    this._registerShadow(mesh, false, true);
    mesh.renderOrder = DECOR_ORDER;
    this._ownedGeos.push(geo);
    this._ownedMats.push(m);
    this.decorMesh = mesh;
    this.scene.add(mesh);
  }

  // ---------------------------------------------------------- ambient build
  _ambientMat(spec) {
    const m = new THREE[spec.basic ? 'MeshBasicMaterial' : 'MeshStandardMaterial'](spec.opts);
    this._ownedMats.push(m);
    return m;
  }

  _ambientMesh(geo, material, count, withColor) {
    const im = new THREE.InstancedMesh(geo, material, count);
    im.castShadow = false;
    im.receiveShadow = false;
    // Ambient movers roam well past the bounding sphere three.js computes once
    // from their first pose; culling them would pop birds out of the sky.
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (withColor) {
      const c = this._ac.setRGB(1, 1, 1);
      for (let i = 0; i < count; i++) im.setColorAt(i, c);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor.needsUpdate = true;
    }
    this.scene.add(im);
    this._ambientMeshes.push(im);
    return im;
  }

  // ---------------------------------------------------- derived ambient sites
  // Each deriver returns sites in exactly the shape the matching _init* already
  // consumes, so nothing downstream needs to know where a site came from.
  // Strictly read-only against the sim: decor rects and block positions in,
  // nothing out.

  _decor() { return this.sim && this.sim.sceneDecor ? this.sim.sceneDecor : null; }

  // One coarse grid over the block field, shared by the derivers that need to
  // know where the buildings are. The cell is about a street width, so a cell is
  // usually either building or open rather than a mix of both.
  _blockGrid(cell) {
    const g = new Map();
    const blocks = (this.sim && this.sim.blocks) || [];
    for (const b of blocks) {
      if (!b) continue;
      const gx = Math.floor(b.x / cell), gz = Math.floor(b.z / cell);
      const k = gx + ',' + gz;
      let e = g.get(k);
      if (!e) { e = { gx, gz, top: 0, n: 0, ind: 0 }; g.set(k, e); }
      const top = b.y + b.s / 2; // b.y is the block CENTRE, not its base
      if (top > e.top) e.top = top;
      e.n++;
      if (b.matType === 'steel' || b.matType === 'concrete') e.ind++;
    }
    return g;
  }

  // Tallest thing standing within `reach` metres of a point. Used to decide
  // whether a patch of pavement has a building on it worth lighting or venting
  // beside, without needing the scene to say so.
  _massNear(grid, cell, x, z, reach) {
    const r = Math.max(1, Math.ceil(reach / cell));
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    let top = 0, ind = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const e = grid.get((gx + dx) + ',' + (gz + dz));
        if (!e) continue;
        if (e.top > top) top = e.top;
        if (e.ind > ind) ind = e.ind;
      }
    }
    return { top, ind };
  }

  // Gulls circle over open water. One flock per water rect, biggest first, with
  // radius and population taken from the rect — so a dock basin gets a pair of
  // birds and the harbour gets a wheeling crowd, without either being named.
  _deriveGulls(o) {
    const rects = rectsFrom(this._decor(), ['water']).sort(byAreaThenPos);
    const sites = [];
    for (const r of rects.slice(0, clampInt(o.sites, 1, 12, 4))) {
      const rnd = mulberry32(hash32('gull' + rectKey(r)));
      const short = Math.min(rectW(r), rectD(r));
      // Population tracks the square root of AREA, so splitting one bay into two
      // rects does not double the birds over it.
      sites.push({
        x: rectCX(r) + (rnd() - 0.5) * short * 0.2,
        z: rectCZ(r) + (rnd() - 0.5) * short * 0.2,
        r: Math.max(6, Math.min(20, short * 0.42)),
        y: 11 + rnd() * 11,
        count: clampInt(Math.sqrt(rectArea(r)) * 0.55, 3, 13, 6),
        speed: 0.3 + rnd() * 0.18,
      });
    }
    return sites;
  }

  // Pigeons want ground a person would stand on — plazas, parks and the widest
  // pavement. A 2 m sidewalk strip gets skipped, because a flock scattering on
  // one reads as birds standing in the road.
  _derivePigeons(o) {
    const rects = rectsFrom(this._decor(), ['plaza', 'parks', 'sidewalks', 'boardwalk', 'cobbles'])
      .filter((r) => Math.min(rectW(r), rectD(r)) >= 3.5)
      .sort(byAreaThenPos);
    const sites = [];
    for (const r of rects.slice(0, clampInt(o.sites, 1, 20, 6))) {
      const rnd = mulberry32(hash32('pgn' + rectKey(r)));
      const short = Math.min(rectW(r), rectD(r));
      sites.push({
        x: rectCX(r) + (rnd() - 0.5) * short * 0.35,
        z: rectCZ(r) + (rnd() - 0.5) * short * 0.35,
        count: clampInt(Math.sqrt(rectArea(r)) * 1.1, 4, 16, 8),
      });
    }
    return sites;
  }

  // The shoreline, not the water: find a water edge lying within a couple of
  // metres of sand or boardwalk and overlapping it along the shared axis. Foam
  // derived from the BOUNDARY keeps landing on the beach after the beach moves.
  _shorelines() {
    const water = rectsFrom(this._decor(), ['water']);
    const shore = rectsFrom(this._decor(), ['sand', 'boardwalk']);
    const GAP = 3; // how far apart the two may sit and still read as one edge
    const found = [];
    for (const w of water) {
      const wx0 = num(w.x, 0), wx1 = wx0 + rectW(w);
      const wz0 = num(w.z, 0), wz1 = wz0 + rectD(w);
      for (const s of shore) {
        const sx0 = num(s.x, 0), sx1 = sx0 + rectW(s);
        const sz0 = num(s.z, 0), sz1 = sz0 + rectD(s);
        const ox = overlap1d(wx0, wx1, sx0, sx1);
        const oz = overlap1d(wz0, wz1, sz0, sz1);
        // A shoreline runs along whichever axis the two rects share, and the
        // meeting line sits between the facing edges.
        if (ox > 3) {
          for (const [gap, c] of [[sz0 - wz1, (sz0 + wz1) / 2], [wz0 - sz1, (wz0 + sz1) / 2]]) {
            if (gap < -GAP || gap > GAP) continue;
            found.push({ alongX: true, a0: Math.max(wx0, sx0), a1: Math.min(wx1, sx1), c, len: ox });
          }
        }
        if (oz > 3) {
          for (const [gap, c] of [[sx0 - wx1, (sx0 + wx1) / 2], [wx0 - sx1, (wx0 + sx1) / 2]]) {
            if (gap < -GAP || gap > GAP) continue;
            found.push({ alongX: false, a0: Math.max(wz0, sz0), a1: Math.min(wz1, sz1), c, len: oz });
          }
        }
      }
    }
    return found.sort((p, q) => q.len - p.len);
  }

  _deriveSurf(o) {
    const lines = this._shorelines().slice(0, clampInt(o.sites, 1, 6, 2));
    const sites = [];
    for (const L of lines) {
      // Two offset bands per shoreline: one breaking on the sand, one draining
      // back. Different periods keep them from pulsing in lockstep.
      for (const [off, amp, period] of [[-1.6, 2.2, 6.5], [1.4, 1.4, 4.2]]) {
        const long = L.a1 - L.a0, thick = 4.4;
        sites.push(L.alongX
          ? { x: L.a0, z: L.c + off - thick / 2, w: long, d: thick, amp, period }
          : { x: L.c + off - thick / 2, z: L.a0, w: thick, d: long, amp, period });
      }
    }
    return sites;
  }

  // Ferries run the long way across the biggest stretch of water, inset from the
  // ends so they do not surface inside the quay.
  _deriveFerries(o) {
    const rects = rectsFrom(this._decor(), ['water']).sort(byAreaThenPos);
    const sites = [];
    const palette = [0xd96c2c, 0xe8ecf2, 0x4ad9ff];
    const n = clampInt(o.sites, 1, 6, 2);
    for (let i = 0; i < n && i < rects.length * 2; i++) {
      const r = rects[Math.min(i, rects.length - 1)];
      const rnd = mulberry32(hash32('fry' + i + rectKey(r)));
      const alongX = rectW(r) >= rectD(r);
      const long = alongX ? rectW(r) : rectD(r);
      const inset = Math.min(long * 0.12, 14);
      // Offset each route across the channel so two ferries do not share a lane.
      const lane = (rnd() - 0.5) * Math.min(rectW(r), rectD(r)) * 0.5;
      const a0 = (alongX ? num(r.x, 0) : num(r.z, 0)) + inset;
      const a1 = a0 + long - inset * 2;
      const cross = (alongX ? rectCZ(r) : rectCX(r)) + lane;
      const flip = rnd() < 0.5;
      sites.push({
        x0: alongX ? (flip ? a1 : a0) : cross,
        z0: alongX ? cross : (flip ? a1 : a0),
        x1: alongX ? (flip ? a0 : a1) : cross + (rnd() - 0.5) * 6,
        z1: alongX ? cross + (rnd() - 0.5) * 6 : (flip ? a0 : a1),
        color: palette[i % palette.length],
        period: 42 + rnd() * 24,
      });
    }
    return sites;
  }

  // Street steam. The plume rises from y=0.12, so a vent belongs on open ground,
  // not on a roof — but it should be open ground BESIDE an industrial mass, so
  // sample road and plaza rects and keep the cells with steel or concrete over
  // them. Sites are spread by a minimum separation so four vents do not all land
  // on the same block.
  _deriveSteam(o) {
    const CELL = 8;
    const grid = this._blockGrid(CELL);
    const rects = rectsFrom(this._decor(), ['roads', 'plaza', 'cobbles']);
    const cands = [];
    for (const r of rects) {
      const w = rectW(r), d = rectD(r);
      const stepX = Math.max(6, w / 4), stepZ = Math.max(6, d / 4);
      for (let x = num(r.x, 0) + stepX / 2; x < num(r.x, 0) + w; x += stepX) {
        for (let z = num(r.z, 0) + stepZ / 2; z < num(r.z, 0) + d; z += stepZ) {
          const m = this._massNear(grid, CELL, x, z, 10);
          if (m.top < 6 || m.ind < 3) continue;
          cands.push({ x, z, score: m.top + m.ind * 0.4 });
        }
      }
    }
    cands.sort((p, q) => q.score - p.score || p.x - q.x || p.z - q.z);
    const sites = [];
    const want = clampInt(o.sites, 1, 12, 4);
    const MIN_SEP = 16;
    for (const c of cands) {
      if (sites.length >= want) break;
      if (sites.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < MIN_SEP)) continue;
      const rnd = mulberry32(hash32(`stm${Math.round(c.x)},${Math.round(c.z)}`));
      sites.push({ x: c.x, z: c.z, rate: 0.24 + rnd() * 0.3 });
    }
    return sites;
  }

  // Neon is a glow POOL on the pavement at y=0.0093, not a wall sign — so a
  // frontage is a run of pavement with a building standing along one edge of it.
  // Walk each pavement rect's long axis, keep the stretch that has mass beside
  // it, and lay the strip down that stretch.
  _deriveNeon(o) {
    const CELL = 4;
    const grid = this._blockGrid(CELL);
    const rects = rectsFrom(this._decor(), ['sidewalks', 'plaza', 'boardwalk']);
    const palette = [0xff4b3a, 0xffd166, 0xff2e63, 0x4ad9ff, 0xf2c14e, 0x8be04e];
    const runs = [];
    for (const r of rects) {
      const w = rectW(r), d = rectD(r);
      const alongX = w >= d;
      const long = alongX ? w : d, thick = alongX ? d : w;
      if (long < 6) continue;
      const a0 = alongX ? num(r.x, 0) : num(r.z, 0);
      const cross = alongX ? rectCZ(r) : rectCX(r);
      // Sample along the run; a sample is "lit" when something tall stands
      // within a building's depth of the pavement centre-line.
      const STEP = 2;
      let start = -1, best = 0;
      const flush = (end) => {
        if (start < 0) return;
        const len = end - start;
        if (len >= 6) runs.push({ alongX, a0: start, a1: end, cross, thick, len, mass: best });
        start = -1; best = 0;
      };
      for (let t = a0; t <= a0 + long; t += STEP) {
        const x = alongX ? t : cross, z = alongX ? cross : t;
        const m = this._massNear(grid, CELL, x, z, thick / 2 + 5);
        if (m.top >= 3.5) { if (start < 0) start = t; if (m.top > best) best = m.top; }
        else flush(t - STEP);
      }
      flush(a0 + long);
    }
    // Tallest frontage first: the biggest facade is the one worth lighting.
    runs.sort((p, q) => q.mass - p.mass || q.len - p.len);
    const sites = [];
    const want = clampInt(o.sites, 1, 16, 5);
    const MIN_SEP = 18;
    for (const R of runs) {
      if (sites.length >= want) break;
      const cx = R.alongX ? (R.a0 + R.a1) / 2 : R.cross;
      const cz = R.alongX ? R.cross : (R.a0 + R.a1) / 2;
      if (sites.some((s) => Math.hypot(s.x + s.w / 2 - cx, s.z + s.d / 2 - cz) < MIN_SEP)) continue;
      const rnd = mulberry32(hash32(`neon${Math.round(cx)},${Math.round(cz)}`));
      // Cap the strip: a 60 m frontage lit end to end reads as a runway.
      const len = Math.min(R.len, 20);
      const band = Math.min(R.thick * 0.8, 1.6);
      sites.push({
        x: R.alongX ? cx - len / 2 : cx - band / 2,
        z: R.alongX ? cz - band / 2 : cz - len / 2,
        w: R.alongX ? len : band,
        d: R.alongX ? band : len,
        color: palette[Math.floor(rnd() * palette.length)],
        period: 1.1 + rnd() * 3.4,
      });
    }
    return sites;
  }

  // Is (x, z) on any rect of these layers, within a pad? With no decor at all
  // there is nothing to judge against, so the author is left alone.
  _onAny(keys, x, z, pad) {
    const d = this._decor();
    if (!d) return true;
    for (const k of keys) {
      const list = d[k];
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        if (!r) continue;
        const x0 = num(r.x, 0), z0 = num(r.z, 0);
        if (x >= x0 - pad && x <= x0 + rectW(r) + pad
          && z >= z0 - pad && z <= z0 + rectD(r) + pad) return true;
      }
    }
    return false;
  }

  // An authored coordinate is a snapshot of a city that has since been
  // re-authored. Rather than trusting it forever or discarding it, TEST each one
  // against the geometry it depends on and replace only those that have gone
  // stale: a gull still over water keeps its authored spot, a gull now circling
  // a warehouse gets moved to the nearest water. The authored CHARACTER is kept
  // — count, speed, colour, period — and only the position is taken from the
  // derived candidate, so a repair never flattens hand-tuned life into defaults.
  //
  // This is the bridge that makes derivation useful to a scene that still ships
  // literal coordinates: it needs no change in the scene file, and a scene that
  // moves to 'auto' skips it entirely because derived sites are valid by
  // construction. Repairs are recorded on `ambientRepairs` so what moved, and
  // why, is inspectable rather than magic.
  _repairSites(kind, sites, spec) {
    const d = this._decor();
    if (!d || !Array.isArray(sites) || !sites.length) return sites;
    const { keys, pad, pos, at, derive } = spec;
    const stale = [];
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (!s) continue;
      const p = at(s);
      if (!p.every(([x, z]) => this._onAny(keys, x, z, pad))) stale.push(i);
    }
    if (!stale.length) return sites;
    let cand = [];
    try { cand = derive.call(this, { sites: stale.length }) || []; } catch (e) { cand = []; }
    // Nothing better to offer means the layer this life depends on is gone from
    // the scene entirely. Leave the authored site rather than deleting content.
    if (!cand.length) return sites;
    const out = sites.slice();
    for (let k = 0; k < stale.length; k++) {
      const i = stale[k];
      const from = sites[i], to = cand[k % cand.length];
      const fixed = Object.assign({}, from);
      for (const f of pos) if (f in to) fixed[f] = to[f];
      out[i] = fixed;
      this.ambientRepairs.push({ kind, index: i, from: at(from)[0], to: at(fixed)[0] });
    }
    return out;
  }

  // What each layer stands on, and how to find its position. Kept as data so the
  // test and the deriver for a layer can never drift apart.
  //
  // Note the deliberate asymmetry between a deriver and its host test: gulls are
  // PLACED over open water because circling water is the better image, but they
  // are ACCEPTED anywhere on the shore, because a flock authored over the beach
  // is right and moving it would be vandalism. Derive to the best spot, accept
  // any plausible one. Getting this backwards showed up immediately — the first
  // version reported two repairs on the untouched scene, and both were correct
  // authoring my test was too narrow to recognise.
  static get AMBIENT_HOSTS() {
    return {
      gulls: { keys: ['water', 'sand', 'boardwalk'], pad: 4, pos: ['x', 'z'], at: (s) => [[num(s.x, 0), num(s.z, 0)]] },
      pigeons: { keys: ['plaza', 'sidewalks', 'boardwalk', 'parks', 'cobbles'], pad: 3, pos: ['x', 'z'], at: (s) => [[num(s.x, 0), num(s.z, 0)]] },
      surf: {
        keys: ['water', 'sand', 'boardwalk'], pad: 4, pos: ['x', 'z', 'w', 'd'],
        at: (s) => [[num(s.x, 0) + num(s.w, 0) / 2, num(s.z, 0) + num(s.d, 0) / 2]],
      },
      ferries: {
        keys: ['water'], pad: 5, pos: ['x0', 'z0', 'x1', 'z1'],
        at: (s) => [[num(s.x0, 0), num(s.z0, 0)], [num(s.x1, 0), num(s.z1, 0)]],
      },
      steam: { keys: ['roads', 'plaza', 'cobbles', 'sidewalks'], pad: 2, pos: ['x', 'z'], at: (s) => [[num(s.x, 0), num(s.z, 0)]] },
      neon: {
        keys: ['sidewalks', 'plaza', 'boardwalk'], pad: 3, pos: ['x', 'z', 'w', 'd'],
        at: (s) => [[num(s.x, 0) + num(s.w, 0) / 2, num(s.z, 0) + num(s.d, 0) / 2]],
      },
    };
  }

  // A key may be an explicit array of sites — the authored path, whose character
  // is preserved and whose positions are only touched where they have gone stale
  // — or a request to derive: 'auto', a site count, or an options object.
  _resolveAmbient(kind, value, derive) {
    if (Array.isArray(value)) {
      const host = VoxelWorld3D.AMBIENT_HOSTS[kind];
      return host ? this._repairSites(kind, value, Object.assign({ derive }, host)) : value;
    }
    // Only these forms request derivation. Anything else is garbage and is
    // ignored exactly as it was before derivation existed — a malformed value
    // must not conjure life the scene never asked for, which is what a catch-all
    // `else derive({})` would have done for a stray string.
    if (value === 'auto' || value === true) return derive.call(this, {});
    if (Number.isFinite(value)) return derive.call(this, { sites: value });
    if (value && typeof value === 'object') return derive.call(this, value);
    return null;
  }

  _buildAmbient(spec) {
    // 'auto' on the whole block asks for every layer to be derived, which is
    // what a scene still being reshaped wants: no coordinates to go stale.
    if (spec === 'auto') spec = { gulls: 'auto', surf: 'auto', ferries: 'auto', steam: 'auto', neon: 'auto', pigeons: 'auto' };
    if (!spec || typeof spec !== 'object') return;
    const a = {};
    this.ambientRepairs = [];
    try {
      const g = this._resolveAmbient('gulls', spec.gulls, this._deriveGulls);
      if (g && g.length) this._initGulls(a, g);
      const s = this._resolveAmbient('surf', spec.surf, this._deriveSurf);
      if (s && s.length) this._initSurf(a, s);
      const f = this._resolveAmbient('ferries', spec.ferries, this._deriveFerries);
      if (f && f.length) this._initFerries(a, f);
      const v = this._resolveAmbient('steam', spec.steam, this._deriveSteam);
      if (v && v.length) this._initSteam(a, v);
      const n = this._resolveAmbient('neon', spec.neon, this._deriveNeon);
      if (n && n.length) this._initNeon(a, n);
      const p = this._resolveAmbient('pigeons', spec.pigeons, this._derivePigeons);
      if (p && p.length) this._initPigeons(a, p);
    } catch (e) {
      // A malformed ambient payload must never take the level down with it.
      console.warn('[voxelworld] sceneAmbient ignored:', e);
    }
    // Unknown keys are simply not read — a scene may ship anything.
    this.ambient = Object.keys(a).length ? a : null;
  }

  _initGulls(a, list) {
    const birds = [];
    for (const g of list) {
      if (!g) continue;
      const n = clampInt(g.count, 1, 48, 6);
      const rad = Math.max(0.6, num(g.r, 6));
      const spd = Math.max(0.2, num(g.speed, 3));
      for (let i = 0; i < n; i++) {
        const rr = rad * (0.72 + Math.random() * 0.5);
        birds.push({
          cx: num(g.x, 0), cz: num(g.z, 0),
          rad: rr,
          y: num(g.y, 9) + (Math.random() - 0.5) * 2.4,
          w: (spd / rr) * (0.85 + Math.random() * 0.35) * (Math.random() < 0.18 ? -1 : 1),
          ph: Math.random() * Math.PI * 2,
          bob: 0.16 + Math.random() * 0.3,
          bobW: 1.2 + Math.random() * 0.9,
          flapW: 6.5 + Math.random() * 4,
        });
      }
    }
    if (!birds.length) return;
    const mesh = this._ambientMesh(
      boxGeo(),
      this._ambientMat({ opts: { color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true } }),
      birds.length * 3, true
    );
    const body = this._ac, wing = this._ac2;
    for (let i = 0; i < birds.length; i++) {
      body.setHex(Math.random() < 0.25 ? 0xe6ecf5 : 0xffffff);
      wing.setHex(0xdfe7f2);
      mesh.setColorAt(i * 3, body);
      mesh.setColorAt(i * 3 + 1, wing);
      mesh.setColorAt(i * 3 + 2, wing);
    }
    mesh.instanceColor.needsUpdate = true;
    a.gulls = { birds, mesh };
  }

  _initSurf(a, list) {
    const bands = [];
    for (const s of list) {
      if (!s) continue;
      const w = Math.max(0.5, num(s.w, 10));
      const d = Math.max(0.5, num(s.d, 4));
      const alongX = w >= d;
      for (let k = 0; k < SURF_BANDS; k++) {
        bands.push({
          cx: num(s.x, 0) + w / 2,
          cz: num(s.z, 0) + d / 2,
          alongX,
          long: alongX ? w : d,
          band: (alongX ? d : w) * 0.34,
          amp: num(s.amp, (alongX ? d : w) * 0.35),
          period: Math.max(0.5, num(s.period, 5)),
          ph: k / SURF_BANDS,
        });
      }
    }
    if (!bands.length) return;
    // Additive foam: over pale sand it reads as a bright wash, over dark water
    // it glows, and per-instance dimming is the fade as the wave drains back.
    const m = this._ambientMat({
      basic: true,
      opts: {
        color: 0xffffff, transparent: true, opacity: 0.5, vertexColors: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      },
    });
    const mesh = this._ambientMesh(bandQuadGeo(), m, bands.length, true);
    a.surf = { bands, mesh };
  }

  _initFerries(a, list) {
    const boats = [];
    for (const f of list) {
      if (!f) continue;
      const x0 = num(f.x0, 0), z0 = num(f.z0, 0);
      const x1 = num(f.x1, x0 + 20), z1 = num(f.z1, z0);
      boats.push({
        x0, z0, x1, z1,
        color: Number.isFinite(f.color) ? f.color : 0xe8873a,
        period: Math.max(2, num(f.period, 40)),
        ph: Math.random(),
        bobW: 1.1 + Math.random() * 0.5,
      });
    }
    if (!boats.length) return;
    // metalness 0.0. A ferry hull IS steel, but it is PAINTED steel, and paint is
    // a dielectric coating — the metal underneath is not what light hits. 0.05
    // was neither one thing nor the other. See the note on mat() above.
    const hullMesh = this._ambientMesh(
      boxGeo(),
      this._ambientMat({ opts: { color: 0xffffff, roughness: 0.75, metalness: 0.0, flatShading: true } }),
      boats.length * 3, true
    );
    const c = this._ac;
    for (let i = 0; i < boats.length; i++) {
      hullMesh.setColorAt(i * 3, c.setHex(boats[i].color));
      hullMesh.setColorAt(i * 3 + 1, c.setHex(0xf2f4f8));
      hullMesh.setColorAt(i * 3 + 2, c.setHex(0xd8452f));
    }
    hullMesh.instanceColor.needsUpdate = true;
    // Additive wake: instanceColor doubles as the fade ramp, because a dimmer
    // additive quad over dark water IS a fainter wake — no per-instance alpha
    // needed, and it stays one draw call.
    const wakeMesh = this._ambientMesh(
      bandQuadGeo(),
      this._ambientMat({
        basic: true,
        opts: {
          color: 0xffffff, transparent: true, opacity: 0.55, vertexColors: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        },
      }),
      boats.length * WAKE_PER_FERRY, true
    );
    a.ferries = { boats, hullMesh, wakeMesh };
  }

  _initSteam(a, list) {
    const vents = [];
    let total = 0;
    for (const s of list) {
      if (!s) continue;
      const rate = Math.max(0.05, num(s.rate, 0.8));
      const cap = clampInt(rate * STEAM_LIFE + 2, 2, 20, 4);
      const puffs = [];
      for (let i = 0; i < cap; i++) {
        puffs.push({ on: false, age: 0, ox: 0, oz: 0, dx: 0, dz: 0, spin: 0, size: 1 });
      }
      vents.push({ x: num(s.x, 0), z: num(s.z, 0), rate, acc: 0, puffs, base: total });
      total += cap;
    }
    if (!total) return;
    const mesh = this._ambientMesh(
      boxGeo(),
      this._ambientMat({
        basic: true,
        opts: {
          color: 0xffffff, transparent: true, opacity: 0.4,
          blending: THREE.AdditiveBlending, depthWrite: false,
        },
      }),
      total, true
    );
    a.steam = { vents, mesh, total };
  }

  _initNeon(a, list) {
    const signs = [];
    for (const s of list) {
      if (!s) continue;
      signs.push({
        x: num(s.x, 0) + num(s.w, 3) / 2,
        z: num(s.z, 0) + num(s.d, 3) / 2,
        w: Math.max(0.2, num(s.w, 3)),
        d: Math.max(0.2, num(s.d, 3)),
        color: Number.isFinite(s.color) ? s.color : 0xff9d3c,
        period: Math.max(0.3, num(s.period, 2.6)),
        ph: Math.random() * Math.PI * 2,
      });
    }
    if (!signs.length) return;
    const mesh = this._ambientMesh(
      glowQuadGeo(),
      this._ambientMat({
        basic: true,
        opts: {
          color: 0xffffff, transparent: true, opacity: 0.8, vertexColors: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        },
      }),
      signs.length, true
    );
    a.neon = { signs, mesh, warm: new THREE.Color(0xffd9a8) };
  }

  _initPigeons(a, list) {
    const birds = [];
    for (const p of list) {
      if (!p) continue;
      const n = clampInt(p.count, 1, 40, 8);
      const spread = 0.8 + n * 0.14;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * spread;
        const away = Math.random() * Math.PI * 2;
        birds.push({
          hx: num(p.x, 0) + Math.cos(ang) * rr,
          hz: num(p.z, 0) + Math.sin(ang) * rr,
          dx: Math.cos(away), dz: Math.sin(away),
          dist: 3.5 + Math.random() * 4.5,
          flyH: 3.2 + Math.random() * 3.4,
          idleYaw: Math.random() * Math.PI * 2,
          ph: Math.random() * Math.PI * 2,
          alarm: 0,
          grey: Math.random(),
        });
      }
    }
    if (!birds.length) return;
    const mesh = this._ambientMesh(
      boxGeo(),
      this._ambientMat({ opts: { color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true } }),
      birds.length * 3, true
    );
    const c = this._ac, cw = this._ac2;
    for (let i = 0; i < birds.length; i++) {
      const g = birds[i].grey;
      c.setHex(g < 0.12 ? 0xe8ebf0 : g < 0.4 ? 0x9aa2b0 : 0x6b7280);
      cw.copy(c).multiplyScalar(0.82);
      mesh.setColorAt(i * 3, c);
      mesh.setColorAt(i * 3 + 1, cw);
      mesh.setColorAt(i * 3 + 2, cw);
    }
    mesh.instanceColor.needsUpdate = true;
    a.pigeons = { birds, mesh };
  }

  // ------------------------------------------------------------- reduced UX
  // Signature matches ChaseCamera.setReducedMotion (camera.js:39).
  setReducedMotion(val) {
    this._settingReduced = !!val;
    this._syncReducedMotion();
  }

  _registerShadow(mesh, cast, receive) {
    this._shadowMeshes.push({ mesh, cast, receive });
    mesh.castShadow = this.shadows && cast;
    mesh.receiveShadow = this.shadows && receive;
  }

  // Signature matches VoxelWorld3D's campaign counterpart (world3d.js:669) so
  // the existing guarded call at main.js:95 picks it up with no wiring. The
  // construction-time read of the persisted setting is the mechanism; this is
  // the live path.
  setShadows(on) {
    this._settingShadows = !!on;
    this._applyShadows();
  }

  // Effective shadow state = what the player asked for AND what the device tier
  // allows. Split from setShadows so a tier can veto without overwriting the
  // player's preference — otherwise a step down to LOW followed by a step back
  // up would silently switch shadows on for someone who had turned them off.
  _applyShadows() {
    const next = this._settingShadows && this._tierShadows !== false;
    if (next === this.shadows) return; // idempotent: applySettings fires often
    this.shadows = next;
    this.renderer.shadowMap.enabled = next;
    if (this._sun) {
      this._sun.castShadow = next;
      // Drop the depth target when shadows go off — a 1024² render target that
      // nothing samples any more. WebGLShadowMap reallocates it on re-enable,
      // so flipping repeatedly neither leaks nor leaves a stale map bound.
      if (!next && this._sun.shadow.map) {
        this._sun.shadow.map.dispose();
        this._sun.shadow.map = null;
      }
    }
    for (const s of this._shadowMeshes) {
      s.mesh.castShadow = next && s.cast;
      s.mesh.receiveShadow = next && s.receive;
    }
    // Toggling shadowMap.enabled changes the USE_SHADOWMAP define; lit
    // materials must recompile or they keep sampling a map that is gone.
    this.scene.traverse((c) => { if (c.isMesh && c.material) c.material.needsUpdate = true; });
    if (next) this._followShadow(); // the box may be 200 m stale
  }

  // Device pixel ratio the renderer should be running at. Capped at 1.5 in
  // normal play (the art is flat-shaded and gains little above that); pinned to
  // 1 in Performance Mode.
  _wantPixelRatio() {
    if (this.perfMode) return 1;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    // The 1.5 is the no-tier default (js/quality.js's HIGH carries the same
    // number), so a build with no quality wiring behaves exactly as before.
    return Math.min(dpr, this._tierDprCap || 1.5);
  }

  // Signature matches World3D.setPerfMode (world3d.js:429) so the guarded call
  // at main.js:101 picks it up with no wiring. Before this existed the sandbox
  // half of that call hit nothing and Performance Mode was a renderer no-op.
  //
  // Be honest about what it buys and where. The sandbox's frame cost is
  // dominated by the sim, so on a 1x desktop panel this is close to nothing —
  // the renderer is under a millisecond of a frame that can run 300. It is
  // aimed at the machine that actually reaches for the toggle:
  //   * pixel ratio 1.5 -> 1. On a 2x or 3x screen that is 2.25x fewer
  //     fragments for the entire frame, shadow pass included — by a wide margin
  //     the biggest single GPU lever the renderer has. On a 1x panel it is a
  //     no-op by construction, not by accident.
  //   * ambient life (gulls, pigeons, steam, ferries, surf, neon) stops being
  //     re-composed every frame and is posed once, through the same machinery
  //     Reduced Motion already uses.
  // Nothing here touches the block field: culling or LOD-ing 73k instances is a
  // real change with a real look cost, and it belongs in a pass that can prove
  // it, not behind a toggle that silently degrades the city.
  setPerfMode(on) {
    const next = !!on;
    if (next === this.perfMode) return; // idempotent: applySettings fires often
    this.perfMode = next;
    const want = this._wantPixelRatio();
    if (this.renderer.getPixelRatio() !== want) {
      this.renderer.setPixelRatio(want);
      const c = this.renderer.domElement;
      // setSize with updateStyle=false re-derives the drawing buffer from the
      // new ratio; the CSS size of the canvas is main.js's business.
      this.renderer.setSize(c.clientWidth, c.clientHeight, false);
    }
    this._syncReducedMotion();
  }

  // Resize the box and pull the light back to match. Only ever called with a
  // ladder rung, so the texel size is stable between calls and the snap below
  // stays valid.
  _setShadowExtent(e) {
    if (e === this._shadowExtent) return;
    this._shadowExtent = e;
    this._shadowTexel = (e * 2) / SHADOW_MAP_SIZE;
    const d = shadowDistFor(e);
    this._sunOffset.copy(SUN_DIR).multiplyScalar(d);
    const sc = this._sun.shadow.camera;
    sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e;
    // LightShadow.updateMatrices only ever repositions the camera, never
    // reprojects it, so the projection has to be rebuilt here by hand.
    sc.far = d + e * 1.6 + 120;
    sc.updateProjectionMatrix();
  }

  // Frame the shadow box on what the camera can actually see. The centre is the
  // camera's ground-plane look-at point (which at chase distance IS the hole),
  // and the extent is the ladder rung that covers the framed footprint.
  //
  // The centre is quantised to whole shadow-map texels IN LIGHT SPACE: slide the
  // box continuously and the texel grid slides under stationary geometry, so
  // every shadow edge crawls and fizzes. Snapping keeps the grid pinned in world
  // space while the box moves. Read-only against sim.hole and the camera.
  _followShadow(camera) {
    if (!this.shadows || !this._sun) return;
    const c = this._shadowCentre;
    // Default is the extent already in use, not the minimum: a camera that
    // pitches up for a moment loses its ground hit, and slamming back to 45 m
    // and out again is the same strobe the hysteresis below exists to stop.
    let extent = this._shadowExtent || SHADOW_EXTENT_MIN;
    let framed = false;
    if (camera && camera.isPerspectiveCamera) {
      const f = this._shadowFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      // A camera looking at or above the horizon has no ground-plane hit; fall
      // back to the hole rather than projecting to infinity.
      if (f.y < -0.05) {
        const t = camera.position.y / -f.y;
        if (t > 0 && t < 4000) {
          c.copy(camera.position).addScaledVector(f, t);
          c.y = 0;
          // Half-diagonal of the view rectangle where it meets the ground.
          const r = t * Math.tan((camera.fov * Math.PI) / 360)
            * Math.sqrt(1 + camera.aspect * camera.aspect) * SHADOW_MARGIN;
          // Grow immediately, shrink only past the deadband. Both loops run so
          // a teleport can cross several rungs in one frame.
          while (extent < r && extent < SHADOW_EXTENT_MAX) extent *= 2;
          while (extent > SHADOW_EXTENT_MIN && r < extent * SHADOW_SHRINK_AT) extent /= 2;
          framed = true;
        }
      }
    }
    if (!framed) {
      const h = this.sim.hole;
      c.set(h ? h.x : 0, 0, h ? h.z : 0);
    }
    this._setShadowExtent(extent);
    const texel = this._shadowTexel;
    c.applyMatrix4(this._shadowRotInv);
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(this._shadowRot);
    this._sun.target.position.copy(c);
    this._sun.position.copy(c).add(this._sunOffset);
  }

  // Device tier, renderer half (js/quality.js owns the ladder and the watchdog).
  // Three levers, in the order the measurements rank them for a phone: pixel
  // ratio (every fragment in the frame, shadow pass included), the shadow pass
  // itself (a second draw of every casting bucket), and ambient life.
  //
  // Be honest about the last one: gulls, pigeons, ferries, steam and neon are
  // 0.06 ms/frame — 0.4% of CPU on the Boston profile. Freezing them is a
  // rounding error and is included only because it is free once the tier is
  // already down, NOT because it buys anything. The wins on a low tier are the
  // pixel ratio, the debris cap, and the support cadence.
  setQuality(spec) {
    if (!spec) return;
    this._tierDprCap = spec.dpr;
    const want = this._wantPixelRatio();
    if (this.renderer.getPixelRatio() !== want) {
      this.renderer.setPixelRatio(want);
      const c = this.renderer.domElement;
      this.renderer.setSize(c.clientWidth, c.clientHeight, false);
    }
    // A tier can only take shadows AWAY. The player's own "Pretty shadows"
    // toggle is still the ceiling — a tier stepping back up must not switch on
    // something they turned off.
    this._tierShadows = spec.shadows;
    this._applyShadows();
    this._tierAmbient = spec.ambient;
    this._syncReducedMotion();
  }

  _syncReducedMotion() {
    const next = this._osReduced || this._settingReduced;
    const frozen = next || this.perfMode || this._tierAmbient === false;
    if (next === this.reducedMotion && frozen === this._ambientFrozen) return;
    this.reducedMotion = next;
    this._ambientFrozen = frozen;
    this._ambientPosed = false; // re-pose (or resume) on the next update
  }

  // -------------------------------------------------------------- particles
  // Expanding shock wave ring at the hole — growth/combo/milestone juice.
  spawnShockRing(x, z, radius, color = 0x66ccff) {
    const ring = new THREE.Mesh(
      ringGeo(),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    ring.scale.setScalar(radius);
    this.scene.add(ring);
    this.particles.push({ mesh: ring, isRing: true, life: 0.45, maxLife: 0.45, startRadius: radius });
  }

  // Confetti burst of small cubes flying out of the hole — SIZE-level juice.
  // Render-side only; Math.random is allowed here (never in the sim).
  spawnBurst(x, z, radius, color = 0xffd23f) {
    const geo = boxGeo();
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : color, transparent: true,
      }));
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 4 + Math.random() * 5;
      m.position.set(x + Math.cos(a) * radius * 0.6, 0.35, z + Math.sin(a) * radius * 0.6);
      m.scale.setScalar(0.1 + Math.random() * 0.14);
      this.scene.add(m);
      this.particles.push({
        mesh: m, vx: Math.cos(a) * sp, vy: 3.5 + Math.random() * 4, vz: Math.sin(a) * sp,
        vr: (Math.random() - 0.5) * 12, life: 0.75, maxLife: 0.75,
      });
    }
  }

  // ------------------------------------------------------------ ambient tick
  // Body + two flapping wings written into three consecutive instance slots.
  _writeBird(mesh, base, frame, flap, kit) {
    const local = this._aLocal, out = this._aOut;
    local.makeScale(kit.body.x, kit.body.y, kit.body.z);
    out.multiplyMatrices(frame, local);
    mesh.setMatrixAt(base, out);
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      this._av2.set(0, kit.rootY, side * kit.rootZ);
      this._aq2.setFromAxisAngle(AXIS_X, side * flap);
      local.compose(this._av2, this._aq2, ONE3);
      local.multiply(k === 0 ? kit.wingL : kit.wingR);
      out.multiplyMatrices(frame, local);
      mesh.setMatrixAt(base + 1 + k, out);
    }
  }

  _updateAmbient(dt, t) {
    const a = this.ambient;
    if (!a) return;
    if (a.gulls) this._tickGulls(a.gulls, t);
    if (a.surf) this._tickSurf(a.surf, t);
    if (a.ferries) this._tickFerries(a.ferries, t);
    if (a.steam) this._tickSteam(a.steam, dt);
    if (a.neon) this._tickNeon(a.neon, t);
    if (a.pigeons) this._tickPigeons(a.pigeons, dt, t);
  }

  _tickGulls(g, t) {
    const { birds, mesh } = g;
    const frame = this._aFrame, q = this._aq, q2 = this._aq2, v = this._av;
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const ang = b.ph + t * b.w;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      v.set(
        b.cx + ca * b.rad,
        b.y + Math.sin(t * b.bobW + b.ph) * b.bob,
        b.cz + sa * b.rad
      );
      // local +X faces the tangent of the circle
      const dir = b.w < 0 ? -1 : 1;
      q.setFromAxisAngle(AXIS_Y, Math.atan2(-ca * dir, -sa * dir));
      // bank into the turn, with a little wobble on the wingbeat
      q2.setFromAxisAngle(AXIS_X, dir * (-0.42 + Math.sin(t * b.flapW + b.ph) * 0.06));
      q.multiply(q2);
      frame.compose(v, q, ONE3);
      this._writeBird(mesh, i * 3, frame, Math.sin(t * b.flapW + b.ph) * 0.95 + 0.15, GULL_KIT);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _tickSurf(s, t) {
    const { bands, mesh } = s;
    const v = this._av, sc = this._as, c = this._ac;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const phase = (t / b.period + b.ph) * Math.PI * 2;
      const slide = Math.sin(phase);
      const breathe = 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(phase));
      const off = slide * b.amp;
      v.set(b.cx + (b.alongX ? 0 : off), 0.0092, b.cz + (b.alongX ? off : 0));
      sc.set(
        b.alongX ? b.long : b.band * breathe, 1,
        b.alongX ? b.band * breathe : b.long
      );
      this._aOut.compose(v, Q_ID, sc);
      mesh.setMatrixAt(i, this._aOut);
      // foam is brightest as it runs up the sand, thin as it drains back
      const wash = 0.3 + 0.7 * (0.5 + 0.5 * slide);
      c.setRGB(wash, wash * 0.99, wash * 0.97);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  _tickFerries(f, t) {
    const { boats, hullMesh, wakeMesh } = f;
    const frame = this._aFrame, local = this._aLocal, out = this._aOut;
    const q = this._aq, v = this._av, sc = this._as, c = this._ac;
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      const phase = (t / b.period + b.ph) * Math.PI * 2;
      // cosine ping-pong: the boat eases to a stop before it turns around, so
      // the heading flip never snaps
      const u = 0.5 - 0.5 * Math.cos(phase);
      const dir = Math.sin(phase) >= 0 ? 1 : -1;
      const dx = b.x1 - b.x0, dz = b.z1 - b.z0;
      v.set(
        b.x0 + dx * u,
        0.3 + Math.sin(t * b.bobW + b.ph) * 0.06,
        b.z0 + dz * u
      );
      q.setFromAxisAngle(AXIS_Y, Math.atan2(-dz * dir, dx * dir));
      this._aq2.setFromAxisAngle(AXIS_Z, Math.sin(t * b.bobW * 0.7 + b.ph) * 0.05);
      q.multiply(this._aq2);
      frame.compose(v, q, ONE3);

      local.compose(this._av2.set(0, 0, 0), Q_ID, sc.set(2.6, 0.55, 1.1));
      out.multiplyMatrices(frame, local);
      hullMesh.setMatrixAt(i * 3, out);
      local.compose(this._av2.set(-0.25, 0.5, 0), Q_ID, sc.set(1.1, 0.55, 0.8));
      out.multiplyMatrices(frame, local);
      hullMesh.setMatrixAt(i * 3 + 1, out);
      local.compose(this._av2.set(-0.55, 0.95, 0), Q_ID, sc.set(0.3, 0.5, 0.3));
      out.multiplyMatrices(frame, local);
      hullMesh.setMatrixAt(i * 3 + 2, out);

      const len = Math.hypot(dx, dz) || 1;
      const ux = (dx / len) * dir, uz = (dz / len) * dir;
      for (let k = 0; k < WAKE_PER_FERRY; k++) {
        const back = 1.7 + k * 1.35;
        const spread = 1.0 + k * 0.75;
        this._av2.set(v.x - ux * back, 0.0095, v.z - uz * back);
        this._aq2.setFromAxisAngle(AXIS_Y, Math.atan2(-uz, ux));
        sc.set(1.5, 1, spread);
        out.compose(this._av2, this._aq2, sc);
        wakeMesh.setMatrixAt(i * WAKE_PER_FERRY + k, out);
        const fade = (1 - k / WAKE_PER_FERRY) * 0.85;
        c.setRGB(fade, fade * 0.98, fade * 0.95);
        wakeMesh.setColorAt(i * WAKE_PER_FERRY + k, c);
      }
    }
    hullMesh.instanceMatrix.needsUpdate = true;
    wakeMesh.instanceMatrix.needsUpdate = true;
    wakeMesh.instanceColor.needsUpdate = true;
  }

  _tickSteam(s, dt) {
    const { vents, mesh } = s;
    const v = this._av, sc = this._as, c = this._ac, q = this._aq;
    for (const vent of vents) {
      if (dt > 0) {
        vent.acc += dt * vent.rate;
        while (vent.acc >= 1) {
          vent.acc -= 1;
          // Pool is the cap: if every slot is busy the plume simply skips a
          // puff, so steam can never accumulate.
          let slot = -1;
          for (let i = 0; i < vent.puffs.length; i++) if (!vent.puffs[i].on) { slot = i; break; }
          if (slot < 0) break;
          const p = vent.puffs[slot];
          p.on = true; p.age = 0;
          p.ox = (Math.random() - 0.5) * 0.3;
          p.oz = (Math.random() - 0.5) * 0.3;
          p.dx = (Math.random() - 0.5) * 0.5 + 0.18;
          p.dz = (Math.random() - 0.5) * 0.5;
          p.spin = (Math.random() - 0.5) * 1.1;
          p.size = 0.8 + Math.random() * 0.6;
        }
      }
      for (let i = 0; i < vent.puffs.length; i++) {
        const p = vent.puffs[i];
        const idx = vent.base + i;
        if (!p.on) { this._aOut.makeScale(0, 0, 0); mesh.setMatrixAt(idx, this._aOut); continue; }
        p.age += dt;
        if (p.age >= STEAM_LIFE) {
          p.on = false;
          this._aOut.makeScale(0, 0, 0);
          mesh.setMatrixAt(idx, this._aOut);
          continue;
        }
        const k = p.age / STEAM_LIFE;
        const rise = 0.12 + k * 3.1 + k * k * 1.1;
        const w = p.size * (0.26 + k * 0.95);
        v.set(vent.x + p.ox + p.dx * p.age, rise, vent.z + p.oz + p.dz * p.age);
        q.setFromAxisAngle(AXIS_Y, p.spin * p.age);
        sc.set(w, w, w);
        this._aOut.compose(v, q, sc);
        mesh.setMatrixAt(idx, this._aOut);
        // additive: dimming the instance colour IS the fade
        const fade = Math.sin(Math.min(1, k * 3.4) * Math.PI * 0.5) * (1 - k) * 0.9;
        c.setRGB(fade, fade * 0.99, fade);
        mesh.setColorAt(idx, c);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  _tickNeon(n, t) {
    const { signs, mesh, warm } = n;
    const v = this._av, sc = this._as, c = this._ac;
    for (let i = 0; i < signs.length; i++) {
      const s = signs[i];
      const base = 0.5 + 0.5 * Math.sin((t / s.period + s.ph) * Math.PI * 2);
      // a touch of tube flicker keeps it from reading as a smooth LED fade
      const flick = 0.94 + 0.06 * Math.sin(t * 13.7 + s.ph * 3.1);
      const k = (0.45 + 0.55 * base) * flick;
      const breathe = 0.97 + 0.05 * base;
      v.set(s.x, 0.0093, s.z);
      sc.set(s.w * breathe, 1, s.d * breathe);
      this._aOut.compose(v, Q_ID, sc);
      mesh.setMatrixAt(i, this._aOut);
      c.setHex(s.color).lerp(warm, 0.3 * base).multiplyScalar(k);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  _tickPigeons(p, dt, t) {
    const { birds, mesh } = p;
    const h = this.sim.hole;
    const frame = this._aFrame, q = this._aq, q2 = this._aq2, v = this._av;
    const trigger = (h ? h.radius : 1) + 5;
    const trig2 = trigger * trigger;
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (h && dt > 0) {
        const ddx = b.hx - h.x, ddz = b.hz - h.z;
        // per-bird distance staggers the take-off: the near edge of the flock
        // leaves first, the far edge a beat later
        const near = ddx * ddx + ddz * ddz < trig2;
        b.alarm = Math.max(0, Math.min(1, b.alarm + (near ? dt * 3.4 : -dt * 0.5)));
      }
      const al = b.alarm;
      const e = al * al * (3 - 2 * al); // smoothstep: snappy launch, soft landing
      const air = e > 0.015;
      let px = b.hx, pz = b.hz, py = 0.12;
      let yaw = b.idleYaw + Math.sin(t * 0.35 + b.ph) * 0.4;
      let pitch = 0;
      if (air) {
        const swirl = Math.sin(t * 1.3 + b.ph) * 0.6 * e;
        px += b.dx * e * b.dist - b.dz * swirl;
        pz += b.dz * e * b.dist + b.dx * swirl;
        py += e * b.flyH + Math.sin(t * 2.3 + b.ph) * 0.22 * e;
        yaw = Math.atan2(-b.dz, b.dx);
      } else {
        // resting: a tiny hop, and the occasional peck at the pavement
        py += 0.02 * Math.abs(Math.sin(t * 2.1 + b.ph));
        pitch = Math.max(0, Math.sin(t * 0.9 + b.ph * 4) - 0.93) * 8;
      }
      v.set(px, py, pz);
      q.setFromAxisAngle(AXIS_Y, yaw);
      q2.setFromAxisAngle(AXIS_Z, -pitch * 0.7 + e * 0.2 * Math.sin(t * 1.7 + b.ph));
      q.multiply(q2);
      frame.compose(v, q, ONE3);
      const flap = air
        ? Math.sin(t * 15 + b.ph) * 1.15
        : Math.sin(t * 2.6 + b.ph) * 0.07;
      this._writeBird(mesh, i * 3, frame, flap, PIGEON_KIT);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------- skins
  //
  // One reused state object per world — this runs 60 times a second for the
  // life of a level and must not allocate. Everything a skin can read is
  // gathered here so no builder ever reaches into the sim itself; that is what
  // keeps js/skins.js portable between this renderer and the campaign's.
  _skinFrame(dt, h, glow, events) {
    // dispose() releases the skin's GL resources; a frame that arrives after it
    // used to be survivable and should stay that way.
    if (!this.skin) return;
    const st = this._skinState || (this._skinState = {
      t: 0, dt: 0, radius: 1, glow: 0, chain: 0, chainTimer: 0, size: 1, sizeFrac: 0,
      progress: 0, speed: 0, heading: 0, x: 0, z: 0, camDist: 40, reduced: false,
      sectorMass: new Float32Array(16),
    });
    // Neither sim tracks hole velocity, so derive it from the position delta.
    // Only used to scale idle rotation rates, so a divide-by-zero guard and no
    // smoothing is the right amount of machinery.
    if (dt > 0) {
      const dx = h.x - (this._skinPX ?? h.x), dz = h.z - (this._skinPZ ?? h.z);
      st.speed = Math.hypot(dx, dz) / dt;
    }
    this._skinPX = h.x; this._skinPZ = h.z;
    st.t = this.time; st.dt = dt;
    st.radius = h.radius; st.glow = glow;
    st.chain = h.chain; st.chainTimer = h.chainTimer;
    st.size = h.size ?? 1; st.sizeFrac = h.sizeFrac ?? 0;
    st.progress = this.sim.totalMass ? (h.rawMass ?? h.mass ?? 0) / this.sim.totalMass : 0;
    st.x = h.x; st.z = h.z;
    // The player's steering heading, stamped onto the hole by main.js —
    // directional skins (A/B Split's axis, the reduced-motion Impressions
    // head, the Attribution trail) are welded to it. In the sandbox the chase
    // camera follows the same heading, so skin and camera can never disagree
    // about which way is forward.
    st.heading = h.heading || 0;
    // update() runs before the first render(), so keep the last good value
    // rather than letting an undefined reach the far-distance brightness ramp.
    st.camDist = this._skinCamDist ?? st.camDist;
    // The same signal the ambient set already freezes on, so a player who has
    // asked for reduced motion gets one consistent answer across the scene.
    st.reduced = this._ambientFrozen;
    this._skinSectors(h, st.sectorMass);

    // Events BEFORE update: a bite fired afterwards would not be drawn until the
    // next frame, and 16 ms between the crunch and the jaw closing is visible.
    if (events) {
      for (const ev of events) {
        if (ev.type === 'eat') this.skin.onEat(st, ev);
        else if (ev.type === 'growth') this.skin.onGrowth(st, ev.size);
        else if (ev.type === 'milestone') this.skin.onMilestone(st, ev.frac);
      }
    }
    this.skin.update(st);
  }

  // Edible-ish mass per bearing sector, for the two skins that point at things
  // (ICP Radar's blips, Eyeballs' gaze). `cameraBlockers` is the only broad
  // phase already maintained against demolition — a building the player has
  // eaten stops being a blocker — so this reuses it rather than adding one.
  // Every 4th frame: both consumers damp their own response and cannot step.
  _skinSectors(h, out) {
    if ((this._skinSectorTick = (this._skinSectorTick || 0) + 1) % 4 !== 1) return;
    const bl = this.sim.cameraBlockers;
    out.fill(0);
    if (!bl) return;
    // Fixed floor on the range: a radar that only sees 2.9 m at SIZE 1 shows
    // nothing at all, and "what is around me" does not shrink just because the
    // hole is small.
    const R = Math.max(18, h.radius * 2.6), R2 = R * R;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      if (b.h <= 0) continue;                       // demolished; still in the list
      const dx = (b.minX + b.maxX) * 0.5 - h.x, dz = (b.minZ + b.maxZ) * 0.5 - h.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      const s = ((Math.atan2(dz, dx) / (Math.PI * 2) + 1) * 16 | 0) % 16;
      out[s] = Math.min(1, out[s] + b.h * 0.05 * (1 - d2 / R2));
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, events) {
    this.time += dt;
    const h = this.sim.hole;
    this.holeMesh.position.set(h.x, 0, h.z);
    this.holeMesh.userData.disc.scale.setScalar(h.radius);
    for (const ev of events || []) {
      if (ev.type !== 'coin') continue;
      const mesh = this.coinMeshes.get(ev.coin.id);
      if (mesh) { this.scene.remove(mesh); this.coinMeshes.delete(ev.coin.id); }
    }

    // rim glow: builds with combo intensity; blinks when the chain is about
    // to drop (urgency cue)
    let glow = Math.min(0.6, h.chain * 0.05);
    if (h.chainTimer > 0 && h.chainTimer < 0.5 && Math.sin(this.time * 24) > 0) glow = 0.9;
    // Same number as before, one consumer further along: every skin lerps its
    // rim toward white by it, so the combo build-up and the about-to-drop blink
    // read identically on all seventeen rather than only on the flat ring.
    this._skinFrame(dt, h, glow, events);

    // Reduced Motion: pose the ambient set once at t=0 and never touch it
    // again — birds perched, ferry at its berth, signage at a steady glow.
    if (this.ambient) {
      if (this._ambientFrozen) {
        if (!this._ambientPosed) {
          this._poseAmbientStatic();
          this._ambientPosed = true;
        }
      } else {
        this._ambientPosed = false;
        this._updateAmbient(dt, this.time);
      }
    }

    // shock rings: expand + fade; burst cubes: fly, bounce, fade
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const k = Math.max(0, p.life / p.maxLife);
      if (p.isRing) {
        p.mesh.scale.setScalar(p.startRadius * (1 + (1 - k) * 0.8));
        p.mesh.material.opacity = k * 0.9;
      } else {
        p.vy -= 14 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.vr * dt;
        p.mesh.rotation.z += p.vr * dt;
        if (p.mesh.position.y < 0.06 && p.vy < 0) {
          p.mesh.position.y = 0.06;
          p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7;
        }
        p.mesh.material.opacity = k;
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    const matrixMeshes = this._dirtyM;
    const colorMeshes = this._dirtyC;
    matrixMeshes.clear();
    colorMeshes.clear();
    this._syncBlocks(h, matrixMeshes, colorMeshes);
    for (const im of matrixMeshes) this._flushRange(im.instanceMatrix, im.userData, 'mLo', 'mHi', 16, 'mIdx');
    for (const im of colorMeshes) this._flushRange(im.instanceColor, im.userData, 'cLo', 'cHi', 3, 'cIdx');
  }

  // ---------------------------------------------------------- block sync pass
  // This used to be `for (const b of this.sim.blocks)` — 82,894 iterations per
  // frame on Boston to discover that ~108 of them (0.13%) had actually moved.
  // Measured on an RTX 4060 Ti desktop at SIZE 5, so this was never a GPU
  // problem: `world.update` was 4.31 ms/frame with the loop live and 0.094 ms
  // with it swapped out (same build, A/B'd by handing it an empty block array),
  // i.e. the walk WAS 98% of the renderer's frame. Of that, 2.1-2.6 ms was the
  // early-out predicate alone — over half the cost was pure iteration to find
  // out nothing had changed.
  //
  // The pass now visits a UNION of small sets instead. The bar it has to clear
  // is not "visits the same blocks" — it is "produces the same
  // setMatrixAt/setColorAt WRITES", because those are the visual output. Those
  // two differ in exactly one direction and it is the safe one: the old
  // `nearHole` term forced a visit for every block within `radius + 3 m`, but a
  // pristine static block composes to the matrix it already has, so those visits
  // wrote nothing. Dropping them is free, and it is why there is no spatial grid
  // here — the hole's position only matters to blocks that are LEANING, and
  // those are enumerated exactly (`sim._leanSet`).
  //
  // A block's rendered pose or colour is a function of exactly: x/y/z, rotX/rotZ,
  // parentChunk's rotation, `state === 'unstable'` (the creak wobble), damage,
  // `supportRatio < 0.7` together with the hole position (the rim lean), and
  // consumption. Walking every write to those in voxelsim.js:
  //   * position/rotation — only `_stepDebris`, `_stepChunks` and `_pushAxis`
  //     write them, and all three only ever touch a member of `_falling`
  //     (`_pushAxis` moves its second body only when `movableO`, which is only
  //     passed for the awake movers; static and sleeping obstacles never move);
  //   * damage — every write is immediately followed by `_watchDamage`, so a
  //     damaged block is in `_damageBlocks` by construction;
  //   * unstable — `_watchDamage` adds it unconditionally;
  //   * supportRatio — written in one place, `_recalcSupport`, which maintains
  //     `_leanSet` alongside it;
  //   * consumption and the four other EXITS from those sets — `_renderTouch`.
  // Hence the union below is complete. `_renderTouch` is the load-bearing part:
  // main.js runs up to six sim steps per rendered frame, so a block can detach,
  // land, and retire out of `_falling` between two frames — visiting only the
  // live sets would leave it hanging at its last airborne pose.
  //
  // `_active` (blocks that WROTE last frame) is a second belt on those braces:
  // any transition nobody enumerated still self-corrects one frame later,
  // because a block whose write stops being needed composes identically, writes
  // nothing, and drops out. That is what keeps the carry bounded — retired
  // sleepers do not accumulate in it.
  _syncBlocks(h, matrixMeshes, colorMeshes) {
    const sim = this.sim;
    const stamp = ++this._visitStamp;
    const next = this._activeNext;
    next.length = 0;

    if (this._fullPass || sim._renderTouchOverflow) {
      // Frame 1 (nothing has a matrix yet), or the sim ran long enough with no
      // renderer attached to overflow its exit queue.
      this._fullPass = false;
      sim._renderTouchOverflow = false;
      const bl = sim.blocks;
      for (let i = 0; i < bl.length; i++) this._syncBlock(bl[i], h, stamp, next, matrixMeshes, colorMeshes);
    } else {
      const prev = this._active;
      for (let i = 0; i < prev.length; i++) this._syncBlock(prev[i], h, stamp, next, matrixMeshes, colorMeshes);
      const f = sim._falling;
      for (let i = 0; i < f.length; i++) this._syncBlock(f[i], h, stamp, next, matrixMeshes, colorMeshes);
      for (const b of sim._damageBlocks) this._syncBlock(b, h, stamp, next, matrixMeshes, colorMeshes);
      for (const b of sim._leanSet) this._syncBlock(b, h, stamp, next, matrixMeshes, colorMeshes);
    }
    // Drained unconditionally, including on a full pass: leaving entries behind
    // would hand the next frame a queue that is already stale.
    const touch = sim._renderTouch;
    for (let i = 0; i < touch.length; i++) this._syncBlock(touch[i], h, stamp, next, matrixMeshes, colorMeshes);
    touch.length = 0;

    this._activeNext = this._active;
    this._active = next;
  }

  // The body below is the old per-block loop verbatim, minus the `nearHole`
  // term. Keep it that way: any divergence here is a visual change, and the
  // whole point of the active set is that it is lossless.
  _syncBlock(b, h, stamp, next, matrixMeshes, colorMeshes) {
    if (b._rvStamp === stamp) return; // the union overlaps; visit once
    b._rvStamp = stamp;
    if (b.state === 'consumed') {
      if (!b._imHidden) {
        b._imHidden = true;
        this._m4.makeScale(0, 0, 0);
        b._im.setMatrixAt(b._imIndex, this._m4);
        this._dirtyMatrix(b._im, b._imIndex, matrixMeshes);
        next.push(b);
      }
      return;
    }
    let px = b.x, py = b.y, pz = b.z, rx = 0, rz = 0;
    // unstable blocks creak: subtle deterministic wobble while the stress
    // timer counts down (render-side only, sim state untouched)
    if (b.state === 'unstable') {
      const w = Math.sin(this.time * 40 + b.id * 1.7) * 0.02;
      px += w; pz += w * 0.6;
    }
    if (b.parentChunk) { rx = b.parentChunk.rotX; rz = b.parentChunk.rotZ; }
    else { rx = b.rotX; rz = b.rotZ; }
    // weakened rim blocks lean toward the opening before they let go
    if ((b.state === 'static' || b.state === 'unstable') && b.gy === 0 && b.supportRatio < 0.7) {
      const dx = h.x - px, dz = h.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      const lean = (0.7 - b.supportRatio) * 0.6;
      rx += (-dz / d) * lean;
      rz += (dx / d) * lean;
    }
    let wrote = false;
    this._e.set(rx, 0, rz);
    // Static city blocks keep their uploaded matrix. Dynamic debris,
    // leaning rim blocks, and unstable wobble still get recomposed; this is
    // the main CPU win for large hand-authored scenes.
    const matrixChanged = !b._renderMatrixReady ||
      b._renderPx !== px || b._renderPy !== py || b._renderPz !== pz ||
      b._renderRx !== rx || b._renderRz !== rz;
    if (matrixChanged) {
      this._q.setFromEuler(this._e);
      this._v.set(px, py, pz);
      // Blocks fill their cell exactly. The mortar course used to be a
      // physical 5 cm shortfall, which is a see-through slot in a wall one
      // block thick — it is painted now (see mortarTexture), so the seam
      // survives and the hole does not.
      this._s.set(b.s, b.s, b.s);
      this._m4.compose(this._v, this._q, this._s);
      b._im.setMatrixAt(b._imIndex, this._m4);
      b._renderMatrixReady = true;
      b._renderPx = px; b._renderPy = py; b._renderPz = pz;
      b._renderRx = rx; b._renderRz = rz;
      this._dirtyMatrix(b._im, b._imIndex, matrixMeshes);
      wrote = true;
    }

    // damage heat: blocks glow hotter as structural damage accumulates, so
    // players can read WHERE the structure is about to fail — and see the
    // damage linger after the hole moves on
    if (b.damage > 0.03) {
      const t = Math.min(1, b.damage);
      if (b._renderDamage !== b.damage || !b._imTinted) {
        this._c.setRGB(1, 1 - 0.75 * t, 1 - 0.85 * t);
        b._im.setColorAt(b._imIndex, this._c);
        b._imTinted = true;
        b._renderDamage = b.damage;
        this._dirtyColor(b._im, b._imIndex, colorMeshes);
        wrote = true;
      }
    } else if (b._imTinted) {
      b._imTinted = false;
      this._c.setHex(b._renderBaseColor);
      b._im.setColorAt(b._imIndex, this._c);
      b._renderDamage = b.damage;
      this._dirtyColor(b._im, b._imIndex, colorMeshes);
      wrote = true;
    }
    if (wrote) next.push(b);
  }

  _dirtyMatrix(im, i, set) {
    const u = im.userData;
    if (u.mHi < 0) { u.mLo = i; u.mHi = i; } else { if (i < u.mLo) u.mLo = i; if (i > u.mHi) u.mHi = i; }
    u.mIdx.push(i);
    set.add(im);
  }

  _dirtyColor(im, i, set) {
    const u = im.userData;
    if (u.cHi < 0) { u.cLo = i; u.cHi = i; } else { if (i < u.cLo) u.cLo = i; if (i > u.cHi) u.cHi = i; }
    u.cIdx.push(i);
    set.add(im);
  }

  // Upload only the touched instances — as RUNS, not as one span from the lowest
  // dirty index to the highest.
  //
  // The single-span version was measured on Boston at SIZE 5 (real drive, 1131
  // frames): 8.8 flushes/frame uploading 230,712 floats to change 2,856 of them.
  // 80.8x amplification, 901 KB/frame of bufferSubData for 11 KB of new data,
  // worst single span 420,528 floats. The dirty indices ARE clustered — a
  // collapse is local — but two clusters at opposite ends of a 30k-instance
  // bucket make the span between them the whole buffer, and it only takes one
  // stray block to do it.
  //
  // So: sort, coalesce into runs, and merge the cheapest gaps back until the run
  // count fits. Two knobs, both about the fact that a bufferSubData call is not
  // free either — a gap narrower than MIN_GAP instances is cheaper to re-upload
  // than to split around, and MAX_RUNS caps the call count per attribute. The
  // sort is over ~140 indices a frame; it does not show up.
  //
  // The empty-updateRanges fallback is three.js's own "upload everything", which
  // is why the pile-up guard has to stay: an attribute on a mesh that never got
  // drawn accumulates ranges nobody consumed.
  _flushRange(attr, u, loKey, hiKey, stride, idxKey) {
    const lo = u[loKey], hi = u[hiKey];
    u[hiKey] = -1;
    const idx = u[idxKey];
    if (hi < 0) { idx.length = 0; return; }
    if (attr.updateRanges && attr.addUpdateRange) {
      if (attr.updateRanges.length > 24) attr.clearUpdateRanges();
      else if (idx.length === 0) attr.addUpdateRange(lo * stride, (hi - lo + 1) * stride);
      else {
        const MIN_GAP = 32;   // instances; below this, spanning the gap is cheaper than a second call
        const MAX_RUNS = 12;
        idx.sort((a, b) => a - b);
        const runs = this._runsScratch || (this._runsScratch = []);
        runs.length = 0;
        let s = idx[0], e = idx[0];
        for (let i = 1; i < idx.length; i++) {
          const v = idx[i];
          if (v === e) continue;                       // duplicate index (matrix + colour both dirty)
          if (v - e <= MIN_GAP) { e = v; continue; }
          runs.push(s, e);
          s = v; e = v;
        }
        runs.push(s, e);
        // Too many runs: merge across the narrowest gaps first, which is the
        // cheapest possible extra upload per call saved.
        while (runs.length / 2 > MAX_RUNS) {
          let best = 1, bestGap = Infinity;
          for (let i = 1; i * 2 < runs.length; i++) {
            const gap = runs[i * 2] - runs[i * 2 - 1];
            if (gap < bestGap) { bestGap = gap; best = i; }
          }
          runs.splice(best * 2 - 1, 2);   // drop this run's end and the next one's start
        }
        for (let i = 0; i * 2 < runs.length; i++) {
          attr.addUpdateRange(runs[i * 2] * stride, (runs[i * 2 + 1] - runs[i * 2] + 1) * stride);
        }
      }
    }
    idx.length = 0;
    attr.needsUpdate = true;
  }

  // Reduced Motion end state: one pass at t = 0 with no elapsed time, so
  // nothing spawns, nothing drifts, and the update loop skips ambient entirely
  // from then on.
  _poseAmbientStatic() {
    const a = this.ambient;
    if (!a) return;
    if (a.pigeons) for (const b of a.pigeons.birds) b.alarm = 0;
    if (a.steam) {
      // seed a couple of frozen puffs per vent so the manholes still read
      for (const vent of a.steam.vents) {
        vent.acc = 0;
        for (let i = 0; i < vent.puffs.length; i++) {
          const p = vent.puffs[i];
          if (i < 2) {
            p.on = true; p.age = 0.9 + i * 1.1;
            p.ox = (i - 0.5) * 0.12; p.oz = 0; p.dx = 0.05; p.dz = 0;
            p.spin = 0; p.size = 1;
          } else p.on = false;
        }
      }
    }
    this._updateAmbient(0, 0);
  }

  // The shadow box is framed here, not in update(), because this is where the
  // camera is. main.js renders on every path including the one that holds the
  // READY gate, so the establishing shot is covered too.
  render(camera) {
    this._followShadow(camera);
    // Skins fade their additive detail in as the camera pulls back, and this is
    // the only place the camera exists. update() therefore reads the PREVIOUS
    // frame's distance — one frame of lag on a slow brightness ramp, against
    // threading a camera through a method that has never needed one.
    this._skinCamDist = camera.position.distanceTo(this.holeMesh.position);
    // Fog band pinned to the back of the frustum — see the constructor. 0.995
    // rather than 1.0 so the ground is fully faded a metre BEFORE the clip
    // plane reaches it, never a metre after.
    const fog = this.scene.fog;
    if (fog && camera.far !== this._fogFor) {
      this._fogFor = camera.far;
      fog.far = camera.far * 0.995;
      fog.near = camera.far * 0.7;
    }
    this.renderer.render(this.scene, camera);
  }
  resize(w, h) { this.renderer.setSize(w, h, false); }

  dispose() {
    if (this._disposed) return; // teardown can be reached twice; refcount must not go negative
    this._disposed = true;
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.particles.length = 0;
    for (const im of this._ambientMeshes) { this.scene.remove(im); im.dispose(); }
    this._ambientMeshes.length = 0;
    this.ambient = null;
    if (this.decorMesh) { this.scene.remove(this.decorMesh); this.decorMesh = null; }
    for (const mesh of this.coinMeshes.values()) this.scene.remove(mesh);
    this.coinMeshes.clear();
    // The skin owns geometry AND materials (one pair per part) and its world
    // group is parented to the scene, not to the hole, so it needs removing
    // from both places — _ownedMats never saw either.
    if (this.skin) {
      this.holeMesh.remove(this.skin.local);
      this.scene.remove(this.skin.world);
      this.skin.dispose();
      this.skin = null;
    }
    for (const im of this.imMeshes) { this.scene.remove(im); im.dispose(); }
    this.imMeshes.length = 0;
    this._shadowMeshes.length = 0;
    // renderer.dispose() does not reach the shadow depth target.
    if (this._sun) { this._sun.shadow.dispose(); this._sun.shadow.map = null; this._sun = null; }
    // Geometries this world created. The shared caches go too, but only once
    // the last world is gone — see releaseSharedGeometry. mat() materials stay:
    // they own no GL buffers, and renderer.dispose() clears the program cache.
    for (const g of this._ownedGeos) g.dispose();
    for (const m of this._ownedMats) m.dispose();
    this._ownedGeos.length = 0;
    this._ownedMats.length = 0;
    // Surfaces are shared across worlds for the same reason the geometry is, so
    // they are freed on the same refcount and never before. Unlike mat()
    // materials they DO own GL buffers — a 256x256 albedo, a 128x128 ORM and a
    // PMREM render target apiece — so leaving them behind would leak per scene
    // switch exactly the way the orphaned attribute buffers used to.
    if (--liveWorlds <= 0) { liveWorlds = 0; releaseSharedGeometry(); disposeSurfaces(); }
    if (this._mq && this._onMq && this._mq.removeEventListener) {
      this._mq.removeEventListener('change', this._onMq);
    }
    this._mq = null;
    this.scene.clear();
    this.renderer.dispose();
    if (typeof window !== 'undefined' && window.__voxelWorld === this) window.__voxelWorld = null;
  }
}
