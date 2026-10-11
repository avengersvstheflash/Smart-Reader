'use strict';

const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const { CanonicalDocument } = require('../models/canonicalContent');

const ENCODING_ALIASES = {
  // Japanese
  'cp932': 'shiftjis',
  'shift_jis': 'shiftjis',
  'shift-jis': 'shiftjis',
  'sjis': 'shiftjis',
  'windows-31j': 'shiftjis',
  'x-sjis': 'shiftjis',
  'shift_jis_2004': 'shiftjis',
  'shift-jis-2004': 'shiftjis',
  'shiftjis2004': 'shiftjis',
  'shift_jisx0213': 'shiftjis',
  'shift-jisx0213': 'shiftjis',
  'shiftjisx0213': 'shiftjis',
  'eucjp': 'euc-jp',
  'euc-jp': 'euc-jp',
  'euc-jis-2004': 'euc-jp',
  'euc_jis_2004': 'euc-jp',
  'eucjis2004': 'euc-jp',
  'euc-jisx0213': 'euc-jp',
  'euc_jisx0213': 'euc-jp',
  'eucjisx0213': 'euc-jp',

  // Chinese
  'gb2312': 'gb18030',
  'gbk': 'gb18030',
  'gb18030': 'gb18030',
  'gb18030_2000': 'gb18030',
  'gbk2312': 'gb18030',
  'eucgb2312_cn': 'gb18030',
  'big5': 'big5',
  'big-5': 'big5',
  'big5-tw': 'big5',
  'big5_tw': 'big5',
  'big5-hkscs': 'big5-hkscs',
  'big5hkscs': 'big5-hkscs',

  // Korean
  'euckr': 'euc-kr',
  'euc-kr': 'euc-kr',
  'ksc5601': 'euc-kr',
  'cp949': 'cp949',

  // Unicode / ASCII
  'ascii': 'utf-8',
  'us-ascii': 'utf-8',
  'utf8': 'utf-8',
  'utf-8': 'utf-8',
  'cp65001': 'utf-8',
  'utf-8-sig': 'utf-8',
  'utf_8_sig': 'utf-8',
  'utf-8-bom': 'utf-8',
  'utf8-bom': 'utf-8',
  'utf-16': 'utf-16le',
  'utf-16le': 'utf-16le',
  'utf-16-le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'utf-16-be': 'utf-16be',
  'utf-32': 'utf-32le',
  'utf-32le': 'utf-32le',
  'utf-32-le': 'utf-32le',
  'utf-32be': 'utf-32be',
  'utf-32-be': 'utf-32be',

  // Western & European
  'win1252': 'windows-1252',
  'windows-1252': 'windows-1252',
  'cp1252': 'windows-1252',
  'iso-8859-1': 'windows-1252',
  'iso8859-1': 'windows-1252',
  'latin1': 'windows-1252',
  'windows-1250': 'windows-1250',
  'win1250': 'windows-1250',
  'cp1250': 'windows-1250',
  'iso-8859-2': 'iso-8859-2',
  'iso8859-2': 'iso-8859-2',
  'latin2': 'iso-8859-2',
  'iso-8859-3': 'iso-8859-3',
  'iso8859-3': 'iso-8859-3',
  'iso-8859-15': 'iso-8859-15',
  'iso8859-15': 'iso-8859-15',
  'iso-8859-16': 'iso-8859-16',
  'iso8859-16': 'iso-8859-16',

  // Baltic & Scandinavian
  'windows-1257': 'windows-1257',
  'win1257': 'windows-1257',
  'cp1257': 'windows-1257',
  'iso-8859-4': 'iso-8859-4',
  'iso8859-4': 'iso-8859-4',
  'iso-8859-10': 'iso-8859-10',
  'iso8859-10': 'iso-8859-10',
  'iso-8859-13': 'iso-8859-13',
  'iso8859-13': 'iso-8859-13',
  'iso-8859-14': 'iso-8859-14',
  'iso8859-14': 'iso-8859-14',

  // Cyrillic
  'windows-1251': 'windows-1251',
  'win1251': 'windows-1251',
  'cp1251': 'windows-1251',
  'koi8-r': 'koi8-r',
  'koi8r': 'koi8-r',
  'koi8-u': 'koi8-u',
  'koi8u': 'koi8-u',
  'iso-8859-5': 'iso-8859-5',
  'iso8859-5': 'iso-8859-5',
  'ibm855': 'ibm855',
  'cp855': 'ibm855',
  'ibm866': 'ibm866',
  'cp866': 'ibm866',
  'maccyrillic': 'maccyrillic',
  'mac-cyrillic': 'maccyrillic',

  // Greek, Hebrew, Turkish, Arabic, Thai, Vietnamese
  'windows-1253': 'windows-1253',
  'win1253': 'windows-1253',
  'cp1253': 'windows-1253',
  'iso-8859-7': 'iso-8859-7',
  'iso8859-7': 'iso-8859-7',
  'macgreek': 'macgreek',
  'mac-greek': 'macgreek',
  'windows-1255': 'windows-1255',
  'win1255': 'windows-1255',
  'cp1255': 'windows-1255',
  'iso-8859-8': 'iso-8859-8',
  'iso8859-8': 'iso-8859-8',
  'windows-1254': 'windows-1254',
  'win1254': 'windows-1254',
  'cp1254': 'windows-1254',
  'iso-8859-9': 'iso-8859-9',
  'iso8859-9': 'iso-8859-9',
  'macturkish': 'macturkish',
  'mac-turkish': 'macturkish',
  'windows-1256': 'windows-1256',
  'win1256': 'windows-1256',
  'cp1256': 'windows-1256',
  'iso-8859-6': 'iso-8859-6',
  'iso8859-6': 'iso-8859-6',
  'windows-1258': 'windows-1258',
  'win1258': 'windows-1258',
  'cp1258': 'windows-1258',
  'tis-620': 'tis-620',
  'tis620': 'tis-620',
  'cp874': 'windows-874',
  'windows-874': 'windows-874',
  'iso-8859-11': 'tis-620',
  'iso8859-11': 'tis-620',

  // Mac & DOS
  'macroman': 'macintosh',
  'mac-roman': 'macintosh',
  'macintosh': 'macintosh',
  'cp437': 'cp437',
  'ibm437': 'cp437',
  'cp850': 'cp850',
  'ibm850': 'cp850',
  'cp852': 'cp852',
  'ibm852': 'cp852',
};

