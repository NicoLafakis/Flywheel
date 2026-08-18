// Behaviour suite for js/cloud/sync.js (tasks 8, 10, 11 of the cloud progress
// plan) under a fake fetch, fake timers and a fake localStorage. Spawned by the
// `progressSync` section of tools/validate.mjs. Nothing here touches the
// network or a real clock.
import assert from 'node:assert/strict';

// --- fakes, installed BEFORE the modules under test are imported -----------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
const calls = [];           // every fetch: { path, body }
let responder = () => ({ status: 200, json: { ok: true, data: {} } });
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const path = String(url).replace(/^\/api/, '');
  calls.push({ path, body });
  const r = await responder(path, body);
  return { ok: r.status < 400, status: r.status, json: async () => r.json };
};

const { createSync, flushSync, onIdentityChanged, configureSync } = await import('../js/cloud/sync.js');
const {
  __freshSave, CURRENT_VERSION, markProgressDirty,
  recordLevelResult, recordSandboxResult, recordChallengeResult, buyUpgrade,
} = await import('../js/save.js');
const { savePlayerSecret, signOutPlayer } = await import('../js/board/player.js');
const { toBlob } = await import('../js/cloud/blob.js');

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };
const UUID = '11111111-2222-4333-8444-555555555555';
const secret = { player_id: UUID, token: 'tok_' + 'x'.repeat(40) };
savePlayerSecret(secret);
const pushOk = (blob, revision = 1, extra = {}) => ({ status: 200, json: { ok: true, data: { revision, blob, trimmed: [], merged: false, ...extra } } });
const err = (status, code, retryable) => ({ status, json: { ok: false, error: { code, message: code, retryable } } });

// Fake timers: setTimeout schedules into a list; tick(ms) fires what is due.
function fakeClock() {
  let now = 1_000_000; let id = 0; const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { id++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (h) => { timers.delete(h); },
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); await due[1].fn(); await Promise.resolve();
      }
      now = until;
    },
  };
}
const fakeDeps = (clock, extra = {}) => ({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, ...extra });

// ---------------------------------------------------------------------------
// 1. Task 9: every recorder marks the save dirty and stamps lastLocalChangeAt.
// ---------------------------------------------------------------------------
{
  const s = __freshSave();
  const t0 = s.cloud.lastLocalChangeAt;
  recordLevelResult(s, 1, { stars: 2, mass: 10, bestCombo: 1, won: true, coinsEarned: 5, elapsed: 30 });
  check(s.cloud.dirty === true && typeof s.cloud.lastLocalChangeAt === 'number' && s.cloud.lastLocalChangeAt !== t0, 'recordLevelResult marks dirty + lastLocalChangeAt');
  s.cloud.dirty = false;
  recordSandboxResult(s, 'gallery', { coinsEarned: 1, size: 2, elapsed: 50 });
  check(s.cloud.dirty === true, 'recordSandboxResult marks dirty');
  s.cloud.dirty = false;
  recordChallengeResult(s, 'gallery', { coinsEarned: 1, elapsed: 50, score: 10 });
  check(s.cloud.dirty === true, 'recordChallengeResult marks dirty');
  s.cloud.dirty = false; s.coins = 10_000;
  buyUpgrade(s, 'speed');
  check(s.cloud.dirty === true, 'buyUpgrade marks dirty');
  const bare = { coins: 0 };
  markProgressDirty(bare);
  check(bare.cloud && bare.cloud.dirty === true, 'markProgressDirty re-establishes a missing cloud block (seatbelt)');
}

// ---------------------------------------------------------------------------
// 2. Task 8: debounce — five dirty marks collapse into one push.
// ---------------------------------------------------------------------------
{
  const clock = fakeClock();
  const sync = createSync(fakeDeps(clock, { debounceMs: 8000 }));
  const s = __freshSave();
  calls.length = 0;
  responder = (path, body) => pushOk(body.blob, 1);
  for (let i = 0; i < 5; i++) { s.coins += 1; markProgressDirty(s); sync.scheduleSync(s); await clock.tick(1000); }
  eq(calls.length, 0, 'nothing pushed inside the debounce window');
  await clock.tick(8000);
  eq(calls.filter((c) => c.path === '/progress/push').length, 1, 'five dirty marks -> one push');
  const sent = calls[0].body;
  check(sent.player_id === UUID && sent.token === secret.token && typeof sent.device_key === 'string' && sent.base_revision === 0 && sent.schema_version === CURRENT_VERSION, 'push carries {player_id, token, device_key, base_revision, schema_version, blob}');
  eq(sent.blob, toBlob(s), 'push sends toBlob(save)');
  check(s.cloud.dirty === false && s.cloud.revision === 1 && typeof s.cloud.lastPushedAt === 'number', 'a successful push clears dirty and adopts the revision');
  eq(sync.status(s), 'synced', 'status reads synced');
  // The canonical blob is adopted (fence trimmed coins here).
  s.coins = 500; markProgressDirty(s);
  responder = (path, body) => pushOk({ ...body.blob, coins: 12 }, 2, { trimmed: ['neon'] });
  await sync.flushSync(s);
  eq(s.coins, 12, 'client adopts the canonical blob the server kept');
  eq(sync.lastTrimmed(), ['neon'], 'trimmed ids are held for the UI');
  eq(s.cloud.revision, 2, 'revision follows the server');
}

