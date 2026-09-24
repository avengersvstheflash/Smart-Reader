const assert = require('assert');
const { getDatabase, resetAndSeedDatabase } = require('../db/database');
const bookService = require('../services/bookService');
const semanticIndex = require('../services/semantic/semanticIndex');
const retrievalService = require('../services/semantic/retrievalService');
const editorialService = require('../services/synthesis/editorialService');
const synthesisService = require('../services/synthesis/synthesisService');
const outlineRepository = require('../repositories/outlineRepository');
const representationRepository = require('../repositories/representationRepository');

async function runBuild4Verification() {
  console.log('🧪 Starting Build 4: Cross-Source Intelligence & Editorial Synthesis Verification...\n');

  const db = getDatabase();

  const books = bookService.getAllBooks();
  assert(books.length >= 2, 'Must have at least 2 books in database to test cross-source intelligence');
  const book1 = books[0];
  const book2 = books[1];

  console.log(`Using sources for cross-source testing:\n  Book 1: "${book1.title}" (${book1.id})\n  Book 2: "${book2.title}" (${book2.id})\n`);

  // Ensure both books have indexed semantic chunks with distinct content
  const sampleChunksBook1 = [
    {
      id: `chunk-b1-1-${Date.now()}`,
      chapterId: 'ch-b1-1',
      chunkIndex: 0,
      textContent: 'Distributed systems require fault-tolerant consensus mechanisms to maintain coherent state across nodes.',
      contentType: 'paragraph',
      sectionHeading: 'Consensus in Distributed Networks',
    },
    {
      id: `chunk-b1-2-${Date.now()}`,
      chapterId: 'ch-b1-1',
      chunkIndex: 1,
      textContent: 'Leader election protocols provide deterministic ordering for transactional state machines under network latency.',
      contentType: 'paragraph',
      sectionHeading: 'Leader Election and State Replicas',
    }
  ];

  const sampleChunksBook2 = [
    {
      id: `chunk-b2-1-${Date.now()}`,
      chapterId: 'ch-b2-1',
      chunkIndex: 0,
      textContent: 'Decentralized consensus algorithms achieve fault tolerance without relying on centralized leader nodes.',
      contentType: 'paragraph',
      sectionHeading: 'Decentralized Fault Tolerance',
    },
    {
      id: `chunk-b2-2-${Date.now()}`,
      chapterId: 'ch-b2-1',
      chunkIndex: 1,
      textContent: 'High latency and packet drops degrade throughput across distributed computing networks.',
      contentType: 'paragraph',
      sectionHeading: 'Network Latency Dynamics',
    }
  ];

  await semanticIndex.indexChunks(book1.id, sampleChunksBook1);
  await semanticIndex.indexChunks(book2.id, sampleChunksBook2);

  // -------------------------------------------------------------------------
  // TEST 1: Cross-Source Retrieval returns chunks from >= 2 different books
  // -------------------------------------------------------------------------
  console.log('Test 1: Cross-source retrieval returns relevant chunks from >= 2 different books');
  const crossSourceQuery = 'consensus fault tolerance and distributed latency';
  const retrievalResults = await retrievalService.search(crossSourceQuery, {
    bookIds: [book1.id, book2.id],
    scope: 'collection',
    minScore: 0.2,
    topK: 8,
  });

  assert(retrievalResults.length > 0, 'Retrieval must return matching chunks');
  const uniqueBookIds = new Set(retrievalResults.map((r) => r.bookId));
  console.log(`  Retrieved ${retrievalResults.length} chunks spanning books: ${Array.from(uniqueBookIds).join(', ')}`);
  assert(uniqueBookIds.size >= 2, 'Cross-source retrieval MUST return chunks from at least 2 distinct books');
  assert(uniqueBookIds.has(book1.id) && uniqueBookIds.has(book2.id), 'Retrieval must include both requested books');
  console.log('  ✓ Test 1 passed: Cross-source retrieval returned chunks from multiple sources.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Editorial outline maps chapters to source sections from >= 2 books
  // -------------------------------------------------------------------------
  console.log('Test 2: Editorial outline maps chapters to source sections from >= 2 books');
  const outline = await editorialService.generateOutline({
    bookIds: [book1.id, book2.id],
    topic: 'Comparative Architectures of Distributed Consensus',
    title: 'Editorial Synthesis: Consensus Architectures',
    fast: true,
  });

  assert(outline, 'Editorial outline must be created');
  assert(outline.outlineId, 'Outline must have outlineId');
  assert(Array.isArray(outline.chapters) && outline.chapters.length > 0, 'Outline must have chapters array');

  // Collect all contributing chunk IDs across the outline
  const allSourceSectionIds = [];
  outline.chapters.forEach((ch) => {
    assert(ch.chapterId, 'Chapter must have chapterId');
    assert(ch.title, 'Chapter must have a title');
    assert(Array.isArray(ch.sourceSectionIds), 'Chapter must have sourceSectionIds array');
    allSourceSectionIds.push(...ch.sourceSectionIds);
  });

  assert(allSourceSectionIds.length > 0, 'Outline chapters must reference source sections');

  // Verify that the mapped source sections originate from >= 2 books
  const placeholders = allSourceSectionIds.map(() => '?').join(',');
  const mappedChunks = db.prepare(
    `SELECT DISTINCT book_id FROM semantic_chunks WHERE id IN (${placeholders})`
  ).all(...allSourceSectionIds);

  const mappedBookIds = mappedChunks.map((c) => c.book_id);
  console.log(`  Outline mapped ${allSourceSectionIds.length} source sections across books: ${mappedBookIds.join(', ')}`);
  assert(mappedBookIds.length >= 2, 'Editorial outline must map source sections from >= 2 different books');
  console.log('  ✓ Test 2 passed: Editorial outline successfully mapped sections across multiple books.\n');

  // -------------------------------------------------------------------------
  // TEST 3 & 4: Synthesized chapter contains grounded content and valid provenance
  // -------------------------------------------------------------------------
  console.log('Test 3 & 4: Synthesized chapter contains grounded content and provable provenance');
  const targetChapter = outline.chapters[0];
  assert(targetChapter, 'Target chapter must exist in outline');

  const synthesisResult = await synthesisService.synthesizeChapter(outline.outlineId, targetChapter.chapterId, {
    fast: true,
  });

  assert(synthesisResult, 'Synthesis result must be defined');
  const rep = synthesisResult.representation;
  assert(rep, 'Representation must be returned and stored');
  assert.strictEqual(rep.synthesisType, 'cross_source', 'Representation synthesisType must be "cross_source"');
  assert(rep.content && rep.content.length > 50, 'Representation content must be substantial synthesized text');
  assert(Array.isArray(synthesisResult.canonicalBlocks) && synthesisResult.canonicalBlocks.length > 0, 'Must produce canonical blocks');

  // Provable provenance: representation.provenance must contain valid chunkIds
  assert(Array.isArray(rep.provenance), 'representation.provenance must be an array of chunk IDs');
  assert(rep.provenance.length > 0, 'representation.provenance must not be empty');

  // Verify all chunk IDs in provenance exist in semantic_chunks
  const provPlaceholders = rep.provenance.map(() => '?').join(',');
  const validChunks = db.prepare(
    `SELECT id, book_id FROM semantic_chunks WHERE id IN (${provPlaceholders})`
  ).all(...rep.provenance);

  assert.strictEqual(validChunks.length, rep.provenance.length, 'Every provenance chunkId must exist in the database');
  console.log(`  Verified ${rep.provenance.length} provable source chunk IDs in database`);
  console.log('  ✓ Test 3 & 4 passed: Synthesized chapter has grounded content and valid, provable provenance.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Deletion cascade: deleting an outline cleans up associated representations
  // -------------------------------------------------------------------------
  console.log('Test 5: Deletion cascade: deleting an outline cleans up associated representations');

  // Confirm outline and representation exist before delete
  const outlineBefore = outlineRepository.getById(outline.outlineId);
  assert(outlineBefore, 'Outline must exist in database before deletion');

  const repCheckBefore = db.prepare(
    'SELECT COUNT(*) as cnt FROM chapter_representations WHERE chapter_id = ?'
  ).get(targetChapter.chapterId);
  assert(repCheckBefore.cnt > 0, 'Representation must exist before deletion');

  // Execute deletion of outline
  const deleteSuccess = editorialService.deleteOutline(outline.outlineId);
  assert(deleteSuccess, 'deleteOutline must return true');

  // Verify outline record is removed
  const outlineAfter = outlineRepository.getById(outline.outlineId);
  assert(!outlineAfter, 'Outline must be deleted from database');

  // Verify associated chapter representations are cleaned up
  const repCheckAfter = db.prepare(
    'SELECT COUNT(*) as cnt FROM chapter_representations WHERE chapter_id = ?'
  ).get(targetChapter.chapterId);
  assert.strictEqual(repCheckAfter.cnt, 0, 'Associated representations must be deleted by outline deletion cascade');
  console.log('  ✓ Test 5 passed: Outline deletion cascade successfully cleaned up outline and all associated chapter representations.\n');

  console.log('🎉 ALL BUILD 4 CROSS-SOURCE INTELLIGENCE & EDITORIAL SYNTHESIS TESTS PASSED!\n');
}

runBuild4Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Build 4 Verification Failed:', err);
    process.exit(1);
  });