/**
 * Normalizes detected encoding strings to iconv-lite compatible encoding names.
 *
 * @param {string} rawEncoding
 * @returns {string|null}
 */
function normalizeEncoding(rawEncoding) {
  if (!rawEncoding || typeof rawEncoding !== 'string') {
    return null;
  }
  const clean = rawEncoding.trim().toLowerCase();
  if (ENCODING_ALIASES[clean]) {
    return ENCODING_ALIASES[clean];
  }
  if (iconv.encodingExists(clean)) {
    return clean;
  }
  const dashed = clean.replace(/_/g, '-');
  if (iconv.encodingExists(dashed)) {
    return dashed;
  }
  const underscored = clean.replace(/-/g, '_');
  if (iconv.encodingExists(underscored)) {
    return underscored;
  }
  const noDelim = clean.replace(/[-_]/g, '');
  if (ENCODING_ALIASES[noDelim]) {
    return ENCODING_ALIASES[noDelim];
  }
  if (iconv.encodingExists(noDelim)) {
    return noDelim;
  }
  return clean;
}

/**
 * Extracts a strategic sample window from a buffer for statistical encoding detection.
 * If buffer is smaller than sampleSize, returns the whole buffer.
 * If the head of the buffer contains non-ASCII bytes, returns the head.
 * If the head is pure ASCII, scans forward to locate the first non-ASCII byte sequence
 * and centers a sampleSize window around it with a 512-byte leading context buffer.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {number} [sampleSize=65536]
 * @returns {Buffer}
 */
