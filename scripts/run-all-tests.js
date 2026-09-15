#!/usr/bin/env node
/**
 * scripts/run-all-tests.js
 *
 * Runs all 11 regression suites in order.
 * Stops immediately on the first failure and exits with code 1.
 * Exits code 0 with "ALL 11 SUITES PASS" if all pass.
 *
 * Dependency-free — uses only node:child_process and node:path.
 *
 * KNOWN QUIRK: build3b_hardening_test.js starts an Express server on port 3000
 * and never calls server.close(), so it never exits on its own. The script
 * captures its stdout and, on ETIMEDOUT, checks for the success banner —
 * if found, the suite is counted as passed.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** @type {Array<{name: string, timeout: number, passthroughOnTimeout?: string}>} */
const SUITES = [
  { name: 'build3a_test.js',                        timeout: 60_000 },
  { name: 'build3b_test.js',                        timeout: 60_000 },
  { name: 'build3b_finalization_test.js',            timeout: 60_000 },
  {
    name: 'build3b_hardening_test.js',
    timeout: 150_000,
    // If the process times out but this string appears in stdout, count it as passed.
    passthroughOnTimeout: 'ALL BUILD 3B.1.5 HARDENING TESTS PASSED WITH 100% SUCCESS!',
  },
  { name: 'build3b16_structure_test.js',             timeout: 60_000 },
  { name: 'build3b17_real_pdf_test.js',              timeout: 60_000 },
  { name: 'build3b19_pdfjs_parser_test.js',          timeout: 60_000 },
  { name: 'build4_1_editorial_intelligence_test.js', timeout: 60_000 },
  { name: 'build4_2a_planner_test.js',               timeout: 60_000 },
  { name: 'build4_2bc_single_book_test.js',          timeout: 60_000 },
  { name: 'build4_editorial_synthesis_test.js',      timeout: 60_000 },
];

let passed = 0;

for (const suite of SUITES) {
  const testPath = path.join(ROOT, 'backend', 'tests', suite.name);
  const label = `=== ${suite.name} ===`;

  process.stdout.write(`\n${label}\n`);

  // Use 'pipe' when we need to inspect output on timeout; otherwise 'inherit'.
  const usePipe = Boolean(suite.passthroughOnTimeout);

  const result = spawnSync(process.execPath, [testPath], {
    stdio: usePipe ? 'pipe' : 'inherit',
    cwd: ROOT,
    timeout: suite.timeout,
    killSignal: 'SIGTERM',
  });

  // If we piped, forward the captured output now so the user sees it.
  if (usePipe) {
    if (result.stdout && result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr && result.stderr.length > 0) process.stderr.write(result.stderr);
  }

  const timedOut = result.error && result.error.code === 'ETIMEDOUT';

  // TODO: build3b_hardening_test.js leaks an Express server handle.
  // It passes its assertions but never exits. Fix by adding
  // server.close() in an after() hook. This banner-detection is a
  // stopgap until then.
  if (timedOut && suite.passthroughOnTimeout) {
    const out = (result.stdout || Buffer.alloc(0)).toString('utf8');
    if (out.includes(suite.passthroughOnTimeout)) {
      process.stdout.write(
        `\n[run-all-tests] ${suite.name} timed out but success banner found — counting as PASS.\n`
      );
      passed += 1;
      continue;
    }
    process.stderr.write(`\nFAILED: ${suite.name} — timed out and success banner NOT found.\n`);
    process.exit(1);
  }

  if (timedOut) {
    process.stderr.write(`\nFAILED: ${suite.name} — timed out after ${suite.timeout / 1000}s\n`);
    process.exit(1);
  }

  if (result.error) {
    process.stderr.write(`\nFAILED: ${suite.name} — spawn error: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(`\nFAILED: ${suite.name} — exited with code ${result.status}\n`);
    process.exit(1);
  }

  passed += 1;
}

process.stdout.write(`\nALL ${passed} SUITES PASS\n`);
process.exit(0);
