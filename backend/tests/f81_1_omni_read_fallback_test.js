const assert = require('assert');
const { getDatabase } = require('../db/database');
const bookService = require('../services/bookService');

async function runF81_1Tests() {
  console.log('=== f81_1_omni_read_fallback_test.js ===');
  console.log('--- F81.1: Omni Read Word Count Per-Row Fallback Tests ---');

  const db = getDatabase();
  const runId = `f81_1-${Date.now()}`;
  const now = new Date().toISOString();

  // Ensure word_count column exists in smart_chapters to verify per-row fallback behavior
  const tableInfo = db.prepare("PRAGMA table_info(smart_chapters)").all();
  const hasWordCountCol = tableInfo.some((c) => c.name === 'word_count');
  if (!hasWordCountCol) {
    db.exec('ALTER TABLE smart_chapters ADD COLUMN word_count INTEGER');
  }

  try {
    // -------------------------------------------------------------------------
    // T1: Book with generated chapters that have word_count=NULL but content
    //     present returns omni_word_count > 0
    // -------------------------------------------------------------------------
    console.log('Test 1: Book with generated chapters with word_count=NULL falls back to LENGTH(content)/5');
    const book1Id = `book-${runId}-t1`;
    bookService.createBook({
      id: book1Id,
      title: 'F81.1 Test Book T1',
      author: 'Author T1',
      description: 'Book for T1 per-row fallback test',
      content_type: 'novel',
      status: 'active',
    });

    // 1000 chars = 200 words; 1500 chars = 300 words => total 500 words
    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t1-1`, book1Id, 1, 'Chapter 1', 'generated', 'a'.repeat(1000), null, now, now);

    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t1-2`, book1Id, 2, 'Chapter 2', 'generated', 'b'.repeat(1500), null, now, now);

    const book1 = bookService.getBook(book1Id);
    assert.ok(book1.omni_word_count > 0, `Expected omni_word_count > 0, got ${book1.omni_word_count}`);
    assert.strictEqual(book1.omni_word_count, 500, `Expected omni_word_count=500, got ${book1.omni_word_count}`);
    assert.strictEqual(book1.omni_reading_time_minutes, 3, `Expected omni_reading_time_minutes=3, got ${book1.omni_reading_time_minutes}`);
    console.log('  ✓ T1 passed: word_count=NULL fell back to content length (500 words, 3 min)');

    // -------------------------------------------------------------------------
    // T2: Book with generated chapters with word_count populated returns the
    //     sum of word_count
    // -------------------------------------------------------------------------
    console.log('Test 2: Book with generated chapters with word_count populated returns sum of word_count');
    const book2Id = `book-${runId}-t2`;
    bookService.createBook({
      id: book2Id,
      title: 'F81.1 Test Book T2',
      author: 'Author T2',
      description: 'Book for T2 populated word_count test',
      content_type: 'novel',
      status: 'active',
    });

    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t2-1`, book2Id, 1, 'Chapter 1', 'generated', 'a'.repeat(1000), 350, now, now);

    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t2-2`, book2Id, 2, 'Chapter 2', 'generated', 'b'.repeat(1500), 450, now, now);

    const book2 = bookService.getBook(book2Id);
    assert.strictEqual(book2.omni_word_count, 800, `Expected omni_word_count=800, got ${book2.omni_word_count}`);
    assert.strictEqual(book2.omni_reading_time_minutes, 4, `Expected omni_reading_time_minutes=4, got ${book2.omni_reading_time_minutes}`);
    console.log('  ✓ T2 passed: populated word_count returned sum (800 words, 4 min)');

    // -------------------------------------------------------------------------
    // T3: Book with 0 generated chapters returns 0
    // -------------------------------------------------------------------------
    console.log('Test 3: Book with 0 generated chapters returns 0');
    const book3Id = `book-${runId}-t3`;
    bookService.createBook({
      id: book3Id,
      title: 'F81.1 Test Book T3',
      author: 'Author T3',
      description: 'Book for T3 zero generated chapters test',
      content_type: 'novel',
      status: 'active',
    });

    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t3-1`, book3Id, 1, 'Chapter 1', 'pending', null, null, now, now);

    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t3-2`, book3Id, 2, 'Chapter 2', 'failed', null, null, now, now);

    const book3 = bookService.getBook(book3Id);
    assert.strictEqual(book3.omni_word_count, 0, `Expected omni_word_count=0, got ${book3.omni_word_count}`);
    assert.strictEqual(book3.omni_reading_time_minutes, 0, `Expected omni_reading_time_minutes=0, got ${book3.omni_reading_time_minutes}`);
    console.log('  ✓ T3 passed: 0 generated chapters returned 0');

    // -------------------------------------------------------------------------
    // T4: Book with mixed chapters (one with word_count, one with word_count=NULL)
    //     verifies per-row fallback calculation
    // -------------------------------------------------------------------------
    console.log('Test 4: Book with mixed generated chapters (populated + NULL fallback)');
    const book4Id = `book-${runId}-t4`;
    bookService.createBook({
      id: book4Id,
      title: 'F81.1 Test Book T4',
      author: 'Author T4',
      description: 'Book for T4 mixed chapters test',
      content_type: 'novel',
      status: 'active',
    });

    // Chapter 1: populated word_count = 400
    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t4-1`, book4Id, 1, 'Chapter 1', 'generated', 'a'.repeat(500), 400, now, now);

    // Chapter 2: word_count = NULL, content length = 1500 chars => 300 words
    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`sc-${runId}-t4-2`, book4Id, 2, 'Chapter 2', 'generated', 'b'.repeat(1500), null, now, now);

    const book4 = bookService.getBook(book4Id);
    assert.strictEqual(book4.omni_word_count, 700, `Expected omni_word_count=700, got ${book4.omni_word_count}`);
    assert.strictEqual(book4.omni_reading_time_minutes, 4, `Expected omni_reading_time_minutes=4, got ${book4.omni_reading_time_minutes}`);
    console.log('  ✓ T4 passed: mixed chapters correctly summed (400 + 300 = 700 words, 4 min)');

    console.log('\nAll F81.1 Omni read fallback tests passed successfully!');
  } finally {
    db.prepare('DELETE FROM smart_chapters WHERE id LIKE ? OR book_id LIKE ?').run(`%${runId}%`, `%${runId}%`);
    db.prepare('DELETE FROM books WHERE id LIKE ?').run(`%${runId}%`);
  }
}

if (require.main === module) {
  runF81_1Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('F81.1 tests failed:', err);
      process.exit(1);
    });
}

module.exports = { runF81_1Tests };