function getSampleBuffer(buffer, sampleSize = 65536) {
  if (!buffer || buffer.length === 0) {
    return Buffer.alloc(0);
  }
  let buf = buffer;
  if (!Buffer.isBuffer(buf)) {
    if (ArrayBuffer.isView(buf)) {
      buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
      buf = Buffer.from(buf);
    }
  }

  const effectiveSize = (typeof sampleSize === 'number' && sampleSize > 0) ? sampleSize : 65536;

  // Scan for the first non-ASCII byte sequence (>= 0x80)
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] >= 0x80) {
      if (i <= 512) {
        return buf.length <= effectiveSize ? buf : buf.subarray(0, effectiveSize);
      }
      const start = i - 512;
      const end = Math.min(buf.length, start + effectiveSize);
      return buf.subarray(start, end);
    }
  }

  // Entire buffer is pure ASCII
  return buf.length <= effectiveSize ? buf : buf.subarray(0, effectiveSize);
}

/**
 * Checks whether the first 500 bytes contain ShiftJIS lead bytes
 * (0x81-0x9F or 0xE0-0xEF) followed by a valid trail byte (0x40-0x7E or 0x80-0xFC).
 *
 * @param {Buffer} buffer
 * @returns {boolean}
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
 * UTF-8 validation by replacement character density, statistical detection (jschardet),
 * and a content-aware fallback chain.
 *
 * @param {Buffer|Uint8Array|string} buffer
 * @param {Object|string} [options]
 * @param {string} [options.originalFilename]
 * @param {number} [options.confidenceThreshold=0.15]
 * @param {number} [options.sampleSize=65536]
 * @returns {string}
 */
