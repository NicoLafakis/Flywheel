import {
  body, errorResponse, fail, isDeviceKey, isUuid, ok, rest, rpc, sha256Hex,
  validTicket, playerForToken, originRateKey,
} from '../_lib.mjs';
import { decodeTrace, REPLAY_ENCODING } from '../../js/replay.js';
import { RANKED_SIM_VERSION, RANKED_TICK_COUNT, RANKED_TUNE_ID } from '../../js/voxelsim.js';

const MAX_SUBMISSIONS_PER_HOUR = 20;

function payloadFromBase64(value) {
  if (typeof value !== 'string' || value.length < 4 || value.length > 44000
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new TypeError('trace must be a compact base64 payload');
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  if (!bytes.length || bytes.length > 32768) throw new RangeError('trace exceeds the allowed size');
  return bytes;
}

async function placementGate(sceneId, claimedScore) {
  const rows = await rest(`runs?select=verified_score&scene_id=eq.${encodeURIComponent(sceneId)}&verdict=eq.verified&order=verified_score.desc&limit=25`);
  return rows.length < 25 || claimedScore > Number(rows[rows.length - 1].verified_score);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return; }
  try {
    const data = await body(req);
    if (!isUuid(data.run_id) || !isDeviceKey(data.device_key) || typeof data.ticket !== 'string') {
      fail(res, 400, 'BAD_RUN', 'The ranked run is incomplete.'); return;
    }
    const tickets = await rest(`run_tickets?select=*&id=eq.${encodeURIComponent(data.run_id)}`);
    const ticket = tickets[0];
    if (!ticket || ticket.device_key !== data.device_key
      || !validTicket(data.ticket, { run_id: ticket.id, seed: ticket.seed, scene_id: ticket.scene_id,
        mode: ticket.mode, tune_id: ticket.tune_id, player_id: ticket.player_id, issued_at: ticket.issued_at })) {
      fail(res, 401, 'TICKET_INVALID', 'This run ticket is not valid.'); return;
    }
    if (ticket.player_id) {
      const player = await playerForToken(data.player_id, data.player_token);
      if (!player || player.id !== ticket.player_id) {
        fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return;
      }
    }
    if (data.tick_count !== RANKED_TICK_COUNT || data.tune_id !== RANKED_TUNE_ID
      || data.sim_version !== RANKED_SIM_VERSION || !Number.isSafeInteger(data.claimed_score)
      || data.claimed_score < 0) {
      fail(res, 400, 'RUN_SHAPE_INVALID', 'This replay does not match THE RUN.'); return;
    }
    const payload = payloadFromBase64(data.trace);
    decodeTrace(payload, data.tick_count);
    const existing = await rest(`runs?select=id,verdict&id=eq.${encodeURIComponent(data.run_id)}`);
    if (existing.length) { ok(res, { run_id: existing[0].id, verdict: existing[0].verdict, idempotent: true }); return; }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const originKey = originRateKey(req);
    const [attempts, originAttempts] = await Promise.all([
      rest(`submission_log?select=id&device_key=eq.${encodeURIComponent(data.device_key)}&kind=eq.submit&created_at=gte.${encodeURIComponent(since)}`),
      originKey ? rest(`submission_log?select=id&device_key=eq.${encodeURIComponent(originKey)}&kind=eq.submit-ip&created_at=gte.${encodeURIComponent(since)}`) : [],
    ]);
    if (attempts.length >= MAX_SUBMISSIONS_PER_HOUR || originAttempts.length >= MAX_SUBMISSIONS_PER_HOUR) {
      fail(res, 429, 'SUBMIT_RATE_LIMIT', 'Your saved run will retry later.', true); return;
    }
    const accepted = await rpc('fw_accept_run', {
      p_run_id: data.run_id, p_tick_count: data.tick_count, p_sim_version: data.sim_version,
      p_client_build: typeof data.client_build === 'string' ? data.client_build.slice(0, 80) : 'unknown',
      p_claimed_score: data.claimed_score, p_payload_b64: data.trace,
      p_payload_sha256_hex: sha256Hex(Buffer.from(payload)),
    });
    const first = accepted && accepted[0];
    if (!first) throw new Error('submission did not return a run row');
    if (originKey) await rest('submission_log', {
      method: 'POST', body: { player_id: ticket.player_id, device_key: originKey, kind: 'submit-ip' },
      headers: { prefer: 'return=minimal' },
    });
    if (first.verdict === 'pending' && !await placementGate(ticket.scene_id, data.claimed_score)) {
      await rpc('fw_record_verdict', { p_run_id: data.run_id, p_verdict: 'unranked', p_detail: { reason: 'placement_gate' } });
      ok(res, { run_id: data.run_id, verdict: 'unranked' }); return;
    }
    ok(res, { run_id: data.run_id, verdict: first.verdict });
  } catch (error) { errorResponse(res, error); }
}
