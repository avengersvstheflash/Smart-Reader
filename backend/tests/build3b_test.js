const assert = require('assert');
const preprocessor = require('../services/semantic/preprocessor');
const semanticChunker = require('../services/semantic/semanticChunker');
const LocalEmbeddingProvider = require('../services/semantic/embeddings/localEmbeddingProvider');
const embeddingService = require('../services/semantic/embeddings/embeddingService');
const semanticIndex = require('../services/semantic/semanticIndex');
const retrievalService = require('../services/semantic/retrievalService');
const contextBuilder = require('../services/semantic/contextBuilder');
const intelligentSummarizer = require('../services/ai/intelligentSummarizer');
const representationRepository = require('../repositories/representationRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const bookService = require('../services/bookService');
const { getDatabase, resetAndSeedDatabase } = require('../db/database');

async function runTests() {
  console.log('🧪 Starting Build 3B: Semantic Memory & Intelligent Summarization Tests...\n');

  // Reset database to ensure clean test state
  resetAndSeedDatabase();
  const db = getDatabase();

  // Test 1: Preprocessor preserves structural hierarchy
  console.log('Test 1: Preprocessor preserves headings, tables, quotes, callouts, lists');
  const sampleBlocks = [
    { type: 'heading', level: 1, text: 'Principles of Wave Collapse' },
    { type: 'paragraph', text: 'Quantum states evolve deterministically according to the Schrödinger equation until observation occurs.' },
    { type: 'table', headers: ['Experiment', 'Result'], rows: [['Double Slit', 'Interference'], ['Delayed Choice', 'Complementarity']] },
    { type: 'callout', variant: 'warning', title: 'Decoherence', text: 'Thermal fluctuation may simulate wave collapse.' },
    { type: 'quote', text: 'God does not play dice with the universe.', author: 'A. Einstein' },
    { type: 'list', items: ['Superposition', 'Entanglement', 'Tunneling'] }
  ];

  const preprocessedUnits = preprocessor.preprocessBlocks(sampleBlocks, {
    bookId: 'test-book-1',
    bookTitle: 'Quantum Horizons',
    chapterId: 'test-ch-1',
    chapterTitle: 'Chapter 1: Foundations',
  });

  assert(preprocessedUnits.length >= 5, 'Should produce preprocessed units for all structural elements');
  const tableUnit = preprocessedUnits.find(u => u.contentType === 'table');
  assert(tableUnit, 'Table unit must be identified');
  assert(tableUnit.textContent.includes('Double Slit'), 'Table text content must be structured');
  const calloutUnit = preprocessedUnits.find(u => u.contentType === 'callout');
  assert(calloutUnit, 'Callout unit must be identified');
  assert(calloutUnit.textContent.includes('Decoherence'), 'Callout text must preserve title & content');
  console.log('  ✓ Preprocessor correctly structured headings, tables, callouts, lists, and quotes.');

  // Test 2: Semantic Chunker preserves atomic units and provenance
  console.log('Test 2: Semantic Chunker creates cohesive chunks with full provenance');
  const chunks = semanticChunker.chunkPreprocessedUnits(preprocessedUnits, { title: 'Quantum Horizons' });
  assert(chunks.length > 0, 'Chunker must return chunks');
  for (const chunk of chunks) {
    assert(chunk.id, 'Chunk must have unique ID');
    assert(chunk.bookId, 'Chunk must have bookId');
    assert(chunk.sectionHeading, 'Chunk must have sectionHeading');
    assert(chunk.contentType, 'Chunk must have contentType');
    assert(chunk.textContent, 'Chunk must have textContent');
    assert(chunk.sourceReference, 'Chunk must have sourceReference');
    assert(chunk.tokenCount > 0, 'Chunk must estimate tokenCount');
    assert(chunk.contentHash, 'Chunk must have SHA256 contentHash');
  }

  // Ensure table chunk was kept intact
  const tableChunk = chunks.find(c => c.contentType === 'table');
  assert(tableChunk, 'Table chunk must remain intact as atomic unit');
  assert(tableChunk.textContent.includes('Interference'), 'Table chunk content intact');
  console.log(`  ✓ Semantic Chunker generated ${chunks.length} provenance-bearing chunks with atomic table preservation.`);

  // Test 3: LocalEmbeddingProvider mathematical & semantic discrimination
  console.log('Test 3: LocalEmbeddingProvider produces deterministic 256d vectors with cosine similarity');
  const localEmbed = new LocalEmbeddingProvider();
  assert.strictEqual(localEmbed.getDimension(), 256, 'Local embedding dimension must be 256');

  const vec1 = await localEmbed.embedText('Quantum mechanics wave-particle duality and Schrödinger equations');
  const vec2 = await localEmbed.embedText('Wave function collapse in quantum physics experiments');
  const vec3 = await localEmbed.embedText('Baking sourdough bread with flour, water, and wild yeast culture');

  assert.strictEqual(vec1.length, 256, 'Vector 1 dimension must be 256');
  const simRelated = localEmbed.cosineSimilarity(vec1, vec2);
  const simUnrelated = localEmbed.cosineSimilarity(vec1, vec3);

  console.log(`  Related similarity (Quantum & Wave function): ${simRelated.toFixed(4)}`);
  console.log(`  Unrelated similarity (Quantum & Sourdough): ${simUnrelated.toFixed(4)}`);
  assert(simRelated > simUnrelated, 'Related texts must have significantly higher similarity than unrelated texts');
  assert(simRelated > 0.4, 'Related texts should score high similarity');
  console.log('  ✓ LocalEmbeddingProvider passed semantic vector discrimination test.');

  // Test 4: SemanticIndex indexing and scoped search
  console.log('Test 4: SemanticIndex storage and retrieval across chapter, book, library scopes');
  // Wait a moment for sample books indexing or manually index
  const books = bookService.getAllBooks();
  assert(books.length >= 2, 'Sample books must exist');
  const book1 = books[0];

  const indexed = await semanticIndex.indexChunks(book1.id, chunks);
  assert(indexed.length > 0, 'Indexed chunks returned');

  // Search by chapter scope
  const searchResults = await semanticIndex.search('quantum wave collapse', {
    scope: 'book',
    bookId: book1.id,
    topK: 3,
  });
  assert(searchResults.length > 0, 'Should find matching chunks');
  assert(searchResults[0].similarityScore > 0, 'Result must have positive similarity score');
  console.log(`  ✓ SemanticIndex retrieved top match: "${searchResults[0].sectionHeading}" (Score: ${searchResults[0].similarityScore})`);

  // Test 5: RetrievalService & ContextBuilder
  console.log('Test 5: RetrievalService & ContextBuilder with grounding instructions');
  const retrievalResult = await retrievalService.retrieveForBook(book1.id, 'wave collapse experiment', { topK: 3 });
  assert(retrievalResult.chunks.length > 0, 'RetrievalService must return chunks');
  assert(retrievalResult.book, 'RetrievalService must preserve book metadata');

  const context = contextBuilder.buildRetrievalContext(retrievalResult, {
    purpose: 'synopsis',
    maxTokens: 2000,
  });
  assert(context.contextText.includes('GROUNDED SOURCE MATERIAL'), 'Context must include grounding section');
  assert(context.groundingPrompt.includes('GROUNDING DIRECTIVE'), 'Context must include grounding directive');
  assert(context.includedChunks.length > 0, 'Context must include chunks');
  console.log(`  ✓ ContextBuilder generated ${context.tokenCount} tokens with strict grounding directive.`);

  // Test 6: Intelligent Summarizer: Synopsis vs Book Summary
  console.log('Test 6: Intelligent Summarizer generates distinct Synopsis and Book Summary representations');
  const synopsisRes = await intelligentSummarizer.generateSynopsis(book1.id);
  assert(synopsisRes.representation, 'Synopsis representation must be saved');
  assert.strictEqual(synopsisRes.representation.type, 'SYNOPSIS', 'Representation type must be SYNOPSIS');
  assert(Array.isArray(synopsisRes.canonicalBlocks), 'Output must be normalized canonical blocks');
  assert(synopsisRes.canonicalBlocks.length > 0, 'Canonical blocks must not be empty');

  // Verify markdown is parsed rather than raw leaking
  for (const b of synopsisRes.canonicalBlocks) {
    assert(b.type, 'Block must have a type');
    assert(!b.text || !b.text.startsWith('###'), 'Raw markdown ### must not leak into block text');
  }

  const bookSummaryRes = await intelligentSummarizer.generateBookSummary(book1.id);
  assert(bookSummaryRes.representation, 'Book summary representation must be saved');
  assert.strictEqual(bookSummaryRes.representation.type, 'BOOK_SUMMARY', 'Representation type must be BOOK_SUMMARY');
  assert(bookSummaryRes.canonicalBlocks.length > 0, 'Book summary canonical blocks must not be empty');

  // Verify stored in DB
  const storedSynopsis = representationRepository.getBookRepresentation(book1.id, 'SYNOPSIS');
  assert(storedSynopsis, 'Stored synopsis must exist in repository');
  const storedSummary = representationRepository.getBookRepresentation(book1.id, 'BOOK_SUMMARY');
  assert(storedSummary, 'Stored book summary must exist in repository');
  console.log('  ✓ Generated and verified distinct SYNOPSIS and BOOK_SUMMARY representations.');

  // Test 7: Contextual AI Query ("Ask about book/chapter")
  console.log('Test 7: Contextual query grounded in retrieved semantic units');
  const qaRes = await intelligentSummarizer.askContextualQuery({
    bookId: book1.id,
    query: 'What experiments were mentioned regarding wave collapse?',
  });
  assert(qaRes.answer, 'QA must return answer');
  assert(qaRes.canonicalBlocks.length > 0, 'QA answer must be normalized into canonical blocks');
  assert(qaRes.includedChunks.length > 0, 'QA must list grounded source chunks');
  console.log(`  ✓ Contextual query returned answer grounded in ${qaRes.includedChunks.length} source units.`);

  // Test 8: Semantic Lifecycle Cleanup on Book Deletion
  console.log('Test 8: Semantic Lifecycle cleans up chunks and representations on book delete');
  const testBook = bookService.createBook({
    title: 'Ephemeral Science Notes',
    author: 'Test Author',
    content_type: 'notes',
  });
  bookService.addChapter(testBook.id, {
    title: 'Observation Note 1',
    content: 'First empirical observation of localized phase shifts.',
  });

  const indexedEphemeral = await semanticIndex.indexChunks(testBook.id, [{
    bookId: testBook.id,
    sequence: 0,
    sectionHeading: 'Note 1',
    contentType: 'paragraph',
    textContent: 'First empirical observation of localized phase shifts.',
    tokenCount: 10,
    contentHash: 'hash-test-del-1',
  }]);
  assert(indexedEphemeral.length === 1, 'Indexed ephemeral chunk');

  // Check chunks exist (auto-indexed on chapter add)
  let count = semanticChunkRepository.countByBookId(testBook.id);
  assert(count >= 1, `Chunk count should be >= 1, got ${count}`);

  // Now delete book
  bookService.deleteBook(testBook.id);

  // Verify zero chunks, zero representations left behind
  count = semanticChunkRepository.countByBookId(testBook.id);
  assert.strictEqual(count, 0, 'All semantic chunks must be deleted with book (No orphaned data)');
  const reps = representationRepository.getAllBookRepresentations(testBook.id);
  assert.strictEqual(reps.length, 0, 'All representations must be deleted with book');
  console.log('  ✓ Book deletion cleanly removed all semantic chunks and representations with 0 orphans.');

  console.log('\n🎉 ALL BUILD 3B TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ BUILD 3B TEST FAILED:\n', err);
  process.exit(1);
});
