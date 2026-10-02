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
const smartChapterRepository = require('../repositories/smartChapterRepository');
const embeddingService = require('../services/semantic/embeddingService');
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
    const smartChapterRepository = require('../repositories/smartChapterRepository');
    const testSmartId = `smart-test-persistence-${Date.now()}`;
    const db = getDatabase();
    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(testSmartId, 'book-fixture-a', 99, 'Test Persistence Chapter', 'generated', 'Sample content.', '{}', new Date().toISOString(), new Date().toISOString());

    const testAttrs = [
      {
        id: `attr-${testSmartId}-0`,
        representation_id: testSmartId,
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
        id: `attr-${testSmartId}-1`,
        representation_id: testSmartId,
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

    const fetched = attributionRepository.getByRepresentationId(testSmartId);
    assert.strictEqual(fetched.length, 2);
    assert.strictEqual(fetched[0].method, 'c_primary');
    assert.strictEqual(fetched[0].grounded, true);
    assert.strictEqual(fetched[1].method, 'c_verified_by_a');

    const delCount = attributionRepository.deleteByRepresentationId(testSmartId);
    assert.strictEqual(delCount, 2, 'Delete must remove the 2 rows');
    assert.strictEqual(attributionRepository.getByRepresentationId(testSmartId).length, 0);

    // Verify foreign key ON DELETE CASCADE from smart_chapters
    const cascadeSmartId = 'smart-test-cascade-fk';
    smartChapterRepository.create({
      id: cascadeSmartId,
      bookId: 'book-fixture-a',
      sequence: 100,
      title: 'Cascade FK Verification Chapter',
      status: 'generated',
      content: 'Sample content for FK cascade verification.',
      metadata: {},
    });
    attributionRepository.createBatch([
      {
        representation_id: cascadeSmartId,
        paragraph_index: 0,
        segments: [],
        source_chunk_ids: [],
        weights: {},
        method: 'c_primary',
        confidence: 'high',
        grounded: true,
      },
    ]);
    assert.strictEqual(attributionRepository.getByRepresentationId(cascadeSmartId).length, 1);
    smartChapterRepository.delete(cascadeSmartId);
    assert.strictEqual(
      attributionRepository.getByRepresentationId(cascadeSmartId).length,
      0,
      'Deleting smart_chapter must cascade delete paragraph_attributions'
    );

    console.log('  ✓ AttributionRepository batch insert, retrieval, delete, and FK ON DELETE CASCADE confirmed.');
  }

  // --------------------------------------------------------------------------
  // Test 7: End-to-End ProvenanceResolver Contract
  // --------------------------------------------------------------------------
  console.log('Test 7: End-to-End ProvenanceResolver Contract');
  {
    const smartChapterRepository = require('../repositories/smartChapterRepository');
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

    const smartId = `smart-${bookId}-ch-1`;
    const smartContent = `Supervised learning leverages ground truth labels to build predictive functions. Labelled instances guide gradient optimization.\n\nClustering algorithms group unlabelled data points by latent geometric features.`;

    smartChapterRepository.create({
      id: smartId,
      bookId,
      sequence: 1,
      title: 'Learning Paradigms',
      status: 'generated',
      content: smartContent,
      planned_source_section_ids: [chunk1.id, chunk2.id],
      metadata: {
        outlineId: `outline-${bookId}`,
        chapterId: smartId,
        title: 'Learning Paradigms',
        provenance: [chunk1.id, chunk2.id],
        claimed_attributions: [
          { paragraph_index: 0, weights: { [chunk1.id]: 1.0 } },
          { paragraph_index: 1, weights: { [chunk2.id]: 1.0 } },
        ],
      },
    });

    const result = await provenanceResolver.verifyRepresentation(smartId, { fast: true, force: true });
    assert.strictEqual(result.representation_id, smartId);
    assert.strictEqual(result.paragraphs.length, 2, 'Must resolve exactly 2 paragraphs');
    assert(result.paragraphs[0].segments.length >= 1, 'Paragraph 0 must have at least 1 segment');
    assert(result.paragraphs[1].segments.length >= 1, 'Paragraph 1 must have at least 1 segment');

    // Test formatted contract output
    const formatted = provenanceResolver.getProvenance(smartId);
    assert.strictEqual(formatted.representation_id, smartId);
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
    attributionRepository.deleteByRepresentationId(smartId);
    smartChapterRepository.delete(smartId);
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    } catch {}

    console.log('  ✓ End-to-end ProvenanceResolver verification and API contract passed cleanly.');
  }

  const makeSentinelVec = (val) => {
    const v = new Array(1024).fill(0);
    v[0] = val;
    return v;
  };

  // --------------------------------------------------------------------------
  // Test 8: Multi-chunk inclusion at Δ ≤ 0.08
  // --------------------------------------------------------------------------
  console.log('Test 8: Multi-chunk inclusion at Δ ≤ 0.08');
  {
    const bookId = `book-test-t8-${Date.now()}`;
    const smartId = `smart-test-t8-${Date.now()}`;
    const origSim = embeddingService.cosineSimilarity;
    const origEmbed = embeddingService.embedText;

    try {
      bookRepository.create({ id: bookId, title: 'Multi-Chunk Test Book', content_type: 'technical' });

      const c1 = {
        id: `chk-${bookId}-1`,
        book_id: bookId,
        chapter_id: null,
        sequence: 0,
        section_heading: 'Section 1',
        text_content: 'Content about agile frameworks.',
        embedding: makeSentinelVec(0.99),
      };
      const c2 = {
        id: `chk-${bookId}-2`,
        book_id: bookId,
        chapter_id: null,
        sequence: 1,
        section_heading: 'Section 2',
        text_content: 'Content about scrum ceremonies.',
        embedding: makeSentinelVec(0.44),
      };
      semanticChunkRepository.insertBatch([c1, c2]);

      const smartContent = 'Agile principles prioritize iterative delivery. Scrum sprints implement this through timeboxed cycles.';
      smartChapterRepository.create({
        id: smartId,
        bookId,
        sequence: 1,
        title: 'Agile & Scrum Chapter',
        status: 'generated',
        content: smartContent,
        metadata: {
          outline: {
            chapterId: smartId,
            title: 'Agile & Scrum',
            provenance: [c1.id, c2.id],
            claimed_attributions: [
              { paragraph_index: 0, weights: { [c1.id]: 0.55, [c2.id]: 0.45 } },
            ],
          },
        },
      });

      embeddingService.embedText = async () => [0.5, 0.5, 0.5];
      embeddingService.cosineSimilarity = (vA, vB) => {
        if (!vB || !Array.isArray(vB)) return 0.5;
        if (Math.abs(vB[0] - 0.99) < 0.01) return 0.85;
        if (Math.abs(vB[0] - 0.44) < 0.01) return 0.80;
        return 0.5;
      };

      const result = await provenanceResolver.verifyRepresentation(smartId, { fast: true, force: true });
      assert.strictEqual(result.paragraphs.length, 1);
      const segs = result.paragraphs[0].segments;
      assert(segs.length >= 1, 'Must have at least 1 segment');
      assert.strictEqual(segs[0].chunk_id, c1.id, 'Primary chunk must be best match');
      assert(Array.isArray(segs[0].chunk_ids), 'chunk_ids must be an array');
      assert.strictEqual(segs[0].chunk_ids.length, 2, 'Both chunks must be included when Δ <= 0.08');
      assert(segs[0].chunk_ids.includes(c1.id) && segs[0].chunk_ids.includes(c2.id));
      console.log('  ✓ Multi-chunk inclusion at Δ ≤ 0.08 verified: both chunks included in segment.chunk_ids.');
    } finally {
      embeddingService.cosineSimilarity = origSim;
      embeddingService.embedText = origEmbed;
      attributionRepository.deleteByRepresentationId(smartId);
      smartChapterRepository.delete(smartId);
      try {
        const db = getDatabase();
        db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // Test 9: Threshold exclusion at Δ > 0.08
  // --------------------------------------------------------------------------
  console.log('Test 9: Threshold exclusion at Δ > 0.08');
  {
    const bookId = `book-test-t9-${Date.now()}`;
    const smartId = `smart-test-t9-${Date.now()}`;
    const origSim = embeddingService.cosineSimilarity;
    const origEmbed = embeddingService.embedText;

    try {
      bookRepository.create({ id: bookId, title: 'Threshold Exclusion Book', content_type: 'technical' });

      const c1 = {
        id: `chk-${bookId}-1`,
        book_id: bookId,
        chapter_id: null,
        sequence: 0,
        section_heading: 'Section 1',
        text_content: 'Content about machine learning.',
        embedding: makeSentinelVec(0.99),
      };
      const c2 = {
        id: `chk-${bookId}-2`,
        book_id: bookId,
        chapter_id: null,
        sequence: 1,
        section_heading: 'Section 2',
        text_content: 'Content about hardware circuits.',
        embedding: makeSentinelVec(0.44),
      };
      semanticChunkRepository.insertBatch([c1, c2]);

      const smartContent = 'Machine learning optimizes weights. Gradient descent guides optimization step size.';
      smartChapterRepository.create({
        id: smartId,
        bookId,
        sequence: 1,
        title: 'Optimization Chapter',
        status: 'generated',
        content: smartContent,
        metadata: {
          outline: {
            chapterId: smartId,
            title: 'Optimization',
            provenance: [c1.id, c2.id],
            claimed_attributions: [
              { paragraph_index: 0, weights: { [c1.id]: 0.85, [c2.id]: 0.15 } },
            ],
          },
        },
      });

      embeddingService.embedText = async () => [0.5, 0.5, 0.5];
      embeddingService.cosineSimilarity = (vA, vB) => {
        if (!vB || !Array.isArray(vB)) return 0.5;
        if (Math.abs(vB[0] - 0.99) < 0.01) return 0.85;
        if (Math.abs(vB[0] - 0.44) < 0.01) return 0.75;
        return 0.5;
      };

      const result = await provenanceResolver.verifyRepresentation(smartId, { fast: true, force: true });
      assert.strictEqual(result.paragraphs.length, 1);
      const segs = result.paragraphs[0].segments;
      assert(segs.length >= 1);
      assert.strictEqual(segs[0].chunk_id, c1.id);
      assert.deepStrictEqual(segs[0].chunk_ids, [c1.id], 'Secondary chunk must be excluded when Δ > 0.08');
      console.log('  ✓ Threshold exclusion at Δ > 0.08 verified: secondary chunk excluded.');
    } finally {
      embeddingService.cosineSimilarity = origSim;
      embeddingService.embedText = origEmbed;
      attributionRepository.deleteByRepresentationId(smartId);
      smartChapterRepository.delete(smartId);
      try {
        const db = getDatabase();
        db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // Test 10: Single-sentence paragraph override (weights ≥ 0.25)
  // --------------------------------------------------------------------------
  console.log('Test 10: Single-sentence paragraph override (weights ≥ 0.25)');
  {
    const bookId = `book-test-t10-${Date.now()}`;
    const smartId = `smart-test-t10-${Date.now()}`;
    const origSim = embeddingService.cosineSimilarity;
    const origEmbed = embeddingService.embedText;

    try {
      bookRepository.create({ id: bookId, title: 'Single-Sentence Paragraph Book', content_type: 'technical' });

      const c1 = {
        id: `chk-${bookId}-1`,
        book_id: bookId,
        chapter_id: null,
        sequence: 0,
        section_heading: 'Alpha',
        text_content: 'Alpha concepts.',
        embedding: makeSentinelVec(0.99),
      };
      const c2 = {
        id: `chk-${bookId}-2`,
        book_id: bookId,
        chapter_id: null,
        sequence: 1,
        section_heading: 'Beta',
        text_content: 'Beta concepts.',
        embedding: makeSentinelVec(0.44),
      };
      const c3 = {
        id: `chk-${bookId}-3`,
        book_id: bookId,
        chapter_id: null,
        sequence: 2,
        section_heading: 'Gamma',
        text_content: 'Gamma concepts.',
        embedding: makeSentinelVec(0.11),
      };
      semanticChunkRepository.insertBatch([c1, c2, c3]);

      const smartContent = 'Synthesizing alpha, beta, and gamma together into a unified framework.';
      smartChapterRepository.create({
        id: smartId,
        bookId,
        sequence: 1,
        title: 'Single-Sentence Chapter',
        status: 'generated',
        content: smartContent,
        metadata: {
          outline: {
            chapterId: smartId,
            title: 'Single-Sentence',
            provenance: [c1.id, c2.id, c3.id],
            claimed_attributions: [
              { paragraph_index: 0, weights: { [c1.id]: 0.40, [c2.id]: 0.35, [c3.id]: 0.25 } },
            ],
          },
        },
      });

      embeddingService.embedText = async () => [0.5, 0.5, 0.5];
      embeddingService.cosineSimilarity = (vA, vB) => {
        if (!vB || !Array.isArray(vB)) return 0.5;
        if (Math.abs(vB[0] - 0.99) < 0.01) return 0.80;
        if (Math.abs(vB[0] - 0.44) < 0.01) return 0.70;
        if (Math.abs(vB[0] - 0.11) < 0.01) return 0.50;
        return 0.5;
      };

      const result = await provenanceResolver.verifyRepresentation(smartId, { fast: true, force: true });
      assert.strictEqual(result.paragraphs.length, 1);
      const segs = result.paragraphs[0].segments;
      assert.strictEqual(segs.length, 1);
      assert.strictEqual(segs[0].chunk_id, c1.id);
      assert.strictEqual(segs[0].chunk_ids.length, 3, 'All 3 chunks must be included in single-sentence paragraph when weights >= 0.25');
      assert(segs[0].chunk_ids.includes(c1.id));
      assert(segs[0].chunk_ids.includes(c2.id));
      assert(segs[0].chunk_ids.includes(c3.id));
      console.log('  ✓ Single-sentence paragraph override verified: all 3 qualifying chunks populated in chunk_ids.');
    } finally {
      embeddingService.cosineSimilarity = origSim;
      embeddingService.embedText = origEmbed;
      attributionRepository.deleteByRepresentationId(smartId);
      smartChapterRepository.delete(smartId);
      try {
        const db = getDatabase();
        db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // Test 11: Single-sentence paragraph with a sub-threshold chunk
  // --------------------------------------------------------------------------
  console.log('Test 11: Single-sentence paragraph with a sub-threshold chunk');
  {
    const bookId = `book-test-t11-${Date.now()}`;
    const smartId = `smart-test-t11-${Date.now()}`;
    const origSim = embeddingService.cosineSimilarity;
    const origEmbed = embeddingService.embedText;

    try {
      bookRepository.create({ id: bookId, title: 'Single-Sentence Sub-threshold Book', content_type: 'technical' });

      const c1 = {
        id: `chk-${bookId}-1`,
        book_id: bookId,
        chapter_id: null,
        sequence: 0,
        section_heading: 'Alpha',
        text_content: 'Alpha content.',
        embedding: makeSentinelVec(0.99),
      };
      const c2 = {
        id: `chk-${bookId}-2`,
        book_id: bookId,
        chapter_id: null,
        sequence: 1,
        section_heading: 'Beta',
        text_content: 'Beta content.',
        embedding: makeSentinelVec(0.44),
      };
      const c3 = {
        id: `chk-${bookId}-3`,
        book_id: bookId,
        chapter_id: null,
        sequence: 2,
        section_heading: 'Gamma',
        text_content: 'Gamma content.',
        embedding: makeSentinelVec(0.11),
      };
      semanticChunkRepository.insertBatch([c1, c2, c3]);

      const smartContent = 'Synthesizing primarily alpha and beta, with a minor passing touch of gamma.';
      smartChapterRepository.create({
        id: smartId,
        bookId,
        sequence: 1,
        title: 'Single-Sentence Chapter 2',
        status: 'generated',
        content: smartContent,
        metadata: {
          outline: {
            chapterId: smartId,
            title: 'Single-Sentence 2',
            provenance: [c1.id, c2.id, c3.id],
            claimed_attributions: [
              { paragraph_index: 0, weights: { [c1.id]: 0.50, [c2.id]: 0.375, [c3.id]: 0.125 } },
            ],
          },
        },
      });

      embeddingService.embedText = async () => [0.5, 0.5, 0.5];
      embeddingService.cosineSimilarity = (vA, vB) => {
        if (!vB || !Array.isArray(vB)) return 0.5;
        if (Math.abs(vB[0] - 0.99) < 0.01) return 0.80;
        if (Math.abs(vB[0] - 0.44) < 0.01) return 0.60;
        if (Math.abs(vB[0] - 0.11) < 0.01) return 0.20;
        return 0.5;
      };

      const result = await provenanceResolver.verifyRepresentation(smartId, { fast: true, force: true });
      assert.strictEqual(result.paragraphs.length, 1);
      const segs = result.paragraphs[0].segments;
      assert.strictEqual(segs.length, 1);
      assert.strictEqual(segs[0].chunk_ids.length, 2, 'Only chunks with weight >= 0.25 must be included');
      assert(segs[0].chunk_ids.includes(c1.id));
      assert(segs[0].chunk_ids.includes(c2.id));
      assert(!segs[0].chunk_ids.includes(c3.id), 'Sub-threshold chunk c3 must be excluded');
      console.log('  ✓ Sub-threshold chunk exclusion verified: only weights >= 0.25 populated in chunk_ids.');
    } finally {
      embeddingService.cosineSimilarity = origSim;
      embeddingService.embedText = origEmbed;
      attributionRepository.deleteByRepresentationId(smartId);
      smartChapterRepository.delete(smartId);
      try {
        const db = getDatabase();
        db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // Test 12: Legacy attribution fallback in formatRow
  // --------------------------------------------------------------------------
  console.log('Test 12: Legacy attribution fallback in formatRow');
  {
    const legacyBookId = `book-legacy-${Date.now()}`;
    const smartChapterId = `smart-legacy-chapter-${Date.now()}`;
    const legacyAttrId = `attr-legacy-${Date.now()}`;
    const legacySegments = [
      { sentence_start: 0, sentence_end: 1, chunk_id: 'chk-legacy-alpha', confidence: 0.92 },
      { sentence_start: 2, sentence_end: 3, chunk_id: 'chk-legacy-beta', confidence: 0.88 },
    ];

    bookRepository.create({
      id: legacyBookId,
      title: 'Legacy Test Book',
      content_type: 'technical',
    });
    smartChapterRepository.create({
      id: smartChapterId,
      bookId: legacyBookId,
      sequence: 1,
      title: 'Legacy Chapter',
      status: 'generated',
      content: 'Legacy paragraph content.',
      metadata: {},
    });

    const db = getDatabase();
    db.prepare(`
      INSERT INTO paragraph_attributions (
        id, smart_chapter_id, paragraph_index, segments_json, source_chunk_ids,
        weights_json, method, confidence, grounded, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      legacyAttrId,
      smartChapterId,
      0,
      JSON.stringify(legacySegments),
      JSON.stringify(['chk-legacy-alpha', 'chk-legacy-beta']),
      JSON.stringify({ 'chk-legacy-alpha': 0.6, 'chk-legacy-beta': 0.4 }),
      'b_arbitrated',
      'high',
      1,
      new Date().toISOString()
    );

    const loaded = attributionRepository.getById(legacyAttrId);
    assert(loaded, 'Attribution row must load');
    assert.strictEqual(loaded.segments.length, 2);
    assert.deepStrictEqual(loaded.segments[0].chunk_ids, ['chk-legacy-alpha'], 'Legacy seg 0 must normalize to [chunk_id]');
    assert.deepStrictEqual(loaded.segments[1].chunk_ids, ['chk-legacy-beta'], 'Legacy seg 1 must normalize to [chunk_id]');

    // Cleanup
    db.prepare('DELETE FROM paragraph_attributions WHERE id = ?').run(legacyAttrId);
    smartChapterRepository.delete(smartChapterId);
    bookRepository.delete(legacyBookId);
    console.log('  ✓ Legacy attribution fallback verified: formatRow normalizes missing chunk_ids to [chunk_id].');
  }

  
  // -------------------------------------------------------------------------
  // T13: Multi-source paragraph with reranker scores attributes to >1 source
  // -------------------------------------------------------------------------
  {
    console.log('\n[Test 13] Multi-source paragraph with reranker scores attributes to >1 source');
    const bookId = `bk-t13-${Date.now()}`;
    const smartId = `smart-t13-${Date.now()}`;
    
    bookRepository.create({ id: bookId, title: 'T13 Test' });
    
    const chunkA = semanticChunkRepository.create({
      book_id: bookId,
      chapter_id: 'ch-1',
      sequence: 1,
      text_content: 'Text A',
      token_count: 2,
    });
    
    const chunkB = semanticChunkRepository.create({
      book_id: bookId,
      chapter_id: 'ch-1',
      sequence: 2,
      text_content: 'Text B',
      token_count: 2,
    });

    smartChapterRepository.create({
      id: smartId,
      book_id: bookId,
      sequence: 1,
      status: 'generated',
      content: 'This paragraph blends A and B.',
      synthesis_type: 'single_book',
      metadata_json: {
        outlineId: `outline-${bookId}`,
        chapterId: smartId,
        title: 'T13 Multi-source',
        provenance: [chunkA.id, chunkB.id],
        claimed_attributions: [
          { 
            paragraph_index: 0, 
            weights: { [chunkA.id]: 0.5, [chunkB.id]: 0.5 },
            weights_json: { attribution_stage: 'reranker' },
            reranker_scores: { [chunkA.id]: 0.95, [chunkB.id]: 0.89 } // Delta 0.06 < 0.08 MULTI_CHUNK_DELTA_THRESHOLD
          }
        ],
      },
    });

    const result = await provenanceResolver.verifyRepresentation(smartId, { fast: true, force: true });
    
    assert.strictEqual(result.paragraphs.length, 1, 'Must resolve exactly 1 paragraph');
    const p0 = result.paragraphs[0];
    
    assert.strictEqual(p0.weights?.attribution_stage, 'reranker', 'Method should be recorded as reranker in weights.attribution_stage');
    assert(p0.source_chunk_ids.includes(chunkA.id), 'Must include chunk A');
    assert(p0.source_chunk_ids.includes(chunkB.id), 'Must include chunk B');
    assert.strictEqual(p0.source_chunk_ids.length, 2, 'Should have exactly 2 chunks attributed');

    // Cleanup
    smartChapterRepository.delete(smartId);
    bookRepository.delete(bookId);
    console.log('  \u2705 T13 passed: Reranker multi-source attribution resolves correctly.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL BUILD 5.1b PROVENANCE CONTRACT TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ BUILD 5.1b TEST FAILED:', err);
  process.exit(1);
});
