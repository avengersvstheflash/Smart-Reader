'use strict';

const assert = require('node:assert');
const { getDatabase, resetAndSeedDatabase } = require('../db/database');
const bookRepository = require('../repositories/bookRepository');

console.log('=== build5_3_library_split_test.js ===');
console.log('--- Phase 5.3 Library/Research Split Tests ---');

// Reset and seed base database fixture
resetAndSeedDatabase();
const db = getDatabase();

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
    process.exitCode = 1;
  }
}

// Setup a raw book with no representations
const rawBookId = `book-raw-${Date.now()}`;
const now = new Date().toISOString();
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

// Test 3: A book WITH a chapter_representation appears in getAll()
runTest('Test 3: A book WITH a chapter_representation appears in getAll()', () => {
  const seededBookId = 'book-sample-lightnovel-1';
  const libraryBooks = bookRepository.getAll();
  const foundSeeded = libraryBooks.find((b) => b.id === seededBookId);
  assert.ok(foundSeeded, 'Seeded book with representations must appear in Library (getAll)');
  assert.strictEqual(foundSeeded.id, seededBookId);
});

console.log(`\nSplit test summary: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
