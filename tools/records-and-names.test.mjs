// TDD unit test: RECORDS vs LEADERBOARDS, the retired weekly-season fiction, and
// the automatic player name with its re-roll.
//
// Three defects, none of which any existing gate could see.
//
// T-801 — the boards screen advertised a season that does not exist.
//   `js/ui/boards.js` computed a week number and a countdown from a client-side
//   clock (`SEASON_EPOCH_MS`, `currentWeeklySeasonInfo`) and printed "WEEKLY
//   SEASON n · Weekly reset in Xd Yh · City records reset weekly". Nothing
//   resets: every stored row is season 1 and no scheduler exists. A countdown
//   that expires and changes nothing is a lie the player can time.
//
// T-802 — "Records" and "Leaderboards" were the same read, ranked wrong.
//   The screen's public board ranked by RANK POINTS (`v_overall`), which is a
//   positional score, and there was no surface at all for "my own all-time
//   bests". The product definition is two different questions: LEADERBOARDS is
//   one global top 10 across every player, ranked by the sum of each player's
//   best score on each city (`v_leaderboard`); RECORDS is one player's own
//   bests, per city (`v_city_board?player_id=eq...` plus the local save).
//   `dense_rank()` in the view means a genuine tie shares a rank, so "top 10"
//   can legitimately return MORE than ten rows — the cut is asserted here
//   against ties, not against a row count.
//
// T-803 — a new player had no name, so nothing they did could be published.
//   `defaultPlayer()` returned `{ name: null }` and the only route to a name was
//   a claim form behind a server-verified run. Every surface that shows a name
//   showed a placeholder instead. Now the name is generated on arrival from
//   `js/board/names.js` and can be re-rolled. Because a DEFAULT only reaches a
//   player who has no save yet, the schema bump and its migration are the load-
//   bearing half of this: without them every existing player keeps their null.
//
// `js/save.js`, `js/board/read.js` and `js/ui/boards.js` all import headlessly
// (no DOM or three.js at module scope), so their behaviour is tested by CALLING
// them. `js/ui/screens.js` and `js/main.js` cannot be, so the surfaces they own
// are asserted as source text, in the style of tools/economy-consistency.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CURRENT_VERSION, __freshSave, __MIGRATIONS, __defaultPlayer,
  rerollPlayerName, adoptServerName, playerName, ensurePlayer,
} from '../js/save.js';
import { MAX_NAME_LENGTH, NAME_PATTERN, generateName } from '../js/board/names.js';
import { topTen } from '../js/ui/boards.js';
import * as boards from '../js/ui/boards.js';
import * as read from '../js/board/read.js';

console.log('Testing records/leaderboards split and automatic player names...');

// core.autocrlf is on, so a working-tree file may be CRLF or LF depending on who
// last wrote it. Every static assertion below reads normalized text.
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The contract every name on every surface has to satisfy: the server's own
 *  character class and its 16-character ceiling. Anti-vacuity first — a pattern
 *  that accepted anything would make every assertion below free. */
function assertValidName(name, why) {
  assert.equal(typeof name, 'string', `${why}: not a string (${JSON.stringify(name)})`);
  assert.ok(name.length > 0 && name.length <= MAX_NAME_LENGTH, `${why}: "${name}" is ${name.length} chars, ceiling is ${MAX_NAME_LENGTH}`);
  assert.match(name, NAME_PATTERN, `${why}: "${name}" is not a name the server would accept`);
}
assert.ok(!NAME_PATTERN.test('nope!! <script>'), 'NAME_PATTERN accepts anything — every name assertion here is vacuous');
assert.ok(!NAME_PATTERN.test(''), 'NAME_PATTERN accepts the empty string');

// ===========================================================================
// T-803a — a brand-new player has a name before they touch anything
// ===========================================================================

