// TDD Unit Test: automatic Parks-and-Recreation player names (js/board/names.js)
//
// Every guest is currently anonymous, and an anonymous run is never published to
// a board — so the entire guest population is invisible on the leaderboards. The
// fix is to hand every player a name the moment they arrive, without a signup.
//
// A generated name is only useful if the server will ACCEPT it. `normaliseName`
// in api/_lib.mjs and `blocked()` in api/name/claim.mjs are the two gates every
// claimed name passes, and both are unforgiving:
//
//   * 3-16 characters after NFKC, `^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$` — no
//     apostrophes (so it is "Lil Sebastian", never "Li'l Sebastian"), no
//     periods, no double or edge spaces;
//   * `blocked()` matches by SUBSTRING against a leet-folded, space-stripped key,
//     so a clean-looking pair can still be rejected because of the seam where the
//     two words join. Screening the words one at a time is NOT sufficient.
//
// THE FILTER, NOT THE VOCABULARY
// An earlier revision enforced `longest modifier + 1 + longest subject <= 16`
// over the whole vocabulary. That is stricter than the actual requirement and it
// cost the best names: `Sebastian` had to shrink to `Sebbie` purely so it would
// not collide with `Eagleton`, a pairing nothing ever needed to emit. The real
// requirement is that every name the generator EMITS is valid. So the CROSS
// PRODUCT is filtered into a valid pair set at module load and the generator
// draws from that set — which is why the assertions below run over
// `VALID_PAIRS`, and why they also pin the filter from both directions so it can
// never silently become a no-op (letting a long name through) or over-prune
// (quietly gutting variety).
//
// This suite iterates the FULL valid set rather than sampling. A generator that
// emits 1 bad name in 2000 would emit it to a real player on their first run,
// and there is no retry surface in front of them.
//
// THE SCREEN IS IMPORTED, NOT REPRODUCED
// An earlier revision kept a hand-copied RESERVED set here and asserted it
// against the shipped source text, because the screen lived inside the request
// handler and could not be imported headlessly. It since moved to
// `api/_names.mjs` — a module with no request-time dependencies — so this suite
// imports the REAL `RESERVED` and the REAL `blockedLocally`. There is no copy
// left to drift, which is strictly better than a copy watched by an assertion.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import blockedNames from '../api/data/blocked-names.json' with { type: 'json' };
import { normaliseName } from '../api/_lib.mjs';
import { RESERVED, blockedLocally } from '../api/_names.mjs';
import {
  MODIFIERS, SUBJECTS, VALID_PAIRS, MAX_NAME_LENGTH, MAX_DISCRIMINATOR, NAME_PATTERN,
  combinationCount, generateName, withDiscriminator, nameKey, nameCandidates,
} from '../js/board/names.js';

console.log('Testing generated Parks-and-Rec player names...');

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ===========================================================================
// The blocklist copy is the real one
// ===========================================================================

console.log('\n--- the screen under test is the one the server actually runs ---');

/** The offline half of the server's name screen — imported, not reproduced.
 *  The live `blocked_names` table cannot be consulted from a headless test, so
 *  this covers exactly what ships in the repo. */
const blockedOffline = blockedLocally;

