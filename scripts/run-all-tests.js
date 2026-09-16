#!/usr/bin/env node
/**
 * scripts/run-all-tests.js
 *
 * Runs all 11 regression suites in order.
 * Stops immediately on the first failure and exits with code 1.
 * Exits code 0 with "ALL 11 SUITES PASS" if all pass.
 *
 * Dependency-free — uses only node:child_process and node:path.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const TIMEOUT_MS = 60_000;

const SUITES = [
  'build3a_test.js',
  'build3b_test.js',
  'build3b_finalization_test.js',
  'build3b_hardening_test.js',
  'build3b16_structure_test.js',
  'build3b17_real_pdf_test.js',
  'build3b19_pdfjs_parser_test.js',
  'build4_1_editorial_intelligence_test.js',
  'build4_2a_planner_test.js',
  'build4_2bc_single_book_test.js',
  'build4_editorial_synthesis_test.js',
];

let passed = 0;

for (const name of SUITES) {
  const testPath = path.join(ROOT, 'backend', 'tests', name);

  process.stdout.write(`\n=== ${name} ===\n`);

  const result = spawnSync(process.execPath, [testPath], {
    stdio: 'inherit',
    cwd: ROOT,
    timeout: TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });

  const timedOut = result.error && result.error.code === 'ETIMEDOUT';

  if (timedOut) {
    process.stderr.write(`\nFAILED: ${name} — timed out after ${TIMEOUT_MS / 1000}s\n`);
    process.exit(1);
  }

  if (result.error) {
    process.stderr.write(`\nFAILED: ${name} — spawn error: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(`\nFAILED: ${name} — exited with code ${result.status}\n`);
    process.exit(1);
  }

  passed += 1;
}

process.stdout.write(`\nALL ${passed} SUITES PASS\n`);
process.exit(0);