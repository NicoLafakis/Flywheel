import { ensurePlayer, storeSave, adoptServerName, playerName } from '../save.js';
import { post } from './request.js';
// Cloud progress follows the identity (js/cloud/sync.js): every identity change
// pulls the account's document and merges it in; sign-out flushes first. The
// import is circular (sync.js needs deviceKey/playerSecret) and safe because
// both sides only call across it from inside functions.
import { flushSync, onIdentityChanged, resetSyncForSignOut } from '../cloud/sync.js';

const DEVICE_KEY = 'fw-board-device';
const PLAYER_KEY = 'fw-player';

function b64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deviceKey() {
  let key = null;
  try { key = localStorage.getItem(DEVICE_KEY); } catch { /* persistence blocked */ }
  if (key && /^[A-Za-z0-9_-]{16,128}$/.test(key)) return key;
  key = b64url(crypto.getRandomValues(new Uint8Array(24)));
  try { localStorage.setItem(DEVICE_KEY, key); } catch { /* one-session fallback */ }
  return key;
}

export function playerSecret() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null');
    return parsed && typeof parsed.player_id === 'string' && typeof parsed.token === 'string' ? parsed : null;
  } catch { return null; }
}

export function savePlayerSecret(secret) {
  try { localStorage.setItem(PLAYER_KEY, JSON.stringify(secret)); } catch { /* claim still renders from save */ }
}

// The ONLY conditions safe to paper over with a local-only identity: a genuine
// network failure (fetch threw, timed out, or otherwise never got a response —
// `post()` in ./request.js only ever sets `error.status` from a real HTTP
// response, so no status means no server was ever reached) or a `5xx`/`429`
// that the server itself flagged `retryable` (`fail()` in api/_lib.mjs stamps
// this). Everything else — importantly `404` (no such account) and any
// unlisted status/code — must be treated as a loud, real error and re-thrown,
// never silently turned into a fabricated "signed in" identity. See
// .wiki/findings/RCA-2026-08-20-cross-device-zero-progress.md §7.
//
// One shared function so registerPlayer/loginPlayer/claimName/renamePlayer
// cannot drift apart into four slightly-different whitelists again.
export function isRetryableOffline(error) {
  if (!error) return false;
  if (error.status === undefined || error.status === null) return true;
  if ((error.status === 429 || (error.status >= 500 && error.status < 600)) && error.retryable) return true;
  return false;
}

// The server resolves name-uniqueness collisions, so the name that comes back
// from a register / login / claim / provision can differ from the one this
// device asked for. When the response carries a name it is authoritative; when
// it does not, the name the player already has stands (invariant 10 — an
// offline player must never be left without an identity).
//
// `chosen` is a name the PLAYER typed or accepted, so it is marked 'claimed'
// either way: it is not a name the game handed out and nothing may re-roll it
// behind their back.
// `nameSource` defaults to 'claimed' — a real, server-verified identity. Pass
// 'pending' only for a genuinely-offline local fallback (isRetryableOffline
// above): a `local-*` id the server has never heard of must never read as a
// real sign-in, or a second device can silently look "signed in" under a name
// it never verified (RCA-2026-08-20).
function applyIdentity(save, { player_id = null, name = null } = {}, chosen = null, nameSource = 'claimed') {
  const player = ensurePlayer(save);
  if (player_id) player.id = player_id;
  const resolved = (typeof name === 'string' && name.trim()) ? name : chosen;
  if (resolved) adoptServerName(save, resolved);
  player.claimedAt = nameSource === 'claimed' ? new Date().toISOString() : null;
  player.nameSource = nameSource;
  storeSave(save);
  // Progress follows the account: pull, merge, push. Fire-and-forget — the
  // identity is already applied and a failed pull changes nothing (invariant 10).
  void Promise.resolve(onIdentityChanged(save)).catch(() => {});
  return player.name;
}

export async function registerPlayer(save, name, password, runId = null) {
  try {
    const result = await post('/auth/register', { name, password, run_id: runId, device_key: deviceKey() });
    savePlayerSecret({ player_id: result.player_id, token: result.token });
    applyIdentity(save, result, name);
    return result;
  } catch (error) {
    if (!isRetryableOffline(error)) throw error;
    const localId = 'local-' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const localToken = 'local-token-' + b64url(crypto.getRandomValues(new Uint8Array(16)));
    savePlayerSecret({ player_id: localId, token: localToken });
    applyIdentity(save, { player_id: localId }, name, 'pending');
    return { player_id: localId, name, token: localToken, isOffline: true };
  }
}

