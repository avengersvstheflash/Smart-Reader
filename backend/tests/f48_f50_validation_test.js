'use strict';

const assert = require('assert');
const bookBibliographer = require('../services/ai/bookBibliographer');
const editorialPlanner = require('../services/synthesis/editorialPlanner');

async function runF48F50ValidationTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F48 + F50 VALIDATION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 12;

  // ==========================================================================
  // F48: Bibliographer Publisher Validation (T1 - T7)
  // ==========================================================================
  console.log('--- F48: Bibliographer Publisher Field Validation ---');

  // T1: valid publisher "Yen On" → accepted
  console.log('T1: valid publisher "Yen On" → accepted');
  {
    const res = bookBibliographer.validatePublisher('Yen On');
    assert.strictEqual(res, 'Yen On', `T1: Expected "Yen On", got ${res}`);
    console.log('  ✓ Passed: "Yen On" accepted unchanged\n');
    passed++;
  }

  // T2: valid publisher "The MIT Press" → accepted
  console.log('T2: valid publisher "The MIT Press" → accepted');
  {
    const res = bookBibliographer.validatePublisher('The MIT Press');
    assert.strictEqual(res, 'The MIT Press', `T2: Expected "The MIT Press", got ${res}`);
    console.log('  ✓ Passed: "The MIT Press" accepted unchanged\n');
    passed++;
  }

  // T3: valid publisher "新潮社" → accepted
  console.log('T3: valid publisher "新潮社" → accepted');
  {
    const res = bookBibliographer.validatePublisher('新潮社');
    assert.strictEqual(res, '新潮社', `T3: Expected "新潮社", got ${res}`);
    console.log('  ✓ Passed: "新潮社" accepted unchanged\n');
    passed++;
  }

  // T4: Overlord disclaimer string → rejected → null
  console.log('T4: Overlord disclaimer string → rejected → null');
  {
    const overlordStr = "is unlawful piracy and theft of the author's intellectual property";
    const res = bookBibliographer.validatePublisher(overlordStr);
    assert.strictEqual(res, null, `T4: Expected null, got ${res}`);
    console.log('  ✓ Passed: Overlord piracy disclaimer rejected to null\n');
    passed++;
  }

  // T5: "The quick brown fox jumps over the lazy dog" (>6 words) → rejected
  console.log('T5: "The quick brown fox jumps over the lazy dog" (>6 words) → rejected');
  {
    const longStr = 'The quick brown fox jumps over the lazy dog';
    const res = bookBibliographer.validatePublisher(longStr);
    assert.strictEqual(res, null, `T5: Expected null for >6 words candidate, got ${res}`);
    console.log('  ✓ Passed: 9-word candidate rejected to null\n');
    passed++;
  }

  // T6: "please read the license" → rejected
  console.log('T6: "please read the license" → rejected');
  {
    const licenseNotice = 'please read the license';
    const res = bookBibliographer.validatePublisher(licenseNotice);
    assert.strictEqual(res, null, `T6: Expected null for license notice, got ${res}`);
    console.log('  ✓ Passed: "please read the license" rejected to null\n');
    passed++;
  }

  // T7: "" → rejected
  console.log('T7: "" → rejected');
  {
    const res = bookBibliographer.validatePublisher('');
    assert.strictEqual(res, null, `T7: Expected null for empty string, got ${res}`);
    const whitespaceRes = bookBibliographer.validatePublisher('   ');
    assert.strictEqual(whitespaceRes, null, `T7: Expected null for whitespace string, got ${whitespaceRes}`);
    console.log('  ✓ Passed: Empty/whitespace publisher rejected to null\n');
    passed++;
  }

  // ==========================================================================
  // F50: Outline Duplicate Heading Deduplication (T8 - T12)
  // ==========================================================================
  console.log('--- F50: Outline Duplicate Heading Deduplication ---');

  // T8: two identical titles → second gets " (2)"
  console.log('T8: two identical titles → second gets " (2)"');
  {
    const input = [
      'Chapter 1: Starting the Shadowbroker Tutorial!',
      'Chapter 1: Starting the Shadowbroker Tutorial!',
    ];
    const res = editorialPlanner.deduplicateChapterTitles(input);
    assert.strictEqual(res[0], 'Chapter 1: Starting the Shadowbroker Tutorial!');
    assert.strictEqual(res[1], 'Chapter 1: Starting the Shadowbroker Tutorial! (2)');

    // Also assert object schema support
    const objInput = [
      { id: 'ch-1', title: 'Chapter 1: Starting the Shadowbroker Tutorial!' },
      { id: 'ch-2', title: 'Chapter 1: Starting the Shadowbroker Tutorial!' },
    ];
    const objRes = editorialPlanner.deduplicateChapterTitles(objInput);
    assert.strictEqual(objRes[0].title, 'Chapter 1: Starting the Shadowbroker Tutorial!');
    assert.strictEqual(objRes[1].title, 'Chapter 1: Starting the Shadowbroker Tutorial! (2)');

    console.log('  ✓ Passed: Second identical title received " (2)" suffix\n');
    passed++;
  }

  // T9: three identical titles → " (2)", " (3)"
  console.log('T9: three identical titles → " (2)", " (3)"');
  {
    const input = [
      'Chapter 1: Starting the Shadowbroker Tutorial!',
      'Chapter 1: Starting the Shadowbroker Tutorial!',
      'Chapter 1: Starting the Shadowbroker Tutorial!',
    ];
    const res = editorialPlanner.deduplicateChapterTitles(input);
    assert.strictEqual(res[0], 'Chapter 1: Starting the Shadowbroker Tutorial!');
    assert.strictEqual(res[1], 'Chapter 1: Starting the Shadowbroker Tutorial! (2)');
    assert.strictEqual(res[2], 'Chapter 1: Starting the Shadowbroker Tutorial! (3)');
    console.log('  ✓ Passed: Three identical titles disambiguated with " (2)" and " (3)"\n');
    passed++;
  }

  // T10: two titles differing only by case → second gets suffix
  console.log('T10: two titles differing only by case → second gets suffix');
  {
    const input = [
      'Chapter 1: Starting the Shadowbroker Tutorial!',
      'chapter 1: starting the shadowbroker tutorial!',
    ];
    const res = editorialPlanner.deduplicateChapterTitles(input);
    assert.strictEqual(res[0], 'Chapter 1: Starting the Shadowbroker Tutorial!');
    assert.strictEqual(res[1], 'chapter 1: starting the shadowbroker tutorial! (2)');
    console.log('  ✓ Passed: Case-insensitive duplicate disambiguated with suffix\n');
    passed++;
  }

  // T11: title already ending in "(2)" → becomes " (3)"
  console.log('T11: title already ending in "(2)" → becomes " (3)"');
  {
    const input = [
      'Chapter 1: Starting the Shadowbroker Tutorial! (2)',
      'Chapter 1: Starting the Shadowbroker Tutorial! (2)',
    ];
    const res = editorialPlanner.deduplicateChapterTitles(input);
    assert.strictEqual(res[0], 'Chapter 1: Starting the Shadowbroker Tutorial! (2)');
    assert.strictEqual(res[1], 'Chapter 1: Starting the Shadowbroker Tutorial! (3)');

    // Also assert increment when existing title matches dynamically generated suffix
    const input2 = [
      'Chapter 1',
      'Chapter 1',
      'Chapter 1 (2)',
    ];
    const res2 = editorialPlanner.deduplicateChapterTitles(input2);
    assert.strictEqual(res2[0], 'Chapter 1');
    assert.strictEqual(res2[1], 'Chapter 1 (2)');
    assert.strictEqual(res2[2], 'Chapter 1 (3)');

    console.log('  ✓ Passed: Title already ending in "(2)" increments to "(3)" without double suffix\n');
    passed++;
  }

  // T12: unique titles → unchanged
  console.log('T12: unique titles → unchanged');
  {
    const input = [
      'Chapter 1: Starting the Shadowbroker Tutorial!',
      'Chapter 2: The Academy of Midgar',
      'Chapter 3: The Goddess\'s Trial',
    ];
    const res = editorialPlanner.deduplicateChapterTitles(input);
    assert.strictEqual(res[0], 'Chapter 1: Starting the Shadowbroker Tutorial!');
    assert.strictEqual(res[1], 'Chapter 2: The Academy of Midgar');
    assert.strictEqual(res[2], 'Chapter 3: The Goddess\'s Trial');

    // Also assert null/empty titles are preserved unchanged
    const emptyInput = [
      { title: '' },
      { title: null },
      { title: 'Chapter 1' },
    ];
    const emptyRes = editorialPlanner.deduplicateChapterTitles(emptyInput);
    assert.strictEqual(emptyRes[0].title, '');
    assert.strictEqual(emptyRes[1].title, null);
    assert.strictEqual(emptyRes[2].title, 'Chapter 1');

    console.log('  ✓ Passed: Unique titles and empty/null titles preserved unchanged\n');
    passed++;
  }

  console.log('================================================================');
  console.log(`✅ ALL ${passed}/${total} F48 + F50 VALIDATION TESTS PASSED`);
  console.log('================================================================');
}

if (require.main === module) {
  runF48F50ValidationTests().catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runF48F50ValidationTests };

