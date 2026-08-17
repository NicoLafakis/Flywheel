// TDD Static Guard: no call to an identifier that does not exist.
//
// WHY THIS FILE EXISTS
// `js/main.js` (and the other DOM-only modules listed below) can never be
// imported by the headless validator — they touch `document` at module scope —
// so a typo'd or un-imported function name in them survives every test we have
// and only shows up as a blank frozen screen in a browser. That has now cost two
// releases: `isHost` read outside its scope in the frame loop, and `writeSave(save)`
// in BOTH multiplayer game-over handlers, where `js/save.js` exports `storeSave`.
// The second one threw before `showMultiplayerPodium()` ran, so every multiplayer
// match ended on a black screen for both players.
//
// WHAT IT CATCHES
// A CALL (or `new`) of a bare identifier — `foo(...)`, `new Foo(...)` — where
// `foo` is neither imported, nor declared anywhere in the file, nor a known
// platform global. That is exactly the shape of both shipped defects.
//
// WHAT IT DOES NOT CATCH (documented limits, on purpose — this is a lexical
// scanner, not a scope analyser, because the repo has no build step and no
// parser dependency):
//   * a bare identifier READ that is never called (`if (isHost)`), unless it is
//     also called somewhere;
//   * a name used before its `let`/`const` declaration in the same scope (TDZ);
//   * a name that IS declared in the file but in a DIFFERENT scope than the call
//     site — declarations are collected file-wide, deliberately, because
//     over-declaring only ever costs us a missed bug, never a false alarm;
//   * a name reached through a member expression (`obj.foo()`), which is a
//     runtime property question, not a binding question.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

console.log('Testing js/main.js (and the other DOM-only modules) for calls to identifiers that do not exist...');

// The modules the headless validator can never import, and therefore the only
// places this class of bug can hide. Add a file here when it becomes DOM-only.
const SCANNED = [
  '../js/main.js',
  '../js/multiplayer/ui.js',
];

/**
 * Blank out comments, string literals and regex literals, preserving offsets and
 * newlines, so the identifier scan never reads prose or a URL as code. The
 * `${...}` holes inside template literals are KEPT: they are code.
 */
function stripNonCode(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  // Template-literal nesting: each entry is the brace depth at which the current
  // `${` interpolation started, so a nested template inside `${}` still closes.
  const tmplStack = [];
  let braceDepth = 0;
  let prevSignificant = '';
  while (i < src.length) {
    const c = src[i];
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
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      blank(i, Math.min(j + 1, src.length)); i = j + 1; prevSignificant = 'x'; continue;
    }
    if (c === '`') {
      // Walk the template, blanking the literal chunks and leaving `${...}` alone.
      let j = i + 1;
      blank(i, i + 1);
      let chunkStart = j;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') { blank(chunkStart, j); blank(j, j + 1); j++; break; }
        if (src[j] === '$' && src[j + 1] === '{') {
          blank(chunkStart, j);
          blank(j, j + 2);
          // Find the matching close brace, honouring nested braces and strings.
          let depth = 1; let k = j + 2;
          while (k < src.length && depth > 0) {
            const ch = src[k];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            else if (ch === '`' || ch === '"' || ch === "'") {
              const q = ch; k++;
              while (k < src.length && src[k] !== q) { if (src[k] === '\\') k++; k++; }
            }
            k++;
          }
          blank(k - 1, k); // the closing brace
          // The interpolation is CODE, and may hold a nested template of its own
          // (`${cond ? `<button>…</button>` : ''}` is all over the lobby markup),
          // so it is stripped recursively rather than skipped — otherwise the
          // nested markup gets scanned as if it were source.
          const inner = stripNonCode(src.slice(j + 2, k - 1));
          for (let t = 0; t < inner.length; t++) out[j + 2 + t] = inner[t];
          j = k; chunkStart = j; continue;
        }
        j++;
      }
      i = j; prevSignificant = 'x'; continue;
    }
    if (c === '/' && /[(,=:[!&|?{};+\-*%~^\n]/.test(prevSignificant || '\n')) {
      // Regex literal, not division: only ever after an operator or a delimiter.
      let j = i + 1; let inClass = false; let closed = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') break;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { closed = true; break; }
        j++;
      }
      if (closed) {
        while (j + 1 < src.length && /[a-z]/.test(src[j + 1])) j++;
        blank(i, j + 1); i = j + 1; prevSignificant = 'x'; continue;
      }
    }
    if (c === '{') braceDepth++;
    if (c === '}') braceDepth--;
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  void tmplStack; void braceDepth;
  return out.join('');
}

