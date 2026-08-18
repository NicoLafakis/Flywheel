// Behaviour suite for the cloud-progress server side: api/_progress.mjs
// (SYNCED_KEYS, sanitiseBlob, coinFence) and the two routes under
// api/progress/, driven with a fake req/res and a stubbed database. Spawned by
// the `progressApi` section of tools/validate.mjs.
//
// The handlers export `makeHandler(deps)` precisely so this file can hand them
// an in-memory `rest`/`rpc`/`playerForToken`; the default export wires the real
// ones from api/_lib.mjs. Nothing here touches the network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SYNCED_KEYS, SYNCED_SETTINGS_KEYS, sanitiseBlob, coinFence, coinsCeiling, spentCoins,
  PUSHES_PER_HOUR, REPLAY_ALLOWANCE,
} from '../api/_progress.mjs';
import { makeHandler as makePull } from '../api/progress/pull.mjs';
import { makeHandler as makePush } from '../api/progress/push.mjs';
import { CURRENT_VERSION, __freshSave } from '../js/save.js';
import { coinsForResult, LEVELS } from '../js/levels.js';
import { COSMETIC_PRICES, PARTNER_ROWS } from '../js/skinprices.js';
import { UPGRADE_COST_TABLE } from '../js/upgrades.js';

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };
const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

// ---------------------------------------------------------------------------
// 0. js/skinprices.js agrees with js/skins.js (which nothing in Node can import).
// ---------------------------------------------------------------------------
{
  // Comments stripped first: the partner shelf's header comment quotes
  // `family: 'partner'` in prose, one row above the first real row.
  const src = read('js/skins.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  const block = (name) => { const i = src.indexOf(`export const ${name} = [`); const j = src.indexOf('\n];', i); return src.slice(i, j); };
  const seen = new Set();
  for (const name of ['SKINS', 'INDICATOR_SKINS']) {
    const text = block(name);
    check(text.length > 0, `found ${name} in js/skins.js`);
    const rowRe = /\{ id: '([^']+)', name: '[^']*', price: (\d+)/g;
    let m;
    const starts = [];
    while ((m = rowRe.exec(text))) starts.push({ id: m[1], price: Number(m[2]), at: m.index });
    for (let i = 0; i < starts.length; i++) {
      const { id, price, at } = starts[i];
      const chunk = text.slice(at, i + 1 < starts.length ? starts[i + 1].at : text.length);
      seen.add(id);
      assert.equal(COSMETIC_PRICES[id], price, `js/skinprices.js price for ${id} must be ${price} (js/skins.js)`);
      const partner = /family:\s*'partner'/.test(chunk);
      const approved = /approved:\s*true/.test(chunk);
      if (partner) {
        assert.ok(PARTNER_ROWS[id], `js/skinprices.js must list ${id} as a partner row`);
        assert.equal(PARTNER_ROWS[id].approved, approved, `js/skinprices.js approval for ${id} must be ${approved}`);
      } else {
        assert.ok(!PARTNER_ROWS[id], `js/skinprices.js lists ${id} as partner but js/skins.js does not`);
      }
      n++;
    }
  }
  const legacy = new Set(['clock5', 'growth5']);
  for (const id of Object.keys(COSMETIC_PRICES)) {
    check(seen.has(id) || legacy.has(id), `js/skinprices.js has ${id}, which is neither in js/skins.js nor a legacy item`);
  }
  check(/id: 'clock5'[^\n]*price: 400/.test(read('js/ui/screens.js')), 'clock5 legacy price 400 still what screens.js sold it at');
}

// ---------------------------------------------------------------------------
// 1. SYNCED_KEYS: the boundary, and it is exactly the syncable subset of a save.
// ---------------------------------------------------------------------------
eq([...SYNCED_KEYS].sort(), ['challenges', 'coins', 'equippedIndicator', 'equippedSkin', 'levels', 'muted', 'ownedItems', 'sandbox', 'settings', 'upgrades'], 'SYNCED_KEYS is the 2.3 subset');
for (const k of SYNCED_KEYS) check(k in __freshSave(), `SYNCED_KEYS.${k} exists on freshSave()`);
for (const k of ['outbox', 'player', 'version', 'cloud']) check(!SYNCED_KEYS.includes(k), `${k} is never synced`);
eq([...SYNCED_SETTINGS_KEYS].sort(), ['ambVol', 'masterVol', 'musicVol', 'sfxVol', 'turnSens'], 'only taste settings sync');

