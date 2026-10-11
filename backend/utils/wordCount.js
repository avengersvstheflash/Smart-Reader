'use strict';

/**
 * Word count that works for Latin AND CJK scripts.
 * For Latin: split on whitespace.
 * For CJK: count characters in Han/Hiragana/Katakana/Hangul ranges,
 *   weighted at ~0.7 to approximate sub-word units.
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const cjkMatches = trimmed.match(
    /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g
  );
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  const nonCjk = trimmed
    .replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g, ' ')
    .trim();
  const spaceTokens = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;

  return spaceTokens + Math.round(cjkCount * 0.7);
}

module.exports = { countWords };

