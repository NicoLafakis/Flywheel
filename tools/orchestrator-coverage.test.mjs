// tools/orchestrator-coverage.test.mjs — guards the validator's own orchestrator.
// Run: node tools/orchestrator-coverage.test.mjs [path-to-validate.mjs]
//
// A bare `node tools/validate.mjs` does NOT run sections directly: it spawns one
// child per entry in the orchestrator's `groups` array with
// FW_VALIDATE_SECTIONS=<group>. So a section registered with section('name', fn)
// but absent from that array is a gate that only ever fires when a human names
// it by hand — the full run silently skips it, and still prints ALL PASS.
//
// That has now happened seven times (tutorialOnboarding, mobileCameraClarity,
// mobileUiResponsive, deviceDetection, mobileZoomControls — all found dormant
// 2026-08-19 — and singapore, found the same day). Adding the missing name only
// closes the current instance; this guard closes the CLASS, by asserting the two
// sets are equal in both directions. The reverse direction matters too: a name
// in `groups` that no section registers is a child that runs nothing, which is
// the same silent hole wearing the opposite costume.
//
// Text extraction rather than importing validate.mjs: importing it executes the
// whole validator (there is no export seam), and the orchestrator branch is a
// top-level `if` that spawns children. The two sets live in source text, so the
// source text is what this reads.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_VALIDATOR = fileURLToPath(new URL('./validate.mjs', import.meta.url));

// `section('name',` at a call site. The declaration is `const section = (name, fn)`
// so it cannot match, and no regex in this file contains a literal `section('`
// (the paren is escaped there), so this file's own text cannot pollute a scan of
// it either.
export function registeredSections(src) {
  return [...src.matchAll(/\bsection\('([\w]+)'\s*,/g)].map((m) => m[1]);
}

// Every section name reachable from the orchestrator: the second string of each
// ['label', 'a,b,c'] row of the `groups` array, comma-split. Scoped to the array
// body so unrelated pair-of-strings arrays elsewhere in the file cannot leak in.
export function orchestratedSections(src) {
  const start = src.indexOf('const groups = [');
  assert(start !== -1, 'could not find `const groups = [` in the validator source');
  const end = src.indexOf('\n  ];', start);
  assert(end !== -1, 'could not find the end of the `groups` array');
  const body = src.slice(start, end);
  const names = [];
  for (const m of body.matchAll(/\[\s*'[^']*'\s*,\s*'([^']*)'\s*\]/g)) {
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) names.push(name);
  }
  return names;
}

export function runOrchestratorCoverageSelftest(validatorPath = DEFAULT_VALIDATOR) {
  let passed = 0;
  const test = (name, fn) => {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`  x ${name}`);
      throw err;
    }
  };

  const src = readFileSync(validatorPath, 'utf8');
  const registered = registeredSections(src);
  const orchestrated = orchestratedSections(src);

  // Both extractions must find real names before any set comparison is worth
  // anything: two empty sets are equal, so a regex that silently stopped
  // matching would turn this guard green forever. It has to be impossible for
  // this file to pass vacuously.
  test('the registered-section scan finds a non-trivial set of names', () => {
    assert(registered.length >= 20, `expected >= 20 section('name') registrations, found ${registered.length}`);
    assert(registered.includes('syntaxCheck'), 'expected syntaxCheck among the registered sections');
  });
  test('the orchestrator-groups scan finds a non-trivial set of names', () => {
    assert(orchestrated.length >= 20, `expected >= 20 names in the groups array, found ${orchestrated.length}`);
    assert(orchestrated.includes('cambridge'), 'expected cambridge among the orchestrated sections');
  });
  test('neither scan reports a duplicate name', () => {
    const dupes = (list) => list.filter((n, i) => list.indexOf(n) !== i);
    assert.deepStrictEqual(dupes(registered), [], 'a section name is registered twice');
    assert.deepStrictEqual(dupes(orchestrated), [], 'a section name appears twice in the groups array');
  });

  const regSet = new Set(registered);
  const orcSet = new Set(orchestrated);

  test('every registered section is run by the orchestrator', () => {
    const dormant = registered.filter((n) => !orcSet.has(n));
    assert.deepStrictEqual(
      dormant, [],
      `section(s) registered but absent from the orchestrator \`groups\` array, so a bare `
      + `\`node tools/validate.mjs\` never runs them: ${dormant.join(', ')}`,
    );
  });
  test('every orchestrated name is a registered section', () => {
    const phantom = orchestrated.filter((n) => !regSet.has(n));
    assert.deepStrictEqual(
      phantom, [],
      `name(s) in the orchestrator \`groups\` array with no matching section() registration, `
      + `so their child process runs nothing: ${phantom.join(', ')}`,
    );
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('orchestrator-coverage.test.mjs')) {
  const target = process.argv[2] || DEFAULT_VALIDATOR;
  console.log('--- Validating validator orchestrator coverage ---');
  console.log(`  target: ${target}`);
  const src = readFileSync(target, 'utf8');
  console.log(`  registered sections: ${registeredSections(src).length}`);
  console.log(`  orchestrated names:  ${orchestratedSections(src).length}`);
  const count = runOrchestratorCoverageSelftest(target);
  console.log(`\nALL PASS. ${count} orchestrator coverage tests passing cleanly!`);
}
