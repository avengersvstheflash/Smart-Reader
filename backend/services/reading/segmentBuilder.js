/**
 * Reading Segment Builder (Build 4.3)
 *
 * IMPORTANT: chapter.sections is a HIERARCHICAL TREE.
 * Sub-sections live inside section.sections, not as siblings.
 * Always flatten depth-first before computing segment boundaries.
 * Example: Chapter 8 has 6 root sections but 27 total flattened.
 *
 * Segment bounds: 1200-2400 words target. Tail segments may be
 * shorter (down to ~400) when a chapter's last section is small.
 */

const TARGET_WORDS_MIN = 1200;
const TARGET_WORDS_MAX = 2400;

/**
 * Counts whitespace-delimited words in a string
 * @param {string} str
 * @returns {number}
 */
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Recursively flattens nested section hierarchies into a depth-first document reading order
 * @param {Array<object>} secs
 * @returns {Array<object>}
 */
function flattenSections(secs) {
  if (!Array.isArray(secs)) return [];
  const flat = [];
  for (const s of secs) {
    flat.push(s);
    if (Array.isArray(s.sections) && s.sections.length > 0) {
      flat.push(...flattenSections(s.sections));
    }
  }
  return flat;
}

/**
 * Splits an oversized block of text along paragraph boundaries (\n\n)
 * into sub-chunks of 1200-2400 words each.
 * @param {string} text
 * @param {number} baseStartOffset
 * @param {number} secIndex
 * @param {string} chId
 * @param {string} chTitle
 * @param {Function} emitSegment
 */
function splitOversizedText(text, baseStartOffset, secIndex, chId, chTitle, emitSegment) {
  // Split on double newlines while preserving delimiter positions
  const parts = text.split(/(\n\n+)/);
  let subStart = baseStartOffset;
  let subText = '';
  let subWords = 0;

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const partWords = countWords(part);

    // If sub-segment already meets minimum target and adding part would exceed max target
    if (subWords >= TARGET_WORDS_MIN && (subWords + partWords > TARGET_WORDS_MAX)) {
      const subEnd = subStart + subText.length;
      emitSegment({
        parentChapterId: chId,
        parentChapterTitle: chTitle,
        startSectionIndex: secIndex,
        endSectionIndex: secIndex,
        startCharOffset: subStart,
        endCharOffset: subEnd,
        wordCount: subWords,
        text: subText,
      });
      subStart = subEnd;
      subText = part;
      subWords = partWords;
    } else {
      subText += part;
      subWords += partWords;
    }
  }

  if (subText.length > 0) {
    const subEnd = baseStartOffset + text.length;
    emitSegment({
      parentChapterId: chId,
      parentChapterTitle: chTitle,
      startSectionIndex: secIndex,
      endSectionIndex: secIndex,
      startCharOffset: subStart,
      endCharOffset: subEnd,
      wordCount: countWords(subText),
      text: subText,
    });
  }
}

/**
 * Builds reading segments for a single chapter
 * @param {object} chapter
 * @returns {Array<object>} Segment[]
 */
