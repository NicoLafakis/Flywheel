// Shared Vercel Function primitives. This is intentionally dependency-free:
// the API can deploy from the static repository without changing browser boot.

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const RANKED_SCENES = Object.freeze(['chicago', 'brooklyn', 'boston', 'cambridge', 'manhattan', 'upper-manhattan']);
export const TICKET_TTL_MS = 15 * 60 * 1000;
export const MAX_REQUEST_BYTES = 65536;

// Weekly seasons anchor: Monday 00:00:00 UTC, Aug 10, 2026 (Season 1).
const SEASON_EPOCH_MS = Date.UTC(2026, 7, 10, 0, 0, 0); // 2026-08-10T00:00:00Z
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function currentWeeklySeasonId(nowMs = Date.now()) {
  const elapsed = Math.max(0, nowMs - SEASON_EPOCH_MS);
  return 1 + Math.floor(elapsed / WEEK_MS);
}

export function json(res, status, payload) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function ok(res, data, status = 200) { json(res, status, { ok: true, data }); }

export function fail(res, status, code, message, retryable = false, extra = {}) {
  json(res, status, { ok: false, error: { code, message, retryable, ...extra } });
}

export function method(req, res, expected) {
  if (req.method === expected) return true;
  res.setHeader('allow', expected);
  fail(res, 405, 'METHOD_NOT_ALLOWED', `Use ${expected}.`);
  return false;
}

export async function body(req, limit = MAX_REQUEST_BYTES) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new RangeError('request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TypeError('request body must be JSON'); }
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing server environment ${name}`);
  return value;
}

function serviceHeaders(extra = {}) {
  const key = requiredEnv('SUPABASE_SECRET_KEY');
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

export async function rest(path, { method: verb = 'GET', body: payload, headers = {} } = {}) {
  const base = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method: verb,
    headers: serviceHeaders({
      accept: 'application/json',
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    }),
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`Supabase ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function rpc(name, payload) {
  return rest(`rpc/${name}`, { method: 'POST', body: payload, headers: { prefer: 'return=representation' } });
}

export const isUuid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const isDeviceKey = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);

export function newDeviceToken() { return randomBytes(32).toString('base64url'); }
export function newRunId() { return randomUUID(); }
export function newSeed() { return randomBytes(18).toString('base64url'); }
// Same unambiguous alphabet as the existing arena room codes. Rejection
// sampling avoids the modulo bias a six-character ownership code should not
// quietly inherit from a byte source.
const TRANSFER_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ23456789';
export function randomCode(length) {
  const limit = 256 - (256 % TRANSFER_ALPHABET.length);
  let code = '';
  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && code.length < length) code += TRANSFER_ALPHABET[byte % TRANSFER_ALPHABET.length];
    }
  }
  return code;
}
export function sha256Hex(value) { return createHash('sha256').update(value).digest('hex'); }
export function sha256Bytes(value) { return createHash('sha256').update(value).digest(); }

export function hashPassword(password) {
  const secret = requiredEnv('FW_TICKET_SECRET');
  return createHmac('sha256', secret).update(password.normalize('NFKC')).digest();
}

export function verifyPassword(password, storedHashHex) {
  const expected = Buffer.from(storedHashHex, 'hex');
  const actual = hashPassword(password);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Rate-limit network origins without retaining an address in the database.
// Vercel supplies the left-most forwarded address; local development falls back
// to the socket address. The key is HMACed under a server-only secret, not an
// unhashed address or a reversible plain digest. A missing address simply leaves
// the device limit in force — availability should not depend on edge headers.
export function originRateKey(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const address = typeof forwarded === 'string' ? forwarded.split(',')[0].trim()
    : (req.socket && req.socket.remoteAddress) || '';
  return address ? `ip-${createHmac('sha256', requiredEnv('FW_TICKET_SECRET')).update(address).digest('hex').slice(0, 40)}` : null;
}

export function makeTicket(fields) {
  const secret = requiredEnv('FW_TICKET_SECRET');
  const issuedMs = Date.parse(fields.issued_at);
  const message = [fields.run_id, fields.seed, fields.scene_id, fields.mode,
    fields.tune_id, fields.player_id || '', String(issuedMs)].join('|');
  return createHmac('sha256', secret).update(message).digest('base64url');
}

export function validTicket(ticket, fields) {
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return false;
  const expected = Buffer.from(makeTicket(fields));
  const actual = Buffer.from(ticket);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function byteaHex(value) {
  if (typeof value !== 'string') return '';
  return value.startsWith('\\x') ? value.slice(2) : value;
}

export async function playerForToken(id, token) {
  if (!isUuid(id) || typeof token !== 'string' || token.length < 32) return null;
  // `select=*` rather than a column list, deliberately. PostgREST answers a
  // select naming a column the database does not have with a 400 for the WHOLE
  // request, and `session_token_hash` arrives in a migration applied by hand
  // (there is no CI that runs it) while this code deploys on push. A star keeps
  // the function every bearer-gated endpoint depends on working on both sides of
  // that migration, instead of taking device auth down if the code lands first.
  // Nothing echoes this row to a client - callers read `id` and `name` only.
  const rows = await rest(`players?select=*&id=eq.${encodeURIComponent(id)}`);
  const player = rows && rows[0];
  if (!player || player.moderation_state === 'hidden') return null;
  // Two account kinds, one comparison, and the precedence is exclusive rather
  // than "whichever hash matches":
  //   * password accounts (auth/register, auth/login) keep HMAC-SHA256(password)
  //     in `token_hash` as the password verifier, and sha256(session token) in
  //     `session_token_hash`;
  //   * device-token accounts (name/claim, name/transfer/redeem) have no
  //     password and keep sha256(token) in `token_hash`, with no session hash.
  // Checking only the column that belongs to the account kind is what stops a
  // password digest from ever standing in as a bearer target, and it is what
  // makes `session_token_hash = null` - which fw_remove_player and
  // fw_transfer_redeem now set - an actual revocation rather than a quiet
  // fall-through to the other column.
  const sessionHash = player.session_token_hash ? byteaHex(player.session_token_hash) : '';
  const expected = Buffer.from(sessionHash || byteaHex(player.token_hash), 'hex');
  const actual = sha256Bytes(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  await rest(`players?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: { last_seen_at: new Date().toISOString() }, headers: { prefer: 'return=minimal' },
  });
  return player;
}

export function normaliseName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').replace(/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '');
  if (name.length < 3 || name.length > 16
    || !/^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/.test(name)) return null;
  const leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's' };
  const key = name.toLowerCase().replace(/[01345]/g, (char) => leet[char]).replace(/[^a-z0-9]/g, '');
  return key ? { name, key } : null;
}

export function operatorAuthorised(req) {
  const supplied = req.headers['x-fw-operator'];
  const expected = process.env.FW_OPERATOR_SECRET;
  if (typeof supplied !== 'string' || !expected) return false;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronAuthorised(req) {
  const supplied = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  return !!expected && supplied === `Bearer ${expected}`;
}

export function errorResponse(res, error) {
  if (error instanceof TypeError || error instanceof RangeError) {
    fail(res, 400, 'BAD_REQUEST', error.message, false);
  } else if (/missing server environment/.test(error && error.message)) {
    fail(res, 503, 'SERVER_NOT_READY', 'The boards service is not configured yet.', true);
  } else {
    console.error(error);
    fail(res, 503, 'SERVICE_UNAVAILABLE', 'The boards service is temporarily unavailable.', true);
  }
}
