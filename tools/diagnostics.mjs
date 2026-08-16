#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────
// Flywheel Diagnostics Runner
// ──────────────────────────────────────────────────────────────────────
// Usage:  node tools/diagnostics.mjs [--skip-live] [--report <path>]
//
// Runs every test/selftest/validator in the project in six ordered phases:
//
//   Phase 1 — SYNTAX        Node --check on all source modules (instant)
//   Phase 2 — UNIT TESTS    Fast headless unit tests (<5 s each)
//   Phase 3 — SELFTESTS     Contract & asset integrity checks (<5 s each)
//   Phase 4 — PHYSICS       Voxel sim regression tests (5–15 s each)
//   Phase 5 — FULL SUITE    validate.mjs orchestrator (parallel, ~20 s)
//   Phase 6 — LIVE          Network-dependent tests (optional, skipped with --skip-live)
//
// Exit code 0 = ALL PASS.  Non-zero = at least one failure.
// A markdown remediation report is written to --report path (default: stdout summary).
// ──────────────────────────────────────────────────────────────────────

import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const skipLive = args.includes('--skip-live');
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx !== -1 ? args[reportIdx + 1] : null;

// ── Helpers ───────────────────────────────────────────────────────────

function runSync(cmd, cmdArgs, cwd = ROOT, timeoutMs = 180_000) {
  const t0 = performance.now();
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  const secs = (performance.now() - t0) / 1000;
  const stdout = (result.stdout || Buffer.alloc(0)).toString();
  const stderr = (result.stderr || Buffer.alloc(0)).toString();
  const output = (stdout + '\n' + stderr).trim();
  const passed = result.status === 0 && !result.signal;
  return { passed, output, secs, code: result.status, signal: result.signal };
}

function syntaxCheck(filePath) {
  return runSync(process.execPath, ['--check', filePath], ROOT, 10_000);
}

// Collect all .js and .mjs source files under js/ (non-test)
function collectSourceFiles() {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // skip node_modules, .git, assets, etc.
        if (['node_modules', '.git', 'assets', 'audio', 'vendor'].includes(entry.name) &&
            dir === ROOT) continue;
        walk(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        files.push(full);
      }
    }
  }
  walk(join(ROOT, 'js'));
  return files;
}

// ── Phase definitions ─────────────────────────────────────────────────
// Each test entry: { name, file, phase, network? }

const PHASES = [
  {
    id: 1,
    name: 'SYNTAX',
    description: 'Node.js parse check on all source modules',
    tests: null, // dynamically populated
  },
  {
    id: 2,
    name: 'UNIT TESTS',
    description: 'Fast headless unit tests (<5s each)',
    tests: [
      { name: 'Audio Engine',           file: 'js/audio/engine.test.mjs' },
      { name: 'Game Audio',             file: 'js/audio/game-audio.test.mjs' },
      { name: 'Music Director',         file: 'js/audio/music.test.mjs' },
      { name: 'Multiplayer Config',     file: 'tools/multiplayer-config.test.mjs' },
      { name: 'Multiplayer Protocol',   file: 'tools/multiplayer-protocol.test.mjs' },
      { name: 'Multiplayer Lobby',      file: 'tools/multiplayer-lobby.test.mjs' },
      { name: 'Multiplayer Sim',        file: 'tools/multiplayer-sim.test.mjs' },
      { name: 'Multiplayer Session',    file: 'tools/multiplayer-session.test.mjs' },
      { name: 'Multiplayer E2E',        file: 'tools/multiplayer-e2e.test.mjs' },
    ],
  },
  {
    id: 3,
    name: 'SELFTESTS',
    description: 'Contract & asset integrity checks (<5s each)',
    tests: [
      { name: 'Board Replay',           file: 'tools/board-selftest.mjs' },
      { name: 'Cinematic VFX',          file: 'tools/cinematic-vfx-selftest.mjs' },
      { name: 'Earthquake Cinematic',   file: 'tools/earthquake-cinematic-selftest.mjs' },
      { name: 'Music Assets',           file: 'tools/music-assets-selftest.mjs' },
      { name: 'Train Derail Physics',   file: 'tools/train-derail-selftest.mjs' },
      { name: 'Import Graph',           file: 'tools/check_imports.mjs' },
    ],
  },
  {
    id: 4,
    name: 'PHYSICS',
    description: 'Voxel simulation regression tests (5–15s each)',
    tests: [
      { name: 'Voxel Drain',            file: 'js/voxelsim.drain.test.mjs' },
      { name: 'Voxel Gravity',          file: 'js/voxelsim.gravity.test.mjs' },
      { name: 'Voxel Multi-Hole',       file: 'js/voxelsim.multihole.test.mjs' },
    ],
  },
  {
    id: 5,
    name: 'FULL SUITE',
    description: 'Main validator orchestrator (parallel, ~20s)',
    tests: [
      { name: 'validate.mjs',           file: 'tools/validate.mjs', timeout: 600_000 },
    ],
  },
  {
    id: 6,
    name: 'LIVE',
    description: 'Network-dependent tests (requires API access)',
    network: true,
    tests: [
      { name: 'Board Live API',          file: 'tools/board-live-selftest.mjs' },
      { name: 'Live Profile Auth',       file: 'tools/test-live-profile.mjs' },
    ],
  },
];

