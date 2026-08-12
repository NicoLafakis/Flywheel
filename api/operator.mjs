import { body, errorResponse, fail, isUuid, method, ok, operatorAuthorised, rest, rpc } from './_lib.mjs';

export default async function handler(req, res) {
  if (!operatorAuthorised(req)) { fail(res, 401, 'UNAUTHORIZED', 'Operator authorization is required.'); return; }
  try {
    if (req.method === 'GET') {
      const [players, reports] = await Promise.all([
        rest('players?select=id,name,moderation_state,created_at,last_seen_at&order=created_at.desc&limit=100'),
        rest('moderation_reports?select=id,player_id,reporter_device_key,created_at&order=created_at.desc&limit=100'),
      ]);
      ok(res, { players, reports }); return;
    }
    if (!method(req, res, 'POST')) return;
    const data = await body(req);
    if (!isUuid(data.player_id) || !['rename', 'hide'].includes(data.action)) {
      fail(res, 400, 'MODERATION_INVALID', 'Use rename or hide for a player.'); return;
    }
    await rpc('fw_moderate', { p_player_id: data.player_id, p_action: data.action,
      p_reason: typeof data.reason === 'string' ? data.reason.slice(0, 500) : '' });
    ok(res, { action: data.action, player_id: data.player_id });
  } catch (error) { errorResponse(res, error); }
}
