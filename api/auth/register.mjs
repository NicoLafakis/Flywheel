import blockedNames from '../data/blocked-names.json' with { type: 'json' };
import {
  body, errorResponse, fail, hashPassword, isDeviceKey, newDeviceToken, normaliseName,
  ok, rest, sha256Hex, originRateKey,
} from '../_lib.mjs';

const RESERVED = new Set(['admin', 'administrator', 'moderator', 'official', 'staff', 'support', 'system', 'flywheel', 'sprocket']);

async function blocked(key) {
  if (RESERVED.has(key) || blockedNames.some((row) => key.includes(row.pattern))) return true;
  const rows = await rest(`blocked_names?select=pattern,is_exact&limit=500`);
  return rows.some((row) => row.is_exact ? key === row.pattern : key.includes(row.pattern));
}

function suggestions(name, key) {
  const suffixes = ['7', 'X', '27', 'GO', 'RUN'];
  return suffixes.map((suffix) => `${name.slice(0, Math.max(1, 16 - suffix.length))}${suffix}`)
    .filter((candidate) => candidate.toLowerCase().replace(/[^a-z0-9]/g, '') !== key);
}

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

    const inserted = await rest('players', {
      method: 'POST',
      body: {
        name: parsed.name,
        name_key: parsed.key,
        token_hash: `\\x${passHashHex}`,
        session_token_hash: `\\x${sha256Hex(token)}`,
        token_version: 1,
        moderation_state: 'ok',
        last_seen_at: new Date().toISOString(),
      },
      headers: { prefer: 'return=representation' },
    });

    const player = inserted && inserted[0];
    if (!player) throw new Error('Player creation failed');

    // Link any recent runs for this device
    if (data.run_id) {
      await rest(`runs?id=eq.${encodeURIComponent(data.run_id)}`, {
        method: 'PATCH',
        body: { player_id: player.id },
        headers: { prefer: 'return=minimal' },
      });
    }

    if (originKey) {
      await rest('submission_log', {
        method: 'POST', body: { player_id: player.id, device_key: originKey, kind: 'claim-ip' },
        headers: { prefer: 'return=minimal' },
      });
    }

    ok(res, { player_id: player.id, name: player.name, token });
  } catch (error) {
    if (error.status === 409 || /duplicate key|unique/i.test(JSON.stringify(error.data || error.message))) {
      fail(res, 409, 'NAME_TAKEN', 'That name is taken.', false);
      return;
    }
    errorResponse(res, error);
  }
}
