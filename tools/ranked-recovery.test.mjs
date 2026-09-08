import assert from 'node:assert/strict';
import { test } from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
};
let respond;
globalThis.fetch = async (url, init) => {
  const result = await respond(String(url), JSON.parse(init.body));
  return { ok: result.status < 400, status: result.status, json: async () => result.json };
};
const { startTicket, finishRun } = await import('../js/board/run.js');
const { drain } = await import('../js/board/outbox.js');
const { savePlayerSecret, playerSecret } = await import('../js/board/player.js');
const { __freshSave } = await import('../js/save.js');
const { RANKED_TICK_COUNT } = await import('../js/voxelsim.js');
const inputs = new Int8Array(RANKED_TICK_COUNT * 2);
const sim = { hole: { mass: 123 } };
const real = { player_id: '11111111-1111-4111-8111-111111111111', token: 'real-secret' };
const other = { player_id: '22222222-2222-4222-8222-222222222222', token: 'other-secret' };
const local = { player_id: 'local-offline', token: 'local-token-offline' };
const ok = data => ({ status: 200, json: { ok: true, data } });

test('offline placeholder recovers through ticket, finish and retry without changing pending identity', async () => {
  storage.clear();
  const save = __freshSave();
  save.player.nameSource = 'pending';
  save.player.name = 'RequestedAccount';
  savePlayerSecret(local);
  let submit = 0;
  respond = (path, body) => {
    if (path.endsWith('/start')) {
      assert.ok(!body.player_id && !body.player_token, 'placeholder must not authenticate ticket');
      return ok({ run_id: 'recovered', ticket: 'signed', player_id: real.player_id });
    }
    assert.ok(!body.player_id && !body.player_token, 'auto ticket submits without placeholder');
    if (++submit === 1) throw new TypeError('fetch failed');
    return ok({ run_id: 'recovered', verdict: 'pending' });
  };
  const ticket = await startTicket('chicago');
  assert.ok(ticket, 'online recovery must produce a ticket');
  assert.equal((await finishRun(save, ticket, sim, inputs)).verdict, 'queued');
  assert.equal(save.outbox.length, 1, 'network failure retains replay');
  await drain(save);
  assert.equal(save.outbox.length, 0);
  assert.deepEqual(playerSecret(), local);
  assert.equal(save.player.nameSource, 'pending');
  assert.equal(save.player.name, 'RequestedAccount');
});

test('ticket retains original account binding when identity changes mid-run', async () => {
  storage.clear();
  const save = __freshSave();
  savePlayerSecret(real);
  let submitted;
  respond = (path, body) => {
    if (path.endsWith('/submit')) submitted = body;
    assert.equal(body.player_id, real.player_id);
    assert.equal(body.player_token, real.token);
    return ok(path.endsWith('/start') ? { run_id: 'bound', ticket: 'signed', player_id: real.player_id } : { verdict: 'pending' });
  };
  const ticket = await startTicket('chicago');
  savePlayerSecret(other);
  await finishRun(save, ticket, sim, inputs);
  assert.equal(submitted.player_id, real.player_id);
  assert.equal(submitted.player_token, real.token);
  assert.equal(save.outbox.length, 0);
  assert.deepEqual(playerSecret(), other);
});

test('new auto-token belongs to its run, without claiming pending account', async () => {
  storage.clear();
  const save = __freshSave();
  savePlayerSecret(local);
  let submitted;
  respond = (path, body) => path.endsWith('/start')
    ? ok({ run_id: 'auto', ticket: 'signed', player_id: real.player_id, player_token: real.token })
    : (submitted = body, ok({ verdict: 'pending' }));
  const ticket = await startTicket('chicago');
  savePlayerSecret(other);
  await finishRun(save, ticket, sim, inputs);
  assert.equal(submitted.player_id, real.player_id);
  assert.equal(submitted.player_token, real.token);
  assert.deepEqual(playerSecret(), other);
});

test('real rejected credentials are never retried anonymously; offline run stays optional', async () => {
  storage.clear();
  savePlayerSecret(real);
  let calls = 0;
  respond = (_path, body) => {
    calls++;
    assert.equal(body.player_token, real.token);
    return { status: 401, json: { ok: false, error: { code: 'PLAYER_TOKEN_INVALID', retryable: false } } };
  };
  assert.equal(await startTicket('chicago'), null);
  assert.equal(calls, 1);
  assert.deepEqual(playerSecret(), real);
  respond = () => { throw new TypeError('offline'); };
  assert.equal(await startTicket('chicago'), null);
  assert.equal((await finishRun(__freshSave(), null, sim, inputs)).verdict, 'unranked');
});
