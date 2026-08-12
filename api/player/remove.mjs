import { body, errorResponse, fail, isUuid, method, ok, playerForToken, rpc } from '../_lib.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    const data = await body(req);
    if (!isUuid(data.player_id)) { fail(res, 400, 'BAD_PLAYER', 'A player id is required.'); return; }
    const player = await playerForToken(data.player_id, data.player_token);
    if (!player) { fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return; }
    await rpc('fw_remove_player', { p_player_id: player.id });
    ok(res, { removed: true });
  } catch (error) { errorResponse(res, error); }
}