console.log('\n--- T-803a: defaults carry a generated name ---');
{
  const player = __defaultPlayer();
  assertValidName(player.name, 'defaultPlayer()');
  assert.equal(player.id, null, 'defaultPlayer() must not fabricate a player id — a name is not an account');
  assert.equal(player.claimedAt, null, 'an auto-generated name is not a claim');
  assert.equal(player.nameSource, 'auto', 'defaultPlayer() must mark the name as automatic, not as one the player chose');

  const fresh = __freshSave();
  assertValidName(fresh.player.name, 'freshSave().player');
  assert.equal(fresh.player.nameSource, 'auto', 'a fresh save must know its name was handed to it');

  // The generator is live, not a frozen constant someone pasted in. 200 draws
  // over a 1,936-pair space should not collapse to a handful.
  const drawn = new Set();
  for (let i = 0; i < 200; i++) {
    const n = __defaultPlayer().name;
    assertValidName(n, `defaultPlayer() draw ${i}`);
    drawn.add(n);
  }
  assert.ok(drawn.size >= 50, `200 fresh players produced only ${drawn.size} distinct names — the default is not actually generating`);
  console.log(`  200 fresh players -> ${drawn.size} distinct names, e.g. "${[...drawn][0]}".`);
}

// ===========================================================================
// T-803b — THE MIGRATION. Changing a default does nothing for anyone who
//          already has a save; this is the half that reaches existing players.
// ===========================================================================

console.log('\n--- T-803b: the save migration names an existing nameless save ---');
{
  assert.ok(CURRENT_VERSION >= 22, `CURRENT_VERSION is ${CURRENT_VERSION} — the name migration did not bump the schema, so no existing save is ever reached`);
  const bump = __MIGRATIONS[21];
  assert.ok(typeof bump === 'function', 'there is no migration out of v21 — loadSave() quarantines every existing save');

  // The exact shape every shipped save is carrying today.
  const v21 = {
    version: 21, coins: 900, levels: {}, sandbox: { chicago: { completions: 2, bestScore: 4242 } },
    ownedItems: ['funnel'], equippedSkin: 'funnel', equippedIndicator: 'ind-default', muted: false,
    settings: __freshSave().settings, player: { id: null, name: null, claimedAt: null },
    outbox: [], upgrades: {}, challenges: {},
  };
  const named = bump(v21);
  assert.equal(named.version, 22, `migration 21 produced version ${named.version}`);
  assertValidName(named.player.name, 'migrated v21 save');
  assert.equal(named.player.nameSource, 'auto', 'a name handed out by the migration is automatic, not claimed');
  assert.equal(named.player.id, null, 'the migration must not fabricate a player id');
  assert.equal(named.player.claimedAt, null, 'the migration must not backdate a claim the player never made');

  // Nothing else moves. A migration that quietly resets progress is worse than
  // one that never ran.
  assert.equal(named.coins, 900, 'the migration spent the player\'s coins');
  assert.deepEqual(named.sandbox, v21.sandbox, 'the migration rewrote city history');
  assert.deepEqual(named.ownedItems, ['funnel'], 'the migration took an owned item away');

  // A player who really did claim a name keeps it, and it is marked as theirs.
  const claimed = bump({ ...v21, player: { id: 'p_1', name: 'Waffle Baron', claimedAt: '2026-08-01T00:00:00.000Z' } });
  assert.equal(claimed.player.name, 'Waffle Baron', 'the migration renamed a player who had claimed a name');
  assert.equal(claimed.player.id, 'p_1', 'the migration dropped a real player id');
  assert.equal(claimed.player.nameSource, 'claimed', 'a name backed by a claim must not be marked automatic');

  // A name with no claim behind it (the offline `local-*` path writes one) is
  // kept but stays re-rollable.
  const offline = bump({ ...v21, player: { id: 'local-abc', name: 'Turf Rascal', claimedAt: null } });
  assert.equal(offline.player.name, 'Turf Rascal', 'the migration overwrote a name the player already had');
  assert.equal(offline.player.nameSource, 'auto', 'an unclaimed name must stay re-rollable');

  // Idempotent: running the whole chain from the oldest reachable save lands on
  // exactly one name, not on a re-roll every load.
  let chained = { version: 1, coins: 0, stars: { 1: 3 } };
  for (let v = 1; v < CURRENT_VERSION; v++) chained = __MIGRATIONS[v](chained);
  assertValidName(chained.player.name, 'v1 -> current chain');
  assert.equal(chained.player.nameSource, 'auto', 'the full chain lost the name source');
  console.log(`  v21 nameless save -> "${named.player.name}"; v1 chain -> "${chained.player.name}".`);
}

