/**
 * backend/tests/f54_synopsis_regenerate_test.js
 *
 * Test suite for F54: Synopsis Regenerate Endpoint & Behavior.
 *
 * Tests:
 * - T1: POST endpoint returns 200 for known book
 * - T2: Regenerated synopsis is stored (version history or overwrite)
 * - T3: llm_flagged_partial recomputed from new generation
 * - T4: 404 for unknown book
 */

'use strict';

const assert = require('assert');
const http = require('http');
const { getDatabase } = require('../db/database');
const representationRepository = require('../repositories/representationRepository');
const bookRepository = require('../repositories/bookRepository');
const app = require('../server');

async function runF54Tests() {
  console.log('=== f54_synopsis_regenerate_test.js ===');
  console.log('--- Phase F54: Synopsis Regenerate Endpoint Tests ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const db = getDatabase();
  const testRunId = `f54-test-${Date.now()}`;
  let passedCount = 0;

  try {
    // -------------------------------------------------------------------------
    // T4: 404 for unknown book
    // -------------------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/books/unknown-book-id-${testRunId}/synopsis/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 404, `Expected 404 for unknown book, got ${res.status}`);
      const body = await res.json();
      assert.ok(body.error, 'Response must contain error property');
      passedCount++;
      console.log('  ✓ T4: 404 for unknown book');
    }

    // -------------------------------------------------------------------------
    // Setup test book with chapters and semantic chunks
    // -------------------------------------------------------------------------
    const testBookId = `book-${testRunId}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO books (id, title, author, description, content_type, status, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testBookId,
      'F54 Test Book',
      'Test Author',
      'Initial description',
      'novel',
      'ready',
      JSON.stringify({ llm_flagged_partial: false }),
      now,
      now
    );

    const chapterId = `ch-${testRunId}-1`;
    const chapterContent = 'This is a sample chapter designed to provide content for the synopsis generation test in F54.';
    db.prepare(`
      INSERT INTO chapters (id, book_id, number, title, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(chapterId, testBookId, 1, 'Chapter 1: The Beginning', chapterContent, 20, now, now);

    const chunkId = `chunk-${testRunId}-1`;
    db.prepare(`
      INSERT INTO semantic_chunks (id, book_id, chapter_id, sequence, text_content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(chunkId, testBookId, chapterId, 1, chapterContent, now, now);

    // -------------------------------------------------------------------------
    // T1: POST endpoint returns 200 for known book
    // -------------------------------------------------------------------------
    let initialSynopsisContent = '';
    {
      const res = await fetch(`${baseUrl}/api/books/${testBookId}/synopsis/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fast: true }),
      });

      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert.strictEqual(body.success, true, 'Response must indicate success: true');
      assert.ok(body.synopsis, 'Response must return synopsis text');
      assert.ok(body.representation, 'Response must return representation object');
      assert.strictEqual(body.representation.book_id || body.representation.bookId, testBookId);
      assert.ok(body.book, 'Response must return updated book');
      initialSynopsisContent = body.synopsis;

      passedCount++;
      console.log('  ✓ T1: POST endpoint returns 200 for known book');
    }

    // -------------------------------------------------------------------------
    // T2: Regenerated synopsis is stored (version history or overwrite)
    // -------------------------------------------------------------------------
    {
      const stored = representationRepository.getBookRepresentation(testBookId, 'SYNOPSIS');
      assert.ok(stored, 'Stored synopsis representation must exist in repository');
      assert.strictEqual(stored.content, initialSynopsisContent, 'Stored content must match generated content');

      // Regenerate again and verify storage updates
      const res2 = await fetch(`${baseUrl}/api/books/${testBookId}/synopsis/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fast: true }),
      });
      assert.strictEqual(res2.status, 200);
      const body2 = await res2.json();

      const stored2 = representationRepository.getBookRepresentation(testBookId, 'SYNOPSIS');
      assert.ok(stored2, 'Stored representation must exist after second regeneration');
      assert.strictEqual(stored2.content, body2.synopsis, 'Stored content must reflect latest regeneration');

      passedCount++;
      console.log('  ✓ T2: Regenerated synopsis is stored (version history or overwrite)');
    }

    // -------------------------------------------------------------------------
    // T3: llm_flagged_partial recomputed from new generation
    // -------------------------------------------------------------------------
    {
      const updatedBook = bookRepository.getById(testBookId);
      assert.ok(updatedBook, 'Updated book record must exist');

      let meta = {};
      try {
        meta = typeof updatedBook.metadata_json === 'string'
          ? JSON.parse(updatedBook.metadata_json)
          : (updatedBook.metadata_json || {});
      } catch (_) {}

      assert.ok(
        'llm_flagged_partial' in meta,
        'llm_flagged_partial must be present in book metadata after regeneration'
      );
      // Because input usable words < 50, it is flagged as partial:
      assert.strictEqual(meta.llm_flagged_partial, true, 'llm_flagged_partial should be true for minimal inputs');

      const storedRep = representationRepository.getBookRepresentation(testBookId, 'SYNOPSIS');
      let repMeta = storedRep?.metadata;
      if (typeof repMeta === 'string') {
        try { repMeta = JSON.parse(repMeta); } catch (_) {}
      }
      assert.ok(repMeta, 'Representation metadata must exist');
      assert.strictEqual(repMeta.llm_flagged_partial, true, 'Representation metadata llm_flagged_partial must be true');

      passedCount++;
      console.log('  ✓ T3: llm_flagged_partial recomputed from new generation');
    }

    // Cleanup
    try {
      db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(testBookId);
      db.prepare('DELETE FROM chapters WHERE book_id = ?').run(testBookId);
      db.prepare('DELETE FROM book_representations WHERE book_id = ?').run(testBookId);
      db.prepare('DELETE FROM books WHERE id = ?').run(testBookId);
    } catch (_) {}

    console.log(`\nResults: ${passedCount}/4 tests passed in f54_synopsis_regenerate_test.js.\n`);
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runF54Tests().catch((err) => {
    console.error('f54_synopsis_regenerate_test failed:', err);
    process.exit(1);
  });
}

module.exports = { runF54Tests };