// ── Run ───────────────────────────────────────────────────────────────

const results = [];   // { phase, name, file, passed, output, secs, skipped? }
const t0Global = performance.now();

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║            FLYWHEEL DIAGNOSTICS RUNNER                  ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log();

// Phase 1: Syntax checks
{
  const phase = PHASES[0];
  console.log(`── Phase ${phase.id}: ${phase.name} ──  ${phase.description}`);
  const sourceFiles = collectSourceFiles();
  let syntaxFails = 0;
  const t0 = performance.now();
  for (const f of sourceFiles) {
    const r = syntaxCheck(f);
    if (!r.passed) {
      syntaxFails++;
      const rel = relative(ROOT, f);
      console.log(`  ✗ SYNTAX ERROR: ${rel}`);
      console.log(`    ${r.output.split('\n')[0]}`);
      results.push({ phase: phase.id, phaseName: phase.name, name: `Syntax: ${rel}`, file: rel, passed: false, output: r.output, secs: r.secs });
    }
  }
  const secs = (performance.now() - t0) / 1000;
  if (syntaxFails === 0) {
    console.log(`  ✓ All ${sourceFiles.length} source files parse OK (${secs.toFixed(1)}s)`);
    results.push({ phase: phase.id, phaseName: phase.name, name: 'All syntax checks', file: '', passed: true, output: '', secs });
  }
  console.log();
}

