import {
  body, errorResponse, fail, isDeviceKey, newDeviceToken, normaliseName,
  ok, rest, sha256Hex, verifyPassword, byteaHex,
} from '../_lib.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return; }
  try {
    const data = await body(req);
    const parsed = normaliseName(data.name);
    if (!parsed || !isDeviceKey(data.device_key)) {
      fail(res, 400, 'INVALID_CREDENTIALS', 'Please enter a valid player name.'); return;
    }
    if (typeof data.password !== 'string' || !data.password) {
      fail(res, 400, 'INVALID_PASSWORD', 'Please enter your password.'); return;
    }

    const rows = await rest(`players?select=id,name,name_key,token_hash,token_version,moderation_state&name_key=eq.${encodeURIComponent(parsed.key)}&limit=1`);
    const player = rows && rows[0];
    if (!player) {
      fail(res, 404, 'PLAYER_NOT_FOUND', 'No player found with that name. Please create an account.'); return;
    }

    const storedHashHex = byteaHex(player.token_hash);
    if (!storedHashHex || !verifyPassword(data.password, storedHashHex)) {
      fail(res, 401, 'WRONG_PASSWORD', 'Incorrect password for this player name.'); return;
    }

    // Mint a fresh session token for this device and store its hash, which is
    // the value playerForToken() will compare against on every later
    // authenticated call. `token_hash` is deliberately left alone: it is the
    // password verifier checked above, and overwriting it here would lock this
    // account out of every future login.
    //
    // One session hash per account, so logging in on a second device signs the
    // first one out. That is the intended behaviour rather than an accident of
    // the single column: it makes a leaked token revocable by logging in again,
    // which is otherwise impossible for a credential the browser keeps forever.
    const token = newDeviceToken();
    await rest(`players?id=eq.${encodeURIComponent(player.id)}`, {
      method: 'PATCH',
      body: {
        session_token_hash: `\\x${sha256Hex(token)}`,
        last_seen_at: new Date().toISOString(),
      },
      headers: { prefer: 'return=minimal' },
    });

    ok(res, { player_id: player.id, name: player.name, token });
  } catch (error) { errorResponse(res, error); }
}
