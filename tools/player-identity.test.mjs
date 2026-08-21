// TDD regression suite for RCA-2026-08-20-cross-device-zero-progress.md.
//
// The defect: registerPlayer/loginPlayer/claimName in js/board/player.js
// whitelisted a small set of "loud" errors and silently minted a fake
// `local-*` identity for EVERY other server failure, including a 404
// PLAYER_NOT_FOUND on login — so a player signing in on a second device could
// get a phantom, empty, "claimed"-looking identity under their own real name.
//
// The fix is a deny-list (js/board/player.js `isRetryableOffline`): only a
// genuine network failure (no `error.status` at all) or a `5xx`/`429` the
// server flags `retryable` may fall back to a local identity. Everything
// else, importantly 404, must reject for real. And when the fallback DOES
// fire, the identity is marked `nameSource: 'pending'`, never `'claimed'`, so
// the UI cannot claim a phantom identity is a real signed-in account.
//
// Spawned by the `progressSync` section of tools/validate.mjs (js/board/player.js
// is already covered there). Run alone: node tools/player-identity.test.mjs
import assert from 'node:assert/strict';

// --- fakes, installed BEFORE the modules under test are imported -----------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
let responder = null; // set per-test: (path, body) => { status, json } | throws
globalThis.fetch = async (url, init) => {
  if (typeof responder !== 'function') throw new Error('no responder configured for this test');
  const body = JSON.parse(init.body);
  const path = String(url).replace(/^\/api/, '');
  const r = await responder(path, body);
  if (r === 'NETWORK_ERROR') throw new TypeError('fetch failed');
  return { ok: r.status < 400, status: r.status, json: async () => r.json };
};

const { isRetryableOffline, registerPlayer, loginPlayer, claimName, renamePlayer, savePlayerSecret, playerSecret } =
  await import('../js/board/player.js');
const { __freshSave } = await import('../js/save.js');
const { syncStatus } = await import('../js/cloud/sync.js');
const { syncIndicator } = await import('../js/ui/sync-copy.js');

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n++; };

function fresh() {
  store.clear();
  return __freshSave();
}

// ---------------------------------------------------------------------------
// isRetryableOffline: the deny-list itself.
// ---------------------------------------------------------------------------
{
  check(isRetryableOffline(null) === false, 'no error at all is not retryable-offline');
  check(isRetryableOffline({}) === true, 'an error with no status (fetch threw, or network error) IS retryable-offline');
  check(isRetryableOffline({ status: 404, code: 'PLAYER_NOT_FOUND' }) === false, '404 must NOT be treated as offline-safe');
  check(isRetryableOffline({ status: 400 }) === false, '400 must NOT be treated as offline-safe');
  check(isRetryableOffline({ status: 409, code: 'NAME_TAKEN' }) === false, '409 must NOT be treated as offline-safe');
  check(isRetryableOffline({ status: 500, retryable: false }) === false, 'a 500 NOT flagged retryable by the server must not fall back');
  check(isRetryableOffline({ status: 500, retryable: true }) === true, 'a 500 flagged retryable by the server may fall back');
  check(isRetryableOffline({ status: 503, retryable: true }) === true, 'a 503 flagged retryable by the server may fall back');
  check(isRetryableOffline({ status: 429, retryable: true }) === true, 'a 429 flagged retryable by the server may fall back');
  check(isRetryableOffline({ status: 429, retryable: false }) === false, 'a 429 NOT flagged retryable must not fall back');
}

// ---------------------------------------------------------------------------
// Item 5: a 404 PLAYER_NOT_FOUND must REJECT loginPlayer, not fake success.
// ---------------------------------------------------------------------------
{
  const save = fresh();
  responder = async () => ({ status: 404, json: { ok: false, error: { code: 'PLAYER_NOT_FOUND', message: 'No player found with that name. Please create an account.', retryable: false } } });
  let threw = null;
  try {
    await loginPlayer(save, 'Cr4sh0veRide', 'whatever');
  } catch (e) { threw = e; }
  check(threw !== null, 'loginPlayer must reject on 404 PLAYER_NOT_FOUND, not resolve');
  check(threw && threw.status === 404 && threw.code === 'PLAYER_NOT_FOUND', 'the rejection must carry the server status/code through');
  check(threw && /No player found/.test(threw.message), 'the rejection must surface the server\'s real message, not a generic one');
  const secret = playerSecret();
  check(secret === null, 'no local-* secret may be written to storage after a 404');
  check(save.player.nameSource !== 'claimed', 'a rejected login must not mark the save as a claimed identity');
}

// ---------------------------------------------------------------------------
// Item 6: a plain network error (no status at all) preserves the OLD offline
// fallback behaviour, but the identity is now 'pending', not 'claimed'.
// ---------------------------------------------------------------------------
{
  const save = fresh();
  responder = async () => 'NETWORK_ERROR';
  const res = await loginPlayer(save, 'Cr4sh0veRide', 'whatever');
  check(res && res.isOffline === true, 'a genuine network error must still resolve with isOffline:true (invariant 10)');
  check(typeof res.player_id === 'string' && res.player_id.startsWith('local-'), 'the offline fallback must still mint a local-* id');
  check(save.player.nameSource === 'pending', `a genuine offline fallback must mark nameSource 'pending', got ${JSON.stringify(save.player.nameSource)}`);
  check(save.player.nameSource !== 'claimed', 'an unverified local fallback must never read as claimed');
  const secret = playerSecret();
  check(secret && secret.player_id.startsWith('local-'), 'the local secret IS written to storage for the offline fallback (invariant 10: still playable)');
}

