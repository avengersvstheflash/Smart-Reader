'use strict';

const assert = require('assert');
const { countWords } = require('../utils/wordCount');
const editorialPlanner = require('../services/synthesis/editorialPlanner');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');

async function runF51h1Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F51h.1 CJK EDITORIAL PLANNER & SERVICE TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 5;

  // --------------------------------------------------------------------------
  // T1 — English regression: naive whitespace count == countWords
  // --------------------------------------------------------------------------
  console.log('T1 — English regression: naive whitespace count == countWords');
  {
    const englishText = 'Hello world. '.repeat(500);
    const naiveCount = englishText.trim().split(/\s+/).filter(Boolean).length;
    const cjkAwareCount = countWords(englishText);

    assert.strictEqual(naiveCount, 1000, `Precondition: naive count should be 1000, got ${naiveCount}`);
    assert.strictEqual(cjkAwareCount, naiveCount, `T1: countWords (${cjkAwareCount}) must equal naive whitespace count (${naiveCount}) for Latin text`);

    console.log(`  ✓ Passed: English 1000-word text yields identical count (${cjkAwareCount} == ${naiveCount})\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2 — Japanese: 1000 CJK characters with no spaces returns countWords ≈ 700 (not 1)
  // --------------------------------------------------------------------------
  console.log('T2 — Japanese: 1000 CJK characters without spaces returns ~700 (not 1)');
  {
    const sampleJa = '吾輩は猫である名前はまだ無いどこで生れたかとんと見当がつかぬ何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している';
    const cjk1000 = sampleJa.repeat(Math.ceil(1000 / sampleJa.length)).slice(0, 1000);
    assert.strictEqual(cjk1000.length, 1000, 'Precondition: cjk1000 should be 1000 chars');

    const naiveCount = cjk1000.trim().split(/\s+/).filter(Boolean).length;
    const cjkAwareCount = countWords(cjk1000);

    assert.strictEqual(naiveCount, 1, `Precondition: naive count for unspaced CJK should be 1, got ${naiveCount}`);
    assert.strictEqual(cjkAwareCount, 700, `T2: Expected countWords ≈ 700 (got ${cjkAwareCount})`);

    console.log(`  ✓ Passed: 1000 CJK chars without spaces yields ${cjkAwareCount} words (naive was ${naiveCount})\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3 — Threshold guard: W from 100 CJK sections with 500 chars each exceeds 3000
  // --------------------------------------------------------------------------
  console.log('T3 — Threshold guard: W computed from 100 CJK sections (500 chars each) exceeds 3000');
  {
    const sampleJa = '夏目漱石の文学作品を読み進めるにつれて近代日本の知識人が直面した自我と社会の葛藤が鮮明に浮かび上がる';
    const cjk500 = sampleJa.repeat(Math.ceil(500 / sampleJa.length)).slice(0, 500);

    const sections = [];
    for (let i = 0; i < 100; i++) {
      sections.push({
        id: `cjk-sec-${i}`,
        sectionId: `cjk-sec-${i}`,
        title: `節 ${i + 1}`,
        content: cjk500,
      });
    }

    const wordsPerSection = countWords(cjk500);
    const totalW = sections.reduce((sum, s) => sum + countWords(s.content), 0);

    assert.strictEqual(wordsPerSection, 350, `Each 500-char section should be 350 words, got ${wordsPerSection}`);
    assert.strictEqual(totalW, 35000, `Total W should be 35,000 words, got ${totalW}`);
    assert.ok(totalW > 3000, `T3: Total words (${totalW}) must exceed the 3000-word thin-content threshold`);

    const units = editorialPlanner.sliceIntoSourceUnitsFallback(sections);
    assert.ok(units.length > 1, `T3: Slicing must produce multiple units (got ${units.length}), not collapse to 1`);
    assert.ok(units.length >= 15 && units.length <= 20, `T3: 35,000 words / 2000 target should yield ~17-18 units, got ${units.length}`);

    console.log(`  ✓ Passed: 100 CJK sections produce W = ${totalW} > 3000, yielding ${units.length} units (not collapsed to 1)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4 — Unit slicing: given sections totalling ~140K CJK-weighted words, produces >10 units
  // --------------------------------------------------------------------------
  console.log('T4 — Unit slicing: ~140K CJK-weighted words produces >10 units (target ~70 units)');
  {
    const sampleJa = '人間関係の複雑さと近代都市生活の孤独を描いた谷崎潤一郎の小説痴人の愛は西洋化への憧憬と退廃的な心理描写が織りなす近代文学の傑作である。';
    const cjkChunkText = sampleJa.repeat(15); // ~1080 CJK chars -> ~756 words
    const chunkWords = countWords(cjkChunkText);

    // Create 185 sections of ~756 words each -> ~140,000 total words
    const sectionCount = Math.round(140000 / chunkWords);
    const sections = [];
    for (let i = 0; i < sectionCount; i++) {
      sections.push({
        id: `synth-sec-${i}`,
        sectionId: `synth-sec-${i}`,
        sectionTitle: `Section ${i + 1}`,
        content: cjkChunkText,
        wordCount: chunkWords,
      });
    }

    const totalWords = sections.reduce((sum, s) => sum + s.wordCount, 0);
    const units = editorialPlanner.sliceIntoSourceUnitsFallback(sections);

    assert.ok(units.length > 10, `T4: Expected > 10 units for ~140K words, got ${units.length}`);
    assert.ok(units.length >= 50 && units.length <= 80, `T4: Expected ~60-75 units for ~140K words / 2000, got ${units.length}`);

    console.log(`  ✓ Passed: ${sections.length} sections (${totalWords} CJK words) sliced into ${units.length} units (>10, target ~70)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5 — Live reproduction: load chijinno_ai chunks from DB, verify >10 units produced
  // --------------------------------------------------------------------------
  console.log('T5 — Live reproduction: load chijinno_ai chunks from DB and verify >10 units produced');
  {
    const bookId = 'book-1791753310349-0kk8g';
    const chunks = semanticChunkRepository.getByBookId(bookId);

    assert.ok(chunks && chunks.length > 0, `Precondition: chunks for ${bookId} must exist in DB`);

    const candidateSections = [];
    for (const c of chunks) {
      const role = (c.structuralRole || c.structural_role || '').toLowerCase();
      if (role && (role === 'front_matter' || role === 'back_matter' || role === 'index' || role === 'appendix')) {
        continue;
      }
      const text = c.textContent || '';
      candidateSections.push({
        sectionId: c.id,
        id: c.id,
        sectionTitle: c.sectionHeading || c.sourceReference || 'Section',
        content: text,
        wordCount: countWords(text),
      });
    }

    assert.strictEqual(candidateSections.length, 166, `Expected 166 candidate body sections, got ${candidateSections.length}`);

    const units = editorialPlanner.sliceIntoSourceUnitsFallback(candidateSections);

    assert.ok(units.length > 10, `T5: chijinno_ai chunks must produce > 10 units, got ${units.length}`);
    assert.ok(units.length >= 60 && units.length <= 80, `T5: Expected ~60-80 units, got ${units.length}`);

    console.log(`  ✓ Passed: chijinno_ai (${candidateSections.length} chunks) produced ${units.length} units (was collapsed to 1 before fix)\n`);
    passed++;
  }

  console.log('================================================================');
  console.log(`🎉 ALL F51h.1 TESTS PASSED (${passed}/${total})`);
  console.log('================================================================\n');
}

if (require.main === module) {
  runF51h1Tests().catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
}

module.exports = { runF51h1Tests };

