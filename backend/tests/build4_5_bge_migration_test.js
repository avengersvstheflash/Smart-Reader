const assert = require('assert');
const bgeEmbeddingProvider = require('../services/semantic/embeddings/bgeEmbeddingProvider');
const embeddingService = require('../services/semantic/embeddings/embeddingService');
const semanticIndex = require('../services/semantic/semanticIndex');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const LocalEmbeddingProvider = require('../services/semantic/embeddings/localEmbeddingProvider');

async function runBgeMigrationTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 4.5 BGE-M3 (1024d) EMBEDDINGS & MIGRATION TESTS');
  console.log('================================================================\n');

  // Test 1: embed('hello world') → dims === 1024
  console.log('[Test 1] Verifying embed("hello world") produces 1024 dimensions');
  const vec1 = await bgeEmbeddingProvider.embed('hello world');
  assert(Array.isArray(vec1), 'embed("hello world") must return an array');
  assert.strictEqual(vec1.length, 1024, `Expected vector length 1024, got ${vec1.length}`);
  assert.strictEqual(vec1.dims, 1024, `Expected vec1.dims === 1024, got ${vec1.dims}`);
  console.log(`  ✓ embed("hello world") returned 1024d vector (dims: ${vec1.dims}, length: ${vec1.length}).\n`);

  // Test 2: embed(['a','b','c']) → shape [3, 1024]
  console.log('[Test 2] Verifying embed(["a","b","c"]) produces shape [3, 1024]');
  const batch = await bgeEmbeddingProvider.embed(['a', 'b', 'c']);
  assert(Array.isArray(batch), 'embed(array) must return an array');
  assert.strictEqual(batch.length, 3, `Expected batch length 3, got ${batch.length}`);
  for (let i = 0; i < batch.length; i++) {
    assert.strictEqual(batch[i].length, 1024, `Batch item ${i} must have 1024 dimensions, got ${batch[i].length}`);
  }
  const shape = [batch.length, batch[0].length];
  console.log(`  ✓ Batch shape verified: [${shape.join(', ')}].\n`);

  // Test 3: Passage retrieval. A question must be closer to a topically
  // relevant passage than to an unrelated one. This is the real task.
  console.log('[Test 3] Verifying passage retrieval: relevant > unrelated');

  const query = 'How does supervised learning work in neural networks?';

  const passageRelevant =
    'Supervised learning is a paradigm in machine learning where a model ' +
    'is trained on labeled examples. During training the network compares ' +
    'its predictions against the true labels and updates its weights via ' +
    'backpropagation to minimize a loss function. Common algorithms ' +
    'include linear regression, logistic regression, and deep neural ' +
    'networks.';

  const passageUnrelated =
    'Photosynthesis is the process by which green plants, algae, and some ' +
    'bacteria convert light energy into chemical energy. Chlorophyll ' +
    'absorbs light most strongly in the blue and red parts of the ' +
    'spectrum. The overall reaction produces glucose and releases oxygen ' +
    'as a byproduct.';

  const embedMany = async (texts) => {
    if (typeof embeddingService.embedBatch === 'function') {
      return embeddingService.embedBatch(texts);
    }
    return Promise.all(texts.map((t) => embeddingService.embedText(t)));
  };

  const [qVec, relVec, unrelVec] = await embedMany(
    [query, passageRelevant, passageUnrelated]
  );

  const simRel = embeddingService.cosineSimilarity(qVec, relVec);
  const simUnrel = embeddingService.cosineSimilarity(qVec, unrelVec);
  const gap = simRel - simUnrel;

  console.log(`  sim(query, relevant passage):   ${simRel.toFixed(4)}`);
  console.log(`  sim(query, unrelated passage):  ${simUnrel.toFixed(4)}`);
  console.log(`  separation gap:                 ${gap.toFixed(4)}`);

  assert.ok(
    gap > 0.05,
    `Relevant passage must beat unrelated by >0.05. rel=${simRel.toFixed(4)} unrel=${simUnrel.toFixed(4)} gap=${gap.toFixed(4)}`
  );
  console.log('  ✓ Passage retrieval separation verified.\n');

  // Test 4: Cross-lingual: sim('neural network', 'ニューラルネットワーク') > 0.5
  console.log('[Test 4] Verifying cross-lingual retrieval: sim("neural network", "ニューラルネットワーク") > 0.5');
  const vNN_en = await bgeEmbeddingProvider.embed('neural network');
  const vNN_ja = await bgeEmbeddingProvider.embed('ニューラルネットワーク');
  const simCross = bgeEmbeddingProvider.cosineSimilarity(vNN_en, vNN_ja);
  console.log(`  sim("neural network", "ニューラルネットワーク"): ${simCross.toFixed(4)}`);

  assert(
    simCross > 0.5,
    `Cross-lingual similarity (${simCross.toFixed(4)}) must be > 0.5`
  );
  console.log('  ✓ Cross-lingual test passed.\n');

  // Test 5: Stale 256d vector is rejected or migrated, not silently used
  console.log('[Test 5] Verifying stale 256d vectors are rejected / not silently used');
  const bookRepository = require('../repositories/bookRepository');
  const testBookId = `book-test-stale-${Date.now()}`;
  bookRepository.create({
    id: testBookId,
    title: 'Stale Vector Migration Test Book',
    author: 'Test Author',
    description: 'Testing 256d vector rejection',
  });

  const legacyProvider = new LocalEmbeddingProvider();
  const legacy256Vector = await legacyProvider.embedText('Legacy quantum mechanics chunk with old vectorizer');
  assert.strictEqual(legacy256Vector.length, 256, 'Legacy vector must be 256d');

  // Create a chunk in DB containing a 256d vector
  const staleChunkId = `stale-chunk-${Date.now()}`;
  const staleContentHash = `stale-hash-${Date.now()}`;
  semanticChunkRepository.insertBatch([{
    id: staleChunkId,
    bookId: testBookId,
    chapterId: null,
    sequence: 1,
    sectionHeading: 'Stale Chapter',
    contentType: 'paragraph',
    textContent: 'Legacy content stored before BGE-M3 upgrade.',
    contentHash: staleContentHash,
    embedding: legacy256Vector,
    embeddingModel: 'legacy-256d',
  }]);

  // 5a. Verify semanticIndex.search() with current 1024d query rejects the 256d vector
  const searchResults = await semanticIndex.search('Legacy content', {
    scope: 'book',
    bookId: testBookId,
    threshold: 0.01,
  });
  const staleFound = searchResults.find((r) => r.id === staleChunkId);
  assert.strictEqual(
    staleFound,
    undefined,
    'Stale 256d chunk must be rejected by 1024d search and not returned in results'
  );

  // 5b. Verify embeddingService.embedChunk() detects dimension mismatch and does NOT reuse 256d cache/DB
  const freshlyEmbeddedVector = await embeddingService.embedChunk({
    textContent: 'Legacy content stored before BGE-M3 upgrade.',
    contentHash: staleContentHash,
  });
  assert.strictEqual(
    freshlyEmbeddedVector.length,
    1024,
    `embeddingService must re-embed with 1024d instead of silently reusing 256d DB vector, got ${freshlyEmbeddedVector.length}`
  );

  // Cleanup test chunks and book
  semanticChunkRepository.deleteByBookId(testBookId);
  bookRepository.delete(testBookId);
  console.log('  ✓ Stale 256d vectors are rejected during search and re-embedded during indexing.\n');

  // Test 6: warmup() resolves without throwing
  console.log('[Test 6] Verifying warmup() resolves cleanly without throwing');
  const warmupStart = Date.now();
  await bgeEmbeddingProvider.warmup();
  await embeddingService.warmup();
  console.log(`  ✓ warmup() resolved successfully in ${Date.now() - warmupStart}ms.\n`);

  console.log('================================================================');
  console.log('🎉 ALL BUILD 4.5 BGE-M3 EMBEDDING & MIGRATION TESTS PASSED!');
  console.log('================================================================');
}

runBgeMigrationTests()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch((err) => {
    console.error('\n❌ BUILD 4.5 TEST FAILED:', err);
    setTimeout(() => process.exit(1), 100);
  });
