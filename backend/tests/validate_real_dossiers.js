/**
 * Build 4.1 Task 10: Validation against Real Dossiers
 *
 * Runs editorial planning on:
 * 1. Avengers: Endgame dossier (book-dossier-1789304424944-uffe)
 * 2. Fantastic Four dossier (book-dossier-1789305609974-62v3)
 */

const assert = require('assert');
const bookRepository = require('../repositories/bookRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const sectionFilter = require('../services/synthesis/sectionFilter');
const redundancyDetector = require('../services/synthesis/redundancyDetector');
const editorialPlanner = require('../services/synthesis/editorialPlanner');
const editorialService = require('../services/synthesis/editorialService');
const { getDatabase } = require('../db/database');

async function validateDossier(bookId, dossierName) {
  console.log(`\n============================================================`);
  console.log(`VALIDATION: ${dossierName} (${bookId})`);
  console.log(`============================================================`);

  const book = bookRepository.getById(bookId);
  if (!book) {
    throw new Error(`Dossier book not found: ${bookId}`);
  }

  // 1. Gather raw sections from chunks
  const chunks = semanticChunkRepository.getByBookId(bookId);
  console.log(`[Input] Total source chunks retrieved: ${chunks.length}`);

  const rawSections = chunks.map((c) => ({
    sectionId: c.id,
    id: c.id,
    sourceId: bookId,
    sourceTitle: book.title,
    sectionTitle: c.sectionHeading || c.sourceReference || 'Section',
    sectionType: c.contentType || 'paragraph',
    contentType: book.content_type || 'research',
    wordCount: (c.textContent || '').split(/\s+/).filter(Boolean).length,
    summary: (c.textContent || '').slice(0, 140),
    keywords: (c.sectionHeading || '').split(/\s+/).filter((w) => w.length > 3),
    content: c.textContent || '',
  }));

  // 2. Filter low-information sections
  const { candidates, filtered } = sectionFilter.filter(rawSections);
  console.log(`[Section Filter] Input sections: ${rawSections.length}`);
  console.log(`[Section Filter] Candidate sections preserved: ${candidates.length}`);
  console.log(`[Section Filter] Low-information sections filtered: ${filtered.length}`);
  if (filtered.length > 0) {
    const reasons = {};
    filtered.forEach((f) => { reasons[f.reason] = (reasons[f.reason] || 0) + 1; });
    console.log(`[Section Filter] Filter reasons breakdown:`, reasons);
  }

  // 3. Cluster redundant concepts across sources
  const clusters = redundancyDetector.detect(candidates);
  const multiClusters = clusters.filter((c) => c.sectionIds.length > 1);
  const standalone = clusters.filter((c) => c.sectionIds.length === 1);
  console.log(`[Redundancy Detector] Total clusters detected: ${clusters.length} (${multiClusters.length} multi-source groups, ${standalone.length} standalone)`);

  // 4. Plan reader-oriented chapters
  const planResult = editorialPlanner.planDeterministic({
    contentType: book.content_type || 'research',
    isMultiSource: true,
    totalSections: candidates.length,
    candidateSections: candidates,
    topic: book.title,
  });

  console.log(`[Editorial Planner] Organization strategy chosen: ${planResult.organizationStrategy}`);
  console.log(`[Editorial Planner] Final chapter count: ${planResult.chapters.length}`);

  assert(planResult.chapters.length >= 5 && planResult.chapters.length <= 10,
    `Final chapter count (${planResult.chapters.length}) must be between 5 and 10`);

  // 5. Check provenance
  const validChunkIdSet = new Set(chunks.map((c) => c.id));
  let totalMappedSections = 0;

  console.log(`\n[Planned Chapters]`);
  planResult.chapters.forEach((ch, idx) => {
    console.log(`  Chapter ${idx + 1}: "${ch.title}"`);
    console.log(`    Purpose: ${ch.purpose}`);
    console.log(`    Based on: ${ch.sourceSectionIds.length} source section(s)`);

    // Verify each section ID exists in actual chunks
    for (const sid of ch.sourceSectionIds) {
      assert(validChunkIdSet.has(sid), `Section ID ${sid} must exist in actual source chunks`);
      totalMappedSections++;
    }
  });

  console.log(`\n[Provenance Verification] 100% of mapped sections (${totalMappedSections}) verified in database.`);

  // Also test end-to-end editorialService outline generation
  const outline = await editorialService.generateOutline({
    bookIds: [bookId],
    topic: book.title,
    fast: true,
  });

  console.log(`[End-to-End Service] Generated outlineId: ${outline.outlineId}, chapters: ${outline.chapters.length}`);
  assert(outline.chapters.length >= 5 && outline.chapters.length <= 10, 'Service output must have ~5-10 chapters');

  return {
    inputCount: rawSections.length,
    filteredCount: filtered.length,
    clustersCount: clusters.length,
    strategy: planResult.organizationStrategy,
    chapterCount: planResult.chapters.length,
    chapters: planResult.chapters,
  };
}

async function run() {
  const avengersBookId = 'book-dossier-1789304424944-uffe';
  const fantasticFourBookId = 'book-dossier-1789305609974-62v3';

  const avengersReport = await validateDossier(avengersBookId, 'Avengers: Endgame Dossier');
  const ffReport = await validateDossier(fantasticFourBookId, 'Fantastic Four Dossier');

  console.log('\n============================================================');
  console.log('VALIDATION COMPLETE: BOTH DOSSIERS FULLY COMPLIANT');
  console.log('============================================================\n');
}

run().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
