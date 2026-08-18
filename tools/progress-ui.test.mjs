// TDD guard for the player-facing surface of cloud progress sync (Phase C,
// tasks 12-14). Spawned by tools/validate.mjs section `progressUi`, because
// the copy module has to be imported (ESM, async) and the section runner is
// synchronous. Run alone: node tools/progress-ui.test.mjs
import { readFileSync } from 'node:fs';
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };

    const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
  const read = (rel) => { try { return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'); } catch { fail(`${rel} does not exist`); return ''; } };
  let copy;
  try { copy = await import('../js/ui/sync-copy.js'); } catch (e) { fail(`js/ui/sync-copy.js failed to import: ${e.message}`); process.exit(1); }
  const { SYNC_LABELS, syncIndicator, firstNoteText, trimmedNoticeText, shouldShowFirstNote, markFirstNoteShown } = copy;

  // Task 12: four states, one label each, matching syncStatus() names.
  const wantLabels = { synced: 'SYNCED', syncing: 'SYNCING…', offline: 'OFFLINE — WILL SYNC', 'signed-out': 'SIGNED OUT ELSEWHERE' };
  for (const [k, v] of Object.entries(wantLabels)) if (SYNC_LABELS[k] !== v) fail(`SYNC_LABELS.${k} is ${JSON.stringify(SYNC_LABELS[k])}, want ${JSON.stringify(v)}`);
  if (syncIndicator('idle') !== null) fail('syncIndicator("idle") must be null (nothing to show)');
  if (syncIndicator('nonsense') !== null) fail('syncIndicator(unknown) must be null');
  for (const k of Object.keys(wantLabels)) {
    const ind = syncIndicator(k);
    if (!ind || ind.label !== wantLabels[k] || ind.tone !== k) fail(`syncIndicator(${k}) must return {label, tone: '${k}'}`);
  }

  // Task 13: first-time note shows once, keyed on cloud.firstNoteShownAt.
  const save = { player: { name: 'Eagleton Sundae', nameSource: 'claimed' }, cloud: { firstNoteShownAt: null, lastPulledAt: 5, state: 'synced' } };
  if (!shouldShowFirstNote(save)) fail('first note must show after the first pull when firstNoteShownAt is null');
  markFirstNoteShown(save, 123);
  if (save.cloud.firstNoteShownAt !== 123) fail('markFirstNoteShown must stamp cloud.firstNoteShownAt');
  if (shouldShowFirstNote(save)) fail('first note must not show twice');
  if (shouldShowFirstNote({ player: { name: 'X', nameSource: 'auto' }, cloud: { firstNoteShownAt: null, lastPulledAt: 5 } })) fail('first note is for signed-in players only');
  if (shouldShowFirstNote({ player: { name: 'X', nameSource: 'claimed' }, cloud: { firstNoteShownAt: null, lastPulledAt: null } })) fail('first note waits for the first successful pull');
  if (shouldShowFirstNote({ player: { name: 'X', nameSource: 'claimed' } })) fail('first note tolerates a save with no cloud block');
  const note = firstNoteText('Eagleton Sundae');
  if (!/Eagleton Sundae/.test(note) || !/coins/i.test(note) || !/skins/i.test(note) || !/stars/i.test(note)) fail('first note must name the player and say coins, skins and stars follow the account');
  if (trimmedNoticeText([]) !== null) fail('no trimmed notice when nothing was trimmed');
  const tn = trimmedNoticeText(['skin:foo', 'coins']);
  if (typeof tn !== 'string' || !tn) fail('trimmed notice must be a string when the server trimmed');

  // Wiring: the plate + profile tab actually use the module, and no http://.
  const screens = read('js/ui/screens.js'), boards = read('js/ui/boards.js'), help = read('js/ui/help.js'), css = read('css/main.css');
  for (const [n, src] of [['screens.js', screens], ['boards.js', boards], ['help.js', help], ['sync-copy.js', read('js/ui/sync-copy.js')], ['main.css', css]]) {
    if (/http:\/\//.test(src)) fail(`${n} contains http:// (must be https:// or nothing)`);
  }
  if (!/syncIndicator\(/.test(stripComments(screens))) fail('screens.js name plate does not render the sync indicator');
  if (!/syncStatus\(/.test(stripComments(screens))) fail('screens.js does not read syncStatus');
  if (!/KEEP COINS, SKINS & STARS EVERYWHERE/.test(screens)) fail('screens.js plate note must invite sign-in for progress, not just the name');
  if (!/fw-sync-dot/.test(css)) fail('main.css has no .fw-sync-dot styling');
  for (const tone of ['synced', 'syncing', 'offline', 'signed-out']) if (!css.includes(`fw-sync--${tone}`)) fail(`main.css lacks .fw-sync--${tone}`);
  const b = stripComments(boards);
  for (const fn of ['syncIndicator', 'shouldShowFirstNote', 'markFirstNoteShown', 'firstNoteText', 'trimmedNoticeText', 'lastTrimmed', 'signOutPlayer']) {
    if (!new RegExp(`\\b${fn}\\b`).test(b)) fail(`boards.js profile tab does not use ${fn}`);
  }
  if (!/SIGN OUT/.test(boards)) fail('boards.js has no SIGN OUT button');
  if (!/signed-out/.test(b)) fail('boards.js has no signed-out-elsewhere state');
  if (/localStorage\.removeItem\(['"]fw-player['"]\)/.test(b)) fail('boards.js still hand-rolls sign-out instead of calling signOutPlayer');

  // Task 14, executable: lift the sign-out click handler and run it.
  const m = b.match(/signOutBtn\.onclick = async \(\) => \{([\s\S]*?)\n      \};/);
  if (!m) { fail('boards.js: could not find `signOutBtn.onclick = async () => {...}` to lift'); }
  else {
    const calls = [];
    const stubSave = { tag: 'the-save' };
    const fn = new Function('signOutPlayer', 'refresh', 'signOutBtn', 'signOutNote', 'save', 'window', 'setTimeout', `return (async () => {${m[1]}\n})();`);
    await fn(async (s) => { calls.push(['signOutPlayer', s]); }, () => calls.push(['refresh']), { disabled: false }, { textContent: '', style: {} }, stubSave, { confirm: () => true }, (f) => f());
    if (!calls.some(([n, s]) => n === 'signOutPlayer' && s === stubSave)) fail('lifted sign-out handler did not call signOutPlayer(save)');
    if (!calls.some(([n]) => n === 'refresh')) fail('lifted sign-out handler did not refresh the tab');
  }

if (failures) { console.error(`progress-ui: ${failures} failure(s)`); process.exit(1); }
console.log('progress-ui: ok');
