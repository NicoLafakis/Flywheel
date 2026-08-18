// TDD Static Guard: every field a browser posts to `api/` must be a field that
// endpoint actually reads, and every bearer token an endpoint mints must be one
// a later request can be validated against.
//
// WHY THIS FILE EXISTS
// `api/_lib.mjs`'s `body()` hands the handler a plain object. A handler that
// reads `data.player_token` when the browser sent `token` does not crash, does
// not warn, and does not log: it reads `undefined`, `playerForToken()` rejects
// it, and the caller gets a clean `401 PLAYER_TOKEN_INVALID`. The response looks
// exactly like a genuine "this device does not own that name", so the defect is
// invisible from both ends. That shipped: `api/player/remove.mjs` read
// `data.player_token` while `js/board/player.js`'s `removePlayer()` posted the
// stored secret verbatim as `{player_id, token}`, so "remove my name" was
// unreachable for every player on the shipped client.
//
// A runtime test cannot catch this class. The handlers are Vercel Functions that
// need `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `FW_TICKET_SECRET` plus a live
// Postgres before they will do anything, and the callers live in `js/board/*.js`
// and `js/ui/boards.js`, which touch `localStorage` and `document` at module
// scope. So the guard is lexical: it reads both sides as text and cross-checks
// the payload keys against the `data.<field>` reads.
//
// WHAT IT CATCHES
//   * ANY client/endpoint field-name mismatch, in both directions - a field the
//     browser sends that the server ignores, and a field the server reads that
//     nobody sends.
//   * A new endpoint added under `api/` with no entry in the ROUTES table below,
//     so a new surface cannot be added without declaring who calls it.
//   * A handler that mints a bearer token for the browser without persisting a
//     hash of it (the second half of this file) - a token that is handed out and
//     can never authenticate anything afterwards.
//
// WHAT IT DOES NOT CATCH (documented limits - lexical scanner, no build step):
//   * a payload assembled dynamically (`payload[key] = value`), which is a
//     runtime-value question, not a text question;
//   * a caller shape this scanner does not recognise - ROUTES and PAYLOAD_SOURCES
//     below are deliberately explicit, so a new way to call `api/` is a
//     considered edit here rather than a silent hole;
//   * whether the VALUE is correct (a well-named field carrying a stale token is
//     an auth question, and `playerForToken()` is what answers it);
//   * a backtick template literal containing a nested backtick inside `${}` -
//     the string skipper treats backticks as plain quotes. No payload literal in
//     the repo uses one.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoFile = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel) => readFileSync(repoFile(rel), 'utf8').replace(/\r\n/g, '\n');

console.log('Testing every api/ endpoint against the client call that targets it...');

// ---------------------------------------------------------------------------
// Lexical helpers. Comments are blanked (offsets and newlines preserved so line
// numbers still point at real source lines); string literals are kept verbatim,
// because a route path IS a string literal.
// ---------------------------------------------------------------------------
function skipString(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === quote) return j + 1;
    j++;
  }
  return src.length;
}

function stripComments(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop); i = stop; continue;
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); continue; }
    i++;
  }
  return out.join('');
}

/** Index of the bracket closing the one at `openIndex`. One depth counter for
 *  all three bracket kinds is enough for well-formed JS and keeps nested calls,
 *  arrays and objects inside a payload from being mistaken for its end. */
function matchBracket(src, openIndex, where) {
  let depth = 0;
  let i = openIndex;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new Error(`unbalanced brackets in ${where} at offset ${openIndex}`);
}

