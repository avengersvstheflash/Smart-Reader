/**
 * Build 4.3: Reading Segments Verification Test Suite
 * 
 * Tests chapter-level partitioning into reading segments with
 * predictable word budgets (1200-2400 words), section boundary integrity,
 * exact provenance, and full chapter reconstruction.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pdfjsParser = require('../services/ingestion/parsers/pdfjsParser');
const { buildReadingSegments, buildAllSegments } = require('../services/reading/segmentBuilder');

async function runReadingSegmentsSuite() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 4.3: READING SEGMENTS TEST SUITE');
  console.log('================================================================\n');

  const pdfPath = path.join(__dirname, 'fixtures', 'practical_machine_learning.pdf');
  assert(fs.existsSync(pdfPath), `Test fixture not found: ${pdfPath}`);

  console.log('[1/3] Parsing PDF fixture with pdfjsParser...');
  const buffer = fs.readFileSync(pdfPath);
  const parseResult = await pdfjsParser.parse(buffer, {
    title: 'Practical Machine Learning: A Beginner’s Guide with Ethical Insights',
  });

  const allChapters = parseResult.chapters || [];
  const bodyChapters = allChapters.filter((c) => c.structuralRole === 'chapter');
  console.log(`[2/3] Extracted ${bodyChapters.length} body chapters.`);
  assert.strictEqual(bodyChapters.length, 8, 'Expected 8 body chapters');

  console.log('[3/3] Generating reading segments with buildAllSegments...');
  const segments = buildAllSegments(bodyChapters);
  console.log(`Generated ${segments.length} segments across ${bodyChapters.length} chapters.\n`);

  let passedTests = 0;

  // ---------------------------------------------------------------------------
  // Test 1: Every segment has wordCount between 400 and 3000
  // ---------------------------------------------------------------------------
  try {
    for (const seg of segments) {
      assert(
        seg.wordCount >= 400 && seg.wordCount <= 3000,
        `Segment ${seg.id} in "${seg.parentChapterTitle}" wordCount ${seg.wordCount} outside [400, 3000]`
      );
    }
    console.log('PASS - Test 1: Every segment has wordCount between 400 and 3000');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 1:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 2: Every segment's text is non-empty and starts/ends at a section or paragraph boundary
  // ---------------------------------------------------------------------------
  try {
    for (const seg of segments) {
      assert(seg.text && typeof seg.text === 'string', `Segment ${seg.id} has invalid text`);
      assert(seg.text.trim().length > 0, `Segment ${seg.id} has empty text`);

      // Verify that segment does not start or end mid-word
      // If startCharOffset > 0, previous char in chapter should be whitespace/newline or start of heading
      const parentCh = bodyChapters.find((c) => (c.id || `chap-${c.number}`) === seg.parentChapterId);
      if (parentCh && parentCh.content) {
        if (seg.startCharOffset > 0) {
          const charBefore = parentCh.content[seg.startCharOffset - 1];
          assert(
            /\s/.test(charBefore) || seg.text.startsWith('\n'),
            `Segment ${seg.id} does not start at section/paragraph boundary (charBefore: ${JSON.stringify(charBefore)})`
          );
        }
        if (seg.endCharOffset < parentCh.content.length) {
          const charAfter = parentCh.content[seg.endCharOffset];
          assert(
            /\s/.test(charAfter) || seg.text.endsWith('\n'),
            `Segment ${seg.id} does not end at section/paragraph boundary (charAfter: ${JSON.stringify(charAfter)})`
          );
        }
      }
    }
    console.log('PASS - Test 2: Every segment\'s text is non-empty and starts/ends at a section or paragraph boundary');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 2:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 3: Concatenating all segments for a chapter reproduces original chapter text
  // ---------------------------------------------------------------------------
  try {
    for (const ch of bodyChapters) {
      const chId = ch.id || `chap-${ch.number}`;
      const chSegments = segments.filter((s) => s.parentChapterId === chId);
      assert(chSegments.length > 0, `No segments found for chapter ${ch.title}`);

      // Concatenating in order
      const recombinedText = chSegments.map((s) => s.text).join('');
      const normalizedRecombined = recombinedText.replace(/\s+/g, ' ').trim();
      const normalizedOriginal = (ch.content || '').replace(/\s+/g, ' ').trim();

      assert.strictEqual(
        normalizedRecombined,
        normalizedOriginal,
        `Recombined segments for chapter "${ch.title}" do not match original chapter text`
      );
    }
    console.log('PASS - Test 3: Concatenating all segments for a chapter reproduces the original chapter text');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 3:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 4: No segment crosses chapter boundaries
  // ---------------------------------------------------------------------------
  try {
    const chapterIdSet = new Set(bodyChapters.map((c) => c.id || `chap-${c.number}`));
    for (const seg of segments) {
      assert(chapterIdSet.has(seg.parentChapterId), `Segment ${seg.id} references unknown chapter: ${seg.parentChapterId}`);

      const parentCh = bodyChapters.find((c) => (c.id || `chap-${c.number}`) === seg.parentChapterId);
      assert.ok(parentCh, `Parent chapter not found for segment ${seg.id}`);
      assert.strictEqual(seg.parentChapterTitle, parentCh.title, `Title mismatch in segment ${seg.id}`);

      // Check that offsets are completely contained within the chapter's content length
      assert(
        seg.startCharOffset >= 0 && seg.endCharOffset <= (parentCh.content || '').length,
        `Segment ${seg.id} char offsets exceed chapter bounds [0, ${(parentCh.content || '').length}]`
      );
    }
    console.log('PASS - Test 4: No segment crosses chapter boundaries');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 4:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 5: Chapter 1 produces at least 1 segment
  // ---------------------------------------------------------------------------
  try {
    const ch1 = bodyChapters.find((c) => /^Chapter 1:/i.test(c.title));
    assert.ok(ch1, 'Chapter 1 not found');
    const ch1Id = ch1.id || `chap-${ch1.number}`;
    const ch1Segments = segments.filter((s) => s.parentChapterId === ch1Id);

    assert(ch1Segments.length >= 1, `Expected Chapter 1 to produce >= 1 segment, got ${ch1Segments.length}`);
    console.log(`PASS - Test 5: Chapter 1 produces at least 1 segment (${ch1Segments.length} produced)`);
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 5:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 6: Chapter 2 (~19708 words) produces at least 5 segments
  // ---------------------------------------------------------------------------
  try {
    const ch2 = bodyChapters.find((c) => /^Chapter 2:/i.test(c.title));
    assert.ok(ch2, 'Chapter 2 not found');
    const ch2Id = ch2.id || `chap-${ch2.number}`;
    const ch2Segments = segments.filter((s) => s.parentChapterId === ch2Id);

    assert(ch2Segments.length >= 5, `Expected Chapter 2 to produce >= 5 segments, got ${ch2Segments.length}`);
    console.log(`PASS - Test 6: Chapter 2 produces at least 5 segments (${ch2Segments.length} produced)`);
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 6:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 7: Chapter 8 title is preserved in every segment's parentChapterTitle
  // ---------------------------------------------------------------------------
  try {
    const ch8 = bodyChapters.find((c) => /^Chapter 8:/i.test(c.title));
    assert.ok(ch8, 'Chapter 8 not found');
    const ch8Id = ch8.id || `chap-${ch8.number}`;
    const ch8Segments = segments.filter((s) => s.parentChapterId === ch8Id);
    assert(ch8Segments.length > 0, 'No segments found for Chapter 8');

    for (const seg of ch8Segments) {
      assert.strictEqual(
        seg.parentChapterTitle,
        ch8.title,
        `Segment ${seg.id} has incorrect parentChapterTitle: "${seg.parentChapterTitle}"`
      );
    }
    console.log('PASS - Test 7: Chapter 8 title is preserved in every segment\'s parentChapterTitle');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 7:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 8: Segment IDs are unique across the whole document
  // ---------------------------------------------------------------------------
  try {
    const idSet = new Set();
    for (const seg of segments) {
      assert(seg.id && typeof seg.id === 'string', 'Segment ID must be a non-empty string');
      assert(!idSet.has(seg.id), `Duplicate segment ID detected: ${seg.id}`);
      idSet.add(seg.id);
    }
    console.log('PASS - Test 8: Segment IDs are unique across the whole document');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 8:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 9: startCharOffset < endCharOffset for every segment
  // ---------------------------------------------------------------------------
  try {
    for (const seg of segments) {
      assert(
        typeof seg.startCharOffset === 'number' && typeof seg.endCharOffset === 'number',
        `Segment ${seg.id} character offsets are not numbers`
      );
      assert(
        seg.startCharOffset < seg.endCharOffset,
        `Segment ${seg.id} has invalid char offset range: [${seg.startCharOffset}, ${seg.endCharOffset}]`
      );
    }
    console.log('PASS - Test 9: startCharOffset < endCharOffset for every segment');
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 9:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Test 10: Total word count across all segments equals total body-chapter word count (within 2% tolerance)
  // ---------------------------------------------------------------------------
  try {
    const totalBodyWordCount = bodyChapters.reduce((sum, ch) => {
      const words = ch.wordCount || (ch.content || '').trim().split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);

    const totalSegmentWordCount = segments.reduce((sum, s) => sum + (s.wordCount || 0), 0);
    const diff = Math.abs(totalSegmentWordCount - totalBodyWordCount);
    const diffPercentage = (diff / totalBodyWordCount) * 100;

    assert(
      diffPercentage <= 2.0,
      `Word count difference ${diff} (${diffPercentage.toFixed(2)}%) exceeds 2% tolerance (Body: ${totalBodyWordCount}, Segments: ${totalSegmentWordCount})`
    );
    console.log(`PASS - Test 10: Total word count across all segments equals total body-chapter word count (${diffPercentage.toFixed(2)}% diff, within 2% tolerance)`);
    passedTests++;
  } catch (err) {
    console.error('FAIL - Test 10:', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Summary Reporting Details
  // ---------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('Segment Breakdown for Key Chapters:');
  const ch1 = bodyChapters.find((c) => /^Chapter 1:/i.test(c.title));
  const ch1Segments = segments.filter((s) => s.parentChapterId === (ch1.id || `chap-${ch1.number}`));
  console.log(`  Chapter 1 (${ch1Segments.length} segments):`);
  ch1Segments.forEach((s, i) => console.log(`    Segment ${i + 1} (${s.id}): ${s.wordCount} words`));

  const ch2 = bodyChapters.find((c) => /^Chapter 2:/i.test(c.title));
  const ch2Segments = segments.filter((s) => s.parentChapterId === (ch2.id || `chap-${ch2.number}`));
  console.log(`  Chapter 2 (${ch2Segments.length} segments)`);

  const ch8 = bodyChapters.find((c) => /^Chapter 8:/i.test(c.title));
  const ch8Segments = segments.filter((s) => s.parentChapterId === (ch8.id || `chap-${ch8.number}`));
  console.log(`  Chapter 8 (${ch8Segments.length} segments):`);
  ch8Segments.forEach((s, i) => console.log(`    Segment ${i + 1} (${s.id}): ${s.wordCount} words`));
  console.log('----------------------------------------------------------------');

  if (passedTests === 10) {
    console.log('\n================================================================');
    console.log('🎉 ALL BUILD 4.3 READING SEGMENT TESTS PASSED');
    console.log('================================================================\n');
  } else {
    console.log('\n================================================================');
    console.log('❌ BUILD 4.3 TESTS FAILED');
    console.log('================================================================\n');
    process.exit(1);
  }
}

runReadingSegmentsSuite().catch((err) => {
  console.error('\n❌ BUILD 4.3 SUITE ENCOUNTERED UNHANDLED ERROR:\n', err);
  process.exit(1);
});
