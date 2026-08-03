// three.js scene builder + per-frame sync from sim state. All gameplay logic
// lives in sim.js; this file only draws and animates.

import * as THREE from 'three';
import { METROS } from './levels.js';

const geoCache = new Map();
function boxGeo() { if (!geoCache.has('box')) geoCache.set('box', new THREE.BoxGeometry(1, 1, 1)); return geoCache.get('box'); }
function cylGeo() { if (!geoCache.has('cyl')) geoCache.set('cyl', new THREE.CylinderGeometry(1, 1, 1, 12)); return geoCache.get('cyl'); }
function coneGeo() { if (!geoCache.has('cone')) geoCache.set('cone', new THREE.ConeGeometry(1, 1, 8)); return geoCache.get('cone'); }
function sphereGeo() { if (!geoCache.has('sph')) geoCache.set('sph', new THREE.SphereGeometry(1, 10, 8)); return geoCache.get('sph'); }
function circleGeo() { if (!geoCache.has('circ')) geoCache.set('circ', new THREE.CircleGeometry(1, 32)); return geoCache.get('circ'); }
function ringGeo() { if (!geoCache.has('ring')) geoCache.set('ring', new THREE.RingGeometry(0.92, 1, 32)); return geoCache.get('ring'); }

const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive || 0}|${opts.flat ? 1 : 0}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.9, metalness: 0.05, flatShading: true,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissive ? 0.55 : 0,
    }));
  }
  return matCache.get(key);
}

const GOLD = 0xffd23f;
const ROOF_COLORS = [0x9c4a2f, 0x6a5a8f, 0x4a5a6a, 0x8f3a3a, 0x5c7a4a];

