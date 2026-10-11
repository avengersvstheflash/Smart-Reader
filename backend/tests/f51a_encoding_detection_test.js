'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const textParser = require('../services/ingestion/parsers/textParser');
const markdownParser = require('../services/ingestion/parsers/markdownParser');
const { decodeTextBuffer } = textParser;

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'encoding');

async function runF51aTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F51a CHARACTER ENCODING DETECTION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  const total = 7;

  // --------------------------------------------------------------------------
  // T1: UTF-8 without BOM — passthrough, no FFFD
  // --------------------------------------------------------------------------
  console.log('T1: UTF-8 without BOM — passthrough, no FFFD');
  {
    const content = 'Hello world! Standard UTF-8 prose without BOM. 日本語もOK。';
    const buf = Buffer.from(content, 'utf8');

    const decoded = decodeTextBuffer(buf, { originalFilename: 'plain_utf8.txt' });
    assert.strictEqual(decoded, content, 'T1: Decoded text should match original string');
    assert.strictEqual(decoded.includes('\uFFFD'), false, 'T1: Must not contain replacement character');

    // Parser integration
    const doc = textParser.parse(buf, { originalFilename: 'plain_utf8.txt' });
    assert(doc.blocks.length > 0, 'T1: textParser should produce canonical blocks from buffer');
    assert.strictEqual(doc.blocks[0].text, content);

    console.log('  ✓ Passed\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T2: UTF-8 with BOM — BOM stripped, content intact
  // --------------------------------------------------------------------------
  console.log('T2: UTF-8 with BOM — BOM stripped, content intact');
  {
    const fixturePath = path.join(FIXTURES_DIR, 'sample_utf8_bom.txt');
    const buf = fs.readFileSync(fixturePath);

    const expectedContent = '吾輩は猫である。名前はまだ無い。'.repeat(3);
    const decoded = decodeTextBuffer(buf, { originalFilename: 'sample_utf8_bom.txt' });

    assert.strictEqual(decoded, expectedContent, 'T2: Content should match expected Japanese text');
    assert.strictEqual(decoded.charCodeAt(0) !== 0xfeff, true, 'T2: BOM mark (0xFEFF) must be stripped');
    assert.strictEqual(decoded.includes('\uFFFD'), false, 'T2: Must not contain replacement character');

    console.log('  ✓ Passed\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T3: UTF-16 LE with BOM — decoded correctly
  // --------------------------------------------------------------------------
  console.log('T3: UTF-16 LE with BOM — decoded correctly');
  {
    const sampleText = 'Quantum Computing & Waveforms: α, β, γ.';
    const textBytes = Buffer.from(sampleText, 'utf16le');
    const bufLE = Buffer.concat([Buffer.from([0xff, 0xfe]), textBytes]);

    const decodedLE = decodeTextBuffer(bufLE, { originalFilename: 'sample_utf16le.txt' });
    assert.strictEqual(decodedLE, sampleText, 'T3: UTF-16LE text should decode correctly');
    assert.strictEqual(decodedLE.includes('\uFFFD'), false, 'T3: Must not contain replacement character');

    // Also verify UTF-16BE with BOM
    const beBytes = iconv.encode(sampleText, 'utf16be');
    const bufBE = Buffer.concat([Buffer.from([0xfe, 0xff]), beBytes]);
    const decodedBE = decodeTextBuffer(bufBE, { originalFilename: 'sample_utf16be.txt' });
    assert.strictEqual(decodedBE, sampleText, 'T3: UTF-16BE text should decode correctly');
    assert.strictEqual(decodedBE.includes('\uFFFD'), false, 'T3: Must not contain replacement character');

    console.log('  ✓ Passed (both UTF-16LE and UTF-16BE decoded with BOM stripped)\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T4: ShiftJIS Japanese — decoded to correct Japanese characters
  // --------------------------------------------------------------------------
  console.log('T4: ShiftJIS Japanese — decoded to correct Japanese characters');
  {
    const fixturePath = path.join(FIXTURES_DIR, 'sample_shiftjis.txt');
    const buf = fs.readFileSync(fixturePath);

    const expectedContent = '吾輩は猫である。名前はまだ無い。'.repeat(3);
    const decoded = decodeTextBuffer(buf, { originalFilename: 'sample_shiftjis.txt' });

    assert.strictEqual(decoded, expectedContent, 'T4: Decoded text should match Japanese content');
    assert.strictEqual(decoded.includes('\uFFFD'), false, 'T4: Must not contain replacement character');

    // Integration with textParser and markdownParser
    const textDoc = textParser.parse(buf, { originalFilename: 'sample_shiftjis.txt' });
    assert(textDoc.blocks.length > 0, 'T4: textParser must produce canonical blocks from ShiftJIS buffer');
    assert.strictEqual(textDoc.blocks[0].text, expectedContent);

    const mdDoc = markdownParser.parse(buf, { originalFilename: 'sample_shiftjis.md' });
    assert(mdDoc.blocks.length > 0, 'T4: markdownParser must produce canonical blocks from ShiftJIS buffer');
    assert.strictEqual(mdDoc.blocks[0].text, expectedContent);

    console.log('  ✓ Passed (ShiftJIS decoded cleanly into genuine Japanese text)\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T5: Windows-1252 accented Latin — decoded to correct é, ç, ï
  // --------------------------------------------------------------------------
  console.log('T5: Windows-1252 accented Latin — decoded to correct é, ç, ï');
  {
    const fixturePath = path.join(FIXTURES_DIR, 'sample_windows1252.txt');
    const buf = fs.readFileSync(fixturePath);

    const expectedContent = 'Café, résumé, naïve, façade.';
    const decoded = decodeTextBuffer(buf, { originalFilename: 'sample_windows1252.txt' });

    assert.strictEqual(decoded, expectedContent, 'T5: Decoded text should match expected Latin string');
    assert.strictEqual(decoded.includes('é'), true, 'T5: Must contain é');
    assert.strictEqual(decoded.includes('ç'), true, 'T5: Must contain ç');
    assert.strictEqual(decoded.includes('ï'), true, 'T5: Must contain ï');
    assert.strictEqual(decoded.includes('\uFFFD'), false, 'T5: Must not contain replacement character');

    console.log('  ✓ Passed\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T6: TEXT_ENCODING=shiftjis override — forces ShiftJIS
  // --------------------------------------------------------------------------
  console.log('T6: TEXT_ENCODING=shiftjis override — forces ShiftJIS');
  {
    const originalEnv = process.env.TEXT_ENCODING;
    try {
      process.env.TEXT_ENCODING = 'shiftjis';

      const fixturePath = path.join(FIXTURES_DIR, 'sample_shiftjis.txt');
      const buf = fs.readFileSync(fixturePath);

      const decoded = decodeTextBuffer(buf, { originalFilename: 'override_test.txt' });
      const expectedContent = '吾輩は猫である。名前はまだ無い。'.repeat(3);
      assert.strictEqual(decoded, expectedContent, 'T6: Override must decode ShiftJIS successfully');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.TEXT_ENCODING;
      } else {
        process.env.TEXT_ENCODING = originalEnv;
      }
    }

    console.log('  ✓ Passed\n');
    passed++;
  }

  // --------------------------------------------------------------------------
  // T7: Unrecognizable input (random bytes with no valid decode) — throws ENCODING_UNRECOGNIZED
  // --------------------------------------------------------------------------
  console.log('T7: Unrecognizable input (random bytes with no valid decode) — throws ENCODING_UNRECOGNIZED');
  {
    // Bytes that fail UTF-8, ShiftJIS (invalid trail byte 0x01), and Windows-1252 (unassigned 0x81, 0x8D, 0x8F, 0x90, 0x9D)
    const corruptBuffer = Buffer.from([
      0x81, 0x01, 0x8d, 0x02, 0x8f, 0x03, 0x90, 0x04, 0x9d, 0x05,
      0x81, 0x01, 0x8d, 0x02, 0x8f, 0x03, 0x90, 0x04, 0x9d, 0x05,
    ]);

    let caughtError = null;
    try {
      decodeTextBuffer(corruptBuffer, { originalFilename: 'corrupt_data.bin' });
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError, 'T7: Expected ENCODING_UNRECOGNIZED error to be thrown');
    assert(
      caughtError.message.includes('ENCODING_UNRECOGNIZED'),
      `T7: Error message must include ENCODING_UNRECOGNIZED (got: ${caughtError.message})`
    );
    assert(
      caughtError.message.includes('corrupt_data.bin'),
      `T7: Error message must reference filename corrupt_data.bin (got: ${caughtError.message})`
    );
    assert(
      caughtError.message.includes('Expected UTF-8, UTF-16, Windows-1252, or ShiftJIS'),
      `T7: Error message must specify expected encodings (got: ${caughtError.message})`
    );

    console.log(`  ✓ Passed (caught expected error: "${caughtError.message}")\n`);
    passed++;
  }

  console.log('================================================================');
  console.log(`RESULTS: ${passed}/${total} test suites passed.`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runF51aTests().catch((err) => {
  console.error('Unhandled failure in F51a tests:', err);
  process.exit(1);
});

