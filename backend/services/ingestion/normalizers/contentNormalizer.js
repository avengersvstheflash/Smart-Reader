/**
 * Content Normalizer for Smart Reader
 * Cleans incoming raw text, standardizes newlines, strips non-printable control characters,
 * and collapses excessive blank lines while preserving meaningful document layout.
 */

class ContentNormalizer {
  /**
   * Normalizes raw text into clean, consistent text
   * @param {string} rawText
   * @returns {string} normalized text
   */
  normalize(rawText) {
    if (typeof rawText !== 'string') {
      return '';
    }

    let text = rawText;

    // 1. Standardize line endings to LF (\n)
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Remove UTF-8 Byte Order Mark (BOM) if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    // 3. Normalize non-breaking spaces and zero-width spaces
    text = text.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
    text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // 4. Strip non-printable ASCII control characters (keeping \t = 9 and \n = 10)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 5. Trim trailing whitespace on each line
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n');

    // 6. Collapse runs of 3 or more newlines into double newlines (standard paragraph breaks)
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }
}

module.exports = new ContentNormalizer();
