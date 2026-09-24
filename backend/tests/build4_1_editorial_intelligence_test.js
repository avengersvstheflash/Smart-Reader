/**
 * Build 4.1 Editorial Intelligence Test Suite
 *
 * Covers:
 * - Test 1: sectionFilter excludes author/date/bibliography/navigation/etc.
 * - Test 2: sectionFilter preserves academic/content sections even with academic-sounding titles.
 * - Test 3: redundancyDetector groups 'Introduction' + 'Introduction' + 'Overview' into one cluster.
 * - Test 4: redundancyDetector does NOT force unrelated sections into clusters.
 * - Test 5: editorialPlanner output schema is valid (chapters have title, purpose, sourceSectionIds, topics, order).
 * - Test 6: every sourceSectionId in planner output exists in input. Invalid IDs are discarded.
 * - Test 7: planner selects organizationStrategy='thematic' for multi-source dossier.
 * - Test 8: planner selects organizationStrategy='chronological' for narrative content.
 * - Test 9: planner produces 5–10 chapters for a synthetic 40-section dossier.
 * - Test 10: planner does NOT produce one chapter per source section.
 * - Test 11: planner fails honestly (status='failed') when AI returns invalid JSON — does NOT substitute a deterministic outline.
 * - Test 12: regeneration invalidates stale representations.
 * - Test 13: regeneration preserves original source material.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// System modules
const sectionFilter = require('../services/synthesis/sectionFilter');
const redundancyDetector = require('../services/synthesis/redundancyDetector');
const editorialPlanner = require('../services/synthesis/editorialPlanner');
const editorialService = require('../services/synthesis/editorialService');
const synthesisService = require('../services/synthesis/synthesisService');
const bookRepository = require('../repositories/bookRepository');
const chapterRepository = require('../repositories/chapterRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const outlineRepository = require('../repositories/outlineRepository');
const { getDatabase } = require('../db/database');

async function runTests() {
  console.log('====================================================');
  console.log('BUILD 4.1: EDITORIAL INTELLIGENCE VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${err.message}`);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }

  async function runAsyncTest(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${err.message}`);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }

  // ----------------------------------------------------
  // Test 1: sectionFilter excludes author/date/bibliography/navigation/etc.
  // ----------------------------------------------------
  runTest("Test 1: sectionFilter excludes author/date/bibliography/navigation/etc.", () => {
    const sections = [
      { sectionId: 's1', sectionTitle: 'Byline: Written by John Doe', wordCount: 25 },
      { sectionId: 's2', sectionTitle: 'Published Date', wordCount: 15 },
      { sectionId: 's3', sectionTitle: 'Bibliography and Works Cited', wordCount: 450 },
      { sectionId: 's4', sectionTitle: 'Navigation Menu', wordCount: 30 },
      { sectionId: 's5', sectionTitle: 'Subscribe to Newsletter', wordCount: 20 },
      { sectionId: 's6', sectionTitle: 'Sign In / Register', wordCount: 15 },
      { sectionId: 's7', sectionTitle: '---', sectionType: 'separator', wordCount: 5 },
      { sectionId: 's8', sectionTitle: 'Tiny Stub', wordCount: 20, summary: '' },
      { sectionId: 's9', sectionTitle: 'Core Scientific Argument', wordCount: 350, summary: 'A deep analysis of empirical trends' },
    ];

    const { candidates, filtered } = sectionFilter.filter(sections);

    const filteredIds = filtered.map((f) => f.sectionId);
    assert.strictEqual(candidates.length, 1, 'Only meaningful content section should be a candidate');
    assert.strictEqual(candidates[0].sectionId, 's9');
    assert(filteredIds.includes('s1'), 'Author byline should be filtered');
    assert(filteredIds.includes('s2'), 'Date should be filtered');
    assert(filteredIds.includes('s3'), 'Bibliography should be filtered');
    assert(filteredIds.includes('s4'), 'Navigation should be filtered');
    assert(filteredIds.includes('s5'), 'Subscribe should be filtered');
    assert(filteredIds.includes('s6'), 'Sign in should be filtered');
    assert(filteredIds.includes('s7'), 'Separator should be filtered');
    assert(filteredIds.includes('s8'), 'Tiny stub (<50 words, no summary) should be filtered');
  });

  // ----------------------------------------------------
  // Test 2: sectionFilter preserves academic/content sections even with academic-sounding titles
  // ----------------------------------------------------
  runTest("Test 2: sectionFilter preserves academic/content sections even with academic-sounding titles", () => {
    const sections = [
      {
        sectionId: 'ac-1',
        sectionTitle: 'Methodology and Experimental Design',
        wordCount: 450,
        summary: 'Detailed explanation of empirical protocol and baseline models',
      },
      {
        sectionId: 'ac-2',
        sectionTitle: 'Theoretical Implications for Quantum Coherence',
        wordCount: 820,
        summary: 'Discussion of quantum decoherence limits in macroscopic states',
      },
      {
        sectionId: 'ac-3',
        sectionTitle: 'Dissertation Committee Observations on Macroeconomic Policy',
        wordCount: 380,
        summary: 'Detailed evaluation of monetary tightening across emerging economies',
      },
    ];

    const { candidates, filtered } = sectionFilter.filter(sections);
    assert.strictEqual(candidates.length, 3, 'All substantial academic content sections must be preserved');
    assert.strictEqual(filtered.length, 0, 'No substantial academic sections should be dropped');
  });

  // ----------------------------------------------------
  // Test 3: redundancyDetector groups 'Introduction' + 'Introduction' + 'Overview' into one cluster
  // ----------------------------------------------------
  runTest("Test 3: redundancyDetector groups 'Introduction' + 'Introduction' + 'Overview' into one cluster", () => {
    const sections = [
      { sectionId: 's-intro-1', sourceId: 'src1', sectionTitle: 'Source 1: Introduction', wordCount: 200 },
      { sectionId: 's-intro-2', sourceId: 'src2', sectionTitle: 'Source 2: Introduction', wordCount: 220 },
      { sectionId: 's-intro-3', sourceId: 'src3', sectionTitle: 'Source 3: Overview and Background', wordCount: 190 },
      { sectionId: 's-plot', sourceId: 'src1', sectionTitle: 'Plot and Storyline', wordCount: 600 },
    ];

    const clusters = redundancyDetector.detect(sections);
    const introCluster = clusters.find((c) =>
      c.sectionIds.includes('s-intro-1') &&
      c.sectionIds.includes('s-intro-2') &&
      c.sectionIds.includes('s-intro-3')
    );

    assert(introCluster, 'Expected intro and overview sections to be grouped in one cluster');
    assert.strictEqual(introCluster.sectionIds.length, 3, 'Intro cluster should contain all 3 sections');
  });

  // ----------------------------------------------------
  // Test 4: redundancyDetector does NOT force unrelated sections into clusters
  // ----------------------------------------------------
  runTest("Test 4: redundancyDetector does NOT force unrelated sections into clusters", () => {
    const sections = [
      { sectionId: 'un-1', sourceId: 'src1', sectionTitle: 'Aerodynamics of Supersonic Flight', summary: 'Mach 3 boundary layer heating', keywords: ['aerodynamics', 'supersonic', 'mach'] },
      { sectionId: 'un-2', sourceId: 'src2', sectionTitle: 'Renaissance Fresco Pigments in Florence', summary: 'Lapis lazuli and egg tempera binding', keywords: ['renaissance', 'fresco', 'tempera'] },
      { sectionId: 'un-3', sourceId: 'src3', sectionTitle: 'Photosynthetic Electron Transport in Cyanobacteria', summary: 'Photosystem II water oxidation', keywords: ['cyanobacteria', 'photosystem', 'oxidation'] },
    ];

    const clusters = redundancyDetector.detect(sections);
    const multiClusters = clusters.filter((c) => c.sectionIds.length > 1);

    assert.strictEqual(multiClusters.length, 0, 'Unrelated sections must NOT be forced into multi-section clusters');
    assert.strictEqual(clusters.length, 3, 'Each unrelated section should have its own cluster or standalone slot');
  });

  // ----------------------------------------------------
  // Test 5: editorialPlanner output schema is valid
  // ----------------------------------------------------
  async function testPlannerSchema() {
    const mockAi = {
      generateText: async () => ({
        text: JSON.stringify({
          organizationStrategy: 'thematic',
          chapters: [
            {
              title: 'Chapter 1: Genesis & Origins',
              purpose: 'Synthesizes early background across sources',
              sourceSectionIds: ['sec-1', 'sec-2'],
              topics: ['history', 'origins'],
              order: 1,
            },
            {
              title: 'Chapter 2: Core Developments',
              purpose: 'Analyzes major milestones',
              sourceSectionIds: ['sec-3'],
              topics: ['development'],
              order: 2,
            },
          ],
        }),
      }),
    };

    const input = {
      contentType: 'research',
      isMultiSource: true,
      candidateSections: [
        { sectionId: 'sec-1', sectionTitle: 'Source A Intro' },
        { sectionId: 'sec-2', sectionTitle: 'Source B Intro' },
        { sectionId: 'sec-3', sectionTitle: 'Source A Production' },
      ],
    };

    const result = await editorialPlanner.plan(input, { aiService: mockAi });
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.organizationStrategy, 'thematic');
    assert(Array.isArray(result.chapters));
    assert.strictEqual(result.chapters.length, 2);

    for (const ch of result.chapters) {
      assert(typeof ch.title === 'string' && ch.title.length > 0, 'Chapter must have title');
      assert(typeof ch.purpose === 'string', 'Chapter must have purpose');
      assert(Array.isArray(ch.sourceSectionIds), 'Chapter must have sourceSectionIds array');
      assert(Array.isArray(ch.topics), 'Chapter must have topics array');
      assert(typeof ch.order === 'number', 'Chapter must have order number');
    }
  }
  await runAsyncTest("Test 5: editorialPlanner output schema is valid", testPlannerSchema);

  // ----------------------------------------------------
  // Test 6: every sourceSectionId in planner output exists in input. Invalid IDs are discarded.
  // ----------------------------------------------------
  async function testDiscardInvalidIds() {
    const mockAi = {
      generateText: async () => ({
        text: JSON.stringify({
          organizationStrategy: 'thematic',
          chapters: [
            {
              title: 'Hallucinated Chapter',
              purpose: 'Testing ID sanitization',
              sourceSectionIds: ['valid-1', 'fake-hallucinated-id-999', 'valid-2'],
              topics: ['test'],
              order: 1,
            },
          ],
        }),
      }),
    };

    const input = {
      contentType: 'research',
      candidateSections: [
        { sectionId: 'valid-1', sectionTitle: 'Valid Section 1' },
        { sectionId: 'valid-2', sectionTitle: 'Valid Section 2' },
      ],
    };

    const result = await editorialPlanner.plan(input, { aiService: mockAi });
    assert.strictEqual(result.status, 'success');
    const ch = result.chapters[0];
    assert.deepStrictEqual(ch.sourceSectionIds, ['valid-1', 'valid-2'], 'Hallucinated section ID must be discarded');
    assert(!ch.sourceSectionIds.includes('fake-hallucinated-id-999'));
  }
  await runAsyncTest("Test 6: every sourceSectionId in planner output exists in input. Invalid IDs are discarded.", testDiscardInvalidIds);

  // ----------------------------------------------------
  // Test 7: planner selects organizationStrategy='thematic' for multi-source dossier
  // ----------------------------------------------------
  runTest("Test 7: planner selects organizationStrategy='thematic' for multi-source dossier", () => {
    const strat1 = editorialPlanner.selectStrategy('research', true);
    const strat2 = editorialPlanner.selectStrategy('dossier', false);
    const strat3 = editorialPlanner.selectStrategy('general', true);

    assert.strictEqual(strat1, 'thematic');
    assert.strictEqual(strat2, 'thematic');
    assert.strictEqual(strat3, 'thematic');
  });

  // ----------------------------------------------------
  // Test 8: planner selects organizationStrategy='chronological' for narrative content
  // ----------------------------------------------------
  runTest("Test 8: planner selects organizationStrategy='chronological' for narrative content", () => {
    const stratNovel = editorialPlanner.selectStrategy('novel', false);
    const stratNarrative = editorialPlanner.selectStrategy('narrative', false);
    const stratFiction = editorialPlanner.selectStrategy('fiction', false);
    const stratHistory = editorialPlanner.selectStrategy('history', false);

    assert.strictEqual(stratNovel, 'chronological');
    assert.strictEqual(stratNarrative, 'chronological');
    assert.strictEqual(stratFiction, 'chronological');
    assert.strictEqual(stratHistory, 'chronological');
  });

  // ----------------------------------------------------
  // Test 9: planner produces 5–10 chapters for a synthetic 40-section dossier
  // ----------------------------------------------------
  runTest("Test 9: planner produces 5–10 chapters for a synthetic 40-section dossier", () => {
    const syntheticSections = [];
    const sourceNames = ['Wikipedia', 'Variety', 'The Hollywood Reporter', 'Box Office Mojo'];
    const sectionTypes = ['Introduction', 'Plot', 'Cast', 'Production', 'Visual Effects', 'Music & Score', 'Release & Marketing', 'Critical Reception', 'Box Office', 'Legacy & Sequels'];

    let secId = 1;
    for (const src of sourceNames) {
      for (const st of sectionTypes) {
        syntheticSections.push({
          sectionId: `syn-sec-${secId++}`,
          sourceId: `src-${src.toLowerCase().replace(/\s+/g, '-')}`,
          sourceTitle: src,
          sectionTitle: `${src}: ${st}`,
          wordCount: 200,
          summary: `Summary of ${st} from ${src}`,
        });
      }
    }

    assert.strictEqual(syntheticSections.length, 40, 'Should have 40 synthetic sections');

    const result = editorialPlanner.planDeterministic({
      contentType: 'dossier',
      isMultiSource: true,
      candidateSections: syntheticSections,
    });

    assert.strictEqual(result.status, 'success');
    const count = result.chapters.length;
    assert(count >= 5 && count <= 10, `Chapter count (${count}) must be between 5 and 10`);
  });

  // ----------------------------------------------------
  // Test 10: planner does NOT produce one chapter per source section
  // ----------------------------------------------------
  runTest("Test 10: planner does NOT produce one chapter per source section", () => {
    const syntheticSections = [];
    for (let i = 1; i <= 36; i++) {
      syntheticSections.push({
        sectionId: `sec-${i}`,
        sourceId: `source-${(i % 3) + 1}`,
        sectionTitle: `Section ${i}: ${['Introduction', 'Plot', 'Production', 'Reception'][i % 4]}`,
        wordCount: 180,
      });
    }

    const result = editorialPlanner.planDeterministic({
      contentType: 'dossier',
      isMultiSource: true,
      candidateSections: syntheticSections,
    });

    assert.notStrictEqual(result.chapters.length, 36, 'Must NOT produce one chapter per source section');
    assert(result.chapters.length <= 10, 'Must produce consolidated chapters');
    // Ensure multiple sections per chapter
    const averageSectionsPerChapter = syntheticSections.length / result.chapters.length;
    assert(averageSectionsPerChapter >= 3, 'Chapters should aggregate multiple source sections');
  });

  // ----------------------------------------------------
  // Test 11: planner fails honestly (status='failed') when AI returns invalid JSON — does NOT substitute a deterministic outline
  // ----------------------------------------------------
  async function testPlannerFailsHonestly() {
    const mockFailingAi = {
      generateText: async () => ({
        text: 'This is an unparseable response that is not JSON at all!',
      }),
    };

    const input = {
      contentType: 'research',
      candidateSections: [
        { sectionId: 'sec-1', sectionTitle: 'Section 1' },
        { sectionId: 'sec-2', sectionTitle: 'Section 2' },
      ],
    };

    const result = await editorialPlanner.plan(input, { aiService: mockFailingAi });
    assert.strictEqual(result.status, 'failed', 'Planner must report status failed when AI returns invalid JSON');
    assert(typeof result.reason === 'string', 'Failure reason must be provided');
    assert(!result.chapters, 'Must NOT silently substitute a deterministic outline when AI failed');
  }
  await runAsyncTest("Test 11: planner fails honestly (status='failed') when AI returns invalid JSON", testPlannerFailsHonestly);

  // ----------------------------------------------------
  // Test 12: regeneration invalidates stale representations
  // ----------------------------------------------------
  async function testRegenerationInvalidatesStale() {
    // Create temporary books and chunks
    const b1 = bookRepository.create({
      title: 'Regen Source Alpha',
      author: 'Test Author A',
      content_type: 'research',
    });
    const b2 = bookRepository.create({
      title: 'Regen Source Beta',
      author: 'Test Author B',
      content_type: 'research',
    });

    const c1 = semanticChunkRepository.create({
      book_id: b1.id,
      sequence_index: 0,
      text_content: 'Deep analysis of quantum computing hardware architectures and qubit coherence.',
      token_count: 50,
      section_heading: 'Hardware Architecture',
    });
    const c2 = semanticChunkRepository.create({
      book_id: b2.id,
      sequence_index: 0,
      text_content: 'Comparative study of topological versus superconducting qubit fault tolerance.',
      token_count: 50,
      section_heading: 'Fault Tolerance',
    });

    // Generate initial outline
    const initialOutline = await editorialService.generateOutline({
      bookIds: [b1.id, b2.id],
      topic: 'Quantum Hardware',
      fast: true,
    });

    assert(initialOutline && initialOutline.outlineId);
    const targetChapter = initialOutline.chapters[0];

    // Synthesize chapter representation
    const synthResult = await synthesisService.synthesizeChapter(
      initialOutline.outlineId,
      targetChapter.chapterId,
      { fast: true }
    );
    assert(synthResult.representation);

    // Verify representation exists in database
    const initialReps = chapterRepository.getRepresentations(targetChapter.chapterId);
    assert(initialReps.length > 0, 'Synthesized representation should exist in DB');

    // Call regeneration
    const regenerated = await editorialService.regenerateOutline(initialOutline.outlineId, {
      bookIds: [b1.id, b2.id],
      fast: true,
    });

    assert.strictEqual(regenerated.outlineId, initialOutline.outlineId, 'Regenerated outline preserves the same outlineId');

    // Verify stale representations were invalidated
    const staleReps = chapterRepository.getRepresentations(targetChapter.chapterId);
    assert.strictEqual(staleReps.length, 0, 'Stale synthesized representations must be invalidated on regeneration');

    // Clean up
    editorialService.deleteOutline(initialOutline.outlineId);
    bookRepository.delete(b1.id);
    bookRepository.delete(b2.id);
  }
  await runAsyncTest("Test 12: regeneration invalidates stale representations", testRegenerationInvalidatesStale);

  // ----------------------------------------------------
  // Test 13: regeneration preserves original source material
  // ----------------------------------------------------
  async function testRegenerationPreservesSources() {
    const b1 = bookRepository.create({
      title: 'Source Material Integrity A',
      author: 'Author A',
      content_type: 'research',
    });
    const b2 = bookRepository.create({
      title: 'Source Material Integrity B',
      author: 'Author B',
      content_type: 'research',
    });

    const c1 = semanticChunkRepository.create({
      book_id: b1.id,
      sequence_index: 0,
      text_content: 'Original source text that must never be modified or deleted during regeneration.',
      token_count: 40,
      section_heading: 'Preserved Evidence A',
    });
    const c2 = semanticChunkRepository.create({
      book_id: b2.id,
      sequence_index: 0,
      text_content: 'Second original source text providing complementary empirical findings.',
      token_count: 40,
      section_heading: 'Preserved Evidence B',
    });

    const outline = await editorialService.generateOutline({
      bookIds: [b1.id, b2.id],
      fast: true,
    });

    // Perform regeneration
    await editorialService.regenerateOutline(outline.outlineId, {
      bookIds: [b1.id, b2.id],
      fast: true,
    });

    // Check that books and original chunks are completely intact
    const verifyB1 = bookRepository.getById(b1.id);
    const verifyB2 = bookRepository.getById(b2.id);
    const verifyC1 = semanticChunkRepository.getById(c1.id);
    const verifyC2 = semanticChunkRepository.getById(c2.id);

    assert(verifyB1, 'Book 1 must remain intact');
    assert(verifyB2, 'Book 2 must remain intact');
    assert(verifyC1, 'Chunk 1 must remain intact');
    assert(verifyC2, 'Chunk 2 must remain intact');
    assert.strictEqual(verifyC1.textContent, c1.textContent, 'Original text content must not be corrupted');

    // Clean up
    editorialService.deleteOutline(outline.outlineId);
    bookRepository.delete(b1.id);
    bookRepository.delete(b2.id);
  }
  await runAsyncTest("Test 13: regeneration preserves original source material", testRegenerationPreservesSources);

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Fatal error running test suite:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
