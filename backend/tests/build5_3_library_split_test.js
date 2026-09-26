'use strict';

const path = require('node:path');
// Ensure test runs against test-data.db if not already configured by a runner
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'storage', 'test-data.db');

const assert = require('node:assert');
const { getDatabase, resetAndSeedDatabase } = require('../db/database');
const bookRepository = require('../repositories/bookRepository');

console.log('=== build5_3_library_split_test.js ===');
console.log('--- Phase 5.3 Library/Research Split Tests ---');

// Reset and seed base database fixture for test isolation
resetAndSeedDatabase();
const db = getDatabase();

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ? ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ? ${name}`);
    console.error(err);
    failed++;
    process.exitCode = 1;
  }
}

// Setup a raw book with no representations for Tests 1 & 2
const rawBookId = 'book-raw-' + Date.now();
const now = new Date().toISOString();

try {
  db.prepare(`
    INSERT INTO books (id, title, author, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(rawBookId, 'Raw Unsynthesized Book', 'Anonymous Author', 'A book without chapter representations.', now, now);

  // Test 1: Library filter excludes books with no chapter_representations
  runTest('Test 1: Library filter excludes books with no chapter_representations', () => {
    const libraryBooks = bookRepository.getAll();
    const foundRaw = libraryBooks.find((b) => b.id === rawBookId);
    assert.strictEqual(foundRaw, undefined, 'Raw book without chapter representations must not appear in Library (getAll)');
  });

  // Test 2: getAllSources() includes the raw book
  runTest('Test 2: getAllSources() includes the raw book', () => {
    const sourceBooks = bookRepository.getAllSources();
    const foundRaw = sourceBooks.find((b) => b.id === rawBookId);
    assert.ok(foundRaw, 'Raw book must appear in Research sources list (getAllSources)');
    assert.strictEqual(foundRaw.id, rawBookId);
  });
} finally {
  db.prepare('DELETE FROM books WHERE id = ?').run(rawBookId);
}

// Test 3: A book WITH a chapter_representation appears in getAll()
runTest('Test 3: A book WITH a chapter_representation appears in getAll()', () => {
  const seededBookId = 'book-sample-lightnovel-1';
  const libraryBooks = bookRepository.getAll();
  const foundSeeded = libraryBooks.find((b) => b.id === seededBookId);
  assert.ok(foundSeeded, 'Seeded book with representations must appear in Library (getAll)');
  assert.strictEqual(foundSeeded.id, seededBookId);
});

// Test 4: A book with an EDITORIAL_SYNTHESIS rep pointing at a synthetic chapter id appears in getAll()
runTest('Test 4: A book with an EDITORIAL_SYNTHESIS rep pointing at a synthetic chapter id appears in getAll()', () => {
  const testBookId = 'book-editorial-test-' + Date.now();
  const syntheticChapterId = 'book-editorial-' + testBookId + '-ch-plan-1';
  const repId = 'rep-test-' + Date.now();
  const t = new Date().toISOString();

  try {
    db.prepare('INSERT INTO books (id, title, author, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'active\', ?, ?)').run(testBookId, 'Editorial Synthesized Test Book', 'AI Author', 'Book with synthetic chapter rep.', t, t);

    db.prepare('INSERT INTO chapter_representations (id, book_id, chapter_id, type, content, created_at) VALUES (?, ?, ?, \'EDITORIAL_SYNTHESIS\', \'Synthesized content\', ?)').run(repId, testBookId, syntheticChapterId, t);

    // Verify syntheticChapterId does NOT exist in chapters table
    const chapterExists = db.prepare('SELECT id FROM chapters WHERE id = ?').get(syntheticChapterId);
    assert.strictEqual(chapterExists, undefined, 'Synthetic chapter must not exist in chapters table');

    const libraryBooks = bookRepository.getAll();
    const found = libraryBooks.find((b) => b.id === testBookId);
    assert.ok(found, 'Book with EDITORIAL_SYNTHESIS rep must appear in Library (getAll)');
    assert.strictEqual(found.id, testBookId);
  } finally {
    db.prepare('DELETE FROM chapter_representations WHERE id = ?').run(repId);
    db.prepare('DELETE FROM books WHERE id = ?').run(testBookId);
  }
});

// Test 5: Regression guard -- a book with no reps at all still does not appear in getAll()
runTest('Test 5: Regression guard -- a book with no reps at all still does not appear in getAll()', () => {
  const noRepBookId = 'book-norep-test-' + Date.now();
  const t = new Date().toISOString();

  try {
    db.prepare('INSERT INTO books (id, title, author, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'active\', ?, ?)').run(noRepBookId, 'No Rep Test Book', 'Anonymous', 'Book with zero representations.', t, t);

    const libraryBooks = bookRepository.getAll();
    const found = libraryBooks.find((b) => b.id === noRepBookId);
    assert.strictEqual(found, undefined, 'Book with no representations must not appear in Library (getAll)');
  } finally {
    db.prepare('DELETE FROM books WHERE id = ?').run(noRepBookId);
  }
});

console.log(`\nSplit test summary: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
