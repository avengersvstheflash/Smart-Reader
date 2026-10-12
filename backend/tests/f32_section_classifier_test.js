/**
 * backend/tests/f32_section_classifier_test.js
 *
 * Test suite for F32 Section Classifier.
 * Verifies heuristic rules, LLM path via resolved provider mock,
 * graceful fallback on LLM failure, and empty block safety.
 *
 * All tests run without real network calls.
 */

'use strict';

const assert = require('assert');
const {
  classifySection,
  classifyHeuristically,
  resetCircuitBreaker,
  SECTION_TYPES,
} = require('../services/ai/sectionClassifier');
const ingestionService = require('../services/ingestion/ingestionService');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F32 SECTION CLASSIFIER TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(name) {
    console.log(`[PASS] ${name}`);
    passed++;
  }

  function fail(name, err) {
    console.error(`[FAIL] ${name}\n${err.stack || err}`);
    failed++;
  }

  // T1: TOC block (dot leaders + page numbers) -> section=TOC, method=heuristic
  try {
    const tocBlock = {
      text: 'Chapter 1: Mathematical Foundations ................. 15\nChapter 2: Optimization Strategies ................... 42\nChapter 3: Neural Architectures ...................... 89',
      wordCount: 18,
      headingLevel: 0,
      position: 2,
    };
    const res = await classifySection(tocBlock, { bookTitle: 'ML Systems' });
    assert.strictEqual(res.section, 'TOC', `Expected section=TOC, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.8, `Expected confidence >= 0.8, got ${res.confidence}`);
    pass('T1: TOC block (dot leaders + page numbers) -> section=TOC, method=heuristic');
  } catch (err) {
    fail('T1: TOC block', err);
  }

  // T2: Copyright block ("All rights reserved. ISBN...") -> COPYRIGHT
  try {
    const copyrightBlock = {
      text: 'Copyright © 2024 Deep Learning Publishing. All rights reserved. ISBN 978-0-123456-78-9. Printed in the United States of America.',
      wordCount: 20,
      headingLevel: 0,
      position: 1,
    };
    const res = await classifySection(copyrightBlock, { bookTitle: 'ML Systems', isFirstBlock: true });
    assert.strictEqual(res.section, 'COPYRIGHT', `Expected section=COPYRIGHT, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.8, `Expected confidence >= 0.8, got ${res.confidence}`);
    pass('T2: Copyright block ("All rights reserved. ISBN...") -> COPYRIGHT');
  } catch (err) {
    fail('T2: Copyright block', err);
  }

  // T3: Preface heading -> PREFACE
  try {
    const prefaceBlock = {
      text: 'Preface\n\nThis book began as a collection of lecture notes for an advanced graduate seminar on distributed systems.',
      wordCount: 18,
      headingLevel: 1,
      position: 3,
    };
    const res = await classifySection(prefaceBlock, { bookTitle: 'ML Systems' });
    assert.strictEqual(res.section, 'PREFACE', `Expected section=PREFACE, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.8, `Expected confidence >= 0.8, got ${res.confidence}`);
    pass('T3: Preface heading -> PREFACE');
  } catch (err) {
    fail('T3: Preface heading', err);
  }

  // T4: Long body paragraph -> BODY, method=heuristic
  try {
    const bodyBlock = {
      text: 'Deep neural networks parameterize complex continuous functions through compositions of linear transformations and non-linear activation functions. In modern distributed training pipelines, gradient synchronization across multiple accelerator nodes represents a critical latency bottleneck that requires specialized communication collectives such as ring all-reduce and hierarchical tree reductions.',
      wordCount: 46,
      headingLevel: 0,
      position: 10,
    };
    const res = await classifySection(bodyBlock, { bookTitle: 'ML Systems', priorSection: 'BODY' });
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.7, `Expected confidence >= 0.7, got ${res.confidence}`);
    pass('T4: Long body paragraph -> BODY, method=heuristic');
  } catch (err) {
    fail('T4: Long body paragraph', err);
  }

  // T5: Ambiguous short block -> triggers LLM path (mock returns BODY)
  try {
    const ambiguousBlock = {
      text: 'Hardware Accelerator Primitives and Dataflow Engines',
      wordCount: 6,
      headingLevel: 0,
      position: 15,
    };
    let llmCalled = false;
    const mockAIService = {
      generateText: async (prompt, options) => {
        llmCalled = true;
        assert.strictEqual(options.reasoning?.enabled, false, 'Expected reasoning: { enabled: false }');
        assert.strictEqual(options.maxTokens, 60, 'Expected maxTokens: 60');
        return {
          text: JSON.stringify({ section: 'BODY', confidence: 0.88 }),
        };
      },
    };
    const res = await classifySection(ambiguousBlock, {
      bookTitle: 'ML Systems',
      priorSection: 'UNKNOWN',
      aiService: mockAIService,
    });
    assert.ok(llmCalled, 'Expected LLM to be called for ambiguous block');
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'llm', `Expected method=llm, got ${res.method}`);
    assert.strictEqual(res.confidence, 0.88, `Expected confidence=0.88, got ${res.confidence}`);
    pass('T5: Ambiguous short block -> triggers LLM path (mock returns BODY)');
  } catch (err) {
    fail('T5: Ambiguous short block', err);
  }

  // T6: LLM failure -> returns BODY with method=fallback
  try {
    const ambiguousBlock = {
      text: 'Part IV: Execution Graph Scheduling',
      wordCount: 5,
      headingLevel: 0,
      position: 22,
    };
    const failingAIService = {
      generateText: async () => {
        throw new Error('Connection refused / Provider offline');
      },
    };
    const res = await classifySection(ambiguousBlock, {
      bookTitle: 'ML Systems',
      priorSection: 'UNKNOWN',
      aiService: failingAIService,
    });
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'fallback', `Expected method=fallback, got ${res.method}`);
    assert.strictEqual(res.confidence, 0.4, `Expected confidence=0.4, got ${res.confidence}`);
    pass('T6: LLM failure -> returns BODY with method=fallback');
  } catch (err) {
    fail('T6: LLM failure', err);
  }

  // T7: Index block (alphabetical + "Index" heading) -> INDEX
  try {
    const indexBlock = {
      text: 'Index\n\nActivation functions, 12, 45\nBackpropagation, 88\nConvolution, 102\nDistributed SGD, 150',
      wordCount: 12,
      headingLevel: 1,
      position: 50,
    };
    const res = await classifySection(indexBlock, { bookTitle: 'ML Systems', isLastBlock: true });
    assert.strictEqual(res.section, 'INDEX', `Expected section=INDEX, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.8, `Expected confidence >= 0.8, got ${res.confidence}`);
    pass('T7: Index block (alphabetical + "Index" heading) -> INDEX');
  } catch (err) {
    fail('T7: Index block', err);
  }

  // T8: Empty block -> handled gracefully (no crash)
  try {
    const emptyBlock1 = { text: '', wordCount: 0, headingLevel: 0, position: 0 };
    const emptyBlock2 = null;
    const emptyBlock3 = { text: '   ' };

    const res1 = await classifySection(emptyBlock1);
    const res2 = await classifySection(emptyBlock2);
    const res3 = await classifySection(emptyBlock3);

    assert.ok(res1 && res1.section, 'res1 returned valid classification');
    assert.ok(res2 && res2.section, 'res2 returned valid classification');
    assert.ok(res3 && res3.section, 'res3 returned valid classification');
    pass('T8: Empty block -> handled gracefully (no crash)');
  } catch (err) {
    fail('T8: Empty block', err);
  }

  // T9: 30-39 words gap fix: continuation paragraph with 35 words when priorSection is BODY -> BODY (heuristic)
  try {
    const continuationBlock = {
      text: 'This intermediate paragraph contains exactly thirty-five distinct words designed to verify that the previous thirty to thirty-nine word gap has been resolved and correctly dynamically classified as body prose without falling through to unknown or triggering external calls.',
      wordCount: 35,
      headingLevel: 0,
      position: 11,
    };
    const res = await classifySection(continuationBlock, {
      bookTitle: 'ML Systems',
      priorSection: 'BODY',
    });
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.8, `Expected confidence >= 0.8, got ${res.confidence}`);
    pass('T9: 30-39 words gap fix: continuation paragraph with 35 words when priorSection is BODY -> BODY (heuristic)');
  } catch (err) {
    fail('T9: 30-39 words gap fix (continuation)', err);
  }

  // T10: Headings inside active BODY stream -> BODY (heuristic)
  try {
    const bodyHeadingBlock = {
      text: '## Assistant: Key Architectural Takeaways and Bottlenecks',
      wordCount: 7,
      headingLevel: 2,
      position: 12,
    };
    const res = await classifySection(bodyHeadingBlock, {
      bookTitle: 'ML Systems',
      priorSection: 'BODY',
    });
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.8, `Expected confidence >= 0.8, got ${res.confidence}`);
    pass('T10: Headings inside active BODY stream -> BODY (heuristic)');
  } catch (err) {
    fail('T10: Headings inside active BODY stream', err);
  }

  // T11: Substantial standalone paragraph with 35 words when priorSection is UNKNOWN -> BODY (heuristic)
  try {
    const standaloneBlock = {
      text: 'In distributed deep learning architectures, gradients computed across worker replicas must be aggregated through collective reduction primitives before the local weights can be updated synchronously during each training step of the distributed training optimizer pipeline.',
      wordCount: 35,
      headingLevel: 0,
      position: 4,
    };
    const res = await classifySection(standaloneBlock, {
      bookTitle: 'ML Systems',
      priorSection: 'UNKNOWN',
    });
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.75, `Expected confidence >= 0.75, got ${res.confidence}`);
    pass('T11: Substantial standalone paragraph with 35 words when priorSection is UNKNOWN -> BODY (heuristic)');
  } catch (err) {
    fail('T11: Standalone 35 words paragraph', err);
  }

  // T12: Code block and Table block -> BODY (heuristic, confidence 0.9)
  try {
    const codeBlock = {
      text: 'def all_reduce(gradients, rank, world_size):\n    return sum(gradients) / world_size',
      wordCount: 8,
      headingLevel: 0,
      type: 'code',
      position: 14,
    };
    const tableBlock = {
      text: '| Metric | Value |\n| Latency | 12ms |',
      wordCount: 6,
      headingLevel: 0,
      type: 'table',
      position: 15,
    };
    const resCode = await classifySection(codeBlock, { priorSection: 'UNKNOWN' });
    const resTable = await classifySection(tableBlock, { priorSection: 'UNKNOWN' });

    assert.strictEqual(resCode.section, 'BODY');
    assert.strictEqual(resCode.method, 'heuristic');
    assert.strictEqual(resTable.section, 'BODY');
    assert.strictEqual(resTable.method, 'heuristic');
    pass('T12: Code block and Table block -> BODY (heuristic, confidence 0.9)');
  } catch (err) {
    fail('T12: Code and Table block', err);
  }

  // T13: Safety Circuit Breaker: trips after max LLM calls with circuitBreaker object
  try {
    const ambiguousBlock = {
      text: 'Uncommon Edge Subsystem Interface Component',
      wordCount: 5,
      headingLevel: 0,
      position: 1,
    };
    let llmCallCount = 0;
    const mockAIService = {
      generateText: async () => {
        llmCallCount++;
        return { text: JSON.stringify({ section: 'BODY', confidence: 0.85 }) };
      },
    };

    const circuitBreaker = { maxCalls: 3, calls: 0 };
    // Calls 1, 2, 3 should hit mock LLM
    for (let i = 0; i < 3; i++) {
      const res = await classifySection(ambiguousBlock, {
        bookTitle: 'CB Test 1',
        priorSection: 'UNKNOWN',
        aiService: mockAIService,
        circuitBreaker,
      });
      assert.strictEqual(res.method, 'llm');
    }
    assert.strictEqual(llmCallCount, 3, 'Expected exactly 3 LLM calls before breaker');

    // Call 4: should trip circuit breaker and NOT invoke mockAIService
    const resTripped = await classifySection(ambiguousBlock, {
      bookTitle: 'CB Test 1',
      priorSection: 'UNKNOWN',
      aiService: mockAIService,
      circuitBreaker,
    });
    assert.strictEqual(llmCallCount, 3, 'Mock LLM should not be called after breaker tripped');
    assert.strictEqual(resTripped.section, 'BODY', 'Expected tripped section to be BODY');
    assert.strictEqual(resTripped.method, 'fallback', 'Expected tripped method to be fallback');
    assert.strictEqual(resTripped.circuitBreakerTriggered, true, 'Expected circuitBreakerTriggered to be true');
    pass('T13: Safety Circuit Breaker: trips after max LLM calls with circuitBreaker object');
  } catch (err) {
    fail('T13: Safety Circuit Breaker with object', err);
  }

  // T14: Safety Circuit Breaker: trips per-docKey without explicit circuitBreaker object
  try {
    resetCircuitBreaker('CB-DocKey-Test');
    const ambiguousBlock = {
      text: 'Uncommon Edge Subsystem Interface Component',
      wordCount: 5,
      headingLevel: 0,
      position: 2,
    };
    let llmCallCount = 0;
    const mockAIService = {
      generateText: async () => {
        llmCallCount++;
        return { text: JSON.stringify({ section: 'BODY', confidence: 0.85 }) };
      },
    };

    for (let i = 0; i < 2; i++) {
      const res = await classifySection(ambiguousBlock, {
        bookTitle: 'CB-DocKey-Test',
        priorSection: 'UNKNOWN',
        aiService: mockAIService,
        maxLlmCalls: 2,
      });
      assert.strictEqual(res.method, 'llm');
    }
    assert.strictEqual(llmCallCount, 2);

    // Call 3 should trip docKey breaker
    const resTripped = await classifySection(ambiguousBlock, {
      bookTitle: 'CB-DocKey-Test',
      priorSection: 'UNKNOWN',
      aiService: mockAIService,
      maxLlmCalls: 2,
    });
    assert.strictEqual(llmCallCount, 2, 'Mock LLM should not be called after docKey breaker tripped');
    assert.strictEqual(resTripped.section, 'BODY');
    assert.strictEqual(resTripped.method, 'fallback');
    assert.strictEqual(resTripped.circuitBreakerTriggered, true);
    pass('T14: Safety Circuit Breaker: trips per-docKey without explicit circuitBreaker object');
  } catch (err) {
    fail('T14: Safety Circuit Breaker per-docKey', err);
  }

  // T15: skipLlm option immediately skips LLM call
  try {
    const ambiguousBlock = {
      text: 'Ambiguous Fragment Without Prior Context',
      wordCount: 5,
      headingLevel: 0,
    };
    let llmCalled = false;
    const mockAIService = {
      generateText: async () => {
        llmCalled = true;
        return { text: JSON.stringify({ section: 'BODY', confidence: 0.9 }) };
      },
    };
    const res = await classifySection(ambiguousBlock, {
      bookTitle: 'Skip LLM Test',
      priorSection: 'UNKNOWN',
      skipLlm: true,
      aiService: mockAIService,
    });
    assert.strictEqual(llmCalled, false, 'LLM should not be called when skipLlm is true');
    assert.strictEqual(res.section, 'BODY');
    assert.strictEqual(res.method, 'fallback');
    pass('T15: skipLlm option immediately skips LLM call');
  } catch (err) {
    fail('T15: skipLlm option', err);
  }

  // T16: Ingestion fast path for markdown/text files: no LLM stalls on hundreds of blocks
  try {
    const fs = require('fs');
    const path = require('path');
    const fixturePath = path.join(__dirname, 'fixtures', 'chat_log_sample.txt');
    const sampleText = fs.existsSync(fixturePath)
      ? fs.readFileSync(fixturePath, 'utf8')
      : '# Chat Log\n\n## User\nHello\n\n## Assistant\nHi there, how can I help you today?';

    const t0 = Date.now();
    const result = await ingestionService.ingest({
      rawText: sampleText,
      title: 'Chat 11 Test Log',
      originalFilename: 'chat_11.md',
    });
    const duration = Date.now() - t0;

    assert.strictEqual(result.format, 'markdown');
    assert.ok(result.chapters.length >= 1, 'Expected at least 1 chapter');
    assert.ok(result.totalWordCount > 100, `Expected word count > 100, got ${result.totalWordCount}`);
    assert.ok(duration < 2000, `Expected fast ingestion < 2000ms, took ${duration}ms`);
    pass(`T16: Ingestion fast path for markdown: ingested in ${duration}ms with zero LLM stalls`);
  } catch (err) {
    fail('T16: Ingestion fast path for markdown', err);
  }

  // T17: Dynamic continuation in front-matter stream: paragraph following PREFACE heading remains PREFACE
  try {
    const prefaceParagraph = {
      text: 'This book began as a collection of lecture notes for an advanced graduate seminar on distributed systems at Stanford University.',
      wordCount: 20,
      headingLevel: 0,
      position: 4,
    };
    const res = await classifySection(prefaceParagraph, {
      bookTitle: 'ML Systems',
      priorSection: 'PREFACE',
    });
    assert.strictEqual(res.section, 'PREFACE', `Expected section=PREFACE, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    assert.ok(res.confidence >= 0.75, `Expected confidence >= 0.75, got ${res.confidence}`);
    pass('T17: Dynamic continuation in front-matter: paragraph following PREFACE heading remains PREFACE');
  } catch (err) {
    fail('T17: Dynamic front-matter continuation', err);
  }

  // T18: Dynamic continuation in back-matter stream: paragraph and code block following APPENDIX remain APPENDIX
  try {
    const appendixParagraph = {
      text: 'In this appendix we present the formal inductive proof for theorem four regarding consensus convergence bounds.',
      wordCount: 17,
      headingLevel: 0,
      position: 52,
    };
    const appendixCode = {
      text: 'def verify_invariant(state):\n    assert state.is_valid()',
      wordCount: 6,
      headingLevel: 0,
      type: 'code',
      position: 53,
    };
    const resP = await classifySection(appendixParagraph, {
      bookTitle: 'ML Systems',
      priorSection: 'APPENDIX',
    });
    const resC = await classifySection(appendixCode, {
      bookTitle: 'ML Systems',
      priorSection: 'APPENDIX',
    });
    assert.strictEqual(resP.section, 'APPENDIX', `Expected paragraph section=APPENDIX, got ${resP.section}`);
    assert.strictEqual(resC.section, 'APPENDIX', `Expected code block section=APPENDIX, got ${resC.section}`);
    pass('T18: Dynamic continuation in back-matter: paragraph and code block remain APPENDIX');
  } catch (err) {
    fail('T18: Dynamic back-matter continuation', err);
  }

  // T19: Standalone "# Table of Contents" heading without dot leaders correctly classifies as TOC
  try {
    const tocHeadingBlock = {
      text: '# Table of Contents',
      wordCount: 3,
      headingLevel: 1,
      position: 2,
    };
    const res = await classifySection(tocHeadingBlock, { bookTitle: 'Book With Markdown TOC' });
    assert.strictEqual(res.section, 'TOC', `Expected section=TOC, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    pass('T19: Standalone "# Table of Contents" heading without dot leaders -> TOC (heuristic)');
  } catch (err) {
    fail('T19: Standalone TOC heading', err);
  }

  // T20: Mention of "copyright" in middle of BODY stream does NOT falsely flip section to COPYRIGHT
  try {
    const legalProseBlock = {
      text: 'In modern intellectual property courses, copyright law is examined in contrast to patent law and trade secret protection mechanisms.',
      wordCount: 19,
      headingLevel: 0,
      position: 30,
    };
    const res = await classifySection(legalProseBlock, {
      bookTitle: 'Law of Tech',
      priorSection: 'BODY',
    });
    assert.strictEqual(res.section, 'BODY', `Expected section=BODY, got ${res.section}`);
    assert.strictEqual(res.method, 'heuristic', `Expected method=heuristic, got ${res.method}`);
    pass('T20: Mention of "copyright" in middle of BODY stream remains BODY');
  } catch (err) {
    fail('T20: Body prose with copyright mention', err);
  }

  // T21: Circuit breaker protects anonymous sessions / calls without explicit docKey or circuitBreaker object
  try {
    resetCircuitBreaker('__anonymous_session__');
    const ambiguousBlock = {
      text: 'Orphaned Module Peripheral',
      wordCount: 3,
      headingLevel: 0,
    };
    let llmCallCount = 0;
    const mockAIService = {
      generateText: async () => {
        llmCallCount++;
        return { text: JSON.stringify({ section: 'BODY', confidence: 0.85 }) };
      },
    };
    for (let i = 0; i < 2; i++) {
      const res = await classifySection(ambiguousBlock, {
        aiService: mockAIService,
        maxLlmCalls: 2,
      });
      assert.strictEqual(res.method, 'llm');
    }
    assert.strictEqual(llmCallCount, 2);

    // Call 3 should trip circuit breaker even with no docKey or circuitBreaker object provided
    const resTripped = await classifySection(ambiguousBlock, {
      aiService: mockAIService,
      maxLlmCalls: 2,
    });
    assert.strictEqual(llmCallCount, 2, 'Mock LLM should not be called after breaker tripped');
    assert.strictEqual(resTripped.section, 'BODY');
    assert.strictEqual(resTripped.method, 'fallback');
    assert.strictEqual(resTripped.circuitBreakerTriggered, true);
    pass('T21: Circuit breaker protects anonymous sessions without explicit docKey or object');
  } catch (err) {
    fail('T21: Anonymous circuit breaker protection', err);
  }

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});

