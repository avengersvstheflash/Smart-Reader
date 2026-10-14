/**
 * backend/tests/f81_omni_reading_time_test.js
 *
 * Test suite for F81: Omni reading time in book metadata.
 *
 * Tests:
 * - T1: Book with 3 generated chapters summing 750 words returns omni_word_count=750, omni_reading_time_minutes=4
 * - T2: Book with 0 generated chapters returns omni_word_count=0
 * - T3: Book with status='pending' chapters excluded from sum
 */

'use strict';

const assert = require('assert');
const http = require('http');
const { getDatabase } = require('../db/database');
const bookService = require('../services/bookService');
const app = require('../server');

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode, body });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runF81Tests() {
  console.log('=== f81_omni_reading_time_test.js ===');
  console.log('--- Phase F81: Omni Reading Time Tests ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const db = getDatabase();
  const runId = `f81-${Date.now()}`;
  const now = new Date().toISOString();

  // Check whether smart_chapters has word_count column
  const tableInfo = db.prepare("PRAGMA table_info(smart_chapters)").all();
  const hasWordCountCol = tableInfo.some((c) => c.name === 'word_count');

  function insertSmartChapter({ id, bookId, sequence, title, status, content, wordCount }) {
    if (hasWordCountCol) {
      db.prepare(`
        INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, bookId, sequence, title, status, content, wordCount, now, now);
    } else {
      db.prepare(`
        INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, bookId, sequence, title, status, content, now, now);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // T1: Book with 3 generated chapters summing 750 words returns
    //     omni_word_count=750, omni_reading_time_minutes=4
    // -------------------------------------------------------------------------
    console.log("Test 1: Book with 3 generated chapters summing 750 words");
    const book1Id = `book-${runId}-t1`;
    bookService.createBook({
      id: book1Id,
      title: 'F81 Test Book T1',
      author: 'Author T1',
      description: 'Book for T1 reading time test',
      content_type: 'novel',
      status: 'active',
    });

    // 1250 chars per chapter = 250 words per chapter; 3 chapters = 3750 chars = 750 words
    const content250Words = 'a'.repeat(1250);
    insertSmartChapter({
      id: `sc-${runId}-t1-1`,
      bookId: book1Id,
      sequence: 1,
      title: 'Chapter 1',
      status: 'generated',
      content: content250Words,
      wordCount: 250,
    });
    insertSmartChapter({
      id: `sc-${runId}-t1-2`,
      bookId: book1Id,
      sequence: 2,
      title: 'Chapter 2',
      status: 'generated',
      content: content250Words,
      wordCount: 250,
    });
    insertSmartChapter({
      id: `sc-${runId}-t1-3`,
      bookId: book1Id,
      sequence: 3,
      title: 'Chapter 3',
      status: 'generated',
      content: content250Words,
      wordCount: 250,
    });

    // Verify via bookService.getBook directly
    const book1Direct = bookService.getBook(book1Id);
    assert.strictEqual(book1Direct.omni_word_count, 750, 'Direct omni_word_count must be 750');
    assert.strictEqual(book1Direct.omni_reading_time_minutes, 4, 'Direct omni_reading_time_minutes must be 4 (750 / 200 = 3.75 -> 4)');

    // Verify via HTTP GET /api/books/:id
    const res1 = await httpGet(`${baseUrl}/api/books/${book1Id}`);
    assert.strictEqual(res1.status, 200, 'HTTP response status must be 200');
    assert.strictEqual(res1.body.book.omni_word_count, 750, 'API omni_word_count must be 750');
    assert.strictEqual(res1.body.book.omni_reading_time_minutes, 4, 'API omni_reading_time_minutes must be 4');
    console.log('  ✓ T1 passed: omni_word_count=750, omni_reading_time_minutes=4');

    // -------------------------------------------------------------------------
    // T2: Book with 0 generated chapters returns omni_word_count=0
    // -------------------------------------------------------------------------
    console.log("Test 2: Book with 0 generated chapters returns omni_word_count=0");
    const book2Id = `book-${runId}-t2`;
    bookService.createBook({
      id: book2Id,
      title: 'F81 Test Book T2',
      author: 'Author T2',
      description: 'Book for T2 reading time test (0 chapters)',
      content_type: 'novel',
      status: 'active',
    });

    const book2Direct = bookService.getBook(book2Id);
    assert.strictEqual(book2Direct.omni_word_count, 0, 'Direct omni_word_count must be 0');
    assert.strictEqual(book2Direct.omni_reading_time_minutes, 0, 'Direct omni_reading_time_minutes must be 0');

    const res2 = await httpGet(`${baseUrl}/api/books/${book2Id}`);
    assert.strictEqual(res2.status, 200, 'HTTP response status must be 200');
    assert.strictEqual(res2.body.book.omni_word_count, 0, 'API omni_word_count must be 0');
    assert.strictEqual(res2.body.book.omni_reading_time_minutes, 0, 'API omni_reading_time_minutes must be 0');
    console.log('  ✓ T2 passed: omni_word_count=0, omni_reading_time_minutes=0');

    // -------------------------------------------------------------------------
    // T3: Book with status='pending' chapters excluded from sum
    // -------------------------------------------------------------------------
    console.log("Test 3: Book with status='pending' chapters excluded from sum");
    const book3Id = `book-${runId}-t3`;
    bookService.createBook({
      id: book3Id,
      title: 'F81 Test Book T3',
      author: 'Author T3',
      description: 'Book for T3 reading time test (pending + generated)',
      content_type: 'novel',
      status: 'active',
    });

    // 2 pending chapters, 1 generated chapter
    insertSmartChapter({
      id: `sc-${runId}-t3-1`,
      bookId: book3Id,
      sequence: 1,
      title: 'Pending Chapter 1',
      status: 'pending',
      content: 'a'.repeat(2500),
      wordCount: 500,
    });
    insertSmartChapter({
      id: `sc-${runId}-t3-2`,
      bookId: book3Id,
      sequence: 2,
      title: 'Pending Chapter 2',
      status: 'pending',
      content: 'a'.repeat(2500),
      wordCount: 500,
    });
    insertSmartChapter({
      id: `sc-${runId}-t3-3`,
      bookId: book3Id,
      sequence: 3,
      title: 'Generated Chapter 3',
      status: 'generated',
      content: content250Words,
      wordCount: 250,
    });

    const book3Direct = bookService.getBook(book3Id);
    assert.strictEqual(book3Direct.omni_word_count, 250, 'Pending chapters must be excluded from omni_word_count');
    assert.strictEqual(book3Direct.omni_reading_time_minutes, 1, 'omni_reading_time_minutes must be 1 (250 / 200 = 1.25 -> 1)');

    const res3 = await httpGet(`${baseUrl}/api/books/${book3Id}`);
    assert.strictEqual(res3.status, 200, 'HTTP response status must be 200');
    assert.strictEqual(res3.body.book.omni_word_count, 250, 'API omni_word_count must be 250');
    assert.strictEqual(res3.body.book.omni_reading_time_minutes, 1, 'API omni_reading_time_minutes must be 1');

    // Also test a book with only pending chapters
    const book3bId = `book-${runId}-t3b`;
    bookService.createBook({
      id: book3bId,
      title: 'F81 Test Book T3b',
      author: 'Author T3b',
      description: 'Book for T3b all pending chapters',
      content_type: 'novel',
      status: 'active',
    });
    insertSmartChapter({
      id: `sc-${runId}-t3b-1`,
      bookId: book3bId,
      sequence: 1,
      title: 'Pending Only Chapter',
      status: 'pending',
      content: 'a'.repeat(5000),
      wordCount: 1000,
    });
    const book3bDirect = bookService.getBook(book3bId);
    assert.strictEqual(book3bDirect.omni_word_count, 0, 'All pending book must have omni_word_count=0');
    assert.strictEqual(book3bDirect.omni_reading_time_minutes, 0, 'All pending book must have omni_reading_time_minutes=0');

    console.log('  ✓ T3 passed: status=pending chapters excluded from sum');

    console.log('\nAll F81 Omni reading time tests passed successfully!');
  } finally {
    server.close();
    // Clean up test data
    db.prepare('DELETE FROM smart_chapters WHERE id LIKE ? OR book_id LIKE ?').run(`%${runId}%`, `%${runId}%`);
    db.prepare('DELETE FROM books WHERE id LIKE ?').run(`%${runId}%`);
  }
}

if (require.main === module) {
  runF81Tests().catch((err) => {
    console.error('F81 tests failed:', err);
    process.exit(1);
  });
}

module.exports = { runF81Tests };
