// LIVE self-test: SupabaseRealtimeTransport against the real Supabase project.
//
//   node tools/net-live-selftest.mjs
//
// HITS THE NETWORK. Deliberately not part of validate.mjs or any default test
// chain — it needs the live Supabase project up and reachable, and it spends
// real Realtime messages. Run it standalone when touching the transport, the
// vendored client, or the project config.
//
// What it proves (the things the loopback suite structurally cannot):
//   1. the vendored @supabase/realtime-js bundle connects to the live project
//      and a broadcast channel reaches SUBSCRIBED (Realtime is enabled);
//   2. two independent connections on one topic exchange envelopes BOTH ways —
//      binary SNAPSHOT/KEYFRAME/INTENT frames and JSON control frames — and
//      everything survives the real wire byte-for-byte;
//   3. self:false holds on the real service (no echo of your own sends);
//   4. RTT through the relay is measured and sane.
//
// Node 22+ (global WebSocket). Uses the same modules the browser runs:
// js/net/client.js -> js/vendor/supabase-realtime.module.js.

const ROOT = new URL('../', import.meta.url).href;

const { createRealtimeClient } = await import(ROOT + 'js/net/client.js');
const { SupabaseRealtimeTransport } = await import(ROOT + 'js/net/transport.js');
const P = await import(ROOT + 'js/net/protocol.js');

let failures = 0;
const results = [];
function begin(name) { results.push({ name, checks: [], failed: 0 }); }
function check(label, cond, detail = '') {
  const r = results[results.length - 1];
  r.checks.push({ label, ok: !!cond, detail });
  if (!cond) { r.failed++; failures++; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 5000, everyMs = 25) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(everyMs);
  }
  return fn();
}

// A fresh topic per run so two overlapping runs (or yesterday's crashed one)
// cannot cross-talk. crypto.getRandomValues per 03 §1.2 — never Math.random.
const nonce = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
const TOPIC = `arena:selftest-${nonce}`;

// ---------------------------------------------------------------------------
begin('1. two live connections subscribe to one broadcast topic');
// ---------------------------------------------------------------------------
const clientA = createRealtimeClient();
const clientB = createRealtimeClient();
let ta = null, tb = null;
let subscribeError = null;
try {
  const t0 = Date.now();
  ta = new SupabaseRealtimeTransport(clientA, TOPIC);
  tb = new SupabaseRealtimeTransport(clientB, TOPIC);
  await Promise.all([ta.connect(), tb.connect()]);
  const subMs = Date.now() - t0;
  check(`both ends reached SUBSCRIBED in ${subMs} ms`, ta.connected && tb.connected);
  check('subscribe completed inside 10 s', subMs < 10000);
} catch (e) {
  subscribeError = e;
  check(`subscribe failed: ${e && e.message}`, false);
}

