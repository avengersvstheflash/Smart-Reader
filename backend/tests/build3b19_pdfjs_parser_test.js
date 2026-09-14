/**
 * BUILD 3B.1.9: pdfjs-dist Parser Test Suite
 *
 * Verifies that pdfjsParser uses font-size and coordinate data to cleanly
 * parse the real 226-page CRC Press textbook into 8 distinct chapters,
 * front matter, appendix, and index without line interleaving or giant bloated chapters.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pdfjsParser = require('../services/ingestion/parsers/pdfjsParser');

async function runTest() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 3B.1.9 PDFJS PARSER TEST SUITE');
  console.log('================================================================\n');

  const pdfPath = path.join(__dirname, 'fixtures', 'practical_machine_learning.pdf');
  assert(fs.existsSync(pdfPath), `Binary PDF not found at ${pdfPath}`);

  console.log(`[Source] Reading real binary textbook: ${pdfPath}`);
  const buffer = fs.readFileSync(pdfPath);

  const startTime = Date.now();
  const result = await pdfjsParser.parse(buffer, {
    title: 'Practical Machine Learning: A Beginner’s Guide with Ethical Insights',
    author: 'Ally S. Nyamawe et al.',
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Success] Parsing completed in ${elapsed}s.\n`);

  const { chapters } = result;

  console.log(`Decomposed document into ${chapters.length} structures:`);
  chapters.forEach((c) => {
    console.log(`  - [${(c.structuralRole || 'unknown').toUpperCase()}] "${c.title}" (${c.wordCount} words, ${c.sectionCount || 0} sections, pages ${c.startPage}–${c.endPage})`);
  });

  const bodyChapters = chapters.filter((c) => c.structuralRole === 'chapter');
  const frontMatter = chapters.filter((c) => c.structuralRole === 'front_matter');
  const appendices = chapters.filter((c) => c.structuralRole === 'appendix');
  const indices = chapters.filter((c) => c.structuralRole === 'index');

  console.log('\n----------------------------------------------------------------');
  console.log(`Total structures: ${chapters.length}`);
  console.log(`Body Chapters:    ${bodyChapters.length}`);
  console.log(`Front Matter:     ${frontMatter.length}`);
  console.log(`Appendices:       ${appendices.length}`);
  console.log(`Indices:          ${indices.length}`);
  console.log('----------------------------------------------------------------\n');

  // Check 1: 8 body chapters detected
  console.log('[Check 1] Verifying exactly 8 body chapters...');
  assert.strictEqual(
    bodyChapters.length,
    8,
    `Expected exactly 8 body chapters, found ${bodyChapters.length}!`
  );
  console.log('  ✓ Verified: exactly 8 body chapters detected!');

  // Check 2: Chapter 1 & 2 full titles
  console.log('\n[Check 2] Verifying Chapter 1 & 2 full titles (no interleaved numbers)...');
  const ch1 = bodyChapters.find((c) => c.title.includes('1'));
  const ch2 = bodyChapters.find((c) => c.title.includes('2'));

  assert(ch1, 'Chapter 1 must exist');
  assert(ch2, 'Chapter 2 must exist');

  console.log(`  Found Chapter 1 title: "${ch1.title}"`);
  console.log(`  Found Chapter 2 title: "${ch2.title}"`);

  assert(
    /Fundamentals of machine learning/i.test(ch1.title),
    `Expected Chapter 1 to contain "Fundamentals of machine learning", got "${ch1.title}"`
  );
  assert(
    !/Fundamentals\s+of\s+machine\s+1\s+learning/i.test(ch1.title),
    `Chapter 1 has interleaved "1" in the middle of title: "${ch1.title}"`
  );

  assert(
    /Mathematics for machine learning/i.test(ch2.title),
    `Expected Chapter 2 to contain "Mathematics for machine learning", got "${ch2.title}"`
  );
  assert(
    !/Mathematics\s+for\s+machine\s+2\s+learning/i.test(ch2.title),
    `Chapter 2 has interleaved "2" in the middle of title: "${ch2.title}"`
  );
  console.log('  ✓ Verified: Chapter 1 and Chapter 2 titles are cleanly reconstructed without interleaving!');

  // Check 3: Front matter, appendix, and index presence
  console.log('\n[Check 3] Verifying front matter, appendix, and index...');
  assert(frontMatter.length >= 1, 'Expected at least 1 front matter structural group!');
  assert(appendices.length >= 1, 'Expected at least 1 appendix!');
  assert(indices.length >= 1, 'Expected at least 1 index!');
  console.log('  ✓ Verified: front matter, appendix, and index all detected!');

  // Check 4: No bloated chapter exceeding 20,000 words (Chapter 2 is a 58-page math chapter with ~19.3k words; previously 28.3k words)
  console.log('\n[Check 4] Verifying no bloated chapter exceeding 20,000 words...');
  for (const c of bodyChapters) {
    console.log(`  Chapter "${c.title}": ${c.wordCount} words`);
    assert(
      c.wordCount < 20000,
      `Chapter "${c.title}" is bloated (${c.wordCount} words)! Chapter boundaries collapsed.`
    );
  }
  console.log('  ✓ Verified: all body chapters have reasonable word counts!');

  console.log('\n================================================================');
  console.log('✨ ALL BUILD 3B.1.9 PDFJS PARSER TESTS PASSED!');
  console.log('================================================================');
}

runTest().catch((err) => {
  console.error('\n❌ BUILD 3B.1.9 TEST FAILED:', err);
  process.exit(1);
});
