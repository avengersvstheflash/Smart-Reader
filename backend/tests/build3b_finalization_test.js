const assert = require('assert');
const intelligentSummarizer = require('../services/ai/intelligentSummarizer');
const contextBuilder = require('../services/semantic/contextBuilder');
const aiNormalizer = require('../services/ai/aiNormalizer');
const representationRepository = require('../repositories/representationRepository');
const bookService = require('../services/bookService');
const semanticIndex = require('../services/semantic/semanticIndex');
const { resetAndSeedDatabase } = require('../db/database');

async function runFinalizationTests() {
  console.log('🧪 Starting Build 3B Finalization Quality & Grounding Verification...\n');

  resetAndSeedDatabase();
  const books = bookService.getAllBooks();
  assert(books.length > 0, 'Seed books must be present');
  const book = books[0];

  // Test 1: Grounding directives are content-type adaptive and ban raw markup
  console.log('Test 1: ContextBuilder grounding directives enforce strict formatting and content-type adaptation');
  const dirTechnical = contextBuilder.getGroundingInstructions('synopsis', 'technical');
  assert(dirTechnical.includes('TECHNICAL'), 'Directive should include technical type');
  assert(dirTechnical.includes('Do NOT output raw HTML tags'), 'Directive should ban raw HTML');
  assert(dirTechnical.includes('Avoid generic boilerplate'), 'Directive should forbid boilerplate');

  const dirSummary = contextBuilder.getGroundingInstructions('book_summary', 'research');
  assert(dirSummary.includes('RESEARCH'), 'Directive should adapt to research');
  assert(dirSummary.includes('Core Premise & System Framework'), 'Summary directive should guide system framework');
  console.log('  ✓ Grounding instructions properly adapt to content-type and ban raw markup.');

  // Test 2: AI Normalizer eliminates raw markup, HTML tags, and empty markers
  console.log('Test 2: AINormalizer cleanly strips raw HTML and stray markdown tokens');
  const messyAiText = `###
<strong>The Architecture of Computation</strong>
This document introduces <em>state-machine replication</em> and <code>distributed consensus</code>.

### Key Insights
* <b>Reliability:</b> Fault-tolerant nodes maintain consistency.
* <i>Latency:</i> Broadcast networks minimize round-trips.

> ### "Truth is verified through consensus." - Leslie Lamport
`;
  const normalizedBlocks = aiNormalizer.normalize(messyAiText);
  assert(normalizedBlocks.length >= 3, 'Should produce at least 3 canonical blocks');

  for (const block of normalizedBlocks) {
    if (block.text) {
      assert(!block.text.includes('<strong>'), 'No raw <strong> in block text');
      assert(!block.text.includes('<em>'), 'No raw <em> in block text');
      assert(!block.text.includes('<b>'), 'No raw <b> in block text');
      assert(!block.text.includes('<i>'), 'No raw <i> in block text');
      assert(!block.text.trim().startsWith('###'), 'No stray ### alone in block text');
    }
  }
  console.log('  ✓ AINormalizer eliminated all raw HTML and stray tokens.');

  // Test 3: Synopsis generation with source grounding & honest metadata
  console.log('Test 3: Editorial Synopsis has complete provenance, grounding, and honest metadata');
  const synopsisResult = await intelligentSummarizer.generateSynopsis(book.id, { fast: true });
  assert(synopsisResult.representation, 'Must produce stored representation');
  assert(synopsisResult.canonicalBlocks.length > 0, 'Must produce canonical blocks');

  const repMeta = synopsisResult.representation.metadata;
  assert(repMeta.grounded === true, 'Representation metadata must state grounded: true');
  assert(typeof repMeta.chunkCount === 'number', 'Chunk count must be recorded');
  assert(Array.isArray(repMeta.includedChunks), 'Included chunks must be preserved');
  assert(repMeta.provider, 'Provider must be recorded honestly');
  assert(repMeta.model, 'Model must be recorded honestly');
  console.log(`  ✓ Synopsis generated with ${repMeta.chunkCount} grounded source chunks. Provider: "${repMeta.provider}", Model: "${repMeta.model}"`);

  // Test 4: Book Summary generation with complete provenance
  console.log('Test 4: Book Summary aggregation across chapters with valid provenance');
  const summaryResult = await intelligentSummarizer.generateBookSummary(book.id, { fast: true });
  assert(summaryResult.representation, 'Must produce stored book summary representation');
  const sumMeta = summaryResult.representation.metadata;
  assert(sumMeta.grounded === true, 'Must record grounded flag');
  assert(sumMeta.chunkCount > 0, 'Must include chunks');
  assert(summaryResult.canonicalBlocks.length >= 3, 'Must produce structured sections');

  for (const block of summaryResult.canonicalBlocks) {
    assert(!block.text || !block.text.startsWith('###'), 'No raw headers inside text');
  }
  console.log(`  ✓ Book Summary generated with ${sumMeta.chunkCount} chunks. Provider: "${sumMeta.provider}"`);

  // Test 5: Contextual Q&A grounding
  console.log('Test 5: Contextual Q&A answers with grounded chunk references');
  const qaResult = await intelligentSummarizer.askContextualQuery({
    bookId: book.id,
    query: 'What is the main subject of this work?',
    options: { fast: true },
  });
  assert(qaResult.answer, 'Must return answer');
  assert(qaResult.canonicalBlocks.length > 0, 'Must return canonical blocks');
  assert(Array.isArray(qaResult.includedChunks), 'Must return includedChunks');
  for (const chunk of qaResult.includedChunks) {
    assert(chunk.id, 'Chunk must have an ID');
    assert(chunk.sourceReference, 'Chunk must have sourceReference for citations');
  }
  console.log(`  ✓ Q&A completed with ${qaResult.includedChunks.length} grounded citations.`);

  console.log('\n🎉 ALL BUILD 3B FINALIZATION QUALITY TESTS PASSED!\n');
  process.exit(0);
}

runFinalizationTests().catch(err => {
  console.error('\n❌ FINALIZATION TEST FAILED:', err);
  process.exit(1);
});
