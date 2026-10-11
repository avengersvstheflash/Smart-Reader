'use strict';

const assert = require('assert');
const bookService = require('../services/bookService');
const { classifyPipelineStages } = require('../services/bookService');

async function runF51eTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F51e SINGLE-CHAPTER OUTLINE & SYNOPSIS GATE TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 5;

  // --------------------------------------------------------------------------
  // T1: 1-chapter book, 3000 words -> outline runs, synopsis runs.
  // --------------------------------------------------------------------------
  console.log('T1: 1-chapter book, 3000 words -> outline runs, synopsis runs');
  {
    const res = classifyPipelineStages(1, 3000);
    assert.strictEqual(res.qualifiesForOutline, true, 'T1: qualifiesForOutline must be true');
    assert.strictEqual(res.qualifiesForSynopsis, true, 'T1: qualifiesForSynopsis must be true');
    assert.strictEqual(res.runOutline, true, 'T1: runOutline must be true');
    assert.strictEqual(res.runSynopsis, true, 'T1: runSynopsis must be true');

    const resFromService = bookService.classifyPipelineStages(1, 3000);
    assert.strictEqual(resFromService.qualifiesForOutline, true, 'T1: method qualifiesForOutline must be true');
    assert.strictEqual(resFromService.qualifiesForSynopsis, true, 'T1: method qualifiesForSynopsis must be true');

    console.log('  ✓ Passed: 1 chapter, 3000 words qualifies for both outline and synopsis\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2: 1-chapter book, 1500 words -> outline skipped (below 2000), synopsis runs (above 500).
  // --------------------------------------------------------------------------
  console.log('T2: 1-chapter book, 1500 words -> outline skipped, synopsis runs');
  {
    const res = classifyPipelineStages(1, 1500);
    assert.strictEqual(res.qualifiesForOutline, false, 'T2: qualifiesForOutline must be false');
    assert.strictEqual(res.qualifiesForSynopsis, true, 'T2: qualifiesForSynopsis must be true');
    assert.strictEqual(res.runOutline, false, 'T2: runOutline must be false');
    assert.strictEqual(res.runSynopsis, true, 'T2: runSynopsis must be true');

    console.log('  ✓ Passed: 1 chapter, 1500 words skips outline but qualifies for synopsis\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3: 1-chapter book, 300 words -> both skipped.
  // --------------------------------------------------------------------------
  console.log('T3: 1-chapter book, 300 words -> both skipped');
  {
    const res = classifyPipelineStages(1, 300);
    assert.strictEqual(res.qualifiesForOutline, false, 'T3: qualifiesForOutline must be false');
    assert.strictEqual(res.qualifiesForSynopsis, false, 'T3: qualifiesForSynopsis must be false');
    assert.strictEqual(res.runOutline, false, 'T3: runOutline must be false');
    assert.strictEqual(res.runSynopsis, false, 'T3: runSynopsis must be false');

    console.log('  ✓ Passed: 1 chapter, 300 words skips both outline and synopsis\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4: 3-chapter book, 5000 words -> both run (regression: existing behavior unchanged).
  // --------------------------------------------------------------------------
  console.log('T4: 3-chapter book, 5000 words -> both run (regression: existing behavior unchanged)');
  {
    const res = classifyPipelineStages(3, 5000);
    assert.strictEqual(res.qualifiesForOutline, true, 'T4: qualifiesForOutline must be true');
    assert.strictEqual(res.qualifiesForSynopsis, true, 'T4: qualifiesForSynopsis must be true');
    assert.strictEqual(res.runOutline, true, 'T4: runOutline must be true');
    assert.strictEqual(res.runSynopsis, true, 'T4: runSynopsis must be true');

    console.log('  ✓ Passed: 3 chapters, 5000 words qualifies for both outline and synopsis\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5: 0-chapter book (empty) -> both skipped.
  // --------------------------------------------------------------------------
  console.log('T5: 0-chapter book (empty) -> both skipped');
  {
    const res = classifyPipelineStages(0, 0);
    assert.strictEqual(res.qualifiesForOutline, false, 'T5: qualifiesForOutline must be false');
    assert.strictEqual(res.qualifiesForSynopsis, false, 'T5: qualifiesForSynopsis must be false');
    assert.strictEqual(res.runOutline, false, 'T5: runOutline must be false');
    assert.strictEqual(res.runSynopsis, false, 'T5: runSynopsis must be false');

    // Also test null/undefined edge cases
    const resNull = classifyPipelineStages(null, undefined);
    assert.strictEqual(resNull.qualifiesForOutline, false, 'T5: null/undefined qualifiesForOutline must be false');
    assert.strictEqual(resNull.qualifiesForSynopsis, false, 'T5: null/undefined qualifiesForSynopsis must be false');

    console.log('  ✓ Passed: 0 chapters skips both outline and synopsis\n');
    passed++;
  }

  console.log('================================================================');
  console.log(`🎉 ALL ${passed}/${total} F51e TESTS PASSED SUCCESSFULLY`);
  console.log('================================================================\n');
}

runF51eTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});

