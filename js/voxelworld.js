// Three.js renderer for the Voxel Sandbox pile simulation.
// Blocks render as one InstancedMesh per material (~7 draw calls total instead
// of one mesh per block — the sandbox hovers near the ~800 draw-call threshold
// STATUS flags). All per-block motion (chunk rotation, debris tumble, rim
// tilt, stress wobble) is composed into instance matrices each frame.
import * as THREE from 'three';

const geoCache = new Map();
function boxGeo() { if (!geoCache.has('box')) geoCache.set('box', new THREE.BoxGeometry(1, 1, 1)); return geoCache.get('box'); }
function circleGeo() { if (!geoCache.has('circ')) geoCache.set('circ', new THREE.CircleGeometry(1, 32)); return geoCache.get('circ'); }
function ringGeo() { if (!geoCache.has('ring')) geoCache.set('ring', new THREE.RingGeometry(0.92, 1, 32)); return geoCache.get('ring'); }

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({
      color, roughness: 0.8, metalness: 0.1, flatShading: true,
    }));
  }
  return matCache.get(color);
}

export class VoxelWorld3D {
  constructor(canvas, sim, skinColor = 0xb44bff) {
    this.sim = sim;
    this.time = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1f3d);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3f5c, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: 0x2a2f4c, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Scene decor (render-only, set by the scene builder): asphalt roads,
    // park grass, harbor water — thin planes over the ground, below the hole
    // disc (y 0.01/0.02), no physics presence.
    if (sim.sceneDecor) {
      const deco = (r, color, y) => {
        const p = new THREE.Mesh(
          new THREE.PlaneGeometry(r.w, r.d),
          new THREE.MeshStandardMaterial({ color, roughness: 1 })
        );
        p.rotation.x = -Math.PI / 2;
        p.position.set(r.x + r.w / 2, y, r.z + r.d / 2);
        p.receiveShadow = true;
        this.scene.add(p);
      };
      for (const r of sim.sceneDecor.roads || []) deco(r, 0x1c2030, 0.004);
      for (const r of sim.sceneDecor.parks || []) deco(r, 0x2d5a33, 0.006);
      for (const r of sim.sceneDecor.water || []) deco(r, 0x16375e, 0.008);
    }

    // Hole Mesh
    this.holeMesh = new THREE.Group();
    const disc = new THREE.Mesh(circleGeo(), new THREE.MeshBasicMaterial({ color: 0x06060c }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    const ring = new THREE.Mesh(ringGeo(), new THREE.MeshBasicMaterial({
      color: skinColor,
      depthTest: false,
      depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.renderOrder = 999;
    this.holeMesh.add(disc, ring);
    this.holeMesh.userData = { disc, ring };
    this.scene.add(this.holeMesh);

    // One InstancedMesh per material × block size × paint color; each block
    // owns a fixed instance index and is scaled to its brick size.
    this.imMeshes = [];
    const byMat = new Map();
    for (const b of sim.blocks) {
      const k = b.matType + ':' + b.s + ':' + b.color;
      if (!byMat.has(k)) byMat.set(k, []);
      byMat.get(k).push(b);
    }
    const boxG = boxGeo();
    const white = new THREE.Color(1, 1, 1);
    for (const [k, list] of byMat) {
      const im = new THREE.InstancedMesh(boxG, mat(list[0].color), list.length);
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      list.forEach((b, i) => {
        b._im = im; b._imIndex = i; b._imHidden = false; b._imTinted = false;
        im.setColorAt(i, white);
      });
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
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
    this._skinColor = new THREE.Color(skinColor);
    this._hotWhite = new THREE.Color(0xffffff);
    this.particles = [];
  }

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

  update(dt) {
    this.time += dt;
    const h = this.sim.hole;
    this.holeMesh.position.set(h.x, 0, h.z);
    this.holeMesh.userData.disc.scale.setScalar(h.radius);
    this.holeMesh.userData.ring.scale.setScalar(h.radius);

    // rim glow: builds with combo intensity; blinks when the chain is about
    // to drop (urgency cue)
    const ringMat = this.holeMesh.userData.ring.material;
    let glow = Math.min(0.6, h.chain * 0.05);
    if (h.chainTimer > 0 && h.chainTimer < 0.5 && Math.sin(this.time * 24) > 0) glow = 0.9;
    ringMat.color.copy(this._skinColor).lerp(this._hotWhite, glow);

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

    for (const b of this.sim.blocks) {
      if (b.state === 'consumed') {
        if (!b._imHidden) {
          b._imHidden = true;
          this._m4.makeScale(0, 0, 0);
          b._im.setMatrixAt(b._imIndex, this._m4);
        }
        continue;
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
      this._e.set(rx, 0, rz);
      this._q.setFromEuler(this._e);
      this._v.set(px, py, pz);
      this._s.set(b.s * 0.95, b.s * 0.95, b.s * 0.95);
      this._m4.compose(this._v, this._q, this._s);
      b._im.setMatrixAt(b._imIndex, this._m4);

      // damage heat: blocks glow hotter as structural damage accumulates, so
      // players can read WHERE the structure is about to fail — and see the
      // damage linger after the hole moves on
      if (b.damage > 0.03) {
        const t = Math.min(1, b.damage);
        this._c.setRGB(1, 1 - 0.75 * t, 1 - 0.85 * t);
        b._im.setColorAt(b._imIndex, this._c);
        b._imTinted = true;
      } else if (b._imTinted) {
        b._imTinted = false;
        b._im.setColorAt(b._imIndex, this._white);
      }
    }
    for (const im of this.imMeshes) {
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    }
  }

  render(camera) { this.renderer.render(this.scene, camera); }
  resize(w, h) { this.renderer.setSize(w, h, false); }
  dispose() {
    for (const im of this.imMeshes) im.dispose();
    this.renderer.dispose();
  }
}