function buildReadingSegments(chapter) {
  if (!chapter) return [];

  const text = chapter.content || chapter.text || '';
  if (!text.trim()) return [];

  const parentChapterId = chapter.id || chapter.chapterId || (chapter.number != null ? `chap-${chapter.number}` : 'chap-1');
  const parentChapterTitle = chapter.title || 'Untitled Chapter';
  const totalChapterWords = chapter.wordCount || countWords(text);

  const segments = [];

  const emitSegment = (seg) => {
    seg.id = `seg-${parentChapterId}-${segments.length}`;
    segments.push(seg);
  };

  const rawSections = chapter.sections || [];
  const sections = flattenSections(rawSections);

  // Rule 2: If chapter.wordCount < 1200 -> single segment wrapping whole chapter
  if (totalChapterWords < TARGET_WORDS_MIN || sections.length === 0) {
    if (totalChapterWords > TARGET_WORDS_MAX && sections.length === 0) {
      // Split unstructured large chapter by paragraphs
      splitOversizedText(text, 0, 0, parentChapterId, parentChapterTitle, emitSegment);
      return segments;
    }

    emitSegment({
      parentChapterId,
      parentChapterTitle,
      startSectionIndex: 0,
      endSectionIndex: Math.max(0, sections.length - 1),
      startCharOffset: 0,
      endCharOffset: text.length,
      wordCount: totalChapterWords,
      text,
    });
    return segments;
  }

  // Map each section to its character offset inside chapter text
  const secData = [];
  let lastPos = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const sTitle = (s.title || '').trim();
    let pos = -1;
    if (sTitle) {
      pos = text.indexOf(sTitle, lastPos);
      if (pos === -1) {
        pos = text.indexOf(sTitle);
      }
    }
    if (pos === -1) {
      pos = lastPos;
    }
    secData.push({
      index: i,
      title: s.title || '',
      pos,
      length: sTitle.length,
    });
    lastPos = Math.max(lastPos, pos + sTitle.length);
  }

  // Create contiguous section slices covering the entire chapter text
  const ranges = [];
  for (let i = 0; i < secData.length; i++) {
    // Section 0 includes the chapter title and preamble from offset 0
    const start = (i === 0) ? 0 : secData[i].pos;
    const end = (i + 1 < secData.length) ? secData[i + 1].pos : text.length;
    const sText = text.slice(start, end);
    ranges.push({
      index: i,
      title: secData[i].title,
      startCharOffset: start,
      endCharOffset: end,
      text: sText,
      wordCount: countWords(sText),
    });
  }

  let cur = null;

  const flushCurrent = () => {
    if (cur) {
      const segText = text.slice(cur.startCharOffset, cur.endCharOffset);
      emitSegment({
        parentChapterId,
        parentChapterTitle,
        startSectionIndex: cur.startSectionIndex,
        endSectionIndex: cur.endSectionIndex,
        startCharOffset: cur.startCharOffset,
        endCharOffset: cur.endCharOffset,
        wordCount: countWords(segText),
        text: segText,
      });
      cur = null;
    }
  };

  for (let i = 0; i < ranges.length; i++) {
    const sec = ranges[i];
    const cleanHeading = sec.title.replace(/^\s*(?:\d+\.)*\d+\s*[:.—–-]?\s*/, '').trim();

    // Rule 7: Semantic override: if heading matches /^(Summary|Conclusion|Introduction|Chapter)/i,
    // close current segment BEFORE that section even if under 1200 words.
    const isSemanticBreak = /^(Summary|Conclusion|Introduction|Chapter)/i.test(sec.title) ||
                            /^(Summary|Conclusion|Introduction|Chapter)/i.test(cleanHeading);

    if (isSemanticBreak && cur) {
      flushCurrent();
    }

    // Rule 5: If a single section exceeds 2400 words, split by paragraph boundaries
    if (sec.wordCount > TARGET_WORDS_MAX) {
      flushCurrent();
      splitOversizedText(sec.text, sec.startCharOffset, sec.index, parentChapterId, parentChapterTitle, emitSegment);
      continue;
    }

    // Rule 3: Accumulate until word count >= 1200, closing if adding next pushes past 2400
    if (!cur) {
      cur = {
        startSectionIndex: sec.index,
        endSectionIndex: sec.index,
        startCharOffset: sec.startCharOffset,
        endCharOffset: sec.endCharOffset,
        wordCount: sec.wordCount,
      };
    } else {
      if (cur.wordCount + sec.wordCount > TARGET_WORDS_MAX) {
        flushCurrent();
        cur = {
          startSectionIndex: sec.index,
          endSectionIndex: sec.index,
          startCharOffset: sec.startCharOffset,
          endCharOffset: sec.endCharOffset,
          wordCount: sec.wordCount,
        };
      } else {
        cur.endSectionIndex = sec.index;
        cur.endCharOffset = sec.endCharOffset;
        cur.wordCount += sec.wordCount;
      }
    }
  }

  flushCurrent();

  return segments;
}

/**
 * Builds reading segments across all provided chapters
 * @param {Array<object>} chapters
 * @returns {Array<object>} Segment[]
 */
function buildAllSegments(chapters) {
  if (!Array.isArray(chapters)) return [];
  const allSegments = [];
  for (const chapter of chapters) {
    const segs = buildReadingSegments(chapter);
    allSegments.push(...segs);
  }
  return allSegments;
}

module.exports = {
  buildReadingSegments,
  buildAllSegments,
  TARGET_WORDS_MIN,
  TARGET_WORDS_MAX,
};