// ---------------------------------------------------------------------------
// 2. sanitiseBlob
// ---------------------------------------------------------------------------
{
  const s = sanitiseBlob({ coins: 5, outbox: [1], player: { id: 'x' }, token: 'secret', settings: { musicVol: 0.5, quality: 'high', voxGravity: 9 } });
  check(!('outbox' in s.blob) && !('player' in s.blob) && !('token' in s.blob), '(a) unknown keys are stripped');
  eq(s.blob.settings, { musicVol: 0.5 }, 'device-capability settings are stripped');
  const b = sanitiseBlob({ ownedItems: ['funnel', 'not-a-skin', 'partner-huble', 42] });
  eq(b.blob.ownedItems, ['funnel'], '(b) non-catalog and unapproved ids are rejected');
  eq(b.rejected.sort(), ['42', 'not-a-skin', 'partner-huble'], 'rejected ids are reported');
  const c = sanitiseBlob({ coins: -4, upgrades: { speed: 99, vortex: -1, growth: 2.5, duration: 'x', bogus: 3 }, levels: { 1: { stars: 7, bestMass: -1, won: 'yes' }, abc: {} }, muted: 'no' });
  check(c.blob.coins === 0, 'negative coins clamp to 0');
  eq(c.blob.upgrades, { speed: 20, vortex: 0, growth: 2, duration: 0 }, 'upgrade ranks are integers in 0..MAX');
  eq(c.blob.levels, { 1: { stars: 3, bestMass: 0, bestCombo: 0, won: false, fastestClear: null } }, 'levels: 1..100 keys only, stars 0..3, finite non-negative numbers, boolean won');
  check(c.blob.muted === false, 'muted coerces to boolean');
  const d = sanitiseBlob({ equippedSkin: 'gold', equippedIndicator: 'ind-cosmic', ownedItems: [] });
  check(d.blob.equippedSkin === 'classic' && d.blob.equippedIndicator === 'ind-default', 'equipped falls back to the free default when not owned');
  check(sanitiseBlob(null).blob.coins === 0, 'null input yields an empty blob, no throw');
  check(sanitiseBlob({ sandbox: { gallery: { runs: 3, completions: 5, bestPercent: 4 } } }).blob.sandbox.gallery.bestPercent === 1, 'bestPercent clamps to 1');
  check(!('tokyo-nope' in sanitiseBlob({ sandbox: { 'tokyo-nope': { runs: 1 } } }).blob.sandbox), 'unknown scene keys are dropped');
}