// ===========================================================================
// T-803c — re-roll: a different valid name, instantly, nothing else touched
// ===========================================================================

console.log('\n--- T-803c: re-roll hands back a different valid name ---');
{
  const save = __freshSave();
  const seen = new Set([save.player.name]);
  let previous = save.player.name;
  for (let i = 0; i < 50; i++) {
    const rolled = rerollPlayerName(save);
    assertValidName(rolled, `re-roll ${i}`);
    assert.equal(save.player.name, rolled, 're-roll returned a name it did not store');
    assert.notEqual(rolled, previous, `re-roll ${i} handed back the same name twice — the button would look broken`);
    assert.equal(save.player.nameSource, 'auto', 're-roll must leave the name re-rollable');
    assert.equal(save.player.id, null, 're-roll invented a player id');
    assert.equal(save.player.claimedAt, null, 're-roll invented a claim');
    seen.add(rolled);
    previous = rolled;
  }
  assert.ok(seen.size >= 20, `50 re-rolls produced only ${seen.size} distinct names`);

  // A re-roll must never quietly rename a real account: that name is registered
  // server-side and the local save is not the authority on it.
  const account = __freshSave();
  adoptServerName(account, 'Agent Macklin');
  const before = account.player.name;
  const after = rerollPlayerName(account);
  assert.equal(after, before, 're-roll renamed a claimed account behind the server\'s back');
  assert.equal(account.player.nameSource, 'claimed', 're-roll downgraded a claimed name to an automatic one');
  console.log(`  50 re-rolls -> ${seen.size} distinct names; a claimed name is left alone.`);
}

console.log('\n--- T-803d: the server\'s name wins when it sends one, and only then ---');
{
  const save = __freshSave();
  const local = save.player.name;

  // Offline (invariant 10): no response, so the locally generated name stands.
  adoptServerName(save, null);
  assert.equal(save.player.name, local, 'an absent server name erased the local one — an offline player lost their identity');
  assert.equal(save.player.nameSource, 'auto', 'an absent server name must not mark the local name as claimed');
  adoptServerName(save, '');
  assert.equal(save.player.name, local, 'an empty server name erased the local one');

  // Provisioned: the server resolves uniqueness collisions, so the name it
  // returns can differ from the one the client generated. It is authoritative.
  adoptServerName(save, 'Snake Juice2');
  assert.equal(save.player.name, 'Snake Juice2', 'the client ignored the name the server actually assigned');
  assert.equal(save.player.nameSource, 'claimed', 'a server-assigned name must not stay re-rollable');
  assertValidName(save.player.name, 'server-adopted name');

  // The seatbelt every screen reads through: a hand-edited or partial save must
  // still produce a name rather than a blank chip.
  const broken = { version: CURRENT_VERSION, player: { id: null, name: null, claimedAt: null } };
  assertValidName(playerName(broken), 'playerName() on a save with a null name');
  assert.equal(playerName(broken), broken.player.name, 'playerName() did not persist the name it invented');
  const empty = {};
  assertValidName(playerName(empty), 'playerName() on a save with no player object at all');
  assert.ok(ensurePlayer(empty).nameSource, 'ensurePlayer() left the rebuilt player without a name source');
}

// ===========================================================================
// T-801 — the weekly-season fiction is gone from the product surface
// ===========================================================================

