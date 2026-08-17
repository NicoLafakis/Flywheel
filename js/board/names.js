// Automatic player names, so nobody is anonymous.
//
// A run with no name is never published to a board, which made every guest
// invisible. This module hands each arriving player a Parks-and-Recreation joke
// name immediately — no signup, no typing, works offline.
//
// WHY THE LISTS LIVE HERE AND NOT IN THE JSON FILE
// `api/data/parks-names.json` is the copy the server reads, and it is the shared
// specification both halves are built against. The browser reads THIS literal
// instead, because there is no build step in this repo: a client-side JSON
// module import needs `with { type: 'json' }`, which is still not safe to assume
// across the browsers this game targets, and a `fetch()` would make name
// generation async and network-dependent for something that must work fully
// offline (invariant 10). So the lists are a plain JS literal any browser
// parses, and `tools/names.test.mjs` asserts the JSON file is deep-equal to it —
// the two cannot drift.
//
// FILTER THE PAIRS, NOT THE VOCABULARY
// `normaliseName()` in api/_lib.mjs caps a name at 16 characters. The obvious
// reading of that — "cap the words so every possible pair fits" — is STRICTER
// than the requirement and it is expensive: it forces `Sebastian` (9) down to a
// stub purely so it will not collide with `Eagleton` (8), a pairing nothing ever
// needed to emit. The requirement is only that every name the generator EMITS is
// valid.
//
// So the cross product is filtered ONCE at module load into `VALID_PAIRS`, and
// `generateName()` draws uniformly from that set. Two consequences worth naming:
// an over-length name is unreachable by construction rather than by a check at
// the call site, and there is no rejection-retry loop — a name costs one draw,
// always, which matters because this runs on the boot path of every session.
// The trade is that the draw is uniform over PAIRS, not over words: a short
// modifier appears slightly more often than a long one because it has more
// partners. That is the right bias — it favours the names that fit.
//
// Words are also screened against the server's `blocked()`, which matches by
// SUBSTRING over a leet-folded, space-stripped key. That means the seam where a
// modifier meets a subject can produce a banned substring neither word contains,
// so the test sweeps every emittable pair, not just the two lists.

export const MAX_NAME_LENGTH = 16;

// Highest numeric tag `withDiscriminator` will append. Four digits leaves 12
// characters of base name at the ceiling and gives ~10k escapes per collision —
// far more headroom than the base pair set will ever need.
export const MAX_DISCRIMINATOR = 9999;

// The exact character class api/_lib.mjs `normaliseName()` enforces.
export const NAME_PATTERN = /^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/;

// Two registers, deliberately mixed. The show references are the joke for anyone
// who has seen Parks and Rec; the texture/attitude words and absurd concrete
// nouns are what make a result land for someone who has not. Bland filler is not
// welcome in either list — a name that is merely inoffensive is a wasted draw.
export const MODIFIERS = Object.freeze([
  // references
  'Meat', 'Duke', 'Waffle', 'Snake', 'Agent', 'Scotch', 'Lil', 'Bacon',
  'Sad', 'Turf', 'Mouse', 'Janet', 'Bert', 'Tammy', 'Calzone', 'Pawnee',
  'Eagleton', 'Treat', 'Swanson', 'Wamapoke', 'Perd', 'Sewage', 'Whiskey',
  // texture / attitude
  'Raccoon', 'Gravy', 'Nacho', 'Skate', 'Grumpy', 'Rowdy', 'Feisty', 'Chunky',
  'Velvet', 'Burly', 'Salty', 'Smug', 'Sweaty', 'Reckless', 'Humble', 'Sturdy',
  'Mustache', 'Bologna', 'Hoosier', 'Banjo', 'Greasy',
]);

