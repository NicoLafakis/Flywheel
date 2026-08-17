import { body, errorResponse, fail, isUuid, method, ok, playerForToken, rpc } from '../_lib.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    const data = await body(req);
    if (!isUuid(data.player_id)) { fail(res, 400, 'BAD_PLAYER', 'A player id is required.'); return; }
    // `token` first, exactly as api/name/transfer/start.mjs reads it: the browser
    // posts its stored secret verbatim (`{player_id, token}`, js/board/player.js
    // removePlayer), so reading only `player_token` here made every remove
    // request authenticate against `undefined` and 401 with a message that reads
    // like a genuine ownership failure. `player_token` stays accepted as the
    // alias the run/* endpoints name the same credential by.
    const playerToken = data.token || data.player_token;
    const player = await playerForToken(data.player_id, playerToken);
    if (!player) { fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return; }
    await rpc('fw_remove_player', { p_player_id: player.id });
    ok(res, { removed: true });
  } catch (error) { errorResponse(res, error); }
}
