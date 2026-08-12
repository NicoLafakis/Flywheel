import { ensurePlayer, storeSave } from '../save.js';
import { post } from './request.js';

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

export async function claimName(save, name, runId) {
  const result = await post('/name/claim', { name, run_id: runId, device_key: deviceKey() });
  savePlayerSecret({ player_id: result.player_id, token: result.token });
  const player = ensurePlayer(save);
  player.id = result.player_id;
  player.name = result.name;
  player.claimedAt = new Date().toISOString();
  storeSave(save);
  return result;
}

export async function startTransfer(save) {
  const secret = playerSecret();
  if (!secret) throw new Error('This browser does not hold the name token.');
  return post('/name/transfer/start', { ...secret, device_key: deviceKey() });
}

export async function redeemTransfer(save, code) {
  const result = await post('/name/transfer/redeem', { code, device_key: deviceKey() });
  savePlayerSecret({ player_id: result.player_id, token: result.token });
  const player = ensurePlayer(save);
  player.id = result.player_id;
  player.name = result.name;
  player.claimedAt = new Date().toISOString();
  storeSave(save);
  return result;
}

export async function removePlayer(save) {
  const secret = playerSecret();
  if (!secret) throw new Error('This browser does not hold the name token.');
  await post('/player/remove', secret);
  try { localStorage.removeItem(PLAYER_KEY); } catch { /* ignored */ }
  const player = ensurePlayer(save);
  player.id = null; player.name = null; player.claimedAt = null;
  storeSave(save);
}
