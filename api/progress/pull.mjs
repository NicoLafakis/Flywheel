// POST /api/progress/pull — hand the signed-in player their cloud progress
// document. Bearer-gated through playerForToken(); guest (`is_auto`) accounts
// are allowed, since their token is what run/start handed the device. Never
// 404s: `found:false` is the normal answer on a first sign-in.
//
// `makeHandler(deps)` exists so tools/progress-api.test.mjs can drive this with
// an in-memory database; the default export is the real thing.
import {
  body, errorResponse, fail, isDeviceKey, isUuid, ok,
  playerForToken as realPlayerForToken, rest as realRest,
} from '../_lib.mjs';

export const PROGRESS_COLUMNS = 'player_id,schema_version,blob,coins_verified,coins_ceiling,revision,updated_at';

/** Shared gate for both progress routes: flag → method → body → auth. Returns
 *  `{ data, player }` or null after having answered. */
export async function gate(req, res, deps) {
  // On by default; FW_PROGRESS_SYNC='false' is the emergency off-switch.
  if (process.env.FW_PROGRESS_SYNC === 'false') {
    fail(res, 503, 'SERVER_NOT_READY', 'Progress sync is paused.', true);
    return null;
  }
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return null; }
  const data = await body(req);
  if (!isUuid(data.player_id) || !isDeviceKey(data.device_key)) {
    fail(res, 400, 'BAD_REQUEST', 'player_id and device_key are required.'); return null;
  }
  const player = await deps.playerForToken(data.player_id, data.token);
  if (!player) { fail(res, 401, 'NOT_SIGNED_IN', 'Sign in to sync your progress.', false); return null; }
  return { data, player };
}

export function makeHandler(deps = {}) {
  const rest = deps.rest || realRest;
  const playerForToken = deps.playerForToken || realPlayerForToken;
  return async function handler(req, res) {
    try {
      const gated = await gate(req, res, { playerForToken });
      if (!gated) return;
      const rows = await rest(`player_progress?select=${PROGRESS_COLUMNS}&player_id=eq.${encodeURIComponent(gated.player.id)}&limit=1`);
      const row = rows && rows[0];
      if (!row) { ok(res, { found: false }); return; }
      ok(res, {
        found: true,
        revision: row.revision,
        schema_version: row.schema_version,
        blob: row.blob,
        coins_verified: Number(row.coins_verified) || 0,
        coins_ceiling: Number(row.coins_ceiling) || 0,
        updated_at: row.updated_at,
      });
    } catch (error) { errorResponse(res, error); }
  };
}

export default makeHandler();
