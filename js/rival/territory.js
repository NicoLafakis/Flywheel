// Territory bookkeeping — WHICH ground cells are claimed, by WHOM (pattern 1).
//
// Pure data half of the crater tint: the renderer half (territory-layer.js)
// only executes the actions this map returns. Kept separate so determinism is
// testable headless (no three.js here) and so the same bookkeeping can drive
// any future surface (heatmaps, the booth spectator view).
//
// The unit is a ground COLUMN — blocks stacked in one footprint share a fine
// (gx, gz) min-corner, so a 12-block tower marks ONE tile when its first block
// is eaten and never again. That is the whole cost story: no per-frame work,
// no repaint; one cheap map lookup per eat event, ever.
//
// DETERMINISM RULE: a cell's owner is the eater of the LOWEST block id eaten
// in that column. Block ids are minted in build order (identical on every
// client — shared seed), so whatever order the news arrives in — live events,
// healed keyframes, a late join — every screen converges on the same color for
// every tile. Arrival-order ownership would let two screens disagree forever.
//
// No Math.random, no Date.now, no I/O (CC-2). Writes nothing into the sim.

export class TerritoryMap {
  constructor() {
    this.cells = new Map();   // "gx,gz" -> { index, slot, id, x, z, sx, sz }
  }

  get size() { return this.cells.size; }

  /**
   * Mark a block eaten by `slot`. Returns the render action to perform:
   *   { type: 'add',     cell }  — new tile, place + color it
   *   { type: 'recolor', cell }  — existing tile changed owner (lower id won)
   *   null                       — nothing visual changed
   * @param {object} b  the block (id, gx, gz, x, z, sx, sz from the local build)
   */
  mark(b, slot) {
    if (!b || b.id == null || slot == null || slot < 0) return null;
    const key = b.gx + ',' + b.gz;
    const cell = this.cells.get(key);
    if (!cell) {
      const fresh = { index: this.cells.size, slot, id: b.id, x: b.x, z: b.z, sx: b.sx, sz: b.sz };
      this.cells.set(key, fresh);
      return { type: 'add', cell: fresh };
    }
    if (b.id < cell.id) {
      cell.id = b.id;
      if (cell.slot !== slot) {
        cell.slot = slot;
        return { type: 'recolor', cell };
      }
    }
    return null;
  }

  /** Tile counts per slot — the "two distinct colors on both screens" probe. */
  countBySlot() {
    const out = new Map();
    for (const cell of this.cells.values()) out.set(cell.slot, (out.get(cell.slot) || 0) + 1);
    return out;
  }
}

/** Distinct ground columns in a block list — the layer's instance capacity. */
export function columnCount(blocks) {
  const seen = new Set();
  for (const b of blocks) seen.add(b.gx + ',' + b.gz);
  return seen.size;
}
