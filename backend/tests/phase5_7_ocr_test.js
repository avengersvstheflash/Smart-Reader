/**
 * backend/tests/phase5_7_ocr_test.js
 *
 * Phase 5.7.1 OCR Node Integration & Sidecar Mock Test Suite
 *
 * Verifies:
 * - T1: checkReady() returns { ready: true } on HTTP 200
 * - T2: checkReady() returns { ready: false, reason: 'warming' } on HTTP 503
 * - T3: checkReady() returns { ready: false, reason: 'down' } when server is offline
 * - T4: ocrPdf() sends multipart/form-data and parses returned pages
 * - T5: ocrPdf() throws .code === 'OCR_LANGUAGE_UNSUPPORTED' on HTTP 422
 * - T6: ocrPdf() throws .code === 'OCR_SIDECAR_UNAVAILABLE' when server is offline
 * - T7: Parser integration: image-only PDF (< 20 chars) routes to OCR and populates canonical pages
 * - T8: Parser integration: image-only PDF (< 20 chars) with sidecar down rejects with honest failure
 * - T9: Parser integration: image-only PDF (< 20 chars) with empty OCR output rejects with honest failure
 *
 * Uses ephemeral port (port: 0) mock HTTP server without external dependencies.
 */

'use strict';

const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');

const pythonSidecarClient = require('../services/ai/pythonSidecarClient');
const pdfjsParser = require('../services/ingestion/parsers/pdfjsParser');

/**
 * Generates an in-memory valid 1-page PDF buffer containing 0 selectable text characters.
 * Triggers the < 20 character OCR routing branch in pdfjsParser without external fixtures.
 * @returns {Buffer}
 */
