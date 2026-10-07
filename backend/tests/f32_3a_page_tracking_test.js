/**
 * backend/tests/f32_3a_page_tracking_test.js
 *
 * Test suite for F32.3a: Page tracking in canonical blocks and TOC builder integration.
 * Verifies that blocksFromText reads page markers, assigns sourcePage (1-indexed),
 * assigns null when no markers exist (non-PDF), handles single-page and multi-page PDFs,
 * and allows buildChaptersFromToc to execute without falling back.
 */

'use strict';

const assert = require('assert');
const documentStructureEngine = require('../services/structure/documentStructureEngine');

function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F32.3A PAGE TRACKING TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(name) {
    console.log(`[PASS] ${name}`);
    passed++;
  }

  function fail(name, err) {
    console.log(`[FAIL] ${name}\n${err.stack || err}`);
    failed++;
  }

  // T1: blocksFromText assigns `sourcePage` when page markers exist
  try {
    const rawText = "Page 1 intro text.\n\nPage 1 body.\fPage 2 start.\n\nPage 2 body.";
    const blocks = documentStructureEngine.blocksFromText(rawText, 'text');
    assert.strictEqual(blocks.length, 4, `Expected 4 blocks, got ${blocks.length}`);
    assert.strictEqual(blocks[0].sourcePage, 1);
    assert.strictEqual(blocks[1].sourcePage, 1);
    assert.strictEqual(blocks[2].sourcePage, 2);
    assert.strictEqual(blocks[3].sourcePage, 2);
    pass('T1: blocksFromText assigns sourcePage when page markers exist');
  } catch (err) {
    fail('T1: blocksFromText assigns sourcePage when page markers exist', err);
  }

  // T2: blocksFromText assigns `sourcePage` = null when no page info present
  try {
    const rawText = "# Chapter 1\n\nThis is paragraph one without page markers.\n\nParagraph two.";
    const blocks = documentStructureEngine.blocksFromText(rawText, 'markdown');
    assert.strictEqual(blocks.length, 3, `Expected 3 blocks, got ${blocks.length}`);
    assert.strictEqual(blocks[0].sourcePage, null);
    assert.strictEqual(blocks[1].sourcePage, null);
    assert.strictEqual(blocks[2].sourcePage, null);
    pass('T2: blocksFromText assigns sourcePage = null when no page info present');
  } catch (err) {
    fail('T2: blocksFromText assigns sourcePage = null when no page info present', err);
  }

  // T3: Multi-page PDF with 3 pages produces blocks with pages [1,1,2,2,3]
  try {
    const rawText = "Page 1 Para 1\n\nPage 1 Para 2\fPage 2 Para 1\n\nPage 2 Para 2\fPage 3 Para 1";
    const blocks = documentStructureEngine.blocksFromText(rawText, 'pdf');
    assert.strictEqual(blocks.length, 5, `Expected 5 blocks, got ${blocks.length}`);
    const pages = blocks.map((b) => b.sourcePage);
    assert.deepStrictEqual(pages, [1, 1, 2, 2, 3], `Expected pages [1, 1, 2, 2, 3], got ${JSON.stringify(pages)}`);
    pass('T3: Multi-page PDF with 3 pages produces blocks with pages [1,1,2,2,3]');
  } catch (err) {
    fail('T3: Multi-page PDF with 3 pages produces blocks with pages [1,1,2,2,3]', err);
  }

  // T4: Single-page PDF produces blocks all with page 1
  try {
    const rawText = "Single page header\n\nSingle page paragraph text";
    const blocks = documentStructureEngine.blocksFromText(rawText, 'pdf');
    assert.strictEqual(blocks.length, 2, `Expected 2 blocks, got ${blocks.length}`);
    assert.strictEqual(blocks[0].sourcePage, 1);
    assert.strictEqual(blocks[1].sourcePage, 1);
    pass('T4: Single-page PDF produces blocks all with page 1');
  } catch (err) {
    fail('T4: Single-page PDF produces blocks all with page 1', err);
  }

  // T5: buildChaptersFromToc with these blocks no longer returns null
  try {
    const rawText = "Intro to ML\n\nBasics\fChapter 1 Foundations\n\nConcepts\fChapter 2 Pipelines\n\nDetails";
    const blocks = documentStructureEngine.blocksFromText(rawText, 'pdf');
    const mockToc = [
      { level: 1, title: 'Intro to ML', page: 1 },
      { level: 1, title: 'Chapter 1 Foundations', page: 2 },
      { level: 1, title: 'Chapter 2 Pipelines', page: 3 },
    ];
    const chapters = documentStructureEngine.buildChaptersFromToc(mockToc, blocks, { title: 'Test Book' });
    assert.ok(chapters !== null, 'Expected buildChaptersFromToc to not return null');
    assert.strictEqual(chapters.length, 3, `Expected 3 chapters, got ${chapters ? chapters.length : 0}`);
    assert.strictEqual(chapters[0].title, 'Intro to ML');
    assert.strictEqual(chapters[1].title, 'Chapter 1 Foundations');
    assert.strictEqual(chapters[2].title, 'Chapter 2 Pipelines');
    pass('T5: buildChaptersFromToc with these blocks no longer returns null');
  } catch (err) {
    fail('T5: buildChaptersFromToc with these blocks no longer returns null', err);
  }

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

