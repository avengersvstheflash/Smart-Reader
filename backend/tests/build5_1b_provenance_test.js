/**
 * Build 5.1b Provenance Resolution Contract Test Suite
 *
 * Verifies:
 * 1. 8-Case Decision Matrix in AttributionArbiter:
 *    - Case 1: A_valid && A_vs_C >= 0.85 -> "a_verified_by_c" (high)
 *    - Case 2: A_valid && 0.60 <= A_vs_C < 0.85 -> "b_arbitrated" (medium)
 *    - Case 3: A_valid && A_vs_C < 0.60 -> "b_replaced_a" (medium)
 *    - Case 4: !A_valid && C_margin >= 0.15 -> "c_only" (medium)
 *    - Case 5: !A_valid && C_margin < 0.15 -> "b_after_invalid_a" (low)
 *    - Case 6: A_missing && C_margin >= 0.15 -> "c_only" (medium)
 *    - Case 7: A_missing && C_margin < 0.15 -> "b_after_missing_a" (low)
 *    - Case 8: C.top1 < 0.45 -> "ungrounded" (none, grounded: false)
 * 2. Sentence-level Segmentation & Run Grouping
 * 3. AttributionRepository Database Persistence & Cascade Cleanup
 * 4. ProvenanceResolver End-to-End Verification & Formatting Contract
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
  // Test 1: Case 8 - Ungrounded Floor (C.top1 < 0.45)
  // --------------------------------------------------------------------------
  console.log('Test 1: Case 8 - Ungrounded Floor (C.top1 < 0.45)');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Unrelated topic completely absent from the source material.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.38,
        top2: 0.22,
        margin: 0.16,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.6, 'chk-alpha-2': 0.4 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'ungrounded', 'Method must be ungrounded');
    assert.strictEqual(res.confidence, 'none', 'Confidence must be none');
    assert.strictEqual(res.grounded, false, 'Grounded must be false');
    assert.strictEqual(res.chunk_ids.length, 0, 'Chunk IDs must be empty');
    console.log('  ✓ Case 8: C.top1 < 0.45 correctly marked ungrounded without firing B.');
  }

  // --------------------------------------------------------------------------
  // Test 2: Case 1 - A_valid && A_vs_C >= 0.85 ("a_verified_by_c")
  // --------------------------------------------------------------------------
  console.log('Test 2: Case 1 - A_valid && A_vs_C >= 0.85 ("a_verified_by_c")');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Machine learning data preparation establishes accuracy.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.88,
        top2: 0.45,
        margin: 0.43,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.95, 'chk-alpha-2': 0.05 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'a_verified_by_c');
    assert.strictEqual(res.confidence, 'high');
    assert.strictEqual(res.grounded, true);
    assert.deepStrictEqual(res.chunk_ids, ['chk-alpha-1']);
    console.log('  ✓ Case 1: A accepted and verified by C with high confidence.');
  }

  // --------------------------------------------------------------------------
  // Test 3: Case 2 - A_valid && 0.60 <= A_vs_C < 0.85 ("b_arbitrated")
  // --------------------------------------------------------------------------
  console.log('Test 3: Case 2 - A_valid && 0.60 <= A_vs_C < 0.85 ("b_arbitrated")');
  {
    // A claims chk-alpha-1 (0.9) and chk-alpha-2 (0.1)
    // C weights chk-alpha-1 (0.4) and chk-alpha-2 (0.6) -> cosine sim approx 0.64 in [0.60, 0.85)
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Both pipeline data and architecture determine throughput.',
      A_claim: { weights: { 'chk-alpha-1': 0.9, 'chk-alpha-2': 0.1 } },
      C_signal: {
        top1: 0.78,
        top2: 0.65,
        margin: 0.13,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.4, 'chk-alpha-2': 0.6 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'b_arbitrated');
    assert.strictEqual(res.confidence, 'medium');
    assert.strictEqual(res.grounded, true);
    console.log('  ✓ Case 2: Signal B triggered for arbitrated resolution (fallback handled).');
  }

  // --------------------------------------------------------------------------
  // Test 4: Case 3 - A_valid && A_vs_C < 0.60 ("b_replaced_a")
  // --------------------------------------------------------------------------
  console.log('Test 4: Case 3 - A_valid && A_vs_C < 0.60 ("b_replaced_a")');
  {
    // A claims chk-alpha-1 (1.0), C completely disagrees with chk-alpha-3 (1.0) -> A_vs_C = 0.0
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Evaluation metrics monitor generalization error.',
      A_claim: { weights: { 'chk-alpha-1': 1.0 } },
      C_signal: {
        top1: 0.82,
        top2: 0.35,
        margin: 0.47,
        top1ChunkId: 'chk-alpha-3',
        weights: { 'chk-alpha-3': 1.0 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'b_replaced_a');
    assert.strictEqual(res.confidence, 'medium');
    assert.strictEqual(res.grounded, true);
    console.log('  ✓ Case 3: A discarded when A_vs_C < 0.60.');
  }

  // --------------------------------------------------------------------------
  // Test 5: Case 4 - !A_valid && C_margin >= 0.15 ("c_only")
  // --------------------------------------------------------------------------
  console.log('Test 5: Case 4 - !A_valid && C_margin >= 0.15 ("c_only")');
  {
    // A emitted an invalid chunk ID not in sourceChunks
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Clear match for first chunk.',
      A_claim: { weights: { 'chk-hallucinated-99': 1.0 } },
      C_signal: {
        top1: 0.85,
        top2: 0.55,
        margin: 0.30,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.8, 'chk-alpha-2': 0.2 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'c_only');
    assert.strictEqual(res.confidence, 'medium');
    assert.strictEqual(res.grounded, true);
    assert.deepStrictEqual(res.chunk_ids, ['chk-alpha-1']);
    console.log('  ✓ Case 4: Invalid A with decisive C margin accepted C directly.');
  }

  // --------------------------------------------------------------------------
  // Test 6: Case 5 - !A_valid && C_margin < 0.15 ("b_after_invalid_a")
  // --------------------------------------------------------------------------
  console.log('Test 6: Case 5 - !A_valid && C_margin < 0.15 ("b_after_invalid_a")');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Ambiguous passage with invalid A claim.',
      A_claim: { weights: { 'chk-hallucinated-99': 1.0 } },
      C_signal: {
        top1: 0.72,
        top2: 0.68,
        margin: 0.04,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.52, 'chk-alpha-2': 0.48 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'b_after_invalid_a');
    assert.strictEqual(res.confidence, 'low');
    assert.strictEqual(res.grounded, true);
    console.log('  ✓ Case 5: Invalid A with narrow C margin triggered B with low confidence.');
  }

  // --------------------------------------------------------------------------
  // Test 7: Case 6 - A_missing && C_margin >= 0.15 ("c_only")
  // --------------------------------------------------------------------------
  console.log('Test 7: Case 6 - A_missing && C_margin >= 0.15 ("c_only")');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Strong embedding match with no A citations.',
      A_claim: null,
      C_signal: {
        top1: 0.81,
        top2: 0.50,
        margin: 0.31,
        top1ChunkId: 'chk-alpha-2',
        weights: { 'chk-alpha-2': 0.85, 'chk-alpha-1': 0.15 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'c_only');
    assert.strictEqual(res.confidence, 'medium');
    assert.strictEqual(res.grounded, true);
    assert.deepStrictEqual(res.chunk_ids, ['chk-alpha-2']);
    console.log('  ✓ Case 6: Missing A with decisive C margin accepted C.');
  }

  // --------------------------------------------------------------------------
  // Test 8: Case 7 - A_missing && C_margin < 0.15 ("b_after_missing_a")
  // --------------------------------------------------------------------------
  console.log('Test 8: Case 7 - A_missing && C_margin < 0.15 ("b_after_missing_a")');
  {
    const res = await attributionArbiter.resolveParagraphAttribution({
      paragraph: 'Ambiguous passage with no A markers.',
      A_claim: { weights: {} },
      C_signal: {
        top1: 0.69,
        top2: 0.65,
        margin: 0.04,
        top1ChunkId: 'chk-alpha-1',
        weights: { 'chk-alpha-1': 0.51, 'chk-alpha-2': 0.49 },
      },
      source_chunks: sourceChunks,
      options: { fast: true },
    });

    assert.strictEqual(res.method, 'b_after_missing_a');
    assert.strictEqual(res.confidence, 'low');
    assert.strictEqual(res.grounded, true);
    console.log('  ✓ Case 7: Missing A with narrow C margin fired B with low confidence.');
  }

  // --------------------------------------------------------------------------
  // Test 9: Database Persistence & AttributionRepository
  // --------------------------------------------------------------------------
  console.log('Test 9: Database Persistence & AttributionRepository');
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
        method: 'a_verified_by_c',
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
        method: 'c_only',
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
    assert.strictEqual(fetched[0].method, 'a_verified_by_c');
    assert.strictEqual(fetched[0].grounded, true);
    assert.strictEqual(fetched[1].method, 'c_only');

    const delCount = attributionRepository.deleteByRepresentationId(testRepId);
    assert.strictEqual(delCount, 2, 'Delete must remove the 2 rows');
    assert.strictEqual(attributionRepository.getByRepresentationId(testRepId).length, 0);

    console.log('  ✓ AttributionRepository batch insert, retrieval, and delete confirmed.');
  }

  // --------------------------------------------------------------------------
  // Test 10: End-to-End ProvenanceResolver Contract
  // --------------------------------------------------------------------------
  console.log('Test 10: End-to-End ProvenanceResolver Contract');
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
