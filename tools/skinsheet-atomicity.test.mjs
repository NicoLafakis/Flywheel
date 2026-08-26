// tools/skinsheet-atomicity.test.mjs — RCA-2026-08-25: a red skinsheet run must
// leave docs/skins/ untouched. Run: node tools/skinsheet-atomicity.test.mjs
//
// HOW THIS EXECUTES THE SHIPPED CODE
// tools/skinsheet.mjs is top-level-await script code, not a library: it launches
// Playwright, clears docs/skins/ and writes into it. So this suite runs the REAL
// script text as a child process inside a sandbox under the OS temp dir:
//   - the script is copied to <sandbox>/tools/skinsheet.mjs, so its own
//     `join(dirname(script), '..', 'docs', 'skins')` resolves to a sandbox
//     docs/skins/ seeded with a committed sentinel file — the RED proof can
//     never dirty the repository's real docs/skins/;
//   - the script resolves Playwright from `process.env.APPDATA + '/npm/
//     node_modules/playwright/index.mjs'`, so pointing APPDATA at a fixture dir
//     substitutes a stub browser whose page.evaluate returns a bake handed in
//     via FW_TEST_BAKED. No GL, no server; the file/assertion pipeline under
//     test is the genuine shipped code, byte for byte.
//
// WHAT IT PROVES
//   A1  RED RUN IS ATOMIC. A bake that trips the byte-identical-tiles assertion
//       (two rows, same pixels — exactly the withdrawn-partner case in the RCA)
//       exits 1 AND leaves docs/skins/ byte-identical to its pre-run state: the
//       sentinel survives, no PNGs, no index.html. Before the fix the script
//       cleared the directory and wrote everything FIRST, so a red run shipped
//       regenerated files that an agent could (and did) commit while ignoring
//       the exit code.
//   A2  GREEN RUN STILL COMMITS. A bake with distinct tiles exits 0, writes
//       every row's PNG with the exact bytes the bake produced plus index.html,
//       and still clears stale files (the sentinel is gone) — atomicity must
//       not cost the existing deleted-row hygiene.
//   A3  NO STAGING RESIDUE. Neither run leaves any file or directory outside
//       docs/skins/ in the sandbox docs/ tree (a temp/staging area must clean
//       up after itself on both exits).
//   A4  DESIGNED WITHDRAWAL IS LEGAL. A withdrawn partner row (per
//       WITHDRAWN_PARTNER_SKIN_IDS in js/skinapproval.js) baking byte-identical
//       to classic is the approval gate WORKING, so that bake goes green — an
//       honest full re-bake must be able to pass. Any OTHER identical pair
//       stays red (A1 covers that arm).
//   A5  THE CHECK STAYS ARMED. A withdrawn row baking its OWN pixels means the
//       gate failed open: red, and still atomic.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SANDBOX = join(tmpdir(), `fw-skinsheet-atomicity-${process.pid}`);
rmSync(SANDBOX, { recursive: true, force: true });

// The stub Playwright the script imports via APPDATA. `page.evaluate` ignores
// the passed function (that half needs a browser and is not under test here)
// and returns the bake this suite injects through FW_TEST_BAKED.
const FAKE_APPDATA = join(SANDBOX, 'appdata');
mkdirSync(join(FAKE_APPDATA, 'npm', 'node_modules', 'playwright'), { recursive: true });
writeFileSync(join(FAKE_APPDATA, 'npm', 'node_modules', 'playwright', 'index.mjs'), `
export const chromium = {
  async launch() {
    return {
      async newPage() {
        return {
          on() {},
          async goto() {},
          async evaluate() { return JSON.parse(process.env.FW_TEST_BAKED); },
        };
      },
      async close() {},
    };
  },
};
`);

const row = (id, family = 'core') => ({
  id, name: id.toUpperCase(), price: 0, family,
  blurb: `${id} blurb`, css: '', color: '#00ff00', accent: null, markPath: null,
});
// Valid base64 payloads; SAME for the red case (trips the duplicate assertion,
// the RCA's exact failure), DIFFERENT for the green case.
const PIX_A = 'data:image/png;base64,' + Buffer.from('pixels-of-a').toString('base64');
const PIX_B = 'data:image/png;base64,' + Buffer.from('pixels-of-b').toString('base64');

const SENTINEL = 'committed bytes that a red run must not disturb';

const runScript = (baked) => {
  // Fresh sandbox tree per run: the real script under tools/, a docs/skins/
  // holding only the committed sentinel.
  const skins = join(SANDBOX, 'docs', 'skins');
  rmSync(join(SANDBOX, 'docs'), { recursive: true, force: true });
  rmSync(join(SANDBOX, 'tools'), { recursive: true, force: true });
  mkdirSync(skins, { recursive: true });
  mkdirSync(join(SANDBOX, 'tools'), { recursive: true });
  writeFileSync(join(skins, 'sentinel.png'), SENTINEL);
  cpSync(here('tools/skinsheet.mjs'), join(SANDBOX, 'tools', 'skinsheet.mjs'));
  // The script imports the withdrawal roster from ../js/skinapproval.js (the
  // same source of truth the game resolves against), so the sandbox carries the
  // real file at the same relative position.
  mkdirSync(join(SANDBOX, 'js'), { recursive: true });
  cpSync(here('js/skinapproval.js'), join(SANDBOX, 'js', 'skinapproval.js'));
  // The sandbox is outside any package.json scope; without this Node warns on
  // every ESM parse of the copied module.
  writeFileSync(join(SANDBOX, 'package.json'), '{"type":"module"}');

  let status = 0, stdout = '', stderr = '';
  try {
    stdout = execFileSync(process.execPath, [join(SANDBOX, 'tools', 'skinsheet.mjs'), 'http://test.invalid'], {
      env: { ...process.env, APPDATA: FAKE_APPDATA, FW_TEST_BAKED: JSON.stringify(baked) },
      encoding: 'utf8',
    });
  } catch (e) {
    status = e.status ?? -1;
    stdout = e.stdout ?? '';
    stderr = e.stderr ?? '';
  }
  return { status, stdout, stderr, skins };
};

