/**
 * Build 5.1b Provenance Resolution Contract Test Suite
 *
 * Verifies:
 * 1. C-Primary Arbitration in AttributionArbiter:
 *    - Test 1: C.top1 >= 0.65, margin >= 0.10 -> \"c_primary\" (high)
 *    - Test 2: C.top1 in [0.45, 0.65), A matches C -> \"c_verified_by_a\" (medium)
 *    - Test 3: C.top1 in [0.45, 0.65), A doesn't match C -> \"b_arbitrated\" (medium)
 *    - Test 4: C.top1 in [0.30, 0.45) -> \"b_weak_c\" (low)
 *    - Test 5: C.top1 < 0.30 -> \"ungrounded\" (none, grounded: false)
 * 2. AttributionRepository Database Persistence & Cascade Cleanup
 * 3. ProvenanceResolver End-to-End Verification & Formatting Contract
 */

const assert = require('assert');
const attributionArbiter = require('../services/semantic/attributionArbiter');
const provenanceResolver = require('../services/semantic/provenanceResolver');
const attributionRepository = require('../repositories/attributionRepository');
const chapterRepository = require('../repositories/chapterRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const bookRepository = require('../repositories/bookRepository');
const { getDatabase } = require('../db/database');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 5.1b: PROVENANCE RESOLUTION CONTRACT TESTS');
  console.log('================================================================\n');

  const sourceChunks = [
    { id: 'chk-alpha-1', sectionHeading: 'Overview', textContent: 'Machine learning models require clean data.' },
    { id: 'chk-alpha-2', sectionHeading: 'Architecture', textContent: 'Distributed systems manage parameter servers.' },
    { id: 'chk-alpha-3', sectionHeading: 'Evaluation', textContent: 'Validation loss and accuracy metrics determine generalization.' },
  ];

  // --------------------------------------------------------------------------
  // Test 1: C.top1 >= 0.65, margin >= 0.10 -> \"c_primary\"
  // --------------------------------------------------------------------------
  console.log('Test 1: C.top1 >= 0.65, margin >= 0.10 -> \"c_primary\"');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Machine learning data preparation establishes accuracy.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.88,
        top2: 0.45,
        margin: 0.43,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.80, 'chk-alpha-2': 0.15, 'chk-alpha-3': 0.05 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'c_primary');
    assert.strictEqual(res.confidence, 'high');
    assert.strictEqual(res.grounded, true);
    assert.strictEqual(res.chunk_ids[0], 'chk-alpha-1');
    assert(res.chunk_ids.length <= 3, 'Accepts up to top-3 chunks');
    console.log('  ✓ Test 1: High C with decisive margin resolves to c_primary accepting C top-3.');
  }

  // --------------------------------------------------------------------------
  // Test 2: C.top1 in [0.45, 0.65), A matches C -> \"c_verified_by_a\"
  // --------------------------------------------------------------------------
  console.log('Test 2: C.top1 in [0.45, 0.65), A matches C -> \"c_verified_by_a\"');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Pipeline data preprocessing minimizes distribution drift.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.58,
        top2: 0.52,
        margin: 0.06,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.55, 'chk-alpha-2': 0.45 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'c_verified_by_a');
    assert.strictEqual(res.confidence, 'medium');
    assert.strictEqual(res.grounded, true);
    assert.strictEqual(res.chunk_ids[0], 'chk-alpha-1');
    console.log('  ✓ Test 2: Medium C corroborated by Signal A resolves to c_verified_by_a.');
  }

  // --------------------------------------------------------------------------
  // Test 3: C.top1 in [0.45, 0.65), A doesn't match C -> \"b_arbitrated\"
  // --------------------------------------------------------------------------
  console.log('Test 3: C.top1 in [0.45, 0.65), A doesn\'t match C -> \"b_arbitrated\"');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Ambiguous passage where A and C point to different chunks.',
      A_claim: { weights: { 'chk-alpha-2': 1.0 } },
      C_signal: {
        top1: 0.58,
        top2: 0.50,
        margin: 0.08,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.60, 'chk-alpha-2': 0.40 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'b_arbitrated');
    assert.strictEqual(res.confidence, 'medium');
    assert.strictEqual(res.grounded, true);
    console.log('  ✓ Test 3: Medium C with conflicting Signal A triggers Signal B arbitration.');
  }

  // --------------------------------------------------------------------------
  // Test 4: C.top1 in [0.30, 0.45) -> \"b_weak_c\"
  // --------------------------------------------------------------------------
  console.log('Test 4: C.top1 in [0.30, 0.45) -> \"b_weak_c\"');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Weakly matched paragraph requiring LLM grounding check.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.38,
        top2: 0.28,
        margin: 0.10,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.70, 'chk-alpha-2': 0.30 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'b_weak_c');
    assert.strictEqual(res.confidence, 'low');
    assert.strictEqual(res.grounded, true);
    console.log('  ✓ Test 4: Low C similarity triggers b_weak_c with low confidence.');
  }

  // --------------------------------------------------------------------------
  // Test 5: C.top1 < 0.30 -> \"ungrounded\"
  // --------------------------------------------------------------------------
  console.log('Test 5: C.top1 < 0.30 -> \"ungrounded\"');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Completely ungrounded paragraph with irrelevant contents.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.22,
        top2: 0.15,
        margin: 0.07,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.60, 'chk-alpha-2': 0.40 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'ungrounded');
    assert.strictEqual(res.confidence, 'none');
    assert.strictEqual(res.grounded, false);
    assert.strictEqual(res.chunk_ids.length, 0);
    console.log('  ✓ Test 5: C.top1 < 0.30 marked ungrounded without firing B.');
  }

  // --------------------------------------------------------------------------
  // Test 6: Database Persistence & AttributionRepository
  // --------------------------------------------------------------------------
  console.log('Test 6: Database Persistence & AttributionRepository');
  {
    const testRepId = `rep-test-persistence-${Date.now()}`;
    const db = getDatabase();
    db.prepare(`
      INSERT INTO chapter_representations (id, chapter_id, book_id, type, content, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testRepId, 'ch-dummy-p', 'book-dummy-p', 'EDITORIAL_SYNTHESIS', 'Sample content.', '{}', new Date().toISOString());

    const testAttrs = [
      {
        id: `attr-${testRepId}-0`,
        representation_id: testRepId,
        paragraph_index: 0,
        segments: [{ sentence_start: 0, sentence_end: 1, chunk_id: 'chk-alpha-1', confidence: 0.92 }],
        source_chunk_ids: ['chk-alpha-1'],
        weights: { 'chk-alpha-1': 1.0 },
        method: 'c_primary',
        confidence: 'high',
        grounded: true,
        verified_at: new Date().toISOString(),
        fell_back: false,
        fallback_reason: null,
      },
      {
        id: `attr-${testRepId}-1`,
        representation_id: testRepId,
        paragraph_index: 1,
        segments: [{ sentence_start: 0, sentence_end: 0, chunk_id: 'chk-alpha-2', confidence: 0.77 }],
        source_chunk_ids: ['chk-alpha-2'],
        weights: { 'chk-alpha-2': 1.0 },
        method: 'c_verified_by_a',
        confidence: 'medium',
        grounded: true,
        verified_at: new Date().toISOString(),
        fell_back: false,
        fallback_reason: null,
      },
    ];

    const saved = attributionRepository.createBatch(testAttrs);
    assert.strictEqual(saved.length, 2, 'Batch insert must persist 2 rows');

    const fetched = attributionRepository.getByRepresentationId(testRepId);
    assert.strictEqual(fetched.length, 2);
    assert.strictEqual(fetched[0].method, 'c_primary');
    assert.strictEqual(fetched[0].grounded, true);
    assert.strictEqual(fetched[1].method, 'c_verified_by_a');

    const delCount = attributionRepository.deleteByRepresentationId(testRepId);
    assert.strictEqual(delCount, 2, 'Delete must remove the 2 rows');
    assert.strictEqual(attributionRepository.getByRepresentationId(testRepId).length, 0);

    // Verify foreign key ON DELETE CASCADE from chapter_representations
    const cascadeRepId = 'rep-test-cascade-fk';
    chapterRepository.saveRepresentation({
      id: cascadeRepId,
      chapterId: 'ch-test-cascade',
      bookId: 'book-sample-lightnovel-1',
      type: 'EDITORIAL_SYNTHESIS',
      content: 'Sample content for FK cascade verification.',
      metadata: {},
      provenance: [],
    });
    attributionRepository.createBatch([
      {
        representation_id: cascadeRepId,
        paragraph_index: 0,
        segments: [],
        source_chunk_ids: [],
        weights: {},
        method: 'c_primary',
        confidence: 'high',
        grounded: true,
      },
    ]);
    assert.strictEqual(attributionRepository.getByRepresentationId(cascadeRepId).length, 1);
    chapterRepository.deleteRepresentation(cascadeRepId);
    assert.strictEqual(
      attributionRepository.getByRepresentationId(cascadeRepId).length,
      0,
      'Deleting chapter_representation must cascade delete paragraph_attributions'
    );

    console.log('  ✓ AttributionRepository batch insert, retrieval, delete, and FK ON DELETE CASCADE confirmed.');
  }

  // --------------------------------------------------------------------------
  // Test 7: End-to-End ProvenanceResolver Contract
  // --------------------------------------------------------------------------
  console.log('Test 7: End-to-End ProvenanceResolver Contract');
  {
    // Create temporary book and chunks for full end-to-end verification
    const bookId = `book-test-prov-${Date.now()}`;
    bookRepository.create({
      id: bookId,
      title: 'Provenance Verification Test Book',
      content_type: 'research',
    });

    const chunk1 = semanticChunkRepository.create({
      id: `chk-${bookId}-1`,
      book_id: bookId,
      chapter_id: 'ch-dummy-1',
      sequence: 0,
      section_heading: 'Supervised Learning',
      text_content: 'Supervised learning models train on labelled datasets to make accurate predictions.',
    });

    const chunk2 = semanticChunkRepository.create({
      id: `chk-${bookId}-2`,
      book_id: bookId,
      chapter_id: 'ch-dummy-2',
      sequence: 1,
      section_heading: 'Unsupervised Learning',
      text_content: 'Clustering and dimensionality reduction extract patterns from unlabelled datasets.',
    });

    const repId = `rep-cross-${bookId}-ch-1`;
    const smartContent = `Supervised learning leverages ground truth labels to build predictive functions. Labelled instances guide gradient optimization.\n\nClustering algorithms group unlabelled data points by latent geometric features.`;

    chapterRepository.saveRepresentation({
      id: repId,
      chapterId: 'ch-1',
      bookId,
      type: 'EDITORIAL_SYNTHESIS',
      content: smartContent,
      metadata: {
        outlineId: `outline-${bookId}`,
        chapterId: 'ch-1',
        title: 'Learning Paradigms',
        provenance: [chunk1.id, chunk2.id],
        claimed_attributions: [
          { paragraph_index: 0, weights: { [chunk1.id]: 1.0 } },
          { paragraph_index: 1, weights: { [chunk2.id]: 1.0 } },
        ],
      },
      provenance: [chunk1.id, chunk2.id],
    });

    const result = await provenanceResolver.verifyRepresentation(repId, { fast: true, force: true });
    assert.strictEqual(result.representation_id, repId);
    assert.strictEqual(result.paragraphs.length, 2, 'Must resolve exactly 2 paragraphs');
    assert(result.paragraphs[0].segments.length >= 1, 'Paragraph 0 must have at least 1 segment');
    assert(result.paragraphs[1].segments.length >= 1, 'Paragraph 1 must have at least 1 segment');

    // Test formatted contract output
    const formatted = provenanceResolver.getProvenance(repId);
    assert.strictEqual(formatted.representation_id, repId);
    assert.strictEqual(formatted.paragraphs.length, 2);
    assert.strictEqual(formatted.paragraphs[0].paragraph_index, 0);
    assert.strictEqual(formatted.paragraphs[1].paragraph_index, 1);
    assert(formatted.paragraphs[0].source_chunk_ids.includes(chunk1.id));
    assert(formatted.paragraphs[1].source_chunk_ids.includes(chunk2.id));

    // Test nonexistent representation contract
    const empty = provenanceResolver.getProvenance('rep-non-existent');
    assert.strictEqual(empty.representation_id, 'rep-non-existent');
    assert.strictEqual(empty.verified_at, null);
    assert.deepStrictEqual(empty.paragraphs, []);

    // Cleanup synthetic test records
    attributionRepository.deleteByRepresentationId(repId);
    chapterRepository.deleteRepresentation(repId);
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    } catch {}

    console.log('  ✓ End-to-end ProvenanceResolver verification and API contract passed cleanly.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL BUILD 5.1b PROVENANCE CONTRACT TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ BUILD 5.1b TEST FAILED:', err);
  process.exit(1);
});