// ---------------------------------------------------------------------------
// 3. Retryable failure keeps dirty; offline (network throw) too; 401 stops.
// ---------------------------------------------------------------------------
{
  const clock = fakeClock();
  const sync = createSync(fakeDeps(clock));
  const s = __freshSave();
  s.coins = 3; markProgressDirty(s);
  responder = () => err(503, 'SERVER_NOT_READY', true);
  await sync.flushSync(s);
  check(s.cloud.dirty === true, 'retryable failure keeps dirty');
  eq(sync.status(s), 'offline', 'status reads offline after a retryable failure');
  responder = () => { throw new TypeError('fetch failed'); };
  await sync.flushSync(s);
  check(s.cloud.dirty === true && sync.status(s) === 'offline', 'a network throw is retryable: still dirty, still offline');
  calls.length = 0;
  responder = () => err(401, 'NOT_SIGNED_IN', false);
  await sync.flushSync(s);
  eq(sync.status(s), 'signed-out', '401 -> signed-out state');
  eq(s.cloud.state, 'signed-out', 'signed-out state persists on the save');
  await sync.flushSync(s);
  eq(calls.length, 1, 'after 401 no further push is attempted');
  check(s.cloud.dirty === true, 'the local changes are kept, not discarded');
  // Identity change clears the stop.
  responder = (path, body) => (path === '/progress/pull' ? { status: 200, json: { ok: true, data: { found: false } } } : pushOk(body.blob, 1));
  await sync.onIdentityChanged(s);
  check(calls.some((c) => c.path === '/progress/pull'), 'onIdentityChanged pulls');
  check(sync.status(s) !== 'signed-out', 'onIdentityChanged clears the signed-out stop');
}

// ---------------------------------------------------------------------------
// 4. Invariant 4: while playing, nothing is applied and no push leaves.
// ---------------------------------------------------------------------------
{
  const clock = fakeClock();
  let playing = true;
  const sync = createSync(fakeDeps(clock, { isPlaying: () => playing }));
  const s = __freshSave();
  s.coins = 4; markProgressDirty(s);
  calls.length = 0;
  responder = (path, body) => pushOk(body.blob, 1);
  await sync.flushSync(s);
  eq(calls.length, 0, 'flushSync during playing sends nothing');
  check(s.cloud.dirty === true, 'still dirty while playing');
  playing = false;
  await sync.flushSync(s);
  eq(calls.length, 1, 'the deferred push leaves once the player is back in the menu');
}

// ---------------------------------------------------------------------------
// 5. Pull merges rather than overwrites; task 10: a v24 remote is upgraded.
// ---------------------------------------------------------------------------
{
  const clock = fakeClock();
  const sync = createSync(fakeDeps(clock));
  const s = __freshSave();
  s.coins = 50; s.levels[1] = { stars: 3, bestMass: 100, bestCombo: 2, won: true, fastestClear: 40 };
  s.ownedItems = ['neon']; s.equippedSkin = 'neon';
  const remote = {
    coins: 30, levels: { 2: { stars: 1, bestMass: 20, bestCombo: 1, won: true, fastestClear: null } },
    sandbox: {}, challenges: {}, ownedItems: ['lava'], equippedSkin: 'lava', equippedIndicator: 'ind-default',
    upgrades: { speed: 2, vortex: 0, growth: 0, duration: 0 }, muted: false, settings: { musicVol: 0.2 },
  };
  calls.length = 0;
  responder = (path, body) => (path === '/progress/pull'
    ? { status: 200, json: { ok: true, data: { found: true, revision: 7, schema_version: 24, blob: remote, coins_verified: 0, coins_ceiling: 0, updated_at: '2026-01-01T00:00:00Z' } } }
    : pushOk(body.blob, 8));
  await sync.pull(s);
  eq(s.coins, 50, 'coins: max, never sum');
  check(s.levels[1].stars === 3 && s.levels[2].stars === 1, 'levels merged, not overwritten');
  eq([...s.ownedItems].sort(), ['lava', 'neon'], 'ownedItems union');
  eq(s.upgrades.speed, 2, 'upgrades max');
  check(typeof s.cloud.lastPulledAt === 'number', 'lastPulledAt stamped');
  const push = calls.find((c) => c.path === '/progress/push');
  check(push && push.body.base_revision === 7, 'the merge changed the document, so it is pushed back on the pulled revision');
  eq(s.cloud.revision, 8, 'revision follows the push that followed the pull');
  // Task 10: schema_version 24 remote passed through MIGRATIONS[24] without a throw and without leaking `cloud`.
  check(!('cloud' in toBlob(s)), 'the v24 remote upgrade path neither throws nor leaks cloud into the blob');
  check(s.equippedSkin === 'neon' || s.equippedSkin === 'lava', 'equipped stays a wearable item');
}