function createMinimalPdfBuffer() {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000201 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
251
%%EOF`;
  return Buffer.from(content, 'binary');
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING PHASE 5.7.1 OCR INTEGRATION & MOCK TEST SUITE');
  console.log('================================================================\n');

  let activeMockHandler = (_req, res) => {
    res.writeHead(404);
    res.end();
  };

  const server = http.createServer((req, res) => {
    activeMockHandler(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;
  const originalEnvUrl = process.env.PYTHON_SIDECAR_URL;
  process.env.PYTHON_SIDECAR_URL = mockBaseUrl;

  console.log(`[Setup] Ephemeral mock sidecar server listening on ${mockBaseUrl}`);

  try {
    // -------------------------------------------------------------------------
    // T1: checkReady() returns { ready: true } when mock /v1/ready is 200
    // -------------------------------------------------------------------------
    console.log('[Test 1] checkReady() returns { ready: true } on HTTP 200');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/ready' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', model: 'ch_PP-OCRv4', warmup_sec: 1.31 }));
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t1Result = await pythonSidecarClient.checkReady();
    assert.strictEqual(t1Result.ready, true, 'Expected ready to be true');
    assert.strictEqual(t1Result.reason, undefined, 'Expected no failure reason');
    console.log('  ✓ T1 passed: checkReady() correctly returned { ready: true }');

    // -------------------------------------------------------------------------
    // T2: checkReady() returns { ready: false, reason: 'warming' } when mock /v1/ready is 503
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] checkReady() returns { ready: false, reason: "warming" } on HTTP 503');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/ready' && req.method === 'GET') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'warming', message: 'OCR engine is warming up' }));
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t2Result = await pythonSidecarClient.checkReady();
    assert.strictEqual(t2Result.ready, false, 'Expected ready to be false');
    assert.strictEqual(t2Result.reason, 'warming', 'Expected reason to be warming');
    console.log('  ✓ T2 passed: checkReady() correctly identified warming status on 503');

    // -------------------------------------------------------------------------
    // T3: checkReady() returns { ready: false, reason: 'down' } when sidecar is offline
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] checkReady() returns { ready: false, reason: "down" } on connection failure');
    const offlineUrl = 'http://127.0.0.1:59998';
    const t3Result = await pythonSidecarClient.checkReady(offlineUrl);
    assert.strictEqual(t3Result.ready, false, 'Expected ready to be false');
    assert.strictEqual(t3Result.reason, 'down', 'Expected reason to be down');
    console.log('  ✓ T3 passed: checkReady() cleanly returned { ready: false, reason: "down" }');

    // -------------------------------------------------------------------------
    // T4: ocrPdf() posts multipart, receives mocked pages, returns them
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] ocrPdf() sends multipart/form-data and receives parsed pages');
    let capturedMultipartHeader = '';
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/ocr/pdf' && req.method === 'POST') {
        capturedMultipartHeader = req.headers['content-type'] || '';
        let bodyBytes = [];
        req.on('data', (chunk) => bodyBytes.push(chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'success',
              pages: [
                { num: 1, text: 'Page 1 OCR extracted text content.' },
                { num: 2, text: 'Page 2 OCR extracted text content.' },
              ],
              model: 'ch_PP-OCRv4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const pdfBuffer = createMinimalPdfBuffer();
    const t4Result = await pythonSidecarClient.ocrPdf(pdfBuffer);
    assert.ok(
      capturedMultipartHeader.includes('multipart/form-data'),
      `Expected multipart/form-data header, got: ${capturedMultipartHeader}`
    );
    assert.strictEqual(t4Result.status, 'success', 'Expected success status');
    assert.strictEqual(t4Result.model, 'ch_PP-OCRv4', 'Expected model name');
    assert.strictEqual(t4Result.pages.length, 2, 'Expected 2 extracted pages');
    assert.strictEqual(t4Result.pages[0].num, 1);
    assert.strictEqual(t4Result.pages[0].text, 'Page 1 OCR extracted text content.');
    console.log('  ✓ T4 passed: ocrPdf() uploaded multipart payload and returned parsed pages');

    // -------------------------------------------------------------------------
    // T5: ocrPdf() throws with .code === 'OCR_LANGUAGE_UNSUPPORTED' on mocked 422
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] ocrPdf() throws .code === "OCR_LANGUAGE_UNSUPPORTED" on 422 response');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/ocr/pdf' && req.method === 'POST') {
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'error',
              code: 'OCR_LANGUAGE_UNSUPPORTED',
              message: 'OCR language not yet supported for this document',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    let t5Error = null;
    try {
      await pythonSidecarClient.ocrPdf(pdfBuffer);
    } catch (err) {
      t5Error = err;
    }
    assert.ok(t5Error, 'Expected ocrPdf() to throw on 422');
    assert.strictEqual(
      t5Error.code,
      'OCR_LANGUAGE_UNSUPPORTED',
      `Expected code OCR_LANGUAGE_UNSUPPORTED, got ${t5Error.code}`
    );
    assert.strictEqual(
      t5Error.message,
      'This document appears to be in a language not yet supported by OCR. Currently English and Chinese are supported.'
    );
    console.log('  ✓ T5 passed: 422 response threw Error with code="OCR_LANGUAGE_UNSUPPORTED"');

    // -------------------------------------------------------------------------
    // T6: ocrPdf() throws with .code === 'OCR_SIDECAR_UNAVAILABLE' when server is offline
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] ocrPdf() throws .code === "OCR_SIDECAR_UNAVAILABLE" when server is offline');
    let t6Error = null;
    try {
      await pythonSidecarClient.ocrPdf(pdfBuffer, offlineUrl);
    } catch (err) {
      t6Error = err;
    }
    assert.ok(t6Error, 'Expected ocrPdf() to throw when sidecar offline');
    assert.strictEqual(
      t6Error.code,
      'OCR_SIDECAR_UNAVAILABLE',
      `Expected code OCR_SIDECAR_UNAVAILABLE, got ${t6Error.code}`
    );
    assert.ok(
      t6Error.message.includes('OCR via the Python sidecar is unavailable'),
      `Unexpected error message: ${t6Error.message}`
    );
    console.log('  ✓ T6 passed: offline server threw Error with code="OCR_SIDECAR_UNAVAILABLE"');

    // -------------------------------------------------------------------------
    // T7: Parser integration: image-only PDF (< 20 chars) routes to OCR with mock server
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Parser integration: image-only PDF routes to OCR and returns pages');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/ready' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', model: 'ch_PP-OCRv4' }));
        return;
      }
      if (req.url === '/v1/ocr/pdf' && req.method === 'POST') {
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'success',
              pages: [
                {
                  num: 1,
                  text: 'Chapter 1: Hardware Implementations of NBS DES\n\nThis is synthetic OCR recovered text from scanned material.',
                },
                {
                  num: 2,
                  text: 'Chapter 2: Correctness and Testing Criteria\n\nSecondary page of recovered typewritten text.',
                },
              ],
              model: 'ch_PP-OCRv4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const parsedDoc = await pdfjsParser.parse(pdfBuffer, {
      title: 'Validating Hardware DES Implementations',
      author: 'Jason Gait',
    });

    assert.ok(parsedDoc, 'Expected parsed document result');
    assert.strictEqual(parsedDoc.pageCount, 2, `Expected pageCount=2, got ${parsedDoc.pageCount}`);
    assert.ok(
      parsedDoc.chapters && parsedDoc.chapters.length >= 1,
      'Expected structured chapters to be created'
    );
    const combinedText = parsedDoc.chapters.map((c) => c.content || '').join('\n\n');
    assert.ok(
      combinedText.includes('Hardware Implementations of NBS DES'),
      'Expected OCR text in canonical chapters'
    );
    console.log(`  ✓ T7 passed: parser invoked OCR sidecar, pageCount=${parsedDoc.pageCount}, chapters=${parsedDoc.chapters.length}`);

    // -------------------------------------------------------------------------
    // T8: Parser integration: image-only PDF (< 20 chars) with sidecar down rejects honestly
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Parser integration: image-only PDF with sidecar down rejects honestly');
    process.env.PYTHON_SIDECAR_URL = offlineUrl;

    let t8Error = null;
    try {
      await pdfjsParser.parse(pdfBuffer);
    } catch (err) {
      t8Error = err;
    }
    assert.ok(t8Error, 'Expected parser to throw honest failure when sidecar is down');
    const expectedPrefix =
      'This PDF document contains little or no selectable text. It may be a scanned image or bitmap document. OCR via the Python sidecar was attempted but is unavailable';
    assert.ok(
      t8Error.message.includes(expectedPrefix),
      `Expected honest failure error message, got: ${t8Error.message}`
    );
    console.log('  ✓ T8 passed: parser correctly rejected with honest-failure error message');

    // -------------------------------------------------------------------------
    // T9: Parser integration: image-only PDF (< 20 chars) with empty OCR output rejects honestly
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Parser integration: image-only PDF with empty OCR output rejects honestly');
    process.env.PYTHON_SIDECAR_URL = mockBaseUrl;

    activeMockHandler = (req, res) => {
      if (req.url === '/v1/ready' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', model: 'ch_PP-OCRv4' }));
        return;
      }
      if (req.url === '/v1/ocr/pdf' && req.method === 'POST') {
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'success',
              pages: [{ num: 1, text: '' }],
              model: 'ch_PP-OCRv4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const originalWarn = console.warn;
    const capturedWarns = [];
    console.warn = (...args) => {
      capturedWarns.push(args.join(' '));
      originalWarn.apply(console, args);
    };

    let t9Error = null;
    try {
      await pdfjsParser.parse(pdfBuffer);
    } catch (err) {
      t9Error = err;
    } finally {
      console.warn = originalWarn;
    }

    assert.ok(t9Error, 'Expected parser to throw on empty OCR output');
    assert.ok(
      t9Error.message.includes('OCR via the Python sidecar returned no usable text'),
      `Expected empty OCR text error message, got: ${t9Error.message}`
    );
    const hasEmptyOutputLog = capturedWarns.some((msg) => msg.includes('Decision: OCR_EMPTY_OUTPUT'));
    assert.ok(hasEmptyOutputLog, 'Expected Decision: OCR_EMPTY_OUTPUT in warning logs');
    console.log('  ✓ T9 passed: parser correctly rejected empty OCR output with honest failure and logged OCR_EMPTY_OUTPUT');

    console.log('\n================================================================');
    console.log('🎉 ALL 9 OCR INTEGRATION & MOCK TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    process.env.PYTHON_SIDECAR_URL = originalEnvUrl;
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests()
  .then(() => {
    setTimeout(() => process.exit(0), 50);
  })
  .catch((err) => {
    console.error('\n❌ OCR TEST SUITE FAILED:', err);
    setTimeout(() => process.exit(1), 50);
  });
