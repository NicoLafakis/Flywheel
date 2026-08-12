import {
  TICKET_TTL_MS, RANKED_SCENES, body, errorResponse, fail, isDeviceKey, method,
  newRunId, newSeed, ok, rest, makeTicket, playerForToken, requiredEnv,
  originRateKey,
} from '../_lib.mjs';
import { RANKED_TUNE_ID } from '../../js/voxelsim.js';

const MAX_TICKETS_PER_HOUR = 12;

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    requiredEnv('FW_TICKET_SECRET');
    if (process.env.FW_BOARDS_ACCEPTING !== 'true') {
      fail(res, 503, 'BOARDS_PAUSED', 'Ranked submissions are paused; local runs still work.', true);
      return;
    }
    const data = await body(req);
    if (!RANKED_SCENES.includes(data.scene_id) || data.mode !== 'run90' || !isDeviceKey(data.device_key)) {
      fail(res, 400, 'RUN_NOT_AVAILABLE', 'That ranked run is not available.');
      return;
    }
    let player = null;
    if (data.player_id || data.player_token) {
      player = await playerForToken(data.player_id, data.player_token);
      if (!player) { fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return; }
    }
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const originKey = originRateKey(req);
    const [attempts, originAttempts] = await Promise.all([
      rest(`submission_log?select=id&device_key=eq.${encodeURIComponent(data.device_key)}&kind=eq.ticket&created_at=gte.${encodeURIComponent(since)}`),
      originKey ? rest(`submission_log?select=id&device_key=eq.${encodeURIComponent(originKey)}&kind=eq.ticket-ip&created_at=gte.${encodeURIComponent(since)}`) : [],
    ]);
    if (attempts.length >= MAX_TICKETS_PER_HOUR || originAttempts.length >= 60) {
      fail(res, 429, 'TICKET_RATE_LIMIT', 'Try another ranked run in a little while.', true);
      return;
    }
    const issued_at = new Date().toISOString();
    const row = {
      id: newRunId(), player_id: player ? player.id : null, device_key: data.device_key,
      scene_id: data.scene_id, seed: newSeed(), mode: 'run90', tune_id: RANKED_TUNE_ID,
      issued_at, expires_at: new Date(Date.parse(issued_at) + TICKET_TTL_MS).toISOString(),
    };
    await rest('run_tickets', { method: 'POST', body: row, headers: { prefer: 'return=minimal' } });
    await rest('submission_log', {
      method: 'POST', body: [
        { player_id: row.player_id, device_key: row.device_key, kind: 'ticket' },
        ...(originKey ? [{ player_id: row.player_id, device_key: originKey, kind: 'ticket-ip' }] : []),
      ],
      headers: { prefer: 'return=minimal' },
    });
    const ticket = makeTicket({ run_id: row.id, seed: row.seed, scene_id: row.scene_id,
      mode: row.mode, tune_id: row.tune_id, player_id: row.player_id, issued_at: row.issued_at });
    ok(res, { run_id: row.id, seed: row.seed, scene_id: row.scene_id, mode: row.mode,
      tune_id: row.tune_id, issued_at: row.issued_at, ticket });
  } catch (error) { errorResponse(res, error); }
}
