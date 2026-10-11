'use strict';

const assert = require('assert');
const bookRepository = require('../repositories/bookRepository');
const chapterRepository = require('../repositories/chapterRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const representationRepository = require('../repositories/representationRepository');
const intelligentSummarizer = require('../services/ai/intelligentSummarizer');
const synthesisService = require('../services/synthesis/synthesisService');
const aiRetryGuard = require('../services/ai/aiRetryGuard');
const aiService = require('../services/ai/aiService');

async function runF49Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F49 SYNOPSIS RETRY & EMPTY-INPUT GUARD TESTS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Test 1: Empty inputs — Pre-LLM guard skips LLM call and returns honest [PARTIAL]
  // --------------------------------------------------------------------------
  console.log('Test 1: Empty inputs (all four inputs only [Section: ...] or empty) skips LLM call');
  {
    const book = bookRepository.create({
      title: 'F49 Empty Inputs Test Book',
      author: 'Unknown',
      content_type: 'novel',
    });

    const ch1Id = `ch-f49-1-${Date.now()}`;
    const ch2Id = `ch-f49-2-${Date.now()}`;

    const ch1 = chapterRepository.create({
      id: ch1Id,
      book_id: book.id,
      number: 1,
      title: 'Chapter 1',
      sequence: 1,
      content: '[Section: Chapter 1]',
    });

    const ch2 = chapterRepository.create({
      id: ch2Id,
      book_id: book.id,
      number: 2,
      title: 'Chapter 2',
      sequence: 2,
      content: '[Section: Chapter 2]',
    });

    const chunk1Id = `chk-f49-empty1-${Date.now()}`;
    const chunk2Id = `chk-f49-empty2-${Date.now()}`;

    semanticChunkRepository.insertBatch([
      {
        id: chunk1Id,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: '[Section: Chapter 1]',
        sectionHeading: 'Chapter 1',
        tokenCount: 4,
      },
      {
        id: chunk2Id,
        bookId: book.id,
        chapterId: ch2.id,
        sequence: 1,
        textContent: '[Section: Chapter 2]',
        sectionHeading: 'Chapter 2',
        tokenCount: 4,
      },
    ]);

    let aiCallCount = 0;
    const origGenerateText = aiService.generateText;
    aiService.generateText = async () => {
      aiCallCount++;
      return {
        text: 'Fabricated programming book description that should never be produced.',
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);

      assert.strictEqual(aiCallCount, 0, 'LLM must NOT be called when usable input words < 50');
      assert.strictEqual(
        result.synopsis,
        '[PARTIAL: inputs insufficient for full synopsis]',
        'Returned synopsis must be honest [PARTIAL] line'
      );
      assert.strictEqual(
        result.representation.content,
        '[PARTIAL: inputs insufficient for full synopsis]',
        'Saved representation content must be honest [PARTIAL] line'
      );
      assert.strictEqual(result.representation.metadata.fell_back, true, 'Metadata must indicate fallback');
      assert.strictEqual(result.representation.metadata.usable_words, 0, 'Metadata must record 0 usable words');
      assert.strictEqual(result.representation.metadata.fallback_reason, 'insufficient_inputs', 'Fallback reason must be insufficient_inputs');

      console.log('  ✓ Verified: LLM was NOT called (0 calls), honest [PARTIAL] returned, no retry attempt fired.\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 2: Regression test — Real inputs (100+ words of prose) calls LLM and retries if below 180w
  // --------------------------------------------------------------------------
  console.log('Test 2: Real inputs (100+ words) calls LLM and retries when output < 180 words');
  {
    const book = bookRepository.create({
      title: 'F49 Real Inputs Test Book',
      author: 'Technical Author',
      content_type: 'technical',
    });

    const ch1Id = `ch-f49-real1-${Date.now()}`;
    const ch1 = chapterRepository.create({
      id: ch1Id,
      book_id: book.id,
      number: 1,
      title: 'Chapter 1',
      sequence: 1,
      content: 'This chapter explores the foundational architecture of distributed systems in modern computing.',
    });

    const realProse1 = 'Distributed systems require explicit communication protocols to coordinate state changes across separate network nodes. ' +
      'Consensus algorithms like Paxos and Raft provide fault-tolerant agreement on ordered state transitions. ' +
      'Replication logs ensure durable writes across server instances before acknowledging client mutations. ' +
      'Failure detectors monitor node heartbeats to identify unresponsive participants and initiate leader re-election. ' +
      'Formal models ensure safety properties hold despite arbitrary network delays or node crashes. ' +
      'Secondary replication mechanisms synchronize standby replicas through incremental log streaming. ' +
      'Read consistency models determine whether client read operations observe linearizable state transitions. ' +
      'Network partitions activate quorum requirements to guarantee single-leader invariants across regional data centers.';

    const realProse2 = 'The closing architecture synthesizes formal correctness proofs with pragmatic operational deployments. ' +
      'System benchmarks establish empirical latency curves across varying replication topologies and geographic regions. ' +
      'Disaster recovery pipelines validate cold-standby promotion under simulated datacenter severance. ' +
      'End-to-end telemetry captures throughput bottlenecks across high-concurrency mutation workloads.';

    const chunk1Id = `chk-f49-real1-${Date.now()}`;
    const chunk2Id = `chk-f49-real2-${Date.now()}`;

    semanticChunkRepository.insertBatch([
      {
        id: chunk1Id,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: realProse1,
        sectionHeading: 'Chapter 1: Foundations',
        tokenCount: 120,
      },
      {
        id: chunk2Id,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 1,
        textContent: realProse2,
        sectionHeading: 'Chapter 1: Advanced Metrics',
        tokenCount: 90,
      },
    ]);

    let callAttempts = 0;
    const promptsReceived = [];
    const origGenerateText = aiService.generateText;

    const fullValidOutput = 'This volume provides an authoritative examination of distributed consensus protocols, replicated state machine architectures, and formal verification frameworks for resilient infrastructure. Across multiple rigorous sections, the material addresses both algorithmic correctness and practical production trade-offs, demonstrating how quorum systems survive arbitrary network partitions without data corruption.\n\n' +
      'The interior balances theoretical mathematical proofs with concrete telemetry models, guiding engineers through leader election invariants and log replication mechanics. The text reads like an experienced systems architect\'s rigorous technical manual — confident, comprehensive, and uncompromising. Across consecutive chapters, foundational concepts such as linearizable read paths, distributed lock managers, and write-ahead logging are presented with progressive clarity.\n\n' +
      'Specialized sections explore failure detectors, heartbeat intervals, and dynamic membership reconfigurations, allowing distributed clusters to safely evolve over time without stopping continuous mutation workloads. Practitioners gain actionable heuristics for sizing replication quorums, handling split-brain anomalies, and evaluating empirical tail latency bounds under concurrent database load. The architectural framework remains disciplined, robust, and empirically verified across both synchronous local networks and wide-area cloud environments, ensuring consistent operational guarantees, minimal performance overhead, and clear failure recovery strategies for production deployments. Overall, the work provides software architects and distributed systems engineers with the rigorous mental models necessary to design fault-tolerant systems that remain dependable under real-world operating conditions.';

    aiService.generateText = async (prompt) => {
      callAttempts++;
      promptsReceived.push(prompt);
      if (callAttempts === 1) {
        // Attempt 1: short output (under 180 words floor)
        return {
          text: 'This book explores distributed systems and consensus protocols for robust infrastructure. [PARTIAL: inputs insufficient for full synopsis]',
          finish_reason: 'stop',
        };
      }
      // Attempt 2: valid output satisfying [180, 320] bounds
      return {
        text: fullValidOutput,
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);

      assert.strictEqual(callAttempts, 2, 'LLM must be called twice (initial attempt + retry when < 180 words)');
      assert.ok(promptsReceived[1].includes('IMPORTANT CONSTRAINT CORRECTION'), 'Retry prompt must include constraint correction');
      assert.ok(result.representation.content.includes('authoritative examination of distributed consensus'), 'Result must be the successful retry output');
      assert.strictEqual(result.representation.metadata.fell_back, false, 'Should not have fallen back');
      assert.strictEqual(result.representation.metadata.word_count_violation, false, 'Word count violation should be resolved on retry');

      console.log('  ✓ Verified: LLM was called, retry fired on short draft (<180w), and valid 200w synopsis produced on retry.\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 3: aiRetryGuard Part B skipRetry flag behavior
  // --------------------------------------------------------------------------
  console.log('Test 3: aiRetryGuard honors skipRetry: true on short output');
  {
    let attempts = 0;
    const guardRes = await aiRetryGuard.executeWithWordCountGuard({
      generateFn: async () => {
        attempts++;
        return { text: 'Short honest partial output consisting of only nine words.' };
      },
      prompt: 'Summarize',
      bounds: { targetWords: 250, hardFloor: 180, hardCeiling: 320 },
      maxRetries: 1,
      contextLabel: '[Test skipRetry]',
      structuralCheck: false,
      skipRetry: true,
    });

    assert.strictEqual(attempts, 1, 'When skipRetry is true, exactly 1 attempt must be made');
    assert.strictEqual(guardRes.retrySkipped, true, 'retrySkipped must be true');
    assert.strictEqual(guardRes.violation, true, 'violation should still be recorded');
    assert.strictEqual(guardRes.retried, false, 'retried must be false');
    assert.strictEqual(guardRes.text, 'Short honest partial output consisting of only nine words.');

    console.log('  ✓ Verified: skipRetry accepted attempt 1 output, skipped retry, marked retrySkipped=true.\n');
  }

  // --------------------------------------------------------------------------
  // Test 4: synthesisService.generateSynopsis delegation
  // --------------------------------------------------------------------------
  console.log('Test 4: synthesisService.generateSynopsis delegates to intelligentSummarizer');
  {
    const book = bookRepository.create({
      title: 'F49 SynthesisService Delegation Book',
      author: 'Author',
      content_type: 'novel',
    });

    const result = await synthesisService.generateSynopsis(book.id);
    assert.ok(result, 'synthesisService.generateSynopsis must return result');
    assert.strictEqual(result.synopsis, '[PARTIAL: inputs insufficient for full synopsis]');
    console.log('  ✓ Verified: synthesisService.generateSynopsis successfully routed and produced honest [PARTIAL].\n');
  }

  // --------------------------------------------------------------------------
  // Test 5: Live verification on Reverend Insanity book (if available)
  // --------------------------------------------------------------------------
  console.log('Test 5: Live verification on DB Reverend Insanity book');
  {
    const { getDatabase } = require('../db/database');
    const db = getDatabase();
    const riBook = db.prepare('SELECT id, title FROM books WHERE title LIKE ?').get('%Reverend Insanity%');

    if (riBook) {
      console.log(`  Found existing book: "${riBook.title}" (ID: ${riBook.id})`);
      const result = await intelligentSummarizer.generateSynopsis(riBook.id);
      assert.strictEqual(
        result.synopsis,
        '[PARTIAL: inputs insufficient for full synopsis]',
        'RI synopsis must be honest [PARTIAL]'
      );
      assert.ok(
        !result.synopsis.toLowerCase().includes('computer programming'),
        'RI synopsis must NOT contain fabricated programming-book text'
      );
      const rep = representationRepository.getBookRepresentation(riBook.id, 'SYNOPSIS');
      assert.strictEqual(rep.content, '[PARTIAL: inputs insufficient for full synopsis]');
      console.log(`  ✓ Live verification passed: "${riBook.title}" synopsis is honest [PARTIAL], not fabricated programming-book text.\n`);
    } else {
      console.log('  (Skipped live check: Reverend Insanity book not found in DB)\n');
    }
  }

  console.log('================================================================');
  console.log('🎉 ALL F49 SYNOPSIS RETRY TESTS PASSED');
  console.log('================================================================');
}

runF49Tests().catch((err) => {
  console.error('❌ F49 test run failed:', err);
  process.exit(1);
});
