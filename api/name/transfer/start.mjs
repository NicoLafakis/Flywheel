import {
  body, errorResponse, fail, isDeviceKey, isUuid, method, ok, playerForToken,
  randomCode, rest,
} from '../../_lib.mjs';

const TRANSFER_TTL_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    const data = await body(req);
    if (!isUuid(data.player_id) || !isDeviceKey(data.device_key)) {
      fail(res, 400, 'BAD_PLAYER', 'A player and this device are required.'); return;
    }
    const player = await playerForToken(data.player_id, data.player_token);
    if (!player) { fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return; }
    const expires_at = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
    for (let tries = 0; tries < 5; tries++) {
      const code = randomCode(6);
      try {
        await rest('name_transfers', {
          method: 'POST', body: { code, player_id: player.id, expires_at }, headers: { prefer: 'return=minimal' },
        });
        ok(res, { code, expires_at }); return;
      } catch (error) {
        if (error.status !== 409 || tries === 4) throw error;
      }
    }
  } catch (error) { errorResponse(res, error); }
}