const RESERVED = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'await',
  'case', 'do', 'else', 'yield', 'void', 'delete', 'in', 'of', 'instanceof',
  'function', 'class', 'const', 'let', 'var', 'throw', 'try', 'finally',
  'import', 'export', 'default', 'extends', 'super', 'this', 'null', 'true',
  'false', 'undefined', 'break', 'continue', 'with', 'debugger', 'get', 'set',
  'static', 'async', 'from', 'as',
]);

// Platform surface these files legitimately reach for. Deliberately explicit:
// the whole value of the guard is that an unknown name is an error, so this list
// grows by a considered edit rather than by a wildcard.
const GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'console',
  'performance', 'localStorage', 'sessionStorage', 'fetch', 'Request', 'Response',
  'Headers', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData',
  'Image', 'Audio', 'AudioContext', 'webkitAudioContext', 'OffscreenCanvas',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone',
  'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'CustomEvent',
  'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'TouchEvent',
  'WebSocket', 'Worker', 'MessageChannel', 'BroadcastChannel', 'crypto',
  'matchMedia', 'getComputedStyle', 'alert', 'confirm', 'prompt', 'atob', 'btoa',
  'globalThis', 'self',
  // Language built-ins.
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math',
  'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer',
  'DataView', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'eval',
]);

/** Every identifier inside a fragment, e.g. a destructuring pattern or a param list. */
function identsIn(fragment) {
  return (fragment.match(/[A-Za-z_$][\w$]*/g) || []);
}

/**
 * File-wide bindings. Deliberately LIBERAL (see the header): a name collected
 * here can only ever suppress a report, and the two defects this guard exists
 * for are names that appear nowhere else in the file at all.
 */
function collectDeclared(code) {
  const declared = new Set();
  const add = (name) => { if (name && !RESERVED.has(name)) declared.add(name); };

  // import clauses — everything between `import` and `from`.
  for (const m of code.matchAll(/\bimport\s+([^;]*?)\s+from\s/g)) identsIn(m[1]).forEach(add);
  // function / class / plain const|let|var bindings
  for (const m of code.matchAll(/\b(?:function|class)\s*\*?\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  // destructuring bindings — both the source key and the local alias
  for (const m of code.matchAll(/\b(?:const|let|var)\s*([{[][\s\S]{0,600}?[\]}])\s*=/g)) identsIn(m[1]).forEach(add);
  // parameter lists: anything parenthesised that heads a body or an arrow
  for (const m of code.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) identsIn(m[1]).forEach(add);
  // single-parameter arrows without parentheses
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) add(m[1]);
  // catch bindings
  for (const m of code.matchAll(/\bcatch\s*\(([^)]*)\)/g)) identsIn(m[1]).forEach(add);
  // object-literal method shorthand: `name(a, b) {`
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) add(m[1]);
  return declared;
}

/** Bare `foo(` / `new Foo(` call sites, with the line they sit on. */
function collectCalls(code) {
  const calls = [];
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  for (const m of code.matchAll(/(^|[^.\w$?])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[2];
    if (RESERVED.has(name)) continue;
    calls.push({ name, line: lineOf(m.index + m[1].length) });
  }
  return calls;
}

let failures = 0;
for (const rel of SCANNED) {
  const raw = readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const code = stripNonCode(raw);
  const declared = collectDeclared(code);
  const unknown = new Map(); // name -> first line
  for (const { name, line } of collectCalls(code)) {
    if (declared.has(name) || GLOBALS.has(name)) continue;
    if (!unknown.has(name)) unknown.set(name, line);
  }
  if (unknown.size) {
    failures += unknown.size;
    for (const [name, line] of unknown) {
      console.error(`  FAIL ${rel.replace('../', '')}:${line} — calls \`${name}()\`, which is neither imported, declared, nor a known global`);
    }
  } else {
    console.log(`  ok: ${rel.replace('../', '')} calls nothing undefined`);
  }
}

assert.equal(failures, 0,
  `${failures} call(s) to an identifier that does not exist — this is the blank-screen class of bug`);

// Sanity: the scanner must actually be able to fail, or it proves nothing.
{
  const probe = stripNonCode('const a = 1;\nfunction go() { missingFn(a); }\n');
  const found = collectCalls(probe).filter((c) => !collectDeclared(probe).has(c.name) && !GLOBALS.has(c.name));
  assert.deepEqual(found.map((c) => c.name), ['missingFn'],
    'the scanner must detect a call to an undeclared identifier');
  const clean = stripNonCode('import { storeSave } from "./save.js";\nstoreSave(1);\n// writeSave(1)\nconst s = "writeSave(1)";\n');
  const noise = collectCalls(clean).filter((c) => !collectDeclared(clean).has(c.name) && !GLOBALS.has(c.name));
  assert.deepEqual(noise, [], 'the scanner must not read comments or strings as code');
}

console.log('✓ main.js undefined-identifier guard PASSED');
