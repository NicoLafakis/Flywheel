// Minimal, self-contained overhead renderer for the hot-seat duel.
//
// Deliberately NOT VoxelWorld3D. That renderer is wired to `sim.hole` (one ring,
// one indicator, one chase frame) and the duel rebinds `sim.hole` twice per
// frame, so driving two visuals through it would mean editing it — which this
// build may not do. This draws the same data (`sim.blocks`, which carry world
// centre, per-axis size and colour — ADR-0013) as one InstancedMesh plus one
// disc per player. Readable, not beautiful, which is the demo's bar.

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class DuelView {
  constructor(canvas, sim, playerColors) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x11151c);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x11151c, 90, 190);

    // Fixed overhead-ish orthographic frame. No yaw on purpose: with the camera
    // on the +z axis, screen-right is world +x and screen-up is world -z, so the
    // keyboard mapping in demo.js is the identity and needs no basis at all.
    // The elevation is a compromise — high enough that both holes are always on
    // screen and never occluded, low enough that towers still read as towers.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.camera.position.set(0, 78, 62);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    // Frame the play volume by PROJECTING ITS CORNERS into camera space, rather
    // than by a hand-picked world radius. A tilted orthographic camera mixes z
    // and y into screen-vertical (this one sits ~51 deg above the horizon, so a
    // 20 m tower contributes about 12 m of screen height and the far edge of the
    // arena contributes another 19 m), and a single scalar radius cannot express
    // that — the first hand-set value left the city occupying a third of the
    // frame with the rest empty ground. The volume is everything the match can
    // ever put on screen: the hole clamp in x/z (sim.bounds / boundsRect) unioned
    // with the block extents, from the ground to the tallest roof.
    const r = sim.boundsRect || { minX: -sim.bounds, maxX: sim.bounds, minZ: -sim.bounds, maxZ: sim.bounds };
    let minX = r.minX, maxX = r.maxX, minZ = r.minZ, maxZ = r.maxZ, maxY = 1;
    for (const b of sim.blocks) {
      if (b.x - b.sx / 2 < minX) minX = b.x - b.sx / 2;
      if (b.x + b.sx / 2 > maxX) maxX = b.x + b.sx / 2;
      if (b.z - b.sz / 2 < minZ) minZ = b.z - b.sz / 2;
      if (b.z + b.sz / 2 > maxZ) maxZ = b.z + b.sz / 2;
      if (b.y + b.sy / 2 > maxY) maxY = b.y + b.sy / 2;
    }
    const inv = this.camera.matrixWorldInverse;
    const p = new THREE.Vector3();
    let cx0 = Infinity, cx1 = -Infinity, cy0 = Infinity, cy1 = -Infinity;
    for (const x of [minX, maxX]) {
      for (const y of [0, maxY]) {
        for (const z of [minZ, maxZ]) {
          p.set(x, y, z).applyMatrix4(inv);
          if (p.x < cx0) cx0 = p.x; if (p.x > cx1) cx1 = p.x;
          if (p.y < cy0) cy0 = p.y; if (p.y > cy1) cy1 = p.y;
        }
      }
    }
    const MARGIN = 1.06;   // a little air so nothing kisses the edge
    // Off-centre volumes are handled by SHIFTING the frame, not by inflating a
    // symmetric one — inflating would re-introduce the dead ground this fixes.
    this.frameCX = (cx0 + cx1) / 2;
    this.frameCY = (cy0 + cy1) / 2;
    this.frameHalfX = ((cx1 - cx0) / 2) * MARGIN;
    this.frameHalfY = ((cy1 - cy0) / 2) * MARGIN;

    this.scene.add(new THREE.AmbientLight(0xa8c0d8, 1.05));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(40, 90, 35);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6f86a8, 0.5);
    fill.position.set(-45, 30, -30);
    this.scene.add(fill);

    // Ground. Sits a hair below y=0 so it never z-fights the floor blocks.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ color: 0x2b3340 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    // ---- blocks -------------------------------------------------------------
    const n = sim.blocks.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // `instanceColor` only reaches the fragment stage when the material has
    // vertexColors on, because the vendored three (0.160.0) emits
    //   vColor = vec3(1.0);  #ifdef USE_COLOR  vColor *= color;  #endif
    //   #ifdef USE_INSTANCING_COLOR  vColor.xyz *= instanceColor.xyz;  #endif
    // — so USE_COLOR is what declares vColor at all, and a geometry with no
    // `color` attribute has that attribute default to (0,0,0), which multiplies
    // every instance colour to black. Observed exactly that: a correct scene
    // rendered as flat black silhouettes. Seeding the attribute with ones makes
    // the multiply an identity and hands the instance colour through intact.
    geo.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geo.attributes.position.count * 3).fill(1), 3,
    ));
    this.blockMesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      n,
    );
    this.blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blockMesh.frustumCulled = false;
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      col.setHex(sim.blocks[i].color);
      this.blockMesh.setColorAt(i, col);
    }
    if (this.blockMesh.instanceColor) this.blockMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.blockMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Vector3(0, 0, 0);

    // ---- holes --------------------------------------------------------------
    // A near-black disc reads as the opening; the coloured ring around it is what
    // tells the two players apart at a glance from across a room.
    this.holes = playerColors.map((hex) => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40),
        new THREE.MeshBasicMaterial({ color: 0x05070a }),
      );
      disc.rotation.x = -Math.PI / 2;
      // The RING and the beacon draw through geometry (depthTest off, drawn
      // last); the disc does not. That split is deliberate: at SIZE 1 a hole is
      // 1.1 m across in a frame 60 m wide and it spawns among towers taller than
      // the camera's grazing angle, so a depth-tested outline simply disappears
      // behind a facade and the player loses their own hole on stream. The black
      // disc stays depth-tested because an opening drawn OVER the building in
      // front of it would read as a hole in the wrong surface.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.3, 48),
        new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0.95,
          side: THREE.DoubleSide, depthTest: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 10;
      // Tall beacon, same reason: it is how a player finds their own hole in one
      // glance rather than by hunting for a ring among the rubble.
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 30, 10),
        new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0.45, depthTest: false,
        }),
      );
      beacon.position.y = 15;
      beacon.renderOrder = 9;
      g.add(disc); g.add(ring); g.add(beacon);
      this.scene.add(g);
      return { group: g, disc, ring, beacon };
    });
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);
    // Contain, never crop: take whichever axis is the binding constraint at this
    // aspect and let the other one gain the slack.
    let halfW = this.frameHalfX, halfH = this.frameHalfY;
    if (halfW / halfH < aspect) halfW = halfH * aspect; else halfH = halfW / aspect;
    this.camera.left = this.frameCX - halfW; this.camera.right = this.frameCX + halfW;
    this.camera.top = this.frameCY + halfH; this.camera.bottom = this.frameCY - halfH;
    this.camera.updateProjectionMatrix();
  }

  update(holes) {
    const blocks = this.sim.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.state === 'consumed') {
        // Collapse the instance to nothing rather than removing it — index
        // stability is what keeps the colour attribute valid.
        this._m.compose(this._zero, this._q.identity(), this._zero);
      } else {
        this._v.set(b.x, b.y, b.z);
        this._s.set(b.sx, b.sy, b.sz);
        if (b.rotX || b.rotZ) {
          this._e.set(b.rotX, 0, b.rotZ);
          this._q.setFromEuler(this._e);
        } else {
          this._q.identity();
        }
        this._m.compose(this._v, this._q, this._s);
      }
      this.blockMesh.setMatrixAt(i, this._m);
    }
    this.blockMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.holes.length; i++) {
      const h = holes[i], v = this.holes[i];
      v.group.position.set(h.x, 0.05, h.z);
      v.disc.scale.setScalar(h.radius);
      v.ring.scale.setScalar(h.radius);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export { UP };