function decodeTextBuffer(buffer, options = {}) {
  const originalFilename = typeof options === 'string'
    ? options
    : (options && options.originalFilename ? options.originalFilename : '');
  const confidenceThreshold = (options && typeof options.confidenceThreshold === 'number' && options.confidenceThreshold >= 0 && options.confidenceThreshold <= 1)
    ? options.confidenceThreshold
    : 0.15;
  const sampleSize = (options && typeof options.sampleSize === 'number' && options.sampleSize > 0)
    ? options.sampleSize
    : 65536;

  if (!buffer || buffer.length === 0) {
    return '';
  }

  // Already a string: return as-is immediately
  if (typeof buffer === 'string') {
    return buffer;
  }

  // Normalize Uint8Array / ArrayBuffer to Node.js Buffer
  let buf = buffer;
  if (!Buffer.isBuffer(buf)) {
    if (ArrayBuffer.isView(buf)) {
      buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    } else if (buf instanceof ArrayBuffer) {
      buf = Buffer.from(buf);
    } else {
      buf = Buffer.from(String(buf));
    }
  }

  // 1. Process environment explicit override
  if (process.env.TEXT_ENCODING && process.env.TEXT_ENCODING.trim()) {
    const rawOverride = process.env.TEXT_ENCODING.trim().toLowerCase();
    const override = normalizeEncoding(rawOverride) || rawOverride;
    console.log(`[TextParser] Encoding override via TEXT_ENCODING: ${override} (raw: ${rawOverride})`);
    if (iconv.encodingExists(override)) {
      return iconv.decode(buf, override);
    }
    console.warn(`[TextParser] TEXT_ENCODING override '${rawOverride}' is not recognized by iconv-lite, continuing detection`);
  }

  // 2. BOM sniff (deterministic, 4-byte check before 2-byte check)
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0xfe && buf[3] === 0xff) {
    console.log('[TextParser] BOM detected: UTF-32BE');
    return iconv.decode(buf.subarray(4), 'utf32be');
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xfe && buf[2] === 0x00 && buf[3] === 0x00) {
    console.log('[TextParser] BOM detected: UTF-32LE');
    return iconv.decode(buf.subarray(4), 'utf32le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    console.log('[TextParser] BOM detected: UTF-8');
    return buf.subarray(3).toString('utf8');
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    console.log('[TextParser] BOM detected: UTF-16LE');
    return buf.subarray(2).toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    console.log('[TextParser] BOM detected: UTF-16BE');
    return iconv.decode(buf.subarray(2), 'utf16be');
  }

  // 3. Try UTF-8 and validate by U+FFFD density (< 0.1%)
  const utf8Decoded = buf.toString('utf8');
  const utf8Replacements = (utf8Decoded.match(/\uFFFD/g) || []).length;
  const utf8Density = utf8Replacements / Math.max(1, utf8Decoded.length);
  if (utf8Density < 0.001) {
    console.log(`[TextParser] Encoding detected: utf-8 (density ${utf8Density.toFixed(4)}) for ${originalFilename || ''}`);
    return utf8Decoded;
  }

  // 4. Tier 2: Statistical encoding detection (jschardet) + heuristic fallback chain
  let detectedRaw = null;
  let detectedConfidence = 0;
  let detectedEnc = null;

  let sample = null;
  try {
    sample = getSampleBuffer(buf, sampleSize);
    const result = jschardet.detect(sample);
    if (result && result.encoding) {
      detectedRaw = result.encoding;
      detectedConfidence = typeof result.confidence === 'number' ? result.confidence : 0;
      detectedEnc = normalizeEncoding(detectedRaw);
    }
  } catch (detectErr) {
    console.warn(`[TextParser] Statistical encoding detection failed: ${detectErr.message}`);
  }

  // Build candidate encodings list
  const candidates = [];
  const addCandidate = (enc) => {
    if (enc && iconv.encodingExists(enc) && !candidates.includes(enc)) {
      candidates.push(enc);
    }
  };

  const isConfident = Boolean(
    detectedEnc &&
    detectedConfidence >= confidenceThreshold &&
    iconv.encodingExists(detectedEnc)
  );

  if (isConfident) {
    console.log(
      `[TextParser] Statistical detection: ${detectedRaw} -> ${detectedEnc} ` +
      `(confidence ${(detectedConfidence * 100).toFixed(1)}%) for ${originalFilename || ''}`
    );
    addCandidate(detectedEnc);
  }

  // Add heuristic base fallbacks
  const tryShiftJisFirst = (sample && hasShiftJisLeadBytes(sample)) || hasShiftJisLeadBytes(buf);
  if (tryShiftJisFirst) {
    addCandidate('shiftjis');
    addCandidate('windows-1252');
  } else {
    addCandidate('windows-1252');
    addCandidate('shiftjis');
  }

  // If detected encoding had lower confidence or wasn't added yet, add as trailing fallback
  if (detectedEnc && iconv.encodingExists(detectedEnc)) {
    addCandidate(detectedEnc);
  }

  // Test candidate encodings in order and validate by U+FFFD density (< 1%)
  for (const encoding of candidates) {
    try {
      const decoded = iconv.decode(buf, encoding);
      const replacements = (decoded.match(/\uFFFD/g) || []).length;
      const density = replacements / Math.max(1, decoded.length);
      if (density < 0.01) {
        console.log(`[TextParser] Encoding detected: ${encoding} (density ${density.toFixed(4)}) for ${originalFilename || ''}`);
        return decoded;
      }
    } catch (e) {
      // Decode attempt failed for this candidate, try next
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
   * @param {string|Buffer|Uint8Array} input
   * @param {Object} [options]
   * @returns {CanonicalDocument}
   */
  parse(input, options = {}) {
    const opts = typeof options === 'string'
      ? { originalFilename: options }
      : (options || {});

    let text = '';
    if (Buffer.isBuffer(input) || ArrayBuffer.isView(input) || input instanceof ArrayBuffer) {
      text = decodeTextBuffer(input, opts);
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

      // Check for Aozora section markers (F51h): preserve full original block text intact
      if (lines.length === 1 && /［＃「([^」]+)」は(?:中|小|大)?見出し］/.test(trimmed)) {
        doc.addBlock({
          type: 'heading',
          level: 1,
          text: trimmed,
        });
        continue;
      }

      // Check for Japanese chapter markers: 第N章 / 第N節 / 第N篇 / 第N部
      if (lines.length === 1 && /^第[一二三四五六七八九十百千0-9]+[章節篇部]/.test(trimmed)) {
        doc.addBlock({
          type: 'heading',
          level: 1,
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
textParserInstance.normalizeEncoding = normalizeEncoding;
textParserInstance.getSampleBuffer = getSampleBuffer;
textParserInstance.ENCODING_ALIASES = ENCODING_ALIASES;

module.exports = textParserInstance;
module.exports.decodeTextBuffer = decodeTextBuffer;
module.exports.hasShiftJisLeadBytes = hasShiftJisLeadBytes;
module.exports.normalizeEncoding = normalizeEncoding;
module.exports.getSampleBuffer = getSampleBuffer;
module.exports.ENCODING_ALIASES = ENCODING_ALIASES;
