// Server-side replay verification. It imports the same pure sim modules the
// browser and validator use; no score is accepted from the request body.

import { decodeTrace, inputAt } from '../js/replay.js';
import {
  loadScene, RANKED_SIM_VERSION, RANKED_TICK_COUNT, RANKED_TUNE, RANKED_TUNE_ID,
  VoxelSandboxSim,
} from '../js/voxelsim.js';
import { rest, rpc } from './_lib.mjs';

function decodePayload(value) {
  if (typeof value !== 'string') throw new TypeError('stored replay payload is missing');
  // PostgREST serializes PostgreSQL bytea as \\x-prefixed hex; accept base64 as
  // well so this remains compatible with a repaired/imported historical row.
  return value.startsWith('\\x') ? Buffer.from(value.slice(2), 'hex') : Buffer.from(value, 'base64');
}

export async function verifyReplay(run, input) {
  if (run.sim_version !== RANKED_SIM_VERSION || run.tune_id !== RANKED_TUNE_ID) {
    return { verdict: 'unverifiable', detail: { reason: 'sim_version_or_tune' } };
  }
  if (run.mode !== 'run90' || run.tick_count !== RANKED_TICK_COUNT) {
    return { verdict: 'mismatch', detail: { reason: 'ranked_shape' } };
  }
  let inputs;
  try { inputs = decodeTrace(decodePayload(input.payload), run.tick_count); }
  catch (error) { return { verdict: 'mismatch', detail: { reason: 'trace', message: error.message } }; }

  const started = performance.now();
  try {
    await loadScene(run.scene_id);
    const sim = new VoxelSandboxSim({ seed: run.seed, scene: run.scene_id, mode: run.mode });
    // ASSERT the ranked tune, do not re-assign it. The constructor replaces a
    // ranked sim's tune with a frozen copy of RANKED_TUNE; re-assigning here
    // would paper over a constructor that stopped doing so, which is precisely
    // the class of defect audit A5.1 was — a write that silently made the
    // server and the client disagree. A failure here is a build problem, not a
    // player problem, so it is `unverifiable` (the run keeps its trace and can
    // be re-verified) rather than `mismatch` (which would blame the player).
    for (const key of Object.keys(RANKED_TUNE)) {
      if (sim.tune[key] !== RANKED_TUNE[key]) {
        return { verdict: 'unverifiable', detail: { reason: 'ranked_tune', key } };
      }
    }
    const move = { x: 0, z: 0 };
    for (let tick = 0; tick < run.tick_count; tick++) {
      inputAt(inputs, tick, move);
      sim.step(1 / 60, move);
    }
    if (!sim.runComplete || sim.rankedTicks !== RANKED_TICK_COUNT) {
      return { verdict: 'mismatch', detail: { reason: 'cutoff' } };
    }
    const score = Math.floor(sim.hole.mass);
    // T-303 (audit A5.3). Both numbers have always been in the same table row
    // and were never compared, which is why A5.1 and A5.2 could ship silently:
    // a comparison would have caught either the first time it ran. The server's
    // number stays authoritative — this does not change what gets published,
    // it makes a disagreement SAYABLE.
    //
    // The tolerance is exactly zero, and that is a claim about the system, not
    // a convenience: both sides floor the same accumulator, `js/fwmath.js` pins
    // every transcendental, inputs are stepped from the same int8 pair that was
    // stored, and the ranked tune is now total and frozen on both sides. The
    // audit reproduced the control run bit-identically. So after T-301/T-302
    // there is no legitimate way for these to differ by one point, and a run
    // that does differ was computed under physics the server cannot reproduce —
    // a stale client build or a tampered one. Either way it must not rank.
    // `claimed_score` may be absent on a historical row; that is not a
    // disagreement, so it is skipped rather than failed.
    const claimed = run.claimed_score;
    if (typeof claimed === 'number' && Number.isFinite(claimed) && claimed !== score) {
      return {
        verdict: 'mismatch',
        score,
        detail: { reason: 'score', claimed_score: claimed, computed_score: score, delta: claimed - score },
      };
    }
    return {
      verdict: 'verified',
      score,
      stats: {
        // `best_chain` is a CHAIN COUNT — blocks eaten inside one unbroken
        // 1.5 s chain — not a multiplier, and the key now says so (T-502). It
        // shipped as `best_combo`, which is the same ambiguity T-309/T-311
        // removed from every player-facing readout (audit B2 #16): a stored 530
        // under a key called combo reads as x530 against a ladder that stops at
        // x8. Existing rows are moved by
        // supabase/migrations/20260813120000_rename_run_stats_best_combo.sql.
        //
        // The multiplier that chain bought is deliberately not stored beside it:
        // it is `comboMult(best_chain)`, and whatever surface first renders this
        // must derive it from the sim's own ladder the way the results screens
        // do, rather than carry a second copy that can drift.
        raw_mass: Math.floor(sim.hole.rawMass), best_chain: sim.hole.bestCombo,
        eaten: sim.hole.eatenCount, size: sim.hole.size,
        consumed_fraction: sim.totalMass ? sim.hole.rawMass / sim.totalMass : 0,
        // Cloud progress sync (.wiki/plans/cloud-progress-sync.md §2.4): a
        // ranked run is the ONE coin source the server can prove, so the count
        // the replay saw is stored here and `fw_coins_verified` sums it into the
        // player's verified-coin ledger. Rows verified before this key existed
        // simply sum as 0 — the ledger only ever widens the fence, never
        // narrows it, so a missing key can dock nobody.
        coins_collected: sim.hole.coinsCollected || 0,
      },
      // `claimed_score` is recorded on EVERY verified run, not only on the
      // failing ones. A divergence that only becomes visible once it trips a
      // threshold cannot be trend-watched, and the agreeing runs are the
      // evidence that the zero tolerance above is calibrated rather than lucky.
      detail: {
        replay_ms: Math.round(performance.now() - started),
        claimed_score: typeof claimed === 'number' ? claimed : null,
      },
    };
  } catch (error) {
    return { verdict: 'unverifiable', detail: { reason: 'server_replay', message: error.message } };
  }
}

export async function drainOnePendingRun() {
  const runs = await rest('runs?select=*&verdict=eq.pending&order=created_at.asc&limit=1');
  if (!runs.length) return null;
  const run = runs[0];
  const inputs = await rest(`run_inputs?select=encoding,payload&run_id=eq.${run.id}`);
  if (!inputs.length) {
    await rpc('fw_record_verdict', { p_run_id: run.id, p_verdict: 'mismatch', p_detail: { reason: 'missing_input' } });
    return { run_id: run.id, verdict: 'mismatch' };
  }
  const result = await verifyReplay(run, inputs[0]);
  await rpc('fw_record_verdict', {
    p_run_id: run.id, p_verdict: result.verdict,
    p_score: result.score ?? null, p_stats: result.stats ?? {}, p_detail: result.detail ?? {},
  });
  return { run_id: run.id, verdict: result.verdict, replay_ms: result.detail && result.detail.replay_ms };
}