// --- A1: red run is atomic ---------------------------------------------------
{
  const baked = {
    rows: [row('a'), row('b')],
    thumbs: { a: PIX_A, b: PIX_A }, // byte-identical — the withdrawn-partner case
    note: null,
  };
  const { status, stderr, skins } = runScript(baked);
  assert.equal(status, 1, `duplicate tiles must exit 1 (got ${status})\n${stderr}`);
  assert.match(stderr, /byte-identical tiles/, 'the duplicate assertion must be the thing that fired');
  const left = readdirSync(skins).sort();
  assert.deepEqual(left, ['sentinel.png'],
    `A1 FAIL: a red run must leave docs/skins/ untouched, found: ${left.join(', ')}`);
  assert.equal(readFileSync(join(skins, 'sentinel.png'), 'utf8'), SENTINEL,
    'A1 FAIL: the committed sentinel was rewritten by a red run');
  assert.deepEqual(readdirSync(join(SANDBOX, 'docs')).sort(), ['skins'],
    'A3 FAIL: red run left residue beside docs/skins/');
  console.log('A1 PASS: red run exited 1 and left docs/skins/ byte-identical');
}

// --- A2: green run still commits (and still clears stale files) --------------
{
  const baked = {
    rows: [row('a'), row('b')],
    thumbs: { a: PIX_A, b: PIX_B },
    note: null,
  };
  const { status, stdout, stderr, skins } = runScript(baked);
  assert.equal(status, 0, `distinct tiles must exit 0 (got ${status})\n${stderr}\n${stdout}`);
  const left = readdirSync(skins).sort();
  assert.deepEqual(left, ['a.png', 'b.png', 'index.html'],
    `A2 FAIL: green run must commit tiles + sheet and clear stale files, found: ${left.join(', ')}`);
  assert.equal(readFileSync(join(skins, 'a.png'), 'utf8'), 'pixels-of-a',
    'A2 FAIL: committed PNG bytes must be exactly what the bake produced');
  assert.match(readFileSync(join(skins, 'index.html'), 'utf8'), /Flywheel skins/,
    'A2 FAIL: index.html must be the contact sheet');
  assert.deepEqual(readdirSync(join(SANDBOX, 'docs')).sort(), ['skins'],
    'A3 FAIL: green run left residue beside docs/skins/');
  console.log('A2 PASS: green run committed the tiles, the sheet, and cleared the stale sentinel');
}

// --- A4: a designed withdrawal is legal ---------------------------------------
// RCA-2026-08-25 item 1: withdrawn partner rows rendering byte-identical to
// classic is the approval gate WORKING (js/skinapproval.js resolves them to
// 'classic', fail closed), so an honest full re-bake must be able to go green.
// The roster comes from WITHDRAWN_PARTNER_SKIN_IDS — the same source of truth
// the game resolves against — never a copied list.
{
  const baked = {
    rows: [row('classic'), row('partner-huble', 'partner'), row('b')],
    thumbs: { classic: PIX_A, 'partner-huble': PIX_A, b: PIX_B },
    note: null,
  };
  const { status, stdout, stderr, skins } = runScript(baked);
  assert.equal(status, 0,
    `A4 FAIL: a withdrawn partner tile identical to classic is the gate working and must be green (got exit ${status})\n${stderr}\n${stdout}`);
  const left = readdirSync(skins).sort();
  assert.deepEqual(left, ['b.png', 'classic.png', 'index.html', 'partner-huble.png'],
    `A4 FAIL: green run must commit all tiles, found: ${left.join(', ')}`);
  console.log('A4 PASS: withdrawn-partner-identical-to-classic re-bake goes green');
}

// --- A5: a withdrawn row NOT matching classic is red --------------------------
// The check stays armed in the other direction: if a withdrawn row bakes its
// own pixels, the approval gate is NOT working and the run must be red.
{
  const baked = {
    rows: [row('classic'), row('partner-huble', 'partner')],
    thumbs: { classic: PIX_A, 'partner-huble': PIX_B },
    note: null,
  };
  const { status, stderr, skins } = runScript(baked);
  assert.equal(status, 1,
    `A5 FAIL: a withdrawn partner row rendering its OWN pixels means the gate failed open and must exit 1 (got ${status})`);
  assert.match(stderr, /withdrawn/i, 'A5 FAIL: the failure must name the withdrawal check');
  assert.deepEqual(readdirSync(skins).sort(), ['sentinel.png'],
    'A5 FAIL: this red run must also leave docs/skins/ untouched');
  console.log('A5 PASS: a withdrawn row baking its own pixels is red (gate-armed check)');
}

rmSync(SANDBOX, { recursive: true, force: true });
console.log('ALL PASS');