// Phases 2–6: Test files
for (const phase of PHASES.slice(1)) {
  if (phase.network && skipLive) {
    console.log(`── Phase ${phase.id}: ${phase.name} ──  SKIPPED (--skip-live)`);
    for (const t of phase.tests) {
      results.push({ phase: phase.id, phaseName: phase.name, name: t.name, file: t.file, passed: true, output: 'Skipped (--skip-live)', secs: 0, skipped: true });
    }
    console.log();
    continue;
  }

  console.log(`── Phase ${phase.id}: ${phase.name} ──  ${phase.description}`);

  for (const t of phase.tests) {
    const fullPath = resolve(ROOT, t.file);
    if (!existsSync(fullPath)) {
      console.log(`  ✗ ${t.name}  — FILE NOT FOUND: ${t.file}`);
      results.push({ phase: phase.id, phaseName: phase.name, name: t.name, file: t.file, passed: false, output: `File not found: ${fullPath}`, secs: 0 });
      continue;
    }

    const timeout = t.timeout || 60_000;
    const r = runSync(process.execPath, [t.file], ROOT, timeout);
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${t.name}  (${r.secs.toFixed(1)}s)${r.passed ? '' : '  ← FAILED'}`);

    if (!r.passed) {
      // Show first few lines of failure output
      const lines = r.output.split('\n').filter(l => l.trim());
      const preview = lines.slice(-5).map(l => `    ${l}`).join('\n');
      if (preview.trim()) console.log(preview);
    }

    results.push({ phase: phase.id, phaseName: phase.name, name: t.name, file: t.file, passed: r.passed, output: r.output, secs: r.secs });
  }
  console.log();
}

// ── Summary ───────────────────────────────────────────────────────────

const totalSecs = (performance.now() - t0Global) / 1000;
const passed = results.filter(r => r.passed && !r.skipped);
const failed = results.filter(r => !r.passed);
const skipped = results.filter(r => r.skipped);

console.log('══════════════════════════════════════════════════════════');
if (failed.length === 0) {
  console.log(`DIAGNOSTICS: ALL PASS  (${passed.length} passed, ${skipped.length} skipped, ${totalSecs.toFixed(1)}s)`);
} else {
  console.log(`DIAGNOSTICS: ${failed.length} FAILURE(S)  (${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped, ${totalSecs.toFixed(1)}s)`);
  console.log();
  console.log('Failed tests:');
  for (const f of failed) {
    console.log(`  Phase ${f.phase} [${f.phaseName}] → ${f.name} (${f.file})`);
  }
}
console.log('══════════════════════════════════════════════════════════');

// ── Remediation Report ────────────────────────────────────────────────

function generateReport() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const lines = [];
  lines.push('# Flywheel Diagnostics Report');
  lines.push(`**Generated**: ${new Date().toISOString()}  `);
  lines.push(`**Duration**: ${totalSecs.toFixed(1)}s  `);
  lines.push(`**Result**: ${failed.length === 0 ? '✅ ALL PASS' : `❌ ${failed.length} FAILURE(S)`}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Phase | Name | Tests | Passed | Failed | Time |');
  lines.push('|:---:|:---|:---:|:---:|:---:|:---:|');
  for (const phase of PHASES) {
    const pr = results.filter(r => r.phase === phase.id);
    const pp = pr.filter(r => r.passed && !r.skipped).length;
    const pf = pr.filter(r => !r.passed).length;
    const ps = pr.filter(r => r.skipped).length;
    const pt = pr.reduce((s, r) => s + r.secs, 0);
    const status = pf > 0 ? '❌' : ps === pr.length ? '⏭️' : '✅';
    lines.push(`| ${status} ${phase.id} | ${phase.name} | ${pr.length} | ${pp} | ${pf} | ${pt.toFixed(1)}s |`);
  }
  lines.push('');

  if (failed.length > 0) {
    lines.push('## Failures Requiring Remediation');
    lines.push('');
    for (const f of failed) {
      lines.push(`### ❌ ${f.name}`);
      lines.push(`- **Phase**: ${f.phase} — ${f.phaseName}`);
      lines.push(`- **File**: \`${f.file}\``);
      lines.push(`- **Duration**: ${f.secs.toFixed(1)}s`);
      lines.push('');
      // Extract actionable error lines
      const errorLines = f.output.split('\n')
        .filter(l => /fail|error|assert|throw|syntaxerror|unexpected/i.test(l))
        .slice(0, 20);
      if (errorLines.length > 0) {
        lines.push('**Error Output:**');
        lines.push('```');
        lines.push(errorLines.join('\n'));
        lines.push('```');
      } else {
        lines.push('**Full Output (last 30 lines):**');
        lines.push('```');
        lines.push(f.output.split('\n').slice(-30).join('\n'));
        lines.push('```');
      }
      lines.push('');
      lines.push('**Suggested Remediation:**');
      if (f.phaseName === 'SYNTAX') {
        lines.push('- Fix the syntax error in the indicated file. Common causes: missing `}`, unclosed template literals, stale code after refactors.');
      } else if (f.phaseName === 'PHYSICS') {
        lines.push('- This is a simulation regression. Check recent changes to `voxelsim.js`, scene files, or `tiers.js` that may have altered physics constants or collision logic.');
      } else if (f.phaseName === 'FULL SUITE') {
        lines.push('- Run `node tools/validate.mjs` standalone for detailed section-by-section output. Check `STATUS.md` for known issues.');
      } else if (f.phaseName === 'LIVE') {
        lines.push('- Verify network connectivity, `.env.local` credentials, and that the Vercel deployment is live.');
      } else {
        lines.push('- Review the error output above. Run the individual test file for full diagnostics: `node ' + f.file + '`');
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  } else {
    lines.push('## ✅ No Remediation Required');
    lines.push('');
    lines.push('All diagnostics passed. The codebase is healthy.');
    lines.push('');
  }

  // Detailed results
  lines.push('## Detailed Results');
  lines.push('');
  for (const phase of PHASES) {
    const pr = results.filter(r => r.phase === phase.id);
    lines.push(`### Phase ${phase.id}: ${phase.name}`);
    lines.push('');
    lines.push('| Test | Status | Time |');
    lines.push('|:---|:---:|:---:|');
    for (const r of pr) {
      const status = r.skipped ? '⏭️ Skip' : r.passed ? '✅ Pass' : '❌ Fail';
      lines.push(`| ${r.name} | ${status} | ${r.secs.toFixed(1)}s |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

if (reportPath) {
  const report = generateReport();
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nRemediation report written to: ${reportPath}`);
} else if (failed.length > 0) {
  // Auto-write report to tools/ when there are failures
  const report = generateReport();
  const autoPath = join(ROOT, 'tools', 'diagnostics-report.md');
  writeFileSync(autoPath, report, 'utf-8');
  console.log(`\nRemediation report written to: ${relative(ROOT, autoPath)}`);
}

process.exit(failed.length > 0 ? 1 : 0);
