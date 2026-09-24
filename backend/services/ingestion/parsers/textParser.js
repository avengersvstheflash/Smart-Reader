const { CanonicalDocument } = require('../models/canonicalContent');

/**
 * Text Parser for Smart Reader
 * Parses plain text (.txt, pasted notes) into canonical blocks.
 */
class TextParser {
  /**
   * Parses normalized plain text into CanonicalDocument
   * @param {string} text
   * @returns {CanonicalDocument}
   */
  parse(text) {
    const doc = new CanonicalDocument();
    if (!text || text.trim() === '') {
      return doc;
    }

    const rawBlocks = text.split(/\n\s*\n/);

    for (const raw of rawBlocks) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      // Check for ornamental dividers / separators: *** or --- or ___
      if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
        doc.addBlock({ type: 'separator' });
        continue;
      }

      // Check if this block is an obvious standalone heading (short, all caps or Title Case without ending punctuation)
      const lines = trimmed.split('\n');
      if (
        lines.length === 1 &&
        trimmed.length < 80 &&
        /^[A-Z0-9\s:—–-]+$/.test(trimmed) &&
        !/[.?!]$/.test(trimmed)
      ) {
        doc.addBlock({
          type: 'heading',
          level: 2,
          text: trimmed,
        });
        continue;
      }

      // Default to paragraph (joining inner line wraps into a continuous readable paragraph)
      const paragraphText = lines.map((l) => l.trim()).join(' ');
      doc.addBlock({
        type: 'paragraph',
        text: paragraphText,
      });
    }

    return doc;
  }
}

module.exports = new TextParser();
