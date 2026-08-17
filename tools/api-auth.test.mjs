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
  const handlerSrc = stripComments(read(entry.handler));
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
console.log('✓ api endpoint/caller field + token-persistence guard PASSED');
