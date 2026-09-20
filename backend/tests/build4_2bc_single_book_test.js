const assert = require('assert');
const bookService = require('../services/bookService');
const semanticIndex = require('../services/semantic/semanticIndex');
const editorialService = require('../services/synthesis/editorialService');
const synthesisService = require('../services/synthesis/synthesisService');
const outlineRepository = require('../repositories/outlineRepository');
const chapterRepository = require('../repositories/chapterRepository');

async function runTests() {
  console.log('🧪 Running Build 4.2b/c Single-Book Smart Reading Tests...\n');

  // Setup: Create a test book with chapters and semantic chunks
  const testBook = await bookService.createBook({
    title: `Smart Reading Test Book ${Date.now()}`,
    author: 'Editorial Tester',
    description: 'A test book for single-book Smart Reading pipeline.',
    fileType: 'text',
  });

  console.log(`Created test book: ${testBook.id}`);

  // Add chapters
  const ch1 = await bookService.addChapter(testBook.id, {
    number: 1,
    title: 'Foundations of Modern Distributed Architectures',
    content: 'Distributed systems require fault-tolerant consensus mechanisms to maintain coherent state across nodes. In modern asynchronous networks, consensus cannot be guaranteed in the presence of unannounced node failures without partial synchrony assumptions. This chapter explores replicated state machines and the fundamental trade-offs between safety and liveness across partitioned networks.',
  });

  const ch2 = await bookService.addChapter(testBook.id, {
    number: 2,
    title: 'Consensus Protocols and Leader Election Mechanics',
    content: 'Leader election protocols provide deterministic ordering for transactional state machines under network latency. Paxos and Raft introduce structured terms to ensure that at most one valid leader can propose state transitions at any given epoch, thereby preventing split-brain anomalies and inconsistent replicas.',
  });

  const ch3 = await bookService.addChapter(testBook.id, {
    number: 3,
    title: 'Distributed Transaction Processing and Storage Engines',
    content: 'Transactional storage engines require ACID guarantees over decentralized storage shards. Two-phase commit combined with Paxos or Raft enables distributed transactional integrity, ensuring durable writes, atomic commits, and serializable snapshot isolation across heterogeneous database clusters.',
  });

  // Index semantic chunks for this single book
  await semanticIndex.indexChunks(testBook.id, [
    {
      id: `sb-chunk-1-${Date.now()}`,
      chapterId: ch1.id,
      chunkIndex: 0,
      textContent: ch1.content,
      contentType: 'paragraph',
      sectionHeading: 'Consensus & State Machines',
    },
    {
      id: `sb-chunk-2-${Date.now()}`,
      chapterId: ch2.id,
      chunkIndex: 0,
      textContent: ch2.content,
      contentType: 'paragraph',
      sectionHeading: 'Leader Election',
    },
    {
      id: `sb-chunk-3-${Date.now()}`,
      chapterId: ch3.id,
      chunkIndex: 0,
      textContent: ch3.content,
      contentType: 'paragraph',
      sectionHeading: 'Transactions & ACID',
    },
  ]);

  // ---------------------------------------------------------------------------
  // TEST 1: Single-book outline generation
  // ---------------------------------------------------------------------------
  console.log('Test 1: Single-book outline generation');
  const outline = await editorialService.generateSingleBookOutline(testBook.id, { fast: true });
  assert(outline, 'Outline result must exist');
  assert.strictEqual(outline.type, 'single_book', 'Outline type must be single_book');
  assert(Array.isArray(outline.chapters) && outline.chapters.length > 0, 'Outline must have chapters');

  const firstChap = outline.chapters[0];
  assert(firstChap.id, 'Chapter must have id');
  assert(firstChap.title, 'Chapter must have title');
  assert(firstChap.targetWordCount >= 180 && firstChap.targetWordCount <= 360, `Target word count ${firstChap.targetWordCount} should be 180-360`);
  assert(Array.isArray(firstChap.sourceSectionIds) && firstChap.sourceSectionIds.length > 0, 'Chapter must have sourceSectionIds');
  console.log(`  ✓ Test 1 passed: Generated outline with ${outline.chapters.length} chapters, type: ${outline.type}\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Single-book outline retrieval (getSingleBookOutline)
  // ---------------------------------------------------------------------------
  console.log('Test 2: Single-book outline retrieval');
  const retrieved = await editorialService.getSingleBookOutline(testBook.id);
  assert(retrieved, 'Retrieved outline result must exist');
  assert.strictEqual(retrieved.id, outline.id, 'Outline ID must match');
  assert.strictEqual(retrieved.type, 'single_book', 'Outline type must be single_book');
  console.log('  ✓ Test 2 passed: Retrieved outline by bookId successfully.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Idempotency (calling generate when ready returns existing without duplicate)
  // ---------------------------------------------------------------------------
  console.log('Test 3: Idempotency of outline generation');
  const outline2 = await editorialService.generateSingleBookOutline(testBook.id, { fast: true });
  assert.strictEqual(outline2.id, outline.id, 'Must return existing outline without recreating');
  console.log('  ✓ Test 3 passed: Generation is idempotent.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Single-book chapter synthesis
  // ---------------------------------------------------------------------------
  console.log('Test 4: Single-book chapter synthesis');
  const synthRes = await synthesisService.synthesizeChapter({
    outlineId: outline.id,
    chapterId: firstChap.id,
    fast: true,
  });

  assert(synthRes, 'Synthesis result must exist');
  assert(synthRes.representation, 'Representation must exist');
  assert(synthRes.representation.content, 'Content must not be empty');
  assert(Array.isArray(synthRes.representation.canonicalBlocks), 'canonicalBlocks must be array');

  // Verify in DB representation repository
  const rep = chapterRepository.getRepresentationByType(firstChap.id, 'EDITORIAL_SYNTHESIS');
  assert(rep, 'Representation for first chapter must exist in DB');
  assert.strictEqual(rep.synthesis_type, 'single_book', 'synthesis_type must be single_book');
  assert.strictEqual(rep.book_id, testBook.id, 'book_id must match testBook.id');
  console.log('  ✓ Test 4 passed: Synthesized chapter with synthesis_type=single_book and book_id set.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Provenance mapping preserved
  // ---------------------------------------------------------------------------
  console.log('Test 5: Provenance mapping preserved in representation');
  const meta = typeof rep.metadata === 'string' ? JSON.parse(rep.metadata) : (rep.metadata || {});
  assert(Array.isArray(meta.provenance), 'Metadata provenance must be an array');
  assert(meta.provenance.length > 0, 'Metadata provenance must not be empty');
  console.log(`  ✓ Test 5 passed: Provenance has ${meta.provenance.length} grounded chunk IDs.\n`);

  // ---------------------------------------------------------------------------
  // TEST 6: Outline and representation deletion cleanup
  // ---------------------------------------------------------------------------
  console.log('Test 6: Outline and representation deletion cleanup');
  await editorialService.deleteOutline(outline.id);
  const afterDelete = await editorialService.getSingleBookOutline(testBook.id);
  assert.strictEqual(afterDelete, null, 'Outline after deletion should be null');
  
  const repAfterDelete = chapterRepository.getRepresentationByType(firstChap.id, 'EDITORIAL_SYNTHESIS');
  assert.strictEqual(repAfterDelete, null, 'Representation should be completely deleted');
  console.log('  ✓ Test 6 passed: Deleted outline and all associated representations cleanly.\n');

  // ---------------------------------------------------------------------------
  // TEST 7: Multi-source outline backwards compatibility & isolation
  // ---------------------------------------------------------------------------
  console.log('Test 7: Multi-source outline isolation');
  const bookB = await bookService.createBook({
    title: `Multi Test Book ${Date.now()}`,
    author: 'Multi Tester',
    fileType: 'text',
  });
  await semanticIndex.indexChunks(bookB.id, [
    {
      id: `mb-chunk-${Date.now()}`,
      chapterId: 'ch-mb-1',
      chunkIndex: 0,
      textContent: 'Comparative evaluation demonstrates multi-book research collections.',
      contentType: 'paragraph',
      sectionHeading: 'Multi Book Comparative',
    },
  ]);

  const multiOutline = await editorialService.generateOutline({
    bookIds: [testBook.id, bookB.id],
    topic: 'Comparative Systems',
    fast: true,
  });

  assert(multiOutline, 'Multi outline should exist');
  assert.strictEqual(multiOutline.type, 'multi_source', 'Multi-source outline must have type multi_source');
  console.log('  ✓ Test 7 passed: Multi-source outline retains type multi_source.\n');

  // Clean up test books
  try {
    await bookService.deleteBook(testBook.id);
    await bookService.deleteBook(bookB.id);
  } catch (e) {
    // Ignore cleanup error
  }

  console.log('🎉 ALL BUILD 4.2b/c SINGLE-BOOK SMART READING TESTS PASSED!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Build 4.2b/c Test Failed:', err);
    process.exit(1);
  });
