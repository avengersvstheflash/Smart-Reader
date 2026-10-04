/**
 * backend/services/ingestion/legacyFontNormalizer.js
 *
 * Normalizes legacy font-encoding Private Use Area glyphs to standard
 * Unicode. PDFs produced by MathType, older LaTeX pipelines, and MS Word
 * equations emit glyph indices in the PUA range that pdfjs extracts
 * faithfully but browsers cannot render (visible as tofu boxes).
 *
 * Confirmed empirically on practical_machine_learning.pdf (matrix chapter,
 * pages 34-38, font g_d0_f24): 942 items in F8EB-F8F8, all matched
 * open/close pairs — signature of the Adobe/Mac Symbol legacy encoding.
 *
 * Pure function. No side effects beyond a one-time log per unmapped PUA.
 */

'use strict';

// Confirmed mappings. Only add codepoints here when we have empirical
// evidence (matched pairs, contextual samples, or documented encoding).
const LEGACY_PUA_MAP = {
  '\uF8EB': '(',
  '\uF8EC': '[',
  '\uF8ED': '{',
  '\uF8F6': ')',
  '\uF8F7': ']',
  '\uF8F8': '}',
};

// Honest placeholder for unmapped PUA. Design doc Option D: rather than
// guess a glyph, show the reader that notation could not be rendered.
const UNMAPPED_PLACEHOLDER = '\u27E8?\u27E9'; // < ?>

function isLegacyPua(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0xE000 && cp <= 0xF8FF;
}

const seenUnmapped = new Set();
function logUnmappedPua(ch) {
  const cp = ch.codePointAt(0);
  const key = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  if (!seenUnmapped.has(key)) {
    seenUnmapped.add(key);
    console.warn(
      `[LegacyFont] Unmapped PUA glyph ${key} — rendered as placeholder. Add to LEGACY_PUA_MAP when confirmed.`
    );
  }
}

function normalizeLegacyGlyphs(text) {
  if (!text || typeof text !== 'string') return text;
  let result = '';
  let changed = false;
  for (const ch of text) {
    const mapped = LEGACY_PUA_MAP[ch];
    if (mapped !== undefined) {
      result += mapped;
      changed = true;
    } else if (isLegacyPua(ch)) {
      result += UNMAPPED_PLACEHOLDER;
      changed = true;
      logUnmappedPua(ch);
    } else {
      result += ch;
    }
  }
  return changed ? result : text;
}

module.exports = {
  normalizeLegacyGlyphs,
  LEGACY_PUA_MAP,
  UNMAPPED_PLACEHOLDER,
  isLegacyPua,
};
