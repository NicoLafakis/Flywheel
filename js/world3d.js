import * as THREE from 'three';
import { METROS } from './levels.js';
import { makeSkin } from './skins.js';
import { edibleTierUpTo } from './tiers.js';
import { POWERUP_TYPES, hasActivePowerUp } from './powerups.js';

let _randSeed = 12345;
function pseudoRand() {
  _randSeed = (_randSeed * 1664525 + 1013904223) % 4294967296;
  return _randSeed / 4294967296;
}

function voidSwirlTexture() {
  if (voidSwirlTexture._cache) return voidSwirlTexture._cache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  
  // Base deep void
  ctx.fillStyle = '#05060b';
  ctx.fillRect(0, 0, 128, 128);
  
  // Swirling logarithmic accretion arms
  const cx = 64, cy = 64;
  for (let arm = 0; arm < 3; arm++) {
    const baseAngle = (arm * Math.PI * 2) / 3;
    ctx.beginPath();
    for (let r = 5; r < 60; r += 2) {
      const a = baseAngle + r * 0.09;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (r === 5) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(25, 45, 80, 0.45)';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(38, 70, 125, 0.22)';
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  
  // Radial gradient for deep event horizon center & darkened outer edge
  const grad = ctx.createRadialGradient(cx, cy, 3, cx, cy, 62);
  grad.addColorStop(0, 'rgba(8, 14, 28, 0.95)');
  grad.addColorStop(0.5, 'rgba(4, 6, 12, 0.25)');
  grad.addColorStop(0.9, 'rgba(4, 5, 9, 0.85)');
  grad.addColorStop(1.0, '#05060b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  voidSwirlTexture._cache = tex;
  return tex;
}

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

// Canvas-drawn facade texture: base color + window grid with 4 architectural styles.
// Cached per (color, floors, variant) so buildings share textures efficiently.
function facadeTexture(color, floors = 10, variant = 0) {
  const key = `${color}|${floors}|${variant}`;
  if (!facadeTexture._cache) facadeTexture._cache = new Map();
  if (facadeTexture._cache.has(key)) return facadeTexture._cache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 256);

  // Subtle vertical ambient gradient (darker ground level, crisp top)
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.85, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  const style = variant % 4;
  const cols = style === 1 ? 4 : 5;
  const rows = floors;
  const ww = 128 / cols, wh = 256 / rows;

  if (style === 0) {
    // 1. Punched Office Window Grid (mullions, lit/unlit glass, spandrel shadows)
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = (i * 7 + j * 13 + variant * 5) % 7 < 3;
        const wx = i * ww + ww * 0.20, wy = j * wh + wh * 0.22;
        const wWidth = ww * 0.60, wHeight = wh * 0.56;
        // Window frame shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(wx - 1, wy - 1, wWidth + 2, wHeight + 2);
        // Glass
        ctx.fillStyle = lit ? '#fff6d4' : '#4a6582';
        ctx.fillRect(wx, wy, wWidth, wHeight);
        // Glazing highlight
        ctx.fillStyle = lit ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(wx, wy, wWidth, 2);
      }
    }
  } else if (style === 1) {
    // 2. Modern Ribbon Glass (continuous horizontal glazing bands)
    for (let j = 0; j < rows; j++) {
      const wy = j * wh + wh * 0.24, wHeight = wh * 0.52;
      // Spandrel panel shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, wy - 1, 128, wHeight + 2);
      // Continuous glass band
      ctx.fillStyle = '#3e5875';
      ctx.fillRect(0, wy, 128, wHeight);
      // Mullion vertical bars & lit sections
      for (let i = 0; i < cols * 2; i++) {
        const mx = i * (128 / (cols * 2));
        const lit = (i * 11 + j * 7) % 6 < 2;
        if (lit) {
          ctx.fillStyle = '#ffeaa0';
          ctx.fillRect(mx + 2, wy + 1, (128 / (cols * 2)) - 4, wHeight - 2);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(mx, wy, 2, wHeight);
      }
    }
  } else if (style === 2) {
    // 3. Residential Double-Hung (4-pane windows with stone sills & lintels)
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = (i * 5 + j * 17) % 5 < 2;
        const wx = i * ww + ww * 0.22, wy = j * wh + wh * 0.24;
        const wWidth = ww * 0.56, wHeight = wh * 0.52;
        // Stone lintel
        ctx.fillStyle = '#dcdfe5';
        ctx.fillRect(wx - 2, wy - 3, wWidth + 4, 2);
        // Stone sill
        ctx.fillRect(wx - 3, wy + wHeight, wWidth + 6, 3);
        // Glass
        ctx.fillStyle = lit ? '#fff3c4' : '#33485e';
        ctx.fillRect(wx, wy, wWidth, wHeight);
        // Window sashes / divided panes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx, wy + wHeight * 0.48, wWidth, 1.5);
        ctx.fillRect(wx + wWidth * 0.48, wy, 1.5, wHeight);
      }
    }
  } else {
    // 4. Mixed-use Commercial (large illuminated ground storefront + punched upper windows)
    // Upper floors
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const lit = (i * 9 + j * 11) % 4 < 2;
        const wx = i * ww + ww * 0.22, wy = j * wh + wh * 0.22;
        const wWidth = ww * 0.56, wHeight = wh * 0.54;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(wx - 1, wy - 1, wWidth + 2, wHeight + 2);
        ctx.fillStyle = lit ? '#fff1b8' : '#415a77';
        ctx.fillRect(wx, wy, wWidth, wHeight);
      }
    }
    // Ground floor storefront
    const gy = (rows - 1) * wh + wh * 0.15, gh = wh * 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(4, gy - 2, 120, gh + 4);
    ctx.fillStyle = '#fffae8';
    ctx.fillRect(6, gy, 116, gh);
    ctx.fillStyle = '#e8a048'; // warm shop interior display
    ctx.fillRect(10, gy + gh * 0.4, 108, gh * 0.5);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  facadeTexture._cache.set(key, tex);
  return tex;
}

function facadeMat(color, floors, variant = 0) {
  const key = `${color}|${floors}|${variant}`;
  if (!facadeMat._cache) facadeMat._cache = new Map();
  if (!facadeMat._cache.has(key)) {
    facadeMat._cache.set(key, new THREE.MeshStandardMaterial({
      map: facadeTexture(color, floors, variant), roughness: 0.88, metalness: 0.05,
    }));
  }
  return facadeMat._cache.get(key);
}

