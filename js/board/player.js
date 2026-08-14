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

export async function registerPlayer(save, name, password, runId = null) {
  try {
    const result = await post('/auth/register', { name, password, run_id: runId, device_key: deviceKey() });
    savePlayerSecret({ player_id: result.player_id, token: result.token });
    const player = ensurePlayer(save);
    player.id = result.player_id;
    player.name = result.name;
    player.claimedAt = new Date().toISOString();
    storeSave(save);
    return result;
  } catch (error) {
    if (error.status === 400 || error.status === 409 || error.code === 'NAME_TAKEN' || error.code === 'PASSWORD_SHORT' || error.code === 'NAME_BLOCKED') {
      throw error;
    }
    const localId = 'local-' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const localToken = 'local-token-' + b64url(crypto.getRandomValues(new Uint8Array(16)));
    savePlayerSecret({ player_id: localId, token: localToken });
    const player = ensurePlayer(save);
    player.id = localId;
    player.name = name;
    player.claimedAt = new Date().toISOString();
    storeSave(save);
    return { player_id: localId, name, token: localToken, isOffline: true };
  }
}

export async function loginPlayer(save, name, password) {
  try {
    const result = await post('/auth/login', { name, password, device_key: deviceKey() });
    savePlayerSecret({ player_id: result.player_id, token: result.token });
    const player = ensurePlayer(save);
    player.id = result.player_id;
    player.name = result.name;
    player.claimedAt = new Date().toISOString();
    storeSave(save);
    return result;
  } catch (error) {
    if (error.status === 400 || error.status === 401 || error.code === 'NAME_INVALID' || error.code === 'INVALID_CREDENTIALS') {
      throw error;
    }
    const localId = 'local-' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const localToken = 'local-token-' + b64url(crypto.getRandomValues(new Uint8Array(16)));
    savePlayerSecret({ player_id: localId, token: localToken });
    const player = ensurePlayer(save);
    player.id = localId;
    player.name = name;
    player.claimedAt = new Date().toISOString();
    storeSave(save);
    return { player_id: localId, name, token: localToken, isOffline: true };
  }
}

export async function claimName(save, name, runId = null) {
  try {
    const result = await post('/name/claim', { name, run_id: runId, device_key: deviceKey() });
    savePlayerSecret({ player_id: result.player_id, token: result.token });
    const player = ensurePlayer(save);
    player.id = result.player_id;
    player.name = result.name;
    player.claimedAt = new Date().toISOString();
    storeSave(save);
    return result;
  } catch (error) {
    if (error.status === 400 || error.status === 409 || error.code === 'NAME_TAKEN' || error.code === 'NAME_BLOCKED') {
      throw error;
    }
    const localId = 'local-' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const localToken = 'local-token-' + b64url(crypto.getRandomValues(new Uint8Array(16)));
    savePlayerSecret({ player_id: localId, token: localToken });
    const player = ensurePlayer(save);
    player.id = localId;
    player.name = name;
    player.claimedAt = new Date().toISOString();
    storeSave(save);
    return { player_id: localId, name, token: localToken, isOffline: true };
  }
}

export async function renamePlayer(save, name) {
  const secret = playerSecret();
  if (!secret) throw new Error('This browser does not hold the name token.');
  try {
    const result = await post('/name/rename', { ...secret, name, device_key: deviceKey() });
    const player = ensurePlayer(save);
    player.name = result.name;
    storeSave(save);
    return result;
  } catch (error) {
    if (error.status === 400 || error.status === 409 || error.code === 'NAME_TAKEN' || error.code === 'NAME_BLOCKED') {
      throw error;
    }
    const player = ensurePlayer(save);
    player.name = name;
    storeSave(save);
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