{
  assert.ok(RESERVED instanceof Set && RESERVED.size > 0, 'api/_names.mjs RESERVED is empty — every screen below would pass vacuously');
  assert.ok(blockedNames.length > 0, 'blocked-names.json is empty — the screen below would pass vacuously');
  assert.ok(blockedNames.every((row) => typeof row.pattern === 'string' && row.pattern), 'a blocked-names.json row has no pattern');

  // All four name paths must reach the SAME screen. A private copy in any one of
  // them is how one quietly stops consulting the live blocked_names table — and
  // it would also mean this suite is screening the generator against a rule one
  // of the handlers no longer applies.
  for (const handler of ['../api/name/claim.mjs', '../api/name/rename.mjs', '../api/auth/register.mjs']) {
    const text = src(handler);
    assert.match(text, /from '\.\.\/_names\.mjs'/, `${handler} no longer imports the shared name screen`);
    assert.doesNotMatch(text, /const RESERVED = new Set\(/, `${handler} has grown its own private RESERVED copy — the screens can now disagree`);
  }
}

// The screen itself must be capable of failing, or every "not blocked" assertion
// below is worth nothing.
assert.equal(blockedOffline('flywheel'), true, 'the shared blocked() does not catch a RESERVED word');
assert.equal(blockedOffline('mrshitake'), true, 'the shared blocked() does not substring-match blocked-names.json');
assert.equal(blockedOffline('meattornado'), false, 'the shared blocked() rejects a name it should allow');

// ===========================================================================
// Anti-vacuity: the lists and the valid pair set are actually populated
// ===========================================================================

console.log('\n--- the vocabulary and the valid pair set are big enough to be worth having ---');

const RAW_COMBINATIONS = MODIFIERS.length * SUBJECTS.length;
const pairName = ([modifier, subject]) => `${modifier} ${subject}`;

{
  assert.ok(Array.isArray(MODIFIERS) && Array.isArray(SUBJECTS), 'the word lists are not arrays');
  assert.ok(MODIFIERS.length >= 40, `only ${MODIFIERS.length} modifiers — the list is truncated`);
  assert.ok(SUBJECTS.length >= 40, `only ${SUBJECTS.length} subjects — the list is truncated`);
  assert.equal(new Set(MODIFIERS).size, MODIFIERS.length, 'the modifier list has duplicates');
  assert.equal(new Set(SUBJECTS).size, SUBJECTS.length, 'the subject list has duplicates');
  assert.equal(MAX_NAME_LENGTH, 16, 'MAX_NAME_LENGTH must match the server (normaliseName caps at 16)');

  assert.ok(Array.isArray(VALID_PAIRS), 'VALID_PAIRS is not an array');
  assert.equal(combinationCount(), VALID_PAIRS.length, 'combinationCount() does not describe the valid pair set');
  assert.ok(
    combinationCount() >= 1200,
    `only ${combinationCount()} valid pairs — shortening the lists has gutted the variety a whole population of guests draws from`,
  );
  assert.equal(new Set(VALID_PAIRS.map(pairName)).size, VALID_PAIRS.length, 'VALID_PAIRS contains the same pairing twice');
  console.log(`  ${MODIFIERS.length} x ${SUBJECTS.length} = ${RAW_COMBINATIONS} raw, ${VALID_PAIRS.length} valid pairs.`);
}

// ===========================================================================
// The filter is a real filter — pinned from BOTH directions
// ===========================================================================

console.log('\n--- the length filter is neither a no-op nor an over-prune ---');
{
  // Direction 1: it actually removes something. If the vocabulary ever shrinks
  // back to "every pair fits", this fails and tells us the filter has stopped
  // earning its keep — which is the state the first revision was stuck in.
  assert.ok(
    VALID_PAIRS.length < RAW_COMBINATIONS,
    'VALID_PAIRS is the entire cross product — the filter is a no-op, so nothing stops an over-length name being emitted',
  );

  // Direction 2: it removes ONLY over-length pairs. Rebuild the expected set
  // here, independently of the module, and compare exactly. An over-prune would
  // silently cost variety; an under-prune would ship an invalid name.
  const expected = [];
  const over = [];
  for (const modifier of MODIFIERS) {
    for (const subject of SUBJECTS) {
      (`${modifier} ${subject}`.length <= MAX_NAME_LENGTH ? expected : over).push(`${modifier} ${subject}`);
    }
  }
  assert.deepEqual(
    VALID_PAIRS.map(pairName).slice().sort(), expected.slice().sort(),
    'VALID_PAIRS is not exactly the set of pairings that fit — the filter is dropping good names or keeping bad ones',
  );
  assert.ok(over.length > 0, 'no pairing was excluded — see direction 1');

  // The excluded set must be excluded for the RIGHT reason, and every one of
  // them must be genuinely unusable.
  for (const name of over) {
    assert.ok(name.length > MAX_NAME_LENGTH, `'${name}' was excluded but is only ${name.length} characters`);
    assert.equal(normaliseName(name), null, `'${name}' was excluded but the server would have accepted it`);
  }

  // Some pairing must sit exactly at the cap, or the ceiling is untested.
  const longest = VALID_PAIRS.map(pairName).reduce((a, b) => (b.length > a.length ? b : a));
  assert.equal(longest.length, MAX_NAME_LENGTH, `the longest emittable name '${longest}' is only ${longest.length} characters — the ceiling is not being exercised`);
  console.log(`  ${over.length} over-length pairings excluded; longest emittable '${longest}' (${longest.length}).`);
}

// ===========================================================================
// The names the product owner asked for are actually emittable
// ===========================================================================

console.log('\n--- the iconic long names survived the vocabulary ---');
{
  // These are the names the earlier "every pair must fit" rule made impossible.
  // Pinning them by literal is the point: a future word-list edit that quietly
  // shortens `Sebastian` or drops `Snakehole` must fail here, loudly, rather
  // than degrade the joke without anyone noticing.
  const ICONIC = [
    'Lil Sebastian', 'Janet Snakehole', 'Bert Macklin', 'Perd Hapley',
    'Meat Tornado', 'Duke Silver', 'Snake Juice', 'Wamapoke Chief',
    'Eagleton Snob', 'Calzone Baron', 'Tammy Two', 'Mouse Rat',
    // From the tone sample the owner SELECTED, not merely illustrated with —
    // which is why `Wizard` and `Bagel` are absent from the CUT list below
    // despite reading like filler out of context.
    'Chunky Wizard', 'Rowdy Bagel',
  ];
  const emittable = new Set(VALID_PAIRS.map(pairName));
  const missing = ICONIC.filter((name) => !emittable.has(name));
  assert.deepEqual(
    missing, [],
    `the generator can no longer emit ${missing.length} of the names the product owner signed off on: ${missing.join(', ')}`,
  );
  for (const name of ICONIC) {
    assert.ok(name.length <= MAX_NAME_LENGTH, `'${name}' is ${name.length} characters`);
    assert.ok(normaliseName(name), `the server would reject the signed-off name '${name}'`);
  }
  console.log(`  all ${ICONIC.length} signed-off names emittable, longest '${ICONIC.reduce((a, b) => (b.length > a.length ? b : a))}'.`);

  // ...and the bland padding the owner cut stays cut. This is a taste rule, so
  // nothing else will ever catch a well-meaning re-add.
  const CUT = ['Golden', 'Harvest', 'Muffin', 'Sprinkle', 'Bandit', 'Buffet', 'Pyramid',
    'Champ', 'Legend', 'Genius', 'Beret', 'Steak', 'Yogurt', 'Combo'];
  const readded = CUT.filter((word) => MODIFIERS.includes(word) || SUBJECTS.includes(word));
  assert.deepEqual(readded, [], `bland filler the product owner cut is back in the vocabulary: ${readded.join(', ')}`);
}

// ===========================================================================
// Every word, screened on its own
// ===========================================================================

console.log('\n--- every word independently survives blocked() ---');
{
  for (const [label, list] of [['modifier', MODIFIERS], ['subject', SUBJECTS]]) {
    for (const word of list) {
      assert.match(word, /^[A-Za-z][A-Za-z0-9]*$/, `${label} '${word}' is not a plain alphanumeric word`);
      assert.equal(word.normalize('NFKC'), word, `${label} '${word}' changes under NFKC`);
      assert.equal(
        blockedOffline(nameKey(word)), false,
        `${label} '${word}' folds to '${nameKey(word)}', which the server's blocked() rejects`,
      );
      // Every word must reach the emittable set through at least one partner.
      // A word too long to pair with anything is dead weight that inflates the
      // list sizes this suite floors, without adding a single name.
      assert.ok(
        VALID_PAIRS.some((pair) => pair[label === 'modifier' ? 0 : 1] === word),
        `${label} '${word}' pairs with nothing — it can never be emitted`,
      );
    }
  }
  console.log(`  ${MODIFIERS.length + SUBJECTS.length} words clean, all reachable.`);
}

// ===========================================================================
// Every emittable name, exhaustively — not sampled
// ===========================================================================

console.log('\n--- every emittable name is one the server would accept ---');
{
  let checked = 0;
  const keys = new Set();
  for (const pair of VALID_PAIRS) {
    const name = pairName(pair);
    assert.equal(name.normalize('NFKC'), name, `'${name}' changes under NFKC`);
    assert.ok(name.length >= 3 && name.length <= MAX_NAME_LENGTH, `'${name}' is ${name.length} characters`);
    assert.match(name, NAME_PATTERN, `'${name}' fails the server character pattern`);

    // The real gate, not a paraphrase of it: normaliseName is what the handler
    // calls, and it must both accept the name and leave it byte-identical.
    const parsed = normaliseName(name);
    assert.ok(parsed, `normaliseName() rejected '${name}'`);
    assert.equal(parsed.name, name, `normaliseName() rewrote '${name}' to '${parsed.name}'`);
    assert.equal(parsed.key, nameKey(name), `nameKey() disagrees with the server's fold for '${name}'`);

    // The seam. Two clean words can still join into a blocked substring once
    // the space is stripped, which is why this loop exists at all.
    assert.equal(blockedOffline(parsed.key), false, `'${name}' folds to '${parsed.key}', which blocked() rejects`);
    keys.add(parsed.key);
    checked++;
  }
  assert.equal(checked, combinationCount(), 'the sweep did not visit the whole valid set');
  console.log(`  ${checked} names checked, ${keys.size} distinct leet-folded keys.`);
}

// ===========================================================================
// The discriminator path, at the ceiling
// ===========================================================================

console.log('\n--- the collision discriminator still fits inside 16 characters ---');
{
  const worst = VALID_PAIRS.map(pairName).reduce((a, b) => (b.length > a.length ? b : a));
  assert.equal(worst.length, MAX_NAME_LENGTH, 'the worst-case base name is not at the ceiling');

  assert.ok(MAX_DISCRIMINATOR >= 999, `MAX_DISCRIMINATOR is ${MAX_DISCRIMINATOR} — too few retries to escape a collision`);
  const ceiling = withDiscriminator(worst, MAX_DISCRIMINATOR);
  assert.ok(ceiling.length <= MAX_NAME_LENGTH, `'${ceiling}' is ${ceiling.length} characters at the ceiling`);
  assert.ok(ceiling.endsWith(String(MAX_DISCRIMINATOR)), `'${ceiling}' lost its discriminator to truncation`);
  assert.ok(normaliseName(ceiling), `the server rejects the worst-case discriminated name '${ceiling}'`);
  console.log(`  '${worst}' + ${MAX_DISCRIMINATOR} -> '${ceiling}' (${ceiling.length}).`);

  // ...and for EVERY emittable base, across the discriminator range, including
  // the boundary where the suffix starts eating into the base.
  const range = [1, 7, 42, 999, MAX_DISCRIMINATOR];
  for (const n of range) {
    for (const pair of VALID_PAIRS) {
      const base = pairName(pair);
      const tagged = withDiscriminator(base, n);
      const parsed = normaliseName(tagged);
      assert.ok(parsed, `normaliseName() rejected the discriminated name '${tagged}'`);
      assert.equal(parsed.name, tagged, `normaliseName() rewrote '${tagged}'`);
      assert.equal(blockedOffline(parsed.key), false, `'${tagged}' folds to a blocked key`);
      assert.notEqual(tagged, base, `the discriminator did not change '${base}'`);
    }
  }
  console.log(`  ${combinationCount() * range.length} discriminated names checked.`);
}

// ===========================================================================
// The generator itself
// ===========================================================================

console.log('\n--- generateName() draws from the valid set only ---');
{
  const fixed = (value) => () => value;
  assert.equal(generateName(fixed(0)), pairName(VALID_PAIRS[0]), 'a zero random source did not land on the first valid pair');
  assert.equal(
    generateName(fixed(0.9999999)),
    pairName(VALID_PAIRS[VALID_PAIRS.length - 1]),
    'a near-one random source did not land on the last valid pair — the index is off by one or clamped wrong',
  );

  // A random source at exactly 1 (or above, or NaN) must not index off the end
  // and hand a player the string "undefined undefined".
  for (const rogue of [1, 1.5, -0.5, NaN]) {
    const name = generateName(() => rogue);
    assert.ok(normaliseName(name), `a random source returning ${rogue} produced the invalid name '${name}'`);
  }

  // The whole point of the filter: sweep the index space and prove nothing
  // over-length can come out, whatever the random source does.
  const emittable = new Set(VALID_PAIRS.map(pairName));
  for (let i = 0; i < VALID_PAIRS.length; i++) {
    const name = generateName(fixed(i / VALID_PAIRS.length));
    assert.ok(name.length <= MAX_NAME_LENGTH, `generateName() emitted '${name}' at ${name.length} characters`);
    assert.ok(emittable.has(name), `generateName() emitted '${name}', which is not in the valid pair set`);
  }

  // Deterministic: the same sequence in, the same name out, every time.
  const seq = () => { let i = 0; const v = [0.31, 0.77]; return () => v[i++ % v.length]; };
  assert.equal(generateName(seq()), generateName(seq()), 'the same random sequence produced two different names');

  // ...and different sequences reach different names, so it is not a constant.
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    let step = 0;
    seen.add(generateName(() => ((i * 7919 + step++ * 104729) % 10000) / 10000));
  }
  assert.ok(seen.size > 50, `200 different random sequences produced only ${seen.size} distinct names`);
  console.log(`  index space swept clean; 200 sequences -> ${seen.size} distinct names.`);
}

