// Two-hole hot-seat duel driver — now a thin wrapper over the sim's NATIVE
// multi-hole roster (`sim.holes[]`, js/voxelsim.js).
//
// HISTORY. This file used to time-slice the single-hole sim between two
// hand-cloned hole objects (bind hole A, step half the dt, bind hole B, step
// the other half), swapping the sim's hole-keyed caches in and out per slice.
// That build carried a documented artifact: each player's support recalc
// partially healed the rim the other player was undermining. The multi-hole
// refactor moved all of that into the sim itself — both holes step in ONE
// `sim.step(dt, moves)` pass at the full dt, and the support recalc resolves
// undermining against the union of both openings, so the artifact is gone and
// there is nothing left here but roster setup and per-player event routing.
//
// API is unchanged from the time-slicing build: `step(dt, moves)`, `drain(i)`,
// `hole(i)`, `fraction(i)` — js/demo/demo.js needs no edits.

export class Duel {
  /**
   * @param {object} sim  a live VoxelSandboxSim
   * @param {Array<{x:number,z:number}>} spawns one per player
   */
  constructor(sim, spawns) {
    this.sim = sim;
    // The sim is born with holes[0]; move it to the first spawn and seat the
    // rest natively. `heading` is presentational (the view may read it) and
    // the sim never touches it — same convention as js/main.js.
    const h0 = sim.holes[0];
    h0.x = spawns[0].x;
    h0.z = spawns[0].z;
    h0.heading = 0;
    for (let i = 1; i < spawns.length; i++) {
      const h = sim.addHole(spawns[i].x, spawns[i].z);
      h.heading = 0;
    }
    this._events = spawns.map(() => []);
  }

  /**
   * Advance the shared world by `dt` — one real multi-hole step, no slicing.
   * @param {number} dt seconds
   * @param {Array<{x:number,z:number}>} moves one per player, same order as spawns
   */
  step(dt, moves) {
    this.sim.step(dt, moves);
    // `over` is the sim's goal latch. The duel ends on the clock, not on the
    // goal, so never let one player's goal freeze the world for the other; the
    // banner reports fractions instead. (`won` is left alone so the goal event
    // cannot re-fire every step once crossed.)
    this.sim.over = false;
    // Events carry `hole`; route each to the hole's roster index so every
    // player's juice stays on their own side. Hole-less world events (crash)
    // go to player 0, exactly as attributable as they ever were in this demo
    // (nothing consumes them).
    const evs = this.sim.drainEvents();
    for (const e of evs) {
      const i = e.hole ? this.sim.holes.indexOf(e.hole) : -1;
      const p = i >= 0 ? i : 0;
      e.player = p;
      this._events[p].push(e);
    }
  }

  /** Drain accumulated events for player `i`. */
  drain(i) {
    const e = this._events[i];
    this._events[i] = [];
    return e;
  }

  hole(i) { return this.sim.holes[i]; }

  /** Fraction of the whole city each player has swallowed, by raw mass. */
  fraction(i) {
    return this.sim.totalMass > 0 ? this.sim.holes[i].rawMass / this.sim.totalMass : 0;
  }
}
