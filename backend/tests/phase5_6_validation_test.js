/**
 * Phase 5.6: Validation Guards and Retry Consolidation Test Suite
 *
 * Verifies:
 * 1. Pre-LLM source guard: missing chunk IDs in semantic_chunks -> status='failed',
 *    fallback_reason='pre_llm_source_missing', no LLM dispatch.
 * 2. Pre-LLM source guard: chunk exists but words < MIN_SOURCE_CHUNK_WORDS ->
 *    status='failed', fallback_reason='pre_llm_source_missing'.
 * 3. aiRetryGuard unit: out-of-band on attempt 1, in-band on attempt 2 -> violation=false, retried=true.
 * 4. aiRetryGuard unit: uniform placeholder text -> violationType='structural_placeholder'.
 * 5. Auto-resynthesize: persistent violation retries up to MAX_AUTO_RESYNTHESIZE_ATTEMPTS ->
 *    status='failed', fallback_reason='auto_resynthesis_exhausted'.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const config = require('../config');
const { getDatabase } = require('../db/database');
const bookRepository = require('../repositories/bookRepository');
const outlineRepository = require('../repositories/outlineRepository');
const smartChapterRepository = require('../repositories/smartChapterRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const synthesisService = require('../services/synthesis/synthesisService');
const aiRetryGuard = require('../services/ai/aiRetryGuard');
const aiService = require('../services/ai/aiService');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING PHASE 5.6 VALIDATION GUARDS & RETRY TESTS');
  console.log('================================================================\n');

  // Initialize DB schema
  const db = getDatabase();

  // --------------------------------------------------------------------------
  // Test 1: Pre-LLM guard with missing chunk IDs
  // --------------------------------------------------------------------------
  console.log('Test 1: Pre-LLM guard aborts when section IDs do not exist in semantic_chunks');
  {
    const book = bookRepository.create({
      title: 'Phase 5.6 Test Book 1',
      author: 'Validator',
      content_type: 'research',
    });

    const outlineId = `outline-p56-t1-${Date.now()}`;
    const chapterId = `smart-${book.id}-ch-1`;
    const missingChunkId = `chunk-nonexistent-${Date.now()}`;

    smartChapterRepository.create({
      id: chapterId,
      book_id: book.id,
      sequence: 1,
      title: 'Chapter 1: Missing Chunks',
      status: 'pending',
      planned_source_section_ids: [missingChunkId],
      planned_word_count: 300,
    });

    outlineRepository.saveOutline({
      outlineId,
      title: 'Missing Chunks Outline',
      type: 'single_book',
      chapters: [
        {
          chapterId,
          title: 'Chapter 1: Missing Chunks',
          sourceSectionIds: [missingChunkId],
          targetWordCount: 250,
        },
      ],
      createdAt: new Date().toISOString(),
    });

    let threw = false;
    let caughtErr = null;
    try {
      await synthesisService.synthesizeChapter(outlineId, chapterId, { fast: true });
    } catch (err) {
      threw = true;
      caughtErr = err;
    }

    assert.strictEqual(threw, true, 'Pre-LLM guard must throw on missing source chunks');
    assert.strictEqual(caughtErr.name, 'PreLLMValidationError', 'Error must be PreLLMValidationError');

    const updated = smartChapterRepository.getById(chapterId);
    assert.ok(updated, 'Smart chapter record must exist');
    assert.strictEqual(updated.status, 'failed', 'Status must transition to "failed"');
    const meta = typeof updated.metadata_json === 'string'
      ? JSON.parse(updated.metadata_json)
      : (updated.metadata || {});
    assert.strictEqual(meta.fallback_reason, 'pre_llm_source_missing', 'Fallback reason must be "pre_llm_source_missing"');
    assert.ok(Array.isArray(meta.missing_ids) && meta.missing_ids.includes(missingChunkId), 'Missing chunk ID must be recorded in metadata');

    console.log('  ✓ Verified: Pre-LLM guard marked smart chapter failed with pre_llm_source_missing.\n');
  }

  // --------------------------------------------------------------------------
  // Test 2: Pre-LLM guard with chunk word count < MIN_SOURCE_CHUNK_WORDS
  // --------------------------------------------------------------------------
  console.log('Test 2: Pre-LLM guard aborts when chunk word count < MIN_SOURCE_CHUNK_WORDS');
  {
    const book = bookRepository.create({
      title: 'Phase 5.6 Test Book 2',
      author: 'Validator',
      content_type: 'research',
    });

    const shortChunk = semanticChunkRepository.create({
      book_id: book.id,
      sequence_index: 0,
      text_content: 'This chunk is far too short to synthesize responsibly.', // 9 words
      token_count: 12,
      section_heading: 'Brief Heading',
    });

    const outlineId = `outline-p56-t2-${Date.now()}`;
    const chapterId = `smart-${book.id}-ch-1`;

    smartChapterRepository.create({
      id: chapterId,
      book_id: book.id,
      sequence: 1,
      title: 'Chapter 1: Short Chunks',
      status: 'pending',
      planned_source_section_ids: [shortChunk.id],
      planned_word_count: 300,
    });

    outlineRepository.saveOutline({
      outlineId,
      title: 'Short Chunks Outline',
      type: 'single_book',
      chapters: [
        {
          chapterId,
          title: 'Chapter 1: Short Chunks',
          sourceSectionIds: [shortChunk.id],
          targetWordCount: 250,
        },
      ],
      createdAt: new Date().toISOString(),
    });

    let threw = false;
    let caughtErr = null;
    try {
      await synthesisService.synthesizeChapter(outlineId, chapterId, { fast: true });
    } catch (err) {
      threw = true;
      caughtErr = err;
    }

    assert.strictEqual(threw, true, 'Pre-LLM guard must throw when chunk has insufficient words');
    assert.strictEqual(caughtErr.name, 'PreLLMValidationError', 'Error must be PreLLMValidationError');

    const updated = smartChapterRepository.getById(chapterId);
    assert.strictEqual(updated.status, 'failed', 'Status must be "failed"');
    const meta = typeof updated.metadata_json === 'string'
      ? JSON.parse(updated.metadata_json)
      : (updated.metadata || {});
    assert.strictEqual(meta.fallback_reason, 'pre_llm_source_missing', 'Fallback reason must be "pre_llm_source_missing"');
    assert.ok(Array.isArray(meta.insufficient_chunk_ids) && meta.insufficient_chunk_ids.length > 0, 'Insufficient chunk IDs must be recorded');

    console.log('  ✓ Verified: Pre-LLM guard marked smart chapter failed on insufficient chunk word count.\n');
  }

  // --------------------------------------------------------------------------
  // Test 3: aiRetryGuard unit: out-of-band on attempt 1, in-band on attempt 2
  // --------------------------------------------------------------------------
  console.log('Test 3: aiRetryGuard retries on word-count breach and succeeds when attempt 2 is in band');
  {
    let callCount = 0;
    const generateFn = async (prompt) => {
      callCount++;
      if (callCount === 1) {
        // 50 words (below floor of 180)
        return {
          text: 'This short response has fifty words and intentionally breaches the floor constraint during initial generation to trigger a corrective retry. ' +
            'We ensure standard sentences are present so structural checks pass. ' +
            'Now the generator will be prompted to expand its output to the required target.',
          finishReason: 'stop',
        };
      }
      // Attempt 2: 206 words (in band [180, 360]) with standard punctuation and diverse vocabulary
      const p1 = 'Distributed consensus models enforce deterministic state machine transitions across asynchronous computer networks without relying on central coordinators. ' +
        'Leader election mechanisms such as Raft utilize randomized election timers to avoid concurrent split votes among healthy voting candidate nodes. ' +
        'Quorum replication ensures that every accepted log entry is durably committed to stable storage before serving read requests.';
      const p2 = 'Decentralized storage engines balance write throughput against read latency through structured write-ahead logging and log-structured merge trees. ' +
        'Network partitions require explicit consistency trade-offs to prevent split-brain states during inter-region link severance. ' +
        'Formal verification of state machine safety invariants provides mathematical guarantees against irreversible data corruption across heterogeneous clusters.';
      return {
        text: `${p1}\n\n${p2}\n\n${p1}\n\n${p2}`,
        finishReason: 'stop',
      };
    };

    const guardResult = await aiRetryGuard.executeWithWordCountGuard({
      generateFn,
      prompt: 'Initial prompt',
      bounds: { targetWords: 250, hardFloor: 180, hardCeiling: 360 },
      maxRetries: 1,
      contextLabel: '[Test 3]',
      structuralCheck: true,
    });

    assert.strictEqual(callCount, 2, 'generateFn should have been called twice (1 initial + 1 retry)');
    assert.strictEqual(guardResult.retried, true, 'retried should be true');
    assert.strictEqual(guardResult.violation, false, 'violation should be false after successful retry');
    assert.strictEqual(guardResult.violationType, null, 'violationType should be null');
    assert.ok(guardResult.wordCount >= 180 && guardResult.wordCount <= 360, `Word count ${guardResult.wordCount} should be within [180, 360]`);

    console.log(`  ✓ Verified: aiRetryGuard retried (attempt count: ${callCount}) and cleared violation.\n`);
  }

  // --------------------------------------------------------------------------
  // Test 4: aiRetryGuard unit: uniform placeholder text without punctuation
  // --------------------------------------------------------------------------
  console.log('Test 4: aiRetryGuard catches structural placeholder text without sentence terminators');
  {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return {
        text: Array(250).fill('placeholder').join(' '),
        finishReason: 'stop',
      };
    };

    const guardResult = await aiRetryGuard.executeWithWordCountGuard({
      generateFn,
      prompt: 'Initial prompt',
      bounds: { targetWords: 250, hardFloor: 180, hardCeiling: 360 },
      maxRetries: 1,
      contextLabel: '[Test 4]',
      structuralCheck: true,
    });

    assert.strictEqual(guardResult.violation, true, 'violation should be true');
    assert.strictEqual(guardResult.violationType, 'structural_placeholder', 'violationType must be "structural_placeholder"');
    assert.strictEqual(guardResult.retried, true, 'retried should be true after trying once');

    console.log('  ✓ Verified: aiRetryGuard correctly identified structural_placeholder violation.\n');
  }

  // --------------------------------------------------------------------------
  // Test 5: Auto-resynthesize exhausts attempts and sets status='failed'
  // --------------------------------------------------------------------------
  console.log('Test 5: Auto-resynthesize on persistent violation exhausts attempts and marks chapter failed');
  {
    const book = bookRepository.create({
      title: 'Phase 5.6 Test Book 5',
      author: 'Validator',
      content_type: 'research',
    });

    // Seed valid chunk >= 75 words
    const chunkText = 'Distributed consensus models enforce deterministic state machine transitions across asynchronous computer networks without relying on central coordinators. ' +
      'Leader election mechanisms such as Raft utilize randomized election timers to avoid concurrent split votes among healthy voting candidate nodes. ' +
      'Quorum replication ensures that every accepted log entry is durably committed to stable storage before serving read requests. ' +
      'Network partitions require explicit consistency trade-offs to prevent split-brain states during inter-region link severance across geographically distributed data centers. ' +
      'Formal verification of safety invariants guarantees linearizable ordering across partitioned nodes.';
    const validChunk = semanticChunkRepository.create({
      book_id: book.id,
      sequence_index: 0,
      text_content: chunkText,
      token_count: 90,
      section_heading: 'Consensus Section',
    });

    const outlineId = `outline-p56-t5-${Date.now()}`;
    const chapterId = `smart-${book.id}-ch-1`;

    smartChapterRepository.create({
      id: chapterId,
      book_id: book.id,
      sequence: 1,
      title: 'Chapter 1: Persistent Violation',
      status: 'pending',
      planned_source_section_ids: [validChunk.id],
      planned_word_count: 250,
    });

    outlineRepository.saveOutline({
      outlineId,
      title: 'Persistent Violation Outline',
      type: 'single_book',
      chapters: [
        {
          chapterId,
          title: 'Chapter 1: Persistent Violation',
          sourceSectionIds: [validChunk.id],
          targetWordCount: 250,
        },
      ],
      createdAt: new Date().toISOString(),
    });

    // Mock aiService to produce a persistent violation (> 500 words, hard ceiling is ~300)
    const originalIsAvailable = aiService.isAvailable;
    const originalGenerateText = aiService.generateText;

    let aiCallCount = 0;
    aiService.isAvailable = () => true;
    aiService.generateText = async () => {
      aiCallCount++;
      const sentence = 'Continuous distributed synchronization demands persistent verification of replication state. ';
      return {
        text: sentence.repeat(50),
        finish_reason: 'stop',
        provider: 'mock_llm',
        model: 'mock_v1',
      };
    };

    try {
      const synthResult = await synthesisService.synthesizeChapter(outlineId, chapterId, { fast: false });
      assert.ok(synthResult, 'Synthesis result should be returned even on exhaustion');

      const finalSmartChapter = smartChapterRepository.getById(chapterId);
      assert.ok(finalSmartChapter, 'Smart chapter record must exist');
      assert.strictEqual(finalSmartChapter.status, 'failed', 'Status must be "failed" after auto-resynthesis exhaustion');

      const meta = typeof finalSmartChapter.metadata_json === 'string'
        ? JSON.parse(finalSmartChapter.metadata_json)
        : (finalSmartChapter.metadata || {});
      assert.strictEqual(meta.fallback_reason, 'auto_resynthesis_exhausted', 'Fallback reason must be "auto_resynthesis_exhausted"');
      assert.strictEqual(meta.resynthesis_attempts, config.MAX_AUTO_RESYNTHESIZE_ATTEMPTS, `resynthesis_attempts must equal MAX (${config.MAX_AUTO_RESYNTHESIZE_ATTEMPTS})`);
      assert.strictEqual(meta.compression_violation, true, 'compression_violation must be true');

      console.log(`  ✓ Verified: Auto-resynthesize made attempts and transitioned to status="failed" with fallback_reason="auto_resynthesis_exhausted" (AI calls: ${aiCallCount}).\n`);
    } finally {
      aiService.isAvailable = originalIsAvailable;
      aiService.generateText = originalGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 6: Chunker merge — heading glued to following content
  // --------------------------------------------------------------------------
  console.log('Test 6: Chunker — heading followed by large paragraph, no standalone heading chunk');
  {
    const SemanticChunker = require('../services/semantic/semanticChunker').constructor;
    const chunker = new SemanticChunker({ targetMinTokens: 10, targetMaxTokens: 500, minWordCount: 5 });

    // Canonical blocks: heading + large paragraph
    const headingText = 'Introduction to Gradient Methods';
    const paragraphText = 'Gradient descent is the workhorse optimization algorithm underlying virtually all modern machine learning systems. ' +
      'By computing the partial derivative of a scalar loss function with respect to each model parameter, the algorithm determines ' +
      'the direction of steepest ascent in parameter space and moves the model weights in the opposite direction proportionally to a ' +
      'configurable learning rate. Stochastic approximations sample mini-batches of training examples to produce noisy but computationally ' +
      'tractable gradient estimates, enabling training on datasets far larger than could fit in RAM. Adaptive methods such as Adam ' +
      'accumulate per-parameter moving averages of gradient magnitudes to rescale update steps automatically, reducing sensitivity to ' +
      'the initial learning rate hyperparameter.';

    const units = [
      {
        bookId: 'test-book-t6',
        chapterId: 'ch-t6-1',
        sectionHeading: 'Introduction to Gradient Methods',
        contentType: 'heading',
        textContent: headingText,
        tokenCount: chunker.estimateTokens(headingText),
        canonicalBlock: { type: 'heading', text: headingText },
        sourceReference: 'test',
        sourcePage: null,
        structuralRole: 'chapter',
      },
      {
        bookId: 'test-book-t6',
        chapterId: 'ch-t6-1',
        sectionHeading: 'Introduction to Gradient Methods',
        contentType: 'paragraph',
        textContent: paragraphText,
        tokenCount: chunker.estimateTokens(paragraphText),
        canonicalBlock: { type: 'paragraph', text: paragraphText },
        sourceReference: 'test',
        sourcePage: null,
        structuralRole: 'chapter',
      },
    ];

    const result = chunker.chunkPreprocessedUnits(units, {});

    // Assert no chunk consists ONLY of the heading text
    const headingOnlyChunk = result.find((c) =>
      c.textContent.trim() === `[Section: ${headingText}]` ||
      (c.textContent.trim().includes('[Section:') && !c.textContent.trim().includes(paragraphText.substring(0, 20)))
    );
    assert.ok(!headingOnlyChunk, `No chunk should contain ONLY the heading text. Chunks: ${JSON.stringify(result.map(c => c.textContent.substring(0, 60)))}`);

    // Assert the heading text appears in at least one chunk (glued)
    const hasHeading = result.some((c) => c.textContent.includes('[Section: Introduction to Gradient Methods]'));
    assert.ok(hasHeading, 'Heading must be present in at least one chunk (glued)');

    // Assert paragraph content is present
    const hasParagraph = result.some((c) => c.textContent.includes('Gradient descent is the workhorse'));
    assert.ok(hasParagraph, 'Paragraph content must appear in output chunks');

    console.log(`  ✓ Verified: Heading glued to content — ${result.length} chunk(s) produced, none standalone.\n`);
  }

  // --------------------------------------------------------------------------
  // Test 7: Undersized chunk merge — 40-word chunk merges with next chunk
  // --------------------------------------------------------------------------
  console.log('Test 7: Post-pass merge combines a 40-word chunk with the next chunk');
  {
    const SemanticChunker = require('../services/semantic/semanticChunker').constructor;
    // Use default minWordCount: 75
    const chunker = new SemanticChunker({ targetMinTokens: 10, targetMaxTokens: 1000 });

    // Two paragraphs: first ~40 words (undersized), second ~100 words (adequate)
    const shortPara = 'Stochastic gradient descent updates model weights using noisy gradient estimates computed from random mini-batches. ' +
      'This approach dramatically reduces the per-iteration computational cost compared to full-batch gradient methods.';
    const longPara = 'Momentum-based optimizers accumulate an exponentially decaying moving average of past gradients, allowing the update ' +
      'vector to build speed in directions of consistent gradient sign while dampening oscillations perpendicular to the loss valley. ' +
      'The Nesterov variant computes the gradient at the anticipated future position rather than the current position, providing a ' +
      'look-ahead correction that empirically accelerates convergence on smooth convex objectives. Second-order methods approximate the ' +
      'inverse Hessian to produce geometrically informed update steps, at the cost of O(n²) memory and O(n³) computation per iteration.';

    const shortWords = shortPara.trim().split(/\s+/).length;
    const longWords = longPara.trim().split(/\s+/).length;
    assert.ok(shortWords < 75, `Short para should be < 75 words, got ${shortWords}`);
    assert.ok(longWords >= 75, `Long para should be >= 75 words, got ${longWords}`);

    const units = [
      {
        bookId: 'test-book-t7',
        chapterId: 'ch-t7-1',
        sectionHeading: 'Optimization Methods',
        contentType: 'paragraph',
        textContent: shortPara,
        tokenCount: chunker.estimateTokens(shortPara),
        canonicalBlock: { type: 'paragraph', text: shortPara },
        sourceReference: 'test',
        sourcePage: null,
        structuralRole: 'chapter',
      },
      {
        bookId: 'test-book-t7',
        chapterId: 'ch-t7-1',
        sectionHeading: 'Optimization Methods',
        contentType: 'paragraph',
        textContent: longPara,
        tokenCount: chunker.estimateTokens(longPara),
        canonicalBlock: { type: 'paragraph', text: longPara },
        sourceReference: 'test',
        sourcePage: null,
        structuralRole: 'chapter',
      },
    ];

    const result = chunker.chunkPreprocessedUnits(units, {});

    // All output chunks must have >= 75 words
    for (const chunk of result) {
      const wc = chunk.textContent.trim().split(/\s+/).length;
      assert.ok(wc >= 75, `Chunk word count ${wc} is below 75 after post-pass merge. Content: ${chunk.textContent.substring(0, 60)}`);
    }

    // The short para text should be present (merged into the combined chunk)
    const hasMerged = result.some((c) => c.textContent.includes('Stochastic gradient descent'));
    assert.ok(hasMerged, 'Merged chunk must contain the short paragraph text');

    console.log(`  ✓ Verified: Post-pass merge produced ${result.length} chunk(s), all >= 75 words.\n`);
  }

  // --------------------------------------------------------------------------
  // Test 8: Heading at chapter end — merges backward into previous chunk
  // --------------------------------------------------------------------------
  console.log('Test 8: Heading at chapter end merges backward into previous chunk');
  {
    const SemanticChunker = require('../services/semantic/semanticChunker').constructor;
    const chunker = new SemanticChunker({ targetMinTokens: 10, targetMaxTokens: 1000, minWordCount: 5 });

    // A normal paragraph followed by a heading with NO following content
    const normalPara = 'Regularization techniques constrain the hypothesis space of learned models to reduce overfitting on finite training datasets. ' +
      'L2 weight decay penalizes large parameter magnitudes by adding a quadratic term to the training loss, effectively shrinking all ' +
      'weights toward zero proportional to their current magnitude. Dropout randomly zeroes a fraction of activations during each forward ' +
      'pass, forcing the network to learn redundant representations that generalize better to unseen inputs. Early stopping monitors ' +
      'validation loss and halts training when it begins to increase, preserving the model state at the empirical risk minimum.';
    const trailingHeading = 'Conclusion and Future Directions';

    const units = [
      {
        bookId: 'test-book-t8',
        chapterId: 'ch-t8-1',
        sectionHeading: 'Regularization',
        contentType: 'paragraph',
        textContent: normalPara,
        tokenCount: chunker.estimateTokens(normalPara),
        canonicalBlock: { type: 'paragraph', text: normalPara },
        sourceReference: 'test',
        sourcePage: null,
        structuralRole: 'chapter',
      },
      {
        bookId: 'test-book-t8',
        chapterId: 'ch-t8-1',
        sectionHeading: 'Conclusion and Future Directions',
        contentType: 'heading',
        textContent: trailingHeading,
        tokenCount: chunker.estimateTokens(trailingHeading),
        canonicalBlock: { type: 'heading', text: trailingHeading },
        sourceReference: 'test',
        sourcePage: null,
        structuralRole: 'chapter',
      },
    ];

    const result = chunker.chunkPreprocessedUnits(units, {});

    // The trailing heading must NOT be a standalone chunk.
    const standaloneHeadingChunk = result.find((c) =>
      c.textContent.trim() === `[Section: ${trailingHeading}]`
    );
    assert.ok(!standaloneHeadingChunk, `Trailing heading must not be emitted standalone. Got: ${JSON.stringify(result.map(c => c.textContent.substring(0, 60)))}`);

    // The trailing heading text should appear in the previous (last) chunk.
    const lastChunk = result[result.length - 1];
    assert.ok(lastChunk.textContent.includes(trailingHeading), `Trailing heading "${trailingHeading}" must be merged into last chunk`);

    // The normal paragraph content must still be present.
    const hasParagraph = result.some((c) => c.textContent.includes('Regularization techniques constrain'));
    assert.ok(hasParagraph, 'Normal paragraph content must appear in the output');

    console.log(`  ✓ Verified: Trailing heading merged backward — ${result.length} chunk(s) produced.\n`);
  }

  console.log('================================================================');
  console.log('🎉 ALL PHASE 5.6 VALIDATION TESTS PASSED (8 tests)');
  console.log('================================================================\n');
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
