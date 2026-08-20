// ONE probe, TWO subjects: the lane-offset modulus idiom used by every scene
// that lays a multi-lane apron in a repeating palette.
//
// WHY THIS IS A SHARED MODULE AND NOT A COPY. The idiom travels by copy-paste —
// it was written for Auckland's rip-rap and copied into Singapore's promenade
// apron — so a probe that also travels by copy-paste rots the same way the code
// did. This repo has the receipt: the economy coin ladder was asserted in two
// places, one copy was retired when the model changed and the other was not, and
// the stale copy kept passing against a model nothing used any more. A probe
// with two call sites and one implementation cannot drift against itself.
//
// WHAT THE IDIOM IS. An apron is laid lane by lane, and each stone picks its
// colour from a repeating positional pattern:
//
//     const t = (((Math.round(x * 2) + lane * K) % M) + M) % M;
//     B(x, 0, z, 'concrete', 0.5, t === 0 ? A : t === 1 ? B : C);
//
// Two things are load-bearing, and BOTH shipped wrong in this repo.
//
//   1. K MUST BE COPRIME TO M. It was `lane * 3` against `% 3`, which is
//      identically 0 — the term cancels, every lane gets the same sequence, and
//      the apron renders as corduroy stripes running perpendicular to the shore
//      instead of as scattered rock. A no-op that looks like a working feature.
//
//   2. THE RESULT MUST BE FLOORED INTO RANGE. JavaScript's % keeps the sign of
//      the DIVIDEND, so `-2 % 3` is -2, not 1. Both aprons span negative x, and
//      the ternary sends every negative index down its fallthrough arm to the
//      last colour. Over negative x the palette collapses. On Auckland this was
//      not subtle: all 21 of its stones sit at negative x, the split was 14/7/0
//      and the MIDDLE GREY NEVER RENDERED AT ALL. A third of the palette was
//      dead on the shipped map.
//
// WHY THE OBVIOUS PROBE CANNOT SEE ANY OF THIS. Only the colour ARGUMENT
// changes: block count, mass, placement step, cell ownership and camera blockers
// are all bit-identical either way. Every existing gate stays green. The scene
// fingerprint does move, because it hashes b.color — but nothing stores an
// expected fingerprint, so nothing was checking it.
//
// WHY IT IS CHECKED IN TWO PLACES AT ONCE, expression AND built scene:
//
//   - THE EXPRESSION half is source-extracted and evaluated. It has to be,
//     because the corduroy defect is UNTESTABLE THROUGH SOME BUILT SCENES:
//     Auckland's close-out places its 21 stones in a single lane, and with one
//     lane there is no such thing as variation between lanes. A probe asking the
//     built scene for it demands a difference the geometry forbids and fails
//     identically on correct and incorrect code. The property lives in the
//     expression, so that is where it is asserted.
//   - THE DISTRIBUTION half reads the built blocks' actual colours. It catches
//     what the expression half cannot: an expression that is in range and does
//     vary by lane, but is lopsided over the domain the scene actually covers.
//
// Everything the probe samples is DERIVED FROM THE BUILT SCENE — the x values,
// the lane count and the modulus all come from the placed blocks and the
// declared palette, never from bounds retyped into this file. Retyping the
// placement loop's bounds here would be a second copy of the geometry, and a
// second copy is the defect this module exists to avoid.

// Balance floor for the distribution half: the least-used colour must be at
// least this fraction of the most-used one.
//
// CHOSEN AGAINST BOTH SIDES BEFORE BEING WRITTEN DOWN, because a threshold
// picked after seeing only one arm is fitted to it and separates nothing.
// Measured on Singapore's 1,241 stones: the broken expression gives 416/304/521,
// min/max = 0.583; the fixed one gives 416/415/410, min/max = 0.986. 0.75 sits
// between with 0.17 of margin below and 0.24 above, so it is not riding on
// either measurement's last digit. Auckland is 0.0 broken and 1.0 fixed.
const BALANCE = 0.75;