// Gable roof: triangular prism spanning a w x d footprint, ridge along z.
function gableGeo(w, h, d) {
  const hw = w / 2, hd = d / 2;
  const verts = new Float32Array([
    -hw, 0, -hd,   hw, 0, -hd,   hw, 0, hd,   -hw, 0, hd,   0, h, -hd,   0, h, hd,
  ]);
  const idx = [0, 1, 4, 2, 3, 5, 3, 0, 4, 3, 4, 5, 1, 2, 5, 1, 5, 4];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Canvas-drawn facade texture: base color + window grid. Cached per color so
// all buildings of one color share one texture.
function facadeTexture(color, floors = 10) {
  const key = `${color}|${floors}`;
  if (!facadeTexture._cache) facadeTexture._cache = new Map();
  if (facadeTexture._cache.has(key)) return facadeTexture._cache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 5;
  const rows = floors;
  const ww = 128 / cols, wh = 256 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = (i * 7 + j * 13) % 5 < 2; // deterministic variety
      ctx.fillStyle = lit ? '#e8f2fa' : '#5a7a9a';
      ctx.fillRect(i * ww + ww * 0.22, j * wh + wh * 0.22, ww * 0.56, wh * 0.56);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  facadeTexture._cache.set(key, tex);
  return tex;
}

function facadeMat(color, floors) {
  const key = `${color}|${floors}`;
  if (!facadeMat._cache) facadeMat._cache = new Map();
  if (!facadeMat._cache.has(key)) {
    facadeMat._cache.set(key, new THREE.MeshStandardMaterial({
      map: facadeTexture(color, floors), roughness: 0.9, metalness: 0.05,
    }));
  }
  return facadeMat._cache.get(key);
}

// Box material order: +x, -x, +y(top), -y(bottom), +z, -z. Facades on the
// sides only — roofs get a plain slab, not stretched windows.
function buildingBoxMats(color, floors) {
  const side = facadeMat(color, floors);
  const top = mat(0xcfd4da);
  return [side, side, top, top, side, side];
}

function addBox(group, color, sx, sy, sz, x, y, z, rotX = 0) {
  const m = new THREE.Mesh(boxGeo(), mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  if (rotX) m.rotation.x = rotX;
  group.add(m);
  return m;
}

// Building archetypes (visual only — gameplay footprint stays o.radius):
// house (gabled roof + chimney), shop (awning + sign band + parapet),
// tower (parapet + rooftop props), landmark (columns + pediment).
// Archetype/variant derive from o.id and metro — deterministic, no RNG needed.
function makeBuildingMesh(o, palette, metroIndex) {
  const color = o.golden ? GOLD : palette[o.colorIdx % palette.length];
  const group = new THREE.Group();
  const w = o.w, d = o.d, h = o.h;
  const roofColor = o.golden ? GOLD : ROOF_COLORS[o.id % ROOF_COLORS.length];

  let kind;
  if (o.kind === 'landmark') kind = 'landmark';
  else if (o.variant) kind = o.variant; // citygen assigns house/shop/tower
  else if (o.tier === 5) kind = (metroIndex === 1 || metroIndex === 3) ? 'shop' : 'house';
  else kind = 'tower';

  if (kind === 'house') {
    const baseH = h * 0.62;
    addBox(group, color, w, baseH, d, 0, baseH / 2, 0);
    const roof = new THREE.Mesh(gableGeo(w * 1.12, h * 0.45, d * 1.08), mat(roofColor));
    roof.position.y = baseH;
    group.add(roof);
    addBox(group, roofColor, w * 0.14, h * 0.3, w * 0.14, w * 0.28, baseH + h * 0.18, -d * 0.2); // chimney
    // door + windows on the front (-z) face, windows on the sides
    addBox(group, 0x6a4a2f, w * 0.16, baseH * 0.45, 0.06, 0, baseH * 0.225, -d / 2 - 0.03);
    const winC = 0xdfeaf2;
    addBox(group, winC, w * 0.18, baseH * 0.3, 0.05, -w * 0.28, baseH * 0.55, -d / 2 - 0.02);
    addBox(group, winC, w * 0.18, baseH * 0.3, 0.05, w * 0.28, baseH * 0.55, -d / 2 - 0.02);
    addBox(group, winC, 0.05, baseH * 0.28, d * 0.2, -w / 2 - 0.02, baseH * 0.55, 0);
    addBox(group, winC, 0.05, baseH * 0.28, d * 0.2, w / 2 + 0.02, baseH * 0.55, 0);
  } else if (kind === 'shop') {
    const base = new THREE.Mesh(boxGeo(), buildingBoxMats(color, 3));
    base.scale.set(w, h, d);
    base.position.y = h / 2;
    group.add(base);
    // storefront glass band + sign + angled awning on the front (-z) face
    addBox(group, 0x3a5a7a, w * 0.86, h * 0.34, 0.06, 0, h * 0.19, -d / 2 - 0.03);
    addBox(group, 0xffffff, w * 0.9, h * 0.13, 0.06, 0, h * 0.48, -d / 2 - 0.03);
    const awnColor = o.golden ? GOLD : ROOF_COLORS[(o.id + 2) % ROOF_COLORS.length];
    addBox(group, awnColor, w * 0.92, 0.06, d * 0.3, 0, h * 0.38, -d / 2 - d * 0.14, -0.35);
    // neutral parapet rim
    addBox(group, 0xd8dce2, w * 1.04, h * 0.06, d * 1.04, 0, h * 0.99, 0);
  } else if (kind === 'tower') {
    const floors = Math.max(6, Math.round(h / 2.6));
    const base = new THREE.Mesh(boxGeo(), buildingBoxMats(color, floors));
    base.scale.set(w, h, d);
    base.position.y = h / 2;
    group.add(base);
    // neutral parapet rim
    addBox(group, 0xd8dce2, w * 1.05, h * 0.035, d * 1.05, 0, h * 0.99, 0);
    // rooftop props: AC units always, water tank on some variants
    addBox(group, 0xb8c0c8, w * 0.22, h * 0.05, w * 0.22, -w * 0.22, h * 1.03, d * 0.18);
    addBox(group, 0xb8c0c8, w * 0.16, h * 0.04, w * 0.16, w * 0.2, h * 1.02, -d * 0.22);
    if (o.id % 3 === 0) {
      const tank = new THREE.Mesh(cylGeo(), mat(0x9aa4ae));
      tank.scale.set(w * 0.1, h * 0.06, w * 0.1);
      tank.position.set(w * 0.18, h * 1.05, d * 0.15);
      group.add(tank);
    }
  } else {
    // landmark: stepped base + corner columns + pediment
    addBox(group, color, w, h * 0.7, d, 0, h * 0.35, 0);
    addBox(group, 0xffffff, w * 1.1, h * 0.05, d * 1.1, 0, h * 0.72, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(cylGeo(), mat(0xffffff));
      col.scale.set(w * 0.07, h * 0.28, w * 0.07);
      col.position.set(sx * w * 0.42, h * 0.86, sz * d * 0.42);
      group.add(col);
    }
    const ped = new THREE.Mesh(gableGeo(w * 1.1, h * 0.14, d * 1.1), mat(GOLD));
    ped.position.y = h;
    group.add(ped);
  }
  return group;
}

function makePropMesh(o, palette, metroIndex) {
  const color = o.golden ? GOLD : palette[o.colorIdx % palette.length];
  const group = new THREE.Group();
  const r = o.radius;
  switch (o.kind) {
    case 'clutter': {
      const m = new THREE.Mesh(boxGeo(), mat(color));
      m.scale.set(r * 1.2, r * 1.4, r * 1.2);
      m.position.y = r * 0.7;
      m.rotation.y = o.rotY || 0;
      group.add(m);
      break;
    }
    case 'tree': {
      const trunk = new THREE.Mesh(cylGeo(), mat(0x7a5230));
      trunk.scale.set(r * 0.25, r * 1.2, r * 0.25);
      trunk.position.y = r * 0.6;
      const top = new THREE.Mesh(sphereGeo(), mat(o.golden ? GOLD : 0x3f9e3f));
      top.scale.setScalar(r * 1.1);
      top.position.y = r * 1.8;
      group.add(trunk, top);
      break;
    }
    case 'bike': {
      const m = new THREE.Mesh(boxGeo(), mat(color));
      m.scale.set(r * 2, r * 1.4, r * 0.35);
      m.position.y = r * 0.8;
      m.rotation.y = o.rotY || 0;
      group.add(m);
      break;
    }
    case 'car': {
      const body = new THREE.Mesh(boxGeo(), mat(color));
      body.scale.set(r * 2.2, r * 0.9, r * 1.1);
      body.position.y = r * 0.55;
      body.rotation.y = o.rotY || 0;
      const top = new THREE.Mesh(boxGeo(), mat(color));
      top.scale.set(r * 1.2, r * 0.7, r * 0.95);
      top.position.y = r * 1.25;
      top.rotation.y = o.rotY || 0;
      group.add(body, top);
      break;
    }
    case 'bus': {
      const m = new THREE.Mesh(boxGeo(), mat(color));
      m.scale.set(r * 2.6, r * 1.7, r * 1.1);
      m.position.y = r * 0.95;
      m.rotation.y = o.rotY || 0;
      group.add(m);
      break;
    }
    case 'building':
    case 'landmark': {
      const b = makeBuildingMesh(o, palette, metroIndex);
      b.position.set(o.x, 0, o.z);
      b.rotation.y = o.rotY || 0;
      return b;
    }
  }
  group.position.set(o.x, 0, o.z);
  return group;
}

// Canvas-drawn road texture: sidewalk borders + dashed centerline. u spans
// the road width (sidewalks at both edges), v repeats along its length.
function roadTexture() {
  if (roadTexture._cache) return roadTexture._cache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4f58'; // asphalt
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#9aa0a8'; // sidewalks
  ctx.fillRect(0, 0, 18, 128);
  ctx.fillRect(110, 0, 18, 128);
  ctx.fillStyle = '#7c828c'; // curb line
  ctx.fillRect(18, 0, 3, 128);
  ctx.fillRect(107, 0, 3, 128);
  ctx.fillStyle = '#e8e8e0'; // dashed centerline
  for (let y = 4; y < 128; y += 32) ctx.fillRect(61, y, 6, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  roadTexture._cache = tex;
  return tex;
}

function makeHoleMesh(color) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(circleGeo(), new THREE.MeshBasicMaterial({ color: 0x05060a }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  const ring = new THREE.Mesh(ringGeo(), new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.renderOrder = 999;
  group.add(disc, ring);
  group.userData.disc = disc;
  group.userData.ring = ring;
  return group;
}

export class World3D {
  constructor(canvas, sim, skinColor = 0x4be34b, options = {}) {
    this.sim = sim;
    this.city = sim.city;
    const theme = METROS[sim.level.metroIndex].theme;
    this.palette = theme.palette;
    this.metroIndex = sim.level.metroIndex;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = options.shadows !== false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.sky);
    if (theme.night) this.scene.fog = new THREE.Fog(theme.sky, 60, 220);

    const amb = new THREE.AmbientLight(0xffffff, theme.night ? 0.3 : 0.45);
    const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, theme.night ? 0.3 : 0.55);
    const sun = new THREE.DirectionalLight(0xffffff, theme.night ? 0.5 : 0.95);
    sun.position.set(40, 80, 30);
    sun.castShadow = this.renderer.shadowMap.enabled;
    this.sun = sun;
    const S = this.city.size;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(amb, hemi, sun);

    // --- ground ---
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.city.size * 1.6, this.city.size * 1.6),
      mat(theme.ground)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // --- water ---
    const wr = this.city.waterRect;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(wr.w * 1.8, wr.h * 3), mat(theme.water));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.02, wr.z + wr.h);
    this.scene.add(this.water);

    // --- roads (textured: sidewalks + lane dashes) ---
    const roadW = this.city.roads.width;
    const repeats = Math.max(1, Math.round(this.city.size / 8));
    const vTex = roadTexture().clone();
    vTex.needsUpdate = true;
    vTex.repeat.set(1, repeats);
    const hTex = roadTexture().clone();
    hTex.needsUpdate = true;
    hTex.center.set(0.5, 0.5);
    hTex.rotation = Math.PI / 2;
    hTex.repeat.set(1, repeats);
    const vMat = new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.95 });
    const hMat = new THREE.MeshStandardMaterial({ map: hTex, roughness: 0.95 });
    for (const x of this.city.roads.vertical) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(roadW, this.city.size), vMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.03, 0);
      road.receiveShadow = true;
      this.scene.add(road);
    }
    for (const z of this.city.roads.horizontal) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(this.city.size, roadW), hMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.03, z);
      road.receiveShadow = true;
      this.scene.add(road);
    }

    // --- block pads: concrete base + interior tint per block type ---
    const padMat = mat(0xb0b5bd);
    const yardMat = mat(0x57a83e);
    const lotMat = mat(0x555a63);
    for (const b of this.city.blocks) {
      const w = b.xmax - b.xmin, d = b.zmax - b.zmin;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((b.xmin + b.xmax) / 2, 0.02, (b.zmin + b.zmax) / 2);
      pad.receiveShadow = true;
      this.scene.add(pad);
      let inner = null;
      if (b.type === 'housing' || b.type === 'park') inner = yardMat;
      else if (b.type === 'parking') inner = lotMat;
      if (inner) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(w - 2.4, d - 2.4), inner);
        t.rotation.x = -Math.PI / 2;
        t.position.set((b.xmin + b.xmax) / 2, 0.025, (b.zmin + b.zmax) / 2);
        t.receiveShadow = true;
        this.scene.add(t);
      }
    }

    // --- objects ---
    this.meshById = new Map();
    this.anims = [];
    this.bouncing = [];
    this.blockers = [];
    for (const o of this.city.objects) {
      const g = makePropMesh(o, this.palette, this.metroIndex);
      g.userData.id = o.id;
      g.traverse((c) => { if (c.isMesh) { c.castShadow = true; } });
      this.scene.add(g);
      this.meshById.set(o.id, g);
      if ((o.kind === 'building' || o.kind === 'landmark') && o.h > 6) {
        this.blockers.push({
          minX: o.x - o.w / 2, maxX: o.x + o.w / 2,
          minZ: o.z - o.d / 2, maxZ: o.z + o.d / 2, h: o.h, id: o.id,
        });
      }
      if (o.kind === 'landmark' && o.shielded) {
        const shield = new THREE.Mesh(sphereGeo(), new THREE.MeshBasicMaterial({
          color: 0x66ccff, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        }));
        shield.scale.setScalar(o.radius * 1.6);
        shield.position.set(o.x, o.radius, o.z);
        this.scene.add(shield);
        this.shield = shield;
      }
    }

    // --- holes ---
    this.playerMesh = makeHoleMesh(skinColor);
    this.scene.add(this.playerMesh);
    this.rivalMeshes = sim.rivals.map(() => {
      const m = makeHoleMesh(0xb44bff);
      this.scene.add(m);
      return m;
    });
  }

  syncHole(mesh, h) {
    mesh.position.set(h.x, 0, h.z);
    mesh.userData.disc.scale.setScalar(h.radius);
    mesh.userData.ring.scale.setScalar(h.radius);
  }

  spawnEatParticles(x, z, color = 0xdddddd, count = 8) {
    const geo = sphereGeo();
    const matP = mat(color, { flat: true });
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(geo, matP);
      p.scale.setScalar(0.15 + Math.random() * 0.2);
      p.position.set(x + (Math.random() - 0.5) * 0.8, 0.2, z + (Math.random() - 0.5) * 0.8);
      this.scene.add(p);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      const vx = Math.cos(angle) * speed;
      const vz = Math.sin(angle) * speed;
      const vy = 2.0 + Math.random() * 2.0;
      this.particles = this.particles || [];
      this.particles.push({ mesh: p, vx, vy, vz, life: 0.45, maxLife: 0.45 });
    }
  }

  spawnShockRing(x, z, radius) {
    const ring = new THREE.Mesh(ringGeo(), mat(0x66ccff, { emissive: 0x66ccff }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    ring.scale.setScalar(radius);
    this.scene.add(ring);
    this.particles = this.particles || [];
    this.particles.push({ mesh: ring, isRing: true, life: 0.4, maxLife: 0.4, startRadius: radius });
  }

  // Decompose a group into small cube voxel particles that crumble into the hole
  fractureMeshToVoxels(group, hole, dur = 0.5) {
    const voxels = [];
    const holeX = hole ? hole.x : group.position.x;
    const holeZ = hole ? hole.z : group.position.z;
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Choose voxel resolution based on object size
    const maxDim = Math.max(size.x, size.y, size.z);
    const step = Math.max(0.35, maxDim / 6);
    
    group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const matP = child.material;
        const geoP = boxGeo();
        // Sample voxel grid over child bounding box
        child.geometry.computeBoundingBox();
        const cBox = child.geometry.boundingBox;
        const cWorldPos = new THREE.Vector3();
        child.getWorldPosition(cWorldPos);
        const cWorldScale = new THREE.Vector3();
        child.getWorldScale(cWorldScale);

        const wx = Math.max(step * 0.8, cBox.max.x - cBox.min.x) * cWorldScale.x;
        const wy = Math.max(step * 0.8, cBox.max.y - cBox.min.y) * cWorldScale.y;
        const wz = Math.max(step * 0.8, cBox.max.z - cBox.min.z) * cWorldScale.z;

        const nx = Math.max(1, Math.min(4, Math.round(wx / step)));
        const ny = Math.max(1, Math.min(5, Math.round(wy / step)));
        const nz = Math.max(1, Math.min(4, Math.round(wz / step)));

        for (let ix = 0; ix < nx; ix++) {
          for (let iy = 0; iy < ny; iy++) {
            for (let iz = 0; iz < nz; iz++) {
              const vx = cWorldPos.x - wx / 2 + (ix + 0.5) * (wx / nx);
              const vy = cWorldPos.y + (iy + 0.5) * (wy / ny);
              const vz = cWorldPos.z - wz / 2 + (iz + 0.5) * (wz / nz);

              const voxel = new THREE.Mesh(geoP, matP);
              voxel.scale.set(wx / nx * 0.9, wy / ny * 0.9, wz / nz * 0.9);
              voxel.position.set(vx, vy, vz);
              this.scene.add(voxel);

              const dx = holeX - vx;
              const dz = holeZ - vz;
              const dist = Math.hypot(dx, dz) || 1;
              voxels.push({
                mesh: voxel,
                origY: vy,
                targetX: holeX + (dx / dist) * (Math.random() * 0.5),
                targetZ: holeZ + (dz / dist) * (Math.random() * 0.5),
                rotAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
                rotSpeed: 4 + Math.random() * 8,
                delay: (dist / (hole ? hole.radius + 2 : 1)) * 0.15 + Math.random() * 0.1,
                dur,
                t: 0,
              });
            }
          }
        }
      }
    });

    this.scene.remove(group);
    this.voxelAnims = this.voxelAnims || [];
    this.voxelAnims.push(...voxels);
  }

  // Apply sim events (eats, tides, unlock) then per-frame animation.
  update(dt, events) {
    const sim = this.sim;
    for (const ev of events) {
      if (ev.type === 'enter' || ev.flooded) {
        const g = this.meshById.get(ev.obj.id);
        if (g) {
          if (ev.type === 'enter' && ev.hole) {
            this.spawnEatParticles(ev.obj.x, ev.obj.z, ev.obj.golden ? GOLD : 0xd8dce2, ev.obj.tier >= 4 ? 14 : 8);
            this.fractureMeshToVoxels(g, ev.hole, ev.dur || 0.45);
          } else {
            const a = { g, t: 0, x: ev.obj.x, z: ev.obj.z, dur: ev.dur || 0.45 };
            this.anims.push(a);
          }
          if (ev.type === 'enter') this.meshById.delete(ev.obj.id);
          const bi = this.blockers.findIndex((b) => b.id === ev.obj.id);
          if (bi >= 0) this.blockers.splice(bi, 1);
        }
        if (ev.type === 'enter' && ev.obj.kind === 'landmark' && this.shield) {
          this.scene.remove(this.shield); this.shield = null;
        }
      } else if (ev.type === 'bounce') {
        const g = this.meshById.get(ev.obj.id);
        if (g) this.bouncing.push({ g, obj: ev.obj, t: 0 });
      } else if (ev.type === 'eject') {
        // Object was ejected mid-swallow! Cancel its entry animation & re-register mesh
        const ai = this.anims.findIndex((a) => a.g.userData.id === ev.obj.id);
        if (ai >= 0) {
          const a = this.anims[ai];
          this.anims.splice(ai, 1);
          a.g.quaternion.copy(a.qYaw);
          a.g.position.set(ev.obj.x, 0, ev.obj.z);
          this.meshById.set(ev.obj.id, a.g);
          this.bouncing.push({ g: a.g, obj: ev.obj, t: 0 });
        }
      } else if (ev.type === 'eat') {
        if (ev.obj.kind === 'landmark' && this.shield) {
          this.scene.remove(this.shield); this.shield = null;
        }
      } else if (ev.type === 'unlocked' && this.shield) {
        this.scene.remove(this.shield);
        this.shield = null;
      } else if (ev.type === 'tide') {
        // visually widen the water to the new bounds
        const b = ev.bounds;
        this.water.scale.set(1.2, 1, 1);
        this.water.position.z = b.zmax + (this.city.size - (b.zmax - b.zmin)) * 0.25;
        this.water.position.x = (b.xmin + b.xmax) / 2;
      }
    }

    // eat animations: tip over toward the hole and fall in (timed to the
    // sim's swallow duration); flooded objects sink straight down.
    const qTmp = new THREE.Quaternion();
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      if (a.axis) {
        // tip first (stays visible above ground), then slide + sink
        const tip = Math.min(1, k * 1.2);
        const angle = tip * tip * 1.7; // ~97 deg at full tip
        qTmp.setFromAxisAngle(a.axis, angle);
        a.g.quaternion.copy(qTmp).multiply(a.qYaw);
        const sinkK = Math.max(0, (k - 0.4) / 0.6);
        a.g.position.set(
          a.x + a.pullX * sinkK * sinkK * 1.8,
          -sinkK * sinkK * 3.5,
          a.z + a.pullZ * sinkK * sinkK * 1.8
        );
      } else {
        a.g.scale.setScalar(1 - k);
        a.g.position.y = -k * 2;
      }
      if (k >= 1) {
        this.scene.remove(a.g);
        this.anims.splice(i, 1);
      }
    }

    // bounced props: follow sim position with a little hop
    for (let i = this.bouncing.length - 1; i >= 0; i--) {
      const bn = this.bouncing[i];
      bn.t += dt;
      bn.g.position.x = bn.obj.x;
      bn.g.position.z = bn.obj.z;
      bn.g.position.y = Math.sin(Math.min(Math.PI, bn.t * 10)) * 0.4;
      if (!bn.obj.moving) {
        bn.g.position.y = 0;
        this.bouncing.splice(i, 1);
      }
    }

    // voxel crumble animations: pull small cube fragments towards the hole center and down
    if (this.voxelAnims) {
      const qRot = new THREE.Quaternion();
      for (let i = this.voxelAnims.length - 1; i >= 0; i--) {
        const v = this.voxelAnims[i];
        if (v.delay > 0) {
          v.delay -= dt;
          continue;
        }
        v.t += dt / v.dur;
        const k = Math.min(1, v.t);
        const kEase = k * k;
        
        v.mesh.position.x += (v.targetX - v.mesh.position.x) * Math.min(1, dt * 6);
        v.mesh.position.z += (v.targetZ - v.mesh.position.z) * Math.min(1, dt * 6);
        v.mesh.position.y = v.origY * (1 - kEase) - kEase * 3.5;
        
        qRot.setFromAxisAngle(v.rotAxis, dt * v.rotSpeed);
        v.mesh.quaternion.multiply(qRot);
        v.mesh.scale.setScalar(Math.max(0.01, (1 - kEase * 0.8)));

        if (k >= 1) {
          this.scene.remove(v.mesh);
          this.voxelAnims.splice(i, 1);
        }
      }
    }

    // particle & shock ring updates
    if (this.particles) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        const k = Math.max(0, p.life / p.maxLife);
        if (p.isRing) {
          p.mesh.scale.setScalar(p.startRadius * (1 + (1 - k) * 0.8));
          p.mesh.material.opacity = k;
        } else {
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          p.vy -= 9.8 * dt;
          p.mesh.scale.setScalar((0.15 + (1 - k) * 0.1) * k);
        }
        if (p.life <= 0) {
          this.scene.remove(p.mesh);
          this.particles.splice(i, 1);
        }
      }
    }

    this.syncHole(this.playerMesh, sim.player);
    sim.rivals.forEach((r, i) => this.syncHole(this.rivalMeshes[i], r));
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    if (this.sun) this.sun.castShadow = on;
    this.scene.traverse((c) => { if (c.isMesh) c.material.needsUpdate = true; });
  }

  render(camera) { this.renderer.render(this.scene, camera); }
  resize(w, h) { this.renderer.setSize(w, h, false); }
  dispose() { this.renderer.dispose(); }
}
