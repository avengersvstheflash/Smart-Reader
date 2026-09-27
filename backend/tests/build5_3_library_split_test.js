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

// Setup a raw book with no smart chapters for Tests 1 & 2
const rawBookId = 'book-raw-' + Date.now();
const now = new Date().toISOString();

try {
  db.prepare(`
    INSERT INTO books (id, title, author, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(rawBookId, 'Raw Unsynthesized Book', 'Anonymous Author', 'A book without smart chapters.', now, now);

  // Test 1: Library filter excludes books with no generated smart chapters
  runTest('Test 1: Library filter excludes books with no generated smart chapters', () => {
    const libraryBooks = bookRepository.getAll();
    const foundRaw = libraryBooks.find((b) => b.id === rawBookId);
    assert.strictEqual(foundRaw, undefined, 'Raw book without generated smart chapters must not appear in Library (getAll)');
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

// Test 3: A book WITH generated smart chapters appears in getAll(), while source-only book is excluded
runTest('Test 3: A book WITH generated smart chapters appears in getAll(), while source-only book is excluded', () => {
  const seededBookId = 'book-fixture-a';
  const sourceOnlyBookId = 'book-fixture-s';
  const libraryBooks = bookRepository.getAll();
  const sourceBooks = bookRepository.getAllSources();

  const foundSeeded = libraryBooks.find((b) => b.id === seededBookId);
  assert.ok(foundSeeded, 'Seeded book with generated smart chapters must appear in Library (getAll)');
  assert.strictEqual(foundSeeded.id, seededBookId);

  const foundSourceOnlyInLibrary = libraryBooks.find((b) => b.id === sourceOnlyBookId);
  assert.strictEqual(foundSourceOnlyInLibrary, undefined, 'Source-only book without smart chapters must NOT appear in Library');

  const foundSourceOnlyInResearch = sourceBooks.find((b) => b.id === sourceOnlyBookId);
  assert.ok(foundSourceOnlyInResearch, 'Source-only book MUST appear in Research sources');
  assert.strictEqual(foundSourceOnlyInResearch.id, sourceOnlyBookId);
});

// Test 4: A book with a generated smart chapter appears in getAll()
runTest('Test 4: A book with a generated smart chapter appears in getAll()', () => {
  const testBookId = 'book-editorial-test-' + Date.now();
  const smartChapterId = 'smart-' + testBookId + '-ch-1';
  const t = new Date().toISOString();

  try {
    db.prepare('INSERT INTO books (id, title, author, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'active\', ?, ?)').run(testBookId, 'Editorial Synthesized Test Book', 'AI Author', 'Book with smart chapter.', t, t);

    db.prepare('INSERT INTO smart_chapters (id, book_id, sequence, title, status, content, created_at, updated_at) VALUES (?, ?, 1, \'Chapter 1\', \'generated\', \'Synthesized content\', ?, ?)').run(smartChapterId, testBookId, t, t);

    const libraryBooks = bookRepository.getAll();
    const found = libraryBooks.find((b) => b.id === testBookId);
    assert.ok(found, 'Book with generated smart chapter must appear in Library (getAll)');
    assert.strictEqual(found.id, testBookId);
  } finally {
    db.prepare('DELETE FROM smart_chapters WHERE id = ?').run(smartChapterId);
    db.prepare('DELETE FROM books WHERE id = ?').run(testBookId);
  }
});

// Test 5: Regression guard -- a book with no generated smart chapters still does not appear in getAll()
runTest('Test 5: Regression guard -- a book with no generated smart chapters still does not appear in getAll()', () => {
  const noRepBookId = 'book-norep-test-' + Date.now();
  const t = new Date().toISOString();

  try {
    db.prepare('INSERT INTO books (id, title, author, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'active\', ?, ?)').run(noRepBookId, 'No Rep Test Book', 'Anonymous', 'Book with zero smart chapters.', t, t);

    const libraryBooks = bookRepository.getAll();
    const found = libraryBooks.find((b) => b.id === noRepBookId);
    assert.strictEqual(found, undefined, 'Book with no generated smart chapters must not appear in Library (getAll)');
  } finally {
    db.prepare('DELETE FROM books WHERE id = ?').run(noRepBookId);
  }
});

console.log(`\nSplit test summary: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
