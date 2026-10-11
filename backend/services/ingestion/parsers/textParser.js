'use strict';

const iconv = require('iconv-lite');
const { CanonicalDocument } = require('../models/canonicalContent');

/**
 * Checks whether the first 500 bytes contain ShiftJIS lead bytes
 * (0x81-0x9F or 0xE0-0xEF) followed by a valid trail byte (0x40-0x7E or 0x80-0xFC).
 */
function hasShiftJisLeadBytes(buffer) {
  const limit = Math.min(buffer.length, 500);
  for (let i = 0; i < limit; i++) {
    const b = buffer[i];
    if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef)) {
      if (i + 1 < buffer.length) {
        const next = buffer[i + 1];
        if ((next >= 0x40 && next <= 0x7e) || (next >= 0x80 && next <= 0xfc)) {
          return true;
        }
      } else {
        return true;
      }
    }
  }
  return false;
}

/**
 * Decodes a buffer into a string using deterministic BOM sniffing,
 * UTF-8 validation by replacement character density, and a content-aware fallback chain.
 *
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {string} [options.originalFilename]
 * @returns {string}
 */
function decodeTextBuffer(buffer, { originalFilename = '' } = {}) {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  // 1. Process environment explicit override
  if (process.env.TEXT_ENCODING && process.env.TEXT_ENCODING.trim()) {
    const override = process.env.TEXT_ENCODING.trim().toLowerCase();
    console.log(`[TextParser] Encoding override via TEXT_ENCODING: ${override}`);
    return iconv.decode(buffer, override);
  }

  // 2. BOM sniff (deterministic, no guessing)
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    console.log('[TextParser] BOM detected: UTF-8');
    return buffer.slice(3).toString('utf8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    console.log('[TextParser] BOM detected: UTF-16LE');
    return buffer.slice(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    console.log('[TextParser] BOM detected: UTF-16BE');
    return iconv.decode(buffer.slice(2), 'utf16be');
  }

  // 3. Try UTF-8 and validate by U+FFFD density (< 0.1%)
  const utf8Decoded = buffer.toString('utf8');
  const utf8Replacements = (utf8Decoded.match(/\uFFFD/g) || []).length;
  const utf8Density = utf8Replacements / Math.max(1, utf8Decoded.length);
  if (utf8Density < 0.001) {
    console.log(`[TextParser] Encoding detected: utf-8 (density ${utf8Density.toFixed(4)}) for ${originalFilename || ''}`);
    return utf8Decoded;
  }

  // 4. Fallback chain: test each encoding and validate by U+FFFD density (< 1%)
  const tryShiftJisFirst = hasShiftJisLeadBytes(buffer);
  const candidateEncodings = tryShiftJisFirst
    ? ['shiftjis', 'windows-1252']
    : ['windows-1252', 'shiftjis'];

  for (const encoding of candidateEncodings) {
    const decoded = iconv.decode(buffer, encoding);
    const replacements = (decoded.match(/\uFFFD/g) || []).length;
    const density = replacements / Math.max(1, decoded.length);
    if (density < 0.01) {
      console.log(`[TextParser] Encoding detected: ${encoding} (density ${density.toFixed(4)}) for ${originalFilename || ''}`);
      return decoded;
    }
  }

  // 5. If all attempts fail
  throw new Error(
    'ENCODING_UNRECOGNIZED: could not detect file encoding for ' +
    originalFilename + '. Expected UTF-8, UTF-16, Windows-1252, ' +
    'or ShiftJIS. Set TEXT_ENCODING env var to override ' +
    '(e.g. TEXT_ENCODING=shiftjis).'
  );
}

/**
 * Text Parser for Smart Reader
 * Parses plain text (.txt, pasted notes, buffers) into canonical blocks.
 */
class TextParser {
  /**
   * Parses normalized plain text or buffer into CanonicalDocument
   * @param {string|Buffer} input
   * @param {Object} [options]
   * @returns {CanonicalDocument}
   */
  parse(input, options = {}) {
    const originalFilename = typeof options === 'string'
      ? options
      : (options && options.originalFilename ? options.originalFilename : '');

    let text = '';
    if (Buffer.isBuffer(input)) {
      text = decodeTextBuffer(input, { originalFilename });
    } else if (typeof input === 'string') {
      text = input;
    } else if (input) {
      text = String(input);
    }

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

const textParserInstance = new TextParser();
textParserInstance.decodeTextBuffer = decodeTextBuffer;
textParserInstance.hasShiftJisLeadBytes = hasShiftJisLeadBytes;

module.exports = textParserInstance;
module.exports.decodeTextBuffer = decodeTextBuffer;
module.exports.hasShiftJisLeadBytes = hasShiftJisLeadBytes;
