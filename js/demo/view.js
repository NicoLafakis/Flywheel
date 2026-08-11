// Minimal, self-contained overhead renderer for the hot-seat duel.
//
// Deliberately NOT VoxelWorld3D. That renderer is wired to `sim.hole` (one ring,
// one indicator, one chase frame) and the duel rebinds `sim.hole` twice per
// frame, so driving two visuals through it would mean editing it — which this
// build may not do. This draws the same data (`sim.blocks`, which carry world
// centre, per-axis size and colour — ADR-0013) as one InstancedMesh plus one
// disc per player. Readable, not beautiful, which is the demo's bar.

import * as THREE from 'three';
import { moverPose } from '../voxelsim.js';

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const ONE3 = new THREE.Vector3(1, 1, 1);

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
    // The full-city frame, kept under its own name: follow mode (below) writes
    // frameCX/CY/HalfX/HalfY every frame, and the match-end reveal pulls back
    // out to THESE values — the one moment the whole two-colored city is shown.
    this.fullCX = this.frameCX;
    this.fullCY = this.frameCY;
    this.fullHalfX = this.frameHalfX;
    this.fullHalfY = this.frameHalfY;

    // ---- follow camera (arena matches) --------------------------------------
    // Mirrors the single-player sandbox feel (camera.js SANDBOX_ZOOM_IN/OUT
    // driven by sandboxSizeProgress): the window tracks the player's own hole
    // and widens as it grows. Radius is affine in the SIZE ladder
    // (voxelsim.js: START_RADIUS 1.1 → MAX_RADIUS 6.6 across SIZE 1..12), so
    // zoom keys off radius directly. Full-city rendering was the phones' FPS
    // killer on big cities — both devices drew every block and every distant
    // collapse at once; follow mode is what makes the arena smooth there.
    this.followIndex = null;      // hole index to track, or null = full city
    this._fw = 0; this._fh = 0;   // last viewport, for projection updates
    this._followHalf = 0;         // smoothed half-extent (camera space)
    this._followInit = false;
    this._lastMs = 0;
    this._fullPass = true;        // first update() composes every matrix once
    // The renderer refreshes matrixWorldInverse on render; follow/projection
    // math runs BEFORE the first render, so seed it now.
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

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

    this._initMovers();
  }

  // ---- movers (the Chicago el train) ----------------------------------------
  // Same drawing scheme as VoxelWorld3D's _buildMovers, minimal edition: one
  // InstancedMesh per mover, every unit sharing one part list, posed as
  // frame × local. RIDE-phase units pose from the clock (the pure function the
  // sim uses), so a never-stepped peer sim still shows the train lapping the
  // Loop: the host reads sim.time, the peer a local match clock started by
  // moverClockStart() (drift vs the host is cosmetic and seconds-bounded).
  // Fall/ground/rest states only ever exist on the host (its sim steps); the
  // peer's train derails nowhere but disappears when eaten, via the consumed
  // path below.
  _initMovers() {
    this._movers = null;
    this._moverT0 = 0;
    this._eatenMoverIds = new Set();
    const sims = this.sim.moverSim;
    if (!Array.isArray(sims) || !sims.length) return;
    const movers = [];
    try {
      for (const rt of sims) {
        const parts = rt.src && rt.src.parts;
        if (!Array.isArray(parts) || !parts.length) continue;
        // Local part matrices: +z is the direction of travel, dy up from ride height.
        const locals = parts.map((p) => new THREE.Matrix4().compose(
          new THREE.Vector3(p.dx || 0, (p.dy || 0) + (p.sy || 1) / 2, p.dz || 0),
          new THREE.Quaternion(),
          new THREE.Vector3(p.sx || 1, p.sy || 1, p.sz || 1),
        ));
        const geo = new THREE.BoxGeometry(1, 1, 1);
        geo.setAttribute('color', new THREE.BufferAttribute(
          new Float32Array(geo.attributes.position.count * 3).fill(1), 3,
        ));
        const mesh = new THREE.InstancedMesh(
          geo,
          new THREE.MeshLambertMaterial({ vertexColors: true }),
          rt.units.length * locals.length,
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        const c = new THREE.Color();
        for (let u = 0; u < rt.units.length; u++) {
          for (let i = 0; i < locals.length; i++) {
            mesh.setColorAt(u * locals.length + i, c.setHex(Number.isFinite(parts[i].color) ? parts[i].color : 0x888888));
          }
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.scene.add(mesh);
        movers.push({ rt, locals, mesh, frame: new THREE.Matrix4(), out: new THREE.Matrix4(), q2: new THREE.Quaternion() });
      }
    } catch (e) {
      console.warn('[duelview] movers ignored:', e);   // never take the match down
    }
    if (movers.length) this._movers = movers;
  }

  /** Start the peer-side ride clock (called at match start on either role;
   * the host poses from sim.time and ignores it). */
  moverClockStart() { this._moverT0 = performance.now(); }

  /** A wire-fed eat whose id names a mover unit, not a block. */
  noteMoverConsumed(id) { this._eatenMoverIds.add(id); }

  _tickMovers() {
    const clock = this.sim.time > 0 ? this.sim.time
      : (this._moverT0 ? (performance.now() - this._moverT0) / 1000 : 0);
    for (const m of this._movers) {
      const rt = m.rt, n = m.locals.length;
      for (let u = 0; u < rt.units.length; u++) {
        const st = rt.units[u];
        if (st.phase === 'consumed' || this._eatenMoverIds.has(st.id)) {
          m.out.makeScale(0, 0, 0);   // eaten: gone, like any consumed block
          for (let i = 0; i < n; i++) m.mesh.setMatrixAt(u * n + i, m.out);
          continue;
        }
        let px, py, pz, ux, uz, tilt = 0;
        if (st.phase === 'ride') {
          const p = moverPose(rt.arc, st.off + rt.speed * clock);
          px = p.x; py = rt.y; pz = p.z; ux = p.ux; uz = p.uz;
        } else {
          px = st.x; py = st.y; pz = st.z; ux = st.ux; uz = st.uz; tilt = st.tilt || 0;
        }
        this._v.set(px, py, pz);
        this._q.setFromAxisAngle(UP, Math.atan2(ux, uz));
        if (tilt) { m.q2.setFromAxisAngle(AXIS_X, tilt); this._q.multiply(m.q2); }
        m.frame.compose(this._v, this._q, ONE3);
        for (let i = 0; i < n; i++) {
          m.out.multiplyMatrices(m.frame, m.locals[i]);
          m.mesh.setMatrixAt(u * n + i, m.out);
        }
      }
      m.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this._fw = w; this._fh = h;
    this._applyFrame();
  }

  /** Project the current frame (full-city or follow window) at the current
   * aspect. Contain, never crop: whichever axis binds, the other gains slack. */
  _applyFrame() {
    if (!this._fw) return;   // no viewport yet; resize() will project
    const aspect = this._fw / Math.max(1, this._fh);
    let halfW = this.frameHalfX, halfH = this.frameHalfY;
    if (halfW / halfH < aspect) halfW = halfH * aspect; else halfH = halfW / aspect;
    this.camera.left = this.frameCX - halfW; this.camera.right = this.frameCX + halfW;
    this.camera.top = this.frameCY + halfH; this.camera.bottom = this.frameCY - halfH;
    this.camera.updateProjectionMatrix();
  }

  /** Track hole `index` with the progressive follow-zoom; null = full city. */
  setFollow(index) {
    this.followIndex = index;
    this._followInit = false;
    if (index == null) {
      this.frameCX = this.fullCX; this.frameCY = this.fullCY;
      this.frameHalfX = this.fullHalfX; this.frameHalfY = this.fullHalfY;
      this._applyFrame();
    }
  }

  /** Explicit frame write, camera space — the reveal's pull-up drives this. */
  setFrame(cx, cy, halfX, halfY) {
    this.followIndex = null;
    this.frameCX = cx; this.frameCY = cy;
    this.frameHalfX = halfX; this.frameHalfY = halfY;
    this._applyFrame();
  }

  _updateFollow(holes) {
    const h = holes[this.followIndex];
    if (!h) return;
    // Zoom: tight at SIZE 1, wide at SIZE 12 — radius 1.1..6.6 mapped onto a
    // half-extent, clamped so a small city (the gallery) never zooms past its
    // own full frame.
    const t = Math.max(0, Math.min(1, (h.radius - 1.1) / (6.6 - 1.1)));
    const want = Math.min(Math.max(this.fullHalfX, this.fullHalfY), 15 + 30 * t);
    // Camera-space position of the hole (the ortho frame lives in this space).
    this._v.set(h.x, 0, h.z).applyMatrix4(this.camera.matrixWorldInverse);
    const now = performance.now();
    const dt = this._followInit ? Math.min(0.1, (now - this._lastMs) / 1000) : 1;
    this._lastMs = now;
    // Critically-damped-ish exponential follow: fast enough to never lose the
    // hole, slow enough that eating a building does not jolt the frame.
    const k = this._followInit ? 1 - Math.exp(-dt * 5) : 1;
    const kz = this._followInit ? 1 - Math.exp(-dt * 2.5) : 1;
    this._followInit = true;
    this._followHalf += (want - this._followHalf) * kz;
    let cx = this.frameCX + (this._v.x - this.frameCX) * k;
    let cy = this.frameCY + (this._v.y - this.frameCY) * k;
    // Keep the window inside the city's full frame where it fits, so the view
    // never drifts off into empty void past the bounds.
    const clampAxis = (c, full, halfFull, half) =>
      halfFull > half ? Math.min(full + (halfFull - half), Math.max(full - (halfFull - half), c)) : full;
    cx = clampAxis(cx, this.fullCX, this.fullHalfX, this._followHalf);
    cy = clampAxis(cy, this.fullCY, this.fullHalfY, this._followHalf);
    this.frameCX = cx; this.frameCY = cy;
    this.frameHalfX = this._followHalf;
    this.frameHalfY = this._followHalf;
    this._applyFrame();
  }

  /**
   * Per-frame sync. DIRTY-ONLY since the rival-visibility perf pass: the old
   * loop recomposed all N instance matrices every frame — O(70k) on the big
   * cities, twice (two devices), which is what dropped phones through the
   * floor. Now the full pass runs once (first frame / overflow recovery) and a
   * frame touches only what the sim says moved, mirroring VoxelWorld3D's
   * `_syncBlocks` union: `_falling` (live movers) + `_leanSet` (leaners) +
   * `_renderTouch` (every EXIT from those sets, incl. consumption — drained
   * here, load-bearing) — the sim maintains those; a never-stepped peer sim
   * has them empty and its eats arrive via `noteConsumed` instead.
   *
   * In follow mode, movers outside ~2.2× the view span are SKIPPED — a distant
   * collapse costs bookkeeping only. Their retirement still lands through
   * `_renderTouch`, so scrolling over later shows settled rubble, never a
   * mid-air freeze-frame.
   */
  update(holes) {
    const sim = this.sim;
    if (this.followIndex != null) this._updateFollow(holes);

    let touched = false;
    if (this._fullPass !== false || sim._renderTouchOverflow) {
      this._fullPass = false;
      if (sim._renderTouchOverflow) sim._renderTouchOverflow = false;
      const blocks = sim.blocks;
      for (let i = 0; i < blocks.length; i++) this._syncBlock(blocks[i]);
      touched = true;
    } else {
      // Cull center: the followed hole (world space). Off = infinite radius.
      let cull = false, cx = 0, cz = 0, cr = 0;
      const fh = this.followIndex != null ? holes[this.followIndex] : null;
      if (fh) {
        cull = true; cx = fh.x; cz = fh.z;
        cr = Math.max(40, this._followHalf * 2.2);
      }
      const f = sim._falling || [];
      for (let i = 0; i < f.length; i++) {
        const b = f[i];
        if (cull && (Math.abs(b.x - cx) > cr || Math.abs(b.z - cz) > cr)) continue;
        this._syncBlock(b); touched = true;
      }
      if (sim._leanSet) {
        for (const b of sim._leanSet) {
          if (cull && (Math.abs(b.x - cx) > cr || Math.abs(b.z - cz) > cr)) continue;
          this._syncBlock(b); touched = true;
        }
      }
      const touch = sim._renderTouch;
      if (touch && touch.length) {
        for (let i = 0; i < touch.length; i++) this._syncBlock(touch[i]);
        touch.length = 0;
        touched = true;
      }
    }
    if (touched) this.blockMesh.instanceMatrix.needsUpdate = true;
    if (this._movers) this._tickMovers();

    for (let i = 0; i < this.holes.length; i++) {
      const h = holes[i], v = this.holes[i];
      v.group.position.set(h.x, 0.05, h.z);
      v.disc.scale.setScalar(h.radius);
      v.ring.scale.setScalar(h.radius);
    }
  }

  _syncBlock(b) {
    if (b.state === 'consumed') {
      // Collapse the instance to nothing rather than removing it — index
      // stability is what keeps the colour attribute valid. Once is enough.
      if (b._dvHidden) return;
      b._dvHidden = true;
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
    this.blockMesh.setMatrixAt(b.bi, this._m);
  }

  /** A wire-fed page (the arena peer) reports eats here — its sim never steps,
   * so nothing else would ever collapse the instance. */
  noteConsumed(b) {
    this._syncBlock(b);
    this.blockMesh.instanceMatrix.needsUpdate = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export { UP };
