'use strict';
// Shared plumbing for the T-901 perf harness: global-Playwright resolution, a
// self-managed local static server, and argv parsing.
//
// This repo has NO package.json and must never gain one, so nothing here may
// assume a node_modules next to it. Playwright is installed GLOBALLY
// (npm i -g playwright) and is resolved by absolute path, the same way the
// browser-playwright skill does it.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------- argv ----

// --key=value and bare --flag (=> true). Positionals come back as _.
function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq < 0) out[a.slice(2)] = true;
      else out[a.slice(2, eq)] = a.slice(eq + 1);
    } else out._.push(a);
  }
  return out;
}

// ---------------------------------------------------------- playwright ----

// Candidates in priority order. PLAYWRIGHT_PATH first so a box with a
// non-standard global prefix can point at it without editing this file.
function playwrightCandidates() {
  const c = [];
  if (process.env.PLAYWRIGHT_PATH) c.push(process.env.PLAYWRIGHT_PATH);
  if (process.env.APPDATA) c.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'playwright'));
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (root) c.push(path.join(root, 'playwright'));
  } catch { /* npm not on PATH; the other candidates still stand */ }
  c.push('playwright'); // a project-local install, if one ever exists
  return c;
}

function requirePlaywright() {
  const tried = [];
  for (const c of playwrightCandidates()) {
    try {
      return require(c);
    } catch (e) {
      tried.push('  ' + c + '\n    ' + String(e.message).split('\n')[0]);
    }
  }
  throw new Error(
    'Playwright not found. This repo has no package.json by design; the harness\n'
    + 'uses the GLOBAL install. Fix with:\n'
    + '  npm i -g playwright && npx playwright install chromium\n'
    + 'or set PLAYWRIGHT_PATH to the playwright package directory.\n'
    + 'Tried:\n' + tried.join('\n'),
  );
}

// ------------------------------------------------------- static server ----

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: timeoutMs },
      (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(port, deadlineMs) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (await probe(port, 1500)) return true;
    await sleep(250);
  }
  return false;
}

function killTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === 'win32') {
    // python -m http.server sits under the shell we spawned; /T kills the tree.
    try {
      execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch { /* already gone */ }
  } else {
    try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

// The Node fallback exists only so the harness still runs on a box without
// Python. It deliberately mirrors the two behaviours of python -m http.server
// that the measurement depends on:
//   1. .js served as text/javascript, or the ES modules never load;
//   2. any non-GET/HEAD answered 501, which is what makes startRankedRun's
//      ticket POST fail and pushes the run down the documented offline branch
//      (js/main.js:404-414). See the T-901 finding section 2, "One deviation,
//      disclosed" - the arms are only comparable if every run takes that branch.
function startNodeServer(port, root) {
  const srv = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(501, { 'Content-Type': 'text/plain' });
      res.end('Unsupported method (' + req.method + ')');
      return;
    }
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, path.join('.', rel));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
  return new Promise((resolve, reject) => {
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

// Starts a static server on 127.0.0.1:port serving the repo root. Prefers
// python -m http.server, the surface the recorded T-901 measurement was taken
// on; falls back to the Node server above. Returns { url, kind, stop() }.
async function startStaticServer(opts) {
  const o = opts || {};
  const port = o.port || 8791;
  const root = o.root || REPO_ROOT;
  const url = 'http://127.0.0.1:' + port;
  const log = (m) => { if (!o.quiet) console.log('[serve] ' + m); };

  if (await probe(port, 800)) {
    log('port ' + port + ' already answering - reusing it (nothing to stop)');
    return { url, kind: 'external', stop: async () => {} };
  }

  const forced = (process.env.FLYWHEEL_PERF_SERVER || '').toLowerCase();
  const pythons = forced === 'node' ? [] : [
    { cmd: 'python', args: ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root] },
    { cmd: 'py', args: ['-3', '-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root] },
  ];

  for (const p of pythons) {
    let proc;
    try {
      proc = spawn(p.cmd, p.args, { stdio: 'ignore', shell: process.platform === 'win32' });
    } catch { continue; }
    let died = false;
    proc.on('error', () => { died = true; });
    proc.on('exit', () => { died = true; });
    if (await waitForServer(port, 8000)) {
      log(p.cmd + ' -m http.server ' + port + ' (pid ' + proc.pid + ') serving ' + root);
      return { url, kind: p.cmd, stop: async () => { killTree(proc); await sleep(300); } };
    }
    if (!died) killTree(proc);
  }

  const srv = await startNodeServer(port, root);
  log('node built-in static server on ' + port + ' serving ' + root
    + (forced === 'node' ? ' (forced by FLYWHEEL_PERF_SERVER=node)' : ' (python unavailable)'));
  return { url, kind: 'node', stop: async () => { await new Promise((r) => srv.close(r)); } };
}

// --------------------------------------------------------------- misc ----

// Provenance for the evidence file: a number is only re-checkable against the
// tree it was measured on.
function gitHead() {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
    return sha + (dirty ? '-dirty' : '');
  } catch { return null; }
}

module.exports = {
  REPO_ROOT, parseArgs, requirePlaywright, startStaticServer, waitForServer, gitHead, sleep,
};
