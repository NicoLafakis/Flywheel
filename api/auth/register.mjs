import {
  body, errorResponse, fail, hashPassword, isDeviceKey, newDeviceToken, normaliseName,
  ok, rest, rpc, sha256Hex, originRateKey,
} from '../_lib.mjs';
import { blockedName as blocked, suggestions } from '../_names.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return; }
  try {
    const data = await body(req);
    const parsed = normaliseName(data.name);
    if (!parsed || !isDeviceKey(data.device_key)) {
      fail(res, 400, 'NAME_INVALID', 'Use 3–16 letters, numbers, spaces, hyphens or underscores.'); return;
    }
    if (typeof data.password !== 'string' || data.password.length < 4) {
      fail(res, 400, 'PASSWORD_SHORT', 'Password must be at least 4 characters.'); return;
    }
    if (await blocked(parsed.key)) {
      fail(res, 400, 'NAME_BLOCKED', 'That name is not available.'); return;
    }

    const originKey = originRateKey(req);
    if (originKey) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const claims = await rest(`submission_log?select=id&device_key=eq.${encodeURIComponent(originKey)}&kind=eq.claim-ip&created_at=gte.${encodeURIComponent(since)}&limit=10`);
      if (claims.length >= 8) { fail(res, 429, 'NAME_RATE_LIMIT', 'Too many accounts created today.', true); return; }
    }

    // Check if name is taken
    const existing = await rest(`players?select=id&name_key=eq.${encodeURIComponent(parsed.key)}&limit=1`);
    if (existing && existing.length > 0) {
      fail(res, 409, 'NAME_TAKEN', 'That player name is already registered.', false, { suggestions: suggestions(parsed.name, parsed.key) });
      return;
    }

    const passDigest = hashPassword(data.password);
    const passHashHex = passDigest.toString('hex');

    // Minted BEFORE the insert so its hash lands in the same row. The two hashes
    // mean different things and live in different columns: `token_hash` is the
    // password verifier this account logs in with, `session_token_hash` is what
    // playerForToken() compares the bearer token against on every later
    // authenticated call. Writing only the first is what left password accounts
    // holding a token that authenticated nothing.
    const token = newDeviceToken();

    // Creating the account and inheriting what this device already played are
    // one transaction, because they have to be. Two things were wrong with doing
    // it in the handler:
    //
    // SECURITY. The old code was `PATCH runs?id=eq.<data.run_id>` with no
    // ownership check of any kind - no device match, no `player_id is null`, no
    // verdict check - so any run id a caller learned could be adopted by a name
    // they had just created. The RPC gates every write on a join to
    // `run_tickets`, which is the only record of which device was issued the
    // run, exactly as `fw_claim_name` does. `p_run_id` is reported on and never
    // authorises anything.
    //
    // CORRECTNESS. Re-pointing an already-VERIFIED run publishes nothing on its
    // own: `fw_record_verdict` ran while `player_id` was null, took the
    // `is not null` branch and skipped the board_public insert, and it will
    // never run again for that run. The backfill inside the RPC is the only
    // thing that puts an inherited score on the leaderboard.
    //
    // And since run/start now hands every device an auto-provisioned guest, the
    // runs this device played usually are NOT unclaimed - they belong to that
    // guest. So the RPC upgrades the guest in place (same row, same id, same
    // scores, now with a name and a password) rather than creating a second
    // player and stranding everything the device earned before signup.
    const rows = await rpc('fw_register_device_player', {
      p_name: parsed.name,
      p_name_key: parsed.key,
      p_password_hash_hex: passHashHex,
      p_session_hash_hex: sha256Hex(token),
      p_device_key: data.device_key,
      p_run_id: data.run_id || null,
    });
    const player = rows && rows[0];
    if (!player) throw new Error('Player creation failed');

    if (originKey) {
      await rest('submission_log', {
        method: 'POST', body: { player_id: player.player_id, device_key: originKey, kind: 'claim-ip' },
        headers: { prefer: 'return=minimal' },
      });
    }

    // `adopted_runs` / `published_runs` are the honest answer to "did creating
    // this account keep what I played?", which the old bare PATCH could not give
    // at all. `upgraded` says the device's guest identity became this account
    // rather than a second row being created.
    ok(res, { player_id: player.player_id, name: player.player_name, token,
      upgraded: player.upgraded === true, adopted_runs: player.adopted || 0,
      published_runs: player.published || 0, run_adopted: player.requested_run_adopted === true });
  } catch (error) {
    if (error.status === 409 || /duplicate key|unique/i.test(JSON.stringify(error.data || error.message))) {
      fail(res, 409, 'NAME_TAKEN', 'That name is taken.', false);
      return;
    }
    errorResponse(res, error);
  }
}
