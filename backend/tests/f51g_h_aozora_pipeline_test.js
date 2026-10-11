'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const semanticChunker = require('../services/semantic/semanticChunker');
const documentStructureEngine = require('../services/structure/documentStructureEngine');
const textParser = require('../services/ingestion/parsers/textParser');

console.log('Running F51g + F51h Aozora Pipeline Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ============================================================
// F51g — Sentence splitting tests (T1 - T7)
// ============================================================

runTest('T1: English "Hello. World." -> 2 sentences', () => {
  const input = 'Hello. World.';
  const splits = semanticChunker.splitBySentences(input, 1);
  assert.strictEqual(splits.length, 2, `Expected 2 sentences, got ${splits.length}`);
  assert.strictEqual(splits[0], 'Hello.');
  assert.strictEqual(splits[1], 'World.');
});

runTest('T2: English "Wait! He said." -> 2 sentences', () => {
  const input = 'Wait! He said.';
  const splits = semanticChunker.splitBySentences(input, 1);
  assert.strictEqual(splits.length, 2, `Expected 2 sentences, got ${splits.length}`);
  assert.strictEqual(splits[0], 'Wait!');
  assert.strictEqual(splits[1], 'He said.');
});

runTest('T3: 「No!」と叫んだ。 -> 2 sentences, no chars dropped', () => {
  const input = '「No!」と叫んだ。';
  // With maxTokensPerGroup = 1, should split at terminal boundary
  const splits = semanticChunker.splitBySentences(input, 1);
  assert.strictEqual(splits.length, 2, `Expected 2 sentences, got ${splits.length}: ${JSON.stringify(splits)}`);
  assert.strictEqual(splits[0], '「No!」');
  assert.strictEqual(splits[1], 'と叫んだ。');

  // Verify no characters dropped when joined
  const joined = splits.join('');
  assert.strictEqual(joined, input, `Expected joined '${input}', got '${joined}'`);
});

runTest('T4: “Walk with me!”と言った。 -> 2 sentences, no chars dropped', () => {
  const input = '“Walk with me!”と言った。';
  const splits = semanticChunker.splitBySentences(input, 1);
  assert.strictEqual(splits.length, 2, `Expected 2 sentences, got ${splits.length}: ${JSON.stringify(splits)}`);
  assert.strictEqual(splits[0], '“Walk with me!”');
  assert.strictEqual(splits[1], 'と言った。');

  const joined = splits.join('');
  assert.strictEqual(joined, input, `Expected joined '${input}', got '${joined}'`);
});

runTest('T5: A dance $3.00 cost. -> 2 sentences when followed by another sentence, don\'t split at 3.', () => {
  const input = 'A dance $3.00 cost. Next sentence.';
  const splits = semanticChunker.splitBySentences(input, 1);
  assert.strictEqual(splits.length, 2, `Expected 2 sentences, got ${splits.length}: ${JSON.stringify(splits)}`);
  assert.strictEqual(splits[0], 'A dance $3.00 cost.');
  assert.strictEqual(splits[1], 'Next sentence.');

  // Single sentence input containing $3.00
  const single = 'A dance $3.00 cost.';
  const singleSplits = semanticChunker.splitBySentences(single, 100);
  assert.strictEqual(singleSplits.length, 1);
  assert.strictEqual(singleSplits[0], single);
});

runTest('T6: The exact 5 dropped fragments from chijinno_ai -> all preserved', () => {
  const fragments = [
    '夫人は一人でも足を間違えた者があると、忽《たちま》ち 「No!」と、鋭く叱《しっ》して、傍へやって来て歩いて見せる。',
    '覚えが悪くて余りたびたび間違えると、 「No good!」と叫びながら、鞭でぴしりッと床を叩《たた》いたり、男女の容赦なく足を踏みつけたりする。',
    'ちょうど私の頭とすれすれに、彼女の露《あら》わな胸がありました。夫人が始めて、 ［＃横組み］“Walk with me!”［＃横組み終わり］と云いつつ、私の背中へ腕を廻してワン・ステップの姿勢を取りました。',
    '食堂の椅子《いす》を取り払ったダンス・ホールの入口に、［＃横組み］“Special Dance――Admission: Ladies Free, Gentlemen \\3.00”［＃横組み終わり］と記した貼紙《はりがみ》があり、ボーイが切符を売っていました。',
    '「譲治さんはあたしとばかり踊りたがるからいけないんだわ。―――さあ、フォックス・トロットが始まったから行ってらっしゃい、ダンスは他流試合がいいのよ」［＃横組み］“Will you dance with me?”［＃横組み終わり］その時そう云う声が聞えて、',
  ];

  fragments.forEach((frag, idx) => {
    // When split with high limit (1 group)
    const singleGroup = semanticChunker.splitBySentences(frag, 10000);
    assert.strictEqual(singleGroup.length, 1);
    // Compare non-whitespace characters to confirm 100% preservation
    const origNoWs = frag.replace(/\s+/g, '');
    const outNoWs = singleGroup[0].replace(/\s+/g, '');
    assert.strictEqual(outNoWs, origNoWs, `Fragment ${idx + 1} dropped content! Diff: ${origNoWs.length - outNoWs.length}`);

    // When split with low limit (sentence-by-sentence)
    const parts = semanticChunker.splitBySentences(frag, 1);
    if (idx !== 3) {
      assert(parts.length >= 2, `Fragment ${idx + 1} should split into multiple sentences, got ${parts.length}`);
    } else {
      assert(parts.length >= 1, `Fragment ${idx + 1} should produce sentences, got ${parts.length}`);
    }
    const partsNoWs = parts.map(p => p.replace(/\s+/g, '')).join('');
    assert.strictEqual(partsNoWs, origNoWs, `Fragment ${idx + 1} lost chars in fine-grained split!`);
  });
});

runTest('T7: Sum-of-parts assertion for full chijinno_ai sentence split', () => {
  const filePath = 'C:\\Users\\Godsa\\Downloads\\58093_ruby_62048\\chijinno_ai.txt';
  if (!fs.existsSync(filePath)) {
    console.log('    (Skipping chijinno_ai file check: file not present at path)');
    return;
  }
  const buf = fs.readFileSync(filePath);
  const text = textParser.decodeTextBuffer(buf).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Test across all canonical blocks exceeding hardMaxTokens (where splitBySentences is called)
  const parsed = textParser.parse(text);
  let totalInputChars = 0;
  let totalOutputChars = 0;

  parsed.blocks.forEach((b) => {
    const tokens = semanticChunker.estimateTokens(b.text);
    if (tokens > semanticChunker.hardMaxTokens) {
      const splits = semanticChunker.splitBySentences(b.text, semanticChunker.targetMaxTokens);
      const inNoWs = b.text.replace(/\s+/g, '');
      const outNoWs = splits.map(s => s.replace(/\s+/g, '')).join('');
      totalInputChars += inNoWs.length;
      totalOutputChars += outNoWs.length;
      assert.strictEqual(
        outNoWs,
        inNoWs,
        `Block ${b.id} dropped characters in splitBySentences! in=${inNoWs.length}, out=${outNoWs.length}`
      );
    }
  });

  assert.strictEqual(
    totalOutputChars,
    totalInputChars,
    `Total non-whitespace chars mismatch: in=${totalInputChars}, out=${totalOutputChars}`
  );
});

// ============================================================
// F51h — Aozora Section Marker Detection tests
// ============================================================

runTest('F51h.1: Detects ［＃「一」は中見出し］ as heading and extracts "一" as display title', () => {
  const line = '［＃５字下げ］一［＃「一」は中見出し］';
  const hMatch = documentStructureEngine.detectHeadingLine(line);
  assert(hMatch, 'Expected detectHeadingLine to match Aozora mid heading');
  assert.strictEqual(hMatch.displayTitle, '一');
  assert.strictEqual(hMatch.text, line);
});

runTest('F51h.2: Detects sub-heading (小見出し) and large heading (大見出し) variants', () => {
  const subLine = '［＃「第二節」は小見出し］';
  const subMatch = documentStructureEngine.detectHeadingLine(subLine);
  assert(subMatch, 'Expected detectHeadingLine to match 小見出し');
  assert.strictEqual(subMatch.displayTitle, '第二節');

  const bigLine = '［＃「第一部」は大見出し］';
  const bigMatch = documentStructureEngine.detectHeadingLine(bigLine);
  assert(bigMatch, 'Expected detectHeadingLine to match 大見出し');
  assert.strictEqual(bigMatch.displayTitle, '第一部');
});

runTest('F51h.3: Detects rare Aozora numeral marker ［＃一］ and Japanese 第N章', () => {
  const numLine = '［＃三］';
  const numMatch = documentStructureEngine.detectHeadingLine(numLine);
  assert(numMatch, 'Expected detectHeadingLine to match ［＃三］');
  assert.strictEqual(numMatch.displayTitle, '三');

  const daiLine = '第一章 出会い';
  const daiMatch = documentStructureEngine.detectHeadingLine(daiLine);
  assert(daiMatch, 'Expected detectHeadingLine to match 第一章');
  assert.strictEqual(daiMatch.displayTitle, daiLine);
});

runTest('F51h.4: textParser preserves ［＃...］ markers verbatim while setting type="heading"', () => {
  const content = '前置きのテキスト。\n\n［＃５字下げ］一［＃「一」は中見出し］\n\n本文の段落。';
  const parsed = textParser.parse(content);
  assert.strictEqual(parsed.blocks.length, 3);
  const headingBlock = parsed.blocks[1];
  assert.strictEqual(headingBlock.type, 'heading');
  assert.strictEqual(headingBlock.text, '［＃５字下げ］一［＃「一」は中見出し］');
});

runTest('F51h.5: documentStructureEngine generates multiple chapters on Aozora content', () => {
  const aozoraDoc = [
    'タイトル 著者名',
    '【記号についての説明】',
    '［＃５字下げ］一［＃「一」は中見出し］',
    '第一章の本文。これはテストです。',
    '［＃５字下げ］二［＃「二」は中見出し］',
    '第二章の本文。続いています。',
    '［＃５字下げ］三［＃「三」は中見出し］',
    '第三章の本文。完結します。',
  ].join('\n\n');

  const tree = documentStructureEngine.buildStructureTree({
    format: 'text',
    rawText: aozoraDoc,
  });

  assert(tree.chapterCount >= 3, `Expected at least 3 chapters, got ${tree.chapterCount}`);
  assert.strictEqual(tree.chapters[1].title, '一');
  assert.strictEqual(tree.chapters[2].title, '二');
  assert.strictEqual(tree.chapters[3].title, '三');
});

runTest('F51h.6: Live chijinno_ai.txt produces ~28 novel chapters with dense chunk coverage', () => {
  const filePath = 'C:\\Users\\Godsa\\Downloads\\58093_ruby_62048\\chijinno_ai.txt';
  if (!fs.existsSync(filePath)) {
    console.log('    (Skipping chijinno_ai file check: file not present at path)');
    return;
  }
  const buf = fs.readFileSync(filePath);
  const text = textParser.decodeTextBuffer(buf);

  const tree = documentStructureEngine.buildStructureTree({
    format: 'text',
    rawText: text,
  });

  // Expected: 29 chapters (1 front matter + 28 novel chapters 一 through 二十八)
  assert.strictEqual(tree.chapterCount, 29, `Expected 29 chapters, got ${tree.chapterCount}`);
  assert.strictEqual(tree.chapters[0].structuralRole, 'front_matter');
  assert.strictEqual(tree.chapters[1].title, '一');
  assert.strictEqual(tree.chapters[28].title, '二十八');

  // Verify all chapters chunk cleanly without exceeding 8000 chars
  let totalChunks = 0;
  for (const ch of tree.chapters) {
    const units = ch.canonicalBlocks.map((b, idx) => ({
      bookId: 'test-book',
      chapterId: ch.id,
      sequence: idx,
      sectionHeading: ch.title,
      contentType: b.type,
      textContent: b.text,
      canonicalBlock: b,
      structuralRole: ch.structuralRole,
      tokenCount: semanticChunker.estimateTokens(b.text),
    }));
    const chunks = semanticChunker.chunkPreprocessedUnits(units);
    totalChunks += chunks.length;
    chunks.forEach(c => {
      assert(c.textContent.length <= 8000, `Chunk ${c.id} exceeded 8000 chars: ${c.textContent.length}`);
    });
  }

  assert.strictEqual(totalChunks, 167, `Expected 167 total chunks, got ${totalChunks}`);
});

console.log(`\nF51g + F51h Test Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