export async function loginPlayer(save, name, password) {
  try {
    const result = await post('/auth/login', { name, password, device_key: deviceKey() });
    savePlayerSecret({ player_id: result.player_id, token: result.token });
    applyIdentity(save, result, name);
    return result;
  } catch (error) {
    // A 404 PLAYER_NOT_FOUND means the server has never heard of this name —
    // the most likely real-world trigger (RCA-2026-08-20 §2). It must surface
    // the server's own message, not fabricate a "signed in" local identity
    // under the name the player typed.
    if (!isRetryableOffline(error)) throw error;
    const localId = 'local-' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const localToken = 'local-token-' + b64url(crypto.getRandomValues(new Uint8Array(16)));
    savePlayerSecret({ player_id: localId, token: localToken });
    applyIdentity(save, { player_id: localId }, name, 'pending');
    return { player_id: localId, name, token: localToken, isOffline: true };
  }
}

export async function claimName(save, name, runId = null) {
  try {
    const result = await post('/name/claim', { name, run_id: runId, device_key: deviceKey() });
    savePlayerSecret({ player_id: result.player_id, token: result.token });
    applyIdentity(save, result, name);
    return result;
  } catch (error) {
    if (!isRetryableOffline(error)) throw error;
    const localId = 'local-' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const localToken = 'local-token-' + b64url(crypto.getRandomValues(new Uint8Array(16)));
    savePlayerSecret({ player_id: localId, token: localToken });
    applyIdentity(save, { player_id: localId }, name, 'pending');
    return { player_id: localId, name, token: localToken, isOffline: true };
  }
}

export async function renamePlayer(save, name) {
  const secret = playerSecret();
  if (!secret) throw new Error('This browser does not hold the name token.');
  try {
    const result = await post('/name/rename', { ...secret, name, device_key: deviceKey() });
    applyIdentity(save, result, name);
    return result;
  } catch (error) {
    if (!isRetryableOffline(error)) throw error;
    // No new identity is minted here (the existing, already-real secret is
    // reused) — only the label on an already-claimed account changes locally
    // until the rename reaches the server, so this stays 'claimed'.
    applyIdentity(save, {}, name);
    return { name, isOffline: true };
  }
}

export async function startTransfer(save) {
  const secret = playerSecret();
  if (!secret) throw new Error('This browser does not hold the name token.');
  return post('/name/transfer/start', { ...secret, device_key: deviceKey() });
}

export async function redeemTransfer(save, code) {
  const result = await post('/name/transfer/redeem', { code, device_key: deviceKey() });
  savePlayerSecret({ player_id: result.player_id, token: result.token });
  applyIdentity(save, result);
  return result;
}

export async function removePlayer(save) {
  const secret = playerSecret();
  if (!secret) throw new Error('This browser does not hold the name token.');
  await post('/player/remove', secret);
  try { localStorage.removeItem(PLAYER_KEY); } catch { /* ignored */ }
  // Their published identity is gone, but the device is still a player: hand it
  // a fresh automatic name rather than a blank one, or every surface that prints
  // a name renders empty until they sign in again.
  const player = ensurePlayer(save);
  player.id = null; player.name = null; player.claimedAt = null; player.nameSource = 'auto';
  playerName(save);
}

// Sign OUT, which is not removePlayer (that deletes the account). Order is
// load-bearing: flush any progress this device still owes the account FIRST
// (capped so a dead network cannot hold the button), THEN drop the token, then
// hand the device a fresh automatic name. Local progress deliberately STAYS on
// the device (§3.4 product default): a shared family tablet loses nothing, and
// the next sign-in merges it into that account, which can only add.
export async function signOutPlayer(save, { flushTimeoutMs = 5000 } = {}) {
  try {
    await Promise.race([
      Promise.resolve(flushSync(save)).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, flushTimeoutMs)),
    ]);
  } catch { /* the flush is best-effort; signing out must not depend on it */ }
  try { localStorage.removeItem(PLAYER_KEY); } catch { /* ignored */ }
  resetSyncForSignOut(save);
  const player = ensurePlayer(save);
  player.id = null; player.name = null; player.claimedAt = null; player.nameSource = 'auto';
  playerName(save);
  storeSave(save);
}
