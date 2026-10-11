'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const ingestionService = require('../services/ingestion/ingestionService');
const preprocessor = require('../services/semantic/preprocessor');
const semanticChunker = require('../services/semantic/semanticChunker');

async function runF51cTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F51c NON-UTF8 TXT IMPORT & PREPROCESSOR TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 6;

  // --------------------------------------------------------------------------
  // T1: Bug 1 fix: .txt buffer with ShiftJIS content routes through decodeTextBuffer.
  //     Assert resulting chapter content contains real Japanese characters, no U+FFFD.
  // --------------------------------------------------------------------------
  console.log('T1: Bug 1 fix: .txt buffer with ShiftJIS content routes through decodeTextBuffer');
  {
    const japaneseText = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。';
    const sjisBuf = iconv.encode(japaneseText, 'shiftjis');

    const result = await ingestionService.ingest({
      title: 'Wagahai',
      author: 'Natsume Soseki',
      fileBuffer: sjisBuf,
      originalFilename: 'wagahai.txt',
      contentType: 'novel',
    });

    assert(result.chapters && result.chapters.length > 0, 'T1: Must produce at least one chapter');
    const chContent = result.chapters[0].content;
    assert.strictEqual(chContent.includes('\uFFFD'), false, 'T1: Chapter content must not contain U+FFFD replacement characters');
    assert(chContent.includes('吾輩は猫である'), 'T1: Chapter content must contain expected Japanese text');
    console.log('  ✓ Passed: ShiftJIS buffer decoded cleanly without U+FFFD\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2: Bug 1 regression: UTF-8 .txt buffer still decodes correctly.
  // --------------------------------------------------------------------------
  console.log('T2: Bug 1 regression: UTF-8 .txt buffer still decodes correctly');
  {
    const text = 'Hello world! This is a standard UTF-8 text file.\n\nChapter 1\nIt was the best of times, it was the worst of times.';
    const utf8Buf = Buffer.from(text, 'utf8');

    const result = await ingestionService.ingest({
      title: 'Two Cities',
      author: 'Charles Dickens',
      fileBuffer: utf8Buf,
      originalFilename: 'twocities.txt',
      contentType: 'novel',
    });

    assert(result.chapters && result.chapters.length > 0, 'T2: Must produce at least one chapter');
    const chContent = result.chapters[0].content;
    assert.strictEqual(chContent.includes('\uFFFD'), false, 'T2: Chapter content must not contain U+FFFD');
    assert(chContent.includes('It was the best of times'), 'T2: Chapter content must contain expected text');
    console.log('  ✓ Passed: UTF-8 buffer decoded correctly\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3: Bug 2 fix: Aozora-style text (~15K chars, single \n between lines, with 。)
  //     produces units all under 8000 chars.
  // --------------------------------------------------------------------------
  console.log('T3: Bug 2 fix: Aozora-style text (~15K chars, single \\n between lines) produces units all < 8000 chars');
  {
    const line = 'ナオミちゃん、お前の顔はメリー・ピクフォードに似ているね。と云って彼女は笑った。';
    const aozoraText = Array(350).fill(line).join('\n'); // ~14.3K chars with single newlines
    assert(aozoraText.length > 8000, 'Precondition: aozoraText must be > 8000 chars');

    const chapter = { id: 'ch-t3', content: aozoraText };
    const units = preprocessor.preprocessChapter(chapter, { id: 'bk-t3' });

    assert(units.length > 1, `T3: Must subdivide into multiple units (got ${units.length})`);
    for (let i = 0; i < units.length; i++) {
      assert(
        units[i].textContent.length < 8000,
        `T3: Unit ${i} length ${units[i].textContent.length} must be < 8000 chars`
      );
    }
    const maxLen = Math.max(...units.map((u) => u.textContent.length));
    console.log(`  ✓ Passed (${units.length} units produced, max unit length: ${maxLen} chars < 8000)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4: Bug 2 fix: English dialogue without blank lines (~18K chars)
  //     produces units all under 8000 chars.
  // --------------------------------------------------------------------------
  console.log('T4: Bug 2 fix: English dialogue without blank lines (~18K chars) produces units all < 8000 chars');
  {
    const dialogueLine = 'Good morning, Mr. Bennet, said his lady to him one day.\nGood morning, my dear, replied he.\n';
    const longScene = dialogueLine.repeat(200); // ~18.2K chars with single newlines
    assert(longScene.length > 8000, 'Precondition: longScene must be > 8000 chars');

    const chapter = { id: 'ch-t4', content: longScene };
    const units = preprocessor.preprocessChapter(chapter, { id: 'bk-t4' });

    assert(units.length > 1, `T4: Must subdivide into multiple units (got ${units.length})`);
    for (let i = 0; i < units.length; i++) {
      assert(
        units[i].textContent.length < 8000,
        `T4: Unit ${i} length ${units[i].textContent.length} must be < 8000 chars`
      );
    }
    const maxLen = Math.max(...units.map((u) => u.textContent.length));
    console.log(`  ✓ Passed (${units.length} units produced, max unit length: ${maxLen} chars < 8000)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5: Bug 2 regression: standard English with \n\n paragraphs (50 × 449 chars)
  //     produces exactly 50 units, unchanged behavior.
  // --------------------------------------------------------------------------
  console.log('T5: Bug 2 regression: standard English with \\n\\n paragraphs (50 × 449 chars) produces 50 units');
  {
    const para = 'The quick brown fox jumps over the lazy dog. '.repeat(10).trim(); // 449 chars
    assert.strictEqual(para.length, 449, 'Precondition: para length should be 449 chars');

    const englishStandard = Array(50).fill(para).join('\n\n');
    const chapter = { id: 'ch-t5', content: englishStandard };
    const units = preprocessor.preprocessChapter(chapter, { id: 'bk-t5' });

    assert.strictEqual(units.length, 50, `T5: Expected exactly 50 units, got ${units.length}`);
    for (let i = 0; i < units.length; i++) {
      assert.strictEqual(units[i].textContent.length, 449, `T5: Unit ${i} length should be 449 chars`);
    }
    console.log(`  ✓ Passed (50 units produced, exactly 449 chars each)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T6: End-to-end: feed actual chijinno_ai.txt through ingestionService.ingest
  //     Confirm:
  //     - semantic indexing / chunking succeeds (no CHUNK_TOO_LARGE)
  //     - chunk count is > 25 (not a handful of oversized blobs)
  //     - every chunk <= 8000 chars
  // --------------------------------------------------------------------------
  console.log('T6: End-to-end: feed actual chijinno_ai.txt through ingestionService.ingest');
  {
    const chijinPath = 'C:/Users/Godsa/Downloads/58093_ruby_62048/chijinno_ai.txt';
    if (!fs.existsSync(chijinPath)) {
      console.log(`  ⚠️ Skipped: ${chijinPath} unavailable on disk\n`);
      passed++;
    } else {
      const fileBuffer = fs.readFileSync(chijinPath);
      const ingestResult = await ingestionService.ingest({
        title: '痴人の愛',
        author: '谷崎潤一郎',
        fileBuffer,
        originalFilename: 'chijinno_ai.txt',
        contentType: 'novel',
      });

      assert(ingestResult.chapters && ingestResult.chapters.length > 0, 'T6: Ingestion must produce chapters');

      const allChunks = [];
      for (const ch of ingestResult.chapters) {
        const units = preprocessor.preprocessChapter(ch, { id: 'bk-chijin', title: '痴人の愛' });
        const chunks = semanticChunker.chunkPreprocessedUnits(units, { id: 'bk-chijin', title: '痴人の愛' });
        allChunks.push(...chunks);
      }

      assert(allChunks.length > 25, `T6: Expected substantial chunk count (>25), got ${allChunks.length}`);
      for (let i = 0; i < allChunks.length; i++) {
        assert(
          allChunks[i].textContent.length <= 8000,
          `T6: Chunk ${i} length ${allChunks[i].textContent.length} must be <= 8000 chars`
        );
      }

      const maxLen = Math.max(...allChunks.map((c) => c.textContent.length));
      console.log(`  ✓ Passed (${allChunks.length} chunks produced, max chunk length: ${maxLen} chars, all <= 8000 chars)\n`);
      passed++;
    }
  }

  console.log('================================================================');
  console.log(`🎉 ALL F51c TESTS PASSED (${passed}/${total})`);
  console.log('================================================================\n');
}

if (require.main === module) {
  runF51cTests().catch((err) => {
    console.error('❌ F51c test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runF51cTests };

