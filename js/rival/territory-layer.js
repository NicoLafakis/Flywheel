// The render half of the crater tint (pattern 1): one InstancedMesh of flat
// ground tiles, colored per eater via js/rival/identity.js.
//
// Cost story, stated because it is the design: ONE draw call for all territory
// on screen, ZERO per-frame work. A tile's matrix and color are written once,
// when territory.js says a column was claimed (or recolored — rare, converging
// clients only). Nothing here runs in the render loop at all.
//
// The tiles sit at TINT_Y — above the ground plane (−0.02), below the hole
// discs (0.05) — so claimed ground reads as painted turf and an un-eaten block
// can never look eaten: standing geometry draws over the tile (AC-01.7).

import * as THREE from 'three';
import { slotColorHex } from './identity.js';
import { RIVAL } from './constants.js';

export class TerritoryLayer {
  /**
   * @param {THREE.Scene} scene
   * @param {number} capacity  max distinct tiles (territory.columnCount)
   */
  constructor(scene, capacity) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);   // flat on the ground, baked into the geometry
    // Seed a white vertex-color attribute so instanceColor multiplies through
    // intact — same vendored-three quirk DuelView documents for its blocks.
    geo.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geo.attributes.position.count * 3).fill(1), 3,
    ));
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: RIVAL.TINT_OPACITY,
        depthWrite: false,
      }),
      Math.max(1, capacity),
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;   // after the ground, before the rings
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
  }

  /** Execute one TerritoryMap action ('add' or 'recolor'). */
  apply(action) {
    if (!action) return;
    const cell = action.cell;
    if (cell.index >= this.mesh.instanceMatrix.count) return;   // capacity guard
    if (action.type === 'add') {
      this._m.makeScale(cell.sx * RIVAL.TINT_INSET, 1, cell.sz * RIVAL.TINT_INSET);
      this._m.setPosition(cell.x, RIVAL.TINT_Y, cell.z);
      this.mesh.setMatrixAt(cell.index, this._m);
      this.mesh.instanceMatrix.needsUpdate = true;
      if (cell.index >= this.mesh.count) this.mesh.count = cell.index + 1;
    }
    this._c.setHex(slotColorHex(cell.slot));
    this.mesh.setColorAt(cell.index, this._c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