if (!subscribeError) {
  const gotA = [];   // envelopes arriving at A
  const gotB = [];   // envelopes arriving at B
  ta.on((env) => gotA.push(env));
  tb.on((env) => gotB.push(env));

  // -------------------------------------------------------------------------
  begin('2. control frames cross A -> B and B -> A');
  // -------------------------------------------------------------------------
  {
    ta.send(P.encodeEnvelope(P.CONTROL.JOIN, { sessionId: 'live-a' }));
    tb.send(P.encodeEnvelope(P.CONTROL.WELCOME, { sessionId: 'live-a', slot: 1, seed: 'arena:live', generation: 1 }));
    await waitFor(() => gotB.some((e) => e.t === 'join') && gotA.some((e) => e.t === 'welcome'));
    const join = gotB.find((e) => e.t === 'join');
    const welcome = gotA.find((e) => e.t === 'welcome');
    check('B received the JOIN', !!join);
    check('A received the WELCOME', !!welcome);
    check('JOIN survived intact', !!join && P.validate(join).ok && join.d.sessionId === 'live-a');
    check('WELCOME survived intact', !!welcome && P.validate(welcome).ok
      && welcome.d.slot === 1 && welcome.d.seed === 'arena:live' && welcome.d.generation === 1);
    check('self:false holds — A never saw its own JOIN', !gotA.some((e) => e.t === 'join'));
  }

  // -------------------------------------------------------------------------
  begin('3. binary frames survive the real wire byte-for-byte');
  // -------------------------------------------------------------------------
  {
    const snap = {
      generation: 1, tick: 4242, flags: 0, timeLeftCs: 12345,
      holes: [
        { slot: 0, state: 1, x: -8.31, z: 12.07, mass: 1893.25, radius: 3.4, heading: 1.25 },
        { slot: 1, state: 1, x: 44.5, z: -3.25, mass: 12.5, radius: 1.1, heading: 5.9 },
      ],
      events: [{ slot: 1, flags: 1, objectId: 90210 }],
    };
    const q = P.quantizeSnapshot(snap);
    ta.send(P.encodeEnvelope('S', snap));
    tb.send(P.encodeEnvelope('I', { slot: 1, seq: 77, x: 0.5, z: -1 }));

    await waitFor(() => gotB.some((e) => e.t === 'S') && gotA.some((e) => e.t === 'I'));
    const sEnv = gotB.find((e) => e.t === 'S');
    const iEnv = gotA.find((e) => e.t === 'I');
    check('B received the SNAPSHOT envelope', !!sEnv);
    check('A received the INTENT envelope', !!iEnv);
    if (sEnv) {
      check('snapshot passes the wire guard', P.validate(sEnv).ok, P.validate(sEnv).reason);
      const d = P.decodeEnvelope(sEnv);
      check('snapshot decodes to the quantised original',
        d.tick === q.tick && d.timeLeftCs === q.timeLeftCs && d.holes.length === 2
        && d.holes[0].x === q.holes[0].x && d.holes[0].mass === q.holes[0].mass
        && d.holes[1].radius === q.holes[1].radius
        && d.events.length === 1 && d.events[0].objectId === 90210,
        JSON.stringify(d.holes[0]));
    }
    if (iEnv) {
      const d = P.decodeEnvelope(iEnv);
      const qi = P.quantizeIntent({ slot: 1, seq: 77, x: 0.5, z: -1 });
      check('intent decodes to the quantised original',
        d.slot === 1 && d.seq === 77 && d.x === qi.x && d.z === qi.z, JSON.stringify(d));
    }

    // Keyframe with an eaten-RLE tail.
    const S = await import(ROOT + 'js/net/snapshot.js');
    const eaten = new Set([3, 4, 5, 900, 901]);
    const kf = { ...snap, tick: 4300, flags: P.FLAG.KEYFRAME, eatenRLE: S.encodeEatenRLE((i) => eaten.has(i), 1000) };
    ta.send(P.encodeEnvelope('K', kf));
    await waitFor(() => gotB.some((e) => e.t === 'K'));
    const kEnv = gotB.find((e) => e.t === 'K');
    check('B received the KEYFRAME', !!kEnv);
    if (kEnv) {
      const d = P.decodeEnvelope(kEnv);
      const back = S.decodeEatenRLE(d.eatenRLE, 1000);
      let ok = true;
      for (let i = 0; i < 1000; i++) if (!!back[i] !== eaten.has(i)) { ok = false; break; }
      check('the eaten bitset round-tripped the live wire', ok);
    }
  }

  // -------------------------------------------------------------------------
  begin('4. RTT through the relay');
  // -------------------------------------------------------------------------
  {
    // B answers pings like a host; A measures like a peer.
    tb.on((env) => {
      if (env.t === 'ping') tb.send(P.encodeEnvelope(P.CONTROL.PONG, { id: env.d.id, tClient: env.d.tClient, tHost: Date.now() }));
    });
    const rtts = [];
    for (let i = 1; i <= 5; i++) {
      const before = gotA.filter((e) => e.t === 'pong').length;
      const t0 = Date.now();
      ta.send(P.encodeEnvelope(P.CONTROL.PING, { id: i, tClient: t0 }));
      await waitFor(() => gotA.filter((e) => e.t === 'pong').length > before, 4000);
      const pong = gotA.filter((e) => e.t === 'pong').pop();
      if (pong && pong.d.id === i) rtts.push(Date.now() - pong.d.tClient);
    }
    check(`ping/pong completed (${rtts.length}/5)`, rtts.length >= 4);
    if (rtts.length) {
      const min = Math.min(...rtts), med = [...rtts].sort((a, b) => a - b)[rtts.length >> 1];
      check(`RTT sane (min ${min} ms, median ${med} ms, all [${rtts.join(', ')}])`, min > 0 && med < 2000);
    }
  }

  // -------------------------------------------------------------------------
  begin('5. disconnect is clean');
  // -------------------------------------------------------------------------
  {
    const beforeB = gotB.length;
    ta.disconnect();
    await sleep(400);
    ta.send(P.encodeEnvelope(P.CONTROL.PING, { id: 99, tClient: Date.now() }));
    await sleep(800);
    check('a disconnected transport refuses to send', gotB.length === beforeB);
    tb.disconnect();
    check('both ends report disconnected', !ta.connected && !tb.connected);
  }
}

try { clientA.disconnect(); } catch { /* already down */ }
try { clientB.disconnect(); } catch { /* already down */ }

// ---------------------------------------------------------------------------
const line = '-'.repeat(72);
console.log(`\nFlywheel LIVE Realtime self-test  (topic ${TOPIC})`);
console.log(line);
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok);
  console.log(`\n${r.failed ? 'FAIL' : 'PASS'}  ${r.name}   (${r.checks.length - r.failed}/${r.checks.length})`);
  for (const c of bad) console.log(`      x ${c.label}${c.detail ? '  ' + c.detail : ''}`);
}
console.log(`\n${line}`);
const total = results.reduce((n, r) => n + r.checks.length, 0);
console.log(failures
  ? `FAIL  ${failures} of ${total} checks failed`
  : `PASS  all ${total} checks against the live project`);
process.exit(failures ? 1 : 0);