/** Split an object-literal body on its top-level commas only. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i); continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    i++;
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Top-level keys and `...spread` names of the object literal opening at `openIndex`. */
function objectLiteralAt(src, openIndex, where) {
  const close = matchBracket(src, openIndex, where);
  const keys = new Set();
  const spreads = [];
  for (const part of splitTopLevel(src.slice(openIndex + 1, close))) {
    const spread = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(part);
    if (spread) { spreads.push(spread[1]); continue; }
    const named = /^(['"]?)([A-Za-z_$][\w$]*)\1\s*:/.exec(part);
    if (named) { keys.add(named[2]); continue; }
    const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(part);
    if (shorthand) { keys.add(shorthand[1]); continue; }
    throw new Error(`unrecognised payload member "${part}" in ${where} - teach objectLiteralAt() about it rather than letting it be skipped`);
  }
  return { keys, spreads };
}

// ---------------------------------------------------------------------------
// Payload expressions that are passed by NAME rather than written inline. Each
// is resolved by reading the construct that builds it, not by transcribing its
// shape here, so a change to the stored/queued object moves this test with it.
// ---------------------------------------------------------------------------
const PAYLOAD_SOURCES = {
  // `secret` is whatever `playerSecret()` returns, which is exactly what
  // `savePlayerSecret()` was handed. Union across every call site.
  secret: { file: 'js/board/player.js', pattern: /\bsavePlayerSecret\s*\(\s*(?=\{)/g },
  // The queued ranked submission `js/board/outbox.js` replays to /run/submit.
  entry: { file: 'js/board/run.js', pattern: /\bconst\s+entry\s*=\s*(?=\{)/g },
};

const resolvedPayloads = new Map();
function resolvePayloadName(name) {
  if (resolvedPayloads.has(name)) return resolvedPayloads.get(name);
  const source = PAYLOAD_SOURCES[name];
  assert.ok(source, `payload identifier "${name}" is passed to an api/ call but PAYLOAD_SOURCES does not say how to resolve it`);
  const src = stripComments(read(source.file));
  const keys = new Set();
  let found = 0;
  source.pattern.lastIndex = 0;
  for (const match of src.matchAll(source.pattern)) {
    found++;
    const literal = objectLiteralAt(src, match.index + match[0].length, `${source.file} (${name})`);
    for (const key of literal.keys) keys.add(key);
    for (const spread of literal.spreads) for (const key of resolvePayloadName(spread)) keys.add(key);
  }
  assert.ok(found > 0, `PAYLOAD_SOURCES.${name} matched nothing in ${source.file} - the resolver is pointed at code that no longer exists`);
  assert.ok(keys.size > 0, `PAYLOAD_SOURCES.${name} resolved to an empty object in ${source.file}`);
  resolvedPayloads.set(name, keys);
  return keys;
}

// ---------------------------------------------------------------------------
// Every endpoint under api/, the client call that targets it, and the fields
// that endpoint is allowed to read without the client sending them.
//
// `serverOptional` is NOT a way to excuse a mismatch: an entry there says the
// handler tolerates a field, never that it depends on one. A credential the
// handler can only get from an optional field is exactly the defect this file
// exists to catch, so the named checks at the bottom pin the credential field
// for each bearer-gated route.
// ---------------------------------------------------------------------------
const ALIAS_WHY = 'tolerated alias of `token`, so a caller written against the run/* endpoints (which name the field `player_token`) still authenticates';

const ROUTES = [
  { route: '/health', handler: 'api/health.mjs', caller: null,
    why: 'deployment smoke probe - reads no request body at all' },
  { route: '/run/verify', handler: 'api/run/verify.mjs', caller: null,
    why: 'Vercel Cron GET, authorised by CRON_SECRET header - no browser caller and no body' },
  { route: '/auth/register', handler: 'api/auth/register.mjs', caller: { file: 'js/board/player.js' } },
  { route: '/auth/login', handler: 'api/auth/login.mjs', caller: { file: 'js/board/player.js' } },
  { route: '/name/claim', handler: 'api/name/claim.mjs', caller: { file: 'js/board/player.js' } },
  { route: '/name/rename', handler: 'api/name/rename.mjs', caller: { file: 'js/board/player.js' } },
  { route: '/name/transfer/start', handler: 'api/name/transfer/start.mjs', caller: { file: 'js/board/player.js' },
    serverOptional: [{ field: 'player_token', why: ALIAS_WHY }] },
  { route: '/name/transfer/redeem', handler: 'api/name/transfer/redeem.mjs', caller: { file: 'js/board/player.js' } },
  { route: '/player/remove', handler: 'api/player/remove.mjs', caller: { file: 'js/board/player.js' },
    serverOptional: [{ field: 'player_token', why: ALIAS_WHY }] },
  { route: '/run/start', handler: 'api/run/start.mjs', caller: { file: 'js/board/run.js' } },
  { route: '/run/submit', handler: 'api/run/submit.mjs', caller: { file: 'js/board/outbox.js' } },
  { route: '/run/status', handler: 'api/run/status.mjs', caller: { file: 'js/board/run.js' } },
  { route: '/report', handler: 'api/report.mjs', caller: { file: 'js/ui/boards.js' } },
  // Cloud progress sync (.wiki/plans/cloud-progress-sync.md). Both routes share
  // one gate, `gate()` in api/progress/pull.mjs, which is where `const data =
  // await body(req)` and the {player_id, token, device_key} reads live;
  // `gateFile` folds that source into the handler's read set so push.mjs's own
  // reads (base_revision, schema_version, blob) are cross-checked together with
  // the credential fields the gate consumes.
  { route: '/progress/pull', handler: 'api/progress/pull.mjs', caller: { file: 'js/cloud/sync.js' } },
  { route: '/progress/push', handler: 'api/progress/push.mjs', caller: { file: 'js/cloud/sync.js' }, gateFile: 'api/progress/pull.mjs' },
  // The operator console is not on js/board/request.js's `post()` helper: it
  // sends the moderator secret as a header from its own `request()` wrapper.
  { route: '/operator', handler: 'api/operator.mjs',
    caller: { file: 'js/operator.js', pattern: /\brequest\s*\(\s*secret\s*,\s*(['"])POST\1\s*,\s*(?=\{)/ } },
];

// ---------------------------------------------------------------------------
// The ROUTES table must cover every deployed endpoint. Walking api/ rather than
// trusting the table is what stops a new surface from shipping unexamined.
// ---------------------------------------------------------------------------
function collectHandlers(rel = 'api') {
  const files = [];
  for (const entry of readdirSync(repoFile(rel), { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...collectHandlers(`${rel}/${entry.name}`));
    // `_lib.mjs` / `_verify.mjs` are shared modules, not routed endpoints.
    else if (entry.name.endsWith('.mjs') && !entry.name.startsWith('_')) files.push(`${rel}/${entry.name}`);
  }
  return files;
}

const handlerFiles = collectHandlers().sort();
const declared = new Set(ROUTES.map((r) => r.handler));
const undeclared = handlerFiles.filter((file) => !declared.has(file));
const phantom = ROUTES.map((r) => r.handler).filter((file) => !handlerFiles.includes(file));
assert.deepEqual(undeclared, [], `api/ endpoint(s) with no ROUTES entry in this test: ${undeclared.join(', ')}`);
assert.deepEqual(phantom, [], `ROUTES names handler file(s) that do not exist: ${phantom.join(', ')}`);
assert.ok(handlerFiles.length >= 14,
  `only ${handlerFiles.length} endpoint(s) discovered under api/ - the walker is not reading the deployed surface`);

// ---------------------------------------------------------------------------
// Read both sides of every route.
// ---------------------------------------------------------------------------
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pairs = [];
for (const entry of ROUTES) {
  // A handler whose body parsing lives in a shared gate module (`gateFile`)
  // is read as handler + gate: the gate's `data.<field>` reads are its reads.
  const handlerSrc = stripComments(read(entry.handler)) + (entry.gateFile ? '\n' + stripComments(read(entry.gateFile)) : '');
  const reads = new Set();
  for (const match of handlerSrc.matchAll(/\bdata\s*\.\s*([A-Za-z_$][\w$]*)/g)) reads.add(match[1]);

  if (!entry.caller) {
    // A body-less endpoint that grows a body read has changed category, and its
    // caller has to be declared before that read can be trusted.
    assert.equal(reads.size, 0,
      `${entry.handler} is declared caller-less (${entry.why}) but reads request fields: ${[...reads].join(', ')}`);
    pairs.push({ ...entry, reads, sends: new Set(), callerLess: true });
    continue;
  }

  // Every body-reading handler must bind the parsed body to `data`, or the
  // `data.<field>` scan above is looking at the wrong variable and would pass
  // while proving nothing.
  assert.match(handlerSrc, /\bconst\s+data\s*=\s*await\s+body\s*\(\s*req\s*\)/,
    `${entry.handler} must bind its parsed body as \`const data = await body(req)\` for this guard to read it`);

  const callerSrc = stripComments(read(entry.caller.file));
  const pattern = entry.caller.pattern
    ?? new RegExp(`\\bpost\\s*\\(\\s*(['"\`])${escapeRe(entry.route)}\\1\\s*,\\s*`);
  const call = pattern.exec(callerSrc);
  assert.ok(call, `no call to ${entry.route} found in ${entry.caller.file} - the caller moved, or the route was renamed on one side only`);

  const at = call.index + call[0].length;
  const sends = new Set();
  if (callerSrc[at] === '{') {
    const literal = objectLiteralAt(callerSrc, at, `${entry.caller.file} -> ${entry.route}`);
    for (const key of literal.keys) sends.add(key);
    for (const spread of literal.spreads) for (const key of resolvePayloadName(spread)) sends.add(key);
  } else {
    const ident = /^([A-Za-z_$][\w$]*)/.exec(callerSrc.slice(at));
    assert.ok(ident, `the payload passed to ${entry.route} in ${entry.caller.file} is neither an object literal nor an identifier`);
    for (const key of resolvePayloadName(ident[1])) sends.add(key);
  }
  assert.ok(sends.size > 0, `the payload posted to ${entry.route} from ${entry.caller.file} resolved to zero fields`);
  pairs.push({ ...entry, reads, sends, callerLess: false });
}

// ---------------------------------------------------------------------------
// Anti-vacuity: a scanner that matched nothing must not be able to pass.
// ---------------------------------------------------------------------------
const wired = pairs.filter((p) => !p.callerLess);
const totalSends = wired.reduce((sum, p) => sum + p.sends.size, 0);
const totalReads = wired.reduce((sum, p) => sum + p.reads.size, 0);
assert.ok(wired.length >= 12, `only ${wired.length} endpoint/caller pair(s) resolved - the scanner is not reading the callers`);
assert.ok(totalSends >= 30, `only ${totalSends} client payload field(s) parsed across all routes - the payload parser is not reading real code`);
assert.ok(totalReads >= 30, `only ${totalReads} \`data.<field>\` read(s) parsed across all handlers - the handler parser is not reading real code`);
for (const route of ['/player/remove', '/name/rename', '/name/transfer/start', '/auth/login', '/auth/register', '/run/start', '/run/submit']) {
  const pair = wired.find((p) => p.route === route);
  assert.ok(pair, `${route} must be among the resolved endpoint/caller pairs`);
  assert.ok(pair.sends.size > 0 && pair.reads.size > 0, `${route} resolved to an empty side`);
}
assert.deepEqual([...resolvePayloadName('secret')].sort(), ['player_id', 'token'],
  'the stored player secret must still be {player_id, token} - if it changed shape, every bearer-gated route below needs re-reading');

// ---------------------------------------------------------------------------
// Direction 1 - every field the browser sends must be a field the endpoint
// reads. This is the direction the shipped defect was in: the client sent
// `token`, nothing on the server ever looked at it, and the request 401'd.
// ---------------------------------------------------------------------------
const ignored = [];
for (const pair of wired) {
  for (const field of [...pair.sends].sort()) {
    if (!pair.reads.has(field)) ignored.push({ ...pair, field });
  }
}
for (const miss of ignored) {
  console.error(`  FAIL ${miss.caller.file} posts "${miss.field}" to ${miss.route}, which ${miss.handler} never reads (silently ignored)`);
}
assert.equal(ignored.length, 0,
  `${ignored.length} client field(s) are posted to an endpoint that ignores them - for a credential field that is a silent 401`);

// ---------------------------------------------------------------------------
// Direction 2 - every field the endpoint reads must be a field some caller
// sends, or be declared tolerated. This is the same defect seen from the server:
// a handler waiting on a key that will never arrive.
// ---------------------------------------------------------------------------
const orphaned = [];
for (const pair of wired) {
  const tolerated = new Set((pair.serverOptional ?? []).map((o) => o.field));
  for (const field of [...pair.reads].sort()) {
    if (!pair.sends.has(field) && !tolerated.has(field)) orphaned.push({ ...pair, field });
  }
  for (const option of pair.serverOptional ?? []) {
    assert.ok(option.why && option.why.length > 20,
      `${pair.handler} declares serverOptional "${option.field}" with no reason - an undocumented exception is how a mismatch hides`);
    assert.ok(pair.reads.has(option.field),
      `${pair.handler} declares serverOptional "${option.field}" but no longer reads it - delete the stale exception`);
  }
}
for (const miss of orphaned) {
  console.error(`  FAIL ${miss.handler} reads data.${miss.field} for ${miss.route}, which ${miss.caller.file} never sends (always undefined)`);
}
assert.equal(orphaned.length, 0,
  `${orphaned.length} endpoint field read(s) have no caller sending them - those reads are always undefined`);

// ---------------------------------------------------------------------------
// Named regression checks. The sweep above would pass if `player/remove` and its
// caller both switched to some third name, so the credential field of every
// bearer-gated route is pinned here by name: it must be the one field the stored
// secret actually carries.
// ---------------------------------------------------------------------------
const BEARER_ROUTES = ['/name/rename', '/name/transfer/start', '/player/remove'];
for (const route of BEARER_ROUTES) {
  const pair = wired.find((p) => p.route === route);
  assert.ok(pair.reads.has('token'),
    `${pair.handler} must read data.token - that is the field js/board/player.js's stored secret carries`);
  assert.ok(pair.sends.has('token') && pair.sends.has('player_id'),
    `${pair.caller.file} must post the stored {player_id, token} secret to ${route}`);
  assert.match(read(pair.handler), /\bplayerForToken\s*\(/,
    `${pair.handler} is a bearer-gated route and must still authenticate through playerForToken()`);
}
// The run/* pair names the same credential `player_token` on BOTH sides. That is
// a second convention, not a mismatch, and it is asserted so a well-meaning
// rename of one side alone cannot pass as a cleanup.
for (const route of ['/run/start', '/run/submit']) {
  const pair = wired.find((p) => p.route === route);
  assert.ok(pair.reads.has('player_token') && pair.sends.has('player_token'),
    `${route} names the bearer credential \`player_token\` on both sides - both must move together`);
}

console.log(`  ok: ${wired.length} endpoint/caller pair(s), ${totalSends} posted field(s) vs ${totalReads} read field(s), all matched`);

// ---------------------------------------------------------------------------
// Bearer-token persistence. A handler that mints a token with newDeviceToken()
// and returns it to the browser has created a credential; unless a hash of that
// exact token is persisted, `playerForToken()` can never match it and every
// later authenticated call from that player fails 401. `name/claim` and
// `name/transfer/redeem` do this correctly (mint, store sha256Hex(token), later
// compare) and are the pattern.
//
// BLOCKED_ON_SCHEMA is a known-exceptions list, and it is checked in BOTH
// directions: an entry that starts persisting its token must be deleted from the
// list, so the list cannot rot into a blanket excuse. It is EMPTY and expected to
// stay that way - `api/auth/register.mjs` and `api/auth/login.mjs` were carried
// here until the `session_token_hash` migration gave them somewhere to write, and
// came off it when that landed. A new entry needs a stated reason and clears
// itself the moment the endpoint starts persisting.
// ---------------------------------------------------------------------------
const BLOCKED_ON_SCHEMA = {};

const minters = [];
for (const file of handlerFiles) {
  const src = stripComments(read(file));
  if (!/\bnewDeviceToken\s*\(\s*\)/.test(src)) continue;
  minters.push({ file, persists: /\bsha256Hex\s*\(\s*token\s*\)/.test(src) });
}

const MUST_PERSIST = ['api/name/claim.mjs', 'api/name/transfer/redeem.mjs', 'api/auth/register.mjs', 'api/auth/login.mjs'];
assert.ok(minters.length >= 4, `only ${minters.length} token-minting endpoint(s) found - the scan is not reading the auth surface`);
for (const file of MUST_PERSIST) {
  const minter = minters.find((m) => m.file === file);
  assert.ok(minter, `${file} mints a bearer token and must be among the scanned minters`);
  // Named, not just swept: all four minters persist their token hash now that
  // `session_token_hash` exists, and the two password endpoints are the pair
  // that regressed before, so they are asserted by name rather than by count.
  assert.equal(minter.persists, true,
    `${file} must store sha256Hex(token) - a minted bearer token that is never persisted cannot authenticate anything afterwards`);
}

const unpersisted = minters.filter((m) => !m.persists && !(m.file in BLOCKED_ON_SCHEMA));
for (const miss of unpersisted) {
  console.error(`  FAIL ${miss.file} mints a bearer token with newDeviceToken() but never stores sha256Hex(token) - nothing can authenticate against it`);
}
assert.equal(unpersisted.length, 0,
  `${unpersisted.length} endpoint(s) hand the browser a token that no later request can be validated against`);

for (const [file, reason] of Object.entries(BLOCKED_ON_SCHEMA)) {
  const minter = minters.find((m) => m.file === file);
  assert.ok(minter, `BLOCKED_ON_SCHEMA lists ${file}, which no longer mints a token - delete the stale entry`);
  assert.ok(reason.length > 60, `BLOCKED_ON_SCHEMA entry for ${file} must state why it cannot be fixed here`);
  assert.equal(minter.persists, false,
    `${file} now persists its token hash - delete its BLOCKED_ON_SCHEMA entry here and the matching "Known gaps" note in .wiki/modules/api.md`);
}

console.log(`  ok: ${minters.length - Object.keys(BLOCKED_ON_SCHEMA).length} of ${minters.length} token-minting endpoint(s) persist their token hash`);

// ---------------------------------------------------------------------------
// The column those four writes land in, and the lookup that reads it. Storing a
// session hash is only half the fix: `playerForToken()` has to compare against
// it WITHOUT dropping the `token_hash` path that name/claim and
// name/transfer/redeem accounts still authenticate through. Regressing device
// auth to fix password auth would take four working endpoints down, so both
// column names are pinned here.
// ---------------------------------------------------------------------------
const SESSION_COLUMN = 'session_token_hash';
const migrationFiles = readdirSync(repoFile('supabase/migrations'))
  .filter((name) => name.endsWith('.sql')).sort();
assert.ok(migrationFiles.length >= 5,
  `only ${migrationFiles.length} migration(s) found - the scan is not reading supabase/migrations`);

const adding = migrationFiles.filter((name) => {
  const sql = read(`supabase/migrations/${name}`);
  return new RegExp(`alter\\s+table\\s+public\\.players[\\s\\S]{0,80}?add\\s+column[\\s\\S]{0,40}?${SESSION_COLUMN}`, 'i').test(sql);
});
assert.equal(adding.length, 1,
  `exactly one migration must add players.${SESSION_COLUMN}; found ${adding.length} (${adding.join(', ') || 'none'})`);

const migration = read(`supabase/migrations/${adding[0]}`);
assert.match(migration, new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${SESSION_COLUMN}\\s+bytea`, 'i'),
  `${adding[0]} must add ${SESSION_COLUMN} as a nullable bytea with \`if not exists\`, so re-applying it across environments is a no-op`);
assert.doesNotMatch(migration, /\bdrop\s+(table|column)\b/i,
  `${adding[0]} must stay additive - no drop belongs in the migration that lands a credential column`);

// A retired or transferred name must not leave a live session credential behind:
// both RPCs that end a device's ownership have to clear the new column in the
// same statement that rotates the old one.
for (const fn of ['fw_remove_player', 'fw_transfer_redeem']) {
  const start = migration.indexOf(`function public.${fn}`);
  assert.ok(start !== -1,
    `${adding[0]} must re-create ${fn} - adding ${SESSION_COLUMN} without clearing it there leaves a removed or transferred name holding a working session token`);
  const end = migration.indexOf('function public.', start + 1);
  const bodyText = migration.slice(start, end === -1 ? migration.length : end);
  assert.match(bodyText, new RegExp(`${SESSION_COLUMN}\\s*=\\s*null`, 'i'),
    `${fn} must set ${SESSION_COLUMN} = null in its update of public.players`);
}

const libSrc = stripComments(read('api/_lib.mjs'));
const lookupStart = libSrc.indexOf('export async function playerForToken');
assert.ok(lookupStart !== -1, 'api/_lib.mjs must still export playerForToken()');
const lookup = libSrc.slice(lookupStart, libSrc.indexOf('\n}', lookupStart));
assert.ok(lookup.includes(SESSION_COLUMN),
  `playerForToken() must compare a bearer token against ${SESSION_COLUMN}, or nothing register/login stores can ever authenticate`);
assert.ok(lookup.includes('token_hash') && /token_hash(?!_)/.test(lookup.replace(new RegExp(SESSION_COLUMN, 'g'), '')),
  'playerForToken() must still fall back to token_hash - name/claim and name/transfer/redeem accounts have no session hash and would all 401');
// The device path reads whatever projection the lookup asks Supabase for. A
// narrowed column list that omits the new column would 400 the whole request on
// a database where it does not exist yet, so the projection is asserted too.
assert.match(lookup, /players\?select=(\*|[^&]*session_token_hash)/,
  'playerForToken() must select the session column (or `*`) for the comparison to see it');

console.log(`  ok: ${adding[0]} adds players.${SESSION_COLUMN} and clears it in fw_remove_player + fw_transfer_redeem`);
console.log('  ok: playerForToken() checks the session hash and still falls back to the device token hash');

// ---------------------------------------------------------------------------
// AUTOMATIC GUEST IDENTITY, RUN ADOPTION, AND THE COLLAPSE OF WEEKLY SEASONS.
//
// Three defects sat behind an empty leaderboard, and each one is silent:
//
//   1. `run/start` bound `player_id: null` for a guest, and `fw_record_verdict`
//      only publishes `when r.player_id is not null`. A guest's run was ticketed,
//      submitted, replayed, scored - and then dropped on the floor. No error
//      anywhere. Every board read `[]`.
//   2. `auth/register` adopted a prior run with a bare
//      `PATCH runs?id=eq.<caller-supplied id>` and NO ownership check: no device
//      match, no `player_id is null`, no verdict check. Any run id a caller
//      learned was adoptable. It never fired in practice only because the
//      shipped client sends no `run_id`, which is also why creating an account
//      adopted nothing.
//   3. `currentWeeklySeasonId` was imported by `run/start` and never called,
//      while nothing ever wrote a `season_id`. A weekly reset that does not
//      exist is worse than none - the UI counted down to it.
//
// These assertions are mostly lexical for the reason stated at the top of this
// file (handlers need Supabase env + a live Postgres). Where a claim CAN be
// proven by running real code it is: `api/_names.mjs` and `api/_lib.mjs` are
// both importable headlessly, so the "a generated name always passes the name
// rules" claim is checked by generating names and running the rules on them,
// not by reading the source that is supposed to do it.
// ---------------------------------------------------------------------------
const { normaliseName: normalise } = await import('../api/_lib.mjs');
const { autoNameCandidates, blockedLocally } = await import('../api/_names.mjs');

const provisionSrc = stripComments(read('api/_names.mjs'));
const startSrc = stripComments(read('api/run/start.mjs'));
const registerSrc = stripComments(read('api/auth/register.mjs'));
const renameSrc = stripComments(read('api/name/rename.mjs'));

// --- 1. A guest is given a real players row at ticket time ------------------
assert.match(startSrc, /\bensureDevicePlayer\b/,
  'api/run/start.mjs must provision (or re-use) a players row for a guest, or every guest run is verified and then never published');
assert.match(startSrc, /from\s+'\.\.\/_names\.mjs'/,
  'run/start must get provisioning from the shared api/_names.mjs seam, not a private copy of the name rules');
// Only on the UNBOUND path: a caller who authenticated already has an identity
// and must not be handed a second one.
assert.match(startSrc, /if\s*\(\s*!player\s*\)\s*\{\s*assigned\s*=\s*await\s+ensureDevicePlayer\s*\(/,
  'ensureDevicePlayer() must be guarded by `if (!player)` - provisioning over an authenticated player would mint a duplicate identity');
// And BEHIND the rate limit. This is the only path that creates a players row
// with no human deciding to, so an unbounded one is a row-spam surface.
const limitAt = startSrc.indexOf('TICKET_RATE_LIMIT');
const provisionAt = startSrc.indexOf('ensureDevicePlayer(');
assert.ok(limitAt !== -1 && provisionAt > limitAt,
  'ensureDevicePlayer() must run AFTER the 12/hr device + 60/hr origin ticket rate limit, or auto-provisioning is an unmetered way to mass-create players');
// The credential has to reach the browser or the player can never rename, and
// the assigned name has to reach it or the UI cannot show who they are.
assert.match(startSrc, /player_name/,
  'run/start must return the assigned name so the client can store and display it');
assert.match(startSrc, /player_token/,
  'run/start must return the minted credential for a freshly provisioned player');

// A bearer token minted anywhere under api/ must have its hash persisted - the
// same rule the minter sweep above applies to routed handlers, extended to the
// shared module, which the route walker deliberately skips.
assert.match(provisionSrc, /\bnewDeviceToken\s*\(\s*\)/,
  'api/_names.mjs must mint the guest credential with newDeviceToken()');
assert.match(provisionSrc, /sha256Hex\s*\(\s*token\s*\)/,
  'api/_names.mjs must persist sha256Hex(token) - an unpersisted bearer token authenticates nothing afterwards');
// Device-token account kind, deliberately: token_hash = sha256(token) and NO
// session hash, so playerForToken()'s fallback path authenticates it. Writing a
// session hash here would make the guest a password account with no password.
assert.doesNotMatch(provisionSrc, new RegExp(SESSION_COLUMN),
  `an auto-provisioned guest must be a device-token account (no ${SESSION_COLUMN}), or playerForToken() picks the wrong column`);
assert.match(provisionSrc, /is_auto/,
  'an auto-provisioned player must be marked, so account creation can upgrade it instead of orphaning its scores');

// --- 1b. The submission of an auto-provisioned run must not 401 -------------
// Binding a guest ticket to a player has a consequence one file over:
// `run/submit` re-authenticates the claimed player whenever the TICKET carries
// one. The shipped client sends no player credentials for a guest (there are
// none in localStorage), so provisioning without this would have turned every
// guest run into `401 PLAYER_TOKEN_INVALID` at submit - strictly worse than the
// silent non-publication it was fixing, because the outbox drops a
// non-retryable failure. The ticket's own device_key match is the credential on
// that path, and it is the same evidence fw_claim_name has always accepted.
const submitSrc = stripComments(read('api/run/submit.mjs'));
assert.match(submitSrc, /ticket\.device_key\s*!==\s*data\.device_key/,
  'run/submit must still require the submitting device to be the device the ticket was issued to - that match is what stands in for a credential on the guest path');
assert.match(submitSrc, /is_auto/,
  'run/submit must accept a ticket-bound AUTO-provisioned player with no credentials, or every guest run 401s at submission');
assert.match(submitSrc, /if\s*\(\s*data\.player_id\s*\|\|\s*data\.player_token\s*\)/,
  'the credential path must still run whenever credentials were supplied - the guest fallback is only for a request that sent none');
assert.match(submitSrc, /playerForToken\s*\(\s*data\.player_id\s*,\s*data\.player_token\s*\)/,
  'a submission that DOES supply credentials must still be authenticated by them');
assert.match(submitSrc, /players\?select=\*/,
  'run/submit must read the ticket-bound player with select=* - a narrowed list naming is_auto 400s the whole request on a database where the migration has not been applied yet');

// --- 2. Generated names satisfy the rules a typed name has to satisfy -------
// Run the real screens over the real generator rather than trusting that the
// implementation calls them.
let sweptNames = 0;
for (let round = 0; round < 200; round++) {
  const candidates = autoNameCandidates(6);
  assert.equal(candidates.length, 6, 'autoNameCandidates(6) must return a full retry ladder');
  assert.equal(new Set(candidates).size, 6, 'a retry ladder with a repeated rung wastes an insert on a name that already collided');
  for (const candidate of candidates) {
    const parsed = normalise(candidate);
    assert.ok(parsed, `auto-generated name ${JSON.stringify(candidate)} is rejected by normaliseName() - the player would be handed a 400 on their first run`);
    assert.equal(parsed.name, candidate, `normaliseName() rewrote ${JSON.stringify(candidate)}; the stored name must be the one that was generated`);
    assert.equal(blockedLocally(parsed.key), false,
      `auto-generated name ${JSON.stringify(candidate)} trips the blocklist screen`);
    sweptNames++;
  }
}
assert.ok(sweptNames >= 1200, `only ${sweptNames} generated name(s) screened - the sweep is not exercising the generator`);

// The DB half of the screen must still be there: the local patterns are only
// the static file, and `blocked_names` is the live list an operator edits.
assert.match(provisionSrc, /blocked_names\?select=pattern,is_exact/,
  'blockedName() must still consult the live blocked_names table, not only the static JSON');

// One screen, four callers. A fourth private copy is how the live table check
// gets dropped from one path and nobody notices.
for (const file of ['api/auth/register.mjs', 'api/name/claim.mjs', 'api/name/rename.mjs']) {
  const src = stripComments(read(file));
  assert.match(src, /from\s+'\.\.\/_names\.mjs'/,
    `${file} must import the shared name screen from api/_names.mjs`);
  assert.doesNotMatch(src, /async\s+function\s+blocked\s*\(/,
    `${file} still defines a private blocked() - the screen must have exactly one definition`);
}

// --- 3. Adoption is gated on ownership, and the bare PATCH is gone ----------
assert.doesNotMatch(registerSrc, /runs\?id=eq/,
  'api/auth/register.mjs must NOT patch runs by a caller-supplied id - that adopted any run id a caller learned');
assert.doesNotMatch(registerSrc, /rest\s*\(\s*`?runs/,
  'api/auth/register.mjs must not write the runs table directly at all; adoption belongs in the RPC that can prove ownership');
assert.match(registerSrc, /rpc\s*\(\s*'fw_register_device_player'/,
  'api/auth/register.mjs must create and adopt through fw_register_device_player, which joins run_tickets to prove the device owns the runs');
assert.match(registerSrc, /p_device_key\s*:/,
  'the adoption RPC call must pass the device key - it is the only evidence of ownership the caller can supply');

const REGISTER_FN = 'fw_register_device_player';
const adopting = migrationFiles.filter((name) => read(`supabase/migrations/${name}`).includes(`function public.${REGISTER_FN}`));
assert.equal(adopting.length, 1,
  `exactly one migration must define ${REGISTER_FN}; found ${adopting.length} (${adopting.join(', ') || 'none'})`);
const adoptSql = read(`supabase/migrations/${adopting[0]}`);
// The structural checks below run on EXECUTABLE sql only. A migration documents
// its own rollback in `--` comments, and a scanner that cannot tell a documented
// `drop column` from an executed one either fails on good documentation or
// passes on a real drop. (No string literal in these files contains `--`.)
const adoptDdl = adoptSql.replace(/--[^\n]*/g, '');

assert.match(adoptDdl, new RegExp(`function public\\.${REGISTER_FN}[\\s\\S]{0,600}?security definer`, 'i'),
  `${REGISTER_FN} must be security definer - the tables it writes are revoked from every role but service_role`);
assert.match(adoptDdl, /set\s+search_path\s*=\s*public,\s*pg_temp/i,
  `${REGISTER_FN} must pin search_path, like every other fw_ function`);

// THE gate. Every write that moves a run under a player must join the ticket
// that proves this device played it, and must only take runs nobody owns.
const runWrites = [...adoptDdl.matchAll(/update\s+public\.runs\b/gi)];
assert.ok(runWrites.length >= 1, `${adopting[0]} must adopt runs by updating public.runs`);
for (const match of runWrites) {
  const end = adoptDdl.indexOf(';', match.index);
  const statement = adoptDdl.slice(match.index, end === -1 ? adoptDdl.length : end);
  assert.match(statement, /public\.run_tickets/,
    'every adoption write must join public.run_tickets - the ticket is the only proof the device played the run');
  assert.match(statement, /device_key\s*=\s*p_device_key/,
    'every adoption write must be scoped to the calling device key');
  assert.match(statement, /player_id\s+is\s+null/,
    'adoption must only take unclaimed runs - anything else steals a run from the player who owns it');
  assert.doesNotMatch(statement, /r\.id\s*=\s*p_run_id/,
    'a caller-supplied run id must never be the thing that authorises a write; it may only be reported on');
}

// The backfill. For an already-verified run, fw_record_verdict has run and
// skipped the publish (player_id was null), so re-pointing the run alone
// publishes nothing. This is what a bare PATCH could never do.
assert.match(adoptDdl, /insert\s+into\s+public\.board_public/i,
  `${REGISTER_FN} must backfill board_public - for an already-verified run fw_record_verdict has already run and skipped the insert`);
assert.match(adoptDdl, /on\s+conflict\s*\(\s*run_id\s*\)\s*do\s+update/i,
  'the board_public backfill must be idempotent on run_id, like fw_record_verdict and fw_claim_name');
assert.match(adoptDdl, /verdict\s*=\s*'verified'/i,
  'only a verified run may be published to board_public - invariant 8');

// Upgrading, not orphaning: a device that already plays as an auto-provisioned
// guest must keep its scores when it creates an account.
assert.match(adoptDdl, /is_auto/,
  `${REGISTER_FN} must adopt the device's auto-provisioned guest, or every score earned before signup is stranded on a ghost player`);
assert.match(adoptDdl, /add\s+column\s+if\s+not\s+exists\s+is_auto\s+boolean/i,
  'the is_auto marker must be added with `if not exists`, so re-applying the migration is a no-op');

assert.match(adoptDdl, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${REGISTER_FN}[\\s\\S]{0,200}?from\\s+public,\\s*anon,\\s*authenticated`, 'i'),
  `${REGISTER_FN} must be revoked from anon/authenticated - a browser must not be able to call it directly`);
assert.match(adoptDdl, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${REGISTER_FN}[\\s\\S]{0,200}?to\\s+service_role`, 'i'),
  `${REGISTER_FN} must be granted to service_role, or api/ cannot call it (default privileges revoke execute on new functions)`);
assert.doesNotMatch(adoptDdl, /\bdrop\s+(table|column)\b/i,
  `${adopting[0]} must stay additive`);

// A plpgsql function whose RETURNS TABLE names a column that also exists on a
// table it updates has an ambiguous name in any UNqualified reference, and
// `plpgsql.variable_conflict = error` (the default) raises on it AT RUN TIME -
// `create function` never plans the body, so the migration applies cleanly and
// the function fails the first time a real player reaches it. That is how
// `fw_transfer_redeem` shipped broken. Both functions that return a
// `token_version` column and also increment it are pinned here.
for (const fn of ['fw_register_device_player', 'fw_transfer_redeem']) {
  const start = adoptDdl.indexOf(`function public.${fn}`);
  assert.ok(start !== -1, `${adopting[0]} must define ${fn}`);
  const next = adoptDdl.indexOf('function public.', start + 1);
  const fnBody = adoptDdl.slice(start, next === -1 ? adoptDdl.length : next);
  if (!/returns\s+table\s*\([^)]*token_version/i.test(fnBody)) continue;
  assert.doesNotMatch(fnBody, /token_version\s*=\s*token_version\s*\+/i,
    `${fn} returns a token_version column, so an unqualified \`token_version + 1\` is ambiguous and raises at run time - write \`players.token_version + 1\``);
  assert.match(fnBody, /token_version\s*=\s*players\.token_version\s*\+\s*1/i,
    `${fn} must qualify the increment as players.token_version + 1`);
}
// Re-creating fw_transfer_redeem must not silently undo the revocation
// 20260816214501 added to it.
const redeemStart = adoptDdl.indexOf('function public.fw_transfer_redeem');
assert.match(adoptDdl.slice(redeemStart, redeemStart + 1200), new RegExp(`${SESSION_COLUMN}\\s*=\\s*null`, 'i'),
  `the re-created fw_transfer_redeem must still clear ${SESSION_COLUMN}, or a transferred-away device keeps a session token that validates`);

// --- 4. Seasons are one permanent season ------------------------------------
for (const file of [...handlerFiles, 'api/_lib.mjs', 'api/_verify.mjs', 'api/_names.mjs']) {
  // Code, not prose: the comment left where the function used to live explains
  // why there is no weekly season, and must not read as a violation.
  assert.doesNotMatch(stripComments(read(file)), /currentWeeklySeasonId/,
    `${file} still references currentWeeklySeasonId - the boards are all-time and there is no weekly reset`);
}
// The COLUMNS stay. They cost nothing, they are deliberate future-proofing, and
// dropping them would rewrite two published views for no gain.
for (const name of migrationFiles) {
  assert.doesNotMatch(read(`supabase/migrations/${name}`), /drop\s+column[\s\S]{0,40}season_id/i,
    `${name} drops season_id - the column is deliberate future-proofing and stays`);
}
assert.match(read('supabase/migrations/20260812204210_scoreboards_profiles.sql'), /season_id\s+integer\s+not\s+null/,
  'board_public.season_id must still exist - collapsing seasons is a product decision, not a schema deletion');

// --- 5. A generated name can be changed -------------------------------------
assert.match(renameSrc, /playerForToken\s*\(\s*data\.player_id\s*,\s*data\.token\s*\)/,
  'name/rename must authenticate with the {player_id, token} pair the browser stores - which is exactly what run/start hands a freshly provisioned guest');
assert.match(renameSrc, /board_public\?player_id=eq\./,
  'name/rename must patch the published name too, or the leaderboard keeps showing the generated one');

console.log(`  ok: run/start provisions a named guest; ${sweptNames} generated names pass normaliseName() + the blocklist`);
console.log(`  ok: ${adopting[0]} adopts runs only through the run_tickets ownership join and backfills board_public`);
console.log('  ok: no weekly season code left under api/, and no migration drops season_id');
console.log('✓ api endpoint/caller field + token-persistence guard PASSED');
