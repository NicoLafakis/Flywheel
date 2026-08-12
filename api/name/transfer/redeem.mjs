import {
  body, errorResponse, fail, isDeviceKey, newDeviceToken, ok, rpc, sha256Hex,
} from '../../_lib.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return; }
  try {
    const data = await body(req);
    if (!isDeviceKey(data.device_key) || typeof data.code !== 'string'
      || !/^[BCDFGHJKMNPQRSTVWXZ23456789]{6}$/.test(data.code.toUpperCase())) {
      fail(res, 400, 'TRANSFER_INVALID', 'That transfer code is not valid.'); return;
    }
    const token = newDeviceToken();
    const rows = await rpc('fw_transfer_redeem', {
      p_code: data.code.toUpperCase(), p_token_hash_hex: sha256Hex(token),
    });
    const player = rows && rows[0];
    if (!player) throw new Error('transfer did not return a player');
    ok(res, { player_id: player.player_id, name: player.player_name, token,
      token_version: player.token_version });
  } catch (error) {
    if (/unavailable/i.test(JSON.stringify(error.data || error.message))) {
      fail(res, 410, 'TRANSFER_UNAVAILABLE', 'That code has expired or was already used.'); return;
    }
    errorResponse(res, error);
  }
}
