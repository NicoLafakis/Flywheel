// Two-hole hot-seat duel driver, built ON TOP of the shipped single-hole sim
// without editing it.
//
// THE TECHNIQUE. `VoxelSandboxSim` owns exactly one `this.hole`, and every
// consumption / combo / SIZE path in the sim reads and writes through that one
// reference (see `_consume` and `step` in js/voxelsim.js). So the duel keeps two
// hole-state objects of its own and time-slices the sim between them: bind hole
// A, step half the frame's dt, bind hole B, step the other half. Each hole
// accumulates its own mass / rawMass / chain / size / radius through the sim's
// own code path, and both are eating out of the same block grid, which is the
// whole point — one shared city, two mouths.
//
// A few of the sim's caches are keyed to "the hole" rather than to a hole, so
// they ride along in the swap instead of being smeared across both players:
//   _coverage / _coverageSpare  the meter cells the opening covers (`_coverageChanged`)
//   _prevProx                   zones inside the hole's influence last recalc (`_markDirtyZones`)
//   _supportSkipped             the supportEvery amortiser
// Everything else in the sim is world state and is *supposed* to be shared.
//
// Known, accepted demo-grade artifact: `_recalcSupport` resets `supportRatio`
// to 1 for floor blocks outside the CURRENT hole's instability radius, so each
// player's recalc partially heals the rim the other player was undermining.
// Buildings still collapse (a block that has already detached stays detached);
// the crack front near a rim just runs a touch cooler when both holes are far
// apart. Fixing it properly would mean editing the sim, which this build may not.

export function makeHole(sim, x, z) {
  // Cloned from the sim's own initial hole so every field the sim expects
  // exists with the shape the sim created — no hand-written field list to drift.
  return { ...sim.hole, x, z, heading: 0 };
}

export class Duel {
  /**
   * @param {object} sim  a live VoxelSandboxSim
   * @param {Array<{x:number,z:number}>} spawns one per player
   */
  constructor(sim, spawns) {
    this.sim = sim;
    this.players = spawns.map((s) => ({
      hole: makeHole(sim, s.x, s.z),
      // Per-player copies of the hole-keyed sim caches (see the note above).
      coverage: new Set(),
      coverageSpare: new Set(),
      prevProx: [],
      supportSkipped: 0,
      events: [],
    }));
  }

  _bind(p) {
    const s = this.sim;
    s.hole = p.hole;
    s._coverage = p.coverage;
    s._coverageSpare = p.coverageSpare;
    s._prevProx = p.prevProx;
    s._supportSkipped = p.supportSkipped;
  }

  _unbind(p) {
    const s = this.sim;
    p.coverage = s._coverage;
    p.coverageSpare = s._coverageSpare;
    p.prevProx = s._prevProx;
    p.supportSkipped = s._supportSkipped;
  }

  /**
   * Advance the shared world by `dt`, split evenly between the players.
   * @param {number} dt seconds
   * @param {Array<{x:number,z:number}>} moves one per player, same order as spawns
   */
  step(dt, moves) {
    const n = this.players.length;
    const slice = dt / n;
    for (let i = 0; i < n; i++) {
      const p = this.players[i];
      this._bind(p);
      // `over` is the sim's single-player goal latch. The duel ends on the
      // clock, not on the goal, so never let one player's goal freeze the world
      // for the other; the banner reports fractions instead.
      this.sim.over = false;
      this.sim.step(slice, moves[i] || { x: 0, z: 0 });
      this._unbind(p);
      // Events carry `hole`, so they are attributable, but draining per player
      // is simpler and keeps each player's juice on their own side.
      const evs = this.sim.drainEvents();
      for (const e of evs) { e.player = i; p.events.push(e); }
    }
    this.sim.over = false;
  }

  /** Drain accumulated events for player `i`. */
  drain(i) {
    const p = this.players[i];
    const e = p.events;
    p.events = [];
    return e;
  }

  hole(i) { return this.players[i].hole; }

  /** Fraction of the whole city each player has swallowed, by raw mass. */
  fraction(i) {
    return this.sim.totalMass > 0 ? this.players[i].hole.rawMass / this.sim.totalMass : 0;
  }
}