// ---------------------------------------------------------------------------
// 3. coinFence
// ---------------------------------------------------------------------------
{
  const priciest = Object.entries(COSMETIC_PRICES).filter(([id]) => !PARTNER_ROWS[id]).sort((x, y) => y[1] - x[1])[0][0];
  const r = coinFence(sanitiseBlob({ coins: 10000, ownedItems: [priciest] }).blob, { coinsVerified: 0, coinsCeiling: 50 });
  check(r.blob.coins === 0, '(c) implausible coins are fenced to 0');
  eq(r.trimmed, [priciest], '(c) the unaffordable item is trimmed');
  eq(r.blob.ownedItems, [], 'trimmed items leave ownedItems');

  const honest = sanitiseBlob({
    levels: { 1: { stars: 3, bestCombo: 5, won: true }, 2: { stars: 3, bestCombo: 5, won: true }, 3: { stars: 3, bestCombo: 5, won: true } },
    coins: [1, 2, 3].reduce((s, i) => s + coinsForResult(LEVELS[i - 1], 3, 5), 0),
  }).blob;
  const h = coinFence(honest, { coinsVerified: 0 });
  eq(h.blob, honest, '(d) an honest save passes untouched');
  eq(h.trimmed, [], '(d) nothing trimmed');
  check(h.coinsCeiling >= honest.coins, 'ceiling covers what the honest player earned');
  check(coinsCeiling(honest) === [1, 2, 3].reduce((s, i) => s + coinsForResult(LEVELS[i - 1], 3, 5), 0) * REPLAY_ALLOWANCE, 'ceiling = Σ coinsForResult × REPLAY_ALLOWANCE for levels');

  // Sandbox runs raise the ceiling by the best possible payout per run.
  const sb = sanitiseBlob({ sandbox: { gallery: { runs: 2, completions: 2 } }, coins: 2 * (60 * 1 + 25) * 2 }).blob;
  check(coinFence(sb, { coinsVerified: 0 }).blob.coins === sb.coins, 'two full gallery clears at the challenge multiplier are plausible');
  check(coinFence({ ...sb, coins: sb.coins + 1 }, { coinsVerified: 0 }).blob.coins === sb.coins, 'one coin over the ceiling is clipped to it, never added');

  // Verified ranked coins extend the allowance.
  const v = coinFence(sanitiseBlob({ coins: 30 }).blob, { coinsVerified: 30 });
  check(v.blob.coins === 30, 'coins_verified counts toward earned_allowed');

  // Spend accounting: purchases + upgrade ladder, unwound newest-first / top rank first.
  const spent = spentCoins({ ownedItems: ['funnel', 'neon'], upgrades: { speed: 2, vortex: 0, growth: 0, duration: 0 } });
  check(spent === 100 + 150 + UPGRADE_COST_TABLE[0] + UPGRADE_COST_TABLE[1], 'spentCoins sums prices and the upgrade cost ladder');
  const u = coinFence(sanitiseBlob({ coins: 0, ownedItems: ['funnel', 'neon'], upgrades: { speed: 2 } }).blob, { coinsVerified: 0, coinsCeiling: 260 });
  // 260 allowed: unwind speed rank 2 (150) → 350 spent, still over; unwind rank 1 (100) → 250 <= 260. Items survive.
  eq(u.blob.upgrades.speed, 0, 'upgrades unwind top rank first');
  eq(u.blob.ownedItems, ['funnel', 'neon'], 'purchases survive when unwinding upgrades suffices');
  eq(u.trimmed, ['upgrade:speed:2', 'upgrade:speed:1'], 'each unwound rank is named in trimmed');
  check(u.blob.coins === 0, 'after an unwind, coins are 0 (the server never adds)');
  const w = coinFence(sanitiseBlob({ coins: 0, ownedItems: ['funnel', 'neon'], upgrades: {} }).blob, { coinsVerified: 0, coinsCeiling: 120 });
  eq(w.blob.ownedItems, ['funnel'], 'items unwind newest-first');
  check(coinFence(sanitiseBlob({ coins: 0, ownedItems: ['classic', 'ind-default'] }).blob, { coinsVerified: 0, coinsCeiling: 0 }).trimmed.length === 0, 'free items never trim');
}

// ---------------------------------------------------------------------------
// 4. The routes, against an in-memory database.
// ---------------------------------------------------------------------------
const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DEVICE = 'device-key-abcdefghijklmnop';

