/**
 * Build 4.15a PDF Parser Stress Test
 *
 * Verifies parser robustness against complex real-world layouts:
 * 1. two-column.pdf   (ResNet arXiv:1512.03385)
 * 2. math-heavy.pdf   (NIST FIPS 197-upd1 AES)
 * 3. table-heavy.pdf  (Apple Inc. FY23 10-K)
 * 4. code-heavy.pdf   (Think Python 2e)
 *
 * Asserts:
 * - Parser does NOT throw on any fixture (no crashes)
 * - integrityStatus in ('valid', 'empty_content')
 * - Honest degradation if text extraction is incomplete
 * - pageCount >= 1
 * - Writes tmp/parser-stress-report.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pdfjsParser = require('../services/ingestion/parsers/pdfjsParser');

async function runParserStressTest() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 4.15a: PDF PARSER STRESS TEST');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '..', '..');
  const reportPath = path.join(rootDir, 'tmp', 'parser-stress-report.json');

  // Step 1: Control baseline — canonical PDF
  const controlPath = path.join(__dirname, 'fixtures', 'practical_machine_learning.pdf');
  if (fs.existsSync(controlPath)) {
    console.log('[Control] Verifying canonical baseline fixture: practical_machine_learning.pdf');
    const startControl = Date.now();
    const controlBuf = fs.readFileSync(controlPath);
    const controlResult = await pdfjsParser.parse(controlBuf, { title: 'Practical Machine Learning' });
    const controlMs = Date.now() - startControl;
    assert.ok(controlResult, 'Control parse must return result');
    assert.strictEqual(controlResult.integrityStatus, 'valid', 'Control integrityStatus must be valid');
    assert.ok(controlResult.chapters.length >= 8, 'Control must have at least 8 chapters');
    console.log(`  ✓ Control parsed in ${controlMs}ms: ${controlResult.chapters.length} chapters, ${controlResult.totalWordCount} words, integrityStatus: ${controlResult.integrityStatus}\n`);
  } else {
    console.log('[Control] Canonical baseline fixture not present on disk, proceeding with stress fixtures.\n');
  }

  // Step 2: Four stress fixtures
  const stressDir = path.join(__dirname, 'fixtures', 'stress');
  const fixtures = [
    { name: 'two-column.pdf', title: 'Deep Residual Learning (ResNet)' },
    { name: 'math-heavy.pdf', title: 'NIST AES FIPS 197' },
    { name: 'table-heavy.pdf', title: 'Apple Inc. 10-K FY23' },
    { name: 'code-heavy.pdf', title: 'Think Python 2e' },
  ];

  const results = [];
  let allPassed = true;

  for (const fix of fixtures) {
    const filePath = path.join(stressDir, fix.name);
    console.log(`[Stress] Testing fixture: ${fix.name} ("${fix.title}")`);

    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ Fixture file missing: ${filePath}`);
      results.push({
        name: fix.name,
        size: 0,
        chapters: 0,
        words: 0,
        integrityStatus: 'missing',
        parseMs: 0,
        error: 'File not found',
        passed: false,
      });
      allPassed = false;
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const size = fileBuffer.length;
    const startMs = Date.now();
    let parseResult = null;
    let parseError = null;

    try {
      parseResult = await pdfjsParser.parse(fileBuffer, { title: fix.title });
    } catch (err) {
      parseError = err.message;
      console.error(`  ❌ Parse threw error on ${fix.name}: ${err.message}`);
    }

    const parseMs = Date.now() - startMs;

    if (!parseError && parseResult) {
      const chaptersCount = Array.isArray(parseResult.chapters) ? parseResult.chapters.length : 0;
      const words = parseResult.totalWordCount || 0;
      const status = parseResult.integrityStatus;
      const pages = parseResult.pageCount || 0;

      // Assertions:
      // 1. integrityStatus is in ('valid', 'empty_content')
      const validStatus = status === 'valid' || status === 'empty_content';
      assert.ok(validStatus, `integrityStatus must be 'valid' or 'empty_content', got "${status}"`);

      // 2. If 'valid': chapters.length >= 1, totalWordCount > 0
      if (status === 'valid') {
        assert.ok(chaptersCount >= 1, `Expected chapters >= 1 for valid status, got ${chaptersCount}`);
        assert.ok(words > 0, `Expected totalWordCount > 0 for valid status, got ${words}`);
      }

      // 3. If 'empty_content': graceful degradation
      if (status === 'empty_content') {
        assert.ok(words === 0 || chaptersCount === 0, `Expected 0 words or 0 chapters for empty_content`);
      }

      // 4. pageCount >= 1
      assert.ok(pages >= 1, `Expected pageCount >= 1, got ${pages}`);

      console.log(`  ✓ Parsed cleanly in ${parseMs}ms (${(size / 1024).toFixed(1)} KB)`);
      console.log(`    Pages: ${pages}, Chapters: ${chaptersCount}, Words: ${words}, Status: ${status}`);

      results.push({
        name: fix.name,
        size,
        chapters: chaptersCount,
        words,
        integrityStatus: status,
        parseMs,
        error: null,
        passed: true,
      });
    } else {
      results.push({
        name: fix.name,
        size,
        chapters: 0,
        words: 0,
        integrityStatus: 'crashed',
        parseMs,
        error: parseError,
        passed: false,
      });
      allPassed = false;
    }
  }

  // Step 3: Write report
  const summary = {
    total: fixtures.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
  };

  const report = {
    fixtures: results,
    summary,
    pass: allPassed,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[Report] Stress test report written to ${reportPath}`);
  console.log('[Report Summary]:', JSON.stringify(summary, null, 2));

  assert.strictEqual(allPassed, true, 'All 4 stress fixtures must parse without crashing');

  console.log('\n================================================================');
  console.log('🎉 PDF PARSER STRESS TEST PASSED (4/4 FIXTURES)');
  console.log('================================================================\n');
}

runParserStressTest()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch((err) => {
    console.error('\n❌ PDF PARSER STRESS TEST FAILED:', err);
    setTimeout(() => process.exit(1), 100);
  });

