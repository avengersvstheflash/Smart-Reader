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
const { classifySection, SECTION_TYPES } = require('../services/ai/sectionClassifier');

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

