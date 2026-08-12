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
    Object.assign(sim.tune, RANKED_TUNE);
    const move = { x: 0, z: 0 };
    for (let tick = 0; tick < run.tick_count; tick++) {
      inputAt(inputs, tick, move);
      sim.step(1 / 60, move);
    }
    if (!sim.runComplete || sim.rankedTicks !== RANKED_TICK_COUNT) {
      return { verdict: 'mismatch', detail: { reason: 'cutoff' } };
    }
    return {
      verdict: 'verified',
      score: Math.floor(sim.hole.mass),
      stats: {
        raw_mass: Math.floor(sim.hole.rawMass), best_combo: sim.hole.bestCombo,
        eaten: sim.hole.eatenCount, size: sim.hole.size,
        consumed_fraction: sim.totalMass ? sim.hole.rawMass / sim.totalMass : 0,
      },
      detail: { replay_ms: Math.round(performance.now() - started) },
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