function fakeDb({ tokens = { [PLAYER]: 'good-token-good-token-good-token-1234' }, verified = 0 } = {}) {
  const rows = new Map();     // player_id -> player_progress row
  const log = [];             // submission_log rows
  const rest = async (path, { method = 'GET', body } = {}) => {
    if (path.startsWith('player_progress')) {
      const id = decodeURIComponent((path.match(/player_id=eq\.([^&]+)/) || [])[1] || '');
      if (method === 'GET') return rows.has(id) ? [rows.get(id)] : [];
      if (method === 'POST') {
        const row = { ...(rows.get(body.player_id) || {}), ...body, updated_at: new Date().toISOString() };
        rows.set(body.player_id, row);
        return [row];
      }
    }
    if (path.startsWith('submission_log')) {
      if (method === 'POST') { log.push({ ...body, created_at: Date.now() }); return null; }
      const kind = (path.match(/kind=eq\.([^&]+)/) || [])[1];
      const pid = decodeURIComponent((path.match(/player_id=eq\.([^&]+)/) || [])[1] || '');
      return log.filter((r) => r.kind === kind && r.player_id === pid).map((r) => ({ id: 'x' }));
    }
    throw new Error(`fake rest: unexpected ${method} ${path}`);
  };
  const rpc = async (name, payload) => {
    if (name === 'fw_coins_verified') return verified;
    throw new Error(`fake rpc: ${name}`);
  };
  const playerForToken = async (id, token) => (tokens[id] && tokens[id] === token ? { id, name: 'Tester' } : null);
  return { rest, rpc, playerForToken, rows, log };
}

function call(handler, body, { method = 'POST' } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) { this.headers[k] = v; return this; },
      end(text) { resolve({ status: this.statusCode, json: text ? JSON.parse(text) : null }); },
    };
    handler({ method, body, headers: {} }, res);
  });
}

const auth = { player_id: PLAYER, token: 'good-token-good-token-good-token-1234', device_key: DEVICE };

// Task 16: the flag. Sync is ON by default; FW_PROGRESS_SYNC='false' is the
// emergency off-switch → 503 SERVER_NOT_READY, retryable, before anything else.
{
  process.env.FW_PROGRESS_SYNC = 'false';
  const db = fakeDb();
  const r = await call(makePull(db), auth);
  check(r.status === 503 && r.json.error.code === 'SERVER_NOT_READY' && r.json.error.retryable === true, "pull with FW_PROGRESS_SYNC='false' → 503 SERVER_NOT_READY retryable");
  const p = await call(makePush(db), { ...auth, base_revision: 0, schema_version: CURRENT_VERSION, blob: {} });
  check(p.status === 503 && p.json.error.code === 'SERVER_NOT_READY', "push with FW_PROGRESS_SYNC='false' → 503");
  check(db.rows.size === 0, 'nothing is written while the flag is off');
}
{
  delete process.env.FW_PROGRESS_SYNC;
  const db = fakeDb();
  const r = await call(makePull(db), auth);
  check(r.status === 200 && r.json.data.found === false, 'pull with FW_PROGRESS_SYNC unset is served (sync is on by default)');
}
process.env.FW_PROGRESS_SYNC = 'true';

