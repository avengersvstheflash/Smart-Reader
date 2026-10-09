#!/usr/bin/env node
/**
 * scripts/run-all-tests.js
 *
 * Runs all regression suites in order.
 * Stops immediately on the first failure and exits with code 1.
 * Exits code 0 with "ALL <n> SUITES PASS" if all pass.
 *
 * Dependency-free - uses only node:child_process and node:path.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Isolate test DB from dev DB so test runs do not wipe user Library
process.env.DB_PATH = path.join(ROOT, 'storage', 'test-data.db');

const TIMEOUT_MS = 600_000;

const SUITES = [
  'phase5_7_3_parse_test.js',
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
  'build4_4_progressive_synthesis_test.js',
  'build4_5_bge_migration_test.js',
  'build4_14_eval_harness_test.js',
  'build4_19_contract_test.js',
  'build4_15_parser_stress_test.js',
  'build4_15b_front_matter_filter_test.js',
  'build5_1a_bibliographic_test.js',
  'build5_1b_provenance_test.js',
  'build5_3_library_split_test.js',
  'phase5_6_validation_test.js',
  'phase5_7_ocr_test.js',
  'phase5_7_2_nlp_test.js',
  'phase5_7_2_embed_test.js',
  'phase5_7_2_parallel_test.js',
  'phase5_8_0j_chatlog_detect_test.js',
  'phase5_8_0j_legacy_font_test.js',
  'f32_section_classifier_test.js',
  'f32_1_structure_detector_test.js',
  'f31_math_extractor_test.js',
  'f34_rerank_batch_test.js',
  'f33_surrogate_sanitize_test.js',
  'f32_3_toc_chapter_builder_test.js',
  'f34_1a_rerank_multi_test.js',
  'f32_3a_page_tracking_test.js',
  'f37_python_embedder_default_test.js',
  'f37_2_embed_batch_size_test.js',
  'f37_5_pipeline_reliability_test.js',
  'f38_manual_resynthesize_test.js',
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
    process.stderr.write(`\nFAILED: ${name} - timed out after ${TIMEOUT_MS / 1000}s\n`);
    process.exit(1);
  }

  if (result.error) {
    process.stderr.write(`\nFAILED: ${name} - spawn error: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(`\nFAILED: ${name} - exited with code ${result.status}\n`);
    process.exit(1);
  }

  passed += 1;
}

process.stdout.write(`\nALL ${passed} SUITES PASS\n`);
process.exit(0);

