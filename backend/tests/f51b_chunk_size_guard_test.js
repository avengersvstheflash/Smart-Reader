'use strict';

const assert = require('assert');
const semanticChunker = require('../services/semantic/semanticChunker');

async function runF51bTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F51b MAX CHUNK SIZE GUARD TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let total = 6;

  const sentence = 'The quick brown fox jumps over the lazy dog and runs swiftly across the green open field. ';

  // --------------------------------------------------------------------------
  // T1: Normal chunk (<8K chars) passes through unchanged.
  // --------------------------------------------------------------------------
  console.log('T1: Normal chunk (<8K chars) passes through unchanged');
  {
    const normalText = sentence.repeat(40); // ~3640 chars
    assert(normalText.length < 8000, 'Precondition: normalText must be < 8000 chars');

    const inputChunk = {
      id: 'chk-t1-1',
      bookId: 'book-t1',
      chapterId: 'ch-t1',
      sequence: 0,
      sectionHeading: 'Normal Section',
      contentType: 'prose',
      textContent: normalText,
      sourceReference: 'Section 1.1',
      sourcePage: 5,
    };

    const result = semanticChunker.enforceMaxChunkSize([inputChunk]);
    assert.strictEqual(result.length, 1, 'T1: Output should contain exactly 1 chunk');
    assert.strictEqual(result[0].textContent, normalText, 'T1: Content should be unchanged');
    assert.strictEqual(result[0].sequence, 0, 'T1: Sequence should be 0');
    assert(result[0].textContent.length <= 8000, 'T1: Chunk size must be <= 8000 chars');
    console.log(`  ✓ Passed (length: ${result[0].textContent.length} chars)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2: 12K-char prose with clear sentence boundaries splits into two chunks, both under limit.
  // --------------------------------------------------------------------------
  console.log('T2: 12K-char prose with clear sentence boundaries splits into two chunks, both under limit');
  {
    const text12k = sentence.repeat(Math.ceil(12000 / sentence.length)); // ~12012 chars
    assert(text12k.length > 8000 && text12k.length <= 15000, 'Precondition: text12k should be ~12K chars');

    const inputChunk = {
      id: 'chk-t2-1',
      bookId: 'book-t2',
      chapterId: 'ch-t2',
      sequence: 0,
      sectionHeading: 'Long Chapter',
      contentType: 'prose',
      textContent: text12k,
      sourceReference: 'Chapter 2',
    };

    const result = semanticChunker.enforceMaxChunkSize([inputChunk]);
    assert.strictEqual(result.length, 2, 'T2: Should split into exactly 2 chunks');
    for (let i = 0; i < result.length; i++) {
      assert(
        result[i].textContent.length <= 8000,
        `T2: Chunk ${i} length ${result[i].textContent.length} must be <= 8000`
      );
    }
    console.log(`  ✓ Passed (split into 2 chunks: ${result[0].textContent.length} chars, ${result[1].textContent.length} chars)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3: 30K-char prose with clear sentence boundaries splits into multiple chunks, all under limit.
  // --------------------------------------------------------------------------
  console.log('T3: 30K-char prose with clear sentence boundaries splits into multiple chunks, all under limit');
  {
    const text30k = sentence.repeat(Math.ceil(30000 / sentence.length)); // ~30030 chars
    assert(text30k.length >= 28000, 'Precondition: text30k should be ~30K chars');

    const inputChunk = {
      id: 'chk-t3-1',
      bookId: 'book-t3',
      chapterId: 'ch-t3',
      sequence: 0,
      sectionHeading: 'Very Long Chapter',
      contentType: 'prose',
      textContent: text30k,
      sourceReference: 'Chapter 3',
    };

    const result = semanticChunker.enforceMaxChunkSize([inputChunk]);
    assert(result.length >= 4, `T3: Should split into at least 4 chunks (got ${result.length})`);
    for (let i = 0; i < result.length; i++) {
      assert(
        result[i].textContent.length <= 8000,
        `T3: Chunk ${i} length ${result[i].textContent.length} must be <= 8000`
      );
    }
    console.log(`  ✓ Passed (split into ${result.length} chunks: lengths ${result.map(c => c.textContent.length).join(', ')})\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4: 15K-char block with NO sentence terminators triggers CHUNK_TOO_LARGE after split attempts.
  // --------------------------------------------------------------------------
  console.log('T4: 15K-char block with NO sentence terminators triggers CHUNK_TOO_LARGE after split attempts');
  {
    const mojibake15k = 'A'.repeat(15000); // 15,000 continuous chars without sentence boundaries

    const inputChunk = {
      id: 'chk-t4-1',
      bookId: 'book-t4',
      chapterId: 'ch-t4',
      sequence: 0,
      sectionHeading: 'Mojibake Chapter',
      contentType: 'prose',
      textContent: mojibake15k,
      sourceReference: 'Corrupt File',
    };

    let caughtError = null;
    try {
      semanticChunker.enforceMaxChunkSize([inputChunk]);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError, 'T4: Expected CHUNK_TOO_LARGE error to be thrown');
    assert(
      caughtError.message.includes('CHUNK_TOO_LARGE'),
      `T4: Error message must include CHUNK_TOO_LARGE (got: ${caughtError.message})`
    );
    assert(
      caughtError.message.includes('remained 15000 chars after 3 split attempts'),
      `T4: Error message must state remained 15000 chars after 3 split attempts (got: ${caughtError.message})`
    );
    assert(
      caughtError.message.includes('limit 8000'),
      `T4: Error message must state limit 8000 (got: ${caughtError.message})`
    );
    console.log(`  ✓ Passed (caught expected error: "${caughtError.message}")\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5: Split preserves contentType and sourceReference metadata.
  // --------------------------------------------------------------------------
  console.log('T5: Split preserves contentType and sourceReference metadata');
  {
    const text12k = sentence.repeat(Math.ceil(12000 / sentence.length));

    const inputChunk = {
      id: 'chk-t5-custom',
      bookId: 'book-t5',
      chapterId: 'ch-t5',
      sequence: 4,
      sectionHeading: 'Special Section Heading',
      contentType: 'callout',
      textContent: text12k,
      sourceReference: 'Doc Page 42, Paragraph 7',
      sourcePage: 42,
      structuralRole: 'chapter',
      metadata: { customTag: 'f51b_test' },
    };

    const result = semanticChunker.enforceMaxChunkSize([inputChunk]);
    assert.strictEqual(result.length, 2, 'T5: Should produce 2 split chunks');

    for (let i = 0; i < result.length; i++) {
      const c = result[i];
      assert.strictEqual(c.contentType, 'callout', `T5: Chunk ${i} must preserve contentType`);
      assert.strictEqual(c.sourceReference, 'Doc Page 42, Paragraph 7', `T5: Chunk ${i} must preserve sourceReference`);
      assert.strictEqual(c.sectionHeading, 'Special Section Heading', `T5: Chunk ${i} must preserve sectionHeading`);
      assert.strictEqual(c.sourcePage, 42, `T5: Chunk ${i} must preserve sourcePage`);
      assert.strictEqual(c.structuralRole, 'chapter', `T5: Chunk ${i} must preserve structuralRole`);
      assert.strictEqual(c.metadata.customTag, 'f51b_test', `T5: Chunk ${i} must preserve metadata`);
    }
    console.log('  ✓ Passed (contentType, sourceReference, and other metadata preserved across all split chunks)\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T6: Sequence numbers remain monotonically increasing after splits.
  // --------------------------------------------------------------------------
  console.log('T6: Sequence numbers remain monotonically increasing after splits');
  {
    const normalText = sentence.repeat(30); // ~2730 chars
    const text12k = sentence.repeat(Math.ceil(12000 / sentence.length)); // ~12012 chars -> 2 chunks
    const text30k = sentence.repeat(Math.ceil(30000 / sentence.length)); // ~30030 chars -> 4 chunks

    const inputChunks = [
      { sequence: 0, textContent: normalText, contentType: 'prose', sourceReference: 'ref-0' },
      { sequence: 1, textContent: text12k, contentType: 'prose', sourceReference: 'ref-1' },
      { sequence: 2, textContent: text30k, contentType: 'prose', sourceReference: 'ref-2' },
      { sequence: 3, textContent: normalText, contentType: 'prose', sourceReference: 'ref-3' },
    ];

    const result = semanticChunker.enforceMaxChunkSize(inputChunks);
    // Expected: 1 + 2 + 4 + 1 = 8 chunks
    assert.strictEqual(result.length, 8, `T6: Expected 8 total chunks after splits, got ${result.length}`);

    const sequences = result.map(c => c.sequence);
    for (let i = 0; i < result.length; i++) {
      assert.strictEqual(result[i].sequence, i, `T6: Chunk at index ${i} must have sequence ${i} (got ${result[i].sequence})`);
    }
    console.log(`  ✓ Passed (sequences strictly monotonically increasing: [${sequences.join(', ')}])\n`);
    passed++;
  }

  console.log('================================================================');
  console.log(`RESULTS: ${passed}/${total} test suites passed.`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runF51bTests().catch(err => {
  console.error('Unhandled failure in F51b tests:', err);
  process.exit(1);
});

