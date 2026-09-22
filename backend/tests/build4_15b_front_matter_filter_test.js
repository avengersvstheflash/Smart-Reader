/**
 * Build 4.15b Front/Back Matter Filter Verification Test
 *
 * Verifies that the Phase 4.8.2 front/back matter filtering holds on real-world
 * stress fixtures (two-column, math-heavy, table-heavy, code-heavy PDFs).
 *
 * Pipeline tested (pure in-memory, no LLM / no tokens):
 *   ingestionService.ingest() -> preprocessor.preprocessChapter()
 *   -> semanticChunker.chunkPreprocessedUnits() -> editorial double-filter
 *
 * Asserts:
 * - Ingestion and chunking succeed without throwing
 * - Every chunk has a valid structuralRole
 * - No chunk with role in ('front_matter', 'back_matter', 'index', 'appendix')
 *   appears in the editorial candidate pool (leak count must be 0)
 * - The editorial candidate pool contains only body content
 * - Writes tmp/front-matter-report.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ingestionService = require('../services/ingestion/ingestionService');
const preprocessor = require('../services/semantic/preprocessor');
const semanticChunker = require('../services/semantic/semanticChunker');
const sectionFilter = require('../services/synthesis/sectionFilter');

const EXCLUDED_ROLES = new Set(['front_matter', 'back_matter', 'index', 'appendix']);

async function runFrontMatterFilterTest() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 4.15b: FRONT/BACK MATTER FILTER TEST');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '..', '..');
  const stressDir = path.join(__dirname, 'fixtures', 'stress');
  const reportPath = path.join(rootDir, 'tmp', 'front-matter-report.json');

  const fixtures = [
    { name: 'two-column.pdf', title: 'Deep Residual Learning (ResNet)' },
    { name: 'math-heavy.pdf', title: 'NIST AES FIPS 197' },
    { name: 'table-heavy.pdf', title: 'Apple Inc. 10-K FY23' },
    { name: 'code-heavy.pdf', title: 'Think Python 2e' },
  ];

  const fixtureReports = [];
  let allPassed = true;

  for (const fix of fixtures) {
    console.log(`[Testing] Fixture: ${fix.name} ("${fix.title}")`);
    const filePath = path.join(stressDir, fix.name);

    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ Fixture file missing: ${filePath}`);
      fixtureReports.push({
        name: fix.name,
        totalChunks: 0,
        roleCounts: {},
        editorialCandidateCount: 0,
        frontMatterLeakCount: 1,
        passed: false,
        error: 'File not found',
      });
      allPassed = false;
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const startMs = Date.now();

    let ingestionResult;
    try {
      ingestionResult = await ingestionService.ingest({
        fileBuffer,
        originalFilename: fix.name,
        format: 'pdf',
        title: fix.title,
      });
    } catch (err) {
      console.error(`  ❌ Ingestion threw on ${fix.name}:`, err.message);
      fixtureReports.push({
        name: fix.name,
        totalChunks: 0,
        roleCounts: {},
        editorialCandidateCount: 0,
        frontMatterLeakCount: 1,
        passed: false,
        error: err.message,
      });
      allPassed = false;
      continue;
    }

    // Preprocess chapters into structural units
    const bookEntity = {
      id: `book-${path.basename(fix.name, '.pdf')}`,
      title: fix.title,
      content_type: 'research',
    };

    const allUnits = [];
    for (const ch of ingestionResult.chapters) {
      const units = preprocessor.preprocessChapter(
        {
          ...ch,
          structural_role: ch.structuralRole || 'chapter',
        },
        bookEntity
      );
      allUnits.push(...units);
    }

    // Chunk units into semantic chunks
    const chunks = semanticChunker.chunkPreprocessedUnits(allUnits, bookEntity);
    const totalChunks = chunks.length;

    // 1. Assert: every chunk has a non-empty structuralRole
    const roleCounts = {};
    for (const c of chunks) {
      const role = (c.structuralRole || '').toLowerCase();
      assert.ok(role, `Chunk ${c.id} must have a non-empty structuralRole`);
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    }

    // 2. Replicate Layer 1: editorialService.js pre-filter (skip excluded structural roles)
    const rawSections = [];
    for (const c of chunks) {
      const role = (c.structuralRole || '').toLowerCase();
      if (EXCLUDED_ROLES.has(role)) {
        continue;
      }

      const text = c.textContent || '';
      rawSections.push({
        sectionId: c.id,
        id: c.id,
        sourceId: bookEntity.id,
        bookId: bookEntity.id,
        sourceTitle: bookEntity.title,
        sectionTitle: c.sectionHeading || c.sourceReference || 'Section',
        sectionType: c.contentType || 'paragraph',
        structuralRole: role || 'chapter',
        contentType: bookEntity.content_type,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        summary: text.slice(0, 140),
        content: text,
      });
    }

    // 3. Replicate Layer 2: sectionFilter.filter() (evaluates role fallback + low-information)
    const { candidates, filtered } = sectionFilter.filter(rawSections);

    // 4. Assert: No front/back matter / appendix / index leaked into editorial candidate pool
    let frontMatterLeakCount = 0;
    const leakedChunks = [];

    for (const cand of candidates) {
      const candRole = (cand.structuralRole || '').toLowerCase();
      if (EXCLUDED_ROLES.has(candRole)) {
        frontMatterLeakCount++;
        leakedChunks.push({ id: cand.sectionId, role: candRole, title: cand.sectionTitle });
      }

      // Check for prominent standalone front-matter boilerplate in title
      const cleanTitle = (cand.sectionTitle || '').trim().toLowerCase();
      if (/^(?:table of contents|contents|copyright notice|all rights reserved)$/i.test(cleanTitle)) {
        frontMatterLeakCount++;
        leakedChunks.push({ id: cand.sectionId, role: candRole, title: cand.sectionTitle, reason: 'boilerplate_title' });
      }
    }

    const elapsedMs = Date.now() - startMs;
    const passed = frontMatterLeakCount === 0;

    if (!passed) {
      allPassed = false;
      console.error(`  ❌ Front matter leaked into candidate pool (${frontMatterLeakCount} chunks):`, leakedChunks);
    } else {
      console.log(`  ✓ Processed in ${elapsedMs}ms: ${totalChunks} chunks, candidates: ${candidates.length}, filtered: ${filtered.length}`);
      console.log(`    Role distribution:`, JSON.stringify(roleCounts));
      console.log(`    Leaks: 0 (No excluded structural roles in candidates)\n`);
    }

    fixtureReports.push({
      name: fix.name,
      totalChunks,
      roleCounts,
      editorialCandidateCount: candidates.length,
      frontMatterLeakCount,
      passed,
    });
  }

  // Summary report
  const summary = {
    total: fixtures.length,
    passed: fixtureReports.filter((r) => r.passed).length,
    failed: fixtureReports.filter((r) => !r.passed).length,
  };

  const report = {
    fixtures: fixtureReports,
    summary,
    pass: allPassed,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Report] Front matter filter report written to ${reportPath}`);
  console.log('[Report Summary]:', JSON.stringify(summary, null, 2));

  assert.strictEqual(allPassed, true, 'All 4 stress fixtures must have zero front matter leaks in editorial candidates');

  console.log('\n================================================================');
  console.log('🎉 FRONT/BACK MATTER FILTER TEST PASSED (0 LEAKS)');
  console.log('================================================================\n');
}

runFrontMatterFilterTest()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch((err) => {
    console.error('\n❌ FRONT/BACK MATTER FILTER TEST FAILED:', err);
    setTimeout(() => process.exit(1), 100);
  });

