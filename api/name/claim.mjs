import blockedNames from '../data/blocked-names.json' with { type: 'json' };
import {
  body, errorResponse, fail, isDeviceKey, isUuid, newDeviceToken, normaliseName,
  ok, rest, rpc, sha256Hex, originRateKey,
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
    if (!parsed || !isDeviceKey(data.device_key) || !isUuid(data.run_id)) {
      fail(res, 400, 'NAME_INVALID', 'Use 3–16 letters, numbers, spaces, hyphens or underscores.'); return;
    }
    if (await blocked(parsed.key)) {
      fail(res, 400, 'NAME_BLOCKED', 'That name is not available.'); return;
    }
    const originKey = originRateKey(req);
    if (originKey) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const claims = await rest(`submission_log?select=id&device_key=eq.${encodeURIComponent(originKey)}&kind=eq.claim-ip&created_at=gte.${encodeURIComponent(since)}&limit=4`);
      if (claims.length >= 3) { fail(res, 429, 'NAME_RATE_LIMIT', 'Try another name tomorrow.', true); return; }
    }
    const token = newDeviceToken();
    try {
      const rows = await rpc('fw_claim_name', {
        p_name: parsed.name, p_name_key: parsed.key, p_token_hash_hex: sha256Hex(token),
        p_device_key: data.device_key, p_run_id: data.run_id,
      });
      const player = rows && rows[0];
      if (!player) throw new Error('claim did not return a player');
      if (originKey) await rest('submission_log', {
        method: 'POST', body: { player_id: player.player_id, device_key: originKey, kind: 'claim-ip' },
        headers: { prefer: 'return=minimal' },
      });
      ok(res, { player_id: player.player_id, name: player.player_name, token,
        token_version: player.token_version });
    } catch (error) {
      if (error.status === 409 || /duplicate key|unique/i.test(JSON.stringify(error.data || error.message))) {
        fail(res, 409, 'NAME_TAKEN', 'That name is taken.', false, { suggestions: suggestions(parsed.name, parsed.key) });
        return;
      }
      throw error;
    }
  } catch (error) { errorResponse(res, error); }
}