console.log('\n--- nameCandidates() gives the server a retry ladder ---');
{
  let step = 0;
  const rnd = () => ((step++ * 37) % 100) / 100;
  const list = nameCandidates(rnd, 6);
  assert.equal(list.length, 6, `asked for 6 candidates, got ${list.length}`);
  assert.equal(new Set(list.map(nameKey)).size, 6, 'the candidate ladder contains a leet-folded collision with itself');
  for (const candidate of list) {
    const parsed = normaliseName(candidate);
    assert.ok(parsed, `nameCandidates() produced the invalid name '${candidate}'`);
    assert.equal(blockedOffline(parsed.key), false, `nameCandidates() produced the blocked name '${candidate}'`);
  }
  // The first rung must be the clean, undecorated name — a player should only
  // see digits after an actual collision.
  assert.match(list[0], /^[A-Za-z]+ [A-Za-z]+$/, `the first candidate '${list[0]}' already carries a discriminator`);
  console.log(`  ladder: ${list.join(', ')}`);
}

console.log('\n--- the shared data file and the client module are one list ---');
{
  // js/board/names.js holds the lists as a JS literal (a browser with no build
  // step cannot be relied on to import JSON), and api/data/parks-names.json is
  // the copy the server reads. This is the guard that keeps them identical.
  const data = JSON.parse(src('../api/data/parks-names.json'));
  assert.deepEqual(data.modifiers, MODIFIERS, 'api/data/parks-names.json modifiers have drifted from js/board/names.js');
  assert.deepEqual(data.subjects, SUBJECTS, 'api/data/parks-names.json subjects have drifted from js/board/names.js');
  assert.equal(data.maxNameLength, MAX_NAME_LENGTH, 'the data file advertises a different length cap');
  assert.equal(data.maxDiscriminator, MAX_DISCRIMINATOR, 'the data file advertises a different discriminator ceiling');
  // The server must apply the same filter, so the rule has to travel with the
  // data rather than living only in the client module.
  assert.equal(data.validPairCount, VALID_PAIRS.length, 'the data file advertises a different valid pair count — the server would build a different set');
}

console.log('\ngenerated names: all assertions passed.');