{
  const db = fakeDb();
  const pull = makePull(db), push = makePush(db);

  check((await call(pull, auth, { method: 'GET' })).status === 405, 'pull is POST only');
  check((await call(push, auth, { method: 'GET' })).status === 405, 'push is POST only');

  // 401 without / with a wrong token; also player_id must be a uuid.
  const noTok = await call(pull, { player_id: PLAYER, device_key: DEVICE });
  check(noTok.status === 401 && noTok.json.error.code === 'NOT_SIGNED_IN' && noTok.json.error.retryable === false, 'pull without token → 401 NOT_SIGNED_IN, not retryable');
  const badTok = await call(push, { ...auth, token: 'wrong-token-wrong-token-wrong-token-1', base_revision: 0, schema_version: CURRENT_VERSION, blob: {} });
  check(badTok.status === 401 && badTok.json.error.code === 'NOT_SIGNED_IN', 'push with a wrong token → 401');
  check((await call(pull, { ...auth, player_id: 'nope' })).status === 400, 'non-uuid player_id → 400');
  check((await call(pull, { ...auth, device_key: 'short' })).status === 400, 'bad device_key → 400');

  // Empty account: found:false, never 404.
  const empty = await call(pull, auth);
  check(empty.status === 200 && empty.json.ok === true && empty.json.data.found === false, 'pull on an empty account → found:false');

  // First push → revision 1, canonical blob back.
  const blob1 = { coins: 40, levels: { 1: { stars: 2, bestMass: 100, bestCombo: 3, won: true, fastestClear: 30 } }, ownedItems: [], upgrades: {}, settings: { musicVol: 0.3, quality: 'low' }, outbox: ['x'] };
  const p1 = await call(push, { ...auth, base_revision: 0, schema_version: CURRENT_VERSION, blob: blob1 });
  check(p1.status === 200 && p1.json.data.revision === 1, 'first push → revision 1');
  check(p1.json.data.blob.coins === 40 && !('outbox' in p1.json.data.blob) && !('quality' in p1.json.data.blob.settings), 'canonical blob is sanitised');
  eq(p1.json.data.trimmed, [], 'nothing trimmed on an honest push');
  check(db.log.filter((r) => r.kind === 'progress').length === 1, 'a push is logged as kind=progress');
  check(db.rows.get(PLAYER).pushed_by_device === DEVICE, 'the pushing device is recorded');
  check(db.rows.get(PLAYER).schema_version === CURRENT_VERSION, 'schema_version is stored');

  // Pull sees it.
  const got = await call(pull, auth);
  check(got.json.data.found === true && got.json.data.revision === 1 && got.json.data.blob.coins === 40 && got.json.data.schema_version === CURRENT_VERSION, 'pull returns the stored document');
  check(typeof got.json.data.coins_verified === 'number' && typeof got.json.data.coins_ceiling === 'number' && typeof got.json.data.updated_at === 'string', 'pull carries the ledger columns');

  // Second push on the right base → revision 2, overwrite semantics.
  const p2 = await call(push, { ...auth, base_revision: 1, schema_version: CURRENT_VERSION, blob: { ...blob1, coins: 30, levels: { 1: { stars: 1, bestMass: 50, bestCombo: 1, won: true, fastestClear: 40 } } } });
  check(p2.status === 200 && p2.json.data.revision === 2, 'in-order push bumps revision');
  check(p2.json.data.blob.coins === 30 && p2.json.data.blob.levels[1].stars === 1, 'an in-order push (coins spent, e.g.) is taken as-is, not merged');

  // Stale base → server merges (keeps the better of both) and still bumps.
  const p3 = await call(push, { ...auth, base_revision: 1, schema_version: CURRENT_VERSION, blob: { coins: 25, levels: { 2: { stars: 3, bestMass: 10, bestCombo: 0, won: true, fastestClear: null } } } });
  check(p3.status === 200 && p3.json.data.revision === 3, 'stale push still bumps revision');
  check(p3.json.data.blob.levels[1].stars === 1 && p3.json.data.blob.levels[2].stars === 3, 'stale push is MERGED with the stored document');
  check(p3.json.data.blob.coins === 30, 'stale push: coins are max, never summed');
  check(p3.json.data.merged === true && p2.json.data.merged === false, 'response says whether a merge happened');

  // Schema guards.
  const tooNew = await call(push, { ...auth, base_revision: 3, schema_version: CURRENT_VERSION + 1, blob: {} });
  check(tooNew.status === 409 && tooNew.json.error.code === 'CLIENT_TOO_NEW' && tooNew.json.error.retryable === false, 'schema_version > CURRENT_VERSION → 409 CLIENT_TOO_NEW');
  check(db.rows.get(PLAYER).revision === 3, 'CLIENT_TOO_NEW writes nothing');
  db.rows.get(PLAYER).schema_version = CURRENT_VERSION + 1; // simulate a newer client having pushed
  const stale = await call(push, { ...auth, base_revision: 3, schema_version: CURRENT_VERSION, blob: {} });
  check(stale.status === 409 && stale.json.error.code === 'STALE_SCHEMA', 'schema_version < stored → 409 STALE_SCHEMA');
  db.rows.get(PLAYER).schema_version = CURRENT_VERSION;
  check((await call(push, { ...auth, base_revision: 3, schema_version: 'x', blob: {} })).status === 400, 'non-integer schema_version → 400');
  check((await call(push, { ...auth, base_revision: 3, schema_version: CURRENT_VERSION, blob: 'nope' })).status === 400, 'non-object blob → 400');
  check((await call(push, { ...auth, base_revision: -1, schema_version: CURRENT_VERSION, blob: {} })).status === 400, 'negative base_revision → 400');

  // Fence on the wire: hand-edited coins come back fenced, trimmed says what went.
  const cheat = await call(push, { ...auth, base_revision: 3, schema_version: CURRENT_VERSION, blob: { coins: 999999, ownedItems: ['closer'], upgrades: {} } });
  check(cheat.status === 200 && cheat.json.data.blob.coins < 999999, 'implausible coins are fenced on the wire');
  eq(cheat.json.data.trimmed, ['closer'], 'the unaffordable purchase is reported as trimmed');
  check(db.rows.get(PLAYER).blob.coins === cheat.json.data.blob.coins, 'the stored blob is the fenced one');
  check(typeof cheat.json.data.coins_ceiling === 'number', 'the response carries the ceiling');

  // Another player cannot read or write this row.
  const other = fakeDb({ tokens: { [OTHER]: 'other-token-other-token-other-token-1' } });
  const cross = await call(makePull(other), { player_id: PLAYER, token: 'other-token-other-token-other-token-1', device_key: DEVICE });
  check(cross.status === 401, 'a token for another account does not read this row');
}