// Below this many stones an even split is not ACHIEVABLE, so the balance gate
// would fail correct code by construction — 7 stones can only ever go 3/2/2,
// which is 0.667 and under the floor through no fault of the expression. A
// threshold derived from the population must never make a small population
// illegal, so small aprons get the weaker "every colour is present" check and
// the balance gate is skipped and SAID to be skipped. 12 is the first count at
// which an even split exists for a 3-colour palette (4/4/4).
const MIN_BALANCE_N = 12;

/**
 * @param {object} spec
 * @param {string} spec.scene    scene name, for failure messages
 * @param {URL}    spec.fileUrl  the scene source, for expression extraction
 * @param {string} spec.marker   section comment the `const t =` line follows
 * @param {number[]} spec.greys  the palette, in ternary order (index 0,1,2...)
 * @param {object} spec.sim      the built scene
 * @param {(msg: string) => void} spec.fail  the orchestrator's failure sink
 * @param {(path: string, enc: string) => string} spec.readFile
 */
export function probeLaneModulus(spec) {
  const { scene, fileUrl, marker, greys, sim, fail, readFile } = spec;
  const M = greys.length;              // the modulus IS the palette size
  const palette = new Set(greys);

  // The apron: the half-metre ground course painted in the declared palette.
  const apron = sim.blocks.filter((b) => b.gy === 0 && b.sx === 0.5 && palette.has(b.color));
  if (apron.length === 0) {
    fail(`${scene}: no apron blocks found in the declared palette [${greys.map((g) => `0x${g.toString(16)}`).join(', ')}] — the close-out course did not run, or its colours changed without this probe being updated`);
    return;
  }

  // ---- EXPRESSION HALF ------------------------------------------------------
  const src = readFile(fileUrl, 'utf8');
  const at = src.indexOf(marker);
  const expr = at < 0 ? null : /const t = ([^;]+);/.exec(src.slice(at))?.[1];

  // The extraction asserts its own sanity. A positional slice that silently
  // grabs the wrong text reports a phantom logic failure instead of an honest
  // "I could not find it" — sfx-event-guard is doing exactly that in this repo
  // right now, capturing a nested arm of js/main.js and reporting fifteen audio
  // regressions that do not exist.
  if (!expr) {
    fail(`${scene}: could not extract the apron colour expression — the section marker '${marker}' or its \`const t =\` line moved, and this probe is now INERT rather than failing`);
  } else if (!/\bx\b/.test(expr) || !/\blane\b/.test(expr)) {
    fail(`${scene}: the apron colour expression \`${expr}\` does not mention both x and lane — extraction grabbed the wrong statement, or the pattern lost an input`);
  } else {
    const t = new Function('x', 'lane', `return ${expr};`);

    // Sampled over the domain the scene ACTUALLY covers, recovered from the
    // placed stones rather than retyped: x is the block centre and the loop's x
    // is the min corner, so the half-extent comes back off. Lane indices are
    // taken as 0..rows-1 from the count of distinct z rows; the offset property
    // holds for any run of consecutive lanes, so the row-to-lane mapping (which
    // differs between scenes, and within Auckland between its two aprons) never
    // has to be reconstructed.
    const xs = [...new Set(apron.map((b) => +(b.x - b.sx / 2).toFixed(3)))].sort((a, b) => a - b);
    const rows = new Set(apron.map((b) => +(b.z - b.sz / 2).toFixed(3))).size;
    const lanes = Math.max(rows, 2);   // the offset property needs >= 2 lanes to mean anything

    // P1 — the index must be a PROPER modulus result in [0, M). Anything
    // negative falls through the colour ternary onto its last arm.
    const bad = [];
    for (let lane = 0; lane < lanes; lane++) {
      for (const x of xs) {
        const v = t(x, lane);
        if (!Number.isInteger(v) || v < 0 || v >= M) bad.push(`t(${x},${lane})=${v}`);
      }
    }
    if (bad.length) {
      fail(`${scene}: the apron colour expression \`${expr}\` returns ${bad.length} out-of-range indices over the scene's own domain (x ${xs[0]}..${xs[xs.length - 1]}, ${lanes} lanes), such as ${bad.slice(0, 3).join(', ')} — JS % keeps the dividend's sign, so every negative index falls through the colour ternary onto the last colour and the palette collapses over negative x. Floor it: ((v % ${M}) + ${M}) % ${M}`);
    }

    // P2 — the per-lane offset must actually offset. Sampled over NON-NEGATIVE
    // x only, and that restriction is the whole point: over negative x a broken
    // expression DOES vary between lanes, as the sign of the remainder flips.
    // That is an artifact of the P1 defect, not the pattern working, and an
    // earlier version of this probe passed on broken code because of it.
    // Restricting to x >= 0 isolates the offset, and there a multiple-of-the-
    // modulus term is exactly identical for every lane.
    // P2 IS SAMPLED SYNTHETICALLY, NOT OVER THE SCENE'S OWN DOMAIN, and that
    // difference from P1 is deliberate and was found the hard way. Deriving the
    // sample points from the built stones — which is right for P1, because it
    // makes the failure quote indices that really occur — made this check
    // UNDECIDABLE for Auckland, whose 21 stones are all at negative x. Auckland
    // is the scene the corduroy defect actually shipped in. A domain-derived
    // sample is an exclusion zone, and the defect was sitting inside it: the
    // refactor to a shared probe reported Auckland clean at HEAD on the exact
    // fault its inline predecessor had caught.
    //
    // So the offset is asserted as a property of the IDIOM, over a fixed
    // non-negative sweep, independent of where this scene's stones happen to
    // sit today. That is the correct scope: `lane * 3` is wrong wherever it is
    // written, and an apron that currently spans only negative x is one edit
    // away from spanning positive x with corduroy nobody re-checked.
    let differs = false;
    for (let x = 0; x <= 64 && !differs; x += 0.5) {
      for (let lane = 1; lane < Math.max(lanes, M + 1) && !differs; lane++) {
        if (t(x, lane) !== t(x, 0)) differs = true;
      }
    }
    if (!differs) {
      fail(`${scene}: the apron colour expression \`${expr}\` gives every lane the SAME colour at every non-negative x — the per-lane term is a multiple of the modulus ${M} and cancels, so an apron more than one lane deep renders as corduroy stripes running perpendicular to the shore instead of scattered rock. Use a multiplier coprime to ${M}`);
    }
  }

  // ---- DISTRIBUTION HALF ----------------------------------------------------
  // What actually shipped, read off the built blocks. This is the half that
  // catches an expression which is in range and does vary by lane but is
  // lopsided over the domain this particular scene covers.
  const counts = greys.map((g) => apron.filter((b) => b.color === g).length);
  const used = counts.filter((c) => c > 0).length;
  const shape = counts.map((c, i) => `0x${greys[i].toString(16)}=${c}`).join(' ');

  if (used < 2) {
    fail(`${scene}: all ${apron.length} apron stones are one colour (${shape}) — the apron reads as a painted strip`);
  } else if (used < M) {
    fail(`${scene}: the apron uses only ${used} of its ${M} declared colours (${shape}) — ${M - used} of the palette never renders, which is what a sign-collapsed modulus looks like from the outside`);
  } else if (apron.length < MIN_BALANCE_N) {
    console.log(`  ${scene} apron: ${apron.length} stones, ${shape} — balance gate skipped, an even split needs at least ${MIN_BALANCE_N}`);
  } else {
    const mn = Math.min(...counts), mx = Math.max(...counts);
    const ratio = mn / mx;
    if (ratio < BALANCE) {
      fail(`${scene}: the apron's colours are lopsided — ${shape} over ${apron.length} stones, least/most = ${ratio.toFixed(3)}, floor ${BALANCE} (an even split would be ${(apron.length / M).toFixed(1)} each). The pattern is in range and varies by lane but does not cover the domain evenly`);
    }
  }
}