// ---------------------------------------------------------------------------
// Item 7: a 503 the server marks retryable ALSO takes the offline fallback
// path — the legitimate case invariant 10 protects.
// ---------------------------------------------------------------------------
{
  const save = fresh();
  responder = async () => ({ status: 503, json: { ok: false, error: { code: 'DB_UNAVAILABLE', message: 'Boards are unavailable.', retryable: true } } });
  const res = await loginPlayer(save, 'Cr4sh0veRide', 'whatever');
  check(res && res.isOffline === true, 'a retryable 503 must take the offline fallback path');
  check(save.player.nameSource === 'pending', 'a retryable-503 fallback must mark nameSource pending, not claimed');
}

// A 503 the server does NOT mark retryable must NOT fall back.
{
  const save = fresh();
  responder = async () => ({ status: 503, json: { ok: false, error: { code: 'MAINTENANCE', message: 'Down for maintenance.', retryable: false } } });
  let threw = null;
  try { await loginPlayer(save, 'X', 'y'); } catch (e) { threw = e; }
  check(threw !== null, 'a 503 NOT flagged retryable must reject, not fall back');
}

// ---------------------------------------------------------------------------
// registerPlayer and claimName share the same deny-list.
// ---------------------------------------------------------------------------
{
  const save = fresh();
  responder = async () => ({ status: 409, json: { ok: false, error: { code: 'NAME_TAKEN', message: 'Name taken.', retryable: false } } });
  let threw = null;
  try { await registerPlayer(save, 'Cr4sh0veRide', 'pw123'); } catch (e) { threw = e; }
  check(threw && threw.code === 'NAME_TAKEN', 'registerPlayer must still surface NAME_TAKEN loudly');

  const save2 = fresh();
  responder = async () => 'NETWORK_ERROR';
  const res2 = await registerPlayer(save2, 'Someone', 'pw123');
  check(res2.isOffline === true && save2.player.nameSource === 'pending', 'registerPlayer offline fallback must be pending, not claimed');

  const save3 = fresh();
  responder = async () => ({ status: 404, json: { ok: false, error: { code: 'WEIRD', message: 'unexpected', retryable: false } } });
  let threw3 = null;
  try { await claimName(save3, 'Someone', null); } catch (e) { threw3 = e; }
  check(threw3 !== null, 'claimName must reject on an unrecognized non-retryable error rather than fabricating success');
}

// ---------------------------------------------------------------------------
// renamePlayer: does not mint a NEW identity (reuses the existing secret), so
// its offline fallback stays 'claimed' — but a non-retryable error must still
// reject rather than silently relabel.
// ---------------------------------------------------------------------------
{
  const save = fresh();
  savePlayerSecret({ player_id: 'p_real', token: 'tok_real' });
  save.player.id = 'p_real'; save.player.name = 'Old Name'; save.player.nameSource = 'claimed';
  responder = async () => ({ status: 409, json: { ok: false, error: { code: 'NAME_TAKEN', message: 'taken', retryable: false } } });
  let threw = null;
  try { await renamePlayer(save, 'New Name'); } catch (e) { threw = e; }
  check(threw && threw.code === 'NAME_TAKEN', 'renamePlayer must reject NAME_TAKEN loudly');

  responder = async () => 'NETWORK_ERROR';
  const res = await renamePlayer(save, 'New Name');
  check(res.isOffline === true, 'renamePlayer offline fallback still resolves (invariant 10)');
  check(save.player.nameSource === 'claimed', 'renamePlayer does not mint a new local identity, so it stays claimed');
}

// ---------------------------------------------------------------------------
// Item 8, UI-facing: a fallback ('pending') identity's sync indicator is
// never null/absent — a phantom identity must never look silent AND the
// boards.js "credited to this account on every device" copy is gated on
// nameSource === 'claimed', which a pending identity never satisfies.
// ---------------------------------------------------------------------------
{
  const save = fresh();
  responder = async () => 'NETWORK_ERROR';
  await loginPlayer(save, 'Cr4sh0veRide', 'whatever');
  check(save.player.nameSource === 'pending', 'setup: fallback identity is pending');
  const status = syncStatus(save);
  const ind = syncIndicator(status);
  check(ind !== null, `a fallback identity's sync indicator must not be null/absent (status was ${JSON.stringify(status)})`);
  check(save.player.nameSource !== 'claimed', 'a fallback identity with a visible indicator must never simultaneously read as claimed');
}

if (n < 10) { console.error(`player-identity: suspiciously few assertions ran (${n})`); process.exit(1); }
console.log(`player-identity: ok (${n} assertions)`);
