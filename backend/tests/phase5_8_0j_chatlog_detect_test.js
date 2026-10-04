/**
 * backend/tests/phase5_8_0j_chatlog_detect_test.js
 *
 * Phase 5.8.0j.1 — Chat-log detection classifier test suite
 * Tests heuristic detection of chat-log documents vs traditional books.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { detectChatLog } = require('../services/ingestion/chatLogDetector');

async function runTests() {
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

  // Load synthetic fixture
  const fixturePath = path.join(__dirname, 'fixtures', 'chat_log_sample.txt');
  const fixtureContent = fs.readFileSync(fixturePath, 'utf8');
  const fixtureBlocks = fixtureContent.split('\n\n');
  const fixtureResult = detectChatLog(fixtureBlocks);

  // T1 fixture scores chat_log (confidence >= 0.70)
  try {
    assert.strictEqual(fixtureResult.parseMode, 'chat_log', `Expected parseMode 'chat_log', got '${fixtureResult.parseMode}'`);
    assert.ok(fixtureResult.confidence >= 0.70, `Expected confidence >= 0.70, got ${fixtureResult.confidence}`);
    pass('T1 fixture scores chat_log (confidence >= 0.70)');
  } catch (err) {
    fail('T1 fixture scores chat_log (confidence >= 0.70)', err);
  }

  // T2 fixture signals: userMarkerDensity > 0.05
  try {
    assert.ok(fixtureResult.signals.userMarkerDensity > 0.05, `Expected userMarkerDensity > 0.05, got ${fixtureResult.signals.userMarkerDensity}`);
    pass('T2 fixture signals: userMarkerDensity > 0.05');
  } catch (err) {
    fail('T2 fixture signals: userMarkerDensity > 0.05', err);
  }

  // T3 fixture signals: modelMarkerDensity > 0.05
  try {
    assert.ok(fixtureResult.signals.modelMarkerDensity > 0.05, `Expected modelMarkerDensity > 0.05, got ${fixtureResult.signals.modelMarkerDensity}`);
    pass('T3 fixture signals: modelMarkerDensity > 0.05');
  } catch (err) {
    fail('T3 fixture signals: modelMarkerDensity > 0.05', err);
  }

  // T4 fixture signals: codeFenceDensity > 0
  try {
    assert.ok(fixtureResult.signals.codeFenceDensity > 0, `Expected codeFenceDensity > 0, got ${fixtureResult.signals.codeFenceDensity}`);
    pass('T4 fixture signals: codeFenceDensity > 0');
  } catch (err) {
    fail('T4 fixture signals: codeFenceDensity > 0', err);
  }

  // T5 fixture signals: repeatedLineDensity > 0
  try {
    assert.ok(fixtureResult.signals.repeatedLineDensity > 0, `Expected repeatedLineDensity > 0, got ${fixtureResult.signals.repeatedLineDensity}`);
    pass('T5 fixture signals: repeatedLineDensity > 0');
  } catch (err) {
    fail('T5 fixture signals: repeatedLineDensity > 0', err);
  }

  // T6 empty input -> parseMode 'book', confidence 0
  try {
    const resEmptyArray = detectChatLog([]);
    const resBlankStrings = detectChatLog(['', '   ', '\n\n']);
    assert.strictEqual(resEmptyArray.parseMode, 'book');
    assert.strictEqual(resEmptyArray.confidence, 0);
    assert.strictEqual(resBlankStrings.parseMode, 'book');
    assert.strictEqual(resBlankStrings.confidence, 0);
    pass("T6 empty input -> parseMode 'book', confidence 0");
  } catch (err) {
    fail("T6 empty input -> parseMode 'book', confidence 0", err);
  }

  // T7 book-shaped input (paste a ~50-line fake book sample inline with "Chapter 1", "Chapter 2" headings, no User:/Model:) -> confidence < 0.40, parseMode 'book'
  try {
    const bookSample = [
      'Chapter 1: The Foundations of Neural Systems',
      'The study of artificial intelligence began with simple linear models.',
      'Researchers sought to emulate the biological mechanics of the human brain.',
      'Early perceptrons demonstrated that basic binary decisions could be learned.',
      'However, linear separability imposed fundamental limitations on single-layer networks.',
      'The publication of Perceptrons by Minsky and Papert highlighted these boundaries.',
      'For over a decade, progress slowed as researchers searched for backpropagation methods.',
      'In the mid-1980s, multi-layer networks emerged as a viable alternative.',
      'By introducing non-linear activation functions, networks could approximate any continuous function.',
      'The universal approximation theorem provided theoretical grounding for deep architectures.',
      'Despite these advances, training deep networks remained computationally prohibitive.',
      'Vanishing and exploding gradients hindered optimization in deep layered graphs.',
      'Initialization techniques such as Xavier and He initialization mitigated these issues.',
      'Moreover, the advent of graphic processing units revolutionized practical training speeds.',
      'Modern frameworks now automate tensor operations and reverse-mode automatic differentiation.',
      'As data volumes expanded exponentially, neural methods surpassed classical machine learning.',
      'Statistical learning theory established generalization bounds for large hypothesis classes.',
      'Empirical risk minimization served as the foundational paradigm for empirical validation.',
      'Overfitting was mitigated through explicit regularization penalties on network weight norms.',
      'Cross-validation protocols ensured models generalized beyond the training corpus.',
      'Hyperparameter tuning transitioned from manual heuristics to Bayesian optimization routines.',
      'Early distributed training clusters handled parallelized stochastic mini-batch computations.',
      'Gradient checkpointing reduced memory footprints during reverse-pass autodiff calculations.',
      'Hardware floating-point precision shifted toward half-precision and bfloat16 tensors.',
      'Chapter 2: Convolutional Architectures and Image Processing',
      'Spatial hierarchies in visual data require translation-invariant feature extractors.',
      'Convolutional neural networks replace matrix multiplications with specialized filter kernels.',
      'Each convolutional layer applies a set of learnable kernels across the receptive field.',
      'Pooling operations reduce spatial resolution while preserving dominant activations.',
      'Max pooling selects the maximum value in each sub-region, providing local invariance.',
      'Average pooling computes the mean activation, often used before final classification heads.',
      'The breakthrough LeNet architecture demonstrated automated handwritten digit recognition.',
      'Decades later, AlexNet achieved unprecedented classification accuracy on ImageNet.',
      'Residual connections further enabled training networks with hundreds of layers.',
      'By providing identity shortcuts, gradients flow unimpeded back to early layers.',
      'Dense connections take this concept further by concatenating feature maps from all prior layers.',
      'Modern vision transformers now challenge convolutional dominance in computer vision.',
      'Self-attention mechanisms capture global contextual dependencies across image patches.',
      'Nonetheless, hybrid architectures continue to offer strong inductive biases for spatial domains.',
      'Practical deployments often require quantization and pruning to reduce inference latency.',
      'Knowledge distillation allows compact student models to learn from large teacher ensembles.',
      'Hardware accelerators such as TPUs and neural engines accelerate sparse matrix operations.',
      'Edge devices increasingly run localized models with minimal power budgets.',
      'Understanding receptive fields remains critical when designing custom vision backbones.',
      'Data augmentation pipelines artificially expand training sets through rotations and crops.',
      'Regularization methods like dropout prevent co-adaptation of hidden units.',
      'Batch normalization stabilizes training dynamics by normalizing intermediate layer activations.',
      'Layer normalization provides an alternative well-suited for sequential and recurrent data.',
      'Group normalization divides channels into groups, remaining independent of batch sizes.',
      'Weight decay penalizes large parameters, encouraging smoother decision boundaries.'
    ];
    const bookRes = detectChatLog(bookSample);
    assert.ok(bookRes.confidence < 0.40, `Expected confidence < 0.40, got ${bookRes.confidence}`);
    assert.strictEqual(bookRes.parseMode, 'book', `Expected parseMode 'book', got '${bookRes.parseMode}'`);
    pass('T7 book-shaped input (paste a ~50-line fake book sample inline with "Chapter 1", "Chapter 2" headings, no User:/Model:) -> confidence < 0.40, parseMode \'book\'');
  } catch (err) {
    fail('T7 book-shaped input (paste a ~50-line fake book sample inline with "Chapter 1", "Chapter 2" headings, no User:/Model:) -> confidence < 0.40, parseMode \'book\'', err);
  }

  // T8 single-line input "User: hi" -> parses without throwing, parseMode 'book' (too little signal)
  try {
    const singleLineRes = detectChatLog(['User: hi']);
    assert.strictEqual(singleLineRes.parseMode, 'book', `Expected parseMode 'book', got '${singleLineRes.parseMode}'`);
    pass('T8 single-line input "User: hi" -> parses without throwing, parseMode \'book\' (too little signal)');
  } catch (err) {
    fail('T8 single-line input "User: hi" -> parses without throwing, parseMode \'book\' (too little signal)', err);
  }

  // T9 null/undefined input -> parseMode 'book', confidence 0, no throw
  try {
    const nullRes = detectChatLog(null);
    const undefRes = detectChatLog(undefined);
    assert.strictEqual(nullRes.parseMode, 'book');
    assert.strictEqual(nullRes.confidence, 0);
    assert.strictEqual(undefRes.parseMode, 'book');
    assert.strictEqual(undefRes.confidence, 0);
    pass('T9 null/undefined input -> parseMode \'book\', confidence 0, no throw');
  } catch (err) {
    fail('T9 null/undefined input -> parseMode \'book\', confidence 0, no throw', err);
  }

  // T10 mixed input: paragraph with "User:" in the middle of a sentence (not line-start) should NOT count as a userMarker
  try {
    const mixedInput = [
      'In this experiment, the User: role was assigned randomly.',
      'The participant replied with enthusiasm.',
      'Another observer noted that Model: outputs varied widely.'
    ];
    const mixedRes = detectChatLog(mixedInput);
    assert.strictEqual(mixedRes.signals.userMarkerDensity, 0, `Expected userMarkerDensity 0, got ${mixedRes.signals.userMarkerDensity}`);
    assert.strictEqual(mixedRes.signals.modelMarkerDensity, 0, `Expected modelMarkerDensity 0, got ${mixedRes.signals.modelMarkerDensity}`);
    pass('T10 mixed input: paragraph with "User:" in the middle of a sentence (not line-start) should NOT count as a userMarker');
  } catch (err) {
    fail('T10 mixed input: paragraph with "User:" in the middle of a sentence (not line-start) should NOT count as a userMarker', err);
  }

  console.log(`\nTests passed: ${passed}, failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