console.log('\n--- T-801: no weekly season is advertised anywhere ---');
{
  const boardsSrc = src('../js/ui/boards.js');
  for (const forbidden of [/WEEKLY SEASON/i, /weekly reset/i, /reset weekly/i, /currentWeeklySeasonInfo/, /SEASON_EPOCH_MS/, /WEEK_MS/]) {
    assert.ok(!forbidden.test(boardsSrc), `js/ui/boards.js still carries the retired weekly-season fiction (${forbidden}) — nothing resets, so the countdown is a lie the player can time`);
  }
  assert.equal(boards.currentWeeklySeasonInfo, undefined, 'boards.js still exports the season clock');
  assert.ok(!/WEEKLY CITY RECORDS/.test(boardsSrc), 'a board caption still calls the records weekly');

  // The optional season parameter on the READ path is deliberately untouched —
  // only the product-facing fiction goes.
  const readSrc = src('../js/board/read.js');
  assert.match(readSrc, /cityBoard\(sceneId, seasonId = null\)/, 'the optional seasonId parameter was removed from cityBoard() — only the product-facing fiction was meant to go');
}

// ===========================================================================
// T-802 — Leaderboards is ONE global all-time top 10, by total score
// ===========================================================================

console.log('\n--- T-802a: the read path points at v_leaderboard ---');
{
  const readSrc = src('../js/board/read.js');
  assert.equal(typeof read.leaderboard, 'function', 'js/board/read.js exports no leaderboard() — the screen has nothing to read');
  assert.match(readSrc, /v_leaderboard/, 'read.js never mentions the all-time leaderboard view');
  assert.match(readSrc, /order=rank\.asc,total_score\.desc,name\.asc/, 'the leaderboard query does not use the documented deterministic ordering');
  assert.match(readSrc, /leaderboard\(limit = 10\)/, 'the leaderboard row cut is not a parameter defaulting to ten — "show more" would need a code change to the query string');
  assert.match(readSrc, /limit=\$\{/, 'the leaderboard limit is a hardcoded literal in the query string');

  // v_overall is being retired in a later pass, not in this one: its read stays.
  assert.equal(typeof read.overallBoard, 'function', 'overallBoard() was deleted before its replacement pass — v_overall reads are retired later, not here');
  assert.equal(typeof read.cityBoard, 'function', 'cityBoard() was deleted — Records reads a player\'s own per-city bests through it');
  assert.equal(typeof read.playerCityRecords, 'function', 'nothing reads a single player\'s own verified per-city bests, so RECORDS has no server side');

  const boardsSrc = src('../js/ui/boards.js');
  assert.match(boardsSrc, /\bleaderboard\s*\(/, 'the boards screen never calls leaderboard()');
  assert.ok(!/overallBoard\s*\(/.test(boardsSrc), 'the boards screen still ranks players by rank points (v_overall) instead of by total score');
}

console.log('\n--- T-802b: "top 10" survives a tie ---');
{
  assert.equal(typeof topTen, 'function', 'js/ui/boards.js exports no topTen() — the row cut is not testable');

  const row = (rank, name) => ({ rank, name, total_score: 100 - rank, cities: 3 });

  // The ordinary case: 25 rows come back, 10 are shown.
  const many = Array.from({ length: 25 }, (_, i) => row(i + 1, `P${i + 1}`));
  assert.equal(topTen(many).length, 10, 'the leaderboard shows more or fewer than ten players in the ordinary case');
  assert.deepEqual(topTen(many).map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'the leaderboard reordered or skipped ranks');

  // THE DEFECT this guards: dense_rank means a genuine tie shares a rank, so
  // rank <= 10 can be more than ten rows. Slicing to ten would cut a player who
  // is tied for tenth out of a place they hold.
  const tied = [
    ...Array.from({ length: 9 }, (_, i) => row(i + 1, `P${i + 1}`)),
    { rank: 10, name: 'Tied A', total_score: 50, cities: 2 },
    { rank: 10, name: 'Tied B', total_score: 50, cities: 2 },
    { rank: 10, name: 'Tied C', total_score: 50, cities: 2 },
    { rank: 11, name: 'Eleventh', total_score: 40, cities: 2 },
  ];
  const shown = topTen(tied);
  assert.equal(shown.length, 12, `a three-way tie for tenth showed ${shown.length} rows — everyone holding tenth place must appear`);
  assert.ok(shown.every((r) => r.rank <= 10), 'a player ranked eleventh appeared on the top ten');
  assert.ok(!shown.some((r) => r.name === 'Eleventh'), 'the eleventh-placed player is on the board');

  // Degenerate inputs a live view can produce: no rows, a null payload, and rows
  // with no rank at all (a view change, or the offline cache from an older build).
  assert.deepEqual(topTen([]), [], 'an empty board did not come back empty');
  assert.deepEqual(topTen(null), [], 'a null payload threw or leaked a non-array');
  assert.deepEqual(topTen(undefined), [], 'an absent payload threw or leaked a non-array');
  const rankless = Array.from({ length: 14 }, (_, i) => ({ name: `N${i}`, total_score: 14 - i }));
  assert.equal(topTen(rankless).length, 10, 'rows with no rank column were not capped at ten');
}

// ===========================================================================
// T-803e — the name is actually SHOWN on all three surfaces
// ===========================================================================

console.log('\n--- T-803e: every surface that shows a name shows the generated one ---');
{
  const screensSrc = src('../js/ui/screens.js');
  const boardsSrc = src('../js/ui/boards.js');
  const mainSrc = src('../js/main.js');

  // The title-screen chip. It used to read "PLAYER LOGIN / LOG IN".
  assert.ok(!/'LOG IN'/.test(screensSrc) && !/>LOG IN</.test(screensSrc), 'the title chip still shows the LOG IN placeholder instead of the player\'s name');
  assert.ok(!/PLAYER LOGIN/.test(screensSrc), 'the title chip still labels the player as logged out');
  assert.match(screensSrc, /playerName\(/, 'the title chip does not read the player\'s name through the save helper, so a nameless save still shows a placeholder');
  assert.match(screensSrc, /fw-reroll/, 'the title chip has no re-roll control');
  assert.match(screensSrc, /rerollPlayerName/, 'the title screen never re-rolls anything');
  // The dead claim-path copy: it told players a name can only come from a
  // verified run, which is no longer how anyone gets one.
  assert.ok(!/A name comes from a verified place on the board/.test(screensSrc), 'the profile screen still says a name comes only from a verified run');

  // The profile heading.
  assert.ok(!/UNCLAIMED IDENTITY/.test(boardsSrc), 'the profile heading still calls a named player unclaimed');
  assert.match(boardsSrc, /fw-reroll/, 'the profile screen has no re-roll control');

  // The multiplayer default name.
  assert.ok(!/save\.player\?\.name \|\| ''/.test(mainSrc), 'a multiplayer prompt still defaults to an empty name');
  assert.ok(!/save\.player\?\.name \|\| 'Host'/.test(mainSrc), 'the multiplayer host still falls back to the literal name "Host"');
  assert.ok(!/`Player_\$\{/.test(mainSrc), 'multiplayer still falls back to a Player_417-style number');
  const usages = mainSrc.match(/playerName\(save\)/g) || [];
  assert.ok(usages.length >= 3, `js/main.js reads the generated name in only ${usages.length} place(s) — the host name, the join prompt and the join fallback all need it`);

  // Randomness rules: crypto only. `Math.random()` is banned in js/ and rng.js
  // is the seeded world generator, so a name must not come from either.
  const namesSrc = src('../js/board/names.js');
  assert.match(namesSrc, /crypto\.getRandomValues/, 'the name generator no longer uses crypto entropy');
  for (const [file, text] of [['js/save.js', src('../js/save.js')], ['js/ui/boards.js', boardsSrc]]) {
    assert.ok(!/Math\.random\(/.test(text), `${file} uses Math.random() — banned in js/`);
    assert.ok(!/from '\.\.?\/rng\.js'/.test(text), `${file} imports the seeded world RNG for a name — a name must not be derivable from a world seed`);
  }
  assert.equal(typeof generateName, 'function', 'the shared generator is gone');
}

console.log('\nrecords/leaderboards + automatic names: all assertions passed.');
