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

  console.log('================================================================');
  console.log('🎉 ALL PHASE 5.6 VALIDATION TESTS PASSED');
  console.log('================================================================\n');
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
