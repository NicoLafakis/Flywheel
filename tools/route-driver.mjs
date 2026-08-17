// The ONE waypoint driver every scripted excursion in the test tooling runs on.
// It was NINE copies of the same six lines until 2026-08-17 — eight in
// tools/validate.mjs and one in tools/chicago-probe.mjs — which is why the
// defect below shipped in all of them at once and was noticed in exactly one.
//
// A route is an array of `{ until, x, z }`, optionally `hold: true`. `until` is
// SECONDS from the start of the current lap.
//
// WHY IT ADVANCES ON ARRIVAL (RCA-2026-08-17). The old driver picked the active
// waypoint off the clock alone — `for (const w of WP) if (t < w.until)`. Every
// leg is therefore a fixed TIME BUDGET, not a distance: a hole that reaches its
// waypoint early gets `d <= ARRIVE`, receives `{x:0, z:0}` and stands still
// until the next window opens. The route can never cover more ground than its
// schedule allows, however fast the hole is. Measured on chicago, 90 s, with
// the hole's speed doubled: ground covered 360 m -> 361 m (ratio 1.00), while
// ticks spent standing still went 71.4% -> 85.6%. The whole of the extra speed
// went into idling, so the 2026-08-17 SPEED_MULT 1.4 -> 1.8 retune read here as
// a 39% CONTENT loss and took chicago's SIZE floor red. Arrival-driven, the
// same A/B covers 1467 m -> 2442 m with 0.0% idle in both arms.
//
// `until` survives as a per-lap CEILING, so a leg the hole cannot reach still
// times out exactly as it did before and no route can wedge.
//
// WHY IT LOOPS. Arrival alone just relocates the parking to the end of the
// route: chicago's 135 s route completes in 38.9 s at the shipped speed and the
// hole then sits on the last waypoint for the remaining 96 s (measured: 168
// eaten, SIZE 1 — WORSE than the time-gated driver it replaced). An excursion's
// contract is a fixed time budget, so the route cycles to fill it and `until` is
// measured against the current lap. That is also what the routes were authored
// for — see Boston's note at 12 in validate.mjs: "It never PARKS ... each leg
// drags the opening onto footprint it has not already taken."
//
// `hold: true` on a waypoint opts back OUT of arrival advance for that leg. The
// gallery tour's first waypoint is a deliberate 3 s idle that the locality and
// spontaneous-collapse probes measure, and arriving early must not end it.
//
// WHAT THIS DOES *NOT* FIX, and cannot. Consumption still falls as hole speed
// rises, under this driver and every other one, because a block is consumed
// only when it FALLS below SINK_Y with the void still overhead
// (js/voxelsim.js:3221, :3397). Fall time is fixed by gravity, so yield is
// time-over-content rather than distance-over-content. See the note on
// `validateSpeedInvariance` in validate.mjs for the measured evidence.

const DT = 1 / 60;
export const ARRIVE = 0.3;   // m — inside this, steering at the waypoint is a no-op

/**
 * Drives `run`'s hole along `WP` for `durationSec` seconds of sim time.
 *
 * Route stats are stashed on the sim as `__route` rather than returned, so the
 * call sites keep reading `a.hole` / `a.blocks` unchanged. It is test-harness
 * private; nothing the game ships ever sees this object.
 *
 * @param {object} run          a VoxelSandboxSim
 * @param {Array}  WP           the route
 * @param {number} durationSec  sim seconds to drive
 * @param {Function} [onStep]   called `(tickIndex, run)` after each step
 * @returns {object} the same `run`
 */
export function driveRoute(run, WP, durationSec, onStep = null) {
  const steps = Math.round(durationSec * 60);
  let wi = 0, lapT0 = 0, laps = 0, idleTicks = 0, dist = 0;
  let px = run.hole.x, pz = run.hole.z;
  for (let i = 0; i < steps; i++) {
    const t = i * DT, h = run.hole;
    // May cross several waypoints in one tick when they sit close together; the
    // guard bounds it at one full lap so a degenerate route cannot spin here.
    for (let guard = 0; guard <= WP.length; guard++) {
      const w = WP[wi];
      const due = (t - lapT0) >= w.until;
      const arrived = !w.hold && Math.hypot(w.x - h.x, w.z - h.z) <= ARRIVE;
      if (!due && !arrived) break;
      if (wi < WP.length - 1) { wi++; } else { wi = 0; lapT0 = t; laps++; break; }
    }
    const w = WP[wi];
    const dx = w.x - h.x, dz = w.z - h.z, d = Math.hypot(dx, dz);
    const move = d > ARRIVE ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
    // Idling on a `hold` waypoint is the probe standing still on purpose and is
    // not counted; idling anywhere else is the driver failing to spend the
    // hole's speed, which is the whole defect above.
    if (!move.x && !move.z && !w.hold) idleTicks++;
    run.step(DT, move);
    dist += Math.hypot(h.x - px, h.z - pz);
    px = h.x; pz = h.z;
    if (onStep) onStep(i, run);
  }
  run.__route = { laps, idleFrac: steps ? idleTicks / steps : 0, dist, steps, seconds: durationSec };
  return run;
}

// The bound `probeRouteSpent` (validate.mjs) holds every excursion to. 2% rather
// than 0% because the driver can legitimately emit one null move on the tick it
// arrives at a waypoint that is itself inside ARRIVE of the next one. The broken
// driver scored 71.4% and 85.6% on the same measurement, so the bound is nowhere
// near either behaviour.
export const MAX_IDLE_FRAC = 0.02;
