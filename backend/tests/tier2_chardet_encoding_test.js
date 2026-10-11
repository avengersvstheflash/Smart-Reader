'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const textParser = require('../services/ingestion/parsers/textParser');
const markdownParser = require('../services/ingestion/parsers/markdownParser');

const {
  decodeTextBuffer,
  hasShiftJisLeadBytes,
  normalizeEncoding,
  getSampleBuffer,
  ENCODING_ALIASES,
} = textParser;

async function runTier2ChardetTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING TIER 2 JSCHARDET STATISTICAL ENCODING DETECTION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 16;

  // --------------------------------------------------------------------------
  // T1: Unit tests for normalizeEncoding
  // --------------------------------------------------------------------------
  console.log('T1: Unit tests for normalizeEncoding');
  {
    assert.strictEqual(normalizeEncoding('CP932'), 'shiftjis');
    assert.strictEqual(normalizeEncoding('shift_jis'), 'shiftjis');
    assert.strictEqual(normalizeEncoding('Shift-JIS'), 'shiftjis');
    assert.strictEqual(normalizeEncoding('sjis'), 'shiftjis');
    assert.strictEqual(normalizeEncoding('EUC-JP'), 'euc-jp');
    assert.strictEqual(normalizeEncoding('EUC-KR'), 'euc-kr');
    assert.strictEqual(normalizeEncoding('GB2312'), 'gb18030');
    assert.strictEqual(normalizeEncoding('gbk'), 'gb18030');
    assert.strictEqual(normalizeEncoding('GB18030'), 'gb18030');
    assert.strictEqual(normalizeEncoding('Big5'), 'big5');
    assert.strictEqual(normalizeEncoding('windows-1251'), 'windows-1251');
    assert.strictEqual(normalizeEncoding('Windows-1252'), 'windows-1252');
    assert.strictEqual(normalizeEncoding('iso-8859-1'), 'windows-1252');
    assert.strictEqual(normalizeEncoding('latin1'), 'windows-1252');
    assert.strictEqual(normalizeEncoding('ascii'), 'utf-8');
    assert.strictEqual(normalizeEncoding('utf-8'), 'utf-8');
    assert.strictEqual(normalizeEncoding('koi8-r'), 'koi8-r');
    assert.strictEqual(normalizeEncoding(''), null);
    assert.strictEqual(normalizeEncoding(null), null);
    assert.strictEqual(normalizeEncoding(undefined), null);

    console.log('  ✓ Passed: All encoding normalization mappings verified\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2: Strategic sampling (getSampleBuffer)
  // --------------------------------------------------------------------------
  console.log('T2: Strategic sampling (getSampleBuffer)');
  {
    // Small buffer: returns as-is
    const small = Buffer.from('Hello world');
    assert.strictEqual(getSampleBuffer(small, 65536).length, small.length);

    // Buffer with non-ASCII in head
    const headNonAscii = Buffer.concat([
      iconv.encode('日本語テキスト', 'shiftjis'),
      Buffer.alloc(100000, 0x20),
    ]);
    const sampleHead = getSampleBuffer(headNonAscii, 65536);
    assert.strictEqual(sampleHead.length, 65536);
    assert(sampleHead[0] >= 0x80, 'Sample must capture non-ASCII head');

    // Buffer with 70KB of pure ASCII header followed by ShiftJIS Japanese
    const asciiHeader = Buffer.alloc(70000, 0x61); // 70KB of 'a'
    const japaneseBody = iconv.encode('吾輩は猫である。名前はまだ無い。'.repeat(100), 'shiftjis');
    const largeDoc = Buffer.concat([asciiHeader, japaneseBody]);

    const sampleStrategic = getSampleBuffer(largeDoc, 65536);
    assert(sampleStrategic.length > 0 && sampleStrategic.length <= 65536);
    // Must contain bytes from the japaneseBody region
    let containsNonAscii = false;
    for (let i = 0; i < sampleStrategic.length; i++) {
      if (sampleStrategic[i] >= 0x80) {
        containsNonAscii = true;
        break;
      }
    }
    assert(containsNonAscii, 'getSampleBuffer must seek past ASCII header into non-ASCII content');

    // Strategic sample decodes properly through decodeTextBuffer
    const decodedLargeDoc = decodeTextBuffer(largeDoc, { originalFilename: 'prefixed_book.txt' });
    assert(decodedLargeDoc.includes('吾輩は猫である'), 'Large doc with ASCII prefix must decode Japanese body cleanly');
    assert.strictEqual(decodedLargeDoc.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    console.log('  ✓ Passed: Strategic sampling handles small buffers, head non-ASCII, and long ASCII headers\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3: Japanese EUC-JP Detection
  // --------------------------------------------------------------------------
  console.log('T3: Japanese EUC-JP Detection');
  {
    const rawJapanese = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。\n\n第１章\n猫の生活。';
    const eucBuf = iconv.encode(rawJapanese.repeat(5), 'euc-jp');

    const decoded = decodeTextBuffer(eucBuf, { originalFilename: 'sample_eucjp.txt' });
    assert(decoded.includes('吾輩は猫である'), 'Decoded text must contain Japanese characters');
    assert(decoded.includes('名前はまだ無い'), 'Decoded text must contain expected phrase');
    assert.strictEqual(decoded.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    // textParser canonical document integration
    const doc = textParser.parse(eucBuf, { originalFilename: 'sample_eucjp.txt' });
    assert(doc.blocks.length > 0, 'Must produce canonical blocks');
    assert(doc.blocks.some((b) => b.text && b.text.includes('吾輩は猫である')));

    console.log('  ✓ Passed: EUC-JP detected statistically and decoded without replacement errors\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4: Russian Windows-1251 and KOI8-R Detection
  // --------------------------------------------------------------------------
  console.log('T4: Russian Windows-1251 and KOI8-R Detection');
  {
    const russianText = 'Привет, мир! Это тестовая строка на русском языке для проверки кодировки текста в Smart Reader.\n\nГлава 1\nВ начале было слово, и слово было у нас.';
    
    // Windows-1251
    const win1251Buf = iconv.encode(russianText.repeat(5), 'windows-1251');
    const decoded1251 = decodeTextBuffer(win1251Buf, { originalFilename: 'russian_1251.txt' });
    assert(decoded1251.includes('Привет, мир!'), 'Must decode Russian Cyrillic correctly');
    assert(decoded1251.includes('Smart Reader'), 'Must preserve ASCII within Cyrillic text');
    assert.strictEqual(decoded1251.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    // KOI8-R
    const koi8Buf = iconv.encode(russianText.repeat(5), 'koi8-r');
    const decodedKoi8 = decodeTextBuffer(koi8Buf, { originalFilename: 'russian_koi8.txt' });
    assert(decodedKoi8.includes('Привет, мир!'), 'Must decode KOI8-R Cyrillic correctly');
    assert.strictEqual(decodedKoi8.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    console.log('  ✓ Passed: Windows-1251 and KOI8-R Russian detected and decoded accurately\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5: Chinese GB18030 / GB2312 and Big5 Detection
  // --------------------------------------------------------------------------
  console.log('T5: Chinese GB18030 and Big5 Detection');
  {
    // Simplified Chinese
    const simplText = '道可道，非常道。名可名，非常名。无名天地之始；有名万物之母。故常无欲，以观其妙；常有欲，以观其徼。此两者同出而异名，同谓之玄。玄之又玄，众妙之门。';
    const gbBuf = iconv.encode(simplText.repeat(5), 'gb18030');
    const decodedGB = decodeTextBuffer(gbBuf, { originalFilename: 'daodejing_gb18030.txt' });
    assert(decodedGB.includes('道可道，非常道'), 'Must decode Simplified Chinese correctly');
    assert.strictEqual(decodedGB.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    // Traditional Chinese (Big5)
    const tradText = '道可道，非常道。名可名，非常名。無名天地之始；有名萬物之母。故常無欲，以觀其妙；常有欲，以觀其徼。此兩者同出而異名，同謂之玄。玄之又玄，眾妙之門。';
    const big5Buf = iconv.encode(tradText.repeat(5), 'big5');
    const decodedBig5 = decodeTextBuffer(big5Buf, { originalFilename: 'daodejing_big5.txt' });
    assert(decodedBig5.includes('道可道，非常道'), 'Must decode Traditional Chinese correctly');
    assert(decodedBig5.includes('無名天地之始'), 'Must contain traditional glyphs');
    assert.strictEqual(decodedBig5.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    console.log('  ✓ Passed: Both Simplified (GB18030) and Traditional (Big5) Chinese decoded cleanly\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T6: Central European Windows-1250 / ISO-8859-2 (Polish)
  // --------------------------------------------------------------------------
  console.log('T6: Central European Windows-1250 (Polish)');
  {
    const polishText = 'Zażółć gęślą jaźń. Pchnąć w tę łódź jeża lub ośm skrzyń fig. Litwo, Ojczyzno moja! ty jesteś jak zdrowie; Ile cię trzeba cenić, ten tylko się dowie, Kto cię stracił.\n\nDziś piękność twą w całej ozdobie widzę i opisuję, bo tęsknię po tobie.';
    const win1250Buf = iconv.encode(polishText.repeat(5), 'windows-1250');
    const decoded1250 = decodeTextBuffer(win1250Buf, { originalFilename: 'pan_tadeusz.txt' });

    assert(decoded1250.includes('Zażółć gęślą jaźń'), 'Must decode Polish diacritics');
    assert(decoded1250.includes('Ojczyzno moja!'), 'Must preserve punctuation and text');
    assert.strictEqual(decoded1250.includes('\uFFFD'), false, 'Must not contain U+FFFD');

    console.log('  ✓ Passed: Polish Windows-1250 decoded with proper diacritics\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T7: UTF-8 Fast Path Verification (Zero statistical overhead)
  // --------------------------------------------------------------------------
  console.log('T7: UTF-8 Fast Path Verification (Zero statistical overhead)');
  {
    const utf8Text = 'The quick brown fox jumps over the lazy dog. Standard clean UTF-8 text with symbols: ©, ®, ™, €, and emoji: 🚀, 📚.';
    const utf8Buf = Buffer.from(utf8Text.repeat(100), 'utf8');

    const t0 = process.hrtime.bigint();
    const decoded = decodeTextBuffer(utf8Buf, { originalFilename: 'fastpath.txt' });
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;

    assert.strictEqual(decoded, utf8Text.repeat(100));
    assert.strictEqual(decoded.includes('\uFFFD'), false);
    // Fast path should execute in well under 20ms for in-memory buffer
    assert(durationMs < 20, `Fast path should be sub-20ms (took ${durationMs.toFixed(2)}ms)`);

    console.log(`  ✓ Passed: UTF-8 fast-path executed in ${durationMs.toFixed(2)}ms without statistical detection\n`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // T8: Performance on multi-megabyte non-UTF-8 files (64KB sample cap)
  // --------------------------------------------------------------------------
  console.log('T8: Performance on multi-megabyte non-UTF-8 files (64KB sample cap)');
  {
    const chapter = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。\n';
    // Create ~3.3MB ShiftJIS buffer
    const largeBuf = iconv.encode(chapter.repeat(25000), 'shiftjis');
    assert(largeBuf.length > 3 * 1024 * 1024, `Precondition: buffer must be > 3MB (got ${(largeBuf.length / (1024 * 1024)).toFixed(2)}MB)`);

    const t0 = process.hrtime.bigint();
    const decoded = decodeTextBuffer(largeBuf, { originalFilename: 'wagahai_large.txt' });
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;

    assert(decoded.includes('吾輩は猫である'));
    assert.strictEqual(decoded.includes('\uFFFD'), false);
    console.log(`  ✓ Decoded ${(largeBuf.length / (1024 * 1024)).toFixed(2)}MB non-UTF-8 buffer in ${durationMs.toFixed(2)}ms`);
    // Sample-window bounded detect + fast iconv decode should comfortably complete in < 500ms
    assert(durationMs < 500, `Multi-megabyte decode took ${durationMs.toFixed(2)}ms, expected < 500ms`);

    console.log('  ✓ Passed: 64KB sample window kept large non-UTF-8 detection fast and bounded\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T9: MarkdownParser integration with non-UTF-8 buffers
  // --------------------------------------------------------------------------
  console.log('T9: MarkdownParser integration with non-UTF-8 buffers');
  {
    const mdContent = '# 吾輩の記録\n\n吾輩は猫である。名前はまだ無い。\n\n> 猫の知恵: 人間は奇妙な動物である。\n\n- ネズミを捕る\n- 昼寝をする\n';
    const mdBuf = iconv.encode(mdContent, 'shiftjis');

    const doc = markdownParser.parse(mdBuf, { originalFilename: 'wagahai.md' });
    assert(doc.blocks.length >= 4, `Must produce structured markdown blocks (got ${doc.blocks.length})`);
    
    const heading = doc.blocks.find((b) => b.type === 'heading');
    assert(heading && heading.text.includes('吾輩の記録'), 'Must parse heading from ShiftJIS markdown');

    const quote = doc.blocks.find((b) => b.type === 'quote');
    assert(quote && quote.text.includes('人間は奇妙な動物である'), 'Must parse quote from ShiftJIS markdown');

    const list = doc.blocks.find((b) => b.type === 'list');
    assert(list && list.items.some((item) => item.includes('昼寝をする')), 'Must parse list from ShiftJIS markdown');

    console.log('  ✓ Passed: MarkdownParser produces structured blocks from non-UTF-8 buffers\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T10: Confidence Threshold and Fallback Behavior
  // --------------------------------------------------------------------------
  console.log('T10: Confidence Threshold and Fallback Behavior');
  {
    // A. High threshold (0.95) rejects low-confidence detection and uses base fallbacks
    const fixturePath = path.join(__dirname, 'fixtures', 'encoding', 'sample_windows1252.txt');
    const win1252Buf = fs.readFileSync(fixturePath);

    // With confidenceThreshold: 0.95, low-confidence Windows-1250 guess is ignored and base fallbacks resolve it
    const decodedStrict = decodeTextBuffer(win1252Buf, {
      originalFilename: 'strict_threshold.txt',
      confidenceThreshold: 0.95,
    });
    assert.strictEqual(decodedStrict, 'Café, résumé, naïve, façade.');

    // B. Empty buffer returns empty string immediately
    const emptyDecoded = decodeTextBuffer(Buffer.alloc(0));
    assert.strictEqual(emptyDecoded, '');

    // C. Null / undefined buffer returns empty string
    assert.strictEqual(decodeTextBuffer(null), '');
    assert.strictEqual(decodeTextBuffer(undefined), '');

    // D. Corrupt random bytes throws ENCODING_UNRECOGNIZED
    const corruptBuffer = Buffer.from([
      0x81, 0x01, 0x8d, 0x02, 0x8f, 0x03, 0x90, 0x04, 0x9d, 0x05,
      0x81, 0x01, 0x8d, 0x02, 0x8f, 0x03, 0x90, 0x04, 0x9d, 0x05,
    ]);
    assert.throws(
      () => decodeTextBuffer(corruptBuffer, { originalFilename: 'corrupt.bin' }),
      /ENCODING_UNRECOGNIZED/
    );

    console.log('  ✓ Passed: Configurable threshold, empty buffers, and corrupt fallbacks handled cleanly\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T11: Non-Buffer Input Handling (Uint8Array, ArrayBuffer, string)
  // --------------------------------------------------------------------------
  console.log('T11: Non-Buffer Input Handling (Uint8Array, ArrayBuffer, string)');
  {
    const originalJp = 'こんにちわ世界！スマートリーダーのテストです。';
    const sjisNodeBuf = iconv.encode(originalJp, 'shiftjis');

    // 1. Pure Uint8Array input to decodeTextBuffer must decode properly and NOT return "130,160,..."
    const u8 = new Uint8Array(sjisNodeBuf);
    const decodedU8 = decodeTextBuffer(u8, { originalFilename: 'uint8_test.txt' });
    assert.strictEqual(decodedU8, originalJp, 'Uint8Array must decode into genuine characters, not numbers');

    // 2. Pure ArrayBuffer input to decodeTextBuffer
    const ab = sjisNodeBuf.buffer.slice(sjisNodeBuf.byteOffset, sjisNodeBuf.byteOffset + sjisNodeBuf.byteLength);
    const decodedAB = decodeTextBuffer(ab, { originalFilename: 'arraybuffer_test.txt' });
    assert.strictEqual(decodedAB, originalJp, 'ArrayBuffer must decode into genuine characters');

    // 3. Uint8Array passed to TextParser.parse
    const docText = textParser.parse(u8, { originalFilename: 'doc_uint8.txt' });
    assert(docText.blocks.length > 0);
    assert(docText.blocks[0].text.includes('こんにちわ世界'));

    // 4. Uint8Array passed to MarkdownParser.parse
    const mdString = '# 見出し\n\n' + originalJp;
    const mdU8 = new Uint8Array(iconv.encode(mdString, 'shiftjis'));
    const docMd = markdownParser.parse(mdU8, { originalFilename: 'doc_uint8.md' });
    assert(docMd.blocks.some((b) => b.type === 'heading' && b.text.includes('見出し')));

    // 5. String input (already decoded) passed to decodeTextBuffer
    assert.strictEqual(decodeTextBuffer('Already decoded string'), 'Already decoded string');
    // String containing U+FFFD should also pass through safely without crash
    const fffdString = 'String with \uFFFD replacement marker';
    assert.strictEqual(decodeTextBuffer(fffdString), fffdString);

    console.log('  ✓ Passed: Uint8Array, ArrayBuffer, and String inputs handled cleanly without numeric coercion\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T12: Extended Encoding Aliases and Normalization Mappings
  // --------------------------------------------------------------------------
  console.log('T12: Extended Encoding Aliases and Normalization Mappings');
  {
    assert.strictEqual(normalizeEncoding('UTF-8-SIG'), 'utf-8');
    assert.strictEqual(normalizeEncoding('utf_8_sig'), 'utf-8');
    assert.strictEqual(normalizeEncoding('utf-8-bom'), 'utf-8');
    assert.strictEqual(normalizeEncoding('cp65001'), 'utf-8');
    assert.strictEqual(normalizeEncoding('big5-tw'), 'big5');
    assert.strictEqual(normalizeEncoding('big5_tw'), 'big5');
    assert.strictEqual(normalizeEncoding('Shift-JIS-2004'), 'shiftjis');
    assert.strictEqual(normalizeEncoding('shift_jis_2004'), 'shiftjis');
    assert.strictEqual(normalizeEncoding('EUC-JIS-2004'), 'euc-jp');
    assert.strictEqual(normalizeEncoding('euc_jis_2004'), 'euc-jp');
    assert.strictEqual(normalizeEncoding('koi8-u'), 'koi8-u');
    assert.strictEqual(normalizeEncoding('maccyrillic'), 'maccyrillic');
    assert.strictEqual(normalizeEncoding('mac-cyrillic'), 'maccyrillic');
    assert.strictEqual(normalizeEncoding('iso-8859-15'), 'iso-8859-15');
    assert.strictEqual(normalizeEncoding('tis-620'), 'tis-620');
    assert.strictEqual(normalizeEncoding('cp874'), 'windows-874');

    console.log('  ✓ Passed: Extended UTF, CJK, Cyrillic, and European aliases normalized correctly\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T13: Additional Global Encodings (Ukrainian KOI8-U, Thai TIS-620, Latin-9 ISO-8859-15)
  // --------------------------------------------------------------------------
  console.log('T13: Additional Global Encodings (Ukrainian, Thai, Latin-9)');
  {
    // Ukrainian KOI8-U (contains unique Ukrainian letters 'ґ', 'є', 'і', 'ї')
    const ukrainianText = 'Добрий вечір, дорогі читачі! Це перевірка підтримки української мови у Smart Reader: ґанок, єдність, історія, їжак.\n\nРозділ 1\nПочаток нової книги.';
    const koi8uBuf = iconv.encode(ukrainianText.repeat(5), 'koi8-u');
    const decodedUkr = decodeTextBuffer(koi8uBuf, { originalFilename: 'ukrainian.txt' });
    assert(decodedUkr.includes('Добрий вечір'), 'Must decode Ukrainian text');
    assert(decodedUkr.includes('Smart Reader'), 'Must preserve ASCII in Cyrillic');
    assert.strictEqual(decodedUkr.includes('\uFFFD'), false);

    // Thai TIS-620 / CP874
    const thaiText = 'สวัสดีชาวโลก นี่คือข้อความทดสอบสำหรับระบบ Smart Reader ในการตรวจจับรหัสภาษาไทย.';
    const thaiBuf = iconv.encode(thaiText.repeat(5), 'tis-620');
    const decodedThai = decodeTextBuffer(thaiBuf, { originalFilename: 'thai_sample.txt' });
    assert(decodedThai.includes('สวัสดีชาวโลก'), 'Must decode Thai script correctly');
    assert.strictEqual(decodedThai.includes('\uFFFD'), false);

    // Latin-9 (ISO-8859-15) with Euro symbol (0xA4 in ISO-8859-15 vs 0x80 in Windows-1252)
    const latin9Text = 'Le prix est de 45 € pour ce livre français avec accents: été, café, fenêtre.';
    const latin9Buf = iconv.encode(latin9Text.repeat(5), 'iso-8859-15');
    const decodedLatin9 = decodeTextBuffer(latin9Buf, { originalFilename: 'french_iso8859_15.txt' });
    assert(decodedLatin9.includes('45 €'), 'Must decode Euro currency symbol in ISO-8859-15');
    assert(decodedLatin9.includes('été, café, fenêtre'), 'Must decode French accents');
    assert.strictEqual(decodedLatin9.includes('\uFFFD'), false);

    console.log('  ✓ Passed: Ukrainian KOI8-U, Thai TIS-620, and Latin-9 ISO-8859-15 decoded accurately\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T14: UTF-32 BOM Sniffing (LE and BE)
  // --------------------------------------------------------------------------
  console.log('T14: UTF-32 BOM Sniffing (LE and BE)');
  {
    const sample = 'Unicode UTF-32 Test string: 🚀📚.';
    const utf32LEPayload = iconv.encode(sample, 'utf32le');
    const utf32LEBuf = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0x00]), utf32LEPayload]);

    const decodedLE = decodeTextBuffer(utf32LEBuf, { originalFilename: 'sample_utf32le.txt' });
    assert.strictEqual(decodedLE, sample, 'UTF-32LE with BOM must decode cleanly');

    const utf32BEPayload = iconv.encode(sample, 'utf32be');
    const utf32BEBuf = Buffer.concat([Buffer.from([0x00, 0x00, 0xfe, 0xff]), utf32BEPayload]);

    const decodedBE = decodeTextBuffer(utf32BEBuf, { originalFilename: 'sample_utf32be.txt' });
    assert.strictEqual(decodedBE, sample, 'UTF-32BE with BOM must decode cleanly');

    console.log('  ✓ Passed: UTF-32LE and UTF-32BE BOMs sniffed and stripped without 2-byte UTF-16 collision\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T15: Strategic sampling with late transition (60KB pure ASCII prefix)
  // --------------------------------------------------------------------------
  console.log('T15: Strategic sampling with late transition (60KB pure ASCII prefix)');
  {
    // A 60KB ASCII prefix followed by Japanese ShiftJIS text
    const asciiPrefix = Buffer.alloc(60000, 0x20); // 60KB spaces/ASCII
    const jpBody = iconv.encode('吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。'.repeat(50), 'shiftjis');
    const hybridBuf = Buffer.concat([asciiPrefix, jpBody]);

    // getSampleBuffer must center window around byte 60000 and capture non-ASCII content
    const sample = getSampleBuffer(hybridBuf, 65536);
    assert(sample.length > 0 && sample.length <= 65536);
    let nonAsciiCount = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] >= 0x80) nonAsciiCount++;
    }
    assert(nonAsciiCount > 500, `Sample must contain substantial non-ASCII bytes (got ${nonAsciiCount})`);

    const decoded = decodeTextBuffer(hybridBuf, { originalFilename: 'late_transition.txt' });
    assert(decoded.includes('吾輩は猫である'), 'Must decode Japanese body after 60KB ASCII prefix');
    assert.strictEqual(decoded.includes('\uFFFD'), false);

    console.log('  ✓ Passed: 60KB late-transition sample window properly centered and decoded\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T16: TEXT_ENCODING override with alias normalization & graceful fallback
  // --------------------------------------------------------------------------
  console.log('T16: TEXT_ENCODING override with alias normalization & graceful fallback');
  {
    const original = '日本語テスト';
    const buf = iconv.encode(original, 'shiftjis');

    // 1. Alias in env var (e.g. shift_jis -> shiftjis)
    process.env.TEXT_ENCODING = 'shift_jis';
    const decodedAlias = decodeTextBuffer(buf, { originalFilename: 'env_alias.txt' });
    assert.strictEqual(decodedAlias, original);

    // 2. Unrecognized override gracefully warns and falls back to detection
    process.env.TEXT_ENCODING = 'invalid_unknown_charset_123';
    const decodedFallback = decodeTextBuffer(buf, { originalFilename: 'env_fallback.txt' });
    assert.strictEqual(decodedFallback, original);

    delete process.env.TEXT_ENCODING;
    console.log('  ✓ Passed: TEXT_ENCODING alias normalization and unknown charset fallback verified\n');
    passed++;
  }

  console.log('================================================================');
  console.log(`🎉 ALL ${passed}/${total} TIER 2 JSCHARDET TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runTier2ChardetTests().catch((err) => {
  console.error('Unhandled failure in Tier 2 tests:', err);
  process.exit(1);
});
