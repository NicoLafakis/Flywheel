import {
  body, errorResponse, fail, isDeviceKey, isUuid, normaliseName,
  ok, playerForToken, rest,
} from '../_lib.mjs';
import { blockedName as blocked, suggestions } from '../_names.mjs';

// This is also the escape hatch for an automatically generated name. A guest
// provisioned by run/start is a device-token account - `token_hash =
// sha256(token)`, no session hash - so the {player_id, token} pair run/start
// returned authenticates here through playerForToken()'s fallback path, and the
// board_public patch below is what stops the leaderboard from still showing
// "Meat Tornado" after they have renamed themselves.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return; }
  try {
    const data = await body(req);
    const parsed = normaliseName(data.name);
    if (!parsed || !isDeviceKey(data.device_key) || !isUuid(data.player_id)) {
      fail(res, 400, 'NAME_INVALID', 'Use 3–16 letters, numbers, spaces, hyphens or underscores.'); return;
    }
    if (await blocked(parsed.key)) {
      fail(res, 400, 'NAME_BLOCKED', 'That name is not available.'); return;
    }
    const player = await playerForToken(data.player_id, data.token);
    if (!player) { fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return; }

    try {
      await rest(`players?id=eq.${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        body: { name: parsed.name, name_key: parsed.key, last_seen_at: new Date().toISOString() },
        headers: { prefer: 'return=minimal' },
      });
      // Update public board records
      await rest(`board_public?player_id=eq.${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        body: { name: parsed.name },
        headers: { prefer: 'return=minimal' },
      });
      ok(res, { player_id: player.id, name: parsed.name });
    } catch (error) {
      if (error.status === 409 || /duplicate key|unique/i.test(JSON.stringify(error.data || error.message))) {
        fail(res, 409, 'NAME_TAKEN', 'That name is taken.', false, { suggestions: suggestions(parsed.name, parsed.key) });
        return;
      }
      throw error;
    }
  } catch (error) { errorResponse(res, error); }
}