// found:false with a non-trivial local save pushes as revision 1.
{
  const clock = fakeClock();
  const sync = createSync(fakeDeps(clock));
  const s = __freshSave(); s.coins = 9;
  calls.length = 0;
  responder = (path, body) => (path === '/progress/pull' ? { status: 200, json: { ok: true, data: { found: false } } } : pushOk(body.blob, 1));
  await sync.onIdentityChanged(s);
  const push = calls.find((c) => c.path === '/progress/push');
  check(push && push.body.base_revision === 0 && push.body.blob.coins === 9, 'first sign-in with local progress pushes it as the account first document');
  eq(s.cloud.revision, 1, 'revision 1 adopted');
  // And a trivial local save with nothing on the server pushes nothing.
  const t = __freshSave();
  calls.length = 0;
  await sync.onIdentityChanged(t);
  eq(calls.filter((c) => c.path === '/progress/push').length, 0, 'an empty save on an empty account is not pushed');
}

// A pull that fails leaves play untouched (invariant 10).
{
  const clock = fakeClock();
  const sync = createSync(fakeDeps(clock));
  const s = __freshSave(); s.coins = 9;
  responder = () => { throw new TypeError('fetch failed'); };
  await sync.onIdentityChanged(s);
  eq(s.coins, 9, 'a failed pull changes nothing');
  eq(sync.status(s), 'offline', 'and reads offline');
}

// No secret / an offline local-* secret: nothing leaves the device.
{
  const sync = createSync({});
  const s = __freshSave(); s.coins = 2; markProgressDirty(s);
  savePlayerSecret({ player_id: 'local-abc', token: 'local-token-x' });
  calls.length = 0;
  await sync.flushSync(s);
  eq(calls.length, 0, 'an offline local-* account never pushes');
  store.delete('fw-player');
  await sync.flushSync(s);
  eq(calls.length, 0, 'no secret, no push');
  savePlayerSecret(secret);
}

// ---------------------------------------------------------------------------
// 6. Task 11: signOutPlayer flushes, then drops the token, keeps progress.
// ---------------------------------------------------------------------------
{
  configureSync({ isPlaying: () => false });
  const s = __freshSave(); s.coins = 42; s.ownedItems = ['neon']; markProgressDirty(s);
  s.player.id = UUID; s.player.name = 'Claimed'; s.player.nameSource = 'claimed';
  calls.length = 0;
  const order = [];
  responder = (path, body) => { order.push('push'); return pushOk(body.blob, 3); };
  const origRemove = globalThis.localStorage.removeItem;
  globalThis.localStorage.removeItem = (k) => { order.push('remove:' + k); origRemove(k); };
  await signOutPlayer(s);
  globalThis.localStorage.removeItem = origRemove;
  eq(order, ['push', 'remove:fw-player'], 'sign-out flushes first, then removes the token');
  eq(s.coins, 42, 'progress stays on the device');
  eq(s.ownedItems, ['neon'], 'skins stay on the device');
  check(s.player.nameSource === 'auto' && typeof s.player.name === 'string' && s.player.name.length > 0 && s.player.id === null, 'a fresh auto name replaces the claimed one');
  check(s.cloud.revision === 0 && s.cloud.dirty === false, 'cloud bookkeeping resets so the next account starts from a clean pull');
  check(store.get('fw-player') === undefined, 'token gone');
  // Sign-out with the server unreachable still signs out.
  savePlayerSecret(secret);
  const t = __freshSave(); t.coins = 1; markProgressDirty(t);
  responder = () => { throw new TypeError('fetch failed'); };
  await signOutPlayer(t);
  check(store.get('fw-player') === undefined && t.coins === 1, 'sign-out never blocks on the network');
}

check(typeof flushSync === 'function' && typeof onIdentityChanged === 'function', 'default instance exported');

console.log(`progress-sync: ${n} assertions passed.`);
