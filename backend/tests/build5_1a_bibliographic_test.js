const assert = require('assert');
const bookBibliographer = require('../services/ai/bookBibliographer');
const bookClassifier = require('../services/ai/bookClassifier');
const bookRepository = require('../repositories/bookRepository');
const { getDatabase } = require('../db/database');

async function runTests() {
  console.log('=== build5_1a_bibliographic_test.js ===');

  // Test 1: Normalization
  console.log('Test 1: Normalization of structured bibliographic JSON');
  const rawData = {
    publisher: ' CRC Press ',
    publication_year: '2025',
    isbn: ' 978-1-032-78216-4 ',
    edition: ' First Edition ',
    authors: [' Nyamawe, Ally S. ', ' Mjahidi, Mohamedi M. '],
    editors: [],
    copyright_holder: ' Ally S. Nyamawe et al. ',
    language: 'English',
    subtitle: ' A Beginner\'s Guide ',
    series: null,
  };

  const normalized = bookBibliographer.normalizeBibliographic(rawData);
  assert.strictEqual(normalized.publisher, 'CRC Press');
  assert.strictEqual(normalized.publication_year, 2025);
  assert.strictEqual(normalized.isbn, '978-1-032-78216-4');
  assert.strictEqual(normalized.edition, 'First Edition');
  assert.deepStrictEqual(normalized.authors, ['Nyamawe, Ally S.', 'Mjahidi, Mohamedi M.']);
  assert.strictEqual(normalized.copyright_holder, 'Ally S. Nyamawe et al.');
  assert.strictEqual(normalized.language, 'en');
  assert.strictEqual(normalized.subtitle, 'A Beginner\'s Guide');
  assert.strictEqual(normalized.series, null);
  console.log('  ✓ Normalization handles types, trim, and ISO language mapping');

  // Test 2: Heuristic regex fallback on sample copyright page
  console.log('Test 2: Heuristic fallback on sample copyright text');
  const sampleCopyrightText = `
    Practical Machine Learning
    First edition published 2025 by CRC Press
    6000 Broken Sound Parkway NW, Suite 300, Boca Raton, FL 33487-2742
    © 2025 Ally S. Nyamawe and Mohamedi Mjahidi
    ISBN-13: 978-1-032-78216-4 (hbk)
    ISBN-10: 1-032-78216-3 (pbk)
  `;

  const fallbackResult = bookBibliographer.heuristicFallback(sampleCopyrightText, { author: 'Ally S. Nyamawe' });
  assert.strictEqual(fallbackResult.publisher, 'CRC Press');
  assert.strictEqual(fallbackResult.publication_year, 2025);
  assert.strictEqual(fallbackResult.isbn, '978-1-032-78216-4');
  assert.strictEqual(fallbackResult.edition, 'First edition');
  assert.strictEqual(fallbackResult.fell_back, true);
  console.log('  ✓ Heuristic fallback correctly extracts publisher, year, ISBN, edition');

  // Test 3: Honest absence on document without copyright (SEC 10-K shape)
  console.log('Test 3: Honest absence on 10-K document text');
  const tenKText = `
    UNITED STATES SECURITIES AND EXCHANGE COMMISSION
    Washington, D.C. 20549
    FORM 10-K
    For the fiscal year ended September 30, 2023
    Apple Inc.
    One Apple Park Way, Cupertino, California 95014
  `;

  const tenKResult = bookBibliographer.heuristicFallback(tenKText, { author: 'Apple Inc.' });
  assert.strictEqual(tenKResult.publisher, null);
  assert.strictEqual(tenKResult.isbn, null);
  assert.strictEqual(tenKResult.edition, null);
  console.log('  ✓ Heuristic fallback returns null for missing publisher, isbn, edition');

  // Test 4: Database persistence & merge into metadata_json
  console.log('Test 4: Metadata merge into books.metadata_json');
  const testBook = bookRepository.create({
    title: 'Bibliographic Test Volume',
    author: 'Test Author',
    metadata_json: {
      classification: {
        contentType: 'textbook',
        tags: ['machine-learning', 'python'],
      },
      sourceFormat: 'pdf',
    },
  });

  const extracted = await bookBibliographer.extractBibliographic(testBook.id, { fast: true });
  assert.strictEqual(extracted.fell_back, true);

  const updatedBook = bookRepository.getById(testBook.id);
  const meta = typeof updatedBook.metadata_json === 'string'
    ? JSON.parse(updatedBook.metadata_json)
    : updatedBook.metadata_json;

  assert.ok(meta.classification, 'classification key must not be overwritten');
  assert.strictEqual(meta.classification.contentType, 'textbook');
  assert.ok(meta.bibliographic, 'bibliographic key must exist');
  assert.strictEqual(meta.sourceFormat, 'pdf', 'other metadata keys must be preserved');
  console.log('  ✓ books.metadata_json.bibliographic merged without overwriting classification');

  // Test 5: bookClassifier.classifyBibliographic delegation
  console.log('Test 5: bookClassifier.classifyBibliographic delegation');
  const delegatedResult = await bookClassifier.classifyBibliographic(testBook.id, { fast: true });
  assert.ok(delegatedResult);
  console.log('  ✓ bookClassifier.classifyBibliographic delegates cleanly');

  // Clean up
  const db = getDatabase();
  db.prepare('DELETE FROM books WHERE id = ?').run(testBook.id);

  console.log('\nAll build5_1a bibliographic tests passed!\n');
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test failure:', err);
    process.exit(1);
  });
}

module.exports = { runTests };