// Rate limit: the 61st push in an hour is 429, retryable.
{
  const db = fakeDb();
  const push = makePush(db);
  let last;
  for (let i = 0; i < PUSHES_PER_HOUR; i++) {
    last = await call(push, { ...auth, base_revision: i, schema_version: CURRENT_VERSION, blob: { coins: i } });
    assert.equal(last.status, 200, `push ${i + 1} accepted`);
  }
  n++;
  const over = await call(push, { ...auth, base_revision: PUSHES_PER_HOUR, schema_version: CURRENT_VERSION, blob: {} });
  check(over.status === 429 && over.json.error.code === 'PROGRESS_RATE_LIMIT' && over.json.error.retryable === true, `push ${PUSHES_PER_HOUR + 1} → 429, retryable`);
  check(db.rows.get(PLAYER).revision === PUSHES_PER_HOUR, 'the rate-limited push writes nothing');
}

// Verified coins from the ledger widen the fence.
{
  const db = fakeDb({ verified: 5000 });
  const r = await call(makePush(db), { ...auth, base_revision: 0, schema_version: CURRENT_VERSION, blob: { coins: 4000, ownedItems: ['closer'] } });
  check(r.status === 200 && r.json.data.blob.coins === 4000 && r.json.data.trimmed.length === 0, 'coins_verified from fw_coins_verified is honoured');
  check(r.json.data.coins_verified === 5000, 'response echoes coins_verified');
}

// A database failure is a 503 retryable, never a 500 and never a partial answer.
{
  const db = fakeDb();
  db.rest = async () => { throw new Error('boom'); };
  const r = await call(makePull(db), auth);
  check(r.status === 503 && r.json.error.retryable === true, 'db failure → 503 retryable');
}

// Source guards: routes are behind playerForToken, and the default export wires the real deps.
for (const rel of ['api/progress/pull.mjs', 'api/progress/push.mjs']) {
  const src = read(rel);
  check(/playerForToken/.test(src) && /export default/.test(src) && /export function makeHandler/.test(src), `${rel} exports makeHandler and a default handler using playerForToken`);
}
check(/FW_PROGRESS_SYNC/.test(read('api/progress/pull.mjs')), 'the shared gate checks FW_PROGRESS_SYNC');
check(/import \{[^}]*\bgate\b[^}]*\} from '\.\/pull\.mjs'/.test(read('api/progress/push.mjs')), 'push goes through the same gate as pull');
check(/from '\.\.\/js\/cloud\/merge\.js'/.test(read('api/_progress.mjs')), 'api/_progress.mjs imports the ONE merge from js/cloud/merge.js');
check(/from '\.\.\/js\/save\.js'/.test(read('api/progress/push.mjs')) || /CURRENT_VERSION/.test(read('api/_progress.mjs')), 'push compares against js/save.js CURRENT_VERSION');

console.log(`progress-api: ${n} assertions passed.`);
