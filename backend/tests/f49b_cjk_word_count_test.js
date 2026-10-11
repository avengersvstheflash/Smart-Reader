'use strict';

const assert = require('assert');
const { countWords } = require('../utils/wordCount');
const sectionFilter = require('../services/synthesis/sectionFilter');
const config = require('../config');

async function runF49bTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F49b CJK-AWARE WORD COUNT TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 6;

  // --------------------------------------------------------------------------
  // T1: Pure Latin text (space-split count)
  // --------------------------------------------------------------------------
  console.log('T1: Pure Latin text word count');
  {
    const latin = 'The quick brown fox jumps over the lazy dog';
    const words = countWords(latin);
    assert.strictEqual(words, 9, `T1: Expected 9 words, got ${words}`);

    const withExtraWhitespace = '   The   quick\tbrown\nfox  jumps   over\r\nthe lazy dog   ';
    assert.strictEqual(countWords(withExtraWhitespace), 9, 'T1: Extra whitespace must not distort count');

    console.log('  ✓ Passed: Pure Latin text splits accurately on whitespace (9 words)\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2: Pure Japanese (100 chars, no spaces -> ~70 words)
  // --------------------------------------------------------------------------
  console.log('T2: Pure Japanese text (100 chars without spaces)');
  {
    // Exactly 100 Japanese characters (Kanji and Kana)
    const ja100 = '吾輩は猫である名前はまだ無いどこで生れたかとんと見当がつかぬ何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している吾輩はここで始めて人間というものを見たしかもあとで聞くとそれは書生という人間で'.slice(0, 100);
    assert.strictEqual(ja100.length, 100, 'Precondition: ja100 should be exactly 100 chars');

    const words = countWords(ja100);
    const expected = Math.round(100 * 0.7); // 70
    assert.strictEqual(words, expected, `T2: Expected ${expected} words for 100 CJK characters, got ${words}`);

    console.log(`  ✓ Passed: Pure Japanese 100 characters yields ${words} weighted words (expected ${expected})\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3: Mixed Japanese + English (combines both token streams)
  // --------------------------------------------------------------------------
  console.log('T3: Mixed Japanese + English text');
  {
    // "Chapter 1:" (2 space tokens) + "吾輩は猫である。名前はまだ無い。" (16 CJK chars -> Math.round(16 * 0.7) = 11)
    const mixed = 'Chapter 1: 吾輩は猫である。名前はまだ無い。';
    const words = countWords(mixed);
    // 2 English tokens + 11 CJK = 13
    assert.strictEqual(words, 13, `T3: Expected 13 words for mixed string, got ${words}`);

    console.log(`  ✓ Passed: Mixed Japanese + English yields ${words} words (expected 13)\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4: Edge cases: empty, null, undefined, whitespace-only, non-string
  // --------------------------------------------------------------------------
  console.log('T4: Edge cases (empty, null, undefined, non-string)');
  {
    assert.strictEqual(countWords(''), 0, 'T4: empty string must return 0');
    assert.strictEqual(countWords(null), 0, 'T4: null must return 0');
    assert.strictEqual(countWords(undefined), 0, 'T4: undefined must return 0');
    assert.strictEqual(countWords('   \n\t  '), 0, 'T4: whitespace only must return 0');
    assert.strictEqual(countWords(12345), 0, 'T4: non-string must return 0');
    assert.strictEqual(countWords({}), 0, 'T4: object must return 0');

    console.log('  ✓ Passed: All edge cases safely evaluate to 0 words\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5: Real chijinno_ai chunk (~1340 chars) passes MIN_SOURCE_CHUNK_WORDS (75)
  // --------------------------------------------------------------------------
  console.log('T5: Real chijinno_ai chunk (~1340 chars) passes MIN_SOURCE_CHUNK_WORDS');
  {
    const chijinnoChunk = '私はこれから、あまり世間に類例がないだろうと思われる私達夫婦の間柄に就いて、出来るだけ正直に、ざっくばらんに、有りのままの事実を書いて見ようと思います。それは私自身に取って忘れがたない貴い記録であると共に、恐らく読者の皆さんにも、多少の興味を惹く話ではなかろうかと考えます。何しろ世の中には、不思議な夫婦というものがよくあるもので、他人の目から見ると、あんな女のどこがいいんだろうと思えるような悪妻に、死ぬほど惚れ込んでいる男もあれば、反対に、あんな男のどこがいいんだろうと怪しまれるような亭主に、貞淑を尽している女もあります。けれども私達の間柄というものは、単にそんな世間並の「惚れた腫れた」というだけの問題ではありません。私の妻は、世間から見ればいわゆる「悪婦」であり、「妖婦」であり、「魔性の女」であるかも知れませんが、私に取っては世界中で一番美しい、一番尊い、掛け替えのない宝のような存在なのです。私達が初めて知り合ってから今日に至るまでの数年間、私達の生活は常に波乱に富み、苦悩に満ちていましたが、それにも拘らず、私はその生活を少しも後悔していません。もしもう一度生まれ変わって人生をやり直すことが出来たとしても、私は矢張りナオミを選び、ナオミと共に暮す道を選ぶに違いありません。ナオミと私とが初めて会ったのは、大正十二年の春、私がまだ築地の電灯会社に勤めていた頃の事でした。';

    const naiveCount = chijinnoChunk.trim().split(/\s+/).filter(Boolean).length;
    const cjkAwareCount = countWords(chijinnoChunk);

    assert.ok(naiveCount < config.MIN_SOURCE_CHUNK_WORDS, `Precondition: naive count (${naiveCount}) fails MIN_SOURCE_CHUNK_WORDS (75)`);
    assert.ok(cjkAwareCount >= config.MIN_SOURCE_CHUNK_WORDS, `T5: CJK-aware count (${cjkAwareCount}) must pass MIN_SOURCE_CHUNK_WORDS (75)`);
    assert.ok(cjkAwareCount > 400, `T5: Expected >400 words for ~700 CJK characters, got ${cjkAwareCount}`);

    // Verify sectionFilter integration with CJK text
    const filterResult = sectionFilter.filter([
      {
        sectionId: 'test-cjk-sec',
        sectionTitle: '第一章 私達の間柄',
        content: chijinnoChunk,
      },
      {
        sectionId: 'test-short-stub',
        sectionTitle: 'Tiny Latin Stub',
        content: 'Just three words',
      },
    ]);

    assert.strictEqual(filterResult.candidates.length, 1, 'T5: CJK section must be candidate');
    assert.strictEqual(filterResult.candidates[0].sectionId, 'test-cjk-sec', 'T5: CJK section must pass');
    assert.strictEqual(filterResult.filtered.length, 1, 'T5: Tiny Latin stub must be filtered');
    assert.strictEqual(filterResult.filtered[0].reason, 'insufficient_content', 'T5: Tiny stub filtered as insufficient_content');

    console.log(`  ✓ Passed: chijinno_ai chunk (${chijinnoChunk.length} chars) yields ${cjkAwareCount} words (naive was ${naiveCount}), easily passing guard\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T6: Chinese-only and Korean-only text ranges
  // --------------------------------------------------------------------------
  console.log('T6: Chinese-only and Korean-only text ranges');
  {
    // Exactly 100 Han characters (Chinese)
    const zh100 = '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光果珍李柰菜重芥姜海咸河淡鳞潜羽翔龙师火帝鸟官人皇始制文字乃服衣裳推位让国有虞陶唐吊民伐罪周发殷汤坐朝问道'.slice(0, 100);
    assert.strictEqual(zh100.length, 100, 'Precondition: zh100 should be 100 chars');
    const zhWords = countWords(zh100);
    assert.strictEqual(zhWords, 70, `T6: Expected 70 words for 100 Chinese characters, got ${zhWords}`);

    // Exactly 100 Hangul characters (Korean)
    const ko100 = '동해물과백두산이마르고닳도록하느님이보우하사우리나라만세무궁화삼천리화려강산대한사람대한으로길이보전하세남산위에저소나무철갑을두른듯바람서리불변함은우리기상일세가을하늘공활한데높고구름없이밝은달은우리가슴일편단심일세이'.slice(0, 100);
    assert.strictEqual(ko100.length, 100, 'Precondition: ko100 should be 100 chars');
    const koWords = countWords(ko100);
    assert.strictEqual(koWords, 70, `T6: Expected 70 words for 100 Korean characters, got ${koWords}`);

    console.log(`  ✓ Passed: Chinese (70 words) and Korean (70 words) character sets correctly weighted\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log(`📊 F49b TEST SUMMARY: ${passed}/${total} passed`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runF49bTests().catch((err) => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runF49bTests };