// Box material order: +x, -x, +y(top), -y(bottom), +z, -z. Facades on the
// sides only — roofs get a plain slab, not stretched windows.
function buildingBoxMats(color, floors, variant = 0) {
  const side = facadeMat(color, floors, variant);
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
  const variant = o.id % 4;

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
    const base = new THREE.Mesh(boxGeo(), buildingBoxMats(color, 3, variant));
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
    const base = new THREE.Mesh(boxGeo(), buildingBoxMats(color, floors, variant));
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

// Detailed procedural props (Stage 4)
function makePropMesh(o, palette, metroIndex) {
  const color = o.golden ? GOLD : palette[o.colorIdx % palette.length];
  const group = new THREE.Group();
  const r = o.radius;
  switch (o.kind) {
    case 'clutter': {
      // Varied street furniture: hydrant, lamp, bench, bollard
      const variant = o.id % 4;
      if (variant === 0) {
        // Fire hydrant
        const hydC = 0xdd3322;
        const hyd = new THREE.Mesh(cylGeo(), mat(hydC));
        hyd.scale.set(r * 0.5, r * 1.3, r * 0.5);
        hyd.position.y = r * 0.65;
        const cap = new THREE.Mesh(sphereGeo(), mat(hydC));
        cap.scale.setScalar(r * 0.55);
        cap.position.y = r * 1.3;
        const nozzle = new THREE.Mesh(boxGeo(), mat(0x999999));
        nozzle.scale.set(r * 0.8, r * 0.28, r * 0.28);
        nozzle.position.y = r * 0.8;
        group.add(hyd, cap, nozzle);
      } else if (variant === 1) {
        // Street lamp
        const pole = new THREE.Mesh(cylGeo(), mat(0x2a333d));
        pole.scale.set(r * 0.14, r * 2.2, r * 0.14);
        pole.position.y = r * 1.1;
        const arm = new THREE.Mesh(boxGeo(), mat(0x2a333d));
        arm.scale.set(r * 0.6, r * 0.12, r * 0.14);
        arm.position.set(r * 0.25, r * 2.15, 0);
        const lamp = new THREE.Mesh(boxGeo(), mat(0xfffae0, { emissive: 0xfff0b0 }));
        lamp.scale.set(r * 0.28, r * 0.16, r * 0.22);
        lamp.position.set(r * 0.45, r * 2.05, 0);
        group.add(pole, arm, lamp);
      } else if (variant === 2) {
        // Park bench
        const seat = new THREE.Mesh(boxGeo(), mat(0x8a5a3a));
        seat.scale.set(r * 1.4, r * 0.15, r * 0.6);
        seat.position.y = r * 0.45;
        const back = new THREE.Mesh(boxGeo(), mat(0x8a5a3a));
        back.scale.set(r * 1.4, r * 0.5, r * 0.12);
        back.position.set(0, r * 0.75, r * 0.25);
        const leg1 = new THREE.Mesh(boxGeo(), mat(0x22262a));
        leg1.scale.set(r * 0.15, r * 0.45, r * 0.55);
        leg1.position.set(-r * 0.55, r * 0.225, 0);
        const leg2 = leg1.clone();
        leg2.position.x = r * 0.55;
        group.add(seat, back, leg1, leg2);
      } else {
        // Postal drop box / kiosk
        const m = new THREE.Mesh(boxGeo(), mat(color));
        m.scale.set(r * 1.0, r * 1.5, r * 0.9);
        m.position.y = r * 0.75;
        const cap = new THREE.Mesh(boxGeo(), mat(0x223040));
        cap.scale.set(r * 1.1, r * 0.15, r * 1.0);
        cap.position.y = r * 1.55;
        group.add(m, cap);
      }
      group.rotation.y = o.rotY || 0;
      break;
    }
    case 'tree': {
      const isConifer = (o.id % 2 === 0);
      const trunk = new THREE.Mesh(cylGeo(), mat(0x6e4a28));
      trunk.scale.set(r * 0.22, r * 1.2, r * 0.22);
      trunk.position.y = r * 0.6;
      group.add(trunk);

      const leafC = o.golden ? GOLD : (isConifer ? 0x2e6e38 : 0x48a848);
      if (isConifer) {
        // Tiered evergreen conifer cones
        const cone1 = new THREE.Mesh(coneGeo(), mat(leafC));
        cone1.scale.set(r * 1.1, r * 1.4, r * 1.1);
        cone1.position.y = r * 1.6;
        const cone2 = new THREE.Mesh(coneGeo(), mat(leafC));
        cone2.scale.set(r * 0.85, r * 1.2, r * 0.85);
        cone2.position.y = r * 2.3;
        group.add(cone1, cone2);
      } else {
        // Lush rounded dual-cluster canopy
        const top1 = new THREE.Mesh(sphereGeo(), mat(leafC));
        top1.scale.set(r * 1.05, r * 0.95, r * 1.05);
        top1.position.y = r * 1.7;
        const top2 = new THREE.Mesh(sphereGeo(), mat(leafC));
        top2.scale.set(r * 0.75, r * 0.75, r * 0.75);
        top2.position.set(r * 0.2, r * 2.2, -r * 0.15);
        group.add(top1, top2);
      }
      break;
    }
    case 'bike': {
      const frame = new THREE.Mesh(boxGeo(), mat(color));
      frame.scale.set(r * 1.6, r * 0.8, r * 0.18);
      frame.position.y = r * 0.7;
      const w1 = new THREE.Mesh(cylGeo(), mat(0x222222));
      w1.scale.set(r * 0.45, r * 0.12, r * 0.45);
      w1.rotation.z = Math.PI / 2;
      w1.position.set(-r * 0.65, r * 0.45, 0);
      const w2 = w1.clone();
      w2.position.x = r * 0.65;
      group.add(frame, w1, w2);
      group.rotation.y = o.rotY || 0;
      break;
    }
    case 'car': {
      // Detailed sedan: chassis, cabin, tinted glass, 4 wheels, headlights/taillights
      const body = new THREE.Mesh(boxGeo(), mat(color));
      body.scale.set(r * 2.3, r * 0.7, r * 1.15);
      body.position.y = r * 0.55;
      
      const cabin = new THREE.Mesh(boxGeo(), mat(0x243242));
      cabin.scale.set(r * 1.3, r * 0.65, r * 0.98);
      cabin.position.set(-r * 0.15, r * 1.15, 0);

      const roof = new THREE.Mesh(boxGeo(), mat(color));
      roof.scale.set(r * 1.22, r * 0.12, r * 0.95);
      roof.position.set(-r * 0.15, r * 1.5, 0);

      // 4 wheels
      const wheelMat = mat(0x1a1a1e);
      const rimMat = mat(0xc4cad2);
      for (const wx of [-r * 0.68, r * 0.68]) {
        for (const wz of [-r * 0.55, r * 0.55]) {
          const w = new THREE.Mesh(cylGeo(), wheelMat);
          w.scale.set(r * 0.35, r * 0.16, r * 0.35);
          w.rotation.x = Math.PI / 2;
          w.position.set(wx, r * 0.35, wz);
          const rim = new THREE.Mesh(circleGeo(), rimMat);
          rim.scale.setScalar(r * 0.2);
          rim.position.set(wx, r * 0.35, wz + (wz > 0 ? 0.09 : -0.09));
          if (wz < 0) rim.rotation.y = Math.PI;
          group.add(w, rim);
        }
      }
      // Headlights (+x) & Taillights (-x)
      const hl = new THREE.Mesh(boxGeo(), mat(0xfffae0, { emissive: 0xfff0a0 }));
      hl.scale.set(0.08, r * 0.18, r * 0.85);
      hl.position.set(r * 1.15, r * 0.6, 0);
      const tl = new THREE.Mesh(boxGeo(), mat(0xee2222, { emissive: 0xaa1111 }));
      tl.scale.set(0.08, r * 0.16, r * 0.85);
      tl.position.set(-r * 1.15, r * 0.6, 0);

      group.add(body, cabin, roof, hl, tl);
      group.rotation.y = o.rotY || 0;
      break;
    }
    case 'bus': {
      // Detailed transit bus: body, tinted window strip, roof, wheels, headlights
      const body = new THREE.Mesh(boxGeo(), mat(color));
      body.scale.set(r * 2.8, r * 1.6, r * 1.15);
      body.position.y = r * 0.95;

      const glass = new THREE.Mesh(boxGeo(), mat(0x202d3d));
      glass.scale.set(r * 2.75, r * 0.55, r * 1.18);
      glass.position.y = r * 1.35;

      const roofCap = new THREE.Mesh(boxGeo(), mat(0xe8ecf0));
      roofCap.scale.set(r * 2.7, r * 0.15, r * 1.05);
      roofCap.position.y = r * 1.8;

      // 4 wheels
      const wheelMat = mat(0x1a1a1e);
      for (const wx of [-r * 0.85, r * 0.85]) {
        for (const wz of [-r * 0.56, r * 0.56]) {
          const w = new THREE.Mesh(cylGeo(), wheelMat);
          w.scale.set(r * 0.42, r * 0.18, r * 0.42);
          w.rotation.x = Math.PI / 2;
          w.position.set(wx, r * 0.42, wz);
          group.add(w);
        }
      }
      group.add(body, glass, roofCap);
      group.rotation.y = o.rotY || 0;
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

// Canvas-drawn road texture: sidewalk borders + dashed centerline + aggregate grain
function roadTexture() {
  if (roadTexture._cache) return roadTexture._cache;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  
  // Asphalt base with aggregate texture
  ctx.fillStyle = '#3c4048';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#444852';
  for (let y = 0; y < 256; y += 4) {
    for (let x = 36; x < 220; x += 4) {
      if ((x * 13 + y * 7) % 5 === 0) ctx.fillRect(x, y, 2, 2);
    }
  }

  // Sidewalks at left & right
  ctx.fillStyle = '#969da6';
  ctx.fillRect(0, 0, 36, 256);
  ctx.fillRect(220, 0, 36, 256);

  // Sidewalk joint lines
  ctx.fillStyle = '#828992';
  for (let y = 0; y < 256; y += 32) {
    ctx.fillRect(0, y, 36, 1.5);
    ctx.fillRect(220, y, 36, 1.5);
  }

  // Stone curbs with shadow
  ctx.fillStyle = '#6e747e';
  ctx.fillRect(35, 0, 4, 256);
  ctx.fillRect(217, 0, 4, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(39, 0, 2, 256);
  ctx.fillRect(215, 0, 2, 256);

  // Dashed centerline
  ctx.fillStyle = '#f0f0ea';
  for (let y = 8; y < 256; y += 48) {
    ctx.fillRect(124, y, 8, 28);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  roadTexture._cache = tex;
  return tex;
}

// Procedural ground pad textures (grass, parking lot, concrete pavers)
function yardTexture() {
  if (yardTexture._cache) return yardTexture._cache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#54a33b';
  ctx.fillRect(0, 0, 128, 128);
  // Mower stripe pattern
  ctx.fillStyle = '#5cb042';
  for (let x = 0; x < 128; x += 16) {
    ctx.fillRect(x, 0, 8, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  yardTexture._cache = tex;
  return tex;
}

function lotTexture() {
  if (lotTexture._cache) return lotTexture._cache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#484d56';
  ctx.fillRect(0, 0, 128, 128);
  // Parking stall markings
  ctx.fillStyle = '#ffffff';
  for (let y = 8; y < 128; y += 28) {
    ctx.fillRect(12, y, 42, 2);
    ctx.fillRect(74, y, 42, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  lotTexture._cache = tex;
  return tex;
}

function padTexture() {
  if (padTexture._cache) return padTexture._cache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b2b7bf';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#9aa0a8';
  for (let y = 0; y < 128; y += 32) ctx.fillRect(0, y, 128, 1);
  for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 1, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  padTexture._cache = tex;
  return tex;
}

// Rivals get the flat tinted ring they always had. The player gets a skin from
// js/skins.js instead — same disc, same y-stack, but the ring is replaced by
// whatever the equipped row builds.
function makeHoleMesh(color, skin) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(circleGeo(), new THREE.MeshBasicMaterial({ color: 0x05060a }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;

  const voidSwirl = new THREE.Mesh(circleGeo(), new THREE.MeshBasicMaterial({
    map: voidSwirlTexture(), transparent: true, opacity: 0.85, depthWrite: false,
  }));
  voidSwirl.rotation.x = -Math.PI / 2;
  voidSwirl.position.y = 0.052;

  group.add(disc, voidSwirl);
  group.userData.disc = disc;
  group.userData.voidSwirl = voidSwirl;

  if (skin) {
    // Skins are authored against the sandbox's ground stack, where the disc
    // sits at 0.01. This one sits at 0.05, so lift the whole group by the
    // difference rather than re-authoring every part's y — that keeps the
    // painter order between rim, teeth, lids and throat rings intact.
    skin.local.position.y = 0.04;
    group.add(skin.local);

    // Power-up Active In-World Auras
    const auraGroup = new THREE.Group();
    const auraGeo = new THREE.RingGeometry(0.96, 1.40, 32);

    const vortexAura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    vortexAura.rotation.x = -Math.PI / 2;
    vortexAura.position.y = 0.054;

    const titanAura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({
      color: 0xff3366, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    titanAura.rotation.x = -Math.PI / 2;
    titanAura.position.y = 0.056;

    const frenzyAura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({
      color: 0xa855f7, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    frenzyAura.rotation.x = -Math.PI / 2;
    frenzyAura.position.y = 0.058;

    const xrayGeo = new THREE.RingGeometry(0.95, 1.10, 48);
    const xrayRim = new THREE.Mesh(xrayGeo, new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    xrayRim.rotation.x = -Math.PI / 2;
    xrayRim.position.y = 0.06;
    xrayRim.renderOrder = 995;
    group.add(xrayRim);

    auraGroup.add(vortexAura, titanAura, frenzyAura);
    group.add(auraGroup);
    group.userData.powerupAuras = { group: auraGroup, vortex: vortexAura, titan: titanAura, frenzy: frenzyAura, xray: xrayRim };
  } else {
    const ring = new THREE.Mesh(ringGeo(), new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.renderOrder = 999;
    group.add(ring);
    group.userData.ring = ring;
  }
  return group;
}

export class World3D {
  // Third parameter is a SKIN ID, not a colour — see js/voxelworld.js for why.
  constructor(canvas, sim, skinId = 'classic', options = {}) {
    this.sim = sim;
    this.reducedMotion = !!options.reducedMotion;
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
    // Horizon atmosphere fog calibrated to sky palette (Stage 3)
    this.scene.fog = theme.night
      ? new THREE.FogExp2(theme.sky, 0.008)
      : new THREE.Fog(theme.sky, this.city.size * 0.85, this.city.size * 2.2);

    // Elevated ambient & hemisphere bounce lighting (Stage 3)
    const amb = new THREE.AmbientLight(0xffffff, theme.night ? 0.35 : 0.52);
    const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, theme.night ? 0.4 : 0.65);
    const sun = new THREE.DirectionalLight(0xfffaed, theme.night ? 0.55 : 0.98);
    sun.position.set(40, 85, 35);
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
    const vMat = new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.92 });
    const hMat = new THREE.MeshStandardMaterial({ map: hTex, roughness: 0.92 });
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

    // --- block pads: concrete base + interior tint per block type (Stage 2) ---
    const padM = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.9 });
    const yardM = new THREE.MeshStandardMaterial({ map: yardTexture(), roughness: 0.85 });
    const lotM = new THREE.MeshStandardMaterial({ map: lotTexture(), roughness: 0.95 });
    for (const b of this.city.blocks) {
      const w = b.xmax - b.xmin, d = b.zmax - b.zmin;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), padM);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((b.xmin + b.xmax) / 2, 0.02, (b.zmin + b.zmax) / 2);
      pad.receiveShadow = true;
      this.scene.add(pad);
      let inner = null;
      if (b.type === 'housing' || b.type === 'park') inner = yardM;
      else if (b.type === 'parking') inner = lotM;
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
    this.skin = makeSkin(skinId);
    this.playerMesh = makeHoleMesh(0, this.skin);
    this.scene.add(this.playerMesh);
    // Ground marks stay where they were laid, so they hang off the scene.
    this.scene.add(this.skin.world);
    this.rivalMeshes = sim.rivals.map(() => {
      const m = makeHoleMesh(0xb44bff);
      this.scene.add(m);
      return m;
    });

    // Power-up 3D beacons
    this.powerupMeshes = new Map();
    for (const pu of sim.powerups || []) {
      this._addPowerUpMesh(pu);
    }

    this._activeFissures = [];
    this._collapsingBuildings = null;
  }

  _addPowerUpMesh(pu) {
    if (this.powerupMeshes.has(pu.id)) return;
    const group = new THREE.Group();
    const color = pu.spec ? pu.spec.color : 0x00d2ff;
    const glowColor = pu.spec ? pu.spec.glowColor : 0x0055ff;

    const base = new THREE.Mesh(cylGeo(), mat(0x1a1a24, { emissive: color }));
    base.scale.set(0.85, 0.12, 0.85);
    base.position.y = 0.06;
    group.add(base);

    const ring = new THREE.Mesh(ringGeo(), mat(color, { emissive: color }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.55;
    ring.scale.setScalar(0.75);
    group.add(ring);

    const core = new THREE.Mesh(boxGeo(), mat(color, { emissive: glowColor }));
    core.scale.set(0.5, 0.5, 0.5);
    core.position.y = 0.55;
    group.add(core);

    group.position.set(pu.x, 0, pu.z);
    this.scene.add(group);
    this.powerupMeshes.set(pu.id, { group, core, ring, pu });
  }

  spawnPowerUpCollectBurst(x, z, color = 0x00d2ff, count = 20) {
    this.spawnBurst(x, z, 2.4, color, 4);
    this.spawnShockRing(x, z, 2.5, color);
  }

  spawnPowerUpSpawnBeams(x, z, color = 0x00d2ff) {
    this.spawnBurst(x, z, 2.4, color, 6);
    this.spawnShockRing(x, z, 2.5, color);
    this.spawnShockRing(x, z, 4.2, 0xffffff);
  }

  syncHole(mesh, h) {
    mesh.position.set(h.x, 0, h.z);
    let scale = h.radius;
    if (h.isPlayer && this._bitePulse > 0.01) {
      scale *= (1 + this._bitePulse * 0.07);
    }
    mesh.userData.disc.scale.setScalar(scale);
    if (mesh.userData.voidSwirl) {
      mesh.userData.voidSwirl.scale.setScalar(scale);
    }
    if (mesh.userData.powerupAuras) {
      mesh.userData.powerupAuras.group.scale.setScalar(scale);
    }
    // The player's mesh has a skin where the ring used to be, and the skin
    // scales itself from the state object rather than from here.
    if (mesh.userData.ring) mesh.userData.ring.scale.setScalar(scale);
  }

  setPerfMode(on) {
    this.perfMode = !!on;
  }

  spawnVortexDustParticle(hx, hz, radius = 2.4, color = 0x00f0ff) {
    if (this.particles && this.particles.length >= (this.perfMode ? 35 : 100)) return;
    const a = pseudoRand() * Math.PI * 2;
    const startDist = radius * (0.8 + pseudoRand() * 0.4);
    const px = hx + Math.cos(a) * startDist;
    const pz = hz + Math.sin(a) * startDist;
    const geo = boxGeo();
    const m = new THREE.Mesh(geo, mat(color, { flat: true, emissive: color }));
    m.position.set(px, 0.12 + pseudoRand() * 0.15, pz);
    m.scale.setScalar(0.08 + pseudoRand() * 0.08);
    this.scene.add(m);
    this.particles = this.particles || [];
    this.particles.push({
      mesh: m,
      isVortex: true,
      angle: a,
      dist: startDist,
      startDist,
      angularSpeed: 3.5 + pseudoRand() * 2.0,
      radialSpeed: (startDist / 0.45),
      vy: -0.15,
      size: 0.1,
      vr: (pseudoRand() - 0.5) * 8,
      life: 0.45,
      maxLife: 0.45,
    });
  }

  spawnHeatEmber(x, z) {
    if (this.particles && this.particles.length >= (this.perfMode ? 35 : 100)) return;
    const geo = boxGeo();
    const c = pseudoRand() > 0.4 ? 0xff3300 : 0xffaa00;
    const m = new THREE.Mesh(geo, mat(c, { flat: true, emissive: c }));
    m.position.set(x, 0.1 + pseudoRand() * 0.15, z);
    m.scale.setScalar(0.07 + pseudoRand() * 0.07);
    this.scene.add(m);
    this.particles = this.particles || [];
    this.particles.push({
      mesh: m,
      isSparks: true,
      vx: (pseudoRand() - 0.5) * 0.8,
      vy: 1.8 + pseudoRand() * 2.2,
      vz: (pseudoRand() - 0.5) * 0.8,
      vr: (pseudoRand() - 0.5) * 10,
      life: 0.35 + pseudoRand() * 0.2,
      maxLife: 0.55,
    });
  }

  spawnSpeedDriftSpark(x, z, vx, vz) {
    if (this.particles && this.particles.length >= (this.perfMode ? 40 : 110)) return;
    const geo = boxGeo();
    const m = new THREE.Mesh(geo, mat(0xffb703, { flat: true, emissive: 0xffb703 }));
    m.position.set(x + (pseudoRand() - 0.5) * 0.3, 0.08, z + (pseudoRand() - 0.5) * 0.3);
    m.scale.setScalar(0.09 + pseudoRand() * 0.07);
    this.scene.add(m);
    this.particles = this.particles || [];
    this.particles.push({
      mesh: m,
      isSparks: true,
      vx: vx * 2.5 + (pseudoRand() - 0.5) * 1.5,
      vy: 0.9 + pseudoRand() * 1.6,
      vz: vz * 2.5 + (pseudoRand() - 0.5) * 1.5,
      vr: (pseudoRand() - 0.5) * 12,
      life: 0.22 + pseudoRand() * 0.15,
      maxLife: 0.37,
    });
  }

  spawnEatParticles(x, z, color = 0xdddddd, count = 8, hradius = 1) {
    if (this.perfMode) count = Math.min(count, 4);
    const geo = boxGeo();
    const matP = mat(color, { flat: true });
    for (let i = 0; i < count; i++) {
      const angle = pseudoRand() * Math.PI * 2;
      const startDist = Math.max(0.5, hradius * (1.05 + pseudoRand() * 0.35));
      const px = x + Math.cos(angle) * startDist;
      const pz = z + Math.sin(angle) * startDist;
      const p = new THREE.Mesh(geo, matP);
      const s = 0.12 + pseudoRand() * 0.14;
      p.scale.setScalar(s);
      p.position.set(px, 0.15 + pseudoRand() * 0.2, pz);
      this.scene.add(p);
      this.particles = this.particles || [];
      this.particles.push({
        mesh: p,
        isVortex: true,
        angle,
        dist: startDist,
        startDist,
        radialSpeed: (hradius * 2.2 + 2.0) * (0.8 + pseudoRand() * 0.5),
        angularSpeed: (4.0 + pseudoRand() * 6.0) * (pseudoRand() < 0.5 ? 1 : -1),
        vy: -0.8 - pseudoRand() * 0.8,
        vr: (pseudoRand() - 0.5) * 12,
        size: s,
        life: 0.35 + pseudoRand() * 0.2,
        maxLife: 0.55,
      });
    }
  }

  spawnShockRing(x, z, radius, color = 0x66ccff) {
    const ring = new THREE.Mesh(ringGeo(), mat(color, { emissive: color }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    ring.scale.setScalar(radius);
    this.scene.add(ring);
    this.particles = this.particles || [];
    this.particles.push({ mesh: ring, isRing: true, life: 0.4, maxLife: 0.4, startRadius: radius });
  }

  spawnBurst(x, z, radius, color = 0xffd23f, sizeLevel = 1) {
    const geo = boxGeo();
    const isBig = sizeLevel >= 5;
    const count = this.perfMode ? (isBig ? 18 : 12) : (isBig ? 36 : 24);
    const palette = [0xffd23f, 0xff2d75, 0x00f0ff, 0x76ff03, 0xffffff, color];
    this.spawnShockRing(x, z, radius * 1.1, color);

    for (let i = 0; i < count; i++) {
      const c = palette[i % palette.length];
      const m = new THREE.Mesh(geo, mat(c, { flat: true }));
      const a = (i / count) * Math.PI * 2 + (pseudoRand() - 0.5) * 0.5;
      const sp = (isBig ? 4.5 : 3.0) + pseudoRand() * (isBig ? 5 : 3.5);
      m.position.set(x + Math.cos(a) * radius * 0.5, 0.3, z + Math.sin(a) * radius * 0.5);
      const s = 0.12 + pseudoRand() * (isBig ? 0.16 : 0.1);
      m.scale.setScalar(s);
      this.scene.add(m);
      this.particles = this.particles || [];
      this.particles.push({
        mesh: m,
        vx: Math.cos(a) * sp,
        vy: (isBig ? 4.5 : 3.0) + pseudoRand() * (isBig ? 4.5 : 3.0),
        vz: Math.sin(a) * sp,
        vr: (pseudoRand() - 0.5) * 12,
        life: 0.75 + pseudoRand() * 0.35,
        maxLife: 1.1,
      });
    }
  }

  spawnGoldenSparkles(x, z, radius, count = 14) {
    if (this.perfMode) count = Math.min(count, 6);
    const geo = boxGeo();
    for (let i = 0; i < count; i++) {
      const c = i % 3 === 0 ? 0xffffff : (i % 2 === 0 ? 0xffe066 : 0xffa500);
      const m = new THREE.Mesh(geo, mat(c, { flat: true, emissive: c }));
      const angle = pseudoRand() * Math.PI * 2;
      const r = pseudoRand() * radius * 0.8;
      m.position.set(x + Math.cos(angle) * r, 0.15 + pseudoRand() * 0.2, z + Math.sin(angle) * r);
      m.scale.setScalar(0.08 + pseudoRand() * 0.08);
      this.scene.add(m);
      this.particles = this.particles || [];
      this.particles.push({
        mesh: m,
        isSparks: true,
        vx: (pseudoRand() - 0.5) * 1.8,
        vy: 3.0 + pseudoRand() * 3.0,
        vz: (pseudoRand() - 0.5) * 1.8,
        vr: (pseudoRand() - 0.5) * 14,
        life: 0.4 + pseudoRand() * 0.25,
        maxLife: 0.65,
      });
    }
  }

  spawnBlockerImpact(x, z, radius, dirX = 0, dirZ = 0) {
    const geo = boxGeo();
    const count = this.perfMode ? 5 : 10;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len, nz = dirZ / len;
    for (let i = 0; i < count; i++) {
      const c = i % 2 === 0 ? 0xffeedd : 0xbbbbbb;
      const m = new THREE.Mesh(geo, mat(c, { flat: true }));
      m.position.set(x + nx * radius * 0.8, 0.2 + pseudoRand() * 0.25, z + nz * radius * 0.8);
      m.scale.setScalar(0.08 + pseudoRand() * 0.08);
      this.scene.add(m);
      const spreadAngle = Math.atan2(nz, nx) + (pseudoRand() - 0.5) * 1.4;
      const sp = 2.0 + pseudoRand() * 3.5;
      this.particles = this.particles || [];
      this.particles.push({
        mesh: m,
        vx: Math.cos(spreadAngle) * sp,
        vy: 1.8 + pseudoRand() * 2.5,
        vz: Math.sin(spreadAngle) * sp,
        vr: (pseudoRand() - 0.5) * 14,
        life: 0.3 + pseudoRand() * 0.2,
        maxLife: 0.5,
      });
    }
  }

  spawnDustPuff(x, z, size = 0.45, vx = 0, vz = 0) {
    if (this.particles && this.particles.length > (this.perfMode ? 35 : 100)) return;
    const geo = boxGeo();
    const m = new THREE.Mesh(geo, mat(0xd0d5dd, { flat: true, transparent: true, opacity: 0.35 }));
    m.position.set(x + (pseudoRand() - 0.5) * 0.25, 0.05, z + (pseudoRand() - 0.5) * 0.25);
    m.scale.setScalar(size * 0.6);
    this.scene.add(m);
    this.particles = this.particles || [];
    this.particles.push({
      mesh: m,
      isDust: true,
      startScale: size,
      vx: vx * 0.3 + (pseudoRand() - 0.5) * 0.4,
      vy: 0.25 + pseudoRand() * 0.35,
      vz: vz * 0.3 + (pseudoRand() - 0.5) * 0.4,
      vr: (pseudoRand() - 0.5) * 2,
      life: 0.32,
      maxLife: 0.32,
    });
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
    const maxVoxelCap = this.perfMode ? 16 : 48;
    
    group.traverse((child) => {
      if (child.isMesh && child.geometry && voxels.length < maxVoxelCap) {
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
              if (voxels.length >= maxVoxelCap) break;
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
                targetX: holeX + (dx / dist) * (pseudoRand() * 0.5),
                targetZ: holeZ + (dz / dist) * (pseudoRand() * 0.5),
                rotAxis: new THREE.Vector3(pseudoRand() - 0.5, pseudoRand() - 0.5, pseudoRand() - 0.5).normalize(),
                rotSpeed: 4 + pseudoRand() * 8,
                delay: (dist / (hole ? hole.radius + 2 : 1)) * 0.15 + pseudoRand() * 0.1,
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

  // ------------------------------------------------------------------- skins
  //
  // The sandbox renderer's twin — see js/voxelworld.js for the reasoning. One
  // reused state object, no allocation, and every field a skin can read
  // gathered in one place so js/skins.js never reaches into a sim.
  _skinFrame(dt, h) {
    // See js/voxelworld.js: a frame after dispose() must not throw.
    if (!this.skin) return null;
    const st = this._skinState || (this._skinState = {
      t: 0, dt: 0, radius: 1, glow: 0, chain: 0, chainTimer: 0, size: 1, sizeFrac: 0,
      progress: 0, speed: 0, heading: 0, x: 0, z: 0, camDist: 40, reduced: false,
      sectorMass: new Float32Array(16),
    });
    this._skinTime = (this._skinTime || 0) + dt;
    if (dt > 0) {
      const dx = h.x - (this._skinPX ?? h.x), dz = h.z - (this._skinPZ ?? h.z);
      st.speed = Math.hypot(dx, dz) / dt;
    }
    this._skinPX = h.x; this._skinPZ = h.z;
    // Byte-for-byte the sandbox's rim-glow curve. The campaign never had one —
    // its ring was a flat colour — so this is the campaign GAINING the combo
    // build-up and the about-to-drop blink, on all seventeen skins at once.
    let glow = Math.min(0.6, h.chain * 0.05);
    if (h.chainTimer > 0 && h.chainTimer < 0.5 && Math.sin(this._skinTime * 24) > 0) glow = 0.9;

    st.t = this._skinTime; st.dt = dt;
    st.radius = h.radius; st.glow = glow;
    st.chain = h.chain; st.chainTimer = h.chainTimer;
    // The campaign's "how big am I" is the edible tier, not a SIZE ladder: it is
    // the number that decides what the player is allowed to eat next.
    const tier = edibleTierUpTo(h.radius);
    st.size = tier; st.sizeFrac = 0;
    st.progress = this.sim.level && this.sim.level.target
      ? Math.min(1, h.mass / this.sim.level.target) : 0;
    st.x = h.x; st.z = h.z;
    // The player's steering heading, stamped onto the hole by main.js. Skins
    // with a directional element (A/B Split's axis, the reduced-motion
    // Impressions head, the Attribution trail) are welded to it — it is the
    // player's own steering made visible, which is also the only on-screen
    // feedback for the heading mid-turn in the campaign, whose camera does
    // not follow.
    st.heading = h.heading || 0;
    st.camDist = this._skinCamDist ?? st.camDist;
    st.reduced = this.reducedMotion;
    this._skinSectors(h, st.sectorMass);

    // There is no `growth` event either — the campaign's radius moves
    // continuously on every meal. Crossing into a new edible tier is the real
    // "you got bigger" beat: a whole class of the city just became food.
    if (this._skinTier === undefined) this._skinTier = tier;
    else if (tier > this._skinTier) { this._skinTier = tier; this.skin.onGrowth(st, tier); }
    return st;
  }

  // Structure mass per bearing sector, for the skins that point at things.
  // `this.blockers` is already maintained against consumption (an eaten
  // building is spliced out at :581), so it is the broad phase to reuse rather
  // than one to add. Every 4th frame; both consumers damp their own response.
  _skinSectors(h, out) {
    if ((this._skinSectorTick = (this._skinSectorTick || 0) + 1) % 4 !== 1) return;
    out.fill(0);
    const bl = this.blockers;
    if (!bl) return;
    const R = Math.max(18, h.radius * 2.6), R2 = R * R;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      if (b.h <= 0) continue;
      const dx = (b.minX + b.maxX) * 0.5 - h.x, dz = (b.minZ + b.maxZ) * 0.5 - h.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      const s = ((Math.atan2(dz, dx) / (Math.PI * 2) + 1) * 16 | 0) % 16;
      out[s] = Math.min(1, out[s] + b.h * 0.05 * (1 - d2 / R2));
    }
  }

  setReducedMotion(on) { this.reducedMotion = !!on; }

  spawnFaultLineFissure(x0, z0, x1, z1, angle, length, duration = 0.8) {
    const steps = Math.max(16, Math.min(50, Math.round(length / 2.5)));
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const perpX = -sinA;
    const perpZ = cosA;

    const group = new THREE.Group();
    const crackSegments = [];

    const magmaMat = new THREE.MeshBasicMaterial({
      color: 0xff3b00,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x1f1917,
      roughness: 0.9,
      metalness: 0.1,
    });

    const boxG = boxGeo();

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const segX = x0 + (x1 - x0) * t;
      const segZ = z0 + (z1 - z0) * t;

      const jag = (pseudoRand() - 0.5) * 1.5;
      const jagWidth = 1.4 + pseudoRand() * 1.6;
      const jagDepth = 0.16 + pseudoRand() * 0.2;

      // Magma glowing crevasse
      const core = new THREE.Mesh(boxG, magmaMat);
      core.scale.set(jagWidth * 0.85, jagDepth, (length / steps) * 1.1);
      core.position.set(segX + perpX * jag, 0.02, segZ + perpZ * jag);
      core.rotation.y = -angle;
      core.visible = false;
      group.add(core);

      // Left lifted crust slab
      const slabL = new THREE.Mesh(boxG, slabMat);
      slabL.scale.set(jagWidth * 0.55, 0.22, (length / steps) * 0.95);
      slabL.position.set(segX + perpX * (jag - jagWidth * 0.52), 0.06, segZ + perpZ * (jag - jagWidth * 0.52));
      slabL.rotation.y = -angle;
      slabL.rotation.z = (pseudoRand() * 0.2 + 0.08);
      slabL.visible = false;
      group.add(slabL);

      // Right lifted crust slab
      const slabR = new THREE.Mesh(boxG, slabMat);
      slabR.scale.set(jagWidth * 0.55, 0.22, (length / steps) * 0.95);
      slabR.position.set(segX + perpX * (jag + jagWidth * 0.52), 0.06, segZ + perpZ * (jag + jagWidth * 0.52));
      slabR.rotation.y = -angle;
      slabR.rotation.z = -(pseudoRand() * 0.2 + 0.08);
      slabR.visible = false;
      group.add(slabR);

      // Branch crack
      let branch = null;
      if (s % 3 === 0 && s > 0 && s < steps - 1) {
        const branchSign = pseudoRand() > 0.5 ? 1 : -1;
        const branchLen = 2.0 + pseudoRand() * 3.5;
        const branchMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.85, depthWrite: false });
        branch = new THREE.Mesh(boxG, branchMat);
        branch.scale.set(0.3, 0.06, branchLen);
        const bAngle = angle + branchSign * (0.6 + pseudoRand() * 0.5);
        branch.position.set(
          segX + perpX * (jag + branchSign * 1.1),
          0.03,
          segZ + perpZ * (jag + branchSign * 1.1)
        );
        branch.rotation.y = -bAngle;
        branch.visible = false;
        group.add(branch);
      }

      crackSegments.push({
        t,
        x: segX + perpX * jag,
        z: segZ + perpZ * jag,
        core,
        slabL,
        slabR,
        branch,
        delay: t * duration,
        activated: false,
      });
    }

    this.scene.add(group);
    if (!this._activeFissures) this._activeFissures = [];
    this._activeFissures.push({
      group,
      magmaMat,
      slabMat,
      crackSegments,
      duration,
      elapsed: 0,
      life: 6.0,
    });
  }

  skipQuakeCinematic() {
    if (this._collapsingBuildings && this._collapsingBuildings.length > 0) {
      for (const cb of this._collapsingBuildings) {
        if (!cb.fractured) {
          cb.fractured = true;
          this.fractureMeshToVoxels(cb.group, null, 0.4);
          this.scene.remove(cb.group);
        }
      }
      this._collapsingBuildings = null;
    }
    if (this._activeFissures && this._activeFissures.length > 0) {
      for (const f of this._activeFissures) {
        for (const seg of f.crackSegments) {
          seg.activated = true;
          seg.core.visible = true;
          seg.slabL.visible = true;
          seg.slabR.visible = true;
          if (seg.branch) seg.branch.visible = true;
        }
      }
    }
    this._quakeFxQueue = null;
  }

  // Apply sim events (eats, tides, unlock) then per-frame animation.
  update(dt, events) {
    const sim = this.sim;

    // --- Active 3D Tectonic Fissures Animation ---
    if (this._activeFissures && this._activeFissures.length > 0) {
      const remainingFissures = [];
      for (const f of this._activeFissures) {
        f.elapsed += dt;
        for (const seg of f.crackSegments) {
          if (!seg.activated && f.elapsed >= seg.delay) {
            seg.activated = true;
            seg.core.visible = true;
            seg.slabL.visible = true;
            seg.slabR.visible = true;
            if (seg.branch) seg.branch.visible = true;
            this.spawnShockRing(seg.x, seg.z, 6.0, 0xff5500);
            this.spawnBurst(seg.x, seg.z, 2.5, 0xff8800, 8);
            this.spawnDustPuff(seg.x, seg.z, 1.3, 0, 0);
            this.spawnHeatEmber(seg.x, seg.z);
          }
        }
        if (f.elapsed > f.duration + 2.0) {
          const fadeProgress = (f.elapsed - (f.duration + 2.0)) / 2.5;
          f.magmaMat.opacity = Math.max(0, 0.95 * (1 - fadeProgress));
        }
        if (f.elapsed < f.life) {
          remainingFissures.push(f);
        } else {
          this.scene.remove(f.group);
        }
      }
      this._activeFissures = remainingFissures.length > 0 ? remainingFissures : [];
    }

    // --- Collapsing Buildings along Fault Line ---
    if (this._collapsingBuildings && this._collapsingBuildings.length > 0) {
      const remainingBuildings = [];
      for (const cb of this._collapsingBuildings) {
        cb.delay -= dt;
        if (cb.delay <= 0 && cb.state === 'waiting') {
          cb.state = 'collapsing';
          this.spawnDustPuff(cb.obj.x, cb.obj.z, Math.max(1.5, (cb.obj.radius || 1.5) * 1.4), 0, 0);
          this.spawnBurst(cb.obj.x, cb.obj.z, Math.max(2.5, (cb.obj.radius || 1.5) * 1.6), 0xff6600, 10);
        }
        if (cb.state === 'collapsing') {
          cb.elapsed += dt;
          const u = Math.min(1, cb.elapsed / 0.45);
          const tiltRad = u * 0.95 * cb.tiltDir;
          cb.group.position.y = -u * 1.6;
          cb.group.rotation.x = cb.origRotX + Math.sin(cb.angle) * tiltRad;
          cb.group.rotation.z = cb.origRotZ + Math.cos(cb.angle) * tiltRad;
          cb.group.scale.setScalar(Math.max(0.01, 1 - u * 0.6));
          if (u >= 0.38 && !cb.fractured) {
            cb.fractured = true;
            this.spawnEatParticles(cb.obj.x, cb.obj.z, 0xd0d5dd, 14, cb.obj.radius || 1.5);
            this.fractureMeshToVoxels(cb.group, null, 0.5);
            this.scene.remove(cb.group);
          }
          if (u < 1) {
            remainingBuildings.push(cb);
          }
        } else {
          remainingBuildings.push(cb);
        }
      }
      this._collapsingBuildings = remainingBuildings.length > 0 ? remainingBuildings : null;
    }

    // --- propagating fault-line VFX legacy queue ---
    if (this._quakeFxQueue && this._quakeFxQueue.length > 0) {
      const remaining = [];
      for (const q of this._quakeFxQueue) {
        q.delay -= dt;
        if (q.delay <= 0) {
          this.spawnShockRing(q.x, q.z, q.size, 0xff5500);
          this.spawnBurst(q.x, q.z, q.size * 0.4, 0xff8800, 10);
          this.spawnDustPuff(q.x, q.z, 1.0, 0, 0);
        } else {
          remaining.push(q);
        }
      }
      this._quakeFxQueue = remaining.length > 0 ? remaining : null;
    }
    // Animate hovering, spinning and dynamic position tracking on power-up items
    for (const item of this.powerupMeshes.values()) {
      const pu = item.pu;
      item.group.position.x = pu.x;
      item.group.position.z = pu.z;

      const bob = Math.sin(this.time * 3.5 + pu.id * 1.5) * 0.14;
      item.core.position.y = 0.55 + bob;
      item.ring.position.y = 0.55 + bob;
      item.core.rotation.y = this.time * 2.2;
      item.core.rotation.x = this.time * 1.4;
      item.ring.rotation.z = this.time * 1.8;

      if (pu.lifespan <= 4.0) {
        const flash = Math.sin(this.time * 18.0) > 0 ? 0.9 : 0.25;
        if (item.core.material) item.core.material.opacity = flash;
        if (item.ring.material) item.ring.material.opacity = flash;
      }
    }

    const st = this._skinFrame(dt, sim.player);
    for (const ev of events) {
      if (ev.type === 'powerup_collect') {
        const item = this.powerupMeshes.get(ev.powerup.id);
        if (item) {
          this.scene.remove(item.group);
          this.powerupMeshes.delete(ev.powerup.id);
        }
        const color = ev.powerup.spec ? ev.powerup.spec.color : 0x00d2ff;
        this.spawnPowerUpCollectBurst(ev.powerup.x, ev.powerup.z, color);
      } else if (ev.type === 'powerup_despawn') {
        const item = this.powerupMeshes.get(ev.powerup.id);
        if (item) {
          this.scene.remove(item.group);
          this.powerupMeshes.delete(ev.powerup.id);
        }
        this.spawnDustPuff(ev.powerup.x, ev.powerup.z, 0.8, 0, 0);
      } else if (ev.type === 'powerup_spawn') {
        this._addPowerUpMesh(ev.powerup);
        const color = ev.powerup.spec ? ev.powerup.spec.color : 0x00d2ff;
        this.spawnPowerUpSpawnBeams(ev.powerup.x, ev.powerup.z, color);
      } else if (ev.type === 'quake') {
        if (ev.x0 != null && ev.x1 != null) {
          const len = Math.hypot(ev.x1 - ev.x0, ev.z1 - ev.z0);
          const propDuration = Math.min(1.0, Math.max(0.6, len * 0.008));
          this.spawnFaultLineFissure(ev.x0, ev.z0, ev.x1, ev.z1, ev.angle, len, propDuration);
          
          if (ev.affected && ev.affected.length > 0) {
            if (!this._collapsingBuildings) this._collapsingBuildings = [];
            for (const obj of ev.affected) {
              const g = this.meshById.get(obj.id);
              if (g) {
                this.meshById.delete(obj.id);
                const bi = this.blockers.findIndex((b) => b.id === obj.id);
                if (bi >= 0) this.blockers.splice(bi, 1);
                const delay = (obj.longDist / Math.max(1, len)) * propDuration;
                this._collapsingBuildings.push({
                  group: g,
                  obj,
                  angle: ev.angle,
                  delay,
                  state: 'waiting',
                  elapsed: 0,
                  tiltDir: obj.perpDist >= 0 ? 1 : -1,
                  origRotX: g.rotation.x,
                  origRotZ: g.rotation.z,
                  fractured: false,
                });
              }
            }
          }
        } else {
          this.spawnShockRing(ev.x, ev.z, ev.radius || 24, 0xff7700);
          this.spawnBurst(ev.x, ev.z, 3.5, 0xffaa00, 16);
        }
      } else if (ev.type === 'enter' || ev.flooded) {
        // The bite fires on `enter`, NOT on `eat`. `enter` is pushed the moment
        // the object commits and starts descending; `eat` only lands when the
        // swallow completes, 0.22-0.62 s later (sim.js swallowDuration). A jaw
        // wired to `eat` would close after the building had already gone.
        //
        // Deliberately outside the meshById lookup below: the bite reacts to
        // the EVENT, and an object whose mesh is untracked must not silently
        // swallow the feedback.
        if (st && ev.type === 'enter' && ev.hole && ev.hole.isPlayer) {
          this.skin.onEat(st, ev);
          this._bitePulse = 1.0;
        }
        const g = this.meshById.get(ev.obj.id);
        if (g) {
          if (ev.type === 'enter' && ev.hole) {
            this.spawnEatParticles(ev.obj.x, ev.obj.z, ev.obj.golden ? GOLD : 0xd8dce2, ev.obj.tier >= 4 ? 14 : 8, ev.hole.radius);
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
        if (ev.hole) {
          const dx = (ev.obj.x ?? ev.hole.x) - ev.hole.x;
          const dz = (ev.obj.z ?? ev.hole.z) - ev.hole.z;
          this.spawnBlockerImpact(ev.hole.x, ev.hole.z, ev.hole.radius, dx, dz);
        }
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
      } else if (ev.type === 'unlocked') {
        // The campaign has no `milestone` event. The landmark shield dropping is
        // its one "you have arrived" beat, so that is what the skins react to.
        if (st) this.skin.onMilestone(st, st.progress);
        if (this.shield) { this.scene.remove(this.shield); this.shield = null; }
        this.spawnBurst(sim.player.x, sim.player.z, sim.player.radius * 2, GOLD, 8);
      } else if (ev.type === 'tide') {
        // visually widen the water to the new bounds
        const b = ev.bounds;
        this.water.scale.set(1.2, 1, 1);
        this.water.position.z = b.zmax + (this.city.size - (b.zmax - b.zmin)) * 0.25;
        this.water.position.x = (b.xmin + b.xmax) / 2;
      }
    }

    // Bite pulse decay
    if (this._bitePulse > 0.005) {
      this._bitePulse = Math.max(0, this._bitePulse - dt * 4.5);
    }

    // Hole movement tracking for ground dust puffs
    const p = sim.player;
    const lastX = this._lastPX ?? p.x;
    const lastZ = this._lastPZ ?? p.z;
    const moveDist = Math.hypot(p.x - lastX, p.z - lastZ);
    const speed = dt > 0 ? (moveDist / dt) : 0;
    this._lastPX = p.x;
    this._lastPZ = p.z;

    // Power-up Auras and In-World Status Effects on Player Mesh
    const auras = this.playerMesh.userData.powerupAuras;
    if (auras) {
      const activeList = sim.activePowerUps || [];
      const isVortex = hasActivePowerUp(activeList, POWERUP_TYPES.VORTEX);
      const isTitan = hasActivePowerUp(activeList, POWERUP_TYPES.TITAN);
      const isSpeed = hasActivePowerUp(activeList, POWERUP_TYPES.SPEED);
      const isFrenzy = hasActivePowerUp(activeList, POWERUP_TYPES.FRENZY);

      if (auras.vortex) {
        if (isVortex) {
          auras.vortex.material.opacity = Math.min(0.75, auras.vortex.material.opacity + dt * 4.0);
          auras.vortex.rotation.z += dt * 3.8;
          if (!this.reducedMotion && this.particles.length < (this.perfMode ? 35 : 90)) {
            this._vortexParticleTimer = (this._vortexParticleTimer || 0) + dt;
            if (this._vortexParticleTimer > 0.07) {
              this._vortexParticleTimer = 0;
              this.spawnVortexDustParticle(p.x, p.z, p.radius * 2.2, 0x00f0ff);
            }
          }
        } else {
          auras.vortex.material.opacity = Math.max(0, auras.vortex.material.opacity - dt * 4.0);
        }
      }

      if (auras.titan) {
        if (isTitan) {
          auras.titan.material.opacity = Math.min(0.8, auras.titan.material.opacity + dt * 4.0);
          const pulse = 1.0 + Math.sin(this.time * 9.0) * 0.08;
          auras.titan.scale.set(pulse, pulse, 1);
          if (!this.reducedMotion && this.particles.length < (this.perfMode ? 35 : 90)) {
            this._titanParticleTimer = (this._titanParticleTimer || 0) + dt;
            if (this._titanParticleTimer > 0.08) {
              this._titanParticleTimer = 0;
              const a = pseudoRand() * Math.PI * 2;
              const dist = p.radius * (0.8 + pseudoRand() * 0.35);
              this.spawnHeatEmber(p.x + Math.cos(a) * dist, p.z + Math.sin(a) * dist);
            }
          }
        } else {
          auras.titan.material.opacity = Math.max(0, auras.titan.material.opacity - dt * 4.0);
        }
      }

      if (auras.frenzy) {
        if (isFrenzy) {
          auras.frenzy.material.opacity = Math.min(0.85, auras.frenzy.material.opacity + dt * 4.0);
          auras.frenzy.rotation.z -= dt * 4.5;
          const arcPulse = 1.0 + Math.sin(this.time * 16.0) * 0.06;
          auras.frenzy.scale.set(arcPulse, arcPulse, 1);
        } else {
          auras.frenzy.material.opacity = Math.max(0, auras.frenzy.material.opacity - dt * 4.0);
        }
      }

      if (isSpeed && speed > 2.0 && !this.reducedMotion && this.particles.length < (this.perfMode ? 40 : 110)) {
        this._speedSparkTimer = (this._speedSparkTimer || 0) + dt;
        if (this._speedSparkTimer > 0.045) {
          this._speedSparkTimer = 0;
          const dirX = (p.x - lastX) / (moveDist || 1);
          const dirZ = (p.z - lastZ) / (moveDist || 1);
          this.spawnSpeedDriftSpark(
            p.x - dirX * p.radius * 0.9,
            p.z - dirZ * p.radius * 0.9,
            -dirX, -dirZ
          );
        }
      }
    }

    if (!this.reducedMotion && dt > 0) {
      this._dustTimer = (this._dustTimer || 0) + dt;
      if (speed > 2.8 && this._dustTimer > 0.07) {
        this._dustTimer = 0;
        const dirX = (p.x - lastX) / (moveDist || 1);
        const dirZ = (p.z - lastZ) / (moveDist || 1);
        this.spawnDustPuff(
          p.x - dirX * p.radius * 0.85,
          p.z - dirZ * p.radius * 0.85,
          0.32 + p.radius * 0.06,
          -dirX * 1.5, -dirZ * 1.5
        );
      }
    }

    // eat animations: tip over toward the hole and fall in (timed to the
    // sim's swallow duration) + squash-and-stretch into the void.
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
        // Squash-and-stretch: compression along horizontal, elongation into hole
        const squish = Math.sin(k * Math.PI) * 0.22;
        const scaleBase = Math.max(0.01, 1 - sinkK * 0.7);
        a.g.scale.set(
          scaleBase * (1 - squish),
          scaleBase * (1 + squish * 1.4),
          scaleBase * (1 - squish)
        );
      } else {
        const squish = Math.sin(k * Math.PI) * 0.18;
        a.g.scale.set(
          Math.max(0.01, (1 - k) * (1 - squish)),
          Math.max(0.01, (1 - k) * (1 + squish * 1.3)),
          Math.max(0.01, (1 - k) * (1 - squish))
        );
        a.g.position.y = -k * 2.5;
      }
      if (k >= 1) {
        this.scene.remove(a.g);
        this.anims.splice(i, 1);
      }
    }

    // blocker bounces: compress + spring back
    for (let i = this.bouncing.length - 1; i >= 0; i--) {
      const b = this.bouncing[i];
      b.t += dt;
      const t = b.t;
      if (t > 0.3) {
        b.g.scale.set(1, 1, 1);
        this.bouncing.splice(i, 1);
      } else {
        const squish = Math.sin(t * Math.PI / 0.3) * 0.2;
        b.g.scale.set(1 + squish * 0.5, 1 - squish, 1 + squish * 0.5);
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
        } else if (p.isVortex) {
          p.angle += p.angularSpeed * dt;
          p.dist -= p.radialSpeed * dt;
          p.mesh.position.x = sim.player.x + Math.cos(p.angle) * Math.max(0.01, p.dist);
          p.mesh.position.z = sim.player.z + Math.sin(p.angle) * Math.max(0.01, p.dist);
          p.mesh.position.y += p.vy * dt;
          const scale = Math.max(0.01, p.size * (p.dist / p.startDist) * k);
          p.mesh.scale.set(scale, scale, scale);
          p.mesh.rotation.y += p.vr * dt;
          p.mesh.material.opacity = Math.min(1, k * 1.4);
        } else if (p.isDust) {
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          const s = p.startScale * (0.6 + (1 - k) * 0.9);
          p.mesh.scale.set(s, s * 0.6, s);
          p.mesh.material.opacity = k * 0.35;
        } else if (p.isSparks) {
          p.vy -= 12 * dt;
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          p.mesh.rotation.x += p.vr * dt;
          p.mesh.rotation.y += p.vr * dt;
          p.mesh.material.opacity = k * (0.6 + 0.4 * Math.sin(p.life * 35));
        } else {
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          p.vy -= 9.8 * dt;
          p.mesh.scale.setScalar((0.15 + (1 - k) * 0.1) * k);
        }
        if (p.life <= 0 || (p.isVortex && p.dist <= 0.05)) {
          this.scene.remove(p.mesh);
          this.particles.splice(i, 1);
        }
      }
    }

    this.syncHole(this.playerMesh, sim.player);
    sim.rivals.forEach((r, i) => this.syncHole(this.rivalMeshes[i], r));
    // Last, so every event this frame has already been folded into `st`.
    if (st) this.skin.update(st);
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    if (this.sun) this.sun.castShadow = on;
    this.scene.traverse((c) => { if (c.isMesh) c.material.needsUpdate = true; });
  }

  render(camera) {
    // Skins fade additive detail in with camera distance, and this is the only
    // place the camera exists; update() reads the previous frame's value.
    this._skinCamDist = camera.position.distanceTo(this.playerMesh.position);
    this.renderer.render(this.scene, camera);
  }
  resize(w, h) { this.renderer.setSize(w, h, false); }
  dispose() {
    if (this.powerupMeshes) {
      for (const item of this.powerupMeshes.values()) this.scene.remove(item.group);
      this.powerupMeshes.clear();
    }
    if (this.skin) {
      this.playerMesh.remove(this.skin.local);
      this.scene.remove(this.skin.world);
      this.skin.dispose();
      this.skin = null;
    }
    this.renderer.dispose();
  }
}