export const SUBJECTS = Object.freeze([
  // references
  'Tornado', 'Silver', 'Baron', 'Juice', 'Macklin', 'Sebastian', 'Snakehole',
  'Hapley', 'Rat', 'Chief', 'Snob', 'Cones', 'Jerry', 'Ranger', 'Wagon',
  'Pit', 'Two', 'Knope', 'Ludgate', 'Dwyer', 'Meagle', 'Gergich', 'Traeger',
  'Wyatt', 'Swanson', 'Waffles', 'Mayor',
  // absurd concrete nouns
  'Gizzard', 'Possum', 'Nugget', 'Pickle', 'Menace', 'Goblin', 'Otter',
  'Raccoon', 'Meatloaf', 'Casserole', 'Dumpster', 'Trombone', 'Burrito',
  'Sundae', 'Deputy', 'Intern', 'Rascal', 'Gremlin', 'Noodle',
  // Signed off by name in the owner's chosen tone sample ("Chunky Wizard",
  // "Rowdy Bagel"), which is why these two are not filler despite reading like
  // it out of context. Both pairings are pinned in tools/names.test.mjs.
  'Wizard', 'Bagel',
]);

/**
 * Every pairing short enough for the server to accept, built once at load.
 * This is the ONLY set `generateName` draws from, which is what makes an
 * over-length name unreachable rather than merely unlikely.
 */
export const VALID_PAIRS = Object.freeze(
  MODIFIERS.flatMap((modifier) => SUBJECTS
    .filter((subject) => modifier.length + 1 + subject.length <= MAX_NAME_LENGTH)
    .map((subject) => Object.freeze([modifier, subject]))),
);

export function combinationCount() { return VALID_PAIRS.length; }

/** The server's de-duplication fold, reproduced exactly: leet digits collapse to
 *  their letters and everything else non-alphanumeric is stripped, so
 *  `Sn4ke Juice` and `Snake Juice` are one name. Kept in step with
 *  `normaliseName()` by an assertion in tools/names.test.mjs. */
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's' };
export function nameKey(name) {
  return String(name).toLowerCase().replace(/[01345]/g, (char) => LEET[char]).replace(/[^a-z0-9]/g, '');
}

/** A hostile or broken random source must never index off the end of the pair
 *  set and hand a real player the string "undefined undefined". */
function unit(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value >= 1 ? 0.999999999 : value;
}

/** The browser's non-reproducible entropy source. Deliberately NOT `rng.js`:
 *  that is the seeded world generator, and a player's name must not be
 *  derivable from a world seed. Matches `deviceKey()` in js/board/player.js.
 *  The server injects `node:crypto` randomness instead. */
export function cryptoRandom() {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
}

/**
 * One name, e.g. "Lil Sebastian". `randomFn` returns a float in [0, 1); it is
 * injectable so the server can supply `node:crypto` and tests can be exact.
 * One draw, from the valid pair set — never from the raw cross product.
 */
export function generateName(randomFn = cryptoRandom) {
  const [modifier, subject] = VALID_PAIRS[Math.floor(unit(randomFn()) * VALID_PAIRS.length)];
  return `${modifier} ${subject}`;
}

/**
 * Collision escape: append a numeric tag, trimming the base from the right so
 * the total still fits in 16 characters. Trailing separators are stripped after
 * the cut so a truncation can never leave "Janet Snakeh " or a dangling hyphen,
 * both of which the server's character class rejects.
 */
export function withDiscriminator(base, discriminator) {
  const suffix = String(Math.max(1, Math.min(MAX_DISCRIMINATOR, Math.floor(discriminator) || 1)));
  const head = String(base).slice(0, MAX_NAME_LENGTH - suffix.length).replace(/[ _-]+$/, '');
  return `${head}${suffix}`;
}

/**
 * A retry ladder for the claim path: the first rung is the clean, undecorated
 * name (digits should only ever appear after a real collision), and each later
 * rung is a fresh pairing carrying a random tag. Returning a batch lets the
 * server resolve a taken name in one round trip instead of one request per try.
 */
export function nameCandidates(randomFn = cryptoRandom, count = 5) {
  const out = [];
  const seen = new Set();
  const limit = Math.max(1, Math.floor(count));
  for (let guard = 0; out.length < limit && guard < limit * 400; guard++) {
    const base = generateName(randomFn);
    const candidate = out.length === 0
      ? base
      : withDiscriminator(base, 1 + Math.floor(unit(randomFn()) * MAX_DISCRIMINATOR));
    const key = nameKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
